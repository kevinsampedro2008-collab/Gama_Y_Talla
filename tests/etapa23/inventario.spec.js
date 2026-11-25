// @ts-check
/* Etapa 23 · inventario.js: reconocer, comparar, situar fechas, consolidar y validar la memoria. Sin sesión, sin
 * red y sin escrituras: se ejecuta en la página del panel del entorno aislado. */
import { test, expect } from '@playwright/test';
import { vigilar, propios } from './ayudas23.js';

const SITIO = process.env.SITIO || 'http://127.0.0.1:8770';
test.beforeEach(async ({ page }) => {
  await page.goto(`${SITIO}/admin/`);
  await page.waitForFunction(() => Boolean(window.GamaTallaInventario && window.GamaTallaCatalogoPdf && window.GamaTallaTextoProveedor));
});

test('reconocer: exacta por UUID, proveedor, ambigua, contradictoria, aproximada y destinos que no valen', async ({ page }) => {
  const problemas = vigilar(page);
  const r = await page.evaluate(() => {
    const I = window.GamaTallaInventario;
    const P = window.GamaTallaCatalogoPdf;
    const u = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const h = (n) => String(n).repeat(64).slice(0, 64);
    const g = (v, d = 0) => (v.toString(16).padStart(2, '0')).repeat(255) + (v + d).toString(16).padStart(2, '0');
    const variante = (n, mas = {}) => ({ id: u(n), color: `COLOR ${n}`, activa: true, precio: 1, tallas: [], fotos: [], ...mas });
    const catalogo = [
      { id: u(1), nombre: 'WINFLO 10', marca: 'NIKE', publico: 'hombre', retirado_en: null, variantes: [variante(11), variante(12, { activa: false })] },
      { id: u(2), nombre: 'SAMBA', marca: 'ADIDAS', publico: 'dama', retirado_en: null, variantes: [variante(21)] },
      { id: u(3), nombre: 'VIEJA', marca: 'PUMA', publico: 'hombre', retirado_en: '2026-01-01', variantes: [variante(31)] }
    ];
    const as = (foto, gris, producto, v, mas = {}) => I.asociacionLimpia({ proveedor: 'perfil:uno', tipo: 'pdf', exacta: h(foto), gris, estado: 'confirmada', producto: u(producto), variante: u(v), origen: { marca: 'NIKE', modelo: 'WINFLO', publico: 'hombre' }, ...mas });
    const asociaciones = [as(1, g(10), 1, 11), as(2, g(200), 1, 12), as(3, g(90), 3, 31), as(4, g(60), 1, 99), as(5, g(120), 1, 11), as(5, g(120), 2, 21), as(6, g(150), 2, 21)];
    const ver = (foto, gris, leido = { marca: 'NIKE', modelo: 'WINFLO', publico: 'hombre' }, proveedor = 'perfil:uno', tipo = 'pdf') => {
      const x = I.reconocer({ identidades: [{ tipo, exacta: h(foto), gris }], leido, proveedor, asociaciones, catalogo, claveModelo: window.GamaTallaTextoProveedor.claveModelo, distancia: P.distancia, umbral: P.UMBRAL_IGUAL });
      return [x.estado, x.elegida?.variante || null, x.candidatos.map((c) => c.variante)];
    };
    return {
      exacta: ver(1, g(10)), otroProveedor: ver(1, g(10), undefined, 'perfil:dos'), sinProveedor: ver(1, g(10), undefined, ''), otroTipo: ver(1, '', undefined, 'perfil:uno', 'archivo'),
      desactivada: ver(2, g(200)), retirada: ver(3, g(90)), inexistente: ver(4, g(60)), ambigua: ver(5, g(120)),
      publico: ver(1, g(10), { marca: 'NIKE', modelo: 'WINFLO', publico: 'dama' }), modelo: ver(1, g(10), { marca: 'NIKE', modelo: 'PEGASUS', publico: 'hombre' }),
      renombrada: ver(1, g(10), { marca: 'NIKE', modelo: 'WINFLO 10', publico: 'hombre' }), // ahora dice el nombre actual: no contradice
      parecida: ver(9, g(10, 5)), ninguna: ver(9, g(30)), sinFoto: I.reconocer({ identidades: [], proveedor: 'perfil:uno', asociaciones, catalogo }).estado,
      parecidaRetirada: ver(9, g(90)),
      u11: u(11), u12: u(12), u21: u(21), u31: u(31), u99: u(99)
    };
  });
  expect(r.exacta).toEqual(['reconocida', r.u11, [r.u11]]);
  expect(r.otroProveedor).toEqual(['sin', null, []]);
  expect(r.sinProveedor[0]).toBe('sin-proveedor');
  expect(r.otroTipo[0]).toBe('sin');
  expect(r.desactivada).toEqual(['desactivada', null, [r.u12]]);
  expect(r.retirada).toEqual(['retirada', null, [r.u31]]);
  expect(r.inexistente).toEqual(['inexistente', null, [r.u99]]);
  expect(r.ambigua).toEqual(['ambigua', null, [r.u11, r.u21]]);
  expect(r.publico).toEqual(['contradictoria', null, [r.u11]]);
  expect(r.modelo).toEqual(['contradictoria', null, [r.u11]]);
  expect(r.renombrada[0]).toBe('reconocida');
  expect(r.parecida).toEqual(['parecida', null, [r.u11]]); // propone, no elige
  expect(r.ninguna).toEqual(['sin', null, []]);
  expect(r.sinFoto).toBe('sin-identidad');
  expect(r.parecidaRetirada).toEqual(['retirada', null, [r.u31]]);
  expect(propios(problemas)).toEqual([]);
});

