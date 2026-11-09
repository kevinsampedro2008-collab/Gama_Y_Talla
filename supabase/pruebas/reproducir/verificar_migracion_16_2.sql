-- Comprueba 20261108030000 sobre los datos de datos_previos_16_2.sql. SOLO LOCAL.
-- Escribe (renombra códigos como administrador ficticio) y lo deshace al final; el esquema de
-- la instantánea se borra. Termina con error ante el primer fallo.
--
--   docker exec -i supabase_db_Yeny_Oficial psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/pruebas/reproducir/verificar_migracion_16_2.sql
\set ON_ERROR_STOP 1
begin;
create or replace function pg_temp.exigir(p_prueba text, p_ok boolean, p_detalle text default '')
returns void language plpgsql as $$
begin
  if coalesce(p_ok, false) then raise notice 'OK     %', p_prueba;
  else raise exception 'FALLA  % %', p_prueba, p_detalle; end if;
end;
$$;

do $$
declare v_txt text; v_n integer; v_admin uuid := '00000000-1620-0000-0000-0000000000ad'; v_r jsonb; v_datos jsonb;
begin
  -- ---------------------------------------------------------- identidad pública
  perform pg_temp.exigir('M1 los 4 colores públicos conservan exactamente su id de producto y de color',
    (select count(*) = 4 from pruebas_16_2.publico a
       join (select c.id as producto, v ->> 'id' as variante, v ->> 'codigoVariante' as codigo
               from public.catalogo_publico c, jsonb_array_elements(c.variantes) v) b
         on b.producto = a.producto and b.variante = a.variante));
  perform pg_temp.exigir('M2 las claves heredadas no pasan a mayúsculas',
    exists (select 1 from public.catalogo_publico where id = 'LEG-162-DOS~foto-x')
    and (select clave_catalogo from public.productos where id = '10000000-1620-0000-0000-000000000002') = 'LEG-162-DOS~foto-x'
    and (select clave_catalogo from public.variantes where id = '20000000-1620-0000-0000-000000000001') = 'unica');
  perform pg_temp.exigir('M3 producto del panel: su clave es el código que tenía',
    (select clave_catalogo from public.productos where id = '10000000-1620-0000-0000-000000000003') = 'GT-90003'
    and (select clave_catalogo from public.variantes where id = '20000000-1620-0000-0000-000000000032') = 'GT-90003-B');
  perform pg_temp.exigir('M4 UUID, clave_legado, id_legado y referencias del proveedor intactos',
    (select bool_and(p.clave_legado is not distinct from s.clave_legado and p.descripcion is not distinct from s.descripcion)
       from public.productos p join pruebas_16_2.productos s using (id))
    and (select bool_and(v.id_legado is not distinct from s.id_legado and v.referencia_variante is not distinct from s.referencia_variante)
           from public.variantes v join pruebas_16_2.variantes s using (id)));

  -- ---------------------------------------------------------- mayúsculas y versión
  perform pg_temp.exigir('M5 modelo, marca, categoría y color en mayúsculas, con tildes y Ñ',
    (select nombre = 'SAMBA NIÑO' and marca = 'ADIDAS' and categoria = 'URBANAS' from public.productos where id = '10000000-1620-0000-0000-000000000001')
    and (select nombre = 'ÑANDÚ RETRO' and marca = 'LE COQ' and categoria = 'CASUAL' and codigo_interno = 'GT-90002' from public.productos where id = '10000000-1620-0000-0000-000000000002')
    and (select color = 'BEIGE/BLANCAS' from public.variantes where id = '20000000-1620-0000-0000-000000000001')
    and (select color = 'CAFÉ / AÑIL' and codigo_variante = 'GT-90002-A' from public.variantes where id = '20000000-1620-0000-0000-000000000002'));
  perform pg_temp.exigir('M6 la descripción y las referencias del proveedor no se tocan',
    (select descripcion = 'Descripción en minúsculas: no se toca.' from public.productos where id = '10000000-1620-0000-0000-000000000001')
    and (select referencia_variante = 'ref-prov-1' from public.variantes where id = '20000000-1620-0000-0000-000000000001'));
  perform pg_temp.exigir('M7 la versión sube solo en los productos normalizados',
    (select bool_and(case when p.id = '10000000-1620-0000-0000-000000000004' then p.version = s.version else p.version = s.version + 1 end
                     and p.ultima_operacion is not distinct from s.ultima_operacion)
       from public.productos p join pruebas_16_2.productos s using (id)));
  perform pg_temp.exigir('M8 los colores ya en mayúsculas conservan actualizado_en; los normalizados lo actualizan',
    (select v.actualizado_en = s.actualizado_en from public.variantes v join pruebas_16_2.variantes s using (id)
      where v.id = '20000000-1620-0000-0000-000000000004')
    and (select v.actualizado_en > s.actualizado_en and v.color = 'NEGRO' from public.variantes v join pruebas_16_2.variantes s using (id)
      where v.id = '20000000-1620-0000-0000-000000000031'));

  -- ---------------------------------------------------------- tallas, fotos, historial
  perform pg_temp.exigir('M9 tallas idénticas (estado, fechas, vigencias, origen, actualizado_en)',
    (select count(*) = 5 from public.tallas t join pruebas_16_2.tallas s using (id)
      where (t.estado, t.publicado_en, t.registrado_en, t.confirmado_en, t.vigencia_desde, t.vence_en, t.origen, t.activa, t.actualizado_en)
            is not distinct from (s.estado, s.publicado_en, s.registrado_en, s.confirmado_en, s.vigencia_desde, s.vence_en, s.origen, s.activa, s.actualizado_en)));
  perform pg_temp.exigir('M10 fotos idénticas (rutas por UUID)',
    (select count(*) = 2 from public.fotos f join pruebas_16_2.fotos s using (id) where (f.variante_id, f.ruta, f.orden) = (s.variante_id, s.ruta, s.orden)));
  perform pg_temp.exigir('M11 historial: solo las normalizaciones, en el lote de la migración, y nada de las claves',
    (select count(*) > 0 and bool_and(h.lote = 'a1630000-0000-4000-8000-000000000162') and bool_and(not ('clave_catalogo' = any (h.cambios)))
       from public.historial h where h.id > (select ultimo from pruebas_16_2.historial)));

  -- ---------------------------------------------------------- protección de la clave
  begin
    update public.productos set clave_catalogo = 'OTRA' where id = '10000000-1620-0000-0000-000000000001';
    perform pg_temp.exigir('M12 la clave de producto no se puede cambiar', false);
  exception when sqlstate 'PT422' then perform pg_temp.exigir('M12 la clave de producto no se puede cambiar', true);
  end;
  begin
    update public.variantes set clave_catalogo = 'otra' where id = '20000000-1620-0000-0000-000000000001';
    perform pg_temp.exigir('M13 la clave de color no se puede cambiar', false);
  exception when sqlstate 'PT422' then perform pg_temp.exigir('M13 la clave de color no se puede cambiar', true);
  end;

  -- ---------------------------------------------------------- renombrar con el RPC
  insert into public.administradores (user_id, nombre) values (v_admin, 'Administración ficticia 16.2');
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select jsonb_build_object('id', p.id, 'codigo_interno', 'zap-propio-1', 'nombre', 'forum low', 'marca', 'adidas', 'categoria', 'urbanas',
           'variantes', (select jsonb_agg(jsonb_build_object('id', v.id, 'color', v.color, 'precio', v.precio, 'activa', v.activa, 'orden', v.orden,
                                    'codigo_variante', case when v.orden = 0 then ' col-propio-1 ' else v.codigo_variante end,
                                    'tallas', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'talla', t.talla, 'activa', t.activa, 'activa_original', t.activa)), '[]')
                                                 from public.tallas t where t.variante_id = v.id),
                                    'fotos', (select coalesce(jsonb_agg(jsonb_build_object('ruta', f.ruta)), '[]') from public.fotos f where f.variante_id = v.id))
                         order by v.orden) from public.variantes v where v.producto_id = p.id))
    into v_datos from public.productos p where p.id = '10000000-1620-0000-0000-000000000003';
  v_r := public.fn_admin_guardar_producto(v_datos, (select version from public.productos where id = '10000000-1620-0000-0000-000000000003'), gen_random_uuid());
  reset role;
  perform pg_temp.exigir('M14 el RPC cambia ambos códigos, en mayúsculas y sin espacios', v_r ->> 'codigo_interno' = 'ZAP-PROPIO-1'
    and (select codigo_variante = 'COL-PROPIO-1' from public.variantes where id = '20000000-1620-0000-0000-000000000031')
    and (select codigo_variante = 'GT-90003-B' from public.variantes where id = '20000000-1620-0000-0000-000000000032'), v_r::text);
  perform pg_temp.exigir('M15 tras renombrar, la tienda ve los mismos ids y los códigos nuevos',
    exists (select 1 from public.catalogo_publico c, jsonb_array_elements(c.variantes) v
             where c.id = 'GT-90003' and c."codigoInterno" = 'ZAP-PROPIO-1' and v ->> 'id' = 'GT-90003-A' and v ->> 'codigoVariante' = 'COL-PROPIO-1'));
  perform pg_temp.exigir('M16 renombrar no toca tallas ni fotos',
    (select count(*) = 5 from public.tallas t join pruebas_16_2.tallas s using (id)
      where (t.estado, t.vigencia_desde, t.vence_en, t.confirmado_en, t.activa, t.actualizado_en) is not distinct from (s.estado, s.vigencia_desde, s.vence_en, s.confirmado_en, s.activa, s.actualizado_en))
    and (select count(*) = 2 from public.fotos f join pruebas_16_2.fotos s using (id) where f.ruta = s.ruta));
  perform pg_temp.exigir('M17 el historial registra el cambio de código con el lote de la operación',
    exists (select 1 from public.historial h where h.tabla = 'productos' and h.fila_id = '10000000-1620-0000-0000-000000000003'
             and 'codigo_interno' = any (h.cambios) and h.autor = v_admin));

  -- Generador: un código personalizado que coincide con el siguiente GT no provoca colisión.
  select 'GT-' || lpad((last_value + 1)::text, 5, '0') into v_txt from public.seq_codigo_producto;
  update public.productos set codigo_interno = v_txt where id = '10000000-1620-0000-0000-000000000004';
  insert into public.productos (nombre, marca) values ('nuevo tras migrar', 'marca') returning codigo_interno into v_txt;
  perform pg_temp.exigir('M18 el generador salta el código personalizado', v_txt <> (select codigo_interno from public.productos where id = '10000000-1620-0000-0000-000000000004'), v_txt);
  perform pg_temp.exigir('M19 un producto nuevo tiene como clave su UUID y nombre en mayúsculas',
    (select clave_catalogo = id::text and nombre = 'NUEVO TRAS MIGRAR' and categoria = 'OTRAS' from public.productos where codigo_interno = v_txt));
end;
$$;
rollback;
drop schema if exists pruebas_16_2 cascade;
select 'verificación de la migración 16.2: correcta' as resultado;
