/* Etapa 17 · Respaldar el catálogo en un paquete verificable, FUERA del repositorio.
 *
 *   node scripts/respaldo/respaldar.mjs --origen local --salida <carpeta> [--workdir <proyecto>]
 *   node scripts/respaldo/respaldar.mjs --origen remoto --confirmar-remoto --salida <carpeta>
 *
 * · local: el stack local de Supabase del proyecto (por omisión, este repositorio); lee la base
 *   con psql dentro de su contenedor y las fotos con la API de Storage local.
 * · remoto: el proyecto enlazado (supabase/.temp/project-ref), SOLO LECTURA con
 *   «supabase db query --remote --read-only» (supabase_read_only_user, con BYPASSRLS) y las fotos
 *   con la URL pública de Storage. Exige --confirmar-remoto. No escribe nada en el proyecto.
 *
 * Una sola sentencia SELECT lee productos, variantes, tallas, fotos, historial, configuración,
 * migraciones y secuencias: todo sale de la misma instantánea. Las fotos de «fotos-catalogo» se
 * descargan una a una y se comprueban (WebP, SHA-256); las del repositorio («assets/…») se
 * registran con su commit. El paquete se escribe primero como «<nombre>.incompleto» y solo se
 * renombra al final, ya verificado: un respaldo interrumpido nunca parece válido.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  FORMATO, VERSION_FORMATO, TABLAS, BUCKET, EXCLUIDO, RAIZ, RUTA_STORAGE, OBJETO_VALIDO, ErrorRespaldo, fallar, argumentos,
  proyectoLocal, proyectoRemoto, sql, SQL_INSTANTANEA, instantaneaRemota, sha256, esWebp, git, dentroDelRepositorio, escribirJson, lineas
} from './comun.mjs';
import { verificarPaquete } from './verificar.mjs';

async function principal() {
  const args = argumentos(process.argv.slice(2), ['origen', 'salida', 'workdir', 'confirmar-remoto']);
  if (!['local', 'remoto'].includes(args.origen)) fallar('Indica --origen local o --origen remoto.');
  if (!args.salida || args.salida === true) fallar('Indica --salida <carpeta> (fuera del repositorio).');
  const salida = path.resolve(args.salida);
  if (dentroDelRepositorio(salida)) fallar(`RECHAZADO: ${salida} está dentro del repositorio. Guarda el respaldo fuera de él.`);

  // 1. Instantánea de la base
  let origen;
  let instantanea;
  if (args.origen === 'local') {
    const local = proyectoLocal(args.workdir || RAIZ);
    origen = { tipo: 'local', api: local.api, proyecto: local.id };
    console.log(`Leyendo la base local ${local.contenedor} (${local.api})…`);
    instantanea = JSON.parse(sql(local.contenedor, SQL_INSTANTANEA).trim());
  } else {
    if (args['confirmar-remoto'] !== true) fallar('Para leer el proyecto remoto añade --confirmar-remoto (solo lectura).');
    const remoto = proyectoRemoto();
    origen = { tipo: 'remoto', api: remoto.api, proyecto: remoto.ref };
    console.log(`Leyendo el proyecto remoto ${remoto.ref} en modo de solo lectura…`);
    instantanea = instantaneaRemota();
  }
  if (instantanea.base?.lee_todo !== true) fallar(`El usuario ${instantanea.base?.usuario} no puede leer todo el historial (sin BYPASSRLS): el respaldo no sería completo.`);
  const t = instantanea.tablas;

  // 2. Fotos: de Storage (se descargan) o del repositorio (se registra su commit)
  const fotos = [];
  const versionadas = [];
  const archivosFotos = [];
  for (const f of t.fotos) {
    const m = RUTA_STORAGE.exec(f.ruta);
    if (m) {
      if (m[1] !== origen.api) fallar(`La foto ${f.id} apunta a otro origen (${m[1]}), no a ${origen.api}. Revísala antes de respaldar.`);
      const objeto = m[2];
      if (!OBJETO_VALIDO.test(objeto)) fallar(`La foto ${f.id} tiene un nombre de objeto inesperado: ${objeto}`);
      const r = await fetch(`${origen.api}/storage/v1/object/public/${BUCKET}/${objeto}`);
      if (!r.ok) fallar(`No se pudo descargar ${objeto} (HTTP ${r.status}). No se escribió ningún paquete.`);
      const bytes = Buffer.from(await r.arrayBuffer());
      if (!esWebp(bytes)) fallar(`${objeto} no es un WebP.`);
      const archivo = `fotos/${objeto}`;
      fotos.push({ id: f.id, variante_id: f.variante_id, ruta_original: f.ruta, objeto, archivo, bytes: bytes.length, sha256: sha256(bytes) });
      archivosFotos.push({ archivo, bytes });
    } else if (/^https?:/i.test(f.ruta)) {
      fallar(`La foto ${f.id} es una URL externa (${f.ruta}): no se puede respaldar con garantías.`);
    } else {
      const ruta = f.ruta.replace(/^\.?\//, '');
      if (ruta.includes('..') || !fs.existsSync(path.join(RAIZ, ruta))) fallar(`La foto ${f.id} apunta a un archivo del sitio que no existe: ${f.ruta}`);
      try { git(['ls-files', '--error-unmatch', '--', ruta]); } catch { fallar(`La foto ${ruta} no está versionada en Git: no se puede registrar su commit.`); }
      if (git(['status', '--porcelain', '--', ruta])) fallar(`La foto ${ruta} tiene cambios sin commit: el respaldo no podría recuperarla igual.`);
      versionadas.push({ id: f.id, variante_id: f.variante_id, ruta: f.ruta, commit: git(['log', '-1', '--format=%H', '--', ruta]),
        bytes: fs.statSync(path.join(RAIZ, ruta)).size, sha256: sha256(fs.readFileSync(path.join(RAIZ, ruta))) });
    }
  }

  // 3. Paquete en una carpeta provisional; se renombra al final
  const sello = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
  const nombre = `gama-talla-respaldo-${sello}-${origen.tipo}`;
  const final = path.join(salida, nombre);
  const provisional = `${final}.incompleto`;
  if (fs.existsSync(final) || fs.existsSync(provisional)) fallar(`Ya existe ${final}.`);
  fs.mkdirSync(provisional, { recursive: true });
  const datos = { formato: FORMATO, version_formato: VERSION_FORMATO, tomado_en: instantanea.tomado_en, migraciones: instantanea.migraciones,
    secuencias: instantanea.secuencias, tablas: Object.fromEntries(TABLAS.map((n) => [n, t[n]])) };
  const textoDatos = `${JSON.stringify(datos, null, 2)}\n`;
  fs.mkdirSync(path.join(provisional, 'datos'), { recursive: true });
  fs.writeFileSync(path.join(provisional, 'datos', 'catalogo.json'), textoDatos);
  const archivos = [{ ruta: 'datos/catalogo.json', bytes: Buffer.byteLength(textoDatos), sha256: sha256(Buffer.from(textoDatos)) }];
  for (const { archivo, bytes } of archivosFotos) {
    fs.mkdirSync(path.dirname(path.join(provisional, archivo)), { recursive: true });
    fs.writeFileSync(path.join(provisional, archivo), bytes);
    archivos.push({ ruta: archivo, bytes: bytes.length, sha256: sha256(bytes) });
  }
  let head = null; let rama = null; let limpio = null;
  try { head = git(['rev-parse', 'HEAD']); rama = git(['rev-parse', '--abbrev-ref', 'HEAD']); limpio = git(['status', '--porcelain']) === ''; } catch { /* sin Git */ }
  const manifiesto = {
    formato: FORMATO, version_formato: VERSION_FORMATO,
    creado_en: new Date().toISOString(), instantanea_en: instantanea.tomado_en,
    origen: { ...origen, base: instantanea.base },
    commit: { head, rama, limpio },
    migraciones: instantanea.migraciones,
    recuentos: { ...Object.fromEntries(TABLAS.map((n) => [n, t[n].length])), fotos_storage: fotos.length, fotos_versionadas: versionadas.length },
    secuencias: instantanea.secuencias,
    archivos, fotos, fotos_versionadas: versionadas,
    excluido: EXCLUIDO
  };
  escribirJson(path.join(provisional, 'manifiesto.json'), manifiesto);

  // 4. Verificación del paquete recién escrito; solo entonces se da por bueno
  const { problemas } = verificarPaquete(provisional);
  if (problemas.length) {
    fallar(`El paquete escrito no pasó la verificación (queda en ${provisional} para revisarlo):\n  ${problemas.join('\n  ')}`);
  }
  fs.renameSync(provisional, final);
  lineas('Respaldo completo y verificado:', [
    final,
    `origen ${origen.tipo} ${origen.api} · instantánea ${instantanea.tomado_en}`,
    `commit ${head ? head.slice(0, 7) : '—'}${limpio === false ? ' (con cambios sin commit en el repositorio)' : ''} · ${instantanea.migraciones.length} migraciones (última ${instantanea.migraciones.at(-1)})`,
    `${t.productos.length} zapatillas · ${t.variantes.length} colores · ${t.tallas.length} tallas · ${t.fotos.length} fotos (${fotos.length} de Storage, ${versionadas.length} del repositorio) · ${t.historial.length} eventos de historial`,
    `excluido: ${EXCLUIDO.join('; ')}`
  ]);
  return final;
}

principal().catch((e) => {
  console.error(e instanceof ErrorRespaldo ? `\n${e.message}` : e);
  process.exit(1);
});
