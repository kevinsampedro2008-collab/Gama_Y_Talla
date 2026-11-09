/* Etapa 17 · Restaurar un paquete en OTRO stack LOCAL de Supabase, vacío y desechable.
 *
 *   node scripts/respaldo/restaurar.mjs <paquete> --destino-workdir <carpeta del proyecto destino> [--informe <archivo.json>]
 *
 * Se niega si:
 *   · el paquete no pasa verificar.mjs (nada se escribe);
 *   · el destino no es local (API y base en 127.0.0.1 / localhost), o es el mismo proyecto de origen;
 *   · el destino tiene ya zapatillas, colores, tallas, fotos, historial u objetos en «fotos-catalogo»;
 *   · el esquema del destino no es el de esta entrega (todas las migraciones del repositorio,
 *     incluida 20261109010000_publico_unisex) o le falta alguna migración del paquete.
 *
 * Fases:
 *   1. Storage: sube cada foto con la API de Storage del destino (misma ruta de objeto, sin
 *      sobrescribir) y comprueba los bytes que sirve.
 *   2. Base: UNA transacción. Los disparadores de usuario de productos, variantes, tallas y fotos se
 *      suspenden SOLO dentro de ella: si no, al insertar se recalcularían clave_catalogo (UUID en vez
 *      de la clave original, p. ej. un código GT anterior a un renombrado), los códigos, actualizado_en,
 *      las vigencias, y se duplicaría el historial. Se insertan las filas tal cual (UUID, códigos,
 *      claves, estados, vigencias, fechas), el historial con sus id, la configuración, y se ajustan
 *      las secuencias. Al final se reactivan los disparadores y se confirma. Si algo falla, PostgreSQL
 *      deshace todo, también la suspensión de los disparadores.
 *      Las rutas de las fotos de Storage cambian SOLO de origen (al del Storage local del destino).
 *   3. Verificación: filas idénticas a las del paquete, disparadores activos, secuencias, ids de
 *      catalogo_publico, bytes de cada foto servida, que se generan códigos nuevos (en una
 *      transacción que se deshace) y auditoría de funciones con cero filas.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  BUCKET, TABLAS, TABLAS_CON_DISPARADORES, MIGRACION_UNISEX, RAIZ, ErrorRespaldo, fallar, argumentos, proyectoLocal, sql, sqlJson,
  sha256, marcador, migracionesDelRepositorio, lineas
} from './comun.mjs';
import { verificarPaquete } from './verificar.mjs';
import { leerVistaPublica, ErrorVista } from './vista.mjs';

const SIMULAR = process.env.GT_RESPALDO_SIMULAR_FALLO || ''; // solo pruebas: «storage», «base» o «vista-503»
// Con «vista-503», catalogo_publico responde 503 con un cuerpo de texto (como un proxy caído). Solo pruebas.
const solicitarVista = SIMULAR === 'vista-503'
  ? async () => new Response('Service Unavailable: upstream connect error', { status: 503, headers: { 'content-type': 'text/plain' } })
  : fetch;
const informe = { paquete: null, destino: null, fases: {}, resultado: 'sin-empezar' };

function estadoDestino(contenedor) {
  return sqlJson(contenedor, `
    select pg_catalog.jsonb_build_object(
      'recuentos', pg_catalog.jsonb_build_object(
        'productos', (select count(*) from public.productos), 'variantes', (select count(*) from public.variantes),
        'tallas', (select count(*) from public.tallas), 'fotos', (select count(*) from public.fotos),
        'historial', (select count(*) from public.historial)),
      'objetos', (select count(*) from storage.objects o where o.bucket_id = '${BUCKET}'),
      'bucket', exists (select 1 from storage.buckets b where b.id = '${BUCKET}'),
      'migraciones', (select coalesce(pg_catalog.jsonb_agg(m.version order by m.version), '[]') from supabase_migrations.schema_migrations m),
      'disparadores', ${SQL_DISPARADORES});`);
}

const SQL_DISPARADORES = `(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tabla', c.relname, 'nombre', tg.tgname, 'estado', tg.tgenabled::text)
      order by c.relname, tg.tgname), '[]')
    from pg_catalog.pg_trigger tg join pg_catalog.pg_class c on c.oid = tg.tgrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in (${TABLAS_CON_DISPARADORES.map((t) => `'${t}'`).join(', ')}) and not tg.tgisinternal)`;

// INSERT de una tabla a partir de sus filas JSON (columnas = las del paquete).
function insertar(tabla, filas, m, { conflicto = '' } = {}) {
  if (!filas.length) return '';
  const columnas = Object.keys(filas[0]).map((c) => `"${c.replace(/"/g, '""')}"`).join(', ');
  return `insert into public.${tabla} (${columnas})\n  select ${columnas} from pg_catalog.jsonb_populate_recordset(null::public.${tabla}, ${m}${JSON.stringify(filas)}${m}::jsonb)${conflicto};\n`;
}
const igualdad = (tabla, filas, m, orden = 'id') => `(select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) order by x.${orden}), '[]') from pg_catalog.jsonb_populate_recordset(null::public.${tabla}, ${m}${JSON.stringify(filas)}${m}::jsonb) x)
      = (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(y) order by y.${orden}), '[]') from public.${tabla} y)`;

async function principal() {
  const args = argumentos(process.argv.slice(2), ['destino-workdir', 'informe']);
  const paquete = args._[0];
  if (!paquete || !args['destino-workdir'] || args['destino-workdir'] === true) fallar('Uso: node scripts/respaldo/restaurar.mjs <paquete> --destino-workdir <carpeta> [--informe <archivo.json>]');
  const dir = path.resolve(paquete);
  informe.paquete = dir;

  // ---------------------------------------------------------------- 0. comprobaciones previas
  const { manifiesto, datos, problemas } = verificarPaquete(dir);
  if (problemas.length) {
    informe.resultado = 'paquete-no-valido';
    fallar(`PAQUETE NO VÁLIDO: no se escribió nada en el destino.\n  ✗ ${problemas.join('\n  ✗ ')}`);
  }
  const destino = proyectoLocal(args['destino-workdir']);
  informe.destino = { workdir: destino.dir, proyecto: destino.id, api: destino.api };
  if (manifiesto.origen?.tipo === 'local' && (manifiesto.origen.proyecto === destino.id || manifiesto.origen.api === destino.api)) {
    fallar(`RECHAZADO: el destino (${destino.id}, ${destino.api}) es el mismo proyecto de origen del paquete. Usa otro stack local.`);
  }
  if (destino.dir === RAIZ) fallar('RECHAZADO: el destino es el proyecto de este repositorio. Usa otro stack local, desechable.');
  const antes = estadoDestino(destino.contenedor);
  const ocupado = Object.entries(antes.recuentos).filter(([, n]) => n > 0).map(([t, n]) => `${t} ${n}`);
  if (ocupado.length || antes.objetos > 0) {
    fallar(`RECHAZADO: el destino no está vacío (${[...ocupado, antes.objetos ? `objetos en ${BUCKET} ${antes.objetos}` : ''].filter(Boolean).join(', ')}). No se escribió nada.`);
  }
  if (!antes.bucket) fallar(`RECHAZADO: el destino no tiene el bucket ${BUCKET} (faltan migraciones).`);
  const esperadas = migracionesDelRepositorio();
  const faltanPaquete = manifiesto.migraciones.filter((v) => !antes.migraciones.includes(v));
  if (faltanPaquete.length) fallar(`RECHAZADO: al destino le faltan migraciones del paquete: ${faltanPaquete.join(', ')}.`);
  if (JSON.stringify(antes.migraciones) !== JSON.stringify(esperadas) || !antes.migraciones.includes(MIGRACION_UNISEX)) {
    fallar(`RECHAZADO: el esquema del destino no es el de esta entrega (destino: ${antes.migraciones.length} migraciones, repositorio: ${esperadas.length}; se exige ${MIGRACION_UNISEX}).`);
  }
  const disparadoresAntes = antes.disparadores;
  if (disparadoresAntes.some((d) => d.estado !== 'O')) fallar('RECHAZADO: el destino tiene disparadores desactivados antes de empezar.');
  informe.fases.comprobaciones = { ok: true, migraciones: antes.migraciones.length, disparadores: disparadoresAntes.length };
  console.log(`Paquete válido (${manifiesto.recuentos.productos} zapatillas, ${manifiesto.fotos.length} fotos de Storage). Destino ${destino.id} vacío, con ${antes.migraciones.length} migraciones.`);

  // Rutas de las fotos de Storage con el origen del destino; el resto, igual.
  const nuevaRuta = new Map(manifiesto.fotos.map((f) => [f.id, `${destino.api}/storage/v1/object/public/${BUCKET}/${f.objeto}`]));
  const t = datos.tablas;
  const fotosDestino = t.fotos.map((f) => (nuevaRuta.has(f.id) ? { ...f, ruta: nuevaRuta.get(f.id) } : f));

  // ---------------------------------------------------------------- 1. Storage
  const subidas = [];
  try {
    for (const f of manifiesto.fotos) {
      const bytes = fs.readFileSync(path.join(dir, f.archivo));
      const r = await fetch(`${destino.api}/storage/v1/object/${BUCKET}/${f.objeto}`, {
        method: 'POST',
        headers: { apikey: destino.servicio, Authorization: `Bearer ${destino.servicio}`, 'Content-Type': 'image/webp', 'x-upsert': 'false', 'cache-control': '3600' },
        body: bytes
      });
      if (!r.ok) fallar(`Storage rechazó ${f.objeto}: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
      subidas.push(f.objeto);
      if (SIMULAR === 'storage') fallar('Fallo SIMULADO en la fase de Storage (GT_RESPALDO_SIMULAR_FALLO=storage).');
      const servida = Buffer.from(await (await fetch(nuevaRuta.get(f.id))).arrayBuffer());
      if (sha256(servida) !== f.sha256) fallar(`La foto servida ${f.objeto} no coincide con el paquete.`);
    }
  } catch (e) {
    informe.fases.storage = { ok: false, subidas: subidas.length, total: manifiesto.fotos.length };
    informe.resultado = 'parcial-storage';
    fallar(`FALLÓ LA FASE 1 (Storage): ${e.message}\nQuedó parcial: ${subidas.length} de ${manifiesto.fotos.length} fotos subidas al Storage del destino; la base del destino NO se tocó.\n${repetir(destino)}`);
  }
  informe.fases.storage = { ok: true, subidas: subidas.length };
  console.log(`Fase 1 · Storage: ${subidas.length} fotos subidas y comprobadas byte a byte.`);

  // ---------------------------------------------------------------- 2. Base (una transacción)
  const textos = [JSON.stringify(t), JSON.stringify(fotosDestino)];
  const m = marcador(...textos);
  const s = datos.secuencias;
  const suspender = TABLAS_CON_DISPARADORES.map((x) => `alter table public.${x} disable trigger user;`).join('\n');
  const reactivar = TABLAS_CON_DISPARADORES.map((x) => `alter table public.${x} enable trigger user;`).join('\n');
  const transaccion = `
begin;
do $v$ begin
  if exists (select 1 from public.productos) or exists (select 1 from public.variantes) or exists (select 1 from public.tallas)
     or exists (select 1 from public.fotos) or exists (select 1 from public.historial) then
    raise exception 'El destino dejó de estar vacío durante la restauración: no se restauró nada.';
  end if;
end $v$;
-- Solo dentro de esta transacción (si falla, PostgreSQL también deshace esto).
${suspender}
${insertar('productos', t.productos, m)}${insertar('variantes', t.variantes, m)}${insertar('tallas', t.tallas, m)}${insertar('fotos', fotosDestino, m)}${insertar('historial', t.historial, m)}${insertar('configuracion', t.configuracion, m, { conflicto: '\n  on conflict (clave) do update set valor = excluded.valor, creado_en = excluded.creado_en' })}
select pg_catalog.setval('public.seq_codigo_producto', ${Number(s.seq_codigo_producto.last_value)}, ${s.seq_codigo_producto.is_called ? 'true' : 'false'});
select pg_catalog.setval('public.historial_id_seq', greatest(${Number(s.historial_id_seq.last_value)}, coalesce((select max(id) from public.historial), 1)), ${s.historial_id_seq.is_called || t.historial.length ? 'true' : 'false'});
${reactivar}
${SIMULAR === 'base' ? "select 1 / 0; -- fallo SIMULADO en la fase de base (GT_RESPALDO_SIMULAR_FALLO=base)" : ''}
commit;
`;
  try {
    sql(destino.contenedor, transaccion);
  } catch (e) {
    informe.fases.base = { ok: false };
    informe.resultado = 'parcial-base';
    const despues = estadoDestino(destino.contenedor);
    fallar(`FALLÓ LA FASE 2 (base): ${e.message.split('\n').slice(0, 3).join(' ')}\nLa transacción se deshizo: la base del destino sigue vacía (${Object.entries(despues.recuentos).map(([k, n]) => `${k} ${n}`).join(', ')}) y sus disparadores siguen activos (${despues.disparadores.filter((d) => d.estado === 'O').length}/${despues.disparadores.length}).\nQuedó parcial: las ${subidas.length} fotos de la fase 1 ya están en el Storage del destino.\n${repetir(destino)}`);
  }
  informe.fases.base = { ok: true };
  informe.resultado = 'base-confirmada';
  informe.restaurado = { base: { ...Object.fromEntries(TABLAS.map((n) => [n, t[n].length])) }, storage: { fotos: subidas.length } };
  console.log('Fase 2 · Base: filas restauradas en una transacción; disparadores reactivados.');

  // ---------------------------------------------------------------- 3. Verificación
  const fallos = [];
  let comparacion = null;
  let codigos = null;
  let auditoria = [];
  let inactivos = [];
  let idsEsperados = [];
  let claves = [];
  try {
  comparacion = sqlJson(destino.contenedor, `
    select pg_catalog.jsonb_build_object(
      'productos', ${igualdad('productos', t.productos, m)},
      'variantes', ${igualdad('variantes', t.variantes, m)},
      'tallas', ${igualdad('tallas', t.tallas, m)},
      'fotos', ${igualdad('fotos', fotosDestino, m)},
      'historial', ${igualdad('historial', t.historial, m)},
      'configuracion', ${igualdad('configuracion', t.configuracion, m, 'clave')},
      'disparadores', ${SQL_DISPARADORES},
      'secuencias', pg_catalog.jsonb_build_object(
        'seq_codigo_producto', (select pg_catalog.jsonb_build_object('last_value', x.last_value, 'is_called', x.is_called) from public.seq_codigo_producto x),
        'historial_id_seq', (select pg_catalog.jsonb_build_object('last_value', x.last_value, 'is_called', x.is_called) from public.historial_id_seq x)),
      'claves', (select pg_catalog.jsonb_agg(p.clave_catalogo order by p.id) from public.productos p));`);
  for (const tabla of TABLAS) if (comparacion[tabla] !== true) fallos.push(`Las filas de ${tabla} no son idénticas a las del paquete.`);
  claves = t.productos.map((p) => p.clave_catalogo);
  if (JSON.stringify(comparacion.claves || []) !== JSON.stringify(claves)) fallos.push('clave_catalogo no se conservó byte a byte.');
  const firma = (lista) => JSON.stringify(lista.map((d) => `${d.tabla}.${d.nombre}`));
  if (firma(comparacion.disparadores) !== firma(disparadoresAntes)) fallos.push('La lista de disparadores cambió.');
  inactivos = comparacion.disparadores.filter((d) => d.estado !== 'O');
  if (inactivos.length) fallos.push(`Disparadores no activos tras la recuperación: ${inactivos.map((d) => `${d.tabla}.${d.nombre}`).join(', ')}.`);
  if (Number(comparacion.secuencias.seq_codigo_producto.last_value) < Number(s.seq_codigo_producto.last_value)) fallos.push('La secuencia de códigos quedó por detrás del origen.');

  // catalogo_publico como visitante: mismos ids públicos (zapatillas y colores) que el paquete.
  // Por páginas ordenadas por id: la API limita cada respuesta (1.000 filas) y una sola petición se quedaría corta.
  let vista = null;
  try {
    const lectura = await leerVistaPublica(destino.api, destino.publicable, { solicitar: solicitarVista });
    vista = lectura.filas;
    informe.fases.vista_publica = { paginas: lectura.paginas, filas: vista.length };
  } catch (e) {
    if (!(e instanceof ErrorVista)) throw e;
    informe.fases.vista_publica = { error: e.message };
    fallos.push(`No se pudo leer catalogo_publico completa: ${e.message}`);
  }
  const activos = t.productos.filter((p) => p.activo);
  idsEsperados = activos.map((p) => p.clave_catalogo).sort();
  if (vista === null) { /* ya se registró el motivo: no se compara contra una lectura incompleta */ }
  else if (JSON.stringify(vista.map((p) => p.id).sort()) !== JSON.stringify(idsEsperados)) fallos.push(`Los ids de catalogo_publico no coinciden con las claves de las zapatillas publicadas (esperadas ${idsEsperados.length}, leídas ${vista.length}).`);
  else {
    const porId = new Map(vista.map((p) => [p.id, p]));
    for (const p of activos) {
      const enVista = porId.get(p.clave_catalogo);
      const colores = t.variantes.filter((v) => v.producto_id === p.id && v.activa).map((v) => v.clave_catalogo).sort();
      if (JSON.stringify(enVista.variantes.map((v) => v.id).sort()) !== JSON.stringify(colores)) fallos.push(`Los colores de ${p.clave_catalogo} en catalogo_publico no coinciden.`);
    }
  }
  // Bytes servidos de cada foto restaurada (por la ruta que quedó en la base).
  for (const f of manifiesto.fotos) {
    const r = await fetch(nuevaRuta.get(f.id));
    if (!r.ok || sha256(Buffer.from(await r.arrayBuffer())) !== f.sha256) fallos.push(`La foto ${f.objeto} servida por el destino no coincide.`);
  }
  // Códigos nuevos: los disparadores están activos y no chocan (se deshace; consume la secuencia).
  codigos = sqlJson(destino.contenedor, `
    begin;
    create temporary table comprobacion_codigos (datos jsonb) on commit drop;
    do $c$ declare p record; v record; begin
      insert into public.productos (nombre, marca, categoria, publico) values ('Comprobación de códigos', 'comprobación', 'comprobación', 'unisex')
        returning id, codigo_interno, clave_catalogo, nombre into p;
      insert into public.variantes (producto_id, color) values (p.id, 'comprobación') returning id, codigo_variante, clave_catalogo into v;
      insert into comprobacion_codigos values (pg_catalog.jsonb_build_object('producto', p.id, 'codigo', p.codigo_interno, 'clave', p.clave_catalogo, 'nombre', p.nombre,
        'variante', v.id, 'codigo_variante', v.codigo_variante, 'clave_variante', v.clave_catalogo,
        'historial', (select count(*) from public.historial h where h.fila_id in (p.id, v.id))));
    end $c$;
    select datos from comprobacion_codigos;
    rollback;`);
  const codigosUsados = new Set(t.productos.map((p) => p.codigo_interno));
  const codigoOk = /^GT-\d{5}$/.test(codigos.codigo) && !codigosUsados.has(codigos.codigo) && codigos.clave === codigos.producto
    && codigos.codigo_variante === `${codigos.codigo}-A` && codigos.clave_variante === codigos.variante && codigos.nombre === 'COMPROBACIÓN DE CÓDIGOS' && codigos.historial === 2;
  if (!codigoOk) fallos.push(`La generación de códigos nuevos no funcionó como se espera: ${JSON.stringify(codigos)}`);
  // Auditoría de funciones: cero filas.
  auditoria = sql(destino.contenedor, fs.readFileSync(path.join(RAIZ, 'supabase', 'pruebas', 'auditar_funciones.sql'), 'utf8')).split('\n').filter((l) => l.trim());
  if (auditoria.length) fallos.push(`La auditoría de funciones devolvió ${auditoria.length} filas: ${auditoria.slice(0, 3).join(' | ')}`);

  } catch (e) {
    // Cualquier excepción de la verificación (SQL, red, HTTP) es un fallo de la verificación, no un rechazo.
    fallos.push(`La verificación se interrumpió: ${String(e.message || e).split('\n')[0]}`);
  }
  informe.fases.verificacion = { ok: !fallos.length, fallos, codigo_nuevo: codigos?.codigo ?? null, auditoria_filas: auditoria.length,
    disparadores_activos: comparacion ? comparacion.disparadores.length - inactivos.length : null };
  if (fallos.length) {
    informe.resultado = 'verificacion-fallida';
    fallar(`FALLÓ LA FASE 3 (verificación): el destino NO se puede dar por verificado.\n  ✗ ${fallos.join('\n  ✗ ')}\n${quedoRestaurado(informe)}\n${repetir(destino)}`);
  }
  informe.resultado = 'ok';
  lineas('Restauración completa y verificada:', [
    `destino ${destino.id} (${destino.api})`,
    `${t.productos.length} zapatillas · ${t.variantes.length} colores · ${t.tallas.length} tallas · ${t.fotos.length} fotos · ${t.historial.length} eventos de historial · ${t.configuracion.length} ajustes: filas idénticas al paquete`,
    `clave_catalogo conservada byte a byte (${claves.length}); ids de catalogo_publico: ${idsEsperados.length} zapatillas publicadas`,
    `${comparacion.disparadores.length} disparadores activos; código nuevo de prueba ${codigos.codigo} / ${codigos.codigo_variante} (deshecho)`,
    `${manifiesto.fotos.length} fotos servidas con los mismos bytes; auditoría de funciones: 0 filas`
  ]);
}

