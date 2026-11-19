// @ts-check
/* Etapa 18 · Importar desde WhatsApp y elegir círculo o foto para cada color.
 *
 * SOLO contra el stack local desechable de Supabase (con Storage y la migración 20261117010000) y el
 * sitio servido en 127.0.0.1:8765. Usuarios, productos y fotos FICTICIOS: la marca de las pruebas
 * es «NEW BALANCE» con modelos de prueba, y todo se borra al terminar. La configuración real del
 * panel y de la tienda nunca se usa (configurarPanel / abrirTienda la sustituyen).
 *
 *   npx playwright test tests/etapa18/importador.spec.js --workers=1
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PANEL, SITIO, entorno, servicio, crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, configurarPanel, ingresar,
  limpiarRestosDePruebas, revisarDisposicion, borrarCatalogo, prepararFotos, objetosDe, borrarObjetos
} from '../etapa16/ayudas-catalogo.js';
import { abrirDetalle } from '../etapa9/ayudas.js';

test.describe.configure({ mode: 'serial' });
// Lotes con fotos reales, la tienda en dos tamaños y recargas: más que los 30 s por omisión.
test.setTimeout(180000);

const MARCA = 'NEW BALANCE';
// Modelos que crean estas pruebas (y solo estos se borran).
const MODELOS = ['603', '1080', '9060 P18', 'MIXTA P18', 'ANTIGUA P18', 'EXISTE P18', 'LOTE A P18', 'LOTE B P18'];
const CAPTURAS = path.join(os.tmpdir(), 'gama-talla-18-capturas');
const TELEFONO = '+57 300 000 0000';
const MENSAJE_603 = `RECARGA 🔥🔥\nNew Balance 603 🇺🇸\nHombre $115.000 🔥\n40 al 44 Euro ✅\nTe atiendo por aquí hoy ${TELEFONO}`;
const MENSAJE_1080 = 'RECARGA 🔥🔥\nNew Balance 1080 🇺🇸\nDama $125.000 🌸\n36 al 39 Euro ✅';
let admin; let archivos;

async function limpiar18() {
  const lista = MODELOS.map((m) => `"${m}"`).join(',');
  const productos = await servicio('GET', `/rest/v1/productos?select=id,variantes(id)&marca=eq.${encodeURIComponent(MARCA)}&nombre=in.(${encodeURIComponent(lista)})`);
  for (const p of productos) await borrarObjetos((await objetosDe(p.id)).map((o) => o.nombre));
  if (productos.length) await borrarCatalogo({ productos, variantes: productos.flatMap((p) => p.variantes) });
  return productos.length;
}
const leerProducto = async (nombre) => (await servicio('GET',
  `/rest/v1/productos?select=id,codigo_interno,nombre,marca,categoria,publico,segmento,activo,ultima_operacion,variantes(id,codigo_variante,color,precio,orden,muestra_color,forma_muestra,fotos(ruta,orden))&marca=eq.${encodeURIComponent(MARCA)}&nombre=eq.${encodeURIComponent(nombre)}`));
const tallasDe = (ids) => servicio('GET', `/rest/v1/tallas?select=variante_id,talla,estado,activa&variante_id=in.(${ids.join(',')})`);

test.beforeAll(async ({}, info) => {
  entorno();
  const columna = await servicio('GET', '/rest/v1/variantes?select=forma_muestra&limit=1').then(() => true, () => false);
  test.skip(!columna, 'Falta aplicar la migración 20261117010000_forma_muestra_color en el Supabase local.');
  await limpiarRestosDePruebas();
  await limpiar18();
  admin = await crearUsuario(`panel18-${info.project.name}-${Date.now().toString(36)}@gamaytalla.test`);
  await hacerAdmin(admin.id);
  archivos = await prepararFotos();
  fs.mkdirSync(CAPTURAS, { recursive: true });
});
test.afterAll(async () => {
  await limpiar18().catch(() => null);
  if (admin) { await quitarAdmin(admin.id).catch(() => null); await borrarUsuario(admin.id); }
});
test.afterEach(async () => { await limpiar18(); });

// ---------------------------------------------------------------- ayudas
const importador = (page) => page.locator('#importador');
const ficha = (page, n) => importador(page).locator('.importador-ficha').nth(n);
const color = (fichaLoc, n) => fichaLoc.locator('.importador-color').nth(n);

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
/* WebKit: page.screenshot() inserta un <style> propio de Playwright y la CSP del panel
   (style-src sin 'unsafe-inline') lo rechaza con ESTE aviso. El texto es idéntico al que daría un
   <style> en línea del propio panel, así que no se filtra por texto en toda la prueba: solo se descarta
   UNA aparición exacta, en WebKit, emitida durante la captura. Cualquier otro aviso CSP (o este mismo
   fuera de la captura) sigue haciendo fallar la prueba. */
