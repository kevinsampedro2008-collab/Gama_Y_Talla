// @ts-check
/* Etapa 20 · Perfiles de proveedor en el lector (admin/texto-proveedor.js), sin servidor.
 *
 *  - El Perfil general da exactamente lo mismo que el lector anterior (sin perfil).
 *  - Dos proveedores con reglas distintas leen el mismo tipo de mensaje de forma distinta.
 *  - Prioridad: tallas explícitas del mensaje > rango del perfil > rango general.
 *  - Alias por palabras completas y la coincidencia más específica; se conservan las protecciones de
 *    ON, Vans Slip On, Air Max 90 y Club C 85.
 *  - Reglas declarativas: una expresión con signos de expresiones regulares se toma literal.
 *  - Validación: rangos, públicos y nombres no válidos se rechazan con su motivo.
 *
 *   npx playwright test tests/etapa20/perfiles-lector.spec.js
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';

const LECTOR = path.resolve(__dirname, '..', '..', 'admin', 'texto-proveedor.js');
const T36_39 = ['36', '37', '38', '39'];
const T36_44 = ['36', '37', '38', '39', '40', '41', '42', '43', '44'];

test.beforeEach(async ({ page }) => {
  await page.goto('about:blank');
  await page.addScriptTag({ path: LECTOR });
});

const PERFIL_A = { id: 'prov-a', nombre: 'Proveedor A', marcas: [{ alias: 'NB', marca: 'New Balance' }, { alias: 'Air', marca: 'Nike' }],
  publico: [], numeracion: [{ expresion: 'dama', publico: 'dama' }, { expresion: 'hombre', publico: 'hombre' }, { expresion: 'niña', publico: 'dama' }],
  rangos: { dama: { desde: 35, hasta: 40 }, hombre: null, unisex: null }, categoria: 'running', promociones: ['envío gratis', 'precio de locura (hoy)*'] };
const PERFIL_B = { id: 'prov-b', nombre: 'Proveedor B', marcas: [], publico: [{ expresion: 'chicas', publico: 'dama' }, { expresion: 'para todos', publico: 'unisex' }],
  numeracion: [{ expresion: 'mujer', publico: 'dama' }], rangos: { dama: { desde: 37, hasta: 39 }, hombre: { desde: 38, hasta: 45 }, unisex: null }, categoria: '', promociones: [] };

/** @param {import('@playwright/test').Page} page @param {string[]} textos @param {object|null} perfil */
const leer = (page, textos, perfil = null) => page.evaluate(([lista, p]) => {
  const T = window.GamaTallaTextoProveedor;
  const normal = p ? T.normalizarPerfil(p) : null;
  if (normal && !normal.perfil) throw new Error(JSON.stringify(normal.errores));
  return lista.map((t) => {
    const r = T.analizar(t, { perfil: normal?.perfil || null });
    return { marca: r.marca, modelo: r.modelo, publico: r.publico, precio: r.precio, tallas: r.tallas, revisar: r.revisar, notas: r.notas, reglas: r.reglas, omitido: r.omitido, perfil: r.perfil };
  });
}, [textos, perfil]);

const MENSAJES = [
  'REEBOK PRINCENSA 💰$105.000 DAMA 👸 Y CABALLERO 🤴 TODAS LAS TALLAS🔥\n\nDinos y te ayudamos sin falta\n👉 +57 3000000000',
  'NIKE 7 CAMARAS⚠️NUMERACION DAMA💥$125.000\n📦📦DISPONIBLE $115.000\n\n🤝 Aparta la tuya pues 👉🏼 +57 3000000000',
  '🌟ON CLOUD REMIX🌟\n💸$115.000💸\nEUR 36 AL 44\n\n🛒 Mándanos tu pedido: +57 3000000000',
  'RECARGA 🔥🔥\nNew Balance 603 🇺🇸\nHombre $115.000 🔥\n40 al 44 Euro ✅\nTe atiendo por aquí hoy +57 300 000 0000',
  'Vans Slip On $90.000 40 al 42', 'Nike Air Max 90 $300.000 40 al 42', 'Reebok Club C 85 40-42-44 $80.000', 'NIKE 7 CAMARAS numeración dama y caballero $125.000'
];

