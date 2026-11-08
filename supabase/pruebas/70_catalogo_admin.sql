-- Etapa 16 · Catálogo desde el panel: guardar producto, colores, tallas y galería; publicar,
-- ocultar, retirar y restaurar; políticas de Storage para las fotos.
-- Escriben datos y se deshacen al final, PERO el ROLLBACK no devuelve las secuencias:
-- ejecutar SOLO en un entorno local desechable, nunca en el proyecto remoto.
--
-- El borrado de archivos de Storage no se prueba aquí: Storage no permite borrar sus filas por
-- SQL (y no debe hacerse). Se prueba por la API real en tests/etapa16 (solo local).

begin;

create or replace function pg_temp.exigir(p_prueba text, p_ok boolean, p_detalle text default '')
returns void language plpgsql as $$
begin
  if p_ok then raise notice 'OK     %', p_prueba;
  else raise exception 'FALLA  % %', p_prueba, p_detalle; end if;
end;
$$;

create or replace function pg_temp.exigir_denegado(p_prueba text, p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform pg_temp.exigir(p_prueba, false, '-> la consulta fue PERMITIDA');
exception
  when insufficient_privilege then perform pg_temp.exigir(p_prueba, true);
end;
$$;

-- Debe rechazarse con ESE código y un mensaje que cumpla el patrón.
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

-- Un producto de prueba con los ids fijos de esta batería. p_extra se mezcla en el primer color.
create or replace function pg_temp.datos(p_nombre text default 'PRUEBA 70', p_extra jsonb default '{}'::jsonb,
                                         p_tallas jsonb default null, p_fotos jsonb default '[]'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', '10000000-7777-0000-0000-00000000000a',
    'nombre', p_nombre, 'marca', 'Marca 70', 'categoria', 'Running', 'referencia_proveedor', 'REF-70',
    'variantes', jsonb_build_array(
      jsonb_build_object('id', '20000000-7777-0000-0000-00000000000a', 'color', 'Negro', 'precio', 250000,
                         'precio_anterior', 0, 'activa', true, 'orden', 0,
                         'tallas', coalesce(p_tallas, jsonb_build_array(
                           jsonb_build_object('id', '30000000-7777-0000-0000-00000000000a', 'talla', '40', 'activa', true, 'activa_original', true),
                           jsonb_build_object('id', '30000000-7777-0000-0000-00000000000b', 'talla', '40,5', 'activa', true, 'activa_original', true),
                           jsonb_build_object('id', '30000000-7777-0000-0000-00000000000c', 'talla', '41 1/3', 'activa', true, 'activa_original', true))),
                         'fotos', p_fotos) || p_extra,
      jsonb_build_object('id', '20000000-7777-0000-0000-00000000000b', 'color', 'Blanco', 'precio', 0,
                         'precio_anterior', 0, 'activa', true, 'orden', 1, 'tallas', '[]'::jsonb, 'fotos', '[]'::jsonb)));
$$;

grant execute on all functions in schema pg_temp to public;

insert into public.administradores (user_id, nombre) values ('aaaaaaaa-7777-0000-0000-000000000001', 'admin de prueba 70');
-- Otra zapatilla, con un color propio, para las comprobaciones de pertenencia.
insert into public.productos (id, nombre, marca, codigo_interno, activo)
values ('10000000-7777-0000-0000-00000000000f', 'AJENA 70', 'Marca', 'PR-70-AJENA', false);
insert into public.variantes (id, producto_id, codigo_variante, color)
values ('20000000-7777-0000-0000-00000000000f', '10000000-7777-0000-0000-00000000000f', 'PR-70-AJENA-A', 'Rojo');

-- ============================================================= A. visitante
set local role anon;
do $$
begin
  perform pg_temp.exigir_denegado('A anon no ejecuta fn_admin_guardar_producto',
    $q$select public.fn_admin_guardar_producto('{}'::jsonb, null, gen_random_uuid())$q$);
  perform pg_temp.exigir_denegado('A anon no ejecuta fn_admin_estado_producto',
    $q$select public.fn_admin_estado_producto(gen_random_uuid(), 'publicar', 1, gen_random_uuid())$q$);
  perform pg_temp.exigir_denegado('A anon no lee version, ultima_operacion ni retirado_en',
    'select version, ultima_operacion, retirado_en from public.productos');
end;
$$;
reset role;

-- ============================================================= B. sesión sin permiso
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-7777-0000-0000-000000000002', true);
do $$
begin
  perform pg_temp.exigir_rechazo('B una sesión sin permiso no guarda',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos(), null, gen_random_uuid())$q$, '42501', 'administrador');
  perform pg_temp.exigir_rechazo('B una sesión sin permiso no publica',
    $q$select public.fn_admin_estado_producto('10000000-7777-0000-0000-00000000000f', 'publicar', 1, gen_random_uuid())$q$, '42501', 'administrador');
  perform pg_temp.exigir('B la sesión sin permiso no creó nada',
    not exists (select 1 from public.productos where id = '10000000-7777-0000-0000-00000000000a'));
