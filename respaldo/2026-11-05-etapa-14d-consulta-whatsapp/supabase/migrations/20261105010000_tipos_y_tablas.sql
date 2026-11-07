-- Etapa 13 · Gama & Talla · Catálogo y disponibilidad
-- Tipos, tablas, identificadores y relaciones.
--
-- Principio: nada se borra. Lo que se deja de ofrecer se desactiva (activa = false)
-- y conserva su historial. Una talla que vuelve reactiva SU MISMA fila.

create extension if not exists pgcrypto;          -- gen_random_uuid()

-- ---------------------------------------------------------------- tipos
-- Estado GUARDADO: lo que marca el administrador. Son solo tres.
create type public.estado_talla as enum ('CONFIRMADA', 'AGOTADA', 'REVISAR');

-- Estado PÚBLICO: lo que calcula la vista con las fechas. Nunca se almacena.
create type public.estado_publico as enum ('DISPONIBLE', 'POR_REVISAR', 'AGOTADO');

-- De dónde viene la información. 'migracion' = heredado del JSON, sin fecha fiable.
create type public.origen_dato as enum ('publicacion', 'proveedor', 'manual', 'migracion');

-- ------------------------------------------------------------ productos
-- codigo_interno: identificador LEGIBLE, único y permanente, nuestro.
--   Lo asigna un disparador a partir de una secuencia. No se usa un valor por
--   omisión para no tener que conceder permiso sobre la secuencia a nadie.
-- referencia_proveedor: la del proveedor. PUEDE REPETIRSE: sin restricción única.
create sequence public.seq_codigo_producto start 1;

create table public.productos (
  id                    uuid primary key default gen_random_uuid(),
  -- Lo asigna un disparador SECURITY DEFINER (ver mas abajo), no un valor por
  -- omision: asi NINGUN rol de aplicacion necesita permiso sobre la secuencia.
  codigo_interno        text not null unique,
  referencia_proveedor  text,
  nombre                text not null check (length(btrim(nombre)) > 0),
  marca                 text not null check (length(btrim(marca)) > 0),
  categoria             text not null default 'Otras',
  descripcion           text,
  segmento              text,
  destacado             boolean not null default false,
  nuevo_ingreso         boolean not null default false,
  activo                boolean not null default true,
  orden                 integer not null default 0,
  -- Compatibilidad con los carritos V3 ya guardados en LocalStorage.
  -- Es la clave que la tienda calcula hoy. Se expone en la vista porque el
  -- navegador la necesita para reconocer un carrito anterior a la migración.
  clave_legado          text unique,
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

comment on column public.productos.codigo_interno is
  'Identificador legible y permanente de Gama & Talla. Nunca se reutiliza.';
comment on column public.productos.referencia_proveedor is
  'Referencia del proveedor. Puede repetirse entre productos.';
comment on column public.productos.clave_legado is
  'Clave que usaban los carritos V3 antes de la migracion.';

-- ------------------------------------------------------------ variantes
create table public.variantes (
  id                  uuid primary key default gen_random_uuid(),
  producto_id         uuid not null references public.productos(id) on delete restrict,
  codigo_variante     text not null unique,   -- lo asigna un disparador si no se indica
  color               text not null default 'Color por confirmar',
  referencia_variante text,
  precio              integer not null default 0 check (precio >= 0),
  precio_anterior     integer not null default 0 check (precio_anterior >= 0),
  orden               integer not null default 0,
  activa              boolean not null default true,
  -- Identificador que usa el carrito V3 para la variante ('unica' en los migrados).
  id_legado           text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),
  unique (producto_id, id_legado)
);

-- ------------------------------------------- codigos internos automaticos
-- SECURITY DEFINER: corre como su propietario, de modo que el administrador
-- puede crear productos sin tener ningun privilegio sobre la secuencia.
-- Solo asigna si no se indico uno, para permitir reimportaciones controladas.
create or replace function public.fn_asignar_codigo_interno()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.codigo_interno is null or btrim(new.codigo_interno) = '' then
    new.codigo_interno := 'GT-' || lpad(nextval('public.seq_codigo_producto')::text, 5, '0');
  end if;
  return new;
