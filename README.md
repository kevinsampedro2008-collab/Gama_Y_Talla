# Gama & Talla — tienda de zapatillas

Sitio web estático para **Gama & Talla**, una tienda de zapatillas en Colombia. Permite explorar un catálogo, consultar tallas europeas (EU), añadir varios productos al carrito y enviar un pedido completo por WhatsApp.

> **Importante:** los ocho productos, sus precios, tallas y existencias son de demostración. Las imágenes son ilustraciones genéricas provisionales, no fotografías oficiales de los modelos. Sustituye toda esa información por datos confirmados antes de vender.


## Estilo visual y diseño móvil

La interfaz utiliza una paleta editorial sobria de marfil cálido, carbón y champagne, con tipografías Playfair Display y DM Sans. La sección «Fácil y sencillo: ¿Cómo comprar?» aparece antes del catálogo. El CSS incluye ajustes para celular, animaciones de entrada y microinteracciones, y respeta la preferencia del sistema para reducir movimiento.

## Tecnologías

- HTML5 y CSS3.
- JavaScript Vanilla, sin framework ni compilación.
- JSON para el catálogo, leído mediante `fetch()`.
- SVG para iconos e ilustraciones provisionales.
- `localStorage` para recordar el carrito en el mismo navegador.

## Archivos y carpetas

```text
gama-y-talla/
├── index.html
├── styles.css
├── app.js
├── favicon.svg
├── netlify.toml
├── README.md
├── data/
│   └── productos.json
└── assets/
    └── images/
        ├── branding/
        │   ├── hero.svg
        │   └── placeholder.svg
        └── productos/
            ├── zapatilla-01.svg
            ├── zapatilla-02.svg
            ├── zapatilla-03.svg
            ├── zapatilla-04.svg
            ├── zapatilla-05.svg
            ├── zapatilla-06.svg
            ├── zapatilla-07.svg
            └── zapatilla-08.svg
```

## Antes de publicar

### 1. Configura WhatsApp

**En Netlify**, el número sale de la variable `WHATSAPP_COMERCIAL` (ver «Publicar en Netlify»); no hace falta editar el código.
En desarrollo, al inicio de `app.js`, dentro de `CONFIG`, está:

```js
whatsapp: "573000000000"
```

por el número comercial real, con indicativo de país y solo números. Para Colombia normalmente empieza por `57`. No pongas el signo `+`, espacios ni guiones.

Si el número sigue siendo el de demostración, la web muestra un aviso en vez de intentar enviar el pedido a ese número.

### 2. Conecta el catálogo real (etapa 16)

El catálogo real se administra desde el **panel privado** (`/admin/`): zapatillas, colores, precios,
tallas y fotos. La tienda lo lee de Supabase (vista `catalogo_publico`) como visitante; ya no hace
falta editar ningún JSON. Ver `admin/LEEME.md`.

La conexión se declara **fuera del código**, en `config.js` (no se versiona):

1. Copia `config.ejemplo.js` como `config.js`, en la raíz del sitio.
2. Escribe la URL del proyecto y su clave **publicable** (`sb_publishable_…`). Nunca la secreta: la
   tienda la rechaza, no la usa y no imprime su valor.
3. En Netlify, `config.js` no se sube: lo genera `scripts/preparar-publicacion.mjs` con las variables de entorno (ver «Publicar en Netlify»).

Cómo carga la tienda:

- Una respuesta válida con el catálogo vacío se muestra vacía («Aún no hay productos»): nunca se
  rellena con otros datos.
- Pide todas las páginas de la vista (500 filas por petición), sin truncarse en el límite de la API.
- Guarda el último catálogo real en este navegador, con el proyecto y la versión de formato. Si
  Supabase no responde, lo muestra en **modo consulta** (todo por revisar; se puede consultar por
  WhatsApp, no pedir). Una caché de otro proyecto, de otro formato o anterior a la etapa 16 no se usa.
- Sin catálogo real guardado, muestra un aviso de conexión con «Reintentar». El carrito nunca se
  vacía por un fallo de conexión.
- Claves admitidas, y ninguna más: `sb_publishable_…` con caracteres válidos (viaja solo en
  `apikey`) y, por compatibilidad, un JWT antiguo legible con `role` `anon` (`apikey` y Bearer). Se
  rechazan las secretas, los JWT de sesiones de usuario (`authenticated`), de `service_role` o de
  otro rol, los JWT ilegibles, cualquier otro texto y la falta de clave: no viajan en ninguna
  cabecera, no se imprime su valor y la tienda queda en modo consulta. Nunca usa la sesión del panel.