test('costes, tallas, fechas y última información', async ({ page }) => {
  const r = await page.evaluate(() => {
    const I = window.GamaTallaInventario;
    const c = (importe, general = true, condicion = '') => ({ importe, general, condicion });
    const ant = (coste, costes) => ({ revisado: { coste, costes } });
    const E = window.GamaTallaEditor.comun;
    const h = (fecha, cuando, coste, variante = 'v') => ({ proveedor: 'p', variante, fecha, revisado: { cuando, coste, costes: [] } });
    return {
      costes: [
        I.compararCoste({ costes: [] }), I.compararCoste({ costes: [c(95000)] }), I.compararCoste({ costes: [c(95000)], anterior: ant(95000, [c(95000)]) }),
        I.compararCoste({ costes: [c(99000)], anterior: ant(95000, [c(95000)]) }), I.compararCoste({ costes: [c(95000), c(85000, false, 'POR CAJA')], anterior: ant(95000, [c(95000)]) }),
        I.compararCoste({ costes: [c(95000), c(85000, false, 'POR CAJA')], elegido: 1, anterior: ant(95000, [c(95000)]) }),
        I.compararCoste({ costes: [c(85000, false, 'POR CAJA')] }), // un solo importe, pero condicionado
        I.compararCoste({ costes: [c(85000, false, 'POR CAJA'), c(95000)], anterior: ant(95000, [c(95000), c(85000, false, 'POR CAJA')]) })
      ].map((x) => [x.estado, x.valor, x.previo]),
      tallas: I.compararTallas({ entrega: ['40', '40,5', '42', '43'], existentes: [{ talla: '40', activa: true }, { talla: '40 1/2', activa: true }, { talla: '41', activa: true }, { talla: '42', activa: false }], racional: E.racional, equivalentes: E.equivalentes }),
      sinTallas: I.compararTallas({ entrega: [], existentes: [{ talla: '40', activa: true }], racional: E.racional, equivalentes: E.equivalentes }),
      encabezados: ['[22/11/26, 10:15] ', '22/11/2026, 10:15 - ', '[10:15 a. m., 1/2/2026]', '[31/02/2026, 10:15]', 'sin fecha', ''].map(I.fechaEncabezado),
      situar: [I.situarFecha('2026-11-20', null), I.situarFecha('2026-11-20', '2026-11-24'), I.situarFecha('2026-11-24', '2026-11-24'), I.situarFecha('2026-11-25', '2026-11-24'), I.situarFecha(null, '2026-11-24'), I.situarFecha('24/11/2026', '2026-11-24')],
      ultimo: I.ultimo([h('2026-11-24', '2026-11-24T01:00:00Z', 90000), h('2026-11-20', '2026-11-25T01:00:00Z', 70000), h(null, '2026-11-26T01:00:00Z', 60000), h('2026-11-30', '2026-11-30T01:00:00Z', 1, 'otra')], 'p', 'v').revisado.coste,
      soloSinFecha: I.ultimo([h(null, '2026-11-24T01:00:00Z', 90000), h(null, '2026-11-25T01:00:00Z', 70000)], 'p', 'v').revisado.coste,
      ultimaFecha: I.ultimaFecha([h('2026-11-24', 'x', 1), h(null, 'x', 1), h('2026-11-20', 'x', 1)], 'p')
    };
  });
  expect(r.costes).toEqual([['sin-dato', null, null], ['sin-historial', 95000, null], ['igual', 95000, 95000], ['cambio', 99000, 95000], ['por-elegir', null, 95000], ['cambio', 85000, 95000], ['por-elegir', null, null], ['igual', 95000, 95000]]);
  expect(r.tallas).toEqual({ nuevas: ['43'], ausentes: ['41'], desactivadas: ['42'] });
  expect(r.sinTallas).toEqual({ nuevas: [], ausentes: [], desactivadas: [] }); // sin dato no es «no hay»
  expect(r.encabezados).toEqual(['2026-11-22', '2026-11-22', '2026-02-01', null, null, null]);
  expect(r.situar).toEqual(['primera', 'anterior', 'igual', 'posterior', 'desconocida', 'desconocida']);
  expect([r.ultimo, r.soloSinFecha, r.ultimaFecha]).toEqual([90000, 70000, '2026-11-24']);
});

