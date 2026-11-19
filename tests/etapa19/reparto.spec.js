// @ts-check
/* Etapa 19 · Importador: lector mejorado y «Asignar fotos por lote».
 *
 * SOLO contra el stack local desechable de Supabase (con Storage) y el sitio servido en 127.0.0.1:8765.
 * Usuarios, productos y fotos FICTICIOS (marcas «NEW BALANCE» y «REEBOK» con modelos «… P19»); todo se
 * borra al terminar. La configuración real del panel nunca se usa (configurarPanel la sustituye).
 *
 *   npx playwright test tests/etapa19/reparto.spec.js --workers=1
 */
import { test, expect, chromium } from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PANEL, entorno, servicio, crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, configurarPanel, ingresar,
  revisarDisposicion, borrarCatalogo, prepararFotos, objetosDe, borrarObjetos
} from '../etapa16/ayudas-catalogo.js';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180000);

const PRUEBAS = [['REEBOK', 'PRINCENSA P19'], ['REEBOK', 'PRINCENSA DOS P19'], ['NEW BALANCE', 'REPARTO A P19'], ['NEW BALANCE', 'REPARTO B P19'],
  ['NEW BALANCE', 'REPARTO C P19'], ['NEW BALANCE', 'REPARTO D P19'], ['NEW BALANCE', 'REPARTO E P19']];
const CAPTURAS = path.join(os.tmpdir(), 'gama-talla-19-capturas');
const FOTOS19 = path.join(os.tmpdir(), 'gama-talla-19-fotos');
const MENSAJE = 'Pega aquí el mensaje de WhatsApp';
const CAPTURA = 'REEBOK PRINCENSA 💰$105.000 DAMA 👸 Y CABALLERO 🤴 TODAS LAS TALLAS🔥\n\nDinos y te ayudamos sin falta\n👉 +57 3000000000';
const T36_44 = '36; 37; 38; 39; 40; 41; 42; 43; 44';
let admin; let archivos; let lote19;

const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

/* Cuatro fotos WebP FICTICIAS, pequeñas y distintas (de 800 px y menos de 300 KB): el panel las sube
   tal cual, sin recomprimir, así que el archivo guardado es idéntico byte a byte y se puede comprobar
   qué foto quedó en cada color. Y un archivo de texto con extensión de imagen. */
async function prepararFotos19() {
  fs.mkdirSync(FOTOS19, { recursive: true });
  const lista = { a: 'a-roja.webp', b: 'b-verde.webp', c: 'c-azul.webp', d: 'd-amarilla.webp' };
  const rutas = Object.fromEntries(Object.entries(lista).map(([k, n]) => [k, path.join(FOTOS19, n)]));
  rutas.falsa = path.join(FOTOS19, 'e-no-es-foto.webp');
  if (Object.values(rutas).every((f) => fs.existsSync(f))) return rutas;
  const navegador = await chromium.launch();
  try {
    const pagina = await navegador.newPage();
    for (const [i, k] of ['a', 'b', 'c', 'd'].entries()) {
      const bytes = await pagina.evaluate(async ([tono, letra]) => {
        const lienzo = document.createElement('canvas');
        lienzo.width = 800; lienzo.height = 800;
        const x = lienzo.getContext('2d');
        x.fillStyle = `hsl(${tono} 70% 50%)`; x.fillRect(0, 0, 800, 800);
        x.fillStyle = '#fff'; x.font = 'bold 300px sans-serif'; x.fillText(letra, 280, 520);
        const blob = await new Promise((r) => lienzo.toBlob(r, 'image/webp', 0.8));
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
      }, [[0, 120, 220, 55][i], k.toUpperCase()]);
      fs.writeFileSync(rutas[k], Buffer.from(bytes));
    }
    fs.writeFileSync(rutas.falsa, 'esto es texto, no una imagen\n');
  } finally {
    await navegador.close();
  }
  return rutas;
}

