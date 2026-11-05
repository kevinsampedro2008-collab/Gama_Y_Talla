// Etapa 12 · Mensajes de WhatsApp: los esperados se escriben a mano, sin usar el código de la tienda.
import { test, expect } from '@playwright/test';
import { CELULAR, ESCRITORIO, URL_PRUEBA, enTienda, abrirDetalle } from '../etapa9/ayudas.js';
import { anadirDesdeFicha, ventanaDe, volverAlCatalogo, textoDe, cifras, CLAVE_CARRITO, NUMERO } from './ayudas-etapa12.js';

const ENCABEZADO = '📦 *PEDIDO GAMA & TALLA*';
const SEPARADOR = '─────────────────';
const CIERRE = 'Envío: Por confirmar.\n\nQuedo a la espera de confirmación. ¡Gracias!';
const entrada = (n, nombre, marca, color, referencia, talla, cantidad, unitario, subtotal) => [
  `${n}. *${nombre}*`, `   Marca: ${marca}`, `   Color: ${color}`, `   Referencia: ${referencia}`, `   Talla EU: ${talla}`, `   Cantidad: ${cantidad}`, `   Precio unit.: ${unitario}`, `   Subtotal: ${subtotal}`,
].join('\n\n');
const pedido = (entradas, total, nota = '') => [ENCABEZADO, ...(nota ? [nota] : []), SEPARADOR, ...entradas, SEPARADOR, `*TOTAL: ${total}*`, CIERRE].join('\n\n');

const NOTA_PRUEBA = 'Nota: pedido de prueba con productos ficticios.';

function comprobarFormato(mensaje) {
  expect(mensaje).not.toContain('�');
  expect(mensaje).not.toMatch(/undefined|null|NaN|\[object/);
  expect(mensaje, 'sin campos vacíos').not.toMatch(/^\s*[^:\n]+:\s*$/m);
  for (const antiguo of ['Hola, quiero', '¿Me confirmas', 'Resumen del pedido', 'Producto 1', 'Total de unidades', 'Subtotal estimado', 'Precio unitario', 'Talla: EU', 'COP', 'Modelo:']) {
    expect(mensaje, `sin el formato antiguo: ${antiguo}`).not.toContain(antiguo);
  }
  expect(mensaje.startsWith(ENCABEZADO)).toBe(true);
  expect(mensaje.endsWith('Quedo a la espera de confirmación. ¡Gracias!')).toBe(true);
}

function comprobarEnlace(url, { conSeparador = true } = {}) {
  const enlace = new URL(url);
  expect(enlace.origin + enlace.pathname, 'enlace que no corrompe los emojis').toBe('https://api.whatsapp.com/send');
  expect(enlace.searchParams.get('phone'), 'el número de CONFIG').toBe(NUMERO);
  expect(url, 'emoji bien codificado').toContain('%F0%9F%93%A6');
  expect(url, 'saltos de línea').toContain('%0A');
  if (conSeparador) expect(url, 'separador').toContain('%E2%94%80');
  expect(url, '«&» del nombre sin romper el enlace').toContain('%26');
  expect(url, 'asteriscos conservados').toMatch(/(\*|%2A)PEDIDO/);
}

const hrefCarrito = (pagina) => pagina.locator('#carrito-enviar').getAttribute('href');
const anadirPorCodigo = (pagina, nombre, talla, cantidad = 1, variante = null) => pagina.evaluate(({ nombre, talla, cantidad, variante }) => {
  const p = estado.productos.find((x) => x.nombre === nombre);
  agregarAlCarrito(p.clave, variante || p.variantes[0].id, talla, cantidad);
}, { nombre, talla, cantidad, variante });

async function abrirCarritoDesdeCabecera(pagina) {
  await pagina.evaluate(() => abrirCarrito(document.querySelector('#boton-carrito')));
  await expect(pagina.locator('#carrito')).toHaveJSProperty('open', true);
}

test.describe('Desde el detalle: «Pedir este par»', () => {
  test('un solo producto, en el formato nuevo y sin tocar el carrito', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, 'SAMBA');
      await dialogo.locator('.talla[data-talla="40"]').tap();
      await dialogo.locator('.detalle-compra [data-cantidad-detalle][data-paso="1"]').tap();
      const pedir = dialogo.getByRole('button', { name: 'Pedir este par por WhatsApp' });
      await pedir.scrollIntoViewIfNeeded();
      await pedir.tap();
      const [url] = await pagina.evaluate(() => window.__abiertas);
      comprobarEnlace(url);
      const mensaje = textoDe(url);
      expect(mensaje).toBe(pedido([entrada(1, 'SAMBA', 'Adidas', 'Rosa / blanco / beigh', 'ADD-SAM', '40', 2, '$120.000', '$240.000')], '$240.000'));
      comprobarFormato(mensaje);
      expect(await pagina.evaluate((c) => localStorage.getItem(c), CLAVE_CARRITO), 'no añade al carrito').toBeNull();
      await expect(pagina.locator('#insignia-carrito')).toBeHidden();
      await expect(ventanaDe(pagina), 'no abre la confirmación').toHaveJSProperty('open', false);
    }, { reducido: true });
  });

  test('variante: color, referencia y precio del color elegido', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, 'tres colores');
      await dialogo.locator('[data-variante="PRUEBA-TRES-NB"]').click();
      await dialogo.locator('.talla[data-talla="41"]').click();
      const pedir = dialogo.getByRole('button', { name: 'Pedir este par por WhatsApp' });
      await pedir.scrollIntoViewIfNeeded();
      await pedir.click();
      const [url] = await pagina.evaluate(() => window.__abiertas);
      expect(textoDe(url)).toBe(pedido([entrada(1, 'Modelo de prueba · tres colores', 'Marca de prueba', 'Negro / blanco', 'PRUEBA-TRES-NB', '41', 1, '$320.000', '$320.000')], '$320.000', NOTA_PRUEBA));
    }, { url: URL_PRUEBA, reducido: true });
  });

  test('sin talla: se mantiene la validación y no se abre WhatsApp', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, 'SAMBA');
      const pedir = dialogo.getByRole('button', { name: 'Pedir este par por WhatsApp' });
      await pedir.scrollIntoViewIfNeeded();
      await pedir.tap();
      await expect(dialogo.locator('.detalle-aviso')).toContainText('Elige una talla EU');
      expect(await pagina.evaluate(() => window.__abiertas)).toEqual([]);
    }, { reducido: true });
  });

  test('tras añadir otros pares, sigue siendo solo el par que se ve', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      await anadirPorCodigo(pagina, 'LCS Retro Classic', '38', 3);
      const dialogo = await abrirDetalle(pagina, 'SAMBA');
      await dialogo.locator('.talla[data-talla="41"]').click();
      const pedir = dialogo.getByRole('button', { name: 'Pedir este par por WhatsApp' });
      await pedir.scrollIntoViewIfNeeded();
      await pedir.click();
      const [url] = await pagina.evaluate(() => window.__abiertas);
      const mensaje = textoDe(url);
      expect(mensaje).not.toContain('LCS Retro Classic');
      expect(mensaje).toContain('*TOTAL: $120.000*');
    }, { reducido: true });
  });
});

