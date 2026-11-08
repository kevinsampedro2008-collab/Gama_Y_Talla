-- Etapa 16 · Administrar el catálogo desde el panel
--
-- QUÉ AÑADE
-- ---------
-- 1. Tres columnas de control en productos (solo el administrador las lee: anon tiene permisos
--    columna a columna y no recibe estas):
--      · version           sube en cada guardado del panel. Protege contra formularios
--                          desactualizados: se compara y se actualiza en la misma sentencia.
--      · ultima_operacion  identificador aleatorio que el panel genera para cada guardado. Si
--                          se pierde la respuesta, releerlo DEMUESTRA si ese guardado se aplicó
--                          (nadie más conoce ese valor), y repetir la misma operación no hace
--                          nada dos veces.
--      · retirado_en       producto retirado del catálogo: oculto, conserva todos sus
--                          registros y relaciones y no se puede publicar sin restaurarlo antes.
-- 2. fn_admin_guardar_producto: producto, colores, precios, tallas y galería en UNA transacción.
--    Si algo falla no queda nada a medias. Nunca publica, nunca confirma disponibilidad y
--    nunca renueva vigencias: una talla nueva nace «por revisar» y las existentes solo pueden
--    desactivarse o reactivarse. Para la activación de una talla existente, el formulario envía
--    también el valor que tenía al abrirse («activa_original»): solo se aplica lo que la persona
--    cambió, y solo si la talla sigue como estaba (comparación y escritura en la misma sentencia,
--    con la fila bloqueada). Si la cambió otra acción (por ejemplo, una confirmación de 15B que la
--    reactivó, sin pasar por productos.version), se conserva y se informa en «tallas_conservadas».
-- 3. fn_admin_estado_producto: publicar (con comprobación de que está completo), ocultar,
--    retirar y restaurar. Separado del guardado: guardar un producto oculto no lo publica.
--    Publicar exige UN MISMO color visible con al menos una foto y una talla activa.
--
-- Las dos son SECURITY INVOKER: escriben con los privilegios y el RLS del administrador
-- (admin_total_*), y además comprueban fn_es_administrador() al empezar para dar un error
-- claro. No borran tallas ni variantes: no hay DELETE físico. El historial lo siguen
-- escribiendo los disparadores existentes; las filas de un mismo guardado comparten el «lote»
-- (gamaytalla.lote = la operación), que es el mecanismo previsto en 20261105030000.
--
-- ERRORES (PostgREST usa el código PTnnn como estado HTTP):
--   42501 → 403  sin permiso de administrador
--   PT404 → 404  la zapatilla no existe
--   PT409 → 409  conflicto: otra edición se guardó antes (detail = versión actual) o el
--                identificador ya existe
--   PT422 → 422  datos no válidos; el mensaje dice qué corregir (y no se guardó nada)
--   23514 → 400  formato de talla o fecha rechazado por las restricciones existentes

-- =====================================================================
-- 1. Columnas de control
-- =====================================================================
alter table public.productos
  add column if not exists version          integer not null default 1,
  add column if not exists ultima_operacion uuid,
  add column if not exists retirado_en      timestamptz;

alter table public.productos drop constraint if exists productos_version_positiva;
alter table public.productos add constraint productos_version_positiva check (version >= 1);

-- Un producto retirado nunca está publicado.
alter table public.productos drop constraint if exists productos_retirado_oculto;
alter table public.productos add constraint productos_retirado_oculto check (retirado_en is null or not activo);

comment on column public.productos.version is
  'Version del producto para el panel: sube en cada guardado. Evita sobrescribir una edicion mas reciente.';
comment on column public.productos.ultima_operacion is
  'Identificador aleatorio del ultimo guardado del panel. Permite saber si un guardado sin respuesta se aplico.';
comment on column public.productos.retirado_en is
  'Producto retirado del catalogo: oculto y conservado. Restaurarlo lo deja oculto.';

