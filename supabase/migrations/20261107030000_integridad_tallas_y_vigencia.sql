-- Etapa 14f.2 · Integridad de tallas y de la vigencia (migración correctiva)
--
-- QUÉ CORRIGE
-- -----------
--   1. TALLAS CON COMA. fn_valor_talla('40,5') fallaba («invalid input syntax for type numeric»)
--      y una sola talla así tumbaba catalogo_publico para todos y también fn_admin_tallas.
--      Ahora el formato se valida entero, al escribir (CHECK) y al leer (la función devuelve
--      NULL ante algo que no es una talla, nunca un error ni un número inventado).
--   2. DELETE FÍSICO. El administrador podía borrar tallas aunque la regla es «nunca se borra:
--      se desactiva». Se revocan DELETE y TRUNCATE a PUBLIC, anon y authenticated.
--   3. FECHAS FUTURAS. Se aceptaba un vigencia_desde futuro, y una talla podía figurar
--      DISPONIBLE más de 48 a 60 h. Ahora se rechaza al escribir y, al leer, una vigencia que
--      aún no empezó no es DISPONIBLE.
--
-- FORMATOS DE TALLA ADMITIDOS
-- ---------------------------
--   entero     40  040  9  0          1 a 3 cifras ASCII
--   decimal    40,5  40.5  40,50      coma o punto y 1 o 2 cifras decimales
--   fracción   40 1/3  40 2/4         entero, UN espacio y numerador/denominador de 1 o 2
--                                     cifras; denominador mayor que 0 y numerador menor
--                                     que el denominador (dos reglas independientes)
-- Se rechazan los formatos NO VÁLIDOS o PELIGROSOS: '' , '40foo', '40,5.2', '40,5,5', '40 1/0'
-- (división por cero), 'NaN', 'Infinity', signos y exponentes ('-40', '1e2'), cifras no ASCII
-- ('٤٠', '４０'), '40,' o '.5' (número incompleto) y '40 4/3' (fracción impropia: el entero
-- visible contradice el valor, que es 41 1/3).
--
-- LÍMITES Y POR QUÉ (no son reglas comerciales; ningún sistema de tallas real queda fuera):
--   · 3 cifras enteras: EU, US, UK y las tallas en milímetros (mondopoint, hasta 3 cifras).
--   · 2 cifras decimales: la subdivisión más fina que se usa es el cuarto (.25/.75).
--   · numerador y denominador de 2 cifras: medios, tercios y cuartos sobran.
--   Acotan la longitud (como mucho 9 caracteres) y garantizan conversiones exactas sin
--   desbordamiento. No se exige forma mínima: '40,50' y '40 2/4' se admiten.
--   · sin espacios exteriores ni dobles: la tienda recorta las etiquetas (limpiarTexto) y
--     ' 40' se fundiría en silencio con '40' en la misma talla y en la misma clave del
--     carrito; y valorTalla de app.js separa por UN espacio, así que '40  1/3' valdría 40.
--     Además, el HTML muestra igual uno que varios espacios.
--
-- REPRESENTACIONES EQUIVALENTES. '40,5', '40.5', '40,50', '40.50', '40 1/2' y '40 2/4' valen
-- exactamente lo mismo (40.5) y ordenan juntas, pero son etiquetas DISTINTAS: no se normalizan
-- ni se convierten, porque el carrito y la tienda muestran y guardan la etiqueta tal cual. La
-- unicidad sigue siendo (variante_id, talla), así que pueden convivir en una variante. El
-- panel debe usar una sola forma. La guía de tallas resalta su fila por igualdad exacta de
-- texto: una forma no habitual ('40,50') no resalta la fila «40.5», aunque se ordena bien.
--
-- POR QUÉ EL CHECK NO LLAMA A fn_valor_talla
-- -------------------------------------------
-- PostgreSQL comprueba EXECUTE sobre las funciones de un CHECK con el rol que escribe.
-- service_role no tiene EXECUTE sobre fn_valor_talla (y no debe recibirlo), así que el CHECK
-- usa solo funciones del catálogo del sistema. La gramática está escrita dos veces, aquí y en
-- fn_valor_talla; la comprobación final y la prueba 60 verifican que coinciden.
--
-- REFERENCIA DE TIEMPO: now()
-- ---------------------------
-- now() es el instante de inicio de la transacción. Se usa al escribir (disparador) y al leer
-- (fn_estado_publico), así que lo que se acepta al escribir es coherente al leerlo en la misma
-- transacción. Una confirmación generada por el servidor usa now() y por eso nunca se rechaza.
-- Consecuencia: un cliente cuyo reloj adelante, o una transacción larga que fija la hora real,
-- verá rechazada una fecha unos segundos «futura». No hay tolerancia: debe enviar una fecha
-- pasada o dejar que la ponga el servidor.
-- El estado efectivo depende de la hora y por eso no hay ningún CHECK con now() ni ninguna
-- función de reloj marcada IMMUTABLE.
--
-- ORDEN Y DEPENDENCIAS
-- --------------------
-- Va después de las nueve migraciones anteriores. La comprobación final de 20261107020000
-- exige DELETE para authenticated: si se volviera a ejecutar DESPUÉS de esta, fallaría. Las
-- migraciones nunca se re-ejecutan; este archivo sí puede repetirse sin efecto adicional.
--
-- QUÉ NO CAMBIA
-- -------------
-- Ninguna tabla, columna, clave foránea, índice ni unicidad. Ni las políticas, ni la vista, ni
-- las funciones SECURITY DEFINER. service_role conserva lo que ya tenía (incluido DELETE, con
-- el que se limpian los datos de prueba locales); no gana nada.

