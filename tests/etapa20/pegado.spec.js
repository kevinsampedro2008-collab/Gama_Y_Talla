// @ts-check
/* Etapa 20 · «Pegar varias publicaciones» en el importador.
 *
 * SOLO contra el Supabase LOCAL y el entorno aislado (SITIO=http://127.0.0.1:8770, `node
 * scripts/entorno-local.mjs`). Usuarios y productos FICTICIOS (modelos « P20»); todo se borra al terminar.
 *
 *   SITIO=http://127.0.0.1:8770 npx playwright test tests/etapa20/pegado.spec.js --workers=1
 */
import { test, expect } from '@playwright/test';
import {
  entorno, crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, revisarDisposicion,
  limpiar20, entrarAlPanel, abrirImportador, importador, ficha, fichas, color, radioPublico, pegarVarias, capturar,
  MENSAJE, PEGADO, REEBOK, NIKE, ON, NB, TELEFONO
} from './ayudas20.js';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180000);
let admin;

test.beforeAll(async ({}, info) => {
  entorno();
  await limpiar20();
  admin = await crearUsuario(`panel20-pegado-${info.project.name}-${Date.now().toString(36)}@gamaytalla.test`);
  await hacerAdmin(admin.id);
});
test.afterAll(async () => {
  await limpiar20().catch(() => null);
  if (admin) { await quitarAdmin(admin.id).catch(() => null); await borrarUsuario(admin.id); }
});

const fragmentos = (s) => s.locator('.importador-fragmento');

test('separa cuatro mensajes (Reebok, Nike, ON, New Balance) con saltos internos y emojis; crea las fichas en la inicial vacía', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  const s = await pegarVarias(page, [REEBOK, NIKE, ON, NB].join('\n\n'));
  await expect(fragmentos(s)).toHaveCount(4);
  await expect(s.locator('#imp-pegado-resumen')).toHaveText('4 publicaciones detectadas · se crearán 4 fichas con 4 colores.');
  // Los saltos internos se conservan: cada fragmento es el mensaje completo, tal cual.
  const textos = await fragmentos(s).locator('.importador-fragmento-texto').allTextContents();
  expect(textos).toEqual([REEBOK, NIKE, ON, NB]);
  await expect(fragmentos(s).nth(1).locator('.importador-fragmento-datos')).toContainText('NIKE · 7 CAMARAS P20 · $ 125.000 o $ 115.000 (elegir)');
  await expect(s.locator('.importador-fragmento.es-dudosa')).toHaveCount(0);
  await capturar(page, problemas, browserName, `pegado-revision-${browserName}-1280.png`);

  // Doble clic en «Crear 4 publicaciones»: no se duplica nada.
  await s.getByRole('button', { name: 'Crear 4 publicaciones' }).dblclick();
  await expect(fichas(page)).toHaveCount(4);
  await expect(importador(page).locator('#imp-pegado')).toHaveCount(0);
  const esperados = [['REEBOK', 'PRINCENSA P20', 'Unisex'], ['NIKE', '7 CAMARAS P20', 'Dama'], ['ON', 'CLOUD REMIX P20', ''], ['NEW BALANCE', '603 P20', 'Hombre']];
  for (const [i, [marca, modelo, publico]] of esperados.entries()) {
    const f = ficha(page, i);
    await expect(f.getByRole('combobox', { name: /^Marca/ })).toHaveValue(marca);
    await expect(f.getByRole('textbox', { name: /^Modelo/ })).toHaveValue(modelo);
    if (publico) await expect(radioPublico(f, publico)).toBeChecked();
    // El texto de la publicación es el mensaje original, sin el teléfono en ningún campo público.
    await expect(color(f, 0).getByLabel(MENSAJE)).toHaveValue([REEBOK, NIKE, ON, NB][i]);
    const valores = await f.locator('input:not([type=radio]):not([type=checkbox]):not([type=file]):not([type=color])').evaluateAll((ns) => ns.map((n) => /** @type {HTMLInputElement} */ (n).value).join(' | '));
    expect(valores).not.toContain('3000000000');
  }
  await expect(importador(page).locator('#importador-resultado')).toContainText('Se crearon 4 publicaciones (fichas 1 a 4)');
  expect(problemas).toEqual([]);
});

