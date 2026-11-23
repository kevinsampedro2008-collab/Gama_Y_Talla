/* Etapa 21 · Utilidades de las pruebas de «Importar catálogo PDF». SOLO LOCAL.
 *
 * - Catálogos PDF SINTÉTICOS (generados aquí, sin datos del proveedor): portada con collage, tarjetas en
 *   rejilla 2×2 con su recuadro, foto RGB embebida, descripción en Helvetica y, en el de venta, el precio
 *   en un recuadro bajo la descripción. Misma estructura que los catálogos reales, contenido ficticio.
 * - Los PDF REALES no están en el repositorio: la prueba que los usa (reales.spec.js) solo corre si
 *   GT_PDF_REALES apunta a la carpeta donde están, y no guarda nada de ellos.
 * - Importador contra el Supabase LOCAL y el entorno aislado (SITIO=http://127.0.0.1:8770); los modelos
 *   ficticios terminan en « P21». Reutiliza las utilidades de la etapa 20.
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect } from '@playwright/test';
import { servicio, borrarCatalogo, objetosDe, borrarObjetos, importador } from '../etapa20/ayudas20.js';

export * from '../etapa20/ayudas20.js';

export const CAPTURAS21 = path.join(os.tmpdir(), 'gama-talla-21-capturas');
export const PDFS21 = path.join(os.tmpdir(), 'gama-talla-21-pdf');

export async function limpiar21() {
  const productos = await servicio('GET', `/rest/v1/productos?select=id,nombre,variantes(id)&nombre=like.*${encodeURIComponent(' P21')}`);
  for (const p of productos) await borrarObjetos((await objetosDe(p.id)).map((o) => o.nombre));
  if (productos.length) await borrarCatalogo({ productos, variantes: productos.flatMap((p) => p.variantes) });
  return productos.length;
}
export const productos21 = () => servicio('GET', `/rest/v1/productos?select=id,nombre,marca,publico,categoria,activo,variantes(id,color,precio,fotos(ruta,orden),tallas(talla,estado))&nombre=like.*${encodeURIComponent(' P21')}&order=creado_en`);

// ------------------------------------------------------------------ generador de PDF
/* Texto PDF en WinAnsi (Helvetica estándar): tildes, ñ, «·» y «@» incluidos. */
function cadenaPdf(t) {
  let s = '';
  for (const ch of String(t)) {
    const c = ch.codePointAt(0);
    if (ch === '(' || ch === ')' || ch === '\\') s += `\\${ch}`;
    else if (c >= 32 && c < 127) s += ch;
    else if (c >= 160 && c <= 255) s += `\\${c.toString(8).padStart(3, '0')}`;
    else s += '?';
  }
  return `(${s})`;
}
/* Foto RGB sintética de 420×440 (≥ 400 px: fotos.js la acepta). «semilla» decide colores y bloques; «ruido»
   cambia unos pocos valores (otra codificación de la MISMA foto: huella exacta distinta, gris casi igual). */
export function fotoSintetica(semilla, { ancho = 420, alto = 440, ruido = 0, solido = null, aleatorio = false } = {}) {
  const datos = Buffer.alloc(ancho * alto * 3);
  // Color sólido (p. ej. rojo puro y un verde medio: fotos DISTINTAS con la misma huella gris).
  if (solido) { for (let k = 0; k < datos.length; k += 3) { datos[k] = solido[0]; datos[k + 1] = solido[1]; datos[k + 2] = solido[2]; } return { ancho, alto, datos }; }
  // Ruido (no se comprime): la imagen extraída pesa más de 1 MiB.
  if (aleatorio) { let z = (semilla * 2654435761) >>> 0; for (let k = 0; k < datos.length; k++) { z ^= z << 13; z >>>= 0; z ^= z >> 17; z ^= z << 5; z >>>= 0; datos[k] = z & 255; } return { ancho, alto, datos }; }
  let x = (semilla * 2654435761) >>> 0;
  const azar = () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  const fondo = [Math.floor(azar() * 200) + 30, Math.floor(azar() * 200) + 30, Math.floor(azar() * 200) + 30];
  const bloques = Array.from({ length: 6 }, () => ({ x0: azar() * ancho, y0: azar() * alto, w: 60 + azar() * 180, h: 60 + azar() * 180, c: [azar() * 255, azar() * 255, azar() * 255].map(Math.floor) }));
  for (let j = 0; j < alto; j++) for (let i = 0; i < ancho; i++) {
    let c = [fondo[0] + Math.floor((i / ancho) * 25), fondo[1], fondo[2] + Math.floor((j / alto) * 25)];
    for (const b of bloques) if (i >= b.x0 && i < b.x0 + b.w && j >= b.y0 && j < b.y0 + b.h) c = b.c;
    const k = (j * ancho + i) * 3;
    datos[k] = c[0]; datos[k + 1] = c[1]; datos[k + 2] = c[2];
  }
  if (ruido) for (let k = 0; k < datos.length; k += 97) datos[k] = Math.max(0, Math.min(255, datos[k] + (k % 2 ? ruido : -ruido)));
  return { ancho, alto, datos };
}
/* PDF de catálogo. paginas: [{ portada: { titulo, fecha, fotos: [semillas], notas: [] } } | { tarjetas: [...] } | { despedida: true }].
   Tarjeta: { foto: semilla | { semilla, ruido }, lineas: [texto], destacado: "$134.900" }. Rejilla 2×2 por página. */
