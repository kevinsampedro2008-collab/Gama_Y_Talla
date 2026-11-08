// @ts-check
/* Etapa 15B · Gestión de disponibilidad desde el panel.
 *
 * SOLO contra el stack local desechable de Supabase y la tienda servida en 127.0.0.1:8765.
 * Usuarios y catálogo FICTICIOS, creados y borrados por cada navegador. Necesita el catálogo
 * local vacío al empezar (como 15A); deja todo como lo encontró.
 *
 *   npx playwright test tests/etapa15 --workers=1
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PANEL, SITIO, entorno, servicio, crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, borrarCatalogo,
  configurarPanel, ingresar, revisarDisposicion, crearCatalogoDisponibilidad, leerTallas, ajustarTalla,
  leerProductos, historialDe, limpiarRestosDePruebas
} from './ayudas-panel.js';

test.describe.configure({ mode: 'serial' });

const CAPTURAS = path.join(os.tmpdir(), 'gama-talla-15b-capturas');
const ANCHOS = [360, 390, 768, 1024, 1440];
let admin; let cat; let sufijo;

test.beforeAll(async ({}, info) => {
  entorno();
  await limpiarRestosDePruebas();
  sufijo = `${info.project.name}-${Date.now().toString(36)}`;
  admin = await crearUsuario(`disp-${sufijo}@gamaytalla.test`);
  await hacerAdmin(admin.id);
  fs.mkdirSync(CAPTURAS, { recursive: true });
});

test.afterAll(async () => {
  await borrarCatalogo(cat).catch(() => null);
  if (admin) { await quitarAdmin(admin.id).catch(() => null); await borrarUsuario(admin.id); }
});

test.beforeEach(async ({ page }) => {
  // Cada prueba empieza con el mismo catálogo ficticio, recién creado.
  await borrarCatalogo(cat).catch(() => null);
  cat = await crearCatalogoDisponibilidad(sufijo);
  await configurarPanel(page);
  await page.goto(PANEL);
  await ingresar(page, admin);
  await expect(page.locator('#lista-productos > li')).toHaveCount(2);
});

const talla = (page, color, t) => page.locator(`.talla[data-talla-id="${cat.talla(color, t)}"]`);
const barra = (page) => page.locator('#barra-acciones');
const dialogo = (page) => page.locator('#dialogo-accion');
const resultado = (page) => page.locator('#resultado-accion');
const accion = (page, nombre) => barra(page).getByRole('button', { name: nombre, exact: true });
const confirmar = (page, nombre) => dialogo(page).getByRole('button', { name: nombre, exact: true });

// «AAAA-MM-DD» y «HH:MM» de un instante, en hora de Colombia (UTC−5 fijo).
function enColombia(ms) {
  const d = new Date(ms - 5 * 3600e3).toISOString();
  return { dia: d.slice(0, 10), hora: d.slice(11, 16), iso: `${d.slice(0, 10)}T${d.slice(11, 16)}:00-05:00` };
}

test('selección: vacía, por UUID, de un solo color y se quita al cambiar la búsqueda', async ({ page }) => {
  await expect(barra(page)).toBeHidden();
  // Cada botón lleva el UUID real de su talla.
  for (const t of ['38', '39', '40']) await expect(talla(page, 'negro', t)).toHaveAttribute('data-talla-id', cat.talla('negro', t));
  await talla(page, 'negro', '38').click();
  // Con el teclado: la talla elegida conserva el foco (la lista no se repinta).
  await talla(page, 'negro', '40').focus();
  await page.keyboard.press('Space');
  await expect(talla(page, 'negro', '38')).toHaveAttribute('aria-pressed', 'true');
  await expect(talla(page, 'negro', '40')).toHaveAttribute('aria-pressed', 'true');
  await expect(talla(page, 'negro', '40')).toBeFocused();
  await expect(page.locator('#seleccion-resumen')).toContainText('2 tallas seleccionadas');
  await expect(page.locator('#seleccion-resumen')).toContainText('38, 40');
  await expect(page.locator('.detalle-seleccion li')).toHaveCount(2);

  // Otro color empieza una selección nueva.
  await talla(page, 'verde', '40').click();
  await expect(talla(page, 'negro', '38')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#seleccion-resumen')).toContainText('1 talla seleccionada');
  await talla(page, 'verde', '40').click();
  await expect(barra(page)).toBeHidden();

  // Si la búsqueda oculta el color elegido, la selección se quita.
  await talla(page, 'negro', '39').click();
  await page.getByLabel('Buscar por código interno, referencia, marca o modelo').fill(`ocul-${sufijo}`);
  await expect(page.locator('#lista-productos > li')).toHaveCount(1);
  await expect(barra(page)).toBeHidden();
  await expect(page.locator('#tablero-estado')).toContainText('Se quitó la selección');
});

test('filtros: un producto puede estar en varios estados a la vez', async ({ page }) => {
  await ajustarTalla(cat.talla('negro', '38'), { estado: 'AGOTADA' });
  await ajustarTalla(cat.talla('negro', '39'), { estado: 'CONFIRMADA', vigencia_desde: new Date(Date.now() - 3600e3).toISOString() });
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.locator('#lista-productos > li')).toHaveCount(2);
  const filtros = page.locator('#filtros');
  await filtros.getByRole('button', { name: /Con tallas disponibles/ }).click();
  await expect(page.locator('#lista-productos > li')).toHaveCount(1);
  await filtros.getByRole('button', { name: /Con tallas agotadas/ }).click();
  await expect(page.locator('#lista-productos > li')).toHaveCount(1);
  await filtros.getByRole('button', { name: /Con tallas por revisar/ }).click();
  await expect(page.locator('#lista-productos > li')).toHaveCount(1);
  await expect(page.locator('#lista-productos > li').first()).toContainText(`Disponibilidad ${sufijo}`);
  await filtros.getByRole('button', { name: /Con elementos ocultos/ }).click();
  await expect(page.locator('#lista-productos > li')).toHaveCount(2);
  await expect(filtros.getByRole('button', { name: /Con elementos ocultos/ })).toHaveAttribute('aria-pressed', 'true');
  await filtros.getByRole('button', { name: /^Todas/ }).click();
  await expect(page.locator('#lista-productos > li')).toHaveCount(2);
});

test('confirmación del proveedor: fecha del servidor, vigencia predeterminada y publicación conservada', async ({ page }) => {
  const publicado = new Date(Date.now() - 30 * 3600e3).toISOString();
  await ajustarTalla(cat.talla('negro', '38'), { publicado_en: publicado });
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await talla(page, 'negro', '38').click();
  await talla(page, 'negro', '39').click();
  const antes = Date.now();
  await accion(page, 'Confirmó el proveedor').click();
  await expect(dialogo(page)).toContainText('Úsala solo cuando el proveedor te haya confirmado la disponibilidad directamente.');
  await expect(dialogo(page).getByLabel('Horas de vigencia')).toHaveValue('48');
  // Doble clic: una sola petición por talla.
  let llamadas = 0;
  page.on('request', (r) => { if (r.url().includes('/rpc/fn_confirmar_por_proveedor')) llamadas += 1; });
  await confirmar(page, 'Confirmar disponibilidad').dblclick();
  await expect(resultado(page)).toContainText('2 tallas confirmadas por el proveedor');
  expect(llamadas).toBe(2);
  const filas = await leerTallas([cat.talla('negro', '38'), cat.talla('negro', '39')]);
  for (const f of Object.values(filas)) {
    expect(f.estado).toBe('CONFIRMADA');
    expect(f.origen).toBe('proveedor');
    expect(f.vigencia_desde).toBe(f.confirmado_en);
    expect(Date.parse(f.confirmado_en)).toBeGreaterThan(antes - 120000);
    expect((Date.parse(f.vence_en) - Date.parse(f.vigencia_desde)) / 3600e3).toBe(48);
  }
  expect(Date.parse(filas[cat.talla('negro', '38')].publicado_en)).toBe(Date.parse(publicado));
  // Los datos vienen del servidor: el estado efectivo es el de Supabase.
  await expect(talla(page, 'negro', '38')).toHaveText('38, disponible');
  await expect(page.locator('#barra-acciones')).toBeHidden();
});

test('nueva publicación: fecha original en hora de Colombia, aunque el computador esté en otra zona', async ({ browser }) => {
  const contexto = await browser.newContext({ timezoneId: 'Asia/Tokyo' });
  const page = await contexto.newPage();
  await configurarPanel(page);
  await page.goto(PANEL);
  await ingresar(page, admin);
  await expect(page.locator('#lista-productos > li')).toHaveCount(2);
  await talla(page, 'negro', '40').click();
  await talla(page, 'negro', '41').click();
  await accion(page, 'Nueva publicación').click();
  const fechaCampo = dialogo(page).getByLabel('Fecha de la publicación');
  const horaCampo = dialogo(page).getByLabel('Hora (Colombia, UTC−5)');
  await expect(fechaCampo).toHaveValue('');      // no se rellena con «ahora»
  await expect(horaCampo).toHaveValue('');
  await confirmar(page, 'Registrar publicación').click();
  await expect(dialogo(page).getByRole('alert')).toHaveText('Escribe la fecha y la hora en que el proveedor publicó el modelo.');

  const futura = enColombia(Date.now() + 3 * 3600e3);
  await fechaCampo.fill(futura.dia);
  await horaCampo.fill(futura.hora);
  await confirmar(page, 'Registrar publicación').click();
  await expect(dialogo(page).getByRole('alert')).toContainText('posterior a la hora actual');

  const pub = enColombia(Math.floor((Date.now() - 5 * 3600e3) / 60000) * 60000);
  await fechaCampo.fill(pub.dia);
  await horaCampo.fill(pub.hora);
  await dialogo(page).getByLabel('Horas de vigencia').fill('61');
  await confirmar(page, 'Registrar publicación').click();
  await expect(dialogo(page).getByRole('alert')).toHaveText('Las horas de vigencia deben ser un número entero entre 1 y 60.');
  await dialogo(page).getByLabel('Horas de vigencia').fill('24');
  await expect(dialogo(page).locator('#accion-previa')).toContainText('La vigencia irá del');
  await confirmar(page, 'Registrar publicación').click();
  await expect(resultado(page)).toContainText('2 tallas confirmadas por publicación');
  const filas = await leerTallas([cat.talla('negro', '40'), cat.talla('negro', '41')]);
  for (const f of Object.values(filas)) {
    expect(Date.parse(f.publicado_en), 'la hora escrita es hora de Colombia').toBe(Date.parse(pub.iso));
    expect(f.vigencia_desde).toBe(f.publicado_en);
    expect(f.vigencia_horas).toBe(24);
    expect(f.origen).toBe('publicacion');
  }
  await contexto.close();
});

test('publicación antigua: la vigencia ya terminó y la talla queda por revisar', async ({ page }) => {
  await talla(page, 'negro', '42').click();
  await accion(page, 'Nueva publicación').click();
  const vieja = enColombia(Date.now() - 4 * 24 * 3600e3);
  await dialogo(page).getByLabel('Fecha de la publicación').fill(vieja.dia);
  await dialogo(page).getByLabel('Hora (Colombia, UTC−5)').fill(vieja.hora);
  await expect(dialogo(page).locator('#accion-previa')).toContainText('ya terminó');
  await confirmar(page, 'Registrar publicación').click();
  await expect(resultado(page)).toContainText('confirmada por publicación');
  await expect(talla(page, 'negro', '42')).toHaveText('42, por revisar');
  expect((await leerTallas([cat.talla('negro', '42')]))[cat.talla('negro', '42')].estado).toBe('CONFIRMADA');
});

test('el servidor rechaza una publicación futura aunque la interfaz no la detecte', async ({ page }) => {
  // Se altera la petición en vuelo para enviar una fecha futura: la base la rechaza.
  await page.route('**/rpc/fn_confirmar_por_publicacion*', async (r) => {
    const cuerpo = JSON.parse(r.request().postData() || '{}');
    cuerpo.p_publicado_en = new Date(Date.now() + 3600e3).toISOString();
    await r.continue({ postData: JSON.stringify(cuerpo) });
  });
  await talla(page, 'negro', '38').click();
  await talla(page, 'negro', '39').click();
  await accion(page, 'Nueva publicación').click();
  const pub = enColombia(Date.now() - 3600e3);
  await dialogo(page).getByLabel('Fecha de la publicación').fill(pub.dia);
  await dialogo(page).getByLabel('Hora (Colombia, UTC−5)').fill(pub.hora);
  await confirmar(page, 'Registrar publicación').click();
  await expect(resultado(page)).toContainText('No se aplicó ningún cambio');
  await expect(resultado(page)).toContainText('38: no se aplicó (la fecha es posterior a la hora actual del servidor)');
  await expect(resultado(page)).toContainText('39: no se aplicó (no se intentó)');
  const filas = await leerTallas([cat.talla('negro', '38'), cat.talla('negro', '39')]);
  expect(Object.values(filas).every((f) => f.estado === 'REVISAR' && f.publicado_en === null)).toBe(true);
});

