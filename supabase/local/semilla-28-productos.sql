-- Semilla de la MIGRACIÓN EN SECO · etapa 13 · generada por scripts/migracion-en-seco.mjs
-- Solo para la base LOCAL de validación. No aplicar en producción.
-- Ninguna talla recibe fecha: todas nacen POR REVISAR, como se acordó.
begin;

-- SAMBA (ADD-SAM)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('ADD-SAM', 'SAMBA', 'Adidas',
          'Urbanas', null, null,
          true, true, 0, 'ADD-SAM~zapatilla-01')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Rosa / blanco / beigh', 'ADD-SAM',
         120000, 290000, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/editadas/zapatilla_01.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('38', 'disponible'), ('39', 'disponible'), ('40', 'disponible'), ('41', 'disponible'), ('42', 'disponible'), ('43', 'disponible'), ('44', 'agotada'), ('45', 'agotada')) as t(talla, anterior);

-- LCS Retro Classic (LCS-RET-01)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('LCS-RET-01', 'LCS Retro Classic', 'Le Coq Sportif',
          'Casual / Urbanas', null, null,
          true, true, 1, 'LCS-RET-01~zapatilla-02')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Blanco / Rojo / Azul / Beis', 'LCS-RET-01',
         120000, 0, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/editadas/zapatilla_02.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('36', 'disponible'), ('37', 'disponible'), ('38', 'disponible'), ('39', 'disponible'), ('40', 'disponible'), ('41', 'disponible'), ('42', 'disponible'), ('43', 'disponible'), ('44', 'disponible')) as t(talla, anterior);

-- Air Jordan 1 Retro High OG (GT-001)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('GT-001', 'Air Jordan 1 Retro High OG', 'Jordan',
          'Urbanas', null, null,
          true, true, 2, 'GT-001~zapatilla-03')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Rojo / blanco / negro', 'GT-001',
         120000, 290000, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/editadas/zapatilla_03.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('38', 'disponible'), ('39', 'disponible'), ('40', 'disponible'), ('41', 'disponible'), ('42', 'disponible'), ('43', 'disponible'), ('44', 'agotada'), ('45', 'agotada')) as t(talla, anterior);

-- Air Force 1 '07 (GT-002)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('GT-002', 'Air Force 1 ''07', 'Nike',
          'Casuales', null, null,
          true, false, 3, 'GT-002~zapatilla-04')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Blanco', 'GT-002',
         132900, 290000, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/editadas/zapatilla_04.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('36', 'disponible'), ('37', 'disponible'), ('38', 'disponible'), ('39', 'disponible'), ('40', 'disponible'), ('41', 'disponible'), ('42', 'disponible'), ('43', 'disponible'), ('44', 'disponible')) as t(talla, anterior);

-- Samba OG (GT-003)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('GT-003', 'Samba OG', 'Adidas',
          'Casuales', null, null,
          true, true, 4, 'GT-003~zapatilla-05')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Blanco / verde', 'GT-003',
         459900, 0, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/zapatilla_05.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('37', 'disponible'), ('38', 'disponible'), ('39', 'disponible'), ('40', 'disponible'), ('41', 'disponible'), ('42', 'agotada')) as t(talla, anterior);

-- Pegasus 41 (GT-004)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('GT-004', 'Pegasus 41', 'Nike',
          'Running', null, null,
          false, false, 5, 'GT-004~zapatilla-06')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Gris / azul', 'GT-004',
         529900, 0, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/zapatilla_06.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('39', 'disponible'), ('40', 'disponible'), ('41', 'disponible'), ('42', 'disponible'), ('43', 'disponible'), ('44', 'disponible')) as t(talla, anterior);

-- Ultraboost Light (GT-005)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('GT-005', 'Ultraboost Light', 'Adidas',
          'Running', null, null,
          false, true, 6, 'GT-005~zapatilla-07')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Marfil / lima', 'GT-005',
         689900, 0, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/zapatilla_07.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('41', 'disponible'), ('42', 'disponible'), ('43', 'disponible'), ('40', 'agotada'), ('44', 'agotada')) as t(talla, anterior);

-- Air Jordan 4 Retro (GT-006)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('GT-006', 'Air Jordan 4 Retro', 'Jordan',
          'Urbanas', null, null,
          false, false, 7, 'GT-006~zapatilla-08')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Gris cemento', 'GT-006',
         1249900, 0, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/editadas/zapatilla_08.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('40', 'agotada'), ('41', 'agotada'), ('42', 'agotada'), ('43', 'agotada')) as t(talla, anterior);

-- Dunk Low Retro (GT-007)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('GT-007', 'Dunk Low Retro', 'Nike',
          'Urbanas', null, null,
          true, false, 8, 'GT-007~zapatilla-09')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Negro / blanco', 'GT-007',
         549900, 0, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/zapatilla_09.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('38', 'disponible'), ('39', 'disponible'), ('40', 'disponible'), ('41', 'disponible'), ('42', 'disponible'), ('43', 'disponible'), ('44', 'agotada')) as t(talla, anterior);

