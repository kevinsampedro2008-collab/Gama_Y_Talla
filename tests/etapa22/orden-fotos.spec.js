// @ts-check
/* Etapa 22 · «Asignar fotos por lote»: elegir el orden con las fotos dentro del panel.
 *
 * El selector de archivos del sistema puede entregar las imágenes en otro orden que el de los clics: aquí se
 * reciben en un orden y se eligen en otro con la galería. SOLO contra el Supabase LOCAL y el entorno aislado
 * (SITIO=http://127.0.0.1:8770). Fichas FICTICIAS (modelos « P22») y fotos WebP de prueba; no se guarda nada
 * en el catálogo (se comprueba el reparto en el panel y el borrador local).
 *
 *   SITIO=http://127.0.0.1:8770 npx playwright test tests/etapa22 --workers=1
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  entorno, crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, servicio, entrarAlPanel, abrirImportador, importador, ficha, fichas, color,
  recargar, esperarGuardadoLocal, pegarVarias, prepararFotos20, revisarDisposicion, capturar
} from '../etapa20/ayudas20.js';

test.describe.configure({ mode: 'serial' });
test.setTimeout(240000);

const SALIDA = path.join(os.tmpdir(), 'gama-talla-22');
const MARCAS = ['Nike', 'Adidas', 'Puma', 'Reebok', 'New Balance'];
let admin; let rutas;

test.beforeAll(async ({}, info) => {
  entorno();
  admin = await crearUsuario(`panel22-${info.project.name}-${Date.now().toString(36)}@gamaytalla.test`);
  await hacerAdmin(admin.id);
  rutas = await prepararFotos20(6); // p20-01.webp … p20-06.webp: seis fotos distintas
  fs.mkdirSync(SALIDA, { recursive: true });
});
test.afterAll(async () => {
  // Estas pruebas no guardan nada en el catálogo: se comprueba y se retira el usuario de prueba.
  const productos = await servicio('GET', `/rest/v1/productos?select=id&nombre=like.*${encodeURIComponent(' P22')}`);
  expect(productos).toEqual([]);
  if (admin) { await quitarAdmin(admin.id).catch(() => null); await borrarUsuario(admin.id); }
});

// ---------------------------------------------------------------- ayudas
const reparto = (page) => importador(page).locator('#imp-reparto');
const galeria = (page) => reparto(page).locator('#imp-orden');
const miniaturas = (page) => galeria(page).locator('.importador-orden-foto');
const filasOrden = (page) => galeria(page).locator('.importador-orden-fila');
const itemsLista = (page) => reparto(page).locator('.importador-reparto-item');
const nombres = (page) => reparto(page).locator('.importador-reparto-item .importador-reparto-archivo').allTextContents();
const foto = (n) => `p20-0${n}.webp`;

async function prepararFichas(page, n) {
  const mensajes = Array.from({ length: n }, (_, i) => `🔥${MARCAS[i % 5]} Orden${i + 1} P22🔥\n${i % 2 ? 'Dama' : 'Hombre'} $${100 + i}.000\n40 al 42 Euro ✅\nColor: TONO${i + 1}\n\nPedidos al +57 3000000000`);
  const s = await pegarVarias(page, mensajes.join('\n\n'));
  await s.getByRole('button', { name: `Crear ${n} publicaciones` }).click();
  await expect(fichas(page)).toHaveCount(n);
}
// «Asignar fotos por lote» abre el selector del sistema; se responde con estos archivos EN ESTE ORDEN.
async function recibir(page, archivos) {
  const [selector] = await Promise.all([page.waitForEvent('filechooser'), reparto(page).getByRole('button', { name: /^(Asignar fotos por lote|Añadir más imágenes)$/ }).click()]);
  await selector.setFiles(archivos);
}
const esperarOptimizadas = (page) => expect(itemsLista(page).filter({ hasText: 'Optimizando…' })).toHaveCount(0, { timeout: 60000 });
// Un botón de la galería por su número de recepción (no por el nombre: puede repetirse).
const miniatura = (page, recibida) => galeria(page).getByRole('button', { name: new RegExp(`recibida n\\.º ${recibida},`) });
// Número de selección de cada miniatura, en el orden de la galería ('' = sin elegir).
const numeros = (page) => miniaturas(page).locator('.importador-orden-numero').allTextContents();
async function elegir(page, ...recibidas) { for (const n of recibidas) await miniatura(page, n).click(); }
async function abrirGaleria(page) {
  await reparto(page).getByRole('button', { name: 'Elegir orden con las fotos' }).click();
  await expect(galeria(page)).toBeVisible();
}
const pixel = (loc) => loc.evaluate(async (img) => {
  const i = /** @type {HTMLImageElement} */ (img);
  await i.decode().catch(() => null);
  const lienzo = document.createElement('canvas');
  lienzo.width = i.naturalWidth; lienzo.height = i.naturalHeight;
  const x = lienzo.getContext('2d');
  x.drawImage(i, 0, 0);
  return `${lienzo.width}x${lienzo.height}:${[...x.getImageData(20, 20, 1, 1).data].join(',')}`;
});
// La misma huella de un archivo de prueba, cargado como data: (lo admite la CSP).
const pixelArchivo = (page, ruta) => page.evaluate(async (datos) => {
  const i = new Image();
  i.src = `data:image/webp;base64,${datos}`;
  await i.decode();
  const lienzo = document.createElement('canvas');
  lienzo.width = i.naturalWidth; lienzo.height = i.naturalHeight;
  const x = lienzo.getContext('2d');
  x.drawImage(i, 0, 0);
  return `${lienzo.width}x${lienzo.height}:${[...x.getImageData(20, 20, 1, 1).data].join(',')}`;
}, fs.readFileSync(ruta).toString('base64'));
const fotoDe = (page, f) => color(ficha(page, f), 0).locator('.editor-foto img').first();

