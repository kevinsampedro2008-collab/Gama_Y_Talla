-- Etapa 13 · RLS y privilegios mínimos
--
-- Dos cerrojos independientes, como exige PostgreSQL:
--   1. PRIVILEGIOS: si el rol puede tocar la tabla y QUÉ COLUMNAS.
--   2. RLS: QUÉ FILAS ve de las que puede tocar.
-- Supabase advierte que una tabla nueva en «public» nace con todos los privilegios
-- concedidos: por eso lo primero es REVOCAR, no solo añadir políticas.

-- =====================================================================
-- 1. Revocar todo lo heredado
-- =====================================================================
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- =====================================================================
-- 2. RLS activo en todas las tablas
-- =====================================================================
alter table public.productos       enable row level security;
alter table public.variantes       enable row level security;
alter table public.fotos           enable row level security;
alter table public.tallas          enable row level security;
alter table public.historial       enable row level security;
alter table public.administradores enable row level security;
alter table public.configuracion   enable row level security;

-- Ni siquiera el dueño de la tabla se salta las políticas.
alter table public.historial       force row level security;
alter table public.administradores force row level security;

-- =====================================================================
-- 3. Lectura pública: SOLO las columnas que necesita el catálogo
-- =====================================================================
-- No se conceden: nota, estado_migrado, origen, publicado_en, confirmado_en,
-- registrado_en, vigencia_horas, creado_en, actualizado_en. No existen para el
-- visitante, ni por la vista ni consultando la tabla directamente.
--
-- clave_legado SÍ se concede, y es deliberado: el navegador la necesita para
-- reconocer un carrito V3 guardado antes de la migración. No es un dato privado
-- (se deriva de la referencia y del nombre de la foto, ambos ya públicos).

grant usage on schema public to anon, authenticated;

grant select (id, codigo_interno, referencia_proveedor, nombre, marca, categoria,
              descripcion, segmento, destacado, nuevo_ingreso, activo, orden, clave_legado)
  on public.productos to anon, authenticated;

grant select (id, producto_id, codigo_variante, color, referencia_variante,
              precio, precio_anterior, orden, activa, id_legado)
  on public.variantes to anon, authenticated;

grant select (id, variante_id, ruta, orden, alt)
  on public.fotos to anon, authenticated;

grant select (id, variante_id, talla, estado, vigencia_desde, vence_en, activa)
  on public.tallas to anon, authenticated;

grant select on public.catalogo_publico to anon, authenticated;

-- Funciones que la vista necesita ejecutar como invocador.
grant execute on function public.fn_estado_publico(public.estado_talla, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.fn_tallas_por_estado(uuid, public.estado_publico)               to anon, authenticated;
grant execute on function public.fn_valor_talla(text)                                            to anon, authenticated;

-- =====================================================================
-- 4. Políticas: qué filas
-- =====================================================================
-- Visitante: solo lo publicable. Un producto inactivo no existe para él,
-- ni sus variantes, ni sus fotos, ni sus tallas.
create policy lectura_publica_productos on public.productos
  for select to anon, authenticated
  using (activo);

create policy lectura_publica_variantes on public.variantes
  for select to anon, authenticated
  using (activa and exists (
    select 1 from public.productos p where p.id = producto_id and p.activo));

create policy lectura_publica_fotos on public.fotos
  for select to anon, authenticated
  using (exists (
    select 1 from public.variantes v
      join public.productos p on p.id = v.producto_id
     where v.id = variante_id and v.activa and p.activo));

create policy lectura_publica_tallas on public.tallas
  for select to anon, authenticated
  using (activa and exists (
    select 1 from public.variantes v
      join public.productos p on p.id = v.producto_id
     where v.id = variante_id and v.activa and p.activo));

-- Administrador: lectura y escritura completas sobre el catálogo.
do $$
declare t text;
begin
  foreach t in array array['productos', 'variantes', 'fotos', 'tallas'] loop
    execute format(
      'create policy admin_total_%1$s on public.%1$I for all to authenticated
         using (public.fn_es_administrador()) with check (public.fn_es_administrador())', t);
    execute format(
      'grant select, insert, update, delete on public.%1$I to authenticated', t);
  end loop;
end;
$$;

-- =====================================================================
-- 5. Lo que el visitante no puede ver de ninguna manera
-- =====================================================================
-- historial: solo lectura y solo para el administrador. Nadie puede modificarlo
-- ni borrarlo: no se concede UPDATE ni DELETE a ningún rol de aplicación.
-- Lo escribe un disparador SECURITY DEFINER, que no depende de estos permisos.
create policy historial_lectura_admin on public.historial
  for select to authenticated
  using (public.fn_es_administrador());

grant select on public.historial to authenticated;
revoke insert, update, delete on public.historial from anon, authenticated;

-- administradores: quién manda no es información pública.
create policy administradores_lectura on public.administradores
  for select to authenticated
  using (public.fn_es_administrador());

grant select on public.administradores to authenticated;

-- configuracion: lectura para el administrador; cambiarla, también.
create policy configuracion_admin on public.configuracion
  for all to authenticated
  using (public.fn_es_administrador())
  with check (public.fn_es_administrador());

grant select, insert, update on public.configuracion to authenticated;

-- La secuencia de códigos internos no se expone a nadie: la usa el valor por omisión.
revoke all on sequence public.seq_codigo_producto from anon, authenticated;