-- 550 (GT-008)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('GT-008', '550', 'New Balance',
          'Deportivas', null, null,
          false, true, 9, 'GT-008~zapatilla-10')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Marfil / azul', 'GT-008',
         519900, 0, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/zapatilla_10.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('38', 'disponible'), ('39', 'disponible'), ('40', 'disponible'), ('41', 'disponible'), ('42', 'disponible'), ('43', 'agotada')) as t(talla, anterior);

-- Ultraboost Light (GT-005)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('GT-005', 'Ultraboost Light', 'Adidas',
          'Running', null, null,
          false, true, 10, 'GT-005~zapatilla-11')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Marfil / lima', 'GT-005',
         689900, 0, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/editadas/zapatilla_11.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('41', 'disponible'), ('42', 'disponible'), ('43', 'disponible'), ('40', 'agotada'), ('44', 'agotada')) as t(talla, anterior);

-- Air Jordan 4 Retro (GT-006)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('GT-006', 'Air Jordan 4 Retro', 'Jordan',
          'Urbanas', null, null,
          false, false, 11, 'GT-006~zapatilla-12')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Gris cemento', 'GT-006',
         1249900, 1599900, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/zapatilla_12.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('40', 'agotada'), ('41', 'agotada'), ('42', 'agotada'), ('43', 'agotada')) as t(talla, anterior);

-- Dunk Low Retro (GT-007)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('GT-007', 'Dunk Low Retro', 'Nike',
          'Urbanas', null, null,
          true, false, 12, 'GT-007~zapatilla-13')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Negro / blanco', 'GT-007',
         549900, 0, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/zapatilla_13.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('38', 'disponible'), ('39', 'disponible'), ('40', 'disponible'), ('41', 'disponible'), ('42', 'disponible'), ('43', 'disponible'), ('44', 'agotada')) as t(talla, anterior);

-- 550 (GT-008)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('GT-008', '550', 'New Balance',
          'Deportivas', null, null,
          false, true, 13, 'GT-008~zapatilla-14')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Marfil / azul', 'GT-008',
         519900, 0, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/editadas/zapatilla_14.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('38', 'disponible'), ('39', 'disponible'), ('40', 'disponible'), ('41', 'disponible'), ('42', 'disponible'), ('43', 'agotada')) as t(talla, anterior);

-- SAMBA (ADD-SAM)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('ADD-SAM', 'SAMBA', 'Adidas',
          'Urbanas', null, null,
          true, true, 14, 'ADD-SAM~zapatilla-15')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Rosa / blanco / beigh', 'ADD-SAM',
         120000, 290000, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/zapatilla_15.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('38', 'disponible'), ('39', 'disponible'), ('40', 'disponible'), ('41', 'disponible'), ('42', 'disponible'), ('43', 'disponible'), ('44', 'agotada'), ('45', 'agotada')) as t(talla, anterior);

-- LCS Retro Classic (LCS-RET-01)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('LCS-RET-01', 'LCS Retro Classic', 'Le Coq Sportif',
          'Casual / Urbanas', null, null,
          true, true, 15, 'LCS-RET-01~zapatilla-16')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Blanco / Rojo / Azul / Beis', 'LCS-RET-01',
         120000, 0, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/zapatilla_16.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('36', 'disponible'), ('37', 'disponible'), ('38', 'disponible'), ('39', 'disponible'), ('40', 'disponible'), ('41', 'disponible'), ('42', 'disponible'), ('43', 'disponible'), ('44', 'disponible')) as t(talla, anterior);

-- Air Jordan 1 Retro High OG (GT-001)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('GT-001', 'Air Jordan 1 Retro High OG', 'Jordan',
          'Urbanas', null, null,
          true, true, 16, 'GT-001~zapatilla-17')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Rojo / blanco / negro', 'GT-001',
         120000, 290000, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/zapatilla_17.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('38', 'disponible'), ('39', 'disponible'), ('40', 'disponible'), ('41', 'disponible'), ('42', 'disponible'), ('43', 'disponible'), ('44', 'agotada'), ('45', 'agotada')) as t(talla, anterior);

-- Air Force 1 '07 (GT-002)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('GT-002', 'Air Force 1 ''07', 'CAMBIARRRRRRRRRRRRRRRR IMAGEN 18',
          'Casuales', null, null,
          true, false, 17, 'GT-002~zapatilla-18')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Blanco', 'GT-002',
         132900, 290000, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/zapatilla_18.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('36', 'disponible'), ('37', 'disponible'), ('38', 'disponible'), ('39', 'disponible'), ('40', 'disponible'), ('41', 'disponible'), ('42', 'disponible'), ('43', 'disponible'), ('44', 'disponible')) as t(talla, anterior);

