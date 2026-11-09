// Etapa 12 · Mensajes de WhatsApp: los esperados se escriben a mano, sin usar el código de la tienda.
import { test, expect } from '@playwright/test';
import { CELULAR, ESCRITORIO, URL_PRUEBA, enTienda, abrirDetalle, DATOS_ENVIO, lineasDatosEnvio, enviarDesdeCarrito, pedirParDesdeFicha, guardarDatosEnvio } from '../etapa9/ayudas.js';
import { anadirDesdeFicha, ventanaDe, volverAlCatalogo, textoDe, cifras, CLAVE_CARRITO, NUMERO } from './ayudas-etapa12.js';

const ENCABEZADO = '*GAMA & TALLA — NUEVO PEDIDO*';
const SEPARADOR = '────────────────';
const DESPEDIDA = 'Quedo a la espera de confirmación. ¡Gracias!';
// Campos consecutivos (sin líneas vacías) y con «* » literal al inicio.
const entrada = (n, nombre, marca, color, referencia, talla, cantidad, unitario, subtotal) => [
  `${n}. ${nombre}`, `* Marca: ${marca}`, `* Color: ${color}`, `* Referencia: ${referencia}`, `* Talla EU: ${talla}`, `* Cantidad: ${cantidad}`, `* Precio unit.: ${unitario}`, `* Subtotal: ${subtotal}`,
].join('\n');
// Una línea vacía separa cada producto del siguiente y del bloque de datos de envío (16.1).
const pedido = (entradas, total, nota = '', datos = DATOS_ENVIO) => [
  ENCABEZADO, SEPARADOR, '', ...(nota ? [nota, ''] : []), entradas.join('\n\n'), '', ...lineasDatosEnvio(datos), SEPARADOR, `💰TOTAL: ${total}`, '🚚 Envío: Por confirmar.', '', DESPEDIDA,
].join('\n');

const NOTA_PRUEBA = 'Nota: pedido de prueba con productos ficticios.';

