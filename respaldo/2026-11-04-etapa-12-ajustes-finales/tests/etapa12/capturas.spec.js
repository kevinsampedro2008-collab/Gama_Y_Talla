// Etapa 12 · Capturas de revisión: primero celular; las demás vistas se generan con el mismo archivo.
// Uso: CAPTURAS_DIR=<carpeta> CAPTURAS_ETIQUETA=despues npx playwright test tests/etapa12/capturas.spec.js
import { test } from '@playwright/test';
import { VISTAS, URL_PRUEBA, nuevaPagina, irATienda, rutaCaptura } from '../etapa9/ayudas.js';
import { anadirDesdeFicha, ventanaDe, volverAlCatalogo } from './ayudas-etapa12.js';

const CORTA = { nombre: '360x640', ancho: 360, alto: 640, tactil: true };

const CASOS = [
  { id: 'descuento', pares: [{ nombre: 'SAMBA', talla: '40' }] },
  { id: 'nombre-largo', pares: [{ nombre: 'SAMBA', talla: '40' }, { nombre: 'Air Jordan 1 Retro High OG', talla: '43', cantidad: 2 }] },
  { id: 'foto-vertical', pares: [{ nombre: '550', talla: '40' }] },
];

for (const vista of [...VISTAS, CORTA]) {
  for (const caso of CASOS) {
    test(`${caso.id} · ${vista.nombre}`, async ({ browser, browserName }) => {
      const { contexto, pagina } = await nuevaPagina(browser, browserName, vista);
      await irATienda(pagina);
      for (const [indice, par] of caso.pares.entries()) {
        await anadirDesdeFicha(pagina, par.nombre, par);
        if (indice < caso.pares.length - 1) await volverAlCatalogo(pagina);
      }
      await pagina.waitForTimeout(650);
      await pagina.screenshot({ path: rutaCaptura(`${caso.id}-${vista.nombre}`, browserName) });
      await contexto.close();
    });
  }

  test(`carrito-tras-ver · ${vista.nombre}`, async ({ browser, browserName }) => {
    const { contexto, pagina } = await nuevaPagina(browser, browserName, vista);
    await irATienda(pagina);
    await anadirDesdeFicha(pagina, 'SAMBA', { talla: '40' });
    await ventanaDe(pagina).getByRole('button', { name: 'Ver carrito' }).click();
    await pagina.waitForTimeout(650);
    await pagina.screenshot({ path: rutaCaptura(`carrito-tras-ver-${vista.nombre}`, browserName) });
    await contexto.close();
  });
}

test('sin descuento · 390', async ({ browser, browserName }) => {
  const { contexto, pagina } = await nuevaPagina(browser, browserName, VISTAS[1]);
  await irATienda(pagina, URL_PRUEBA);
  await anadirDesdeFicha(pagina, 'tres colores', { talla: '40' });
  await pagina.waitForTimeout(650);
  await pagina.screenshot({ path: rutaCaptura('sin-descuento-390', browserName) });
  await contexto.close();
});
