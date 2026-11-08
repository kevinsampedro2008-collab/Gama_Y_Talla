-- Etapa 14f.2 · Integridad de tallas y vigencia: formato, borrado, fechas futuras y estado efectivo.
-- Escriben datos y se deshacen al final, PERO el ROLLBACK no devuelve las secuencias:
-- ejecutar SOLO en un entorno local desechable, nunca en el proyecto remoto.
-- Dentro de una transacción now() no avanza: los bordes de tiempo son exactos y reproducibles.

begin;

create or replace function pg_temp.exigir(p_prueba text, p_ok boolean, p_detalle text default '')
returns void language plpgsql as $$
begin
  if p_ok then raise notice 'OK     %', p_prueba;
  else raise exception 'FALLA  % %', p_prueba, p_detalle; end if;
end;
$$;

-- Debe rechazarse por FALTA DE PRIVILEGIO: ni cero filas ni otro error.
create or replace function pg_temp.exigir_denegado(p_prueba text, p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform pg_temp.exigir(p_prueba, false, '-> la consulta fue PERMITIDA');
exception
  when insufficient_privilege then perform pg_temp.exigir(p_prueba, true);
end;
$$;

-- Debe rechazarse con ESE código y un mensaje (o restricción) que cumpla el patrón.
create or replace function pg_temp.exigir_rechazo(p_prueba text, p_sql text, p_estado text, p_patron text)
returns void language plpgsql as $$
declare v_estado text; v_mensaje text; v_restriccion text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_estado = returned_sqlstate, v_mensaje = message_text, v_restriccion = constraint_name;
  end;
  perform pg_temp.exigir(p_prueba,
    v_estado = p_estado and (v_mensaje || ' ' || coalesce(v_restriccion, '')) ~ p_patron,
    format('-> %s', coalesce(v_estado || ' ' || v_mensaje || ' [' || coalesce(v_restriccion, '') || ']', 'la escritura fue ACEPTADA')));
end;
$$;

-- ¿Se acepta esta talla al escribir? Prueba en una subtransacción y la deshace.
create or replace function pg_temp.talla_aceptada(p_variante uuid, p_talla text)
returns boolean language plpgsql as $$
begin
  begin
    insert into public.tallas (variante_id, talla) values (p_variante, p_talla);
    raise exception using errcode = 'P0099';           -- deshace la inserción aceptada
  exception
    when sqlstate 'P0099' then return true;
    when check_violation then return false;
  end;
end;
$$;

grant execute on all functions in schema pg_temp to public;

-- ------------------------------------------------------------- datos
insert into public.administradores (user_id, nombre)
values ('aaaaaaaa-6666-0000-0000-000000000001', 'admin de prueba 60');
insert into public.productos (id, nombre, marca, codigo_interno, activo)
values ('10000000-6666-0000-0000-00000000000a', 'PRUEBA 60', 'Marca', 'PR-60', true);
insert into public.variantes (id, producto_id, codigo_variante, color, precio)
values ('20000000-6666-0000-0000-00000000000a', '10000000-6666-0000-0000-00000000000a', 'PR-60-A', 'Negro', 1000),
       ('20000000-6666-0000-0000-00000000000b', '10000000-6666-0000-0000-00000000000a', 'PR-60-B', 'Blanco', 1000),
       ('20000000-6666-0000-0000-00000000000c', '10000000-6666-0000-0000-00000000000a', 'PR-60-C', 'Rojo', 1000),
       ('20000000-6666-0000-0000-00000000000d', '10000000-6666-0000-0000-00000000000a', 'PR-60-D', 'Azul', 1000);

-- Una fila antigua con vigencia futura (anterior a esta migración). Solo se puede fabricar
-- apagando el disparador, como dueño de la tabla y dentro de esta transacción. Antes se
-- comprueba que estaba activo: al volver a encenderlo no se debe ocultar que no lo estaba.
do $$
begin
  perform pg_temp.exigir('tr_tallas_vigencia está activo antes de empezar',
    exists (select 1 from pg_trigger where tgrelid = 'public.tallas'::regclass and tgname = 'tr_tallas_vigencia' and tgenabled = 'O'));
end;
$$;
alter table public.tallas disable trigger tr_tallas_vigencia;
insert into public.tallas (id, variante_id, talla, estado, publicado_en, vigencia_desde, vigencia_horas, vence_en, nota)
values ('30000000-6666-0000-0000-0000000000f0', '20000000-6666-0000-0000-00000000000d', '44', 'CONFIRMADA',
        now() + interval '5 days', now() + interval '5 days', 48, now() + interval '5 days' + interval '48 hours', 'LEGADO-FUTURO');
alter table public.tallas enable trigger tr_tallas_vigencia;

-- =====================================================================
-- T. Formato de la talla
-- =====================================================================
do $$
declare
  f record;
  v_malas text;
begin
  -- Valor numérico exacto de cada forma admitida, también de las equivalentes no mínimas.
  for f in select * from (values
      ('40', 40::numeric), ('9', 9), ('100', 100), ('0', 0), ('040', 40), ('40,5', 40.5), ('40.5', 40.5),
      ('40,50', 40.5), ('40.50', 40.5), ('40,0', 40), ('8.25', 8.25), ('40,05', 40.05),
      ('40 1/3', 40 + 1::numeric / 3), ('40 2/3', 40 + 2::numeric / 3), ('40 1/2', 40.5), ('40 2/4', 40.5),
      ('40 3/6', 40.5), ('40 3/4', 40.75), ('40 0/3', 40)) as x(t, v)
  loop
    perform pg_temp.exigir(format('T fn_valor_talla(%L) = %s', f.t, round(f.v, 4)), public.fn_valor_talla(f.t) = f.v,
                           coalesce(public.fn_valor_talla(f.t)::text, 'NULL'));
  end loop;
  perform pg_temp.exigir('T 40,5, 40.5, 40,50, 40.50, 40 1/2 y 40 2/4 dan el mismo valor, también como texto (40.5)',
    (select count(distinct public.fn_valor_talla(x)::text) = 1 and min(public.fn_valor_talla(x)::text) = '40.5'
       from unnest(array['40,5', '40.5', '40,50', '40.50', '40 1/2', '40 2/4']) x));
  perform pg_temp.exigir('T fn_valor_talla(NULL) es NULL', public.fn_valor_talla(null) is null);

  -- Formatos rechazados: NULL, nunca un error ni un número inventado.
  foreach v_malas in array array['', ' ', '40,5.2', '40.5,2', '40,5,5', '40foo', 'foo', '40 1/0', '40 0/0', '40 3/3', '40 4/3',
                                 '40 1/100', '40  1/3', ' 40', '40 ', '40 1/3 ', '40/3', '40 /3', '40 1 /3', '0040',
                                 '1000', '40,555', '40,', '40.', '.5', ',5', '-40', '+40', '1e2', '0x28', 'NaN',
                                 'nan', 'Infinity', '-Infinity', E'40\n', E'40\t', '４０', '٤٠', '40½', '40 1/3a', '40' || chr(160) || '1/3'] loop
    perform pg_temp.exigir(format('T fn_valor_talla(%s) es NULL', translate(quote_literal(v_malas), chr(10) || chr(9), '¶→')),
                           public.fn_valor_talla(v_malas) is null,
                           coalesce(public.fn_valor_talla(v_malas)::text, 'NULL'));
  end loop;
end;
$$;

-- Escribir como administrador: lo admitido entra, lo demás choca con el CHECK.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-6666-0000-0000-000000000001', true);

do $$
declare
  v_mala text;
  v_desacuerdos text;
  v_candidatas text[];
begin
  -- Orden desordenado a propósito; también la coma, el punto y la fracción equivalentes.
  insert into public.tallas (variante_id, talla, estado, vigencia_desde)
  select '20000000-6666-0000-0000-00000000000a', t, 'CONFIRMADA', now()
    from unnest(array['41', '40 2/3', '9.5', '40,5', '40', '40 1/3', '39']) as t;
  perform pg_temp.exigir('T el administrador inserta 40, 40,5, 40 1/3, 40 2/3 y 9.5', true);

  insert into public.tallas (variante_id, talla)
  select '20000000-6666-0000-0000-00000000000b', t from unnest(array['40,5', '40.5', '40,50', '40.50', '40 1/2', '40 2/4']) as t;
  perform pg_temp.exigir('T el CHECK admite 40,50, 40.50 y 40 2/4, y las seis formas de 40,5 conviven en una variante (unicidad sin cambios)',
    (select count(*) = 6 from public.tallas where variante_id = '20000000-6666-0000-0000-00000000000b'));

  foreach v_mala in array array['40,5.2', '40foo', '40 1/0', '', 'NaN', 'Infinity', '40 4/3', '0040', '40,555', ' 40', '40 ', E'40\n', '٤٠'] loop
    perform pg_temp.exigir_rechazo(format('T CHECK rechaza la talla %s', translate(quote_literal(v_mala), chr(10), '¶')),
      format('insert into public.tallas (variante_id, talla) values (%L, %L)', '20000000-6666-0000-0000-00000000000c', v_mala),
      '23514', 'tallas_talla_(formato|check)');
  end loop;
  perform pg_temp.exigir_rechazo('T CHECK rechaza cambiar una talla válida por 40,5.2',
    $q$update public.tallas set talla = '40,5.2' where variante_id = '20000000-6666-0000-0000-00000000000a' and talla = '41'$q$,
    '23514', 'tallas_talla_formato');
  perform pg_temp.exigir('T la talla rechazada en el UPDATE sigue intacta',
    exists (select 1 from public.tallas where variante_id = '20000000-6666-0000-0000-00000000000a' and talla = '41'));

  -- El CHECK y fn_valor_talla aceptan exactamente lo mismo, también en casos generados.
  select array_agg(distinct c) into v_candidatas from (
    select unnest(array['0', '1', '9', '10', '99', '100', '999', '1000', '01', '001', '40', '40 ', ' 40', '',
                        '40,5.2', '40foo', 'NaN', 'Infinity', E'40\n', '٤٠', '40½', '1e2']) as c
    union all select '40' || s || d from unnest(array[',', '.']) s,
                 unnest(array['0', '5', '05', '50', '25', '00', '9', '99', '123', '']) d
    union all select '40 ' || n || '/' || d from generate_series(0, 12) n, generate_series(0, 12) d
    union all select '40 ' || n || '/' || d from (values ('01', '3'), ('1', '03'), ('99', '100'), ('1', '100')) x(n, d)
    union all select '40  1/3' union all select '40 1 /3' union all select '40 1/ 3'
  ) z;
  select string_agg(format('%L (CHECK %s, valor %s)', c, pg_temp.talla_aceptada('20000000-6666-0000-0000-00000000000c', c),
                           coalesce(public.fn_valor_talla(c)::text, 'NULL')), '; ')
    into v_desacuerdos
    from unnest(v_candidatas) c
   where pg_temp.talla_aceptada('20000000-6666-0000-0000-00000000000c', c) <> (public.fn_valor_talla(c) is not null);
  perform pg_temp.exigir(format('T el CHECK y fn_valor_talla coinciden en %s candidatas', cardinality(v_candidatas)),
                         v_desacuerdos is null, v_desacuerdos);
  -- 10 enteros + 16 decimales + 78 fracciones con numerador < denominador + 2 con cero inicial.
  perform pg_temp.exigir('T de esas candidatas se admiten exactamente las 106 esperadas',
    (select count(*) from unnest(v_candidatas) c where public.fn_valor_talla(c) is not null) = 106,
    (select count(*) from unnest(v_candidatas) c where public.fn_valor_talla(c) is not null)::text);
end;
$$;

-- El orden numérico, en las tres lecturas que lo usan.
do $$
declare v_esperado jsonb := '["9.5", "39", "40", "40 1/3", "40,5", "40 2/3", "41"]';
begin
  perform pg_temp.exigir('T fn_tallas_por_estado ordena por valor, con coma y fracciones',
    public.fn_tallas_por_estado('20000000-6666-0000-0000-00000000000a', 'DISPONIBLE') = v_esperado,
    public.fn_tallas_por_estado('20000000-6666-0000-0000-00000000000a', 'DISPONIBLE')::text);
  perform pg_temp.exigir('T fn_admin_tallas ordena por valor, con coma y fracciones',
    (select jsonb_agg(talla) from public.fn_admin_tallas('20000000-6666-0000-0000-00000000000a')) = v_esperado,
    (select jsonb_agg(talla) from public.fn_admin_tallas('20000000-6666-0000-0000-00000000000a'))::text);
  perform pg_temp.exigir('T las seis equivalentes comparten valor de orden: quedan juntas, desempatadas por la etiqueta',
    (select count(*) = 6 and count(distinct public.fn_valor_talla(talla)) = 1
       from public.fn_admin_tallas('20000000-6666-0000-0000-00000000000b')));
end;
$$;
reset role;

-- service_role inserta una talla con coma sin EXECUTE sobre fn_valor_talla: el CHECK solo
-- usa funciones del sistema. Se borra después como mantenimiento privilegiado.
set local role service_role;
insert into public.tallas (id, variante_id, talla)
values ('30000000-6666-0000-0000-0000000000a1', '20000000-6666-0000-0000-00000000000c', '42,5');
reset role;
do $$
begin
  perform pg_temp.exigir('T service_role escribe 42,5 sin EXECUTE sobre fn_valor_talla',
    exists (select 1 from public.tallas where id = '30000000-6666-0000-0000-0000000000a1')
    and not has_function_privilege('service_role', 'public.fn_valor_talla(text)', 'EXECUTE'));
end;
$$;

set local role anon;
do $$
declare v_texto text;
begin
  -- sum(length(...)) obliga a evaluar cada columna: count(*) no lo haría.
  select string_agg(to_jsonb(c)::text, '') into v_texto from public.catalogo_publico c where c.nombre = 'PRUEBA 60';
  perform pg_temp.exigir('T el visitante lee la vista completa con tallas 40,5 y 42,5', v_texto like '%"40,5"%' and v_texto like '%"42,5"%');
  perform pg_temp.exigir('T el catálogo entero se evalúa sin errores',
    (select sum(length(to_jsonb(c)::text)) > 0 from public.catalogo_publico c));
  perform pg_temp.exigir('T el detalle «tallas» de la vista también va en orden numérico',
    (select jsonb_agg(t ->> 'talla') from public.catalogo_publico c, jsonb_array_elements(c.variantes) v, jsonb_array_elements(v -> 'tallas') t
      where c.nombre = 'PRUEBA 60' and v ->> 'codigoVariante' = 'PR-60-A')
      = '["9.5", "39", "40", "40 1/3", "40,5", "40 2/3", "41"]'::jsonb);
  perform pg_temp.exigir('T las etiquetas llegan intactas a la tienda (sin normalizar)',
    (select v -> 'tallasPorRevisar' @> '["40,5", "40.5", "40,50", "40.50", "40 1/2", "40 2/4"]'::jsonb and jsonb_array_length(v -> 'tallasPorRevisar') = 6
       from public.catalogo_publico c, jsonb_array_elements(c.variantes) v
      where c.nombre = 'PRUEBA 60' and v ->> 'codigoVariante' = 'PR-60-B'));
end;
$$;
reset role;

-- =====================================================================
-- D. Las tallas no se borran: se desactivan
-- =====================================================================
do $$
declare v text;
begin
  foreach v in array array['anon', 'authenticated'] loop
    perform pg_temp.exigir(format('D %s sin DELETE en tallas', v), not has_table_privilege(v, 'public.tallas', 'DELETE'));
    perform pg_temp.exigir(format('D %s sin TRUNCATE en tallas', v), not has_table_privilege(v, 'public.tallas', 'TRUNCATE'));
    -- También por un rol del que sea miembro, aunque no lo herede (SET ROLE).
    perform pg_temp.exigir(format('D ningún rol al que %s pueda pasar borra tallas', v),
      not exists (select 1 from pg_roles r where pg_has_role(v, r.oid, 'MEMBER')
                   and (has_table_privilege(r.oid, 'public.tallas', 'DELETE') or has_table_privilege(r.oid, 'public.tallas', 'TRUNCATE'))));
  end loop;
  perform pg_temp.exigir('D PUBLIC no tiene ningún privilegio sobre tallas',
    not exists (select 1 from pg_class c, aclexplode(c.relacl) a where c.oid = 'public.tallas'::regclass and a.grantee = 0));
  perform pg_temp.exigir('D authenticated conserva INSERT y UPDATE en tallas',
    has_table_privilege('authenticated', 'public.tallas', 'INSERT') and has_table_privilege('authenticated', 'public.tallas', 'UPDATE'));
  perform pg_temp.exigir('D ninguna función ejecutable por una sesión borra tallas',
    not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public'
                   and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
                   and p.prosrc ~* '\m(delete\s+from|truncate)\s+(only\s+)?(table\s+)?("?public"?\s*\.\s*)?"?tallas\M'));
  perform pg_temp.exigir('D los disparadores de tallas siguen en pie',
    (select count(*) = 2 from pg_trigger where tgrelid = 'public.tallas'::regclass and not tgisinternal and tgenabled = 'O'));
  perform set_config('prueba.tallas', (select count(*) from public.tallas)::text, true);
  perform set_config('prueba.historial', (select count(*) from public.historial where tabla = 'tallas')::text, true);
