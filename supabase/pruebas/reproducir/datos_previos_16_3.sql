-- Datos FICTICIOS anteriores a 20261108040000 (etapa 16.3). SOLO LOCAL.
-- Se cargan con las 13 migraciones anteriores aplicadas y guardan una instantánea de la vista
-- pública y de las filas en el esquema temporal «pruebas_16_3». verificar_migracion_16_3.sql la
-- compara después de aplicar la migración y la borra.
--
--   docker exec -i supabase_db_Yeny_Oficial psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/pruebas/reproducir/datos_previos_16_3.sql
\set ON_ERROR_STOP 1
begin;
do $$
begin
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261108040000') then
    raise exception 'La migración 20261108040000 ya está aplicada: estos datos deben cargarse antes.';
  end if;
end;
$$;

-- Heredado (clave_legado) con segmento de guía «mujer», y uno del panel con dos colores.
insert into public.productos (id, codigo_interno, nombre, marca, categoria, clave_legado, segmento, activo)
values ('10000000-1630-0000-0000-000000000001', 'GT-91001', 'Samba 163', 'Adidas', 'Urbanas', 'LEG-163-UNO', 'mujer', true);
insert into public.variantes (id, producto_id, codigo_variante, color, precio, id_legado)
values ('20000000-1630-0000-0000-000000000001', '10000000-1630-0000-0000-000000000001', 'GT-91001-A', 'Beige/Blancas', 120000, 'unica');
insert into public.productos (id, codigo_interno, nombre, marca, categoria, activo)
values ('10000000-1630-0000-0000-000000000002', 'GT-91002', 'Forum 163', 'Adidas', 'Urbanas', true);
insert into public.variantes (id, producto_id, codigo_variante, color, precio, orden) values
  ('20000000-1630-0000-0000-000000000021', '10000000-1630-0000-0000-000000000002', 'GT-91002-A', 'Negro', 150000, 0),
  ('20000000-1630-0000-0000-000000000022', '10000000-1630-0000-0000-000000000002', 'GT-91002-B', 'Blanco', 150000, 1);
insert into public.tallas (id, variante_id, talla, estado, publicado_en, vigencia_desde, confirmado_en, origen) values
  ('30000000-1630-0000-0000-000000000001', '20000000-1630-0000-0000-000000000001', '40', 'CONFIRMADA', now() - interval '2 hours', now() - interval '2 hours', now() - interval '2 hours', 'proveedor'),
  ('30000000-1630-0000-0000-000000000021', '20000000-1630-0000-0000-000000000021', '41', 'REVISAR', null, null, null, 'manual');
insert into public.fotos (variante_id, ruta, orden) values ('20000000-1630-0000-0000-000000000021', 'assets/productos/forum-163.webp', 0);

drop schema if exists pruebas_16_3 cascade;
create schema pruebas_16_3;
create table pruebas_16_3.vista as
  select to_jsonb(c) as fila from public.catalogo_publico c where c.id in ('LEG-163-UNO', '10000000-1630-0000-0000-000000000002');
create table pruebas_16_3.productos as select * from public.productos where id::text like '10000000-1630-%';
create table pruebas_16_3.variantes as select * from public.variantes where id::text like '20000000-1630-%';
create table pruebas_16_3.tallas as select * from public.tallas where id::text like '30000000-1630-%';
create table pruebas_16_3.fotos as select * from public.fotos where variante_id::text like '20000000-1630-%';
commit;
select 'instantánea previa 16.3: ' || count(*) || ' productos en la vista' from pruebas_16_3.vista;
