-- Etapa 16.2 · Códigos comerciales editables, identidad pública inmutable y mayúsculas.
-- Escriben datos y se deshacen al final, PERO el ROLLBACK no devuelve las secuencias:
-- ejecutar SOLO en un entorno local desechable, nunca en el proyecto remoto.
--
--   docker exec -i supabase_db_Yeny_Oficial psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/pruebas/90_codigos_editables.sql
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

-- Zapatilla de prueba con dos colores. p_prod y p_var* se mezclan en el producto y en cada color.
create or replace function pg_temp.datos(p_prod jsonb default '{}'::jsonb, p_var_a jsonb default '{}'::jsonb, p_var_b jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', '10000000-9090-0000-0000-00000000000a',
    'nombre', 'samba niño', 'marca', 'adidas', 'categoria', 'Urbanas', 'descripcion', 'Texto en minúsculas.',
    'publico', 'hombre',  -- etapa 17: el público es obligatorio al guardar
    'variantes', jsonb_build_array(
      jsonb_build_object('id', '20000000-9090-0000-0000-00000000000a', 'color', 'Beige/Blancas', 'precio', 120000, 'activa', true, 'orden', 0,
                         'referencia_variante', 'prov-a',
                         'tallas', jsonb_build_array(jsonb_build_object('id', '30000000-9090-0000-0000-00000000000a', 'talla', '40', 'activa', true, 'activa_original', true)),
                         'fotos', '[]'::jsonb) || p_var_a,
      jsonb_build_object('id', '20000000-9090-0000-0000-00000000000b', 'color', 'café añil', 'precio', 0, 'activa', true, 'orden', 1,
                         'tallas', '[]'::jsonb, 'fotos', '[]'::jsonb) || p_var_b)) || p_prod;
$$;
grant execute on all functions in schema pg_temp to public;

insert into public.administradores (user_id, nombre) values ('aaaaaaaa-9090-0000-0000-000000000001', 'admin de prueba 90');
-- Otra zapatilla con códigos personalizados, para los duplicados.
insert into public.productos (id, nombre, marca, codigo_interno, activo)
values ('10000000-9090-0000-0000-00000000000f', 'Ajena 90', 'Marca', 'AJENA-90', false);
insert into public.variantes (id, producto_id, codigo_variante, color)
values ('20000000-9090-0000-0000-00000000000f', '10000000-9090-0000-0000-00000000000f', 'AJENA-90-ROJO', 'Rojo');

-- ============================================================= A. visitante
set local role anon;
do $$
begin
  perform pg_temp.exigir('A anon lee clave_catalogo (la usa la vista)',
    has_column_privilege('public.productos', 'clave_catalogo', 'SELECT') and has_column_privilege('public.variantes', 'clave_catalogo', 'SELECT'));
  perform pg_temp.exigir('A anon no escribe códigos ni claves',
    not has_column_privilege('public.productos', 'codigo_interno', 'UPDATE') and not has_column_privilege('public.productos', 'clave_catalogo', 'UPDATE')
    and not has_column_privilege('public.variantes', 'codigo_variante', 'UPDATE'));
end;
$$;
reset role;

-- Lo que authenticated no puede leer (fechas internas de las tallas, la secuencia) se prepara y
-- se compara como propietario, entre bloques.
create temp table apoyo (clave text primary key, valor text);
grant all on apoyo to public;

