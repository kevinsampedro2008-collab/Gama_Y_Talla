# Esquema de catálogo y disponibilidad · Etapas 13 a 16

Validado en **PostgreSQL 17.11** (contenedor local desechable, la misma versión mayor
que usa Supabase por omisión). Nada de esto está aplicado en producción.

## Idea central

Solo se guardan **dos cosas**: una talla está *confirmada con su fecha* o está *agotada*.
El estado «por revisar» **no se almacena**: lo deduce la base comparando fechas al leer.
Por eso no hay tareas programadas que puedan quedarse dormidas.

| Estado guardado (`tallas.estado`) | Estado público que ve el cliente |
|---|---|
| `CONFIRMADA` y `vigencia_desde <= ahora < vence_en` | `DISPONIBLE` |
| `CONFIRMADA` + vigencia vencida (también **justo** en `vence_en`) | `POR_REVISAR` |
| `CONFIRMADA` + vigencia que aún no empieza (solo datos anteriores a 14f.2) | `POR_REVISAR` |
| `REVISAR` (marca manual) | `POR_REVISAR` |
| Sin `vigencia_desde` o sin `vence_en` | `POR_REVISAR` |
| `AGOTADA` | `AGOTADO` (no vence nunca, tenga las fechas que tenga) |

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
| `tallas (variante_id, talla)` | — | Único. Nunca se borra: se desactiva (`DELETE` revocado desde 14f.2) |

El `codigo_interno` lo asigna un disparador `SECURITY DEFINER`, no un valor por omisión,
para que **ningún rol de aplicación necesite permiso sobre la secuencia**.

## Formato de las tallas (migración `20261107030000`)

| Forma | Admitidas | Regla |
|---|---|---|
| Entero | `40`, `9`, `100`, `040`, `0` | 1 a 3 cifras |
| Decimal | `40,5`, `40.5`, `40,50`, `40.50`, `8.25`, `40,0` | Coma **o** punto y 1 o 2 cifras decimales |
| Fracción | `40 1/3`, `40 2/3`, `40 1/2`, `40 2/4`, `40 0/3` | Entero, **un** espacio y numerador/denominador de 1 o 2 cifras, con numerador menor que el denominador |

Se rechazan los formatos **no válidos o peligrosos**:

| Rechazada | Por qué |
|---|---|
| `''`, `40foo`, `foo`, `40½`, `0x28` | No es un número |
| `40,5.2`, `40,5,5`, `40.5,2` | Más de un separador decimal: ambiguo |
| `40,`, `40.`, `.5`, `,5` | Número incompleto |
| `40 1/0`, `40 0/0` | División por cero |
| `NaN`, `Infinity`, `-40`, `+40`, `1e2` | No finito, con signo o con exponente |
| `٤٠`, `４０` | Cifras no ASCII: el `\d` de PostgreSQL las acepta con `en_US.UTF-8` y el cast a número no |
| `40 4/3`, `40 3/3` | Fracción impropia: el entero visible contradice el valor (`40 4/3` es 41 1/3) |
| `' 40'`, `'40 '`, `40` + salto de línea | Espacios o saltos exteriores: la tienda recorta la etiqueta (`limpiarTexto`) y `' 40'` se fundiría en silencio con `40`, en la talla y en la clave del carrito |
| `40  1/3`, `40 1 /3`, `40` + espacio duro (U+00A0) + `1/3` | Espacio interior doble o distinto: `valorTalla` de `app.js` separa por **un** espacio (`40  1/3` valdría 40) y el HTML muestra igual uno que varios |
| `1000`, `0040`, `40,555`, `40 1/100` | Fuera de los límites de longitud (abajo) |

**Límites, y por qué no son reglas comerciales.** 3 cifras enteras cubren EU, US, UK y las tallas en
milímetros (mondopoint); 2 cifras decimales, la subdivisión más fina que se usa (el cuarto, `.25`/`.75`);
numerador y denominador de 2 cifras, medios, tercios y cuartos. Ninguna talla real queda fuera. Sirven para
acotar la longitud (como mucho 9 caracteres) y que las conversiones sean exactas y sin desbordamiento.

