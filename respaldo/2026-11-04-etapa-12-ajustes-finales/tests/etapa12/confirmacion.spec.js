// Etapa 12 · Ventana de confirmación: primero celular (fase 1), después tableta y escritorio (fase 2).
import { test, expect } from '@playwright/test';
import { VISTAS, CELULAR, ESCRITORIO, URL_PRUEBA, enTienda, nuevaPagina, irATienda, sinDesborde, abrirDetalle } from '../etapa9/ayudas.js';
import { anadirDesdeFicha, ventanaDe, ventanaLista, volverAlCatalogo, cifras, CLAVE_CARRITO } from './ayudas-etapa12.js';

const TELEFONO_BAJO = { nombre: '360x640', ancho: 360, alto: 640, tactil: true };
const CELULARES = [VISTAS[0], VISTAS[1], TELEFONO_BAJO];
const AMPLIAS = VISTAS.slice(2);
const pulsar = (localizador, vista) => (vista.tactil ? localizador.tap() : localizador.click());

const leerVentana = (ventana) => ventana.evaluate((d) => {
  const texto = (s) => d.querySelector(s)?.textContent.trim() ?? null;
  return {
    marca: texto('.detalle-marca'),
    modelo: texto('.confirmacion-modelo'),
    actual: texto('.precio-actual'),
    anterior: texto('.precio-anterior'),
    descuento: texto('.precio-ahorro'),
    color: texto('.confirmacion-dato-color dd'),
    talla: texto('.confirmacion-dato-talla dd'),
    cantidad: texto('.confirmacion-dato-cantidad dd'),
    foto: d.querySelector('.confirmacion-foto img')?.getAttribute('src') ?? null,
    unidades: texto('#confirmacion-unidades'),
    costo: texto('#confirmacion-costo'),
    envio: texto('.confirmacion-costos > div:nth-child(2) dd'),
    total: texto('#confirmacion-total'),
    nota: texto('#confirmacion-nota'),
  };
});

// Sin cerrar la ventana: geometría real, tal como se ve al abrirla.
const medir = (ventana) => ventana.evaluate((d) => {
  const caja = (s) => { const r = d.querySelector(s).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, ancho: r.width, alto: r.height }; };
  const titulo = d.querySelector('h2');
  const estilo = getComputedStyle(titulo);
  const textos = [...d.querySelectorAll('.confirmacion *')].filter((n) => [...n.childNodes].some((h) => h.nodeType === 3 && h.textContent.trim()));
  return {
    vw: document.documentElement.clientWidth,
    vh: innerHeight,
    hoja: caja('.confirmacion'),
    cerrar: caja('[data-cerrar]'),
    ver: caja('[data-confirmacion-carrito]'),
    seguir: caja('[data-confirmacion-explorar]'),
    producto: caja('.confirmacion-producto'),
    resumen: caja('.confirmacion-resumen'),
    acciones: caja('.confirmacion-acciones'),
    cuerpo: caja('.confirmacion-cuerpo'),
    foto: caja('.confirmacion-foto'),
    identidad: caja('.confirmacion-identidad'),
    total: caja('.confirmacion-total'),
    ajuste: getComputedStyle(d.querySelector('.confirmacion-foto img')).objectFit,
    lineasTitulo: Math.round(titulo.getBoundingClientRect().height / parseFloat(estilo.lineHeight)),
    letraMinima: Math.min(...textos.map((n) => parseFloat(getComputedStyle(n).fontSize))),
    desbordes: [...d.querySelectorAll('.confirmacion, .confirmacion-cuerpo, .confirmacion-producto, .confirmacion-resumen')].filter((n) => n.scrollWidth > n.clientWidth + 1).map((n) => n.className),
  };
});

