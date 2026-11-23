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

  /* ---------------------------------------------------------------- perfiles de proveedor (etapa 20)
     Un perfil son reglas DECLARATIVAS y acotadas de un proveedor; nunca código ni expresiones regulares
     escritas a mano. Cada expresión se compara sin tildes ni mayúsculas y solo como palabras completas.
     - marcas: alias → marca («NB» = NEW BALANCE). La coincidencia más larga gana; un alias de una o dos
       letras solo cuenta como primera palabra de la línea (la misma protección que «ON»).
     - publico: expresión → público («chicas» = dama).
     - numeracion: palabra que sigue a «numeración» → público («numeración niña» = dama).
     - rangos: tallas que proponen «todas las tallas» y «numeración <público>» para cada público. Vacío
       (null) = el rango del Perfil general. Son convenciones del proveedor, no límites del catálogo.
     - categoria: categoría habitual (opcional); nunca pisa una escrita a mano.
     - promociones: frases que se omiten («envío gratis a todo el país»).
     El «Perfil general» es la tabla REGLAS_PROVEEDOR: sin perfil, el lector se comporta como antes. */
  const LIMITES_PERFIL = Object.freeze({ nombre: 60, expresion: 40, marca: 60, categoria: 60, promocion: 80, entradas: 60, rangoMax: 15 });
  const SINONIMOS_PUBLICO = Object.freeze({
    hombre: "hombre", hombres: "hombre", caballero: "hombre", caballeros: "hombre", masculino: "hombre",
    dama: "dama", damas: "dama", mujer: "dama", mujeres: "dama", femenino: "dama", unisex: "unisex", ambos: "unisex"
  });
  function rangoDeLista(lista) {
    const n = lista.map(Number);
    return n.length ? Object.freeze({ desde: n[0], hasta: n[n.length - 1] }) : null;
  }
  const PERFIL_GENERAL = Object.freeze({
    id: "general", nombre: "Perfil general", revision: 0, general: true,
    marcas: Object.freeze([]), publico: Object.freeze([]),
    numeracion: Object.freeze(Object.entries(REGLAS_PROVEEDOR.numeracion).map(([expresion, publico]) => Object.freeze({ expresion, publico }))),
    rangos: Object.freeze(Object.fromEntries(Object.entries(REGLAS_PROVEEDOR.todasLasTallas).map(([p, lista]) => [p, rangoDeLista(lista)]))),
    categoria: "", promociones: Object.freeze([])
  });
  const esGeneral = (perfil) => !perfil || perfil.id === PERFIL_GENERAL.id;
  // Rango que aplica: el del perfil; si el perfil lo deja vacío, el del Perfil general (respaldo).
  function rangoPara(publico, perfil) {
    const propio = esGeneral(perfil) ? null : perfil.rangos?.[publico];
    if (propio) return { ...propio, origen: "perfil" };
    const general = PERFIL_GENERAL.rangos[publico];
    return general ? { ...general, origen: "general" } : null;
  }
  // Tallas que propone la regla para un público ([] si el público no está claro).
  function tallasPorRegla(publico, perfil = null) {
    const r = rangoPara(publico, perfil);
    if (!r) return [];
    const lista = [];
    for (let n = r.desde; n <= r.hasta; n += 1) lista.push(String(n));
    return lista;
  }
  function describirTallas(lista) {
    const n = lista.map(Number);
    const seguidas = n.length > 2 && n.every((v, i) => Number.isInteger(v) && (i === 0 || v === n[i - 1] + 1));
    return seguidas ? `${lista[0]} a ${lista[lista.length - 1]}` : lista.join(" · ");
  }
  const citar = (expresion) => String(expresion || "todas las tallas").split(" y ").map((e) => `«${e}»`).join(" y ");
  // Nota breve que acompaña a las tallas propuestas por la regla («todas las tallas», «numeración dama»…).
  function notaRegla(publico, expresion = "todas las tallas", perfil = null) {
    const tallas = tallasPorRegla(publico, perfil);
    if (!tallas.length) return NOTA_SIN_PUBLICO;
    const delPerfil = rangoPara(publico, perfil)?.origen === "perfil" ? `, perfil «${perfil.nombre}»` : "";
    return `Tallas propuestas por ${citar(expresion)} (${NOMBRES_PUBLICO[publico]}: ${describirTallas(tallas)}${delPerfil}).`;
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
    "On",
    // Etapa 20.
    "Hugo Boss"
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
  // Etapa 20: enlaces (https://wa.link/…, wa.me/…, www.…): son de contacto, no datos de la zapatilla.
  const ENLACE = /(?:https?:\/\/|www\.)\S+|\b(?:wa\.link|wa\.me|api\.whatsapp\.com|bit\.ly)\/\S*/giu;
  /* Etapa 20: cantidad de colores que tendrá la zapatilla, como dato de preparación: «(2 colores)» en
     cualquier parte de una línea, o «3 colores» sola en su línea. No es modelo, talla ni precio.
     Se reconoce la EXPRESIÓN aunque su valor no sirva («(-2 colores)», «(2.5 colores)», «(2,5 colores)»,
     «(1000 colores)»): sale del texto que se lee y después se valida el valor (nunca se redondea). */
  const VALOR_CANTIDAD = String.raw`[-+−]?\s*\d+(?:[.,]\d+)?`;
  const CANTIDAD_COLORES = new RegExp(String.raw`\(\s*(${VALOR_CANTIDAD})\s*colou?r(?:es|s)?\s*\)`, "giu");
  const CANTIDAD_SOLA = new RegExp(String.raw`^\s*(${VALOR_CANTIDAD})\s*colou?r(?:es|s)?\s*\.?\s*$`, "iu");
  // Límite real de colores por zapatilla: el del catálogo (editor.js, LIM.colores) o el que pase quien llama.
  const limiteColores = (maximo) => (Number.isInteger(maximo) && maximo > 0 ? maximo : window.GamaTallaEditor?.comun?.LIM?.colores ?? null);
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
  const FIN_NUMERACION = /(?<!\p{L})numeraci[oó]n(?:es)?\s*:?$/iu;

  /* Etapa 20: las palabras de «numeración» vienen del perfil. Una expresión se convierte en un patrón
     LITERAL (letras con y sin tilde, espacios flexibles) y siempre como palabra completa: el perfil no
     puede introducir expresiones regulares. */
  const VARIANTES_LETRA = { a: "aáàâä", e: "eéèêë", i: "iíìîï", o: "oóòôö", u: "uúùûü", n: "nñ", c: "cç" };
  function patronLiteral(expresion) {
    return [...sinTildes(expresion).toLowerCase().trim().replace(/\s+/g, " ")].map((ch) => {
      if (ch === " ") return String.raw`\s+`;
      if (VARIANTES_LETRA[ch]) return `[${VARIANTES_LETRA[ch]}]`;
      // Solo los caracteres de sintaxis (en modo «u» no se admite escapar otros, como «-»).
      return ch.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    }).join("");
  }
  const alternativa = (lista) => [...lista].sort((a, b) => b.length - a.length).map(patronLiteral).join("|");
  const BORDE_INICIO = String.raw`(?<![\p{L}\p{N}])`;
  const BORDE_FIN = String.raw`(?![\p{L}\p{N}])`;

  // Reglas de un perfil ya convertidas en patrones (una vez por perfil).
  const compilados = new WeakMap();
  function compilar(perfil) {
    const p = perfil || PERFIL_GENERAL;
    if (compilados.has(p)) return compilados.get(p);
    const numeracion = new Map(p.numeracion.map((n) => [clave(n.expresion), n.publico]));
    const palabras = alternativa(p.numeracion.map((n) => n.expresion));
    // Las expresiones se comparan con la línea ya limpia (sin emojis, flechas ni *, _ y ~): se limpian igual.
    const limpias = (lista) => lista.map((t) => limpiarLinea(String(t))).filter(Boolean);
    const c = {
      numeracion,
      numeracionPublico: palabras ? new RegExp(String.raw`(?<!\p{L})(?:(?:y|e|con|en)\s+)?numeraci[oó]n(?:es)?\s*:?\s*(?:(?:de|para)\s+)?(${palabras})(?!\p{L})`, "giu") : null,
      inicioNumeracion: palabras ? new RegExp(String.raw`^(?:(?:de|para)\s+)?(?:${palabras})(?!\p{L})`, "iu") : null,
      publico: new Map(p.publico.map((x) => [clave(x.expresion), x.publico])),
      publicoExtra: limpias(p.publico.map((x) => x.expresion)).length ? new RegExp(`${BORDE_INICIO}(?:${alternativa(limpias(p.publico.map((x) => x.expresion)))})${BORDE_FIN}`, "giu") : null,
      promociones: limpias(p.promociones).length ? new RegExp(`${BORDE_INICIO}(?:${alternativa(limpias(p.promociones))})${BORDE_FIN}`, "giu") : null,
      alias: p.marcas.map((m) => ({ texto: m.alias, marca: m.marca, alias: true }))
    };
    compilados.set(p, c);
    return c;
  }

  /* «Todas las tallas» y sus variantes, completas y con su conector («y todas las tallas»). */
  const TODAS_LAS_TALLAS = /(?<!\p{L})(?:(?:y|e|en|con)\s+)?(?:todas\s+(?:las\s+)?(?:tallas|numeraciones)|toda\s+la\s+(?:numeraci[oó]n|talla)|tallas\s+completas|numeraci[oó]n\s+completa)(?:\s+disponibles?)?(?!\p{L})/giu;

  const RELLENO = /\b(?:precio|valor|solo|desde|cop|pesos|par)\b/gi;
  /* Etapa 21: lo que acompaña a un precio cuando es su CONDICIÓN («DISPONIBLE POR CAJA $85.000», «X MAYOR»):
     no es modelo ni color. El importe se sigue leyendo (con varios, se elige uno a mano). */
  const CONDICION_PRECIO = /^(?:disponible\s+)?(?:precio\s+)?(?:(?:al\s+)?por|x)\s+(?:caja|cajas|mayor|docena|docenas|paquete|lote|unidad|unidades|par|pares)$|^(?:mayorista|al mayor)$/;
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
  /* marcas: textos («Nike») o entradas { texto, marca, alias } (etapa 20: alias del perfil, «NB» → NEW
     BALANCE). Devuelve { marca, texto, alias, k, pos }: «texto» es lo que aparece en la línea. */
  function buscarMarca(linea, marcas) {
    const l = ` ${clave(linea)} `;
    let mejor = null;
    for (const entrada of marcas) {
      const e = typeof entrada === "string" ? { texto: entrada, marca: entrada, alias: false } : entrada;
      const k = clave(e.texto);
      if (!k) continue;
      const pos = l.indexOf(` ${k} `);
      if (pos < 0) continue;
      // Palabras completas siempre (« on » no está dentro de «Onitsuka» ni de «Cloud»). Una marca de una o
      // dos letras («ON») solo cuenta como primera palabra de la línea: «Vans Slip On» no es ON.
      if (k.length <= 2 && pos !== 0) continue;
      // La más larga gana («New Balance» antes que «Balance»); a igual longitud, la primera (los alias
      // del perfil van delante: son la regla más específica del proveedor).
      if (!mejor || k.length > mejor.k.length || (k.length === mejor.k.length && pos < mejor.pos)) mejor = { marca: e.marca, texto: e.texto, alias: e.alias, k, pos };
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
  function analizar(texto, { marcas = [], perfil = null, maxColores = null } = {}) {
    // Etapa 20: el perfil del proveedor (sin perfil, el general: mismo comportamiento que antes).
    const regla = perfil && !esGeneral(perfil) ? perfil : PERFIL_GENERAL;
    const comp = compilar(regla);
    const listaMarcas = [...comp.alias, ...new Set([...marcas.map(String).filter(Boolean), ...MARCAS_BASE])];
    const reglas = []; // reglas del perfil que se usaron, para explicarlas en la revisión
    const anotarRegla = (t) => { if (!reglas.includes(t)) reglas.push(t); };
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
      if (j < lineas.length && comp.inicioNumeracion?.test(limpiarLinea(lineas[j]))) {
        lineas[i] = `${lineas[i]} ${lineas[j]}`;
        lineas.splice(i + 1, j - i);
      }
    }
    const cantidades = []; // etapa 20: «(2 colores)», «3 colores» (valor tal cual, sin espacios)
    for (const original of lineas) {
      let linea = limpiarLinea(original);
      if (!linea) continue;
      // Etapa 20: los enlaces (wa.link, wa.me, URL) son de contacto: se omiten.
      let conEnlace = false;
      linea = linea.replace(ENLACE, () => { conEnlace = true; return " "; });
      if (conEnlace) {
        omitido.contacto += 1;
        linea = limpiarLinea(linea);
        if (!linea) continue;
      }
      // Etapa 20: cantidad de colores (dato de preparación): sale de la línea antes que tallas y precios.
      const anotar = (v) => { const t = v.replace(/\s+/g, "").replace("−", "-"); if (!cantidades.includes(t)) cantidades.push(t); };
      linea = linea.replace(CANTIDAD_COLORES, (_, v) => { anotar(v); return " "; });
      const sola = CANTIDAD_SOLA.exec(linea);
      if (sola) { anotar(sola[1]); continue; }
      linea = limpiarLinea(linea);
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
      // Frases promocionales del perfil: se quitan de la línea (lo demás se sigue leyendo).
      if (comp.promociones) {
        let quitada = false;
        linea = linea.replace(comp.promociones, (frase) => { quitada = true; anotarRegla(`Se omitió «${frase}» (frase promocional del perfil).`); return " "; });
        if (quitada) {
          omitido.promocional += 1;
          linea = limpiarLinea(linea);
          if (!linea) continue;
        }
      }
      const k = clave(linea);
      if (!k) continue;

      const etiquetaColor = /^colou?r(?:es)?\s*[:\-]\s*(.+)$/i.exec(linea);
      if (etiquetaColor) { color = color || etiquetaColor[1].trim(); continue; }

      // Precios: todos los de la línea. Si el mensaje trae varios distintos, no se elige ninguno solo.
      let conPrecio = false;
      for (const p of leerPrecios(linea)) {
        if (!precios.includes(p.valor)) precios.push(p.valor);
        linea = linea.replace(p.texto, " ");
        conPrecio = true;
      }
      // «Numeración dama/hombre» y «todas las tallas» (con su conector): la regla decide las tallas al final.
      if (comp.numeracionPublico) {
        linea = linea.replace(comp.numeracionPublico, (todo, palabra) => {
          const p = comp.numeracion.get(clave(palabra));
          if (!p) return todo;
          publicos[p] = true;
          const etiqueta = `numeración ${palabra.toLowerCase()}`;
          if (!expresiones.includes(etiqueta)) expresiones.push(etiqueta);
          return " numeración "; // la palabra sola: «Numeración dama: 37; 38» sigue leyéndose como tallas
        });
      }
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

      // Expresiones de público del perfil («chicas» = dama): antes que las generales.
      if (comp.publicoExtra) {
        linea = linea.replace(comp.publicoExtra, (expresion) => {
          const p = comp.publico.get(clave(expresion));
          if (!p) return expresion;
          publicos[p] = true;
          anotarRegla(`«${expresion}» = ${NOMBRES_PUBLICO[p]} (público, perfil «${regla.nombre}»).`);
          return " ";
        });
        if (!clave(linea)) continue;
      }
      // Público: la expresión entera sale de la línea; se suma lo de todas las líneas.
      const pub = extraerPublico(linea);
      for (const k of Object.keys(publicos)) publicos[k] = publicos[k] || pub[k];
      // Lo que queda sin precio, tallas, público ni palabras de relleno puede ser el modelo o el color.
      const restante = limpiarLinea(pub.resto.replace(RELLENO, " ").replace(/[,;:|]+/g, " ")).replace(BORDES, "").trim();
      if (!restante || clave(restante).length < 2) continue;
      if (PROMO.test(clave(restante))) { omitido.promocional += 1; continue; }
      if (FRASE_CONTACTO.test(restante) && !buscarMarca(restante, listaMarcas)) { omitido.contacto += 1; continue; }
      if (conPrecio && CONDICION_PRECIO.test(clave(restante))) continue;
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
      modelo = quitarMarca(conMarca.l, conMarca.m.texto);
      if (conMarca.m.alias) anotarRegla(`«${conMarca.m.texto}» = ${conMarca.m.marca} (alias de marca, perfil «${regla.nombre}»).`);
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
    // Una marca del catálogo (o la de un alias del perfil) se escribe como está allí; una de la lista base,
    // con mayúscula inicial.
    if (marca && !marcas.includes(marca) && !conMarca?.m.alias) marca = titulo(marca);

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
      const propuestas = tallasPorRegla(publico, regla);
      if (explicitas) {
        const iguales = propuestas.length === tallasUnicas.length && propuestas.every((t, i) => t === tallasUnicas[i]);
        if (!todas) {
          if (!iguales) notasRegla.push(`${citar(expresion)} con tallas concretas: se usaron esas (${describirTallas(tallasUnicas)}).`);
        } else if (!propuestas.length) {
          notasRegla.push(`Dice «todas las tallas» y también trae tallas concretas: se usaron las concretas (${describirTallas(tallasUnicas)}).`);
        } else if (!iguales) {
          revisar.add("tallas");
          notasRegla.push(`Dice «todas las tallas», pero trae tallas concretas: se usaron las concretas (${describirTallas(tallasUnicas)}); para ${NOMBRES_PUBLICO[publico]} la regla propone ${describirTallas(propuestas)}. Compruébalas.`);
        }
      } else if (propuestas.length) {
        tallasUnicas = propuestas;
        porRegla = true;
        notasRegla.push(notaRegla(publico, expresion, regla));
      } else {
        revisar.add("publico");
        notasRegla.push(NOTA_SIN_PUBLICO);
      }
      notas.push(...notasRegla);
    }
    if (!tallasUnicas.length) revisar.add("tallas");
    if (!color) revisar.add("color");
    // Etapa 20: cantidad de colores. Una sola cantidad positiva es válida (el límite del catálogo lo
    // comprueba el importador); varias distintas o un cero quedan por revisar.
    // Válida: un único entero (sin signo ni decimales) entre 1 y el límite del catálogo. Lo demás queda
    // «Revisar» con el valor tal como lo escribió el proveedor; nunca se redondea ni se corrige.
    const distintas = cantidades;
    const limite = limiteColores(maxColores);
    let cantidadColores = null;
    let notaCantidad = "";
    const cantidadTexto = distintas.length === 1 ? distintas[0] : "";
    if (distintas.length > 1) notaCantidad = `El mensaje indica cantidades de colores distintas (${distintas.join(" y ")}): revisa cuántos colores tendrá.`;
    else if (distintas.length === 1) {
      const t = distintas[0];
      const n = /^\d+$/.test(t) ? Number(t) : NaN;
      if (/^-/.test(t)) notaCantidad = `«${t} colores» no es una cantidad válida (es negativa): revisa cuántos colores tendrá.`;
      else if (/[.,]/.test(t)) notaCantidad = `«${t} colores» no es una cantidad válida (debe ser un número entero): revisa cuántos colores tendrá.`;
      else if (!Number.isInteger(n) || n < 1) notaCantidad = `«${t} colores» no es una cantidad válida: revisa cuántos colores tendrá.`;
      else if (limite && n > limite) notaCantidad = `«${t} colores» supera el máximo de ${limite} colores por zapatilla: revisa cuántos colores tendrá.`;
      else cantidadColores = n;
    }
    if (notaCantidad) { revisar.add("colores"); notas.push(notaCantidad); }

    return {
      marca, modelo, publico, precio, tallas: tallasUnicas, color, revisar: [...revisar], notas, omitido,
      todasLasTallas: todas, tallasExplicitas: explicitas, tallasPorRegla: porRegla, notasRegla,
      precios, notaPrecios, reglaTallas: pideRegla, expresionRegla: expresion,
      // Etapa 20: perfil con el que se leyó y reglas suyas que se aplicaron (alias, público, promociones).
      perfil: regla.id, reglas,
      // Etapa 20: cantidad de colores pedida en el mensaje (null si no la dice o no es válida).
      cantidadColores, cantidadesColores: distintas, cantidadTexto, notaCantidad
    };
  }

  // ------------------------------------------------------------------ perfiles: validación (etapa 20)
  const tieneLetra = (t) => /\p{L}/u.test(String(t));
  const textoPlano = (t, max) => String(t ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max + 1);
  const publicoValido = (t) => SINONIMOS_PUBLICO[clave(t)] || "";
  /* Valida un perfil (lo que llega del formulario, de IndexedDB o de un respaldo) y devuelve una copia
     congelada y limpia: { perfil, errores: [{ campo, mensaje }] }. Con errores, perfil es null.
     Solo texto, números y valores conocidos: nada se interpreta como código. */
  function normalizarPerfil(entrada) {
    const e = entrada && typeof entrada === "object" ? entrada : {};
    const errores = [];
    const error = (campo, mensaje) => errores.push({ campo, mensaje });
    const L = LIMITES_PERFIL;
    const nombre = textoPlano(e.nombre, L.nombre);
    if (!nombre) error("nombre", "Escribe el nombre del proveedor.");
    else if (nombre.length > L.nombre) error("nombre", `El nombre admite hasta ${L.nombre} caracteres.`);
    else if (clave(nombre) === clave(PERFIL_GENERAL.nombre)) error("nombre", "Ese nombre es el del Perfil general: elige otro.");
    const id = String(e.id || "");
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/i.test(id) || id === PERFIL_GENERAL.id) error("id", "Identificador de perfil no válido.");
    const revision = Number.isInteger(e.revision) && e.revision >= 0 ? e.revision : 0;

    const lista = (valor, campo) => {
      if (valor === undefined || valor === null) return [];
      if (!Array.isArray(valor)) { error(campo, "Formato no válido."); return []; }
      if (valor.length > L.entradas) error(campo, `Como mucho ${L.entradas} reglas en este apartado.`);
      return valor.slice(0, L.entradas);
    };
    const expresionValida = (t, campo, n) => {
      const x = textoPlano(t, L.expresion);
      if (!x || !tieneLetra(x)) { error(campo, `Regla ${n}: la expresión debe tener letras.`); return ""; }
      if (x.length > L.expresion) { error(campo, `Regla ${n}: la expresión admite hasta ${L.expresion} caracteres.`); return ""; }
      return x;
    };
    const vistas = (campo) => {
      const set = new Set();
      return (x, n) => { const k = clave(x); if (set.has(k)) { error(campo, `Regla ${n}: «${x}» está repetida.`); return false; } set.add(k); return true; };
    };

    const marcas = [];
    const unaMarca = vistas("marcas");
    lista(e.marcas, "marcas").forEach((m, i) => {
      const alias = expresionValida(m?.alias, "marcas", i + 1);
      const marca = textoPlano(m?.marca, L.marca).toLocaleUpperCase("es");
      if (!marca || !tieneLetra(marca) || marca.length > L.marca) { error("marcas", `Regla ${i + 1}: escribe la marca (hasta ${L.marca} caracteres).`); return; }
      if (alias && unaMarca(alias, i + 1)) marcas.push(Object.freeze({ alias, marca }));
    });
    const equivalencias = (valor, campo) => {
      const salida = [];
      const una = vistas(campo);
      lista(valor, campo).forEach((x, i) => {
        const expresion = expresionValida(x?.expresion, campo, i + 1);
        const publico = publicoValido(x?.publico);
        if (!publico) { error(campo, `Regla ${i + 1}: el público debe ser dama, hombre o unisex.`); return; }
        if (expresion && una(expresion, i + 1)) salida.push(Object.freeze({ expresion, publico }));
      });
      return salida;
    };
    const publico = equivalencias(e.publico, "publico");
    const numeracion = equivalencias(e.numeracion, "numeracion");

    const rangos = {};
    for (const p of ["dama", "hombre", "unisex"]) {
      const r = e.rangos?.[p];
      if (r === undefined || r === null || r === "") { rangos[p] = null; continue; }
      const desde = Number(r.desde);
      const hasta = Number(r.hasta);
      if (!Number.isInteger(desde) || !Number.isInteger(hasta) || desde < TALLA_MIN || hasta > TALLA_MAX || hasta < desde || hasta - desde > L.rangoMax) {
        error(`rango-${p}`, `${NOMBRES_PUBLICO[p]}: el rango debe ser de tallas EU enteras entre ${TALLA_MIN} y ${TALLA_MAX}, de menor a mayor (como mucho ${L.rangoMax + 1} tallas).`);
        rangos[p] = null;
        continue;
      }
      rangos[p] = Object.freeze({ desde, hasta });
    }

    const categoria = textoPlano(e.categoria, L.categoria).toLocaleUpperCase("es");
    if (categoria.length > L.categoria) error("categoria", `La categoría admite hasta ${L.categoria} caracteres.`);
    const promociones = [];
    const unaPromo = vistas("promociones");
    lista(e.promociones, "promociones").forEach((t, i) => {
      const x = textoPlano(t, L.promocion);
      if (!x || !tieneLetra(x) || x.length < 3) { error("promociones", `Frase ${i + 1}: escribe al menos 3 caracteres con letras.`); return; }
      if (x.length > L.promocion) { error("promociones", `Frase ${i + 1}: admite hasta ${L.promocion} caracteres.`); return; }
      if (unaPromo(x, i + 1)) promociones.push(x);
    });
    if (errores.length) return { perfil: null, errores };
    return {
      errores,
      perfil: Object.freeze({
        id, nombre, revision, general: false,
        marcas: Object.freeze(marcas), publico: Object.freeze(publico), numeracion: Object.freeze(numeracion),
        rangos: Object.freeze(rangos), categoria, promociones: Object.freeze(promociones)
      })
    };
  }
  // Perfil nuevo a partir del general: mismas palabras de numeración, rangos vacíos (= los del general).
  function perfilInicial(id, nombre) {
    return {
      id, nombre, revision: 0, marcas: [], publico: [],
      numeracion: PERFIL_GENERAL.numeracion.map((n) => ({ ...n })),
      rangos: { dama: null, hombre: null, unisex: null }, categoria: "", promociones: []
    };
  }
  // ¿El texto contiene la expresión como palabras completas? (para proponer reglas del perfil)
  const contieneExpresion = (textoBuscar, expresion) => new RegExp(`${BORDE_INICIO}(?:${patronLiteral(expresion)})${BORDE_FIN}`, "iu").test(String(textoBuscar || ""));
  // Utilidades para separar publicaciones (etapa 20): marca al principio de una línea y precios.
  function marcaAlInicio(linea, { marcas = [], perfil = null } = {}) {
    const comp = compilar(perfil && !esGeneral(perfil) ? perfil : PERFIL_GENERAL);
    const limpia = limpiarLinea(String(linea || "").replace(TELEFONOS, " "));
    const m = buscarMarca(limpia, [...comp.alias, ...new Set([...marcas.map(String).filter(Boolean), ...MARCAS_BASE])]);
    return m && m.pos === 0 ? m.marca : "";
  }
  const tienePrecio = (linea) => leerPrecios(limpiarLinea(String(linea || "").replace(TELEFONOS, " "))).length > 0;
  // Línea de cierre de un mensaje: teléfono o frase de contacto («Dinos y te ayudamos», «Aparta la tuya»).
  function esContacto(linea) {
    const limpia = limpiarLinea(String(linea || ""));
    return TELEFONO.test(limpia) || FRASE_CONTACTO.test(limpia);
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
    REGLAS_PROVEEDOR, tallasPorRegla, notaRegla, NOTA_SIN_PUBLICO,
    // Etapa 20: perfiles de proveedor y utilidades del pegado de varias publicaciones.
    PERFIL_GENERAL, LIMITES_PERFIL, normalizarPerfil, perfilInicial, esGeneral, rangoPara, publicoValido,
    contieneExpresion, marcaAlInicio, tienePrecio, esContacto, limpiarLinea,
    // Etapa 21: tallas EU que admite el catálogo (para explicar incompatibilidades, p. ej. calzado infantil).
    LIMITES_TALLA: Object.freeze({ min: TALLA_MIN, max: TALLA_MAX })
  });
})();
