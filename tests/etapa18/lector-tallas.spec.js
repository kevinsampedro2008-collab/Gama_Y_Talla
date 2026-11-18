// @ts-check
/* Etapa 18 · Regresión del lector de publicaciones: una sola talla explícita.
 *
 * Carga admin/texto-proveedor.js en una página vacía (sin servidor, sin Supabase ni datos) y
 * comprueba que:
 *  - «Talla 37» y una línea aislada «37» dan la talla 37 cuando el texto no trae otras;
 *  - «40,5», «40.5» y «40 1/3» se leen igual solas o tras «Talla»;
 *  - modelos (603, 1080), precios y teléfonos nunca se leen como tallas;
 *  - lo ambiguo (una talla suelta junto a un rango, o un número fuera de 30–50) queda «por revisar»;
 *  - los dos mensajes del proveedor siguen dando lo mismo que antes.
 *
 *   npx playwright test tests/etapa18/lector-tallas.spec.js
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';

const LECTOR = path.resolve(__dirname, '..', '..', 'admin', 'texto-proveedor.js');
const TELEFONO = '+57 300 000 0000';
const MENSAJE_603 = `RECARGA 🔥🔥\nNew Balance 603 🇺🇸\nHombre $115.000 🔥\n40 al 44 Euro ✅\nTe atiendo por aquí hoy ${TELEFONO}`;
const MENSAJE_1080 = 'RECARGA 🔥🔥\nNew Balance 1080 🇺🇸\nDama $125.000 🌸\n36 al 39 Euro ✅';

/** @param {import('@playwright/test').Page} page @param {string[]} textos */
async function analizar(page, textos) {
  return page.evaluate((lista) => lista.map((t) => {
    const r = window.GamaTallaTextoProveedor.analizar(t);
    return { marca: r.marca, modelo: r.modelo, publico: r.publico, precio: r.precio, tallas: r.tallas, revisar: r.revisar, notas: r.notas, omitido: r.omitido };
  }), textos);
}

test.beforeEach(async ({ page }) => {
  await page.goto('about:blank');
  await page.addScriptTag({ path: LECTOR });
});

test('los dos mensajes del proveedor se leen igual que antes', async ({ page }) => {
  const [a, b] = await analizar(page, [MENSAJE_603, MENSAJE_1080]);
  expect(a).toMatchObject({ marca: 'New Balance', modelo: '603', publico: 'hombre', precio: 115000, tallas: ['40', '41', '42', '43', '44'], revisar: ['color'], omitido: { telefonos: 1 } });
  expect(b).toMatchObject({ marca: 'New Balance', modelo: '1080', publico: 'dama', precio: 125000, tallas: ['36', '37', '38', '39'], revisar: ['color'] });
  expect(a.omitido.promocional).toBeGreaterThan(0);
});

test('una sola talla: «Talla 37», línea aislada «37», coma, punto y fracción', async ({ page }) => {
  const casos = [
    ['New Balance 603\nDama $115.000\nTalla 37', ['37']],
    ['New Balance 603\nDama $115.000\n37', ['37']],
    ['New Balance 603\nDama $115.000\nTalla: 37 Euro', ['37']],
    ['New Balance 1080\nHombre $125.000\n40,5', ['40,5']],
    ['New Balance 1080\nHombre $125.000\n40.5', ['40,5']],
    ['New Balance 1080\nHombre $125.000\nTalla 40,5', ['40,5']],
    ['New Balance 1080\nHombre $125.000\n40 1/3', ['40 1/3']],
    ['New Balance 1080\nHombre $125.000\nTalla 40 1/3', ['40 1/3']],
    // Varias tallas, una por línea, sin otras tallas en el texto.
    ['New Balance 603\nHombre $115.000\n41\n42', ['41', '42']]
  ];
  const leidos = await analizar(page, casos.map(([t]) => t));
  leidos.forEach((r, i) => {
    expect(r.tallas, casos[i][0]).toEqual(casos[i][1]);
    expect(r.revisar, casos[i][0]).not.toContain('tallas');
    // El modelo y el precio no cambian por la talla.
    expect(r.modelo, casos[i][0]).toMatch(/^(603|1080)$/);
    expect(r.precio, casos[i][0]).toBeGreaterThan(100000);
  });
});

test('modelos, precios y teléfonos no son tallas', async ({ page }) => {
  const casos = [
    'New Balance 603\nHombre $115.000',               // modelo de tres cifras
    'New Balance 1080\nDama\n125.000',                // modelo de cuatro cifras y precio sin «$»
    'New Balance\n603\nHombre\n$115.000',             // modelo solo en su línea
    'New Balance 603\nHombre $45.000',                // precio con dos cifras de miles
    'New Balance 603\nHombre 45 mil',                 // precio en «mil»
    `New Balance 603\nHombre $115.000\n${TELEFONO}`,  // teléfono
    'New Balance 603\nHombre $115.000\n3000000000',   // dígitos largos
    'New Balance 603\nHombre $115.000\nTalla 603'     // «Talla» seguida del modelo
  ];
  const leidos = await analizar(page, casos);
  leidos.forEach((r, i) => {
    expect(r.tallas, casos[i]).toEqual([]);
    expect(r.revisar, casos[i]).toContain('tallas');
  });
  expect(leidos[3].precio).toBe(45000);
  expect(leidos[4].precio).toBe(45000);
});