-- =====================================================================
-- 2. Guardar un producto completo
-- =====================================================================
-- p_datos: { id, nombre, marca, categoria, referencia_proveedor, descripcion, segmento,
--            destacado, nuevo_ingreso, orden,
--            variantes: [ { id, color, referencia_variante, precio, precio_anterior, activa,
--                           orden, tallas: [ { id, talla, activa, activa_original } ],
--                           fotos: [ { ruta, alt } ] } ] }
-- p_version: null para crear; la versión que tenía el formulario para editar.
-- p_operacion: identificador aleatorio del guardado (lo genera el panel y lo conserva si
--              tiene que reintentar).
create or replace function public.fn_admin_guardar_producto(
  p_datos     jsonb,
  p_version   integer,
  p_operacion uuid
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_id           uuid;
  v_actual       record;
  v_version      integer;
  v_codigo       text;
  v_var          jsonb;
  v_var_id       uuid;
  v_talla        jsonb;
  v_talla_id     uuid;
  v_foto         jsonb;
  v_ruta         text;
  v_objeto       text;
  v_rutas        text[];
  v_ids          uuid[];
  v_valor        numeric;
  v_choque       text;
  v_precio       integer;
  v_anterior     integer;
  v_texto        text;
  v_n            integer;
  v_existente    record;
  v_resultado    jsonb := '[]'::jsonb;
  v_conservadas  jsonb := '[]'::jsonb;
  v_activa       boolean;
  v_original     boolean;
begin
  if not public.fn_es_administrador() then
    raise exception 'Solo un administrador puede guardar productos.' using errcode = '42501';
  end if;
  if p_operacion is null then
    raise exception 'Falta el identificador de la operación.' using errcode = 'PT422';
  end if;
  if p_datos is null or pg_catalog.jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Los datos del producto no son válidos.' using errcode = 'PT422';
  end if;

  begin
    v_id := (p_datos ->> 'id')::uuid;
  exception when others then
    v_id := null;
  end;
  if v_id is null then
    raise exception 'Falta el identificador del producto.' using errcode = 'PT422';
  end if;

  -- Todas las filas de este guardado comparten lote en el historial.
  perform pg_catalog.set_config('gamaytalla.lote', p_operacion::text, true);

  select p.id, p.version, p.ultima_operacion, p.codigo_interno
    into v_actual
    from public.productos p
   where p.id = v_id
     for update;

  -- La misma operación ya se aplicó (reintento tras perder la respuesta, doble envío):
  -- no se repite nada.
  if found and v_actual.ultima_operacion = p_operacion then
    return pg_catalog.jsonb_build_object('estado', 'ya_aplicada', 'id', v_id,
             'codigo_interno', v_actual.codigo_interno, 'version', v_actual.version);
  end if;

  if p_version is null and found then
    raise exception 'Ya existe un producto con este identificador.'
      using errcode = 'PT409', detail = pg_catalog.jsonb_build_object('motivo', 'existe', 'version', v_actual.version)::text;
  end if;
  if p_version is not null and not found then
    raise exception 'La zapatilla ya no existe.' using errcode = 'PT404';
  end if;
  if p_version is not null and v_actual.version <> p_version then
    raise exception 'Otra edición de esta zapatilla se guardó antes que la tuya.'
      using errcode = 'PT409', detail = pg_catalog.jsonb_build_object('motivo', 'version', 'version', v_actual.version)::text;
  end if;

  -- ------------------------------------------------ datos del producto
  v_texto := pg_catalog.btrim(coalesce(p_datos ->> 'nombre', ''));
  if v_texto = '' or pg_catalog.length(v_texto) > 120 then
    raise exception 'Escribe el nombre del modelo (hasta 120 caracteres).' using errcode = 'PT422';
  end if;
  v_texto := pg_catalog.btrim(coalesce(p_datos ->> 'marca', ''));
  if v_texto = '' or pg_catalog.length(v_texto) > 60 then
    raise exception 'Escribe la marca (hasta 60 caracteres).' using errcode = 'PT422';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_datos ->> 'categoria', ''))) not between 1 and 60 then
    raise exception 'Escribe la categoría (hasta 60 caracteres).' using errcode = 'PT422';
  end if;
  if pg_catalog.length(coalesce(p_datos ->> 'referencia_proveedor', '')) > 60
     or pg_catalog.length(coalesce(p_datos ->> 'segmento', '')) > 60 then
    raise exception 'La referencia y el segmento admiten hasta 60 caracteres.' using errcode = 'PT422';
  end if;
  if pg_catalog.length(coalesce(p_datos ->> 'descripcion', '')) > 2000 then
    raise exception 'La descripción admite hasta 2000 caracteres.' using errcode = 'PT422';
  end if;
  if pg_catalog.jsonb_typeof(p_datos -> 'variantes') is distinct from 'array'
     or pg_catalog.jsonb_array_length(p_datos -> 'variantes') > 20 then
    raise exception 'Los colores no son válidos (como mucho 20).' using errcode = 'PT422';
  end if;

  if p_version is null then
    -- Se crea OCULTO: publicarlo es otra acción, con su propia comprobación.
    insert into public.productos (id, nombre, marca, categoria, referencia_proveedor, descripcion,
                                  segmento, destacado, nuevo_ingreso, orden, activo, version, ultima_operacion)
    values (v_id,
            pg_catalog.btrim(p_datos ->> 'nombre'),
            pg_catalog.btrim(p_datos ->> 'marca'),
            pg_catalog.btrim(p_datos ->> 'categoria'),
            nullif(pg_catalog.btrim(coalesce(p_datos ->> 'referencia_proveedor', '')), ''),
            nullif(pg_catalog.btrim(coalesce(p_datos ->> 'descripcion', '')), ''),
            nullif(pg_catalog.btrim(coalesce(p_datos ->> 'segmento', '')), ''),
            coalesce((p_datos ->> 'destacado')::boolean, false),
            coalesce((p_datos ->> 'nuevo_ingreso')::boolean, false),
            coalesce((p_datos ->> 'orden')::integer, 0),
            false, 1, p_operacion)
    returning codigo_interno, version into v_codigo, v_version;
  else
    -- Comparación y actualización juntas: la fila está bloqueada desde la lectura anterior.
    update public.productos p
       set nombre               = pg_catalog.btrim(p_datos ->> 'nombre'),
           marca                = pg_catalog.btrim(p_datos ->> 'marca'),
           categoria            = pg_catalog.btrim(p_datos ->> 'categoria'),
           referencia_proveedor = nullif(pg_catalog.btrim(coalesce(p_datos ->> 'referencia_proveedor', '')), ''),
           descripcion          = nullif(pg_catalog.btrim(coalesce(p_datos ->> 'descripcion', '')), ''),
           segmento             = nullif(pg_catalog.btrim(coalesce(p_datos ->> 'segmento', '')), ''),
           destacado            = coalesce((p_datos ->> 'destacado')::boolean, false),
           nuevo_ingreso        = coalesce((p_datos ->> 'nuevo_ingreso')::boolean, false),
           orden                = coalesce((p_datos ->> 'orden')::integer, 0),
           version              = p.version + 1,
           ultima_operacion     = p_operacion
     where p.id = v_id and p.version = p_version
    returning codigo_interno, version into v_codigo, v_version;
    if not found then
      raise exception 'Otra edición de esta zapatilla se guardó antes que la tuya.' using errcode = 'PT409';
    end if;
  end if;

  -- ------------------------------------------------ colores
  -- El formulario debe traer TODOS los colores que ya existen: nada se borra y un color que
  -- falta indicaría un formulario incompleto o desactualizado.
  select pg_catalog.array_agg(v.id) into v_ids
    from public.variantes v
   where v.producto_id = v_id
     and not exists (select 1 from pg_catalog.jsonb_array_elements(p_datos -> 'variantes') e
                      where e ->> 'id' = v.id::text);
  if v_ids is not null then
    raise exception 'El formulario no incluye todos los colores de esta zapatilla. Recarga los datos.' using errcode = 'PT409';
  end if;

  for v_var in select * from pg_catalog.jsonb_array_elements(p_datos -> 'variantes') loop
    begin
      v_var_id := (v_var ->> 'id')::uuid;
    exception when others then
      v_var_id := null;
    end;
    if v_var_id is null then
      raise exception 'Falta el identificador de un color.' using errcode = 'PT422';
    end if;

    v_texto := pg_catalog.btrim(coalesce(v_var ->> 'color', ''));
    if v_texto = '' or pg_catalog.length(v_texto) > 60 then
      raise exception 'Escribe el nombre de cada color (hasta 60 caracteres).' using errcode = 'PT422';
    end if;
    begin
      v_precio   := coalesce((v_var ->> 'precio')::integer, 0);
      v_anterior := coalesce((v_var ->> 'precio_anterior')::integer, 0);
    exception when others then
      raise exception 'El precio de «%» debe ser un número entero de pesos.', v_texto using errcode = 'PT422';
    end;
    if v_precio < 0 or v_precio > 100000000 or v_anterior < 0 or v_anterior > 100000000 then
      raise exception 'El precio de «%» debe estar entre 0 y 100.000.000.', v_texto using errcode = 'PT422';
    end if;
    -- Precio 0 = «Precio por confirmar»: no admite un precio anterior (no hay descuento que
    -- mostrar). Un precio anterior debe ser mayor que el actual.
    if v_anterior > 0 and (v_precio = 0 or v_anterior <= v_precio) then
      raise exception 'En «%», el precio anterior debe ser mayor que el actual (y el actual no puede ser 0).', v_texto
        using errcode = 'PT422';
    end if;
    if pg_catalog.length(coalesce(v_var ->> 'referencia_variante', '')) > 60 then
      raise exception 'La referencia del color admite hasta 60 caracteres.' using errcode = 'PT422';
    end if;

    select v.id, v.producto_id into v_existente from public.variantes v where v.id = v_var_id;
    if found and v_existente.producto_id <> v_id then
      raise exception 'Un color del formulario pertenece a otra zapatilla.' using errcode = 'PT422';
    end if;

    if found then
      update public.variantes v
         set color               = v_texto,
             referencia_variante = nullif(pg_catalog.btrim(coalesce(v_var ->> 'referencia_variante', '')), ''),
             precio              = v_precio,
             precio_anterior     = v_anterior,
             activa              = coalesce((v_var ->> 'activa')::boolean, true),
             orden               = coalesce((v_var ->> 'orden')::integer, 0)
       where v.id = v_var_id
         and (v.color, v.referencia_variante, v.precio, v.precio_anterior, v.activa, v.orden)
             is distinct from
             (v_texto, nullif(pg_catalog.btrim(coalesce(v_var ->> 'referencia_variante', '')), ''), v_precio, v_anterior,
              coalesce((v_var ->> 'activa')::boolean, true), coalesce((v_var ->> 'orden')::integer, 0));
    else
      insert into public.variantes (id, producto_id, color, referencia_variante, precio, precio_anterior, activa, orden)
      values (v_var_id, v_id, v_texto,
              nullif(pg_catalog.btrim(coalesce(v_var ->> 'referencia_variante', '')), ''),
              v_precio, v_anterior, coalesce((v_var ->> 'activa')::boolean, true),
              coalesce((v_var ->> 'orden')::integer, 0));
    end if;

    -- ---------------------------------------------- tallas del color
    if pg_catalog.jsonb_typeof(coalesce(v_var -> 'tallas', '[]'::jsonb)) <> 'array'
       or pg_catalog.jsonb_array_length(coalesce(v_var -> 'tallas', '[]'::jsonb)) > 40 then
      raise exception 'Las tallas de «%» no son válidas (como mucho 40).', v_texto using errcode = 'PT422';
    end if;
    select pg_catalog.array_agg(t.talla) into v_rutas
      from public.tallas t
     where t.variante_id = v_var_id
       and not exists (select 1 from pg_catalog.jsonb_array_elements(coalesce(v_var -> 'tallas', '[]'::jsonb)) e
                        where e ->> 'id' = t.id::text);
    if v_rutas is not null then
      raise exception 'El formulario no incluye todas las tallas de «%». Recarga los datos.', v_texto using errcode = 'PT409';
    end if;

    for v_talla in select * from pg_catalog.jsonb_array_elements(coalesce(v_var -> 'tallas', '[]'::jsonb)) loop
      begin
        v_talla_id := (v_talla ->> 'id')::uuid;
      exception when others then
        v_talla_id := null;
      end;
      if v_talla_id is null then
        raise exception 'Falta el identificador de una talla de «%».', v_texto using errcode = 'PT422';
      end if;

      -- Bloqueada: una confirmación de 15B sobre esta talla espera a que termine este guardado.
      select t.id, t.variante_id, t.talla, t.activa into v_existente from public.tallas t where t.id = v_talla_id for update;
      if found then
        if v_existente.variante_id <> v_var_id then
          raise exception 'Una talla del formulario pertenece a otro color.' using errcode = 'PT422';
        end if;
        -- La etiqueta no cambia: la usan el carrito y el historial.
        if v_existente.talla <> (v_talla ->> 'talla') then
          raise exception 'La talla % no se puede renombrar; desactívala y añade la nueva.', v_existente.talla using errcode = 'PT422';
        end if;
        -- Solo activa/inactiva: no se toca su estado ni su vigencia. Y solo lo que la persona
        -- cambió respecto a lo que vio al abrir el formulario.
        if pg_catalog.jsonb_typeof(v_talla -> 'activa_original') is distinct from 'boolean'
           or pg_catalog.jsonb_typeof(v_talla -> 'activa') is distinct from 'boolean' then
          raise exception 'Falta el estado original de la talla % de «%». Recarga el formulario.', v_existente.talla, v_texto
            using errcode = 'PT422';
        end if;
        v_activa := (v_talla ->> 'activa')::boolean;
        v_original := (v_talla ->> 'activa_original')::boolean;
        if v_activa is distinct from v_original then
          -- Comparación y escritura juntas: solo si la talla sigue como la vio el formulario.
          -- Si no, ya tiene el valor pedido (son booleanos) y no hay nada que hacer.
          update public.tallas t set activa = v_activa where t.id = v_talla_id and t.activa = v_original;
        elsif v_existente.activa is distinct from v_original then
          -- La persona no la tocó y otra acción la cambió mientras tanto: se conserva.
          v_conservadas := v_conservadas || pg_catalog.jsonb_build_object('id', v_talla_id, 'talla', v_existente.talla,
                                                                         'color', v_texto, 'activa', v_existente.activa);
        end if;
      else
        v_valor := public.fn_valor_talla(v_talla ->> 'talla');
        if v_valor is null then
          raise exception 'La talla «%» no tiene un formato válido (por ejemplo 40, 40,5 o 40 1/3).',
                          coalesce(v_talla ->> 'talla', '') using errcode = 'PT422';
        end if;
        -- Equivalentes numéricos: 40,5 y 40.5 serían la misma talla vista dos veces.
        select t.talla into v_choque
          from public.tallas t
         where t.variante_id = v_var_id and public.fn_valor_talla(t.talla) = v_valor
         limit 1;
        if found then
          raise exception 'La talla % de «%» equivale a la talla % que ya existe. Reactívala en lugar de añadirla otra vez.',
                          v_talla ->> 'talla', v_texto, v_choque using errcode = 'PT422';
        end if;
        -- Nace por revisar: crear una talla no confirma disponibilidad.
        insert into public.tallas (id, variante_id, talla, activa, estado, origen)
        values (v_talla_id, v_var_id, v_talla ->> 'talla', coalesce((v_talla ->> 'activa')::boolean, true), 'REVISAR', 'manual');
      end if;
    end loop;

    -- ---------------------------------------------- galería del color
    if pg_catalog.jsonb_typeof(coalesce(v_var -> 'fotos', '[]'::jsonb)) <> 'array'
       or pg_catalog.jsonb_array_length(coalesce(v_var -> 'fotos', '[]'::jsonb)) > 12 then
      raise exception 'La galería de «%» admite como mucho 12 fotos.', v_texto using errcode = 'PT422';
    end if;
    v_rutas := array[]::text[];
    v_n := 0;
    for v_foto in select * from pg_catalog.jsonb_array_elements(coalesce(v_var -> 'fotos', '[]'::jsonb)) loop
      v_ruta := coalesce(v_foto ->> 'ruta', '');
      if v_ruta = any (v_rutas) then
        raise exception 'Una foto aparece dos veces en la galería de «%».', v_texto using errcode = 'PT422';
      end if;
      if pg_catalog.length(coalesce(v_foto ->> 'alt', '')) > 200 then
        raise exception 'La descripción de una foto admite hasta 200 caracteres.' using errcode = 'PT422';
      end if;
      -- Una ruta nueva debe ser un archivo de este producto que YA está en Storage: nunca se
      -- guarda la referencia de una subida que falló. Las que ya estaban en la galería (por
      -- ejemplo, imágenes del repositorio) se conservan tal cual.
      if not exists (select 1 from public.fotos f where f.variante_id = v_var_id and f.ruta = v_ruta) then
        v_objeto := (pg_catalog.regexp_match(v_ruta,
          '^https?://[^/?#]+/storage/v1/object/public/fotos-catalogo/(productos/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9]{13}-[0-9a-z]{10}[.]webp)$'))[1];
        if v_objeto is null or pg_catalog.split_part(v_objeto, '/', 2) <> v_id::text then
          raise exception 'Una foto de «%» no es un archivo subido para esta zapatilla.', v_texto using errcode = 'PT422';
        end if;
        if not exists (select 1 from storage.objects o where o.bucket_id = 'fotos-catalogo' and o.name = v_objeto) then
          raise exception 'Una foto de «%» no terminó de subirse. Vuelve a subirla.', v_texto using errcode = 'PT422';
        end if;
      end if;
      v_rutas := v_rutas || v_ruta;
    end loop;

    -- Quitar de la galería = quitar la fila. El archivo sigue en Storage hasta que se borre
    -- expresamente desde el panel.
    delete from public.fotos f where f.variante_id = v_var_id and not (f.ruta = any (v_rutas));
    v_n := 0;
    for v_foto in select * from pg_catalog.jsonb_array_elements(coalesce(v_var -> 'fotos', '[]'::jsonb)) loop
      insert into public.fotos as f (variante_id, ruta, orden, alt)
      values (v_var_id, v_foto ->> 'ruta', v_n, nullif(pg_catalog.btrim(coalesce(v_foto ->> 'alt', '')), ''))
      on conflict (variante_id, ruta) do update
        set orden = excluded.orden, alt = excluded.alt
        where (f.orden, f.alt) is distinct from (excluded.orden, excluded.alt);
      v_n := v_n + 1;
    end loop;

    v_resultado := v_resultado || pg_catalog.jsonb_build_object('id', v_var_id,
      'codigo_variante', (select v.codigo_variante from public.variantes v where v.id = v_var_id));
  end loop;

  return pg_catalog.jsonb_build_object('estado', 'aplicada', 'id', v_id, 'codigo_interno', v_codigo,
                                       'version', v_version, 'variantes', v_resultado,
                                       'tallas_conservadas', v_conservadas);
