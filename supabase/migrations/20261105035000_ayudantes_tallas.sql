-- Etapa 13 · Ayudantes de tallas usados por la vista pública.
-- Deben existir antes que la vista: una vista resuelve sus funciones al crearse.

-- Valor numérico de una talla, para ordenarlas: «40» -> 40, «40 2/3» -> 40.67.
-- Adidas numera en tercios, así que el orden alfabético no sirve.
-- IMMUTABLE: solo hace cuentas con su argumento.
create or replace function public.fn_valor_talla(p_talla text)
returns numeric
language sql
immutable
as $$
  select coalesce(
    (regexp_match(p_talla, '^\s*(\d+(?:[.,]\d+)?)'))[1]::numeric, 0)
  + case
      when p_talla ~ '\d+\s*/\s*\d+' then
        (regexp_match(p_talla, '(\d+)\s*/\s*(\d+)'))[1]::numeric
        / nullif((regexp_match(p_talla, '(\d+)\s*/\s*(\d+)'))[2]::numeric, 0)
      else 0
    end;
$$;

-- Tallas activas de una variante que están en un estado público concreto.
-- STABLE porque el estado depende de now().
create or replace function public.fn_tallas_por_estado(
  p_variante_id uuid,
  p_estado      public.estado_publico
)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(t.talla order by public.fn_valor_talla(t.talla), t.talla), '[]'::jsonb)
  from public.tallas t
  where t.variante_id = p_variante_id
    and t.activa
    and public.fn_estado_publico(t.estado, t.vigencia_desde, t.vence_en) = p_estado;
$$;
