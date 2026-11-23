// @ts-check
/* Etapa 20 · Guardado automático y recuperación de borradores del importador (IndexedDB).
 *
 * SOLO contra el Supabase LOCAL y el entorno aislado (SITIO=http://127.0.0.1:8770). Usuarios, productos y
 * fotos FICTICIOS (modelos « P20»); todo se borra al terminar. Cada prueba usa un contexto de navegador
 * nuevo: su IndexedDB empieza vacío.
 *
 *   SITIO=http://127.0.0.1:8770 npx playwright test tests/etapa20/borradores.spec.js --workers=1
 */
import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  entorno, servicio, crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, ingresar, configurarPanel, revisarDisposicion,
  limpiar20, productos20, prepararFotos20, entrarAlPanel, abrirImportador, importador, ficha, fichas, color, radioPublico, recargar,
  esperarGuardadoLocal, estadoLocal, pegarVarias, capturar, vigilar, MENSAJE, elegirCategoria, campoCategoria
} from './ayudas20.js';

test.describe.configure({ mode: 'serial' });
test.setTimeout(240000);
let admin; let otro; let rutasFotos;
const SALIDA = path.join(os.tmpdir(), 'gama-talla-20-respaldos');

test.beforeAll(async ({}, info) => {
  entorno();
  await limpiar20();
  const sello = `${info.project.name}-${Date.now().toString(36)}`;
  admin = await crearUsuario(`panel20-borr-${sello}@gamaytalla.test`);
  otro = await crearUsuario(`panel20-otro-${sello}@gamaytalla.test`);
  await hacerAdmin(admin.id);
  await hacerAdmin(otro.id);
  rutasFotos = await prepararFotos20(22);
  fs.mkdirSync(SALIDA, { recursive: true });
});
test.afterAll(async () => {
  await limpiar20().catch(() => null);
  for (const u of [admin, otro]) if (u) { await quitarAdmin(u.id).catch(() => null); await borrarUsuario(u.id); }
});
test.afterEach(async () => { await limpiar20(); });

const borradores = (page) => importador(page).locator('#imp-borradores');
const modelo = (f) => f.getByRole('textbox', { name: /^Modelo/ });
const categoria = (f) => campoCategoria(f);
const venta = (c) => c.getByLabel(/^Precio de venta/);
const archivoDe = (c) => c.locator('input[type=file][data-archivos]');
/* Huella de cada foto de un color, en el orden en que se ven (la primera es la principal): tamaño y color
   de un píxel. Cada foto ficticia tiene un tono distinto. (La CSP del panel no deja leer blob: con fetch.) */
const huellas = (c) => c.locator('.editor-foto img').evaluateAll((imgs) => Promise.all(imgs.map(async (img) => {
  await /** @type {HTMLImageElement} */ (img).decode().catch(() => null);
  const lienzo = document.createElement('canvas');
  lienzo.width = /** @type {HTMLImageElement} */ (img).naturalWidth; lienzo.height = /** @type {HTMLImageElement} */ (img).naturalHeight;
  const x = lienzo.getContext('2d');
  x.drawImage(/** @type {HTMLImageElement} */ (img), 0, 0);
  return `${lienzo.width}x${lienzo.height}:${[...x.getImageData(20, 20, 1, 1).data].join(',')}`;
})));
// La misma huella de un archivo de prueba, cargado como data: (lo admite la CSP).
async function sha(ruta) {
  return pagina.evaluate(async (datos) => {
    const img = new Image();
    img.src = `data:image/webp;base64,${datos}`;
    await img.decode().catch(() => null);
    const lienzo = document.createElement('canvas');
    lienzo.width = img.naturalWidth; lienzo.height = img.naturalHeight;
    const x = lienzo.getContext('2d');
    x.drawImage(img, 0, 0);
    return `${lienzo.width}x${lienzo.height}:${[...x.getImageData(20, 20, 1, 1).data].join(',')}`;
  }, fs.readFileSync(ruta).toString('base64'));
}
/** @type {import('@playwright/test').Page} */
let pagina;
test.beforeEach(async ({ page }) => { pagina = page; });
async function continuarPrimero(page) {
  await expect(borradores(page)).toBeVisible();
  await borradores(page).getByRole('button', { name: /^Continuar el borrador/ }).first().click();
  await expect(borradores(page)).toHaveCount(0);
}
// Lee el IndexedDB del panel desde la página (solo para comprobar lo que se guardó).
const leerIdb = (page) => page.evaluate(() => new Promise((resolver, rechazar) => {
  const p = indexedDB.open('gama-talla-panel');
  p.onerror = () => rechazar(p.error);
  p.onsuccess = () => {
    const db = p.result;
    const tx = db.transaction(['borradores', 'fotos', 'perfiles'], 'readonly');
    const salida = {};
    let pendientes = 3;
    for (const nombre of ['borradores', 'fotos', 'perfiles']) {
      const r = tx.objectStore(nombre).getAll();
      r.onsuccess = () => {
        salida[nombre] = r.result.map((x) => ({ ...x, bytes: x.bytes ? x.bytes.byteLength : undefined }));
        pendientes -= 1;
        if (!pendientes) { db.close(); resolver(salida); }
      };
    }
  };
}));