function comprobarFormato(mensaje) {
  expect(mensaje).not.toContain('�');
  expect(mensaje).not.toMatch(/undefined|null|NaN|\[object/);
  expect(mensaje.replace('\nMis datos:\n', '\n'), 'sin campos vacíos').not.toMatch(/^[ *]*[^:\n]+:\s*$/m);
  for (const antiguo of ['Hola, quiero', '¿Me confirmas', 'Resumen del pedido', 'Producto 1', 'Total de unidades', 'Subtotal estimado', 'Precio unitario', 'Talla: EU', 'COP', 'Modelo:', '📦', 'PEDIDO GAMA', '*TOTAL', '   Marca']) {
    expect(mensaje, `sin el formato anterior: ${antiguo}`).not.toContain(antiguo);
  }
  const lineas = mensaje.split('\n');
  expect(lineas[0], 'encabezado exacto').toBe(ENCABEZADO);
  expect(lineas[1], 'separador bajo el encabezado, sin línea vacía').toBe(SEPARADOR);
  expect(lineas[2]).toBe('');
  expect(lineas.at(-1)).toBe(DESPEDIDA);
  expect(lineas.at(-2), 'línea vacía antes de la despedida').toBe('');
  expect(lineas.filter((l) => l === SEPARADOR), 'separadores: inicio, datos de envío y total').toHaveLength(3);
  const final = lineas.lastIndexOf(SEPARADOR);
  expect(lineas[final + 1], 'total justo bajo el separador').toMatch(/^💰TOTAL: (\$[\d.]+|Por confirmar)$/);
  expect(lineas[final + 2], 'envío justo bajo el total').toBe('🚚 Envío: Por confirmar.');
  const datos = lineas.indexOf('*Mis datos:*');
  expect(lineas[datos - 1], 'separador sobre los datos de envío').toBe(SEPARADOR);
  expect(lineas[datos - 2], 'línea vacía tras el último producto').toBe('');
  for (const rotulo of ['Nombre', 'Teléfono', 'Ciudad', 'Dirección']) expect(mensaje).toMatch(new RegExp(`^${rotulo}: \\S`, 'm'));
  // Cada producto: número y modelo, y siete campos seguidos que empiezan por «* ».
  const rotulos = ['Marca', 'Color', 'Referencia', 'Talla EU', 'Cantidad', 'Precio unit.', 'Subtotal'];
  const numeradas = lineas.map((l, i) => [l, i]).filter(([l]) => /^\d+\. \S/.test(l));
  expect(numeradas.length).toBeGreaterThan(0);
  numeradas.forEach(([linea, i], n) => {
    expect(linea.startsWith(`${n + 1}. `), 'numeración consecutiva').toBe(true);
    expect(linea, 'modelo en mayúsculas').toBe(linea.toLocaleUpperCase('es-CO'));
    rotulos.forEach((rotulo, k) => expect(lineas[i + 1 + k].startsWith(`* ${rotulo}: `), `línea ${i + 1 + k}: «* ${rotulo}: »`).toBe(true));
    expect(lineas[i + 8], 'línea vacía tras el producto').toBe('');
  });
  expect(mensaje, 'sin asteriscos de cierre en los campos').not.toMatch(/^\* [^\n]*\*$/m);
}

function comprobarEnlace(url, { conSeparador = true } = {}) {
  const enlace = new URL(url);
  expect(enlace.origin + enlace.pathname, 'enlace que no corrompe los emojis').toBe('https://api.whatsapp.com/send');
  expect(enlace.searchParams.get('phone'), 'el número de CONFIG').toBe(NUMERO);
  expect(url, 'emoji 💰 bien codificado').toContain('%F0%9F%92%B0TOTAL');
  expect(url, 'emoji 🚚 bien codificado').toContain('%F0%9F%9A%9A%20Env%C3%ADo');
  expect(url, 'saltos de línea').toContain('%0A');
  if (conSeparador) expect(url, 'separador').toContain('%E2%94%80');
  expect(url, 'guion largo del encabezado').toContain('%E2%80%94');
  expect(url, '«&» del nombre sin romper el enlace').toContain('GAMA%20%26%20TALLA');
  expect(url, 'asteriscos del encabezado conservados').toMatch(/^[^?]+\?[^#]*text=(\*|%2A)GAMA/);
}

// Etapa 16.1: el envío ya no es un enlace preparado de antemano; se arma al pulsar, con datos de envío.
const hrefCarrito = (pagina) => enviarDesdeCarrito(pagina);
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
      const url = await pedirParDesdeFicha(pagina, dialogo, { tocar: true });
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
      const url = await pedirParDesdeFicha(pagina, dialogo);
      expect(textoDe(url)).toBe(pedido([entrada(1, 'MODELO DE PRUEBA · TRES COLORES', 'Marca de prueba', 'Negro / blanco', 'PRUEBA-TRES-NB', '41', 1, '$320.000', '$320.000')], '$320.000', NOTA_PRUEBA));
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
      const mensaje = textoDe(await pedirParDesdeFicha(pagina, dialogo));
      expect(mensaje).not.toContain('LCS Retro Classic');
      expect(mensaje).toContain('💰TOTAL: $120.000');
    }, { reducido: true });
  });
});

