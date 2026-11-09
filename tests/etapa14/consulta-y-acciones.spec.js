// Etapa 14d · Consulta de disponibilidad por WhatsApp, carrito con tres distribuciones,
// rótulo de la ficha y protección FUNCIONAL de los botones inertes.
import { test, expect } from '@playwright/test';
import { VISTAS, CELULAR, ESCRITORIO, abrirDetalle, detalleQuieto, sinDesborde, enviarDesdeCarrito } from '../etapa9/ayudas.js';
import {
  CATALOGO_MIGRADO, conEstados, tiendaConSupabase, guardadoV3, abrirCarritoDesdeCabecera,
  textoDe, CLAVE_CARRITO, URL_SUPABASE, cacheReal, CLAVE_PUBLICABLE_FICTICIA
} from './ayudas-etapa14.js';

const SAMBA = 'SAMBA';
const LCS = 'LCS Retro Classic';
const SEPARADOR = '─'.repeat(16);
const NL = String.fromCharCode(10);

const producto = (catalogo, nombre) => catalogo.find((p) => p.nombre === nombre);
const lineaV3 = (catalogo, nombre, talla, cantidad = 1) => {
  const p = producto(catalogo, nombre);
  return { producto: p.id, variante: p.variantes[0].id, talla, cantidad, precio: p.variantes[0].precio };
};
const carritoV3 = (lineas) => ({ version: 3, lineas, pendientes: [] });

// SAMBA con la 40 confirmada; el resto sigue por revisar, como en el catálogo migrado.
const CON_40 = conEstados(CATALOGO_MIGRADO, SAMBA, { 40: 'DISPONIBLE' });
const TALLA_LCS = producto(CATALOGO_MIGRADO, LCS).variantes[0].tallas[0].talla;

const href = (pagina, id) => pagina.locator(id).getAttribute('href');

// El navegador no debe salir de verdad a WhatsApp: se atiende la petición en local.
async function sinSalirAWhatsApp(pagina) {
  await pagina.context().route('https://api.whatsapp.com/**', (ruta) =>
    ruta.fulfill({ status: 200, contentType: 'text/html', body: '<p>whatsapp simulado</p>' }));
}

