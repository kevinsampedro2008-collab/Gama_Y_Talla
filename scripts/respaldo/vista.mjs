/* Etapa 17.1 · Lectura paginada de catalogo_publico para verificar una restauración.
 *
 * La API local limita cada respuesta a `max_rows` (1.000 filas por omisión): una sola petición
 * dejaría fuera lo que pase de ahí y la comparación de identificadores daría un falso fallo (o,
 * peor, un falso acierto). Se pide por páginas ordenadas por `id` y se sigue hasta que una página
 * llegue vacía; el avance es por filas recibidas, no por el tamaño pedido, así que funciona
 * también si el servidor recorta la página por debajo de lo solicitado.
 *
 * Cada página se valida: estado HTTP, que el cuerpo sea JSON, que sea un arreglo y que cada fila
 * tenga un `id` de texto no vacío y sus `variantes` en un arreglo. Un `id` repetido entre páginas
 * (un solapamiento) también es un error. Cualquier problema lanza ErrorVista con el número de
 * página y lo que se recibió; nunca se devuelve una lectura incompleta.
 */
export class ErrorVista extends Error {}

export const TAMANO_PAGINA = 1000;

export async function leerVistaPublica(api, clave, { tamano = TAMANO_PAGINA, maxPaginas = 10000, solicitar = fetch } = {}) {
  const filas = [];
  const vistos = new Set();
  let paginas = 0;
  for (let desde = 0; ; ) {
    paginas += 1;
    if (paginas > maxPaginas) throw new ErrorVista(`Más de ${maxPaginas} páginas: se corta para no iterar sin fin.`);
    const url = `${api}/rest/v1/catalogo_publico?select=id,variantes&order=id.asc&limit=${tamano}&offset=${desde}`;
    let respuesta;
    let texto;
    try {
      respuesta = await solicitar(url, { headers: { apikey: clave } });
      texto = await respuesta.text();
    } catch (e) {
      throw new ErrorVista(`Página ${paginas} (desde la fila ${desde}): sin respuesta (${e.message}).`);
    }
    if (!respuesta.ok) {
      const cuerpo = texto.replace(/\s+/g, ' ').trim().slice(0, 160);
      throw new ErrorVista(`Página ${paginas} (desde la fila ${desde}): HTTP ${respuesta.status}${cuerpo ? ` — ${cuerpo}` : ' sin cuerpo'}.`);
    }
    let datos;
    try { datos = JSON.parse(texto); } catch { throw new ErrorVista(`Página ${paginas} (desde la fila ${desde}): HTTP ${respuesta.status} pero el cuerpo no es JSON (${texto.replace(/\s+/g, ' ').trim().slice(0, 80)}).`); }
    if (!Array.isArray(datos)) throw new ErrorVista(`Página ${paginas} (desde la fila ${desde}): se esperaba un arreglo de filas.`);
    datos.forEach((fila, i) => {
      if (!fila || typeof fila !== 'object' || typeof fila.id !== 'string' || !fila.id || !Array.isArray(fila.variantes)) {
        throw new ErrorVista(`Página ${paginas}, fila ${desde + i}: no tiene id de texto y variantes en un arreglo.`);
      }
      if (vistos.has(fila.id)) throw new ErrorVista(`Página ${paginas}, fila ${desde + i}: el id «${fila.id}» ya apareció en una página anterior (solapamiento).`);
      vistos.add(fila.id);
    });
    if (!datos.length) break;
    filas.push(...datos);
    desde += datos.length;
  }
  return { filas, paginas };
}
