-- Etapa 17 · Público obligatorio con la opción Unisex
--
-- QUÉ CAMBIA
-- ----------
-- 1. productos.publico admite 'hombre', 'dama' y 'unisex'. NULL se conserva para los registros
--    heredados (sin clasificar): siguen visibles en «Todos» de la tienda, sin etiqueta. Esta
--    migración NO modifica ninguna fila: ni identidad, ni códigos, ni versiones, ni historial.
-- 2. fn_admin_guardar_producto (misma firma y permisos) exige el público:
--      · enviado: hombre, dama o unisex; null, vacío u otro valor se rechazan con PT422, así que
--        nadie quita una clasificación;
--      · ausente: un cliente anterior que edita una zapatilla YA clasificada conserva su valor;
--        al crear, o si la zapatilla aún no tiene público, se rechaza (hay que clasificarla la
--        próxima vez que se guarde desde el panel).
--    El error lleva detail = {"motivo":"publico"} y la respuesta, «publico_obligatorio»: true.
-- 3. fn_admin_estado_producto (misma firma y permisos): «publicar» exige además el público. Ocultar,
--    retirar y restaurar no lo exigen (un heredado sin clasificar puede ocultarse o retirarse).
-- 4. El público sigue siendo independiente de productos.segmento (tabla de la guía de tallas).
--    catalogo_publico no cambia: entrega «publico» tal como está guardado ('unisex' incluido).
--
-- Si un servidor no tiene esta migración, su función rechaza 'unisex' («El público debe ser Hombre
-- o Dama…») y el panel conserva el formulario y explica que falta aplicarla.

-- =====================================================================
-- 1. Restricción de la columna
-- =====================================================================
alter table public.productos drop constraint if exists productos_publico_valido;
alter table public.productos add constraint productos_publico_valido
  check (publico is null or publico in ('hombre', 'dama', 'unisex'));
comment on column public.productos.publico is
  'Publico de la tienda: hombre, dama o unisex. Obligatorio al guardar o publicar desde el panel; null solo en registros heredados sin clasificar. Independiente de segmento (tabla de la guia de tallas).';

