// @ts-check
/* Etapa 17.5 · Paquete de publicación (Netlify). Ejecuta el MISMO comando que usará Netlify
 * (node scripts/preparar-publicacion.mjs) con variables FICTICIAS, sirve «dist» desde una carpeta
 * temporal y prueba la tienda, el panel y la presentación sobre ese paquete. Supabase se simula
 * interceptando las peticiones al proyecto aprobado: no hay red real ni datos remotos. WhatsApp no
 * se abre (window.open queda registrado).
 *
 *   npx playwright test tests/etapa17/publicacion.spec.js --workers=1
 */
import { test, expect } from '@playwright/test';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { CELULAR, ESCRITORIO } from '../etapa9/ayudas.js';
import { CATALOGO_MIGRADO, clonar } from '../etapa14/ayudas-etapa14.js';

const RAIZ = process.cwd(); // las pruebas se ejecutan desde la raíz del proyecto
const SCRIPT = path.join(RAIZ, 'scripts', 'preparar-publicacion.mjs');
const PROYECTO = 'https://mwhiusocfdwzxnzenfsz.supabase.co';
const CLAVE = 'sb_publishable_FICTICIA_publicacion_17_5';
const NUMERO = '573001234567';
const ENTORNO = { SUPABASE_URL: PROYECTO, SUPABASE_PUBLISHABLE_KEY: CLAVE, WHATSAPP_COMERCIAL: '+57 300 123 4567' };
const CAPTURAS = process.env.GT_CAPTURAS_17_5 || path.join(os.tmpdir(), 'gama-talla-17-5-capturas');
fs.mkdirSync(CAPTURAS, { recursive: true });

function construir(salida, env = ENTORNO, raiz = RAIZ) {
  const limpio = { ...process.env, SUPABASE_URL: '', SUPABASE_PUBLISHABLE_KEY: '', WHATSAPP_COMERCIAL: '', ...env };
  return spawnSync(process.execPath, [path.join(raiz, 'scripts', 'preparar-publicacion.mjs'), '--salida', salida], { cwd: raiz, env: limpio, encoding: 'utf8' });
}

let temporal; let dist; let servidor; let base;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };

