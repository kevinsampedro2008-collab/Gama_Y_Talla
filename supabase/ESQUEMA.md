# Esquema de catálogo y disponibilidad · Etapa 13

Validado en **PostgreSQL 17.11** (contenedor local desechable, la misma versión mayor
que usa Supabase por omisión). Nada de esto está aplicado en producción.

## Idea central

Solo se guardan **dos cosas**: una talla está *confirmada con su fecha* o está *agotada*.
El estado «por revisar» **no se almacena**: lo deduce la base comparando fechas al leer.
Por eso no hay tareas programadas que puedan quedarse dormidas.

| Estado guardado (`tallas.estado`) | Estado público que ve el cliente |
|---|---|
| `CONFIRMADA` + `vigencia_desde` vigente | `DISPONIBLE` |
| `CONFIRMADA` + vigencia vencida | `POR_REVISAR` |
| `REVISAR` (marca manual) | `POR_REVISAR` |
| Sin `vigencia_desde` | `POR_REVISAR` |
| `AGOTADA` | `AGOTADO` (no vence nunca) |

## Tablas

| Tabla | Para qué |
|---|---|
| `productos` | Modelo. Lleva `codigo_interno` (nuestro) y `referencia_proveedor` (del proveedor) |
| `variantes` | Un color del modelo, con su precio |
| `fotos` | Rutas del sitio o URLs de Storage |
| `tallas` | **El corazón.** Estado y las cinco fechas, por variante y talla |
| `historial` | Solo se añade. Lo escribe un disparador |
| `administradores` | Quién puede escribir |
| `configuracion` | Vigencia predeterminada (48 h, hasta 60) |

## Identificadores

| Campo | Ejemplo | Regla |
|---|---|---|
| `productos.id` | UUID | Técnico, interno |
| `productos.codigo_interno` | `GT-00001` | Único, legible, permanente. Lo asigna un disparador |
| `productos.referencia_proveedor` | `GT-005` | **Puede repetirse.** Sin restricción de unicidad |
| `variantes.codigo_variante` | `GT-00001-A` | Derivado del producto |
| `productos.clave_legado` | `ADD-SAM~zapatilla-01` | Compatibilidad con carritos V3 guardados |
| `tallas (variante_id, talla)` | — | Único. Nunca se borra: se desactiva |

El `codigo_interno` lo asigna un disparador `SECURITY DEFINER`, no un valor por omisión,
para que **ningún rol de aplicación necesite permiso sobre la secuencia**.

## Las cinco fechas

| Campo | Qué guarda | ¿Mueve el reloj? |
|---|---|---|
| `publicado_en` | Publicación original del proveedor | Solo en el escenario A |
| `registrado_en` | Cuándo se registró aquí | Nunca |
| `confirmado_en` | Confirmación directa del proveedor | Solo en el escenario B |
| **`vigencia_desde`** | **La fecha que cuenta** | **Sí** |
| `vence_en` | `vigencia_desde + vigencia_horas` | Calculada por disparador |

- **Escenario A** (`fn_confirmar_por_publicacion`): el modelo reaparece. `vigencia_desde` = fecha de esa publicación.
- **Escenario B** (`fn_confirmar_por_proveedor`): el proveedor confirma por mensaje. `vigencia_desde` = ahora.
  Así una confirmación reciente **no queda POR REVISAR** por arrastrar una publicación antigua.

## Por qué `vence_en` no es una columna generada

La primera propuesta era:

```sql
vence_en timestamptz generated always as
  (publicado_en + (vigencia_horas || ' hours')::interval) stored
```

**PostgreSQL la rechaza:** `ERROR: generation expression is not immutable`. La documentación
exige funciones inmutables, y `timestamptz + interval` es `STABLE` porque depende del ajuste
`TimeZone`. Comprobado en el motor:

```
timestamptz_pl_interval | STABLE
timestamp_pl_interval   | IMMUTABLE
```

Un disparador sí puede llamar funciones `STABLE`, así que `vence_en` se guarda de verdad y
puede **indexarse y ordenarse**, que es lo que necesita el panel.
El estado efectivo depende de `now()` y por eso **nunca se almacena**: vive en la vista.

## Seguridad

Dos cerrojos independientes:

1. **Privilegios**: qué tablas y **qué columnas** puede tocar cada rol.
2. **RLS**: qué filas ve de las que puede tocar.

La vista `catalogo_publico` usa `security_invoker = true`. Sin eso se ejecutaría con los
permisos de su propietario y **se saltaría el RLS** de las tablas base.

**El visitante no puede leer**, ni por la vista ni consultando las tablas: `nota`,
`estado_migrado`, `origen`, `publicado_en`, `confirmado_en`, `registrado_en`,
`vigencia_horas`, `historial`, `administradores`, `configuracion`, ni la secuencia de códigos.

