// Etapa 12 (ajustes finales) · Al añadir desde la ficha, la ficha se cierra y queda la confirmación.
// Primero celular (360 y 390), después tableta y escritorio. En los casos fallidos la ficha NO se cierra.
import { test, expect } from '@playwright/test';
import { VISTAS, CELULAR, ESCRITORIO, URL_REAL, enTienda, nuevaPagina, irATienda, abrirDetalle } from '../etapa9/ayudas.js';
import { ventanaDe, ventanaLista, cifras, CLAVE_CARRITO } from './ayudas-etapa12.js';

const pulsar = (localizador, vista) => (vista.tactil ? localizador.tap() : localizador.click());
const abiertos = (pagina) => pagina.evaluate(() => [...document.querySelectorAll('dialog')].filter((d) => d.open).map((d) => d.id));
const lineas = (pagina) => pagina.evaluate((c) => JSON.parse(localStorage.getItem(c) || '{"lineas":[]}').lineas, CLAVE_CARRITO);

// Registra cualquier momento en que se abre un diálogo modal mientras otro sigue abierto.
const vigilarSolapes = (pagina) => pagina.evaluate(() => {
  window.__solapes = [];
  if (HTMLDialogElement.prototype.__original) return;
  HTMLDialogElement.prototype.__original = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function showModal() {
    const antes = [...document.querySelectorAll('dialog')].filter((d) => d.open && d !== this).map((d) => d.id);
    if (antes.length) window.__solapes.push(`${this.id} sobre ${antes.join(', ')}`);
    return HTMLDialogElement.prototype.__original.call(this);
  };
});
const solapes = (pagina) => pagina.evaluate(() => window.__solapes);

async function anadir(pagina, vista, nombre, { talla, cantidad = 1, variante } = {}) {
  const dialogo = await abrirDetalle(pagina, nombre);
  if (variante) await pulsar(dialogo.locator(`[data-variante="${variante}"]`), vista);
  await pulsar(dialogo.locator(`.talla[data-talla="${talla}"]`), vista);
  for (let i = 1; i < cantidad; i++) await pulsar(dialogo.locator('.detalle-compra [data-cantidad-detalle][data-paso="1"]'), vista);
  const agregar = dialogo.locator('.detalle-acciones [data-accion="agregar"]');
  await agregar.scrollIntoViewIfNeeded();
  await pulsar(agregar, vista);
  return { dialogo, ventana: await ventanaLista(pagina) };
}

// Pasa un instante: sirve para comprobar que algo NO reaparece (no hay evento que esperar).
const dejarPasar = (pagina) => pagina.waitForTimeout(450);
// El catálogo vuelve a responder: se puede abrir y cerrar otra ficha.
async function catalogoResponde(pagina, vista) {
  const otra = await abrirDetalle(pagina, 'Samba OG');
  await expect(otra).toHaveJSProperty('open', true);
  await pulsar(otra.getByRole('button', { name: 'Cerrar detalles' }), vista);
  await expect(otra).toHaveJSProperty('open', false);
}

const TELEFONO_BAJO = { nombre: '360x640', ancho: 360, alto: 640, tactil: true };
const ORDEN = [VISTAS[0], VISTAS[1], TELEFONO_BAJO, ...VISTAS.slice(2)];

