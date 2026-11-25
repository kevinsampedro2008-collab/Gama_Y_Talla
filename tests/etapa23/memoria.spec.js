// @ts-check
/* Etapa 23 · Memoria de asociaciones: destinos que cambian, aproximadas y contradictorias, separación por
 * proveedor, usuario y proyecto, consultar/corregir/olvidar, exportar e importar, y compatibilidad con la base y
 * los respaldos anteriores.
 *
 * SOLO contra el Supabase LOCAL y el entorno aislado. Modelos ficticios « P23».
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, servicio, entrarAlPanel, abrirImportador, importador, recargar, esperarGuardadoLocal, seccionPdf, ficha, fichas, color, entorno,
  limpiar23, producto23, productos23, crearCatalogo23, entrega, novedades, novedad, filtro, ver, aplicar, avisoNov, importarEntrega, elegirProveedor, elegirModo, vincular, memoria, contarEscrituras,
  abrirLoteNuevo, pie, propios, capturar23, PDFS23, MENSAJE
} from './ayudas23.js';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180000);
test.use({ actionTimeout: 15000 });

let admin;
let otro;
let cat;
test.beforeAll(async () => {
  admin = await crearUsuario(`etapa23m-${Date.now()}@gamaytalla.test`); await hacerAdmin(admin.id);
  otro = await crearUsuario(`etapa23n-${Date.now()}@gamaytalla.test`); await hacerAdmin(otro.id);
});
test.afterAll(async () => { await limpiar23(); for (const a of [admin, otro]) { await quitarAdmin(a.id); await borrarUsuario(a.id); } });
test.beforeEach(async () => { await limpiar23(); cat = await crearCatalogo23(); });

const FECHA = 'Viernes 20 de Noviembre de 2026';
const NEGRO = { foto: 371, lineas: ['NIKE WINFLO P23 HOMBRE NEGRO', 'Tallas EU 40 al 42'], venta: '$150.000', coste: ['$100.000'] };
const SAMBA = { foto: 372, lineas: ['ADIDAS SAMBA P23 DAMA BLANCO', 'EU 36 al 37'], venta: '$129.900', coste: ['$90.000'] };
const GRIS = { foto: 373, lineas: ['NIKE WINFLO P23 HOMBRE GRIS', 'Tallas EU 40 al 40'], venta: '$150.000', coste: ['$100.000'] };
const cod = (k) => new RegExp(cat.v[k].codigo_variante);
const cerrarPdf = async (page) => {
  await seccionPdf(page).getByRole('button', { name: 'Cerrar la importación' }).click();
  await seccionPdf(page).locator('#imp-pdf-cerrar-confirmar').getByRole('button', { name: 'Cerrar la importación' }).click();
  await expect(seccionPdf(page)).toHaveCount(0);
};
const salir = async (page) => {
  await importador(page).locator('[data-imp="cerrar"]').click();
  if (await importador(page).getByRole('button', { name: 'Cerrar y conservar el lote' }).isVisible()) await importador(page).getByRole('button', { name: 'Cerrar y conservar el lote' }).click();
  await expect(importador(page)).toBeHidden();
};

test('destinos renombrados, desactivados, retirados e inexistentes: se releen y nunca se activan ni restauran', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  const rutas = entrega('destinos', FECHA, [NEGRO, SAMBA, GRIS]);
  await importarEntrega(page, rutas);
  await elegirProveedor(page, 'Proveedor Destinos');
  await vincular(novedad(page, 1), 'WINFLO P23', cod('WINFLO P23|NEGRO'));
  await vincular(novedad(page, 2), 'SAMBA P23', cod('SAMBA P23|BLANCO'));
  // Un color desactivado se puede vincular y comparar, pero no se activa.
  await vincular(novedad(page, 3), 'WINFLO P23', cod('WINFLO P23|GRIS'));
  await expect(novedad(page, 3)).toContainText('Este color está desactivado: se conserva así (no se activa).');
  expect((await memoria(page)).asociaciones).toHaveLength(3);
  await salir(page);

  const w = cat.p['WINFLO P23'].id;
  await servicio('PATCH', `/rest/v1/productos?id=eq.${w}`, { nombre: 'WINFLO RENOMBRADA P23', codigo_interno: 'WR-NUEVO-23' });
  await servicio('PATCH', `/rest/v1/variantes?id=eq.${cat.v['WINFLO P23|NEGRO'].id}`, { color: 'CARBON' });
  await servicio('PATCH', `/rest/v1/productos?id=eq.${cat.p['SAMBA P23'].id}`, { retirado_en: new Date().toISOString() });
  await recargar(page, problemas, browserName);
  const e = contarEscrituras(page);
  await abrirLoteNuevo(page);
  await importarEntrega(page, rutas);
  await elegirProveedor(page, 'Proveedor Destinos');
  await ver(page, 'Todas');
  await expect(novedad(page, 1)).toContainText('NIKE WINFLO RENOMBRADA P23 · CARBON');
  await expect(novedad(page, 2)).toContainText('está retirada del catálogo: no se restaura ni se actualiza desde aquí');
  await expect(novedad(page, 2).getByRole('button', { name: /Es este color|es ADIDAS/ })).toHaveCount(0);
  await expect(novedad(page, 3)).toContainText('El color relacionado está desactivado: se conserva así.');
  await expect(filtro(page, 'Por reconocer o revisar')).toHaveText('Por reconocer o revisar (2)');
  // Confirmar el desactivado y añadirle una talla no lo activa.
  await novedad(page, 3).getByRole('button', { name: /es NIKE WINFLO RENOMBRADA P23 · GRIS/ }).click();
  await novedad(page, 3).getByRole('button', { name: 'Usar solo esta vez' }).click();
  await salir(page);
  // El color deja de existir: revisión, sin inventar otro destino.
  for (const k of ['WINFLO P23|AZUL', 'WINFLO P23|NEGRO']) {
    for (const t of ['tallas', 'fotos']) await servicio('DELETE', `/rest/v1/${t}?variante_id=eq.${cat.v[k].id}`);
    await servicio('DELETE', `/rest/v1/variantes?id=eq.${cat.v[k].id}`);
  }
  await recargar(page, problemas, browserName);
  await abrirLoteNuevo(page);
  await importarEntrega(page, rutas);
  await elegirProveedor(page, 'Proveedor Destinos');
  await ver(page, 'Todas');
  await expect(novedad(page, 1)).toContainText('ya no existe en el catálogo');
  await expect(aplicar(page)).toHaveAttribute('aria-disabled', 'true');
  const lista = await productos23();
  expect(lista.find((p) => p.id === w).variantes.map((v) => [v.color, v.activa])).toEqual([['GRIS', false]]);
  expect(lista.find((p) => p.nombre === 'SAMBA P23').retirado_en).not.toBeNull();
  expect(e.guardar).toBe(0);
  expect(propios(problemas)).toEqual([]);
});

test('aproximada, contradictoria y con varios destinos: solo proponen; nada se elige solo', async ({ page }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await importarEntrega(page, entrega('aprox-a', FECHA, [NEGRO, SAMBA]));
  await elegirProveedor(page, 'Proveedor Dudas');
  await vincular(novedad(page, 1), 'WINFLO P23', cod('WINFLO P23|NEGRO'));
  await vincular(novedad(page, 2), 'SAMBA P23', cod('SAMBA P23|BLANCO'));
  await cerrarPdf(page);
  // 1: la foto recodificada; 2: la misma foto, pero dice Dama (versión distinta); 3: la foto exacta de Samba con otro modelo.
  await importarEntrega(page, entrega('aprox-b', FECHA, [
    { ...NEGRO, foto: { semilla: 371, ruido: 2 } }, { ...NEGRO, lineas: ['NIKE WINFLO P23 DAMA NEGRO', 'EU 36 al 38'] }, { ...SAMBA, lineas: ['ADIDAS GAZELLE P23 DAMA BLANCO', 'EU 36 al 37'] }
  ]));
  await ver(page, 'Todas');
  await expect(filtro(page, 'Por reconocer o revisar')).toHaveText('Por reconocer o revisar (3)');
  await expect(novedad(page, 1)).toContainText('Fotografía parecida, no idéntica: compárala y confírmala antes de usarla.');
  await expect(novedad(page, 2)).toContainText('La entrega dice Dama y la zapatilla relacionada es para Hombre: las versiones no se mezclan solas.');
  await expect(novedad(page, 3)).toContainText('La entrega dice «ADIDAS GAZELLE P23» y, cuando confirmaste la relación, decía «ADIDAS SAMBA P23».');
  for (const n of [1, 2, 3]) await expect(novedad(page, n)).toContainText('Sin destino todavía');
  await expect(seccionPdf(page).locator('#imp-pdf-anadir')).toHaveAttribute('aria-disabled', 'true');
  // La aproximada se confirma y se recuerda: ahora ese color tiene dos fotografías.
  await novedad(page, 1).getByRole('button', { name: /es NIKE WINFLO P23 · NEGRO/ }).click();
  await novedad(page, 1).getByRole('button', { name: 'Confirmar y recordar esta relación' }).click();
  await expect(novedad(page, 1).locator('.importador-nov-recuerdo')).toContainText('Relación recordada');
  // La contradictoria se decide como otra zapatilla: pasa a crearse como ficha (no toca la de Hombre).
  await elegirModo(novedad(page, 2), 'Crear otra zapatilla');
  await expect(novedad(page, 2).locator('.importador-nov-marcas')).toContainText('Zapatilla nueva');
  await expect(seccionPdf(page).locator('#imp-pdf-anadir')).toHaveText('Añadir al lote (1 ficha)');
  // La tercera, omitida.
  await elegirModo(novedad(page, 3), 'Omitir esta entrada');
  await expect(filtro(page, 'Omitidas')).toHaveText('Omitidas (1)');
  expect((await memoria(page)).asociaciones).toHaveLength(3);
  await cerrarPdf(page);
  // Ahora la foto 371 se relaciona también con otro color: con dos destinos, pide revisión.
  await importarEntrega(page, entrega('aprox-c', FECHA, [NEGRO]));
  await ver(page, 'Todas');
  await elegirModo(novedad(page, 1), 'Actualizar un color existente');
  await novedad(page, 1).getByRole('searchbox').fill('WINFLO P23');
  await novedad(page, 1).getByRole('button', { name: cod('WINFLO P23|AZUL') }).click();
  await novedad(page, 1).getByRole('button', { name: 'Confirmar y recordar esta relación' }).click();
  await expect(novedad(page, 1).locator('.importador-nov-recuerdo')).toContainText('Relación recordada');
  await cerrarPdf(page);
  await importarEntrega(page, entrega('aprox-c', FECHA, [NEGRO]));
  await ver(page, 'Todas');
  await expect(novedad(page, 1)).toContainText('Esta fotografía está relacionada con más de un color');
  await expect(novedad(page, 1).getByRole('group', { name: 'Destinos posibles de Tarjeta 1' }).locator('.importador-nov-candidato')).toHaveCount(2);
  await expect(novedad(page, 1)).toContainText('Sin destino todavía');
  expect(propios(problemas)).toEqual([]);
});

test('separación por proveedor (y perfil con reglas nuevas), por usuario y por proyecto', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  // Un perfil de proveedor y relaciones de OTRO proyecto y de otro usuario, escritos en este navegador.
  const ambito = await page.evaluate(() => `${window.GamaTallaPanel.configuracion().url}|${window.GamaTallaPanel.usuario().id}`);
  await page.evaluate(async (a) => {
    await window.GamaTallaBorradores.guardarPerfil(a, { ...window.GamaTallaTextoProveedor.perfilInicial('11111111-1111-4111-8111-111111111111', 'Perfil Con Reglas'), revision: 1 });
  }, ambito);
  await abrirImportador(page);
  await importador(page).locator('#imp-perfiles > summary').click();
  await importador(page).getByRole('radio', { name: /Perfil Con Reglas/ }).first().click();
  const rutas = entrega('separa', FECHA, [NEGRO]);
  await importarEntrega(page, rutas);
  // Con un perfil, el proveedor es el del perfil (sin preguntarlo).
  await expect(novedades(page).locator('#imp-nov-proveedor > summary')).toContainText('Perfil Con Reglas');
  await vincular(novedad(page, 1), 'WINFLO P23', cod('WINFLO P23|NEGRO'));
  const m = await memoria(page);
  expect(m.asociaciones[0].dato.proveedor).toBe('perfil:11111111-1111-4111-8111-111111111111');
  await salir(page);
  // Cambian las reglas del perfil (otra revisión) y su nombre: la identidad del proveedor es la misma.
  await page.evaluate(async (a) => {
    await window.GamaTallaBorradores.guardarPerfil(a, { ...window.GamaTallaTextoProveedor.perfilInicial('11111111-1111-4111-8111-111111111111', 'Perfil Renombrado'), revision: 7, categoria: 'RUNNING' });
  }, ambito);
  await recargar(page, problemas, browserName);
  await abrirLoteNuevo(page);
  await importador(page).locator('#imp-perfiles > summary').click();
  await importador(page).getByRole('radio', { name: /Perfil Renombrado/ }).first().click();
  await importarEntrega(page, rutas);
  await ver(page, 'Todas');
  await expect(novedad(page, 1)).toContainText('Fotografía reconocida por la relación que confirmaste.');
  // Otro proveedor: no se reconoce. El Perfil general no tiene proveedor: tampoco.
  await elegirProveedor(page, 'Otro Proveedor');
  await expect(novedad(page, 1)).toContainText('La marca y el modelo no dicen qué color es');
  await elegirProveedor(page, 'Perfil Renombrado');
  await expect(novedad(page, 1)).toContainText('Fotografía reconocida');
  await salir(page);
  await abrirImportador(page); // otro lote, con el Perfil general
  await importador(page).locator('#importador-ver-borradores').click();
  await importador(page).locator('#imp-borrador-nuevo').click();
  if (!(await importador(page).locator('#imp-perfiles').evaluate((n) => /** @type {HTMLDetailsElement} */ (n).open))) await importador(page).locator('#imp-perfiles > summary').click();
  await importador(page).getByRole('radio', { name: /^Perfil general/ }).first().click();
  await importarEntrega(page, rutas);
  await expect(novedades(page).locator('#imp-nov-proveedor > summary')).toContainText('sin elegir');
  await ver(page, 'Todas');
  await expect(novedad(page, 1)).not.toContainText('Fotografía reconocida');
  // Proyecto: las mismas relaciones copiadas bajo otra URL no aparecen aquí.
  await page.evaluate(async ([a, registro]) => {
    const otroAmbito = `http://otro-proyecto.local|${a.split('|')[1]}`;
    await window.GamaTallaBorradores.guardarMemoria(otroAmbito, { proveedores: [{ id: 'prov:22222222-2222-4222-8222-222222222222', nombre: 'DE OTRO PROYECTO', creado: new Date().toISOString() }], asociaciones: [registro], historial: [] });
  }, [ambito, m.asociaciones[0].dato]);
  await salir(page);
  await recargar(page, problemas, browserName);
  await abrirLoteNuevo(page);
  await importador(page).getByRole('button', { name: 'Comparar con mi inventario' }).click();
  if (!(await novedades(page).locator('#imp-nov-proveedor').evaluate((n) => /** @type {HTMLDetailsElement} */ (n).open))) await novedades(page).locator('#imp-nov-proveedor > summary').click();
  await expect(novedades(page).getByRole('radio', { name: 'DE OTRO PROYECTO' })).toHaveCount(0);
  await expect(novedades(page).locator('#imp-memoria-resumen')).toHaveText('Memoria de reconocimiento (1 relación)');
  await salir(page);
  // Otro usuario en el mismo navegador: no ve ni reconoce nada.
  await page.getByRole('button', { name: 'Cerrar sesión' }).first().click();
  await expect(page.locator('#vista-ingreso')).toBeVisible();
  await page.evaluate(() => localStorage.clear());
  const problemas2 = await entrarAlPanel(page, otro);
  await abrirLoteNuevo(page);
  await importador(page).getByRole('button', { name: 'Comparar con mi inventario' }).click();
  await expect(novedades(page).locator('#imp-memoria-resumen')).toHaveText('Memoria de reconocimiento (0 relaciones)');
  expect(propios(problemas2)).toEqual([]);
  expect(propios(problemas)).toEqual([]);
});

