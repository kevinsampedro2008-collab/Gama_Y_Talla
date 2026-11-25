// @ts-check
/* Etapa 23 · Dos entregas de días distintos: la primera se importa, se corrige, se guarda y se recuerda; la
 * segunda (documentos y fotos en otro orden) se reconoce sin duplicar nada y solo aplica lo elegido.
 *
 * SOLO contra el Supabase LOCAL y el entorno aislado. PDF sintéticos y modelos ficticios « P23».
 *
 *   SITIO=http://127.0.0.1:8770 npx playwright test tests/etapa23 --workers=1
 */
import { test, expect } from '@playwright/test';
import {
  crearUsuario, borrarUsuario, hacerAdmin, quitarAdmin, servicio, entrarAlPanel, abrirImportador, importador, ficha, fichas, color, recargar, esperarGuardadoLocal,
  elegirCategoria, seccionPdf, tarjetaPdf, verTodas, prepararFotos20, pegarVarias, MENSAJE,
  limpiar23, productos23, producto23, crearCatalogo23, entrega, novedades, novedad, resumenNov, filtro, ver, aplicar, avisoNov, operacion, importarEntrega, elegirProveedor, elegirModo, vincular,
  memoria, contarEscrituras, capturar23, abrirLoteNuevo, pie, propios
} from './ayudas23.js';

test.describe.configure({ mode: 'serial' });
test.setTimeout(240000);
test.use({ actionTimeout: 15000 });

let admin;
test.beforeAll(async () => { admin = await crearUsuario(`etapa23-${Date.now()}@gamaytalla.test`); await hacerAdmin(admin.id); });
test.afterAll(async () => { await limpiar23(); await quitarAdmin(admin.id); await borrarUsuario(admin.id); });
test.beforeEach(async () => { await limpiar23(); });

const DIA1 = [
  { foto: 301, lineas: ['NIKE WINFLO P23 HOMBRE NEGRO', 'Tallas EU 40 al 42'], venta: '$134.900', coste: ['PRECIO $95.000'] },
  { foto: 302, lineas: ['NIKE WINFLO P23 HOMBRE AZUL', 'Tallas EU 40 al 42'], venta: '$134.900', coste: ['PRECIO $95.000'] },
  { foto: 303, lineas: ['ADIDAS SAMBA P23 DAMA BLANCO', 'EU 36 al 38'], venta: '$129.900', coste: ['$90.000'] }
];
// Otro orden, un precio y unas tallas distintos, un color nuevo, una zapatilla nueva y una ausencia de talla.
const DIA2 = [
  { foto: 303, lineas: ['ADIDAS SAMBA P23 DAMA BLANCO', 'EU 36 al 38'], venta: '$129.900', coste: ['$90.000'] },
  { foto: 304, lineas: ['REEBOK CLUB P23 DAMA ROSADO', 'EU 36 al 39'], venta: '$119.900', coste: ['$80.000'] },
  { foto: 302, lineas: ['NIKE WINFLO P23 HOMBRE AZUL', 'Tallas EU 40 al 43'], venta: '$134.900', coste: ['PRECIO $99.000'] },
  { foto: 305, lineas: ['NIKE WINFLO P23 HOMBRE ROJO', 'Tallas EU 40 al 41'], venta: '$134.900', coste: ['PRECIO $95.000'] },
  { foto: 301, lineas: ['NIKE WINFLO P23 HOMBRE NEGRO', 'Tallas EU 40 al 41'], venta: '$139.900', coste: ['PRECIO $95.000', 'POR CAJA $85.000'] }
];
const FECHA1 = 'Viernes 20 de Noviembre de 2026';
const FECHA2 = 'Martes 24 de Noviembre de 2026';

async function primeraEntrega(page) {
  await importarEntrega(page, entrega('dia1', FECHA1, DIA1));
  await elegirProveedor(page, 'Proveedor Uno');
  await expect(filtro(page, 'Nuevas zapatillas')).toHaveText('Nuevas zapatillas (3)');
  // La 2 es otro color de la 1 (como en la etapa 21).
  await tarjetaPdf(page, 2).getByRole('radio', { name: 'Otro color de la misma zapatilla que la tarjeta…' }).check();
  await seccionPdf(page).getByRole('button', { name: /^Añadir al lote \(2 fichas\)/ }).click();
  await expect(fichas(page)).toHaveCount(2);
  await expect(importador(page).getByText('Optimizando…')).toHaveCount(0, { timeout: 60000 });
  // Correcciones: nombre del modelo y de los colores (se conservan después).
  await ficha(page, 0).getByRole('textbox', { name: /^Modelo/ }).fill('WINFLO 10 P23');
  await color(ficha(page, 0), 0).getByRole('textbox', { name: /^Color \(obligatorio\)/ }).fill('NEGRO MATE');
  await elegirCategoria(ficha(page, 0), 'RUNNING');
  await elegirCategoria(ficha(page, 1), 'URBANAS');
  await ver(page, 'Todas');
  await novedades(page).getByRole('button', { name: 'Recordar las fotos de las zapatillas nuevas del lote (3)' }).click();
  await expect(color(ficha(page, 0), 0).locator('.importador-nov-recuerdo')).toContainText('Relación pendiente: al crearse la zapatilla se recordará 1 fotografía para «Proveedor Uno»');
  // Todavía no se guardó: no hay ninguna relación en la memoria.
  expect((await memoria(page)).asociaciones).toHaveLength(0);
  await importador(page).getByRole('button', { name: /^Guardar lote como oculto/ }).click();
  await expect(ficha(page, 0)).toContainText('Guardada oculta', { timeout: 60000 });
  await expect(ficha(page, 1)).toContainText('Se recordó 1 fotografía');
}