test('Perfil general = lector anterior: mismos resultados en los mensajes de referencia', async ({ page }) => {
  const sin = await leer(page, MENSAJES);
  const general = await page.evaluate((lista) => lista.map((t) => {
    const r = window.GamaTallaTextoProveedor.analizar(t, { perfil: window.GamaTallaTextoProveedor.PERFIL_GENERAL });
    return { marca: r.marca, modelo: r.modelo, publico: r.publico, precio: r.precio, tallas: r.tallas, revisar: r.revisar, notas: r.notas, reglas: r.reglas, omitido: r.omitido, perfil: r.perfil };
  }), MENSAJES);
  expect(general).toEqual(sin);
  expect(sin[0]).toMatchObject({ marca: 'Reebok', modelo: 'PRINCENSA', publico: 'unisex', tallas: T36_44 });
  expect(sin[1]).toMatchObject({ marca: 'Nike', modelo: '7 CAMARAS', publico: 'dama', tallas: T36_39 });
  expect(sin[2]).toMatchObject({ marca: 'On', modelo: 'CLOUD REMIX', tallas: T36_44 });
  expect(sin[3]).toMatchObject({ marca: 'New Balance', modelo: '603', publico: 'hombre', tallas: ['40', '41', '42', '43', '44'] });
  expect(sin[4]).toMatchObject({ marca: 'Vans', modelo: 'Slip On' });
  expect(sin[5]).toMatchObject({ marca: 'Nike', modelo: 'Air Max 90', tallas: ['40', '41', '42'] });
  expect(sin[6]).toMatchObject({ marca: 'Reebok', modelo: 'Club C 85', tallas: ['40', '42', '44'] });
  expect(sin[7]).toMatchObject({ publico: 'unisex', tallas: T36_44 });
  // La tabla del general sigue siendo la de antes y está congelada.
  const r = await page.evaluate(() => { const T = window.GamaTallaTextoProveedor; return { rangos: T.PERFIL_GENERAL.rangos, congelado: Object.isFrozen(T.PERFIL_GENERAL), dama: T.tallasPorRegla('dama'), unisex: T.tallasPorRegla('unisex') }; });
  expect(r).toEqual({ rangos: { dama: { desde: 36, hasta: 39 }, hombre: { desde: 36, hasta: 44 }, unisex: { desde: 36, hasta: 44 } }, congelado: true, dama: T36_39, unisex: T36_44 });
});

test('dos proveedores con reglas distintas: alias, público, numeración, rangos y frases omitidas', async ({ page }) => {
  const textos = ['NB 9060 numeración niña $300.000 envío gratis', 'NB 9060 numeración dama $300.000', 'Adidas Samba para chicas todas las tallas $180.000',
    'Puma Suede numeración mujer $90.000', 'Puma Suede todas las tallas hombre $90.000', 'Adidas Gazelle para todos todas las tallas $150.000 PRECIO DE LOCURA (HOY)*'];
  const [a, b] = [await leer(page, textos, PERFIL_A), await leer(page, textos, PERFIL_B)];
  // Proveedor A: «NB» = NEW BALANCE, «numeración niña» = Dama con su rango 35–40 y la frase promocional omitida.
  expect(a[0]).toMatchObject({ marca: 'NEW BALANCE', modelo: '9060', publico: 'dama', tallas: ['35', '36', '37', '38', '39', '40'], perfil: 'prov-a' });
  expect(a[0].reglas).toEqual(['Se omitió «envío gratis» (frase promocional del perfil).', '«NB» = NEW BALANCE (alias de marca, perfil «Proveedor A»).']);
  expect(a[0].notas).toContain('Tallas propuestas por «numeración niña» (Dama: 35 a 40, perfil «Proveedor A»).');
  expect(a[0].omitido.promocional).toBe(1);
  expect(a[1]).toMatchObject({ marca: 'NEW BALANCE', publico: 'dama', tallas: ['35', '36', '37', '38', '39', '40'] });
  // A no tiene «chicas» ni «mujer» en numeración: sin público reconocido, «todas las tallas» pide elegirlo.
  expect(a[2]).toMatchObject({ publico: '', tallas: [] });
  expect(a[2].revisar).toContain('publico');
  expect(a[4]).toMatchObject({ publico: 'hombre', tallas: T36_44 }); // A deja Hombre vacío: rango general (respaldo)
  expect(a[5].omitido.promocional).toBe(1);
  expect(a[5].modelo).toBe('Gazelle para todos');
  // Proveedor B: sin alias (NB no es una marca), «chicas» = Dama (37–39), «numeración mujer», Hombre 38–45.
  expect(b[0]).toMatchObject({ marca: '', publico: '', tallas: [] });
  expect(b[0].revisar).toEqual(expect.arrayContaining(['marca', 'publico']));
  // B no tiene «numeración dama»: «dama» se lee como público (general), pero no se proponen tallas.
  expect(b[1]).toMatchObject({ publico: 'dama', tallas: [] });
  expect(b[1].revisar).toContain('tallas');
  expect(b[2]).toMatchObject({ marca: 'Adidas', modelo: 'Samba', publico: 'dama', tallas: ['37', '38', '39'] });
  expect(b[2].reglas).toEqual(['«chicas» = Dama (público, perfil «Proveedor B»).']);
  expect(b[3]).toMatchObject({ publico: 'dama', tallas: ['37', '38', '39'] });
  expect(b[4]).toMatchObject({ publico: 'hombre', tallas: ['38', '39', '40', '41', '42', '43', '44', '45'] });
  // «para todos» = Unisex (Unisex vacío en B: rango general). B no omite esa frase promocional: queda en el modelo.
  expect(b[5]).toMatchObject({ modelo: 'Gazelle DE LOCURA (HOY)', publico: 'unisex', tallas: T36_44 });
  expect(b[5].omitido.promocional).toBe(0);
});

