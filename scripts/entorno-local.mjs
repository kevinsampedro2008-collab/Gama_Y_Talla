/* Etapa 18 · Entorno LOCAL para probar a mano el panel y la tienda contra el Supabase local.
 *
 *   node scripts/entorno-local.mjs [--puerto 8770]
 *       Sirve el repositorio en http://127.0.0.1:<puerto>/ y responde «/config.js» (tienda) y
 *       «/admin/config.js» (panel) con la configuración del Supabase LOCAL, generada al vuelo.
 *       Tus config.js reales (que pueden apuntar al proyecto remoto) NO se leen, no se sirven y no
 *       se modifican. Cada página muestra abajo a la izquierda la etiqueta «LOCAL · 127.0.0.1:54321»
 *       y el título de la pestaña empieza por «[LOCAL]».
 *
 *   node scripts/entorno-local.mjs --crear-admin <correo terminado en .test>
 *       Crea (o actualiza) un administrador FICTICIO en el Supabase local. La contraseña se toma de
 *       la variable GT_CLAVE_LOCAL (12 caracteres o más) y nunca se imprime.
 *
 *   node scripts/entorno-local.mjs --fotos <carpeta fuera del repositorio>
 *       Genera tres fotos FICTICIAS (JPG y WebP con el texto «G&T PRUEBA») para adjuntarlas.
 *
 *   node scripts/entorno-local.mjs --limpiar
 *       Borra del Supabase local lo que crearon los administradores ficticios de este script
 *       (zapatillas, colores, tallas, filas de fotos y sus archivos en Storage) y esos usuarios.
 *       No toca nada creado por otros usuarios ni por las pruebas automáticas.
 *
 * Antes de servir o escribir, SIEMPRE comprueba el destino: la API debe estar en 127.0.0.1 o
 * localhost, responder, tener la migración 20261117010000 (variantes.forma_muestra) y estar
 * permitida por la CSP del panel. Si algo no cuadra, se detiene sin escribir nada. No imprime
 * claves, contraseñas ni tokens.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUCKET = 'fotos-catalogo';
const NOMBRE_ADMIN = 'Administración ficticia · prueba manual';
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.ico': 'image/x-icon'
};
// Nunca se sirve: secretos, pruebas, respaldos, herramientas ni las configuraciones reales.
const PROHIBIDO = /^\/(\.git|\.claude|node_modules|supabase|scripts|tests|respaldo|references|test-results|playwright-report|dist|\.env)(\/|$)|^\/(package(-lock)?\.json|README\.md|CLAUDE\.md|skills-lock\.json|playwright\.config\.js)$|(^|\/)\.env/;

// Se lanza y se informa al final con process.exitCode: en Windows, process.exit() justo después de un
// fetch puede abortar Node con una aserción de libuv.
class Rechazo extends Error {}
function fallar(mensaje) { throw new Rechazo(mensaje); }
function informarFallo(error) {
  console.error(error instanceof Rechazo ? error.message : `Error: ${String(error?.message || error)}`);
  process.exitCode = 1;
}

function argumentos(lista) {
  const salida = {};
  for (let i = 0; i < lista.length; i += 1) {
    const a = lista[i];
    if (!a.startsWith('--')) fallar(`Argumento inesperado: ${a}`);
    const clave = a.slice(2);
    if (!['puerto', 'crear-admin', 'fotos', 'limpiar'].includes(clave)) fallar(`Opción desconocida: ${a}`);
    if (clave === 'limpiar') { salida.limpiar = true; continue; }
    const valor = lista[i + 1];
    if (!valor || valor.startsWith('--')) fallar(`Falta el valor de ${a}.`);
    salida[clave] = valor;
    i += 1;
  }
  return salida;
}

// ------------------------------------------------------------------ destino
function supabaseLocal() {
  const r = spawnSync('npx --yes supabase@3.0.0 status -o json', { cwd: RAIZ, shell: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const texto = String(r.stdout || '');
  let datos;
  try { datos = JSON.parse(texto.slice(texto.indexOf('{'))); } catch { datos = null; }
  if (r.status !== 0 || !datos?.API_URL) fallar('El Supabase local no está en marcha. Arranca Docker Desktop y ejecuta: npx --yes supabase@3.0.0 start');
  const api = new URL(datos.API_URL);
  if (!['127.0.0.1', 'localhost'].includes(api.hostname) || api.protocol !== 'http:') {
    fallar(`RECHAZADO: la API de «supabase status» no es local (${api.hostname}). No se sirve ni se escribe nada.`);
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(datos.PUBLISHABLE_KEY || '')) fallar('RECHAZADO: «supabase status» no dio una clave publicable local.');
  return { api: api.origin, publicable: datos.PUBLISHABLE_KEY, servicio: datos.SERVICE_ROLE_KEY };
}

async function comprobarDestino(e) {
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(fs.readFileSync(path.join(RAIZ, 'admin', 'index.html'), 'utf8'))?.[1] || '';
  if (!csp.includes(e.api)) fallar(`RECHAZADO: la CSP del panel no permite ${e.api}; el panel no podría conectarse.`);
  let r;
  try {
    r = await fetch(`${e.api}/rest/v1/variantes?select=forma_muestra&limit=0`, { headers: { apikey: e.publicable }, redirect: 'error' });
  } catch {
    fallar(`El Supabase local no responde en ${e.api}.`);
  }
  if (r.status === 400 || r.status === 404) fallar('Al Supabase local le falta la migración 20261117010000_forma_muestra_color. Aplícala con: npx --yes supabase@3.0.0 migration up');
  if (!r.ok) fallar(`El Supabase local respondió ${r.status} al comprobar el esquema.`);
  const productos = await servicio(e, 'GET', '/rest/v1/productos?select=id');
  return { productos: productos.length };
}

async function servicio(e, metodo, ruta, cuerpo, prefer) {
  const r = await fetch(e.api + ruta, {
    method: metodo, redirect: 'error',
    headers: { apikey: e.servicio, Authorization: `Bearer ${e.servicio}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  });
  const texto = await r.text();
  let datos = null;
  try { datos = JSON.parse(texto); } catch { datos = texto; }
  if (!r.ok) throw new Error(`${metodo} ${ruta.split('?')[0]} → ${r.status} ${String(datos?.message || datos?.msg || '').slice(0, 120)}`);
  return datos;
}

// ------------------------------------------------------------------ configuración servida
function configuracion(e, variable) {
  const etiqueta = `LOCAL · ${new URL(e.api).host}`;
  return `/* Generado por scripts/entorno-local.mjs: Supabase LOCAL, datos ficticios. No es tu config.js. */