end;
$$;

set local role anon;
select pg_temp.exigir_denegado('D anon: DELETE denegado', 'delete from public.tallas');
select pg_temp.exigir_denegado('D anon: TRUNCATE denegado', 'truncate public.tallas');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-6666-0000-0000-000000000002', true);
select pg_temp.exigir_denegado('D sesión sin administrador: DELETE denegado (antes: cero filas)',
  $q$delete from public.tallas where id = '30000000-6666-0000-0000-0000000000f0'$q$);
do $$
declare n bigint;
begin
  update public.tallas set activa = false where id = '30000000-6666-0000-0000-0000000000f0';
  get diagnostics n = row_count;
  perform pg_temp.exigir('D sesión sin administrador: desactivar no afecta a ninguna fila (RLS)', n = 0, n::text);
end;
$$;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-6666-0000-0000-000000000001', true);
select pg_temp.exigir_denegado('D administrador: DELETE de una talla denegado',
  $q$delete from public.tallas where id = '30000000-6666-0000-0000-0000000000f0'$q$);
select pg_temp.exigir_denegado('D administrador: DELETE con RETURNING denegado',
  $q$delete from public.tallas where variante_id = '20000000-6666-0000-0000-00000000000a' returning id$q$);
select pg_temp.exigir_denegado('D administrador: DELETE sin filtro denegado', 'delete from public.tallas');
select pg_temp.exigir_denegado('D administrador: TRUNCATE denegado', 'truncate public.tallas');
select pg_temp.exigir_denegado('D administrador: borrar una variante con tallas tampoco las arrastra',
  $q$delete from public.tallas using public.variantes v where v.id = tallas.variante_id and v.codigo_variante = 'PR-60-A'$q$);