test('encabezados de WhatsApp: separa por mensaje, omite multimedia y señala la continuación dudosa; unir y separar a mano', async ({ page }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  const pegado = [
    `[22/11/26, 10:15:02] Proveedor Ficticio: ${NIKE}`,
    '[22/11/26, 10:15:40] Proveedor Ficticio: <Multimedia omitido>',
    `[22/11/26, 10:16:01] Proveedor Ficticio: ${ON}`,
    '22/11/26, 10:17 - Proveedor Ficticio: Colores negro y blanco <Se editó este mensaje.>',
    `[10:18 a. m., 22/11/2026] ${TELEFONO}: ${NB}`
  ].join('\n');
  const s = await pegarVarias(page, pegado);
  await expect(fragmentos(s)).toHaveCount(5);
  // La foto sola no se crea; la continuación sin precio ni marca queda señalada y sin marcar.
  await expect(fragmentos(s).nth(1).getByRole('checkbox', { name: 'Crear esta publicación' })).toBeDisabled();
  await expect(fragmentos(s).nth(3)).toHaveClass(/es-dudosa/);
  await expect(fragmentos(s).nth(3).locator('.importador-fragmento-duda')).toContainText('El fragmento 4 no trae precio ni marca: ¿es la continuación del 3?');
  await expect(fragmentos(s).nth(3).getByRole('checkbox', { name: 'Crear esta publicación' })).not.toBeChecked();
  await expect(fragmentos(s).nth(0).locator('.importador-encabezado')).toHaveText('Mensaje de WhatsApp: [22/11/26, 10:15:02] Proveedor Ficticio');
  await expect(s.locator('#imp-pegado-resumen')).toHaveText('5 publicaciones detectadas · se crearán 3 fichas con 3 colores · 1 división dudosa por revisar.');

  // Unir el fragmento dudoso con el anterior (ON): queda una sola publicación con los dos textos.
  await fragmentos(s).nth(3).getByRole('button', { name: 'Unir la publicación 4 con la 3' }).click();
  await expect(fragmentos(s)).toHaveCount(4);
  await expect(fragmentos(s).nth(2).locator('.importador-fragmento-texto')).toContainText('Colores negro y blanco');
  await expect(fragmentos(s).nth(2).locator('.importador-fragmento-texto')).not.toContainText('Se editó');
  await expect(page.locator('#imp-frag-' + (await fragmentos(s).nth(2).getAttribute('data-inicio')) + '-titulo')).toBeFocused();

  // Separar a mano: «Separar antes de…» la línea de los colores devuelve dos fragmentos.
  const tercero = fragmentos(s).nth(2);
  await tercero.locator('summary', { hasText: 'Separar…' }).click();
  await tercero.getByRole('button', { name: /^Separar antes de «Colores negro y blanco/ }).click();
  await expect(fragmentos(s)).toHaveCount(5);
  await expect(fragmentos(s).nth(3).locator('.importador-fragmento-texto')).toHaveText('Colores negro y blanco');
  // Vuelve a unir y crea: 3 publicaciones (NIKE, ON con colores, NB).
  await fragmentos(s).nth(3).getByRole('button', { name: 'Unir la publicación 4 con la 3' }).click();
  await s.getByRole('button', { name: 'Crear 3 publicaciones' }).click();
  await expect(fichas(page)).toHaveCount(3);
  await expect(color(ficha(page, 1), 0).getByLabel(MENSAJE)).toHaveValue(`${ON}\nColores negro y blanco`);
  // El texto original (con encabezados) se conserva para revisar.
  await ficha(page, 1).locator('summary', { hasText: 'Ver el texto original pegado' }).click();
  await expect(ficha(page, 1).locator('.importador-original-texto')).toContainText('[22/11/26, 10:16:01] Proveedor Ficticio:');
  await expect(ficha(page, 2).locator('.importador-encabezado')).toHaveText(`Mensaje de WhatsApp: [10:18 a. m., 22/11/2026] ${TELEFONO}`);
  expect(problemas).toEqual([]);
});