-- =====================================================================
-- 0. Datos existentes: se comprueban ANTES de cambiar nada
-- =====================================================================
-- Si hay tallas que no cumplen el formato, la migración falla y las enumera. No se borra,
-- renombra ni convierte nada en silencio: hay que corregirlas a mano y volver a aplicar.
do $$
declare
  v_malas text;
  v_total bigint;
  v_futuras bigint;
begin
  select count(*),
         string_agg(format('%s %L', t.id, t.talla), E'\n' order by t.talla, t.id)
           filter (where t.n <= 50)
    into v_total, v_malas
    from (select x.id, x.talla, row_number() over (order by x.talla, x.id) as n
            from public.tallas x
           where not (
             x.talla ~ '^[0-9]{1,3}([.,][0-9]{1,2}| [0-9]{1,2}/[0-9]{1,2})?$'
             and (strpos(x.talla, '/') = 0
                  or (((regexp_match(x.talla, ' ([0-9]{1,2})/([0-9]{1,2})$'))[2])::integer > 0
                      and ((regexp_match(x.talla, ' ([0-9]{1,2})/([0-9]{1,2})$'))[1])::integer
                            < ((regexp_match(x.talla, ' ([0-9]{1,2})/([0-9]{1,2})$'))[2])::integer)))
         ) t;

  if v_total > 0 then
    raise exception 'Hay % talla(s) con un formato no admitido. No se cambió nada.', v_total
      using detail = 'id y talla (hasta 50):' || E'\n' || v_malas,
            hint = 'Corrígelas a mano a 40, 40,5, 40.5 o 40 1/3 y vuelve a aplicar la migración.';
  end if;

  -- Las fechas futuras que ya existan se conservan: no se inventan fechas ni se renuevan
  -- vigencias. Desde esta migración se leen POR_REVISAR hasta que empiecen.
  select count(*) into v_futuras
    from public.tallas
   where publicado_en > now() or confirmado_en > now() or vigencia_desde > now();
  if v_futuras > 0 then
    raise notice '% talla(s) tienen fechas futuras. Se conservan; figurarán POR_REVISAR hasta que empiece su vigencia.', v_futuras;
  end if;
end;
$$;

-- =====================================================================
-- 1. Valor de una talla: estricto y sin errores
-- =====================================================================
-- IMMUTABLE: solo depende de su argumento (las expresiones regulares con [0-9] y el cast a
-- numeric no dependen de la configuración regional; \d sí: con en_US.UTF-8 acepta '٤٠').
-- Devuelve NULL ante un formato no admitido: así ninguna fila puede tumbar la vista, y el
-- CHECK impide que exista. trim_scale quita los ceros finales del resultado: '40,50',
-- '40 2/4' y '40,5' devuelven el mismo número también como texto (40.5).
create or replace function public.fn_valor_talla(p_talla text)
returns numeric
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_talla ~ '^[0-9]{1,3}$'
      then pg_catalog.trim_scale(p_talla::numeric)
    when p_talla ~ '^[0-9]{1,3}[.,][0-9]{1,2}$'
      then pg_catalog.trim_scale(pg_catalog.translate(p_talla, ',', '.')::numeric)
    when p_talla ~ '^[0-9]{1,3} [0-9]{1,2}/[0-9]{1,2}$'
      then (select case when f.d > 0 and f.n < f.d
                        then pg_catalog.trim_scale(f.e + f.n::numeric / f.d)
                   end
              from (select r.m[1]::integer as e, r.m[2]::integer as n, r.m[3]::integer as d
                      from pg_catalog.regexp_match(p_talla, '^([0-9]+) ([0-9]+)/([0-9]+)$') as r(m)) as f)
  end;
$$;

comment on function public.fn_valor_talla(text) is
  'Valor numerico de una talla para ordenar: 40 -> 40; 40,5, 40.5, 40,50 y 40 2/4 -> 40.5; 40 1/3 -> 40.333... NULL si el formato no es valido.';

