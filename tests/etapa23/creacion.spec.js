// @ts-check
/* Etapa 23 · «Guardar lote como oculto» (alta de zapatillas nuevas) con el mismo guardado previo que las
 * actualizaciones: antes de subir fotos tiene que quedar guardado el borrador con sus archivos y nombres; antes de
 * enviar el alta, el cuerpo completo y su operación. Sin eso no se sube ni se crea nada, el trabajo sigue abierto y
 * el reintento usa los mismos identificadores, nombres de archivo y operación.
 *
 * SOLO contra el Supabase LOCAL y el entorno aislado. Modelos ficticios « P23».
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, entrarAlPanel, abrirImportador, importador, recargar, esperarGuardadoLocal, objetosDe, elegirCategoria, pegarVarias, prepararFotos20,
  ficha, color, estadoLocal, limpiar23, productos23, producto23, novedades, avisoNov, elegirProveedor, memoria, contarEscrituras, pie, PDFS23, MENSAJE, propios,
  fallarBorrador, restaurarBorrador, intentos
} from './ayudas23.js';

test.setTimeout(240000);
test.use({ actionTimeout: 15000 });

let admin;
let foto;
test.beforeAll(async () => { admin = await crearUsuario(`etapa23c-${Date.now()}@gamaytalla.test`); await hacerAdmin(admin.id); [foto] = await prepararFotos20(1); });
test.afterAll(async () => { await limpiar23(); await quitarAdmin(admin.id); await borrarUsuario(admin.id); });
test.beforeEach(async () => { await limpiar23(); });

const RPC = '**/rest/v1/rpc/fn_admin_guardar_producto';
const GUARDAR = /^Guardar lote como oculto/;
const sinRed = (l) => propios(l).filter((x) => !/127\.0\.0\.1:54321|ERR_|NetworkError|Load failed|access control|Failed to fetch|WebSocket/.test(x));
const estado = (f) => f.locator('.importador-estado');
const venta = (f) => color(f, 0).getByLabel(/^Precio de venta/);

/** Una publicación de WhatsApp con foto, lista para crearse como zapatilla nueva. */
async function prepararAlta(page, modelo, { conFoto = true } = {}) {
  const f = ficha(page, 0);
  await f.getByLabel(MENSAJE).fill(`NIKE ${modelo} HOMBRE $100.000\nTallas 40 al 42\nColor: GRIS`);
  await expect(f.getByRole('textbox', { name: /^Modelo/ })).toHaveValue(modelo);
  if (conFoto) {
    await f.locator('input[type="file"]').setInputFiles(foto);
    await expect(f.getByText('Lista · se subirá al guardar')).toBeVisible({ timeout: 30000 });
  }
  await elegirCategoria(f, 'URBANAS');
  await venta(f).fill('150000');
  return f;
}
const exportar = async (page, f, nombre) => {
  const [descarga] = await Promise.all([page.waitForEvent('download'), f.locator('.importador-estado').getByRole('button', { name: 'Exportar respaldo' }).click()]);
  const archivo = path.join(PDFS23, nombre);
  await descarga.saveAs(archivo);
  return JSON.parse(fs.readFileSync(archivo, 'utf8'));
};

