-- Etapa 14f · Pruebas del endurecimiento de funciones.
-- Escriben datos y se deshacen al final, PERO el ROLLBACK no devuelve las secuencias:
-- ejecutar SOLO en un entorno local desechable, nunca en el proyecto remoto.

begin;

create or replace function pg_temp.exigir(p_prueba text, p_ok boolean, p_detalle text default '')
returns void language plpgsql as $$
begin
  if p_ok then raise notice 'OK     %', p_prueba;
  else raise exception 'FALLA  % %', p_prueba, p_detalle; end if;
end;
$$;

-- La llamada debe rechazarse por FALTA DE PRIVILEGIO (no por la comprobación interna).
create or replace function pg_temp.exigir_denegado(p_prueba text, p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform pg_temp.exigir(p_prueba, false, '-> la consulta fue PERMITIDA');
exception
  when insufficient_privilege then perform pg_temp.exigir(p_prueba, true);
end;
$$;

-- La llamada debe llegar a la función y rechazarla su comprobación interna.
create or replace function pg_temp.exigir_guardia(p_prueba text, p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform pg_temp.exigir(p_prueba, false, '-> la consulta fue PERMITIDA');
exception
  when raise_exception then
    perform pg_temp.exigir(p_prueba, sqlerrm like 'Solo un administrador%', '-> ' || sqlerrm);
end;
$$;

-- Los ayudantes se crean aquí y se llaman con otros roles. Con la revocación global ya
-- no nacen con EXECUTE para PUBLIC: hay que concederlo, como a cualquier función nueva.
grant execute on all functions in schema pg_temp to public;

-- ------------------------------------------------------------- datos
insert into public.administradores (user_id, nombre)
values ('aaaaaaaa-1111-0000-0000-000000000001', 'admin de prueba');

insert into public.productos (id, nombre, marca, codigo_interno)
values ('10000000-0000-0000-0000-00000000000a', 'PRUEBA 30', 'Marca', 'PR-30');
insert into public.variantes (id, producto_id, codigo_variante, color, precio)
values ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'PR-30-A', 'Negro', 1000);
insert into public.tallas (id, variante_id, talla, nota)
values ('30000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '40', 'nota inicial'),
       ('30000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000a', '40 2/3', null);

-- =====================================================================
-- CATÁLOGO: privilegios y configuración
-- =====================================================================
do $$
declare
  v_fn text;
  v_oid regprocedure;
begin
  foreach v_fn in array array[
    'fn_es_administrador()', 'fn_confirmar_por_proveedor(uuid,smallint)',
    'fn_confirmar_por_publicacion(uuid,timestamptz,smallint)', 'fn_marcar_agotada(uuid,text)',
    'fn_asignar_codigo_interno()', 'fn_asignar_codigo_variante()', 'fn_registrar_historial()'
  ] loop
    v_oid := ('public.' || v_fn)::regprocedure;
    perform pg_temp.exigir(v_fn || ': sin EXECUTE para PUBLIC',
      not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                   where p.oid = v_oid and a.grantee = 0));
    perform pg_temp.exigir(v_fn || ': sin EXECUTE para anon',
      not has_function_privilege('anon', v_oid, 'EXECUTE'));
    perform pg_temp.exigir(v_fn || ': sin EXECUTE para service_role',
      not has_function_privilege('service_role', v_oid, 'EXECUTE'));
    perform pg_temp.exigir(v_fn || ': sigue siendo SECURITY DEFINER con search_path vacío',
      (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p where p.oid = v_oid));
  end loop;

  foreach v_fn in array array['fn_es_administrador()', 'fn_confirmar_por_proveedor(uuid,smallint)',
    'fn_confirmar_por_publicacion(uuid,timestamptz,smallint)', 'fn_marcar_agotada(uuid,text)'] loop
    perform pg_temp.exigir(v_fn || ': authenticated conserva EXECUTE',
      has_function_privilege('authenticated', ('public.' || v_fn)::regprocedure, 'EXECUTE'));
  end loop;

  foreach v_fn in array array['fn_asignar_codigo_interno()', 'fn_asignar_codigo_variante()', 'fn_registrar_historial()'] loop
    perform pg_temp.exigir(v_fn || ': authenticated NO puede ejecutarla',
      not has_function_privilege('authenticated', ('public.' || v_fn)::regprocedure, 'EXECUTE'));
  end loop;

  foreach v_fn in array array['fn_valor_talla(text)', 'fn_estado_publico(public.estado_talla,timestamptz,timestamptz)',
    'fn_tallas_por_estado(uuid,public.estado_publico)', 'fn_lote_actual()', 'fn_marcar_actualizado()', 'fn_tallas_antes_de_escribir()'] loop
    perform pg_temp.exigir(v_fn || ': invoker con search_path vacío',
      (select not p.prosecdef and p.proconfig @> array['search_path=""']
         from pg_proc p where p.oid = ('public.' || v_fn)::regprocedure));
  end loop;

  foreach v_fn in array array['fn_valor_talla(text)', 'fn_estado_publico(public.estado_talla,timestamptz,timestamptz)',
    'fn_tallas_por_estado(uuid,public.estado_publico)'] loop
    perform pg_temp.exigir(v_fn || ': anon conserva EXECUTE (la vista la necesita)',
      has_function_privilege('anon', ('public.' || v_fn)::regprocedure, 'EXECUTE'));
  end loop;

  perform pg_temp.exigir('la vista conserva security_invoker',
    (select 'security_invoker=true' = any (reloptions) from pg_class where oid = 'public.catalogo_publico'::regclass));
  perform pg_temp.exigir('el RLS sigue activo en las 7 tablas',
    (select count(*) = 7 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity));
  perform pg_temp.exigir('ningún rol de aplicación toca la secuencia de códigos',
    not has_sequence_privilege('anon', 'public.seq_codigo_producto', 'USAGE')
    and not has_sequence_privilege('authenticated', 'public.seq_codigo_producto', 'USAGE'));
end;
$$;

-- =====================================================================
-- FUNCIONES FUTURAS: nacen cerradas, en public y en cualquier otro esquema
-- =====================================================================
create function public.fn_futura_prueba() returns int language sql as 'select 1';
create schema esquema_prueba_30;
create function esquema_prueba_30.fn_futura_prueba() returns int language sql as 'select 1';

do $$
declare v_fn regprocedure;
begin
  foreach v_fn in array array['public.fn_futura_prueba()', 'esquema_prueba_30.fn_futura_prueba()']::regprocedure[] loop
    perform pg_temp.exigir(v_fn || ' nace sin EXECUTE para PUBLIC',
      not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                   where p.oid = v_fn and a.grantee = 0));
    perform pg_temp.exigir(v_fn || ' nace sin EXECUTE para anon',
      not has_function_privilege('anon', v_fn, 'EXECUTE'));
    perform pg_temp.exigir(v_fn || ' nace sin EXECUTE para authenticated',
      not has_function_privilege('authenticated', v_fn, 'EXECUTE'));
  end loop;
  perform pg_temp.exigir('public.fn_futura_prueba nace sin EXECUTE para service_role',
    not has_function_privilege('service_role', 'public.fn_futura_prueba()', 'EXECUTE'));
