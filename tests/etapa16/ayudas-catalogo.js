/* Etapa 16 · Utilidades de las pruebas del editor del catálogo. SOLO LOCAL.
 *
 * Reutilizan las de 15A/15B (entorno local, clave de servicio LOCAL, usuarios ficticios) y
 * añaden Storage y fotos de prueba. Todo lo que crean lleva la marca «Marca Dieciséis» y se
 * borra al terminar, también los archivos de Storage. entorno() se niega a seguir si la API
 * no está en 127.0.0.1, así que nada de esto puede escribir en el proyecto remoto.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { entorno, servicio, borrarCatalogo } from '../etapa15/ayudas-panel.js';

export * from '../etapa15/ayudas-panel.js';

// Etapa 16.2: marca, modelo, categoría y color se guardan en MAYÚSCULAS (el servidor normaliza).
export const MARCA = 'MARCA DIECISÉIS';
export const BUCKET = 'fotos-catalogo';
export const CAPTURAS = path.join(os.tmpdir(), 'gama-talla-16-capturas');
export const FOTOS = path.join(os.tmpdir(), 'gama-talla-16-fotos');

// Storage con la clave de servicio LOCAL (solo mantenimiento y comprobaciones de las pruebas).
async function storage(metodo, ruta, cuerpo) {
  const e = entorno();
  const r = await fetch(`${e.api}/storage/v1${ruta}`, {
    method: metodo,
    headers: { apikey: e.servicio, Authorization: `Bearer ${e.servicio}`, 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  });
  const texto = await r.text();
  let datos = null;
  try { datos = JSON.parse(texto); } catch { datos = texto; }
  if (!r.ok) throw new Error(`storage ${metodo} ${ruta} -> ${r.status} ${String(datos?.message || '').slice(0, 120)}`);
  return datos;
}

// Todos los objetos bajo productos/<producto>/ (dos niveles: color y archivo).
export async function objetosDe(productoId) {
  const carpeta = `productos/${productoId}`;
  const colores = await storage('POST', `/object/list/${BUCKET}`, { prefix: `${carpeta}/`, limit: 100 });
  const objetos = [];
  for (const c of colores) {
    const archivos = await storage('POST', `/object/list/${BUCKET}`, { prefix: `${carpeta}/${c.name}/`, limit: 1000 });
    for (const a of archivos) if (a.id) objetos.push({ nombre: `${carpeta}/${c.name}/${a.name}`, bytes: a.metadata?.size, tipo: a.metadata?.mimetype });
  }
  return objetos;
}

export async function borrarObjetos(nombres) {
  if (nombres.length) await storage('DELETE', `/object/${BUCKET}`, { prefixes: nombres });
}

export const productosDePrueba = () =>
  servicio('GET', `/rest/v1/productos?select=id,nombre,codigo_interno,version,activo,retirado_en,variantes(id,codigo_variante,color,precio,precio_anterior,activa,fotos(ruta,orden))&marca=eq.${encodeURIComponent(MARCA)}&order=creado_en`);

export const tallasDe = (varianteIds) =>
  servicio('GET', `/rest/v1/tallas?select=id,variante_id,talla,estado,activa,vigencia_desde,vence_en,origen&variante_id=in.(${varianteIds.join(',')})`);

// Retira todo lo de estas pruebas: archivos de Storage y filas (con service_role).
export async function limpiarCatalogo16() {
  const productos = await servicio('GET', `/rest/v1/productos?select=id,variantes(id)&marca=eq.${encodeURIComponent(MARCA)}`);
  for (const p of productos) await borrarObjetos((await objetosDe(p.id)).map((o) => o.nombre));
  if (productos.length) await borrarCatalogo({ productos, variantes: productos.flatMap((p) => p.variantes) });
  // Archivos huérfanos de una ejecución interrumpida (subidos y nunca guardados): carpetas de
  // productos que ya no existen. Solo en el stack local, que entorno() garantiza.
  const carpetas = await storage('POST', `/object/list/${BUCKET}`, { prefix: 'productos/', limit: 1000 });
  const existentes = new Set((await servicio('GET', '/rest/v1/productos?select=id')).map((p) => p.id));
  let huerfanos = 0;
  for (const c of carpetas) {
    if (!/^[0-9a-f-]{36}$/.test(c.name) || existentes.has(c.name)) continue;
    const objetos = await objetosDe(c.name);
    huerfanos += objetos.length;
    await borrarObjetos(objetos.map((o) => o.nombre));
  }
  if (huerfanos) console.log(`Archivos huérfanos de pruebas anteriores retirados del Storage local: ${huerfanos}.`);
  return productos.length;
}

/* Fotos FICTICIAS generadas con Chromium (que sabe codificar WebP), una sola vez, en la
   carpeta temporal. Patrones con ruido para que pesen como fotos de verdad. */
