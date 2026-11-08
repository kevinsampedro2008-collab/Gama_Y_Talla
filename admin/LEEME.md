# Panel privado de Gama & Talla · etapas 15A, 15B y 16

Ingreso con correo y contraseña, tablero del catálogo, **gestión de la disponibilidad de las tallas**
(15B) y **administración del catálogo** (16): zapatillas, colores, precios, tallas y fotografías WebP.

## Administrar el catálogo (16)

- **«Agregar zapatilla»** está siempre arriba del tablero (y en el aviso del catálogo vacío).
  **«Editar»** abre cada zapatilla. El editor ocupa toda la pantalla en el celular y es un panel
  centrado en el escritorio; Escape o «Cancelar» piden confirmación si hay cambios sin guardar, y el
  navegador avisa antes de abandonar la página.
- **Modelo:** nombre, marca, categoría, referencia del proveedor (puede repetirse: no es el
  identificador), tabla de la guía de tallas (hombre o mujer), orden, descripción, «Destacada» y
  «Nuevo ingreso».
- **Colores:** nombre, referencia del color, precio actual y anterior y «Color visible en la
  tienda». Precio `0` = «Precio por confirmar»; el precio anterior debe ser mayor que el actual (y no
  se admite con precio 0). Un color se desactiva, no se borra.
- **Tallas:** se añaden una a una o separadas por punto y coma (`38; 39; 40`), con la gramática de
  la base (`40`, `40,5`, `40.5`, `40 1/3`). Se rechazan los equivalentes en el mismo color (`40.5`
  si ya existe `40,5`): se reactiva la existente. Las etiquetas existentes no se renombran ni se
  normalizan. Una talla nueva queda **por revisar**; las existentes solo se desactivan o reactivan.
- **Cambios hechos en otro lugar mientras editas.** El formulario envía, por cada talla, cómo
  estaba al abrirlo. El servidor solo aplica lo que cambiaste tú: si una talla que no tocaste se
  reactivó o desactivó entretanto (por ejemplo, «Confirmó el proveedor» desde otra pestaña), ese
  cambio se conserva y el aviso de guardado lo dice. La comprobación y la escritura van juntas en el
  servidor, con la fila bloqueada; el estado, la confirmación y la vigencia de la talla no se tocan.
- **Guardar nunca confirma disponibilidad ni renueva vigencias.** Para confirmar, las acciones de
  15B del tablero («Confirmó el proveedor», «Nueva publicación»).
- **Guardar oculta / Guardar y publicar.** Una zapatilla nueva se guarda oculta. Publicar es una
  acción aparte que exige **un mismo color visible** con al menos una foto y una talla activa (una
  foto en un color y una talla en otro no bastan, y un color oculto no cuenta); si falta algo, queda
  guardada y oculta y se dice qué falta. «Ocultar de la tienda», «Retirar del catálogo» (oculta y
  conserva todo; aparece en el filtro «Retiradas») y «Restaurar» (vuelve oculta).
- Se conservan UUID, código interno (`GT-…`), códigos de color (`GT-…-A`) y las claves del carrito:
  cambiar nombres, referencias o fotos no regenera nada.

### Fotografías

| Límite | Valor | Por qué |
|---|---|---|
| Archivo original | JPEG, PNG o WebP, hasta 15 MB | Se comprueba la **firma del contenido**, no la extensión, y que el navegador pueda decodificarla |
| Dimensiones | Lado mayor de 400 px como mínimo; hasta 50 megapíxeles | No se amplían fotos pequeñas (aviso por debajo de 900 px) |
| Foto publicada | WebP, lado mayor hasta 1600 px, proporciones intactas, sin recortes | Objetivo orientativo 150–250 KB; nunca más de 600 KB |
| Por color / por vez | 12 / 12 | |
| Bucket `fotos-catalogo` | Solo `image/webp`, 1 MiB por archivo | Lo impone Storage, además del panel |

- Un WebP que ya es adecuado (hasta 1600 px y 300 KB) se sube **tal cual**. Lo demás se redimensiona
  sin ampliar y se codifica a WebP probando calidades de 0,86 a 0,68 hasta llegar al objetivo; si
  recomprimir no mejora un WebP, se conserva el original. La salida se comprueba: si el navegador
  no genera WebP de verdad, se dice y no se sube otra cosa.
