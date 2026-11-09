// @ts-check
/* Etapa 17.3 · Cierre oscuro: «03 · Pagos» y «04 · Contacto» forman un solo bloque negro de ancho
 * completo. Escritorio: dos columnas con un divisor vertical; celular: Pagos y, debajo, Contacto con una
 * línea horizontal. Supabase simulado; capturas fuera del repositorio (GT_CAPTURAS_17_3 o la carpeta temporal). */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CELULAR, ESCRITORIO } from '../etapa9/ayudas.js';
import { tiendaConSupabase } from '../etapa14/ayudas-etapa14.js';

const CAPTURAS = process.env.GT_CAPTURAS_17_3 || path.join(os.tmpdir(), 'gama-talla-17-3-capturas');
fs.mkdirSync(CAPTURAS, { recursive: true });
const VISTAS = [{ nombre: '360', ancho: 360, alto: 780, tactil: true }, CELULAR, ESCRITORIO];
const OSCURO = 'rgb(20, 20, 20)';

const llegada = (pagina, id) => pagina.waitForFunction((i) => {
  const t = document.getElementById(i).getBoundingClientRect().top;
  return t >= -2 && t <= document.querySelector('#cabecera').getBoundingClientRect().bottom + 40;
}, id);
const activo = (pagina) => pagina.locator('.menu-enlaces a[aria-current="location"]').evaluateAll((a) => a.map((x) => x.getAttribute('href')));