test('consolidar: un solo cuerpo completo, sin tocar lo demás; conflictos y límites; nada que enviar si es igual', async ({ page }) => {
  const r = await page.evaluate(() => {
    const I = window.GamaTallaInventario;
    const E = window.GamaTallaEditor.comun;
    const base = { id: 'p', codigo_interno: 'GT-1', nombre: 'A', variantes: [
      { id: 'v1', color: 'NEGRO', precio: 100, precio_anterior: 150, orden: 0, tallas: [{ id: 't1', talla: '40 1/2', activa: false, activa_original: false }], fotos: [{ ruta: 'a', alt: 'x' }] },
      { id: 'v2', color: 'AZUL', precio: 100, precio_anterior: 0, orden: 4, tallas: [], fotos: [] }] };
    const copia = JSON.stringify(base);
    const aplicar = (cambios) => I.consolidar(base, cambios, { limites: { colores: 3, tallas: 2, fotos: 2 }, racional: E.racional, equivalentes: E.equivalentes });
    const todo = aplicar([{ tipo: 'precio', variante: 'v2', valor: 120 }, { tipo: 'talla', variante: 'v1', talla: '41' }, { tipo: 'talla', variante: 'v1', talla: '40,5' }, { tipo: 'foto', variante: 'v1', ruta: 'b' }, { tipo: 'foto', variante: 'v1', ruta: 'b' },
      { tipo: 'color', datos: { id: 'v3', color: 'rojo', tallas: [], fotos: [] } }]);
    return {
      todo, intacta: JSON.stringify(base) === copia,
      igual: aplicar([{ tipo: 'precio', variante: 'v1', valor: 100 }, { tipo: 'talla', variante: 'v1', talla: '40.5' }, { tipo: 'foto', variante: 'v1', ruta: 'a' }]),
      dosPrecios: aplicar([{ tipo: 'precio', variante: 'v2', valor: 1, entrada: 'uno' }, { tipo: 'precio', variante: 'v2', valor: 2, entrada: 'dos' }]).errores,
      descuento: aplicar([{ tipo: 'precio', variante: 'v1', valor: 150 }]).errores.length, inexistente: aplicar([{ tipo: 'talla', variante: 'zz', talla: '40' }]).errores.length,
      repetido: aplicar([{ tipo: 'color', datos: { id: 'v9', color: 'azul', tallas: [], fotos: [] } }]).errores.length,
      limite: aplicar([{ tipo: 'color', datos: { id: 'v3', color: 'A', tallas: [], fotos: [] } }, { tipo: 'color', datos: { id: 'v4', color: 'B', tallas: [], fotos: [] } }]).errores.length
    };
  });
  expect(r.intacta).toBe(true);
  expect(r.todo.errores).toEqual([]);
  expect(r.todo.aplicados).toHaveLength(4);
  const [v1, v2, v3] = r.todo.cuerpo.variantes;
  expect(v1).toEqual({ id: 'v1', color: 'NEGRO', precio: 100, precio_anterior: 150, orden: 0, tallas: [{ id: 't1', talla: '40 1/2', activa: false, activa_original: false }, { talla: '41', activa: true }], fotos: [{ ruta: 'a', alt: 'x' }, { ruta: 'b', alt: null }] });
  expect([v2.precio, v3.id, v3.orden]).toEqual([120, 'v3', 5]);
  expect([r.igual.aplicados.length, r.igual.errores.length]).toEqual([0, 0]);
  expect(r.dosPrecios).toHaveLength(1);
  expect([r.descuento, r.inexistente, r.repetido, r.limite]).toEqual([1, 1, 1, 1]);
});

