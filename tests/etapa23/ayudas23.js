/* Etapa 23 · Utilidades de las pruebas de «Novedades y diferencias». SOLO LOCAL.
 *
 * - Catálogos PDF SINTÉTICOS de dos entregas (crearPdf de la etapa 21), sin datos ni fotos del proveedor.
 * - Importador contra el Supabase LOCAL y el entorno aislado (SITIO=http://127.0.0.1:8770); los modelos
 *   ficticios terminan en « P23» y se borran al terminar.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect } from '@playwright/test';
import { servicio, borrarCatalogo, objetosDe, borrarObjetos, importador, abrirImportador, abrirPdf, subirPdfs, seccionPdf, crearPdf, porPaginas } from '../etapa21/ayudas21.js';

export * from '../etapa21/ayudas21.js';

export const CAPTURAS23 = path.join(os.tmpdir(), 'gama-talla-23-capturas');
export const PDFS23 = path.join(os.tmpdir(), 'gama-talla-23-pdf');

export async function limpiar23() {
  const productos = await servicio('GET', `/rest/v1/productos?select=id,nombre,variantes(id)&nombre=like.*${encodeURIComponent(' P23')}`);
  for (const p of productos) await borrarObjetos((await objetosDe(p.id)).map((o) => o.nombre));
  if (productos.length) await borrarCatalogo({ productos, variantes: productos.flatMap((p) => p.variantes) });
  return productos.length;
}
/* Registro completo: cualquier cambio en propiedades, códigos, galerías o tallas (estado, activa, vigencias) se ve. */
export async function productos23() {
  const lista = await servicio('GET', `/rest/v1/productos?select=*,variantes(*,fotos(ruta,orden,alt),tallas(*))&nombre=like.*${encodeURIComponent(' P23')}&order=creado_en,nombre`);
  for (const p of lista) {
    p.variantes.sort((a, b) => a.orden - b.orden);
    for (const v of p.variantes) { v.fotos.sort((a, b) => a.orden - b.orden); v.tallas.sort((a, b) => Number(a.talla) - Number(b.talla)); }
  }
  return lista;
}
export const producto23 = async (nombre) => (await productos23()).find((p) => p.nombre === nombre);

/* Catálogo FICTICIO «anterior a esta etapa» (sin memoria): un modelo publicado con dos colores, otro oculto, uno
   retirado y uno con un color desactivado. Todo con propiedades, códigos y tallas en estados distintos. */
const FOTO = (n) => `assets/images/productos/editadas/zapatilla_0${n}.webp`;
export async function crearCatalogo23() {
  const hace1h = new Date(Date.now() - 3600e3).toISOString();
  const filas = [
    { nombre: 'WINFLO P23', marca: 'NIKE', publico: 'hombre', activo: true, retirado_en: null, categoria: 'RUNNING', referencia_proveedor: 'REF-COMPARTIDA', descripcion: 'Descripción que se conserva', segmento: 'hombre', destacado: true, nuevo_ingreso: true, orden: 7 },
    { nombre: 'SAMBA P23', marca: 'ADIDAS', publico: 'dama', activo: false, retirado_en: null, categoria: 'URBANAS', referencia_proveedor: 'REF-COMPARTIDA', descripcion: null, segmento: null, destacado: false, nuevo_ingreso: false, orden: 8 },
    { nombre: 'RETIRADA P23', marca: 'PUMA', publico: 'hombre', activo: false, retirado_en: new Date().toISOString(), categoria: 'URBANAS', referencia_proveedor: null, descripcion: null, segmento: null, destacado: false, nuevo_ingreso: false, orden: 9 }
  ];
  const productos = await servicio('POST', '/rest/v1/productos?select=id,nombre,codigo_interno,version', filas, 'return=representation');
  const p = Object.fromEntries(productos.map((x) => [x.nombre, x]));
  const defs = [
    { producto: 'WINFLO P23', color: 'NEGRO', precio: 150000, precio_anterior: 190000, activa: true, orden: 0, referencia_variante: 'W-N', muestra_color: '#111111', forma_muestra: 'foto', fotos: [1, 2], tallas: ['40', '41', '42', '43'] },
    { producto: 'WINFLO P23', color: 'AZUL', precio: 150000, precio_anterior: 0, activa: true, orden: 1, referencia_variante: 'W-A', muestra_color: '#1122cc', forma_muestra: 'circulo', fotos: [3], tallas: ['40', '41'] },
    { producto: 'WINFLO P23', color: 'GRIS', precio: 150000, precio_anterior: 0, activa: false, orden: 2, referencia_variante: 'W-G', muestra_color: null, forma_muestra: 'circulo', fotos: [4], tallas: ['40'] },
    { producto: 'SAMBA P23', color: 'BLANCO', precio: 129900, precio_anterior: 0, activa: true, orden: 0, referencia_variante: 'S-B', muestra_color: null, forma_muestra: 'circulo', fotos: [2], tallas: ['36', '37'] },
    { producto: 'RETIRADA P23', color: 'ROJO', precio: 100000, precio_anterior: 0, activa: true, orden: 0, referencia_variante: null, muestra_color: null, forma_muestra: 'circulo', fotos: [1], tallas: ['40'] }
  ];
  const variantes = await servicio('POST', '/rest/v1/variantes?select=id,color,codigo_variante,producto_id', defs.map(({ producto, fotos, tallas, ...d }) => ({ producto_id: p[producto].id, ...d })), 'return=representation');
  const v = Object.fromEntries(defs.map((d) => [`${d.producto}|${d.color}`, variantes.find((x) => x.producto_id === p[d.producto].id && x.color === d.color)]));
  await servicio('POST', '/rest/v1/fotos', defs.flatMap((d) => d.fotos.map((n, orden) => ({ variante_id: v[`${d.producto}|${d.color}`].id, ruta: FOTO(n), orden, alt: `alt ${d.color} ${orden}` }))));
  await servicio('POST', '/rest/v1/tallas', defs.flatMap((d) => d.tallas.map((t) => {
    const base = { variante_id: v[`${d.producto}|${d.color}`].id, talla: t, activa: true, estado: 'REVISAR', vigencia_desde: null };
    if (d.color === 'NEGRO' && t === '40') return { ...base, estado: 'CONFIRMADA', vigencia_desde: hace1h };
    if (d.color === 'NEGRO' && t === '41') return { ...base, estado: 'AGOTADA' };
    if (d.color === 'NEGRO' && t === '43') return { ...base, activa: false };
    return base;
  })));
  return { p, v };
}

