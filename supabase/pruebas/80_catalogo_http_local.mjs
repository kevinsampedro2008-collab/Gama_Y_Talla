/* Etapa 16 · Catálogo desde el panel por HTTP real: Kong + PostgREST + Auth + Storage.
 *
 * Comprueba lo que las pruebas SQL no pueden: cómo responde PostgREST a las funciones
 * nuevas (códigos PTnnn → estado HTTP) y cómo aplica Storage el bucket y sus políticas
 * (tipo, tamaño, nombre, sin sobrescritura, borrado protegido), con sesiones de verdad.
 *
 * SOLO para el stack local desechable, CON Storage:
 *   npx --yes supabase@3.0.0 start -x realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
 *   node supabase/pruebas/80_catalogo_http_local.mjs
 *
 * Se niega a ejecutarse si la API no está en 127.0.0.1. Crea usuarios, productos y archivos
 * FICTICIOS y los borra al terminar (service_role, mantenimiento). Nunca imprime claves,
 * contraseñas ni tokens.
 */
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';

const salida = execSync('npx --yes supabase@3.0.0 status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const entorno = JSON.parse(salida.slice(salida.indexOf('{')));
const API = new URL(entorno.API_URL);
if (!['127.0.0.1', 'localhost'].includes(API.hostname)) {
  console.error(`RECHAZADO: esta prueba escribe datos y solo corre en local. API = ${API.hostname}`);
  process.exit(2);
}
const BASE = entorno.API_URL.replace(/\/+$/, '');
const PUBLICA = entorno.PUBLISHABLE_KEY;
const SERVICIO = entorno.SERVICE_ROLE_KEY;
const BUCKET = 'fotos-catalogo';
// WebP válido de 1×1 px. El contenido no lo mira Storage; el panel sí lo comprueba.
const WEBP = Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=', 'base64');

let correctas = 0;
let fallidas = 0;
const esperar = (nombre, ok, detalle = '') => {
  if (ok) { correctas += 1; console.log(`OK      ${nombre}`); } else { fallidas += 1; console.log(`FALLA   ${nombre}${detalle ? ` -> ${detalle}` : ''}`); }
};
const titulo = (t) => console.log(`\n--- ${t} ---`);

async function pedir(metodo, ruta, { token, apikey = PUBLICA, cuerpo, tipo = 'application/json', cabeceras = {} } = {}) {
  const r = await fetch(BASE + ruta, {
    method: metodo,
    headers: { apikey, 'Content-Type': tipo, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...cabeceras },
    body: cuerpo === undefined ? undefined : (Buffer.isBuffer(cuerpo) ? cuerpo : JSON.stringify(cuerpo))
  });
  const texto = await r.text();
  let datos = null;
  try { datos = JSON.parse(texto); } catch { datos = texto; }
  return { s: r.status, d: datos, texto, tipo: r.headers.get('content-type') };
}
const servicio = (metodo, ruta, op = {}) => pedir(metodo, ruta, { ...op, apikey: SERVICIO, token: SERVICIO });
const breve = (x) => `${x.s} ${x.d?.code || x.d?.statusCode || ''} ${String(x.d?.message || x.texto).slice(0, 90)}`;
// Storage puede responder el rechazo con el estado HTTP o solo dentro del cuerpo.
const rechazoStorage = (x, ...codigos) => x.s >= 400 && (codigos.includes(String(x.d?.statusCode)) || codigos.includes(String(x.s)));

async function crearUsuario(rol) {
  const email = `${rol}-80-${crypto.randomBytes(4).toString('hex')}@gamaytalla.test`;
  const password = crypto.randomBytes(18).toString('base64url');
  const creado = await servicio('POST', '/auth/v1/admin/users', { cuerpo: { email, password, email_confirm: true } });
  if (creado.s !== 200) throw new Error(`Admin API no creó el usuario: ${breve(creado)}`);
  const sesion = await pedir('POST', '/auth/v1/token?grant_type=password', { cuerpo: { email, password } });
  if (sesion.s !== 200) throw new Error(`no se pudo iniciar sesión: ${breve(sesion)}`);
  return { id: creado.d.id, token: sesion.d.access_token };
}

const admin = await crearUsuario('admin');
const noAdmin = await crearUsuario('noadmin');
await servicio('POST', '/rest/v1/administradores', { cuerpo: { user_id: admin.id, nombre: 'admin ficticio local 80' } });

const P = crypto.randomUUID();
const V = crypto.randomUUID();
const T = crypto.randomUUID();
const objeto = (n) => `productos/${P}/${V}/${String(1700000000000 + n)}-${crypto.randomBytes(5).toString('hex')}.webp`;
const subidos = [];
const creadas = [];
const datos = (extra = {}) => ({
  id: P, nombre: 'SONDA 80', marca: 'Marca Ochenta', categoria: 'Running',
  variantes: [{ id: V, color: 'Negro', precio: 100000, precio_anterior: 0, activa: true, orden: 0,
    tallas: [{ id: T, talla: '40', activa: true, activa_original: true }], fotos: [] }],
  ...extra
});
const rpc = (fn, cuerpo, token) => pedir('POST', `/rest/v1/rpc/${fn}`, { token, cuerpo });
const subir = (nombre, token, { cuerpo = WEBP, tipo = 'image/webp', upsert = 'false' } = {}) =>
  pedir('POST', `/storage/v1/object/${BUCKET}/${nombre}`, { token, cuerpo, tipo, cabeceras: { 'x-upsert': upsert } });

try {
  // ==================================================================== A
  titulo('A · Funciones de guardado y estado por PostgREST');
  let x = await rpc('fn_admin_guardar_producto', { p_datos: datos(), p_version: null, p_operacion: crypto.randomUUID() });
  esperar('A el visitante no ejecuta fn_admin_guardar_producto (401)', x.s === 401 && x.d?.code === '42501', breve(x));
  x = await rpc('fn_admin_guardar_producto', { p_datos: datos(), p_version: null, p_operacion: crypto.randomUUID() }, noAdmin.token);
  esperar('A una sesión sin permiso recibe 403 y el mensaje de administrador', x.s === 403 && /administrador/.test(x.d?.message), breve(x));
  const op = crypto.randomUUID();
  x = await rpc('fn_admin_guardar_producto', { p_datos: datos(), p_version: null, p_operacion: op }, admin.token);
  esperar('A el administrador crea (200, aplicada, versión 1)', x.s === 200 && x.d?.estado === 'aplicada' && x.d?.version === 1, breve(x));
  x = await rpc('fn_admin_guardar_producto', { p_datos: datos(), p_version: null, p_operacion: op }, admin.token);
  esperar('A repetir la misma operación responde 200 «ya_aplicada»', x.s === 200 && x.d?.estado === 'ya_aplicada', breve(x));
  x = await rpc('fn_admin_guardar_producto', { p_datos: datos(), p_version: null, p_operacion: crypto.randomUUID() }, admin.token);
  esperar('A crear con un id existente: 409 PT409 con el motivo', x.s === 409 && x.d?.code === 'PT409' && /existe/.test(x.d?.details || ''), breve(x));
  x = await rpc('fn_admin_guardar_producto', { p_datos: datos({ nombre: 'OTRA' }), p_version: 7, p_operacion: crypto.randomUUID() }, admin.token);
  esperar('A versión desactualizada: 409 con la versión actual en details', x.s === 409 && JSON.parse(x.d?.details || '{}').version === 1, breve(x));
  x = await rpc('fn_admin_guardar_producto', { p_datos: datos({ nombre: '  ' }), p_version: 1, p_operacion: crypto.randomUUID() }, admin.token);
  esperar('A datos no válidos: 422 PT422 con un mensaje para la persona', x.s === 422 && x.d?.code === 'PT422' && /nombre del modelo/.test(x.d?.message), breve(x));
  x = await rpc('fn_admin_estado_producto', { p_id: crypto.randomUUID(), p_accion: 'publicar', p_version: 1, p_operacion: crypto.randomUUID() }, admin.token);
  esperar('A zapatilla inexistente: 404 PT404', x.s === 404 && x.d?.code === 'PT404', breve(x));
  x = await rpc('fn_admin_estado_producto', { p_id: P, p_accion: 'publicar', p_version: 1, p_operacion: crypto.randomUUID() }, admin.token);
  esperar('A publicar sin foto: 422 con lo que falta', x.s === 422 && /falta: una foto/.test(x.d?.message), breve(x));
  x = await rpc('fn_admin_estado_producto', { p_id: P, p_accion: 'publicar', p_version: 1, p_operacion: crypto.randomUUID() });
  esperar('A el visitante no publica (401)', x.s === 401, breve(x));

  // ==================================================================== B
  titulo('B · Storage: subir');
  const bueno = objeto(1);
  x = await subir(objeto(2), null);
  esperar('B el visitante no sube', x.s >= 400, breve(x));
  x = await subir(objeto(3), noAdmin.token);
  esperar('B una sesión sin permiso no sube (RLS)', rechazoStorage(x, '403', '400'), breve(x));
  x = await subir(bueno, admin.token);
  esperar('B el administrador sube un WebP con el nombre del panel', x.s === 200, breve(x));
  if (x.s === 200) subidos.push(bueno);
  x = await subir(bueno, admin.token);
  esperar('B el mismo nombre otra vez: duplicado, no se sobrescribe', rechazoStorage(x, '409', '400'), breve(x));
  x = await subir(bueno, admin.token, { upsert: 'true', cuerpo: Buffer.concat([WEBP, Buffer.from('x')]) });
  esperar('B ni con upsert: no hay política UPDATE', x.s >= 400, breve(x));
  x = await subir(`productos/${P}/${V}/foto.webp`, admin.token);
  esperar('B un nombre fuera del formato del panel se rechaza', rechazoStorage(x, '403', '400'), breve(x));
  x = await subir(`otra-carpeta/${P}.webp`, admin.token);
  esperar('B fuera de productos/ se rechaza', rechazoStorage(x, '403', '400'), breve(x));
  const png = objeto(4);
  x = await subir(png, admin.token, { tipo: 'image/png' });
  esperar('B otro tipo declarado (image/png) se rechaza', rechazoStorage(x, '415', '400'), breve(x));
  const grande = objeto(5);
  x = await subir(grande, admin.token, { cuerpo: Buffer.concat([WEBP, Buffer.alloc(1048576, 1)]) });
  esperar('B más de 1 MiB se rechaza', rechazoStorage(x, '413', '400'), breve(x));
  const publica = await fetch(`${BASE}/storage/v1/object/public/${BUCKET}/${bueno}`);
  esperar('B la URL pública se lee sin sesión y es image/webp', publica.status === 200 && publica.headers.get('content-type') === 'image/webp', String(publica.status));

  titulo('B · Storage: listar');
  const listar = (token, apikey = PUBLICA) => pedir('POST', `/storage/v1/object/list/${BUCKET}`, { token, apikey, cuerpo: { prefix: `productos/${P}/${V}/`, limit: 50 } });
  x = await listar(null);
  esperar('B el visitante no lista los archivos', x.s >= 400 || (Array.isArray(x.d) && x.d.length === 0), breve(x));
  x = await listar(noAdmin.token);
  esperar('B una sesión sin permiso no lista los archivos', Array.isArray(x.d) && x.d.length === 0, breve(x));
  x = await listar(admin.token);
  esperar('B el administrador los lista', Array.isArray(x.d) && x.d.some((o) => bueno.endsWith(o.name)), breve(x));

  // ==================================================================== C
  titulo('C · Galería, vista pública y borrado protegido');
  const ruta = `${BASE}/storage/v1/object/public/${BUCKET}/${bueno}`;
  const conFoto = datos();
  conFoto.variantes[0].fotos = [{ ruta, alt: 'Lateral' }];
  x = await rpc('fn_admin_guardar_producto', { p_datos: conFoto, p_version: 1, p_operacion: crypto.randomUUID() }, admin.token);
  esperar('C se guarda la galería con la foto subida', x.s === 200 && x.d?.version === 2, breve(x));
  const sinSubir = datos();
  sinSubir.variantes[0].fotos = [{ ruta: `${BASE}/storage/v1/object/public/${BUCKET}/${objeto(9)}` }];
  x = await rpc('fn_admin_guardar_producto', { p_datos: sinSubir, p_version: 2, p_operacion: crypto.randomUUID() }, admin.token);
  esperar('C una foto que no está en Storage no se guarda (422)', x.s === 422 && /no terminó de subirse/.test(x.d?.message), breve(x));
  x = await rpc('fn_admin_estado_producto', { p_id: P, p_accion: 'publicar', p_version: 2, p_operacion: crypto.randomUUID() }, admin.token);
  esperar('C completa: se publica', x.s === 200 && x.d?.activo === true, breve(x));
  x = await pedir('GET', `/rest/v1/catalogo_publico?select=nombre,variantes&nombre=eq.SONDA%2080`);
  const v0 = x.d?.[0]?.variantes?.[0];
  esperar('C la vista pública la muestra con su foto', x.s === 200 && v0?.imagenes?.[0] === ruta, breve(x));
  esperar('C y su talla sigue por revisar: publicar no confirma nada', v0?.tallas?.[0]?.estado === 'POR_REVISAR', JSON.stringify(v0?.tallas));

  const borrar = (token, nombre) => pedir('DELETE', `/storage/v1/object/${BUCKET}`, { token, cuerpo: { prefixes: [nombre] } });
  x = await borrar(admin.token, bueno);
  esperar('C la foto en uso no se borra, ni siendo administrador', x.s === 200 && Array.isArray(x.d) && x.d.length === 0, breve(x));
  esperar('C y sigue publicada', (await fetch(`${BASE}/storage/v1/object/public/${BUCKET}/${bueno}`)).status === 200);
  x = await rpc('fn_admin_guardar_producto', { p_datos: datos(), p_version: 3, p_operacion: crypto.randomUUID() }, admin.token);
  esperar('C quitarla de la galería (la fila)', x.s === 200, breve(x));
  esperar('C el archivo sigue en Storage tras quitarlo de la galería', (await fetch(`${BASE}/storage/v1/object/public/${BUCKET}/${bueno}`)).status === 200);
  x = await borrar(noAdmin.token, bueno);
  esperar('C una sesión sin permiso no borra', Array.isArray(x.d) ? x.d.length === 0 : x.s >= 400, breve(x));
  x = await borrar(admin.token, bueno);
  esperar('C sin referencias, el administrador lo borra por la API', x.s === 200 && Array.isArray(x.d) && x.d.length === 1, breve(x));
  if (x.s === 200 && x.d?.length === 1) subidos.splice(subidos.indexOf(bueno), 1);
  esperar('C ya no se sirve', (await fetch(`${BASE}/storage/v1/object/public/${BUCKET}/${bueno}`)).status >= 400);
  // ==================================================================== D
  titulo('D · Publicar exige UN MISMO color visible completo');
  const V2 = crypto.randomUUID();
  const V3 = crypto.randomUUID();
  const fotoV2 = `productos/${P}/${V2}/1700000000020-${crypto.randomBytes(5).toString('hex')}.webp`;
  const fotoV3 = `productos/${P}/${V3}/1700000000021-${crypto.randomBytes(5).toString('hex')}.webp`;
  for (const o of [fotoV2, fotoV3]) {
    const y = await subir(o, admin.token);
    if (y.s === 200) subidos.push(o);
  }
  const url = (o) => `${BASE}/storage/v1/object/public/${BUCKET}/${o}`;
  let version = (await servicio('GET', `/rest/v1/productos?select=version&id=eq.${P}`)).d[0].version;
  x = await rpc('fn_admin_estado_producto', { p_id: P, p_accion: 'ocultar', p_version: version, p_operacion: crypto.randomUUID() }, admin.token);
  version = x.d?.version ?? version;
  // Color V (talla, sin foto), V2 (foto, sin talla) visibles; V3 completo pero oculto.
  const partido = datos();
  partido.variantes.push(
    { id: V2, color: 'Foto sin talla', precio: 1000, activa: true, orden: 1, tallas: [], fotos: [{ ruta: url(fotoV2) }] },
    { id: V3, color: 'Completo oculto', precio: 1000, activa: false, orden: 2, tallas: [{ id: crypto.randomUUID(), talla: '41', activa: true }], fotos: [{ ruta: url(fotoV3) }] });
  x = await rpc('fn_admin_guardar_producto', { p_datos: partido, p_version: version, p_operacion: crypto.randomUUID() }, admin.token);
  esperar('D se guarda con la foto y la talla en colores distintos', x.s === 200, breve(x));
  version = x.d?.version ?? version;
  x = await rpc('fn_admin_estado_producto', { p_id: P, p_accion: 'publicar', p_version: version, p_operacion: crypto.randomUUID() }, admin.token);
  esperar('D foto en un color y talla en otro: 422 con lo que falta', x.s === 422 && /un mismo color visible/.test(x.d?.message), breve(x));
  x = await pedir('GET', `/rest/v1/catalogo_publico?select=nombre&nombre=eq.SONDA%2080`);
  esperar('D sigue oculta para el visitante', x.s === 200 && x.d.length === 0, breve(x));

  titulo('D · Una edición antigua no deshace la reactivación de 15B');
  // Se desactiva T desde el «editor» (cambio real) y 15B la reactiva por su cuenta.
  const tallasV3 = (await servicio('GET', `/rest/v1/tallas?select=id&variante_id=eq.${V3}`)).d;
  const conActivas = (t40, original40) => {
    const d = JSON.parse(JSON.stringify(partido));
    d.variantes[0].tallas = [{ id: T, talla: '40', activa: t40, activa_original: original40 }];
    d.variantes[2].tallas = tallasV3.map((t) => ({ id: t.id, talla: '41', activa: true, activa_original: true }));
    return d;
  };
  x = await rpc('fn_admin_guardar_producto', { p_datos: conActivas(false, true), p_version: version, p_operacion: crypto.randomUUID() }, admin.token);
  version = x.d?.version ?? version;
  esperar('D la persona desactiva la talla', x.s === 200 && (await servicio('GET', `/rest/v1/tallas?select=activa&id=eq.${T}`)).d[0].activa === false, breve(x));
  x = await rpc('fn_confirmar_por_proveedor', { p_talla_id: T, p_vigencia_horas: 48 }, admin.token);
  esperar('D «Confirmó el proveedor» la reactiva', x.s === 200, breve(x));
  const antes = (await servicio('GET', `/rest/v1/tallas?select=activa,estado,vigencia_desde,vence_en,confirmado_en,publicado_en,origen&id=eq.${T}`)).d[0];
  // El formulario antiguo (abierto con la talla desactivada) solo cambia el nombre.
  const viejo = conActivas(false, false);
  viejo.nombre = 'SONDA 80 EDITADA';
  x = await rpc('fn_admin_guardar_producto', { p_datos: viejo, p_version: version, p_operacion: crypto.randomUUID() }, admin.token);
  const despues = (await servicio('GET', `/rest/v1/tallas?select=activa,estado,vigencia_desde,vence_en,confirmado_en,publicado_en,origen&id=eq.${T}`)).d[0];
  esperar('D el guardado se aplica y avisa de la talla conservada', x.s === 200 && x.d?.tallas_conservadas?.[0]?.id === T, breve(x));
  esperar('D la reactivación de 15B se conserva, con su estado y sus fechas', JSON.stringify(despues) === JSON.stringify(antes) && despues.activa === true,
    `${JSON.stringify(antes)} -> ${JSON.stringify(despues)}`);
  version = x.d?.version ?? version;
  const sinOriginal = conActivas(true, true);
  delete sinOriginal.variantes[0].tallas[0].activa_original;
  x = await rpc('fn_admin_guardar_producto', { p_datos: sinOriginal, p_version: version, p_operacion: crypto.randomUUID() }, admin.token);
  esperar('D una talla existente sin su valor original: 422', x.s === 422 && /estado original/.test(x.d?.message), breve(x));

  titulo('D · Al completar un mismo color, se publica');
  const completo = conActivas(true, true);
  completo.nombre = 'SONDA 80';
  completo.variantes[1].tallas = [{ id: crypto.randomUUID(), talla: '42', activa: true }];
  x = await rpc('fn_admin_guardar_producto', { p_datos: completo, p_version: version, p_operacion: crypto.randomUUID() }, admin.token);
  version = x.d?.version ?? version;
  x = await rpc('fn_admin_estado_producto', { p_id: P, p_accion: 'publicar', p_version: version, p_operacion: crypto.randomUUID() }, admin.token);
  esperar('D con un color visible que tiene foto y talla activa, se publica', x.s === 200 && x.d?.activo === true, breve(x));
  creadas.push(V2, V3);
  version = x.d?.version ?? version;

  // ==================================================================== E
  titulo('E · Etapa 16.2: códigos editables, clave pública inmutable y mayúsculas');
  // El formulario tal como lo leería el panel ahora (todos los colores y tallas).
  const formulario = async () => {
    const p = (await servicio('GET', `/rest/v1/productos?select=nombre,marca,categoria,variantes(id,color,precio,precio_anterior,activa,orden,fotos(ruta,orden))&id=eq.${P}`)).d[0];
    const tallas = (await servicio('GET', `/rest/v1/tallas?select=id,variante_id,talla,activa&variante_id=in.(${p.variantes.map((v) => v.id).join(',')})`)).d;
    return { id: P, nombre: p.nombre, marca: p.marca, categoria: p.categoria,
      variantes: p.variantes.sort((a, b) => a.orden - b.orden).map((v) => ({ id: v.id, color: v.color, precio: v.precio, precio_anterior: v.precio_anterior, activa: v.activa, orden: v.orden,
        tallas: tallas.filter((t) => t.variante_id === v.id).map((t) => ({ id: t.id, talla: t.talla, activa: t.activa, activa_original: t.activa })),
        fotos: v.fotos.sort((a, b) => a.orden - b.orden).map((f) => ({ ruta: f.ruta })) })) };
  };
  x = await pedir('PATCH', `/rest/v1/productos?id=eq.${P}`, { token: admin.token, cuerpo: { clave_catalogo: 'otra-clave' } });
  esperar('E el administrador no puede cambiar la clave pública: 422', x.s === 422 && /no se puede cambiar/.test(x.d?.message), breve(x));
  x = await pedir('PATCH', `/rest/v1/productos?id=eq.${P}`, { cuerpo: { codigo_interno: 'DEL-VISITANTE' } });
  esperar('E el visitante no puede cambiar códigos', [401, 403].includes(x.s), breve(x));
  let form = await formulario();
  form.codigo_interno = ' sonda-80-x ';
  form.nombre = 'sonda 80';
  form.marca = 'marca ochenta';
  form.variantes[0].codigo_variante = 'sonda-80-negro';
  x = await rpc('fn_admin_guardar_producto', { p_datos: form, p_version: version, p_operacion: crypto.randomUUID() }, admin.token);
  esperar('E renombrar ambos códigos: 200 con los códigos normalizados', x.s === 200 && x.d?.codigo_interno === 'SONDA-80-X' && x.d?.codigos_editables === true
    && x.d?.variantes?.find((v) => v.id === V)?.codigo_variante === 'SONDA-80-NEGRO', breve(x));
  version = x.d?.version ?? version;
  x = await pedir('GET', `/rest/v1/catalogo_publico?id=eq.${P}`);
  const pub = x.d?.[0];
  esperar('E la tienda ve el mismo id (UUID), los códigos nuevos y los nombres en mayúsculas',
    x.s === 200 && pub?.codigoInterno === 'SONDA-80-X' && pub?.nombre === 'SONDA 80' && pub?.marca === 'MARCA OCHENTA'
    && pub?.variantes?.some((v) => v.id === V && v.codigoVariante === 'SONDA-80-NEGRO' && v.color === 'NEGRO'), breve(x));
  form = await formulario();
  form.variantes[0].codigo_variante = 'MISMO-80';
  form.variantes[1].codigo_variante = 'mismo-80';
  x = await rpc('fn_admin_guardar_producto', { p_datos: form, p_version: version, p_operacion: crypto.randomUUID() }, admin.token);
  esperar('E dos colores con el mismo código: 422 y mensaje claro', x.s === 422 && /mismo código/.test(x.d?.message), breve(x));
  form = await formulario();
  form.codigo_interno = '';
  x = await rpc('fn_admin_guardar_producto', { p_datos: form, p_version: version, p_operacion: crypto.randomUUID() }, admin.token);
  esperar('E vaciar el código al editar: 422', x.s === 422 && /no puede quedar vacío/.test(x.d?.message), breve(x));
  x = await servicio('GET', `/rest/v1/productos?select=codigo_interno,version&id=eq.${P}`);
  esperar('E los rechazos no cambiaron nada', x.d?.[0]?.codigo_interno === 'SONDA-80-X' && x.d?.[0]?.version === version, breve(x));
} finally {
  titulo('Limpieza (service_role)');
  const nombres = [...subidos];
  for (const variante of [V, ...creadas]) {
    const restos = await servicio('POST', `/storage/v1/object/list/${BUCKET}`, { cuerpo: { prefix: `productos/${P}/${variante}/`, limit: 100 } });
    if (Array.isArray(restos.d)) nombres.push(...restos.d.map((o) => `productos/${P}/${variante}/${o.name}`));
  }
  nombres.splice(0, nombres.length, ...new Set(nombres));
  if (nombres.length) {
    const x = await servicio('DELETE', `/storage/v1/object/${BUCKET}`, { cuerpo: { prefixes: nombres } });
    esperar('limpieza: archivos de prueba', x.s === 200, breve(x));
  }
  const todas = [V, ...creadas].join(',');
  for (const [r, nombre] of [
    [`/rest/v1/fotos?variante_id=in.(${todas})`, 'fotos'],
    [`/rest/v1/tallas?variante_id=in.(${todas})`, 'tallas'],
    [`/rest/v1/variantes?producto_id=eq.${P}`, 'variantes'],
    [`/rest/v1/productos?id=eq.${P}`, 'productos'],
    [`/rest/v1/administradores?user_id=eq.${admin.id}`, 'administrador ficticio']
  ]) {
    const x = await servicio('DELETE', r);
    esperar(`limpieza: ${nombre}`, x.s === 204, breve(x));
  }
  for (const u of [admin, noAdmin]) await servicio('DELETE', `/auth/v1/admin/users/${u.id}`);
  const resto = await servicio('GET', `/rest/v1/productos?select=id&id=eq.${P}`);
  esperar('limpieza: no queda el producto de prueba', resto.s === 200 && resto.d.length === 0, breve(resto));
}

console.log(`\nRESULTADO: ${correctas} correctas · ${fallidas} fallidas`);
process.exit(fallidas ? 1 : 0);
