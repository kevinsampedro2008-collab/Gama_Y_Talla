-- Comprueba 20261109010000 sobre los datos de datos_previos_17.sql. SOLO LOCAL.
-- Escribe como administrador ficticio y lo deshace al final; el esquema de la instantánea se
-- borra. Termina con error ante el primer fallo.
--
--   docker exec -i supabase_db_Yeny_Oficial psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/pruebas/reproducir/verificar_migracion_17.sql
\set ON_ERROR_STOP 1
begin;
create or replace function pg_temp.exigir(p_prueba text, p_ok boolean, p_detalle text default '')
returns void language plpgsql as $$
begin
  if coalesce(p_ok, false) then raise notice 'OK     %', p_prueba;
  else raise exception 'FALLA  % %', p_prueba, p_detalle; end if;
end;
$$;
create or replace function pg_temp.rechazo(p_sql text)
returns text language plpgsql as $$
declare v_estado text; v_mensaje text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_estado = returned_sqlstate, v_mensaje = message_text;
    return v_estado || ' ' || v_mensaje;
  end;
  return 'ACEPTADA';
end;
$$;
-- Formulario completo de una zapatilla tal como está guardada (sin «publico»: cliente anterior).
create or replace function pg_temp.formulario(p_id uuid)
returns jsonb language sql as $$
  select jsonb_build_object('id', p.id, 'nombre', p.nombre, 'marca', p.marca, 'categoria', p.categoria, 'segmento', p.segmento,
           'variantes', (select jsonb_agg(jsonb_build_object('id', v.id, 'color', v.color, 'precio', v.precio, 'activa', v.activa, 'orden', v.orden,
                                    'tallas', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'talla', t.talla, 'activa', t.activa, 'activa_original', t.activa)), '[]')
                                                 from public.tallas t where t.variante_id = v.id),
                                    'fotos', (select coalesce(jsonb_agg(jsonb_build_object('ruta', f.ruta)), '[]') from public.fotos f where f.variante_id = v.id))
                         order by v.orden) from public.variantes v where v.producto_id = p.id))
    from public.productos p where p.id = p_id;
$$;
grant execute on all functions in schema pg_temp to public;

do $$
declare
  v_admin   uuid := '00000000-1700-0000-0000-0000000000ad';
  v_leg     uuid := '10000000-1700-0000-0000-000000000001';
  v_h       uuid := '10000000-1700-0000-0000-000000000002';
  v_r       jsonb;
  v_texto   text;
