// @ts-check
/* Etapa 19 · Regresión del lector de publicaciones: modelo limpio, público combinado y «todas las tallas».
 *
 * Carga admin/texto-proveedor.js en una página vacía (sin servidor, sin Supabase ni datos) y comprueba:
 *  - el mensaje Reebok de la captura (y sus variantes repartidas en líneas) da modelo PRINCENSA, público
 *    Unisex, precio 105000 y tallas 36–44, con el teléfono y la frase de contacto omitidos;
 *  - caballero y dama juntos, en orden inverso, en líneas distintas o con «Unisex» dan «unisex»;
 *  - «todas las tallas» según la regla del proveedor para Dama, Caballero y Unisex; sin público pide
 *    elegirlo; con tallas numéricas usa esas y explica la contradicción;
 *  - los números de modelo (Air Max 90, Club C 85) no se leen como tallas;
 *  - los ejemplos anteriores del lector siguen dando lo mismo.
 * Teléfonos FICTICIOS.
 *
 *   npx playwright test tests/etapa19/lector.spec.js
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';

const LECTOR = path.resolve(__dirname, '..', '..', 'admin', 'texto-proveedor.js');
const TELEFONO = '+57 3000000000';
const CAPTURA = `REEBOK PRINCENSA 💰$105.000 DAMA 👸 Y CABALLERO 🤴 TODAS LAS TALLAS🔥\n\nDinos y te ayudamos sin falta\n👉 ${TELEFONO}`;
const T36_44 = ['36', '37', '38', '39', '40', '41', '42', '43', '44'];
const T36_39 = ['36', '37', '38', '39'];

/** @param {import('@playwright/test').Page} page @param {string[]} textos */
async function analizar(page, textos) {
  return page.evaluate((lista) => lista.map((t) => {
    const r = window.GamaTallaTextoProveedor.analizar(t);
    return {
      marca: r.marca, modelo: r.modelo, publico: r.publico, precio: r.precio, tallas: r.tallas, color: r.color, revisar: r.revisar,
      notas: r.notas, omitido: r.omitido, todasLasTallas: r.todasLasTallas, tallasPorRegla: r.tallasPorRegla, tallasExplicitas: r.tallasExplicitas
    };
  }), textos);
}

test.beforeEach(async ({ page }) => {
  await page.goto('about:blank');
  await page.addScriptTag({ path: LECTOR });
});

test('mensaje Reebok de la captura: PRINCENSA, Unisex, 105000, tallas 36–44; teléfono y contacto omitidos', async ({ page }) => {
  const [r] = await analizar(page, [CAPTURA]);
  expect(r).toMatchObject({ marca: 'Reebok', modelo: 'PRINCENSA', publico: 'unisex', precio: 105000, tallas: T36_44, color: '', tallasPorRegla: true });
  // Solo el color queda por revisar: el mensaje no lo dice.
  expect(r.revisar).toEqual(['color']);
  expect(r.omitido).toMatchObject({ telefonos: 1, contacto: 1 });
  expect(r.notas.join(' ')).toContain('Tallas propuestas por «todas las tallas» (Unisex: 36 a 44).');
  // Nada del teléfono, de la frase de contacto ni de los conectores llega al modelo.
  expect(r.modelo).not.toMatch(/\bY\b|TODAS|LAS|DINOS|AYUDAMOS|3000/i);
});

test('variantes de la captura repartidas en líneas y con otros separadores', async ({ page }) => {
  const variantes = [
    'REEBOK PRINCENSA\n💰$105.000\nDAMA 👸\nY CABALLERO 🤴\nTODAS LAS TALLAS🔥\n\nDinos y te ayudamos sin falta\n👉 +57 3000000000',
    'REEBOK PRINCENSA 💰$105.000\nDAMA 👸 Y CABALLERO 🤴\nTODAS LAS TALLAS🔥\nDinos y te ayudamos sin falta 👉 +57 3000000000',
    'REEBOK PRINCENSA DAMA/CABALLERO Y TODAS LAS TALLAS $105.000',
    '🔥 REEBOK   PRINCENSA 🔥\r\n$ 105.000\r\nPara dama y caballero\r\nTodas las tallas disponibles',
    'REEBOK PRINCENSA\nCABALLERO 🤴\n💰$105.000\nTODAS LAS TALLAS\nDAMA 👸'
  ];
  for (const [i, r] of (await analizar(page, variantes)).entries()) {
    expect(r, variantes[i]).toMatchObject({ marca: 'Reebok', modelo: 'PRINCENSA', publico: 'unisex', precio: 105000, tallas: T36_44 });
    expect(r.revisar, variantes[i]).toEqual(['color']);
  }
});

