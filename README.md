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

Al inicio de `app.js`, dentro de `CONFIG`, reemplaza:

```js
whatsapp: "573000000000"
```

por el número comercial real, con indicativo de país y solo números. Para Colombia normalmente empieza por `57`. No pongas el signo `+`, espacios ni guiones.

Si el número sigue siendo el de demostración, la web muestra un aviso en vez de intentar enviar el pedido a ese número.

### 2. Reemplaza el catálogo de demostración

Edita `data/productos.json`. Cada producto tiene una estructura como esta:

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

Añadir o eliminar productos no requiere cambiar el HTML. Añade la imagen correspondiente y actualiza el campo `imagen`.

### 3. Fotografías

Las imágenes incluidas son ilustraciones genéricas para diseño y pruebas. No son fotografías oficiales de las zapatillas identificadas por sus nombres. Antes de vender, reemplázalas por fotografías propias o autorizadas que correspondan exactamente al producto.

Se recomienda usar imágenes cuadradas, de buena resolución y optimizadas para web (`.webp` o `.jpg`). Si una imagen falla, se utiliza `assets/images/branding/placeholder.svg` como respaldo.

### 4. Guía de tallas

El catálogo usa talla EU como selección principal. La guía muestra equivalencias colombianas únicamente cuando la tabla incluida aporta ese dato; para otras tallas indica que debe confirmarse con el vendedor.

La tabla Nike de demostración se basa en guías oficiales de calzado de hombre de Nike Colombia y Nike Global:

- [Guía de tallas de Nike Colombia](https://www.nike.com.co/guia-tallas/calzado-de-hombre)
- [Guía global de calzado de hombre de Nike](https://www.nike.com/size-fit/mens-footwear)

No apliques la tabla de hombre automáticamente a calzado de mujer o niño ni a otras marcas. Comprueba periódicamente las fuentes y confirma el ajuste de cada modelo. Las equivalencias son orientativas, porque la horma puede variar.

Para actualizar las tablas, edita `guiasTallas` dentro de `data/productos.json`. Deja `verificada: true` únicamente cuando los datos y la fuente se hayan comprobado. Las guías pendientes no muestran equivalencias como si fueran oficiales.

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

1. Entra a [Netlify Drop](https://app.netlify.com/drop).
2. Arrastra la carpeta `gama-y-talla` que contiene `index.html` en su raíz.
3. Netlify publicará el sitio y generará una dirección `*.netlify.app`.
4. Abre la dirección publicada y comprueba el catálogo, las imágenes y el proceso de pedido.

El proyecto no requiere comando de compilación. `netlify.toml` configura `publish = "."`.

## Lista antes de vender

- [ ] Cambiar el número provisional de WhatsApp.
- [ ] Reemplazar precios, tallas y existencias de demostración.
- [ ] Reemplazar las ilustraciones por fotografías correspondientes a los productos.
- [ ] Revisar las guías de talla por marca y tipo de calzado.
- [ ] Confirmar los métodos de pago y las condiciones de envío.
- [ ] Hacer una prueba real de WhatsApp sin asumir que el pedido quedó confirmado.