test.describe('Mensaje de consulta de WhatsApp', () => {
  test('un producto: formato aprobado, en singular y sin totales', async ({ browser, browserName }) => {
    const carrito = carritoV3([lineaV3(CATALOGO_MIGRADO, SAMBA, '41', 1)]);
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await abrirCarritoDesdeCabecera(pagina);
      const mensaje = textoDe(await href(pagina, '#carrito-consultar'));
      const esperado = [
        '*GAMA & TALLA — CONSULTA DE DISPONIBILIDAD*',
        SEPARADOR,
        '',
        '1. SAMBA',
        '* Marca: Adidas',
        '* Color: Rosa / blanco / beigh',
        // Etapa 16.2: la referencia visible es el código actual del color (no la del proveedor).
        '* Referencia: GT-00001-A',
        '* Talla EU: 41',
        '* Cantidad: 1',
        '* Precio publicado: $120.000',
        '',
        SEPARADOR,
        '🔎 ¿Me confirmas si este modelo y esta talla siguen disponibles y si el precio publicado continúa vigente?',
        '',
        'Si están disponibles y el precio sigue vigente, confirmo el pedido. ¡Gracias!'
      ].join(NL);
      expect(mensaje).toBe(esperado);
      expect(mensaje).not.toContain('Precio unit.');
      expect(mensaje).not.toMatch(/subtotal|total/i);
    }, { carrito });
  });

  test('varios productos: numeración por producto, redacción en plural y sin totales', async ({ browser, browserName }) => {
    const carrito = carritoV3([
      lineaV3(CATALOGO_MIGRADO, SAMBA, '41', 1),
      lineaV3(CATALOGO_MIGRADO, SAMBA, '42', 2),
      lineaV3(CATALOGO_MIGRADO, LCS, TALLA_LCS, 1)
    ]);
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await abrirCarritoDesdeCabecera(pagina);
      const mensaje = textoDe(await href(pagina, '#carrito-consultar'));
      expect(mensaje.match(/^\d+\. /gm)).toEqual(['1. ', '2. ', '3. ']);
      expect(mensaje).toContain('* Talla EU: 41');
      expect(mensaje).toContain('* Talla EU: 42');
      expect(mensaje).toContain('* Cantidad: 2');
      expect(mensaje.match(/\* Precio publicado: \$/g)).toHaveLength(3);
      expect(mensaje).toContain('🔎 ¿Me confirmas si estos modelos y estas tallas siguen disponibles y si los precios publicados continúan vigentes?');
      expect(mensaje.endsWith('Si están disponibles y los precios siguen vigentes, confirmo el pedido. ¡Gracias!')).toBe(true);
      expect(mensaje, 'el cierre del singular no debe colarse').not.toContain('este modelo');
      expect(mensaje).not.toMatch(/subtotal|total/i);
    }, { carrito });
  });

  test('va por api.whatsapp.com/send y conserva asteriscos literales y emojis', async ({ browser, browserName }) => {
    const carrito = carritoV3([lineaV3(CATALOGO_MIGRADO, SAMBA, '41', 1)]);
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await abrirCarritoDesdeCabecera(pagina);
      const enlace = await href(pagina, '#carrito-consultar');
      const url = new URL(enlace);
      expect(url.origin + url.pathname).toBe('https://api.whatsapp.com/send');
      expect(url.searchParams.get('phone')).toMatch(/^\d+$/);
      const mensaje = url.searchParams.get('text');
      expect(mensaje.startsWith('*GAMA & TALLA — CONSULTA DE DISPONIBILIDAD*')).toBe(true);
      expect(mensaje).toContain('* Marca: Adidas');
      expect(mensaje).toContain('🔎');
      expect(mensaje, 'ningún carácter corrupto').not.toContain('�');
    }, { carrito });
  });

  test('es independiente de NUEVO PEDIDO: el pedido no cambia por tener productos por revisar', async ({ browser, browserName }) => {
    const soloDisponible = carritoV3([lineaV3(CON_40, SAMBA, '40', 2)]);
    const mixto = carritoV3([lineaV3(CON_40, SAMBA, '40', 2), lineaV3(CON_40, SAMBA, '41', 1)]);
    let sinRevisar = '';
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await abrirCarritoDesdeCabecera(pagina);
      sinRevisar = textoDe(await enviarDesdeCarrito(pagina));
      await expect(pagina.locator('#carrito-consultar'), 'sin nada por revisar no hay consulta').toBeHidden();
    }, { respuesta: CON_40, carrito: soloDisponible });

    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await abrirCarritoDesdeCabecera(pagina);
      const pedido = textoDe(await enviarDesdeCarrito(pagina));
      const consulta = textoDe(await href(pagina, '#carrito-consultar'));
      expect(pedido, 'NUEVO PEDIDO es idéntico con o sin productos por revisar').toBe(sinRevisar);
      expect(pedido.startsWith('*GAMA & TALLA — NUEVO PEDIDO*')).toBe(true);
      expect(pedido).toContain('* Precio unit.: $120.000');
      expect(pedido).toContain('💰TOTAL:');
      // Nada se mezcla: cada mensaje lleva solo lo suyo.
      expect(pedido).toContain('* Talla EU: 40');
      expect(pedido).not.toContain('* Talla EU: 41');
      expect(consulta).toContain('* Talla EU: 41');
      expect(consulta).not.toContain('* Talla EU: 40');
      expect(consulta).not.toContain('NUEVO PEDIDO');
    }, { respuesta: CON_40, carrito: mixto });
  });
});

