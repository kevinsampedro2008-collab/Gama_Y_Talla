// Capturas de revisión visual (antes y después). No hacen aserciones de diseño: se revisan a ojo.
// Uso: CAPTURAS_DIR=<carpeta> CAPTURAS_ETIQUETA=antes npx playwright test tests/etapa9/capturas.spec.js
import { test } from '@playwright/test';
import { VISTAS, URL_REAL, URL_PRUEBA, nuevaPagina, irATienda, abrirDetalle, detalleQuieto, mostrarTodo, rutaCaptura } from './ayudas.js';

const CASOS = [
  { id: 'samba', url: URL_REAL, nombre: 'SAMBA', talla: '40' },
  { id: 'jordan', url: URL_REAL, nombre: 'Air Jordan 1 Retro High OG', talla: null },
  { id: '550', url: URL_REAL, nombre: '550', talla: null },
  { id: 'tres-colores', url: URL_PRUEBA, nombre: 'tres colores', talla: '40' },
];

// Respuesta visual al pulsar con pantalla táctil emulada: se captura con el dedo aún abajo.
test('pulsar «Ver detalles» · celular', async ({ browser, browserName }) => {
  const { contexto, pagina } = await nuevaPagina(browser, browserName, VISTAS[1]);
  await irATienda(pagina);
  const boton = pagina.locator('.tarjeta').nth(1).locator('.tarjeta-enlace');
  await boton.scrollIntoViewIfNeeded();
  await pagina.evaluate(() => window.scrollBy({ top: 120, behavior: 'instant' }));
  const caja = await boton.locator('.tarjeta-enlace-caja').boundingBox();
  await pagina.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await pagina.mouse.down();
  await pagina.waitForTimeout(220);
  await pagina.screenshot({ path: rutaCaptura('tarjetas-390-pulsando', browserName) });
  await pagina.mouse.move(2, 2);
  await pagina.mouse.up();
  await contexto.close();
});

// Producto agotado del catálogo real: tarjeta y ficha.
for (const vista of [VISTAS[1], VISTAS[4]]) {
  test(`agotado · ${vista.nombre}px`, async ({ browser, browserName }) => {
    const { contexto, pagina } = await nuevaPagina(browser, browserName, vista);
    await irATienda(pagina);
    await mostrarTodo(pagina);
    const tarjeta = pagina.locator('.tarjeta-agotada').first();
    await tarjeta.evaluate((t) => window.scrollTo({ top: t.getBoundingClientRect().top + scrollY - 88, behavior: 'instant' }));
    await pagina.waitForTimeout(350);
    await pagina.screenshot({ path: rutaCaptura(`agotado-${vista.nombre}-tarjeta`, browserName) });
    await tarjeta.getByRole('button', { name: /^Ver detalles de/ }).click();
    const dialogo = await detalleQuieto(pagina);
    await dialogo.locator('.detalle-acciones').evaluate((n) => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await pagina.waitForTimeout(300);
    await pagina.screenshot({ path: rutaCaptura(`agotado-${vista.nombre}-detalle`, browserName) });
    await contexto.close();
  });
}

// Añadir sin talla: la etiqueta pide la talla en rojo.
test('añadir sin talla · celular', async ({ browser, browserName }) => {
  const { contexto, pagina } = await nuevaPagina(browser, browserName, VISTAS[1]);
  await irATienda(pagina);
  const dialogo = await abrirDetalle(pagina, 'SAMBA');
  // Por coordenadas, como un dedo (el clic de Playwright desplaza antes la caja en WebKit).
  const zona = await dialogo.locator('.detalle-barra [data-accion="agregar"]').boundingBox();
  await pagina.touchscreen.tap(zona.x + zona.width / 2, zona.y + zona.height / 2);
  await pagina.waitForTimeout(900);
  await pagina.screenshot({ path: rutaCaptura('sin-talla-390', browserName) });
  await contexto.close();
});

for (const vista of VISTAS) {
  test(`tarjetas · ${vista.nombre}px`, async ({ browser, browserName }) => {
    const { contexto, pagina } = await nuevaPagina(browser, browserName, vista);
    await irATienda(pagina);
    const tarjeta = pagina.locator('.tarjeta').first();
    await pagina.evaluate(() => {
      const t = document.querySelector('.tarjeta');
      window.scrollTo({ top: t.getBoundingClientRect().top + scrollY - 88, behavior: 'instant' });
    });
    await tarjeta.locator('img').first().waitFor();
    await pagina.waitForTimeout(350);
    await pagina.screenshot({ path: rutaCaptura(`tarjetas-${vista.nombre}-reposo`, browserName) });

    if (!vista.tactil) {
      await pagina.locator('.tarjeta').nth(1).locator('.tarjeta-enlace').hover();
      await pagina.waitForTimeout(450);
      await pagina.screenshot({ path: rutaCaptura(`tarjetas-${vista.nombre}-hover`, browserName) });
      await pagina.mouse.move(2, 2);
    }

    await pagina.locator('.tarjeta').nth(1).locator('.tarjeta-enlace').focus();
    await pagina.keyboard.press('Tab');
    await pagina.waitForTimeout(350);
    await pagina.screenshot({ path: rutaCaptura(`tarjetas-${vista.nombre}-foco`, browserName) });
    await contexto.close();
  });

  for (const caso of CASOS) {
    test(`detalle ${caso.id} · ${vista.nombre}px`, async ({ browser, browserName }) => {
      const { contexto, pagina } = await nuevaPagina(browser, browserName, vista);
      await irATienda(pagina, caso.url);
      const dialogo = await abrirDetalle(pagina, caso.nombre);
      await pagina.screenshot({ path: rutaCaptura(`detalle-${caso.id}-${vista.nombre}-1-apertura`, browserName) });
      const caja = dialogo.locator('.modal-caja');
      if (caso.talla) {
        await dialogo.locator(`.talla[data-talla="${caso.talla}"]`).click();
        await pagina.waitForTimeout(300);
      }
      await dialogo.locator('.detalle-acciones').evaluate((n) => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await pagina.waitForTimeout(350);
      await pagina.screenshot({ path: rutaCaptura(`detalle-${caso.id}-${vista.nombre}-2-compra`, browserName) });
      if (vista.tactil && vista.ancho < 960) {
        await caja.evaluate((n) => n.scrollTo({ top: 0, behavior: 'instant' }));
        await pagina.waitForTimeout(450);
        await pagina.screenshot({ path: rutaCaptura(`detalle-${caso.id}-${vista.nombre}-3-barra`, browserName) });
      }
      await contexto.close();
    });
  }
}
