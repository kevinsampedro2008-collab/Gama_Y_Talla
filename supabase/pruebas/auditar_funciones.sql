-- Auditoría de las funciones expuestas por la Data API. SOLO LECTURA: lee el catálogo, no
-- escribe nada y no consume secuencias. A diferencia de las pruebas 10 a 60, sí puede
-- ejecutarse contra el proyecto remoto:
--
--   Local:  docker exec -i supabase_db_Yeny_Oficial psql -U postgres -d postgres < supabase/pruebas/auditar_funciones.sql
--   Remoto: npx --yes supabase@3.0.0 db query --remote --read-only -f supabase/pruebas/auditar_funciones.sql
--
-- CERO FILAS = todo coincide con lo aprobado. Cada fila es un problema que hay que revisar.
-- Ejecutarla cada vez que se añada una función o una extensión, y al aplicar migraciones.
--
-- POR FIRMA COMPLETA (etapa 14f.2). Cada función aprobada se identifica por esquema, nombre y
-- tipos de sus argumentos, resueltos a su OID con to_regprocedure. Por eso:
--   · una sobrecarga nueva de un nombre aprobado aparece como «función no aprobada»;
--   · si falta la firma aprobada se informa aunque exista otra con el mismo nombre;
--   · una firma que no existe produce una fila, no un error (to_regprocedure devuelve NULL).
--
-- NO DEPENDE DEL search_path DE QUIEN LA EJECUTA. Las firmas aprobadas califican cada tipo
-- (pg_catalog.uuid, public.estado_talla), y las tablas, funciones, tipos y operadores del
-- sistema van calificados con pg_catalog (de ahí los «operator(pg_catalog.=)»): un objeto
-- homónimo en public u otro esquema, que con un literal podría ganar la resolución de
-- sobrecargas, no lo suplanta. Probado con un search_path hostil (etapa 14f.2).
--
-- Al aprobar una función nueva: añadir su firma COMPLETA a «aprobadas» (con los tipos
-- calificados, tal como la muestra la columna «objeto»), quién la ejecuta, su seguridad y
-- su volatilidad; y también a supabase/pruebas/40_acceso_interno.sql.
with aprobadas(firma, ejecutan, definer, volatilidad) as (
  values
    ('public.fn_es_administrador()',                                                          'authenticated',      true,  's'),
    ('public.fn_confirmar_por_proveedor(pg_catalog.uuid, pg_catalog.int2)',                   'authenticated',      true,  'v'),
    ('public.fn_confirmar_por_publicacion(pg_catalog.uuid, pg_catalog.timestamptz, pg_catalog.int2)', 'authenticated', true, 'v'),
    ('public.fn_marcar_agotada(pg_catalog.uuid, pg_catalog.text)',                            'authenticated',      true,  'v'),
    ('public.fn_admin_tallas(pg_catalog.uuid)',                                               'authenticated',      true,  's'),
    -- Etapa 16 (20261108020000): invoker; deciden el RLS del administrador y su comprobación interna.
    ('public.fn_admin_guardar_producto(pg_catalog.jsonb, pg_catalog.int4, pg_catalog.uuid)',  'authenticated',      false, 'v'),
    ('public.fn_admin_estado_producto(pg_catalog.uuid, pg_catalog.text, pg_catalog.int4, pg_catalog.uuid)', 'authenticated', false, 'v'),
    -- Etapa 16.2 (20261108030000): disparadores invoker de normalización y protección de la clave pública.
    ('public.fn_productos_antes_de_escribir()',                                               '',                   false, 'v'),
    ('public.fn_variantes_antes_de_escribir()',                                               '',                   false, 'v'),
    ('public.fn_asignar_codigo_interno()',                                                    '',                   true,  'v'),
    ('public.fn_asignar_codigo_variante()',                                                   '',                   true,  'v'),
    ('public.fn_registrar_historial()',                                                       '',                   true,  'v'),
    ('public.fn_lote_actual()',                                                               '',                   false, 's'),
    ('public.fn_marcar_actualizado()',                                                        '',                   false, 'v'),
    ('public.fn_tallas_antes_de_escribir()',                                                  '',                   false, 'v'),
    ('public.fn_valor_talla(pg_catalog.text)',                                                'anon,authenticated', false, 'i'),
    ('public.fn_estado_publico(public.estado_talla, pg_catalog.timestamptz, pg_catalog.timestamptz)', 'anon,authenticated', false, 's'),
    ('public.fn_tallas_por_estado(pg_catalog.uuid, public.estado_publico)',                   'anon,authenticated', false, 's')
),
resueltas as (
  select a.*, pg_catalog.to_regprocedure(a.firma)::pg_catalog.oid as oid
    from aprobadas a
),
funciones as (
  select p.oid,
         -- Firma con cada tipo calificado: no depende del search_path.
         n.nspname operator(pg_catalog.||) '.' operator(pg_catalog.||) p.proname operator(pg_catalog.||) '('
           operator(pg_catalog.||) coalesce((select pg_catalog.string_agg(tn.nspname operator(pg_catalog.||) '.' operator(pg_catalog.||) t.typname, ', ' order by x.orden)
                        from pg_catalog.unnest(p.proargtypes::pg_catalog.oid[]) with ordinality as x(tipo, orden)
                        join pg_catalog.pg_type t on t.oid operator(pg_catalog.=) x.tipo
                        join pg_catalog.pg_namespace tn on tn.oid operator(pg_catalog.=) t.typnamespace), '')
           operator(pg_catalog.||) ')' as firma,
         pg_catalog.pg_get_userbyid(p.proowner) as propietario,
         p.prosecdef as es_definer,
         p.provolatile::pg_catalog.text as volatilidad,
         p.prosrc,
         coalesce(p.proconfig, '{}') operator(pg_catalog.@>) array['search_path=""']::pg_catalog.text[] as ruta_fija,
         exists (select 1 from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
                  where a.grantee operator(pg_catalog.=) 0::pg_catalog.oid) as para_public,
         pg_catalog.concat_ws(',',
           case when pg_catalog.has_function_privilege('anon'::pg_catalog.name, p.oid, 'EXECUTE'::pg_catalog.text) then 'anon' end,
           case when pg_catalog.has_function_privilege('authenticated'::pg_catalog.name, p.oid, 'EXECUTE'::pg_catalog.text) then 'authenticated' end,
           case when pg_catalog.has_function_privilege('service_role'::pg_catalog.name, p.oid, 'EXECUTE'::pg_catalog.text) then 'service_role' end) as ejecutan,
         (select e.extname from pg_catalog.pg_depend d join pg_catalog.pg_extension e on e.oid operator(pg_catalog.=) d.refobjid
           where d.classid operator(pg_catalog.=) 'pg_catalog.pg_proc'::pg_catalog.regclass
             and d.objid operator(pg_catalog.=) p.oid and d.deptype operator(pg_catalog.=) 'e' limit 1) as extension
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid operator(pg_catalog.=) p.pronamespace
   where n.nspname operator(pg_catalog.=) 'public'
),
revisadas as (
  select f.firma as objeto,
         f.propietario,
         f.ejecutan,
         pg_catalog.array_remove(array[
           case when f.extension is not null
                then 'extensión «' operator(pg_catalog.||) f.extension operator(pg_catalog.||) '» instalada en public: moverla con ALTER EXTENSION ... SET SCHEMA extensions' end,
           case when f.extension is null and a.firma is null
                then 'función no aprobada: ninguna firma aprobada coincide (¿sobrecarga nueva?)' end,
           case when f.extension is null and f.propietario operator(pg_catalog.<>) 'postgres'
                then 'no es de postgres: nace abierta y postgres no puede revocarla' end,
           case when f.extension is null and f.para_public then 'EXECUTE para PUBLIC' end,
           case when f.extension is null and a.firma is not null and f.ejecutan operator(pg_catalog.<>) a.ejecutan
                then 'roles distintos de los aprobados (' operator(pg_catalog.||) a.ejecutan operator(pg_catalog.||) ')' end,
           case when f.extension is null and a.firma is not null and f.es_definer operator(pg_catalog.<>) a.definer
                then 'seguridad distinta de la aprobada (' operator(pg_catalog.||)
                     case when a.definer then 'SECURITY DEFINER' else 'SECURITY INVOKER' end operator(pg_catalog.||) ')' end,
           case when f.extension is null and a.firma is not null and f.volatilidad operator(pg_catalog.<>) a.volatilidad
                then 'volatilidad distinta de la aprobada (' operator(pg_catalog.||) a.volatilidad operator(pg_catalog.||) ')' end,
           case when f.extension is null and not f.ruta_fija then 'search_path sin fijar' end,
           case when f.extension is null and f.es_definer and f.ejecutan operator(pg_catalog.<>) ''
                     and f.firma operator(pg_catalog.<>) 'public.fn_es_administrador()'
                     and f.prosrc operator(pg_catalog.!~) 'fn_es_administrador\(\)'
                then 'SECURITY DEFINER ejecutable sin comprobar fn_es_administrador' end,
           case when f.extension is null and f.es_definer and f.ejecutan operator(pg_catalog.<>) ''
                     and f.prosrc operator(pg_catalog.~*) '\m(delete\s+from|truncate)\s+(only\s+)?(table\s+)?("?public"?\s*\.\s*)?"?tallas\M'
                then 'SECURITY DEFINER ejecutable que borra tallas: las tallas se desactivan, no se borran' end
         ], null) as problemas
    from funciones f
    left join resueltas a on a.oid operator(pg_catalog.=) f.oid
),
faltan as (
  select a.firma as objeto, ''::pg_catalog.text as propietario, ''::pg_catalog.text as ejecutan,
         array[case when exists (select 1 from funciones f
                                  where pg_catalog.split_part(f.firma, '(', 1)
                                        operator(pg_catalog.=) pg_catalog.split_part(a.firma, '(', 1))
                    then 'falta: la firma aprobada no existe (hay otra función con ese nombre y distintos argumentos)'
                    else 'falta: la firma aprobada no existe' end] as problemas
    from resueltas a
   where a.oid is null
),
predeterminados as (
  select 'predeterminado global de postgres'::pg_catalog.text as objeto, 'postgres'::pg_catalog.text as propietario, ''::pg_catalog.text as ejecutan,
         array['las funciones futuras de postgres nacerían con EXECUTE para PUBLIC'] as problemas
   where not exists (select 1 from pg_catalog.pg_default_acl d
                      where d.defaclrole operator(pg_catalog.=) 'postgres'::pg_catalog.regrole
                        and d.defaclobjtype operator(pg_catalog.=) 'f' and d.defaclnamespace operator(pg_catalog.=) 0::pg_catalog.oid)
      or exists (select 1 from pg_catalog.pg_default_acl d, pg_catalog.aclexplode(d.defaclacl) x
                  where d.defaclrole operator(pg_catalog.=) 'postgres'::pg_catalog.regrole and d.defaclobjtype operator(pg_catalog.=) 'f'
                    and d.defaclnamespace operator(pg_catalog.=) 0::pg_catalog.oid and x.grantee operator(pg_catalog.=) 0::pg_catalog.oid)
  union all
  select 'predeterminado de postgres en public', 'postgres', '',
         array['las funciones futuras de postgres en public nacerían ejecutables por un rol de aplicación']
   where exists (select 1 from pg_catalog.pg_default_acl d, pg_catalog.aclexplode(d.defaclacl) x
                  where d.defaclrole operator(pg_catalog.=) 'postgres'::pg_catalog.regrole and d.defaclobjtype operator(pg_catalog.=) 'f'
                    and d.defaclnamespace operator(pg_catalog.=) 'public'::pg_catalog.regnamespace
                    and x.grantee operator(pg_catalog.=) any (array[0::pg_catalog.oid, 'anon'::pg_catalog.regrole::pg_catalog.oid,
                                                                    'authenticated'::pg_catalog.regrole::pg_catalog.oid,
                                                                    'service_role'::pg_catalog.regrole::pg_catalog.oid]))
)
select objeto, propietario, ejecutan, pg_catalog.array_to_string(problemas, ' · ') as problemas
  from (select * from revisadas where pg_catalog.cardinality(problemas) operator(pg_catalog.>) 0
        union all select * from faltan
        union all select * from predeterminados) r
 order by 1;