end;
$$;
reset role;

-- ============================================================= C. administrador
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-7777-0000-0000-000000000001', true);
do $$
declare
  r jsonb; v_op uuid := '40000000-7777-0000-0000-000000000001'; n integer; v_codigo text; v_cod_var text;
  v_antes record; v_despues record;
begin
  -- C1 crear: oculto, con códigos asignados y tallas por revisar.
  r := public.fn_admin_guardar_producto(pg_temp.datos(), null, v_op);
  perform pg_temp.exigir('C1 crear responde «aplicada» con versión 1', r ->> 'estado' = 'aplicada' and (r ->> 'version')::int = 1, r::text);
  select codigo_interno into v_codigo from public.productos where id = '10000000-7777-0000-0000-00000000000a';
  perform pg_temp.exigir('C1 código interno asignado por el disparador', v_codigo ~ '^GT-[0-9]{5}$', v_codigo);
  perform pg_temp.exigir('C1 se crea OCULTO', not (select activo from public.productos where id = '10000000-7777-0000-0000-00000000000a'));
  select string_agg(codigo_variante, ',' order by orden) into v_cod_var from public.variantes where producto_id = '10000000-7777-0000-0000-00000000000a';
  perform pg_temp.exigir('C1 códigos de color derivados del producto', v_cod_var = v_codigo || '-A,' || v_codigo || '-B', v_cod_var);
  perform pg_temp.exigir('C1 las tallas nuevas nacen por revisar, sin fechas, origen manual',
    (select bool_and(estado = 'REVISAR' and vigencia_desde is null and vence_en is null)
       from public.tallas where variante_id = '20000000-7777-0000-0000-00000000000a')
    and (select count(*) = 3 from public.tallas where variante_id = '20000000-7777-0000-0000-00000000000a'));
  perform pg_temp.exigir('C1 el precio 0 se guarda como «por confirmar»',
    (select precio = 0 from public.variantes where id = '20000000-7777-0000-0000-00000000000b'));
  perform pg_temp.exigir('C1 el historial agrupa el guardado en un lote, con autor',
    (select count(*) >= 6 and bool_and(lote = v_op and autor = 'aaaaaaaa-7777-0000-0000-000000000001')
       from public.historial where lote = v_op));

  -- C2 la misma operación otra vez (respuesta perdida o doble clic): no duplica nada.
  r := public.fn_admin_guardar_producto(pg_temp.datos(), null, v_op);
  perform pg_temp.exigir('C2 repetir la operación responde «ya_aplicada»', r ->> 'estado' = 'ya_aplicada', r::text);
  perform pg_temp.exigir('C2 sin duplicados', (select count(*) = 2 from public.variantes where producto_id = '10000000-7777-0000-0000-00000000000a')
    and (select count(*) = 1 from public.productos where id = '10000000-7777-0000-0000-00000000000a'));

  -- C3 crear otra vez con el mismo id y otra operación: conflicto, nada se toca.
  perform pg_temp.exigir_rechazo('C3 crear con un id existente es un conflicto',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos(), null, gen_random_uuid())$q$, 'PT409', 'Ya existe');

  -- C4 editar: cambia datos y precios, conserva identificadores y códigos.
  r := public.fn_admin_guardar_producto(pg_temp.datos('PRUEBA 70 EDITADA', '{"precio": 230000, "precio_anterior": 260000}'), 1, gen_random_uuid());
  perform pg_temp.exigir('C4 editar sube la versión a 2', (r ->> 'version')::int = 2, r::text);
  perform pg_temp.exigir('C4 nombre y precios nuevos, mismos códigos',
    (select nombre = 'PRUEBA 70 EDITADA' and codigo_interno = v_codigo from public.productos where id = '10000000-7777-0000-0000-00000000000a')
    and (select precio = 230000 and precio_anterior = 260000 and codigo_variante = v_codigo || '-A' from public.variantes where id = '20000000-7777-0000-0000-00000000000a'));

  -- C5 formulario desactualizado.
  perform pg_temp.exigir_rechazo('C5 guardar con una versión anterior es un conflicto',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('OTRA'), 1, gen_random_uuid())$q$, 'PT409', 'Otra edición');
  perform pg_temp.exigir('C5 el conflicto no cambió nada',
    (select nombre = 'PRUEBA 70 EDITADA' and version = 2 from public.productos where id = '10000000-7777-0000-0000-00000000000a'));

  -- C6 un formulario sin un color existente.
  perform pg_temp.exigir_rechazo('C6 omitir un color existente es un conflicto',
    $q$select public.fn_admin_guardar_producto(jsonb_set(pg_temp.datos(), '{variantes}', pg_temp.datos() -> 'variantes' -> 0 || '[]'::jsonb), 2, gen_random_uuid())$q$,
    'PT409', 'todos los colores');
  -- … ni sin una talla existente.
  perform pg_temp.exigir_rechazo('C6 omitir una talla existente es un conflicto',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('X', '{}', '[{"id":"30000000-7777-0000-0000-00000000000a","talla":"40","activa":true}]'), 2, gen_random_uuid())$q$,
    'PT409', 'todas las tallas');

  -- C7 tallas: equivalentes, renombrar, formato.
  perform pg_temp.exigir_rechazo('C7 «40.5» equivale a «40,5», que ya existe',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('X', '{}', (pg_temp.datos() -> 'variantes' -> 0 -> 'tallas') || '[{"id":"30000000-7777-0000-0000-00000000000d","talla":"40.5","activa":true}]'), 2, gen_random_uuid())$q$,
    'PT422', 'equivale a la talla 40,5');
  perform pg_temp.exigir_rechazo('C7 «41 2/6» equivale a «41 1/3»',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('X', '{}', (pg_temp.datos() -> 'variantes' -> 0 -> 'tallas') || '[{"id":"30000000-7777-0000-0000-00000000000d","talla":"41 2/6","activa":true}]'), 2, gen_random_uuid())$q$,
    'PT422', 'equivale');
  perform pg_temp.exigir_rechazo('C7 una talla existente no se renombra',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('X', '{}', '[{"id":"30000000-7777-0000-0000-00000000000a","talla":"39","activa":true},{"id":"30000000-7777-0000-0000-00000000000b","talla":"40,5","activa":true},{"id":"30000000-7777-0000-0000-00000000000c","talla":"41 1/3","activa":true}]'), 2, gen_random_uuid())$q$,
    'PT422', 'no se puede renombrar');
  perform pg_temp.exigir_rechazo('C7 formato no válido',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('X', '{}', (pg_temp.datos() -> 'variantes' -> 0 -> 'tallas') || '[{"id":"30000000-7777-0000-0000-00000000000d","talla":"40½","activa":true}]'), 2, gen_random_uuid())$q$,
    'PT422', 'formato válido');
  perform pg_temp.exigir('C7 los rechazos no añadieron tallas',
    (select count(*) = 3 from public.tallas where variante_id = '20000000-7777-0000-0000-00000000000a'));

  -- C8 precios comerciales.
  perform pg_temp.exigir_rechazo('C8 precio anterior menor o igual que el actual',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('X', '{"precio": 230000, "precio_anterior": 230000}'), 2, gen_random_uuid())$q$, 'PT422', 'precio anterior');
  perform pg_temp.exigir_rechazo('C8 precio por confirmar con precio anterior',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('X', '{"precio": 0, "precio_anterior": 100000}'), 2, gen_random_uuid())$q$, 'PT422', 'precio anterior');
  perform pg_temp.exigir_rechazo('C8 precio negativo',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('X', '{"precio": -1}'), 2, gen_random_uuid())$q$, 'PT422', 'entre 0');
  perform pg_temp.exigir_rechazo('C8 nombre vacío',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('   '), 2, gen_random_uuid())$q$, 'PT422', 'nombre del modelo');

  -- C9 pertenencia: un color o una talla de otra zapatilla.
  perform pg_temp.exigir_rechazo('C9 un color de otra zapatilla',
    $q$select public.fn_admin_guardar_producto(jsonb_set(pg_temp.datos(), '{variantes}', (pg_temp.datos() -> 'variantes') || '[{"id":"20000000-7777-0000-0000-00000000000f","color":"Rojo","precio":0,"tallas":[],"fotos":[]}]'), 2, gen_random_uuid())$q$,
    'PT422', 'otra zapatilla');

  -- C10 desactivar una talla CONFIRMADA no toca su estado ni su vigencia.
  reset role;
  update public.tallas set estado = 'CONFIRMADA', vigencia_desde = now() - interval '1 hour', origen = 'proveedor'
   where id = '30000000-7777-0000-0000-00000000000a';
  -- now() no avanza dentro de la transacción: para saber si una fila se reescribió se mira su
  -- versión física (ctid), que cambia con cualquier UPDATE aunque escriba los mismos valores.
  select ctid::text into v_cod_var from public.tallas where id = '30000000-7777-0000-0000-00000000000b';
  set local role authenticated;
  select estado, vigencia_desde, vence_en, actualizado_en into v_antes from public.fn_admin_tallas() where id = '30000000-7777-0000-0000-00000000000a';
  r := public.fn_admin_guardar_producto(pg_temp.datos('PRUEBA 70 EDITADA', '{"precio": 230000, "precio_anterior": 260000}',
         '[{"id":"30000000-7777-0000-0000-00000000000a","talla":"40","activa":false,"activa_original":true},{"id":"30000000-7777-0000-0000-00000000000b","talla":"40,5","activa":true,"activa_original":true},{"id":"30000000-7777-0000-0000-00000000000c","talla":"41 1/3","activa":true,"activa_original":true}]'),
         2, gen_random_uuid());
  select estado, vigencia_desde, vence_en, activa into v_despues from public.fn_admin_tallas() where id = '30000000-7777-0000-0000-00000000000a';
  perform pg_temp.exigir('C10 la talla queda inactiva con el mismo estado y la misma vigencia',
    not v_despues.activa and v_despues.estado = v_antes.estado and v_despues.vigencia_desde = v_antes.vigencia_desde
    and v_despues.vence_en = v_antes.vence_en, format('%s / %s', v_antes, v_despues));
  reset role;
  perform pg_temp.exigir('C10 las tallas que no cambian no se reescriben (su marca de 15B sigue igual)',
    (select ctid::text from public.tallas where id = '30000000-7777-0000-0000-00000000000b') = v_cod_var);
  set local role authenticated;
  perform pg_temp.exigir('C10 nada se borró', (select count(*) = 3 from public.tallas where variante_id = '20000000-7777-0000-0000-00000000000a'));

  -- C11 la misma talla, reactivada: la misma fila.
  r := public.fn_admin_guardar_producto(pg_temp.datos('PRUEBA 70 EDITADA', '{"precio": 230000, "precio_anterior": 260000}',
         '[{"id":"30000000-7777-0000-0000-00000000000a","talla":"40","activa":true,"activa_original":false},{"id":"30000000-7777-0000-0000-00000000000b","talla":"40,5","activa":true,"activa_original":true},{"id":"30000000-7777-0000-0000-00000000000c","talla":"41 1/3","activa":true,"activa_original":true}]'),
         3, gen_random_uuid());
  perform pg_temp.exigir('C11 reactivar usa la misma fila',
    (select activa from public.tallas where id = '30000000-7777-0000-0000-00000000000a')
    and (select count(*) = 3 from public.tallas where variante_id = '20000000-7777-0000-0000-00000000000a'));

  -- C12 desactivar un color: sigue existiendo, con sus tallas.
  r := public.fn_admin_guardar_producto(jsonb_set(pg_temp.datos('PRUEBA 70 EDITADA', '{"precio": 230000, "precio_anterior": 260000}'),
         '{variantes,1,activa}', 'false'), 4, gen_random_uuid());
  perform pg_temp.exigir('C12 el color desactivado se conserva',
    (select not activa from public.variantes where id = '20000000-7777-0000-0000-00000000000b'));
