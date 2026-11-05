// Etapa 10 · Capturas de revisión (antes y después): solo para mirar, sin aserciones de diseño.
// Uso: CAPTURAS_DIR=<carpeta> CAPTURAS_ETIQUETA=antes npx playwright test tests/etapa10/capturas.spec.js
import { test } from '@playwright/test';
import { VISTAS, URL_REAL, URL_PRUEBA, nuevaPagina, irATienda, abrirDetalle, rutaCaptura } from '../etapa9/ayudas.js';
import { VENTANAS_PORTATIL } from './ayudas-etapa10.js';

const CASOS = [
  { id: 'cuadrada-samba', url: URL_REAL, nombre: 'SAMBA' },
  { id: 'cuadrada-nombre-largo', url: URL_REAL, nombre: 'Air Jordan 1 Retro High OG' },
  { id: 'vertical-barras-negras', url: URL_REAL, nombre: 'Samba OG' },
  { id: 'vertical-nombre-corto', url: URL_REAL, nombre: '550' },
  { id: 'varias-fotos', url: URL_PRUEBA, nombre: 'tres colores' },
];

for (const vista of [...VISTAS, ...VENTANAS_PORTATIL]) {
  for (const caso of CASOS) {
    test(`${caso.id} · ${vista.nombre}px`, async ({ browser, browserName }) => {
      const { contexto, pagina } = await nuevaPagina(browser, browserName, vista);
      await irATienda(pagina, caso.url);
      await abrirDetalle(pagina, caso.nombre);
      await pagina.screenshot({ path: rutaCaptura(`${caso.id}-${vista.nombre}`, browserName) });
      await contexto.close();
    });
  }
}
