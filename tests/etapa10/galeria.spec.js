// Etapa 10 · Objetivo 1: la fotografía queda centrada y equilibrada en su galería, con cualquier proporción.
import { test, expect } from '@playwright/test';
import { VISTAS, URL_PRUEBA, enTienda, mostrarTodo, abrirDetalle, detalleQuieto, centrarTarjeta } from '../etapa9/ayudas.js';
import { VENTANAS_PORTATIL, medirFoto, recorrerCatalogo, margenesEnPantalla } from './ayudas-etapa10.js';

const TOLERANCIA = 1; // Redondeo de píxeles.
const TODAS = [...VISTAS, ...VENTANAS_PORTATIL];

for (const vista of TODAS) {
  test.describe(`Galería · ${vista.nombre}`, () => {
    test('los 28 productos reales: márgenes iguales a cada lado, sin deformar ni recortar', async ({ browser, browserName }) => {
      test.setTimeout(120000);
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        await mostrarTodo(pagina);
        const fotos = await recorrerCatalogo(pagina, medirFoto);
        expect(fotos).toHaveLength(28);
        const proporciones = new Set(fotos.map((f) => f.natural.toFixed(3)));
        expect(proporciones.size, 'se comprueban fotos cuadradas y verticales').toBeGreaterThanOrEqual(2);
        for (const f of fotos) {
          const ctx = `${f.nombre} (${f.src.split('/').pop()})`;
          expect(Math.abs(f.izq - f.der), `${ctx}: izquierda ${f.izq} / derecha ${f.der}`).toBeLessThanOrEqual(TOLERANCIA);
          expect(Math.abs(f.arr - f.aba), `${ctx}: arriba ${f.arr} / abajo ${f.aba}`).toBeLessThanOrEqual(TOLERANCIA);
          expect(f.ajuste, `${ctx}: la foto se ve entera`).toBe('contain');
          expect(Math.abs(f.pintada - f.natural), `${ctx}: conserva su proporción`).toBeLessThan(0.01);
          expect(f.izq, `${ctx}: dentro de su espacio`).toBeGreaterThanOrEqual(-TOLERANCIA);
          expect(f.arr, `${ctx}: dentro de su espacio`).toBeGreaterThanOrEqual(-TOLERANCIA);
          expect(f.dentroDeCaja, `${ctx}: se ve sin desplazar la ficha`).toBe(true);
        }
      }, { reducido: true });
    });

    for (const [tipo, nombre] of [['cuadrada', 'SAMBA'], ['vertical con barras negras', 'Samba OG']]) {
      test(`en pantalla: foto ${tipo} centrada, medida por píxeles`, async ({ browser, browserName }) => {
        await enTienda({ browser, browserName }, vista, async (pagina) => {
          const dialogo = await abrirDetalle(pagina, nombre);
          await dialogo.locator('.galeria-foto img').first().evaluate((i) => i.decode());
          const zona = await dialogo.evaluate((d) => {
            const R = (e) => e.getBoundingClientRect();
            const galeria = R(d.querySelector('.galeria'));
            const info = R(d.querySelector('.detalle-info'));
            const pista = R(d.querySelector('.galeria-pista'));
            const dosColumnas = info.left > galeria.left + 50;
            if (!dosColumnas) return { arriba: 0, borde: 0, x: pista.left, y: pista.top, width: pista.width, height: pista.height };
            // Escritorio: el campo de papel, empezando bajo el texto de la ruta (40 px) y dejando fuera
            // 8 px de los demás bordes (la esquina redondeada del diálogo deja ver el velo oscuro).
            const fin = Math.min(galeria.bottom, R(d.querySelector('.modal-caja')).bottom);
            return { arriba: 40, borde: 8, x: galeria.left + 8, y: galeria.top + 40, width: galeria.width - 16, height: fin - galeria.top - 48 };
          });
          const { arriba, borde, ...clip } = zona;
          const m = await margenesEnPantalla(pagina, clip);
          expect(m.vacia, 'la foto se pintó').toBe(false);
          expect(Math.abs(m.izq - m.der), `izquierda ${m.izq} / derecha ${m.der}`).toBeLessThanOrEqual(2);
          const margenArriba = m.arr + arriba;
          const margenAbajo = m.aba + borde;
          expect(Math.abs(margenArriba - margenAbajo), `arriba ${margenArriba} / abajo ${margenAbajo}`).toBeLessThanOrEqual(2);
        }, { reducido: true });
      });
    }
  });
}