test('agotada y por revisar: confirmación, nota, transiciones y sin borrar nada', async ({ page }) => {
  await talla(page, 'negro', '38').click();
  await talla(page, 'negro', '39').click();
  await accion(page, 'Marcar agotada').click();
  await expect(dialogo(page)).toContainText(`Disponibilidad ${sufijo}`);
  await expect(dialogo(page)).toContainText('Negro');
  await expect(dialogo(page)).toContainText('38 (por revisar), 39 (por revisar)');
  await dialogo(page).getByLabel('Nota interna (opcional)').fill('Sin existencias según el proveedor');
  await confirmar(page, 'Marcar agotada').click();
  await expect(resultado(page)).toContainText('2 tallas marcadas agotadas');
  await expect(talla(page, 'negro', '38')).toHaveText('38, agotada');
  let filas = await leerTallas([cat.talla('negro', '38'), cat.talla('negro', '39')]);
  for (const f of Object.values(filas)) { expect(f.estado).toBe('AGOTADA'); expect(f.nota).toBe('Sin existencias según el proveedor'); expect(f.vigencia_desde).toBeNull(); }

  // Agotada → por revisar: no se inventan fechas.
  await talla(page, 'negro', '38').click();
  await accion(page, 'Dejar por revisar').click();
  await confirmar(page, 'Dejar por revisar').click();
  await expect(resultado(page)).toContainText('Talla 38 dejada por revisar');
  filas = await leerTallas([cat.talla('negro', '38')]);
  expect(filas[cat.talla('negro', '38')]).toMatchObject({ estado: 'REVISAR', vigencia_desde: null, confirmado_en: null, publicado_en: null });

  // Por revisar → disponible → por revisar: la vigencia anterior queda en el historial, no se renueva.
  await talla(page, 'negro', '38').click();
  await accion(page, 'Confirmó el proveedor').click();
  await confirmar(page, 'Confirmar disponibilidad').click();
  await expect(talla(page, 'negro', '38')).toHaveText('38, disponible');
  const confirmada = (await leerTallas([cat.talla('negro', '38')]))[cat.talla('negro', '38')];
  await talla(page, 'negro', '38').click();
  await accion(page, 'Dejar por revisar').click();
  await confirmar(page, 'Dejar por revisar').click();
  await expect(talla(page, 'negro', '38')).toHaveText('38, por revisar');
  const revisada = (await leerTallas([cat.talla('negro', '38')]))[cat.talla('negro', '38')];
  expect(revisada.estado).toBe('REVISAR');
  expect(revisada.vigencia_desde).toBe(confirmada.vigencia_desde);
  const total = await servicio('GET', `/rest/v1/tallas?select=id&variante_id=eq.${cat.negro.id}`);
  expect(total.length, 'ninguna talla se borró').toBe(6);
});

