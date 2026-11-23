// @ts-check
/* Etapa 20 · Separador de varias publicaciones pegadas (admin/separar-publicaciones.js).
 *
 * Carga el lector y el separador en una página vacía (sin servidor, sin Supabase ni datos). Teléfonos
 * y nombres FICTICIOS.
 *
 *   npx playwright test tests/etapa20/separador.spec.js
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '..', '..', 'admin');
const TELEFONO = '+57 3000000000';
const REEBOK = `REEBOK PRINCENSA 💰$105.000 DAMA 👸 Y CABALLERO 🤴 TODAS LAS TALLAS🔥\n\nDinos y te ayudamos sin falta\n👉 ${TELEFONO}`;
const NIKE_DAMA = `NIKE 7 CAMARAS⚠️NUMERACION DAMA💥$125.000\n📦📦DISPONIBLE $115.000\n\n🤝 Aparta la tuya pues 👉🏼 ${TELEFONO}`;
const NIKE_HOMBRE = `NIKE 7 CAMARAS⚠️NUMERACION HOMBRE💥$125.000\n📦📦DISPONIBLE $115.000\n\n😍 Aprovecha y pídela → ${TELEFONO}`;
const ON = `🌟ON CLOUD REMIX🌟\n💸$115.000💸\nEUR 36 AL 44\n\n🛒 Mándanos tu pedido: ${TELEFONO}`;
const NB = `RECARGA 🔥🔥\nNew Balance 603 🇺🇸\nHombre $115.000 🔥\n40 al 44 Euro ✅\nTe atiendo por aquí hoy ${TELEFONO}`;
const ON_PARTIDO = `🔥NUEVO INGRESO🔥\nON\nCLOUD REMIX\n💸$115.000💸\nEUR 36 AL 44`;

test.beforeEach(async ({ page }) => {
  await page.goto('about:blank');
  await page.addScriptTag({ path: path.join(RAIZ, 'texto-proveedor.js') });
  await page.addScriptTag({ path: path.join(RAIZ, 'separar-publicaciones.js') });
});

/** @param {import('@playwright/test').Page} page @param {string} texto */
const separar = (page, texto) => page.evaluate((t) => {
  const S = window.GamaTallaSeparador;
  const { cortes } = S.detectar(t);
  return { cortes, bloques: S.bloques(t, cortes).map((b) => ({ texto: b.texto, original: b.original, encabezado: b.encabezado, vacio: b.vacio, incluido: S.incluidoPorOmision(b), marca: b.datos.marca, modelo: b.datos.modelo })) };
}, texto);

test('los cuatro mensajes de referencia, separados por líneas en blanco: un fragmento por mensaje, con sus saltos internos', async ({ page }) => {
  const r = await separar(page, [REEBOK, NIKE_DAMA, ON, NB].join('\n\n'));
  expect(r.bloques.map((b) => b.texto)).toEqual([REEBOK, NIKE_DAMA, ON, NB]);
  expect(r.bloques.map((b) => [b.marca, b.modelo])).toEqual([['Reebok', 'PRINCENSA'], ['Nike', '7 CAMARAS'], ['On', 'CLOUD REMIX'], ['New Balance', '603']]);
  expect(r.cortes.every((c) => !c.dudosa && c.tipo === 'marca')).toBe(true);
});

test('cada mensaje de referencia solo: nunca se divide (líneas en blanco, marca sola en su línea, dos precios)', async ({ page }) => {
  for (const t of [REEBOK, NIKE_DAMA, NIKE_HOMBRE, ON, NB, ON_PARTIDO, `${NIKE_DAMA}\n\n\n\n${'📦'.repeat(3)}`]) {
    const r = await separar(page, t);
    expect(r.bloques, t).toHaveLength(1);
    expect(r.cortes, t).toEqual([]);
  }
});

test('sin líneas en blanco: el cierre (teléfono, contacto) queda con su mensaje y la introducción sin datos va con el siguiente', async ({ page }) => {
  const r = await separar(page, [REEBOK.replace('\n\n', '\n'), NIKE_DAMA.replace('\n\n', '\n'), ON_PARTIDO, NB].join('\n'));
  expect(r.bloques).toHaveLength(4);
  expect(r.bloques[0].texto).toBe(REEBOK.replace('\n\n', '\n'));
  expect(r.bloques[2].texto).toBe(ON_PARTIDO);
  expect(r.bloques[2].modelo).toBe('CLOUD REMIX');
  expect(r.bloques[3].texto.startsWith('RECARGA')).toBe(true);
  // Una marca justo debajo de un precio, sin cierre ni línea en blanco: dudosa.
  const pegado = await separar(page, 'Adidas Samba $180.000\nPuma Suede $90.000');
  expect(pegado.bloques).toHaveLength(2);
  expect(pegado.cortes[0]).toMatchObject({ dudosa: true });
});