test('recuperación tras recargar: fichas, colores agrupados, fotos (orden y principal), forma, ajustes y correcciones a mano', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  const s = await pegarVarias(page, [
    'New Balance 9060 P20 Hombre $300.000 40 al 44\nColor: GRIS',
    'New Balance 9060 P20 Hombre $300.000 40 al 42\nColor: NEGRO',
    'Puma Suede P20 Dama $90.000 36 al 39\nColor: ROJO'].join('\n\n'));
  await s.getByRole('button', { name: 'Crear 3 publicaciones' }).click();
  await ficha(page, 1).getByRole('button', { name: 'Agrupar como color de la ficha 1' }).click();
  await expect(fichas(page)).toHaveCount(2);
  const f1 = ficha(page, 0);
  const gris = color(f1, 0);
  await archivoDe(gris).setInputFiles([rutasFotos[0], rutasFotos[1]]);
  await expect(gris.locator('.editor-foto.es-lista')).toHaveCount(2, { timeout: 30000 });
  await gris.getByRole('button', { name: 'Hacer principal la foto 2' }).click();
  await gris.getByRole('radio', { name: 'Foto de la zapatilla' }).check();
  await modelo(f1).fill('9060 PRO P20');
  // Ajustes solo para la ficha 1.
  await importador(page).locator('#imp-ajustes > summary').click();
  await importador(page).getByRole('checkbox', { name: /^Ficha 2 · PUMA/ }).uncheck();
  await elegirCategoria(importador(page).locator('#imp-ajustes'), 'URBANAS');
  await importador(page).locator('#imp-margen').fill('40000');
  await importador(page).getByRole('button', { name: 'Aplicar ajustes a 1 ficha' }).click();
  await expect(venta(gris)).toHaveValue('340000');
  const antes = await huellas(gris);
  expect(antes).toEqual([await sha(rutasFotos[1]), await sha(rutasFotos[0])]);
  await esperarGuardadoLocal(page);
  await capturar(page, problemas, browserName, `borrador-antes-${browserName}-1280.png`);

  await recargar(page, problemas, browserName);
  await abrirImportador(page);
  await expect(borradores(page).locator('.importador-borrador')).toHaveCount(1);
  await expect(borradores(page).locator('.importador-borrador')).toContainText('Perfil general · 3 publicaciones');
  await expect(borradores(page).locator('.importador-borrador')).toContainText('Nada guardado en Supabase · Pendiente: 2 fichas sin guardar, ajustes del lote');
  await capturar(page, problemas, browserName, `borradores-lista-${browserName}-1280.png`);
  await continuarPrimero(page);
  await expect(estadoLocal(page)).toContainText('Guardado en este navegador');
  await expect(fichas(page)).toHaveCount(2);
  const r1 = ficha(page, 0);
  await expect(r1.locator('h3').first()).toHaveText('Ficha 1 · NEW BALANCE 9060 PRO P20 · Hombre');
  await expect(r1.locator('.importador-color')).toHaveCount(2);
  await expect(color(r1, 0).getByRole('textbox', { name: /^Color/ })).toHaveValue('GRIS');
  await expect(color(r1, 1).getByRole('textbox', { name: /^Color/ })).toHaveValue('NEGRO');
  await expect(categoria(r1)).toHaveValue('URBANAS');
  await expect(venta(color(r1, 0))).toHaveValue('340000');
  await expect(venta(color(r1, 1))).toHaveValue('340000');
  await expect(color(r1, 0).getByRole('radio', { name: 'Foto de la zapatilla' })).toBeChecked();
  expect(await huellas(color(r1, 0))).toEqual(antes);
  await expect(color(r1, 0).locator('.editor-foto').first().locator('.editor-foto-principal')).toHaveText('Principal');
  await expect(categoria(ficha(page, 1))).toHaveValue('');
  await expect(venta(color(ficha(page, 1), 0))).toHaveValue('');
  // El bloque de ajustes vuelve como estaba (abierto).
  await expect(importador(page).locator('#imp-ajustes')).toHaveAttribute('open', '');
  await expect(importador(page).getByRole('checkbox', { name: /^Ficha 2 · PUMA/ })).not.toBeChecked();
  await expect(importador(page).getByRole('checkbox', { name: /^Ficha 1 · NEW BALANCE/ })).toBeChecked();
  // Lo escrito a mano sigue siendo «a mano»: releer el mensaje no lo cambia.
  await color(r1, 0).getByLabel(MENSAJE).fill('New Balance 9060 P20 Hombre $310.000 40 al 44\nColor: GRIS');
  await expect(color(r1, 0).getByLabel(/^Precio del proveedor/)).toHaveValue('310000');
  await expect(modelo(r1)).toHaveValue('9060 PRO P20');
  await expect(venta(color(r1, 0))).toHaveValue('350000');
  expect(problemas).toEqual([]);
});

test('recuperación mientras se optimiza una foto: el original se conserva y se procesa al volver', async ({ page, browserName }) => {
  await page.addInitScript(() => {
    const original = window.createImageBitmap;
    window.createImageBitmap = function (...a) {
      if (sessionStorage.getItem('colgar-fotos') === '1') return new Promise(() => {});
      return original.apply(this, a);
    };
  });
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  const f = ficha(page, 0);
  await color(f, 0).getByLabel(MENSAJE).fill('Adidas Samba P20 Hombre $180.000 40 al 42\nColor: BLANCO');
  await page.evaluate(() => sessionStorage.setItem('colgar-fotos', '1'));
  await archivoDe(color(f, 0)).setInputFiles([rutasFotos[2]]);
  await expect(color(f, 0).locator('.editor-foto.es-procesando')).toHaveCount(1);
  await expect(color(f, 0).locator('.editor-foto-estado')).toHaveText('Optimizando…');
  await esperarGuardadoLocal(page);
  const guardado = await leerIdb(page);
  expect(guardado.fotos.map((x) => x.clase)).toEqual(['original']);
  await page.evaluate(() => sessionStorage.removeItem('colgar-fotos'));
  await recargar(page, problemas, browserName);
  await abrirImportador(page);
  await continuarPrimero(page);
  const c = color(ficha(page, 0), 0);
  await expect(c.locator('.editor-foto.es-lista')).toHaveCount(1, { timeout: 30000 });
  expect(await huellas(c)).toEqual([await sha(rutasFotos[2])]);
  await esperarGuardadoLocal(page);
  await expect.poll(async () => (await leerIdb(page)).fotos.map((x) => x.clase)).toEqual(['final']);
  expect(problemas).toEqual([]);
});