// Fotos asignadas a cada ficha tras «Asignar fotos»: [ficha → foto n | null].
async function repartoFinal(page, fichasN) {
  const salida = [];
  for (let i = 0; i < fichasN; i++) {
    const imgs = color(ficha(page, i), 0).locator('.editor-foto img');
    salida.push(await imgs.count() ? await pixel(imgs.first()) : null);
  }
  return salida;
}
const esperado = async (page, ...numeros2) => Promise.all(numeros2.map((n) => (n ? pixelArchivo(page, rutas[n - 1]) : null)));

// ======================================================================== 1. elegir el orden con las fotos
test('imágenes recibidas 1…5 y elegidas 3, 1, 4, 2: numeración, quitar, deshacer, reiniciar, secuencia y reparto final', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await prepararFichas(page, 4);
  await recibir(page, [1, 2, 3, 4, 5].map((n) => rutas[n - 1]));
  await esperarOptimizadas(page);
  // Antes de elegir: el orden recibido es el de la lista, con la explicación.
  expect(await nombres(page)).toEqual([1, 2, 3, 4, 5].map(foto));
  await expect(reparto(page).locator('.importador-reparto-herramientas')).toContainText('El selector del dispositivo puede cambiar el orden');

  await abrirGaleria(page);
  await expect(galeria(page).getByRole('heading', { name: 'Elige el orden con las fotos' })).toBeFocused();
  await expect(galeria(page)).toContainText('El selector del dispositivo puede cambiar el orden. Aquí puedes elegirlo antes de asignar.');
  await expect(miniaturas(page)).toHaveCount(5);
  // Miniaturas suficientemente grandes para reconocer las zapatillas.
  for (const caja of await galeria(page).locator('.importador-orden-marco').all()) expect((await caja.boundingBox()).width).toBeGreaterThanOrEqual(110);
  // Sin elegir nada: no se puede confirmar, deshacer ni reiniciar.
  for (const nombre of ['Confirmar este orden', 'Deshacer última selección', 'Reiniciar orden']) await expect(galeria(page).getByRole('button', { name: nombre })).toHaveAttribute('aria-disabled', 'true');
  await expect(galeria(page).locator('#imp-orden-contador')).toHaveText('0 de 5 fotos elegidas.');

  // Pulsar numera en el orden de los clics; volver a pulsar quita y renumera.
  await elegir(page, 3, 1, 4, 5);
  expect(await numeros(page)).toEqual(['2', '', '1', '3', '4']);
  await expect(miniatura(page, 3)).toHaveAttribute('aria-pressed', 'true');
  await expect(miniatura(page, 3)).toHaveAccessibleName(`${foto(3)}, recibida n.º 3, elegida en la posición 1`);
  await miniatura(page, 5).click(); // la quita
  await miniatura(page, 1).click(); // la quita: 4 pasa a ser la 2.ª
  expect(await numeros(page)).toEqual(['', '', '1', '2', '']);
  await miniatura(page, 1).click(); // vuelve a elegirla: ahora al final
  expect(await numeros(page)).toEqual(['3', '', '1', '2', '']);
  // Teclado: Espacio y Intro sobre el botón enfocado.
  await miniatura(page, 2).focus();
  await page.keyboard.press('Space');
  expect(await numeros(page)).toEqual(['3', '4', '1', '2', '']);
  await expect(miniatura(page, 2)).toBeFocused(); // el repintado no pierde el foco
  await page.keyboard.press('Enter');
  expect(await numeros(page)).toEqual(['3', '', '1', '2', '']);
  // Deshacer la última y reiniciar.
  await galeria(page).getByRole('button', { name: 'Deshacer última selección' }).click();
  expect(await numeros(page)).toEqual(['', '', '1', '2', '']); // la selección era 3, 4, 1: deshace la última (1)
  await expect(galeria(page).locator('#imp-orden-contador')).toHaveText('2 de 5 fotos elegidas.');
  await galeria(page).getByRole('button', { name: 'Reiniciar orden' }).click();
  expect(await numeros(page)).toEqual(['', '', '', '', '']);
  await expect(galeria(page).locator('#imp-orden-contador')).toHaveText('0 de 5 fotos elegidas.');

  // La elección final: 3, 1, 4, 2 (la 5 queda sin elegir).
  await elegir(page, 3, 1, 4, 2);
  expect(await numeros(page)).toEqual(['2', '4', '1', '3', '']);
  // Secuencia elegida con el destino de cada foto: ficha, modelo y color.
  await expect(filasOrden(page)).toHaveCount(4);
  for (const [i, [archivo, fichaN]] of [[foto(3), 1], [foto(1), 2], [foto(4), 3], [foto(2), 4]].entries()) {
    await expect(filasOrden(page).nth(i)).toContainText(`${i + 1}. ${archivo}`);
    await expect(filasOrden(page).nth(i)).toContainText(new RegExp(`Ficha ${fichaN} · .*ORDEN${fichaN} P22 · .* · Color 1 · TONO${fichaN}`));
  }
  await expect(galeria(page).locator('.importador-reparto-sinelegir')).toHaveText('1 imagen sin elegir no se asignará. Puedes incluirlas al final cuando quieras.');
  await capturar(page, problemas, browserName, `orden-galeria-${browserName}-1280.png`);

  // Confirmar: las elegidas, en ese orden, y la otra «sin elegir».
  await galeria(page).getByRole('button', { name: /^Confirmar este orden \(4\)/ }).click();
  await expect(galeria(page)).toHaveCount(0);
  await expect(reparto(page).locator('#imp-reparto-estado')).toHaveText('Orden confirmado: 4 fotos elegidas; 1 sin elegir no se asigna. Ya puedes pulsar «Asignar fotos».');
  expect(await nombres(page)).toEqual([3, 1, 4, 2, 5].map(foto));
  await expect(itemsLista(page).nth(4)).toContainText('Sin elegir: no se asigna.');
  await expect(itemsLista(page).nth(3).getByRole('button', { name: /^Bajar/ })).toHaveAttribute('aria-disabled', 'true'); // no cruza a las «sin elegir»
  await capturar(page, problemas, browserName, `orden-confirmado-${browserName}-1280.png`);

  // Reparto final: cada ficha recibe la foto de su posición.
  await reparto(page).getByRole('button', { name: 'Asignar fotos', exact: true }).click();
  await expect(color(ficha(page, 0), 0).locator('.editor-foto')).toHaveCount(1);
  expect(await repartoFinal(page, 4)).toEqual(await esperado(page, 3, 1, 4, 2));
  await expect(reparto(page).locator('#imp-reparto-estado')).toContainText('1 imagen sin elegir no se asignó.');
  expect(await nombres(page)).toEqual([foto(5)]);
  expect(problemas).toEqual([]);
});

