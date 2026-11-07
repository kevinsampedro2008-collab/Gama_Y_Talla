// Etapa 11 · Capturas de revisión del bloque de equivalencias: solo para mirar, sin aserciones de diseño.
// Uso: CAPTURAS_DIR=<carpeta> CAPTURAS_ETIQUETA=despues npx playwright test tests/etapa11/capturas.spec.js
import { test } from '@playwright/test';
import { VISTAS, nuevaPagina, irATienda, abrirDetalle, rutaCaptura } from '../etapa9/ayudas.js';

const CASOS = [
  { id: 'adidas', nombre: 'SAMBA', talla: '40' },
  { id: 'adidas-sin-fila', nombre: 'SAMBA', talla: '41' },
  { id: 'nike', nombre: 'Dunk Low Retro', talla: '42' },
  { id: 'jordan', nombre: 'Air Jordan 1 Retro High OG', talla: '43' },
  { id: 'le-coq-sportif', nombre: 'LCS Retro Classic', talla: '40' },
  { id: 'new-balance', nombre: '550', talla: '40' },
  { id: 'sin-marca', nombre: "Air Force 1 '07", ultimo: true, talla: '40' },
];

for (const vista of VISTAS) {
  for (const caso of CASOS) {
    test(`${caso.id} · ${vista.nombre}px`, async ({ browser, browserName }) => {
      const { contexto, pagina } = await nuevaPagina(browser, browserName, vista);
      await irATienda(pagina);
      let dialogo;
      if (caso.ultimo) {
        // El registro con marca provisional es el único de su marca.
        await pagina.evaluate(() => {
          const provisional = estado.productos.find((p) => /^CAMBIAR/.test(p.marca));
          abrirDetalles(provisional.clave, document.querySelector('.tarjeta-enlace'));
        });
        dialogo = pagina.locator('#modal-producto');
        await pagina.waitForTimeout(1300);
      } else {
        dialogo = await abrirDetalle(pagina, caso.nombre);
      }
      await dialogo.locator(`.talla[data-talla="${caso.talla}"]`).click();
      await dialogo.locator('.equivalencias').evaluate((n) => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await pagina.waitForTimeout(350);
      await pagina.screenshot({ path: rutaCaptura(`${caso.id}-${vista.nombre}`, browserName) });
      await contexto.close();
    });
  }

  // La guía completa, abierta desde la ficha: la marca del producto va primero.
  for (const [id, nombre] of [['guia-completa-lcs', 'LCS Retro Classic'], ['guia-completa-nb', '550']]) {
    test(`${id} · ${vista.nombre}px`, async ({ browser, browserName }) => {
      const { contexto, pagina } = await nuevaPagina(browser, browserName, vista);
      await irATienda(pagina);
      const dialogo = await abrirDetalle(pagina, nombre);
      await dialogo.getByRole('button', { name: 'Guía de tallas' }).click();
      await pagina.waitForTimeout(600);
      await pagina.screenshot({ path: rutaCaptura(`${id}-${vista.nombre}`, browserName) });
      await contexto.close();
    });
  }
}