end;
$$;

-- ============================================================= D. fotos y Storage
do $$
declare r jsonb; v_url text; v_ajena text; n integer;
begin
  v_url := 'http://127.0.0.1:54321/storage/v1/object/public/fotos-catalogo/productos/10000000-7777-0000-0000-00000000000a/20000000-7777-0000-0000-00000000000a/1700000000000-abcdefghij.webp';
  perform pg_temp.exigir_rechazo('D1 una foto que no está en Storage no se guarda',
    format($q$select public.fn_admin_guardar_producto(pg_temp.datos('PRUEBA 70 EDITADA', '{"precio": 230000, "precio_anterior": 260000}', null, '[{"ruta": %s}]'), 5, gen_random_uuid())$q$, to_jsonb(v_url)),
    'PT422', 'no terminó de subirse');
  perform pg_temp.exigir_rechazo('D1 una ruta que no es del bucket',
    $q$select public.fn_admin_guardar_producto(pg_temp.datos('PRUEBA 70 EDITADA', '{"precio": 230000, "precio_anterior": 260000}', null, '[{"ruta": "https://otro.sitio/foto.webp"}]'), 5, gen_random_uuid())$q$,
    'PT422', 'no es un archivo subido');
  v_ajena := replace(v_url, '10000000-7777-0000-0000-00000000000a', '10000000-7777-0000-0000-00000000000f');
  perform pg_temp.exigir_rechazo('D1 un archivo de otra zapatilla',
    format($q$select public.fn_admin_guardar_producto(pg_temp.datos('PRUEBA 70 EDITADA', '{"precio": 230000, "precio_anterior": 260000}', null, '[{"ruta": %s}]'), 5, gen_random_uuid())$q$, to_jsonb(v_ajena)),
    'PT422', 'no es un archivo subido');

  -- Políticas de subida (la fila; el contenido lo maneja la API de Storage).
  perform pg_temp.exigir_rechazo('D2 nombre fuera del formato del panel',
    $q$insert into storage.objects (bucket_id, name) values ('fotos-catalogo', 'otra/carpeta/foto.webp')$q$, '42501', 'row-level security');
  perform pg_temp.exigir_rechazo('D2 otra extensión',
    $q$insert into storage.objects (bucket_id, name) values ('fotos-catalogo', 'productos/10000000-7777-0000-0000-00000000000a/20000000-7777-0000-0000-00000000000a/1700000000000-abcdefghij.png')$q$, '42501', 'row-level security');
  insert into storage.objects (bucket_id, name)
  values ('fotos-catalogo', 'productos/10000000-7777-0000-0000-00000000000a/20000000-7777-0000-0000-00000000000a/1700000000000-abcdefghij.webp'),
         ('fotos-catalogo', 'productos/10000000-7777-0000-0000-00000000000a/20000000-7777-0000-0000-00000000000a/1700000000001-bcdefghijk.webp');
  perform pg_temp.exigir('D2 el administrador sube con el nombre del panel y lo ve',
    (select count(*) = 2 from storage.objects where bucket_id = 'fotos-catalogo' and name like 'productos/10000000-7777-%'));
  with cambiadas as (update storage.objects set metadata = '{}' where bucket_id = 'fotos-catalogo' returning 1)
  select count(*) into n from cambiadas;
  perform pg_temp.exigir('D2 no se sobrescribe: sin política UPDATE, ninguna fila cambia', n = 0, n::text);

  -- D3 galería: guardar, ordenar, principal, quitar. El formulario conserva el color Blanco
  -- desactivado en C12 (un formulario real envía su estado actual).
  r := public.fn_admin_guardar_producto(jsonb_set(pg_temp.datos('PRUEBA 70 EDITADA', '{"precio": 230000, "precio_anterior": 260000}', null,
         jsonb_build_array(jsonb_build_object('ruta', replace(v_url, '1700000000000-abcdefghij', '1700000000001-bcdefghijk'), 'alt', 'Lateral'),
                           jsonb_build_object('ruta', v_url, 'alt', 'Frente'))), '{variantes,1,activa}', 'false'), 5, gen_random_uuid());
  perform pg_temp.exigir('D3 la galería se guarda en el orden del formulario (la primera es la principal)',
    (select array_agg(alt order by orden) = array['Lateral', 'Frente'] from public.fotos where variante_id = '20000000-7777-0000-0000-00000000000a'), r::text);
  r := public.fn_admin_guardar_producto(jsonb_set(pg_temp.datos('PRUEBA 70 EDITADA', '{"precio": 230000, "precio_anterior": 260000}', null,
         jsonb_build_array(jsonb_build_object('ruta', v_url, 'alt', 'Frente'))), '{variantes,1,activa}', 'false'), 6, gen_random_uuid());
  perform pg_temp.exigir('D3 quitar de la galería borra la fila, no el archivo',
    (select count(*) = 1 from public.fotos where variante_id = '20000000-7777-0000-0000-00000000000a')
    and (select count(*) = 2 from storage.objects where bucket_id = 'fotos-catalogo' and name like 'productos/10000000-7777-%'));
  perform pg_temp.exigir('D3 el color desactivado sigue desactivado',
    (select not activa from public.variantes where id = '20000000-7777-0000-0000-00000000000b'));
