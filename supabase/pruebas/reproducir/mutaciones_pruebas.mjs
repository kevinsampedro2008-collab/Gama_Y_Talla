/* ¿Detectan las pruebas 60 y 40 cada protección rota? SOLO LOCAL.
 *
 * La mutación se inyecta justo después del «begin;» de la prueba, así que se deshace con su
 * propio ROLLBACK. Cada prueba debe FALLAR (salida distinta de 0) con cada mutación y pasar
 * sin ninguna. «OK(E)» = detectada por un error de la prueba y no por una aserción: también
 * hace fallar la batería, pero se informa aparte.
 *
 *   node supabase/pruebas/reproducir/mutaciones_pruebas.mjs
 *
 * Como las pruebas 10 a 60, escribe y deshace: el ROLLBACK no devuelve las secuencias. Nunca
 * en un proyecto remoto.
 */
import { exigirEntornoLocal, leer, psql } from './comun.mjs';

exigirEntornoLocal();

const ESTADO = (cond) => `create or replace function public.fn_estado_publico(p_estado public.estado_talla, p_vigencia_desde timestamptz, p_vence_en timestamptz)
  returns public.estado_publico language sql stable security invoker set search_path = '' as $f$
  select case when p_estado = 'AGOTADA' then 'AGOTADO'::public.estado_publico when p_estado = 'REVISAR' then 'POR_REVISAR'::public.estado_publico
    when p_vigencia_desde is null or p_vence_en is null then 'POR_REVISAR'::public.estado_publico
    when ${cond} then 'DISPONIBLE'::public.estado_publico else 'POR_REVISAR'::public.estado_publico end; $f$;`;
// Reescriben la función vigente con un cambio puntual de texto; si el texto ya no está, la
// mutación se declara no aplicable (y cuenta como no detectada).
const REESCRIBIR = (firma) => (de, a) => `do $m$ declare d text; begin
  d := pg_get_functiondef('${firma}'::regprocedure);
  if position(${de} in d) = 0 then raise exception 'mutación no aplicable'; end if;
  execute replace(d, ${de}, ${a}); end $m$;`;
const DISPARADOR = REESCRIBIR('public.fn_tallas_antes_de_escribir()');
const VALOR = REESCRIBIR('public.fn_valor_talla(text)');
const CHECK = (expr) => `alter table public.tallas drop constraint tallas_talla_formato; alter table public.tallas add constraint tallas_talla_formato check (${expr});`;
const GRAMATICA = `talla ~ '^[0-9]{1,3}([.,][0-9]{1,2}| [0-9]{1,2}/[0-9]{1,2})?$' and (strpos(talla, '/') = 0 or (((regexp_match(talla, ' ([0-9]{1,2})/([0-9]{1,2})$'))[2])::integer > 0 and ((regexp_match(talla, ' ([0-9]{1,2})/([0-9]{1,2})$'))[1])::integer < ((regexp_match(talla, ' ([0-9]{1,2})/([0-9]{1,2})$'))[2])::integer))`;

