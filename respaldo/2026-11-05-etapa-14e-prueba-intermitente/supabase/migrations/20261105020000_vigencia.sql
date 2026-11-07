-- Etapa 13 · Vencimiento automático de la disponibilidad
--
-- POR QUÉ UN DISPARADOR Y NO UNA COLUMNA GENERADA
-- -----------------------------------------------
-- La primera propuesta era:
--     vence_en timestamptz generated always as
--       (publicado_en + (vigencia_horas || ' hours')::interval) stored
-- PostgreSQL LA RECHAZA. La documentación exige que la expresión de una columna
-- generada use solo funciones inmutables, y el operador «timestamptz + interval»
-- es STABLE, no IMMUTABLE, porque su resultado depende del ajuste TimeZone.
-- Comprobado en el catálogo del propio PostgreSQL (src/include/catalog/pg_proc.dat):
--     timestamptz_pl_interval -> provolatile => 's'   (STABLE)
--     timestamp_pl_interval   -> sin provolatile      (IMMUTABLE, por omisión 'i')
-- Un disparador SÍ puede llamar funciones STABLE, así que vence_en se guarda de
-- verdad y puede indexarse y ordenarse, que es lo que necesita el panel.
--
-- El ESTADO EFECTIVO es distinto: depende de now() y por eso NO PUEDE ALMACENARSE
-- de ninguna forma. Se calcula siempre al leer, en la vista. Sin tareas programadas.

-- -------------------------------------------- vence_en y actualizado_en
create or replace function public.fn_tallas_antes_de_escribir()
returns trigger
language plpgsql
as $$
begin
  -- El reloj lo mueve vigencia_desde, nunca publicado_en ni registrado_en.
  new.vence_en := case
                    when new.vigencia_desde is null then null
                    else new.vigencia_desde + make_interval(hours => new.vigencia_horas)
                  end;
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger tr_tallas_vigencia
  before insert or update on public.tallas
  for each row execute function public.fn_tallas_antes_de_escribir();

-- ------------------------------------------ actualizado_en en el resto
create or replace function public.fn_marcar_actualizado()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger tr_productos_actualizado
  before update on public.productos
  for each row execute function public.fn_marcar_actualizado();

create trigger tr_variantes_actualizado
  before update on public.variantes
  for each row execute function public.fn_marcar_actualizado();

-- ------------------------------------------------------ estado público
-- La única fuente de verdad del estado que ve el cliente.
-- STABLE porque depende de now(): correcto y suficiente para una vista.
create or replace function public.fn_estado_publico(
  p_estado         public.estado_talla,
  p_vigencia_desde timestamptz,
  p_vence_en       timestamptz
)
returns public.estado_publico
language sql
stable
as $$
  select case
    when p_estado = 'AGOTADA'      then 'AGOTADO'::public.estado_publico
    when p_estado = 'REVISAR'      then 'POR_REVISAR'::public.estado_publico
    when p_vigencia_desde is null  then 'POR_REVISAR'::public.estado_publico
    when p_vence_en is null        then 'POR_REVISAR'::public.estado_publico
    when now() < p_vence_en        then 'DISPONIBLE'::public.estado_publico
    else                                'POR_REVISAR'::public.estado_publico
  end;
$$;

comment on function public.fn_estado_publico is
  'Estado que ve el cliente. AGOTADO nunca vence solo; lo vencido cae a POR_REVISAR, jamas a AGOTADO.';

-- ----------------------------------- acciones de vigencia (escenarios A y B)
-- Escenario A: el modelo reaparece en una publicación nueva.
--   La vigencia arranca en la fecha ORIGINAL de esa publicación.
create or replace function public.fn_confirmar_por_publicacion(
  p_talla_id      uuid,
  p_publicado_en  timestamptz,
  p_vigencia_horas smallint default null
)
returns public.tallas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fila  public.tallas;
  v_horas smallint;
begin
  if not public.fn_es_administrador() then
    raise exception 'Solo un administrador puede confirmar disponibilidad.';
  end if;

  v_horas := coalesce(
    p_vigencia_horas,
    (select valor::smallint from public.configuracion
      where clave = 'vigencia_horas_predeterminada'),
    48);

  update public.tallas
     set estado         = 'CONFIRMADA',
         publicado_en   = p_publicado_en,
         vigencia_desde = p_publicado_en,   -- el reloj arranca en la publicación
         vigencia_horas = v_horas,
         origen         = 'publicacion',
         activa         = true
   where id = p_talla_id
  returning * into v_fila;

  if v_fila.id is null then
    raise exception 'No existe la talla %', p_talla_id;
  end if;
  return v_fila;
end;
$$;

-- Escenario B: estaba POR REVISAR y el proveedor confirma directamente.
--   La vigencia arranca AHORA, no en la publicación antigua. Esto evita que una
--   confirmación reciente quede POR REVISAR por arrastrar una fecha vieja.
create or replace function public.fn_confirmar_por_proveedor(
  p_talla_id       uuid,
  p_vigencia_horas smallint default null
)
returns public.tallas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fila  public.tallas;
  v_horas smallint;
  v_ahora timestamptz := now();
begin
  if not public.fn_es_administrador() then
    raise exception 'Solo un administrador puede confirmar disponibilidad.';
  end if;

  v_horas := coalesce(
    p_vigencia_horas,
    (select valor::smallint from public.configuracion
      where clave = 'vigencia_horas_predeterminada'),
    48);

  update public.tallas
     set estado         = 'CONFIRMADA',
         confirmado_en  = v_ahora,
         vigencia_desde = v_ahora,          -- el reloj arranca en la confirmación
         vigencia_horas = v_horas,
         origen         = 'proveedor',
         activa         = true
   where id = p_talla_id
  returning * into v_fila;

  if v_fila.id is null then
    raise exception 'No existe la talla %', p_talla_id;
  end if;
  return v_fila;
end;
$$;

-- Agotar. No vence nunca: permanece hasta que se reactive con evidencia.
create or replace function public.fn_marcar_agotada(p_talla_id uuid, p_nota text default null)
returns public.tallas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fila public.tallas;
begin
  if not public.fn_es_administrador() then
    raise exception 'Solo un administrador puede marcar agotado.';
  end if;

  update public.tallas
     set estado         = 'AGOTADA',
         vigencia_desde = null,
         vence_en       = null,
         nota           = coalesce(p_nota, nota),
         origen         = 'proveedor'
   where id = p_talla_id
  returning * into v_fila;

  if v_fila.id is null then
    raise exception 'No existe la talla %', p_talla_id;
  end if;
  return v_fila;
end;
$$;
