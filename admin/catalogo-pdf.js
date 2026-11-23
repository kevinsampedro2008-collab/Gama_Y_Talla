/* Panel privado de Gama & Talla · etapa 21: leer catálogos PDF del proveedor.
 *
 * Reconstruye las tarjetas de producto de un catálogo PDF (foto + descripción + importes) en el
 * navegador, con PDF.js (copia local y fijada en vendor/pdfjs-dist-6.4.299, cargada solo cuando se usa).
 * No escribe en Supabase ni usa servicios externos: el importador (importador.js) muestra la revisión
 * y solo «Añadir al lote» convierte tarjetas en fichas.
 *
 *  - Tarjeta = un marco (rectángulo dibujado) que contiene UNA foto. El texto de la tarjeta es el que cae
 *    dentro de su marco: nunca se mezcla con columnas, filas ni productos vecinos. Lo que cae sobre la
 *    foto (la etiqueta «NUEVO») es un adorno; lo que va en un recuadro pequeño bajo la foto es un
 *    importe destacado (el precio de venta sugerido de «Novedades»).
 *  - Fuera quedan la portada (un marco con varias fotos), cabeceras, números de página y la despedida.
 *  - La foto es la imagen ORIGINAL embebida (sus píxeles), no la página renderizada: no lleva etiquetas
 *    de precio. Huellas: exacta (SHA-256 de los píxeles) y gris 16×16 (para fotos recodificadas).
 *  - Los documentos se relacionan por la huella de la foto, no por identificadores internos del PDF ni
 *    por el orden. Varias coincidencias posibles quedan para revisión: nunca se elige una sola.
 *  - Importes: se conservan todos con su condición («DISPONIBLE POR CAJA»). Ninguno se elige solo.
 *  - Clasificación: calzado, otro artículo o «revisar», por señales del texto (tallas EU/Euro,
 *    «Tallas», «Numeración», «TODAS LAS TALLAS», palabras de calzado y de otros artículos). La marca
 *    sola nunca decide.
 *
 * Funciones puras (sin DOM): también se usan desde Node para validar los PDF reales.
 */