end;
$$;
reset role;

-- Una sesión sin permiso no sube.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-7777-0000-0000-000000000002', true);
do $$
begin
  perform pg_temp.exigir_rechazo('D4 una sesión sin permiso no sube',
    $q$insert into storage.objects (bucket_id, name) values ('fotos-catalogo', 'productos/10000000-7777-0000-0000-00000000000a/20000000-7777-0000-0000-00000000000a/1700000000002-cdefghijkl.webp')$q$,
    '42501', 'row-level security');
  perform pg_temp.exigir('D4 ni ve los archivos', not exists (select 1 from storage.objects where bucket_id = 'fotos-catalogo'));
end;
$$;
reset role;
set local role anon;
do $$
begin
  perform pg_temp.exigir_rechazo('D4 el visitante no sube',
    $q$insert into storage.objects (bucket_id, name) values ('fotos-catalogo', 'productos/10000000-7777-0000-0000-00000000000a/20000000-7777-0000-0000-00000000000a/1700000000003-defghijklm.webp')$q$,
    '42501', 'row-level security');
end;
$$;
reset role;

-- ============================================================= E. publicar, ocultar, retirar
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-7777-0000-0000-000000000001', true);
do $$
declare r jsonb; v_op uuid := '50000000-7777-0000-0000-000000000001'; v_antes text; v_despues text;
begin
  select string_agg(id || estado::text || coalesce(vigencia_desde::text, '-') || coalesce(vence_en::text, '-'), ',' order by id)
    into v_antes from public.fn_admin_tallas() t
   where variante_id in ('20000000-7777-0000-0000-00000000000a', '20000000-7777-0000-0000-00000000000b');

  -- E1 versión desactualizada.
  perform pg_temp.exigir_rechazo('E1 publicar con una versión anterior es un conflicto',
    $q$select public.fn_admin_estado_producto('10000000-7777-0000-0000-00000000000a', 'publicar', 1, gen_random_uuid())$q$, 'PT409', 'Otra edición');

  -- E2 publicar uno completo (un color visible con foto y talla activa).
  r := public.fn_admin_estado_producto('10000000-7777-0000-0000-00000000000a', 'publicar', 7, v_op);
  perform pg_temp.exigir('E2 publicado', r ->> 'estado' = 'aplicada' and (select activo from public.productos where id = '10000000-7777-0000-0000-00000000000a'), r::text);
  r := public.fn_admin_estado_producto('10000000-7777-0000-0000-00000000000a', 'publicar', 7, v_op);
  perform pg_temp.exigir('E2 repetir la operación no hace nada dos veces', r ->> 'estado' = 'ya_aplicada', r::text);
  select string_agg(id || estado::text || coalesce(vigencia_desde::text, '-') || coalesce(vence_en::text, '-'), ',' order by id)
    into v_despues from public.fn_admin_tallas() t
   where variante_id in ('20000000-7777-0000-0000-00000000000a', '20000000-7777-0000-0000-00000000000b');
  perform pg_temp.exigir('E2 publicar no confirma ni renueva ninguna talla', v_antes = v_despues);

  -- E3 ocultar, retirar, no publicar retirado, restaurar (queda oculto).
  r := public.fn_admin_estado_producto('10000000-7777-0000-0000-00000000000a', 'ocultar', 8, gen_random_uuid());
  perform pg_temp.exigir('E3 ocultar', not (select activo from public.productos where id = '10000000-7777-0000-0000-00000000000a'));
  r := public.fn_admin_estado_producto('10000000-7777-0000-0000-00000000000a', 'retirar', 9, gen_random_uuid());
  perform pg_temp.exigir('E3 retirar deja la fecha y lo oculta',
    (select retirado_en is not null and not activo from public.productos where id = '10000000-7777-0000-0000-00000000000a'));
  perform pg_temp.exigir_rechazo('E3 un retirado no se publica',
    $q$select public.fn_admin_estado_producto('10000000-7777-0000-0000-00000000000a', 'publicar', 10, gen_random_uuid())$q$, 'PT422', 'retirada');
  r := public.fn_admin_estado_producto('10000000-7777-0000-0000-00000000000a', 'restaurar', 10, gen_random_uuid());
  perform pg_temp.exigir('E3 restaurar lo deja oculto y sin fecha de retiro',
    (select retirado_en is null and not activo from public.productos where id = '10000000-7777-0000-0000-00000000000a'));
  perform pg_temp.exigir('E3 retirar conserva colores, tallas y fotos',
    (select count(*) = 2 from public.variantes where producto_id = '10000000-7777-0000-0000-00000000000a')
    and (select count(*) = 3 from public.tallas where variante_id = '20000000-7777-0000-0000-00000000000a')
    and (select count(*) = 1 from public.fotos where variante_id = '20000000-7777-0000-0000-00000000000a'));

  -- E4 incompleto: sin foto en un color visible.
  perform pg_temp.exigir_rechazo('E4 sin foto no se publica',
    $q$select public.fn_admin_estado_producto('10000000-7777-0000-0000-00000000000f', 'publicar', 1, gen_random_uuid())$q$, 'PT422', 'falta');
  perform pg_temp.exigir_rechazo('E4 acción desconocida',
    $q$select public.fn_admin_estado_producto('10000000-7777-0000-0000-00000000000a', 'borrar', 11, gen_random_uuid())$q$, 'PT422', 'no es válida');
  perform pg_temp.exigir_rechazo('E4 producto inexistente',
    $q$select public.fn_admin_estado_producto(gen_random_uuid(), 'publicar', 1, gen_random_uuid())$q$, 'PT404', 'no existe');
