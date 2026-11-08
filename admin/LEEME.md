# Panel privado de Gama & Talla · etapas 15A y 15B

Ingreso con correo y contraseña, tablero del catálogo y **gestión de la disponibilidad de las tallas**
(15B). La creación y edición de productos, colores, precios y fotos llega en la etapa 16; hasta
entonces el catálogo remoto sigue vacío.

## Gestionar la disponibilidad (15B)

1. Busca la zapatilla (código interno, referencia, marca o modelo) y, si quieres, filtra por
   «Con tallas disponibles», «por revisar», «agotadas» o «Con elementos ocultos». Un producto aparece
   en todos los filtros que le correspondan: puede tener tallas en varios estados a la vez.
2. Pulsa una o varias tallas **de un mismo color**. Debajo aparece su detalle (estado en la tienda,
   estado guardado, vigencia y procedencia) y abajo la barra de acciones. Pulsar una talla de otro
   color empieza una selección nueva. La selección se guarda por el UUID real de cada talla.
3. Elige la acción. Un diálogo resume modelo, color y tallas, explica el efecto y pide confirmación:

| Acción | Qué hace | Cuándo usarla |
|---|---|---|
| **Confirmó el proveedor** | `fn_confirmar_por_proveedor`: el servidor pone la fecha de confirmación; la vigencia empieza ahí y dura las horas indicadas (por omisión, la de la tienda: 48 h; máximo 60). La publicación original se conserva | El proveedor te confirmó directamente que hay |
| **Nueva publicación** | `fn_confirmar_por_publicacion`: pide la **fecha y hora originales** de la publicación, en hora de Colombia (UTC−5, sin horario de verano); no se rellena con «ahora». La vigencia empieza en esa fecha. Si ya pasó, la talla queda por revisar | El proveedor volvió a publicar el modelo |
| **Marcar agotada** | `fn_marcar_agotada`, con nota interna opcional. No borra nada | El proveedor confirmó que no hay |
| **Dejar por revisar** | Pone el estado en `REVISAR` (una sola escritura, permitida por el RLS de administrador). No inventa fechas ni confirma nada | No sabes si hay; distinto de «agotada» |

- Las confirmaciones **reactivan** una talla desactivada (`activa = true`); el diálogo lo avisa antes.
  Ninguna acción publica un producto o un color ocultos.
- El estado que ve el cliente lo sigue calculando Supabase; el panel no usa el reloj del navegador.
- **Historial:** el botón «Historial» muestra los cambios recientes de las tallas (fecha en hora de
  Colombia, qué cambió y quién: «Tú», otra cuenta o «Sistema o mantenimiento»). Es solo lectura.

### Cómo se protege cada operación

- Antes de escribir se comprueban la sesión, el permiso (`fn_es_administrador()`) y que la selección
  siga vigente: si alguna talla cambió desde que se cargó (`actualizado_en`), no se aplica nada.
  Esta consulta previa **detecta los cambios hechos antes de ella, pero no es un bloqueo atómico**:
  entre la consulta y la escritura, otra pestaña u otra cuenta todavía puede cambiar la misma talla,
  y la escritura se aplicará igualmente.
- Mientras se aplica, todo lo demás queda bloqueado: no hay envíos dobles ni acciones cruzadas.
- Las tres funciones trabajan **talla a talla**: con varias tallas son varias solicitudes, no una
  operación única, y el resultado dice cuáles se aplicaron y cuáles no. «Dejar por revisar» es una
  sola escritura para toda la selección.
- Sin reintentos automáticos. Solo una **respuesta válida de la escritura** confirma qué hizo esa
  petición. Si la respuesta se pierde (o no confirma el cambio), la talla queda como **«Resultado no
  confirmado»**:
  - El panel no repite la petición ni escribe nada para comprobarla, y no renueva vigencias.
  - Relee la talla con `fn_admin_tallas()` (solo lectura) y muestra su **estado actual**: estado
    guardado, procedencia, publicación original, vigencia y si está desactivada. Ese estado **no se
    atribuye a la petición**: una fecha de actualización distinta puede venir de otra acción, otra
    cuenta u otros parámetros, y una talla sin cambios tampoco prueba que la petición fallara, porque
    puede seguir en camino y aplicarse después. El aviso lo dice así («cambió…, pero no sabemos por
    qué operación» o «sin cambios por ahora; la petición todavía podría aplicarse»). Nunca anuncia,
    por ejemplo, que una talla quedó por revisar si la relectura la muestra en otro estado.
  - Si la relectura funciona, los datos se recargan y la selección se vacía: cualquier acción
    posterior exige elegir las tallas y confirmar de nuevo.
  - Si tampoco puede leerla, vacía la lista y bloquea las acciones hasta que «Actualizar» traiga el
    estado real.
  - En un lote, las tallas con respuesta válida conservan su resultado («confirmada…», «no se
    aplicó» con el motivo) y las que quedaron después de la pérdida aparecen como «no se intentó».
