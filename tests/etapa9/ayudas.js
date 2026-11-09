// Ayudas compartidas por las pruebas de Playwright de la etapa 9 (Gama & Talla).
// Requieren el servidor habitual: python -m http.server 8765 --bind 127.0.0.1
import { expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// BASE_URL permite usar un servidor con más cola de conexiones: `http.server` solo admite 5 en
// espera y, con varios procesos en paralelo, rechaza conexiones (con él, usar --workers=1).
export const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
export const URL_REAL = `${BASE}/?intro=no`;
export const URL_PRUEBA = `${BASE}/?datos-prueba&intro=no`;

// Resoluciones de referencia del proyecto. «tactil»: se emula pantalla táctil.
export const VISTAS = [
  { nombre: '360', ancho: 360, alto: 780, tactil: true },
  { nombre: '390', ancho: 390, alto: 844, tactil: true },
  { nombre: '768', ancho: 768, alto: 1024, tactil: true },
  { nombre: '1024', ancho: 1024, alto: 768, tactil: false },
  { nombre: '1440', ancho: 1440, alto: 900, tactil: false },
];
export const CELULAR = VISTAS[1];
export const ESCRITORIO = VISTAS[4];

// Firefox no admite isMobile en Playwright: allí se emula solo el tacto y el tamaño.
export async function nuevaPagina(browser, browserName, vista, opciones = {}) {
  const contexto = await browser.newContext({
    viewport: { width: vista.ancho, height: vista.alto },
    hasTouch: vista.tactil,
    isMobile: vista.tactil && browserName !== 'firefox',
    deviceScaleFactor: vista.tactil ? 2 : 1,
    reducedMotion: opciones.reducido ? 'reduce' : 'no-preference',
    locale: 'es-CO',
  });
  const pagina = await contexto.newPage();
  // Etapa 16: la tienda carga config.js (no versionado). En las pruebas se sirve vacío, que
  // equivale a no declarar configuración, como antes de existir el archivo; las pruebas que
  // necesitan una la inyectan con addInitScript (window.GAMA_TALLA_CONFIG).
  await sinConfiguracionDeTienda(contexto);
  return { contexto, pagina, problemas: vigilar(pagina) };
}

export async function sinConfiguracionDeTienda(contexto) {
  await contexto.route(`${BASE}/config.js`, (ruta) => ruta.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8', body: '/* sin configuración declarada en esta prueba */\n'
  }));
}

// Abre la tienda en la vista indicada, ejecuta la prueba y exige que no haya errores de consola ni de red.
export async function enTienda({ browser, browserName }, vista, cuerpo, { url = URL_REAL, reducido = false } = {}) {
  const { contexto, pagina, problemas } = await nuevaPagina(browser, browserName, vista, { reducido });
  try {
    await pagina.addInitScript(() => {
      // WhatsApp no se abre de verdad: se registra el enlace para comprobar su contenido.
      window.__abiertas = [];
      window.open = (enlace) => { window.__abiertas.push(String(enlace)); return {}; };
    });
    await irATienda(pagina, url);
    await cuerpo(pagina);
    expect(problemas, 'errores de consola o de red').toEqual([]);
  } finally {
    await contexto.close();
  }
}

/* Etapa 16.1: un pedido por WhatsApp exige datos de envío (solo en la memoria de la página).
   Datos FICTICIOS para las pruebas y ayudas para completarlos y enviar. */
export const DATOS_ENVIO = Object.freeze({ nombre: 'Camila Rodríguez', telefono: '300 123 4567', ciudad: 'Barranquilla', direccion: 'Calle 84 # 51B-20, apto 302', nota: '' });
export const lineasDatosEnvio = (d = DATOS_ENVIO) => [
  '────────────────', '*Mis datos:*', `Nombre: ${d.nombre}`, `Teléfono: ${d.telefono}`, `Ciudad: ${d.ciudad}`, `Dirección: ${d.direccion}`, ...(d.nota ? [`Nota: ${d.nota}`] : []),
];

// Con la ventana de datos de envío abierta: rellena y guarda.
export async function guardarDatosEnvio(pagina, datos = DATOS_ENVIO) {
  await expect(pagina.locator('#datos-envio')).toHaveJSProperty('open', true);
  for (const [campo, valor] of Object.entries(datos)) await pagina.locator(`#envio-${campo}`).fill(valor);
  await pagina.locator('#envio-guardar').click();
}