test('prioridad: tallas explícitas del mensaje sobre el rango del perfil; sin información, «Revisar»', async ({ page }) => {
  const [explicitas, rango, nada] = await leer(page, ['NB 9060 numeración dama: 37; 38 $300.000', 'NB 9060 numeración dama 36 al 38 $300.000', 'NB 9060 $300.000'], PERFIL_A);
  expect(explicitas).toMatchObject({ publico: 'dama', tallas: ['37', '38'] });
  expect(rango).toMatchObject({ publico: 'dama', tallas: ['36', '37', '38'] });
  expect(nada).toMatchObject({ publico: '', tallas: [] });
  expect(nada.revisar).toEqual(expect.arrayContaining(['publico', 'tallas', 'color']));
});

test('alias por palabras completas y la coincidencia más específica; protecciones de ON, Slip On, Air Max 90 y Club C 85', async ({ page }) => {
  const perfil = { ...PERFIL_A, marcas: [{ alias: 'NB', marca: 'New Balance' }, { alias: 'Air', marca: 'Nike' }, { alias: 'ON', marca: 'ON RUNNING' }, { alias: 'Club', marca: 'Reebok' }] };
  const r = await leer(page, ['NBA Jam $90.000 40 al 42', 'Vans Slip On $90.000 40 al 42', 'Nike Air Max 90 $300.000 40 al 42', 'Reebok Club C 85 40-42-44 $80.000',
    'On Cloud 5 $300.000 40 al 42', 'Airwalk Classic $90.000 40 al 42', 'Onitsuka Tiger Mexico 66 $200.000 40 al 42', 'New Balance 9060 $300.000 40 al 42'], perfil);
  expect(r[0].marca).toBe('');                 // «NB» no está dentro de «NBA»
  expect(r[1]).toMatchObject({ marca: 'Vans', modelo: 'Slip On' });          // «On» corta: solo al principio
  expect(r[2]).toMatchObject({ marca: 'Nike', modelo: 'Air Max 90', tallas: ['40', '41', '42'] }); // la marca completa gana al alias
  expect(r[3]).toMatchObject({ marca: 'Reebok', modelo: 'Club C 85', tallas: ['40', '42', '44'] });
  expect(r[4]).toMatchObject({ marca: 'ON RUNNING', modelo: 'Cloud 5' });     // el alias del perfil, delante de la marca base
  expect(r[5].marca).toBe('');                 // «Air» no está dentro de «Airwalk»
  expect(r[6]).toMatchObject({ marca: 'Onitsuka Tiger', modelo: 'Mexico 66' });
  expect(r[7]).toMatchObject({ marca: 'New Balance', modelo: '9060' });
});

test('reglas declarativas: signos de expresiones regulares literales; validación con su motivo', async ({ page }) => {
  const r = await page.evaluate(() => {
    const T = window.GamaTallaTextoProveedor;
    // Con signos de expresiones regulares: se comparan como texto literal (y una frase sin letras, como «.*», no se admite).
    const raro = T.normalizarPerfil({ id: 'raro', nombre: 'Raro', promociones: ['oferta.*', '(promo|x)+', 'oferta [hoy]'], publico: [{ expresion: '\\d+ chicas', publico: 'dama' }] });
    const texto = 'Adidas Samba oferta [hoy] $180.000 40 al 42\n42 chicas';
    const leido = T.analizar(texto, { perfil: raro.perfil });
    const sinLetras = T.normalizarPerfil({ id: 'x', nombre: 'X', promociones: ['.*'] }).errores.map((e) => e.mensaje);
    const malos = T.normalizarPerfil({ id: 'malo', nombre: 'Perfil general', marcas: [{ alias: '12', marca: 'X' }], publico: [{ expresion: 'chicas', publico: 'niños' }],
      rangos: { dama: { desde: 20, hasta: 60 }, hombre: { desde: 44, hasta: 40 }, unisex: { desde: 30, hasta: 50 } }, promociones: ['ok'] });
    const repetido = T.normalizarPerfil({ id: 'rep', nombre: 'Rep', marcas: [{ alias: 'NB', marca: 'A' }, { alias: 'nb', marca: 'B' }] });
    return { errores: raro.errores, modelo: leido.modelo, publico: leido.publico, promo: leido.omitido.promocional, sinLetras,
      malos: malos.errores.map((e) => e.campo), repetido: repetido.errores.map((e) => e.mensaje) };
  });
  expect(r.errores).toEqual([]);
  expect(r.modelo).toBe('Samba');
  expect(r.promo).toBe(1);
  expect(r.publico).toBe(''); // «\d+ chicas» literal: «42 chicas» no lo es
  expect(r.sinLetras).toEqual(['Frase 1: escribe al menos 3 caracteres con letras.']);
  expect(r.malos).toEqual(['nombre', 'marcas', 'publico', 'rango-dama', 'rango-hombre', 'rango-unisex', 'promociones']);
  expect(r.repetido).toEqual(['Regla 2: «nb» está repetida.']);
});