do $$
declare
  v_id uuid;
  v_hist record;
  n bigint;
begin
  perform pg_temp.exigir('D los intentos rechazados no borraron ninguna talla',
    (select count(*) from public.fn_admin_tallas()) >= 1
    and (select count(*) from public.tallas) = current_setting('prueba.tallas')::bigint);

  -- Desactivar: la MISMA fila, con historial.
  select id into v_id from public.tallas where variante_id = '20000000-6666-0000-0000-00000000000a' and talla = '40,5';
  update public.tallas set activa = false where id = v_id;
  get diagnostics n = row_count;
  perform pg_temp.exigir('D el administrador desactiva una talla (activa = false)', n = 1, n::text);
  select h.operacion, h.cambios, h.autor into v_hist from public.historial h
   where h.tabla = 'tallas' and h.fila_id = v_id order by h.id desc limit 1;
  perform pg_temp.exigir('D el historial registra la desactivación, su autor y solo el cambio de activa',
    v_hist.operacion = 'UPDATE' and v_hist.cambios = array['activa'] and v_hist.autor = 'aaaaaaaa-6666-0000-0000-000000000001',
    format('%s %s %s', v_hist.operacion, v_hist.cambios, v_hist.autor));
  perform pg_temp.exigir('D la talla desactivada desaparece de la vista',
    not (public.fn_tallas_por_estado('20000000-6666-0000-0000-00000000000a', 'DISPONIBLE') ? '40,5'));
  perform pg_temp.exigir('D la talla desactivada sigue en fn_admin_tallas, con activa = false',
    (select not activa from public.fn_admin_tallas('20000000-6666-0000-0000-00000000000a') where id = v_id));

  -- Reactivar: la misma fila, sin duplicar.
  update public.tallas set activa = true where id = v_id;
  perform pg_temp.exigir('D reactivar reutiliza la MISMA fila',
    (select count(*) = 1 from public.tallas where variante_id = '20000000-6666-0000-0000-00000000000a' and talla = '40,5')
    and exists (select 1 from public.tallas where id = v_id and activa));
  perform pg_temp.exigir('D el historial registra también la reactivación',
    (select count(*) = 2 from public.historial where tabla = 'tallas' and fila_id = v_id and operacion = 'UPDATE' and cambios = array['activa']));
  perform pg_temp.exigir('D la talla reactivada vuelve a la vista',
    public.fn_tallas_por_estado('20000000-6666-0000-0000-00000000000a', 'DISPONIBLE') ? '40,5');
