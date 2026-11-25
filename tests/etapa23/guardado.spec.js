// @ts-check
/* Etapa 23 · «Aplicar cambios seleccionados»: control de versión, doble clic, respuesta perdida, recarga a mitad,
 * fallo parcial, fotos y fallo de la memoria local. Nada se duplica y solo se anuncia lo confirmado.
 *
 * SOLO contra el Supabase LOCAL y el entorno aislado. Modelos ficticios « P23».
 */
import { test, expect } from '@playwright/test';
import {
  crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, servicio, entrarAlPanel, abrirImportador, importador, recargar, esperarGuardadoLocal, objetosDe, elegirModo,
  limpiar23, producto23, crearCatalogo23, entrega, novedades, novedad, ver, aplicar, avisoNov, operacion, importarEntrega, elegirProveedor, vincular, memoria, contarEscrituras
} from './ayudas23.js';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180000);
test.use({ actionTimeout: 15000 });

let admin;
let cat;
test.beforeAll(async () => { admin = await crearUsuario(`etapa23g-${Date.now()}@gamaytalla.test`); await hacerAdmin(admin.id); });
test.afterAll(async () => { await limpiar23(); await quitarAdmin(admin.id); await borrarUsuario(admin.id); });
test.beforeEach(async () => { await limpiar23(); cat = await crearCatalogo23(); });

const FECHA = 'Viernes 20 de Noviembre de 2026';
const WINFLO = { foto: 361, lineas: ['NIKE WINFLO P23 HOMBRE NEGRO', 'Tallas EU 40 al 44'], venta: '$155.000', coste: ['$100.000'] };
const SAMBA = { foto: 362, lineas: ['ADIDAS SAMBA P23 DAMA BLANCO', 'EU 36 al 38'], venta: '$139.900', coste: ['$90.000'] };
const cod = (k) => new RegExp(cat.v[k].codigo_variante);
// Errores de red que la propia prueba provoca (no son del panel).
const sinRed = (l) => l.filter((x) => !/127\.0\.0\.1:54321|ERR_|NetworkError|Load failed|access control|Failed to fetch|WebSocket|downloadable font/.test(x));

/** Abre el importador con una entrega ya vinculada a los colores existentes. */
async function preparar(page, tarjetas = [WINFLO], nombre = 'g') {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await importarEntrega(page, entrega(nombre, FECHA, tarjetas));
  await elegirProveedor(page, 'Proveedor Guardado');
  for (const [i, t] of tarjetas.entries()) await vincular(novedad(page, i + 1), t === WINFLO ? 'WINFLO P23' : 'SAMBA P23', cod(t === WINFLO ? 'WINFLO P23|NEGRO' : 'SAMBA P23|BLANCO'));
  await ver(page, 'Todas');
  return problemas;
}
const tallas = async (nombre = 'WINFLO P23') => (await producto23(nombre)).variantes[0].tallas.map((t) => t.talla);
const RPC = '**/rest/v1/rpc/fn_admin_guardar_producto';

test('conflicto antes de enviar y en el servidor: no se escribe nada, se carga lo actual y se vuelve a aplicar', async ({ page }) => {
  const problemas = await preparar(page);
  const e = contarEscrituras(page);
  await novedad(page, 1).getByRole('checkbox', { name: 'Añadir 44' }).click();
  // Otra edición se guarda mientras se revisaba: la versión ya no es la que se vio.
  const w = await producto23('WINFLO P23');
  await servicio('PATCH', `/rest/v1/productos?id=eq.${w.id}`, { version: w.version + 1, descripcion: 'Otra edición' });
  await aplicar(page).click();
  await expect(operacion(page, 'WINFLO P23')).toContainText('Otra edición cambió esta zapatilla desde que la revisaste. No se escribió nada', { timeout: 30000 });
  await expect(avisoNov(page)).toContainText('1 no se aplicó');
  expect(e.guardar).toBe(0);
  // La selección sigue y las diferencias son las actuales: se vuelve a aplicar. Ahora choca en el servidor.
  await expect(novedad(page, 1).getByRole('checkbox', { name: 'Añadir 44' })).toBeChecked();
  let cambiada = false;
  await page.route(RPC, async (route) => {
    if (!cambiada) { cambiada = true; await servicio('PATCH', `/rest/v1/productos?id=eq.${w.id}`, { version: w.version + 2 }); }
    await route.continue();
  });
  await aplicar(page).click();
  await expect(operacion(page, 'WINFLO P23')).toContainText('Otra edición de esta zapatilla se guardó antes. No se aplicó nada', { timeout: 30000 });
  expect(await tallas()).toEqual(['40', '41', '42', '43']);
  expect((await producto23('WINFLO P23')).descripcion).toBe('Otra edición'); // nada se sobrescribió
  await aplicar(page).click();
  await expect(avisoNov(page)).toContainText('Se actualizó 1 zapatilla existente', { timeout: 30000 });
  expect(await tallas()).toEqual(['40', '41', '42', '43', '44']);
  expect((await producto23('WINFLO P23')).descripcion).toBe('Otra edición');
  expect(sinRed(problemas)).toEqual([]);
});

