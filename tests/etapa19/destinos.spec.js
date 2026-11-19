// @ts-check
/* Etapa 19 (ajustes 2) · Importador: marca ON y marcas del catálogo; fichas que reciben los ajustes.
 *
 * SOLO contra el stack local desechable de Supabase (con Storage) y el sitio servido en 127.0.0.1:8765.
 * Usuarios, productos y fotos FICTICIOS (marca «NEW BALANCE» con modelos «DESTINOS … P19» y la marca de
 * catálogo ficticia «KORVOLAB»); todo se borra al terminar. La configuración real del panel nunca se usa.
 *
 *   npx playwright test tests/etapa19/destinos.spec.js --workers=1
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PANEL, entorno, servicio, crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, configurarPanel, ingresar,
  revisarDisposicion, borrarCatalogo, prepararFotos, objetosDe, borrarObjetos
} from '../etapa16/ayudas-catalogo.js';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180000);

const PRUEBAS = [['NEW BALANCE', 'DESTINOS A P19'], ['NEW BALANCE', 'DESTINOS B P19'], ['NEW BALANCE', 'DESTINOS C P19'], ['NEW BALANCE', 'DESTINOS D P19'],
  ['KORVOLAB', 'CATALOGO P19'], ['KORVOLAB', 'TRAIL P19']];
const CAPTURAS = path.join(os.tmpdir(), 'gama-talla-19-capturas');
const MENSAJE = 'Pega aquí el mensaje de WhatsApp';
const ON = '🌟ON CLOUD REMIX🌟\n💸$115.000💸\nEUR 36 AL 44\n\n🛒 Mándanos tu pedido: +57 3000000000';
let admin; let archivos;

async function limpiar() {
  for (const marca of ['NEW BALANCE', 'KORVOLAB']) {
    const modelos = PRUEBAS.filter(([m]) => m === marca).map(([, n]) => `"${n}"`).join(',');
    const productos = await servicio('GET', `/rest/v1/productos?select=id,variantes(id)&marca=eq.${encodeURIComponent(marca)}&nombre=in.(${encodeURIComponent(modelos)})`);
    for (const p of productos) await borrarObjetos((await objetosDe(p.id)).map((o) => o.nombre));
    if (productos.length) await borrarCatalogo({ productos, variantes: productos.flatMap((p) => p.variantes) });
  }
}

test.beforeAll(async ({}, info) => {
  entorno();
  await limpiar();
  admin = await crearUsuario(`panel19d-${info.project.name}-${Date.now().toString(36)}@gamaytalla.test`);
  await hacerAdmin(admin.id);
  archivos = await prepararFotos();
  fs.mkdirSync(CAPTURAS, { recursive: true });
});
test.afterAll(async () => {
  await limpiar().catch(() => null);
  if (admin) { await quitarAdmin(admin.id).catch(() => null); await borrarUsuario(admin.id); }
});
test.afterEach(async () => { await limpiar(); });

// ---------------------------------------------------------------- ayudas
const importador = (page) => page.locator('#importador');
const ficha = (page, n) => importador(page).locator('.importador-ficha').nth(n);
const color = (f, n) => f.locator('.importador-color').nth(n);
const ajustes = (page) => importador(page).locator('#imp-ajustes');
const destino = (page, n) => ajustes(page).getByRole('checkbox', { name: new RegExp(`^Ficha ${n} · `) });
const venta = (f) => color(f, 0).getByLabel(/^Precio de venta/);
const proveedor = (f) => color(f, 0).getByLabel(/^Precio del proveedor/);
const categoria = (f) => f.getByRole('combobox', { name: /^Categoría/ });
const guiaMujer = (f) => f.getByRole('group', { name: 'Tabla de la guía de tallas' }).getByRole('radio', { name: 'Mujer', exact: true });

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
  return problemas;
}
async function abrirImportador(page) {
  await page.getByRole('button', { name: 'Importar desde WhatsApp' }).click();
  await expect(importador(page)).toBeVisible();
}
async function publicaciones(page, textos) {
  for (const [i, t] of textos.entries()) {
    if (i) await importador(page).getByRole('button', { name: 'Añadir otra publicación' }).click();
    await color(ficha(page, i), 0).getByLabel(MENSAJE).fill(t);
    await expect(ficha(page, i).getByRole('textbox', { name: /^Modelo/ })).not.toHaveValue('');
  }
}
async function abrirAjustes(page) {
  if (!(await ajustes(page).evaluate((d) => d.open))) await ajustes(page).locator('summary').click();
  await expect(ajustes(page).locator('#imp-destinos')).toBeVisible();
}

// ======================================================================== 1. marcas
test('ON y una marca ficticia del catálogo se reconocen en el importador', async ({ page }) => {
  // Marca creada a mano en el panel (ficticia): el importador la reconoce en publicaciones nuevas.
  const [p] = await servicio('POST', '/rest/v1/productos?select=id', [{ nombre: 'CATALOGO P19', marca: 'KORVOLAB', categoria: 'URBANAS', publico: 'dama', activo: false }], 'return=representation');
  expect(p.id).toBeTruthy();
  const problemas = await abrirPanel(page);
  await abrirImportador(page);
  const f1 = ficha(page, 0);
  await color(f1, 0).getByLabel(MENSAJE).fill(ON);
  await expect(f1.getByRole('combobox', { name: /^Marca/ })).toHaveValue('ON');
  await expect(f1.getByRole('textbox', { name: /^Modelo/ })).toHaveValue('CLOUD REMIX');
  await expect(proveedor(f1)).toHaveValue('115000');
  await expect(color(f1, 0).getByLabel(/^Tallas EU/)).toHaveValue('36; 37; 38; 39; 40; 41; 42; 43; 44');
  await expect(color(f1, 0).locator('.importador-lectura')).toContainText('Se omitió un teléfono');
  await expect(color(f1, 0).locator('.importador-lectura')).toContainText('Revisa: color, público.');
  expect(await f1.getByRole('combobox', { name: /^Marca/ }).evaluate((n) => Boolean(n.closest('.es-revisar')))).toBe(false);
  const valores = await f1.locator('input:not([type=radio]):not([type=checkbox]):not([type=file]):not([type=color])').evaluateAll((ns) => ns.map((n) => n.value).join(' | '));
  expect(valores).not.toMatch(/3000000000|m[aá]ndanos|pedido|EUR/i);

  await importador(page).getByRole('button', { name: 'Añadir otra publicación' }).click();
  const f2 = ficha(page, 1);
  await color(f2, 0).getByLabel(MENSAJE).fill('Korvolab Trail P19 💥$150.000\nDama\n36 al 39');
  await expect(f2.getByRole('combobox', { name: /^Marca/ })).toHaveValue('KORVOLAB');
  await expect(f2.getByRole('textbox', { name: /^Modelo/ })).toHaveValue('TRAIL P19');
  expect(problemas).toEqual([]);
});

// ======================================================================== 2. destinos de los ajustes
test('ajustes solo a las fichas 1 y 3; la 2 conserva todo (también al releer); independiente del guardado y del reparto; guardar y recargar', async ({ page, browserName }) => {
  const problemas = await abrirPanel(page);
  await abrirImportador(page);
  await publicaciones(page, [
    'New Balance Destinos A P19\nBlanco\nHombre $100.000\n40 al 42',
    'New Balance Destinos B P19\nNegro\nDama $120.000\n36 al 38',
    'New Balance Destinos C P19\nGris\nUnisex $130.000\n38 al 40'
  ]);
  const [f1, f2, f3] = [ficha(page, 0), ficha(page, 1), ficha(page, 2)];
  // Datos propios de la ficha 2 y un precio de venta escrito a mano en la 3.
  await categoria(f2).fill('CASUALES');
  await venta(f3).fill('200000');

  await abrirAjustes(page);
  const bloque = ajustes(page);
  // Sin elegir nada: todas las editables, con su número, marca, modelo y público.
  await expect(destino(page, 1)).toBeChecked();
  await expect(bloque.getByRole('checkbox', { name: 'Ficha 2 · NEW BALANCE DESTINOS B P19 · Dama' })).toBeChecked();
  await expect(bloque.getByRole('button', { name: 'Aplicar ajustes a 3 fichas' })).toBeVisible();
  await bloque.getByRole('button', { name: 'Quitar selección' }).click();
  await expect(bloque.getByRole('button', { name: 'Aplicar ajustes a 0 fichas' })).toBeVisible();
  // Sin destinos: se indica junto al bloque y no cambia nada.
  await bloque.getByLabel('Categoría', { exact: true }).fill('Urbanas');
  await bloque.getByRole('button', { name: 'Aplicar ajustes a 0 fichas' }).click();
  await expect(bloque.locator('#imp-ajustes-estado')).toContainText('Marca al menos una ficha en «Fichas que recibirán los ajustes».');
  await expect(categoria(f1)).toHaveValue('');
  await destino(page, 1).click();
  await destino(page, 3).click();
  await expect(bloque.locator('#imp-destinos-resumen')).toHaveText('2 de 3 fichas elegidas (las 1 y 3).');
  await expect(bloque.getByRole('button', { name: 'Aplicar ajustes a 2 fichas' })).toBeVisible();
  // Independiente de «Incluir en el guardado»: las tres siguen marcadas para guardar.
  for (const f of [f1, f2, f3]) await expect(f.getByRole('checkbox', { name: 'Incluir en el guardado' })).toBeChecked();

  // La selección se mantiene al plegar y desplegar, al editar los ajustes y al añadir una ficha.
  await bloque.locator('summary').click();
  await bloque.locator('summary').click();
  await bloque.getByRole('group', { name: 'Tabla de la guía de tallas' }).getByRole('radio', { name: 'Mujer', exact: true }).check();
  await bloque.getByLabel('Sumar al precio del proveedor (COP)').fill('30000');
  await importador(page).getByRole('button', { name: 'Añadir otra publicación' }).click();
  await expect(bloque.locator('#imp-destinos-aviso')).toHaveText('La ficha 4 es nueva y no está elegida para los ajustes: márcala si quieres ajustarla.');
  await expect(destino(page, 4)).not.toBeChecked();
  await expect(bloque.getByRole('button', { name: 'Aplicar ajustes a 2 fichas' })).toBeVisible();
  await ficha(page, 3).getByRole('button', { name: 'Quitar la ficha 4 del lote' }).click();
  // El aviso de la ficha 4 desaparece con ella; quitar una ficha no elegida no cambia la selección.
  await expect(bloque.locator('#imp-destinos-aviso')).toHaveCount(0);
  await expect(destino(page, 1)).toBeChecked();
  await expect(destino(page, 2)).not.toBeChecked();
  await expect(destino(page, 3)).toBeChecked();

  await page.setViewportSize({ width: 390, height: 844 });
  await bloque.locator('#imp-destinos').scrollIntoViewIfNeeded();
  expect((await revisarDisposicion(page)).desborde, 'selector de fichas sin desplazamiento horizontal en 390 px').toBe(0);
  const alturas = await bloque.locator('#imp-destinos .casilla').evaluateAll((ns) => ns.map((n) => Math.round(n.getBoundingClientRect().height)));
  expect(Math.min(...alturas), 'cada ficha es un blanco táctil de al menos 40 px').toBeGreaterThanOrEqual(40);
  await capturar(page, problemas, browserName, `destinos-${browserName}-390.png`);
  await page.setViewportSize({ width: 1280, height: 900 });
  await bloque.locator('#imp-destinos').scrollIntoViewIfNeeded();
  await capturar(page, problemas, browserName, `destinos-${browserName}-1280.png`);

  // Aplicar: solo 1 y 3. La 3 conserva su precio escrito a mano.
  await bloque.getByRole('button', { name: 'Aplicar ajustes a 2 fichas' }).click();
  const estado = bloque.locator('#imp-ajustes-estado');
  await expect(estado).toContainText('2 fichas actualizadas: categoría URBANAS, guía de tallas «Mujer», precio de venta = proveedor + $');
  await expect(estado).toContainText('1 precio escrito a mano se conservó');
  await expect(estado).toContainText('Actualizadas: fichas 1 y 3.');
  await expect(venta(f1)).toHaveValue('130000');
  await expect(venta(f3)).toHaveValue('200000');
  for (const f of [f1, f3]) { await expect(categoria(f)).toHaveValue('URBANAS'); await expect(guiaMujer(f)).toBeChecked(); }
  // La 2, fuera de los destinos, conserva todo.
  await expect(categoria(f2)).toHaveValue('CASUALES');
  await expect(guiaMujer(f2)).not.toBeChecked();
  await expect(venta(f2)).toHaveValue('');
  // Aplicar otra vez: no se acumula y sigue sin tocar la 2.
  await bloque.getByRole('button', { name: 'Aplicar ajustes a 2 fichas' }).click();
  await expect(venta(f1)).toHaveValue('130000');
  await expect(venta(f2)).toHaveValue('');

  // El aumento no se extiende a la 2 al cambiar su precio del proveedor ni al releer su mensaje.
  await proveedor(f2).fill('125000');
  await expect(venta(f2)).toHaveValue('');
  await color(f2, 0).getByLabel(MENSAJE).fill('New Balance Destinos B P19\nNegro\nDama $140.000\n36 al 39');
  await expect(color(f2, 0).getByLabel(/^Tallas EU/)).toHaveValue('36; 37; 38; 39');
  await expect(venta(f2)).toHaveValue('');
  await expect(categoria(f2)).toHaveValue('CASUALES');
  // En la 1 (destino) el precio de venta sigue al proveedor al releer.
  await color(f1, 0).getByLabel(MENSAJE).fill('New Balance Destinos A P19\nBlanco\nHombre $110.000\n40 al 42');
  await expect(venta(f1)).toHaveValue('140000');
  // Repintar (releer mensajes) no cambia la selección.
  await expect(destino(page, 1)).toBeChecked();
  await expect(destino(page, 2)).not.toBeChecked();
  await expect(destino(page, 3)).toBeChecked();

  // Guardado y reparto de fotos usan «Incluir en el guardado», no los destinos de los ajustes.
  await f3.getByRole('checkbox', { name: 'Incluir en el guardado' }).uncheck();
  await expect(bloque.getByRole('button', { name: 'Aplicar ajustes a 2 fichas' })).toBeVisible();
  await expect(destino(page, 3)).toBeChecked();
  const [selector] = await Promise.all([page.waitForEvent('filechooser'), importador(page).getByRole('button', { name: 'Asignar fotos por lote' }).click()]);
  await selector.setFiles([archivos.adecuada, archivos.otra]);
  await expect(importador(page).locator('.importador-reparto-item').filter({ hasText: 'Optimizando…' })).toHaveCount(0, { timeout: 30000 });
  const destinosReparto = await importador(page).locator('.importador-reparto-destino-texto strong').allTextContents();
  expect(destinosReparto).toEqual(['Ficha 1 · NEW BALANCE DESTINOS A P19 · Hombre · Color 1 · BLANCO', 'Ficha 2 · NEW BALANCE DESTINOS B P19 · Dama · Color 1 · NEGRO']);
  await importador(page).getByRole('button', { name: 'Asignar fotos', exact: true }).click();
  await expect(importador(page).locator('.importador-reparto-item')).toHaveCount(0);

  // Guardar 1 y 2 (la 3 no está marcada para guardar). La 2 lleva su propio precio de venta.
  await venta(f2).fill('150000');
  await importador(page).getByRole('button', { name: 'Guardar lote como oculto (2)' }).click();
  await expect(f1.locator('.importador-estado')).toContainText(/Guardada oculta · GT-/, { timeout: 60000 });
  await expect(f2.locator('.importador-estado')).toContainText(/Guardada oculta · GT-/, { timeout: 60000 });
  // La 1 (elegida) ya está guardada: deja de recibir ajustes y se dice; la 3 sigue elegida.
  await expect(bloque.locator('#imp-destinos-aviso')).toHaveText('La ficha 1 ya está guardada y deja de recibir ajustes.');
  await expect(bloque.getByRole('button', { name: 'Aplicar ajustes a 1 ficha' })).toBeVisible();
  await expect(destino(page, 1)).toBeDisabled();

  const leer = async (nombre) => (await servicio('GET', `/rest/v1/productos?select=nombre,categoria,segmento,publico,variantes(color,precio,fotos(ruta))&marca=eq.NEW%20BALANCE&nombre=eq.${encodeURIComponent(nombre)}`))[0];
  const antesDeRecargar = problemas.length;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
  await expect(page.locator('#tablero')).not.toHaveAttribute('aria-busy', 'true');
  // WebKit informa como excepción la petición que la recarga corta (como en la etapa 18): solo ESE aviso y solo durante la recarga.
  if (browserName === 'webkit') for (let i = problemas.length - 1; i >= antesDeRecargar; i -= 1) if (/^EXCEPCIÓN: .*127\.0\.0\.1:54321\/.* due to access control checks\.$/.test(problemas[i])) problemas.splice(i, 1);
  await expect(page.locator('.producto', { hasText: 'DESTINOS A P19' })).toHaveCount(1);
  await expect(page.locator('.producto', { hasText: 'DESTINOS B P19' })).toHaveCount(1);
  const a = await leer('DESTINOS A P19');
  const b = await leer('DESTINOS B P19');
  expect({ categoria: a.categoria, segmento: a.segmento, publico: a.publico, precio: a.variantes[0].precio, fotos: a.variantes[0].fotos.length })
    .toEqual({ categoria: 'URBANAS', segmento: 'mujer', publico: 'hombre', precio: 140000, fotos: 1 });
  expect({ categoria: b.categoria, segmento: b.segmento, publico: b.publico, precio: b.variantes[0].precio, fotos: b.variantes[0].fotos.length })
    .toEqual({ categoria: 'CASUALES', segmento: null, publico: 'dama', precio: 150000, fotos: 1 });
  expect(await leer('DESTINOS C P19'), 'la ficha fuera del guardado no se guarda').toBeUndefined();
  expect(problemas).toEqual([]);
});

// ======================================================================== 3. agrupar con destinos elegidos
test('agrupar, separar y elegir todas con destinos elegidos a mano: se avisa y no se cambia la selección en silencio', async ({ page }) => {
  const problemas = await abrirPanel(page);
  await abrirImportador(page);
  await publicaciones(page, [
    'New Balance Destinos D P19\nBlanco\nDama $100.000\n36 al 38',
    'New Balance Destinos D P19\nNegro\nDama $100.000\n36 al 38'
  ]);
  await abrirAjustes(page);
  const bloque = ajustes(page);
  await destino(page, 1).click(); // solo la 2 queda elegida
  await expect(bloque.getByRole('button', { name: 'Aplicar ajustes a 1 ficha' })).toBeVisible();
  await ficha(page, 1).getByRole('button', { name: 'Agrupar como color de la ficha 1' }).click();
  await expect(bloque.locator('#imp-destinos-aviso')).toHaveText('La ficha 2 (elegida para los ajustes) se agrupó con la 1, que no está elegida: márcala si quieres ajustarla.');
  await expect(bloque.getByRole('button', { name: 'Aplicar ajustes a 0 fichas' })).toBeVisible();
  await expect(destino(page, 1)).not.toBeChecked();
  // Separar crea una ficha nueva que no entra sola en la selección.
  await color(ficha(page, 0), 1).getByRole('button', { name: 'Separar en otra ficha' }).click();
  await expect(bloque.locator('#imp-destinos-aviso')).toContainText('La ficha 2 (separada de la 1) es nueva y no está elegida');
  await bloque.getByRole('button', { name: 'Elegir todas' }).click();
  await expect(bloque.getByRole('button', { name: 'Aplicar ajustes a 2 fichas' })).toBeVisible();
  await expect(bloque.locator('#imp-destinos-aviso')).toHaveCount(0);
  expect(problemas).toEqual([]);
});
