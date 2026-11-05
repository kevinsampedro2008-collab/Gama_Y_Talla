/* =========================================================
   GAMA & TALLA — Presentación cinematográfica del catálogo
   Controlador. Decide cuándo se reproduce (una vez por carga de página),
   intercepta las entradas al catálogo, gestiona la capa, los textos, la
   línea de tiempo, el salto y la versión estática de respaldo.
   La escena 3D vive en catalog-intro-escena.js y solo se descarga cuando
   hace falta, junto con el modelo.

   Conexión con la tienda (app.js):
   - escucha «catalogo:entrar» (cancelable) para encargarse de la entrada;
   - emite «catalogo:presentacion-fin» al terminar.
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
  duracion: 16.75,
  salida: 16.0,
  pasos: [
    { id: "apertura", desde: 0.25, hasta: 2.35 },
    { id: "frase-1", desde: 5.2, hasta: 7.3 },
    { id: "frase-2", desde: 7.8, hasta: 9.3 },
    { id: "frase-3", desde: 9.8, hasta: 11.5 },
    { id: "frase-4", desde: 11.9, hasta: 13.3 },
    { id: "cierre", desde: 14.0, hasta: Infinity }
  ],
  capitulos: [[0, "01 — Apertura"], [2.6, "02 — Aparición"], [5.0, "03 — Perfil"], [7.6, "04 — Silueta"], [9.4, "05 — Tres cuartos"], [11.6, "06 — Frente"], [13.4, "07 — Cierre"]]
};

// Versión estática: movimiento reducido, sin WebGL, ahorro de datos o si el modelo falla.
const SECUENCIA_ESTATICA = {
  duracion: 4.6,
  salida: 4.0,
  pasos: [
    { id: "apertura", desde: 0.15, hasta: 1.45 },
    { id: "poster", desde: 1.1, hasta: Infinity },
    { id: "cierre", desde: 1.7, hasta: Infinity }
  ],
  capitulos: [[0, "01 — Apertura"], [1.1, "02 — Cierre"]]
};

const capa = document.getElementById("intro-catalogo");
const catalogo = document.getElementById("catalogo");
const parametros = new URLSearchParams(window.location.search);
const raiz = document.documentElement;

if (!capa || !catalogo || parametros.get("intro") === "no") {
  // Sin capa o desactivada (útil para pruebas): la tienda funciona como siempre.
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
  const capitulo = $("[data-intro-capitulo]");
  const progreso = $("[data-intro-progreso]");
  const pasos = new Map([...capa.querySelectorAll("[data-intro-paso]")].map((nodo) => [nodo.dataset.introPaso, nodo]));
  const botonRepetir = document.getElementById("repetir-presentacion");
  const consultaCompacta = window.matchMedia(CONSULTA_COMPACTA);
  const movimientoReducido = window.matchMedia("(prefers-reduced-motion: reduce)");

  const estado = {
    vista: false, // ya se reprodujo (o se saltó) en esta carga
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
    capitulo: -1,
    navegandoFuera: false
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

  // Precarga oportuna: solo si la versión 3D es posible y sin bloquear nada.
  function precargar() {
    if (estado.vista || !puede3D()) return;
    descargarModelo().catch(() => {});
    cargarModuloEscena().catch(() => {});
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

  function reproducir() {
    if (estado.activa) return;
    estado.activa = true;
    estado.vista = true;
    estado.turno += 1;
    estado.t = 0;
    estado.pausado = false;
    estado.ultimo = null;
    estado.saliendo = false;
    estado.capitulo = -1;
    estado.modo = puede3D() ? "3d" : "estatico";
    estado.secuencia = estado.modo === "3d" ? SECUENCIA_3D : SECUENCIA_ESTATICA;
    capa.dataset.modo = estado.modo;
    delete capa.dataset.fase;
    pasos.forEach((nodo) => nodo.removeAttribute("data-visible"));
    carga.hidden = true;
    fondo.style.setProperty("--intro-luz", estado.modo === "3d" ? "0" : "1");
    if (estado.modo === "estatico") prepararPoster();

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
    estado.capitulo = -1;
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

    // Si el modelo aún no está listo, la apertura espera con un indicador de carga.
    if (estado.modo === "3d" && !estado.escena && estado.t >= AJUSTES.puntoDeEspera) {
      estado.t = AJUSTES.puntoDeEspera;
      mostrarCarga();
    } else if (!carga.hidden) {
      carga.hidden = true;
    }

    const secuencia = estado.secuencia;
    for (const paso of secuencia.pasos) {
      const nodo = pasos.get(paso.id);
      const visible = estado.t >= paso.desde && estado.t < paso.hasta;
      if (nodo && visible !== nodo.hasAttribute("data-visible")) nodo.toggleAttribute("data-visible", visible);
    }
    let indice = 0;
    while (indice < secuencia.capitulos.length - 1 && estado.t >= secuencia.capitulos[indice + 1][0]) indice += 1;
    if (indice !== estado.capitulo) {
      estado.capitulo = indice;
      capitulo.textContent = secuencia.capitulos[indice][1];
    }
    progreso.style.transform = `scaleX(${Math.min(1, estado.t / secuencia.duracion).toFixed(4)})`;

    if (estado.escena) {
      const luz = estado.escena.actualizar(estado.t);
      fondo.style.setProperty("--intro-luz", luz.toFixed(3));
    }
    if (estado.t >= secuencia.salida && !estado.saliendo) salir();
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

  /* ---------- Salida ---------- */

  // Final natural: el telón claro sube y deja la tienda en el catálogo.
  function salir() {
    estado.saliendo = true;
    capa.dataset.fase = "salida";
    const telon = $("[data-intro-telon]");
    let hecho = false;
    const terminar = () => { if (!hecho) { hecho = true; finalizar(); } };
    telon.addEventListener("transitionend", terminar, { once: true });
    window.setTimeout(terminar, 1100);
  }

  // Saltar: el catálogo aparece de inmediato (la capa solo se desvanece un instante).
  function saltar() {
    if (!estado.activa) return;
    estado.turno += 1; // invalida la preparación en curso antes de cancelar la descarga
    if (descarga && !descarga.terminada) descarga.controlador.abort();
    llevarAlCatalogo();
    capa.dataset.fase = "saltando";
    window.setTimeout(() => finalizar({ saltada: true }), 180);
  }

  function llevarAlCatalogo() {
    raiz.classList.remove("intro-activa");
    catalogo.scrollIntoView({ block: "start", behavior: "instant" });
  }

  function finalizar({ saltada = false } = {}) {
    if (!estado.activa) return;
    estado.activa = false;
    estado.turno += 1;
    cancelAnimationFrame(estado.cuadro);
    llevarAlCatalogo();
    if (capa.open) capa.close();
    delete capa.dataset.fase;
    estado.escena?.destruir();
    estado.escena = null;
    poster.removeAttribute("data-visible");
    carga.hidden = true;
    document.getElementById("titulo-catalogo")?.focus({ preventScroll: true });
    if (!saltada) {
      catalogo.classList.add("catalogo-entrada");
      window.setTimeout(() => catalogo.classList.remove("catalogo-entrada"), 1200);
    }
    if (botonRepetir) botonRepetir.hidden = false;
    document.dispatchEvent(new CustomEvent("catalogo:presentacion-fin", { detail: { saltada, modo: estado.modo } }));
  }

  /* ---------- Entradas al catálogo ---------- */

  // Enlaces a #catalogo (menú, portada, pasos, pie, carrito).
  document.addEventListener("click", (evento) => {
    if (evento.defaultPrevented || evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
    const enlace = evento.target.closest?.("a[href^='#']");
    if (!enlace || capa.contains(enlace)) return;
    if (enlace.getAttribute("href") !== "#catalogo") {
      marcarNavegacionFuera();
      return;
    }
    // El enlace de accesibilidad «Saltar al catálogo» va directo, sin presentación.
    if (enlace.classList.contains("enlace-salto")) { estado.vista = true; mostrarRepetir(); return; }
    if (estado.activa) { evento.preventDefault(); return; }
    if (estado.vista) return;
    evento.preventDefault();
    reproducir();
  }, true);

  // Entradas programáticas desde la tienda (p. ej. el selector «Tu talla EU» de la portada).
  document.addEventListener("catalogo:entrar", (evento) => {
    if (estado.activa) { evento.preventDefault(); return; }
    if (estado.vista) return;
    evento.preventDefault();
    reproducir();
  });

  // Llegada por desplazamiento manual.
  let pendienteRevision = false;
  window.addEventListener("scroll", () => {
    if (estado.navegandoFuera) marcarNavegacionFuera();
    if (pendienteRevision) return;
    pendienteRevision = true;
    requestAnimationFrame(() => { pendienteRevision = false; revisarDesplazamiento(); });
  }, { passive: true });

  function revisarDesplazamiento() {
    if (estado.vista || estado.activa || estado.navegandoFuera) return;
    const caja = catalogo.getBoundingClientRect();
    const alto = window.innerHeight;
    if (caja.top < alto * 0.55 && caja.bottom > alto * 0.45) reproducir();
    else if (caja.top < alto * 1.25) precargar();
  }

  // Mientras un enlace lleva a otra sección (el desplazamiento pasa por el catálogo), no se activa.
  let temporizadorNavegacion = 0;
  function marcarNavegacionFuera() {
    estado.navegandoFuera = true;
    window.clearTimeout(temporizadorNavegacion);
    temporizadorNavegacion = window.setTimeout(() => { estado.navegandoFuera = false; }, 220);
  }

  // Intención de ir al catálogo: se adelanta la descarga.
  const intencion = (evento) => {
    if (evento.target.closest?.("a[href='#catalogo'], [data-origen='portada'], #selector-talla")) precargar();
  };
  document.addEventListener("pointerover", intencion, { passive: true });
  document.addEventListener("focusin", intencion);
  document.addEventListener("touchstart", intencion, { passive: true });

  /* ---------- Controles de la capa ---------- */

  capa.querySelector("[data-intro-saltar]")?.addEventListener("click", saltar);
  capa.addEventListener("cancel", (evento) => { evento.preventDefault(); saltar(); });
  // Si el navegador cierra la capa por su cuenta (Esc repetido), se termina limpiamente.
  capa.addEventListener("close", () => { if (estado.activa) finalizar({ saltada: true }); });

  function mostrarRepetir() { if (botonRepetir) botonRepetir.hidden = false; }
  botonRepetir?.addEventListener("click", () => { if (!estado.activa) reproducir(); });

  const alCambiarTamano = () => {
    if (!estado.activa) return;
    estado.escena?.redimensionar(esCompacto());
    if (estado.modo === "estatico") prepararPoster();
  };
  window.addEventListener("resize", alCambiarTamano, { passive: true });
  consultaCompacta.addEventListener("change", alCambiarTamano);

  /* ---------- Arranque ---------- */

  if (window.location.hash === "#catalogo") {
    // Entrada directa: la cubierta del <head> ya oculta la grilla; arranca de inmediato.
    reproducir();
  } else {
    raiz.classList.remove("intro-pendiente");
    revisarDesplazamiento();
    // En pantallas amplias, si el catálogo está cerca, se precarga cuando la página ya está quieta.
    const precargaTranquila = () => {
      if (esCompacto()) return;
      const caja = catalogo.getBoundingClientRect();
      if (caja.top >= window.innerHeight * 1.5) return;
      if (window.requestIdleCallback) window.requestIdleCallback(precargar, { timeout: 4000 });
      else window.setTimeout(precargar, 1500);
    };
    if (document.readyState === "complete") precargaTranquila();
    else window.addEventListener("load", precargaTranquila, { once: true });
  }

  /* ---------- Depuración (solo con ?intro-depurar) ---------- */
  if (parametros.has("intro-depurar")) {
    window.__introDepuracion = {
      reproducir,
      saltar,
      fijarTiempo(t) { estado.t = t; estado.pausado = true; },
      reanudar() { estado.pausado = false; },
      velocidad(v) { estado.velocidad = v; },
      estado: () => ({ vista: estado.vista, activa: estado.activa, modo: estado.modo, t: estado.t, escena: Boolean(estado.escena), cargaVisible: !carga.hidden, descarga: descarga ? { recibido: descarga.recibido, total: descarga.total, terminada: descarga.terminada } : null }),
      exportarLienzo: () => estado.escena?.exportar() || null
    };
  }
}