test('sin espacio en el navegador: error visible, el trabajo abierto se conserva, se puede exportar y se recupera al haber sitio', async ({ page, browserName }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...a) {
      if (window.__sinEspacio && this.name === 'fotos') throw new DOMException('Cuota agotada (simulada)', 'QuotaExceededError');
      return put.apply(this, a);
    };
  });
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  const f = ficha(page, 0);
  const c = color(f, 0);
  await c.getByLabel(MENSAJE).fill('Adidas Gazelle P20 Hombre $150.000 40 al 42\nColor: AZUL');
  await esperarGuardadoLocal(page);
  await page.evaluate(() => { window.__sinEspacio = true; });
  await archivoDe(c).setInputFiles([rutasFotos[3]]);
  await expect(c.locator('.editor-foto.es-lista')).toHaveCount(1, { timeout: 30000 });
  await expect(estadoLocal(page)).toContainText('No se pudo guardar en este navegador: falta espacio. Tu trabajo sigue abierto aquí');
  await expect(estadoLocal(page)).toHaveAttribute('role', 'alert');
  await capturar(page, problemas, browserName, `sin-espacio-${browserName}-1280.png`);
  // Nada a medias: el borrador guardado sigue siendo el anterior (sin la foto) y el trabajo abierto, completo.
  const idb = await leerIdb(page);
  expect(idb.fotos).toEqual([]);
  expect(JSON.parse(idb.borradores[0].datos).lote.fichas[0].colores[0].fotos).toEqual([]);
  await expect(modelo(f)).toHaveValue('GAZELLE P20');
  // Exportar el respaldo desde lo abierto (incluye la foto).
  const [descarga] = await Promise.all([page.waitForEvent('download'), importador(page).locator('#importador-local').getByRole('button', { name: 'Exportar respaldo' }).click()]);
  const archivo = path.join(SALIDA, `sin-espacio-${browserName}.json`);
  await descarga.saveAs(archivo);
  const respaldo = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  expect(respaldo.fotos).toHaveLength(1);
  expect(respaldo.borrador.datos.lote.fichas[0].colores[0].fotos).toHaveLength(1);
  // Vuelve a haber sitio: el siguiente cambio guarda todo.
  await page.evaluate(() => { window.__sinEspacio = false; });
  await modelo(f).fill('GAZELLE INDOOR P20');
  await esperarGuardadoLocal(page);
  expect((await leerIdb(page)).fotos.map((x) => x.clase)).toEqual(['final']);
  expect(problemas).toEqual([]);
});

test('cerrar sesión conserva el borrador; solo lo ve el mismo usuario y proyecto', async ({ page }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await color(ficha(page, 0), 0).getByLabel(MENSAJE).fill('Reebok Club C P20 Hombre $80.000 40 al 42\nColor: BLANCO');
  await esperarGuardadoLocal(page);
  await importador(page).getByRole('button', { name: 'Cerrar el importador' }).click();
  await importador(page).getByRole('button', { name: 'Cerrar y conservar el lote' }).click();
  // Un borrador de OTRO proyecto con el mismo usuario (escrito directamente): nunca se lista.
  await page.evaluate(async ([id, nuevo]) => {
    await window.GamaTallaBorradores.guardarBorrador(`http://otro-proyecto.invalid|${id}`, { id: nuevo, creado: new Date().toISOString(), proveedor: 'Otro proyecto', publicaciones: 9, fichas: 9, guardadas: 0, pendientes: 9, datos: '{}' }, { pestana: 'x' });
  }, [admin.id, crypto.randomUUID()]);
  await page.getByRole('button', { name: 'Cerrar sesión' }).first().click();
  await expect(page.getByLabel('Correo')).toBeVisible();
  // Otro administrador en el mismo navegador: no ve el borrador.
  await ingresar(page, otro);
  await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
  await abrirImportador(page);
  await expect(color(ficha(page, 0), 0).getByLabel(MENSAJE)).toHaveValue('');
  await importador(page).getByRole('button', { name: /^Borradores/ }).click();
  await expect(borradores(page).locator('.importador-borrador')).toHaveCount(0);
  await expect(borradores(page)).toContainText('No hay borradores guardados en este navegador.');
  await importador(page).getByRole('button', { name: 'Cerrar el importador' }).click();
  await page.getByRole('button', { name: 'Cerrar sesión' }).first().click();
  // El mismo usuario: lo recupera tal cual; el del otro proyecto no aparece.
  await ingresar(page, admin);
  await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
  await abrirImportador(page);
  await expect(borradores(page)).toBeVisible();
  await expect(borradores(page).locator('.importador-borrador')).toHaveCount(1);
  await expect(borradores(page)).not.toContainText('Otro proyecto');
  await continuarPrimero(page);
  await expect(color(ficha(page, 0), 0).getByLabel(MENSAJE)).toHaveValue('Reebok Club C P20 Hombre $80.000 40 al 42\nColor: BLANCO');
  // En el almacenamiento no hay contraseñas, tokens ni claves.
  const crudo = JSON.stringify(await leerIdb(page));
  expect(crudo).not.toMatch(/access_token|refresh_token|sb_publishable|sb_secret|eyJhbGci|password|contrase/i);
  expect(crudo).not.toContain(admin.clave);
  expect(problemas).toEqual([]);
});

