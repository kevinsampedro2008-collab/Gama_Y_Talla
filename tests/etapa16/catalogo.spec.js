// @ts-check
/* Etapa 16 · Administrar el catálogo desde el panel: productos, colores, precios, tallas y
 * fotografías WebP en Storage; reflejo en la tienda.
 *
 * SOLO contra el stack local desechable de Supabase (con Storage) y la tienda servida en
 * 127.0.0.1:8765. Usuarios, productos y fotos FICTICIOS, creados y borrados por cada navegador.
 * Necesita el catálogo local vacío al empezar.
 *
 *   npx --yes supabase@3.0.0 start -x realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
 *   npx playwright test tests/etapa16 --workers=1
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  PANEL, SITIO, entorno, servicio, crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, configurarPanel, ingresar,
  limpiarRestosDePruebas, MARCA, CAPTURAS, objetosDe, productosDePrueba, tallasDe, limpiarCatalogo16, prepararFotos,
  revisarEditor, borrarObjetos
} from './ayudas-catalogo.js';
import { guardarDatosEnvio } from '../etapa9/ayudas.js';

test.describe.configure({ mode: 'serial' });

const ANCHOS = [360, 390, 768, 1024, 1440];
let admin; let sufijo; let fotos;

test.beforeAll(async ({}, info) => {
  entorno();
  await limpiarRestosDePruebas();
  const restos = await limpiarCatalogo16();
  if (restos) console.log(`Restos de una ejecución interrumpida de la etapa 16 retirados: ${restos} productos.`);
  const total = await servicio('GET', '/rest/v1/productos?select=id');
  expect(total.length, 'el catálogo local debe estar vacío al empezar').toBe(0);
  sufijo = `${info.project.name}-${Date.now().toString(36)}`;
  admin = await crearUsuario(`catalogo-${sufijo}@gamaytalla.test`);
  await hacerAdmin(admin.id);
  fotos = await prepararFotos();
  fs.mkdirSync(CAPTURAS, { recursive: true });
});

test.afterAll(async () => {
  await limpiarCatalogo16().catch(() => null);
  if (admin) { await quitarAdmin(admin.id).catch(() => null); await borrarUsuario(admin.id); }
});

test.afterEach(async () => { await limpiarCatalogo16(); });

// ---------------------------------------------------------------- ayudas
const editor = (page) => page.locator('#editor');
const resultado = (page) => page.locator('#editor-resultado');
const color = (page, n) => editor(page).locator('.editor-variante').nth(n);

async function abrirPanel(page) {
  const problemas = [];
  page.on('pageerror', (e) => problemas.push(`EXCEPCIÓN: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problemas.push(`CONSOLA: ${m.text()}`); });
  await configurarPanel(page);
  await page.goto(PANEL);
  await ingresar(page, admin);
  await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
  await expect(page.locator('#tablero')).not.toHaveAttribute('aria-busy', 'true');
  return problemas;
}

async function rellenarModelo(page, { nombre, marca = MARCA, categoria = 'Running', referencia = '' }) {
  await editor(page).getByRole('textbox', { name: 'Modelo (obligatorio)', exact: true }).fill(nombre);
  await editor(page).getByRole('combobox', { name: 'Marca (obligatorio)', exact: true }).fill(marca);
  await editor(page).getByRole('combobox', { name: 'Categoría (obligatorio)', exact: true }).fill(categoria);
  if (referencia) await editor(page).getByLabel('Referencia del proveedor', { exact: true }).fill(referencia);
}

async function rellenarColor(page, n, { nombre, precio = '', anterior = '', tallas = [] }) {
  const c = color(page, n);
  await c.getByRole('textbox', { name: 'Color (obligatorio)', exact: true }).fill(nombre);
  if (precio !== '') await c.getByLabel('Precio actual (COP)').fill(String(precio));
  if (anterior !== '') await c.getByLabel('Precio anterior (opcional)').fill(String(anterior));
  for (const t of tallas) {
    await c.getByLabel('Añadir talla').fill(t);
    await c.getByLabel('Añadir talla').press('Enter');
  }
}

async function subirFotos(page, n, archivos) {
  await color(page, n).locator('input[type=file][data-archivos]').setInputFiles(archivos);
}

const esperarFotosListas = (page, n, cuantas) =>
  expect(color(page, n).locator('.editor-foto.es-subida, .editor-foto.es-guardada')).toHaveCount(cuantas, { timeout: 30000 });

// Una zapatilla completa, guardada oculta. Devuelve su fila del servidor.
async function crearCompleta(page, nombre, { conFotos = true } = {}) {
  await page.getByRole('button', { name: 'Agregar zapatilla' }).first().click();
  await expect(editor(page)).toBeVisible();
  await rellenarModelo(page, { nombre, referencia: 'REF-16' });
  await rellenarColor(page, 0, { nombre: 'Negro', precio: '289000', anterior: '329000', tallas: ['40', '40,5', '41 1/3'] });
  if (conFotos) {
    await subirFotos(page, 0, [fotos.adecuada]);
    await esperarFotosListas(page, 0, 1);
  }
  await editor(page).getByRole('button', { name: 'Guardar oculta' }).click();
  await expect(resultado(page)).toContainText('Guardado.');
  // Etapa 16.2: el servidor guarda el modelo en mayúsculas.
  const [p] = (await productosDePrueba()).filter((x) => x.nombre === nombre.toUpperCase());
  return p;
}

// La tienda leyendo el stack LOCAL como visitante (configuración inyectada solo en la prueba).
async function abrirTienda(browser, { conCarrito = null, cache = null } = {}) {
  const e = entorno();
  const contexto = await browser.newContext({ locale: 'es-CO' });
  await contexto.route(`${SITIO}/config.js`, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await contexto.addInitScript(([conf, carrito, cacheGuardada]) => {
    window.GAMA_TALLA_CONFIG = conf;
    window.__abiertas = [];
    window.open = (enlace) => { window.__abiertas.push(String(enlace)); return {}; };
    if (carrito && !localStorage.getItem('gama-talla-carrito-v3')) localStorage.setItem('gama-talla-carrito-v3', JSON.stringify(carrito));
    if (cacheGuardada) localStorage.setItem(cacheGuardada.clave, JSON.stringify(cacheGuardada.valor));
  }, [{ supabaseUrl: e.api, clavePublicable: e.publicable }, conCarrito, cache]);
  const pagina = await contexto.newPage();
  const peticiones = [];
  pagina.on('request', (r) => { if (r.url().includes('/rest/v1/catalogo_publico')) peticiones.push(r); });
  await pagina.goto(`${SITIO}/?intro=no`);
  return { contexto, pagina, peticiones };
}

// =====================================================================
test('catálogo vacío: «Agregar zapatilla» visible y la tienda no muestra ejemplos', async ({ page, browser }) => {
  const problemas = await abrirPanel(page);
  await expect(page.locator('#boton-nuevo')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Todavía no hay zapatillas en el catálogo' })).toBeVisible();
  await expect(page.locator('#tablero-aviso').getByRole('button', { name: 'Agregar zapatilla' })).toBeVisible();

  const { contexto, pagina, peticiones } = await abrirTienda(browser);
  await expect(pagina.locator('.estado-catalogo h3')).toHaveText('Aún no hay productos');
  await expect(pagina.locator('article.tarjeta')).toHaveCount(0);
  expect(peticiones.length, 'una sola página basta para un catálogo vacío').toBe(1);
  const cabeceras = peticiones[0].headers();
  expect(cabeceras.apikey, 'la clave publicable va en apikey').toBe(entorno().publicable);
  expect(cabeceras.authorization, 'una clave sb_publishable_ no viaja como Bearer').toBeUndefined();
  expect(new URL(peticiones[0].url()).searchParams.get('limit')).toBe('500');
  // La caché guarda el catálogo real vacío, con proyecto y formato.
  const cache = await pagina.evaluate(() => JSON.parse(localStorage.getItem('gama-talla-catalogo-v2')));
  expect(cache).toMatchObject({ formato: 2, proyecto: new URL(entorno().api).origin, productos: [] });
  await contexto.close();
  expect(problemas).toEqual([]);
});

test('crear: varios colores, tallas y fotos; se guarda oculta y sin confirmar nada', async ({ page }) => {
  const problemas = await abrirPanel(page);
  await page.getByRole('button', { name: 'Agregar zapatilla' }).first().click();
  await expect(editor(page).getByRole('heading', { name: 'Nueva zapatilla' })).toBeFocused();
  await rellenarModelo(page, { nombre: `Creada ${sufijo}`, referencia: 'REF-REPETIDA' });
  await rellenarColor(page, 0, { nombre: 'Negro', precio: '289000', anterior: '329000', tallas: ['40', '40,5', '41 1/3'] });
  await expect(color(page, 0).locator('.editor-talla')).toHaveCount(3);
  await expect(color(page, 0).locator('.editor-talla').first()).toContainText('nueva · por revisar');

  // Fotos: un WebP adecuado se sube tal cual; un JPEG grande se optimiza a WebP (si el navegador sabe).
  await subirFotos(page, 0, [fotos.adecuada, fotos.grande]);
  await esperarFotosListas(page, 0, 2);
  const primera = color(page, 0).locator('.editor-foto').first();
  await expect(primera.locator('.editor-foto-peso')).toContainText('1200×900 px');
  await expect(primera.locator('.editor-foto-peso')).toContainText('(sin recomprimir)');
  await expect(primera.locator('.editor-foto-principal')).toHaveText('Principal');
  const segunda = color(page, 0).locator('.editor-foto').nth(1);
  await expect(segunda.locator('.editor-foto-peso')).toContainText('1600×1200 px');
  await expect(segunda.locator('.editor-foto-peso')).not.toContainText('sin recomprimir');

  // Segundo color, con precio por confirmar.
  await editor(page).getByRole('button', { name: 'Agregar color' }).click();
  await expect(color(page, 1).getByRole('textbox', { name: 'Color (obligatorio)', exact: true })).toBeFocused();
  await rellenarColor(page, 1, { nombre: 'Blanco', precio: '0', tallas: ['38; 39'] });
  await expect(color(page, 1).locator('#' + await color(page, 1).getByLabel('Precio actual (COP)').getAttribute('id') + '-ayuda')).toHaveText('0 = «Precio por confirmar» en la tienda.');
  await subirFotos(page, 1, [fotos.otra]);
  await esperarFotosListas(page, 1, 1);

  // Doble clic: una sola petición de guardado.
  let llamadas = 0;
  page.on('request', (r) => { if (r.url().includes('/rpc/fn_admin_guardar_producto')) llamadas += 1; });
  await editor(page).getByRole('button', { name: 'Guardar oculta' }).dblclick();
  await expect(resultado(page)).toContainText('Guardado. La zapatilla sigue oculta en la tienda.');
  expect(llamadas).toBe(1);
  await expect(page.locator('#editor-codigo')).toHaveText(/^GT-\d{5}$/);
  await expect(page.locator('#editor-estado')).toHaveText('Oculta en la tienda');

  const [p] = await productosDePrueba();
  expect(p.activo).toBe(false);
  expect(p.variantes.map((v) => v.codigo_variante).sort()).toEqual([`${p.codigo_interno}-A`, `${p.codigo_interno}-B`]);
  const tallas = await tallasDe(p.variantes.map((v) => v.id));
  expect(tallas).toHaveLength(5);
  for (const t of tallas) expect(t, 'una talla nueva nace por revisar, sin vigencia').toMatchObject({ estado: 'REVISAR', vigencia_desde: null, vence_en: null, origen: 'manual' });
  const negro = p.variantes.find((v) => v.color === 'NEGRO');
  expect(negro).toMatchObject({ precio: 289000, precio_anterior: 329000 });
  expect(p.variantes.find((v) => v.color === 'BLANCO')).toMatchObject({ precio: 0, precio_anterior: 0 });
  // Los archivos están en Storage, son WebP y pesan lo previsto.
  const objetos = await objetosDe(p.id);
  expect(objetos).toHaveLength(3);
  for (const o of objetos) { expect(o.tipo).toBe('image/webp'); expect(o.bytes).toBeLessThanOrEqual(600 * 1024); }
  expect(negro.fotos.sort((a, b) => a.orden - b.orden)[0].ruta).toContain('/storage/v1/object/public/fotos-catalogo/productos/');
  // La tabla del tablero lo muestra oculto.
  await editor(page).getByRole('button', { name: 'Cerrar el editor' }).click();
  await expect(editor(page)).toBeHidden();
  await expect(page.locator('.producto', { hasText: `Creada ${sufijo}` }).locator('.producto-estado')).toHaveText('Oculto en la tienda');
  expect(problemas).toEqual([]);
});

test('validación: mensajes claros, nada se guarda y el formulario conserva los datos', async ({ page }) => {
  await abrirPanel(page);
  await page.getByRole('button', { name: 'Agregar zapatilla' }).first().click();
  await editor(page).getByRole('button', { name: 'Guardar oculta' }).click();
  await expect(page.locator('#editor-error')).toContainText('Escribe el nombre del modelo');
  await expect(editor(page).getByRole('textbox', { name: 'Modelo (obligatorio)', exact: true })).toBeFocused();
  await expect(editor(page).getByRole('textbox', { name: 'Modelo (obligatorio)', exact: true })).toHaveAttribute('aria-invalid', 'true');

  await rellenarModelo(page, { nombre: `Validada ${sufijo}` });
  await rellenarColor(page, 0, { nombre: 'Rojo', precio: '200000', anterior: '150000' });
  await editor(page).getByRole('button', { name: 'Guardar oculta' }).click();
  await expect(page.locator('#editor-error')).toContainText('el precio anterior debe ser mayor que el actual');
  await color(page, 0).getByLabel('Precio anterior (opcional)').fill('');
  await color(page, 0).getByLabel('Precio actual (COP)').fill('20O000');
  await editor(page).getByRole('button', { name: 'Guardar oculta' }).click();
  await expect(page.locator('#editor-error')).toContainText('número entero de pesos');
  await color(page, 0).getByLabel('Precio actual (COP)').fill('200.000');
  await expect(color(page, 0).getByText('Se mostrará como $ 200.000.')).toBeVisible();

  // Tallas: formato y equivalentes.
  const entrada = color(page, 0).getByLabel('Añadir talla');
  for (const [valor, mensaje] of [['40½', 'no es una talla válida'], ['40 4/3', 'no es una talla válida'], ['foo', 'no es una talla válida']]) {
    await entrada.fill(valor);
    await entrada.press('Enter');
    await expect(color(page, 0).locator('.campo-error')).toContainText(mensaje);
  }
  await entrada.fill('40,5');
  await entrada.press('Enter');
  await entrada.fill('40.50');
  await entrada.press('Enter');
  await expect(color(page, 0).locator('.campo-error')).toHaveText('40.50 equivale a la talla 40,5, que ya está en este color.');
  await expect(color(page, 0).getByLabel('Añadir talla')).toHaveAttribute('aria-invalid', 'true');
  await expect(color(page, 0).locator('.editor-talla')).toHaveCount(1);

  // El servidor también valida (aunque la interfaz se saltara): talla equivalente enviada a mano.
  await page.route('**/rpc/fn_admin_guardar_producto*', async (r) => {
    const cuerpo = JSON.parse(r.request().postData() || '{}');
    cuerpo.p_datos.variantes[0].tallas.push({ id: crypto.randomUUID(), talla: '40.5', activa: true });
    await r.continue({ postData: JSON.stringify(cuerpo) });
  });
  await editor(page).getByRole('button', { name: 'Guardar oculta' }).click();
  await expect(page.locator('#editor-error')).toContainText('equivale a la talla 40,5');
  await expect(page.locator('#editor-error')).toContainText('No se guardó nada');
  expect(await productosDePrueba()).toHaveLength(0);
  await expect(editor(page).getByRole('textbox', { name: 'Modelo (obligatorio)', exact: true })).toHaveValue(`Validada ${sufijo}`.toUpperCase());
  await page.unroute('**/rpc/fn_admin_guardar_producto*');
  await editor(page).getByRole('button', { name: 'Guardar oculta' }).click();
  await expect(resultado(page)).toContainText('Guardado.');
  expect(await productosDePrueba()).toHaveLength(1);
});

