// Etapa 14f · Validación de la clave de Supabase declarada en GAMA_TALLA_CONFIG.
// Las claves de este archivo son FICTICIAS: ninguna existe en ningún proyecto.
import { test, expect } from '@playwright/test';
import { VISTAS, CELULAR, ESCRITORIO, nuevaPagina, irATienda, URL_REAL } from '../etapa9/ayudas.js';
import { CATALOGO_MIGRADO, URL_SUPABASE, CLAVE_CARRITO, CLAVE_CACHE, cacheReal, guardadoV3, abrirCarritoDesdeCabecera } from './ayudas-etapa14.js';

const jwt = (carga) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(carga)}.firma-ficticia-de-prueba`;
};

// Etapa 16: lista EXPLÍCITA de formatos admitidos. Todo lo demás se rechaza.
// [nombre, clave, tipo admitido]
const ACEPTADAS = [
  ['sb_publishable_ (nueva)', 'sb_publishable_CLAVE_FICTICIA_1234567890', 'publicable'],
  ['JWT antiguo con role anon', jwt({ role: 'anon', ref: 'proyecto-ficticio' }), 'jwt-anon']
];

// [nombre, clave, tipo de rechazo, ¿es secreta?]
const RECHAZADAS = [
  ['sb_secret_', 'sb_secret_CLAVE_FICTICIA_1234567890', 'sb_secret_', true],
  ['SB_SECRET_ en mayúsculas', 'SB_SECRET_CLAVE_FICTICIA_1234567890', 'sb_secret_', true],
  ['JWT antiguo con role service_role', jwt({ role: 'service_role', ref: 'proyecto-ficticio' }), 'service_role', true],
  ['JWT de una sesión de usuario (role authenticated)', jwt({ role: 'authenticated', sub: 'usuario-ficticio' }), 'authenticated', false],
  ['JWT con un rol desconocido', jwt({ role: 'supabase_admin' }), 'rol-desconocido', false],
  ['JWT sin rol', jwt({ ref: 'proyecto-ficticio' }), 'rol-desconocido', false],
  ['JWT ilegible', 'eyJabc.%%%no-es-base64%%%.firma-ilegible-ficticia', 'jwt-ilegible', false],
  ['JWT con la carga en texto no JSON', `eyJhbGciOiJIUzI1NiJ9.${Buffer.from('anon').toString('base64url')}.firma-no-json-ficticia`, 'jwt-ilegible', false],
  ['texto cualquiera', 'clave-publica-de-prueba-ficticia', 'formato-no-admitido', false],
  ['sb_publishable_ con caracteres no admitidos', 'sb_publishable_CLAVE FICTICIA!123', 'formato-no-admitido', false],
  ['clave con «Bearer» delante', 'Bearer sb_publishable_CLAVE_FICTICIA_BEARER', 'formato-no-admitido', false]
];

/* Abre la tienda con la clave indicada y deja que la prueba mire TODO lo que salió del
   navegador: consola, peticiones y almacenamiento. Supabase se simula; no hay red real. */
async function conClave({ browser, browserName }, vista, clave, cuerpo, { carrito = null, cache = null, tarjetas = true } = {}) {
  const { contexto, pagina } = await nuevaPagina(browser, browserName, vista, { reducido: true });
  const consola = [];
  const peticiones = [];
  let aSupabase = 0;
  pagina.on('console', (m) => consola.push(`${m.type()}: ${m.text()}`));
  pagina.on('request', (r) => peticiones.push(`${r.url()} ${JSON.stringify(r.headers())}`));
  try {
    await pagina.addInitScript(([url, k, car, claveCarrito, c, claveCache]) => {
      window.GAMA_TALLA_CONFIG = { catalogoUrl: url, catalogoClave: k };
      if (car) localStorage.setItem(claveCarrito, JSON.stringify(car));
      if (c) localStorage.setItem(claveCache, JSON.stringify(c));
    }, [URL_SUPABASE, clave, carrito, CLAVE_CARRITO, cache, CLAVE_CACHE]);
    await pagina.route('**/rest/v1/catalogo_publico**', async (ruta) => {
      aSupabase += 1;
      await ruta.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(CATALOGO_MIGRADO) });
    });
    await irATienda(pagina, URL_REAL, { tarjetas });
    await cuerpo(pagina, { consola, peticiones, aSupabase: () => aSupabase });
  } finally {
    await contexto.close();
  }
}

const estadoTienda = (pagina) => pagina.evaluate(() => ({
  productos: estado.productos.length,
  modoConsulta: Boolean(estado.respaldo),
  disponibles: estado.productos.reduce((n, p) => n + p.variantes.reduce((m, v) => m + v.tallasDisponibles.length, 0), 0),
  claveEnConfig: CONFIG.catalogoClave,
  claveRechazada: CONFIG.claveRechazada
}));

test.describe('Claves aceptadas: se usan tal cual y la tienda sigue conectada', () => {
  for (const [nombre, clave, tipo] of ACEPTADAS) {
    test(`${nombre}`, async ({ browser, browserName }) => {
      await conClave({ browser, browserName }, CELULAR, clave, async (pagina, { consola, peticiones, aSupabase }) => {
        const t = await estadoTienda(pagina);
        expect(t.productos).toBe(28);
        expect(t.modoConsulta, 'sigue leyendo de Supabase').toBe(false);
        expect(t.claveRechazada).toBe('');
        expect(aSupabase(), 'una petición a Supabase').toBeGreaterThanOrEqual(1);
        const peticion = peticiones.find((p) => p.includes('/rest/v1/catalogo_publico'));
        expect(peticion, 'la clave viaja como apikey').toContain(`"apikey":"${clave}"`);
        expect(await pagina.evaluate(() => CONFIG.tipoClave)).toBe(tipo);
        // Etapa 16: solo un JWT anon antiguo viaja también como Bearer; sb_publishable_ va
        // únicamente en apikey.
        if (tipo === 'jwt-anon') expect(peticion, 'un JWT anon va también como Bearer').toContain(`"authorization":"Bearer ${clave}"`);
        else expect(peticion, 'sin Authorization: no es un JWT').not.toContain('"authorization"');
        expect(consola.filter((c) => /SECRETA|rechazad/i.test(c)), 'ninguna advertencia de clave').toEqual([]);
        await expect(pagina.locator('#aviso-respaldo')).toHaveCount(0);
      });
    });
  }
});

// Etapa 16: el respaldo es el último catálogo REAL de este navegador para el mismo proyecto;
// los ejemplos del JSON ya no lo sustituyen.
const CACHE = cacheReal(CATALOGO_MIGRADO);

test.describe('Claves no admitidas: se rechazan, no se usan y la tienda pasa a modo consulta', () => {
  for (const [nombre, clave, tipo, secreta] of RECHAZADAS) {
    test(`${nombre}`, async ({ browser, browserName }) => {
      await conClave({ browser, browserName }, CELULAR, clave, async (pagina, { consola, peticiones, aSupabase }) => {
        const t = await estadoTienda(pagina);
        // Modo consulta con el catálogo real guardado: nada se presenta como disponible.
        expect(t.productos).toBe(28);
        expect(t.modoConsulta).toBe(true);
        expect(t.disponibles, 'ninguna talla DISPONIBLE').toBe(0);
        await expect(pagina.locator('#aviso-respaldo')).toBeVisible();
        // La clave se descartó y no se llamó a Supabase con ella.
        expect(t.claveEnConfig).toBe('');
        expect(t.claveRechazada).toBe(tipo);
        expect(aSupabase(), 'no se contacta con Supabase').toBe(0);
        // Advertencia clara que nombra el TIPO (y que es secreta, si lo es).
        const aviso = consola.find((c) => c.startsWith('warning:') && (secreta ? /SECRETA/ : /no es una clave publicable admitida/).test(c));
        expect(aviso, 'hay advertencia en consola').toBeTruthy();
        expect(aviso).toContain(tipo);
        // Ninguna petición lleva apikey ni Authorization.
        expect(peticiones.filter((p) => /"apikey"|"authorization"/.test(p)), 'ninguna cabecera de clave').toEqual([]);
        // Y el VALOR no aparece en ningún sitio: consola, red, almacenamiento ni DOM.
        const semilla = clave.slice(-14);
        expect(consola.join('\n'), 'consola').not.toContain(semilla);
        expect(peticiones.join('\n'), 'peticiones y cabeceras').not.toContain(semilla);
        const guardado = await pagina.evaluate(() => JSON.stringify({ ...localStorage }) + document.documentElement.outerHTML);
        expect(guardado, 'almacenamiento y DOM').not.toContain(semilla);
      }, { cache: CACHE });
    });
  }

  test('sin catálogo real guardado: aviso, sin ejemplos del JSON y sin contactar con Supabase', async ({ browser, browserName }) => {
    await conClave({ browser, browserName }, CELULAR, RECHAZADAS[0][1], async (pagina, { aSupabase, consola }) => {
      const t = await estadoTienda(pagina);
      expect(t.productos, 'ningún ejemplo se presenta como catálogo').toBe(0);
      expect(t.claveRechazada).toBe('sb_secret_');
      expect(aSupabase()).toBe(0);
      await expect(pagina.locator('.estado-catalogo h3')).toHaveText('El catálogo no está disponible en este momento');
      expect(consola.join('\n')).not.toContain(RECHAZADAS[0][1].slice(-14));
    }, { tarjetas: false });
  });

  test('también en un escritorio ancho', async ({ browser, browserName }) => {
    await conClave({ browser, browserName }, ESCRITORIO, RECHAZADAS[0][1], async (pagina) => {
      expect((await estadoTienda(pagina)).modoConsulta).toBe(true);
      await expect(pagina.locator('#aviso-respaldo')).toBeVisible();
    }, { cache: CACHE });
  });

  test('el carrito se conserva y solo se puede consultar, no pedir', async ({ browser, browserName }) => {
    const p = CATALOGO_MIGRADO.find((x) => x.nombre === 'SAMBA');
    const carrito = { version: 3, pendientes: [], lineas: [{ producto: p.id, variante: p.variantes[0].id, talla: '40', cantidad: 2, precio: p.variantes[0].precio }] };
    await conClave({ browser, browserName }, CELULAR, RECHAZADAS[0][1], async (pagina, { aSupabase }) => {
      expect(aSupabase(), 'la clave secreta no se usó para contactar con Supabase').toBe(0);
      const antes = await guardadoV3(pagina);
      await abrirCarritoDesdeCabecera(pagina);
      await expect(pagina.locator('#carrito .linea')).toHaveCount(1);
      await expect(pagina.locator('#carrito-enviar')).toBeHidden();
      await expect(pagina.locator('#carrito-copiar')).toBeHidden();
      await expect(pagina.locator('#carrito-consultar')).toBeVisible();
      expect(await guardadoV3(pagina), 'el carrito V3 no cambió').toEqual(antes);
    }, { carrito, cache: CACHE });
  });
});

test.describe('Sin clave declarada', () => {
  // Etapa 16: una dirección sin clave es una configuración incompleta. Supabase no responde
  // sin clave, así que no se contacta: el último catálogo real, en modo consulta.
  test('catalogoClave vacío: configuración incompleta, no se contacta con Supabase', async ({ browser, browserName }) => {
    await conClave({ browser, browserName }, CELULAR, '', async (pagina, { peticiones, aSupabase, consola }) => {
      const t = await estadoTienda(pagina);
      expect(t.claveRechazada).toBe('sin-clave');
      expect(t.modoConsulta).toBe(true);
      expect(aSupabase()).toBe(0);
      expect(peticiones.filter((p) => /"apikey"|"authorization"/.test(p))).toEqual([]);
      expect(consola.some((c) => c.startsWith('warning:') && c.includes('sin-clave'))).toBe(true);
    }, { cache: CACHE });
  });
});

for (const vista of VISTAS) {
  test(`${vista.nombre}px: con clave secreta el aviso de modo consulta se ve y no desborda`, async ({ browser, browserName }) => {
    await conClave({ browser, browserName }, vista, RECHAZADAS[2][1], async (pagina) => {
      await expect(pagina.locator('#aviso-respaldo')).toBeVisible();
      const medida = await pagina.evaluate(() => ({ doc: document.documentElement.scrollWidth, ventana: window.innerWidth }));
      expect(medida.doc).toBeLessThanOrEqual(medida.ventana);
    }, { cache: CACHE });
  });
}