test('creación normal: una subida y una escritura, y el borrador queda al día', async ({ page }) => {
  const problemas = await entrarAlPanel(page, admin);
  const e = contarEscrituras(page);
  await abrirImportador(page);
  const f = await prepararAlta(page, 'ALTA UNO P23');
  await importador(page).getByRole('button', { name: GUARDAR }).click();
  await expect(estado(f)).toContainText(/Guardada oculta · GT-/, { timeout: 60000 });
  expect([e.subir, e.guardar]).toEqual([1, 1]);
  const p = await producto23('ALTA UNO P23');
  expect([p.activo, p.variantes.length, p.variantes[0].fotos.length, p.variantes[0].tallas.length]).toEqual([false, 1, 1, 3]);
  await esperarGuardadoLocal(page);
  await expect(estado(f).getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
  expect(sinRed(problemas)).toEqual([]);
});

test('fallo del borrador antes de subir: cero subidas y cero escrituras; el trabajo sigue y se recupera con los mismos nombres', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  const e = contarEscrituras(page);
  await abrirImportador(page);
  const f = await prepararAlta(page, 'ALTA DOS P23');
  await esperarGuardadoLocal(page);
  await fallarBorrador(page, '"estado":"guardando"');
  await importador(page).getByRole('button', { name: GUARDAR }).click();
  await expect(estado(f)).toContainText('No se creó nada: este navegador no pudo guardar antes los datos y los archivos para recuperarla (falta espacio).', { timeout: 30000 });
  await expect(estado(f)).toContainText('se perdería al recargar');
  await expect(pie(page)).toContainText('1 no se creó porque este navegador no pudo guardar antes el borrador');
  await expect(pie(page)).not.toContainText('Se guardó 1');
  expect([e.subir, e.guardar]).toEqual([0, 0]);
  expect(await productos23()).toEqual([]);
  const primero = (await intentos(page))[0].fichas[0];
  expect(primero.objetos).toHaveLength(1); // el nombre del archivo ya estaba fijado
  await expect(estado(f).getByRole('button', { name: 'Reintentar' })).toBeVisible();
  // Se puede seguir preparando; y reintentar sin poder guardar tampoco sube nada.
  await venta(f).fill('155000');
  await estado(f).getByRole('button', { name: 'Reintentar' }).click();
  await expect.poll(async () => (await intentos(page)).length).toBe(2);
  await expect(estado(f)).toContainText('No se creó nada', { timeout: 30000 });
  expect([e.subir, e.guardar, (await intentos(page)).length]).toEqual([0, 0, 2]);
  // Exportar respaldo: datos, fotografía e identificadores del lote.
  const respaldo = await exportar(page, f, `alta-sin-guardar-${browserName}.json`);
  const ficha0 = respaldo.borrador.datos.lote.fichas[0];
  expect([ficha0.id, respaldo.fotos.length, ficha0.colores[0].venta]).toEqual([primero.id, 1, '155000']);
  // Con el almacenamiento de vuelta: se guarda antes y se crea con ese mismo producto y archivo.
  await restaurarBorrador(page);
  await expect(estado(f).getByRole('button', { name: 'Reintentar' })).toBeEnabled(); // el intento anterior ya terminó
  await estado(f).getByRole('button', { name: 'Reintentar' }).click();
  await expect(estado(f)).toContainText(/Guardada oculta · GT-/, { timeout: 60000 });
  expect([e.subir, e.guardar]).toEqual([1, 1]);
  const p = await producto23('ALTA DOS P23');
  expect([p.id, p.variantes[0].precio]).toEqual([primero.id, 155000]);
  expect(p.variantes[0].id).toBe(ficha0.colores[0].id);
  expect((await objetosDe(p.id)).map((o) => o.nombre)).toEqual(primero.objetos);
  expect(e.cuerpos[0].p_datos.id).toBe(primero.id);
  await esperarGuardadoLocal(page);
  expect(sinRed(problemas)).toEqual([]);
});

test('fallo antes de enviar tras subir las fotos: ninguna alta; el reintento reutiliza fotos, identificadores y operación', async ({ page }) => {
  const problemas = await entrarAlPanel(page, admin);
  const e = contarEscrituras(page);
  await abrirImportador(page);
  const f = await prepararAlta(page, 'ALTA TRES P23');
  await esperarGuardadoLocal(page);
  await fallarBorrador(page, '"pendiente":\\{"operacion"'); // el guardado previo a subir sí pasa; el previo al alta, no
  await importador(page).getByRole('button', { name: GUARDAR }).click();
  await expect(estado(f)).toContainText('No se envió la ficha: este navegador no pudo guardar antes su operación (falta espacio).', { timeout: 60000 });
  await expect(estado(f)).toContainText('Las fotografías ya subidas se reutilizan con el mismo nombre.');
  expect([e.subir, e.guardar]).toEqual([1, 0]);
  expect(await productos23()).toEqual([]);
  const previo = (await intentos(page))[0].fichas[0];
  expect(previo.operacion).not.toBeNull();
  expect((await objetosDe(previo.id)).map((o) => o.nombre)).toEqual(previo.objetos);
  // Otro intento sin poder guardar: no sube ni envía nada más.
  const antes = (await intentos(page)).length; // cada intento falla dos veces: antes del alta y al actualizar el lote al final
  await estado(f).getByRole('button', { name: 'Reintentar' }).click();
  await expect.poll(async () => (await intentos(page)).length).toBe(antes + 2);
  await expect(estado(f).getByRole('button', { name: 'Reintentar' })).toBeEnabled();
  expect([e.subir, e.guardar]).toEqual([1, 0]);
  expect((await intentos(page)).every((x) => x.fichas[0].operacion === previo.operacion && JSON.stringify(x.fichas[0].datos) === JSON.stringify(previo.datos))).toBe(true);
  await restaurarBorrador(page);
  await expect(estado(f).getByRole('button', { name: 'Reintentar' })).toBeEnabled(); // el intento anterior ya terminó
  await estado(f).getByRole('button', { name: 'Reintentar' }).click();
  await expect(estado(f)).toContainText(/Guardada oculta · GT-/, { timeout: 60000 });
  expect([e.subir, e.guardar]).toEqual([1, 1]); // la foto no se subió otra vez
  expect(e.cuerpos[0].p_operacion).toBe(previo.operacion);
  expect(JSON.stringify(e.cuerpos[0].p_datos)).toBe(JSON.stringify(previo.datos)); // mismos producto, color, tallas y archivo
  expect((await objetosDe(previo.id)).map((o) => o.nombre)).toEqual(previo.objetos);
  expect((await productos23()).map((p) => p.id)).toEqual([previo.id]);
  expect(sinRed(problemas)).toEqual([]);
});