-- =====================================================================
-- 2. Formato de la talla en la tabla
-- =====================================================================
-- Solo funciones del catálogo del sistema: ningún rol necesita EXECUTE para escribir.
-- Se recrea para que el archivo pueda repetirse; al añadirlo se valida cada fila existente.
alter table public.tallas drop constraint if exists tallas_talla_formato;
alter table public.tallas
  add constraint tallas_talla_formato check (
    talla ~ '^[0-9]{1,3}([.,][0-9]{1,2}| [0-9]{1,2}/[0-9]{1,2})?$'
    and (strpos(talla, '/') = 0
         or (((regexp_match(talla, ' ([0-9]{1,2})/([0-9]{1,2})$'))[2])::integer > 0
             and ((regexp_match(talla, ' ([0-9]{1,2})/([0-9]{1,2})$'))[1])::integer
                   < ((regexp_match(talla, ' ([0-9]{1,2})/([0-9]{1,2})$'))[2])::integer))
  );

comment on constraint tallas_talla_formato on public.tallas is
  'Formatos: 40 · 40,5 · 40.5 · 40,50 · 40 1/3 · 40 2/4 (denominador mayor que 0 y numerador menor). Misma gramatica que fn_valor_talla.';

-- =====================================================================
-- 3. Las tallas no se borran: se desactivan
-- =====================================================================
-- La regla «nunca se borra» pasa a ser un privilegio, no una convención del panel. Desactivar
-- (activa = false) y reactivar la MISMA fila siguen siendo UPDATE y quedan en el historial.
-- service_role y postgres conservan DELETE para mantenimiento; no son roles de la aplicación.
revoke delete, truncate on public.tallas from public, anon, authenticated;

-- =====================================================================
-- 4. Fechas: ninguna futura al escribir
-- =====================================================================
-- El disparador cubre por igual el INSERT/UPDATE directo y las funciones de confirmación,
-- que escriben con UPDATE. Solo mira una fecha si se suministra (INSERT) o cambia (UPDATE):
-- una fila antigua con fecha futura puede seguir editándose en lo demás.
create or replace function public.fn_tallas_antes_de_escribir()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_ahora constant timestamptz := pg_catalog.now();
  v_revisar_publicado boolean := true;
  v_revisar_confirmado boolean := true;
  v_revisar_vigencia boolean := true;
begin
  if tg_op = 'UPDATE' then
    v_revisar_publicado  := new.publicado_en   is distinct from old.publicado_en;
    v_revisar_confirmado := new.confirmado_en  is distinct from old.confirmado_en;
    v_revisar_vigencia   := new.vigencia_desde is distinct from old.vigencia_desde;
  end if;

  if v_revisar_publicado and new.publicado_en is not null then
    if not pg_catalog.isfinite(new.publicado_en) then
      raise exception 'publicado_en debe ser una fecha concreta, no %.', new.publicado_en
        using errcode = 'check_violation';
    elsif new.publicado_en > v_ahora then
      raise exception 'publicado_en no puede ser futura: % es posterior a la hora del servidor (%).',
                      new.publicado_en, v_ahora
        using errcode = 'check_violation',
              hint = 'Usa la fecha real de la publicación; la vigencia no puede empezar en el futuro.';
    end if;
  end if;

  if v_revisar_confirmado and new.confirmado_en is not null then
    if not pg_catalog.isfinite(new.confirmado_en) then
      raise exception 'confirmado_en debe ser una fecha concreta, no %.', new.confirmado_en
        using errcode = 'check_violation';
    elsif new.confirmado_en > v_ahora then
      raise exception 'confirmado_en no puede ser futura: % es posterior a la hora del servidor (%).',
                      new.confirmado_en, v_ahora
        using errcode = 'check_violation',
              hint = 'Para confirmar ahora usa fn_confirmar_por_proveedor: toma la hora del servidor.';
    end if;
  end if;

  if v_revisar_vigencia and new.vigencia_desde is not null then
    if not pg_catalog.isfinite(new.vigencia_desde) then
      raise exception 'vigencia_desde debe ser una fecha concreta, no %.', new.vigencia_desde
        using errcode = 'check_violation';
    elsif new.vigencia_desde > v_ahora then
      raise exception 'vigencia_desde no puede ser futura: % es posterior a la hora del servidor (%).',
                      new.vigencia_desde, v_ahora
        using errcode = 'check_violation',
              hint = 'La vigencia empieza en la publicación o en la confirmación, nunca después de ahora.';
    end if;
  end if;

  -- Sin cambios respecto a 20261105020000: el reloj lo mueve vigencia_desde.
  new.vence_en := case
                    when new.vigencia_desde is null then null
                    else new.vigencia_desde + pg_catalog.make_interval(hours => new.vigencia_horas)
                  end;
  new.actualizado_en := v_ahora;
  return new;
end;
$$;

-- =====================================================================
-- 5. Estado efectivo: DISPONIBLE solo dentro de [vigencia_desde, vence_en)
-- =====================================================================
-- STABLE porque depende de now(). AGOTADO no vence nunca; todo lo demás que no esté dentro
-- del intervalo (sin fechas, vencido o aún no empezado) es POR_REVISAR.
create or replace function public.fn_estado_publico(
  p_estado         public.estado_talla,
  p_vigencia_desde timestamptz,
  p_vence_en       timestamptz
)
returns public.estado_publico
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when p_estado = 'AGOTADA'                        then 'AGOTADO'::public.estado_publico
    when p_estado = 'REVISAR'                        then 'POR_REVISAR'::public.estado_publico
    when p_vigencia_desde is null or p_vence_en is null then 'POR_REVISAR'::public.estado_publico
    when p_vigencia_desde <= pg_catalog.now()
     and pg_catalog.now() < p_vence_en               then 'DISPONIBLE'::public.estado_publico
    else                                                  'POR_REVISAR'::public.estado_publico
  end;