for (const vista of ORDEN) {
  test.describe(`${vista.nombre}`, () => {
    test('añadir: el producto entra, la ficha se cierra y la confirmación conserva todos los datos', async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        await vigilarSolapes(pagina);
        const { dialogo, ventana } = await anadir(pagina, vista, 'SAMBA', { talla: '40', cantidad: 2 });
        expect(await lineas(pagina)).toEqual([{ producto: 'ADD-SAM~zapatilla-01', variante: 'unica', talla: '40', cantidad: 2, precio: 120000 }]);
        await expect(dialogo, 'la ficha se cerró').toHaveJSProperty('open', false);
        await expect(ventana).toHaveJSProperty('open', true);
        expect(await abiertos(pagina), 'solo la confirmación').toEqual(['confirmacion-carrito']);
        expect(await solapes(pagina), 'nunca dos diálogos a la vez').toEqual([]);
        await expect(ventana.locator('h2')).toBeFocused();
        // Todos los datos siguen a la vista.
        await expect(ventana.locator('.detalle-marca')).toHaveText('Adidas · Urbanas');
        await expect(ventana.locator('.confirmacion-modelo')).toHaveText('SAMBA');
        expect(cifras(await ventana.locator('.precio-actual').textContent())).toBe(120000);
        expect(cifras(await ventana.locator('.precio-anterior').textContent())).toBe(290000);
        await expect(ventana.locator('.precio-ahorro')).toHaveText('59% OFF');
        await expect(ventana.locator('.confirmacion-dato-color dd')).toHaveText('Rosa / blanco / beigh');
        await expect(ventana.locator('.confirmacion-dato-talla dd')).toHaveText('40');
        await expect(ventana.locator('.confirmacion-dato-cantidad dd')).toHaveText('2');
        await expect(ventana.locator('.confirmacion-foto img')).toHaveAttribute('src', /zapatilla_01\.webp/);
        await expect.poll(() => ventana.locator('.confirmacion-foto img').evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
        await expect(ventana.locator('#confirmacion-unidades')).toHaveText('2 artículos');
        expect(cifras(await ventana.locator('#confirmacion-total').textContent())).toBe(240000);
        await expect(ventana.getByRole('button', { name: 'Ver carrito' })).toBeInViewport({ ratio: 1 });
        await expect(ventana.getByRole('button', { name: 'Seguir explorando' })).toBeInViewport({ ratio: 1 });
      }, { reducido: true });
    });

    test('la confirmación no depende de la ficha: aunque su contenido desaparezca, nada se pierde', async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        const { ventana } = await anadir(pagina, vista, 'Air Jordan 1 Retro High OG', { talla: '43', cantidad: 3 });
        const antes = await ventana.locator('#confirmacion-producto').innerText();
        await pagina.evaluate(() => { document.querySelector('#detalle-contenido').replaceChildren(); estado.detalle = null; });
        expect(await ventana.locator('#confirmacion-producto').innerText()).toBe(antes);
        expect(antes).toContain('JORDAN');
        expect(antes).toContain('AIR JORDAN 1 RETRO HIGH OG');
        expect(antes).toContain('43');
        await pulsar(ventana.getByRole('button', { name: 'Ver carrito' }), vista);
        await expect(pagina.locator('#carrito .linea')).toHaveCount(1);
        await expect(pagina.locator('#carrito-unidades')).toHaveText('3');
      }, { reducido: true });
    });

    test('VER CARRITO → cerrar el carrito con la X: catálogo, sin que reaparezca la ficha', async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        await vigilarSolapes(pagina);
        const { dialogo, ventana } = await anadir(pagina, vista, 'SAMBA', { talla: '40' });
        await pulsar(ventana.getByRole('button', { name: 'Ver carrito' }), vista);
        const carrito = pagina.locator('#carrito');
        await expect(carrito).toHaveJSProperty('open', true);
        await expect(ventana).toHaveJSProperty('open', false);
        await expect(dialogo, 'con el carrito abierto la ficha ya está cerrada').toHaveJSProperty('open', false);
        expect(await abiertos(pagina)).toEqual(['carrito']);
        await expect(carrito.locator('.linea')).toHaveCount(1);
        await pulsar(carrito.getByRole('button', { name: 'Cerrar carrito' }), vista);
        await expect(carrito).toHaveJSProperty('open', false);
        await dejarPasar(pagina);
        expect(await abiertos(pagina), 'catálogo a la vista: ningún diálogo abierto').toEqual([]);
        await expect(pagina.locator('html')).not.toHaveClass(/sin-desplazamiento/);
        await expect(pagina.locator(':focus'), 'el foco vuelve a la tarjeta').toHaveClass(/tarjeta-enlace/);
        expect(await pagina.locator(':focus').evaluate((n) => n.closest('.tarjeta').dataset.id)).toBe('ADD-SAM~zapatilla-01');
        await expect(pagina.locator('#insignia-carrito')).toHaveText('1');
        expect(await solapes(pagina)).toEqual([]);
        await catalogoResponde(pagina, vista);
      }, { reducido: true });
    });

    test('SEGUIR EXPLORANDO: catálogo, filtros conservados y carrito intacto', async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, vista, async (pagina) => {
        await pagina.locator('#buscar').fill('samba');
        const tarjetas = await pagina.locator('.tarjeta').count();
        const { dialogo, ventana } = await anadir(pagina, vista, 'SAMBA', { talla: '40' });
        await expect(dialogo).toHaveJSProperty('open', false);
        await pulsar(ventana.getByRole('button', { name: 'Seguir explorando' }), vista);
        await expect(ventana).toHaveJSProperty('open', false);
        await dejarPasar(pagina);
        expect(await abiertos(pagina)).toEqual([]);
        await expect(pagina.locator('#buscar')).toHaveValue('samba');
        await expect(pagina.locator('.tarjeta')).toHaveCount(tarjetas);
        expect(await lineas(pagina)).toHaveLength(1);
        await expect(pagina.locator(':focus')).toHaveClass(/tarjeta-enlace/);
        await pagina.locator('#buscar').fill('');
        await catalogoResponde(pagina, vista);
      }, { reducido: true });
    });

    for (const [como, cerrar] of [
      ['la X de la confirmación', (pagina, ventana) => pulsar(ventana.getByRole('button', { name: 'Cerrar confirmación' }), vista)],
      ['Escape', (pagina) => pagina.keyboard.press('Escape')],
    ]) {
      test(`${como}: queda el catálogo con el producto conservado`, async ({ browser, browserName }) => {
        await enTienda({ browser, browserName }, vista, async (pagina) => {
          const { dialogo, ventana } = await anadir(pagina, vista, 'SAMBA', { talla: '40' });
          await cerrar(pagina, ventana);
          await expect(ventana).toHaveJSProperty('open', false);
          await dejarPasar(pagina);
          await expect(dialogo, 'la ficha no reaparece').toHaveJSProperty('open', false);
          expect(await abiertos(pagina)).toEqual([]);
          expect(await lineas(pagina)).toHaveLength(1);
          await expect(pagina.locator('#insignia-carrito')).toHaveText('1');
          await expect(pagina.locator(':focus')).toHaveClass(/tarjeta-enlace/);
          await expect(pagina.locator('html')).not.toHaveClass(/sin-desplazamiento/);
          await catalogoResponde(pagina, vista);
        }, { reducido: true });
      });
    }
  });
}

