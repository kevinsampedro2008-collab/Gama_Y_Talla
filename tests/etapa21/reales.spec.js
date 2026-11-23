// @ts-check
/* Etapa 21 · Validación con los catálogos PDF REALES del proveedor (23-11-2026).
 *
 * Los PDF NO están en el repositorio: esta prueba solo corre si GT_PDF_REALES apunta a la carpeta que los
 * contiene («Catálogo 23-11-2026.pdf», «Catálogo Precios 23-11-2026.pdf», «Catálogo Novedades 23-11-2026.pdf»).
 * Lee en el navegador (PDF.js del panel, con su CSP), sin sesión y sin escribir nada. Las capturas, si se
 * piden con GT_CAPTURAS_REALES, quedan fuera del repositorio.
 *
 *   GT_PDF_REALES=<carpeta> SITIO=http://127.0.0.1:8770 npx playwright test tests/etapa21/reales.spec.js --workers=1
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { vigilar, entorno, crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, entrarAlPanel, abrirImportador, abrirPdf, subirPdfs, seccionPdf, verTodas, productos21 } from './ayudas21.js';

const CARPETA = process.env.GT_PDF_REALES || '';
const ARCHIVOS = { descripcion: 'Catálogo 23-11-2026.pdf', proveedor: 'Catálogo Precios 23-11-2026.pdf', venta: 'Catálogo Novedades 23-11-2026.pdf' };
const SITIO = process.env.SITIO || 'http://127.0.0.1:8770';

test.describe('catálogos PDF reales', () => {
  test.skip(!CARPETA || !Object.values(ARCHIVOS).every((n) => fs.existsSync(path.join(CARPETA, n))), 'Sin GT_PDF_REALES (los PDF reales no están en el repositorio).');
  test.setTimeout(180000);

  test('78 tarjetas y 78 fotos en cada versión; 57 de calzado; cruce por foto y precios de los ejemplos', async ({ page }) => {
    const problemas = vigilar(page);
    await page.goto(`${SITIO}/admin/`);
    await page.waitForFunction(() => Boolean(window.GamaTallaCatalogoPdf));
    const docs = Object.fromEntries(Object.entries(ARCHIVOS).map(([k, n]) => [k, fs.readFileSync(path.join(CARPETA, n)).toString('base64')]));
    const r = await page.evaluate(async ({ docs, nombres }) => {
      const P = window.GamaTallaCatalogoPdf;
      const desde64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
      const leidos = {};
      for (const [k, b64] of Object.entries(docs)) {
        const x = await P.leerDocumento(desde64(b64), { idDoc: k });
        leidos[k] = { ...x, papel: P.proponerPapel(x.tarjetas, nombres[k]).papel, papelSinNombre: P.proponerPapel(x.tarjetas, '').papel };
      }
      const principal = leidos.venta.tarjetas;
      const relP = P.relacionar(principal, leidos.proveedor.tarjetas);
      const relD = P.relacionar(principal, leidos.descripcion.tarjetas);
      const porId = new Map(leidos.proveedor.tarjetas.map((t) => [t.id, t]));
      const filas = principal.map((t) => {
        const rp = relP.porPrincipal[t.id];
        const costes = rp.estado === 'exacta' ? porId.get(rp.elegida).lineas : null;
        const c = P.componer({ descripcion: t.lineas, costes, venta: t.destacados });
        return { id: t.id, pagina: t.pagina, orden: t.orden, titulo: t.lineas[0], tipo: c.clasificacion.tipo, senales: c.clasificacion.senales, venta: c.ventaSugerida,
          costes: c.costes.map((x) => [x.importe, x.condicion, x.general]), infantil: c.infantil, tallas: c.tallasDeclaradas };
      });
      const resumen = (rel) => Object.values(rel.porPrincipal).reduce((a, x) => ({ ...a, [x.estado]: (a[x.estado] || 0) + 1 }), {});
      return {
        documentos: Object.fromEntries(Object.entries(leidos).map(([k, x]) => [k, { paginas: x.paginas, tarjetas: x.tarjetas.length, fotos: new Set(x.tarjetas.map((t) => t.foto.exacta)).size,
          conFoto: x.tarjetas.filter((t) => t.foto.blob && t.foto.ancho >= 400).length, papel: x.papel, papelSinNombre: x.papelSinNombre, fecha: x.fecha, sin: x.paginasSinTarjetas.map((p) => p.pagina) }])),
        mismasFotos: ['proveedor', 'descripcion'].every((k) => new Set(leidos[k].tarjetas.map((t) => t.foto.exacta)).size === 78
          && leidos[k].tarjetas.every((t) => principal.some((p) => p.foto.exacta === t.foto.exacta))),
        relP: resumen(relP), relD: resumen(relD), sinParejaP: relP.sinPareja.length, filas
      };
    }, { docs, nombres: ARCHIVOS });
    for (const k of Object.keys(ARCHIVOS)) {
      expect(r.documentos[k]).toMatchObject({ paginas: 22, tarjetas: 78, fotos: 78, conFoto: 78, papel: k, papelSinNombre: k, fecha: '2026-11-23', sin: [1, 22] });
    }
    expect(r.mismasFotos).toBe(true);
    expect(r.relP).toEqual({ exacta: 78 });
    expect(r.relD).toEqual({ exacta: 78 });
    expect(r.sinParejaP).toBe(0);
    const calzado = r.filas.filter((f) => f.tipo === 'calzado');
    expect(calzado).toHaveLength(57);
    expect(calzado.filter((f) => f.senales.includes('tallas EU/Euro'))).toHaveLength(41);
    expect(calzado.filter((f) => f.senales.includes('«todas las tallas»'))).toHaveLength(16);
    expect(r.filas.filter((f) => f.tipo === 'otro')).toHaveLength(21);
    const winflo = r.filas.find((f) => f.titulo === 'NIKE WINFLO 12');
    expect(winflo).toMatchObject({ venta: 134900, costes: [[95000, 'PRECIO', true]] });
    const hugo = r.filas.find((f) => f.pagina === 12 && f.titulo === 'HUGO BOSS');
    expect(hugo).toMatchObject({ venta: 174900, costes: [[125000, '', true]] });
    const caja = r.filas.filter((f) => f.costes.length === 2);
    expect(caja.length).toBeGreaterThan(0);
    for (const f of caja) expect(f.costes).toEqual([[95000, 'PRECIO', true], [85000, 'DISPONIBLE POR CAJA', false]]);
    const nino = r.filas.find((f) => f.infantil);
    expect(nino).toMatchObject({ tipo: 'calzado', tallas: { desde: 28, hasta: 35 } });
    expect(r.filas.find((f) => f.titulo === 'ADIDAS SAMBA MARY JANE DAMA AZUL BLANCO')?.tallas).toEqual({ desde: 36, hasta: 40 });
    expect(problemas).toEqual([]);
  });

  // Recorrido en el importador con los PDF reales: solo revisión (nada se añade ni se guarda). Capturas fuera
  // del repositorio, en GT_CAPTURAS_REALES.
  test('revisión en el importador (escritorio y celular), sin escribir en Supabase', async ({ page, browserName }) => {
    test.skip(!process.env.GT_CAPTURAS_REALES, 'Sin GT_CAPTURAS_REALES.');
    entorno();
    const admin = await crearUsuario(`panel21-reales-${browserName}-${Date.now().toString(36)}@gamaytalla.test`);
    await hacerAdmin(admin.id);
    try {
      const problemas = await entrarAlPanel(page, admin);
      await abrirImportador(page);
      await abrirPdf(page);
      await subirPdfs(page, Object.values(ARCHIVOS).map((n) => path.join(CARPETA, n)));
      await expect(seccionPdf(page).locator('#imp-pdf-resumen')).toContainText('78 tarjetas en «Catálogo Novedades 23-11-2026.pdf» · 57 de calzado · 21 de otros artículos');
      const salida = process.env.GT_CAPTURAS_REALES;
      fs.mkdirSync(salida, { recursive: true });
      await seccionPdf(page).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(salida, `pdf-reales-${browserName}-1280.png`) });
      await verTodas(page);
      await seccionPdf(page).locator('.importador-pdf-tarjeta').nth(22).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(salida, `pdf-reales-caja-${browserName}-1280.png`) });
      await page.setViewportSize({ width: 390, height: 844 });
      await seccionPdf(page).locator('.importador-pdf-tarjeta').nth(56).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(salida, `pdf-reales-hugo-${browserName}-390.png`) });
      expect(await productos21()).toEqual([]);
      expect(problemas.filter((x) => !/Refused to apply a stylesheet/.test(x))).toEqual([]);
    } finally {
      await quitarAdmin(admin.id).catch(() => null);
      await borrarUsuario(admin.id);
    }
  });
});
