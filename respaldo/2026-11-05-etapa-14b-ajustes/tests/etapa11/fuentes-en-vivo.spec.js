// Etapa 11 · Fuentes en vivo: compara las tablas de origen con las páginas reales y detecta enlaces rotos.
// Depende de internet y de sitios externos: si falla, puede que la fuente haya cambiado, y hay que revisarla.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import * as O from './tablas-de-origen.js';

const datos = JSON.parse(fs.readFileSync('data/guias-tallas.json', 'utf8'));

test.beforeEach(({}, info) => test.skip(info.project.name !== 'chromium', 'Comprueba sitios externos: basta una ejecución.'));
test.setTimeout(90000);

// Devuelve las tablas de una página por filas de texto, también las ocultas en pestañas.
async function tablasDe(pagina, url) {
  await pagina.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pagina.waitForFunction(() => document.querySelector('table'), null, { timeout: 30000 });
  return pagina.evaluate(() => [...document.querySelectorAll('table')].map((t) => [...t.rows].map((f) => [...f.cells].map((c) => c.textContent.trim()))));
}
const fila = (tabla, rotulo) => tabla.find((f) => new RegExp(`^${rotulo}`, 'i').test(f[0]))?.slice(1).filter((v) => v !== '') ?? [];

// Algunos sitios limitan las peticiones con 429 y Retry-After: se espera lo que piden y se reintenta una sola vez.
async function pedir(request, url, opciones) {
  const r = await request.get(url, opciones);
  if (r.status() !== 429) return r;
  await new Promise((listo) => setTimeout(listo, (Number(r.headers()['retry-after']) || 60) * 1000));
  return request.get(url, opciones);
}

test('Nike Colombia hombre: la página publica lo transcrito', async ({ page }) => {
  const [tabla] = await tablasDe(page, datos.fuentes['nike-co-hombre'].url);
  expect(fila(tabla, 'Talla hombre USA')).toEqual(O.NIKE_CO_HOMBRE.usHombre);
  expect(fila(tabla, 'Talla hombre Colombia')).toEqual(O.NIKE_CO_HOMBRE.colHombre);
  expect(fila(tabla, 'Largo del pie')).toEqual(O.NIKE_CO_HOMBRE.largoPieCm);
});

test('Nike Colombia mujer: la tabla de tenis publica lo transcrito', async ({ page }) => {
  const [tabla] = await tablasDe(page, datos.fuentes['nike-co-mujer'].url);
  expect(fila(tabla, 'Talla mujer USA')).toEqual(O.NIKE_CO_MUJER.usMujer);
  expect(fila(tabla, 'Talla mujer Colombia')).toEqual(O.NIKE_CO_MUJER.colMujer);
  expect(fila(tabla, 'Largo del pie')).toEqual(O.NIKE_CO_MUJER.largoPieCm);
});

for (const [id, us, origen, clave] of [['nike-global-hombre', 'US - Men', O.NIKE_GLOBAL_HOMBRE, 'usHombre'], ['nike-global-mujer', 'US - Women', O.NIKE_GLOBAL_MUJER, 'usMujer']]) {
  test(`${id}: cada talla US lleva la EU transcrita`, async ({ page }) => {
    const [tabla] = await tablasDe(page, datos.fuentes[id].url);
    const enUs = fila(tabla, us);
    const enEu = fila(tabla, 'EU');
    origen[clave].forEach((talla, i) => {
      expect(enEu[enUs.indexOf(talla)], `${us} ${talla}`).toBe(origen.eu[i]);
    });
  });
}

for (const [id, origen] of [['nb-co-hombre', O.NB_CO_HOMBRE], ['nb-co-mujer', O.NB_CO_MUJER]]) {
  test(`${id}: la página publica lo transcrito y no tiene columna COL`, async ({ page }) => {
    const [tabla] = await tablasDe(page, datos.fuentes[id].url);
    expect(tabla.slice(1)).toEqual(origen);
    expect(tabla[0].join(' '), 'encabezado sin COL').not.toMatch(/\bCOL/i);
  });
}

test('Le Coq Sportif Colombia: sus variantes publican lo transcrito', async ({ request }) => {
  test.setTimeout(240000);
  const POR_PAGINA = 250;
  const leerPagina = async (p) => {
    const url = `https://lecoqsportif.com.co/products.json?limit=${POR_PAGINA}&page=${p}`;
    const r = await pedir(request, url);
    expect(r.ok(), `${url} respondió ${r.status()}`).toBe(true);
    return (await r.json()).products;
  };
  const nombres = new Set();
  for (let p = 1; ; p++) {
    const productos = await leerPagina(p);
    for (const x of productos) for (const v of x.variants) nombres.add(v.title);
    if (productos.length < POR_PAGINA) break;
  }
  for (const texto of [...O.LCS_VARIANTES_HOMBRE, ...O.LCS_VARIANTES_MUJER]) expect([...nombres], texto).toContain(texto);
});

test('adidas (soporte oficial): EU, US y cm publicados coinciden con lo transcrito', async ({ page }) => {
  const [tabla] = await tablasDe(page, datos.fuentes['adidas-global'].url);
  const n = O.ADIDAS_GLOBAL.eu.length;
  expect(fila(tabla, 'EU').slice(0, n)).toEqual(O.ADIDAS_GLOBAL.eu);
  expect(fila(tabla, 'US - Men').slice(0, n)).toEqual(O.ADIDAS_GLOBAL.usHombre);
  expect(fila(tabla, 'US - Women').slice(0, n)).toEqual(O.ADIDAS_GLOBAL.usMujer);
  expect(fila(tabla, 'Heel-toe \\(cm\\)').slice(0, n).map((v) => v.replace(' cm', ''))).toEqual(O.ADIDAS_GLOBAL.heelToeCm);
});

test('Running Balboa: su tabla de adidas sigue coincidiendo con el contraste transcrito', async ({ page }) => {
  const tablas = await tablasDe(page, datos.fuentes['contraste-running-balboa'].url);
  const limpia = (t) => t.slice(1).map(([us, cm, co]) => [us, cm.replace(' cm', ''), co]);
  expect(limpia(tablas[0])).toEqual(O.CONTRASTE_RUNNING_BALBOA.hombre);
  expect(limpia(tablas[1])).toEqual(O.CONTRASTE_RUNNING_BALBOA.mujer);
});

test.describe('Enlaces de las fuentes', () => {
  for (const [id, fuente] of Object.entries(datos.fuentes)) {
    test(`${id} responde`, async ({ request }) => {
      test.setTimeout(240000);
      const r = await pedir(request, fuente.url, { maxRedirects: 5, timeout: 60000 });
      if (fuente.acceso === 'bloqueado-automatizado') {
        // adidas.co rechaza navegadores automatizados: un 403 no significa enlace roto. Sí lo sería un 404.
        expect([200, 403], `${fuente.url} respondió ${r.status()}`).toContain(r.status());
      } else {
        expect(r.ok(), `${fuente.url} respondió ${r.status()}`).toBe(true);
      }
    });
  }
});
