// @ts-check
/* Etapa 22 · «Publicar» y «Ocultar» desde la tarjeta de cada modelo en el tablero.
 *
 * SOLO contra el Supabase LOCAL y el entorno aislado (SITIO=http://127.0.0.1:8770); catálogo FICTICIO de la
 * marca «MARCA ESTADO T22». Escribe únicamente por fn_admin_estado_producto (la vía del editor): se comprueba
 * el resultado guardado, el catálogo público, que tallas/vigencias/otros modelos no cambian, el doble clic, el
 * conflicto de versión, la respuesta perdida, la posición, el filtro, el teclado y el celular.
 *
 *   SITIO=http://127.0.0.1:8770 npx playwright test tests/etapa22/estado-producto.spec.js --workers=1
 */
import { test, expect } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { entorno, servicio, crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, configurarPanel, ingresar, revisarDisposicion } from '../etapa15/ayudas-panel.js';
import {
  MARCA, borrarTodo22, crearCatalogo22, productoDB, productosDB, tallasDB, variantesDB, fotosDB, historialProducto, codigosPublicos
} from './ayudas22.js';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180000);

const SITIO = process.env.SITIO || 'http://127.0.0.1:8770';
const CAPTURAS = path.join(os.tmpdir(), 'gama-talla-22-estado');
const RED = /Failed to load resource|net::ERR|internetdisconnected|Failed to fetch|NetworkError|Load failed|access control checks|NS_ERROR|connection|Cross-Origin Request Blocked|CORS request did not succeed/i;
const AVISO_CAPTURA_WEBKIT = "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.";
let admin; let cat; let problemas = [];

test.beforeAll(async ({}, info) => {
  entorno();
  await borrarTodo22();
  admin = await crearUsuario(`panel22-estado-${info.project.name}-${Date.now().toString(36)}@gamaytalla.test`);
  await hacerAdmin(admin.id);
  fs.mkdirSync(CAPTURAS, { recursive: true });
});
test.afterAll(async () => {
  await borrarTodo22().catch(() => null);
  if (admin) { await quitarAdmin(admin.id).catch(() => null); await borrarUsuario(admin.id); }
});
test.beforeEach(async () => { await borrarTodo22(); cat = await crearCatalogo22(); });
test.afterEach(async () => { await borrarTodo22(); });

// ---------------------------------------------------------------- ayudas
const buscar = (page) => page.getByLabel('Buscar por código interno, referencia, marca o modelo');
const tarjeta = (page, nombre) => page.locator('#lista-productos > li').filter({ has: page.getByRole('heading', { name: nombre, exact: true }) });
const botonEstado = (page, nombre) => tarjeta(page, nombre).locator('[data-accion="estado-producto"]');
const aviso = (page, nombre) => tarjeta(page, nombre).locator('.producto-aviso');
const estadoDe = (page, nombre) => tarjeta(page, nombre).locator('.producto-estado');
const editor = (page) => page.locator('#editor');
const talla = (page, nombre, t) => tarjeta(page, nombre).locator(`.talla[data-talla-id="${idTalla(nombre, t)}"]`);
const idTalla = (nombre, t) => {
  const clave = nombre === 'T22 OCULTO VALIDO' || nombre === 'T22 PUBLICADO' || nombre === 'T22 SOLO OCULTO' || nombre === 'T22 RETIRADO' || nombre === 'T22 INCOMPLETO' ? nombre : `r${nombre.replace('T22 RELLENO ', '')}`;
  return cat.tallas.find((x) => x.variante_id === cat.variantes[clave].id && x.talla === t).id;
};

