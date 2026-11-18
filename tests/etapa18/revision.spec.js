// @ts-check
/* Etapa 18 · Revisión: importador por publicación, selector visual del tono y «Quitar foto».
 *
 * SOLO contra el stack local desechable de Supabase (con Storage y la migración 20261117010000) y el
 * sitio servido en 127.0.0.1:8765. Usuarios, productos y fotos FICTICIOS (marca «NEW BALANCE» con
 * modelos «REV … P18»), que se borran al terminar, con sus archivos de Storage. La configuración real
 * del panel y de la tienda nunca se usa (configurarPanel la sustituye).
 *
 *   npx playwright test tests/etapa18/revision.spec.js --workers=1
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
test.setTimeout(180000);

const MARCA = 'NEW BALANCE';
const MODELOS = ['REV IMP P18', 'REV FOTOS P18', 'REV EDIT P18', 'REV TARDIA P18', 'CLUB C BULC P18'];
const MARCAS = [MARCA, 'REEBOK'];
const CAPTURAS = path.join(os.tmpdir(), 'gama-talla-18-capturas');
const MENSAJE = 'Pega aquí el mensaje de WhatsApp';
const AVISO_CAPTURA_WEBKIT = "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.";
let admin; let archivos;

async function limpiarRev() {
  const lista = MODELOS.map((m) => `"${m}"`).join(',');
  const marcas = MARCAS.map((m) => `"${m}"`).join(',');
  const productos = await servicio('GET', `/rest/v1/productos?select=id,variantes(id)&marca=in.(${encodeURIComponent(marcas)})&nombre=in.(${encodeURIComponent(lista)})`);
  for (const p of productos) await borrarObjetos((await objetosDe(p.id)).map((o) => o.nombre));
  if (productos.length) await borrarCatalogo({ productos, variantes: productos.flatMap((p) => p.variantes) });
}
const leerProducto = async (nombre) => (await servicio('GET',
  `/rest/v1/productos?select=id,nombre,variantes(id,color,orden,muestra_color,forma_muestra,fotos(ruta,orden))&marca=eq.${encodeURIComponent(MARCA)}&nombre=eq.${encodeURIComponent(nombre)}`))[0];

test.beforeAll(async ({}, info) => {
  entorno();
  const columna = await servicio('GET', '/rest/v1/variantes?select=forma_muestra&limit=1').then(() => true, () => false);
  test.skip(!columna, 'Falta aplicar la migración 20261117010000_forma_muestra_color en el Supabase local.');
  await limpiarRestosDePruebas();
  await limpiarRev();
  admin = await crearUsuario(`rev18-${info.project.name}-${Date.now().toString(36)}@gamaytalla.test`);
  await hacerAdmin(admin.id);
  archivos = await prepararFotos();
  fs.mkdirSync(CAPTURAS, { recursive: true });
});
test.afterAll(async () => {
  await limpiarRev().catch(() => null);
  if (admin) { await quitarAdmin(admin.id).catch(() => null); await borrarUsuario(admin.id); }
});
test.afterEach(async () => { await limpiarRev(); });

// ---------------------------------------------------------------- ayudas
const importador = (page) => page.locator('#importador');
const ficha = (page, n) => importador(page).locator('.importador-ficha').nth(n);
const color = (f, n) => f.locator('.importador-color').nth(n);
const tono = (raiz) => raiz.getByRole('textbox', { name: 'Tono del círculo', exact: true });
const recuadro = (raiz) => raiz.locator('input[type="color"]');

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
// Solo el aviso exacto de la captura de Playwright en WebKit, emitido durante la captura.
async function capturar(page, problemas, browserName, nombre) {
  const desde = problemas.length;
  await page.screenshot({ path: path.join(CAPTURAS, nombre) });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  if (browserName !== 'webkit') return;
  const i = problemas.indexOf(AVISO_CAPTURA_WEBKIT, desde);
  if (i >= 0) problemas.splice(i, 1);
}
/* WebKit: al recargar, la navegación corta una petición en curso del panel y WebKit la informa como
   excepción «… due to access control checks.». Solo se descarta ESE aviso, en WebKit y emitido
   durante la recarga; cualquier otro error sigue haciendo fallar la prueba. */