test('memoria exportada: versión, validación y otro proyecto sin vínculos', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const I = window.GamaTallaInventario;
    const u = '00000000-0000-4000-8000-000000000001';
    const a = I.asociacionLimpia({ proveedor: 'perfil:uno', tipo: 'pdf', exacta: 'a'.repeat(64), gris: '', estado: 'confirmada', producto: u, variante: u, etiqueta: { marca: 'NIKE', modelo: 'X', color: 'NEGRO' } });
    const h = I.historialLimpio({ proveedor: 'perfil:uno', producto: u, variante: u, entrega: 'e', lugar: 'p1-1', revisado: { cuando: '2026-11-24T00:00:00Z', costes: [], coste: 1 }, aplicado: [{ operacion: u, cuando: '2026-11-24T00:00:00Z', cambios: ['x'] }] });
    const datos = { ambito: { proyecto: 'http://x', usuario: u }, proveedores: [{ id: 'perfil:uno', nombre: 'Uno', creado: '2026-11-24T00:00:00Z' }], asociaciones: [a], historial: [h] };
    const blob = I.empaquetarMemoria(datos);
    const leida = await I.leerMemoria(blob);
    const json = JSON.parse(await blob.text());
    const error = async (x) => { try { await I.leerMemoria(new Blob([typeof x === 'string' ? x : JSON.stringify(x)])); return ''; } catch (e) { return e.message; } };
    const adaptada = I.adaptarMemoria(leida);
    return {
      ida: JSON.stringify([leida.asociaciones, leida.historial]) === JSON.stringify([[a], [h]]), formato: [json.formato, json.version],
      errores: [await error('no json'), await error({ ...json, formato: 'otro' }), await error({ ...json, version: 9 }), await error({ ...json, ambito: {} }), await error({ ...json, asociaciones: 'x' })],
      danados: (await I.leerMemoria(new Blob([JSON.stringify({ ...json, asociaciones: [a, { ...a, exacta: 'zz' }, null], historial: [h, { ...h, variante: 'no' }] })]))).descartados,
      adaptada: [adaptada.historial.length, adaptada.asociaciones.map((x) => [x.estado, x.producto, x.variante, x.etiqueta.modelo])],
      repetida: I.adaptarMemoria(leida).asociaciones[0].id === adaptada.asociaciones[0].id,
      fusion: I.fusionarHistorial(h, { ...h, aplicado: [...h.aplicado] }).aplicado.length
    };
  });
  expect(r.ida).toBe(true);
  expect(r.formato).toEqual(['gama-talla/memoria-inventario', 1]);
  expect(r.errores.every(Boolean)).toBe(true);
  expect(r.errores[2]).toContain('Versión de memoria no admitida (9)');
  expect(r.danados).toBe(3);
  expect(r.adaptada).toEqual([0, [['por-vincular', null, null, 'X']]]);
  expect(r.repetida).toBe(true); // importarla dos veces no duplica
  expect(r.fusion).toBe(1); // la misma operación no se anota dos veces
});