-- ============================================================= B. administrador
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-9090-0000-0000-000000000001', true);
do $$
declare r jsonb; v_cod text; v_antes record; v_hist bigint;
begin
  -- B1 crear sin códigos (solicitud antigua) = automáticos; nombres en mayúsculas.
  r := public.fn_admin_guardar_producto(pg_temp.datos(), null, gen_random_uuid());
  perform pg_temp.exigir('B1 crear responde «aplicada» y anuncia códigos editables', r ->> 'estado' = 'aplicada' and (r ->> 'codigos_editables')::boolean, r::text);
  select codigo_interno into v_cod from public.productos where id = '10000000-9090-0000-0000-00000000000a';
  perform pg_temp.exigir('B1 código automático GT', v_cod ~ '^GT-[0-9]{5}$', v_cod);
  perform pg_temp.exigir('B1 colores con código automático derivado',
    (select string_agg(codigo_variante, ',' order by orden) from public.variantes where producto_id = '10000000-9090-0000-0000-00000000000a') = v_cod || '-A,' || v_cod || '-B');
  perform pg_temp.exigir('B1 modelo, marca, categoría y color en mayúsculas (tildes y Ñ); la descripción no',
    (select nombre = 'SAMBA NIÑO' and marca = 'ADIDAS' and categoria = 'URBANAS' and descripcion = 'Texto en minúsculas.' from public.productos where id = '10000000-9090-0000-0000-00000000000a')
    and (select string_agg(color, ',' order by orden) = 'BEIGE/BLANCAS,CAFÉ AÑIL' from public.variantes where producto_id = '10000000-9090-0000-0000-00000000000a')
    and (select referencia_variante = 'prov-a' from public.variantes where id = '20000000-9090-0000-0000-00000000000a'));
  perform pg_temp.exigir('B1 claves públicas = UUID de cada fila',
    (select clave_catalogo = id::text from public.productos where id = '10000000-9090-0000-0000-00000000000a')
    and (select bool_and(clave_catalogo = id::text) from public.variantes where producto_id = '10000000-9090-0000-0000-00000000000a'));

  -- B2 editar sin campos de código (cliente antiguo): los códigos no cambian.
  r := public.fn_admin_guardar_producto(pg_temp.datos('{"nombre": "Samba OG"}'), 1, gen_random_uuid());
  perform pg_temp.exigir('B2 sin campos de código, se conservan', r ->> 'codigo_interno' = v_cod and (r ->> 'version')::int = 2
    and (select codigo_variante = v_cod || '-A' from public.variantes where id = '20000000-9090-0000-0000-00000000000a'), r::text);

  -- B3 validación: vacío al editar, formato, longitud.
  perform pg_temp.exigir_rechazo('B3 el código de la zapatilla no puede quedar vacío al editar',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('{"codigo_interno": "  "}'), 2, gen_random_uuid())$q$, 'PT422', 'no puede quedar vacío');
  perform pg_temp.exigir_rechazo('B3 el código del color no puede quedar vacío al editar',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('{}', '{"codigo_variante": ""}'), 2, gen_random_uuid())$q$, 'PT422', 'no puede quedar vacío');
  perform pg_temp.exigir_rechazo('B3 código con espacios internos',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('{"codigo_interno": "GT 1"}'), 2, gen_random_uuid())$q$, 'PT422', 'entre 2 y 30');
  perform pg_temp.exigir_rechazo('B3 código demasiado largo (31)',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos(jsonb_build_object('codigo_interno', repeat('A', 31))), 2, gen_random_uuid())$q$, 'PT422', 'entre 2 y 30');
  perform pg_temp.exigir_rechazo('B3 código de color de un carácter',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('{}', '{"codigo_variante": "A"}'), 2, gen_random_uuid())$q$, 'PT422', 'entre 2 y 40');
  perform pg_temp.exigir('B3 los rechazos no cambiaron nada',
    (select version = 2 and codigo_interno = v_cod from public.productos where id = '10000000-9090-0000-0000-00000000000a'));

  -- B4 duplicados: con otra zapatilla, con otro color y dentro del formulario. Mayúsculas incluidas.
  perform pg_temp.exigir_rechazo('B4 código de zapatilla repetido (en minúsculas) dice quién lo usa',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('{"codigo_interno": " ajena-90 "}'), 2, gen_random_uuid())$q$, 'PT422', 'ya lo usa la zapatilla «AJENA 90»');
  perform pg_temp.exigir_rechazo('B4 código de color repetido en otra zapatilla',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('{}', '{"codigo_variante": "ajena-90-rojo"}'), 2, gen_random_uuid())$q$, 'PT422', 'ya lo usa «AJENA 90 · ROJO»');
  perform pg_temp.exigir_rechazo('B4 dos colores del formulario con el mismo código',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('{}', '{"codigo_variante": "MISMO-1"}', '{"codigo_variante": "mismo-1"}'), 2, gen_random_uuid())$q$, 'PT422', 'mismo código');
  perform pg_temp.exigir('B4 nada cambió tras los duplicados',
    (select version = 2 from public.productos where id = '10000000-9090-0000-0000-00000000000a')
    and not exists (select 1 from public.variantes where codigo_variante in ('MISMO-1', 'AJENA-90-ROJO') and producto_id = '10000000-9090-0000-0000-00000000000a'));

  -- B5 renombrar ambos: mayúsculas, sin espacios, sin prefijo GT; el del producto no arrastra los colores.
  select (select row(estado, vigencia_desde, vence_en, activa)::text from public.tallas where id = '30000000-9090-0000-0000-00000000000a') as talla,
         (select clave_catalogo from public.productos where id = '10000000-9090-0000-0000-00000000000a') as clave
    into v_antes;
  select max(id) into v_hist from public.historial;
  r := public.fn_admin_guardar_producto(pg_temp.datos('{"codigo_interno": " zap-ñu.01 "}', '{"codigo_variante": "col/beige-1"}'), 2, gen_random_uuid());
  perform pg_temp.exigir('B5 renombrado a ZAP-ÑU.01 y COL/BEIGE-1; el otro color conserva el suyo', r ->> 'codigo_interno' = 'ZAP-ÑU.01'
    and (select codigo_variante = 'COL/BEIGE-1' from public.variantes where id = '20000000-9090-0000-0000-00000000000a')
    and (select codigo_variante = v_cod || '-B' from public.variantes where id = '20000000-9090-0000-0000-00000000000b'), r::text);
  perform pg_temp.exigir('B5 la respuesta trae los códigos guardados de cada color',
    (select bool_or(e ->> 'codigo_variante' = 'COL/BEIGE-1') from jsonb_array_elements(r -> 'variantes') e));
  perform pg_temp.exigir('B5 la clave pública y la talla no cambian',
    (select clave_catalogo from public.productos where id = '10000000-9090-0000-0000-00000000000a') = v_antes.clave
    and (select row(estado, vigencia_desde, vence_en, activa)::text from public.tallas where id = '30000000-9090-0000-0000-00000000000a') = v_antes.talla);
  perform pg_temp.exigir('B5 el historial guarda los códigos anteriores',
    exists (select 1 from public.historial where id > v_hist and tabla = 'productos' and fila_anterior ->> 'codigo_interno' = v_cod and fila_nueva ->> 'codigo_interno' = 'ZAP-ÑU.01')
    and exists (select 1 from public.historial where id > v_hist and tabla = 'variantes' and fila_nueva ->> 'codigo_variante' = 'COL/BEIGE-1'));

  -- B6 un color nuevo usa el código ACTUAL de la zapatilla.
  r := public.fn_admin_guardar_producto(pg_temp.datos('{"codigo_interno": "ZAP-ÑU.01"}', '{"codigo_variante": "COL/BEIGE-1"}')
         || jsonb_build_object('variantes', (pg_temp.datos('{}', '{"codigo_variante": "COL/BEIGE-1"}') -> 'variantes')
              || jsonb_build_array(jsonb_build_object('id', '20000000-9090-0000-0000-00000000000c', 'color', 'verde', 'precio', 1, 'orden', 2, 'tallas', '[]'::jsonb, 'fotos', '[]'::jsonb))),
         3, gen_random_uuid());
  perform pg_temp.exigir('B6 el color nuevo toma el código actual + letra libre',
    (select codigo_variante from public.variantes where id = '20000000-9090-0000-0000-00000000000c') = 'ZAP-ÑU.01-C', r::text);

 end;
