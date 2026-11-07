/* ¿Detecta la comprobación final de 20261107030000 cada protección rota? SOLO LOCAL.
 *
 * Para cada mutación: BEGIN; rompe algo; ejecuta SOLO el bloque DO final de la migración
 * (el último «do $$» del archivo); ROLLBACK. Debe FALLAR con todas las mutaciones, con el
 * diagnóstico «20261107030000: N problema(s)», y pasar sin ninguna. No deja rastro.
 *
 *   node supabase/pruebas/reproducir/mutaciones_comprobacion_final.mjs
 *
 * Se conecta como supabase_admin (superusuario del contenedor local) y ejecuta la mutación y
 * el bloque como postgres, igual que una migración.
 */
import { exigirEntornoLocal, leer, psql } from './comun.mjs';

exigirEntornoLocal();
const s = leer('supabase/migrations/20261107030000_integridad_tallas_y_vigencia.sql');
const BLOQUE = s.slice(s.lastIndexOf('\ndo $$') + 1);

const ANTIGUA_VALOR = `create or replace function public.fn_valor_talla(p_talla text) returns numeric language sql immutable security invoker set search_path = '' as $f$
  select coalesce((regexp_match(p_talla, '^\\s*(\\d+(?:[.,]\\d+)?)'))[1]::numeric, 0)
  + case when p_talla ~ '\\d+\\s*/\\s*\\d+' then (regexp_match(p_talla, '(\\d+)\\s*/\\s*(\\d+)'))[1]::numeric
         / nullif((regexp_match(p_talla, '(\\d+)\\s*/\\s*(\\d+)'))[2]::numeric, 0) else 0 end; $f$;`;
const ESTADO = (cond) => `create or replace function public.fn_estado_publico(p_estado public.estado_talla, p_vigencia_desde timestamptz, p_vence_en timestamptz)
  returns public.estado_publico language sql stable security invoker set search_path = '' as $f$
  select case when p_estado = 'AGOTADA' then 'AGOTADO'::public.estado_publico when p_estado = 'REVISAR' then 'POR_REVISAR'::public.estado_publico
    when p_vigencia_desde is null or p_vence_en is null then 'POR_REVISAR'::public.estado_publico
    when ${cond} then 'DISPONIBLE'::public.estado_publico else 'POR_REVISAR'::public.estado_publico end; $f$;`;
const DISPARADOR_ANTIGUO = `create or replace function public.fn_tallas_antes_de_escribir() returns trigger language plpgsql volatile security invoker set search_path = '' as $f$
begin new.vence_en := case when new.vigencia_desde is null then null else new.vigencia_desde + pg_catalog.make_interval(hours => new.vigencia_horas) end;
new.actualizado_en := pg_catalog.now(); return new; end $f$;`;
// Reescribe fn_valor_talla a partir de la vigente, con un cambio puntual de texto.
const VALOR = (de, a) => `do $m$ declare d text; begin
  d := pg_get_functiondef('public.fn_valor_talla(text)'::regprocedure);
  if position(${de} in d) = 0 then raise exception 'mutación no aplicable'; end if;
  execute replace(d, ${de}, ${a}); end $m$;`;
// CHECK validado con otra expresión: la comprobación final debe notar la gramática, no el «not valid».
const CHECK = (expr, sinValidar = false) => `alter table public.tallas drop constraint tallas_talla_formato; alter table public.tallas add constraint tallas_talla_formato check (${expr})${sinValidar ? ' not valid' : ''};`;
const GRAMATICA = `talla ~ '^[0-9]{1,3}([.,][0-9]{1,2}| [0-9]{1,2}/[0-9]{1,2})?$' and (strpos(talla, '/') = 0 or (((regexp_match(talla, ' ([0-9]{1,2})/([0-9]{1,2})$'))[2])::integer > 0 and ((regexp_match(talla, ' ([0-9]{1,2})/([0-9]{1,2})$'))[1])::integer < ((regexp_match(talla, ' ([0-9]{1,2})/([0-9]{1,2})$'))[2])::integer))`;

