// Etapa 9 · Objetivo 3: la nueva ficha conserva todo el comportamiento de compra.
import { test, expect } from '@playwright/test';
import { VISTAS, CELULAR, ESCRITORIO, URL_PRUEBA, enTienda, abrirDetalle, detalleQuieto, fichaQuieta, sinDesborde, tarjetaDe, contraste } from './ayudas.js';

const CLAVE_PRUEBA = 'gama-talla-carrito-v3-prueba';
const leerCarrito = (pagina) => pagina.evaluate((clave) => JSON.parse(localStorage.getItem(clave) || 'null'), CLAVE_PRUEBA);
const prueba = { url: URL_PRUEBA };

for (const vista of [CELULAR, ESCRITORIO]) {
  test.describe(`Detalle · ${vista.nombre}px`, () => {
    test('apertura y cierre con ×, Escape y clic fuera; el foco vuelve a la tarjeta', async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        const boton = pagina.locator('.tarjeta').first().getByRole('button', { name: /^Ver detalles de/ });
        await boton.click();
        let dialogo = await detalleQuieto(pagina);
        await expect(dialogo.locator('#detalle-nombre')).toBeVisible();
        expect(await pagina.evaluate(() => document.documentElement.classList.contains('sin-desplazamiento'))).toBe(true);
        await dialogo.getByRole('button', { name: 'Cerrar detalles' }).click();
        await expect(dialogo).toHaveJSProperty('open', false);
        await expect(boton).toBeFocused();
        expect(await pagina.evaluate(() => document.documentElement.classList.contains('sin-desplazamiento'))).toBe(false);

        await boton.click();
        dialogo = await detalleQuieto(pagina);
        await pagina.keyboard.press('Escape');
        await expect(dialogo).toHaveJSProperty('open', false);

        await boton.click();
        dialogo = await detalleQuieto(pagina);
        // El velo es el propio <dialog>: un clic en la esquina (fuera de la caja) lo cierra.
        await pagina.mouse.click(2, 2);
        await expect(dialogo).toHaveJSProperty('open', false);
      });
    });

    test('la presentación corre en cada apertura y no bloquea la compra', async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        for (const nombre of ['tres colores', 'dos colores', 'tres colores']) {
          await tarjetaDe(pagina, nombre).getByRole('button', { name: /^Ver detalles de/ }).click();
          const dialogo = pagina.locator('#modal-producto');
          await expect(dialogo).toHaveAttribute('data-entrada', '');
          const piezas = await dialogo.evaluate((d) => d.getAnimations({ subtree: true }).map((a) => a.animationName).filter(Boolean));
          expect(piezas, 'la marca entra en orden con el resto').toContain('detalle-pieza');
          // Se puede elegir talla sin esperar a que termine.
          await dialogo.locator('.talla:not(:disabled)').first().click();
          await expect(dialogo.locator('.compra-talla')).toHaveAttribute('data-elegida', '');
          await detalleQuieto(pagina);
          await dialogo.getByRole('button', { name: 'Cerrar detalles' }).click();
          await expect(dialogo).toHaveJSProperty('open', false);
        }
      }, prueba);
    });

    test('galería: flechas, regla, teclado y deslizamiento mantienen foto e indicadores sincronizados', async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        const dialogo = await abrirDetalle(pagina, 'tres colores');
        const contador = dialogo.locator('.galeria-contador');
        const pista = dialogo.locator('.galeria-pista');
        const tramos = dialogo.locator('.galeria-punto');
        const actual = () => tramos.evaluateAll((t) => t.findIndex((x) => x.getAttribute('aria-current') === 'true'));
        const visible = () => pista.evaluate((p) => Math.round(p.scrollLeft / p.clientWidth));
        await expect(contador).toHaveText('1 / 4');
        await expect(tramos).toHaveCount(4);
        await expect(dialogo.getByRole('button', { name: 'Foto anterior' })).toBeDisabled();

        await dialogo.getByRole('button', { name: 'Foto siguiente' }).click();
        await expect(contador).toHaveText('2 / 4');
        await expect.poll(visible, { message: 'la pista llega a la foto 2' }).toBe(1);
        expect(await actual()).toBe(1);

        await tramos.nth(3).click();
        await expect(contador).toHaveText('4 / 4');
        await expect.poll(visible, { message: 'la pista llega a la foto 4' }).toBe(3);
        await expect(dialogo.getByRole('button', { name: 'Foto siguiente' })).toBeDisabled();

        await dialogo.getByRole('button', { name: 'Foto anterior' }).click();
        await expect(contador).toHaveText('3 / 4');
        await expect.poll(visible).toBe(2);

        await pista.focus();
        await pagina.keyboard.press('Home');
        await expect(contador).toHaveText('1 / 4');
        await pagina.keyboard.press('End');
        await expect(contador).toHaveText('4 / 4');
        await pagina.keyboard.press('ArrowLeft');
        await expect(contador).toHaveText('3 / 4');
        await expect.poll(visible).toBe(2);

        // Deslizar: el desplazamiento de la pista manda sobre los indicadores.
        await pista.evaluate((p) => p.scrollTo({ left: 0, behavior: 'instant' }));
        await expect(contador).toHaveText('1 / 4');
        expect(await actual()).toBe(0);

        // La foto se ve entera dentro del escenario.
        const encaje = await dialogo.locator('.galeria-foto img').first().evaluate((i) => ({ ajuste: getComputedStyle(i).objectFit }));
        expect(encaje.ajuste).toBe('contain');
      }, prueba);
    });

    test('variantes: el color sincroniza foto, tallas, precio, referencia y código de barras', async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        const dialogo = await abrirDetalle(pagina, 'tres colores');
        const foto = () => dialogo.locator('.galeria-foto img').first().getAttribute('src');
        const barras = () => dialogo.locator('.compra-barras path').getAttribute('d');
        await expect(dialogo.locator('#detalle-color')).toHaveText('Blanco / verde');
        await expect(dialogo.locator('#detalle-referencia')).toHaveText('PRUEBA-TRES-BV');
        const fotoInicial = await foto();
        const barrasIniciales = await barras();
        await dialogo.locator('.talla[data-talla="40"]').click();

        await dialogo.locator('[data-variante="PRUEBA-TRES-NB"]').click();
        await expect(dialogo.locator('#detalle-color')).toHaveText('Negro / blanco');
        await expect(dialogo.locator('#detalle-referencia')).toHaveText('PRUEBA-TRES-NB');
        expect(await foto()).not.toBe(fotoInicial);
        expect(await barras(), 'el código de barras cambia con la referencia').not.toBe(barrasIniciales);
        await expect(dialogo.locator('.detalle-precio .precio-actual')).toHaveText(/320\.000/);
        await expect(dialogo.locator('.precio-ahorro')).toHaveText('20% OFF');
        await expect(dialogo.locator('.galeria-contador')).toHaveText('1 / 2');
        await expect(dialogo.locator('.talla[data-talla="38"]')).toBeDisabled();
        await expect(dialogo.locator('#detalle-talla'), 'la talla 40 sigue disponible').toHaveText('40');
        await expect(dialogo.locator('[data-variante="PRUEBA-TRES-NB"]')).toHaveAttribute('aria-pressed', 'true');

        await dialogo.locator('[data-variante="PRUEBA-TRES-RB"]').click();
        await expect(dialogo.locator('#detalle-talla'), 'la 40 está agotada en este color').toHaveText('Sin elegir');
        await expect(dialogo.locator('.compra-talla')).not.toHaveAttribute('data-elegida', '');
        await expect(dialogo.locator('#detalle-aviso')).toContainText(/talla/i);
      }, prueba);
    });

    test('guía de tallas: se abre encima y conserva color, talla y cantidad', async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        const dialogo = await abrirDetalle(pagina, 'tres colores');
        await dialogo.locator('[data-variante="PRUEBA-TRES-NB"]').click();
        await dialogo.locator('.talla[data-talla="41"]').click();
        await dialogo.getByRole('button', { name: 'Aumentar cantidad' }).click();
        const abrir = dialogo.getByRole('button', { name: 'Guía de tallas' });
        await abrir.click();
        const guia = pagina.locator('#guia-tallas');
        await expect(guia).toHaveJSProperty('open', true);
        await expect(guia.locator('.guia-cuerpo')).toBeVisible();
        expect(await dialogo.evaluate((d) => d.open), 'el detalle sigue abierto debajo').toBe(true);
        await pagina.keyboard.press('Escape');
        await expect(guia).toHaveJSProperty('open', false);
        await expect(dialogo).toHaveJSProperty('open', true);
        await expect(abrir).toBeFocused();
        await expect(dialogo.locator('#detalle-color')).toHaveText('Negro / blanco');
        await expect(dialogo.locator('#detalle-talla')).toHaveText('41');
        await expect(dialogo.locator('.detalle-compra .cantidad-valor')).toHaveText('2');
      }, prueba);
    });

    test('añadir: exige talla, guarda la línea correcta, muestra «Añadido ✓» y no duplica con doble clic', async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        const dialogo = await abrirDetalle(pagina, 'tres colores');
        const agregar = dialogo.locator('.detalle-acciones [data-accion="agregar"]');
        await agregar.scrollIntoViewIfNeeded();

        // Sin talla: nada entra al carrito, la etiqueta lo pide y el foco va a la primera talla libre.
        await agregar.click();
        await expect(dialogo.locator('#detalle-aviso')).toHaveText('Elige una talla EU para continuar.');
        await expect(dialogo.locator('.talla:not(:disabled)').first()).toBeFocused();
        await expect(dialogo).toHaveJSProperty('open', true);
        const rojo = await dialogo.locator('#detalle-talla').evaluate((n) => getComputedStyle(n).color);
        expect(rojo, 'la celda de la talla lo pide en rojo').toBe('rgb(198, 40, 40)');
        expect((await leerCarrito(pagina))?.lineas ?? []).toHaveLength(0);
        await fichaQuieta(dialogo);

        await dialogo.locator('.talla[data-talla="40"]').click();
        await expect(dialogo.locator('#detalle-aviso')).toHaveText('');
        await dialogo.getByRole('button', { name: 'Aumentar cantidad' }).click();
        await agregar.scrollIntoViewIfNeeded();
        await agregar.dblclick();

        await expect(agregar).toContainText('Añadido ✓');
        await expect.poll(() => agregar.evaluate((b) => getComputedStyle(b).backgroundColor), { message: 'rojo oscuro de «Añadido ✓»' }).toBe('rgb(143, 29, 29)');
        await expect(dialogo, 'el detalle sigue abierto').toHaveJSProperty('open', true);
        await expect(pagina.locator('#aviso-flotante-texto')).toContainText('EU 40');
        const carrito = await leerCarrito(pagina);
        expect(carrito.lineas).toHaveLength(1);
        expect(carrito.lineas[0]).toMatchObject({ variante: 'PRUEBA-TRES-BV', talla: '40', cantidad: 2 });
        await expect(pagina.locator('#insignia-carrito')).toHaveText('2');
        // Vuelve a su estado normal.
        await expect(agregar).toContainText('Añadir al carrito', { timeout: 4000 });

        // Otro color del mismo modelo es otra línea.
        await dialogo.locator('[data-variante="PRUEBA-TRES-NB"]').click();
        await agregar.scrollIntoViewIfNeeded();
        await agregar.click();
        await expect(agregar).toContainText('Añadido ✓');
        expect((await leerCarrito(pagina)).lineas.map((l) => l.variante)).toEqual(['PRUEBA-TRES-BV', 'PRUEBA-TRES-NB']);
      }, prueba);
    });

    test('WhatsApp: exige talla y envía modelo, marca, color, referencia, talla, cantidad y precios', async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        const dialogo = await abrirDetalle(pagina, 'tres colores');
        const pedir = dialogo.getByRole('button', { name: 'Pedir este par por WhatsApp' });
        await pedir.scrollIntoViewIfNeeded();
        await pedir.click();
        expect(await pagina.evaluate(() => window.__abiertas.length), 'sin talla no abre WhatsApp').toBe(0);
        await expect(dialogo.locator('#detalle-aviso')).toHaveText('Elige una talla EU para continuar.');
        await fichaQuieta(dialogo);

        await dialogo.locator('[data-variante="PRUEBA-TRES-NB"]').click();
        await expect(dialogo.locator('#detalle-color')).toHaveText('Negro / blanco');
        await dialogo.locator('.talla[data-talla="41"]').click();
        await dialogo.getByRole('button', { name: 'Aumentar cantidad' }).click();
        await pedir.scrollIntoViewIfNeeded();
        await pedir.click();
        const abiertas = await pagina.evaluate(() => window.__abiertas);
        expect(abiertas).toHaveLength(1);
        expect(abiertas[0].startsWith('https://wa.me/573124745942?text=')).toBe(true);
        const mensaje = decodeURIComponent(abiertas[0].split('?text=')[1]);
        for (const linea of ['Modelo: Modelo de prueba · tres colores', 'Marca: Marca de prueba', 'Color: Negro / blanco', 'Referencia: PRUEBA-TRES-NB', 'Talla: EU 41', 'Cantidad: 2', 'Nota: pedido de prueba']) {
          expect(mensaje, linea).toContain(linea);
        }
        expect(mensaje).toMatch(/Precio unitario: .*320\.000/);
        expect(mensaje).toMatch(/Subtotal: .*640\.000/);
      }, prueba);
    });
  });
}