export async function prepararFotos() {
  fs.mkdirSync(FOTOS, { recursive: true });
  const archivos = {
    grande: path.join(FOTOS, 'grande-2400x1800.jpg'),
    adecuada: path.join(FOTOS, 'adecuada-1200x900.webp'),
    otra: path.join(FOTOS, 'otra-1000x1000.webp'),
    png: path.join(FOTOS, 'producto-1400x1000.png'),
    diminuta: path.join(FOTOS, 'diminuta-300x200.png'),
    falsa: path.join(FOTOS, 'falsa.webp'),
    danada: path.join(FOTOS, 'danada.jpg')
  };
  if (Object.values(archivos).every((f) => fs.existsSync(f))) return archivos;
  const navegador = await chromium.launch();
  try {
    const pagina = await navegador.newPage();
    const generar = (ancho, alto, tipo, calidad, tono) => pagina.evaluate(async ([w, h, t, q, c]) => {
      const lienzo = document.createElement('canvas');
      lienzo.width = w; lienzo.height = h;
      const x = lienzo.getContext('2d');
      const g = x.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, `hsl(${c} 70% 55%)`); g.addColorStop(1, `hsl(${(c + 140) % 360} 60% 35%)`);
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      const ruido = x.getImageData(0, 0, w, h);
      let semilla = 7;
      for (let i = 0; i < ruido.data.length; i += 4) {
        semilla = (semilla * 1103515245 + 12345) & 0x7fffffff;
        const d = (semilla % 60) - 30;
        ruido.data[i] += d; ruido.data[i + 1] += d; ruido.data[i + 2] += d;
      }
      x.putImageData(ruido, 0, 0);
      x.fillStyle = '#fff'; x.font = `bold ${Math.round(h / 6)}px sans-serif`; x.fillText('G&T PRUEBA', w * 0.08, h * 0.55);
      const blob = await new Promise((r) => lienzo.toBlob(r, t, q));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }, [ancho, alto, tipo, calidad, tono]);
    fs.writeFileSync(archivos.grande, Buffer.from(await generar(2400, 1800, 'image/jpeg', 0.95, 210)));
    fs.writeFileSync(archivos.adecuada, Buffer.from(await generar(1200, 900, 'image/webp', 0.5, 20)));
    fs.writeFileSync(archivos.otra, Buffer.from(await generar(1000, 1000, 'image/webp', 0.5, 120)));
    fs.writeFileSync(archivos.png, Buffer.from(await generar(1400, 1000, 'image/png', 1, 300)));
    fs.writeFileSync(archivos.diminuta, Buffer.from(await generar(300, 200, 'image/png', 1, 60)));
    fs.writeFileSync(archivos.falsa, 'esto es texto, no una imagen WebP\n');
    fs.writeFileSync(archivos.danada, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(4000, 7)]));
  } finally {
    await navegador.close();
  }
  return archivos;
}

// Desbordamiento horizontal y controles táctiles pequeños DENTRO del editor. Las entradas de
// archivo y las casillas se pulsan por su etiqueta, que es el área táctil real.
export async function revisarEditor(page) {
  return page.evaluate(() => {
    const ancho = document.documentElement.clientWidth;
    const editor = document.querySelector('#editor');
    const desborde = Math.max(0, editor.scrollWidth - editor.clientWidth) + Math.max(0, document.documentElement.scrollWidth - ancho);
    const controles = [...editor.querySelectorAll('button, a[href], input, select, textarea, label.boton, label.casilla')]
      .filter((n) => n.offsetParent !== null && !n.closest('[hidden]') && !n.classList.contains('solo-lectores') && !['checkbox', 'radio'].includes(n.type));
    const pequenos = controles
      .map((n) => ({ n, r: n.getBoundingClientRect() }))
      .filter(({ r }) => r.height < 40 || r.width < 40)
      .map(({ n, r }) => `${n.tagName.toLowerCase()}.${n.className}(${Math.round(r.width)}x${Math.round(r.height)})`);
    const fuera = [...editor.querySelectorAll('*')]
      .filter((n) => n.offsetParent !== null && !n.classList.contains('solo-lectores'))
      .map((n) => n.getBoundingClientRect())
      .filter((r) => r.width > 0 && (r.right > ancho + 1 || r.left < -1)).length;
    return { desborde, pequenos, fuera };
  });
}
