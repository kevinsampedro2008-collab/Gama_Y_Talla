/* Etapa 14f.1 · Pruebas de acceso por HTTP real: Kong + PostgREST + Auth (GoTrue).
 * Etapa 14f.2 · Tallas con coma y fracción, tallas que no se borran (se desactivan) y fechas futuras.
 *
 * SOLO para el stack local desechable (`supabase start`). Se niega a ejecutarse si la API
 * no está en 127.0.0.1. Crea usuarios y datos FICTICIOS y borra los datos al terminar.
 * Las sesiones son de verdad: las emite Auth, no se fabrican.
 *
 * Limpieza: desde 14f.2 ningún rol de la aplicación borra tallas, así que los datos de prueba
 * los borra service_role (mantenimiento privilegiado) en el bloque final, no el administrador.
 *
 *   npx --yes supabase@3.0.0 start -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
 *   node supabase/pruebas/50_postgrest_local.mjs
 *
 * Nunca imprime claves, contraseñas ni tokens.
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
const BASE = entorno.API_URL;
const PUBLICA = entorno.PUBLISHABLE_KEY;
const SERVICIO = entorno.SERVICE_ROLE_KEY;

const sufijo = crypto.randomBytes(4).toString('hex');
const CENTINELA = `NOTA-INTERNA-CENTINELA-${sufijo}`;
const MIGRADO = `MIGRADO-CENTINELA-${sufijo}`;
const INTERNAS = ['publicado_en', 'registrado_en', 'confirmado_en', 'vigencia_horas', 'origen', 'nota', 'estado_migrado', 'creado_en', 'actualizado_en'];
const PUBLICAS = 'id,variante_id,talla,estado,vigencia_desde,vence_en,activa';
const COLUMNAS_VISTA = ['id', 'codigoInterno', 'referencia', 'nombre', 'marca', 'categoria', 'descripcion', 'segmento', 'destacado', 'nuevoIngreso', 'orden', 'variantes', 'publico'];

let correctas = 0;
let fallidas = 0;
let omitidas = 0;
let avisos = 0;
const esperar = (nombre, ok, detalle = '') => {
  if (ok) { correctas += 1; console.log(`OK      ${nombre}${process.env.SONDA_DETALLE && detalle ? ` -> ${detalle}` : ""}`); } else { fallidas += 1; console.log(`FALLA   ${nombre}${detalle ? ` -> ${detalle}` : ''}`); }
};
const omitir = (nombre, motivo) => { omitidas += 1; console.log(`OMITIDA ${nombre} -> ${motivo}`); };
const titulo = (t) => console.log(`\n--- ${t} ---`);

async function pedir(metodo, ruta, { token, apikey = PUBLICA, cuerpo, prefer } = {}) {
  const r = await fetch(BASE + ruta, {
    method: metodo,
    headers: {
      apikey,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  });
  const texto = await r.text();
  let datos = null;
  try { datos = JSON.parse(texto); } catch { datos = texto; }
  return { s: r.status, d: datos, texto };
}
const servicio = (metodo, ruta, op = {}) => pedir(metodo, ruta, { ...op, apikey: SERVICIO, token: SERVICIO });
const REST = '/rest/v1';
const breve = (x) => `${x.s} ${x.d?.code || ''} ${String(x.d?.message || (Array.isArray(x.d) ? `${x.d.length} filas` : x.texto)).slice(0, 80)}`;
const denegado = (x) => (x.s === 401 || x.s === 403) && x.d?.code === '42501';
const sinFilas = (x) => x.s === 200 && Array.isArray(x.d) && x.d.length === 0;

// ------------------------------------------------------------ preparación
async function crearUsuario(rol) {
  const email = `${rol}-${sufijo}@gamaytalla.test`;
  const password = crypto.randomBytes(18).toString('base64url');
  const creado = await servicio('POST', '/auth/v1/admin/users', { cuerpo: { email, password, email_confirm: true } });
  if (creado.s !== 200) throw new Error(`Admin API no creó el usuario: ${breve(creado)}`);
  const sesion = await pedir('POST', '/auth/v1/token?grant_type=password', { cuerpo: { email, password } });
  if (sesion.s !== 200) throw new Error(`no se pudo iniciar sesión: ${breve(sesion)}`);
  return { id: creado.d.id, token: sesion.d.access_token };
}

const admin = await crearUsuario('admin');
const noAdmin = await crearUsuario('noadmin');
const alta = await servicio('POST', `${REST}/administradores`, { cuerpo: { user_id: admin.id, nombre: 'admin ficticio local' } });
if (alta.s !== 201) throw new Error(`no se pudo registrar el administrador: ${breve(alta)}`);

const prod = await servicio('POST', `${REST}/productos?select=id,codigo_interno`, { cuerpo: { nombre: `SONDA ${sufijo}`, marca: 'Prueba', orden: 9999 }, prefer: 'return=representation' });
const vari = await servicio('POST', `${REST}/variantes?select=id`, { cuerpo: { producto_id: prod.d[0].id, color: 'Negro', precio: 1000 }, prefer: 'return=representation' });
const tallasCreadas = await servicio('POST', `${REST}/tallas?select=id,talla`, {
  cuerpo: [
    { variante_id: vari.d[0].id, talla: '40', nota: CENTINELA, estado_migrado: MIGRADO, publicado_en: '2020-02-02T02:02:02Z', confirmado_en: '2020-03-03T03:03:03Z' },
    { variante_id: vari.d[0].id, talla: '41', nota: null, estado_migrado: null, publicado_en: null, confirmado_en: null }
  ],
  prefer: 'return=representation'
});
const TALLA = tallasCreadas.d.find((t) => t.talla === '40').id;
const TALLA2 = tallasCreadas.d.find((t) => t.talla === '41').id;
const activos = (await servicio('GET', `${REST}/productos?select=id&activo=is.true`)).d.length;

// Lo que el servicio ve de la talla, para comprobar que nadie la cambió.
const huella = async () => {
  const x = await servicio('GET', `${REST}/tallas?select=estado,nota,estado_migrado,vigencia_desde,activa&id=eq.${TALLA}`);
  return JSON.stringify(x.d);
};

const INTENTOS_LECTURA = [
  ['filtro por nota', `/tallas?select=id&nota=eq.${CENTINELA}`],
  ['filtro por estado_migrado', `/tallas?select=id&estado_migrado=eq.${MIGRADO}`],
  ['orden por nota', '/tallas?select=id&order=nota'],
  ['filtro por publicado_en', '/tallas?select=id&publicado_en=gte.2000-01-01'],
  ['select=*', '/tallas?select=*'],
  ['sin select', '/tallas'],
  ['fila entera como JSON (to_jsonb no disponible)', '/tallas?select=nota::text'],
  ['incrustada desde variantes', '/variantes?select=id,tallas(nota)'],
  ['incrustada desde productos', '/productos?select=id,variantes(tallas(estado_migrado))'],
  ['incrustada con filtro', `/variantes?select=id,tallas!inner(id)&tallas.nota=eq.${CENTINELA}`]
];

// Lo que crea el administrador durante la prueba, para limpiarlo al final.
const creados = { variantes: [], productos: [] };

try {
  // ==================================================================== A
  titulo('A · Visitante (anon): solo la clave publicable, como la tienda');
  const catalogo = await pedir('GET', `${REST}/catalogo_publico?order=orden`);
  esperar('A lee catalogo_publico', catalogo.s === 200 && catalogo.d.length === activos, breve(catalogo));
  esperar('A la vista tiene exactamente sus 13 columnas, en orden (16.3: publico al final)', JSON.stringify(Object.keys(catalogo.d[0] || {})) === JSON.stringify(COLUMNAS_VISTA), Object.keys(catalogo.d[0] || {}).join(','));
  esperar('A la vista no contiene ningún dato interno', !catalogo.texto.includes(CENTINELA) && !catalogo.texto.includes(MIGRADO) && !/"(nota|estado_migrado|publicado_en|confirmado_en|registrado_en|vigencia_horas|origen)"/.test(catalogo.texto));
  for (const [t, c] of [['productos', 'id,nombre'], ['variantes', 'id,color'], ['tallas', PUBLICAS], ['fotos', 'id,ruta']]) {
    const x = await pedir('GET', `${REST}/${t}?select=${c}&limit=1`);
    esperar(`A lee las columnas públicas de ${t}`, x.s === 200 && Array.isArray(x.d), breve(x));
  }
  for (const c of INTERNAS) {
    const x = await pedir('GET', `${REST}/tallas?select=${c}&limit=1`);
    esperar(`A denegado: tallas.${c}`, denegado(x), breve(x));
  }
  for (const [nombre, ruta] of INTENTOS_LECTURA) {
    const x = await pedir('GET', REST + ruta);
    esperar(`A denegado: ${nombre}`, denegado(x), breve(x));
  }
  for (const t of ['historial', 'administradores', 'configuracion']) {
    const x = await pedir('GET', `${REST}/${t}?select=*`);
    esperar(`A denegado: tabla ${t}`, denegado(x), breve(x));
  }
  for (const [fn, args] of [['fn_es_administrador', {}], ['fn_admin_tallas', {}], ['fn_confirmar_por_proveedor', { p_talla_id: TALLA }], ['fn_confirmar_por_publicacion', { p_talla_id: TALLA, p_publicado_en: new Date().toISOString() }], ['fn_marcar_agotada', { p_talla_id: TALLA }], ['fn_lote_actual', {}]]) {
    const x = await pedir('POST', `${REST}/rpc/${fn}`, { cuerpo: args });
    esperar(`A denegado: rpc ${fn}`, denegado(x), breve(x));
  }
  for (const [nombre, x] of [
    ['insertar producto', await pedir('POST', `${REST}/productos`, { cuerpo: { nombre: 'PIRATA', marca: 'X' } })],
    ['cambiar disponibilidad', await pedir('PATCH', `${REST}/tallas?id=eq.${TALLA}`, { cuerpo: { estado: 'CONFIRMADA' } })],
    ['borrar tallas', await pedir('DELETE', `${REST}/tallas?id=eq.${TALLA}`)],
    ['borrar fotos', await pedir('DELETE', `${REST}/fotos?orden=gte.0`)],
    ['nombrarse administrador', await pedir('POST', `${REST}/administradores`, { cuerpo: { user_id: crypto.randomUUID() } })]
  ]) esperar(`A denegado: ${nombre}`, denegado(x), breve(x));

  // PostgREST oculta las tablas sin privilegios, pero de las visibles describe TODAS las
  // columnas. Son nombres, no datos: no lo controla una migración y se informa como aviso.
  const raiz = await pedir('GET', `${REST}/`);
  if (raiz.s === 200) {
    esperar('A OpenAPI no contiene ningún valor interno', !raiz.texto.includes(CENTINELA) && !raiz.texto.includes(MIGRADO));
    esperar('A OpenAPI no anuncia funciones privadas', !/fn_lote_actual|fn_admin_tallas|fn_confirmar|fn_marcar_agotada|fn_es_administrador/.test(raiz.texto));
    esperar('A OpenAPI no describe las tablas privadas', !/"\/(historial|administradores|configuracion)"/.test(raiz.texto));
    if (/"estado_migrado"/.test(raiz.texto)) { avisos += 1; console.log('AVISO   A OpenAPI describe los NOMBRES de las columnas internas de tallas (sin valores)'); }
  } else omitir('A descripción OpenAPI', `no disponible para anon en este entorno (${raiz.s})`);

  // GraphQL es otra puerta a las mismas tablas. Si la extensión no está activa, la prueba
  // se declara omitida: responder 200 con un error no demuestra nada. Con ella activa hay
  // un control positivo, para que «no devuelve notas» no pueda pasar en vacío.
  const consultaGql = { query: '{ tallasCollection(first: 200) { edges { node { id nota estado_migrado } } } }' };
  const controlGql = { query: '{ tallasCollection(first: 1) { edges { node { id talla } } } }' };
  const gql = await pedir('POST', '/graphql/v1', { cuerpo: consultaGql });
  const gqlActivo = gql.s === 200 && !/extension is not enabled/.test(gql.texto);
  if (gqlActivo) {
    const control = await pedir('POST', '/graphql/v1', { cuerpo: controlGql });
    esperar('A GraphQL responde: lee una columna pública (control)', control.d?.data?.tallasCollection?.edges?.length === 1, control.texto.slice(0, 120));
    esperar('A GraphQL no entrega nota ni estado_migrado', !gql.texto.includes(CENTINELA) && !gql.texto.includes(MIGRADO) && !gql.d?.data, gql.texto.slice(0, 120));
  } else omitir('A GraphQL', 'pg_graphql no activo en este entorno');

  // ==================================================================== B
  titulo('B · Con sesión, sin ser administrador');
  const tk = { token: noAdmin.token };
  const antes = await huella();
  const quien = await pedir('POST', `${REST}/rpc/fn_es_administrador`, { ...tk, cuerpo: {} });
  esperar('B fn_es_administrador responde falso', quien.s === 200 && quien.d === false, breve(quien));
  for (const c of INTERNAS) {
    const x = await pedir('GET', `${REST}/tallas?select=${c}&limit=1`, tk);
    esperar(`B denegado: tallas.${c}`, denegado(x), breve(x));
  }
  for (const [nombre, ruta] of INTENTOS_LECTURA) {
    const x = await pedir('GET', REST + ruta, tk);
    esperar(`B denegado: ${nombre}`, denegado(x), breve(x));
  }
  for (const [t, c] of [['productos', 'id,nombre'], ['variantes', 'id,color'], ['tallas', PUBLICAS], ['fotos', 'id,ruta']]) {
    const x = await pedir('GET', `${REST}/${t}?select=${c}`, tk);
    esperar(`B cero filas: ${t}`, sinFilas(x), breve(x));
  }
  const vistaB = await pedir('GET', `${REST}/catalogo_publico`, tk);
  esperar('B cero filas y sin error: catalogo_publico', sinFilas(vistaB), breve(vistaB));
  for (const t of ['historial', 'administradores', 'configuracion']) {
    const x = await pedir('GET', `${REST}/${t}?select=*`, tk);
    esperar(`B cero filas: ${t}`, sinFilas(x), breve(x));
    esperar(`B ${t} no filtra datos`, !x.texto.includes(CENTINELA) && !x.texto.includes(MIGRADO));
  }
  for (const [fn, args, patron] of [
    ['fn_confirmar_por_proveedor', { p_talla_id: TALLA }, /Solo un administrador/],
    ['fn_confirmar_por_publicacion', { p_talla_id: TALLA, p_publicado_en: new Date().toISOString() }, /Solo un administrador/],
    ['fn_marcar_agotada', { p_talla_id: TALLA, p_nota: 'pirata' }, /Solo un administrador/],
    ['fn_admin_tallas', {}, /Solo un administrador/]
  ]) {
    const x = await pedir('POST', `${REST}/rpc/${fn}`, { ...tk, cuerpo: args });
    esperar(`B rechazado: rpc ${fn}`, x.s >= 400 && patron.test(x.d?.message || '') && !x.texto.includes(CENTINELA), breve(x));
  }
  for (const fn of ['fn_lote_actual', 'fn_marcar_actualizado', 'fn_tallas_antes_de_escribir', 'fn_registrar_historial']) {
    const x = await pedir('POST', `${REST}/rpc/${fn}`, { ...tk, cuerpo: {} });
    esperar(`B no alcanzable: rpc ${fn}`, denegado(x) || x.s === 404, breve(x));
  }
  const insertar = await pedir('POST', `${REST}/productos`, { ...tk, cuerpo: { nombre: 'PIRATA', marca: 'X' } });
  esperar('B rechazado: insertar producto', denegado(insertar), breve(insertar));
  const parche = await pedir('PATCH', `${REST}/tallas?id=eq.${TALLA}&select=id`, { ...tk, cuerpo: { estado: 'AGOTADA', nota: 'pirata' }, prefer: 'return=representation' });
  esperar('B cambiar disponibilidad no afecta a ninguna fila', sinFilas(parche), breve(parche));
  const borrar = await pedir('DELETE', `${REST}/tallas?id=eq.${TALLA2}&select=id`, { ...tk, prefer: 'return=representation' });
  esperar('B rechazado: borrar tallas (14f.2; antes, cero filas)', denegado(borrar), breve(borrar));
  const ascenso = await pedir('POST', `${REST}/administradores`, { ...tk, cuerpo: { user_id: noAdmin.id } });
  esperar('B rechazado: nombrarse administrador', denegado(ascenso), breve(ascenso));
  const hist = await pedir('POST', `${REST}/historial`, { ...tk, cuerpo: { tabla: 'x', fila_id: TALLA, operacion: 'INSERT' } });
  esperar('B rechazado: escribir en el historial', denegado(hist), breve(hist));
  const conf = await pedir('PATCH', `${REST}/configuracion?clave=eq.vigencia_horas_predeterminada&select=clave`, { ...tk, cuerpo: { valor: '60' }, prefer: 'return=representation' });
  esperar('B cambiar configuración no afecta a ninguna fila', sinFilas(conf), breve(conf));
  esperar('B los datos no cambiaron tras todos los intentos', (await huella()) === antes);
  if (gqlActivo) {
    const gqlB = await pedir('POST', '/graphql/v1', { ...tk, cuerpo: consultaGql });
    esperar('B GraphQL no entrega nota ni estado_migrado', !gqlB.texto.includes(CENTINELA) && !gqlB.texto.includes(MIGRADO) && !gqlB.d?.data, gqlB.texto.slice(0, 120));
    const hist2 = await pedir('POST', '/graphql/v1', { ...tk, cuerpo: { query: '{ historialCollection(first: 5) { edges { node { fila_nueva } } } }' } });
    esperar('B GraphQL no entrega el historial', !hist2.texto.includes(CENTINELA) && !hist2.texto.includes(MIGRADO), hist2.texto.slice(0, 120));
  } else omitir('B GraphQL', 'pg_graphql no activo en este entorno');

  // ==================================================================== C
  titulo('C · Administrador legítimo');
  const ta = { token: admin.token };
  const soy = await pedir('POST', `${REST}/rpc/fn_es_administrador`, { ...ta, cuerpo: {} });
  esperar('C fn_es_administrador responde verdadero', soy.s === 200 && soy.d === true, breve(soy));
  const internos = await pedir('GET', `${REST}/rpc/fn_admin_tallas?select=id,${INTERNAS.join(',')}&id=eq.${TALLA}`, ta);
  esperar('C consulta notas internas por fn_admin_tallas', internos.s === 200 && internos.d[0]?.nota === CENTINELA, breve(internos));
  esperar('C consulta estado_migrado y fechas internas', internos.d?.[0]?.estado_migrado === MIGRADO && Boolean(internos.d?.[0]?.publicado_en) && Boolean(internos.d?.[0]?.confirmado_en) && internos.d?.[0]?.vigencia_horas === 48);
  const porVariante = await pedir('POST', `${REST}/rpc/fn_admin_tallas?select=talla`, { ...ta, cuerpo: { p_variante_id: vari.d[0].id } });
  esperar('C fn_admin_tallas filtra por variante, en orden', porVariante.s === 200 && JSON.stringify(porVariante.d) === '[{"talla":"40"},{"talla":"41"}]', breve(porVariante));
  const directo = await pedir('GET', `${REST}/tallas?select=nota&limit=1`, ta);
  esperar('C por la tabla la columna sigue cerrada: el acceso es solo por la función', denegado(directo), breve(directo));
  const inactivos = await pedir('GET', `${REST}/tallas?select=${PUBLICAS}&id=eq.${TALLA}`, ta);
  esperar('C lee las columnas públicas de tallas', inactivos.s === 200 && inactivos.d.length === 1, breve(inactivos));
  for (const t of ['historial', 'administradores', 'configuracion']) {
    const x = await pedir('GET', `${REST}/${t}?select=*&limit=5`, ta);
    esperar(`C lee ${t}`, x.s === 200 && x.d.length > 0, breve(x));
  }
  const vistaAdmin = await pedir('GET', `${REST}/catalogo_publico?order=orden`, ta);
  esperar('C la vista devuelve lo mismo que al visitante', vistaAdmin.texto === catalogo.texto);

  const p1 = await pedir('POST', `${REST}/rpc/fn_confirmar_por_proveedor`, { ...ta, cuerpo: { p_talla_id: TALLA } });
  esperar('C confirma disponibilidad (proveedor), 48 h', p1.s === 200 && p1.d.estado === 'CONFIRMADA' && (new Date(p1.d.vence_en) - new Date(p1.d.vigencia_desde)) / 36e5 === 48, breve(p1));
  // Etapa 16.2: el «id» público es la clave inmutable (para un producto nuevo, su UUID); el código
  // comercial va en «codigoInterno» y se puede editar sin romper carritos.
  const vistaTrasConfirmar = await pedir('GET', `${REST}/catalogo_publico?id=eq.${encodeURIComponent(prod.d[0].id)}`);
  esperar('C el visitante ve la talla DISPONIBLE', vistaTrasConfirmar.d?.[0]?.variantes?.[0]?.tallasDisponibles?.includes('40'), breve(vistaTrasConfirmar));
  const p2 = await pedir('POST', `${REST}/rpc/fn_confirmar_por_publicacion`, { ...ta, cuerpo: { p_talla_id: TALLA, p_publicado_en: new Date(Date.now() - 36e5).toISOString() } });
  esperar('C confirma disponibilidad (publicación)', p2.s === 200 && p2.d.origen === 'publicacion' && p2.d.vigencia_desde === p2.d.publicado_en, breve(p2));
  const p3 = await pedir('POST', `${REST}/rpc/fn_marcar_agotada`, { ...ta, cuerpo: { p_talla_id: TALLA2, p_nota: 'agotada en prueba' } });
  esperar('C marca la talla como agotada', p3.s === 200 && p3.d.estado === 'AGOTADA' && p3.d.vence_en === null && p3.d.nota === 'agotada en prueba', breve(p3));

  const nuevo = await pedir('POST', `${REST}/productos?select=id,codigo_interno`, { ...ta, cuerpo: { nombre: 'DEL PANEL', marca: 'Local' }, prefer: 'return=representation' });
  esperar('C crea producto y el disparador asigna el código', nuevo.s === 201 && /^GT-\d{5}$/.test(nuevo.d[0]?.codigo_interno), breve(nuevo));
  if (nuevo.d?.[0]?.id) creados.productos.push(nuevo.d[0].id);
  const nuevaV = await pedir('POST', `${REST}/variantes?select=id,codigo_variante`, { ...ta, cuerpo: { producto_id: nuevo.d[0].id, color: 'Azul' }, prefer: 'return=representation' });
  if (nuevaV.d?.[0]?.id) creados.variantes.push(nuevaV.d[0].id);
  esperar('C crea variante y el disparador deriva el código', nuevaV.s === 201 && nuevaV.d[0]?.codigo_variante === `${nuevo.d[0].codigo_interno}-A`, breve(nuevaV));
  const nuevaT = await pedir('POST', `${REST}/tallas?select=id`, { ...ta, cuerpo: { variante_id: nuevaV.d[0].id, talla: '42', nota: 'nota del panel' }, prefer: 'return=representation' });
  esperar('C crea talla con nota', nuevaT.s === 201, breve(nuevaT));
  const editar = await pedir('PATCH', `${REST}/tallas?id=eq.${nuevaT.d[0].id}&select=id`, { ...ta, cuerpo: { nota: 'nota editada' }, prefer: 'return=representation' });
  esperar('C edita la nota por la tabla', editar.s === 200 && editar.d.length === 1, breve(editar));
  const leida = await pedir('GET', `${REST}/rpc/fn_admin_tallas?select=nota&id=eq.${nuevaT.d[0].id}`, ta);
  esperar('C la nota editada se lee por fn_admin_tallas', leida.d?.[0]?.nota === 'nota editada', breve(leida));
  const autor = await pedir('GET', `${REST}/historial?select=autor,operacion,cambios&fila_id=eq.${nuevaT.d[0].id}&order=id.desc&limit=1`, ta);
  esperar('C el disparador de historial registra el cambio y su autor', autor.d?.[0]?.autor === admin.id && autor.d?.[0]?.cambios?.includes('nota'), breve(autor));
  const borrarHist = await pedir('DELETE', `${REST}/historial?id=gte.0`, ta);
  esperar('C ni el administrador borra el historial', denegado(borrarHist), breve(borrarHist));

  // 14f.2: el administrador ya no borra tallas; las desactiva y las reactiva.
  const T42 = nuevaT.d[0].id;
  const borrarT = await pedir('DELETE', `${REST}/tallas?id=eq.${T42}`, ta);
  esperar('C rechazado: el administrador no borra una talla (403)', denegado(borrarT), breve(borrarT));
  const borrarTodas = await pedir('DELETE', `${REST}/tallas?variante_id=eq.${nuevaV.d[0].id}`, ta);
  esperar('C rechazado: tampoco todas las de una variante', denegado(borrarTodas), breve(borrarTodas));
  const sigue = await servicio('GET', `${REST}/tallas?select=id&id=eq.${T42}`);
  esperar('C la talla sigue existiendo tras los intentos', sigue.d?.length === 1, breve(sigue));
  const desactivar = await pedir('PATCH', `${REST}/tallas?id=eq.${T42}&select=id,activa`, { ...ta, cuerpo: { activa: false }, prefer: 'return=representation' });
  esperar('C desactiva la talla (activa = false)', desactivar.s === 200 && desactivar.d.length === 1 && desactivar.d[0].activa === false, breve(desactivar));
  const histDes = await pedir('GET', `${REST}/historial?select=operacion,cambios,autor&fila_id=eq.${T42}&order=id.desc&limit=1`, ta);
  esperar('C el historial registra la desactivación y su autor', histDes.d?.[0]?.operacion === 'UPDATE' && JSON.stringify(histDes.d?.[0]?.cambios) === '["activa"]' && histDes.d?.[0]?.autor === admin.id, breve(histDes));
  const vistaSin = await pedir('GET', `${REST}/catalogo_publico?id=eq.${encodeURIComponent(nuevo.d[0].id)}`);
  esperar('C la talla desactivada desaparece de la vista', vistaSin.s === 200 && vistaSin.d?.[0]?.variantes?.[0]?.tallas?.length === 0, breve(vistaSin));
  const reactivar = await pedir('PATCH', `${REST}/tallas?id=eq.${T42}&select=id,activa`, { ...ta, cuerpo: { activa: true }, prefer: 'return=representation' });
  esperar('C reactiva la MISMA fila', reactivar.s === 200 && reactivar.d?.[0]?.id === T42 && reactivar.d?.[0]?.activa === true, breve(reactivar));
  const cuantas = await servicio('GET', `${REST}/tallas?select=id&variante_id=eq.${nuevaV.d[0].id}&talla=eq.42`);
  esperar('C sin duplicados: una sola fila para esa talla', cuantas.d?.length === 1, breve(cuantas));
  const histTodo = await pedir('GET', `${REST}/historial?select=operacion,cambios&fila_id=eq.${T42}&operacion=eq.UPDATE&cambios=cs.{activa}`, ta);
  esperar('C el historial guarda la desactivación y la reactivación', histTodo.d?.length === 2, breve(histTodo));

  // ==================================================================== G
  titulo('G · Formato de las tallas y fechas futuras (14f.2)');
  const variG = vari.d[0].id;
  for (const talla of ['40,5', '40 1/3']) {
    const x = await pedir('POST', `${REST}/tallas?select=id,talla`, { ...ta, cuerpo: { variante_id: variG, talla }, prefer: 'return=representation' });
    esperar(`G el administrador crea la talla «${talla}»`, x.s === 201 && x.d?.[0]?.talla === talla, breve(x));
  }
  // Formas equivalentes no mínimas: se admiten y valen lo mismo que 40,5 (14f.2, revisión).
  for (const talla of ['40,50', '40 2/4']) {
    const x = await pedir('POST', `${REST}/tallas?select=id,talla`, { ...ta, cuerpo: { variante_id: nuevaV.d[0].id, talla }, prefer: 'return=representation' });
    esperar(`G el administrador crea la talla equivalente «${talla}»`, x.s === 201 && x.d?.[0]?.talla === talla, breve(x));
  }
  const valores = [];
  for (const talla of ['40,5', '40.5', '40,50', '40.50', '40 1/2', '40 2/4']) {
    const x = await pedir('POST', `${REST}/rpc/fn_valor_talla`, { cuerpo: { p_talla: talla } });
    valores.push(`${talla}=${x.s === 200 ? x.d : breve(x)}`);
  }
  esperar('G rpc fn_valor_talla: las seis formas de 40,5 valen 40.5', valores.every((v) => v.endsWith('=40.5')), valores.join(' '));
  const vistaEquiv = await pedir('GET', `${REST}/catalogo_publico?id=eq.${encodeURIComponent(nuevo.d[0].id)}`);
  const ordenEquiv = vistaEquiv.d?.[0]?.variantes?.[0]?.tallas?.map((t) => t.talla) || [];
  esperar('G la vista entrega las etiquetas equivalentes intactas, juntas y antes de 42',
    ordenEquiv.length === 3 && ordenEquiv[2] === '42' && ordenEquiv.slice(0, 2).sort().join('|') === ['40 2/4', '40,50'].sort().join('|'), JSON.stringify(ordenEquiv));
  for (const talla of ['40,5.2', '40foo', '40 1/0', 'NaN', ' 40', '40 4/3', '0040']) {
    const x = await pedir('POST', `${REST}/tallas`, { ...ta, cuerpo: { variante_id: variG, talla } });
    esperar(`G rechazada la talla ${JSON.stringify(talla)} (400, 23514)`, x.s === 400 && x.d?.code === '23514' && /tallas_talla_formato/.test(x.d?.message || ''), breve(x));
  }
  const malCambio = await pedir('PATCH', `${REST}/tallas?id=eq.${TALLA}`, { ...ta, cuerpo: { talla: '40,5.2' } });
  esperar('G rechazado cambiar una talla a 40,5.2', malCambio.s === 400 && malCambio.d?.code === '23514', breve(malCambio));
  const vistaComa = await pedir('GET', `${REST}/catalogo_publico?order=orden`);
  const activosAhora = (await servicio('GET', `${REST}/productos?select=id&activo=is.true`)).d.length;
  esperar('G el visitante lee el catálogo entero con tallas 40,5 y 40 1/3 (antes: error)', vistaComa.s === 200 && vistaComa.d.length === activosAhora, `${breve(vistaComa)} de ${activosAhora}`);
  const ordenG = vistaComa.d.find((p) => p.id === prod.d[0].id && p.codigoInterno === prod.d[0].codigo_interno)?.variantes?.[0]?.tallas?.map((t) => t.talla);
  esperar('G la vista ordena 40 < 40 1/3 < 40,5 < 41', JSON.stringify(ordenG) === '["40","40 1/3","40,5","41"]', JSON.stringify(ordenG));
  const adminComa = await pedir('POST', `${REST}/rpc/fn_admin_tallas?select=talla`, { ...ta, cuerpo: { p_variante_id: variG } });
  esperar('G fn_admin_tallas responde y ordena con coma', adminComa.s === 200 && JSON.stringify(adminComa.d) === '[{"talla":"40"},{"talla":"40 1/3"},{"talla":"40,5"},{"talla":"41"}]', breve(adminComa));

  const futuro = new Date(Date.now() + 36e5).toISOString();
  const pasado = new Date(Date.now() - 2 * 36e5).toISOString();
  const futuraRpc = await pedir('POST', `${REST}/rpc/fn_confirmar_por_publicacion`, { ...ta, cuerpo: { p_talla_id: TALLA, p_publicado_en: futuro } });
  esperar('G rpc fn_confirmar_por_publicacion con fecha futura: 400', futuraRpc.s === 400 && futuraRpc.d?.code === '23514' && /publicado_en no puede ser futura/.test(futuraRpc.d?.message || ''), breve(futuraRpc));
  for (const campo of ['publicado_en', 'confirmado_en', 'vigencia_desde']) {
    const x = await pedir('PATCH', `${REST}/tallas?id=eq.${TALLA}`, { ...ta, cuerpo: { [campo]: futuro } });
    esperar(`G PATCH con ${campo} futura: 400`, x.s === 400 && x.d?.code === '23514' && new RegExp(`${campo} no puede ser futura`).test(x.d?.message || ''), breve(x));
  }
  const nuevaFutura = await pedir('POST', `${REST}/tallas`, { ...ta, cuerpo: { variante_id: variG, talla: '43', estado: 'CONFIRMADA', vigencia_desde: futuro } });
  esperar('G POST de una talla con vigencia futura: 400', nuevaFutura.s === 400 && nuevaFutura.d?.code === '23514', breve(nuevaFutura));
  const pasadaRpc = await pedir('POST', `${REST}/rpc/fn_confirmar_por_publicacion?select=vigencia_desde,vence_en`, { ...ta, cuerpo: { p_talla_id: TALLA, p_publicado_en: pasado } });
  esperar('G con fecha pasada se acepta y vence a las 48 h de la publicación', pasadaRpc.s === 200 && (new Date(pasadaRpc.d.vence_en) - new Date(pasado)) / 36e5 === 48, breve(pasadaRpc));
  const proveedor = await pedir('POST', `${REST}/rpc/fn_confirmar_por_proveedor?select=vigencia_desde,vence_en`, { ...ta, cuerpo: { p_talla_id: TALLA } });
  esperar('G la confirmación del proveedor (hora del servidor) nunca se rechaza', proveedor.s === 200 && Math.abs(new Date(proveedor.d.vigencia_desde) - Date.now()) < 120000, breve(proveedor));
  const tras = await pedir('GET', `${REST}/catalogo_publico?id=eq.${encodeURIComponent(prod.d[0].id)}`);
  esperar('G el visitante ve DISPONIBLE la talla recién confirmada', tras.d?.[0]?.variantes?.[0]?.tallasDisponibles?.includes('40'), breve(tras));

  // ==================================================================== F
  titulo('F · Registro público de usuarios');
  const registro = await pedir('POST', '/auth/v1/signup', { cuerpo: { email: `publico-${sufijo}@gamaytalla.test`, password: crypto.randomBytes(18).toString('base64url') } });
  esperar('F el registro público está cerrado', registro.s === 422 && registro.d?.error_code === 'signup_disabled', `${registro.s} ${registro.d?.error_code || 'SE CREÓ UNA CUENTA CON SESIÓN'}`);
  const anonima = await pedir('POST', '/auth/v1/signup', { cuerpo: {} });
  esperar('F el inicio de sesión anónimo está cerrado', anonima.s >= 400, `${anonima.s}`);
  esperar('F la Admin API sí pudo crear al administrador con el registro cerrado', Boolean(admin.id));
  esperar('F un usuario existente sí pudo iniciar sesión', Boolean(admin.token));
} finally {
  // Mantenimiento privilegiado con service_role, que conserva DELETE: no es una acción del
  // panel. Solo se borran los datos del catálogo; los usuarios ficticios mueren con el entorno.
  // Una limpieza fallida cuenta como fallo: no puede quedar un «Sin fallos» con restos.
  titulo('Limpieza (service_role)');
  const variantes = [vari.d[0].id, ...creados.variantes];
  const productos = [prod.d[0].id, ...creados.productos];
  for (const [ruta, nombre] of [
    [`/tallas?variante_id=in.(${variantes.join(',')})`, 'tallas de prueba'],
    [`/variantes?id=in.(${variantes.join(',')})`, 'variantes de prueba'],
    [`/productos?id=in.(${productos.join(',')})`, 'productos de prueba'],
    [`/administradores?user_id=eq.${admin.id}`, 'administrador ficticio']
  ]) {
    const x = await servicio('DELETE', REST + ruta);
    esperar(`limpieza: ${nombre}`, x.s === 204, breve(x));
  }
  const resto = await servicio('GET', `${REST}/productos?select=id&id=in.(${productos.join(',')})`);
  esperar('limpieza: no queda ningún producto de prueba', resto.s === 200 && resto.d.length === 0, breve(resto));
}

console.log(`\nRESULTADO: ${correctas} correctas · ${fallidas} fallidas · ${omitidas} omitidas (no cuentan como correctas) · ${avisos} avisos`);
process.exit(fallidas ? 1 : 0);
