/* Sensibilidad de supabase/pruebas/auditar_funciones.sql. SOLO LOCAL.
 *
 * Cada escenario: BEGIN; mutación; [search_path hostil]; auditoría; ROLLBACK. Sin mutación
 * debe devolver cero filas; con cada mutación, la fila esperada. No deja rastro.
 *
 *   node supabase/pruebas/reproducir/mutaciones_auditoria.mjs
 *
 * Se conecta como supabase_admin (superusuario del contenedor local) para poder cambiar
 * propietarios y crear un esquema «trampa» con tablas, funciones y operadores homónimos de
 * los del sistema; las demás mutaciones se hacen con «set local role postgres».
 */
import { exigirEntornoLocal, leer, psql } from './comun.mjs';

exigirEntornoLocal();
const AUDITORIA = leer('supabase/pruebas/auditar_funciones.sql');

const TRAMPA = `
create schema trampa;
create table trampa.pg_proc (oid oid, proname name, pronamespace oid);
create function trampa.has_function_privilege(text, oid, text) returns boolean language sql as 'select false';
create function trampa.has_function_privilege(name, oid, text) returns boolean language sql as 'select false';
create function trampa.to_regprocedure(text) returns regprocedure language sql as $$select 'public.fn_es_administrador()'::regprocedure$$;
create function trampa.aclexplode(aclitem[]) returns table (grantor oid, grantee oid, privilege_type text, is_grantable boolean) language sql as 'select null::oid, null::oid, null::text, null::boolean where false';
create function trampa.cardinality(anyarray) returns integer language sql as 'select 0';
create function trampa.siempre(oid, oid) returns boolean language sql as 'select true';
create operator trampa.= (leftarg = oid, rightarg = oid, function = trampa.siempre);
create function trampa.nunca(text, text) returns boolean language sql as 'select false';
create operator trampa.<> (leftarg = text, rightarg = text, function = trampa.nunca);
grant usage on schema trampa to public;`;

