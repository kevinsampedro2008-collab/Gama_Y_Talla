/* =========================================================
   GAMA & TALLA — Presentación cinematográfica de bienvenida
   Controlador. Se reproduce automáticamente en cada carga del documento
   (nunca durante la navegación interna) y termina en la portada (#inicio).
   Gestiona la capa, los textos, la línea de tiempo, el salto y la versión
   estática de respaldo. La escena 3D vive en catalog-intro-escena.js.

   No guarda nada de forma persistente: el estado vive en memoria y una
   nueva carga del documento inicia una nueva presentación.
   Emite «bienvenida:fin» al terminar.
   ========================================================= */

const AJUSTES = {
  // GLB original del proyecto (Draco + WebP). Si más adelante existe una copia
  // optimizada para la web, basta con apuntar aquí.
  modelo: "assets/images/models/af1-model.glb",
  posterAmplio: "assets/images/intro/poster-amplio.webp",
  posterCompacto: "assets/images/intro/poster-compacto.webp",
  esperaMaximaModelo: 20000, // ms antes de pasar a la versión estática
  puntoDeEspera: 2.2 // segundo en el que la secuencia espera al modelo si aún no está listo
};

const CONSULTA_COMPACTA = "(max-width: 959px), (orientation: portrait)";

// Secuencia completa (segundos). Cada paso es un elemento [data-intro-paso].
const SECUENCIA_3D = {
  salida: 16.0,
  pasos: [
    { id: "apertura", desde: 0.25, hasta: 2.35 },
    { id: "frase-1", desde: 5.2, hasta: 7.3 },
    { id: "frase-2", desde: 7.8, hasta: 9.3 },
    { id: "frase-3", desde: 9.8, hasta: 11.5 },
    { id: "frase-4", desde: 11.9, hasta: 13.3 },
    { id: "cierre", desde: 14.0, hasta: Infinity }
  ]
};

// Versión estática: movimiento reducido, sin WebGL, ahorro de datos o si el modelo falla.
const SECUENCIA_ESTATICA = {
  salida: 4.0,
  pasos: [
    { id: "apertura", desde: 0.15, hasta: 1.45 },
    { id: "poster", desde: 1.1, hasta: Infinity },
    { id: "cierre", desde: 1.7, hasta: Infinity }
  ]
};

const capa = document.getElementById("intro-catalogo");
const portada = document.getElementById("inicio");
const parametros = new URLSearchParams(window.location.search);
const raiz = document.documentElement;

if (!capa || !portada || parametros.get("intro") === "no") {
  // Sin capa o desactivada solo para esta carga (diagnóstico y pruebas de la tienda).
  raiz.classList.remove("intro-pendiente");
} else {
  iniciar();
}