**Matiz del historial:** el privilegio `SELECT` se concede al rol `authenticated` porque el
administrador también es `authenticated`, y los privilegios son por rol, no por usuario. La
separación la hace el RLS: quien no es administrador ejecuta la consulta y recibe **cero filas**.
Nadie, ni el administrador, puede modificarlo ni borrarlo.

### Funciones: nadie ejecuta nada sin concesión explícita

La migración `20261107010000_endurecer_funciones` corrige un error de la `20261105050000`:
`revoke ... from anon, authenticated` **no quita el EXECUTE que PostgreSQL concede a `PUBLIC`**,
y esos roles lo heredan.

| Funciones | anon | authenticated | service_role | Por qué |
|---|---|---|---|---|
| `fn_es_administrador` | no | sí | no | La evalúan 7 políticas `TO authenticated` |
| `fn_confirmar_por_*`, `fn_marcar_agotada` | no | sí | no | El administrador es `authenticated`; decide su comprobación interna |
| `fn_admin_tallas` | no | sí | no | Lectura administrativa de las columnas internas; comprueba `fn_es_administrador` |
| `fn_asignar_codigo_*`, `fn_registrar_historial` | no | no | no | Solo disparadores: EXECUTE se comprueba al crearlos, no al dispararse |
| `fn_marcar_actualizado`, `fn_tallas_antes_de_escribir` | no | no | no | Solo disparadores |
| `fn_lote_actual` | no | no | no | Solo la llama `fn_registrar_historial`, que corre como su propietario |
| `fn_valor_talla`, `fn_estado_publico`, `fn_tallas_por_estado` | sí | sí | no | La vista es `security_invoker`: las ejecuta quien la consulta |

Ninguna función da EXECUTE a `PUBLIC`.

**`service_role` no tiene permisos sobre funciones.** Si una Edge Function llega a necesitar una,
se estudia y se concede explícitamente esa función, no un permiso general. Esto incluye la vista
pública: `service_role` no puede leerla hasta recibir esa concesión. Se salta el RLS y lee las tablas,
así que su clave **nunca** va en el navegador.

Hoy nada usa `service_role`: no hay Edge Functions y el panel de Supabase ejecuta como `postgres`.
Si una futura Edge Function necesitara consultar la vista pública:

| Cómo se conecta | Qué necesita |
|---|---|
| **Con la clave publicable (recomendado)** | Nada. Es `anon` y ve lo mismo que un visitante |
| Con `service_role` | `EXECUTE` sobre `fn_valor_talla(text)`, `fn_estado_publico(estado_talla, timestamptz, timestamptz)` y `fn_tallas_por_estado(uuid, estado_publico)`. Las tres son imprescindibles; ya tiene `SELECT` sobre la vista |

No se concede por adelantado: se hace en una migración cuando exista esa función.

### Funciones de `supabase_admin`: una limitación sin solución desde el proyecto

