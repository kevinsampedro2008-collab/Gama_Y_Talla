// @ts-check
/* Etapa 17.4 · Marcas con mayúscula inicial en la tienda y «Cómo comprar» como recorrido visual.
 * Supabase simulado; WhatsApp no se abre. Capturas fuera del repositorio (GT_CAPTURAS_17_4 o la
 * carpeta temporal). Datos FICTICIOS. */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CELULAR, ESCRITORIO, abrirDetalle, guardarDatosEnvio } from '../etapa9/ayudas.js';
import { CATALOGO_MIGRADO, clonar, tiendaConSupabase, abrirCarritoDesdeCabecera } from '../etapa14/ayudas-etapa14.js';

const CAPTURAS = process.env.GT_CAPTURAS_17_4 || path.join(os.tmpdir(), 'gama-talla-17-4-capturas');
fs.mkdirSync(CAPTURAS, { recursive: true });
const TEL = { nombre: '360', ancho: 360, alto: 780, tactil: true };
const VISTAS = [TEL, CELULAR, ESCRITORIO];

// ADIDAS, LACOSTE y NIKE (una cada una), más una marca NUEVA con tildes y varias palabras.
function catalogo() {
  const ps = clonar(CATALOGO_MIGRADO.slice(0, 4));
  ps.forEach((p, i) => {
    const v = p.variantes[0];
    for (const f of v.tallas) {
      const disp = ['40', '41'].includes(f.talla);
      f.estado = disp ? 'DISPONIBLE' : 'POR_REVISAR';
      f.vigenciaDesde = disp ? new Date(Date.now() - 36e5).toISOString() : null;
      f.venceEn = disp ? new Date(Date.now() + 36e5).toISOString() : null;
    }
    v.tallasDisponibles = ['40', '41']; v.tallasPorRevisar = v.tallas.filter((t) => !['40', '41'].includes(t.talla)).map((t) => t.talla); v.tallasAgotadas = [];
    p.marca = ['ADIDAS', 'LACOSTE', 'NIKE', 'ÉCLAT DEL NORTE'][i];
    p.nombre = ['SAMBA CLÁSICA', 'GRIPSHOT', 'AIR FOR 1', 'ÑANDÚ RUN'][i];
  });
  return ps;
}
const CATALOGO = catalogo();
const sin3 = clonar(CATALOGO.slice(0, 3));