test.describe('Casos fallidos: la ficha no se cierra', () => {
  for (const vista of [VISTAS[0], VISTAS[1], ESCRITORIO]) {
    test.describe(`${vista.nombre}`, () => {
      // Ficha abierta, sin cambios en el carrito ni en la confirmación.
      async function sigueAbierta(pagina, dialogo, lineasEsperadas = 0) {
        await expect(dialogo).toHaveJSProperty('open', true);
        await expect(ventanaDe(pagina)).toHaveJSProperty('open', false);
        expect(await abiertos(pagina)).toEqual(['modal-producto']);
        expect(await lineas(pagina)).toHaveLength(lineasEsperadas);
      }

      test('sin talla: se mantiene la validación', async ({ browser, browserName }) => {
        await enTienda({ browser, browserName }, vista, async (pagina) => {
          const dialogo = await abrirDetalle(pagina, 'SAMBA');
          const agregar = dialogo.locator('.detalle-acciones [data-accion="agregar"]');
          await agregar.scrollIntoViewIfNeeded();
          await pulsar(agregar, vista);
          await expect(dialogo.locator('#detalle-aviso')).toContainText('Elige una talla EU');
          await sigueAbierta(pagina, dialogo);
        }, { reducido: true });
      });

      test('producto agotado: no hay con qué añadir y la ficha sigue abierta', async ({ browser, browserName }) => {
        await enTienda({ browser, browserName }, vista, async (pagina) => {
          const dialogo = await abrirDetalle(pagina, 'Air Jordan 4 Retro');
          const agregar = dialogo.locator('.detalle-acciones [data-accion="agregar"]');
          await expect(agregar, 'el botón no se ofrece').toBeHidden();
          await agregar.evaluate((b) => b.click()); // aunque alguien lo dispare por código
          await sigueAbierta(pagina, dialogo);
        }, { reducido: true });
      });

      test('límite alcanzado: no entra nada, se avisa y la ficha sigue abierta', async ({ browser, browserName }) => {
        await enTienda({ browser, browserName }, vista, async (pagina) => {
          await pagina.evaluate(() => { const p = estado.productos.find((x) => x.nombre === 'SAMBA'); agregarAlCarrito(p.clave, p.variantes[0].id, '40', 10); });
          const dialogo = await abrirDetalle(pagina, 'SAMBA');
          await pulsar(dialogo.locator('.talla[data-talla="40"]'), vista);
          const agregar = dialogo.locator('.detalle-acciones [data-accion="agregar"]');
          await agregar.scrollIntoViewIfNeeded();
          await pulsar(agregar, vista);
          await expect(pagina.locator('#aviso-flotante-texto')).toContainText('Máximo 10 unidades');
          await expect(dialogo).toHaveJSProperty('open', true);
          await expect(ventanaDe(pagina)).toHaveJSProperty('open', false);
          expect((await lineas(pagina))[0].cantidad).toBe(10);
        }, { reducido: true });
      });

      test('cantidad no válida: no se añade y la ficha sigue abierta', async ({ browser, browserName }) => {
        await enTienda({ browser, browserName }, vista, async (pagina) => {
          const dialogo = await abrirDetalle(pagina, 'SAMBA');
          await pulsar(dialogo.locator('.talla[data-talla="40"]'), vista);
          for (const invalida of [0, -1, 11, 2.5, NaN, null]) {
            await pagina.evaluate((v) => { estado.detalle.cantidad = v; }, invalida);
            await dialogo.locator('.detalle-acciones [data-accion="agregar"]').evaluate((b) => b.click());
            await expect(dialogo.locator('#detalle-aviso'), `cantidad ${invalida}`).toContainText('Elige una cantidad entre 1 y 10');
            await sigueAbierta(pagina, dialogo);
          }
        }, { reducido: true });
      });

      test('la talla dejó de estar disponible: no se añade y la ficha sigue abierta', async ({ browser, browserName }) => {
        await enTienda({ browser, browserName }, vista, async (pagina) => {
          const dialogo = await abrirDetalle(pagina, 'SAMBA');
          await pulsar(dialogo.locator('.talla[data-talla="40"]'), vista);
          // La talla deja de ofrecerse. Desde la etapa 14 el estado de cada talla vive
          // en estadosTalla, así que hay que retirarla también de ahí.
          await pagina.evaluate(() => {
            const v = estado.productos.find((x) => x.nombre === 'SAMBA').variantes[0];
            v.tallasDisponibles = v.tallasDisponibles.filter((t) => t !== '40');
            v.tallasOfrecidas = v.tallasOfrecidas.filter((t) => t !== '40');
            delete v.estadosTalla['40'];
          });
          await dialogo.locator('.detalle-acciones [data-accion="agregar"]').evaluate((b) => b.click());
          await expect(dialogo.locator('#detalle-aviso')).toContainText('Elige una talla EU');
          await sigueAbierta(pagina, dialogo);
        }, { reducido: true });
      });

      test('operación rechazada por el carrito: la ficha sigue abierta', async ({ browser, browserName }) => {
        await enTienda({ browser, browserName }, vista, async (pagina) => {
          const dialogo = await abrirDetalle(pagina, 'SAMBA');
          await pulsar(dialogo.locator('.talla[data-talla="40"]'), vista);
          await pagina.evaluate(() => { window.agregarAlCarrito = () => false; });
          await dialogo.locator('.detalle-acciones [data-accion="agregar"]').evaluate((b) => b.click());
          await sigueAbierta(pagina, dialogo);
        }, { reducido: true });
      });

      test('doble clic o doble toque: una sola unidad, la ficha cerrada y una sola ventana', async ({ browser, browserName }) => {
        await enTienda({ browser, browserName }, vista, async (pagina) => {
          await vigilarSolapes(pagina);
          const dialogo = await abrirDetalle(pagina, 'SAMBA');
          await pulsar(dialogo.locator('.talla[data-talla="40"]'), vista);
          const agregar = dialogo.locator('.detalle-acciones [data-accion="agregar"]');
          await agregar.scrollIntoViewIfNeeded();
          // Dos pulsaciones seguidas en la misma tarea, como un doble toque rápido.
          await agregar.evaluate((b) => { b.click(); b.click(); });
          await ventanaLista(pagina);
          await expect(dialogo).toHaveJSProperty('open', false);
          expect(await abiertos(pagina)).toEqual(['confirmacion-carrito']);
          expect(await lineas(pagina)).toEqual([{ producto: 'ADD-SAM~zapatilla-01', variante: 'unica', talla: '40', cantidad: 1, precio: 120000 }]);
          expect(await solapes(pagina)).toEqual([]);
        }, { reducido: true });
      });
    });
  }

  test('variante agotada de un producto con varios colores: la ficha sigue abierta', async ({ browser, browserName }) => {
    const { contexto, pagina, problemas } = await nuevaPagina(browser, browserName, CELULAR, { reducido: true });
    await pagina.route('**/data/productos.json', async (ruta) => {
      const respuesta = await ruta.fetch();
      const json = await respuesta.json();
      const base = json.productos.find((p) => p.nombre === 'Dunk Low Retro');
      base.variantes = [
        { id: 'NK-A', color: 'Negro / blanco', imagenes: [base.imagen], tallasDisponibles: ['40', '42'], tallasAgotadas: [] },
        { id: 'NK-B', color: 'Gris', imagenes: [base.imagen], tallasDisponibles: [], tallasAgotadas: ['40', '41'] },
      ];
      await ruta.fulfill({ response: respuesta, json });
    });
    await irATienda(pagina, URL_REAL);
    const dialogo = await abrirDetalle(pagina, 'Dunk Low Retro');
    await dialogo.locator('[data-variante="NK-B"]').tap();
    await expect(dialogo.locator('.detalle-sin-stock')).toBeVisible();
    await dialogo.locator('.detalle-acciones [data-accion="agregar"]').evaluate((b) => b.click());
    await expect(dialogo).toHaveJSProperty('open', true);
    await expect(ventanaDe(pagina)).toHaveJSProperty('open', false);
    expect(await lineas(pagina)).toHaveLength(0);
    expect(problemas).toEqual([]);
    await contexto.close();
  });
});