test.describe('Carrito: las tres distribuciones', () => {
  for (const vista of VISTAS) {
    test(`${vista.nombre}px: carrito mixto — datos de envío, enviar y consultar, en ese orden`, async ({ browser, browserName }) => {
      const carrito = carritoV3([lineaV3(CON_40, SAMBA, '40', 2), lineaV3(CON_40, SAMBA, '41', 1)]);
      await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
        await abrirCarritoDesdeCabecera(pagina);
        const datos = pagina.locator('#carrito-datos');
        const enviar = pagina.locator('#carrito-enviar');
        const consultar = pagina.locator('#carrito-consultar');
        await expect(datos).toBeVisible();
        await expect(enviar).toBeVisible();
        await expect(enviar, 'sin datos de envío no se puede enviar').toHaveAttribute('aria-disabled', 'true');
        await expect(pagina.locator('#carrito-envio-aviso')).toBeVisible();
        await expect(consultar).toBeVisible();
        await expect(pagina.locator('#carrito-copiar')).toHaveCount(0);
        await expect(consultar).toHaveText('Consultar disponibilidad');
        await expect(pagina.locator('#carrito-unidades')).toHaveText('2');
        const cajas = await Promise.all([datos, enviar, consultar].map((b) => b.boundingBox()));
        expect(cajas[0].y).toBeLessThan(cajas[1].y);
        expect(cajas[1].y).toBeLessThan(cajas[2].y);
        for (const caja of cajas) {
          expect(caja.x).toBeGreaterThanOrEqual(0);
          expect(caja.x + caja.width).toBeLessThanOrEqual(vista.ancho);
        }
        await sinDesborde(pagina);
      }, { respuesta: CON_40, carrito });
    });

    test(`${vista.nombre}px: todo por revisar — solo consultar, sin unidades ni subtotal`, async ({ browser, browserName }) => {
      const carrito = carritoV3([lineaV3(CATALOGO_MIGRADO, SAMBA, '40', 2), lineaV3(CATALOGO_MIGRADO, SAMBA, '41', 1)]);
      await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
        await abrirCarritoDesdeCabecera(pagina);
        await expect(pagina.locator('#carrito-enviar')).toBeHidden();
        await expect(pagina.locator('#carrito-datos'), 'sin pedido no se piden datos de envío').toBeHidden();
        await expect(pagina.locator('#carrito-envio-aviso')).toBeHidden();
        await expect(pagina.locator('#carrito-consultar')).toBeVisible();
        await expect(pagina.locator('#carrito-unidades')).toBeHidden();
        await expect(pagina.locator('#carrito-subtotal')).toBeHidden();
        await expect(pagina.locator('#carrito .linea')).toHaveCount(2);
        const guardado = await guardadoV3(pagina);
        expect(guardado.lineas.map((l) => [l.talla, l.cantidad])).toEqual([['40', 2], ['41', 1]]);
        const caja = await pagina.locator('#carrito-consultar').boundingBox();
        expect(caja.x + caja.width).toBeLessThanOrEqual(vista.ancho);
        await sinDesborde(pagina);
      }, { carrito });
    });
  }

  test('todo disponible: se conserva exactamente lo aprobado, sin acción de consulta', async ({ browser, browserName }) => {
    const carrito = carritoV3([lineaV3(CON_40, SAMBA, '40', 2)]);
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await abrirCarritoDesdeCabecera(pagina);
      await expect(pagina.locator('#carrito-enviar')).toBeVisible();
      await expect(pagina.locator('#carrito-datos')).toHaveText('Agregar dirección');
      await expect(pagina.locator('#carrito-consultar')).toBeHidden();
      await expect(pagina.locator('#carrito-unidades')).toBeVisible();
      await expect(pagina.locator('#carrito-subtotal')).toBeVisible();
      await expect(pagina.locator('#carrito-unidades')).toHaveText('2');
    }, { respuesta: CON_40, carrito });
  });
});

