/* Panel privado de Gama & Talla · etapa 18: lectura de las publicaciones del proveedor.
 *
 * Convierte el texto de una publicación de WhatsApp en datos para revisar: marca, modelo, público,
 * precio del proveedor (COP), tallas EU y color. Se ejecuta SOLO en el navegador: el texto no se
 * envía a ningún servidor. Expone window.GamaTallaTextoProveedor.
 *
 *  - Lo que no se reconoce con seguridad queda vacío y marcado «por revisar»; nada se inventa.
 *  - Teléfonos y texto promocional («RECARGA», «Te atiendo por aquí…», emojis, ✅) se omiten: son
 *    texto del proveedor, no datos de la zapatilla. «RECARGA» no se interpreta como reposición.
 *  - Una línea puede traer varios datos («Reebok Club C Bulc🔥tallas 40-41-42-43-44 euro $80.000»): se toman
 *    el precio, las tallas y el teléfono, y el resto de la línea se sigue leyendo (marca, modelo, público,
 *    color). Un teléfono en una línea con datos se omite sin perder esos datos.
 *  - Listas y rangos: «40-41-42-43-44» y «40-42-44» son listas explícitas; «40 al 44», «40 hasta 44» y
 *    «40-44» (solo dos tallas) son rangos.
 *  - Tallas: rangos «40 al 44» se expanden a 40, 41, 42, 43, 44; las explícitas siguen la misma
 *    gramática que el panel y la base de datos (40 · 40,5 · 40.5 · 40 1/3). Una sola talla se reconoce
 *    cuando el texto la nombra («Talla 37») o cuando ocupa sola una línea («37») y el texto no trae
 *    otras tallas; si las trae, la ficha queda «por revisar». Modelos (603, 1080), precios y
 *    teléfonos nunca se leen como tallas.
 *
 * Etapa 19
 *  - Cada dato se extrae COMPLETO de la línea, con sus conectores: «DAMA Y CABALLERO», «para hombre o
 *    mujer», «y todas las tallas». Lo que queda es el modelo, tal como lo escribió el proveedor.
 *  - Público: se suma lo que dice toda la publicación (también en líneas distintas). Caballero y dama
 *    (u hombre y mujer, en cualquier orden) o «Unisex» dan «unisex».
 *  - Una talla sin palabra «talla» ni «euro» solo se lee entre 30 y 50: «Air Max 90» o «Club C 85» son
 *    modelos, no tallas.
 *  - «Todas las tallas» se convierte en tallas con REGLAS_PROVEEDOR según el público (ver abajo).
 *  - Ajustes de la etapa 19: «Numeración dama/mujer» y «Numeración hombre/caballero» fijan el público y
 *    proponen su rango (las dos juntas: Unisex). Varios precios distintos no se eligen solos: se devuelven
 *    como candidatos («precios») y el precio queda por revisar.
 */