test.describe('Marcas con mayúscula inicial', () => {
  test('portada, tarjetas, ficha, confirmación, carrito y revisión del par; los datos no cambian', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, ESCRITORIO, async (pagina) => {
      await expect(pagina.locator('.portada-descripcion')).toHaveText('Modelos de Adidas, Lacoste y Nike. Elige tu talla, arma tu carrito y envía tu pedido por WhatsApp.');
      const portada = await pagina.locator('.portada-descripcion').evaluate((n) => ({ texto: n.innerText, t: getComputedStyle(n.querySelector('[data-marcas-portada]')).textTransform }));
      expect(portada.texto).toContain('Modelos de Adidas, Lacoste y Nike.');
      expect(portada.t).toBe('none');
      await pagina.screenshot({ path: path.join(CAPTURAS, `portada-${browserName}-1440.png`) });
      // Tarjetas: solo la marca va con inicial; el resto de la línea conserva su estilo.
      const marcas = await pagina.locator('.tarjeta-meta-marca').evaluateAll((n) => n.map((x) => [x.innerText, getComputedStyle(x).textTransform]));
      expect(marcas).toEqual([['Adidas', 'none'], ['Lacoste', 'none'], ['Nike', 'none']]);
      // Los datos, las claves de filtro y la búsqueda siguen con el valor original.
      expect(await pagina.evaluate(() => estado.productos.map((p) => p.marca))).toEqual(['ADIDAS', 'LACOSTE', 'NIKE']);
      expect(await pagina.locator('#filtro-marca .opcion').evaluateAll((o) => o.map((x) => x.dataset.valor))).toEqual(['Todos', 'ADIDAS', 'LACOSTE', 'NIKE']);
      await pagina.locator('#buscar').fill('nike');
      await expect(pagina.locator('#grilla-productos article.tarjeta')).toHaveCount(1);
      await pagina.locator('#buscar').fill('');
      await pagina.locator('.campo[data-campo="marca"]').click();
      await pagina.locator('#filtro-marca [data-valor="LACOSTE"]').click();
      await expect(pagina.locator('#grilla-productos article.tarjeta')).toHaveCount(1);
      await expect(pagina.locator('#filtros-activos')).toContainText('Lacoste');
      await pagina.locator('#limpiar-filtros').click();
      // Ficha (marca · categoría), confirmación y carrito.
      const ficha = await abrirDetalle(pagina, 'AIR FOR 1');
      expect(await ficha.locator('.detalle-marca-nombre').innerText()).toBe('Nike');
      expect(await ficha.locator('.detalle-marca-nombre').evaluate((n) => getComputedStyle(n).textTransform)).toBe('none');
      await expect(ficha.locator('#detalle-nombre')).toHaveText('AIR FOR 1');
      await ficha.locator('.talla[data-talla="40"]').click();
      await pagina.evaluate(() => agregarDesdeDetalle());
      const conf = pagina.locator('#confirmacion-carrito');
      await expect(conf).toHaveJSProperty('open', true);
      expect(await conf.locator('.detalle-marca-nombre').innerText()).toBe('Nike');
      await conf.getByRole('button', { name: /Ver carrito/ }).click();
      await expect(pagina.locator('#carrito .linea-nombre')).toHaveText('Nike AIR FOR 1');
      // Revisión del par («Pedir este par»): la fila «Marca».
      await pagina.locator('#carrito .boton-cerrar').click();
      const ficha2 = await abrirDetalle(pagina, 'AIR FOR 1');
      await ficha2.locator('.talla[data-talla="41"]').click();
      await ficha2.getByRole('button', { name: 'Pedir este par por WhatsApp' }).click();
      await guardarDatosEnvio(pagina);
      await expect(pagina.locator('#envio-revision-par')).toContainText('Nike');
      expect(await pagina.locator('#envio-revision-par').innerText()).not.toContain('NIKE');
    }, { respuesta: sin3 });
  });

  test('una marca nueva con tildes y varias palabras recibe el formato y se sigue encontrando', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const tarjeta = pagina.locator('#grilla-productos article.tarjeta', { hasText: 'ÑANDÚ RUN' });
      await expect(tarjeta.locator('.tarjeta-meta-marca')).toHaveText('Éclat del norte');
      expect(await pagina.evaluate(() => estado.productos.find((p) => p.nombre === 'ÑANDÚ RUN').marca)).toBe('ÉCLAT DEL NORTE');
      await expect(pagina.locator('#grilla-productos article.tarjeta[data-id]').first()).toBeVisible();
      // Búsqueda (con y sin tildes) y filtro por el valor guardado.
      for (const q of ['éclat', 'eclat del norte']) {
        await pagina.locator('#buscar').fill(q);
        await expect(pagina.locator('#grilla-productos article.tarjeta')).toHaveCount(1);
      }
      await pagina.locator('#buscar').fill('');
      await pagina.locator('#abrir-filtros').click();
      await expect(pagina.locator('#hoja-marca [data-valor="ÉCLAT DEL NORTE"] .opcion-texto')).toHaveText('Éclat del norte');
      await pagina.locator('#hoja-marca [data-valor="ÉCLAT DEL NORTE"]').click();
      await expect(pagina.locator('#hoja-aplicar')).toHaveText('Ver 1 producto');
      await pagina.locator('#hoja-aplicar').click();
      await expect(pagina.locator('#grilla-productos article.tarjeta')).toHaveCount(1);
      await pagina.screenshot({ path: path.join(CAPTURAS, `marca-nueva-${browserName}-390.png`) });
    }, { respuesta: CATALOGO });
  });

  test('portada en celular', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await expect(pagina.locator('.portada-descripcion')).toContainText('Modelos de Adidas, Lacoste y Nike.');
      await pagina.locator('.portada-descripcion').scrollIntoViewIfNeeded();
      await pagina.screenshot({ path: path.join(CAPTURAS, `portada-${browserName}-390.png`) });
    }, { respuesta: sin3 });
  });
});

const ICONOS = ['icono-buscar', 'icono-regla', 'icono-bolsa', 'icono-whatsapp-solido', 'icono-caja'];
const TITULOS = ['Explora las zapatillas', 'Elige modelo y talla', 'Añade al carrito', 'Envía tu pedido', 'Confirma y recibe'];