async function recargar(page, problemas, browserName) {
  const desde = problemas.length;
  await page.reload();
  await expect(page.locator('#tablero')).not.toHaveAttribute('aria-busy', 'true');
  if (browserName !== 'webkit') return;
  for (let i = problemas.length - 1; i >= desde; i -= 1) {
    if (/^EXCEPCIÓN: .*127\.0\.0\.1:54321\/.* due to access control checks\.$/.test(problemas[i])) problemas.splice(i, 1);
  }
}
async function abrirImportador(page) {
  await page.getByRole('button', { name: 'Importar desde WhatsApp' }).click();
  await expect(importador(page)).toBeVisible();
  await expect(importador(page).getByLabel(MENSAJE).first()).toBeFocused();
}
const listas = (raiz, n) => expect(raiz.locator('.editor-foto.es-lista, .editor-foto.es-subida, .editor-foto.es-guardada')).toHaveCount(n, { timeout: 30000 });
// ¿Está el elemento dentro de lo visible del cuerpo del diálogo (sin quedar bajo la cabecera ni el pie)?
async function dentroDelCuerpo(page, dialogo, selector) {
  return page.evaluate(([d, s]) => {
    const cuerpo = document.querySelector(`${d} .editor-cuerpo`).getBoundingClientRect();
    const r = document.querySelector(s).getBoundingClientRect();
    return r.top >= cuerpo.top - 1 && r.bottom <= cuerpo.bottom + 1;
  }, [dialogo, selector]);
}