test('dos entregas: la segunda reconoce, no duplica y aplica solo lo elegido', async ({ page, browserName }) => {
  const problemas = await entrarAlPanel(page, admin);
  const escrituras = contarEscrituras(page);
  await abrirImportador(page);
  await primeraEntrega(page);
  expect(escrituras.guardar).toBe(2);
  let m = await memoria(page);
  expect([m.version, m.proveedores.length, m.asociaciones.length, m.historial.length]).toEqual([2, 1, 3, 3]);
  expect(m.historial.every((h) => h.dato.aplicado.length === 1 && h.dato.fecha === '2026-11-20')).toBe(true);
  // La memoria no guarda fotos ni PDF: solo huellas y datos.
  expect(JSON.stringify(m).length).toBeLessThan(20000);

  // Entre las dos entregas el catálogo sigue su vida: una talla confirmada, otra agotada y otra desactivada;
  // el color se renombra y el producto se publica.
  const antes = await producto23('WINFLO 10 P23');
  const [negro, azul] = antes.variantes;
  const talla = (v, t) => v.tallas.find((x) => x.talla === t);
  await servicio('PATCH', `/rest/v1/tallas?id=eq.${talla(negro, '40').id}`, { estado: 'CONFIRMADA', vigencia_desde: new Date().toISOString() });
  await servicio('PATCH', `/rest/v1/tallas?id=eq.${talla(negro, '41').id}`, { estado: 'AGOTADA', vigencia_desde: null });
  await servicio('PATCH', `/rest/v1/tallas?id=eq.${talla(azul, '42').id}`, { activa: false });
  await servicio('PATCH', `/rest/v1/variantes?id=eq.${azul.id}`, { color: 'AZUL NOCHE' });
  await servicio('PATCH', `/rest/v1/productos?id=eq.${antes.id}`, { activo: true, descripcion: 'Texto corregido', destacado: true });
  await recargar(page, problemas, browserName);
  const base = await productos23();

  await abrirLoteNuevo(page);
  const [venta2, precios2] = entrega('dia2', FECHA2, DIA2);
  await importarEntrega(page, [precios2, venta2]); // documentos en otro orden
  await elegirProveedor(page, 'Proveedor Uno');
  await expect(resumenNov(page)).toHaveText('5 tarjetas del documento. Corresponden a 2 zapatillas y 3 colores que ya tienes (varias fotografías pueden ser del mismo color).');
  await expect(filtro(page, 'Todas')).toHaveText('Todas (5)');
  await expect(filtro(page, 'Nuevas zapatillas')).toHaveText('Nuevas zapatillas (2)');
  await expect(filtro(page, 'Cambios de precio')).toHaveText('Cambios de precio (2)');
  await expect(filtro(page, 'Cambios de tallas')).toHaveText('Cambios de tallas (2)'); // una que se puede añadir y una que se deja de anunciar
  await expect(filtro(page, 'Sin cambios')).toHaveText('Sin cambios (1)');
  await ver(page, 'Todas');
  // Reconocidas por su identidad, con los nombres ACTUALES del catálogo (corregidos después).
  await expect(novedad(page, 5)).toContainText('NIKE WINFLO 10 P23 · NEGRO MATE');
  await expect(novedad(page, 3)).toContainText('NIKE WINFLO 10 P23 · AZUL NOCHE');
  await expect(novedad(page, 5)).toContainText(negro.codigo_variante);
  await expect(novedad(page, 1)).toContainText('ADIDAS SAMBA P23 · BLANCO');
  // No se ofrecen como fichas nuevas.
  await verTodas(page);
  await expect(tarjetaPdf(page, 5).getByRole('checkbox', { name: 'Añadir al lote' })).not.toBeChecked();
  await expect(tarjetaPdf(page, 5)).toContainText('En tu inventario: NIKE WINFLO 10 P23 · NEGRO MATE');
  // Sin cambios: fuera de la selección. Nada seleccionado por omisión.
  await expect(novedad(page, 1).locator('.importador-nov-marcas')).toHaveText('Sin cambios');
  await expect(aplicar(page)).toHaveAttribute('aria-disabled', 'true');
  // Precios: coste con varios importes (se elige), venta sugerida y el precio propio, separados.
  await expect(novedad(page, 5)).toContainText('Último conocido: $ 95.000 (última entrega conocida: dia1-venta.pdf, 20 de noviembre de 2026). Hay importes condicionados o varios: elige cuál es el coste.');
  await expect(novedad(page, 5).getByRole('group', { name: 'Coste de Tarjeta 5' }).getByRole('radio', { checked: true })).toHaveCount(0);
  await novedad(page, 5).getByRole('radio', { name: '$ 85.000 (por caja), condicionado' }).click();
  await expect(novedad(page, 5)).toContainText('$ 95.000 (última entrega conocida: dia1-venta.pdf, 20 de noviembre de 2026) → $ 85.000. Tu precio de venta no cambia por esto.');
  await expect(novedad(page, 5).getByRole('radio', { name: 'Conservar $ 134.900' })).toBeChecked();
  await novedad(page, 5).getByRole('radio', { name: 'Usar la venta sugerida $ 139.900' }).click();
  await expect(novedad(page, 5).locator('.importador-nov-efecto')).toContainText('Se modificará: precio de venta $ 134.900 → $ 139.900.');
  // Una talla que deja de mencionarse se conserva.
  await expect(novedad(page, 5)).toContainText('Esta entrega ya no menciona 42. Se conserva en el catálogo; no se desactivó nada.');
  // Tallas nuevas y desactivadas; el cambio de coste no cambia el precio.
  await expect(novedad(page, 3)).toContainText('→ $ 99.000. Tu precio de venta no cambia por esto.');
  await expect(novedad(page, 3)).toContainText('Mencionadas pero desactivadas en tu catálogo (no se activan): 42.');
  await novedad(page, 3).getByRole('checkbox', { name: 'Añadir 43' }).click();
  // Color nuevo de una zapatilla existente y publicada: desactivado si no se dice otra cosa.
  await elegirModo(novedad(page, 4), 'Añadir un color a una zapatilla existente');
  await novedad(page, 4).getByRole('searchbox', { name: /^Buscar la zapatilla/ }).fill('winflo 10');
  await novedad(page, 4).getByRole('button', { name: /^Elegir NIKE WINFLO 10 P23/ }).click();
  await novedad(page, 4).getByRole('button', { name: 'Confirmar y recordar esta relación' }).click();
  await expect(novedad(page, 4)).toContainText('Relación pendiente: se recordará cuando se confirme la creación del color.');
  await expect(novedad(page, 4).getByRole('radio', { name: /^Se crea desactivado/ })).toBeChecked();
  await expect(novedad(page, 4)).toContainText('Fija el precio de venta del color');
  await novedad(page, 4).getByRole('button', { name: 'Usar la venta sugerida $ 134.900' }).click();
  await expect(novedades(page).locator('#imp-nov-plan')).toContainText('Actualizar: 1 zapatilla existente (1 color nuevo, 1 precio, 1 talla nueva); cada una conserva su estado publicado u oculto.');
  await expect(novedades(page).locator('#imp-nov-plan')).toContainText('1 tarjeta nueva está sin añadir al lote');
  expect((await memoria(page)).asociaciones).toHaveLength(3); // la del color nuevo sigue pendiente
  await page.waitForTimeout(500);
  if (browserName === 'chromium') {
    await capturar23(page, 'novedades-1280.png', '#imp-nov-filtro-todas');
    await capturar23(page, 'diferencias-1280.png', `#${await novedad(page, 5).getAttribute('id')}`);
    await capturar23(page, 'color-nuevo-1280.png', `#${await novedad(page, 4).getAttribute('id')}`);
    await capturar23(page, 'aplicar-1280.png', '.importador-nov-aplicar');
  }

  // Dos colores del mismo producto y uno nuevo: UNA sola escritura.
  escrituras.guardar = 0; escrituras.subir = 0;
  await aplicar(page).click();
  await expect(avisoNov(page)).toContainText('Se actualizó 1 zapatilla existente (confirmado por el servidor); conserva su estado publicado u oculto.', { timeout: 60000 });
  expect([escrituras.guardar, escrituras.subir]).toEqual([1, 1]);
  if (browserName === 'chromium') await capturar23(page, 'resultado-1280.png', '#imp-novedades');
  const despues = await productos23();
  const w0 = base.find((p) => p.nombre === 'WINFLO 10 P23');
  const w1 = despues.find((p) => p.nombre === 'WINFLO 10 P23');
  expect(w1).toMatchObject({ activo: true, version: w0.version + 1, codigo_interno: w0.codigo_interno, descripcion: 'Texto corregido', destacado: true, categoria: 'RUNNING' });
  expect(despues).toHaveLength(2); // nada duplicado
  const [n1, a1, r1] = w1.variantes;
  const [n0, a0] = w0.variantes;
  expect(n1).toEqual({ ...n0, precio: 139900, actualizado_en: n1.actualizado_en });
  expect(a1.precio).toBe(134900);
  expect(a1.fotos).toEqual(a0.fotos);
  expect(a1.color).toBe('AZUL NOCHE');
  // Las tallas de siempre, intactas (estado, activación y vigencias); la nueva nace «por revisar».
  expect(a1.tallas.filter((t) => t.talla !== '43')).toEqual(a0.tallas);
  expect(a1.tallas.find((t) => t.talla === '43')).toMatchObject({ estado: 'REVISAR', activa: true, vigencia_desde: null });
  expect(r1).toMatchObject({ color: 'ROJO', precio: 134900, activa: false });
  expect(r1.tallas.map((t) => [t.talla, t.estado])).toEqual([['40', 'REVISAR'], ['41', 'REVISAR']]);
  expect(r1.fotos).toHaveLength(1);
  // El que no tenía cambios no se tocó (ni su versión).
  expect(despues.find((p) => p.nombre === 'SAMBA P23')).toEqual(base.find((p) => p.nombre === 'SAMBA P23'));
  // Memoria: relación del color nuevo y lo aplicado, con su operación.
  m = await memoria(page);
  expect(m.asociaciones).toHaveLength(4);
  const aplicados = m.historial.map((x) => x.dato).filter((h) => h.fecha === '2026-11-24');
  expect(aplicados).toHaveLength(3);
  expect(aplicados.every((h) => h.aplicado[0].operacion === w1.ultima_operacion)).toBe(true);
  expect(aplicados.find((h) => h.variante === n1.id).revisado).toMatchObject({ coste: 85000, ventaSugerida: 139900, precioCatalogo: 139900 });

  // «Sin cambios» se puede anotar como revisado sin escribir en el catálogo.
  await ver(page, 'Todas');
  escrituras.guardar = 0;
  await novedades(page).getByRole('button', { name: 'Dar por revisadas sin cambios (1)' }).click();
  await expect(pie(page)).toContainText('1 entrada anotada como revisadas (sin escribir en el catálogo).');
  expect(escrituras.guardar).toBe(0);

  // La MISMA entrega otra vez, en un lote nuevo: todo reconocido y sin cambios; no hay nada que aplicar.
  await seccionPdf(page).getByRole('button', { name: 'Cerrar la importación' }).click();
  await seccionPdf(page).locator('#imp-pdf-cerrar-confirmar').getByRole('button', { name: 'Cerrar la importación' }).click();
  await importarEntrega(page, [venta2, precios2]);
  await expect(filtro(page, 'Sin cambios')).toHaveText('Sin cambios (3)');
  await expect(filtro(page, 'Nuevas zapatillas')).toHaveText('Nuevas zapatillas (1)');
  // El color que se creó desactivado se reconoce, pero queda para revisión: no se activa solo.
  await expect(filtro(page, 'Por reconocer o revisar')).toHaveText('Por reconocer o revisar (1)');
  await expect(novedad(page, 4)).toContainText('El color relacionado está desactivado: se conserva así.');
  await expect(filtro(page, 'Cambios de precio')).toHaveText('Cambios de precio (0)');
  await expect(aplicar(page)).toHaveAttribute('aria-disabled', 'true');
  expect(escrituras.guardar).toBe(0);
  expect(propios(problemas)).toEqual([]);
});

