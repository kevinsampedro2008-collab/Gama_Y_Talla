/* Etapa 17 · Ciclo completo de respaldo y recuperación con datos FICTICIOS. SOLO LOCAL.
 *
 *   node supabase/pruebas/reproducir/ciclo_respaldo_17.mjs --destino-workdir <proyecto destino> --salida <carpeta fuera del repo>
 *
 * Necesita: el stack local de ESTE repositorio (origen, catálogo vacío al empezar), OTRO stack
 * local vacío creado con scripts/respaldo/preparar-destino.mjs (destino) y la tienda servida en
 * 127.0.0.1:8765. Los dos tienen todas las migraciones de esta entrega.
 *
 * 1. Siembra en el origen: una zapatilla Unisex creada y renombrada con las funciones del panel
 *    (fotos en Storage, talla confirmada, publicada, autor y lote en el historial), una heredada
 *    SIN público cuya clave pública es un código GT anterior a su renombrado (foto del repositorio),
 *    una retirada y la vigencia predeterminada cambiada a 36 h.
 * 2. Respaldo con scripts/respaldo/respaldar.mjs y verificación con verificar.mjs.
 * 3. Paquetes alterados (una foto ausente y otra con un byte cambiado): verificar los rechaza y
 *    restaurar se niega sin escribir nada en el destino.
 * 4. Fallo simulado en la fase de base: la transacción se deshace, se informa de lo parcial
 *    (fotos ya subidas) y el destino se limpia con «db reset» para repetir.
 * 5. Restauración real y comparación ORIGEN ↔ DESTINO: filas de las 6 tablas, catalogo_publico,
 *    líneas de carrito V3 reconocidas por la tienda real y bytes de una foto servida.
 * 6. Limpieza del origen (lo sembrado). El destino queda restaurado para revisarlo.
 * Termina con código 0 solo si todo se cumple.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { RAIZ, BUCKET, SQL_INSTANTANEA, TABLAS, argumentos, proyectoLocal, sql, sqlJson, sha256, dentroDelRepositorio } from '../../../scripts/respaldo/comun.mjs';

// Dos fotos WebP FICTICIAS (degradado con ruido y el texto «G&T PRUEBA»), generadas con Chromium.
async function prepararFotos(salida) {
  const navegador = await chromium.launch();
  try {
    const pagina = await navegador.newPage();
    const generar = (ancho, alto, tono) => pagina.evaluate(async ([w, h, c]) => {
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
      const blob = await new Promise((r) => lienzo.toBlob(r, 'image/webp', 0.5));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }, [ancho, alto, tono]);
    const archivos = { adecuada: path.join(salida, 'foto-prueba-a.webp'), otra: path.join(salida, 'foto-prueba-b.webp') };
    fs.writeFileSync(archivos.adecuada, Buffer.from(await generar(1200, 900, 20)));
    fs.writeFileSync(archivos.otra, Buffer.from(await generar(1000, 1000, 120)));
    return archivos;
  } finally {
    await navegador.close();
  }
}

const SITIO = process.env.SITIO || 'http://127.0.0.1:8765';
const resultados = [];
function exigir(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok: Boolean(ok) });
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${nombre}${!ok && detalle ? ` → ${detalle}` : ''}`);
}
function nodo(script, args, env = {}) {
  const r = spawnSync(process.execPath, [path.join(RAIZ, script), ...args], { cwd: RAIZ, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return { codigo: r.status, salida: `${r.stdout || ''}${r.stderr || ''}` };
}
const recuentos = (contenedor) => sqlJson(contenedor, `select jsonb_build_object('productos', (select count(*) from public.productos), 'variantes', (select count(*) from public.variantes),
  'tallas', (select count(*) from public.tallas), 'fotos', (select count(*) from public.fotos), 'historial', (select count(*) from public.historial),
  'objetos', (select count(*) from storage.objects where bucket_id = '${BUCKET}'),
  'disparadores_inactivos', (select count(*) from pg_trigger tg join pg_class c on c.oid = tg.tgrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname in ('productos','variantes','tallas','fotos') and not tg.tgisinternal and tg.tgenabled <> 'O'));`);

// Identificadores FICTICIOS fijos
const ID = {
  admin: '00000000-1717-0000-0000-0000000000ad',
  uni: '10000000-1717-0000-0000-000000000001', uniA: '20000000-1717-0000-0000-00000000000a', uniB: '20000000-1717-0000-0000-00000000000b',
  tA40: '30000000-1717-0000-0000-0000000000a0', tA41: '30000000-1717-0000-0000-0000000000a1', tB39: '30000000-1717-0000-0000-0000000000b9',
  leg: '10000000-1717-0000-0000-000000000002', legV: '20000000-1717-0000-0000-00000000000c',
  ret: '10000000-1717-0000-0000-000000000003', retV: '20000000-1717-0000-0000-00000000000d'
};
const OBJ_A = `productos/${ID.uni}/${ID.uniA}/1762650000001-ciclo17aaa.webp`;
const OBJ_B = `productos/${ID.uni}/${ID.uniB}/1762650000002-ciclo17bbb.webp`;

async function storage(proyecto, metodo, ruta, cuerpo, tipo = 'application/json') {
  const r = await fetch(`${proyecto.api}/storage/v1${ruta}`, { method: metodo,
    headers: { apikey: proyecto.servicio, Authorization: `Bearer ${proyecto.servicio}`, 'Content-Type': tipo, 'x-upsert': 'false' },
    body: cuerpo === undefined ? undefined : (Buffer.isBuffer(cuerpo) ? cuerpo : JSON.stringify(cuerpo)) });
  if (!r.ok) throw new Error(`storage ${metodo} ${ruta} → ${r.status} ${(await r.text()).slice(0, 120)}`);
}

function sembrar(origen) {
  const url = (o) => `${origen.api}/storage/v1/object/public/${BUCKET}/${o}`;
  const formulario = (extra = {}, conOriginal = false) => JSON.stringify({
    id: ID.uni, nombre: 'Unisex ciclo 17', marca: 'Marca Respaldo', categoria: 'Botas casuales', publico: 'unisex', ...extra,
    variantes: [
      { id: ID.uniA, color: 'Negro', precio: 250000, precio_anterior: 290000, activa: true, orden: 0, ...(extra.codA ? { codigo_variante: extra.codA } : {}),
        tallas: [{ id: ID.tA40, talla: '40', activa: true, ...(conOriginal ? { activa_original: true } : {}) },
                 { id: ID.tA41, talla: '41', activa: true, ...(conOriginal ? { activa_original: true } : {}) }],
        fotos: [{ ruta: url(OBJ_A), alt: 'Negro, de lado' }] },
      { id: ID.uniB, color: 'Beige/Blancas', precio: 250000, muestra_color: '#e8dcc8', activa: true, orden: 1,
        tallas: [{ id: ID.tB39, talla: '39', activa: true, ...(conOriginal ? { activa_original: true } : {}) }], fotos: [{ ruta: url(OBJ_B) }] }
    ]
  }).replace(/'/g, "''");
  sql(origen.contenedor, `
begin;
insert into public.administradores (user_id, nombre) values ('${ID.admin}', 'Administración ficticia 17');
select set_config('request.jwt.claims', '{"sub": "${ID.admin}", "role": "authenticated"}', true);
set local role authenticated;
select public.fn_admin_guardar_producto('${formulario()}'::jsonb, null, '40000000-1717-0000-0000-000000000001');
select public.fn_admin_guardar_producto('${formulario({ codigo_interno: 'ZAP-UNI-17', codA: 'COL-UNI-NEGRO' }, true)}'::jsonb, 1, '40000000-1717-0000-0000-000000000002');
select public.fn_confirmar_por_proveedor('${ID.tA40}', 48::smallint);
select public.fn_admin_estado_producto('${ID.uni}', 'publicar', 2, '40000000-1717-0000-0000-000000000003');
reset role;

-- Heredada SIN público: su clave pública es el código GT que tenía (como tras la migración 16.2) y
-- después se renombraron sus códigos comerciales.
insert into public.productos (id, nombre, marca, categoria, activo) values ('${ID.leg}', 'Heredada ciclo 17', 'Marca Respaldo', 'Urbanas', true);
insert into public.variantes (id, producto_id, color, precio) values ('${ID.legV}', '${ID.leg}', 'Blanco', 150000);
insert into public.tallas (variante_id, talla, estado, publicado_en, vigencia_desde, confirmado_en, origen) values
  ('${ID.legV}', '40', 'CONFIRMADA', now() - interval '3 hours', now() - interval '1 hour', now() - interval '1 hour', 'proveedor'),
  ('${ID.legV}', '41', 'REVISAR', null, null, null, 'manual');
insert into public.fotos (variante_id, ruta, orden, alt) values ('${ID.legV}', 'assets/images/productos/editadas/zapatilla_02.webp', 0, 'Foto del repositorio');
alter table public.productos disable trigger tr_productos_normalizar;
alter table public.variantes disable trigger tr_variantes_normalizar;
update public.productos set clave_catalogo = codigo_interno where id = '${ID.leg}';
update public.variantes set clave_catalogo = codigo_variante where id = '${ID.legV}';
alter table public.productos enable trigger tr_productos_normalizar;
alter table public.variantes enable trigger tr_variantes_normalizar;
update public.productos set codigo_interno = 'LEG-RENOMBRADA-17' where id = '${ID.leg}';
update public.variantes set codigo_variante = 'LEG-RENOMBRADA-17-A' where id = '${ID.legV}';

-- Retirada (Dama), con una talla agotada.
insert into public.productos (id, nombre, marca, categoria, publico, activo, retirado_en)
values ('${ID.ret}', 'Retirada ciclo 17', 'Marca Respaldo', 'Running', 'dama', false, now() - interval '1 day');
insert into public.variantes (id, producto_id, color, precio, activa) values ('${ID.retV}', '${ID.ret}', 'Rosa', 99000, true);
insert into public.tallas (variante_id, talla, estado) values ('${ID.retV}', '37', 'AGOTADA');
update public.configuracion set valor = '36' where clave = 'vigencia_horas_predeterminada';
commit;`);
}

async function limpiarOrigen(origen) {
  await fetch(`${origen.api}/storage/v1/object/${BUCKET}`, { method: 'DELETE',
    headers: { apikey: origen.servicio, Authorization: `Bearer ${origen.servicio}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: [OBJ_A, OBJ_B] }) }).catch(() => null);
  sql(origen.contenedor, `
begin;
delete from public.fotos where variante_id in (select id from public.variantes where producto_id in ('${ID.uni}', '${ID.leg}', '${ID.ret}'));
delete from public.tallas where variante_id in (select id from public.variantes where producto_id in ('${ID.uni}', '${ID.leg}', '${ID.ret}'));
delete from public.variantes where producto_id in ('${ID.uni}', '${ID.leg}', '${ID.ret}');
delete from public.productos where id in ('${ID.uni}', '${ID.leg}', '${ID.ret}');
delete from public.administradores where user_id = '${ID.admin}';
update public.configuracion set valor = '48' where clave = 'vigencia_horas_predeterminada';
commit;`);
}

// Líneas del carrito V3 tal como las reconoce la tienda REAL leyendo un proyecto.
async function lineasEnTienda(navegador, proyecto, carrito) {
  const contexto = await navegador.newContext({ locale: 'es-CO' });
  try {
    await contexto.route(`${SITIO}/config.js`, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await contexto.addInitScript(([conf, c]) => { window.GAMA_TALLA_CONFIG = conf; localStorage.setItem('gama-talla-carrito-v3', JSON.stringify(c)); },
      [{ supabaseUrl: proyecto.api, clavePublicable: proyecto.publicable }, carrito]);
    const pagina = await contexto.newPage();
    await pagina.goto(`${SITIO}/?intro=no`);
    await pagina.waitForFunction("typeof estado !== 'undefined' && estado.catalogoListo === true", null, { timeout: 30000 });
    return await pagina.evaluate(() => lineasCarrito().map((l) => ({ producto: l.producto.id, codigo: l.producto.codigo, nombre: l.producto.nombre,
      publico: l.producto.publico, variante: l.variante.id, referencia: l.variante.codigoVariante ?? l.variante.referencia, talla: l.talla, cantidad: l.cantidad, estado: l.estado })));
  } finally {
    await contexto.close();
  }
}

async function principal() {
  const args = argumentos(process.argv.slice(2), ['destino-workdir', 'salida']);
  if (!args['destino-workdir'] || !args.salida) throw new Error('Uso: --destino-workdir <proyecto destino> --salida <carpeta fuera del repo>');
  const salida = path.resolve(args.salida);
  if (dentroDelRepositorio(salida)) throw new Error('La salida debe estar fuera del repositorio.');
  fs.mkdirSync(salida, { recursive: true });
  const origen = proyectoLocal(RAIZ);
  const destino = proyectoLocal(args['destino-workdir']);
  const vacioOrigen = recuentos(origen.contenedor);
  if (vacioOrigen.productos || vacioOrigen.objetos) throw new Error(`El origen debe empezar con el catálogo vacío (${JSON.stringify(vacioOrigen)}).`);
  exigir('0 el destino empieza vacío', Object.entries(recuentos(destino.contenedor)).every(([, n]) => n === 0));

  // 1. Siembra
  const fotos = await prepararFotos(salida);
  await storage(origen, 'POST', `/object/${BUCKET}/${OBJ_A}`, fs.readFileSync(fotos.adecuada), 'image/webp');
  await storage(origen, 'POST', `/object/${BUCKET}/${OBJ_B}`, fs.readFileSync(fotos.otra), 'image/webp');
  try {
    sembrar(origen);
    const sembrado = sqlJson(origen.contenedor, `select jsonb_build_object(
      'uni', (select to_jsonb(p) - 'actualizado_en' from (select publico, codigo_interno, clave_catalogo, activo from public.productos where id = '${ID.uni}') p),
      'leg', (select to_jsonb(p) from (select publico, codigo_interno, clave_catalogo from public.productos where id = '${ID.leg}') p),
      'historial_admin', (select count(*) from public.historial where autor = '${ID.admin}'),
      'lotes', (select count(distinct lote) from public.historial where autor = '${ID.admin}'));`);
    exigir('1 siembra: Unisex renombrada y publicada (clave = UUID), heredada con clave GT anterior al renombrado, historial con autor y lotes',
      sembrado.uni.publico === 'unisex' && sembrado.uni.codigo_interno === 'ZAP-UNI-17' && sembrado.uni.clave_catalogo === ID.uni && sembrado.uni.activo
      && sembrado.leg.publico === null && /^GT-\d{5}$/.test(sembrado.leg.clave_catalogo) && sembrado.leg.codigo_interno === 'LEG-RENOMBRADA-17'
      && sembrado.historial_admin > 0 && sembrado.lotes >= 3, JSON.stringify(sembrado));

    // 2. Respaldo y verificación
    const respaldo = nodo('scripts/respaldo/respaldar.mjs', ['--origen', 'local', '--salida', salida]);
    const paquete = respaldo.salida.split('\n').map((l) => l.replace(/^\s*·\s*/, '').trim()).find((l) => l.startsWith(salida) && l.includes('gama-talla-respaldo-'));
    exigir('2 respaldar.mjs termina bien y escribe el paquete fuera del repositorio', respaldo.codigo === 0 && paquete && fs.existsSync(path.join(paquete, 'manifiesto.json')), respaldo.salida.slice(-600));
    const manifiesto = JSON.parse(fs.readFileSync(path.join(paquete, 'manifiesto.json'), 'utf8'));
    exigir('2 el manifiesto trae formato, fecha, commit, migraciones, recuentos y SHA-256',
      manifiesto.version_formato === 1 && manifiesto.creado_en && /^[0-9a-f]{40}$/.test(manifiesto.commit.head) && manifiesto.migraciones.length === 15
      && manifiesto.recuentos.productos === 3 && manifiesto.fotos.length === 2 && manifiesto.fotos_versionadas.length === 1
      && manifiesto.archivos.every((a) => /^[0-9a-f]{64}$/.test(a.sha256)), JSON.stringify(manifiesto.recuentos));
    exigir('2 la foto del repositorio se registra con su ruta y su commit', /^[0-9a-f]{40}$/.test(manifiesto.fotos_versionadas[0].commit)
      && manifiesto.fotos_versionadas[0].ruta === 'assets/images/productos/editadas/zapatilla_02.webp');
    const textoPaquete = fs.readFileSync(path.join(paquete, 'datos', 'catalogo.json'), 'utf8');
    exigir('2 el paquete no contiene claves, sesiones, cuentas de Auth ni administradores',
      !/sb_secret_|sb_publishable_|eyJhbGci|service_role|access_token|refresh_token|Administración ficticia 17/.test(textoPaquete + JSON.stringify(manifiesto))
      && !('administradores' in JSON.parse(textoPaquete).tablas));
    const verificacion = nodo('scripts/respaldo/verificar.mjs', [paquete]);
    exigir('2 verificar.mjs acepta el paquete', verificacion.codigo === 0, verificacion.salida.slice(-400));

    // 3. Paquetes alterados: rechazados por verificar y por restaurar, sin escribir nada
    const copia = (nombre) => { const d = path.join(salida, nombre); fs.rmSync(d, { recursive: true, force: true }); fs.cpSync(paquete, d, { recursive: true }); return d; };
    const sinFoto = copia('alterado-foto-ausente');
    fs.rmSync(path.join(sinFoto, 'fotos', OBJ_A));
    const conByte = copia('alterado-foto-cambiada');
    const archivoB = path.join(conByte, 'fotos', OBJ_B);
    const bytes = fs.readFileSync(archivoB); bytes[bytes.length - 10] ^= 0xff; fs.writeFileSync(archivoB, bytes);
    for (const [nombre, dir, patron] of [['foto ausente', sinFoto, /Falta el archivo fotos\//], ['foto con un byte cambiado', conByte, /SHA-256 no coincide/]]) {
      const v = nodo('scripts/respaldo/verificar.mjs', [dir]);
      exigir(`3 verificar rechaza el paquete con ${nombre}`, v.codigo === 1 && patron.test(v.salida), v.salida.slice(-300));
      const r = nodo('scripts/respaldo/restaurar.mjs', [dir, '--destino-workdir', destino.dir]);
      exigir(`3 restaurar se niega con ${nombre} y no escribe nada`, r.codigo === 1 && /PAQUETE NO VÁLIDO: no se escribió nada/.test(r.salida)
        && Object.entries(recuentos(destino.contenedor)).every(([, n]) => n === 0), r.salida.slice(-300));
    }
    // Destino = el propio origen: rechazado.
    const mismo = nodo('scripts/respaldo/restaurar.mjs', [paquete, '--destino-workdir', RAIZ]);
    exigir('3 restaurar rechaza como destino el proyecto de origen', mismo.codigo === 1 && /RECHAZADO/.test(mismo.salida), mismo.salida.slice(-300));

    // 4. Fallo simulado en la base: se deshace, se informa de lo parcial, y se limpia el destino.
    const fallo = nodo('scripts/respaldo/restaurar.mjs', [paquete, '--destino-workdir', destino.dir], { GT_RESPALDO_SIMULAR_FALLO: 'base' });
    const trasFallo = recuentos(destino.contenedor);
    exigir('4 fallo en la fase de base: transacción deshecha, disparadores activos, fotos ya subidas informadas',
      fallo.codigo === 1 && /FALLÓ LA FASE 2/.test(fallo.salida) && /La transacción se deshizo/.test(fallo.salida) && /Quedó parcial: las 2 fotos/.test(fallo.salida)
      && /Para repetir la prueba en un destino limpio/.test(fallo.salida)
      && trasFallo.productos === 0 && trasFallo.historial === 0 && trasFallo.disparadores_inactivos === 0 && trasFallo.objetos === 2, `${fallo.salida.slice(-500)} ${JSON.stringify(trasFallo)}`);
    const ocupado = nodo('scripts/respaldo/restaurar.mjs', [paquete, '--destino-workdir', destino.dir]);
    exigir('4 con objetos preexistentes en Storage, restaurar se niega', ocupado.codigo === 1 && /no está vacío/.test(ocupado.salida), ocupado.salida.slice(-300));
    const reset = spawnSync(`npx --yes supabase@3.0.0 db reset --workdir "${destino.dir}"`, { cwd: RAIZ, shell: true, encoding: 'utf8' });
    const trasReset = recuentos(destino.contenedor);
    exigir('4 «db reset» deja el destino limpio para repetir', reset.status === 0 && Object.entries(trasReset).every(([, n]) => n === 0), `${reset.stderr?.slice(-300)} ${JSON.stringify(trasReset)}`);

    // 5. Restauración real
    const informe = path.join(salida, 'informe-restauracion.json');
    const restauracion = nodo('scripts/respaldo/restaurar.mjs', [paquete, '--destino-workdir', destino.dir, '--informe', informe]);
    console.log(restauracion.salida.trim().split('\n').map((l) => `      ${l}`).join('\n'));
    exigir('5 restaurar.mjs termina bien (filas, disparadores, secuencias, vista, fotos, códigos nuevos y auditoría)', restauracion.codigo === 0, restauracion.salida.slice(-600));

    // Origen ↔ destino: filas de las seis tablas (las fotos de Storage solo cambian de origen).
    const a = JSON.parse(sql(origen.contenedor, SQL_INSTANTANEA).trim());
    const b = JSON.parse(sql(destino.contenedor, SQL_INSTANTANEA).trim());
    const cambiarOrigen = (f) => ({ ...f, ruta: f.ruta.replace(`${origen.api}/storage/`, `${destino.api}/storage/`) });
    for (const tabla of TABLAS) {
      const esperado = tabla === 'fotos' ? a.tablas.fotos.map(cambiarOrigen) : a.tablas[tabla];
      exigir(`5 filas de ${tabla} idénticas (${esperado.length})`, JSON.stringify(esperado) === JSON.stringify(b.tablas[tabla]));
    }
    exigir('5 clave_catalogo de la heredada (código GT anterior al renombrado) conservada byte a byte',
      a.tablas.productos.find((p) => p.id === ID.leg).clave_catalogo === b.tablas.productos.find((p) => p.id === ID.leg).clave_catalogo);
    exigir('5 secuencias del destino al menos donde estaban en el origen',
      Number(b.secuencias.seq_codigo_producto.last_value) >= Number(a.secuencias.seq_codigo_producto.last_value)
      && Number(b.secuencias.historial_id_seq.last_value) >= Number(a.secuencias.historial_id_seq.last_value));
    const leerVista = async (p) => (await (await fetch(`${p.api}/rest/v1/catalogo_publico?select=*&order=id`, { headers: { apikey: p.publicable } })).json());
    const vistaA = await leerVista(origen);
    const vistaB = await leerVista(destino);
    const normal = (vista, p) => JSON.stringify(vista).split(`${p.api}/storage/`).join('<storage>/');
    exigir('5 catalogo_publico idéntico (ids, códigos, público, colores, tallas y estados; fotos con su nuevo origen)',
      vistaA.length === 2 && normal(vistaA, origen) === normal(vistaB, destino), `${vistaA.length} / ${vistaB.length}`);
    exigir('5 ids de catalogo_publico: la Unisex por su UUID y la heredada por su código GT anterior',
      JSON.stringify(vistaB.map((p) => p.id).sort()) === JSON.stringify([ID.uni, a.tablas.productos.find((p) => p.id === ID.leg).clave_catalogo].sort()));
    // Líneas de carrito V3 guardadas con el origen: la tienda REAL las reconoce igual en el destino.
    const uni = vistaA.find((p) => p.id === ID.uni);
    const leg = vistaA.find((p) => p.id !== ID.uni);
    const carrito = { version: 3, lineas: [
      { producto: uni.id, variante: uni.variantes[0].id, talla: '40', cantidad: 2, precio: uni.variantes[0].precio },
      { producto: leg.id, variante: leg.variantes[0].id, talla: '40', cantidad: 1, precio: leg.variantes[0].precio }] };
    const navegador = await chromium.launch();
    try {
      const enOrigen = await lineasEnTienda(navegador, origen, carrito);
      const enDestino = await lineasEnTienda(navegador, destino, carrito);
      exigir('5 la tienda reconoce las mismas líneas de carrito V3 en origen y destino (mismo estado, código y público)',
        enOrigen.length === 2 && JSON.stringify(enOrigen) === JSON.stringify(enDestino), `${JSON.stringify(enOrigen)} | ${JSON.stringify(enDestino)}`);
      console.log(`      carrito: ${enDestino.map((l) => `${l.nombre} ${l.referencia} talla ${l.talla} ×${l.cantidad} (${l.estado}${l.publico ? `, ${l.publico}` : ''})`).join(' · ')}`);
    } finally {
      await navegador.close();
    }
    // Bytes de una foto servida por cada Storage.
    const servida = async (url) => sha256(Buffer.from(await (await fetch(url)).arrayBuffer()));
    const fotoA = a.tablas.fotos.find((f) => f.ruta.endsWith(OBJ_A)).ruta;
    const [hA, hB] = [await servida(fotoA), await servida(cambiarOrigen({ ruta: fotoA }).ruta)];
    exigir('5 la foto servida por el destino tiene los mismos bytes que la del origen', hA === hB && hA === sha256(fs.readFileSync(fotos.adecuada)), `${hA} ${hB}`);
    const auditoria = sql(destino.contenedor, fs.readFileSync(path.join(RAIZ, 'supabase', 'pruebas', 'auditar_funciones.sql'), 'utf8')).split('\n').filter((l) => l.trim());
    exigir('5 auditoría de funciones en el destino restaurado: 0 filas', auditoria.length === 0, auditoria.slice(0, 3).join(' | '));
    exigir('5 disparadores activos en el destino', recuentos(destino.contenedor).disparadores_inactivos === 0);
  } finally {
    await limpiarOrigen(origen);
  }
  const vacio = recuentos(origen.contenedor);
  exigir('6 el origen queda como estaba (sin lo sembrado)', vacio.productos === 0 && vacio.objetos === 0);
  const fallidas = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length - fallidas.length} de ${resultados.length} comprobaciones correctas.`);
  if (fallidas.length) process.exitCode = 1;
}

principal().catch((e) => { console.error(e); process.exitCode = 1; });
