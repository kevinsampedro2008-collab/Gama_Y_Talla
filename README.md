# UMBRAL — The Sneaker Index

Tienda/catálogo editorial de sneakers desarrollada con HTML5, CSS3 y JavaScript Vanilla. No requiere frameworks, npm, backend ni proceso de compilación; está preparada para Netlify como sitio estático.

## Estructura

```text
umbral-sneaker-store/
├── index.html
├── styles.css
├── app.js
├── favicon.svg
├── data/
│   └── productos.json
└── assets/
    └── images/
        ├── branding/
        │   ├── hero.svg
        │   └── placeholder.svg
        └── products/
            ├── sneaker-01.svg ... sneaker-08.svg
```

## Antes de publicarla

1. Abre `app.js` y actualiza `CONFIG.whatsapp`, `CONFIG.instagramUrl`, `CONFIG.instagramUser`, `CONFIG.tienda` y, si corresponde, el horario. Para WhatsApp usa código de país + número sin `+`, espacios ni guiones, por ejemplo `573001234567`.
2. Revisa `data/productos.json`. Los productos, precios, códigos, tallas y existencias actuales son **datos ficticios de demostración**.
3. Las zapatillas SVG son ilustraciones vectoriales genéricas creadas para el diseño, no fotografías oficiales ni representaciones exactas de cada modelo. Sustituye las rutas `imagen` por fotografías propias o autorizadas antes de vender productos reales. Mantén las rutas relativas.
4. Ajusta el `<title>`, la meta description y los textos de confianza según la información real de la tienda.

## Cambiar el catálogo

Edita `data/productos.json`. Cada elemento de `productos` usa este formato:

```json
{
  "id": "UM-009",
  "nombre": "Nombre del modelo",
  "marca": "Marca",
  "categoria": "Lifestyle",
  "color": "Negro / blanco",
  "precio": 499900,
  "imagen": "assets/images/products/mi-foto.webp",
  "tallasDisponibles": ["38", "39", "40"],
  "tallasAgotadas": ["41"],
  "badge": "Nuevo",
  "disponible": true,
  "destacado": true,
  "nuevoIngreso": true
}
```

`precio` es un número en COP sin símbolo ni separadores. Usa `disponible: false` cuando el producto esté agotado. Los filtros de marca, categoría y nuevos ingresos se generan a partir de este JSON. No hay que cambiar el HTML para agregar productos.

## Ejecutar en local

Como el catálogo se carga mediante `fetch()`, no abras `index.html` haciendo doble clic con la ruta `file://`.

**Opción recomendada:** abre la carpeta en Visual Studio Code, instala la extensión **Live Server**, haz clic derecho en `index.html` y selecciona **Open with Live Server**.

También puedes usar Python desde la raíz del proyecto:

```bash
python -m http.server 8000
```

Después abre `http://localhost:8000`.

## Publicar en Netlify

1. Asegúrate de que `index.html` esté en la raíz de esta carpeta.
2. Entra en https://app.netlify.com/drop.
3. Arrastra la carpeta del proyecto (o descomprime el ZIP y arrastra esa carpeta).
4. Netlify publicará el sitio estático y asignará una URL `*.netlify.app`.
5. Antes de compartirla, comprueba el catálogo, las rutas de imágenes y que el botón de WhatsApp tenga tu número real.

No es necesario definir un comando de build ni una carpeta `dist`.

## Funcionalidades

- Diseño editorial responsive de escritorio y móvil.
- Catálogo cargado desde JSON con manejo de error y reintento.
- Búsqueda por código, modelo, marca, categoría y color; ignora acentos.
- Filtros combinables por marca/categoría y nuevos ingresos.
- Orden por destacados, precio ascendente/descendente y nombre.
- Selección explícita de talla, con tallas agotadas deshabilitadas.
- Enlaces de WhatsApp con modelo, marca, color, talla, código y precio publicado.
- No realiza pagos ni reservas automáticas; confirma disponibilidad con la tienda.
- Accesibilidad básica, navegación por teclado y respeto a `prefers-reduced-motion`.

## Importante

Es un catálogo estático. Cambiar el JSON no sincroniza inventario en tiempo real entre usuarios; cada cambio debe volver a publicarse y la disponibilidad definitiva debe confirmarse por WhatsApp. No uses información comercial de demostración como si fuera real.