test.beforeAll(async () => {
  temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-publicacion-'));
  dist = path.join(temporal, 'dist');
  const r = construir(dist);
  expect(r.status, r.stderr).toBe(0);
  // Servidor estático mínimo (con la redirección /admin → /admin/ de _redirects).
  servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/admin') { res.writeHead(301, { Location: '/admin/' }); return res.end(); }
    let ruta = decodeURIComponent(url.pathname);
    if (ruta.endsWith('/')) ruta += 'index.html';
    const archivo = path.join(dist, ruta);
    if (!archivo.startsWith(dist) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); return res.end('no existe'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
    fs.createReadStream(archivo).pipe(res);
  });
  await new Promise((f) => servidor.listen(0, '127.0.0.1', f));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
test.afterAll(async () => {
  await new Promise((f) => servidor?.close(f));
  if (temporal) fs.rmSync(temporal, { recursive: true, force: true });
});

// ------------------------------------------------------------------ el comando de compilación
test.describe('Comando de compilación', () => {
  const casos = [
    ['falta SUPABASE_URL', { SUPABASE_URL: '' }, 'SUPABASE_URL'],
    ['falta la clave', { SUPABASE_PUBLISHABLE_KEY: '' }, 'SUPABASE_PUBLISHABLE_KEY'],
    ['falta el número', { WHATSAPP_COMERCIAL: '' }, 'WHATSAPP_COMERCIAL'],
    ['clave secreta ficticia', { SUPABASE_PUBLISHABLE_KEY: `${'sb_'}${'secret_'}FICTICIA_nunca_al_navegador_123` }, 'SUPABASE_PUBLISHABLE_KEY'],
    ['JWT en lugar de la publicable', { SUPABASE_PUBLISHABLE_KEY: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.firma_ficticia' }, 'SUPABASE_PUBLISHABLE_KEY'],
    ['URL de otro proyecto', { SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' }, 'SUPABASE_URL'],
    ['URL sin HTTPS', { SUPABASE_URL: 'http://mwhiusocfdwzxnzenfsz.supabase.co' }, 'SUPABASE_URL'],
    ['número provisional', { WHATSAPP_COMERCIAL: '573000000000' }, 'WHATSAPP_COMERCIAL'],
    ['número con letras', { WHATSAPP_COMERCIAL: '57 300 ABC 4567' }, 'WHATSAPP_COMERCIAL']
  ];
  for (const [nombre, cambio, variable] of casos) {
    test(`rechaza: ${nombre}, nombra la variable y no imprime su valor`, () => {
      const salida = path.join(temporal, `rechazo-${variable}-${nombre.length}`);
      const r = construir(salida, { ...ENTORNO, ...cambio });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(variable);
      for (const valor of Object.values(cambio).filter((v) => v.length > 8)) expect(r.stdout + r.stderr, 'no imprime el valor').not.toContain(valor);
      expect(fs.existsSync(salida), 'no escribe nada').toBe(false);
    });
  }
  test('no borra una carpeta ajena que no creó el script', () => {
    const ajena = path.join(temporal, 'ajena');
    fs.mkdirSync(ajena); fs.writeFileSync(path.join(ajena, 'importante.txt'), 'x');
    const r = construir(ajena);
    expect(r.status).toBe(1);
    expect(fs.existsSync(path.join(ajena, 'importante.txt'))).toBe(true);
  });
});

// ------------------------------------------------------------------ contenido del paquete
test.describe('Contenido de dist', () => {
  test('lista explícita: sin ejemplos, pruebas, respaldos, migraciones ni configuraciones locales', () => {
    const todos = fs.readdirSync(dist, { recursive: true }).map(String).map((f) => f.split(path.sep).join('/'));
    for (const prohibido of ['data/productos.json', 'data/pruebas', 'tests', 'respaldo', 'supabase', 'scripts', 'node_modules', 'config.ejemplo.js', 'admin/config.ejemplo.js', 'admin/LEEME.md', 'README.md', 'package.json', '.env']) {
      expect(todos.some((f) => f === prohibido || f.startsWith(`${prohibido}/`)), prohibido).toBe(false);
    }
    expect(todos.some((f) => /\.env/.test(f))).toBe(false);
    for (const necesario of ['index.html', 'config.js', 'admin/index.html', 'admin/config.js', 'admin/vendor/supabase-js-2.118.0/supabase.js', 'data/guias-tallas.json', '_headers', '_redirects',
      'assets/vendor/three-0.165.0/build/three.module.min.js', 'assets/images/pagos/nequi-icono.png']) expect(todos, necesario).toContain(necesario);
    // Las fotos de ejemplo se limitan a las tres de la portada.
    expect(todos.filter((f) => /^assets\/images\/productos\/.+\.webp$/.test(f))).toHaveLength(3);
    expect(todos.some((f) => /af1-model\.glb$/.test(f)), 'el modelo original de 19 MB no se publica').toBe(false);
  });

  test('config.js y admin/config.js tienen los objetos que usan la tienda y el panel', () => {
    const tienda = fs.readFileSync(path.join(dist, 'config.js'), 'utf8');
    const panel = fs.readFileSync(path.join(dist, 'admin/config.js'), 'utf8');
    const evaluar = (texto, nombre) => { const w = {}; new Function('window', texto)(w); return w[nombre]; };
    expect(evaluar(tienda, 'GAMA_TALLA_CONFIG')).toEqual({ supabaseUrl: PROYECTO, clavePublicable: CLAVE, whatsapp: NUMERO, produccion: true, fuenteLocal: false });
    expect(evaluar(panel, 'GAMA_TALLA_ADMIN_CONFIG')).toEqual({ supabaseUrl: PROYECTO, clavePublicable: CLAVE });
    expect(tienda + panel).not.toMatch(/sb_secret_|service_role|eyJ/);
  });

  test('_headers: inmutable solo en los archivos versionados; HTML revalida; config.js no-store', () => {
    const lineas = fs.readFileSync(path.join(dist, '_headers'), 'utf8').split('\n');
    const bloques = {};
    let actual = null;
    for (const l of lineas) { if (l.startsWith('/')) { actual = l; bloques[actual] = []; } else if (actual && l.trim()) bloques[actual].push(l.trim()); }
    const inmutables = Object.entries(bloques).filter(([, v]) => v.some((x) => x.includes('immutable'))).map(([k]) => k);
    expect(inmutables).toHaveLength(5);
    for (const ruta of inmutables) {
      expect(ruta).toMatch(/^\/assets\/images\/(models\/optimized\/af1-model-(high|medium|low)|intro\/poster-(amplio|compacto))\.[0-9a-f]{10}\.(glb|webp)$/);
      expect(fs.existsSync(path.join(dist, ruta)), ruta).toBe(true);
      expect(bloques[ruta]).toEqual(['Cache-Control: public, max-age=31536000, immutable']);
    }
    expect(bloques['/']).toEqual(['Cache-Control: public, max-age=0, must-revalidate']);
    expect(bloques['/index.html']).toEqual(['Cache-Control: public, max-age=0, must-revalidate']);
    expect(bloques['/config.js']).toEqual(['Cache-Control: no-store']);
    expect(bloques['/admin/config.js']).toEqual(['Cache-Control: no-store']);
    expect(fs.readFileSync(path.join(dist, '_redirects'), 'utf8')).toContain('/admin  /admin/  301');
    // Los originales sin hash no están en el paquete.
    for (const sinHash of ['assets/images/models/optimized/af1-model-high.glb', 'assets/images/intro/poster-amplio.webp']) expect(fs.existsSync(path.join(dist, sinHash))).toBe(false);
  });

  test('las referencias de catalog-intro.js apuntan a los archivos versionados y existen', () => {
    const js = fs.readFileSync(path.join(dist, 'assets/js/catalog-intro.js'), 'utf8');
    const rutas = [...js.matchAll(/"((?:assets\/images\/intro\/poster-[a-z]+|optimized\/af1-model-[a-z]+)\.[0-9a-f]{10}\.(?:webp|glb))"/g)].map((m) => m[1]);
    expect(rutas).toHaveLength(5);
    for (const r of rutas) expect(fs.existsSync(path.join(dist, r.startsWith('optimized/') ? `assets/images/models/${r}` : r)), r).toBe(true);
  });

  test('cambiar un recurso cambia su URL; con los mismos bytes la URL se conserva', () => {
    const copia = path.join(temporal, 'copia-fuente');
    for (const d of ['assets', 'admin', 'data']) fs.cpSync(path.join(RAIZ, d), path.join(copia, d), { recursive: true, filter: (o) => !/af1-model\.glb$/.test(o) && !(/editadas[\\/]zapatilla_\d+\.webp$/.test(o) && !/zapatilla_(48|24|11)\.webp$/.test(o)) });
    for (const f of ['index.html', 'styles.css', 'app.js', 'favicon.svg']) fs.cpSync(path.join(RAIZ, f), path.join(copia, f));
    fs.mkdirSync(path.join(copia, 'scripts')); fs.cpSync(SCRIPT, path.join(copia, 'scripts', 'preparar-publicacion.mjs'));
    const nombres = (d) => fs.readdirSync(path.join(d, 'assets/images'), { recursive: true }).map(String).filter((f) => /\.[0-9a-f]{10}\.(glb|webp)$/.test(f)).map((f) => f.split(path.sep).join('/')).sort();
    expect(construir(path.join(temporal, 'a'), ENTORNO, copia).status).toBe(0);
    expect(construir(path.join(temporal, 'b'), ENTORNO, copia).status).toBe(0);
    expect(nombres(path.join(temporal, 'b')), 'mismos bytes, mismas URLs').toEqual(nombres(path.join(temporal, 'a')));
    fs.appendFileSync(path.join(copia, 'assets/images/intro/poster-compacto.webp'), Buffer.from([0]));
    expect(construir(path.join(temporal, 'c'), ENTORNO, copia).status).toBe(0);
    const antes = nombres(path.join(temporal, 'a')); const despues = nombres(path.join(temporal, 'c'));
    const cambiados = despues.filter((n) => !antes.includes(n));
    expect(cambiados).toHaveLength(1);
    expect(cambiados[0]).toMatch(/poster-compacto\.[0-9a-f]{10}\.webp$/);
    expect(despues.filter((n) => antes.includes(n))).toHaveLength(4);
    expect(fs.readFileSync(path.join(temporal, 'c/assets/js/catalog-intro.js'), 'utf8')).toContain(cambiados[0].replace('assets/images/', 'assets/images/'));
  });

  test('peso de los modelos optimizados', () => {
    const pesos = Object.fromEntries(['high', 'medium', 'low'].map((n) => { const f = fs.readdirSync(path.join(dist, 'assets/images/models/optimized')).find((x) => x.startsWith(`af1-model-${n}.`)); return [n, fs.statSync(path.join(dist, 'assets/images/models/optimized', f)).size]; }));
    console.log(`Modelos optimizados: alto ${(pesos.high / 1048576).toFixed(2)} MB · medio ${(pesos.medium / 1048576).toFixed(2)} MB · bajo ${(pesos.low / 1048576).toFixed(2)} MB`);
    expect(pesos.high).toBeLessThan(2 * 1048576);
    expect(pesos.low).toBeLessThan(pesos.medium);
    expect(pesos.medium).toBeLessThan(pesos.high);
  });
});

// ------------------------------------------------------------------ navegador sobre dist
const FOTO = fs.readFileSync(path.join(RAIZ, 'assets/images/intro/poster-compacto.webp'));
function catalogo() {
  const ps = clonar(CATALOGO_MIGRADO.slice(0, 3));
  ps.forEach((p, i) => {
    const v = p.variantes[0];
    for (const f of v.tallas) {
      const disp = ['40', '41'].includes(f.talla);
      f.estado = disp ? 'DISPONIBLE' : 'POR_REVISAR';
      f.vigenciaDesde = disp ? new Date(Date.now() - 36e5).toISOString() : null;
      f.venceEn = disp ? new Date(Date.now() + 36e5).toISOString() : null;
    }
    v.tallasDisponibles = ['40', '41']; v.tallasPorRevisar = v.tallas.filter((t) => !['40', '41'].includes(t.talla)).map((t) => t.talla); v.tallasAgotadas = [];
    v.imagenes = [`${PROYECTO}/storage/v1/object/public/fotos-catalogo/productos/p${i}/c/foto-${i}.webp`];
    p.marca = ['ADIDAS', 'LACOSTE', 'NIKE'][i];
  });
  return ps;
}
const CATALOGO = catalogo();

async function abrir(browser, vista, ruta = '/?intro=no') {
  const contexto = await browser.newContext({ viewport: { width: vista.ancho, height: vista.alto }, hasTouch: vista.tactil, isMobile: vista.tactil && browser.browserType().name() !== 'firefox', deviceScaleFactor: 1, locale: 'es-CO', reducedMotion: 'reduce' });
  const pagina = await contexto.newPage();
  const peticiones = []; const problemas = [];
  pagina.on('request', (r) => peticiones.push(r.url()));
  pagina.on('pageerror', (e) => problemas.push(`EXCEPCIÓN: ${e.message}`));
  pagina.on('console', (m) => { if (m.type() === 'error') problemas.push(`CONSOLA: ${m.text()}`); });
  pagina.on('response', (r) => { if (r.url().startsWith(base) && r.status() >= 400) problemas.push(`HTTP ${r.status()} ${r.url()}`); });
  await contexto.route(`${PROYECTO}/rest/v1/catalogo_publico**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATALOGO) }));
  await contexto.route(`${PROYECTO}/storage/v1/object/public/**`, (r) => r.fulfill({ status: 200, contentType: 'image/webp', body: FOTO }));
  await pagina.addInitScript(() => { window.__abiertas = []; window.open = (e) => { window.__abiertas.push(String(e)); return {}; }; });
  await pagina.goto(`${base}${ruta}`);
  return { contexto, pagina, peticiones, problemas };
}

for (const vista of [CELULAR, ESCRITORIO]) {
  test.describe(`dist en ${vista.ancho}px`, () => {
    test('portada, catálogo desde catalogo_publico, fotos, filtros, ficha, carrito, datos de envío y WhatsApp', async ({ browser, browserName }) => {
      const { contexto, pagina, peticiones, problemas } = await abrir(browser, vista);
      try {
        await expect(pagina.locator('#grilla-productos article.tarjeta')).toHaveCount(3);
        expect(peticiones.some((u) => u.startsWith(`${PROYECTO}/rest/v1/catalogo_publico`))).toBe(true);
        expect(peticiones.some((u) => /data\/productos\.json|data\/pruebas/.test(u)), 'sin ejemplos').toBe(false);
        await expect(pagina.locator('.portada-descripcion')).toContainText('Modelos de Adidas, Lacoste y Nike.');
        await expect.poll(() => pagina.locator('#grilla-productos article.tarjeta img').evaluateAll((i) => i.every((x) => x.complete && x.naturalWidth > 0))).toBe(true);
        await pagina.screenshot({ path: path.join(CAPTURAS, `dist-portada-${browserName}-${vista.ancho}.png`) });
        // Filtro por marca (valor guardado, texto con inicial).
        await pagina.evaluate(() => { estado.marca = 'LACOSTE'; renderizarCatalogo(); });
        await expect(pagina.locator('#grilla-productos article.tarjeta')).toHaveCount(1);
        await pagina.evaluate(() => { estado.marca = 'Todos'; renderizarCatalogo(); });
        // Ficha → carrito → datos de envío → WhatsApp.
        await pagina.locator('#grilla-productos article.tarjeta').first().getByRole('button', { name: /^Ver detalles/ }).click();
        const ficha = pagina.locator('#modal-producto');
        await ficha.locator('.talla[data-talla="40"]').click();
        await pagina.evaluate(() => agregarDesdeDetalle());
        await expect(pagina.locator('#confirmacion-carrito')).toHaveJSProperty('open', true);
        await pagina.locator('#confirmacion-carrito').getByRole('button', { name: /Ver carrito/ }).click();
        await expect(pagina.locator('#carrito .linea')).toHaveCount(1);
        await pagina.locator('#carrito-datos').click();
        for (const [c, v] of Object.entries({ nombre: 'Camila Rodríguez', telefono: '300 123 4567', ciudad: 'Barranquilla', direccion: 'Calle 84 # 51B-20, apto 302', nota: '' })) await pagina.locator(`#envio-${c}`).fill(v);
        await pagina.locator('#envio-guardar').click();
        await expect(pagina.locator('#datos-envio')).toHaveJSProperty('open', false);
        await pagina.mouse.move(1, 1);
        await expect.poll(() => pagina.locator('#carrito-enviar').getAttribute('aria-disabled')).toBe('false');
        await pagina.screenshot({ path: path.join(CAPTURAS, `dist-carrito-${browserName}-${vista.ancho}.png`) });
        await pagina.locator('#carrito-enviar').click();
        const enlace = await pagina.evaluate(() => window.__abiertas.at(-1));
        const url = new URL(enlace);
        expect(`${url.origin}${url.pathname}`).toBe('https://api.whatsapp.com/send');
        expect(url.searchParams.get('phone'), 'el destino es el número comercial de la compilación').toBe(NUMERO);
        const texto = url.searchParams.get('text');
        expect(texto).toContain('*GAMA & TALLA — NUEVO PEDIDO*');
        expect(texto, 'tus dos retoques: separador de 16 y encabezado en negrita').toMatch(/\n─{16}\n\*Mis datos:\*\n/);
        expect(texto).not.toMatch(/─{17}/);
        expect(texto).toContain('Dirección: Calle 84 # 51B-20, apto 302');
        expect(problemas, 'sin errores de consola, de red ni 4xx del sitio').toEqual([]);
      } finally { await contexto.close(); }
    });

    test('«?datos-prueba» no activa los ejemplos en producción', async ({ browser }) => {
      const { contexto, pagina, peticiones, problemas } = await abrir(browser, vista, '/?datos-prueba&intro=no');
      try {
        await expect(pagina.locator('#grilla-productos article.tarjeta')).toHaveCount(3);
        expect(await pagina.evaluate(() => estado.productos.map((p) => p.prueba))).toEqual([false, false, false]);
        await expect(pagina.locator('.sello-prueba, .aviso-prueba')).toHaveCount(0);
        expect(peticiones.some((u) => /data\/pruebas|productos-prueba|data\/productos\.json/.test(u))).toBe(false);
        expect(peticiones.some((u) => u.startsWith(`${PROYECTO}/rest/v1/catalogo_publico`))).toBe(true);
        expect(problemas).toEqual([]);
      } finally { await contexto.close(); }
    });
  });
}

test('/admin y /admin/ cargan sus recursos, muestran el acceso y respetan CSP y noindex', async ({ browser, browserName }) => {
  for (const ruta of ['/admin/', '/admin']) {
    const { contexto, pagina, problemas } = await abrir(browser, ESCRITORIO, ruta);
    try {
      expect(new URL(pagina.url()).pathname).toBe('/admin/');
      await expect(pagina.getByRole('heading', { name: 'Panel de la tienda' })).toBeVisible();
      await expect(pagina.getByLabel('Correo')).toBeVisible();
      await expect(pagina.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
      await expect(pagina.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /script-src 'self'/);
      expect(await pagina.evaluate(() => Boolean(window.supabase?.createClient && window.GAMA_TALLA_ADMIN_CONFIG?.clavePublicable))).toBe(true);
      expect(await pagina.locator('#vista-configuracion').isHidden(), 'no aparece «Falta configurar el panel»').toBe(true);
      expect(problemas.filter((p) => !/Content Security Policy/i.test(p)), ruta).toEqual([]);
      if (ruta === '/admin/') await pagina.screenshot({ path: path.join(CAPTURAS, `dist-admin-${browserName}.png`) });
    } finally { await contexto.close(); }
  }
});

test.describe('Presentación (intro)', () => {
  const glb = (peticiones) => peticiones.filter((u) => /\.glb(\?|$)/.test(u)).map((u) => path.basename(new URL(u).pathname));
  const hashes = () => Object.fromEntries(['high', 'medium', 'low'].map((n) => [n, fs.readdirSync(path.join(dist, 'assets/images/models/optimized')).find((x) => x.startsWith(`af1-model-${n}.`))]));

  for (const [nivel, archivo] of [['alto', 'high'], ['medio', 'medium'], ['bajo', 'low']]) {
    test(`nivel ${nivel}: el navegador solicita el modelo versionado que corresponde`, async ({ browser }) => {
      const { contexto, pagina, peticiones } = await abrir(browser, ESCRITORIO, `/?intro-depurar&intro-nivel=${nivel}`);
      try {
        await expect.poll(() => glb(peticiones), { timeout: 20000 }).toEqual([hashes()[archivo]]);
        await expect(pagina.locator('#intro-catalogo')).toHaveJSProperty('open', true);
      } finally { await contexto.close(); }
    });
  }

  test('alternativa estática, saltar y volver a ver', async ({ browser, browserName }) => {
    for (const [vista, poster] of [[CELULAR, 'poster-compacto'], [ESCRITORIO, 'poster-amplio']]) {
      // Sin aceleración por hardware (o con movimiento reducido) la presentación usa el póster.
      const { contexto, pagina, peticiones } = await abrir(browser, vista, '/');
      try {
        await expect(pagina.locator('#intro-catalogo')).toHaveJSProperty('open', true);
        await expect.poll(() => peticiones.filter((u) => /\/intro\/poster-/.test(u)).map((u) => path.basename(new URL(u).pathname))).toEqual([expect.stringMatching(new RegExp(`^${poster}\\.[0-9a-f]{10}\\.webp$`))]);
        expect(glb(peticiones), 'en estático no se descarga el modelo').toEqual([]);
        await pagina.screenshot({ path: path.join(CAPTURAS, `dist-intro-estatico-${browserName}-${vista.ancho}.png`) });
        await pagina.locator('[data-intro-saltar]').click();
        await expect(pagina.locator('#intro-catalogo')).toHaveJSProperty('open', false);
        await expect(pagina.locator('#repetir-presentacion')).toBeVisible();
        await pagina.locator('#repetir-presentacion').click();
        await expect(pagina.locator('#intro-catalogo')).toHaveJSProperty('open', true);
        await pagina.locator('[data-intro-saltar]').click();
        await expect(pagina.locator('#intro-catalogo')).toHaveJSProperty('open', false);
      } finally { await contexto.close(); }
    }
  });
});