test.describe('Etiqueta de compra', () => {
  test('el código de barras es Code 39 válido para todos sus caracteres', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      // Tabla independiente de la del código de la tienda (patrón binario de 15 módulos por carácter).
      const CARACTERES = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%*';
      const PATRONES = [20957, 29783, 23639, 30485, 20951, 29813, 23669, 20855, 29789, 23645, 29975, 23831, 30533, 22295, 30149, 24005, 21623, 29981, 23837, 22301, 30023, 23879, 30545, 22343, 30161, 24017, 21959, 30065, 23921, 22385, 29015, 18263, 29141, 17879, 29045, 18293, 17783, 29021, 18269, 17477, 17489, 17681, 20753, 17885];
      const binario = (letra) => PATRONES[CARACTERES.indexOf(letra)].toString(2).padStart(15, '0');
      const esperado = (texto) => [...`*${texto}*`].map(binario).join('0');
      for (const texto of ['0123456789', 'ABCDEFGHIJKLM', 'NOPQRSTUVWXYZ', '-. $/+%', 'ADD-SAM', 'GT-001']) {
        const trazo = await pagina.evaluate((t) => crearCodigoBarras(t).querySelector('path').getAttribute('d'), texto);
        const modulos = Array(esperado(texto).length).fill('0');
        for (const [, x, ancho] of trazo.matchAll(/M(\d+) 0h(\d+)v1h-\d+z/g)) {
          for (let i = 0; i < Number(ancho); i++) modulos[Number(x) + i] = '1';
        }
        expect(modulos.join(''), `barras de «${texto}»`).toBe(esperado(texto));
      }
      // Lo que Code 39 no puede representar se queda sin barras, no con unas falsas.
      expect(await pagina.evaluate(() => crearCodigoBarras('ñandú*'))).toBeNull();
    });
  });

  for (const vista of VISTAS) {
    test(`es un solo objeto y la talla se imprime en su celda · ${vista.nombre}px`, async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        const dialogo = await abrirDetalle(pagina, 'SAMBA');
        const celda = dialogo.locator('.compra-talla');
        await expect(dialogo.locator('#detalle-talla')).toHaveText('Sin elegir');
        await expect(dialogo.locator('.detalle-barra-talla')).toHaveText('Sin talla');
        await dialogo.locator('.talla[data-talla="40"]').click();
        await expect(dialogo.locator('#detalle-talla')).toHaveText('40');
        await expect(dialogo.locator('.detalle-barra-talla')).toHaveText('EU 40');
        await expect(celda).toHaveAttribute('data-elegida', '');
        await expect.poll(() => celda.evaluate((c) => getComputedStyle(c).backgroundColor)).toBe('rgb(20, 20, 20)');
        const estilo = await celda.evaluate((c) => ({ color: getComputedStyle(c).color, tam: parseFloat(getComputedStyle(c.querySelector('#detalle-talla')).fontSize) }));
        expect(contraste(estilo.color, 'rgb(20, 20, 20)')).toBeGreaterThanOrEqual(4.5);
        expect(estilo.tam, 'el número se lee de lejos').toBeGreaterThanOrEqual(40);

        const piezas = await dialogo.locator('.detalle-acciones').evaluate((a) => {
          const r = (s) => a.querySelector(s).getBoundingClientRect();
          const marco = a.getBoundingClientRect();
          return {
            etiqueta: r('.compra-etiqueta'), compra: r('.detalle-compra'), pedir: r('.boton-whatsapp-suave'), marco: { left: marco.left, right: marco.right },
            radioAgregar: getComputedStyle(a.querySelector('.boton-comprar')).borderTopLeftRadius,
            fondoAgregar: getComputedStyle(a.querySelector('.boton-comprar')).backgroundColor,
            colorAgregar: getComputedStyle(a.querySelector('.boton-comprar')).color,
            altoAgregar: r('.boton-comprar').height, altoPedir: r('.boton-whatsapp-suave').height,
            sombra: getComputedStyle(a).boxShadow,
          };
        });
        expect(Math.abs(piezas.compra.top - piezas.etiqueta.bottom), 'sin hueco entre datos y compra').toBeLessThanOrEqual(1);
        expect(Math.abs(piezas.pedir.top - piezas.compra.bottom), 'sin hueco entre compra y WhatsApp').toBeLessThanOrEqual(1);
        expect(piezas.fondoAgregar).toBe('rgb(198, 40, 40)');
        expect(piezas.colorAgregar).toBe('rgb(255, 255, 255)');
        expect(piezas.altoAgregar).toBeGreaterThanOrEqual(44);
        expect(piezas.altoPedir).toBeGreaterThanOrEqual(44);
        expect(piezas.sombra).toBe('none');
      });
    });

    test(`tallas: casillas ≥ 44 px, tabla sin huérfanas, agotadas inactivas · ${vista.nombre}px`, async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        const dialogo = await abrirDetalle(pagina, 'SAMBA');
        const tallas = dialogo.locator('.tallas .talla');
        await expect(tallas).toHaveCount(8);
        const medidas = await tallas.evaluateAll((t) => t.map((b) => { const r = b.getBoundingClientRect(); return { ancho: r.width, alto: r.height, arriba: Math.round(r.top) }; }));
        for (const m of medidas) {
          expect(m.ancho, 'ancho táctil').toBeGreaterThanOrEqual(44);
          expect(m.alto, 'alto táctil').toBeGreaterThanOrEqual(44);
        }
        const porFila = new Map();
        medidas.forEach((m) => porFila.set(m.arriba, (porFila.get(m.arriba) || 0) + 1));
        const filas = [...porFila.values()];
        expect(filas.length, `filas: ${filas}`).toBeLessThanOrEqual(2);
        expect(Math.min(...filas), `sin fila huérfana: ${filas}`).toBeGreaterThanOrEqual(4);
        expect(new Set(filas).size, `filas parejas: ${filas}`).toBe(1);

        const libre = dialogo.locator('.talla[data-talla="39"]');
        await libre.click();
        await expect(libre).toHaveAttribute('aria-pressed', 'true');
        await expect.poll(() => libre.evaluate((b) => getComputedStyle(b).backgroundColor)).toBe('rgb(20, 20, 20)');
        expect(contraste(await libre.evaluate((b) => getComputedStyle(b).color), 'rgb(20, 20, 20)')).toBeGreaterThanOrEqual(4.5);
        const agotada = dialogo.locator('.talla[data-talla="44"]');
        await expect(agotada).toBeDisabled();
        await expect(agotada).toHaveAttribute('aria-label', 'EU 44, agotada');
        await expect(dialogo.locator('.talla[aria-pressed="true"]')).toHaveCount(1);
      });
    });

    test(`sin desbordes horizontales con la ficha abierta y desplazada · ${vista.nombre}px`, async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        await sinDesborde(pagina);
        const dialogo = await abrirDetalle(pagina, 'tres colores');
        await sinDesborde(pagina);
        const caja = dialogo.locator('.modal-caja');
        for (const posicion of [0, 0.5, 1]) {
          await caja.evaluate((c, p) => c.scrollTo({ top: (c.scrollHeight - c.clientHeight) * p, behavior: 'instant' }), posicion);
          const m = await caja.evaluate((c) => ({ ancho: c.scrollWidth, visible: c.clientWidth, caja: c.getBoundingClientRect().right }));
          expect(m.ancho).toBeLessThanOrEqual(m.visible);
          expect(m.caja).toBeLessThanOrEqual(vista.ancho);
        }
      }, prueba);
    });
  }
});