const AVISO_CAPTURA_WEBKIT = "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.";
async function capturarPanel(page, problemas, browserName, opciones) {
  const desde = problemas.length;
  await page.screenshot(opciones);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null)))); // entrega los avisos pendientes de la captura
  if (browserName !== 'webkit') return;
  const i = problemas.indexOf(AVISO_CAPTURA_WEBKIT, desde);
  if (i >= 0) problemas.splice(i, 1);
}
async function abrirImportador(page) {
  await page.getByRole('button', { name: 'Importar desde WhatsApp' }).click();
  await expect(importador(page)).toBeVisible();
  // Lote nuevo: el cuadro del mensaje es lo primero y recibe el foco.
  await expect(importador(page).getByLabel(MENSAJE).first()).toBeFocused();
}
const MENSAJE = 'Pega aquí el mensaje de WhatsApp';
async function pegar(colorLoc, textoPublicacion) {
  await colorLoc.getByLabel(MENSAJE).fill(textoPublicacion);
}
// «Ajustes para varias fichas» es un bloque plegable: se abre antes de usarlo.
async function abrirAjustes(page) {
  const ajustes = importador(page).locator('#imp-ajustes');
  if (!(await ajustes.evaluate((d) => d.open))) await ajustes.locator('summary').click();
  await expect(ajustes.getByRole('button', { name: /^Aplicar ajustes a [0-9]+ fichas?$/ })).toBeVisible();
}
const radioPublico = (f, nombre) => f.getByRole('group', { name: /^Público en la tienda/ }).getByRole('radio', { name: nombre, exact: true });
// Marca y Categoría tienen sugerencias (rol combobox); Modelo es un cuadro de texto: se buscan por etiqueta.
const campoFicha = (f, nombre) => f.getByLabel(new RegExp(`^${nombre} \\(obligatorio\\)`));
async function esperarFotosListas(colorLoc, n) {
  await expect(colorLoc.locator('.editor-foto.es-lista')).toHaveCount(n, { timeout: 30000 });
}