async function abrirTablero(page, { ancho = 1280, alto = 800 } = {}) {
  problemas = [];
  await page.setViewportSize({ width: ancho, height: alto });
  page.on('pageerror', (e) => problemas.push(`EXCEPCIÓN: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !RED.test(m.text())) problemas.push(m.text()); });
  await configurarPanel(page);
  await page.goto(`${SITIO}/admin/`);
  await ingresar(page, admin);
  await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
  await expect(page.locator('#tablero')).not.toHaveAttribute('aria-busy', 'true');
  await buscar(page).fill('T22');
  // «Todas» no incluye los retirados (solo salen en su filtro): 13 de los 14 modelos.
  await expect(page.locator('#tablero-estado')).toContainText('13 de 14');
  await expect(page.locator('#lista-productos > li')).toHaveCount(13);
}
async function capturar(page, browserName, nombre) {
  const desde = problemas.length;
  await page.screenshot({ path: path.join(CAPTURAS, `${nombre}-${browserName}.png`) });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  const i = problemas.indexOf(AVISO_CAPTURA_WEBKIT, desde);
  if (browserName === 'webkit' && i >= 0) problemas.splice(i, 1);
}
// Pone un modelo hacia la mitad de la pantalla y registra el desplazamiento mínimo mientras se trabaja.
async function situar(page, nombre) {
  await tarjeta(page, nombre).evaluate((n) => {
    window.scrollTo(0, window.scrollY + n.getBoundingClientRect().top - window.innerHeight * 0.35);
    const w = /** @type {any} */ (window);
    w.__minY = window.scrollY;
    if (!w.__vigia) { w.__vigia = () => { w.__minY = Math.min(w.__minY, window.scrollY); }; window.addEventListener('scroll', w.__vigia); }
  });
  await page.waitForTimeout(150);
}
const posicion = (page, nombre) => tarjeta(page, nombre).evaluate((n) => ({ top: Math.round(n.getBoundingClientRect().top), y: Math.round(window.scrollY), minY: Math.round(/** @type {any} */ (window).__minY ?? -1) }));

// Instantánea de lo que NO debe cambiar al publicar u ocultar: tallas (todas las columnas), colores, fotos y los demás modelos.
async function instantanea(excepto) {
  const otros = (await productosDB()).filter((p) => p.id !== excepto);
  return { tallas: await tallasDB(cat.idsVariantes), variantes: await variantesDB(cat.idsVariantes), fotos: await fotosDB(cat.idsVariantes), otros };
}
async function soloCambio(antes, excepto) {
  const despues = await instantanea(excepto);
  expect(despues.tallas, 'ninguna talla cambia (estado, activa, vigencias, marcas de actualización)').toEqual(antes.tallas);
  expect(despues.variantes, 'los colores no cambian').toEqual(antes.variantes);
  expect(despues.fotos, 'las fotos no cambian').toEqual(antes.fotos);
  expect(despues.otros, 'los demás modelos no cambian').toEqual(antes.otros);
}
const nombresPublicos = async () => (await codigosPublicos()).map((x) => x.nombre);

// ======================================================================== 1. publicar y ocultar desde la tarjeta
test('publicar un modelo oculto válido y volver a ocultarlo desde su tarjeta, sin abrir el editor; se conservan posición, búsqueda, filtro y selección', async ({ page, browserName }) => {
  const id = cat.productos['T22 OCULTO VALIDO'].id;
  expect(await nombresPublicos()).not.toContain('T22 OCULTO VALIDO');
  await abrirTablero(page);
  // Los tres controles de la fila, en este orden: Editar, Publicar, Seleccionar tallas.
  const filaBotones = tarjeta(page, 'T22 OCULTO VALIDO').locator('.producto-botones');
  expect(await filaBotones.locator('button').allInnerTexts()).toEqual(['Editar', 'Publicar', 'Seleccionar tallas']);
  await expect(estadoDe(page, 'T22 OCULTO VALIDO')).toHaveText('Oculto en la tienda');
  // Una talla de otro modelo seleccionada, la búsqueda «T22» y el filtro «Todas»: deben quedar como están.
  await talla(page, 'T22 RELLENO 1', '38').click();
  await expect(page.locator('#seleccion-resumen')).toContainText('1 talla seleccionada');
  await situar(page, 'T22 OCULTO VALIDO');
  const antes = await posicion(page, 'T22 OCULTO VALIDO');
  const snap = await instantanea(id);
  const versionAntes = (await productoDB(id)).version;

  await botonEstado(page, 'T22 OCULTO VALIDO').click();
  await expect(estadoDe(page, 'T22 OCULTO VALIDO')).toHaveText('Publicado en la tienda');
  await expect(botonEstado(page, 'T22 OCULTO VALIDO')).toHaveText('Ocultar');
  await expect(botonEstado(page, 'T22 OCULTO VALIDO')).toBeEnabled();
  await expect(editor(page)).not.toBeVisible();
  await expect(aviso(page, 'T22 OCULTO VALIDO')).toContainText('Publicado: ya se ve en la tienda. Sus tallas, su disponibilidad y sus fechas no cambiaron.');
  await expect(page.locator('#anuncio-producto')).toContainText('Publicado: ya se ve en la tienda.');
  await expect(page.locator('#resultado-accion')).toBeHidden(); // sin aviso fijo
  // Posición, búsqueda, filtro y selección intactos; el foco sigue en el botón del modelo.
  const despues = await posicion(page, 'T22 OCULTO VALIDO');
  expect(Math.abs(despues.top - antes.top)).toBeLessThanOrEqual(2);
  expect(Math.abs(despues.y - antes.y)).toBeLessThanOrEqual(2);
  expect(despues.minY, 'no se mandó al comienzo de la página').toBeGreaterThanOrEqual(antes.y - 4);
  await expect(buscar(page)).toHaveValue('T22');
  await expect(page.locator('#filtros').getByRole('button', { name: /^Todas/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(talla(page, 'T22 RELLENO 1', '38')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#seleccion-resumen')).toContainText('1 talla seleccionada');
  await expect(botonEstado(page, 'T22 OCULTO VALIDO')).toBeFocused();
  await capturar(page, browserName, 'estado-publicado-1280');
  // Guardado: publicado (una sola versión más, con su operación); tallas, vigencias y demás modelos igual; la tienda ya lo ve.
  const p1 = await productoDB(id);
  expect(p1).toMatchObject({ activo: true, retirado_en: null });
  expect(p1.version).toBe(versionAntes + 1);
  expect(p1.ultima_operacion).toMatch(/^[0-9a-f-]{36}$/);
  await soloCambio(snap, id);
  expect(await nombresPublicos()).toContain('T22 OCULTO VALIDO');

  // Ocultarlo desde la misma tarjeta.
  await botonEstado(page, 'T22 OCULTO VALIDO').click();
  await expect(estadoDe(page, 'T22 OCULTO VALIDO')).toHaveText('Oculto en la tienda');
  await expect(botonEstado(page, 'T22 OCULTO VALIDO')).toHaveText('Publicar');
  await expect(aviso(page, 'T22 OCULTO VALIDO')).toContainText('Oculto: ya no se ve en la tienda. Sus tallas, su disponibilidad y sus fechas no cambiaron.');
  const p2 = await productoDB(id);
  expect(p2).toMatchObject({ activo: false });
  expect(p2.version).toBe(versionAntes + 2);
  expect(p2.ultima_operacion).not.toBe(p1.ultima_operacion);
  await soloCambio(snap, id); // ocultar conserva colores, fotos, tallas, precios y fechas, y no marca nada como agotado
  expect(await nombresPublicos()).not.toContain('T22 OCULTO VALIDO');
  await expect(talla(page, 'T22 RELLENO 1', '38')).toHaveAttribute('aria-pressed', 'true');
  expect(problemas).toEqual([]);
});

// ======================================================================== 2. publicación incompleta y retirados
test('una publicación incompleta se rechaza con su motivo en la tarjeta, sigue oculta y no cambia nada; un retirado no lleva botón', async ({ page }) => {
  const id = cat.productos['T22 INCOMPLETO'].id;
  await abrirTablero(page);
  await situar(page, 'T22 INCOMPLETO');
  const antes = await posicion(page, 'T22 INCOMPLETO');
  const snap = await instantanea(id);
  const antesProducto = await productoDB(id);
  await botonEstado(page, 'T22 INCOMPLETO').click();
  await expect(aviso(page, 'T22 INCOMPLETO')).toContainText('Para publicarla falta: el público en la tienda (Hombre, Dama o Unisex), una foto en un color visible.');
  await expect(aviso(page, 'T22 INCOMPLETO')).toContainText('El modelo sigue oculto. No se completó ni se activó nada.');
  await expect(estadoDe(page, 'T22 INCOMPLETO')).toHaveText('Oculto en la tienda');
  await expect(botonEstado(page, 'T22 INCOMPLETO')).toHaveText('Publicar');
  await expect(botonEstado(page, 'T22 INCOMPLETO')).toBeEnabled();
  await expect(page.locator('#anuncio-producto')).toContainText('Para publicarla falta');
  const despues = await posicion(page, 'T22 INCOMPLETO');
  expect(Math.abs(despues.top - antes.top)).toBeLessThanOrEqual(2);
  expect(Math.abs(despues.y - antes.y)).toBeLessThanOrEqual(2);
  expect(await productoDB(id)).toEqual(antesProducto); // ni versión ni operación
  await soloCambio(snap, id);
  expect(await nombresPublicos()).not.toContain('T22 INCOMPLETO');
  // El aviso se puede cerrar; el modelo retirado no ofrece publicar ni restaurar.
  await aviso(page, 'T22 INCOMPLETO').getByRole('button', { name: 'Cerrar aviso' }).click();
  await expect(aviso(page, 'T22 INCOMPLETO')).toHaveCount(0);
  await page.locator('#filtros').getByRole('button', { name: /^Retiradas/ }).click();
  await expect(estadoDe(page, 'T22 RETIRADO')).toHaveText('Retirado del catálogo');
  await expect(botonEstado(page, 'T22 RETIRADO')).toHaveCount(0);
  expect(await tarjeta(page, 'T22 RETIRADO').locator('.producto-botones button').allInnerTexts()).toEqual(['Editar', 'Seleccionar tallas']);
  expect(problemas).toEqual([]);
});

// ======================================================================== 3. doble clic
test('doble clic: una sola operación; «Publicando…» mientras se procesa y el resto del tablero queda ocupado', async ({ page }) => {
  const id = cat.productos['T22 OCULTO VALIDO'].id;
  await abrirTablero(page);
  let envios = 0;
  await page.route('**/rest/v1/rpc/fn_admin_estado_producto', async (route) => { envios += 1; await new Promise((r) => setTimeout(r, 1200)); await route.continue(); });
  const versionAntes = (await productoDB(id)).version;
  const boton = botonEstado(page, 'T22 OCULTO VALIDO');
  await boton.dblclick();
  await expect(boton).toHaveText('Publicando…');
  await expect(boton).toBeDisabled();
  await expect(boton).toHaveAttribute('aria-busy', 'true');
  await expect(tarjeta(page, 'T22 OCULTO VALIDO').locator('.producto-editar')).toBeDisabled(); // todo queda ocupado
  await expect(botonEstado(page, 'T22 PUBLICADO')).toBeDisabled();
  await expect(boton).toHaveText('Ocultar', { timeout: 20000 });
  await expect(boton).toBeEnabled();
  expect(envios).toBe(1);
  const p = await productoDB(id);
  expect(p.activo).toBe(true);
  expect(p.version).toBe(versionAntes + 1); // no se publicó y ocultó por el segundo clic
  expect(await nombresPublicos()).toContain('T22 OCULTO VALIDO');
  // Ocultando…, con el mismo cuidado.
  await boton.dblclick();
  await expect(boton).toHaveText('Ocultando…');
  await expect(boton).toHaveText('Publicar', { timeout: 20000 });
  expect(envios).toBe(2);
  expect((await productoDB(id)).version).toBe(versionAntes + 2);
  expect(problemas).toEqual([]);
});

// ======================================================================== 4. conflicto de versión
test('conflicto de versión: no se cambia nada, se carga el estado actual y se puede volver a pulsar', async ({ page }) => {
  const id = cat.productos['T22 OCULTO VALIDO'].id;
  await abrirTablero(page);
  await situar(page, 'T22 OCULTO VALIDO');
  const antes = await posicion(page, 'T22 OCULTO VALIDO');
  // Otra edición se guarda después de cargar el tablero: la versión que ve la tarjeta queda vieja.
  const v0 = (await productoDB(id)).version;
  await servicio('PATCH', `/rest/v1/productos?id=eq.${id}`, { version: v0 + 1 });
  await botonEstado(page, 'T22 OCULTO VALIDO').click();
  await expect(aviso(page, 'T22 OCULTO VALIDO')).toContainText('Otra edición de esta zapatilla se guardó antes que tu cambio. No se cambió nada: cargamos su estado actual.');
  expect(await productoDB(id)).toMatchObject({ activo: false, version: v0 + 1 }); // el servidor la rechazó
  await expect(estadoDe(page, 'T22 OCULTO VALIDO')).toHaveText('Oculto en la tienda');
  const medio = await posicion(page, 'T22 OCULTO VALIDO');
  expect(Math.abs(medio.top - antes.top)).toBeLessThanOrEqual(3);
  // Con la versión actual (ya leída), el mismo botón publica.
  await expect(botonEstado(page, 'T22 OCULTO VALIDO')).toBeEnabled();
  await botonEstado(page, 'T22 OCULTO VALIDO').click();
  await expect(estadoDe(page, 'T22 OCULTO VALIDO')).toHaveText('Publicado en la tienda');
  expect(await productoDB(id)).toMatchObject({ activo: true, version: v0 + 2 });
  expect(problemas).toEqual([]);
});

// ======================================================================== 5. respuesta perdida
test('respuesta perdida tras aplicarse: se comprueba con el identificador de la operación antes de anunciar el éxito', async ({ page }) => {
  const id = cat.productos['T22 OCULTO VALIDO'].id;
  await abrirTablero(page);
  const snap = await instantanea(id);
  const v0 = (await productoDB(id)).version;
  let n = 0;
  // La petición LLEGA al servidor y se aplica, pero la respuesta no vuelve.
  await page.route('**/rest/v1/rpc/fn_admin_estado_producto', async (route) => { n += 1; await route.fetch(); await route.abort('connectionreset'); });
  await botonEstado(page, 'T22 OCULTO VALIDO').click();
  await expect(aviso(page, 'T22 OCULTO VALIDO')).toContainText('Comprobado con el identificador de esta operación. Publicado: ya se ve en la tienda.');
  expect(n).toBe(1); // la comprobación solo lee: no se reenvía nada
  expect(await productoDB(id)).toMatchObject({ activo: true, version: v0 + 1 });
  await expect(estadoDe(page, 'T22 OCULTO VALIDO')).toHaveText('Publicado en la tienda');
  await soloCambio(snap, id);
  expect(problemas).toEqual([]);
});

test('respuesta perdida sin llegar al servidor: «Resultado no confirmado», sin éxito anunciado; Comprobar y Reintentar con la misma operación', async ({ page }) => {
  const id = cat.productos['T22 OCULTO VALIDO'].id;
  await abrirTablero(page);
  const v0 = (await productoDB(id)).version;
  const operaciones = [];
  let cortar = true;
  await page.route('**/rest/v1/rpc/fn_admin_estado_producto', async (route) => {
    operaciones.push(JSON.parse(route.request().postData() || '{}').p_operacion);
    if (cortar) { await route.abort('connectionreset'); return; }
    await route.continue();
  });
  await botonEstado(page, 'T22 OCULTO VALIDO').click();
  await expect(aviso(page, 'T22 OCULTO VALIDO')).toContainText('Se perdió la respuesta del servidor. Resultado no confirmado: la zapatilla sigue sin cambios por ahora, pero la operación todavía podría aplicarse.');
  await expect(aviso(page, 'T22 OCULTO VALIDO')).not.toContainText('Publicado:');
  await expect(estadoDe(page, 'T22 OCULTO VALIDO')).toHaveText('Oculto en la tienda');
  await expect(botonEstado(page, 'T22 OCULTO VALIDO')).toBeDisabled(); // primero se comprueba o se reintenta
  expect(await productoDB(id)).toMatchObject({ activo: false, version: v0 });
  // Comprobar otra vez: sigue sin confirmar y no envía nada.
  await aviso(page, 'T22 OCULTO VALIDO').getByRole('button', { name: 'Comprobar otra vez' }).click();
  await expect(aviso(page, 'T22 OCULTO VALIDO')).toContainText('Resultado no confirmado: la zapatilla sigue sin cambios por ahora');
  expect(operaciones).toHaveLength(1);
  // Reintentar: la MISMA operación.
  cortar = false;
  await aviso(page, 'T22 OCULTO VALIDO').getByRole('button', { name: 'Reintentar' }).click();
  await expect(estadoDe(page, 'T22 OCULTO VALIDO')).toHaveText('Publicado en la tienda');
  await expect(aviso(page, 'T22 OCULTO VALIDO')).toContainText('Publicado: ya se ve en la tienda.');
  expect(operaciones).toHaveLength(2);
  expect(operaciones[1]).toBe(operaciones[0]);
  expect(await productoDB(id)).toMatchObject({ activo: true, version: v0 + 1 });
  await expect(botonEstado(page, 'T22 OCULTO VALIDO')).toHaveText('Ocultar');
  await expect(botonEstado(page, 'T22 OCULTO VALIDO')).toBeEnabled();
  expect(problemas).toEqual([]);
});

test('respuesta perdida y el estado coincide por OTRA edición: no se anuncia éxito, se carga el estado actual', async ({ page }) => {
  const id = cat.productos['T22 OCULTO VALIDO'].id;
  await abrirTablero(page);
  const v0 = (await productoDB(id)).version;
  await page.route('**/rest/v1/rpc/fn_admin_estado_producto', (route) => route.abort('connectionreset')); // nunca llega
  await botonEstado(page, 'T22 OCULTO VALIDO').click();
  await expect(aviso(page, 'T22 OCULTO VALIDO')).toContainText('Resultado no confirmado');
  // Otra persona publica el modelo (otra operación): el estado actual coincide con el que se quería.
  await servicio('PATCH', `/rest/v1/productos?id=eq.${id}`, { activo: true, version: v0 + 1, ultima_operacion: crypto.randomUUID() });
  await aviso(page, 'T22 OCULTO VALIDO').getByRole('button', { name: 'Comprobar otra vez' }).click();
  await expect(aviso(page, 'T22 OCULTO VALIDO')).toContainText('Resultado no confirmado: la zapatilla cambió, pero no por esta operación (otra edición se guardó).');
  await expect(aviso(page, 'T22 OCULTO VALIDO')).not.toContainText('Publicado: ya se ve');
  await expect(aviso(page, 'T22 OCULTO VALIDO')).not.toContainText('Comprobado con el identificador');
  await expect(estadoDe(page, 'T22 OCULTO VALIDO')).toHaveText('Publicado en la tienda'); // el estado REAL, cargado del servidor
  expect(problemas).toEqual([]);
});

// ======================================================================== 6. el modelo desaparece por el filtro
test('si el modelo deja de verse por el filtro activo: posición cercana, explicación junto al vecino y filtro conservado', async ({ page, browserName }) => {
  const id = cat.productos['T22 SOLO OCULTO'].id;
  await abrirTablero(page);
  await page.locator('#filtros').getByRole('button', { name: /^Con elementos ocultos/ }).click();
  await expect(tarjeta(page, 'T22 SOLO OCULTO')).toBeVisible();
  await situar(page, 'T22 SOLO OCULTO');
  const antes = await posicion(page, 'T22 SOLO OCULTO');
  const ordenAntes = await page.locator('#lista-productos > li .producto-nombre').allInnerTexts();
  await botonEstado(page, 'T22 SOLO OCULTO').click();
  await expect(tarjeta(page, 'T22 SOLO OCULTO')).toHaveCount(0, { timeout: 20000 });
  expect(await productoDB(id)).toMatchObject({ activo: true });
  // El vecino más cercano (el siguiente que sigue en la lista) muestra lo ocurrido y recibe el foco.
  const i = ordenAntes.indexOf('T22 SOLO OCULTO');
  const vecino = ordenAntes[i + 1] ?? ordenAntes[i - 1]; // el siguiente y, si no hay, el anterior (aquí era el último)
  expect(vecino).toBe('T22 PUBLICADO');
  await expect(aviso(page, vecino)).toContainText('Publicado: ya se ve en la tienda.');
  await expect(aviso(page, vecino)).toContainText('«T22 SOLO OCULTO» ya no aparece con el filtro «Con elementos ocultos»');
  await expect(aviso(page, vecino)).toContainText(`te dejamos junto a «${vecino}»`);
  await expect(tarjeta(page, vecino).locator('.producto-nombre')).toBeFocused();
  await expect(page.locator('#filtros').getByRole('button', { name: /^Con elementos ocultos/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(buscar(page)).toHaveValue('T22');
  await expect(page.locator('#anuncio-producto')).toContainText('ya no aparece con el filtro');
  const despues = await tarjeta(page, vecino).evaluate((n) => ({ top: Math.round(n.getBoundingClientRect().top), y: Math.round(window.scrollY) }));
  expect(despues.y, 'no vuelve al comienzo').toBeGreaterThan(200);
  expect(Math.abs(despues.top - antes.top)).toBeLessThan(400); // posición cercana
  await capturar(page, browserName, 'estado-filtro-1280');
  expect(problemas).toEqual([]);
});

// ======================================================================== 7. teclado
test('teclado: Tab llega al botón, Intro y Espacio publican y ocultan, y el foco se queda en el botón', async ({ page }) => {
  const id = cat.productos['T22 OCULTO VALIDO'].id;
  await abrirTablero(page);
  await situar(page, 'T22 OCULTO VALIDO');
  // Tab desde «Editar» llega a «Publicar» y luego a «Seleccionar tallas».
  await tarjeta(page, 'T22 OCULTO VALIDO').locator('.producto-editar').focus();
  await page.keyboard.press('Tab');
  await expect(botonEstado(page, 'T22 OCULTO VALIDO')).toBeFocused();
  await expect(botonEstado(page, 'T22 OCULTO VALIDO')).toHaveAccessibleName(/^Publicar T22 OCULTO VALIDO \(GT-/);
  await page.keyboard.press('Enter');
  await expect(estadoDe(page, 'T22 OCULTO VALIDO')).toHaveText('Publicado en la tienda');
  await expect(botonEstado(page, 'T22 OCULTO VALIDO')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(estadoDe(page, 'T22 OCULTO VALIDO')).toHaveText('Oculto en la tienda');
  await expect(botonEstado(page, 'T22 OCULTO VALIDO')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(tarjeta(page, 'T22 OCULTO VALIDO').locator('[data-menu-tallas]')).toBeFocused();
  expect((await productoDB(id)).version).toBeGreaterThanOrEqual(3);
  expect(problemas).toEqual([]);
});

// ======================================================================== 8. disposición (escritorio y celular táctil)
test('disposición: tres controles sin amontonarse ni desbordar en escritorio y en celular (toques)', async ({ page, browser, browserName }) => {
  await abrirTablero(page);
  const medir = (p, nombre) => tarjeta(p, nombre).evaluate((n) => {
    const caja = n.getBoundingClientRect();
    const b = [...n.querySelectorAll('.producto-botones button')].map((x) => { const r = x.getBoundingClientRect(); return { t: x.textContent, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), derecha: Math.round(r.right), izq: Math.round(r.left) }; });
    return { botones: b, dentro: b.every((x) => x.izq >= Math.floor(caja.left) - 1 && x.derecha <= Math.ceil(caja.right) + 1), foto: !!n.querySelector('.producto-foto'), variantes: n.querySelectorAll('.variante').length };
  });
  const e = await medir(page, 'T22 OCULTO VALIDO');
  expect(e.botones.map((x) => x.t)).toEqual(['Editar', 'Publicar', 'Seleccionar tallas']);
  expect(new Set(e.botones.map((x) => x.y)).size).toBe(1); // una sola fila en escritorio
  expect(e.dentro).toBe(true);
  for (const b of e.botones) expect(b.h).toBeGreaterThanOrEqual(36);
  const d1 = await revisarDisposicion(page);
  expect(d1.desborde).toBe(0);
  expect(d1.fuera).toBe(0);
  await capturar(page, browserName, 'estado-botones-1280');

  // Celular táctil de 390 px.
  const contexto = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  const movil = await contexto.newPage();
  try {
    await abrirTablero(movil, { ancho: 390, alto: 844 });
    await tarjeta(movil, 'T22 OCULTO VALIDO').scrollIntoViewIfNeeded();
    const m = await medir(movil, 'T22 OCULTO VALIDO');
    const [editarB, estadoB, tallasB] = m.botones;
    expect(editarB.y).toBe(estadoB.y); // «Editar» y «Publicar» comparten fila…
    expect(tallasB.y).toBeGreaterThan(estadoB.y); // …y «Seleccionar tallas» va debajo, a todo el ancho
    expect(tallasB.w).toBeGreaterThan(estadoB.w);
    expect(estadoB.x).toBeGreaterThanOrEqual(editarB.derecha); // sin solaparse
    expect(m.dentro).toBe(true);
    for (const b of m.botones) { expect(b.h).toBeGreaterThanOrEqual(40); expect(b.w).toBeGreaterThanOrEqual(80); }
    expect(m.foto).toBe(true);
    expect(m.variantes).toBe(2); // las fotos por color y la separación entre modelos siguen
    const d2 = await revisarDisposicion(movil);
    expect(d2.desborde).toBe(0);
    expect(d2.fuera).toBe(0);
    await botonEstado(movil, 'T22 OCULTO VALIDO').tap();
    await expect(estadoDe(movil, 'T22 OCULTO VALIDO')).toHaveText('Publicado en la tienda');
    await expect(aviso(movil, 'T22 OCULTO VALIDO')).toBeVisible();
    const m2 = await medir(movil, 'T22 OCULTO VALIDO');
    expect(m2.dentro).toBe(true);
    const d3 = await revisarDisposicion(movil);
    expect(d3.desborde).toBe(0);
    const anchoAviso = await aviso(movil, 'T22 OCULTO VALIDO').evaluate((n) => n.getBoundingClientRect().width);
    expect(anchoAviso).toBeGreaterThan(280);
    await capturar(movil, browserName, 'estado-botones-390');
    expect(problemas).toEqual([]);
  } finally {
    await contexto.close();
  }
});