test('dos pestañas: no se sobrescriben; la otra se detiene y se puede continuar desde cualquiera', async ({ page, context, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  const f = ficha(page, 0);
  await color(f, 0).getByLabel(MENSAJE).fill('Vans Old Skool P20 Hombre $120.000 40 al 42\nColor: NEGRO');
  await esperarGuardadoLocal(page);
  const b = await context.newPage();
  const problemasB = vigilar(b);
  await configurarPanel(b);
  await b.goto(`${process.env.SITIO || 'http://127.0.0.1:8770'}/admin/`);
  await expect(b.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
  await expect(b.locator('#tablero')).not.toHaveAttribute('aria-busy', 'true');
  await abrirImportador(b);
  await continuarPrimero(b);
  // A se detiene (no mezcla) y lo dice.
  await expect(importador(page).locator('#imp-desconectado')).toContainText('Este borrador continúa en otra pestaña');
  // A guardó sus últimos cambios antes del traspaso: solo entonces se dice.
  await expect(importador(page).locator('#imp-desconectado')).toContainText('Sus últimos cambios se guardaron antes del traspaso.');
  await expect(estadoLocal(page)).toContainText('Este borrador continúa en otra pestaña.');
  await expect(importador(page).locator('#importador-guardar')).toBeHidden();
  await capturar(page, problemas, browserName, `otra-pestana-${browserName}-1280.png`);
  await modelo(ficha(b, 0)).fill('OLD SKOOL B P20');
  await esperarGuardadoLocal(b);
  // A continúa con la última versión guardada (la de B); B se detiene.
  await importador(page).getByRole('button', { name: 'Continuar aquí' }).click();
  await expect(modelo(ficha(page, 0))).toHaveValue('OLD SKOOL B P20');
  await expect(importador(b).locator('#imp-desconectado')).toBeVisible();
  await modelo(ficha(page, 0)).fill('OLD SKOOL A P20');
  await esperarGuardadoLocal(page);
  const idb = await leerIdb(page);
  expect(idb.borradores).toHaveLength(1);
  expect(JSON.parse(idb.borradores[0].datos).lote.fichas[0].modelo).toBe('OLD SKOOL A P20');
  expect([...problemas, ...problemasB]).toEqual([]);
  await b.close();
});

test('respaldo con fotos: exportar, importar, mismo identificador, otro usuario y archivo no válido', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  const f = ficha(page, 0);
  await color(f, 0).getByLabel(MENSAJE).fill('Asics Gel Kayano P20 Hombre $250.000 40 al 42\nColor: GRIS');
  await archivoDe(color(f, 0)).setInputFiles([rutasFotos[4], rutasFotos[5]]);
  await expect(color(f, 0).locator('.editor-foto.es-lista')).toHaveCount(2, { timeout: 30000 });
  await esperarGuardadoLocal(page);
  await importador(page).getByRole('button', { name: /^Borradores/ }).click();
  const [descarga] = await Promise.all([page.waitForEvent('download'), borradores(page).getByRole('button', { name: /^Exportar un respaldo del borrador/ }).click()]);
  expect(descarga.suggestedFilename()).toMatch(/^borrador-importador-perfil-general-\d{8}-\d{4}\.json$/);
  const archivo = path.join(SALIDA, `respaldo-${browserName}.json`);
  await descarga.saveAs(archivo);
  const contenido = fs.readFileSync(archivo, 'utf8');
  const respaldo = JSON.parse(contenido);
  expect(respaldo).toMatchObject({ formato: 'gama-talla/borrador-importador', version: 1, ambito: { usuario: admin.id } });
  expect(respaldo.fotos).toHaveLength(2);
  expect(contenido).not.toMatch(/access_token|refresh_token|sb_publishable|eyJhbGci/);

  // Empezar otro lote (el anterior se conserva) y eliminar el anterior de este navegador.
  await borradores(page).getByRole('button', { name: 'Empezar otro lote' }).click();
  await importador(page).getByRole('button', { name: /^Borradores/ }).click();
  await borradores(page).getByRole('button', { name: /^Eliminar el borrador/ }).click();
  await expect(borradores(page).locator('.importador-confirmar')).toContainText('no se borra ningún archivo de Storage');
  await borradores(page).getByRole('button', { name: 'Eliminar el borrador', exact: true }).click();
  await expect(borradores(page).locator('.importador-borrador')).toHaveCount(0);

  // Un archivo que no es un respaldo: no se importa nada.
  const invalido = path.join(SALIDA, `invalido-${browserName}.json`);
  fs.writeFileSync(invalido, JSON.stringify({ hola: 'mundo' }));
  await borradores(page).locator('#imp-respaldo-archivo').setInputFiles(invalido);
  await expect(borradores(page).locator('#imp-borradores-aviso')).toHaveText('No se importó nada: No es un respaldo del importador de Gama & Talla.. Tus borradores siguen como estaban.');
  // Un respaldo con una foto dañada: tampoco.
  const danado = path.join(SALIDA, `danado-${browserName}.json`);
  fs.writeFileSync(danado, JSON.stringify({ ...respaldo, fotos: [{ ...respaldo.fotos[0], base64: Buffer.from('no es una imagen').toString('base64') }] }));
  await borradores(page).locator('#imp-respaldo-archivo').setInputFiles(danado);
  await expect(borradores(page).locator('#imp-borradores-aviso')).toContainText('No se importó nada: La foto 1 del respaldo no es una imagen admitida.');
  await expect(borradores(page).locator('.importador-borrador')).toHaveCount(0);

  // El respaldo válido.
  await borradores(page).locator('#imp-respaldo-archivo').setInputFiles(archivo);
  await expect(borradores(page).locator('#imp-borradores-aviso')).toContainText('Respaldo importado: «Perfil general», 1 publicación.');
  await expect(borradores(page).locator('.importador-borrador')).toHaveCount(1);
  // El mismo otra vez: no se sobrescribe sin preguntar.
  await borradores(page).locator('#imp-respaldo-archivo').setInputFiles(archivo);
  await expect(borradores(page).locator('#imp-importacion')).toContainText('Ya hay en este navegador un borrador con el mismo identificador');
  await borradores(page).locator('#imp-importacion').getByRole('button', { name: 'Cancelar' }).click();
  await expect(borradores(page).locator('.importador-borrador')).toHaveCount(1);
  // De otro usuario: solo como borrador nuevo, sin sus guardados.
  const deOtro = path.join(SALIDA, `otro-usuario-${browserName}.json`);
  fs.writeFileSync(deOtro, JSON.stringify({ ...respaldo, ambito: { ...respaldo.ambito, usuario: crypto.randomUUID() } }));
  await borradores(page).locator('#imp-respaldo-archivo').setInputFiles(deOtro);
  await expect(borradores(page).locator('#imp-importacion')).toContainText('es de otro proyecto de Supabase o de otro usuario');
  await borradores(page).getByRole('button', { name: 'Importar como borrador nuevo' }).click();
  await expect(borradores(page).locator('.importador-borrador')).toHaveCount(2);
  const ids = await borradores(page).locator('.importador-borrador').evaluateAll((ns) => ns.map((n) => /** @type {HTMLElement} */ (n).dataset.borrador));
  expect(new Set(ids).size).toBe(2);
  expect(ids).toContain(respaldo.borrador.id);
  // Continuar el importado: textos y fotos intactos.
  await borradores(page).locator(`[data-borrador="${respaldo.borrador.id}"]`).getByRole('button', { name: /^Continuar/ }).click();
  await expect(color(ficha(page, 0), 0).getByLabel(MENSAJE)).toHaveValue('Asics Gel Kayano P20 Hombre $250.000 40 al 42\nColor: GRIS');
  expect(await huellas(color(ficha(page, 0), 0))).toEqual([await sha(rutasFotos[4]), await sha(rutasFotos[5])]);
  await page.setViewportSize({ width: 390, height: 844 });
  await importador(page).getByRole('button', { name: /^Borradores/ }).click();
  const d = await revisarDisposicion(page);
  expect(d.desborde).toBe(0);
  expect(d.pequenos.filter((x) => !x.startsWith('input#'))).toEqual([]);
  await capturar(page, problemas, browserName, `borradores-lista-${browserName}-390.png`);
  expect(problemas).toEqual([]);
});

test('guardado parcial y respuesta perdida: tras recargar no se reenvía lo guardado ni se duplica nada', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  const s = await pegarVarias(page, ['Fila Disruptor P20 Dama $150.000 36 al 39\nColor: BLANCO', 'Converse Chuck P20 Hombre $130.000 40 al 42\nColor: NEGRO'].join('\n\n'));
  await s.getByRole('button', { name: 'Crear 2 publicaciones' }).click();
  for (const i of [0, 1]) {
    await elegirCategoria(ficha(page, i), 'URBANAS');
    await venta(color(ficha(page, i), 0)).fill('200000');
  }
  // La 2.ª escritura llega al servidor pero su respuesta se pierde; la comprobación tampoco responde.
  let llamadas = 0;
  await page.route('**/rest/v1/rpc/fn_admin_guardar_producto', async (route) => {
    llamadas += 1;
    if (llamadas === 2) { await route.fetch(); await route.abort('connectionreset'); return; }
    await route.continue();
  });
  await page.route(/\/rest\/v1\/productos\?select=id%2Ccodigo_interno%2Cultima_operacion/, (route) => route.abort('connectionreset'));
  await importador(page).getByRole('button', { name: 'Guardar lote como oculto (2)' }).click();
  await expect(ficha(page, 0).locator('.importador-estado')).toContainText(/Guardada oculta · GT-/, { timeout: 30000 });
  await expect(ficha(page, 1).locator('.importador-estado')).toContainText('Se perdió la respuesta', { timeout: 30000 });
  await esperarGuardadoLocal(page);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  filtrarPeticiones(problemas);
  expect((await productos20()).map((p) => p.nombre).sort()).toEqual(['CHUCK P20', 'DISRUPTOR P20']);

  await recargar(page, problemas, browserName);
  let despues = 0;
  page.on('request', (r) => { if (r.url().includes('fn_admin_guardar_producto')) despues += 1; });
  await abrirImportador(page);
  await expect(borradores(page).locator('.importador-borrador')).toContainText('1 guardada en Supabase · Pendiente: 1 ficha sin guardar');
  await continuarPrimero(page);
  await expect(ficha(page, 0).locator('.importador-estado')).toContainText(/Guardada oculta · GT-/);
  await expect(ficha(page, 1).locator('.importador-estado')).toContainText('Se perdió la respuesta');
  await importador(page).getByRole('button', { name: 'Guardar lote como oculto (1)' }).click();
  await expect(ficha(page, 1).locator('.importador-estado')).toContainText('Guardada oculta · GT-', { timeout: 30000 });
  await expect(ficha(page, 1).locator('.importador-estado')).toContainText('comprobado con el identificador de esta operación');
  expect(despues, 'no se volvió a enviar ninguna ficha: solo se comprobó').toBe(0);
  const lista = await productos20();
  expect(lista.map((p) => p.nombre).sort()).toEqual(['CHUCK P20', 'DISRUPTOR P20']);
  expect(lista.every((p) => p.activo === false && p.variantes.every((v) => v.tallas.every((t) => t.estado === 'REVISAR')))).toBe(true);
  filtrarPeticiones(problemas);
  expect(problemas).toEqual([]);
});