function comprobarComun(m) {
  expect(m.desbordes, 'sin desborde horizontal').toEqual([]);
  expect(m.hoja.left).toBeGreaterThanOrEqual(0);
  expect(m.hoja.right).toBeLessThanOrEqual(m.vw + 1);
  expect(m.lineasTitulo, 'título en dos líneas como máximo').toBeLessThanOrEqual(2);
  expect(m.letraMinima, 'legible sin zoom').toBeGreaterThanOrEqual(12);
  expect(m.ver.bottom, 'VER CARRITO a la vista').toBeLessThanOrEqual(m.vh + 1);
  expect(m.seguir.bottom, 'SEGUIR EXPLORANDO a la vista').toBeLessThanOrEqual(m.vh + 1);
  expect(Math.abs(m.seguir.top - m.ver.bottom), 'botones uno encima del otro').toBeLessThanOrEqual(1);
  expect(Math.abs(m.ver.ancho - m.seguir.ancho)).toBeLessThanOrEqual(1);
  for (const [nombre, boton] of [['Ver', m.ver], ['Seguir', m.seguir]]) expect(boton.alto, `${nombre}: área táctil`).toBeGreaterThanOrEqual(44);
  expect(m.cerrar.ancho, 'X: área táctil').toBeGreaterThanOrEqual(44);
  expect(m.cerrar.alto).toBeGreaterThanOrEqual(44);
  expect(m.cerrar.right, 'X arriba a la derecha').toBeGreaterThan(m.hoja.right - 70);
  expect(m.cerrar.top - m.hoja.top).toBeLessThan(40);
  expect(m.ajuste, 'la foto conserva su proporción').toBe('contain');
  expect(Math.abs(m.foto.ancho - m.foto.alto), 'campo de foto cuadrado').toBeLessThanOrEqual(1);
}

test.describe('Fase 1 · Celular', () => {
  for (const vista of CELULARES) {
    test(`${vista.nombre}: una sola columna, botones a la vista y nada tapado`, async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        await anadirDesdeFicha(pagina, 'SAMBA', { talla: '40' });
        await volverAlCatalogo(pagina);
        const { ventana } = await anadirDesdeFicha(pagina, 'Air Jordan 1 Retro High OG', { talla: '43', cantidad: 2 });
        const m = await medir(ventana);
        comprobarComun(m);
        await sinDesborde(pagina);
        expect(m.resumen.top, 'el resumen va debajo del producto').toBeGreaterThanOrEqual(m.producto.bottom - 1);
        expect(m.acciones.top, 'las acciones no tapan el contenido').toBeGreaterThanOrEqual(m.cuerpo.bottom - 1);
        expect(m.foto.alto, 'la foto no ocupa la pantalla').toBeLessThan(m.vh * 0.25);
        expect(m.total.bottom, 'el total se ve al abrir').toBeLessThanOrEqual(m.acciones.top + 1);
        expect(m.hoja.bottom, 'hoja apoyada abajo').toBeGreaterThanOrEqual(m.vh - 1);
      }, { reducido: true });
    });

    test(`${vista.nombre}: el flujo completo con el dedo`, async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        const { dialogo, ventana } = await anadirDesdeFicha(pagina, 'SAMBA', { talla: '40' });
        await pulsar(ventana.getByRole('button', { name: 'Cerrar confirmación' }), vista);
        await expect(ventana).toHaveJSProperty('open', false);
        await expect(dialogo, 'la X vuelve a la ficha').toHaveJSProperty('open', true);
        const agregar = dialogo.locator('.detalle-acciones [data-accion="agregar"]');
        await agregar.scrollIntoViewIfNeeded();
        await expect(agregar).not.toContainText('Añadido ✓', { timeout: 3000 });
        await agregar.tap();
        await ventanaLista(pagina);
        await pulsar(ventana.getByRole('button', { name: 'Ver carrito' }), vista);
        await expect(pagina.locator('#carrito')).toHaveJSProperty('open', true);
        await expect(pagina.locator('#carrito-unidades')).toHaveText('2');
      }, { reducido: true });
    });
  }

  test('360×640: el contenido se desplaza dentro de la hoja y el velo avisa de que hay más', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, TELEFONO_BAJO, async (pagina) => {
      await pagina.evaluate(() => {
        // Nombre largo y aviso de tope: el caso más alto posible.
        const j = estado.productos.find((p) => p.nombre === 'Air Jordan 1 Retro High OG');
        estado.carrito.push({ producto: j.clave, variante: j.variantes[0].id, talla: '43', cantidad: 9, precio: j.variantes[0].precio });
      });
      const { ventana } = await anadirDesdeFicha(pagina, 'Air Jordan 1 Retro High OG', { talla: '43', cantidad: 3 });
      const cuerpo = ventana.locator('.confirmacion-cuerpo');
      const sobra = await cuerpo.evaluate((c) => c.scrollHeight - c.clientHeight);
      expect(sobra, 'este caso no cabe entero').toBeGreaterThan(0);
      await expect(ventana.locator('.confirmacion')).toHaveAttribute('data-mas-abajo', '');
      await cuerpo.evaluate((c) => { c.scrollTop = c.scrollHeight; });
      await expect(ventana.locator('.confirmacion'), 'al llegar abajo el velo desaparece').not.toHaveAttribute('data-mas-abajo', '');
      await expect(ventana.locator('#confirmacion-nota')).toBeInViewport();
    }, { reducido: true });
  });

  for (const vista of VISTAS.slice(0, 2)) {
    test(`${vista.nombre}, con animación: si todo cabe no hay velo, ni durante ni después de la entrada`, async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        const { ventana } = await anadirDesdeFicha(pagina, 'SAMBA', { talla: '40' });
        const hoja = ventana.locator('.confirmacion');
        const cuerpo = ventana.locator('.confirmacion-cuerpo');
        await expect(hoja).not.toHaveAttribute('data-mas-abajo', '');
        await pagina.waitForFunction(() => document.querySelector('.confirmacion').getAnimations({ subtree: true }).every((a) => a.playState !== 'running'));
        expect(await cuerpo.evaluate((c) => c.scrollHeight - c.clientHeight), 'no hay nada que desplazar').toBeLessThanOrEqual(1);
        await expect(hoja).not.toHaveAttribute('data-mas-abajo', '');
      });
    });
  }

  test('responde al apoyar el dedo, sin depender del hover', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
      const { ventana } = await anadirDesdeFicha(pagina, 'SAMBA', { talla: '40' });
      const ver = ventana.getByRole('button', { name: 'Ver carrito' });
      const colorReposo = await ver.evaluate((b) => getComputedStyle(b).backgroundColor);
      await ver.evaluate((b) => b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })));
      await expect(ver).toHaveAttribute('data-pulsado', '');
      await expect.poll(() => ver.evaluate((b) => getComputedStyle(b).backgroundColor)).not.toBe(colorReposo);
      await ver.evaluate((b) => b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' })));
      await expect(ver).not.toHaveAttribute('data-pulsado', '');
    }, { reducido: true });
  });
});