test.describe('Composición y barra fija', () => {
  test('escritorio: la foto única ocupa todo el campo de papel, a sangre, y la barra no existe', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, 'SAMBA');
      const medidas = await dialogo.evaluate((d) => {
        const r = (s) => d.querySelector(s).getBoundingClientRect();
        return { caja: r('.modal-caja'), galeria: r('.galeria'), pista: r('.galeria-pista'), info: r('.detalle-info'), acciones: r('.detalle-acciones'), fondo: getComputedStyle(d.querySelector('.detalle'), '::before').backgroundColor, barra: getComputedStyle(d.querySelector('.detalle-barra')).display, flechas: [...d.querySelectorAll('.galeria-flecha')].every((f) => f.hidden), pie: d.querySelector('.galeria-pie').hidden };
      });
      expect(medidas.fondo, 'campo de papel').toBe('rgb(243, 243, 240)');
      expect(Math.abs(medidas.pista.left - medidas.caja.left), 'a sangre por la izquierda').toBeLessThanOrEqual(1);
      expect(Math.abs(medidas.pista.right - medidas.info.left), 'llega hasta la ficha').toBeLessThanOrEqual(1);
      expect(medidas.pista.width / medidas.caja.width).toBeGreaterThan(0.55);
      expect(medidas.flechas && medidas.pie, 'con una foto no hay controles falsos').toBe(true);
      expect(medidas.barra).toBe('none');
      expect(medidas.acciones.bottom, 'la etiqueta de compra se ve sin desplazar').toBeLessThanOrEqual(medidas.caja.bottom + 1);
    });
  });

  test('escritorio: con varias fotos, flechas en los márgenes sin tapar la foto', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, 'tres colores');
      const m = await dialogo.evaluate((d) => {
        const r = (s) => d.querySelector(s).getBoundingClientRect();
        return { a: r('.galeria-anterior'), s: r('.galeria-siguiente'), p: r('.galeria-pista'), fondo: getComputedStyle(d.querySelector('.galeria-siguiente')).backgroundColor };
      });
      expect(m.a.right).toBeLessThanOrEqual(m.p.left + 1);
      expect(m.s.left).toBeGreaterThanOrEqual(m.p.right - 1);
      expect(m.fondo).toBe('rgba(0, 0, 0, 0)');
    }, prueba);
  });

  for (const vista of [VISTAS[0], CELULAR, VISTAS[2]]) {
    test(`barra fija ${vista.nombre}px: visible sin las acciones, oculta con ellas, y compra de verdad`, async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        const dialogo = await abrirDetalle(pagina, 'SAMBA');
        const barra = dialogo.locator('.detalle-barra');
        const caja = dialogo.locator('.modal-caja');
        await expect(barra).toHaveAttribute('data-visible', '');
        const pegada = async () => barra.evaluate((b) => { const r = b.getBoundingClientRect(); const c = b.closest('.modal-caja').getBoundingClientRect(); return Math.abs(r.bottom - c.bottom); });
        await expect.poll(pegada, { message: 'pegada al borde inferior' }).toBeLessThanOrEqual(1);
        await expect(barra.locator('.detalle-barra-talla')).toHaveText('Sin talla');
        await expect(barra.locator('.detalle-barra-precio > span').first()).toHaveText(/120\.000/);

        // Se toca por coordenadas, como un dedo: el clic de Playwright desplaza antes la caja para
        // «traer a la vista» el botón y, en WebKit, eso oculta la barra antes de pulsarla.
        const tocar = async (localizador) => {
          const zona = await localizador.boundingBox();
          await pagina.touchscreen.tap(zona.x + zona.width / 2, zona.y + zona.height / 2);
        };

        // Añadir sin talla desde la barra: lleva a las tallas, con el foco en la primera libre y a la vista.
        await tocar(barra.locator('[data-accion="agregar"]'));
        await expect(dialogo.locator('#detalle-aviso')).toHaveText('Elige una talla EU para continuar.');
        const primera = dialogo.locator('.talla:not(:disabled)').first();
        await expect(primera).toBeFocused();
        await fichaQuieta(dialogo);
        await expect(primera).toBeInViewport();

        // Con la fila de compra a la vista, la barra sobra.
        await dialogo.locator('.detalle-compra').evaluate((n) => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await expect(barra).not.toHaveAttribute('data-visible', '');
        await expect(barra).toBeHidden();

        // Vuelve al subir, sigue pegada y añade la talla elegida.
        await dialogo.locator('.talla[data-talla="40"]').click();
        await caja.evaluate((c) => c.scrollTo({ top: 0, behavior: 'instant' }));
        await expect(barra).toHaveAttribute('data-visible', '');
        await expect(barra.locator('.detalle-barra-talla')).toHaveText('EU 40');
        await expect.poll(pegada).toBeLessThanOrEqual(1);
        const agregar = barra.locator('[data-accion="agregar"]');
        await tocar(agregar);
        await expect(agregar).toContainText('Añadido ✓');
        await expect(pagina.locator('#insignia-carrito')).toHaveText('1');
      });
    });

    test(`al desplazar ${vista.nombre}px: la ruta y «Cerrar» siguen arriba, y al final no queda un tramo vacío`, async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        const dialogo = await abrirDetalle(pagina, 'SAMBA');
        const caja = dialogo.locator('.modal-caja');
        await expect(dialogo.locator('.detalle-ruta')).toHaveText('CatálogoSAMBA');
        await caja.evaluate((c) => c.scrollTo({ top: 420, behavior: 'instant' }));
        const arriba = await dialogo.evaluate((d) => {
          const c = d.querySelector('.modal-caja').getBoundingClientRect();
          return { ruta: d.querySelector('.detalle-ruta').getBoundingClientRect().top - c.top, cerrar: d.querySelector('.boton-cerrar').getBoundingClientRect().top - c.top };
        });
        expect(Math.abs(arriba.ruta), 'ruta pegada arriba').toBeLessThanOrEqual(1);
        expect(Math.abs(arriba.cerrar), 'Cerrar pegado arriba').toBeLessThanOrEqual(1);
        await caja.evaluate((c) => c.scrollTo({ top: c.scrollHeight, behavior: 'instant' }));
        const hueco = await dialogo.evaluate((d) => d.querySelector('.modal-caja').getBoundingClientRect().bottom - d.querySelector('.detalle-acciones').getBoundingClientRect().bottom);
        expect(hueco, 'aire tras la etiqueta de compra').toBeLessThanOrEqual(96);
      });
    });
  }
});
