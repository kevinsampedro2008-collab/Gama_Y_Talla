// @ts-check
/* Etapa 20 · «(N colores)» en el mensaje del proveedor: una ficha con N variantes de color preparadas.
 *
 * Lector sin servidor; importador SOLO contra el Supabase LOCAL y el entorno aislado
 * (SITIO=http://127.0.0.1:8770). Datos FICTICIOS (modelos « P20», teléfono 3000000000); todo se borra.
 *
 *   SITIO=http://127.0.0.1:8770 npx playwright test tests/etapa20/colores.spec.js --workers=1
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  entorno, crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, revisarDisposicion, limpiar20, productos20, prepararFotos20,
  entrarAlPanel, abrirImportador, importador, ficha, fichas, color, recargar, esperarGuardadoLocal, pegarVarias, capturar,
  elegirCategoria, MENSAJE
} from './ayudas20.js';

const LECTOR = path.resolve(__dirname, '..', '..', 'admin', 'texto-proveedor.js');
const HUGO = '🚨 PROMOCIÓN 🚨\n👆🏼HUGO BOSS👆🏼\nNumeración Hombre🔥🧉\n(40 A 44 EUR)\n(2 colores)\n💲125.000\n\nPedidos✅ 3000000000\nhttps://wa.link/abc123';
const SALIDA = path.join(os.tmpdir(), 'gama-talla-20-respaldos');

// ======================================================================== lector (sin servidor)
test.describe('lector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('about:blank');
    await page.addScriptTag({ path: LECTOR });
  });
  /** @param {import('@playwright/test').Page} page @param {string[]} textos */
  // maxColores: el límite real del catálogo (en el panel lo da editor.js; aquí, sin panel, se pasa el mismo 20).
  const leer = (page, textos, maxColores = null) => page.evaluate(([lista, limite]) => lista.map((t) => {
    const r = window.GamaTallaTextoProveedor.analizar(t, { maxColores: limite });
    return { marca: r.marca, modelo: r.modelo, publico: r.publico, precio: r.precio, tallas: r.tallas, n: r.cantidadColores, texto: r.cantidadTexto, revisar: r.revisar, notas: r.notas, omitido: r.omitido };
  }), [textos, maxColores]);

  test('«(N colores)» y «N colores» suelto: 1, 2 y 3; mayúsculas y espacios; sin cantidad, null', async ({ page }) => {
    const r = await leer(page, [
      'Puma Suede (1 color) $90.000 38 al 40', 'Nike Air Max 90 (2 colores) $300.000 40 al 42', 'Adidas Samba (3 COLORES) $180.000 40 al 42',
      'Adidas Samba ( 2   Colores ) $180.000 40 al 42', 'Adidas Samba\n3 colores\n$180.000\n40 al 42', 'Adidas Samba\n2 Colores.\n$180.000\n40 al 42',
      'Adidas Samba $180.000 40 al 42', 'Reebok Club C 85 (2 colores) 40-42-44 $80.000']);
    expect(r.map((x) => x.n)).toEqual([1, 2, 3, 2, 3, 2, null, 2]);
    // No contamina modelo, tallas ni precio (ni con números de modelo como 90 u 85).
    expect(r[1]).toMatchObject({ marca: 'Nike', modelo: 'Air Max 90', precio: 300000, tallas: ['40', '41', '42'] });
    expect(r[2]).toMatchObject({ modelo: 'Samba', precio: 180000, tallas: ['40', '41', '42'] });
    expect(r[4]).toMatchObject({ modelo: 'Samba', precio: 180000, tallas: ['40', '41', '42'] });
    expect(r[7]).toMatchObject({ modelo: 'Club C 85', precio: 80000, tallas: ['40', '42', '44'] });
    for (const x of r) { expect(x.modelo).not.toMatch(/color/i); expect(x.revisar).not.toContain('colores'); }
  });

  test('cantidades no válidas o contradictorias: sin cantidad y «Revisar»', async ({ page }) => {
    const [cero, dos, grande] = await leer(page, ['Adidas Samba (0 colores) $180.000 40 al 42', 'Adidas Samba (2 colores)\n(3 colores)\n$180.000 40 al 42', 'Adidas Samba (25 colores) $180.000 40 al 42']);
    expect(cero).toMatchObject({ n: null, modelo: 'Samba', precio: 180000 });
    expect(cero.revisar).toContain('colores');
    expect(cero.notas).toContain('«0 colores» no es una cantidad válida: revisa cuántos colores tendrá.');
    expect(dos).toMatchObject({ n: null, modelo: 'Samba' });
    expect(dos.notas).toContain('El mensaje indica cantidades de colores distintas (2 y 3): revisa cuántos colores tendrá.');
    // 25 supera el límite del catálogo (20): queda «Revisar» con su valor tal cual (nunca se recorta).
    const [conLimite] = await leer(page, ['Adidas Samba (25 colores) $180.000 40 al 42'], 20);
    expect(conLimite).toMatchObject({ n: null, texto: '25', modelo: 'Samba', precio: 180000 });
    expect(conLimite.revisar).toContain('colores');
    expect(conLimite.notas).toContain('«25 colores» supera el máximo de 20 colores por zapatilla: revisa cuántos colores tendrá.');
    // Sin límite conocido (lector suelto, sin el panel), 25 es un entero válido.
    expect(grande).toMatchObject({ n: 25, texto: '25' });
  });

  test('cantidades negativas, decimales (punto o coma) y por encima del límite: se reconocen, salen del texto y quedan «Revisar»', async ({ page }) => {
    const casos = [['Nike Air Force 1 (-2 colores) Hombre $125.000 40 al 44', '-2', '(es negativa)'], ['Nike Air Force 1 (2.5 colores) Hombre $125.000 40 al 44', '2.5', '(debe ser un número entero)'],
      ['Nike Air Force 1 (2,5 colores) Hombre $125.000 40 al 44', '2,5', '(debe ser un número entero)'], ['Nike Air Force 1 (1000 colores) Hombre $125.000 40 al 44', '1000', 'supera el máximo de 20'],
      ['Nike Air Force 1 ( - 3  COLORES ) Hombre $125.000 40 al 44', '-3', '(es negativa)'], ['Nike Air Force 1 (0 colores) Hombre $125.000 40 al 44', '0', 'no es una cantidad válida']];
    const r = await leer(page, casos.map(([t]) => t), 20);
    r.forEach((x, i) => {
      const [t, valor, motivo] = casos[i];
      expect(x, t).toMatchObject({ marca: 'Nike', modelo: 'Air Force 1', publico: 'hombre', precio: 125000, tallas: ['40', '41', '42', '43', '44'], n: null, texto: valor });
      expect(x.revisar, t).toContain('colores');
      expect(x.notas.join(' '), t).toContain(`«${valor} colores»`);
      expect(x.notas.join(' '), t).toContain(motivo);
    });
    // En su propia línea, y con números de modelo que no deben tocarse.
    const [linea, maxValida, clubC] = await leer(page, ['Reebok Club C 85\n-3 colores\n40-42-44 $80.000', 'Nike Air Max 90 (20 colores) Hombre $300.000 40 al 42', 'Reebok Club C 85 (2.5 colores) 40-42-44 $80.000'], 20);
    expect(linea).toMatchObject({ marca: 'Reebok', modelo: 'Club C 85', precio: 80000, tallas: ['40', '42', '44'], n: null, texto: '-3' });
    expect(linea.revisar).toContain('colores');
    expect(maxValida).toMatchObject({ modelo: 'Air Max 90', precio: 300000, tallas: ['40', '41', '42'], n: 20 });
    expect(maxValida.revisar).not.toContain('colores');
    expect(clubC).toMatchObject({ modelo: 'Club C 85', precio: 80000, tallas: ['40', '42', '44'], n: null, texto: '2.5' });
  });

  test('mensaje Hugo Boss: marca, público, tallas, precio y 2 colores; sin modelo inventado; teléfono y enlace omitidos', async ({ page }) => {
    const [r] = await leer(page, [HUGO]);
    expect(r).toMatchObject({ marca: 'Hugo Boss', modelo: '', publico: 'hombre', precio: 125000, tallas: ['40', '41', '42', '43', '44'], n: 2 });
    expect(r.revisar).toEqual(expect.arrayContaining(['modelo', 'color']));
    expect(r.omitido).toMatchObject({ telefonos: 1, contacto: 1 });
  });
});