test.describe('Fase 2 · Tableta y escritorio', () => {
  for (const vista of AMPLIAS) {
    test(`${vista.nombre}: dos zonas sin superposiciones`, async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        await anadirDesdeFicha(pagina, 'SAMBA', { talla: '40' });
        await volverAlCatalogo(pagina);
        const { ventana } = await anadirDesdeFicha(pagina, 'Air Jordan 1 Retro High OG', { talla: '43', cantidad: 2 });
        const m = await medir(ventana);
        comprobarComun(m);
        await sinDesborde(pagina);
        expect(m.resumen.left, 'el carrito va a la derecha del producto').toBeGreaterThanOrEqual(m.producto.right - 1);
        expect(m.identidad.left, 'datos a la derecha de la foto').toBeGreaterThanOrEqual(m.foto.right - 1);
        expect(m.acciones.left, 'botones en la columna derecha').toBeGreaterThanOrEqual(m.producto.right - 1);
        expect(m.acciones.top).toBeGreaterThanOrEqual(m.resumen.bottom - 1);
        expect(m.hoja.top, 'ventana centrada').toBeGreaterThan(0);
        expect(Math.abs(m.hoja.top - (m.vh - m.hoja.bottom))).toBeLessThanOrEqual(2);
      }, { reducido: true });
    });
  }
});

