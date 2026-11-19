// @ts-check
/* Etapa 19 (tablero) · Volver al lugar de trabajo tras cambiar tallas, menú «Seleccionar tallas» por
 * modelo, barra compacta en celular y foto de cada color.
 *
 * SOLO contra el stack local desechable de Supabase y el sitio servido en 127.0.0.1:8765. Catálogo
 * FICTICIO de la marca «MARCA TABLERO T19» (nueve modelos; las fotos son las de prueba del propio sitio),
 * que se crea antes de cada prueba y se borra al terminar. La configuración real del panel nunca se usa.
 *
 *   npx playwright test tests/etapa19/tablero.spec.js --workers=1
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PANEL, entorno, servicio, crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, configurarPanel, ingresar,
  borrarCatalogo, leerTallas, revisarDisposicion
} from '../etapa15/ayudas-panel.js';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180000);

const MARCA = 'MARCA TABLERO T19';
const CAPTURAS = path.join(os.tmpdir(), 'gama-talla-19-tablero');
const FOTO = (n) => `assets/images/productos/editadas/zapatilla_0${n}.webp`;
const AVISO_CAPTURA_WEBKIT = "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.";
const RED = /Failed to load resource|net::ERR|internetdisconnected|Failed to fetch|NetworkError|Load failed|access control checks/;
let admin; let cat;

async function borrarTodo() {
  const productos = await servicio('GET', `/rest/v1/productos?select=id,variantes(id)&marca=eq.${encodeURIComponent(MARCA)}`);
  if (productos.length) await borrarCatalogo({ productos, variantes: productos.flatMap((p) => p.variantes) });
}

/* Nueve modelos. «AIR FORCE T19» (el séptimo, bastante abajo) tiene todos los casos:
 *   BLANCO (2 fotos, insertadas al revés de su orden): 38 disponible · 39 agotada · 40 por revisar ·
 *          41 confirmada con la vigencia VENCIDA (por revisar) · 42 confirmada y desactivada
 *   NEGRO (1 foto): 38 agotada y desactivada · 39 disponible
 *   GRIS (sin foto): 40 por revisar
 * «CAMPUS T19» (octavo): VERDE 40 disponible, 41 agotada. «RELLENO C T19» también tiene una agotada. */
async function crearCatalogo() {
  const hace1h = new Date(Date.now() - 3600e3).toISOString();
  const hace60h = new Date(Date.now() - 60 * 3600e3).toISOString();
  const nombres = ['RELLENO A T19', 'RELLENO B T19', 'RELLENO C T19', 'RELLENO D T19', 'RELLENO E T19', 'RELLENO F T19', 'AIR FORCE T19', 'CAMPUS T19', 'ULTIMO T19'];
  const productos = await servicio('POST', '/rest/v1/productos?select=id,nombre,codigo_interno', nombres.map((nombre, i) => ({
    nombre, marca: MARCA, categoria: 'URBANAS', publico: 'unisex', orden: i + 1, activo: true
  })), 'return=representation');
  const p = Object.fromEntries(productos.map((x) => [x.nombre, x]));
  const defs = [
    ...['A', 'B', 'C', 'D', 'E', 'F'].flatMap((l, i) => [
      { clave: `R${l}1`, producto_id: p[`RELLENO ${l} T19`].id, color: 'AZUL', orden: 0, foto: [(i % 4) + 1] },
      { clave: `R${l}2`, producto_id: p[`RELLENO ${l} T19`].id, color: 'ROJO', orden: 1, foto: [] }
    ]),
    { clave: 'blanco', producto_id: p['AIR FORCE T19'].id, color: 'BLANCO', orden: 0, foto: [1, 2] },
    { clave: 'negro', producto_id: p['AIR FORCE T19'].id, color: 'NEGRO', orden: 1, foto: [8] },
    { clave: 'gris', producto_id: p['AIR FORCE T19'].id, color: 'GRIS', orden: 2, foto: [] },
    { clave: 'verde', producto_id: p['CAMPUS T19'].id, color: 'VERDE', orden: 0, foto: [3] },
    { clave: 'ultimo', producto_id: p['ULTIMO T19'].id, color: 'CAFE', orden: 0, foto: [4] }
  ];
  const variantes = await servicio('POST', '/rest/v1/variantes?select=id,color,codigo_variante,producto_id,orden', defs.map((d) => ({
    producto_id: d.producto_id, color: d.color, precio: 150000, orden: d.orden, activa: true
  })), 'return=representation');
  const v = Object.fromEntries(defs.map((d) => [d.clave, variantes.find((x) => x.producto_id === d.producto_id && x.orden === d.orden)]));
  // Fotos: la galería de BLANCO se inserta al revés (orden 1 antes que orden 0).
  const fotos = defs.flatMap((d) => d.foto.map((n, orden) => ({ variante_id: v[d.clave].id, ruta: FOTO(n), orden }))).reverse();
  await servicio('POST', '/rest/v1/fotos', fotos);
  const disponible = { estado: 'CONFIRMADA', vigencia_desde: hace1h };
  const revisar = { estado: 'REVISAR', vigencia_desde: null };
  const agotada = { estado: 'AGOTADA', vigencia_desde: null };
  const filas = [
    ...defs.filter((d) => d.clave.startsWith('R')).flatMap((d) => ['38', '39', '40', '41', '42'].map((t) => ({ variante_id: v[d.clave].id, talla: t, activa: true,
      ...(d.clave === 'RC1' && t === '42' ? agotada : revisar) }))),
    { variante_id: v.blanco.id, talla: '38', activa: true, ...disponible },
    { variante_id: v.blanco.id, talla: '39', activa: true, ...agotada },
    { variante_id: v.blanco.id, talla: '40', activa: true, ...revisar },
    { variante_id: v.blanco.id, talla: '41', activa: true, estado: 'CONFIRMADA', vigencia_desde: hace60h },
    { variante_id: v.blanco.id, talla: '42', activa: false, ...disponible },
    { variante_id: v.negro.id, talla: '38', activa: false, ...agotada },
    { variante_id: v.negro.id, talla: '39', activa: true, ...disponible },
    { variante_id: v.gris.id, talla: '40', activa: true, ...revisar },
    { variante_id: v.verde.id, talla: '40', activa: true, ...disponible },
    { variante_id: v.verde.id, talla: '41', activa: true, ...agotada },
    ...['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'].map((t) => ({ variante_id: v.ultimo.id, talla: t, activa: true, ...revisar }))
  ];
  const tallas = await servicio('POST', '/rest/v1/tallas?select=id,talla,variante_id', filas, 'return=representation');
  const id = (clave, t) => tallas.find((x) => x.variante_id === v[clave].id && x.talla === t).id;
  return { productos: p, variantes: v, tallas, id };
}

