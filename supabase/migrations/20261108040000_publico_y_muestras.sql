-- Etapa 16.3 · Público de la tienda (Hombre / Dama) y muestra de color por variante
--
-- QUÉ AÑADE
-- ---------
-- 1. productos.publico: 'hombre', 'dama' o null (sin clasificar). Es INDEPENDIENTE de
--    productos.segmento, que sigue eligiendo la tabla de la guía de tallas: clasificar el público no
--    cambia la guía. Los productos existentes quedan sin clasificar (null) y siguen en «Todos».
-- 2. variantes.muestra_color: color de la muestra del selector de la ficha, opcional, '#rrggbb' en
--    minúsculas. Sin muestra, la tienda resuelve nombres inequívocos con su paleta o usa un círculo
--    neutro, y siempre conserva el nombre real del color.
-- 3. catalogo_publico expone ambos («publico» al final de la fila, «muestra» dentro de cada color)
--    sin cambiar los identificadores públicos (clave_catalogo) ni los campos existentes.
-- 4. fn_admin_guardar_producto (misma firma) valida y guarda los dos campos en su transacción. Un
--    cliente anterior que no los envía conserva lo que ya estaba guardado. La respuesta lleva
--    «publico_y_muestras»: true para que el panel distinga este esquema.
--
-- No toca existencias, vigencias, fotos, códigos ni claves del carrito. Solo se ha aplicado en local.

-- =====================================================================
-- 1. Columnas y restricciones
-- =====================================================================
alter table public.productos add column if not exists publico text;
alter table public.productos drop constraint if exists productos_publico_valido;
alter table public.productos add constraint productos_publico_valido check (publico is null or publico in ('hombre', 'dama'));
comment on column public.productos.publico is
  'Publico de la tienda: hombre, dama o null (sin clasificar). Independiente de segmento (tabla de la guia de tallas).';

alter table public.variantes add column if not exists muestra_color text;
alter table public.variantes drop constraint if exists variantes_muestra_color_valida;
alter table public.variantes add constraint variantes_muestra_color_valida check (muestra_color is null or muestra_color ~ '^#[0-9a-f]{6}$');
comment on column public.variantes.muestra_color is
  'Muestra opcional del color para el selector de la ficha: #rrggbb en minusculas.';

-- Permisos mínimos por columna: el visitante solo LEE estos dos campos (los usa la vista).
grant select (publico) on public.productos to anon;
grant select (muestra_color) on public.variantes to anon;

-- =====================================================================
-- 2. Vista pública
-- =====================================================================
create or replace view public.catalogo_publico
with (security_invoker = true)
as
select
  -- «id» = clave inmutable: para los registros anteriores es el mismo texto que entregaba la
  -- vista (clave_legado o el código de entonces), así que los carritos V3 guardados siguen
  -- reconociendo sus líneas aunque se cambien los códigos comerciales.
  p.clave_catalogo                                 as id,
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
          'id',             va.clave_catalogo,
          'codigoVariante', va.codigo_variante,
          'color',          va.color,
          -- 16.3: muestra opcional del color (hexadecimal validado) o null.
          'muestra',        va.muestra_color,
          'referencia',     va.referencia_variante,
          'precio',         va.precio,
          'precioAnterior', va.precio_anterior,
          'imagenes', (
            select coalesce(jsonb_agg(f.ruta order by f.orden, f.ruta), '[]'::jsonb)
            from public.fotos f
            where f.variante_id = va.id
          ),
          'tallasDisponibles', public.fn_tallas_por_estado(va.id, 'DISPONIBLE'),
          'tallasAgotadas',    public.fn_tallas_por_estado(va.id, 'AGOTADO'),
          'tallasPorRevisar',  public.fn_tallas_por_estado(va.id, 'POR_REVISAR'),
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
  ) as variantes,
  -- 16.3: público de la tienda («hombre», «dama») o null = sin clasificar. Va al final: los
  -- campos existentes conservan su nombre, su orden y su contrato.
  p.publico
from public.productos p
where p.activo;

comment on view public.catalogo_publico is
  'Catalogo que lee la tienda. Solo productos activos. id = clave inmutable; codigoInterno y codigoVariante = codigos comerciales; publico y muestra (16.3) opcionales.';

-- =====================================================================
-- 3. Guardar un producto: público y muestras
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

  select p.id, p.version, p.ultima_operacion, p.codigo_interno, p.nombre
    into v_actual
    from public.productos p
   where p.id = v_id
     for update;

  if found and v_actual.ultima_operacion = p_operacion then
    return pg_catalog.jsonb_build_object('estado', 'ya_aplicada', 'id', v_id,
             'codigo_interno', v_actual.codigo_interno, 'version', v_actual.version, 'codigos_editables', true,
             'publico_y_muestras', true);
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

  -- ------------------------------------------------ público (16.3)
  -- Ausente = no se cambia (clientes anteriores); null o vacío = sin clasificar.
  v_publico_pide := p_datos ? 'publico';
  v_publico := null;
  if v_publico_pide and pg_catalog.jsonb_typeof(p_datos -> 'publico') <> 'null' then
    if pg_catalog.jsonb_typeof(p_datos -> 'publico') <> 'string' then
      raise exception 'El público debe ser Hombre o Dama, o quedar sin asignar.' using errcode = 'PT422';
    end if;
    v_publico := nullif(pg_catalog.lower(pg_catalog.btrim(p_datos ->> 'publico')), '');
    if v_publico is not null and v_publico not in ('hombre', 'dama') then
      raise exception 'El público debe ser Hombre o Dama, o quedar sin asignar.' using errcode = 'PT422';
    end if;
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
                                       'publico_y_muestras', true);
end;
$$;

comment on function public.fn_admin_guardar_producto(jsonb, integer, uuid) is
  'Panel: guarda producto (con su publico), colores (codigos y muestras), tallas y galeria en una transaccion. No publica ni confirma disponibilidad. Exige administrador.';

grant execute on function public.fn_admin_guardar_producto(jsonb, integer, uuid) to authenticated;
revoke all on function public.fn_admin_guardar_producto(jsonb, integer, uuid) from public, anon, service_role;

-- =====================================================================
-- 4. Comprobación final: si algo no quedó como se espera, no se aplica nada
-- =====================================================================
do $$
begin
  if not exists (select 1 from pg_catalog.pg_class c where c.oid = 'public.catalogo_publico'::regclass
                  and c.reloptions @> array['security_invoker=true']) then
    raise exception 'catalogo_publico perdió security_invoker.';
  end if;
  if not pg_catalog.has_column_privilege('anon', 'public.productos', 'publico', 'SELECT')
     or not pg_catalog.has_column_privilege('anon', 'public.variantes', 'muestra_color', 'SELECT')
     or pg_catalog.has_column_privilege('anon', 'public.productos', 'publico', 'UPDATE')
     or pg_catalog.has_column_privilege('anon', 'public.variantes', 'muestra_color', 'UPDATE')
     or pg_catalog.has_column_privilege('anon', 'public.productos', 'version', 'SELECT') then
    raise exception 'Los permisos por columna del visitante no son los esperados.';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.fn_admin_guardar_producto(jsonb, integer, uuid)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.fn_admin_guardar_producto(jsonb, integer, uuid)', 'EXECUTE') then
    raise exception 'Los permisos de fn_admin_guardar_producto no son los esperados.';
  end if;
  if exists (select 1 from public.productos where publico is not null)
     or exists (select 1 from public.variantes where muestra_color is not null) then
    raise exception 'Los registros existentes deben quedar sin clasificar y sin muestra.';
  end if;
end;
$$;
