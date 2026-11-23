// @ts-check
/* Etapa 20 · Perfiles de proveedor en el importador (selector, crear/editar/eliminar, volver a leer con
 * otro perfil y «Recordar para este proveedor»).
 *
 * SOLO contra el Supabase LOCAL y el entorno aislado (SITIO=http://127.0.0.1:8770). Usuarios FICTICIOS;
 * los perfiles viven en el IndexedDB del navegador de la prueba (un contexto nuevo por prueba).
 *
 *   SITIO=http://127.0.0.1:8770 npx playwright test tests/etapa20/perfiles.spec.js --workers=1
 */
import { test, expect } from '@playwright/test';
import {
  entorno, crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, limpiar20, entrarAlPanel, abrirImportador, importador, ficha, fichas, color,
  radioPublico, recargar, esperarGuardadoLocal, capturar, MENSAJE, elegirCategoria, campoCategoria
} from './ayudas20.js';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180000);
let admin;

test.beforeAll(async ({}, info) => {
  entorno();
  await limpiar20();
  admin = await crearUsuario(`panel20-perfiles-${info.project.name}-${Date.now().toString(36)}@gamaytalla.test`);
  await hacerAdmin(admin.id);
});
test.afterAll(async () => {
  await limpiar20().catch(() => null);
  if (admin) { await quitarAdmin(admin.id).catch(() => null); await borrarUsuario(admin.id); }
});

const perfiles = (page) => importador(page).locator('#imp-perfiles');
async function abrirPerfiles(page) {
  const d = perfiles(page);
  if (!(await d.evaluate((n) => /** @type {HTMLDetailsElement} */ (n).open))) await d.locator(':scope > summary').click();
  return d;
}
/** @param {import('@playwright/test').Page} page */
async function crearPerfil(page, { nombre, marcas = '', publico = '', numeracionExtra = '', rangos = {}, categoria = '', promociones = '' }) {
  const d = await abrirPerfiles(page);
  await d.getByRole('button', { name: 'Crear perfil de proveedor' }).click();
  const e = d.locator('#imp-perfil-editor');
  await expect(e.getByLabel(/^Nombre del proveedor/)).toBeFocused();
  await e.getByLabel(/^Nombre del proveedor/).fill(nombre);
  if (marcas) await e.getByLabel('Alias de marcas').fill(marcas);
  if (publico) await e.getByLabel('Expresiones de público').fill(publico);
  if (numeracionExtra) {
    const campo = e.getByLabel('Palabras de «numeración»');
    await campo.fill(`${await campo.inputValue()}\n${numeracionExtra}`);
  }
  for (const [p, [desde, hasta]] of Object.entries(rangos)) {
    await e.locator(`#imp-perfil-${p}-desde`).fill(String(desde));
    await e.locator(`#imp-perfil-${p}-hasta`).fill(String(hasta));
  }
  if (categoria) await elegirCategoria(e, categoria);
  if (promociones) await e.getByLabel('Frases promocionales que se omiten').fill(promociones);
  await e.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(d.locator('#imp-perfil-aviso')).toContainText(`Perfil «${nombre}» guardado en este navegador y elegido para este lote.`);
}
const tallas = (c) => c.getByLabel(/^Tallas EU/);
const modelo = (f) => f.getByRole('textbox', { name: /^Modelo/ });
const marca = (f) => f.getByRole('combobox', { name: /^Marca/ });
const categoria = (f) => campoCategoria(f);

