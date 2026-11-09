-- Datos FICTICIOS anteriores a 20261108030000 (etapa 16.2). SOLO LOCAL.
-- Se cargan con las 12 migraciones anteriores aplicadas y guardan una instantánea de lo que la
-- tienda veía (identificadores públicos, tallas, fotos, historial) en el esquema temporal
-- «pruebas_16_2». verificar_migracion_16_2.sql la compara después de aplicar la migración y la borra.
--
--   docker exec -i supabase_db_Yeny_Oficial psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/pruebas/reproducir/datos_previos_16_2.sql
\set ON_ERROR_STOP 1
begin;
do $$
begin
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261108030000') then
    raise exception 'La migración 20261108030000 ya está aplicada: estos datos deben cargarse antes.';
  end if;
end;
$$;

-- 1) Heredado del JSON (como los 28 de ejemplo): clave_legado e id_legado = 'unica'.
insert into public.productos (id, codigo_interno, nombre, marca, categoria, clave_legado, activo, descripcion)
values ('10000000-1620-0000-0000-000000000001', 'GT-90001', 'Samba Niño', 'adidas', 'Urbanas', 'LEG-162-UNO', true,
        'Descripción en minúsculas: no se toca.');
insert into public.variantes (id, producto_id, codigo_variante, color, referencia_variante, precio, id_legado)
values ('20000000-1620-0000-0000-000000000001', '10000000-1620-0000-0000-000000000001', 'GT-90001-A', 'Beige/Blancas', 'ref-prov-1', 120000, 'unica');
-- 2) Heredado con referencia repetida (clave con «~») y espacios exteriores en el código.
insert into public.productos (id, codigo_interno, nombre, marca, categoria, clave_legado, activo)
values ('10000000-1620-0000-0000-000000000002', ' gt-90002 ', 'Ñandú Retro', 'Le coq', 'casual', 'LEG-162-DOS~foto-x', true);
insert into public.variantes (id, producto_id, codigo_variante, color, precio, id_legado)
values ('20000000-1620-0000-0000-000000000002', '10000000-1620-0000-0000-000000000002', 'gt-90002-a', 'café / añil', 90000, 'unica');
-- 3) Creado por el panel (etapa 16): sin claves heredadas; su id público era el código GT.
insert into public.productos (id, codigo_interno, nombre, marca, categoria, activo)
values ('10000000-1620-0000-0000-000000000003', 'GT-90003', 'Forum Low', 'Adidas', 'Urbanas', true);
insert into public.variantes (id, producto_id, codigo_variante, color, precio, orden) values
  ('20000000-1620-0000-0000-000000000031', '10000000-1620-0000-0000-000000000003', 'GT-90003-A', 'Negro', 150000, 0),
  ('20000000-1620-0000-0000-000000000032', '10000000-1620-0000-0000-000000000003', 'GT-90003-B', 'blanco', 150000, 1);
-- 4) Oculto y ya en mayúsculas: no debe cambiar de versión.
insert into public.productos (id, codigo_interno, nombre, marca, categoria, activo)
values ('10000000-1620-0000-0000-000000000004', 'GT-90004', 'OCULTO 162', 'MARCA', 'OTRAS', false);
insert into public.variantes (id, producto_id, codigo_variante, color, precio)
values ('20000000-1620-0000-0000-000000000004', '10000000-1620-0000-0000-000000000004', 'GT-90004-A', 'ROJO', 1000);

-- Tallas con estados y fechas que la migración no puede mover.
insert into public.tallas (id, variante_id, talla, estado, publicado_en, vigencia_desde, confirmado_en, origen) values
  ('30000000-1620-0000-0000-000000000001', '20000000-1620-0000-0000-000000000001', '40', 'CONFIRMADA', now() - interval '3 hours', now() - interval '3 hours', now() - interval '3 hours', 'proveedor'),
  ('30000000-1620-0000-0000-000000000002', '20000000-1620-0000-0000-000000000001', '41', 'REVISAR', null, null, null, 'migracion'),
  ('30000000-1620-0000-0000-000000000003', '20000000-1620-0000-0000-000000000002', '40', 'AGOTADA', null, null, null, 'manual'),
  ('30000000-1620-0000-0000-000000000031', '20000000-1620-0000-0000-000000000031', '42', 'CONFIRMADA', now() - interval '1 hour', now() - interval '1 hour', now() - interval '1 hour', 'proveedor'),
  ('30000000-1620-0000-0000-000000000032', '20000000-1620-0000-0000-000000000032', '42', 'REVISAR', null, null, null, 'manual');
insert into public.fotos (variante_id, ruta, orden) values
  ('20000000-1620-0000-0000-000000000001', 'assets/productos/samba-162.webp', 0),
  ('20000000-1620-0000-0000-000000000031', 'assets/productos/forum-162.webp', 0);

-- Instantánea de lo que la tienda y el carrito veían antes de migrar.
drop schema if exists pruebas_16_2 cascade;
create schema pruebas_16_2;
create table pruebas_16_2.publico as
  select c.id as producto, v ->> 'id' as variante, v ->> 'codigoVariante' as codigo_variante
    from public.catalogo_publico c, jsonb_array_elements(c.variantes) v
   where c.id like 'LEG-162-%' or c.id like 'GT-9000%';
create table pruebas_16_2.tallas as select * from public.tallas where id::text like '30000000-1620-%';
create table pruebas_16_2.fotos as select * from public.fotos where variante_id::text like '20000000-1620-%';
create table pruebas_16_2.productos as select id, version, ultima_operacion, actualizado_en, descripcion, clave_legado from public.productos where id::text like '10000000-1620-%';
create table pruebas_16_2.variantes as select id, actualizado_en, id_legado, referencia_variante from public.variantes where id::text like '20000000-1620-%';
create table pruebas_16_2.historial as select max(id) as ultimo from public.historial;
commit;
select 'instantánea previa: ' || count(*) || ' colores públicos' from pruebas_16_2.publico;
select producto, variante, codigo_variante from pruebas_16_2.publico order by 1, 2;