for (const vista of VISTAS) {
  test(`${vista.ancho}px: un solo bloque negro, ${vista.ancho >= 1024 ? 'dos columnas' : 'Pagos y debajo Contacto'}, métodos completos y enlaces`, async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
      const escritorio = vista.ancho >= 1024;
      const g = await pagina.evaluate(() => {
        const q = (s) => document.querySelector(s);
        const b = (s) => q(s).getBoundingClientRect();
        const cont = b('.cierre-oscuro .contenedor'), cat = b('#catalogo .contenedor');
        const pagos = b('#pagos'), contacto = b('#contacto'), bloque = b('.cierre-oscuro'), pie = b('footer');
        const filas = [...document.querySelectorAll('#pagos .pago')];
        return {
          anchoIgual: Math.abs(cont.width - cat.width) < 1 && Math.abs(cont.left - cat.left) < 1,
          bloqueAncho: Math.round(bloque.width) === innerWidth,
          fondos: [getComputedStyle(q('.cierre-oscuro')).backgroundColor, getComputedStyle(q('footer')).backgroundColor],
          pagos: { top: Math.round(pagos.top), left: Math.round(pagos.left), right: pagos.right, bottom: pagos.bottom },
          contacto: { top: Math.round(contacto.top), left: Math.round(contacto.left), top2: contacto.top },
          rotulos: [Math.round(b('#pagos .seccion-numero').top), Math.round(b('#contacto .seccion-numero').top)],
          bloqueBottom: bloque.bottom, pieTop: pie.top,
          divisor: getComputedStyle(q('#contacto')).borderLeftWidth + '/' + getComputedStyle(q('#contacto')).borderTopWidth,
          pagosFondo: getComputedStyle(q('#pagos .pago')).backgroundColor,
          panelMarfil: Boolean(q('.pagos-panel')),
          marcos: filas.map((f) => {
            const m = f.querySelector('.pago-icono'); const r = m.getBoundingClientRect(); const fr = f.getBoundingClientRect();
            return { w: Math.round(r.width), h: Math.round(r.height), fondo: getComputedStyle(m).backgroundColor, alineado: Math.abs(r.top + r.height / 2 - (fr.top + fr.height / 2)) < 2 };
          }),
          alto: filas.map((f) => Math.round(f.getBoundingClientRect().height)),
          texto: filas.map((f) => { const t = f.querySelector('.pago-texto'); return t.scrollWidth <= t.clientWidth + 1 && f.querySelector('strong').getBoundingClientRect().height < 40; }),
          colorNombre: getComputedStyle(q('#pagos .pago strong')).color, colorDesc: getComputedStyle(q('#pagos .pago small')).color,
          avisoDebajo: b('#pagos .aviso').top >= b('#pagos .pagos').bottom - 1,
          desborde: document.documentElement.scrollWidth - innerWidth
        };
      });
      expect(g.anchoIgual, 'mismo contenedor que el catálogo').toBe(true);
      expect(g.bloqueAncho, 'el negro ocupa todo el ancho').toBe(true);
      expect(g.fondos, 'el negro del bloque continúa en el pie').toEqual([OSCURO, OSCURO]);
      expect(g.panelMarfil, 'sin el panel marfil').toBe(false);
      expect(g.pagosFondo).toBe('rgba(0, 0, 0, 0)');
      expect(Math.abs(g.bloqueBottom - g.pieTop), 'el bloque enlaza con el pie sin hueco').toBeLessThanOrEqual(1);
      expect(g.marcos.every((m) => m.fondo === 'rgb(255, 255, 255)' && m.alineado)).toBe(true);
      expect(new Set(g.marcos.map((m) => `${m.w}x${m.h}`)).size).toBe(1);
      expect(g.texto.every(Boolean), '«Transferencia bancaria» se lee completa').toBe(true);
      expect(g.alto.every((a) => a <= 72), 'filas compactas').toBe(true);
      expect(g.avisoDebajo).toBe(true);
      expect(g.colorNombre).not.toBe(g.colorDesc);
      expect(g.desborde).toBe(0);
      if (escritorio) {
        expect(g.pagos.top, 'ambas columnas empiezan a la misma altura').toBe(g.contacto.top);
        expect(g.rotulos[0], 'rótulos alineados arriba').toBe(g.rotulos[1]);
        expect(g.pagos.left).toBeLessThan(g.contacto.left);
        expect(g.pagos.right).toBeLessThanOrEqual(g.contacto.left + 1);
        expect(g.divisor, 'divisor vertical tenue a la izquierda de Contacto').toBe('1px/0px');
      } else {
        expect(g.pagos.left).toBe(g.contacto.left);
        expect(g.contacto.top2, 'Contacto debajo de Pagos').toBeGreaterThanOrEqual(g.pagos.bottom);
        expect(g.divisor, 'línea horizontal entre ambos').toBe('0px/1px');
      }
      // Contacto conserva pregunta, botón verde y la información.
      await expect(pagina.locator('#titulo-contacto')).toHaveText('¿Dudas con tu talla o tu pedido?');
      await expect(pagina.locator('#contacto .boton-whatsapp')).toBeVisible();
      expect(await pagina.locator('#contacto .contacto-lista strong').allTextContents()).toEqual(['Atención por WhatsApp', 'Envíos', 'Horario de atención']);
      expect(await pagina.locator('#contacto .boton-whatsapp').evaluate((n) => getComputedStyle(n).backgroundColor)).toBe('rgb(15, 122, 65)');

      // Enlaces del menú y del pie llegan a su sección y la marcan al terminar el desplazamiento.
      for (const id of ['pagos', 'contacto']) {
        if (!escritorio) await pagina.locator('#boton-menu').click();
        await pagina.locator(`.menu-enlaces a[href="#${id}"]`).click();
        await llegada(pagina, id);
        await expect.poll(() => activo(pagina), { message: `«${id}» activo al terminar` }).toEqual([`#${id}`]);
        await pagina.waitForTimeout(400);
        expect(await activo(pagina), `«${id}» sigue activo`).toEqual([`#${id}`]);
        await pagina.evaluate(() => window.scrollTo(0, 0));
        await pagina.locator(`footer a[href="#${id}"]`).first().click();
        await llegada(pagina, id);
        await expect.poll(() => activo(pagina)).toEqual([`#${id}`]);
      }
      // Orden en el documento y anclas.
      expect(await pagina.evaluate(() => [...document.querySelectorAll('#inicio, #como-comprar, #catalogo, #pagos, #contacto')].map((s) => s.id))).toEqual(['inicio', 'como-comprar', 'catalogo', 'pagos', 'contacto']);

      // Capturas: escritorio con las dos secciones juntas; celular con la transición entre ellas.
      if (escritorio) {
        await pagina.evaluate(() => window.scrollTo(0, document.getElementById('pagos').offsetTop - 140));
        await pagina.screenshot({ path: path.join(CAPTURAS, `cierre-oscuro-${browserName}-${vista.ancho}.png`) });
      } else {
        await pagina.evaluate(() => { const c = document.getElementById('contacto'); window.scrollTo(0, window.scrollY + c.getBoundingClientRect().top - innerHeight * 0.55); });
        await pagina.screenshot({ path: path.join(CAPTURAS, `cierre-oscuro-transicion-${browserName}-${vista.ancho}.png`) });
      }
    }, {});
  });
}