// Después de confirmar la base, un fallo de verificación NO deshace nada: se dice qué quedó en cada sitio.
function quedoRestaurado(informe) {
  const b = informe.restaurado.base;
  return `Quedó restaurado (la transacción ya estaba confirmada y NO se deshizo):\n  · base: ${b.productos} zapatillas, ${b.variantes} colores, ${b.tallas} tallas, ${b.fotos} fotos, ${b.historial} eventos de historial y ${b.configuracion} ajustes, con los disparadores reactivados\n  · Storage: ${informe.restaurado.storage.fotos} fotos subidas`;
}

function repetir(destino) {
  return `Para repetir la prueba en un destino limpio:\n  npx --yes supabase@3.0.0 db reset --workdir "${destino.dir}"   (BORRA la base del destino; los objetos de Storage dejan de estar registrados)\n  o bien: npx --yes supabase@3.0.0 stop --no-backup --workdir "${destino.dir}" y vuelve a arrancarlo.`;
}

principal()
  .catch((e) => {
    console.error(e instanceof ErrorRespaldo ? `\n${e.message}` : e);
    if (informe.resultado === 'sin-empezar' || informe.resultado === 'ok') informe.resultado = 'rechazado';
    process.exitCode = 1;
  })
  .finally(() => {
    const args = process.argv.slice(2);
    const i = args.indexOf('--informe');
    if (i >= 0 && args[i + 1]) fs.writeFileSync(path.resolve(args[i + 1]), `${JSON.stringify(informe, null, 2)}\n`);
  });
