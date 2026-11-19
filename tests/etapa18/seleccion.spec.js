// @ts-check
/* Etapa 18 · Selección de tallas de varios modelos y colores, y acciones sobre toda la selección.
 *
 * SOLO contra el stack local desechable de Supabase y el sitio en 127.0.0.1:8765. Catálogo FICTICIO
 * (marca «MARCA SELECCION»: «SAMBA SEL» con un color y «CAMPUS SEL» con NEGRO y BEIGE, ambos con la
 * talla 40) que se crea antes de cada prueba y se borra al terminar.
 *
 *   npx playwright test tests/etapa18/seleccion.spec.js --workers=1
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PANEL, entorno, servicio, crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, configurarPanel, ingresar,
  limpiarRestosDePruebas, borrarCatalogo, leerTallas, ajustarTalla
} from '../etapa15/ayudas-panel.js';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120000);

const MARCA = 'MARCA SELECCION';
const CAPTURAS = path.join(os.tmpdir(), 'gama-talla-18-capturas');
const AVISO_CAPTURA_WEBKIT = "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.";
let admin; let cat;

async function borrarTodo() {
  const productos = await servicio('GET', `/rest/v1/productos?select=id,variantes(id)&marca=eq.${encodeURIComponent(MARCA)}`);
  if (productos.length) await borrarCatalogo({ productos, variantes: productos.flatMap((p) => p.variantes) });
}
async function crearCatalogo() {
  const hace1h = new Date(Date.now() - 3600e3).toISOString();
  const productos = await servicio('POST', '/rest/v1/productos?select=id,nombre', [
    { nombre: 'SAMBA SEL', marca: MARCA, categoria: 'URBANAS', publico: 'unisex', orden: 1, activo: true },
    { nombre: 'CAMPUS SEL', marca: MARCA, categoria: 'URBANAS', publico: 'unisex', orden: 2, activo: true }
  ], 'return=representation');
  const [samba, campus] = productos;
  const variantes = await servicio('POST', '/rest/v1/variantes?select=id,color,codigo_variante,producto_id', [
    { producto_id: samba.id, color: 'BEIGH', precio: 168900, orden: 0, activa: true },
    { producto_id: campus.id, color: 'NEGRO', precio: 120000, orden: 0, activa: true },
    { producto_id: campus.id, color: 'BEIGE', precio: 180000, orden: 1, activa: true }
  ], 'return=representation');
  const [vSamba, vNegro, vBeige] = variantes;
  const filas = [
    ...['39', '40', '41'].map((t) => ({ variante_id: vSamba.id, talla: t, estado: 'REVISAR', vigencia_desde: null, activa: true })),
    ...['40', '41', '42', '43'].map((t) => ({ variante_id: vNegro.id, talla: t, estado: 'CONFIRMADA', vigencia_desde: hace1h, activa: true })),
    ...['40', '41', '42', '43'].map((t) => ({ variante_id: vBeige.id, talla: t, estado: 'REVISAR', vigencia_desde: null, activa: true }))
  ];
  const tallas = await servicio('POST', '/rest/v1/tallas?select=id,talla,variante_id', filas, 'return=representation');
  const id = (v, t) => tallas.find((x) => x.variante_id === v.id && x.talla === t).id;
  return {
    productos, variantes, tallas,
    talla: (color, t) => id({ samba: vSamba, negro: vNegro, beige: vBeige }[color], t),
    codigo: (color) => ({ samba: vSamba, negro: vNegro, beige: vBeige }[color]).codigo_variante
  };
}

test.beforeAll(async ({}, info) => {
  entorno();
  await limpiarRestosDePruebas();
  await borrarTodo();
  admin = await crearUsuario(`seleccion18-${info.project.name}-${Date.now().toString(36)}@gamaytalla.test`);
  await hacerAdmin(admin.id);
  fs.mkdirSync(CAPTURAS, { recursive: true });
});
test.afterAll(async () => {
  await borrarTodo().catch(() => null);
  if (admin) { await quitarAdmin(admin.id).catch(() => null); await borrarUsuario(admin.id); }
});

let problemas = [];
test.beforeEach(async ({ page }) => {
  await borrarTodo();
  cat = await crearCatalogo();
  problemas = [];
  page.on('pageerror', (e) => problemas.push(`EXCEPCIÓN: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|internetdisconnected/.test(m.text())) problemas.push(m.text()); });
  await configurarPanel(page);
  await page.goto(PANEL);
  await ingresar(page, admin);
  await expect(page.locator('#tablero')).not.toHaveAttribute('aria-busy', 'true');
  await page.getByLabel('Buscar por código interno, referencia, marca o modelo').fill('SEL');
  // Etapa 19: la búsqueda se aplica 120 ms después; si el catálogo local solo tiene estos dos modelos,
  // «2 tarjetas» se cumple antes de ese repintado. Se espera la línea que pinta la propia búsqueda.
  await expect(page.locator('#tablero-estado')).toContainText(/^2 de \d+ zapatillas a la vista/);
  await expect(page.locator('#lista-productos > li')).toHaveCount(2);
});

const talla = (page, color, t) => page.locator(`.talla[data-talla-id="${cat.talla(color, t)}"]`);
const barra = (page) => page.locator('#barra-acciones');
const resumen = (page) => page.locator('#seleccion-resumen');
const dialogo = (page) => page.locator('#dialogo-accion');
const resultado = (page) => page.locator('#resultado-accion');
const lineas = (page) => resultado(page).locator('.resultado-lineas li');
const accion = (page, nombre) => barra(page).getByRole('button', { name: nombre, exact: true });
const confirmar = (page, nombre) => dialogo(page).getByRole('button', { name: nombre, exact: true });
const buscar = (page) => page.getByLabel('Buscar por código interno, referencia, marca o modelo');
async function capturar(page, browserName, nombre) {
  const desde = problemas.length;
  await page.screenshot({ path: path.join(CAPTURAS, nombre) });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  if (browserName !== 'webkit') return;
  const i = problemas.indexOf(AVISO_CAPTURA_WEBKIT, desde);
  if (i >= 0) problemas.splice(i, 1);
}
// La selección del ejemplo: Samba 39, Campus NEGRO 40 y 41, Campus BEIGE 42.
async function seleccionMixta(page) {
  for (const [c, t] of [['samba', '39'], ['negro', '40'], ['negro', '41'], ['beige', '42']]) await talla(page, c, t).click();
  await expect(resumen(page)).toContainText('4 tallas seleccionadas · 2 modelos · 3 colores');
}
const todasLasTallas = async () => leerTallas(cat.tallas.map((t) => t.id));

// ======================================================================== 1. selección
test('seleccionar y quitar tallas de varios modelos y colores; misma numeración; visibles; filtros; diálogo agrupado; capturas', async ({ page, browserName }) => {
  await expect(page.locator('#seleccion-herramientas')).toBeVisible();
  await seleccionMixta(page);
  // La misma numeración en otro color es otra talla.
  await talla(page, 'beige', '40').click();
  await expect(talla(page, 'beige', '40')).toHaveAttribute('aria-pressed', 'true');
  await expect(talla(page, 'negro', '40')).toHaveAttribute('aria-pressed', 'true');
  await expect(resumen(page)).toContainText('5 tallas seleccionadas · 2 modelos · 3 colores');
  await talla(page, 'beige', '40').click();
  await expect(talla(page, 'beige', '40')).toHaveAttribute('aria-pressed', 'false');
  await expect(talla(page, 'negro', '40')).toHaveAttribute('aria-pressed', 'true');
  await expect(resumen(page)).toContainText('4 tallas seleccionadas');
  // Cada color con tallas elegidas muestra su detalle (etapa 19: dentro de «Ver selección»).
  await barra(page).getByRole('button', { name: 'Ver selección' }).click();
  await expect(page.locator('#seleccion-detalle .detalle-seleccion')).toHaveCount(3);
  await barra(page).getByRole('button', { name: 'Ver selección' }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await talla(page, 'beige', '42').scrollIntoViewIfNeeded();
  await capturar(page, browserName, `seleccion-entre-modelos-${browserName}-1440.png`);
  await page.setViewportSize({ width: 390, height: 844 });
  await talla(page, 'beige', '42').scrollIntoViewIfNeeded();
  await capturar(page, browserName, `seleccion-entre-modelos-${browserName}-390.png`);
  await page.setViewportSize({ width: 1280, height: 900 });

  // Buscar y filtrar conserva la selección y dice cuántas quedan fuera.
  await buscar(page).fill('SAMBA SEL');
  await expect(page.locator('#lista-productos > li')).toHaveCount(1);
  await expect(resumen(page)).toContainText('· 3 fuera de la vista');
  await expect(page.locator('#tablero-estado')).toContainText('3 tallas seleccionadas quedan fuera de la vista');
  await page.locator('#filtros').getByRole('button', { name: /Con tallas disponibles/ }).click();
  await buscar(page).fill('SEL');
  await expect(page.locator('#lista-productos > li')).toHaveCount(1); // solo CAMPUS tiene disponibles
  await expect(resumen(page)).toContainText('· 1 fuera de la vista');
  await page.locator('#filtros').getByRole('button', { name: /^Todas/ }).click();
  await expect(talla(page, 'samba', '39')).toHaveAttribute('aria-pressed', 'true');

  // «Seleccionar tallas visibles» añade lo que está a la vista.
  await buscar(page).fill('CAMPUS SEL');
  await expect(page.locator('#lista-productos > li')).toHaveCount(1);
  await page.locator('#seleccion-herramientas').getByRole('button', { name: 'Seleccionar tallas visibles' }).click();
  await expect(resumen(page)).toContainText('9 tallas seleccionadas · 2 modelos · 3 colores · 1 fuera de la vista');
  await expect(page.locator('#tablero-estado')).toContainText('Se añadieron 5 tallas visibles');
  await buscar(page).fill('SEL');
  await expect(page.locator('#lista-productos > li')).toHaveCount(2);
  await accion(page, 'Quitar selección').click();
  await expect(barra(page)).toBeHidden();

  // El diálogo de una acción detalla por modelo y color, con códigos y tallas.
  await seleccionMixta(page);
  await accion(page, 'Dejar por revisar').click();
  await expect(dialogo(page).locator('.dialogo-alcance')).toHaveText('4 tallas de 2 modelos y 3 colores:');
  const grupos = dialogo(page).locator('.dialogo-grupo');
  await expect(grupos).toHaveCount(3);
  await expect(grupos.nth(0)).toContainText(`SAMBA SEL (`);
  await expect(grupos.nth(0)).toContainText(`BEIGH (${cat.codigo('samba')})`);
  await expect(grupos.nth(0)).toContainText('Talla: 39 (');
  await expect(grupos.nth(1)).toContainText(`NEGRO (${cat.codigo('negro')})`);
  await expect(grupos.nth(1)).toContainText('Tallas: 40 (disponible), 41 (disponible)');
  await expect(grupos.nth(2)).toContainText(`BEIGE (${cat.codigo('beige')})`);
  await expect(dialogo(page)).toContainText('Se guarda en una sola operación');
  await capturar(page, browserName, `seleccion-dialogo-${browserName}-1280.png`);
  await page.setViewportSize({ width: 360, height: 640 });
  await capturar(page, browserName, `seleccion-dialogo-${browserName}-360.png`);
  await dialogo(page).getByRole('button', { name: 'Cancelar' }).click();
  expect(problemas).toEqual([]);
});

// ======================================================================== 2. acciones
test('acciones sobre una selección mixta: proveedor, publicación, agotada, por revisar, desactivar y activar; las demás tallas no cambian', async ({ page }) => {
  const elegidas = [cat.talla('samba', '39'), cat.talla('negro', '40'), cat.talla('negro', '41'), cat.talla('beige', '42')];
  const ajenasAntes = Object.fromEntries(Object.entries(await todasLasTallas()).filter(([id]) => !elegidas.includes(id)));
  const leerElegidas = async () => leerTallas(elegidas);

  // Confirmó el proveedor.
  await seleccionMixta(page);
  await accion(page, 'Confirmó el proveedor').click();
  await confirmar(page, 'Confirmar disponibilidad').click();
  await expect(resultado(page)).toContainText('4 tallas confirmadas por el proveedor');
  await expect(resultado(page)).toContainText('4 tallas de 2 modelos y 3 colores');
  expect(Object.values(await leerElegidas()).map((t) => t.estado)).toEqual(['CONFIRMADA', 'CONFIRMADA', 'CONFIRMADA', 'CONFIRMADA']);
  await expect(barra(page)).toBeHidden();

  // Nueva publicación (hace dos horas, hora de Colombia).
  await seleccionMixta(page);
  await accion(page, 'Nueva publicación').click();
  const d = new Date(Date.now() - 2 * 3600e3 - 5 * 3600e3).toISOString();
  await dialogo(page).getByLabel('Fecha de la publicación').fill(d.slice(0, 10));
  await dialogo(page).getByLabel('Hora (Colombia, UTC−5)').fill(d.slice(11, 16));
  await confirmar(page, 'Registrar publicación').click();
  await expect(resultado(page)).toContainText('4 tallas confirmadas por publicación');
  expect(Object.values(await leerElegidas()).every((t) => t.origen === 'publicacion' && t.estado === 'CONFIRMADA')).toBe(true);

  // Desactivar con una ya desactivada: se informa y no se toca; estado y fechas se conservan.
  await ajustarTalla(cat.talla('beige', '42'), { activa: false });
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.locator('#tablero')).not.toHaveAttribute('aria-busy', 'true');
  const antesDeDesactivar = await leerElegidas();
  await seleccionMixta(page);
  await accion(page, 'Desactivar tallas').click();
  await expect(dialogo(page)).toContainText('La talla 42 de BEIGE ya estaba desactivada: no se tocan.');
  await confirmar(page, 'Desactivar tallas').click();
  await expect(resultado(page)).toContainText('3 tallas desactivadas');
  await expect(resultado(page)).toContainText('1 talla ya estaba desactivada: no se tocó.');
  await expect(lineas(page).filter({ hasText: 'talla 42' })).toContainText('sin cambios (ya estaba desactivada)');
  let despues = await leerElegidas();
  for (const id of elegidas) {
    expect(despues[id].activa, 'desactivada').toBe(false);
    for (const campo of ['estado', 'vigencia_desde', 'vence_en', 'publicado_en', 'confirmado_en', 'origen']) expect(despues[id][campo], campo).toEqual(antesDeDesactivar[id][campo]);
  }
  // Activar: vuelven a ofrecerse con su estado y sus fechas.
  await seleccionMixta(page);
  await accion(page, 'Activar tallas').click();
  await expect(dialogo(page)).toContainText('Activar no confirma disponibilidad');
  await confirmar(page, 'Activar tallas').click();
  await expect(resultado(page)).toContainText('4 tallas activadas');
  despues = await leerElegidas();
  for (const id of elegidas) {
    expect(despues[id].activa).toBe(true);
    for (const campo of ['estado', 'vigencia_desde', 'vence_en', 'publicado_en', 'confirmado_en']) expect(despues[id][campo], campo).toEqual(antesDeDesactivar[id][campo]);
  }
  // Activar otra vez: no hay nada que cambiar.
  await seleccionMixta(page);
  await accion(page, 'Activar tallas').click();
  await expect(dialogo(page)).toContainText('No hay nada que cambiar: las 4 tallas ya estaban activadas.');
  await confirmar(page, 'Activar tallas').click();
  await expect(resultado(page).getByRole('heading')).toHaveText('Las 4 tallas ya estaban activadas');

  // Marcar agotada y dejar por revisar.
  await seleccionMixta(page);
  await accion(page, 'Marcar agotada').click();
  await confirmar(page, 'Marcar agotada').click();
  await expect(resultado(page)).toContainText('4 tallas marcadas agotadas');
  expect(Object.values(await leerElegidas()).map((t) => t.estado)).toEqual(['AGOTADA', 'AGOTADA', 'AGOTADA', 'AGOTADA']);
  await seleccionMixta(page);
  await accion(page, 'Dejar por revisar').click();
  await confirmar(page, 'Dejar por revisar').click();
  await expect(resultado(page)).toContainText('4 tallas dejadas por revisar');
  expect(Object.values(await leerElegidas()).map((t) => t.estado)).toEqual(['REVISAR', 'REVISAR', 'REVISAR', 'REVISAR']);

  // Las tallas ajenas a la selección no cambiaron en nada.
  const ajenasDespues = Object.fromEntries(Object.entries(await todasLasTallas()).filter(([id]) => !elegidas.includes(id)));
  expect(ajenasDespues).toEqual(ajenasAntes);
  expect(problemas).toEqual([]);
});

// ======================================================================== 3. fallos
test('fallo parcial, respuesta perdida y cambio concurrente en una selección mixta', async ({ page }) => {
  // Parcial: el servidor rechaza solo la talla 41 de NEGRO; las demás se aplican y no se repiten.
  const rechazada = cat.talla('negro', '41');
  await page.route('**/rpc/fn_marcar_agotada*', async (r) => {
    if ((r.request().postData() || '').includes(rechazada)) return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'No existe la talla' }) });
    return r.continue();
  });
  await seleccionMixta(page);
  await accion(page, 'Marcar agotada').click();
  await confirmar(page, 'Marcar agotada').click();
  await expect(resultado(page).getByRole('heading')).toHaveText('Se aplicó a 3 de 4 tallas');
  await expect(lineas(page)).toHaveText([
    new RegExp(`^SAMBA SEL · BEIGH \\(${cat.codigo('samba')}\\) · talla 39: marcada agotada$`),
    new RegExp(`^CAMPUS SEL · NEGRO \\(${cat.codigo('negro')}\\) · talla 40: marcada agotada$`),
    new RegExp(`^CAMPUS SEL · NEGRO \\(${cat.codigo('negro')}\\) · talla 41: no se aplicó \\(la talla ya no existe\\)$`),
    new RegExp(`^CAMPUS SEL · BEIGE \\(${cat.codigo('beige')}\\) · talla 42: marcada agotada$`)
  ]);
  await expect(resultado(page)).toContainText('La talla que no se aplicó sigue seleccionada');
  // Solo la que falló queda seleccionada: reintentar no repite las aplicadas.
  await expect(resumen(page)).toContainText('1 talla seleccionada · 1 modelo · 1 color');
  await expect(talla(page, 'negro', '41')).toHaveAttribute('aria-pressed', 'true');
  await page.unroute('**/rpc/fn_marcar_agotada*');
  let escrituras = 0;
  await page.route('**/rpc/fn_marcar_agotada*', (r) => { escrituras += 1; return r.continue(); });
  await accion(page, 'Marcar agotada').click();
  await confirmar(page, 'Marcar agotada').click();
  await expect(resultado(page)).toContainText('Talla 41 marcada agotada');
  expect(escrituras, 'el reintento solo envía la que faltaba').toBe(1);
  await page.unroute('**/rpc/fn_marcar_agotada*');

  // Respuesta perdida en la segunda talla: no se sigue, se consulta el estado actual y no queda nada
  // preparado para repetir.
  let llamadas = 0;
  await page.route('**/rpc/fn_confirmar_por_proveedor*', async (r) => {
    llamadas += 1;
    if (llamadas === 2) { await r.fetch(); return r.abort('internetdisconnected'); }
    return r.continue();
  });
  await seleccionMixta(page);
  await accion(page, 'Confirmó el proveedor').click();
  await confirmar(page, 'Confirmar disponibilidad').click();
  await expect(resultado(page).getByRole('heading')).toHaveText('Resultado no confirmado');
  await expect(lineas(page).nth(0)).toContainText('talla 39: confirmada por el proveedor');
  await expect(lineas(page).nth(1)).toContainText(`CAMPUS SEL · NEGRO (${cat.codigo('negro')}) · talla 40: resultado no confirmado (se perdió la respuesta del servidor). Estado actual: guardada como confirmada`);
  await expect(lineas(page).nth(2)).toContainText('talla 41: no se aplicó (no se intentó)');
  await expect(resultado(page)).toContainText('No sabemos si la petición de la talla 40 de NEGRO se aplicó.');
  expect(llamadas).toBe(2);
  await expect(barra(page)).toBeHidden();
  await page.unroute('**/rpc/fn_confirmar_por_proveedor*');

  // Desactivar con la respuesta perdida: una sola operación, resultado no confirmado.
  await page.route('**/rest/v1/tallas?*', async (r) => (r.request().method() === 'PATCH' ? r.abort('internetdisconnected') : r.continue()));
  await seleccionMixta(page);
  await accion(page, 'Desactivar tallas').click();
  await confirmar(page, 'Desactivar tallas').click();
  await expect(resultado(page).getByRole('heading')).toHaveText('Resultado no confirmado');
  await expect(lineas(page)).toHaveCount(4);
  await page.unroute('**/rest/v1/tallas?*');

  // Cambio concurrente en otra variante de la selección: no se aplica nada.
  await seleccionMixta(page);
  const antes = await todasLasTallas();
  await ajustarTalla(cat.talla('beige', '42'), { estado: 'AGOTADA' });
  await accion(page, 'Dejar por revisar').click();
  await confirmar(page, 'Dejar por revisar').click();
  await expect(resultado(page)).toContainText('La disponibilidad cambió mientras revisabas');
  await expect(resultado(page)).toContainText('CAMPUS SEL · BEIGE 42');
  const despues = await todasLasTallas();
  for (const id of [cat.talla('samba', '39'), cat.talla('negro', '40'), cat.talla('negro', '41')]) expect(despues[id].estado).toBe(antes[id].estado);
  expect(problemas.filter((x) => !/Failed to fetch|NetworkError|Load failed|CORS request did not succeed|access control checks/.test(x))).toEqual([]);
});

// ======================================================================== 4. acceso
test('al perder el acceso administrativo la selección se limpia', async ({ page }) => {
  await seleccionMixta(page);
  await quitarAdmin(admin.id);
  try {
    await accion(page, 'Dejar por revisar').click();
    await confirmar(page, 'Dejar por revisar').click();
    await expect(page.locator('#barra-acciones')).toBeHidden();
    await expect(page.locator('.talla[aria-pressed="true"]')).toHaveCount(0);
    expect(Object.values(await leerTallas([cat.talla('negro', '40')])).map((t) => t.estado)).toEqual(['CONFIRMADA']);
  } finally {
    await hacerAdmin(admin.id);
  }
});
