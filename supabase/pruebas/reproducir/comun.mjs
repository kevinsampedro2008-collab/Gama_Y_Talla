/* Utilidades comunes de los guiones de reproducción. SOLO LOCAL.
 *
 * Todos trabajan sobre el contenedor de la base del stack local de Supabase
 * (supabase_db_Yeny_Oficial) mediante `docker exec`: nunca abren una conexión de red a una
 * base y no pueden alcanzar el proyecto remoto. Antes de empezar comprueban que ese
 * contenedor existe, está en marcha y tiene aplicada la migración 20261107030000.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const RAIZ = fileURLToPath(new URL('../../../', import.meta.url));
export const CONTENEDOR = 'supabase_db_Yeny_Oficial';
export const leer = (ruta) => fs.readFileSync(RAIZ + ruta, 'utf8').replace(/\r\n/g, '\n');

// Ejecuta SQL en el contenedor local y devuelve { codigo, salida, error }.
export function psql(sql, { usuario = 'postgres', opciones = [] } = {}) {
  const r = spawnSync('docker', ['exec', '-i', CONTENEDOR, 'psql', '-X', '-q', '-U', usuario, '-d', 'postgres', ...opciones],
    { input: sql, encoding: 'utf8' });
  return { codigo: r.status, salida: (r.stdout || '').trim(), error: (r.stderr || '').trim() };
}

export function exigirEntornoLocal() {
  const estado = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', CONTENEDOR], { encoding: 'utf8' });
  if (estado.status !== 0 || estado.stdout.trim() !== 'true') {
    console.error(`No está en marcha el contenedor local ${CONTENEDOR}. Arranca el stack local (ver README.md).`);
    process.exit(2);
  }
  const m = psql("select count(*) from supabase_migrations.schema_migrations where version = '20261107030000'", { opciones: ['-tA'] });
  if (m.codigo !== 0 || m.salida !== '1') {
    console.error('La base local no tiene aplicada 20261107030000. Ejecuta antes ciclo_atomicidad.sh (ver README.md).');
    process.exit(2);
  }
}
