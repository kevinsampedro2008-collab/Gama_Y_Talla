// @ts-check
/* Etapa 23 · Correcciones de la revisión:
 *  1. Una confirmación vale en el contexto en que se aprobó (proveedor, público del destino): si cambia, se revisa.
 *  2. Sin guardar ANTES el borrador no se sube ninguna foto ni se envía la actualización.
 *  3. Las tallas que una entrega deja de anunciar son un cambio que se ve y se revisa, sin tocar el catálogo.
 *
 * SOLO contra el Supabase LOCAL y el entorno aislado. Modelos ficticios « P23».
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, servicio, entrarAlPanel, abrirImportador, importador, recargar, esperarGuardadoLocal, objetosDe, elegirModo, seccionPdf, ficha, elegirCategoria, pegarVarias,
  prepararFotos20, limpiar23, producto23, productos23, crearCatalogo23, entrega, novedades, novedad, filtro, ver, aplicar, avisoNov, operacion, importarEntrega, elegirProveedor, vincular, memoria, contarEscrituras,
  pie, capturar23, PDFS23, MENSAJE, fallarBorrador, restaurarBorrador, intentos
} from './ayudas23.js';

test.setTimeout(240000);
test.use({ actionTimeout: 15000 });

let admin;
let cat;
test.beforeAll(async () => { admin = await crearUsuario(`etapa23r-${Date.now()}@gamaytalla.test`); await hacerAdmin(admin.id); });
test.afterAll(async () => { await limpiar23(); await quitarAdmin(admin.id); await borrarUsuario(admin.id); });
test.beforeEach(async () => { await limpiar23(); cat = await crearCatalogo23(); });

const FECHA1 = 'Viernes 20 de Noviembre de 2026';
const FECHA2 = 'Martes 24 de Noviembre de 2026';
const RPC = '**/rest/v1/rpc/fn_admin_guardar_producto';
const SUBIDA = '**/storage/v1/object/fotos-catalogo/**';
const NEGRO = { foto: 391, lineas: ['NIKE WINFLO P23 HOMBRE NEGRO', 'Tallas EU 40 al 44'], venta: '$155.000', coste: ['$100.000'] };
const cod = (k) => new RegExp(cat.v[k].codigo_variante);
const sinRed = (l) => l.filter((x) => !/127\.0\.0\.1:54321|ERR_|NetworkError|Load failed|access control|Failed to fetch|WebSocket|downloadable font/.test(x));
const cerrarPdf = async (page) => {
  await seccionPdf(page).getByRole('button', { name: 'Cerrar la importación' }).click();
  await seccionPdf(page).locator('#imp-pdf-cerrar-confirmar').getByRole('button', { name: 'Cerrar la importación' }).click();
  await expect(seccionPdf(page)).toHaveCount(0);
};
// Dos proveedores con la MISMA fotografía relacionada con colores distintos; el lote queda abierto con «Proveedor A».
async function dosProveedores(page, nombre) {
  const rutas = entrega(nombre, FECHA1, [NEGRO]);
  await importarEntrega(page, rutas);
  await elegirProveedor(page, 'Proveedor B');
  await vincular(novedad(page, 1), 'WINFLO P23', cod('WINFLO P23|AZUL'));
  await cerrarPdf(page);
  await importarEntrega(page, rutas);
  await elegirProveedor(page, 'Proveedor A');
  await vincular(novedad(page, 1), 'WINFLO P23', cod('WINFLO P23|NEGRO'));
  await ver(page, 'Todas');
}