test.describe('Generar un mensaje nunca vacía el carrito', () => {
  test('mixto: enviar y consultar dejan los productos guardados', async ({ browser, browserName }) => {
    const carrito = carritoV3([lineaV3(CON_40, SAMBA, '40', 2), lineaV3(CON_40, SAMBA, '41', 1)]);
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await sinSalirAWhatsApp(pagina);
      await abrirCarritoDesdeCabecera(pagina);
      const antes = await guardadoV3(pagina);
      expect(antes.lineas).toHaveLength(2);

      const [abierta] = await Promise.all([pagina.context().waitForEvent('page'), pagina.locator('#carrito-consultar').click()]);
      await abierta.waitForLoadState('domcontentloaded').catch(() => {});
      expect(abierta.url(), 'consultar abre WhatsApp').toContain('api.whatsapp.com/send');
      await abierta.close();
      expect(await enviarDesdeCarrito(pagina), 'enviar abre WhatsApp').toContain('api.whatsapp.com/send');

      expect(await guardadoV3(pagina), 'el carrito guardado no cambió').toEqual(antes);
      await expect(pagina.locator('#carrito .linea')).toHaveCount(2);
      await expect(pagina.locator('#carrito-consultar')).toBeVisible();
      await expect(pagina.locator('#carrito-enviar')).toBeVisible();
    }, { respuesta: CON_40, carrito });
  });

  test('todo por revisar: consultar deja los productos y sus cantidades', async ({ browser, browserName }) => {
    const carrito = carritoV3([lineaV3(CATALOGO_MIGRADO, SAMBA, '40', 3), lineaV3(CATALOGO_MIGRADO, SAMBA, '41', 1)]);
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await sinSalirAWhatsApp(pagina);
      await abrirCarritoDesdeCabecera(pagina);
      const antes = await guardadoV3(pagina);
      const [abierta] = await Promise.all([pagina.context().waitForEvent('page'), pagina.locator('#carrito-consultar').click()]);
      await abierta.close();
      expect(await guardadoV3(pagina)).toEqual(antes);
      await expect(pagina.locator('#carrito .linea')).toHaveCount(2);
    }, { carrito });
  });

  test('consulta demasiado larga: se abre lo esencial, se copia el detalle y el carrito sigue intacto', async ({ browser, browserName }) => {
    const carrito = carritoV3([lineaV3(CATALOGO_MIGRADO, SAMBA, '40', 1), lineaV3(CATALOGO_MIGRADO, SAMBA, '41', 1)]);
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await abrirCarritoDesdeCabecera(pagina);
      await pagina.evaluate(() => { CONFIG.limiteEnlaceWhatsApp = 300; renderizarCarrito(); });
      await expect(pagina.locator('#carrito-consultar')).toHaveAttribute('data-largo', 'true');
      const antes = await guardadoV3(pagina);
      await pagina.locator('#carrito-consultar').click();
      const abiertas = await pagina.evaluate(() => window.__abiertas);
      expect(abiertas).toHaveLength(1);
      const corto = textoDe(abiertas[0]);
      expect(corto).toContain('CONSULTA DE DISPONIBILIDAD');
      expect(corto).toContain('Te envío el detalle completo en el siguiente mensaje.');
      expect(corto).not.toContain('* Talla EU');
      expect(await guardadoV3(pagina)).toEqual(antes);
    }, { carrito });
  });

  test('modo consulta (Supabase sin respuesta, caché real): se puede consultar y no pedir', async ({ browser, browserName }) => {
    const carrito = carritoV3([lineaV3(CATALOGO_MIGRADO, SAMBA, '40', 2)]);
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await abrirCarritoDesdeCabecera(pagina);
      await expect(pagina.locator('#carrito-enviar')).toBeHidden();
      await expect(pagina.locator('#carrito-copiar')).toBeHidden();
      await expect(pagina.locator('#carrito-consultar')).toBeVisible();
      const mensaje = textoDe(await href(pagina, '#carrito-consultar'));
      expect(mensaje).toContain('CONSULTA DE DISPONIBILIDAD');
      expect(mensaje).toContain('* Cantidad: 2');
    }, { config: { fuenteLocal: false, catalogoUrl: URL_SUPABASE, catalogoClave: CLAVE_PUBLICABLE_FICTICIA }, respuesta: { fallo: 500 }, cache: cacheReal(CATALOGO_MIGRADO), carrito });
  });
});

test.describe('Ficha: el rótulo general de disponibilidad ya no confunde', () => {
  for (const vista of [CELULAR, ESCRITORIO]) {
    test(`${vista.nombre}px: con una talla por revisar elegida no aparece «Disponible»`, async ({ browser, browserName }) => {
      await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
        const dialogo = await abrirDetalle(pagina, SAMBA);
        await dialogo.locator('.talla[data-talla="41"]').click();
        await expect(dialogo.locator('#detalle-disponibilidad')).toBeHidden();
        await expect(dialogo.locator('.detalle-ficha').getByText('Disponibilidad')).toBeHidden();
        await expect(dialogo.locator('.detalle-ficha')).not.toContainText(/Disponible\b/);
        // Lo que sí se ve: la referencia y el estado de la talla.
        await expect(dialogo.locator('#detalle-referencia')).toBeVisible();
        await expect(dialogo.locator('.talla[data-talla="41"]')).toHaveClass(/talla-por-revisar/);
        await expect(dialogo.locator('.detalle-por-revisar')).toContainText('necesita confirmación');
      });
    });
  }

  test('con una talla disponible tampoco hay rótulo general', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, SAMBA);
      await dialogo.locator('.talla[data-talla="40"]').click();
      await expect(dialogo.locator('#detalle-disponibilidad')).toBeHidden();
    }, { respuesta: CON_40 });
  });

  test('un color agotado de verdad sigue diciéndolo', async ({ browser, browserName }) => {
    const todas = Object.fromEntries(producto(CATALOGO_MIGRADO, SAMBA).variantes[0].tallas.map((t) => [t.talla, 'AGOTADO']));
    const agotado = conEstados(CATALOGO_MIGRADO, SAMBA, todas);
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      // «SAMBA» agotada queda al final del catálogo y buscar por texto abriría «Samba OG»:
      // se abre por su clave, que es lo que de verdad identifica al producto.
      await pagina.evaluate(() => abrirDetalles(estado.productos.find((p) => p.nombre === 'SAMBA').clave));
      const dialogo = await detalleQuieto(pagina);
      await expect(dialogo.locator('h2').first()).toHaveText('SAMBA');
      await expect(dialogo.locator('#detalle-disponibilidad')).toBeVisible();
      await expect(dialogo.locator('#detalle-disponibilidad')).toHaveText(/Agotado/);
    }, { respuesta: agotado });
  });
});