test('público: caballero y dama juntos, en orden inverso, en líneas distintas, hombre/mujer y «Unisex»', async ({ page }) => {
  const casos = [
    'Reebok Princensa Caballero y Dama $105.000 40 al 42',
    'Reebok Princensa Dama y Caballero $105.000 40 al 42',
    'Reebok Princensa\nCaballero\n$105.000\n40 al 42\nDama',
    'Reebok Princensa\nDama 👸\n$105.000 🔥\n🤴 Caballero\n40 al 42',
    'Reebok Princensa hombre o mujer $105.000 40 al 42',
    'Reebok Princensa Mujer & Hombre $105.000 40 al 42',
    'Reebok Princensa Unisex $105.000 40 al 42',
    'Reebok Princensa UNISEX\n$105.000\n40 al 42'
  ];
  for (const [i, r] of (await analizar(page, casos)).entries()) {
    expect(r, casos[i]).toMatchObject({ marca: 'Reebok', modelo: 'Princensa', publico: 'unisex', precio: 105000, tallas: ['40', '41', '42'] });
    expect(r.revisar, casos[i]).not.toContain('publico');
  }
  // Un solo público sigue siendo ese público.
  const [hombre, dama] = await analizar(page, ['Reebok Princensa para caballero $105.000 40 al 42', 'Reebok Princensa Damas $105.000 36 al 38']);
  expect(hombre).toMatchObject({ modelo: 'Princensa', publico: 'hombre' });
  expect(dama).toMatchObject({ modelo: 'Princensa', publico: 'dama' });
});

test('«todas las tallas» con la regla del proveedor: Dama, Caballero/Hombre y Unisex', async ({ page }) => {
  const [dama, caballero, hombre, unisex, ambos] = await analizar(page, [
    'Reebok Princensa Dama todas las tallas $105.000',
    'Reebok Princensa Caballero todas las tallas $105.000',
    'Reebok Princensa\nHombre\nTodas las tallas\n$105.000',
    'Reebok Princensa Unisex $105.000\nTODAS LAS TALLAS',
    'Reebok Princensa Caballero y Dama todas las tallas $105.000'
  ]);
  expect(dama).toMatchObject({ publico: 'dama', tallas: T36_39, tallasPorRegla: true, modelo: 'Princensa' });
  expect(dama.notas).toContain('Tallas propuestas por «todas las tallas» (Dama: 36 a 39).');
  for (const r of [caballero, hombre]) {
    expect(r).toMatchObject({ publico: 'hombre', tallas: T36_44, tallasPorRegla: true, modelo: 'Princensa' });
    expect(r.notas).toContain('Tallas propuestas por «todas las tallas» (Hombre: 36 a 44).');
  }
  for (const r of [unisex, ambos]) expect(r).toMatchObject({ publico: 'unisex', tallas: T36_44, tallasPorRegla: true, modelo: 'Princensa' });
  for (const r of [dama, caballero, hombre, unisex, ambos]) expect(r.revisar).toEqual(['color']);

  // Las reglas están centralizadas y se pueden consultar.
  const reglas = await page.evaluate(() => {
    const T = window.GamaTallaTextoProveedor;
    return { tabla: T.REGLAS_PROVEEDOR.todasLasTallas, dama: T.tallasPorRegla('dama'), nada: T.tallasPorRegla(''), congelada: Object.isFrozen(T.REGLAS_PROVEEDOR.todasLasTallas.dama) };
  });
  expect(reglas).toEqual({ tabla: { dama: T36_39, hombre: T36_44, unisex: T36_44 }, dama: T36_39, nada: [], congelada: true });
});

test('«todas las tallas» sin público: pide elegirlo y no propone tallas', async ({ page }) => {
  const [r] = await analizar(page, ['Reebok Princensa todas las tallas $105.000\n👉 +57 3000000000']);
  expect(r).toMatchObject({ marca: 'Reebok', modelo: 'Princensa', publico: '', precio: 105000, tallas: [], todasLasTallas: true, tallasPorRegla: false });
  expect([...r.revisar].sort()).toEqual(['color', 'publico', 'tallas']);
  expect(r.notas).toContain('Dice «todas las tallas»: elige el público para proponer las tallas.');
});

