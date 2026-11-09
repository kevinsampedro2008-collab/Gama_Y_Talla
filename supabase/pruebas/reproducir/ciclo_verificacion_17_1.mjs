/* Etapa 17.1 · La verificación de la restauración con 1.001 productos y con un 503. SOLO LOCAL.
 *
 *   node supabase/pruebas/reproducir/ciclo_verificacion_17_1.mjs --destino-workdir <destino vacío> --salida <carpeta fuera del repo> --paquete-chico <paquete válido pequeño>
 *
 * Necesita el stack local de ESTE repositorio (origen, catálogo vacío) y OTRO stack local (destino),
 * ambos con las 15 migraciones. El paquete pequeño es un respaldo válido con al menos una foto de
 * Storage (por ejemplo, el que deja ciclo_respaldo_17.mjs).
 *
 * Caso 1 · 1.001 productos publicados: se siembran en el origen, se respaldan con respaldar.mjs y se
 *   restauran. catalogo_publico responde como máximo 1.000 filas por petición (max_rows): la
 *   verificación debe leerla por páginas y acertar con los 1.001 identificadores.
 * Caso 2 · 503 con cuerpo de texto DESPUÉS de confirmar la base (GT_RESPALDO_SIMULAR_FALLO=vista-503):
 *   la restauración termina con error, el informe queda en «verificacion-fallida», se dice qué quedó
 *   restaurado en la base y en Storage, y la base conserva las filas (nada se deshizo).
 * Caso 3 · sin simulación, la misma restauración termina bien.
 * El origen se limpia al terminar (los productos masivos se borran). Código 0 solo si todo se cumple.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ, BUCKET, argumentos, proyectoLocal, sql, sqlJson, dentroDelRepositorio } from '../../../scripts/respaldo/comun.mjs';

const resultados = [];
function exigir(nombre, ok, detalle = '') {
  resultados.push(Boolean(ok));
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${nombre}${!ok && detalle ? ` → ${detalle}` : ''}`);
}
function nodo(script, args, env = {}) {
  const r = spawnSync(process.execPath, [path.join(RAIZ, script), ...args], { cwd: RAIZ, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  return { codigo: r.status, salida: `${r.stdout || ''}${r.stderr || ''}` };
}
const reiniciar = (destino) => spawnSync(`npx --yes supabase@3.0.0 db reset --workdir "${destino.dir}"`, { cwd: RAIZ, shell: true, encoding: 'utf8' });
const cuentas = (c) => sqlJson(c, `select jsonb_build_object('productos', (select count(*) from public.productos), 'variantes', (select count(*) from public.variantes),
  'tallas', (select count(*) from public.tallas), 'fotos', (select count(*) from public.fotos), 'historial', (select count(*) from public.historial),
  'objetos', (select count(*) from storage.objects where bucket_id = '${BUCKET}'));`);
const vacio = (c) => Object.values(c).every((n) => n === 0);
const leerInforme = (archivo) => JSON.parse(fs.readFileSync(archivo, 'utf8'));
const MARCA = 'MARCA MASIVA 17.1'; // en mayúsculas: el servidor normaliza marca, modelo y categoría

async function principal() {
  const args = argumentos(process.argv.slice(2), ['destino-workdir', 'salida', 'paquete-chico']);
  if (!args['destino-workdir'] || !args.salida || !args['paquete-chico']) throw new Error('Uso: --destino-workdir <destino> --salida <carpeta fuera del repo> --paquete-chico <paquete>');
  const salida = path.resolve(args.salida);
  if (dentroDelRepositorio(salida)) throw new Error('La salida debe estar fuera del repositorio.');
  fs.mkdirSync(salida, { recursive: true });
  const chico = path.resolve(args['paquete-chico']);
  const origen = proyectoLocal(RAIZ);
  const destino = proyectoLocal(args['destino-workdir']);
  const antes = cuentas(origen.contenedor);
  if (antes.productos || antes.objetos) throw new Error(`El origen debe empezar con el catálogo vacío (${JSON.stringify(antes)}).`);

  // ------------------------------------------------------------- Caso 1: 1.001 productos
  let grande = null;
  try {
    sql(origen.contenedor, `
      begin;
      insert into public.productos (nombre, marca, categoria, publico, activo)
        select 'Masivo ' || g, '${MARCA}', 'Running', 'unisex', true from generate_series(1, 1001) g;
      insert into public.variantes (producto_id, color, precio)
        select id, 'Negro', 100000 from public.productos where marca = '${MARCA}';
      commit;`);
    exigir('1 origen sembrado: 1.001 productos publicados con un color cada uno', cuentas(origen.contenedor).productos === 1001);
    const vistaOrigen = await fetch(`${origen.api}/rest/v1/catalogo_publico?select=id`, { headers: { apikey: origen.publicable } });
    exigir('1 la API limita cada respuesta a 1.000 filas (la causa del defecto)', (await vistaOrigen.json()).length === 1000);
    const respaldo = nodo('scripts/respaldo/respaldar.mjs', ['--origen', 'local', '--salida', salida]);
    grande = respaldo.salida.split('\n').map((l) => l.replace(/^\s*·\s*/, '').trim()).find((l) => l.startsWith(salida) && l.includes('gama-talla-respaldo-'));
    exigir('1 respaldar.mjs guarda el paquete de 1.001 productos', respaldo.codigo === 0 && grande && fs.existsSync(path.join(grande, 'manifiesto.json')), respaldo.salida.slice(-400));
  } finally {
    sql(origen.contenedor, `begin; delete from public.variantes where producto_id in (select id from public.productos where marca = '${MARCA}');
      delete from public.productos where marca = '${MARCA}'; commit;`);
  }
  exigir('1 el origen queda sin productos masivos', cuentas(origen.contenedor).productos === 0);

  reiniciar(destino);
  exigir('1 destino limpio', vacio(cuentas(destino.contenedor)));
  const informeGrande = path.join(salida, 'informe-1001.json');
  const r1 = nodo('scripts/respaldo/restaurar.mjs', [grande, '--destino-workdir', destino.dir, '--informe', informeGrande]);
  const i1 = leerInforme(informeGrande);
  exigir('1 restaurar.mjs verifica los 1.001 identificadores leyendo catalogo_publico por páginas', r1.codigo === 0 && i1.resultado === 'ok'
    && i1.fases.vista_publica?.filas === 1001 && i1.fases.vista_publica?.paginas >= 3, `${r1.salida.slice(-500)} ${JSON.stringify(i1.fases.vista_publica)}`);
  exigir('1 el destino tiene los 1.001 productos y sus colores', cuentas(destino.contenedor).productos === 1001 && cuentas(destino.contenedor).variantes === 1001);
  const enDestino = await (await fetch(`${destino.api}/rest/v1/catalogo_publico?select=id`, { headers: { apikey: destino.publicable } })).json();
  exigir('1 una petición sin paginar ve solo 1.000, y por eso se pagina', enDestino.length === 1000);

  // ------------------------------------------------------------- Caso 2: 503 tras confirmar la base
  reiniciar(destino);
  exigir('2 destino limpio', vacio(cuentas(destino.contenedor)));
  const informe503 = path.join(salida, 'informe-503.json');
  const r2 = nodo('scripts/respaldo/restaurar.mjs', [chico, '--destino-workdir', destino.dir, '--informe', informe503], { GT_RESPALDO_SIMULAR_FALLO: 'vista-503' });
  const i2 = leerInforme(informe503);
  const base2 = cuentas(destino.contenedor);
  exigir('2 con un 503 de texto tras confirmar la base, la restauración termina con error', r2.codigo === 1 && /FALLÓ LA FASE 3/.test(r2.salida), r2.salida.slice(-500));
  exigir('2 el mensaje trae el estado HTTP y el cuerpo de texto', /No se pudo leer catalogo_publico completa: Página 1 \(desde la fila 0\): HTTP 503 — Service Unavailable: upstream connect error/.test(r2.salida), r2.salida.slice(-500));
  exigir('2 el informe queda en «verificacion-fallida»', i2.resultado === 'verificacion-fallida' && i2.fases.verificacion.ok === false && i2.fases.vista_publica.error.includes('503'), JSON.stringify(i2.resultado));
  exigir('2 el informe y el mensaje dicen qué quedó restaurado en la base y en Storage',
    i2.restaurado.base.productos === base2.productos && i2.restaurado.base.productos > 0 && i2.restaurado.storage.fotos === base2.objetos && i2.restaurado.storage.fotos > 0
    && new RegExp(`base: ${base2.productos} zapatillas, ${base2.variantes} colores, ${base2.tallas} tallas, ${base2.fotos} fotos, ${base2.historial} eventos de historial`).test(r2.salida)
    && new RegExp(`Storage: ${base2.objetos} fotos subidas`).test(r2.salida) && /NO se deshizo/.test(r2.salida), `${JSON.stringify(i2.restaurado)} ${JSON.stringify(base2)}`);
  exigir('2 de verdad no se deshizo nada: la base sigue con las filas restauradas', base2.productos === i2.restaurado.base.productos && base2.historial === i2.restaurado.base.historial);
  exigir('2 las demás comprobaciones corrieron igual (filas, disparadores, códigos nuevos, auditoría)', i2.fases.verificacion.fallos.length === 1 && i2.fases.verificacion.auditoria_filas === 0 && i2.fases.verificacion.codigo_nuevo, JSON.stringify(i2.fases.verificacion));

  // ------------------------------------------------------------- Caso 3: sin simulación
  reiniciar(destino);
  const informeOk = path.join(salida, 'informe-sin-fallo.json');
  const r3 = nodo('scripts/respaldo/restaurar.mjs', [chico, '--destino-workdir', destino.dir, '--informe', informeOk]);
  const i3 = leerInforme(informeOk);
  exigir('3 sin simulación, la misma restauración termina bien y verifica la vista por páginas', r3.codigo === 0 && i3.resultado === 'ok' && i3.fases.vista_publica.filas >= 1, r3.salida.slice(-400));

  const fallidas = resultados.filter((x) => !x).length;
  console.log(`\n${resultados.length - fallidas} de ${resultados.length} comprobaciones correctas.`);
  if (fallidas) process.exitCode = 1;
}

principal().catch((e) => { console.error(e); process.exitCode = 1; });