window.${variable} = ${JSON.stringify({ supabaseUrl: e.api, clavePublicable: e.publicable })};
(() => {
  const etiqueta = ${JSON.stringify(etiqueta)};
  if (!document.title.startsWith("[LOCAL]")) document.title = "[LOCAL] " + document.title;
  const poner = () => {
    if (document.getElementById("gt-entorno-local")) return;
    const e = document.createElement("div");
    e.id = "gt-entorno-local";
    e.setAttribute("role", "note");
    e.setAttribute("aria-label", "Entorno local con datos ficticios");
    e.textContent = etiqueta;
    Object.assign(e.style, { position: "fixed", left: "6px", bottom: "6px", zIndex: "2147483647", pointerEvents: "none",
      background: "#8a2b00", color: "#fff", font: "700 11px/1.5 system-ui, sans-serif", padding: "2px 8px", borderRadius: "999px", opacity: "0.92" });
    document.body.append(e);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", poner); else poner();
})();
`;
}

function servir(e, puerto) {
  const configTienda = configuracion(e, 'GAMA_TALLA_CONFIG');
  const configPanel = configuracion(e, 'GAMA_TALLA_ADMIN_CONFIG');
  const servidor = http.createServer((peticion, respuesta) => {
    const fallo = (codigo) => { respuesta.writeHead(codigo, { 'Content-Type': 'text/plain; charset=utf-8' }); respuesta.end(String(codigo)); };
    if (peticion.method !== 'GET' && peticion.method !== 'HEAD') return fallo(405);
    let ruta;
    try { ruta = decodeURIComponent(new URL(peticion.url, 'http://x').pathname); } catch { return fallo(400); }
    const js = (cuerpo) => { respuesta.writeHead(200, { 'Content-Type': TIPOS['.js'], 'Cache-Control': 'no-store' }); respuesta.end(peticion.method === 'HEAD' ? undefined : cuerpo); };
    if (ruta === '/config.js') return js(configTienda);
    if (ruta === '/admin/config.js') return js(configPanel);
    if (PROHIBIDO.test(ruta) || /(^|\/)config\.js$/.test(ruta)) return fallo(404);
    let archivo = path.join(RAIZ, ruta);
    if (!archivo.startsWith(RAIZ)) return fallo(403);
    if (ruta.endsWith('/')) archivo = path.join(archivo, 'index.html');
    fs.stat(archivo, (error, info) => {
      if (!error && info.isDirectory()) { respuesta.writeHead(301, { Location: `${ruta}/` }); return respuesta.end(); }
      if (error || !info.isFile()) return fallo(404);
      const ext = path.extname(archivo).toLowerCase();
      respuesta.writeHead(200, { 'Content-Type': TIPOS[ext] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store' });
      if (peticion.method === 'HEAD') return respuesta.end();
      fs.createReadStream(archivo).pipe(respuesta);
    });
  });
  servidor.on('error', (error) => informarFallo(error.code === 'EADDRINUSE' ? new Rechazo(`El puerto ${puerto} está ocupado. Usa --puerto <otro>.`) : error));
  servidor.listen(puerto, '127.0.0.1', async () => {
    // Se comprueba lo que de verdad reciben la tienda y el panel.
    const base = `http://127.0.0.1:${puerto}`;
    for (const [ruta, variable] of [['/config.js', 'GAMA_TALLA_CONFIG'], ['/admin/config.js', 'GAMA_TALLA_ADMIN_CONFIG']]) {
      const texto = await (await fetch(base + ruta)).text();
      if (!texto.includes(`window.${variable} = {"supabaseUrl":"${e.api}"`)) { servidor.close(); informarFallo(new Rechazo(`RECHAZADO: ${ruta} no entrega el Supabase local.`)); return; }
    }
    console.log(`Tienda:  ${base}/?intro=no`);
    console.log(`Panel:   ${base}/admin/`);
    console.log(`Ambos reciben el Supabase LOCAL ${e.api} (etiqueta «LOCAL · ${new URL(e.api).host}» abajo a la izquierda y «[LOCAL]» en el título).`);
    console.log('Tus config.js reales no se leen ni se sirven. Ctrl+C para detener.');
  });
}

