/* Etapa 17 · Respaldo y recuperación del catálogo: utilidades compartidas.
 *
 * Formato del paquete (versión 1):
 *   <paquete>/manifiesto.json      versión del formato, fecha, commit, migraciones, recuentos,
 *                                  secuencias y SHA-256 + tamaño de cada archivo
 *   <paquete>/datos/catalogo.json  productos, variantes, tallas, fotos, historial y configuracion
 *                                  (una sola lectura = una instantánea coherente) más migraciones y
 *                                  secuencias
 *   <paquete>/fotos/<objeto>       cada archivo de «fotos-catalogo» referenciado por public.fotos,
 *                                  descargado con la API de Storage, en su misma ruta de objeto
 * Las fotos que son archivos del repositorio («assets/…») no se copian: se registran con su ruta,
 * el commit que las contiene y su SHA-256.
 *
 * NUNCA incluye: claves, sesiones, cuentas de Auth (auth.*), public.administradores ni datos de
 * envío de clientes (esos solo existen en el navegador de cada cliente).
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FORMATO = 'gama-talla-respaldo';
export const VERSION_FORMATO = 1;
export const BUCKET = 'fotos-catalogo';
export const CLI = ['--yes', 'supabase@3.0.0'];
export const TABLAS = ['productos', 'variantes', 'tallas', 'fotos', 'historial', 'configuracion'];
// Tablas cuyos disparadores de usuario se suspenden SOLO durante la inserción de la recuperación.
export const TABLAS_CON_DISPARADORES = ['productos', 'variantes', 'tallas', 'fotos'];
export const MIGRACION_UNISEX = '20261109010000';
export const EXCLUIDO = [
  'claves, contraseñas y tokens (ni de Supabase ni de nadie)',
  'sesiones del panel',
  'cuentas de Auth (auth.*) y public.administradores',
  'datos de envío de los clientes (solo existen en el navegador de cada cliente)'
];
// Una foto de Storage: <origen>/storage/v1/object/public/fotos-catalogo/<objeto>
export const RUTA_STORAGE = /^(https?:\/\/[^/?#]+)\/storage\/v1\/object\/public\/fotos-catalogo\/([^?#]+)$/;
export const OBJETO_VALIDO = /^productos\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9]{13}-[0-9a-z]{10}\.webp$/;

export const sha256 = (datos) => crypto.createHash('sha256').update(datos).digest('hex');
export const esWebp = (b) => b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP';

export class ErrorRespaldo extends Error {}
export function fallar(mensaje) { throw new ErrorRespaldo(mensaje); }

export function argumentos(lista, admitidos) {
  const salida = { _: [] };
  for (let i = 0; i < lista.length; i += 1) {
    const a = lista[i];
    if (!a.startsWith('--')) { salida._.push(a); continue; }
    const [clave, valorIgual] = a.slice(2).split('=');
    if (!admitidos.includes(clave)) fallar(`Opción desconocida: --${clave}`);
    if (valorIgual !== undefined) salida[clave] = valorIgual;
    else if (lista[i + 1] && !lista[i + 1].startsWith('--')) { salida[clave] = lista[i + 1]; i += 1; }
    else salida[clave] = true;
  }
  return salida;
}

function ejecutar(orden, args, { entrada = null, cwd = RAIZ, env = {} } = {}) {
  // En Windows npx es un .cmd y necesita la consola: los argumentos con espacios van entre comillas.
  const conConsola = process.platform === 'win32' && orden === 'npx';
  const opciones = { cwd, input: entrada, env: { ...process.env, ...env }, maxBuffer: 1024 * 1024 * 1024 };
  const r = conConsola
    ? spawnSync([orden, ...args.map((a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a))].join(' '), { ...opciones, shell: true })
    : spawnSync(orden, args, opciones);
  if (r.error) fallar(`No se pudo ejecutar ${orden}: ${r.error.message}`);
  return { codigo: r.status, salida: r.stdout?.toString('utf8') || '', errores: r.stderr?.toString('utf8') || '' };
}

export function git(args) {
  const r = ejecutar('git', args);
  if (r.codigo !== 0) fallar(`git ${args.join(' ')}: ${r.errores.trim()}`);
  return r.salida.trim();
}

// ¿La ruta está dentro del repositorio? (el paquete debe guardarse FUERA)
export function dentroDelRepositorio(ruta) {
  const relativa = path.relative(RAIZ, path.resolve(ruta));
  return !relativa.startsWith('..') && !path.isAbsolute(relativa);
}

// Proyecto local de Supabase: estado (sin imprimir claves) y contenedor de la base. Se niega si la
// API o la base no están en 127.0.0.1 / localhost.
export function proyectoLocal(workdir) {
  const dir = path.resolve(workdir);
  const config = path.join(dir, 'supabase', 'config.toml');
  if (!fs.existsSync(config)) fallar(`No existe ${config}.`);
  const id = /^\s*project_id\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(config, 'utf8'))?.[1];
  if (!id) fallar(`No encuentro project_id en ${config}.`);
  const r = ejecutar('npx', [...CLI, 'status', '-o', 'json', '--workdir', dir]);
  const texto = r.salida.slice(r.salida.indexOf('{'));
  let estado;
  try { estado = JSON.parse(texto); } catch { fallar(`El proyecto local de ${dir} no está en marcha (supabase status no respondió).`); }
  const api = new URL(estado.API_URL);
  const db = new URL(estado.DB_URL);
  for (const host of [api.hostname, db.hostname]) {
    if (!['127.0.0.1', 'localhost'].includes(host)) fallar(`RECHAZADO: ${dir} no es un proyecto LOCAL (${host}).`);
  }
  const contenedor = `supabase_db_${id}`;
  const inspeccion = ejecutar('docker', ['inspect', '-f', '{{.State.Running}}', contenedor]);
  if (inspeccion.codigo !== 0 || inspeccion.salida.trim() !== 'true') fallar(`El contenedor ${contenedor} no está en marcha.`);
  return {
    dir, id, contenedor, api: api.origin,
    publicable: estado.PUBLISHABLE_KEY,
    servicio: estado.SERVICE_ROLE_KEY || estado.SECRET_KEY
  };
}

// SQL contra un contenedor LOCAL como postgres. Devuelve la salida sin alinear (-A -t).
export function sql(contenedor, texto, { silencioso = true } = {}) {
  const r = ejecutar('docker', ['exec', '-i', '-e', 'PGCLIENTENCODING=UTF8', contenedor,
    'psql', '-X', '-A', '-t', ...(silencioso ? ['-q'] : []), '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], { entrada: Buffer.from(texto, 'utf8') });
  if (r.codigo !== 0) fallar(`PostgreSQL (${contenedor}) respondió con error:\n${r.errores.trim()}`);
  return r.salida;
}
export const sqlJson = (contenedor, texto) => {
  const salida = sql(contenedor, texto).trim();
  try { return JSON.parse(salida); } catch { fallar(`Respuesta inesperada de PostgreSQL: ${salida.slice(0, 200)}`); }
};

// Una sola sentencia SELECT: todo sale de la MISMA instantánea de la base.
export const SQL_INSTANTANEA = `
select pg_catalog.jsonb_build_object(
  'tomado_en', pg_catalog.statement_timestamp(),
  'base', pg_catalog.jsonb_build_object(
    'version', pg_catalog.current_setting('server_version'),
    'usuario', current_user,
    'lee_todo', (select r.rolbypassrls or r.rolsuper from pg_catalog.pg_roles r where r.rolname = current_user)),
  'migraciones', (select coalesce(pg_catalog.jsonb_agg(m.version order by m.version), '[]') from supabase_migrations.schema_migrations m),
  'secuencias', pg_catalog.jsonb_build_object(
    'seq_codigo_producto', (select pg_catalog.jsonb_build_object('last_value', s.last_value, 'is_called', s.is_called) from public.seq_codigo_producto s),
    'historial_id_seq', (select pg_catalog.jsonb_build_object('last_value', s.last_value, 'is_called', s.is_called) from public.historial_id_seq s)),
  'tablas', pg_catalog.jsonb_build_object(
    'productos',     (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) order by t.id), '[]') from public.productos t),
    'variantes',     (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) order by t.id), '[]') from public.variantes t),
    'tallas',        (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) order by t.id), '[]') from public.tallas t),
    'fotos',         (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) order by t.id), '[]') from public.fotos t),
    'historial',     (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) order by t.id), '[]') from public.historial t),
    'configuracion', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) order by t.clave), '[]') from public.configuracion t)))
  as respaldo;
`;

// Lectura del proyecto REMOTO enlazado: solo lectura (supabase_read_only_user, que tiene BYPASSRLS).
export function instantaneaRemota() {
  const archivo = path.join(fs.mkdtempSync(path.join(process.env.TEMP || process.env.TMPDIR || '/tmp', 'gt-respaldo-')), 'instantanea.sql');
  fs.writeFileSync(archivo, SQL_INSTANTANEA);
  const r = ejecutar('npx', [...CLI, 'db', 'query', '--remote', '--read-only', '-f', archivo, '--output-format', 'json']);
  fs.rmSync(path.dirname(archivo), { recursive: true, force: true });
  if (r.codigo !== 0) fallar(`No se pudo leer el proyecto remoto: ${r.errores.trim().slice(0, 400)}`);
  let datos;
  try { datos = JSON.parse(r.salida.slice(r.salida.indexOf('{'))); } catch { fallar('Respuesta inesperada de supabase db query.'); }
  const fila = (datos.rows || [])[0];
  if (!fila?.respaldo) fallar('La lectura remota no devolvió la instantánea.');
  return typeof fila.respaldo === 'string' ? JSON.parse(fila.respaldo) : fila.respaldo;
}

export function proyectoRemoto() {
  const ref = fs.readFileSync(path.join(RAIZ, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
  if (!/^[a-z0-9]{20}$/.test(ref)) fallar('No hay un proyecto remoto enlazado (supabase/.temp/project-ref).');
  return { ref, api: `https://${ref}.supabase.co` };
}

export function migracionesDelRepositorio() {
  return fs.readdirSync(path.join(RAIZ, 'supabase', 'migrations'))
    .map((f) => /^(\d{14})_.+\.sql$/.exec(f)?.[1]).filter(Boolean).sort();
}

export function escribirJson(archivo, valor) {
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(archivo, `${JSON.stringify(valor, null, 2)}\n`);
}

// Un marcador $gt…$ que no aparece en el texto: para pasar JSON a SQL sin escaparlo.
export function marcador(...textos) {
  for (;;) {
    const m = `$gt${crypto.randomBytes(6).toString('hex')}$`;
    if (!textos.some((t) => t.includes(m))) return m;
  }
}

export function lineas(titulo, filas) {
  console.log(`\n${titulo}`);
  for (const f of filas) console.log(`  · ${f}`);
}