test('recarga en mitad del guardado: la ficha vuelve «sin confirmar» con su operación y se guarda una sola vez', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  const f = ficha(page, 0);
  await color(f, 0).getByLabel(MENSAJE).fill('Diadora Heritage P20 Hombre $160.000 40 al 42\nColor: VERDE');
  await expect(modelo(f)).toHaveValue('HERITAGE P20');
  await elegirCategoria(f, 'URBANAS');
  await venta(color(f, 0)).fill('210000');
  // La escritura nunca llega al servidor: se retiene, se corta y se recarga mientras esperaba.
  /** @type {import('@playwright/test').Route | null} */
  let retenida = null;
  await page.route('**/rest/v1/rpc/fn_admin_guardar_producto', (route) => { retenida = route; });
  await importador(page).getByRole('button', { name: 'Guardar lote como oculto (1)' }).click();
  await expect(f.locator('.importador-estado')).toContainText('Guardando…');
  await expect.poll(async () => JSON.parse((await leerIdb(page)).borradores[0]?.datos || '{}').lote?.fichas?.[0]?.pendiente?.operacion || null).not.toBeNull();
  const operacion = JSON.parse((await leerIdb(page)).borradores[0].datos).lote.fichas[0].pendiente.operacion;
  await expect.poll(() => Boolean(retenida)).toBe(true);
  // Se recarga con la petición retenida, se corta (nunca llega al servidor) y se retira la intercepción.
  await recargar(page, problemas, browserName);
  await retenida.abort('connectionreset').catch(() => null);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await abrirImportador(page);
  await continuarPrimero(page);
  await expect(ficha(page, 0).locator('.importador-estado')).toContainText('El guardado se interrumpió');
  // Solo los de esta prueba (una escritura tardía de otra prueba no debe confundir el recuento).
  const heritage = async () => (await productos20()).filter((p) => p.nombre === 'HERITAGE P20');
  expect(await heritage()).toEqual([]);
  await importador(page).getByRole('button', { name: 'Guardar lote como oculto (1)' }).click();
  await expect(ficha(page, 0).locator('.importador-estado')).toContainText('Guardada oculta · GT-', { timeout: 30000 });
  const lista = await heritage();
  expect(lista).toHaveLength(1);
  expect(lista[0].ultima_operacion).toBe(operacion);
  expect(problemas).toEqual([]);
});