async function abrirTienda(browser, vista) {
  const e = entorno();
  const contexto = await browser.newContext({ locale: 'es-CO', viewport: { width: vista.ancho, height: vista.alto }, isMobile: vista.ancho < 500, hasTouch: vista.ancho < 500 });
  await contexto.route(`${SITIO}/config.js`, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await contexto.addInitScript((conf) => { window.GAMA_TALLA_CONFIG = conf; }, { supabaseUrl: e.api, clavePublicable: e.publicable });
  const pagina = await contexto.newPage();
  await pagina.goto(`${SITIO}/?intro=no`);
  await pagina.waitForFunction("typeof estado !== 'undefined' && estado.catalogoListo === true", null, { timeout: 30000 });
  return { contexto, pagina };
}

// ======================================================================== 1. lectura
test('lee los dos mensajes del proveedor en el navegador y omite teléfono y texto promocional', async ({ page }) => {
  const problemas = await abrirPanel(page);
  const enviados = [];
  page.on('request', (r) => { const cuerpo = r.postData() || ''; if (/RECARGA|300 000 0000|Te atiendo/.test(r.url() + cuerpo)) enviados.push(r.url()); });
  await abrirImportador(page);

  const f1 = ficha(page, 0);
  await pegar(color(f1, 0), MENSAJE_603);
  await expect(campoFicha(f1, 'Marca')).toHaveValue('NEW BALANCE');
  await expect(campoFicha(f1, 'Modelo')).toHaveValue('603');
  await expect(radioPublico(f1, 'Hombre')).toBeChecked();
  await expect(color(f1, 0).getByLabel(/^Precio del proveedor/)).toHaveValue('115000');
  await expect(color(f1, 0).getByLabel(/^Tallas EU/)).toHaveValue('40; 41; 42; 43; 44');
  await expect(color(f1, 0).locator('.importador-tallas-leidas')).toHaveText('5 tallas: 40 · 41 · 42 · 43 · 44');
  // El color no viene en el mensaje: queda vacío y marcado para revisar.
  await expect(color(f1, 0).getByRole('textbox', { name: /^Color \(obligatorio\) Revisar/ })).toHaveValue('');
  await expect(color(f1, 0).locator('.importador-lectura')).toContainText('Se omitió un teléfono y una línea promocional');
  // Ni el teléfono ni «RECARGA» pasan a ningún campo de la ficha.
  const valores = await f1.locator('input:not([type=radio]):not([type=checkbox]):not([type=file])').evaluateAll((ns) => ns.map((n) => n.value).join(' | '));
  expect(valores).not.toMatch(/RECARGA|300|atiendo/i);

  await importador(page).getByRole('button', { name: 'Añadir otra publicación' }).click();
  const f2 = ficha(page, 1);
  await expect(color(f2, 0).getByLabel(MENSAJE)).toBeFocused();
  await pegar(color(f2, 0), MENSAJE_1080);
  await expect(campoFicha(f2, 'Modelo')).toHaveValue('1080');
  await expect(radioPublico(f2, 'Dama')).toBeChecked();
  await expect(color(f2, 0).getByLabel(/^Precio del proveedor/)).toHaveValue('125000');
  await expect(color(f2, 0).getByLabel(/^Tallas EU/)).toHaveValue('36; 37; 38; 39');
  // Público y guía de tallas son independientes: la guía no se deduce del público.
  await expect(f2.getByRole('group', { name: /Tabla de la guía de tallas/ }).getByRole('radio', { name: /Sin indicar/ })).toBeChecked();
  expect(enviados, 'el texto del proveedor no sale del navegador').toEqual([]);
  expect(problemas).toEqual([]);
});

// ======================================================================== 2. lote completo
test('agrupa colores, fija el precio de venta, guarda oculto y la tienda mezcla un círculo y dos miniaturas', async ({ page, browser, browserName }) => {
  const problemas = await abrirPanel(page);
  await abrirImportador(page);
  const textos = [
    'New Balance 9060 P18\nBlanco con rojo\nUnisex $200.000\n40 al 42 Euro ✅',
    'New Balance 9060 P18\nBlanco con azul\nUnisex $200.000\n38; 39',
    'New Balance 9060 P18\nNegro\nUnisex $210.000\n41 al 43 Euro'
  ];
  for (const [i, t] of textos.entries()) {
    if (i) await importador(page).getByRole('button', { name: 'Añadir otra publicación' }).click();
    await pegar(color(ficha(page, i), 0), t);
    await expect(campoFicha(ficha(page, i), 'Modelo')).toHaveValue('9060 P18');
  }
  await expect(color(ficha(page, 0), 0).getByRole('textbox', { name: /^Color \(obligatorio\)/ })).toHaveValue('BLANCO CON ROJO');
  // Fotos: dos para «Blanco con rojo» (la segunda pasa a principal), una para cada uno de los otros.
  await color(ficha(page, 0), 0).locator('input[type=file]').setInputFiles([archivos.grande, archivos.adecuada]);
  await esperarFotosListas(color(ficha(page, 0), 0), 2);
  await color(ficha(page, 0), 0).getByRole('button', { name: 'Hacer principal la foto 2' }).click();
  await color(ficha(page, 1), 0).locator('input[type=file]').setInputFiles([archivos.otra]);
  await esperarFotosListas(color(ficha(page, 1), 0), 1);
  // Arrastrar y soltar en escritorio: la zona acepta archivos soltados.
  const datos = await page.evaluateHandle(async (bytes) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], 'soltada.png', { type: 'image/png' }));
    return dt;
  }, [...fs.readFileSync(archivos.png)]);
  const zona = color(ficha(page, 2), 0).locator('.importador-soltar');
  await zona.dispatchEvent('dragenter', { dataTransfer: datos });
  await zona.dispatchEvent('dragover', { dataTransfer: datos });
  await expect(zona).toHaveClass(/es-encima/);
  await zona.dispatchEvent('drop', { dataTransfer: datos });
  await esperarFotosListas(color(ficha(page, 2), 0), 1);

  // Coincidencias en el lote: las fichas 2 y 3 proponen agruparse con la 1.
  await expect(ficha(page, 1).locator('.importador-coincidencia')).toContainText('Mismo modelo que la ficha 1');
  await ficha(page, 1).getByRole('button', { name: 'Agrupar como color de la ficha 1' }).click();
  await expect(importador(page).locator('.importador-ficha')).toHaveCount(2);
  await ficha(page, 1).getByRole('button', { name: 'Agrupar como color de la ficha 1' }).click();
  await expect(importador(page).locator('.importador-ficha')).toHaveCount(1);
  const f = ficha(page, 0);
  await expect(f.locator('.importador-color')).toHaveCount(3);
  await expect(color(f, 1).getByRole('textbox', { name: /^Color \(obligatorio\)/ })).toHaveValue('BLANCO CON AZUL');
  // Una línea que solo tiene tallas («38; 39») también se lee como tallas.
  await expect(color(f, 1).getByLabel(/^Tallas EU/)).toHaveValue('38; 39');

  // Cómo mostrar cada color: círculo con tono propio para el negro y foto para los dos blancos.
  await color(f, 0).getByRole('radio', { name: 'Foto de la zapatilla' }).check();
  await color(f, 1).getByRole('radio', { name: 'Foto de la zapatilla' }).check();
  await color(f, 2).getByRole('textbox', { name: 'Tono del círculo', exact: true }).fill('#141414');
  await expect(color(f, 0).locator('.editor-forma-vista.es-foto img')).toHaveCount(1);
  await expect(color(f, 0).locator('.editor-forma-aviso')).toBeHidden();

  // Sin categoría ni precio de venta no se guarda nada.
  await importador(page).getByRole('button', { name: /Guardar lote como oculto/ }).click();
  await expect(f.locator('.importador-errores')).toContainText('Escribe la categoría.');
  await expect(f.locator('.importador-errores')).toContainText('Fija el precio de venta de BLANCO CON ROJO');
  expect(await leerProducto('9060 P18')).toEqual([]);

  // Ajustes del lote: categoría y guía para todas; precio = proveedor + 40.000, con un ajuste a mano.
  await abrirAjustes(page);
  await importador(page).getByLabel('Categoría', { exact: true }).fill('Urbanas');
  await importador(page).locator('.importador-ajustes').getByRole('radio', { name: 'Mujer' }).check();
  await importador(page).getByLabel('Sumar al precio del proveedor (COP)').fill('40000');
  await importador(page).getByRole('button', { name: /^Aplicar ajustes a [0-9]+ fichas?$/ }).click();
  await expect(color(f, 0).getByLabel(/^Precio de venta/)).toHaveValue('240000');
  await expect(color(f, 2).getByLabel(/^Precio de venta/)).toHaveValue('250000');
  await color(f, 1).getByLabel(/^Precio de venta/).fill('245000');
  await expect(color(f, 1).locator('#' + await color(f, 1).getByLabel(/^Precio de venta/).getAttribute('aria-describedby'))).toContainText('escrito a mano');
  // Volver a aplicar el valor del lote no pisa el precio escrito a mano.
  await importador(page).getByRole('button', { name: /^Aplicar ajustes a [0-9]+ fichas?$/ }).click();
  await expect(importador(page).locator('#importador-resultado')).toContainText('en 2 colores. 1 precio escrito a mano se conservó.');
  await expect(color(f, 1).getByLabel(/^Precio de venta/)).toHaveValue('245000');
  await expect(campoFicha(f, 'Categoría')).toHaveValue('URBANAS');

  await page.setViewportSize({ width: 390, height: 844 });
  await importador(page).locator('.importador-color').nth(0).scrollIntoViewIfNeeded();
  await capturarPanel(page, problemas, browserName, { path: path.join(CAPTURAS, `importador-${browserName}-390.png`) });
  const disposicion = await revisarDisposicion(page);
  expect(disposicion.desborde, 'sin desplazamiento horizontal en 390 px').toBe(0);
  await page.setViewportSize({ width: 1280, height: 900 });

  await importador(page).getByRole('button', { name: /Guardar lote como oculto/ }).click();
  await expect(f.locator('.importador-estado')).toContainText(/Guardada oculta · GT-/, { timeout: 30000 });
  await expect(importador(page).locator('#importador-resultado')).toContainText('Se guardó 1 de 1 ficha como ocultas');

  const [p] = await leerProducto('9060 P18');
  expect(p).toMatchObject({ categoria: 'URBANAS', publico: 'unisex', segmento: 'mujer', activo: false });
  const vs = [...p.variantes].sort((a, b) => a.orden - b.orden);
  expect(vs.map((v) => [v.color, v.precio, v.forma_muestra, v.muestra_color])).toEqual([
    ['BLANCO CON ROJO', 240000, 'foto', null], ['BLANCO CON AZUL', 245000, 'foto', null], ['NEGRO', 250000, 'circulo', '#141414']
  ]);
  expect(vs.map((v) => v.fotos.length)).toEqual([2, 1, 1]);
  for (const v of vs) for (const foto of v.fotos) expect(foto.ruta).toMatch(new RegExp(`/fotos-catalogo/productos/${p.id}/${v.id}/\\d{13}-[0-9a-z]{10}\\.webp$`));
  const objetos = await objetosDe(p.id);
  expect(objetos).toHaveLength(4);
  expect(objetos.every((o) => o.tipo === 'image/webp')).toBe(true);
  const tallas = await tallasDe(vs.map((v) => v.id));
  expect(tallas.every((t) => t.estado === 'REVISAR' && t.activa)).toBe(true);
  expect(tallas.filter((t) => t.variante_id === vs[0].id).map((t) => t.talla).sort()).toEqual(['40', '41', '42']);

  // Publicar con la acción actual del panel (el importador nunca publica).
  await importador(page).getByRole('button', { name: 'Abrir en el editor' }).click();
  const editor = page.locator('#editor');
  await expect(editor).toBeVisible();
  await expect(editor.locator('.editor-variante').nth(0).getByRole('radio', { name: 'Foto de la zapatilla' })).toBeChecked();
  await expect(editor.locator('.editor-variante').nth(2).getByRole('radio', { name: 'Círculo de color' })).toBeChecked();
  await editor.getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(page.locator('#editor-resultado')).toContainText('Publicada', { timeout: 15000 });
  await editor.getByRole('button', { name: 'Cerrar', exact: true }).first().click();
  await expect(editor).toBeHidden();
  await expect(importador(page)).toBeVisible();
  // Sin filtros: el único aviso de la captura en WebKit ya lo retiró capturarPanel.
  expect(problemas).toEqual([]);

  // Tienda: celular y escritorio. Un círculo y dos miniaturas en el mismo selector.
  for (const vista of [{ ancho: 390, alto: 844 }, { ancho: 1440, alto: 900 }]) {
    const { contexto, pagina } = await abrirTienda(browser, vista);
    try {
      const detalle = await abrirDetalle(pagina, '9060 P18');
      const piezas = detalle.locator('.variante-muestra');
      await expect(piezas).toHaveCount(3);
      await expect(detalle.locator('.variante-miniatura')).toHaveCount(2);
      await expect(detalle.locator('.variante-muestra .muestra-circulo')).toHaveCount(1);
      await expect(piezas.nth(0)).toHaveAccessibleName('BLANCO CON ROJO');
      await expect(piezas.nth(1)).toHaveAccessibleName('BLANCO CON AZUL');
      await expect(piezas.nth(2)).toHaveAccessibleName('NEGRO');
      // La miniatura es la foto principal de ese color (la que se hizo principal en el importador).
      const principal = vs[0].fotos.find((x) => x.orden === 0).ruta;
      await expect(piezas.nth(0).locator('img')).toHaveAttribute('src', principal);
      const medidas = await piezas.evaluateAll((bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return [r.width, r.height]; }));
      for (const [w, h] of medidas) { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44); }
      await expect(piezas.nth(0)).toHaveAttribute('aria-pressed', 'true');
      const anillo = await piezas.nth(0).locator('.muestra-foto').evaluate((n) => getComputedStyle(n).boxShadow);
      expect(anillo, 'la miniatura elegida lleva el anillo de tinta').toMatch(/5px/);
      // Cambiar de color actualiza galería, precio, código y tallas.
      await piezas.nth(1).click();
      await expect(piezas.nth(1)).toHaveAttribute('aria-pressed', 'true');
      await expect(piezas.nth(0)).toHaveAttribute('aria-pressed', 'false');
      await expect(detalle.locator('#detalle-color')).toHaveText('BLANCO CON AZUL');
      await expect(detalle.locator('#detalle-precio')).toContainText('245.000');
      await expect(detalle.locator('#detalle-referencia')).toHaveText(vs[1].codigo_variante);
      await expect(detalle.locator('.galeria-pista img').first()).toHaveAttribute('src', vs[1].fotos[0].ruta);
      await expect(detalle.locator('.talla[data-talla="38"]')).toBeVisible();
      await piezas.nth(2).click();
      await expect(detalle.locator('#detalle-precio')).toContainText('250.000');
      await expect(detalle.locator('.talla[data-talla="43"]')).toBeVisible();
      // La galería muestra la foto del color elegido (cargada, no solo con la ruta puesta).
      await expect(detalle.locator('.galeria-pista img').first()).toHaveAttribute('src', vs[2].fotos[0].ruta);
      await expect.poll(() => detalle.locator('.galeria-pista img').first().evaluate((img) => img.complete && img.naturalWidth > 0), { timeout: 15000 }).toBe(true);
      await pagina.waitForTimeout(400);
      await pagina.screenshot({ path: path.join(CAPTURAS, `selector-mixto-${browserName}-${vista.ancho}.png`) });
      // Recargar: la elección viene de Supabase y se conserva.
      await pagina.reload();
      await pagina.waitForFunction("typeof estado !== 'undefined' && estado.catalogoListo === true", null, { timeout: 30000 });
      const otra = await abrirDetalle(pagina, '9060 P18');
      await expect(otra.locator('.variante-miniatura')).toHaveCount(2);
      await expect(otra.locator('.variante-muestra .muestra-circulo')).toHaveCount(1);
    } finally {
      await contexto.close();
    }
  }
});