end;
$$;
reset role;

do $$
begin
  perform pg_temp.exigir('D ningún DELETE rechazado borró filas del historial',
    (select count(*) from public.historial where tabla = 'tallas') >= current_setting('prueba.historial')::bigint
    and not exists (select 1 from public.historial where tabla = 'tallas' and operacion = 'DELETE'
                     and fila_id in (select id from public.tallas)));
  perform pg_temp.exigir('D la talla atacada sigue existiendo',
    exists (select 1 from public.tallas where id = '30000000-6666-0000-0000-0000000000f0'));
end;
$$;

-- Mantenimiento privilegiado: service_role no es un rol de la aplicación y conserva DELETE
-- (con él se limpian los datos de prueba locales). Queda en el historial.
set local role service_role;
delete from public.tallas where id = '30000000-6666-0000-0000-0000000000a1';
reset role;
do $$
begin
  perform pg_temp.exigir('D service_role conserva DELETE para mantenimiento, y queda en el historial',
    not exists (select 1 from public.tallas where id = '30000000-6666-0000-0000-0000000000a1')
    and exists (select 1 from public.historial where fila_id = '30000000-6666-0000-0000-0000000000a1' and operacion = 'DELETE'));
end;
$$;

-- =====================================================================
-- F. Fechas: ninguna futura al escribir
-- =====================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-6666-0000-0000-000000000001', true);