test('publicar, editar datos y precios conservando identificadores; la tienda lo refleja', async ({ page, browser }) => {
  await abrirPanel(page);
  const antes = await crearCompleta(page, `Publicada ${sufijo}`);
  const tallasAntes = await tallasDe(antes.variantes.map((v) => v.id));
  await editor(page).getByRole('button', { name: 'Publicar' }).click();
  await expect(resultado(page)).toContainText('Publicada: ya se ve en la tienda.');
  await expect(page.locator('#editor-estado')).toHaveText('Publicada en la tienda');
  await expect(editor(page).getByRole('button', { name: 'Ocultar de la tienda' })).toBeVisible();
  await expect(page.locator('#editor-publicar')).toBeHidden();

  // Editar: nombre y precio. Mismos UUID y códigos; las tallas no se tocan.
  await editor(page).getByRole('textbox', { name: 'Modelo (obligatorio)', exact: true }).fill(`Editada ${sufijo}`);
  await color(page, 0).getByLabel('Precio actual (COP)').fill('259000');
  await editor(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(resultado(page)).toContainText('Los cambios ya se ven en la tienda.');
  const [despues] = await productosDePrueba();
  expect(despues.id).toBe(antes.id);
  expect(despues.codigo_interno).toBe(antes.codigo_interno);
  expect(despues.variantes.map((v) => [v.id, v.codigo_variante])).toEqual(antes.variantes.map((v) => [v.id, v.codigo_variante]));
  expect(despues.variantes[0]).toMatchObject({ precio: 259000, precio_anterior: 329000 });
  const tallasDespues = await tallasDe(despues.variantes.map((v) => v.id));
  expect(tallasDespues.map((t) => [t.id, t.estado, t.vigencia_desde]).sort()).toEqual(tallasAntes.map((t) => [t.id, t.estado, t.vigencia_desde]).sort());

  const { contexto, pagina } = await abrirTienda(browser);
  const tarjeta = pagina.locator('article', { hasText: `Editada ${sufijo}` });
  await expect(tarjeta).toBeVisible();
  await expect(tarjeta).toContainText('$ 259.000');
  await expect(tarjeta).toContainText('$ 329.000');
  // Publicar no confirmó ninguna talla: todas siguen por revisar en la tienda.
  const estados = await pagina.evaluate((n) => estado.productos.find((p) => p.nombre === n).variantes[0].estadosTalla, `Editada ${sufijo}`.toUpperCase());
  expect(Object.values(estados)).toEqual(['POR_REVISAR', 'POR_REVISAR', 'POR_REVISAR']);
  await contexto.close();
});

test('fotos: ordenar, principal, reemplazar, quitar y borrar definitivamente con protección', async ({ page, browser }) => {
  await abrirPanel(page);
  const p = await crearCompleta(page, `Fotos ${sufijo}`);
  await subirFotos(page, 0, [fotos.otra]);
  await esperarFotosListas(page, 0, 2);
  // La segunda pasa a principal (con el teclado).
  await color(page, 0).locator('.editor-foto').nth(1).getByRole('button', { name: 'Hacer principal' }).press('Enter');
  await expect(color(page, 0).locator('.editor-foto').first().locator('.editor-foto-peso')).toContainText('1000×1000 px');
  await expect(color(page, 0).locator('.editor-foto').first().locator('.editor-foto-principal')).toHaveText('Principal');
  await editor(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(resultado(page)).toContainText('Guardado.');
  let [fila] = await productosDePrueba();
  const orden1 = fila.variantes[0].fotos.sort((a, b) => a.orden - b.orden).map((f) => f.ruta);
  expect(orden1).toHaveLength(2);
  const [principal, segunda] = orden1;

  // Reemplazar la principal: archivo NUEVO; el anterior sigue en Storage.
  await color(page, 0).locator('.editor-foto').first().locator('input[data-reemplazar]').setInputFiles(fotos.adecuada);
  await esperarFotosListas(page, 0, 2);
  await expect(color(page, 0).locator('.editor-foto').first().locator('.editor-foto-peso')).toContainText('1200×900 px');
  await editor(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(resultado(page)).toContainText('Guardado.');
  [fila] = await productosDePrueba();
  const orden2 = fila.variantes[0].fotos.sort((a, b) => a.orden - b.orden).map((f) => f.ruta);
  expect(orden2[0]).not.toBe(principal);
  expect(orden2[1]).toBe(segunda);
  expect((await objetosDe(p.id)).map((o) => o.nombre).sort()).toHaveLength(3);

  // Quitar de la galería: la fila se va, el archivo se queda.
  await color(page, 0).locator('.editor-foto').nth(1).getByRole('button', { name: /Quitar la foto 2 de la galería/ }).click();
  await editor(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(resultado(page)).toContainText('Guardado.');
  [fila] = await productosDePrueba();
  expect(fila.variantes[0].fotos).toHaveLength(1);
  expect(await objetosDe(p.id)).toHaveLength(3);

  // Archivos sin usar: los dos que ya no están en ninguna galería. Borrado con confirmación.
  await editor(page).getByRole('button', { name: 'Revisar archivos sin usar' }).click();
  const sinUsar = editor(page).locator('.editor-sin-usar-item');
  await expect(sinUsar).toHaveCount(2);
  await sinUsar.first().getByRole('button', { name: /Borrar definitivamente/ }).click();
  await expect(sinUsar.first()).toContainText('¿Borrar definitivamente?');
  await sinUsar.first().getByRole('button', { name: 'No' }).click();
  await expect(sinUsar).toHaveCount(2);
  await sinUsar.first().getByRole('button', { name: /Borrar definitivamente/ }).click();
  await sinUsar.first().getByRole('button', { name: 'Sí, borrar' }).click();
  await expect(resultado(page)).toContainText('Archivo borrado definitivamente de Storage.');
  await expect(sinUsar).toHaveCount(1);
  const quedan = await objetosDe(p.id);
  expect(quedan).toHaveLength(2);

  // Protección en el servidor: la foto de la galería no se puede borrar, ni saltándose el panel.
  const enUso = /fotos-catalogo\/(.+)$/.exec(fila.variantes[0].fotos[0].ruta)[1];
  const borradas = await page.evaluate(async (o) => (await window.GamaTallaPanel.cliente().storage.from('fotos-catalogo').remove([o])).data, enUso);
  expect(borradas).toEqual([]);
  expect((await objetosDe(p.id)).map((o) => o.nombre)).toContain(enUso);

  // La tienda muestra la foto principal de la galería guardada.
  await editor(page).getByRole('button', { name: 'Publicar' }).click();
  await expect(resultado(page)).toContainText('Publicada');
  const { contexto, pagina } = await abrirTienda(browser);
  const imagen = pagina.locator('article', { hasText: `Fotos ${sufijo}` }).locator('img').first();
  await expect(imagen).toHaveAttribute('src', fila.variantes[0].fotos[0].ruta);
  await expect.poll(() => imagen.evaluate((i) => i.complete && i.naturalWidth)).toBeGreaterThan(0);
  await contexto.close();
});

test('archivos no válidos: se rechazan por su contenido y no se sube nada', async ({ page }) => {
  await abrirPanel(page);
  await page.getByRole('button', { name: 'Agregar zapatilla' }).first().click();
  await rellenarModelo(page, { nombre: `Inválidas ${sufijo}` });
  await rellenarColor(page, 0, { nombre: 'Gris', precio: '150000', tallas: ['39'] });
  await subirFotos(page, 0, [fotos.falsa, fotos.diminuta, fotos.danada]);
  const items = color(page, 0).locator('.editor-foto');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0).locator('.editor-foto-mensaje')).toContainText('No es una foto JPEG, PNG o WebP');
  await expect(items.nth(1).locator('.editor-foto-mensaje')).toContainText('al menos 400 px');
  await expect(items.nth(2).locator('.editor-foto-mensaje')).toContainText('No pudimos abrir la imagen');
  await editor(page).getByRole('button', { name: 'Guardar oculta' }).click();
  await expect(page.locator('#editor-error')).toContainText('Hay fotos que no se pudieron subir');
  expect(await productosDePrueba()).toHaveLength(0);
  for (let i = 0; i < 3; i += 1) await items.first().getByRole('button', { name: /Descartar/ }).click();
  await expect(items).toHaveCount(0);
  await editor(page).getByRole('button', { name: 'Guardar oculta' }).click();
  await expect(resultado(page)).toContainText('Guardado.');
  const [p] = await productosDePrueba();
  expect(await objetosDe(p.id)).toHaveLength(0);
});

test('navegador que no genera WebP: no se sube otra cosa; un WebP adecuado sí, sin recomprimir', async ({ page }) => {
  // Simula un navegador que, al pedirle WebP, devuelve PNG (como algunos Safari).
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb, tipo, calidad) { return original.call(this, cb, tipo === 'image/webp' ? 'image/png' : tipo, calidad); };
  });
  await abrirPanel(page);
  await page.getByRole('button', { name: 'Agregar zapatilla' }).first().click();
  await rellenarModelo(page, { nombre: `Sin WebP ${sufijo}` });
  await rellenarColor(page, 0, { nombre: 'Café', precio: '120000', tallas: ['41'] });
  await subirFotos(page, 0, [fotos.png, fotos.adecuada]);
  const items = color(page, 0).locator('.editor-foto');
  await expect(items.nth(0).locator('.editor-foto-mensaje')).toContainText('Este navegador no puede generar WebP');
  await esperarFotosListas(page, 0, 1);
  await expect(items.nth(1).locator('.editor-foto-peso')).toContainText('(sin recomprimir)');
  await items.nth(0).getByRole('button', { name: /Descartar/ }).click();
  await editor(page).getByRole('button', { name: 'Guardar oculta' }).click();
  await expect(resultado(page)).toContainText('Guardado.');
  const [p] = await productosDePrueba();
  const objetos = await objetosDe(p.id);
  expect(objetos).toHaveLength(1);
  expect(objetos[0].tipo).toBe('image/webp');
  expect(objetos[0].bytes, 'el WebP adecuado se subió tal cual').toBe(fs.statSync(fotos.adecuada).size);
});