export function crearPdf({ titulo = 'Catálogo', cabecera = 'CATÁLOGO · LUNES 23 DE NOVIEMBRE DE 2026', paginas }) {
  const objetos = [];
  const nuevo = (contenido) => { objetos.push(contenido); return objetos.length; };
  const catalogo = nuevo(null);
  const paginasId = nuevo(null);
  const fuente = nuevo(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
  const negrita = nuevo(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));
  const hijos = [];
  const imagenes = new Map();
  const imagen = (f) => {
    const { semilla, ruido = 0, ...opciones } = typeof f === 'number' ? { semilla: f } : f;
    const k = `${semilla}:${ruido}:${JSON.stringify(opciones)}`;
    if (imagenes.has(k)) return imagenes.get(k);
    const { ancho, alto, datos } = fotoSintetica(semilla, { ruido, ...opciones });
    const z = zlib.deflateSync(datos);
    const id = nuevo(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${ancho} /Height ${alto} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${z.length} >>\nstream\n`), z, Buffer.from('\nendstream')]));
    imagenes.set(k, id);
    return id;
  };
  paginas.forEach((pag, n) => {
    const ops = [];
    const usadas = {};
    const texto = (t, x, y, tam = 8, f = 'F1') => ops.push(`BT /${f} ${tam} Tf ${x} ${y} Td ${cadenaPdf(t)} Tj ET`);
    const rect = (x, y, w, h, relleno = null) => ops.push(relleno ? `q ${relleno} rg ${x} ${y} ${w} ${h} re f Q` : `q 0.85 G 0.5 w ${x} ${y} ${w} ${h} re S Q`);
    const foto = (f, x, y, w, h) => { const id = imagen(f); const nom = `Im${id}`; usadas[nom] = id; ops.push(`q ${w} 0 0 ${h} ${x} ${y} cm /${nom} Do Q`); };
    if (pag.portada) {
      rect(0, 0, 612, 792, '0.07 0.07 0.08');
      texto('E D I C I Ó N   D I A R I A', 255, 696, 9);
      rect(151, 341, 310, 310);
      const pos = [[158, 498], [308, 498], [158, 348], [308, 348]];
      pag.portada.fotos.forEach((s, i) => foto(s, pos[i][0], pos[i][1], 146, 146));
      texto(pag.portada.titulo || 'C A T Á L O G O', 155, 264, 40, 'F2');
      if (pag.portada.fecha) texto(pag.portada.fecha, 190, 200, 16);
      for (const [i, nota] of (pag.portada.notas || []).entries()) texto(nota, 200, 108 - i * 12, 8);
    } else if (pag.despedida) {
      texto('¿Te gustó algo?', 200, 480, 36, 'F2');
      texto('G R A C I A S   P O R   T U   P R E F E R E N C I A', 200, 300, 9);
    } else {
      texto(cabecera, 218, 766, 8);
      texto(String(n + 1), 304, 16, 8);
      const marcos = [[30, 396], [314, 396], [30, 48], [314, 48]];
      (pag.tarjetas || []).forEach((t, i) => {
        const [x, y] = marcos[i];
        rect(x, y, 268, 332);
        foto(t.foto, x + 6, y + 61, 256, 266);
        rect(x + 12, y + 308, 40, 13, '0.8 0.6 0.3');
        texto('N U E V O', x + 18, y + 312, 6);
        (t.lineas || []).forEach((l, k) => texto(l, x + 20, y + 44 - k * 11, 8, k === 0 ? 'F2' : 'F1'));
        if (t.destacado) { rect(x + 100, y + 5, 68, 17, '0.1 0.1 0.1'); texto(t.destacado, x + 111, y + 10, 11, 'F2'); }
      });
    }
    const cuerpo = Buffer.from(ops.join('\n'));
    const contenido = nuevo(Buffer.concat([Buffer.from(`<< /Length ${cuerpo.length} >>\nstream\n`), cuerpo, Buffer.from('\nendstream')]));
    const xo = Object.entries(usadas).map(([k, v]) => `/${k} ${v} 0 R`).join(' ');
    hijos.push(nuevo(Buffer.from(`<< /Type /Page /Parent ${paginasId} 0 R /MediaBox [0 0 612 792] /Contents ${contenido} 0 R /Resources << /Font << /F1 ${fuente} 0 R /F2 ${negrita} 0 R >> /XObject << ${xo} >> >> >>`)));
  });
  objetos[catalogo - 1] = Buffer.from(`<< /Type /Catalog /Pages ${paginasId} 0 R >>`);
  objetos[paginasId - 1] = Buffer.from(`<< /Type /Pages /Kids [${hijos.map((h) => `${h} 0 R`).join(' ')}] /Count ${hijos.length} >>`);
  const info = nuevo(Buffer.from(`<< /Title ${cadenaPdf(titulo)} /Producer (Prueba Gama y Talla) >>`));
  const partes = [Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  const desplazamientos = [];
  let largo = partes[0].length;
  objetos.forEach((o, i) => {
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), o, Buffer.from('\nendobj\n')]);
    desplazamientos.push(largo);
    partes.push(b);
    largo += b.length;
  });
  const xref = [`xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`, ...desplazamientos.map((d) => `${String(d).padStart(10, '0')} 00000 n \n`)].join('');
  partes.push(Buffer.from(`${xref}trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>\nstartxref\n${largo}\n%%EOF\n`));
  return Buffer.concat(partes);
}

/* Juego de catálogos sintéticos de las pruebas. 10 tarjetas: 8 de calzado (una infantil, EU 28–35) y 2 de
   otros artículos (camisetas y un reloj Boss). Semillas de foto: 101…110. El de precios cambia el ORDEN (páginas y posiciones), añade una tarjeta sin
   correspondencia (semilla 199) y repite la foto 104 en dos tarjetas (ambigua para la tarjeta 4). */
export const TARJETAS = [
  { foto: 101, lineas: ['NIKE WINFLO P21', 'Tallas: (Euro 40 al 43)'], venta: '$134.900', coste: ['PRECIO$95.000'] },
  { foto: 102, lineas: ['BOSS EVO P21', 'Tallas: (EURO 40 al 44) DISPONIBLE'], venta: '$134.900', coste: ['PRECIO$95.000', 'DISPONIBLE POR CAJA $85.000'] },
  { foto: 103, lineas: ['HUGO BOSS', 'Hombre 40 al 44 Euro'], venta: '$174.900', coste: ['HOMBRE $125.000'] },
  { foto: 104, lineas: ['CAMISETAS IMPORTADAS', 'de caballero gama alta Viene talla. L. XL. XXL'], venta: '$94.900', coste: ['PRECIO X MAYOR $65.000'] },
  { foto: 105, lineas: ['NUEVO NIKE CAMARAS P21 DAMA', 'Tallas:TODAS LAS TALLAS'], venta: '$164.900', coste: ['$115.000'] },
  { foto: 106, lineas: ['NIKE METCON P21 NIÑ@ NEGRO BLANCO', 'EU 28 AL 35'], venta: '$139.900', coste: ['$100.000'] },
  { foto: 107, lineas: ['RELOJ BOSS ACERO'], venta: '$474.900', coste: ['$380.000'] },
  { foto: 108, lineas: ['ADIDAS SAMBA P21 DAMA AZUL BLANCO', 'EU 36 AL 40'], venta: '$129.900', coste: ['EU 36 AL 40. $90.000'] },
  // Otra fotografía (otro ángulo) del Winflo de la tarjeta 1 y otro color del Samba de la tarjeta 8.
  { foto: 109, lineas: ['NIKE WINFLO P21', 'Tallas: (Euro 40 al 43)'], venta: '$134.900', coste: ['PRECIO$95.000'] },
  { foto: 110, lineas: ['ADIDAS SAMBA P21 DAMA VINOTINTO BLANCO', 'EU 36 AL 40'], venta: '$129.900', coste: ['EU 36 AL 40. $90.000'] }
];
export const porPaginas = (lista) => Array.from({ length: Math.ceil(lista.length / 4) }, (_, i) => ({ tarjetas: lista.slice(i * 4, i * 4 + 4) }));
export function catalogosSinteticos({ fechaPrecios = 'Lunes 23 de Noviembre de 2026' } = {}) {
  const portada = (fecha, notas = []) => ({ portada: { fecha, fotos: [101, 104, 105, 108], notas } });
  const venta = crearPdf({ titulo: 'Novedades P21', paginas: [portada('Lunes 23 de Noviembre de 2026', ['Precios sujetos a disponibilidad de tallas']),
    ...porPaginas(TARJETAS.map((t) => ({ foto: t.foto, lineas: t.lineas, destacado: t.venta }))), { despedida: true }] });
  // Precios: orden distinto (al revés) y las fotos de la 1 recodificada; 104 repetida y una sin pareja.
  const costes = [...TARJETAS].reverse().map((t) => ({ foto: t.foto === 101 ? { semilla: 101, ruido: 2 } : t.foto, lineas: t.coste }));
  costes.splice(3, 0, { foto: 104, lineas: ['PRECIO X MAYOR $60.000'] }, { foto: 199, lineas: ['$70.000'] });
  const precios = crearPdf({ titulo: 'Precios P21', paginas: [portada(fechaPrecios), ...porPaginas(costes), { despedida: true }] });
  const descripciones = crearPdf({ titulo: 'Catálogo P21', paginas: [portada('Lunes 23 de Noviembre de 2026'), ...porPaginas(TARJETAS.map((t) => ({ foto: t.foto, lineas: t.lineas }))), { despedida: true }] });
  return { venta, precios, descripciones };
}
/* Escribe los PDF sintéticos en la carpeta temporal (nombres que NO dicen el papel: se deduce del contenido). */
export function prepararPdfs21(opciones = {}) {
  fs.mkdirSync(PDFS21, { recursive: true });
  const { venta, precios, descripciones } = catalogosSinteticos(opciones);
  const sufijo = opciones.fechaPrecios ? '-otra-fecha' : '';
  const rutas = { venta: path.join(PDFS21, 'catalogo-a.pdf'), precios: path.join(PDFS21, `catalogo-b${sufijo}.pdf`), descripciones: path.join(PDFS21, 'catalogo-c.pdf') };
  fs.writeFileSync(rutas.venta, venta);
  fs.writeFileSync(rutas.precios, precios);
  fs.writeFileSync(rutas.descripciones, descripciones);
  return rutas;
}

// ------------------------------------------------------------------ importador
export const seccionPdf = (page) => importador(page).locator('#imp-pdf');
export const tarjetaPdf = (page, n) => seccionPdf(page).locator('.importador-pdf-tarjeta').filter({ has: page.getByRole('heading', { name: new RegExp(`^Tarjeta ${n} ·`) }) });
export async function abrirPdf(page) {
  await importador(page).getByRole('button', { name: 'Importar catálogo PDF' }).click();
  await expect(seccionPdf(page)).toBeVisible();
}
export async function subirPdfs(page, rutas) {
  await seccionPdf(page).locator('#imp-pdf-archivo').setInputFiles(rutas);
  await expect(seccionPdf(page).locator('#imp-pdf-avance')).toHaveCount(0, { timeout: 120000 });
}
export async function verTodas(page) {
  await seccionPdf(page).getByRole('button', { name: /^Todas \(/ }).click();
}