// ======================================================================== 1. importador
test('importador: el mensaje primero, luego fotos, datos y ajustes; añadir enfoca el nuevo mensaje; agrupar conserva cada publicación; celular', async ({ page, browserName }) => {
  const problemas = await abrirPanel(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await abrirImportador(page);
  const f1 = ficha(page, 0);
  const area1 = color(f1, 0).getByLabel(MENSAJE);
  await expect(area1).toHaveAttribute('placeholder', /New Balance 603/);
  expect(await dentroDelCuerpo(page, '#importador', `#${await area1.getAttribute('id')}`), 'el cuadro del mensaje se ve al abrir, también en celular').toBe(true);
  // Orden: mensaje → fotos → datos reconocidos → ajustes adicionales.
  const orden = await color(f1, 0).evaluate((li) => {
    const piezas = [li.querySelector('textarea'), li.querySelector('.importador-fotos'), [...li.querySelectorAll('h5')].find((h) => h.textContent === 'Datos reconocidos'),
      [...li.querySelectorAll('h5')].find((h) => h.textContent === 'Ajustes adicionales')];
    return piezas.every(Boolean) && piezas.every((p, i) => i === 0 || (piezas[i - 1].compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(orden).toBe(true);
  await expect(color(f1, 0).locator('.importador-fotos legend')).toHaveText('Fotos de esta publicación');
  // Los ajustes por lote, plegados y debajo de las publicaciones.
  const ajustes = importador(page).locator('#imp-ajustes');
  await expect(ajustes).not.toHaveAttribute('open', '');
  await expect(ajustes.getByRole('button', { name: 'Aplicar todos los ajustes' })).toBeHidden();
  const ajustesDespues = await page.evaluate(() => document.querySelector('#imp-fichas').compareDocumentPosition(document.querySelector('#imp-ajustes')) & Node.DOCUMENT_POSITION_FOLLOWING);
  expect(ajustesDespues).toBeTruthy();

  // Publicación 1 con dos fotos; lo dudoso queda «Revisar».
  await area1.fill('New Balance REV IMP P18\nBlanco\nUnisex $200.000\nTalla 37');
  await expect(f1.getByRole('textbox', { name: /^Modelo/ })).toHaveValue('REV IMP P18');
  await expect(color(f1, 0).getByLabel(/^Tallas EU/)).toHaveValue('37');
  await color(f1, 0).locator('input[type=file]').setInputFiles([archivos.adecuada, archivos.otra]);
  await listas(color(f1, 0), 2);
  await capturar(page, problemas, browserName, `revision-importador-${browserName}-390.png`);

  // Añadir otra publicación: su cuadro de mensaje queda a la vista y con el foco.
  await importador(page).getByRole('button', { name: 'Añadir otra publicación' }).click();
  const f2 = ficha(page, 1);
  const area2 = color(f2, 0).getByLabel(MENSAJE);
  await expect(area2).toBeFocused();
  expect(await dentroDelCuerpo(page, '#importador', `#${await area2.getAttribute('id')}`)).toBe(true);
  await area2.fill('New Balance REV IMP P18\nNegro\nUnisex $210.000\n41 al 43 Euro');
  await expect(color(f2, 0).getByLabel(/^Tallas EU/)).toHaveValue('41; 42; 43');
  await color(f2, 0).locator('input[type=file]').setInputFiles([archivos.png]);
  await listas(color(f2, 0), 1);
  await color(f2, 0).getByRole('textbox', { name: /^Color \(obligatorio\)/ }).fill('NEGRO MATE');
  await f2.getByRole('button', { name: 'Agrupar como color de la ficha 1' }).click();

  // Agrupadas: cada color conserva su mensaje, sus fotos y sus datos (también lo editado a mano).
  await expect(importador(page).locator('.importador-ficha')).toHaveCount(1);
  const c1 = color(f1, 0);
  const c2 = color(f1, 1);
  await expect(c1.getByLabel(MENSAJE)).toHaveValue(/Blanco/);
  await expect(c2.getByLabel(MENSAJE)).toHaveValue(/41 al 43/);
  await expect(c1.locator('.editor-foto')).toHaveCount(2);
  await expect(c2.locator('.editor-foto')).toHaveCount(1);
  await expect(c2.getByRole('textbox', { name: /^Color \(obligatorio\)/ })).toHaveValue('NEGRO MATE');
  await expect(c2.getByLabel(/^Tallas EU/)).toHaveValue('41; 42; 43');
  await expect(c1.getByLabel(/^Tallas EU/)).toHaveValue('37');
  // Volver a leer el mensaje no pisa lo corregido a mano.
  await c2.getByLabel(MENSAJE).fill('New Balance REV IMP P18\nNegro\nUnisex $210.000\n41 al 44 Euro');
  await expect(c2.getByLabel(/^Tallas EU/)).toHaveValue('41; 42; 43; 44');
  await expect(c2.getByRole('textbox', { name: /^Color \(obligatorio\)/ })).toHaveValue('NEGRO MATE');

  // Ajustes por lote: siguen funcionando desde el plegable.
  await ajustes.locator('summary').click();
  await ajustes.getByLabel('Categoría', { exact: true }).fill('Urbanas');
  await ajustes.getByRole('radio', { name: 'Mujer' }).check();
  await ajustes.getByLabel('Sumar al precio del proveedor (COP)').fill('40000');
  await ajustes.getByRole('button', { name: 'Aplicar todos los ajustes' }).click();
  await expect(c1.getByLabel(/^Precio de venta/)).toHaveValue('240000');
  await expect(f1.getByRole('combobox', { name: /^Categoría/ })).toHaveValue('URBANAS');

  // Celular: todo es alcanzable, sin desplazamiento horizontal y el final queda sobre el pie.
  const cuerpo = importador(page).locator('.editor-cuerpo');
  await cuerpo.evaluate((n) => { n.scrollTop = n.scrollHeight; });
  const final = await page.evaluate(() => {
    const ultimo = document.querySelector('#imp-ajustes').getBoundingClientRect();
    const pie = document.querySelector('#importador .editor-pie').getBoundingClientRect();
    return { hueco: pie.top - ultimo.bottom, cuerpoFinal: document.querySelector('#importador .editor-cuerpo').getBoundingClientRect().bottom, pieArriba: pie.top };
  });
  expect(final.hueco, 'el último bloque queda por encima del pie, con aire').toBeGreaterThanOrEqual(16);
  expect(final.cuerpoFinal).toBeLessThanOrEqual(final.pieArriba + 1);
  const disposicion = await revisarDisposicion(page);
  expect(disposicion.desborde, 'sin desplazamiento horizontal en 390 px').toBe(0);
  await capturar(page, problemas, browserName, `revision-importador-final-${browserName}-390.png`);

  await importador(page).getByRole('button', { name: /Guardar lote como oculto/ }).click();
  await expect(f1.locator('.importador-estado')).toContainText(/Guardada oculta · GT-/, { timeout: 30000 });
  const p = await leerProducto('REV IMP P18');
  expect(p.variantes.sort((a, b) => a.orden - b.orden).map((v) => [v.color, v.fotos.length])).toEqual([['BLANCO', 2], ['NEGRO MATE', 1]]);
  expect(problemas).toEqual([]);
});

// ======================================================================== 1b. lector en el importador
test('importador: un mensaje en una sola línea (Reebok) llega a los campos; lo que falta queda «Revisar»; lo corregido a mano se conserva', async ({ page }) => {
  const problemas = await abrirPanel(page);
  await abrirImportador(page);
  const f = ficha(page, 0);
  const c = color(f, 0);
  const campo = (raiz, nombre) => raiz.getByLabel(new RegExp(`^${nombre}`)).first();
  const enRevision = (raiz, nombre) => campo(raiz, nombre).evaluate((n) => Boolean(n.closest('.es-revisar')));
  await c.getByLabel(MENSAJE).fill('Reebok Club C Bulc🔥tallas 40-41-42-43-44 euro $80.000\n\nEstamos atentos de una 👉 +57 3000000000');
  await expect(f.getByRole('combobox', { name: /^Marca/ })).toHaveValue('REEBOK');
  await expect(f.getByRole('textbox', { name: /^Modelo/ })).toHaveValue('CLUB C BULC');
  await expect(campo(c, 'Precio del proveedor')).toHaveValue('80000');
  await expect(campo(c, 'Tallas EU')).toHaveValue('40; 41; 42; 43; 44');
  await expect(c.locator('.importador-tallas-leidas')).toHaveText('5 tallas: 40 · 41 · 42 · 43 · 44');
  // Solo lo que el texto no trae queda «Revisar»: el público y el color.
  expect(await f.getByRole('group', { name: /^Público en la tienda/ }).evaluate((n) => n.classList.contains('es-revisar'))).toBe(true);
  expect(await enRevision(c, 'Color')).toBe(true);
  for (const nombre of ['Precio del proveedor', 'Tallas EU']) expect(await enRevision(c, nombre), nombre).toBe(false);
  expect(await f.getByRole('combobox', { name: /^Marca/ }).evaluate((n) => Boolean(n.closest('.es-revisar')))).toBe(false);
  expect(await f.getByRole('textbox', { name: /^Modelo/ }).evaluate((n) => Boolean(n.closest('.es-revisar')))).toBe(false);
  await expect(c.locator('.importador-lectura')).toContainText('Se omitió un teléfono');
  await expect(c.locator('.importador-lectura')).toContainText('Revisa: color, público');
  // Ni el teléfono ni la frase de contacto pasan a ningún campo.
  const valores = await f.locator('input:not([type=radio]):not([type=checkbox]):not([type=file]):not([type=color])').evaluateAll((ns) => ns.map((n) => n.value).join(' | '));
  expect(valores).not.toMatch(/3000000000|atentos/i);

  // Correcciones a mano y nueva lectura del mensaje: lo corregido se conserva; lo demás se actualiza.
  await f.getByRole('textbox', { name: /^Modelo/ }).fill('CLUB C BULC P18');
  await c.getByRole('textbox', { name: /^Color \(obligatorio\)/ }).fill('BLANCO');
  await f.getByRole('group', { name: /^Público en la tienda/ }).getByRole('radio', { name: 'Unisex', exact: true }).check();
  await c.getByLabel(MENSAJE).fill('Reebok Club C Bulc tallas 40-42-44 $80.000 Escríbeme al +57 300 000 0000');
  await expect(campo(c, 'Tallas EU')).toHaveValue('40; 42; 44');
  await expect(f.getByRole('textbox', { name: /^Modelo/ })).toHaveValue('CLUB C BULC P18');
  await expect(c.getByRole('textbox', { name: /^Color \(obligatorio\)/ })).toHaveValue('BLANCO');
  await expect(f.getByRole('group', { name: /^Público en la tienda/ }).getByRole('radio', { name: 'Unisex', exact: true })).toBeChecked();
  await expect(campo(c, 'Precio del proveedor')).toHaveValue('80000');

  // Guardado con datos ficticios en el Supabase local.
  await f.getByRole('combobox', { name: /^Categoría/ }).fill('URBANAS');
  await campo(c, 'Precio de venta').fill('120000');
  await importador(page).getByRole('button', { name: /Guardar lote como oculto/ }).click();
  await expect(f.locator('.importador-estado')).toContainText(/Guardada oculta · GT-/, { timeout: 30000 });
  const [p] = await servicio('GET', `/rest/v1/productos?select=id,marca,nombre,publico,activo,variantes(id,color,precio)&marca=eq.REEBOK&nombre=eq.${encodeURIComponent('CLUB C BULC P18')}`);
  expect(p).toMatchObject({ marca: 'REEBOK', nombre: 'CLUB C BULC P18', publico: 'unisex', activo: false });
  expect(p.variantes.map((v) => [v.color, v.precio])).toEqual([['BLANCO', 120000]]);
  const tallas = await servicio('GET', `/rest/v1/tallas?select=talla,estado&variante_id=eq.${p.variantes[0].id}&order=talla`);
  expect(tallas).toEqual([{ talla: '40', estado: 'REVISAR' }, { talla: '42', estado: 'REVISAR' }, { talla: '44', estado: 'REVISAR' }]);
  expect(problemas).toEqual([]);
});

// ======================================================================== 2. tono en el importador
test('importador: el recuadro abre el selector y sincroniza el hexadecimal; validación al salir; automático; se conserva al cambiar a foto', async ({ page }) => {
  const problemas = await abrirPanel(page);
  await abrirImportador(page);
  const c = color(ficha(page, 0), 0);
  await c.getByLabel(MENSAJE).fill('New Balance REV IMP P18\nBeige\nDama $150.000\n38');
  const forma = c.locator('.editor-forma');
  await expect(c.getByRole('radio', { name: 'Círculo de color' })).toBeChecked();
  // Automático por omisión: el texto vacío y el recuadro con un gris neutro que no se guarda.
  await expect(tono(c)).toHaveValue('');
  await expect(recuadro(c)).toHaveValue('#d9d9d4');
  await expect(forma.locator('.editor-tono-estado')).toContainText('Color automático');
  await expect(forma.getByRole('button', { name: /Usar color automático/ })).toBeHidden();
  // El recuadro es un selector nativo (pulsable, con nombre) junto al hexadecimal y la vista previa.
  await expect(recuadro(c)).toHaveAccessibleName(/Elegir el tono del círculo de BEIGE/);
  await recuadro(c).fill('#3366cc');
  await expect(tono(c)).toHaveValue('#3366CC');
  expect(await forma.locator('.editor-tono-vista').evaluate((n) => n.style.getPropertyValue('--muestra'))).toBe('#3366cc');
  expect(await forma.locator('.editor-forma-circulo').evaluate((n) => n.style.getPropertyValue('--muestra'))).toBe('#3366cc');
  await expect(forma.getByRole('button', { name: /Usar color automático/ })).toBeVisible();
  // Escribir: un valor incompleto no muestra error hasta salir del campo.
  await tono(c).fill('#12');
  await expect(forma.locator('.editor-tono-error')).toBeHidden();
  await expect(tono(c)).not.toHaveAttribute('aria-invalid', 'true');
  await tono(c).press('Tab');
  await expect(forma.locator('.editor-tono-error')).toBeVisible();
  await expect(forma.locator('.editor-tono-error')).toContainText('no es un tono válido');
  await expect(tono(c)).toHaveAttribute('aria-invalid', 'true');
  // Un hexadecimal válido actualiza el recuadro y la vista previa (y quita el error).
  await tono(c).fill('#a1b2c3');
  await expect(recuadro(c)).toHaveValue('#a1b2c3');
  await expect(forma.locator('.editor-tono-error')).toBeHidden();
  // Sin «#» y en minúsculas: se normaliza al salir.
  await tono(c).fill('e8dcc8');
  await tono(c).press('Tab');
  await expect(tono(c)).toHaveValue('#E8DCC8');
  await expect(recuadro(c)).toHaveValue('#e8dcc8');
  // Foto: el tono se pliega pero se conserva; la vista previa es la de la foto.
  await c.getByRole('radio', { name: 'Foto de la zapatilla' }).check();
  await expect(forma.locator('.editor-tono')).toBeHidden();
  await expect(forma.locator('.editor-forma-aviso')).toBeVisible();
  await c.getByRole('radio', { name: 'Círculo de color' }).check();
  await expect(forma.locator('.editor-tono')).toBeVisible();
  await expect(tono(c)).toHaveValue('#E8DCC8');
  // «Usar color automático».
  await forma.getByRole('button', { name: /Usar color automático/ }).click();
  await expect(tono(c)).toHaveValue('');
  await expect(forma.locator('.editor-tono-estado')).toContainText('Color automático');
  await expect(recuadro(c)).toBeFocused();
  // Se guarda el tono elegido con el recuadro.
  await recuadro(c).fill('#e8dcc8');
  await c.getByLabel(/^Precio de venta/).fill('190000');
  await ficha(page, 0).getByRole('combobox', { name: /^Categoría/ }).fill('URBANAS');
  await importador(page).getByRole('button', { name: /Guardar lote como oculto/ }).click();
  await expect(ficha(page, 0).locator('.importador-estado')).toContainText(/Guardada oculta/, { timeout: 30000 });
  const p = await leerProducto('REV IMP P18');
  expect(p.variantes.map((v) => [v.muestra_color, v.forma_muestra])).toEqual([['#e8dcc8', 'circulo']]);
  expect(problemas).toEqual([]);
});

// ======================================================================== 3. quitar fotos en el importador
test('importador: quitar la principal, la última y una que se está optimizando; las ya subidas se limpian de Storage', async ({ page }) => {
  const problemas = await abrirPanel(page);
  await abrirImportador(page);
  const f = ficha(page, 0);
  const c = color(f, 0);
  await c.getByLabel(MENSAJE).fill('New Balance REV FOTOS P18\nGris\nHombre $150.000\n41');
  // Se espera a la lectura del mensaje (repinta la ficha) antes de adjuntar: así el selector de archivos
  // que recibe las fotos es el definitivo.
  await expect(c.getByLabel(/^Tallas EU/)).toHaveValue('41');
  await c.getByRole('radio', { name: 'Foto de la zapatilla' }).check();
  await c.locator('input[type=file]').setInputFiles([archivos.adecuada, archivos.otra]);
  await listas(c, 2);
  const segunda = await c.locator('.editor-foto').nth(1).locator('img').getAttribute('src');
  // Quitar la principal: la siguiente pasa a principal y a ser la miniatura del selector.
  const quitarPrincipal = c.locator('.editor-foto').first().getByRole('button', { name: 'Quitar la foto 1 de GRIS' });
  await expect(quitarPrincipal).toHaveText('Quitar foto');
  await quitarPrincipal.press('Enter');
  await expect(c.locator('.editor-foto')).toHaveCount(1);
  await expect(c.locator('.editor-foto').first().locator('.editor-foto-principal')).toHaveText('Principal');
  await expect(c.locator('.editor-forma-vista.es-foto img')).toHaveAttribute('src', segunda);
  await expect(c.locator('.editor-forma-foto img')).toHaveAttribute('src', segunda);
  await expect(c.getByRole('button', { name: 'Quitar la foto 1 de GRIS' })).toBeFocused();
  // Quitar la última: estado sin fotos y se pueden añadir otras.
  await c.getByRole('button', { name: 'Quitar la foto 1 de GRIS' }).click();
  await expect(c.locator('.editor-foto')).toHaveCount(0);
  await expect(c.locator('.editor-vacio')).toHaveText('Todavía no hay fotos de esta publicación.');
  await expect(c.locator('.editor-forma-aviso')).toBeVisible();
  await expect(c.getByText('Añadir fotos', { exact: true })).toBeVisible();
  // Quitada mientras se optimiza: no reaparece al terminar.
  await c.locator('input[type=file]').setInputFiles([archivos.grande]);
  const estado = await page.evaluate(() => {
    const item = document.querySelector('#importador .editor-foto');
    const texto = item?.querySelector('.editor-foto-estado')?.textContent;
    item?.querySelector('[data-imp="foto-quitar"]')?.click();
    return texto;
  });
  expect(estado).toBe('Optimizando…');
  await page.waitForTimeout(2500);
  await expect(c.locator('.editor-foto')).toHaveCount(0);

  // Fotos ya subidas de una ficha cuyo guardado falló: al quitarlas se borran de Storage.
  const carpetas = async () => (await servicio('POST', '/storage/v1/object/list/fotos-catalogo', { prefix: 'productos/', limit: 1000 })).map((x) => x.name);
  const previas = new Set(await carpetas());
  await c.locator('input[type=file]').setInputFiles([archivos.adecuada, archivos.otra]);
  await listas(c, 2);
  await c.getByLabel(/^Precio de venta/).fill('190000');
  await f.getByRole('combobox', { name: /^Categoría/ }).fill('URBANAS');
  await page.route('**/rest/v1/rpc/fn_admin_guardar_producto', (r) => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'PT422', message: 'Rechazo simulado.' }) }));
  await importador(page).getByRole('button', { name: /Guardar lote como oculto/ }).click();
  await expect(f.locator('.importador-estado')).toContainText('Rechazo simulado', { timeout: 30000 });
  await page.unroute('**/rest/v1/rpc/fn_admin_guardar_producto');
  await expect(c.locator('.editor-foto-estado')).toHaveText(['Subida', 'Subida']);
  const nuevas = (await carpetas()).filter((x) => !previas.has(x));
  expect(nuevas, 'las fotos se subieron con la ruta de la ficha').toHaveLength(1);
  const contar = async () => (await objetosDe(nuevas[0])).length;
  try {
    expect(await contar()).toBe(2);
    await c.locator('.editor-foto').first().getByRole('button', { name: /^Quitar la foto 1/ }).click();
    await expect.poll(contar, { message: 'la foto subida y quitada se borra de Storage' }).toBe(1);
    // Descartar el lote limpia la que queda.
    await importador(page).getByRole('button', { name: 'Cerrar el importador' }).click();
    await importador(page).getByRole('button', { name: 'Descartar el lote' }).click();
    await expect.poll(contar, { message: 'descartar el lote borra lo subido que no se guardó' }).toBe(0);
  } finally {
    await borrarObjetos((await objetosDe(nuevas[0])).map((o) => o.nombre)).catch(() => null);
  }
  expect(problemas.filter((x) => !/the server responded with a status of 400|400 \(Bad Request\)/.test(x))).toEqual([]);
});

// ======================================================================== 4. editor: tono y fotos
async function crearEnServidor(nombre) {
  const [p] = await servicio('POST', '/rest/v1/productos?select=id', [{ nombre, marca: MARCA, categoria: 'URBANAS', publico: 'unisex', activo: false }], 'return=representation');
  const vs = await servicio('POST', '/rest/v1/variantes?select=id,color', [
    { producto_id: p.id, color: 'NEGRO', precio: 200000, orden: 0 }, { producto_id: p.id, color: 'BLANCO', precio: 200000, orden: 1 }], 'return=representation');
  await servicio('POST', '/rest/v1/tallas', vs.map((v) => ({ variante_id: v.id, talla: '40', estado: 'REVISAR', activa: true })));
  return { id: p.id, variantes: vs };
}
async function abrirEditor(page, nombre) {
  await page.locator('.producto', { hasText: nombre }).getByRole('button', { name: new RegExp(`^Editar ${nombre}`) }).click();
  const editor = page.locator('#editor');
  await expect(editor).toBeVisible();
  return editor;
}

test('editor: el color automático se conserva (no guarda el gris ni negro); recuadro y hexadecimal; se guarda y se recarga', async ({ page, browserName }) => {
  const p = await crearEnServidor('REV EDIT P18');
  const problemas = await abrirPanel(page);
  let editor = await abrirEditor(page, 'REV EDIT P18');
  const negro = editor.locator('.editor-variante').nth(0);
  const blanco = editor.locator('.editor-variante').nth(1);
  await expect(tono(negro)).toHaveValue('');
  await expect(recuadro(negro)).toHaveValue('#d9d9d4');
  // Guardar sin tocar nada: sigue automático (null), ni el gris del recuadro ni negro.
  await editor.getByRole('textbox', { name: 'Referencia del proveedor', exact: true }).fill('REF-REV');
  await editor.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.locator('#editor-resultado')).toContainText('Guardado', { timeout: 15000 });
  let fila = await leerProducto('REV EDIT P18');
  expect(fila.variantes.map((v) => v.muestra_color)).toEqual([null, null]);
  // El blanco con un tono propio, elegido con el recuadro; luego «foto» sin perder el tono.
  await recuadro(blanco).fill('#f4f1ea');
  await expect(tono(blanco)).toHaveValue('#F4F1EA');
  await tono(blanco).fill('#f4f1e');
  await expect(blanco.locator('.editor-tono-error')).toBeHidden();
  await tono(blanco).fill('#f4f1eb');
  await expect(recuadro(blanco)).toHaveValue('#f4f1eb');
  await blanco.getByRole('radio', { name: 'Foto de la zapatilla' }).check();
  await expect(blanco.locator('.editor-tono')).toBeHidden();
  await editor.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.locator('#editor-resultado')).toContainText('Guardado', { timeout: 15000 });
  fila = await leerProducto('REV EDIT P18');
  expect(fila.variantes.sort((a, b) => a.orden - b.orden).map((v) => [v.muestra_color, v.forma_muestra])).toEqual([[null, 'circulo'], ['#f4f1eb', 'foto']]);
  // Recargar: el negro sigue automático y el blanco conserva foto y tono.
  await recargar(page, problemas, browserName);
  editor = await abrirEditor(page, 'REV EDIT P18');
  await expect(tono(editor.locator('.editor-variante').nth(0))).toHaveValue('');
  await expect(editor.locator('.editor-variante').nth(1).getByRole('radio', { name: 'Foto de la zapatilla' })).toBeChecked();
  await editor.locator('.editor-variante').nth(1).getByRole('radio', { name: 'Círculo de color' }).check();
  await expect(tono(editor.locator('.editor-variante').nth(1))).toHaveValue('#f4f1eb');
  await expect(recuadro(editor.locator('.editor-variante').nth(1))).toHaveValue('#f4f1eb');
  // «Usar color automático» y guardar: vuelve a null.
  await editor.locator('.editor-variante').nth(1).getByRole('button', { name: /Usar color automático/ }).click();
  await editor.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.locator('#editor-resultado')).toContainText('Guardado', { timeout: 15000 });
  fila = await leerProducto('REV EDIT P18');
  expect(fila.variantes.sort((a, b) => a.orden - b.orden).map((v) => [v.muestra_color, v.forma_muestra])).toEqual([[null, 'circulo'], [null, 'circulo']]);
  expect(problemas).toEqual([]);
  expect(p.id).toBeTruthy();
});