// ------------------------------------------------------------------ administrador ficticio
async function crearAdmin(e, correo) {
  if (!/^[^@\s]+@[^@\s]+\.test$/i.test(correo)) fallar('El correo del administrador ficticio debe terminar en «.test» (p. ej. prueba@gamaytalla.test).');
  const clave = process.env.GT_CLAVE_LOCAL || '';
  if (clave.length < 12) fallar('Define la contraseña en la variable GT_CLAVE_LOCAL (12 caracteres o más). No se imprime ni se guarda en archivos.');
  const usuarios = (await servicio(e, 'GET', '/auth/v1/admin/users?per_page=1000')).users || [];
  let usuario = usuarios.find((u) => String(u.email).toLowerCase() === correo.toLowerCase());
  if (usuario) await servicio(e, 'PUT', `/auth/v1/admin/users/${usuario.id}`, { password: clave, email_confirm: true });
  else usuario = await servicio(e, 'POST', '/auth/v1/admin/users', { email: correo, password: clave, email_confirm: true });
  await servicio(e, 'POST', '/rest/v1/administradores?on_conflict=user_id', { user_id: usuario.id, nombre: NOMBRE_ADMIN }, 'resolution=merge-duplicates');
  console.log(`Administrador ficticio listo en el Supabase local: ${correo} (contraseña: la de GT_CLAVE_LOCAL).`);
}

