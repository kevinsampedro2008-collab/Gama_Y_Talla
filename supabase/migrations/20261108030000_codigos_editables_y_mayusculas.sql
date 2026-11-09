-- Etapa 16.2 · Códigos comerciales editables, identidad pública inmutable y mayúsculas
--
-- QUÉ CAMBIA
-- ----------
-- 1. Identidad pública inmutable: productos.clave_catalogo y variantes.clave_catalogo.
--    Hasta ahora catalogo_publico entregaba como «id» coalesce(clave_legado, codigo_interno) y,
--    en los colores, coalesce(id_legado, codigo_variante). La tienda usa ese «id» para las claves
--    del carrito V3 guardado en LocalStorage: si los códigos comerciales se pudieran editar, los
--    carritos guardados dejarían de reconocer sus líneas. Ahora:
--      · registros existentes: la clave es EXACTAMENTE el identificador público que tenían
--        (mismo texto, sin pasar a mayúsculas), así que ningún carrito cambia;
--      · registros nuevos: la clave es el UUID de la fila (independiente del código comercial);
--      · un disparador la fija al insertar e impide cambiarla después.
--    La vista entrega esa clave como «id» y los códigos comerciales siguen en «codigoInterno» y
--    «codigoVariante». UUID, relaciones, clave_legado e id_legado no se tocan.
-- 2. Códigos comerciales editables (productos.codigo_interno, variantes.codigo_variante) desde
--    fn_admin_guardar_producto: mayúsculas, sin espacios exteriores, con longitud y caracteres
--    validados y únicos en su tabla. Vacío al crear = se genera; vacío al editar = error.
--    Cambiar el código de la zapatilla no renombra los de sus colores. Las secuencias no se
--    tocan; los generadores saltan los códigos que ya existan (incluidos los personalizados).
-- 3. Modelo, marca, categoría y nombre del color se guardan en MAYÚSCULAS (también los ya
--    existentes, subiendo la versión de los productos afectados para que un formulario abierto
--    antes de la migración no sobrescriba nada). Lo normaliza un disparador: no depende del
--    navegador ni de la función de guardado. No afecta a descripciones ni a otros campos.
--
-- Solo cambian nombres y códigos: ni existencias, ni estados, ni fechas, ni vigencias de las
-- tallas, ni rutas de fotos (que dependen de los UUID). El historial registra los cambios.

-- =====================================================================
-- 0. Comprobaciones previas: nada se aplica si algo chocaría
-- =====================================================================
do $$
declare v_lista text;
begin
  -- Dos productos con el mismo identificador público serían el mismo para la tienda.
  select string_agg(clave, ', ') into v_lista from (
    select coalesce(p.clave_legado, p.codigo_interno) as clave
      from public.productos p group by 1 having count(*) > 1) x;
  if v_lista is not null then
    raise exception 'Identificadores públicos de producto repetidos: %. Revísalos antes de migrar.', v_lista;
  end if;
  select string_agg(clave, ', ') into v_lista from (
    select v.producto_id::text || ' / ' || coalesce(v.id_legado, v.codigo_variante) as clave
      from public.variantes v group by v.producto_id, coalesce(v.id_legado, v.codigo_variante) having count(*) > 1) x;
  if v_lista is not null then
    raise exception 'Identificadores públicos de color repetidos dentro de un producto: %.', v_lista;
  end if;
  -- Pasar los códigos a mayúsculas no puede juntar dos códigos distintos.
  select string_agg(codigo, ', ') into v_lista from (
    select pg_catalog.upper(pg_catalog.btrim(p.codigo_interno)) as codigo
      from public.productos p group by 1 having count(*) > 1) x;
  if v_lista is not null then
    raise exception 'Códigos de producto que coincidirían en mayúsculas: %.', v_lista;
  end if;
  select string_agg(codigo, ', ') into v_lista from (
    select pg_catalog.upper(pg_catalog.btrim(v.codigo_variante)) as codigo
      from public.variantes v group by 1 having count(*) > 1) x;
  if v_lista is not null then
    raise exception 'Códigos de color que coincidirían en mayúsculas: %.', v_lista;
  end if;
end;
$$;

-- =====================================================================
-- 1. Claves públicas inmutables
-- =====================================================================
alter table public.productos add column if not exists clave_catalogo text;
alter table public.variantes add column if not exists clave_catalogo text;

