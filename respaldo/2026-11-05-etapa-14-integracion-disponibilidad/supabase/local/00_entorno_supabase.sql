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
