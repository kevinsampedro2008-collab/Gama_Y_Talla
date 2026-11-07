// Etapa 13 · Verificación de la migración en seco.
//
// Alimenta a la TIENDA REAL con el JSON que devuelve la vista pública (mediante
// page.route, sin tocar ningún archivo) y comprueba que app.js calcula exactamente
// lo mismo que hoy: mismas claves, mismas variantes, mismos precios y tallas.
// Después comprueba que un carrito V3 guardado ANTES de la migración sigue
// reconociendo sus productos.
//
// Uso: node scripts/verificar-migracion.mjs [url]

import { chromium } from '@playwright/test';
import fs from 'node:fs';

const URL_TIENDA = process.argv[2] || 'http://127.0.0.1:8765/?intro=no';
const CLAVE_CARRITO = 'gama-talla-carrito-v3';

const hoy = JSON.parse(fs.readFileSync('supabase/local/catalogo-hoy.json', 'utf8'));
const migrado = fs.readFileSync('supabase/local/vista-publica.json', 'utf8');

let correctas = 0;
let fallos = 0;
const exigir = (prueba, ok, detalle = '') => {
  if (ok) { correctas += 1; console.log(`OK     ${prueba}`); }
  else { fallos += 1; console.log(`FALLA  ${prueba} ${detalle}`); }
};

const navegador = await chromium.launch();
const contexto = await navegador.newContext();
const pagina = await contexto.newPage();
const problemas = [];
pagina.on('pageerror', (e) => problemas.push(`EXCEPCIÓN: ${e.message}`));
pagina.on('console', (m) => { if (m.type() === 'error') problemas.push(`CONSOLA: ${m.text()}`); });

// La tienda cree leer su JSON de siempre; en realidad recibe la vista de Supabase.
await pagina.route('**/data/productos.json*', (ruta) =>
  ruta.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: migrado }));

// Carrito V3 guardado ANTES de la migración, con las claves antiguas.
const carritoPrevio = {
  version: 3,
  lineas: [
    { producto: hoy[0].clave, variante: hoy[0].variantes[0].id, talla: hoy[0].variantes[0].tallasDisponibles[0], cantidad: 2, precio: hoy[0].variantes[0].precio },
    { producto: hoy[5].clave, variante: hoy[5].variantes[0].id, talla: hoy[5].variantes[0].tallasDisponibles[0], cantidad: 1, precio: hoy[5].variantes[0].precio }
  ],
  pendientes: []
};
await pagina.addInitScript(
  ([clave, carrito]) => localStorage.setItem(clave, JSON.stringify(carrito)),
  [CLAVE_CARRITO, carritoPrevio]);

await pagina.goto(URL_TIENDA, { waitUntil: 'load' });
await pagina.waitForFunction("typeof estado !== 'undefined' && estado.catalogoListo === true", null, { timeout: 30000 });

const despues = await pagina.evaluate(() =>
  estado.productos.map((p) => ({
    clave: p.clave, id: p.id, nombre: p.nombre, marca: p.marca, categoria: p.categoria,
    descripcion: p.descripcion, segmento: p.segmento, destacado: p.destacado,
    nuevoIngreso: p.nuevoIngreso, precio: p.precio, precioAnterior: p.precioAnterior,
    variantes: p.variantes.map((v) => ({
      id: v.id, color: v.color, referencia: v.referencia, precio: v.precio,
      precioAnterior: v.precioAnterior, imagenes: v.imagenes,
      tallasDisponibles: v.tallasDisponibles, tallasAgotadas: v.tallasAgotadas
    }))
  })));

console.log('--- catálogo: registro por registro ---');
exigir('La tienda carga el catálogo migrado sin errores', problemas.length === 0, problemas.join(' | '));
exigir(`Mismo número de productos (${hoy.length})`, despues.length === hoy.length, `migrado=${despues.length}`);

const porClaveHoy = new Map(hoy.map((p) => [p.clave, p]));
const porClaveDespues = new Map(despues.map((p) => [p.clave, p]));

exigir('Todas las claves internas coinciden con las de hoy',
  hoy.every((p) => porClaveDespues.has(p.clave)),
  hoy.filter((p) => !porClaveDespues.has(p.clave)).map((p) => p.clave).join(', '));

exigir('No aparecen claves nuevas ni colisiones',
  despues.length === new Set(despues.map((p) => p.clave)).size &&
  despues.every((p) => porClaveHoy.has(p.clave)));

