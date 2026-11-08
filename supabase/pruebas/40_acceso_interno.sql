-- Etapa 14f.1 · Separación entre visitante, sesión sin privilegios y administrador.
-- Escriben datos y se deshacen al final, PERO el ROLLBACK no devuelve las secuencias:
-- ejecutar SOLO en un entorno local desechable, nunca en el proyecto remoto.
-- Comprueba privilegios efectivos (no solo «cero filas»). La prueba por HTTP real está en
-- 50_postgrest_local.mjs. Desde 20261107030000 (etapa 14f.2) nadie de la aplicación borra
-- tallas: el detalle de formato, borrado y fechas está en 60_integridad_tallas_vigencia.sql.

begin;

create or replace function pg_temp.exigir(p_prueba text, p_ok boolean, p_detalle text default '')
returns void language plpgsql as $$
begin
  if p_ok then raise notice 'OK     %', p_prueba;
  else raise exception 'FALLA  % %', p_prueba, p_detalle; end if;
end;
$$;

-- Debe rechazarse por FALTA DE PRIVILEGIO: ni cero filas ni otro error.
create or replace function pg_temp.exigir_denegado(p_prueba text, p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform pg_temp.exigir(p_prueba, false, '-> la consulta fue PERMITIDA');
exception
  when insufficient_privilege then perform pg_temp.exigir(p_prueba, true);
end;
$$;

-- Debe ejecutarse sin error y no devolver ni una fila.
create or replace function pg_temp.exigir_vacio(p_prueba text, p_sql text)
returns void language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || p_sql || ') z' into n;
  perform pg_temp.exigir(p_prueba, n = 0, '-> devolvió ' || n || ' filas');
end;
$$;

-- Debe llegar a la función y rechazarla su comprobación interna.
create or replace function pg_temp.exigir_guardia(p_prueba text, p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform pg_temp.exigir(p_prueba, false, '-> la consulta fue PERMITIDA');
exception
  when raise_exception or insufficient_privilege then
    perform pg_temp.exigir(p_prueba, sqlerrm like 'Solo un administrador%', '-> ' || sqlerrm);
end;
$$;

-- Toda forma de pedir una columna interna por la tabla debe rechazarse.
create or replace function pg_temp.exigir_tallas_cerradas(p_quien text)
returns void language plpgsql as $$
declare c text;
begin
  foreach c in array array['publicado_en', 'registrado_en', 'confirmado_en', 'vigencia_horas',
                           'origen', 'nota', 'estado_migrado', 'creado_en', 'actualizado_en'] loop
    perform pg_temp.exigir_denegado(p_quien || ': tallas.' || c, format('select %I from public.tallas', c));
  end loop;
  perform pg_temp.exigir_denegado(p_quien || ': select *', 'select * from public.tallas');
  perform pg_temp.exigir_denegado(p_quien || ': fila entera', 'select t from public.tallas t');
  perform pg_temp.exigir_denegado(p_quien || ': to_jsonb de la fila', 'select to_jsonb(t) from public.tallas t');
  perform pg_temp.exigir_denegado(p_quien || ': filtro por nota', $q$select id from public.tallas where nota = 'x'$q$);
  perform pg_temp.exigir_denegado(p_quien || ': orden por nota', 'select id from public.tallas order by nota');
  perform pg_temp.exigir_denegado(p_quien || ': agregado sobre nota', 'select count(nota) from public.tallas');
  perform pg_temp.exigir_denegado(p_quien || ': nota desde una unión con variantes',
    'select t.nota from public.variantes v join public.tallas t on t.variante_id = v.id');
  perform pg_temp.exigir_denegado(p_quien || ': estado_migrado en una subconsulta',
    'select (select max(estado_migrado) from public.tallas)');
  perform pg_temp.exigir_denegado(p_quien || ': nota devuelta por un UPDATE',
    'update public.tallas set talla = talla returning nota');
  perform pg_temp.exigir_denegado(p_quien || ': UPDATE que filtra por nota',
    $q$update public.tallas set talla = talla where nota = 'x'$q$);
end;
$$;

grant execute on all functions in schema pg_temp to public;

-- ------------------------------------------------------------- datos
insert into public.administradores (user_id, nombre)
values ('aaaaaaaa-4444-0000-0000-000000000001', 'admin de prueba');

insert into public.productos (id, nombre, marca, codigo_interno, activo)
values ('10000000-4444-0000-0000-00000000000a', 'PRUEBA 40', 'Marca', 'PR-40', true),
       ('10000000-4444-0000-0000-00000000000b', 'INACTIVO 40', 'Marca', 'PR-41', false);
insert into public.variantes (id, producto_id, codigo_variante, color, precio)
values ('20000000-4444-0000-0000-00000000000a', '10000000-4444-0000-0000-00000000000a', 'PR-40-A', 'Negro', 1000),
       ('20000000-4444-0000-0000-00000000000b', '10000000-4444-0000-0000-00000000000b', 'PR-41-A', 'Rojo', 1000);
insert into public.tallas (id, variante_id, talla, nota, estado_migrado, publicado_en, confirmado_en, origen)
values ('30000000-4444-0000-0000-00000000000a', '20000000-4444-0000-0000-00000000000a', '40', 'CENTINELA-NOTA', 'CENTINELA-MIGRADO', '2020-02-02', '2020-03-03', 'proveedor'),
       ('30000000-4444-0000-0000-00000000000b', '20000000-4444-0000-0000-00000000000a', '40 2/3', null, null, null, null, 'manual'),
       ('30000000-4444-0000-0000-00000000000c', '20000000-4444-0000-0000-00000000000b', '41', 'NOTA-DE-INACTIVO', null, null, null, 'manual');
insert into public.fotos (variante_id, ruta)
values ('20000000-4444-0000-0000-00000000000a', 'assets/x.webp');

-- =====================================================================
-- D. Matriz de permisos, leída del catálogo
-- =====================================================================
do $$
declare
  c text;
  f record;
  v_columnas text[];
begin
  foreach c in array array['publicado_en', 'registrado_en', 'confirmado_en', 'vigencia_horas',
                           'origen', 'nota', 'estado_migrado', 'creado_en', 'actualizado_en'] loop
    perform pg_temp.exigir('D anon sin SELECT en tallas.' || c, not has_column_privilege('anon', 'public.tallas', c, 'SELECT'));
    perform pg_temp.exigir('D authenticated sin SELECT en tallas.' || c, not has_column_privilege('authenticated', 'public.tallas', c, 'SELECT'));
  end loop;
  foreach c in array array['id', 'variante_id', 'talla', 'estado', 'vigencia_desde', 'vence_en', 'activa'] loop
    perform pg_temp.exigir('D anon con SELECT en tallas.' || c, has_column_privilege('anon', 'public.tallas', c, 'SELECT'));
    perform pg_temp.exigir('D authenticated con SELECT en tallas.' || c, has_column_privilege('authenticated', 'public.tallas', c, 'SELECT'));
  end loop;
  perform pg_temp.exigir('D authenticated sin SELECT de tabla en tallas', not has_table_privilege('authenticated', 'public.tallas', 'SELECT'));
  perform pg_temp.exigir('D authenticated conserva INSERT y UPDATE en tallas', has_table_privilege('authenticated', 'public.tallas', 'INSERT')
    and has_table_privilege('authenticated', 'public.tallas', 'UPDATE'));
  perform pg_temp.exigir('D authenticated sin DELETE ni TRUNCATE en tallas (14f.2: se desactivan)',
    not has_table_privilege('authenticated', 'public.tallas', 'DELETE') and not has_table_privilege('authenticated', 'public.tallas', 'TRUNCATE'));
  perform pg_temp.exigir('D anon sin ninguna escritura en ninguna tabla',
    not exists (select 1 from pg_class t join pg_namespace n on n.oid = t.relnamespace
                 where n.nspname = 'public' and t.relkind = 'r'
                   and (has_table_privilege('anon', t.oid, 'INSERT') or has_table_privilege('anon', t.oid, 'UPDATE')
                        or has_table_privilege('anon', t.oid, 'DELETE') or has_table_privilege('anon', t.oid, 'TRUNCATE'))));
  perform pg_temp.exigir('D anon sin INSERT ni UPDATE por columna',
    not exists (select 1 from pg_class t join pg_namespace n on n.oid = t.relnamespace
                  join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
                 where n.nspname = 'public' and t.relkind = 'r'
                   and (has_column_privilege('anon', t.oid, a.attname, 'INSERT') or has_column_privilege('anon', t.oid, a.attname, 'UPDATE'))));
  perform pg_temp.exigir('D anon sin privilegios en las tablas privadas',
    not has_any_column_privilege('anon', 'public.historial', 'SELECT')
    and not has_any_column_privilege('anon', 'public.administradores', 'SELECT')
    and not has_any_column_privilege('anon', 'public.configuracion', 'SELECT'));
  perform pg_temp.exigir('D historial solo de lectura para authenticated', has_table_privilege('authenticated', 'public.historial', 'SELECT')
    and not has_table_privilege('authenticated', 'public.historial', 'INSERT') and not has_table_privilege('authenticated', 'public.historial', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.historial', 'DELETE'));
  perform pg_temp.exigir('D administradores solo de lectura para authenticated', has_table_privilege('authenticated', 'public.administradores', 'SELECT')
    and not has_table_privilege('authenticated', 'public.administradores', 'INSERT') and not has_table_privilege('authenticated', 'public.administradores', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.administradores', 'DELETE'));

  -- Políticas: se examinan sus expresiones.
  perform pg_temp.exigir('D las 4 políticas de lectura pública son solo de anon',
    (select count(*) = 4 from pg_policies p where p.schemaname = 'public' and p.policyname like 'lectura_publica_%' and p.cmd = 'SELECT' and p.roles = array['anon']::name[]));
  perform pg_temp.exigir('D toda política de authenticated exige fn_es_administrador, en USING y CHECK',
    not exists (select 1 from pg_policies p where p.schemaname = 'public' and 'authenticated' = any (p.roles)
                 and (coalesce(p.qual, '') !~ '^(public\.)?fn_es_administrador\(\)$'
                      or coalesce(p.with_check, p.qual) !~ '^(public\.)?fn_es_administrador\(\)$')));
  perform pg_temp.exigir('D ninguna política se dirige a PUBLIC',
    not exists (select 1 from pg_policies p where p.schemaname = 'public' and 'public' = any (p.roles)));
  perform pg_temp.exigir('D las 7 políticas administrativas siguen en pie',
    (select count(*) = 7 from pg_policies p where p.schemaname = 'public' and p.roles = array['authenticated']::name[]));
  perform pg_temp.exigir('D no hay más políticas que las 11 conocidas',
    (select count(*) = 11 from pg_policies p where p.schemaname = 'public'));
  perform pg_temp.exigir('D RLS activo en las 7 tablas',
    (select count(*) = 7 from pg_class t join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public' and t.relkind = 'r' and t.relrowsecurity));
  perform pg_temp.exigir('D historial y administradores con FORCE RLS',
    (select bool_and(relforcerowsecurity) from pg_class where oid in ('public.historial'::regclass, 'public.administradores'::regclass)));

  -- Funciones: cada una debe estar clasificada. Una función nueva hará fallar esta prueba.
  -- Las de una extensión instalada en public (pgcrypto en PostgreSQL corriente) no cuentan.
  for f in
    select * from (values
      ('fn_es_administrador',          'authenticated'),
      ('fn_confirmar_por_proveedor',   'authenticated'),
      ('fn_confirmar_por_publicacion', 'authenticated'),
      ('fn_marcar_agotada',            'authenticated'),
      ('fn_admin_tallas',              'authenticated'),
      ('fn_admin_guardar_producto',    'authenticated'),
      ('fn_admin_estado_producto',     'authenticated'),
      ('fn_asignar_codigo_interno',    ''),
      ('fn_asignar_codigo_variante',   ''),
      ('fn_registrar_historial',       ''),
      ('fn_lote_actual',               ''),
      ('fn_marcar_actualizado',        ''),
      ('fn_tallas_antes_de_escribir',  ''),
      ('fn_valor_talla',               'anon,authenticated'),
      ('fn_estado_publico',            'anon,authenticated'),
      ('fn_tallas_por_estado',         'anon,authenticated')
    ) as x(nombre, roles)
  loop
    perform pg_temp.exigir('D ' || f.nombre || ': EXECUTE exactamente para [' || f.roles || ']',
      (select concat_ws(',',
                case when has_function_privilege('anon', p.oid, 'EXECUTE') then 'anon' end,
                case when has_function_privilege('authenticated', p.oid, 'EXECUTE') then 'authenticated' end,
                case when has_function_privilege('service_role', p.oid, 'EXECUTE') then 'service_role' end) = f.roles
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = f.nombre));
  end loop;
  perform pg_temp.exigir('D en public hay exactamente esas 16 funciones',
    (select count(*) = 16 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and not exists (select 1 from pg_depend e where e.classid = 'pg_proc'::regclass and e.objid = p.oid and e.deptype = 'e')));
  perform pg_temp.exigir('D ninguna función de public da EXECUTE a PUBLIC',
    not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
                       aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                 where n.nspname = 'public' and a.grantee = 0 and not exists (select 1 from pg_depend e where e.classid = 'pg_proc'::regclass and e.objid = p.oid and e.deptype = 'e')));
  perform pg_temp.exigir('D las 16 funciones tienen search_path vacío',
    (select bool_and(coalesce(p.proconfig, '{}') @> array['search_path=""']) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and not exists (select 1 from pg_depend e where e.classid = 'pg_proc'::regclass and e.objid = p.oid and e.deptype = 'e')));
  perform pg_temp.exigir('D las 8 DEFINER siguen siéndolo y las 8 invoker también',
    (select count(*) filter (where p.prosecdef) = 8 and count(*) filter (where not p.prosecdef) = 8
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and not exists (select 1 from pg_depend e where e.classid = 'pg_proc'::regclass and e.objid = p.oid and e.deptype = 'e')));
  perform pg_temp.exigir('D las DEFINER accesibles comprueban fn_es_administrador por dentro',
    not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.prosecdef and p.proname <> 'fn_es_administrador'
                   and has_function_privilege('authenticated', p.oid, 'EXECUTE')
                   and p.prosrc !~ 'if not public\.fn_es_administrador\(\) then'));

  -- Vista
  perform pg_temp.exigir('E la vista conserva security_invoker',
    (select 'security_invoker=true' = any (reloptions) from pg_class where oid = 'public.catalogo_publico'::regclass));
  select array_agg(a.attname::text order by a.attnum) into v_columnas
    from pg_attribute a where a.attrelid = 'public.catalogo_publico'::regclass and a.attnum > 0 and not a.attisdropped;
  perform pg_temp.exigir('E la vista tiene sus 12 columnas, en orden',
    v_columnas = array['id', 'codigoInterno', 'referencia', 'nombre', 'marca', 'categoria', 'descripcion', 'segmento', 'destacado', 'nuevoIngreso', 'orden', 'variantes'],
    v_columnas::text);
  perform pg_temp.exigir('E la definición de la vista no nombra columnas internas',
    pg_get_viewdef('public.catalogo_publico'::regclass) !~ '\m(nota|estado_migrado|publicado_en|confirmado_en|registrado_en|vigencia_horas|origen)\M');
end;
$$;

-- Funciones futuras: en public y en otro esquema, para los cuatro destinatarios.
create function public.fn_futura_40() returns int language sql as 'select 1';
create schema esquema_prueba_40;
create function esquema_prueba_40.fn_futura_40() returns int language sql as 'select 1';
do $$
declare v_fn regprocedure;
begin
  foreach v_fn in array array['public.fn_futura_40()', 'esquema_prueba_40.fn_futura_40()']::regprocedure[] loop
    perform pg_temp.exigir('D ' || v_fn || ' nace sin PUBLIC',
      not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = v_fn and a.grantee = 0));
    perform pg_temp.exigir('D ' || v_fn || ' nace sin anon', not has_function_privilege('anon', v_fn, 'EXECUTE'));
    perform pg_temp.exigir('D ' || v_fn || ' nace sin authenticated', not has_function_privilege('authenticated', v_fn, 'EXECUTE'));
    perform pg_temp.exigir('D ' || v_fn || ' nace sin service_role', not has_function_privilege('service_role', v_fn, 'EXECUTE'));
    perform pg_temp.exigir('D ' || v_fn || ' la ejecuta su propietario', has_function_privilege('postgres', v_fn, 'EXECUTE'));
  end loop;
end;
$$;
drop function public.fn_futura_40();
drop schema esquema_prueba_40 cascade;

-- =====================================================================
-- A. Visitante (anon)
-- =====================================================================
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('prueba.vista_anon', (select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.codigo)::text, ''))
  from (select v."codigoInterno" as codigo, v.* from public.catalogo_publico v) c), true);

do $$
begin
  perform pg_temp.exigir('A lee el catálogo', exists (select 1 from public.catalogo_publico where nombre = 'PRUEBA 40'));
  perform pg_temp.exigir('A lee productos', exists (select 1 from public.productos where nombre = 'PRUEBA 40'));
  perform pg_temp.exigir('A lee variantes', exists (select 1 from public.variantes where codigo_variante = 'PR-40-A'));
  perform pg_temp.exigir('A lee tallas públicas', exists (select 1 from public.tallas where talla = '40'));
  perform pg_temp.exigir('A lee fotos', exists (select 1 from public.fotos where ruta = 'assets/x.webp'));
  perform pg_temp.exigir('A el catálogo no contiene datos internos',
    not exists (select 1 from public.catalogo_publico c where to_jsonb(c)::text ~ 'CENTINELA|NOTA-DE-INACTIVO'));
  perform pg_temp.exigir('A el producto inactivo no existe para él', not exists (select 1 from public.productos where nombre = 'INACTIVO 40'));
  perform pg_temp.exigir_vacio('A las tallas del producto inactivo no existen para él',
    $q$select 1 from public.tallas where id = '30000000-4444-0000-0000-00000000000c'$q$);
  perform pg_temp.exigir_tallas_cerradas('A denegado');
  perform pg_temp.exigir_denegado('A denegado: historial', 'select 1 from public.historial');
  perform pg_temp.exigir_denegado('A denegado: administradores', 'select 1 from public.administradores');
  perform pg_temp.exigir_denegado('A denegado: configuracion', 'select 1 from public.configuracion');
  perform pg_temp.exigir_denegado('A denegado: fn_admin_tallas', 'select * from public.fn_admin_tallas()');
  perform pg_temp.exigir_denegado('A denegado: fn_es_administrador', 'select public.fn_es_administrador()');
  perform pg_temp.exigir_denegado('A denegado: fn_lote_actual', 'select public.fn_lote_actual()');
  perform pg_temp.exigir_denegado('A denegado: insertar producto', $q$insert into public.productos (nombre, marca) values ('X', 'X')$q$);
  perform pg_temp.exigir_denegado('A denegado: cambiar disponibilidad', $q$update public.tallas set estado = 'CONFIRMADA'$q$);
  perform pg_temp.exigir_denegado('A denegado: borrar tallas', 'delete from public.tallas');
end;
$$;
reset role;

-- =====================================================================
-- B. Con sesión, sin ser administrador
-- =====================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-4444-0000-0000-000000000002', true);

do $$
declare n bigint;
begin
  perform pg_temp.exigir('B no es administrador', not public.fn_es_administrador());
  perform pg_temp.exigir_tallas_cerradas('B denegado');
  perform pg_temp.exigir_vacio('B cero filas: columnas públicas de tallas', 'select id, talla, estado from public.tallas');
  perform pg_temp.exigir_vacio('B cero filas: productos', 'select id from public.productos');
  perform pg_temp.exigir_vacio('B cero filas: variantes', 'select id from public.variantes');
  perform pg_temp.exigir_vacio('B cero filas: fotos', 'select id from public.fotos');
  perform pg_temp.exigir_vacio('B cero filas y sin error: catalogo_publico', 'select 1 from public.catalogo_publico');
  perform pg_temp.exigir_vacio('B cero filas: historial', 'select 1 from public.historial');
  perform pg_temp.exigir_vacio('B cero filas: administradores', 'select 1 from public.administradores');
  perform pg_temp.exigir_vacio('B cero filas: configuracion', 'select 1 from public.configuracion');
  perform pg_temp.exigir_guardia('B rechazado: fn_admin_tallas', 'select * from public.fn_admin_tallas()');
  perform pg_temp.exigir_guardia('B rechazado: fn_admin_tallas por variante',
    $q$select * from public.fn_admin_tallas('20000000-4444-0000-0000-00000000000a')$q$);
  perform pg_temp.exigir_guardia('B rechazado: fn_confirmar_por_proveedor',
    $q$select public.fn_confirmar_por_proveedor('30000000-4444-0000-0000-00000000000a')$q$);
  perform pg_temp.exigir_guardia('B rechazado: fn_confirmar_por_publicacion',
    $q$select public.fn_confirmar_por_publicacion('30000000-4444-0000-0000-00000000000a', now())$q$);
  perform pg_temp.exigir_guardia('B rechazado: fn_marcar_agotada',
    $q$select public.fn_marcar_agotada('30000000-4444-0000-0000-00000000000a', 'pirata')$q$);
  perform pg_temp.exigir_denegado('B denegado: fn_lote_actual', 'select public.fn_lote_actual()');
  perform pg_temp.exigir_denegado('B denegado: fn_marcar_actualizado', 'select public.fn_marcar_actualizado()');
  perform pg_temp.exigir_denegado('B denegado: fn_tallas_antes_de_escribir', 'select public.fn_tallas_antes_de_escribir()');
  perform pg_temp.exigir_denegado('B denegado: fn_registrar_historial', 'select public.fn_registrar_historial()');
  perform pg_temp.exigir_denegado('B denegado: insertar producto (RLS)', $q$insert into public.productos (nombre, marca) values ('PIRATA', 'X')$q$);
  perform pg_temp.exigir_denegado('B denegado: insertar talla (RLS)',
    $q$insert into public.tallas (variante_id, talla) values ('20000000-4444-0000-0000-00000000000a', '99')$q$);
  perform pg_temp.exigir_denegado('B denegado: nombrarse administrador',
    $q$insert into public.administradores (user_id) values ('bbbbbbbb-4444-0000-0000-000000000002')$q$);
  perform pg_temp.exigir_denegado('B denegado: escribir en el historial',
    $q$insert into public.historial (tabla, fila_id, operacion) values ('x', gen_random_uuid(), 'INSERT')$q$);
  perform pg_temp.exigir_denegado('B denegado: insertar configuración (RLS)', $q$insert into public.configuracion (clave, valor) values ('x', 'y')$q$);

  update public.tallas set estado = 'AGOTADA', nota = 'pirata' where id = '30000000-4444-0000-0000-00000000000a';
  get diagnostics n = row_count;
  perform pg_temp.exigir('B cambiar disponibilidad no afecta a ninguna fila', n = 0, n::text);
  perform pg_temp.exigir_denegado('B denegado: borrar tallas (14f.2; antes, cero filas)',
    $q$delete from public.tallas where id = '30000000-4444-0000-0000-00000000000a'$q$);
  update public.productos set nombre = 'PIRATA' where id = '10000000-4444-0000-0000-00000000000a';
  get diagnostics n = row_count;
  perform pg_temp.exigir('B modificar productos no afecta a ninguna fila', n = 0, n::text);
  update public.configuracion set valor = '60';
  get diagnostics n = row_count;
  perform pg_temp.exigir('B cambiar configuración no afecta a ninguna fila', n = 0, n::text);
end;
$$;
reset role;

do $$
begin
  perform pg_temp.exigir('B los datos siguen intactos tras los intentos',
    (select estado = 'REVISAR' and nota = 'CENTINELA-NOTA' from public.tallas where id = '30000000-4444-0000-0000-00000000000a')
    and (select nombre = 'PRUEBA 40' from public.productos where id = '10000000-4444-0000-0000-00000000000a')
    and (select valor = '48' from public.configuracion where clave = 'vigencia_horas_predeterminada')
    and not exists (select 1 from public.administradores where user_id = 'bbbbbbbb-4444-0000-0000-000000000002'));
end;
$$;

-- =====================================================================
-- C. Administrador legítimo
-- =====================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-4444-0000-0000-000000000001', true);
select set_config('gamaytalla.lote', 'cccccccc-4444-0000-0000-000000000003', true);

-- La vista es la misma para el visitante y para el administrador.
do $$
begin
  perform pg_temp.exigir('E la vista devuelve al administrador lo mismo que al visitante',
    (select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.codigo)::text, ''))
       from (select v."codigoInterno" as codigo, v.* from public.catalogo_publico v) c) = current_setting('prueba.vista_anon'));