// ======================================================================== 2. opción rápida, incluir, subir/bajar y nombre
test('opción rápida «Usar el orden recibido»; incluir una «sin elegir»; Subir, Bajar y Ordenar por nombre siguen siendo acciones expresas', async ({ page }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await prepararFichas(page, 3);
  await recibir(page, [4, 2, 6, 1].map((n) => rutas[n - 1]));
  await esperarOptimizadas(page);
  // Rápida: sin pulsar ninguna miniatura se usa el orden recibido.
  await abrirGaleria(page);
  await galeria(page).getByRole('button', { name: 'Usar el orden recibido' }).click();
  await expect(galeria(page)).toHaveCount(0);
  expect(await nombres(page)).toEqual([4, 2, 6, 1].map(foto));
  await expect(reparto(page).locator('.importador-reparto-sinelegir')).toHaveCount(0);
  // Cancelar no cambia nada.
  await abrirGaleria(page);
  await elegir(page, 4);
  await galeria(page).getByRole('button', { name: 'Cancelar' }).click();
  expect(await nombres(page)).toEqual([4, 2, 6, 1].map(foto));
  await expect(reparto(page).getByRole('button', { name: 'Elegir orden con las fotos' })).toBeFocused();
  // Elegir solo dos: las demás «sin elegir»; una se incluye al final.
  await abrirGaleria(page);
  await elegir(page, 1, 4); // recibidas n.º 1 y 4: p20-04 y p20-01 (se recibieron como 4, 2, 6, 1)
  await galeria(page).getByRole('button', { name: /^Confirmar este orden \(2\)/ }).click();
  expect(await nombres(page)).toEqual([foto(4), foto(1), foto(2), foto(6)]); // elegidas 4 y 1; luego las demás, en su orden
  await expect(itemsLista(page).filter({ hasText: 'Sin elegir: no se asigna.' })).toHaveCount(2);
  await itemsLista(page).filter({ hasText: foto(6) }).getByRole('button', { name: /^Incluir/ }).click();
  expect(await nombres(page)).toEqual([foto(4), foto(1), foto(6), foto(2)]);
  await expect(itemsLista(page).filter({ hasText: 'Sin elegir: no se asigna.' })).toHaveCount(1);
  // Subir, Bajar y Ordenar por nombre.
  await itemsLista(page).nth(2).getByRole('button', { name: /^Subir/ }).click();
  expect(await nombres(page)).toEqual([foto(4), foto(6), foto(1), foto(2)]);
  await reparto(page).getByRole('button', { name: 'Ordenar por nombre de archivo' }).click();
  expect(await nombres(page)).toEqual([foto(1), foto(4), foto(6), foto(2)]); // las «sin elegir» siguen al final
  await reparto(page).getByRole('button', { name: 'Asignar fotos', exact: true }).click();
  expect(await repartoFinal(page, 3)).toEqual(await esperado(page, 1, 4, 6));
  expect(await nombres(page)).toEqual([foto(2)]);
  expect(problemas).toEqual([]);
});