test.describe('Desde el carrito: «Enviar pedido»', () => {
  test('tu ejemplo, byte a byte: el mismo modelo en dos tallas son dos entradas', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
      await anadirDesdeFicha(pagina, 'LCS Retro Classic', { talla: '38' });
      await volverAlCatalogo(pagina);
      const { ventana } = await anadirDesdeFicha(pagina, 'LCS Retro Classic', { talla: '41' });
      await ventana.getByRole('button', { name: 'Ver carrito' }).click();
      const url = await hrefCarrito(pagina);
      comprobarEnlace(url);
      const mensaje = textoDe(url);
      expect(mensaje).toBe(`📦 *PEDIDO GAMA & TALLA*

─────────────────

1. *LCS Retro Classic*

   Marca: Le Coq Sportif

   Color: Blanco / Rojo / Azul / Beis

   Referencia: LCS-RET-01

   Talla EU: 38

   Cantidad: 1

   Precio unit.: $120.000

   Subtotal: $120.000

2. *LCS Retro Classic*

   Marca: Le Coq Sportif

   Color: Blanco / Rojo / Azul / Beis

   Referencia: LCS-RET-01

   Talla EU: 41

   Cantidad: 1

   Precio unit.: $120.000

   Subtotal: $120.000

─────────────────

*TOTAL: $240.000*

Envío: Por confirmar.

Quedo a la espera de confirmación. ¡Gracias!`);
      comprobarFormato(mensaje);
    }, { reducido: true });
  });

  test('varios productos, colores distintos, cantidades, con y sin descuento', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      await anadirPorCodigo(pagina, 'Modelo de prueba · tres colores', '40', 1, 'PRUEBA-TRES-BV');
      await anadirPorCodigo(pagina, 'Modelo de prueba · tres colores', '40', 2, 'PRUEBA-TRES-NB');
      await anadirPorCodigo(pagina, 'Modelo de prueba · dos colores', '39', 3, 'PRUEBA-DOS-GP');
      await anadirPorCodigo(pagina, 'Modelo de prueba · dos colores', '39', 1, 'PRUEBA-DOS-AB');
      await abrirCarritoDesdeCabecera(pagina);
      const mensaje = textoDe(await hrefCarrito(pagina));
      expect(mensaje).toBe(pedido([
        entrada(1, 'Modelo de prueba · tres colores', 'Marca de prueba', 'Blanco / verde', 'PRUEBA-TRES-BV', '40', 1, '$300.000', '$300.000'),
        entrada(2, 'Modelo de prueba · tres colores', 'Marca de prueba', 'Negro / blanco', 'PRUEBA-TRES-NB', '40', 2, '$320.000', '$640.000'),
        entrada(3, 'Modelo de prueba · dos colores', 'Marca de prueba', 'Gris / plata', 'PRUEBA-DOS-GP', '39', 3, '$280.000', '$840.000'),
        entrada(4, 'Modelo de prueba · dos colores', 'Marca de prueba', 'Azul / blanco', 'PRUEBA-DOS-AB', '39', 1, '$280.000', '$280.000'),
      ], '$2.060.000', NOTA_PRUEBA));
    }, { url: URL_PRUEBA, reducido: true });
  });

  test('un producto: una entrada numerada', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      await anadirPorCodigo(pagina, 'SAMBA', '42');
      await abrirCarritoDesdeCabecera(pagina);
      expect(textoDe(await hrefCarrito(pagina))).toBe(pedido([entrada(1, 'SAMBA', 'Adidas', 'Rosa / blanco / beigh', 'ADD-SAM', '42', 1, '$120.000', '$120.000')], '$120.000'));
    }, { reducido: true });
  });

  test('el mensaje sigue los cambios de cantidad y eliminación del carrito', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      await anadirPorCodigo(pagina, 'SAMBA', '42');
      await anadirPorCodigo(pagina, 'LCS Retro Classic', '38');
      await abrirCarritoDesdeCabecera(pagina);
      const carrito = pagina.locator('#carrito');
      await carrito.locator('.linea').first().getByRole('button', { name: 'Aumentar cantidad' }).click();
      await expect.poll(async () => textoDe(await hrefCarrito(pagina))).toContain('*TOTAL: $360.000*');
      await carrito.locator('.linea').nth(1).locator('[data-eliminar]').click();
      await expect.poll(async () => textoDe(await hrefCarrito(pagina))).toContain('*TOTAL: $240.000*');
      expect(textoDe(await hrefCarrito(pagina))).not.toContain('LCS Retro Classic');
    }, { reducido: true });
  });

  test('«Copiar pedido» copia exactamente el mismo mensaje', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      await pagina.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copiado = t; } } }); });
      await anadirPorCodigo(pagina, 'SAMBA', '42');
      await abrirCarritoDesdeCabecera(pagina);
      await pagina.locator('#carrito-copiar').click();
      await expect(pagina.locator('#carrito-notificacion')).toContainText('Pedido copiado');
      expect(await pagina.evaluate(() => window.__copiado)).toBe(textoDe(await hrefCarrito(pagina)));
    }, { reducido: true });
  });
});