const pg = 'set local role postgres;';
const ESCENARIOS = [
  ['limpio', '', null],
  ['sobrecarga nueva de un nombre aprobado', `${pg} create function public.fn_valor_talla(integer) returns numeric language sql immutable set search_path = '' as 'select 1';`,
    /public\.fn_valor_talla\(pg_catalog\.int4\).*función no aprobada/],
  ['sobrecarga con los MISMOS permisos que la aprobada', `${pg} create function public.fn_valor_talla(integer) returns numeric language sql immutable set search_path = '' as 'select 1'; grant execute on function public.fn_valor_talla(integer) to anon, authenticated; revoke execute on function public.fn_valor_talla(integer) from public;`,
    /public\.fn_valor_talla\(pg_catalog\.int4\).*función no aprobada/],
  ['falta la firma aprobada pero existe otra con ese nombre', `${pg} drop function public.fn_marcar_agotada(uuid, text); create function public.fn_marcar_agotada(uuid) returns void language sql set search_path = '' as 'select';`,
    /public\.fn_marcar_agotada\(pg_catalog\.uuid, pg_catalog\.text\).*falta: la firma aprobada no existe \(hay otra/],
  ['falta una firma aprobada sin otra del mismo nombre', `${pg} drop function public.fn_lote_actual();`,
    /public\.fn_lote_actual\(\).*falta: la firma aprobada no existe$/m],
  ['firma con tipos distintos (text -> varchar)', `${pg} drop view public.catalogo_publico; drop function public.fn_tallas_por_estado(uuid, public.estado_publico); drop function public.fn_valor_talla(text); create function public.fn_valor_talla(varchar) returns numeric language sql immutable set search_path = '' as 'select 1';`,
    /public\.fn_valor_talla\(pg_catalog\.text\).*falta: la firma aprobada no existe \(hay otra[\s\S]*public\.fn_valor_talla\(pg_catalog\.varchar\).*no aprobada/],
  ['anon ejecuta fn_admin_tallas', `${pg} grant execute on function public.fn_admin_tallas(uuid) to anon;`, /fn_admin_tallas\(pg_catalog\.uuid\).*roles distintos/],
  ['PUBLIC ejecuta fn_valor_talla', `${pg} grant execute on function public.fn_valor_talla(text) to public;`, /fn_valor_talla\(pg_catalog\.text\).*EXECUTE para PUBLIC/],
  ['service_role ejecuta fn_estado_publico', `${pg} grant execute on function public.fn_estado_publico(public.estado_talla, timestamptz, timestamptz) to service_role;`, /fn_estado_publico\(public\.estado_talla.*roles distintos/],
  ['search_path sin fijar', `${pg} alter function public.fn_estado_publico(public.estado_talla, timestamptz, timestamptz) reset search_path;`, /fn_estado_publico.*search_path sin fijar/],
  ['invoker pasa a DEFINER', `${pg} alter function public.fn_lote_actual() security definer;`, /fn_lote_actual\(\).*seguridad distinta/],
  ['IMMUTABLE pasa a STABLE', `${pg} alter function public.fn_valor_talla(text) stable;`, /fn_valor_talla\(pg_catalog\.text\).*volatilidad distinta/],
  ['propietario distinto de postgres', 'alter function public.fn_valor_talla(text) owner to supabase_admin;', /fn_valor_talla\(pg_catalog\.text\) \| supabase_admin .*no es de postgres/],
  ['DEFINER ejecutable sin guardia', `${pg} create function public.fn_puerta(uuid) returns void language sql security definer set search_path = '' as 'select'; grant execute on function public.fn_puerta(uuid) to authenticated;`,
    /fn_puerta\(pg_catalog\.uuid\).*sin comprobar fn_es_administrador/],
  ['DEFINER con guardia que borra tallas', `${pg} create function public.fn_borrar_talla(p uuid) returns void language plpgsql security definer set search_path = '' as $f$ begin if not public.fn_es_administrador() then raise exception 'Solo un administrador'; end if; delete from public.tallas where id = p; end $f$; grant execute on function public.fn_borrar_talla(uuid) to authenticated;`,
    /fn_borrar_talla\(pg_catalog\.uuid\).*borra tallas/],
  ['extensión instalada en public', `${pg} create extension pg_trgm;`, /extensión «pg_trgm» instalada en public/],
  ['predeterminado global reabierto', `${pg} alter default privileges for role postgres grant execute on functions to public;`, /predeterminado global de postgres/],
  ['predeterminado en public para anon', `${pg} alter default privileges for role postgres in schema public grant execute on functions to anon;`, /predeterminado de postgres en public/],
  ['search_path hostil explícito + anon en fn_admin_tallas', `${pg} grant execute on function public.fn_admin_tallas(uuid) to anon; reset role; ${TRAMPA} set local search_path = trampa, pg_catalog, public;`,
    /fn_admin_tallas\(pg_catalog\.uuid\).*roles distintos/],
  ['search_path hostil explícito + sobrecarga', `${pg} create function public.fn_valor_talla(integer) returns numeric language sql immutable set search_path = '' as 'select 1'; reset role; ${TRAMPA} set local search_path = trampa, pg_catalog, public;`,
    /fn_valor_talla\(pg_catalog\.int4\).*no aprobada/],
  ['search_path hostil sin pg_catalog explícito + PUBLIC', `${pg} grant execute on function public.fn_valor_talla(text) to public; reset role; ${TRAMPA} set local search_path = trampa, public;`,
    /fn_valor_talla\(pg_catalog\.text\).*EXECUTE para PUBLIC/],
  ['search_path vacío + falta firma', `${pg} drop function public.fn_lote_actual(); set local search_path = '';`, /fn_lote_actual\(\).*falta/]
];

const ejecutar = (mutacion) => psql(
  `\\set ON_ERROR_STOP 1\n\\pset format unaligned\n\\pset tuples_only on\n\\pset fieldsep ' | '\nbegin;\n${mutacion}\n${AUDITORIA.replace(/;\s*$/, '')};\nrollback;\n`,
  { usuario: 'supabase_admin' });

let bien = 0;
for (const [nombre, mutacion, espera] of ESCENARIOS) {
  const r = ejecutar(mutacion);
  const filas = r.salida ? r.salida.split('\n').length : 0;
  const ok = r.codigo === 0 && (espera ? espera.test(r.salida) : r.salida === '');
  if (ok) bien += 1;
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${nombre.padEnd(58)} ${filas} fila(s)${ok ? '' : ` -> ${r.codigo} ${r.error.slice(0, 160)} ${r.salida.slice(0, 300)}`}`);
}
console.log(`\nAUDITORÍA: ${bien}/${ESCENARIOS.length} escenarios con el resultado esperado`);
process.exit(bien === ESCENARIOS.length ? 0 : 1);