(() => {
  "use strict";

  /* ---------------------------------------------------------------- reglas del proveedor
     Reglas de ESTE proveedor para proponer tallas cuando el mensaje no las enumera. Son del importador:
     no cambian la guía de tallas. Para ajustarlas, cambia solo esta tabla.
     - todasLasTallas: tallas que se proponen para cada público. Las usan «todas las tallas» (con el
       público que diga la publicación) y «numeración <público>».
     - numeracion: palabra que sigue a «numeración» → público que fija esa expresión. «Numeración dama»
       propone el rango de Dama; «numeración hombre», el de Hombre; las dos en la misma publicación, el de
       Unisex. */
  const REGLAS_PROVEEDOR = Object.freeze({
    todasLasTallas: Object.freeze({
      dama: Object.freeze(["36", "37", "38", "39"]),
      hombre: Object.freeze(["36", "37", "38", "39", "40", "41", "42", "43", "44"]),
      unisex: Object.freeze(["36", "37", "38", "39", "40", "41", "42", "43", "44"])
    }),
    numeracion: Object.freeze({
      dama: "dama", damas: "dama", mujer: "dama", mujeres: "dama",
      hombre: "hombre", hombres: "hombre", caballero: "hombre", caballeros: "hombre"
    })
  });
  const NOMBRES_PUBLICO = Object.freeze({ hombre: "Hombre", dama: "Dama", unisex: "Unisex" });
  // Tallas que propone la regla para un público ([] si el público no está claro).
  const tallasPorRegla = (publico) => [...(REGLAS_PROVEEDOR.todasLasTallas[publico] || [])];
  function describirTallas(lista) {
    const n = lista.map(Number);
    const seguidas = n.length > 2 && n.every((v, i) => Number.isInteger(v) && (i === 0 || v === n[i - 1] + 1));
    return seguidas ? `${lista[0]} a ${lista[lista.length - 1]}` : lista.join(" · ");
  }
  const citar = (expresion) => String(expresion || "todas las tallas").split(" y ").map((e) => `«${e}»`).join(" y ");
  // Nota breve que acompaña a las tallas propuestas por la regla («todas las tallas», «numeración dama»…).
  function notaRegla(publico, expresion = "todas las tallas") {
    const tallas = tallasPorRegla(publico);
    return tallas.length ? `Tallas propuestas por ${citar(expresion)} (${NOMBRES_PUBLICO[publico]}: ${describirTallas(tallas)}).` : NOTA_SIN_PUBLICO;
  }
  const NOTA_SIN_PUBLICO = "Dice «todas las tallas»: elige el público para proponer las tallas.";

  // Marcas que se reconocen sin estar en el catálogo (el catálogo añade las suyas).
  const MARCAS_BASE = [
    "New Balance", "Nike", "Adidas", "Puma", "Reebok", "Vans", "Converse", "Asics", "Fila", "Jordan", "Skechers",
    "Under Armour", "Salomon", "Hoka", "Mizuno", "Lacoste", "Diesel", "Balenciaga", "Alexander McQueen", "Louis Vuitton",
    "Gucci", "Dior", "Prada", "Versace", "Golden Goose", "Saucony", "Brooks", "Merrell", "Timberland", "Caterpillar",
    "Kappa", "Le Coq Sportif", "Diadora", "Umbro", "Lotto", "Champion", "Tommy Hilfiger", "Calvin Klein", "Guess",
    "Steve Madden", "Crocs", "Dr. Martens", "Onitsuka Tiger", "Yeezy", "Off-White", "Veja", "K-Swiss", "Polo Ralph Lauren",
    // Etapa 19: On (On Running). Corta: solo se reconoce como primera palabra de la línea (ver buscarMarca).
    "On"
  ];

  const sinTildes = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const clave = (t) => sinTildes(t).toLowerCase().replace(/[^a-z0-9ñ]+/g, " ").trim();
  // Emojis, banderas y modificadores: decoran la publicación, no son datos.
  const EMOJIS = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}]/gu;
  // Flechas (→, ⇒…): señalan, no son datos.
  const FLECHAS = /[←-⇿⟰-⟿⬀-⬏]/gu;
  const limpiarLinea = (l) => l.replace(EMOJIS, " ").replace(FLECHAS, " ").replace(/[*_~]/g, " ").replace(/\s+/g, " ").trim();

  // Teléfonos: colombianos (con o sin +57) y cualquier secuencia larga de dígitos con separadores.
  const TELEFONO = /(?:\+\s?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b|\+\d[\d\s.-]{8,}\d/;
  const TELEFONOS = new RegExp(TELEFONO.source, "g");
  // Frase de contacto que acompaña a un teléfono en la misma línea: se omite desde ahí hasta el final.
  const CONTACTO = /(?<!\p{L})(?:estamos atentos|te atiendo|escr[ií]be(?:me|nos)|atenci[oó]n|cont[aá]cta(?:me|nos)|contacto|whats?app|wsp|ll[aá]ma(?:me|nos)|pedidos?|m[aá]nda(?:me|nos)|informaci[oó]n|info|ap[aá]rta(?:la|lo|las|los)?|aprov[eé]cha(?:la|lo)?|p[ií]de(?:la|lo|las|los)|s[eé]para(?:la|lo)?|res[eé]rva(?:la|lo)?)(?!\p{L})/iu;
  /* Frase de contacto en su propia línea, sin teléfono al lado («Dinos y te ayudamos sin falta», «Estamos
     atentos de una»): se omite si la línea no nombra ninguna marca. */
  const FRASE_CONTACTO = /(?<!\p{L})(?:dinos|te ayudamos|te asesoramos|estamos atentos|te atiendo|te atendemos|escr[ií]be(?:me|nos)|preg[uú]nta(?:me|nos)|cons[uú]lta(?:me|nos)|cont[aá]cta(?:me|nos)|ll[aá]ma(?:me|nos)|whats?app|wsp|haz tu pedido|m[aá]nda(?:me|nos)|pide (?:el|la|los|las) tuy[oa]s?|ap[aá]rta(?:la|lo|las|los)?|aprov[eé]cha(?:la|lo)?|p[ií]de(?:la|lo|las|los)|s[eé]para(?:la|lo)?|res[eé]rva(?:la|lo)?)(?!\p{L})/iu;
  // Frases del proveedor que no describen la zapatilla.
  const PROMO = /^(?:recarga|nuevo ingreso|nueva coleccion|novedad|promo(?:cion)?|oferta|disponible|llegaron|llego|te atiendo|atencion|escribeme|escribenos|pedidos?|hago envios?|envios?|calidad|importad[oa]s?|original(?:es)?|ultimas? unidades|preventa|stock)\b/i;

  // ------------------------------------------------------------------ precio
  // «$115.000», «115.000», «$115000», «115 mil», «115k». Devuelve pesos enteros o null.
  // Un mismo separador de miles en todo el importe: «$125.000 115.000» son dos precios, no uno.
  const PRECIO = /\$\s?(\d{1,3}(?:\.\d{3})+|\d{1,3}(?:\s\d{3})+|\d{4,7})(?!\d)|\b(\d{1,3}(?:\.\d{3})+)(?!\d)(?:\s?(?:cop|pesos))?|\b(\d{2,4})\s?(?:mil|k)\b/i;
  const PRECIOS = new RegExp(PRECIO.source, "gi");
  // Todos los precios de una línea («$125.000 … $115.000»), en orden: [{ valor, texto }].
  function leerPrecios(linea) {
    return [...String(linea).matchAll(PRECIOS)].map((m) => ({
      valor: m[3] ? Number(m[3]) * 1000 : Number((m[1] || m[2]).replace(/\D/g, "")), texto: m[0]
    }));
  }
  const pesosTexto = (n) => `$${n.toLocaleString("es-CO")}`;
  function leerPrecio(linea) {
    const m = PRECIO.exec(linea);
    if (!m) return null;
    if (m[3]) return { valor: Number(m[3]) * 1000, texto: m[0] };
    const digitos = (m[1] || m[2]).replace(/\D/g, "");
    return { valor: Number(digitos), texto: m[0] };
  }

  // ------------------------------------------------------------------ público
  const PUBLICO_HOMBRE = String.raw`hombres?|caballeros?|masculinos?|var[oó]n(?:es)?`;
  const PUBLICO_DAMA = String.raw`damas?|mujer(?:es)?|femeninos?|femeninas?`;
  const UNA_PALABRA_PUBLICO = String.raw`(?:${PUBLICO_HOMBRE}|${PUBLICO_DAMA}|unisex)`;
  /* La expresión de público COMPLETA, con sus conectores, para que no queden restos en el modelo:
     «DAMA Y CABALLERO», «para hombre o mujer», «Dama/Caballero», «y caballero» (una línea que continúa la
     anterior). Los emojis ya se quitaron: «DAMA 👸 Y CABALLERO 🤴» llega como «DAMA Y CABALLERO». */
  const CONECTOR_PUBLICO = String.raw`(?:\s*[\/&+,-]\s*|\s+(?:y|e|o)\s+)`;
  const EXPRESION_PUBLICO = new RegExp(String.raw`(?<!\p{L})(?:(?:y|e|o)\s+)?(?:(?:para|de)\s+)?${UNA_PALABRA_PUBLICO}(?:${CONECTOR_PUBLICO}(?:(?:para|de)\s+)?${UNA_PALABRA_PUBLICO})*(?!\p{L})`, "giu");
  // Quita de la línea las expresiones de público y dice qué públicos nombran.
  const ES_HOMBRE = new RegExp(String.raw`\b(?:${PUBLICO_HOMBRE})\b`);
  const ES_DAMA = new RegExp(String.raw`\b(?:${PUBLICO_DAMA})\b`);
  function extraerPublico(linea) {
    const encontrado = { hombre: false, dama: false, unisex: false };
    const resto = linea.replace(EXPRESION_PUBLICO, (expresion) => {
      const t = clave(expresion); // sin tildes ni mayúsculas: «Varón» → «varon»
      if (ES_HOMBRE.test(t)) encontrado.hombre = true;
      if (ES_DAMA.test(t)) encontrado.dama = true;
      if (/\bunisex\b/.test(t)) encontrado.unisex = true;
      return " ";
    });
    return { ...encontrado, resto };
  }
  // Caballero y dama en la misma publicación (en cualquier orden y línea), o «Unisex»: unisex.
  function publicoDe({ hombre, dama, unisex }) {
    if (unisex || (hombre && dama)) return "unisex";
    if (hombre) return "hombre";
    if (dama) return "dama";
    return "";
  }

  /* «Numeración dama», «NUMERACIÓN: HOMBRE», «y numeración de caballero»: la expresión completa fija el
     público y pide el rango de REGLAS_PROVEEDOR. Se sustituye por «numeración» sola para que unas tallas
     escritas detrás («Numeración dama: 37; 38») se sigan leyendo como tallas concretas. */
  const NUMERACION_PUBLICO = new RegExp(String.raw`(?<!\p{L})(?:(?:y|e|con|en)\s+)?numeraci[oó]n(?:es)?\s*:?\s*(?:(?:de|para)\s+)?(${Object.keys(REGLAS_PROVEEDOR.numeracion).join("|")})(?!\p{L})`, "giu");

  const FIN_NUMERACION = /(?<!\p{L})numeraci[oó]n(?:es)?\s*:?$/iu;
  const INICIO_PUBLICO_NUMERACION = new RegExp(String.raw`^(?:(?:de|para)\s+)?(?:${Object.keys(REGLAS_PROVEEDOR.numeracion).join("|")})(?!\p{L})`, "iu");

  /* «Todas las tallas» y sus variantes, completas y con su conector («y todas las tallas»). */
  const TODAS_LAS_TALLAS = /(?<!\p{L})(?:(?:y|e|en|con)\s+)?(?:todas\s+(?:las\s+)?(?:tallas|numeraciones)|toda\s+la\s+(?:numeraci[oó]n|talla)|tallas\s+completas|numeraci[oó]n\s+completa)(?:\s+disponibles?)?(?!\p{L})/giu;

  const RELLENO = /\b(?:precio|valor|solo|desde|cop|pesos|par)\b/gi;
  // Conectores y signos sueltos que quedan en los bordes tras quitar los datos («PRINCENSA Y», «- 603»).
  const BORDES = /^(?:(?:y|para|con)\s+|[\s.\-–—])+|(?:\s+(?:y|e|o|de|para|en|con)|[\s.\-–—])+$/giu;

  // ------------------------------------------------------------------ color
  // Una línea que SOLO nombra colores («Blanco con rojo», «Negro / gris») es el color de la publicación.
  const PALABRAS_COLOR = new Set(["negro", "negra", "blanco", "blanca", "gris", "rojo", "roja", "azul", "verde", "amarillo", "amarilla",
    "naranja", "rosa", "rosado", "rosada", "fucsia", "morado", "morada", "lila", "violeta", "beige", "beis", "crema", "hueso", "cafe",
    "marron", "camel", "vino", "burdeos", "dorado", "dorada", "plateado", "plateada", "turquesa", "celeste", "marino", "oliva",
    "claro", "clara", "oscuro", "oscura", "con", "y", "de"]);
  function soloColores(linea) {
    const palabras = clave(linea).split(" ").filter(Boolean);
    return palabras.length > 0 && palabras.some((p) => !["con", "y", "de", "claro", "clara", "oscuro", "oscura"].includes(p))
      && palabras.every((p) => PALABRAS_COLOR.has(p));
  }

  // ------------------------------------------------------------------ tallas
  // Misma gramática que el panel (editor.js) y el CHECK de la base: 40 · 40,5 · 40.5 · 40 1/3.
  function racional(talla) {
    const m = /^([0-9]{1,3})(?:[.,]([0-9]{1,2})| ([0-9]{1,2})\/([0-9]{1,2}))?$/.exec(talla);
    if (!m) return null;
    const entero = Number(m[1]);
    if (m[2] !== undefined) return [entero * 100 + Number(m[2].padEnd(2, "0")), 100];
    if (m[3] !== undefined) {
      const n = Number(m[3]);
      const d = Number(m[4]);
      if (!(d > 0 && n < d)) return null;
      return [entero * d + n, d];
    }
    return [entero, 1];
  }
  const valorDe = (talla) => { const r = racional(talla); return r ? r[0] / r[1] : NaN; };
  const TALLA_MIN = 30;
  const TALLA_MAX = 50;
  /* Una talla: dos cifras, con decimal («40,5», «40.5») o fracción («40 1/3»). Los modelos de tres o más
     cifras (603, 1080), los precios ($115.000) y los teléfonos nunca encajan. */
  const UNA_TALLA = String.raw`\d{2}(?:[.,]\d(?!\d)|\s\d{1,2}\/\d{1,2}(?!\d))?`;
  /* Etapa 19: sin «talla» ni «euro» delante, una talla empieza entre 30 y 50. Así el número de un modelo
     («Air Max 90 - 40 al 44», «Club C 85 40-42-44») no se toma como primera talla de la secuencia. */
  const UNA_TALLA_EU = String.raw`(?:3\d|4\d|50)(?!\d)(?:[.,]\d(?!\d)|\s\d{1,2}\/\d{1,2}(?!\d))?`;
  /* Separadores entre tallas. «al», «a», «hasta», «–» y «—» marcan un rango. «-» marca un rango SOLO entre
     dos tallas («40-44»): con tres o más («40-42-44», «40-41-42-43-44») es una lista explícita. */
  const SEPARADOR = String.raw`(?:\s*[-–—;,/+]\s*|\s+(?:y|al|a|hasta)\s+)`;
  const SECUENCIA = String.raw`${UNA_TALLA}(?:${SEPARADOR}${UNA_TALLA})*`;
  const SECUENCIA_EU = String.raw`${UNA_TALLA_EU}(?:${SEPARADOR}${UNA_TALLA})*`;
  const SECUENCIA_ESPACIOS = String.raw`${UNA_TALLA}(?:(?:${SEPARADOR}|\s+)${UNA_TALLA})*`;
  // «EUR 36 AL 44», «EUR: 36 37 38» (etapa 19): la unidad también puede ir delante de las tallas.
  const PALABRA_TALLAS = String.raw`(?:tallas?|tll|numeraci[oó]n|eur)(?:\s+disponibles?)?`;
  // «Tallas 40-41-42», «Talla: 37», «tallas 38 39 40»: tras la palabra, también separadas por espacios.
  const TRAS_PALABRA = new RegExp(String.raw`(?<!\p{L})${PALABRA_TALLAS}(?!\p{L})\s*:?\s*(${SECUENCIA_ESPACIOS})(?!\d|[.,]\d)`, "giu");
  // «37 euro», «40-44 eu».
  const CON_EURO = new RegExp(String.raw`(?<![\d.,$/])(${SECUENCIA_EU})\s*(?:euros?|eur|eu)(?!\p{L})`, "giu");
  // «40 al 44», «38; 39 y 40,5», «40-42-44»: dos o más tallas con separador explícito, en cualquier parte.
  const ENCADENADAS = new RegExp(String.raw`(?<![\d.,$/])(${UNA_TALLA_EU}(?:${SEPARADOR}${UNA_TALLA})+)(?!\d|[.,]\d)`, "giu");
  // Línea que solo tiene tallas separadas por espacios y la palabra «euro» o «tallas» («36 37 38 Euro»).
  const SOLO_ESPACIOS = new RegExp(String.raw`^\s*(?:${PALABRA_TALLAS}\s*:?\s*)?(${SECUENCIA_ESPACIOS})\s*(?:euros?|eur|eu)?\s*$`, "iu");
  const PALABRAS_TALLAS = /(?<!\p{L})(?:tallas?|tll|numeraci[oó]n|disponibles?|euros?|eur|eu)(?!\p{L})\s*:?/giu;
  // Una línea que contiene UNA sola talla y nada más («37», «40,5», «40 1/3»).
  const TALLA_AISLADA = new RegExp(String.raw`^\s*${UNA_TALLA}\s*$`);
  const PIEZA = new RegExp(String.raw`(${UNA_TALLA})|(?<!\p{L})(hasta|al|a|y)(?!\p{L})|([-–—;,/+])`, "giu");
  const SEPARADORES_DE_RANGO = ["al", "a", "hasta", "–", "—"];

  function etiquetaDe(cruda) {
    const m = /^(\d{2})(?:[.,](\d)|\s+(\d{1,2})\/(\d{1,2}))?$/.exec(String(cruda).trim());
    if (!m) return null;
    return m[2] !== undefined ? `${m[1]},${m[2]}` : m[3] !== undefined ? `${m[1]} ${m[3]}/${m[4]}` : m[1];
  }

  /* Lee una secuencia de tallas ya delimitada («40-41-42», «40 al 44», «38; 39 y 40,5», «38 39 40»).
     El espacio solo separa tallas de una lista. { tallas, dudas } (tallas fuera de 30–50 se descartan). */
  function leerSecuencia(texto) {
    const piezas = [];
    let separador = "";
    for (const m of String(texto || "").matchAll(PIEZA)) {
      if (m[1]) { piezas.push({ cruda: m[1].replace(/\s+/g, " ").trim(), etiqueta: etiquetaDe(m[1]), separador }); separador = ""; }
      else if (!separador) separador = (m[2] || m[3]).toLowerCase();
    }
    const encontradas = [];
    const dudas = [];
    piezas.forEach((p, i) => {
      if (!p.etiqueta || !Number.isFinite(valorDe(p.etiqueta))) { dudas.push(`«${p.cruda}» no es una talla válida.`); return; }
      const esRango = i > 0 && piezas[i - 1].etiqueta && (SEPARADORES_DE_RANGO.includes(p.separador) || (p.separador === "-" && piezas.length === 2));
      if (!esRango) { encontradas.push(p.etiqueta); return; }
      const desde = valorDe(piezas[i - 1].etiqueta);
      const hasta = valorDe(p.etiqueta);
      if (!Number.isInteger(desde) || !Number.isInteger(hasta) || desde < TALLA_MIN || hasta > TALLA_MAX || hasta <= desde || hasta - desde > 15) {
        dudas.push(`«${piezas[i - 1].cruda} ${p.separador} ${p.cruda}» no parece un rango de tallas EU.`);
        encontradas.splice(encontradas.lastIndexOf(piezas[i - 1].etiqueta), 1);
        return;
      }
      for (let n = desde + 1; n <= hasta; n += 1) encontradas.push(String(n));
    });
    return { tallas: encontradas.filter((t) => { const v = valorDe(t); return v >= TALLA_MIN && v <= TALLA_MAX; }), dudas };
  }

  /* Tallas de un texto que SOLO contiene tallas (una línea aislada, un campo): todo número de dos cifras
     cuenta. { tallas: ["40", "41"], dudas: ["…"] }, sin repetir equivalentes y ordenadas. */
  function tallasDe(texto) {
    const leidas = leerSecuencia(String(texto || "").replace(PALABRAS_TALLAS, " "));
    return { tallas: unicasOrdenadas(leidas.tallas), dudas: leidas.dudas };
  }

  /* Tallas dentro de una línea que puede traer más datos («Reebok Club C Bulc tallas 40-41-42 euro»).
     Toma solo los tramos que son tallas y devuelve el resto de la línea para leer marca, modelo, público
     y color. Un tramo sin ninguna talla EU (p. ej. «12-15») se deja en el texto. { tallas, dudas, resto } */
  function extraerTallas(linea) {
    const tallas = [];
    const dudas = [];
    const tienePalabra = new RegExp(PALABRAS_TALLAS.source, "iu").test(linea);
    if (tienePalabra) {
      const sola = SOLO_ESPACIOS.exec(linea);
      if (sola) {
        const leidas = leerSecuencia(sola[1]);
        if (leidas.tallas.length || leidas.dudas.length) return { ...leidas, resto: "" };
      }
    }
    let resto = linea;
    const tomar = (patron) => {
      resto = resto.replace(patron, (todo, secuencia) => {
        const leidas = leerSecuencia(secuencia);
        if (!leidas.tallas.length && !leidas.dudas.length) return todo;
        tallas.push(...leidas.tallas);
        dudas.push(...leidas.dudas);
        return " ";
      });
    };
    tomar(TRAS_PALABRA);
    tomar(CON_EURO);
    tomar(ENCADENADAS);
    if (tallas.length || dudas.length || tienePalabra) resto = resto.replace(PALABRAS_TALLAS, " ");
    return { tallas, dudas, resto: resto.replace(/\s+/g, " ").trim() };
  }
  function unicasOrdenadas(lista) {
    const vistas = [];
    for (const t of lista) {
      const r = racional(t);
      if (!r) continue;
      if (vistas.some((o) => { const x = racional(o); return x[0] * r[1] === r[0] * x[1]; })) continue;
      vistas.push(t);
    }
    return vistas.sort((a, b) => valorDe(a) - valorDe(b));
  }

  /* Lo que se escribe en el campo «Tallas EU» del importador: «40; 41; 42», «40 al 44»,
     «38, 39, 40» (comas solo entre números enteros) o «40,5; 41 1/3».
     { tallas, error } */
  function leerCampoTallas(texto) {
    const limpio = String(texto || "").trim();
    if (!limpio) return { tallas: [], error: "" };
    const piezas = limpio.includes(";") ? limpio.split(";")
      : /^\s*\d{2}(?:\s*,\s*\d{2})+\s*$/.test(limpio) ? limpio.split(",")
        : [limpio];
    const tallas = [];
    for (const bruta of piezas.map((p) => p.trim()).filter(Boolean)) {
      const rango = /^(\d{2})\s*(?:al|a|hasta|-|–|—)\s*(\d{2})$/i.exec(bruta);
      if (rango) {
        const desde = Number(rango[1]);
        const hasta = Number(rango[2]);
        if (desde < TALLA_MIN || hasta > TALLA_MAX || hasta < desde || hasta - desde > 15) return { tallas: [], error: `«${bruta}» no es un rango de tallas EU válido.` };
        for (let n = desde; n <= hasta; n += 1) tallas.push(String(n));
        continue;
      }
      const etiqueta = bruta.replace(/\s+/g, " ");
      const v = valorDe(etiqueta);
      if (!racional(etiqueta) || !Number.isFinite(v)) return { tallas: [], error: `«${bruta}» no es una talla válida. Usa 40, 40,5 o 40 1/3, separadas por punto y coma.` };
      if (v < TALLA_MIN || v > TALLA_MAX) return { tallas: [], error: `${bruta} está fuera de las tallas EU habituales (${TALLA_MIN}–${TALLA_MAX}).` };
      tallas.push(etiqueta);
    }
    const unicas = unicasOrdenadas(tallas);
    if (unicas.length > 40) return { tallas: [], error: "Como mucho 40 tallas por color." };
    return { tallas: unicas, error: "" };
  }

  // ------------------------------------------------------------------ marca
  function buscarMarca(linea, marcas) {
    const l = ` ${clave(linea)} `;
    let mejor = null;
    for (const marca of marcas) {
      const k = clave(marca);
      if (!k) continue;
      const pos = l.indexOf(` ${k} `);
      if (pos < 0) continue;
      // Palabras completas siempre (« on » no está dentro de «Onitsuka» ni de «Cloud»). Una marca de una o
      // dos letras («ON») solo cuenta como primera palabra de la línea: «Vans Slip On» no es ON.
      if (k.length <= 2 && pos !== 0) continue;
      // La más larga gana («New Balance» antes que «Balance»); a igual longitud, la primera.
      if (!mejor || k.length > mejor.k.length || (k.length === mejor.k.length && pos < mejor.pos)) mejor = { marca, k, pos };
    }
    return mejor;
  }
  // Quita la marca del principio de la línea conservando el resto tal cual se escribió.
  function quitarMarca(linea, marca) {
    const palabras = linea.split(/\s+/);
    const n = clave(marca).split(" ").length;
    for (let i = 0; i + n <= palabras.length; i += 1) {
      if (clave(palabras.slice(i, i + n).join(" ")) === clave(marca)) return [...palabras.slice(0, i), ...palabras.slice(i + n)].join(" ").trim();
    }
    return linea;
  }
  const titulo = (t) => String(t).toLocaleLowerCase("es-CO").replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toLocaleUpperCase("es-CO"));

  // ------------------------------------------------------------------ analizar
  /* Devuelve { marca, modelo, publico, precio, tallas, color, revisar: [campos], notas: [textos],
     omitido: { telefonos, promocional, contacto }, todasLasTallas, tallasExplicitas, tallasPorRegla,
     notasRegla }. «revisar» lista los campos que hay que comprobar.
     - todasLasTallas: el texto dice «todas las tallas».
     - tallasExplicitas: además trae tallas concretas (se usan esas, no la regla).
     - tallasPorRegla: las tallas salen de REGLAS_PROVEEDOR según el público.
     - notasRegla: las notas (también incluidas en «notas») que dependen del público y de la regla; quien
       cambie después el público (el importador) las sustituye por las suyas.
     - reglaTallas / expresionRegla: el texto pide la regla («todas las tallas», «numeración dama»…) y con
       qué palabras, para la nota.
     - precios: importes distintos del mensaje, en orden. Con más de uno, «precio» es null y queda por
       revisar: se elige entre ellos.

     Orden de extracción en cada línea, de lo más reconocible a lo menos: teléfono y su frase de contacto,
     «Color:», precio, «todas las tallas», tallas, público. Cada dato sale completo, con sus conectores; lo
     que queda (sin bordes sueltos) es la marca y el modelo, o un color. */
  function analizar(texto, { marcas = [] } = {}) {
    const listaMarcas = [...new Set([...marcas.map(String).filter(Boolean), ...MARCAS_BASE])];
    const notas = [];
    const revisar = new Set();
    const omitido = { telefonos: 0, promocional: 0, contacto: 0 };
    const publicos = { hombre: false, dama: false, unisex: false };
    const precios = [];
    const expresiones = []; // las que piden la regla: «todas las tallas», «numeración dama»…
    let color = "";
    let todas = false;
    const tallas = [];
    const aisladas = [];
    const candidatas = [];

    const lineas = String(texto || "").split(/\r?\n/);
    // «Numeración» al final de una línea y el público al principio de la siguiente («NUMERACIÓN 💥⏎ DAMA»):
    // es una sola expresión, así que se leen juntas (también con líneas en blanco o solo emojis entre medias).
    for (let i = 0; i < lineas.length; i += 1) {
      if (!FIN_NUMERACION.test(limpiarLinea(lineas[i]))) continue;
      let j = i + 1;
      while (j < lineas.length && !limpiarLinea(lineas[j])) j += 1;
      if (j < lineas.length && INICIO_PUBLICO_NUMERACION.test(limpiarLinea(lineas[j]))) {
        lineas[i] = `${lineas[i]} ${lineas[j]}`;
        lineas.splice(i + 1, j - i);
      }
    }
    for (const original of lineas) {
      let linea = limpiarLinea(original);
      if (!linea) continue;
      // Un teléfono se quita de la línea y lo demás se conserva («Reebok … $80.000 Escríbeme al +57 …»). Su
      // frase de contacto («Estamos atentos…», «Escríbeme al…») también se omite.
      let conTelefono = false;
      linea = linea.replace(TELEFONOS, () => { omitido.telefonos += 1; conTelefono = true; return " "; });
      if (conTelefono) {
        const contacto = CONTACTO.exec(linea);
        if (contacto) linea = linea.slice(0, contacto.index); // cuenta con su teléfono, no como otra línea
        linea = limpiarLinea(linea);
        if (!linea) continue;
      }
      const k = clave(linea);
      if (!k) continue;

      const etiquetaColor = /^colou?r(?:es)?\s*[:\-]\s*(.+)$/i.exec(linea);
      if (etiquetaColor) { color = color || etiquetaColor[1].trim(); continue; }

      // Precios: todos los de la línea. Si el mensaje trae varios distintos, no se elige ninguno solo.
      for (const p of leerPrecios(linea)) {
        if (!precios.includes(p.valor)) precios.push(p.valor);
        linea = linea.replace(p.texto, " ");
      }
      // «Numeración dama/hombre» y «todas las tallas» (con su conector): la regla decide las tallas al final.
      linea = linea.replace(NUMERACION_PUBLICO, (_, palabra) => {
        const p = REGLAS_PROVEEDOR.numeracion[palabra.toLowerCase()];
        publicos[p] = true;
        const etiqueta = `numeración ${palabra.toLowerCase()}`;
        if (!expresiones.includes(etiqueta)) expresiones.push(etiqueta);
        return " numeración "; // la palabra sola: «Numeración dama: 37; 38» sigue leyéndose como tallas
      });
      linea = linea.replace(TODAS_LAS_TALLAS, () => { todas = true; if (!expresiones.includes("todas las tallas")) expresiones.unshift("todas las tallas"); return " "; });
      if (!clave(linea)) continue;
      // Una talla sola en su línea («37»): se decide al final, cuando se sabe si el texto trae otras tallas.
      if (TALLA_AISLADA.test(linea)) { aisladas.push(linea.trim()); continue; }

      // Tallas: se toman los tramos que lo son y el resto de la línea se sigue leyendo (una sola línea
      // puede traer marca, modelo, tallas y precio).
      const leidas = extraerTallas(linea);
      tallas.push(...leidas.tallas);
      notas.push(...leidas.dudas);
      linea = leidas.resto;
      if (!clave(linea)) continue;

      // Público: la expresión entera sale de la línea; se suma lo de todas las líneas.
      const pub = extraerPublico(linea);
      for (const k of Object.keys(publicos)) publicos[k] = publicos[k] || pub[k];
      // Lo que queda sin precio, tallas, público ni palabras de relleno puede ser el modelo o el color.
      const restante = limpiarLinea(pub.resto.replace(RELLENO, " ").replace(/[,;:|]+/g, " ")).replace(BORDES, "").trim();
      if (!restante || clave(restante).length < 2) continue;
      if (PROMO.test(clave(restante))) { omitido.promocional += 1; continue; }
      if (FRASE_CONTACTO.test(restante) && !buscarMarca(restante, listaMarcas)) { omitido.contacto += 1; continue; }
      if (soloColores(restante)) { color = color || restante; continue; }
      candidatas.push(restante);
    }
    const publico = publicoDe(publicos);

    // Marca y modelo: la primera línea con una marca conocida; si no hay, la primera candidata.
    let marca = "";
    let modelo = "";
    const leidas = candidatas.map((l) => ({ l, m: buscarMarca(l, listaMarcas) }));
    const conMarca = leidas.find((x) => x.m);
    if (conMarca) {
      marca = conMarca.m.marca;
      modelo = quitarMarca(conMarca.l, conMarca.m.marca);
      // La marca sola en su línea («ON⏎CLOUD REMIX»): el modelo es la siguiente línea sin marca.
      if (!clave(modelo)) modelo = leidas.slice(leidas.indexOf(conMarca) + 1).find((x) => !x.m)?.l || "";
    } else if (candidatas.length) {
      modelo = candidatas[0];
      revisar.add("marca");
      notas.push("No reconocimos la marca: escríbela.");
    } else {
      revisar.add("marca");
    }
    modelo = modelo.replace(/\s+/g, " ").trim();
    if (!modelo) revisar.add("modelo");
    // Una marca del catálogo se escribe como está allí; una de la lista base, con mayúscula inicial.
    if (marca && !marcas.includes(marca)) marca = titulo(marca);

    if (publico === "unisex" && !publicos.unisex) notas.push("Nombra caballero y dama: público Unisex.");
    if (!publico) revisar.add("publico");
    // Un precio: es el del proveedor. Varios distintos: se ofrecen como candidatos y el precio queda por
    // revisar hasta que se elija uno (la marca, el modelo, el público y las tallas se leen igual).
    const precio = precios.length === 1 ? precios[0] : null;
    const notaPrecios = precios.length > 1 ? `El mensaje trae varios precios (${precios.map(pesosTexto).join(" y ")}): elige el precio del proveedor.` : "";
    if (notaPrecios) {
      revisar.add("precio");
      notas.push(notaPrecios);
    } else if (precio === null) { revisar.add("precio"); }
    else if (precio < 20000 || precio > 3000000) { revisar.add("precio"); notas.push(`El precio leído (${precio.toLocaleString("es-CO")}) es poco habitual: compruébalo.`); }
    // Tallas solas en su línea. Si el texto no trae otras tallas, son inequívocas y se añaden (una o varias,
    // una por línea). Si ya trae tallas («40 al 44») no se sabe si son otra talla o un dato distinto: no se
    // añaden y la ficha queda por revisar. Fuera de 30–50 no son tallas EU.
    if (aisladas.length) {
      const yaHabia = tallas.length > 0;
      for (const sola of aisladas) {
        const leida = tallasDe(sola);
        notas.push(...leida.dudas);
        if (!leida.tallas.length) {
          if (!leida.dudas.length) notas.push(`«${sola}» está sola en una línea y no es una talla EU habitual (${TALLA_MIN}–${TALLA_MAX}): compruébala.`);
          continue;
        }
        if (yaHabia) {
          revisar.add("tallas");
          notas.push(`«${sola}» está sola en una línea y el texto ya trae otras tallas: añádela a mano si corresponde.`);
          continue;
        }
        tallas.push(...leida.tallas);
      }
    }
    let tallasUnicas = unicasOrdenadas(tallas);
    /* «Todas las tallas» o «numeración <público>»: las tallas concretas mandan; sin ellas, la regla del
       proveedor según el público. «Numeración dama: 37; 38» enumera las tallas de esa numeración (no es una
       contradicción); «todas las tallas» con otras tallas sí lo es y queda por revisar. */
    const expresion = expresiones.join(" y ");
    const pideRegla = expresiones.length > 0;
    const explicitas = tallasUnicas.length > 0;
    let porRegla = false;
    const notasRegla = [];
    if (pideRegla) {
      const regla = tallasPorRegla(publico);
      if (explicitas) {
        const iguales = regla.length === tallasUnicas.length && regla.every((t, i) => t === tallasUnicas[i]);
        if (!todas) {
          if (!iguales) notasRegla.push(`${citar(expresion)} con tallas concretas: se usaron esas (${describirTallas(tallasUnicas)}).`);
        } else if (!regla.length) {
          notasRegla.push(`Dice «todas las tallas» y también trae tallas concretas: se usaron las concretas (${describirTallas(tallasUnicas)}).`);
        } else if (!iguales) {
          revisar.add("tallas");
          notasRegla.push(`Dice «todas las tallas», pero trae tallas concretas: se usaron las concretas (${describirTallas(tallasUnicas)}); para ${NOMBRES_PUBLICO[publico]} la regla propone ${describirTallas(regla)}. Compruébalas.`);
        }
      } else if (regla.length) {
        tallasUnicas = regla;
        porRegla = true;
        notasRegla.push(notaRegla(publico, expresion));
      } else {
        revisar.add("publico");
        notasRegla.push(NOTA_SIN_PUBLICO);
      }
      notas.push(...notasRegla);
    }
    if (!tallasUnicas.length) revisar.add("tallas");
    if (!color) revisar.add("color");

    return {
      marca, modelo, publico, precio, tallas: tallasUnicas, color, revisar: [...revisar], notas, omitido,
      todasLasTallas: todas, tallasExplicitas: explicitas, tallasPorRegla: porRegla, notasRegla,
      precios, notaPrecios, reglaTallas: pideRegla, expresionRegla: expresion
    };
  }

  // Clave para comparar modelos (lote y catálogo): sin tildes, mayúsculas ni signos, y sin la marca.
  function claveModelo(marca, modelo) {
    const m = clave(marca);
    let n = clave(modelo);
    if (m && (n === m || n.startsWith(`${m} `))) n = n.slice(m.length).trim();
    return m && n ? `${m}|${n}` : "";
  }

  window.GamaTallaTextoProveedor = Object.freeze({
    analizar, leerCampoTallas, tallasDe, racional, claveModelo, clave, MARCAS_BASE,
    REGLAS_PROVEEDOR, tallasPorRegla, notaRegla, NOTA_SIN_PUBLICO
  });
})();