test.describe('Desde el carrito: «Enviar pedido»', () => {
  test('tu plantilla de varios productos, línea por línea, desde el flujo real', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
      await anadirDesdeFicha(pagina, 'SAMBA', { talla: '42' });
      await volverAlCatalogo(pagina);
      const { ventana } = await anadirDesdeFicha(pagina, 'LCS Retro Classic', { talla: '38' });
      await ventana.getByRole('button', { name: 'Ver carrito' }).click();
      const url = await hrefCarrito(pagina);
      comprobarEnlace(url);
      const mensaje = textoDe(url);
      expect(mensaje.split('\n')).toEqual([
        '*GAMA & TALLA — NUEVO PEDIDO*',
        '────────────────',
        '',
        '1. SAMBA',
        '* Marca: Adidas',
        '* Color: Rosa / blanco / beigh',
        '* Referencia: ADD-SAM',
        '* Talla EU: 42',
        '* Cantidad: 1',
        '* Precio unit.: $120.000',
        '* Subtotal: $120.000',
        '',
        '2. LCS RETRO CLASSIC',
        '* Marca: Le Coq Sportif',
        '* Color: Blanco / Rojo / Azul / Beis',
        '* Referencia: LCS-RET-01',
        '* Talla EU: 38',
        '* Cantidad: 1',
        '* Precio unit.: $120.000',
        '* Subtotal: $120.000',
        '',
        '────────────────',
        '*Mis datos:*',
        'Nombre: Camila Rodríguez',
        'Teléfono: 300 123 4567',
        'Ciudad: Barranquilla',
        'Dirección: Calle 84 # 51B-20, apto 302',
        '────────────────',
        '💰TOTAL: $240.000',
        '🚚 Envío: Por confirmar.',
        '',
        'Quedo a la espera de confirmación. ¡Gracias!',
      ]);
      comprobarFormato(mensaje);
    }, { reducido: true });
  });

  test('el mismo modelo en dos tallas son dos entradas independientes', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
      await anadirDesdeFicha(pagina, 'LCS Retro Classic', { talla: '38' });
      await volverAlCatalogo(pagina);
      const { ventana } = await anadirDesdeFicha(pagina, 'LCS Retro Classic', { talla: '41', cantidad: 2 });
      await ventana.getByRole('button', { name: 'Ver carrito' }).click();
      const mensaje = textoDe(await hrefCarrito(pagina));
      expect(mensaje).toBe(pedido([
        entrada(1, 'LCS RETRO CLASSIC', 'Le Coq Sportif', 'Blanco / Rojo / Azul / Beis', 'LCS-RET-01', '38', 1, '$120.000', '$120.000'),
        entrada(2, 'LCS RETRO CLASSIC', 'Le Coq Sportif', 'Blanco / Rojo / Azul / Beis', 'LCS-RET-01', '41', 2, '$120.000', '$240.000'),
      ], '$360.000'));
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
        entrada(1, 'MODELO DE PRUEBA · TRES COLORES', 'Marca de prueba', 'Blanco / verde', 'PRUEBA-TRES-BV', '40', 1, '$300.000', '$300.000'),
        entrada(2, 'MODELO DE PRUEBA · TRES COLORES', 'Marca de prueba', 'Negro / blanco', 'PRUEBA-TRES-NB', '40', 2, '$320.000', '$640.000'),
        entrada(3, 'MODELO DE PRUEBA · DOS COLORES', 'Marca de prueba', 'Gris / plata', 'PRUEBA-DOS-GP', '39', 3, '$280.000', '$840.000'),
        entrada(4, 'MODELO DE PRUEBA · DOS COLORES', 'Marca de prueba', 'Azul / blanco', 'PRUEBA-DOS-AB', '39', 1, '$280.000', '$280.000'),
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
      expect(textoDe(await hrefCarrito(pagina))).toContain('💰TOTAL: $360.000');
      await carrito.locator('.linea').nth(1).locator('[data-eliminar]').click();
      const final = textoDe(await hrefCarrito(pagina));
      expect(final).toContain('💰TOTAL: $240.000');
      expect(final).not.toContain('LCS Retro Classic');
    }, { reducido: true });
  });

  test('sin «Copiar pedido» como acción principal: el pie pide los datos de envío', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      await anadirPorCodigo(pagina, 'SAMBA', '42');
      await abrirCarritoDesdeCabecera(pagina);
      await expect(pagina.locator('#carrito-copiar')).toHaveCount(0);
      await expect(pagina.locator('#carrito-datos')).toHaveText('Agregar dirección');
      await expect(pagina.locator('#carrito-respaldo'), 'la copia del mensaje completo solo aparece con pedidos largos').toBeHidden();
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
      await pagina.locator('#carrito-datos').click();
      await guardarDatosEnvio(pagina);
      await expect(pagina.locator('#carrito-respaldo')).toBeVisible();
      const url = await hrefCarrito(pagina);
      expect(url.length, 'el enlace respeta el límite').toBeLessThanOrEqual(3000);
      comprobarEnlace(url, { conSeparador: false });
      const alternativo = textoDe(url);
      expect(alternativo).toContain(`${unidades} artículos`);
      expect(cifras(alternativo.match(/💰TOTAL: (.+)/)[1])).toBe(total);
      expect(alternativo).toContain('Te envío el detalle completo en el siguiente mensaje.');
      expect(alternativo, 'el resumen también lleva los datos de envío').toContain(lineasDatosEnvio().join('\n'));
      expect(alternativo).not.toContain('�');

      await expect(pagina.locator('#carrito-notificacion')).toContainText('copiamos el mensaje completo');
      const copiado = await pagina.evaluate(() => window.__copiado);
      comprobarFormato(copiado);
      expect(copiado.match(/^\d+\. \S/gm)).toHaveLength(lineas);
      expect(cifras(copiado.match(/💰TOTAL: (.+)/)[1])).toBe(total);
      // «Copiar mensaje completo» copia exactamente el mismo mensaje.
      await pagina.evaluate(() => { window.__copiado = ''; });
      await pagina.locator('#carrito-copiar-completo').click();
      expect(await pagina.evaluate(() => window.__copiado)).toBe(copiado);
    }, { reducido: true });
  });

  test('justo por debajo del límite el mensaje completo va en el enlace', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      await pagina.evaluate(() => {
        const candidatos = estado.productos.filter((p) => p.variantes[0].tallasDisponibles.length);
        const envio = { nombre: 'Camila Rodríguez', telefono: '300 123 4567', ciudad: 'Barranquilla', direccion: 'Calle 84 # 51B-20, apto 302', nota: '' };
        for (const p of candidatos) {
          agregarAlCarrito(p.clave, p.variantes[0].id, p.variantes[0].tallasDisponibles[0], 1);
          if (enlaceWhatsApp(crearMensajePedido(lineasCarrito(), envio)).length > CONFIG.limiteEnlaceWhatsApp) { estado.carrito.pop(); guardarCarrito(); break; }
        }
      });
      await abrirCarritoDesdeCabecera(pagina);
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
          total: cifras(mensaje.match(/💰TOTAL: (.+)/)[1]),
          unidades: [...mensaje.matchAll(/^\* Cantidad: (\d+)/gm)].reduce((s, m) => s + Number(m[1]), 0),
          subtotales: [...mensaje.matchAll(/^\* Subtotal: (.+)/gm)].map((m) => cifras(m[1])),
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

/* Etapa 16.2: esta batería es LOCAL y no pide nada a WhatsApp. La comprobación del servicio real
 * (api.whatsapp.com) está aparte, en tests/externo/whatsapp-en-vivo.spec.js, y solo se ejecuta con
 * GT_PRUEBAS_EXTERNAS=1. Lo que sigue es SIMULADO: comprueba cómo construye y codifica la tienda el
 * enlace, no que el servicio real lo acepte. */
test.describe('Enlace de WhatsApp (simulado, sin red externa)', () => {
  test('el enlace conserva emojis, guion largo, Ñ y signos al codificar; no se pide nada a WhatsApp', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
      const externas = [];
      pagina.on('request', (r) => { if (/whatsapp\.(com|net)/.test(r.url())) externas.push(r.url()); });
      const mensaje = ['*GAMA & TALLA — NUEVO PEDIDO*', '────────────────', '💰TOTAL: $120.000', '🚚 Envío: Por confirmar.', 'Ñandú «comillas» #2 & 50% + más'].join('\n');
      const enlace = await pagina.evaluate((m) => enlaceWhatsApp(m), mensaje);
      const url = new URL(enlace);
      expect(url.origin + url.pathname).toBe('https://api.whatsapp.com/send');
      expect(url.searchParams.get('phone')).toBe(NUMERO);
      expect(url.searchParams.get('text'), 'decodificado, es exactamente el mensaje').toBe(mensaje);
      const crudo = enlace.split('&text=')[1];
      for (const parte of ['%F0%9F%92%B0', '%F0%9F%9A%9A', '%E2%80%94', '%C3%91', '%C2%AB', '%26', '%23', '%25', '%2B', '%0A']) expect(crudo).toContain(parte);
      expect(crudo, 'sin caracteres de reemplazo').not.toContain('%EF%BF%BD');
      expect(crudo, 'sin espacios ni saltos sin codificar').not.toMatch(/[\s&#]/);
      // Usar la tienda (aquí, abrir una ficha) no pide nada a WhatsApp: window.open está simulado.
      await abrirDetalle(pagina, 'SAMBA');
      expect(externas, 'ninguna petición a WhatsApp desde la batería local').toEqual([]);
    });
  });
});