test('reactivación explícita y elementos ocultos que siguen ocultos', async ({ page }) => {
  // Talla desactivada de un color visible: la confirmación la reactiva y lo avisa antes.
  await talla(page, 'negro', '43').click();
  await accion(page, 'Confirmó el proveedor').click();
  await expect(dialogo(page)).toContainText('La talla 43 está desactivada: al confirmarla se reactivará');
  await confirmar(page, 'Confirmar disponibilidad').click();
  await expect(resultado(page)).toContainText('Talla 43 confirmada por el proveedor');
  expect((await leerTallas([cat.talla('negro', '43')]))[cat.talla('negro', '43')].activa).toBe(true);
  await expect(talla(page, 'negro', '43')).toHaveText('43, disponible');

  // Color oculto y producto oculto: se confirma la talla, pero no se publica nada.
  await talla(page, 'verde', '40').click();
  await accion(page, 'Confirmó el proveedor').click();
  await expect(dialogo(page)).toContainText('Este color está oculto en la tienda y seguirá oculto');
  await confirmar(page, 'Confirmar disponibilidad').click();
  await expect(resultado(page)).toContainText('confirmada por el proveedor');
  await talla(page, 'gris', '39').click();
  await accion(page, 'Marcar agotada').click();
  await expect(dialogo(page)).toContainText('El producto está oculto en la tienda y seguirá oculto');
  await confirmar(page, 'Marcar agotada').click();
  await expect(resultado(page)).toContainText('marcada agotada');
  const productos = await leerProductos(cat.productos.map((p) => p.id));
  const visible = productos.find((p) => p.id === cat.productos[0].id);
  const oculto = productos.find((p) => p.id === cat.productos[1].id);
  expect(oculto.activo).toBe(false);
  expect(visible.variantes.find((v) => v.id === cat.verde.id).activa).toBe(false);
  await expect(talla(page, 'verde', '40')).toHaveText('40, no visible en la tienda');
});

