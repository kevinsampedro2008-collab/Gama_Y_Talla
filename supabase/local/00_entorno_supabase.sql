-- SOLO PARA VALIDACIÓN LOCAL. Esto NO es una migración y NO se aplica en Supabase:
-- Supabase ya trae el esquema «auth», la función auth.uid() y los roles anon,
-- authenticated y service_role. Aquí se imitan para poder ejecutar y probar las
-- migraciones en un PostgreSQL 17 corriente.

create schema if not exists auth;

-- En Supabase, auth.uid() lee el reclamo «sub» del JWT de la petición.
-- Aquí se lee un ajuste de sesión, que permite simular a cualquier usuario.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Supabase trae pgcrypto instalada en el esquema «extensions», no en public. Se imita para
-- que «create extension if not exists pgcrypto» de 20261105010000 no la deje en public y la
-- auditoría (supabase/pruebas/auditar_funciones.sql) vea lo mismo que en Supabase.
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create extension if not exists pgcrypto with schema extensions;

-- Supabase trae el esquema «storage» (lo gestiona el servicio Storage). Se imitan solo las
-- dos tablas y columnas que usan las migraciones de la etapa 16 (bucket y políticas), con el
-- RLS activo y los privilegios que Supabase concede, para poder aplicar y probar esas
-- políticas. Los archivos reales no existen aquí: se prueban con el stack local.
create schema if not exists storage;
create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id        uuid primary key default extensions.gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name      text,
  owner     uuid,
  metadata  jsonb,
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;

-- Supabase da a service_role acceso completo a lo que se cree en public. Se imita para
-- poder comprobar que los disparadores funcionan aunque no pueda ejecutarlos directamente.
grant usage on schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