// ======================================================================== 3. editor y respaldo
test('editor: cambiar a foto, recargar se conserva; sin fotos avisa y la tienda usa el círculo; ficha antigua', async ({ page, browser }) => {
  // Una ficha «antigua»: insertada sin el campo (como los registros anteriores a la migración).
  const [p] = await servicio('POST', '/rest/v1/productos?select=id', [{ nombre: 'ANTIGUA P18', marca: MARCA, categoria: 'URBANAS', publico: 'hombre', activo: true }], 'return=representation');
  const variantes = await servicio('POST', '/rest/v1/variantes?select=id', [
    { producto_id: p.id, color: 'GRIS', precio: 180000, orden: 0 }, { producto_id: p.id, color: 'AZUL', precio: 180000, orden: 1 }], 'return=representation');
  await servicio('POST', '/rest/v1/fotos', [{ variante_id: variantes[0].id, ruta: 'assets/images/productos/editadas/zapatilla_01.webp', orden: 0 }]);
  await servicio('POST', '/rest/v1/tallas', variantes.map((v) => ({ variante_id: v.id, talla: '41', estado: 'REVISAR', activa: true })));
  const leidas = await servicio('GET', `/rest/v1/variantes?select=forma_muestra&producto_id=eq.${p.id}`);
  expect(leidas.map((v) => v.forma_muestra)).toEqual(['circulo', 'circulo']);

  const problemas = await abrirPanel(page);
  const tarjeta = page.locator('.producto', { hasText: 'ANTIGUA P18' });
  await tarjeta.getByRole('button', { name: /^Editar ANTIGUA P18/ }).click();
  const editor = page.locator('#editor');
  const gris = editor.locator('.editor-variante').nth(0);
  const azul = editor.locator('.editor-variante').nth(1);
  await expect(gris.getByRole('radio', { name: 'Círculo de color' })).toBeChecked();
  await gris.getByRole('radio', { name: 'Foto de la zapatilla' }).check();
  await expect(gris.locator('.editor-forma-vista.es-foto img')).toHaveCount(1);
  // El azul no tiene fotos: se puede elegir «foto», pero se avisa de que la tienda usará el círculo.
  await azul.getByRole('radio', { name: 'Foto de la zapatilla' }).check();
  await expect(azul.locator('.editor-forma-aviso')).toBeVisible();
  await expect(azul.locator('.editor-forma-aviso')).toContainText('no tiene fotos');
  await editor.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.locator('#editor-resultado')).toContainText('Guardado', { timeout: 15000 });
  await expect(gris.getByRole('radio', { name: 'Foto de la zapatilla' })).toBeChecked();
  await editor.getByRole('button', { name: 'Cerrar', exact: true }).first().click();
  // El tablero avisa del color con «foto» sin fotos.
  await expect(page.locator('.producto', { hasText: 'ANTIGUA P18' }).locator('.variante-aviso-forma')).toHaveCount(1);
  // Recargar el panel: la elección viene del servidor.
  await page.reload();
  await expect(page.locator('#tablero')).not.toHaveAttribute('aria-busy', 'true');
  await page.locator('.producto', { hasText: 'ANTIGUA P18' }).getByRole('button', { name: /^Editar/ }).click();
  await expect(editor.locator('.editor-variante').nth(0).getByRole('radio', { name: 'Foto de la zapatilla' })).toBeChecked();
  await expect(editor.locator('.editor-variante').nth(1).getByRole('radio', { name: 'Foto de la zapatilla' })).toBeChecked();
  expect(problemas).toEqual([]);

  const { contexto, pagina } = await abrirTienda(browser, { ancho: 390, alto: 844 });
  try {
    const detalle = await abrirDetalle(pagina, 'ANTIGUA P18');
    await expect(detalle.locator('.variante-miniatura')).toHaveCount(1);
    // AZUL está en «foto» pero sin fotos: la tienda usa su círculo.
    await expect(detalle.locator('.variante-muestra').nth(1).locator('.muestra-circulo')).toHaveCount(1);
    await expect(detalle.locator('.variante-muestra').nth(1)).toHaveAccessibleName('AZUL');
  } finally {
    await contexto.close();
  }
});

