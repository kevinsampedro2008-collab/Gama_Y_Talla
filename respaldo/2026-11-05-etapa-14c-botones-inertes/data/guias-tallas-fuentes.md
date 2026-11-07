# Guías de tallas de Gama & Talla: origen de los datos

Este documento explica de dónde sale cada equivalencia de `data/guias-tallas.json` y cómo actualizarla. Última consulta de todas las fuentes: **2026-11-03**.

Regla base: **ninguna talla se calcula**. Una fila solo existe si una fuente la publica, y dos tablas solo se relacionan por un valor que ambas publican.

## Resultado por marca

| Marca | Registros | Segmentos | Nivel | Fuente de COL | Fuente de EU |
|---|---|---|---|---|---|
| Le Coq Sportif | 2 | Hombre, mujer | Oficial de marca | Le Coq Sportif Colombia | La misma |
| Adidas | 8 | Hombre, mujer | Oficial de marca | adidas Colombia | La misma, confirmada en soporte oficial |
| Nike | 7 | Hombre, mujer | Oficial por correspondencia | Nike Colombia | Nike Global, por talla US |
| Jordan | 6 | Hombre, mujer | Oficial por correspondencia | Nike Colombia, ficha de Air Jordan | Nike Global, por talla US |
| New Balance | 4 | Hombre, mujer | Sin equivalencia confirmada | Ninguna | New Balance Colombia |
| `CAMBIARRRRRRRRRRRRRRRR IMAGEN 18` | 1 | Ninguno | Sin clasificar | Ninguna | Ninguna |

**Niveles**

- **Oficial de marca:** la propia marca publica COL y EU.
- **Oficial por correspondencia:** se cruzan tablas oficiales de la misma marca mediante un valor que ambas publican.
- **Referencia comercial verificada:** fuentes colombianas independientes coinciden, sin tabla de la marca. Hoy ninguna marca está en este nivel.
- **Sin equivalencia confirmada:** no hay pruebas suficientes para asignar una talla colombiana.

## El catálogo no indica segmento

`data/productos.json` no dice si un producto es de hombre, mujer o unisex. Las tablas difieren entre segmentos (en Le Coq Sportif, EU 39 es COL 37 en hombre y COL 38 en mujer), así que **no se supone ninguno**: el cliente elige la tabla.

Si un producto incluye en el futuro el campo `"segmento": "hombre"` o `"mujer"`, esa tabla queda fija y el selector desaparece.

El registro `CAMBIARRRRRRRRRRRRRRRR IMAGEN 18` tiene una marca provisional. Es un Air Force 1 '07 con el id GT-002, igual que el de Nike, pero no se le asigna la guía de Nike por suposición: hay que corregir su marca en el catálogo.

## Marca por marca

### Nike