function iniciar() {
  const $ = (selector) => capa.querySelector(selector);
  const lienzo = $("[data-intro-lienzo]");
  const fondo = $("[data-intro-fondo]");
  const poster = $("[data-intro-paso='poster']");
  const carga = $("[data-intro-carga]");
  const cargaBarra = $("[data-intro-carga-progreso]");
  const cargaTexto = $("[data-intro-carga-texto]");
  const pasos = new Map([...capa.querySelectorAll("[data-intro-paso]")].map((nodo) => [nodo.dataset.introPaso, nodo]));
  const botonRepetir = document.getElementById("repetir-presentacion");
  const consultaCompacta = window.matchMedia(CONSULTA_COMPACTA);
  const movimientoReducido = window.matchMedia("(prefers-reduced-motion: reduce)");

  const estado = {
    activa: false,
    modo: null, // "3d" | "estatico"
    secuencia: SECUENCIA_3D,
    t: 0,
    pausado: false,
    velocidad: 1,
    ultimo: null,
    cuadro: 0,
    escena: null,
    turno: 0,
    saliendo: false,
    // Solo para diagnóstico: vive en memoria y desaparece con la carga del documento.
    reproducciones: 0,
    ultimoOrigen: null,
    ultimoFinal: null
  };
  let descarga = null;
  let moduloEscena = null;
  let webgl = null;

  /* ---------- Decisiones ---------- */

  const esCompacto = () => consultaCompacta.matches;

  function soportaWebGL() {
    if (webgl !== null) return webgl;
    try {
      const prueba = document.createElement("canvas");
      const contexto = prueba.getContext("webgl2") || prueba.getContext("webgl");
      webgl = Boolean(contexto);
      contexto?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      webgl = false;
    }
    return webgl;
  }

  function ahorroDeDatos() {
    const conexion = navigator.connection;
    return Boolean(conexion && (conexion.saveData || /(^|-)2g$|^3g$/.test(conexion.effectiveType || "")));
  }

  const puede3D = () => !movimientoReducido.matches && soportaWebGL() && !ahorroDeDatos();

  /* ---------- Carga del modelo (una sola descarga por página) ---------- */

  function descargarModelo() {
    if (descarga) return descarga.promesa;
    const controlador = new AbortController();
    const actual = { recibido: 0, total: 0, terminada: false, controlador, promesa: null };
    actual.promesa = (async () => {
      const respuesta = await fetch(AJUSTES.modelo, { signal: controlador.signal });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status} al cargar el modelo`);
      const comprimido = respuesta.headers.get("content-encoding");
      actual.total = comprimido ? 0 : Number(respuesta.headers.get("content-length")) || 0;
      if (!respuesta.body || !actual.total) {
        const buffer = await respuesta.arrayBuffer();
        actual.recibido = buffer.byteLength;
        actual.terminada = true;
        return buffer;
      }
      // Lectura por partes para mostrar un porcentaje real.
      const lector = respuesta.body.getReader();
      let datos = new Uint8Array(actual.total);
      let posicion = 0;
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        if (posicion + value.length > datos.length) {
          const mayor = new Uint8Array(Math.max(datos.length * 2, posicion + value.length));
          mayor.set(datos);
          datos = mayor;
        }
        datos.set(value, posicion);
        posicion += value.length;
        actual.recibido = posicion;
      }
      actual.terminada = true;
      return posicion === datos.length ? datos.buffer : datos.buffer.slice(0, posicion);
    })();
    // Si falla, se olvida para poder reintentar en otra reproducción.
    actual.promesa.catch(() => { if (descarga === actual) descarga = null; });
    descarga = actual;
    return actual.promesa;
  }

  function cargarModuloEscena() {
    if (!moduloEscena) {
      moduloEscena = import("./catalog-intro-escena.js");
      moduloEscena.catch(() => { moduloEscena = null; });
    }
    return moduloEscena;
  }

  async function prepararEscena3D(turno) {
    const [buffer, modulo] = await Promise.all([descargarModelo(), cargarModuloEscena()]);
    if (turno !== estado.turno || !estado.activa) return;
    const preparado = await modulo.prepararModelo(buffer, { tamanoTextura: esCompacto() ? 1024 : 2048 });
    if (turno !== estado.turno || !estado.activa) return;
    const escena = modulo.crearEscena({ contenedor: lienzo, preparado, compacto: esCompacto() });
    escena.precalentar();
    if (turno !== estado.turno || !estado.activa) { escena.destruir(); return; }
    estado.escena = escena;
  }

  /* ---------- Reproducción ---------- */

  function reproducir(origen = "manual") {
    if (estado.activa) return;
    estado.activa = true;
    estado.turno += 1;
    estado.reproducciones += 1;
    estado.ultimoOrigen = origen;
    estado.ultimoFinal = null;
    estado.t = 0;
    estado.pausado = false;
    estado.ultimo = null;
    estado.saliendo = false;
    estado.modo = puede3D() ? "3d" : "estatico";
    estado.secuencia = estado.modo === "3d" ? SECUENCIA_3D : SECUENCIA_ESTATICA;
    capa.dataset.modo = estado.modo;
    delete capa.dataset.fase;
    pasos.forEach((nodo) => nodo.removeAttribute("data-visible"));
    carga.hidden = true;
    fondo.style.setProperty("--intro-luz", estado.modo === "3d" ? "0" : "1");
    if (estado.modo === "estatico") prepararPoster();

    // Al cerrar, el dialog devuelve el foco al elemento previo; sin foco previo,
    // no hay nada que desplace la página fuera de la portada.
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
    if (!capa.open) capa.showModal();
    raiz.classList.add("intro-activa");
    raiz.classList.remove("intro-pendiente");
    capa.querySelector("[data-intro-saltar]")?.focus({ preventScroll: true });

    if (estado.modo === "3d") {
      const turno = estado.turno;
      prepararEscena3D(turno).catch((error) => {
        if (turno !== estado.turno) return; // se saltó o terminó: la cancelación no es un fallo
        console.warn("Presentación 3D no disponible; se muestra la versión estática.", error);
        pasarAEstatico();
      });
      window.setTimeout(() => {
        if (turno === estado.turno && estado.activa && !estado.escena && estado.modo === "3d") {
          descarga?.controlador.abort();
          pasarAEstatico();
        }
      }, AJUSTES.esperaMaximaModelo);
    }
    estado.cuadro = requestAnimationFrame(cuadro);
  }

  function pasarAEstatico() {
    if (!estado.activa || estado.modo === "estatico") return;
    estado.modo = "estatico";
    estado.secuencia = SECUENCIA_ESTATICA;
    capa.dataset.modo = "estatico";
    estado.t = Math.min(estado.t, SECUENCIA_ESTATICA.pasos[1].desde);
    carga.hidden = true;
    fondo.style.setProperty("--intro-luz", "1");
    prepararPoster();
  }

  // La imagen de respaldo solo se crea cuando hace falta la versión estática.
  function prepararPoster() {
    const fuente = esCompacto() ? AJUSTES.posterCompacto : AJUSTES.posterAmplio;
    let imagen = poster.querySelector("img");
    if (imagen?.getAttribute("src") === fuente) return;
    if (!imagen) {
      imagen = new Image();
      imagen.alt = "";
      imagen.decoding = "async";
      imagen.addEventListener("error", () => { imagen.hidden = true; });
      poster.append(imagen);
    }
    imagen.src = fuente;
  }

  function cuadro(ahora) {
    if (!estado.activa) return;
    const dt = estado.ultimo === null ? 0 : Math.min(0.05, (ahora - estado.ultimo) / 1000);
    estado.ultimo = ahora;
    if (!estado.pausado) estado.t += dt * estado.velocidad;

    // Si el modelo aún no está listo, la apertura espera con el indicador real de carga.
    if (estado.modo === "3d" && !estado.escena && estado.t >= AJUSTES.puntoDeEspera) {
      estado.t = AJUSTES.puntoDeEspera;
      mostrarCarga();
    } else if (!carga.hidden) {
      carga.hidden = true;
    }

    for (const paso of estado.secuencia.pasos) {
      const nodo = pasos.get(paso.id);
      const visible = estado.t >= paso.desde && estado.t < paso.hasta;
      if (nodo && visible !== nodo.hasAttribute("data-visible")) nodo.toggleAttribute("data-visible", visible);
    }

    if (estado.escena) {
      const luz = estado.escena.actualizar(estado.t);
      fondo.style.setProperty("--intro-luz", luz.toFixed(3));
    }
    if (estado.t >= estado.secuencia.salida && !estado.saliendo) salir();
    estado.cuadro = requestAnimationFrame(cuadro);
  }

  function mostrarCarga() {
    carga.hidden = false;
    const total = descarga?.total || 0;
    const medible = total > 0 && descarga && !descarga.terminada;
    carga.classList.toggle("indeterminada", !medible);
    if (medible) {
      const porcentaje = Math.min(99, Math.floor((descarga.recibido / total) * 100));
      cargaBarra.style.setProperty("--progreso", (porcentaje / 100).toFixed(3));
      cargaTexto.textContent = `Cargando el modelo 3D · ${porcentaje} %`;
    } else {
      cargaTexto.textContent = descarga?.terminada ? "Preparando el modelo 3D" : "Cargando el modelo 3D";
    }
  }

  /* ---------- Salida: siempre a la portada ---------- */

  // Final natural: el telón claro (el tono de la portada) sube y deja la tienda arriba.
  function salir() {
    estado.saliendo = true;
    capa.dataset.fase = "salida";
    const telon = $("[data-intro-telon]");
    let hecho = false;
    const terminar = () => { if (!hecho) { hecho = true; finalizar(); } };
    telon.addEventListener("transitionend", terminar, { once: true });
    window.setTimeout(terminar, 1100);
  }

  // Saltar: la portada aparece de inmediato (la capa solo se desvanece un instante).
  function saltar() {
    if (!estado.activa) return;
    estado.turno += 1; // invalida la preparación en curso antes de cancelar la descarga
    if (descarga && !descarga.terminada) descarga.controlador.abort();
    llevarAPortada();
    capa.dataset.fase = "saltando";
    window.setTimeout(() => finalizar({ saltada: true }), 180);
  }

  // Inicio de la página, sin ancla en la dirección ni entradas nuevas en el historial.
  function llevarAPortada() {
    raiz.classList.remove("intro-activa");
    if (window.location.hash) history.replaceState(history.state, "", window.location.pathname + window.location.search);
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }

  function finalizar({ saltada = false } = {}) {
    if (!estado.activa) return;
    estado.activa = false;
    estado.turno += 1;
    estado.ultimoFinal = saltada ? "saltada" : "completa";
    cancelAnimationFrame(estado.cuadro);
    llevarAPortada();
    if (capa.open) capa.close();
    delete capa.dataset.fase;
    estado.escena?.destruir();
    estado.escena = null;
    poster.removeAttribute("data-visible");
    carga.hidden = true;
    // El cierre del dialog podría haber movido la vista al devolver el foco: se fija arriba.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
    if (!saltada) {
      portada.classList.add("portada-entrada");
      window.setTimeout(() => portada.classList.remove("portada-entrada"), 1200);
    }
    if (botonRepetir) botonRepetir.hidden = false;
    document.dispatchEvent(new CustomEvent("bienvenida:fin", { detail: { saltada, modo: estado.modo } }));
  }

  /* ---------- Controles ---------- */

  capa.querySelector("[data-intro-saltar]")?.addEventListener("click", saltar);
  capa.addEventListener("cancel", (evento) => { evento.preventDefault(); saltar(); });
  // Si el navegador cierra la capa por su cuenta (Esc repetido), se termina limpiamente.
  capa.addEventListener("close", () => { if (estado.activa) finalizar({ saltada: true }); });

  // «Ver presentación»: reproducción manual; no cambia nada de las próximas visitas.
  botonRepetir?.addEventListener("click", () => { if (!estado.activa) reproducir("manual"); });

  const alCambiarTamano = () => {
    if (!estado.activa) return;
    estado.escena?.redimensionar(esCompacto());
    if (estado.modo === "estatico") prepararPoster();
  };
  window.addEventListener("resize", alCambiarTamano, { passive: true });
  consultaCompacta.addEventListener("change", alCambiarTamano);

  /* ---------- Diagnóstico (solo lectura, sin almacenamiento) ---------- */
  // window.GamaTallaBienvenida.diagnostico() permite comprobar que cada carga inicia
  // una presentación nueva sin tocar el carrito ni otras preferencias.
  const navegacion = performance.getEntriesByType?.("navigation")?.[0];
  window.GamaTallaBienvenida = Object.freeze({
    diagnostico: () => ({
      carga: Math.round(performance.timeOrigin),
      tipoDeCarga: navegacion?.type || "desconocido",
      reproduccionesEnEstaCarga: estado.reproducciones,
      ultimoOrigen: estado.ultimoOrigen,
      ultimoFinal: estado.ultimoFinal,
      activa: estado.activa,
      modo: estado.modo,
      almacenamientoPersistente: false
    })
  });

  /* ---------- Arranque: en cada carga del documento ---------- */
  reproducir("automatica");

  /* ---------- Controles de prueba (solo con ?intro-depurar) ---------- */
  if (parametros.has("intro-depurar")) {
    window.__introDepuracion = {
      reproducir: () => reproducir("manual"),
      saltar,
      fijarTiempo(t) { estado.t = t; estado.pausado = true; },
      reanudar() { estado.pausado = false; },
      velocidad(v) { estado.velocidad = v; },
      estado: () => ({ activa: estado.activa, modo: estado.modo, t: estado.t, escena: Boolean(estado.escena), cargaVisible: !carga.hidden, descarga: descarga ? { recibido: descarga.recibido, total: descarga.total, terminada: descarga.terminada } : null }),
      exportarLienzo: () => estado.escena?.exportar() || null
    };
  }
}