test('sin líneas en blanco: el corte respeta el cierre de contacto y marca lo dudoso; lote con trabajo existente', async ({ page }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  // Trabajo previo: una ficha escrita a mano con su público elegido.
  const f0 = ficha(page, 0);
  await color(f0, 0).getByLabel(MENSAJE).fill('Adidas Samba P20 $180.000 40 al 42');
  await expect(f0.getByRole('textbox', { name: /^Modelo/ })).toHaveValue('SAMBA P20');
  await radioPublico(f0, 'Hombre').check();
  await f0.getByRole('textbox', { name: /^Modelo/ }).fill('SAMBA OG P20');
  const s = await pegarVarias(page, [REEBOK, NIKE, 'Puma Suede P20 $90.000 38 al 40'].join('\n'));
  await expect(fragmentos(s)).toHaveCount(3);
  // Tras el teléfono del mensaje anterior el corte es seguro; «Puma» justo debajo de otros datos, dudoso.
  await expect(fragmentos(s).nth(1)).not.toHaveClass(/es-dudosa/);
  await expect(fragmentos(s).nth(0).locator('.importador-fragmento-texto')).toHaveText(REEBOK.replace('\n\n', '\n'));
  await s.getByRole('button', { name: 'Crear 3 publicaciones' }).click();
  // Se añaden DESPUÉS de la ficha existente, que conserva lo escrito a mano.
  await expect(fichas(page)).toHaveCount(4);
  await expect(f0.getByRole('textbox', { name: /^Modelo/ })).toHaveValue('SAMBA OG P20');
  await expect(radioPublico(f0, 'Hombre')).toBeChecked();
  await expect(ficha(page, 1).getByRole('textbox', { name: /^Modelo/ })).toHaveValue('PRINCENSA P20');
  await expect(ficha(page, 3).getByRole('textbox', { name: /^Modelo/ })).toHaveValue('SUEDE P20');
  // No se agrupa nada solo ni se escribe en Supabase.
  await expect(importador(page).locator('.importador-coincidencia')).toHaveCount(0);
  expect(problemas).toEqual([]);
});

test('celular: una sola zona de desplazamiento, sin desbordes y controles táctiles', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  // Una línea en blanco no separa: el texto suelto se separa por la línea «-----» y queda dudoso, sin marcar.
  const s = await pegarVarias(page, `${[REEBOK, NIKE, ON, NB].join('\n\n')}\n-----\nTexto suelto sin datos P20`);
  await expect(fragmentos(s)).toHaveCount(5);
  await expect(fragmentos(s).nth(4)).toHaveClass(/es-dudosa/);
  await s.scrollIntoViewIfNeeded();
  await capturar(page, problemas, browserName, `pegado-revision-${browserName}-390.png`);
  const d = await revisarDisposicion(page);
  expect(d.desborde).toBe(0);
  expect(d.fuera).toBe(0);
  // Casillas y opciones: el área táctil es su etiqueta (.casilla, 44 px); los <input type=file> están ocultos.
  const pequenos = d.pequenos.filter((x) => !x.startsWith('input#'));
  expect(pequenos).toEqual([]);
  const casillas = await importador(page).locator('#imp-pegado .casilla, #imp-entrada .casilla').evaluateAll((ns) => ns.filter((n) => n.offsetParent).map((n) => Math.round(n.getBoundingClientRect().height)));
  for (const alto of casillas) expect(alto).toBeGreaterThanOrEqual(44);
  // Una sola zona de desplazamiento: el cuerpo del importador; la página y el diálogo no se desplazan.
  const zonas = await page.evaluate(() => [...document.querySelectorAll('#importador *')].filter((n) => {
    const c = getComputedStyle(n);
    return /(auto|scroll)/.test(c.overflowY) && n.scrollHeight > n.clientHeight + 1;
  }).map((n) => n.id || n.className));
  expect(zonas).toEqual(['importador-cuerpo']);
  await s.getByRole('button', { name: 'Crear 4 publicaciones' }).click();
  await expect(fichas(page)).toHaveCount(4);
  expect(problemas).toEqual([]);
});
