// @ts-check
/* Etapa 17 · Panel: público obligatorio con Unisex, historial ampliado y exportación a CSV.
 *
 * SOLO contra el stack local desechable de Supabase (con Storage) y la tienda servida en
 * 127.0.0.1:8765. Usuarios y productos FICTICIOS («MARCA DIECISIETE»), creados y borrados por cada
 * navegador. La configuración real del panel y de la tienda nunca se usa: se sustituye en cada
 * página (configurarPanel / abrirTienda).
 *
 *   npx playwright test tests/etapa17/panel.spec.js --workers=1
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  PANEL, SITIO, entorno, servicio, crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, configurarPanel, ingresar,
  limpiarRestosDePruebas, revisarDisposicion, borrarCatalogo
} from '../etapa16/ayudas-catalogo.js';

test.describe.configure({ mode: 'serial' });

const MARCA = 'MARCA DIECISIETE';
const CAPTURAS = path.join(process.env.TEMP || process.env.TMPDIR || '.', 'gama-talla-17-capturas');
const FOTO = 'assets/images/productos/editadas/zapatilla_01.webp';
let admin; let otra; let sufijo;

async function limpiar17() {
  const productos = await servicio('GET', `/rest/v1/productos?select=id,variantes(id)&marca=eq.${encodeURIComponent(MARCA)}`);
  if (productos.length) await borrarCatalogo({ productos, variantes: productos.flatMap((p) => p.variantes) });
  return productos.length;
}

test.beforeAll(async ({}, info) => {
  entorno();
  await limpiarRestosDePruebas();
  await limpiar17();
  sufijo = `${info.project.name}-${Date.now().toString(36)}`;
  admin = await crearUsuario(`panel17-${sufijo}@gamaytalla.test`);
  await hacerAdmin(admin.id);
  otra = await crearUsuario(`sinpermiso17-${sufijo}@gamaytalla.test`);
  fs.mkdirSync(CAPTURAS, { recursive: true });
});

test.afterAll(async () => {
  await limpiar17().catch(() => null);
  if (admin) { await quitarAdmin(admin.id).catch(() => null); await borrarUsuario(admin.id); }
  if (otra) await borrarUsuario(otra.id);
});

test.afterEach(async () => { await limpiar17(); });

// ---------------------------------------------------------------- ayudas
const editor = (page) => page.locator('#editor');
const resultado = (page) => page.locator('#editor-resultado');
const grupoPublico = (page) => editor(page).getByRole('group', { name: /Público en la tienda/ });
const radio = (page, texto) => grupoPublico(page).getByRole('radio', { name: texto, exact: true });

async function abrirPanel(page, usuario = admin) {
  const problemas = [];
  page.on('pageerror', (e) => problemas.push(`EXCEPCIÓN: ${e.message}`));
  await configurarPanel(page);
  await page.goto(PANEL);
  await ingresar(page, usuario);
  if (usuario === admin) {
    await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
    await expect(page.locator('#tablero')).not.toHaveAttribute('aria-busy', 'true');
  }
  return problemas;
}

async function rellenarNueva(page, nombre) {
  await page.getByRole('button', { name: 'Agregar zapatilla' }).first().click();
  await expect(editor(page)).toBeVisible();
  await editor(page).getByRole('textbox', { name: 'Modelo (obligatorio)', exact: true }).fill(nombre);
  await editor(page).getByRole('combobox', { name: 'Marca (obligatorio)', exact: true }).fill(MARCA);
  await editor(page).getByRole('combobox', { name: 'Categoría (obligatorio)', exact: true }).fill('Urbanas');
  const c = editor(page).locator('.editor-variante').first();
  await c.getByRole('textbox', { name: 'Color (obligatorio)', exact: true }).fill('Negro');
  await c.getByLabel('Precio actual (COP)').fill('250000');
  await c.getByLabel('Añadir talla').fill('40');
  await c.getByLabel('Añadir talla').press('Enter');
}

// Una zapatilla FICTICIA escrita con la clave de servicio local (sin pasar por el panel): así se
// simulan registros heredados, ocultos, retirados o sin colores.
async function insertar({ nombre, publico = null, activo = false, retirado = false, colores = [], categoria = 'URBANAS', referencia = null, marca = MARCA }) {
  const [p] = await servicio('POST', '/rest/v1/productos?select=id,codigo_interno,clave_catalogo', [{
    nombre, marca, categoria, publico, activo, referencia_proveedor: referencia,
    retirado_en: retirado ? new Date(Date.now() - 60e3).toISOString() : null
  }], 'return=representation');
  const variantes = [];
  for (const [i, c] of colores.entries()) {
    const [v] = await servicio('POST', '/rest/v1/variantes?select=id,codigo_variante', [{
      producto_id: p.id, color: c.color, precio: c.precio ?? 0, precio_anterior: c.anterior ?? 0, activa: c.activa ?? true, orden: i
    }], 'return=representation');
    if (c.foto) await servicio('POST', '/rest/v1/fotos', [{ variante_id: v.id, ruta: FOTO, orden: 0 }]);
    // Una a una: una inserción múltiple de PostgREST exige las mismas claves en todas las filas.
    const tallas = [];
    for (const t of c.tallas || []) tallas.push(...await servicio('POST', '/rest/v1/tallas?select=id,talla', [{ variante_id: v.id, ...t }], 'return=representation'));
    variantes.push({ ...v, tallas });
  }
  return { ...p, variantes };
}

async function abrirTienda(browser) {
  const e = entorno();
  const contexto = await browser.newContext({ locale: 'es-CO' });
  await contexto.route(`${SITIO}/config.js`, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await contexto.addInitScript((conf) => { window.GAMA_TALLA_CONFIG = conf; }, { supabaseUrl: e.api, clavePublicable: e.publicable });
  const pagina = await contexto.newPage();
  await pagina.goto(`${SITIO}/?intro=no`);
  await pagina.waitForFunction("typeof estado !== 'undefined' && estado.catalogoListo === true", null, { timeout: 30000 });
  return { contexto, pagina };
}

// Un CSV con «;» y comillas dobles (RFC 4180). Devuelve filas de celdas.
function leerCsv(texto) {
  const filas = []; let fila = []; let celda = ''; let comillas = false;
  for (let i = 0; i < texto.length; i += 1) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"' && texto[i + 1] === '"') { celda += '"'; i += 1; }
      else if (ch === '"') comillas = false;
      else celda += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === ';') { fila.push(celda); celda = ''; }
    else if (ch === '\r' && texto[i + 1] === '\n') { fila.push(celda); filas.push(fila); fila = []; celda = ''; i += 1; }
    else celda += ch;
  }
  if (celda || fila.length) { fila.push(celda); filas.push(fila); }
  return filas;
}

// =====================================================================
// 1. Público obligatorio con Unisex
// =====================================================================
test('Unisex: se guarda, sobrevive a la recarga y se ve en la tienda', async ({ page, browser, browserName }) => {
  await abrirPanel(page);
  const nombre = `Unisex ${sufijo}`;
  await rellenarNueva(page, nombre);
  // Al crear no hay ninguna opción marcada, y ya no existe «Dejar sin asignar».
  await expect(grupoPublico(page).getByRole('radio')).toHaveCount(3);
  for (const t of ['Hombre', 'Dama', 'Unisex']) await expect(radio(page, t)).not.toBeChecked();
  await expect(editor(page).getByRole('button', { name: 'Dejar sin asignar' })).toHaveCount(0);
  await expect(grupoPublico(page)).toContainText('(obligatorio)');
  await radio(page, 'Unisex').check();
  await editor(page).getByRole('button', { name: 'Guardar oculta' }).click();
  await expect(resultado(page)).toContainText('Guardado.');
  const [fila] = await servicio('GET', `/rest/v1/productos?select=id,publico,segmento&nombre=eq.${encodeURIComponent(nombre.toUpperCase())}`);
  expect(fila).toMatchObject({ publico: 'unisex', segmento: null });
  // Recarga completa de la página: la sesión sigue y el editor muestra Unisex marcado.
  await editor(page).getByRole('button', { name: 'Cerrar el editor' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
  await page.locator('.producto', { hasText: nombre.toUpperCase() }).getByRole('button', { name: /^Editar/ }).click();
  await expect(radio(page, 'Unisex')).toBeChecked();
  await expect(page.locator('#ed-publico-pendiente')).toBeHidden();
  await page.screenshot({ path: path.join(CAPTURAS, `editor-unisex-${browserName}.png`) });
  // Publicar (falta foto: lo dice el servidor) — y con foto, la tienda muestra «Unisex».
  await servicio('POST', '/rest/v1/fotos', [{ variante_id: (await servicio('GET', `/rest/v1/variantes?select=id&producto_id=eq.${fila.id}`))[0].id, ruta: FOTO, orden: 0 }]);
  await editor(page).getByRole('button', { name: 'Cerrar el editor' }).click();
  await page.locator('.producto', { hasText: nombre.toUpperCase() }).getByRole('button', { name: /^Editar/ }).click();
  await editor(page).getByRole('button', { name: 'Publicar' }).click();
  await expect(resultado(page)).toContainText('Publicada');
  const tienda = await abrirTienda(browser);
  const tarjeta = tienda.pagina.locator('article.tarjeta', { hasText: nombre.toUpperCase() });
  await expect(tarjeta.locator('.tarjeta-publico')).toHaveText(' · Unisex');
  await tarjeta.getByRole('button', { name: /^Ver detalles de/ }).click();
  await expect(tienda.pagina.locator('#modal-producto .detalle-publico')).toHaveText(' · Unisex');
  await tienda.contexto.close();
});

test('sin público no se guarda (tampoco oculta) ni se publica: error junto al grupo y foco en la primera opción', async ({ page, browserName }) => {
  await abrirPanel(page);
  const llamadas = [];
  page.on('request', (r) => { if (r.url().includes('/rpc/fn_admin_guardar_producto') || r.url().includes('/rpc/fn_admin_estado_producto')) llamadas.push(r.url()); });
  await rellenarNueva(page, `Sin público ${sufijo}`);
  for (const boton of ['Guardar oculta', 'Guardar y publicar']) {
    await editor(page).getByRole('button', { name: boton }).click();
    await expect(page.locator('#ed-publico-error'), boton).toBeVisible();
    await expect(page.locator('#ed-publico-error')).toHaveText('Elige el público en la tienda: Hombre, Dama o Unisex.');
    await expect(page.locator('#editor-error')).toContainText('Elige el público');
    await expect(radio(page, 'Hombre'), 'el foco va a la primera opción').toBeFocused();
    await expect(grupoPublico(page)).toHaveAttribute('aria-invalid', 'true');
  }
  expect(llamadas, 'no se envió nada al servidor').toEqual([]);
  for (const ancho of [390, 1440]) {
    await page.setViewportSize({ width: ancho, height: 900 });
    await grupoPublico(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(CAPTURAS, `editor-publico-error-${browserName}-${ancho}.png`) });
  }
  // Elegir una opción quita el error; entonces sí se guarda.
  await radio(page, 'Dama').check();
  await expect(page.locator('#ed-publico-error')).toBeHidden();
  await expect(grupoPublico(page)).not.toHaveAttribute('aria-invalid', 'true');
  await editor(page).getByRole('button', { name: 'Guardar oculta' }).click();
  await expect(resultado(page)).toContainText('Guardado.');
  expect(llamadas).toHaveLength(1);
});

test('heredados sin público: siguen en «Todos» de la tienda y el panel pide clasificarlos al guardar o publicar', async ({ page, browser }) => {
  const visible = await insertar({ nombre: `HEREDADA VISIBLE ${sufijo}`.toUpperCase(), activo: true,
    colores: [{ color: 'GRIS', precio: 180000, foto: true, tallas: [{ talla: '40' }] }] });
  const oculta = await insertar({ nombre: `HEREDADA OCULTA ${sufijo}`.toUpperCase(), activo: false,
    colores: [{ color: 'AZUL', precio: 180000, foto: true, tallas: [{ talla: '41' }] }] });
  // Tienda: visible en «Todos», sin etiqueta de público, con su identidad intacta.
  const tienda = await abrirTienda(browser);
  const tarjeta = tienda.pagina.locator(`article.tarjeta[data-id="${visible.clave_catalogo}"]`);
  await expect(tarjeta).toBeVisible();
  await expect(tarjeta.locator('.tarjeta-publico')).toHaveCount(0);
  expect(await tienda.pagina.evaluate(() => estado.publico)).toBe('Todos');
  await tienda.contexto.close();

  await abrirPanel(page);
  // Editar sin clasificar: aviso visible, ninguna opción marcada y «Guardar cambios» bloqueado.
  await page.locator('.producto', { hasText: `HEREDADA VISIBLE ${sufijo}`.toUpperCase() }).getByRole('button', { name: /^Editar/ }).click();
  await expect(page.locator('#ed-publico-pendiente')).toBeVisible();
  await expect(page.locator('#ed-publico-pendiente')).toContainText('todavía no tiene público');
  await editor(page).getByRole('textbox', { name: 'Modelo (obligatorio)', exact: true }).fill(`HEREDADA VISIBLE ${sufijo} B`);
  await editor(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.locator('#ed-publico-error')).toBeVisible();
  await expect(radio(page, 'Hombre')).toBeFocused();
  await radio(page, 'Unisex').check();
  await editor(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(resultado(page)).toContainText('Guardado.');
  let [fila] = await servicio('GET', `/rest/v1/productos?select=publico,clave_catalogo,codigo_interno&id=eq.${visible.id}`);
  expect(fila, 'clasificado sin perder su identidad ni su código').toEqual({ publico: 'unisex', clave_catalogo: visible.clave_catalogo, codigo_interno: visible.codigo_interno });
  await editor(page).getByRole('button', { name: 'Cerrar el editor' }).click();

  // Oculta sin clasificar: «Publicar» también lo pide.
  await page.locator('.producto', { hasText: `HEREDADA OCULTA ${sufijo}`.toUpperCase() }).getByRole('button', { name: /^Editar/ }).click();
  await editor(page).getByRole('button', { name: 'Publicar' }).click();
  await expect(page.locator('#ed-publico-error')).toBeVisible();
  [fila] = await servicio('GET', `/rest/v1/productos?select=activo,publico&id=eq.${oculta.id}`);
  expect(fila).toEqual({ activo: false, publico: null });
  await radio(page, 'Hombre').check();
  await editor(page).getByRole('button', { name: 'Guardar y publicar' }).click();
  await expect(resultado(page)).toContainText('Publicada');
  [fila] = await servicio('GET', `/rest/v1/productos?select=activo,publico&id=eq.${oculta.id}`);
  expect(fila).toEqual({ activo: true, publico: 'hombre' });
});

test('servidor sin la migración de Unisex: conserva el formulario y explica el error', async ({ page }) => {
  await abrirPanel(page);
  // Se simula la respuesta de la función 16.3 (anterior a 20261109010000) ante «unisex».
  await page.route('**/rpc/fn_admin_guardar_producto*', (r) => r.fulfill({ status: 400, contentType: 'application/json',
    body: JSON.stringify({ code: 'PT422', message: 'El público debe ser Hombre o Dama, o quedar sin asignar.', details: null, hint: null }) }));
  const nombre = `Sin migración ${sufijo}`;
  await rellenarNueva(page, nombre);
  await radio(page, 'Unisex').check();
  await editor(page).getByRole('button', { name: 'Guardar oculta' }).click();
  await expect(page.locator('#editor-error')).toContainText('Este servidor todavía no admite «Unisex»: falta aplicar la migración 20261109010000_publico_unisex.');
  await expect(page.locator('#editor-error')).toContainText('tus datos siguen en el formulario');
  await expect(page.locator('#ed-publico-error')).toContainText('falta aplicar la migración');
  await expect(radio(page, 'Unisex'), 'el formulario se conserva').toBeChecked();
  await expect(editor(page).getByRole('textbox', { name: 'Modelo (obligatorio)', exact: true })).toHaveValue(nombre.toUpperCase());
  await expect(editor(page)).toBeVisible();
  expect(await servicio('GET', `/rest/v1/productos?select=id&marca=eq.${encodeURIComponent(MARCA)}`)).toEqual([]);
});