test.describe('Carrito con muchas líneas: límite de 3000 caracteres', () => {
  test('se copia el pedido completo, se avisa y el enlace lleva el mensaje alternativo', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
      await pagina.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copiado = t; } } });
        estado.productos.filter((p) => p.variantes[0].tallasDisponibles.length).slice(0, 14).forEach((p, i) => agregarAlCarrito(p.clave, p.variantes[0].id, p.variantes[0].tallasDisponibles[0], (i % 3) + 1));
      });
      const { lineas, unidades, total } = await pagina.evaluate(() => {
        const l = lineasCarrito();
        return { lineas: l.length, unidades: l.reduce((s, x) => s + x.cantidad, 0), total: l.reduce((s, x) => s + x.variante.precio * x.cantidad, 0) };
      });
      expect(lineas).toBeGreaterThanOrEqual(10);
      await abrirCarritoDesdeCabecera(pagina);
      const enviar = pagina.locator('#carrito-enviar');
      await expect(enviar).toHaveAttribute('data-largo', 'true');
      await expect(pagina.locator('#carrito-respaldo')).toBeVisible();
      const url = await hrefCarrito(pagina);
      expect(url.length, 'el enlace respeta el límite').toBeLessThanOrEqual(3000);
      comprobarEnlace(url, { conSeparador: false });
      const alternativo = textoDe(url);
      expect(alternativo).toContain(`${unidades} artículos`);
      expect(cifras(alternativo.match(/\*TOTAL: (.+)\*/)[1])).toBe(total);
      expect(alternativo).toContain('Te envío el detalle completo en el siguiente mensaje.');
      expect(alternativo).not.toContain('�');

      await enviar.scrollIntoViewIfNeeded();
      await enviar.click();
      await expect(pagina.locator('#carrito-notificacion')).toContainText('Copiamos el pedido completo');
      const copiado = await pagina.evaluate(() => window.__copiado);
      comprobarFormato(copiado);
      expect(copiado.match(/^\d+\. \*/gm)).toHaveLength(lineas);
      expect(cifras(copiado.match(/\*TOTAL: (.+)\*/)[1])).toBe(total);
      const [abierto] = await pagina.evaluate(() => window.__abiertas);
      expect(abierto).toBe(url);
    }, { reducido: true });
  });

  test('justo por debajo del límite el mensaje completo va en el enlace', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      await pagina.evaluate(() => {
        const candidatos = estado.productos.filter((p) => p.variantes[0].tallasDisponibles.length);
        for (const p of candidatos) {
          agregarAlCarrito(p.clave, p.variantes[0].id, p.variantes[0].tallasDisponibles[0], 1);
          if (enlaceWhatsApp(crearMensajePedido(lineasCarrito())).length > CONFIG.limiteEnlaceWhatsApp) { estado.carrito.pop(); guardarCarrito(); break; }
        }
      });
      await abrirCarritoDesdeCabecera(pagina);
      await expect(pagina.locator('#carrito-enviar')).toHaveAttribute('data-largo', 'false');
      const url = await hrefCarrito(pagina);
      expect(url.length).toBeLessThanOrEqual(3000);
      expect(textoDe(url).endsWith('Quedo a la espera de confirmación. ¡Gracias!')).toBe(true);
      await expect(pagina.locator('#carrito-respaldo')).toBeHidden();
    }, { reducido: true });
  });
});