- **COL y largo del pie:** [hombre](https://www.nike.com.co/guia-tallas/calzado-de-hombre) y [mujer](https://www.nike.com.co/guia-tallas/calzado-de-mujer) de Nike Colombia. Estas tablas **no tienen columna EU**.
- **EU:** [hombre](https://www.nike.com/size-fit/mens-footwear) y [mujer](https://www.nike.com/size-fit/womens-footwear) de Nike Global.
- **Método:** se cruzan por talla US de hombre o de mujer, según la tabla.
- **Centímetros:** Nike Colombia los rotula «Largo del pie (cm)» y explica cómo medirlo, por eso se muestran como pie.
- **Límites:** en hombre no hay COL por debajo de US 7 (EU 40). En mujer se usa la tabla de tenis, no la de guayos, que es distinta.

### Jordan

- **COL y largo:** el modal «Guía de tallas» de las fichas de Nike Colombia: [hombre](https://www.nike.com.co/air-jordan-1-mid-tenis-hombre-dq8426-004-tf6/p) y [mujer](https://www.nike.com.co/air-jordan-1-mid-tenis-mujer-bq6472-603-tf6/p). Es una imagen, transcrita a mano.
- **EU:** Nike Global, por talla US.
- **Por qué es la tabla correcta:** Jordan se vende en Colombia a través de Nike y esas fichas abren esta tabla. No se encontró una guía propia de Jordan.

### Adidas

- **COL, US y FR:** [guía de calzado de adidas Colombia](https://www.adidas.co/on/demandware.store/Sites-adidas-CO-Site/es_CO/Page-Include?cid=size-chart-size-shoes), con columnas Medida del pie, US hombre, CO hombre, US mujer, CO mujer y FR.
- **Cómo se leyó:** adidas.co responde 403 a los navegadores automatizados y no se intentó eludirlo. Todas las filas se leyeron a través del índice del buscador, que muestra la misma tabla en esa página y en `adidas.com/ec/es` y `adidas.com/cr/es`.
- **Confirmación directa:** EU, US y cm coinciden en el [soporte oficial de adidas](https://support.dtb.adidas.com/static-content/size-charts/en_GB/footwear/size-shoes.html), abierto directamente.
- **Contraste de COL:** coincide en las 17 filas de hombre y las 17 de mujer de [Running Balboa](https://runningbalboa.com.co/pages/guia-de-tallas-calzado), y en las 9 filas de hombre de [Falabella](https://www.falabella.com.co/static/RDF/site/minisitios/tabla_tallas/2023/Tabla_Tallas_Adidas_Hombre.html).
- **Particularidad:** adidas numera en tercios. EU 37, 39, 41, 43 y 45 **no existen** en su tabla, y una talla así no se asigna a la fila vecina.
- **Filas sin COL:** en mujer, los pies de 28.4 y 28.8 cm no tienen CO en la tabla oficial.

### Le Coq Sportif

- **EUR, US, COL y CMS:** guías en imagen de las fichas de lecoqsportif.com.co: [hombre](https://cdn.shopify.com/s/files/1/0632/9450/5120/files/GUIA_DE_TALLAS_HOMBRE.png) y [mujer](https://cdn.shopify.com/s/files/1/0632/9450/5120/files/GUIA_DE_TALLAS_MUJER.png).
- **EUR, US y COL:** además, en el texto de cada variante de su [catálogo](https://lecoqsportif.com.co/collections/calzado-deportivo), por ejemplo «39 EUR / 6.5 US / 37 COL». Las tallas 42.5, 44.5 (hombre) y 38.5 (mujer) solo aparecen ahí.
- **Centímetros:** la columna se llama solo «CMS». No aclara si es pie, plantilla o zapato, así que **no aparece en la ficha** y en la guía completa conserva su nombre, con esa advertencia.
- **Sin confirmar:** «LCS Retro Classic» no aparece con ese nombre en el catálogo de Le Coq Sportif Colombia, y no pudo comprobarse su segmento.

### New Balance

- **EU, US y largo:** [hombre](https://newbalance.com.co/pages/guia-de-tallas-zapatos-de-hombre) y [mujer](https://newbalance.com.co/pages/guia-de-tallas-zapatos-de-mujer) de New Balance Colombia. **No publica COL**, y su catálogo vende en talla US.
- **Centímetros:** se muestran como «Largo (cm)», con el nombre que usa la marca, porque su tabla no precisa si es el pie.
- **Conclusión tras agotar la búsqueda: sin equivalencia COL confirmada.**

| Fuente revisada | Qué aporta | Por qué no sirve para COL |
|---|---|---|
| New Balance Colombia: guías y catálogo | US, UK, EU, largo | No publica COL |
| newbalance.com: guía y PDF de medición | Desconocido | Responde 403 a la lectura automatizada: no se pudo comprobar su contenido |
| [Sportline Colombia](https://www.sportline.com.co/guia-de-tallas) | US, cm, EUR, UK | Abierta directamente. Sus tablas de New Balance no tienen COL (las únicas columnas COL de la página son de niños de otra marca) y no coinciden entre sí |
| [Running Balboa](https://runningbalboa.com.co/pages/tallas-calzado-new-balance) | US, UK, EU, cm | Abierta directamente. La columna CO solo aparece en sus tablas de adidas |
| Falabella | Tablas por marca | No se encontró tabla de New Balance |
| Dafiti Colombia | COL, cm y US en fichas | Solo vista en el índice del buscador; la misma fila aparece en Fila y Reebok, así que parece genérica y no de la marca |
| Revendedores (zshopp y similares) | COL | Sin garantía de ser canal reconocido; no se tomaron como fuente |

## Reglamento Técnico Andino

La [Resolución 2107 de 2019](https://normograma.dian.gov.co/dian/compilacion/docs/resolucion_sgcandina_rsg2107.htm), numeral 5.2.3, obliga a expresar la talla en la etiqueta en el **sistema continental europeo o punto francés (EUR)**, y permite añadir Mondopoint, US o UK. **No define una talla colombiana ni una conversión**, de modo que no sirve como fuente de COL. La página de MinCIT indicada como punto de partida respondió «URL Denegada»; el texto se leyó en el normograma de la DIAN.

## Contradicciones encontradas

| Dónde | Qué ocurre | Decisión |
|---|---|---|
| Nike Colombia | El par US hombre 7 / US mujer 8.5 figura con 25 cm en la tabla de hombre y 25.5 cm en la de mujer | Cada tabla conserva su valor |
| Nike Colombia | La página de mujer termina en US 10 (COL 40); el modal de Jordan llega a US 12 (COL 42) | Cada marca solo usa las filas de su fuente |
| Nike Colombia | Avisa que la talla en cm de cajas y etiquetas es diferente al largo del pie | Se incluye en sus observaciones |
| Nike Global | «CM / JP» y «Foot Length» son filas distintas (US 7: 25 cm y 9 11/16 in, unos 24.6 cm) | Se usa «Largo del pie» de Nike Colombia |
| New Balance Colombia | EU 40 mide 25 cm en hombre y 25.5 cm en mujer; EU 38 es US hombre 5.5 en una tabla y equivale a US hombre 6 en la otra | Tablas separadas, sin unificar |
| Falabella y adidas | COL coincide; los cm difieren un poco (24.5 frente a 24.6) | Prevalece la tabla de adidas |
| Sportline, tablas de New Balance | US hombre 7 es 25.5 cm y EUR 40 en una tabla, y 25 cm y EUR 37.5 en otra | Sportline no se usa |
| Sportline y New Balance | Sportline da US 7 = 25.5 cm = EUR 40; New Balance, US 7 = 25 cm = EU 40 | Prevalece New Balance |
| Entre marcas | EU 42 es COL 39.5 en Nike hombre, 39.5 en adidas hombre y 40 en Le Coq Sportif hombre | **No existe una conversión común** |
| Resumen de un buscador | Afirmó que «38 colombiana = EU 38» en New Balance | Inferencia sin fuente, descartada |

## Marcas fuera del catálogo actual

ASICS y Vans no están en `data/productos.json`, así que no tienen guía en los datos. Quedan pendientes para cuando entren en el inventario:

- **[ASICS Colombia](https://www.asics.com.co/):** la portada abre, pero no enlaza una guía de tallas.
- **[Vans Colombia](https://www.vans.com.co/pages/guia-de-talla-vans):** publica tablas, y las de calzado usan US y CMS en lo que se revisó. No se extrajeron por completo.

## Cómo actualizar

1. Comprueba la fuente y corrige `tests/etapa11/tablas-de-origen.js`, que es su transcripción literal.
2. Corrige `data/guias-tallas.json`. Cada fila lleva `nivel` y `fuentes`.
3. Si cambian el método o una contradicción, actualiza este documento.
4. Ejecuta las pruebas con el servidor local activo:
   - `npx playwright test tests/etapa11/integridad.spec.js --project=chromium`: datos contra tablas de origen.
   - `npx playwright test tests/etapa11/fuentes-en-vivo.spec.js --project=chromium`: tablas de origen contra las páginas reales y enlaces rotos.

**Para una marca nueva:** añádela con sus segmentos. Si no tiene COL verificable, usa `col: null` y el nivel `SIN_EQUIVALENCIA_CONFIRMADA`. No sumes ni restes un valor fijo ni interpoles filas.
