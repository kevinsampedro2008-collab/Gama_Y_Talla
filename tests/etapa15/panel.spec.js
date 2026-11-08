// @ts-check
/* Etapa 15A · Panel privado: ingreso, autorización, sesión y tablero de consulta.
 *
 * SOLO contra el stack local desechable de Supabase (`supabase start`) y la tienda servida en
 * 127.0.0.1:8765. Usuarios y catálogo FICTICIOS, creados y borrados por cada navegador.
 *
 *   npx playwright test tests/etapa15 --workers=1
 *
 * Las capturas se guardan fuera del repositorio (carpeta temporal del sistema).
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PANEL, SITIO, CLAVE_SESION, entorno, crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin,
  contarProductos, crearCatalogo, borrarCatalogo, configurarPanel, ingresar, revisarDisposicion, limpiarRestosDePruebas
} from './ayudas-panel.js';

test.describe.configure({ mode: 'serial' });

const CAPTURAS = path.join(os.tmpdir(), 'gama-talla-15a-capturas');
const ANCHOS = [360, 390, 768, 1024, 1440];
const CARRITO = { version: 3, lineas: [{ producto: 'ADD-SAM~zapatilla-01', variante: 'unica', talla: '40', cantidad: 2, precio: 100000 }], pendientes: [] };
const CACHE = { texto: '{"productos":[]}', fecha: 1700000000000 };

let admin; let sinPermiso; let revocable; let catalogo = null; let sufijo;

test.beforeAll(async ({}, info) => {
  entorno(); // se niega a seguir si la API no es local
  await limpiarRestosDePruebas();
  sufijo = `${info.project.name}-${Date.now().toString(36)}`;
  admin = await crearUsuario(`admin-${sufijo}@gamaytalla.test`);
  sinPermiso = await crearUsuario(`sesion-${sufijo}@gamaytalla.test`);
  revocable = await crearUsuario(`revocable-${sufijo}@gamaytalla.test`);
  await hacerAdmin(admin.id);
  await hacerAdmin(revocable.id);
  fs.mkdirSync(CAPTURAS, { recursive: true });
});

test.afterAll(async () => {
  await borrarCatalogo(catalogo).catch(() => null);
  for (const u of [admin, sinPermiso, revocable]) {
    if (!u) continue;
    await quitarAdmin(u.id).catch(() => null);
    await borrarUsuario(u.id);
  }
});

test.beforeEach(async ({ page }) => {
  await configurarPanel(page);
});

const tablero = (page) => page.locator('#vista-tablero');
const tituloIngreso = (page) => page.getByRole('heading', { name: 'Panel de la tienda' });

test('sin sesión: solo el ingreso, sin pedir datos administrativos', async ({ page }) => {
  const pedidos = [];
  page.on('request', (r) => { if (/\/rest\/v1\//.test(r.url())) pedidos.push(r.url()); });
  await page.goto(PANEL);
  await expect(tituloIngreso(page)).toBeVisible();
  await expect(tablero(page)).toBeHidden();
  await expect(page.getByRole('link', { name: /registr|crear cuenta/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /registr|crear cuenta|olvid/i })).toHaveCount(0);
  expect(pedidos, 'ninguna consulta a tablas o funciones sin sesión').toEqual([]);
});

test('configuración: falta config.js o la clave no es la publicable', async ({ page }) => {
  await page.unroute('**/admin/config.js');
  await page.route('**/admin/config.js', (r) => r.fulfill({ status: 404, body: '' }));
  await page.goto(PANEL);
  await expect(page.getByRole('heading', { name: 'Falta configurar el panel' })).toBeVisible();

  await page.unroute('**/admin/config.js');
  await configurarPanel(page, { clave: 'sb_secret_no_es_publicable' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Falta configurar el panel' })).toBeVisible();
  await expect(tituloIngreso(page)).toBeHidden();
});