**Revisión de 14f.2.** La primera versión exigía además fracciones irreducibles, decimales sin cero final y
enteros sin ceros a la izquierda. Eran **preferencias de presentación**, no defectos: `compararTallas` y
`valorTalla` de `app.js` dan a `40,50`, `40 2/4` y `040` el mismo valor que a `40,5`, `40 1/2` y `40`. Se
admiten. Se mantienen los espacios exteriores y dobles y las fracciones impropias, porque sí tienen una
incompatibilidad o un error demostrado (tabla anterior).

- **Al escribir** lo impide el `CHECK tallas_talla_formato`, para cualquier rol y cualquier vía (tabla,
  PostgREST, panel). Usa solo funciones del sistema: un `CHECK` exige `EXECUTE` sobre sus funciones al
  rol que escribe, y llamar a `fn_valor_talla` obligaría a dárselo a `service_role` (comprobado).
- **Al leer**, `fn_valor_talla` devuelve el valor para ordenar (`40 1/3` → 40,333…; `40,50` y `40 2/4` →
  40.5, también como texto gracias a `trim_scale`) o `NULL` si el formato no es válido: nunca un error que
  tumbe la vista ni un número inventado. Antes, `40,5` rompía `catalogo_publico` para todos y `foo` valía 0.
- La gramática está escrita dos veces (el `CHECK` y la función). La comprobación final de la migración evalúa
  la expresión real del `CHECK` y la función sobre 53 casos sin escribir nada; la prueba 60 inserta 218
  candidatas (se admiten exactamente 106) y exige que ambos coincidan en todas.

**Representaciones equivalentes.** `40,5`, `40.5`, `40,50`, `40.50`, `40 1/2` y `40 2/4` valen lo mismo y
ordenan juntas, pero son etiquetas distintas: no se normalizan ni se fusionan, porque la tienda y el carrito
muestran y guardan la etiqueta tal cual, y la unicidad sigue siendo `(variante_id, talla)`, así que pueden
convivir en una variante. El panel debe usar una sola forma. La guía de tallas resalta su fila por igualdad
exacta de texto: una forma poco habitual (`40,50`) se ordena bien, pero no resalta la fila `40.5`. Para
encontrarlas (solo lectura):

```sql
select variante_id, public.fn_valor_talla(talla) as valor, array_agg(talla order by talla) as etiquetas
  from public.tallas group by 1, 2 having count(*) > 1;
```

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
  Así una confirmación reciente **no queda POR REVISAR** por arrastrar una publicación antigua. Conserva
  el `publicado_en` original.

**Ninguna fecha puede ser futura** (migración `20261107030000`). El disparador `tr_tallas_vigencia`
rechaza `publicado_en`, `confirmado_en` o `vigencia_desde` posteriores a la hora del servidor, o no
finitas (`infinity`), con el código `23514` (PostgREST responde 400) y un mensaje que nombra la columna.
Cubre por igual el `INSERT`/`UPDATE` directo y las funciones de confirmación. Solo revisa una fecha si se
suministra o cambia: una fila antigua con fecha futura se puede editar en lo demás, y su fecha no se
renueva ni se inventa.

- **Referencia de tiempo: `now()`**, el inicio de la transacción, igual al escribir que al leer. Lo que se
  acepta al escribir es coherente al leerlo. La confirmación del servidor usa `now()` y nunca se rechaza.
- **Sin tolerancia:** un microsegundo en el futuro ya se rechaza. Un cliente con el reloj adelantado debe
  enviar una fecha pasada o dejar que la ponga el servidor (`fn_confirmar_por_proveedor`).
- No hay ningún `CHECK` con `now()` (un `CHECK` se valida una vez y el reloj sigue) ni ninguna función de
  reloj marcada `IMMUTABLE`: `fn_estado_publico` es `STABLE`; `fn_valor_talla`, `IMMUTABLE` y sin reloj.