// ------------------------------------------------------------------ 1. contexto de las confirmaciones
test('cambiar de proveedor después de confirmar: se reconoce con el nuevo y nada de lo anterior sigue aprobado', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await dosProveedores(page, 'contexto');
  await novedad(page, 1).getByRole('checkbox', { name: 'Añadir 44' }).click();
  await novedad(page, 1).getByRole('radio', { name: 'Escribir otro precio' }).click();
  await novedad(page, 1).getByLabel('Precio de venta (COP)').fill('170000');
  await expect(aplicar(page)).toHaveText('Aplicar cambios seleccionados (1 zapatilla)');
  const relaciones = (await memoria(page)).asociaciones;
  const e = contarEscrituras(page);

  await elegirProveedor(page, 'Proveedor B');
  // El destino es el de la memoria de B y lo elegido con A no está aprobado.
  await expect(novedad(page, 1).locator('.importador-nov-comparar')).toContainText('NIKE WINFLO P23 · AZUL');
  await expect(novedad(page, 1).locator('.importador-nov-comparar')).not.toContainText('· NEGRO');
  await expect(aplicar(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(novedad(page, 1)).toContainText('Con «Proveedor A» la habías confirmado como NIKE WINFLO P23 · NEGRO: esa decisión no se usa con «Proveedor B».');
  await expect(novedad(page, 1).locator('.importador-nov-marcas')).toContainText('Revisar');
  // Lo escrito se conserva a la vista.
  await expect(novedad(page, 1).getByRole('checkbox', { name: 'Añadir 44' })).toBeChecked();
  await expect(novedad(page, 1).getByLabel('Precio de venta (COP)')).toHaveValue('170000');
  await expect(novedad(page, 1)).toContainText('Los elegiste para NIKE WINFLO P23 · NEGRO con «Proveedor A»');
  await expect(novedades(page).getByRole('button', { name: /^Dar por revisadas/ })).toHaveCount(0);
  await aplicar(page).evaluate((b) => /** @type {HTMLButtonElement} */ (b).click()); // deshabilitado (aria-disabled): no debe enviar nada
  await page.waitForTimeout(400);
  expect(e.guardar).toBe(0);
  expect((await memoria(page)).asociaciones).toEqual(relaciones); // nada se borró
  if (browserName === 'chromium') await capturar23(page, 'contexto-1280.png', `#${await novedad(page, 1).getAttribute('id')}`);
  // Se conserva con el borrador, y sigue sin aprobar.
  await esperarGuardadoLocal(page);
  await recargar(page, problemas, browserName);
  await abrirImportador(page);
  await importador(page).getByRole('button', { name: /^Continuar el borrador/ }).click();
  await ver(page, 'Todas');
  await expect(novedad(page, 1).locator('.importador-nov-comparar')).toContainText('· AZUL');
  await expect(aplicar(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(novedad(page, 1).getByLabel('Precio de venta (COP)')).toHaveValue('170000');
  // Al volver a A, su decisión y sus cambios siguen valiendo en su contexto.
  await elegirProveedor(page, 'Proveedor A');
  await expect(novedad(page, 1).locator('.importador-nov-comparar')).toContainText('· NEGRO');
  await expect(aplicar(page)).toHaveText('Aplicar cambios seleccionados (1 zapatilla)');
  // Con B, se revisan y se aprueban expresamente: se aplican al destino de B.
  await elegirProveedor(page, 'Proveedor B');
  await novedad(page, 1).getByRole('button', { name: 'Usar estos cambios aquí' }).click();
  await expect(novedad(page, 1).locator('.importador-nov-efecto')).toContainText('precio de venta $ 150.000 → $ 170.000');
  await aplicar(page).click();
  await expect(avisoNov(page)).toContainText('Se actualizó 1 zapatilla existente', { timeout: 30000 });
  const [negro, azul] = (await producto23('WINFLO P23')).variantes;
  expect([negro.precio, negro.tallas.length, azul.precio, azul.tallas.map((t) => t.talla)]).toEqual([150000, 4, 170000, ['40', '41', '44']]);
  const m = await memoria(page);
  const B = m.proveedores.find((p) => p.dato.nombre === 'Proveedor B').dato.id;
  expect(m.asociaciones).toHaveLength(2);
  expect(m.historial.map((h) => h.dato.proveedor)).toEqual([B]);
  expect(sinRed(problemas)).toEqual([]);
});

test('proveedor sin relaciones: el destino queda propuesto y se confirma otra vez; también lo elegido sobre lo reconocido solo', async ({ page }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  const rutas = entrega('propuesto', FECHA1, [NEGRO]);
  await importarEntrega(page, rutas);
  await elegirProveedor(page, 'Proveedor A');
  await vincular(novedad(page, 1), 'WINFLO P23', cod('WINFLO P23|NEGRO'));
  await ver(page, 'Todas');
  await novedad(page, 1).getByRole('checkbox', { name: 'Añadir 44' }).click();
  await elegirProveedor(page, 'Proveedor C');
  await expect(aplicar(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(novedad(page, 1)).toContainText('Cambió el proveedor de la entrega (antes «Proveedor A», ahora «Proveedor C»): revisa el destino y confírmalo otra vez.');
  await novedad(page, 1).getByRole('button', { name: 'Usar solo esta vez' }).click();
  // Confirmado el destino, los cambios que se eligieron antes siguen pidiendo revisión.
  await expect(novedad(page, 1).getByRole('checkbox', { name: 'Añadir 44' })).toBeChecked();
  await expect(aplicar(page)).toHaveAttribute('aria-disabled', 'true');
  await novedad(page, 1).getByRole('button', { name: 'Descartarlos' }).click();
  await expect(novedad(page, 1).getByRole('checkbox', { name: 'Añadir 44' })).not.toBeChecked();
  await cerrarPdf(page);
  // Reconocida sola (sin decidir nada en esta entrega): lo elegido tampoco pasa a otro proveedor.
  await importarEntrega(page, rutas);
  await elegirProveedor(page, 'Proveedor A');
  await ver(page, 'Todas');
  await expect(novedad(page, 1)).toContainText('Fotografía reconocida por la relación que confirmaste.');
  await novedad(page, 1).getByRole('checkbox', { name: 'Añadir 44' }).click();
  await elegirProveedor(page, 'Proveedor C');
  await expect(novedad(page, 1)).toContainText('Sin destino todavía');
  await vincular(novedad(page, 1), 'WINFLO P23', cod('WINFLO P23|AZUL'));
  await expect(novedad(page, 1).getByRole('checkbox', { name: 'Añadir 44' })).toBeChecked();
  await expect(novedad(page, 1)).toContainText('Los elegiste para NIKE WINFLO P23 · NEGRO con «Proveedor A»');
  await expect(aplicar(page)).toHaveAttribute('aria-disabled', 'true');
  // «Crear otra zapatilla» decidido con un proveedor tampoco vale si el otro reconoce la foto.
  await elegirModo(novedad(page, 1), 'Crear otra zapatilla');
  await expect(seccionPdf(page).locator('#imp-pdf-anadir')).toHaveText('Añadir al lote (1 ficha)');
  await elegirProveedor(page, 'Proveedor A');
  await expect(novedad(page, 1)).toContainText('NIKE WINFLO P23 · NEGRO');
  await expect(seccionPdf(page).locator('#imp-pdf-anadir')).toHaveAttribute('aria-disabled', 'true');
  expect(sinRed(problemas)).toEqual([]);
});

test('una operación sin confirmar conserva su proveedor: se comprueba y se reintenta con su identificador', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await dosProveedores(page, 'operacion');
  await novedad(page, 1).getByRole('checkbox', { name: 'Añadir 44' }).click();
  const e = contarEscrituras(page);
  await page.route(RPC, (route) => route.abort('connectionreset'));
  await aplicar(page).click();
  await expect(operacion(page, 'WINFLO P23')).toContainText('el cambio todavía no aparece en el servidor', { timeout: 30000 });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await elegirProveedor(page, 'Proveedor B');
  await expect(operacion(page, 'WINFLO P23')).toContainText('Enviada con el proveedor «Proveedor A».');
  await expect(novedad(page, 1).locator('.importador-nov-comparar')).toContainText('· NEGRO'); // su contexto original
  await expect(novedad(page, 1)).toContainText('tiene un resultado por confirmar con el proveedor «Proveedor A»');
  await esperarGuardadoLocal(page);
  await recargar(page, problemas, browserName);
  await abrirImportador(page);
  await importador(page).getByRole('button', { name: /^Continuar el borrador/ }).click();
  await operacion(page, 'WINFLO P23').getByRole('button', { name: 'Reintentar' }).click();
  await expect(operacion(page, 'WINFLO P23')).toContainText('Actualizada', { timeout: 30000 });
  expect(new Set(e.cuerpos.map((c) => c.p_operacion)).size).toBe(1);
  const [negro, azul] = (await producto23('WINFLO P23')).variantes;
  expect([negro.tallas.length, azul.tallas.length]).toEqual([5, 2]);
  const m = await memoria(page);
  const A = m.proveedores.find((p) => p.dato.nombre === 'Proveedor A').dato.id;
  expect(m.historial.map((h) => [h.dato.proveedor, h.dato.variante])).toEqual([[A, negro.id]]);
  expect(m.asociaciones).toHaveLength(2);
  // Ya aplicada con A: con B no se ofrece ni se anota otra vez.
  await ver(page, 'Todas');
  await expect(novedad(page, 1)).toContainText('Se aplicó con el proveedor «Proveedor A»');
  await expect(aplicar(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(novedades(page).getByRole('button', { name: /^Dar por revisadas/ })).toHaveCount(0);
  expect(sinRed(problemas)).toEqual([]);
});

test('relación pendiente de una zapatilla nueva y fechas aceptadas: también son del proveedor con el que se pidieron', async ({ page }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await importarEntrega(page, entrega('pendiente-b', FECHA1, [{ foto: 395, lineas: ['REEBOK CLUB P23 DAMA ROSADO', 'EU 36 al 38'], venta: '$119.900', coste: ['$80.000'] }]));
  await elegirProveedor(page, 'Proveedor A');
  await seccionPdf(page).getByRole('button', { name: 'Añadir al lote (1 ficha)' }).click();
  await expect(ficha(page, 0).getByText('Lista · se subirá al guardar')).toBeVisible({ timeout: 60000 });
  await elegirCategoria(ficha(page, 0), 'URBANAS');
  await ficha(page, 0).getByRole('button', { name: 'Confirmar y recordar esta relación' }).click();
  await elegirProveedor(page, 'Proveedor B');
  await expect(ficha(page, 0)).toContainText('Pediste recordarla para «Proveedor A» y el proveedor de la entrega ahora es «Proveedor B»');
  const e = contarEscrituras(page);
  await importador(page).getByRole('button', { name: /^Guardar lote como oculto/ }).click();
  await expect(pie(page)).toContainText('datos por corregir');
  expect([e.guardar, e.subir]).toEqual([0, 0]);
  await ficha(page, 0).getByRole('button', { name: 'Recordarla para «Proveedor B»' }).click();
  await importador(page).getByRole('button', { name: /^Guardar lote como oculto/ }).click();
  await expect(ficha(page, 0)).toContainText('Se recordó 1 fotografía', { timeout: 60000 });
  const m = await memoria(page);
  const B = m.proveedores.find((p) => p.dato.nombre === 'Proveedor B').dato.id;
  expect(m.asociaciones.map((a) => a.dato.proveedor)).toEqual([B]);
  await cerrarPdf(page);
  // Fecha desconocida aceptada con B: con A se vuelve a preguntar.
  await importarEntrega(page, entrega('sinfecha-b', '', [NEGRO]));
  await vincular(novedad(page, 1), 'WINFLO P23', cod('WINFLO P23|NEGRO'));
  await ver(page, 'Todas');
  for (const c of await novedades(page).locator('.importador-nov-fecha input').all()) await c.check();
  await expect(novedades(page).locator('.importador-nov-fecha input:not(:checked)')).toHaveCount(0);
  await elegirProveedor(page, 'Proveedor A');
  await expect(novedades(page).locator('.importador-nov-fecha input:checked')).toHaveCount(0);
  expect(sinRed(problemas)).toEqual([]);
});

test('ficha añadida con un proveedor cuya foto ya reconoce el otro: no se crea otra zapatilla sin decidirlo', async ({ page }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  const rutas = entrega('anadida-b', FECHA1, [{ foto: 396, lineas: ['REEBOK CLUB P23 DAMA BLANCO', 'EU 36 al 37'], venta: '$129.900', coste: ['$90.000'] }]);
  await importarEntrega(page, rutas);
  await elegirProveedor(page, 'Proveedor B');
  await vincular(novedad(page, 1), 'SAMBA P23', cod('SAMBA P23|BLANCO'));
  await cerrarPdf(page);
  await importarEntrega(page, rutas);
  await elegirProveedor(page, 'Proveedor A');
  await seccionPdf(page).getByRole('button', { name: 'Añadir al lote (1 ficha)' }).click();
  await expect(ficha(page, 0).getByText('Lista · se subirá al guardar')).toBeVisible({ timeout: 60000 });
  await elegirCategoria(ficha(page, 0), 'URBANAS');
  await elegirProveedor(page, 'Proveedor B');
  const e = contarEscrituras(page);
  await importador(page).getByRole('button', { name: /^Guardar lote como oculto/ }).click();
  await expect(ficha(page, 0)).toContainText('ya está relacionada con ADIDAS SAMBA P23 · BLANCO para «Proveedor B» (se añadió con «Proveedor A»)');
  expect([e.guardar, e.subir]).toEqual([0, 0]);
  await elegirProveedor(page, 'Proveedor A');
  await importador(page).getByRole('button', { name: /^Guardar lote como oculto/ }).click();
  await expect(ficha(page, 0)).toContainText('Guardada oculta', { timeout: 60000 });
  expect(e.guardar).toBe(1);
  expect(sinRed(problemas)).toEqual([]);
});

test('si cambia el público de la zapatilla relacionada se revisa; corregir nombres mantiene la relación', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  const rutas = entrega('publico', FECHA1, [NEGRO]);
  await importarEntrega(page, rutas);
  await elegirProveedor(page, 'Proveedor Público');
  await vincular(novedad(page, 1), 'WINFLO P23', cod('WINFLO P23|NEGRO'));
  await cerrarPdf(page);
  const reabrir = async () => {
    await esperarGuardadoLocal(page).catch(() => {});
    await recargar(page, problemas, browserName);
    await abrirImportador(page);
    await expect(importador(page).locator('#imp-borradores, #imp-entrada').first()).toBeVisible();
    if (await importador(page).locator('#imp-borrador-nuevo').count()) await importador(page).locator('#imp-borrador-nuevo').click();
    await importarEntrega(page, rutas);
    await elegirProveedor(page, 'Proveedor Público');
    await ver(page, 'Todas');
  };
  const id = cat.p['WINFLO P23'].id;
  // Nombre del modelo y del color corregidos: la misma relación, con sus nombres actuales.
  await servicio('PATCH', `/rest/v1/productos?id=eq.${id}`, { nombre: 'WINFLO DIEZ P23' });
  await servicio('PATCH', `/rest/v1/variantes?id=eq.${cat.v['WINFLO P23|NEGRO'].id}`, { color: 'CARBON' });
  await reabrir();
  await expect(novedad(page, 1)).toContainText('NIKE WINFLO DIEZ P23 · CARBON');
  await expect(novedad(page, 1)).toContainText('Fotografía reconocida por la relación que confirmaste.');
  await novedad(page, 1).getByRole('checkbox', { name: 'Añadir 44' }).click();
  await expect(aplicar(page)).toHaveText('Aplicar cambios seleccionados (1 zapatilla)');
  await cerrarPdf(page);
  // Ahora la zapatilla es para Dama y la entrega sigue diciendo Hombre.
  await servicio('PATCH', `/rest/v1/productos?id=eq.${id}`, { publico: 'dama' });
  await reabrir();
  const e = contarEscrituras(page);
  await expect(novedad(page, 1)).not.toContainText('Fotografía reconocida');
  await expect(novedad(page, 1)).toContainText('Cuando confirmaste la relación, la zapatilla era para Hombre y ahora es para Dama');
  await expect(filtro(page, 'Por reconocer o revisar')).toHaveText('Por reconocer o revisar (1)');
  await expect(aplicar(page)).toHaveAttribute('aria-disabled', 'true');
  // Se revisa y se confirma otra vez: la relación vale con el público actual.
  await novedad(page, 1).getByRole('button', { name: /^Tarjeta 1: es NIKE WINFLO DIEZ P23 · CARBON/ }).click();
  await expect(novedad(page, 1)).toContainText('Son versiones distintas: confírmalo solo si de verdad corresponde.');
  await novedad(page, 1).getByRole('button', { name: 'Confirmar y recordar esta relación' }).click();
  await novedad(page, 1).getByRole('checkbox', { name: 'Añadir 44' }).click();
  await expect(aplicar(page)).toHaveText('Aplicar cambios seleccionados (1 zapatilla)');
  // Con el borrador abierto vuelve a cambiar: la confirmación de esta entrega tampoco vale ya.
  await esperarGuardadoLocal(page);
  await servicio('PATCH', `/rest/v1/productos?id=eq.${id}`, { publico: 'unisex' });
  await recargar(page, problemas, browserName);
  await abrirImportador(page);
  await importador(page).getByRole('button', { name: /^Continuar el borrador/ }).first().click(); // el más reciente
  await ver(page, 'Todas');
  await expect(novedad(page, 1)).toContainText('Cuando la confirmaste, la zapatilla era para Dama y ahora es para Unisex');
  await expect(aplicar(page)).toHaveAttribute('aria-disabled', 'true');
  expect(e.guardar).toBe(0);
  expect((await memoria(page)).asociaciones).toHaveLength(1);
  expect(sinRed(problemas)).toEqual([]);
});

// ------------------------------------------------------------------ 2. guardado previo del borrador
test('si no se pudo guardar antes el borrador no se suben fotos; al reintentar se usan los mismos nombres y la misma operación', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await importarEntrega(page, entrega('previo-foto', FECHA1, [NEGRO]));
  await elegirProveedor(page, 'Proveedor Guardado');
  await vincular(novedad(page, 1), 'WINFLO P23', cod('WINFLO P23|NEGRO'));
  await elegirModo(novedad(page, 1), 'Añadir otra fotografía a un color existente');
  await ver(page, 'Todas');
  await esperarGuardadoLocal(page);
  const e = contarEscrituras(page);
  const subidas = [];
  page.on('request', (r) => { if (/\/storage\/v1\/object\/fotos-catalogo\//.test(r.url()) && r.method() === 'POST') subidas.push(new URL(r.url()).pathname); });
  const antes = await producto23('WINFLO P23');
  // 1. Falla todo guardado del borrador que lleve una operación en marcha.
  await fallarBorrador(page, '"estado":"guardando"');
  await aplicar(page).click();
  await expect(operacion(page, 'WINFLO P23')).not.toContainText('Guardando…', { timeout: 60000 });
  expect([e.subir, e.guardar]).toEqual([0, 0]); // ni Storage ni la actualización
  expect(await objetosDe(antes.id)).toEqual([]);
  expect(await producto23('WINFLO P23')).toEqual(antes);
  await expect(operacion(page, 'WINFLO P23')).toContainText('No se envió nada: este navegador no pudo guardar antes los datos para recuperar la actualización');
  await expect(operacion(page, 'WINFLO P23')).toContainText('se perdería al recargar');
  await expect(avisoNov(page)).toContainText('1 no se envió porque no se pudo guardar antes en este navegador');
  await expect(avisoNov(page)).not.toContainText('Se actualizó');
  const primero = (await intentos(page))[0];
  expect(primero.objetos).toHaveLength(1);
  // El trabajo sigue aquí y se puede exportar.
  await expect(novedad(page, 1).getByRole('checkbox', { name: 'Añadir esta fotografía a NEGRO' })).toBeChecked();
  const [descarga] = await Promise.all([page.waitForEvent('download'), operacion(page, 'WINFLO P23').getByRole('button', { name: 'Exportar respaldo' }).click()]);
  const archivo = path.join(PDFS23, `sin-guardar-${browserName}.json`);
  await descarga.saveAs(archivo);
  expect(Object.values(JSON.parse(fs.readFileSync(archivo, 'utf8')).borrador.datos.lote.inventario.operaciones)[0].pendiente.operacion).toBe(primero.operacion);
  if (browserName === 'chromium') await capturar23(page, 'sin-guardar-1280.png', '.importador-nov-operaciones');
  // 2. Se guarda antes de subir, pero no antes de enviar: se sube la foto y no se envía la actualización.
  await fallarBorrador(page, '"enviada":true');
  await operacion(page, 'WINFLO P23').getByRole('button', { name: 'Reintentar' }).click();
  await expect.poll(() => e.subir, { timeout: 60000 }).toBe(1);
  await expect(operacion(page, 'WINFLO P23')).toContainText('No se envió la actualización', { timeout: 60000 });
  expect(e.guardar).toBe(0);
  expect((await producto23('WINFLO P23')).version).toBe(antes.version);
  expect((await intentos(page))[0].operacion).toBe(primero.operacion);
  // 3. Se recupera el almacenamiento y se recarga: la operación y la foto conservan su nombre.
  await restaurarBorrador(page);
  await novedad(page, 1).getByRole('radio', { name: /^Conservar/ }).click();
  await esperarGuardadoLocal(page);
  await recargar(page, problemas, browserName);
  await abrirImportador(page);
  await importador(page).getByRole('button', { name: /^Continuar el borrador/ }).click();
  await operacion(page, 'WINFLO P23').getByRole('button', { name: 'Reintentar' }).click();
  await expect(avisoNov(page)).toContainText('Se actualizó 1 zapatilla existente', { timeout: 60000 });
  expect(e.cuerpos.map((c) => c.p_operacion)).toEqual([primero.operacion]);
  expect(new Set(subidas).size).toBe(1);
  expect((await objetosDe(antes.id)).map((o) => o.nombre)).toEqual(primero.objetos);
  const w = await producto23('WINFLO P23');
  expect([w.version, w.variantes[0].fotos.length]).toEqual([antes.version + 1, 3]);
  expect(sinRed(problemas)).toEqual([]);
});

test('sin guardado previo tampoco se envía la actualización; un resultado sin confirmar lo sigue siendo', async ({ page }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await importarEntrega(page, entrega('previo-rpc', FECHA1, [NEGRO]));
  await elegirProveedor(page, 'Proveedor Guardado');
  await vincular(novedad(page, 1), 'WINFLO P23', cod('WINFLO P23|NEGRO'));
  await ver(page, 'Todas');
  await novedad(page, 1).getByRole('checkbox', { name: 'Añadir 44' }).click();
  await esperarGuardadoLocal(page);
  const e = contarEscrituras(page);
  await fallarBorrador(page, '"enviada":true');
  await aplicar(page).click();
  await expect(operacion(page, 'WINFLO P23')).not.toContainText('Guardando…', { timeout: 30000 });
  await page.waitForTimeout(500);
  expect(e.guardar).toBe(0);
  expect((await producto23('WINFLO P23')).variantes[0].tallas).toHaveLength(4);
  await expect(operacion(page, 'WINFLO P23')).toContainText('No se envió la actualización');
  const { operacion: id } = (await intentos(page))[0];
  // Se restablece y se reintenta: la misma operación, una sola escritura. La respuesta se pierde sin llegar.
  await restaurarBorrador(page);
  await page.route(RPC, (route) => route.abort('connectionreset'));
  await operacion(page, 'WINFLO P23').getByRole('button', { name: 'Reintentar' }).click();
  await expect(operacion(page, 'WINFLO P23')).toContainText('el cambio todavía no aparece en el servidor', { timeout: 30000 });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  expect(e.cuerpos.map((c) => c.p_operacion)).toEqual([id]);
  // Reintentarla sin poder guardar antes: no se envía y sigue «sin confirmar» con su identificador.
  await fallarBorrador(page, '"estado":"guardando"');
  await operacion(page, 'WINFLO P23').getByRole('button', { name: 'Reintentar' }).click();
  await expect(operacion(page, 'WINFLO P23')).toContainText('No se reintentó', { timeout: 30000 });
  await expect(operacion(page, 'WINFLO P23').getByRole('button', { name: 'Comprobar otra vez' })).toBeVisible();
  expect(e.guardar).toBe(1);
  await restaurarBorrador(page);
  await operacion(page, 'WINFLO P23').getByRole('button', { name: 'Reintentar' }).click();
  await expect(avisoNov(page)).toContainText('Se actualizó 1 zapatilla existente', { timeout: 30000 });
  expect(e.cuerpos.map((c) => c.p_operacion)).toEqual([id, id]);
  expect((await producto23('WINFLO P23')).variantes[0].tallas).toHaveLength(5);
  expect((await memoria(page)).historial).toHaveLength(1);
  expect(sinRed(problemas)).toEqual([]);
});

test('recarga a mitad de la subida de una foto: al volver a aplicar usa el mismo nombre y la misma operación', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await importarEntrega(page, entrega('recarga-foto', FECHA1, [NEGRO]));
  await elegirProveedor(page, 'Proveedor Guardado');
  await vincular(novedad(page, 1), 'WINFLO P23', cod('WINFLO P23|NEGRO'));
  await elegirModo(novedad(page, 1), 'Añadir otra fotografía a un color existente');
  await ver(page, 'Todas');
  const subidas = [];
  page.on('request', (r) => { if (/\/storage\/v1\/object\/fotos-catalogo\//.test(r.url()) && r.method() === 'POST') subidas.push(new URL(r.url()).pathname); });
  let retenida = false;
  await page.route(SUBIDA, async (route) => { if (route.request().method() === 'POST') { await route.fetch(); retenida = true; } else await route.continue(); }); // llega, sin respuesta
  await aplicar(page).click();
  await expect.poll(() => retenida, { timeout: 60000 }).toBe(true);
  await page.reload();
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
  const e = contarEscrituras(page);
  await abrirImportador(page);
  await importador(page).getByRole('button', { name: /^Continuar el borrador/ }).click();
  await expect(operacion(page, 'WINFLO P23')).toContainText('El guardado se interrumpió antes de enviarse');
  await aplicar(page).click();
  await expect(avisoNov(page)).toContainText('Se actualizó 1 zapatilla existente', { timeout: 60000 });
  expect(new Set(subidas).size).toBe(1);
  expect(e.guardar).toBe(1);
  expect(await objetosDe(cat.p['WINFLO P23'].id)).toHaveLength(1);
  expect((await producto23('WINFLO P23')).variantes[0].fotos).toHaveLength(3);
  void browserName;
  expect(sinRed(problemas)).toEqual([]);
});

// ------------------------------------------------------------------ 3. tallas anunciadas
const SAMBA = (tallas, venta = '$129.900') => [{ foto: 397, lineas: ['NIKE WINFLO P23 HOMBRE NEGRO', tallas], venta, coste: ['$100.000'] }];
test('tallas que se dejan de anunciar: es un cambio de tallas, se revisa sin escribir y no se repite', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await importarEntrega(page, entrega('tallas-1', FECHA1, SAMBA('Tallas EU 40 al 43', '$150.000')));
  await elegirProveedor(page, 'Proveedor Tallas');
  await vincular(novedad(page, 1), 'WINFLO P23', cod('WINFLO P23|NEGRO'));
  await novedades(page).getByRole('button', { name: 'Dar por revisadas sin cambios (1)' }).click();
  await expect(pie(page)).toContainText('1 entrada anotada');
  await cerrarPdf(page);
  const base = await productos23();
  const e = contarEscrituras(page);
  const rutas = entrega('tallas-2', FECHA2, SAMBA('Tallas EU 40 al 41', '$150.000'));
  await importarEntrega(page, rutas);
  await expect(filtro(page, 'Cambios de tallas')).toHaveText('Cambios de tallas (1)');
  await expect(filtro(page, 'Sin cambios')).toHaveText('Sin cambios (0)');
  await ver(page, 'Cambios de tallas');
  await expect(novedad(page, 1)).toContainText('Esta entrega ya no menciona 42 y 43. Se conservan en el catálogo; no se desactivó nada.');
  await expect(novedad(page, 1)).toContainText('Frente a la última entrega revisada (tallas-1-venta.pdf, 20 de noviembre de 2026)');
  await expect(novedad(page, 1).getByRole('checkbox', { name: /^Añadir/ })).toHaveCount(0); // nada que añadir
  await expect(novedad(page, 1).locator('.importador-nov-efecto')).toContainText('No se modificará nada.');
  await expect(aplicar(page)).toHaveAttribute('aria-disabled', 'true');
  if (browserName === 'chromium') {
    await capturar23(page, 'tallas-1280.png', '.importador-nov-diferencia:nth-child(3)');
    await page.setViewportSize({ width: 390, height: 844 });
    await capturar23(page, 'tallas-390.png', '.importador-nov-diferencia:nth-child(3)');
    await page.setViewportSize({ width: 1280, height: 720 });
  }
  // Se marca como revisada desde la propia entrada: solo en la memoria local.
  await novedad(page, 1).getByRole('button', { name: 'Marcar como revisada' }).click();
  await expect(pie(page)).toContainText('1 entrada anotada como revisada (sin escribir en el catálogo).');
  await ver(page, 'Todas');
  await expect(filtro(page, 'Cambios de tallas')).toHaveText('Cambios de tallas (0)');
  await expect(novedad(page, 1).locator('.importador-nov-marcas')).toHaveText('Sin cambios');
  await cerrarPdf(page);
  // La misma información otra vez (la misma entrega y otra posterior): no vuelve a salir.
  await importarEntrega(page, rutas);
  await expect(filtro(page, 'Sin cambios')).toHaveText('Sin cambios (1)');
  await cerrarPdf(page);
  await importarEntrega(page, entrega('tallas-3', 'Jueves 26 de Noviembre de 2026', SAMBA('Tallas EU 40 al 41', '$150.000')));
  await expect(filtro(page, 'Sin cambios')).toHaveText('Sin cambios (1)');
  await ver(page, 'Todas');
  await expect(novedad(page, 1)).toContainText('No se mencionan y se conservan igual: 42.'); // 43 está desactivada en el catálogo
  await cerrarPdf(page);
  // Vuelven a anunciarse (ya están en el catálogo) y una que se puede añadir.
  await importarEntrega(page, entrega('tallas-4', 'Viernes 27 de Noviembre de 2026', SAMBA('Tallas EU 40 al 44', '$150.000')));
  await ver(page, 'Cambios de tallas');
  await expect(novedad(page, 1)).toContainText('Ahora menciona también 42, 43 y 44.');
  await expect(novedad(page, 1).getByRole('checkbox', { name: 'Añadir 44' })).not.toBeChecked();
  await expect(novedad(page, 1).getByRole('checkbox', { name: /^Añadir 4[23]/ })).toHaveCount(0);
  expect([e.guardar, e.subir]).toEqual([0, 0]);
  expect(await productos23()).toEqual(base); // estados, activación y vigencias intactos
  expect(sinRed(problemas)).toEqual([]);
});

test('mensajes sin tallas o sin fecha: no son una lista vacía y lo revisado no vuelve a salir', async ({ page }) => {
  const [foto] = await prepararFotos20(1);
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  const azul = cat.v['WINFLO P23|AZUL'];
  const pegar = async (texto, primera = false) => {
    if (!primera) {
      await importador(page).locator('#importador-ver-borradores').click();
      await importador(page).locator('#imp-borrador-nuevo').click();
    }
    await ficha(page, 0).getByLabel(MENSAJE).fill(texto);
    await ficha(page, 0).locator('input[type="file"]').setInputFiles(foto);
    await expect(ficha(page, 0).getByText('Lista · se subirá al guardar')).toBeVisible({ timeout: 30000 });
    if (await importador(page).getByRole('button', { name: 'Comparar con mi inventario' }).isVisible() && !(await novedades(page).count())) await importador(page).getByRole('button', { name: 'Comparar con mi inventario' }).click();
    await elegirProveedor(page, 'Proveedor Mensajes');
    await ver(page, 'Todas');
  };
  const revisar = async () => {
    for (const c of await novedades(page).locator('.importador-nov-fecha input').all()) await c.check();
    await novedades(page).getByRole('button', { name: 'Dar por revisadas sin cambios (1)' }).click();
    await expect(pie(page)).toContainText('1 entrada anotada');
    await esperarGuardadoLocal(page);
  };
  await pegar('NIKE WINFLO P23 HOMBRE $100.000\nTallas 40 y 41', true);
  await vincular(novedad(page, 1, 'Ficha'), 'WINFLO P23', new RegExp(azul.codigo_variante));
  await revisar();
  // Sin tallas: no es «ya no hay tallas», ni al compararlo ni después de revisarlo.
  await pegar('NIKE WINFLO P23 HOMBRE $100.000');
  await expect(novedad(page, 1, 'Ficha').locator('.importador-nov-marcas')).toHaveText('Sin cambios');
  await expect(novedad(page, 1, 'Ficha')).not.toContainText('ya no menciona');
  await expect(novedad(page, 1, 'Ficha')).toContainText('Esta entrega no trae tallas: no se compara ni cambia nada.');
  await revisar();
  // Menos tallas que en lo último que SÍ traía tallas: es un cambio; revisado, el mismo mensaje no vuelve a salir.
  await pegar('NIKE WINFLO P23 HOMBRE $100.000\nTallas 40');
  await expect(filtro(page, 'Cambios de tallas')).toHaveText('Cambios de tallas (1)');
  await expect(novedad(page, 1, 'Ficha')).toContainText('Esta entrega ya no menciona 41. Se conserva en el catálogo; no se desactivó nada.');
  await revisar();
  await expect(filtro(page, 'Cambios de tallas')).toHaveText('Cambios de tallas (0)');
  await pegar('NIKE WINFLO P23 HOMBRE $100.000\nTallas 40');
  await expect(filtro(page, 'Cambios de tallas')).toHaveText('Cambios de tallas (0)');
  // Con una entrega fechada como referencia, un mensaje sin fecha no pasa a ser lo último, pero tampoco insiste.
  await importador(page).locator('#importador-ver-borradores').click();
  await importador(page).locator('#imp-borrador-nuevo').click();
  const s = await pegarVarias(page, '[25/11/26, 10:15] Proveedor: NIKE WINFLO P23 HOMBRE $100.000\nTallas 40 y 41');
  await s.getByRole('button', { name: /^Crear/ }).click();
  await ficha(page, 0).locator('input[type="file"]').setInputFiles(foto);
  await expect(ficha(page, 0).getByText('Lista · se subirá al guardar')).toBeVisible({ timeout: 30000 });
  if (!(await novedades(page).count())) await importador(page).getByRole('button', { name: 'Comparar con mi inventario' }).click();
  await elegirProveedor(page, 'Proveedor Mensajes');
  await revisar();
  for (const vez of [1, 2]) {
    await pegar('NIKE WINFLO P23 HOMBRE $100.000\nTallas 40');
    await expect(filtro(page, 'Cambios de tallas')).toHaveText(`Cambios de tallas (${vez === 1 ? 1 : 0})`);
    if (vez === 1) await revisar();
  }
  const w = await producto23('WINFLO P23');
  expect(w.variantes[1].tallas.map((t) => [t.talla, t.activa, t.estado])).toEqual([['40', true, 'REVISAR'], ['41', true, 'REVISAR']]);
  expect(w.version).toBe(1);
  expect(sinRed(problemas)).toEqual([]);
});