// ------------------------------------------------------------------ fotos ficticias
async function generarFotos(carpeta) {
  const destino = path.resolve(carpeta);
  const relativa = path.relative(RAIZ, destino);
  if (!relativa.startsWith('..') && !path.isAbsolute(relativa)) fallar('La carpeta de fotos debe estar fuera del repositorio.');
  fs.mkdirSync(destino, { recursive: true });
  const { chromium } = await import('@playwright/test');
  const navegador = await chromium.launch();
  try {
    const pagina = await navegador.newPage();
    const fotos = [['prueba-1-negra.jpg', 'image/jpeg', 1600, 1200, 210], ['prueba-2-lado.webp', 'image/webp', 1200, 900, 30], ['prueba-3-suela.jpg', 'image/jpeg', 1200, 1200, 120]];
    for (const [nombre, tipo, ancho, alto, tono] of fotos) {
      const bytes = await pagina.evaluate(async ([w, h, t, c, n]) => {
        const lienzo = document.createElement('canvas');
        lienzo.width = w; lienzo.height = h;
        const x = lienzo.getContext('2d');
        const g = x.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, `hsl(${c} 65% 55%)`); g.addColorStop(1, `hsl(${(c + 150) % 360} 55% 30%)`);
        x.fillStyle = g; x.fillRect(0, 0, w, h);
        x.fillStyle = '#fff'; x.font = `bold ${Math.round(h / 9)}px sans-serif`;
        x.fillText('G&T PRUEBA', w * 0.08, h * 0.5); x.fillText(n, w * 0.08, h * 0.66);
        const blob = await new Promise((r) => lienzo.toBlob(r, t, 0.85));
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
      }, [ancho, alto, tipo, tono, nombre.split('-')[1]]);
      fs.writeFileSync(path.join(destino, nombre), Buffer.from(bytes));
    }
    console.log(`Tres fotos ficticias en ${destino}`);
  } finally {
    await navegador.close();
  }
}

// ------------------------------------------------------------------ limpieza
async function limpiar(e) {
  const admins = await servicio(e, 'GET', `/rest/v1/administradores?select=user_id&nombre=eq.${encodeURIComponent(NOMBRE_ADMIN)}`);
  const ids = admins.map((a) => a.user_id);
  let productos = [];
  if (ids.length) {
    const creados = await servicio(e, 'GET', `/rest/v1/historial?select=fila_id&tabla=eq.productos&operacion=eq.INSERT&autor=in.(${ids.join(',')})`);
    const unicos = [...new Set(creados.map((h) => h.fila_id))];
    if (unicos.length) productos = await servicio(e, 'GET', `/rest/v1/productos?select=id,variantes(id)&id=in.(${unicos.join(',')})`);
  }
  let archivos = 0;
  for (const p of productos) {
    const carpetas = await servicio(e, 'POST', `/storage/v1/object/list/${BUCKET}`, { prefix: `productos/${p.id}/`, limit: 100 });
    const nombres = [];
    for (const c of carpetas) {
      const lista = await servicio(e, 'POST', `/storage/v1/object/list/${BUCKET}`, { prefix: `productos/${p.id}/${c.name}/`, limit: 1000 });
      for (const a of lista) if (a.id) nombres.push(`productos/${p.id}/${c.name}/${a.name}`);
    }
    if (nombres.length) { await servicio(e, 'DELETE', `/storage/v1/object/${BUCKET}`, { prefixes: nombres }); archivos += nombres.length; }
  }
  const variantes = productos.flatMap((p) => p.variantes.map((v) => v.id));
  if (variantes.length) {
    const lista = variantes.join(',');
    await servicio(e, 'DELETE', `/rest/v1/tallas?variante_id=in.(${lista})`);
    await servicio(e, 'DELETE', `/rest/v1/fotos?variante_id=in.(${lista})`);
    await servicio(e, 'DELETE', `/rest/v1/variantes?id=in.(${lista})`);
  }
  if (productos.length) await servicio(e, 'DELETE', `/rest/v1/productos?id=in.(${productos.map((p) => p.id).join(',')})`);
  for (const id of ids) {
    await servicio(e, 'DELETE', `/rest/v1/administradores?user_id=eq.${id}`);
    await servicio(e, 'DELETE', `/auth/v1/admin/users/${id}`).catch(() => null);
  }
  console.log(`Supabase local: retiradas ${productos.length} zapatillas (${variantes.length} colores, ${archivos} archivos de Storage) y ${ids.length} administradores ficticios de la prueba manual.`);
}

// ------------------------------------------------------------------ principal
try {
  const args = argumentos(process.argv.slice(2));
  const puerto = Number(args.puerto || 8770);
  if (!Number.isInteger(puerto) || puerto < 1024 || puerto > 65535) fallar('Puerto no válido.');
  const entorno = supabaseLocal();
  const estado = await comprobarDestino(entorno);
  console.log(`Destino comprobado: Supabase LOCAL ${entorno.api} · migración 20261117010000 aplicada · ${estado.productos} zapatillas en la base local.`);
  if (args.limpiar) await limpiar(entorno);
  else if (args['crear-admin']) await crearAdmin(entorno, args['crear-admin']);
  else if (args.fotos) await generarFotos(args.fotos);
  else servir(entorno, puerto);
} catch (error) {
  informarFallo(error);
}
