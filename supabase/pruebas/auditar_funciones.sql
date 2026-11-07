-- Auditoría de las funciones expuestas por la Data API. SOLO LECTURA: lee el catálogo, no
-- escribe nada y no consume secuencias. A diferencia de las pruebas 10 a 40, sí puede
-- ejecutarse contra el proyecto remoto:
--
--   Local:  docker exec -i supabase_db_Yeny_Oficial psql -U postgres -d postgres < supabase/pruebas/auditar_funciones.sql
--   Remoto: npx --yes supabase@3.0.0 db query --remote --read-only -f supabase/pruebas/auditar_funciones.sql
--
-- CERO FILAS = todo coincide con lo aprobado. Cada fila es un problema que hay que revisar.
-- Ejecutarla cada vez que se añada una función o una extensión, y al aplicar migraciones.
--
-- Al aprobar una función nueva hay que añadirla a «aprobadas», con los roles que deben poder
-- ejecutarla, y también a supabase/pruebas/40_acceso_interno.sql.
with aprobadas(nombre, ejecutan) as (
  values
    ('fn_es_administrador',          'authenticated'),
    ('fn_confirmar_por_proveedor',   'authenticated'),
    ('fn_confirmar_por_publicacion', 'authenticated'),
    ('fn_marcar_agotada',            'authenticated'),
    ('fn_admin_tallas',              'authenticated'),
    ('fn_asignar_codigo_interno',    ''),
    ('fn_asignar_codigo_variante',   ''),
    ('fn_registrar_historial',       ''),
    ('fn_lote_actual',               ''),
    ('fn_marcar_actualizado',        ''),
    ('fn_tallas_antes_de_escribir',  ''),
    ('fn_valor_talla',               'anon,authenticated'),
    ('fn_estado_publico',            'anon,authenticated'),
    ('fn_tallas_por_estado',         'anon,authenticated')
),
funciones as (
  select p.oid,
         p.proname::text as nombre,
         pg_get_userbyid(p.proowner) as propietario,
         p.prosecdef as es_definer,
         p.prosrc,
         coalesce(p.proconfig, '{}') @> array['search_path=""'] as ruta_fija,
         exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                  where a.grantee = 0) as para_public,
         concat_ws(',',
           case when has_function_privilege('anon', p.oid, 'EXECUTE') then 'anon' end,
           case when has_function_privilege('authenticated', p.oid, 'EXECUTE') then 'authenticated' end,
           case when has_function_privilege('service_role', p.oid, 'EXECUTE') then 'service_role' end) as ejecutan,
         (select e.extname from pg_depend d join pg_extension e on e.oid = d.refobjid
           where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e' limit 1) as extension
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
),
revisadas as (
  select f.nombre as objeto,
         f.propietario,
         f.ejecutan,
         array_remove(array[
           case when f.extension is not null
                then 'extensión «' || f.extension || '» instalada en public: moverla con ALTER EXTENSION ... SET SCHEMA extensions' end,
           case when f.extension is null and a.nombre is null then 'función no aprobada' end,
           case when f.extension is null and f.propietario <> 'postgres'
                then 'no es de postgres: nace abierta y postgres no puede revocarla' end,
           case when f.extension is null and f.para_public then 'EXECUTE para PUBLIC' end,
           case when f.extension is null and a.nombre is not null and f.ejecutan <> a.ejecutan
                then 'roles distintos de los aprobados (' || a.ejecutan || ')' end,
           case when f.extension is null and not f.ruta_fija then 'search_path sin fijar' end,
           case when f.extension is null and f.es_definer and f.ejecutan <> '' and f.nombre <> 'fn_es_administrador'
                     and f.prosrc !~ 'fn_es_administrador\(\)'
                then 'SECURITY DEFINER ejecutable sin comprobar fn_es_administrador' end
         ], null) as problemas
    from funciones f
    left join aprobadas a on a.nombre = f.nombre
),
faltan as (
  select a.nombre as objeto, ''::text as propietario, ''::text as ejecutan,
         array['falta: función aprobada que no existe'] as problemas
    from aprobadas a
   where not exists (select 1 from funciones f where f.nombre = a.nombre)
),
predeterminados as (
  select 'predeterminado global de postgres'::text as objeto, 'postgres'::text as propietario, ''::text as ejecutan,
         array['las funciones futuras de postgres nacerían con EXECUTE para PUBLIC'] as problemas
   where not exists (select 1 from pg_default_acl d
                      where d.defaclrole = 'postgres'::regrole and d.defaclobjtype = 'f' and d.defaclnamespace = 0)
      or exists (select 1 from pg_default_acl d, aclexplode(d.defaclacl) x
                  where d.defaclrole = 'postgres'::regrole and d.defaclobjtype = 'f' and d.defaclnamespace = 0 and x.grantee = 0)
  union all
  select 'predeterminado de postgres en public', 'postgres', '',
         array['las funciones futuras de postgres en public nacerían ejecutables por un rol de aplicación']
   where exists (select 1 from pg_default_acl d, aclexplode(d.defaclacl) x
                  where d.defaclrole = 'postgres'::regrole and d.defaclobjtype = 'f'
                    and d.defaclnamespace = 'public'::regnamespace
                    and x.grantee in (0, 'anon'::regrole::oid, 'authenticated'::regrole::oid, 'service_role'::regrole::oid))
)
select objeto, propietario, ejecutan, array_to_string(problemas, ' · ') as problemas
  from (select * from revisadas where cardinality(problemas) > 0
        union all select * from faltan
        union all select * from predeterminados) r
 order by 1;