test.describe('Acciones con talla por revisar: protección funcional, no solo visual', () => {
  const ACCIONES = [
    ['AÑADIR AL CARRITO', (dialogo) => dialogo.locator('.detalle-acciones [data-accion="agregar"]')]
  ];

  // Ninguna vía debe abrir WhatsApp, tocar el carrito ni sacar al cliente de la ficha.
  async function nadaOcurrio(pagina, dialogo, via) {
    expect(await pagina.evaluate(() => window.__abiertas), `${via}: no se abre WhatsApp`).toEqual([]);
    expect(await pagina.evaluate((c) => localStorage.getItem(c), CLAVE_CARRITO), `${via}: el carrito no se modifica`).toBeNull();
    await expect(pagina.locator('#confirmacion-carrito'), `${via}: no hay confirmación`).toHaveJSProperty('open', false);
    await expect(dialogo, `${via}: la ficha sigue abierta`).toHaveJSProperty('open', true);
  }

  for (const vista of [CELULAR, ESCRITORIO]) {
    for (const [nombre, localizar] of ACCIONES) {
      test(`${vista.nombre}px · ${nombre}: clic normal, forzado, Enter, Espacio y foco`, async ({ browser, browserName }) => {
        await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
          const dialogo = await abrirDetalle(pagina, SAMBA);
          await dialogo.locator('.talla[data-talla="40"]').click();      // 40 está POR REVISAR
          const boton = localizar(dialogo);
          await boton.scrollIntoViewIfNeeded();

          // Estado inerte y su explicación, accesibles para un lector de pantalla.
          await expect(boton).toHaveAttribute('aria-disabled', 'true');
          await expect(boton).toHaveAttribute('aria-describedby', 'detalle-nota-por-revisar');
          await expect(boton).toHaveAccessibleDescription(/necesita confirmación/);
          await expect(dialogo.locator('#detalle-nota-por-revisar')).toBeVisible();

          // 1. Clic de verdad, con el ratón, en el centro del botón (no un clic «de prueba»).
          const caja = await boton.boundingBox();
          const x = caja.x + caja.width / 2;
          const y = caja.y + caja.height / 2;
          const encima = await boton.evaluate((b, [px, py]) => b.contains(document.elementFromPoint(px, py)), [x, y]);
          expect(encima, 'el clic cae realmente sobre el botón').toBe(true);
          await pagina.mouse.click(x, y);
          await nadaOcurrio(pagina, dialogo, 'clic normal');

          // 2. Clic forzado y evento sintético.
          await boton.click({ force: true });
          await nadaOcurrio(pagina, dialogo, 'clic forzado');
          await boton.dispatchEvent('click');
          await nadaOcurrio(pagina, dialogo, 'evento click');

          // 3. Teclado: el botón conserva el foco y ni Enter ni Espacio compran.
          await boton.focus();
          await expect(boton, 'sigue pudiendo recibir el foco').toBeFocused();
          await pagina.keyboard.press('Enter');
          await nadaOcurrio(pagina, dialogo, 'Enter');
          await expect(boton, 'Enter no le quita el foco').toBeFocused();
          await pagina.keyboard.press('Space');
          await nadaOcurrio(pagina, dialogo, 'Espacio');
          await expect(boton, 'Espacio no le quita el foco').toBeFocused();
        });
      });
    }
  }

  // Etapa 16.1: con una talla por revisar, el botón de WhatsApp CONSULTA esa talla. No compra,
  // no toca el carrito ni cierra la ficha; por cualquier vía produce una consulta, nunca un pedido.
  for (const vista of [CELULAR, ESCRITORIO]) {
    test(`${vista.nombre}px · Consultar esta talla por WhatsApp: clic, Enter y Espacio consultan; nada se compra`, async ({ browser, browserName }) => {
      await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
        const dialogo = await abrirDetalle(pagina, SAMBA);
        await dialogo.locator('.talla[data-talla="40"]').click();      // 40 está POR REVISAR
        const boton = dialogo.locator('.detalle-acciones [data-accion="pedir-ahora"]');
        await boton.scrollIntoViewIfNeeded();
        await expect(boton).toHaveText('Consultar esta talla por WhatsApp');
        await expect(boton).not.toHaveAttribute('aria-disabled', 'true');
        await expect(boton).toHaveAccessibleDescription(/necesita confirmación/);
        const comprobar = async (via, cuantas) => {
          const abiertas = await pagina.evaluate(() => window.__abiertas);
          expect(abiertas, `${via}: una consulta más`).toHaveLength(cuantas);
          const texto = textoDe(abiertas.at(-1));
          expect(texto, `${via}: es una consulta`).toContain('CONSULTA DE DISPONIBILIDAD');
          expect(texto, `${via}: nunca un pedido`).not.toContain('NUEVO PEDIDO');
          expect(await pagina.evaluate((c) => localStorage.getItem(c), CLAVE_CARRITO), `${via}: el carrito no se modifica`).toBeNull();
          await expect(pagina.locator('#confirmacion-carrito')).toHaveJSProperty('open', false);
          await expect(pagina.locator('#datos-envio'), `${via}: no pide datos de envío`).toHaveJSProperty('open', false);
          await expect(dialogo, `${via}: la ficha sigue abierta`).toHaveJSProperty('open', true);
        };
        await boton.click();
        await comprobar('clic', 1);
        await boton.focus();
        await pagina.keyboard.press('Enter');
        await comprobar('Enter', 2);
        await pagina.keyboard.press('Space');
        await comprobar('Espacio', 3);
      });
    });
  }

  test('navegación con Tab: los botones inertes siguen en el orden de foco', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, ESCRITORIO, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, SAMBA);
      await dialogo.locator('.talla[data-talla="40"]').click();
      await dialogo.locator('.talla[data-talla="40"]').focus();
      const visitados = [];
      for (let i = 0; i < 40; i += 1) {
        await pagina.keyboard.press('Tab');
        const info = await pagina.evaluate(() => {
          const a = document.activeElement;
          return { accion: a?.dataset?.accion || '', inerte: a?.getAttribute?.('aria-disabled') === 'true' };
        });
        if (info.accion === 'agregar') {
          visitados.push(info.accion);
          expect(info.inerte, 'agregar enfocado y marcado inerte').toBe(true);
          await pagina.keyboard.press('Enter');
          await nadaOcurrio(pagina, dialogo, 'Tab + Enter sobre agregar');
        }
        if (info.accion === 'pedir-ahora') {
          visitados.push(info.accion);
          expect(info.inerte, 'la consulta por WhatsApp está operativa').toBe(false);
        }
        if (visitados.includes('agregar') && visitados.includes('pedir-ahora')) break;
      }
      expect(visitados, 'Tab llega a las dos acciones').toEqual(expect.arrayContaining(['agregar', 'pedir-ahora']));
    });
  });

  test('control: con la talla confirmada, Enter sí compra (la prueba no es vacía)', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, ESCRITORIO, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, SAMBA);
      await dialogo.locator('.talla[data-talla="40"]').click();
      const boton = dialogo.locator('.detalle-acciones [data-accion="agregar"]');
      await boton.scrollIntoViewIfNeeded();
      await expect(boton).not.toHaveAttribute('aria-disabled', 'true');
      await expect(boton).not.toHaveAttribute('aria-describedby', /./);
      await boton.focus();
      await pagina.keyboard.press('Enter');
      await expect(pagina.locator('#confirmacion-carrito')).toHaveJSProperty('open', true);
      expect((await guardadoV3(pagina)).lineas).toHaveLength(1);
    }, { respuesta: CON_40 });
  });
});