- Vigencia: 48 h por omisión (o la de `configuracion`), hasta 60; se mantiene la restricción existente.

## Desactivar y reactivar una talla

Desde la migración `20261107030000` **ningún rol de la aplicación borra tallas**: `DELETE` y `TRUNCATE`
están revocados a `PUBLIC`, `anon` y `authenticated` (también el administrador). La comprobación final
mira además los roles de los que sean miembro, aunque no los hereden, y que ninguna función
`SECURITY DEFINER` ejecutable por una sesión borre tallas.

| Acción | Cómo | Historial |
|---|---|---|
| Retirar una talla | `PATCH /rest/v1/tallas?id=eq.<id>` con `{"activa": false}` | `UPDATE`, `cambios = {activa}`, con autor |
| Volver a ofrecerla | El mismo `PATCH` con `{"activa": true}`: **la misma fila**, sin duplicar | Igual |
| Borrar | `403`, código `42501`. La fila y el historial quedan intactos | — |

La talla desactivada desaparece de `catalogo_publico` y sigue en `fn_admin_tallas()` con `activa = false`.
`service_role` y `postgres` conservan `DELETE` para **mantenimiento**, no como acción del panel: con
`service_role` se limpian los datos ficticios de las pruebas locales. Una variante con tallas no se puede
borrar (clave foránea `restrict`, sin cambios).

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
| `fn_admin_guardar_producto`, `fn_admin_estado_producto` | no | sí | no | Etapa 16. **Invoker**: escriben con el RLS del administrador y comprueban `fn_es_administrador` al empezar |
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
Realtime usan sus propios esquemas. Hoy las 16 funciones de `public` (14 + 2 de la etapa 16) son de `postgres`.

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
5. Añadir su **firma completa** a `supabase/pruebas/auditar_funciones.sql` (con los tipos calificados, tal
   como los muestra la columna `objeto`, p. ej. `public.fn_admin_tallas(pg_catalog.uuid)`), junto con quién
   la ejecuta, su seguridad y su volatilidad; y a `40_acceso_interno.sql`, que falla si aparece una función
   sin clasificar.
6. Ejecutar la auditoría (abajo) en local y, tras aplicar la migración, en el remoto. Revisar también el
   Security Advisor **remoto**: el local no incluye los avisos sobre `security definer`, y su «No issues
   found» no demuestra nada sobre ellos.

**Cómo detectar una función con permisos excesivos.** Es de solo lectura y se puede ejecutar en remoto;
cero filas significa que todo coincide con lo aprobado:

```bash
npx --yes supabase@3.0.0 db query --remote --read-only -f supabase/pruebas/auditar_funciones.sql
```

Avisa de funciones no aprobadas, propietario distinto de `postgres`, `EXECUTE` para `PUBLIC` o para roles
no aprobados, seguridad o volatilidad distintas de las aprobadas, `search_path` sin fijar, `security definer`
sin comprobación interna o que borra tallas, extensiones en `public` y predeterminados reabiertos.

**Por firma completa (14f.2).** Cada función aprobada se identifica por esquema, nombre y tipos de sus
argumentos, resueltos a su OID con `to_regprocedure`. Una sobrecarga nueva de un nombre aprobado sale como
«función no aprobada» aunque tenga los mismos permisos (la versión anterior, que comparaba nombres, no la
veía). Si falta la firma aprobada se informa aunque exista otra con el mismo nombre, y una firma
inexistente produce una fila, no un error. Tablas, funciones, tipos y operadores del sistema van
calificados con `pg_catalog`, así que el resultado no depende del `search_path` de quien la ejecuta
(probado con objetos homónimos hostiles; la versión anterior daba error o 8 filas falsas). Sigue siendo
una sola consulta de solo lectura.

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
| Borrar tallas (`DELETE`, `TRUNCATE`) | **Denegado** | **Denegado** | **Denegado**: se desactivan |

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

Resueltos en la migración `20261107030000` (14f.2): tallas con coma que tumbaban la vista, fechas futuras
aceptadas y `DELETE` del administrador en `tallas`.