// ======================================================================== 4. catálogo existente
test('coincidencia con el catálogo: muestra código y colores, abre el editor y exige decidir', async ({ page }) => {
  const [p] = await servicio('POST', '/rest/v1/productos?select=id,codigo_interno', [{ nombre: 'EXISTE P18', marca: MARCA, categoria: 'URBANAS', publico: 'dama', activo: false }], 'return=representation');
  await servicio('POST', '/rest/v1/variantes', [{ producto_id: p.id, color: 'ROSA', precio: 150000, orden: 0 }]);
  const codigo = (await servicio('GET', `/rest/v1/productos?select=codigo_interno&id=eq.${p.id}`))[0].codigo_interno;
  const problemas = await abrirPanel(page);
  await abrirImportador(page);
  const f = ficha(page, 0);
  await pegar(color(f, 0), 'New Balance Existe P18\nDama 130 mil\nBlanco\n36 al 38');
  const aviso = f.locator('.importador-coincidencia.es-catalogo');
  await expect(aviso).toContainText(codigo);
  await expect(aviso).toContainText('Colores: ROSA');
  await expect(aviso).toContainText('oculta');
  await campoFicha(f, 'Categoría').fill('URBANAS');
  await color(f, 0).getByLabel(/^Precio de venta/).fill('170000');
  await importador(page).getByRole('button', { name: /Guardar lote como oculto/ }).click();
  await expect(f.locator('.importador-errores')).toContainText('ya está en el catálogo');
  await expect(f.getByLabel('Crear otra ficha con este mismo modelo de todas formas')).toBeFocused();
  expect(await leerProducto('EXISTE P18')).toHaveLength(1);
  // «Abrir en el editor» abre la zapatilla existente encima del importador; al cerrar, el lote sigue.
  await aviso.getByRole('button', { name: new RegExp(`Abrir ${codigo} en el editor`) }).click();
  const editor = page.locator('#editor');
  await expect(editor).toBeVisible();
  await expect(page.locator('#editor-codigo')).toHaveText(codigo);
  await editor.getByRole('button', { name: 'Cerrar', exact: true }).first().click();
  await expect(editor).toBeHidden();
  await expect(color(f, 0).getByLabel(/^Precio de venta/)).toHaveValue('170000');
  // Decisión explícita: se crea otra ficha con el mismo modelo.
  await f.getByLabel('Crear otra ficha con este mismo modelo de todas formas').check();
  await importador(page).getByRole('button', { name: /Guardar lote como oculto/ }).click();
  await expect(f.locator('.importador-estado')).toContainText('Guardada oculta', { timeout: 30000 });
  expect(await leerProducto('EXISTE P18')).toHaveLength(2);
  expect(problemas).toEqual([]);
});

