// @ts-check
/* Etapa 21 · «Importar catálogo PDF»: lectura de tarjetas, papel de cada documento, cruce por foto,
 * clasificación, precios (coste con condiciones, venta sugerida, precio elegido), asociaciones, «Añadir al
 * lote», borradores y guardado.
 *
 * PDF SINTÉTICOS (ayudas21.js): ningún dato ni foto del proveedor. Lector en el propio panel (sin sesión, sin
 * escrituras); importador SOLO contra el Supabase LOCAL y el entorno aislado (SITIO=http://127.0.0.1:8770).
 * Modelos ficticios « P21»; todo se borra al terminar.
 *
 *   SITIO=http://127.0.0.1:8770 npx playwright test tests/etapa21 --workers=1
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import {
  entorno, crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, revisarDisposicion, vigilar, entrarAlPanel, abrirImportador, importador,
  ficha, fichas, recargar, esperarGuardadoLocal, elegirCategoria, capturar, limpiar21, productos21, prepararPdfs21, catalogosSinteticos, crearPdf,
  seccionPdf, tarjetaPdf, abrirPdf, subirPdfs, verTodas, radioPublico, CAPTURAS21
} from './ayudas21.js';

const SITIO = process.env.SITIO || 'http://127.0.0.1:8770';

// ======================================================================== lector (sin sesión ni escrituras)
test.describe('lector de catálogos PDF', () => {
  test.setTimeout(120000);
  test.beforeEach(async ({ page }) => {
    await page.goto(`${SITIO}/admin/`);
    await page.waitForFunction(() => Boolean(window.GamaTallaCatalogoPdf));
  });
  /** Lee unos PDF (bytes desde Node) con PDF.js en el navegador: tarjetas, papel y relación con el primero. */
  const leer = (page, docs) => page.evaluate(async (lista) => {
    const P = window.GamaTallaCatalogoPdf;
    const desde64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
    const leidos = [];
    for (const [i, b64] of lista.entries()) {
      const r = await P.leerDocumento(desde64(b64), { idDoc: `d${i}` });
      leidos.push({ ...r, papel: P.proponerPapel(r.tarjetas, '').papel, tarjetas: r.tarjetas.map((t) => ({ ...t, foto: { ...t.foto, blob: Boolean(t.foto.blob), tipo: t.foto.blob?.type } })) });
    }
    const rel = leidos.slice(1).map((d) => P.relacionar(leidos[0].tarjetas, d.tarjetas));
    const comp = leidos[0].tarjetas.map((t) => P.componer({ descripcion: t.lineas, venta: t.destacados }));
    return { leidos, rel, comp };
  }, docs.map((b) => b.toString('base64')));

  test('tarjetas, portada y despedida, papel por contenido, cruce por foto (orden cambiado, ambigua y sin pareja)', async ({ page }) => {
    const problemas = vigilar(page);
    const { venta, precios, descripciones } = catalogosSinteticos();
    const { leidos, rel, comp } = await leer(page, [venta, precios, descripciones]);
    const [v, p, d] = leidos;
    expect([v.tarjetas.length, p.tarjetas.length, d.tarjetas.length]).toEqual([10, 12, 10]);
    // Portada (marco con varias fotos) y despedida fuera; cabeceras y números de página no son de ninguna tarjeta.
    expect(v.paginasSinTarjetas.map((x) => x.pagina)).toEqual([1, 5]);
    expect(v.tarjetas.every((t) => !t.lineas.some((l) => /CATÁLOGO ·|^\d+$/.test(l)))).toBe(true);
    // «NUEVO» va sobre la foto: es un adorno, no descripción.
    expect(v.tarjetas[0]).toMatchObject({ pagina: 2, orden: 1, lineas: ['NIKE WINFLO P21', 'Tallas: (Euro 40 al 43)'], destacados: ['$134.900'], etiquetas: ['NUEVO'] });
    expect([v.papel, p.papel, d.papel]).toEqual(['venta', 'proveedor', 'descripcion']);
    expect(v.fecha).toBe('2026-11-23');
    expect(v.notas).toEqual(['Precios sujetos a disponibilidad de tallas']);
    // Foto original embebida (420×440), no la página: con huella y archivo de imagen.
    expect(v.tarjetas[0].foto).toMatchObject({ ancho: 420, alto: 440, blob: true });
    expect(['image/webp', 'image/jpeg']).toContain(v.tarjetas[0].foto.tipo);
    // Precios va en otro orden: el cruce es por la foto.
    const vp = rel[0].porPrincipal;
    const idPrecio = (id) => p.tarjetas.find((t) => t.id === id);
    expect(vp['d0-p2-1'].estado).toBe('parecida'); // la misma foto recodificada en el documento de precios
    expect(idPrecio(vp['d0-p2-1'].elegida).lineas).toEqual(['PRECIO$95.000']);
    expect(vp['d0-p2-2']).toMatchObject({ estado: 'exacta' });
    expect(idPrecio(vp['d0-p2-2'].elegida).lineas).toEqual(['PRECIO$95.000', 'DISPONIBLE POR CAJA $85.000']);
    expect(vp['d0-p2-4'].estado).toBe('ambigua'); // la misma foto en dos tarjetas de precios: nada se elige solo
    expect(vp['d0-p2-4'].candidatos).toHaveLength(2);
    expect(rel[0].sinPareja).toHaveLength(1); // la tarjeta de precios con una foto que no está en Novedades
    expect(Object.values(rel[1].porPrincipal).every((x) => x.estado === 'exacta')).toBe(true);
    // Clasificación: calzado (EU/Euro y «TODAS LAS TALLAS»), otros artículos aunque la marca sea de zapatillas.
    expect(comp.map((c) => c.clasificacion.tipo)).toEqual(['calzado', 'calzado', 'calzado', 'otro', 'calzado', 'calzado', 'otro', 'calzado', 'calzado', 'calzado']);
    expect(comp[4].clasificacion.senales).toContain('«todas las tallas»');
    expect(comp[0].clasificacion.senales).toContain('tallas EU/Euro');
    expect(comp[6].clasificacion.motivo).toBe('Otro artículo: «reloj».');
    expect(comp[5]).toMatchObject({ infantil: true, tallasDeclaradas: { desde: 28, hasta: 35 } });
    expect(comp.map((c) => c.ventaSugerida)).toEqual([134900, 134900, 174900, 94900, 164900, 139900, 474900, 129900, 134900, 129900]);
    expect(problemas).toEqual([]);
  });

  test('importes con su condición, equivalencias acotadas del título y clasificación por señales', async ({ page }) => {
    const r = await page.evaluate(() => {
      const P = window.GamaTallaCatalogoPdf;
      return {
        caja: P.leerImportes(['PRECIO$95.000', 'DISPONIBLE POR CAJA $85.000']),
        mayor: P.leerImportes(['PRECIO X MAYOR $65.000']),
        hombre: P.leerImportes(['HOMBRE $125.000', 'EU 36 AL 40. $90.000']),
        titulos: ['AD ADIZERO PRIME 3S HOM NEGRO BLANCO', 'NUEVO NIKE 7 CÁMARAS CABALLERO', 'BOSS TABLA', 'HUGO BOSS', 'NIKE AIR MAX COURT DAMA PASTEL', 'NIKE METCON FREE 7 NIÑ@ NEGRO BLANCO', 'LACOSTE STORM']
          .map((t) => { const x = P.prepararTitulo(t); return [x.marca, x.resto, x.publico, x.infantil, x.color]; }),
        tipos: [['CAMISETA NIKE', 'Talla M'], ['RELOJ BOSS'], ['Conjuntos deportivos De dama 3piezas Talla única'], ['NIKE ULTRA', 'Hombre 40 al 44 Euro'],
          ['NUEVO DIESEL CABALLERO', 'Tallas:TODAS LAS TALLAS'], ['HUGO BOSS'], ['GAFAS', 'Numeración 40'], ['Tallas: 38 al 42'], ['Euro 2026']].map((l) => P.clasificar(l).tipo),
        venta: P.componer({ descripcion: ['NIKE WINFLO 12', 'Tallas: (Euro 40 al 43)'], costes: ['PRECIO$95.000'], venta: ['$134.900'] })
      };
    });
    expect(r.caja).toEqual([{ importe: 95000, condicion: 'PRECIO', linea: 'PRECIO$95.000', general: true }, { importe: 85000, condicion: 'DISPONIBLE POR CAJA', linea: 'DISPONIBLE POR CAJA $85.000', general: false }]);
    expect(r.mayor[0]).toMatchObject({ importe: 65000, general: false });
    expect(r.hombre.map((x) => [x.importe, x.condicion, x.general])).toEqual([[125000, '', true], [90000, '', true]]);
    expect(r.titulos).toEqual([
      ['ADIDAS', 'ADIZERO PRIME 3S', 'hombre', false, 'NEGRO BLANCO'], ['', 'NIKE 7 CÁMARAS', 'hombre', false, ''], ['HUGO BOSS', 'TABLA', '', false, ''],
      ['', 'HUGO BOSS', '', false, ''], ['', 'NIKE AIR MAX COURT', 'dama', false, 'PASTEL'], ['', 'NIKE METCON FREE 7', '', true, 'NEGRO BLANCO'], ['', 'LACOSTE STORM', '', false, '']]);
    // Una marca no clasifica; «Euro» sin tallas tampoco; señales contradictorias, a revisar.
    expect(r.tipos).toEqual(['otro', 'otro', 'otro', 'calzado', 'calzado', 'revisar', 'revisar', 'calzado', 'revisar']);
    expect(r.venta).toMatchObject({ ventaSugerida: 134900, mensaje: 'NIKE WINFLO 12\nTallas: (Euro 40 al 43)\nPRECIO $95.000' });
  });

  test('lector común: la condición de un precio («POR CAJA», «X MAYOR») no es modelo; el modelo en la línea del precio sí', async ({ page }) => {
    const r = await page.evaluate(() => ['HUGO BOSS\nTallas: (EURO 40 al 43) DISPONIBLE\nPRECIO $95.000\nDISPONIBLE POR CAJA $85.000', 'Hugo Boss\nPrecio x mayor $65.000', 'Nike\nAir Max 90 $250.000']
      .map((t) => { const x = window.GamaTallaTextoProveedor.analizar(t); return [x.marca, x.modelo, x.precio, x.precios]; }));
    expect(r).toEqual([['Hugo Boss', '', null, [95000, 85000]], ['Hugo Boss', '', 65000, [65000]], ['Nike', 'Air Max 90', 250000, [250000]]]);
  });

  test('un PDF escaneado (solo imágenes de página completa) se explica; un archivo que no es PDF, también', async ({ page }) => {
    const escaneado = crearPdf({ paginas: [{ portada: { fotos: [] } }] });
    const r = await page.evaluate(async (b64) => {
      const P = window.GamaTallaCatalogoPdf;
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
      const leido = await P.leerDocumento(bytes, { idDoc: 'dx' });
      let error = '';
      try { await P.leerDocumento(new TextEncoder().encode('no es un pdf').buffer, { idDoc: 'dy' }); } catch (e) { error = e.message; }
      return { tarjetas: leido.tarjetas.length, aviso: leido.aviso, error };
    }, escaneado.toString('base64'));
    expect(r.tarjetas).toBe(0);
    expect(r.aviso).toMatch(/No encontramos tarjetas de producto|escaneado/);
    expect(r.error).toBe('No es un PDF válido o está dañado.');
  });
});