// ======================================================================== 3. recarga, destinos manuales
test('la selección en curso y el orden confirmado sobreviven a recargar; el destino manual se conserva', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await prepararFichas(page, 4);
  await recibir(page, [1, 2, 3, 4, 5].map((n) => rutas[n - 1]));
  await esperarOptimizadas(page);
  // Destino manual: la 4.ª imagen (que por orden iría a la ficha 4) va a la ficha 3.
  await itemsLista(page).nth(3).locator('summary').click();
  await itemsLista(page).nth(3).getByRole('radio', { name: /^Ficha 3 ·/ }).click();
  await expect(itemsLista(page).nth(3)).toContainText('Elegido a mano');
  await abrirGaleria(page);
  await elegir(page, 4, 2, 1);
  // El destino manual manda: la 4 → ficha 3; las otras toman los primeros colores libres.
  await expect(filasOrden(page).nth(0)).toContainText(new RegExp(`1\\. ${foto(4)}[\\s\\S]*Ficha 3 ·`));
  await expect(filasOrden(page).nth(1)).toContainText(new RegExp(`2\\. ${foto(2)}[\\s\\S]*Ficha 1 ·`));
  await expect(filasOrden(page).nth(2)).toContainText(new RegExp(`3\\. ${foto(1)}[\\s\\S]*Ficha 2 ·`));
  // Recargar con la galería abierta: la selección vuelve tal cual (por identificador, no por nombre).
  await esperarGuardadoLocal(page);
  await recargar(page, problemas, browserName);
  await abrirImportador(page);
  await importador(page).getByRole('button', { name: /^Continuar el borrador/ }).click();
  await expect(galeria(page)).toBeVisible();
  expect(await numeros(page)).toEqual(['3', '2', '', '1', '']);
  await expect(filasOrden(page)).toHaveCount(3);
  await expect(filasOrden(page).nth(0)).toContainText(new RegExp(`1\\. ${foto(4)}[\\s\\S]*Ficha 3 ·`));
  // Seguir: confirmar, recargar otra vez y comprobar orden, «sin elegir» y destino manual.
  await galeria(page).getByRole('button', { name: /^Confirmar este orden \(3\)/ }).click();
  expect(await nombres(page)).toEqual([4, 2, 1, 3, 5].map(foto));
  await expect(itemsLista(page).nth(0)).toContainText('Elegido a mano');
  await esperarGuardadoLocal(page);
  await recargar(page, problemas, browserName);
  await abrirImportador(page);
  await importador(page).getByRole('button', { name: /^Continuar el borrador/ }).click();
  await expect(itemsLista(page)).toHaveCount(5, { timeout: 60000 });
  await esperarOptimizadas(page);
  expect(await nombres(page)).toEqual([4, 2, 1, 3, 5].map(foto));
  await expect(itemsLista(page).nth(0)).toContainText('Elegido a mano');
  await expect(itemsLista(page).nth(0).locator('.importador-reparto-destino-texto strong')).toContainText('Ficha 3 ·');
  await expect(itemsLista(page).filter({ hasText: 'Sin elegir: no se asigna.' })).toHaveCount(2);
  await reparto(page).getByRole('button', { name: 'Asignar fotos', exact: true }).click();
  expect(await repartoFinal(page, 4)).toEqual(await esperado(page, 2, 1, 4, null));
  expect(problemas).toEqual([]);
});