// ======================================================================== 5. fallos y reintento
test('fallo parcial: una ficha rechazada y otra con la respuesta perdida; se comprueba y se reintenta sin duplicar', async ({ page }) => {
  const problemas = await abrirPanel(page);
  await abrirImportador(page);
  const textos = ['New Balance Lote A P18\nHombre $100.000\nNegro\n40 al 41', 'New Balance Lote B P18\nDama $110.000\nBlanco\n37; 38', 'New Balance 1080\nDama $125.000\nGris\n36 al 39 Euro'];
  for (const [i, t] of textos.entries()) {
    if (i) await importador(page).getByRole('button', { name: 'Añadir otra publicación' }).click();
    await pegar(color(ficha(page, i), 0), t);
    await expect(campoFicha(ficha(page, i), 'Marca')).toHaveValue('NEW BALANCE');
  }
  await abrirAjustes(page);
  await importador(page).getByLabel('Categoría', { exact: true }).fill('Running');
  await importador(page).getByLabel('Sumar al precio del proveedor (COP)').fill('30000');
  await importador(page).getByRole('button', { name: /^Aplicar ajustes a [0-9]+ fichas?$/ }).click();

  // Lote B: el servidor lo rechaza. 1080: la petición LLEGA al servidor pero la respuesta se pierde.
  let rechazos = 0; let perdidas = 0;
  await page.route('**/rest/v1/rpc/fn_admin_guardar_producto', async (route) => {
    const cuerpo = route.request().postDataJSON();
    if (cuerpo.p_datos.nombre === 'LOTE B P18' && rechazos === 0) {
      rechazos += 1;
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'PT422', message: 'Rechazo simulado por la prueba.', details: null, hint: null }) });
    }
    if (cuerpo.p_datos.nombre === '1080' && perdidas === 0) {
      perdidas += 1;
      await route.fetch();          // se aplica en el servidor…
      return route.abort('failed'); // …y el navegador no recibe la respuesta.
    }
    return route.continue();
  });
  await importador(page).getByRole('button', { name: 'Guardar lote como oculto (3)' }).click();
  await expect(ficha(page, 0).locator('.importador-estado')).toContainText('Guardada oculta', { timeout: 30000 });
  await expect(ficha(page, 1).locator('.importador-estado')).toContainText('Rechazo simulado por la prueba.');
  await expect(ficha(page, 2).locator('.importador-estado')).toContainText('comprobado con el identificador de esta operación', { timeout: 30000 });
  await expect(importador(page).locator('#importador-resultado')).toContainText('Se guardaron 2 de 3 fichas');
  await expect(importador(page).locator('#importador-resultado')).toContainText('1 no se pudo guardar');
  // La fallida conserva sus datos y sigue marcada; las guardadas ya no se envían.
  await expect(campoFicha(ficha(page, 1), 'Modelo')).toHaveValue('LOTE B P18');
  await expect(color(ficha(page, 1), 0).getByLabel(/^Precio de venta/)).toHaveValue('140000');
  await importador(page).getByRole('button', { name: 'Guardar lote como oculto (1)' }).click();
  await expect(ficha(page, 1).locator('.importador-estado')).toContainText('Guardada oculta', { timeout: 30000 });
  for (const nombre of ['LOTE A P18', 'LOTE B P18', '1080']) expect(await leerProducto(nombre), nombre).toHaveLength(1);
  const [p1080] = await leerProducto('1080');
  expect(p1080.variantes[0].precio).toBe(155000);
  // El único error esperado es el de la petición que la prueba corta a propósito (cada navegador lo dice a su manera).
  expect(problemas.filter((x) => !/Failed to fetch|ERR_FAILED|net::|NetworkError|Load failed|CORS request did not succeed|fn_admin_guardar_producto/.test(x))).toEqual([]);
});