- Después de cada acción los datos se recargan desde el servidor, conservando búsqueda, filtro y
  posición. Las lecturas se piden por páginas ordenadas, sin truncarse en el límite de la API.
- Las columnas internas de las tallas se leen con `fn_admin_tallas()`; las escrituras solo devuelven
  columnas públicas.

## Abrirlo en local

En la raíz del proyecto, en PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\abrir-panel.ps1
```

El guion arranca el servidor estático en `127.0.0.1:8765` si no está en marcha y abre
**http://127.0.0.1:8765/admin/**. A mano es lo mismo:

```bash
python -m http.server 8765 --bind 127.0.0.1
# y abrir http://127.0.0.1:8765/admin/
```

El panel habla directamente con el proyecto de Supabase configurado: con `admin/config.js` apuntando
a `gama-talla-dev`, lo que se ve son los datos reales.

## Configuración

`admin/config.js` **no se versiona** (está en `.gitignore`). Se crea copiando `config.ejemplo.js`:

| Valor | Dónde se obtiene |
|---|---|
| `supabaseUrl` | Dashboard → Project Settings → Data API → Project URL |
| `clavePublicable` | Dashboard → Project Settings → API Keys → Publishable key (`sb_publishable_…`) |

Solo la clave **publicable**. El panel rechaza una clave secreta (`sb_secret_…`) o un JWT y muestra
«Falta configurar el panel». La protección real la hacen el RLS y las funciones de Supabase.

## Cómo protege el acceso

- **Sesión:** la gestiona el SDK oficial (`vendor/supabase-js-2.118.0`, versión fijada y servida desde
  el propio sitio; ver su `LEEME.txt`). Se guarda solo bajo la clave `gama-talla-panel-sesion` de
  `localStorage`: el carrito y la caché de la tienda no se tocan, y la tienda sigue consultando como
  visitante con su clave publicable, sin la sesión del panel.
- **Permiso:** antes de mostrar o recargar datos se verifica la sesión con Auth en el servidor
  (`getUser`) y el permiso con `fn_es_administrador()`. Se repite en cada «Actualizar» y al volver a la
  pestaña (como mucho cada 30 s). Si el permiso se retira o la sesión vence, los datos desaparecen.
- **Errores de red:** no se muestran datos anteriores; el SDK reintenta las lecturas hasta 3 veces y
  después aparece un aviso con «Reintentar».
- **Cerrar sesión:** cierra la sesión de este dispositivo con el SDK (`signOut({ scope: "local" })`),
  lo que revoca su token de refresco, y borra solo la clave del panel.
- **Página:** política de seguridad de contenido estricta (solo scripts propios; conexiones solo a
  Supabase), `noindex` y sin `Referer`. Todo el contenido se pinta con `textContent`.

## Qué lee

| Dato | De dónde |
|---|---|
| Productos, colores, precios y fotos (también ocultos) | Tablas `productos`, `variantes` y `fotos` (RLS de administrador) |
| Tallas y sus columnas internas | `fn_admin_tallas()` |
| Estado de cada talla en la tienda | `catalogo_publico`: lo calcula Supabase, no el reloj del navegador |

Lo que no está publicado (producto, color o talla inactivos) se presenta como «no visible en la tienda».

## Pruebas (solo local)

Con el stack local de Supabase y la tienda servida:

```bash
npx --yes supabase@3.0.0 start -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
python -m http.server 8765 --bind 127.0.0.1      # en otra terminal
npx playwright test tests/etapa15 --workers=1
npx --yes supabase@3.0.0 stop --no-backup
```

Las pruebas crean usuarios y productos **ficticios** en el stack local con su clave de servicio
local, los borran al terminar y se niegan a correr si la API no está en `127.0.0.1`. Necesitan el
catálogo local vacío al empezar. Si una ejecución anterior se interrumpió antes de limpiar (por
ejemplo, si cae el navegador), retiran primero esos restos —solo los nombres, marcas y correos
`@gamaytalla.test` que ellas mismas crean— y lo anuncian en la salida.

Para ver el panel con muchos productos se pueden cargar en local los 28 **ejemplos** de la tienda
(`supabase/local/semilla-28-productos.sql`). Son datos de demostración: nunca se cargan en el
proyecto remoto. Usan un solo
proceso (`--workers=1`): el servidor de Python no aguanta conexiones en paralelo. Las capturas se
guardan en la carpeta temporal del sistema (`gama-talla-15a-capturas`), fuera del repositorio.