-- Samba OG (GT-003)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('GT-003', 'Samba OG', 'Adidas',
          'Casuales', null, null,
          true, true, 18, 'GT-003~zapatilla-19')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Blanco / verde', 'GT-003',
         459900, 0, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/zapatilla_19.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('37', 'disponible'), ('38', 'disponible'), ('39', 'disponible'), ('40', 'disponible'), ('41', 'disponible'), ('42', 'agotada')) as t(talla, anterior);

-- Pegasus 41 (GT-004)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('GT-004', 'Pegasus 41', 'Nike',
          'Running', null, null,
          false, false, 19, 'GT-004~zapatilla-20')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Gris / azul', 'GT-004',
         529900, 0, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/zapatilla_20.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('39', 'disponible'), ('40', 'disponible'), ('41', 'disponible'), ('42', 'disponible'), ('43', 'disponible'), ('44', 'disponible')) as t(talla, anterior);

-- Ultraboost Light (GT-005)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('GT-005', 'Ultraboost Light', 'Adidas',
          'Running', null, null,
          false, true, 20, 'GT-005~zapatilla-21')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Marfil / lima', 'GT-005',
         689900, 0, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/zapatilla_21.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('41', 'disponible'), ('42', 'disponible'), ('43', 'disponible'), ('40', 'agotada'), ('44', 'agotada')) as t(talla, anterior);

-- Air Jordan 4 Retro (GT-006)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('GT-006', 'Air Jordan 4 Retro', 'Jordan',
          'Urbanas', null, null,
          false, false, 21, 'GT-006~zapatilla-22')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Gris cemento', 'GT-006',
         1249900, 0, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/zapatilla_22.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('40', 'agotada'), ('41', 'agotada'), ('42', 'agotada'), ('43', 'agotada')) as t(talla, anterior);

-- Dunk Low Retro (GT-007)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('GT-007', 'Dunk Low Retro', 'Nike',
          'Urbanas', null, null,
          true, false, 22, 'GT-007~zapatilla-23')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Negro / blanco', 'GT-007',
         549900, 0, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/zapatilla_23.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('38', 'disponible'), ('39', 'disponible'), ('40', 'disponible'), ('41', 'disponible'), ('42', 'disponible'), ('43', 'disponible'), ('44', 'agotada')) as t(talla, anterior);

-- 550 (GT-008)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('GT-008', '550', 'New Balance',
          'Deportivas', null, null,
          false, true, 23, 'GT-008~zapatilla-24')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Marfil / azul', 'GT-008',
         519900, 0, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/editadas/zapatilla_24.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('38', 'disponible'), ('39', 'disponible'), ('40', 'disponible'), ('41', 'disponible'), ('42', 'disponible'), ('43', 'agotada')) as t(talla, anterior);

-- Ultraboost Light (GT-005)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('GT-005', 'Ultraboost Light', 'Adidas',
          'Running', null, null,
          false, true, 24, 'GT-005~zapatilla-25')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Marfil / lima', 'GT-005',
         689900, 0, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/zapatilla_25.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('41', 'disponible'), ('42', 'disponible'), ('43', 'disponible'), ('40', 'agotada'), ('44', 'agotada')) as t(talla, anterior);

-- Air Jordan 4 Retro (GT-006)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('GT-006', 'Air Jordan 4 Retro', 'Jordan',
          'Urbanas', null, null,
          false, false, 25, 'GT-006~zapatilla-26')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Gris cemento', 'GT-006',
         1249900, 1599900, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/zapatilla_26.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('40', 'agotada'), ('41', 'agotada'), ('42', 'agotada'), ('43', 'agotada')) as t(talla, anterior);

-- Dunk Low Retro (GT-007)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('GT-007', 'Dunk Low Retro', 'Nike',
          'Urbanas', null, null,
          true, false, 26, 'GT-007~zapatilla-27')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Negro / blanco', 'GT-007',
         549900, 0, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/editadas/zapatilla_27.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('38', 'disponible'), ('39', 'disponible'), ('40', 'disponible'), ('41', 'disponible'), ('42', 'disponible'), ('43', 'disponible'), ('44', 'agotada')) as t(talla, anterior);

-- 550 (GT-008)
with nuevo_producto as (
  insert into public.productos
    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,
     destacado, nuevo_ingreso, orden, clave_legado)
  values ('GT-008', '550', 'New Balance',
          'Deportivas', null, null,
          false, true, 27, 'GT-008~zapatilla-28')
  returning id
)
, nueva_variante as (
  insert into public.variantes
    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)
  select id, 'Marfil / azul', 'GT-008',
         519900, 0, 0, 'unica'
    from nuevo_producto
  returning id
)
, nuevas_fotos as (
  insert into public.fotos (variante_id, ruta, orden)
  select nueva_variante.id, f.ruta, f.orden from nueva_variante,
    (values ('assets/images/productos/zapatilla_28.webp', 0)) as f(ruta, orden)
  returning 1
)
insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)
select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,
  (values ('38', 'disponible'), ('39', 'disponible'), ('40', 'disponible'), ('41', 'disponible'), ('42', 'disponible'), ('43', 'agotada')) as t(talla, anterior);

commit;