end;
$$;

do $$
declare
  v_fila public.tallas;
  v_prod uuid;
  v_codigo text;
  v_variante text;
  n bigint;
  v_horas numeric;
begin
  perform pg_temp.exigir('C es reconocido', public.fn_es_administrador());
  select * into v_fila from public.fn_admin_tallas() where id = '30000000-4444-0000-0000-00000000000a';
  perform pg_temp.exigir('C lee la nota por fn_admin_tallas', v_fila.nota = 'CENTINELA-NOTA');
  perform pg_temp.exigir('C lee estado_migrado por fn_admin_tallas', v_fila.estado_migrado = 'CENTINELA-MIGRADO');
  perform pg_temp.exigir('C lee fechas y origen por fn_admin_tallas',
    v_fila.publicado_en is not null and v_fila.confirmado_en is not null and v_fila.registrado_en is not null
    and v_fila.origen = 'proveedor' and v_fila.vigencia_horas = 48 and v_fila.creado_en is not null and v_fila.actualizado_en is not null);
  perform pg_temp.exigir('C ve también las tallas de un producto inactivo',
    exists (select 1 from public.fn_admin_tallas() where nota = 'NOTA-DE-INACTIVO'));
  select count(*) into n from public.fn_admin_tallas('20000000-4444-0000-0000-00000000000a');
  perform pg_temp.exigir('C fn_admin_tallas filtra por variante', n = 2, n::text);
  perform pg_temp.exigir('C fn_admin_tallas ordena las tallas por valor',
    (select array_agg(talla) from public.fn_admin_tallas('20000000-4444-0000-0000-00000000000a')) = array['40', '40 2/3']);

  -- Sus autorizaciones existentes se conservan: filas, también las inactivas.
  perform pg_temp.exigir('C ve productos inactivos', exists (select 1 from public.productos where nombre = 'INACTIVO 40'));
  perform pg_temp.exigir('C lee columnas públicas de tallas inactivas', exists (select 1 from public.tallas where id = '30000000-4444-0000-0000-00000000000c'));
  perform pg_temp.exigir('C lee administradores', exists (select 1 from public.administradores));
  perform pg_temp.exigir('C lee configuración', exists (select 1 from public.configuracion where clave = 'vigencia_horas_predeterminada'));
  perform pg_temp.exigir('C lee fechas de productos y variantes',
    (select creado_en is not null from public.productos where nombre = 'PRUEBA 40')
    and (select actualizado_en is not null from public.variantes where codigo_variante = 'PR-40-A'));
  perform pg_temp.exigir('C lee el historial', exists (select 1 from public.historial where fila_id = '30000000-4444-0000-0000-00000000000a'));
  perform pg_temp.exigir('C lee la nota en el historial', exists (select 1 from public.historial where fila_nueva ->> 'nota' = 'CENTINELA-NOTA'));

  -- Escribir la nota sigue siendo directo; leerla, por la función.
  update public.tallas set nota = 'NOTA EDITADA' where id = '30000000-4444-0000-0000-00000000000b';
  get diagnostics n = row_count;
  perform pg_temp.exigir('C edita la nota por la tabla', n = 1, n::text);
  perform pg_temp.exigir('C la nota editada se lee por la función',
    (select nota = 'NOTA EDITADA' from public.fn_admin_tallas() where id = '30000000-4444-0000-0000-00000000000b'));

  -- Disponibilidad y disparadores.
  v_fila := public.fn_confirmar_por_proveedor('30000000-4444-0000-0000-00000000000a');
  v_horas := extract(epoch from v_fila.vence_en - v_fila.vigencia_desde) / 3600;
  perform pg_temp.exigir('C confirma disponibilidad: 48 h por el disparador', v_fila.estado = 'CONFIRMADA' and v_horas = 48, v_horas::text);
  perform pg_temp.exigir('C la vista muestra la talla DISPONIBLE',
    (select v -> 'tallasDisponibles' = '["40"]'::jsonb from public.catalogo_publico c, jsonb_array_elements(c.variantes) v where c.nombre = 'PRUEBA 40'));
  v_fila := public.fn_confirmar_por_publicacion('30000000-4444-0000-0000-00000000000a', now() - interval '1 hour');
  perform pg_temp.exigir('C confirma por publicación', v_fila.origen = 'publicacion' and v_fila.vigencia_desde = v_fila.publicado_en);
  v_fila := public.fn_marcar_agotada('30000000-4444-0000-0000-00000000000a', 'sin stock');
  perform pg_temp.exigir('C marca agotada y recibe la fila completa', v_fila.estado = 'AGOTADA' and v_fila.vence_en is null and v_fila.nota = 'sin stock');
  perform pg_temp.exigir('C la vista muestra la talla AGOTADO',
    (select v -> 'tallasAgotadas' = '["40"]'::jsonb from public.catalogo_publico c, jsonb_array_elements(c.variantes) v where c.nombre = 'PRUEBA 40'));

  insert into public.productos (nombre, marca) values ('DEL PANEL 40', 'Marca') returning id, codigo_interno into v_prod, v_codigo;
  perform pg_temp.exigir('C crea producto: fn_asignar_codigo_interno funciona', v_codigo ~ '^GT-[0-9]{5}$', v_codigo);
  insert into public.variantes (producto_id, color) values (v_prod, 'Azul') returning codigo_variante into v_variante;
  perform pg_temp.exigir('C crea variante: fn_asignar_codigo_variante funciona', v_variante = v_codigo || '-A', v_variante);
  perform pg_temp.exigir('C fn_registrar_historial y fn_lote_actual funcionan sin EXECUTE del rol',
    exists (select 1 from public.historial h where h.fila_id = v_prod and h.autor = 'aaaaaaaa-4444-0000-0000-000000000001' and h.lote = 'cccccccc-4444-0000-0000-000000000003'));
  update public.configuracion set valor = '50' where clave = 'vigencia_horas_predeterminada';
  get diagnostics n = row_count;
  perform pg_temp.exigir('C cambia la configuración', n = 1, n::text);
  perform pg_temp.exigir_denegado('C denegado: borrar una talla (14f.2: se desactiva)',
    $q$delete from public.tallas where id = '30000000-4444-0000-0000-00000000000b'$q$);
  perform pg_temp.exigir('C la talla sigue existiendo tras el intento', exists (select 1 from public.tallas where id = '30000000-4444-0000-0000-00000000000b'));