// ======================================================================== 4. respaldo
test('el respaldo conserva la selección y su orden; se recupera tras importarlo', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await prepararFichas(page, 3);
  await recibir(page, [1, 2, 3, 4].map((n) => rutas[n - 1]));
  await esperarOptimizadas(page);
  await abrirGaleria(page);
  await elegir(page, 3, 1);
  await esperarGuardadoLocal(page);
  const borradores = importador(page).locator('#imp-borradores');
  await importador(page).getByRole('button', { name: /^Borradores/ }).click();
  const [descarga] = await Promise.all([page.waitForEvent('download'), borradores.getByRole('button', { name: /^Exportar un respaldo del borrador/ }).click()]);
  const archivo = path.join(SALIDA, `respaldo-orden-${browserName}.json`);
  await descarga.saveAs(archivo);
  const respaldo = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  const r = respaldo.borrador.datos.lote.reparto;
  // La selección se guarda con los identificadores estables de las imágenes (no con los nombres).
  expect(r.orden.elegidas).toHaveLength(2);
  expect(r.orden.elegidas.every((k) => /^r\d+$/.test(k))).toBe(true);
  expect(r.items.filter((it) => r.orden.elegidas.includes(it.clave)).map((it) => it.nombre).sort()).toEqual([foto(1), foto(3)]);
  expect(r.items.map((it) => it.recibida)).toEqual([1, 2, 3, 4]);
  // Quitar el borrador de este navegador e importar el respaldo.
  await borradores.getByRole('button', { name: 'Empezar otro lote' }).click();
  await importador(page).getByRole('button', { name: /^Borradores/ }).click();
  await borradores.locator(`[data-borrador="${respaldo.borrador.id}"]`).getByRole('button', { name: /^Eliminar el borrador/ }).click();
  await borradores.getByRole('button', { name: 'Eliminar el borrador', exact: true }).click();
  await expect(borradores.locator(`[data-borrador="${respaldo.borrador.id}"]`)).toHaveCount(0);
  await borradores.locator('#imp-respaldo-archivo').setInputFiles(archivo);
  await expect(borradores.locator('#imp-borradores-aviso')).toContainText('Respaldo importado');
  await borradores.locator(`[data-borrador="${respaldo.borrador.id}"]`).getByRole('button', { name: /^Continuar/ }).click();
  await expect(galeria(page)).toBeVisible();
  expect(await numeros(page)).toEqual(['2', '', '1', '']);
  await galeria(page).getByRole('button', { name: /^Confirmar este orden \(2\)/ }).click();
  expect(await nombres(page)).toEqual([foto(3), foto(1), foto(2), foto(4)]);
  await reparto(page).getByRole('button', { name: 'Asignar fotos', exact: true }).click();
  expect(await repartoFinal(page, 3)).toEqual(await esperado(page, 3, 1, null));
  expect(problemas).toEqual([]);
});

// ======================================================================== 5. nombres repetidos y optimización lenta
test('nombres de archivo repetidos y optimización lenta: el orden no cambia cuando termina de optimizarse una imagen', async ({ page }) => {
  // La optimización de cada imagen tarda 1,2 s (solo en esta prueba): se elige mientras se optimizan.
  await page.addInitScript(() => {
    const original = window.createImageBitmap.bind(window);
    window.__retardo = 0;
    window.createImageBitmap = async (...a) => { if (window.__retardo) await new Promise((r) => setTimeout(r, window.__retardo)); return original(...a); };
  });
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await prepararFichas(page, 3);
  await page.evaluate(() => { window.__retardo = 1200; });
  // Tres imágenes DISTINTAS con el MISMO nombre de archivo.
  await recibir(page, [1, 2, 3].map((n) => ({ name: 'foto.webp', mimeType: 'image/webp', buffer: fs.readFileSync(rutas[n - 1]) })));
  await abrirGaleria(page);
  await expect(miniatura(page, 1)).toHaveAccessibleName(/optimizando/);
  // Se eligen sin esperar: recibidas 3, 1 y 2 (las tres se llaman igual; las distingue «recibida n.º»).
  await elegir(page, 3, 1);
  expect(await numeros(page)).toEqual(['2', '', '1']);
  await elegir(page, 2);
  expect(await numeros(page)).toEqual(['2', '3', '1']);
  // Terminan de optimizarse (una a una): la elección y el orden no se mueven.
  for (let i = 0; i < 40; i++) {
    expect(await numeros(page)).toEqual(['2', '3', '1']);
    if (!(await galeria(page).locator('.importador-orden-foto[aria-label*="optimizando"]').count())) break;
    await page.waitForTimeout(250);
  }
  await expect(galeria(page).locator('.importador-orden-foto[aria-label*="optimizando"]')).toHaveCount(0);
  expect(await numeros(page)).toEqual(['2', '3', '1']);
  for (const k of [1, 2, 3]) await expect(miniatura(page, k).locator('img')).toBeVisible();
  // Con la lista: los repetidos se distinguen y el reparto sigue la elección (3, 1, 2).
  await galeria(page).getByRole('button', { name: /^Confirmar este orden \(3\)/ }).click();
  expect(await nombres(page)).toEqual(['foto.webp', 'foto.webp', 'foto.webp']);
  expect(await reparto(page).locator('.importador-reparto-recibida').allTextContents()).toEqual(['Recibida n.º 3', 'Recibida n.º 1', 'Recibida n.º 2']);
  await reparto(page).getByRole('button', { name: 'Asignar fotos', exact: true }).click();
  expect(await repartoFinal(page, 3)).toEqual(await esperado(page, 3, 1, 2));
  expect(problemas).toEqual([]);
});