test('almacenamiento no disponible: se puede preparar y exportar, pero no crear; al volver, se crea', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  const e = contarEscrituras(page);
  await page.evaluate(() => { const b = window.GamaTallaBorradores; /** @type {any} */ (window).reales = b; window.GamaTallaBorradores = { ...b, abrirBase: () => Promise.reject(new Error('bloqueado')), disponible: () => false }; });
  await abrirImportador(page);
  const f = await prepararAlta(page, 'ALTA CUATRO P23');
  await expect(estadoLocal(page)).toContainText('Sin guardado local');
  await importador(page).getByRole('button', { name: GUARDAR }).click();
  await expect(estado(f)).toContainText('No se creó nada: este navegador no pudo guardar antes los datos y los archivos para recuperarla (no permite guardar borradores).', { timeout: 30000 });
  expect([e.subir, e.guardar]).toEqual([0, 0]);
  expect(await productos23()).toEqual([]);
  // Exportar desde la cabecera y desde la ficha; el lote sigue abierto y editable.
  await expect(importador(page).locator('#importador-local').getByRole('button', { name: 'Exportar respaldo' })).toBeVisible();
  const respaldo = await exportar(page, f, `alta-sin-almacen-${browserName}.json`);
  expect([respaldo.fotos.length, respaldo.borrador.datos.lote.fichas[0].colores[0].venta]).toEqual([1, '150000']);
  await venta(f).fill('160000');
  await estado(f).getByRole('button', { name: 'Reintentar' }).click();
  await expect(estado(f)).toContainText('No se creó nada', { timeout: 30000 });
  expect([e.subir, e.guardar]).toEqual([0, 0]);
  // El almacenamiento vuelve: se guarda el borrador y se crea.
  await page.evaluate(() => { window.GamaTallaBorradores = /** @type {any} */ (window).reales; });
  await expect(estado(f).getByRole('button', { name: 'Reintentar' })).toBeEnabled(); // el intento anterior ya terminó
  await estado(f).getByRole('button', { name: 'Reintentar' }).click();
  await expect(estado(f)).toContainText(/Guardada oculta · GT-/, { timeout: 60000 });
  expect([e.subir, e.guardar]).toEqual([1, 1]);
  expect((await producto23('ALTA CUATRO P23')).variantes[0].precio).toBe(160000);
  await esperarGuardadoLocal(page);
  expect(sinRed(problemas)).toEqual([]);
});

test('respuesta perdida: se comprueba con la operación y no se duplica', async ({ page }) => {
  const problemas = await entrarAlPanel(page, admin);
  const e = contarEscrituras(page);
  await abrirImportador(page);
  const f = await prepararAlta(page, 'ALTA CINCO P23');
  await page.route(RPC, async (route) => { await route.fetch(); await route.abort('connectionreset'); });
  await importador(page).getByRole('button', { name: GUARDAR }).click();
  await expect(estado(f)).toContainText('(comprobado con el identificador de esta operación)', { timeout: 60000 });
  expect([e.subir, e.guardar]).toEqual([1, 1]);
  expect(await productos23()).toHaveLength(1);
  expect(e.guardar).toBe(1);
  expect(sinRed(problemas)).toEqual([]);
});

