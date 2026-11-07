-- Etapa 14f.1 · Restringir el acceso a los datos internos (migración correctiva)
--
-- QUÉ CORRIGE
-- -----------
-- Un usuario con sesión que NO es administrador podía leer tallas.nota, estado_migrado y
-- las fechas internas, incluso filtrando u ordenando por ellas. Había dos cerrojos abiertos
-- a la vez:
--
--   1. PRIVILEGIOS. 20261105050000 concedía SELECT columna a columna, pero después, para el
--      administrador, hacía «grant select, insert, update, delete on tallas to authenticated».
--      Un SELECT a nivel de TABLA abre todas las columnas y anula la lista anterior.
--
--   2. FILAS. Las políticas lectura_publica_* estaban dirigidas a anon Y authenticated, así
--      que cualquier sesión recibía las filas públicas.
--
-- Con el registro público abierto (el valor por omisión de Supabase), cualquier visitante
-- podía crearse una cuenta y consultar esos datos.
--
-- LA DECISIÓN, Y EL LÍMITE QUE LA EXPLICA
-- ---------------------------------------
-- Gama & Talla no tiene cuentas de clientes. La tienda usa anon; solo el panel privado usa
-- authenticated. Los privilegios de PostgreSQL son por ROL, no por usuario, y administrador
-- y no administrador comparten el rol authenticated: es imposible que uno tenga SELECT
-- directo sobre una columna y el otro no. Por eso, para las columnas internas de tallas:
--
--   · authenticated pierde el acceso directo, igual que anon: quien las nombra recibe un
--     error de permisos, no «cero filas».
--   · el administrador las lee con fn_admin_tallas(), que comprueba fn_es_administrador().
--   · escribirlas sigue siendo directo (INSERT/UPDATE): esos privilegios también son del
--     rol, pero el RLS (admin_total_tallas) los limita al administrador.
--
-- Una consulta que necesite esas columnas en un RETURNING o en un «select=*» por la tabla
-- recibirá un error de permisos también siendo administrador: debe pedir columnas públicas
-- o usar fn_admin_tallas().
--
-- QUÉ NO CAMBIA
-- -------------
-- Ninguna tabla ni dato. La vista catalogo_publico sigue con security_invoker = true y
-- devuelve lo mismo: sus columnas de tallas son todas públicas. Tampoco cambian las
-- políticas admin_total_*, ni historial_lectura_admin, ni administradores_lectura, ni
-- configuracion_admin, ni los cuerpos de las funciones existentes.
--
-- DÓNDE SIGUE DECIDIENDO SOLO EL RLS
-- ----------------------------------
-- historial, administradores y configuracion son enteramente privadas y el administrador
-- las lee directamente, así que authenticated conserva SELECT y quien no es administrador
-- recibe cero filas. Igual con creado_en y actualizado_en de productos, variantes y fotos.
-- Cerrarlas también por privilegio exigiría una función por tabla o un rol propio.
--
-- service_role
-- ------------
-- No recibe ningún permiso sobre funciones. Si una Edge Function llega a necesitar una, se
-- estudiará y se concederá explícitamente esa función, no un permiso general.
--
-- Todo es idempotente: ALTER POLICY, REVOKE, GRANT y CREATE OR REPLACE se pueden repetir.

-- =====================================================================
-- 1. Filas: la lectura pública es del visitante
-- =====================================================================
-- Una sesión ya no recibe filas por el mero hecho de existir. El administrador no pierde
-- nada: admin_total_* (FOR ALL) le da todas las filas, también las inactivas.
alter policy lectura_publica_productos on public.productos to anon;
alter policy lectura_publica_variantes on public.variantes to anon;
alter policy lectura_publica_fotos     on public.fotos     to anon;
alter policy lectura_publica_tallas    on public.tallas    to anon;

-- =====================================================================
-- 2. Columnas: las de tallas que no son públicas se cierran para authenticated
-- =====================================================================
-- REVOKE a nivel de tabla quita el SELECT de tabla y los de columna; INSERT, UPDATE y
-- DELETE se conservan. La lista es la misma que tiene anon y cubre todo lo que leen la
-- vista, fn_tallas_por_estado y las políticas.
revoke select on public.tallas from authenticated;
grant select (id, variante_id, talla, estado, vigencia_desde, vence_en, activa)
  on public.tallas to authenticated;

-- =====================================================================
-- 3. Lectura administrativa de tallas
-- =====================================================================
-- SECURITY DEFINER porque el rol que la llama ya no puede leer esas columnas. Devuelve
-- también las tallas inactivas. El código 42501 hace que PostgREST responda 403.
create or replace function public.fn_admin_tallas(p_variante_id uuid default null)
returns setof public.tallas
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.fn_es_administrador() then
    raise exception 'Solo un administrador puede consultar los datos internos.'
      using errcode = '42501';
  end if;

  return query
    select t.*
      from public.tallas t
     where p_variante_id is null or t.variante_id = p_variante_id
     order by t.variante_id, public.fn_valor_talla(t.talla), t.talla;
