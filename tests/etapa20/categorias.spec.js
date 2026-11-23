// @ts-check
/* Etapa 20 · Selector de categorías común (admin/categorias.js) en el editor, las fichas del importador,
 * «Ajustes para varias fichas» y la categoría habitual del perfil.
 *
 * SOLO contra el Supabase LOCAL y el entorno aislado (SITIO=http://127.0.0.1:8770). Datos FICTICIOS:
 * modelos « P20» (y una zapatilla «antigua» con categoría «Casual / Urbanas P20»); todo se borra.
 *
 *   SITIO=http://127.0.0.1:8770 npx playwright test tests/etapa20/categorias.spec.js --workers=1
 */
import { test, expect } from '@playwright/test';
import {
  entorno, servicio, crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, revisarDisposicion, limpiar20, productos20,
  entrarAlPanel, abrirImportador, importador, ficha, color, radioPublico, capturar, pegarVarias, elegirCategoria, campoCategoria, MENSAJE
} from './ayudas20.js';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180000);
let admin;
const ANTIGUA = 'Casual / Urbanas P20';

test.beforeAll(async ({}, info) => {
  entorno();
  await limpiar20();
  admin = await crearUsuario(`panel20-categorias-${info.project.name}-${Date.now().toString(36)}@gamaytalla.test`);
  await hacerAdmin(admin.id);
});
test.afterAll(async () => {
  await limpiar20().catch(() => null);
  if (admin) { await quitarAdmin(admin.id).catch(() => null); await borrarUsuario(admin.id); }
});
test.afterEach(async () => { await limpiar20(); });

const editor = (page) => page.locator('#editor');
const opciones = (ambito) => ambito.locator('.campo-categoria').first().locator('.selector-categoria-opciones .casilla').allTextContents();
const valorVisible = (ambito) => ambito.locator('.campo-categoria').first().locator('.selector-categoria-valor');
async function abrirMenu(ambito) {
  const menu = ambito.locator('.campo-categoria').first().locator('details.selector-categoria');
  if (!(await menu.evaluate((d) => /** @type {HTMLDetailsElement} */ (d).open))) await menu.locator(':scope > summary').click();
  return menu;
}
// Zapatilla «antigua» creada por servicio: categoría con minúsculas y espacios, tal como pudo quedar antes.
async function crearAntigua() {
  const [p] = await servicio('POST', '/rest/v1/productos?select=id,codigo_interno', [{ nombre: 'ANTIGUA P20', marca: 'MARCA VEINTE', categoria: ANTIGUA, publico: 'hombre', activo: false }], 'return=representation');
  const [v] = await servicio('POST', '/rest/v1/variantes?select=id', [{ producto_id: p.id, color: 'GRIS', precio: 150000, orden: 0 }], 'return=representation');
  await servicio('POST', '/rest/v1/tallas', [{ variante_id: v.id, talla: '41', estado: 'REVISAR', activa: true }]);
  // Otra con «urbanas» en minúscula y con espacios: no debe duplicar URBANAS.
  await servicio('POST', '/rest/v1/productos', [{ nombre: 'OTRA P20', marca: 'MARCA VEINTE', categoria: '  urbanas  ', publico: 'dama', activo: false }]);
  return p;
}

