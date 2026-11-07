-- Etapa 13 · Pruebas del vencimiento y de los escenarios de fechas.
-- Cada consulta se acota a la variante del caso: la base puede tener ya catalogo.
-- Cada prueba falla ruidosamente si no se cumple. Se ejecuta dentro de una
-- transacción que se deshace al final: no deja rastro.

begin;

create or replace function pg_temp.exigir(p_prueba text, p_ok boolean, p_detalle text default '')
returns void language plpgsql as $$
begin
  if p_ok then
    raise notice 'OK     %', p_prueba;
  else
    raise exception 'FALLA  % %', p_prueba, p_detalle;
  end if;
end;
$$;

-- Datos de trabajo
insert into public.productos (nombre, marca, clave_legado) values ('MODELO PRUEBA', 'Marca', 'prueba-vigencia');
insert into public.variantes (producto_id, codigo_variante, id_legado, precio)
  select id, codigo_interno || '-A', 'unica', 100000 from public.productos where clave_legado = 'prueba-vigencia';

create temporary table ctx as
  select v.id as variante_id from public.variantes v
    join public.productos p on p.id = v.producto_id
   where p.clave_legado = 'prueba-vigencia';

-- ---------------------------------------------------------------- estados
insert into public.tallas (variante_id, talla, estado, vigencia_desde, vigencia_horas)
select variante_id, '40', 'CONFIRMADA', now() - interval '1 hour', 48 from ctx;

insert into public.tallas (variante_id, talla, estado, vigencia_desde, vigencia_horas)
select variante_id, '41', 'CONFIRMADA', now() - interval '49 hours', 48 from ctx;

insert into public.tallas (variante_id, talla, estado)
select variante_id, '42', 'AGOTADA' from ctx;

insert into public.tallas (variante_id, talla, estado)
select variante_id, '43', 'REVISAR' from ctx;

do $$
declare e public.estado_publico;
begin
  select public.fn_estado_publico(estado, vigencia_desde, vence_en) into e
    from public.tallas where talla = '40' and variante_id = (select variante_id from ctx);
  perform pg_temp.exigir('Confirmada hace 1 h con 48 h de vigencia -> DISPONIBLE', e = 'DISPONIBLE', e::text);

  select public.fn_estado_publico(estado, vigencia_desde, vence_en) into e
    from public.tallas where talla = '41' and variante_id = (select variante_id from ctx);
  perform pg_temp.exigir('Vencida (49 h con 48 h) -> POR_REVISAR, nunca AGOTADO', e = 'POR_REVISAR', e::text);

  select public.fn_estado_publico(estado, vigencia_desde, vence_en) into e
    from public.tallas where talla = '42' and variante_id = (select variante_id from ctx);
  perform pg_temp.exigir('Agotada -> AGOTADO', e = 'AGOTADO', e::text);

  select public.fn_estado_publico(estado, vigencia_desde, vence_en) into e
    from public.tallas where talla = '43' and variante_id = (select variante_id from ctx);
  perform pg_temp.exigir('Sin fecha fiable -> POR_REVISAR', e = 'POR_REVISAR', e::text);
end;
$$;

-- ------------------------------------------------- el agotado no caduca solo
do $$
declare e public.estado_publico;
begin
  update public.tallas set vigencia_desde = now() - interval '600 hours' where talla = '42' and variante_id = (select variante_id from ctx);
  select public.fn_estado_publico(estado, vigencia_desde, vence_en) into e
    from public.tallas where talla = '42' and variante_id = (select variante_id from ctx);
  perform pg_temp.exigir('Agotada con fecha antiquisima -> sigue AGOTADO', e = 'AGOTADO', e::text);
end;
$$;

-- ---------------------------------------------- límite exacto de la vigencia
do $$
declare e public.estado_publico;
begin
  update public.tallas
     set estado = 'CONFIRMADA', vigencia_desde = now() - interval '47 hours', vigencia_horas = 48
   where talla = '43' and variante_id = (select variante_id from ctx);
  select public.fn_estado_publico(estado, vigencia_desde, vence_en) into e from public.tallas where talla = '43' and variante_id = (select variante_id from ctx);
  perform pg_temp.exigir('A las 47 h de 48 -> todavia DISPONIBLE', e = 'DISPONIBLE', e::text);

  update public.tallas set vigencia_horas = 60 where talla = '43' and variante_id = (select variante_id from ctx);
  select public.fn_estado_publico(estado, vigencia_desde, vence_en) into e from public.tallas where talla = '43' and variante_id = (select variante_id from ctx);
  perform pg_temp.exigir('Misma fila ampliada a 60 h -> sigue DISPONIBLE', e = 'DISPONIBLE', e::text);
