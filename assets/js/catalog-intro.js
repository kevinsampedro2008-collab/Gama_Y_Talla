/* =========================================================
   GAMA & TALLA — Presentación cinematográfica de bienvenida
   Controlador. Se reproduce automáticamente en cada carga del documento
   (nunca durante la navegación interna) y termina en la portada (#inicio).
   Gestiona la capa, los textos, la línea de tiempo, el salto, la elección
   del nivel de calidad según el dispositivo, la adaptación en ejecución y la
   versión estática de respaldo. La escena 3D vive en catalog-intro-escena.js.

   No guarda nada de forma persistente: el estado vive en memoria y una
   nueva carga del documento inicia una nueva presentación.
   Emite «bienvenida:fin» al terminar.
   ========================================================= */

const AJUSTES = {
  posterAmplio: "assets/images/intro/poster-amplio.webp",
  posterCompacto: "assets/images/intro/poster-compacto.webp",
  esperaMaximaModelo: 12000, // ms antes de pasar a la versión estática
  puntoDeEspera: 2.2, // segundo en el que la secuencia espera al modelo si aún no está listo
  // Rendimiento real: se mide en ventanas de ~1 s, después de un calentamiento (compilación de
  // sombreadores y subida de texturas). Umbral por debajo de 30: los modos de ahorro de energía
  // limitan a 30 cuadros sin que haya problema. Por debajo de «fpsCritico» se pasa directo a estático.
  rendimiento: { ventana: 1000, calentamiento: 800, pausaTrasAjuste: 400, fpsAceptable: 27, fpsMinimo: 18, fpsCritico: 9 }
};

