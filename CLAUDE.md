# GAMA & TALLA — GUÍA PRINCIPAL DEL PROYECTO

## 1. IDENTIDAD DEL PROYECTO

**Nombre comercial:** Gama & Talla.

**Descripción:** Tienda online de zapatillas orientada al público colombiano.

El objetivo es desarrollar una experiencia de comercio electrónico profesional, atractiva, intuitiva y funcional, con una identidad visual propia y una excelente experiencia de compra.

El proyecto ya cuenta con una base funcional desarrollada. El trabajo consiste en analizarla, mejorarla y evolucionarla, no en comenzar desde cero.

---

## 2. STACK TECNOLÓGICO

La arquitectura actual utiliza:

- HTML5 semántico.
- CSS3.
- JavaScript Vanilla (ES6+).
- JSON para almacenar la información de los productos.
- LocalStorage para conservar el carrito.
- Integración de pedidos mediante WhatsApp.

Estructura principal:

- `index.html`: estructura de la página.
- `styles.css`: estilos y diseño visual.
- `app.js`: lógica e interacciones.
- `data/productos.json`: información de productos y guías de tallas.
- `assets/`: fotografías, ilustraciones, iconos y recursos gráficos.

Mantener la separación de responsabilidades entre HTML, CSS y JavaScript.

No migrar a React, Vue, Next.js u otros frameworks sin autorización expresa.

No incorporar dependencias innecesarias.

---

## 3. SKILLS DE DISEÑO E INGENIERÍA

El proyecto dispone de las siguientes Skills:

- `.claude/skills/apple-design/SKILL.md`
- `.claude/skills/emil-design-eng/SKILL.md`

Consultar estas Skills cuando las tareas involucren diseño visual, interfaces, experiencia de usuario, interacciones, animaciones, tipografía o calidad de implementación.

Utilizar sus conocimientos como referencias para tomar decisiones fundamentadas.

No es necesario reproducir todas sus recomendaciones indiscriminadamente. Aplicar únicamente los principios que aporten valor a la tarea y al contexto del proyecto.

Evitar generar interfaces genéricas o con apariencia de plantilla.

---

## 4. DIRECCIÓN DE DISEÑO E IDENTIDAD VISUAL

Gama & Talla tendrá un rediseño visual integral.

**Tienes libertad creativa para definir una identidad visual completamente nueva.**

No debes conservar obligatoriamente la identidad visual actual ni tomar como referencia fija sus:

- Colores.
- Tipografías.
- Tarjetas.
- Bordes.
- Sombras.
- Composiciones.
- Fondos.
- Componentes visuales.

Debes proponer y fundamentar una nueva dirección de diseño.

### Elementos que debes definir

- Identidad visual de la marca.
- Paleta de colores.
- Sistema tipográfico.
- Jerarquía visual.
- Espaciados y proporciones.
- Diseño de botones y componentes.
- Tarjetas de productos.
- Cabecera y navegación.
- Portada principal.
- Galería de fotografías.
- Secciones informativas.
- Pie de página.
- Diseño responsive.
- Microinteracciones y animaciones.

El resultado debe tener personalidad propia y transmitir profesionalismo, confianza y calidad comercial.

Las decisiones visuales deben ser coherentes entre todas las secciones.

### Referencias visuales

El usuario proporcionará imágenes y referencias de otros sitios web cuando lo considere necesario.

Estas referencias sirven para estudiar distribuciones, jerarquías, patrones de navegación y experiencias de compra.

No deben copiarse literalmente sus identidades visuales.

La captura de Refero Styles proporcionada para la ventana de detalles es una referencia de distribución y experiencia de producto, no una imposición de colores o tipografías.

### Aprobación del diseño

Antes de comenzar un rediseño integral:

1. Analiza las necesidades del proyecto.
2. Consulta las Skills pertinentes.
3. Define una propuesta de identidad visual.
4. Justifica las principales decisiones.
5. Presenta la propuesta al usuario.
6. Espera su aprobación antes de implementarla.

No realizar cambios visuales masivos sin autorización.

---

## 5. FUNCIONALIDADES EXISTENTES QUE DEBEN CONSERVARSE

El proyecto dispone de las siguientes funcionalidades:

