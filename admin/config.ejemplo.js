/* Configuración del panel privado. Copia este archivo como admin/config.js (no se versiona)
 * y escribe los dos valores de tu proyecto:
 *
 *   supabaseUrl      Dashboard de Supabase → Project Settings → Data API → Project URL.
 *   clavePublicable  Dashboard → Project Settings → API Keys → Publishable key (sb_publishable_…).
 *
 * SOLO la clave publicable. Nunca una clave secreta (sb_secret_…), la service_role, la contraseña
 * de la base ni un token: el panel las rechaza, pero no deben llegar al navegador en ningún caso.
 * La protección real la hacen el RLS y las funciones de Supabase.
 */
window.GAMA_TALLA_ADMIN_CONFIG = {
  supabaseUrl: "https://<referencia-del-proyecto>.supabase.co",
  clavePublicable: "sb_publishable_<tu-clave-publicable>"
};