test.describe('Datos del producto', () => {
  test('con descuento: precio actual, anterior y porcentaje reales', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
      const { ventana } = await anadirDesdeFicha(pagina, 'SAMBA', { talla: '40' });
      await expect(pagina.getByRole('dialog', { name: 'Producto añadido al carrito' })).toBeVisible();
      await expect(ventana.locator('h2')).toHaveText('Producto añadido al carrito');
      const d = await leerVentana(ventana);
      expect(d.marca).toBe('Adidas · Urbanas');
      expect(d.modelo).toBe('SAMBA');
      expect(cifras(d.actual)).toBe(120000);
      expect(cifras(d.anterior)).toBe(290000);
      expect(d.descuento).toBe('59% OFF');
      expect(d.color).toBe('Rosa / blanco / beigh');
      expect(d.talla).toBe('40');
      expect(d.cantidad).toBe('1');
      expect(d.foto).toContain('zapatilla_01.webp');
      expect(await ventana.locator('.precio-anterior').evaluate((n) => n.tagName)).toBe('DEL');
      const verde = await ventana.locator('.precio-ahorro').evaluate((n) => { const [r, g, b] = getComputedStyle(n).color.match(/\d+/g).map(Number); return g > r && g > b; });
      expect(verde, 'el descuento es verde').toBe(true);
      await expect.poll(() => ventana.locator('.confirmacion-foto img').evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
    }, { reducido: true });
  });

  test('sin descuento: solo el precio actual', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
      const { ventana } = await anadirDesdeFicha(pagina, 'LCS Retro Classic', { talla: '38' });
      const d = await leerVentana(ventana);
      expect(cifras(d.actual)).toBe(120000);
      expect(d.anterior).toBeNull();
      expect(d.descuento).toBeNull();
    }, { reducido: true });
  });

  test('variante: foto, color y precio del color elegido, no los del producto', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
      const { ventana } = await anadirDesdeFicha(pagina, 'tres colores', { variante: 'PRUEBA-TRES-NB', talla: '41' });
      const d = await leerVentana(ventana);
      expect(d.color).toBe('Negro / blanco');
      expect(d.foto).toContain('tres-nb-1.svg');
      expect(cifras(d.actual)).toBe(320000);
      expect(cifras(d.anterior)).toBe(400000);
      expect(d.descuento).toBe('20% OFF');
    }, { url: URL_PRUEBA, reducido: true });
  });

  test('cantidad mayor que uno: se muestra lo añadido en esta operación', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
      const { ventana } = await anadirDesdeFicha(pagina, 'SAMBA', { talla: '40', cantidad: 3 });
      const d = await leerVentana(ventana);
      expect(d.cantidad).toBe('3');
      expect(d.unidades).toBe('3 artículos');
      expect(cifras(d.total)).toBe(360000);
    }, { reducido: true });
  });
});

test.describe('Resumen del carrito', () => {
  test('representa todo el carrito y no cuenta dos veces lo recién añadido', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
      let { ventana } = await anadirDesdeFicha(pagina, 'SAMBA', { talla: '40' });
      let d = await leerVentana(ventana);
      expect(d.unidades).toBe('1 artículo');
      expect(cifras(d.costo)).toBe(120000);
      await volverAlCatalogo(pagina);

      ({ ventana } = await anadirDesdeFicha(pagina, 'Samba OG', { talla: '38', cantidad: 2 }));
      d = await leerVentana(ventana);
      expect(d.unidades, 'unidades, no líneas').toBe('3 artículos');
      expect(cifras(d.costo)).toBe(120000 + 2 * 459900);
      expect(cifras(d.total)).toBe(120000 + 2 * 459900);
      await volverAlCatalogo(pagina);

      // La misma línea otra vez: se suma a la existente, sin duplicarla.
      ({ ventana } = await anadirDesdeFicha(pagina, 'SAMBA', { talla: '40' }));
      d = await leerVentana(ventana);
      expect(d.cantidad, 'lo añadido ahora').toBe('1');
      expect(d.unidades).toBe('4 artículos');
      expect(cifras(d.total)).toBe(2 * 120000 + 2 * 459900);
      const lineas = await pagina.evaluate((c) => JSON.parse(localStorage.getItem(c)).lineas, CLAVE_CARRITO);
      expect(lineas).toHaveLength(2);
    }, { reducido: true });
  });

  test('el envío se presenta como pendiente, sin valor ni gratuidad', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
      const { ventana } = await anadirDesdeFicha(pagina, 'SAMBA', { talla: '40' });
      const d = await leerVentana(ventana);
      await expect(ventana.locator('.confirmacion-costos > div:nth-child(2) dt')).toHaveText('Costo de envío');
      expect(d.envio).toBe('Se confirma por WhatsApp.');
      expect(d.nota).toBe('El costo de envío se confirma por WhatsApp y no está incluido en este valor.');
      expect(await ventana.textContent()).not.toMatch(/gratis/i);
      const linea = await ventana.locator('.confirmacion-total').evaluate((n) => parseFloat(getComputedStyle(n).borderTopWidth));
      expect(linea, 'línea sobre el total').toBeGreaterThanOrEqual(1);
    }, { reducido: true });
  });

  test('otra pestaña cambia el carrito: el resumen se actualiza', async ({ browser, browserName }) => {
    const { contexto, pagina } = await nuevaPagina(browser, browserName, CELULAR, { reducido: true });
    await irATienda(pagina);
    const { ventana } = await anadirDesdeFicha(pagina, 'SAMBA', { talla: '40' });
    const otra = await contexto.newPage();
    await irATienda(otra);
    await otra.evaluate(() => { const p = estado.productos.find((x) => x.nombre === 'LCS Retro Classic'); agregarAlCarrito(p.clave, p.variantes[0].id, '38', 1); });
    await expect(ventana.locator('#confirmacion-unidades')).toHaveText('2 artículos');
    expect(cifras(await ventana.locator('#confirmacion-total').textContent())).toBe(240000);
    await contexto.close();
  });
});