test('público del destino: si cambia respecto a lo confirmado, se revisa; corregir nombres no contradice', async ({ page }) => {
  const r = await page.evaluate(() => {
    const I = window.GamaTallaInventario;
    const P = window.GamaTallaCatalogoPdf;
    const u = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const ver = (publicoActual, leido, { etiqueta = 'hombre', origen = 'hombre', nombre = 'WINFLO 10', gris = '', foto = 'a' } = {}) => {
      const a = I.asociacionLimpia({ proveedor: 'perfil:uno', tipo: 'pdf', exacta: 'a'.repeat(64), gris: '10'.repeat(256), estado: 'confirmada', producto: u(1), variante: u(11), etiqueta: { marca: 'NIKE', modelo: 'WINFLO', publico: etiqueta, color: 'NEGRO' }, origen: { marca: 'NIKE', modelo: 'WINFLO', publico: origen } });
      const catalogo = [{ id: u(1), nombre, marca: 'NIKE', publico: publicoActual, retirado_en: null, variantes: [{ id: u(11), color: 'OTRO NOMBRE', activa: true, precio: 1, tallas: [], fotos: [] }] }];
      return I.reconocer({ identidades: [{ tipo: 'pdf', exacta: foto.repeat(64), gris }], leido: { marca: 'NIKE', modelo: 'WINFLO', publico: leido }, proveedor: 'perfil:uno', asociaciones: [a], catalogo, claveModelo: window.GamaTallaTextoProveedor.claveModelo, distancia: P.distancia, umbral: P.UMBRAL_IGUAL });
    };
    return {
      cambio: ver('dama', 'hombre'), cambioYentrega: ver('dama', 'dama').estado, cambioSinLeer: ver('dama', '').estado, unisex: ver('unisex', 'hombre').estado,
      igual: ver('hombre', 'hombre').estado, renombrada: ver('hombre', 'hombre', { nombre: 'WINFLO CORREGIDA' }).estado, sinLeer: ver('hombre', '').estado,
      // Confirmada a sabiendas con públicos distintos: sigue valiendo mientras nada cambie.
      aSabiendas: ver('dama', 'hombre', { etiqueta: 'dama' }).estado, sinContexto: ver('dama', 'hombre', { etiqueta: '' }).estado,
      parecida: ver('dama', 'hombre', { foto: 'b', gris: '10'.repeat(256) }).estado
    };
  });
  expect(r.cambio.estado).toBe('contradictoria');
  expect(r.cambio.elegida).toBeNull();
  expect(r.cambio.motivo).toContain('la zapatilla era para Hombre y ahora es para Dama');
  expect([r.cambioYentrega, r.cambioSinLeer, r.unisex]).toEqual(['contradictoria', 'contradictoria', 'contradictoria']);
  expect([r.igual, r.renombrada, r.sinLeer, r.aSabiendas]).toEqual(['reconocida', 'reconocida', 'reconocida', 'reconocida']);
  expect([r.sinContexto, r.parecida]).toEqual(['contradictoria', 'contradictoria']);
});