test('validación local, mostrar contraseña y credenciales incorrectas sin revelar la cuenta', async ({ page }) => {
  await page.goto(PANEL);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('alert')).toHaveText('Escribe tu correo.');
  await expect(page.getByLabel('Correo')).toBeFocused();

  const clave = page.getByLabel('Contraseña', { exact: true });
  await clave.fill('secreto');
  const ver = page.getByRole('button', { name: 'Mostrar contraseña' });
  await ver.click();
  await expect(clave).toHaveAttribute('type', 'text');
  await expect(page.getByRole('button', { name: 'Ocultar contraseña' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Ocultar contraseña' }).click();
  await expect(clave).toHaveAttribute('type', 'password');

  await ingresar(page, { correo: admin.correo, clave: 'Incorrecta-123' });
  const error = page.getByRole('alert');
  await expect(error).toHaveText('El correo o la contraseña no son correctos.');
  await ingresar(page, { correo: `no-existe-${sufijo}@gamaytalla.test`, clave: 'Incorrecta-123' });
  await expect(error).toHaveText('El correo o la contraseña no son correctos.');
  await expect(tablero(page)).toBeHidden();
  expect(await page.evaluate((k) => localStorage.getItem(k), CLAVE_SESION)).toBeNull();
});

test('Enter envía, hay estado de carga y no se duplica el envío', async ({ page }) => {
  let tokens = 0;
  await page.route('**/auth/v1/token**', async (r) => { tokens += 1; await new Promise((h) => setTimeout(h, 700)); await r.continue(); });
  await page.goto(PANEL);
  await page.getByLabel('Correo').fill(admin.correo);
  await page.getByLabel('Contraseña', { exact: true }).fill(admin.clave);
  await page.getByLabel('Contraseña', { exact: true }).press('Enter');
  const boton = page.locator('#boton-ingresar');
  await expect(boton).toBeDisabled();
  await expect(boton).toHaveText('Ingresando…');
  await boton.click({ force: true }).catch(() => null);
  await page.getByLabel('Contraseña', { exact: true }).press('Enter').catch(() => null);
  await expect(tablero(page)).toBeVisible();
  expect(tokens, 'una sola petición de inicio de sesión').toBe(1);
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(tituloIngreso(page)).toBeVisible();
});

test('sesión válida sin permiso administrativo: acceso denegado y sin datos', async ({ page }) => {
  const pedidos = [];
  page.on('request', (r) => { if (/\/rest\/v1\/(productos|variantes|catalogo_publico|rpc\/fn_admin_tallas)/.test(r.url())) pedidos.push(r.url()); });
  await page.goto(PANEL);
  await ingresar(page, sinPermiso);
  await expect(page.getByRole('heading', { name: 'Esta cuenta no tiene acceso al panel' })).toBeVisible();
  await expect(page.locator('#denegado-correo')).toHaveText(sinPermiso.correo);
  await expect(tablero(page)).toBeHidden();
  expect(pedidos, 'no se piden datos del catálogo').toEqual([]);
  await page.screenshot({ path: path.join(CAPTURAS, `${test.info().project.name}-denegado.png`) });
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(tituloIngreso(page)).toBeVisible();
});

test('administrador: tablero vacío honesto cuando no hay productos', async ({ page }) => {
  expect(await contarProductos(), 'precondición: el stack local no tiene productos').toBe(0);
  await page.goto(PANEL);
  await ingresar(page, admin);
  await expect(tablero(page)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
  await expect(page.locator('#barra-correo')).toHaveText(admin.correo);
  await expect(page.getByRole('heading', { name: 'Todavía no hay zapatillas en el catálogo' })).toBeVisible();
  await expect(page.locator('#formulario-buscar')).toBeHidden();
  await expect(page.locator('#lista-productos > li')).toHaveCount(0);
  for (const ancho of ANCHOS) {
    await page.setViewportSize({ width: ancho, height: 860 });
    await page.screenshot({ path: path.join(CAPTURAS, `${test.info().project.name}-${ancho}-tablero-vacio.png`) });
  }
});

test('administrador: presentación y búsqueda con datos ficticios', async ({ page }) => {
  catalogo = await crearCatalogo(sufijo);
  const [p1, p2, p3] = catalogo.productos;
  await page.goto(PANEL);
  await ingresar(page, admin);
  await expect(tablero(page)).toBeVisible();
  const lista = page.locator('#lista-productos > li');
  await expect(lista).toHaveCount(3);
  await expect(page.locator('#tablero-resumen')).toHaveText('3 zapatillas · 4 colores. En la tienda: 2 tallas disponibles, 2 por revisar, 1 agotada.');

  const primero = lista.filter({ hasText: p1.codigo_interno });
  await expect(primero.getByRole('heading', { level: 2 })).toHaveText(`Corredora Ficticia ${sufijo}`);
  await expect(primero).toContainText(`Ref. REF-PANEL-${sufijo}`);
  await expect(primero).toContainText('Marca Norte · Running');
  await expect(primero).toContainText('Publicado en la tienda');
  await expect(primero).toContainText('$ 289.000');
  await expect(primero.locator('s')).toHaveText('$ 329.000');
  await expect(primero).toContainText('Color oculto en la tienda');
  const tallas = primero.locator('.variante').first().locator('.talla');
  await expect(tallas).toHaveText(['40 1/3, por revisar', '40,5, disponible', '41, disponible', '42, agotada', '43, no visible en la tienda']);
  await expect(primero.locator('.variante').nth(1).locator('.talla')).toHaveText(['40, no visible en la tienda']);
  await expect(primero.locator('img')).toHaveJSProperty('complete', true);
  expect(await primero.locator('img').evaluate((i) => i.naturalWidth)).toBeGreaterThan(0);

  const segundo = lista.filter({ hasText: p2.codigo_interno });
  await expect(segundo).toContainText('Precio por confirmar');
  await expect(segundo).toContainText('Sin foto');
  const tercero = lista.filter({ hasText: p3.codigo_interno });
  await expect(tercero).toContainText('Oculto en la tienda');
  await expect(tercero.locator('.talla')).toHaveText(['39, no visible en la tienda']);

  const buscar = page.getByLabel('Buscar por código interno, referencia, marca o modelo');
  for (const [consulta, esperado] of [[p1.codigo_interno.toLowerCase(), p1], [`REF-PANEL-${sufijo}`, p1], ['marca sur', p2], ['clasica perez', p2], [`old-${sufijo}`, p3]]) {
    await buscar.fill(consulta);
    await expect(lista).toHaveCount(1);
    await expect(lista.first()).toContainText(esperado.codigo_interno);
  }
  await buscar.fill('no-existe-zzz');
  await expect(lista).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Ninguna zapatilla coincide con «no-existe-zzz»' })).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar búsqueda' }).click();
  await expect(lista).toHaveCount(3);
  await expect(buscar).toBeFocused();

  for (const ancho of ANCHOS) {
    await page.setViewportSize({ width: ancho, height: 900 });
    const d = await revisarDisposicion(page);
    expect(d.desborde, `sin desborde horizontal a ${ancho}px`).toBe(0);
    expect(d.pequenos, `controles táctiles de al menos 40px a ${ancho}px`).toEqual([]);
    await page.screenshot({ path: path.join(CAPTURAS, `${test.info().project.name}-${ancho}-tablero.png`), fullPage: true });
  }
});

test('recarga y restauración de la sesión', async ({ page }) => {
  await page.goto(PANEL);
  await ingresar(page, admin);
  await expect(page.locator('#lista-productos > li')).toHaveCount(3);
  await page.reload();
  await expect(tablero(page)).toBeVisible();
  await expect(page.locator('#lista-productos > li')).toHaveCount(3);
  await expect(page.getByLabel('Correo')).toBeHidden();
});

test('errores de red: no se muestran datos anteriores', async ({ page }) => {
  await page.goto(PANEL);
  await ingresar(page, admin);
  await expect(page.locator('#lista-productos > li')).toHaveCount(3);

  // Falla solo la lectura del catálogo: mientras el SDK reintenta (hasta 3 veces) la lista ya
  // está vacía; después, aviso. Nunca quedan visibles los datos anteriores.
  await page.route('**/rest/v1/productos**', (r) => r.abort('internetdisconnected'));
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.locator('#lista-productos > li')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No pudimos cargar el catálogo' })).toBeVisible({ timeout: 20000 }); // el SDK reintenta las lecturas
  await expect(page.locator('#lista-productos > li')).toHaveCount(0);
  await expect(page.locator('#tablero-resumen')).toHaveText('');
  await page.unroute('**/rest/v1/productos**');
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.locator('#lista-productos > li')).toHaveCount(3);

  // Sin conexión con Supabase: no se puede comprobar el acceso; nada del tablero queda visible.
  await page.route('**/127.0.0.1:54321/**', (r) => r.abort('internetdisconnected'));
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.getByRole('heading', { name: 'No pudimos comprobar tu acceso' })).toBeVisible({ timeout: 20000 }); // el SDK reintenta las lecturas
  await expect(tablero(page)).toBeHidden();
  expect(await page.locator('#lista-productos > li').count()).toBe(0);
  await page.unroute('**/127.0.0.1:54321/**');
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.locator('#lista-productos > li')).toHaveCount(3);

  // Sin conexión al ingresar: mensaje comprensible.
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.route('**/auth/v1/token**', (r) => r.abort('internetdisconnected'));
  await ingresar(page, admin);
  await expect(page.getByRole('alert')).toHaveText('No pudimos conectar. Revisa tu conexión a internet e inténtalo de nuevo.');
});

