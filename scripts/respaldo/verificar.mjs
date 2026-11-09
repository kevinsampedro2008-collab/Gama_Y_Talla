/* Etapa 17 · Verificar un paquete de respaldo SIN escribir nada en ningún sitio.
 *
 *   node scripts/respaldo/verificar.mjs <carpeta del paquete>
 *
 * Comprueba: formato y versión, que cada archivo listado exista con su tamaño y su SHA-256, que no
 * haya archivos de más, que los recuentos y las migraciones coincidan con los datos, las relaciones
 * (colores → zapatillas, tallas y fotos → colores), claves públicas únicas, que cada foto de
 * Storage sea un WebP que está en el paquete y que cada foto del repositorio siga igual en su
 * commit. Código de salida 0 solo si no hay ningún problema.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FORMATO, VERSION_FORMATO, TABLAS, OBJETO_VALIDO, RUTA_STORAGE, ErrorRespaldo, RAIZ, sha256, esWebp
} from './comun.mjs';

function listarArchivos(dir, base = dir) {
  const salida = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) salida.push(...listarArchivos(ruta, base));
    else salida.push(path.relative(base, ruta).split(path.sep).join('/'));
  }
  return salida;
}

export function verificarPaquete(paquete, { comprobarRepositorio = true } = {}) {
  const problemas = [];
  const dir = path.resolve(paquete);
  const archivoManifiesto = path.join(dir, 'manifiesto.json');
  if (!fs.existsSync(archivoManifiesto)) return { problemas: [`No hay manifiesto.json en ${dir}.`] };
  let manifiesto;
  try { manifiesto = JSON.parse(fs.readFileSync(archivoManifiesto, 'utf8')); } catch { return { problemas: ['manifiesto.json no es JSON válido.'] }; }
  if (manifiesto.formato !== FORMATO || manifiesto.version_formato !== VERSION_FORMATO) {
    return { problemas: [`Formato no admitido: ${manifiesto.formato} v${manifiesto.version_formato} (se espera ${FORMATO} v${VERSION_FORMATO}).`] };
  }

  // 1. Archivos: existen, tamaño y SHA-256; ninguno de más (salvo el propio manifiesto).
  const listados = new Map((manifiesto.archivos || []).map((a) => [a.ruta, a]));
  for (const [ruta, a] of listados) {
    if (ruta.includes('..') || path.isAbsolute(ruta)) { problemas.push(`Ruta no permitida en el manifiesto: ${ruta}`); continue; }
    const completo = path.join(dir, ruta);
    if (!fs.existsSync(completo)) { problemas.push(`Falta el archivo ${ruta}.`); continue; }
    const bytes = fs.readFileSync(completo);
    if (bytes.length !== a.bytes) problemas.push(`${ruta}: tamaño ${bytes.length}, el manifiesto dice ${a.bytes}.`);
    if (sha256(bytes) !== a.sha256) problemas.push(`${ruta}: el SHA-256 no coincide (archivo alterado).`);
  }
  for (const ruta of listarArchivos(dir)) {
    if (ruta !== 'manifiesto.json' && !listados.has(ruta)) problemas.push(`Archivo que no está en el manifiesto: ${ruta}`);
  }
  if (!listados.has('datos/catalogo.json')) problemas.push('El manifiesto no lista datos/catalogo.json.');
  if (problemas.length) return { manifiesto, problemas };

  // 2. Datos: recuentos, migraciones y relaciones.
  let datos;
  try { datos = JSON.parse(fs.readFileSync(path.join(dir, 'datos', 'catalogo.json'), 'utf8')); } catch { return { manifiesto, problemas: ['datos/catalogo.json no es JSON válido.'] }; }
  const t = datos.tablas || {};
  for (const tabla of TABLAS) {
    if (!Array.isArray(t[tabla])) { problemas.push(`Falta la tabla ${tabla} en los datos.`); continue; }
    if (manifiesto.recuentos?.[tabla] !== t[tabla].length) problemas.push(`Recuento de ${tabla}: datos ${t[tabla].length}, manifiesto ${manifiesto.recuentos?.[tabla]}.`);
  }
  if (problemas.length) return { manifiesto, datos, problemas };
  if (JSON.stringify(datos.migraciones) !== JSON.stringify(manifiesto.migraciones)) problemas.push('Las migraciones de los datos y del manifiesto no coinciden.');
  const ids = (tabla) => new Set(t[tabla].map((f) => f.id));
  const productos = ids('productos');
  const variantes = ids('variantes');
  for (const v of t.variantes) if (!productos.has(v.producto_id)) problemas.push(`El color ${v.codigo_variante} apunta a una zapatilla que no está.`);
  for (const x of t.tallas) if (!variantes.has(x.variante_id)) problemas.push(`La talla ${x.talla} (${x.id}) apunta a un color que no está.`);
  for (const f of t.fotos) if (!variantes.has(f.variante_id)) problemas.push(`La foto ${f.id} apunta a un color que no está.`);
  const claves = t.productos.map((p) => p.clave_catalogo);
  if (claves.some((c) => typeof c !== 'string' || !c) || new Set(claves).size !== claves.length) problemas.push('Claves públicas (clave_catalogo) de zapatillas vacías o repetidas.');
  const clavesColor = t.variantes.map((v) => `${v.producto_id}/${v.clave_catalogo}`);
  if (t.variantes.some((v) => typeof v.clave_catalogo !== 'string' || !v.clave_catalogo) || new Set(clavesColor).size !== clavesColor.length) problemas.push('Claves públicas de colores vacías o repetidas.');

  // 3. Fotos: cada fila de public.fotos está en el paquete (Storage) o es un archivo versionado.
  const deStorage = new Map((manifiesto.fotos || []).map((f) => [f.id, f]));
  const versionadas = new Map((manifiesto.fotos_versionadas || []).map((f) => [f.id, f]));
  for (const f of t.fotos) {
    const enStorage = deStorage.get(f.id);
    const enRepo = versionadas.get(f.id);
    if (!enStorage && !enRepo) { problemas.push(`La foto ${f.id} (${f.ruta}) no está en el manifiesto.`); continue; }
    if (enStorage) {
      const m = RUTA_STORAGE.exec(f.ruta);
      if (!m || m[2] !== enStorage.objeto || !OBJETO_VALIDO.test(enStorage.objeto)) { problemas.push(`La foto ${f.id} no coincide con su objeto de Storage.`); continue; }
      const archivo = listados.get(enStorage.archivo);
      if (!archivo || archivo.sha256 !== enStorage.sha256) { problemas.push(`Falta o no coincide el archivo de la foto ${enStorage.objeto}.`); continue; }
      if (!esWebp(fs.readFileSync(path.join(dir, enStorage.archivo)))) problemas.push(`${enStorage.archivo} no es un WebP.`);
    }
    if (enRepo && comprobarRepositorio) {
      const completo = path.join(RAIZ, enRepo.ruta);
      if (!fs.existsSync(completo)) problemas.push(`La foto versionada ${enRepo.ruta} no existe en este repositorio.`);
      else if (sha256(fs.readFileSync(completo)) !== enRepo.sha256) {
        problemas.push(`La foto versionada ${enRepo.ruta} cambió desde el commit ${enRepo.commit.slice(0, 7)}; recupérala con: git show ${enRepo.commit}:${enRepo.ruta}`);
      }
    }
  }
  if ((manifiesto.fotos || []).length + (manifiesto.fotos_versionadas || []).length !== t.fotos.length) problemas.push('El manifiesto lista fotos que no están en los datos.');
  return { manifiesto, datos, problemas };
}

// Línea de comandos
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const paquete = process.argv[2];
    if (!paquete) throw new ErrorRespaldo('Uso: node scripts/respaldo/verificar.mjs <carpeta del paquete>');
    const { manifiesto, problemas } = verificarPaquete(paquete);
    if (manifiesto) {
      console.log(`Paquete ${path.resolve(paquete)}`);
      console.log(`  formato ${manifiesto.formato} v${manifiesto.version_formato} · creado ${manifiesto.creado_en} · commit ${manifiesto.commit?.head?.slice(0, 7)} · ${manifiesto.migraciones?.length} migraciones`);
      console.log(`  ${Object.entries(manifiesto.recuentos || {}).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
    }
    if (problemas.length) {
      console.error(`\nPAQUETE NO VÁLIDO (${problemas.length} ${problemas.length === 1 ? 'problema' : 'problemas'}):`);
      for (const p of problemas) console.error(`  ✗ ${p}`);
      process.exit(1);
    }
    console.log('\nPaquete válido: todos los archivos coinciden con su SHA-256 y los datos son coherentes.');
  } catch (e) {
    console.error(e instanceof ErrorRespaldo ? e.message : e);
    process.exit(1);
  }
}