end;
$$;

-- ------------------------------------------------- escenarios A y B (fechas)
insert into public.administradores (user_id, nombre) values ('11111111-1111-1111-1111-111111111111', 'Prueba');
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

do $$
declare
  v_id uuid;
  v    public.tallas;
  e    public.estado_publico;
begin
  select id into v_id from public.tallas where talla = '41' and variante_id = (select variante_id from ctx);   -- estaba vencida

  -- ESCENARIO A: reaparece en una publicación nueva de hace 2 horas.
  v := public.fn_confirmar_por_publicacion(v_id, now() - interval '2 hours');
  e := public.fn_estado_publico(v.estado, v.vigencia_desde, v.vence_en);
  perform pg_temp.exigir('A) Publicacion nueva -> DISPONIBLE', e = 'DISPONIBLE', e::text);
  perform pg_temp.exigir('A) La vigencia arranca en la publicacion',
                         v.vigencia_desde = v.publicado_en);
  perform pg_temp.exigir('A) Origen registrado como publicacion', v.origen = 'publicacion');

  -- ESCENARIO B: el caso que preocupaba. La publicación es de hace 5 días, pero
  -- el proveedor acaba de confirmar: la vigencia debe arrancar AHORA.
  update public.tallas
     set estado = 'REVISAR', publicado_en = now() - interval '120 hours', vigencia_desde = null
   where id = v_id;

  v := public.fn_confirmar_por_proveedor(v_id);
  e := public.fn_estado_publico(v.estado, v.vigencia_desde, v.vence_en);
  perform pg_temp.exigir('B) Confirmacion directa -> DISPONIBLE pese a publicacion de hace 5 dias',
                         e = 'DISPONIBLE', e::text);
  perform pg_temp.exigir('B) La vigencia arranca en la confirmacion, no en la publicacion',
                         v.vigencia_desde = v.confirmado_en and v.vigencia_desde > v.publicado_en);
  perform pg_temp.exigir('B) Se conserva la publicacion original como dato historico',
                         v.publicado_en is not null);
  perform pg_temp.exigir('B) Origen registrado como proveedor', v.origen = 'proveedor');

  -- Agotar y comprobar que deja de tener reloj.
  v := public.fn_marcar_agotada(v_id, 'Confirmado por el proveedor');
  perform pg_temp.exigir('Agotar borra el reloj de vigencia',
                         v.vence_en is null and v.vigencia_desde is null);
end;
$$;

-- -------------------------------------------------- restricción de integridad
do $$
begin
  begin
    insert into public.tallas (variante_id, talla, estado)
      select variante_id, '99', 'CONFIRMADA' from ctx;   -- sin vigencia_desde
    perform pg_temp.exigir('Confirmada sin fecha debe rechazarse', false);
  exception when check_violation then
    perform pg_temp.exigir('Confirmada sin fecha se rechaza', true);
  end;

  begin
    insert into public.tallas (variante_id, talla) select variante_id, '40' from ctx;
    perform pg_temp.exigir('Talla repetida en la misma variante debe rechazarse', false);
  exception when unique_violation then
    perform pg_temp.exigir('Talla repetida en la misma variante se rechaza', true);
  end;

  begin
    insert into public.tallas (variante_id, talla, vigencia_horas)
      select variante_id, '98', 72 from ctx;             -- por encima de 60
    perform pg_temp.exigir('Vigencia mayor de 60 h debe rechazarse', false);
  exception when check_violation then
    perform pg_temp.exigir('Vigencia mayor de 60 h se rechaza', true);
  end;
end;
$$;

-- ------------------------------------------------ desactivar no borra nunca
do $$
declare v_antes bigint; v_despues bigint; v_hist bigint;
begin
  select count(*) into v_antes from public.tallas;
  update public.tallas set activa = false where talla = '40' and variante_id = (select variante_id from ctx);
  select count(*) into v_despues from public.tallas;
  perform pg_temp.exigir('Desactivar conserva la fila', v_antes = v_despues);

  select count(*) into v_hist from public.historial where tabla = 'tallas';
  perform pg_temp.exigir('El historial registro los cambios de tallas', v_hist > 0,
                         'filas=' || v_hist);

  update public.tallas set activa = true where talla = '40' and variante_id = (select variante_id from ctx);
  perform pg_temp.exigir('Reactivar reutiliza la MISMA fila (sin duplicar)',
                         (select count(*) from public.tallas t
                            where t.talla = '40'
                              and t.variante_id = (select variante_id from ctx)) = 1);
end;
$$;

rollback;