test('retirada del permiso con la sesión abierta', async ({ page }) => {
  await page.goto(PANEL);
  await ingresar(page, revocable);
  await expect(page.locator('#lista-productos > li')).toHaveCount(3);
  await quitarAdmin(revocable.id);
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.getByRole('heading', { name: 'Esta cuenta no tiene acceso al panel' })).toBeVisible();
  await expect(tablero(page)).toBeHidden();
  expect(await page.locator('#lista-productos > li').count(), 'los datos ya no están en la página').toBe(0);
  expect(await page.content()).not.toContain(catalogo.productos[0].codigo_interno);
  await hacerAdmin(revocable.id);
});

test('sesión vencida o inválida: vuelve al ingreso', async ({ page }) => {
  await page.goto(PANEL);
  await ingresar(page, admin);
  await expect(tablero(page)).toBeVisible();
  await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k));
    s.access_token = 'token-invalido';
    s.refresh_token = 'refresco-invalido';
    s.expires_at = Math.floor(Date.now() / 1000) - 60;
    localStorage.setItem(k, JSON.stringify(s));
  }, CLAVE_SESION);
  await page.reload();
  await expect(tituloIngreso(page)).toBeVisible();
  await expect(page.locator('#aviso-ingreso')).toHaveText('Tu sesión terminó. Vuelve a ingresar.');
  await expect(tablero(page)).toBeHidden();
});