| Qué ocurre | Consecuencia |
|---|---|
| Un `INSERT` rechazado de una sesión no administradora consume `seq_codigo_producto`: el disparador corre antes que el RLS | Huecos en los códigos `GT-`. Sin registro público no debería haber esas sesiones |
| `40,5`, `40.5` y `40 1/2` pueden convivir en una variante (son etiquetas distintas del mismo valor) | Una talla repetida a la vista. El panel debe usar una sola forma; consulta para detectarlas en «Formato de las tallas» |
| Un reloj de cliente adelantado ve rechazada una fecha «futura» por segundos | Error 400 claro; debe enviar una fecha pasada o confirmar con `fn_confirmar_por_proveedor` |
| Volver a ejecutar `20261107020000` **después** de `20261107030000` falla: su comprobación final exige `DELETE` para `authenticated` | Ninguno en el flujo normal: las migraciones no se re-ejecutan. No usarla como validación |
| `20261105010000` crea `pgcrypto` sin esquema | En Supabase no hace nada (ya está en `extensions`). En PostgreSQL corriente la deja en `public`; el entorno local la crea antes en `extensions` |

## Etapa 16 · Catálogo desde el panel y fotos en Storage

Dos migraciones nuevas, posteriores a las 10 aplicadas (que no se modifican):

| Migración | Qué hace |
|---|---|
| `20261108010000_fotos_storage` | Bucket público `fotos-catalogo` (solo `image/webp`, 1 MiB por archivo) y tres políticas sobre `storage.objects` limitadas a ese bucket: **leer/listar**, **subir** y **borrar**, las tres solo para quien cumple `fn_es_administrador()`. Subir exige el nombre del panel (`productos/<uuid>/<uuid>/<13 cifras>-<10 caracteres>.webp`); no hay política UPDATE, así que nada se sobrescribe (tampoco con «upsert»); borrar solo funciona si ninguna fila de `fotos` usa el archivo. No crea funciones |
| `20261108020000_catalogo_admin` | Columnas `version`, `ultima_operacion` y `retirado_en` en `productos` (anon no las recibe: sus permisos son por columna) y las funciones `fn_admin_guardar_producto(jsonb, integer, uuid)` y `fn_admin_estado_producto(uuid, text, integer, uuid)` |

- **`fn_admin_guardar_producto`**: producto, colores, tallas y galería en una sola transacción. Crea
  siempre oculto; nunca publica, confirma ni renueva vigencias (una talla nueva nace `REVISAR`, las
  existentes solo cambian `activa`, y solo si cambia). Exige que el formulario incluya todos los
  colores y tallas existentes (nada se borra), rechaza equivalentes numéricos en un color, no deja
  renombrar etiquetas y solo acepta fotos nuevas que ya estén en Storage, en la carpeta del producto.
  Valida textos, precios (0 = por confirmar; el anterior, mayor que el actual) y pertenencias.
- **Activación de tallas existentes:** cada talla existente llega con `activa` y `activa_original` (cómo
  estaba al abrir el formulario; sin ella, `PT422`). Solo se aplica lo que la persona cambió, con
  `UPDATE … WHERE activa = activa_original` y la fila bloqueada (`FOR UPDATE`). Si la cambió otra acción
  que no pasa por `productos.version` (las confirmaciones de 15B reactivan tallas), se conserva y se
  devuelve en `tallas_conservadas`.
- **`fn_admin_estado_producto`**: `publicar` (exige **un mismo** color visible con al menos una foto y
  una talla activa; un color oculto no cuenta),
  `ocultar`, `retirar` (oculta y conserva todo) y `restaurar` (vuelve oculto). No toca tallas.
- **Versión y operación.** Las dos comparan `version` y la incrementan en la misma transacción, con la
  fila bloqueada: un formulario desactualizado recibe `PT409` y no cambia nada. Guardan
  `ultima_operacion`: repetir la misma operación devuelve `ya_aplicada` sin repetir nada, y releerla
  demuestra si un guardado cuya respuesta se perdió se aplicó.
