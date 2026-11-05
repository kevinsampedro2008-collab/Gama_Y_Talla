
---
name: playwright
description: Ejecuta y depura pruebas end-to-end con Playwright en Gama & Talla. Úsala para verificar navegadores, diseño responsive, interacciones, capturas visuales y regresiones.
---

# Playwright — Gama & Talla

## 1. Objetivo

Utilizar Playwright Test para ejecutar pruebas automatizadas del sitio Gama & Talla, comprobar su funcionamiento real en navegadores y detectar regresiones visuales y funcionales.

Esta skill complementa las skills de diseño del proyecto. No sustituye apple-design, emil-design-eng ni design-taste-frontend.

## 2. Antes de comenzar

1. Lee CLAUDE.md completo.
2. Comprueba que estás trabajando en:
   C:\Users\kevin\Documents\Yeny_Oficial
3. Examina package.json y playwright.config para conocer la instalación y configuración existentes.
4. No vuelvas a ejecutar npm init playwright si Playwright ya está instalado.
5. Comprueba la versión con npx playwright --version.
6. Comprueba qué pruebas existen antes de crear otras.
7. No sobrescribas configuraciones, pruebas ni dependencias existentes sin necesidad.

## 3. Arquitectura del proyecto

Gama & Talla utiliza:

- HTML5.
- CSS3.
- JavaScript vanilla.
- JSON para el catálogo.
- LocalStorage para el carrito.
- Three.js 0.165.0 local para la bienvenida 3D.

No introducir frameworks ni dependencias innecesarias.

Las pruebas automatizadas de Playwright deben organizarse en tests/, respetando siempre el testDir configurado.

No confundir tests/ con data/pruebas/, que contiene productos ficticios para comprobar el catálogo.

## 4. Servidor local

El servidor habitual del proyecto es:

python -m http.server 8765 --bind 127.0.0.1

URL principal:
http://127.0.0.1:8765/

URLs de pruebas:
http://127.0.0.1:8765/?intro=no

http://127.0.0.1:8765/?datos-prueba&intro=no

Antes de iniciar el servidor, comprueba si ya está activo.

No iniciar servidores duplicados ni cerrar procesos ajenos a la tarea.

La bienvenida 3D debe probarse por separado, sin utilizar intro=no cuando se quiera verificar su comportamiento.

## 5. Navegadores

Utilizar los proyectos configurados en Playwright:

- Chromium.
- Firefox.
- WebKit.

Cuando sea pertinente, ejecutar las pruebas en los tres motores.

No afirmar que se ha probado Safari real por haber utilizado WebKit.

No afirmar que se han probado dispositivos físicos por utilizar emulación móvil.

## 6. Diseño responsive

Las resoluciones de referencia del proyecto son:

- 360 px: celular.
- 390 px: celular.
- 768 px: tableta.
- 1024 px: escritorio pequeño.
- 1440 px: escritorio.

Comprobar, cuando corresponda:

- Ausencia de desbordamiento horizontal.
- Alineación de elementos.
- Legibilidad de textos.
- Tamaños de áreas táctiles.
- Posición de botones y barras fijas.
- Galería y detalle del producto.
- Funcionamiento de menús y diálogos.

No limitarse a comprobar que la página carga: verificar también su presentación visual.

## 7. Interacciones que deben probarse

Según el alcance de cada tarea, comprobar:

- Búsqueda y filtros del catálogo.
- Selección de tallas y variantes.
- Galería de imágenes.
- Apertura y cierre del detalle.
- Guía de tallas.
- Añadir productos al carrito.
- Cantidades y límites.
- Persistencia del carrito.
- Sincronización entre pestañas.
- Mensajes de WhatsApp.
- Estados hover, focus y active.
- Accesibilidad básica mediante teclado.

Respetar las reglas existentes del carrito V3 y el modo de pruebas.

No modificar los datos reales para fabricar escenarios de prueba.

## 8. Buenas prácticas de Playwright

- Preferir getByRole, getByLabel y getByText para localizar elementos.
- Utilizar expect con aserciones que esperen los estados de la interfaz.
- Evitar esperas fijas innecesarias mediante waitForTimeout.
- Usar esperas explícitas cuando exista una condición real de carga.
- Evitar selectores frágiles y dependientes de la estructura interna.
- Aislar los datos y estados de cada prueba.
- Comprobar los errores de consola y solicitudes de red cuando sea relevante.
- Utilizar capturas de pantalla para comparar resultados visuales.
- Utilizar trazas cuando sea necesario investigar fallos.

No modificar el código de producción solamente para conseguir que una prueba pase.

## 9. Comandos habituales

Consultar la versión:

npx playwright --version

Ejecutar todas las pruebas:

npx playwright test

Ejecutar un navegador:

npx playwright test --project=chromium

Ejecutar Firefox:

npx playwright test --project=firefox

Ejecutar WebKit:

npx playwright test --project=webkit

Ejecutar una prueba concreta:

npx playwright test ruta-del-archivo

Modo visual interactivo:

npx playwright test --ui

Ejecutar con navegador visible:

npx playwright test --headed

Abrir informe:

npx playwright show-report

Antes de utilizar un comando, comprobar que coincide con la configuración existente.

## 10. Capturas e informes

Cuando una tarea implique revisión visual:

- Tomar capturas de escritorio y celular.
- Identificar claramente la resolución y el navegador.
- Comparar antes y después cuando existan capturas de referencia.
- Guardar los resultados en una ubicación temporal o de pruebas apropiada.
- No acumular capturas innecesarias dentro del proyecto.

Al finalizar, informar:

- Pruebas ejecutadas.
- Pruebas aprobadas.
- Pruebas fallidas.
- Navegadores utilizados.
- Resoluciones comprobadas.
- Errores de consola o red.
- Capturas generadas.
- Limitaciones de las pruebas.

Nunca inventar resultados ni presentar pruebas no ejecutadas como aprobadas.

## 11. Protección de Gama & Talla

Archivos y recursos protegidos:

- assets/js/catalog-intro.js
- assets/js/catalog-intro-escena.js
- assets/css/catalog-intro.css
- assets/images/models/
- assets/vendor/
- assets/images/intro/
- Fotografías originales.
- data/productos.json

No modificar estos archivos durante una tarea de pruebas.

SHA-1 de referencia de data/productos.json:

489f210beb98def38966095190f3cfd6015033ee

No modificar el catálogo real sin autorización.

No realizar commits ni pushes.

No utilizar git reset, git restore, git clean ni comandos destructivos.

No eliminar respaldos ni cambios anteriores.

Antes de modificar archivos de producción, crear un respaldo nuevo e independiente según las instrucciones de CLAUDE.md.

## 12. Condiciones de finalización

Trabajar únicamente dentro del alcance autorizado.

Si el usuario solicita una revisión, no modificar archivos.

Si solicita una implementación, realizar cambios localizados y ejecutar las pruebas pertinentes.

Al terminar cada etapa:

1. Ejecutar las pruebas correspondientes.
2. Revisar las posibles regresiones.
3. Generar capturas cuando sean necesarias.
4. Presentar un informe completo en español.
5. Indicar cualquier comprobación pendiente.
6. Detenerse y esperar la revisión del usuario.

No continuar con otra etapa sin autorización.