test('consultar, corregir, olvidar, exportar e importar la memoria; otro usuario: por vincular', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  const e = contarEscrituras(page);
  await abrirImportador(page);
  const rutas = entrega('gestion', FECHA, [NEGRO, SAMBA]);
  await importarEntrega(page, rutas);
  await elegirProveedor(page, 'Proveedor Gestión');
  await vincular(novedad(page, 1), 'WINFLO P23', cod('WINFLO P23|NEGRO'));
  await vincular(novedad(page, 2), 'SAMBA P23', cod('SAMBA P23|BLANCO'));
  await ver(page, 'Todas');
  await novedades(page).getByRole('button', { name: /^Dar por revisadas sin cambios/ }).click();
  await expect(pie(page)).toContainText('anotadas como revisadas');
  const antes = await productos23();
  const caja = novedades(page).locator('#imp-memoria');
  await caja.locator('summary').click();
  await expect(caja.locator('.importador-nov-relacion')).toHaveCount(2);
  await expect(caja).toContainText('NIKE WINFLO P23 · NEGRO');
  await expect(caja).toContainText('foto de catálogo PDF · gestion-venta.pdf, página 2, tarjeta 1, 20 de noviembre de 2026');
  if (browserName === 'chromium') await capturar23(page, 'memoria-1280.png', '#imp-memoria');
  // Buscar con Intro no envía el formulario del lote.
  await caja.getByLabel('Buscar en la memoria').fill('samba');
  await caja.getByLabel('Buscar en la memoria').press('Enter');
  await expect(caja.locator('.importador-nov-relacion')).toHaveCount(1);
  await expect(pie(page)).not.toContainText('datos por corregir');
  await caja.getByLabel('Buscar en la memoria').fill('');
  await expect(caja.locator('.importador-nov-relacion')).toHaveCount(2);
  // Exportar.
  const [descarga] = await Promise.all([page.waitForEvent('download'), caja.getByRole('button', { name: 'Exportar memoria' }).click()]);
  const archivo = path.join(PDFS23, `memoria-${browserName}.json`);
  await descarga.saveAs(archivo);
  const json = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  expect([json.formato, json.version, json.asociaciones.length, json.historial.length]).toEqual(['gama-talla/memoria-inventario', 1, 2, 2]);
  expect(JSON.stringify(json)).not.toMatch(/eyJ|token|password|base64/i);
  // Corregir: pasa al AZUL. Olvidar: el catálogo no cambia.
  await caja.locator('.importador-nov-relacion').filter({ hasText: 'WINFLO' }).getByRole('button', { name: /^Corregir/ }).click();
  await caja.locator('#imp-memoria-corregir-buscar').fill('WINFLO P23');
  await caja.getByRole('button', { name: cod('WINFLO P23|AZUL') }).click();
  await expect(caja.locator('.importador-nov-relacion').filter({ hasText: 'AZUL' })).toHaveCount(1);
  await expect(pie(page)).toContainText('Relación corregida');
  await caja.locator('.importador-nov-relacion').filter({ hasText: 'SAMBA' }).getByRole('button', { name: /^Olvidar/ }).click();
  await caja.getByRole('button', { name: 'Olvidar', exact: true }).click();
  await expect(caja.locator('.importador-nov-relacion')).toHaveCount(1);
  await expect(pie(page)).toContainText('Relación olvidada. El catálogo no cambió.');
  expect(await productos23()).toEqual(antes);
  // Importar (mismo proyecto y usuario): vuelve lo olvidado; lo que hay no se borra. La foto del NEGRO queda con dos destinos.
  await caja.locator('#imp-memoria-archivo').setInputFiles(archivo);
  await expect(caja.locator('#imp-memoria-importada')).toContainText('Se añaden 2 relaciones y 2 registros de historial. Lo que ya tienes no se borra.');
  await caja.getByRole('button', { name: 'Importar', exact: true }).click();
  await expect(caja.locator('.importador-nov-relacion')).toHaveCount(3);
  // Un archivo que no vale no cambia nada.
  const malo = path.join(PDFS23, 'malo.json');
  fs.writeFileSync(malo, '{"formato":"otro"}');
  await caja.locator('#imp-memoria-archivo').setInputFiles(malo);
  await expect(pie(page)).toContainText('No se importó nada: No es una memoria de inventario');
  expect((await memoria(page)).asociaciones).toHaveLength(3);
  await salir(page);

  // Otro usuario importa el mismo archivo: nada se usa solo hasta vincularlo.
  await page.getByRole('button', { name: 'Cerrar sesión' }).first().click();
  await expect(page.locator('#vista-ingreso')).toBeVisible();
  await page.evaluate(() => localStorage.clear());
  await entrarAlPanel(page, otro);
  await abrirLoteNuevo(page);
  await importarEntrega(page, rutas);
  const caja2 = novedades(page).locator('#imp-memoria');
  await caja2.locator('summary').click();
  await caja2.locator('#imp-memoria-archivo').setInputFiles(archivo);
  await expect(caja2.locator('#imp-memoria-importada')).toContainText('Es la memoria de otro proyecto o usuario');
  await caja2.getByRole('button', { name: 'Importar por vincular' }).click();
  await expect(caja2.locator('.importador-nov-relacion')).toHaveCount(2);
  await expect(caja2).toContainText('Por vincular (de otro proyecto o usuario): no se usa sola.');
  await elegirProveedor(page, 'Proveedor Gestión');
  await ver(page, 'Todas');
  await expect(novedad(page, 1)).toContainText('Un respaldo de otro proyecto o usuario la relacionaba con «NIKE · WINFLO P23 · NEGRO»');
  await expect(novedad(page, 1)).toContainText('Sin destino todavía');
  const m = await memoria(page);
  expect(m.asociaciones.filter((a) => a.ambito.endsWith(otro.id)).every((a) => a.dato.producto === null && a.dato.variante === null)).toBe(true);
  await caja2.locator('.importador-nov-relacion').filter({ hasText: 'WINFLO' }).getByRole('button', { name: /^Vincular/ }).click();
  await caja2.locator('#imp-memoria-corregir-buscar').fill('WINFLO P23');
  await caja2.getByRole('button', { name: cod('WINFLO P23|NEGRO') }).click();
  await expect(novedad(page, 1)).toContainText('Fotografía reconocida por la relación que confirmaste.');
  expect(e.guardar).toBe(0);
  expect(propios(problemas)).toEqual([]);
});