// Copias optimizadas del modelo (el original, af1-model.glb, se conserva intacto como fuente).
// Mismo guion en todos los niveles: cambian geometría, texturas, resolución y efectos.
const RUTA_MODELOS = "assets/images/models/";
const NIVELES = {
  alto: {
    modelo: RUTA_MODELOS + "optimized/af1-model-high.glb",
    textura: { amplio: 2048, compacto: 2048 },
    pixeles: { amplio: 1.75, compacto: 1.5 },
    pisoPixeles: 1,
    antialias: true,
    precision: "highp",
    sombra: true
  },
  medio: {
    modelo: RUTA_MODELOS + "optimized/af1-model-medium.glb",
    textura: { amplio: 1024, compacto: 1024 },
    pixeles: { amplio: 1.25, compacto: 1.25 },
    pisoPixeles: 0.85,
    antialias: true,
    precision: "highp",
    sombra: true
  },
  bajo: {
    modelo: RUTA_MODELOS + "optimized/af1-model-low.glb",
    textura: { amplio: 1024, compacto: 1024 },
    pixeles: { amplio: 1, compacto: 1 },
    pisoPixeles: 0.75,
    antialias: true,
    precision: "mediump",
    sombra: false
  },
  // Solo para comparar en depuración (?intro-depurar&intro-nivel=original).
  original: {
    modelo: RUTA_MODELOS + "af1-model.glb",
    textura: { amplio: 2048, compacto: 1024 },
    pixeles: { amplio: 1.75, compacto: 1.5 },
    pisoPixeles: 1,
    antialias: true,
    precision: "highp",
    sombra: true
  }
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
const depurar = parametros.has("intro-depurar");
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
    nivel: null, // "alto" | "medio" | "bajo" | "estatico"
    motivo: "",
    limitado: false, // el rendimiento real no alcanzó: el resto de la visita usa la versión estática
    adaptaciones: [],
    fps: null,
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
  let grafica = null;
  const monitor = { cuadros: 0, tiempo: 0, ignorar: 0, desde: 0 };

  /* ---------- Decisiones: nivel de calidad según el dispositivo ---------- */

  const esCompacto = () => consultaCompacta.matches;

  // Capacidades gráficas reales. failIfMajorPerformanceCaveat descarta el WebGL por software
  // (GPU bloqueada o ausente), que no puede mover la escena con estabilidad.
  function sondearGrafica() {
    if (grafica) return grafica;
    const crear = (tipo, opciones) => {
      try { return document.createElement("canvas").getContext(tipo, opciones); } catch { return null; }
    };
    const soltar = (contexto) => contexto?.getExtension("WEBGL_lose_context")?.loseContext();
    let contexto = crear("webgl2", { failIfMajorPerformanceCaveat: true });
    const webgl2 = Boolean(contexto);
    if (!contexto) contexto = crear("webgl", { failIfMajorPerformanceCaveat: true });
    if (!contexto) {
      const lento = crear("webgl2") || crear("webgl");
      soltar(lento);
      grafica = { webgl: Boolean(lento), software: Boolean(lento), webgl2: false, maxTextura: 0 };
      return grafica;
    }
    const maxTextura = contexto.getParameter(contexto.MAX_TEXTURE_SIZE) || 0;
    // Segunda señal: el nombre del motor gráfico (algunos navegadores no aplican la advertencia
    // anterior cuando se fuerza el renderizado por software).
    let motor = "";
    try {
      const info = contexto.getExtension("WEBGL_debug_renderer_info");
      motor = String(contexto.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : contexto.RENDERER) || "");
    } catch { /* sin información del motor */ }
    soltar(contexto);
    const software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(motor);
    grafica = { webgl: true, software, webgl2, maxTextura, motor: motor.slice(0, 80) };
    return grafica;
  }

  // Elección conservadora. No depende del user-agent: usa WebGL, límites de textura, memoria y
  // núcleos (solo cuando el navegador los informa), tamaño de pantalla y conexión. Después,
  // el rendimiento real de los primeros cuadros puede bajar la calidad (nunca subirla).
  function decidirNivel() {
    // Si en esta visita el dispositivo ya no sostuvo la escena, no se vuelve a intentar.
    if (estado.limitado) return { nivel: "estatico", motivo: "rendimiento insuficiente en esta visita" };
    const forzado = depurar ? parametros.get("intro-nivel") : null;
    if (forzado && (forzado in NIVELES || forzado === "estatico")) return { nivel: forzado, motivo: "forzado en depuración" };
    if (movimientoReducido.matches) return { nivel: "estatico", motivo: "movimiento reducido" };
    const g = sondearGrafica();
    if (!g.webgl) return { nivel: "estatico", motivo: "sin WebGL" };
    if (g.software) return { nivel: "estatico", motivo: "WebGL sin aceleración por hardware" };
    const conexion = navigator.connection;
    if (conexion?.saveData) return { nivel: "estatico", motivo: "ahorro de datos" };
    if (/(^|-)2g$/.test(conexion?.effectiveType || "")) return { nivel: "estatico", motivo: "conexión 2G" };

    // deviceMemory solo existe en navegadores Chromium; Safari limita hardwareConcurrency,
    // así que los núcleos solo cuentan cuando también se conoce la memoria.
    const memoria = navigator.deviceMemory;
    const nucleos = navigator.hardwareConcurrency || 0;
    let nivel;
    let motivo;
    if (!g.webgl2 || g.maxTextura < 4096) {
      nivel = "bajo"; motivo = "WebGL limitado";
    } else if (memoria !== undefined && (memoria <= 2 || (nucleos > 0 && nucleos <= 4))) {
      nivel = "bajo"; motivo = "memoria o procesador modestos";
    } else if (esCompacto()) {
      const potente = memoria !== undefined && memoria >= 8 && nucleos >= 8;
      nivel = potente ? "alto" : "medio"; motivo = potente ? "celular potente" : "celular";
    } else if (memoria !== undefined && memoria < 4) {
      nivel = "medio"; motivo = "computador con poca memoria";
    } else {
      nivel = "alto"; motivo = "computador";
    }
    // Una conexión lenta recibe un archivo más ligero.
    const bajada = conexion?.downlink || 0;
    if (conexion?.effectiveType === "3g" || (bajada > 0 && bajada < 1.5)) {
      nivel = "bajo"; motivo += " · conexión lenta";
    } else if (nivel === "alto" && bajada > 0 && bajada < 5) {
      nivel = "medio"; motivo += " · conexión moderada";
    }
    return { nivel, motivo };
  }

  function rutaModelo(perfil) {
    // Depuración: comparar otra copia servida desde este equipo (?intro-modelo=http://127.0.0.1:…).
    const otro = depurar ? parametros.get("intro-modelo") : null;
    if (otro) {
      try {
        const url = new URL(otro, window.location.href);
        if (["127.0.0.1", "localhost"].includes(url.hostname)) return url.href;
      } catch { /* dirección no válida: se usa la del nivel */ }
    }
    return perfil.modelo;
  }

  /* ---------- Carga del modelo (una sola descarga por página y archivo) ---------- */

  function descargarModelo(url) {
    if (descarga?.url === url) return descarga.promesa;
    const controlador = new AbortController();
    const actual = { url, recibido: 0, total: 0, terminada: false, inicio: performance.now(), controlador, promesa: null };
    actual.promesa = (async () => {
      const respuesta = await fetch(url, { signal: controlador.signal });
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
    const perfil = NIVELES[estado.nivel];
    const [buffer, modulo] = await Promise.all([descargarModelo(rutaModelo(perfil)), cargarModuloEscena()]);
    if (turno !== estado.turno || !estado.activa) return;
    const formato = esCompacto() ? "compacto" : "amplio";
    const tamanoTextura = Math.min(perfil.textura[formato], grafica?.maxTextura || 4096);
    const preparado = await modulo.prepararModelo(buffer, { tamanoTextura });
    if (turno !== estado.turno || !estado.activa) return;
    const escena = modulo.crearEscena({
      contenedor: lienzo,
      preparado,
      compacto: esCompacto(),
      calidad: {
        pixeles: perfil.pixeles[formato],
        pisoPixeles: perfil.pisoPixeles,
        antialias: perfil.antialias,
        precision: perfil.precision,
        sombra: perfil.sombra
      }
    });
    escena.precalentar();
    if (turno !== estado.turno || !estado.activa) { escena.destruir(); return; }
    estado.escena = escena;
    reiniciarMonitor(AJUSTES.rendimiento.calentamiento, 3);
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
    estado.adaptaciones = [];
    estado.fps = null;
    const decision = decidirNivel();
    estado.nivel = decision.nivel;
    estado.motivo = decision.motivo;
    estado.modo = decision.nivel === "estatico" ? "estatico" : "3d";
    estado.secuencia = estado.modo === "3d" ? SECUENCIA_3D : SECUENCIA_ESTATICA;
    capa.dataset.modo = estado.modo;
    capa.dataset.nivel = estado.nivel;
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
    // El foco queda en la capa (que anuncia título y cómo saltarla), no en el botón:
    // así «Saltar presentación» no muestra el anillo de foco hasta que se navega con teclado.
    capa.focus({ preventScroll: true });

    if (estado.modo === "3d") {
      const turno = estado.turno;
      prepararEscena3D(turno).catch((error) => {
        if (turno !== estado.turno) return; // se saltó, terminó o cambió a estático: no es un fallo
        console.warn("Presentación 3D no disponible; se muestra la versión estática.", error);
        pasarAEstatico("el modelo no se pudo cargar");
      });
      window.setTimeout(() => {
        if (turno === estado.turno && estado.activa && !estado.escena && estado.modo === "3d") pasarAEstatico("el modelo tardó demasiado");
      }, AJUSTES.esperaMaximaModelo);
    }
    estado.cuadro = requestAnimationFrame(cuadro);
  }

  // Cambio a la versión estática: rápido y sin pantalla de error. Si la escena ya estaba en
  // marcha, el lienzo se funde antes de liberar la memoria gráfica.
  function pasarAEstatico(motivo) {
    if (!estado.activa || estado.modo === "estatico") return;
    estado.turno += 1; // invalida la preparación 3D en curso
    if (descarga && !descarga.terminada) descarga.controlador.abort();
    estado.modo = "estatico";
    estado.nivel = "estatico";
    if (motivo) estado.motivo = motivo;
    estado.secuencia = SECUENCIA_ESTATICA;
    capa.dataset.modo = "estatico";
    capa.dataset.nivel = "estatico";
    // Si la apertura ya pasó, no se repite: se continúa con el póster y el cierre.
    const apertura = SECUENCIA_3D.pasos[0];
    estado.t = estado.t > apertura.hasta ? SECUENCIA_ESTATICA.pasos[0].hasta : Math.min(estado.t, SECUENCIA_ESTATICA.pasos[1].desde);
    carga.hidden = true;
    fondo.style.setProperty("--intro-luz", "1");
    prepararPoster();
    retirarEscena();
  }

  function retirarEscena() {
    const escena = estado.escena;
    if (!escena) return;
    estado.escena = null;
    lienzo.classList.add("retirando");
    window.setTimeout(() => {
      escena.destruir();
      lienzo.classList.remove("retirando");
    }, 420);
  }

  // Rendimiento real: si el dispositivo no sostiene la animación, se baja la resolución,
  // después se quita la sombra de contacto y, como último recurso, se pasa a la versión
  // estática. Solo hacia abajo y un paso por ventana: no hay saltos entre niveles ni reinicios.
  function reiniciarMonitor(pausa, cuadros = 0) {
    monitor.cuadros = 0;
    monitor.tiempo = 0;
    monitor.ignorar = cuadros;
    // Mismo reloj que los cuadros (marca de tiempo de requestAnimationFrame).
    monitor.desde = (estado.ultimo ?? performance.now()) + pausa;
  }

  function medirRendimiento(intervalo, ahora) {
    if (!estado.escena || estado.modo !== "3d" || estado.pausado || document.hidden || intervalo <= 0) return;
    if (depurar && parametros.get("intro-adaptar") === "no") return;
    if (monitor.ignorar > 0) { monitor.ignorar -= 1; return; }
    if (ahora < monitor.desde) return;
    const r = AJUSTES.rendimiento;
    monitor.cuadros += 1;
    monitor.tiempo += Math.min(intervalo, 5000);
    if (monitor.tiempo < r.ventana) return;
    const fps = (monitor.cuadros * 1000) / monitor.tiempo;
    monitor.cuadros = 0;
    monitor.tiempo = 0;
    estado.fps = Math.round(fps * 10) / 10;
    if (fps >= r.fpsAceptable) return;
    const registro = { t: Number(estado.t.toFixed(1)), fps: estado.fps };
    const paso = fps >= r.fpsCritico ? estado.escena.reducirCalidad() : null;
    if (paso) {
      estado.adaptaciones.push({ ...registro, ...paso });
      reiniciarMonitor(r.pausaTrasAjuste);
    } else if (fps < r.fpsMinimo) {
      estado.adaptaciones.push({ ...registro, paso: "estatico" });
      estado.limitado = true;
      pasarAEstatico("rendimiento insuficiente");
    }
  }

  // Si la descarga avanza tan despacio que no terminaría a tiempo, no se hace esperar al visitante.
  function descargaDemasiadoLenta() {
    if (!descarga || descarga.terminada || !descarga.total || descarga.recibido <= 0) return false;
    const transcurrido = performance.now() - descarga.inicio;
    return transcurrido > 2500 && (transcurrido * descarga.total) / descarga.recibido > AJUSTES.esperaMaximaModelo;
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
    const intervalo = estado.ultimo === null ? 0 : ahora - estado.ultimo;
    const dt = Math.min(0.05, intervalo / 1000);
    estado.ultimo = ahora;
    if (!estado.pausado) estado.t += dt * estado.velocidad;
    medirRendimiento(intervalo, ahora);

    // Si el modelo aún no está listo, la apertura espera con el indicador real de carga.
    if (estado.modo === "3d" && !estado.escena && estado.t >= AJUSTES.puntoDeEspera) {
      estado.t = AJUSTES.puntoDeEspera;
      mostrarCarga();
      if (descargaDemasiadoLenta()) pasarAEstatico("descarga lenta");
    } else if (!carga.hidden) {
      carga.hidden = true;
    }

    for (const paso of estado.secuencia.pasos) {
      const nodo = pasos.get(paso.id);
      const visible = estado.t >= paso.desde && estado.t < paso.hasta;
      if (nodo && visible !== nodo.hasAttribute("data-visible")) nodo.toggleAttribute("data-visible", visible);
    }

    if (estado.escena && estado.modo === "3d") {
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
    lienzo.classList.remove("retirando");
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

  // «Volver a ver la presentación» (portada): reproducción manual; no cambia las próximas visitas.
  botonRepetir?.addEventListener("click", () => { if (!estado.activa) reproducir("manual"); });

  const alCambiarTamano = () => {
    if (!estado.activa) return;
    estado.escena?.redimensionar(esCompacto());
    if (estado.modo === "estatico") prepararPoster();
  };
  window.addEventListener("resize", alCambiarTamano, { passive: true });
  // Al volver a la pestaña, el primer cuadro no cuenta el tiempo que estuvo oculta.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !estado.activa) return;
    estado.ultimo = null;
    reiniciarMonitor(AJUSTES.rendimiento.pausaTrasAjuste, 1);
  });
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
      nivel: estado.nivel,
      motivo: estado.motivo,
      modelo: descarga?.url?.split("/").pop() || null,
      escena: estado.escena?.info() || null,
      fps: estado.fps,
      adaptaciones: estado.adaptaciones.map((paso) => ({ ...paso })),
      senales: {
        grafica: grafica ? { ...grafica } : null,
        memoria: navigator.deviceMemory ?? null,
        nucleos: navigator.hardwareConcurrency ?? null,
        pixelRatio: window.devicePixelRatio || 1,
        conexion: navigator.connection
          ? { tipo: navigator.connection.effectiveType ?? null, bajada: navigator.connection.downlink ?? null, ahorro: Boolean(navigator.connection.saveData) }
          : null
      },
      almacenamientoPersistente: false
    })
  });

  /* ---------- Arranque: en cada carga del documento ---------- */
  reproducir("automatica");

  /* ---------- Controles de prueba (solo con ?intro-depurar) ---------- */
  if (depurar) {
    window.__introDepuracion = {
      reproducir: () => reproducir("manual"),
      saltar,
      fijarTiempo(t) { estado.t = t; estado.pausado = true; },
      reanudar() { estado.pausado = false; },
      velocidad(v) { estado.velocidad = v; },
      estado: () => ({ activa: estado.activa, modo: estado.modo, nivel: estado.nivel, t: estado.t, escena: Boolean(estado.escena), info: estado.escena?.info() || null, cargaVisible: !carga.hidden, descarga: descarga ? { url: descarga.url, recibido: descarga.recibido, total: descarga.total, terminada: descarga.terminada } : null }),
      exportarLienzo: () => {
        if (!estado.escena) return null;
        estado.escena.actualizar(estado.t); // la pose del tiempo fijado, aunque aún no haya llegado un cuadro
        return estado.escena.exportar();
      }
    };
  }
}
