// Etapa 14 · Capturas de revisión: los tres estados, el carrito mixto y el modo consulta.
// Uso: CAPTURAS_DIR=<carpeta> CAPTURAS_ETIQUETA=despues npx playwright test tests/etapa14/capturas.spec.js
import { test } from '@playwright/test';
import { VISTAS, rutaCaptura, abrirDetalle, mostrarTodo } from '../etapa9/ayudas.js';
import { CATALOGO_MIGRADO, conEstados, tiendaConSupabase, abrirCarritoDesdeCabecera } from './ayudas-etapa14.js';

const SAMBA = 'SAMBA';
const mixto = conEstados(CATALOGO_MIGRADO, SAMBA, { 40: 'DISPONIBLE', 42: 'AGOTADO' });
const lineaV3 = (catalogo, nombre, talla, cantidad = 1) => {
  const p = catalogo.find((x) => x.nombre === nombre);
  return { producto: p.id, variante: p.variantes[0].id, talla, cantidad, precio: p.variantes[0].precio };
};

for (const vista of VISTAS) {
  test(`catalogo-por-revisar · ${vista.nombre}`, async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
      await mostrarTodo(pagina);
      await pagina.waitForTimeout(500);
      await pagina.screenshot({ path: rutaCaptura(`catalogo-por-revisar-${vista.nombre}`, browserName) });
    }, { reducido: true });
  });

  test(`ficha-tres-estados · ${vista.nombre}`, async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, SAMBA);
      await dialogo.locator('.talla[data-talla="41"]').click();
      await dialogo.locator('.tallas').evaluate((n) => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await pagina.waitForTimeout(400);
      await pagina.screenshot({ path: rutaCaptura(`ficha-tres-estados-${vista.nombre}`, browserName) });
    }, { respuesta: mixto, reducido: true });
  });

  test(`carrito-mixto · ${vista.nombre}`, async ({ browser, browserName }) => {
    const carrito = { version: 3, pendientes: [], lineas: [lineaV3(mixto, SAMBA, '40', 2), lineaV3(mixto, SAMBA, '41', 1)] };
    await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
      await abrirCarritoDesdeCabecera(pagina);
      await pagina.waitForTimeout(500);
      await pagina.screenshot({ path: rutaCaptura(`carrito-mixto-${vista.nombre}`, browserName) });
    }, { respuesta: mixto, carrito, reducido: true });
  });

  test(`modo-consulta · ${vista.nombre}`, async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
      await pagina.waitForTimeout(500);
      await pagina.screenshot({ path: rutaCaptura(`modo-consulta-${vista.nombre}`, browserName) });
    }, { respuesta: { fallo: 500 }, reducido: true });
  });
}