test('relación pendiente de una ficha nueva: se recupera con el borrador y solo se escribe al crearse', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await importarEntrega(page, entrega('pendiente', FECHA, [{ foto: 381, lineas: ['REEBOK CLUB P23 DAMA ROSADO', 'EU 36 al 38'], venta: '$119.900', coste: ['$80.000'] }]));
  await elegirProveedor(page, 'Proveedor Pendiente');
  await seccionPdf(page).getByRole('button', { name: 'Añadir al lote (1 ficha)' }).click();
  await expect(ficha(page, 0).getByText('Lista · se subirá al guardar')).toBeVisible({ timeout: 60000 });
  await ficha(page, 0).getByRole('button', { name: 'Confirmar y recordar esta relación' }).click();
  await expect(ficha(page, 0)).toContainText('Relación pendiente');
  await esperarGuardadoLocal(page);
  await recargar(page, problemas, browserName);
  expect((await memoria(page)).asociaciones).toHaveLength(0);
  await abrirImportador(page);
  await importador(page).getByRole('button', { name: /^Continuar el borrador/ }).click();
  await expect(ficha(page, 0)).toContainText('Relación pendiente');
  // La respuesta se pierde: la ficha queda guardada al comprobarla y solo entonces se recuerda.
  const { elegirCategoria } = await import('./ayudas23.js');
  await elegirCategoria(ficha(page, 0), 'URBANAS');
  await page.route('**/rest/v1/rpc/fn_admin_guardar_producto', async (route) => { await route.fetch(); await route.abort('connectionreset'); });
  await importador(page).getByRole('button', { name: /^Guardar lote como oculto/ }).click();
  await expect(ficha(page, 0)).toContainText('Se recordó 1 fotografía', { timeout: 60000 });
  const m = await memoria(page);
  const p = await producto23('CLUB P23');
  expect([m.asociaciones.length, m.asociaciones[0].dato.producto, m.asociaciones[0].dato.variante]).toEqual([1, p.id, p.variantes[0].id]);
  expect([m.historial.length, m.historial[0].dato.aplicado[0].operacion]).toEqual([1, p.ultima_operacion]);
});

