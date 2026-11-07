-- Etapa 14f · Endurecimiento de funciones (migración correctiva)
--
-- QUÉ CORRIGE
-- -----------
-- 20261105050000_rls_y_permisos hacía:
--     revoke all on all functions in schema public from anon, authenticated;
-- y parecía dejar las funciones cerradas. No lo hacía, por dos motivos:
--
--   1. PostgreSQL concede EXECUTE a PUBLIC a toda función nueva. Ese REVOKE quita lo
--      concedido por nombre a anon y authenticated, pero NO lo concedido a PUBLIC, y
--      ambos roles lo heredan. Resultado: ACL «=X/postgres» en las 13 funciones y las
--      SECURITY DEFINER administrativas invocables por cualquiera en /rest/v1/rpc.
--      Hoy no era explotable (cada una comprueba fn_es_administrador), pero toda la
--      seguridad dependía de no olvidar esa comprobación jamás.
--
--   2. Solo se revocaron los privilegios predeterminados de tablas y secuencias, no los
--      de funciones. Toda función futura nacía ejecutable por anon y authenticated.
--
-- QUÉ NO CAMBIA
-- -------------
-- Ningún cuerpo de función, ni las políticas RLS, ni la vista, ni los datos. Las
-- comprobaciones internas con fn_es_administrador() se conservan: esto añade una
-- segunda barrera, no sustituye a la primera.
--
-- Todo es idempotente: REVOKE, GRANT y ALTER se pueden repetir sin efecto adicional.

-- =====================================================================
-- 1. Funciones que necesita el administrador (y fn_es_administrador, por RLS)
-- =====================================================================
-- El GRANT va ANTES del REVOKE a propósito: authenticated tenía EXECUTE solo a través
-- de PUBLIC. En el orden inverso habría un instante en que las 7 políticas que llaman a
-- fn_es_administrador fallarían por falta de privilegio.
--
-- authenticated es imprescindible:
--   · fn_es_administrador: la evalúan 7 políticas, todas TO authenticated, con el rol
--     de quien consulta. Sin EXECUTE, cualquier lectura de un usuario con sesión falla.
--     anon no la necesita: ninguna política dirigida a anon la llama.
--   · las tres administrativas: el administrador ES authenticated; los privilegios son
--     por rol, no por usuario. Quién es administrador lo decide su comprobación interna.
--
-- service_role no las necesita: se salta el RLS y, sin auth.uid(), la comprobación
-- interna lo rechazaría de todos modos.
grant execute on function public.fn_es_administrador() to authenticated;
grant execute on function public.fn_confirmar_por_proveedor(uuid, smallint) to authenticated;
grant execute on function public.fn_confirmar_por_publicacion(uuid, timestamptz, smallint) to authenticated;
grant execute on function public.fn_marcar_agotada(uuid, text) to authenticated;

revoke all on function public.fn_es_administrador() from public, anon, service_role;
revoke all on function public.fn_confirmar_por_proveedor(uuid, smallint) from public, anon, service_role;
revoke all on function public.fn_confirmar_por_publicacion(uuid, timestamptz, smallint) from public, anon, service_role;
revoke all on function public.fn_marcar_agotada(uuid, text) from public, anon, service_role;

-- =====================================================================
-- 2. Funciones que solo usan los disparadores
-- =====================================================================
-- PostgreSQL comprueba EXECUTE al CREAR el disparador, no cada vez que se dispara, así
-- que siguen funcionando sin que ningún rol de aplicación pueda ejecutarlas.
revoke all on function public.fn_asignar_codigo_interno() from public, anon, authenticated, service_role;
revoke all on function public.fn_asignar_codigo_variante() from public, anon, authenticated, service_role;
revoke all on function public.fn_registrar_historial() from public, anon, authenticated, service_role;

-- =====================================================================
-- 3. Funciones futuras: nadie ejecuta nada sin una concesión explícita
-- =====================================================================
-- Hacen falta LAS DOS sentencias; la documentación de ALTER DEFAULT PRIVILEGES lo avisa
-- y se comprobó en el motor:
--   · El EXECUTE a PUBLIC es un predeterminado GLOBAL. Una revocación IN SCHEMA no lo
--     quita: la función sigue naciendo con «=X/postgres».
--   · El EXECUTE a anon, authenticated y service_role lo concede una entrada propia de
--     Supabase para el esquema public. Esa sí se revoca con IN SCHEMA.
--
-- FOR ROLE postgres porque es quien crea las funciones: tanto `db push` como el editor
-- SQL del panel. Los predeterminados de supabase_admin y otros roles internos no se
-- tocan: el motor lo rechaza («permission denied to change default privileges»).
alter default privileges for role postgres
  revoke execute on functions from public;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;

-- =====================================================================
-- 4. search_path fijo en las seis funciones SECURITY INVOKER
-- =====================================================================
-- Sus cuerpos ya cualifican con «public.» todo lo que no es de pg_catalog, que el motor
-- busca siempre, de modo que basta fijar el ajuste. No se reescribe ningún cuerpo.
alter function public.fn_valor_talla(text) set search_path = '';
alter function public.fn_estado_publico(public.estado_talla, timestamptz, timestamptz) set search_path = '';
alter function public.fn_tallas_por_estado(uuid, public.estado_publico) set search_path = '';
alter function public.fn_lote_actual() set search_path = '';
alter function public.fn_marcar_actualizado() set search_path = '';
alter function public.fn_tallas_antes_de_escribir() set search_path = '';

-- =====================================================================
-- 5. Comprobación final: si algo no quedó como debe, la migración falla
-- =====================================================================
do $$
declare
  v_fn regprocedure;
begin
  foreach v_fn in array array[
    'public.fn_es_administrador()',
    'public.fn_confirmar_por_proveedor(uuid, smallint)',
    'public.fn_confirmar_por_publicacion(uuid, timestamptz, smallint)',
    'public.fn_marcar_agotada(uuid, text)',
    'public.fn_asignar_codigo_interno()',
    'public.fn_asignar_codigo_variante()',
    'public.fn_registrar_historial()'
  ]::regprocedure[] loop
    if has_function_privilege('anon', v_fn, 'EXECUTE') then
      raise exception 'anon conserva EXECUTE sobre %', v_fn;
    end if;
  end loop;

  if not has_function_privilege('authenticated', 'public.fn_es_administrador()', 'EXECUTE') then
    raise exception 'authenticated perdió EXECUTE sobre fn_es_administrador: las políticas RLS fallarían';
  end if;

  if exists (
    select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
     where d.defaclrole = 'postgres'::regrole and d.defaclobjtype = 'f'
       and d.defaclnamespace = 0 and a.grantee = 0
  ) or not exists (
    select 1 from pg_default_acl d
     where d.defaclrole = 'postgres'::regrole and d.defaclobjtype = 'f' and d.defaclnamespace = 0
  ) then
    raise exception 'las funciones futuras de postgres seguirían naciendo con EXECUTE para PUBLIC';
  end if;

  if not exists (
    select 1 from pg_class
     where oid = 'public.catalogo_publico'::regclass
       and 'security_invoker=true' = any (reloptions)
  ) then
    raise exception 'catalogo_publico perdió security_invoker';
  end if;
end;
$$;
