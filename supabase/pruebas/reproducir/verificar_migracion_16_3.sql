-- Comprueba 20261108040000 sobre los datos de datos_previos_16_3.sql. SOLO LOCAL.
-- Escribe (guarda público y muestras como administrador ficticio) y lo deshace al final; el esquema
-- de la instantánea se borra. Termina con error ante el primer fallo.
--
--   docker exec -i supabase_db_Yeny_Oficial psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/pruebas/reproducir/verificar_migracion_16_3.sql
\set ON_ERROR_STOP 1
begin;
create or replace function pg_temp.exigir(p_prueba text, p_ok boolean, p_detalle text default '')
returns void language plpgsql as $$
begin
  if coalesce(p_ok, false) then raise notice 'OK     %', p_prueba;
  else raise exception 'FALLA  % %', p_prueba, p_detalle; end if;
end;
$$;
grant execute on all functions in schema pg_temp to public;

do $$
declare v_admin uuid := '00000000-1630-0000-0000-0000000000ad'; v_r jsonb; v_datos jsonb;
begin
  -- La vista conserva TODO lo anterior; solo añade «publico» (null) y «muestra» (null) en cada color.
  perform pg_temp.exigir('N1 la vista conserva cada campo anterior y su valor (mismos id, códigos, colores, tallas, fotos)',
    (select count(*) = 2 and bool_and(
       ((to_jsonb(c) - 'publico') || jsonb_build_object('variantes',
          (select coalesce(jsonb_agg(v - 'muestra' order by o), '[]'::jsonb) from jsonb_array_elements(to_jsonb(c) -> 'variantes') with ordinality x(v, o))))
       = a.fila)
       from pruebas_16_3.vista a join public.catalogo_publico c on c.id = a.fila ->> 'id'));
  perform pg_temp.exigir('N2 los productos existentes quedan sin clasificar y sus colores sin muestra',
    (select bool_and(publico is null) from public.productos where id::text like '10000000-1630-%')
    and (select bool_and(muestra_color is null) from public.variantes where id::text like '20000000-1630-%')
    and (select bool_and(c.publico is null) from public.catalogo_publico c where c.id in ('LEG-163-UNO', '10000000-1630-0000-0000-000000000002')));
  perform pg_temp.exigir('N3 filas de productos y colores idénticas (versión, segmento, claves, actualizado_en)',
    (select bool_and(to_jsonb(p) - 'publico' = to_jsonb(s)) from public.productos p join pruebas_16_3.productos s using (id))
    and (select bool_and(to_jsonb(v) - 'muestra_color' = to_jsonb(s)) from public.variantes v join pruebas_16_3.variantes s using (id)));
  perform pg_temp.exigir('N4 tallas y fotos idénticas',
    (select count(*) = 2 from public.tallas t join pruebas_16_3.tallas s using (id) where to_jsonb(t) = to_jsonb(s))
    and (select count(*) = 1 from public.fotos f join pruebas_16_3.fotos s using (id) where to_jsonb(f) = to_jsonb(s)));

  -- Guardar con el RPC: público y muestra; luego un cliente anterior (sin esos campos) los conserva.
  insert into public.administradores (user_id, nombre) values (v_admin, 'Administración ficticia 16.3');
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select jsonb_build_object('id', p.id, 'nombre', p.nombre, 'marca', p.marca, 'categoria', p.categoria, 'segmento', p.segmento,
           'variantes', (select jsonb_agg(jsonb_build_object('id', v.id, 'color', v.color, 'precio', v.precio, 'activa', v.activa, 'orden', v.orden,
                                    'tallas', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'talla', t.talla, 'activa', t.activa, 'activa_original', t.activa)), '[]')
                                                 from public.tallas t where t.variante_id = v.id),
                                    'fotos', (select coalesce(jsonb_agg(jsonb_build_object('ruta', f.ruta)), '[]') from public.fotos f where f.variante_id = v.id))
                         order by v.orden) from public.variantes v where v.producto_id = p.id))
    into v_datos from public.productos p where p.id = '10000000-1630-0000-0000-000000000001';
  -- Cliente anterior: no envía «publico» ni «muestra_color».
  v_r := public.fn_admin_guardar_producto(v_datos, (select version from public.productos where id = '10000000-1630-0000-0000-000000000001'), gen_random_uuid());
  perform pg_temp.exigir('N5 un cliente anterior guarda sin tocar público ni muestras', (v_r ->> 'publico_y_muestras')::boolean
    and (select publico is null from public.productos where id = '10000000-1630-0000-0000-000000000001'), v_r::text);
  v_datos := jsonb_set(v_datos || '{"publico": "Dama"}', '{variantes,0,muestra_color}', '"#E8DCC8"');
  v_r := public.fn_admin_guardar_producto(v_datos, (select version from public.productos where id = '10000000-1630-0000-0000-000000000001'), gen_random_uuid());
  reset role;
  perform pg_temp.exigir('N6 «Dama» y la muestra se guardan normalizados; el segmento de la guía no cambia',
    (select publico = 'dama' and segmento = 'mujer' from public.productos where id = '10000000-1630-0000-0000-000000000001')
    and (select muestra_color = '#e8dcc8' from public.variantes where id = '20000000-1630-0000-0000-000000000001'));
  perform pg_temp.exigir('N7 la tienda ve público y muestra con el MISMO id',
    exists (select 1 from public.catalogo_publico c, jsonb_array_elements(c.variantes) v
             where c.id = 'LEG-163-UNO' and c.publico = 'dama' and v ->> 'id' = 'unica' and v ->> 'muestra' = '#e8dcc8'));
  perform pg_temp.exigir('N8 guardar no movió la talla confirmada',
    (select to_jsonb(t) - 'actualizado_en' = to_jsonb(s) - 'actualizado_en' and t.actualizado_en = s.actualizado_en
       from public.tallas t join pruebas_16_3.tallas s using (id) where t.id = '30000000-1630-0000-0000-000000000001'));
end;
$$;
rollback;
drop schema if exists pruebas_16_3 cascade;
select 'verificación de la migración 16.3: correcta' as resultado;