$$;
reset role;

-- Como propietario: fechas internas de la talla tras B5, y un código personalizado igual al
-- SIGUIENTE que daría la secuencia (sin consumirla).
do $$
declare v_sig text;
begin
  insert into apoyo select 'talla', row(confirmado_en, actualizado_en, registrado_en)::text from public.tallas where id = '30000000-9090-0000-0000-00000000000a';
  select 'GT-' || lpad((case when is_called then last_value + 1 else last_value end)::text, 5, '0') into v_sig from public.seq_codigo_producto;
  update public.productos set codigo_interno = v_sig where id = '10000000-9090-0000-0000-00000000000f';
  insert into apoyo values ('siguiente', v_sig);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-9090-0000-0000-000000000001', true);
do $$
declare r jsonb; v_ver integer; v_sig text := (select valor from apoyo where clave = 'siguiente');
begin
  -- B7 el generador evita colisiones con códigos personalizados que coinciden con los futuros.
  r := public.fn_admin_guardar_producto(pg_temp.datos() || '{"id": "10000000-9090-0000-0000-00000000000b", "variantes": []}', null, gen_random_uuid());
  perform pg_temp.exigir('B7 el código automático salta el que ya existe', r ->> 'codigo_interno' <> v_sig and r ->> 'codigo_interno' ~ '^GT-[0-9]{5}$', r::text);
  insert into public.variantes (id, producto_id, color) values ('20000000-9090-0000-0000-0000000000f2', '10000000-9090-0000-0000-00000000000f', 'azul');
  perform pg_temp.exigir('B7 el código de color automático tampoco choca',
    (select codigo_variante from public.variantes where id = '20000000-9090-0000-0000-0000000000f2') = v_sig || '-B');

  -- B8 crear con códigos propios; crear con un código ocupado se rechaza sin crear nada.
  r := public.fn_admin_guardar_producto(pg_temp.datos('{"id": "10000000-9090-0000-0000-00000000000c", "codigo_interno": "propio-90"}',
         '{"id": "20000000-9090-0000-0000-0000000000ca", "codigo_variante": "propio-90-x", "tallas": []}', '{"id": "20000000-9090-0000-0000-0000000000cb"}'), null, gen_random_uuid());
  perform pg_temp.exigir('B8 crear con códigos propios', r ->> 'codigo_interno' = 'PROPIO-90'
    and (select codigo_variante = 'PROPIO-90-X' from public.variantes where id = '20000000-9090-0000-0000-0000000000ca')
    and (select codigo_variante = 'PROPIO-90-B' from public.variantes where id = '20000000-9090-0000-0000-0000000000cb'), r::text);
  perform pg_temp.exigir_rechazo('B8 crear con un código ocupado',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('{"id": "10000000-9090-0000-0000-00000000000d", "codigo_interno": "propio-90"}', '{"id": "20000000-9090-0000-0000-0000000000da", "tallas": []}', '{"id": "20000000-9090-0000-0000-0000000000db"}'), null, gen_random_uuid())$q$,
    'PT422', 'ya lo usa la zapatilla');
  perform pg_temp.exigir('B8 el rechazo no creó la zapatilla', not exists (select 1 from public.productos where id = '10000000-9090-0000-0000-00000000000d'));

  -- B9 conflictos y operaciones repetidas siguen funcionando con códigos.
  select version into v_ver from public.productos where id = '10000000-9090-0000-0000-00000000000a';
  perform pg_temp.exigir_rechazo('B9 un formulario desactualizado no cambia el código',
    format($q$select public.fn_admin_guardar_producto(pg_temp.datos('{"codigo_interno": "OTRO-90"}'), %s, gen_random_uuid())$q$, v_ver - 1), 'PT409', 'Otra edición');
  r := public.fn_admin_guardar_producto(pg_temp.datos('{"codigo_interno": "ZAP-90-B9"}', '{"codigo_variante": "COL/BEIGE-1"}')
         || jsonb_build_object('variantes', (pg_temp.datos('{}', '{"codigo_variante": "COL/BEIGE-1"}') -> 'variantes')
              || jsonb_build_array(jsonb_build_object('id', '20000000-9090-0000-0000-00000000000c', 'color', 'verde', 'precio', 1, 'orden', 2, 'tallas', '[]'::jsonb, 'fotos', '[]'::jsonb))),
         v_ver, '40000000-9090-0000-0000-0000000000b9');
  perform pg_temp.exigir('B9 guardado con código nuevo', r ->> 'estado' = 'aplicada' and r ->> 'codigo_interno' = 'ZAP-90-B9', r::text);
  r := public.fn_admin_guardar_producto(pg_temp.datos('{"codigo_interno": "ZAP-90-B9"}'), v_ver, '40000000-9090-0000-0000-0000000000b9');
  perform pg_temp.exigir('B9 repetir la operación (respuesta perdida) no repite nada y devuelve el código guardado',
    r ->> 'estado' = 'ya_aplicada' and r ->> 'codigo_interno' = 'ZAP-90-B9' and (r ->> 'version')::int = v_ver + 1, r::text);

  -- B10 escrituras directas (sin el RPC) también se normalizan y no tocan la clave.
  update public.productos set marca = '  nike ', categoria = 'running' where id = '10000000-9090-0000-0000-00000000000f';
  perform pg_temp.exigir('B10 una escritura directa queda en mayúsculas',
    (select marca = 'NIKE' and categoria = 'RUNNING' from public.productos where id = '10000000-9090-0000-0000-00000000000f'));
  perform pg_temp.exigir_rechazo('B10 la clave pública no se puede cambiar',
    $q$update public.productos set clave_catalogo = 'X' where id = '10000000-9090-0000-0000-00000000000a'$q$, 'PT422', 'no se puede cambiar');
  perform pg_temp.exigir_rechazo('B10 un color no se puede mover de zapatilla',
    $q$update public.variantes set producto_id = '10000000-9090-0000-0000-00000000000f' where id = '20000000-9090-0000-0000-00000000000b'$q$, 'PT422', 'otra zapatilla');