end;
$$;
reset role;

-- ============================================================= F. la vista pública
set local role anon;
do $$
begin
  perform pg_temp.exigir('F el producto oculto no aparece en catalogo_publico',
    not exists (select 1 from public.catalogo_publico where nombre like 'PRUEBA 70%'));
end;
$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-7777-0000-0000-000000000001', true);
select public.fn_admin_estado_producto('10000000-7777-0000-0000-00000000000a', 'publicar', 11, gen_random_uuid());
reset role;
set local role anon;
do $$
declare v jsonb;
begin
  select variantes into v from public.catalogo_publico where nombre = 'PRUEBA 70 EDITADA';
  perform pg_temp.exigir('F publicado: aparece con su color visible y sin el desactivado', jsonb_array_length(v) = 1, coalesce(v::text, 'no aparece'));
  perform pg_temp.exigir('F con su foto de Storage', v -> 0 -> 'imagenes' ->> 0 like '%/storage/v1/object/public/fotos-catalogo/%');
  -- La 40 se confirmó en C10 y sigue vigente; las otras dos nacieron por revisar y siguen así:
  -- guardar, desactivar, reactivar y publicar no cambiaron ninguna disponibilidad.
  perform pg_temp.exigir('F sus tallas activas, cada una con su estado: nada se confirmó ni se renovó',
    (select array_agg(t ->> 'estado') = array['DISPONIBLE', 'POR_REVISAR', 'POR_REVISAR']
       from jsonb_array_elements(v -> 0 -> 'tallas') t), (v -> 0 -> 'tallas')::text);
