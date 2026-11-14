/* Gama & Talla · Paquete estático para Netlify (y cualquier hosting estático).
 *
 *   node scripts/preparar-publicacion.mjs [--salida dist] [--raiz .]
 *
 * Lee TRES variables del entorno de compilación (nunca se imprimen sus valores):
 *   SUPABASE_URL              https://<referencia>.supabase.co del proyecto aprobado
 *   SUPABASE_PUBLISHABLE_KEY  clave publicable (sb_publishable_…); jamás una secreta
 *   WHATSAPP_COMERCIAL        número comercial con prefijo de país (p. ej. 57…); no el provisional
 *
 * Qué hace
 *   1. Valida las variables. Si falta o es inválida alguna, nombra la variable a corregir y termina
 *      con código 1 sin escribir nada.
 *   2. Copia, con una LISTA EXPLÍCITA, solo lo necesario de «/» y «/admin/». Quedan fuera los
 *      ejemplos (data/productos.json, data/pruebas, fotos de ejemplo salvo las tres de la portada),
 *      las pruebas, los respaldos, las migraciones, los .env y las configuraciones locales.
 *   3. Genera dist/config.js y dist/admin/config.js con los objetos que ya usan la tienda y el panel
 *      (en producción: sin catálogo de demostración, sin «?datos-prueba»).
 *   4. Da nombres con HASH DE CONTENIDO a los tres .glb optimizados de la intro y a los dos pósteres
 *      WebP, y actualiza la referencia en assets/js/catalog-intro.js. Mismos bytes → misma URL;
 *      bytes distintos → URL nueva.
 *   5. Genera dist/_headers: «immutable» de un año SOLO para esos archivos versionados, revalidación
 *      del HTML y «no-store» para los config.js generados; y dist/_redirects (/admin → /admin/).
 *   6. Verifica el paquete: toda ruta assets/… que cargan el HTML, el CSS y el JS existe (salvo las
 *      de ejemplo, que en producción no se piden) y cada archivo versionado de _headers existe.
 *
 * Sin dependencias: solo Node.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARCA = '.gama-talla-dist';
const NUMERO_PROVISIONAL = '573000000000';
const PROYECTO_APROBADO = process.env.GT_PROYECTO_PERMITIDO || 'mwhiusocfdwzxnzenfsz'; // gama-talla-dev
const INMUTABLE = 'public, max-age=31536000, immutable';

// ---------------------------------------------------------------- lista explícita de archivos
const ARCHIVOS = [
  'index.html', 'styles.css', 'app.js', 'favicon.svg',
  'data/guias-tallas.json',
  'privacidad/index.html', 'privacidad/privacidad.css',
  'assets/css/catalog-intro.css',
  'assets/js/catalog-intro.js', 'assets/js/catalog-intro-escena.js',
  'assets/images/branding/placeholder.svg',
  'assets/images/pagos/nequi-icono.png', 'assets/images/pagos/bancolombia-icono.svg',
  // Fotos de la portada (las tres que usa index.html y la de la vista previa al compartir).
  'assets/images/productos/editadas/zapatilla_48.webp', 'assets/images/productos/editadas/zapatilla_24.webp', 'assets/images/productos/editadas/zapatilla_11.webp',
  'admin/index.html', 'admin/admin.css', 'admin/admin.js', 'admin/editor.js', 'admin/fotos.js'
];
// Carpetas completas: el SDK del panel y three.js (con Draco), que la escena importa por import map.
const CARPETAS = ['admin/vendor/supabase-js-2.118.0', 'assets/vendor/three-0.165.0'];
// Recursos versionados por contenido: [origen, plantilla del destino con {h}, referencia a reescribir].
const VERSIONADOS = [
  ['assets/images/models/optimized/af1-model-high.glb', 'assets/images/models/optimized/af1-model-high.{h}.glb'],
  ['assets/images/models/optimized/af1-model-medium.glb', 'assets/images/models/optimized/af1-model-medium.{h}.glb'],
  ['assets/images/models/optimized/af1-model-low.glb', 'assets/images/models/optimized/af1-model-low.{h}.glb'],
  ['assets/images/intro/poster-amplio.webp', 'assets/images/intro/poster-amplio.{h}.webp'],
  ['assets/images/intro/poster-compacto.webp', 'assets/images/intro/poster-compacto.{h}.webp']
];
const DONDE_SE_REFERENCIAN = 'assets/js/catalog-intro.js';
// Rutas que el código nombra pero que en producción NO se piden: ejemplos y depuración.
const AUSENTES_PERMITIDAS = [/^assets\/images\/productos\/editadas\//, /^assets\/images\/models\/af1-model\.glb$/];

class ErrorPublicacion extends Error {}
const fallar = (m) => { throw new ErrorPublicacion(m); };

// ---------------------------------------------------------------- variables de entorno
export function validarEntorno(env = process.env) {
  const problemas = [];
  const url = String(env.SUPABASE_URL ?? '').trim();
  const clave = String(env.SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  const whats = String(env.WHATSAPP_COMERCIAL ?? '').trim();
  let origen = '';
  if (!url) problemas.push('SUPABASE_URL: falta. Escribe la URL del proyecto, p. ej. https://<referencia>.supabase.co.');
  else {
    try {
      const u = new URL(url);
      const ok = u.protocol === 'https:' && /^[a-z0-9]{20}\.supabase\.co$/.test(u.hostname) && u.hostname === `${PROYECTO_APROBADO}.supabase.co` && (u.pathname === '/' || u.pathname === '') && !u.search && !u.hash && !u.username;
      if (!ok) problemas.push('SUPABASE_URL: no es la URL HTTPS del proyecto aprobado (https://<referencia>.supabase.co, sin ruta).');
      else origen = u.origin;
    } catch { problemas.push('SUPABASE_URL: no es una URL válida.'); }
  }
  if (!clave) problemas.push('SUPABASE_PUBLISHABLE_KEY: falta. Usa la clave publicable (sb_publishable_…) del proyecto.');
  else if (/^sb_secret_/i.test(clave) || /^eyJ/.test(clave)) problemas.push('SUPABASE_PUBLISHABLE_KEY: no es una clave publicable. Una clave secreta o un JWT NUNCA deben ir al navegador: revócala y usa la publicable.');
  else if (!/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(clave)) problemas.push('SUPABASE_PUBLISHABLE_KEY: no tiene el formato sb_publishable_….');
  let numero = '';
  if (!whats) problemas.push('WHATSAPP_COMERCIAL: falta. Escribe el número comercial con prefijo de país, p. ej. 57 y diez dígitos.');
  else {
    let digitos = whats.replace(/[\s().-]/g, '').replace(/^\+/, '');
    if (!/^\d+$/.test(digitos)) problemas.push('WHATSAPP_COMERCIAL: solo admite dígitos (con + inicial, espacios o guiones opcionales).');
    else {
      if (/^3\d{9}$/.test(digitos)) digitos = `57${digitos}`; // móvil colombiano sin prefijo
      if (digitos === NUMERO_PROVISIONAL) problemas.push('WHATSAPP_COMERCIAL: es el número provisional; escribe el número comercial real.');
      else if (!/^\d{10,15}$/.test(digitos) || (digitos.startsWith('57') && !/^573\d{9}$/.test(digitos))) problemas.push('WHATSAPP_COMERCIAL: no es un número válido (para Colombia: 57 + 3 + nueve dígitos).');
      else numero = digitos;
    }
  }
  return { problemas, url: origen, clave, numero };
}

// ---------------------------------------------------------------- utilidades
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function copiar(raiz, salida, relativa) {
  const origen = path.join(raiz, relativa);
  if (!fs.existsSync(origen)) fallar(`Falta el archivo del paquete: ${relativa}`);
  const destino = path.join(salida, relativa);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(origen, destino);
}
function listar(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listar(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name)).split(path.sep).join('/')]));
}

export function construir({ raiz = RAIZ_REPO, salida, env = process.env } = {}) {
  const v = validarEntorno(env);
  if (v.problemas.length) fallar(`No se generó el paquete. Corrige estas variables de entorno:\n  - ${v.problemas.join('\n  - ')}`);
  const destino = path.resolve(salida);
  if (destino === path.resolve(raiz) || path.resolve(raiz).startsWith(destino + path.sep) || destino === path.parse(destino).root) fallar(`Salida no permitida: ${destino}`);
  // Solo se vacía una carpeta que este mismo script creó (lleva su marca) o que no existe/está vacía.
  if (fs.existsSync(destino)) {
    const contenido = fs.readdirSync(destino);
    if (contenido.length && !contenido.includes(MARCA)) fallar(`La salida ${destino} existe, no está vacía y no la creó este script (falta ${MARCA}). No se borra.`);
    fs.rmSync(destino, { recursive: true, force: true });
  }
  fs.mkdirSync(destino, { recursive: true });
  fs.writeFileSync(path.join(destino, MARCA), 'Paquete generado por scripts/preparar-publicacion.mjs. Se puede borrar y regenerar.\n');

  for (const a of ARCHIVOS) copiar(raiz, destino, a);
  for (const c of CARPETAS) {
    const base = path.join(raiz, c);
    if (!fs.existsSync(base)) fallar(`Falta la carpeta del paquete: ${c}`);
    for (const f of listar(base)) copiar(raiz, destino, `${c}/${f}`);
  }

  // Versionado por contenido + reescritura de la referencia.
  const rutaJs = path.join(destino, DONDE_SE_REFERENCIAN);
  let js = fs.readFileSync(rutaJs, 'utf8');
  const versionados = [];
  for (const [origen, plantilla] of VERSIONADOS) {
    const bytes = fs.readFileSync(path.join(raiz, origen));
    const h = sha(bytes).slice(0, 10);
    const nuevo = plantilla.replace('{h}', h);
    // En el JS las rutas de los modelos se componen con RUTA_MODELOS; se reescribe el tramo final.
    const buscado = origen.startsWith('assets/images/models/') ? origen.slice('assets/images/models/'.length) : origen;
    const reemplazo = origen.startsWith('assets/images/models/') ? nuevo.slice('assets/images/models/'.length) : nuevo;
    const apariciones = js.split(`"${buscado}"`).length - 1;
    if (apariciones !== 1) fallar(`La referencia a ${buscado} aparece ${apariciones} veces en ${DONDE_SE_REFERENCIAN} (se esperaba 1): el nombre con hash no se puede aplicar.`);
    js = js.replace(`"${buscado}"`, `"${reemplazo}"`);
    fs.mkdirSync(path.dirname(path.join(destino, nuevo)), { recursive: true });
    fs.writeFileSync(path.join(destino, nuevo), bytes);
    versionados.push({ origen, ruta: nuevo, bytes: bytes.length, hash: h });
  }
  fs.writeFileSync(rutaJs, js);

  // Configuraciones generadas (solo valores ya validados; la clave es la PUBLICABLE).
  const tienda = { supabaseUrl: v.url, clavePublicable: v.clave, whatsapp: v.numero, produccion: true, fuenteLocal: false };
  fs.writeFileSync(path.join(destino, 'config.js'), `/* Generado en la compilación (scripts/preparar-publicacion.mjs). No se versiona. */\nwindow.GAMA_TALLA_CONFIG = ${JSON.stringify(tienda, null, 2)};\n`);
  const panel = { supabaseUrl: v.url, clavePublicable: v.clave };
  fs.writeFileSync(path.join(destino, 'admin', 'config.js'), `/* Generado en la compilación (scripts/preparar-publicacion.mjs). No se versiona. */\nwindow.GAMA_TALLA_ADMIN_CONFIG = ${JSON.stringify(panel, null, 2)};\n`);

  // Encabezados y redirecciones de Netlify.
  const cabeceras = [
    '# Generado por scripts/preparar-publicacion.mjs',
    '/', '  Cache-Control: public, max-age=0, must-revalidate', '/index.html', '  Cache-Control: public, max-age=0, must-revalidate',
    '/config.js', '  Cache-Control: no-store',
    '/admin/config.js', '  Cache-Control: no-store',
    '/admin/*', '  X-Robots-Tag: noindex, nofollow', '  Referrer-Policy: no-referrer',
    ...versionados.flatMap((x) => [`/${x.ruta}`, `  Cache-Control: ${INMUTABLE}`])
  ];
  fs.writeFileSync(path.join(destino, '_headers'), `${cabeceras.join('\n')}\n`);
  fs.writeFileSync(path.join(destino, '_redirects'), '/admin  /admin/  301\n');

  const problemas = verificarPaquete(destino, versionados);
  if (problemas.length) fallar(`El paquete no pasó la verificación:\n  - ${problemas.join('\n  - ')}`);
  // La política de privacidad es un BORRADOR con marcadores [COMPLETAR: …]: se avisa (sin detener la compilación)
  // para que no se publique sin llenar. Con PRIVACIDAD_ESTRICTA=1 la compilación se detiene.
  const pendientes = (fs.readFileSync(path.join(destino, 'privacidad/index.html'), 'utf8').match(/\[COMPLETAR:/g) || []).length;
  if (pendientes && env.PRIVACIDAD_ESTRICTA === '1') fallar(`La política de privacidad tiene ${pendientes} marcadores [COMPLETAR: …] sin llenar (PRIVACIDAD_ESTRICTA=1).`);
  return { destino, versionados, archivos: listar(destino).length, privacidadPendiente: pendientes };
}

// Toda ruta assets/… nombrada por el HTML, el CSS y los JS existe (salvo ejemplos/depuración), y los
// archivos versionados de _headers existen y son los únicos «immutable».
export function verificarPaquete(destino, versionados) {
  const problemas = [];
  const fuentes = ['index.html', 'styles.css', 'app.js', 'assets/js/catalog-intro.js', 'assets/js/catalog-intro-escena.js', 'assets/css/catalog-intro.css', 'admin/index.html', 'admin/admin.js', 'admin/editor.js', 'admin/fotos.js', 'admin/admin.css']
    .filter((f) => fs.existsSync(path.join(destino, f)));
  const vistas = new Set();
  for (const f of fuentes) {
    const texto = fs.readFileSync(path.join(destino, f), 'utf8');
    for (const m of texto.matchAll(/assets\/[A-Za-z0-9_./-]+\.(?:svg|webp|png|jpe?g|glb|js|css|json)/g)) vistas.add(m[0]);
  }
  // Las rutas de modelos se componen en el JS con RUTA_MODELOS: se comprueban aparte.
  const modelos = fs.readFileSync(path.join(destino, 'assets/js/catalog-intro.js'), 'utf8').matchAll(/"((?:optimized\/)?af1-model[A-Za-z0-9.-]*\.glb)"/g);
  for (const m of modelos) vistas.add(`assets/images/models/${m[1]}`);
  for (const ruta of vistas) {
    if (!fs.existsSync(path.join(destino, ruta)) && !AUSENTES_PERMITIDAS.some((r) => r.test(ruta))) problemas.push(`El código nombra ${ruta} y no está en el paquete.`);
  }
  const cabeceras = fs.readFileSync(path.join(destino, '_headers'), 'utf8').split('\n');
  const inmutables = cabeceras.map((l, i) => (cabeceras[i + 1]?.includes('immutable') && l.startsWith('/') ? l.slice(1) : null)).filter(Boolean);
  for (const r of inmutables) if (!fs.existsSync(path.join(destino, r))) problemas.push(`_headers marca como inmutable ${r} y no existe.`);
  const esperados = versionados.map((x) => x.ruta).sort();
  if (JSON.stringify([...inmutables].sort()) !== JSON.stringify(esperados)) problemas.push('Los archivos «immutable» de _headers no coinciden con los versionados.');
  for (const prohibido of ['data/productos.json', 'data/pruebas', 'config.ejemplo.js', 'admin/config.ejemplo.js', 'tests', 'respaldo', 'supabase', '.env', 'scripts', 'node_modules']) {
    if (fs.existsSync(path.join(destino, prohibido))) problemas.push(`El paquete incluye ${prohibido}, que no debe publicarse.`);
  }
  return problemas;
}

// ---------------------------------------------------------------- línea de comandos
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const valor = (n, p) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : p; };
    const raiz = path.resolve(valor('--raiz', RAIZ_REPO));
    const r = construir({ raiz, salida: path.resolve(raiz, valor('--salida', 'dist')) });
    const mb = (b) => `${(b / 1048576).toFixed(2)} MB`;
    console.log(`Paquete listo en ${path.relative(process.cwd(), r.destino) || '.'} (${r.archivos} archivos).`);
    if (r.privacidadPendiente) console.warn(`AVISO: privacidad/index.html tiene ${r.privacidadPendiente} marcadores [COMPLETAR: …] sin llenar. Complétalos antes de publicar.`);
    for (const x of r.versionados) console.log(`  ${x.ruta}  ${x.origen.endsWith('.glb') ? mb(x.bytes) : `${(x.bytes / 1024).toFixed(0)} KB`}`);
  } catch (e) {
    console.error(e instanceof ErrorPublicacion ? e.message : e);
    process.exit(1);
  }
}
