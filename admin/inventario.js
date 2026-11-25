/* Panel privado de Gama & Talla · etapa 23: reconocer el inventario existente y comparar entregas.
 *
 * Lógica SIN pantalla ni red (se prueba aparte). Expone window.GamaTallaInventario. La usa novedades.js.
 *
 * Reconocer
 *  - Una fotografía de origen se identifica por su huella ANTES de optimizarla: en un PDF, el SHA-256 de sus
 *    píxeles (tipo «pdf»); en una publicación de WhatsApp, el SHA-256 de los bytes del archivo (tipo
 *    «archivo»). El WebP publicado en Storage es otro archivo: nunca se compara con él.
 *  - Solo una asociación CONFIRMADA, del mismo proveedor y con la misma huella exacta, resuelve un destino, y
 *    lo hace por los UUID del producto y de la variante. La marca, el modelo, la referencia del proveedor y
 *    la huella gris (aproximada) únicamente proponen.
 *  - Varias coincidencias, datos contradictorios o un destino desactivado, retirado o inexistente: revisión.
 *  - Una relación vale en el contexto en que se confirmó: si cambió el público de la zapatilla, revisión. Que se
 *    corrijan el nombre del modelo o del color no la contradice (se sigue por los UUID).
 *
 * Comparar
 *  - Coste del proveedor, venta sugerida y precio del catálogo son tres datos distintos: nunca se mezclan.
 *  - Que algo falte en la entrega (una zapatilla, una talla) no cambia nada en el catálogo. Las tallas que una
 *    entrega deja de anunciar son una novedad que se revisa; una entrega sin tallas no es una lista vacía.
 *
 * Consolidar
 *  - Parte del registro COMPLETO del producto y aplica solo los cambios elegidos: lo demás se reenvía igual.
 */
