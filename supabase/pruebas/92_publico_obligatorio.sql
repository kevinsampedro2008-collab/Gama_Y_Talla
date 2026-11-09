-- Etapa 17 · Público obligatorio con la opción Unisex (20261109010000).
-- Escriben datos y se deshacen al final, PERO el ROLLBACK no devuelve las secuencias:
-- ejecutar SOLO en un entorno local desechable, nunca en el proyecto remoto.
--
--   docker exec -i supabase_db_Yeny_Oficial psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/pruebas/92_publico_obligatorio.sql
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
declare v_estado text; v_mensaje text; v_detalle text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_estado = returned_sqlstate, v_mensaje = message_text, v_detalle = pg_exception_detail;
  end;
  perform pg_temp.exigir(p_prueba, v_estado = p_estado and v_mensaje ~ p_patron,
    format('-> %s', coalesce(v_estado || ' ' || v_mensaje || ' ' || coalesce(v_detalle, ''), 'fue ACEPTADA')));
end;
$$;

-- Zapatilla de prueba con un color completo (foto y talla activa); p_prod se mezcla en el producto.
create or replace function pg_temp.datos(p_prod jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', '10000000-9292-0000-0000-00000000000a', 'nombre', 'Prueba 92', 'marca', 'Marca 92', 'categoria', 'Urbanas', 'segmento', 'mujer',
    'variantes', jsonb_build_array(
      jsonb_build_object('id', '20000000-9292-0000-0000-00000000000a', 'color', 'Negro', 'precio', 120000, 'activa', true, 'orden', 0,
                         'tallas', '[{"id": "30000000-9292-0000-0000-00000000000a", "talla": "40", "activa": true, "activa_original": true}]'::jsonb,
                         'fotos', '[{"ruta": "http://127.0.0.1:54321/storage/v1/object/public/fotos-catalogo/productos/10000000-9292-0000-0000-00000000000a/20000000-9292-0000-0000-00000000000a/1762650000000-prueba9292.webp"}]'::jsonb))) || p_prod;
$$;
create or replace function pg_temp.version() returns integer language sql as $$
  select version from public.productos where id = '10000000-9292-0000-0000-00000000000a';
$$;
create or replace function pg_temp.publico() returns text language sql as $$
  select publico from public.productos where id = '10000000-9292-0000-0000-00000000000a';
$$;
grant execute on all functions in schema pg_temp to public;

insert into public.administradores (user_id, nombre) values ('aaaaaaaa-9292-0000-0000-000000000001', 'admin de prueba 92');
-- El guardado solo acepta fotos que ya están en Storage: un objeto ficticio (se deshace con el resto).
insert into storage.objects (bucket_id, name)
values ('fotos-catalogo', 'productos/10000000-9292-0000-0000-00000000000a/20000000-9292-0000-0000-00000000000a/1762650000000-prueba9292.webp');

-- ============================================================= A. restricción de la tabla
do $$
begin
  perform pg_temp.exigir('A la restricción admite null, hombre, dama y unisex',
    pg_get_constraintdef((select oid from pg_constraint where conname = 'productos_publico_valido')) ~ 'unisex');
end;
$$;

