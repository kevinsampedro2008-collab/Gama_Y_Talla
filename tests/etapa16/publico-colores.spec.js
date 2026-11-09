// @ts-check
/* Etapa 16.3 · Tienda: público (Caballero / Dama), círculos de color y ficha que abre desde arriba.
 * Supabase se simula (como en la etapa 14): sin red real ni datos remotos. Datos FICTICIOS.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CELULAR, ESCRITORIO, VISTAS, abrirDetalle, mostrarTodo } from '../etapa9/ayudas.js';
import { CATALOGO_MIGRADO, conEstados, clonar, tiendaConSupabase } from '../etapa14/ayudas-etapa14.js';

const SAMBA = 'SAMBA';
const LCS = 'LCS Retro Classic';
const CAPTURAS = path.join(os.tmpdir(), 'gama-talla-16-3-capturas');
fs.mkdirSync(CAPTURAS, { recursive: true });

// SAMBA (Caballero) con tres colores: el original (compuesto, con muestra configurada), NEGRO (sin
// muestra: se resuelve con la paleta) y uno compuesto con una muestra NO válida (círculo neutro).
// LCS (Dama, nuevo ingreso) con un solo color. El resto, sin clasificar.
function catalogo() {
  const c = clonar(conEstados(conEstados(CATALOGO_MIGRADO, SAMBA, { 40: 'DISPONIBLE' }), LCS, { 40: 'DISPONIBLE' }));
  const samba = c.find((p) => p.nombre === SAMBA);
  const lcs = c.find((p) => p.nombre === LCS);
  samba.publico = 'hombre';
  samba.nuevoIngreso = false;
  samba.variantes[0].muestra = '#E8DCC8';
  const negro = clonar(samba.variantes[0]);
  Object.assign(negro, { id: 'samba-negro', codigoVariante: 'GT-SAMBA-B', color: 'Negro', muestra: null, precio: 99000, precioAnterior: 0, imagenes: lcs.variantes[0].imagenes });
  negro.tallas = negro.tallas.map((t) => ({ ...t, estado: t.talla === '41' ? 'DISPONIBLE' : 'POR_REVISAR' }));
  negro.tallasDisponibles = ['41'];
  negro.tallasPorRevisar = negro.tallas.filter((t) => t.talla !== '41').map((t) => t.talla);
  negro.tallasAgotadas = [];
  const raro = clonar(samba.variantes[0]);
  Object.assign(raro, { id: 'samba-raro', codigoVariante: 'GT-SAMBA-C', color: 'Verde / Ámbar', muestra: 'url(x)' });
  samba.variantes.push(negro, raro);
  lcs.publico = 'dama';
  lcs.nuevoIngreso = true;
  return c;
}
const CATALOGO = catalogo();
const TOTAL = CATALOGO.length;
const tarjetas = (p) => p.locator('#grilla-productos article.tarjeta');
// Hay dos productos llamados SAMBA: se localiza cada tarjeta por su clave.
const ID = Object.fromEntries([SAMBA, LCS].map((n) => [n, CATALOGO.find((p) => p.nombre === n).id]));
const tarjetaDe = (p, nombre) => p.locator(`#grilla-productos article.tarjeta[data-id="${ID[nombre]}"]`);

test.describe('Público: Caballero / Dama', () => {
  test('etiquetas en la tarjeta y en la ficha; sin clasificar, sin etiqueta', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await mostrarTodo(pagina);
      await expect(pagina.locator('.tarjeta-publico')).toHaveCount(2);
      await expect(tarjetaDe(pagina, SAMBA).locator('.tarjeta-meta')).toContainText('Caballero');
      await expect(tarjetaDe(pagina, LCS).locator('.tarjeta-meta')).toContainText('Dama');
      // Jerarquía menor que el modelo y el precio.
      const tamanos = await tarjetaDe(pagina, SAMBA).evaluate((t) => ({
        publico: parseFloat(getComputedStyle(t.querySelector('.tarjeta-publico')).fontSize),
        nombre: parseFloat(getComputedStyle(t.querySelector('.tarjeta-nombre')).fontSize)
      }));
      expect(tamanos.publico).toBeLessThan(tamanos.nombre);
      expect(tamanos.publico).toBeGreaterThanOrEqual(10);
      const ficha = await abrirDetalle(pagina, SAMBA);
      await expect(ficha.locator('.detalle-publico')).toHaveText(' · Caballero');
      await pagina.keyboard.press('Escape');
      const otra = CATALOGO.find((p) => !p.publico && p.nombre !== SAMBA && p.nombre !== LCS);
      const fichaOtra = await abrirDetalle(pagina, otra.nombre);
      await expect(fichaOtra.locator('.detalle-publico')).toHaveCount(0);
    }, { respuesta: CATALOGO });
  });

  test('escritorio: «Público» junto a Novedades, combinado con talla, búsqueda y novedades; limpiar', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, ESCRITORIO, async (pagina) => {
      const campo = pagina.locator('#campo-publico');
      await expect(campo).toBeVisible();
      // Junto al control de Novedades.
      expect(await pagina.evaluate(() => document.querySelector('#chip-nuevos').nextElementSibling?.id)).toBe('campo-publico');
      const elegir = async (texto) => {
        await campo.locator('[data-campo="publico"]').click();
        await pagina.locator('#filtro-publico').getByRole('button', { name: new RegExp(`^${texto}`) }).click();
      };
      await elegir('Dama');
      await expect(campo.locator('[data-valor-campo="publico"]')).toHaveText('Dama');
      await expect(tarjetas(pagina)).toHaveCount(1);
      await expect(tarjetas(pagina).first()).toContainText('Dama');
      await expect(pagina.locator('#filtros-activos')).toContainText('Público');
      await pagina.screenshot({ path: path.join(CAPTURAS, `publico-escritorio-${browserName}.png`) });
      // Con Novedades: LCS es nuevo ingreso.
      await pagina.locator('#chip-nuevos').click();
      await expect(tarjetas(pagina)).toHaveCount(1);
      // Caballero + Novedades: ninguno.
      await elegir('Caballero');
      await expect(tarjetas(pagina)).toHaveCount(0);
      await pagina.locator('#filtros-activos').getByRole('button', { name: /Quitar novedades/i }).click();
      await expect(tarjetas(pagina)).toHaveCount(1);
      await expect(tarjetas(pagina).first()).toContainText(SAMBA);
      // Con talla y búsqueda.
      await pagina.evaluate(() => { estado.talla = '40'; renderizarCatalogo(); });
      await expect(tarjetas(pagina)).toHaveCount(1);
      await pagina.locator('#buscar').fill('lcs');
      await expect(tarjetas(pagina)).toHaveCount(0);
      await pagina.locator('#buscar').fill('samba');
      await expect(tarjetas(pagina)).toHaveCount(1);
      // El recuento de cada opción respeta los demás criterios.
      await campo.locator('[data-campo="publico"]').click();
      await expect(pagina.locator('#filtro-publico [data-valor="dama"] .opcion-cantidad')).toContainText('0');
      await expect(pagina.locator('#filtro-publico [data-valor="hombre"] .opcion-cantidad')).toContainText('1');
      await pagina.keyboard.press('Escape');
      // Limpiar todo vuelve a «Todos», que incluye lo no clasificado.
      await pagina.locator('#limpiar-filtros').click();
      await expect(campo.locator('[data-valor-campo="publico"]')).toHaveText('Todos');
      expect(await pagina.evaluate(() => filtrarProductos().length)).toBe(TOTAL);
    }, { respuesta: CATALOGO });
  });

  test('celular: «Público» en la hoja de filtros, sincronizado, con recuento y restablecer', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await pagina.locator('#abrir-filtros').click();
      const hoja = pagina.locator('#hoja-filtros');
      await expect(hoja.locator('#hoja-grupo-publico')).toBeVisible();
      await hoja.locator('#hoja-publico').getByRole('button', { name: /^Caballero/ }).click();
      await expect(pagina.locator('#hoja-aplicar')).toHaveText('Ver 1 producto');
      await expect(pagina.locator('#resumen-filtros')).toHaveText('1 activo');
      await expect(pagina.locator('#filtro-publico [data-valor="hombre"]'), 'el control de escritorio queda igual').toHaveAttribute('aria-pressed', 'true');
      await pagina.screenshot({ path: path.join(CAPTURAS, `publico-hoja-${browserName}-390.png`) });
      await pagina.locator('#hoja-restablecer').click();
      await expect(hoja.locator('#hoja-publico [data-valor="__todos__"], #hoja-publico .opcion').first()).toHaveAttribute('aria-pressed', 'true');
      expect(await pagina.evaluate(() => filtrarProductos().length)).toBe(TOTAL);
      await pagina.locator('#hoja-aplicar').click();
    }, { respuesta: CATALOGO });
  });

  test('sin ningún producto clasificado el control no aparece', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, ESCRITORIO, async (pagina) => {
      await expect(pagina.locator('#campo-publico')).toBeHidden();
      await expect(pagina.locator('#hoja-grupo-publico')).toBeHidden();
      await expect(pagina.locator('.tarjeta-publico')).toHaveCount(0);
    }, { respuesta: conEstados(CATALOGO_MIGRADO, SAMBA, { 40: 'DISPONIBLE' }) });
  });
});

test.describe('Ficha: círculos de color', () => {
  test('nombre, estado y anillo; cambiar de círculo actualiza foto, precio, código, tallas y pedido', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const ficha = await abrirDetalle(pagina, SAMBA);
      const circulos = ficha.locator('.variante-muestra');
      await expect(circulos).toHaveCount(3);
      await expect(circulos.nth(0)).toHaveAttribute('aria-pressed', 'true');
      await expect(circulos.nth(1)).toHaveAccessibleName('Negro');
      await expect(ficha.locator('#detalle-color')).toHaveText(CATALOGO.find((p) => p.nombre === SAMBA).variantes[0].color);
      const muestras = await circulos.evaluateAll((botones) => botones.map((b) => {
        const c = b.querySelector('.muestra-circulo');
        const r = b.getBoundingClientRect();
        return { css: c.style.getPropertyValue('--muestra'), neutra: c.classList.contains('muestra-neutra'), clara: c.classList.contains('muestra-clara'),
                 ancho: r.width, alto: r.height, sombra: getComputedStyle(c).boxShadow };
      }));
      expect(muestras[0]).toMatchObject({ css: '#e8dcc8', neutra: false, clara: true });
      expect(muestras[1]).toMatchObject({ css: '#141414', neutra: false });
      expect(muestras[2], 'una muestra no válida no llega a CSS: círculo neutro').toMatchObject({ css: '', neutra: true });
      for (const m of muestras) { expect(m.ancho).toBeGreaterThanOrEqual(44); expect(m.alto).toBeGreaterThanOrEqual(44); }
      expect(muestras[0].sombra, 'el elegido lleva anillo de tinta').toMatch(/rgb\(20, 20, 20\)/);
      expect(muestras[1].sombra).not.toMatch(/0px 0px 0px 5px/);
      await pagina.screenshot({ path: path.join(CAPTURAS, `circulos-${browserName}-390.png`) });
      // Cambiar de círculo (con teclado): foto, precio, código, tallas y acciones del nuevo color.
      // Con teclado: Tab del primer círculo al segundo; el foco es visible.
      await circulos.nth(0).focus();
      await pagina.keyboard.press('Tab');
      await expect(circulos.nth(1)).toBeFocused();
      expect(await circulos.nth(1).evaluate((b) => getComputedStyle(b).outlineStyle)).not.toBe('none');
      await pagina.keyboard.press('Enter');
      await expect(circulos.nth(1)).toHaveAttribute('aria-pressed', 'true');
      await expect(circulos.nth(0)).toHaveAttribute('aria-pressed', 'false');
      await expect(ficha.locator('#detalle-color')).toHaveText('Negro');
      await expect(ficha.locator('#detalle-referencia')).toHaveText('GT-SAMBA-B');
      await expect(ficha.locator('#detalle-precio')).toContainText('99.000');
      const fotoLcs = CATALOGO.find((p) => p.nombre === LCS).variantes[0].imagenes[0].split('/').pop();
      await expect(ficha.locator('.galeria-pista img').first()).toHaveAttribute('src', new RegExp(fotoLcs.replace('.', '\\.')));
      await ficha.locator('.talla[data-talla="41"]').click();
      await expect(ficha.locator('[data-accion="pedir-ahora"]')).toHaveText('Pedir este par por WhatsApp');
      await ficha.locator('.talla[data-talla="40"]').click();
      await expect(ficha.locator('[data-accion="pedir-ahora"]')).toHaveText('Consultar esta talla por WhatsApp');
      // El carrito guarda el identificador de la variante elegida.
      await ficha.locator('.talla[data-talla="41"]').click();
      await pagina.evaluate(() => agregarDesdeDetalle());
      expect(await pagina.evaluate(() => JSON.parse(localStorage.getItem('gama-talla-carrito-v3')).lineas.map((l) => [l.variante, l.talla]))).toEqual([['samba-negro', '41']]);
    }, { respuesta: CATALOGO });
  });

  test('un solo color: su nombre y su muestra, sin selector', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const ficha = await abrirDetalle(pagina, LCS);
      await expect(ficha.locator('.variante-muestra')).toHaveCount(0);
      await expect(ficha.locator('.muestra-unica')).toBeVisible();
      await expect(ficha.locator('#detalle-color')).toHaveText(CATALOGO.find((p) => p.nombre === LCS).variantes[0].color);
    }, { respuesta: CATALOGO });
  });
});

test.describe('Ficha: abre siempre desde arriba', () => {
  // Escritorio con poca altura: la ficha necesita desplazarse.
  for (const vista of [CELULAR, { ...ESCRITORIO, alto: 700 }]) {
    test(`${vista.nombre}px: cerrar una ficha desplazada y abrir otra la muestra desde arriba; el catálogo no se mueve`, async ({ browser, browserName }) => {
      await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
        const ficha = await abrirDetalle(pagina, SAMBA);
        const caja = pagina.locator('#modal-producto .modal-caja');
        await caja.evaluate((c) => { c.scrollTop = c.scrollHeight; });
        expect(await caja.evaluate((c) => c.scrollTop)).toBeGreaterThan(40);
        const catalogoAntes = await pagina.evaluate(() => window.scrollY);
        await ficha.getByRole('button', { name: 'Cerrar detalles' }).click();
        await expect(pagina.locator('#modal-producto')).toHaveJSProperty('open', false);
        await expect.poll(() => pagina.evaluate(() => document.activeElement?.closest('article.tarjeta')?.textContent || ''), { message: 'el foco vuelve a su tarjeta' }).toContain(SAMBA);
        expect(await pagina.evaluate(() => window.scrollY), 'el catálogo conserva su posición').toBe(catalogoAntes);
        const otra = await abrirDetalle(pagina, LCS);
        expect(await caja.evaluate((c) => c.scrollTop), 'la nueva ficha empieza arriba').toBe(0);
        const titulo = await otra.locator('#detalle-nombre').boundingBox();
        expect(titulo.y).toBeGreaterThanOrEqual(0);
        expect(titulo.y + titulo.height).toBeLessThanOrEqual(vista.alto);
        // Dentro de una ficha abierta, elegir talla o refrescar la disponibilidad conserva la posición.
        await caja.evaluate((c) => { c.scrollTop = 160; });
        const posicion = await caja.evaluate((c) => c.scrollTop);
        await pagina.evaluate(() => elegirTalla('40'));
        await pagina.evaluate(() => refrescarCatalogo());
        await pagina.waitForTimeout(150);
        expect(Math.abs((await caja.evaluate((c) => c.scrollTop)) - posicion)).toBeLessThanOrEqual(2);
      }, { respuesta: CATALOGO });
    });
  }
});

for (const vista of VISTAS) {
  test(`${vista.nombre}px: tarjetas con público y círculos sin desbordes`, async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
      await tarjetaDe(pagina, SAMBA).scrollIntoViewIfNeeded();
      await pagina.screenshot({ path: path.join(CAPTURAS, `tarjetas-publico-${browserName}-${vista.nombre}.png`) });
      const ficha = await abrirDetalle(pagina, SAMBA);
      await ficha.locator('.variantes-muestras').scrollIntoViewIfNeeded();
      const medida = await ficha.evaluate((f) => {
        const grupo = f.querySelector('.variantes-muestras').getBoundingClientRect();
        const caja = document.querySelector('#modal-producto .modal-caja').getBoundingClientRect();
        return { dentro: grupo.left >= caja.left - 1 && grupo.right <= caja.right + 1, desborde: document.documentElement.scrollWidth - innerWidth };
      });
      expect(medida).toEqual({ dentro: true, desborde: 0 });
      await pagina.screenshot({ path: path.join(CAPTURAS, `ficha-circulos-${browserName}-${vista.nombre}.png`) });
    }, { respuesta: CATALOGO });
  });
}