// ======================================================================== importador
test.describe('importador', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180000);
  let admin; let fotosPrueba;
  test.beforeAll(async ({}, info) => {
    entorno();
    await limpiar20();
    admin = await crearUsuario(`panel20-colores-${info.project.name}-${Date.now().toString(36)}@gamaytalla.test`);
    await hacerAdmin(admin.id);
    fotosPrueba = await prepararFotos20(6);
    fs.mkdirSync(SALIDA, { recursive: true });
  });
  test.afterAll(async () => {
    await limpiar20().catch(() => null);
    if (admin) { await quitarAdmin(admin.id).catch(() => null); await borrarUsuario(admin.id); }
  });
  test.afterEach(async () => { await limpiar20(); });

  const colores = (f) => f.locator('.importador-color');
  const nombre = (c) => c.getByRole('textbox', { name: /^Color \(obligatorio\)/ });
  const tallas = (c) => c.getByLabel(/^Tallas EU/);
  const proveedor = (c) => c.getByLabel(/^Precio del proveedor/);
  const cantidad = (f) => f.getByRole('textbox', { name: /^Cantidad de colores/ });
  const archivoDe = (c) => c.locator('input[type=file][data-archivos]');
  const fragmentos = (s) => s.locator('.importador-fragmento');
  const clavesDe = (f) => colores(f).evaluateAll((ns) => ns.map((n) => /** @type {HTMLElement} */ (n).dataset.color));

  test('pegado masivo: 1, 2 y 3 colores, sin cantidad y no válida; corregir antes de crear; doble clic sin duplicar', async ({ page, browserName }) => {
    const problemas = await entrarAlPanel(page, admin);
    await abrirImportador(page);
    const s = await pegarVarias(page, [
      'Puma Suede P20 Hombre (1 color) $90.000 38 al 40',
      'Nike Cortez P20 Dama (2 colores) $200.000 36 al 39',
      'Adidas Gazelle P20 Hombre\n(3 COLORES)\n$150.000\n40 al 42',
      'Reebok Classic P20 Hombre $120.000 40 al 42',
      'Fila Ray P20 Hombre (25 colores) $130.000 40 al 42'].join('\n\n'));
    await expect(fragmentos(s)).toHaveCount(5);
    const campos = fragmentos(s).getByRole('textbox', { name: /^Colores a preparar/ });
    await expect(campos).toHaveCount(5);
    for (const [i, v] of ['1', '2', '3', '1', '25'].entries()) await expect(campos.nth(i)).toHaveValue(v);
    await expect(fragmentos(s).nth(4).locator('.campo-error')).toContainText('Escribe un número entre 1 y 20; si no, se creará con 1 color.');
    await expect(s.locator('#imp-pegado-resumen')).toHaveText('5 publicaciones detectadas · se crearán 5 fichas con 8 colores · 1 cantidad de colores por revisar.');
    // Corregir: la 4.ª (sin cantidad) tendrá 2.
    await campos.nth(3).fill('2');
    await expect(s.locator('#imp-pegado-resumen')).toHaveText('5 publicaciones detectadas · se crearán 5 fichas con 9 colores · 1 cantidad de colores por revisar.');
    await expect(campos.nth(3)).toBeFocused();
    await capturar(page, problemas, browserName, `colores-revision-${browserName}-1280.png`);
    await s.getByRole('button', { name: 'Crear 5 publicaciones' }).dblclick();
    await expect(fichas(page)).toHaveCount(5);
    await expect(importador(page).locator('#importador-resultado')).toContainText('Se crearon 5 publicaciones (fichas 1 a 5), con 9 colores en total.');
    expect(await Promise.all([0, 1, 2, 3, 4].map((i) => colores(ficha(page, i)).count()))).toEqual([1, 2, 3, 2, 1]);
    // Encabezados de interfaz «Color N»; los nombres preparados quedan vacíos y «Revisar».
    const nike = ficha(page, 1);
    await expect(colores(nike).nth(0).locator('h4')).toHaveText('Color 1');
    await expect(colores(nike).nth(1).locator('h4')).toHaveText('Color 2');
    await expect(nombre(colores(nike).nth(1))).toHaveValue('');
    await expect(nombre(colores(nike).nth(1)).locator('xpath=ancestor::div[contains(@class,"campo")][1]')).toHaveClass(/es-revisar/);
    // Proponen las tallas y el precio del proveedor de la publicación; sin mensaje ni fotos propios.
    await expect(tallas(colores(nike).nth(1))).toHaveValue('36; 37; 38; 39');
    await expect(proveedor(colores(nike).nth(1))).toHaveValue('200000');
    await expect(colores(nike).nth(1).getByLabel(MENSAJE)).toHaveValue('');
    await expect(colores(nike).nth(1).locator('.editor-foto')).toHaveCount(0);
    await expect(colores(nike).nth(1).locator('.importador-preparado')).toContainText('Color preparado desde la publicación de esta ficha');
    // Cantidad no válida (25): una ficha con 1 color, la cantidad queda para revisar.
    const fila = ficha(page, 4);
    await expect(cantidad(fila)).toHaveValue('25');
    await expect(fila.locator('.importador-cantidad-estado')).toContainText('Escribe un número entero entre 1 y 20');
    // La cantidad no contamina el modelo.
    await expect(ficha(page, 2).getByRole('textbox', { name: /^Modelo/ })).toHaveValue('GAZELLE P20');
    await capturar(page, problemas, browserName, `colores-ficha-${browserName}-1280.png`);
    expect(problemas).toEqual([]);
  });

  test('entrada individual: «Cantidad de colores», añadir los que faltan, releer y doble clic sin duplicar; reducir no borra nada', async ({ page, browserName }) => {
    const problemas = await entrarAlPanel(page, admin);
    await abrirImportador(page);
    const f = ficha(page, 0);
    const c1 = colores(f).nth(0);
    await c1.getByLabel(MENSAJE).fill('Nike Blazer P20 Hombre (2 colores) $220.000 40 al 42');
    await expect(cantidad(f)).toHaveValue('2');
    await expect(f.locator('.importador-cantidad-estado')).toContainText('La ficha tiene 1 color; se piden 2. Faltan 1.');
    await f.getByRole('button', { name: 'Añadir 1 color' }).dblclick();
    await expect(colores(f)).toHaveCount(2);
    await expect(f.locator('.importador-cantidad-estado')).toContainText('La ficha tiene los 2 colores que se piden.');
    const c2 = colores(f).nth(1);
    await expect(proveedor(c2)).toHaveValue('220000');
    // Correcciones del color 2 y una foto: se conservan al releer y al cambiar la cantidad.
    await nombre(c2).fill('ROJO');
    await tallas(c2).fill('41; 42');
    await archivoDe(c2).setInputFiles([fotosPrueba[0]]);
    await expect(c2.locator('.editor-foto.es-lista')).toHaveCount(1, { timeout: 30000 });
    const claves = await clavesDe(f);
    // Releer el mensaje (precio nuevo): no añade colores; el precio propuesto sigue al mensaje, las tallas corregidas no.
    await c1.getByLabel(MENSAJE).fill('Nike Blazer P20 Hombre (2 colores) $230.000 40 al 42');
    await expect(proveedor(c1)).toHaveValue('230000');
    await expect(colores(f)).toHaveCount(2);
    await expect(proveedor(c2)).toHaveValue('230000');
    await expect(tallas(c2)).toHaveValue('41; 42');
    // Pedir 3: se añade solo el que falta; los anteriores conservan identificador, nombre y foto.
    await cantidad(f).fill('3');
    await expect(f.getByRole('button', { name: 'Añadir 1 color' })).toBeVisible();
    await f.getByRole('button', { name: 'Añadir 1 color' }).click();
    await expect(colores(f)).toHaveCount(3);
    expect((await clavesDe(f)).slice(0, 2)).toEqual(claves);
    await expect(nombre(colores(f).nth(1))).toHaveValue('ROJO');
    await expect(colores(f).nth(1).locator('.editor-foto.es-lista')).toHaveCount(1);
    // Volver a leer con «(2 colores)» y pedir 1: no se quita ningún color ni foto.
    await cantidad(f).fill('1');
    await expect(f.locator('.importador-cantidad-estado')).toContainText('La ficha tiene 3 colores; se piden 1. No se quita ninguno solo');
    await expect(colores(f)).toHaveCount(3);
    await expect(colores(f).nth(1).locator('.editor-foto.es-lista')).toHaveCount(1);
    // La cantidad escrita a mano manda sobre la del mensaje al releer.
    await c1.getByLabel(MENSAJE).fill('Nike Blazer P20 Hombre (2 colores) $240.000 40 al 42');
    await expect(proveedor(c1)).toHaveValue('240000');
    await expect(cantidad(f)).toHaveValue('1');
    // Cantidad no válida escrita a mano.
    await cantidad(f).fill('0');
    await expect(f.locator('.importador-cantidad-estado .campo-error')).toHaveText('Escribe un número entero entre 1 y 20 (el máximo de colores por zapatilla).');
    await page.setViewportSize({ width: 390, height: 844 });
    await f.locator('.importador-cantidad').scrollIntoViewIfNeeded();
    await capturar(page, problemas, browserName, `colores-cantidad-${browserName}-390.png`);
    const d = await revisarDisposicion(page);
    expect(d.desborde).toBe(0);
    expect(problemas).toEqual([]);
  });

  test('reparto de fotos por lote entre los colores preparados (en orden, saltando los que ya tienen foto); borrador y respaldo con todos', async ({ page, browserName }) => {
    const problemas = await entrarAlPanel(page, admin);
    await abrirImportador(page);
    const s = await pegarVarias(page, 'Asics Novablast P20 Dama (3 colores) $260.000 36 al 39');
    await s.getByRole('button', { name: 'Crear 1 publicación' }).click();
    const f = ficha(page, 0);
    await expect(colores(f)).toHaveCount(3);
    await archivoDe(colores(f).nth(0)).setInputFiles([fotosPrueba[1]]);
    await expect(colores(f).nth(0).locator('.editor-foto.es-lista')).toHaveCount(1, { timeout: 30000 });
    const [selector] = await Promise.all([page.waitForEvent('filechooser'), importador(page).getByRole('button', { name: 'Asignar fotos por lote' }).click()]);
    await selector.setFiles([fotosPrueba[2], fotosPrueba[3]]);
    const items = importador(page).locator('.importador-reparto-item');
    await expect(items.filter({ hasText: 'Optimizando…' })).toHaveCount(0, { timeout: 30000 });
    await expect(items.nth(0).locator('.importador-reparto-destino-texto')).toContainText('Ficha 1 · ASICS NOVABLAST P20 · Dama · Color 2');
    await expect(items.nth(1).locator('.importador-reparto-destino-texto')).toContainText('Ficha 1 · ASICS NOVABLAST P20 · Dama · Color 3');
    await importador(page).getByRole('button', { name: 'Asignar fotos' }).click();
    for (const i of [0, 1, 2]) await expect(colores(f).nth(i).locator('.editor-foto.es-lista')).toHaveCount(1);
    for (const [i, n] of ['AZUL', 'NEGRO', 'BLANCO'].entries()) await nombre(colores(f).nth(i)).fill(n);
    const claves = await clavesDe(f);
    await esperarGuardadoLocal(page);
    // Recargar: las tres variantes vuelven con su identificador, nombre, foto y cantidad.
    await recargar(page, problemas, browserName);
    await abrirImportador(page);
    await importador(page).locator('#imp-borradores').getByRole('button', { name: /^Continuar el borrador/ }).click();
    const r = ficha(page, 0);
    await expect.poll(() => clavesDe(r)).toEqual(claves);
    await expect(cantidad(r)).toHaveValue('3');
    for (const [i, n] of ['AZUL', 'NEGRO', 'BLANCO'].entries()) {
      await expect(nombre(colores(r).nth(i))).toHaveValue(n);
      await expect(colores(r).nth(i).locator('.editor-foto.es-lista')).toHaveCount(1);
    }
    // Respaldo: las tres variantes y sus fotos.
    await importador(page).getByRole('button', { name: /^Borradores/ }).click();
    const [descarga] = await Promise.all([page.waitForEvent('download'), importador(page).locator('#imp-borradores').getByRole('button', { name: /^Exportar un respaldo/ }).click()]);
    const archivo = path.join(SALIDA, `colores-${browserName}.json`);
    await descarga.saveAs(archivo);
    const respaldo = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    const fichaRespaldo = respaldo.borrador.datos.lote.fichas[0];
    expect(fichaRespaldo.coloresPedidos).toBe('3');
    expect(fichaRespaldo.colores.map((c) => [c.color, c.preparado, c.fotos.length])).toEqual([['AZUL', false, 1], ['NEGRO', true, 1], ['BLANCO', true, 1]]);
    expect(respaldo.fotos).toHaveLength(3);
    expect(problemas).toEqual([]);
  });

  test('cantidades no válidas: se ven tal cual, quedan «Revisar» y no se preparan colores (pegado y ficha)', async ({ page, browserName }) => {
    const problemas = await entrarAlPanel(page, admin);
    await abrirImportador(page);
    const s = await pegarVarias(page, ['Nike Air Force 1 P20 (-2 colores) Hombre $125.000 40 al 44', 'Nike Air Force 1 P20 (1000 colores) Dama $125.000 36 al 39'].join('\n\n'));
    const campos = fragmentos(s).getByRole('textbox', { name: /^Colores a preparar/ });
    await expect(campos.nth(0)).toHaveValue('-2');
    await expect(campos.nth(1)).toHaveValue('1000');
    await expect(fragmentos(s).nth(0).locator('.campo-error')).toContainText('«-2 colores» no es una cantidad válida (es negativa)');
    await expect(fragmentos(s).nth(1).locator('.campo-error')).toContainText('«1000 colores» supera el máximo de 20 colores por zapatilla');
    await expect(fragmentos(s).nth(0).locator('.importador-fragmento-datos')).toContainText('NIKE · AIR FORCE 1 P20 · $ 125.000 · tallas 40 a 44 · Hombre');
    await expect(s.locator('#imp-pegado-resumen')).toHaveText('2 publicaciones detectadas · se crearán 2 fichas con 2 colores · 2 cantidades de colores por revisar.');
    await capturar(page, problemas, browserName, `colores-no-validas-${browserName}-1280.png`);
    await s.getByRole('button', { name: 'Crear 2 publicaciones' }).click();
    for (const [i, valor] of ['-2', '1000'].entries()) {
      const f = ficha(page, i);
      await expect(colores(f)).toHaveCount(1);
      await expect(f.getByRole('textbox', { name: /^Modelo/ })).toHaveValue('AIR FORCE 1 P20');
      await expect(cantidad(f)).toHaveValue(valor);
      await expect(cantidad(f).locator('xpath=ancestor::div[contains(@class,"campo")][1]')).toHaveClass(/es-revisar/);
      await expect(f.locator('.importador-cantidad-estado .campo-error')).toHaveText('Escribe un número entero entre 1 y 20 (el máximo de colores por zapatilla).');
      await expect(f.getByRole('button', { name: /^Añadir \d+ colou?r/ })).toHaveCount(0);
    }
    // Ficha individual: «(2.5 colores)» no se redondea a 2 ni a 3.
    await importador(page).getByRole('button', { name: 'Añadir otra publicación' }).click();
    const f3 = ficha(page, 2);
    await colores(f3).nth(0).getByLabel(MENSAJE).fill('Nike Air Force 1 P20 (2.5 colores) Hombre $125.000 40 al 44');
    await expect(f3.getByRole('textbox', { name: /^Modelo/ })).toHaveValue('AIR FORCE 1 P20');
    await expect(proveedor(colores(f3).nth(0))).toHaveValue('125000');
    await expect(tallas(colores(f3).nth(0))).toHaveValue('40; 41; 42; 43; 44');
    await expect(cantidad(f3)).toHaveValue('2.5');
    await expect(colores(f3).nth(0).locator('.importador-lectura')).toContainText('«2.5 colores» no es una cantidad válida (debe ser un número entero)');
    await expect(f3.getByRole('button', { name: /^Añadir \d+ colou?r/ })).toHaveCount(0);
    await expect(colores(f3)).toHaveCount(1);
    // Al corregirla a mano a 2, se puede preparar el que falta.
    await cantidad(f3).fill('2');
    await f3.getByRole('button', { name: 'Añadir 1 color' }).click();
    await expect(colores(f3)).toHaveCount(2);
    expect(problemas).toEqual([]);
  });

  test('guardar: cada variante con su nombre real (no «Color N»); sin nombre no se guarda', async ({ page }) => {
    const problemas = await entrarAlPanel(page, admin);
    await abrirImportador(page);
    const s = await pegarVarias(page, 'Vans Era P20 Hombre (2 colores) $110.000 40 al 42\nColor: NEGRO');
    await s.getByRole('button', { name: 'Crear 1 publicación' }).click();
    const f = ficha(page, 0);
    await elegirCategoria(f, 'URBANAS');
    await colores(f).nth(0).getByLabel(/^Precio de venta/).fill('160000');
    await colores(f).nth(1).getByLabel(/^Precio de venta/).fill('165000');
    await importador(page).getByRole('button', { name: 'Guardar lote como oculto (1)' }).click();
    await expect(f.locator('.importador-errores')).toContainText('Escribe el nombre del color 2.');
    expect(await productos20()).toEqual([]);
    await nombre(colores(f).nth(1)).fill('blanco');
    await importador(page).getByRole('button', { name: 'Guardar lote como oculto (1)' }).click();
    await expect(f.locator('.importador-estado')).toContainText('Guardada oculta · GT-', { timeout: 30000 });
    const [p] = await productos20();
    expect(p.variantes.map((v) => [v.color, v.precio]).sort()).toEqual([['BLANCO', 165000], ['NEGRO', 160000]]);
    expect(p.variantes.flatMap((v) => v.tallas.map((t) => t.estado))).toEqual(Array(6).fill('REVISAR'));
    expect(problemas).toEqual([]);
  });
});