test('«todas las tallas» con tallas numéricas: se usan las numéricas y se explica la contradicción', async ({ page }) => {
  const [contradice, coincide, sinPublico, lista] = await analizar(page, [
    'Reebok Princensa Dama todas las tallas 36 al 40 $105.000',
    'Reebok Princensa Dama todas las tallas 36 al 39 $105.000',
    'Reebok Princensa todas las tallas\n38-40 euro\n$105.000',
    'Reebok Princensa Caballero\nTodas las tallas: 40-42-44\n$105.000'
  ]);
  expect(contradice).toMatchObject({ modelo: 'Princensa', publico: 'dama', tallas: ['36', '37', '38', '39', '40'], tallasExplicitas: true, tallasPorRegla: false });
  expect(contradice.revisar).toContain('tallas');
  expect(contradice.notas.join(' ')).toContain('se usaron las concretas (36 a 40); para Dama la regla propone 36 a 39');
  expect(coincide).toMatchObject({ tallas: T36_39, tallasExplicitas: true });
  expect(coincide.revisar).not.toContain('tallas');
  expect(sinPublico).toMatchObject({ publico: '', tallas: ['38', '39', '40'], tallasExplicitas: true });
  expect(sinPublico.revisar).not.toContain('tallas');
  expect(sinPublico.notas.join(' ')).toContain('se usaron las concretas (38 a 40)');
  expect(lista).toMatchObject({ modelo: 'Princensa', publico: 'hombre', tallas: ['40', '42', '44'] });
  expect(lista.revisar).toContain('tallas');
});

test('números de modelo: Air Max 90 y Club C 85 son modelo, no talla', async ({ page }) => {
  const casos = [
    ['Nike Air Max 90 Hombre $180.000 40 al 44', 'Nike', 'Air Max 90', ['40', '41', '42', '43', '44']],
    ['Nike Air Max 90 - 40 al 44 $180.000', 'Nike', 'Air Max 90', ['40', '41', '42', '43', '44']],
    ['Nike Air Max 90\nTallas 38 39 40\n$180.000', 'Nike', 'Air Max 90', ['38', '39', '40']],
    ['Reebok Club C 85 dama y caballero 36-40 euro $90.000', 'Reebok', 'Club C 85', ['36', '37', '38', '39', '40']],
    ['Reebok Club C 85 40-42-44 $90.000', 'Reebok', 'Club C 85', ['40', '42', '44']],
    ['Reebok Club C 85 Caballero todas las tallas $90.000', 'Reebok', 'Club C 85', T36_44],
    ['Nike Air Max 97 para hombre o mujer todas las tallas $150.000', 'Nike', 'Air Max 97', T36_44],
    ['Nike Air Max 90\nHombre $180.000', 'Nike', 'Air Max 90', []]
  ];
  const leidos = await analizar(page, casos.map(([t]) => t));
  leidos.forEach((r, i) => {
    const [t, marca, modelo, tallas] = casos[i];
    expect(r.marca, t).toBe(marca);
    expect(r.modelo, t).toBe(modelo);
    expect(r.tallas, t).toEqual(tallas);
  });
});