test('catálogo anterior: se busca y se vincula sin crear la zapatilla; otra fotografía y conservación completa', async ({ page }) => {
  const { p, v } = await crearCatalogo23();
  const problemas = await entrarAlPanel(page, admin);
  const escrituras = contarEscrituras(page);
  await abrirImportador(page);
  await importarEntrega(page, entrega('previo', FECHA1, [
    { foto: 321, lineas: ['NIKE WINFLO P23 HOMBRE NEGRO', 'Tallas EU 40 al 45'], venta: '$155.000', coste: ['$100.000'] },
    { foto: 322, lineas: ['NIKE WINFLO P23 HOMBRE NEGRO', 'otro angulo', 'Tallas EU 40 al 45'], venta: '$155.000', coste: ['$100.000'] }
  ]));
  await elegirProveedor(page, 'Proveedor Dos');
  // El mismo modelo no identifica un color: queda para revisión y no se añade solo.
  await expect(filtro(page, 'Por reconocer o revisar')).toHaveText('Por reconocer o revisar (2)');
  await expect(novedad(page, 1)).toContainText('La marca y el modelo no dicen qué color es');
  await expect(seccionPdf(page).locator('#imp-pdf-anadir')).toHaveAttribute('aria-disabled', 'true');
  // Una referencia repetida encuentra las dos zapatillas: no elige por sí sola.
  await elegirModo(novedad(page, 1), 'Actualizar un color existente');
  await novedad(page, 1).getByRole('searchbox').fill('REF-COMPARTIDA');
  await expect(novedad(page, 1).locator('.importador-nov-resultado')).toHaveCount(2);
  await novedad(page, 1).getByRole('searchbox').fill('retirada');
  await expect(novedad(page, 1).locator('.importador-nov-resultado')).toHaveCount(1);
  await expect(novedad(page, 1).locator('.importador-nov-resultado')).toContainText('Retirada: no se puede elegir.');
  await vincular(novedad(page, 1), 'WINFLO P23', new RegExp(`^Elegir WINFLO P23 NEGRO ${v['WINFLO P23|NEGRO'].codigo_variante}`));
  expect((await memoria(page)).asociaciones).toHaveLength(1);
  expect(await productos23()).toHaveLength(3); // no se creó nada
  // La 2 es otra fotografía de ese color.
  await ver(page, 'Todas');
  await elegirModo(novedad(page, 2), 'Añadir otra fotografía a un color existente');
  await novedad(page, 2).getByRole('searchbox').fill(v['WINFLO P23|NEGRO'].codigo_variante);
  await novedad(page, 2).getByRole('button', { name: /^Elegir WINFLO P23 NEGRO/ }).click();
  await novedad(page, 2).getByRole('button', { name: 'Confirmar y recordar esta relación' }).click();
  // «Sin historial»: no se inventa una comparación de costes.
  await expect(novedad(page, 1)).toContainText('$ 100.000. Anterior: Sin historial.');
  // Precio: el nuevo quedaría por encima del precio anterior de otro descuento → aquí 190.000; se usa otro.
  await ver(page, 'Todas');
  await novedad(page, 1).getByRole('radio', { name: 'Escribir otro precio' }).click();
  await novedad(page, 1).getByLabel('Precio de venta (COP)').fill('195000');
  for (const t of ['44', '45']) await novedad(page, 1).getByRole('checkbox', { name: `Añadir ${t}` }).click();
  await aplicar(page).click();
  await expect(operacion(page, 'WINFLO P23')).toContainText('No se envió nada.');
  await expect(operacion(page, 'WINFLO P23')).toContainText('dejaría de ser un descuento');
  expect([escrituras.guardar, escrituras.subir]).toEqual([0, 0]);
  await novedad(page, 1).getByLabel('Precio de venta (COP)').fill('155000');
  await expect(novedad(page, 1).locator('.importador-nov-efecto')).toContainText('$ 150.000 → $ 155.000');
  const antes = await producto23('WINFLO P23');
  const samba = await producto23('SAMBA P23');
  await aplicar(page).click();
  await expect(avisoNov(page)).toContainText('Se actualizó 1 zapatilla existente', { timeout: 60000 });
  expect([escrituras.guardar, escrituras.subir]).toEqual([1, 1]);
  const despues = await producto23('WINFLO P23');
  const { variantes: va, version: versionA, ultima_operacion: oa, actualizado_en: ta, ...restoA } = antes;
  const { variantes: vd, version: versionD, ultima_operacion: od, actualizado_en: td, ...restoD } = despues;
  expect(restoD).toEqual(restoA); // propiedades, códigos, referencia, orden, estado publicado…
  expect(versionD).toBe(versionA + 1);
  expect(vd.slice(1)).toEqual(va.slice(1)); // AZUL y GRIS (desactivado), intactos
  const { fotos: fa, tallas: tla, precio: pa, actualizado_en: x1, ...na } = va[0];
  const { fotos: fd, tallas: tld, precio: pd, actualizado_en: x2, ...nd } = vd[0];
  expect(nd).toEqual(na); // código, color, referencia, muestra, forma, precio anterior, activa, orden
  expect(pd).toBe(155000);
  expect(fd.slice(0, 2)).toEqual(fa);
  expect(fd).toHaveLength(3);
  expect(tld.filter((t) => !['44', '45'].includes(t.talla))).toEqual(tla);
  expect(tld.filter((t) => ['44', '45'].includes(t.talla)).map((t) => [t.estado, t.activa])).toEqual([['REVISAR', true], ['REVISAR', true]]);
  expect(await producto23('SAMBA P23')).toEqual(samba);
  expect((await memoria(page)).asociaciones).toHaveLength(2); // dos fotos del mismo color
  expect(p['WINFLO P23'].id).toBe(despues.id);
  expect(propios(problemas)).toEqual([]);
});