end;
$$;
reset role;

-- ============================================================= G. publicar exige UN MISMO color completo
-- Color A visible con foto y sin tallas; color B visible con talla y sin foto; color C con foto y
-- talla pero oculto. Ningún color visible está completo: no se publica.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-7777-0000-0000-000000000001', true);
do $$
declare
  r jsonb;
  v_base text := 'http://127.0.0.1:54321/storage/v1/object/public/fotos-catalogo/';
  v_a text := 'productos/10000000-7777-0000-0000-00000000000b/20000000-7777-0000-0000-00000000000c/1700000000010-gggggggga1.webp';
  v_b text := 'productos/10000000-7777-0000-0000-00000000000b/20000000-7777-0000-0000-00000000000d/1700000000011-gggggggga2.webp';
  v_c text := 'productos/10000000-7777-0000-0000-00000000000b/20000000-7777-0000-0000-00000000000e/1700000000012-gggggggga3.webp';
  v_datos jsonb;
begin
  insert into storage.objects (bucket_id, name) values ('fotos-catalogo', v_a), ('fotos-catalogo', v_b), ('fotos-catalogo', v_c);
  v_datos := jsonb_build_object('id', '10000000-7777-0000-0000-00000000000b', 'nombre', 'PRUEBA 70 COLORES', 'marca', 'Marca 70', 'categoria', 'Running',
    'variantes', jsonb_build_array(
      jsonb_build_object('id', '20000000-7777-0000-0000-00000000000c', 'color', 'A con foto', 'precio', 1000, 'activa', true, 'orden', 0,
                         'tallas', '[]'::jsonb, 'fotos', jsonb_build_array(jsonb_build_object('ruta', v_base || v_a))),
      jsonb_build_object('id', '20000000-7777-0000-0000-00000000000d', 'color', 'B con talla', 'precio', 1000, 'activa', true, 'orden', 1,
                         'tallas', '[{"id":"30000000-7777-0000-0000-0000000000b1","talla":"40","activa":true}]'::jsonb, 'fotos', '[]'::jsonb),
      jsonb_build_object('id', '20000000-7777-0000-0000-00000000000e', 'color', 'C oculto completo', 'precio', 1000, 'activa', false, 'orden', 2,
                         'tallas', '[{"id":"30000000-7777-0000-0000-0000000000c1","talla":"41","activa":true}]'::jsonb,
                         'fotos', jsonb_build_array(jsonb_build_object('ruta', v_base || v_c)))));
  r := public.fn_admin_guardar_producto(v_datos, null, gen_random_uuid());
  perform pg_temp.exigir('G se guarda (oculto) con la foto y la talla en colores distintos', r ->> 'estado' = 'aplicada', r::text);
  perform pg_temp.exigir_rechazo('G foto en A y talla en B: no se publica',
    $q$select public.fn_admin_estado_producto('10000000-7777-0000-0000-00000000000b', 'publicar', 1, gen_random_uuid())$q$,
    'PT422', 'un mismo color visible');
  perform pg_temp.exigir('G sigue oculto', not (select activo from public.productos where id = '10000000-7777-0000-0000-00000000000b'));
  perform pg_temp.exigir('G el color oculto completo (C) no cuenta', (select not activa from public.variantes where id = '20000000-7777-0000-0000-00000000000e'));

  -- Se completa B (foto): ahora un mismo color visible tiene foto y talla activa.
  v_datos := jsonb_set(v_datos, '{variantes,1,fotos}', jsonb_build_array(jsonb_build_object('ruta', v_base || v_b)));
  v_datos := jsonb_set(v_datos, '{variantes,1,tallas}', '[{"id":"30000000-7777-0000-0000-0000000000b1","talla":"40","activa":true,"activa_original":true}]'::jsonb);
  v_datos := jsonb_set(v_datos, '{variantes,2,tallas}', '[{"id":"30000000-7777-0000-0000-0000000000c1","talla":"41","activa":true,"activa_original":true}]'::jsonb);
  r := public.fn_admin_guardar_producto(v_datos, 1, gen_random_uuid());
  perform pg_temp.exigir('G se completa el color B', (r ->> 'version')::int = 2, r::text);
  r := public.fn_admin_estado_producto('10000000-7777-0000-0000-00000000000b', 'publicar', 2, gen_random_uuid());
  perform pg_temp.exigir('G con un mismo color completo, se publica', r ->> 'estado' = 'aplicada' and (r ->> 'activo')::boolean, r::text);

  -- Mensajes de lo que falta, cada caso por separado.
  r := public.fn_admin_estado_producto('10000000-7777-0000-0000-00000000000b', 'ocultar', 3, gen_random_uuid());
  v_datos := jsonb_set(v_datos, '{variantes,1,tallas}', '[{"id":"30000000-7777-0000-0000-0000000000b1","talla":"40","activa":false,"activa_original":true}]'::jsonb);
  v_datos := jsonb_set(v_datos, '{variantes,2,tallas}', '[{"id":"30000000-7777-0000-0000-0000000000c1","talla":"41","activa":true,"activa_original":true}]'::jsonb);
  r := public.fn_admin_guardar_producto(v_datos, 4, gen_random_uuid());
  perform pg_temp.exigir_rechazo('G sin ninguna talla activa en un color visible: lo dice',
    $q$select public.fn_admin_estado_producto('10000000-7777-0000-0000-00000000000b', 'publicar', 5, gen_random_uuid())$q$,
    'PT422', 'una talla activa en un color visible');