end;
$$;
reset role;

-- ============================================================= C. tienda
do $$
begin
  perform pg_temp.exigir('C renombrar otra vez (B9) no movió las fechas internas de la talla',
    (select row(confirmado_en, actualizado_en, registrado_en)::text from public.tallas where id = '30000000-9090-0000-0000-00000000000a')
      = (select valor from apoyo where clave = 'talla'));
  update public.productos set activo = true where id = '10000000-9090-0000-0000-00000000000a';
  perform pg_temp.exigir('C la vista entrega la clave como id y los códigos actuales aparte',
    exists (select 1 from public.catalogo_publico c, jsonb_array_elements(c.variantes) v
             where c.id = '10000000-9090-0000-0000-00000000000a' and c."codigoInterno" = 'ZAP-90-B9'
               and v ->> 'id' = '20000000-9090-0000-0000-00000000000a' and v ->> 'codigoVariante' = 'COL/BEIGE-1'
               and v ->> 'referencia' = 'prov-a' and v ->> 'color' = 'BEIGE/BLANCAS'));
  perform pg_temp.exigir('C la vista conserva security_invoker',
    exists (select 1 from pg_class where oid = 'public.catalogo_publico'::regclass and reloptions @> array['security_invoker=true']));
end;
$$;

rollback;