test('ejemplos anteriores del lector: mismos resultados', async ({ page }) => {
  const [n603, n1080, reebok, repartido, delante] = await analizar(page, [
    `RECARGA 🔥🔥\nNew Balance 603 🇺🇸\nHombre $115.000 🔥\n40 al 44 Euro ✅\nTe atiendo por aquí hoy +57 300 000 0000`,
    'RECARGA 🔥🔥\nNew Balance 1080 🇺🇸\nDama $125.000 🌸\n36 al 39 Euro ✅',
    'Reebok Club C Bulc🔥tallas 40-41-42-43-44 euro $80.000\n\nEstamos atentos de una 👉 +57 3000000000',
    'Reebok   Club C Bulc 🔥\n\ntallas 40-41-42-43-44 euro\r\n$80.000\n\nEstamos atentos de una 👉\n+57 3000000000',
    'Reebok Club C Bulc tallas 40-42-44 $80.000 Escríbeme al +57 300 000 0000'
  ]);
  expect(n603).toMatchObject({ marca: 'New Balance', modelo: '603', publico: 'hombre', precio: 115000, tallas: ['40', '41', '42', '43', '44'], revisar: ['color'] });
  expect(n1080).toMatchObject({ marca: 'New Balance', modelo: '1080', publico: 'dama', precio: 125000, tallas: T36_39, revisar: ['color'] });
  for (const r of [reebok, repartido]) {
    expect(r).toMatchObject({ marca: 'Reebok', modelo: 'Club C Bulc', precio: 80000, tallas: ['40', '41', '42', '43', '44'], publico: '' });
    expect([...r.revisar].sort()).toEqual(['color', 'publico']);
  }
  // «Estamos atentos de una» en su propia línea es una frase de contacto: se omite.
  expect(repartido.omitido).toMatchObject({ telefonos: 1, contacto: 1 });
  expect(delante).toMatchObject({ modelo: 'Club C Bulc', tallas: ['40', '42', '44'] });
});

// ---------------------------------------------------------------- ajustes: «numeración» y varios precios
const NIKE_DAMA = 'NIKE 7 CAMARAS⚠️NUMERACION DAMA💥$125.000\n📦📦DISPONIBLE $115.000\n\n🤝 Aparta la tuya pues 👉🏼 +57 3000000000';
const NIKE_HOMBRE = 'NIKE 7 CAMARAS⚠️NUMERACION HOMBRE💥$125.000\n📦📦DISPONIBLE $115.000\n\n😍 Aprovecha y pídela → +57 3000000000';

test('mensajes Nike 7 CAMARAS: numeración dama y hombre, dos precios, teléfono y contacto omitidos', async ({ page }) => {
  const [dama, hombre] = await analizar(page, [NIKE_DAMA, NIKE_HOMBRE]);
  expect(dama).toMatchObject({ marca: 'Nike', modelo: '7 CAMARAS', publico: 'dama', precio: null, tallas: T36_39, tallasPorRegla: true });
  expect(hombre).toMatchObject({ marca: 'Nike', modelo: '7 CAMARAS', publico: 'hombre', precio: null, tallas: T36_44, tallasPorRegla: true });
  for (const r of [dama, hombre]) {
    // El precio queda por revisar; lo demás se reconoce igual.
    expect([...r.revisar].sort()).toEqual(['color', 'precio']);
    expect(r.notas).toContain('El mensaje trae varios precios ($125.000 y $115.000): elige el precio del proveedor.');
    expect(r.omitido.telefonos).toBe(1);
    expect(r.modelo).not.toMatch(/NUMERACI|DAMA|HOMBRE|DISPONIBLE|APARTA|APROVECHA|P[IÍ]DELA/i);
  }
  const precios = await page.evaluate((t) => window.GamaTallaTextoProveedor.analizar(t).precios, NIKE_DAMA);
  expect(precios).toEqual([125000, 115000]);
  expect(dama.notas).toContain('Tallas propuestas por «numeración dama» (Dama: 36 a 39).');
  expect(hombre.notas).toContain('Tallas propuestas por «numeración hombre» (Hombre: 36 a 44).');
});

test('numeración: variantes con saltos de línea, tildes, mayúsculas y emojis', async ({ page }) => {
  const casos = [
    ['Nike 7 Camaras\n⚠️ Numeración: Dama\n💥 $125.000\n📦 Disponible $115.000', 'dama', T36_39],
    ['NIKE 7 CAMARAS\nNUMERACIÓN MUJER 💥\n$125.000', 'dama', T36_39],
    ['nike 7 camaras numeracion de mujeres $125.000', 'dama', T36_39],
    ['NIKE 7 CAMARAS ⚠️ NUMERACIÓN CABALLERO $125.000', 'hombre', T36_44],
    ['NIKE 7 CAMARAS\n💥\nNumeración\nHombre\n$125.000', 'hombre', T36_44],
    ['NIKE 7 CAMARAS NUMERACION DAMA Y NUMERACION HOMBRE $125.000', 'unisex', T36_44],
    ['NIKE 7 CAMARAS\nNumeración dama\nNumeración caballero\n$125.000', 'unisex', T36_44],
    ['NIKE 7 CAMARAS numeración dama y caballero $125.000', 'unisex', T36_44]
  ];
  const leidos = await analizar(page, casos.map(([t]) => t));
  leidos.forEach((r, i) => {
    const [t, publico, tallas] = casos[i];
    expect(r.marca, t).toBe('Nike');
    expect(r.modelo.toUpperCase(), t).toBe('7 CAMARAS');
    expect(r.publico, t).toBe(publico);
    expect(r.tallas, t).toEqual(tallas);
    expect(r.tallasPorRegla, t).toBe(true);
    expect(r.notas.join(' '), t).toMatch(/Tallas propuestas por «numeración /);
  });
  // «Numeración: Hombre» (con salto entre «Numeración» y el público) también fija el público Hombre.
  expect(leidos[4].revisar).not.toContain('publico');
});

