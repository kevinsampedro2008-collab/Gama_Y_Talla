/* Etapa 17 · Preparar OTRO proyecto local de Supabase, vacío y desechable, para restaurar en él.
 *
 *   node scripts/respaldo/preparar-destino.mjs --carpeta <carpeta nueva fuera del repositorio> [--id gt_restauracion]
 *
 * Copia supabase/config.toml con otro project_id y los puertos 543xx → 563xx (no choca con el stack
 * de este repositorio), las migraciones del repositorio (el esquema final de esta entrega) y los
 * archivos de versión de supabase/.temp (para arrancar las mismas imágenes que el proyecto
 * enlazado), SIN project-ref ni datos del enlace. No arranca nada: imprime el comando.
 */
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ, ErrorRespaldo, fallar, argumentos, dentroDelRepositorio, migracionesDelRepositorio } from './comun.mjs';

try {
  const args = argumentos(process.argv.slice(2), ['carpeta', 'id']);
  if (!args.carpeta || args.carpeta === true) fallar('Indica --carpeta <carpeta nueva fuera del repositorio>.');
  const carpeta = path.resolve(args.carpeta);
  const id = typeof args.id === 'string' ? args.id : 'gt_restauracion';
  if (!/^[a-z][a-z0-9_]{2,40}$/.test(id) || id === 'Yeny_Oficial') fallar('El --id debe ser distinto del proyecto del repositorio (minúsculas, números y _).');
  if (dentroDelRepositorio(carpeta)) fallar('RECHAZADO: la carpeta del destino debe estar fuera del repositorio.');
  if (fs.existsSync(carpeta) && fs.readdirSync(carpeta).length) fallar(`RECHAZADO: ${carpeta} ya existe y no está vacía.`);
  const origen = path.join(RAIZ, 'supabase');
  const destino = path.join(carpeta, 'supabase');
  fs.mkdirSync(path.join(destino, 'migrations'), { recursive: true });
  let config = fs.readFileSync(path.join(origen, 'config.toml'), 'utf8');
  config = config.replace(/^(\s*project_id\s*=\s*)"[^"]*"/m, `$1"${id}"`).replace(/\b543(\d\d)\b/g, '563$1');
  fs.writeFileSync(path.join(destino, 'config.toml'), config);
  for (const f of fs.readdirSync(path.join(origen, 'migrations')).filter((x) => x.endsWith('.sql'))) {
    fs.copyFileSync(path.join(origen, 'migrations', f), path.join(destino, 'migrations', f));
  }
  const temp = path.join(origen, '.temp');
  if (fs.existsSync(temp)) {
    fs.mkdirSync(path.join(destino, '.temp'), { recursive: true });
    for (const f of fs.readdirSync(temp).filter((x) => /-version$|^storage-migration$/.test(x))) fs.copyFileSync(path.join(temp, f), path.join(destino, '.temp', f));
  }
  console.log(`Destino preparado en ${carpeta} (project_id ${id}, API en 127.0.0.1:56321, ${migracionesDelRepositorio().length} migraciones).`);
  console.log('Para arrancarlo (crea la base vacía con todas las migraciones):');
  console.log(`  npx --yes supabase@3.0.0 start --workdir "${carpeta}" -x realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor`);
  console.log('Para desecharlo:');
  console.log(`  npx --yes supabase@3.0.0 stop --no-backup --workdir "${carpeta}"`);
} catch (e) {
  console.error(e instanceof ErrorRespaldo ? e.message : e);
  process.exit(1);
}
