/* Etapa 17.1 · Lectura paginada de catalogo_publico (scripts/respaldo/vista.mjs). SOLO LOCAL, sin Supabase.
 *
 *   node --test supabase/pruebas/reproducir/pruebas_vista_respaldo.mjs
 *
 * Levanta un servidor HTTP simulado en 127.0.0.1 que imita a PostgREST con `max_rows = 1000`
 * (recorta cada respuesta a 1.000 filas, aunque se pida más) y comprueba que la lectura:
 *   · junta los 1.001 productos de un catálogo de 1.001 con páginas de 1.000;
 *   · sigue funcionando si el servidor recorta la página por debajo de lo pedido;
 *   · falla con el estado y el cuerpo de texto de un 503, de un 500 y de un 200 que no es JSON;
 *   · falla ante un solapamiento entre páginas, una fila mal formada o un servidor caído;
 *   · y que una sola petición (lo que hacía la verificación anterior) se queda en 1.000.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { leerVistaPublica, ErrorVista, TAMANO_PAGINA } from '../../../scripts/respaldo/vista.mjs';

const filas = (n, desde = 0) => Array.from({ length: n }, (_, i) => ({ id: `producto-${String(desde + i).padStart(5, '0')}`, variantes: [{ id: 'unica' }] }));

// Servidor que imita /rest/v1/catalogo_publico con limit/offset y un tope de filas por respuesta.
function servidor(comportamiento) {
  const peticiones = [];
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const limit = Number(url.searchParams.get('limit') ?? 1e9);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    peticiones.push({ limit, offset, orden: url.searchParams.get('order'), apikey: req.headers.apikey });
    comportamiento(res, { limit, offset, n: peticiones.length });
  });
  return new Promise((resolver) => srv.listen(0, '127.0.0.1', () => resolver({
    api: `http://127.0.0.1:${srv.address().port}`, peticiones, cerrar: () => new Promise((f) => srv.close(f))
  })));
}
const json = (res, cuerpo, estado = 200) => { res.writeHead(estado, { 'content-type': 'application/json' }); res.end(JSON.stringify(cuerpo)); };
const paginado = (total, tope = 1000) => (res, { limit, offset }) => json(res, filas(total).slice(offset, offset + Math.min(limit, tope)));

test('un catálogo de 1.001 productos con páginas de 1.000 se lee completo, ordenado por id', async () => {
  const s = await servidor(paginado(1001));
  try {
    const { filas: leidas, paginas } = await leerVistaPublica(s.api, 'clave-ficticia');
    assert.equal(leidas.length, 1001);
    assert.equal(new Set(leidas.map((f) => f.id)).size, 1001);
    assert.equal(leidas[1000].id, 'producto-01000', 'la fila 1.001 llega en la segunda página');
    assert.equal(paginas, 3, '1.000 + 1 + una página vacía que cierra la lectura');
    assert.deepEqual(s.peticiones.map((p) => p.offset), [0, 1000, 1001]);
    assert.ok(s.peticiones.every((p) => p.limit === TAMANO_PAGINA && p.orden === 'id.asc' && p.apikey === 'clave-ficticia'));
  } finally { await s.cerrar(); }
});

test('una sola petición (la verificación anterior) se queda en 1.000 filas: el defecto que se corrige', async () => {
  const s = await servidor(paginado(1001));
  try {
    const r = await fetch(`${s.api}/rest/v1/catalogo_publico?select=id,variantes&order=id`);
    assert.equal((await r.json()).length, 1000);
  } finally { await s.cerrar(); }
});

test('exactamente 1.000 productos: dos páginas (la segunda vacía), sin perder ni repetir', async () => {
  const s = await servidor(paginado(1000));
  try {
    const { filas: leidas, paginas } = await leerVistaPublica(s.api, 'k');
    assert.equal(leidas.length, 1000);
    assert.equal(paginas, 2);
  } finally { await s.cerrar(); }
});

test('catálogo vacío: una página vacía y cero filas', async () => {
  const s = await servidor(paginado(0));
  try {
    const { filas: leidas, paginas } = await leerVistaPublica(s.api, 'k');
    assert.deepEqual([leidas.length, paginas], [0, 1]);
  } finally { await s.cerrar(); }
});

test('si el servidor recorta la página por debajo de lo pedido, no se da por terminada la lectura', async () => {
  const s = await servidor(paginado(1001, 300));
  try {
    const { filas: leidas } = await leerVistaPublica(s.api, 'k');
    assert.equal(leidas.length, 1001);
  } finally { await s.cerrar(); }
});

test('un 503 con cuerpo de texto falla con el estado y el cuerpo, sin devolver una lectura parcial', async () => {
  const s = await servidor((res, { n }) => {
    if (n === 1) return json(res, filas(1000).slice(0, 1000));
    res.writeHead(503, { 'content-type': 'text/plain' });
    res.end('Service Unavailable: upstream connect error');
  });
  try {
    await assert.rejects(leerVistaPublica(s.api, 'k'), (e) => {
      assert.ok(e instanceof ErrorVista);
      assert.match(e.message, /Página 2 \(desde la fila 1000\): HTTP 503 — Service Unavailable: upstream connect error/);
      return true;
    });
  } finally { await s.cerrar(); }
});

test('un 503 desde la primera página también se informa con su cuerpo de texto', async () => {
  const s = await servidor((res) => { res.writeHead(503, { 'content-type': 'text/plain' }); res.end('Service Unavailable'); });
  try {
    await assert.rejects(leerVistaPublica(s.api, 'k'), /Página 1 \(desde la fila 0\): HTTP 503 — Service Unavailable/);
  } finally { await s.cerrar(); }
});

test('un 500 sin cuerpo se informa como «sin cuerpo»', async () => {
  const s = await servidor((res) => { res.writeHead(500); res.end(); });
  try {
    await assert.rejects(leerVistaPublica(s.api, 'k'), /HTTP 500 sin cuerpo/);
  } finally { await s.cerrar(); }
});

test('un 200 cuyo cuerpo no es JSON (un proxy con una página de error) se rechaza', async () => {
  const s = await servidor((res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html>Bad gateway</html>'); });
  try {
    await assert.rejects(leerVistaPublica(s.api, 'k'), /HTTP 200 pero el cuerpo no es JSON \(<html>Bad gateway<\/html>\)/);
  } finally { await s.cerrar(); }
});

test('un cuerpo JSON que no es un arreglo se rechaza', async () => {
  const s = await servidor((res) => json(res, { message: 'JWT expired' }, 200));
  try {
    await assert.rejects(leerVistaPublica(s.api, 'k'), /se esperaba un arreglo/);
  } finally { await s.cerrar(); }
});

test('una fila sin id de texto o sin variantes se rechaza con su posición', async () => {
  for (const mala of [{ variantes: [] }, { id: 7, variantes: [] }, { id: '', variantes: [] }, { id: 'x' }, null]) {
    const s = await servidor((res, { offset }) => json(res, offset === 0 ? [{ id: 'a', variantes: [] }, mala] : []));
    try {
      await assert.rejects(leerVistaPublica(s.api, 'k'), /Página 1, fila 1: no tiene id de texto y variantes en un arreglo/);
    } finally { await s.cerrar(); }
  }
});

test('un id repetido entre páginas (solapamiento) se rechaza', async () => {
  const s = await servidor((res, { offset }) => json(res, offset === 0 ? filas(3) : offset === 3 ? filas(2, 2) : []));
  try {
    await assert.rejects(leerVistaPublica(s.api, 'k'), /producto-00002.*ya apareció en una página anterior/);
  } finally { await s.cerrar(); }
});

test('un servidor caído se informa como falta de respuesta', async () => {
  const s = await servidor(paginado(1));
  const api = s.api;
  await s.cerrar();
  await assert.rejects(leerVistaPublica(api, 'k'), /Página 1 \(desde la fila 0\): sin respuesta/);
});

test('un servidor que nunca vacía la lista se corta en el máximo de páginas', async () => {
  const s = await servidor((res, { offset }) => json(res, filas(1, offset)));
  try {
    await assert.rejects(leerVistaPublica(s.api, 'k', { maxPaginas: 5 }), /Más de 5 páginas/);
  } finally { await s.cerrar(); }
});