// ======================================================================== importador (Supabase LOCAL)
test.describe('importador: catálogo PDF', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(240000);
  let admin; let rutas;
  test.beforeAll(async ({}, info) => {
    entorno();
    await limpiar21();
    admin = await crearUsuario(`panel21-pdf-${info.project.name}-${Date.now().toString(36)}@gamaytalla.test`);
    await hacerAdmin(admin.id);
    rutas = prepararPdfs21();
  });
  test.afterAll(async () => {
    await limpiar21().catch(() => null);
    if (admin) { await quitarAdmin(admin.id).catch(() => null); await borrarUsuario(admin.id); }
  });
  test.afterEach(async () => { await limpiar21(); });

  const papel = (page, nombre) => seccionPdf(page).locator('.importador-pdf-doc').filter({ hasText: nombre }).getByRole('group', { name: /^Papel de este documento/ });
  const resumen = (page) => seccionPdf(page).locator('#imp-pdf-resumen');
  const colores = (f) => f.locator('.importador-color');

  test('revisión: papeles, vistas, precios con condiciones, infantil, ambigua y asociaciones; añadir y guardar', async ({ page, browserName }) => {
    const problemas = await entrarAlPanel(page, admin);
    await abrirImportador(page);
    await abrirPdf(page);
    // Elegidos en cualquier orden: el papel sale del contenido.
    await subirPdfs(page, [rutas.descripciones, rutas.precios, rutas.venta]);
    await expect(papel(page, 'catalogo-a.pdf').getByRole('radio', { name: 'Descripciones, fotografías y precios de venta sugeridos' })).toBeChecked();
    await expect(papel(page, 'catalogo-b.pdf').getByRole('radio', { name: 'Precios del proveedor' })).toBeChecked();
    await expect(papel(page, 'catalogo-c.pdf').getByRole('radio', { name: 'Descripciones y fotografías', exact: true })).toBeChecked();
    await expect(seccionPdf(page).locator('.importador-pdf-doc').filter({ hasText: 'catalogo-a.pdf' })).toContainText('Sin tarjetas de producto: página 1 (portada o collage');
    await expect(seccionPdf(page).locator('.importador-pdf-doc').filter({ hasText: 'catalogo-a.pdf' })).toContainText('Nota del documento: «Precios sujetos a disponibilidad de tallas».');
    // Contadores distintos: tarjetas, fichas, colores y fotografías.
    await expect(resumen(page)).toHaveText('10 tarjetas en «catalogo-a.pdf» · 8 de calzado · 2 de otros artículos · 0 por clasificar · 4 con dudas. Se añadirán 7 fichas con 7 colores y 7 fotografías.');
    await expect(seccionPdf(page).locator('.importador-pdf-tarjeta')).toHaveCount(8); // vista «Calzado»
    await seccionPdf(page).getByRole('button', { name: 'Excluidos (2)' }).click();
    await expect(seccionPdf(page).locator('.importador-pdf-tarjeta')).toHaveCount(2);
    await expect(tarjetaPdf(page, 7)).toContainText('Otro artículo: «reloj».');
    await expect(tarjetaPdf(page, 7).getByRole('checkbox', { name: 'Añadir al lote' })).not.toBeChecked();
    // Ambigua: la foto de las camisetas está en dos tarjetas de precios; se ve y se elige (o ninguna).
    const ambigua = tarjetaPdf(page, 4).getByRole('group', { name: /varias tarjetas tienen una foto igual/ });
    await expect(ambigua.getByRole('radio')).toHaveCount(3);
    await expect(tarjetaPdf(page, 4)).toContainText('Coste del proveedor: pendiente (sin tarjeta correspondiente en los precios).');
    await seccionPdf(page).getByRole('button', { name: 'Dudosos (4)' }).click();
    await expect(seccionPdf(page).locator('.importador-pdf-tarjeta')).toHaveCount(4);
    // Coste con dos importes y su condición: nada se elige solo.
    await expect(tarjetaPdf(page, 2)).toContainText('Coste del proveedor: revisar, $ 95.000 (precio) o $ 85.000 (disponible por caja), condicionado');
    await expect(tarjetaPdf(page, 2)).toContainText('Venta sugerida: $ 134.900');
    // Infantil: se conserva, se explica la incompatibilidad y no se añade por omisión.
    await expect(tarjetaPdf(page, 6)).toContainText('Calzado infantil (EU 28 a 35): el catálogo actual solo tiene públicos Hombre, Dama y Unisex y tallas EU 30–50.');
    await expect(tarjetaPdf(page, 6).getByRole('checkbox', { name: 'Añadir al lote' })).not.toBeChecked();
    await verTodas(page);
    // Foto recodificada (parecida, no idéntica): propuesta sin usar hasta confirmarla, con las dos fotos a la vista.
    const aprox = tarjetaPdf(page, 1).getByRole('group', { name: 'Correspondencia aproximada en catalogo-b.pdf' });
    await expect(aprox.locator('img.importador-pdf-miniatura')).toHaveCount(2);
    await expect(tarjetaPdf(page, 1)).toContainText('Coste del proveedor: pendiente hasta que confirmes la correspondencia con «catalogo-b.pdf» (foto parecida, no idéntica).');
    await expect(tarjetaPdf(page, 1)).toContainText('propuesta sin confirmar: no se usa');
    // Las exactas e inequívocas se usan solas.
    await expect(tarjetaPdf(page, 3)).toContainText('Coste del proveedor: $ 125.000 · Precios del proveedor');
    await expect(tarjetaPdf(page, 3)).toContainText('catalogo-b.pdf: página 4, tarjeta 2 · misma foto.');
    await aprox.getByRole('button', { name: 'Sí, es la misma' }).click();
    await expect(tarjetaPdf(page, 1)).toContainText('Coste del proveedor: $ 95.000 (precio)');
    await expect(tarjetaPdf(page, 1)).toContainText('confirmada a mano (foto parecida)');
    await expect(tarjetaPdf(page, 3)).toContainText('Modelo: pendiente');
    await expect(tarjetaPdf(page, 5)).toContainText('Tallas: 36 a 39 (por la regla del perfil)');
    await expect(tarjetaPdf(page, 8)).toContainText('Tallas: 36 a 40');
    // Asociaciones: la 9 es otra foto del mismo color que la 1; la 10, otro color de la 8.
    await tarjetaPdf(page, 9).getByRole('radio', { name: 'Otra fotografía del mismo color que la tarjeta…' }).check();
    await expect(tarjetaPdf(page, 9).getByRole('textbox', { name: /^Número de la tarjeta/ })).toHaveValue('8'); // propone la anterior incluida
    await tarjetaPdf(page, 9).getByRole('textbox', { name: /^Número de la tarjeta/ }).fill('1');
    await tarjetaPdf(page, 10).getByRole('radio', { name: 'Otro color de la misma zapatilla que la tarjeta…' }).check();
    await tarjetaPdf(page, 10).getByRole('textbox', { name: /^Número de la tarjeta/ }).fill('8');
    await expect(resumen(page)).toContainText('Se añadirán 5 fichas con 6 colores y 7 fotografías.');
    // Un destino no incluido se explica.
    await tarjetaPdf(page, 10).getByRole('textbox', { name: /^Número de la tarjeta/ }).fill('7');
    await expect(tarjetaPdf(page, 10).locator('.campo-error')).toHaveText('La tarjeta 7 no está marcada para añadir: márcala o elige otra.');
    await tarjetaPdf(page, 10).getByRole('textbox', { name: /^Número de la tarjeta/ }).fill('8');
    await expect(resumen(page)).toContainText('Se añadirán 5 fichas con 6 colores y 7 fotografías.');
    // Corregir la clasificación a mano: el reloj pasa a «Por revisar» y sigue sin añadirse.
    await tarjetaPdf(page, 7).getByRole('radio', { name: 'Por revisar' }).check();
    await expect(tarjetaPdf(page, 7)).toContainText('Corregida a mano.');
    await capturar(page, problemas, browserName, `pdf-revision-${browserName}-1280.png`);
    // Revisar no escribe nada en Supabase.
    expect(await productos21()).toEqual([]);

    await seccionPdf(page).getByRole('button', { name: /^Añadir al lote \(5 fichas\)/ }).click();
    await expect(fichas(page)).toHaveCount(5);
    // Doble clic o repetir: lo añadido no se vuelve a añadir.
    await expect(seccionPdf(page).getByRole('button', { name: /^Añadir al lote/ })).toHaveAttribute('aria-disabled', 'true');
    await expect(tarjetaPdf(page, 1)).toContainText('Añadida a la ficha 1');
    const winflo = ficha(page, 0);
    await expect(winflo.getByRole('textbox', { name: /^Modelo/ })).toHaveValue('WINFLO P21');
    await expect(winflo.getByLabel(/^Precio del proveedor/)).toHaveValue('95000');
    await expect(winflo.getByLabel(/^Precio de venta/)).toHaveValue('134900');
    await expect(winflo).toContainText('Venta sugerida del catálogo PDF: $ 134.900 (Precios sujetos a disponibilidad de tallas). Adoptada tal cual.');
    await expect(winflo.locator('.importador-procedencia')).toContainText('Catálogo PDF: catalogo-a.pdf, página 2 (tarjeta 1) · catalogo-c.pdf, página 2 (tarjeta 1) · catalogo-b.pdf, página 4 (tarjeta 4)');
    await expect(winflo.locator('.editor-foto')).toHaveCount(2, { timeout: 60000 }); // la 9 es otra foto de este color
    const boss = ficha(page, 1);
    await expect(boss.getByLabel(/^Precio del proveedor/)).toHaveValue('');
    await expect(boss.getByRole('group', { name: /^Precios del mensaje/ })).toContainText('$ 85.000 · disponible por caja (condicionado)');
    await expect(boss.getByRole('group', { name: /^Precios del mensaje/ })).toContainText('$ 95.000 · precio');
    await expect(boss.getByRole('textbox', { name: /^Modelo/ })).toHaveValue('EVO P21');
    await expect(boss.getByRole('combobox', { name: /^Marca/ })).toHaveValue('HUGO BOSS');
    const hugo = ficha(page, 2);
    await expect(hugo.getByRole('textbox', { name: /^Modelo/ })).toHaveValue('');
    await expect(hugo.getByLabel(/^Precio del proveedor/)).toHaveValue('125000');
    await expect(hugo.getByLabel(/^Precio de venta/)).toHaveValue('174900');
    const samba = ficha(page, 4);
    await expect(colores(samba)).toHaveCount(2);
    await expect(colores(samba).nth(1).getByRole('textbox', { name: /^Color \(obligatorio\)/ })).toHaveValue('VINOTINTO BLANCO');
    await expect(colores(samba).nth(0).getByLabel(/^Tallas EU/)).toHaveValue('36; 37; 38; 39; 40');
    // «Ajustes para varias fichas»: el importe no se suma a un precio adoptado del PDF.
    await importador(page).locator('#imp-ajustes > summary').click();
    await importador(page).getByLabel(/^Sumar al precio del proveedor/).fill('40000');
    await importador(page).getByRole('button', { name: /^Aplicar ajustes a/ }).click();
    await expect(importador(page).locator('.importador-ajustes-estado')).toContainText('precios de venta sugeridos del PDF se conservaron tal cual: no se les suma el importe.');
    await expect(winflo.getByLabel(/^Precio de venta/)).toHaveValue('134900');
    // Releer el texto no cambia el precio adoptado.
    const texto = colores(winflo).nth(0).getByLabel('Texto preparado desde el catálogo PDF');
    await texto.fill(`${await texto.inputValue()}\n`);
    await expect(winflo.getByLabel(/^Precio de venta/)).toHaveValue('134900');

    // Guardar solo el Winflo (como oculto): el coste no viaja; el precio guardado es el elegido.
    for (const i of [1, 2, 3, 4]) await ficha(page, i).getByRole('checkbox', { name: /^Incluir en el guardado/ }).uncheck();
    await radioPublico(winflo, 'Hombre').check();
    await colores(winflo).nth(0).getByRole('textbox', { name: /^Color \(obligatorio\)/ }).fill('NEGRO');
    await elegirCategoria(winflo, 'RUNNING');
    await importador(page).getByRole('button', { name: /^Guardar lote como oculto/ }).click();
    await expect(winflo).toContainText('Guardada oculta', { timeout: 60000 });
    const [guardado] = await productos21();
    expect(guardado).toMatchObject({ nombre: 'WINFLO P21', marca: 'NIKE', publico: 'hombre', activo: false });
    expect(guardado.variantes[0].precio).toBe(134900);
    expect(guardado.variantes[0].fotos).toHaveLength(2);
    expect(JSON.stringify(guardado)).not.toMatch(/95000|95\.000/);
    expect(problemas).toEqual([]);
  });

  test('borrador: documentos, fotos, decisiones y precios se recuperan al recargar; un PDF repetido no se vuelve a leer', async ({ page, browserName }) => {
    const problemas = await entrarAlPanel(page, admin);
    await abrirImportador(page);
    await abrirPdf(page);
    await subirPdfs(page, [rutas.venta, rutas.precios]);
    await verTodas(page);
    await tarjetaPdf(page, 4).getByRole('group', { name: /varias tarjetas/ }).getByRole('radio').first().click();
    await tarjetaPdf(page, 6).getByRole('checkbox', { name: 'Añadir al lote' }).check();
    await tarjetaPdf(page, 9).getByRole('radio', { name: 'Otra fotografía del mismo color que la tarjeta…' }).check();
    await tarjetaPdf(page, 9).getByRole('textbox', { name: /^Número de la tarjeta/ }).fill('1');
    await tarjetaPdf(page, 1).getByRole('button', { name: 'No corresponde' }).click();
    await expect(tarjetaPdf(page, 1)).toContainText('catalogo-b.pdf: ninguna (elegido a mano).');
    await seccionPdf(page).getByRole('radio', { name: /^Calcularlo después/ }).check();
    await esperarGuardadoLocal(page);
    await recargar(page, problemas, browserName);
    await abrirImportador(page);
    await expect(importador(page).locator('#imp-borradores')).toContainText('Pendiente: una importación de catálogo PDF (2 documentos)');
    await importador(page).getByRole('button', { name: /^Continuar el borrador/ }).click();
    await expect(seccionPdf(page)).toBeVisible();
    await expect(seccionPdf(page).locator('.importador-pdf-doc')).toHaveCount(2);
    await expect(seccionPdf(page).getByRole('radio', { name: /^Calcularlo después/ })).toBeChecked();
    await expect(seccionPdf(page).getByRole('button', { name: /^Todas/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(tarjetaPdf(page, 4)).toContainText('elegida a mano');
    await expect(tarjetaPdf(page, 4)).toContainText('Coste del proveedor: $ 60.000 (precio x mayor), condicionado');
    await expect(tarjetaPdf(page, 6).getByRole('checkbox', { name: 'Añadir al lote' })).toBeChecked();
    await expect(tarjetaPdf(page, 9).getByRole('textbox', { name: /^Número de la tarjeta/ })).toHaveValue('1');
    await expect(tarjetaPdf(page, 1)).toContainText('catalogo-b.pdf: ninguna (elegido a mano).');
    await expect(tarjetaPdf(page, 1)).toContainText('Coste del proveedor: pendiente (sin tarjeta correspondiente en los precios).');
    // Las fotos se recuperan del borrador.
    const img = tarjetaPdf(page, 1).locator('img.importador-pdf-miniatura');
    await expect(img).toBeVisible();
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((n) => /** @type {HTMLImageElement} */ (n).naturalWidth)).toBe(420);
    // El mismo PDF otra vez (reintento o doble clic): se detecta por su contenido.
    await seccionPdf(page).locator('#imp-pdf-archivo').setInputFiles([rutas.venta]);
    await expect(seccionPdf(page).locator('#imp-pdf-aviso')).toContainText('«catalogo-a.pdf» ya está en esta importación: no se vuelve a leer.');
    await expect(seccionPdf(page).locator('.importador-pdf-doc')).toHaveCount(2);
    // Añadir: con «Calcularlo después», el precio de venta queda por calcular (no se adopta el sugerido).
    await seccionPdf(page).getByRole('button', { name: /^Añadir al lote/ }).click();
    await expect(fichas(page)).toHaveCount(7);
    await expect(ficha(page, 0).getByLabel(/^Precio de venta/)).toHaveValue('');
    await expect(ficha(page, 0).getByLabel(/^Precio del proveedor/)).toHaveValue(''); // rechazada: no aporta coste
    await expect(ficha(page, 0).getByRole('button', { name: 'Usar el precio sugerido ($ 134.900)' })).toBeVisible();
    // Infantil añadido a mano: tallas 28–35 conservadas y la incompatibilidad a la vista.
    const nino = fichas(page).filter({ hasText: 'METCON P21' });
    await expect(nino.getByLabel(/^Tallas EU/)).toHaveValue('28; 29; 30; 31; 32; 33; 34; 35');
    await expect(nino.locator('.importador-pdf-incompatible')).toContainText('Calzado infantil');
    await expect(nino.locator('.campo-error').filter({ hasText: 'fuera de las tallas EU habituales' })).toBeVisible();
    await esperarGuardadoLocal(page);
    await recargar(page, problemas, browserName);
    await abrirImportador(page);
    await importador(page).getByRole('button', { name: /^Continuar el borrador/ }).click();
    await expect(fichas(page)).toHaveCount(7);
    await expect(ficha(page, 0).locator('.editor-foto')).toHaveCount(2);
    await expect(tarjetaPdf(page, 1)).toContainText('Añadida a la ficha 1');
    expect(await productos21()).toEqual([]);
    // Cerrar la importación: lo añadido se queda en el lote.
    await seccionPdf(page).getByRole('button', { name: 'Cerrar la importación' }).click();
    await seccionPdf(page).locator('#imp-pdf-cerrar-confirmar').getByRole('button', { name: 'Cerrar la importación' }).click();
    await expect(seccionPdf(page)).toHaveCount(0);
    await expect(fichas(page)).toHaveCount(7);
    expect(problemas).toEqual([]);
  });

  test('fechas distintas: los costes no se usan hasta confirmarlo; celular sin desbordes', async ({ page, browserName }) => {
    const otra = prepararPdfs21({ fechaPrecios: 'Martes 24 de Noviembre de 2026' });
    const problemas = await entrarAlPanel(page, admin);
    await page.setViewportSize({ width: 390, height: 844 });
    await abrirImportador(page);
    await abrirPdf(page);
    await subirPdfs(page, [otra.venta, otra.precios]);
    await expect(seccionPdf(page).locator('.importador-pdf-fechas')).toContainText('Los documentos son de fechas distintas: «catalogo-a.pdf» del 23 de noviembre de 2026 y «catalogo-b-otra-fecha.pdf» del 24 de noviembre de 2026.');
    await expect(tarjetaPdf(page, 3)).toContainText('Coste del proveedor: pendiente (sin tarjeta correspondiente en los precios).');
    await expect(tarjetaPdf(page, 3)).toContainText('Pendiente: el documento es de otra fecha.');
    await seccionPdf(page).getByRole('checkbox', { name: 'Confirmo que corresponden a la misma edición del catálogo' }).check();
    await expect(tarjetaPdf(page, 3)).toContainText('Coste del proveedor: $ 125.000');
    // La aproximada sigue pidiendo su propia confirmación aunque la fecha ya esté confirmada.
    await expect(tarjetaPdf(page, 1)).toContainText('Coste del proveedor: pendiente hasta que confirmes la correspondencia');
    const d = await revisarDisposicion(page);
    expect(d.desborde).toBe(0);
    expect(d.fuera).toBe(0);
    await capturar(page, problemas, browserName, `pdf-revision-${browserName}-390.png`);
    expect(problemas).toEqual([]);
  });

  test('lectura larga: avance y cancelación sin añadir nada de ese documento', async ({ page }) => {
    const grande = crearPdf({ paginas: Array.from({ length: 40 }, (_, n) => ({ tarjetas: Array.from({ length: 4 }, (_, i) => ({ foto: 500 + n * 4 + i, lineas: [`NIKE PRUEBA ${n}-${i} P21`, 'EU 40 AL 44'], destacado: '$100.000' })) })) });
    const ruta = `${CAPTURAS21}-grande.pdf`;
    fs.writeFileSync(ruta, grande);
    const problemas = await entrarAlPanel(page, admin);
    await abrirImportador(page);
    await abrirPdf(page);
    await seccionPdf(page).locator('#imp-pdf-archivo').setInputFiles([ruta]);
    await expect(seccionPdf(page).locator('#imp-pdf-avance')).toContainText(/Leyendo «.*grande\.pdf»: página \d+ de 40\./);
    await seccionPdf(page).getByRole('button', { name: 'Cancelar la lectura' }).click();
    await expect(seccionPdf(page).locator('#imp-pdf-aviso')).toContainText('cancelada: no se añadió nada de ese documento.');
    await expect(seccionPdf(page).locator('.importador-pdf-doc')).toHaveCount(0);
    fs.rmSync(ruta, { force: true });
    expect(problemas).toEqual([]);
  });
});
