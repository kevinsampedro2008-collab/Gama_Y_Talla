// @ts-check
/* Etapa 19 · Editor: cerrar el selector de archivos sin elegir fotos NO es intentar salir del editor.
 *
 * Al cerrar sin elegir, el navegador lanza «cancel» en el <input type=file>; ese evento burbujea hasta el
 * <dialog> del editor, que también recibe «cancel» con Escape. Solo el segundo debe preguntar por los
 * cambios sin guardar.
 *
 * SOLO contra el stack local desechable de Supabase y el sitio servido en 127.0.0.1:8765. Producto
 * FICTICIO de la marca «MARCA EDITOR T19», con una foto que ya es del sitio (no se sube nada a Storage);
 * se crea antes de la prueba y se borra al terminar. Nada se guarda desde el editor.
 *
 *   npx playwright test tests/etapa19/editor-cancelar.spec.js --workers=1
 */
import { test, expect } from '@playwright/test';
import {
  PANEL, entorno, servicio, crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, configurarPanel, ingresar, borrarCatalogo
} from '../etapa15/ayudas-panel.js';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120000);

const MARCA = 'MARCA EDITOR T19';
let admin;

async function borrarTodo() {
  const productos = await servicio('GET', `/rest/v1/productos?select=id,variantes(id)&marca=eq.${encodeURIComponent(MARCA)}`);
  if (productos.length) await borrarCatalogo({ productos, variantes: productos.flatMap((p) => p.variantes) });
}

test.beforeAll(async ({}, info) => {
  entorno();
  await borrarTodo();
  admin = await crearUsuario(`editor19-${info.project.name}-${Date.now().toString(36)}@gamaytalla.test`);
  await hacerAdmin(admin.id);
  const [p] = await servicio('POST', '/rest/v1/productos?select=id', [
    { nombre: 'CANCELAR ARCHIVO T19', marca: MARCA, categoria: 'URBANAS', publico: 'unisex', orden: 1, activo: false }
  ], 'return=representation');
  const [v] = await servicio('POST', '/rest/v1/variantes?select=id', [
    { producto_id: p.id, color: 'BLANCO', precio: 150000, orden: 0, activa: true }
  ], 'return=representation');
  await servicio('POST', '/rest/v1/fotos', [
    { variante_id: v.id, ruta: 'assets/images/productos/editadas/zapatilla_01.webp', orden: 0 },
    { variante_id: v.id, ruta: 'assets/images/productos/editadas/zapatilla_02.webp', orden: 1 }
  ]);
  await servicio('POST', '/rest/v1/tallas', ['40', '41', '42'].map((t) => ({ variante_id: v.id, talla: t, estado: 'REVISAR', activa: true })));
});
test.afterAll(async () => {
  await borrarTodo().catch(() => null);
  if (admin) { await quitarAdmin(admin.id).catch(() => null); await borrarUsuario(admin.id); }
});

const editor = (page) => page.locator('#editor');
const salida = (page) => page.locator('#editor-salida');
const modelo = (page) => editor(page).getByRole('textbox', { name: 'Modelo (obligatorio)', exact: true });

test('cerrar el selector de archivos sin elegir conserva el editor; Escape sobre el diálogo sigue avisando', async ({ page }) => {
  const problemas = [];
  page.on('pageerror', (e) => problemas.push(`EXCEPCIÓN: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problemas.push(m.text()); });
  await page.setViewportSize({ width: 390, height: 700 });
  await configurarPanel(page);
  await page.goto(PANEL);
  await ingresar(page, admin);
  await expect(page.locator('#lista-productos > li').first()).toBeVisible();
  await page.getByLabel('Buscar por código interno, referencia, marca o modelo').fill('CANCELAR ARCHIVO');
  await expect(page.locator('#lista-productos > li')).toHaveCount(1);
  await page.getByRole('button', { name: /^Editar CANCELAR ARCHIVO T19/ }).click();
  await expect(editor(page)).toBeVisible();
  await expect(editor(page).locator('.editor-foto')).toHaveCount(2);

  // Un cambio sin guardar.
  await modelo(page).fill('CANCELAR ARCHIVO EDITADO');

  // Selectores de archivos del editor: «Añadir fotos» y «Reemplazar» la segunda foto.
  const campos = [
    editor(page).locator('input[type=file][data-archivos]').first(),
    editor(page).locator('input[type=file][data-reemplazar]').first()
  ];
  for (const campo of campos) {
    // Bajar hasta las fotos y dejar el foco en el campo, como al pulsar su botón.
    await campo.evaluate((n) => { n.closest('label').scrollIntoView({ block: 'center' }); n.focus(); });
    const antes = await campo.evaluate((n) => ({ y: document.querySelector('#editor-cuerpo').scrollTop, id: n.id }));
    expect(antes.y, 'el editor está desplazado hasta las fotos').toBeGreaterThan(0);
    // Lo que hace el navegador al cerrar el selector sin elegir: «cancel» en el campo, que burbujea.
    await campo.dispatchEvent('cancel', { bubbles: true });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    await expect(salida(page), 'no pregunta por salir del editor').toBeHidden();
    await expect(editor(page)).toBeVisible();
    await expect(modelo(page)).toHaveValue('CANCELAR ARCHIVO EDITADO');
    await expect(editor(page).locator('.editor-foto')).toHaveCount(2);
    const despues = await campo.evaluate((n) => ({ y: document.querySelector('#editor-cuerpo').scrollTop, foco: document.activeElement === n }));
    expect(despues.y, 'misma posición dentro del editor').toBe(antes.y);
    expect(despues.foco, 'el foco sigue en el campo de archivos').toBe(true);
  }

  // Escape sobre el diálogo, con cambios sin guardar: sí avisa.
  await modelo(page).focus();
  await page.keyboard.press('Escape');
  await expect(salida(page)).toBeVisible();
  await expect(page.locator('#editor-salida-texto')).toHaveText('Tienes cambios sin guardar. ¿Quieres descartarlos?');
  await editor(page).getByRole('button', { name: 'Seguir editando' }).click();
  await expect(salida(page)).toBeHidden();
  await expect(modelo(page)).toHaveValue('CANCELAR ARCHIVO EDITADO');
  await expect(editor(page).locator('.editor-foto')).toHaveCount(2);

  // Descartar: nada se guardó.
  await page.keyboard.press('Escape');
  await editor(page).getByRole('button', { name: 'Descartar cambios' }).click();
  await expect(editor(page)).toBeHidden();
  const [fila] = await servicio('GET', `/rest/v1/productos?select=nombre&marca=eq.${encodeURIComponent(MARCA)}`);
  expect(fila.nombre).toBe('CANCELAR ARCHIVO T19');
  expect(problemas).toEqual([]);
});