- **Errores** (PostgREST convierte `PTnnn` en el estado HTTP): `42501` → 403/401, `PT404` → 404,
  `PT409` → 409 (con `details` en JSON: motivo y versión actual), `PT422` → 422 con un mensaje para
  la persona.
- **Historial:** lo siguen escribiendo los disparadores; las filas de un guardado comparten `lote`
  (`gamaytalla.lote` = la operación). El navegador no escribe historial.
- **Retiro:** `retirado_en` exige `activo = false` (restricción `productos_retirado_oculto`). Productos,
  colores y tallas nunca se borran; las fotos quitadas de la galería pierden su fila, no su archivo.

Pruebas: `supabase/pruebas/70_catalogo_admin.sql` (SQL, en el validador) y
`supabase/pruebas/80_catalogo_http_local.mjs` (HTTP real con Storage, solo local). Para el validador en
PostgreSQL corriente, `supabase/local/00_entorno_supabase.sql` imita las dos tablas de `storage` que
usan las políticas.

**En el proyecto remoto** hay que aplicar estas dos migraciones (no se ha hecho: requiere
autorización) y después repetir la auditoría y el Security Advisor.

## Cómo validar

```bash
bash scripts/validar-esquema.sh
```

Levanta PostgreSQL 17 en Docker, aplica las migraciones, hace la migración en seco de los 28 productos,
la verifica contra la tienda real, ejecuta las pruebas 10, 20, 30, 40, 60 y 70 y la auditoría. Cada archivo
se ejecuta **una vez** por pasada, se muestra su salida completa y cuenta su código de salida: un error de
psql, de conexión o de la tubería, una salida con `FALLA` o `ERROR` o una batería sin ninguna comprobación
`OK` impiden el «Sin fallos» (comprobado provocando cada avería). `CONTENEDOR` y `PUERTO` permiten no tocar
un contenedor existente. Regenera `supabase/local/vista-publica.json`.

La sección 5 (`scripts/verificar-migracion.mjs`) comprueba el carrito con el comportamiento de la etapa 14,
en memoria, en LocalStorage (esquema V3) y tras recargar: una talla POR REVISAR se conserva con producto,
variante, talla y cantidad, se puede consultar por WhatsApp y no se envía como pedido; una AGOTADA se
retira; un fallo de conexión no retira nada. Sustituye a la expectativa de la etapa 13, según la cual la
tienda vaciaba el carrito.

**Lo que el validador no cubre** (atomicidad por `supabase db push`, HTTP real, mutaciones y humo en tres
navegadores) se reproduce con los guiones de `supabase/pruebas/reproducir/`: ver su `README.md`.

**Orden de las migraciones.** Se aplican una vez, en el orden de su nombre: las siete de la etapa 13,
`20261107010000` (14f), `20261107020000` (14f.1), `20261107030000` (14f.2) y las dos de la etapa 16,
`20261108010000` (Storage) y `20261108020000` (catálogo desde el panel). Cada archivo corre en su
propia transacción con `supabase db push`: si uno falla, no queda nada de él, pero los anteriores siguen
aplicados (el conjunto no es atómico). `20261107030000` comprueba antes los datos: si hay tallas con un
formato no admitido, falla, las enumera y no cambia nada. Se puede repetir sin efecto adicional; las
anteriores no deben volver a ejecutarse después de ella.

Las pruebas 10 a 60 **escriben y se deshacen, pero el `ROLLBACK` no devuelve las secuencias**: nunca
se ejecutan en un proyecto remoto. La auditoría `auditar_funciones.sql` es la única de solo lectura.

Para probar por HTTP real, con Auth, PostgREST y sesiones de verdad (solo local; se niega a correr si
la API no está en `127.0.0.1`):

```bash
npx --yes supabase@3.0.0 start -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
node supabase/pruebas/50_postgrest_local.mjs
npx --yes supabase@3.0.0 stop --no-backup
```
