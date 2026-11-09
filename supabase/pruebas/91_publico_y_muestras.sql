-- Etapa 16.3 · Público (Hombre / Dama) y muestra de color por variante.
-- Escriben datos y se deshacen al final, PERO el ROLLBACK no devuelve las secuencias:
-- ejecutar SOLO en un entorno local desechable, nunca en el proyecto remoto.
--
--   docker exec -i supabase_db_Yeny_Oficial psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/pruebas/91_publico_y_muestras.sql
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

-- Zapatilla de prueba con dos colores; p_prod y p_var* se mezclan en el producto y en cada color.
create or replace function pg_temp.datos(p_prod jsonb default '{}'::jsonb, p_var_a jsonb default '{}'::jsonb, p_var_b jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', '10000000-9191-0000-0000-00000000000a', 'nombre', 'Prueba 91', 'marca', 'Marca 91', 'categoria', 'Urbanas', 'segmento', 'mujer',
    'variantes', jsonb_build_array(
      jsonb_build_object('id', '20000000-9191-0000-0000-00000000000a', 'color', 'Beige/Blancas', 'precio', 120000, 'activa', true, 'orden', 0,
                         'tallas', '[]'::jsonb, 'fotos', '[]'::jsonb) || p_var_a,
      jsonb_build_object('id', '20000000-9191-0000-0000-00000000000b', 'color', 'Negro', 'precio', 120000, 'activa', true, 'orden', 1,
                         'tallas', '[]'::jsonb, 'fotos', '[]'::jsonb) || p_var_b)) || p_prod;
$$;
grant execute on all functions in schema pg_temp to public;

insert into public.administradores (user_id, nombre) values ('aaaaaaaa-9191-0000-0000-000000000001', 'admin de prueba 91');

-- ============================================================= A. visitante
set local role anon;
do $$
begin
  perform pg_temp.exigir('A anon lee publico y muestra_color (los usa la vista) y no los escribe',
    has_column_privilege('public.productos', 'publico', 'SELECT') and has_column_privilege('public.variantes', 'muestra_color', 'SELECT')
    and not has_column_privilege('public.productos', 'publico', 'UPDATE') and not has_column_privilege('public.variantes', 'muestra_color', 'UPDATE'));
end;
$$;
reset role;

