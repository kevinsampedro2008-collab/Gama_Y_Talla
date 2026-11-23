// @ts-check
/* Etapa 18 · Ventana del importador (una sola zona de desplazamiento) y «Aplicar todos los ajustes».
 *
 * SOLO contra el stack local desechable de Supabase y el sitio en 127.0.0.1:8765. Datos FICTICIOS
 * (marca «NEW BALANCE», modelos «VENTANA … P18» y «FONDO … P18») que se borran al terminar. Las medidas
 * de desplazamiento son EMULADAS con Playwright (rueda del ratón y tamaños de pantalla); no son pruebas
 * en un teléfono físico.
 *
 *   npx playwright test tests/etapa18/ventana.spec.js --workers=1
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PANEL, entorno, servicio, crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, configurarPanel, ingresar,
  limpiarRestosDePruebas, borrarCatalogo, objetosDe, borrarObjetos
} from '../etapa16/ayudas-catalogo.js';
import { elegirCategoria, campoCategoria } from '../etapa15/ayudas-panel.js'; // etapa 20: selector de categorías

test.describe.configure({ mode: 'serial' });
test.setTimeout(180000);

const MARCA = 'NEW BALANCE';
const FONDO = Array.from({ length: 14 }, (_, i) => `FONDO ${String(i + 1).padStart(2, '0')} P18`);
const MODELOS = ['VENTANA A P18', 'VENTANA B P18', 'VENTANA C P18', ...FONDO];
const CAPTURAS = path.join(os.tmpdir(), 'gama-talla-18-capturas');
const MENSAJE = 'Pega aquí el mensaje de WhatsApp';
const AVISO_CAPTURA_WEBKIT = "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.";
let admin;

async function limpiar() {
  const lista = MODELOS.map((m) => `"${m}"`).join(',');
  const productos = await servicio('GET', `/rest/v1/productos?select=id,variantes(id)&marca=eq.${encodeURIComponent(MARCA)}&nombre=in.(${encodeURIComponent(lista)})`);
  for (const p of productos) await borrarObjetos((await objetosDe(p.id)).map((o) => o.nombre));
  if (productos.length) await borrarCatalogo({ productos, variantes: productos.flatMap((p) => p.variantes) });
}

test.beforeAll(async ({}, info) => {
  entorno();
  const columna = await servicio('GET', '/rest/v1/variantes?select=forma_muestra&limit=1').then(() => true, () => false);
  test.skip(!columna, 'Falta aplicar la migración 20261117010000_forma_muestra_color en el Supabase local.');
  await limpiarRestosDePruebas();
  await limpiar();
  admin = await crearUsuario(`ventana18-${info.project.name}-${Date.now().toString(36)}@gamaytalla.test`);
  await hacerAdmin(admin.id);
  fs.mkdirSync(CAPTURAS, { recursive: true });
});
test.afterAll(async () => {
  await limpiar().catch(() => null);
  if (admin) { await quitarAdmin(admin.id).catch(() => null); await borrarUsuario(admin.id); }
});

const importador = (page) => page.locator('#importador');
const ficha = (page, n) => importador(page).locator('.importador-ficha').nth(n);
const color = (f, n) => f.locator('.importador-color').nth(n);
const ajustes = (page) => importador(page).locator('#imp-ajustes');

async function abrirPanel(page) {
  const problemas = [];
  page.on('pageerror', (e) => problemas.push(`EXCEPCIÓN: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problemas.push(m.text()); });
  await configurarPanel(page);
  await page.goto(PANEL);
  await ingresar(page, admin);
  await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
  await expect(page.locator('#tablero')).not.toHaveAttribute('aria-busy', 'true');
  return problemas;
}
async function capturar(page, problemas, browserName, nombre) {
  const desde = problemas.length;
  await page.screenshot({ path: path.join(CAPTURAS, nombre) });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  if (browserName !== 'webkit') return;
  const i = problemas.indexOf(AVISO_CAPTURA_WEBKIT, desde);
  if (i >= 0) problemas.splice(i, 1);
}
// Estado de la ventana: el diálogo no se desplaza, el pie y la cabecera están dentro de la pantalla,
// no queda hueco bajo el pie y el panel de fondo no se ha movido.
async function medir(page, dialogo = '#importador') {
  return page.evaluate((d) => {
    const ventana = document.querySelector(d);
    const r = ventana.getBoundingClientRect();
    const cuerpo = ventana.querySelector('.editor-cuerpo');
    const pie = ventana.querySelector('.editor-pie').getBoundingClientRect();
    const cabecera = ventana.querySelector('.editor-cabecera').getBoundingClientRect();
    return {
      dialogoDesplazable: ventana.scrollHeight - ventana.clientHeight,
      dialogoScroll: ventana.scrollTop,
      cuerpoScroll: cuerpo.scrollTop,
      cuerpoMax: cuerpo.scrollHeight - cuerpo.clientHeight,
      cuerpoAlto: cuerpo.clientHeight,
      huecoBajoPie: Math.round(r.bottom - pie.bottom),
      pieDentro: pie.top >= 0 && pie.bottom <= innerHeight + 1,
      cabeceraDentro: cabecera.top >= -1 && cabecera.bottom <= innerHeight,
      paginaY: window.scrollY,
      bloqueada: document.documentElement.classList.contains('con-dialogo')
    };
  }, dialogo);
}
async function rueda(page, selector, dy, veces = 4) {
  const caja = await page.locator(selector).boundingBox();
  await page.mouse.move(caja.x + caja.width / 2, caja.y + Math.min(caja.height / 2, 20));
  for (let i = 0; i < veces; i += 1) { await page.mouse.wheel(0, dy); await page.waitForTimeout(60); }
  await page.waitForTimeout(250);
}
// Gira la rueda sobre el contenido hasta que deja de moverse (Firefox avanza menos por giro).
async function ruedaHastaElExtremo(page, selector, dy) {
  const cuerpo = page.locator(selector);
  let antes = -1;
  for (let i = 0; i < 60; i += 1) {
    await rueda(page, selector, dy, 3);
    const ahora = await cuerpo.evaluate((n) => n.scrollTop);
    if (ahora === antes) return;
    antes = ahora;
  }
}

// ======================================================================== 1. desplazamiento
test('una sola zona de desplazamiento: extremos con la rueda en cuerpo, cabecera y pie; celular 360×560; confirmación; cerrar restaura el panel', async ({ page, browserName }) => {
  // Un tablero largo para que el panel de fondo pueda desplazarse.
  const productos = await servicio('POST', '/rest/v1/productos?select=id', FONDO.map((nombre, i) => ({ nombre, marca: MARCA, categoria: 'URBANAS', publico: 'unisex', orden: i, activo: false })), 'return=representation');
  await servicio('POST', '/rest/v1/variantes', productos.map((p) => ({ producto_id: p.id, color: 'NEGRO', precio: 100000, orden: 0 })));
  const problemas = await abrirPanel(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('.producto', { hasText: 'FONDO 14 P18' })).toHaveCount(1);
  // El panel desplazado; se abre con el teclado (sin mover la página) desde el botón.
  const Y = await page.evaluate(() => {
    const max = document.documentElement.scrollHeight - innerHeight;
    window.scrollTo(0, Math.min(400, max));
    document.querySelector('#boton-importar').focus({ preventScroll: true });
    return window.scrollY;
  });
  expect(Y, 'el panel de fondo tiene desplazamiento').toBeGreaterThan(100);
  await page.keyboard.press('Enter');
  await expect(importador(page)).toBeVisible();
  for (const [i, t] of ['New Balance VENTANA A P18\nBlanco\nUnisex $200.000\n40 al 44', 'New Balance VENTANA B P18\nNegro\nDama $150.000\n36 al 39'].entries()) {
    if (i) await importador(page).getByRole('button', { name: 'Añadir otra publicación' }).click();
    await color(ficha(page, i), 0).getByLabel(MENSAJE).fill(t);
    await expect(color(ficha(page, i), 0).getByLabel(/^Tallas EU/)).not.toHaveValue('');
  }
  await ajustes(page).locator(':scope > summary').click();

  for (const vista of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 360, height: 560 }]) {
    await page.setViewportSize(vista);
    await page.waitForTimeout(200);
    let m = await medir(page);
    expect(m.cuerpoMax, `${vista.width}×${vista.height}: el contenido se desplaza`).toBeGreaterThan(100);
    if (vista.height === 560) expect(m.cuerpoAlto, '360×560: zona de contenido útil').toBeGreaterThanOrEqual(200);
    // Hasta el final con la rueda sobre el contenido, y seguir girando: nada más se mueve.
    await ruedaHastaElExtremo(page, '#importador .editor-cuerpo', 1500);
    m = await medir(page);
    expect(m.cuerpoScroll, 'el contenido llega al final').toBeGreaterThanOrEqual(m.cuerpoMax - 2);
    await rueda(page, '#importador .editor-cuerpo', 1500, 4);
    m = await medir(page);
    expect([m.dialogoDesplazable, m.dialogoScroll, m.huecoBajoPie], 'sin segundo desplazamiento ni hueco bajo el pie').toEqual([0, 0, 0]);
    expect(m.pieDentro && m.cabeceraDentro, 'cabecera y pie visibles').toBe(true);
    expect(m.paginaY, 'el panel de fondo no se mueve').toBe(Y);
    // El final del lote (los ajustes y su botón) queda alcanzable por encima del pie.
    const alcanzable = await page.evaluate(() => {
      const b = document.querySelector('#imp-aplicar-ajustes').getBoundingClientRect();
      return b.bottom <= document.querySelector('#importador .editor-pie').getBoundingClientRect().top;
    });
    expect(alcanzable, 'el botón «Aplicar todos los ajustes» se alcanza').toBe(true);
    await capturar(page, problemas, browserName, `ventana-final-${browserName}-${vista.width}x${vista.height}.png`);
    // La rueda sobre la cabecera y el pie tampoco mueve el diálogo ni el panel.
    await rueda(page, '#importador .editor-cabecera', 1200, 3);
    await rueda(page, '#importador .editor-pie', 1200, 3);
    m = await medir(page);
    expect([m.dialogoDesplazable, m.dialogoScroll, m.huecoBajoPie, m.paginaY]).toEqual([0, 0, 0, Y]);
    // Al principio y más arriba: igual.
    await ruedaHastaElExtremo(page, '#importador .editor-cuerpo', -1500);
    m = await medir(page);
    expect(m.cuerpoScroll).toBe(0);
    await rueda(page, '#importador .editor-pie', -1500, 3);
    m = await medir(page);
    expect([m.dialogoDesplazable, m.dialogoScroll, m.huecoBajoPie, m.paginaY]).toEqual([0, 0, 0, Y]);
  }

  // Confirmación de cierre en 360×560: cabe en el pie, los botones se ven y no hay otro desplazamiento.
  await importador(page).getByRole('button', { name: 'Cerrar el importador' }).click();
  await expect(importador(page).locator('#importador-salida')).toBeVisible();
  let m = await medir(page);
  expect([m.dialogoDesplazable, m.dialogoScroll, m.huecoBajoPie]).toEqual([0, 0, 0]);
  expect(m.cuerpoAlto, 'el contenido sigue visible con la confirmación abierta').toBeGreaterThan(60);
  for (const nombre of ['Seguir editando', 'Cerrar y conservar el lote', 'Descartar el lote']) {
    const b = await importador(page).getByRole('button', { name: nombre }).boundingBox();
    expect(b.y + b.height, `«${nombre}» dentro de la pantalla`).toBeLessThanOrEqual(560);
  }
  await capturar(page, problemas, browserName, `ventana-confirmacion-${browserName}-360x560.png`);
  // Cambiar el tamaño con la confirmación abierta.
  await page.setViewportSize({ width: 1024, height: 600 });
  m = await medir(page);
  expect([m.dialogoDesplazable, m.huecoBajoPie]).toEqual([0, 0]);
  // Cerrar: vuelve el desplazamiento normal del panel, su posición y el foco en el botón.
  await importador(page).getByRole('button', { name: 'Cerrar y conservar el lote' }).click();
  await expect(importador(page)).toBeHidden();
  await expect(page.locator('#boton-importar')).toBeFocused();
  expect(await page.evaluate(() => ({ y: window.scrollY, bloqueada: document.documentElement.classList.contains('con-dialogo'), overflow: getComputedStyle(document.documentElement).overflowY })))
    .toEqual({ y: Y, bloqueada: false, overflow: 'visible' });
  await page.mouse.wheel(0, 300);
  await expect.poll(() => page.evaluate(() => window.scrollY), { message: 'el panel vuelve a desplazarse' }).toBeGreaterThan(Y);

  // El editor habitual comparte las reglas: una sola zona de desplazamiento y el fondo quieto.
  await page.setViewportSize({ width: 360, height: 560 });
  const Y2 = await page.evaluate(() => window.scrollY);
  await page.locator('.producto', { hasText: 'FONDO 03 P18' }).getByRole('button', { name: /^Editar/ }).focus();
  const Y3 = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('Enter');
  await expect(page.locator('#editor')).toBeVisible();
  await rueda(page, '#editor .editor-cuerpo', 1500, 10);
  m = await medir(page, '#editor');
  expect([m.dialogoDesplazable, m.dialogoScroll, m.huecoBajoPie, m.paginaY]).toEqual([0, 0, 0, Y3]);
  expect(m.cuerpoScroll).toBeGreaterThan(0);
  await page.locator('#editor').getByRole('button', { name: 'Cerrar el editor' }).click();
  await expect(page.locator('#editor')).toBeHidden();
  expect(await page.evaluate(() => window.scrollY)).toBe(Y3);
  expect(Y2).toBeGreaterThanOrEqual(0);
  expect(problemas).toEqual([]);
});

// ======================================================================== 2. ajustes para varias fichas
test('«Aplicar todos los ajustes»: dos fichas marcadas (una con dos colores), una sin marcar; vacíos conservan; manuales; sin acumular; validación; guardar y recargar', async ({ page, browserName }) => {
  const problemas = await abrirPanel(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Importar desde WhatsApp' }).click();
  const textos = [
    'New Balance VENTANA A P18\nBlanco\nHombre $200.000\n40 al 42',
    'New Balance VENTANA A P18\nNegro\nHombre $210.000\n41-42-43',
    'New Balance VENTANA B P18\nGris\nDama\n37',
    'New Balance VENTANA C P18\nRojo\nDama $150.000\n38'
  ];
  for (const [i, t] of textos.entries()) {
    if (i) await importador(page).getByRole('button', { name: 'Añadir otra publicación' }).click();
    await color(ficha(page, i), 0).getByLabel(MENSAJE).fill(t);
    await expect(color(ficha(page, i), 0).getByLabel(/^Tallas EU/)).not.toHaveValue('');
  }
  await ficha(page, 1).getByRole('button', { name: 'Agrupar como color de la ficha 1' }).click();
  const [a, b, c] = [ficha(page, 0), ficha(page, 1), ficha(page, 2)];
  await expect(a.locator('.importador-color')).toHaveCount(2);
  // Antes de aplicar: B con categoría y guía propias; A con un precio de venta escrito a mano; C sin marcar.
  await elegirCategoria(b, 'CASUALES');
  await b.getByRole('group', { name: 'Tabla de la guía de tallas' }).getByRole('radio', { name: 'Hombre', exact: true }).check();
  await color(a, 1).getByLabel(/^Precio de venta/).fill('199000');
  await c.getByLabel('Incluir en el guardado').uncheck();

  const bloque = ajustes(page);
  await bloque.locator(':scope > summary').click();
  await expect(bloque.getByRole('group', { name: 'Público en la tienda' }).getByRole('radio', { name: 'Sin cambiar' })).toBeChecked();
  await expect(bloque.getByRole('group', { name: /Tabla de la guía de tallas/ }).getByRole('radio', { name: 'Sin cambiar' })).toBeChecked();
  // Nada configurado: indicación clara, nada cambia.
  await bloque.getByRole('button', { name: /^Aplicar ajustes a [0-9]+ fichas?$/ }).click();
  await expect(bloque.locator('#imp-ajustes-estado')).toContainText('Elige al menos un ajuste');
  // Valor inválido: error junto a su control y ninguna ficha cambia.
  await bloque.getByRole('group', { name: 'Público en la tienda' }).getByRole('radio', { name: 'Unisex' }).check();
  await bloque.getByLabel('Sumar al precio del proveedor (COP)').fill('40.000,5');
  await bloque.getByRole('button', { name: /^Aplicar ajustes a [0-9]+ fichas?$/ }).click();
  await expect(bloque.locator('#imp-margen-error')).toContainText('pesos enteros');
  await expect(bloque.getByLabel('Sumar al precio del proveedor (COP)')).toHaveAttribute('aria-invalid', 'true');
  await expect(bloque.getByLabel('Sumar al precio del proveedor (COP)')).toBeFocused();
  await expect(a.getByRole('group', { name: /^Público en la tienda/ }).getByRole('radio', { name: 'Hombre', exact: true })).toBeChecked();
  // Sin fichas marcadas: indicación clara.
  await bloque.getByLabel('Sumar al precio del proveedor (COP)').fill('40000');
  // Etapa 19: los destinos de los ajustes se eligen en el bloque, aparte de «Incluir en el guardado».
  await bloque.getByRole('button', { name: 'Quitar selección' }).click();
  await bloque.getByRole('button', { name: 'Aplicar ajustes a 0 fichas' }).click();
  await expect(bloque.locator('#imp-ajustes-estado')).toContainText('Marca al menos una ficha');
  await expect(a.getByRole('group', { name: /^Público en la tienda/ }).getByRole('radio', { name: 'Hombre', exact: true })).toBeChecked();
  // Destinos: A y B (C no recibe ajustes; además está fuera del guardado).
  await bloque.getByRole('checkbox', { name: /^Ficha 1 · / }).click();
  await bloque.getByRole('checkbox', { name: /^Ficha 2 · / }).click();
  await expect(bloque.getByRole('button', { name: 'Aplicar ajustes a 2 fichas' })).toBeVisible();

  // Público Unisex, guía «Sin indicar» (elegida expresamente), +40.000; categoría vacía = se conserva.
  await bloque.getByRole('group', { name: /Tabla de la guía de tallas/ }).getByRole('radio', { name: /^Sin indicar/ }).check();
  await bloque.getByRole('button', { name: /^Aplicar ajustes a [0-9]+ fichas?$/ }).click();
  const estado = bloque.locator('#imp-ajustes-estado');
  await expect(estado).toContainText('2 fichas actualizadas: público Unisex, guía de tallas «Sin indicar», precio de venta = proveedor + $');
  await expect(estado).toContainText('en 1 color');
  await expect(estado).toContainText('1 precio escrito a mano se conservó');
  await expect(estado).toContainText('1 color no tiene precio del proveedor');
  await capturar(page, problemas, browserName, `ajustes-aplicados-${browserName}-1280.png`);
  for (const f of [a, b]) await expect(f.getByRole('group', { name: /^Público en la tienda/ }).getByRole('radio', { name: 'Unisex', exact: true })).toBeChecked();
  await expect(b.getByRole('group', { name: 'Tabla de la guía de tallas' }).getByRole('radio', { name: /^Sin indicar/ })).toBeChecked();
  await expect(campoCategoria(b)).toHaveValue('CASUALES');
  await expect(campoCategoria(a)).toHaveValue('');
  await expect(color(a, 0).getByLabel(/^Precio de venta/)).toHaveValue('240000');
  await expect(color(a, 1).getByLabel(/^Precio de venta/)).toHaveValue('199000');
  // B no trae precio del proveedor: su precio de venta queda «Revisar»; lo demás sí se aplicó.
  expect(await color(b, 0).getByLabel(/^Precio de venta/).evaluate((n) => Boolean(n.closest('.es-revisar')))).toBe(true);
  // C, sin marcar, no cambia.
  await expect(c.getByRole('group', { name: /^Público en la tienda/ }).getByRole('radio', { name: 'Dama', exact: true })).toBeChecked();
  await expect(color(c, 0).getByLabel(/^Precio de venta/)).toHaveValue('');

  // Repetir: no se acumula el aumento; ahora con categoría (público y guía «Sin cambiar» se conservan).
  await bloque.getByRole('group', { name: 'Público en la tienda' }).getByRole('radio', { name: 'Sin cambiar' }).check();
  await bloque.getByRole('group', { name: /Tabla de la guía de tallas/ }).getByRole('radio', { name: 'Sin cambiar' }).check();
  await elegirCategoria(bloque, 'Urbanas');
  await bloque.getByRole('button', { name: /^Aplicar ajustes a [0-9]+ fichas?$/ }).click();
  await expect(color(a, 0).getByLabel(/^Precio de venta/)).toHaveValue('240000');
  for (const f of [a, b]) {
    await expect(campoCategoria(f)).toHaveValue('URBANAS');
    await expect(f.getByRole('group', { name: /^Público en la tienda/ }).getByRole('radio', { name: 'Unisex', exact: true })).toBeChecked();
  }
  await expect(b.getByRole('group', { name: 'Tabla de la guía de tallas' }).getByRole('radio', { name: /^Sin indicar/ })).toBeChecked();
  await expect(campoCategoria(c)).toHaveValue('');

  // Releer el mensaje: el público aplicado se conserva y el precio de venta sigue la regla proveedor + importe.
  await color(a, 0).getByLabel(MENSAJE).fill('New Balance VENTANA A P18\nBlanco\nHombre $205.000\n40 al 43');
  await expect(color(a, 0).getByLabel(/^Tallas EU/)).toHaveValue('40; 41; 42; 43');
  await expect(color(a, 0).getByLabel(/^Precio de venta/)).toHaveValue('245000');
  await expect(a.getByRole('group', { name: /^Público en la tienda/ }).getByRole('radio', { name: 'Unisex', exact: true })).toBeChecked();

  // Guardar las dos marcadas (B con su precio de venta escrito) y recargar.
  await color(b, 0).getByLabel(/^Precio de venta/).fill('180000');
  await importador(page).getByRole('button', { name: /Guardar lote como oculto/ }).click();
  await expect(a.locator('.importador-estado')).toContainText(/Guardada oculta · GT-/, { timeout: 30000 });
  await expect(b.locator('.importador-estado')).toContainText(/Guardada oculta · GT-/, { timeout: 30000 });
  const leer = (nombre) => servicio('GET', `/rest/v1/productos?select=nombre,publico,categoria,segmento,activo,variantes(color,precio,orden)&marca=eq.${encodeURIComponent(MARCA)}&nombre=eq.${encodeURIComponent(nombre)}`);
  const [pa] = await leer('VENTANA A P18');
  const [pb] = await leer('VENTANA B P18');
  expect(await leer('VENTANA C P18'), 'la ficha sin marcar no se guarda').toEqual([]);
  expect({ ...pa, variantes: pa.variantes.sort((x, y) => x.orden - y.orden).map((v) => [v.color, v.precio]) })
    .toEqual({ nombre: 'VENTANA A P18', publico: 'unisex', categoria: 'URBANAS', segmento: null, activo: false, variantes: [['BLANCO', 245000], ['NEGRO', 199000]] });
  expect({ ...pb, variantes: pb.variantes.map((v) => [v.color, v.precio]) })
    .toEqual({ nombre: 'VENTANA B P18', publico: 'unisex', categoria: 'URBANAS', segmento: null, activo: false, variantes: [['GRIS', 180000]] });
  await importador(page).getByRole('button', { name: 'Cerrar el importador' }).click();
  await importador(page).getByRole('button', { name: 'Descartar el lote' }).click();
  // WebKit informa como excepción la petición que la recarga corta: solo ESE aviso y solo durante la recarga.
  const antesDeRecargar = problemas.length;
  await page.reload();
  await expect(page.locator('#tablero')).not.toHaveAttribute('aria-busy', 'true');
  if (browserName === 'webkit') {
    for (let i = problemas.length - 1; i >= antesDeRecargar; i -= 1) if (/^EXCEPCIÓN: .*127\.0\.0\.1:54321\/.* due to access control checks\.$/.test(problemas[i])) problemas.splice(i, 1);
  }
  await page.locator('.producto', { hasText: 'VENTANA A P18' }).getByRole('button', { name: /^Editar/ }).click();
  const editor = page.locator('#editor');
  await expect(editor.getByRole('radio', { name: 'Unisex', exact: true })).toBeChecked();
  await expect(campoCategoria(editor)).toHaveValue('URBANAS');
  await expect(editor.locator('.editor-variante').nth(0).getByLabel(/^Precio actual/)).toHaveValue('245000');
  await expect(editor.getByRole('radio', { name: /^Sin indicar/ })).toBeChecked();
  expect(problemas).toEqual([]);
});
