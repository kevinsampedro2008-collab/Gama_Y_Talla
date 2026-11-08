// @ts-check
/* Etapa 16 · Corrección 1: un fallo de actualización DESPUÉS de haber cargado, sin caché
 * persistida, no puede dejar como confirmada la disponibilidad anterior.
 *
 * Supabase se simula (como en la etapa 14): no hay red real ni datos remotos. Todo ocurre
 * SIN RECARGAR LA PÁGINA y por los flujos reales de la interfaz (ficha, botón del carrito,
 * «Reintentar»), además de las dos funciones de carga, cargarProductos() y refrescarCatalogo().
 */
import { test, expect } from '@playwright/test';
import { CELULAR, nuevaPagina, irATienda, URL_REAL, abrirDetalle } from '../etapa9/ayudas.js';
import { CATALOGO_MIGRADO, conEstados, URL_SUPABASE, CLAVE_CARRITO, CLAVE_CACHE, guardadoV3 } from '../etapa14/ayudas-etapa14.js';

const SAMBA = 'SAMBA';
const CON_40 = conEstados(CATALOGO_MIGRADO, SAMBA, { 40: 'DISPONIBLE' });
const CLAVE_PUBLICABLE = 'sb_publishable_CLAVE_FICTICIA_DE_PRUEBA_16';

const leer = (pagina) => pagina.evaluate((clave) => ({
  listo: estado.catalogoListo,
  respaldo: estado.respaldo?.motivo || null,
  comprables: lineasComprables().map((l) => `${l.producto.nombre}|${l.talla}|${l.cantidad}`),
  porRevisar: lineasPorRevisar().map((l) => `${l.producto.nombre}|${l.talla}|${l.cantidad}`),
  estado40: estado.productos.find((p) => p.nombre === 'SAMBA')?.variantes[0].estadosTalla['40'] || null,
  productos: estado.productos.length,
  cache: localStorage.getItem(clave)
}), CLAVE_CACHE);