end;
$$;

comment on function public.fn_admin_tallas(uuid) is
  'Tallas con sus columnas internas. Unica lectura de esas columnas para una sesion; exige administrador.';

revoke all on function public.fn_admin_tallas(uuid) from public, anon, service_role;
grant execute on function public.fn_admin_tallas(uuid) to authenticated;

-- =====================================================================
-- 4. Funciones invoker que ningún rol de aplicación necesita ejecutar
-- =====================================================================
-- Comprobado en el catálogo:
--   · fn_lote_actual: solo la llama fn_registrar_historial, que es DEFINER y corre como
--     su propietario.
--   · fn_marcar_actualizado y fn_tallas_antes_de_escribir: solo disparadores. PostgreSQL
--     comprueba EXECUTE al crear el disparador, no al dispararse.
-- Ninguna aparece en políticas, vistas, valores por omisión, restricciones ni índices.
revoke all on function public.fn_lote_actual() from public, anon, authenticated, service_role;
revoke all on function public.fn_marcar_actualizado() from public, anon, authenticated, service_role;
revoke all on function public.fn_tallas_antes_de_escribir() from public, anon, authenticated, service_role;

-- =====================================================================
-- 5. Funciones de la vista: solo quien lee la vista
-- =====================================================================
-- La vista es security_invoker, así que quien la consulta necesita EXECUTE: anon (la
-- tienda) y authenticated (el panel). El GRANT va antes del REVOKE porque ambos roles
-- podrían depender de PUBLIC; sin quitar PUBLIC, revocar a un rol no tiene efecto.
grant execute on function public.fn_valor_talla(text) to anon, authenticated;
grant execute on function public.fn_estado_publico(public.estado_talla, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.fn_tallas_por_estado(uuid, public.estado_publico) to anon, authenticated;

revoke all on function public.fn_valor_talla(text) from public, service_role;
revoke all on function public.fn_estado_publico(public.estado_talla, timestamptz, timestamptz) from public, service_role;
revoke all on function public.fn_tallas_por_estado(uuid, public.estado_publico) from public, service_role;

-- =====================================================================
-- 6. Comprobación final: el estado completo de las dos migraciones correctivas
-- =====================================================================
-- No mira solo lo que hace este archivo: comprueba también el resultado de 20261107010000,
-- porque un proyecto puede haber cambiado a mano desde la última migración. Si algo no
-- coincide, la migración falla y `supabase db push` la revierte entera: cada archivo corre
-- en su propia transacción (comprobado saboteando esta migración en local).
do $$
declare
  v_nombre text;
  v_tabla regclass;
  f record;
  v_esperadas regprocedure[] := '{}';
  v_columnas text[];
begin
  -- ---------------------------------------------------- columnas de tallas
  foreach v_nombre in array array['publicado_en', 'registrado_en', 'confirmado_en', 'vigencia_horas',
                                  'origen', 'nota', 'estado_migrado', 'creado_en', 'actualizado_en'] loop
    if has_column_privilege('anon', 'public.tallas', v_nombre, 'SELECT')
       or has_column_privilege('authenticated', 'public.tallas', v_nombre, 'SELECT') then
      raise exception 'la columna interna tallas.% sigue siendo legible', v_nombre;
    end if;
  end loop;

  foreach v_nombre in array array['id', 'variante_id', 'talla', 'estado', 'vigencia_desde', 'vence_en', 'activa'] loop
    if not has_column_privilege('anon', 'public.tallas', v_nombre, 'SELECT')
       or not has_column_privilege('authenticated', 'public.tallas', v_nombre, 'SELECT') then
      raise exception 'la columna pública tallas.% dejó de ser legible: la vista fallaría', v_nombre;
    end if;
  end loop;

  -- --------------------------------------------- privilegios de authenticated
  -- Uno a uno a propósito: con varios en la misma llamada, has_table_privilege responde
  -- verdadero si existe CUALQUIERA de ellos.
  if has_table_privilege('authenticated', 'public.tallas', 'SELECT') then
    raise exception 'authenticated conserva SELECT de tabla sobre tallas: abre todas las columnas';
  end if;

  foreach v_nombre in array array['INSERT', 'UPDATE', 'DELETE'] loop
    if not has_table_privilege('authenticated', 'public.tallas', v_nombre) then
      raise exception 'authenticated perdió % sobre tallas: el administrador no podría gestionarlas', v_nombre;
    end if;
  end loop;

  -- Nadie se nombra administrador ni falsea el historial por escribir en esas tablas.
  foreach v_tabla in array array['public.historial', 'public.administradores']::regclass[] loop
    if has_any_column_privilege('authenticated', v_tabla, 'INSERT')
       or has_any_column_privilege('authenticated', v_tabla, 'UPDATE')
       or has_table_privilege('authenticated', v_tabla, 'DELETE')
       or has_table_privilege('authenticated', v_tabla, 'TRUNCATE') then
      raise exception 'authenticated puede escribir en %', v_tabla;
    end if;
  end loop;

  -- ------------------------------------------------------------ anon y RLS
  foreach v_tabla in array array['public.productos', 'public.variantes', 'public.fotos', 'public.tallas',
                                 'public.historial', 'public.administradores', 'public.configuracion']::regclass[] loop
    if has_any_column_privilege('anon', v_tabla, 'INSERT')
       or has_any_column_privilege('anon', v_tabla, 'UPDATE')
       or has_table_privilege('anon', v_tabla, 'DELETE')
       or has_table_privilege('anon', v_tabla, 'TRUNCATE') then
      raise exception 'anon puede escribir en %', v_tabla;
    end if;
    if not (select c.relrowsecurity from pg_class c where c.oid = v_tabla) then
      raise exception 'RLS desactivado en %', v_tabla;
    end if;
  end loop;

  foreach v_tabla in array array['public.historial', 'public.administradores', 'public.configuracion']::regclass[] loop
    if has_any_column_privilege('anon', v_tabla, 'SELECT') then
      raise exception 'anon puede leer %', v_tabla;
    end if;
  end loop;

  foreach v_tabla in array array['public.historial', 'public.administradores']::regclass[] loop
    if not (select c.relforcerowsecurity from pg_class c where c.oid = v_tabla) then
      raise exception '% perdió FORCE ROW LEVEL SECURITY', v_tabla;
    end if;
  end loop;

  -- -------------------------------------------------------------- políticas
  -- Toda política de una sesión pasa por fn_es_administrador, en USING y en CHECK.
  if exists (
    select 1 from pg_policies p
     where p.schemaname = 'public'
       and p.roles && array['authenticated', 'public']::name[]
       and (coalesce(p.qual, '') !~ '^(public\.)?fn_es_administrador\(\)$'
            or coalesce(p.with_check, p.qual) !~ '^(public\.)?fn_es_administrador\(\)$')
  ) then
    raise exception 'hay una política que concede filas a una sesión sin comprobar fn_es_administrador';
  end if;

  if (select count(*) from pg_policies p
       where p.schemaname = 'public' and p.policyname like 'lectura_publica_%'
         and p.roles = array['anon']::name[]) <> 4 then
    raise exception 'las cuatro políticas lectura_publica_* deben ser exclusivamente de anon';
  end if;

  if (select count(*) from pg_policies p
       where p.schemaname = 'public' and p.roles = array['authenticated']::name[]) <> 7 then
    raise exception 'deben existir las siete políticas administrativas';
  end if;

  if (select count(*) from pg_policies p where p.schemaname = 'public') <> 11 then
    raise exception 'hay políticas en public que no estaban previstas';
  end if;

  -- ------------------------------------------------------------------ vista
  if not exists (
    select 1 from pg_class c
     where c.oid = 'public.catalogo_publico'::regclass
       and 'security_invoker=true' = any (c.reloptions)
  ) then
    raise exception 'catalogo_publico perdió security_invoker';
  end if;

  select array_agg(a.attname::text order by a.attnum) into v_columnas
    from pg_attribute a
   where a.attrelid = 'public.catalogo_publico'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_columnas is distinct from array['id', 'codigoInterno', 'referencia', 'nombre', 'marca', 'categoria',
                                       'descripcion', 'segmento', 'destacado', 'nuevoIngreso', 'orden', 'variantes'] then
    raise exception 'las columnas de catalogo_publico cambiaron: %', v_columnas;
  end if;

  -- -------------------------------------------------------------- funciones
  -- Matriz exacta de las 14: seguridad, quién la ejecuta y si debe comprobar por dentro.
  for f in
    select x.firma::regprocedure as fn, x.definer, x.anon, x.sesion, x.guardia
      from (values
        ('public.fn_es_administrador()',                                          true,  false, true,  false),
        ('public.fn_confirmar_por_proveedor(uuid, smallint)',                     true,  false, true,  true),
        ('public.fn_confirmar_por_publicacion(uuid, timestamptz, smallint)',      true,  false, true,  true),
        ('public.fn_marcar_agotada(uuid, text)',                                  true,  false, true,  true),
        ('public.fn_admin_tallas(uuid)',                                          true,  false, true,  true),
        ('public.fn_asignar_codigo_interno()',                                    true,  false, false, false),
        ('public.fn_asignar_codigo_variante()',                                   true,  false, false, false),
        ('public.fn_registrar_historial()',                                       true,  false, false, false),
        ('public.fn_lote_actual()',                                               false, false, false, false),
        ('public.fn_marcar_actualizado()',                                        false, false, false, false),
        ('public.fn_tallas_antes_de_escribir()',                                  false, false, false, false),
        ('public.fn_valor_talla(text)',                                           false, true,  true,  false),
        ('public.fn_estado_publico(public.estado_talla, timestamptz, timestamptz)', false, true, true, false),
        ('public.fn_tallas_por_estado(uuid, public.estado_publico)',              false, true,  true,  false)
      ) as x(firma, definer, anon, sesion, guardia)
  loop
    v_esperadas := v_esperadas || f.fn;

    if has_function_privilege('anon', f.fn, 'EXECUTE') <> f.anon then
      raise exception 'EXECUTE de anon incorrecto sobre %', f.fn;
    end if;
    if has_function_privilege('authenticated', f.fn, 'EXECUTE') <> f.sesion then
      raise exception 'EXECUTE de authenticated incorrecto sobre %', f.fn;
    end if;
    if has_function_privilege('service_role', f.fn, 'EXECUTE') then
      raise exception 'service_role no debe tener EXECUTE sobre %', f.fn;
    end if;
    if (select p.prosecdef from pg_proc p where p.oid = f.fn) <> f.definer then
      raise exception 'SECURITY DEFINER/INVOKER incorrecto en %', f.fn;
    end if;
    if not (select coalesce(p.proconfig, '{}') @> array['search_path=""'] from pg_proc p where p.oid = f.fn) then
      raise exception '% no tiene search_path vacío', f.fn;
    end if;
    if f.guardia and (select p.prosrc from pg_proc p where p.oid = f.fn) !~ 'if not public\.fn_es_administrador\(\) then' then
      raise exception '% no comprueba fn_es_administrador por dentro', f.fn;
    end if;
  end loop;

  -- Inventario exacto y nadie por PUBLIC. Las funciones de una extensión instalada en
  -- public no son nuestras (y postgres tampoco podría revocarlas): se revisan aparte, con
  -- supabase/pruebas/auditar_funciones.sql.
  select p.oid::regprocedure::text into v_nombre
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not (p.oid::regprocedure = any (v_esperadas))
     and not exists (select 1 from pg_depend e
                      where e.classid = 'pg_proc'::regclass and e.objid = p.oid and e.deptype = 'e')
   limit 1;
  if found then
    raise exception 'hay una función en public que no estaba prevista: %', v_nombre;
  end if;

  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace,
           aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where n.nspname = 'public' and a.grantee = 0
       and not exists (select 1 from pg_depend e
                        where e.classid = 'pg_proc'::regclass and e.objid = p.oid and e.deptype = 'e')
  ) then
    raise exception 'queda alguna función de public con EXECUTE para PUBLIC';
  end if;

  -- ------------------------------------ privilegios predeterminados de funciones
  if not exists (
    select 1 from pg_default_acl d
     where d.defaclrole = 'postgres'::regrole and d.defaclobjtype = 'f' and d.defaclnamespace = 0
  ) or exists (
    select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
     where d.defaclrole = 'postgres'::regrole and d.defaclobjtype = 'f' and d.defaclnamespace = 0
       and a.grantee = 0
  ) then
    raise exception 'las funciones futuras de postgres nacerían con EXECUTE para PUBLIC';
  end if;

  if exists (
    select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
     where d.defaclrole = 'postgres'::regrole and d.defaclobjtype = 'f'
       and d.defaclnamespace = 'public'::regnamespace
       and a.grantee in (0, 'anon'::regrole::oid, 'authenticated'::regrole::oid, 'service_role'::regrole::oid)
  ) then
    raise exception 'las funciones futuras de postgres en public nacerían ejecutables por un rol de aplicación';
  end if;

  -- ---------------------------------------------------- secuencia y esquema
  foreach v_nombre in array array['anon', 'authenticated'] loop
    if has_sequence_privilege(v_nombre, 'public.seq_codigo_producto', 'USAGE, SELECT, UPDATE') then
      raise exception '% tiene privilegios sobre la secuencia de códigos', v_nombre;
    end if;
    if has_schema_privilege(v_nombre, 'public', 'CREATE') then
      raise exception '% puede crear objetos en public', v_nombre;
    end if;
  end loop;
end;
$$;