(function (raiz, fabrica) {
  "use strict";
  const api = fabrica(raiz);
  if (typeof module === "object" && module.exports) module.exports = api;
  else raiz.GamaTallaCatalogoPdf = api;
})(typeof window !== "undefined" ? window : globalThis, (raiz) => {
  "use strict";

  const VERSION_PDFJS = "6.4.299";
  const RUTA_PDFJS = `vendor/pdfjs-dist-${VERSION_PDFJS}/`;
  // Límites razonables para un catálogo diario (documentados en LEEME.md).
  const LIMITES = Object.freeze({
    documentos: 3,                  // uno por papel
    bytesMax: 40 * 1024 * 1024,     // 40 MB por PDF
    paginasMax: 120,
    tarjetasMax: 400,               // por documento (también es el máximo de fichas de un lote)
    imagenesPorPagina: 60,
    megapixelesImagen: 25           // una foto mayor es anómala para un catálogo
  });
  const PAPELES = Object.freeze({
    venta: { nombre: "Descripciones, fotografías y precios de venta sugeridos", corto: "Venta sugerida" },
    proveedor: { nombre: "Precios del proveedor", corto: "Precios del proveedor" },
    descripcion: { nombre: "Descripciones y fotografías", corto: "Descripciones" }
  });
  // Prioridad para elegir el documento principal (el que da descripciones y fotos a la revisión).
  const ORDEN_PRINCIPAL = ["venta", "descripcion", "proveedor"];
  // Huella gris: distancia media (0–255) por debajo de la cual dos fotos son la misma (recodificada).
  // En los catálogos reales, fotos DISTINTAS muy parecidas (mismo modelo en otro color) quedan por encima de 8.
  const UMBRAL_IGUAL = 3;
  const MARGEN_AMBIGUO = 3;
  const LADO_HUELLA = 16;

  // ------------------------------------------------------------------ texto
  const sinTildes = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC");
  const normal = (t) => sinTildes(t).toLocaleUpperCase("es").replace(/\s+/g, " ").trim();
  // «N U E V O» (letras espaciadas como adorno) → «NUEVO».
  const juntarEspaciado = (t) => (/^(?:\S ){2,}\S$/u.test(t.trim()) ? t.trim().replace(/ /g, "") : t);

  // ------------------------------------------------------------------ geometría
  const mult = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  function cajaDe(m, x0, y0, x1, y1) {
    const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  const area = (r) => r.w * r.h;
  const centro = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const dentro = (p, r, m = 0) => p.x >= r.x - m && p.x <= r.x + r.w + m && p.y >= r.y - m && p.y <= r.y + r.h + m;
  const redondear = (n) => Math.round(n * 10) / 10;

  /* Lee una página de PDF.js: textos con posición, imágenes con su caja y rectángulos dibujados.
     Coordenadas del PDF (origen abajo a la izquierda, en puntos). */
  async function leerPagina(pagina, OPS) {
    const vista = pagina.getViewport({ scale: 1 });
    const contenido = await pagina.getTextContent();
    const textos = [];
    for (const it of contenido.items) {
      if (!it.str || !it.str.trim()) continue;
      const [a, b, c, d, e, f] = it.transform;
      const tam = Math.hypot(c, d) || Math.hypot(a, b) || 1;
      textos.push({ t: it.str, x: e, y: f, tam, ancho: it.width || tam * it.str.length * 0.5 });
    }
    const ops = await pagina.getOperatorList();
    let ctm = [1, 0, 0, 1, 0, 0];
    const pila = [];
    const imagenes = [];
    const rects = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i];
      if (fn === OPS.save) pila.push(ctm);
      else if (fn === OPS.restore) ctm = pila.pop() || ctm;
      else if (fn === OPS.transform) ctm = mult(ctm, args);
      else if (fn === OPS.paintFormXObjectBegin) { pila.push(ctm); if (Array.isArray(args?.[0]) || ArrayBuffer.isView(args?.[0])) ctm = mult(ctm, [...args[0]]); }
      else if (fn === OPS.paintFormXObjectEnd) ctm = pila.pop() || ctm;
      else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
        const caja = cajaDe(ctm, 0, 0, 1, 1);
        imagenes.push({ nombre: fn === OPS.paintImageXObject ? args[0] : null, objeto: fn === OPS.paintInlineImageXObject ? args[0] : null, ...caja });
      } else if (fn === OPS.constructPath) {
        // El último argumento es la caja [minX, minY, maxX, maxY] del trazado (en el espacio actual).
        const mm = [...args].reverse().find((v) => (Array.isArray(v) || ArrayBuffer.isView(v)) && v.length === 4 && [...v].every(Number.isFinite));
        if (mm) {
          const r = cajaDe(ctm, mm[0], mm[1], mm[2], mm[3]);
          if (r.w > 1 && r.h > 1) rects.push(r);
        }
      }
    }
    return { numero: pagina.pageNumber, ancho: vista.width, alto: vista.height, textos, imagenes, rects };
  }

  /* Tarjetas de una página: [{ caja, imagen, lineas, destacados, etiquetas, conMarco }], en orden de lectura
     (filas de arriba abajo; en cada fila, de izquierda a derecha), y los textos que no son de ninguna. */
  function tarjetasDePagina(pag) {
    const { ancho, alto } = pag;
    const areaPag = ancho * alto;
    // Fotos: ni adornos diminutos ni una página escaneada entera.
    const fotos = pag.imagenes.filter((im) => area(im) >= areaPag * 0.015 && area(im) <= areaPag * 0.85);
    const escaneada = pag.imagenes.some((im) => area(im) > areaPag * 0.85);
    const marcos = pag.rects.filter((r) => r.w >= ancho * 0.12 && r.h >= alto * 0.1 && area(r) < areaPag * 0.9);
    const fotosEn = (m) => fotos.filter((o) => dentro(centro(o), m));
    let tarjetas = [];
    for (const im of fotos) {
      const cand = marcos.filter((m) => dentro(centro(im), m) && area(m) >= area(im) * 1.08 && fotosEn(m).length === 1).sort((a, b) => area(a) - area(b));
      if (cand.length) tarjetas.push({ caja: cand[0], imagen: im, conMarco: true });
    }
    // Sin marcos: cada foto suelta (no parte de un collage) con el texto de debajo, en su columna.
    if (!tarjetas.length && !escaneada) {
      const hueco = ancho * 0.03;
      const enCollage = (im) => fotos.some((o) => o !== im && (
        (Math.abs(o.x - (im.x + im.w)) < hueco || Math.abs(im.x - (o.x + o.w)) < hueco) && o.y < im.y + im.h && im.y < o.y + o.h
        || (Math.abs(o.y - (im.y + im.h)) < hueco || Math.abs(im.y - (o.y + o.h)) < hueco) && o.x < im.x + im.w && im.x < o.x + o.w));
      for (const im of fotos.filter((x) => !enCollage(x))) {
        const debajo = fotos.filter((o) => o !== im && o.y + o.h <= im.y && o.x < im.x + im.w && im.x < o.x + o.w).map((o) => o.y + o.h);
        const suelo = Math.max(alto * 0.05, ...debajo, im.y - alto * 0.25);
        const margen = ancho * 0.02;
        tarjetas.push({ caja: { x: im.x - margen, y: suelo, w: im.w + 2 * margen, h: im.y + im.h - suelo + margen }, imagen: im, conMarco: false });
      }
    }
    // Recuadros pequeños dentro de una tarjeta y bajo la foto: importes destacados.
    const recuadros = pag.rects.filter((r) => r.h <= alto * 0.06 && r.w <= ancho * 0.45);
    const libres = [];
    for (const t of tarjetas) Object.assign(t, { lineas: [], destacados: [], etiquetas: [], _items: [] });
    for (const it of pag.textos) {
      const p = { x: it.x + it.ancho / 2, y: it.y + it.tam * 0.35 };
      const t = tarjetas.find((x) => dentro(p, x.caja));
      if (!t) { libres.push(it); continue; }
      if (dentro(p, t.imagen)) { t.etiquetas.push(juntarEspaciado(it.t).trim()); continue; }
      const recuadro = recuadros.find((r) => dentro(p, r) && dentro(centro(r), t.caja) && r.y + r.h <= t.imagen.y + 1);
      t._items.push({ ...it, destacado: Boolean(recuadro) });
    }
    for (const t of tarjetas) {
      t.lineas = lineasDe(t._items.filter((x) => !x.destacado));
      t.destacados = lineasDe(t._items.filter((x) => x.destacado));
      delete t._items;
    }
    const fila = alto * 0.05;
    tarjetas.sort((a, b) => (Math.abs((a.imagen.y + a.imagen.h) - (b.imagen.y + b.imagen.h)) > fila ? (b.imagen.y + b.imagen.h) - (a.imagen.y + a.imagen.h) : a.caja.x - b.caja.x));
    return { tarjetas, libres, escaneada, imagenesSueltas: fotos.filter((im) => !tarjetas.some((t) => t.imagen === im)).length };
  }
  // Agrupa los fragmentos de texto en líneas (misma altura), de arriba abajo.
  function lineasDe(items) {
    const orden = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
    const lineas = [];
    for (const it of orden) {
      const ultima = lineas[lineas.length - 1];
      if (ultima && Math.abs(ultima.y - it.y) <= Math.max(ultima.tam, it.tam) * 0.45) ultima.items.push(it);
      else lineas.push({ y: it.y, tam: it.tam, items: [it] });
    }
    return lineas.map((l) => l.items.sort((a, b) => a.x - b.x).map((x) => juntarEspaciado(x.t)).join(" ").replace(/\s+/g, " ").trim()).filter(Boolean);
  }

  // ------------------------------------------------------------------ fecha y notas del documento
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  function fechaDe(texto) {
    const m = sinTildes(texto).toLowerCase().match(/\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de(?:l)?\s+)?(\d{4})\b/);
    if (!m) return null;
    const mes = (m[2] === "setiembre" ? 8 : MESES.indexOf(m[2])) + 1;
    const dia = Number(m[1]);
    if (dia < 1 || dia > 31) return null;
    return `${m[3]}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  }
  // Notas comerciales fuera de las tarjetas (portada): «Precios sujetos a disponibilidad de tallas».
  const RE_NOTA = /\b(precios?|disponibilidad|sujet[oa]s?|iva|envio|garantia|cambios?)\b/i;

  // ------------------------------------------------------------------ importes
  const RE_IMPORTE = /\$\s*((?:\d{1,3}(?:[.,]\d{3})+)|\d{4,9})(?![\d.,]*\d)/g;
  const RE_CONDICION = /\b(CAJA|CAJAS|MAYOR|MAYORISTA|MAYOREO|DOCENA|DOCENAS|DESDE|PAQUETE|LOTE|UNIDADES|PARES|DOS|TRES|CANTIDAD|CONTADO|EFECTIVO|TRANSFERENCIA|PROMO|PROMOCION|OFERTA|DESCUENTO|ANTES|AHORA|SEPARADO|X\s*\d+|POR\s+\d+)\b/;
  const RE_TALLAS_EN_LINEA = /\b(?:EU|EUR|EURO|TALLAS?)\b[\s:(]*\d{2}(?:[.,]5)?(?:\s*(?:AL|A|-|Y)\s*\d{2}(?:[.,]5)?)?\)?\.?|\b\d{2}\s*(?:AL|A|-)\s*\d{2}\s*(?:EU|EUR|EURO)\b/g;
  const RE_PUBLICO_LINEA = /\b(HOMBRES?|DAMAS?|CABALLEROS?|MUJER(?:ES)?|UNISEX|HOM|NIN[O@A]S?)\b/g;
  /* Importes de unas líneas: [{ importe, condicion, linea, general }]. «general» = sin condición de cantidad,
     forma de pago o promoción. La condición es el texto que acompaña al importe (sin tallas ni público). */
  function leerImportes(lineas) {
    const res = [];
    for (const linea of lineas) {
      const n = normal(linea);
      const encontrados = [...n.matchAll(RE_IMPORTE)];
      if (!encontrados.length) continue;
      for (const m of encontrados) {
        const importe = Number(m[1].replace(/[.,]/g, ""));
        if (!Number.isInteger(importe) || importe <= 0) continue;
        const condicion = n.replace(RE_IMPORTE, " ").replace(RE_TALLAS_EN_LINEA, " ").replace(RE_PUBLICO_LINEA, " ").replace(/[.:;,()]+/g, " ").replace(/\s+/g, " ").trim();
        res.push({ importe, condicion, linea: linea.trim(), general: !RE_CONDICION.test(condicion) });
      }
    }
    return res;
  }

  // ------------------------------------------------------------------ clasificación
  const NUM_TALLA = String.raw`(?:1[5-9]|[2-4]\d|50)(?:[.,]5)?`;
  const RE_EU = new RegExp(String.raw`\b(?:EU|EUR|EURO)\b[\s:(.]*${NUM_TALLA}\b|\b${NUM_TALLA}\s*(?:(?:AL|A|-|Y)\s*${NUM_TALLA}\s*)?(?:EU|EUR|EURO)\b`);
  const RE_TALLAS_NUM = new RegExp(String.raw`\bTALLAS?\b[\s:(]*(?:(?:EU|EUR|EURO)\b[\s:(]*)?${NUM_TALLA}\b`);
  const RE_TODAS = /\bTODAS\s+LAS\s+TALLAS\b/;
  const RE_NUMERACION = /\bNUMERACION\b/;
  const RE_CALZADO = /\b(ZAPATILLAS?|TENIS|SNEAKERS?|CALZADO|ZAPATOS?|BOTAS?|BOTIN(?:ES)?|BOTINES|SANDALIAS?|CHANCLAS?|MOCASIN(?:ES)?|GUAYOS|PANTUFLAS?|CROCS|SUELA)\b/;
  const RE_OTROS = new RegExp([
    String.raw`\b(CAMISETAS?|CAMISAS?|CAMISILLAS?|CONJUNTOS?|LEGGINGS?|LEGGINS?|LICRAS?|SUDADERAS?|HOODIES?|BUZOS?|PANTALON(?:ES)?|PANTALONETAS?|JEANS?|CHAQUETAS?|CHAMARRAS?|GORRAS?|MEDIAS|CALCETINES|TOPS?|BODYS?|VESTIDOS?|FALDAS?|SHORTS?)\b`,
    String.raw`\b(GAFAS|LENTES|RELOJ(?:ES)?|CONSOLAS?|VIDEOJUEGOS?|GAME\s+PLAYER|AUDIFONOS|PARLANTES?|CELULAR(?:ES)?|CARGADOR(?:ES)?|PERFUMES?|BOLSOS?|MORRAL(?:ES)?|MALETAS?|BILLETERAS?|CORREAS?|CINTURON(?:ES)?|MANILLAS?|CADENAS?|ARETES?|BILLETERA)\b`,
    String.raw`\bTALLA\s+UNICA\b|\b\d\s*PIEZAS\b|\bTALLA[S.:\s]+(?:XS|S|M|L|XL|XXL)\b|\b(?:S|M|L|XL)\s*[.,]\s*(?:XL|XXL)\b`
  ].join("|"));
  const RE_INFANTIL = /\b(NIN[O@A]S?|INFANTIL(?:ES)?|KIDS|JUNIOR|BEBES?)\b|NIN@/;
  /* { tipo: "calzado" | "otro" | "revisar", senales: [texto], motivo }. Sobre la DESCRIPCIÓN: los importes
     no clasifican. La marca no es una señal (una camiseta Nike es ropa). */
  function clasificar(lineas) {
    const n = normal(lineas.join(" \n "));
    const senales = [];
    if (RE_EU.test(n)) senales.push("tallas EU/Euro");
    else if (RE_TALLAS_NUM.test(n)) senales.push("tallas numeradas");
    if (RE_TODAS.test(n)) senales.push("«todas las tallas»");
    if (RE_NUMERACION.test(n)) senales.push("numeración");
    const palabraCalzado = n.match(RE_CALZADO);
    if (palabraCalzado) senales.push(`«${palabraCalzado[1].toLowerCase()}»`);
    const otro = n.match(RE_OTROS);
    const calzado = senales.length > 0;
    if (calzado && !otro) return { tipo: "calzado", senales, motivo: `Calzado: ${senales.join(", ")}.` };
    if (otro && !calzado) return { tipo: "otro", senales: [`«${otro[0].toLowerCase()}»`], motivo: `Otro artículo: «${otro[0].toLowerCase()}».` };
    if (otro && calzado) return { tipo: "revisar", senales: [...senales, `«${otro[0].toLowerCase()}»`], motivo: `Señales contradictorias: ${senales.join(", ")} y «${otro[0].toLowerCase()}».` };
    return { tipo: "revisar", senales: [], motivo: n ? "Sin señales de calzado ni de otro artículo: revísala." : "Sin descripción: revísala." };
  }

  // ------------------------------------------------------------------ título → datos para el lector
  // Equivalencias explícitas y acotadas (solo como PRIMERA palabra del título, salvo el público).
  const MARCAS_ABREVIADAS = Object.freeze({ AD: "ADIDAS", NB: "NEW BALANCE", BOSS: "HUGO BOSS" });
  const PUBLICOS = Object.freeze({ HOM: "hombre", HOMBRE: "hombre", HOMBRES: "hombre", CABALLERO: "hombre", CABALLEROS: "hombre",
    DAMA: "dama", DAMAS: "dama", MUJER: "dama", MUJERES: "dama", UNISEX: "unisex" });
  const INFANTILES = new Set(["NIN@", "NINO", "NINA", "NINOS", "NINAS", "INFANTIL", "INFANTILES", "KIDS", "JUNIOR"]);
  const PROMOCIONALES = new Set(["NUEVO", "NUEVA", "NUEVOS", "NUEVAS", "NEW", "PROMO", "OFERTA", "DISPONIBLE"]);
  const COLORES = new Set(["NEGRO", "NEGRA", "BLANCO", "BLANCA", "ROJO", "ROJA", "AZUL", "VERDE", "GRIS", "ROSADO", "ROSADA", "ROSA", "PASTEL",
    "VINOTINTO", "BEIGE", "CAFE", "MARRON", "AMARILLO", "AMARILLA", "NARANJA", "MORADO", "MORADA", "LILA", "CREMA", "HUESO", "PLATEADO",
    "PLATA", "DORADO", "ORO", "FUCSIA", "VIOLETA", "TURQUESA", "NUDE", "MIEL", "ARENA", "OLIVA", "MOSTAZA", "CORAL", "MENTA", "CELESTE",
    "TERRACOTA", "BORGONA", "VINO", "KAKI", "CAQUI", "NAVY", "AQUA", "OSCURO", "CLARO", "Y", "CON"]);
  const NOMBRE_PUBLICO = { hombre: "Hombre", dama: "Dama", unisex: "Unisex" };
  /* Del título de la tarjeta: retira prefijos promocionales, interpreta abreviaturas de marca y el público,
     y separa el color cuando la estructura es clara (MODELO PÚBLICO COLOR). Ante la duda conserva el texto. */
  function prepararTitulo(titulo) {
    const original = String(titulo ?? "").replace(/\s+/g, " ").trim();
    let tokens = original.split(" ").filter(Boolean);
    const cambios = [];
    const promo = [];
    while (tokens.length > 1 && PROMOCIONALES.has(normal(tokens[0]))) { promo.push(tokens.shift()); }
    if (promo.length) cambios.push(`sin «${promo.join(" ")}»`);
    let marca = "";
    const primera = normal(tokens[0] || "");
    if (MARCAS_ABREVIADAS[primera] && !(primera === "BOSS" && promo.length === 0 && normal(original).startsWith("HUGO"))) {
      marca = MARCAS_ABREVIADAS[primera];
      cambios.push(`«${tokens[0]}» = ${marca}`);
      tokens.shift();
    }
    let publico = "";
    let infantil = false;
    let posPublico = -1;
    tokens.forEach((t, i) => {
      const k = normal(t);
      if (PUBLICOS[k] && posPublico < 0) { publico = PUBLICOS[k]; posPublico = i; }
      else if (INFANTILES.has(k) && posPublico < 0) { infantil = true; posPublico = i; }
    });
    let color = "";
    if (posPublico >= 0) {
      const tras = tokens.slice(posPublico + 1);
      if (tras.length && tras.every((t) => COLORES.has(normal(t))) && !["Y", "CON"].includes(normal(tras[0]))) color = tras.join(" ");
      if (tras.length && !color) cambios.push("texto tras el público sin separar");
      tokens = tokens.slice(0, posPublico).concat(color ? [] : tras);
      cambios.push(infantil ? `«${original.split(" ").find((t) => INFANTILES.has(normal(t)))}» = infantil` : `«${original.split(" ").find((t) => PUBLICOS[normal(t)])}» = ${NOMBRE_PUBLICO[publico]}`);
    }
    return { original, marca, resto: tokens.join(" "), publico, infantil, color, promo, cambios, ambiguo: posPublico >= 0 && !color && tokens.length > posPublico };
  }

  /* Datos de una tarjeta a partir de sus documentos.
       descripcion: líneas de descripción (de «venta» o «descripcion»); costes: líneas del documento de
       precios del proveedor (o null); venta: importes destacados del documento de venta (o null).
     Devuelve el mensaje que lee el lector de la etapa 20 (título interpretado, público, color, el resto de
     la descripción y los importes del proveedor), el texto original y lo que falta. */
  function componer({ descripcion = [], costes = null, venta = null, notasVenta = [] }) {
    const lineas = descripcion.map((l) => l.trim()).filter(Boolean);
    // Sin documento de descripciones, las líneas de los costes son lo único que hay: lo que no es importe
    // («EU 36 AL 40», «HOMBRE») se lee igual; no hay título.
    const soloCostes = !lineas.length && Array.isArray(costes) && costes.length > 0;
    const base = soloCostes ? costes.map((l) => l.trim()).filter(Boolean) : lineas;
    const clasificacion = clasificar(base);
    const titulo = prepararTitulo(soloCostes ? "" : lineas[0] || "");
    const resto = soloCostes
      ? base.map((l) => normal(l).replace(RE_IMPORTE, " ").replace(/\bPRECIO\b/g, " ").replace(/[.:;,]+\s*$/g, "").replace(/\s+/g, " ").trim()).filter(Boolean)
      : lineas.slice(1).filter((l) => !leerImportes([l]).length);
    const importesCoste = costes ? leerImportes(costes) : [];
    const importesVenta = venta ? leerImportes(venta) : [];
    const mensaje = [];
    const cabeza = [titulo.marca, titulo.resto].filter(Boolean).join(" ");
    if (cabeza) mensaje.push(cabeza);
    if (titulo.publico) mensaje.push(NOMBRE_PUBLICO[titulo.publico]);
    if (titulo.color) mensaje.push(`Color: ${titulo.color}`);
    mensaje.push(...resto);
    // Importes del proveedor, cada uno con su condición (sin tallas ni público, que ya da la descripción).
    for (const c of importesCoste) mensaje.push(`${c.condicion ? `${c.condicion} ` : ""}$${c.importe.toLocaleString("es-CO").replace(/,/g, ".")}`);
    const tallasDeclaradas = (() => {
      const n = normal(base.join(" "));
      const m = n.match(new RegExp(String.raw`\b(?:EU|EUR|EURO)\b[\s:(]*(${NUM_TALLA})\s*(?:AL|A|-)\s*(${NUM_TALLA})|\b(${NUM_TALLA})\s*(?:AL|A|-)\s*(${NUM_TALLA})\s*(?:EU|EUR|EURO)\b`));
      if (!m) return null;
      const desde = Number((m[1] || m[3]).replace(",", "."));
      const hasta = Number((m[2] || m[4]).replace(",", "."));
      return hasta >= desde ? { desde, hasta } : null;
    })();
    return {
      mensaje: mensaje.join("\n"),
      clasificacion,
      titulo,
      costes: importesCoste,
      ventas: importesVenta,
      // Un solo importe de venta sugerido: se propone. Varios: ninguno (se escribe a mano). Nunca se inventa.
      ventaSugerida: importesVenta.length === 1 ? importesVenta[0].importe : null,
      notasVenta,
      tallasDeclaradas,
      infantil: titulo.infantil || RE_INFANTIL.test(normal(base.join(" ")))
    };
  }

  // ------------------------------------------------------------------ papel propuesto
  /* Papel de un documento por su CONTENIDO (el nombre solo desempata). { papel, motivo }. */
  function proponerPapel(tarjetas, nombre = "") {
    const n = tarjetas.length || 1;
    const conDestacado = tarjetas.filter((t) => leerImportes(t.destacados || []).length).length;
    const conImporte = tarjetas.filter((t) => leerImportes(t.lineas || []).length).length;
    const soloImporte = tarjetas.filter((t) => {
      const sin = normal((t.lineas || []).join(" ")).replace(RE_IMPORTE, " ").replace(RE_TALLAS_EN_LINEA, " ").replace(RE_PUBLICO_LINEA, " ").replace(/\b(PRECIO|VALOR|X|POR|DISPONIBLE|CAJA|MAYOR)\b/g, " ").replace(/[^A-Z0-9]+/g, " ").trim();
      return leerImportes(t.lineas || []).length && sin.split(" ").filter((w) => w.length > 1).length <= 1;
    }).length;
    const porNombre = /precio/i.test(sinTildes(nombre)) ? "proveedor" : /novedad|venta|pvp/i.test(sinTildes(nombre)) ? "venta" : "";
    if (conDestacado / n >= 0.5) return { papel: "venta", motivo: `${conDestacado} de ${tarjetas.length} tarjetas tienen un importe destacado junto a su descripción.` };
    if (soloImporte / n >= 0.5) return { papel: "proveedor", motivo: `${soloImporte} de ${tarjetas.length} tarjetas solo traen importes, sin descripción.` };
    if (conImporte / n < 0.2 && tarjetas.length) return { papel: "descripcion", motivo: "Las tarjetas traen descripciones sin importes." };
    if (porNombre) return { papel: porNombre, motivo: "Propuesto por el nombre del archivo: compruébalo." };
    return { papel: "descripcion", motivo: "No se pudo deducir con seguridad: compruébalo." };
  }

  // ------------------------------------------------------------------ huellas y relación entre documentos
  /* Huella gris LADO×LADO (Uint8Array) de una imagen de PDF.js { width, height, kind, data }. kind: 1 = gris de
     1 bit (empaquetado), 2 = RGB, 3 = RGBA. */
  function grisDe(img, lado = LADO_HUELLA) {
    const { width: w, height: h, kind, data } = img;
    const suma = new Float64Array(lado * lado);
    const cuenta = new Float64Array(lado * lado);
    const canales = kind === 3 ? 4 : kind === 2 ? 3 : 0;
    const fila1 = Math.ceil(w / 8);
    for (let y = 0; y < h; y++) {
      const ky = Math.floor((y * lado) / h) * lado;
      for (let x = 0; x < w; x++) {
        let v;
        if (canales) { const i = (y * w + x) * canales; v = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; }
        else v = (data[y * fila1 + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0;
        const k = ky + Math.floor((x * lado) / w);
        suma[k] += v;
        cuenta[k] += 1;
      }
    }
    const out = new Uint8Array(lado * lado);
    for (let k = 0; k < out.length; k++) out[k] = cuenta[k] ? Math.round(suma[k] / cuenta[k]) : 0;
    return out;
  }
  const aHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const deHex = (hex) => Uint8Array.from(String(hex).match(/../g) || [], (h) => parseInt(h, 16));
  function distancia(a, b) {
    const x = typeof a === "string" ? deHex(a) : a;
    const y = typeof b === "string" ? deHex(b) : b;
    if (!x.length || x.length !== y.length) return Infinity;
    let s = 0;
    for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]);
    return s / x.length;
  }
  async function sha256(bytes) {
    const sutil = raiz.crypto?.subtle;
    if (!sutil) throw new Error("Este navegador no puede calcular huellas (crypto.subtle).");
    // Uint8ClampedArray (píxeles de PDF.js) no es un BufferSource válido en todos los motores: se pasa su vista.
    const vista = ArrayBuffer.isView(bytes) ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : bytes;
    return aHex(new Uint8Array(await sutil.digest("SHA-256", vista)));
  }

  /* Relaciona las tarjetas de «otro» documento con las del principal por la huella de la foto.
     Por cada tarjeta principal: { estado: "exacta" | "parecida" | "ambigua" | "sin", elegida, candidatos: [{ id, distancia, exacta }] }.
     - «elegida»: el id de la tarjeta que se puede usar sin preguntar (la exacta) o proponer (la parecida);
       null si es ambigua o no hay. Quien consuma el resultado usa «elegida»: la posición en «candidatos» no
       significa nada (una foto distinta con la misma huella gris puede ir antes que la exacta). Las
       candidatas se ordenan primero las exactas y luego por distancia, solo para mostrarlas.
     - «exacta»: los mismos píxeles (SHA-256) en UNA sola tarjeta del otro documento y en ninguna otra
       tarjeta principal. Es la única que el importador usa sin preguntar.
     - «parecida»: una sola candidata por la huella gris, sin píxeles idénticos. La huella gris 16×16 es
       aproximada (dos fotos distintas pueden coincidir: rojo puro y un verde medio dan el mismo gris), así
       que es solo una PROPUESTA: hay que confirmarla o rechazarla antes de usar nada de esa tarjeta.
     - «ambigua»: más de una tarjeta posible, o la candidata también encaja con otra principal. Nunca se elige
       una sola en ese caso.
     Devuelve también las tarjetas del otro documento que no encajan con ninguna. */
  function relacionar(principales, otras) {
    const dist = (a, b) => (a.foto?.exacta && a.foto.exacta === b.foto?.exacta ? 0 : distancia(a.foto?.gris || "", b.foto?.gris || ""));
    const posibles = new Map(); // id principal → [{ id, distancia, exacta }]
    const reclamada = new Map(); // id otra → [id principal]
    for (const p of principales) {
      const lista = [];
      for (const o of otras) {
        const d = dist(p, o);
        if (d <= UMBRAL_IGUAL) lista.push({ id: o.id, distancia: redondear(d), exacta: Boolean(p.foto?.exacta && p.foto.exacta === o.foto?.exacta) });
      }
      lista.sort((a, b) => Number(b.exacta) - Number(a.exacta) || a.distancia - b.distancia);
      posibles.set(p.id, lista);
      for (const c of lista) reclamada.set(c.id, [...(reclamada.get(c.id) || []), p.id]);
    }
    const resultado = {};
    for (const p of principales) {
      const lista = posibles.get(p.id);
      if (!lista.length) { resultado[p.id] = { estado: "sin", elegida: null, candidatos: [] }; continue; }
      const exactas = lista.filter((c) => c.exacta);
      if (exactas.length) {
        // Píxeles idénticos: inequívoca solo si hay una y ninguna otra principal comparte esa foto.
        const repetida = principales.some((q) => q !== p && q.foto?.exacta && q.foto.exacta === p.foto.exacta);
        const inequivoca = exactas.length === 1 && !repetida;
        resultado[p.id] = { estado: inequivoca ? "exacta" : "ambigua", elegida: inequivoca ? exactas[0].id : null, candidatos: lista };
        continue;
      }
      const cerca = lista.filter((c) => c.distancia <= lista[0].distancia + MARGEN_AMBIGUO);
      const compartida = (reclamada.get(lista[0].id) || []).length > 1;
      if (cerca.length > 1 || compartida) resultado[p.id] = { estado: "ambigua", elegida: null, candidatos: lista };
      else resultado[p.id] = { estado: "parecida", elegida: lista[0].id, candidatos: lista };
    }
    const sinPareja = otras.filter((o) => !reclamada.has(o.id)).map((o) => o.id);
    return { porPrincipal: resultado, sinPareja };
  }

  // ------------------------------------------------------------------ PDF.js en el navegador
  let cargaPdfjs = null;
  function cargarPdfjs() {
    if (!cargaPdfjs) {
      const base = new URL(RUTA_PDFJS, raiz.document?.baseURI || raiz.location?.href);
      cargaPdfjs = import(new URL("pdf.min.mjs", base).href).then((m) => {
        m.GlobalWorkerOptions.workerSrc = new URL("pdf.worker.min.mjs", base).href;
        return m;
      }).catch((e) => { cargaPdfjs = null; throw e; });
    }
    return cargaPdfjs;
  }
  // Opciones comunes: sin evaluar código, sin fuentes del sistema ni descargas extra. Imágenes decodificadas
  // por PDF.js (no por el navegador): los mismos píxeles en cualquier navegador, para comparar huellas.
  const OPCIONES = Object.freeze({ isEvalSupported: false, disableFontFace: true, useSystemFonts: false, isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false, enableXfa: false, stopAtErrors: false, verbosity: 0 });
  /* Una imagen que se repite en varias páginas (la misma foto en la portada y en una tarjeta) va a la caché
     común del documento (nombre «g_…»); las demás, a la de la página. */
  const objetoImagen = (pagina, nombre) => new Promise((resolver) => {
    const almacen = String(nombre).startsWith("g_") ? pagina.commonObjs : pagina.objs;
    const espera = setTimeout(() => resolver(null), 15000);
    try { almacen.get(nombre, (o) => { clearTimeout(espera); resolver(o); }); } catch { clearTimeout(espera); resolver(null); }
  });
  /* Píxeles RGBA de una imagen de PDF.js (raw o ImageBitmap). */
  function rgbaDe(img) {
    if (img.bitmap) {
      const lienzo = raiz.document.createElement("canvas");
      lienzo.width = img.bitmap.width;
      lienzo.height = img.bitmap.height;
      const ctx = lienzo.getContext("2d");
      ctx.drawImage(img.bitmap, 0, 0);
      return { width: lienzo.width, height: lienzo.height, kind: 3, data: ctx.getImageData(0, 0, lienzo.width, lienzo.height).data };
    }
    return img;
  }
  async function blobDe(img) {
    const { width: w, height: h, kind, data } = img;
    const lienzo = raiz.document.createElement("canvas");
    lienzo.width = w;
    lienzo.height = h;
    const ctx = lienzo.getContext("2d");
    const datos = ctx.createImageData(w, h);
    const fila1 = Math.ceil(w / 8);
    for (let i = 0, j = 0; i < w * h; i++, j += 4) {
      if (kind === 3) { datos.data[j] = data[i * 4]; datos.data[j + 1] = data[i * 4 + 1]; datos.data[j + 2] = data[i * 4 + 2]; datos.data[j + 3] = data[i * 4 + 3]; continue; }
      if (kind === 2) { datos.data[j] = data[i * 3]; datos.data[j + 1] = data[i * 3 + 1]; datos.data[j + 2] = data[i * 3 + 2]; }
      else { const v = (data[Math.floor(i / w) * fila1 + ((i % w) >> 3)] >> (7 - ((i % w) & 7))) & 1 ? 255 : 0; datos.data[j] = datos.data[j + 1] = datos.data[j + 2] = v; }
      datos.data[j + 3] = 255;
    }
    ctx.putImageData(datos, 0, 0);
    const codificar = (tipo, calidad) => new Promise((r) => { try { lienzo.toBlob((b) => r(b), tipo, calidad); } catch { r(null); } });
    // WebP si el navegador lo genera de verdad; si no, JPEG. Calidad alta: fotos.js la optimiza después.
    let blob = await codificar("image/webp", 0.92);
    if (!blob || blob.type !== "image/webp") blob = await codificar("image/jpeg", 0.92);
    lienzo.width = lienzo.height = 0;
    return blob;
  }

  class ErrorPdf extends Error {}
  const Cancelado = () => Object.assign(new Error("cancelado"), { name: "AbortError" });

  /* Lee un PDF (ArrayBuffer) página a página: { paginas, tarjetas, fecha, notas, aviso, paginasSinTarjetas }.
     Cada tarjeta: { id, pagina, orden, caja (0–1 de la página), lineas, destacados, etiquetas, conMarco,
     foto: { ancho, alto, exacta, gris, blob } }. alAvanzar({ pagina, total }). senal: AbortSignal.
     No mantiene páginas renderizadas: cada página se libera al terminar con ella. */
  async function leerDocumento(bytes, { alAvanzar = () => {}, senal = null, pdfjs = null, conBlob = true, idDoc = "d" } = {}) {
    const lib = pdfjs || await cargarPdfjs();
    if (senal?.aborted) throw Cancelado();
    if (bytes.byteLength > LIMITES.bytesMax) throw new ErrorPdf(`El archivo pesa más de ${LIMITES.bytesMax / (1024 * 1024)} MB.`);
    const tarea = lib.getDocument({ ...OPCIONES, data: new Uint8Array(bytes.slice(0)) });
    // Cancelar no espera a PDF.js: cada espera compite con la señal (una promesa del worker destruido
    // podría no resolverse nunca) y el documento se cierra.
    let alAbortar = null;
    const abortado = new Promise((_, rechazar) => { alAbortar = () => rechazar(Cancelado()); });
    abortado.catch(() => {});
    const abortar = () => { alAbortar(); tarea.destroy(); };
    senal?.addEventListener("abort", abortar, { once: true });
    const corte = (promesa) => (senal ? Promise.race([promesa, abortado]) : promesa);
    let doc;
    try {
      try { doc = await corte(tarea.promise); } catch (e) {
        if (senal?.aborted) throw Cancelado();
        if (e?.name === "PasswordException") throw new ErrorPdf("El PDF está protegido con contraseña.");
        throw new ErrorPdf("No es un PDF válido o está dañado.");
      }
      if (doc.numPages > LIMITES.paginasMax) throw new ErrorPdf(`El PDF tiene ${doc.numPages} páginas; como mucho ${LIMITES.paginasMax}.`);
      const tarjetas = [];
      const libres = [];
      const paginasSinTarjetas = [];
      let escaneadas = 0;
      let sinTexto = 0;
      for (let n = 1; n <= doc.numPages; n++) {
        if (senal?.aborted) throw Cancelado();
        alAvanzar({ pagina: n, total: doc.numPages });
        const pagina = await corte(doc.getPage(n));
        try {
          const pag = await corte(leerPagina(pagina, lib.OPS));
          if (pag.imagenes.length > LIMITES.imagenesPorPagina) throw new ErrorPdf(`La página ${n} tiene ${pag.imagenes.length} imágenes; como mucho ${LIMITES.imagenesPorPagina}.`);
          if (!pag.textos.length) sinTexto += 1;
          const r = tarjetasDePagina(pag);
          if (r.escaneada) escaneadas += 1;
          libres.push(...r.libres.map((t) => ({ ...t, pagina: n, alto: pag.alto })));
          if (!r.tarjetas.length) paginasSinTarjetas.push({ pagina: n, motivo: r.escaneada ? "página escaneada (imagen completa)" : r.imagenesSueltas ? "portada o collage (varias fotos en un mismo marco)" : pag.imagenes.length ? "sin tarjetas" : "sin fotos (despedida o texto)" });
          for (const [i, t] of r.tarjetas.entries()) {
            if (tarjetas.length >= LIMITES.tarjetasMax) throw new ErrorPdf(`El PDF tiene más de ${LIMITES.tarjetasMax} tarjetas.`);
            if (senal?.aborted) throw Cancelado();
            let img = t.imagen.objeto || (t.imagen.nombre ? await corte(objetoImagen(pagina, t.imagen.nombre)) : null);
            let foto = { ancho: 0, alto: 0, exacta: "", gris: "", blob: null, error: "" };
            if (img) {
              img = rgbaDe(img);
              if (img.width * img.height > LIMITES.megapixelesImagen * 1e6) foto.error = "Foto demasiado grande.";
              else {
                foto = { ancho: img.width, alto: img.height, exacta: await sha256(img.data), gris: aHex(grisDe(img)), blob: conBlob ? await blobDe(img) : null, error: "" };
              }
            } else foto.error = "No se pudo extraer la foto de esta tarjeta.";
            tarjetas.push({
              id: `${idDoc}-p${n}-${i + 1}`, pagina: n, orden: i + 1,
              caja: { x: redondear(t.caja.x / pag.ancho * 100) / 100, y: redondear((pag.alto - t.caja.y - t.caja.h) / pag.alto * 100) / 100, w: redondear(t.caja.w / pag.ancho * 100) / 100, h: redondear(t.caja.h / pag.alto * 100) / 100 },
              lineas: t.lineas, destacados: t.destacados, etiquetas: t.etiquetas, conMarco: t.conMarco, foto
            });
          }
        } finally {
          pagina.cleanup();
        }
        // Cede el hilo entre páginas: la ventana sigue respondiendo.
        await new Promise((r) => setTimeout(r, 0));
      }
      // Fecha y notas: del texto que no es de ninguna tarjeta (portada y cabeceras).
      const textoLibre = libres.map((t) => t.t).join(" \n ");
      const fecha = fechaDe(textoLibre);
      const notas = [...new Set(libres.filter((t) => t.y > t.alto * 0.08 && t.y < t.alto * 0.92 && RE_NOTA.test(sinTildes(t.t)) && t.t.length < 160).map((t) => t.t.trim()))];
      let aviso = "";
      if (!tarjetas.length && (escaneadas || sinTexto === doc.numPages)) aviso = "Parece un PDF escaneado (páginas como imagen, sin texto): no se pueden reconstruir sus tarjetas con seguridad. Usa la versión digital del catálogo.";
      else if (!tarjetas.length) aviso = "No encontramos tarjetas de producto (una foto con su texto dentro de un recuadro). Esta entrega admite el formato de los catálogos del proveedor.";
      else if (tarjetas.some((t) => !t.conMarco)) aviso = "Algunas tarjetas no tienen recuadro: se reconstruyeron por la posición de la foto y el texto de debajo. Revísalas.";
      return { paginas: doc.numPages, tarjetas, fecha, notas, aviso, paginasSinTarjetas };
    } finally {
      senal?.removeEventListener("abort", abortar);
      // En PDF.js 6 se cierra con la tarea de carga (libera el worker y la memoria del documento).
      try { await tarea.destroy(); } catch { /* ya cerrado */ }
    }
  }

  return Object.freeze({
    VERSION_PDFJS, LIMITES, PAPELES, ORDEN_PRINCIPAL, UMBRAL_IGUAL, MARCAS_ABREVIADAS,
    leerPagina, tarjetasDePagina, lineasDe, fechaDe, leerImportes, clasificar, prepararTitulo, componer,
    proponerPapel, grisDe, distancia, relacionar, sha256, cargarPdfjs, leerDocumento, ErrorPdf, normal, aHex
  });
});