do $$
declare
  c text;
  v_fila public.tallas;
  v_id uuid;
  v_publicado timestamptz;
  v_vence timestamptz;
begin
  -- INSERT directo
  foreach c in array array['publicado_en', 'confirmado_en', 'vigencia_desde'] loop
    perform pg_temp.exigir_rechazo(format('F INSERT con %s futura (1 hora) se rechaza', c),
      format('insert into public.tallas (variante_id, talla, %I) values (%L, %L, now() + interval %L)',
             c, '20000000-6666-0000-0000-00000000000c', '43', '1 hour'),
      '23514', c || ' no puede ser futura');
    perform pg_temp.exigir_rechazo(format('F INSERT con %s futura por 1 µs se rechaza (sin tolerancia)', c),
      format('insert into public.tallas (variante_id, talla, %I) values (%L, %L, now() + interval %L)',
             c, '20000000-6666-0000-0000-00000000000c', '43', '1 microsecond'),
      '23514', c || ' no puede ser futura');
    perform pg_temp.exigir_rechazo(format('F INSERT con %s = infinity se rechaza', c),
      format('insert into public.tallas (variante_id, talla, %I) values (%L, %L, %L)',
             c, '20000000-6666-0000-0000-00000000000c', '43', 'infinity'),
      '23514', c || ' debe ser una fecha concreta');
    perform pg_temp.exigir_rechazo(format('F INSERT con %s = -infinity se rechaza', c),
      format('insert into public.tallas (variante_id, talla, %I) values (%L, %L, %L)',
             c, '20000000-6666-0000-0000-00000000000c', '43', '-infinity'),
      '23514', c || ' debe ser una fecha concreta');
  end loop;
  perform pg_temp.exigir('F ningún INSERT rechazado dejó fila', not exists (
    select 1 from public.tallas where variante_id = '20000000-6666-0000-0000-00000000000c' and talla = '43'));

  insert into public.tallas (variante_id, talla, estado, publicado_en, confirmado_en, vigencia_desde)
  values ('20000000-6666-0000-0000-00000000000c', '43', 'CONFIRMADA', now(), now(), now())
  returning vence_en into v_vence;   -- solo columnas públicas: las internas siguen cerradas por la tabla
  perform pg_temp.exigir('F INSERT con las tres fechas = now() se acepta (el borde no es futuro)',
    v_vence = now() + interval '48 hours');
  insert into public.tallas (variante_id, talla, estado, publicado_en, vigencia_desde, vence_en)
  values ('20000000-6666-0000-0000-00000000000c', '45', 'CONFIRMADA', now() - interval '3 hours', now() - interval '3 hours', now() + interval '1 year')
  returning id, vence_en into v_id, v_vence;
  perform pg_temp.exigir('F INSERT con fechas pasadas se acepta y vence_en lo calcula el disparador (ignora el enviado)',
    v_vence = now() - interval '3 hours' + interval '48 hours');

  -- UPDATE directo
  foreach c in array array['publicado_en', 'confirmado_en', 'vigencia_desde'] loop
    perform pg_temp.exigir_rechazo(format('F UPDATE a %s futura se rechaza', c),
      format('update public.tallas set %I = now() + interval %L where id = %L', c, '2 days', v_id),
      '23514', c || ' no puede ser futura');
  end loop;
  perform pg_temp.exigir('F la fila sigue igual tras los UPDATE rechazados',
    (select vigencia_desde = now() - interval '3 hours' and confirmado_en is null from public.fn_admin_tallas() where id = v_id));
  update public.tallas set vigencia_desde = now() - interval '1 hour' where id = v_id;
  perform pg_temp.exigir('F UPDATE a una fecha pasada se acepta', (select vence_en = now() + interval '47 hours' from public.tallas where id = v_id));

  -- La fila antigua con fecha futura: se puede editar en lo demás y su fecha no se renueva.
  update public.tallas set nota = 'editada' where id = '30000000-6666-0000-0000-0000000000f0';
  perform pg_temp.exigir('F una fila antigua con fecha futura se edita en lo demás sin rechazo ni renovación',
    (select nota = 'editada' and vigencia_desde = now() + interval '5 days' and vence_en = now() + interval '5 days' + interval '48 hours'
       from public.fn_admin_tallas() where id = '30000000-6666-0000-0000-0000000000f0'));
  perform pg_temp.exigir_rechazo('F pero moverla a otra fecha futura se rechaza',
    $q$update public.tallas set vigencia_desde = now() + interval '6 days' where id = '30000000-6666-0000-0000-0000000000f0'$q$,
    '23514', 'vigencia_desde no puede ser futura');

  -- Funciones de confirmación
  select id into v_id from public.tallas where variante_id = '20000000-6666-0000-0000-00000000000a' and talla = '39';
  perform pg_temp.exigir_rechazo('F fn_confirmar_por_publicacion con fecha futura se rechaza',
    format('select public.fn_confirmar_por_publicacion(%L, now() + interval %L)', v_id, '1 hour'),
    '23514', 'publicado_en no puede ser futura');
  perform pg_temp.exigir_rechazo('F fn_confirmar_por_publicacion con infinity se rechaza',
    format('select public.fn_confirmar_por_publicacion(%L, %L)', v_id, 'infinity'),
    '23514', 'publicado_en debe ser una fecha concreta');
  v_fila := public.fn_confirmar_por_publicacion(v_id, now());
  perform pg_temp.exigir('F escenario A con la hora actual: se acepta', v_fila.estado = 'CONFIRMADA' and v_fila.vigencia_desde = now());
  v_publicado := now() - interval '10 hours';
  v_fila := public.fn_confirmar_por_publicacion(v_id, v_publicado);
  perform pg_temp.exigir('F escenario A: el reloj arranca en la publicación y dura 48 h por omisión',
    v_fila.publicado_en = v_publicado and v_fila.vigencia_desde = v_publicado and v_fila.vence_en = v_publicado + interval '48 hours'
    and v_fila.origen = 'publicacion');
  perform pg_temp.exigir('F escenario A: DISPONIBLE', public.fn_estado_publico(v_fila.estado, v_fila.vigencia_desde, v_fila.vence_en) = 'DISPONIBLE');

  v_fila := public.fn_confirmar_por_proveedor(v_id);
  perform pg_temp.exigir('F escenario B: la confirmación del servidor nunca se rechaza y arranca ahora',
    v_fila.confirmado_en = now() and v_fila.vigencia_desde = now() and v_fila.vence_en = now() + interval '48 hours' and v_fila.origen = 'proveedor');
  perform pg_temp.exigir('F escenario B conserva la publicación original', v_fila.publicado_en = v_publicado);

  v_fila := public.fn_confirmar_por_proveedor(v_id, 60::smallint);
  perform pg_temp.exigir('F vigencia de 60 h se acepta', v_fila.vence_en = now() + interval '60 hours');
  perform pg_temp.exigir_rechazo('F vigencia de 61 h se sigue rechazando',
    format('select public.fn_confirmar_por_proveedor(%L, 61::smallint)', v_id), '23514', 'vigencia_horas');
  update public.configuracion set valor = '50' where clave = 'vigencia_horas_predeterminada';
  v_fila := public.fn_confirmar_por_proveedor(v_id);
  perform pg_temp.exigir('F la vigencia predeterminada sale de la configuración', v_fila.vence_en = now() + interval '50 hours');
  update public.configuracion set valor = '48' where clave = 'vigencia_horas_predeterminada';

  v_fila := public.fn_marcar_agotada(v_id, 'sin stock');
  perform pg_temp.exigir('F agotar sigue borrando el reloj', v_fila.estado = 'AGOTADA' and v_fila.vigencia_desde is null and v_fila.vence_en is null);
