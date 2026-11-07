// Etapa 13 · Verificación de la migración en seco.
// Etapa 14f.2 · El carrito se comprueba con el comportamiento aprobado en la etapa 14.
//
// Alimenta a la TIENDA REAL con el JSON que devuelve la vista pública (mediante
// page.route, sin tocar ningún archivo) y comprueba que app.js calcula exactamente
// lo mismo que hoy: mismas claves, mismas variantes, mismos precios y tallas.
// Después comprueba que un carrito V3 guardado ANTES de la migración sigue
// reconociendo sus productos y que se comporta como exige la etapa 14:
//   · una talla POR REVISAR permanece, con producto, variante, talla y cantidad,
//     en memoria y en LocalStorage (esquema V3), y se puede consultar por WhatsApp,
//     pero no enviar como pedido confirmado;
//   · una talla AGOTADA se retira;
//   · un fallo de conexión no retira ninguna línea.
// Cada escenario usa su propio contexto del navegador (su propio LocalStorage) y un
// catálogo derivado en memoria de la vista migrada. No escribe ningún archivo.
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

// ---------------------------------------------------------------------------
// Comportamiento del carrito aprobado en la etapa 14 (sustituye a la expectativa de
// la etapa 13, según la cual la tienda vaciaba el carrito si todo estaba POR REVISAR).
// ---------------------------------------------------------------------------

// Catálogo derivado de la vista migrada con el estado de algunas tallas cambiado. Se
// cambian el detalle «tallas» (lo que lee app.js) y las tres listas, para que sean coherentes.
const conEstados = (texto, cambios) => {
  const datos = JSON.parse(texto);
  for (const { producto, variante, talla, estado: nuevo } of cambios) {
    const v = datos.productos.find((p) => p.id === producto)?.variantes.find((x) => x.id === variante);
    if (!v || !v.tallas.some((t) => t.talla === talla)) throw new Error(`no existe ${producto} · ${variante} · ${talla}`);
    v.tallas = v.tallas.map((t) => (t.talla === talla ? { ...t, estado: nuevo } : t));
    const de = (e) => v.tallas.filter((t) => t.estado === e).map((t) => t.talla);
    v.tallasDisponibles = de('DISPONIBLE');
    v.tallasAgotadas = de('AGOTADO');
    v.tallasPorRevisar = de('POR_REVISAR');
  }
  return JSON.stringify(datos);
};

// Abre la tienda en un contexto nuevo. El carrito se siembra solo si no existe, para que
// una recarga demuestre que lo que queda es lo que la tienda guardó.
async function abrirTienda({ catalogo, carritoGuardado, configuracion = null }) {
  const ctx = await navegador.newContext();
  const p = await ctx.newPage();
  const excepciones = [];
  p.on('pageerror', (e) => excepciones.push(e.message));
  await p.route('**/data/productos.json*', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: catalogo }));
  if (configuracion) {
    // La «vista de Supabase» no responde: simula un fallo de conexión.
    await p.route(`${configuracion.catalogoUrl}*`, (r) => r.abort('connectionrefused'));
    await p.addInitScript((c) => { window.GAMA_TALLA_CONFIG = c; }, configuracion);
  }
  await p.addInitScript(([clave, texto]) => {
    if (localStorage.getItem(clave) === null) localStorage.setItem(clave, texto);
  }, [CLAVE_CARRITO, JSON.stringify(carritoGuardado)]);
  await p.goto(URL_TIENDA, { waitUntil: 'load' });
  await p.waitForFunction("typeof estado !== 'undefined' && estado.catalogoListo === true", null, { timeout: 30000 });
  return { ctx, p, excepciones };
}

const leerEstado = (p) => p.evaluate((clave) => ({
  memoria: estado.carrito.map(({ producto, variante, talla, cantidad }) => ({ producto, variante, talla, cantidad })),
  guardado: localStorage.getItem(clave),
  respaldo: estado.respaldo?.motivo || null,
  comprables: lineasComprables().map((l) => `${l.producto.clave}|${l.talla}`),
  porRevisar: lineasPorRevisar().map((l) => `${l.producto.clave}|${l.talla}`),
  insignia: document.querySelector('#insignia-carrito')?.textContent?.trim(),
  aviso: estado.avisoCarrito || ''
}), CLAVE_CARRITO);

// Abre el carrito como lo haría la persona (refresca el catálogo y lo valida) y lee el pie.
const leerCarritoAbierto = async (p) => {
  await p.evaluate(() => abrirCarrito(document.querySelector('#boton-carrito')));
  return p.evaluate(() => {
    const texto = (a) => (a?.getAttribute('href') ? new URL(a.href).searchParams.get('text') : null);
    const enviar = document.querySelector('#carrito-enviar');
    const consultar = document.querySelector('#carrito-consultar');
    return {
      lineas: [...document.querySelectorAll('#carrito-cuerpo li.linea')].map((li) => ({ clave: li.dataset.clave, porRevisar: li.dataset.estado === 'POR_REVISAR' })),
      enviar: { oculto: enviar.hidden, ariaDisabled: enviar.getAttribute('aria-disabled'), texto: texto(enviar) },
      copiarOculto: document.querySelector('#carrito-copiar')?.hidden ?? null,
      consultar: { oculto: consultar ? consultar.hidden : true, texto: texto(consultar) }
    };
  });
};