// Con el carrito abierto: completa los datos si faltan y pulsa «Enviar pedido». Devuelve la URL abierta.
export async function enviarDesdeCarrito(pagina, datos = DATOS_ENVIO) {
  if ((await pagina.locator('#carrito-enviar').getAttribute('aria-disabled')) === 'true') {
    await pagina.locator('#carrito-datos').click();
    await guardarDatosEnvio(pagina, datos);
    await expect(pagina.locator('#datos-envio')).toHaveJSProperty('open', false);
  }
  const antes = await pagina.evaluate(() => window.__abiertas.length);
  const enviar = pagina.locator('#carrito-enviar');
  await enviar.scrollIntoViewIfNeeded();
  await enviar.click();
  await expect.poll(() => pagina.evaluate(() => window.__abiertas.length)).toBe(antes + 1);
  return pagina.evaluate(() => window.__abiertas.at(-1));
}

// Con la ficha abierta y una talla disponible elegida: «Pedir este par», datos si faltan y envío explícito.
export async function pedirParDesdeFicha(pagina, dialogo, { datos = DATOS_ENVIO, tocar = false } = {}) {
  const pedir = dialogo.getByRole('button', { name: 'Pedir este par por WhatsApp' });
  await pedir.scrollIntoViewIfNeeded();
  if (tocar) await pedir.tap(); else await pedir.click();
  await expect(pagina.locator('#datos-envio')).toHaveJSProperty('open', true);
  if (await pagina.locator('#envio-formulario').isVisible()) await guardarDatosEnvio(pagina, datos);
  await expect(pagina.locator('#envio-revision')).toBeVisible();
  const antes = await pagina.evaluate(() => window.__abiertas.length);
  await pagina.locator('#envio-enviar').click();
  await expect.poll(() => pagina.evaluate(() => window.__abiertas.length)).toBe(antes + 1);
  return pagina.evaluate(() => window.__abiertas.at(-1));
}

// Proporción de píxeles oscuros que se ven realmente en pantalla dentro de un elemento:
// comprueba el resultado visual, no un atributo. El elemento debe estar en la ventana.
export async function proporcionTinta(pagina, localizador) {
  const caja = await localizador.boundingBox();
  const png = await pagina.screenshot({ clip: caja });
  return pagina.evaluate(async (datos) => {
    const imagen = new Image();
    imagen.src = `data:image/png;base64,${datos}`;
    await imagen.decode();
    const lienzo = document.createElement('canvas');
    lienzo.width = imagen.width;
    lienzo.height = imagen.height;
    const dibujo = lienzo.getContext('2d');
    dibujo.drawImage(imagen, 0, 0);
    const puntos = dibujo.getImageData(0, 0, lienzo.width, lienzo.height).data;
    let oscuros = 0;
    for (let i = 0; i < puntos.length; i += 4) if (puntos[i] < 70 && puntos[i + 1] < 70 && puntos[i + 2] < 70) oscuros += 1;
    return oscuros / (puntos.length / 4);
  }, png.toString('base64'));
}