-- Relleno sin disparadores: añadir la clave no es un cambio de datos del catálogo (no mueve
-- actualizado_en ni llena el historial con una fila por registro).
alter table public.productos disable trigger tr_productos_actualizado;
alter table public.productos disable trigger tr_historial_productos;
alter table public.variantes disable trigger tr_variantes_actualizado;
alter table public.variantes disable trigger tr_historial_variantes;

update public.productos p set clave_catalogo = coalesce(p.clave_legado, p.codigo_interno) where p.clave_catalogo is null;
update public.variantes v set clave_catalogo = coalesce(v.id_legado, v.codigo_variante) where v.clave_catalogo is null;

alter table public.productos enable trigger tr_productos_actualizado;
alter table public.productos enable trigger tr_historial_productos;
alter table public.variantes enable trigger tr_variantes_actualizado;
alter table public.variantes enable trigger tr_historial_variantes;

alter table public.productos alter column clave_catalogo set not null;
alter table public.variantes alter column clave_catalogo set not null;
alter table public.productos drop constraint if exists productos_clave_catalogo_unica;
alter table public.productos add constraint productos_clave_catalogo_unica unique (clave_catalogo);
alter table public.variantes drop constraint if exists variantes_clave_catalogo_unica;
alter table public.variantes add constraint variantes_clave_catalogo_unica unique (producto_id, clave_catalogo);

comment on column public.productos.clave_catalogo is
  'Identidad publica inmutable (id de catalogo_publico, claves del carrito). Existentes: el id publico anterior; nuevos: el UUID.';
comment on column public.variantes.clave_catalogo is
  'Identidad publica inmutable del color dentro del producto. Existentes: el id publico anterior; nuevos: el UUID.';
comment on column public.productos.codigo_interno is
  'Codigo comercial de la zapatilla (GT-00001 u otro). Editable desde el panel; unico. No es la identidad publica.';
comment on column public.variantes.codigo_variante is
  'Codigo comercial del color (GT-00001-A u otro). Editable desde el panel; unico. Es la referencia que ve el cliente.';
comment on column public.variantes.referencia_variante is
  'Referencia opcional del proveedor para este color. Informativa: no es el codigo del color.';

-- Los valores por omisión, ya en mayúsculas.
alter table public.productos alter column categoria set default 'OTRAS';
alter table public.variantes alter column color set default 'COLOR POR CONFIRMAR';

-- =====================================================================
-- 2. Disparadores de normalización y protección
-- =====================================================================
-- INVOKER: solo transforman la fila que se escribe; nadie los ejecuta directamente.
-- Van después de tr_*_codigo (orden alfabético de los BEFORE): el código ya está asignado.
create or replace function public.fn_productos_antes_de_escribir()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- La identidad pública no se elige: la heredada si la hay, si no, el UUID de la fila.
    new.clave_catalogo := coalesce(new.clave_legado, new.id::text);
  elsif new.clave_catalogo is distinct from old.clave_catalogo then
    raise exception 'La clave pública del catálogo de una zapatilla no se puede cambiar.' using errcode = 'PT422';
  end if;
  new.nombre         := pg_catalog.upper(pg_catalog.btrim(new.nombre));
  new.marca          := pg_catalog.upper(pg_catalog.btrim(new.marca));
  new.categoria      := pg_catalog.upper(pg_catalog.btrim(new.categoria));
  new.codigo_interno := pg_catalog.upper(pg_catalog.btrim(new.codigo_interno));
  return new;
end;
$$;

create or replace function public.fn_variantes_antes_de_escribir()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.clave_catalogo := coalesce(new.id_legado, new.id::text);
  elsif new.clave_catalogo is distinct from old.clave_catalogo then
    raise exception 'La clave pública del catálogo de un color no se puede cambiar.' using errcode = 'PT422';
  elsif new.producto_id is distinct from old.producto_id then
    raise exception 'Un color no se puede mover a otra zapatilla.' using errcode = 'PT422';
  end if;
  new.color           := pg_catalog.upper(pg_catalog.btrim(new.color));
  new.codigo_variante := pg_catalog.upper(pg_catalog.btrim(new.codigo_variante));
  return new;
end;
$$;

drop trigger if exists tr_productos_normalizar on public.productos;
create trigger tr_productos_normalizar
  before insert or update on public.productos
  for each row execute function public.fn_productos_antes_de_escribir();

drop trigger if exists tr_variantes_normalizar on public.variantes;
create trigger tr_variantes_normalizar
  before insert or update on public.variantes
  for each row execute function public.fn_variantes_antes_de_escribir();