test('reintento rechazado porque la escritura perdida sí llegó: se reconcilia con la operación de la ficha, sin duplicar', async ({ page }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  const f = ficha(page, 0);
  await color(f, 0).getByLabel(MENSAJE).fill('Lotto Tokyo P20 Hombre $140.000 40 al 42\nColor: AZUL');
  await expect(modelo(f)).toHaveValue('TOKYO P20');
  await elegirCategoria(f, 'URBANAS');
  await venta(color(f, 0)).fill('190000');
  // 1.ª escritura: llega al servidor, la respuesta se pierde. 2.ª: el servidor la rechaza como alta repetida
  // (lo que ocurre cuando el reintento coincide con la escritura original).
  let llamadas = 0;
  await page.route('**/rest/v1/rpc/fn_admin_guardar_producto', async (route) => {
    llamadas += 1;
    if (llamadas === 1) { await route.fetch(); await route.abort('connectionreset'); return; }
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'PT422', message: 'El código «(automático)» ya lo usa otra zapatilla. Elige otro.', details: null, hint: null }) });
  });
  // Las comprobaciones (solo lectura) no responden hasta que llega el segundo envío (supabase-js reintenta las lecturas).
  await page.route(/\/rest\/v1\/productos\?select=id%2Ccodigo_interno%2Cultima_operacion/, (route) => (llamadas < 2 ? route.abort('connectionreset') : route.continue()));
  await importador(page).getByRole('button', { name: 'Guardar lote como oculto (1)' }).click();
  await expect(f.locator('.importador-estado')).toContainText('Se perdió la respuesta', { timeout: 30000 });
  await importador(page).getByRole('button', { name: 'Guardar lote como oculto (1)' }).click();
  await expect(f.locator('.importador-estado')).toContainText('Guardada oculta · GT-', { timeout: 30000 });
  await expect(f.locator('.importador-estado')).toContainText('comprobado con el identificador de esta operación');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  filtrarPeticiones(problemas);
  expect(llamadas).toBe(2);
  expect(await productos20()).toHaveLength(1);
  filtrarPeticiones(problemas);
  expect(problemas).toEqual([]);
});