// Lleva una tarjeta al centro de la ventana sin animación de desplazamiento.
export async function centrarTarjeta(pagina, tarjeta) {
  await tarjeta.evaluate((t) => t.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await pagina.waitForTimeout(120);
}

// Registra errores de consola, excepciones y fallos de red para poder afirmar que no hubo ninguno.
export function vigilar(pagina) {
  const problemas = [];
  pagina.on('pageerror', (e) => problemas.push(`EXCEPCIÓN: ${e.message}`));
  pagina.on('console', (m) => { if (m.type() === 'error') problemas.push(`CONSOLA: ${m.text()}`); });
  pagina.on('response', (r) => { if (r.status() >= 400) problemas.push(`HTTP ${r.status()}: ${r.url()}`); });
  pagina.on('requestfailed', (r) => {
    const motivo = r.failure()?.errorText || '';
    // Abortos propios de la navegación o de cancelar la carga de imágenes: no son fallos de red.
    if (/ERR_ABORTED|NS_BINDING_ABORTED|cancelled|canceled/i.test(motivo)) return;
    problemas.push(`RED: ${r.url()} (${motivo})`);
  });
  return problemas;
}

// `tarjetas: false` (etapa 16): la carga termina en un estado sin catálogo que mostrar.
export async function irATienda(pagina, url = URL_REAL, { tarjetas = true } = {}) {
  await pagina.goto(url, { waitUntil: 'load' });
  // Con varios navegadores en paralelo el servidor local tarda más: se da margen a la carga del catálogo.
  await expect(pagina.locator('#grilla-productos')).toHaveAttribute('aria-busy', 'false', { timeout: 20000 });
  if (tarjetas) await expect(pagina.locator('.tarjeta').first()).toBeVisible();
  else await expect(pagina.locator('.estado-catalogo')).toBeVisible();
  await pagina.evaluate(() => document.fonts.ready);
}

// Muestra todo el catálogo (paginación progresiva) para poder localizar cualquier tarjeta.
export async function mostrarTodo(pagina) {
  // Su nombre accesible cambia («Mostrar 12 productos más»); al final pasa a «Mostrar menos».
  const mas = pagina.getByRole('button', { name: /^Mostrar .*más$/ });
  for (let i = 0; i < 6 && await mas.isVisible().catch(() => false); i++) {
    const antes = await pagina.locator('.tarjeta').count();
    await mas.click();
    await expect.poll(() => pagina.locator('.tarjeta').count()).toBeGreaterThan(antes);
  }
}

export function tarjetaDe(pagina, nombre) {
  return pagina.locator('.tarjeta').filter({ has: pagina.locator('.tarjeta-nombre', { hasText: nombre }) }).first();
}

// La presentación de entrada ya terminó: la ficha está quieta.
export async function detalleQuieto(pagina) {
  const dialogo = pagina.locator('#modal-producto');
  await expect(dialogo).toHaveJSProperty('open', true);
  await expect.poll(() => dialogo.evaluate((d) => d.hasAttribute('data-preparando') || d.hasAttribute('data-entrada')), { timeout: 8000 }).toBe(false);
  await pagina.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming?.().iterations === Infinity));
  return dialogo;
}

export async function abrirDetalle(pagina, nombre) {
  await mostrarTodo(pagina);
  const tarjeta = tarjetaDe(pagina, nombre);
  await tarjeta.scrollIntoViewIfNeeded();
  await tarjeta.getByRole('button', { name: /^Ver detalles de/ }).click();
  return detalleQuieto(pagina);
}

// «Sin talla» lleva a las tallas con un desplazamiento suave. Hay que esperar a que la ficha se
// detenga: un clic en plena animación cae en otro punto (lo mismo le pasaría a un dedo).
export async function fichaQuieta(dialogo) {
  await expect.poll(() => dialogo.locator('.modal-caja').evaluate((c) => new Promise((listo) => {
    const antes = c.scrollTop;
    setTimeout(() => listo(c.scrollTop === antes), 150);
  })), { message: 'la ficha dejó de desplazarse' }).toBe(true);
}

export async function sinDesborde(pagina) {
  const medida = await pagina.evaluate(() => ({ doc: document.documentElement.scrollWidth, cuerpo: document.body.scrollWidth, ventana: window.innerWidth }));
  expect(medida.doc, `documento ${medida.doc} > ventana ${medida.ventana}`).toBeLessThanOrEqual(medida.ventana);
  expect(medida.cuerpo, `cuerpo ${medida.cuerpo} > ventana ${medida.ventana}`).toBeLessThanOrEqual(medida.ventana);
}

// Las capturas se guardan fuera del proyecto si se indica CAPTURAS_DIR (no se acumulan en el repositorio).
export function rutaCaptura(nombre, browserName) {
  const carpeta = process.env.CAPTURAS_DIR || path.join('test-results', 'capturas-etapa9');
  const etiqueta = process.env.CAPTURAS_ETIQUETA || 'despues';
  const destino = path.join(carpeta, etiqueta, browserName);
  fs.mkdirSync(destino, { recursive: true });
  return path.join(destino, `${nombre}.png`);
}

// Contraste WCAG a partir de dos colores CSS sólidos «rgb(...)».
export function contraste(a, b) {
  const lum = (c) => {
    const [r, g, bl] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