const M60 = [
  ['authenticated recupera DELETE', 'grant delete on public.tallas to authenticated;'],
  ['authenticated gana TRUNCATE', 'grant truncate on public.tallas to authenticated;'],
  ['anon gana DELETE', 'grant delete on public.tallas to anon;'],
  ['rol intermedio con DELETE (miembro sin heredar)', 'create role borrador_60 nologin; grant delete on public.tallas to borrador_60; grant borrador_60 to authenticated with inherit false;'],
  ['función DEFINER que borra tallas', `create function public.fn_borrar(p uuid) returns void language plpgsql security definer set search_path = '' as $f$ begin if not public.fn_es_administrador() then raise exception 'x'; end if; delete from public.tallas where id = p; end $f$; grant execute on function public.fn_borrar(uuid) to authenticated;`],
  ['authenticated pierde UPDATE (no puede desactivar)', 'revoke update on public.tallas from authenticated;'],
  ['sin disparador de historial', 'drop trigger tr_historial_tallas on public.tallas;'],
  ['CHECK de formato eliminado', 'alter table public.tallas drop constraint tallas_talla_formato;'],
  ['CHECK admite fracciones impropias (40 4/3)', CHECK(`talla ~ '^[0-9]{1,3}([.,][0-9]{1,2}| [0-9]{1,2}/[0-9]{1,2})?$' and (strpos(talla, '/') = 0 or ((regexp_match(talla, ' ([0-9]{1,2})/([0-9]{1,2})$'))[2])::integer > 0)`)],
  ['CHECK admite espacios exteriores', CHECK(GRAMATICA.replace(/talla ~/, 'btrim(talla) ~'))],
  ['CHECK con la gramática estricta anterior (rechaza 40,50 y 40 2/4)', CHECK(`talla ~ '^[1-9][0-9]{0,2}([.,][0-9]?[1-9]| [1-9][0-9]?/[1-9][0-9]?)?$'`)],
  ['CHECK con fn_valor_talla (exige EXECUTE)', CHECK('public.fn_valor_talla(talla) is not null')],
  ['fn_valor_talla devuelve 0 en vez de NULL', VALOR(`'  end;'`, `'    else 0 end;'`)],
  ['fn_valor_talla trata la coma como separador de miles', VALOR(`'translate(p_talla, '','', ''.'')'`, `'translate(p_talla, '','', '''')'`)],
  ['fn_valor_talla admite \\d (cifras no ASCII)', VALOR(`'^[0-9]{1,3}$'`, `'^\\d+$'`)],
  ['fn_valor_talla admite fracciones impropias', VALOR(`'when f.d > 0 and f.n < f.d'`, `'when f.d > 0'`)],
  ['fn_valor_talla sin trim_scale (40,50 -> 40.50)', VALOR(`'pg_catalog.trim_scale(pg_catalog.translate(p_talla, '','', ''.'')::numeric)'`, `'pg_catalog.translate(p_talla, '','', ''.'')::numeric'`)],
  ['CHECK sin la regla del denominador > 0', CHECK(`talla ~ '^[0-9]{1,3}([.,][0-9]{1,2}| [0-9]{1,2}/[0-9]{1,2})?$' and (strpos(talla, '/') = 0 or ((regexp_match(talla, ' ([0-9]{1,2})/([0-9]{1,2})$'))[1])::integer <= ((regexp_match(talla, ' ([0-9]{1,2})/([0-9]{1,2})$'))[2])::integer)`)],
  ['fn_valor_talla pasa a STABLE', 'alter function public.fn_valor_talla(text) stable;'],
  ['service_role gana EXECUTE sobre fn_valor_talla', 'grant execute on function public.fn_valor_talla(text) to service_role;'],
  ['fn_estado_publico antigua (sin inicio)', ESTADO('now() < p_vence_en')],
  ['fn_estado_publico incluye el vencimiento', ESTADO('p_vigencia_desde <= now() and now() <= p_vence_en')],
  ['fn_estado_publico excluye el inicio', ESTADO('p_vigencia_desde < now() and now() < p_vence_en')],
  ['fn_estado_publico: AGOTADA con fecha vencida -> POR_REVISAR', `create or replace function public.fn_estado_publico(p_estado public.estado_talla, p_vigencia_desde timestamptz, p_vence_en timestamptz)
  returns public.estado_publico language sql stable security invoker set search_path = '' as $f$
  select case when p_vence_en < now() then 'POR_REVISAR'::public.estado_publico when p_estado = 'AGOTADA' then 'AGOTADO'::public.estado_publico when p_estado = 'REVISAR' then 'POR_REVISAR'::public.estado_publico
    when p_vigencia_desde is null or p_vence_en is null then 'POR_REVISAR'::public.estado_publico
    when p_vigencia_desde <= now() and now() < p_vence_en then 'DISPONIBLE'::public.estado_publico else 'POR_REVISAR'::public.estado_publico end; $f$;`],
  ['disparador sin validar publicado_en', DISPARADOR(`'new.publicado_en > v_ahora'`, `'false'`)],
  ['disparador sin validar confirmado_en', DISPARADOR(`'new.confirmado_en > v_ahora'`, `'false'`)],
  ['disparador sin validar vigencia_desde', DISPARADOR(`'new.vigencia_desde > v_ahora'`, `'false'`)],
  ['disparador con 1 minuto de tolerancia', `${DISPARADOR(`'new.publicado_en > v_ahora'`, `'new.publicado_en > v_ahora + interval ''1 minute'''`)} ${DISPARADOR(`'new.vigencia_desde > v_ahora'`, `'new.vigencia_desde > v_ahora + interval ''1 minute'''`)}`],
  ['disparador rechaza también el instante actual (>=)', DISPARADOR(`'new.vigencia_desde > v_ahora'`, `'new.vigencia_desde >= v_ahora'`)],
  ['disparador acepta infinity', DISPARADOR(`'not pg_catalog.isfinite(new.vigencia_desde)'`, `'false'`)],
  ['disparador revisa fechas no modificadas', DISPARADOR(`'v_revisar_vigencia   := new.vigencia_desde is distinct from old.vigencia_desde;'`, `'v_revisar_vigencia := true;'`)],
  ['disparador solo valida en INSERT', DISPARADOR(`'if tg_op = ''UPDATE'' then'`, `'if tg_op = ''UPDATE'' then v_revisar_publicado := false; v_revisar_confirmado := false; v_revisar_vigencia := false; elsif false then'`)],
  ['disparador desactivado', 'alter table public.tallas disable trigger tr_tallas_vigencia;'],
  ['vigencia predeterminada fija (ignora configuración)', `create or replace function public.fn_confirmar_por_proveedor(p_talla_id uuid, p_vigencia_horas smallint default null) returns public.tallas language plpgsql security definer set search_path = '' as $f$ declare v public.tallas; begin if not public.fn_es_administrador() then raise exception 'Solo un administrador puede confirmar disponibilidad.'; end if; update public.tallas set estado = 'CONFIRMADA', confirmado_en = now(), vigencia_desde = now(), vigencia_horas = coalesce(p_vigencia_horas, 48), origen = 'proveedor', activa = true where id = p_talla_id returning * into v; return v; end $f$;`],
  ['función IMMUTABLE nueva que mira el reloj', `create function public.fn_reloj() returns timestamptz language sql immutable set search_path = '' as 'select now()';`]
];

