// @ts-check
/* Etapa 17.1 · Carrito en tres zonas (cabecera compacta, una sola zona con desplazamiento y pie fijo)
 * y «Cómo comprar» justo debajo de Inicio. Supabase se simula (como en las etapas 14 y 16): sin red
 * real ni datos remotos. WhatsApp no se abre (window.open queda registrado). Datos FICTICIOS.
 * Capturas fuera del repositorio: <carpeta temporal>/gama-talla-17-1-capturas.
 *
 *   npx playwright test tests/etapa17/carrito-y-recorrido.spec.js --workers=1
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CELULAR, ESCRITORIO, DATOS_ENVIO, guardarDatosEnvio } from '../etapa9/ayudas.js';
import { CATALOGO_MIGRADO, clonar, tiendaConSupabase, abrirCarritoDesdeCabecera } from '../etapa14/ayudas-etapa14.js';

const CAPTURAS = path.join(process.env.GT_CAPTURAS_17_1 || path.join(os.tmpdir(), 'gama-talla-17-1-capturas'));
fs.mkdirSync(CAPTURAS, { recursive: true });

const TELEFONO_BAJO = { nombre: '360', ancho: 360, alto: 640, tactil: true };
const VISTAS = [TELEFONO_BAJO, CELULAR, ESCRITORIO];
const NOMBRE_LARGO = 'ZAPATILLA DEPORTIVA EDICIÓN LIMITADA ULTRALIGERA CON AMORTIGUACIÓN REFORZADA 2026';
const SEGUNDA = { nombre: 'Andrés Pérez Gómez', telefono: '+57 311 222 3344', ciudad: 'Medellín', direccion: 'Carrera 43A # 1-50, torre 2, apto 1204', nota: 'Dejar con el portero' };

// Ocho zapatillas con la 40 y la 41 disponibles; una con nombre muy largo; la 42 de la última por revisar.
function catalogo() {
  const productos = clonar(CATALOGO_MIGRADO.slice(0, 8));
  productos.forEach((p, i) => {
    const v = p.variantes[0];
    for (const fila of v.tallas) {
      const disp = ['40', '41'].includes(fila.talla);
      const rev = i === 7 && fila.talla === '42';
      fila.estado = disp ? 'DISPONIBLE' : rev ? 'POR_REVISAR' : 'POR_REVISAR';
      fila.vigenciaDesde = disp ? new Date(Date.now() - 36e5).toISOString() : null;
      fila.venceEn = disp ? new Date(Date.now() + 36e5).toISOString() : null;
    }
    v.tallasDisponibles = v.tallas.filter((t) => t.estado === 'DISPONIBLE').map((t) => t.talla);
    v.tallasPorRevisar = v.tallas.filter((t) => t.estado === 'POR_REVISAR').map((t) => t.talla);
    v.tallasAgotadas = [];
  });
  productos[2].nombre = NOMBRE_LARGO;
  return productos;
}
const CATALOGO = catalogo();

// Añade líneas: [índice de producto, talla, cantidad].
async function anadir(pagina, lineas) {
  await pagina.evaluate((ls) => {
    for (const [i, talla, cantidad] of ls) {
      const p = estado.productos[i];
      agregarAlCarrito(p.clave, p.variantes[0].id, talla, cantidad);
    }
  }, lineas);
}
const CINCO = [[0, '40', 1], [1, '40', 2], [2, '41', 1], [3, '40', 1], [4, '41', 3]];
// Una talla por revisar no se puede añadir con agregarAlCarrito (solo lo disponible): se deja guardada en el carrito.
const anadirPorRevisar = (pagina, i, talla) => pagina.evaluate(([n, t]) => {
  const p = estado.productos[n];
  estado.carrito.push({ producto: p.clave, variante: p.variantes[0].id, talla: t, cantidad: 1, precio: p.variantes[0].precio });
  guardarCarrito(); actualizarInsignia();
}, [i, talla]);

// Medidas del carrito abierto, todas en píxeles de la ventana.
const medidas = (pagina) => pagina.evaluate(() => {
  const r = (s) => { const n = document.querySelector(s); if (!n || n.hidden) return null; const b = n.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, alto: b.height, ancho: b.width }; };
  const zona = document.querySelector('#carrito-zona');
  const pie = document.querySelector('#carrito-pie');
  return {
    ventana: { ancho: innerWidth, alto: innerHeight },
    cabecera: r('.carrito-cabecera'), cerrar: r('#carrito .boton-cerrar'), zona: r('#carrito-zona'), pie: r('#carrito-pie'),
    enviar: r('#carrito-enviar'), consultar: r('#carrito-consultar'), datos: r('#carrito-datos'),
    zonaDesplaza: zona.scrollHeight - zona.clientHeight, zonaAncho: zona.scrollWidth - zona.clientWidth,
    pieDesplaza: pie ? pie.scrollHeight - pie.clientHeight : 0,
    paginaAncho: document.documentElement.scrollWidth - innerWidth,
    desplazables: [...document.querySelectorAll('#carrito *')].filter((n) => n.scrollHeight > n.clientHeight + 1 && ['auto', 'scroll'].includes(getComputedStyle(n).overflowY)).map((n) => n.id || n.className)
  };
});

async function abrirConProductos(pagina, lineas = CINCO, porRevisar = []) {
  await anadir(pagina, lineas);
  for (const [i, talla] of porRevisar) await anadirPorRevisar(pagina, i, talla);
  await abrirCarritoDesdeCabecera(pagina);
  await expect(pagina.locator('#carrito .linea')).toHaveCount(lineas.length + porRevisar.length);
}
const guardarDireccion = async (pagina, datos = DATOS_ENVIO) => {
  await pagina.locator('#carrito-datos').click();
  await guardarDatosEnvio(pagina, datos);
  await expect(pagina.locator('#datos-envio')).toHaveJSProperty('open', false);
  // El botón de enviar recupera su color tras una breve transición: las capturas lo muestran ya activo.
  await pagina.mouse.move(1, 1);
  await expect.poll(() => pagina.locator('#carrito-enviar').evaluate((b) => getComputedStyle(b).backgroundColor)).toBe('rgb(15, 122, 65)');
};
const ultimaUrl = (pagina) => pagina.evaluate(() => window.__abiertas.at(-1) ?? null);
const textoDe = (url) => new URL(url).searchParams.get('text');

test.describe('Carrito: tres zonas', () => {
  for (const vista of VISTAS) {
    test(`${vista.ancho}×${vista.alto}: carrito vacío, cabecera compacta y sin pie`, async ({ browser, browserName }) => {
      await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
        await abrirCarritoDesdeCabecera(pagina);
        await expect(pagina.locator('.carrito-vacio h3')).toHaveText('Tu carrito está vacío');
        await expect(pagina.locator('#carrito-pie')).toBeHidden();
        await expect(pagina.locator('#carrito-complemento')).toBeHidden();
        const m = await medidas(pagina);
        expect(m.cabecera.alto, 'cabecera compacta').toBeLessThanOrEqual(64);
        expect(m.cerrar.alto).toBeGreaterThanOrEqual(44);
        expect(m.cerrar.ancho).toBeGreaterThanOrEqual(44);
        await expect(pagina.locator('#carrito-titulo')).toHaveText('Mi carrito');
        await expect(pagina.locator('.carrito-cabecera .etiqueta-mono'), 'sin la etiqueta de relleno').toHaveCount(0);
        expect(m.paginaAncho).toBe(0);
        await pagina.screenshot({ path: path.join(CAPTURAS, `carrito-vacio-${browserName}-${vista.ancho}x${vista.alto}.png`) });
      }, { respuesta: CATALOGO });
    });

    test(`${vista.ancho}×${vista.alto}: varios pares, una sola zona con desplazamiento y el pie siempre a la vista`, async ({ browser, browserName }) => {
      await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
        await abrirConProductos(pagina);
        await guardarDireccion(pagina);
        const m = await medidas(pagina);
        // Cabecera compacta y cerrar a la vista.
        expect(m.cabecera.alto).toBeLessThanOrEqual(64);
        expect(m.cerrar.top).toBeGreaterThanOrEqual(0);
        expect(m.cerrar.alto).toBeGreaterThanOrEqual(44);
        // El pie fijo: sus tres partes dentro de la ventana, sin desplazar nada.
        expect(m.pie.bottom, 'el pie llega al borde inferior').toBeLessThanOrEqual(m.ventana.alto + 1);
        expect(m.enviar.bottom).toBeLessThanOrEqual(m.pie.bottom + 1);
        expect(m.enviar.top).toBeGreaterThanOrEqual(m.zona.bottom - 1);
        expect(m.enviar.alto).toBeGreaterThanOrEqual(44);
        expect(m.pieDesplaza, 'el pie no tiene desplazamiento propio').toBeLessThanOrEqual(1);
        await expect(pagina.locator('#carrito-subtotal')).toBeVisible();
        await expect(pagina.locator('#carrito-pie .carrito-resumen')).toContainText('Por confirmar');
        await expect(pagina.locator('#carrito-enviar')).toBeInViewport({ ratio: 1 });
        // La mayor parte de la altura es de los productos.
        const alto = m.ventana.alto;
        expect(m.zona.alto / alto, 'la zona de productos es la mayor parte').toBeGreaterThan(vista.alto <= 640 ? 0.5 : 0.6);
        expect(m.pie.alto / alto, 'el pie es compacto').toBeLessThan(vista.alto <= 640 ? 0.3 : 0.25);
        // Un solo desplazamiento: solo la zona; nada más dentro del carrito desplaza.
        expect(m.zonaDesplaza, 'la zona desplaza con cinco pares').toBeGreaterThan(0);
        expect(m.desplazables).toEqual(['carrito-zona']);
        expect(m.zonaAncho).toBe(0);
        expect(m.paginaAncho).toBe(0);
        await pagina.screenshot({ path: path.join(CAPTURAS, `carrito-varios-${browserName}-${vista.ancho}x${vista.alto}.png`) });

        // Cada línea: miniatura, nombre, talla y color, precio; controles en una fila y tocables.
        const lineas = await pagina.locator('#carrito .linea').evaluateAll((ls) => ls.map((l) => {
          const caja = (s) => { const n = l.querySelector(s); const b = n.getBoundingClientRect(); return { top: b.top, left: b.left, ancho: b.width, alto: b.height, bottom: b.bottom }; };
          const fila = [...l.querySelectorAll('.cantidad-boton, .linea-subtotal, [data-eliminar]')].map((n) => Math.round(n.getBoundingClientRect().top + n.getBoundingClientRect().height / 2));
          const botones = [...l.querySelectorAll('.cantidad-boton, [data-eliminar]')].map((n) => n.getBoundingClientRect()).map((b) => [b.width, b.height]);
          const nombre = l.querySelector('.linea-nombre');
          return { foto: caja('.linea-media'), nombre: caja('.linea-nombre'), meta: caja('.linea-meta'), precio: caja('.linea-unitario'), filaCentros: fila, botones,
                   nombreDesborda: nombre.scrollWidth > nombre.clientWidth + 1, texto: nombre.textContent };
        }));
        for (const l of lineas) {
          expect(l.foto.ancho).toBeGreaterThanOrEqual(56);
          expect(l.nombre.top, 'nombre, luego talla y color, luego precio').toBeLessThan(l.meta.top);
          expect(l.meta.top).toBeLessThan(l.precio.top);
          expect(Math.max(...l.filaCentros) - Math.min(...l.filaCentros), 'cantidad, subtotal y quitar en una sola fila').toBeLessThanOrEqual(2);
          for (const [a, h] of l.botones) { expect(a).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44); }
          expect(l.nombreDesborda, 'los nombres largos se acomodan').toBe(false);
        }
        const largo = lineas.find((l) => l.texto.includes('EDICIÓN LIMITADA'));
        expect(largo.nombre.alto, 'el nombre largo ocupa varias líneas').toBeGreaterThan(30);
      }, { respuesta: CATALOGO });
    });
  }

  test('360×640: la última línea (y la dirección) se alcanzan y no quedan tapadas por el pie', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, TELEFONO_BAJO, async (pagina) => {
      await abrirConProductos(pagina);
      await guardarDireccion(pagina);
      await pagina.locator('#carrito-zona').evaluate((z) => { z.scrollTop = z.scrollHeight; });
      const m = await medidas(pagina);
      expect(m.zonaDesplaza).toBeGreaterThan(0);
      const entrega = await pagina.locator('#carrito-entrega').boundingBox();
      expect(entrega.y + entrega.height, 'el final de la zona queda por encima del pie').toBeLessThanOrEqual(m.pie.top + 1);
      // Con la zona al final, la última línea de productos y su fila de controles se pueden tocar.
      const ultima = pagina.locator('#carrito .linea').last();
      await ultima.scrollIntoViewIfNeeded();
      const casilla = await ultima.locator('.cantidad-boton').last().boundingBox();
      expect(casilla.y + casilla.height).toBeLessThanOrEqual(m.pie.top + 1);
      const tapado = await ultima.locator('.cantidad-boton').last().evaluate((b) => {
        const r = b.getBoundingClientRect();
        const arriba = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return arriba === b || b.contains(arriba);
      });
      expect(tapado, 'el control de la última línea recibe el toque').toBe(true);
      await pagina.screenshot({ path: path.join(CAPTURAS, `carrito-final-${browserName}-360x640.png`) });
    }, { respuesta: CATALOGO });
  });
});

test.describe('Carrito: dirección', () => {
  for (const vista of VISTAS) {
    test(`${vista.ancho}×${vista.alto}: sin dirección el envío está bloqueado y se ofrece «Agregar dirección»`, async ({ browser, browserName }) => {
      await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
        await abrirConProductos(pagina);
        await expect(pagina.locator('#carrito-datos')).toHaveText('Agregar dirección');
        await expect(pagina.locator('#carrito-datos')).toHaveAccessibleName('Agregar dirección de envío');
        await expect(pagina.locator('#carrito-entrega-ciudad')).toHaveText('Sin dirección');
        await expect(pagina.locator('#carrito-envio-ver')).toBeHidden();
        await expect(pagina.locator('#carrito-envio')).toBeHidden();
        await expect(pagina.locator('#carrito-envio-aviso')).toBeVisible();
        await expect(pagina.locator('#carrito-envio-aviso')).toHaveText('Completa tus datos de envío para continuar.');
        await expect(pagina.locator('#carrito-enviar')).toHaveAttribute('aria-disabled', 'true');
        await expect(pagina.locator('#carrito-enviar')).toBeInViewport({ ratio: 1 });
        // Pulsar enviar sin dirección no abre WhatsApp, avisa y lleva el foco a «Agregar dirección».
        await pagina.locator('#carrito-enviar').click({ force: true }); // aria-disabled: Playwright no pulsa lo inerte
        expect(await ultimaUrl(pagina)).toBeNull();
        await expect(pagina.locator('#carrito-notificacion')).toContainText('Completa tus datos de envío');
        await expect(pagina.locator('#carrito-datos')).toBeFocused();
        const m = await medidas(pagina);
        expect(m.datos.bottom, 'el botón enfocado no queda bajo el pie').toBeLessThanOrEqual(m.pie.top + 1);
        expect(m.datos.top).toBeGreaterThanOrEqual(m.zona.top - 1);
        await pagina.screenshot({ path: path.join(CAPTURAS, `carrito-sin-direccion-${browserName}-${vista.ancho}x${vista.alto}.png`) });
      }, { respuesta: CATALOGO });
    });
  }

  test('con dirección: una fila breve con la ciudad, «Ver datos» abre el detalle y la confirmación es breve', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await abrirConProductos(pagina);
      await guardarDireccion(pagina);
      await expect(pagina.locator('#carrito-entrega-ciudad')).toHaveText('Barranquilla');
      await expect(pagina.locator('#carrito-datos')).toHaveText('Cambiar');
      await expect(pagina.locator('#carrito-datos')).toHaveAccessibleName('Cambiar dirección de envío');
      await expect(pagina.locator('#carrito-envio-ver')).toHaveText('Ver datos');
      await expect(pagina.locator('#carrito-envio-ver')).toHaveAttribute('aria-expanded', 'false');
      await expect(pagina.locator('#carrito-envio'), 'nombre, teléfono, dirección y nota quedan en el detalle').toBeHidden();
      expect(await pagina.locator('#carrito-entrega').innerText(), 'lo que se ve no trae la dirección completa').not.toContain('Calle 84');
      // Confirmación breve junto a la fila, no el aviso azul de arriba.
      await expect(pagina.locator('#carrito-envio-confirmacion')).toHaveText('Dirección elegida para este pedido.');
      await expect(pagina.locator('#carrito-notificacion')).toBeHidden();
      const confirmacion = await pagina.locator('#carrito-envio-confirmacion').boundingBox();
      const fila = await pagina.locator('.carrito-entrega-fila').boundingBox();
      expect(confirmacion.y, 'junto a la fila de la dirección').toBeGreaterThanOrEqual(fila.y + fila.height - 1);
      expect(confirmacion.y - (fila.y + fila.height)).toBeLessThan(24);
      await expect(pagina.locator('#carrito-envio-aviso')).toBeHidden();
      await expect(pagina.locator('#carrito-enviar')).toHaveAttribute('aria-disabled', 'false');
      // Con teclado (WebKit no da foco al pulsar un botón con el ratón): el foco debe quedarse en el botón al desplegar.
      await pagina.locator('#carrito-envio-ver').focus();
      await pagina.keyboard.press('Enter');
      await expect(pagina.locator('#carrito-envio-ver')).toHaveAttribute('aria-expanded', 'true');
      await expect(pagina.locator('#carrito-envio-ver')).toHaveText('Ocultar datos');
      await expect(pagina.locator('#carrito-envio')).toBeVisible();
      for (const dato of ['Camila Rodríguez', '300 123 4567', 'Barranquilla', 'Calle 84 # 51B-20, apto 302']) await expect(pagina.locator('#carrito-envio-datos')).toContainText(dato);
      await expect(pagina.locator('#carrito-envio-ver')).toBeFocused();
      await pagina.screenshot({ path: path.join(CAPTURAS, `carrito-direccion-detalle-${browserName}-390x844.png`) });
      // Cambiar una cantidad no pliega el detalle ni mueve el foco de lugar.
      await pagina.locator('#carrito .linea').first().locator('[data-paso="1"]').click();
      await expect(pagina.locator('#carrito-envio')).toBeVisible();
      await pagina.locator('#carrito-envio-ver').click();
      await expect(pagina.locator('#carrito-envio')).toBeHidden();
      // Al volver a abrir el carrito la confirmación y el detalle empiezan plegados.
      await pagina.locator('#carrito .boton-cerrar').click();
      await abrirCarritoDesdeCabecera(pagina);
      await expect(pagina.locator('#carrito-envio-confirmacion')).toBeHidden();
      await expect(pagina.locator('#carrito-envio')).toBeHidden();
    }, { respuesta: CATALOGO });
  });

  test('cambiar de dirección: el mensaje usa la elegida en ese momento y los foco se conservan', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await abrirConProductos(pagina, [[0, '40', 1], [1, '41', 2]]);
      await guardarDireccion(pagina);
      // 1) El pedido sale con la primera dirección.
      await pagina.locator('#carrito-enviar').click();
      let mensaje = textoDe(await ultimaUrl(pagina));
      expect(mensaje).toContain('Dirección: Calle 84 # 51B-20, apto 302');
      expect(mensaje).not.toContain('Carrera 43A');
      // 2) Se abre la libreta (desde «Cambiar»): el foco vuelve a «Cambiar» al cerrarla.
      await pagina.locator('#carrito-datos').click();
      await expect(pagina.locator('#envio-libreta')).toBeVisible();
      await pagina.locator('#envio-nueva').click();
      await guardarDatosEnvio(pagina, SEGUNDA);
      await expect(pagina.locator('#datos-envio')).toHaveJSProperty('open', false);
      await expect(pagina.locator('#carrito-datos')).toBeFocused();
      await expect(pagina.locator('#carrito-entrega-ciudad')).toHaveText('Medellín');
      await expect(pagina.locator('#carrito-envio-confirmacion')).toHaveText('Dirección elegida para este pedido.');
      // 3) El pedido siguiente usa la dirección elegida ahora, no la anterior.
      await pagina.locator('#carrito-enviar').click();
      mensaje = textoDe(await ultimaUrl(pagina));
      expect(mensaje).toContain('Ciudad: Medellín');
      expect(mensaje).toContain('Dirección: Carrera 43A # 1-50, torre 2, apto 1204');
      expect(mensaje).toContain('Nombre: Andrés Pérez Gómez');
      expect(mensaje).not.toContain('Calle 84 # 51B-20');
      // 4) Volver a la primera desde la libreta (sin cerrar el carrito) también se refleja.
      await pagina.locator('#carrito-datos').click();
      await pagina.locator('#envio-direcciones').getByRole('radio').first().check();
      await pagina.locator('#envio-usar').click();
      await expect(pagina.locator('#datos-envio')).toHaveJSProperty('open', false);
      await expect(pagina.locator('#carrito-datos')).toBeFocused();
      await expect(pagina.locator('#carrito-entrega-ciudad')).toHaveText('Barranquilla');
      await pagina.locator('#carrito-enviar').click();
      expect(textoDe(await ultimaUrl(pagina))).toContain('Ciudad: Barranquilla');
      // 5) Cambiar cantidades conserva el foco en el mismo control (y el total sigue al día).
      const mas = pagina.locator('#carrito .linea').nth(1).locator('[data-paso="1"]');
      const clave = await mas.getAttribute('data-linea');
      await mas.click();
      const foco = await pagina.evaluate(() => ({ linea: document.activeElement?.dataset?.linea, paso: document.activeElement?.dataset?.paso }));
      expect(foco).toEqual({ linea: clave, paso: '1' });
      await expect(pagina.locator('#carrito-unidades')).toHaveText('4');
      await pagina.locator('#carrito .linea').nth(1).locator('[data-paso="-1"]').click();
      expect(await pagina.evaluate(() => document.activeElement?.dataset?.paso)).toBe('-1');
      await pagina.locator('#carrito-enviar').click();
      expect(textoDe(await ultimaUrl(pagina))).toContain('Ciudad: Barranquilla');
    }, { respuesta: CATALOGO });
  });
});

test.describe('Carrito: tallas por revisar y mensaje largo', () => {
  for (const vista of [TELEFONO_BAJO, ESCRITORIO]) {
    test(`${vista.ancho}×${vista.alto}: con tallas por revisar se conservan la nota y la consulta, y el pie sigue compacto`, async ({ browser, browserName }) => {
      await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
        await abrirConProductos(pagina, [[0, '40', 1], [1, '41', 1]], [[7, '42']]);
        await guardarDireccion(pagina);
        await expect(pagina.locator('#carrito .linea-por-revisar')).toHaveCount(1);
        await expect(pagina.locator('#carrito .linea-aviso')).toContainText('no se incluye en el pedido');
        await expect(pagina.locator('#carrito-nota')).toContainText('por revisar');
        await expect(pagina.locator('#carrito-unidades'), 'el resumen cuenta lo pedible').toHaveText('2');
        await expect(pagina.locator('#carrito-consultar')).toBeVisible();
        await expect(pagina.locator('#carrito-consultar')).toHaveText('Consultar disponibilidad');
        await expect(pagina.locator('#carrito-enviar')).toBeInViewport({ ratio: 1 });
        await expect(pagina.locator('#carrito-consultar')).toBeInViewport({ ratio: 1 });
        const m = await medidas(pagina);
        expect(m.consultar.top).toBeGreaterThanOrEqual(m.enviar.bottom - 1);
        expect(m.consultar.alto).toBeGreaterThanOrEqual(44);
        expect(m.pie.alto / m.ventana.alto, 'con dos acciones el pie sigue siendo compacto').toBeLessThan(vista.alto <= 640 ? 0.36 : 0.3);
        expect(m.pieDesplaza).toBeLessThanOrEqual(1);
        expect(m.desplazables.filter((x) => x !== 'carrito-zona'), 'solo la zona puede desplazar').toEqual([]);
        await expect(pagina.locator('#carrito-consultar')).toHaveAttribute('href', /api\.whatsapp\.com\/send/);
        await pagina.screenshot({ path: path.join(CAPTURAS, `carrito-por-revisar-${browserName}-${vista.ancho}x${vista.alto}.png`) });
      }, { respuesta: CATALOGO });
    });
  }

  test('todo por revisar: sin pedido no se piden direcciones; queda la consulta', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, TELEFONO_BAJO, async (pagina) => {
      await abrirConProductos(pagina, [], [[7, '42']]);
      await expect(pagina.locator('#carrito-entrega')).toBeHidden();
      await expect(pagina.locator('#carrito-datos')).toBeHidden();
      await expect(pagina.locator('#carrito-envio-aviso')).toBeHidden();
      await expect(pagina.locator('#carrito-enviar')).toBeHidden();
      await expect(pagina.locator('#carrito-unidades')).toBeHidden();
      await expect(pagina.locator('#carrito-consultar')).toBeInViewport({ ratio: 1 });
      await expect(pagina.locator('#carrito-nota')).toContainText('por revisar');
      await pagina.screenshot({ path: path.join(CAPTURAS, 'carrito-todo-por-revisar-360x640.png') });
    }, { respuesta: CATALOGO });
  });

  for (const vista of [TELEFONO_BAJO, CELULAR]) {
    test(`${vista.ancho}×${vista.alto}: mensaje largo, respaldo en la zona con desplazamiento y pie intacto`, async ({ browser, browserName }) => {
      await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
        await pagina.evaluate(() => {
          Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('sin permiso'); } } });
          document.execCommand = () => false; // fuerza el respaldo: no se puede copiar
        });
        await pagina.evaluate(() => {
          for (let r = 0; r < 3; r += 1) estado.productos.slice(0, 7).forEach((p, i) => agregarAlCarrito(p.clave, p.variantes[0].id, ['40', '41'][r % 2], (i % 3) + 1));
        });
        await abrirCarritoDesdeCabecera(pagina);
        await guardarDireccion(pagina);
        await expect(pagina.locator('#carrito-respaldo')).toBeVisible();
        await pagina.locator('#carrito-enviar').click();
        await expect(pagina.locator('#carrito-mensaje-completo')).toBeVisible();
        await expect(pagina.locator('#carrito-notificacion')).toContainText('No pudimos copiar automáticamente');
        // El respaldo vive dentro de la zona con desplazamiento y se llevó a la vista; el pie no cambió.
        const dentro = await pagina.locator('#carrito-mensaje-completo').evaluate((a) => ({ enZona: Boolean(a.closest('#carrito-zona')), enPie: Boolean(a.closest('#carrito-pie')) }));
        expect(dentro).toEqual({ enZona: true, enPie: false });
        const m = await medidas(pagina);
        const area = await pagina.locator('#carrito-mensaje-completo').boundingBox();
        expect(area.y).toBeGreaterThanOrEqual(m.zona.top - 1);
        expect(area.y).toBeLessThan(m.pie.top);
        expect(m.pie.alto / m.ventana.alto).toBeLessThan(vista.alto <= 640 ? 0.3 : 0.25);
        await expect(pagina.locator('#carrito-enviar')).toBeInViewport({ ratio: 1 });
        expect(m.desplazables, 'el área de texto no cuenta: es un control de formulario').not.toContain('carrito-pie');
        expect(m.zonaAncho).toBe(0);
        const abierta = await ultimaUrl(pagina);
        expect(abierta.length).toBeLessThanOrEqual(3000);
        await pagina.screenshot({ path: path.join(CAPTURAS, `carrito-mensaje-largo-${browserName}-${vista.ancho}x${vista.alto}.png`) });
        // El mensaje del respaldo es el pedido actual: cambiar una cantidad lo rehace.
        const antes = await pagina.locator('#carrito-mensaje-completo').inputValue();
        await pagina.locator('#carrito .linea').first().locator('[data-paso="1"]').click();
        await expect.poll(() => pagina.locator('#carrito-mensaje-completo').inputValue()).not.toBe(antes);
        await expect(pagina.locator('#carrito-notificacion')).toContainText('actualizamos el mensaje completo');
      }, { respuesta: CATALOGO });
    });
  }
});

test.describe('Recorrido: Inicio → Cómo comprar → Catálogo → Pagos → Contacto', () => {
  const ORDEN = ['inicio', 'como-comprar', 'catalogo', 'pagos', 'contacto'];

  test('el orden en el HTML, el menú, la numeración y el pie siguen el nuevo recorrido', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, ESCRITORIO, async (pagina) => {
      const orden = await pagina.evaluate(() => [...document.querySelectorAll('#inicio, #como-comprar, #catalogo, #pagos, #contacto')].map((s) => s.id));
      expect(orden).toEqual(ORDEN);
      expect(await pagina.locator('.menu-enlaces a').evaluateAll((a) => a.map((x) => x.getAttribute('href')))).toEqual(['#como-comprar', '#catalogo', '#pagos', '#contacto']);
      expect(await pagina.locator('.menu-enlaces a').allTextContents()).toEqual(['Cómo comprar', 'Catálogo', 'Pagos', 'Contacto']);
      expect(await pagina.locator('.seccion-numero').evaluateAll((n) => n.map((x) => x.textContent.trim()))).toEqual(['01Cómo comprar', '02Catálogo', '03Pagos', '04Contacto']);
      expect(await pagina.locator('footer .pie-columna').first().locator('a').evaluateAll((a) => a.map((x) => x.getAttribute('href')))).toEqual(['#como-comprar', '#catalogo', '#pagos', 'privacidad/']);
      // Anclas conservadas.
      for (const id of ['inicio', 'como-comprar', 'catalogo']) await expect(pagina.locator(`#${id}`)).toHaveCount(1);
      // Fondo oscuro y ancho de contenido de la tienda; un título breve y cinco pasos numerados.
      const s = await pagina.locator('#como-comprar').evaluate((n) => ({ fondo: getComputedStyle(n).backgroundColor, oscura: n.classList.contains('zona-oscura'), contenedor: Boolean(n.querySelector(':scope > .contenedor')) }));
      expect(s).toEqual({ fondo: 'rgb(20, 20, 20)', oscura: true, contenedor: true });
      await expect(pagina.locator('#titulo-como-comprar')).toHaveText('Tu pedido en cinco pasos');
      expect(await pagina.locator('#como-comprar .paso').count()).toBe(5);
      expect(await pagina.locator('#como-comprar .paso-numero').allTextContents()).toEqual(['01', '02', '03', '04', '05']);
      // Acción principal al final y «Ver mi carrito» como secundaria.
      const acciones = await pagina.locator('.pasos-cierre .acciones > *').evaluateAll((n) => n.map((x) => ({ texto: x.textContent.trim(), clase: x.className, href: x.getAttribute('href') })));
      expect(acciones[0]).toMatchObject({ texto: 'Explorar catálogo', href: '#catalogo' });
      expect(acciones[0].clase).toContain('boton-destacado');
      expect(acciones[1].texto).toBe('Ver mi carrito');
      expect(acciones[1].clase).not.toContain('boton-destacado');
    }, { respuesta: CATALOGO });
  });

  for (const vista of VISTAS) {
    test(`${vista.ancho}×${vista.alto}: disposición de los pasos y el catálogo cerca`, async ({ browser, browserName }) => {
      await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
        await pagina.locator('#como-comprar').scrollIntoViewIfNeeded();
        const g = await pagina.evaluate(() => {
          const pasos = [...document.querySelectorAll('#como-comprar .paso')].map((p) => p.getBoundingClientRect());
          const seccion = document.querySelector('#como-comprar').getBoundingClientRect();
          const catalogo = document.querySelector('#catalogo').getBoundingClientRect();
          const portada = document.querySelector('#inicio').getBoundingClientRect();
          return { tops: pasos.map((p) => Math.round(p.top)), altos: pasos.map((p) => p.height), anchos: pasos.map((p) => p.width),
                   seccion: seccion.height, hueco: catalogo.top - seccion.bottom, despuesInicio: seccion.top - portada.bottom, desborde: document.documentElement.scrollWidth - innerWidth };
        });
        expect(g.desborde).toBe(0);
        if (vista.ancho >= 1024) {
          expect(new Set(g.tops).size, 'en escritorio los cinco pasos van en una fila').toBe(1);
        } else if (vista.ancho < 768) {
          expect(new Set(g.tops).size, 'en celular, una columna').toBe(5);
          for (const alto of g.altos) expect(alto, 'filas cortas').toBeLessThanOrEqual(92);
          expect(g.seccion, 'el recorrido (cinco paneles con icono) ocupa pantalla y media, no más').toBeLessThan(vista.alto * 1.5);
        }
        expect(Math.abs(g.hueco)).toBeLessThanOrEqual(1);
        expect(Math.abs(g.despuesInicio)).toBeLessThanOrEqual(1);
        await pagina.screenshot({ path: path.join(CAPTURAS, `como-comprar-${browserName}-${vista.ancho}x${vista.alto}.png`) });
        await pagina.locator('.pasos-cierre').scrollIntoViewIfNeeded();
        await pagina.screenshot({ path: path.join(CAPTURAS, `como-comprar-cierre-${browserName}-${vista.ancho}x${vista.alto}.png`) });
      }, { respuesta: CATALOGO });
    });

    test(`${vista.ancho}×${vista.alto}: el menú, «Explorar catálogo» y «Ver mi carrito» llevan a su sección`, async ({ browser, browserName }) => {
      await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
        const abrirMenu = async () => { if (vista.ancho < 1024) { await pagina.locator('#boton-menu').click(); await expect(pagina.locator('#boton-menu')).toHaveAttribute('aria-expanded', 'true'); } };
        const arriba = (id) => pagina.evaluate((i) => Math.round(document.getElementById(i).getBoundingClientRect().top), id);
        const cabecera = () => pagina.evaluate(() => document.querySelector('#cabecera').getBoundingClientRect().bottom);
        const llegada = async (id) => {
          await expect.poll(async () => { const t = await arriba(id); const c = await cabecera(); return t >= -2 && t <= c + 40; }, { timeout: 8000 }).toBe(true);
        };
        for (const [texto, id] of [['Catálogo', 'catalogo'], ['Cómo comprar', 'como-comprar'], ['Pagos', 'pagos'], ['Contacto', 'contacto']]) {
          await abrirMenu();
          // El nombre accesible del enlace lleva una flecha decorativa («Catálogo →»): se elige por su destino.
          await expect(pagina.locator(`.menu-enlaces a[href="#${id}"]`)).toContainText(texto);
          await pagina.locator(`.menu-enlaces a[href="#${id}"]`).click();
          await llegada(id);
          await expect(pagina.locator(`.menu-enlaces a[href="#${id}"]`)).toHaveAttribute('aria-current', 'location');
          if (vista.ancho < 1024) await expect(pagina.locator('#boton-menu')).toHaveAttribute('aria-expanded', 'false');
        }
        // «Explorar catálogo» de la portada y el de «Cómo comprar» saltan directo al catálogo.
        await pagina.evaluate(() => window.scrollTo(0, 0));
        await pagina.locator('.portada .boton-principal[href="#catalogo"]').click();
        await llegada('catalogo');
        await pagina.locator('#como-comprar').scrollIntoViewIfNeeded();
        await pagina.locator('.pasos-cierre').getByRole('link', { name: 'Explorar catálogo' }).click();
        await llegada('catalogo');
        expect(await pagina.evaluate(() => location.hash)).toBe('#catalogo');
        // «Cómo comprar» desde la portada y desde el enlace del pie.
        await pagina.evaluate(() => window.scrollTo(0, 0));
        await pagina.locator('.portada .enlace-subrayado[href="#como-comprar"]').click();
        await llegada('como-comprar');
        await pagina.locator('footer').getByRole('link', { name: 'Cómo comprar' }).click();
        await llegada('como-comprar');
        // «Ver mi carrito» abre el carrito (la acción secundaria).
        await pagina.locator('.pasos-cierre').getByRole('button', { name: 'Ver mi carrito' }).click();
        await expect(pagina.locator('#carrito')).toHaveJSProperty('open', true);
      }, { respuesta: CATALOGO });
    });
  }

  test('transición Inicio → Cómo comprar → Catálogo: capturas en los tres anchos', async ({ browser, browserName }) => {
    for (const vista of VISTAS) {
      await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
        const y = (id) => pagina.evaluate((i) => Math.round(window.scrollY + document.getElementById(i).getBoundingClientRect().top), id);
        const bajo = await y('como-comprar');
        // Final del inicio, entrando a «Cómo comprar».
        await pagina.evaluate((p) => window.scrollTo(0, p - Math.round(innerHeight * 0.55)), bajo);
        await pagina.screenshot({ path: path.join(CAPTURAS, `transicion-1-inicio-a-como-comprar-${browserName}-${vista.ancho}x${vista.alto}.png`) });
        // Final de «Cómo comprar», entrando al catálogo.
        const cat = await y('catalogo');
        await pagina.evaluate((p) => window.scrollTo(0, p - Math.round(innerHeight * 0.55)), cat);
        await pagina.screenshot({ path: path.join(CAPTURAS, `transicion-2-como-comprar-a-catalogo-${browserName}-${vista.ancho}x${vista.alto}.png`) });
        // Primer vistazo del catálogo con su cabecera.
        await pagina.evaluate((p) => window.scrollTo(0, p - 60), cat);
        await pagina.screenshot({ path: path.join(CAPTURAS, `transicion-3-catalogo-${browserName}-${vista.ancho}x${vista.alto}.png`) });
        expect(await pagina.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
      }, { respuesta: CATALOGO });
    }
  });
});