$$;

comment on function public.fn_estado_publico(public.estado_talla, timestamptz, timestamptz) is
  'Estado que ve el cliente. DISPONIBLE solo si vigencia_desde <= now() < vence_en. AGOTADO nunca vence; lo demas es POR_REVISAR.';

-- =====================================================================
-- 6. Permisos de las funciones reemplazadas
-- =====================================================================
-- CREATE OR REPLACE conserva los permisos; se repiten para que el estado sea explícito.
grant execute on function public.fn_valor_talla(text) to anon, authenticated;
grant execute on function public.fn_estado_publico(public.estado_talla, timestamptz, timestamptz) to anon, authenticated;
revoke all on function public.fn_valor_talla(text) from public, service_role;
revoke all on function public.fn_estado_publico(public.estado_talla, timestamptz, timestamptz) from public, service_role;
revoke all on function public.fn_tallas_antes_de_escribir() from public, anon, authenticated, service_role;

-- =====================================================================
-- 7. Comprobación final
-- =====================================================================
-- Revisa el estado completo, no solo lo que hace este archivo, y enumera TODOS los problemas
-- antes de fallar. Solo lee el catálogo y llama a funciones puras: no escribe nada.
do $$
declare
  p text[] := '{}';
  v text;
  v_tabla regclass;
  f record;
  v_esperadas regprocedure[] := '{}';
  v_columnas text[];
  v_tg record;
  v_expresion text;
  v_acepta boolean;
