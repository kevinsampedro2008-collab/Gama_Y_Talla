-- Datos FICTICIOS anteriores a 20261109010000 (etapa 17). SOLO LOCAL.
-- Se cargan con las 14 migraciones anteriores aplicadas y guardan una instantánea de la vista
-- pública, de las filas y del historial en el esquema temporal «pruebas_17».
-- verificar_migracion_17.sql la compara después de aplicar la migración y la borra.
--
--   docker exec -i supabase_db_Yeny_Oficial psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/pruebas/reproducir/datos_previos_17.sql
\set ON_ERROR_STOP 1
begin;
do $$
begin
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261109010000') then
    raise exception 'La migración 20261109010000 ya está aplicada: estos datos deben cargarse antes.';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261108040000') then
    raise exception 'Faltan las migraciones anteriores (se esperan las 14 de la etapa 16.3).';
  end if;
end;
$$;

-- Heredado SIN público (clave_legado, publicado, con una talla confirmada y una foto del repositorio),
-- uno clasificado como Hombre y otro como Dama (16.3).
insert into public.productos (id, codigo_interno, nombre, marca, categoria, clave_legado, segmento, activo)
values ('10000000-1700-0000-0000-000000000001', 'GT-97001', 'Heredada 17', 'Marca 17', 'Urbanas', 'LEG-17-UNO', 'mujer', true);
insert into public.variantes (id, producto_id, codigo_variante, color, precio, id_legado)
values ('20000000-1700-0000-0000-000000000001', '10000000-1700-0000-0000-000000000001', 'GT-97001-A', 'Blanco', 150000, 'unica');
insert into public.productos (id, codigo_interno, nombre, marca, categoria, activo, publico) values
  ('10000000-1700-0000-0000-000000000002', 'GT-97002', 'Clasificada H 17', 'Marca 17', 'Running', true, 'hombre'),
  ('10000000-1700-0000-0000-000000000003', 'GT-97003', 'Clasificada D 17', 'Marca 17', 'Running', false, 'dama');
insert into public.variantes (id, producto_id, codigo_variante, color, precio) values
  ('20000000-1700-0000-0000-000000000002', '10000000-1700-0000-0000-000000000002', 'GT-97002-A', 'Negro', 180000),
  ('20000000-1700-0000-0000-000000000003', '10000000-1700-0000-0000-000000000003', 'GT-97003-A', 'Rosa', 170000);
insert into public.tallas (id, variante_id, talla, estado, publicado_en, vigencia_desde, confirmado_en, origen) values
  ('30000000-1700-0000-0000-000000000001', '20000000-1700-0000-0000-000000000001', '40', 'CONFIRMADA', now() - interval '2 hours', now() - interval '2 hours', now() - interval '2 hours', 'proveedor'),
  ('30000000-1700-0000-0000-000000000002', '20000000-1700-0000-0000-000000000002', '41', 'REVISAR', null, null, null, 'manual'),
  ('30000000-1700-0000-0000-000000000003', '20000000-1700-0000-0000-000000000003', '37', 'REVISAR', null, null, null, 'manual');
insert into public.fotos (variante_id, ruta, orden) values
  ('20000000-1700-0000-0000-000000000001', 'assets/images/productos/editadas/zapatilla_01.webp', 0),
  ('20000000-1700-0000-0000-000000000002', 'assets/images/productos/editadas/zapatilla_02.webp', 0);

drop schema if exists pruebas_17 cascade;
create schema pruebas_17;
create table pruebas_17.vista as
  select to_jsonb(c) as fila from public.catalogo_publico c where c.id in ('LEG-17-UNO', '10000000-1700-0000-0000-000000000002');
create table pruebas_17.productos as select * from public.productos where id::text like '10000000-1700-%';
create table pruebas_17.variantes as select * from public.variantes where id::text like '20000000-1700-%';
create table pruebas_17.tallas as select * from public.tallas where id::text like '30000000-1700-%';
create table pruebas_17.fotos as select * from public.fotos where variante_id::text like '20000000-1700-%';
create table pruebas_17.historial as select * from public.historial;
commit;
select 'instantánea previa 17: ' || count(*) || ' productos en la vista' from pruebas_17.vista;