test.describe('Añadido rápido desde el catálogo', () => {
  test('confirma sin abrir ni cerrar fichas, y Escape devuelve el foco al botón', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
      /* El evento `close` de un <dialog> NO llega en el mismo instante en que `open` pasa a
         false: llega aproximadamente un fotograma después (medido: 11–16 ms en Chromium,
         hasta 32 ms en Firefox). El oyente de esta prueba se instalaba DESPUÉS de ver
         `open === false`, así que a veces recibía el cierre de la preparación y lo contaba
         como un cierre del añadido rápido.
         Ahora el oyente se instala ANTES de abrir la ficha y cada cierre queda anotado con
         la fase en la que llegó. El cierre de la preparación es esperado y se ESPERA a que
         llegue (no se da por hecho que ya llegó); a partir de ahí cualquier cierre es
         inesperado. Nada se reinicia: la lista se conserva entera. */
      await pagina.evaluate(() => {
        window.__cierres = [];
        window.__fase = 'preparacion';
        document.querySelector('#modal-producto').addEventListener('close', () => { window.__cierres.push(window.__fase); });
      });
      const dialogo = await abrirDetalle(pagina, 'SAMBA');
      await dialogo.locator('.talla[data-talla="40"]').tap();
      await dialogo.getByRole('button', { name: 'Cerrar detalles' }).tap();
      await expect(dialogo).toHaveJSProperty('open', false);
      await expect.poll(() => pagina.evaluate(() => window.__cierres), 'llega el único cierre esperado de la preparación').toEqual(['preparacion']);
      await pagina.evaluate(() => { window.__fase = 'anadido'; });
      await vigilarSolapes(pagina);
      const rapido = pagina.locator('.tarjeta-rapido').first();
      await rapido.scrollIntoViewIfNeeded();
      await rapido.tap();
      const ventana = await ventanaLista(pagina);
      expect(await abiertos(pagina)).toEqual(['confirmacion-carrito']);
      expect(await pagina.evaluate(() => window.__cierres.filter((fase) => fase === 'anadido').length), 'no se cerró ninguna ficha').toBe(0);
      expect(await pagina.evaluate(() => window.__cierres), 'solo existió el cierre esperado de la preparación').toEqual(['preparacion']);
      expect(await solapes(pagina)).toEqual([]);
      await pagina.keyboard.press('Escape');
      await expect(ventana).toHaveJSProperty('open', false);
      await expect(rapido).toBeFocused();
      expect(await lineas(pagina)).toHaveLength(1);
    }, { reducido: true });
  });
});