async function limpiar19() {
  let n = 0;
  for (const marca of ['REEBOK', 'NEW BALANCE']) {
    const modelos = PRUEBAS.filter(([m]) => m === marca).map(([, nombre]) => `"${nombre}"`).join(',');
    const productos = await servicio('GET', `/rest/v1/productos?select=id,variantes(id)&marca=eq.${encodeURIComponent(marca)}&nombre=in.(${encodeURIComponent(modelos)})`);
    for (const p of productos) await borrarObjetos((await objetosDe(p.id)).map((o) => o.nombre));
    if (productos.length) await borrarCatalogo({ productos, variantes: productos.flatMap((p) => p.variantes) });
    n += productos.length;
  }
  return n;
}
const leerProducto = async (marca, nombre) => (await servicio('GET',
  `/rest/v1/productos?select=id,nombre,marca,publico,activo,variantes(id,color,orden,fotos(ruta,orden))&marca=eq.${encodeURIComponent(marca)}&nombre=eq.${encodeURIComponent(nombre)}`))[0];

test.beforeAll(async ({}, info) => {
  entorno();
  await limpiar19();
  admin = await crearUsuario(`panel19-${info.project.name}-${Date.now().toString(36)}@gamaytalla.test`);
  await hacerAdmin(admin.id);
  archivos = await prepararFotos();
  lote19 = await prepararFotos19();
  fs.mkdirSync(CAPTURAS, { recursive: true });
});
test.afterAll(async () => {
  await limpiar19().catch(() => null);
  if (admin) { await quitarAdmin(admin.id).catch(() => null); await borrarUsuario(admin.id); }
});
test.afterEach(async () => { await limpiar19(); });

// ---------------------------------------------------------------- ayudas
const importador = (page) => page.locator('#importador');
const ficha = (page, n) => importador(page).locator('.importador-ficha').nth(n);
const color = (f, n) => f.locator('.importador-color').nth(n);
const reparto = (page) => importador(page).locator('#imp-reparto');
const items = (page) => reparto(page).locator('.importador-reparto-item');
const radioPublico = (f, nombre) => f.getByRole('group', { name: /^Público en la tienda/ }).getByRole('radio', { name: nombre, exact: true });
const campoTallas = (c) => c.getByLabel(/^Tallas EU/);

/* WebKit: la captura de Playwright inserta un <style> que la CSP del panel rechaza con este aviso (ver
   etapa 18): solo se descarta UNA aparición, en WebKit, emitida durante la captura. */
const AVISO_CAPTURA_WEBKIT = "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.";
async function capturar(page, problemas, browserName, nombre) {
  const desde = problemas.length;
  await page.screenshot({ path: path.join(CAPTURAS, nombre) });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  if (browserName !== 'webkit') return;
  const i = problemas.indexOf(AVISO_CAPTURA_WEBKIT, desde);
  if (i >= 0) problemas.splice(i, 1);
}