test.describe('Coincidencia entre ventana, carrito y mensaje', () => {
  for (const [nombre, pares] of [
    ['un producto', [{ nombre: 'SAMBA', talla: '40' }]],
    ['con y sin descuento, con cantidades', [{ nombre: 'SAMBA', talla: '40', cantidad: 2 }, { nombre: 'Pegasus 41', talla: '41', cantidad: 3 }]],
    ['el mismo modelo en dos tallas', [{ nombre: 'LCS Retro Classic', talla: '38' }, { nombre: 'LCS Retro Classic', talla: '41', cantidad: 2 }]],
  ]) {
    test(`${nombre}: el total es el mismo en los tres`, async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
        let ventana;
        for (const [i, par] of pares.entries()) {
          if (i) await volverAlCatalogo(pagina);
          ({ ventana } = await anadirDesdeFicha(pagina, par.nombre, par));
        }
        const enVentana = {
          total: cifras(await ventana.locator('#confirmacion-total').textContent()),
          costo: cifras(await ventana.locator('#confirmacion-costo').textContent()),
          unidades: cifras(await ventana.locator('#confirmacion-unidades').textContent()),
        };
        await ventana.getByRole('button', { name: 'Ver carrito' }).click();
        const enCarrito = {
          total: cifras(await pagina.locator('#carrito-subtotal').textContent()),
          unidades: cifras(await pagina.locator('#carrito-unidades').textContent()),
          subtotales: (await pagina.locator('#carrito .linea-subtotal').allTextContents()).map(cifras),
        };
        const mensaje = textoDe(await hrefCarrito(pagina));
        const enMensaje = {
          total: cifras(mensaje.match(/\*TOTAL: (.+)\*/)[1]),
          unidades: [...mensaje.matchAll(/Cantidad: (\d+)/g)].reduce((s, m) => s + Number(m[1]), 0),
          subtotales: [...mensaje.matchAll(/Subtotal: (.+)/g)].map((m) => cifras(m[1])),
        };
        expect(enVentana.costo).toBe(enVentana.total);
        expect(enCarrito.total).toBe(enVentana.total);
        expect(enMensaje.total).toBe(enVentana.total);
        expect(enCarrito.unidades).toBe(enVentana.unidades);
        expect(enMensaje.unidades).toBe(enVentana.unidades);
        expect(enMensaje.subtotales).toEqual(enCarrito.subtotales);
        expect(enMensaje.subtotales.reduce((a, b) => a + b, 0)).toBe(enVentana.total);
      }, { reducido: true });
    });
  }
});

test.describe('En vivo', () => {
  test('api.whatsapp.com conserva el emoji hasta el enlace de WhatsApp Web', async ({ request }, info) => {
    test.skip(info.project.name !== 'chromium', 'Comprueba un servicio externo: basta una ejecución.');
    const texto = '%F0%9F%93%A6%20*PEDIDO%20GAMA%20%26%20TALLA*%0A%E2%94%80%E2%94%80%0A%C3%91and%C3%BA';
    const r = await request.get(`https://api.whatsapp.com/send?phone=573000000000&text=${texto}`, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' } });
    expect(r.ok()).toBe(true);
    const html = await r.text();
    const enlace = html.match(/web\.whatsapp\.com\/send[^"' <]*/)?.[0] ?? '';
    expect(enlace, 'emoji intacto').toContain('%F0%9F%93%A6');
    expect(html).not.toContain('%EF%BF%BD');
  });
});
