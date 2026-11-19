// @ts-check
/* Etapa 19 (ajustes) · Importador: «numeración dama/hombre», varios precios, versiones por público y orden
 * de la ventana.
 *
 * SOLO contra el stack local desechable de Supabase (con Storage) y el sitio servido en 127.0.0.1:8765.
 * Usuarios, productos y fotos FICTICIOS (marca NIKE, modelo «7 CAMARAS P19»; teléfonos ficticios); todo se
 * borra al terminar. La configuración real del panel nunca se usa (configurarPanel la sustituye).
 *
 *   npx playwright test tests/etapa19/versiones.spec.js --workers=1
 */
import { test, expect, chromium } from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PANEL, entorno, servicio, crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, configurarPanel, ingresar,
  revisarDisposicion, borrarCatalogo, objetosDe, borrarObjetos
} from '../etapa16/ayudas-catalogo.js';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180000);

const MARCA = 'NIKE';
const MODELO = '7 CAMARAS P19';
const CAPTURAS = path.join(os.tmpdir(), 'gama-talla-19-capturas');
const FOTOS19 = path.join(os.tmpdir(), 'gama-talla-19-fotos');
const MENSAJE = 'Pega aquí el mensaje de WhatsApp';
const DAMA = 'NIKE 7 CAMARAS P19⚠️NUMERACION DAMA💥$125.000\n📦📦DISPONIBLE $115.000\n\n🤝 Aparta la tuya pues 👉🏼 +57 3000000000';
const HOMBRE = 'NIKE 7 CAMARAS P19⚠️NUMERACION HOMBRE💥$125.000\n📦📦DISPONIBLE $115.000\n\n😍 Aprovecha y pídela → +57 3000000000';
const DAMA_NEGRO = 'NIKE 7 CAMARAS P19⚠️NUMERACIÓN DAMA💥$125.000\nNegro';
const T36_39 = '36; 37; 38; 39';
const T36_44 = '36; 37; 38; 39; 40; 41; 42; 43; 44';
let admin; let fotos;

const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

// Tres fotos WebP ficticias pequeñas (se suben sin recomprimir: se puede comprobar cuál quedó en cada color).
async function prepararFotos() {
  fs.mkdirSync(FOTOS19, { recursive: true });
  const rutas = { a: path.join(FOTOS19, 'v-a-blanca.webp'), b: path.join(FOTOS19, 'v-b-negra.webp'), c: path.join(FOTOS19, 'v-c-gris.webp') };
  if (Object.values(rutas).every((f) => fs.existsSync(f))) return rutas;
  const navegador = await chromium.launch();
  try {
    const pagina = await navegador.newPage();
    for (const [i, k] of ['a', 'b', 'c'].entries()) {
      const bytes = await pagina.evaluate(async ([luz, letra]) => {
        const lienzo = document.createElement('canvas');
        lienzo.width = 700; lienzo.height = 700;
        const x = lienzo.getContext('2d');
        x.fillStyle = `hsl(30 10% ${luz}%)`; x.fillRect(0, 0, 700, 700);
        x.fillStyle = luz > 50 ? '#000' : '#fff'; x.font = 'bold 260px sans-serif'; x.fillText(letra, 250, 450);
        const blob = await new Promise((r) => lienzo.toBlob(r, 'image/webp', 0.8));
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
      }, [[92, 12, 55][i], `V${k.toUpperCase()}`]);
      fs.writeFileSync(rutas[k], Buffer.from(bytes));
    }
  } finally {
    await navegador.close();
  }
  return rutas;
}

async function limpiar() {
  const productos = await servicio('GET', `/rest/v1/productos?select=id,variantes(id)&marca=eq.${MARCA}&nombre=eq.${encodeURIComponent(MODELO)}`);
  for (const p of productos) await borrarObjetos((await objetosDe(p.id)).map((o) => o.nombre));
  if (productos.length) await borrarCatalogo({ productos, variantes: productos.flatMap((p) => p.variantes) });
}