test('recarga a mitad de la escritura: al volver se reconcilia con la operación guardada, sin duplicar', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  const e = contarEscrituras(page);
  await abrirImportador(page);
  const f = await prepararAlta(page, 'ALTA SEIS P23');
  /** @type {import('@playwright/test').Route | null} */
  let retenida = null;
  await page.route(RPC, async (route) => { await route.fetch(); retenida = route; }); // llega, pero la respuesta no vuelve
  await importador(page).getByRole('button', { name: GUARDAR }).click();
  await expect.poll(() => Boolean(retenida), { timeout: 60000 }).toBe(true);
  await page.reload();
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
  e.guardar = 0; e.subir = 0;
  await abrirImportador(page);
  await importador(page).getByRole('button', { name: /^Continuar el borrador/ }).click();
  await expect(estado(ficha(page, 0))).toContainText('El guardado se interrumpió');
  await importador(page).getByRole('button', { name: GUARDAR }).click();
  await expect(estado(ficha(page, 0))).toContainText(/Guardada oculta · GT-/, { timeout: 60000 });
  expect([e.subir, e.guardar]).toEqual([0, 0]); // comprobado, sin reenviar ni subir
  expect(await productos23()).toHaveLength(1);
  void f; void browserName;
  expect(sinRed(problemas)).toEqual([]);
});

test('fallo local DESPUÉS de una creación confirmada: no hay otra alta; tras recargar se reconcilia', async ({ page }) => {
  const problemas = await entrarAlPanel(page, admin);
  const e = contarEscrituras(page);
  await abrirImportador(page);
  const f = await prepararAlta(page, 'ALTA SIETE P23');
  await esperarGuardadoLocal(page);
  await fallarBorrador(page, '"estado":"guardada"');
  await importador(page).getByRole('button', { name: GUARDAR }).click();
  await expect(estado(f)).toContainText(/Guardada oculta · GT-/, { timeout: 60000 });
  await expect(pie(page)).toContainText('Lo ya creado está en el catálogo, pero este navegador no pudo actualizar el borrador: no se repetirá ningún alta');
  expect([e.subir, e.guardar]).toEqual([1, 1]);
  await expect(estado(f).getByRole('button', { name: 'Reintentar' })).toHaveCount(0); // no es un alta pendiente
  // Se recarga con el borrador de antes de la confirmación: la ficha vuelve «sin confirmar» y se comprueba.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
  await abrirImportador(page);
  await importador(page).getByRole('button', { name: /^Continuar el borrador/ }).click();
  await expect(estado(ficha(page, 0))).toContainText('El guardado se interrumpió');
  // Qué pasó con la lectura de comprobación (si falla, reenviar con la MISMA operación es lo previsto: el servidor no duplica).
  const lecturas = [];
  const esLectura = (u) => /\/rest\/v1\/productos\?select=id%2Ccodigo_interno%2Cultima_operacion/.test(u);
  page.on('response', (r) => { if (esLectura(r.url())) lecturas.push(r.status()); });
  page.on('requestfailed', (r) => { if (esLectura(r.url())) lecturas.push(`falló: ${r.failure()?.errorText}`); });
  await importador(page).getByRole('button', { name: GUARDAR }).click();
  await expect(estado(ficha(page, 0))).toContainText(/Guardada oculta · GT-/, { timeout: 60000 });
  const detalle = `lecturas de comprobación: ${JSON.stringify(lecturas)}; operaciones enviadas: ${JSON.stringify(e.cuerpos.map((c) => c.p_operacion))}`;
  if (lecturas.length && lecturas.every((s) => s === 200)) expect([e.subir, e.guardar], `la lectura fue correcta: no debía reenviarse. ${detalle}`).toEqual([1, 1]);
  else { expect(new Set(e.cuerpos.map((c) => c.p_operacion)).size, detalle).toBe(1); expect(e.subir, detalle).toBe(1); } // sin lectura: reenvío idempotente
  expect(await productos23()).toHaveLength(1);
  expect(sinRed(problemas)).toEqual([]);
});