end;
$$;
reset role;

-- =====================================================================
-- E. Estado efectivo al leer
-- =====================================================================
do $$
declare f record;
begin
  for f in
    select * from (values
      ('vigente',                    'CONFIRMADA', now() - interval '1 hour',  now() + interval '47 hours', 'DISPONIBLE'),
      ('empieza justo ahora',        'CONFIRMADA', now(),                      now() + interval '48 hours', 'DISPONIBLE'),
      ('aún no empieza (1 µs)',      'CONFIRMADA', now() + interval '1 microsecond', now() + interval '48 hours', 'POR_REVISAR'),
      ('aún no empieza (5 días)',    'CONFIRMADA', now() + interval '5 days',  now() + interval '7 days',   'POR_REVISAR'),
      ('vence justo ahora',          'CONFIRMADA', now() - interval '48 hours', now(),                      'POR_REVISAR'),
      ('vence dentro de 1 µs',       'CONFIRMADA', now() - interval '48 hours', now() + interval '1 microsecond', 'DISPONIBLE'),
      ('vencida',                    'CONFIRMADA', now() - interval '72 hours', now() - interval '24 hours', 'POR_REVISAR'),
      ('sin vigencia_desde',         'CONFIRMADA', null,                       now() + interval '1 hour',   'POR_REVISAR'),
      ('sin vence_en',               'CONFIRMADA', now() - interval '1 hour',  null,                        'POR_REVISAR'),
      ('sin ninguna fecha',          'CONFIRMADA', null,                       null,                        'POR_REVISAR'),
      ('agotada vencida',            'AGOTADA',    now() - interval '900 hours', now() - interval '800 hours', 'AGOTADO'),
      ('agotada sin fechas',         'AGOTADA',    null,                       null,                        'AGOTADO'),
      ('agotada futura',             'AGOTADA',    now() + interval '1 hour',  now() + interval '49 hours', 'AGOTADO'),
      ('revisar vigente',            'REVISAR',    now() - interval '1 hour',  now() + interval '47 hours', 'POR_REVISAR'),
      ('revisar sin fechas',         'REVISAR',    null,                       null,                        'POR_REVISAR')
    ) as x(caso, estado, desde, vence, esperado)
  loop
    perform pg_temp.exigir('E ' || f.caso || ' -> ' || f.esperado,
      public.fn_estado_publico(f.estado::public.estado_talla, f.desde, f.vence) = f.esperado::public.estado_publico,
      public.fn_estado_publico(f.estado::public.estado_talla, f.desde, f.vence)::text);
  end loop;