// ======================================================================== 6. colores con fotos y avisos
test('se saltan los colores que ya tienen fotos (también las que se están optimizando) y se avisa de lo que sobra o falta', async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.createImageBitmap.bind(window);
    window.__retardo = 0;
    window.createImageBitmap = async (...a) => { if (window.__retardo) await new Promise((r) => setTimeout(r, window.__retardo)); return original(...a); };
  });
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await prepararFichas(page, 3);
  // La ficha 1 recibe una foto propia que aún se está optimizando.
  await page.evaluate(() => { window.__retardo = 4000; });
  await color(ficha(page, 0), 0).locator('input[type=file][data-archivos]').setInputFiles([rutas[5]]);
  await expect(color(ficha(page, 0), 0).locator('.editor-foto.es-procesando')).toHaveCount(1);
  await page.evaluate(() => { window.__retardo = 0; });
  await recibir(page, [1, 2, 3].map((n) => rutas[n - 1]));
  await esperarOptimizadas(page);
  await abrirGaleria(page);
  await elegir(page, 1, 2, 3);
  // Solo quedan dos colores sin foto: las dos primeras fotos van a las fichas 2 y 3; la tercera sobra.
  await expect(filasOrden(page).nth(0)).toContainText(/Ficha 2 ·/);
  await expect(filasOrden(page).nth(1)).toContainText(/Ficha 3 ·/);
  await expect(filasOrden(page).nth(2)).toContainText('Sin destino (no se asigna)');
  await expect(galeria(page).locator('.importador-reparto-aviso')).toContainText(`Sobran imágenes: «${foto(3)}» no tiene destino.`);
  // Si se elige una sola, falta un color.
  await galeria(page).getByRole('button', { name: 'Reiniciar orden' }).click();
  await elegir(page, 2);
  await expect(galeria(page).locator('.importador-reparto-aviso').filter({ hasText: 'Faltan imágenes' })).toContainText('Faltan imágenes: 1 color quedará sin foto.');
  await expect(galeria(page).locator('.importador-reparto-destinos li')).toHaveText([/^Ficha 3 ·/]);
  await galeria(page).getByRole('button', { name: /^Confirmar este orden \(1\)/ }).click();
  await reparto(page).getByRole('button', { name: 'Asignar fotos', exact: true }).click();
  // La foto 2 va a la ficha 2 (la 1 ya tenía la suya); la ficha 3 queda sin foto.
  expect(await pixel(fotoDe(page, 1))).toBe((await esperado(page, 2))[0]);
  await expect(color(ficha(page, 2), 0).locator('.editor-foto')).toHaveCount(0);
  await expect(color(ficha(page, 0), 0).locator('.editor-foto')).toHaveCount(1);
  expect(problemas).toEqual([]);
});