test('cierre de sesión y conservación del carrito y la caché de la tienda', async ({ page }) => {
  await page.goto(PANEL);
  await page.evaluate(([c, ca]) => {
    localStorage.setItem('gama-talla-carrito-v3', JSON.stringify(c));
    localStorage.setItem('gama-talla-catalogo-cache', JSON.stringify(ca));
  }, [CARRITO, CACHE]);
  const antes = await page.evaluate(() => ({ carrito: localStorage.getItem('gama-talla-carrito-v3'), cache: localStorage.getItem('gama-talla-catalogo-cache') }));

  await ingresar(page, admin);
  await expect(tablero(page)).toBeVisible();
  const refresco = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).refresh_token, CLAVE_SESION);
  const clavesPanel = await page.evaluate(() => Object.keys(localStorage).filter((k) => !k.startsWith('gama-talla-carrito') && k !== 'gama-talla-catalogo-cache'));
  expect(clavesPanel.every((k) => k.startsWith('gama-talla-panel-sesion')), `el panel solo usa su clave: ${clavesPanel}`).toBe(true);

  // La tienda, en el mismo navegador, sigue consultando como visitante y conserva el carrito.
  const tienda = await page.context().newPage();
  const conToken = [];
  tienda.on('request', (r) => { const a = r.headers().authorization || ''; if (a.includes(refresco) || /eyJ/.test(a)) conToken.push(r.url()); });
  await tienda.goto(`${SITIO}/?intro=no`);
  await tienda.waitForFunction("typeof estado !== 'undefined' && estado.catalogoListo === true", null, { timeout: 30000 });
  expect(await tienda.evaluate(() => estado.carrito.length)).toBe(1);
  expect(conToken, 'la tienda no reutiliza la sesión del panel').toEqual([]);
  await tienda.close();

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(tituloIngreso(page)).toBeVisible();
  await expect(page.locator('#aviso-ingreso')).toHaveText('Cerraste la sesión en este dispositivo.');
  const despues = await page.evaluate(() => ({
    carrito: localStorage.getItem('gama-talla-carrito-v3'),
    cache: localStorage.getItem('gama-talla-catalogo-cache'),
    panel: Object.keys(localStorage).filter((k) => k.startsWith('gama-talla-panel-sesion'))
  }));
  expect(despues.panel, 'no queda sesión del panel').toEqual([]);
  expect(despues.carrito).toBe(antes.carrito);
  expect(despues.cache).toBe(antes.cache);

  // El token de refresco de esa sesión quedó revocado en el servidor.
  const e = entorno();
  const r = await fetch(`${e.api}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: { apikey: e.publicable, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refresco })
  });
  expect(r.status, 'el refresco ya no sirve').toBeGreaterThanOrEqual(400);
});

test('capturas del ingreso en los cinco anchos', async ({ page }) => {
  await page.goto(PANEL);
  await expect(tituloIngreso(page)).toBeVisible();
  for (const ancho of ANCHOS) {
    await page.setViewportSize({ width: ancho, height: 860 });
    const d = await revisarDisposicion(page);
    expect(d.desborde, `sin desborde horizontal a ${ancho}px`).toBe(0);
    expect(d.pequenos, `controles táctiles de al menos 40px a ${ancho}px`).toEqual([]);
    await page.screenshot({ path: path.join(CAPTURAS, `${test.info().project.name}-${ancho}-ingreso.png`) });
  }
});