end;
$$;

grant execute on function public.fn_futura_prueba() to anon;
do $$
begin
  perform pg_temp.exigir('una concesión explícita sí funciona',
    has_function_privilege('anon', 'public.fn_futura_prueba()', 'EXECUTE'));
end;
$$;

-- =====================================================================
-- ANON
-- =====================================================================
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select pg_temp.exigir_denegado('anon no ejecuta fn_es_administrador', 'select public.fn_es_administrador()');
select pg_temp.exigir_denegado('anon no ejecuta fn_confirmar_por_proveedor',
  $q$select public.fn_confirmar_por_proveedor('30000000-0000-0000-0000-00000000000a')$q$);
select pg_temp.exigir_denegado('anon no ejecuta fn_confirmar_por_publicacion',
  $q$select public.fn_confirmar_por_publicacion('30000000-0000-0000-0000-00000000000a', now())$q$);
select pg_temp.exigir_denegado('anon no ejecuta fn_marcar_agotada',
  $q$select public.fn_marcar_agotada('30000000-0000-0000-0000-00000000000a')$q$);
select pg_temp.exigir_denegado('anon no ejecuta fn_asignar_codigo_interno', 'select public.fn_asignar_codigo_interno()');
select pg_temp.exigir_denegado('anon no ejecuta fn_asignar_codigo_variante', 'select public.fn_asignar_codigo_variante()');
select pg_temp.exigir_denegado('anon no ejecuta fn_registrar_historial', 'select public.fn_registrar_historial()');
select pg_temp.exigir_denegado('anon no inserta productos', $q$insert into public.productos (nombre, marca) values ('X', 'X')$q$);
select pg_temp.exigir_denegado('anon no actualiza tallas', $q$update public.tallas set talla = 'X'$q$);
select pg_temp.exigir_denegado('anon no borra fotos', 'delete from public.fotos');
select pg_temp.exigir_denegado('anon no lee notas internas', 'select nota from public.tallas');
select pg_temp.exigir_denegado('anon no lee el historial', 'select 1 from public.historial');

