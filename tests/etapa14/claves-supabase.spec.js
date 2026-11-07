// Etapa 14f · Validación de la clave de Supabase declarada en GAMA_TALLA_CONFIG.
// Las claves de este archivo son FICTICIAS: ninguna existe en ningún proyecto.
import { test, expect } from '@playwright/test';
import { VISTAS, CELULAR, ESCRITORIO, nuevaPagina, irATienda, URL_REAL } from '../etapa9/ayudas.js';
import { CATALOGO_MIGRADO, URL_SUPABASE, CLAVE_CARRITO, guardadoV3, abrirCarritoDesdeCabecera } from './ayudas-etapa14.js';

const jwt = (carga) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(carga)}.firma-ficticia-de-prueba`;
};

const ACEPTADAS = [
  ['sb_publishable_ (nueva)', 'sb_publishable_CLAVE_FICTICIA_1234567890'],
  ['JWT antiguo con role anon', jwt({ role: 'anon', ref: 'proyecto-ficticio' })],
  ['JWT antiguo con role authenticated', jwt({ role: 'authenticated' })],
  ['texto cualquiera (compatibilidad con las pruebas)', 'clave-publica-de-prueba'],
  // Un JWT ilegible no permite afirmar que sea secreto: no se rechaza por sospecha.
  ['JWT ilegible', 'eyJabc.%%%no-es-base64%%%.firma']
];

const RECHAZADAS = [
  ['sb_secret_', 'sb_secret_CLAVE_FICTICIA_1234567890', 'sb_secret_'],
  ['SB_SECRET_ en mayúsculas', 'SB_SECRET_CLAVE_FICTICIA_1234567890', 'sb_secret_'],
  ['JWT antiguo con role service_role', jwt({ role: 'service_role', ref: 'proyecto-ficticio' }), 'service_role']
];

/* Abre la tienda con la clave indicada y deja que la prueba mire TODO lo que salió del
   navegador: consola, peticiones y almacenamiento. Supabase se simula; no hay red real. */
async function conClave({ browser, browserName }, vista, clave, cuerpo, { carrito = null } = {}) {
  const { contexto, pagina } = await nuevaPagina(browser, browserName, vista, { reducido: true });
  const consola = [];
  const peticiones = [];
  let aSupabase = 0;
  pagina.on('console', (m) => consola.push(`${m.type()}: ${m.text()}`));
  pagina.on('request', (r) => peticiones.push(`${r.url()} ${JSON.stringify(r.headers())}`));
  try {
    await pagina.addInitScript(([url, k, car, claveCarrito]) => {
      window.GAMA_TALLA_CONFIG = { catalogoUrl: url, catalogoClave: k };
      if (car) localStorage.setItem(claveCarrito, JSON.stringify(car));
    }, [URL_SUPABASE, clave, carrito, CLAVE_CARRITO]);
    await pagina.route('**/rest/v1/catalogo_publico**', async (ruta) => {
      aSupabase += 1;
      await ruta.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(CATALOGO_MIGRADO) });
    });
    await irATienda(pagina, URL_REAL);
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
  for (const [nombre, clave] of ACEPTADAS) {
    test(`${nombre}`, async ({ browser, browserName }) => {
      await conClave({ browser, browserName }, CELULAR, clave, async (pagina, { consola, peticiones, aSupabase }) => {
        const t = await estadoTienda(pagina);
        expect(t.productos).toBe(28);
        expect(t.modoConsulta, 'sigue leyendo de Supabase').toBe(false);
        expect(t.claveRechazada).toBe('');
        expect(aSupabase(), 'una petición a Supabase').toBeGreaterThanOrEqual(1);
        const peticion = peticiones.find((p) => p.includes('/rest/v1/catalogo_publico'));
        expect(peticion, 'la clave viaja como apikey').toContain(`"apikey":"${clave}"`);
        expect(peticion, 'y como Bearer').toContain(`"authorization":"Bearer ${clave}"`);
        expect(consola.filter((c) => /SECRETA|rechazad/i.test(c)), 'ninguna advertencia de clave').toEqual([]);
        await expect(pagina.locator('#aviso-respaldo')).toHaveCount(0);
      });
    });
  }
});

test.describe('Claves secretas: se rechazan, no se usan y la tienda pasa a modo consulta', () => {
  for (const [nombre, clave, tipo] of RECHAZADAS) {
    test(`${nombre}`, async ({ browser, browserName }) => {
      await conClave({ browser, browserName }, CELULAR, clave, async (pagina, { consola, peticiones, aSupabase }) => {
        const t = await estadoTienda(pagina);
        // Modo consulta con el catálogo de respaldo: nada se presenta como disponible.
        expect(t.productos).toBe(28);
        expect(t.modoConsulta).toBe(true);
        expect(t.disponibles, 'ninguna talla DISPONIBLE').toBe(0);
        await expect(pagina.locator('#aviso-respaldo')).toBeVisible();
        // La clave se descartó y no se llamó a Supabase con ella.
        expect(t.claveEnConfig).toBe('');
        expect(t.claveRechazada).toBe(tipo);
        expect(aSupabase(), 'no se contacta con Supabase').toBe(0);
        // Advertencia clara que nombra el TIPO.
        const aviso = consola.find((c) => c.startsWith('warning:') && /SECRETA/.test(c));
        expect(aviso, 'hay advertencia en consola').toBeTruthy();
        expect(aviso).toContain(tipo);
        // Y el VALOR no aparece en ningún sitio: consola, red, almacenamiento ni DOM.
        const semilla = clave.slice(-14);
        expect(consola.join('\n'), 'consola').not.toContain(semilla);
        expect(peticiones.join('\n'), 'peticiones y cabeceras').not.toContain(semilla);
        const guardado = await pagina.evaluate(() => JSON.stringify({ ...localStorage }) + document.documentElement.outerHTML);
        expect(guardado, 'almacenamiento y DOM').not.toContain(semilla);
      });
    });
  }

  test('también en un escritorio ancho', async ({ browser, browserName }) => {
    await conClave({ browser, browserName }, ESCRITORIO, RECHAZADAS[0][1], async (pagina) => {
      expect((await estadoTienda(pagina)).modoConsulta).toBe(true);
      await expect(pagina.locator('#aviso-respaldo')).toBeVisible();
    });
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
    }, { carrito });
  });
});

test.describe('Sin clave declarada, todo sigue como antes', () => {
  test('catalogoClave vacío: se contacta con Supabase sin cabeceras de clave', async ({ browser, browserName }) => {
    await conClave({ browser, browserName }, CELULAR, '', async (pagina, { peticiones, aSupabase }) => {
      const t = await estadoTienda(pagina);
      expect(t.modoConsulta).toBe(false);
      expect(t.claveRechazada).toBe('');
      expect(aSupabase()).toBeGreaterThanOrEqual(1);
      expect(peticiones.find((p) => p.includes('/rest/v1/catalogo_publico'))).not.toContain('"apikey"');
    });
  });
});

for (const vista of VISTAS) {
  test(`${vista.nombre}px: con clave secreta el aviso de modo consulta se ve y no desborda`, async ({ browser, browserName }) => {
    await conClave({ browser, browserName }, vista, RECHAZADAS[2][1], async (pagina) => {
      await expect(pagina.locator('#aviso-respaldo')).toBeVisible();
      const medida = await pagina.evaluate(() => ({ doc: document.documentElement.scrollWidth, ventana: window.innerWidth }));
      expect(medida.doc).toBeLessThanOrEqual(medida.ventana);
    });
  });
}
