/* Etapa 15A · Utilidades de las pruebas del panel privado. SOLO LOCAL.
 *
 * Usan el stack local desechable de Supabase (`supabase start`): crean usuarios y datos
 * FICTICIOS con la clave de servicio LOCAL y los borran al terminar. Se niegan a ejecutarse
 * si la API no está en 127.0.0.1. Nunca imprimen claves, contraseñas ni tokens.
 */
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';

export const SITIO = process.env.SITIO || 'http://127.0.0.1:8765';
export const PANEL = `${SITIO}/admin/`;
export const CLAVE_SESION = 'gama-talla-panel-sesion';

let cache = null;
export function entorno() {
  if (cache) return cache;
  const salida = execSync('npx --yes supabase@3.0.0 status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const datos = JSON.parse(salida.slice(salida.indexOf('{')));
  const api = new URL(datos.API_URL);
  if (!['127.0.0.1', 'localhost'].includes(api.hostname)) {
    throw new Error(`RECHAZADO: las pruebas del panel escriben datos y solo corren en local (API = ${api.hostname}).`);
  }
  cache = { api: datos.API_URL.replace(/\/+$/, ''), publicable: datos.PUBLISHABLE_KEY, servicio: datos.SERVICE_ROLE_KEY };
  return cache;
}

export async function servicio(metodo, ruta, cuerpo, prefer) {
  const e = entorno();
  const r = await fetch(e.api + ruta, {
    method: metodo,
    headers: {
      apikey: e.servicio,
      Authorization: `Bearer ${e.servicio}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  });
  const texto = await r.text();
  let datos = null;
  try { datos = JSON.parse(texto); } catch { datos = texto; }
  if (!r.ok) throw new Error(`${metodo} ${ruta} -> ${r.status} ${String(datos?.message || datos?.msg || '').slice(0, 120)}`);
  return datos;
}

export const contrasenaAleatoria = () => `${crypto.randomBytes(18).toString('base64url')}Aa1!`;

export async function crearUsuario(correo) {
  const clave = contrasenaAleatoria();
  const u = await servicio('POST', '/auth/v1/admin/users', { email: correo, password: clave, email_confirm: true });
  return { id: u.id, correo, clave };
}
export const borrarUsuario = (id) => servicio('DELETE', `/auth/v1/admin/users/${id}`).catch(() => null);
export const hacerAdmin = (id) => servicio('POST', '/rest/v1/administradores', { user_id: id, nombre: 'Administración ficticia local' });
export const quitarAdmin = (id) => servicio('DELETE', `/rest/v1/administradores?user_id=eq.${id}`);
export const contarProductos = async () => (await servicio('GET', '/rest/v1/productos?select=id')).length;

// Catálogo FICTICIO con todos los estados: disponible, por revisar, agotada, oculta, coma y fracción.
export async function crearCatalogo(sufijo) {
  const creado = { productos: [], variantes: [] };
  try {
    return await crearCatalogoInterno(sufijo, creado);
  } catch (error) {
    await borrarCatalogo(creado).catch(() => null); // no dejar restos si falla a medias
    throw error;
  }
}

async function crearCatalogoInterno(sufijo, creado) {
  const hace1h = new Date(Date.now() - 3600e3).toISOString();
  const productos = await servicio('POST', '/rest/v1/productos?select=id,codigo_interno', [
    { nombre: `Corredora Ficticia ${sufijo}`, marca: 'Marca Norte', categoria: 'Running', referencia_proveedor: `REF-PANEL-${sufijo}`, orden: 1, activo: true },
    { nombre: `Clásica Pérez ${sufijo}`, marca: 'Marca Sur', categoria: 'Urbanas', referencia_proveedor: null, orden: 2, activo: true },
    { nombre: `Retirada ${sufijo}`, marca: 'Marca Este', categoria: 'Urbanas', referencia_proveedor: `OLD-${sufijo}`, orden: 3, activo: false }
  ], 'return=representation');
  creado.productos = productos;
  const [p1, p2, p3] = productos;
  const variantes = await servicio('POST', '/rest/v1/variantes?select=id,codigo_variante,producto_id', [
    { producto_id: p1.id, color: 'Negro y blanco', precio: 289000, precio_anterior: 329000, orden: 1, activa: true },
    { producto_id: p1.id, color: 'Azul cobalto', precio: 289000, precio_anterior: 0, orden: 2, activa: false },
    { producto_id: p2.id, color: 'Blanco', precio: 0, precio_anterior: 0, orden: 1, activa: true },
    { producto_id: p3.id, color: 'Gris', precio: 199000, precio_anterior: 0, orden: 1, activa: true }
  ], 'return=representation');
  creado.variantes = variantes;
  const [v1, v2, v3, v4] = variantes;
  await servicio('POST', '/rest/v1/fotos', [
    { variante_id: v1.id, ruta: 'assets/images/productos/editadas/zapatilla_01.webp', orden: 1 },
    { variante_id: v4.id, ruta: 'assets/images/productos/editadas/zapatilla_02.webp', orden: 1 }
  ]);
  await servicio('POST', '/rest/v1/tallas', [
    { variante_id: v1.id, talla: '41', estado: 'CONFIRMADA', vigencia_desde: hace1h, activa: true },
    { variante_id: v1.id, talla: '40,5', estado: 'CONFIRMADA', vigencia_desde: hace1h, activa: true },
    { variante_id: v1.id, talla: '40 1/3', estado: 'REVISAR', vigencia_desde: null, activa: true },
    { variante_id: v1.id, talla: '42', estado: 'AGOTADA', vigencia_desde: null, activa: true },
    { variante_id: v1.id, talla: '43', estado: 'CONFIRMADA', vigencia_desde: hace1h, activa: false },
    { variante_id: v2.id, talla: '40', estado: 'CONFIRMADA', vigencia_desde: hace1h, activa: true },
    { variante_id: v3.id, talla: '38', estado: 'REVISAR', vigencia_desde: null, activa: true },
    { variante_id: v4.id, talla: '39', estado: 'REVISAR', vigencia_desde: null, activa: true }
  ]);
  return { productos, variantes };
}

export async function borrarCatalogo(catalogo) {
  if (!catalogo) return;
  if (!catalogo.variantes.length && !catalogo.productos.length) return;
  const variantes = catalogo.variantes.map((v) => v.id).join(',');
  const productos = catalogo.productos.map((p) => p.id).join(',');
  // Mantenimiento con service_role: los roles de la aplicación no pueden borrar tallas.
  if (variantes) {
    await servicio('DELETE', `/rest/v1/tallas?variante_id=in.(${variantes})`);
    await servicio('DELETE', `/rest/v1/fotos?variante_id=in.(${variantes})`);
    await servicio('DELETE', `/rest/v1/variantes?id=in.(${variantes})`);
  }
  if (productos) await servicio('DELETE', `/rest/v1/productos?id=in.(${productos})`);
}

// El panel recibe la configuración del stack local en lugar de admin/config.js.
export async function configurarPanel(page, { url, clave } = {}) {
  const e = entorno();
  const cuerpo = `window.GAMA_TALLA_ADMIN_CONFIG = ${JSON.stringify({ supabaseUrl: url ?? e.api, clavePublicable: clave ?? e.publicable })};`;
  await page.route('**/admin/config.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: cuerpo }));
}

export async function ingresar(page, usuario) {
  await page.getByLabel('Correo').fill(usuario.correo);
  await page.getByLabel('Contraseña', { exact: true }).fill(usuario.clave);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

// Desbordamiento horizontal y controles táctiles demasiado pequeños en la vista actual.
export async function revisarDisposicion(page) {
  return page.evaluate(() => {
    const ancho = document.documentElement.clientWidth;
    const desborde = Math.max(0, document.documentElement.scrollWidth - ancho);
    const visibles = [...document.querySelectorAll('button, a[href], input')]
      .filter((n) => n.offsetParent !== null && !n.closest('[hidden]'));
    const pequenos = visibles
      .map((n) => ({ n, r: n.getBoundingClientRect() }))
      .filter(({ r }) => r.height < 40 || r.width < 40)
      .map(({ n, r }) => `${n.tagName.toLowerCase()}#${n.id || n.className}(${Math.round(r.width)}x${Math.round(r.height)})`);
    const fuera = [...document.querySelectorAll('body *')]
      .filter((n) => n.offsetParent !== null)
      .map((n) => n.getBoundingClientRect())
      .filter((r) => r.width > 0 && (r.right > ancho + 1 || r.left < -1)).length;
    return { desborde, pequenos, fuera };
  });
}
