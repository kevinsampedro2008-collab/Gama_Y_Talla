-- Etapa 18 · Cómo se muestra cada color: círculo o foto (20261117010000).
-- Escriben datos y se deshacen al final, PERO el ROLLBACK no devuelve las secuencias:
-- ejecutar SOLO en un entorno local desechable, nunca en el proyecto remoto.
--
--   docker exec -i supabase_db_Yeny_Oficial psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/pruebas/93_forma_muestra.sql
begin;

create or replace function pg_temp.exigir(p_prueba text, p_ok boolean, p_detalle text default '')
returns void language plpgsql as $$
begin
  if coalesce(p_ok, false) then raise notice 'OK     %', p_prueba;
  else raise exception 'FALLA  % %', p_prueba, p_detalle; end if;
end;
$$;

create or replace function pg_temp.exigir_rechazo(p_prueba text, p_sql text, p_estado text, p_patron text)
returns void language plpgsql as $$
declare v_estado text; v_mensaje text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_estado = returned_sqlstate, v_mensaje = message_text;
  end;
  perform pg_temp.exigir(p_prueba, v_estado = p_estado and v_mensaje ~ p_patron,
    format('-> %s', coalesce(v_estado || ' ' || v_mensaje, 'fue ACEPTADA')));
end;
$$;

-- Zapatilla de prueba con dos colores; p_a y p_b se mezclan en cada color.
create or replace function pg_temp.datos(p_a jsonb default '{}'::jsonb, p_b jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', '10000000-9393-0000-0000-00000000000a', 'nombre', 'Prueba 93', 'marca', 'Marca 93', 'categoria', 'Urbanas', 'publico', 'dama',
    'variantes', jsonb_build_array(
      jsonb_build_object('id', '20000000-9393-0000-0000-00000000000a', 'color', 'Blanco con rojo', 'precio', 150000, 'activa', true, 'orden', 0,
                         'tallas', '[{"id": "30000000-9393-0000-0000-00000000000a", "talla": "38", "activa": true}]'::jsonb,
                         'fotos', '[{"ruta": "http://127.0.0.1:54321/storage/v1/object/public/fotos-catalogo/productos/10000000-9393-0000-0000-00000000000a/20000000-9393-0000-0000-00000000000a/1763350000000-prueba9393.webp"}]'::jsonb) || p_a,
      jsonb_build_object('id', '20000000-9393-0000-0000-00000000000b', 'color', 'Blanco con azul', 'precio', 150000, 'activa', true, 'orden', 1,
                         'tallas', '[]'::jsonb, 'fotos', '[]'::jsonb) || p_b));
$$;
create or replace function pg_temp.forma(p_var text) returns text language sql as $$
  select forma_muestra from public.variantes where id = p_var::uuid;
$$;
create or replace function pg_temp.version() returns integer language sql as $$
  select version from public.productos where id = '10000000-9393-0000-0000-00000000000a';
$$;
grant execute on all functions in schema pg_temp to public;

insert into public.administradores (user_id, nombre) values ('aaaaaaaa-9393-0000-0000-000000000001', 'admin de prueba 93');
insert into storage.objects (bucket_id, name)
values ('fotos-catalogo', 'productos/10000000-9393-0000-0000-00000000000a/20000000-9393-0000-0000-00000000000a/1763350000000-prueba9393.webp');