test('numeración con tallas numéricas: mandan las numéricas; «todas las tallas» sigue igual', async ({ page }) => {
  const [dosTallas, rango, todas, reglas] = await Promise.all([
    analizar(page, ['NIKE 7 CAMARAS Numeración dama: 37; 38 $125.000']),
    analizar(page, ['NIKE 7 CAMARAS\nNUMERACIÓN HOMBRE\n40 al 42\n$125.000']),
    analizar(page, ['Reebok Princensa Dama todas las tallas $105.000']),
    page.evaluate(() => window.GamaTallaTextoProveedor.REGLAS_PROVEEDOR)
  ]);
  expect(dosTallas[0]).toMatchObject({ modelo: '7 CAMARAS', publico: 'dama', tallas: ['37', '38'], tallasExplicitas: true, tallasPorRegla: false });
  expect(dosTallas[0].revisar).not.toContain('tallas');
  expect(dosTallas[0].notas.join(' ')).toContain('«numeración dama» con tallas concretas: se usaron esas (37 · 38).');
  expect(rango[0]).toMatchObject({ modelo: '7 CAMARAS', publico: 'hombre', tallas: ['40', '41', '42'], tallasPorRegla: false });
  expect(todas[0]).toMatchObject({ publico: 'dama', tallas: T36_39, tallasPorRegla: true });
  // La tabla centralizada: rangos por público y palabras de «numeración».
  expect(reglas.todasLasTallas).toEqual({ dama: T36_39, hombre: T36_44, unisex: T36_44 });
  expect(reglas.numeracion).toMatchObject({ dama: 'dama', mujer: 'dama', hombre: 'hombre', caballero: 'hombre' });
});

test('varios precios: candidatos en orden y sin elegir; un solo precio repetido no es ambiguo', async ({ page }) => {
  const [dosLineas, mismaLinea, repetido, uno] = await analizar(page, [
    'NIKE 7 CAMARAS DAMA\n$125.000\nDisponible $115.000\n36 al 39',
    'NIKE 7 CAMARAS DAMA $125.000 115.000 36 al 39',
    'NIKE 7 CAMARAS DAMA $115.000\nAhora 115.000\n36 al 39',
    'NIKE 7 CAMARAS DAMA $115.000 36 al 39'
  ]);
  for (const r of [dosLineas, mismaLinea]) {
    expect(r).toMatchObject({ marca: 'Nike', modelo: '7 CAMARAS', publico: 'dama', precio: null, tallas: T36_39 });
    expect(r.revisar).toContain('precio');
  }
  const candidatos = await page.evaluate((ts) => ts.map((t) => window.GamaTallaTextoProveedor.analizar(t).precios),
    ['NIKE 7 CAMARAS DAMA\n$125.000\nDisponible $115.000\n36 al 39', 'NIKE 7 CAMARAS DAMA $125.000 115.000 36 al 39']);
  expect(candidatos).toEqual([[125000, 115000], [125000, 115000]]);
  for (const r of [repetido, uno]) {
    expect(r.precio).toBe(115000);
    expect(r.revisar).not.toContain('precio');
  }
});

// ---------------------------------------------------------------- marca ON y marcas del catálogo
const ON = '🌟ON CLOUD REMIX🌟\n💸$115.000💸\nEUR 36 AL 44\n\n🛒 Mándanos tu pedido: +57 3000000000';