begin
  -- La migración no toca ninguna fila: vista, productos, colores, tallas, fotos e historial idénticos.
  perform pg_temp.exigir('M1 la vista pública es idéntica (mismos id, códigos, colores, tallas, fotos y público)',
    (select count(*) = 2 and bool_and(to_jsonb(c) = a.fila)
       from pruebas_17.vista a join public.catalogo_publico c on c.id = a.fila ->> 'id'));
  perform pg_temp.exigir('M2 filas idénticas (identidad, claves, versiones, actualizado_en)',
    (select count(*) = 3 and bool_and(to_jsonb(p) = to_jsonb(s)) from public.productos p join pruebas_17.productos s using (id))
    and (select count(*) = 3 and bool_and(to_jsonb(v) = to_jsonb(s)) from public.variantes v join pruebas_17.variantes s using (id))
    and (select count(*) = 3 and bool_and(to_jsonb(t) = to_jsonb(s)) from public.tallas t join pruebas_17.tallas s using (id))
    and (select count(*) = 2 and bool_and(to_jsonb(f) = to_jsonb(s)) from public.fotos f join pruebas_17.fotos s using (id)));
  perform pg_temp.exigir('M3 el historial no cambia',
    (select count(*) from public.historial) = (select count(*) from pruebas_17.historial)
    and not exists (select * from public.historial except select * from pruebas_17.historial));
  perform pg_temp.exigir('M4 el heredado sigue sin público y visible en la tienda («Todos»)',
    (select publico is null from public.productos where id = v_leg)
    and exists (select 1 from public.catalogo_publico c where c.id = 'LEG-17-UNO' and c.publico is null));
  perform pg_temp.exigir('M5 la restricción admite unisex y rechaza otros valores',
    pg_get_constraintdef((select oid from pg_constraint where conname = 'productos_publico_valido')) ~ 'unisex');

  insert into public.administradores (user_id, nombre) values (v_admin, 'Administración ficticia 17');
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- El heredado sin público: el panel pide clasificarlo al guardarlo o publicarlo.
  v_texto := pg_temp.rechazo(format($q$select public.fn_admin_guardar_producto(pg_temp.formulario(%L), %s, gen_random_uuid())$q$,
                                    v_leg, (select version from public.productos where id = v_leg)));
  perform pg_temp.exigir('M6 guardar el heredado sin enviar público se rechaza', v_texto ~ '^PT422 .*todavía no lo tiene', v_texto);
  v_texto := pg_temp.rechazo(format($q$select public.fn_admin_guardar_producto(pg_temp.formulario(%L) || '{"publico": null}', %s, gen_random_uuid())$q$,
                                    v_leg, (select version from public.productos where id = v_leg)));
  perform pg_temp.exigir('M6 guardar el heredado con público null se rechaza', v_texto ~ '^PT422 Elige el público', v_texto);
  v_texto := pg_temp.rechazo(format($q$select public.fn_admin_estado_producto(%L, 'publicar', %s, gen_random_uuid())$q$,
                                    v_leg, (select version from public.productos where id = v_leg)));
  perform pg_temp.exigir('M7 publicar el heredado sin público se rechaza y lo dice', v_texto ~ '^PT422 Para publicarla falta: el público', v_texto);
  v_texto := pg_temp.rechazo(format($q$select public.fn_admin_estado_producto(%L, 'ocultar', %s, gen_random_uuid())$q$,
                                    v_leg, (select version from public.productos where id = v_leg)));
  perform pg_temp.exigir('M7 ocultar el heredado sin público sí se puede', v_texto = 'ACEPTADA', v_texto);

  v_r := public.fn_admin_guardar_producto(pg_temp.formulario(v_leg) || '{"publico": "Unisex"}', (select version from public.productos where id = v_leg), gen_random_uuid());
  perform pg_temp.exigir('M8 clasificarlo como Unisex guarda «unisex» y conserva su identidad pública',
    (v_r ->> 'publico_obligatorio')::boolean
    and (select publico = 'unisex' and clave_catalogo = 'LEG-17-UNO' and codigo_interno = 'GT-97001' from public.productos where id = v_leg)
    and (select clave_catalogo = 'unica' from public.variantes where id = '20000000-1700-0000-0000-000000000001'), v_r::text);
  -- Ya clasificado (y completo: foto y talla activa en el mismo color), se vuelve a publicar.
  v_r := public.fn_admin_estado_producto(v_leg, 'publicar', (select version from public.productos where id = v_leg), gen_random_uuid());
  perform pg_temp.exigir('M8 clasificado, se publica', v_r ->> 'estado' = 'aplicada' and (v_r ->> 'activo')::boolean, v_r::text);

  -- Un cliente anterior que no envía «publico» conserva la clasificación existente.
  v_r := public.fn_admin_guardar_producto(pg_temp.formulario(v_h), (select version from public.productos where id = v_h), gen_random_uuid());
  perform pg_temp.exigir('M9 sin el campo, un producto ya clasificado conserva «hombre»',
    (select publico = 'hombre' from public.productos where id = v_h), v_r::text);
  v_texto := pg_temp.rechazo(format($q$select public.fn_admin_guardar_producto(pg_temp.formulario(%L) || '{"publico": ""}', %s, gen_random_uuid())$q$,
                                    v_h, (select version from public.productos where id = v_h)));
  perform pg_temp.exigir('M10 quitar la clasificación con vacío se rechaza', v_texto ~ '^PT422 Elige el público', v_texto);
  reset role;

  perform pg_temp.exigir('M11 la tienda ve «unisex» con el MISMO id',
    exists (select 1 from public.catalogo_publico c where c.id = 'LEG-17-UNO' and c.publico = 'unisex'));
  perform pg_temp.exigir('M12 la talla confirmada no se movió',
    (select to_jsonb(t) = to_jsonb(s) from public.tallas t join pruebas_17.tallas s using (id) where t.id = '30000000-1700-0000-0000-000000000001'));
end;
$$;
rollback;
drop schema if exists pruebas_17 cascade;
select 'verificación de la migración 17: correcta' as resultado;