revoke all on function public.fn_productos_antes_de_escribir() from public, anon, authenticated, service_role;
revoke all on function public.fn_variantes_antes_de_escribir() from public, anon, authenticated, service_role;

-- =====================================================================
-- 3. Generadores automáticos: nunca chocan con un código ya usado
-- =====================================================================
-- La secuencia solo avanza (nunca se reinicia ni retrocede). Si el número siguiente ya lo tomó
-- un código personalizado (por ejemplo, alguien escribió GT-00040 a mano), se salta.
create or replace function public.fn_asignar_codigo_interno()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_codigo text;
begin
  if new.codigo_interno is null or btrim(new.codigo_interno) = '' then
    loop
      v_codigo := 'GT-' || lpad(nextval('public.seq_codigo_producto')::text, 5, '0');
      exit when not exists (select 1 from public.productos p where p.codigo_interno = v_codigo);
    end loop;
    new.codigo_interno := v_codigo;
  end if;
  return new;
end;
$$;

-- Código del color = código ACTUAL de la zapatilla + letra (A, B… Z, luego Z1, Z2…), saltando
-- los que ya existan en cualquier producto.
create or replace function public.fn_asignar_codigo_variante()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_base text; v_n integer; v_codigo text;
begin
  if new.codigo_variante is null or btrim(new.codigo_variante) = '' then
    select upper(btrim(p.codigo_interno)) into v_base from public.productos p where p.id = new.producto_id;
    select count(*) into v_n from public.variantes v where v.producto_id = new.producto_id;
    loop
      v_codigo := v_base || '-' || case when v_n < 26 then chr(65 + v_n) else 'Z' || (v_n - 25)::text end;
      exit when not exists (select 1 from public.variantes v where v.codigo_variante = v_codigo);
      v_n := v_n + 1;
    end loop;
    new.codigo_variante := v_codigo;
  end if;
  return new;
end;
$$;

-- =====================================================================
-- 4. Datos existentes en mayúsculas (con historial y versión)
-- =====================================================================
do $$
declare v_afectados uuid[];
begin
  -- Un mismo lote en el historial para todo lo que normaliza esta migración.
  perform pg_catalog.set_config('gamaytalla.lote', 'a1630000-0000-4000-8000-000000000162', true);
  select pg_catalog.array_agg(p.id) into v_afectados
    from public.productos p
   where (p.nombre, p.marca, p.categoria, p.codigo_interno)
         is distinct from (pg_catalog.upper(pg_catalog.btrim(p.nombre)), pg_catalog.upper(pg_catalog.btrim(p.marca)),
                           pg_catalog.upper(pg_catalog.btrim(p.categoria)), pg_catalog.upper(pg_catalog.btrim(p.codigo_interno)))
      or exists (select 1 from public.variantes v
                  where v.producto_id = p.id
                    and (v.color, v.codigo_variante)
                        is distinct from (pg_catalog.upper(pg_catalog.btrim(v.color)), pg_catalog.upper(pg_catalog.btrim(v.codigo_variante))));
  if v_afectados is null then return; end if;
  -- El disparador normaliza al escribir: basta con tocar las filas.
  update public.variantes v set color = v.color
   where v.producto_id = any (v_afectados)
     and (v.color, v.codigo_variante)
         is distinct from (pg_catalog.upper(pg_catalog.btrim(v.color)), pg_catalog.upper(pg_catalog.btrim(v.codigo_variante)));
  -- La versión sube: un formulario abierto antes de la migración recibe un conflicto en lugar de
  -- devolver el texto antiguo. ultima_operacion no cambia (un reintento pendiente se reconoce).
  update public.productos p set version = p.version + 1 where p.id = any (v_afectados);
end;
$$;

-- =====================================================================
-- 5. Vista pública: la identidad es la clave inmutable
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
  ) as variantes
from public.productos p
where p.activo;

comment on view public.catalogo_publico is
  'Catalogo que lee la tienda. Solo productos activos. id = clave inmutable; codigoInterno y codigoVariante = codigos comerciales editables.';

-- Permisos mínimos por columna: el visitante solo necesita leer la clave nueva.
grant select (clave_catalogo) on public.productos to anon;
grant select (clave_catalogo) on public.variantes to anon;

