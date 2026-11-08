-- Etapa 16 · Fotografías comerciales en Supabase Storage
--
-- QUÉ HACE
-- --------
-- Un bucket público «fotos-catalogo» para las fotos de las zapatillas, que el panel sube con
-- la sesión del administrador (nunca con una clave secreta en el navegador).
--
--   · Lectura pública: la tienda pide cada foto por su URL pública. El bucket es público, así
--     que esa URL no consulta las políticas; listar, subir o borrar sí.
--   · Solo WebP y como mucho 1 MiB por archivo, comprobado por Storage al recibirlo. Storage
--     mira el tipo declarado, no el contenido: el panel comprueba la firma RIFF/WEBP, que el
--     navegador pueda decodificarla, sus dimensiones y su peso antes de subirla.
--   · Subir: solo un administrador, solo en este bucket y solo con el nombre que genera el
--     panel: productos/<uuid producto>/<uuid color>/<milisegundos>-<aleatorio>.webp.
--     Cada versión de una foto es un archivo nuevo: no hay política UPDATE, así que no se
--     puede sobrescribir un objeto (tampoco con «upsert»).
--   · Borrar: solo un administrador y solo un archivo que ninguna fila de public.fotos use.
--     Quitar una foto de la galería borra la FILA de public.fotos, no el archivo; borrar el
--     archivo es otra acción, que se hace con la API de Storage. Nunca por SQL: Storage guarda
--     el contenido fuera de la base y un DELETE en storage.objects lo dejaría huérfano.
--
-- No se crea ninguna función: las políticas usan public.fn_es_administrador() (ya ejecutable
-- por authenticated) y una subconsulta sobre public.fotos, que el administrador lee por RLS.
-- La auditoría de funciones no cambia por este archivo.
--
-- Idempotente: el bucket se crea o se ajusta, y las políticas se recrean.

-- =====================================================================
-- 1. El bucket
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-catalogo', 'fotos-catalogo', true, 1048576, array['image/webp'])
on conflict (id) do update
   set public             = excluded.public,
       file_size_limit    = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- =====================================================================
-- 2. Políticas sobre storage.objects, limitadas a este bucket
-- =====================================================================
drop policy if exists fotos_catalogo_lectura_admin on storage.objects;
drop policy if exists fotos_catalogo_subida_admin  on storage.objects;
drop policy if exists fotos_catalogo_borrado_admin on storage.objects;

-- Listar y comprobar que un archivo existe (el panel antes de guardar, la función de guardado
-- y la API de Storage al borrar, que primero lee el objeto). No hace falta para la tienda.
create policy fotos_catalogo_lectura_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos-catalogo' and public.fn_es_administrador());

-- Subir: nombre exacto del panel. Los UUID van en minúsculas, como los genera el navegador.
create policy fotos_catalogo_subida_admin on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fotos-catalogo'
    and public.fn_es_administrador()
    and name ~ '^productos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]{13}-[0-9a-z]{10}[.]webp$'
  );

-- Borrar: solo lo que ya no está en ninguna galería.
create policy fotos_catalogo_borrado_admin on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'fotos-catalogo'
    and public.fn_es_administrador()
    and not exists (
      select 1 from public.fotos f
       where pg_catalog.split_part(f.ruta, '/storage/v1/object/public/fotos-catalogo/', 2) = name)
  );