// =====================================================================
// 2. Historial: zapatillas, colores y tallas
// =====================================================================
async function prepararHistorial() {
  // 1 zapatilla + 2 colores + 30 tallas = 33 altas (más que una página de 25), luego cambios.
  const p = await insertar({ nombre: `HISTORIAL ${sufijo}`.toUpperCase(), publico: 'dama', colores: [
    { color: 'ROJO', precio: 250000, tallas: Array.from({ length: 15 }, (_, i) => ({ talla: String(30 + i) })) },
    { color: 'VERDE', precio: 250000, tallas: Array.from({ length: 15 }, (_, i) => ({ talla: String(30 + i) })) }
  ] });
  await servicio('PATCH', `/rest/v1/productos?id=eq.${p.id}`, { publico: 'unisex', categoria: 'RUNNING' });
  await servicio('PATCH', `/rest/v1/variantes?id=eq.${p.variantes[1].id}`, { precio: 199000, activa: false });
  return p;
}

test('historial: filtros, paginación por id descendente, antes → ahora, autor y operación', async ({ page, browserName }) => {
  const p = await prepararHistorial();
  await abrirPanel(page);
  // Un cambio del panel (autor = esta cuenta): el precio del color ROJO, en una sola operación.
  await page.locator('.producto', { hasText: `HISTORIAL ${sufijo}`.toUpperCase() }).getByRole('button', { name: /^Editar/ }).click();
  await editor(page).locator('.editor-variante').first().getByLabel('Precio actual (COP)').fill('230000');
  await editor(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(resultado(page)).toContainText('Guardado.');
  await editor(page).getByRole('button', { name: 'Cerrar el editor' }).click();

  await page.locator('#boton-historial').click();
  const items = page.locator('#historial-lista .historial-item');
  await expect(items).toHaveCount(25);
  await expect(page.getByRole('heading', { name: 'Historial de cambios' })).toBeVisible();
  await expect(page.locator('#historial [data-historial-filtro="todos"]')).toHaveAttribute('aria-pressed', 'true');
  // El más reciente: el guardado del panel (zapatilla y color, misma operación, autor «Tú»).
  const primero = items.nth(0);
  const segundo = items.nth(1);
  const tablas = [await primero.getAttribute('data-tabla'), await segundo.getAttribute('data-tabla')].sort();
  expect(tablas).toEqual(['productos', 'variantes']);
  const color = items.filter({ has: page.locator('.historial-tipo', { hasText: 'Color' }) }).first();
  await expect(color).toContainText(`HISTORIAL ${sufijo}`.toUpperCase() + ' · ROJO');
  await expect(color).toContainText('Precio: $ 250.000 → $ 230.000');
  await expect(color.locator('.historial-quien')).toHaveText('Tú');
  expect(await primero.getAttribute('data-lote')).toBe(await segundo.getAttribute('data-lote'));
  await expect(segundo).toHaveClass(/historial-mismo-lote/);
  await expect(segundo.locator('.historial-lote')).toHaveText('misma operación');
  await expect(primero.locator('.historial-lote')).toHaveText(/^operación [0-9a-f]{8}$/);
  // Cambios hechos por mantenimiento (sin autor): público y categoría, precio y visibilidad.
  await expect(page.locator('#historial-lista')).toContainText('Público: Dama → Unisex');
  await expect(page.locator('#historial-lista')).toContainText('Categoría: URBANAS → RUNNING');
  await expect(page.locator('#historial-lista')).toContainText('Precio: $ 250.000 → $ 199.000');
  await expect(page.locator('#historial-lista')).toContainText('Color oculto en la tienda');
  await expect(page.locator('#historial-lista .historial-quien', { hasText: 'Sistema o mantenimiento' }).first()).toBeVisible();
  // Fecha y hora de Colombia, con el instante exacto en datetime.
  const fecha = await primero.locator('time').evaluate((n) => ({ texto: n.textContent, iso: n.dateTime }));
  const esperado = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(fecha.iso));
  // Cada motor usa su propio espacio fino en «a. m.» (U+00A0 o U+202F): se comparan normalizados.
  expect(fecha.texto.replace(/\s+/g, ' ')).toBe(esperado.replace(/\s+/g, ' '));

  // Paginación: la segunda página continúa por id descendente, sin repetir.
  await page.getByRole('button', { name: 'Ver cambios anteriores' }).click();
  await expect.poll(() => items.count()).toBeGreaterThan(25);
  const ids = (await items.evaluateAll((n) => n.map((x) => Number(x.dataset.id))));
  expect(ids).toEqual([...ids].sort((a, b) => b - a));
  expect(new Set(ids).size).toBe(ids.length);

  // Filtros: cada uno reinicia la lista y muestra solo su tipo.
  for (const [boton, tabla] of [['Colores', 'variantes'], ['Zapatillas', 'productos'], ['Tallas', 'tallas']]) {
    await page.locator('#historial').getByRole('button', { name: boton, exact: true }).click();
    await expect(page.locator('#historial').getByRole('button', { name: boton, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#historial-estado')).toContainText(`(${boton.toLowerCase()})`);
    const tablasVistas = await items.evaluateAll((n) => [...new Set(n.map((x) => x.dataset.tabla))]);
    expect(tablasVistas, boton).toEqual([tabla]);
    const idsFiltro = await items.evaluateAll((n) => n.map((x) => Number(x.dataset.id)));
    const maximo = (await servicio('GET', `/rest/v1/historial?select=id&tabla=eq.${tabla}&order=id.desc&limit=1`))[0].id;
    expect(idsFiltro[0], `${boton}: empieza por el más reciente (paginación reiniciada)`).toBe(maximo);
    expect(idsFiltro.length).toBeLessThanOrEqual(25);
  }
  await page.locator('#historial').getByRole('button', { name: 'Tallas', exact: true }).click();
  await expect(items.first()).toContainText(/talla \d+/);
  await expect(items.first()).toContainText(/Talla \d+ registrada como por revisar/);
  await page.locator('#historial').getByRole('button', { name: 'Todos', exact: true }).click();
  // Un registro que ya no está en el tablero se describe con los datos del evento.
  await servicio('DELETE', `/rest/v1/tallas?variante_id=eq.${p.variantes[1].id}`);
  await servicio('DELETE', `/rest/v1/variantes?id=eq.${p.variantes[1].id}`);
  await page.locator('#boton-actualizar').click();
  await expect(page.locator('#tablero')).not.toHaveAttribute('aria-busy', 'true');
  await page.locator('#historial').getByRole('button', { name: 'Colores', exact: true }).click();
  await expect(page.locator('#historial-lista')).toContainText('VERDE');
  await expect(page.locator('#historial-lista')).toContainText(/Color eliminado por mantenimiento/);
  await page.screenshot({ path: path.join(CAPTURAS, `historial-${browserName}-1440.png`), fullPage: true });
});

test('historial: respuestas tardías de un filtro anterior o de una sesión cerrada se descartan', async ({ page }) => {
  await prepararHistorial();
  await abrirPanel(page);
  await page.locator('#boton-historial').click();
  await expect(page.locator('#historial-lista .historial-item').first()).toBeVisible();
  // «Zapatillas» tarda; antes de que llegue se elige «Colores»: solo se pintan colores.
  let retenida = null;
  await page.route(/\/rest\/v1\/historial\?.*tabla=in\.%28productos%29|\/rest\/v1\/historial\?.*tabla=in\.\(productos\)/, async (r) => {
    retenida = r;
    await new Promise((fin) => setTimeout(fin, 1500));
    await r.continue().catch(() => null);
  });
  await page.locator('#historial').getByRole('button', { name: 'Zapatillas', exact: true }).click();
  await expect.poll(() => retenida !== null).toBe(true);
  await page.locator('#historial').getByRole('button', { name: 'Colores', exact: true }).click();
  await expect(page.locator('#historial-estado')).toContainText('(colores)');
  await page.waitForTimeout(2000);
  const tablas = await page.locator('#historial-lista .historial-item').evaluateAll((n) => [...new Set(n.map((x) => x.dataset.tabla))]);
  expect(tablas, 'la respuesta tardía de «Zapatillas» no se mezcla').toEqual(['variantes']);
  await expect(page.locator('#historial-estado')).toContainText('(colores)');

  // Sesión cerrada mientras una página está en camino: no se pinta nada.
  await page.unroute(/historial/);
  await page.route(/\/rest\/v1\/historial\?/, async (r) => { await new Promise((fin) => setTimeout(fin, 1500)); await r.continue().catch(() => null); });
  await page.locator('#historial').getByRole('button', { name: 'Tallas', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar sesión' }).first().click();
  await expect(page.locator('#aviso-ingreso')).toHaveText('Cerraste la sesión en este dispositivo.');
  await page.waitForTimeout(2000);
  await expect(page.locator('#historial-lista .historial-item')).toHaveCount(0);
  await expect(page.locator('#vista-tablero')).toBeHidden();
});

test('historial en celular: legible, sin desbordes y con controles de 40 px', async ({ page, browserName }) => {
  await prepararHistorial();
  await abrirPanel(page);
  await page.locator('#boton-historial').click();
  await expect(page.locator('#historial-lista .historial-item')).toHaveCount(25);
  for (const ancho of [360, 390]) {
    await page.setViewportSize({ width: ancho, height: 800 });
    await page.locator('#historial').scrollIntoViewIfNeeded();
    const d = await revisarDisposicion(page);
    expect(d.desborde, `${ancho}px sin desborde`).toBe(0);
    expect(d.fuera, `${ancho}px nada fuera de la pantalla`).toBe(0);
    const pequenos = d.pequenos.filter((p) => !p.startsWith('input#correo') && !p.startsWith('input#clave'));
    expect(pequenos, `${ancho}px controles ≥ 40 px`).toEqual([]);
    const legible = await page.locator('#historial-lista .historial-item').first().evaluate((n) => ({
      cambios: parseFloat(getComputedStyle(n.querySelector('.historial-cambios')).fontSize),
      meta: parseFloat(getComputedStyle(n.querySelector('.historial-meta')).fontSize)
    }));
    expect(legible.cambios).toBeGreaterThanOrEqual(14);
    expect(legible.meta).toBeGreaterThanOrEqual(12);
    await page.screenshot({ path: path.join(CAPTURAS, `historial-${browserName}-${ancho}.png`) });
  }
});

// =====================================================================
// 3. Exportación del catálogo a CSV
// =====================================================================
const COLUMNAS = ['Código zapatilla', 'Modelo', 'Marca', 'Categoría', 'Público', 'Referencia proveedor', 'Estado en la tienda',
  'Código color', 'Color', 'Referencia proveedor color', 'Color visible', 'Precio (COP)', 'Precio anterior (COP)',
  'Talla EU', 'Talla activa', 'Disponibilidad guardada', 'Disponibilidad en la tienda', 'Procedencia',
  'Vigencia desde (hora Colombia)', 'Vence (hora Colombia)', 'Vigencia (horas)'];

test('exportar: CSV completo (oculto, retirado, sin colores, sin tallas), escapado y protegido contra fórmulas', async ({ page, browserName }) => {
  const hace1h = new Date(Date.now() - 3600e3).toISOString();
  const publicada = await insertar({ nombre: `CSV ; "COMILLAS" ${sufijo}`.toUpperCase(), publico: 'unisex', activo: true, referencia: 'REF\nDOS LÍNEAS',
    colores: [
      { color: 'NEGRO', precio: 250000, anterior: 290000, foto: true, tallas: [
        { talla: '40', estado: 'CONFIRMADA', vigencia_desde: hace1h, origen: 'proveedor' }, { talla: '40,5' }, { talla: '42', activa: false }] },
      { color: 'SIN TALLAS', precio: 0, activa: false }
    ] });
  const heredada = await insertar({ nombre: `=SUMA(1;2) ${sufijo}`.toUpperCase(), marca: MARCA });
  const retirada = await insertar({ nombre: `RETIRADA ${sufijo}`.toUpperCase(), publico: 'dama', retirado: true,
    colores: [{ color: 'ROSA', precio: 99000, tallas: [{ talla: '37', estado: 'AGOTADA' }] }] });
  await abrirPanel(page);
  const [descarga] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar catálogo' }).click()]);
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  expect(descarga.suggestedFilename()).toBe(`gama-talla-catalogo-${hoy}.csv`);
  const bytes = fs.readFileSync(await descarga.path());
  expect([...bytes.subarray(0, 3)], 'UTF-8 con BOM').toEqual([0xef, 0xbb, 0xbf]);
  const texto = bytes.toString('utf8').slice(1);
  expect(texto.endsWith('\r\n')).toBe(true);
  const [cabecera, ...filas] = leerCsv(texto);
  expect(cabecera).toEqual(COLUMNAS);
  for (const f of filas) expect(f).toHaveLength(COLUMNAS.length);
  const col = Object.fromEntries(COLUMNAS.map((c, i) => [c, i]));
  const de = (codigo) => filas.filter((f) => f[col['Código zapatilla']] === codigo);
  // Publicada: 3 tallas del color NEGRO + 1 fila del color sin tallas.
  const p = de(publicada.codigo_interno);
  expect(p).toHaveLength(4);
  expect(p[0][col.Modelo], 'punto y coma y comillas escapados').toBe(`CSV ; "COMILLAS" ${sufijo}`.toUpperCase());
  expect(p[0][col['Referencia proveedor']], 'salto de línea conservado').toBe('REF\nDOS LÍNEAS');
  expect(p[0][col['Público']]).toBe('Unisex');
  expect(p[0][col['Estado en la tienda']]).toBe('Publicada');
  const t40 = p.find((f) => f[col['Talla EU']] === '40');
  expect(t40[col['Precio (COP)']]).toBe('250000');
  expect(t40[col['Precio anterior (COP)']]).toBe('290000');
  expect(t40[col['Disponibilidad guardada']]).toBe('Confirmada');
  expect(t40[col['Disponibilidad en la tienda']]).toBe('Disponible');
  expect(t40[col['Vigencia (horas)']]).toBe('48');
  expect(t40[col['Vigencia desde (hora Colombia)']]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  expect(p.find((f) => f[col['Talla EU']] === '40,5')[col['Disponibilidad en la tienda']]).toBe('Por revisar');
  expect(p.find((f) => f[col['Talla EU']] === '42')[col['Talla activa']]).toBe('No');
  const sinTallas = p.find((f) => f[col.Color] === 'SIN TALLAS');
  expect(sinTallas[col['Color visible']]).toBe('No');
  expect(sinTallas[col['Talla EU']]).toBe('');
  expect(sinTallas[col['Precio (COP)']]).toBe('0');
  // Heredada sin colores ni público: una fila, columnas de color vacías, y fórmula neutralizada.
  const h = de(heredada.codigo_interno);
  expect(h).toHaveLength(1);
  expect(h[0][col.Modelo], 'protegida contra fórmulas').toBe(`'=SUMA(1;2) ${sufijo}`.toUpperCase());
  expect(h[0][col['Público']]).toBe('Sin clasificar');
  expect(h[0][col['Estado en la tienda']]).toBe('Oculta');
  expect(h[0].slice(col['Código color'])).toEqual(Array(COLUMNAS.length - col['Código color']).fill(''));
  // Retirada: aparece, con su talla agotada.
  const r = de(retirada.codigo_interno);
  expect(r).toHaveLength(1);
  expect(r[0][col['Estado en la tienda']]).toBe('Retirada');
  expect(r[0][col['Público']]).toBe('Dama');
  expect(r[0][col['Disponibilidad guardada']]).toBe('Agotada');
  expect(r[0][col['Disponibilidad en la tienda']]).toBe('No visible en la tienda');
  await expect(page.locator('#resultado-accion')).toContainText('Catálogo exportado');
  await expect(page.locator('#resultado-accion')).toContainText('6 filas con 3 zapatillas');
  fs.copyFileSync(await descarga.path(), path.join(CAPTURAS, `catalogo-${browserName}.csv`));
});

test('exportar: si falla una lectura no se descarga nada, y sin permiso no se exporta', async ({ page }) => {
  await insertar({ nombre: `FALLO ${sufijo}`.toUpperCase(), publico: 'hombre', colores: [{ color: 'NEGRO', precio: 1000, tallas: [{ talla: '40' }] }] });
  await abrirPanel(page);
  let descargas = 0;
  page.on('download', () => { descargas += 1; });
  await page.route('**/rest/v1/catalogo_publico*', (r) => r.abort('internetdisconnected'));
  await page.getByRole('button', { name: 'Exportar catálogo' }).click();
  // postgrest-js reintenta tres veces una lectura ante un fallo de red: el aviso llega tras los reintentos.
  await expect(page.locator('#resultado-accion')).toContainText('No se pudo exportar el catálogo', { timeout: 30000 });
  await expect(page.locator('#resultado-accion')).toContainText('No se descargó ningún archivo');
  await expect(page.getByRole('button', { name: 'Exportar catálogo' })).toBeEnabled();
  await page.unroute('**/rest/v1/catalogo_publico*');
  // Permiso retirado: al exportar se comprueba otra vez y el panel lo deniega.
  await quitarAdmin(admin.id);
  try {
    await page.getByRole('button', { name: 'Exportar catálogo' }).click();
    await expect(page.getByRole('heading', { name: 'Esta cuenta no tiene acceso al panel' })).toBeVisible();
  } finally {
    await hacerAdmin(admin.id);
  }
  await page.waitForTimeout(500);
  expect(descargas).toBe(0);
});

test('acceso: una cuenta sin permiso no ve el tablero y el historial le devuelve cero filas', async ({ page }) => {
  await prepararHistorial();
  await abrirPanel(page, otra);
  await expect(page.getByRole('heading', { name: 'Esta cuenta no tiene acceso al panel' })).toBeVisible();
  await expect(page.locator('#boton-exportar')).toBeHidden();
  await expect(page.locator('#historial')).toBeHidden();
  // Directamente contra la API con su sesión: el RLS no le entrega el historial.
  const e = entorno();
  const sesion = await (await fetch(`${e.api}/auth/v1/token?grant_type=password`, { method: 'POST',
    headers: { apikey: e.publicable, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: otra.correo, password: otra.clave }) })).json();
  const r = await fetch(`${e.api}/rest/v1/historial?select=id&limit=5`, { headers: { apikey: e.publicable, Authorization: `Bearer ${sesion.access_token}` } });
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual([]);
  const anon = await fetch(`${e.api}/rest/v1/historial?select=id&limit=5`, { headers: { apikey: e.publicable } });
  expect([401, 403]).toContain(anon.status);
});
