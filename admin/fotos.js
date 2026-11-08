/* Panel privado de Gama & Talla · etapa 16: fotografías.
 *
 * Validación y optimización EN EL NAVEGADOR antes de subir a Supabase Storage, y la subida
 * con progreso. Sin dependencias. Expone window.GamaTallaFotos.
 *
 *  - El tipo se decide por el CONTENIDO (firma de los primeros bytes), no por la extensión ni
 *    por el tipo que declara el sistema. Después el navegador debe poder decodificarla.
 *  - Se conservan las proporciones: nunca se recorta. Nunca se amplía una foto pequeña.
 *  - Un WebP que ya es adecuado (hasta 1600 px y 300 KB) se sube tal cual, sin recomprimir.
 *  - La salida se comprueba: debe ser WebP de verdad (algunos navegadores, como Safari en
 *    ciertas versiones, devuelven PNG cuando se les pide WebP). Si el navegador no sabe
 *    generar WebP, se dice; no se sube otra cosa.
 *  - Cada versión de una foto es un archivo nuevo, con nombre único: nada se sobrescribe.
 */
(() => {
  "use strict";

  const LIMITES = Object.freeze({
    bytesEntradaMax: 15 * 1024 * 1024,    // archivo original: hasta 15 MB
    megapixelesMax: 50,                   // más es anómalo (o una «bomba» de descompresión)
    ladoMinimo: 400,                      // lado mayor mínimo; no se amplía nada
    ladoPequeno: 900,                     // por debajo, aviso: se verá poco nítida en pantallas grandes
    ladoMaximo: 1600,                     // lado mayor de la foto publicada
    ladoReducido: 1280,                   // segundo intento si a 1600 px pesa demasiado
    bytesObjetivo: 250 * 1024,            // objetivo orientativo: 150–250 KB
    bytesSinRecomprimir: 300 * 1024,      // un WebP adecuado hasta este peso no se toca
    bytesFinalMax: 600 * 1024,            // por encima se rechaza (el bucket admite 1 MiB)
    fotosPorColor: 12,
    fotosPorOperacion: 12
  });
  const CALIDADES = [0.86, 0.8, 0.74, 0.68];
  const BUCKET = "fotos-catalogo";

  const kb = (bytes) => `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("es-CO")} KB`;
  const mb = (bytes) => `${(bytes / (1024 * 1024)).toLocaleString("es-CO", { maximumFractionDigits: 1 })} MB`;
  const peso = (bytes) => (bytes >= 1024 * 1024 ? mb(bytes) : kb(bytes));

  class ErrorFoto extends Error {}
  const fallo = (mensaje) => new ErrorFoto(mensaje);

  // Firma del contenido: «webp», «jpeg», «png» o null.
  async function firma(blob) {
    const b = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    const ascii = (desde, hasta) => String.fromCharCode(...b.slice(desde, hasta));
    if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
    if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "png";
    return null;
  }

  function codificar(lienzo, calidad) {
    return new Promise((resolver) => {
      try { lienzo.toBlob((blob) => resolver(blob), "image/webp", calidad); } catch { resolver(null); }
    });
  }

  function dibujar(mapa, ancho, alto) {
    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    const contexto = lienzo.getContext("2d");
    contexto.imageSmoothingEnabled = true;
    contexto.imageSmoothingQuality = "high";
    contexto.drawImage(mapa, 0, 0, ancho, alto);
    return lienzo;
  }

  /* Valida y optimiza un archivo. Devuelve { blob, ancho, alto, pesoOriginal, pesoFinal,
     recomprimida, tipoOriginal, aviso } o lanza ErrorFoto con un mensaje para la persona. */
  async function preparar(archivo) {
    if (!(archivo instanceof Blob)) throw fallo("No es un archivo.");
    if (!archivo.size) throw fallo("El archivo está vacío.");
    if (archivo.size > LIMITES.bytesEntradaMax) throw fallo(`Pesa ${peso(archivo.size)}; el máximo es ${mb(LIMITES.bytesEntradaMax)}.`);
    const tipo = await firma(archivo);
    if (!tipo) throw fallo("No es una foto JPEG, PNG o WebP. Lo comprobamos por su contenido, no por el nombre del archivo.");

    let mapa;
    try { mapa = await createImageBitmap(archivo); } catch { mapa = null; }
    if (!mapa) throw fallo("No pudimos abrir la imagen: el archivo está dañado o este navegador no puede leerla.");
    try {
      const { width: ancho, height: alto } = mapa;
      if (!ancho || !alto) throw fallo("La imagen no tiene dimensiones válidas.");
      if (ancho * alto > LIMITES.megapixelesMax * 1e6) throw fallo(`Mide ${ancho}×${alto} px: es demasiado grande para procesarla aquí (máximo ${LIMITES.megapixelesMax} megapíxeles).`);
      const lado = Math.max(ancho, alto);
      if (lado < LIMITES.ladoMinimo) throw fallo(`Mide ${ancho}×${alto} px; el lado mayor debe tener al menos ${LIMITES.ladoMinimo} px. No ampliamos fotos pequeñas.`);
      const aviso = lado < LIMITES.ladoPequeno ? `Es pequeña (${ancho}×${alto} px): se verá con poca nitidez en pantallas grandes.` : "";
      const original = (extra = "") => ({
        blob: archivo, ancho, alto, pesoOriginal: archivo.size, pesoFinal: archivo.size,
        recomprimida: false, tipoOriginal: tipo, aviso: [aviso, extra].filter(Boolean).join(" ")
      });

      // Un WebP ya adecuado se sube tal cual.
      if (tipo === "webp" && archivo.size <= LIMITES.bytesSinRecomprimir && lado <= LIMITES.ladoMaximo) return original();

      let mejor = null;
      let soporta = true;
      // Segundo intento más pequeño solo si la foto es mayor que ese tamaño.
      const tamanos = lado > LIMITES.ladoReducido ? [LIMITES.ladoMaximo, LIMITES.ladoReducido] : [LIMITES.ladoMaximo];
      fuera: for (const maximo of tamanos) {
        const escala = Math.min(1, maximo / lado);   // nunca mayor que 1: no se amplía
        const w = Math.max(1, Math.round(ancho * escala));
        const h = Math.max(1, Math.round(alto * escala));
        const lienzo = dibujar(mapa, w, h);
        for (const calidad of CALIDADES) {
          const blob = await codificar(lienzo, calidad);
          if (!blob || (await firma(blob)) !== "webp") { soporta = false; break fuera; }
          if (!mejor || blob.size < mejor.blob.size) mejor = { blob, w, h };
          if (blob.size <= LIMITES.bytesObjetivo) break fuera;
        }
        if (mejor && mejor.blob.size <= LIMITES.bytesFinalMax) break;
      }

      const originalUtil = tipo === "webp" && lado <= LIMITES.ladoMaximo && archivo.size <= LIMITES.bytesFinalMax;
      if (!soporta) {
        if (originalUtil) return original("Este navegador no puede recomprimir WebP: se sube tal cual.");
        throw fallo("Este navegador no puede generar WebP. Usa Chrome, Edge o Firefox, o sube la foto ya convertida a WebP (hasta 1600 px y 600 KB).");
      }
      // Recomprimir no ayudó: se conserva el WebP original, sin perder calidad.
      if (originalUtil && archivo.size <= mejor.blob.size) return original();
      if (mejor.blob.size > LIMITES.bytesFinalMax) {
        throw fallo(`Aun optimizada pesa ${peso(mejor.blob.size)}; el máximo es ${kb(LIMITES.bytesFinalMax)}. Prueba con otra foto.`);
      }
      return {
        blob: mejor.blob, ancho: mejor.w, alto: mejor.h, pesoOriginal: archivo.size, pesoFinal: mejor.blob.size,
        recomprimida: true, tipoOriginal: tipo, aviso
      };
    } finally {
      mapa.close?.();
    }
  }

  // Nombre único y versionado: productos/<producto>/<color>/<milisegundos>-<10 aleatorios>.webp
  function nombreObjeto(productoId, varianteId) {
    const letras = "0123456789abcdefghijklmnopqrstuvwxyz";
    const azar = crypto.getRandomValues(new Uint8Array(10));
    const sufijo = Array.from(azar, (n) => letras[n % letras.length]).join("");
    return `productos/${productoId}/${varianteId}/${String(Date.now()).padStart(13, "0")}-${sufijo}.webp`;
  }

  const urlPublica = (base, objeto) => `${base}/storage/v1/object/public/${BUCKET}/${objeto}`;
  const objetoDe = (ruta) => {
    const m = /\/storage\/v1\/object\/public\/fotos-catalogo\/(productos\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9]{13}-[0-9a-z]{10}\.webp)$/.exec(String(ruta || ""));
    return m ? m[1] : null;
  };

  /* Sube un archivo con la sesión del administrador, sin sobrescribir (x-upsert: false).
     Resuelve siempre: { ok: true } o { ok: false, tipo, mensaje }. «red» significa que NO
     sabemos si llegó: quien llama debe comprobarlo antes de dar nada por hecho. */
  function subir({ base, clave, token, objeto, blob, alProgreso = () => {}, tiempoMax = 90000 }) {
    return new Promise((resolver) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${base}/storage/v1/object/${BUCKET}/${objeto}`);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("apikey", clave);
      xhr.setRequestHeader("Content-Type", "image/webp");
      xhr.setRequestHeader("x-upsert", "false");
      xhr.setRequestHeader("cache-control", "max-age=31536000");
      xhr.timeout = tiempoMax;
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) alProgreso(e.loaded / e.total); };
      xhr.onload = () => {
        const estado = xhr.status;
        let cuerpo = {};
        try { cuerpo = JSON.parse(xhr.responseText || "{}"); } catch { cuerpo = {}; }
        const codigo = String(cuerpo.statusCode || estado);
        const texto = `${cuerpo.error || ""} ${cuerpo.message || ""}`;
        if (estado >= 200 && estado < 300) return resolver({ ok: true });
        if (codigo === "409" || /duplicate|already exists/i.test(texto)) return resolver({ ok: false, tipo: "duplicado" });
        if (estado === 401 || /jwt|token/i.test(texto) && codigo !== "403") return resolver({ ok: false, tipo: "sin-sesion", mensaje: "La sesión terminó." });
        if (codigo === "403" || /row-level security|unauthorized/i.test(texto)) return resolver({ ok: false, tipo: "sin-permiso", mensaje: "El servidor no permite esta subida (permiso o nombre de archivo)." });
        if (codigo === "413" || /maximum allowed size|too large/i.test(texto)) return resolver({ ok: false, tipo: "rechazo", mensaje: "El servidor rechazó la foto por su tamaño (máximo 1 MB)." });
        if (codigo === "415" || /mime/i.test(texto)) return resolver({ ok: false, tipo: "rechazo", mensaje: "El servidor solo admite fotos WebP." });
        if (estado >= 500 || estado === 0) return resolver({ ok: false, tipo: "red" });
        return resolver({ ok: false, tipo: "rechazo", mensaje: "El servidor rechazó la foto." });
      };
      xhr.onerror = () => resolver({ ok: false, tipo: "red" });
      xhr.ontimeout = () => resolver({ ok: false, tipo: "red" });
      xhr.onabort = () => resolver({ ok: false, tipo: "red" });
      xhr.send(blob);
    });
  }

  window.GamaTallaFotos = Object.freeze({ LIMITES, BUCKET, preparar, firma, nombreObjeto, urlPublica, objetoDe, subir, peso, ErrorFoto });
})();