// ------------------------------------------------------------------ entregas en PDF
/* Tarjeta: { foto, lineas, venta, coste }. Documento de venta (con su fecha) y, si hay costes, el de precios en
   el orden inverso. */
export function entrega(nombre, fecha, tarjetas, { conPrecios = true, fechaPrecios = fecha } = {}) {
  fs.mkdirSync(PDFS23, { recursive: true });
  const portada = (f) => ({ portada: { fecha: f || '', fotos: [tarjetas[0].foto, tarjetas[0].foto, tarjetas[0].foto, tarjetas[0].foto].map((x) => (typeof x === 'number' ? x : x.semilla)), notas: [] } });
  const cabecera = 'CATÁLOGO';
  const venta = path.join(PDFS23, `${nombre}-venta.pdf`);
  fs.writeFileSync(venta, crearPdf({ titulo: `Venta ${nombre}`, cabecera, paginas: [portada(fecha), ...porPaginas(tarjetas.map((t) => ({ foto: t.foto, lineas: t.lineas, destacado: t.venta }))), { despedida: true }] }));
  if (!conPrecios) return [venta];
  const precios = path.join(PDFS23, `${nombre}-precios.pdf`);
  fs.writeFileSync(precios, crearPdf({ titulo: `Precios ${nombre}`, cabecera, paginas: [portada(fechaPrecios), ...porPaginas([...tarjetas].reverse().map((t) => ({ foto: t.foto, lineas: t.coste || ['$1.000'] }))), { despedida: true }] }));
  return [venta, precios];
}

