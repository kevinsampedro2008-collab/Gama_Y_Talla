/* Etapa 22 · Utilidades de las pruebas de «Publicar»/«Ocultar» en el tablero. SOLO LOCAL.
 *
 * Catálogo FICTICIO de la marca «MARCA ESTADO T22» en el Supabase LOCAL (entorno aislado, SITIO=8770). Se crea
 * antes de cada prueba y se borra después; nunca se tocan productos reales.
 */
import { entorno, servicio, borrarCatalogo } from '../etapa15/ayudas-panel.js';

export const MARCA = 'MARCA ESTADO T22';
const FOTO = (n) => `assets/images/productos/editadas/zapatilla_0${n}.webp`;

export async function borrarTodo22() {
  const productos = await servicio('GET', `/rest/v1/productos?select=id,variantes(id)&marca=eq.${encodeURIComponent(MARCA)}`);
  if (productos.length) await borrarCatalogo({ productos, variantes: productos.flatMap((p) => p.variantes) });
}

/* Modelos (en este orden en el tablero):
 *   T22 RELLENO 1…4 (publicados)                  ← arriba
 *   T22 OCULTO VALIDO   oculto, completo; AZUL (foto; 40 confirmada, 41 por revisar, 42 agotada), NEGRO (sin foto, 40 desactivada)
 *   T22 RELLENO 5…6
 *   T22 INCOMPLETO      oculto, SIN público y SIN foto
 *   T22 PUBLICADO       publicado y completo (como el válido)
 *   T22 SOLO OCULTO     oculto, completo y SIN nada más oculto (al publicarlo deja de ser «con elementos ocultos»)
 *   T22 RETIRADO        retirado del catálogo
 *   T22 RELLENO 7…9                                ← abajo */
export async function crearCatalogo22() {
  const hace1h = new Date(Date.now() - 3600e3).toISOString();
  const nombres = ['T22 RELLENO 1', 'T22 RELLENO 2', 'T22 RELLENO 3', 'T22 RELLENO 4', 'T22 OCULTO VALIDO', 'T22 RELLENO 5', 'T22 RELLENO 6', 'T22 INCOMPLETO',
    'T22 PUBLICADO', 'T22 SOLO OCULTO', 'T22 RETIRADO', 'T22 RELLENO 7', 'T22 RELLENO 8', 'T22 RELLENO 9'];
  const def = {
    'T22 OCULTO VALIDO': { activo: false },
    'T22 INCOMPLETO': { activo: false, publico: null },
    'T22 PUBLICADO': { activo: true },
    'T22 SOLO OCULTO': { activo: false },
    'T22 RETIRADO': { activo: false, retirado_en: new Date().toISOString() }
  };
  const productos = await servicio('POST', '/rest/v1/productos?select=id,nombre,codigo_interno,version', nombres.map((nombre, i) => ({
    // Todas las filas con las mismas claves (PostgREST lo exige en una inserción múltiple).
    nombre, marca: MARCA, categoria: 'URBANAS', orden: i + 1,
    ...{ publico: 'unisex', activo: true, retirado_en: null }, ...(def[nombre] || {})
  })), 'return=representation');
  const p = Object.fromEntries(productos.map((x) => [x.nombre, x]));
  const completos = ['T22 OCULTO VALIDO', 'T22 PUBLICADO', 'T22 SOLO OCULTO', 'T22 RETIRADO'];
  const defs = [
    ...nombres.filter((n) => n.startsWith('T22 RELLENO')).map((n, i) => ({ clave: `r${i + 1}`, producto: n, color: 'AZUL', orden: 0, foto: [(i % 4) + 1], tallas: ['38', '39'] })),
    ...completos.map((n) => ({ clave: n, producto: n, color: 'AZUL', orden: 0, foto: [1], tallas: ['40', '41', '42'] })),
    ...['T22 OCULTO VALIDO', 'T22 PUBLICADO'].map((n) => ({ clave: `${n}|negro`, producto: n, color: 'NEGRO', orden: 1, foto: [], tallas: ['40'] })),
    { clave: 'T22 INCOMPLETO', producto: 'T22 INCOMPLETO', color: 'AZUL', orden: 0, foto: [], tallas: ['40'] }
  ];
  const variantes = await servicio('POST', '/rest/v1/variantes?select=id,color,producto_id,orden', defs.map((d) => ({
    producto_id: p[d.producto].id, color: d.color, precio: 150000, orden: d.orden, activa: true
  })), 'return=representation');
  const v = Object.fromEntries(defs.map((d) => [d.clave, variantes.find((x) => x.producto_id === p[d.producto].id && x.orden === d.orden)]));
  await servicio('POST', '/rest/v1/fotos', defs.flatMap((d) => d.foto.map((n, orden) => ({ variante_id: v[d.clave].id, ruta: FOTO(n), orden }))));
  const filas = defs.flatMap((d) => d.tallas.map((t) => {
    const base = { variante_id: v[d.clave].id, talla: t, activa: true };
    if (d.clave.endsWith('|negro')) return { ...base, activa: false, estado: 'REVISAR', vigencia_desde: null };
    if (t === '40' && completos.includes(d.producto)) return { ...base, estado: 'CONFIRMADA', vigencia_desde: hace1h };
    if (t === '42') return { ...base, estado: 'AGOTADA', vigencia_desde: null };
    return { ...base, estado: 'REVISAR', vigencia_desde: null };
  }));
  const tallas = await servicio('POST', '/rest/v1/tallas?select=id,variante_id,talla', filas, 'return=representation');
  return { productos: p, variantes: v, tallas, idsVariantes: Object.values(v).map((x) => x.id), nombres };
}

// Lecturas de la base (solo lectura, con la clave de servicio LOCAL).
export const productoDB = async (id) => (await servicio('GET', `/rest/v1/productos?select=id,nombre,activo,version,ultima_operacion,retirado_en,publico&id=eq.${id}`))[0];
export const productosDB = () => servicio('GET', `/rest/v1/productos?select=id,nombre,activo,version,ultima_operacion,retirado_en,publico&marca=eq.${encodeURIComponent(MARCA)}&order=orden`);
// TODAS las columnas de las tallas de los colores indicados: cualquier escritura (estado, activa, vigencias) se vería.
export const tallasDB = (idsVariantes) => servicio('GET', `/rest/v1/tallas?select=*&variante_id=in.(${idsVariantes.join(',')})&order=id`);
export const variantesDB = (idsVariantes) => servicio('GET', `/rest/v1/variantes?select=id,activa,precio,orden,color&id=in.(${idsVariantes.join(',')})&order=id`);
export const fotosDB = (idsVariantes) => servicio('GET', `/rest/v1/fotos?select=variante_id,ruta,orden&variante_id=in.(${idsVariantes.join(',')})&order=ruta`);
export const historialProducto = (id) => servicio('GET', `/rest/v1/historial?select=id,operacion,tabla&fila_id=eq.${id}&order=id.asc`).catch(() => []);

// El catálogo PÚBLICO (lo que ve la tienda): con la clave publicable, como cualquier visitante.
export async function codigosPublicos() {
  const e = entorno();
  const r = await fetch(`${e.api}/rest/v1/catalogo_publico?select=codigoInterno,nombre`, { headers: { apikey: e.publicable, Authorization: `Bearer ${e.publicable}` } });
  if (!r.ok) throw new Error(`catalogo_publico -> ${r.status}`);
  return (await r.json());
}