test('fallo de actualización sin caché persistida: modo consulta sin recargar, carrito intacto y recuperación', async ({ browser, browserName }) => {
  const { contexto, pagina } = await nuevaPagina(browser, browserName, CELULAR, { reducido: true });
  let modo = 'ok';
  let peticiones = 0;
  try {
    // b) La caché del catálogo no se puede escribir (cuota llena o almacenamiento bloqueado).
    await pagina.addInitScript(([conf, claveCache]) => {
      window.GAMA_TALLA_CONFIG = conf;
      window.__abiertas = [];
      window.open = (enlace) => { window.__abiertas.push(String(enlace)); return {}; };
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (clave, valor) {
        if (clave === claveCache) throw new DOMException('La cuota de almacenamiento está llena.', 'QuotaExceededError');
        return original.call(this, clave, valor);
      };
    }, [{ supabaseUrl: new URL(URL_SUPABASE).origin, clavePublicable: CLAVE_PUBLICABLE }, CLAVE_CACHE]);
    await pagina.route('**/rest/v1/catalogo_publico**', async (ruta) => {
      peticiones += 1;
      if (modo === 'falla') return ruta.abort('internetdisconnected');
      await ruta.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(CON_40) });
    });

    // a) Carga correcta con la talla 40 disponible; la caché no llegó a guardarse.
    await irATienda(pagina, URL_REAL);
    let r = await leer(pagina);
    expect(r).toMatchObject({ listo: true, respaldo: null, estado40: 'DISPONIBLE', cache: null });

    // c) La talla 40 al carrito desde la ficha, y una unidad más desde el carrito: 2 unidades.
    const ficha = await abrirDetalle(pagina, SAMBA);
    await ficha.locator('.talla[data-talla="40"]').click();
    const agregar = ficha.locator('.detalle-acciones [data-accion="agregar"]');
    await agregar.scrollIntoViewIfNeeded();
    await agregar.click();
    await expect(pagina.locator('#confirmacion-carrito')).toHaveJSProperty('open', true);
    await pagina.keyboard.press('Escape');
    await expect(pagina.locator('#confirmacion-carrito')).toHaveJSProperty('open', false);
    await pagina.keyboard.press('Escape');
    await pagina.locator('#boton-carrito').click();
    await expect(pagina.locator('#carrito')).toHaveJSProperty('open', true);
    await pagina.locator('#carrito .linea [data-paso="1"]').first().click();
    await expect(pagina.locator('#carrito-enviar')).toBeVisible();
    const guardadoAntes = await guardadoV3(pagina);
    expect(guardadoAntes.lineas).toHaveLength(1);
    expect(guardadoAntes.lineas[0]).toMatchObject({ talla: '40', cantidad: 2 });
    r = await leer(pagina);
    expect(r.comprables).toEqual(['SAMBA|40|2']);
    await pagina.keyboard.press('Escape');
    await expect(pagina.locator('#carrito')).toHaveJSProperty('open', false);

    // d) La siguiente actualización falla. Flujo real: abrir el carrito refresca el catálogo.
    modo = 'falla';
    const antes = peticiones;
    await pagina.locator('#boton-carrito').click();
    await expect.poll(() => peticiones).toBeGreaterThan(antes);
    // e) Nada se puede pedir con la disponibilidad antigua; el carrito sigue igual.
    await expect(pagina.locator('#aviso-respaldo')).toContainText('Modo consulta');
    await expect(pagina.locator('#carrito-enviar')).toBeHidden();
    await expect(pagina.locator('#carrito-copiar')).toBeHidden();
    await expect(pagina.locator('#carrito-consultar')).toBeVisible();
    await expect(pagina.locator('#carrito .linea')).toHaveCount(1);
    r = await leer(pagina);
    expect(r.respaldo, 'el último catálogo real queda en modo consulta').toBe('memoria');
    expect(r.comprables, 'ninguna línea comprable con datos sin verificar').toEqual([]);
    expect(r.porRevisar).toEqual(['SAMBA|40|2']);
    expect(r.estado40).toBe('POR_REVISAR');
    expect(r.productos, 'nunca los ejemplos del JSON: el mismo catálogo real').toBe(CATALOGO_MIGRADO.length);
    expect(await guardadoV3(pagina), 'el carrito V3 conserva líneas y cantidades').toEqual(guardadoAntes);
    const consulta = new URL(await pagina.locator('#carrito-consultar').getAttribute('href')).searchParams.get('text');
    expect(consulta).toContain('CONSULTA DE DISPONIBILIDAD');
    expect(consulta).toContain('* Cantidad: 2');
    await pagina.keyboard.press('Escape');

    // La ficha también se pone al día: la 40 queda por revisar y no se puede añadir.
    const ficha2 = await abrirDetalle(pagina, SAMBA);
    await expect(ficha2.locator('.talla[data-talla="40"]')).toHaveClass(/talla-por-revisar/);
    await pagina.keyboard.press('Escape');

    // cargarProductos() (la ruta de «Reintentar») con la conexión todavía caída: sigue en
    // consulta con el mismo catálogo, no pasa a un estado de error ni recupera la disponibilidad.
    await pagina.evaluate(() => cargarProductos());
    r = await leer(pagina);
    expect(r.respaldo).toBe('memoria');
    expect(r.comprables).toEqual([]);
    await expect(pagina.locator('.tarjeta').first()).toBeVisible();
    await expect(pagina.locator('.estado-catalogo')).toHaveCount(0);
    // refrescarCatalogo() directo: tampoco «confirma» nada por haber cargado antes.
    expect(await pagina.evaluate(() => refrescarCatalogo())).toBe(true);
    r = await leer(pagina);
    expect(r.comprables).toEqual([]);
    expect(await guardadoV3(pagina)).toEqual(guardadoAntes);

    // f) Vuelve una respuesta válida: desaparece el aviso y la 40 se puede pedir otra vez.
    modo = 'ok';
    await pagina.locator('#boton-carrito').click();
    await expect(pagina.locator('#aviso-respaldo')).toHaveCount(0);
    await expect(pagina.locator('#carrito-enviar')).toBeVisible();
    r = await leer(pagina);
    expect(r).toMatchObject({ respaldo: null, estado40: 'DISPONIBLE', comprables: ['SAMBA|40|2'] });
    const pedido = new URL(await pagina.locator('#carrito-enviar').getAttribute('href')).searchParams.get('text');
    expect(pedido).toContain('NUEVO PEDIDO');
    expect(pedido).toContain('* Cantidad: 2');
    expect(await guardadoV3(pagina)).toEqual(guardadoAntes);
  } finally {
    await contexto.close();
  }
});

test('sin ningún catálogo real (ni en memoria ni guardado), un fallo bloquea los pedidos y conserva el carrito', async ({ browser, browserName }) => {
  const { contexto, pagina } = await nuevaPagina(browser, browserName, CELULAR, { reducido: true });
  const p = CON_40.find((x) => x.nombre === SAMBA);
  const carrito = { version: 3, pendientes: [], lineas: [{ producto: p.id, variante: p.variantes[0].id, talla: '40', cantidad: 3, precio: p.variantes[0].precio }] };
  try {
    await pagina.addInitScript(([conf, c, claveCarrito]) => {
      window.GAMA_TALLA_CONFIG = conf;
      localStorage.setItem(claveCarrito, JSON.stringify(c));
    }, [{ supabaseUrl: new URL(URL_SUPABASE).origin, clavePublicable: CLAVE_PUBLICABLE }, carrito, CLAVE_CARRITO]);
    await pagina.route('**/rest/v1/catalogo_publico**', (ruta) => ruta.abort('internetdisconnected'));
    await irATienda(pagina, URL_REAL, { tarjetas: false });
    await expect(pagina.locator('.estado-catalogo h3')).toHaveText('No pudimos cargar las zapatillas');
    expect(await pagina.evaluate(() => ({ productos: estado.productos.length, comprables: lineasComprables().length }))).toEqual({ productos: 0, comprables: 0 });
    expect(await guardadoV3(pagina)).toEqual(carrito);
  } finally {
    await contexto.close();
  }
});
