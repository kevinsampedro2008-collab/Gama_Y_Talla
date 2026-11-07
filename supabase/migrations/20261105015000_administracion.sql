-- Etapa 13 · Quién es administrador
--
-- SECURITY DEFINER a propósito: si fuese invoker, consultar «administradores»
-- desde una política RLS volvería a pasar por RLS y entraría en recursión.
-- search_path = '' y todo cualificado, para que no se pueda secuestrar la
-- resolución de nombres.
create or replace function public.fn_es_administrador()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.administradores a
     where a.user_id = (select auth.uid())
  );
$$;

comment on function public.fn_es_administrador is
  'True si el usuario de la sesion figura en administradores. Unico punto de decision de escritura.';