test('editor: opciones base y del catálogo sin duplicados; la categoría antigua no cambia al abrir y guardar; «Otra categoría…» crea una nueva', async ({ page, browserName }) => {
  const antigua = await crearAntigua();
  // La base normaliza (mayúsculas); la prueba compara con lo que tiene guardado y comprueba que no cambia.
  const [{ categoria: guardada }] = await servicio('GET', `/rest/v1/productos?select=categoria&id=eq.${antigua.id}`);
  const problemas = await entrarAlPanel(page, admin);
  // Abrir la antigua: se ve su categoría y no cambia al guardar otro dato.
  await page.locator('.producto', { hasText: 'ANTIGUA P20' }).getByRole('button', { name: /^Editar/ }).click();
  await expect(editor(page)).toBeVisible();
  await expect(campoCategoria(editor(page))).toHaveValue(guardada);
  await expect(valorVisible(editor(page))).toHaveText('CASUAL / URBANAS P20');
  const menu = await abrirMenu(editor(page));
  const lista = await opciones(editor(page));
  expect(lista).toEqual(['Selecciona una categoría', 'URBANAS', 'RUNNING', 'CASUALES', 'CASUAL / URBANAS P20', 'Otra categoría…']);
  await capturar(page, problemas, browserName, `categorias-editor-${browserName}-1280.png`);
  // Escape cierra el menú, no el editor.
  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveAttribute('open', '');
  await expect(editor(page)).toBeVisible();
  await expect(menu.locator(':scope > summary')).toBeFocused();
  await editor(page).getByLabel('Referencia del proveedor', { exact: true }).fill('REF-P20');
  await editor(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.locator('#editor-resultado')).toContainText('Guardado', { timeout: 15000 });
  const [leida] = await servicio('GET', `/rest/v1/productos?select=categoria,referencia_proveedor&id=eq.${antigua.id}`);
  expect(leida).toEqual({ categoria: guardada, referencia_proveedor: 'REF-P20' });
  await editor(page).getByRole('button', { name: 'Cerrar', exact: true }).first().click();

  // Nueva zapatilla: empieza en «Selecciona una categoría» (obligatoria) y «Otra categoría…» guarda en mayúsculas.
  await page.getByRole('button', { name: 'Agregar zapatilla' }).first().click();
  await expect(valorVisible(editor(page))).toHaveText('Selecciona una categoría');
  await expect(campoCategoria(editor(page))).toHaveValue('');
  await editor(page).getByRole('textbox', { name: 'Modelo (obligatorio)', exact: true }).fill('NUEVA P20');
  await editor(page).getByRole('combobox', { name: 'Marca (obligatorio)', exact: true }).fill('MARCA VEINTE');
  await editor(page).getByRole('radio', { name: 'Hombre', exact: true }).first().check();
  const c = editor(page).locator('.editor-variante').first();
  await c.getByRole('textbox', { name: 'Color (obligatorio)', exact: true }).fill('NEGRO');
  await c.getByLabel('Precio actual (COP)').fill('180000');
  await editor(page).getByRole('button', { name: /^Guardar/ }).first().click();
  await expect(editor(page).locator('#ed-categoria')).toHaveAttribute('aria-invalid', 'true');
  await elegirCategoria(editor(page), 'Trekking p20');
  await expect(campoCategoria(editor(page))).toHaveValue('TREKKING P20');
  await expect(editor(page).getByLabel('Escribe la nueva categoría', { exact: true })).toBeVisible();
  await editor(page).getByRole('button', { name: /^Guardar/ }).first().click();
  await expect(page.locator('#editor-resultado')).toContainText('Guardado', { timeout: 15000 });
  const nueva = (await productos20()).find((p) => p.nombre === 'NUEVA P20');
  expect(nueva.categoria).toBe('TREKKING P20');
  expect(problemas).toEqual([]);
});

test('importador: ficha, ajustes («Sin cambiar»), perfil («Sin categoría predeterminada») y prioridad de la elección a mano', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  const s = await pegarVarias(page, ['Puma Suede P20 Hombre $90.000 38 al 40', 'Nike Cortez P20 Dama $200.000 36 al 39'].join('\n\n'));
  await s.getByRole('button', { name: 'Crear 2 publicaciones' }).click();
  const f1 = ficha(page, 0);
  const f2 = ficha(page, 1);
  await expect(valorVisible(f1)).toHaveText('Selecciona una categoría');
  expect(await opciones(f1)).toEqual(['Selecciona una categoría', 'URBANAS', 'RUNNING', 'CASUALES', 'Otra categoría…']);
  await elegirCategoria(f1, 'CASUALES');
  await expect(campoCategoria(f1)).toHaveValue('CASUALES');
  // Ajustes: «Sin cambiar» conserva la de cada ficha (y no se guarda como categoría).
  const bloque = importador(page).locator('#imp-ajustes');
  await bloque.locator(':scope > summary').click();
  await expect(valorVisible(bloque)).toHaveText('Sin cambiar');
  expect(await opciones(bloque)).toEqual(['Sin cambiar', 'URBANAS', 'RUNNING', 'CASUALES', 'Otra categoría…']);
  await bloque.getByLabel('Sumar al precio del proveedor (COP)').fill('40000');
  await bloque.getByRole('button', { name: 'Aplicar ajustes a 2 fichas' }).click();
  await expect(campoCategoria(f1)).toHaveValue('CASUALES');
  await expect(campoCategoria(f2)).toHaveValue('');
  // Elegir URBANAS en bloque: se aplica a las dos.
  await elegirCategoria(bloque, 'URBANAS');
  await bloque.getByRole('button', { name: 'Aplicar ajustes a 2 fichas' }).click();
  await expect(campoCategoria(f1)).toHaveValue('URBANAS');
  await expect(campoCategoria(f2)).toHaveValue('URBANAS');
  // «Sin cambiar» otra vez: el valor del bloque vuelve a vacío (no «Sin cambiar»).
  const menu = await abrirMenu(bloque);
  await menu.getByRole('radio', { name: 'Sin cambiar', exact: true }).check();
  await expect(campoCategoria(bloque)).toHaveValue('');
  // A mano en la ficha 2 y releer su mensaje: se conserva.
  await elegirCategoria(f2, 'RUNNING');
  await color(f2, 0).getByLabel(MENSAJE).fill('Nike Cortez P20 Dama $210.000 36 al 39');
  await expect(color(f2, 0).getByLabel(/^Precio del proveedor/)).toHaveValue('210000');
  await expect(campoCategoria(f2)).toHaveValue('RUNNING');
  // Perfil: «Sin categoría predeterminada»; su categoría habitual no pisa una elegida a mano.
  const perfiles = importador(page).locator('#imp-perfiles');
  await perfiles.locator(':scope > summary').click();
  await perfiles.getByRole('button', { name: 'Crear perfil de proveedor' }).click();
  const e = perfiles.locator('#imp-perfil-editor');
  await expect(valorVisible(e)).toHaveText('Sin categoría predeterminada');
  await e.getByLabel(/^Nombre del proveedor/).fill('Proveedor Cat P20');
  await elegirCategoria(e, 'Botas p20');
  await e.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(perfiles.locator('.importador-perfil', { hasText: 'Proveedor Cat P20' })).toContainText('categoría BOTAS P20');
  await importador(page).getByRole('button', { name: 'Añadir otra publicación' }).click();
  const f3 = ficha(page, 2);
  await color(f3, 0).getByLabel(MENSAJE).fill('Fila Ray P20 Hombre $130.000 40 al 42');
  await expect(campoCategoria(f3)).toHaveValue('BOTAS P20');
  await elegirCategoria(f3, 'CASUALES');
  await color(f3, 0).getByLabel(MENSAJE).fill('Fila Ray P20 Hombre $140.000 40 al 42');
  await expect(color(f3, 0).getByLabel(/^Precio del proveedor/)).toHaveValue('140000');
  await expect(campoCategoria(f3)).toHaveValue('CASUALES');
  // Una categoría personalizada del lote aparece como opción en las demás fichas tras guardarse en el catálogo; aquí,
  // la personalizada de la ficha se conserva entre las opciones de esa ficha.
  await elegirCategoria(f1, 'Edición limitada p20');
  await expect(campoCategoria(f1)).toHaveValue('EDICIÓN LIMITADA P20');
  await capturar(page, problemas, browserName, `categorias-importador-${browserName}-1280.png`);
  expect(problemas).toEqual([]);
});