// ======================================================================== 6. build
test('la captura solo retira su propio aviso CSP en WebKit; un estilo en línea del panel sigue contando', async ({ page, browserName }) => {
  const problemas = [];
  const csp = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problemas.push(m.text());
    if (/Content Security Policy|Content-Security-Policy/i.test(m.text())) csp.push(m.text());
  });
  await configurarPanel(page);
  await page.goto(PANEL);
  await expect(page.getByLabel('Correo')).toBeVisible();
  await capturarPanel(page, problemas, browserName, { path: path.join(CAPTURAS, `csp-${browserName}-antes.png`) });
  expect(problemas, 'la captura no deja avisos').toEqual([]);
  // Lo que el panel NO debe hacer: un <style> en línea. La CSP lo rechaza y la prueba lo ve.
  await page.evaluate(() => { const e = document.createElement('style'); e.textContent = 'body { outline: 0 }'; document.head.append(e); });
  await expect.poll(() => csp.length, { message: 'la CSP del panel rechaza el estilo en línea y se informa' }).toBeGreaterThan(0);
  if (browserName === 'webkit') {
    expect(problemas).toEqual([AVISO_CAPTURA_WEBKIT]);
    // Una captura posterior retira SOLO su propio aviso: el del panel sigue ahí.
    await capturarPanel(page, problemas, browserName, { path: path.join(CAPTURAS, `csp-${browserName}-despues.png`) });
    expect(problemas).toEqual([AVISO_CAPTURA_WEBKIT]);
  }
});