- Si una actualización falla después de haber cargado, la tienda no sigue dando por buena la
  disponibilidad anterior: pasa a modo consulta con el último catálogo real (guardado o, si no se
  pudo guardar, el que tenía en memoria), y vuelve sola cuando Supabase responde.
- Sin `config.js`: en local (`localhost`, `127.0.0.1`, `file://`) se ven los productos de ejemplo; en
  producción, un aviso de catálogo no disponible.

### 2b. Catálogo de ejemplo (solo desarrollo y pruebas)

Los 28 productos de `data/productos.json` son **ejemplos**: sirven para desarrollar y probar en local
y nunca se importan al proyecto real ni se muestran como respaldo del catálogo real. Su estructura:

```json
{
  "id": "GT-009",
  "nombre": "Nombre del modelo",
  "marca": "Marca",
  "categoria": "Urbanas",
  "color": "Blanco / negro",
  "precio": 499900,
  "imagen": "assets/images/productos/mi-foto.webp",
  "tallasDisponibles": ["38", "39", "40"],
  "tallasAgotadas": ["41"],
  "disponible": true,
  "destacado": false,
  "nuevoIngreso": false
}
```

- `id` debe ser un código único.
- `precio` es un número en pesos colombianos; usa `0` para mostrar «Precio por confirmar».
- `tallasDisponibles` y `tallasAgotadas` se muestran en numeración europea (EU), como textos.
- `disponible: false` bloquea el pedido. El producto también se considera agotado si no tiene tallas disponibles.
- `nuevoIngreso: true` muestra la etiqueta «Nuevo» y habilita el filtro «Nuevos ingresos».
- No se muestran automáticamente reclamos como «Original», «Exclusivo» o «Edición limitada».

Este formato se conserva para las pruebas; los productos reales se crean desde el panel.

### 3. Fotografías

Las imágenes incluidas son ilustraciones genéricas para diseño y pruebas. No son fotografías oficiales de las zapatillas identificadas por sus nombres. Antes de vender, reemplázalas por fotografías propias o autorizadas que correspondan exactamente al producto.

Se recomienda usar imágenes cuadradas, de buena resolución y optimizadas para web (`.webp` o `.jpg`). Si una imagen falla, se utiliza `assets/images/branding/placeholder.svg` como respaldo.

### 4. Guía de tallas y fuentes oficiales

Los enlaces de consulta de esta versión se actualizaron a páginas oficiales que se comprobaron al preparar la entrega:

- Nike Colombia: https://www.nike.com.co/guia-de-tallas
- adidas, tabla oficial de calzado (EU/US/longitud): https://www.adidas.com/us/help/size_charts/shoes
- adidas Colombia, orientación para abrir la tabla desde cada producto: https://www.adidas.co/ayuda/producto/cual-es-mi-talla-adidas
- New Balance, guía oficial en español: https://www.newbalance.com/es/size-guide.html
- Jordan, ayuda oficial de Nike sobre cómo consultar la tabla específica de cada modelo: https://www.nike.com/mx/help/a/tabla-de-tallas/app

**Importante:** Nike y New Balance disponen de tablas por categoría (hombre, mujer, unisex o niños). adidas presenta algunas tallas EU en tercios. Jordan requiere consultar la guía desde la ficha del modelo concreto; no se debe tratar como una conversión universal. Antes de publicar tallas, confirma la categoría, la etiqueta física y el modelo exacto. La web no inventa una equivalencia colombiana cuando no hay una fuente que la respalde.

Los enlaces se abren en una pestaña nueva. Las páginas y sus rutas pueden cambiar con el tiempo; si una marca modifica su sitio, actualiza el campo `url` correspondiente en `data/productos.json`.

### 5. Métodos de pago y envíos

La página muestra Nequi, Bancolombia y transferencia bancaria. No añadas números de cuenta, horarios ni promesas de envío que no estén confirmados. El costo y el tiempo de entrega se deben acordar con el cliente.

## Probar en local

No abras `index.html` con doble clic: el navegador puede bloquear `fetch()` al usar la dirección `file://`.

