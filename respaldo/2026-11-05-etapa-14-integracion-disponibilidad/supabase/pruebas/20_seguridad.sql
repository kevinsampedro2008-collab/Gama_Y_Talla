-- Etapa 13 · Pruebas de RLS y privilegios mínimos.
-- Se comprueba la vista pública Y la consulta directa a las tablas, con los
-- roles reales de Supabase (anon, authenticated). Todo dentro de una
-- transacción que se deshace al final.

begin;

create or replace function pg_temp.exigir(p_prueba text, p_ok boolean, p_detalle text default '')
returns void language plpgsql as $$
begin
  if p_ok then raise notice 'OK     %', p_prueba;
  else raise exception 'FALLA  % %', p_prueba, p_detalle; end if;
end;
$$;

-- Comprueba que una consulta es RECHAZADA por falta de privilegios.
create or replace function pg_temp.exigir_denegado(p_prueba text, p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform pg_temp.exigir(p_prueba, false, '-> la consulta fue PERMITIDA');
exception
  when insufficient_privilege then perform pg_temp.exigir(p_prueba, true);
  when undefined_table        then perform pg_temp.exigir(p_prueba, true);
  when undefined_column       then perform pg_temp.exigir(p_prueba, true);
end;
$$;

-- Comprueba que una consulta devuelve CERO filas (RLS filtrando).
create or replace function pg_temp.exigir_vacio(p_prueba text, p_sql text)
returns void language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || p_sql || ') z' into n;
  perform pg_temp.exigir(p_prueba, n = 0, '-> devolvio ' || n || ' filas');
end;
$$;

-- ------------------------------------------------------------- datos
insert into public.administradores (user_id, nombre)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Administrador');

insert into public.productos (nombre, marca, clave_legado, activo)
values ('VISIBLE', 'Marca', 'seg-visible', true), ('OCULTO', 'Marca', 'seg-oculto', false);

insert into public.variantes (producto_id, codigo_variante, id_legado, precio)
  select id, codigo_interno || '-A', 'unica', 100000 from public.productos where clave_legado like 'seg-%';

insert into public.fotos (variante_id, ruta)
  select v.id, 'assets/images/productos/x.webp' from public.variantes v;

insert into public.tallas (variante_id, talla, estado, vigencia_desde, origen, nota, estado_migrado)
  select v.id, '40', 'CONFIRMADA', now(), 'proveedor', 'NOTA PRIVADA', 'disponible'
    from public.variantes v
    join public.productos p on p.id = v.producto_id
   where p.clave_legado = 'seg-visible';

-- =====================================================================
-- VISITANTE (anon)
-- =====================================================================
set local role anon;

do $$
declare n bigint;
begin
  -- Lo que SÍ debe poder: leer el catálogo público.
  select count(*) into n from public.catalogo_publico where nombre = 'VISIBLE';
  perform pg_temp.exigir('anon lee la vista publica', n = 1, 'filas=' || n);

  -- La vista respeta el RLS: el producto inactivo no aparece (security_invoker).
  perform pg_temp.exigir('anon NO ve el producto inactivo en la vista',
    not exists (select 1 from public.catalogo_publico where nombre = 'OCULTO'));

  -- Y tampoco consultando la tabla directamente.
  perform pg_temp.exigir_vacio('anon NO ve el producto inactivo en la tabla',
    $q$select 1 from public.productos where nombre = 'OCULTO'$q$);
end;
$$;

-- Columnas privadas: ni siquiera se pueden nombrar.
select pg_temp.exigir_denegado('anon NO puede leer tallas.nota',
  $q$select nota from public.tallas$q$);
select pg_temp.exigir_denegado('anon NO puede leer tallas.estado_migrado',
  $q$select estado_migrado from public.tallas$q$);
select pg_temp.exigir_denegado('anon NO puede leer tallas.origen',
  $q$select origen from public.tallas$q$);
select pg_temp.exigir_denegado('anon NO puede leer tallas.publicado_en',
  $q$select publicado_en from public.tallas$q$);
select pg_temp.exigir_denegado('anon NO puede leer tallas.confirmado_en',
  $q$select confirmado_en from public.tallas$q$);
select pg_temp.exigir_denegado('anon NO puede leer select * de tallas',
  $q$select * from public.tallas$q$);

-- Tablas privadas: no existen para el visitante.
select pg_temp.exigir_denegado('anon NO puede leer el historial',
  $q$select * from public.historial$q$);
select pg_temp.exigir_denegado('anon NO puede leer administradores',
  $q$select * from public.administradores$q$);
select pg_temp.exigir_denegado('anon NO puede leer configuracion',
  $q$select * from public.configuracion$q$);

-- Escritura: ninguna, en ninguna tabla.
select pg_temp.exigir_denegado('anon NO puede insertar productos',
  $q$insert into public.productos (nombre, marca) values ('PIRATA', 'X')$q$);
select pg_temp.exigir_denegado('anon NO puede modificar tallas',
  $q$update public.tallas set estado = 'CONFIRMADA'$q$);
select pg_temp.exigir_denegado('anon NO puede borrar tallas',
  $q$delete from public.tallas$q$);
select pg_temp.exigir_denegado('anon NO puede escribir en el historial',
  $q$insert into public.historial (tabla, fila_id, operacion)
     values ('tallas', gen_random_uuid(), 'INSERT')$q$);
select pg_temp.exigir_denegado('anon NO puede nombrarse administrador',
  $q$insert into public.administradores (user_id) values (gen_random_uuid())$q$);
select pg_temp.exigir_denegado('anon NO puede usar la secuencia de codigos',
  $q$select nextval('public.seq_codigo_producto')$q$);

reset role;

-- =====================================================================
-- AUTENTICADO QUE NO ES ADMINISTRADOR
-- =====================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);

