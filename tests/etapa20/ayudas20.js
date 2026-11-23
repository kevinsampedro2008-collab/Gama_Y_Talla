/* Etapa 20 · Utilidades de las pruebas del importador: pegar varias publicaciones, perfiles de proveedor
 * y borradores locales. SOLO LOCAL.
 *
 * Reutilizan las de las etapas 15–16: el Supabase LOCAL (entorno() se niega si la API no está en
 * 127.0.0.1), usuarios @gamaytalla.test y datos FICTICIOS que se borran al terminar. Se ejecutan contra
 * el entorno aislado (`node scripts/entorno-local.mjs`, puerto 8770): SITIO=http://127.0.0.1:8770. La
 * configuración del panel la inyecta configurarPanel; los config.js reales no se usan.
 *
 * Todos los productos de estas pruebas tienen un modelo que termina en « P20».
 */
import { expect, chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { servicio, borrarCatalogo, configurarPanel, ingresar, objetosDe, borrarObjetos } from '../etapa16/ayudas-catalogo.js';

export * from '../etapa16/ayudas-catalogo.js';

export const CAPTURAS20 = path.join(os.tmpdir(), 'gama-talla-20-capturas');
export const FOTOS20 = path.join(os.tmpdir(), 'gama-talla-20-fotos');
export const MENSAJE = 'Pega aquí el mensaje de WhatsApp';
export const PEGADO = 'Pega aquí los mensajes de WhatsApp';
export const TELEFONO = '+57 3000000000';

// Los cuatro mensajes de referencia (los de las etapas 18 y 19), con modelos ficticios « P20».
export const REEBOK = `REEBOK PRINCENSA P20 💰$105.000 DAMA 👸 Y CABALLERO 🤴 TODAS LAS TALLAS🔥\n\nDinos y te ayudamos sin falta\n👉 ${TELEFONO}`;
export const NIKE = `NIKE 7 CAMARAS P20⚠️NUMERACION DAMA💥$125.000\n📦📦DISPONIBLE $115.000\n\n🤝 Aparta la tuya pues 👉🏼 ${TELEFONO}`;
export const ON = `🌟ON CLOUD REMIX P20🌟\n💸$115.000💸\nEUR 36 AL 44\n\n🛒 Mándanos tu pedido: ${TELEFONO}`;
export const NB = `RECARGA 🔥🔥\nNew Balance 603 P20 🇺🇸\nHombre $115.000 🔥\n40 al 44 Euro ✅\nTe atiendo por aquí hoy ${TELEFONO}`;

// Retira los productos y archivos de estas pruebas (modelo terminado en « P20»).
export async function limpiar20() {
  const productos = await servicio('GET', `/rest/v1/productos?select=id,nombre,variantes(id)&nombre=like.*${encodeURIComponent(' P20')}`);
  for (const p of productos) await borrarObjetos((await objetosDe(p.id)).map((o) => o.nombre));
  if (productos.length) await borrarCatalogo({ productos, variantes: productos.flatMap((p) => p.variantes) });
  return productos.length;
}
export const productos20 = () => servicio('GET', `/rest/v1/productos?select=id,nombre,marca,publico,categoria,activo,ultima_operacion,variantes(id,color,precio,fotos(ruta,orden),tallas(talla,estado))&nombre=like.*${encodeURIComponent(' P20')}&order=creado_en`);

/* Fotos WebP FICTICIAS de 800 px (< 300 KB): el panel las usa tal cual, sin recomprimir, así que lo que
   se guarda es idéntico byte a byte. Se generan una vez en la carpeta temporal. */
export async function prepararFotos20(n = 4) {
  fs.mkdirSync(FOTOS20, { recursive: true });
  const rutas = Array.from({ length: n }, (_, i) => path.join(FOTOS20, `p20-${String(i + 1).padStart(2, '0')}.webp`));
  if (rutas.every((r) => fs.existsSync(r))) return rutas;
  const navegador = await chromium.launch();
  try {
    const pagina = await navegador.newPage();
    for (const [i, ruta] of rutas.entries()) {
      if (fs.existsSync(ruta)) continue;
      const bytes = await pagina.evaluate(async ([tono, texto]) => {
        const lienzo = document.createElement('canvas');
        lienzo.width = 800; lienzo.height = 600;
        const x = lienzo.getContext('2d');
        x.fillStyle = `hsl(${tono} 65% 55%)`; x.fillRect(0, 0, 800, 600);
        x.fillStyle = '#fff'; x.font = 'bold 200px sans-serif'; x.fillText(texto, 220, 380);
        const blob = await new Promise((r) => lienzo.toBlob(r, 'image/webp', 0.8));
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
      }, [(i * 37) % 360, String(i + 1)]);
      fs.writeFileSync(ruta, Buffer.from(bytes));
    }
  } finally {
    await navegador.close();
  }
  return rutas;
}

/* WebKit: la captura de Playwright inserta un <style> que la CSP del panel rechaza (ver etapas 18–19):
   solo se descarta UNA aparición, en WebKit, emitida durante la captura. */
const AVISO_CAPTURA_WEBKIT = "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.";
export async function capturar(page, problemas, browserName, nombre) {
  fs.mkdirSync(CAPTURAS20, { recursive: true });
  const desde = problemas.length;
  await page.screenshot({ path: path.join(CAPTURAS20, nombre) });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  if (browserName !== 'webkit') return;
  const i = problemas.indexOf(AVISO_CAPTURA_WEBKIT, desde);
  if (i >= 0) problemas.splice(i, 1);
}
// WebKit informa como excepción la petición que una recarga corta: solo ESE aviso y solo durante la recarga.
export function filtrarRecarga(problemas, desde, browserName) {
  if (browserName !== 'webkit') return;
  for (let i = problemas.length - 1; i >= desde; i -= 1) {
    if (/^EXCEPCIÓN: .*127\.0\.0\.1:54321\/.* due to access control checks\.$/.test(problemas[i])) problemas.splice(i, 1);
  }
}

export function vigilar(page) {
  const problemas = [];
  page.on('pageerror', (e) => problemas.push(`EXCEPCIÓN: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problemas.push(m.text()); });
  return problemas;
}
export const importador = (page) => page.locator('#importador');
export const ficha = (page, n) => importador(page).locator('.importador-ficha').nth(n);
export const color = (f, n) => f.locator('.importador-color').nth(n);
export const fichas = (page) => importador(page).locator('.importador-ficha');
export const radioPublico = (f, nombre) => f.getByRole('group', { name: /^Público en la tienda/ }).getByRole('radio', { name: nombre, exact: true });
export const estadoLocal = (page) => importador(page).locator('#importador-local-estado');

export async function entrarAlPanel(page, usuario) {
  const problemas = vigilar(page);
  await configurarPanel(page);
  await page.goto(`${process.env.SITIO || 'http://127.0.0.1:8770'}/admin/`);
  await ingresar(page, usuario);
  await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
  await expect(page.locator('#tablero')).not.toHaveAttribute('aria-busy', 'true');
  return problemas;
}
export async function abrirImportador(page) {
  await page.getByRole('button', { name: 'Importar desde WhatsApp' }).click();
  await expect(importador(page)).toBeVisible();
}
export async function recargar(page, problemas, browserName) {
  const desde = problemas.length;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
  await expect(page.locator('#tablero')).not.toHaveAttribute('aria-busy', 'true');
  filtrarRecarga(problemas, desde, browserName);
}
// Espera a que el borrador local esté al día («Guardado en este navegador»).
export async function esperarGuardadoLocal(page) {
  await expect(estadoLocal(page)).toContainText('Guardado en este navegador', { timeout: 15000 });
}
// Pega varios mensajes juntos, revisa la separación y devuelve la sección.
export async function pegarVarias(page, textoPegado) {
  await importador(page).getByRole('button', { name: 'Pegar varias publicaciones' }).click();
  const s = importador(page).locator('#imp-pegado');
  await s.getByLabel(PEGADO).fill(textoPegado);
  await s.getByRole('button', { name: 'Revisar la separación' }).click();
  await expect(s.locator('#imp-pegado-resumen')).toBeVisible();
  return s;
}