test.beforeAll(async ({}, info) => {
  entorno();
  await limpiar();
  admin = await crearUsuario(`panel19v-${info.project.name}-${Date.now().toString(36)}@gamaytalla.test`);
  await hacerAdmin(admin.id);
  fotos = await prepararFotos();
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
const reparto = (page) => importador(page).locator('#imp-reparto');
const radioPublico = (f, nombre) => f.getByRole('group', { name: /^Público en la tienda/ }).getByRole('radio', { name: nombre, exact: true });
const campoColor = (c) => c.getByRole('textbox', { name: /^Color \(obligatorio\)/ });
const precios = (c) => c.getByRole('group', { name: /^Precios del mensaje/ });

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
async function filas(page) {
  return reparto(page).locator('.importador-reparto-item').evaluateAll((ns) => ns.map((n) =>
    [n.querySelector('.importador-reparto-archivo').textContent, n.querySelector('.importador-reparto-destino-texto strong').textContent]));
}

// ======================================================================== orden de la ventana
test('orden: ajustes plegables primero, después fotos por lote y las fichas; el bloque conserva su estado y sus valores', async ({ page, browserName }) => {
  const problemas = await abrirPanel(page);
  const orden = await page.evaluate(() => [...document.querySelector('#importador-cuerpo').children].filter((n) => !n.hidden).map((n) => n.id || n.className));
  expect(orden.slice(0, 4)).toEqual(['imp-ajustes', 'imp-reparto', 'imp-fichas', 'importador-agregar']);
  const ajustes = importador(page).locator('#imp-ajustes');
  await expect(ajustes).not.toHaveAttribute('open', '');
  // El cuadro del mensaje de la primera ficha recibe el foco y se ve, también en celular.
  await expect(color(ficha(page, 0), 0).getByLabel(MENSAJE)).toBeFocused();

  // Abierto, con valores escritos: añadir publicaciones y repintar no lo cierra ni borra lo escrito.
  await ajustes.locator('summary').click();
  await ajustes.getByLabel('Categoría', { exact: true }).fill('Urbanas');
  await ajustes.getByLabel('Sumar al precio del proveedor (COP)').fill('30000');
  await color(ficha(page, 0), 0).getByLabel(MENSAJE).fill(DAMA);
  await importador(page).getByRole('button', { name: 'Añadir otra publicación' }).click();
  await color(ficha(page, 1), 0).getByLabel(MENSAJE).fill(HOMBRE);
  await expect(ficha(page, 1).getByRole('textbox', { name: /^Modelo/ })).toHaveValue(MODELO);
  await expect(ajustes).toHaveAttribute('open', '');
  await expect(ajustes.getByLabel('Categoría', { exact: true })).toHaveValue('URBANAS');
  await expect(ajustes.getByLabel('Sumar al precio del proveedor (COP)')).toHaveValue('30000');
  // Plegado: sigue plegado tras repintar.
  await ajustes.locator('summary').click();
  await importador(page).getByRole('button', { name: 'Añadir otra publicación' }).click();
  await expect(ajustes).not.toHaveAttribute('open', '');
  await ajustes.locator('summary').click();
  await expect(ajustes.getByLabel('Categoría', { exact: true })).toHaveValue('URBANAS');

  // Celular 390 × 844 y 360 × 560: una sola zona de desplazamiento; cabecera y pie a la vista.
  for (const [ancho, alto] of [[390, 844], [360, 560]]) {
    await page.setViewportSize({ width: ancho, height: alto });
    await importador(page).locator('.editor-cuerpo').evaluate((n) => { n.scrollTop = 0; });
    const m = await importador(page).evaluate((d) => {
      const cuerpo = d.querySelector('.editor-cuerpo');
      const cab = d.querySelector('.editor-cabecera').getBoundingClientRect();
      const pie = d.querySelector('.editor-pie').getBoundingClientRect();
      return { dialogo: d.scrollHeight - d.clientHeight, cuerpo: cuerpo.scrollHeight > cuerpo.clientHeight, cabecera: cab.top >= -1 && cab.bottom <= innerHeight, pie: pie.top >= 0 && pie.bottom <= innerHeight + 1 };
    });
    expect(m, `${ancho}×${alto}`).toEqual({ dialogo: 0, cuerpo: true, cabecera: true, pie: true });
    expect((await revisarDisposicion(page)).desborde, `${ancho}×${alto} sin desplazamiento horizontal`).toBe(0);
    await capturar(page, problemas, browserName, `ajustes-arriba-${browserName}-${ancho}x${alto}.png`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await capturar(page, problemas, browserName, `ajustes-arriba-${browserName}-1280.png`);
  expect(problemas).toEqual([]);
});

// ======================================================================== Nike Dama y Hombre
test('Nike 7 CAMARAS: Dama y Hombre independientes; precio elegido y conservado; agrupar del mismo público; reparto; ajustes; guardar', async ({ page, browserName }) => {
  const problemas = await abrirPanel(page);
  const f1 = ficha(page, 0);
  const c1 = color(f1, 0);
  await c1.getByLabel(MENSAJE).fill(DAMA);
  await expect(f1.getByRole('combobox', { name: /^Marca/ })).toHaveValue('NIKE');
  await expect(f1.getByRole('textbox', { name: /^Modelo/ })).toHaveValue(MODELO);
  await expect(radioPublico(f1, 'Dama')).toBeChecked();
  await expect(c1.getByLabel(/^Tallas EU/)).toHaveValue(T36_39);
  await expect(c1.locator('.importador-lectura')).toContainText('Tallas propuestas por «numeración dama» (Dama: 36 a 39).');
  await expect(c1.locator('.importador-lectura')).toContainText('El mensaje trae varios precios ($125.000 y $115.000): elige el precio del proveedor.');
  await expect(f1.locator('h3').first()).toHaveText(`Ficha 1 · NIKE ${MODELO} · Dama`);

  // Precio: pendiente hasta elegir; elegir conserva la elección al volver a leer el mensaje.
  await expect(c1.getByLabel(/^Precio del proveedor/)).toHaveValue('');
  await expect(precios(c1)).toHaveClass(/es-revisar/);
  await expect(precios(c1).getByRole('radio')).toHaveCount(2);
  await precios(c1).getByRole('radio', { name: /115\.000/ }).click();
  await expect(c1.getByLabel(/^Precio del proveedor/)).toHaveValue('115000');
  await expect(precios(c1)).not.toHaveClass(/es-revisar/);
  await expect(c1.locator('.importador-lectura')).not.toContainText('varios precios');
  await c1.getByLabel(MENSAJE).fill(`${DAMA}\n🔥`);
  await expect(c1.locator('.importador-lectura')).toContainText('numeración dama');
  await expect(c1.getByLabel(/^Precio del proveedor/)).toHaveValue('115000');
  await expect(precios(c1).getByRole('radio', { name: /115\.000/ })).toBeChecked();
  await campoColor(c1).fill('BLANCO');

  // Hombre: otra ficha, versión independiente (no se propone agrupar).
  await importador(page).getByRole('button', { name: 'Añadir otra publicación' }).click();
  const f2 = ficha(page, 1);
  const c2 = color(f2, 0);
  await c2.getByLabel(MENSAJE).fill(HOMBRE);
  await expect(radioPublico(f2, 'Hombre')).toBeChecked();
  await expect(c2.getByLabel(/^Tallas EU/)).toHaveValue(T36_44);
  await expect(f2.getByRole('textbox', { name: /^Modelo/ })).toHaveValue(MODELO);
  await expect(f2.locator('h3').first()).toHaveText(`Ficha 2 · NIKE ${MODELO} · Hombre`);
  const version2 = f2.locator('.importador-coincidencia.es-version');
  await expect(version2).toContainText(`Versión para Hombre de NIKE ${MODELO}: la ficha 1 es la versión para Dama. Se guardarán como zapatillas independientes`);
  await expect(f2.getByRole('button', { name: /Agrupar como color/ })).toHaveCount(0);
  await expect(f1.locator('.importador-coincidencia.es-version')).toContainText('la ficha 2 es la versión para Hombre');
  await campoColor(c2).fill('GRIS');
  // «Agrupar con otra ficha» solo ofrece fichas del mismo público.
  await f2.locator('.importador-mover summary').click();
  await expect(f2.locator('.importador-mover')).toContainText('No hay otra ficha para Hombre con la que agrupar');
  await expect(f2.getByRole('button', { name: /^Mover a la ficha/ })).toHaveCount(0);

  // Otro color sin público: se pide elegirlo antes de decidir. Con Dama, se propone agrupar con la ficha 1.
  await importador(page).getByRole('button', { name: 'Añadir otra publicación' }).click();
  const f3 = ficha(page, 2);
  await color(f3, 0).getByLabel(MENSAJE).fill('NIKE 7 CAMARAS P19 $125.000\nNegro\n36 al 39');
  await expect(f3.locator('.importador-coincidencia.es-pendiente')).toContainText('Elige el público de esta ficha para saber si es otro color de la misma zapatilla o una versión para otro público.');
  await expect(f3.getByRole('button', { name: /Agrupar como color/ })).toHaveCount(0);
  await color(f3, 0).getByLabel(MENSAJE).fill(DAMA_NEGRO);
  await expect(radioPublico(f3, 'Dama')).toBeChecked();
  await expect(f3.locator('.importador-coincidencia').first()).toContainText(`Mismo modelo que la ficha 1 (NIKE ${MODELO}), también para Dama. ¿Es otro color de la misma zapatilla?`);
  await expect(f3.locator('.importador-coincidencia.es-version')).toContainText('la ficha 2 es la versión para Hombre');
  await f3.getByRole('button', { name: 'Agrupar como color de la ficha 1' }).click();
  await expect(importador(page).locator('.importador-ficha')).toHaveCount(2);
  await expect(f1.locator('.importador-color')).toHaveCount(2);
  await expect(campoColor(color(f1, 1))).toHaveValue('NEGRO');
  await expect(color(f1, 1).getByLabel(/^Tallas EU/)).toHaveValue(T36_39);
  await expect(color(f1, 1).getByLabel(/^Precio del proveedor/)).toHaveValue('125000');
  await expect(radioPublico(ficha(page, 1), 'Hombre')).toBeChecked();

  // Reparto: ficha 1 (Dama: BLANCO, NEGRO) y ficha 2 (Hombre: GRIS), por identificadores estables.
  const [selector] = await Promise.all([page.waitForEvent('filechooser'), reparto(page).getByRole('button', { name: 'Asignar fotos por lote' }).click()]);
  await selector.setFiles([fotos.a, fotos.b, fotos.c]);
  await expect(reparto(page).locator('.importador-reparto-item').filter({ hasText: 'Optimizando…' })).toHaveCount(0, { timeout: 30000 });
  expect(await filas(page)).toEqual([
    ['v-a-blanca.webp', `Ficha 1 · NIKE ${MODELO} · Dama · Color 1 · BLANCO`],
    ['v-b-negra.webp', `Ficha 1 · NIKE ${MODELO} · Dama · Color 2 · NEGRO`],
    ['v-c-gris.webp', `Ficha 2 · NIKE ${MODELO} · Hombre · Color 1 · GRIS`]
  ]);
  // Separar el NEGRO en otra ficha durante la revisión: su destino lo sigue (ficha nueva, mismo color).
  await color(f1, 1).getByRole('button', { name: 'Separar en otra ficha' }).click();
  await expect(importador(page).locator('.importador-ficha')).toHaveCount(3);
  expect((await filas(page))[1]).toEqual(['v-b-negra.webp', `Ficha 2 · NIKE ${MODELO} · Dama · Color 1 · NEGRO`]);
  expect((await filas(page))[2]).toEqual(['v-c-gris.webp', `Ficha 3 · NIKE ${MODELO} · Hombre · Color 1 · GRIS`]);
  // Volver a agrupar el NEGRO con la ficha 1 (mismo público) desde «Agrupar con otra ficha».
  await ficha(page, 1).locator('.importador-mover summary').click();
  await ficha(page, 1).getByRole('button', { name: `Mover a la ficha 1 · NIKE ${MODELO} · Dama` }).click();
  await expect(importador(page).locator('.importador-ficha')).toHaveCount(2);
  expect((await filas(page))[1]).toEqual(['v-b-negra.webp', `Ficha 1 · NIKE ${MODELO} · Dama · Color 2 · NEGRO`]);
  await reparto(page).getByRole('button', { name: 'Asignar fotos', exact: true }).click();
  await expect(reparto(page).locator('.importador-reparto-item')).toHaveCount(0);
  const origen = (c) => c.locator('.importador-foto-origen');
  await expect(origen(color(f1, 0))).toHaveText('Asignada por lote · v-a-blanca.webp');
  await expect(origen(color(f1, 1))).toHaveText('Asignada por lote · v-b-negra.webp');
  await expect(origen(color(ficha(page, 1), 0))).toHaveText('Asignada por lote · v-c-gris.webp');

  // Ajustes en bloque (arriba): categoría y precio de venta = proveedor + 30.000. El GRIS aún no tiene
  // precio del proveedor (dos candidatos): queda por revisar hasta elegirlo; el de venta se calcula entonces.
  const ajustes = importador(page).locator('#imp-ajustes');
  await ajustes.locator('summary').click();
  await ajustes.getByLabel('Categoría', { exact: true }).fill('Urbanas');
  await ajustes.getByLabel('Sumar al precio del proveedor (COP)').fill('30000');
  await ajustes.getByRole('button', { name: /^Aplicar ajustes a [0-9]+ fichas?$/ }).click();
  await expect(ajustes.locator('#imp-ajustes-estado')).toContainText('2 fichas actualizadas');
  await expect(ajustes.locator('#imp-ajustes-estado')).toContainText('1 color no tiene precio del proveedor');
  await expect(color(f1, 0).getByLabel(/^Precio de venta/)).toHaveValue('145000');
  await expect(color(f1, 1).getByLabel(/^Precio de venta/)).toHaveValue('155000');
  const c2b = color(ficha(page, 1), 0);
  await expect(c2b.getByLabel(/^Precio de venta/)).toHaveValue('');
  await precios(c2b).getByRole('radio', { name: /125\.000/ }).click();
  await expect(c2b.getByLabel(/^Precio del proveedor/)).toHaveValue('125000');
  await expect(c2b.getByLabel(/^Precio de venta/)).toHaveValue('155000');
  // Un precio de venta escrito a mano no cambia al elegir otro precio del proveedor.
  await c2b.getByLabel(/^Precio de venta/).fill('160000');
  await precios(c2b).getByRole('radio', { name: /115\.000/ }).click();
  await expect(c2b.getByLabel(/^Precio del proveedor/)).toHaveValue('115000');
  await expect(c2b.getByLabel(/^Precio de venta/)).toHaveValue('160000');

  await page.setViewportSize({ width: 390, height: 844 });
  await f1.locator('.importador-coincidencia.es-version').scrollIntoViewIfNeeded();
  await capturar(page, problemas, browserName, `versiones-${browserName}-390.png`);
  expect((await revisarDisposicion(page)).desborde).toBe(0);
  await page.setViewportSize({ width: 1280, height: 900 });
  await precios(c1).scrollIntoViewIfNeeded();
  await capturar(page, problemas, browserName, `precios-${browserName}-1280.png`);

  // Guardar: dos zapatillas independientes, Dama (2 colores) y Hombre (1), tallas por revisar y fotos en su color.
  await importador(page).getByRole('button', { name: /Guardar lote como oculto/ }).click();
  await expect(f1.locator('.importador-estado')).toContainText(/Guardada oculta · GT-/, { timeout: 60000 });
  await expect(ficha(page, 1).locator('.importador-estado')).toContainText(/Guardada oculta · GT-/, { timeout: 60000 });
  const productos = await servicio('GET', `/rest/v1/productos?select=id,nombre,publico,categoria,variantes(id,color,precio,orden,fotos(ruta,orden))&marca=eq.${MARCA}&nombre=eq.${encodeURIComponent(MODELO)}&order=publico`);
  expect(productos.map((p) => [p.nombre, p.publico, p.categoria, p.variantes.length])).toEqual([[MODELO, 'dama', 'URBANAS', 2], [MODELO, 'hombre', 'URBANAS', 1]]);
  const variantes = productos.flatMap((p) => p.variantes);
  expect(Object.fromEntries(variantes.map((v) => [v.color, v.precio]))).toEqual({ BLANCO: 145000, NEGRO: 155000, GRIS: 160000 });
  const tallas = await servicio('GET', `/rest/v1/tallas?select=variante_id,talla,estado&variante_id=in.(${variantes.map((v) => v.id).join(',')})`);
  expect(new Set(tallas.map((t) => t.estado))).toEqual(new Set(['REVISAR']));
  const tallasDe = (colorNombre) => tallas.filter((t) => t.variante_id === variantes.find((v) => v.color === colorNombre).id).map((t) => t.talla).sort();
  expect(tallasDe('BLANCO')).toEqual(T36_39.split('; '));
  expect(tallasDe('GRIS')).toEqual(T36_44.split('; ').sort());
  const descargar = async (ruta) => sha(Buffer.from(await (await fetch(ruta)).arrayBuffer()));
  const fotoDe = (colorNombre) => variantes.find((v) => v.color === colorNombre).fotos[0].ruta;
  expect(await descargar(fotoDe('BLANCO'))).toBe(sha(fs.readFileSync(fotos.a)));
  expect(await descargar(fotoDe('NEGRO'))).toBe(sha(fs.readFileSync(fotos.b)));
  expect(await descargar(fotoDe('GRIS'))).toBe(sha(fs.readFileSync(fotos.c)));

  // Recargar: con las dos versiones ya en el catálogo, una ficha nueva para Dama pide decidir; para Hombre
  // también; y la coincidencia muestra el público de cada una.
  const antesDeRecargar = problemas.length;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
  // WebKit informa como excepción la petición que la recarga corta (como en la etapa 18): solo ESE aviso y solo durante la recarga.
  if (browserName === 'webkit') for (let i = problemas.length - 1; i >= antesDeRecargar; i -= 1) if (/^EXCEPCIÓN: .*127\.0\.0\.1:54321\/.* due to access control checks\.$/.test(problemas[i])) problemas.splice(i, 1);
  await expect(page.locator('#tablero')).not.toHaveAttribute('aria-busy', 'true');
  await page.getByRole('button', { name: 'Importar desde WhatsApp' }).click();
  const nueva = ficha(page, 0);
  await color(nueva, 0).getByLabel(MENSAJE).fill(DAMA);
  const catalogo = nueva.locator('.importador-coincidencia.es-catalogo');
  await expect(catalogo).toContainText('Este modelo ya está en el catálogo para Dama:');
  await expect(catalogo).not.toContainText('sin público');
  await expect(catalogo).toContainText(`${MODELO} · Dama · oculta`);
  await expect(catalogo).toContainText(`${MODELO} · Hombre · oculta`);
  expect(problemas).toEqual([]);
});

test('catálogo con solo la versión para otro público: se informa y se puede guardar sin decidir', async ({ page }) => {
  const [p] = await servicio('POST', '/rest/v1/productos?select=id', [{ nombre: MODELO, marca: MARCA, categoria: 'URBANAS', publico: 'hombre', activo: false }], 'return=representation');
  await servicio('POST', '/rest/v1/variantes', [{ producto_id: p.id, color: 'GRIS', precio: 150000, orden: 0 }]);
  const problemas = await abrirPanel(page);
  const f = ficha(page, 0);
  const c = color(f, 0);
  await c.getByLabel(MENSAJE).fill(DAMA);
  const aviso = f.locator('.importador-coincidencia.es-version');
  await expect(aviso).toContainText('En el catálogo está este modelo para otro público (esta ficha es la versión para Dama):');
  await expect(aviso).toContainText(`${MODELO} · Hombre · oculta`);
  await expect(aviso).toContainText('Se creará una zapatilla independiente para Dama.');
  await expect(f.getByLabel('Crear otra ficha con este mismo modelo de todas formas')).toHaveCount(0);
  await campoColor(c).fill('BLANCO');
  await precios(c).getByRole('radio', { name: /125\.000/ }).click();
  await f.getByRole('combobox', { name: /^Categoría/ }).fill('URBANAS');
  await c.getByLabel(/^Precio de venta/).fill('160000');
  await importador(page).getByRole('button', { name: /Guardar lote como oculto/ }).click();
  await expect(f.locator('.importador-estado')).toContainText(/Guardada oculta · GT-/, { timeout: 30000 });
  const productos = await servicio('GET', `/rest/v1/productos?select=publico&marca=eq.${MARCA}&nombre=eq.${encodeURIComponent(MODELO)}&order=publico`);
  expect(productos.map((x) => x.publico)).toEqual(['dama', 'hombre']);
  expect(problemas).toEqual([]);
});