-- ============================================================= A. columna
do $$
begin
  perform pg_temp.exigir('A1 la columna existe, NOT NULL y con «circulo» por omisión',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'variantes'
             and column_name = 'forma_muestra' and is_nullable = 'NO' and column_default like '''circulo''%'));
  perform pg_temp.exigir('A2 ningún color existente quedó con otro valor',
    not exists (select 1 from public.variantes where forma_muestra not in ('circulo', 'foto')));
  perform pg_temp.exigir('A3 anon solo lee la columna',
    has_column_privilege('anon', 'public.variantes', 'forma_muestra', 'SELECT')
    and not has_column_privilege('anon', 'public.variantes', 'forma_muestra', 'UPDATE')
    and not has_column_privilege('anon', 'public.variantes', 'forma_muestra', 'INSERT'));
end;
$$;

-- Un color insertado sin pasar por el panel (registro antiguo) queda en «circulo».
insert into public.productos (id, nombre, marca, categoria, activo, publico)
values ('10000000-9393-0000-0000-00000000000c', 'Antigua 93', 'Marca 93', 'Urbanas', true, 'hombre');
insert into public.variantes (id, producto_id, color, precio) values ('20000000-9393-0000-0000-00000000000c', '10000000-9393-0000-0000-00000000000c', 'Gris', 90000);
do $$ begin
  perform pg_temp.exigir('A4 un color antiguo sin el campo queda en «circulo»', pg_temp.forma('20000000-9393-0000-0000-00000000000c') = 'circulo');
  begin
    update public.variantes set forma_muestra = 'miniatura' where id = '20000000-9393-0000-0000-00000000000c';
    perform pg_temp.exigir('A5 la restricción rechaza otro valor', false);
  exception when check_violation then
    perform pg_temp.exigir('A5 la restricción rechaza otro valor', true);
  end;
end $$;

-- ============================================================= B. guardar desde el panel
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-9393-0000-0000-000000000001', true);
do $$
declare r jsonb; v_ver integer;
begin
  perform pg_temp.exigir_rechazo('B1 un valor desconocido se rechaza',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('{"forma_muestra": "miniatura"}'), null, gen_random_uuid())$q$, 'PT422', 'círculo de color o foto');
  perform pg_temp.exigir_rechazo('B1 un valor que no es texto se rechaza',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('{"forma_muestra": true}'), null, gen_random_uuid())$q$, 'PT422', 'círculo de color o foto');
  perform pg_temp.exigir('B1 ningún rechazo creó la zapatilla',
    not exists (select 1 from public.productos where id = '10000000-9393-0000-0000-00000000000a'));

  -- B2 crear: uno con «FOTO » (mayúsculas y espacios), el otro sin el campo → «circulo».
  r := public.fn_admin_guardar_producto(pg_temp.datos('{"forma_muestra": " FOTO "}'), null, gen_random_uuid());
  perform pg_temp.exigir('B2 crea y responde forma_muestra', r ->> 'estado' = 'aplicada' and (r ->> 'forma_muestra')::boolean, r::text);
  perform pg_temp.exigir('B2 «foto» guardada en el primer color', pg_temp.forma('20000000-9393-0000-0000-00000000000a') = 'foto');
  perform pg_temp.exigir('B2 sin el campo, el segundo color queda en «circulo»', pg_temp.forma('20000000-9393-0000-0000-00000000000b') = 'circulo');

  -- B3 un panel anterior que no envía el campo conserva lo guardado.
  v_ver := pg_temp.version();
  r := public.fn_admin_guardar_producto(pg_temp.datos('{"tallas": [{"id": "30000000-9393-0000-0000-00000000000a", "talla": "38", "activa": true, "activa_original": true}]}'), v_ver, gen_random_uuid());
  perform pg_temp.exigir('B3 sin el campo se conserva «foto»', pg_temp.forma('20000000-9393-0000-0000-00000000000a') = 'foto', r::text);
  perform pg_temp.exigir('B3 null también conserva',
    (public.fn_admin_guardar_producto(pg_temp.datos('{"forma_muestra": null, "tallas": [{"id": "30000000-9393-0000-0000-00000000000a", "talla": "38", "activa": true, "activa_original": true}]}'),
       pg_temp.version(), gen_random_uuid()) ->> 'estado') = 'aplicada' and pg_temp.forma('20000000-9393-0000-0000-00000000000a') = 'foto');

  -- B4 cambiar en los dos sentidos, color por color.
  r := public.fn_admin_guardar_producto(pg_temp.datos('{"forma_muestra": "circulo", "tallas": [{"id": "30000000-9393-0000-0000-00000000000a", "talla": "38", "activa": true, "activa_original": true}]}', '{"forma_muestra": "foto"}'),
         pg_temp.version(), gen_random_uuid());
  perform pg_temp.exigir('B4 foto → círculo y círculo → foto en el mismo guardado',
    pg_temp.forma('20000000-9393-0000-0000-00000000000a') = 'circulo' and pg_temp.forma('20000000-9393-0000-0000-00000000000b') = 'foto', r::text);

  -- B5 la misma operación no se aplica dos veces.
  v_ver := pg_temp.version();
  r := public.fn_admin_guardar_producto(pg_temp.datos('{"forma_muestra": "foto", "tallas": [{"id": "30000000-9393-0000-0000-00000000000a", "talla": "38", "activa": true, "activa_original": true}]}', '{"forma_muestra": "foto"}'),
         v_ver, 'eeeeeeee-9393-0000-0000-000000000001');
  r := public.fn_admin_guardar_producto(pg_temp.datos('{"forma_muestra": "foto", "tallas": [{"id": "30000000-9393-0000-0000-00000000000a", "talla": "38", "activa": true, "activa_original": true}]}', '{"forma_muestra": "foto"}'),
         v_ver, 'eeeeeeee-9393-0000-0000-000000000001');
  perform pg_temp.exigir('B5 reintentar la misma operación responde «ya_aplicada» con forma_muestra',
    r ->> 'estado' = 'ya_aplicada' and (r ->> 'forma_muestra')::boolean and pg_temp.version() = v_ver + 1, r::text);
end;
$$;
reset role;

-- ============================================================= C. vista pública
update public.productos set activo = true where id = '10000000-9393-0000-0000-00000000000a';
set local role anon;
do $$
declare v jsonb;
begin
  select variantes into v from public.catalogo_publico where nombre = 'PRUEBA 93';
  perform pg_temp.exigir('C1 la vista entrega «forma» por color', v -> 0 ->> 'forma' = 'foto' and v -> 1 ->> 'forma' = 'foto', v::text);
  perform pg_temp.exigir('C2 el color sin fotos entrega «foto» con imagenes vacía (la tienda usa el círculo)',
    jsonb_array_length(v -> 1 -> 'imagenes') = 0);
  select variantes into v from public.catalogo_publico where upper(nombre) = 'ANTIGUA 93';
  perform pg_temp.exigir('C3 el registro antiguo entrega «circulo»', v -> 0 ->> 'forma' = 'circulo', coalesce(v::text, 'sin fila'));
  perform pg_temp.exigir('C4 las columnas de la vista no cambiaron',
    (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
      where table_schema = 'public' and table_name = 'catalogo_publico')
    = 'id,codigoInterno,referencia,nombre,marca,categoria,descripcion,segmento,destacado,nuevoIngreso,orden,variantes,publico');
end;
$$;
reset role;

rollback;