Los predeterminados cerrados solo cubren lo que crea `postgres`, que es quien ejecuta las migraciones
y el editor SQL del panel. Lo que crea `supabase_admin` en `public` nace ejecutable por `PUBLIC`, `anon`,
`authenticated` y `service_role`. **Esto no está resuelto ni se puede resolver desde el proyecto**, y
[Supabase lo documenta](https://supabase.com/kb/troubleshooting/cant-change-the-default-privileges-of-supabase_admin-in-the-public-schema-448af9):

| Intento desde `postgres` | Resultado |
|---|---|
| `alter default privileges for role supabase_admin ...` | `permission denied to change default privileges` |
| `set role supabase_admin`, `grant supabase_admin to postgres` | Rechazados: esas membresías están reservadas |
| `revoke` sobre una función suya | `no privileges could be revoked` y el permiso sigue. El editor SQL no muestra ese aviso: parece que funcionó |
| `alter function ... owner to postgres` | `must be owner of function` |
| Disparador de eventos | Se puede crear, pero no se dispara ante lo que ejecuta `supabase_admin` |

**El riesgo real** es una extensión instalada sin indicar esquema: `create extension pg_trgm;` deja 31
funciones suyas en `public`, ejecutables por `anon` y publicadas en `/rest/v1/rpc`. Auth, Storage y
Realtime usan sus propios esquemas. Hoy las 14 funciones de `public` son de `postgres`.

**La regla:** en las migraciones, una extensión siempre lleva esquema. El panel de extensiones ya usa
`extensions`.

```sql
create extension if not exists pg_trgm with schema extensions;
```

Si ya ocurrió: `alter extension pg_trgm set schema extensions;` (las no reubicables hay que borrarlas y
crearlas de nuevo, y eso puede arrastrar lo que dependa de ellas).

Sacar `public` de los esquemas expuestos y publicar la API desde un esquema propio eliminaría la
exposición por completo, pero obliga a mover la vista y a cambiar la tienda. No se ha hecho.

### Al incorporar una función

1. Crearla como `postgres`, con una migración. Es el propietario que deben tener todas.
2. Fijar `set search_path = ''` y calificar cada objeto con su esquema.
3. Preferir `security invoker`. Si es `security definer` y la puede llamar una sesión, empezar por
   `if not public.fn_es_administrador() then raise exception ...`.
4. Conceder `EXECUTE` solo a quien la necesite: nace cerrada para todos.
5. Añadirla a `supabase/pruebas/auditar_funciones.sql` y a `40_acceso_interno.sql`, que falla si aparece
   una función sin clasificar.
6. Ejecutar la auditoría (abajo) en local y, tras aplicar la migración, en el remoto. Revisar también el
   Security Advisor **remoto**: el local no incluye los avisos sobre `security definer`, y su «No issues
   found» no demuestra nada sobre ellos.

**Cómo detectar una función con permisos excesivos.** Es de solo lectura y se puede ejecutar en remoto;
cero filas significa que todo coincide con lo aprobado:

```bash
npx --yes supabase@3.0.0 db query --remote --read-only -f supabase/pruebas/auditar_funciones.sql
```

Avisa de funciones no aprobadas, propietario distinto de `postgres`, `EXECUTE` para `PUBLIC` o para roles
no aprobados, `search_path` sin fijar, `security definer` sin comprobación interna, extensiones en
`public` y predeterminados reabiertos.

`db query --read-only` corre como `supabase_read_only_user`, que lee las tablas (también `nota`: tiene
`BYPASSRLS` y `pg_read_all_data`) pero **no puede leer `catalogo_publico`**, porque no ejecuta sus
funciones. Para comprobar la vista en remoto hay que consultarla por HTTP con la clave publicable.

**Al crear una función nueva hay que conceder EXECUTE a mano** a los roles que la usen, también
a los ayudantes `pg_temp` de las pruebas. Para que eso valga en cualquier esquema hacen falta dos
sentencias: una global (`PUBLIC`) y otra `IN SCHEMA public` (`anon`, `authenticated`, `service_role`).

### Quién lee qué

Los privilegios de PostgreSQL son **por rol**. El administrador y una sesión cualquiera comparten
`authenticated`, de modo que no puede tener uno `SELECT` directo sobre una columna sin tenerlo la otra.
Por eso se combinan dos cerrojos (migración `20261107020000_restringir_acceso_interno`):

| | Visitante (`anon`) | Sesión sin ser administrador | Administrador |
|---|---|---|---|
| Vista `catalogo_publico` | Sí | Cero filas | Sí |
| Columnas públicas de `productos`, `variantes`, `fotos`, `tallas` | Filas activas | Cero filas | Todas las filas |
| `tallas`: `nota`, `estado_migrado`, `origen`, `publicado_en`, `confirmado_en`, `registrado_en`, `vigencia_horas`, `creado_en`, `actualizado_en` | **Denegado** | **Denegado** | Por `fn_admin_tallas()`; por la tabla, **denegado** |
| `historial`, `administradores`, `configuracion` | **Denegado** | Cero filas (RLS) | Sí |
| `creado_en` y `actualizado_en` de `productos`, `variantes`, `fotos` | **Denegado** | Cero filas (RLS) | Sí |
| Escribir | **Denegado** | **Denegado** o cero filas (RLS) | Sí, salvo en el historial |

**Al construir el panel:** para leer las columnas internas de `tallas` hay que llamar a
`/rest/v1/rpc/fn_admin_tallas`, que admite `select`, filtros y orden. Por la tabla, pedir `select=*`
o usar `Prefer: return=representation` sin `select=` falla por permisos también siendo administrador.
Escribir `nota` por la tabla sigue permitido.

Donde indica «Cero filas (RLS)» el rol conserva el privilegio y **solo** lo frena el RLS, porque son
datos que el administrador lee directamente. Cerrarlo también por privilegio exigiría una función por
tabla o un rol de base de datos propio para el administrador.

**OpenAPI:** `GET /rest/v1/` describe a `anon` los **nombres** de todas las columnas de las tablas que
puede ver, también las internas de `tallas`. Son nombres, no datos. Es un comportamiento de PostgREST.

### Autenticación: solo para el panel

Gama & Talla **no tiene cuentas de clientes**. Quien compra consulta el catálogo como `anon` y
coordina por WhatsApp. Auth existe únicamente para el panel administrativo.

| Ajuste | Valor | Dónde |
|---|---|---|
| Registro de usuarios nuevos | **Desactivado** (`enable_signup = false`) | Panel: *Authentication → Sign In / Providers*, opción de permitir nuevos registros. Local: `[auth]` en `config.toml` |
| Inicio de sesión anónimo | Desactivado (`enable_anonymous_sign_ins = false`) | Igual |
| Proveedor de correo | Activado (`[auth.email] enabled = true`) | Apagarlo impediría también entrar al administrador |
| Longitud mínima de contraseña | Subirla de 6: se recomiendan 12 o más | Panel o `minimum_password_length` |

`config.toml` no cambia el proyecto remoto: allí hay que comprobarlo a mano.

1. En el panel: registro de usuarios nuevos y acceso anónimo desactivados; correo activado; teléfono y
   proveedores externos desactivados.
2. En *Authentication → Users*: que no exista ninguna cuenta desconocida, porque el registro viene
   abierto por omisión. Cerrarlo no borra las cuentas ya creadas.
3. Confirmarlo sin escribir nada; debe responder `"disable_signup": true`:
   ```bash
   curl -s -H "apikey: <clave publicable>" https://mwhiusocfdwzxnzenfsz.supabase.co/auth/v1/settings
   ```

Con el registro cerrado (probado con Auth `v2.197.0`) se rechazan el registro, el enlace mágico para un
correo nuevo y el acceso anónimo. Los usuarios existentes siguen entrando y pueden recuperar su
contraseña, y la Admin API y las invitaciones siguen funcionando con la clave secreta; con la publicable
o con una sesión normal se rechazan. Para incorporar al administrador, cuando se autorice:

1. Crear el usuario desde el panel (*Authentication → Users → Add user*) con el correo confirmado.
   No se usa ningún formulario público ni la clave secreta en el navegador.
2. Copiar su UUID y darle el permiso con el editor SQL del panel:
   ```sql
   insert into public.administradores (user_id, nombre) values ('<uuid>', 'Nombre');
   ```
3. Comprobar que entra y que `fn_es_administrador()` responde verdadero en su sesión.

Crear el usuario no da ningún privilegio: una sesión sin fila en `administradores` no recibe datos.

**Para retirar a un administrador hay que borrar primero su fila de `administradores`:** surte efecto al
instante, con su sesión abierta. Borrarlo solo de Auth **no basta**: su token sigue siendo válido hasta
que expire y, como `administradores.user_id` no tiene clave foránea a `auth.users`, la fila no desaparece.

**Cuidado con `supabase config push`:** envía al proyecto remoto todo lo que declara `config.toml`, no
solo este ajuste, y `config.toml` tiene valores de desarrollo como `site_url = "http://127.0.0.1:3000"`.
El cierre del registro en el proyecto remoto se hace desde el panel.

### Pendientes conocidos

Ninguno abre el acceso a datos internos. Conviene resolverlos antes de cargar datos o al construir el panel.

| Qué ocurre | Consecuencia |
|---|---|
| `fn_valor_talla('40,5')` falla: la expresión regular admite la coma, pero la conversión a número no | **Una sola talla escrita con coma tumba `catalogo_publico` para todos** y también `fn_admin_tallas` |
| Un `INSERT` rechazado de una sesión no administradora consume `seq_codigo_producto`: el disparador corre antes que el RLS | Huecos en los códigos `GT-`. Sin registro público no debería haber esas sesiones |
| `fn_confirmar_por_publicacion` y la escritura directa aceptan un `vigencia_desde` futuro | Una talla podría figurar `DISPONIBLE` mucho más de 48 a 60 h. El panel debe validarlo |
| El administrador puede hacer `DELETE` en `tallas`, aunque la regla es «nunca se borra: se desactiva» | El panel no debe ofrecerlo; queda en el historial |

## Cómo validar

```bash
bash scripts/validar-esquema.sh
```

Levanta PostgreSQL 17 en Docker, aplica las migraciones, ejecuta las pruebas de vigencia y
de seguridad, hace la migración en seco de los 28 productos y la verifica contra la tienda real.

Las pruebas 10 a 40 **escriben y se deshacen, pero el `ROLLBACK` no devuelve las secuencias**: nunca
se ejecutan en un proyecto remoto.

Para probar por HTTP real, con Auth, PostgREST y sesiones de verdad (solo local; se niega a correr si
la API no está en `127.0.0.1`):

```bash
npx --yes supabase@3.0.0 start -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
node supabase/pruebas/50_postgrest_local.mjs
npx --yes supabase@3.0.0 stop --no-backup
```