const esencial = (lineas) => lineas.map(({ producto, variante, talla, cantidad }) => ({ producto, variante, talla, cantidad }));
const mayusculas = (nombre) => nombre.toLocaleUpperCase('es-CO');
const escaparRegExp = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// El bloque de un producto en el mensaje lleva su talla y su cantidad, en ese orden.
const bloque = (mensaje, nombre, talla, cantidad) => new RegExp(
  `${escaparRegExp(mayusculas(nombre))}\\n(?:\\* [^\\n]*\\n)*?\\* Talla EU: ${escaparRegExp(talla)}\\n\\* Cantidad: ${cantidad}\\n`).test(mensaje || '');

// Líneas de trabajo: A y B son las del carrito guardado antes de la migración; C, otra más.
const lineaA = carritoPrevio.lineas[0];
const lineaB = carritoPrevio.lineas[1];
const prodC = hoy[1];
const lineaC = { producto: prodC.clave, variante: prodC.variantes[0].id, talla: prodC.variantes[0].tallasDisponibles[0], cantidad: 1, precio: prodC.variantes[0].precio };
const nombre = (linea) => hoy.find((p) => p.clave === linea.producto).nombre;
exigir('Escenarios con productos de nombre distinto (para leer los mensajes sin ambigüedad)',
  new Set([lineaA, lineaB, lineaC].map(nombre)).size === 3, [lineaA, lineaB, lineaC].map(nombre).join(' / '));

// ---- A. Todo POR REVISAR (la vista migrada tal cual) -------------------------------
{
  const { ctx, p, excepciones } = await abrirTienda({ catalogo: migrado, carritoGuardado: carritoPrevio });
  const a = await leerEstado(p);
  exigir('POR REVISAR: las 2 líneas siguen en memoria con producto, variante, talla y cantidad',
    JSON.stringify(a.memoria) === JSON.stringify(esencial(carritoPrevio.lineas)), JSON.stringify(a.memoria));
  exigir('POR REVISAR: ninguna es comprable y las 2 quedan para consultar',
    a.comprables.length === 0 && a.porRevisar.length === 2, JSON.stringify(a));
  exigir('POR REVISAR: LocalStorage conserva el carrito exactamente como estaba', a.guardado === JSON.stringify(carritoPrevio), a.guardado);
  const guardado = JSON.parse(a.guardado || 'null');
  exigir('POR REVISAR: esquema V3 intacto (version 3, lineas, pendientes y campos de cada línea)',
    guardado?.version === 3 && Array.isArray(guardado.lineas) && Array.isArray(guardado.pendientes) && guardado.lineas.length === 2
    && guardado.lineas.every((l) => JSON.stringify(Object.keys(l)) === '["producto","variante","talla","cantidad","precio"]'));
  exigir('POR REVISAR: la insignia cuenta sus 3 unidades', a.insignia === '3', `insignia=${a.insignia}`);
  exigir('POR REVISAR: sin aviso de retirada', a.aviso === '', a.aviso);

  const ui = await leerCarritoAbierto(p);
  exigir('POR REVISAR: el carrito muestra las 2 líneas, marcadas por revisar',
    ui.lineas.length === 2 && ui.lineas.every((l) => l.porRevisar), JSON.stringify(ui.lineas));
  exigir('POR REVISAR: no se puede enviar como pedido confirmado (enviar y copiar ocultos, aria-disabled, sin enlace)',
    ui.enviar.oculto === true && ui.enviar.ariaDisabled === 'true' && ui.enviar.texto === null && ui.copiarOculto === true, JSON.stringify(ui.enviar));
  exigir('POR REVISAR: se puede consultar por WhatsApp con producto, talla y cantidad de cada línea',
    ui.consultar.oculto === false && /CONSULTA DE DISPONIBILIDAD/.test(ui.consultar.texto || '') && !/NUEVO PEDIDO/.test(ui.consultar.texto || '')
    && bloque(ui.consultar.texto, nombre(lineaA), lineaA.talla, lineaA.cantidad) && bloque(ui.consultar.texto, nombre(lineaB), lineaB.talla, lineaB.cantidad),
    (ui.consultar.texto || '(sin enlace)').slice(0, 200));
  const trasAbrir = await leerEstado(p);
  exigir('POR REVISAR: abrir el carrito (refresca y valida) no cambia LocalStorage', trasAbrir.guardado === JSON.stringify(carritoPrevio), trasAbrir.guardado);

  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction("typeof estado !== 'undefined' && estado.catalogoListo === true", null, { timeout: 30000 });
  const recargado = await leerEstado(p);
  exigir('POR REVISAR: tras recargar la página, las 2 líneas persisten igual',
    JSON.stringify(recargado.memoria) === JSON.stringify(esencial(carritoPrevio.lineas)) && recargado.guardado === JSON.stringify(carritoPrevio),
    JSON.stringify(recargado.memoria));
  exigir('POR REVISAR: sin excepciones en la página', excepciones.length === 0, excepciones.join(' | '));
  await ctx.close();
}