test('doble clic: una sola escritura; volver a aplicar lo ya igual no envía nada', async ({ page }) => {
  const problemas = await preparar(page);
  const e = contarEscrituras(page);
  await novedad(page, 1).getByRole('checkbox', { name: 'Añadir 44' }).click();
  await page.waitForTimeout(500);
  await aplicar(page).evaluate((b) => { /** @type {HTMLButtonElement} */ (b).click(); /** @type {HTMLButtonElement} */ (b).click(); });
  await expect(avisoNov(page)).toContainText('Se actualizó 1 zapatilla existente', { timeout: 30000 });
  expect(e.guardar).toBe(1);
  expect(await tallas()).toEqual(['40', '41', '42', '43', '44']);
  await expect(aplicar(page)).toHaveAttribute('aria-disabled', 'true');
  // Mientras tanto alguien ya puso ese mismo precio: no hay nada que enviar.
  const w = await producto23('WINFLO P23');
  await novedad(page, 1).getByRole('radio', { name: 'Escribir otro precio' }).click();
  await novedad(page, 1).getByLabel('Precio de venta (COP)').fill('150000');
  await expect(aplicar(page)).toHaveAttribute('aria-disabled', 'true'); // es el actual
  await novedad(page, 1).getByLabel('Precio de venta (COP)').fill('151000');
  await expect(aplicar(page)).not.toHaveAttribute('aria-disabled', 'true');
  await servicio('PATCH', `/rest/v1/variantes?id=eq.${w.variantes[0].id}`, { precio: 151000 }); // sin cambiar la versión
  await aplicar(page).click();
  await expect(avisoNov(page)).toContainText('1 ya estaba igual: no se envió nada.', { timeout: 30000 });
  expect(e.guardar).toBe(1);
  expect(sinRed(problemas)).toEqual([]);
});

test('respuesta perdida: aplicada y comprobada por su operación, también si después hubo otra edición', async ({ page }) => {
  const problemas = await preparar(page);
  const e = contarEscrituras(page);
  await novedad(page, 1).getByRole('checkbox', { name: 'Añadir 44' }).click();
  await page.route(RPC, async (route) => { await route.fetch(); await route.abort('connectionreset'); });
  await aplicar(page).click();
  await expect(operacion(page, 'WINFLO P23')).toContainText('Actualizada (comprobado con el identificador de esta operación): talla 44 (por revisar).', { timeout: 30000 });
  expect(e.guardar).toBe(1);
  expect(await tallas()).toEqual(['40', '41', '42', '43', '44']);
  // Otra vez, pero con otra edición encima antes de poder comprobar: lo confirma el historial del servidor.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await novedad(page, 1).getByRole('radio', { name: 'Usar la venta sugerida $ 155.000' }).click();
  await page.route(RPC, async (route) => {
    await route.fetch();
    const w = await producto23('WINFLO P23');
    await servicio('PATCH', `/rest/v1/productos?id=eq.${w.id}`, { version: w.version + 1, ultima_operacion: crypto.randomUUID(), descripcion: 'Después' });
    await route.abort('connectionreset');
  });
  await aplicar(page).click();
  await expect(operacion(page, 'WINFLO P23')).toContainText('comprobado en el historial del servidor; después hubo otra edición', { timeout: 30000 });
  const w = await producto23('WINFLO P23');
  expect([w.variantes[0].precio, w.descripcion]).toEqual([155000, 'Después']);
  expect(e.guardar).toBe(2);
  // Una entrada de historial por entrega, con las dos operaciones; ninguna duplicada.
  const m = await memoria(page);
  expect(m.historial).toHaveLength(1);
  expect(m.historial[0].dato.aplicado).toHaveLength(2);
  expect(m.asociaciones).toHaveLength(1);
  expect(sinRed(problemas)).toEqual([]);
});