// ======================================================================== 7. celular, pantalla táctil
test('celular táctil: miniaturas grandes, sin desplazamiento horizontal y elección con toques', async ({ browser, browserName }) => {
  const contexto = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  const page = await contexto.newPage();
  try {
    const problemas = await entrarAlPanel(page, admin);
    await abrirImportador(page);
    await prepararFichas(page, 3);
    await recibir(page, [1, 2, 3, 4].map((n) => rutas[n - 1]));
    await esperarOptimizadas(page);
    await reparto(page).getByRole('button', { name: 'Elegir orden con las fotos' }).tap();
    await expect(galeria(page)).toBeVisible();
    // Dos columnas, miniaturas de buen tamaño y nada se sale de la pantalla.
    const marcos = await galeria(page).locator('.importador-orden-marco').evaluateAll((ns) => ns.map((n) => n.getBoundingClientRect().width));
    for (const ancho of marcos) expect(ancho).toBeGreaterThanOrEqual(120);
    const xs = await galeria(page).locator('.importador-orden-celda').evaluateAll((ns) => [...new Set(ns.map((n) => Math.round(n.getBoundingClientRect().left)))]);
    expect(xs).toHaveLength(2);
    const d = await revisarDisposicion(page);
    expect(d.desborde).toBe(0);
    expect(d.fuera).toBe(0);
    // Toques: 4, 2, 3.
    for (const n of [4, 2, 3]) await miniatura(page, n).tap();
    expect(await numeros(page)).toEqual(['', '2', '3', '1']);
    for (const b of await galeria(page).locator('.importador-orden-acciones .boton').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(40);
    await capturar(page, problemas, browserName, `orden-galeria-${browserName}-390.png`);
    await galeria(page).getByRole('button', { name: /^Confirmar este orden \(3\)/ }).tap();
    await expect(galeria(page)).toHaveCount(0);
    await reparto(page).getByRole('button', { name: 'Asignar fotos', exact: true }).tap();
    expect(await repartoFinal(page, 3)).toEqual(await esperado(page, 4, 2, 3));
    const d2 = await revisarDisposicion(page);
    expect(d2.desborde).toBe(0);
    expect(problemas).toEqual([]);
  } finally {
    await contexto.close();
  }
});

// ======================================================================== 8. «Usar el orden recibido» = el orden en que llegaron los archivos
// «Orden recibido» (el de llegada: it.recibida) no es el «orden actual de la lista» (el que dejaron elegir,
// Subir/Bajar u Ordenar por nombre). El botón vuelve al primero e incluye todas las imágenes que siguen en el reparto.
async function usarOrdenRecibido(page) {
  await abrirGaleria(page);
  await galeria(page).getByRole('button', { name: 'Usar el orden recibido' }).click();
  await expect(galeria(page)).toHaveCount(0);
}
const sinElegir = (page) => itemsLista(page).filter({ hasText: 'Sin elegir: no se asigna.' });

test('«Usar el orden recibido»: tras elegir 3 y 1 vuelve a 1, 2, 3 (todas incluidas) y el reparto final lo respeta', async ({ page }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await prepararFichas(page, 3);
  await recibir(page, [1, 2, 3].map((n) => rutas[n - 1]));
  await esperarOptimizadas(page);
  await abrirGaleria(page);
  await elegir(page, 3, 1);
  await galeria(page).getByRole('button', { name: /^Confirmar este orden \(2\)/ }).click();
  expect(await nombres(page)).toEqual([foto(3), foto(1), foto(2)]);
  await expect(sinElegir(page)).toHaveCount(1);
  // El orden actual de la lista es 3, 1, 2; el recibido, 1, 2, 3.
  await usarOrdenRecibido(page);
  expect(await nombres(page)).toEqual([foto(1), foto(2), foto(3)]);
  await expect(sinElegir(page)).toHaveCount(0);
  await expect(reparto(page).locator('#imp-reparto-estado')).toContainText('orden en que llegaron');
  await reparto(page).getByRole('button', { name: 'Asignar fotos', exact: true }).click();
  expect(await repartoFinal(page, 3)).toEqual(await esperado(page, 1, 2, 3));
  expect(problemas).toEqual([]);
});

test('«Usar el orden recibido» tras «Ordenar por nombre» y tras Subir/Bajar recupera el de llegada', async ({ page }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await prepararFichas(page, 3);
  // Llegan 3, 1, 2 (recibidas n.º 1, 2, 3): por nombre sería 1, 2, 3.
  await recibir(page, [3, 1, 2].map((n) => rutas[n - 1]));
  await esperarOptimizadas(page);
  await reparto(page).getByRole('button', { name: 'Ordenar por nombre de archivo' }).click();
  expect(await nombres(page)).toEqual([foto(1), foto(2), foto(3)]);
  await itemsLista(page).nth(0).getByRole('button', { name: /^Bajar/ }).click();
  expect(await nombres(page)).toEqual([foto(2), foto(1), foto(3)]);
  await usarOrdenRecibido(page);
  expect(await nombres(page)).toEqual([foto(3), foto(1), foto(2)]);
  await reparto(page).getByRole('button', { name: 'Asignar fotos', exact: true }).click();
  expect(await repartoFinal(page, 3)).toEqual(await esperado(page, 3, 1, 2));
  expect(problemas).toEqual([]);
});

test('«Usar el orden recibido» tras recargar el borrador; conserva destinos manuales y no reincorpora lo quitado ni lo asignado', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await prepararFichas(page, 3);
  await recibir(page, [1, 2, 3, 4, 5].map((n) => rutas[n - 1]));
  await esperarOptimizadas(page);
  // Destino manual para la 2: la ficha 3. Se quita la 5 del reparto.
  await itemsLista(page).nth(1).locator('summary').click();
  await itemsLista(page).nth(1).getByRole('radio', { name: /^Ficha 3 ·/ }).click();
  await itemsLista(page).nth(4).getByRole('button', { name: /^Quitar/ }).click();
  await expect(itemsLista(page)).toHaveCount(4);
  await abrirGaleria(page);
  await elegir(page, 3, 1);
  await galeria(page).getByRole('button', { name: /^Confirmar este orden \(2\)/ }).click();
  expect(await nombres(page)).toEqual([3, 1, 2, 4].map(foto));
  await esperarGuardadoLocal(page);
  await recargar(page, problemas, browserName);
  await abrirImportador(page);
  await importador(page).getByRole('button', { name: /^Continuar el borrador/ }).click();
  await expect(itemsLista(page)).toHaveCount(4, { timeout: 60000 });
  await esperarOptimizadas(page);
  expect(await nombres(page)).toEqual([3, 1, 2, 4].map(foto));
  await usarOrdenRecibido(page);
  // 1, 2, 3, 4: la 5 (quitada) no vuelve; la 2 sigue con su destino manual.
  expect(await nombres(page)).toEqual([1, 2, 3, 4].map(foto));
  await expect(sinElegir(page)).toHaveCount(0);
  await expect(itemsLista(page).nth(1)).toContainText('Elegido a mano');
  await expect(itemsLista(page).nth(1).locator('.importador-reparto-destino-texto strong')).toContainText('Ficha 3 ·');
  await reparto(page).getByRole('button', { name: 'Asignar fotos', exact: true }).click();
  // 1 → ficha 1; 2 → ficha 3 (manual); 3 → ficha 2; la 4 sobra y queda en la revisión.
  expect(await repartoFinal(page, 3)).toEqual(await esperado(page, 1, 3, 2));
  expect(await nombres(page)).toEqual([foto(4)]);
  // Lo ya asignado no vuelve al volver a usar el orden recibido.
  await usarOrdenRecibido(page);
  expect(await nombres(page)).toEqual([foto(4)]);
  expect(problemas).toEqual([]);
});