test.describe('Botones y cierre', () => {
  test('VER CARRITO abre el carrito real, y al cerrarlo se vuelve a la ficha', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
      const { dialogo, agregar, ventana } = await anadirDesdeFicha(pagina, 'SAMBA', { talla: '40' });
      const ver = ventana.getByRole('button', { name: 'Ver carrito' });
      const [r, g, b] = (await ver.evaluate((n) => getComputedStyle(n).backgroundColor)).match(/\d+/g).map(Number);
      expect(g > r && g > b, 'botón verde').toBe(true);
      const lum = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      expect(1.05 / (0.2126 * lum(r) + 0.7152 * lum(g) + 0.0722 * lum(b) + 0.05), 'texto blanco legible').toBeGreaterThanOrEqual(4.5);
      await ver.click();
      await expect(ventana).toHaveJSProperty('open', false);
      const carrito = pagina.locator('#carrito');
      await expect(carrito).toHaveJSProperty('open', true);
      await expect(carrito.locator('.linea')).toHaveCount(1);
      await expect(carrito.locator('.linea-meta')).toContainText('EU 40');
      await carrito.getByRole('button', { name: 'Cerrar carrito' }).click();
      await expect(dialogo).toHaveJSProperty('open', true);
      await expect(agregar, 'el foco vuelve a donde se añadió').toBeFocused();
    });
  });

  test('SEGUIR EXPLORANDO vuelve al catálogo: filtros, posición, carrito y foco intactos', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      await pagina.locator('#buscar').fill('samba');
      await expect(pagina.locator('.tarjeta')).not.toHaveCount(28);
      const tarjetas = await pagina.locator('.tarjeta').count();
      const { dialogo, ventana } = await anadirDesdeFicha(pagina, 'SAMBA', { talla: '40' });
      const posicion = await pagina.evaluate(() => scrollY);
      await ventana.getByRole('button', { name: 'Seguir explorando' }).click();
      await expect(ventana).toHaveJSProperty('open', false);
      await expect(dialogo).toHaveJSProperty('open', false);
      await expect(pagina.locator('#carrito')).toHaveJSProperty('open', false);
      await expect(pagina.locator('#buscar')).toHaveValue('samba');
      await expect(pagina.locator('.tarjeta')).toHaveCount(tarjetas);
      expect(await pagina.evaluate(() => scrollY)).toBe(posicion);
      await expect(pagina.locator('#insignia-carrito')).toHaveText('1');
      await expect(pagina.locator(':focus')).toHaveClass(/tarjeta-enlace/);
      await expect(pagina.locator('html')).not.toHaveClass(/sin-desplazamiento/);
    });
  });

  for (const [como, cerrar] of [
    ['la X', (pagina, ventana) => ventana.getByRole('button', { name: 'Cerrar confirmación' }).click()],
    ['Escape', (pagina) => pagina.keyboard.press('Escape')],
    ['fuera de la ventana', (pagina) => pagina.mouse.click(4, 4)],
  ]) {
    test(`${como} cierra solo la ventana, sin tocar el carrito, y devuelve el foco`, async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
        const { dialogo, agregar, ventana } = await anadirDesdeFicha(pagina, 'SAMBA', { talla: '40' });
        await cerrar(pagina, ventana);
        await expect(ventana).toHaveJSProperty('open', false);
        await expect(dialogo).toHaveJSProperty('open', true);
        await expect(agregar).toBeFocused();
        await expect(pagina.locator('#insignia-carrito')).toHaveText('1');
        const lineas = await pagina.evaluate((c) => JSON.parse(localStorage.getItem(c)).lineas, CLAVE_CARRITO);
        expect(lineas).toHaveLength(1);
      });
    });
  }

  test('cerrar la ventana y después la ficha devuelve el foco a la tarjeta', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      const { dialogo, ventana } = await anadirDesdeFicha(pagina, 'SAMBA', { talla: '40' });
      await ventana.getByRole('button', { name: 'Cerrar confirmación' }).click();
      await dialogo.getByRole('button', { name: 'Cerrar detalles' }).click();
      await expect(dialogo).toHaveJSProperty('open', false);
      await expect(pagina.locator(':focus')).toHaveClass(/tarjeta-enlace/);
      expect(await pagina.locator(':focus').evaluate((n) => n.closest('.tarjeta').dataset.id)).toBe('ADD-SAM~zapatilla-01');
    });
  });

  test('celular en horizontal: la ventana entera se desplaza y los botones se alcanzan', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, { nombre: '844x390', ancho: 844, alto: 390, tactil: true }, async (pagina) => {
      const { ventana } = await anadirDesdeFicha(pagina, 'Air Jordan 1 Retro High OG', { talla: '43' });
      const hoja = ventana.locator('.confirmacion');
      const m = await hoja.evaluate((h) => ({ total: h.scrollHeight, visible: h.clientHeight, ancho: h.scrollWidth - h.clientWidth, fondo: h.getBoundingClientRect().bottom, vh: innerHeight }));
      expect(m.ancho, 'sin desborde horizontal').toBeLessThanOrEqual(1);
      expect(m.fondo, 'la ventana cabe en la pantalla').toBeLessThanOrEqual(m.vh);
      expect(m.total, 'contenido desplazable').toBeGreaterThan(m.visible);
      const seguir = ventana.getByRole('button', { name: 'Seguir explorando' });
      await seguir.scrollIntoViewIfNeeded();
      await expect(seguir).toBeInViewport({ ratio: 1 });
      await seguir.tap();
      await expect(ventana).toHaveJSProperty('open', false);
    }, { reducido: true });
  });

  test('foco: empieza en el título y el teclado recorre los controles de la ventana', async ({ browser, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit no lleva el foco a los botones con Tab en su configuración por defecto.');
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      const { ventana } = await anadirDesdeFicha(pagina, 'SAMBA', { talla: '40' });
      await expect(ventana.locator('h2')).toBeFocused();
      await pagina.keyboard.press('Tab');
      await expect(ventana.getByRole('button', { name: 'Cerrar confirmación' })).toBeFocused();
      await pagina.keyboard.press('Tab');
      const ver = ventana.getByRole('button', { name: 'Ver carrito' });
      await expect(ver).toBeFocused();
      await pagina.keyboard.press('Tab');
      await expect(ventana.getByRole('button', { name: 'Seguir explorando' })).toBeFocused();
      await pagina.keyboard.press('Shift+Tab');
      await pagina.keyboard.press('Enter');
      await expect(pagina.locator('#carrito')).toHaveJSProperty('open', true);
    });
  });

  test('sin movimiento: la ventana solo funde y su contenido aparece en el acto', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
      const { ventana } = await anadirDesdeFicha(pagina, 'SAMBA', { talla: '40' });
      expect(await ventana.locator('.confirmacion').evaluate((n) => getComputedStyle(n).animationName)).toBe('detalle-fundido');
      expect(await ventana.locator('.confirmacion-resumen').evaluate((n) => getComputedStyle(n).animationName)).toBe('none');
    }, { reducido: true });
  });
});