async function abrirPanel(page) {
  const problemas = [];
  page.on('pageerror', (e) => problemas.push(`EXCEPCIÓN: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problemas.push(m.text()); });
  await configurarPanel(page);
  await page.goto(PANEL);
  await ingresar(page, admin);
  await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
  await expect(page.locator('#tablero')).not.toHaveAttribute('aria-busy', 'true');
  await page.getByRole('button', { name: 'Importar desde WhatsApp' }).click();
  await expect(importador(page)).toBeVisible();
  return problemas;
}
async function publicaciones(page, textos) {
  for (const [i, t] of textos.entries()) {
    if (i) await importador(page).getByRole('button', { name: 'Añadir otra publicación' }).click();
    await color(ficha(page, i), 0).getByLabel(MENSAJE).fill(t);
  }
  await expect(ficha(page, textos.length - 1).getByRole('textbox', { name: /^Modelo/ })).not.toHaveValue('');
}
// «Asignar fotos por lote» abre el selector de archivos del sistema; se responde con estos archivos.
async function elegirLote(page, rutas) {
  const [selector] = await Promise.all([page.waitForEvent('filechooser'), reparto(page).getByRole('button', { name: /^(Asignar fotos por lote|Añadir más imágenes)$/ }).click()]);
  expect(selector.isMultiple()).toBe(true);
  await selector.setFiles(rutas);
}
async function esperarProcesadas(page) {
  await expect(items(page).filter({ hasText: 'Optimizando…' })).toHaveCount(0, { timeout: 30000 });
}
// [archivo, destino] de cada fila de la revisión, en orden.
async function filas(page) {
  return items(page).evaluateAll((ns) => ns.map((n) => {
    const elegida = n.querySelector('.importador-reparto-opciones input:checked');
    const texto = n.querySelector('.importador-reparto-destino-texto strong').textContent;
    // El texto visible y la opción marcada dicen lo mismo.
    if (elegida.nextElementSibling.textContent !== texto) throw new Error(`Destino incoherente: ${texto}`);
    return [n.querySelector('.importador-reparto-archivo').textContent, texto];
  }));
}
const origenes = (c) => c.locator('.importador-foto-origen').allTextContents();

// ======================================================================== 1. lector en el importador
test('mensaje Reebok: PRINCENSA, Unisex y tallas 36–44; sin público se pide y la regla sigue al público; lo manual se conserva', async ({ page, browserName }) => {
  const problemas = await abrirPanel(page);
  const enviados = [];
  page.on('request', (r) => { if (/3000000000|Dinos|ayudamos/.test(r.url() + (r.postData() || ''))) enviados.push(r.url()); });
  const f1 = ficha(page, 0);
  const c1 = color(f1, 0);
  await c1.getByLabel(MENSAJE).fill(CAPTURA);
  await expect(f1.getByRole('combobox', { name: /^Marca/ })).toHaveValue('REEBOK');
  await expect(f1.getByRole('textbox', { name: /^Modelo/ })).toHaveValue('PRINCENSA');
  await expect(radioPublico(f1, 'Unisex')).toBeChecked();
  await expect(c1.getByLabel(/^Precio del proveedor/)).toHaveValue('105000');
  await expect(campoTallas(c1)).toHaveValue(T36_44);
  await expect(c1.locator('.importador-tallas-leidas')).toHaveText('9 tallas: 36 · 37 · 38 · 39 · 40 · 41 · 42 · 43 · 44');
  const lectura = c1.locator('.importador-lectura');
  await expect(lectura).toContainText('Se omitió un teléfono y una frase de contacto.');
  await expect(lectura).toContainText('Tallas propuestas por «todas las tallas» (Unisex: 36 a 44).');
  await expect(lectura).toContainText('Revisa: color.');
  expect(await f1.getByRole('group', { name: /^Público en la tienda/ }).evaluate((n) => n.classList.contains('es-revisar'))).toBe(false);
  expect(await c1.getByRole('textbox', { name: /^Color \(obligatorio\)/ }).evaluate((n) => Boolean(n.closest('.es-revisar')))).toBe(true);
  const valores = await f1.locator('input:not([type=radio]):not([type=checkbox]):not([type=file]):not([type=color])').evaluateAll((ns) => ns.map((n) => n.value).join(' | '));
  expect(valores).not.toMatch(/3000000000|dinos|ayudamos|todas/i);
  await c1.locator('.importador-lectura').scrollIntoViewIfNeeded();
  await capturar(page, problemas, browserName, `lectura-reebok-${browserName}-1280.png`);
  await page.setViewportSize({ width: 390, height: 844 });
  await c1.locator('.importador-lectura').scrollIntoViewIfNeeded();
  await capturar(page, problemas, browserName, `lectura-reebok-${browserName}-390.png`);
  await page.setViewportSize({ width: 1280, height: 720 });

  // Sin público: «todas las tallas» no propone nada hasta elegirlo; después sigue al público elegido.
  await importador(page).getByRole('button', { name: 'Añadir otra publicación' }).click();
  const f2 = ficha(page, 1);
  const c2 = color(f2, 0);
  await c2.getByLabel(MENSAJE).fill('Reebok Princensa dos P19 todas las tallas $105.000');
  await expect(f2.getByRole('textbox', { name: /^Modelo/ })).toHaveValue('PRINCENSA DOS P19');
  await expect(campoTallas(c2)).toHaveValue('');
  await expect(c2.locator('.importador-lectura')).toContainText('Dice «todas las tallas»: elige el público para proponer las tallas.');
  expect(await f2.getByRole('group', { name: /^Público en la tienda/ }).evaluate((n) => n.classList.contains('es-revisar'))).toBe(true);
  await radioPublico(f2, 'Dama').check();
  await expect(campoTallas(c2)).toHaveValue('36; 37; 38; 39');
  await expect(c2.locator('.importador-lectura')).toContainText('(Dama: 36 a 39)');
  await radioPublico(f2, 'Hombre').check();
  await expect(campoTallas(c2)).toHaveValue(T36_44);
  // Tallas escritas a mano: ni el público ni una nueva lectura del mensaje las cambian.
  await campoTallas(c2).fill('40; 41');
  await radioPublico(f2, 'Dama').check();
  await c2.getByLabel(MENSAJE).fill('Reebok Princensa dos P19 todas las tallas $110.000');
  await expect(c2.getByLabel(/^Precio del proveedor/)).toHaveValue('110000');
  await expect(campoTallas(c2)).toHaveValue('40; 41');
  await expect(radioPublico(f2, 'Dama')).toBeChecked();
  await f2.getByRole('checkbox', { name: 'Incluir en el guardado' }).uncheck();

  // Se guarda la ficha 1: tallas «por revisar» y público Unisex.
  await f1.getByRole('textbox', { name: /^Modelo/ }).fill('PRINCENSA P19');
  await c1.getByRole('textbox', { name: /^Color \(obligatorio\)/ }).fill('NEGRO');
  await f1.getByRole('combobox', { name: /^Categoría/ }).fill('URBANAS');
  await c1.getByLabel(/^Precio de venta/).fill('150000');
  await importador(page).getByRole('button', { name: /Guardar lote como oculto/ }).click();
  await expect(f1.locator('.importador-estado')).toContainText(/Guardada oculta · GT-/, { timeout: 30000 });
  const p = await leerProducto('REEBOK', 'PRINCENSA P19');
  expect(p).toMatchObject({ publico: 'unisex', activo: false });
  const tallas = await servicio('GET', `/rest/v1/tallas?select=talla,estado&variante_id=eq.${p.variantes[0].id}&order=talla`);
  expect(tallas.map((t) => t.talla)).toEqual(T36_44.split('; '));
  expect(new Set(tallas.map((t) => t.estado))).toEqual(new Set(['REVISAR']));
  expect(await leerProducto('REEBOK', 'PRINCENSA DOS P19')).toBeUndefined();
  expect(enviados).toEqual([]);
  expect(problemas).toEqual([]);
});

// ======================================================================== 2. reparto completo
test('reparto: orden de fichas y colores, salta la foto manual, agrupar durante la revisión, reordenar, destino a mano, doble clic, guardar y recargar', async ({ page, browserName }) => {
  const problemas = await abrirPanel(page);
  await publicaciones(page, [
    'New Balance Reparto A P19\nNegro\nHombre $100.000\n40 al 42',
    'New Balance Reparto A P19\nBlanco\nHombre $100.000\n40 al 42',
    'New Balance Reparto B P19\nGris\nDama $90.000\n36 al 38'
  ]);
  // Foto manual en la ficha 1 (todavía optimizándose): ese color conserva su lugar y no recibe otra.
  await color(ficha(page, 0), 0).locator('input[type=file]').setInputFiles([archivos.grande]);

  await elegirLote(page, [lote19.c, lote19.a, lote19.b]);
  await expect(items(page)).toHaveCount(3);
  await expect(reparto(page).getByRole('heading', { name: 'Revisa el reparto' })).toBeFocused();
  await esperarProcesadas(page);
  // Orden de llegada; destinos por orden de ficha (la 1 ya tiene foto). La tercera sobra.
  expect(await filas(page)).toEqual([
    ['c-azul.webp', 'Ficha 2 · NEW BALANCE REPARTO A P19 · Hombre · Color 1 · BLANCO'],
    ['a-roja.webp', 'Ficha 3 · NEW BALANCE REPARTO B P19 · Dama · Color 1 · GRIS'],
    ['b-verde.webp', 'Sin destino (no se asigna)']
  ]);
  await expect(reparto(page).locator('.importador-reparto-aviso')).toContainText('Sobran imágenes: «b-verde.webp» no tiene destino.');
  await expect(items(page).first().locator('img')).toHaveCount(1);

  // Agrupar durante la revisión: los destinos siguen al mismo color (identificador estable).
  await ficha(page, 1).getByRole('button', { name: 'Agrupar como color de la ficha 1' }).click();
  await expect(importador(page).locator('.importador-ficha')).toHaveCount(2);
  expect(await filas(page)).toEqual([
    ['c-azul.webp', 'Ficha 1 · NEW BALANCE REPARTO A P19 · Hombre · Color 2 · BLANCO'],
    ['a-roja.webp', 'Ficha 2 · NEW BALANCE REPARTO B P19 · Dama · Color 1 · GRIS'],
    ['b-verde.webp', 'Sin destino (no se asigna)']
  ]);

  // Ordenar por nombre y, con el teclado, bajar «a-roja» una posición.
  await reparto(page).getByRole('button', { name: 'Ordenar por nombre de archivo' }).click();
  expect((await filas(page)).map(([n]) => n)).toEqual(['a-roja.webp', 'b-verde.webp', 'c-azul.webp']);
  const bajarA = reparto(page).getByRole('button', { name: 'Bajar a-roja.webp una posición' });
  await bajarA.focus();
  await page.keyboard.press('Enter');
  await expect(bajarA).toBeFocused();
  expect(await filas(page)).toEqual([
    ['b-verde.webp', 'Ficha 1 · NEW BALANCE REPARTO A P19 · Hombre · Color 2 · BLANCO'],
    ['a-roja.webp', 'Ficha 2 · NEW BALANCE REPARTO B P19 · Dama · Color 1 · GRIS'],
    ['c-azul.webp', 'Sin destino (no se asigna)']
  ]);
  // Destino elegido a mano: «c-azul» al GRIS; «a-roja» queda sin destino. Luego se quita «a-roja».
  await reparto(page).getByText('Cambiar destino').nth(2).click();
  await expect(reparto(page).getByRole('group', { name: 'Destino de c-azul.webp' })).toBeVisible();
  await reparto(page).getByRole('group', { name: 'Destino de c-azul.webp' }).getByRole('radio', { name: 'Ficha 2 · NEW BALANCE REPARTO B P19 · Dama · Color 1 · GRIS' }).click();
  // Al elegir se cierra el desplegable y el foco vuelve a «Cambiar destino».
  await expect(reparto(page).getByRole('group', { name: 'Destino de c-azul.webp' })).toBeHidden();
  await expect(reparto(page).locator('.importador-reparto-cambiar summary').nth(2)).toBeFocused();
  expect(await filas(page)).toEqual([
    ['b-verde.webp', 'Ficha 1 · NEW BALANCE REPARTO A P19 · Hombre · Color 2 · BLANCO'],
    ['a-roja.webp', 'Sin destino (no se asigna)'],
    ['c-azul.webp', 'Ficha 2 · NEW BALANCE REPARTO B P19 · Dama · Color 1 · GRIS']
  ]);
  await expect(items(page).nth(2)).toContainText('Elegido a mano');
  await reparto(page).getByRole('button', { name: 'Quitar a-roja.webp del reparto' }).click();
  await expect(items(page)).toHaveCount(2);
  await expect(reparto(page).locator('.importador-reparto-aviso')).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 900 });
  await reparto(page).scrollIntoViewIfNeeded();
  await capturar(page, problemas, browserName, `reparto-revision-${browserName}-1280.png`);

  // Doble clic en «Asignar fotos»: se asigna una vez.
  await reparto(page).getByRole('button', { name: 'Asignar fotos', exact: true }).dblclick();
  await expect(items(page)).toHaveCount(0);
  await expect(reparto(page).locator('#imp-reparto-estado')).toContainText('Se asignaron 2 fotos principales en las fichas 1, 2.');
  const f1 = ficha(page, 0);
  const f2 = ficha(page, 1);
  await expect(color(f1, 0).locator('.editor-foto.es-lista')).toHaveCount(1, { timeout: 30000 });
  expect(await origenes(color(f1, 0))).toEqual([]);
  await expect(color(f1, 1).locator('.editor-foto')).toHaveCount(1);
  expect(await origenes(color(f1, 1))).toEqual(['Asignada por lote · b-verde.webp']);
  await expect(color(f1, 1).locator('.editor-foto-principal')).toHaveCount(1);
  await expect(color(f2, 0).locator('.editor-foto')).toHaveCount(1);
  expect(await origenes(color(f2, 0))).toEqual(['Asignada por lote · c-azul.webp']);

  // Ya no quedan colores sin foto: se avisa y no se abre el selector.
  let abierto = false;
  const alAbrir = () => { abierto = true; };
  page.on('filechooser', alAbrir);
  await reparto(page).getByRole('button', { name: 'Asignar fotos por lote' }).click();
  await expect(reparto(page).locator('#imp-reparto-estado')).toHaveText('Todas las fichas marcadas ya tienen fotos en todos sus colores: no hay a dónde asignar.');
  expect(abierto).toBe(false);
  page.off('filechooser', alAbrir);

  // «Quitar foto» y «Hacer principal» siguen funcionando: se quita la del GRIS y se reasigna otra.
  await color(f2, 0).getByRole('button', { name: /^Quitar la foto 1/ }).click();
  await expect(color(f2, 0).locator('.editor-foto')).toHaveCount(0);
  await elegirLote(page, [lote19.d]);
  await esperarProcesadas(page);
  expect(await filas(page)).toEqual([['d-amarilla.webp', 'Ficha 2 · NEW BALANCE REPARTO B P19 · Dama · Color 1 · GRIS']]);
  await reparto(page).getByRole('button', { name: 'Asignar fotos', exact: true }).click();
  await color(f1, 1).locator('input[type=file]').setInputFiles([archivos.adecuada]);
  await expect(color(f1, 1).locator('.editor-foto.es-lista')).toHaveCount(2, { timeout: 30000 });
  await color(f1, 1).getByRole('button', { name: 'Hacer principal la foto 2' }).click();
  expect(await origenes(color(f1, 1))).toEqual(['Asignada por lote · b-verde.webp']);
  await expect(color(f1, 1).locator('.editor-foto').nth(1)).toContainText('Asignada por lote · b-verde.webp');
  await color(f1, 1).getByRole('button', { name: 'Hacer principal la foto 2' }).click();
  await expect(color(f1, 1).locator('.editor-foto').nth(0)).toContainText('Asignada por lote · b-verde.webp');

  // Guardar: las fotos se suben al guardar y cada una queda en su color.
  await importador(page).locator('#imp-ajustes summary').click();
  await importador(page).getByLabel('Categoría', { exact: true }).fill('URBANAS');
  await importador(page).getByLabel('Sumar al precio del proveedor (COP)').fill('20000');
  await importador(page).getByRole('button', { name: /^Aplicar ajustes a [0-9]+ fichas?$/ }).click();
  await importador(page).getByRole('button', { name: /Guardar lote como oculto/ }).click();
  await expect(f1.locator('.importador-estado')).toContainText(/Guardada oculta · GT-/, { timeout: 60000 });
  await expect(f2.locator('.importador-estado')).toContainText(/Guardada oculta · GT-/, { timeout: 60000 });

  // Recarga: lo guardado se lee del servidor y cada foto principal es el archivo elegido para su color.
  const antesDeRecargar = problemas.length;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
  await expect(page.locator('#tablero')).not.toHaveAttribute('aria-busy', 'true');
  // WebKit informa como excepción la petición que la recarga corta (como en la etapa 18): solo ESE aviso y solo durante la recarga.
  if (browserName === 'webkit') for (let i = problemas.length - 1; i >= antesDeRecargar; i -= 1) if (/^EXCEPCIÓN: .*127\.0\.0\.1:54321\/.* due to access control checks\.$/.test(problemas[i])) problemas.splice(i, 1);
  const a = await leerProducto('NEW BALANCE', 'REPARTO A P19');
  const b = await leerProducto('NEW BALANCE', 'REPARTO B P19');
  const porColor = Object.fromEntries([...a.variantes, ...b.variantes].map((v) => [v.color, [...v.fotos].sort((x, y) => x.orden - y.orden)]));
  expect(Object.fromEntries(Object.entries(porColor).map(([k, v]) => [k, v.length]))).toEqual({ NEGRO: 1, BLANCO: 2, GRIS: 1 });
  const descargar = async (ruta) => sha(Buffer.from(await (await fetch(ruta)).arrayBuffer()));
  expect(await descargar(porColor.BLANCO[0].ruta)).toBe(sha(fs.readFileSync(lote19.b)));
  expect(await descargar(porColor.BLANCO[1].ruta)).toBe(sha(fs.readFileSync(archivos.adecuada)));
  expect(await descargar(porColor.GRIS[0].ruta)).toBe(sha(fs.readFileSync(lote19.d)));
  // Cada foto vive en la carpeta de su zapatilla y su color.
  for (const p of [a, b]) for (const v of p.variantes) for (const foto of v.fotos) expect(foto.ruta).toContain(`/productos/${p.id}/${v.id}/`);
  // El archivo quitado del GRIS nunca se subió: en Storage solo están las 4 fotos guardadas.
  expect((await objetosDe(a.id)).length + (await objetosDe(b.id)).length).toBe(4);
  expect(problemas).toEqual([]);
});

// ======================================================================== 3. faltan, archivo inválido, reemplazo, celular
test('reparto: imágenes insuficientes, archivo inválido que conserva su destino y se reemplaza, ficha desmarcada; celular y escritorio', async ({ page, browserName }) => {
  const problemas = await abrirPanel(page);
  await publicaciones(page, [
    'New Balance Reparto C P19\nRojo\nUnisex $100.000\n40 al 42',
    'New Balance Reparto D P19\nAzul\nUnisex $100.000\n40 al 42',
    'New Balance Reparto E P19\nVerde\nUnisex $100.000\n40 al 42'
  ]);
  await elegirLote(page, [lote19.a, lote19.falsa]);
  await esperarProcesadas(page);
  expect(await filas(page)).toEqual([
    ['a-roja.webp', 'Ficha 1 · NEW BALANCE REPARTO C P19 · Unisex · Color 1 · ROJO'],
    ['e-no-es-foto.webp', 'Ficha 2 · NEW BALANCE REPARTO D P19 · Unisex · Color 1 · AZUL']
  ]);
  const avisos = reparto(page).locator('.importador-reparto-avisos');
  await expect(avisos).toContainText('Faltan imágenes: 1 color quedará sin foto.');
  await expect(avisos).toContainText('Ficha 3 · NEW BALANCE REPARTO E P19 · Unisex · Color 1 · VERDE');
  await expect(avisos).toContainText('1 imagen no se puede usar: conserva su destino; reemplázala o quítala.');
  await expect(items(page).nth(1)).toContainText('No es una foto JPEG, PNG o WebP');

  // Celular 360 × 740: sin desplazamiento horizontal, una sola zona de desplazamiento y blancos táctiles.
  await page.setViewportSize({ width: 360, height: 740 });
  await reparto(page).locator('.importador-reparto-revision').scrollIntoViewIfNeeded();
  const disposicion = await revisarDisposicion(page);
  expect(disposicion.desborde, 'sin desplazamiento horizontal en 360 px').toBe(0);
  // Los campos de archivo ocultos se pulsan por su botón o etiqueta (el área táctil real).
  expect(disposicion.pequenos.filter((t) => /reparto|imp-r\d/.test(t) && !/archivo|reemplazar|-destino-/.test(t)), 'controles del reparto de al menos 40 px').toEqual([]);
  const ventana = await importador(page).evaluate((d) => ({ dialogo: d.scrollHeight - d.clientHeight, cuerpo: d.querySelector('.editor-cuerpo').scrollHeight > d.querySelector('.editor-cuerpo').clientHeight }));
  expect(ventana).toEqual({ dialogo: 0, cuerpo: true });
  await capturar(page, problemas, browserName, `reparto-revision-${browserName}-360.png`);
  // En el celular se reordena con los botones: el archivo inválido sube al primer lugar y toma el ROJO.
  await reparto(page).getByRole('button', { name: 'Subir e-no-es-foto.webp una posición' }).click();
  expect((await filas(page))[0]).toEqual(['e-no-es-foto.webp', 'Ficha 1 · NEW BALANCE REPARTO C P19 · Unisex · Color 1 · ROJO']);
  await reparto(page).getByRole('button', { name: 'Bajar e-no-es-foto.webp una posición' }).click();
  await page.setViewportSize({ width: 1280, height: 900 });

  // Asignar: la válida va al ROJO; la inválida se queda con su destino para reemplazarla.
  await reparto(page).getByRole('button', { name: 'Asignar fotos', exact: true }).click();
  await expect(items(page)).toHaveCount(1);
  expect(await filas(page)).toEqual([['e-no-es-foto.webp', 'Ficha 2 · NEW BALANCE REPARTO D P19 · Unisex · Color 1 · AZUL']]);
  await expect(reparto(page).locator('#imp-reparto-estado')).toContainText('Queda 1 imagen en la revisión');
  expect(await origenes(color(ficha(page, 0), 0))).toEqual(['Asignada por lote · a-roja.webp']);
  await reparto(page).locator('input[data-reparto="reemplazar"]').setInputFiles(lote19.c);
  await esperarProcesadas(page);
  expect(await filas(page)).toEqual([['c-azul.webp', 'Ficha 2 · NEW BALANCE REPARTO D P19 · Unisex · Color 1 · AZUL']]);

  // Una ficha desmarcada deja de ser destino.
  await ficha(page, 2).getByRole('checkbox', { name: 'Incluir en el guardado' }).uncheck();
  await expect(avisos).toBeHidden();
  await reparto(page).getByRole('button', { name: 'Asignar fotos', exact: true }).click();
  await expect(items(page)).toHaveCount(0);
  expect(await origenes(color(ficha(page, 1), 0))).toEqual(['Asignada por lote · c-azul.webp']);
  await expect(color(ficha(page, 2), 0).locator('.editor-foto')).toHaveCount(0);
  await reparto(page).scrollIntoViewIfNeeded();
  await capturar(page, problemas, browserName, `reparto-asignado-${browserName}-1280.png`);

  // Descartar un reparto pendiente no toca ninguna ficha.
  await ficha(page, 2).getByRole('checkbox', { name: 'Incluir en el guardado' }).check();
  await elegirLote(page, [lote19.d]);
  await reparto(page).getByRole('button', { name: 'Descartar el reparto' }).click();
  await expect(items(page)).toHaveCount(0);
  await expect(color(ficha(page, 2), 0).locator('.editor-foto')).toHaveCount(0);

  // Cerrar un selector de archivos sin elegir nada lanza «cancel» en el campo (y sube hasta el diálogo):
  // no es cerrar el importador.
  for (const campo of [reparto(page).locator('#imp-reparto-archivo'), color(ficha(page, 0), 0).locator('input[type=file]')]) {
    await campo.dispatchEvent('cancel', { bubbles: true });
    await expect(importador(page).locator('#importador-salida')).toBeHidden();
    await expect(importador(page).getByRole('button', { name: /Guardar lote como oculto/ })).toBeVisible();
  }
  expect(problemas).toEqual([]);
});