test('petición que no llegó: sin confirmar; tras recargar, «Reintentar» usa la misma operación y no duplica', async ({ page, browserName }) => {
  const problemas = await preparar(page);
  const e = contarEscrituras(page);
  await novedad(page, 1).getByRole('checkbox', { name: 'Añadir 44' }).click();
  await page.route(RPC, (route) => route.abort('connectionreset'));
  await aplicar(page).click();
  await expect(operacion(page, 'WINFLO P23')).toContainText('el cambio todavía no aparece en el servidor', { timeout: 30000 });
  await expect(avisoNov(page)).toContainText('1 quedó sin confirmar');
  await expect(avisoNov(page)).not.toContainText('Se actualizó');
  expect(await tallas()).toEqual(['40', '41', '42', '43']);
  // Con un resultado sin confirmar, el catálogo PDF no se cierra (se necesita para reintentar).
  await importador(page).locator('#imp-pdf').getByRole('button', { name: 'Cerrar la importación' }).click();
  await importador(page).locator('#imp-pdf-cerrar-confirmar').getByRole('button', { name: 'Cerrar la importación' }).click();
  await expect(importador(page).locator('#importador-resultado')).toContainText('Hay una actualización sin confirmar de este catálogo');
  await esperarGuardadoLocal(page);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await recargar(page, problemas, browserName);
  await abrirImportador(page);
  await importador(page).getByRole('button', { name: /^Continuar el borrador/ }).click();
  await expect(operacion(page, 'WINFLO P23')).toContainText('el cambio todavía no aparece en el servidor');
  await operacion(page, 'WINFLO P23').getByRole('button', { name: 'Comprobar otra vez' }).click();
  await expect(operacion(page, 'WINFLO P23')).toContainText('todavía no aparece');
  const antes = e.guardar;
  await operacion(page, 'WINFLO P23').getByRole('button', { name: 'Reintentar' }).click();
  await expect(operacion(page, 'WINFLO P23')).toContainText('Actualizada', { timeout: 30000 });
  expect(e.guardar).toBe(antes + 1);
  expect(new Set(e.cuerpos.map((c) => c.p_operacion)).size).toBe(1); // la misma operación y el mismo cuerpo
  expect(new Set(e.cuerpos.map((c) => JSON.stringify(c.p_datos))).size).toBe(1);
  expect(await tallas()).toEqual(['40', '41', '42', '43', '44']);
  expect((await memoria(page)).historial).toHaveLength(1);
  expect(sinRed(problemas)).toEqual([]);
});

test('si la petición no llegó y se cambia la selección, aplicar no repite lo que ya no se quiere', async ({ page }) => {
  const problemas = await preparar(page);
  await novedad(page, 1).getByRole('checkbox', { name: 'Añadir 44' }).click();
  await novedad(page, 1).getByRole('radio', { name: 'Usar la venta sugerida $ 155.000' }).click();
  await page.route(RPC, (route) => route.abort('connectionreset'));
  await aplicar(page).click();
  await expect(operacion(page, 'WINFLO P23')).toContainText('el cambio todavía no aparece en el servidor', { timeout: 30000 });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const e = contarEscrituras(page);
  await novedad(page, 1).getByRole('radio', { name: 'Conservar $ 150.000' }).click(); // ya no se quiere cambiar el precio
  await aplicar(page).click();
  await expect(avisoNov(page)).toContainText('Se actualizó 1 zapatilla existente', { timeout: 30000 });
  expect(e.guardar).toBe(1);
  const w = await producto23('WINFLO P23');
  expect([w.variantes[0].precio, w.variantes[0].tallas.length]).toEqual([150000, 5]);
  expect(sinRed(problemas)).toEqual([]);
});

test('recarga en mitad del guardado: vuelve «sin confirmar» con su operación; si ya se aplicó, no se repite', async ({ page, browserName }) => {
  const problemas = await preparar(page);
  await novedad(page, 1).getByRole('checkbox', { name: 'Añadir 44' }).click();
  /** @type {import('@playwright/test').Route | null} */
  let retenida = null;
  await page.route(RPC, async (route) => { await route.fetch(); retenida = route; }); // llega, pero la respuesta no vuelve
  await aplicar(page).click();
  await expect.poll(() => Boolean(retenida), { timeout: 30000 }).toBe(true);
  await page.reload();
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
  const e = contarEscrituras(page);
  await abrirImportador(page);
  await importador(page).getByRole('button', { name: /^Continuar el borrador/ }).click();
  await expect(operacion(page, 'WINFLO P23')).toContainText('El guardado se interrumpió');
  await operacion(page, 'WINFLO P23').getByRole('button', { name: 'Reintentar' }).click();
  await expect(operacion(page, 'WINFLO P23')).toContainText('comprobado con el identificador de esta operación', { timeout: 30000 });
  expect(e.guardar).toBe(0);
  expect(await tallas()).toEqual(['40', '41', '42', '43', '44']);
  const m = await memoria(page);
  expect([m.historial.length, m.historial[0].dato.aplicado.length]).toEqual([1, 1]);
  void browserName;
  expect(sinRed(problemas)).toEqual([]);
});