test.describe('Duplicados y persistencia', () => {
  test('doble clic: una sola unidad, y el segundo toque no pulsa nada de la ventana', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, 'SAMBA');
      await dialogo.locator('.talla[data-talla="40"]').click();
      const agregar = dialogo.locator('.detalle-acciones [data-accion="agregar"]');
      await agregar.scrollIntoViewIfNeeded();
      await agregar.dblclick();
      const ventana = ventanaDe(pagina);
      await expect(ventana).toHaveJSProperty('open', true);
      await expect(pagina.locator('#carrito')).toHaveJSProperty('open', false);
      await expect(pagina.locator('#insignia-carrito')).toHaveText('1');
      await expect(ventana.locator('#confirmacion-unidades')).toHaveText('1 artículo');
    });
  });

  test('protección contra el doble toque: la ventana ignora pulsaciones un instante', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, 'SAMBA');
      await dialogo.locator('.talla[data-talla="40"]').tap();
      const agregar = dialogo.locator('.detalle-acciones [data-accion="agregar"]');
      await agregar.scrollIntoViewIfNeeded();
      const recien = await agregar.evaluate((b) => {
        b.click();
        const d = document.querySelector('#confirmacion-carrito');
        return { abierta: d.open, puntero: getComputedStyle(d).pointerEvents };
      });
      expect(recien).toEqual({ abierta: true, puntero: 'none' });
      await ventanaLista(pagina);
    });
  });

  test('tope de 10: en el máximo no se confirma nada; si se recorta, se dice cuánto entró', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      await pagina.evaluate(() => { const p = estado.productos.find((x) => x.nombre === 'SAMBA'); agregarAlCarrito(p.clave, p.variantes[0].id, '40', 9); });
      const { dialogo, ventana } = await anadirDesdeFicha(pagina, 'SAMBA', { talla: '40', cantidad: 3 });
      expect((await leerVentana(ventana)).cantidad, 'solo entró una').toBe('1');
      await expect(ventana.locator('.confirmacion-tope')).toContainText('Máximo 10 unidades');
      await expect(ventana.locator('#confirmacion-unidades')).toHaveText('10 artículos');
      await ventana.getByRole('button', { name: 'Cerrar confirmación' }).click();
      await expect(dialogo.locator('.detalle-acciones [data-accion="agregar"]')).not.toContainText('Añadido ✓', { timeout: 3000 });
      await dialogo.locator('.detalle-acciones [data-accion="agregar"]').click();
      await expect(pagina.locator('#aviso-flotante-texto')).toContainText('Máximo 10 unidades');
      await expect(ventana).toHaveJSProperty('open', false);
    });
  });

  test('añadido rápido desde la tarjeta: también confirma, y el foco vuelve al botón', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, 'SAMBA');
      await dialogo.locator('.talla[data-talla="40"]').click();
      await dialogo.getByRole('button', { name: 'Cerrar detalles' }).click();
      const rapido = pagina.locator('.tarjeta-rapido').first();
      await rapido.scrollIntoViewIfNeeded();
      await rapido.click();
      const ventana = await ventanaLista(pagina);
      expect((await leerVentana(ventana)).talla).toBe('40');
      await pagina.keyboard.press('Escape');
      await expect(ventana).toHaveJSProperty('open', false);
      await expect(rapido).toBeFocused();
    });
  });

  test('sin talla no hay ventana: se mantiene la validación', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, 'SAMBA');
      const agregar = dialogo.locator('.detalle-acciones [data-accion="agregar"]');
      await agregar.scrollIntoViewIfNeeded();
      await agregar.click();
      await expect(ventanaDe(pagina)).toHaveJSProperty('open', false);
      await expect(dialogo.locator('.detalle-aviso')).toContainText('Elige una talla EU');
      expect(await pagina.evaluate((c) => localStorage.getItem(c), CLAVE_CARRITO)).toBeNull();
    }, { reducido: true });
  });

  test('persiste al recargar, con el esquema V3 intacto', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
      await anadirDesdeFicha(pagina, 'SAMBA', { talla: '40', cantidad: 2 });
      const guardado = await pagina.evaluate((c) => JSON.parse(localStorage.getItem(c)), CLAVE_CARRITO);
      expect(guardado).toEqual({ version: 3, lineas: [{ producto: 'ADD-SAM~zapatilla-01', variante: 'unica', talla: '40', cantidad: 2, precio: 120000 }], pendientes: [] });
      await irATienda(pagina);
      await expect(pagina.locator('#insignia-carrito')).toHaveText('2');
      await expect(ventanaDe(pagina), 'recargar no reabre la ventana').toHaveJSProperty('open', false);
    }, { reducido: true });
  });
});