test('teclado y celular: abrir con Intro, flechas, Escape sin cerrar la ventana; sin desbordes y opciones táctiles', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  const f = ficha(page, 0);
  await color(f, 0).getByLabel(MENSAJE).fill('Puma Suede P20 Hombre $90.000 38 al 40');
  await expect(f.getByRole('textbox', { name: /^Modelo/ })).toHaveValue('SUEDE P20');
  const resumen = f.locator('.campo-categoria summary');
  await resumen.focus();
  await page.keyboard.press('Enter');
  const menu = f.locator('details.selector-categoria');
  await expect(menu).toHaveAttribute('open', '');
  await expect(menu.getByRole('radio', { name: 'Selecciona una categoría' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(campoCategoria(f)).toHaveValue('URBANAS');
  await expect(menu).toHaveAttribute('open', '');
  await page.keyboard.press('ArrowDown');
  await expect(campoCategoria(f)).toHaveValue('RUNNING');
  await capturar(page, problemas, browserName, `categorias-menu-${browserName}-390.png`);
  const d = await revisarDisposicion(page);
  expect(d.desborde).toBe(0);
  const altos = await menu.locator('.selector-categoria-opcion').evaluateAll((ns) => ns.map((n) => Math.round(n.getBoundingClientRect().height)));
  for (const a of altos) expect(a).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveAttribute('open', '');
  await expect(importador(page)).toBeVisible();
  await expect(resumen).toBeFocused();
  await expect(f.locator('.selector-categoria-valor')).toHaveText('RUNNING');
  expect(problemas).toEqual([]);
});

test('el menú sigue abierto si la ficha se repinta mientras está abierto (escribir un color y elegir el precio justo antes)', async ({ page }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  const f = ficha(page, 0);
  await color(f, 0).getByLabel(MENSAJE).fill('NIKE 7 CAMARAS P20⚠️NUMERACION DAMA💥$125.000\n📦📦DISPONIBLE $115.000');
  await expect(f.getByRole('textbox', { name: /^Modelo/ })).toHaveValue('7 CAMARAS P20');
  // Escribir el color deja un repintado diferido de la ficha; elegir el precio repinta en el acto.
  await color(f, 0).getByRole('textbox', { name: /^Color \(obligatorio\)/ }).fill('BLANCO');
  await f.locator('.importador-precios').getByRole('radio', { name: /125\.000/ }).click();
  const menu = await abrirMenu(f);
  await page.waitForTimeout(1200); // pasa el repintado diferido
  await expect(f.locator('details.selector-categoria')).toHaveAttribute('open', '');
  await f.locator('details.selector-categoria').getByRole('radio', { name: 'URBANAS', exact: true }).click();
  await expect(campoCategoria(f)).toHaveValue('URBANAS');
  await expect(menu).toBeDefined();
  expect(problemas).toEqual([]);
});