do $$
begin
  -- La vista necesita las tres funciones invoker: si falta alguna, esto lanza error.
  perform pg_temp.exigir('anon lee la vista y ve la talla por revisar',
    (select v -> 'tallasPorRevisar' @> '["40"]'::jsonb
       from public.catalogo_publico c, jsonb_array_elements(c.variantes) v
      where c.nombre = 'PRUEBA 30'));
  perform pg_temp.exigir('el orden de tallas con fracción se conserva',
    (select (v -> 'tallasPorRevisar') = '["40", "40 2/3"]'::jsonb
       from public.catalogo_publico c, jsonb_array_elements(c.variantes) v
      where c.nombre = 'PRUEBA 30'));
end;
$$;
reset role;

-- =====================================================================
-- AUTENTICADO QUE NO ES ADMINISTRADOR
-- =====================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-1111-0000-0000-000000000002', true);

select pg_temp.exigir_guardia('no admin: la guardia rechaza fn_confirmar_por_proveedor',
  $q$select public.fn_confirmar_por_proveedor('30000000-0000-0000-0000-00000000000a')$q$);
select pg_temp.exigir_guardia('no admin: la guardia rechaza fn_confirmar_por_publicacion',
  $q$select public.fn_confirmar_por_publicacion('30000000-0000-0000-0000-00000000000a', now())$q$);
select pg_temp.exigir_guardia('no admin: la guardia rechaza fn_marcar_agotada',
  $q$select public.fn_marcar_agotada('30000000-0000-0000-0000-00000000000a')$q$);
select pg_temp.exigir_denegado('no admin no ejecuta fn_registrar_historial', 'select public.fn_registrar_historial()');
select pg_temp.exigir_denegado('no admin no escribe en el historial',
  $q$insert into public.historial (tabla, fila_id, operacion) values ('x', gen_random_uuid(), 'INSERT')$q$);
select pg_temp.exigir_denegado('no admin no inserta productos (RLS)',
  $q$insert into public.productos (nombre, marca) values ('PIRATA', 'X')$q$);

do $$
declare n bigint;
begin
  perform pg_temp.exigir('no admin: fn_es_administrador responde falso', not public.fn_es_administrador());
  -- Desde 20261107020000 la lectura pública es solo de anon. Lo que se comprueba es lo mismo
  -- (las políticas evalúan la función sin error), pero una sesión ya no recibe el catálogo.
  perform pg_temp.exigir('no admin: el RLS evalúa la función sin error y no entrega el catálogo',
    not exists (select 1 from public.catalogo_publico where nombre = 'PRUEBA 30'));
  update public.tallas set talla = 'PIRATA' where id = '30000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  perform pg_temp.exigir('no admin: UPDATE no afecta a ninguna fila', n = 0);
  delete from public.fotos;
  get diagnostics n = row_count;
  perform pg_temp.exigir('no admin: DELETE no afecta a ninguna fila', n = 0);
  perform pg_temp.exigir('no admin: administradores devuelve cero filas', not exists (select 1 from public.administradores));
end;
$$;
reset role;

-- =====================================================================
-- ADMINISTRADOR LEGÍTIMO
-- =====================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-1111-0000-0000-000000000001', true);
select set_config('gamaytalla.lote', 'cccccccc-1111-0000-0000-000000000003', true);

do $$
declare
  v_fila public.tallas;
  v_prod uuid;
  v_codigo text;
  v_variante text;
  v_antes timestamptz;
  v_horas numeric;