/** @param {import('@playwright/test').Page} page @param {string[]} textos @param {string[]} marcas */
async function analizarCon(page, textos, marcas) {
  return page.evaluate(([lista, m]) => lista.map((t) => {
    const r = window.GamaTallaTextoProveedor.analizar(t, { marcas: m });
    return { marca: r.marca, modelo: r.modelo, publico: r.publico, precio: r.precio, tallas: r.tallas, revisar: r.revisar };
  }), [textos, marcas]);
}

test('mensaje ON completo: marca On, modelo CLOUD REMIX, 115000, tallas 36–44; público y color por revisar', async ({ page }) => {
  const [r] = await analizar(page, [ON]);
  expect(r).toMatchObject({ marca: 'On', modelo: 'CLOUD REMIX', publico: '', precio: 115000, tallas: T36_44 });
  expect([...r.revisar].sort()).toEqual(['color', 'publico']);
  expect(r.omitido.telefonos).toBe(1);
  expect(r.modelo).not.toMatch(/EUR|M[AÁ]NDANOS|PEDIDO|3000/i);
  // Variantes: minúsculas, emojis pegados, saltos de línea y «EUR» delante o detrás.
  const variantes = [
    'on cloud remix\n$115.000\neur 36 al 44',
    '🌟On🌟Cloud Remix💸$115.000💸 EUR 36 AL 44',
    'ON\nCLOUD REMIX\n💸 $115.000\n36 AL 44 EUR\n🛒 Mándanos tu pedido: +57 3000000000',
    '🌟 ON CLOUD REMIX 🌟\n\n💸$115.000💸\n\nEUR: 36-44'
  ];
  for (const [i, v] of (await analizar(page, variantes)).entries()) {
    expect(v.marca, variantes[i]).toBe('On');
    // También con la marca sola en su línea: el modelo es la línea siguiente.
    expect(v.modelo.toUpperCase(), variantes[i]).toBe('CLOUD REMIX');
    expect(v.precio, variantes[i]).toBe(115000);
    expect(v.tallas, variantes[i]).toEqual(T36_44);
  }
});

test('ON solo como palabra completa al principio; marcas compuestas y números de modelo', async ({ page }) => {
  const casos = [
    ['Vans Slip On $90.000 40 al 42', 'Vans', 'Slip On'],
    ['Slip On Classic $90.000 40 al 42', '', 'Slip On Classic'],
    ['Onitsuka Tiger Mexico 66 $200.000 40 al 42', 'Onitsuka Tiger', 'Mexico 66'],
    ['Reebok Club C On Court $90.000 40 al 42', 'Reebok', 'Club C On Court'],
    ['Ontario Runner $90.000 40 al 42', '', 'Ontario Runner'],
    ['New Balance 9060 $300.000 40 al 42', 'New Balance', '9060'],
    ['Nike Air Max 90 $300.000 40 al 42', 'Nike', 'Air Max 90'],
    ['Under Armour Charged 7 $200.000 40 al 42', 'Under Armour', 'Charged 7']
  ];
  const leidos = await analizar(page, casos.map(([t]) => t));
  leidos.forEach((r, i) => {
    expect(r.marca, casos[i][0]).toBe(casos[i][1]);
    expect(r.modelo, casos[i][0]).toBe(casos[i][2]);
    expect(r.tallas, casos[i][0]).toEqual(['40', '41', '42']);
  });
});

test('marcas del catálogo (ficticias): se reconocen y la compuesta gana a la simple', async ({ page }) => {
  const [simple, compuesta, sinCatalogo] = await Promise.all([
    analizarCon(page, ['KORVOLAB Trail 7 $150.000\nDama\n36 al 39'], ['KORVOLAB']),
    analizarCon(page, ['Korvolab Run Trail 7 $150.000\nDama\n36 al 39'], ['KORVOLAB', 'KORVOLAB RUN']),
    analizarCon(page, ['KORVOLAB Trail 7 $150.000\nDama\n36 al 39'], [])
  ]);
  // Una marca del catálogo se escribe como está allí.
  expect(simple[0]).toMatchObject({ marca: 'KORVOLAB', modelo: 'Trail 7', publico: 'dama', tallas: T36_39 });
  expect(simple[0].revisar).not.toContain('marca');
  expect(compuesta[0]).toMatchObject({ marca: 'KORVOLAB RUN', modelo: 'Trail 7' });
  expect(sinCatalogo[0].marca).toBe('');
  expect(sinCatalogo[0].revisar).toContain('marca');
});