test('lote grande: 30 publicaciones y 20 imágenes sin bloqueos; las fotos no se reescriben al teclear', async ({ page, browserName }) => {
  await page.addInitScript(() => {
    window.__escrituras = { fotos: 0, borradores: 0 };
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...a) { if (this.name in window.__escrituras) window.__escrituras[this.name] += 1; return put.apply(this, a); };
  });
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  const marcas = ['Nike', 'Adidas', 'Puma', 'Reebok', 'New Balance'];
  const mensajes = Array.from({ length: 30 }, (_, i) => `🔥${marcas[i % 5]} Modelo${i + 1} P20🔥\n${i % 2 ? 'Dama' : 'Hombre'} $${100 + i}.000\n40 al 42 Euro ✅\nColor: TONO${i + 1}\n\nPedidos al ${'+57 3000000000'}`);
  const s = await pegarVarias(page, mensajes.join('\n\n'));
  await expect(s.locator('#imp-pegado-resumen')).toHaveText('30 publicaciones detectadas · se crearán 30 fichas con 30 colores.');
  const inicio = Date.now();
  await s.getByRole('button', { name: 'Crear 30 publicaciones' }).click();
  await expect(fichas(page)).toHaveCount(30);
  const msCrear = Date.now() - inicio;
  expect(msCrear, `crear 30 publicaciones tardó ${msCrear} ms`).toBeLessThan(8000);
  await expect(modelo(ficha(page, 29))).toHaveValue('MODELO30 P20');
  // 20 imágenes por lote, de una vez.
  const [selector] = await Promise.all([page.waitForEvent('filechooser'), importador(page).getByRole('button', { name: 'Asignar fotos por lote' }).click()]);
  await selector.setFiles(rutasFotos.slice(0, 20));
  await expect(importador(page).locator('.importador-reparto-item.es-lista')).toHaveCount(20, { timeout: 120000 });
  await importador(page).getByRole('button', { name: 'Asignar fotos' }).click();
  await expect(importador(page).locator('.importador-color .editor-foto.es-lista')).toHaveCount(20);
  await esperarGuardadoLocal(page);
  const tras = await page.evaluate(() => ({ ...window.__escrituras }));
  // Teclear en un campo: el borrador se guarda (pocas veces), las fotos no se vuelven a escribir.
  const campo = modelo(ficha(page, 3));
  await campo.click();
  await campo.press('End');
  await campo.pressSequentially(' EDITADO', { delay: 40 });
  await esperarGuardadoLocal(page);
  const final = await page.evaluate(() => ({ ...window.__escrituras }));
  expect(final.fotos - tras.fotos, 'ninguna foto se reescribe al teclear').toBe(0);
  expect(final.borradores - tras.borradores).toBeLessThanOrEqual(3);
  const idb = await leerIdb(page);
  expect(idb.fotos).toHaveLength(20);
  // La ventana sigue respondiendo: un clic en un control tarda poco en verse.
  const t0 = Date.now();
  await ficha(page, 29).getByRole('checkbox', { name: 'Incluir en el guardado' }).click();
  await expect(importador(page).locator('#importador-guardar')).toHaveText('Guardar lote como oculto (29)');
  expect(Date.now() - t0).toBeLessThan(3000);
  await capturar(page, problemas, browserName, `lote-30-${browserName}-1280.png`);
  expect(problemas).toEqual([]);
});

// ======================================================================== etapa 20 · correcciones
// Simula que el navegador se queda sin espacio para CUALQUIER escritura del borrador (window.__lleno).
const SIN_ESPACIO_TOTAL = () => {
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...a) {
    if (window.__lleno && (this.name === 'borradores' || this.name === 'fotos')) throw new DOMException('Cuota agotada (simulada)', 'QuotaExceededError');
    return put.apply(this, a);
  };
};

test('si el guardado local falla, el lote abierto no se suelta al empezar otro ni al continuar otro borrador', async ({ page }) => {
  await page.addInitScript(SIN_ESPACIO_TOTAL);
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await color(ficha(page, 0), 0).getByLabel(MENSAJE).fill('Adidas Superstar P20 Hombre $170.000 40 al 42\nColor: BLANCO');
  await esperarGuardadoLocal(page);
  await importador(page).getByRole('button', { name: /^Borradores/ }).click();
  await borradores(page).getByRole('button', { name: 'Empezar otro lote' }).click();
  await color(ficha(page, 0), 0).getByLabel(MENSAJE).fill('Puma Palermo P20 Hombre $160.000 40 al 42\nColor: VERDE');
  await esperarGuardadoLocal(page);
  // Sin espacio: el último cambio no se puede guardar.
  await page.evaluate(() => { window.__lleno = true; });
  await modelo(ficha(page, 0)).fill('PALERMO OG P20');
  await expect(estadoLocal(page)).toContainText('No se pudo guardar en este navegador: falta espacio');
  // Continuar el otro borrador: no se suelta el abierto (perdería el cambio).
  await importador(page).getByRole('button', { name: /^Borradores/ }).click();
  await borradores(page).getByRole('button', { name: /^Continuar el borrador/ }).click();
  await expect(importador(page).locator('#importador-resultado')).toContainText('No se pudo guardar el lote abierto en este navegador, así que sigue abierto');
  await expect(modelo(ficha(page, 0))).toHaveValue('PALERMO OG P20');
  // Empezar otro: tampoco.
  await importador(page).getByRole('button', { name: /^Borradores/ }).click();
  await borradores(page).getByRole('button', { name: 'Empezar otro lote' }).click();
  await expect(importador(page).locator('#importador-resultado')).toContainText('sigue abierto');
  await expect(modelo(ficha(page, 0))).toHaveValue('PALERMO OG P20');
  // Con espacio otra vez: se guarda y ya se puede cambiar de lote sin perder nada.
  await page.evaluate(() => { window.__lleno = false; });
  await importador(page).getByRole('button', { name: /^Borradores/ }).click();
  await borradores(page).getByRole('button', { name: /^Continuar el borrador/ }).click();
  await expect(modelo(ficha(page, 0))).toHaveValue('SUPERSTAR P20');
  const idb = await leerIdb(page);
  expect(idb.borradores.map((r) => JSON.parse(r.datos).lote.fichas[0].modelo).sort()).toEqual(['PALERMO OG P20', 'SUPERSTAR P20']);
  expect(problemas).toEqual([]);
});