for (const vista of [VISTAS[4], VENTANAS_PORTATIL[0], VISTAS[1]]) {
  test(`varias fotos ${vista.nombre}: centrada en cada foto, y la navegación sigue funcionando`, async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, vista, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, 'tres colores');
      const contador = dialogo.locator('.galeria-contador');
      const pista = dialogo.locator('.galeria-pista');
      const siguiente = dialogo.getByRole('button', { name: 'Foto siguiente' });
      for (const [paso, texto] of [[0, '1 / 4'], [1, '2 / 4'], [2, '3 / 4'], [3, '4 / 4']]) {
        if (paso) await siguiente.click();
        await expect(contador).toHaveText(texto);
        await expect.poll(() => pista.evaluate((p) => Math.round(p.scrollLeft / p.clientWidth)), { message: `pista en la foto ${paso + 1}` }).toBe(paso);
        const f = await pagina.evaluate(medirFoto);
        expect(Math.abs(f.pintada - f.natural)).toBeLessThan(0.01);
      }
      const m = await dialogo.evaluate((d) => {
        const R = (s) => d.querySelector(s).getBoundingClientRect();
        return { p: R('.galeria-pista'), a: R('.galeria-anterior'), s: R('.galeria-siguiente'), g: R('.galeria'), r: R('.galeria-puntos'), c: R('.galeria-contador'), v: R('.galeria-visor') };
      });
      expect(Math.abs((m.p.left - m.g.left) - (m.g.right - m.p.right)), 'la foto centrada a lo ancho').toBeLessThanOrEqual(TOLERANCIA);
      if (vista.ancho >= 960) {
        expect(m.a.right, 'flecha anterior fuera de la foto').toBeLessThanOrEqual(m.p.left + 1);
        expect(m.s.left, 'flecha siguiente fuera de la foto').toBeGreaterThanOrEqual(m.p.right - 1);
        expect(Math.abs((m.p.left - m.a.right) - (m.s.left - m.p.right)), 'flechas a la misma distancia').toBeLessThanOrEqual(TOLERANCIA);
        expect(Math.abs(m.r.left - m.p.left), 'la regla arranca con la foto').toBeLessThanOrEqual(TOLERANCIA);
        expect(Math.abs(m.c.right - m.p.right), 'el contador termina con la foto').toBeLessThanOrEqual(TOLERANCIA);
        expect(m.r.top, 'la regla va debajo de la foto').toBeGreaterThanOrEqual(m.p.bottom - 1);
        expect(m.c.bottom, 'la regla cabe en la galería').toBeLessThanOrEqual(m.g.bottom + 1);
      }
    }, { url: URL_PRUEBA });
  });
}

for (const vista of [VENTANAS_PORTATIL[0], VENTANAS_PORTATIL[2]]) {
  test(`al desplazar la ficha ${vista.nombre}: la foto sigue centrada y a la vista`, async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, vista, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, 'tres colores');
      const caja = dialogo.locator('.modal-caja');
      const desplazable = await caja.evaluate((c) => c.scrollHeight - c.clientHeight);
      expect(desplazable, 'esta ficha necesita desplazarse').toBeGreaterThan(50);
      const antes = await pagina.evaluate(medirFoto);
      await caja.evaluate((c) => c.scrollTo({ top: c.scrollHeight, behavior: 'instant' }));
      await pagina.waitForTimeout(120);
      const despues = await pagina.evaluate(medirFoto);
      expect(despues.dentroDeCaja, 'la foto no se va con el desplazamiento').toBe(true);
      expect(Math.abs(despues.arr - despues.aba), `arriba ${despues.arr} / abajo ${despues.aba}`).toBeLessThanOrEqual(TOLERANCIA);
      expect(Math.abs(despues.izq - antes.izq)).toBeLessThanOrEqual(TOLERANCIA);
    }, { url: URL_PRUEBA });
  });
}

test('la etiqueta «Agotado» queda sobre la foto en una ventana baja', async ({ browser, browserName }) => {
  await enTienda({ browser, browserName }, VENTANAS_PORTATIL[0], async (pagina) => {
    await mostrarTodo(pagina);
    const tarjeta = pagina.locator('.tarjeta-agotada').first();
    await centrarTarjeta(pagina, tarjeta);
    await tarjeta.getByRole('button', { name: /^Ver detalles de/ }).click();
    const dialogo = await detalleQuieto(pagina);
    const m = await dialogo.evaluate((d) => {
      const R = (s) => d.querySelector(s).getBoundingClientRect();
      return { e: R('.galeria .etiqueta-agotado'), p: R('.galeria-pista') };
    });
    expect(m.e.left).toBeGreaterThanOrEqual(m.p.left);
    expect(m.e.right).toBeLessThanOrEqual(m.p.right);
    expect(m.e.top).toBeGreaterThanOrEqual(m.p.top);
  });
});
