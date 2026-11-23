// @ts-check
/* Etapa 21 · Correcciones de la revisión del parche:
 *  1. Correspondencias aproximadas: la huella gris 16×16 es solo una propuesta. Dos fotos DISTINTAS con la
 *     misma huella gris (rojo puro y un verde medio) no aportan coste ni nada sin confirmación; una
 *     aproximada legítima se confirma o se rechaza, y la decisión se conserva. Las exactas e inequívocas
 *     siguen funcionando solas.
 *  2. Imágenes de trabajo del PDF en el borrador y el respaldo (clase «pdf»): también en JPEG (forzado aquí
 *     de forma controlada) y de más de 1 MiB. Exportar e importar el respaldo conserva fotos, destinos,
 *     decisiones y precios; las fotos finales siguen exigiendo WebP y 1 MiB.
 *
 * PDF SINTÉTICOS; importador SOLO contra el Supabase LOCAL y el entorno aislado (SITIO=http://127.0.0.1:8770).
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  entorno, crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, entrarAlPanel, abrirImportador, importador, ficha, fichas,
  esperarGuardadoLocal, limpiar21, productos21, crearPdf, porPaginas, TARJETAS, catalogosSinteticos, seccionPdf, tarjetaPdf, abrirPdf, subirPdfs,
  verTodas, PDFS21
} from './ayudas21.js';

const SITIO = process.env.SITIO || 'http://127.0.0.1:8770';
const FECHA = 'Lunes 23 de Noviembre de 2026';
const portada = { portada: { fecha: FECHA, fotos: [] } };

// ======================================================================== lector (sin sesión ni escrituras)
test('lector: fotos distintas con la misma huella gris quedan como propuesta «parecida», nunca «exacta»; la exacta repetida, ambigua', async ({ page }) => {
  await page.goto(`${SITIO}/admin/`);
  await page.waitForFunction(() => Boolean(window.GamaTallaCatalogoPdf));
  const r = await page.evaluate(async () => {
    const P = window.GamaTallaCatalogoPdf;
    const img = (c) => ({ width: 16, height: 16, kind: 2, data: Uint8Array.from({ length: 16 * 16 * 3 }, (_, i) => c[i % 3]) });
    const tarjeta = async (id, im) => ({ id, foto: { exacta: await P.sha256(im.data), gris: P.aHex(P.grisDe(im)) } });
    const roja = await tarjeta('v1', img([255, 0, 0]));
    const verde = await tarjeta('p1', img([0, 130, 0]));
    const rojaOtra = await tarjeta('p2', img([255, 0, 0]));
    const rojaDos = await tarjeta('v2', img([255, 0, 0]));
    return {
      exactasDistintas: roja.foto.exacta !== verde.foto.exacta,
      distancia: P.distancia(roja.foto.gris, verde.foto.gris),
      aproximada: P.relacionar([roja], [verde]).porPrincipal.v1,
      exacta: P.relacionar([roja], [rojaOtra, verde]).porPrincipal.v1.estado,
      // La misma foto en dos tarjetas principales: ninguna se asigna sola.
      repetida: P.relacionar([roja, rojaDos], [rojaOtra]).porPrincipal
    };
  });
  expect(r.exactasDistintas).toBe(true);
  expect(r.distancia).toBe(0);
  expect(r.aproximada).toEqual({ estado: 'parecida', elegida: 'p1', candidatos: [{ id: 'p1', distancia: 0, exacta: false }] });
  expect(r.exacta).toBe('exacta'); // la exacta manda aunque haya otra con la misma huella gris
  expect([r.repetida.v1.estado, r.repetida.v2.estado]).toEqual(['ambigua', 'ambigua']);
});

// La candidata automática es la de la huella EXACTA, no «la primera de la lista»: una foto distinta con la misma
// huella gris puede ir antes. Cambiar el orden de las candidatas no cambia el resultado.
test('lector: la exacta es la elegida en cualquier orden de las candidatas; duplicadas exactas, ambiguas; parecidas, por confirmar', async ({ page }) => {
  await page.goto(`${SITIO}/admin/`);
  await page.waitForFunction(() => Boolean(window.GamaTallaCatalogoPdf));
  const r = await page.evaluate(async () => {
    const P = window.GamaTallaCatalogoPdf;
    const img = (c) => ({ width: 16, height: 16, kind: 2, data: Uint8Array.from({ length: 16 * 16 * 3 }, (_, i) => c[i % 3]) });
    const tarjeta = async (id, im) => ({ id, foto: { exacta: await P.sha256(im.data), gris: P.aHex(P.grisDe(im)) } });
    const roja = await tarjeta('principal', img([255, 0, 0]));
    const verde = await tarjeta('verde', img([0, 130, 0]));
    const verde2 = await tarjeta('verde2', img([0, 131, 0]));
    const rojaP = await tarjeta('roja', img([255, 0, 0]));
    const rojaP2 = await tarjeta('roja2', img([255, 0, 0]));
    const permutaciones = (l) => (l.length <= 1 ? [l] : l.flatMap((x, i) => permutaciones([...l.slice(0, i), ...l.slice(i + 1)]).map((q) => [x, ...q])));
    const resumen = (rel) => ({ estado: rel.estado, elegida: rel.elegida, primera: rel.candidatos[0]?.id ?? null, ids: rel.candidatos.map((x) => x.id).sort() });
    return {
      grises: [P.distancia(roja.foto.gris, verde.foto.gris), P.distancia(roja.foto.gris, verde2.foto.gris)],
      todas: permutaciones([verde, rojaP, verde2]).map((otras) => ({ orden: otras.map((o) => o.id).join(','), ...resumen(P.relacionar([roja], otras).porPrincipal.principal) })),
      duplicadas: permutaciones([verde, rojaP, rojaP2]).map((otras) => resumen(P.relacionar([roja], otras).porPrincipal.principal)),
      parecida: permutaciones([verde]).map((otras) => resumen(P.relacionar([roja], otras).porPrincipal.principal)),
      sin: resumen(P.relacionar([roja], []).porPrincipal.principal)
    };
  });
  expect(r.grises[0]).toBe(0); // fotos distintas, misma huella gris
  expect(r.grises[1]).toBeLessThanOrEqual(3); // y otra más, dentro del umbral de «parecida» (UMBRAL_IGUAL)
  expect(r.todas).toHaveLength(6);
  for (const x of r.todas) {
    expect(x, x.orden).toMatchObject({ estado: 'exacta', elegida: 'roja', primera: 'roja' });
    expect(x.ids).toEqual(['roja', 'verde', 'verde2']);
  }
  // Dos tarjetas con la misma foto exacta: ambiguas, y no hay «elegida».
  for (const x of r.duplicadas) expect(x).toMatchObject({ estado: 'ambigua', elegida: null });
  // Solo parecida: sigue necesitando confirmación (propuesta, no automática).
  expect(r.parecida[0]).toMatchObject({ estado: 'parecida', elegida: 'verde' });
  expect(r.sin).toMatchObject({ estado: 'sin', elegida: null, primera: null });
});

// ======================================================================== importador (Supabase LOCAL)
test.describe('importador: aproximadas y respaldo con imágenes del PDF', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(240000);
  let admin;
  test.beforeAll(async ({}, info) => {
    entorno();
    await limpiar21();
    admin = await crearUsuario(`panel21-respaldo-${info.project.name}-${Date.now().toString(36)}@gamaytalla.test`);
    await hacerAdmin(admin.id);
    fs.mkdirSync(PDFS21, { recursive: true });
  });
  test.afterAll(async () => {
    await limpiar21().catch(() => null);
    if (admin) { await quitarAdmin(admin.id).catch(() => null); await borrarUsuario(admin.id); }
  });
  test.afterEach(async () => { await limpiar21(); });
  const borradores = (page) => importador(page).locator('#imp-borradores');

  test('fotos distintas con huella gris idéntica: el coste no entra sin confirmación (tampoco al añadir)', async ({ page }) => {
    const venta = crearPdf({ paginas: [portada, { tarjetas: [{ foto: { semilla: 1, solido: [255, 0, 0] }, lineas: ['NIKE ROJO P21', 'EU 40 AL 44'], destacado: '$150.000' }] }] });
    const precios = crearPdf({ paginas: [portada, { tarjetas: [{ foto: { semilla: 2, solido: [0, 130, 0] }, lineas: ['PRECIO$99.000'] }] }] });
    const rutaV = path.join(PDFS21, 'rojo-venta.pdf');
    const rutaP = path.join(PDFS21, 'verde-precios.pdf');
    fs.writeFileSync(rutaV, venta);
    fs.writeFileSync(rutaP, precios);
    const problemas = await entrarAlPanel(page, admin);
    await abrirImportador(page);
    await abrirPdf(page);
    await subirPdfs(page, [rutaV, rutaP]);
    const t1 = tarjetaPdf(page, 1);
    await expect(t1.getByRole('group', { name: 'Correspondencia aproximada en verde-precios.pdf' })).toBeVisible();
    await expect(t1).toContainText('Coste del proveedor: pendiente hasta que confirmes la correspondencia con «verde-precios.pdf» (foto parecida, no idéntica).');
    await expect(seccionPdf(page).locator('#imp-pdf-resumen')).toContainText('1 con dudas');
    await seccionPdf(page).getByRole('button', { name: /^Añadir al lote/ }).click();
    await expect(fichas(page)).toHaveCount(1);
    const f = ficha(page, 0);
    await expect(f.getByRole('textbox', { name: /^Modelo/ })).toHaveValue('ROJO P21');
    await expect(f.getByLabel(/^Precio del proveedor/)).toHaveValue('');
    await expect(f.getByLabel(/^Precio de venta/)).toHaveValue('150000');
    await expect(f.locator('.importador-procedencia')).not.toContainText('verde-precios.pdf');
    expect(await f.getByLabel('Texto preparado desde el catálogo PDF').inputValue()).not.toContain('99.000');
    expect(await productos21()).toEqual([]);
    expect(problemas).toEqual([]);
  });

  // Recorrido del importador: la tarjeta exacta (la roja) aporta el coste 95.000 aunque la verde (otra foto con la
  // misma huella gris, coste 99.000) vaya antes o después en el documento de precios.
  for (const [orden, posicionRoja] of [['verde primero', 2], ['roja primero', 1]]) {
    test(`importador: la exacta aporta el coste aunque otra foto con la misma huella gris vaya antes (${orden})`, async ({ page }) => {
      const verdeCard = { foto: { semilla: 2, solido: [0, 130, 0] }, lineas: ['PRECIO$99.000'] };
      const rojaCard = { foto: { semilla: 1, solido: [255, 0, 0] }, lineas: ['PRECIO$95.000'] };
      const venta = crearPdf({ paginas: [portada, { tarjetas: [{ foto: { semilla: 1, solido: [255, 0, 0] }, lineas: ['NIKE ROJO P21', 'EU 40 AL 44'], destacado: '$150.000' }] }] });
      const precios = crearPdf({ paginas: [portada, { tarjetas: posicionRoja === 2 ? [verdeCard, rojaCard] : [rojaCard, verdeCard] }] });
      const rutaV = path.join(PDFS21, `orden-venta-${posicionRoja}.pdf`);
      const rutaP = path.join(PDFS21, `orden-precios-${posicionRoja}.pdf`);
      fs.writeFileSync(rutaV, venta);
      fs.writeFileSync(rutaP, precios);
      const problemas = await entrarAlPanel(page, admin);
      await abrirImportador(page);
      await abrirPdf(page);
      await subirPdfs(page, [rutaV, rutaP]);
      const t1 = tarjetaPdf(page, 1);
      // La revisión muestra la tarjeta exacta: su posición, su coste y «misma foto»; nada de la otra foto.
      await expect(t1).toContainText(`orden-precios-${posicionRoja}.pdf: página 2, tarjeta ${posicionRoja} · misma foto.`);
      await expect(t1).toContainText(`Coste del proveedor: $ 95.000 (precio) · Precios del proveedor · página 2, tarjeta ${posicionRoja}.`);
      await expect(t1).not.toContainText('99.000');
      await expect(t1.getByRole('group', { name: /Correspondencia aproximada/ })).toHaveCount(0);
      await expect(seccionPdf(page).locator('#imp-pdf-resumen')).toContainText('0 con dudas');
      // Y la ficha que se añade: coste, texto preparado y procedencia son de la tarjeta exacta.
      await seccionPdf(page).getByRole('button', { name: /^Añadir al lote/ }).click();
      await expect(fichas(page)).toHaveCount(1);
      const f = ficha(page, 0);
      await expect(f.getByLabel(/^Precio del proveedor/)).toHaveValue('95000');
      await expect(f.getByLabel(/^Precio de venta/)).toHaveValue('150000');
      await expect(f.locator('.importador-procedencia')).toContainText(`orden-precios-${posicionRoja}.pdf, página 2 (tarjeta ${posicionRoja})`);
      const texto = await f.getByLabel('Texto preparado desde el catálogo PDF').inputValue();
      expect(texto).toContain('$95.000');
      expect(texto).not.toContain('99.000');
      expect(await productos21()).toEqual([]);
      expect(problemas).toEqual([]);
    });
  }

  test('imágenes del PDF en JPEG (forzado) y de más de 1 MiB: borrador, exportar e importar el respaldo con fotos, destinos, decisiones y precios', async ({ page, browserName }) => {
    // Sin WebP: el lienzo devuelve PNG cuando se le pide WebP (como algunos Safari) y la extracción usa JPEG.
    // Solo mientras __soloJpeg esté activo; después, fotos.js prepara las fotos finales con WebP como siempre.
    await page.addInitScript(() => {
      window.__soloJpeg = true;
      const original = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (alListo, tipo, calidad) {
        return original.call(this, alListo, window.__soloJpeg && tipo === 'image/webp' ? 'image/png' : tipo, calidad);
      };
    });
    // Novedades sintético + una tarjeta con una foto grande de ruido (1500×1500: más de 1 MiB al extraerla).
    const grande = { foto: { semilla: 900, ancho: 1500, alto: 1500, aleatorio: true }, lineas: ['NIKE GRANDE P21', 'EU 40 AL 44'], destacado: '$200.000' };
    const venta = crearPdf({ paginas: [portada, ...porPaginas([...TARJETAS.map((t) => ({ foto: t.foto, lineas: t.lineas, destacado: t.venta })), grande])] });
    const rutaV = path.join(PDFS21, 'venta-grande.pdf');
    const rutaP = path.join(PDFS21, 'precios-respaldo.pdf');
    fs.writeFileSync(rutaV, venta);
    fs.writeFileSync(rutaP, catalogosSinteticos().precios);
    const problemas = await entrarAlPanel(page, admin);
    await abrirImportador(page);
    await abrirPdf(page);
    await subirPdfs(page, [rutaV, rutaP]);
    await verTodas(page);
    // Decisiones: confirmar la aproximada (1), elegir en la ambigua (4), incluir la infantil (6), 9 = otra foto de 1,
    // 10 = otro color de 8, y precio «Calcularlo después».
    await tarjetaPdf(page, 1).getByRole('button', { name: 'Sí, es la misma' }).click();
    await tarjetaPdf(page, 4).getByRole('group', { name: /varias tarjetas/ }).getByRole('radio').first().click();
    await tarjetaPdf(page, 6).getByRole('checkbox', { name: 'Añadir al lote' }).check();
    await tarjetaPdf(page, 9).getByRole('radio', { name: 'Otra fotografía del mismo color que la tarjeta…' }).check();
    await tarjetaPdf(page, 9).getByRole('textbox', { name: /^Número de la tarjeta/ }).fill('1');
    await tarjetaPdf(page, 10).getByRole('radio', { name: 'Otro color de la misma zapatilla que la tarjeta…' }).check();
    await tarjetaPdf(page, 10).getByRole('textbox', { name: /^Número de la tarjeta/ }).fill('8');
    await seccionPdf(page).getByRole('radio', { name: /^Calcularlo después/ }).check();
    await expect(tarjetaPdf(page, 11)).toContainText('Tarjeta 11 · NIKE GRANDE P21');
    await esperarGuardadoLocal(page);

    // Exportar el respaldo: imágenes del PDF con su clase, en JPEG, una de más de 1 MiB.
    await importador(page).getByRole('button', { name: /^Borradores/ }).click();
    const [descarga] = await Promise.all([page.waitForEvent('download'), borradores(page).getByRole('button', { name: /^Exportar un respaldo del borrador/ }).click()]);
    const archivo = path.join(PDFS21, `respaldo-pdf-${browserName}.json`);
    await descarga.saveAs(archivo);
    const respaldo = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    expect(respaldo.fotos.length).toBe(13); // una por huella exacta: 10 de Novedades, la grande, la sin pareja y la recodificada de Precios
    expect(respaldo.fotos.every((x) => x.clase === 'pdf')).toBe(true);
    const bytes = respaldo.fotos.map((x) => Buffer.from(x.base64, 'base64'));
    expect(bytes.every((b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)).toBe(true); // JPEG
    expect(Math.max(...bytes.map((b) => b.length))).toBeGreaterThan(1024 * 1024);
    expect(Math.max(...bytes.map((b) => b.length))).toBeLessThan(15 * 1024 * 1024);
    // Las fotos finales siguen exigiendo WebP: el mismo JPEG marcado «final» se rechaza.
    const finalJpeg = path.join(PDFS21, `respaldo-final-jpeg-${browserName}.json`);
    fs.writeFileSync(finalJpeg, JSON.stringify({ ...respaldo, borrador: { ...respaldo.borrador, id: crypto.randomUUID() }, fotos: [{ ...respaldo.fotos[0], clase: 'final' }] }));
    await borradores(page).locator('#imp-respaldo-archivo').setInputFiles(finalJpeg);
    await expect(borradores(page).locator('#imp-borradores-aviso')).toContainText('No se importó nada: La foto 1 del respaldo no es una imagen admitida.');

    // Quitar el borrador de este navegador e importar el respaldo.
    await borradores(page).getByRole('button', { name: 'Empezar otro lote' }).click();
    await importador(page).getByRole('button', { name: /^Borradores/ }).click();
    await borradores(page).locator(`[data-borrador="${respaldo.borrador.id}"]`).getByRole('button', { name: /^Eliminar el borrador/ }).click();
    await borradores(page).getByRole('button', { name: 'Eliminar el borrador', exact: true }).click();
    await expect(borradores(page).locator(`[data-borrador="${respaldo.borrador.id}"]`)).toHaveCount(0);
    await borradores(page).locator('#imp-respaldo-archivo').setInputFiles(archivo);
    await expect(borradores(page).locator('#imp-borradores-aviso')).toContainText('Respaldo importado');
    await borradores(page).locator(`[data-borrador="${respaldo.borrador.id}"]`).getByRole('button', { name: /^Continuar/ }).click();

    // Todo vuelve: documentos, decisiones, destinos, precio y fotos (también la grande).
    await expect(seccionPdf(page).locator('.importador-pdf-doc')).toHaveCount(2);
    await expect(seccionPdf(page).getByRole('radio', { name: /^Calcularlo después/ })).toBeChecked();
    await expect(tarjetaPdf(page, 1)).toContainText('confirmada a mano (foto parecida)');
    await expect(tarjetaPdf(page, 1)).toContainText('Coste del proveedor: $ 95.000 (precio)');
    await expect(tarjetaPdf(page, 4)).toContainText('elegida a mano');
    await expect(tarjetaPdf(page, 6).getByRole('checkbox', { name: 'Añadir al lote' })).toBeChecked();
    await expect(tarjetaPdf(page, 9).getByRole('textbox', { name: /^Número de la tarjeta/ })).toHaveValue('1');
    await expect(tarjetaPdf(page, 10).getByRole('textbox', { name: /^Número de la tarjeta/ })).toHaveValue('8');
    for (const [n, ancho] of [[1, 420], [11, 1500]]) {
      const img = tarjetaPdf(page, n).locator('img.importador-pdf-miniatura').first();
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((x) => /** @type {HTMLImageElement} */ (x).naturalWidth)).toBe(ancho);
    }

    // Añadir al lote (ya con WebP para las fotos finales): fotos, destinos y precios correctos.
    await page.evaluate(() => { window.__soloJpeg = false; });
    await seccionPdf(page).getByRole('button', { name: /^Añadir al lote/ }).click();
    const winflo = ficha(page, 0);
    await expect(winflo.getByLabel(/^Precio del proveedor/)).toHaveValue('95000'); // aproximada confirmada
    await expect(winflo.getByLabel(/^Precio de venta/)).toHaveValue(''); // «Calcularlo después»
    await expect(winflo.locator('.editor-foto.es-lista')).toHaveCount(2, { timeout: 60000 }); // la 9 en su galería
    const samba = fichas(page).filter({ has: page.getByRole('heading', { name: /^Ficha 6 · ADIDAS SAMBA P21/ }) });
    await expect(samba.locator('.importador-color')).toHaveCount(2);
    await expect(samba.locator('.editor-foto.es-lista')).toHaveCount(2, { timeout: 60000 });
    expect(await productos21()).toEqual([]);
    expect(problemas).toEqual([]);
  });
});