begin
  perform pg_temp.exigir('admin: es reconocido', public.fn_es_administrador());

  -- Escenario B: la confirmación arranca el reloj ahora y vence a las 48 h.
  v_fila := public.fn_confirmar_por_proveedor('30000000-0000-0000-0000-00000000000a');
  v_horas := extract(epoch from v_fila.vence_en - v_fila.vigencia_desde) / 3600;
  perform pg_temp.exigir('admin: fn_confirmar_por_proveedor confirma', v_fila.estado = 'CONFIRMADA' and v_fila.origen = 'proveedor');
  perform pg_temp.exigir('disparador tr_tallas_vigencia: vence_en = vigencia_desde + 48 h', v_horas = 48, v_horas::text);
  perform pg_temp.exigir('fn_estado_publico: vigente = DISPONIBLE',
    public.fn_estado_publico(v_fila.estado, v_fila.vigencia_desde, v_fila.vence_en) = 'DISPONIBLE');
  perform pg_temp.exigir('fn_tallas_por_estado devuelve la talla disponible',
    public.fn_tallas_por_estado('20000000-0000-0000-0000-00000000000a', 'DISPONIBLE') = '["40"]'::jsonb);

  -- Escenario A: la vigencia arranca en la publicación original; aquí ya venció.
  v_fila := public.fn_confirmar_por_publicacion('30000000-0000-0000-0000-00000000000a', now() - interval '72 hours');
  perform pg_temp.exigir('admin: fn_confirmar_por_publicacion usa la fecha original', v_fila.vigencia_desde = v_fila.publicado_en);
  perform pg_temp.exigir('fn_estado_publico: vencida = POR_REVISAR',
    public.fn_estado_publico(v_fila.estado, v_fila.vigencia_desde, v_fila.vence_en) = 'POR_REVISAR');

  v_fila := public.fn_marcar_agotada('30000000-0000-0000-0000-00000000000a', 'nota de agotado');
  perform pg_temp.exigir('admin: fn_marcar_agotada agota y limpia el reloj',
    v_fila.estado = 'AGOTADA' and v_fila.vence_en is null and v_fila.nota = 'nota de agotado');
  perform pg_temp.exigir('fn_estado_publico: agotada = AGOTADO',
    public.fn_estado_publico(v_fila.estado, v_fila.vigencia_desde, v_fila.vence_en) = 'AGOTADO');

  perform pg_temp.exigir('fn_valor_talla ordena tercios', round(public.fn_valor_talla('40 2/3'), 2) = 40.67);

  -- Disparadores de códigos, ejecutados SIN que authenticated tenga EXECUTE sobre ellos.
  insert into public.productos (nombre, marca) values ('DEL PANEL', 'Marca')
    returning id, codigo_interno into v_prod, v_codigo;
  perform pg_temp.exigir('disparador tr_productos_codigo asigna GT-', v_codigo ~ '^GT-[0-9]{5}$', v_codigo);
  insert into public.variantes (producto_id, color) values (v_prod, 'Azul') returning codigo_variante into v_variante;
  perform pg_temp.exigir('disparador tr_variantes_codigo deriva el código', v_variante = v_codigo || '-A', v_variante);

  -- Disparador de historial, con autor y lote (fn_lote_actual llamada desde search_path vacío).
  perform pg_temp.exigir('disparador tr_historial registra autor y lote',
    exists (select 1 from public.historial h
             where h.tabla = 'productos' and h.fila_id = v_prod
               and h.autor = 'aaaaaaaa-1111-0000-0000-000000000001'
               and h.lote = 'cccccccc-1111-0000-0000-000000000003'));

  update public.productos set nombre = 'DEL PANEL 2' where id = v_prod;
  perform pg_temp.exigir('el historial registra el cambio real',
    exists (select 1 from public.historial h
             where h.fila_id = v_prod and h.operacion = 'UPDATE' and h.cambios @> array['nombre']));
end;
$$;

select pg_temp.exigir_denegado('admin no ejecuta directamente fn_registrar_historial', 'select public.fn_registrar_historial()');
select pg_temp.exigir_denegado('admin no borra el historial', 'delete from public.historial');
select pg_temp.exigir_denegado('admin no modifica el historial', $q$update public.historial set tabla = 'x'$q$);
reset role;

-- fn_marcar_actualizado y actualizado_en: dentro de una transacción now() no avanza, así
-- que se parte de una fecha antigua para ver cómo el disparador la sobrescribe.
do $$
declare v_fecha timestamptz;
begin
  update public.productos set actualizado_en = '2000-01-01', nombre = 'PRUEBA 30 B'
   where id = '10000000-0000-0000-0000-00000000000a' returning actualizado_en into v_fecha;
  perform pg_temp.exigir('disparador fn_marcar_actualizado sobrescribe actualizado_en', v_fecha > '2020-01-01');
end;
$$;

-- =====================================================================
-- SERVICE_ROLE: los disparadores no dependen de su EXECUTE
-- =====================================================================
set local role service_role;
do $$
declare v_codigo text;
begin
  insert into public.productos (nombre, marca) values ('DE SERVICIO', 'Marca') returning codigo_interno into v_codigo;
  perform pg_temp.exigir('service_role inserta y el disparador asigna el código', v_codigo ~ '^GT-[0-9]{5}$', v_codigo);
end;
$$;
select pg_temp.exigir_denegado('service_role no ejecuta fn_marcar_agotada directamente',
  $q$select public.fn_marcar_agotada('30000000-0000-0000-0000-00000000000a')$q$);
reset role;

rollback;
