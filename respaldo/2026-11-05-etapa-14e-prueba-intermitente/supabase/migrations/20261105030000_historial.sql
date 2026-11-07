-- Etapa 13 · Historial inalterable
--
-- Solo se añade. No hay forma de editarlo ni borrarlo desde la interfaz:
-- no se conceden UPDATE ni DELETE a ningún rol de aplicación, y lo escribe
-- un disparador, de modo que no se puede «olvidar» registrar un cambio.

create table public.historial (
  id             bigserial primary key,
  tabla          text        not null,
  fila_id        uuid        not null,
  operacion      text        not null check (operacion in ('INSERT', 'UPDATE', 'DELETE')),
  fila_anterior  jsonb,
  fila_nueva     jsonb,
  cambios        text[],
  autor          uuid,
  lote           uuid,
  ocurrido_en    timestamptz not null default now()
);

create index on public.historial (tabla, fila_id);
create index on public.historial (ocurrido_en desc);
create index on public.historial (lote);

-- El lote permite deshacer de una vez todo lo hecho en una misma acción.
create or replace function public.fn_lote_actual()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('gamaytalla.lote', true), '')::uuid;
$$;

create or replace function public.fn_registrar_historial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anterior jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_nueva    jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_cambios  text[];
  v_fila_id  uuid  := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  if tg_op = 'UPDATE' then
    select array_agg(clave order by clave) into v_cambios
      from jsonb_each(v_nueva) as n(clave, valor)
     where n.valor is distinct from (v_anterior -> n.clave)
       and n.clave <> 'actualizado_en';
    -- Un UPDATE que no cambia nada real no ensucia el historial.
    if v_cambios is null then
      return new;
    end if;
  end if;

  insert into public.historial (tabla, fila_id, operacion, fila_anterior, fila_nueva, cambios, autor, lote)
  values (tg_table_name, v_fila_id, tg_op, v_anterior, v_nueva, v_cambios,
          (select auth.uid()), public.fn_lote_actual());

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger tr_historial_tallas
  after insert or update or delete on public.tallas
  for each row execute function public.fn_registrar_historial();

create trigger tr_historial_productos
  after insert or update or delete on public.productos
  for each row execute function public.fn_registrar_historial();

create trigger tr_historial_variantes
  after insert or update or delete on public.variantes
  for each row execute function public.fn_registrar_historial();
