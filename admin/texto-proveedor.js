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
 */
(() => {
  "use strict";

  // Marcas que se reconocen sin estar en el catálogo (el catálogo añade las suyas).
  const MARCAS_BASE = [
    "New Balance", "Nike", "Adidas", "Puma", "Reebok", "Vans", "Converse", "Asics", "Fila", "Jordan", "Skechers",
    "Under Armour", "Salomon", "Hoka", "Mizuno", "Lacoste", "Diesel", "Balenciaga", "Alexander McQueen", "Louis Vuitton",
    "Gucci", "Dior", "Prada", "Versace", "Golden Goose", "Saucony", "Brooks", "Merrell", "Timberland", "Caterpillar",
    "Kappa", "Le Coq Sportif", "Diadora", "Umbro", "Lotto", "Champion", "Tommy Hilfiger", "Calvin Klein", "Guess",
    "Steve Madden", "Crocs", "Dr. Martens", "Onitsuka Tiger", "Yeezy", "Off-White", "Veja", "K-Swiss", "Polo Ralph Lauren"
  ];

  const sinTildes = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const clave = (t) => sinTildes(t).toLowerCase().replace(/[^a-z0-9ñ]+/g, " ").trim();
  // Emojis, banderas y modificadores: decoran la publicación, no son datos.
  const EMOJIS = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}]/gu;
  const limpiarLinea = (l) => l.replace(EMOJIS, " ").replace(/[*_~]/g, " ").replace(/\s+/g, " ").trim();

  // Teléfonos: colombianos (con o sin +57) y cualquier secuencia larga de dígitos con separadores.
  const TELEFONO = /(?:\+\s?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b|\+\d[\d\s.-]{8,}\d/;
  const TELEFONOS = new RegExp(TELEFONO.source, "g");
  // Frase de contacto que acompaña a un teléfono en la misma línea: se omite desde ahí hasta el final.
  const CONTACTO = /(?<!\p{L})(?:estamos atentos|te atiendo|escr[ií]be(?:me|nos)|atenci[oó]n|cont[aá]cta(?:me|nos)|contacto|whats?app|wsp|ll[aá]ma(?:me|nos)|pedidos|informaci[oó]n|info)(?!\p{L})/iu;
  // Frases del proveedor que no describen la zapatilla.
  const PROMO = /^(?:recarga|nuevo ingreso|nueva coleccion|novedad|promo(?:cion)?|oferta|disponible|llegaron|llego|te atiendo|atencion|escribeme|escribenos|pedidos?|hago envios?|envios?|calidad|importad[oa]s?|original(?:es)?|ultimas? unidades|preventa|stock)\b/i;

  // ------------------------------------------------------------------ precio
  // «$115.000», «115.000», «$115000», «115 mil», «115k». Devuelve pesos enteros o null.
  const PRECIO = /\$\s?(\d{1,3}(?:[.\s]\d{3})+|\d{4,7})(?!\d)|\b(\d{1,3}(?:\.\d{3})+)(?!\d)(?:\s?(?:cop|pesos))?|\b(\d{2,4})\s?(?:mil|k)\b/i;
  function leerPrecio(linea) {
    const m = PRECIO.exec(linea);
    if (!m) return null;
    if (m[3]) return { valor: Number(m[3]) * 1000, texto: m[0] };
    const digitos = (m[1] || m[2]).replace(/\D/g, "");
    return { valor: Number(digitos), texto: m[0] };
  }

  // ------------------------------------------------------------------ público
  function leerPublico(texto) {
    const t = clave(texto);
    const hombre = /\b(hombre|hombres|caballero|caballeros|masculino)\b/.test(t);
    const dama = /\b(dama|damas|mujer|mujeres|femenino)\b/.test(t);
    const unisex = /\bunisex\b/.test(t);
    if (unisex) return "unisex";
    if (hombre && dama) return "ambos";
    if (hombre) return "hombre";
    if (dama) return "dama";
    return "";
  }
  const PALABRAS_PUBLICO = /\b(?:hombres?|caballeros?|masculino|damas?|mujer(?:es)?|femenino|unisex)\b/gi;
  const RELLENO = /\b(?:precio|valor|solo|desde|cop|pesos|par)\b/gi;

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
  /* Separadores entre tallas. «al», «a», «hasta», «–» y «—» marcan un rango. «-» marca un rango SOLO entre
     dos tallas («40-44»): con tres o más («40-42-44», «40-41-42-43-44») es una lista explícita. */
  const SEPARADOR = String.raw`(?:\s*[-–—;,/+]\s*|\s+(?:y|al|a|hasta)\s+)`;
  const SECUENCIA = String.raw`${UNA_TALLA}(?:${SEPARADOR}${UNA_TALLA})*`;
  const SECUENCIA_ESPACIOS = String.raw`${UNA_TALLA}(?:(?:${SEPARADOR}|\s+)${UNA_TALLA})*`;
  const PALABRA_TALLAS = String.raw`(?:tallas?|tll|numeraci[oó]n)(?:\s+disponibles?)?`;
  // «Tallas 40-41-42», «Talla: 37», «tallas 38 39 40»: tras la palabra, también separadas por espacios.
  const TRAS_PALABRA = new RegExp(String.raw`(?<!\p{L})${PALABRA_TALLAS}(?!\p{L})\s*:?\s*(${SECUENCIA_ESPACIOS})(?!\d|[.,]\d)`, "giu");
  // «37 euro», «40-44 eu».
  const CON_EURO = new RegExp(String.raw`(?<![\d.,$/])(${SECUENCIA})\s*(?:euros?|eu)(?!\p{L})`, "giu");
  // «40 al 44», «38; 39 y 40,5», «40-42-44»: dos o más tallas con separador explícito, en cualquier parte.
  const ENCADENADAS = new RegExp(String.raw`(?<![\d.,$/])(${UNA_TALLA}(?:${SEPARADOR}${UNA_TALLA})+)(?!\d|[.,]\d)`, "giu");
  // Línea que solo tiene tallas separadas por espacios y la palabra «euro» o «tallas» («36 37 38 Euro»).
  const SOLO_ESPACIOS = new RegExp(String.raw`^\s*(?:${PALABRA_TALLAS}\s*:?\s*)?(${SECUENCIA_ESPACIOS})\s*(?:euros?|eu)?\s*$`, "iu");
  const PALABRAS_TALLAS = /(?<!\p{L})(?:tallas?|tll|numeraci[oó]n|disponibles?|euros?|eu)(?!\p{L})\s*:?/giu;
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
     omitido: { telefonos, promocional } }. «revisar» lista los campos que hay que comprobar. */
  function analizar(texto, { marcas = [] } = {}) {
    const listaMarcas = [...new Set([...marcas.map(String).filter(Boolean), ...MARCAS_BASE])];
    const notas = [];
    const revisar = new Set();
    const omitido = { telefonos: 0, promocional: 0 };
    let precio = null;
    let publico = "";
    let color = "";
    const tallas = [];
    const aisladas = [];
    const candidatas = [];

    const lineas = String(texto || "").split(/\r?\n/);
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

      const p = leerPrecio(linea);
      if (p && precio === null) {
        precio = p.valor;
        linea = linea.replace(p.texto, " ");
      }
      // Una talla sola en su línea («37»): se decide al final, cuando se sabe si el texto trae otras tallas.
      if (TALLA_AISLADA.test(linea)) { aisladas.push(linea.trim()); continue; }

      // Tallas: se toman los tramos que lo son y el resto de la línea se sigue leyendo (una sola línea
      // puede traer marca, modelo, tallas y precio).
      const leidas = extraerTallas(linea);
      tallas.push(...leidas.tallas);
      notas.push(...leidas.dudas);
      linea = leidas.resto;
      if (!clave(linea)) continue;

      const pub = leerPublico(linea);
      if (pub && !publico) publico = pub;
      // Lo que queda sin precio, público ni palabras de relleno puede ser el modelo o el color.
      const restante = limpiarLinea(linea.replace(PALABRAS_PUBLICO, " ").replace(RELLENO, " ").replace(/[,;:|]+/g, " "));
      if (!restante || clave(restante).length < 2) continue;
      if (PROMO.test(clave(restante))) { omitido.promocional += 1; continue; }
      if (soloColores(restante)) { color = color || restante; continue; }
      candidatas.push(restante);
    }

    // Marca y modelo: la primera línea con una marca conocida; si no hay, la primera candidata.
    let marca = "";
    let modelo = "";
    const conMarca = candidatas.map((l) => ({ l, m: buscarMarca(l, listaMarcas) })).find((x) => x.m);
    if (conMarca) {
      marca = conMarca.m.marca;
      modelo = quitarMarca(conMarca.l, conMarca.m.marca);
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

    if (publico === "ambos") { publico = ""; revisar.add("publico"); notas.push("El texto menciona hombre y dama: elige el público."); }
    if (!publico) revisar.add("publico");
    if (precio === null) { revisar.add("precio"); }
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
    const tallasUnicas = unicasOrdenadas(tallas);
    if (!tallasUnicas.length) revisar.add("tallas");
    if (!color) revisar.add("color");

    return { marca, modelo, publico, precio, tallas: tallasUnicas, color, revisar: [...revisar], notas, omitido };
  }

  // Clave para comparar modelos (lote y catálogo): sin tildes, mayúsculas ni signos, y sin la marca.
  function claveModelo(marca, modelo) {
    const m = clave(marca);
    let n = clave(modelo);
    if (m && (n === m || n.startsWith(`${m} `))) n = n.slice(m.length).trim();
    return m && n ? `${m}|${n}` : "";
  }

  window.GamaTallaTextoProveedor = Object.freeze({ analizar, leerCampoTallas, tallasDe, racional, claveModelo, clave, MARCAS_BASE });
})();
