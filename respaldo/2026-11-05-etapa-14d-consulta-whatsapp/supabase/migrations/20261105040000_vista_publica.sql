-- Etapa 13 · Vista pública del catálogo
--
-- Devuelve EXACTAMENTE la misma forma que data/productos.json (más la
-- disponibilidad por talla), para que normalizarProducto() y normalizarVariante()
-- de app.js no se toquen en la etapa 14.
--
-- security_invoker = true: sin esto, la vista se ejecutaría con los permisos de su
-- propietario y SE SALTARÍA el RLS de las tablas base (PostgreSQL, CREATE VIEW:
-- «by default, the row-level security policies of the view owner are applied»).
-- Con invoker, manda el RLS del visitante. Por eso lo sensible (historial, notas,
-- estado_migrado, origen, fechas internas) vive en columnas o tablas a las que el
-- visitante no tiene ningún permiso.

create or replace view public.catalogo_publico
with (security_invoker = true)
as
select
  -- «id» es lo que la tienda usa para calcular su clave interna. Se entrega
  -- clave_legado para que un carrito V3 guardado antes de la migración siga
  -- reconociendo sus productos sin tocar la estructura del carrito.
  coalesce(p.clave_legado, p.codigo_interno)      as id,
  p.codigo_interno                                 as "codigoInterno",
  p.referencia_proveedor                           as referencia,
  p.nombre,
  p.marca,
  p.categoria,
  p.descripcion,
  p.segmento,
  p.destacado,
  p.nuevo_ingreso                                  as "nuevoIngreso",
  p.orden,
  (
    select coalesce(
      jsonb_agg(v.variante order by v.orden, v.codigo_variante),
      '[]'::jsonb)
    from (
      select
        va.orden,
        va.codigo_variante,
        jsonb_build_object(
          'id',             coalesce(va.id_legado, va.codigo_variante),
          'codigoVariante', va.codigo_variante,
          'color',          va.color,
          'referencia',     va.referencia_variante,
          'precio',         va.precio,
          'precioAnterior', va.precio_anterior,
          'imagenes', (
            select coalesce(jsonb_agg(f.ruta order by f.orden, f.ruta), '[]'::jsonb)
            from public.fotos f
            where f.variante_id = va.id
          ),
          -- Las tres listas de tallas, por estado público calculado al leer.
          'tallasDisponibles', public.fn_tallas_por_estado(va.id, 'DISPONIBLE'),
          'tallasAgotadas',    public.fn_tallas_por_estado(va.id, 'AGOTADO'),
          'tallasPorRevisar',  public.fn_tallas_por_estado(va.id, 'POR_REVISAR'),
          -- Detalle por talla, para la etapa 14.
          'tallas', (
            select coalesce(jsonb_agg(
                     jsonb_build_object(
                       'talla',         t.talla,
                       'estado',        public.fn_estado_publico(t.estado, t.vigencia_desde, t.vence_en),
                       'vigenciaDesde', t.vigencia_desde,
                       'venceEn',       t.vence_en
                     ) order by public.fn_valor_talla(t.talla), t.talla), '[]'::jsonb)
            from public.tallas t
            where t.variante_id = va.id and t.activa
          )
        ) as variante
      from public.variantes va
      where va.producto_id = p.id and va.activa
    ) v
  ) as variantes
from public.productos p
where p.activo;

comment on view public.catalogo_publico is
  'Catalogo que lee la tienda. Solo productos activos. El estado de cada talla se calcula al leer.';