test('fallo parcial: una zapatilla se aplica y la otra no; reintentar envía solo la que faltaba', async ({ page }) => {
  const problemas = await preparar(page, [WINFLO, SAMBA], 'parcial');
  const e = contarEscrituras(page);
  await novedades(page).getByRole('button', { name: 'Elegir las tallas nuevas a la vista (2)' }).click();
  await expect(novedades(page).locator('#imp-nov-plan')).toContainText('Actualizar: 2 zapatillas existentes (2 tallas nuevas)');
  await page.route(RPC, async (route) => {
    const datos = route.request().postDataJSON();
    if (datos.p_datos.nombre === 'SAMBA P23') await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ code: 'PT422', message: 'Rechazo de prueba.' }) });
    else await route.continue();
  });
  await aplicar(page).click();
  await expect(avisoNov(page)).toContainText('Se actualizó 1 zapatilla existente', { timeout: 30000 });
  await expect(avisoNov(page)).toContainText('1 no se aplicó');
  await expect(operacion(page, 'SAMBA P23')).toContainText('Rechazo de prueba. No se guardó ningún cambio de esta zapatilla.');
  expect(await tallas('SAMBA P23')).toEqual(['36', '37']);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  e.guardar = 0;
  await expect(aplicar(page)).toHaveText('Aplicar cambios seleccionados (1 zapatilla)');
  await aplicar(page).click();
  await expect(operacion(page, 'SAMBA P23')).toContainText('Actualizada', { timeout: 30000 });
  expect(e.guardar).toBe(1);
  const samba = await producto23('SAMBA P23');
  expect([samba.activo, samba.variantes[0].tallas.length]).toEqual([false, 3]); // sigue oculta
  expect((await producto23('WINFLO P23')).activo).toBe(true); // sigue publicada
  expect(sinRed(problemas)).toEqual([]);
});

test('fotografía: si la subida o el guardado fallan, se reintenta con el mismo archivo y no se duplica', async ({ page }) => {
  const problemas = await preparar(page);
  const e = contarEscrituras(page);
  const id = cat.p['WINFLO P23'].id;
  await elegirModo(novedad(page, 1), 'Añadir otra fotografía a un color existente');
  await expect(novedad(page, 1).getByRole('checkbox', { name: 'Añadir esta fotografía a NEGRO' })).toBeChecked();
  const SUBIDA = '**/storage/v1/object/fotos-catalogo/**';
  await page.route(SUBIDA, (route) => (route.request().method() === 'POST' ? route.abort('connectionreset') : route.continue()));
  await aplicar(page).click();
  await expect(operacion(page, 'WINFLO P23')).toContainText('Se perdió la conexión al subir una fotografía', { timeout: 60000 });
  expect(e.guardar).toBe(0);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  // Sube, pero el guardado se rechaza; después se reintenta.
  await page.route(RPC, (route) => route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ code: 'PT422', message: 'Rechazo de prueba.' }) }));
  await aplicar(page).click();
  await expect(operacion(page, 'WINFLO P23')).toContainText('Rechazo de prueba.', { timeout: 60000 });
  const subidas = (await objetosDe(id)).map((o) => o.nombre);
  expect(subidas).toHaveLength(1);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await aplicar(page).click();
  await expect(avisoNov(page)).toContainText('Se actualizó 1 zapatilla existente', { timeout: 60000 });
  expect((await objetosDe(id)).map((o) => o.nombre)).toEqual(subidas); // el mismo archivo
  const w = await producto23('WINFLO P23');
  expect(w.variantes[0].fotos).toHaveLength(3);
  expect(w.variantes[0].fotos[2].ruta).toContain(subidas[0]);
  expect(w.variantes[0].fotos.slice(0, 2).map((f) => f.alt)).toEqual(['alt NEGRO 0', 'alt NEGRO 1']);
  // Ya aplicada: no se vuelve a ofrecer.
  await expect(aplicar(page)).toHaveAttribute('aria-disabled', 'true');
  expect(sinRed(problemas)).toEqual([]);
});