-- ============================================================= B. guardar
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-9292-0000-0000-000000000001', true);
do $$
declare r jsonb; v_ver integer;
begin
  -- B1 crear sin público, con null, vacío, desconocido o que no es texto: rechazado y no se crea.
  perform pg_temp.exigir_rechazo('B1 crear sin el campo «publico»',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos(), null, gen_random_uuid())$q$, 'PT422', 'Hombre, Dama o Unisex');
  perform pg_temp.exigir_rechazo('B1 crear con público null',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('{"publico": null}'), null, gen_random_uuid())$q$, 'PT422', 'Hombre, Dama o Unisex');
  perform pg_temp.exigir_rechazo('B1 crear con público vacío',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('{"publico": "  "}'), null, gen_random_uuid())$q$, 'PT422', 'Hombre, Dama o Unisex');
  perform pg_temp.exigir_rechazo('B1 crear con público desconocido',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('{"publico": "niños"}'), null, gen_random_uuid())$q$, 'PT422', 'Hombre, Dama o Unisex');
  perform pg_temp.exigir_rechazo('B1 crear con público que no es texto',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('{"publico": ["unisex"]}'), null, gen_random_uuid())$q$, 'PT422', 'Hombre, Dama o Unisex');
  perform pg_temp.exigir('B1 ningún rechazo creó la zapatilla',
    not exists (select 1 from public.productos where id = '10000000-9292-0000-0000-00000000000a'));

  -- B2 crear «Unisex» (mayúsculas y espacios) guarda 'unisex'; la respuesta lo anuncia.
  r := public.fn_admin_guardar_producto(pg_temp.datos('{"publico": "  UniSex "}'), null, gen_random_uuid());
  perform pg_temp.exigir('B2 crea con «unisex» y responde publico_obligatorio',
    r ->> 'estado' = 'aplicada' and (r ->> 'publico_obligatorio')::boolean and pg_temp.publico() = 'unisex', r::text);
  perform pg_temp.exigir('B2 el público no cambia el segmento (tabla de la guía)',
    (select segmento = 'mujer' from public.productos where id = '10000000-9292-0000-0000-00000000000a'));

  -- B3 quitar la clasificación: rechazado, nada cambia.
  v_ver := pg_temp.version();
  perform pg_temp.exigir_rechazo('B3 editar con público null',
    format($q$select public.fn_admin_guardar_producto(pg_temp.datos('{"publico": null}'), %s, gen_random_uuid())$q$, v_ver), 'PT422', 'Hombre, Dama o Unisex');
  perform pg_temp.exigir_rechazo('B3 editar con público vacío',
    format($q$select public.fn_admin_guardar_producto(pg_temp.datos('{"publico": ""}'), %s, gen_random_uuid())$q$, v_ver), 'PT422', 'Hombre, Dama o Unisex');
  perform pg_temp.exigir('B3 tras los rechazos sigue «unisex» con la misma versión', pg_temp.publico() = 'unisex' and pg_temp.version() = v_ver);

  -- B4 un cliente anterior que omite el campo conserva el público ya guardado.
  r := public.fn_admin_guardar_producto(pg_temp.datos('{"nombre": "Prueba 92 bis"}'), v_ver, gen_random_uuid());
  perform pg_temp.exigir('B4 sin el campo se conserva «unisex»', pg_temp.publico() = 'unisex' and pg_temp.version() = v_ver + 1, r::text);

  -- B5 cambiar entre los tres valores.
  r := public.fn_admin_guardar_producto(pg_temp.datos('{"publico": "dama"}'), pg_temp.version(), gen_random_uuid());
  perform pg_temp.exigir('B5 unisex → dama', pg_temp.publico() = 'dama', r::text);
  r := public.fn_admin_guardar_producto(pg_temp.datos('{"publico": "hombre"}'), pg_temp.version(), gen_random_uuid());
  perform pg_temp.exigir('B5 dama → hombre', pg_temp.publico() = 'hombre', r::text);
  r := public.fn_admin_guardar_producto(pg_temp.datos('{"publico": "unisex"}'), pg_temp.version(), gen_random_uuid());
  perform pg_temp.exigir('B5 hombre → unisex', pg_temp.publico() = 'unisex', r::text);
end;
$$;
reset role;