end;
$$;

-- Por la tabla, esas columnas siguen cerradas también para él: la regla es la misma.
select pg_temp.exigir_tallas_cerradas('C por la tabla');
select pg_temp.exigir_denegado('C no modifica el historial', $q$update public.historial set tabla = 'x'$q$);
select pg_temp.exigir_denegado('C no borra el historial', 'delete from public.historial');
select pg_temp.exigir_denegado('C no se nombra administrador a otros', $q$insert into public.administradores (user_id) values (gen_random_uuid())$q$);
select pg_temp.exigir_denegado('C no toca la secuencia', $q$select nextval('public.seq_codigo_producto')$q$);
reset role;

-- fn_marcar_actualizado: dentro de una transacción now() no avanza; se parte de una fecha antigua.
do $$
declare v_fecha timestamptz;
begin
  update public.productos set actualizado_en = '2000-01-01', nombre = 'PRUEBA 40 B'
   where id = '10000000-4444-0000-0000-00000000000a' returning actualizado_en into v_fecha;
  perform pg_temp.exigir('D fn_marcar_actualizado sigue sobrescribiendo actualizado_en', v_fecha > '2020-01-01');
end;
$$;

-- =====================================================================
-- service_role: sin permisos sobre funciones; los disparadores no dependen de ellos
-- =====================================================================
set local role service_role;
do $$
declare v_codigo text;
begin
  insert into public.productos (nombre, marca) values ('DE SERVICIO 40', 'Marca') returning codigo_interno into v_codigo;
  perform pg_temp.exigir('D service_role inserta y los disparadores funcionan', v_codigo ~ '^GT-[0-9]{5}$', v_codigo);
  perform pg_temp.exigir_denegado('D service_role no ejecuta fn_admin_tallas', 'select * from public.fn_admin_tallas()');
  perform pg_temp.exigir_denegado('D service_role no ejecuta fn_confirmar_por_proveedor',
    $q$select public.fn_confirmar_por_proveedor('30000000-4444-0000-0000-00000000000a')$q$);
  perform pg_temp.exigir_denegado('D service_role no ejecuta fn_lote_actual', 'select public.fn_lote_actual()');
  perform pg_temp.exigir_denegado('D service_role no lee la vista: necesitará una concesión explícita', 'select to_jsonb(c)::text from public.catalogo_publico c');
end;
$$;
reset role;

rollback;
