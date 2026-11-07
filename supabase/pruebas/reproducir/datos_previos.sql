-- Datos FICTICIOS anteriores a 20261107030000, para ciclo_atomicidad.sh. SOLO LOCAL.
-- Se cargan con las nueve migraciones anteriores aplicadas, cuando aún se admite cualquier talla:
--   '40,5' y '40 1/3'  válidas, pero con las nueve anteriores tumban catalogo_publico;
--   '40 2/4'           válida y equivalente a '40,5' (se admite desde la revisión de 14f.2);
--   '41'               CONFIRMADA con vigencia FUTURA (no se renueva ni se inventa: queda POR_REVISAR);
--   'foo'              NO válida: la migración debe fallar, enumerarla y no aplicar nada.
\set ON_ERROR_STOP 1
insert into public.productos (id, nombre, marca, codigo_interno, activo)
values ('10000000-0f2a-0000-0000-00000000000a', 'PREVIO 14F2', 'M', 'PRV-1', true);
insert into public.variantes (id, producto_id, codigo_variante, color, precio)
values ('20000000-0f2a-0000-0000-00000000000a', '10000000-0f2a-0000-0000-00000000000a', 'PRV-1-A', 'N', 1);
insert into public.tallas (id, variante_id, talla, estado, publicado_en, vigencia_desde) values
  ('30000000-0f2a-0000-0000-000000000001', '20000000-0f2a-0000-0000-00000000000a', '40,5',   'REVISAR', null, null),
  ('30000000-0f2a-0000-0000-000000000002', '20000000-0f2a-0000-0000-00000000000a', '40 1/3', 'REVISAR', null, null),
  ('30000000-0f2a-0000-0000-000000000003', '20000000-0f2a-0000-0000-00000000000a', '39',     'CONFIRMADA', now() - interval '2 hours', now() - interval '2 hours'),
  ('30000000-0f2a-0000-0000-000000000004', '20000000-0f2a-0000-0000-00000000000a', '41',     'CONFIRMADA', now() + interval '10 days', now() + interval '10 days'),
  ('30000000-0f2a-0000-0000-000000000005', '20000000-0f2a-0000-0000-00000000000a', 'foo',    'REVISAR', null, null),
  ('30000000-0f2a-0000-0000-000000000006', '20000000-0f2a-0000-0000-00000000000a', '40 2/4', 'REVISAR', null, null);
select 'datos previos: ' || count(*) || ' tallas' from public.tallas where variante_id = '20000000-0f2a-0000-0000-00000000000a';