- Cada foto muestra vista previa, dimensiones, peso original → final y el progreso de subida.
- Nombres únicos y versionados: `productos/<producto>/<color>/<milisegundos>-<10 aleatorios>.webp`.
  Nada se sobrescribe (no hay política UPDATE). Reemplazar sube un archivo nuevo.
- **Quitar de la galería** quita la fila de `fotos`, no el archivo. **Archivos sin usar** (en el
  editor) lista lo que está en Storage y en ninguna galería guardada; «Borrar definitivamente» pide
  confirmación, vuelve a comprobar que nadie lo usa y borra con la API de Storage (nunca por SQL).
  Storage también lo impide en el servidor si alguna galería lo referencia.
- **Costo de almacenamiento y transferencia (estimación, sin miniaturas):** con ~2.000 fotos de
  ~200 KB, unos **400 MB**. Una visita típica (12 tarjetas y 2 fichas de 4 fotos) transfiere unos
  4 MB, es decir ~4 GB al mes por cada 1.000 visitas; los archivos llevan caché de un año y sus
  nombres no cambian, así que las visitas repetidas descargan mucho menos. Compara estas cifras con
  los límites vigentes de tu plan de Supabase.
- **Miniaturas: no se generan.** Duplicarían el trabajo de cada foto. Si se añadieran (unos 400 px y
  ~30 KB cada una), costarían ~60 MB más para 2.000 fotos y reducirían el peso de las tarjetas del
  catálogo de ~2,4 MB a ~0,4 MB por visita. Queda como mejora opcional.

### Fallos entre Storage y la base de datos

- Las fotos se suben **antes** de guardar; el guardado solo acepta archivos que ya están en Storage
  (la función lo comprueba). Una subida fallida nunca deja una referencia publicada.
- Si se pierde la respuesta de una subida, el panel mira en Storage si el archivo llegó; si no
  aparece, ofrece reintentar **con el mismo nombre** (no se duplica). No afirma que falló.
- Un guardado es **una** llamada a `fn_admin_guardar_producto`, en una transacción: o se aplica todo
  (producto, colores, tallas, galería) o nada.
- Cada guardado lleva un identificador de operación. Si se pierde la respuesta, el panel relee la
  zapatilla (solo lectura): si su `ultima_operacion` es la de ese guardado, se aplicó (nadie más
  conoce ese valor). Si no, dice «Resultado no confirmado» con lo que sabe (sigue sin cambios y
  podría aplicarse, o cambió por otra edición) y permite **reintentar con la misma operación**: el
  servidor no la aplica dos veces. Una creación nunca se repite con identificadores nuevos.
- Formularios desactualizados: el servidor compara la `version` y la actualiza en la misma
  transacción. Si otra edición se guardó antes, no se sobrescribe nada; el formulario conserva tus
  datos y ofrece cargar la versión actual.
- Los archivos antiguos no se borran al reemplazar una foto, y no se ofrece borrar archivos mientras
  haya una operación sin confirmar.
- Si la sesión vence con cambios sin guardar, el formulario se conserva en memoria y, al volver a
  entrar, el tablero ofrece «Volver al formulario».

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
a `gama-talla-dev`, lo que se ve son los datos reales. **Guardar en el panel escribe en ese proyecto.**
Las fotos (etapa 16) necesitan que las migraciones `20261108010000` y `20261108020000` estén aplicadas
en él (bucket y funciones).

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
# Storage activo (la etapa 16 lo necesita): no se excluye storage-api
npx --yes supabase@3.0.0 start -x realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
python -m http.server 8765 --bind 127.0.0.1      # en otra terminal
npx playwright test tests/etapa15 tests/etapa16 --workers=1
node supabase/pruebas/80_catalogo_http_local.mjs  # PostgREST y Storage por HTTP real
npx --yes supabase@3.0.0 stop --no-backup
```

Las pruebas de la etapa 16 generan fotos ficticias con Chromium en la carpeta temporal
(`gama-talla-16-fotos`), usan la marca «Marca Dieciséis» y borran al terminar sus productos y sus
archivos de Storage (también los huérfanos de una ejecución interrumpida). Capturas en
`gama-talla-16-capturas`.

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