test('editor: quitar fotos (principal, guardadas, la última, durante la subida); cancelar recupera; Storage solo limpia lo nunca guardado; tienda', async ({ page, browser, browserName }) => {
  const p = await crearEnServidor('REV FOTOS P18');
  const problemas = await abrirPanel(page);
  let editor = await abrirEditor(page, 'REV FOTOS P18');
  let negro = editor.locator('.editor-variante').nth(0);
  await negro.getByRole('radio', { name: 'Foto de la zapatilla' }).check();
  await negro.locator('input[data-archivos]').setInputFiles([archivos.adecuada, archivos.otra]);
  await expect(negro.locator('.editor-foto.es-subida')).toHaveCount(2, { timeout: 30000 });
  await editor.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.locator('#editor-resultado')).toContainText('Guardado', { timeout: 15000 });
  let fila = await leerProducto('REV FOTOS P18');
  const rutas = fila.variantes.find((v) => v.color === 'NEGRO').fotos.sort((a, b) => a.orden - b.orden).map((f) => f.ruta);
  expect(rutas).toHaveLength(2);
  expect(await objetosDe(p.id)).toHaveLength(2);

  // Quitar la principal guardada: la siguiente es la miniatura; se avisa de que se retira al guardar.
  negro = editor.locator('.editor-variante').nth(0);
  await negro.locator('.editor-foto').first().getByRole('button', { name: /^Quitar la foto 1 de la galería de NEGRO/ }).click();
  await expect(negro.locator('.editor-foto')).toHaveCount(1);
  await expect(negro.locator('.editor-forma-vista.es-foto img')).toHaveAttribute('src', rutas[1]);
  await expect(negro.locator('.editor-fotos-quitadas')).toContainText('Quitaste 1 foto guardada');
  // Cancelar recupera la galería guardada.
  await editor.getByRole('button', { name: 'Cancelar' }).click();
  await editor.getByRole('button', { name: 'Descartar cambios' }).click();
  await expect(editor).toBeHidden();
  editor = await abrirEditor(page, 'REV FOTOS P18');
  negro = editor.locator('.editor-variante').nth(0);
  await expect(negro.locator('.editor-foto.es-guardada')).toHaveCount(2);

  // Quitada durante la subida: la respuesta tardía no la devuelve y su archivo se limpia al guardar.
  await page.route('**/storage/v1/object/fotos-catalogo/**', async (r) => {
    if (r.request().method() !== 'POST') return r.continue();
    await new Promise((listo) => setTimeout(listo, 2500));
    await r.continue();
  });
  await negro.locator('input[data-archivos]').setInputFiles([archivos.png]);
  const tercera = negro.locator('.editor-foto').nth(2);
  await expect(tercera.locator('.editor-foto-estado')).toContainText('Subiendo', { timeout: 20000 });
  await tercera.getByRole('button', { name: 'Quitar la foto 3 de NEGRO' }).click();
  await expect(negro.locator('.editor-foto')).toHaveCount(2);
  await expect.poll(async () => (await objetosDe(p.id)).length, { timeout: 15000, message: 'la subida llegó a Storage aunque se quitó' }).toBe(3);
  await page.waitForTimeout(500);
  await expect(negro.locator('.editor-foto')).toHaveCount(2);
  await page.unroute('**/storage/v1/object/fotos-catalogo/**');

  // Quitar la principal guardada y guardar: se retira de la galería; su archivo NO se borra solo
  // (queda en «Archivos sin usar»); el subido y quitado sí se limpia.
  await negro.locator('.editor-foto').first().getByRole('button', { name: /^Quitar la foto 1 de la galería de NEGRO/ }).click();
  await editor.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.locator('#editor-resultado')).toContainText('Guardado', { timeout: 15000 });
  await expect(page.locator('#editor-resultado')).toContainText('Se borró de Storage 1 foto que quitaste', { timeout: 15000 });
  fila = await leerProducto('REV FOTOS P18');
  expect(fila.variantes.find((v) => v.color === 'NEGRO').fotos.map((f) => f.ruta)).toEqual([rutas[1]]);
  const quedan = (await objetosDe(p.id)).map((o) => o.nombre);
  expect(quedan).toHaveLength(2);
  expect(quedan.some((o) => rutas[0].endsWith(o)), 'la foto que estuvo en la galería guardada se conserva').toBe(true);

  // La tienda: la miniatura del selector es la nueva principal.
  await editor.getByRole('button', { name: 'Publicar' }).click();
  await expect(page.locator('#editor-resultado')).toContainText('Publicada', { timeout: 15000 });
  const e = entorno();
  const contexto = await browser.newContext({ locale: 'es-CO', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await contexto.route(`${SITIO}/config.js`, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await contexto.addInitScript((conf) => { window.GAMA_TALLA_CONFIG = conf; }, { supabaseUrl: e.api, clavePublicable: e.publicable });
    const pagina = await contexto.newPage();
    await pagina.goto(`${SITIO}/?intro=no`);
    await pagina.waitForFunction("typeof estado !== 'undefined' && estado.catalogoListo === true", null, { timeout: 30000 });
    const detalle = await abrirDetalle(pagina, 'REV FOTOS P18');
    await expect(detalle.locator('.variante-miniatura img')).toHaveAttribute('src', rutas[1]);
  } finally {
    await contexto.close();
  }

  // Quitar la última foto: estado sin fotos; se puede añadir otra; al guardar queda sin galería y la
  // tienda vuelve al círculo (regla actual: un color en «foto» sin fotos usa su círculo).
  negro = editor.locator('.editor-variante').nth(0);
  await negro.locator('.editor-foto').first().getByRole('button', { name: /^Quitar la foto 1 de la galería de NEGRO/ }).click();
  await expect(negro.locator('.editor-vacio')).toContainText('Todavía no hay fotos');
  await expect(negro.locator('.editor-forma-aviso')).toBeVisible();
  await expect(negro.getByText('Añadir fotos', { exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.locator('#editor-resultado')).toContainText('Guardado', { timeout: 15000 });
  fila = await leerProducto('REV FOTOS P18');
  expect(fila.variantes.find((v) => v.color === 'NEGRO').fotos).toEqual([]);
  // Recargar conserva el estado guardado.
  await recargar(page, problemas, browserName);
  editor = await abrirEditor(page, 'REV FOTOS P18');
  await expect(editor.locator('.editor-variante').nth(0).locator('.editor-foto')).toHaveCount(0);
  await expect(editor.locator('.editor-variante').nth(0).getByRole('radio', { name: 'Foto de la zapatilla' })).toBeChecked();
  expect(problemas).toEqual([]);
});