const MUTANTES = [
  ['tallas: authenticated recupera DELETE', 'grant delete on public.tallas to authenticated;'],
  ['tallas: authenticated gana TRUNCATE', 'grant truncate on public.tallas to authenticated;'],
  ['tallas: anon gana DELETE', 'grant delete on public.tallas to anon;'],
  ['tallas: PUBLIC gana SELECT', 'grant select on public.tallas to public;'],
  ['tallas: DELETE heredado por un rol intermedio', 'create role borrador_prueba nologin; grant delete on public.tallas to borrador_prueba; grant borrador_prueba to authenticated;'],
  ['tallas: rol intermedio con DELETE, miembro SIN heredar', 'create role borrador_sin_herencia nologin; grant delete on public.tallas to borrador_sin_herencia; grant borrador_sin_herencia to authenticated with inherit false;'],
  ['tallas: authenticated pierde UPDATE', 'revoke update on public.tallas from authenticated;'],
  ['tallas: authenticated pierde INSERT', 'revoke insert on public.tallas from authenticated;'],
  ['tallas: SELECT (nota) para authenticated', 'grant select (nota) on public.tallas to authenticated;'],
  ['tallas: anon pierde SELECT (vence_en)', 'revoke select (vence_en) on public.tallas from anon;'],
  ['función DEFINER ejecutable que borra tallas', `create function public.fn_borrar(p uuid) returns void language plpgsql security definer set search_path = '' as $f$ begin if not public.fn_es_administrador() then raise exception 'x'; end if; delete from public.tallas where id = p; end $f$; grant execute on function public.fn_borrar(uuid) to authenticated;`],
  ['CHECK de formato eliminado', 'alter table public.tallas drop constraint tallas_talla_formato;'],
  ['CHECK de formato correcto pero sin validar (NOT VALID)', CHECK(GRAMATICA, true)],
  ['CHECK de formato que llama a fn_valor_talla', CHECK('public.fn_valor_talla(talla) is not null')],
  ['CHECK que admite fracciones impropias (40 4/3)', CHECK(`talla ~ '^[0-9]{1,3}([.,][0-9]{1,2}| [0-9]{1,2}/[0-9]{1,2})?$' and (strpos(talla, '/') = 0 or ((regexp_match(talla, ' ([0-9]{1,2})/([0-9]{1,2})$'))[2])::integer > 0)`)],
  ['CHECK que admite espacios exteriores', CHECK(GRAMATICA.replace(/talla ~/, 'btrim(talla) ~'))],
  ['CHECK con la gramática estricta anterior (rechaza 40,50)', CHECK(`talla ~ '^[1-9][0-9]{0,2}([.,][0-9]?[1-9]| [1-9][0-9]?/[1-9][0-9]?)?$'`)],
  ['CHECK nuevo que depende del reloj', 'alter table public.tallas add constraint no_futuro check (vigencia_desde <= now()) not valid;'],
  ['fn_valor_talla vuelve a la versión antigua', ANTIGUA_VALOR],
  ['fn_valor_talla admite fracciones impropias (40 4/3)', VALOR(`'when f.d > 0 and f.n < f.d'`, `'when f.d > 0'`)],
  ['fn_valor_talla sin trim_scale (40,50 -> 40.50)', VALOR(`'pg_catalog.trim_scale(pg_catalog.translate(p_talla, '','', ''.'')::numeric)'`, `'pg_catalog.translate(p_talla, '','', ''.'')::numeric'`)],
  ['CHECK sin la regla del denominador > 0', CHECK(`talla ~ '^[0-9]{1,3}([.,][0-9]{1,2}| [0-9]{1,2}/[0-9]{1,2})?$' and (strpos(talla, '/') = 0 or ((regexp_match(talla, ' ([0-9]{1,2})/([0-9]{1,2})$'))[1])::integer <= ((regexp_match(talla, ' ([0-9]{1,2})/([0-9]{1,2})$'))[2])::integer)`)],
  ['fn_valor_talla pasa a STABLE', 'alter function public.fn_valor_talla(text) stable;'],
  ['fn_valor_talla pierde search_path', 'alter function public.fn_valor_talla(text) reset search_path;'],
  ['fn_valor_talla pasa a DEFINER', 'alter function public.fn_valor_talla(text) security definer;'],
  ['fn_valor_talla: service_role gana EXECUTE', 'grant execute on function public.fn_valor_talla(text) to service_role;'],
  ['fn_estado_publico versión antigua (sin vigencia_desde <= now())', ESTADO('now() < p_vence_en')],
  ['fn_estado_publico: incluye el instante de vencimiento', ESTADO('p_vigencia_desde <= now() and now() <= p_vence_en')],
  ['fn_estado_publico: excluye el instante de inicio', ESTADO('p_vigencia_desde < now() and now() < p_vence_en')],
  ['fn_estado_publico pasa a IMMUTABLE', 'alter function public.fn_estado_publico(public.estado_talla, timestamptz, timestamptz) immutable;'],
  ['fn_estado_publico: anon pierde EXECUTE', 'revoke execute on function public.fn_estado_publico(public.estado_talla, timestamptz, timestamptz) from anon;'],
  ['disparador sin validación de fechas', DISPARADOR_ANTIGUO],
  ['disparador desactivado', 'alter table public.tallas disable trigger tr_tallas_vigencia;'],
  ['disparador solo en INSERT', 'drop trigger tr_tallas_vigencia on public.tallas; create trigger tr_tallas_vigencia before insert on public.tallas for each row execute function public.fn_tallas_antes_de_escribir();'],
  ['fn_tallas_antes_de_escribir: authenticated gana EXECUTE', 'grant execute on function public.fn_tallas_antes_de_escribir() to authenticated;'],
  ['fn_tallas_antes_de_escribir pasa a STABLE', 'alter function public.fn_tallas_antes_de_escribir() stable;'],
  ['función IMMUTABLE nueva que mira el reloj', `create function public.fn_reloj() returns timestamptz language sql immutable set search_path = '' as 'select now()';`],
  ['sobrecarga nueva en public', `create function public.fn_valor_talla(integer) returns numeric language sql immutable set search_path = '' as 'select 1';`],
  ['falta una firma aprobada', 'drop function public.fn_lote_actual();'],
  ['política lectura_publica_tallas abierta a sesiones', 'alter policy lectura_publica_tallas on public.tallas to anon, authenticated;'],
  ['RLS desactivado en tallas', 'alter table public.tallas disable row level security;'],
  ['historial sin FORCE', 'alter table public.historial no force row level security;'],
  ['vista sin security_invoker', 'alter view public.catalogo_publico set (security_invoker = false);'],
  ['predeterminado global reabierto', 'alter default privileges for role postgres grant execute on functions to public;'],
  ['fn_marcar_agotada sin guardia', `create or replace function public.fn_marcar_agotada(p_talla_id uuid, p_nota text default null) returns public.tallas language plpgsql security definer set search_path = '' as $f$ declare v public.tallas; begin update public.tallas set estado = 'AGOTADA' where id = p_talla_id returning * into v; return v; end $f$;`]
];

