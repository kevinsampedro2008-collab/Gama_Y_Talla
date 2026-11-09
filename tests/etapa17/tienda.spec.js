// @ts-check
/* Etapa 17 · Tienda: línea de la tarjeta sin categoría, opción Unisex y filtros con la primera
 * letra en mayúscula. Supabase se simula (como en las etapas 14 y 16.3): sin red real ni datos
 * remotos. Datos FICTICIOS.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CELULAR, ESCRITORIO, abrirDetalle } from '../etapa9/ayudas.js';
import { CATALOGO_MIGRADO, conEstados, clonar, tiendaConSupabase } from '../etapa14/ayudas-etapa14.js';

const CAPTURAS = path.join(os.tmpdir(), 'gama-talla-17-capturas');
fs.mkdirSync(CAPTURAS, { recursive: true });

// Cuatro zapatillas: Caballero con dos colores (la tarjeta de referencia), Unisex de categoría
// compuesta, Dama, y una heredada sin público. Todas con la talla 40 disponible.
function catalogo() {
  const base = clonar(CATALOGO_MIGRADO.slice(0, 4));
  const [a, b, c, d] = base;
  Object.assign(a, { nombre: 'AIR FOR 1', marca: 'NIKE', categoria: 'URBANAS', publico: 'hombre', nuevoIngreso: true });
  const segundo = clonar(a.variantes[0]);
  Object.assign(segundo, { id: 'af1-negro', codigoVariante: 'GT-AF1-B', color: 'NEGRO' });
  a.variantes.push(segundo);
  Object.assign(b, { nombre: 'BOTA URBANA 17', marca: 'ADIDAS', categoria: 'BOTAS CASUALES', publico: 'unisex', nuevoIngreso: false });
  Object.assign(c, { nombre: 'RUNNER 17', marca: 'NEW BALANCE', categoria: 'RUNNING', publico: 'dama', nuevoIngreso: false });
  Object.assign(d, { nombre: 'HEREDADA 17', marca: 'PUMA', categoria: 'URBANAS', publico: null, nuevoIngreso: false });
  let resultado = base;
  for (const nombre of ['AIR FOR 1', 'BOTA URBANA 17', 'RUNNER 17', 'HEREDADA 17']) resultado = conEstados(resultado, nombre, { 40: 'DISPONIBLE' });
  return resultado;
}
const CATALOGO = catalogo();
const ID = Object.fromEntries(CATALOGO.map((p) => [p.nombre, p.id]));
const tarjeta = (pagina, nombre) => pagina.locator(`#grilla-productos article.tarjeta[data-id="${ID[nombre]}"]`);
const tarjetas = (pagina) => pagina.locator('#grilla-productos article.tarjeta');
// Texto VISIBLE de la línea (con text-transform aplicado), sin saltos de línea.
const lineaVisible = (loc) => loc.locator('.tarjeta-meta').evaluate((n) => n.innerText.replace(/\s+/g, ' ').trim());

test.describe('Tarjeta: marca · público · colores (sin categoría)', () => {
  for (const vista of [{ ...CELULAR, nombre: '360', ancho: 360 }, CELULAR, ESCRITORIO]) {
    test(`${vista.ancho}px: «NIKE · CABALLERO · 2 COLORES», Unisex y heredada sin etiqueta; nada recortado`, async ({ browser, browserName }) => {
      await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
        await expect(tarjetas(pagina)).toHaveCount(4);
        expect(await lineaVisible(tarjeta(pagina, 'AIR FOR 1'))).toBe('Nike · CABALLERO · 2 COLORES');
        expect(await lineaVisible(tarjeta(pagina, 'BOTA URBANA 17'))).toBe('Adidas · UNISEX');
        expect(await lineaVisible(tarjeta(pagina, 'RUNNER 17'))).toBe('New balance · DAMA');
        expect(await lineaVisible(tarjeta(pagina, 'HEREDADA 17')), 'sin público: sin etiqueta').toBe('Puma');
        await expect(tarjeta(pagina, 'HEREDADA 17').locator('.tarjeta-publico')).toHaveCount(0);
        // La categoría ya no está en ninguna línea de tarjeta.
        for (const p of CATALOGO) expect(await lineaVisible(tarjeta(pagina, p.nombre))).not.toContain(p.categoria);
        // Público y recuento completos: dentro de su línea, sin puntos suspensivos ni recortes; como
        // mucho dos líneas; sin desborde de la página.
        const medidas = await pagina.locator('#grilla-productos .tarjeta-meta').evaluateAll((lineas) => lineas.map((m) => {
          const caja = m.getBoundingClientRect();
          const partes = [...m.querySelectorAll('.tarjeta-publico, .tarjeta-colores')].map((s) => {
            const r = s.getBoundingClientRect();
            return { dentro: r.left >= caja.left - 1 && r.right <= caja.right + 1, completo: s.scrollWidth <= s.clientWidth + 1 || s.getClientRects().length > 0 };
          });
          const filas = new Set([...m.children].map((s) => Math.round(s.getBoundingClientRect().top))).size;
          return { partes, filas };
        }));
        for (const m of medidas) {
          expect(m.filas).toBeLessThanOrEqual(2);
          for (const parte of m.partes) expect(parte).toEqual({ dentro: true, completo: true });
        }
        expect(await pagina.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
        await tarjeta(pagina, 'AIR FOR 1').scrollIntoViewIfNeeded();
        await pagina.screenshot({ path: path.join(CAPTURAS, `tarjetas-${browserName}-${vista.ancho}.png`) });
      }, { respuesta: CATALOGO });
    });
  }

  test('«Ver detalles» muestra Unisex junto a marca y categoría', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const ficha = await abrirDetalle(pagina, 'BOTA URBANA 17');
      await expect(ficha.locator('.detalle-publico')).toHaveText(' · Unisex');
      await expect(ficha.locator('.detalle-marca')).toContainText('BOTAS CASUALES');
      await pagina.screenshot({ path: path.join(CAPTURAS, `ficha-unisex-${browserName}-390.png`) });
    }, { respuesta: CATALOGO });
  });
});

test.describe('Filtros: Unisex y primera letra en mayúscula', () => {
  test('escritorio: opciones, valor elegido, fichas activas y recuentos; combinaciones exactas', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, ESCRITORIO, async (pagina) => {
      const abrir = async (campo) => pagina.locator(`.campo[data-campo="${campo}"]`).click();
      const textos = (id) => pagina.locator(`#${id} .opcion .opcion-texto`).allTextContents();

      await abrir('marca');
      expect(await textos('filtro-marca')).toEqual(['Todas las marcas', 'Adidas', 'New balance', 'Nike', 'Puma']);
      // La clave de selección sigue siendo el valor guardado; el recuento, el de siempre.
      await expect(pagina.locator('#filtro-marca .opcion').nth(1)).toHaveAttribute('data-valor', 'ADIDAS');
      await expect(pagina.locator('#filtro-marca [data-valor="NIKE"] .opcion-cantidad')).toContainText('1');
      await pagina.screenshot({ path: path.join(CAPTURAS, `filtro-marca-${browserName}.png`) });
      await pagina.locator('#filtro-marca [data-valor="ADIDAS"]').click();
      await expect(pagina.locator('[data-valor-campo="marca"]')).toHaveText('Adidas');
      await expect(pagina.locator('#filtros-activos')).toContainText('Adidas');
      await expect(pagina.locator('#filtros-activos [data-quitar="marca"]')).toHaveAttribute('aria-label', 'Quitar marca: Adidas');
      expect(await pagina.evaluate(() => estado.marca), 'el estado conserva el valor guardado').toBe('ADIDAS');
      await expect(tarjetas(pagina)).toHaveCount(1);

      await abrir('categoria');
      expect(await textos('filtro-categoria')).toEqual(['Todas las categorías', 'Botas casuales', 'Running', 'Urbanas']);
      // Con «Adidas» elegida, el recuento de cada categoría respeta la marca.
      await expect(pagina.locator('#filtro-categoria [data-valor="URBANAS"] .opcion-cantidad')).toContainText('0');
      await pagina.locator('#filtro-categoria [data-valor="BOTAS CASUALES"]').click();
      await expect(pagina.locator('[data-valor-campo="categoria"]')).toHaveText('Botas casuales');
      await expect(pagina.locator('#filtros-activos')).toContainText('Botas casuales');

      // Público: Todos, Caballero, Dama y Unisex. Unisex + Adidas + Botas casuales = 1.
      await abrir('publico');
      expect(await textos('filtro-publico')).toEqual(['Todos', 'Caballero', 'Dama', 'Unisex']);
      await pagina.locator('#filtro-publico [data-valor="unisex"]').click();
      await expect(pagina.locator('[data-valor-campo="publico"]')).toHaveText('Unisex');
      await expect(tarjetas(pagina)).toHaveCount(1);
      await expect(tarjetas(pagina).first()).toContainText('BOTA URBANA 17');
      await expect(pagina.locator('#filtros-activos')).toContainText('Unisex');
      await pagina.screenshot({ path: path.join(CAPTURAS, `filtros-combinados-${browserName}.png`) });
      // Unisex + Nike = 0 (cada opción filtra por su clasificación exacta).
      await pagina.locator('#limpiar-filtros').click();
      const contar = (criterios) => pagina.evaluate((c) => filtrarProductos({ ...estado, ...c }).length, criterios);
      expect(await contar({ publico: 'unisex', marca: 'NIKE' })).toBe(0);
      expect(await contar({ publico: 'hombre' })).toBe(1);
      expect(await contar({ publico: 'dama' })).toBe(1);
      expect(await contar({ publico: 'unisex' })).toBe(1);
      expect(await contar({ publico: 'hombre', talla: '40', busqueda: 'air' })).toBe(1);
      expect(await contar({ publico: 'hombre', soloNuevos: true })).toBe(1);
      expect(await contar({ publico: 'dama', soloNuevos: true })).toBe(0);
      expect(await contar({}), '«Todos» incluye la heredada sin clasificar').toBe(4);
    }, { respuesta: CATALOGO });
  });

  for (const vista of [{ ...CELULAR, nombre: '360', ancho: 360 }, CELULAR]) {
    test(`${vista.ancho}px: hoja de filtros con las mismas opciones y textos, sincronizada`, async ({ browser, browserName }) => {
      await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
        await pagina.locator('#abrir-filtros').click();
        const hoja = pagina.locator('#hoja-filtros');
        const textos = (id) => hoja.locator(`#${id} .opcion .opcion-texto`).allTextContents();
        expect(await textos('hoja-marca')).toEqual(['Todas las marcas', 'Adidas', 'New balance', 'Nike', 'Puma']);
        expect(await textos('hoja-categoria')).toEqual(['Todas las categorías', 'Botas casuales', 'Running', 'Urbanas']);
        expect(await textos('hoja-publico')).toEqual(['Todos', 'Caballero', 'Dama', 'Unisex']);
        await hoja.locator('#hoja-publico [data-valor="unisex"]').click();
        await expect(pagina.locator('#hoja-aplicar')).toHaveText('Ver 1 producto');
        await hoja.locator('#hoja-categoria [data-valor="URBANAS"]').click();
        await expect(pagina.locator('#hoja-aplicar')).toHaveText('Sin resultados');
        await hoja.locator('#hoja-categoria [data-valor="BOTAS CASUALES"]').click();
        await expect(pagina.locator('#hoja-aplicar')).toHaveText('Ver 1 producto');
        await expect(pagina.locator('#filtro-publico [data-valor="unisex"]'), 'el control de escritorio queda igual').toHaveAttribute('aria-pressed', 'true');
        expect(await pagina.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
        await pagina.screenshot({ path: path.join(CAPTURAS, `hoja-filtros-${browserName}-${vista.ancho}.png`) });
        await pagina.locator('#hoja-aplicar').click();
        await expect(pagina.locator('#filtros-activos')).toContainText('Botas casuales');
        await expect(pagina.locator('#filtros-activos')).toContainText('Unisex');
        await expect(tarjetas(pagina)).toHaveCount(1);
        await pagina.screenshot({ path: path.join(CAPTURAS, `fichas-activas-${browserName}-${vista.ancho}.png`) });
      }, { respuesta: CATALOGO });
    });
  }
});
