// Etapa 9 · Objetivo 1: «Ver detalles» con personalidad en reposo y respuesta sin depender de :hover.
import { test, expect } from '@playwright/test';
import { VISTAS, enTienda, centrarTarjeta, proporcionTinta, detalleQuieto, sinDesborde, contraste } from './ayudas.js';

const REPOSO_MIN = 0.1;
const REPOSO_MAX = 0.55;
const ACTIVA_MIN = 0.75;

for (const vista of VISTAS) {
  test.describe(`«Ver detalles» · ${vista.nombre}px`, () => {
    test('en reposo se ve la celda de tinta, sin cursor ni interacción', async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        const tarjeta = pagina.locator('.tarjeta').first();
        await centrarTarjeta(pagina, tarjeta);
        const caja = tarjeta.locator('.tarjeta-enlace-caja');
        const tinta = await proporcionTinta(pagina, caja);
        expect(tinta, 'proporción de tinta visible en reposo').toBeGreaterThan(REPOSO_MIN);
        expect(tinta).toBeLessThan(REPOSO_MAX);

        const datos = await tarjeta.locator('.tarjeta-enlace').evaluate((b) => {
          const s = getComputedStyle(b);
          const c = getComputedStyle(b.querySelector('.tarjeta-enlace-caja'));
          const t = getComputedStyle(b.querySelector('.tarjeta-enlace-tinta'));
          return {
            texto: b.textContent.trim(), nombre: b.getAttribute('aria-label'),
            alto: b.getBoundingClientRect().height, transform: s.transform, posicion: s.position,
            sombra: c.boxShadow, imagen: c.backgroundImage, imagenTinta: t.backgroundImage, radio: parseFloat(c.borderTopLeftRadius),
            borde: c.borderTopColor, fondo: c.backgroundColor, color: s.color, colorTinta: t.color, fondoTinta: t.backgroundColor,
          };
        });
        expect(datos.texto).toBe('Ver detalles');
        expect(datos.nombre).toMatch(/^Ver detalles de /);
        expect(datos.alto, 'área táctil').toBeGreaterThanOrEqual(44);
        expect(datos.transform, 'sin transform en el botón').toBe('none');
        expect(datos.posicion, 'sin posición propia: el ::after cubre la tarjeta').toBe('static');
        expect([datos.sombra, datos.imagen, datos.imagenTinta]).toEqual(['none', 'none', 'none']);
        expect(datos.radio).toBeLessThanOrEqual(2);
        expect(datos.borde, 'marco en tinta').toBe('rgb(20, 20, 20)');
        expect(contraste(datos.color, datos.fondo)).toBeGreaterThanOrEqual(4.5);
        expect(contraste(datos.colorTinta, datos.fondoTinta)).toBeGreaterThanOrEqual(4.5);
        await sinDesborde(pagina);
      });
    });

    test('las etiquetas se alinean por fila y miden lo mismo', async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        const filas = await pagina.locator('.tarjeta').evaluateAll((tarjetas) => {
          const porFila = new Map();
          tarjetas.forEach((t) => {
            const fila = Math.round(t.getBoundingClientRect().top + scrollY);
            const r = t.querySelector('.tarjeta-enlace-caja').getBoundingClientRect();
            if (!porFila.has(fila)) porFila.set(fila, []);
            porFila.get(fila).push({ arriba: Math.round(r.top + scrollY), alto: Math.round(r.height) });
          });
          return [...porFila.values()];
        });
        expect(filas.length).toBeGreaterThan(1);
        for (const fila of filas) {
          expect(new Set(fila.map((c) => c.arriba)).size, 'misma altura en la fila').toBe(1);
          expect(new Set(fila.map((c) => c.alto)).size, 'mismo alto en la fila').toBe(1);
        }
      });
    });

    test('toda la tarjeta es una sola superficie: foto, nombre y botón abren el producto correcto una vez', async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        const anidados = await pagina.locator('.tarjeta button button, .tarjeta button a, .tarjeta a button').count();
        expect(anidados, 'sin controles anidados').toBe(0);
        await pagina.evaluate(() => {
          window.__aperturas = 0;
          const original = window.abrirDetalles;
          window.abrirDetalles = (...a) => { window.__aperturas += 1; return original(...a); };
        });
        const tarjeta = pagina.locator('.tarjeta').nth(1);
        const nombre = (await tarjeta.locator('.tarjeta-nombre').textContent()).trim();
        for (const selector of ['.tarjeta-media', '.tarjeta-nombre', '.precio-actual', '.tarjeta-enlace-caja']) {
          await centrarTarjeta(pagina, tarjeta);
          const zona = await tarjeta.locator(selector).boundingBox();
          const dueno = await pagina.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.tarjeta-enlace')?.closest('.tarjeta') === document.querySelectorAll('.tarjeta')[1], [zona.x + zona.width / 2, zona.y + zona.height / 2]);
          expect(dueno, `${selector} pertenece a la superficie del botón`).toBe(true);
          await pagina.evaluate(() => { window.__aperturas = 0; });
          await pagina.mouse.click(zona.x + zona.width / 2, zona.y + zona.height / 2);
          const dialogo = await detalleQuieto(pagina);
          await expect(dialogo.locator('#detalle-nombre')).toHaveText(nombre);
          expect(await pagina.evaluate(() => window.__aperturas), `clic en ${selector}`).toBe(1);
          await dialogo.getByRole('button', { name: 'Cerrar detalles' }).click();
          await expect(dialogo).toHaveJSProperty('open', false);
        }
      });
    });

    test('al pulsar, la tinta se abre mientras el dedo o el botón siguen abajo', async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        const tarjeta = pagina.locator('.tarjeta').nth(1);
        await centrarTarjeta(pagina, tarjeta);
        const caja = tarjeta.locator('.tarjeta-enlace-caja');
        const reposo = await proporcionTinta(pagina, caja);
        const zona = await caja.boundingBox();
        await pagina.mouse.move(zona.x + zona.width / 2, zona.y + zona.height / 2);
        await pagina.mouse.down();
        await expect.poll(() => proporcionTinta(pagina, caja), { message: 'tinta al pulsar' }).toBeGreaterThan(ACTIVA_MIN);
        expect(await proporcionTinta(pagina, caja)).toBeGreaterThan(reposo + 0.25);
        const foto = await tarjeta.locator('.tarjeta-media').evaluate((m) => getComputedStyle(m).transform);
        expect(foto, 'la foto también responde').not.toBe('none');
        await pagina.mouse.up();
        const dialogo = await detalleQuieto(pagina);
        await expect(dialogo.locator('#detalle-nombre')).toBeVisible();
      });
    });

    if (vista.tactil) {
      test('toque rápido en pantalla táctil: la respuesta se sostiene y abre el detalle', async ({ browser, browserName }) => {
        await enTienda({ browser, browserName }, vista, async (pagina) => {
          const tarjeta = pagina.locator('.tarjeta').nth(1);
          await centrarTarjeta(pagina, tarjeta);
          const boton = tarjeta.locator('.tarjeta-enlace');
          const reposo = await boton.locator('.tarjeta-enlace-tinta').evaluate((n) => getComputedStyle(n).clipPath);
          const zona = await boton.boundingBox();
          await pagina.touchscreen.tap(zona.x + zona.width / 2, zona.y + zona.height / 2);
          // El toque ya terminó y la tinta sigue abierta, también mientras entra el detalle.
          await expect(boton).toHaveAttribute('data-pulsado', '');
          const recorte = () => boton.locator('.tarjeta-enlace-tinta').evaluate((n) => getComputedStyle(n).clipPath);
          await expect.poll(recorte, { message: 'la tinta se abre tras el toque', intervals: [16, 16, 32, 32] }).not.toBe(reposo);
          await detalleQuieto(pagina);
          await expect(boton).not.toHaveAttribute('data-pulsado', '');
        });
      });

      test('el dedo sobre la tarjeta (toque real por CDP) abre la tinta antes de soltar', async ({ browser, browserName }) => {
        test.skip(browserName !== 'chromium', 'Los eventos táctiles de bajo nivel (CDP) solo existen en Chromium.');
        await enTienda({ browser, browserName }, vista, async (pagina) => {
          const tarjeta = pagina.locator('.tarjeta').nth(1);
          await centrarTarjeta(pagina, tarjeta);
          const caja = tarjeta.locator('.tarjeta-enlace-caja');
          const zona = await caja.boundingBox();
          const cdp = await pagina.context().newCDPSession(pagina);
          const punto = { x: zona.x + zona.width / 2, y: zona.y + zona.height / 2 };
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [punto] });
          await expect.poll(() => proporcionTinta(pagina, caja), { message: 'tinta con el dedo abajo' }).toBeGreaterThan(ACTIVA_MIN);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await expect(pagina.locator('#modal-producto')).toHaveJSProperty('open', true);
          await detalleQuieto(pagina);
        });
      });

      test('empezar a desplazar con el dedo sobre la tarjeta no abre el detalle ni deja la tinta abierta', async ({ browser, browserName }) => {
        test.skip(browserName !== 'chromium', 'Los eventos táctiles de bajo nivel (CDP) solo existen en Chromium.');
        await enTienda({ browser, browserName }, vista, async (pagina) => {
          const tarjeta = pagina.locator('.tarjeta').nth(1);
          await centrarTarjeta(pagina, tarjeta);
          const caja = tarjeta.locator('.tarjeta-enlace-caja');
          const reposo = await proporcionTinta(pagina, caja);
          const zona = await caja.boundingBox();
          const inicial = await pagina.evaluate(() => scrollY);
          const cdp = await pagina.context().newCDPSession(pagina);
          // Secuencia real de dedo (synthesizeScrollGesture no desplaza en Chromium sin pantalla).
          const x = zona.x + zona.width / 2;
          const y = zona.y + zona.height / 2;
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
          for (let paso = 1; paso <= 10; paso++) {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - paso * 24 }] });
            await pagina.waitForTimeout(16);
          }
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await expect.poll(() => pagina.evaluate(() => scrollY), { message: 'la página se desplazó' }).toBeGreaterThan(inicial + 100);
          await expect(pagina.locator('#modal-producto')).toHaveJSProperty('open', false);
          await expect(tarjeta.locator('.tarjeta-enlace')).not.toHaveAttribute('data-pulsado', '');
          await pagina.waitForTimeout(450);
          expect(await proporcionTinta(pagina, caja), 'la tinta vuelve al reposo').toBeLessThan(reposo + 0.1);
        });
      });

      test('en táctil, pasar por encima no activa nada: no hay estado «hover» pegado', async ({ browser, browserName }) => {
        test.skip(browserName === 'firefox', 'Firefox en Playwright no emula (hover: none) sin isMobile.');
        await enTienda({ browser, browserName }, vista, async (pagina) => {
          expect(await pagina.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true);
          const tarjeta = pagina.locator('.tarjeta').nth(1);
          await centrarTarjeta(pagina, tarjeta);
          const caja = tarjeta.locator('.tarjeta-enlace-caja');
          const zona = await caja.boundingBox();
          await pagina.mouse.move(zona.x + zona.width / 2, zona.y + zona.height / 2);
          await pagina.waitForTimeout(450);
          expect(await proporcionTinta(pagina, caja)).toBeLessThan(REPOSO_MAX);
        });
      });
    } else {
      test('hover: pasar sobre la foto abre la tinta de esa tarjeta y solo de esa', async ({ browser, browserName }) => {
        await enTienda({ browser, browserName }, vista, async (pagina) => {
          const tarjeta = pagina.locator('.tarjeta').nth(1);
          const vecina = pagina.locator('.tarjeta').nth(0);
          await centrarTarjeta(pagina, tarjeta);
          // Por coordenadas: la foto está cubierta a propósito por el ::after del botón.
          const foto = await tarjeta.locator('.tarjeta-media').boundingBox();
          await pagina.mouse.move(foto.x + foto.width / 2, foto.y + foto.height / 2);
          const caja = tarjeta.locator('.tarjeta-enlace-caja');
          await expect.poll(() => proporcionTinta(pagina, caja), { message: 'tinta con hover' }).toBeGreaterThan(ACTIVA_MIN);
          expect(await proporcionTinta(pagina, vecina.locator('.tarjeta-enlace-caja')), 'la vecina sigue en reposo').toBeLessThan(REPOSO_MAX);
          const flecha = await tarjeta.locator('.tarjeta-enlace-flecha').evaluate((f) => getComputedStyle(f, '::before').transform);
          expect(flecha, 'la flecha reacciona').not.toBe('none');
          await pagina.mouse.move(2, 2);
          await expect.poll(() => proporcionTinta(pagina, caja), { message: 'vuelve al reposo' }).toBeLessThan(REPOSO_MAX);
        });
      });

      test('teclado: Tab llega a la tarjeta, se ve el foco y Enter abre; al cerrar vuelve el foco', async ({ browser, browserName }) => {
        await enTienda({ browser, browserName }, vista, async (pagina) => {
          const primera = pagina.locator('.tarjeta').nth(0).locator('.tarjeta-enlace');
          const segunda = pagina.locator('.tarjeta').nth(1).locator('.tarjeta-enlace');
          await centrarTarjeta(pagina, pagina.locator('.tarjeta').nth(1));
          await primera.focus();
          // WebKit no lleva el foco a los botones con Tab solo: su convenio es Alt+Tab.
          await pagina.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
          await expect(segunda).toBeFocused();
          const estado = await segunda.evaluate((b) => { const a = getComputedStyle(b, '::after'); return { visible: b.matches(':focus-visible'), anillo: a.outlineStyle, ancho: parseFloat(a.outlineWidth), color: a.outlineColor }; });
          expect(estado.visible).toBe(true);
          expect(estado.anillo).toBe('solid');
          expect(estado.ancho).toBeGreaterThanOrEqual(2);
          expect(estado.color).toBe('rgb(31, 59, 255)');
          await expect.poll(() => proporcionTinta(pagina, segunda.locator('.tarjeta-enlace-caja')), { message: 'tinta con foco' }).toBeGreaterThan(ACTIVA_MIN);
          await pagina.keyboard.press('Enter');
          const dialogo = await detalleQuieto(pagina);
          await pagina.keyboard.press('Escape');
          await expect(dialogo).toHaveJSProperty('open', false);
          await expect(segunda).toBeFocused();
        });
      });
    }

    test('movimiento reducido: el estado cambia sin recorrido en el tiempo y sigue habiendo respuesta', async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        const tarjeta = pagina.locator('.tarjeta').nth(1);
        await centrarTarjeta(pagina, tarjeta);
        const duraciones = await tarjeta.locator('.tarjeta-enlace').evaluate((b) => [
          getComputedStyle(b.querySelector('.tarjeta-enlace-tinta')).transitionDuration,
          getComputedStyle(b.querySelector('.tarjeta-enlace-flecha'), '::before').transitionDuration,
          getComputedStyle(b.querySelector('.tarjeta-enlace-flecha'), '::after').transitionDuration,
        ]);
        expect(duraciones).toEqual(['0s', '0s', '0s']);
        const caja = tarjeta.locator('.tarjeta-enlace-caja');
        const zona = await caja.boundingBox();
        await pagina.mouse.move(zona.x + zona.width / 2, zona.y + zona.height / 2);
        await pagina.mouse.down();
        expect(await proporcionTinta(pagina, caja), 'tinta inmediata al pulsar').toBeGreaterThan(ACTIVA_MIN);
        await pagina.mouse.up();
        const dialogo = pagina.locator('#modal-producto');
        await expect(dialogo).toHaveJSProperty('open', true);
        expect(await dialogo.evaluate((d) => d.hasAttribute('data-preparando') || d.hasAttribute('data-entrada'))).toBe(false);
      }, { reducido: true });
    });
  });
}