test('WhatsApp: la foto adjunta se reconoce por su archivo (antes de optimizarla) y la ficha no se duplica', async ({ page, browserName }) => {
  const { v } = await crearCatalogo23();
  const [foto1, foto2] = await prepararFotos20(2);
  const problemas = await entrarAlPanel(page, admin);
  const escrituras = contarEscrituras(page);
  await abrirImportador(page);
  // Primera vez: se vincula a mano con el color que ya existe.
  await ficha(page, 0).getByLabel(MENSAJE).fill('NIKE WINFLO P23 HOMBRE $100.000\nTallas 40 al 42');
  await ficha(page, 0).locator('input[type="file"]').setInputFiles(foto1);
  await expect(ficha(page, 0).getByText('Lista · se subirá al guardar')).toBeVisible({ timeout: 30000 });
  await importador(page).getByRole('button', { name: 'Comparar con mi inventario' }).click();
  await elegirProveedor(page, 'Proveedor WhatsApp');
  await vincular(novedad(page, 1, 'Ficha'), 'WINFLO P23', new RegExp(`${v['WINFLO P23|AZUL'].codigo_variante}`));
  await expect(ficha(page, 0)).toContainText('se compara y se aplica en «Novedades y diferencias». No se crea otra zapatilla.');
  await expect(importador(page).locator('#importador-guardar')).toHaveText('Guardar lote como oculto');
  // Fecha desconocida: queda indicada y pide revisarla antes de aplicar.
  await ver(page, 'Todas');
  await expect(novedades(page).locator('.importador-nov-fecha')).toContainText('La fecha de «publicaciones de WhatsApp» no se conoce');
  await novedad(page, 1, 'Ficha').getByRole('checkbox', { name: 'Añadir 42' }).click();
  await expect(novedad(page, 1, 'Ficha')).toContainText('Confirma primero la fecha de «publicaciones de WhatsApp».');
  await expect(aplicar(page)).toHaveAttribute('aria-disabled', 'true');
  await novedades(page).getByRole('checkbox', { name: 'La revisé: permitir aplicar cambios sin fecha conocida' }).click();
  await aplicar(page).click();
  await expect(avisoNov(page)).toContainText('Se actualizó 1 zapatilla existente', { timeout: 60000 });
  await expect(ficha(page, 0)).toContainText('Aplicada a una zapatilla existente · NIKE WINFLO P23: talla 42 (por revisar).');
  expect([escrituras.guardar, escrituras.subir]).toEqual([1, 0]); // sin subir la foto: solo reconoce
  expect(await productos23()).toHaveLength(3);

  // Otro día, en otro lote: la misma foto se reconoce sola; otra distinta, no.
  await recargar(page, problemas, browserName);
  await abrirLoteNuevo(page);
  // Con encabezado de WhatsApp: la fecha de la entrega sale de ahí.
  const s = await pegarVarias(page, '[25/11/26, 10:15] Proveedor: NIKE WINFLO P23 HOMBRE $105.000\nTallas 40 al 44\n[25/11/26, 10:16] Proveedor: NIKE WINFLO P23 HOMBRE VERDE $100.000\nTallas 40 al 41');
  await s.getByRole('button', { name: 'Crear 2 publicaciones' }).click();
  await ficha(page, 0).locator('input[type="file"]').setInputFiles(foto1);
  await expect(ficha(page, 0).getByText('Lista · se subirá al guardar')).toBeVisible({ timeout: 30000 });
  await importador(page).getByRole('button', { name: 'Comparar con mi inventario' }).click();
  await elegirProveedor(page, 'Proveedor WhatsApp');
  await ver(page, 'Todas');
  await expect(novedad(page, 1, 'Ficha')).toContainText('NIKE WINFLO P23 · AZUL');
  await expect(novedad(page, 1, 'Ficha')).toContainText('Fotografía reconocida por la relación que confirmaste.');
  await expect(novedad(page, 1, 'Ficha')).toContainText('$ 100.000 (última entrega conocida: Publicación de WhatsApp, fecha desconocida) → $ 105.000');
  await expect(novedad(page, 1, 'Ficha')).toContainText('25 de noviembre de 2026');
  // Color nuevo con los datos de la ficha de WhatsApp.
  await ficha(page, 1).locator('input[type="file"]').setInputFiles(foto2);
  await expect(ficha(page, 1).getByText('Lista · se subirá al guardar')).toBeVisible({ timeout: 30000 });
  await ver(page, 'Todas');
  await elegirModo(novedad(page, 2, 'Ficha'), 'Añadir un color a una zapatilla existente');
  await novedad(page, 2, 'Ficha').getByRole('searchbox').fill('WINFLO P23');
  await novedad(page, 2, 'Ficha').getByRole('button', { name: /^Elegir NIKE WINFLO P23/ }).click();
  await novedad(page, 2, 'Ficha').getByRole('button', { name: 'Confirmar y recordar esta relación' }).click();
  await color(ficha(page, 1), 0).getByRole('textbox', { name: /^Color \(obligatorio\)/ }).fill('VERDE');
  await color(ficha(page, 1), 0).getByLabel(/^Precio de venta/).fill('149000');
  await expect(novedades(page).locator('.importador-nov-fecha')).toHaveCount(0); // 25 de noviembre: conocida y posterior
  await novedad(page, 1, 'Ficha').getByRole('checkbox', { name: 'Añadir 44' }).click();
  escrituras.guardar = 0;
  await aplicar(page).click();
  await expect(avisoNov(page)).toContainText('Se actualizó 1 zapatilla existente', { timeout: 60000 });
  expect([escrituras.guardar, escrituras.subir]).toEqual([1, 1]);
  const w = await producto23('WINFLO P23');
  expect(w.variantes.map((x) => x.color)).toEqual(['NEGRO', 'AZUL', 'GRIS', 'VERDE']);
  expect(w.variantes[1].tallas.map((t) => t.talla)).toEqual(['40', '41', '42', '44']);
  expect(await productos23()).toHaveLength(3);
  expect((await memoria(page)).asociaciones).toHaveLength(2);
  expect(propios(problemas)).toEqual([]);
});