-- ============================================================= C. heredado sin clasificar
-- Un registro anterior a la etapa 17 (insertado sin pasar por el panel) queda sin público.
insert into public.productos (id, nombre, marca, categoria, activo)
values ('10000000-9292-0000-0000-00000000000b', 'Heredada 92', 'Marca 92', 'Urbanas', false);
insert into public.variantes (id, producto_id, color, precio) values ('20000000-9292-0000-0000-00000000000b', '10000000-9292-0000-0000-00000000000b', 'Gris', 90000);
insert into public.tallas (id, variante_id, talla) values ('30000000-9292-0000-0000-00000000000b', '20000000-9292-0000-0000-00000000000b', '41');
insert into public.fotos (variante_id, ruta) values ('20000000-9292-0000-0000-00000000000b', 'assets/images/productos/editadas/zapatilla_02.webp');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-9292-0000-0000-000000000001', true);
do $$
declare r jsonb; v_ver integer;
begin
  select version into v_ver from public.productos where id = '10000000-9292-0000-0000-00000000000b';
  perform pg_temp.exigir_rechazo('C1 publicar un heredado sin público se rechaza y lo dice',
    format($q$select public.fn_admin_estado_producto('10000000-9292-0000-0000-00000000000b', 'publicar', %s, gen_random_uuid())$q$, v_ver),
    'PT422', 'Para publicarla falta: el público en la tienda');
  perform pg_temp.exigir_rechazo('C2 guardarlo sin enviar público pide clasificarlo',
    format($q$select public.fn_admin_guardar_producto('{"id": "10000000-9292-0000-0000-00000000000b", "nombre": "Heredada 92", "marca": "Marca 92", "categoria": "Urbanas",
      "variantes": [{"id": "20000000-9292-0000-0000-00000000000b", "color": "Gris", "precio": 90000, "activa": true, "orden": 0,
                     "tallas": [{"id": "30000000-9292-0000-0000-00000000000b", "talla": "41", "activa": true, "activa_original": true}],
                     "fotos": [{"ruta": "assets/images/productos/editadas/zapatilla_02.webp"}]}]}'::jsonb, %s, gen_random_uuid())$q$, v_ver),
    'PT422', 'todavía no lo tiene');
  r := public.fn_admin_estado_producto('10000000-9292-0000-0000-00000000000b', 'retirar', v_ver, gen_random_uuid());
  perform pg_temp.exigir('C3 retirar o restaurar no exige el público', r ->> 'estado' = 'aplicada' and (r ->> 'retirado')::boolean, r::text);
  r := public.fn_admin_estado_producto('10000000-9292-0000-0000-00000000000b', 'restaurar', v_ver + 1, gen_random_uuid());
  perform pg_temp.exigir('C3 restaurado', r ->> 'estado' = 'aplicada' and not (r ->> 'retirado')::boolean, r::text);

  -- D. publicar con público: se publica (el completo se exige como antes).
  r := public.fn_admin_estado_producto('10000000-9292-0000-0000-00000000000a', 'publicar', pg_temp.version(), gen_random_uuid());
  perform pg_temp.exigir('D1 con público y completa, se publica', r ->> 'estado' = 'aplicada' and (r ->> 'activo')::boolean, r::text);
end;
$$;
reset role;

-- ============================================================= E. tienda
do $$
begin
  perform pg_temp.exigir('E1 la vista entrega «unisex» con el id inmutable (UUID de la fila)',
    exists (select 1 from public.catalogo_publico c where c.id = '10000000-9292-0000-0000-00000000000a' and c.publico = 'unisex'));
  update public.productos set activo = true where id = '10000000-9292-0000-0000-00000000000b';
  perform pg_temp.exigir('E2 un heredado publicado sin público sigue en la vista, con publico null',
    exists (select 1 from public.catalogo_publico c where c.id = '10000000-9292-0000-0000-00000000000b' and c.publico is null));
  perform pg_temp.exigir('E3 la vista conserva security_invoker',
    exists (select 1 from pg_class where oid = 'public.catalogo_publico'::regclass and reloptions @> array['security_invoker=true']));
end;
$$;

-- ============================================================= F. permisos
set local role anon;
do $$
begin
  perform pg_temp.exigir('F1 anon no ejecuta las funciones del panel',
    not has_function_privilege('public.fn_admin_guardar_producto(jsonb, integer, uuid)', 'EXECUTE')
    and not has_function_privilege('public.fn_admin_estado_producto(uuid, text, integer, uuid)', 'EXECUTE'));
end;
$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-9292-0000-0000-000000000002', true);
do $$
begin
  perform pg_temp.exigir_rechazo('F2 una cuenta que no es administradora no guarda',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('{"publico": "unisex", "id": "10000000-9292-0000-0000-00000000000c"}'), null, gen_random_uuid())$q$,
    '42501', 'administrador');
end;
$$;
reset role;

rollback;