-- Matiz importante: el privilegio SELECT sobre historial se concede al rol
-- «authenticated» porque el administrador tambien es authenticated. Los grants
-- son por rol, no por usuario, asi que la separacion la hace el RLS: la consulta
-- se permite pero devuelve CERO filas a quien no es administrador.
select pg_temp.exigir_vacio('autenticado-no-admin lee el historial VACIO (RLS)',
  $q$select 1 from public.historial$q$);

do $$
begin
  perform pg_temp.exigir('autenticado-no-admin no es administrador',
                         not public.fn_es_administrador());
  begin
    insert into public.productos (nombre, marca) values ('PIRATA', 'X');
    perform pg_temp.exigir('autenticado-no-admin NO puede insertar productos', false);
  exception when insufficient_privilege then
    perform pg_temp.exigir('autenticado-no-admin NO puede insertar productos', true);
  end;

  perform pg_temp.exigir_vacio('autenticado-no-admin no ve filas de productos inactivos',
    $q$select 1 from public.productos where nombre = 'OCULTO'$q$);
end;
$$;

reset role;

-- =====================================================================
-- ADMINISTRADOR
-- =====================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

do $$
declare n bigint; v_id uuid;
begin
  perform pg_temp.exigir('el administrador es reconocido', public.fn_es_administrador());

  insert into public.productos (nombre, marca) values ('NUEVO DEL PANEL', 'Marca');
  perform pg_temp.exigir('el administrador puede crear productos',
    exists (select 1 from public.productos where nombre = 'NUEVO DEL PANEL'));

  select count(*) into n from public.productos where nombre in ('VISIBLE','OCULTO','NUEVO DEL PANEL');
  perform pg_temp.exigir('el administrador ve tambien los inactivos', n = 3, 've=' || n);

  select count(*) into n from public.historial;
  perform pg_temp.exigir('el administrador lee el historial', n > 0, 'filas=' || n);

  -- El historial no se puede falsear desde la interfaz.
  begin
    update public.historial set autor = gen_random_uuid();
    perform pg_temp.exigir('ni el administrador puede alterar el historial', false);
  exception when insufficient_privilege then
    perform pg_temp.exigir('ni el administrador puede alterar el historial', true);
  end;
  begin
    delete from public.historial;
    perform pg_temp.exigir('ni el administrador puede borrar el historial', false);
  exception when insufficient_privilege then
    perform pg_temp.exigir('ni el administrador puede borrar el historial', true);
  end;
end;
$$;

reset role;
rollback;