-- =====================================================================
-- 2. Guardar un producto: público obligatorio
-- =====================================================================
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
  v_cod_pedido   text;
  v_publico      text;
  v_publico_pide boolean;
  v_muestra      text;
  v_var          jsonb;
  v_var_id       uuid;
  v_talla        jsonb;
  v_talla_id     uuid;
  v_foto         jsonb;
  v_ruta         text;
  v_objeto       text;
  v_rutas        text[];
  v_codigos      text[] := array[]::text[];
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
  v_existe       boolean;
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

  perform pg_catalog.set_config('gamaytalla.lote', p_operacion::text, true);

  select p.id, p.version, p.ultima_operacion, p.codigo_interno, p.nombre, p.publico
    into v_actual
    from public.productos p
   where p.id = v_id
     for update;
  v_existe := found;

  if found and v_actual.ultima_operacion = p_operacion then
    return pg_catalog.jsonb_build_object('estado', 'ya_aplicada', 'id', v_id,
             'codigo_interno', v_actual.codigo_interno, 'version', v_actual.version, 'codigos_editables', true,
             'publico_y_muestras', true, 'publico_obligatorio', true);
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

  -- ------------------------------------------------ código de la zapatilla
  -- null = no se cambia (o se genera, al crear).
  v_cod_pedido := null;
  if p_datos ? 'codigo_interno' and pg_catalog.jsonb_typeof(p_datos -> 'codigo_interno') <> 'null' then
    v_cod_pedido := pg_catalog.upper(pg_catalog.btrim(p_datos ->> 'codigo_interno'));
    if v_cod_pedido = '' then
      if p_version is not null then
        raise exception 'El código de la zapatilla no puede quedar vacío.' using errcode = 'PT422';
      end if;
      v_cod_pedido := null;
    elsif p_version is not null and v_cod_pedido = v_actual.codigo_interno then
      v_cod_pedido := null;
    elsif v_cod_pedido !~ '^[A-Z0-9Ñ][A-Z0-9Ñ._/-]{0,28}[A-Z0-9Ñ]$' then
      raise exception 'El código de la zapatilla debe tener entre 2 y 30 caracteres: letras, números y - _ . / (sin espacios ni símbolos al principio o al final).'
        using errcode = 'PT422';
    else
      select p.nombre into v_choque from public.productos p where p.codigo_interno = v_cod_pedido and p.id <> v_id;
      if found then
        raise exception 'El código «%» ya lo usa la zapatilla «%». Elige otro.', v_cod_pedido, v_choque using errcode = 'PT422';
      end if;
    end if;
  end if;

  -- ------------------------------------------------ público (17: obligatorio, con Unisex)
  -- Enviado: debe ser hombre, dama o unisex (sin distinguir mayúsculas ni espacios exteriores);
  -- null, vacío u otro valor se rechazan, así que nadie quita la clasificación por esta vía.
  -- Ausente: un cliente anterior que edita una zapatilla YA clasificada la conserva; al crear,
  -- o si la zapatilla todavía no tiene público (registros heredados), se exige elegirlo.
  v_publico_pide := p_datos ? 'publico';
  v_publico := null;
  if v_publico_pide then
    if pg_catalog.jsonb_typeof(p_datos -> 'publico') is distinct from 'string' then
      raise exception 'Elige el público en la tienda: Hombre, Dama o Unisex.' using errcode = 'PT422',
        detail = pg_catalog.jsonb_build_object('motivo', 'publico')::text;
    end if;
    v_publico := nullif(pg_catalog.lower(pg_catalog.btrim(p_datos ->> 'publico')), '');
    if v_publico is null or v_publico not in ('hombre', 'dama', 'unisex') then
      raise exception 'Elige el público en la tienda: Hombre, Dama o Unisex.' using errcode = 'PT422',
        detail = pg_catalog.jsonb_build_object('motivo', 'publico')::text;
    end if;
  elsif not v_existe or v_actual.publico is null then
    raise exception 'Elige el público en la tienda (Hombre, Dama o Unisex): esta zapatilla todavía no lo tiene.' using errcode = 'PT422',
      detail = pg_catalog.jsonb_build_object('motivo', 'publico')::text;
  end if;

  -- ------------------------------------------------ códigos de los colores (antes de escribir nada)
  for v_var in select * from pg_catalog.jsonb_array_elements(p_datos -> 'variantes') loop
    if v_var ? 'codigo_variante' and pg_catalog.jsonb_typeof(v_var -> 'codigo_variante') <> 'null' then
      v_texto := pg_catalog.upper(pg_catalog.btrim(v_var ->> 'codigo_variante'));
      if v_texto <> '' then
        if v_texto = any (v_codigos) then
          raise exception 'Dos colores del formulario tienen el mismo código «%».', v_texto using errcode = 'PT422';
        end if;
        v_codigos := v_codigos || v_texto;
      end if;
    end if;
  end loop;

  if p_version is null then
    begin
      insert into public.productos (id, codigo_interno, nombre, marca, categoria, referencia_proveedor, descripcion,
                                    segmento, destacado, nuevo_ingreso, orden, activo, version, ultima_operacion, publico)
      values (v_id,
              v_cod_pedido,
              pg_catalog.upper(pg_catalog.btrim(p_datos ->> 'nombre')),
              pg_catalog.upper(pg_catalog.btrim(p_datos ->> 'marca')),
              pg_catalog.upper(pg_catalog.btrim(p_datos ->> 'categoria')),
              nullif(pg_catalog.btrim(coalesce(p_datos ->> 'referencia_proveedor', '')), ''),
              nullif(pg_catalog.btrim(coalesce(p_datos ->> 'descripcion', '')), ''),
              nullif(pg_catalog.btrim(coalesce(p_datos ->> 'segmento', '')), ''),
              coalesce((p_datos ->> 'destacado')::boolean, false),
              coalesce((p_datos ->> 'nuevo_ingreso')::boolean, false),
              coalesce((p_datos ->> 'orden')::integer, 0),
              false, 1, p_operacion, v_publico)
      returning codigo_interno, version into v_codigo, v_version;
    exception when unique_violation then
      -- Otro guardado tomó el mismo código entre la comprobación y la escritura.
      raise exception 'El código «%» ya lo usa otra zapatilla. Elige otro.', coalesce(v_cod_pedido, '(automático)') using errcode = 'PT422';
    end;
  else
    begin
      update public.productos p
         set codigo_interno       = coalesce(v_cod_pedido, p.codigo_interno),
             nombre               = pg_catalog.upper(pg_catalog.btrim(p_datos ->> 'nombre')),
             marca                = pg_catalog.upper(pg_catalog.btrim(p_datos ->> 'marca')),
             categoria            = pg_catalog.upper(pg_catalog.btrim(p_datos ->> 'categoria')),
             referencia_proveedor = nullif(pg_catalog.btrim(coalesce(p_datos ->> 'referencia_proveedor', '')), ''),
             descripcion          = nullif(pg_catalog.btrim(coalesce(p_datos ->> 'descripcion', '')), ''),
             segmento             = nullif(pg_catalog.btrim(coalesce(p_datos ->> 'segmento', '')), ''),
             destacado            = coalesce((p_datos ->> 'destacado')::boolean, false),
             nuevo_ingreso        = coalesce((p_datos ->> 'nuevo_ingreso')::boolean, false),
             orden                = coalesce((p_datos ->> 'orden')::integer, 0),
             publico              = case when v_publico_pide then v_publico else p.publico end,
             version              = p.version + 1,
             ultima_operacion     = p_operacion
       where p.id = v_id and p.version = p_version
      returning codigo_interno, version into v_codigo, v_version;
    exception when unique_violation then
      raise exception 'El código «%» ya lo usa otra zapatilla. Elige otro.', v_cod_pedido using errcode = 'PT422';
    end;
    if not found then
      raise exception 'Otra edición de esta zapatilla se guardó antes que la tuya.' using errcode = 'PT409';
    end if;
  end if;

  -- ------------------------------------------------ colores
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

    v_texto := pg_catalog.upper(pg_catalog.btrim(coalesce(v_var ->> 'color', '')));
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
    if v_anterior > 0 and (v_precio = 0 or v_anterior <= v_precio) then
      raise exception 'En «%», el precio anterior debe ser mayor que el actual (y el actual no puede ser 0).', v_texto
        using errcode = 'PT422';
    end if;
    if pg_catalog.length(coalesce(v_var ->> 'referencia_variante', '')) > 60 then
      raise exception 'La referencia del proveedor del color admite hasta 60 caracteres.' using errcode = 'PT422';
    end if;

    select v.id, v.producto_id, v.codigo_variante into v_existente from public.variantes v where v.id = v_var_id;
    if found and v_existente.producto_id <> v_id then
      raise exception 'Un color del formulario pertenece a otra zapatilla.' using errcode = 'PT422';
    end if;

    -- Código del color pedido (null = no se cambia / se genera).
    v_cod_pedido := null;
    if v_var ? 'codigo_variante' and pg_catalog.jsonb_typeof(v_var -> 'codigo_variante') <> 'null' then
      v_cod_pedido := pg_catalog.upper(pg_catalog.btrim(v_var ->> 'codigo_variante'));
      if v_cod_pedido = '' then
        if found then
          raise exception 'El código del color «%» no puede quedar vacío.', v_texto using errcode = 'PT422';
        end if;
        v_cod_pedido := null;
      elsif found and v_cod_pedido = v_existente.codigo_variante then
        v_cod_pedido := null;
      elsif v_cod_pedido !~ '^[A-Z0-9Ñ][A-Z0-9Ñ._/-]{0,38}[A-Z0-9Ñ]$' then
        raise exception 'El código del color «%» debe tener entre 2 y 40 caracteres: letras, números y - _ . / (sin espacios ni símbolos al principio o al final).', v_texto
          using errcode = 'PT422';
      else
        select p.nombre || ' · ' || v.color into v_choque
          from public.variantes v join public.productos p on p.id = v.producto_id
         where v.codigo_variante = v_cod_pedido and v.id <> v_var_id;
        if found then
          raise exception 'El código de color «%» ya lo usa «%». Elige otro.', v_cod_pedido, v_choque using errcode = 'PT422';
        end if;
      end if;
    end if;

    -- Muestra del color (16.3): ausente = no se cambia; null o vacío = sin muestra; si no, un
    -- hexadecimal #rrggbb (se guarda en minúsculas).
    v_muestra := null;
    if v_var ? 'muestra_color' and pg_catalog.jsonb_typeof(v_var -> 'muestra_color') <> 'null' then
      if pg_catalog.jsonb_typeof(v_var -> 'muestra_color') <> 'string' then
        raise exception 'La muestra de «%» debe ser un color hexadecimal como #1A2B3C.', v_texto using errcode = 'PT422';
      end if;
      v_muestra := nullif(pg_catalog.lower(pg_catalog.btrim(v_var ->> 'muestra_color')), '');
      if v_muestra is not null and v_muestra !~ '^#[0-9a-f]{6}$' then
        raise exception 'La muestra de «%» debe ser un color hexadecimal como #1A2B3C.', v_texto using errcode = 'PT422';
      end if;
    end if;

    select v.id into v_existente from public.variantes v where v.id = v_var_id;
    begin
      if found then
        update public.variantes v
           set codigo_variante     = coalesce(v_cod_pedido, v.codigo_variante),
               color               = v_texto,
               referencia_variante = nullif(pg_catalog.btrim(coalesce(v_var ->> 'referencia_variante', '')), ''),
               precio              = v_precio,
               precio_anterior     = v_anterior,
               activa              = coalesce((v_var ->> 'activa')::boolean, true),
               orden               = coalesce((v_var ->> 'orden')::integer, 0),
               muestra_color       = case when v_var ? 'muestra_color' then v_muestra else v.muestra_color end
         where v.id = v_var_id
           and (v.codigo_variante, v.color, v.referencia_variante, v.precio, v.precio_anterior, v.activa, v.orden, v.muestra_color)
               is distinct from
               (coalesce(v_cod_pedido, v.codigo_variante), v_texto, nullif(pg_catalog.btrim(coalesce(v_var ->> 'referencia_variante', '')), ''),
                v_precio, v_anterior, coalesce((v_var ->> 'activa')::boolean, true), coalesce((v_var ->> 'orden')::integer, 0),
                case when v_var ? 'muestra_color' then v_muestra else v.muestra_color end);
      else
        insert into public.variantes (id, producto_id, codigo_variante, color, referencia_variante, precio, precio_anterior, activa, orden, muestra_color)
        values (v_var_id, v_id, v_cod_pedido, v_texto,
                nullif(pg_catalog.btrim(coalesce(v_var ->> 'referencia_variante', '')), ''),
                v_precio, v_anterior, coalesce((v_var ->> 'activa')::boolean, true),
                coalesce((v_var ->> 'orden')::integer, 0), v_muestra);
      end if;
    exception when unique_violation then
      raise exception 'El código de color «%» ya lo usa otro color. Elige otro.', coalesce(v_cod_pedido, '(automático)') using errcode = 'PT422';
    end;

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

      select t.id, t.variante_id, t.talla, t.activa into v_existente from public.tallas t where t.id = v_talla_id for update;
      if found then
        if v_existente.variante_id <> v_var_id then
          raise exception 'Una talla del formulario pertenece a otro color.' using errcode = 'PT422';
        end if;
        if v_existente.talla <> (v_talla ->> 'talla') then
          raise exception 'La talla % no se puede renombrar; desactívala y añade la nueva.', v_existente.talla using errcode = 'PT422';
        end if;
        if pg_catalog.jsonb_typeof(v_talla -> 'activa_original') is distinct from 'boolean'
           or pg_catalog.jsonb_typeof(v_talla -> 'activa') is distinct from 'boolean' then
          raise exception 'Falta el estado original de la talla % de «%». Recarga el formulario.', v_existente.talla, v_texto
            using errcode = 'PT422';
        end if;
        v_activa := (v_talla ->> 'activa')::boolean;
        v_original := (v_talla ->> 'activa_original')::boolean;
        if v_activa is distinct from v_original then
          update public.tallas t set activa = v_activa where t.id = v_talla_id and t.activa = v_original;
        elsif v_existente.activa is distinct from v_original then
          v_conservadas := v_conservadas || pg_catalog.jsonb_build_object('id', v_talla_id, 'talla', v_existente.talla,
                                                                         'color', v_texto, 'activa', v_existente.activa);
        end if;
      else
        v_valor := public.fn_valor_talla(v_talla ->> 'talla');
        if v_valor is null then
          raise exception 'La talla «%» no tiene un formato válido (por ejemplo 40, 40,5 o 40 1/3).',
                          coalesce(v_talla ->> 'talla', '') using errcode = 'PT422';
        end if;
        select t.talla into v_choque
          from public.tallas t
         where t.variante_id = v_var_id and public.fn_valor_talla(t.talla) = v_valor
         limit 1;
        if found then
          raise exception 'La talla % de «%» equivale a la talla % que ya existe. Reactívala en lugar de añadirla otra vez.',
                          v_talla ->> 'talla', v_texto, v_choque using errcode = 'PT422';
        end if;
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
                                       'tallas_conservadas', v_conservadas, 'codigos_editables', true,
                                       'publico_y_muestras', true, 'publico_obligatorio', true);