const ejecutar = (mutacion) => psql(`\\set ON_ERROR_STOP 1\nbegin;\nset local role postgres;\n${mutacion}\n${BLOQUE}\nrollback;\n`, { usuario: 'supabase_admin' });

const base = ejecutar('');
console.log(`${base.codigo === 0 ? 'OK   ' : 'FALLA'} sin mutación: la comprobación final pasa ${base.codigo === 0 ? '' : base.error}`);
let detectadas = 0;
for (const [nombre, mutacion] of MUTANTES) {
  const r = ejecutar(mutacion);
  const mensaje = r.error.split('\n').find((l) => /^ - |ERROR/.test(l)) || '';
  const detalle = r.error.split('\n').filter((l) => /^\s*- /.test(l) || /^DETAIL/.test(l)).map((l) => l.replace(/^DETAIL:\s*/, '')).join(' | ');
  const ok = r.codigo !== 0 && /20261107030000: \d+ problema/.test(r.error);
  if (ok) detectadas += 1;
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${nombre.padEnd(62)} -> ${ok ? detalle.slice(0, 150) : `${r.codigo} ${mensaje.slice(0, 150)}`}`);
}
console.log(`\nCOMPROBACIÓN FINAL: ${detectadas}/${MUTANTES.length} mutaciones detectadas; sin mutación: ${base.codigo === 0 ? 'pasa' : 'FALLA'}`);
process.exit(detectadas === MUTANTES.length && base.codigo === 0 ? 0 : 1);