test('base anterior (versión 1) y respaldo anterior: se abren sin perder nada', async ({ page }) => {
  const problemas = await entrarAlPanel(page, admin);
  // La base tal como la dejaba la etapa 22, con un perfil.
  await page.evaluate(() => new Promise((ok, mal) => {
    const b = indexedDB.deleteDatabase('gama-talla-panel');
    b.onerror = () => mal(b.error);
    b.onsuccess = () => {
      const r = indexedDB.open('gama-talla-panel', 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        db.createObjectStore('perfiles', { keyPath: 'clave' }).createIndex('ambito', 'ambito');
        db.createObjectStore('borradores', { keyPath: 'clave' }).createIndex('ambito', 'ambito');
        db.createObjectStore('fotos', { keyPath: 'clave' }).createIndex('borrador', 'borrador');
      };
      r.onsuccess = () => {
        const db = r.result;
        const ambito = `${window.GamaTallaPanel.configuracion().url}|${window.GamaTallaPanel.usuario().id}`;
        const perfil = { ...window.GamaTallaTextoProveedor.perfilInicial('33333333-3333-4333-8333-333333333333', 'Perfil Anterior'), revision: 2 };
        const tx = db.transaction('perfiles', 'readwrite');
        tx.objectStore('perfiles').put({ clave: `${ambito}|${perfil.id}`, ambito, id: perfil.id, perfil, actualizado: '' });
        tx.oncomplete = () => { db.close(); ok(null); };
      };
    };
  }));
  await abrirImportador(page);
  await expect(importador(page).locator('#imp-perfiles')).toContainText('Perfil Anterior', { useInnerText: false });
  const m = await memoria(page);
  expect([m.version, m.asociaciones.length]).toEqual([2, 0]);
  // Un respaldo de la etapa 22: sin inventario, identidades ni relaciones pendientes.
  await ficha(page, 0).getByLabel(MENSAJE).fill('FILA RETRO P23 DAMA $100.000\nTallas 36 al 38');
  await expect(ficha(page, 0).getByRole('textbox', { name: /^Modelo/ })).toHaveValue('RETRO P23');
  await importador(page).getByRole('button', { name: 'Comparar con mi inventario' }).click();
  await esperarGuardadoLocal(page);
  await importador(page).locator('#importador-ver-borradores').click();
  const borradores = importador(page).locator('#imp-borradores');
  const [descarga] = await Promise.all([page.waitForEvent('download'), borradores.getByRole('button', { name: /^Exportar un respaldo del borrador/ }).click()]);
  const archivo = path.join(PDFS23, 'respaldo-anterior.json');
  await descarga.saveAs(archivo);
  const json = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  expect([json.formato, json.version]).toEqual(['gama-talla/borrador-importador', 1]);
  delete json.borrador.datos.lote.inventario;
  for (const f of json.borrador.datos.lote.fichas) { delete f.memoria; for (const c of f.colores) { delete c.recordar; for (const x of c.fotos) delete x.identidad; } }
  json.borrador.id = '44444444-4444-4444-8444-444444444444';
  fs.writeFileSync(archivo, JSON.stringify(json));
  await borradores.locator('#imp-respaldo-archivo').setInputFiles(archivo);
  await expect(borradores).toContainText('Respaldo importado');
  await borradores.locator('[data-borrador="44444444-4444-4444-8444-444444444444"]').getByRole('button', { name: /^Continuar/ }).click();
  await expect(fichas(page)).toHaveCount(1);
  await expect(ficha(page, 0).getByRole('textbox', { name: /^Modelo/ })).toHaveValue('RETRO P23');
  // Un respaldo con decisiones de OTRO usuario: se conservan los datos, no los destinos ni las operaciones.
  json.borrador.id = '55555555-5555-4555-8555-555555555555';
  json.ambito.usuario = otro.id;
  const clave = json.borrador.datos.lote.fichas[0].colores[0].clave;
  const w = cat.p['WINFLO P23'].id;
  json.borrador.datos.lote.inventario = { abierto: true, proveedor: 'prov:66666666-6666-4666-8666-666666666666', filtro: 'todas', fechas: {}, porRecordar: [],
    entradas: { [clave]: { modo: 'actualizar', producto: w, variante: cat.v['WINFLO P23|NEGRO'].id, confirmada: true } }, operaciones: { [w]: { producto: w, nombre: 'X', estado: 'sin-confirmar', entradas: [], fotos: [], operaciones: [] } } };
  fs.writeFileSync(archivo, JSON.stringify(json));
  await importador(page).locator('#importador-ver-borradores').click();
  await borradores.locator('#imp-respaldo-archivo').setInputFiles(archivo);
  await borradores.getByRole('button', { name: 'Importar como borrador nuevo' }).click();
  await expect(borradores).toContainText('Respaldo importado');
  await borradores.locator('.importador-borrador').filter({ hasNotText: 'es el lote abierto' }).first().getByRole('button', { name: /^Continuar/ }).click();
  await ver(page, 'Todas');
  await expect(novedades(page).locator('.importador-nov-operacion')).toHaveCount(0);
  await expect(novedad(page, 1, 'Ficha')).toContainText('No está: se crea como zapatilla nueva');
  void color; void avisoNov; void entorno;
  expect(propios(problemas)).toEqual([]);
});