end;
$$;

comment on function public.fn_admin_guardar_producto(jsonb, integer, uuid) is
  'Panel: guarda producto (con su publico obligatorio: hombre, dama o unisex), colores (codigos y muestras), tallas y galeria en una transaccion. No publica ni confirma disponibilidad. Exige administrador.';

grant execute on function public.fn_admin_guardar_producto(jsonb, integer, uuid) to authenticated;
revoke all on function public.fn_admin_guardar_producto(jsonb, integer, uuid) from public, anon, service_role;

-- =====================================================================
-- 3. Publicar exige el público
-- =====================================================================
-- Igual que en 20261108020000 más la comprobación del público en «publicar».
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
  v_antes     integer;
begin
  if not public.fn_es_administrador() then
    raise exception 'Solo un administrador puede publicar u ocultar productos.' using errcode = '42501';
  end if;
  if p_id is null or p_operacion is null or p_version is null
     or p_accion is null or p_accion not in ('publicar', 'ocultar', 'retirar', 'restaurar') then
    raise exception 'La acción no es válida.' using errcode = 'PT422';
  end if;
  perform pg_catalog.set_config('gamaytalla.lote', p_operacion::text, true);

  select p.id, p.version, p.ultima_operacion, p.activo, p.retirado_en, p.publico
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
    -- 17: sin público no se publica (los heredados sin clasificar se clasifican antes).
    if v_actual.publico is null then
      v_faltan := v_faltan || 'el público en la tienda (Hombre, Dama o Unisex)'::text;
    end if;
    -- Completa = UN MISMO color visible con al menos una foto y al menos una talla activa (una
    -- foto en un color y una talla en otro no dejan ningún color comprable). Un color oculto no
    -- cuenta. Publicar NO toca las tallas: su disponibilidad sigue siendo la que era.
    v_antes := pg_catalog.cardinality(v_faltan);
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
      if pg_catalog.cardinality(v_faltan) = v_antes then
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
  'Panel: publicar (si esta completo y tiene publico), ocultar, retirar o restaurar un producto. No toca tallas ni vigencias. Exige administrador.';