const diferencias = [];
for (const antes of hoy) {
  const ahora = porClaveDespues.get(antes.clave);
  if (!ahora) continue;
  const comparar = (campo, a, b) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) diferencias.push(`${antes.clave} · ${campo}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
  };
  comparar('nombre', antes.nombre, ahora.nombre);
  comparar('marca', antes.marca, ahora.marca);
  comparar('categoria', antes.categoria, ahora.categoria);
  comparar('destacado', antes.destacado, ahora.destacado);
  comparar('nuevoIngreso', antes.nuevoIngreso, ahora.nuevoIngreso);
  comparar('variantes.length', antes.variantes.length, ahora.variantes.length);
  antes.variantes.forEach((va, i) => {
    const vb = ahora.variantes[i];
    if (!vb) return;
    comparar(`variante[${i}].id`, va.id, vb.id);
    comparar(`variante[${i}].color`, va.color, vb.color);
    comparar(`variante[${i}].referencia`, va.referencia, vb.referencia);
    comparar(`variante[${i}].precio`, va.precio, vb.precio);
    comparar(`variante[${i}].precioAnterior`, va.precioAnterior, vb.precioAnterior);
    comparar(`variante[${i}].imagenes`, va.imagenes, vb.imagenes);
  });
}
exigir('Datos comerciales idénticos en los 28 registros', diferencias.length === 0,
  '\n       ' + diferencias.slice(0, 8).join('\n       '));

// Las tallas SÍ cambian a propósito: nacen POR REVISAR, así que ninguna es comprable aún.
const totalDisponibles = despues.reduce((s, p) => s + p.variantes.reduce((a, v) => a + v.tallasDisponibles.length, 0), 0);
exigir('Ninguna talla se presenta como disponible (todas POR REVISAR)', totalDisponibles === 0,
  `disponibles=${totalDisponibles}`);

console.log('--- compatibilidad con el carrito V3 ---');

// Lo que la MIGRACIÓN debe garantizar: que las claves y los identificadores de
// variante que usan los carritos guardados sigan resolviendo contra el catálogo
// migrado. Se comprueban los 28, no solo los del carrito de ejemplo.
const resolucion = await pagina.evaluate((claves) =>
  claves.map((c) => {
    const p = productoPorClave(c.clave);
    return { clave: c.clave, producto: Boolean(p),
             variante: Boolean(p && varianteDe(p, c.variante)) };
  }), hoy.map((p) => ({ clave: p.clave, variante: p.variantes[0].id })));

exigir('Las 28 claves antiguas resuelven contra el catálogo migrado',
  resolucion.every((r) => r.producto),
  resolucion.filter((r) => !r.producto).map((r) => r.clave).join(', '));
exigir('Los 28 identificadores de variante antiguos siguen resolviendo',
  resolucion.every((r) => r.variante),
  resolucion.filter((r) => !r.variante).map((r) => r.clave).join(', '));

const carrito = await pagina.evaluate(() =>
  JSON.parse(localStorage.getItem('gama-talla-carrito-v3') || 'null'));
exigir('El carrito guardado conserva la versión 3 sin cambios de estructura',
  carrito?.version === 3 && Array.isArray(carrito.lineas));

// CONSECUENCIA CONOCIDA, no un defecto del esquema: la tienda de hoy no entiende
// POR REVISAR, así que retira esas líneas. La etapa 14 debe corregirlo.
const enMemoria = await pagina.evaluate(() => estado.carrito.length);
exigir('Documentado: la tienda SIN modificar vacía el carrito si todo está POR REVISAR',
  enMemoria === 0, `lineas=${enMemoria}`);

// Y con una talla realmente DISPONIBLE, la línea sobrevive sin tocar nada más.
if (fs.existsSync('supabase/local/vista-publica-confirmada.json')) {
  const confirmada = fs.readFileSync('supabase/local/vista-publica-confirmada.json', 'utf8');
  const lista = JSON.parse(confirmada).productos;
  const objetivo = lista.find((p) => p.variantes[0].tallasDisponibles.length > 0);
  const pagina2 = await contexto.newPage();
  await pagina2.route('**/data/productos.json*', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: confirmada }));
  await pagina2.addInitScript(([clave, carrito]) =>
    localStorage.setItem(clave, JSON.stringify(carrito)), [CLAVE_CARRITO, {
      version: 3,
      lineas: [{ producto: objetivo.id, variante: objetivo.variantes[0].id,
                 talla: objetivo.variantes[0].tallasDisponibles[0], cantidad: 2,
                 precio: objetivo.variantes[0].precio }],
      pendientes: []
    }]);
  await pagina2.goto(URL_TIENDA, { waitUntil: 'load' });
  await pagina2.waitForFunction("typeof estado !== 'undefined' && estado.catalogoListo === true", null, { timeout: 30000 });
  const vivo = await pagina2.evaluate(() => ({
    lineas: estado.carrito.length,
    insignia: document.querySelector('#insignia-carrito')?.textContent?.trim(),
    linea: estado.carrito[0] || null
  }));
  exigir('Con una talla DISPONIBLE, la línea guardada sobrevive a la migración',
    vivo.lineas === 1 && vivo.linea?.cantidad === 2, JSON.stringify(vivo));
  exigir('Y el contador del carrito la cuenta', vivo.insignia === '2', `insignia=${vivo.insignia}`);
  await pagina2.close();
}

await contexto.close();
await navegador.close();

console.log(`\n${correctas} correctas, ${fallos} fallidas`);
process.exit(fallos ? 1 : 0);