end;
$$;

create trigger tr_productos_codigo
  before insert on public.productos
  for each row execute function public.fn_asignar_codigo_interno();

-- El codigo de variante se deriva del producto: GT-00001-A, GT-00001-B...
create or replace function public.fn_asignar_codigo_variante()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_codigo text; v_n integer;
begin
  if new.codigo_variante is null or btrim(new.codigo_variante) = '' then
    select p.codigo_interno into v_codigo from public.productos p where p.id = new.producto_id;
    select count(*) into v_n from public.variantes v where v.producto_id = new.producto_id;
    new.codigo_variante := v_codigo || '-' || chr(65 + v_n);
  end if;
  return new;
end;
$$;

create trigger tr_variantes_codigo
  before insert on public.variantes
  for each row execute function public.fn_asignar_codigo_variante();

-- ---------------------------------------------------------------- fotos
create table public.fotos (
  id          uuid primary key default gen_random_uuid(),
  variante_id uuid not null references public.variantes(id) on delete cascade,
  ruta        text not null check (length(btrim(ruta)) > 0),
  orden       integer not null default 0,
  alt         text,
  creado_en   timestamptz not null default now(),
  unique (variante_id, ruta)
);

comment on column public.fotos.ruta is
  'Ruta del sitio (assets/...) o URL de Supabase Storage (https://...).';

-- --------------------------------------------------------------- tallas
-- El corazón del sistema. Cada combinación variante+talla es única y nunca
-- se borra: se desactiva. Las fechas son cinco y cada una tiene su papel.
create table public.tallas (
  id              uuid primary key default gen_random_uuid(),
  variante_id     uuid not null references public.variantes(id) on delete restrict,
  talla           text not null check (length(btrim(talla)) > 0),

  estado          public.estado_talla not null default 'REVISAR',

  -- (1) Publicación original del proveedor. Dato histórico.
  publicado_en    timestamptz,
  -- (2) Cuándo se registró en Gama & Talla. Trazabilidad, nunca mueve el reloj.
  registrado_en   timestamptz not null default now(),
  -- (3) Confirmación directa del proveedor.
  confirmado_en   timestamptz,
  -- (4) LA FECHA QUE CUENTA. Escenario A: = publicado_en. Escenario B: = confirmado_en.
  --     Separarla evita que una confirmación reciente venza por una publicación vieja.
  vigencia_desde  timestamptz,
  vigencia_horas  smallint not null default 48 check (vigencia_horas between 1 and 60),
  -- (5) Calculada por disparador. No puede ser columna generada: ver 20261105020000.
  vence_en        timestamptz,

  origen          public.origen_dato not null default 'manual',
  activa          boolean not null default true,
  nota            text,
  -- Dato histórico interno de la migración. NUNCA se usa como estado público.
  estado_migrado  text,

  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),

  unique (variante_id, talla),
  -- Una talla confirmada necesita fecha de vigencia: sin ella no se puede publicar.
  constraint confirmada_exige_vigencia
    check (estado <> 'CONFIRMADA' or vigencia_desde is not null)
);

comment on column public.tallas.vigencia_desde is
  'Fecha desde la que corre la vigencia actual. Es la unica que mueve vence_en.';
comment on column public.tallas.estado_migrado is
  'Estado heredado del JSON. Dato interno de revision; nunca es el estado publico.';

-- ------------------------------------------------------- administración
create table public.administradores (
  user_id   uuid primary key,
  nombre    text,
  creado_en timestamptz not null default now()
);

create table public.configuracion (
  clave     text primary key,
  valor     text not null,
  creado_en timestamptz not null default now()
);

insert into public.configuracion (clave, valor)
values ('vigencia_horas_predeterminada', '48');

-- --------------------------------------------------------------- índices
create index on public.productos (activo);
create index on public.productos (referencia_proveedor);
create index on public.variantes (producto_id);
create index on public.fotos (variante_id);
create index on public.tallas (variante_id);
create index on public.tallas (vence_en);           -- "¿qué vence en las próximas horas?"
create index on public.tallas (estado, activa);