test('fallo parcial: se informa qué se aplicó y qué no', async ({ page }) => {
  let n = 0;
  await page.route('**/rpc/fn_confirmar_por_proveedor*', async (r) => {
    n += 1;
    if (n === 2) {
      await r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'No existe la talla x', details: null, hint: null }) });
    } else await r.continue();
  });
  for (const t of ['38', '39', '40']) await talla(page, 'negro', t).click();
  await accion(page, 'Confirmó el proveedor').click();
  await confirmar(page, 'Confirmar disponibilidad').click();
  await expect(resultado(page)).toContainText('Se aplicó a 2 de 3 tallas');
  await expect(resultado(page)).toContainText('39: no se aplicó (la talla ya no existe)');
  await expect(resultado(page)).toContainText('no fue una operación única');
  const filas = await leerTallas(['38', '39', '40'].map((t) => cat.talla('negro', t)));
  expect(filas[cat.talla('negro', '38')].estado).toBe('CONFIRMADA');
  expect(filas[cat.talla('negro', '39')].estado).toBe('REVISAR');
  expect(filas[cat.talla('negro', '40')].estado).toBe('CONFIRMADA');
});

// Las líneas del resultado, una por talla.
const lineas = (page) => resultado(page).locator('.resultado-lineas li');
const SIN_CAMBIOS = 'Sin cambios por ahora; la petición todavía podría aplicarse.';
const CAMBIO_SIN_ORIGEN = 'Cambió después de la comprobación previa, pero no sabemos por qué operación.';

// Las cabeceras con las que el panel envió una petición, para reenviarla más tarde desde Node.
async function cabecerasDe(peticion) {
  const todas = await peticion.allHeaders();
  const utiles = ['authorization', 'apikey', 'content-type', 'accept', 'prefer', 'content-profile', 'accept-profile', 'x-client-info'];
  return Object.fromEntries(Object.entries(todas).filter(([k]) => utiles.includes(k.toLowerCase())));
}