1. Descomprime el ZIP.
2. Abre la carpeta `gama-y-talla` en Visual Studio Code.
3. Instala la extensión **Live Server**.
4. Haz clic derecho en `index.html` y elige **Open with Live Server**.
5. Comprueba que aparezcan los productos y prueba buscador, filtros, detalles, tallas y carrito.

Alternativa: ejecuta `python -m http.server 8000` desde la carpeta del proyecto y abre `http://localhost:8000`.

## Carrito y WhatsApp

- El carrito se recuerda en el mismo navegador mediante `localStorage`.
- Cada línea se identifica por producto y talla EU.
- El usuario puede modificar cantidades, quitar productos y enviar varias zapatillas en un solo mensaje de WhatsApp.
- El subtotal es estimado y no incluye el envío.
- Abrir WhatsApp no confirma una compra; el carrito no se vacía automáticamente.
- Si el pedido es demasiado largo para un enlace de WhatsApp, se ofrece copiar el mensaje completo.

## Publicar en Netlify

El sitio se publica desde GitHub: Netlify ejecuta `node scripts/preparar-publicacion.mjs`, que arma la carpeta
**`dist`** (solo lo necesario de la tienda y de `/admin/`) y la sirve. `netlify.toml` ya trae el comando y el
directorio de publicación.

### Importar el proyecto

1. En Netlify: **Add new project → Import an existing project → GitHub**, y elige `kevinsampedro2008-collab/Gama_Y_Talla`
   (rama `main`).
2. Verifica que Netlify lea `netlify.toml`: **Build command** `node scripts/preparar-publicacion.mjs` y
   **Publish directory** `dist`.
3. Antes del primer despliegue, en **Site configuration → Environment variables** crea las **tres** variables de producción
   (sin ellas la compilación se detiene y dice cuál falta):

   | Variable | Qué va |
   |---|---|
   | `SUPABASE_URL` | `https://<referencia>.supabase.co` del proyecto (hoy `gama-talla-dev`) |
   | `SUPABASE_PUBLISHABLE_KEY` | La clave **publicable** (`sb_publishable_…`) de *Project Settings → API Keys*. Nunca la secreta |
   | `WHATSAPP_COMERCIAL` | El número comercial con prefijo de país (p. ej. `57` + diez dígitos). No el provisional |

   El comando rechaza una clave secreta o un JWT, una URL que no sea la HTTPS del proyecto aprobado y un número inválido o
   provisional. Nunca imprime los valores.
4. **Deploy**. Si cambias una variable, haz **Deploys → Trigger deploy → Clear cache and deploy site**.

Qué contiene `dist`: la tienda, `/admin/` (con el SDK del panel), las guías de tallas, la escena 3D y los recursos de
portada. No incluye los 28 ejemplos, las pruebas, los respaldos, las migraciones ni archivos `.env`. `config.js` y
`admin/config.js` se **generan** al compilar con las variables anteriores (no se versionan). En producción, `?datos-prueba`
no activa el catálogo de demostración.

Probar el empaquetado en local (con valores ficticios; `dist/` está ignorado por Git):

```bash
SUPABASE_URL=https://mwhiusocfdwzxnzenfsz.supabase.co SUPABASE_PUBLISHABLE_KEY=sb_publishable_FICTICIA_1234   WHATSAPP_COMERCIAL=573001234567 node scripts/preparar-publicacion.mjs
python -m http.server 8080 --directory dist     # y abrir http://127.0.0.1:8080/
npx playwright test tests/etapa17/publicacion.spec.js --workers=1
```

### Después de publicar: qué comprobar

1. **Enlace público.** Abre la dirección `*.netlify.app`: portada, catálogo (viene de `catalogo_publico`), fotos, filtros,
   ficha y carrito. Añade un par, completa los datos de envío y pulsa **Enviar pedido por WhatsApp**.
2. **Panel.** Abre `/admin/` (y `/admin`, que redirige): debe verse «Panel de la tienda» con el acceso. Ingresa con la cuenta
   administradora. El panel lleva `noindex` y su propia política de seguridad.
3. **Borrador de WhatsApp desde el iPhone.** En Safari, arma un pedido y envíalo: WhatsApp debe abrirse con el chat del número
   comercial y un borrador que empieza por «GAMA & TALLA — NUEVO PEDIDO». **No lo envíes**: cierra el borrador. Comprueba que
   no se vean caracteres «�» y que los saltos de línea y los datos de envío estén completos.