test('lo ambiguo queda por revisar y no se inventa', async ({ page }) => {
  const [conRango, fuera, conPublico] = await analizar(page, [
    'New Balance 603\nHombre $115.000\n40 al 44 Euro\n45', // ¿otra talla o un dato distinto?
    'New Balance 603\nHombre $115.000\n60',                // fuera de 30–50
    'New Balance 603\nHombre 40'                           // número junto al público, sin «Talla»
  ]);
  expect(conRango.tallas).toEqual(['40', '41', '42', '43', '44']);
  expect(conRango.revisar).toContain('tallas');
  expect(conRango.notas.join(' ')).toContain('«45» está sola en una línea');
  expect(fuera.tallas).toEqual([]);
  expect(fuera.revisar).toContain('tallas');
  expect(fuera.notas.join(' ')).toContain('«60»');
  expect(conPublico.tallas).toEqual([]);
  expect(conPublico.revisar).toContain('tallas');
});

// ---------------------------------------------------------------- varios datos en una línea (Reebok)
const REEBOK = 'Reebok Club C Bulc🔥tallas 40-41-42-43-44 euro $80.000\n\nEstamos atentos de una 👉 +57 3000000000';
const ESPERADO_REEBOK = { marca: 'Reebok', modelo: 'Club C Bulc', precio: 80000, tallas: ['40', '41', '42', '43', '44'], publico: '' };

test('una sola línea con marca, modelo, tallas y precio; emojis pegados; el teléfono se omite', async ({ page }) => {
  const [original, repartido, espacios] = await analizar(page, [
    REEBOK,
    'Reebok   Club C Bulc 🔥\n\ntallas 40-41-42-43-44 euro\r\n$80.000\n\nEstamos atentos de una 👉\n+57 3000000000',
    'Reebok Club C Bulc ✅  tallas  40 - 41 - 42 - 43 - 44   euro   $ 80.000'
  ]);
  for (const r of [original, repartido, espacios]) {
    expect(r).toMatchObject(ESPERADO_REEBOK);
    // Público y color no están en el texto: quedan por revisar. Lo demás no.
    expect([...r.revisar].sort()).toEqual(['color', 'publico']);
  }
  expect(original.omitido.telefonos).toBe(1);
  expect(repartido.omitido.telefonos).toBe(1);
});

test('teléfono en la misma línea que los datos: se omite el teléfono y su frase, se conservan los datos', async ({ page }) => {
  const [delante, detras] = await analizar(page, [
    'Reebok Club C Bulc tallas 40-42-44 $80.000 Escríbeme al +57 300 000 0000',
    `+57 3000000000 Reebok Club C Bulc 40 al 42 Euro $80.000`
  ]);
  expect(delante).toMatchObject({ marca: 'Reebok', modelo: 'Club C Bulc', precio: 80000, tallas: ['40', '42', '44'] });
  expect(delante.omitido.telefonos).toBe(1);
  expect(detras).toMatchObject({ marca: 'Reebok', modelo: 'Club C Bulc', precio: 80000, tallas: ['40', '41', '42'] });
});

test('listas y rangos: «40-42-44» es una lista; «40 al 44», «40 hasta 44» y «40-44» son rangos', async ({ page }) => {
  const casos = [
    ['Reebok Club C Bulc\nTallas 40-42-44\n$80.000', ['40', '42', '44']],
    ['Reebok Club C Bulc 40-42-44 $80.000', ['40', '42', '44']],
    ['Reebok Club C Bulc\n40-41-42-43-44\n$80.000', ['40', '41', '42', '43', '44']],
    ['Reebok Club C Bulc\n40 al 44\n$80.000', ['40', '41', '42', '43', '44']],
    ['Reebok Club C Bulc\nTallas 40 hasta 44\n$80.000', ['40', '41', '42', '43', '44']],
    ['Reebok Club C Bulc\n38-40 euro\n$80.000', ['38', '39', '40']],
    ['Reebok Club C Bulc\n38; 39 y 40,5\n$80.000', ['38', '39', '40,5']],
    ['Reebok Club C Bulc\nTallas 38 39 40 1/3\n$80.000', ['38', '39', '40 1/3']],
    ['Reebok Club C Bulc\n36 37 38 Euro\n$80.000', ['36', '37', '38']]
  ];
  const leidos = await analizar(page, casos.map(([t]) => t));
  leidos.forEach((r, i) => {
    expect(r.tallas, casos[i][0]).toEqual(casos[i][1]);
    expect(r.modelo, casos[i][0]).toBe('Club C Bulc');
    expect(r.precio, casos[i][0]).toBe(80000);
  });
});