test('conexión perdida: resultado no confirmado, estado actual y sin repetir nada', async ({ page }) => {
  // 1) La petición llega a Supabase y se aplica, pero la respuesta se pierde. La relectura
  //    muestra el estado actual sin atribuírselo a la petición, y nada se repite.
  let agotadas = 0;
  await page.route('**/rpc/fn_marcar_agotada*', async (r) => { agotadas += 1; await r.fetch(); await r.abort('internetdisconnected'); });
  await talla(page, 'negro', '38').click();
  await talla(page, 'negro', '39').click();
  await accion(page, 'Marcar agotada').click();
  await confirmar(page, 'Marcar agotada').click();
  await expect(resultado(page).getByRole('heading')).toHaveText('Resultado no confirmado');
  await expect(lineas(page)).toHaveCount(2);
  await expect(lineas(page).nth(0)).toContainText('38: resultado no confirmado (se perdió la respuesta del servidor). Estado actual: guardada como agotada');
  await expect(lineas(page).nth(0)).toContainText(CAMBIO_SIN_ORIGEN);
  await expect(lineas(page).nth(1)).toHaveText('39: no se aplicó (no se intentó)');
  await expect(resultado(page)).toContainText('No sabemos si la petición de la talla 38 se aplicó.');
  await expect(resultado(page)).not.toContainText('marcada agotada');
  expect(agotadas, 'sin reintentos automáticos').toBe(1);
  const filas = await leerTallas([cat.talla('negro', '38'), cat.talla('negro', '39')]);
  expect(filas[cat.talla('negro', '38')].estado).toBe('AGOTADA');
  expect(filas[cat.talla('negro', '39')].estado).toBe('REVISAR');
  // Los datos se recargan y la selección se vacía: cualquier acción posterior exige elegir y confirmar.
  await expect(talla(page, 'negro', '38')).toHaveText('38, agotada');
  await expect(talla(page, 'negro', '38')).toHaveAttribute('aria-pressed', 'false');
  await expect(barra(page)).toBeHidden();
  await talla(page, 'negro', '39').click();
  await accion(page, 'Marcar agotada').click();
  await expect(dialogo(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialogo(page)).toBeHidden();
  expect(agotadas, 'abrir el diálogo no envía nada').toBe(1);
  await talla(page, 'negro', '39').click(); // se quita la selección de prueba
  await expect(barra(page)).toBeHidden();
  await page.unroute('**/rpc/fn_marcar_agotada*');

  // 2) La petición no sale y la relectura encuentra la talla igual: tampoco se afirma que fallara.
  await page.route('**/rpc/fn_confirmar_por_proveedor*', (r) => r.abort('internetdisconnected'));
  await talla(page, 'negro', '40').click();
  await accion(page, 'Confirmó el proveedor').click();
  await confirmar(page, 'Confirmar disponibilidad').click();
  await expect(lineas(page)).toHaveCount(1);
  await expect(lineas(page).first()).toContainText('40: resultado no confirmado (se perdió la respuesta del servidor). Estado actual: guardada como por revisar');
  await expect(lineas(page).first()).toContainText(SIN_CAMBIOS);
  await expect(resultado(page)).not.toContainText('no se aplicó');
  expect((await leerTallas([cat.talla('negro', '40')]))[cat.talla('negro', '40')].estado).toBe('REVISAR');

  // 3) Tampoco se puede leer el estado actual: nada se repite, la lista se vacía y se pide actualizar.
  let lecturas = 0;
  await page.route('**/rpc/fn_admin_tallas**', async (r) => {
    const cuerpo = r.request().postData() || '';
    if (cuerpo.includes('p_variante_id') && (lecturas += 1) > 1) await r.abort('internetdisconnected');
    else await r.continue();
  });
  await talla(page, 'negro', '41').click();
  await accion(page, 'Confirmó el proveedor').click();
  await confirmar(page, 'Confirmar disponibilidad').click();
  await expect(resultado(page).getByRole('heading')).toHaveText('Resultado no confirmado');
  await expect(lineas(page)).toHaveText(['41: resultado no confirmado (se perdió la respuesta del servidor). No pudimos leer su estado actual.']);
  await expect(resultado(page)).not.toContainText('Estado actual:');
  await expect(resultado(page)).toContainText('Tampoco pudimos leer el estado actual');
  await expect(page.getByRole('heading', { name: 'Comprueba el resultado antes de seguir' })).toBeVisible();
  await expect(page.locator('#lista-productos > li')).toHaveCount(0);
  await page.unroute('**/rpc/fn_admin_tallas**');
  await page.unroute('**/rpc/fn_confirmar_por_proveedor*');
  await page.locator('#tablero-aviso').getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.locator('#lista-productos > li')).toHaveCount(2);
  await expect(talla(page, 'negro', '41')).toBeEnabled();
  await expect(talla(page, 'negro', '41')).toHaveAttribute('aria-pressed', 'false');
});