test('tallas anunciadas: lo que una entrega deja de mencionar es un cambio; sin tallas no es una lista vacía', async ({ page }) => {
  const r = await page.evaluate(() => {
    const I = window.GamaTallaInventario;
    const { racional, equivalentes } = window.GamaTallaEditor.comun;
    const v = '00000000-0000-4000-8000-000000000011';
    const h = (entrega, fecha, cuando, tallas) => ({ id: I.idHistorial('p', v, entrega, 'p1-1'), proveedor: 'p', variante: v, entrega, lugar: 'p1-1', documento: entrega, fecha, revisado: { cuando, costes: [], coste: null, ventaSugerida: null, tallas } });
    const variante = { id: v, precio: 100, tallas: ['40', '41', '42', '43'].map((t) => ({ talla: t, activa: t !== '43' })) };
    const ver = (historial, tallas, { entrega = 'nueva', fecha = '2026-11-24' } = {}) => {
      const anterior = I.ultimo(historial, 'p', v);
      const d = I.diferencias({ entrega: { costes: [], tallas, ventaSugerida: null }, destino: { producto: {}, variante }, anterior,
        anunciadas: I.compararAnunciadas ? I.compararAnunciadas({ historial, proveedor: 'p', variante: v, entrega, lugar: 'p1-1', fecha, tallas, racional, equivalentes }) : undefined, racional, equivalentes });
      return { marca: d.marcas.tallas, nuevas: d.tallas.nuevas, ausentes: d.tallas.ausentes, estado: d.anunciadas?.estado, retiradas: d.anunciadas?.retiradas, agregadas: d.anunciadas?.agregadas };
    };
    const d1 = h('d1', '2026-11-20', '2026-11-20T10:00:00Z', ['40', '41', '42', '43']);
    return {
      menos: ver([d1], ['40', '41']), igual: ver([d1], ['40', '41', '42', '43']), sinDato: ver([d1], []), primera: ver([], ['40', '41']), equivalentes: ver([h('d1', '2026-11-20', 'x', ['40 1/2'])], ['40,5']),
      mas: ver([h('d1', '2026-11-20', 'x', ['40', '41'])], ['40', '41', '42']),
      revisada: ver([d1, h('nueva', '2026-11-24', '2026-11-24T10:00:00Z', ['40', '41'])], ['40', '41']),
      posteriorIgual: ver([d1, h('nueva', '2026-11-24', '2026-11-24T10:00:00Z', ['40', '41'])], ['40', '41'], { entrega: 'otra', fecha: '2026-11-25' }),
      // Un mensaje sin tallas revisado después no borra lo último anunciado.
      trasSinTallas: ver([d1, h('msj', '2026-11-22', '2026-11-22T10:00:00Z', [])], ['40', '41']),
      // Sin fecha: no es lo último, pero lo ya revisado no insiste.
      sinFecha: ver([d1], ['40'], { entrega: 'wa1', fecha: null }),
      sinFechaRevisada: ver([d1, h('wa1', null, '2026-11-25T10:00:00Z', ['40'])], ['40'], { entrega: 'wa2', fecha: null }),
      antiguaRevisada: ver([d1, h('vieja', '2026-11-10', '2026-11-25T10:00:00Z', ['40'])], ['40'], { entrega: 'vieja2', fecha: '2026-11-11' }),
      posteriorFrenteAFecha: ver([d1, h('wa1', null, '2026-11-25T10:00:00Z', ['40'])], ['40'], { entrega: 'd3', fecha: '2026-11-26' })
    };
  });
  expect(r.menos).toEqual({ marca: true, nuevas: [], ausentes: ['42'], estado: 'cambio', retiradas: ['42', '43'], agregadas: [] });
  expect(r.igual).toMatchObject({ marca: false, estado: 'igual' });
  expect(r.sinDato).toEqual({ marca: false, nuevas: [], ausentes: [], estado: 'sin-dato', retiradas: [], agregadas: [] });
  expect(r.primera).toMatchObject({ marca: false, estado: 'sin-historial' });
  expect(r.equivalentes).toMatchObject({ estado: 'igual', nuevas: ['40,5'] });
  expect(r.mas).toMatchObject({ marca: true, nuevas: [], estado: 'cambio', retiradas: [], agregadas: ['42'] });
  expect([r.revisada.estado, r.posteriorIgual.estado]).toEqual(['igual', 'igual']);
  expect([r.revisada.marca, r.posteriorIgual.marca]).toEqual([false, false]);
  expect(r.trasSinTallas).toMatchObject({ marca: true, estado: 'cambio', retiradas: ['42', '43'] });
  expect([r.sinFecha.estado, r.sinFechaRevisada.estado, r.antiguaRevisada.estado, r.posteriorFrenteAFecha.estado]).toEqual(['cambio', 'igual', 'igual', 'cambio']);
});