-- =====================================================================
-- 6. Guardar un producto: códigos editables y nombres normalizados
-- =====================================================================
-- Igual que en 20261108020000 (versión, conflictos, operación idempotente, tallas y galería),
-- más:
--   p_datos.codigo_interno             opcional. Ausente = no se cambia (compatibilidad). Al crear,
--                                      vacío = se genera. Al editar, no puede quedar vacío.
--   p_datos.variantes[].codigo_variante igual, por color.
-- Los códigos se guardan en mayúsculas y sin espacios exteriores: 2 a 30 caracteres en la
-- zapatilla y 2 a 40 en el color; letras (también Ñ), números y - _ . /. Únicos en su tabla:
-- un duplicado se rechaza con PT422 y un mensaje que dice quién lo usa (no se guarda nada).
-- La respuesta incluye «codigos_editables»: true, para que el panel distinga este esquema.
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
             'codigo_interno', v_actual.codigo_interno, 'version', v_actual.version, 'codigos_editables', true);
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
                                    segmento, destacado, nuevo_ingreso, orden, activo, version, ultima_operacion)
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
              false, 1, p_operacion)
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
               orden               = coalesce((v_var ->> 'orden')::integer, 0)
         where v.id = v_var_id
           and (v.codigo_variante, v.color, v.referencia_variante, v.precio, v.precio_anterior, v.activa, v.orden)
               is distinct from
               (coalesce(v_cod_pedido, v.codigo_variante), v_texto, nullif(pg_catalog.btrim(coalesce(v_var ->> 'referencia_variante', '')), ''),
                v_precio, v_anterior, coalesce((v_var ->> 'activa')::boolean, true), coalesce((v_var ->> 'orden')::integer, 0));
      else
        insert into public.variantes (id, producto_id, codigo_variante, color, referencia_variante, precio, precio_anterior, activa, orden)
        values (v_var_id, v_id, v_cod_pedido, v_texto,
                nullif(pg_catalog.btrim(coalesce(v_var ->> 'referencia_variante', '')), ''),
                v_precio, v_anterior, coalesce((v_var ->> 'activa')::boolean, true),
                coalesce((v_var ->> 'orden')::integer, 0));
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
                                       'tallas_conservadas', v_conservadas, 'codigos_editables', true);
end;
$$;

comment on function public.fn_admin_guardar_producto(jsonb, integer, uuid) is
  'Panel: guarda producto, colores (con sus codigos comerciales), tallas y galeria en una transaccion. No publica ni confirma disponibilidad. Exige administrador.';

-- Los permisos se conservan al reemplazar; se dejan explícitos.
grant execute on function public.fn_admin_guardar_producto(jsonb, integer, uuid) to authenticated;
revoke all on function public.fn_admin_guardar_producto(jsonb, integer, uuid) from public, anon, service_role;
revoke all on function public.fn_asignar_codigo_interno() from public, anon, authenticated, service_role;
revoke all on function public.fn_asignar_codigo_variante() from public, anon, authenticated, service_role;

-- =====================================================================
-- 7. Comprobación final: si algo no quedó como se espera, no se aplica nada
-- =====================================================================
do $$
begin
  if exists (select 1 from public.productos where clave_catalogo is null)
     or exists (select 1 from public.variantes where clave_catalogo is null) then
    raise exception 'Quedaron registros sin clave pública.';
  end if;
  if not exists (select 1 from pg_catalog.pg_class c where c.oid = 'public.catalogo_publico'::regclass
                  and c.reloptions @> array['security_invoker=true']) then
    raise exception 'catalogo_publico perdió security_invoker.';
  end if;
  if not pg_catalog.has_column_privilege('anon', 'public.productos', 'clave_catalogo', 'SELECT')
     or not pg_catalog.has_column_privilege('anon', 'public.variantes', 'clave_catalogo', 'SELECT')
     or pg_catalog.has_column_privilege('anon', 'public.productos', 'version', 'SELECT')
     or pg_catalog.has_column_privilege('anon', 'public.productos', 'ultima_operacion', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.productos', 'UPDATE') then
    raise exception 'Los permisos por columna del visitante no son los esperados.';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.fn_admin_guardar_producto(jsonb, integer, uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.fn_productos_antes_de_escribir()', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.fn_variantes_antes_de_escribir()', 'EXECUTE') then
    raise exception 'Una función quedó ejecutable por un rol que no debe.';
  end if;
  if exists (select 1 from public.productos p
              where (p.nombre, p.marca, p.categoria) is distinct from (upper(p.nombre), upper(p.marca), upper(p.categoria)))
     or exists (select 1 from public.variantes v where v.color is distinct from upper(v.color)) then
    raise exception 'Quedaron nombres sin normalizar.';
  end if;
end;
$$;