test('respuesta perdida de «Dejar por revisar»: una fila AGOTADA no se anuncia como revisada', async ({ page }) => {
  // La escritura llega, otra cuenta marca la talla agotada y la respuesta se pierde.
  let escrituras = 0;
  await page.route('**/rest/v1/tallas*', async (r) => {
    if (r.request().method() !== 'PATCH') return r.continue();
    escrituras += 1;
    await r.fetch();
    await ajustarTalla(cat.talla('negro', '38'), { estado: 'AGOTADA' });
    await r.abort('internetdisconnected');
  });
  const antes = (await leerTallas([cat.talla('negro', '38')]))[cat.talla('negro', '38')];
  await talla(page, 'negro', '38').click();
  await accion(page, 'Dejar por revisar').click();
  await confirmar(page, 'Dejar por revisar').click();
  await expect(resultado(page).getByRole('heading')).toHaveText('Resultado no confirmado');
  await expect(lineas(page)).toHaveCount(1);
  await expect(lineas(page).first()).toContainText('38: resultado no confirmado (se perdió la respuesta del servidor). Estado actual: guardada como agotada');
  await expect(lineas(page).first()).toContainText(CAMBIO_SIN_ORIGEN);
  await expect(resultado(page)).not.toContainText('dejada por revisar');
  await expect(resultado(page)).not.toContainText('guardada como por revisar');
  const despues = (await leerTallas([cat.talla('negro', '38')]))[cat.talla('negro', '38')];
  expect(despues.estado).toBe('AGOTADA');
  expect(despues.actualizado_en).not.toBe(antes.actualizado_en);
  expect(escrituras).toBe(1);
  await expect(talla(page, 'negro', '38')).toHaveText('38, agotada');
});

test('respuesta perdida de «Nueva publicación»: no se le atribuye una confirmación ajena', async ({ page }) => {
  // La petición no llega, pero antes de releer la talla queda CONFIRMADA por otra vía.
  let ajena = null;
  let publicaciones = 0;
  await page.route('**/rpc/fn_confirmar_por_publicacion*', async (r) => {
    publicaciones += 1;
    await ajustarTalla(ajena.id, ajena.campos);
    await r.abort('internetdisconnected');
  });
  const pedida = enColombia(Math.floor((Date.now() - 5 * 3600e3) / 60000) * 60000);
  const publicar = async (t) => {
    await talla(page, 'negro', t).click();
    await accion(page, 'Nueva publicación').click();
    await dialogo(page).getByLabel('Fecha de la publicación').fill(pedida.dia);
    await dialogo(page).getByLabel('Hora (Colombia, UTC−5)').fill(pedida.hora);
    await confirmar(page, 'Registrar publicación').click();
  };

  // a) Otra acción: una confirmación directa del proveedor.
  const hace = new Date(Date.now() - 60e3).toISOString();
  ajena = { id: cat.talla('negro', '40'), campos: { estado: 'CONFIRMADA', origen: 'proveedor', confirmado_en: hace, vigencia_desde: hace, vigencia_horas: 48 } };
  await publicar('40');
  await expect(resultado(page).getByRole('heading')).toHaveText('Resultado no confirmado');
  await expect(lineas(page)).toHaveCount(1);
  await expect(lineas(page).first()).toContainText('40: resultado no confirmado (se perdió la respuesta del servidor). Estado actual: guardada como confirmada · procedencia: confirmación del proveedor');
  await expect(lineas(page).first()).toContainText(CAMBIO_SIN_ORIGEN);
  await expect(resultado(page)).not.toContainText('confirmada por publicación');
  const a = (await leerTallas([cat.talla('negro', '40')]))[cat.talla('negro', '40')];
  expect(a).toMatchObject({ estado: 'CONFIRMADA', origen: 'proveedor', publicado_en: null });

  // b) La misma acción con parámetros distintos: otra fecha de publicación.
  const otra = new Date(Date.now() - 10 * 3600e3).toISOString();
  ajena = { id: cat.talla('negro', '41'), campos: { estado: 'CONFIRMADA', origen: 'publicacion', publicado_en: otra, vigencia_desde: otra, vigencia_horas: 24 } };
  await publicar('41');
  await expect(resultado(page).getByRole('heading')).toHaveText('Resultado no confirmado');
  await expect(lineas(page).first()).toContainText('41: resultado no confirmado (se perdió la respuesta del servidor). Estado actual: guardada como confirmada · procedencia: publicación del proveedor');
  await expect(lineas(page).first()).toContainText(CAMBIO_SIN_ORIGEN);
  await expect(resultado(page)).not.toContainText('confirmada por publicación');
  const b = (await leerTallas([cat.talla('negro', '41')]))[cat.talla('negro', '41')];
  expect(Date.parse(b.publicado_en)).toBe(Date.parse(otra));
  expect(Date.parse(b.publicado_en)).not.toBe(Date.parse(pedida.iso));
  expect(publicaciones, 'una sola petición por intento, sin reintentos').toBe(2);
});