test('encabezados de WhatsApp (Android, iPhone y escritorio), multimedia y mensajes editados', async ({ page }) => {
  const texto = [
    `‎[22/11/26, 10:15:02] Proveedor Ficticio: ${NIKE_DAMA}`,
    '[22/11/26, 10:15:40] Proveedor Ficticio: ‎imagen omitida',
    `22/11/26, 10:16 - Proveedor Ficticio: ${ON}`,
    '22/11/26, 10:17 - Los mensajes y las llamadas están cifrados de extremo a extremo.',
    `[10:18 a. m., 22/11/2026] ${TELEFONO}: ${NB} <Se editó este mensaje.>`,
    '[10:19, 22/11/2026] Proveedor Ficticio: 40 al 44'
  ].join('\n');
  const r = await separar(page, texto);
  expect(r.bloques).toHaveLength(6);
  expect(r.bloques[0].texto).toBe(NIKE_DAMA);
  expect(r.bloques[0].encabezado).toBe('[22/11/26, 10:15:02] Proveedor Ficticio');
  // Foto sola y aviso del sistema: vacíos, no se crean y no hacen dudosa ninguna división.
  expect(r.bloques[1]).toMatchObject({ vacio: true, incluido: false });
  expect(r.bloques[3]).toMatchObject({ vacio: true, incluido: false });
  expect(r.bloques[4].texto).toBe(NB);
  expect(r.bloques[4].original).toContain('<Se editó este mensaje.>');
  // «40 al 44» en otro mensaje: continuación dudosa del anterior; se crea por omisión (trae tallas) pero se señala.
  const ultimo = r.cortes[r.cortes.length - 1];
  expect(ultimo).toMatchObject({ tipo: 'encabezado', dudosa: true });
  expect(ultimo.motivo).toContain('¿es la continuación del 5?');
  expect(r.cortes.filter((c) => c.dudosa)).toHaveLength(1);
});

test('separadores de signos; corregir a mano: separar, unir y marcar como revisada', async ({ page }) => {
  const r = await page.evaluate(([a, b]) => {
    const S = window.GamaTallaSeparador;
    const t = `${a}\n-----\nSolo un saludo\n=====\n${b}`;
    const { cortes } = S.detectar(t);
    const antes = S.bloques(t, cortes).map((x) => x.texto);
    const dudosas = cortes.filter((c) => c.dudosa).length;
    const unidos = S.unirCon(cortes, cortes[0].linea);
    const tras = S.bloques(t, unidos).map((x) => x.texto);
    const separados = S.separarEn(unidos, cortes[0].linea);
    const revisado = S.revisado(cortes, cortes[0].linea).find((c) => c.linea === cortes[0].linea);
    return { antes, dudosas, tras, otraVez: S.bloques(t, separados).length, revisado };
  }, [REEBOK, NB]);
  expect(r.antes).toEqual([REEBOK, 'Solo un saludo', NB]);
  expect(r.dudosas).toBe(1);
  expect(r.tras).toHaveLength(2);
  expect(r.tras[0]).toBe(`${REEBOK}\nSolo un saludo`);
  expect(r.otraVez).toBe(3);
  expect(r.revisado).toMatchObject({ dudosa: false, manual: true });
});

test('lote de 30 publicaciones: se separa en poco tiempo y sin perder ni mezclar ninguna', async ({ page }) => {
  const mensajes = Array.from({ length: 30 }, (_, i) => [REEBOK, NIKE_DAMA, ON, NB][i % 4].replace(/PRINCENSA|7 CAMARAS|CLOUD REMIX|603/, (m) => `${m} ${i + 1}`));
  const r = await page.evaluate((t) => {
    const S = window.GamaTallaSeparador;
    const inicio = performance.now();
    const { cortes } = S.detectar(t);
    const bloques = S.bloques(t, cortes);
    return { ms: performance.now() - inicio, n: bloques.length, modelos: bloques.map((b) => b.datos.modelo), dudosas: cortes.filter((c) => c.dudosa).length };
  }, mensajes.join('\n\n'));
  expect(r.n).toBe(30);
  expect(r.dudosas).toBe(0);
  expect(r.modelos.map((m) => Number(m.replace(/\D+/g, ' ').trim().split(' ').pop()))).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  expect(r.ms, 'separar 30 publicaciones no debe bloquear la ventana').toBeLessThan(1000);
});