test('entrega anterior a la última revisada y fecha desconocida: se avisa y no pasan a ser lo más reciente', async ({ page }) => {
  const { v } = await crearCatalogo23();
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  const tarjeta = (coste) => [{ foto: 331, lineas: ['ADIDAS SAMBA P23 DAMA BLANCO', 'EU 36 al 37'], venta: '$129.900', coste: [coste] }];
  await importarEntrega(page, entrega('reciente', FECHA2, tarjeta('$90.000')));
  await elegirProveedor(page, 'Proveedor Fechas');
  await vincular(novedad(page, 1), 'SAMBA P23', new RegExp(v['SAMBA P23|BLANCO'].codigo_variante));
  await novedades(page).getByRole('button', { name: 'Dar por revisadas sin cambios (1)' }).click();
  await expect(pie(page)).toContainText('1 entrada anotada');
  const cerrar = async () => {
    await seccionPdf(page).getByRole('button', { name: 'Cerrar la importación' }).click();
    await seccionPdf(page).locator('#imp-pdf-cerrar-confirmar').getByRole('button', { name: 'Cerrar la importación' }).click();
    await expect(seccionPdf(page)).toHaveCount(0);
  };
  await cerrar();
  // Un documento más antiguo: avisa, compara con lo último y exige confirmarlo.
  await importarEntrega(page, entrega('antigua', FECHA1, tarjeta('$70.000')));
  await ver(page, 'Todas');
  await expect(novedades(page).locator('.importador-nov-fecha').first()).toContainText('es ANTERIOR al último documento revisado de este proveedor (24 de noviembre de 2026). No se trata como lo más reciente.');
  await expect(novedad(page, 1)).toContainText('$ 90.000 (última entrega conocida: reciente-venta.pdf, 24 de noviembre de 2026) → $ 70.000');
  await expect(novedad(page, 1).locator('.importador-nov-marcas')).toContainText('Revisar');
  await expect(novedades(page).getByRole('button', { name: /^Dar por revisadas/ })).toHaveCount(0);
  for (const c of await novedades(page).locator('.importador-nov-fecha input').all()) await c.check();
  await novedades(page).getByRole('button', { name: 'Dar por revisadas sin cambios (1)' }).click();
  await expect(pie(page)).toContainText('1 entrada anotada');
  await cerrar();
  // Lo último conocido sigue siendo la entrega de fecha mayor; un documento sin fecha queda por revisar.
  await importarEntrega(page, entrega('sinfecha', '', tarjeta('$90.000')));
  await ver(page, 'Todas');
  await expect(novedades(page).locator('.importador-nov-fecha').first()).toContainText('no se conoce: revísala');
  await expect(novedad(page, 1)).toContainText('$ 90.000, igual que el último conocido (última entrega conocida: reciente-venta.pdf');
  expect(propios(problemas)).toEqual([]);
});

