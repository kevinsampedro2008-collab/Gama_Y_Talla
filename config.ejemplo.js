/* Configuración de la TIENDA pública de Gama & Talla (plantilla).
 *
 * Copia este archivo como «config.js» en la raíz del sitio y complétalo. config.js NO se
 * versiona (está en .gitignore): cada entorno tiene el suyo.
 *
 *   supabaseUrl      Dashboard → Project Settings → Data API → Project URL
 *   clavePublicable  Dashboard → Project Settings → API Keys → Publishable key (sb_publishable_…)
 *
 * Solo la clave PUBLICABLE (sb_publishable_…; por compatibilidad, también un JWT antiguo con
 * role anon). La tienda rechaza cualquier otra (secretas, JWT de service_role o de sesiones de
 * usuario, textos sin ese formato), no la usa y no imprime su valor. La protección real la dan el RLS y los
 * permisos de Supabase: la tienda solo lee la vista catalogo_publico como visitante.
 *
 * Sin config.js, en local (localhost, 127.0.0.1, file://) se ven los 28 productos de EJEMPLO
 * de data/productos.json; en producción, un aviso de catálogo no disponible.
 */
window.GAMA_TALLA_CONFIG = {
  supabaseUrl: "https://<referencia-del-proyecto>.supabase.co",
  clavePublicable: "sb_publishable_..."
};