test('una tarjeta agotada conserva la etiqueta, con menos fuerza, y abre el detalle', async ({ browser, browserName }) => {
  await enTienda({ browser, browserName }, VISTAS[1], async (pagina) => {
    const mas = pagina.getByRole('button', { name: /^Mostrar .*más$/ });
    while (await mas.isVisible().catch(() => false)) {
      const antes = await pagina.locator('.tarjeta').count();
      await mas.click();
      await expect.poll(() => pagina.locator('.tarjeta').count()).toBeGreaterThan(antes);
    }
    const agotada = pagina.locator('.tarjeta-agotada').first();
    await expect(agotada).toBeVisible();
    const colores = await agotada.locator('.tarjeta-enlace-caja').evaluate((c) => ({ borde: getComputedStyle(c).borderTopColor, tinta: getComputedStyle(c.querySelector('.tarjeta-enlace-tinta')).backgroundColor }));
    expect(colores).toEqual({ borde: 'rgb(94, 94, 90)', tinta: 'rgb(94, 94, 90)' });
    await centrarTarjeta(pagina, agotada);
    await agotada.getByRole('button', { name: /^Ver detalles de/ }).click();
    const dialogo = await detalleQuieto(pagina);
    await expect(dialogo.locator('#detalle-disponibilidad')).toHaveText(/Agotado/);
  });
});