4. **Caché de la presentación.** Los modelos 3D y los pósteres llevan un hash en el nombre (por ejemplo
   `af1-model-medium.c6ba8831f9.glb`): su URL cambia solo si cambian sus bytes. `dist/_headers` les da
   `Cache-Control: public, max-age=31536000, immutable`; el HTML se revalida y los `config.js` son `no-store`.
   - Encabezado real: `curl -I https://<tu-sitio>/assets/images/models/optimized/<archivo-con-hash>.glb` debe mostrar
     `cache-control: public, max-age=31536000, immutable`.
   - Segunda visita: abre el sitio con una carga normal, abre las herramientas del navegador → **Red/Network**, recarga
     normalmente (sin «Disable cache» ni recarga forzada) y mira la columna **Size**/**Tamaño** de los `.glb` y los
     pósteres: debe decir **disk cache** o **memory cache**, sin transferir bytes.
   - Si quieres ver la presentación otra vez con el modelo en caché, usa «Volver a ver la presentación».
5. **Dominio (Hostinger).** En Netlify, **Domain management → Domains → Add a domain** y, dentro del dominio, **Set up Netlify DNS /
   Check DNS configuration**: ahí Netlify lista los registros exactos (normalmente un registro **A** o **ALIAS** para el dominio raíz y un
   **CNAME** para `www`). Cópialos en Hostinger → **Dominios → DNS / Nameservers → Administrar registros DNS**. Los cambios pueden tardar
   en propagarse; el certificado HTTPS se emite solo cuando el DNS apunta a Netlify.

## Política de privacidad y autorización de datos (completar antes de publicar)

La tienda incluye la página `/privacidad/` (`privacidad/index.html`), un texto en lenguaje sencillo que sigue los puntos mínimos del
art. 2.2.2.25.3.1 del Decreto 1074 de 2015 y la Ley 1581 de 2012, y describe el flujo real: las direcciones se guardan solo en el
navegador del cliente (`gama-talla-direcciones`) y, al abrir WhatsApp, el borrador con los datos pasa a WhatsApp (Meta); el mensaje no se
envía hasta que el cliente lo envía. Está enlazada desde el pie de página y desde el formulario de datos de envío, el carrito y
«Pedir este par». **Haz revisar el texto con quien asesore legalmente al negocio antes de publicarlo.**

**Una sola fuente.** El texto vive solo en `privacidad/index.html`, dentro de `data-politica-texto`. Desde el carrito, los datos de envío
y «Pedir este par», `app.js` lo lee de esa misma página y lo muestra en un diálogo encima del pedido (el pedido queda intacto debajo);
el enlace conserva su `href` real a `/privacidad/` como respaldo. Si el texto no carga, el diálogo ofrece «Reintentar».

**Autorización.** Hay una casilla *desmarcada por defecto* en tres puntos: (1) el formulario de envío, antes de guardar una dirección;
(2) el carrito, antes de «Enviar pedido por WhatsApp»; (3) la revisión de «Pedir este par». En el carrito y la revisión nace desmarcada en
cada visita, también cuando se usa una dirección que ya estaba guardada de visitas anteriores. Leer o cerrar la política nunca la marca.
Consultar la disponibilidad de una talla no pide datos de envío ni autorización.

**Estado del texto.** El apartado 1 («Quién es el responsable») está completo y la política indica su fecha de vigencia («Vigente desde
el 14 de noviembre de 2026»); no quedan marcadores `[COMPLETAR: …]` ni aviso de borrador. El empaquetado sigue avisando si reaparece un
marcador y, con `PRIVACIDAD_ESTRICTA=1`, se detiene.

**Constancia de la autorización.** El mensaje de WhatsApp **no** lleva una línea de autorización ni acredita por sí mismo que el cliente
la dio: la tienda solo exige la casilla (obligatoria, desmarcada en cada visita) antes de guardar la dirección o abrir WhatsApp, y no
registra esa autorización en ningún servidor. Si el negocio necesita conservar una constancia (por ejemplo, pedir en el chat una
confirmación expresa), es un mecanismo **pendiente de definir** con tu asesor; hoy no existe.

- La tienda **no envía** los datos de envío a ningún servidor propio: Netlify y Supabase no los reciben ni los registran (lo comprueba
  `tests/etapa17/privacidad.spec.js`). Evita añadir analítica o formularios que los capturen.
- **Versiona la política.** Cuando cambies su texto, actualiza la versión y la fecha de vigencia en `privacidad/index.html`. Marca la
  versión publicada en Git, por ejemplo
  `git tag politica-privacidad-v1`, para poder reconstruir el texto exacto. Si el cambio afecta la finalidad, el aviso de la página
  indica que se volverá a pedir autorización.
- Para consultas y reclamos, lleva un registro con fecha de solicitud, tipo y respuesta, **sin** copiar los datos de envío.
- Consulta con tu asesor si el negocio debe inscribir sus bases de datos en el Registro Nacional de Bases de Datos de la SIC.

## Lista antes de vender

- [ ] Cambiar el número provisional de WhatsApp.
- [ ] Reemplazar precios, tallas y existencias de demostración.
- [ ] Reemplazar las ilustraciones por fotografías correspondientes a los productos.
- [ ] Revisar las guías de talla por marca y tipo de calzado.
- [ ] Confirmar los métodos de pago y las condiciones de envío.
- [ ] Hacer una prueba real de WhatsApp sin asumir que el pedido quedó confirmado.


## Descuentos de muestra (versión actual)

En `data/productos.json`, algunos artículos tienen `precioAnterior` como **ejemplo**, no como oferta vigente. El precio de venta sigue siendo `precio`. Cuando `precioAnterior` sea mayor que `precio`, la tarjeta mostrará automáticamente **SALE**, porcentaje calculado, precio tachado y precio actual. Para retirar una oferta, elimina el campo `precioAnterior` o ponlo en `0`. **Nunca anuncies un descuento si el precio anterior no corresponde a un precio real verificable.** Las demostraciones usan GT-002, GT-004 y GT-006 y deben revisarse antes de publicar.

La guía EU de la portada abre el diálogo. Los diálogos de producto y guía están centrados; el carrito sigue a la derecha. El menú marca la sección visible y respeta el nuevo orden: Inicio, Cómo comprar, Catálogo, Pagos, Contacto.

## Versión 10 — enlaces, ilustraciones y disponibilidad

- Los enlaces de consulta de tallas apuntan a páginas oficiales comprobadas: Nike Colombia, adidas (tabla oficial de calzado y ayuda colombiana), New Balance en español y ayuda de Nike para encontrar la guía específica de cada modelo Jordan.
- La ficha de producto mantiene el enlace oficial de consulta incluso cuando una talla concreta no aparece en la tabla integrada.
- Los pasos 2 y 3 usan ilustraciones SVG locales nuevas: una zapatilla de perfil y un carrito de compras reconocible.
- El distintivo «Agotado» es rojo con texto blanco de alto contraste.
- El número de WhatsApp sigue siendo provisional y debe ser reemplazado por el número comercial antes de publicar.

Las páginas externas de las marcas pueden actualizar sus rutas con el tiempo. Se recomienda comprobar los enlaces antes del lanzamiento comercial.


## Actualización V11: formato de fotografías y etiqueta de agotado

- Las ilustraciones provisionales y la reserva de fotografía ahora utilizan lienzo cuadrado 1:1 (600 × 600).
- La tarjeta del catálogo muestra la imagen a todo el recuadro, sin el margen interior anterior.
- Para que las fotografías reales conserven el mismo encuadre y no se recorten, utiliza imágenes cuadradas (recomendado: 1200 × 1200 px), con la zapatilla centrada y dejando un margen de seguridad alrededor.
- Si se usa una imagen rectangular, el catálogo la adapta al recuadro cuadrado y puede recortar sus extremos; prepara las fotografías en 1:1 antes de cargarlas.
- El distintivo de producto agotado ahora lleva fondo negro y texto rojo.


## Versión 12 — mostrar más productos

- El catálogo presenta inicialmente hasta 12 productos.
- Cuando el resultado tiene más de 12 artículos, aparece el botón **Mostrar más** debajo de las tarjetas.
- Cada pulsación carga hasta 12 productos adicionales; el botón desaparece al mostrar el último artículo.
- La paginación se aplica a los resultados filtrados y ordenados. Al cambiar búsqueda, marca, categoría o criterio de orden, se vuelve al primer grupo de 12.
- El botón no aparece cuando hay 12 productos o menos. El catálogo de demostración incluido contiene 8 productos, por lo que para visualizar el botón debes añadir al menos 5 productos adicionales en `data/productos.json`.


## Versión 13 — navegación de catálogo en ambos sentidos

- El catálogo muestra inicialmente hasta 12 productos.
- Si hay más de 12, aparece **Mostrar más** y cada clic agrega el siguiente grupo de hasta 12 zapatillas.
- Al llegar al último producto, el mismo control cambia a **Mostrar menos**, con la flecha orientada hacia arriba.
- **Mostrar menos** regresa exactamente al grupo anterior: por ejemplo, 24 → 12; 25 → 24; 36 → 24. Desde ese punto vuelve a estar disponible **Mostrar más**.
- Al cambiar la búsqueda, los filtros o el orden, la vista se reinicia en los primeros 12 resultados.
- Si el resultado tiene 12 productos o menos, el control no aparece.


## Versión 14 — marco de fotografías y espacio del control del catálogo

- Las fotografías de producto mantienen el formato cuadrado 1:1 y ocupan el recuadro completo, pero ahora tienen un borde cálido y una sombra muy sutil para que el marco no se pierda cuando la propia fotografía tiene fondo blanco.
- Se añadió un espacio más claro entre la fotografía y el nombre/precio del producto, sin alterar el tamaño del recuadro.
- El control **Mostrar más / Mostrar menos** tiene más separación respecto a la última fila de productos, con un ajuste específico para celular.

## Actualización V15 — marco de fotografías del catálogo

- Cada fotografía del catálogo queda insetada dentro de un marco beige visible de 9–12 px, con borde cálido, doble separación sutil y esquinas redondeadas. Esto evita que las fotos de fondo blanco se confundan con el fondo de la tarjeta.
- Se conserva el formato cuadrado 1:1 y `object-fit: cover` para mantener una presentación uniforme de las fotos.
- Se amplió el espacio antes del control «Mostrar más / Mostrar menos» y se añadió un separador horizontal champagne para distinguirlo de la última fila de productos.


## Actualización V16 — marco negro y ficha del producto

- El marco de la fotografía ahora es negro, con una separación interior uniforme y esquinas redondeadas.
- La información debajo de la foto (marca, modelo, precio y botón «Ver detalles») ahora está agrupada en una ficha beige con borde oscuro, radio suave y sombra ligera. Así deja de perderse sobre el fondo blanco del catálogo.
- En pantallas pequeñas se reducen los márgenes internos de la ficha para conservar espacio y legibilidad.
- Se mantiene la paginación «Mostrar más / Mostrar menos» y el resto de las funciones del catálogo.


## Actualización V17 — tarjeta de producto unificada

- Se eliminó el marco negro independiente de la fotografía.
- La fotografía y el bloque de información quedan unidos, sin margen ni separación entre ambos.
- Un único contorno exterior rodea el conjunto completo del producto.
- La zona de información conserva un fondo beige suave para que marca, modelo, precio y acciones destaquen sobre el catálogo blanco, pero ya no tiene un borde ni una sombra independientes.
- Se mantiene la imagen cuadrada 1:1, `object-fit: contain` y los ajustes de visualización para móvil.


## Versión 18 — fotografía a ras del marco de la tarjeta

- La imagen del producto ocupa ahora todo el recuadro cuadrado 1:1, sin relleno interior: llega a ras del borde superior, izquierdo y derecho de la tarjeta unificada.
- Todas las fotografías usan el mismo tamaño visual y `object-fit: cover`, para que el marco se vea uniforme cuando se cargan imágenes de distintos tamaños.
- Se eliminó el padding tanto en escritorio como en móvil. No hay un marco separado para la foto ni un espacio entre la imagen y la ficha beige de marca, modelo, precio y detalles.
- La tarjeta conserva un único contorno exterior. Para evitar recortes de la zapatilla, se recomienda subir fotografías cuadradas (1:1), con el calzado centrado y suficiente margen dentro de la propia foto.


## Versión 20 — borde champagne y optimización de imágenes

- La tarjeta (foto e información) tiene un único borde champagne con brillo muy tenue al enfocar o pasar el cursor, sin crear un marco negro separado.
- El catálogo solamente crea elementos de imagen para los productos que se van mostrando en grupos de 12. Los siguientes grupos **no se solicitan al servidor** hasta que el visitante pulse «Mostrar más».
- Dentro del grupo visible, las primeras dos imágenes tienen prioridad de carga; las demás usan `loading="lazy"` y prioridad baja para que el navegador las descargue cuando las necesite. El navegador decide la distancia de precarga.
- Al abrir un detalle se carga la foto que corresponda, aunque la tarjeta original estuviera fuera de pantalla.
- Recomendado para tus fotografías: formato WebP/AVIF, 1:1, alrededor de 800–1200 px por lado y, como referencia práctica, entre 80 y 200 KB por foto si la calidad lo permite.
- **Netlify:** en planes por créditos, cada despliegue a producción cuesta créditos; con GitHub conectado, cada `git push` a la rama de producción puede generar uno. Puedes agrupar cambios para evitar despliegues innecesarios.


## V21 — Portada editorial
Se rediseñó únicamente el bloque de texto de Inicio (titular, texto, botones y pasos resumidos). Se conservan ilustración, guía de tallas, enlace al catálogo y catálogo optimizado de V20.

## V23 — Animaciones restauradas

Se recuperó el movimiento suave de la ilustración de Inicio y el efecto de elevación/acercamiento de las tarjetas del catálogo, sin alterar la composición editorial de la portada de V22. Se respeta `prefers-reduced-motion` y los efectos hover se aplican solo en dispositivos compatibles con cursor. Los productos siguen cargándose en grupos de 12.

### V24 · Métodos de pago
Se unificó el recuadro del icono de transferencia bancaria con Nequi y Bancolombia. El nuevo símbolo de banco es negro y está incrustado en el HTML, sin enlaces externos.


## Versión 25 — icono de transferencia y nitidez de fotografías

- El método «Transferencia bancaria» recupera el icono original de dos flechas de transferencia (`icono-transferencia`), ahora en negro. Se conserva el mismo recuadro blanco y las dimensiones de los recuadros de Nequi y Bancolombia.
- Se eliminó el zoom y la rotación de la fotografía al pasar el cursor sobre una tarjeta. La zapatilla mantiene un movimiento vertical muy sutil de 2 px, mientras la tarjeta se eleva ligeramente. Esto evita que la animación amplíe la imagen y provoque pérdida de nitidez.
- En dispositivos táctiles no se fuerza el efecto de hover y se respeta `prefers-reduced-motion`.


## Cambios de la versión 26

- En teléfonos, el enlace «Cómo comprar» queda centrado debajo de «Descubrir zapatillas»; el botón principal ocupa el ancho disponible. En escritorio se conserva la disposición anterior.
- Las fichas de productos reservan espacio para el precio y el distintivo de descuento, y fijan las acciones al final de la tarjeta para alinear «Ver detalles» entre productos con y sin oferta.
- Se retiró la ruta decorativa «Inicio / Catálogo» del encabezado de la sección de catálogo.

## Versión 27 — equilibrio de precios y botones
- Los precios sin descuento se centran vertical y horizontalmente en el mismo espacio de dos niveles que ocupan el precio anterior y el porcentaje de descuento.
- En productos con descuento, el precio actual queda a la izquierda y el precio anterior tachado y el porcentaje se apilan a la derecha.
- Las fichas reservan una altura mínima para nombres de dos líneas y los botones `Ver detalles` quedan anclados en la parte inferior, aunque los modelos tengan nombres más largos.
- Se mantienen el diseño, las funciones y los recursos de la versión 26.

## Versión 28 — diseño de escritorio restaurado y precios móviles ajustados

- En pantallas de escritorio se restaura la presentación original de las tarjetas y los precios de la versión 26. Los cambios de distribución de precios introducidos en la versión 27 ya no se aplican al escritorio.
- En celular se conserva el diseño de dos niveles para las ofertas: precio vigente a la izquierda y precio anterior tachado junto al porcentaje a la derecha.
- En celular, los productos sin descuento muestran el precio normal alineado a la izquierda, en la misma columna del precio vigente de los productos rebajados.
- En celular, el nombre del producto reserva altura y el botón «Ver detalles» se mantiene abajo para que los nombres largos no desacomoden la fila.
- Los ajustes nuevos de precios están dentro de reglas `@media (max-width: 700px)`, por lo que no alteran la composición de escritorio.