test('celular: revisión con una sola zona de desplazamiento, sin desbordes y con áreas táctiles', async ({ page, browserName }) => {
  const { v } = await crearCatalogo23();
  await page.setViewportSize({ width: 390, height: 844 });
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await importarEntrega(page, entrega('movil', FECHA1, [
    { foto: 341, lineas: ['NIKE WINFLO P23 HOMBRE NEGRO', 'Tallas EU 40 al 45'], venta: '$155.000', coste: ['$100.000', 'POR CAJA $90.000'] },
    { foto: 342, lineas: ['NIKE WINFLO P23 HOMBRE VERDE', 'Tallas EU 40 al 41'], venta: '$155.000', coste: ['$100.000'] }
  ]));
  await elegirProveedor(page, 'Proveedor Móvil');
  await vincular(novedad(page, 1), 'WINFLO P23', new RegExp(v['WINFLO P23|NEGRO'].codigo_variante));
  await ver(page, 'Todas');
  await elegirModo(novedad(page, 2), 'Añadir un color a una zapatilla existente');
  await novedad(page, 2).getByRole('searchbox').fill('winflo');
  for (const ancho of [390, 360]) {
    await page.setViewportSize({ width: ancho, height: 800 });
    const r = await page.evaluate(() => {
      const zonas = [...document.querySelectorAll('#importador *')].filter((n) => { const e = getComputedStyle(n); return /(auto|scroll)/.test(e.overflowY) && n.scrollHeight > n.clientHeight + 1 && !['TEXTAREA'].includes(n.tagName); }).map((n) => n.id || n.className);
      const sec = document.getElementById('imp-novedades');
      const ancho = document.documentElement.clientWidth;
      const fuera = [...sec.querySelectorAll('*')].filter((n) => { const b = n.getBoundingClientRect(); return b.width > 0 && (b.right > ancho + 1 || b.left < -1) && getComputedStyle(n).position !== 'absolute'; }).map((n) => n.className || n.tagName);
      const bajos = [...sec.querySelectorAll('button:not(.boton-mini), summary, label.casilla')].filter((n) => n.getClientRects().length && n.getBoundingClientRect().height < 43.5).map((n) => `${n.textContent.slice(0, 40)} ${n.getBoundingClientRect().height}`);
      // Tampoco se desplaza el propio diálogo (p. ej. por algo oculto mal contenido).
      for (const id of ['importador', 'importador-formulario']) { const n = document.getElementById(id); if (n.scrollHeight > n.clientHeight + 1) zonas.push(`${id} ${n.scrollHeight}/${n.clientHeight}`); }
      return { zonas, fuera, bajos, desborde: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    expect(r.desborde).toBe(false);
    expect(r.fuera).toEqual([]);
    expect(r.zonas).toEqual(['importador-cuerpo']);
    expect(r.bajos).toEqual([]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  if (browserName === 'chromium') {
    await capturar23(page, 'novedades-390.png', '#imp-novedades');
    await capturar23(page, 'entrada-390.png', `#${await novedad(page, 1).getAttribute('id')}`);
    await capturar23(page, 'diferencias-390.png', `#${await novedad(page, 1).getAttribute('id')} .importador-nov-diferencias`);
    await capturar23(page, 'aplicar-390.png', '.importador-nov-aplicar');
  }
  await esperarGuardadoLocal(page);
  expect(propios(problemas)).toEqual([]);
});

test('la revisión de novedades se recupera con el borrador', async ({ page, browserName }) => {
  const { v } = await crearCatalogo23();
  const problemas = await entrarAlPanel(page, admin);
  await abrirImportador(page);
  await importarEntrega(page, entrega('borrador', FECHA1, [{ foto: 351, lineas: ['NIKE WINFLO P23 HOMBRE NEGRO', 'Tallas EU 40 al 45'], venta: '$155.000', coste: ['$100.000'] }]));
  await elegirProveedor(page, 'Proveedor Borrador');
  await vincular(novedad(page, 1), 'WINFLO P23', new RegExp(v['WINFLO P23|NEGRO'].codigo_variante), { recordar: false });
  await ver(page, 'Todas');
  await novedad(page, 1).getByRole('checkbox', { name: 'Añadir 45' }).click();
  await novedad(page, 1).getByRole('radio', { name: 'Usar la venta sugerida $ 155.000' }).click();
  await esperarGuardadoLocal(page);
  await recargar(page, problemas, browserName);
  await abrirImportador(page);
  await importador(page).getByRole('button', { name: /^Continuar el borrador/ }).click();
  await expect(novedades(page).locator('#imp-nov-proveedor > summary')).toContainText('Proveedor Borrador');
  await ver(page, 'Todas');
  await expect(novedad(page, 1)).toContainText('NIKE WINFLO P23 · NEGRO');
  await expect(novedad(page, 1).getByRole('checkbox', { name: 'Añadir 45' })).toBeChecked();
  await expect(novedad(page, 1).getByRole('checkbox', { name: 'Añadir 44' })).not.toBeChecked();
  await expect(novedad(page, 1).getByRole('radio', { name: 'Usar la venta sugerida $ 155.000' })).toBeChecked();
  // «Usar solo esta vez» no dejó nada en la memoria.
  expect((await memoria(page)).asociaciones).toHaveLength(0);
  await expect(aplicar(page)).toHaveText('Aplicar cambios seleccionados (1 zapatilla)');
  expect(propios(problemas)).toEqual([]);
});