test('el build de Netlify incluye los archivos nuevos del panel', async () => {
  const { spawnSync } = await import('node:child_process');
  const raiz = path.resolve('.');
  const temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-18-build-'));
  try {
    const salida = path.join(temporal, 'dist');
    const r = spawnSync(process.execPath, [path.join(raiz, 'scripts', 'preparar-publicacion.mjs'), '--salida', salida], {
      cwd: raiz, encoding: 'utf8',
      env: { ...process.env, SUPABASE_URL: 'https://mwhiusocfdwzxnzenfsz.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_FICTICIA_etapa_18', WHATSAPP_COMERCIAL: '+57 300 123 4567' }
    });
    expect(r.status, r.stderr).toBe(0);
    for (const archivo of ['admin/texto-proveedor.js', 'admin/importador.js', 'admin/editor.js', 'admin/fotos.js']) {
      expect(fs.readFileSync(path.join(salida, archivo), 'utf8'), archivo).toBe(fs.readFileSync(path.join(raiz, archivo), 'utf8'));
    }
    const html = fs.readFileSync(path.join(salida, 'admin/index.html'), 'utf8');
    expect(html).toContain('src="importador.js"');
    expect(html).toContain('src="texto-proveedor.js"');
    expect(fs.readFileSync(path.join(salida, 'app.js'), 'utf8')).toContain('crearMiniaturaColor');
    expect(fs.existsSync(path.join(salida, 'supabase')), 'las migraciones no se publican').toBe(false);
  } finally {
    fs.rmSync(temporal, { recursive: true, force: true });
  }
});