end;
$$;
reset role;

-- ============================================================= H. una edición antigua no deshace lo que hizo 15B
-- El formulario envía, por talla, el valor de activación que tenía al abrirse. El servidor solo
-- aplica lo que la persona cambió: si la talla cambió en otro lugar (una confirmación de 15B la
-- reactivó) y el formulario la dejó como estaba, se conserva el valor del servidor.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-7777-0000-0000-000000000001', true);
do $$
declare
  r jsonb; v int; v_antes record; v_despues record; v_ctid text;
  v_tallas_viejas jsonb := '[{"id":"30000000-7777-0000-0000-00000000000a","talla":"40","activa":true,"activa_original":true},{"id":"30000000-7777-0000-0000-00000000000b","talla":"40,5","activa":false,"activa_original":false},{"id":"30000000-7777-0000-0000-00000000000c","talla":"41 1/3","activa":true,"activa_original":true}]';
begin
  select version into v from public.productos where id = '10000000-7777-0000-0000-00000000000a';
  -- 1) La 40,5 se desactiva desde el editor (el usuario sí lo cambió).
  r := public.fn_admin_guardar_producto(jsonb_set(pg_temp.datos('PRUEBA 70 EDITADA', '{"precio": 230000, "precio_anterior": 260000}',
         '[{"id":"30000000-7777-0000-0000-00000000000a","talla":"40","activa":true,"activa_original":true},{"id":"30000000-7777-0000-0000-00000000000b","talla":"40,5","activa":false,"activa_original":true},{"id":"30000000-7777-0000-0000-00000000000c","talla":"41 1/3","activa":true,"activa_original":true}]'),
         '{variantes,1,activa}', 'false'), v, gen_random_uuid());
  perform pg_temp.exigir('H el cambio hecho por la persona se aplica', not (select activa from public.tallas where id = '30000000-7777-0000-0000-00000000000b'), r::text);
  v := (r ->> 'version')::int;
  -- 2) En otra pestaña, «Confirmó el proveedor» la reactiva (sin tocar productos.version).
  perform public.fn_confirmar_por_proveedor('30000000-7777-0000-0000-00000000000b', 48::smallint);
  select activa, estado, vigencia_desde, vence_en, confirmado_en, publicado_en, origen into v_antes
    from public.fn_admin_tallas() where id = '30000000-7777-0000-0000-00000000000b';
  perform pg_temp.exigir('H 15B la reactivó y la confirmó', v_antes.activa and v_antes.estado = 'CONFIRMADA');
  reset role;
  select ctid::text into v_ctid from public.tallas where id = '30000000-7777-0000-0000-00000000000b';
  set local role authenticated;
  -- 3) El editor antiguo (abierto con la 40,5 desactivada) solo cambia el precio y guarda.
  r := public.fn_admin_guardar_producto(jsonb_set(pg_temp.datos('PRUEBA 70 EDITADA', '{"precio": 199000, "precio_anterior": 260000}', v_tallas_viejas),
         '{variantes,1,activa}', 'false'), v, gen_random_uuid());
  perform pg_temp.exigir('H el guardado se aplica (precio nuevo)', r ->> 'estado' = 'aplicada'
    and (select precio = 199000 from public.variantes where id = '20000000-7777-0000-0000-00000000000a'), r::text);
  select activa, estado, vigencia_desde, vence_en, confirmado_en, publicado_en, origen into v_despues
    from public.fn_admin_tallas() where id = '30000000-7777-0000-0000-00000000000b';
  perform pg_temp.exigir('H la reactivación de 15B se conserva', v_despues.activa, format('%s', v_despues));
  perform pg_temp.exigir('H ni el estado ni las fechas de confirmación y vigencia cambian',
    v_despues.estado = v_antes.estado and v_despues.vigencia_desde = v_antes.vigencia_desde and v_despues.vence_en = v_antes.vence_en
    and v_despues.confirmado_en = v_antes.confirmado_en and v_despues.publicado_en is not distinct from v_antes.publicado_en
    and v_despues.origen = v_antes.origen, format('%s / %s', v_antes, v_despues));
  perform pg_temp.exigir('H el servidor informa de la talla conservada',
    r -> 'tallas_conservadas' @> '[{"id":"30000000-7777-0000-0000-00000000000b","talla":"40,5","activa":true}]'::jsonb, r::text);
  reset role;
  perform pg_temp.exigir('H la fila ni siquiera se reescribió', (select ctid::text from public.tallas where id = '30000000-7777-0000-0000-00000000000b') = v_ctid);
  set local role authenticated;
  -- 4) Sin el valor original de una talla existente, el servidor no adivina: rechaza.
  perform pg_temp.exigir_rechazo('H una talla existente sin activa_original se rechaza',
    format($q$select public.fn_admin_guardar_producto(pg_temp.datos('X', '{}', '[{"id":"30000000-7777-0000-0000-00000000000a","talla":"40","activa":true},{"id":"30000000-7777-0000-0000-00000000000b","talla":"40,5","activa":true,"activa_original":true},{"id":"30000000-7777-0000-0000-00000000000c","talla":"41 1/3","activa":true,"activa_original":true}]'), %s, gen_random_uuid())$q$, (r ->> 'version')),
    'PT422', 'estado original');
end;
$$;
reset role;

rollback;