// ------------------------------------------------------------------ pantalla
export const novedades = (page) => importador(page).locator('#imp-novedades');
export const novedad = (page, n, tipo = 'Tarjeta') => novedades(page).locator('.importador-novedad').filter({ has: page.getByRole('heading', { name: new RegExp(`^${tipo} ${n} ·`) }) });
export const resumenNov = (page) => novedades(page).locator('#imp-nov-resumen');
export const filtro = (page, nombre) => novedades(page).getByRole('group', { name: 'Qué novedades ver' }).getByRole('button', { name: new RegExp(`^${nombre} \\(`) });
export async function ver(page, nombre) { await filtro(page, nombre).click(); await expect(filtro(page, nombre)).toHaveAttribute('aria-pressed', 'true'); }
export const aplicar = (page) => novedades(page).locator('#imp-nov-aplicar');
export const pie = (page) => importador(page).locator('#importador-resultado');
export const avisoNov = (page) => novedades(page).locator('#imp-nov-aviso');
export const operacion = (page, texto) => novedades(page).locator('.importador-nov-operacion').filter({ hasText: texto });
// Abre el importador en un lote vacío (si hay borradores guardados, pide uno nuevo).
export async function abrirLoteNuevo(page) {
  await abrirImportador(page);
  const nuevo = importador(page).locator('#imp-borrador-nuevo');
  await expect(importador(page).locator('#imp-borradores, #imp-entrada').first()).toBeVisible();
  if (await nuevo.count()) await nuevo.click();
  await expect(importador(page).locator('#imp-entrada')).toBeVisible();
}
export async function importarEntrega(page, rutas) {
  if (!(await seccionPdf(page).count())) await abrirPdf(page);
  await subirPdfs(page, rutas);
  await expect(resumenNov(page)).toBeVisible();
}
export async function elegirProveedor(page, nombre) {
  const caja = novedades(page).locator('#imp-nov-proveedor');
  if (!(await caja.evaluate((n) => /** @type {HTMLDetailsElement} */ (n).open))) await caja.locator('summary').click();
  const radio = caja.getByRole('radio', { name: nombre, exact: true });
  if (await radio.count()) await radio.click();
  else { await caja.getByLabel('Otro proveedor').fill(nombre); await caja.getByRole('button', { name: 'Crear proveedor' }).click(); }
  await expect(caja.locator('summary')).toContainText(nombre);
}
export async function abrirResolver(entrada) {
  const det = entrada.locator('.importador-nov-resolver');
  if (!(await det.evaluate((n) => /** @type {HTMLDetailsElement} */ (n).open))) await det.locator('summary').click();
  return det;
}
export async function elegirModo(entrada, nombre) {
  const det = await abrirResolver(entrada);
  await det.getByRole('radio', { name: nombre, exact: true }).click();
}
// Relaciona a mano una entrada con un color existente (catálogo anterior a esta etapa).
export async function vincular(entrada, busqueda, color, { recordar = true } = {}) {
  await elegirModo(entrada, 'Actualizar un color existente');
  await entrada.getByRole('searchbox', { name: /^Buscar la zapatilla y el color/ }).fill(busqueda);
  await entrada.getByRole('button', { name: color }).click();
  await entrada.getByRole('button', { name: recordar ? 'Confirmar y recordar esta relación' : 'Usar solo esta vez' }).click();
  await expect(entrada.locator('.importador-nov-recuerdo')).toContainText(recordar ? 'Relación recordada' : 'Se usa solo esta vez');
}
// Lo que hay en la memoria local (IndexedDB) de este navegador.
export const memoria = (page) => page.evaluate(async () => {
  const db = await window.GamaTallaBorradores.abrirBase();
  const leer = (n) => new Promise((ok, mal) => { const r = db.transaction(n).objectStore(n).getAll(); r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); });
  return { version: db.version, proveedores: await leer('proveedores'), asociaciones: await leer('asociaciones'), historial: await leer('historial') };
});
// Cuenta las escrituras que salen hacia Supabase (guardados de producto y subidas a Storage).
export function contarEscrituras(page) {
  const c = { guardar: 0, subir: 0, cuerpos: [] };
  page.on('request', (r) => {
    if (/\/rpc\/fn_admin_guardar_producto$/.test(r.url()) && r.method() === 'POST') { c.guardar += 1; c.cuerpos.push(JSON.parse(r.postData() || '{}')); }
    if (/\/storage\/v1\/object\/fotos-catalogo\//.test(r.url()) && r.method() === 'POST') c.subir += 1;
  });
  return c;
}
// Captura con un elemento a la vista (sin esperar estabilidad: solo se coloca la zona de desplazamiento).
export async function capturar23(page, nombre, selector = '') {
  fs.mkdirSync(CAPTURAS23, { recursive: true });
  if (selector) await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'start' }), selector);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(CAPTURAS23, nombre) });
}
// Firefox avisa a veces de que no pudo descargar una fuente de Google: no es del panel.
export const propios = (lista) => lista.filter((x) => !/downloadable font: download failed/.test(x));

// ------------------------------------------------------------------ fallos del almacenamiento local (simulados)
/* El guardado del borrador falla SOLO cuando lo que se guarda cumple «patron» (expresión sobre el JSON del lote) y
   anota qué llevaba: la operación de actualización (inventario) y, de cada ficha, su identificador, su operación, su
   cuerpo y los nombres de archivo de sus fotos. Lo demás se guarda con normalidad. */
export const fallarBorrador = (page, patron) => page.evaluate((p) => {
  const b = window.GamaTallaBorradores;
  const w = /** @type {any} */ (window);
  w.borradoresReales = w.borradoresReales || b;
  w.intentos = [];
  window.GamaTallaBorradores = { ...w.borradoresReales, guardarBorrador: async (ambito, registro, opciones) => {
    if (!new RegExp(p).test(registro.datos)) return w.borradoresReales.guardarBorrador(ambito, registro, opciones);
    const lote = JSON.parse(registro.datos).lote;
    const op = Object.values(lote.inventario?.operaciones || {})[0];
    w.intentos.push({ operacion: op?.pendiente?.operacion, objetos: (op?.fotos || []).map((f) => f.objeto),
      fichas: lote.fichas.map((f) => ({ id: f.id, estado: f.estado, operacion: f.pendiente?.operacion || null, datos: f.pendiente?.datos || null, objetos: f.colores.flatMap((c) => c.fotos.map((x) => x.objeto).filter(Boolean)) })) });
    throw new b.ErrorCuota('sin espacio');
  } };
}, patron);
export const restaurarBorrador = (page) => page.evaluate(() => { window.GamaTallaBorradores = /** @type {any} */ (window).borradoresReales; });
export const intentos = (page) => page.evaluate(() => /** @type {any} */ (window).intentos);