test('fallo de la memoria DESPUÉS de crear: la zapatilla no se repite y se anota solo la memoria', async ({ page }) => {
  const problemas = await entrarAlPanel(page, admin);
  const e = contarEscrituras(page);
  await abrirImportador(page);
  const f = await prepararAlta(page, 'ALTA OCHO P23');
  await importador(page).getByRole('button', { name: 'Comparar con mi inventario' }).click();
  await elegirProveedor(page, 'Proveedor Alta');
  await novedades(page).getByRole('button', { name: 'Recordar las fotos de las zapatillas nuevas del lote (1)' }).click();
  await page.evaluate(() => { const b = window.GamaTallaBorradores; /** @type {any} */ (window).reales = b; window.GamaTallaBorradores = { ...b, guardarMemoria: async () => { throw new b.ErrorCuota('sin espacio'); } }; });
  await importador(page).getByRole('button', { name: GUARDAR }).click();
  await expect(estado(f)).toContainText(/Guardada oculta · GT-/, { timeout: 60000 });
  await expect(estado(f)).toContainText('la memoria local quedó pendiente');
  await expect(novedades(page).locator('#imp-nov-pendiente-memoria')).toContainText('Los cambios del catálogo ya están guardados');
  await expect(estado(f).getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
  expect([e.subir, e.guardar]).toEqual([1, 1]);
  expect((await memoria(page)).asociaciones).toHaveLength(0);
  await page.evaluate(() => { window.GamaTallaBorradores = /** @type {any} */ (window).reales; });
  await novedades(page).getByRole('button', { name: 'Reintentar guardar en la memoria' }).click();
  await expect(avisoNov(page)).toContainText('Memoria guardada (1 registro). No se repitió ninguna escritura del catálogo.');
  expect((await memoria(page)).asociaciones).toHaveLength(1);
  expect([e.subir, e.guardar]).toEqual([1, 1]);
  expect(await productos23()).toHaveLength(1);
  expect(sinRed(problemas)).toEqual([]);
});

test('varias fichas: si el almacenamiento falla a mitad, la creada queda, la siguiente se detiene y la última queda sin intentar', async ({ page }) => {
  const problemas = await entrarAlPanel(page, admin);
  const e = contarEscrituras(page);
  await abrirImportador(page);
  const s = await pegarVarias(page, ['Fila Disruptor P23 Dama $150.000 36 al 39\nColor: BLANCO', 'Converse Chuck P23 Hombre $130.000 40 al 42\nColor: NEGRO', 'Puma Suede P23 Hombre $140.000 40 al 42\nColor: ROJO'].join('\n\n'));
  await s.getByRole('button', { name: 'Crear 3 publicaciones' }).click();
  for (const i of [0, 1, 2]) { await elegirCategoria(ficha(page, i), 'URBANAS'); await venta(ficha(page, i)).fill('200000'); }
  await esperarGuardadoLocal(page);
  // Falla todo guardado que ya incluya una ficha creada: o sea, a partir de la segunda.
  await fallarBorrador(page, '"estado":"guardada"');
  await importador(page).getByRole('button', { name: 'Guardar lote como oculto (3)' }).click();
  await expect(estado(ficha(page, 0))).toContainText(/Guardada oculta · GT-/, { timeout: 60000 });
  await expect(estado(ficha(page, 1))).toContainText('No se envió la ficha: este navegador no pudo guardar antes su operación', { timeout: 60000 });
  await expect(pie(page)).toContainText('1 no se creó porque este navegador no pudo guardar antes el borrador');
  await expect(pie(page)).toContainText('1 más quedó sin intentar.');
  await expect(estado(ficha(page, 2))).toBeHidden();
  expect(e.guardar).toBe(1);
  expect((await productos23()).map((p) => p.nombre)).toEqual(['DISRUPTOR P23']);
  // Se recupera: «Reintentar» solo crea esa ficha; el resto sigue con «Guardar lote».
  await restaurarBorrador(page);
  await estado(ficha(page, 1)).getByRole('button', { name: 'Reintentar' }).click();
  await expect(estado(ficha(page, 1))).toContainText(/Guardada oculta · GT-/, { timeout: 60000 });
  expect(e.guardar).toBe(2);
  expect(await productos23()).toHaveLength(2);
  await importador(page).getByRole('button', { name: /^Guardar lote como oculto/ }).click();
  await expect(estado(ficha(page, 2))).toContainText(/Guardada oculta · GT-/, { timeout: 60000 });
  expect(e.guardar).toBe(3);
  expect(new Set((await productos23()).map((p) => p.id)).size).toBe(3);
  expect(sinRed(problemas)).toEqual([]);
});