- Catálogo dinámico desde JSON.
- Búsqueda por modelo, marca y color.
- Filtros por marca y categoría.
- Filtro de nuevos ingresos.
- Ordenamiento de productos.
- Paginación progresiva de productos.
- Visualización de precios en pesos colombianos.
- Precios anteriores y descuentos.
- Disponibilidad de tallas EU.
- Identificación de productos agotados.
- Ventana de detalles de productos.
- Guía de tallas.
- Selección de cantidades.
- Carrito con varios productos.
- Modificación y eliminación de productos del carrito.
- Persistencia del carrito mediante LocalStorage.
- Generación de pedidos por WhatsApp.
- Mensajes de confirmación y notificaciones.
- Diseño adaptable a diferentes dispositivos.

Estas funcionalidades son parte fundamental del comercio.

No eliminarlas, reemplazarlas ni simplificarlas sin autorización.

Cualquier rediseño debe mantener su funcionamiento.

---

## 6. REQUERIMIENTOS DE LA VENTANA DE DETALLES

La experiencia de «Ver detalles» debe evolucionar hacia una presentación profesional de producto.

### Galería de fotografías

- Mostrar una fotografía principal de la zapatilla.
- Incorporar flechas laterales para navegar entre fotografías.
- Incorporar indicadores de posición.
- Permitir la navegación mediante controles táctiles en celular.
- Mantener las proporciones originales de las fotografías.
- Evitar deformaciones, recortes inadecuados y cambios bruscos.

### Variantes de color

- Mostrar el nombre del color seleccionado.
- Representar visualmente los colores mediante muestras.
- Permitir seleccionar los colores realmente disponibles.
- Al seleccionar un color, mostrar su galería correspondiente.
- Sincronizar la fotografía, el color y las tallas.
- Si solamente existe un color, mostrarlo como única variante sin generar opciones ficticias.

### Información del producto

La jerarquía comercial debe incluir:

1. Marca y tipo de uso o categoría.
2. Nombre del modelo.
3. Precio actual.
4. Precio anterior tachado cuando exista descuento.
5. Porcentaje de descuento cuando corresponda.

El precio anterior debe tener menor protagonismo visual y el descuento debe destacarse mediante el color de acento elegido para la nueva identidad visual.

### Tallas EU

- Presentar las tallas mediante botones individuales.
- Diferenciar tallas seleccionadas, disponibles y agotadas.
- Actualizar las tallas al cambiar de color.
- Limpiar una talla seleccionada cuando no esté disponible en la nueva variante.

### Guía de tallas

- Ubicar «Guía de tallas» junto al título del selector de tallas.
- Reutilizar el modal existente.
- No crear guías duplicadas.

### Acciones de compra

Incorporar:

1. «Añadir al carrito».
2. «Pedir este par por WhatsApp».

Ambas acciones deben utilizar la variante de color, talla y cantidad seleccionadas.

El mensaje de WhatsApp debe incluir el modelo, color, referencia, talla EU, cantidad, precio unitario y subtotal.

### Descripción del producto

Se puede incorporar un apartado «Sobre este modelo» o «Descripción del modelo».

Mostrarlo únicamente cuando exista información real en los datos del producto.

### Reseñas

No implementar estrellas, puntuaciones ni reseñas ficticias.

Esta funcionalidad podrá evaluarse posteriormente cuando exista un sistema real de registro y verificación de opiniones.

---

## 7. ESTRUCTURA DE DATOS Y VARIANTES

El catálogo actual utiliza una estructura de productos que debe analizarse antes de realizar modificaciones.

Si se incorporan variantes de color:

- Cada variante tendrá su identificador.
- Cada variante podrá disponer de varias fotografías.
- Cada variante tendrá sus propias tallas disponibles y agotadas.
- Las imágenes y los colores deberán permanecer sincronizados.
- El carrito deberá identificar correctamente producto, color y talla.

Dos colores distintos del mismo modelo deben poder agregarse como líneas independientes al carrito.

Es importante mantener la compatibilidad con los productos existentes que todavía utilicen el formato anterior de una sola imagen, un solo color y una sola lista de tallas.

No realizar una migración masiva de productos sin autorización.

No inventar fotografías, precios, existencias, descripciones ni equivalencias de tallas.