end;
$$;

-- Lo mismo por la vista, con filas reales: el borde exacto de vencimiento y la fila antigua futura.
insert into public.tallas (variante_id, talla, estado, vigencia_desde) values
  ('20000000-6666-0000-0000-00000000000d', '38', 'CONFIRMADA', now() - interval '48 hours'),   -- vence_en = now()
  ('20000000-6666-0000-0000-00000000000d', '39', 'CONFIRMADA', now()),                         -- empieza ahora
  ('20000000-6666-0000-0000-00000000000d', '40', 'AGOTADA', null),
  ('20000000-6666-0000-0000-00000000000d', '41', 'REVISAR', null),
  ('20000000-6666-0000-0000-00000000000d', '42', 'CONFIRMADA', now() - interval '100 hours');
set local role anon;
do $$
declare v jsonb;
begin
  select x into v from public.catalogo_publico c, jsonb_array_elements(c.variantes) x
   where c.nombre = 'PRUEBA 60' and x ->> 'codigoVariante' = 'PR-60-D';
  perform pg_temp.exigir('E vista: DISPONIBLE solo la que empieza ahora', v -> 'tallasDisponibles' = '["39"]', (v -> 'tallasDisponibles')::text);
  perform pg_temp.exigir('E vista: AGOTADO no vence', v -> 'tallasAgotadas' = '["40"]', (v -> 'tallasAgotadas')::text);
  perform pg_temp.exigir('E vista: vencida justo ahora, revisar, vencida y fila antigua futura -> POR_REVISAR',
    v -> 'tallasPorRevisar' = '["38", "41", "42", "44"]', (v -> 'tallasPorRevisar')::text);
  perform pg_temp.exigir('E vista: el detalle de la fila futura dice POR_REVISAR y conserva sus fechas',
    exists (select 1 from jsonb_array_elements(v -> 'tallas') t
             where t ->> 'talla' = '44' and t ->> 'estado' = 'POR_REVISAR' and (t ->> 'vigenciaDesde')::timestamptz = now() + interval '5 days'));