test('dos proveedores: reglas distintas, correcciones a mano conservadas; editar o eliminar un perfil no cambia lo leído ni el borrador', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await expect(perfiles(page).locator(':scope > summary')).toContainText('Perfil del proveedor: Perfil general');
  // Validación del formulario: rango al revés y regla sin «=».
  const d = await abrirPerfiles(page);
  await d.getByRole('button', { name: 'Crear perfil de proveedor' }).click();
  await d.getByLabel(/^Nombre del proveedor/).fill('Malo P20');
  await d.getByLabel('Alias de marcas').fill('NB NEW BALANCE');
  await d.locator('#imp-perfil-dama-desde').fill('41');
  await d.locator('#imp-perfil-dama-hasta').fill('38');
  await d.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(d.locator('#imp-perfil-marcas-error')).toHaveText('Línea 1: escribe «expresión = valor».');
  await expect(d.locator('#imp-perfil-rango-dama-error')).toContainText('Dama: el rango debe ser de tallas EU enteras');
  await expect(d.getByLabel('Alias de marcas')).toHaveAttribute('aria-invalid', 'true');
  await d.getByRole('button', { name: 'Cancelar' }).click();

  await crearPerfil(page, { nombre: 'Proveedor A P20', marcas: 'NB = NEW BALANCE', numeracionExtra: 'niña = dama', rangos: { dama: [35, 40] }, categoria: 'RUNNING', promociones: 'envío gratis' });
  await expect(perfiles(page).locator(':scope > summary')).toContainText('Perfil del proveedor: Proveedor A P20');
  await capturar(page, problemas, browserName, `perfiles-${browserName}-1280.png`);
  const f1 = ficha(page, 0);
  const c1 = color(f1, 0);
  await c1.getByLabel(MENSAJE).fill('NB 9060 P20 numeración niña $300.000 envío gratis');
  await expect(marca(f1)).toHaveValue('NEW BALANCE');
  await expect(modelo(f1)).toHaveValue('9060 P20');
  await expect(radioPublico(f1, 'Dama')).toBeChecked();
  await expect(tallas(c1)).toHaveValue('35; 36; 37; 38; 39; 40');
  await expect(categoria(f1)).toHaveValue('RUNNING');
  await expect(f1.locator('#imp-' + (await f1.getAttribute('data-ficha')) + '-categoria-ayuda')).toHaveText('Categoría habitual del perfil «Proveedor A P20». Puedes cambiarla.');
  await expect(c1.locator('.importador-lectura')).toContainText('«NB» = NEW BALANCE (alias de marca, perfil «Proveedor A P20»).');
  await expect(c1.locator('.importador-lectura')).toContainText('Tallas propuestas por «numeración niña» (Dama: 35 a 40, perfil «Proveedor A P20»).');
  // Correcciones a mano.
  await modelo(f1).fill('9060 R P20');
  await tallas(c1).fill('36; 37');

  // Segundo proveedor: se elige para el lote; la ficha ya creada no cambia.
  await crearPerfil(page, { nombre: 'Proveedor B P20', publico: 'chicas = dama', rangos: { dama: [37, 39] } });
  await expect(perfiles(page).locator('#imp-perfil-aviso')).toContainText('1 ficha sin guardar se leyó con otro perfil o con una versión anterior de este.');
  await expect(marca(f1)).toHaveValue('NEW BALANCE');
  await expect(modelo(f1)).toHaveValue('9060 R P20');
  await importador(page).getByRole('button', { name: 'Añadir otra publicación' }).click();
  const f2 = ficha(page, 1);
  const c2 = color(f2, 0);
  await c2.getByLabel(MENSAJE).fill('Adidas Samba P20 para chicas todas las tallas $180.000');
  await expect(radioPublico(f2, 'Dama')).toBeChecked();
  await expect(tallas(c2)).toHaveValue('37; 38; 39');
  await expect(categoria(f2)).toHaveValue('');

  // Editar A (Dama 36–41): ninguna ficha cambia por ello.
  const lista = await abrirPerfiles(page);
  await lista.getByRole('button', { name: 'Editar el perfil Proveedor A P20' }).click();
  await lista.locator('#imp-perfil-dama-desde').fill('36');
  await lista.locator('#imp-perfil-dama-hasta').fill('41');
  await lista.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(lista.locator('#imp-perfil-aviso')).toContainText('Perfil «Proveedor A P20» guardado en este navegador. Se aplica a las publicaciones nuevas');
  await expect(tallas(c1)).toHaveValue('36; 37');
  await expect(tallas(c2)).toHaveValue('37; 38; 39');

  // Volver a leer la ficha 2 con A (acción expresa): conserva el público elegido a mano y usa el rango nuevo de A.
  // Público elegido a mano (ya estaba en Dama por la lectura: se cambia y se vuelve a elegir).
  await radioPublico(f2, 'Hombre').check();
  await radioPublico(f2, 'Dama').check();
  await lista.getByRole('radio', { name: /^Proveedor A P20/ }).check();
  await expect(lista.locator('#imp-perfil-aviso')).toContainText('Las publicaciones nuevas de este lote se leerán con «Proveedor A P20». Las fichas ya creadas no cambian.');
  await expect(tallas(c2)).toHaveValue('37; 38; 39');
  // Son 2: la ficha 2 (leída con B) y la 1 (leída con la versión anterior de A).
  await lista.getByRole('button', { name: 'Volver a leer 2 fichas con «Proveedor A P20»' }).click();
  await expect(importador(page).locator('#importador-resultado')).toContainText('Se volvieron a leer 2 fichas (1 y 2) con «Proveedor A P20». Lo que corregiste a mano se conservó.');
  await expect(radioPublico(f2, 'Dama')).toBeChecked();
  await expect(tallas(c2)).toHaveValue('36; 37; 38; 39; 40; 41');
  await expect(modelo(f1)).toHaveValue('9060 R P20');
  await expect(tallas(c1)).toHaveValue('36; 37');
  await expect(categoria(f1)).toHaveValue('RUNNING');
  await expect(lista.locator('#imp-perfil-reaplicar')).toHaveCount(0);

  // Eliminar A: el lote y sus fichas conservan las reglas con las que se leyeron.
  await lista.getByRole('button', { name: 'Eliminar el perfil Proveedor A P20' }).click();
  await lista.getByRole('button', { name: 'Eliminar el perfil', exact: true }).click();
  await expect(perfiles(page).locator(':scope > summary')).toContainText('Perfil del proveedor: Proveedor A P20 (eliminado)');
  await expect(marca(f1)).toHaveValue('NEW BALANCE');
  await esperarGuardadoLocal(page);

  // Recargar: el borrador vuelve con sus perfiles; releer el mensaje usa la copia de A (alias incluido).
  await recargar(page, problemas, browserName);
  await abrirImportador(page);
  await importador(page).locator('#imp-borradores').getByRole('button', { name: /^Continuar el borrador Proveedor A P20/ }).click();
  await expect(fichas(page)).toHaveCount(2);
  await expect(modelo(ficha(page, 0))).toHaveValue('9060 R P20');
  await expect(tallas(color(ficha(page, 0), 0))).toHaveValue('36; 37');
  await expect(categoria(ficha(page, 0))).toHaveValue('RUNNING');
  await color(ficha(page, 0), 0).getByLabel(MENSAJE).fill('NB 9060 P20 numeración niña $310.000 envío gratis');
  await expect(color(ficha(page, 0), 0).getByLabel(/^Precio del proveedor/)).toHaveValue('310000');
  await expect(marca(ficha(page, 0))).toHaveValue('NEW BALANCE');
  await expect(modelo(ficha(page, 0))).toHaveValue('9060 R P20');
  await expect(perfiles(page).locator(':scope > summary')).toContainText('(eliminado)');
  expect(problemas).toEqual([]);
});

