/* Panel privado de Gama & Talla · etapa 20: separar varias publicaciones pegadas juntas.
 *
 * Recibe el texto pegado (varios mensajes de WhatsApp) y propone dónde empieza cada publicación. Solo
 * propone: la persona revisa la división, la corrige (separar o unir) y decide cuándo crear las fichas.
 * Se ejecuta SOLO en el navegador. Expone window.GamaTallaSeparador. Depende de texto-proveedor.js.
 *
 * Límites entre publicaciones, de más a menos seguros:
 *  1. Encabezado de un mensaje copiado o exportado de WhatsApp: «[22/11/26, 10:15] Nombre: …»,
 *     «22/11/26, 10:15 - Nombre: …» o «[10:15 a. m., 22/11/2026] Nombre: …». El encabezado no pasa al
 *     texto de la publicación (se conserva aparte, en el texto original).
 *  2. Una línea separadora hecha solo de signos («-----», «=====», «*****», «• • •»).
 *  3. Una línea que EMPIEZA por una marca cuando la publicación en curso ya trae un precio
 *     («REEBOK PRINCENSA … $105.000» y después «NIKE 7 CAMARAS …»). Si el párrafo de esa marca empieza
 *     con líneas sin datos («🔥NUEVO INGRESO🔥»), el corte sube hasta ellas.
 * Una línea vacía por sí sola NUNCA separa: los saltos internos de una publicación se conservan.
 *
 * Divisiones dudosas (se señalan para revisarlas, no se deciden solas):
 *  - un corte por marca sin línea vacía delante;
 *  - un fragmento sin precio ni marca a un lado del corte (¿es la continuación del mensaje anterior?).
 *
 * Líneas de WhatsApp que no son texto del proveedor («<Multimedia omitido>», «imagen omitida»,
 * «Se eliminó este mensaje», «<Se editó este mensaje.>») no pasan al texto de la publicación.
 *
 * Estado serializable (lo guarda el borrador): { texto, cortes: [{ linea, tipo, dudosa, motivo, manual }],
 * incluir: { [línea de inicio]: true|false } }. Los fragmentos se derivan siempre de texto + cortes.
 */