end;
$$;
reset role;

-- =====================================================================
-- R. Reloj, volatilidad y definiciones
-- =====================================================================
do $$
begin
  perform pg_temp.exigir('R fn_estado_publico es STABLE (depende de now())',
    (select provolatile = 's' from pg_proc where oid = 'public.fn_estado_publico(public.estado_talla, timestamptz, timestamptz)'::regprocedure));
  perform pg_temp.exigir('R fn_tallas_por_estado es STABLE',
    (select provolatile = 's' from pg_proc where oid = 'public.fn_tallas_por_estado(uuid, public.estado_publico)'::regprocedure));
  perform pg_temp.exigir('R fn_valor_talla es IMMUTABLE y no mira el reloj',
    (select provolatile = 'i' and prosrc !~* 'now|timestamp|current_' from pg_proc where oid = 'public.fn_valor_talla(text)'::regprocedure));
  perform pg_temp.exigir('R fn_tallas_antes_de_escribir es VOLATILE',
    (select provolatile = 'v' from pg_proc where oid = 'public.fn_tallas_antes_de_escribir()'::regprocedure));
  perform pg_temp.exigir('R ninguna función IMMUTABLE de public mira el reloj',
    not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.provolatile = 'i'
                 and p.prosrc ~* '\m(now|clock_timestamp|statement_timestamp|transaction_timestamp|timeofday)\s*\(|\m(current_timestamp|current_date|localtimestamp)\M'));
  perform pg_temp.exigir('R ningún CHECK de public depende del reloj',
    not exists (select 1 from pg_constraint c where c.contype = 'c' and c.connamespace = 'public'::regnamespace
                 and pg_get_constraintdef(c.oid) ~* '\m(now|clock_timestamp|statement_timestamp|transaction_timestamp|timeofday)\s*\(|\m(current_timestamp|current_date|current_time|localtimestamp|localtime)\M'));
  perform pg_temp.exigir('R el CHECK de formato no depende de ninguna función de public',
    not exists (select 1 from pg_constraint c join pg_depend d on d.classid = 'pg_constraint'::regclass and d.objid = c.oid
                 and d.refclassid = 'pg_proc'::regclass where c.conname = 'tallas_talla_formato'));
  perform pg_temp.exigir('R las tres funciones reemplazadas conservan invoker, search_path vacío y propietario',
    (select bool_and(not p.prosecdef and coalesce(p.proconfig, '{}') @> array['search_path=""'] and pg_get_userbyid(p.proowner) = 'postgres')
       from pg_proc p where p.oid in ('public.fn_valor_talla(text)'::regprocedure,
                                      'public.fn_estado_publico(public.estado_talla, timestamptz, timestamptz)'::regprocedure,
                                      'public.fn_tallas_antes_de_escribir()'::regprocedure)));
  perform pg_temp.exigir('R fn_valor_talla y fn_estado_publico: EXECUTE solo para anon y authenticated',
    (select bool_and(has_function_privilege('anon', p.oid, 'EXECUTE') and has_function_privilege('authenticated', p.oid, 'EXECUTE')
                     and not has_function_privilege('service_role', p.oid, 'EXECUTE')
                     and not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0))
       from pg_proc p where p.oid in ('public.fn_valor_talla(text)'::regprocedure,
                                      'public.fn_estado_publico(public.estado_talla, timestamptz, timestamptz)'::regprocedure)));
  perform pg_temp.exigir('R fn_tallas_antes_de_escribir sigue sin EXECUTE para ningún rol de aplicación',
    not has_function_privilege('anon', 'public.fn_tallas_antes_de_escribir()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.fn_tallas_antes_de_escribir()', 'EXECUTE')
    and not has_function_privilege('service_role', 'public.fn_tallas_antes_de_escribir()', 'EXECUTE'));
  -- 14 hasta 14f.2; la etapa 16 añade fn_admin_guardar_producto y fn_admin_estado_producto,
  -- clasificadas en 40_acceso_interno.sql y aprobadas en auditar_funciones.sql.
  perform pg_temp.exigir('R en public siguen exactamente 16 funciones propias',
    (select count(*) = 16 from pg_proc p where p.pronamespace = 'public'::regnamespace
       and not exists (select 1 from pg_depend e where e.classid = 'pg_proc'::regclass and e.objid = p.oid and e.deptype = 'e')));
end;
$$;

rollback;