---

## 8. IDIOMA Y CONTEXTO COMERCIAL

Todo el contenido visible de la página debe estar en español.

El público objetivo es colombiano.

Utilizar:

- Pesos colombianos (COP).
- Numeración de tallas EU.
- Expresiones naturales para clientes colombianos.
- Mensajes comerciales claros y profesionales.

No dejar textos, botones o secciones sin traducir.

No inventar condiciones comerciales, métodos de pago, políticas de devolución, disponibilidad ni tiempos de entrega.

---

## 9. CALIDAD Y OPTIMIZACIÓN DEL CÓDIGO

Priorizar:

- Código legible y mantenible.
- Estructura organizada.
- Eliminación de duplicaciones innecesarias.
- CSS sin reglas contradictorias.
- Selectores claros.
- JavaScript organizado y reutilizable.
- HTML semántico.
- Accesibilidad.
- Carga eficiente de imágenes.
- Buen rendimiento.
- Adaptación responsive.
- Compatibilidad con diferentes navegadores.

No reducir el número de líneas como objetivo principal.

No minificar el código fuente.

No eliminar código sin comprobar sus dependencias y su funcionamiento.

Optimizar significa mejorar la calidad, el rendimiento y la mantenibilidad, no simplemente escribir menos.

---

## 10. DISEÑO RESPONSIVE

La tienda debe ofrecer una experiencia excelente en:

- Computadores de escritorio.
- Portátiles.
- Tablets.
- Teléfonos móviles.

Comprobar:

- Distribución y proporciones.
- Tamaño y legibilidad de textos.
- Navegación.
- Galerías de productos.
- Selectores de color y tallas.
- Carrito.
- Modales.
- Botones y áreas táctiles.
- Ausencia de desbordamientos horizontales.

No considerar terminado un diseño únicamente porque se ve bien en escritorio.

---

## 11. METODOLOGÍA DE TRABAJO

El proyecto se desarrollará por etapas, con supervisión del usuario.

Antes de comenzar una tarea importante:

1. Analiza el código relacionado.
2. Comprende las dependencias.
3. Identifica los archivos que necesitan cambios.
4. Explica el alcance de la tarea.
5. Divide trabajos complejos en etapas pequeñas.
6. Presenta el plan cuando se requiera modificar varias partes del proyecto.

No comenzar modificaciones importantes sin la aprobación correspondiente.

Durante la implementación:

- Trabajar exclusivamente sobre el alcance aprobado.
- Evitar modificaciones ajenas a la tarea.
- No reemplazar archivos completos cuando un cambio puntual sea suficiente.
- No realizar cambios de arquitectura sin autorización.
- Evitar repetir análisis completos cuando el contexto existente sea suficiente.
- Aprovechar los resultados de las etapas anteriores.

Después de implementar:

- Revisar los cambios realizados.
- Ejecutar las pruebas disponibles.
- Comprobar que las funcionalidades continúan operativas.
- Revisar la experiencia en escritorio y celular.
- Informar qué se modificó.
- Indicar cualquier error pendiente o prueba que no se haya podido realizar.

Nunca afirmar que una prueba fue exitosa si no se ejecutó realmente.

---

## 12. GIT Y CONTROL DE VERSIONES

Antes de modificar el proyecto, comprobar el estado actual del repositorio.

Trabajar con Git para facilitar la recuperación de versiones anteriores.

No ejecutar automáticamente:

- Commits.
- Push.
- Merge.
- Eliminación de ramas.
- Operaciones destructivas.

Solicitar autorización antes de realizar estas operaciones.

Conservar los cambios existentes del usuario y no sobrescribir trabajo que todavía no haya sido guardado.

---

## 13. OBJETIVO FINAL

Construir una tienda online de zapatillas con:

- Identidad visual propia.
- Diseño profesional y diferenciador.
- Excelente experiencia de compra.
- Interfaz intuitiva.
- Interacciones fluidas.
- Diseño responsive.
- Catálogo organizado.
- Gestión correcta de variantes y tallas.
- Carrito funcional.
- Integración con WhatsApp.
- Código mantenible y optimizado.

**Principio fundamental: libertad creativa para diseñar, responsabilidad técnica para implementar y respeto por las funcionalidades existentes.**