test('relectura sin cambios mientras la escritura sigue en camino: no se afirma que no se aplicó', async ({ page }) => {
  // El navegador pierde la petición, pero esta llega a Supabase DESPUÉS de la relectura.
  let enCamino = null;
  let escrituras = 0;
  await page.route('**/rpc/fn_marcar_agotada*', async (r) => {
    escrituras += 1;
    const p = r.request();
    enCamino = { url: p.url(), headers: await cabecerasDe(p), body: p.postData() };
    await r.abort('internetdisconnected');
  });
  let tardia = null;
  await page.route('**/rpc/fn_admin_tallas**', async (r) => {
    if (!enCamino || !(r.request().postData() || '').includes('p_variante_id')) return r.continue();
    const leida = await r.fetch();                     // la relectura ve la talla todavía sin cambios
    const { url, headers, body } = enCamino;
    enCamino = null;
    tardia = await fetch(url, { method: 'POST', headers, body }); // y entonces llega la escritura original
    await r.fulfill({ response: leida });
  });
  await talla(page, 'negro', '38').click();
  await accion(page, 'Marcar agotada').click();
  await confirmar(page, 'Marcar agotada').click();
  await expect(resultado(page).getByRole('heading')).toHaveText('Resultado no confirmado');
  await expect(lineas(page)).toHaveCount(1);
  await expect(lineas(page).first()).toContainText('38: resultado no confirmado (se perdió la respuesta del servidor). Estado actual: guardada como por revisar');
  await expect(lineas(page).first()).toContainText(SIN_CAMBIOS);
  await expect(resultado(page)).not.toContainText('no se aplicó');
  await expect(resultado(page)).not.toContainText('antes de aplicarse');
  // La petición sí terminó aplicándose: decir que no se aplicó habría sido falso.
  expect(tardia && tardia.status).toBe(200);
  expect((await leerTallas([cat.talla('negro', '38')]))[cat.talla('negro', '38')].estado).toBe('AGOTADA');
  expect(escrituras, 'el panel no la repitió').toBe(1);
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(talla(page, 'negro', '38')).toHaveText('38, agotada');
});

test('lote con conexión perdida: conserva lo confirmado, los fallos conocidos y lo no intentado', async ({ page }) => {
  let n = 0;
  await page.route('**/rpc/fn_confirmar_por_proveedor*', async (r) => {
    n += 1;
    if (n === 2) await r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'No existe la talla x', details: null, hint: null }) });
    else if (n === 3) { await r.fetch(); await r.abort('internetdisconnected'); }
    else await r.continue();
  });
  for (const t of ['38', '39', '40', '41']) await talla(page, 'negro', t).click();
  await accion(page, 'Confirmó el proveedor').click();
  await confirmar(page, 'Confirmar disponibilidad').click();
  await expect(resultado(page).getByRole('heading')).toHaveText('Resultado no confirmado');
  await expect(lineas(page)).toHaveCount(4);
  await expect(lineas(page).nth(0)).toHaveText('38: confirmada por el proveedor');
  await expect(lineas(page).nth(1)).toHaveText('39: no se aplicó (la talla ya no existe)');
  await expect(lineas(page).nth(2)).toContainText('40: resultado no confirmado (se perdió la respuesta del servidor). Estado actual: guardada como confirmada · procedencia: confirmación del proveedor');
  await expect(lineas(page).nth(2)).toContainText(CAMBIO_SIN_ORIGEN);
  await expect(lineas(page).nth(3)).toHaveText('41: no se aplicó (no se intentó)');
  await expect(resultado(page)).toContainText('No sabemos si la petición de la talla 40 se aplicó.');
  await expect(resultado(page)).toContainText('Cada talla se guardó por separado; no fue una operación única.');
  expect(n, 'se detiene tras perder la respuesta y no reintenta').toBe(3);
  const filas = await leerTallas(['38', '39', '40', '41'].map((t) => cat.talla('negro', t)));
  expect(filas[cat.talla('negro', '38')].estado).toBe('CONFIRMADA');
  expect(filas[cat.talla('negro', '39')].estado).toBe('REVISAR');
  expect(filas[cat.talla('negro', '40')].estado).toBe('CONFIRMADA');
  expect(filas[cat.talla('negro', '41')].estado).toBe('REVISAR');
});

test('selección desactualizada: si la talla cambió en otro lugar, no se aplica nada', async ({ page }) => {
  await talla(page, 'negro', '38').click();
  await accion(page, 'Confirmó el proveedor').click();
  await ajustarTalla(cat.talla('negro', '38'), { estado: 'AGOTADA' }); // otro administrador la cambia
  await confirmar(page, 'Confirmar disponibilidad').click();
  await expect(resultado(page)).toContainText('La disponibilidad cambió mientras revisabas');
  expect((await leerTallas([cat.talla('negro', '38')]))[cat.talla('negro', '38')].estado).toBe('AGOTADA');
  await expect(talla(page, 'negro', '38')).toHaveText('38, agotada');
});