test('fallos de subida: sin confirmación no se guarda la referencia; reintentar no duplica', async ({ page }) => {
  await abrirPanel(page);
  await page.getByRole('button', { name: 'Agregar zapatilla' }).first().click();
  await rellenarModelo(page, { nombre: `Subidas ${sufijo}` });
  await rellenarColor(page, 0, { nombre: 'Azul', precio: '180000', tallas: ['42'] });
  let subidas = 0;
  let modo = 'no-sale';
  await page.route('**/storage/v1/object/fotos-catalogo/productos/**', async (r) => {
    if (r.request().method() !== 'POST') return r.continue();
    subidas += 1;
    if (modo === 'no-sale') return r.abort('internetdisconnected');
    if (modo === 'error-500') return r.fulfill({ status: 500, body: '{"statusCode":"500","message":"fallo"}' });
    if (modo === 'respuesta-perdida') { await r.fetch(); return r.abort('internetdisconnected'); }
    return r.continue();
  });
  // 1) No llega: no se afirma que falló; se ofrece reintentar con el MISMO nombre.
  await subirFotos(page, 0, [fotos.adecuada]);
  const item = color(page, 0).locator('.editor-foto').first();
  await expect(item.locator('.editor-foto-mensaje')).toContainText('todavía no aparece en Storage. Reintenta');
  await editor(page).getByRole('button', { name: 'Guardar oculta' }).click();
  await expect(page.locator('#editor-error')).toContainText('Hay fotos que no se pudieron subir');
  expect(await productosDePrueba(), 'no se guarda una referencia sin archivo').toHaveLength(0);
  // 2) Error del servidor: tampoco se da por perdida sin comprobarlo.
  modo = 'error-500';
  await item.getByRole('button', { name: 'Reintentar subida' }).click();
  await expect(item.locator('.editor-foto-mensaje')).toContainText('Reintenta');
  // 3) Llega, pero la respuesta se pierde: se comprueba en Storage y se da por subida.
  modo = 'respuesta-perdida';
  await item.getByRole('button', { name: 'Reintentar subida' }).click();
  await esperarFotosListas(page, 0, 1);
  expect(subidas).toBe(3);
  await page.unroute('**/storage/v1/object/fotos-catalogo/productos/**');
  await editor(page).getByRole('button', { name: 'Guardar oculta' }).click();
  await expect(resultado(page)).toContainText('Guardado.');
  const [p] = await productosDePrueba();
  expect(await objetosDe(p.id), 'un solo archivo: los reintentos usan el mismo nombre').toHaveLength(1);
  expect(p.variantes[0].fotos).toHaveLength(1);
});