test('«Recordar para este proveedor»: alias, categoría y público solo al confirmar; las fichas ya creadas no cambian', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  const f1 = ficha(page, 0);
  const c1 = color(f1, 0);
  // Con el Perfil general no se puede recordar: se pide elegir o crear un perfil.
  await c1.getByLabel(MENSAJE).fill('ZX 750 P20 para las nenas $200.000 40 al 42');
  await expect(marca(f1)).toHaveValue('');
  await marca(f1).fill('ADIDAS');
  await expect(f1.locator('.importador-recordar')).toContainText('elige o crea arriba el perfil de este proveedor');
  await crearPerfil(page, { nombre: 'Proveedor C P20' });
  // El lote ya usa C: la propuesta se guardaría en C.
  const recordar = f1.locator('.importador-recordar');
  await expect(recordar).toContainText('Se añadirá al perfil «Proveedor C P20»');
  await expect(recordar).toContainText('Se guardará: «ZX» = ADIDAS');
  await elegirCategoria(f1, 'URBANAS');
  await expect(recordar).toContainText('Se guardará: Categoría habitual: URBANAS');
  await recordar.getByRole('button', { name: 'Recordar «ZX» = ADIDAS para Proveedor C P20' }).click();
  await expect(importador(page).locator('#importador-resultado')).toContainText('Guardado en el perfil «Proveedor C P20»: «ZX» = ADIDAS.');
  await expect(recordar).not.toContainText('«ZX» = ADIDAS');
  await recordar.getByRole('button', { name: 'No recordar Categoría habitual: URBANAS' }).click();
  await expect(f1.locator('.importador-recordar')).toHaveCount(0);
  // Público elegido a mano: se escribe la expresión y se ve exactamente la regla antes de guardarla.
  await radioPublico(f1, 'Dama').check();
  const entrada = f1.getByLabel('Palabras del mensaje que indican Dama');
  await entrada.fill('chicas');
  await f1.getByRole('button', { name: 'Recordar la expresión de público para Proveedor C P20' }).click();
  await expect(importador(page).locator('#importador-resultado')).toContainText('«chicas» no aparece como palabras completas en el mensaje.');
  await entrada.fill('para las nenas');
  await expect(f1.locator('.importador-recordar-regla')).toHaveText('Se guardará: «para las nenas» = Dama');
  await f1.getByRole('button', { name: 'Recordar la expresión de público para Proveedor C P20' }).click();
  await expect(importador(page).locator('#importador-resultado')).toContainText('Guardado en el perfil «Proveedor C P20»: «para las nenas» = Dama.');
  // Lo recordado sirve para la publicación siguiente; la ficha 1 conserva lo que tenía.
  await importador(page).getByRole('button', { name: 'Añadir otra publicación' }).click();
  const f2 = ficha(page, 1);
  await color(f2, 0).getByLabel(MENSAJE).fill('ZX 500 P20 para las nenas $210.000 40 al 42');
  await expect(marca(f2)).toHaveValue('ADIDAS');
  await expect(modelo(f2)).toHaveValue('500 P20');
  await expect(radioPublico(f2, 'Dama')).toBeChecked();
  await expect(categoria(f2)).toHaveValue('');
  await expect(modelo(f1)).toHaveValue('ZX 750 P20 PARA LAS NENAS');
  await expect(marca(f1)).toHaveValue('ADIDAS');
  await expect(perfiles(page).locator('.importador-perfil', { hasText: 'Proveedor C P20' })).toContainText('1 alias de marca · 1 expresión de público.');
  await capturar(page, problemas, browserName, `recordar-${browserName}-1280.png`);
  expect(problemas).toEqual([]);
});