const M40 = [
  ['40: authenticated recupera DELETE', 'grant delete on public.tallas to authenticated;'],
  ['40: authenticated gana TRUNCATE', 'grant truncate on public.tallas to authenticated;']
];

function ejecutar(archivo, mutacion) {
  const texto = leer(`supabase/pruebas/${archivo}`);
  const i = texto.search(/^begin;$/m);
  if (i < 0) throw new Error(`sin «begin;» en ${archivo}`);
  const fin = i + 'begin;'.length;
  const r = psql(`${texto.slice(0, fin)}\n-- MUTACIÓN\n${mutacion}\n${texto.slice(fin)}`, { opciones: ['-v', 'ON_ERROR_STOP=1'] });
  const salida = `${r.salida}\n${r.error}`;
  const motivo = (salida.match(/FALLA {2}.*|ERROR: {2}.*/) || [''])[0];
  return { codigo: r.codigo, ok: (salida.match(/OK {5}/g) || []).length, motivo };
}

let total = 0; let detectadas = 0; let bases = true;
for (const [archivo, lista] of [['60_integridad_tallas_vigencia.sql', M60], ['40_acceso_interno.sql', M40]]) {
  const b = ejecutar(archivo, '');
  bases = bases && b.codigo === 0;
  console.log(`${b.codigo === 0 ? 'OK   ' : 'FALLA'} ${archivo} sin mutación: pasa (${b.ok} OK) ${b.codigo === 0 ? '' : b.motivo}`);
  for (const [nombre, mutacion] of lista) {
    const r = ejecutar(archivo, mutacion);
    const aplicable = !/mutación no aplicable/.test(r.motivo);
    const ok = r.codigo !== 0 && aplicable && /FALLA {2}/.test(r.motivo);
    const okError = r.codigo !== 0 && aplicable && !ok && /^ERROR/.test(r.motivo);
    total += 1; if (ok || okError) detectadas += 1;
    console.log(`${ok ? 'OK   ' : okError ? 'OK(E)' : 'FALLA'} ${nombre.padEnd(60)} -> ${r.motivo.slice(0, 140)}`);
  }
}
console.log(`\nPRUEBAS: ${detectadas}/${total} mutaciones detectadas (OK(E) = detectada por un error, no por una aserción); sin mutación: ${bases ? 'pasan' : 'FALLAN'}`);
process.exit(detectadas === total && bases ? 0 : 1);