for (const vista of VISTAS) {
  test.describe(`Cómo comprar · ${vista.ancho}px`, () => {
    test('cinco pasos en orden, con sus textos completos, íconos decorativos y semántica de lista', async ({ browser, browserName }) => {
      await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
        const lista = pagina.locator('#como-comprar ol.pasos');
        await expect(lista).toHaveCount(1);
        expect(await lista.locator('> li').count()).toBe(5);
        expect(await lista.locator('h3').allTextContents()).toEqual(TITULOS);
        expect(await lista.locator('.paso-numero').allTextContents()).toEqual(['01', '02', '03', '04', '05']);
        expect(await lista.locator('.paso-numero').evaluateAll((n) => n.every((x) => x.getAttribute('aria-hidden') === 'true'))).toBe(true);
        const iconos = await lista.locator('svg.paso-icono').evaluateAll((s) => s.map((x) => ({ oculto: x.getAttribute('aria-hidden'), ref: x.querySelector('use').getAttribute('href').slice(1) })));
        expect(iconos.map((i) => i.ref)).toEqual(ICONOS);
        expect(iconos.every((i) => i.oculto === 'true')).toBe(true);
        await expect(pagina.locator('#titulo-como-comprar')).toHaveText('Tu pedido en cinco pasos');
        await pagina.locator('#como-comprar').scrollIntoViewIfNeeded();
        const g = await pagina.evaluate(() => {
          const pasos = [...document.querySelectorAll('#como-comprar .paso')];
          const b = (n) => n.getBoundingClientRect();
          const cc = (n, s) => getComputedStyle(n, s);
          return pasos.map((p) => {
            const num = p.querySelector('.paso-numero'), tar = p.querySelector('.paso-tarjeta'), h = p.querySelector('h3'), d = p.querySelector('p'), ic = p.querySelector('.paso-icono');
            return {
              num: b(num), tar: b(tar), p: b(p),
              completo: h.scrollWidth <= h.clientWidth + 1 && d.scrollWidth <= d.clientWidth + 1 && b(d).bottom <= b(tar).bottom + 1 && b(h).right <= b(tar).right + 1,
              colorNum: cc(num).color, colorIcono: cc(ic).color, fondoTar: cc(tar).backgroundColor, bordeTar: cc(tar).borderTopColor, bordeNum: cc(num).borderTopColor,
              conector: p.nextElementSibling ? cc(p, '::after').content : 'none', radio: cc(num).borderRadius, fondoNum: cc(num).backgroundColor
            };
          });
        });
        for (const x of g) {
          expect(x.completo, 'título y descripción completos').toBe(true);
          expect(x.colorNum).toBe('rgb(142, 160, 255)');
          expect(x.colorIcono).toBe('rgb(142, 160, 255)');
          expect(x.fondoTar).toMatch(/rgba\(255, 255, 255, 0\.05\)/);
          expect(Math.round(x.num.width)).toBe(Math.round(x.num.height));
          expect(x.radio).toBe('50%');
        }
        expect(g.slice(0, 4).every((x) => x.conector === '""')).toBe(true);
        expect(g[4].conector).toBe('none');
        expect(await pagina.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
        if (vista.ancho >= 1100) {
          expect(new Set(g.map((x) => Math.round(x.num.top))).size, 'números alineados').toBe(1);
          const anchos = g.map((x) => Math.round(x.p.width));
          expect(Math.max(...anchos) - Math.min(...anchos), 'ancho similar').toBeLessThanOrEqual(2);
          expect(g.every((x, i) => i === 0 || x.p.left > g[i - 1].p.left)).toBe(true);
          const linea = await pagina.locator('#como-comprar .paso').first().evaluate((p) => { const s = getComputedStyle(p, '::after'); return [s.height, s.width !== 'auto' && parseFloat(s.width) > 20]; });
          expect(linea).toEqual(['1px', true]);
        } else {
          expect(new Set(g.map((x) => Math.round(x.num.left))).size, 'círculos en una columna').toBe(1);
          for (const x of g) expect(x.num.right, 'círculo a la izquierda del panel').toBeLessThanOrEqual(x.tar.left);
          for (let i = 1; i < g.length; i += 1) expect(g[i].p.top).toBeGreaterThan(g[i - 1].p.bottom - 1);
          const l = await pagina.locator('#como-comprar .paso').first().evaluate((p) => { const s = getComputedStyle(p, '::after'); return [s.width, parseFloat(s.height) > 10]; });
          expect(l).toEqual(['1px', true]);
        }
        await pagina.screenshot({ path: path.join(CAPTURAS, `pasos-${browserName}-${vista.ancho}.png`) });
      }, { respuesta: CATALOGO });
    });

    test('«Explorar catálogo» y «Ver mi carrito» se pueden pulsar sin que los tape el botón flotante', async ({ browser, browserName }) => {
      await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
        const explorar = pagina.locator('.pasos-cierre').getByRole('link', { name: 'Explorar catálogo' });
        const carrito = pagina.locator('.pasos-cierre').getByRole('button', { name: 'Ver mi carrito' });
        for (const boton of [explorar, carrito]) {
          await boton.scrollIntoViewIfNeeded();
          const libre = await boton.evaluate((n) => {
            const r = n.getBoundingClientRect();
            return [r.left + 12, r.right - 12, r.left + r.width / 2].every((x) => { const e = document.elementFromPoint(x, r.top + r.height / 2); return e === n || n.contains(e); });
          });
          expect(libre, 'nada encima del botón').toBe(true);
          await expect(boton).toBeInViewport({ ratio: 1 });
        }
        await carrito.click();
        await expect(pagina.locator('#carrito')).toHaveJSProperty('open', true);
        await pagina.locator('#carrito .boton-cerrar').click();
        await explorar.click();
        await expect.poll(() => pagina.evaluate(() => location.hash)).toBe('#catalogo');
        await pagina.locator('#como-comprar').scrollIntoViewIfNeeded();
        await pagina.locator('.pasos-cierre').scrollIntoViewIfNeeded();
        await pagina.screenshot({ path: path.join(CAPTURAS, `pasos-cierre-${browserName}-${vista.ancho}.png`) });
      }, { respuesta: CATALOGO });
    });
  });
}