test('traspaso entre pestañas sin confirmar lo no guardado: se dice y se ofrece exportarlo', async ({ page, context }) => {
  await context.addInitScript(SIN_ESPACIO_TOTAL);
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await color(ficha(page, 0), 0).getByLabel(MENSAJE).fill('New Balance 550 P20 Hombre $280.000 40 al 42\nColor: BLANCO');
  await esperarGuardadoLocal(page);
  // A tiene un cambio que ya no puede guardar.
  await page.evaluate(() => { window.__lleno = true; });
  await modelo(ficha(page, 0)).fill('550 SIN GUARDAR P20');
  await expect(estadoLocal(page)).toContainText('No se pudo guardar en este navegador');
  const b = await context.newPage();
  const problemasB = vigilar(b);
  await configurarPanel(b);
  await b.goto(`${process.env.SITIO || 'http://127.0.0.1:8770'}/admin/`);
  await expect(b.locator('#tablero')).not.toHaveAttribute('aria-busy', 'true');
  await abrirImportador(b);
  await continuarPrimero(b);
  // B tiene la última versión guardada y avisa de que A no confirmó sus últimos cambios.
  await expect(modelo(ficha(b, 0))).toHaveValue('550 P20');
  await expect(importador(b).locator('#importador-resultado')).toContainText('Esa pestaña no confirmó que sus últimos cambios quedaran guardados');
  // A no afirma que se guardó: lo dice y ofrece exportar lo de esa pestaña (con el cambio no guardado).
  const aviso = importador(page).locator('#imp-desconectado');
  await expect(aviso).toContainText('Los cambios hechos aquí después del último guardado NO están en el borrador');
  await expect(aviso).not.toContainText('se guardaron');
  const [descarga] = await Promise.all([page.waitForEvent('download'), aviso.getByRole('button', { name: 'Exportar lo de esta pestaña' }).click()]);
  const archivo = path.join(SALIDA, `traspaso-${test.info().project.name}.json`);
  await descarga.saveAs(archivo);
  expect(JSON.parse(fs.readFileSync(archivo, 'utf8')).borrador.datos.lote.fichas[0].modelo).toBe('550 SIN GUARDAR P20');
  expect([...problemas, ...problemasB]).toEqual([]);
  await b.close();
});

test('se recupera todo el trabajo: campos a mano sin mensaje ni modelo, y ajustes del lote', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  // Solo marca, categoría y público a mano (sin mensaje ni modelo).
  const f = ficha(page, 0);
  await f.getByRole('combobox', { name: /^Marca/ }).fill('ASICS');
  await elegirCategoria(f, 'RUNNING');
  await radioPublico(f, 'Dama').check();
  await esperarGuardadoLocal(page);
  await recargar(page, problemas, browserName);
  await abrirImportador(page);
  await expect(borradores(page).locator('.importador-borrador')).toContainText('Pendiente: 1 ficha sin guardar');
  await continuarPrimero(page);
  await expect(ficha(page, 0).getByRole('combobox', { name: /^Marca/ })).toHaveValue('ASICS');
  await expect(campoCategoria(ficha(page, 0))).toHaveValue('RUNNING');
  await expect(radioPublico(ficha(page, 0), 'Dama')).toBeChecked();
  // Solo ajustes del lote (sin ninguna ficha con datos): también cuentan.
  await importador(page).getByRole('button', { name: /^Borradores/ }).click();
  await borradores(page).getByRole('button', { name: 'Empezar otro lote' }).click();
  const bloque = importador(page).locator('#imp-ajustes');
  await bloque.locator(':scope > summary').click();
  await bloque.getByLabel('Sumar al precio del proveedor (COP)').fill('35000');
  await esperarGuardadoLocal(page);
  await recargar(page, problemas, browserName);
  await abrirImportador(page);
  await expect(borradores(page).locator('.importador-borrador')).toHaveCount(2);
  await borradores(page).locator('.importador-borrador', { hasText: 'Pendiente: ajustes del lote' }).getByRole('button', { name: /^Continuar/ }).click();
  await expect(importador(page).locator('#imp-margen')).toHaveValue('35000');
  // Cerrar con solo ajustes también pregunta (no se descarta en silencio).
  await importador(page).getByRole('button', { name: 'Cerrar el importador' }).click();
  await expect(importador(page).locator('#importador-salida-texto')).toContainText('ajustes del lote elegidos');
  expect(problemas).toEqual([]);
});

// Avisos de red esperados por las peticiones cortadas a propósito en la prueba de respuesta perdida.
// Solo los de las dos URL cortadas a propósito (la escritura y su comprobación); cualquier otro error sigue contando.
function filtrarPeticiones(problemas) {
  const cortadas = /rpc\/fn_admin_guardar_producto|productos\?select=id%2Ccodigo_interno%2Cultima_operacion/;
  const red = /ERR_CONNECTION_RESET|NetworkError|Load failed|network connection was lost|Failed to fetch|CORS request did not succeed/i;
  for (let i = problemas.length - 1; i >= 0; i -= 1) if (red.test(problemas[i]) && (cortadas.test(problemas[i]) || !/https?:\/\//.test(problemas[i]))) problemas.splice(i, 1);
}