// ---- B. Mezcla: A DISPONIBLE, C AGOTADA, B POR REVISAR -------------------------------
{
  const catalogo = conEstados(migrado, [
    { producto: lineaA.producto, variante: lineaA.variante, talla: lineaA.talla, estado: 'DISPONIBLE' },
    { producto: lineaC.producto, variante: lineaC.variante, talla: lineaC.talla, estado: 'AGOTADO' }
  ]);
  const guardadoB = { version: 3, lineas: [lineaA, lineaC, lineaB], pendientes: [] };
  const { ctx, p, excepciones } = await abrirTienda({ catalogo, carritoGuardado: guardadoB });
  const b = await leerEstado(p);
  exigir('AGOTADA: se retira solo la línea agotada; la disponible y la pendiente siguen en memoria',
    JSON.stringify(b.memoria) === JSON.stringify(esencial([lineaA, lineaB])), JSON.stringify(b.memoria));
  const guardado = JSON.parse(b.guardado || 'null');
  exigir('AGOTADA: LocalStorage V3 guarda las 2 que quedan, idénticas y en su orden',
    guardado?.version === 3 && JSON.stringify(guardado.lineas) === JSON.stringify([lineaA, lineaB]) && JSON.stringify(guardado.pendientes) === '[]',
    b.guardado);
  exigir('AGOTADA: queda un aviso que nombra lo retirado', /agotados/.test(b.aviso) && b.aviso.includes(nombre(lineaC)), b.aviso);
  exigir('Mezcla: la disponible es comprable y la pendiente queda para consultar',
    JSON.stringify(b.comprables) === JSON.stringify([`${lineaA.producto}|${lineaA.talla}`])
    && JSON.stringify(b.porRevisar) === JSON.stringify([`${lineaB.producto}|${lineaB.talla}`]), JSON.stringify(b));
  const ui = await leerCarritoAbierto(p);
  exigir('Mezcla: el pedido confirmado lleva solo la línea DISPONIBLE',
    ui.enviar.oculto === false && ui.enviar.ariaDisabled === 'false' && /NUEVO PEDIDO/.test(ui.enviar.texto || '')
    && bloque(ui.enviar.texto, nombre(lineaA), lineaA.talla, lineaA.cantidad)
    && !(ui.enviar.texto || '').includes(mayusculas(nombre(lineaB))) && !(ui.enviar.texto || '').includes(mayusculas(nombre(lineaC))),
    (ui.enviar.texto || '(sin enlace)').slice(0, 200));
  exigir('Mezcla: la consulta lleva solo la línea POR REVISAR',
    ui.consultar.oculto === false && bloque(ui.consultar.texto, nombre(lineaB), lineaB.talla, lineaB.cantidad)
    && !(ui.consultar.texto || '').includes(mayusculas(nombre(lineaA))), (ui.consultar.texto || '(sin enlace)').slice(0, 200));
  exigir('Mezcla: sin excepciones en la página', excepciones.length === 0, excepciones.join(' | '));
  await ctx.close();
}

// ---- C. Fallo de conexión: la fuente de Supabase no responde --------------------------
// El JSON de respaldo dice incluso que la talla A está agotada: un fallo de conexión no es
// un agotado, así que no se retira nada y todo queda para consultar.
{
  const catalogo = conEstados(migrado, [
    { producto: lineaA.producto, variante: lineaA.variante, talla: lineaA.talla, estado: 'AGOTADO' },
    { producto: lineaB.producto, variante: lineaB.variante, talla: lineaB.talla, estado: 'DISPONIBLE' }
  ]);
  const configuracion = { catalogoUrl: 'http://127.0.0.1:9/rest/v1/catalogo_publico', catalogoClave: 'sb_publishable_verificacion_local' };
  const { ctx, p, excepciones } = await abrirTienda({ catalogo, carritoGuardado: carritoPrevio, configuracion });
  const c = await leerEstado(p);
  exigir('Sin conexión: la tienda entra en modo consulta con el JSON de respaldo', c.respaldo === 'json', `respaldo=${c.respaldo}`);
  exigir('Sin conexión: no se retira ninguna línea, ni la que el respaldo da por agotada',
    JSON.stringify(c.memoria) === JSON.stringify(esencial(carritoPrevio.lineas)) && c.guardado === JSON.stringify(carritoPrevio) && c.aviso === '',
    JSON.stringify(c.memoria));
  exigir('Sin conexión: nada se da por confirmado; todo queda para consultar', c.comprables.length === 0 && c.porRevisar.length === 2, JSON.stringify(c));
  const ui = await leerCarritoAbierto(p);
  const tras = await leerEstado(p);
  exigir('Sin conexión: abrir el carrito reintenta, sigue fallando y no borra nada',
    ui.lineas.length === 2 && ui.enviar.oculto === true && tras.guardado === JSON.stringify(carritoPrevio), JSON.stringify(ui.lineas));
  exigir('Sin conexión: sin excepciones en la página', excepciones.length === 0, excepciones.join(' | '));
  await ctx.close();
}

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