test.beforeAll(async ({}, info) => {
  entorno();
  await borrarTodo();
  admin = await crearUsuario(`tablero19-${info.project.name}-${Date.now().toString(36)}@gamaytalla.test`);
  await hacerAdmin(admin.id);
  fs.mkdirSync(CAPTURAS, { recursive: true });
});
test.afterAll(async () => {
  await borrarTodo().catch(() => null);
  if (admin) { await quitarAdmin(admin.id).catch(() => null); await borrarUsuario(admin.id); }
});

let problemas = [];
async function abrirPanel(page) {
  problemas = [];
  page.on('pageerror', (e) => problemas.push(`EXCEPCIÓN: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !RED.test(m.text())) problemas.push(m.text()); });
  await configurarPanel(page);
  await page.goto(PANEL);
  await ingresar(page, admin);
  await expect(page.locator('#lista-productos > li').first()).toBeVisible();
  await expect(page.locator('#tablero')).not.toHaveAttribute('aria-busy', 'true');
  await buscar(page).fill('T19');
  // La búsqueda se aplica tras una pausa breve: se espera a que pinte su línea de estado.
  await expect(page.locator('#tablero-estado')).toContainText(/^9 de \d+ zapatillas a la vista/);
  await expect(page.locator('#lista-productos > li')).toHaveCount(9);
}
test.beforeEach(async () => {
  await borrarTodo();
  cat = await crearCatalogo();
});

// ---------------------------------------------------------------- ayudas
const buscar = (page) => page.getByLabel('Buscar por código interno, referencia, marca o modelo');
const talla = (page, clave, t) => page.locator(`.talla[data-talla-id="${cat.id(clave, t)}"]`);
const tarjeta = (page, nombre) => page.locator('#lista-productos > li').filter({ has: page.getByRole('heading', { name: nombre, exact: true }) });
const barra = (page) => page.locator('#barra-acciones');
const dialogo = (page) => page.locator('#dialogo-accion');
const resultado = (page) => page.locator('#resultado-accion');
const accion = (page, nombre) => barra(page).getByRole('button', { name: nombre, exact: true });
const confirmar = (page, nombre) => dialogo(page).getByRole('button', { name: nombre, exact: true });
const botonMenu = (page, nombre) => tarjeta(page, nombre).getByRole('button', { name: new RegExp(`^Seleccionar tallas de ${nombre} `) });
const menu = (page) => page.getByRole('menu');
const opcion = (page, texto) => menu(page).getByRole('menuitem', { name: new RegExp(`^Seleccionar ${texto} \\(`) });

const ACCIONES = {
  proveedor: { boton: 'Confirmó el proveedor', confirmar: 'Confirmar disponibilidad', hecho: 'confirmada por el proveedor' },
  publicacion: { boton: 'Nueva publicación', confirmar: 'Registrar publicación', hecho: 'confirmada por publicación' },
  agotada: { boton: 'Marcar agotada', confirmar: 'Marcar agotada', hecho: 'marcada agotada' },
  revisar: { boton: 'Dejar por revisar', confirmar: 'Dejar por revisar', hecho: 'dejada por revisar' },
  desactivar: { boton: 'Desactivar tallas', confirmar: 'Desactivar tallas', hecho: 'desactivada' },
  activar: { boton: 'Activar tallas', confirmar: 'Activar tallas', hecho: 'activada' }
};

async function capturar(page, browserName, nombre, opciones = {}) {
  const desde = problemas.length;
  await page.screenshot({ path: path.join(CAPTURAS, `${nombre}-${browserName}.png`), ...opciones });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  if (browserName !== 'webkit') return;
  const i = problemas.indexOf(AVISO_CAPTURA_WEBKIT, desde);
  if (i >= 0) problemas.splice(i, 1);
}

// Coloca un elemento hacia la mitad de la pantalla y empieza a vigilar el desplazamiento mínimo.
async function centrar(locator) {
  await locator.evaluate((n) => {
    window.scrollTo(0, window.scrollY + n.getBoundingClientRect().top - window.innerHeight * 0.4);
  });
}
async function vigilar(page) {
  await page.evaluate(() => {
    const w = /** @type {any} */ (window);
    w.__minY = window.scrollY;
    if (!w.__vigia) { w.__vigia = () => { w.__minY = Math.min(w.__minY, window.scrollY); }; window.addEventListener('scroll', w.__vigia); }
  });
}
const posicion = (locator) => locator.evaluate((n) => ({ top: Math.round(n.getBoundingClientRect().top), y: Math.round(window.scrollY), minY: Math.round(/** @type {any} */ (window).__minY ?? -1) }));
// El resultado está a la vista sin subir la página (dentro de la pantalla).
const enPantalla = (locator) => locator.evaluate((n) => { const r = n.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight + 1 && r.height > 0; });
const focoEn = (page) => page.evaluate(() => {
  const a = /** @type {HTMLElement} */ (document.activeElement);
  return { tallaId: a?.dataset?.tallaId || null, texto: a?.textContent?.trim() || '', id: a?.id || '', clase: a?.className || '' };
});

async function ejecutar(page, tipo, { movil = false } = {}) {
  const def = ACCIONES[tipo];
  if (movil) await accion(page, 'Cambiar estado').click();
  await accion(page, def.boton).click();
  await expect(dialogo(page)).toBeVisible();
  if (tipo === 'publicacion') {
    const d = new Date(Date.now() - 2 * 3600e3 - 5 * 3600e3).toISOString();
    await dialogo(page).getByLabel('Fecha de la publicación').fill(d.slice(0, 10));
    await dialogo(page).getByLabel('Hora (Colombia, UTC−5)').fill(d.slice(11, 16));
  }
  await confirmar(page, def.confirmar).click();
  await expect(dialogo(page)).toBeHidden();
}

// ======================================================================== 1. posición tras las acciones
for (const [nombre, ancho, alto, movil] of [['escritorio', 1280, 720, false], ['celular', 390, 844, true]]) {
  test(`las seis acciones desde un modelo de abajo conservan la referencia visible y el foco (${nombre})`, async ({ page, browserName }) => {
    await page.setViewportSize({ width: ancho, height: alto });
    await abrirPanel(page);
    const objetivo = talla(page, 'blanco', '40');
    for (const tipo of ['proveedor', 'publicacion', 'agotada', 'revisar', 'desactivar', 'activar']) {
      await centrar(objetivo);
      await objetivo.click();
      await expect(objetivo).toHaveAttribute('aria-pressed', 'true');
      const antes = await posicion(objetivo);
      expect(antes.y, 'el modelo está bastante abajo').toBeGreaterThan(alto);
      await vigilar(page);
      await ejecutar(page, tipo, { movil });
      await expect(resultado(page)).toContainText(`Talla 40 ${ACCIONES[tipo].hecho}`);
      await expect(objetivo, `${tipo}: el foco vuelve a la talla`).toBeFocused();
      const despues = await posicion(objetivo);
      expect(Math.abs(despues.top - antes.top), `${tipo}: la talla queda a la misma altura (${antes.top} → ${despues.top})`).toBeLessThanOrEqual(2);
      expect(despues.minY, `${tipo}: nunca salta al inicio (mínimo ${despues.minY} de ${antes.y})`).toBeGreaterThan(antes.y - alto);
      expect(await enPantalla(resultado(page)), `${tipo}: el resultado se ve sin subir`).toBe(true);
      await expect(resultado(page)).toHaveAttribute('role', 'status');
      await expect(barra(page)).toBeHidden();
      if (tipo === 'agotada') await capturar(page, browserName, `posicion-tras-accion-${ancho}`);
    }
    // Los datos se escribieron de verdad.
    const fila = (await leerTallas([cat.id('blanco', '40')]))[cat.id('blanco', '40')];
    expect(fila).toMatchObject({ estado: 'REVISAR', activa: true });
    expect(problemas).toEqual([]);
  });
}

// ======================================================================== 2. varios modelos, cancelar, parcial
test('selección entre modelos, cancelación y fallo parcial: vuelve al último lugar de trabajo', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await abrirPanel(page);
  // Selección entre modelos: primero CAMPUS, después AIR FORCE (el último lugar de trabajo).
  await centrar(talla(page, 'verde', '40'));
  await talla(page, 'verde', '40').click();
  await centrar(talla(page, 'blanco', '38'));
  await talla(page, 'blanco', '38').click();
  await expect(page.locator('#seleccion-resumen')).toContainText('2 tallas seleccionadas · 2 modelos · 2 colores');
  let antes = await posicion(talla(page, 'blanco', '38'));
  await vigilar(page);
  await ejecutar(page, 'revisar');
  await expect(resultado(page)).toContainText('2 tallas dejadas por revisar');
  await expect(talla(page, 'blanco', '38')).toBeFocused();
  let despues = await posicion(talla(page, 'blanco', '38'));
  expect(Math.abs(despues.top - antes.top)).toBeLessThanOrEqual(2);

  // Cancelar con Escape: la página no se mueve y el foco vuelve al botón de la acción.
  await talla(page, 'blanco', '39').click();
  antes = await posicion(talla(page, 'blanco', '39'));
  await accion(page, 'Marcar agotada').click();
  await expect(dialogo(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialogo(page)).toBeHidden();
  await expect(accion(page, 'Marcar agotada')).toBeFocused();
  despues = await posicion(talla(page, 'blanco', '39'));
  expect(despues.top).toBe(antes.top);
  expect(despues.y).toBe(antes.y);
  // Cancelar con el botón: igual.
  await accion(page, 'Dejar por revisar').click();
  await dialogo(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialogo(page)).toBeHidden();
  await expect(accion(page, 'Dejar por revisar')).toBeFocused();
  expect((await posicion(talla(page, 'blanco', '39'))).y).toBe(antes.y);
  await accion(page, 'Quitar selección').click();

  // Fallo parcial: la talla 40 de BLANCO se rechaza; las demás se aplican. El foco vuelve a la
  // última talla pulsada (la que falló, que sigue seleccionada) y a la misma altura.
  const rechazada = cat.id('blanco', '40');
  await page.route('**/rpc/fn_marcar_agotada*', async (r) => {
    if ((r.request().postData() || '').includes(rechazada)) return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'No existe la talla' }) });
    return r.continue();
  });
  await talla(page, 'verde', '40').click();
  await talla(page, 'negro', '39').click();
  await centrar(talla(page, 'blanco', '40'));
  await talla(page, 'blanco', '40').click();
  antes = await posicion(talla(page, 'blanco', '40'));
  await vigilar(page);
  await ejecutar(page, 'agotada');
  await expect(resultado(page).getByRole('heading')).toHaveText('Se aplicó a 2 de 3 tallas');
  await expect(talla(page, 'blanco', '40')).toBeFocused();
  await expect(talla(page, 'blanco', '40')).toHaveAttribute('aria-pressed', 'true');
  despues = await posicion(talla(page, 'blanco', '40'));
  expect(Math.abs(despues.top - antes.top)).toBeLessThanOrEqual(2);
  expect(despues.minY).toBeGreaterThan(antes.y - 720);
  expect(await enPantalla(resultado(page))).toBe(true);
  await capturar(page, browserName, 'fallo-parcial-1280');
  await page.unroute('**/rpc/fn_marcar_agotada*');
  expect(problemas).toEqual([]);
});

// ======================================================================== 3. desaparece del filtro
test('si el modelo deja de aparecer por el filtro activo, queda el más cercano y se explica', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abrirPanel(page);
  await page.locator('#plegable-filtros > summary').click();
  await page.locator('#filtros').getByRole('button', { name: /Con tallas agotadas/ }).click();
  await expect(page.locator('#lista-productos > li')).toHaveCount(3); // RELLENO C, AIR FORCE, CAMPUS
  await centrar(talla(page, 'blanco', '39'));
  await talla(page, 'blanco', '39').click();
  // Referencia: la talla en la que se trabajaba (el vecino ocupará su altura en la pantalla).
  const antes = await posicion(talla(page, 'blanco', '39'));
  await vigilar(page);
  await ejecutar(page, 'proveedor', { movil: true });
  await expect(resultado(page)).toContainText('Talla 39 confirmada por el proveedor');
  await expect(resultado(page).locator('.resultado-nota')).toHaveText('«AIR FORCE T19» ya no aparece con el filtro «Con tallas agotadas»; te dejamos junto a «CAMPUS T19».');
  await expect(page.locator('#lista-productos > li')).toHaveCount(2);
  // Filtro y búsqueda se conservan.
  await expect(page.locator('#filtros').getByRole('button', { name: /Con tallas agotadas/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(buscar(page)).toHaveValue('T19');
  // El vecino ocupa el lugar del modelo que salió, y recibe el foco.
  await expect(tarjeta(page, 'CAMPUS T19').getByRole('heading', { name: 'CAMPUS T19' })).toBeFocused();
  const vecino = await posicion(tarjeta(page, 'CAMPUS T19'));
  expect(Math.abs(vecino.top - antes.top)).toBeLessThanOrEqual(2);
  expect(vecino.minY).toBeGreaterThan(0);
  expect(await enPantalla(resultado(page))).toBe(true);
  await capturar(page, browserName, 'fuera-del-filtro-390');
  expect(problemas).toEqual([]);
});

// ======================================================================== 4. menú por modelo
test('menú «Seleccionar tallas»: cinco opciones por modelo, conserva otros modelos; ratón y teclado', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await abrirPanel(page);
  const af = ['blanco:38', 'blanco:39', 'blanco:40', 'blanco:41', 'blanco:42', 'negro:38', 'negro:39', 'gris:40'];
  const presionadas = async () => {
    const r = [];
    for (const k of af) { const [c, t] = k.split(':'); if ((await talla(page, c, t).getAttribute('aria-pressed')) === 'true') r.push(k); }
    return r;
  };
  // Otra selección que debe conservarse.
  await talla(page, 'verde', '40').click();
  await talla(page, 'blanco', '38').click();

  const boton = botonMenu(page, 'AIR FORCE T19');
  await centrar(boton);
  await expect(boton).toHaveAttribute('aria-expanded', 'false');
  await boton.click();
  await expect(boton).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.menu-tallas-titulo')).toHaveText(`Seleccionar tallas de AIR FORCE T19 ${await tarjeta(page, 'AIR FORCE T19').locator('.producto-codigos .codigo').textContent()}`);
  await expect(menu(page)).toHaveAccessibleName(/^Seleccionar tallas de AIR FORCE T19/);
  await expect(menu(page).getByRole('menuitem')).toHaveText([/^Todas las tallas8$/, /^Tallas activas6$/, /^Tallas desactivadas2$/, /^Tallas agotadas2$/, /^Tallas por revisar3$/]);
  await expect(opcion(page, 'todas las tallas')).toBeFocused();
  await capturar(page, browserName, 'menu-tallas-1280');

  const casos = [
    ['tallas activas', ['blanco:38', 'blanco:39', 'blanco:40', 'blanco:41', 'negro:39', 'gris:40'], 'AIR FORCE T19: seleccionadas 6 tallas activas (las otras 2 del modelo quedan sin seleccionar). Se conserva 1 talla de otros modelos.'],
    ['tallas desactivadas', ['blanco:42', 'negro:38'], 'AIR FORCE T19: seleccionadas 2 tallas desactivadas'],
    ['tallas agotadas', ['blanco:39', 'negro:38'], 'AIR FORCE T19: seleccionadas 2 tallas agotadas'],
    ['tallas por revisar', ['blanco:40', 'blanco:41', 'gris:40'], 'AIR FORCE T19: seleccionadas 3 tallas por revisar'],
    ['todas las tallas', af, 'AIR FORCE T19: seleccionadas sus 8 tallas. Se conserva 1 talla de otros modelos.']
  ];
  for (const [texto, esperadas, aviso] of casos) {
    if ((await boton.getAttribute('aria-expanded')) !== 'true') await boton.click();
    await opcion(page, texto).click();
    await expect(menu(page)).toHaveCount(0);
    await expect(boton).toHaveAttribute('aria-expanded', 'false');
    await expect(boton, 'el foco vuelve al botón').toBeFocused();
    expect(await presionadas(), texto).toEqual(esperadas);
    await expect(talla(page, 'verde', '40'), 'la talla de otro modelo sigue seleccionada').toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#tablero-estado')).toContainText(aviso);
  }
  await expect(page.locator('#seleccion-resumen')).toContainText('9 tallas seleccionadas · 2 modelos · 4 colores');
  // Después se puede seguir marcando y desmarcando una a una.
  await talla(page, 'blanco', '38').click();
  await expect(talla(page, 'blanco', '38')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#seleccion-resumen')).toContainText('8 tallas seleccionadas');

  // Teclado: flecha abajo abre y va a la primera; Fin, Inicio; Intro elige; Escape cierra y devuelve el foco.
  await boton.focus();
  await page.keyboard.press('ArrowDown');
  await expect(opcion(page, 'todas las tallas')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(opcion(page, 'tallas agotadas')).toBeFocused();
  await page.keyboard.press('End');
  await expect(opcion(page, 'tallas por revisar')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(opcion(page, 'todas las tallas')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(opcion(page, 'tallas por revisar')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(boton).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(opcion(page, 'todas las tallas')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  expect(await presionadas()).toEqual(['blanco:39', 'negro:38']);
  await expect(boton).toBeFocused();

  // Opción sin coincidencias: lo dice y no cambia nada. Un clic fuera cierra el menú.
  const campus = botonMenu(page, 'CAMPUS T19');
  await campus.click();
  await expect(opcion(page, 'tallas desactivadas')).toHaveAccessibleName('Seleccionar tallas desactivadas (ninguna)');
  await expect(opcion(page, 'tallas desactivadas')).toHaveAttribute('aria-disabled', 'true');
  await expect(opcion(page, 'tallas desactivadas')).toContainText('Ninguna');
  // Playwright no pulsa elementos con aria-disabled: se fuerza el clic, como lo haría una persona.
  await opcion(page, 'tallas desactivadas').click({ force: true });
  await expect(page.locator('.menu-tallas-nota')).toHaveText('CAMPUS T19 no tiene tallas desactivadas: no hay nada que seleccionar.');
  await expect(talla(page, 'verde', '40')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('heading', { name: 'Catálogo', exact: true }).click();
  await expect(menu(page)).toHaveCount(0);
  await expect(campus).toHaveAttribute('aria-expanded', 'false');

  // Las herramientas globales siguen.
  await page.locator('#seleccion-herramientas').getByRole('button', { name: 'Seleccionar tallas visibles' }).click();
  await expect(page.locator('#seleccion-resumen')).toContainText('tallas seleccionadas · 9 modelos');
  await accion(page, 'Quitar selección').click();
  await expect(barra(page)).toBeHidden();
  expect(problemas).toEqual([]);
});

test('menú «Seleccionar tallas» con pantalla táctil', async ({ browser, browserName }) => {
  test.skip(browserName === 'firefox', 'Firefox de Playwright no emula pantallas táctiles (isMobile/hasTouch).');
  const contexto = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await contexto.newPage();
  try {
    await abrirPanel(page);
    await talla(page, 'verde', '41').tap();
    const boton = botonMenu(page, 'AIR FORCE T19');
    await centrar(boton);
    await boton.tap();
    await expect(menu(page)).toBeVisible();
    const caja = await page.locator('.menu-tallas-panel').boundingBox();
    expect(caja && caja.x >= 0 && caja.x + caja.width <= 390, 'el menú cabe en la pantalla').toBe(true);
    await capturar(page, browserName, 'menu-tallas-tactil-390');
    await opcion(page, 'tallas agotadas').tap();
    await expect(menu(page)).toHaveCount(0);
    await expect(talla(page, 'blanco', '39')).toHaveAttribute('aria-pressed', 'true');
    await expect(talla(page, 'negro', '38')).toHaveAttribute('aria-pressed', 'true');
    await expect(talla(page, 'verde', '41')).toHaveAttribute('aria-pressed', 'true');
    // Tocar fuera cierra.
    await boton.tap();
    await expect(menu(page)).toBeVisible();
    await page.getByRole('heading', { name: 'Catálogo', exact: true }).tap();
    await expect(menu(page)).toHaveCount(0);
    expect(problemas).toEqual([]);
  } finally {
    await contexto.close();
  }
});

// ======================================================================== 5. foto de cada color
test('cada color muestra la primera foto de su galería; «Sin foto» si no tiene; se actualiza al cambiar la principal', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await abrirPanel(page);
  const fila = (clave) => page.locator(`.variante[data-variante-id="${cat.variantes[clave].id}"]`);
  await fila('blanco').scrollIntoViewIfNeeded();
  const img = (clave) => fila(clave).locator('.variante-foto img');
  await expect(img('blanco')).toHaveAttribute('src', /zapatilla_01\.webp$/);
  await expect(img('negro')).toHaveAttribute('src', /zapatilla_08\.webp$/);
  await expect(img('blanco')).toHaveAttribute('loading', 'lazy');
  await expect(fila('gris').locator('.variante-foto')).toHaveText('Sin foto');
  await expect(fila('gris').locator('.variante-foto img')).toHaveCount(0);
  // Tamaño fijo y la foto completa (contain), ya cargada.
  for (const clave of ['blanco', 'negro']) {
    await expect.poll(() => img(clave).evaluate((n) => /** @type {HTMLImageElement} */ (n).naturalWidth)).toBeGreaterThan(0);
    const d = await img(clave).evaluate((n) => ({ ajuste: getComputedStyle(n).objectFit, caja: n.parentElement.getBoundingClientRect().width }));
    expect(d.ajuste).toBe('contain');
    expect(Math.round(d.caja)).toBe(72);
  }
  // Miniatura, nombre, código y precio juntos; las tallas debajo, a todo el ancho de la fila.
  const geo = await fila('blanco').evaluate((n) => {
    const r = (s) => n.querySelector(s).getBoundingClientRect();
    return { foto: r('.variante-foto'), cabecera: r('.variante-cabecera'), tallas: r('.tallas'), fila: n.getBoundingClientRect() };
  });
  expect(geo.cabecera.left).toBeGreaterThan(geo.foto.right);
  expect(geo.tallas.top).toBeGreaterThanOrEqual(geo.foto.bottom);
  expect(Math.abs(geo.tallas.left - geo.fila.left)).toBeLessThanOrEqual(1);
  await capturar(page, browserName, 'fotos-por-color-1280');

  // Cambia la foto principal de BLANCO (la segunda pasa a ser la primera) y se refresca el catálogo.
  const fotos = await servicio('GET', `/rest/v1/fotos?select=id,ruta,orden&variante_id=eq.${cat.variantes.blanco.id}&order=orden`);
  await servicio('DELETE', `/rest/v1/fotos?variante_id=eq.${cat.variantes.blanco.id}`);
  await servicio('POST', '/rest/v1/fotos', fotos.map((f, i) => ({ variante_id: cat.variantes.blanco.id, ruta: f.ruta, orden: fotos.length - 1 - i })));
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.locator('#tablero')).not.toHaveAttribute('aria-busy', 'true');
  await expect(img('blanco')).toHaveAttribute('src', /zapatilla_02\.webp$/);
  await expect(img('negro')).toHaveAttribute('src', /zapatilla_08\.webp$/);
  expect(problemas).toEqual([]);
});

// ======================================================================== 6. celular
for (const [ancho, alto] of [[360, 560], [390, 844]]) {
  test(`celular ${ancho}×${alto}: barra compacta, «Cambiar estado», «Ver selección», colores a todo el ancho y última talla alcanzable`, async ({ page, browserName }) => {
    await page.setViewportSize({ width: ancho, height: alto });
    await abrirPanel(page);
    // Los colores y sus tallas usan todo el ancho de la tarjeta (no la columna del texto).
    const geo = await tarjeta(page, 'AIR FORCE T19').evaluate((n) => {
      const art = n.querySelector('.producto-articulo').getBoundingClientRect();
      const fila = n.querySelector('.variante').getBoundingClientRect();
      const botones = n.querySelector('.producto-botones').getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(n.querySelector('.producto-articulo')).paddingLeft);
      return { izquierda: fila.left - art.left, derecha: art.right - fila.right, pad, botones: botones.left - art.left };
    });
    expect(Math.abs(geo.izquierda - geo.pad), 'la fila del color empieza en el borde interior de la tarjeta').toBeLessThanOrEqual(1);
    expect(Math.abs(geo.derecha - geo.pad)).toBeLessThanOrEqual(1);
    expect(Math.abs(geo.botones - geo.pad)).toBeLessThanOrEqual(1);
    await capturar(page, browserName, `tablero-${ancho}x${alto}`);

    // Barra compacta: total, «Ver selección», «Cambiar estado» y «Quitar selección»; nada más.
    await centrar(talla(page, 'blanco', '40'));
    await talla(page, 'blanco', '40').click();
    await talla(page, 'negro', '39').click();
    await talla(page, 'verde', '40').click();
    await expect(barra(page)).toBeVisible();
    for (const b of ['Ver selección', 'Cambiar estado', 'Quitar selección']) await expect(accion(page, b)).toBeVisible();
    for (const def of Object.values(ACCIONES)) await expect(accion(page, def.boton)).toBeHidden();
    const altoBarra = (await barra(page).boundingBox())?.height || 0;
    expect(altoBarra, `barra compacta (${Math.round(altoBarra)} px)`).toBeLessThanOrEqual(150);
    await expect(talla(page, 'verde', '40'), 'seleccionar no mueve el catálogo').toBeInViewport();
    let d = await revisarDisposicion(page);
    expect(d.desborde).toBe(0);
    expect(d.pequenos).toEqual([]);
    await capturar(page, browserName, `barra-compacta-${ancho}x${alto}`);

    // «Cambiar estado»: las seis acciones ordenadas, todas a la vista y cómodas.
    await accion(page, 'Cambiar estado').click();
    await expect(accion(page, 'Cambiar estado')).toHaveAttribute('aria-expanded', 'true');
    for (const def of Object.values(ACCIONES)) {
      const b = accion(page, def.boton);
      await expect(b).toBeInViewport({ ratio: 1 });
      const caja = await b.boundingBox();
      expect(caja && caja.height >= 44, `${def.boton} cómodo al tacto`).toBe(true);
    }
    d = await revisarDisposicion(page);
    expect(d.desborde).toBe(0);
    expect(d.pequenos).toEqual([]);
    await capturar(page, browserName, `cambiar-estado-${ancho}x${alto}`);
    await page.keyboard.press('Escape');
    await expect(accion(page, 'Cambiar estado')).toHaveAttribute('aria-expanded', 'false');
    await expect(accion(page, 'Cambiar estado')).toBeFocused();
    await expect(accion(page, 'Marcar agotada')).toBeHidden();

    // «Ver selección»: por modelo y color, cada talla con su estado; vigencia y procedencia plegadas.
    await accion(page, 'Ver selección').click();
    const detalle = page.locator('#seleccion-detalle');
    await expect(detalle).toBeVisible();
    await expect(detalle.locator('.seleccion-grupo-nombre')).toHaveText([/^AIR FORCE T19 · BLANCO /, /^AIR FORCE T19 · NEGRO /, /^CAMPUS T19 · VERDE /]);
    const t39 = detalle.locator('.detalle-talla').filter({ hasText: 'Talla 39' });
    await expect(t39.locator('summary')).toHaveText(/Talla 39\s*disponible/);
    await expect(t39.getByText(/^Procedencia:/)).toBeHidden();
    await t39.locator('summary').click();
    await expect(t39.getByText(/^Vigencia: /)).toBeVisible();
    await expect(t39.getByText('Procedencia: registro manual')).toBeVisible();
    await expect(detalle).toBeInViewport();
    const cajaDetalle = await detalle.boundingBox();
    expect(cajaDetalle && cajaDetalle.y >= 0, 'el detalle cabe en la pantalla').toBe(true);
    await capturar(page, browserName, `ver-seleccion-${ancho}x${alto}`);
    // «Ir al color» cierra el detalle y lleva a la talla seleccionada.
    await detalle.locator('.seleccion-grupo').filter({ hasText: 'CAMPUS T19 · VERDE' }).getByRole('button', { name: /^Ir a CAMPUS T19 · VERDE/ }).click();
    await expect(detalle).toBeHidden();
    await expect(talla(page, 'verde', '40')).toBeFocused();
    await expect(talla(page, 'verde', '40')).toBeInViewport({ ratio: 1 });

    // La última talla del catálogo se alcanza por encima de la barra, también con un plegable abierto.
    for (const panel of ['', 'Cambiar estado', 'Ver selección']) {
      if (panel) await accion(page, panel).click();
      // El espacio libre bajo el catálogo se ajusta al alto medido de la barra en el siguiente fotograma.
      const fotogramas = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
      await fotogramas();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await fotogramas();
      const ultima = await talla(page, 'ultimo', '45').evaluate((n) => ({ abajo: n.getBoundingClientRect().bottom, dock: document.querySelector('#dock-inferior').getBoundingClientRect().top }));
      expect(ultima.abajo, `última talla por encima de la barra${panel ? ` con «${panel}» abierto` : ''}`).toBeLessThanOrEqual(ultima.dock);
      if (panel) await page.keyboard.press('Escape');
    }
    await talla(page, 'ultimo', '45').click();
    await expect(talla(page, 'ultimo', '45')).toHaveAttribute('aria-pressed', 'true');
    await capturar(page, browserName, `ultima-talla-${ancho}x${alto}`);

    // Una acción desde «Cambiar estado» lleva a su confirmación (sin dejar el plegable abierto debajo).
    await accion(page, 'Cambiar estado').click();
    await accion(page, 'Dejar por revisar').click();
    await expect(dialogo(page)).toBeVisible();
    await expect(accion(page, 'Cambiar estado')).toHaveAttribute('aria-expanded', 'false');
    await capturar(page, browserName, `confirmacion-${ancho}x${alto}`);
    await dialogo(page).getByRole('button', { name: 'Cancelar' }).click();
    await expect(accion(page, 'Cambiar estado')).toBeFocused();
    expect(problemas).toEqual([]);
  });
}

// ======================================================================== 9. separación entre modelos
for (const [ancho, alto] of [[360, 740], [390, 844], [1440, 900]]) {
  test(`separación entre modelos a ${ancho} px: borde de la tarjeta, espacio entre modelos y separadores de color más suaves`, async ({ page, browserName }) => {
    await page.setViewportSize({ width: ancho, height: alto });
    await abrirPanel(page);
    const medir = (nombre) => tarjeta(page, nombre).evaluate((li) => {
      const art = li.querySelector('.producto-articulo');
      const e = getComputedStyle(art);
      const filas = [...art.querySelectorAll('.variante')];
      const caja = art.getBoundingClientRect();
      const dentro = [...art.querySelectorAll('.producto-cuerpo, .producto-botones, .variante, .talla')]
        .every((n) => { const r = n.getBoundingClientRect(); return r.left >= caja.left && r.right <= caja.right && r.top >= caja.top && r.bottom <= caja.bottom; });
      return {
        borde: e.borderTopWidth, colorBorde: e.borderTopColor, radio: e.borderTopLeftRadius, fondo: e.backgroundColor,
        separador: filas.length ? getComputedStyle(filas[0]).borderTopColor : null, colores: filas.length, dentro,
        top: caja.top, bottom: caja.bottom
      };
    });
    const luz = (rgb) => { const [r, g, b] = rgb.match(/\d+/g).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const campus = await medir('CAMPUS T19');
    const ultimo = await medir('ULTIMO T19');
    const air = await medir('AIR FORCE T19');
    for (const [nombre, m] of [['CAMPUS', campus], ['ULTIMO', ultimo], ['AIR FORCE', air]]) {
      expect(m.borde, `${nombre}: borde exterior`).toBe('1px');
      expect(m.colorBorde, `${nombre}: color del borde (--linea-fuerte)`).toBe('rgb(201, 201, 195)');
      expect(m.radio).toBe('12px');
      expect(m.fondo).toBe('rgb(255, 255, 255)');
      expect(m.dentro, `${nombre}: cabecera, botones, colores y tallas dentro del borde`).toBe(true);
      expect(luz(m.separador), `${nombre}: el separador entre colores es más suave que el borde`).toBeGreaterThan(luz(m.colorBorde));
    }
    expect(campus.colores).toBe(1);
    expect(air.colores).toBe(3);
    expect(Math.round(ultimo.top - campus.bottom), 'espacio entre dos modelos seguidos').toBeGreaterThanOrEqual(24);
    const d = await revisarDisposicion(page);
    expect(d.desborde).toBe(0);
    // Capturas: dos modelos seguidos de un color, y uno de varios colores.
    // Las fotos tienen carga diferida: se espera a que las visibles terminen antes de capturar.
    const fotosVisibles = () => page.waitForFunction(() => [...document.images]
      .filter((i) => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; })
      .every((i) => i.complete && i.naturalWidth > 0));
    await tarjeta(page, 'CAMPUS T19').evaluate((n) => window.scrollTo(0, window.scrollY + n.getBoundingClientRect().top - 16));
    await fotosVisibles();
    await capturar(page, browserName, `separacion-dos-modelos-${ancho}`);
    await tarjeta(page, 'AIR FORCE T19').evaluate((n) => window.scrollTo(0, window.scrollY + n.getBoundingClientRect().top - 16));
    await fotosVisibles();
    await capturar(page, browserName, `separacion-varios-colores-${ancho}`);
    expect(problemas).toEqual([]);
  });
}

// ======================================================================== 8. búsqueda pendiente
/* Experimento controlado del fallo visto en etapa18/seleccion.spec.js:257: el repintado de la búsqueda
 * (120 ms después de escribir) cae EXACTAMENTE entre pulsar y soltar una talla. La búsqueda cambia de
 * «T19» a «t19»: el mismo resultado y la misma disposición, así que lo único que pasa es que la lista se
 * vuelve a crear. Se mantiene pulsado 400 ms (el repintado ocurre a los 120). */
test('una talla pulsada mientras la búsqueda está por repintar no pierde el clic (ratón y teclado)', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await abrirPanel(page);
  const objetivo = talla(page, 'blanco', '40');
  await centrar(objetivo);
  const caja = await objetivo.boundingBox();
  if (!caja) throw new Error('sin caja');
  const marcar = () => page.evaluate(() => { document.querySelector('#lista-productos > li').dataset.prueba = 'vieja'; });
  const repintada = () => page.evaluate(() => !document.querySelector('#lista-productos > li').dataset.prueba);
  // Escribir en el buscador SIN desplazar la página (fill() lo llevaría a la vista y la talla dejaría de
  // estar bajo el puntero): el mismo evento «input» que produce el teclado.
  const escribir = (texto) => page.evaluate((t) => {
    const campo = /** @type {HTMLInputElement} */ (document.querySelector('#buscar'));
    campo.value = t;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  }, texto);

  // Ratón: pulsar → (repintado pendiente) → soltar.
  await marcar();
  await escribir('t19');
  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.up();
  await expect(objetivo, 'el clic seleccionó la talla').toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#seleccion-resumen')).toContainText('1 talla seleccionada');
  await expect.poll(repintada, { message: 'la búsqueda se aplicó (después de soltar)' }).toBe(true);
  // WebKit no da el foco a un botón al pulsarlo con el ratón: ahí solo se comprueba con el teclado.
  if (browserName !== 'webkit') await expect(objetivo, 'la talla repintada conserva el foco').toBeFocused();

  // Teclado: Espacio activa al soltar la tecla; el repintado pendiente cae entre bajar y subir.
  await marcar();
  await objetivo.focus();
  await escribir('T19');
  await page.keyboard.down('Space');
  await page.waitForTimeout(400);
  await page.keyboard.up('Space');
  await expect(objetivo, 'Espacio quitó la talla').toHaveAttribute('aria-pressed', 'false');
  await expect.poll(repintada).toBe(true);
  await expect(objetivo).toBeFocused();
  await expect(barra(page)).toBeHidden();
  expect(problemas).toEqual([]);
});

// ======================================================================== 7. escritorio
test('escritorio: resumen y acciones en la barra, sin bloques de detalle entre las tarjetas', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await abrirPanel(page);
  await centrar(talla(page, 'blanco', '40'));
  const antes = await posicion(talla(page, 'negro', '39'));
  await talla(page, 'blanco', '40').click();
  // Seleccionar no cambia la altura de nada en el catálogo (antes aparecía un bloque de detalle).
  const despues = await posicion(talla(page, 'negro', '39'));
  expect(despues.top).toBe(antes.top);
  expect(despues.y).toBe(antes.y);
  await talla(page, 'verde', '40').click();
  await expect(page.locator('#lista-productos .detalle-seleccion')).toHaveCount(0);
  for (const def of Object.values(ACCIONES)) await expect(accion(page, def.boton)).toBeVisible();
  await expect(accion(page, 'Cambiar estado')).toBeHidden();
  await expect(page.locator('#seleccion-resumen')).toHaveText('2 tallas seleccionadas · 2 modelos · 2 colores');
  const caja = await barra(page).boundingBox();
  expect(caja && caja.height <= 140, 'barra de dos filas en escritorio').toBe(true);
  const d = await revisarDisposicion(page);
  expect(d.desborde).toBe(0);
  expect(d.pequenos).toEqual([]);
  await capturar(page, browserName, 'tablero-seleccion-1280');
  await accion(page, 'Ver selección').click();
  await expect(page.locator('#seleccion-detalle')).toBeVisible();
  await capturar(page, browserName, 'ver-seleccion-1280');
  await page.keyboard.press('Escape');
  await expect(page.locator('#seleccion-detalle')).toBeHidden();
  await expect(accion(page, 'Ver selección')).toBeFocused();
  expect(problemas).toEqual([]);
});