end;
$$;

comment on function public.fn_admin_guardar_producto(jsonb, integer, uuid) is
  'Panel: guarda producto, colores, tallas y galeria en una transaccion. No publica ni confirma disponibilidad. Exige administrador.';

-- =====================================================================
-- 3. Publicar, ocultar, retirar y restaurar
-- =====================================================================
create or replace function public.fn_admin_estado_producto(
  p_id        uuid,
  p_accion    text,
  p_version   integer,
  p_operacion uuid
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_actual    record;
  v_version   integer;
  v_faltan    text[] := array[]::text[];
begin
  if not public.fn_es_administrador() then
    raise exception 'Solo un administrador puede publicar u ocultar productos.' using errcode = '42501';
  end if;
  if p_id is null or p_operacion is null or p_version is null
     or p_accion is null or p_accion not in ('publicar', 'ocultar', 'retirar', 'restaurar') then
    raise exception 'La acción no es válida.' using errcode = 'PT422';
  end if;
  perform pg_catalog.set_config('gamaytalla.lote', p_operacion::text, true);

  select p.id, p.version, p.ultima_operacion, p.activo, p.retirado_en
    into v_actual
    from public.productos p
   where p.id = p_id
     for update;
  if not found then
    raise exception 'La zapatilla ya no existe.' using errcode = 'PT404';
  end if;
  if v_actual.ultima_operacion = p_operacion then
    return pg_catalog.jsonb_build_object('estado', 'ya_aplicada', 'id', p_id, 'version', v_actual.version,
                                         'activo', v_actual.activo, 'retirado', v_actual.retirado_en is not null);
  end if;
  if v_actual.version <> p_version then
    raise exception 'Otra edición de esta zapatilla se guardó antes que la tuya.'
      using errcode = 'PT409', detail = pg_catalog.jsonb_build_object('motivo', 'version', 'version', v_actual.version)::text;
  end if;

  if p_accion = 'publicar' then
    if v_actual.retirado_en is not null then
      raise exception 'Esta zapatilla está retirada. Restáurala antes de publicarla.' using errcode = 'PT422';
    end if;
    -- Completa = UN MISMO color visible con al menos una foto y al menos una talla activa (una
    -- foto en un color y una talla en otro no dejan ningún color comprable). Un color oculto no
    -- cuenta. Publicar NO toca las tallas: su disponibilidad sigue siendo la que era.
    if not exists (select 1 from public.variantes v where v.producto_id = p_id and v.activa) then
      v_faltan := v_faltan || 'al menos un color visible'::text;
    elsif not exists (select 1 from public.variantes v where v.producto_id = p_id and v.activa
                         and exists (select 1 from public.fotos f where f.variante_id = v.id)
                         and exists (select 1 from public.tallas t where t.variante_id = v.id and t.activa)) then
      if not exists (select 1 from public.variantes v where v.producto_id = p_id and v.activa
                        and exists (select 1 from public.fotos f where f.variante_id = v.id)) then
        v_faltan := v_faltan || 'una foto en un color visible'::text;
      end if;
      if not exists (select 1 from public.variantes v where v.producto_id = p_id and v.activa
                        and exists (select 1 from public.tallas t where t.variante_id = v.id and t.activa)) then
        v_faltan := v_faltan || 'una talla activa en un color visible'::text;
      end if;
      if pg_catalog.cardinality(v_faltan) = 0 then
        v_faltan := v_faltan || 'un mismo color visible que tenga a la vez foto y talla activa (hoy la foto y las tallas están en colores distintos)'::text;
      end if;
    end if;
    if pg_catalog.cardinality(v_faltan) > 0 then
      raise exception 'Para publicarla falta: %.', pg_catalog.array_to_string(v_faltan, ', ')
        using errcode = 'PT422';
    end if;
  end if;

  update public.productos p
     set activo           = case p_accion when 'publicar' then true else false end,
         retirado_en      = case p_accion when 'retirar' then coalesce(p.retirado_en, pg_catalog.now())
                                          when 'restaurar' then null
                                          else p.retirado_en end,
         version          = p.version + 1,
         ultima_operacion = p_operacion
   where p.id = p_id and p.version = p_version
  returning version into v_version;
  if not found then
    raise exception 'Otra edición de esta zapatilla se guardó antes que la tuya.' using errcode = 'PT409';
  end if;

  return pg_catalog.jsonb_build_object('estado', 'aplicada', 'id', p_id, 'version', v_version,
                                       'activo', p_accion = 'publicar', 'retirado',
                                       (p_accion = 'retirar') or (p_accion <> 'restaurar' and v_actual.retirado_en is not null));
end;
$$;

comment on function public.fn_admin_estado_producto(uuid, text, integer, uuid) is
  'Panel: publicar (si esta completo), ocultar, retirar o restaurar un producto. No toca tallas ni vigencias. Exige administrador.';

-- =====================================================================
-- 4. Permisos: solo authenticated (el RLS y la comprobación interna deciden)
-- =====================================================================
-- Nacen cerradas por los predeterminados de 20261107010000; se dejan explícitas.
grant execute on function public.fn_admin_guardar_producto(jsonb, integer, uuid) to authenticated;
grant execute on function public.fn_admin_estado_producto(uuid, text, integer, uuid) to authenticated;
revoke all on function public.fn_admin_guardar_producto(jsonb, integer, uuid) from public, anon, service_role;
revoke all on function public.fn_admin_estado_producto(uuid, text, integer, uuid) from public, anon, service_role;