test('borradores anteriores (sin número de recepción ni «sin elegir»): se leen y «Usar el orden recibido» usa el orden en que están', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await prepararFichas(page, 3);
  await recibir(page, [3, 1, 2].map((n) => rutas[n - 1]));
  await esperarOptimizadas(page);
  await esperarGuardadoLocal(page);
  const borradores = importador(page).locator('#imp-borradores');
  await importador(page).getByRole('button', { name: /^Borradores/ }).click();
  const [descarga] = await Promise.all([page.waitForEvent('download'), borradores.getByRole('button', { name: /^Exportar un respaldo del borrador/ }).click()]);
  const archivo = path.join(SALIDA, `respaldo-anterior-${browserName}.json`);
  await descarga.saveAs(archivo);
  // Un respaldo de la versión anterior: sin «recibida», «recibidas», «fuera» ni «orden».
  const respaldo = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  const r = respaldo.borrador.datos.lote.reparto;
  for (const it of r.items) { delete it.recibida; delete it.fuera; }
  delete r.recibidas;
  delete r.orden;
  const anterior = path.join(SALIDA, `respaldo-anterior-sin-orden-${browserName}.json`);
  fs.writeFileSync(anterior, JSON.stringify(respaldo));
  await borradores.getByRole('button', { name: 'Empezar otro lote' }).click();
  await importador(page).getByRole('button', { name: /^Borradores/ }).click();
  await borradores.locator(`[data-borrador="${respaldo.borrador.id}"]`).getByRole('button', { name: /^Eliminar el borrador/ }).click();
  await borradores.getByRole('button', { name: 'Eliminar el borrador', exact: true }).click();
  await expect(borradores.locator(`[data-borrador="${respaldo.borrador.id}"]`)).toHaveCount(0);
  await borradores.locator('#imp-respaldo-archivo').setInputFiles(anterior);
  await expect(borradores.locator('#imp-borradores-aviso')).toContainText('Respaldo importado');
  await borradores.locator(`[data-borrador="${respaldo.borrador.id}"]`).getByRole('button', { name: /^Continuar/ }).click();
  await expect(itemsLista(page)).toHaveCount(3, { timeout: 60000 });
  expect(await nombres(page)).toEqual([3, 1, 2].map(foto));
  await abrirGaleria(page);
  // Reciben su número en el orden en que están.
  expect(await miniaturas(page).evaluateAll((ns) => ns.map((n) => n.getAttribute('aria-label')?.match(/recibida n\.º (\d+)/)?.[1]))).toEqual(['1', '2', '3']);
  await galeria(page).getByRole('button', { name: 'Usar el orden recibido' }).click();
  expect(await nombres(page)).toEqual([3, 1, 2].map(foto));
  await reparto(page).getByRole('button', { name: 'Asignar fotos', exact: true }).click();
  expect(await repartoFinal(page, 3)).toEqual(await esperado(page, 3, 1, 2));
  expect(problemas).toEqual([]);
});