test('sesión vencida y permiso retirado durante una acción', async ({ page }) => {
  // Sesión vencida en mitad del lote.
  await page.route('**/rpc/fn_confirmar_por_proveedor*', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST303', message: 'JWT expired', details: null, hint: null }) }));
  await talla(page, 'negro', '38').click();
  await accion(page, 'Confirmó el proveedor').click();
  await confirmar(page, 'Confirmar disponibilidad').click();
  await expect(page.getByRole('heading', { name: 'Panel de la tienda' })).toBeVisible();
  await expect(page.locator('#aviso-ingreso')).toContainText('Tu sesión terminó durante la operación. Se aplicó a 0 de 1 talla');
  await page.unroute('**/rpc/fn_confirmar_por_proveedor*');

  // Permiso retirado con el diálogo abierto: se comprueba antes de escribir y no se escribe nada.
  await ingresar(page, admin);
  await expect(page.locator('#lista-productos > li')).toHaveCount(2);
  await talla(page, 'negro', '39').click();
  await accion(page, 'Marcar agotada').click();
  await quitarAdmin(admin.id);
  await confirmar(page, 'Marcar agotada').click();
  await expect(page.getByRole('heading', { name: 'Esta cuenta no tiene acceso al panel' })).toBeVisible();
  expect((await leerTallas([cat.talla('negro', '39')]))[cat.talla('negro', '39')].estado).toBe('REVISAR');
  await hacerAdmin(admin.id);
});

test('historial reciente: autor y cambios comprensibles', async ({ page }) => {
  await talla(page, 'negro', '38').click();
  await accion(page, 'Marcar agotada').click();
  await dialogo(page).getByLabel('Nota interna (opcional)').fill('Confirmado por teléfono');
  await confirmar(page, 'Marcar agotada').click();
  await expect(resultado(page)).toContainText('marcada agotada');
  await page.getByRole('button', { name: 'Historial' }).click();
  const primero = page.locator('.historial-item').first();
  await expect(primero).toContainText(`Disponibilidad ${sufijo} · Negro · talla 38`);
  await expect(primero).toContainText('Por revisar → Agotada');
  await expect(primero).toContainText('nota: «Confirmado por teléfono»');
  await expect(primero.locator('.historial-quien')).toHaveText('Tú');
  const registros = await historialDe(cat.talla('negro', '38'));
  const ultimo = registros[registros.length - 1];
  expect(ultimo.autor).toBe(admin.id);
  expect(ultimo.cambios).toEqual(expect.arrayContaining(['estado', 'nota']));
  // Solo lectura: sin botones para editar, borrar ni restaurar.
  await expect(page.locator('#historial').getByRole('button', { name: /restaurar|deshacer|borrar|eliminar|editar/i })).toHaveCount(0);
});

test('la vista pública refleja los cambios (configuración inyectada solo en la prueba)', async ({ page }) => {
  test.skip(test.info().project.name !== 'chromium', 'Lectura de datos: basta un motor');
  await talla(page, 'negro', '38').click();
  await accion(page, 'Confirmó el proveedor').click();
  await confirmar(page, 'Confirmar disponibilidad').click();
  await expect(resultado(page)).toContainText('confirmada por el proveedor');
  const e = entorno();
  const r = await fetch(`${e.api}/rest/v1/catalogo_publico?id=eq.${encodeURIComponent(cat.productos[0].codigo_interno)}`, { headers: { apikey: e.publicable } });
  const vista = await r.json();
  expect(r.status).toBe(200);
  expect(vista[0].variantes[0].tallasDisponibles).toEqual(['38']);
  expect(vista.length, 'el producto oculto no aparece en la tienda').toBe(1);
  // La tienda real, con su configuración inyectada solo en esta página de prueba.
  const tienda = await page.context().newPage();
  await tienda.addInitScript(([url, clave]) => { window.GAMA_TALLA_CONFIG = { catalogoUrl: url, catalogoClave: clave }; },
    [`${e.api}/rest/v1/catalogo_publico?select=*&order=orden`, e.publicable]);
  await tienda.goto(`${SITIO}/?intro=no`);
  await tienda.waitForFunction("typeof estado !== 'undefined' && estado.catalogoListo === true", null, { timeout: 30000 });
  const enTienda = await tienda.evaluate((codigo) => estado.productos.find((p) => p.id === codigo)?.tallasDisponibles, cat.productos[0].codigo_interno);
  expect(enTienda).toEqual(['38']);
  await tienda.close();
});

test('disposición y capturas: selección y diálogo en los cinco anchos', async ({ page }) => {
  await talla(page, 'negro', '38').click();
  await talla(page, 'negro', '39').click();
  for (const ancho of ANCHOS) {
    await page.setViewportSize({ width: ancho, height: 860 });
    const d = await revisarDisposicion(page);
    expect(d.desborde, `sin desborde horizontal a ${ancho}px`).toBe(0);
    expect(d.pequenos, `controles de al menos 40px a ${ancho}px`).toEqual([]);
    await page.screenshot({ path: path.join(CAPTURAS, `${test.info().project.name}-${ancho}-seleccion.png`) });
    await accion(page, 'Nueva publicación').click();
    await expect(dialogo(page)).toBeVisible();
    await expect(dialogo(page).getByLabel('Fecha de la publicación')).toBeFocused();
    const dd = await page.evaluate(() => {
      const r = document.querySelector('#dialogo-accion').getBoundingClientRect();
      return { dentro: r.left >= 0 && r.right <= window.innerWidth + 1, desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    expect(dd.dentro && dd.desborde === 0, `diálogo dentro de la pantalla a ${ancho}px`).toBe(true);
    await page.screenshot({ path: path.join(CAPTURAS, `${test.info().project.name}-${ancho}-dialogo.png`) });
    await page.keyboard.press('Escape');
    await expect(dialogo(page)).toBeHidden();
  }
  await page.getByRole('button', { name: 'Historial' }).click();
  await page.screenshot({ path: path.join(CAPTURAS, `${test.info().project.name}-historial.png`), fullPage: true });
});