(() => {
  "use strict";

  const lector = () => window.GamaTallaTextoProveedor;

  const FECHA = String.raw`\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}`;
  const HORA = String.raw`\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?\s?m\.?)?`;
  // Prefijo del encabezado (fecha y hora); el nombre y el texto se leen después.
  const ENCABEZADO = new RegExp(String.raw`^[‎‏﻿\s]*(\[\s*(?:${FECHA},?\s+${HORA}|${HORA},?\s+${FECHA})\s*\]|${FECHA},?\s+${HORA}\s+-)\s*(.*)$`, "iu");
  const MULTIMEDIA = /^[‎‏\s]*(?:<\s*(?:multimedia omitid[oa]|media omitted|adjunto:[^>]*|attached:[^>]*)\s*>|(?:imagen|video|sticker|gif|audio|documento)\s+omitid[oa]|(?:image|video|sticker|gif|audio|document) omitted|[\w.-]+\.(?:jpe?g|png|webp|heic|mp4|opus|pdf)\s*\((?:archivo adjunto|file attached)\)|se elimin[oó] este mensaje\.?|eliminaste este mensaje\.?|this message was deleted\.?)\s*$/iu;
  const EDITADO = /\s*<\s*(?:se edit[oó] este mensaje|this message was edited)\.?\s*>\s*$/iu;
  const SEPARADOR = /^\s*(?:[-=_*~•·.—–]\s*){3,}$/u;
  const MAX_TEXTO = 200000;   // caracteres del pegado (unas 300 publicaciones largas)
  const MAX_BLOQUES = 120;    // publicaciones que se crean de una vez

  /* Información de cada línea: { cruda, vacia, encabezado: { prefijo, nombre, resto } | null,
     separador, multimedia, contenido } («contenido»: la línea sin encabezado ni «editado»). */
  function lineasDe(texto) {
    const crudas = String(texto || "").replace(/\r\n?/g, "\n").split("\n");
    return crudas.map((cruda) => {
      const info = { cruda, vacia: false, encabezado: null, separador: false, multimedia: false, contenido: cruda };
      const e = ENCABEZADO.exec(cruda);
      if (e) {
        // «Nombre: texto»; sin dos puntos es un aviso del sistema («Los mensajes están cifrados…»).
        const n = /^([^:\n]{1,80}?):\s?(.*)$/u.exec(e[2]);
        info.encabezado = { prefijo: e[1].trim(), nombre: n ? n[1].trim() : "", sistema: !n };
        info.contenido = n ? n[2] : "";
      }
      info.contenido = info.contenido.replace(EDITADO, "");
      if (MULTIMEDIA.test(info.contenido)) { info.multimedia = true; info.contenido = ""; }
      if (!info.encabezado && SEPARADOR.test(info.contenido)) info.separador = true;
      info.vacia = !info.encabezado && !info.separador && !info.multimedia && !info.contenido.trim();
      return info;
    });
  }
  const tieneTexto = (info) => !info.vacia && !info.separador && !info.multimedia && Boolean(info.contenido.trim());

  /* Propone los cortes: [{ linea, tipo: "encabezado" | "separador" | "marca", dudosa, motivo }]. El primer
     fragmento empieza en la primera línea con contenido (no lleva corte). */
  function detectar(texto, { marcas = [], perfil = null } = {}) {
    const L = lector();
    const lineas = lineasDe(texto);
    const cortes = [];
    let inicio = lineas.findIndex((x) => tieneTexto(x) || x.encabezado);
    if (inicio < 0) return { cortes, lineas: lineas.length };
    let conPrecio = false;
    let separadorPendiente = false;
    /* intro: primera de las líneas seguidas, inmediatamente encima de la actual, que no traen datos ni son
       de contacto («🔥NUEVO INGRESO🔥», «RECARGA»). Encabezan la publicación siguiente; un teléfono o una
       frase de contacto, en cambio, cierran la anterior. */
    let intro = null;
    const conDatos = (t) => L.tienePrecio(t) || Boolean(L.marcaAlInicio(t, { marcas, perfil })) || /\d{2}\s*(?:al|a|hasta|-)\s*\d{2}/i.test(t);
    for (let i = inicio; i < lineas.length; i += 1) {
      const x = lineas[i];
      if (x.vacia) { intro = null; continue; }
      if (x.separador) { separadorPendiente = true; intro = null; continue; }
      if (x.multimedia && !x.encabezado) continue;
      let corte = null;
      if (i > inicio) {
        if (x.encabezado) corte = { linea: i, tipo: "encabezado" };
        else if (separadorPendiente && tieneTexto(x)) corte = { linea: i, tipo: "separador" };
        else if (conPrecio && tieneTexto(x) && L.marcaAlInicio(x.contenido, { marcas, perfil })) {
          const desde = intro !== null && intro > inicio ? intro : i;
          // Seguro si delante hay una línea en blanco, un separador o el cierre (teléfono, contacto) del mensaje anterior.
          const previa = desde > 0 ? lineas[desde - 1] : null;
          const limpio = Boolean(previa && (previa.vacia || previa.separador || (tieneTexto(previa) && L.esContacto(previa.contenido))));
          corte = { linea: desde, tipo: "marca", dudosa: !limpio,
            motivo: limpio ? "" : "Empieza una marca justo debajo de otros datos, sin línea en blanco: ¿es otra publicación?" };
        }
      }
      if (corte) {
        cortes.push({ dudosa: false, motivo: "", ...corte });
        inicio = corte.linea;
        conPrecio = false;
      }
      separadorPendiente = false;
      if (tieneTexto(x)) {
        conPrecio = conPrecio || L.tienePrecio(x.contenido);
        if (conDatos(x.contenido) || L.esContacto(x.contenido)) intro = null;
        else if (intro === null) intro = i;
      }
    }
    return { cortes: revisarDudas(texto, cortes, { marcas, perfil }), lineas: lineas.length };
  }

  /* Un fragmento sin precio ni marca junto a un corte hace dudosa esa división (puede ser la
     continuación del mensaje anterior, p. ej. «40 al 44» en otro mensaje). */
  function revisarDudas(texto, cortes, opciones) {
    const fragmentos = bloques(texto, cortes, opciones);
    // Los fragmentos vacíos (una foto sin texto, un aviso del sistema) no se crean: no hacen dudoso nada.
    const conTexto = fragmentos.filter((b) => !b.vacio);
    const flojo = (b) => !b.datos.precio && !b.datos.precios.length && !b.datos.marca;
    return cortes.map((c) => {
      if (c.manual) return c;
      const ahora = conTexto.findIndex((b) => b.inicio === c.linea);
      if (ahora <= 0) return c;
      const n = fragmentos.indexOf(conTexto[ahora]) + 1;
      const m = fragmentos.indexOf(conTexto[ahora - 1]) + 1;
      if (flojo(conTexto[ahora])) return { ...c, dudosa: true, motivo: `El fragmento ${n} no trae precio ni marca: ¿es la continuación del ${m}?` };
      if (ahora === 1 && flojo(conTexto[0])) return { ...c, dudosa: true, motivo: `El fragmento ${m} no trae precio ni marca: ¿va con el ${n}?` };
      return c;
    });
  }

  /* Fragmentos que resultan de unos cortes: [{ inicio, fin, texto, original, encabezado, vacio, datos }].
     - texto: lo que se lee (sin encabezados, separadores ni líneas de multimedia), con sus saltos
       internos y sin líneas en blanco al principio ni al final.
     - original: las líneas tal cual se pegaron (encabezado incluido).
     - datos: resumen del lector para revisar la división { marca, modelo, precio, precios, tallas, publico }. */
  function bloques(texto, cortes, { marcas = [], perfil = null } = {}) {
    const L = lector();
    const lineas = lineasDe(texto);
    const primera = lineas.findIndex((x) => tieneTexto(x) || x.encabezado);
    if (primera < 0) return [];
    const inicios = [primera, ...cortes.map((c) => c.linea).filter((n) => n > primera && n < lineas.length)]
      .filter((n, i, a) => a.indexOf(n) === i).sort((a, b) => a - b);
    return inicios.map((inicio, i) => {
      const fin = (inicios[i + 1] ?? lineas.length) - 1;
      const tramo = lineas.slice(inicio, fin + 1);
      const utiles = tramo.filter((x) => !x.separador && !x.multimedia || (x.encabezado && x.contenido)).map((x) => x.contenido);
      while (utiles.length && !utiles[0].trim()) utiles.shift();
      while (utiles.length && !utiles[utiles.length - 1].trim()) utiles.pop();
      const crudas = tramo.map((x) => x.cruda);
      while (crudas.length && !crudas[crudas.length - 1].trim()) crudas.pop();
      const textoBloque = utiles.join("\n");
      const r = textoBloque.trim() ? L.analizar(textoBloque, { marcas, perfil }) : null;
      const encabezado = tramo.find((x) => x.encabezado)?.encabezado || null;
      return {
        inicio, fin, texto: textoBloque, original: crudas.join("\n"),
        encabezado: encabezado ? [encabezado.prefijo, encabezado.nombre].filter(Boolean).join(" ") : "",
        vacio: !textoBloque.trim(),
        lineasTexto: tramo.map((x, n) => ({ linea: inicio + n, texto: x.contenido, util: tieneTexto(x) })),
        datos: {
          marca: r?.marca || "", modelo: r?.modelo || "", precio: r?.precio ?? null, precios: r?.precios || [],
          tallas: r?.tallas || [], publico: r?.publico || "",
          // Etapa 20: cantidad de colores del mensaje («(2 colores)»); null si no la dice o no es válida.
          colores: r?.cantidadColores ?? null, notaColores: r?.notaCantidad || "", coloresTexto: r?.cantidadTexto || ""
        }
      };
    });
  }

  // ¿Se crea este fragmento? Por omisión, sí, salvo que esté vacío o no traiga precio, tallas ni marca.
  const incluidoPorOmision = (b) => !b.vacio && Boolean(b.datos.precio || b.datos.precios.length || b.datos.tallas.length || b.datos.marca);

  // Corte manual antes de una línea (separar) o quitar el corte que empieza un fragmento (unir).
  function separarEn(cortes, linea) {
    if (cortes.some((c) => c.linea === linea)) return cortes;
    return [...cortes, { linea, tipo: "manual", dudosa: false, motivo: "", manual: true }].sort((a, b) => a.linea - b.linea);
  }
  const unirCon = (cortes, inicio) => cortes.filter((c) => c.linea !== inicio);
  // Al unir o separar a mano, el corte vecino deja de estar «dudoso»: la persona ya lo revisó.
  const revisado = (cortes, linea) => cortes.map((c) => (c.linea === linea ? { ...c, dudosa: false, motivo: "", manual: true } : c));

  window.GamaTallaSeparador = Object.freeze({
    detectar, bloques, separarEn, unirCon, revisado, incluidoPorOmision, lineasDe, MAX_TEXTO, MAX_BLOQUES
  });
})();