begin
  -- ------------------------------------------------------ tallas: privilegios
  -- Uno a uno: con varios a la vez, has_table_privilege responde si existe CUALQUIERA.
  foreach v in array array['anon', 'authenticated'] loop
    if has_table_privilege(v, 'public.tallas', 'DELETE') then
      p := p || format('%s puede hacer DELETE en tallas (directo o heredado)', v);
    end if;
    if has_table_privilege(v, 'public.tallas', 'TRUNCATE') then
      p := p || format('%s puede hacer TRUNCATE en tallas', v);
    end if;
    -- Un rol del que sea miembro sin heredarlo también cuenta: puede pasar a él con SET ROLE.
    for f in
      select r.rolname from pg_roles r
       where r.rolname <> v and pg_has_role(v, r.oid, 'MEMBER')
         and (has_table_privilege(r.oid, 'public.tallas', 'DELETE') or has_table_privilege(r.oid, 'public.tallas', 'TRUNCATE'))
    loop
      p := p || format('%s es miembro de %s, que puede borrar tallas', v, f.rolname);
    end loop;
  end loop;
  if exists (select 1 from pg_class c, aclexplode(c.relacl) a
              where c.oid = 'public.tallas'::regclass and a.grantee = 0) then
    p := p || 'tallas concede algún privilegio a PUBLIC'::text;
  end if;
  foreach v in array array['INSERT', 'UPDATE'] loop
    if not has_table_privilege('authenticated', 'public.tallas', v) then
      p := p || format('authenticated perdió %s sobre tallas: el administrador no podría gestionarlas', v);
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.tallas', 'SELECT') then
    p := p || 'authenticated tiene SELECT de tabla sobre tallas: abre todas las columnas'::text;
  end if;
  foreach v in array array['publicado_en', 'registrado_en', 'confirmado_en', 'vigencia_horas',
                           'origen', 'nota', 'estado_migrado', 'creado_en', 'actualizado_en'] loop
    if has_column_privilege('anon', 'public.tallas', v, 'SELECT')
       or has_column_privilege('authenticated', 'public.tallas', v, 'SELECT') then
      p := p || format('la columna interna tallas.%s es legible', v);
    end if;
  end loop;
  foreach v in array array['id', 'variante_id', 'talla', 'estado', 'vigencia_desde', 'vence_en', 'activa'] loop
    if not has_column_privilege('anon', 'public.tallas', v, 'SELECT')
       or not has_column_privilege('authenticated', 'public.tallas', v, 'SELECT') then
      p := p || format('la columna pública tallas.%s dejó de ser legible: la vista fallaría', v);
    end if;
  end loop;

  -- Ninguna función que una sesión pueda ejecutar borra tallas por su cuenta.
  for f in
    select p2.oid::regprocedure as fn from pg_proc p2 join pg_namespace n on n.oid = p2.pronamespace
     where n.nspname = 'public' and p2.prosecdef
       and (has_function_privilege('anon', p2.oid, 'EXECUTE') or has_function_privilege('authenticated', p2.oid, 'EXECUTE'))
       and p2.prosrc ~* '\m(delete\s+from|truncate)\s+(only\s+)?(table\s+)?("?public"?\s*\.\s*)?"?tallas\M'
  loop
    p := p || format('%s es SECURITY DEFINER, la ejecuta una sesión y borra tallas', f.fn);
  end loop;

  -- ------------------------------------------ resto de tablas, RLS y políticas
  foreach v_tabla in array array['public.historial', 'public.administradores']::regclass[] loop
    if has_any_column_privilege('authenticated', v_tabla, 'INSERT')
       or has_any_column_privilege('authenticated', v_tabla, 'UPDATE')
       or has_table_privilege('authenticated', v_tabla, 'DELETE')
       or has_table_privilege('authenticated', v_tabla, 'TRUNCATE') then
      p := p || format('authenticated puede escribir en %s', v_tabla);
    end if;
  end loop;
  foreach v_tabla in array array['public.productos', 'public.variantes', 'public.fotos', 'public.tallas',
                                 'public.historial', 'public.administradores', 'public.configuracion']::regclass[] loop
    if has_any_column_privilege('anon', v_tabla, 'INSERT')
       or has_any_column_privilege('anon', v_tabla, 'UPDATE')
       or has_table_privilege('anon', v_tabla, 'DELETE')
       or has_table_privilege('anon', v_tabla, 'TRUNCATE') then
      p := p || format('anon puede escribir en %s', v_tabla);
    end if;
    if not (select c.relrowsecurity from pg_class c where c.oid = v_tabla) then
      p := p || format('RLS desactivado en %s', v_tabla);
    end if;
  end loop;
  foreach v_tabla in array array['public.historial', 'public.administradores', 'public.configuracion']::regclass[] loop
    if has_any_column_privilege('anon', v_tabla, 'SELECT') then
      p := p || format('anon puede leer %s', v_tabla);
    end if;
  end loop;
  foreach v_tabla in array array['public.historial', 'public.administradores']::regclass[] loop
    if not (select c.relforcerowsecurity from pg_class c where c.oid = v_tabla) then
      p := p || format('%s perdió FORCE ROW LEVEL SECURITY', v_tabla);
    end if;
  end loop;
  if exists (
    select 1 from pg_policies x
     where x.schemaname = 'public'
       and x.roles && array['authenticated', 'public']::name[]
       and (coalesce(x.qual, '') !~ '^(public\.)?fn_es_administrador\(\)$'
            or coalesce(x.with_check, x.qual) !~ '^(public\.)?fn_es_administrador\(\)$')
  ) then
    p := p || 'hay una política que concede filas a una sesión sin comprobar fn_es_administrador'::text;
  end if;
  if (select count(*) from pg_policies x
       where x.schemaname = 'public' and x.policyname like 'lectura_publica_%' and x.roles = array['anon']::name[]) <> 4
     or (select count(*) from pg_policies x where x.schemaname = 'public' and x.roles = array['authenticated']::name[]) <> 7
     or (select count(*) from pg_policies x where x.schemaname = 'public') <> 11 then
    p := p || 'las políticas no son las 11 previstas (4 de lectura para anon y 7 administrativas)'::text;
  end if;

  -- ------------------------------------------------------- formato de la talla
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.tallas'::regclass and c.conname = 'tallas_talla_formato'
                    and c.contype = 'c' and c.convalidated) then
    p := p || 'falta el CHECK tallas_talla_formato o no está validado'::text;
  end if;
  -- Ningún CHECK de public depende de una función ajena al catálogo del sistema (exigiría
  -- EXECUTE al que escribe) ni de una que no sea IMMUTABLE (el reloj no va en un CHECK).
  for f in
    select c.conrelid::regclass as tabla, c.conname, d.refobjid::regprocedure as fn
      from pg_constraint c
      join pg_depend d on d.classid = 'pg_constraint'::regclass and d.objid = c.oid
                      and d.refclassid = 'pg_proc'::regclass
      join pg_proc x on x.oid = d.refobjid
     where c.contype = 'c' and c.connamespace = 'public'::regnamespace
       and (x.pronamespace <> 'pg_catalog'::regnamespace or x.provolatile <> 'i')
  loop
    p := p || format('el CHECK %s de %s usa %s: debe usar solo funciones IMMUTABLE del sistema', f.conname, f.tabla, f.fn);
  end loop;
  -- Las funciones del sistema no constan en pg_depend: el reloj se busca en la definición.
  for f in
    select c.conrelid::regclass as tabla, c.conname
      from pg_constraint c
     where c.contype = 'c' and c.connamespace = 'public'::regnamespace
       and pg_get_constraintdef(c.oid) ~* '\m(now|clock_timestamp|statement_timestamp|transaction_timestamp|timeofday)\s*\(|\m(current_timestamp|current_date|current_time|localtimestamp|localtime)\M'
  loop
    p := p || format('el CHECK %s de %s depende del reloj', f.conname, f.tabla);
  end loop;

  -- La función de valor y el CHECK aceptan la misma gramática, la esperada. El CHECK se
  -- evalúa sobre cada caso con su propia expresión (pg_get_expr), sin escribir ninguna fila;
  -- como en un CHECK, NULL cuenta como aceptado. Cada caso va en su propio bloque: un error se
  -- informa como problema.
  select pg_get_expr(c.conbin, c.conrelid) into v_expresion
    from pg_constraint c where c.conrelid = 'public.tallas'::regclass and c.conname = 'tallas_talla_formato';
  for f in
    select x.talla, x.valor
      from (values ('40', 40::numeric), ('9', 9), ('100', 100), ('999', 999), ('0', 0), ('040', 40),
                   ('40,5', 40.5), ('40.5', 40.5), ('40,50', 40.5), ('40.50', 40.5), ('40,0', 40), ('40,05', 40.05),
                   ('8.25', 8.25), ('40 1/3', 40 + 1::numeric / 3), ('40 2/3', 40 + 2::numeric / 3),
                   ('40 01/3', 40 + 1::numeric / 3), ('40 1/2', 40.5), ('40 2/4', 40.5), ('40 3/6', 40.5), ('40 0/3', 40),
                   ('', null), (' 40', null), ('40 ', null), ('1000', null), ('0040', null), ('40,', null), ('40.', null),
                   ('.5', null), (',5', null), ('40,555', null), ('40,5.2', null), ('40,5,5', null), ('40foo', null),
                   ('40 1/0', null), ('40 0/0', null), ('40 3/3', null), ('40 4/3', null), ('40 1/100', null),
                   ('40  1/3', null), ('40 1/3 ', null), ('40/3', null), ('40 /3', null), ('-40', null), ('+40', null),
                   ('1e2', null), ('NaN', null), ('Infinity', null), (E'40\n', null), (E'40\t', null), ('４０', null),
                   ('٤٠', null), ('40½', null), ('40' || chr(160) || '1/3', null)) as x(talla, valor)
  loop
    begin
      if public.fn_valor_talla(f.talla) is distinct from f.valor then
        p := p || format('fn_valor_talla(%L) devuelve %s y debía devolver %s', f.talla,
                         coalesce(public.fn_valor_talla(f.talla)::text, 'NULL'), coalesce(f.valor::text, 'NULL'));
      end if;
    exception when others then
      p := p || format('fn_valor_talla(%L) produce un error: %s', f.talla, sqlerrm);
    end;
    if v_expresion is not null then
      begin
        execute format('select coalesce((%s), true) from (select $1::text as talla) as s', v_expresion)
          into v_acepta using f.talla;
        if v_acepta <> (f.valor is not null) then
          p := p || format('el CHECK tallas_talla_formato %s %L y debía %s', case when v_acepta then 'acepta' else 'rechaza' end,
                           f.talla, case when f.valor is null then 'rechazarla' else 'aceptarla' end);
        end if;
      exception when others then
        p := p || format('el CHECK tallas_talla_formato produce un error con %L: %s', f.talla, sqlerrm);
      end;
    end if;
  end loop;
  if public.fn_valor_talla(null) is not null then
    p := p || 'fn_valor_talla(NULL) no devuelve NULL'::text;
  end if;
  -- Las formas equivalentes dan el mismo número, también como texto.
  if (select count(distinct public.fn_valor_talla(x)::text) from unnest(array['40,5', '40.5', '40,50', '40.50', '40 1/2', '40 2/4']) x) <> 1
     or public.fn_valor_talla('40 2/4')::text <> '40.5' then
    p := p || 'las formas equivalentes de 40,5 no devuelven el mismo valor 40.5'::text;
  end if;

  -- --------------------------------------------------------------- vigencia
  -- tgtype 23 = FOR EACH ROW (1) + BEFORE (2) + INSERT (4) + UPDATE (16).
  select t.tgenabled, t.tgtype, t.tgfoid into v_tg
    from pg_trigger t where t.tgrelid = 'public.tallas'::regclass and t.tgname = 'tr_tallas_vigencia';
  if not found or v_tg.tgenabled <> 'O' or v_tg.tgtype <> 23
     or v_tg.tgfoid <> 'public.fn_tallas_antes_de_escribir()'::regprocedure then
    p := p || 'tr_tallas_vigencia no es BEFORE INSERT OR UPDATE FOR EACH ROW con fn_tallas_antes_de_escribir, o está desactivado'::text;
  end if;
  foreach v in array array['publicado_en', 'confirmado_en', 'vigencia_desde'] loop
    if (select x.prosrc from pg_proc x where x.oid = 'public.fn_tallas_antes_de_escribir()'::regprocedure)
       !~ ('new\.' || v || ' > v_ahora') then
      p := p || format('fn_tallas_antes_de_escribir no rechaza %s futura', v);
    end if;
  end loop;

  -- Estado efectivo en los bordes, con el now() de esta transacción.
  for f in
    select x.caso, x.esperado, public.fn_estado_publico(x.estado::public.estado_talla, x.desde, x.vence) as obtenido
      from (values
        ('vigente',                  'CONFIRMADA', now() - interval '1 hour',  now() + interval '47 hours', 'DISPONIBLE'),
        ('empieza justo ahora',      'CONFIRMADA', now(),                      now() + interval '48 hours', 'DISPONIBLE'),
        ('aún no empieza',           'CONFIRMADA', now() + interval '1 microsecond', now() + interval '49 hours', 'POR_REVISAR'),
        ('vence justo ahora',        'CONFIRMADA', now() - interval '48 hours', now(),                      'POR_REVISAR'),
        ('vence en 1 µs',            'CONFIRMADA', now() - interval '48 hours', now() + interval '1 microsecond', 'DISPONIBLE'),
        ('vencida',                  'CONFIRMADA', now() - interval '72 hours', now() - interval '24 hours', 'POR_REVISAR'),
        ('sin vigencia_desde',       'CONFIRMADA', null,                       now() + interval '1 hour',   'POR_REVISAR'),
        ('sin vence_en',             'CONFIRMADA', now() - interval '1 hour',  null,                        'POR_REVISAR'),
        ('agotada vencida',          'AGOTADA',    now() - interval '900 hours', now() - interval '800 hours', 'AGOTADO'),
        ('agotada sin fechas',       'AGOTADA',    null,                       null,                        'AGOTADO'),
        ('agotada futura',           'AGOTADA',    now() + interval '1 hour',  now() + interval '49 hours', 'AGOTADO'),
        ('revisar vigente',          'REVISAR',    now() - interval '1 hour',  now() + interval '47 hours', 'POR_REVISAR')
      ) as x(caso, estado, desde, vence, esperado)
  loop
    if f.obtenido is distinct from f.esperado::public.estado_publico then
      p := p || format('fn_estado_publico, caso «%s»: %s en vez de %s', f.caso, f.obtenido, f.esperado);
    end if;
  end loop;

  -- Ninguna función IMMUTABLE de public mira el reloj.
  for f in
    select x.oid::regprocedure as fn from pg_proc x
     where x.pronamespace = 'public'::regnamespace and x.provolatile = 'i'
       and x.prosrc ~* '\m(now|clock_timestamp|statement_timestamp|transaction_timestamp|timeofday)\s*\(|\m(current_timestamp|current_date|current_time|localtimestamp|localtime)\M'
  loop
    p := p || format('%s es IMMUTABLE pero depende del reloj', f.fn);
  end loop;

  -- ------------------------------------------------------------------ vista
  if not exists (select 1 from pg_class c
                  where c.oid = 'public.catalogo_publico'::regclass and 'security_invoker=true' = any (c.reloptions)) then
    p := p || 'catalogo_publico perdió security_invoker'::text;
  end if;
  select array_agg(a.attname::text order by a.attnum) into v_columnas
    from pg_attribute a
   where a.attrelid = 'public.catalogo_publico'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_columnas is distinct from array['id', 'codigoInterno', 'referencia', 'nombre', 'marca', 'categoria',
                                       'descripcion', 'segmento', 'destacado', 'nuevoIngreso', 'orden', 'variantes'] then
    p := p || format('las columnas de catalogo_publico cambiaron: %s', v_columnas);
  end if;

  -- -------------------------------------------------------------- funciones
  -- Matriz exacta de las 14 por FIRMA COMPLETA; volatilidad solo donde importa.
  for f in
    select to_regprocedure(x.firma) as fn, x.firma, x.definer, x.anon, x.sesion, x.guardia, x.volatil
      from (values
        ('public.fn_es_administrador()',                                          true,  false, true,  false, null),
        ('public.fn_confirmar_por_proveedor(uuid, smallint)',                     true,  false, true,  true,  null),
        ('public.fn_confirmar_por_publicacion(uuid, timestamptz, smallint)',      true,  false, true,  true,  null),
        ('public.fn_marcar_agotada(uuid, text)',                                  true,  false, true,  true,  null),
        ('public.fn_admin_tallas(uuid)',                                          true,  false, true,  true,  's'),
        ('public.fn_asignar_codigo_interno()',                                    true,  false, false, false, null),
        ('public.fn_asignar_codigo_variante()',                                   true,  false, false, false, null),
        ('public.fn_registrar_historial()',                                       true,  false, false, false, null),
        ('public.fn_lote_actual()',                                               false, false, false, false, null),
        ('public.fn_marcar_actualizado()',                                        false, false, false, false, null),
        ('public.fn_tallas_antes_de_escribir()',                                  false, false, false, false, 'v'),
        ('public.fn_valor_talla(text)',                                           false, true,  true,  false, 'i'),
        ('public.fn_estado_publico(public.estado_talla, timestamptz, timestamptz)', false, true, true, false, 's'),
        ('public.fn_tallas_por_estado(uuid, public.estado_publico)',              false, true,  true,  false, 's')
      ) as x(firma, definer, anon, sesion, guardia, volatil)
  loop
    if f.fn is null then
      p := p || format('falta la función %s', f.firma);
      continue;
    end if;
    v_esperadas := v_esperadas || f.fn;
    if has_function_privilege('anon', f.fn, 'EXECUTE') <> f.anon then
      p := p || format('EXECUTE de anon incorrecto sobre %s', f.firma);
    end if;
    if has_function_privilege('authenticated', f.fn, 'EXECUTE') <> f.sesion then
      p := p || format('EXECUTE de authenticated incorrecto sobre %s', f.firma);
    end if;
    if has_function_privilege('service_role', f.fn, 'EXECUTE') then
      p := p || format('service_role no debe tener EXECUTE sobre %s', f.firma);
    end if;
    if (select x.prosecdef from pg_proc x where x.oid = f.fn) <> f.definer then
      p := p || format('SECURITY DEFINER/INVOKER incorrecto en %s', f.firma);
    end if;
    if not (select coalesce(x.proconfig, '{}') @> array['search_path=""'] from pg_proc x where x.oid = f.fn) then
      p := p || format('%s no tiene search_path vacío', f.firma);
    end if;
    if f.guardia and (select x.prosrc from pg_proc x where x.oid = f.fn) !~ 'if not public\.fn_es_administrador\(\) then' then
      p := p || format('%s no comprueba fn_es_administrador por dentro', f.firma);
    end if;
    if f.volatil is not null and (select x.provolatile::text from pg_proc x where x.oid = f.fn) <> f.volatil then
      p := p || format('%s debe ser %s', f.firma,
                       case f.volatil when 'i' then 'IMMUTABLE' when 's' then 'STABLE' else 'VOLATILE' end);
    end if;
    if (select pg_get_userbyid(x.proowner) from pg_proc x where x.oid = f.fn) <> 'postgres' then
      p := p || format('%s no es de postgres', f.firma);
    end if;
  end loop;

  for f in
    select x.oid::regprocedure as fn from pg_proc x
     where x.pronamespace = 'public'::regnamespace
       and not (x.oid::regprocedure = any (v_esperadas))
       and not exists (select 1 from pg_depend e
                        where e.classid = 'pg_proc'::regclass and e.objid = x.oid and e.deptype = 'e')
  loop
    p := p || format('función no prevista en public: %s', f.fn);
  end loop;

  if exists (
    select 1 from pg_proc x, aclexplode(coalesce(x.proacl, acldefault('f', x.proowner))) a
     where x.pronamespace = 'public'::regnamespace and a.grantee = 0
       and not exists (select 1 from pg_depend e
                        where e.classid = 'pg_proc'::regclass and e.objid = x.oid and e.deptype = 'e')
  ) then
    p := p || 'queda alguna función de public con EXECUTE para PUBLIC'::text;
  end if;

  -- Las extensiones instaladas en public no se corrigen aquí (en un PostgreSQL corriente,
  -- pgcrypto vive en public); se avisa y las detalla supabase/pruebas/auditar_funciones.sql.
  select string_agg(distinct e.extname, ', ') into v
    from pg_extension e where e.extnamespace = 'public'::regnamespace;
  if v is not null then
    raise notice 'Extensiones instaladas en public: %. Revísalas con supabase/pruebas/auditar_funciones.sql.', v;
  end if;

  -- ------------------------------------ privilegios predeterminados de funciones
  if not exists (select 1 from pg_default_acl d
                  where d.defaclrole = 'postgres'::regrole and d.defaclobjtype = 'f' and d.defaclnamespace = 0)
     or exists (select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
                 where d.defaclrole = 'postgres'::regrole and d.defaclobjtype = 'f' and d.defaclnamespace = 0
                   and a.grantee = 0) then
    p := p || 'las funciones futuras de postgres nacerían con EXECUTE para PUBLIC'::text;
  end if;
  if exists (select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
              where d.defaclrole = 'postgres'::regrole and d.defaclobjtype = 'f'
                and d.defaclnamespace = 'public'::regnamespace
                and a.grantee in (0, 'anon'::regrole::oid, 'authenticated'::regrole::oid, 'service_role'::regrole::oid)) then
    p := p || 'las funciones futuras de postgres en public nacerían ejecutables por un rol de aplicación'::text;
  end if;

  -- ---------------------------------------------------- secuencia y esquema
  foreach v in array array['anon', 'authenticated'] loop
    if has_sequence_privilege(v, 'public.seq_codigo_producto', 'USAGE')
       or has_sequence_privilege(v, 'public.seq_codigo_producto', 'SELECT')
       or has_sequence_privilege(v, 'public.seq_codigo_producto', 'UPDATE') then
      p := p || format('%s tiene privilegios sobre la secuencia de códigos', v);
    end if;
    if has_schema_privilege(v, 'public', 'CREATE') then
      p := p || format('%s puede crear objetos en public', v);
    end if;
  end loop;

  if cardinality(p) > 0 then
    raise exception '20261107030000: % problema(s) en el estado final. No se aplicó nada.', cardinality(p)
      using detail = ' - ' || array_to_string(p, E'\n - ');
  end if;
end;
$$;