test('respuesta perdida al guardar: se comprueba por la operación y nunca se duplica', async ({ page }) => {
  await abrirPanel(page);
  let modo = 'respuesta-perdida';
  let llamadas = 0;
  await page.route('**/rpc/fn_admin_guardar_producto*', async (r) => {
    llamadas += 1;
    if (modo === 'respuesta-perdida') { await r.fetch(); return r.abort('internetdisconnected'); }
    if (modo === 'no-sale') return r.abort('internetdisconnected');
    return r.continue();
  });
  // 1) Crear: llega y se pierde la respuesta. Releer demuestra que se aplicó.
  await page.getByRole('button', { name: 'Agregar zapatilla' }).first().click();
  await rellenarModelo(page, { nombre: `Perdida ${sufijo}` });
  await rellenarColor(page, 0, { nombre: 'Verde', precio: '210000', tallas: ['40'] });
  await editor(page).getByRole('button', { name: 'Guardar oculta' }).click();
  await expect(resultado(page)).toContainText('Guardado (comprobado con el identificador de esta operación).');
  expect(await productosDePrueba()).toHaveLength(1);
  expect(llamadas).toBe(1);

  // 2) Editar: no llega. Sin pruebas no se dice que falló; reintentar usa la misma operación.
  modo = 'no-sale';
  await editor(page).getByRole('textbox', { name: 'Modelo (obligatorio)', exact: true }).fill(`Perdida y reintentada ${sufijo}`);
  await editor(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(resultado(page)).toContainText('Resultado no confirmado. La zapatilla sigue sin cambios por ahora; la operación todavía podría aplicarse.');
  await expect(resultado(page)).not.toContainText('No se guardó');
  modo = 'normal';
  await resultado(page).getByRole('button', { name: 'Reintentar el guardado' }).click();
  await expect(resultado(page)).toContainText('Guardado.');
  const cuerpos = [];
  page.on('request', (r) => { if (r.url().includes('/rpc/fn_admin_guardar_producto')) cuerpos.push(JSON.parse(r.postData())); });

  // 3) Reintentar una operación que sí llegó: el servidor no la repite.
  modo = 'respuesta-perdida';
  await color(page, 0).getByLabel('Precio actual (COP)').fill('199000');
  await editor(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(resultado(page)).toContainText('comprobado con el identificador de esta operación');
  const [p] = await productosDePrueba();
  expect(p).toMatchObject({ nombre: `Perdida y reintentada ${sufijo}`.toUpperCase(), version: 3 });
  expect(p.variantes).toHaveLength(1);
  expect(p.variantes[0].precio).toBe(199000);

  // 4) Crear sin que llegue nada: «todavía no aparece»; el reintento crea UNA sola.
  await editor(page).getByRole('button', { name: 'Cerrar el editor' }).click();
  modo = 'no-sale';
  await page.getByRole('button', { name: 'Agregar zapatilla' }).first().click();
  await rellenarModelo(page, { nombre: `Sin llegar ${sufijo}` });
  await rellenarColor(page, 0, { nombre: 'Lila', precio: '90000' });
  await editor(page).getByRole('button', { name: 'Guardar oculta' }).click();
  await expect(resultado(page)).toContainText('La zapatilla todavía no aparece en el servidor; el guardado podría seguir en camino.');
  modo = 'normal';
  await resultado(page).getByRole('button', { name: 'Reintentar el guardado' }).click();
  await expect(resultado(page)).toContainText('Guardado.');
  const nuevas = (await productosDePrueba()).filter((x) => x.nombre === `Sin llegar ${sufijo}`.toUpperCase());
  expect(nuevas).toHaveLength(1);
  const operaciones = cuerpos.slice(-2).map((c) => c.p_operacion);
  expect(operaciones[0], 'el reintento reutiliza la operación').toBe(operaciones[1]);
  expect(cuerpos.slice(-2).map((c) => c.p_datos.id)).toEqual([nuevas[0].id, nuevas[0].id]);
});

test('conflicto: una edición más reciente no se sobrescribe y el formulario se conserva', async ({ page }) => {
  await abrirPanel(page);
  const p = await crearCompleta(page, `Conflicto ${sufijo}`, { conFotos: false });
  // Otra edición (otra pestaña u otra cuenta) se guarda mientras este formulario sigue abierto.
  await servicio('PATCH', `/rest/v1/productos?id=eq.${p.id}`, { nombre: `Cambio externo ${sufijo}`, version: p.version + 1 });
  await color(page, 0).getByLabel('Precio actual (COP)').fill('111000');
  await editor(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(resultado(page)).toContainText('Otra edición de esta zapatilla se guardó antes que la tuya.');
  await expect(resultado(page)).toContainText('No se cambió nada y tus datos siguen en el formulario.');
  await expect(color(page, 0).getByLabel('Precio actual (COP)')).toHaveValue('111000');
  const [fila] = await productosDePrueba();
  expect(fila).toMatchObject({ nombre: `Cambio externo ${sufijo}`.toUpperCase(), version: p.version + 1 });
  expect(fila.variantes[0].precio).toBe(289000);
  await resultado(page).getByRole('button', { name: 'Cargar la versión actual' }).click();
  await expect(editor(page).getByRole('textbox', { name: 'Modelo (obligatorio)', exact: true })).toHaveValue(`Cambio externo ${sufijo}`.toUpperCase());
  await expect(color(page, 0).getByLabel('Precio actual (COP)')).toHaveValue('289000');
});

test('permisos: visitantes y sesiones sin permiso no escriben productos ni fotos', async ({ page }) => {
  const e = entorno();
  await abrirPanel(page);
  const p = await crearCompleta(page, `Permisos ${sufijo}`, { conFotos: false });
  const datos = { id: p.id, nombre: 'INTRUSO', marca: 'X', categoria: 'X', variantes: [] };
  const objeto = `productos/${p.id}/${p.variantes[0].id}/1700000000000-intrusoabc.webp`;
  const webp = fs.readFileSync(fotos.adecuada);

  // Visitante (clave publicable, sin sesión).
  const anon = { apikey: e.publicable, 'Content-Type': 'application/json' };
  let r = await fetch(`${e.api}/rest/v1/rpc/fn_admin_guardar_producto`, { method: 'POST', headers: anon, body: JSON.stringify({ p_datos: datos, p_version: p.version, p_operacion: crypto.randomUUID() }) });
  expect([401, 403, 404]).toContain(r.status);
  r = await fetch(`${e.api}/rest/v1/rpc/fn_admin_estado_producto`, { method: 'POST', headers: anon, body: JSON.stringify({ p_id: p.id, p_accion: 'publicar', p_version: p.version, p_operacion: crypto.randomUUID() }) });
  expect([401, 403, 404]).toContain(r.status);
  r = await fetch(`${e.api}/storage/v1/object/fotos-catalogo/${objeto}`, { method: 'POST', headers: { apikey: e.publicable, 'Content-Type': 'image/webp' }, body: webp });
  expect(r.ok, 'el visitante no sube').toBe(false);

  // Sesión válida que NO es administradora.
  const otro = await crearUsuario(`sin-permiso-${sufijo}@gamaytalla.test`);
  try {
    const sesion = await (await fetch(`${e.api}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: e.publicable, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: otro.correo, password: otro.clave }) })).json();
    const conSesion = { apikey: e.publicable, Authorization: `Bearer ${sesion.access_token}`, 'Content-Type': 'application/json' };
    r = await fetch(`${e.api}/rest/v1/rpc/fn_admin_guardar_producto`, { method: 'POST', headers: conSesion, body: JSON.stringify({ p_datos: datos, p_version: p.version, p_operacion: crypto.randomUUID() }) });
    expect(r.status).toBe(403);
    expect((await r.json()).message).toContain('Solo un administrador');
    r = await fetch(`${e.api}/rest/v1/rpc/fn_admin_estado_producto`, { method: 'POST', headers: conSesion, body: JSON.stringify({ p_id: p.id, p_accion: 'publicar', p_version: p.version, p_operacion: crypto.randomUUID() }) });
    expect(r.status).toBe(403);
    r = await fetch(`${e.api}/storage/v1/object/fotos-catalogo/${objeto}`, { method: 'POST', headers: { ...conSesion, 'Content-Type': 'image/webp' }, body: webp });
    expect(r.ok, 'una sesión sin permiso no sube').toBe(false);
    r = await fetch(`${e.api}/storage/v1/object/list/fotos-catalogo`, { method: 'POST', headers: conSesion, body: JSON.stringify({ prefix: `productos/${p.id}/`, limit: 10 }) });
    expect(await r.json(), 'ni lista los archivos').toEqual([]);
  } finally {
    await borrarUsuario(otro.id);
  }
  const [fila] = await productosDePrueba();
  expect(fila).toMatchObject({ nombre: `Permisos ${sufijo}`.toUpperCase(), version: p.version, activo: false });
  expect(await objetosDe(p.id)).toHaveLength(0);
});

test('desactivar tallas y colores, ocultar, retirar y restaurar sin borrar nada', async ({ page, browser }) => {
  await abrirPanel(page);
  const p = await crearCompleta(page, `Ciclo ${sufijo}`);
  await editor(page).getByRole('button', { name: 'Agregar color' }).click();
  await rellenarColor(page, 1, { nombre: 'Blanco', precio: '289000', tallas: ['38'] });
  await subirFotos(page, 1, [fotos.otra]);
  await esperarFotosListas(page, 1, 1);
  await editor(page).getByRole('button', { name: 'Guardar y publicar' }).click();
  await expect(resultado(page)).toContainText('Publicada: ya se ve en la tienda.');

  // Desactivar la talla 40 y el color Blanco.
  await color(page, 0).getByRole('button', { name: 'Desactivar la talla 40', exact: true }).click();
  await expect(color(page, 0).getByRole('button', { name: 'Reactivar la talla 40', exact: true })).toBeFocused();
  await color(page, 1).getByText('Color visible en la tienda').click();
  await editor(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(resultado(page)).toContainText('Los cambios ya se ven en la tienda.');
  const [fila] = await productosDePrueba();
  const tallas = await tallasDe(fila.variantes.map((v) => v.id));
  expect(tallas).toHaveLength(4);
  const t40 = tallas.find((t) => t.talla === '40');
  expect(t40.activa).toBe(false);
  expect(fila.variantes.find((v) => v.color === 'BLANCO').activa).toBe(false);

  let tienda = await abrirTienda(browser);
  await tienda.pagina.locator('article', { hasText: `Ciclo ${sufijo}` }).waitFor();
  const visto = await tienda.pagina.evaluate((n) => { const x = estado.productos.find((q) => q.nombre === n); return { colores: x.variantes.map((v) => v.color), tallas: Object.keys(x.variantes[0].estadosTalla) }; }, `Ciclo ${sufijo}`.toUpperCase());
  expect(visto).toEqual({ colores: ['NEGRO'], tallas: ['40,5', '41 1/3'] });
  await tienda.contexto.close();

  // Ocultar → retirar → (no se puede publicar) → restaurar → reactivar la misma talla.
  await editor(page).getByRole('button', { name: 'Ocultar de la tienda' }).click();
  await expect(resultado(page)).toContainText('Oculta: ya no se ve en la tienda.');
  await editor(page).getByRole('button', { name: 'Retirar del catálogo' }).click();
  await expect(resultado(page)).toContainText('¿Retirar esta zapatilla del catálogo?');
  await resultado(page).getByRole('button', { name: 'Sí, retirarla' }).click();
  await expect(page.locator('#editor-estado')).toHaveText('Retirada del catálogo (oculta; se conserva todo)');
  await expect(page.locator('#editor-publicar')).toBeHidden();
  await editor(page).getByRole('button', { name: 'Cerrar el editor' }).click();
  await expect(page.locator('.producto', { hasText: `Ciclo ${sufijo}` })).toHaveCount(0);
  await page.locator('#filtros').getByRole('button', { name: /^Retiradas/ }).click();
  await expect(page.locator('.producto', { hasText: `Ciclo ${sufijo}` }).locator('.producto-estado')).toHaveText('Retirado del catálogo');
  await page.locator('.producto', { hasText: `Ciclo ${sufijo}` }).getByRole('button', { name: /^Editar/ }).click();
  await editor(page).getByRole('button', { name: 'Restaurar' }).click();
  await expect(resultado(page)).toContainText('Restaurada: sigue oculta hasta que la publiques.');
  await color(page, 0).getByRole('button', { name: 'Reactivar la talla 40', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(resultado(page)).toContainText('Guardado.');
  const despues = await tallasDe(fila.variantes.map((v) => v.id));
  expect(despues).toHaveLength(4);
  expect(despues.find((t) => t.id === t40.id).activa, 'la misma fila, reactivada').toBe(true);
  const [final] = await productosDePrueba();
  expect(final).toMatchObject({ id: p.id, activo: false, retirado_en: null });
});

test('editor antiguo: no deshace la reactivación hecha desde 15B ni toca su confirmación', async ({ page }) => {
  await abrirPanel(page);
  const p = await crearCompleta(page, `Carrera ${sufijo}`);
  // a) El editor queda abierto con la talla 40 desactivada (guardada así).
  await color(page, 0).getByRole('button', { name: 'Desactivar la talla 40', exact: true }).click();
  await editor(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(resultado(page)).toContainText('Guardado.');
  await expect(color(page, 0).getByRole('button', { name: 'Reactivar la talla 40', exact: true })).toBeVisible();
  const t40 = (await tallasDe(p.variantes.map((v) => v.id))).find((t) => t.talla === '40');
  expect(t40.activa).toBe(false);

  // b) En otra pestaña, «Confirmó el proveedor» sobre esa talla (acción real de 15B): la reactiva.
  const otra = await page.context().newPage();
  await configurarPanel(otra);
  await otra.goto(PANEL);
  await expect(otra.locator(`.talla[data-talla-id="${t40.id}"]`)).toBeVisible();
  await otra.locator(`.talla[data-talla-id="${t40.id}"]`).click();
  await otra.locator('#barra-acciones').getByRole('button', { name: 'Confirmó el proveedor', exact: true }).click();
  await otra.locator('#dialogo-accion').getByRole('button', { name: 'Confirmar disponibilidad', exact: true }).click();
  await expect(otra.locator('#resultado-accion')).toContainText('Talla 40 confirmada por el proveedor');
  await otra.close();
  const columnas = 'activa,estado,vigencia_desde,vence_en,vigencia_horas,confirmado_en,publicado_en,origen';
  const [tras15B] = await servicio('GET', `/rest/v1/tallas?select=${columnas}&id=eq.${t40.id}`);
  expect(tras15B).toMatchObject({ activa: true, estado: 'CONFIRMADA', origen: 'proveedor' });

  // c) En el editor antiguo solo se cambia el precio y se guarda.
  await color(page, 0).getByLabel('Precio actual (COP)').fill('279000');
  await editor(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(resultado(page)).toContainText('Guardado.');
  // d) La reactivación se conserva, y se dice; estado, confirmación y vigencia no cambian.
  await expect(resultado(page)).toContainText('La talla 40 de «NEGRO» cambió en otro lugar mientras editabas (se reactivó) y se conservó ese cambio.');
  const [despues] = await servicio('GET', `/rest/v1/tallas?select=${columnas}&id=eq.${t40.id}`);
  expect(despues).toEqual(tras15B);
  const [fila] = (await productosDePrueba()).filter((x) => x.id === p.id);
  expect(fila.variantes[0].precio).toBe(279000);
  // El formulario muestra el estado real del servidor.
  await expect(color(page, 0).getByRole('button', { name: 'Desactivar la talla 40', exact: true })).toBeVisible();
});

test('cambios sin guardar: se pide confirmación antes de cerrar y al abandonar la página', async ({ page, browserName }) => {
  await abrirPanel(page);
  await page.getByRole('button', { name: 'Agregar zapatilla' }).first().click();
  // Sin cambios, cerrar no pregunta.
  await expect(page.locator('[data-editor="cancelar"]')).toHaveText('Cerrar');
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeHidden();
  await expect(page.locator('#boton-nuevo')).toBeFocused();

  await page.getByRole('button', { name: 'Agregar zapatilla' }).first().click();
  await rellenarModelo(page, { nombre: `Sin guardar ${sufijo}` });
  await editor(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('#editor-salida')).toBeVisible();
  await expect(page.locator('#editor-salida-texto')).toHaveText('Tienes cambios sin guardar. ¿Quieres descartarlos?');
  await expect(editor(page).getByRole('button', { name: 'Seguir editando' })).toBeFocused();
  await editor(page).getByRole('button', { name: 'Seguir editando' }).click();
  await expect(page.locator('#editor-salida')).toBeHidden();
  await expect(editor(page).getByRole('textbox', { name: 'Modelo (obligatorio)', exact: true })).toHaveValue(`Sin guardar ${sufijo}`.toUpperCase());
  await page.keyboard.press('Escape');
  await expect(page.locator('#editor-salida')).toBeVisible();

  if (browserName === 'chromium') {
    // Recargar la página con cambios sin guardar abre el aviso del navegador.
    const dialogos = [];
    page.on('dialog', (d) => { dialogos.push(d.type()); d.dismiss(); });
    await page.evaluate(() => { location.reload(); }).catch(() => null);
    await expect.poll(() => dialogos).toEqual(['beforeunload']);
    await expect(editor(page)).toBeVisible();
  }
  await editor(page).getByRole('button', { name: 'Descartar cambios' }).click();
  await expect(editor(page)).toBeHidden();
  expect(await productosDePrueba()).toHaveLength(0);
});

test('disponibilidad: crear no confirma; la acción de 15B sí. Tienda, carrito y respaldo', async ({ page, browser }) => {
  await abrirPanel(page);
  const p = await crearCompleta(page, `Venta ${sufijo}`);
  await editor(page).getByRole('button', { name: 'Publicar' }).click();
  await expect(resultado(page)).toContainText('Publicada');
  await editor(page).getByRole('button', { name: 'Cerrar el editor' }).click();
  // La talla 40 se confirma con la acción de 15B, expresamente.
  const t40 = (await tallasDe(p.variantes.map((v) => v.id))).find((t) => t.talla === '40');
  await page.locator(`.talla[data-talla-id="${t40.id}"]`).click();
  await page.locator('#barra-acciones').getByRole('button', { name: 'Confirmó el proveedor', exact: true }).click();
  await page.locator('#dialogo-accion').getByRole('button', { name: 'Confirmar disponibilidad', exact: true }).click();
  await expect(page.locator('#resultado-accion')).toContainText('Talla 40 confirmada por el proveedor');

  // Tienda: 40 disponible; se añade al carrito y el pedido lleva modelo, color, referencia y talla.
  const { contexto, pagina } = await abrirTienda(browser);
  await pagina.locator('article', { hasText: `Venta ${sufijo}` }).waitFor();
  const estados = await pagina.evaluate((n) => estado.productos.find((x) => x.nombre === n).variantes[0].estadosTalla, `Venta ${sufijo}`.toUpperCase());
  expect(estados).toEqual({ 40: 'DISPONIBLE', '40,5': 'POR_REVISAR', '41 1/3': 'POR_REVISAR' });
  await pagina.evaluate((n) => { const x = estado.productos.find((q) => q.nombre === n); agregarAlCarrito(x.clave, x.variantes[0].id, '40', 2); }, `Venta ${sufijo}`.toUpperCase());
  const lineas = await pagina.evaluate(() => lineasComprables().map((l) => ({ producto: l.producto.nombre, color: l.variante.color, talla: l.talla, cantidad: l.cantidad })));
  expect(lineas).toEqual([{ producto: `Venta ${sufijo}`.toUpperCase(), color: 'NEGRO', talla: '40', cantidad: 2 }]);
  const mensaje = await pagina.evaluate(() => crearMensajePedido(lineasComprables()));
  for (const t of [`1. VENTA ${sufijo.toLocaleUpperCase('es-CO')}`, '* Color: NEGRO', '* Talla EU: 40', '* Cantidad: 2', '* Precio unit.: $289.000', '* Subtotal: $578.000']) {
    expect(mensaje).toContain(t);
  }
  const guardado = await pagina.evaluate(() => localStorage.getItem('gama-talla-carrito-v3'));
  expect(JSON.parse(guardado), 'el carrito V3 guarda producto, variante, talla y cantidad').toBeTruthy();
  await contexto.close();

  // Supabase no responde: el último catálogo REAL de este navegador, en modo consulta. El carrito sigue.
  const e = entorno();
  const cacheReal = { formato: 2, proyecto: new URL(e.api).origin, fecha: Date.now() - 3600e3, productos: [] };
  const vista = await (await fetch(`${e.api}/rest/v1/catalogo_publico?select=*`, { headers: { apikey: e.publicable } })).json();
  cacheReal.productos = vista;
  for (const [cache, esperado] of [
    [{ clave: 'gama-talla-catalogo-v2', valor: cacheReal }, 'consulta'],
    [{ clave: 'gama-talla-catalogo-v2', valor: { ...cacheReal, proyecto: 'https://otro-proyecto.supabase.co' } }, 'sin-catalogo'],
    [{ clave: 'gama-talla-catalogo-cache', valor: { texto: fs.readFileSync('data/productos.json', 'utf8'), fecha: Date.now() } }, 'sin-catalogo']
  ]) {
    const contextoFallo = await browser.newContext({ locale: 'es-CO' });
    await contextoFallo.route(`${SITIO}/config.js`, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await contextoFallo.route('**/rest/v1/catalogo_publico**', (r) => r.abort('internetdisconnected'));
    await contextoFallo.addInitScript(([conf, carritoGuardado, c]) => {
      window.GAMA_TALLA_CONFIG = conf;
      localStorage.setItem('gama-talla-carrito-v3', carritoGuardado);
      localStorage.setItem(c.clave, JSON.stringify(c.valor));
    }, [{ supabaseUrl: e.api, clavePublicable: e.publicable }, guardado, cache]);
    const pag = await contextoFallo.newPage();
    await pag.goto(`${SITIO}/?intro=no`);
    if (esperado === 'consulta') {
      await expect(pag.locator('#aviso-respaldo')).toContainText('Modo consulta');
      await pag.locator('article', { hasText: `Venta ${sufijo}` }).waitFor();
      const enConsulta = await pag.evaluate((n) => estado.productos.find((x) => x.nombre === n).variantes[0].estadosTalla, `Venta ${sufijo}`.toUpperCase());
      expect(Object.values(enConsulta).every((s) => s === 'POR_REVISAR'), 'en modo consulta todo queda por revisar').toBe(true);
    } else {
      // Ni la caché de otro proyecto ni la antigua (que podía contener los ejemplos) se usan.
      await expect(pag.locator('.estado-catalogo h3')).toHaveText('No pudimos cargar las zapatillas');
      await expect(pag.locator('article.tarjeta')).toHaveCount(0);
      expect(await pag.evaluate(() => localStorage.getItem('gama-talla-catalogo-cache')), 'la caché antigua se retira').toBeNull();
    }
    expect(await pag.evaluate(() => localStorage.getItem('gama-talla-carrito-v3')), 'el carrito no se vacía').toBe(guardado);
    await contextoFallo.close();
  }
});

test('disposición: el editor en los cinco anchos, foco atrapado en el diálogo y capturas', async ({ page, browser, browserName }) => {
  await abrirPanel(page);
  await crearCompleta(page, `Disposición ${sufijo}`);
  await editor(page).getByRole('button', { name: 'Agregar color' }).click();
  await rellenarColor(page, 1, { nombre: 'Blanco con detalles en azul cobalto y suela de goma', precio: '0', tallas: ['38', '39', '40', '40,5', '41', '41 1/3', '42', '43', '44'] });
  for (const ancho of ANCHOS) {
    await page.setViewportSize({ width: ancho, height: ancho < 768 ? 800 : 900 });
    await page.waitForTimeout(100);
    const r = await revisarEditor(page);
    expect(r.desborde, `${ancho}px: sin desplazamiento horizontal`).toBe(0);
    expect(r.fuera, `${ancho}px: nada fuera de la pantalla`).toBe(0);
    expect(r.pequenos, `${ancho}px: controles táctiles de al menos 40 px`).toEqual([]);
    await page.screenshot({ path: path.join(CAPTURAS, `editor-${browserName}-${ancho}.png`) });
  }
  // El foco no sale del diálogo con Tab.
  await editor(page).getByRole('textbox', { name: 'Modelo (obligatorio)', exact: true }).focus();
  for (let i = 0; i < 40; i += 1) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('#editor')) || document.activeElement === document.body)).toBe(true);
  await editor(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(resultado(page)).toContainText('Guardado.');
  await editor(page).getByRole('button', { name: 'Cerrar el editor' }).click();
  for (const ancho of [360, 1440]) {
    await page.setViewportSize({ width: ancho, height: 900 });
    await page.screenshot({ path: path.join(CAPTURAS, `tablero-${browserName}-${ancho}.png`), fullPage: true });
  }
  // La misma zapatilla publicada, vista en la tienda (celular y escritorio).
  await page.locator('.producto', { hasText: `Disposición ${sufijo}` }).getByRole('button', { name: /^Editar/ }).click();
  await editor(page).getByRole('button', { name: 'Publicar' }).click();
  await expect(resultado(page)).toContainText('Publicada');
  const e = entorno();
  for (const ancho of [390, 1440]) {
    const contexto = await browser.newContext({ locale: 'es-CO', viewport: { width: ancho, height: 900 } });
    await contexto.route(`${SITIO}/config.js`, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await contexto.addInitScript((conf) => { window.GAMA_TALLA_CONFIG = conf; }, { supabaseUrl: e.api, clavePublicable: e.publicable });
    const tienda = await contexto.newPage();
    await tienda.goto(`${SITIO}/?intro=no`);
    const tarjeta = tienda.locator('article.tarjeta', { hasText: `Disposición ${sufijo}` });
    await tarjeta.scrollIntoViewIfNeeded();
    await expect.poll(() => tarjeta.locator('img').first().evaluate((i) => i.complete && i.naturalWidth)).toBeGreaterThan(0);
    await tienda.waitForTimeout(900); // la foto entra con una transición
    await tienda.screenshot({ path: path.join(CAPTURAS, `tienda-${browserName}-${ancho}.png`) });
    await contexto.close();
  }
});

// =====================================================================
// Etapa 16.1
// =====================================================================
// =====================================================================
// Etapa 16.2 · Códigos comerciales editables y mayúsculas reales
// (sustituye a la prueba de 16.1 «referencia visible»: ahora se editan los códigos GT reales y
// la referencia del proveedor queda aparte, solo informativa)
// =====================================================================
const campoCodigo = (page) => editor(page).getByRole('textbox', { name: 'Código de la zapatilla', exact: true });
const campoCodigoColor = (page, n) => color(page, n).getByRole('textbox', { name: 'Código del color', exact: true });
const campoColor = (page, n) => color(page, n).getByRole('textbox', { name: 'Color (obligatorio)', exact: true });
const guardarCambios = (page) => editor(page).getByRole('button', { name: 'Guardar cambios' }).click();

test('códigos editables: zapatilla y color en mayúsculas; tienda, carrito anterior, búsqueda y WhatsApp', async ({ page, browser, browserName }) => {
  await abrirPanel(page);
  const p = await crearCompleta(page, `Códigos ${sufijo}`);
  const NOMBRE = `Códigos ${sufijo}`.toUpperCase();
  const v = p.variantes[0];
  expect(p.codigo_interno).toMatch(/^GT-\d{5}$/);
  expect(v.codigo_variante).toBe(`${p.codigo_interno}-A`);
  // La 40 confirmada (mantenimiento local) para poder pedirla en la tienda.
  const t40 = (await tallasDe([v.id])).find((t) => t.talla === '40');
  await servicio('PATCH', `/rest/v1/tallas?id=eq.${t40.id}`, { estado: 'CONFIRMADA', origen: 'proveedor', vigencia_desde: new Date(Date.now() - 3600e3).toISOString() });
  await editor(page).getByRole('button', { name: 'Publicar' }).click();
  await expect(resultado(page)).toContainText('Publicada');

  // Campos claros: los dos códigos reales; la referencia del proveedor, aparte e informativa.
  await expect(campoCodigo(page)).toHaveValue(p.codigo_interno);
  await expect(campoCodigoColor(page, 0)).toHaveValue(v.codigo_variante);
  await expect(color(page, 0).getByRole('textbox', { name: 'Referencia del proveedor para este color (opcional)' })).toBeVisible();
  await expect(color(page, 0).locator('.campo-ayuda', { hasText: 'no cambia el código del color' })).toBeVisible();
  await expect(editor(page).getByRole('textbox', { name: /Referencia visible/ })).toHaveCount(0);

  // La tienda, con una línea en el carrito guardada ANTES de cambiar los códigos.
  const tienda = await abrirTienda(browser);
  await tienda.pagina.locator('article', { hasText: NOMBRE }).waitFor();
  await tienda.pagina.evaluate((n) => { const x = estado.productos.find((q) => q.nombre === n); agregarAlCarrito(x.clave, x.variantes[0].id, '40', 2); }, NOMBRE);
  const carritoAntes = await tienda.pagina.evaluate(() => JSON.parse(localStorage.getItem('gama-talla-carrito-v3')));
  const visto = await tienda.pagina.evaluate((n) => { const x = estado.productos.find((q) => q.nombre === n); return { clave: x.clave, variante: x.variantes[0].id, referencia: x.variantes[0].referencia }; }, NOMBRE);
  expect(visto, 'la identidad del carrito es la clave inmutable (el UUID para lo nuevo), no el código').toEqual({ clave: p.id, variante: v.id, referencia: v.codigo_variante });

  // Mayúsculas al escribir: se ven en mayúsculas, el cursor no salta y el valor REAL se normaliza al salir.
  const colorCampo = campoColor(page, 0);
  expect(await colorCampo.evaluate((n) => getComputedStyle(n).textTransform)).toBe('uppercase');
  await colorCampo.fill('negro ñandú');
  await colorCampo.press('Home');
  await colorCampo.press('ArrowRight');
  await colorCampo.pressSequentially('x');
  expect(await colorCampo.evaluate((n) => [n.value, n.selectionStart]), 'escribir en medio no mueve el cursor').toEqual(['nxegro ñandú', 2]);
  await colorCampo.fill('negro añil');
  await colorCampo.press('Tab');
  await expect(colorCampo).toHaveValue('NEGRO AÑIL');

  // Ambos códigos: sin prefijo GT, en minúsculas y con espacios exteriores; se normalizan.
  await campoCodigo(page).fill(' zap-ñu.162 ');
  await campoCodigo(page).press('Tab');
  await campoCodigoColor(page, 0).fill('col-negro/162');
  await campoCodigoColor(page, 0).press('Tab');
  await expect(campoCodigo(page)).toHaveValue('ZAP-ÑU.162');
  await expect(campoCodigoColor(page, 0)).toHaveValue('COL-NEGRO/162');
  for (const ancho of [390, 1440]) {
    await page.setViewportSize({ width: ancho, height: 900 });
    await campoCodigo(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(CAPTURAS, `editor-codigos-${browserName}-${ancho}.png`) });
  }
  const tallasAntes = await tallasDe([v.id]);
  await guardarCambios(page);
  await expect(resultado(page)).toContainText('Guardado.');
  await expect(resultado(page)).not.toContainText('Atención');
  const [fila] = await servicio('GET', `/rest/v1/productos?select=id,codigo_interno,clave_catalogo,variantes(id,codigo_variante,clave_catalogo,color,fotos(ruta,orden))&id=eq.${p.id}`);
  expect(fila).toMatchObject({ id: p.id, codigo_interno: 'ZAP-ÑU.162', clave_catalogo: p.id });
  expect(fila.variantes[0]).toMatchObject({ id: v.id, codigo_variante: 'COL-NEGRO/162', clave_catalogo: v.id, color: 'NEGRO AÑIL' });
  expect(fila.variantes[0].fotos.map((f) => f.ruta), 'las fotos siguen en sus rutas por UUID').toEqual(v.fotos.map((f) => f.ruta));
  expect(await tallasDe([v.id]), 'cambiar códigos no toca existencias, estados ni vigencias').toEqual(tallasAntes);
  const [historia] = await servicio('GET', `/rest/v1/historial?select=cambios,fila_anterior,fila_nueva&tabla=eq.productos&fila_id=eq.${p.id}&order=id.desc&limit=1`);
  expect(historia.cambios).toContain('codigo_interno');
  expect(historia.fila_anterior.codigo_interno).toBe(p.codigo_interno);

  // Encabezados y tablero con los códigos nuevos.
  await expect(page.locator('#editor-codigo')).toHaveText('ZAP-ÑU.162');
  await expect(color(page, 0).locator('.editor-variante-cabecera .codigo')).toHaveText('COL-NEGRO/162');
  await editor(page).getByRole('button', { name: 'Cerrar el editor' }).click();
  const enTablero = page.locator('.producto', { hasText: NOMBRE });
  await expect(enTablero.locator('.codigo').first()).toHaveText('ZAP-ÑU.162');
  await expect(enTablero).toContainText('COL-NEGRO/162');
  await expect(enTablero).toContainText('NEGRO AÑIL');

  // Tienda recargada: el MISMO carrito (línea, talla y cantidad) con la referencia nueva.
  await tienda.pagina.reload();
  await tienda.pagina.locator('article', { hasText: NOMBRE }).waitFor();
  expect(await tienda.pagina.evaluate(() => JSON.parse(localStorage.getItem('gama-talla-carrito-v3')))).toEqual(carritoAntes);
  expect(await tienda.pagina.evaluate(() => lineasComprables().map((l) => [l.talla, l.cantidad, l.variante.referencia]))).toEqual([['40', 2, 'COL-NEGRO/162']]);
  await tienda.pagina.locator('#boton-carrito').click();
  await expect(tienda.pagina.locator('#carrito .linea')).toHaveCount(1);
  await expect(tienda.pagina.locator('#carrito .linea-unitario')).toContainText('Ref. COL-NEGRO/162');
  await tienda.pagina.locator('#carrito-datos').click();
  await guardarDatosEnvio(tienda.pagina);
  await tienda.pagina.locator('#carrito-enviar').click();
  const mensaje = await tienda.pagina.evaluate(() => new URL(window.__abiertas.at(-1)).searchParams.get('text'));
  for (const parte of [`1. ${NOMBRE}`, `* Marca: ${MARCA}`, '* Color: NEGRO AÑIL', '* Referencia: COL-NEGRO/162', '* Talla EU: 40', '* Cantidad: 2']) expect(mensaje).toContain(parte);
  await tienda.pagina.keyboard.press('Escape');
  // Búsqueda por los códigos ACTUALES; ni el código anterior ni la clave técnica encuentran nada.
  for (const [texto, cuantas] of [['ZAP-ÑU.162', 1], ['col-negro/162', 1], [p.codigo_interno, 0], [p.id, 0]]) {
    await tienda.pagina.locator('#buscar').fill(texto);
    await expect(tienda.pagina.locator('article.tarjeta'), `búsqueda «${texto}»`).toHaveCount(cuantas);
  }
  await tienda.pagina.locator('#buscar').fill('ZAP-ÑU.162');
  await tienda.pagina.locator('article.tarjeta').getByRole('button', { name: /^Ver detalles de/ }).click();
  await expect(tienda.pagina.locator('#detalle-referencia')).toHaveText('COL-NEGRO/162');
  await tienda.pagina.screenshot({ path: path.join(CAPTURAS, `tienda-codigo-color-${browserName}.png`) });
  await tienda.contexto.close();
});

test('códigos: duplicados, conflicto entre editores y respuesta perdida; el formulario se conserva', async ({ page }) => {
  await abrirPanel(page);
  const a = await crearCompleta(page, `Primera ${sufijo}`, { conFotos: false });
  await editor(page).getByRole('button', { name: 'Cerrar el editor' }).click();
  const b = await crearCompleta(page, `Segunda ${sufijo}`, { conFotos: false });
  let llamadas = 0;
  let modo = 'normal';
  await page.route('**/rpc/fn_admin_guardar_producto*', async (r) => {
    llamadas += 1;
    if (modo === 'respuesta-perdida') { await r.fetch(); return r.abort('internetdisconnected'); }
    return r.continue();
  });

  // Duplicado que el panel ya conoce: aviso claro, sin enviar nada.
  await campoCodigo(page).fill(a.codigo_interno.toLowerCase());
  await guardarCambios(page);
  await expect(page.locator('#editor-error')).toContainText(`El código ${a.codigo_interno} ya lo usa la zapatilla «${`Primera ${sufijo}`.toUpperCase()}»`);
  await expect(campoCodigo(page)).toHaveAttribute('aria-invalid', 'true');
  // Dos colores con el mismo código.
  await campoCodigo(page).fill(b.codigo_interno);
  await editor(page).getByRole('button', { name: 'Agregar color' }).click();
  await rellenarColor(page, 1, { nombre: 'Blanco', precio: '1000' });
  await campoCodigoColor(page, 1).fill(b.variantes[0].codigo_variante.toLowerCase());
  await guardarCambios(page);
  await expect(page.locator('#editor-error')).toContainText(`Dos colores tienen el mismo código ${b.variantes[0].codigo_variante}`);
  expect(llamadas, 'los duplicados conocidos no se envían').toBe(0);

  // Duplicado que el panel no podía saber (otra cuenta lo tomó después): lo rechaza el servidor.
  await campoCodigoColor(page, 1).fill('');
  await servicio('PATCH', `/rest/v1/productos?id=eq.${a.id}`, { codigo_interno: `TOMADO-${b.id.slice(0, 6)}`.toUpperCase() });
  await campoCodigo(page).fill(`tomado-${b.id.slice(0, 6)}`);
  await guardarCambios(page);
  await expect(page.locator('#editor-error')).toContainText(`ya lo usa la zapatilla «${`Primera ${sufijo}`.toUpperCase()}»`);
  await expect(page.locator('#editor-error')).toContainText('No se guardó nada');
  expect(llamadas).toBe(1);
  await expect(campoCodigo(page)).toHaveValue(`TOMADO-${b.id.slice(0, 6)}`.toUpperCase());
  await expect(campoColor(page, 1)).toHaveValue('BLANCO');
  let [fila] = (await productosDePrueba()).filter((x) => x.id === b.id);
  expect(fila).toMatchObject({ codigo_interno: b.codigo_interno, version: b.version });
  expect(fila.variantes, 'el rechazo no guardó el color nuevo').toHaveLength(1);

  // Conflicto: otra edición cambia el código mientras este formulario sigue abierto.
  await servicio('PATCH', `/rest/v1/productos?id=eq.${b.id}`, { codigo_interno: 'OTRO-EDITOR-162', version: b.version + 1 });
  await campoCodigo(page).fill('mio-162');
  await guardarCambios(page);
  await expect(resultado(page)).toContainText('Otra edición de esta zapatilla se guardó antes que la tuya.');
  await expect(resultado(page)).toContainText('tus datos siguen en el formulario');
  await expect(campoCodigo(page)).toHaveValue('MIO-162');
  [fila] = (await productosDePrueba()).filter((x) => x.id === b.id);
  expect(fila.codigo_interno, 'no se sobrescribe la edición más reciente').toBe('OTRO-EDITOR-162');
  await resultado(page).getByRole('button', { name: 'Cargar la versión actual' }).click();
  await expect(campoCodigo(page)).toHaveValue('OTRO-EDITOR-162');

  // Respuesta perdida con un cambio de código: se comprueba por la operación, una sola vez.
  modo = 'respuesta-perdida';
  await campoCodigo(page).fill('perdido-162');
  await guardarCambios(page);
  await expect(resultado(page)).toContainText('Guardado (comprobado con el identificador de esta operación).');
  [fila] = (await productosDePrueba()).filter((x) => x.id === b.id);
  expect(fila).toMatchObject({ codigo_interno: 'PERDIDO-162', version: b.version + 2 });
  await expect(page.locator('#editor-codigo')).toHaveText('PERDIDO-162');
});

test('servidor con el esquema anterior: los códigos no se presentan como guardados', async ({ page, browser, browserName }) => {
  // (a) Falta la migración (la columna clave_catalogo no existe): códigos de solo lectura y aviso.
  const sinColumna = (url) => url.pathname.endsWith('/rest/v1/productos') && url.searchParams.get('select') === 'clave_catalogo';
  await page.route(sinColumna, (r) => r.fulfill({ status: 400, contentType: 'application/json',
    body: JSON.stringify({ code: '42703', message: 'column productos.clave_catalogo does not exist', details: null, hint: null }) }));
  // Coherente con ese esquema: la función de guardado antigua no anuncia «codigos_editables».
  await page.route('**/rpc/fn_admin_guardar_producto*', async (r) => {
    const respuesta = await r.fetch();
    const json = await respuesta.json();
    if (json && typeof json === 'object') delete json.codigos_editables;
    await r.fulfill({ response: respuesta, json });
  });
  await abrirPanel(page);
  const p = await crearCompleta(page, `Esquema ${sufijo}`, { conFotos: false });
  await expect(page.locator('#ed-codigos-aviso')).toBeVisible();
  await expect(page.locator('#ed-codigos-aviso')).toContainText('falta aplicar la migración 20261108030000');
  await expect(campoCodigo(page)).toHaveJSProperty('readOnly', true);
  await expect(campoCodigoColor(page, 0)).toHaveJSProperty('readOnly', true);
  const cuerpos = [];
  page.on('request', (r) => { if (r.url().includes('/rpc/fn_admin_guardar_producto')) cuerpos.push(JSON.parse(r.postData())); });
  await color(page, 0).getByLabel('Precio actual (COP)').fill('199000');
  await guardarCambios(page);
  await expect(resultado(page)).toContainText('Guardado.');
  expect(cuerpos.at(-1).p_datos, 'sin códigos en la petición').not.toHaveProperty('codigo_interno');
  expect(cuerpos.at(-1).p_datos.variantes[0]).not.toHaveProperty('codigo_variante');
  await page.screenshot({ path: path.join(CAPTURAS, `editor-esquema-anterior-${browserName}.png`) });

  // (b) Una función de guardado antigua que IGNORA los códigos: el panel lo detecta al releer.
  const contexto = await browser.newContext({ locale: 'es-CO', viewport: { width: 1280, height: 900 } });
  const otra = await contexto.newPage();
  await otra.route('**/rpc/fn_admin_guardar_producto*', async (r) => {
    const cuerpo = JSON.parse(r.request().postData());
    delete cuerpo.p_datos.codigo_interno;
    for (const x of cuerpo.p_datos.variantes || []) delete x.codigo_variante;
    const respuesta = await r.fetch({ postData: JSON.stringify(cuerpo) });
    const json = await respuesta.json();
    delete json.codigos_editables;
    await r.fulfill({ response: respuesta, json });
  });
  await abrirPanel(otra);
  await otra.locator('.producto', { hasText: `Esquema ${sufijo}` }).getByRole('button', { name: /^Editar/ }).click();
  await expect(campoCodigo(otra)).toHaveJSProperty('readOnly', false);
  await campoCodigo(otra).fill('nuevo-esquema');
  await guardarCambios(otra);
  await expect(resultado(otra)).toContainText('Atención: el código no cambió (zapatilla NUEVO-ESQUEMA)');
  await expect(resultado(otra)).toContainText('falta aplicar la migración 20261108030000');
  await expect(resultado(otra)).not.toContainText('Guardado. La zapatilla sigue oculta');
  const [fila] = (await productosDePrueba()).filter((x) => x.id === p.id);
  expect(fila.codigo_interno).toBe(p.codigo_interno);
  await expect(campoCodigo(otra)).toHaveValue(p.codigo_interno);
  await expect(campoCodigo(otra)).toHaveJSProperty('readOnly', true);
  await contexto.close();
});

test('opciones de la guía y casillas: control y texto juntos, pulsables por la etiqueta y con teclado', async ({ page, browserName }) => {
  await abrirPanel(page);
  await page.getByRole('button', { name: 'Agregar zapatilla' }).first().click();
  const grupo = editor(page).getByRole('group', { name: 'Tabla de la guía de tallas' });
  await expect(grupo).toBeVisible();
  for (const ancho of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width: ancho, height: 900 });
    await grupo.scrollIntoViewIfNeeded();
    const medidas = await editor(page).evaluate((e) => [...e.querySelectorAll('.editor-opciones .casilla, .casillas .casilla, .editor-variante .casilla')].map((l) => {
      const input = l.querySelector('input').getBoundingClientRect();
      const texto = l.querySelector('span').getBoundingClientRect();
      const r = l.getBoundingClientRect();
      return { texto: l.textContent.trim(), ancho: input.width, alto: input.height, etiqueta: r.height, hueco: texto.left - input.right, dentro: r.right <= document.documentElement.clientWidth + 1 };
    }));
    expect(medidas.length).toBeGreaterThanOrEqual(6);
    for (const m of medidas) {
      expect(m.ancho, `${ancho}px · ${m.texto}: control sin estirar`).toBeLessThanOrEqual(24);
      expect(m.alto, `${ancho}px · ${m.texto}`).toBeLessThanOrEqual(24);
      expect(m.etiqueta, `${ancho}px · ${m.texto}: superficie táctil`).toBeGreaterThanOrEqual(40);
      expect(m.hueco, `${ancho}px · ${m.texto}: texto junto al control`).toBeGreaterThanOrEqual(0);
      expect(m.hueco, `${ancho}px · ${m.texto}: texto junto al control`).toBeLessThanOrEqual(16);
      expect(m.dentro, `${ancho}px · ${m.texto}: sin desborde`).toBe(true);
    }
    const orden = await editor(page).locator('.editor-orden').boundingBox();
    expect(orden.width, `${ancho}px: «Orden en el catálogo» sin estirarse`).toBeLessThanOrEqual(16 * 16 + 1);
    const r = await revisarEditor(page);
    expect(r.desborde, `${ancho}px`).toBe(0);
    await grupo.screenshot({ path: path.join(CAPTURAS, `guia-opciones-${browserName}-${ancho}.png`) });
  }
  // Toda la etiqueta es pulsable (también el texto) y el teclado cambia la opción.
  await grupo.getByText('Mujer', { exact: true }).click();
  await expect(grupo.getByRole('radio', { name: 'Mujer', exact: true })).toBeChecked();
  await grupo.getByRole('radio', { name: 'Mujer', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(grupo.getByRole('radio', { name: 'Hombre', exact: true })).toBeChecked();
  await page.keyboard.press('ArrowRight');
  await expect(grupo.getByRole('radio', { name: 'Mujer', exact: true })).toBeChecked();
  await editor(page).getByText('Destacada', { exact: true }).click();
  await expect(editor(page).getByRole('checkbox', { name: 'Destacada' })).toBeChecked();
  // El valor se guarda igual que antes.
  await rellenarModelo(page, { nombre: `Guía ${sufijo}` });
  await rellenarColor(page, 0, { nombre: 'Negro', precio: '100000' });
  await editor(page).getByRole('button', { name: 'Guardar oculta' }).click();
  await expect(resultado(page)).toContainText('Guardado.');
  const [fila] = await servicio('GET', `/rest/v1/productos?select=segmento,destacado&marca=eq.${encodeURIComponent(MARCA)}&nombre=eq.${encodeURIComponent(`Guía ${sufijo}`.toUpperCase())}`);
  expect(fila).toEqual({ segmento: 'mujer', destacado: true });
});

test('ingreso oscuro: legible, con foco visible, solo en el ingreso; el flujo no cambia', async ({ page, browserName }) => {
  await configurarPanel(page);
  await page.goto(PANEL);
  await expect(page.locator('#vista-ingreso')).toBeVisible();
  const colores = await page.evaluate(() => {
    const c = (sel, prop) => getComputedStyle(document.querySelector(sel))[prop];
    return { fondo: c('#vista-ingreso', 'backgroundColor'), cuerpo: c('body', 'backgroundColor'), formulario: c('#formulario-ingreso', 'backgroundColor'),
             campo: c('#correo', 'backgroundColor'), texto: c('#correo', 'color'), boton: c('#boton-ingresar', 'backgroundColor'), botonTexto: c('#boton-ingresar', 'color'),
             esquema: c('#vista-ingreso', 'colorScheme'), etiqueta: c('#boton-ingresar .boton-texto', 'color') };
  });
  expect(colores).toMatchObject({ fondo: 'rgb(11, 11, 11)', cuerpo: 'rgb(11, 11, 11)', formulario: 'rgb(21, 21, 21)', campo: 'rgb(14, 14, 14)',
    texto: 'rgb(243, 243, 240)', boton: 'rgb(243, 243, 240)', botonTexto: 'rgb(11, 11, 11)', esquema: 'dark', etiqueta: 'rgb(11, 11, 11)' });
  await expect(page.locator('#boton-ingresar')).toHaveText('Ingresar');
  // Foco visible.
  await page.locator('#correo').focus();
  const foco = await page.locator('#correo').evaluate((n) => getComputedStyle(n).outlineStyle);
  expect(foco).not.toBe('none');
  // Error genérico, legible sobre el fondo oscuro; Enter envía; mostrar y ocultar.
  await page.getByLabel('Correo').fill(admin.correo);
  await page.getByLabel('Contraseña', { exact: true }).fill('clave-equivocada-ficticia');
  await page.getByRole('button', { name: 'Mostrar contraseña' }).click();
  await expect(page.locator('#clave')).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Ocultar contraseña' }).click();
  await expect(page.locator('#clave')).toHaveAttribute('type', 'password');
  await page.locator('#clave').press('Enter');
  await expect(page.locator('#error-ingreso')).toHaveText('El correo o la contraseña no son correctos.');
  expect(await page.locator('#error-ingreso').evaluate((n) => getComputedStyle(n).color)).toBe('rgb(255, 194, 194)');
  for (const ancho of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width: ancho, height: ancho < 768 ? 800 : 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${ancho}px sin desborde`).toBe(true);
    await page.screenshot({ path: path.join(CAPTURAS, `ingreso-oscuro-${browserName}-${ancho}.png`) });
  }
  // Ingreso correcto: el tablero conserva su tema claro.
  await page.getByLabel('Contraseña', { exact: true }).fill(admin.clave);
  await page.locator('#clave').press('Enter');
  await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(243, 243, 240)');
  await page.getByRole('button', { name: 'Cerrar sesión' }).first().click();
  await expect(page.locator('#aviso-ingreso')).toHaveText('Cerraste la sesión en este dispositivo.');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(11, 11, 11)');
});

// =====================================================================
// Etapa 16.3 · Público (Hombre / Dama), muestra de color y panel en celular
// =====================================================================
const radioPublico = (page, texto) => editor(page).getByRole('group', { name: 'Público en la tienda' }).getByRole('radio', { name: texto, exact: true });
const campoMuestra = (page, n) => color(page, n).getByRole('textbox', { name: 'Muestra del color (opcional)' });

test('público y muestra: se guardan, se ven en la tienda y lo existente queda sin clasificar', async ({ page, browser, browserName }) => {
  await abrirPanel(page);
  const p = await crearCompleta(page, `Público ${sufijo}`);
  const NOMBRE = `Público ${sufijo}`.toUpperCase();
  let [fila] = await servicio('GET', `/rest/v1/productos?select=publico,segmento,variantes(muestra_color)&id=eq.${p.id}`);
  expect(fila, 'sin elegir nada: sin clasificar y sin muestra').toEqual({ publico: null, segmento: null, variantes: [{ muestra_color: null }] });
  await editor(page).getByRole('button', { name: 'Publicar' }).click();
  await expect(resultado(page)).toContainText('Publicada');
  // Sin clasificar: la tienda no pone etiqueta.
  let tienda = await abrirTienda(browser);
  await tienda.pagina.locator('article', { hasText: NOMBRE }).waitFor();
  await expect(tienda.pagina.locator('article', { hasText: NOMBRE }).locator('.tarjeta-publico')).toHaveCount(0);
  await tienda.contexto.close();

  // Dama + muestra (escrita y con el selector de color).
  await expect(editor(page).getByRole('group', { name: 'Público en la tienda' })).toContainText('No cambia la tabla de la guía de tallas');
  await radioPublico(page, 'Dama').check();
  await expect(editor(page).getByRole('button', { name: 'Dejar sin asignar' })).toBeVisible();
  await campoMuestra(page, 0).fill('#12');
  await editor(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.locator('#editor-error')).toContainText('debe ser un color hexadecimal');
  await color(page, 0).locator('input[type="color"]').fill('#e8dcc8');
  await expect(campoMuestra(page, 0)).toHaveValue('#E8DCC8');
  expect(await color(page, 0).locator('.editor-muestra-vista').evaluate((n) => n.style.getPropertyValue('--muestra'))).toBe('#e8dcc8');
  for (const ancho of [390, 1440]) {
    await page.setViewportSize({ width: ancho, height: 900 });
    await editor(page).getByRole('group', { name: 'Público en la tienda' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(CAPTURAS, `editor-publico-${browserName}-${ancho}.png`) });
    await campoMuestra(page, 0).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(CAPTURAS, `editor-muestra-${browserName}-${ancho}.png`) });
  }
  const tallasAntes = await tallasDe([p.variantes[0].id]);
  await editor(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(resultado(page)).toContainText('Guardado.');
  await expect(resultado(page)).not.toContainText('Atención');
  [fila] = await servicio('GET', `/rest/v1/productos?select=publico,segmento,variantes(muestra_color)&id=eq.${p.id}`);
  expect(fila, 'el público no cambia la tabla de la guía').toEqual({ publico: 'dama', segmento: null, variantes: [{ muestra_color: '#e8dcc8' }] });
  expect(await tallasDe([p.variantes[0].id]), 'no toca existencias ni vigencias').toEqual(tallasAntes);
  tienda = await abrirTienda(browser);
  const tarjeta = tienda.pagina.locator('article', { hasText: NOMBRE });
  await tarjeta.waitFor();
  await expect(tarjeta.locator('.tarjeta-publico')).toHaveText(' · Dama');
  await tarjeta.getByRole('button', { name: /^Ver detalles de/ }).click();
  await expect(tienda.pagina.locator('#modal-producto .detalle-publico')).toHaveText(' · Dama');
  expect(await tienda.pagina.locator('#modal-producto .muestra-unica').evaluate((n) => n.style.getPropertyValue('--muestra'))).toBe('#e8dcc8');
  await tienda.pagina.screenshot({ path: path.join(CAPTURAS, `tienda-publico-dama-${browserName}.png`) });
  await tienda.contexto.close();

  // Hombre → «Caballero»; luego, sin asignar.
  await radioPublico(page, 'Hombre').check();
  await editor(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(resultado(page)).toContainText('Guardado.');
  tienda = await abrirTienda(browser);
  await expect(tienda.pagina.locator('article', { hasText: NOMBRE }).locator('.tarjeta-publico')).toHaveText(' · Caballero');
  await tienda.contexto.close();
  await editor(page).getByRole('button', { name: 'Dejar sin asignar' }).click();
  await expect(radioPublico(page, 'Hombre')).not.toBeChecked();
  await editor(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(resultado(page)).toContainText('Guardado.');
  [fila] = await servicio('GET', `/rest/v1/productos?select=publico&id=eq.${p.id}`);
  expect(fila.publico).toBeNull();
});

test('esquema anterior a 16.3: opciones bloqueadas con aviso, y nada se presenta como guardado', async ({ page, browser, browserName }) => {
  // (a) Falta la migración: la columna «publico» no existe.
  const sinColumna = (url) => url.pathname.endsWith('/rest/v1/productos') && url.searchParams.get('select') === 'publico';
  await page.route(sinColumna, (r) => r.fulfill({ status: 400, contentType: 'application/json',
    body: JSON.stringify({ code: '42703', message: 'column productos.publico does not exist', details: null, hint: null }) }));
  await page.route('**/rpc/fn_admin_guardar_producto*', async (r) => {
    const respuesta = await r.fetch();
    const json = await respuesta.json();
    if (json && typeof json === 'object') delete json.publico_y_muestras;
    await r.fulfill({ response: respuesta, json });
  });
  await abrirPanel(page);
  await page.getByRole('button', { name: 'Agregar zapatilla' }).first().click();
  await expect(page.locator('#ed-publico-aviso')).toBeVisible();
  await expect(page.locator('#ed-publico-aviso')).toContainText('falta aplicar la migración 20261108040000');
  await expect(radioPublico(page, 'Dama')).toBeDisabled();
  await expect(campoMuestra(page, 0)).toHaveJSProperty('readOnly', true);
  const cuerpos = [];
  page.on('request', (r) => { if (r.url().includes('/rpc/fn_admin_guardar_producto')) cuerpos.push(JSON.parse(r.postData())); });
  await rellenarModelo(page, { nombre: `Esquema 163 ${sufijo}` });
  await rellenarColor(page, 0, { nombre: 'Negro', precio: '100000' });
  await editor(page).getByRole('button', { name: 'Guardar oculta' }).click();
  await expect(resultado(page)).toContainText('Guardado.');
  expect(cuerpos.at(-1).p_datos, 'sin «publico» en la petición').not.toHaveProperty('publico');
  expect(cuerpos.at(-1).p_datos.variantes[0]).not.toHaveProperty('muestra_color');
  await page.screenshot({ path: path.join(CAPTURAS, `editor-publico-esquema-anterior-${browserName}.png`) });
  const [p] = (await productosDePrueba()).filter((x) => x.nombre === `Esquema 163 ${sufijo}`.toUpperCase());

  // (b) Una función de guardado antigua que IGNORA los campos nuevos: el panel lo detecta al releer.
  const contexto = await browser.newContext({ locale: 'es-CO', viewport: { width: 1280, height: 900 } });
  const otra = await contexto.newPage();
  await otra.route('**/rpc/fn_admin_guardar_producto*', async (r) => {
    const cuerpo = JSON.parse(r.request().postData());
    delete cuerpo.p_datos.publico;
    for (const x of cuerpo.p_datos.variantes || []) delete x.muestra_color;
    const respuesta = await r.fetch({ postData: JSON.stringify(cuerpo) });
    const json = await respuesta.json();
    delete json.publico_y_muestras;
    await r.fulfill({ response: respuesta, json });
  });
  await abrirPanel(otra);
  await otra.locator('.producto', { hasText: `Esquema 163 ${sufijo}` }).getByRole('button', { name: /^Editar/ }).click();
  await radioPublico(otra, 'Dama').check();
  await otra.locator('#editor').getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(otra.locator('#editor-resultado')).toContainText('Atención: el público y las muestras de color no se guardaron');
  await expect(otra.locator('#ed-publico-aviso')).toBeVisible();
  await expect(radioPublico(otra, 'Dama')).toBeDisabled();
  const [fila] = await servicio('GET', `/rest/v1/productos?select=publico&id=eq.${p.id}`);
  expect(fila.publico).toBeNull();
  await contexto.close();
});

test('panel en celular: cabecera, filtros y guía plegables, selección de tallas y edición completa en pantalla baja', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abrirPanel(page);
  // Con el catálogo vacío, «Agregar zapatilla» ya está a la vista.
  await expect(page.locator('#boton-nuevo')).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  const p = await crearCompleta(page, `Celular ${sufijo}`, { conFotos: false });
  await editor(page).getByRole('button', { name: 'Cerrar el editor' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  // Orden: título y resumen; «Agregar zapatilla» a lo ancho; Historial y Actualizar juntos debajo.
  const caja = await page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    return { titulo: r('.tablero-titulo'), resumen: r('#tablero-resumen'), nuevo: r('#boton-nuevo'), historial: r('#boton-historial'), actualizar: r('#boton-actualizar'),
             buscador: r('#buscar'), cabecera: r('.tablero-cabecera'), ancho: document.documentElement.clientWidth, desborde: document.documentElement.scrollWidth - innerWidth };
  });
  expect(caja.resumen.top).toBeGreaterThan(caja.titulo.top);
  expect(caja.nuevo.top).toBeGreaterThan(caja.resumen.top);
  expect(Math.round(caja.nuevo.width)).toBe(Math.round(caja.cabecera.width));
  expect(Math.abs(caja.historial.top - caja.actualizar.top)).toBeLessThan(2);
  expect(caja.historial.top).toBeGreaterThan(caja.nuevo.top);
  expect(Math.round(caja.buscador.width)).toBe(Math.round(caja.cabecera.width));
  expect(caja.desborde).toBe(0);
  await expect(page.getByLabel('Buscar por código interno, referencia, marca o modelo'), 'el nombre accesible sigue completo').toBeVisible();
  // Filtros plegables, con el estado del filtro elegido en su resumen.
  await expect(page.locator('#filtros')).toBeHidden();
  await expect(page.locator('#filtros-estado')).toHaveText('Todas (1)');
  await page.locator('#plegable-filtros > summary').click();
  // La zapatilla está oculta (sin publicar): la encuentra «Con elementos ocultos».
  await page.locator('#filtros').getByRole('button', { name: /^Con elementos ocultos/ }).click();
  await expect(page.locator('#filtros-estado')).toHaveText('Con elementos ocultos (1)');
  // Guía de estados plegable.
  await expect(page.locator('#leyenda')).toBeHidden();
  await page.locator('#plegable-leyenda > summary').click();
  await expect(page.locator('#leyenda')).toBeVisible();
  await page.screenshot({ path: path.join(CAPTURAS, `tablero-celular-${browserName}-390.png`), fullPage: true });
  // Selección de tallas: sigue funcionando y aparece la barra de acciones.
  const t40 = (await tallasDe(p.variantes.map((v) => v.id))).find((t) => t.talla === '40');
  await page.locator(`.talla[data-talla-id="${t40.id}"]`).click();
  await expect(page.locator('#barra-acciones')).toBeVisible();
  await page.locator('#barra-acciones').getByRole('button', { name: 'Quitar selección' }).click();
  await expect(page.locator('#barra-acciones')).toBeHidden();
  // Edición completa en una pantalla estrecha y baja.
  await page.setViewportSize({ width: 360, height: 560 });
  await page.locator('.producto', { hasText: `Celular ${sufijo}` }).getByRole('button', { name: /^Editar/ }).click();
  await radioPublico(page, 'Hombre').check();
  await campoMuestra(page, 0).fill('#141414');
  await color(page, 0).getByLabel('Precio actual (COP)').fill('275000');
  await editor(page).getByRole('combobox', { name: 'Categoría (obligatorio)', exact: true }).fill('Casual');
  const r = await revisarEditor(page);
  expect(r.desborde, '360×560: sin desplazamiento horizontal').toBe(0);
  expect(r.fuera).toBe(0);
  const guardar = editor(page).getByRole('button', { name: 'Guardar cambios' });
  const caja2 = await guardar.boundingBox();
  expect(caja2.y + caja2.height, 'el botón de guardar queda a la vista').toBeLessThanOrEqual(560);
  await page.screenshot({ path: path.join(CAPTURAS, `editor-celular-bajo-${browserName}-360x560.png`) });
  await guardar.click();
  await expect(resultado(page)).toContainText('Guardado.');
  const [fila] = await servicio('GET', `/rest/v1/productos?select=publico,categoria,variantes(precio,muestra_color)&id=eq.${p.id}`);
  expect(fila).toEqual({ publico: 'hombre', categoria: 'CASUAL', variantes: [{ precio: 275000, muestra_color: '#141414' }] });
  await editor(page).getByRole('button', { name: 'Cerrar el editor' }).click();
  // En escritorio, los plegables se abren solos y su resumen no se ve (el tablero queda como antes).
  for (const ancho of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width: ancho, height: 900 });
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${ancho}px sin desborde`).toBe(true);
    await page.screenshot({ path: path.join(CAPTURAS, `tablero-${browserName}-${ancho}-16-3.png`) });
  }
  await expect(page.locator('#plegable-filtros > summary')).toBeHidden();
  await expect(page.locator('#filtros')).toBeVisible();
  await expect(page.locator('#leyenda')).toBeVisible();
});