test('fallo de la memoria local tras guardar: se informa, se conserva y se anota sin repetir la escritura', async ({ page, browserName }) => {
  const problemas = await preparar(page);
  const e = contarEscrituras(page);
  await novedad(page, 1).getByRole('checkbox', { name: 'Añadir 44' }).click();
  // Solo falla la memoria; el borrador local sigue funcionando.
  await page.evaluate(() => { const b = window.GamaTallaBorradores; window.GamaTallaBorradores = { ...b, guardarMemoria: async () => { throw new b.ErrorCuota('sin espacio'); } }; });
  await aplicar(page).click();
  await expect(avisoNov(page)).toContainText('Se actualizó 1 zapatilla existente (confirmado por el servidor)', { timeout: 30000 });
  await expect(avisoNov(page)).toContainText('La memoria local quedó pendiente');
  await expect(novedades(page).locator('#imp-nov-pendiente-memoria')).toContainText('Los cambios del catálogo ya están guardados');
  expect(await tallas()).toEqual(['40', '41', '42', '43', '44']);
  expect((await memoria(page)).historial).toHaveLength(0);
  await esperarGuardadoLocal(page);
  await recargar(page, problemas, browserName);
  await abrirImportador(page);
  await importador(page).getByRole('button', { name: /^Continuar el borrador/ }).click();
  e.guardar = 0;
  await novedades(page).getByRole('button', { name: 'Reintentar guardar en la memoria' }).click();
  await expect(avisoNov(page)).toContainText('Memoria guardada (1 registro). No se repitió ninguna escritura del catálogo.');
  const m = await memoria(page);
  expect([m.historial.length, m.historial[0].dato.aplicado.length]).toEqual([1, 1]);
  expect(e.guardar).toBe(0);
  await expect(novedades(page).locator('#imp-nov-pendiente-memoria')).toHaveCount(0);
  expect(sinRed(problemas)).toEqual([]);
});

test('sin almacenamiento local: se compara y se prepara, pero no se escribe sin poder recuperarlo; el trabajo no se pierde', async ({ page }) => {
  const problemas = await entrarAlPanel(page, admin);
  const e = contarEscrituras(page);
  await page.evaluate(() => { const b = window.GamaTallaBorradores; /** @type {any} */ (window).reales = b; window.GamaTallaBorradores = { ...b, abrirBase: () => Promise.reject(new Error('bloqueado')), disponible: () => false }; });
  await abrirImportador(page);
  await importarEntrega(page, entrega('sinalmacen', FECHA, [WINFLO]));
  await expect(novedades(page)).toContainText('Este navegador no permite guardar la memoria de reconocimiento');
  await elegirModo(novedad(page, 1), 'Actualizar un color existente');
  await novedad(page, 1).getByRole('searchbox').fill('WINFLO P23');
  await novedad(page, 1).getByRole('button', { name: cod('WINFLO P23|NEGRO') }).click();
  await expect(novedad(page, 1).getByRole('button', { name: 'Confirmar y recordar esta relación' })).toHaveAttribute('aria-disabled', 'true');
  await novedad(page, 1).getByRole('button', { name: 'Usar solo esta vez' }).click();
  await ver(page, 'Todas');
  await novedad(page, 1).getByRole('checkbox', { name: 'Añadir 44' }).click();
  await aplicar(page).click();
  await expect(operacion(page, 'WINFLO P23')).toContainText('este navegador no pudo guardar antes su operación (no permite guardar borradores)', { timeout: 30000 });
  await expect(avisoNov(page)).toContainText('1 no se envió porque no se pudo guardar antes en este navegador');
  expect([e.guardar, e.subir]).toEqual([0, 0]);
  expect(await tallas()).toEqual(['40', '41', '42', '43']);
  // Lo preparado sigue aquí y se puede exportar; «Reintentar» no se lo salta.
  await expect(novedad(page, 1).getByRole('checkbox', { name: 'Añadir 44' })).toBeChecked();
  await Promise.all([page.waitForEvent('download'), operacion(page, 'WINFLO P23').getByRole('button', { name: 'Exportar respaldo' }).click()]);
  await operacion(page, 'WINFLO P23').getByRole('button', { name: 'Reintentar' }).click();
  await expect(avisoNov(page)).toContainText('1 no se envió', { timeout: 30000 });
  expect(e.guardar).toBe(0);
  // Cuando el almacenamiento vuelve a estar disponible, se guarda antes y se aplica.
  await page.evaluate(() => { window.GamaTallaBorradores = /** @type {any} */ (window).reales; });
  await operacion(page, 'WINFLO P23').getByRole('button', { name: 'Reintentar' }).click();
  await expect(avisoNov(page)).toContainText('Se actualizó 1 zapatilla existente', { timeout: 30000 });
  expect(e.guardar).toBe(1);
  expect(await tallas()).toEqual(['40', '41', '42', '43', '44']);
  expect(sinRed(problemas)).toEqual([]);
});