(() => {
  "use strict";

  const HUELLA = /^[0-9a-f]{64}$/;
  const GRIS = /^[0-9a-f]{512}$/;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const FECHA = /^\d{4}-\d{2}-\d{2}$/;

  const identidadValida = (i) => Boolean(i) && ["pdf", "archivo"].includes(i.tipo) && HUELLA.test(String(i.exacta));
  const idAsociacion = (proveedor, identidad, variante) => `${proveedor}|${identidad.tipo}:${identidad.exacta}|${variante}`;
  const idHistorial = (proveedor, variante, entrega, lugar) => `${proveedor}|${variante}|${entrega}|${lugar}`;

  // ------------------------------------------------------------------ destinos del catálogo
  // Siempre por UUID: { producto, variante } o null.
  function buscarDestino(catalogo, productoId, varianteId) {
    const producto = catalogo.find((p) => p.id === productoId);
    if (!producto) return null;
    const variante = (producto.variantes || []).find((v) => v.id === varianteId);
    return variante ? { producto, variante } : null;
  }

  // ------------------------------------------------------------------ reconocer
  /* ¿Contradice algo la relación confirmada? "" = no.
     - El público de la zapatilla: el de hoy frente al de cuando se confirmó (etiqueta). Hombre, Dama y Unisex son
       versiones distintas: un cambio se revisa, diga lo que diga la entrega.
     - El público de la entrega: distinto del de la zapatilla, salvo que se confirmara así a sabiendas.
     - El modelo: la lectura de HOY frente a la de entonces (no frente al nombre del catálogo, que se puede haber
       corregido). Los nombres y los colores del catálogo no cuentan. */
  const NOMBRE_PUBLICO = { hombre: "Hombre", dama: "Dama", unisex: "Unisex" };
  const nombrePublico = (p) => NOMBRE_PUBLICO[p] || p || "público sin indicar";
  function contradiccion({ leido, asociacion, destino, claveModelo }) {
    const { origen = {}, etiqueta = {} } = asociacion || {};
    const hoy = claveModelo(leido?.marca || "", leido?.modelo || "");
    const antes = claveModelo(origen.marca || "", origen.modelo || "");
    const actual = claveModelo(destino.producto.marca || "", destino.producto.nombre || "");
    const publico = destino.producto.publico || "";
    if (etiqueta.publico && etiqueta.publico !== publico) {
      return `Cuando confirmaste la relación, la zapatilla era para ${nombrePublico(etiqueta.publico)} y ahora es para ${nombrePublico(publico)}: las versiones no se mezclan solas.`;
    }
    const aSabiendas = origen.publico === leido?.publico && etiqueta.publico === publico;
    if (leido?.publico && publico && leido.publico !== publico && !aSabiendas) {
      return `La entrega dice ${nombrePublico(leido.publico)} y la zapatilla relacionada es para ${nombrePublico(publico)}: las versiones no se mezclan solas.`;
    }
    if (hoy && antes && hoy !== antes && hoy !== actual) {
      return `La entrega dice «${[leido.marca, leido.modelo].filter(Boolean).join(" ")}» y, cuando confirmaste la relación, decía «${[origen.marca, origen.modelo].filter(Boolean).join(" ")}».`;
    }
    return "";
  }

  /* Estado de una entrada frente a la memoria:
       reconocida · desactivada · retirada · inexistente · contradictoria · ambigua · parecida · por-vincular
       · sin (ninguna) · sin-proveedor · sin-identidad
     «elegida» solo existe en «reconocida»: una asociación exacta, única, confirmada y con destino vigente. */
  const grisLeido = new Map(); // gris en hexadecimal → bytes (se lee una sola vez)
  function bytesDe(hex) {
    if (!grisLeido.has(hex)) grisLeido.set(hex, Uint8Array.from(hex.match(/../g), (h) => parseInt(h, 16)));
    return grisLeido.get(hex);
  }
  function reconocer({ identidades = [], leido = {}, proveedor = "", asociaciones = [], catalogo = [], claveModelo, distancia, umbral }) {
    const r = (estado, mas = {}) => ({ estado, elegida: null, candidatos: [], motivo: "", ...mas });
    if (!proveedor) return r("sin-proveedor", { motivo: "Elige el proveedor de esta entrega para usar las relaciones recordadas." });
    const validas = identidades.filter(identidadValida);
    if (!validas.length) return r("sin-identidad", { motivo: "Sin fotografía de origen con la que comparar." });
    const propias = asociaciones.filter((a) => a.proveedor === proveedor);
    const exactas = propias.filter((a) => validas.some((i) => i.tipo === a.tipo && i.exacta === a.exacta));
    const unicas = (lista) => [...new Map(lista.map((x) => [x.variante, x])).values()];
    const confirmadas = unicas(exactas.filter((a) => a.estado === "confirmada" && a.producto && a.variante).map((a) => ({ producto: a.producto, variante: a.variante, asociacion: a, distancia: 0, exacta: true })));
    if (confirmadas.length > 1) return r("ambigua", { candidatos: confirmadas, motivo: "Esta fotografía está relacionada con más de un color: elige el que corresponde en esta entrega." });
    if (confirmadas.length === 1) {
      const c = confirmadas[0];
      const destino = buscarDestino(catalogo, c.producto, c.variante);
      if (!destino) return r("inexistente", { candidatos: confirmadas, motivo: "La zapatilla o el color de la relación recordada ya no existe en el catálogo." });
      if (destino.producto.retirado_en) return r("retirada", { candidatos: confirmadas, motivo: "La zapatilla relacionada está retirada del catálogo: no se restaura ni se actualiza desde aquí (se restaura en el editor)." });
      const choque = contradiccion({ leido, asociacion: c.asociacion, destino, claveModelo });
      if (choque) return r("contradictoria", { candidatos: confirmadas, motivo: choque });
      if (!destino.variante.activa) return r("desactivada", { candidatos: confirmadas, motivo: "El color relacionado está desactivado: se conserva así. Confírmalo si quieres compararlo." });
      return r("reconocida", { elegida: { producto: c.producto, variante: c.variante }, candidatos: confirmadas, motivo: "Fotografía reconocida por la relación que confirmaste." });
    }
    const pendientes = exactas.filter((a) => a.estado === "por-vincular");
    if (pendientes.length) {
      const e = pendientes[0].etiqueta || {};
      return r("por-vincular", { motivo: `Un respaldo de otro proyecto o usuario la relacionaba con «${[e.marca, e.modelo, e.color].filter(Boolean).join(" · ") || "una zapatilla"}»: búscala en este catálogo y confírmala.` });
    }
    // Aproximada (huella gris): solo propone.
    const cerca = new Map();
    const grises = validas.filter((i) => GRIS.test(i.gris || "")).map((i) => bytesDe(i.gris));
    for (const a of grises.length ? propias : []) {
      if (a.estado !== "confirmada" || !a.variante || !GRIS.test(a.gris || "")) continue;
      for (const g of grises) {
        const d = distancia(g, bytesDe(a.gris));
        if (d <= umbral && (!cerca.has(a.variante) || cerca.get(a.variante).distancia > d)) cerca.set(a.variante, { producto: a.producto, variante: a.variante, asociacion: a, distancia: d, exacta: false });
      }
    }
    const candidatos = [...cerca.values()].filter((c) => buscarDestino(catalogo, c.producto, c.variante)).sort((x, y) => x.distancia - y.distancia);
    if (!candidatos.length) return r("sin");
    if (candidatos.length > 1) return r("ambigua", { candidatos, motivo: "Se parece a fotografías de varios colores: elige el que corresponde (o ninguno)." });
    const destino = buscarDestino(catalogo, candidatos[0].producto, candidatos[0].variante);
    if (destino.producto.retirado_en) return r("retirada", { candidatos, motivo: "Se parece a una fotografía de una zapatilla retirada del catálogo." });
    const choque = contradiccion({ leido, asociacion: candidatos[0].asociacion, destino, claveModelo });
    if (choque) return r("contradictoria", { candidatos, motivo: `La fotografía se parece, pero los datos no coinciden. ${choque}` });
    return r("parecida", { candidatos, motivo: "Fotografía parecida, no idéntica: compárala y confírmala antes de usarla." });
  }

  // Mismo modelo en el catálogo (marca y modelo): orientan la búsqueda; nunca identifican un color.
  function mismoModelo({ leido = {}, catalogo = [], claveModelo }) {
    const k = claveModelo(leido.marca || "", leido.modelo || "");
    if (!k) return { mismas: [], otras: [] };
    const todas = catalogo.filter((p) => !p.retirado_en && claveModelo(p.marca, p.nombre) === k);
    if (!leido.publico) return { mismas: todas, otras: [] };
    return { mismas: todas.filter((p) => !p.publico || p.publico === leido.publico), otras: todas.filter((p) => p.publico && p.publico !== leido.publico) };
  }

  // ------------------------------------------------------------------ fechas
  // «[22/11/26, 10:15]», «22/11/2026, 10:15 -» o «[10:15 a. m., 22/11/2026]» → 2026-11-22 (día/mes/año).
  function fechaEncabezado(prefijo) {
    const m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?!\d)/.exec(String(prefijo || ""));
    if (!m) return null;
    const [dia, mes] = [Number(m[1]), Number(m[2])];
    const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(Date.UTC(ano, mes - 1, dia));
    if (mes < 1 || mes > 12 || d.getUTCDate() !== dia || d.getUTCMonth() !== mes - 1) return null;
    return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  }
  const fechaValida = (f) => (typeof f === "string" && FECHA.test(f) ? f : null);
  // Fecha del último documento revisado de un proveedor (solo cuentan las conocidas).
  function ultimaFecha(historial, proveedor) {
    let mayor = null;
    for (const h of historial) {
      const f = h.proveedor === proveedor && h.revisado ? fechaValida(h.fecha) : null;
      if (f && (!mayor || f > mayor)) mayor = f;
    }
    return mayor;
  }
  // desconocida · primera (no hay nada revisado) · anterior · igual · posterior
  function situarFecha(fecha, ultima) {
    if (!fechaValida(fecha)) return "desconocida";
    if (!ultima) return "primera";
    return fecha < ultima ? "anterior" : fecha === ultima ? "igual" : "posterior";
  }

  // ------------------------------------------------------------------ última información conocida
  /* Lo más reciente de un color: por la FECHA del documento (uno atrasado que se revisa hoy no pasa a ser lo
     último); los de fecha desconocida solo cuentan si no hay ninguno con fecha. */
  function ultimo(historial, proveedor, variante, { conCoste = false, conTallas = false } = {}) {
    const propias = historial.filter((h) => h.proveedor === proveedor && h.variante === variante && h.revisado && (!conCoste || Number.isInteger(h.revisado.coste)) && (!conTallas || h.revisado.tallas?.length));
    const conFecha = propias.filter((h) => fechaValida(h.fecha));
    const lista = conFecha.length ? conFecha : propias;
    const orden = (a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")) || String(b.revisado.cuando).localeCompare(String(a.revisado.cuando));
    return [...lista].sort(orden)[0] || null;
  }
  const mismosCostes = (a, b) => JSON.stringify((a || []).map((x) => [x.importe, x.condicion || "", Boolean(x.general)]).sort()) === JSON.stringify((b || []).map((x) => [x.importe, x.condicion || "", Boolean(x.general)]).sort());
  /* Coste del proveedor frente al último conocido. Varios importes o uno condicionado: hay que elegir; nunca
     se toma el menor. estado: sin-dato · por-elegir · sin-historial · igual · cambio */
  function compararCoste({ costes = [], elegido = null, anterior = null }) {
    const previo = Number.isInteger(anterior?.revisado?.coste) ? anterior.revisado.coste : null;
    if (!costes.length) return { estado: "sin-dato", valor: null, previo, elegir: false };
    const elegir = costes.length > 1 || !costes[0].general;
    let valor = elegir ? null : costes[0].importe;
    if (elegir && Number.isInteger(elegido) && costes[elegido]) valor = costes[elegido].importe;
    // Los mismos importes y condiciones que ya se revisaron: se mantiene la elección de entonces.
    if (elegir && valor === null && anterior && mismosCostes(costes, anterior.revisado.costes) && previo !== null) return { estado: "igual", valor: previo, previo, elegir, mantenido: true };
    if (valor === null) return { estado: "por-elegir", valor: null, previo, elegir };
    if (previo === null) return { estado: "sin-historial", valor, previo, elegir };
    return { estado: valor === previo ? "igual" : "cambio", valor, previo, elegir };
  }

  // ------------------------------------------------------------------ tallas
  /* nuevas: en la entrega y no en el color (se proponen; las equivalentes como 40,5 y 40 1/2 no se repiten).
     ausentes: en el color y no mencionadas hoy (se conservan). desactivadas: mencionadas, existen
     desactivadas (se conservan así). */
  function compararTallas({ entrega = [], existentes = [], racional, equivalentes }) {
    const r = (t) => racional(String(t));
    const iguales = (a, b) => { const x = r(a); const y = r(b); return Boolean(x && y && equivalentes(x, y)); };
    const nuevas = entrega.filter((t) => r(t) && !existentes.some((e) => iguales(t, e.talla)));
    return {
      nuevas,
      ausentes: entrega.length ? existentes.filter((e) => e.activa && !entrega.some((t) => iguales(t, e.talla))).map((e) => e.talla) : [],
      desactivadas: existentes.filter((e) => !e.activa && entrega.some((t) => iguales(t, e.talla))).map((e) => e.talla)
    };
  }

  /* Tallas ANUNCIADAS por el proveedor frente a las de la última entrega revisada que traía tallas (es otra cosa
     que compararlas con el catálogo). retiradas: se anunciaban y ya no; agregadas: no se anunciaban y ahora sí.
     estado: sin-dato (la entrega no trae tallas: no es una lista vacía) · sin-historial · igual · cambio.
     Lo revisado no insiste: la misma entrega o, si no es más reciente que esa referencia (o no tiene fecha), lo
     mismo que lo último que se revisó. */
  function compararAnunciadas({ historial = [], proveedor, variante, entrega, lugar, fecha, tallas = [], racional, equivalentes }) {
    const r = (t) => racional(String(t));
    const iguales = (a, b) => { const x = r(a); const y = r(b); return Boolean(x && y && equivalentes(x, y)); };
    const faltan = (lista, en) => lista.filter((t) => !en.some((x) => iguales(t, x)));
    const mismas = (a, b) => !faltan(a, b).length && !faltan(b, a).length;
    const hoy = tallas.filter((t) => r(t));
    const anterior = ultimo(historial, proveedor, variante, { conTallas: true });
    const salida = (estado, mas = {}) => ({ estado, anterior, retiradas: [], agregadas: [], ...mas });
    if (!hoy.length) return salida("sin-dato");
    if (!anterior) return salida("sin-historial");
    const previas = anterior.revisado.tallas;
    if (mismas(previas, hoy)) return salida("igual");
    const conTallas = historial.filter((h) => h.proveedor === proveedor && h.variante === variante && h.revisado?.tallas?.length);
    const propia = conTallas.find((h) => h.id === idHistorial(proveedor, variante, entrega, lugar));
    const masReciente = fechaValida(fecha) && fechaValida(anterior.fecha) && fecha > anterior.fecha;
    const vista = masReciente ? null : [...conTallas].sort((a, b) => String(b.revisado.cuando).localeCompare(String(a.revisado.cuando)))[0];
    if ([propia, vista].some((h) => h && mismas(h.revisado.tallas, hoy))) return salida("igual", { yaRevisada: true });
    return salida("cambio", { retiradas: faltan(previas, hoy), agregadas: faltan(hoy, previas) });
  }

  // ------------------------------------------------------------------ diferencias de una entrada resuelta
  function diferencias({ entrega, destino, anterior, anteriorCoste = null, anunciadas = null, elegido = null, racional, equivalentes }) {
    const { variante } = destino;
    const coste = compararCoste({ costes: entrega.costes, elegido, anterior: anteriorCoste });
    const sugerida = Number.isInteger(entrega.ventaSugerida) && entrega.ventaSugerida > 0 ? entrega.ventaSugerida : null;
    const previaSugerida = Number.isInteger(anterior?.revisado?.ventaSugerida) ? anterior.revisado.ventaSugerida : null;
    const tallas = compararTallas({ entrega: entrega.tallas, existentes: variante.tallas || [], racional, equivalentes });
    const marcas = {
      // Sin historial, la venta sugerida se compara con el precio del catálogo; con historial, con la última revisada.
      precio: coste.estado === "cambio" || coste.estado === "por-elegir" || Boolean(sugerida && (previaSugerida !== null ? sugerida !== previaSugerida : sugerida !== variante.precio)),
      // Tallas que se podrían añadir, o que el proveedor anuncia distintas que en la última entrega revisada.
      tallas: tallas.nuevas.length > 0 || anunciadas?.estado === "cambio"
    };
    return { coste, sugerida, previaSugerida, precio: variante.precio, tallas, anunciadas, marcas, anterior, anteriorCoste };
  }

  // ------------------------------------------------------------------ consolidar los cambios de un producto
  const clonar = (x) => JSON.parse(JSON.stringify(x));
  /* base: el cuerpo COMPLETO del producto (el mismo que arma el editor, con activa_original en cada talla).
     cambios: [{ tipo: "precio", variante, valor } | { tipo: "talla", variante, talla, id } |
     { tipo: "foto", variante, ruta } | { tipo: "color", datos }]. Devuelve { cuerpo, aplicados, errores }:
     «aplicados» son los que de verdad cambian algo (lo ya igual no cuenta ni se envía). */
  function consolidar(base, cambios, { limites, racional, equivalentes }) {
    const cuerpo = clonar(base);
    const aplicados = [];
    const errores = [];
    const precios = new Map();
    const varianteDe = (id) => cuerpo.variantes.find((v) => v.id === id);
    const existe = (v, talla) => v.tallas.some((t) => { const a = racional(t.talla); const b = racional(String(talla)); return a && b && equivalentes(a, b); });
    const mayus = (t) => String(t ?? "").trim().toLocaleUpperCase("es");
    for (const c of cambios) {
      if (c.tipo === "color") {
        if (varianteDe(c.datos.id)) continue; // ya está (reintento)
        if (cuerpo.variantes.length >= limites.colores) { errores.push({ entrada: c.entrada, mensaje: `La zapatilla ya tiene ${limites.colores} colores.` }); continue; }
        if (cuerpo.variantes.some((v) => mayus(v.color) === mayus(c.datos.color))) { errores.push({ entrada: c.entrada, mensaje: `Esa zapatilla ya tiene un color ${mayus(c.datos.color)}: elige «Actualizar un color existente» o cambia el nombre.` }); continue; }
        const orden = Math.max(-1, ...cuerpo.variantes.map((v) => Number(v.orden) || 0)) + 1;
        cuerpo.variantes.push({ ...clonar(c.datos), orden });
        aplicados.push(c);
        continue;
      }
      const v = varianteDe(c.variante);
      if (!v) { errores.push({ entrada: c.entrada, mensaje: "El color ya no existe en la zapatilla." }); continue; }
      if (c.tipo === "precio") {
        if (precios.has(v.id) && precios.get(v.id) !== c.valor) { errores.push({ entrada: c.entrada, mensaje: `Dos entradas proponen precios distintos para ${v.color}: deja solo uno.` }); continue; }
        if (precios.has(v.id)) continue;
        precios.set(v.id, c.valor);
        if (v.precio === c.valor) continue;
        if (v.precio_anterior > 0 && v.precio_anterior <= c.valor) { errores.push({ entrada: c.entrada, mensaje: `${v.color} tiene un precio anterior de $${v.precio_anterior.toLocaleString("es-CO")}: con el precio nuevo dejaría de ser un descuento. Ajústalo en el editor.` }); continue; }
        v.precio = c.valor;
        aplicados.push(c);
      } else if (c.tipo === "talla") {
        if (existe(v, c.talla)) continue;
        if (v.tallas.length >= limites.tallas) { errores.push({ entrada: c.entrada, mensaje: `${v.color} ya tiene ${limites.tallas} tallas.` }); continue; }
        v.tallas.push({ id: c.id, talla: c.talla, activa: true }); // nueva: nace «por revisar» en el servidor
        aplicados.push(c);
      } else if (c.tipo === "foto") {
        if (v.fotos.some((f) => f.ruta === c.ruta)) continue;
        if (v.fotos.length >= limites.fotos) { errores.push({ entrada: c.entrada, mensaje: `La galería de ${v.color} ya tiene ${limites.fotos} fotos.` }); continue; }
        v.fotos.push({ ruta: c.ruta, alt: null }); // al final: no cambia la principal ni el orden
        aplicados.push(c);
      }
    }
    return { cuerpo, aplicados, errores };
  }

  // ------------------------------------------------------------------ respaldo de la memoria
  const FORMATO = "gama-talla/memoria-inventario";
  const VERSION = 1;
  const BYTES_MAX = 80 * 1024 * 1024;
  const LIMITES = { proveedores: 500, asociaciones: 30000, historial: 80000 };
  const corto = (t, n) => String(t ?? "").slice(0, n);
  const ID_PROVEEDOR = /^(?:perfil:[a-z0-9][a-z0-9-]{0,63}|prov:[0-9a-f-]{36})$/i; // los perfiles ya tienen su propio identificador
  const esFechaHora = (t) => typeof t === "string" && t.length <= 40 && !Number.isNaN(Date.parse(t));
  const etiquetaLimpia = (e) => ({ marca: corto(e?.marca, 80), modelo: corto(e?.modelo, 160), publico: corto(e?.publico, 20), color: corto(e?.color, 80), codigo: corto(e?.codigo, 40), codigoColor: corto(e?.codigoColor, 60) });
  const origenLimpio = (o) => ({ documento: corto(o?.documento, 200), huella: corto(o?.huella, 64), fecha: fechaValida(o?.fecha), lugar: corto(o?.lugar, 80), texto: corto(o?.texto, 300), marca: corto(o?.marca, 80), modelo: corto(o?.modelo, 160), publico: corto(o?.publico, 20) });
  const costesLimpios = (l) => (Array.isArray(l) ? l : []).slice(0, 6).filter((x) => Number.isInteger(x?.importe) && x.importe > 0).map((x) => ({ importe: x.importe, condicion: corto(x.condicion, 120), general: Boolean(x.general) }));

  function proveedorLimpio(p) {
    return p && ID_PROVEEDOR.test(String(p.id)) && typeof p.nombre === "string" && p.nombre.trim() ? { id: p.id, nombre: corto(p.nombre.trim(), 80), creado: esFechaHora(p.creado) ? p.creado : new Date().toISOString() } : null;
  }
  function asociacionLimpia(a) {
    if (!a || !ID_PROVEEDOR.test(String(a.proveedor)) || !identidadValida(a)) return null;
    const vinculada = a.estado === "confirmada" && UUID.test(String(a.producto)) && UUID.test(String(a.variante));
    if (!vinculada && a.estado !== "por-vincular") return null;
    const base = { proveedor: a.proveedor, tipo: a.tipo, exacta: a.exacta, gris: GRIS.test(a.gris || "") ? a.gris : "", etiqueta: etiquetaLimpia(a.etiqueta), origen: origenLimpio(a.origen), via: corto(a.via, 20),
      creado: esFechaHora(a.creado) ? a.creado : new Date().toISOString(), actualizado: esFechaHora(a.actualizado) ? a.actualizado : new Date().toISOString() };
    return vinculada
      ? { ...base, id: idAsociacion(a.proveedor, a, a.variante), estado: "confirmada", producto: a.producto, variante: a.variante }
      : { ...base, id: idAsociacion(a.proveedor, a, `sin:${corto(String(a.id || "").split("|").pop().replace(/^sin:/, ""), 40)}`), estado: "por-vincular", producto: null, variante: null };
  }
  function historialLimpio(h) {
    if (!h || !ID_PROVEEDOR.test(String(h.proveedor)) || !UUID.test(String(h.producto)) || !UUID.test(String(h.variante)) || !corto(h.entrega, 80) || !h.revisado || !esFechaHora(h.revisado.cuando)) return null;
    const entero = (n) => (Number.isInteger(n) && n >= 0 && n <= 1e9 ? n : null);
    return {
      id: idHistorial(h.proveedor, h.variante, corto(h.entrega, 80), corto(h.lugar, 80)), proveedor: h.proveedor, producto: h.producto, variante: h.variante,
      entrega: corto(h.entrega, 80), lugar: corto(h.lugar, 80), documento: corto(h.documento, 200), fecha: fechaValida(h.fecha),
      revisado: { cuando: h.revisado.cuando, costes: costesLimpios(h.revisado.costes), coste: entero(h.revisado.coste), ventaSugerida: entero(h.revisado.ventaSugerida),
        precioCatalogo: entero(h.revisado.precioCatalogo), tallas: (Array.isArray(h.revisado.tallas) ? h.revisado.tallas : []).slice(0, 40).map((t) => corto(t, 12)) },
      aplicado: (Array.isArray(h.aplicado) ? h.aplicado : []).slice(-20).filter((x) => UUID.test(String(x?.operacion)) && esFechaHora(x.cuando))
        .map((x) => ({ operacion: x.operacion, cuando: x.cuando, cambios: (Array.isArray(x.cambios) ? x.cambios : []).slice(0, 60).map((t) => corto(t, 160)) }))
    };
  }
  /* Une un registro de historial con el que hubiera de la misma entrega: lo revisado se actualiza; lo aplicado
     se acumula por operación (repetir un guardado no duplica entradas). */
  function fusionarHistorial(previo, nuevo) {
    if (!previo) return nuevo;
    const aplicado = new Map([...(previo.aplicado || []), ...(nuevo.aplicado || [])].map((x) => [x.operacion, x]));
    return { ...nuevo, revisado: nuevo.revisado || previo.revisado, aplicado: [...aplicado.values()] };
  }

  function empaquetarMemoria({ ambito, proveedores, asociaciones, historial }) {
    return new Blob([JSON.stringify({ formato: FORMATO, version: VERSION, exportado: new Date().toISOString(), ambito: { proyecto: ambito.proyecto, usuario: ambito.usuario }, proveedores, asociaciones, historial })], { type: "application/json" });
  }
  /* Valida un archivo de memoria. Devuelve { ambito, proveedores, asociaciones, historial, descartados } o lanza
     Error con el motivo. No escribe nada. */
  async function leerMemoria(archivo) {
    if (!(archivo instanceof Blob)) throw new Error("No es un archivo.");
    if (archivo.size > BYTES_MAX) throw new Error("El archivo es demasiado grande para ser una memoria de inventario.");
    let d;
    try { d = JSON.parse(await archivo.text()); } catch { throw new Error("No es una memoria de inventario (no es JSON válido)."); }
    if (!d || typeof d !== "object" || d.formato !== FORMATO) throw new Error("No es una memoria de inventario de Gama & Talla.");
    if (d.version !== VERSION) throw new Error(`Versión de memoria no admitida (${corto(d.version, 10)}). Esta versión del panel lee la ${VERSION}.`);
    if (!d.ambito || typeof d.ambito.proyecto !== "string" || d.ambito.proyecto.length > 300 || !UUID.test(String(d.ambito.usuario))) throw new Error("El archivo no indica su proyecto y usuario.");
    for (const k of Object.keys(LIMITES)) if (!Array.isArray(d[k]) || d[k].length > LIMITES[k]) throw new Error(`La lista de ${k} no es válida.`);
    const limpiar = (lista, f) => { const ok = lista.map(f).filter(Boolean); return [...new Map(ok.map((x) => [x.id, x])).values()]; };
    const proveedores = limpiar(d.proveedores, proveedorLimpio);
    const conocidos = new Set(proveedores.map((p) => p.id));
    const asociaciones = limpiar(d.asociaciones, asociacionLimpia).filter((a) => conocidos.has(a.proveedor));
    const historial = limpiar(d.historial, historialLimpio).filter((h) => conocidos.has(h.proveedor));
    return { ambito: { proyecto: d.ambito.proyecto, usuario: d.ambito.usuario }, proveedores, asociaciones, historial,
      descartados: d.proveedores.length + d.asociaciones.length + d.historial.length - proveedores.length - asociaciones.length - historial.length };
  }
  /* Memoria de OTRO proyecto o usuario: sus UUID no valen aquí. Se conservan la huella y la descripción de
     cada relación como «por vincular» (hay que buscarla y confirmarla); el historial no se importa. */
  function adaptarMemoria(m) {
    return { ...m, historial: [], asociaciones: m.asociaciones.map((a) => asociacionLimpia({ ...a, estado: "por-vincular", id: a.variante || a.id, producto: null, variante: null })).filter(Boolean) };
  }

  window.GamaTallaInventario = Object.freeze({
    identidadValida, idAsociacion, idHistorial, buscarDestino, reconocer, mismoModelo, fechaEncabezado, fechaValida, ultimaFecha, situarFecha,
    ultimo, compararCoste, compararTallas, compararAnunciadas, diferencias, consolidar, fusionarHistorial, costesLimpios,
    proveedorLimpio, asociacionLimpia, historialLimpio, empaquetarMemoria, leerMemoria, adaptarMemoria, FORMATO, VERSION, ID_PROVEEDOR
  });
})();