-- ============================================================= B. administrador
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-9191-0000-0000-000000000001', true);
do $$
declare r jsonb; v_ver integer;
begin
  -- B1 (etapa 17) crear sin público se rechaza; con público y sin muestras: colores sin muestra.
  perform pg_temp.exigir_rechazo('B1 crear sin público se rechaza (etapa 17: obligatorio)',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos(), null, gen_random_uuid())$q$, 'PT422', 'Hombre, Dama o Unisex');
  r := public.fn_admin_guardar_producto(pg_temp.datos('{"publico": "dama"}'), null, gen_random_uuid());
  perform pg_temp.exigir('B1 crear responde «aplicada» y anuncia público y muestras', r ->> 'estado' = 'aplicada' and (r ->> 'publico_y_muestras')::boolean, r::text);
  perform pg_temp.exigir('B1 clasificada y sin muestras',
    (select publico = 'dama' from public.productos where id = '10000000-9191-0000-0000-00000000000a')
    and (select bool_and(muestra_color is null) from public.variantes where producto_id = '10000000-9191-0000-0000-00000000000a'));

  -- B2 «Hombre» (con mayúsculas y espacios) y una muestra en mayúsculas se normalizan.
  r := public.fn_admin_guardar_producto(pg_temp.datos('{"publico": " Hombre "}', '{"muestra_color": "#E8DCC8"}'), 1, gen_random_uuid());
  perform pg_temp.exigir('B2 público «hombre» y muestra «#e8dcc8»; la otra variante sigue sin muestra',
    (select publico = 'hombre' from public.productos where id = '10000000-9191-0000-0000-00000000000a')
    and (select muestra_color = '#e8dcc8' from public.variantes where id = '20000000-9191-0000-0000-00000000000a')
    and (select muestra_color is null from public.variantes where id = '20000000-9191-0000-0000-00000000000b'), r::text);
  perform pg_temp.exigir('B2 el público no cambia el segmento (tabla de la guía)',
    (select segmento = 'mujer' from public.productos where id = '10000000-9191-0000-0000-00000000000a'));

  -- B3 un cliente anterior (sin los campos) conserva lo guardado.
  r := public.fn_admin_guardar_producto(pg_temp.datos('{"nombre": "Prueba 91 bis"}'), 2, gen_random_uuid());
  perform pg_temp.exigir('B3 sin los campos nuevos se conservan público y muestra',
    (select publico = 'hombre' and nombre = 'PRUEBA 91 BIS' from public.productos where id = '10000000-9191-0000-0000-00000000000a')
    and (select muestra_color = '#e8dcc8' from public.variantes where id = '20000000-9191-0000-0000-00000000000a'), r::text);

  -- B4 valores no válidos: se rechaza todo el guardado.
  perform pg_temp.exigir_rechazo('B4 público desconocido',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('{"publico": "niños"}'), 3, gen_random_uuid())$q$, 'PT422', 'Hombre, Dama o Unisex');
  perform pg_temp.exigir_rechazo('B4 público que no es texto',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('{"publico": {"x": 1}}'), 3, gen_random_uuid())$q$, 'PT422', 'Hombre, Dama o Unisex');
  perform pg_temp.exigir_rechazo('B4 muestra que no es hexadecimal',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('{}', '{"muestra_color": "red"}'), 3, gen_random_uuid())$q$, 'PT422', 'hexadecimal');
  perform pg_temp.exigir_rechazo('B4 muestra con CSS inyectado',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('{}', '{"muestra_color": "#fff; background:url(x)"}'), 3, gen_random_uuid())$q$, 'PT422', 'hexadecimal');
  perform pg_temp.exigir_rechazo('B4 muestra de tres cifras (se exige #rrggbb)',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('{}', '{"muestra_color": "#fff"}'), 3, gen_random_uuid())$q$, 'PT422', 'hexadecimal');
  perform pg_temp.exigir('B4 nada cambió tras los rechazos',
    (select version = 3 and publico = 'hombre' from public.productos where id = '10000000-9191-0000-0000-00000000000a'));

  -- B5 «Dama»; la muestra se quita con null o vacío. (Etapa 17: el público ya no vuelve a «sin
  -- clasificar»: null o vacío se rechazan; lo comprueba 92_publico_obligatorio.sql.)
  r := public.fn_admin_guardar_producto(pg_temp.datos('{"publico": "dama"}', '{"muestra_color": null}', '{"muestra_color": "#111111"}'), 3, gen_random_uuid());
  perform pg_temp.exigir('B5 «dama»; la muestra se quita con null y se pone en el otro color',
    (select publico = 'dama' from public.productos where id = '10000000-9191-0000-0000-00000000000a')
    and (select muestra_color is null from public.variantes where id = '20000000-9191-0000-0000-00000000000a')
    and (select muestra_color = '#111111' from public.variantes where id = '20000000-9191-0000-0000-00000000000b'), r::text);
  r := public.fn_admin_guardar_producto(pg_temp.datos('{"publico": "dama"}', '{}', '{"muestra_color": ""}'), 4, gen_random_uuid());
  perform pg_temp.exigir('B5 muestra vacía = sin muestra; el público se conserva',
    (select publico = 'dama' from public.productos where id = '10000000-9191-0000-0000-00000000000a')
    and (select muestra_color is null from public.variantes where id = '20000000-9191-0000-0000-00000000000b'), r::text);

  -- B6 conflicto de versión y operación repetida siguen funcionando con los campos nuevos.
  select version into v_ver from public.productos where id = '10000000-9191-0000-0000-00000000000a';
  perform pg_temp.exigir_rechazo('B6 un formulario desactualizado no cambia el público',
    format($q$select public.fn_admin_guardar_producto(pg_temp.datos('{"publico": "hombre"}'), %s, gen_random_uuid())$q$, v_ver - 1), 'PT409', 'Otra edición');
  r := public.fn_admin_guardar_producto(pg_temp.datos('{"publico": "hombre"}'), v_ver, '40000000-9191-0000-0000-0000000000b6');
  r := public.fn_admin_guardar_producto(pg_temp.datos('{"publico": "dama"}'), v_ver, '40000000-9191-0000-0000-0000000000b6');
  perform pg_temp.exigir('B6 repetir la operación no aplica nada otra vez', r ->> 'estado' = 'ya_aplicada'
    and (select publico = 'hombre' and version = v_ver + 1 from public.productos where id = '10000000-9191-0000-0000-00000000000a'), r::text);

  -- B7 una escritura directa con una muestra no válida la frena la restricción de la tabla.
  perform pg_temp.exigir_rechazo('B7 la tabla rechaza una muestra no válida aunque no pase por el RPC',
    $q$update public.variantes set muestra_color = 'url(x)' where id = '20000000-9191-0000-0000-00000000000a'$q$, '23514', 'variantes_muestra_color_valida');
  perform pg_temp.exigir_rechazo('B7 la tabla rechaza un público desconocido',
    $q$update public.productos set publico = 'otro' where id = '10000000-9191-0000-0000-00000000000a'$q$, '23514', 'productos_publico_valido');
end;
$$;
reset role;

-- ============================================================= C. tienda
do $$
begin
  update public.productos set activo = true where id = '10000000-9191-0000-0000-00000000000a';
  update public.variantes set muestra_color = '#e8dcc8' where id = '20000000-9191-0000-0000-00000000000a';
  perform pg_temp.exigir('C la vista expone «publico» y «muestra» sin cambiar el id',
    exists (select 1 from public.catalogo_publico c, jsonb_array_elements(c.variantes) v
             where c.id = '10000000-9191-0000-0000-00000000000a' and c.publico = 'hombre'
               and v ->> 'id' = '20000000-9191-0000-0000-00000000000a' and v ->> 'muestra' = '#e8dcc8'));
  perform pg_temp.exigir('C la vista conserva security_invoker',
    exists (select 1 from pg_class where oid = 'public.catalogo_publico'::regclass and reloptions @> array['security_invoker=true']));
end;
$$;

rollback;