grant execute on function public.fn_admin_estado_producto(uuid, text, integer, uuid) to authenticated;
revoke all on function public.fn_admin_estado_producto(uuid, text, integer, uuid) from public, anon, service_role;

-- =====================================================================
-- 4. Comprobación final: si algo no quedó como se espera, no se aplica nada
-- =====================================================================
do $$
begin
  if pg_catalog.pg_get_constraintdef((select c.oid from pg_catalog.pg_constraint c
        where c.conrelid = 'public.productos'::regclass and c.conname = 'productos_publico_valido'))
     !~ 'unisex' then
    raise exception 'La restricción productos_publico_valido no admite unisex.';
  end if;
  if exists (select 1 from public.productos where publico is not null and publico not in ('hombre', 'dama', 'unisex')) then
    raise exception 'Hay productos con un público no válido.';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.fn_admin_guardar_producto(jsonb, integer, uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.fn_admin_estado_producto(uuid, text, integer, uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.fn_admin_guardar_producto(jsonb, integer, uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.fn_admin_estado_producto(uuid, text, integer, uuid)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.fn_admin_guardar_producto(jsonb, integer, uuid)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.fn_admin_estado_producto(uuid, text, integer, uuid)', 'EXECUTE') then
    raise exception 'Los permisos de las funciones del panel no son los esperados.';
  end if;
  if exists (select 1 from pg_catalog.pg_proc p
              where p.oid in ('public.fn_admin_guardar_producto(jsonb, integer, uuid)'::regprocedure,
                              'public.fn_admin_estado_producto(uuid, text, integer, uuid)'::regprocedure)
                and (p.prosecdef or not (p.proconfig @> array['search_path=""']))) then
    raise exception 'Las funciones del panel deben seguir siendo SECURITY INVOKER con search_path vacío.';
  end if;
  if not exists (select 1 from pg_catalog.pg_class c where c.oid = 'public.catalogo_publico'::regclass
                  and c.reloptions @> array['security_invoker=true']) then
    raise exception 'catalogo_publico perdió security_invoker.';
  end if;
end;
$$;
