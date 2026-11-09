/* Panel privado de Gama & Talla · etapa 15A: ingreso y tablero de consulta; 15B: disponibilidad;
 * 16: puente para el editor del catálogo (editor.js), que reutiliza la sesión y el acceso de aquí.
 *
 * Seguridad
 *  - El navegador solo usa la URL del proyecto, la clave PUBLICABLE y la sesión del usuario.
 *    La protección real la hacen el RLS y las funciones de Supabase; esta página solo decide
 *    qué mostrar.
 *  - Antes de mostrar o recargar datos se comprueba la sesión con Auth (getUser, que consulta
 *    al servidor) y el permiso con fn_es_administrador().
 *  - La sesión vive en una clave propia de localStorage (CLAVE_SESION). Nunca se usa
 *    localStorage.clear(): el carrito y la caché de la tienda no se tocan.
 *  - Todo el contenido se pinta con textContent: ningún dato llega a innerHTML.
 *  - Un contador de «generación» descarta respuestas que lleguen tarde, después de cerrar
 *    sesión o de perder el permiso, para no mostrar datos antiguos como vigentes.
 */
(() => {
  "use strict";

  const CLAVE_SESION = "gama-talla-panel-sesion";
  const REVISION_MINIMA_MS = 30000; // como mucho una comprobación de permiso por foco cada 30 s

  const $ = (selector) => document.querySelector(selector);
  const vistas = ["inicio", "ingreso", "configuracion", "denegado", "error", "tablero"];

  let cliente = null;
  let generacion = 0;          // cambia al entrar, salir o perder el acceso
  let enviando = false;        // evita envíos duplicados del formulario
  let ultimaRevision = 0;
  let catalogo = [];           // productos ya preparados para pintar
  let temporizadorBusqueda = 0;
  let cierreLocal = false;     // el propio panel está cerrando la sesión (no es un vencimiento)

  // -------------------------------------------------------------- configuración
  function leerConfiguracion() {
    const fuera = window.GAMA_TALLA_ADMIN_CONFIG;
    if (!fuera || typeof fuera !== "object") return null;
    const url = String(fuera.supabaseUrl || "").trim().replace(/\/+$/, "");
    const clave = String(fuera.clavePublicable || "").trim();
    let direccion;
    try { direccion = new URL(url); } catch { return null; }
    const local = ["127.0.0.1", "localhost"].includes(direccion.hostname);
    if (direccion.protocol !== "https:" && !(local && direccion.protocol === "http:")) return null;
    // Solo la clave publicable. Una secreta o un JWT nunca deben llegar al navegador.
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(clave)) {
      if (/^sb_secret_/i.test(clave) || /^eyJ/.test(clave)) {
        console.warn("Gama & Talla · panel: la clave configurada no es la publicable y se ha rechazado.");
      }
      return null;
    }
    return { url: direccion.origin, clave };
  }

  // ------------------------------------------------------------------- vistas
  function mostrar(nombre) {
    for (const vista of vistas) {
      const nodo = $(`#vista-${vista}`);
      if (nodo) nodo.hidden = vista !== nombre;
    }
    document.body.dataset.vista = nombre;
  }

  function mostrarIngreso(aviso = "") {
    limpiarTablero();
    mostrar("ingreso");
    const info = $("#aviso-ingreso");
    info.textContent = aviso;
    info.hidden = !aviso;
    ocultarErrorIngreso();
    $("#clave").value = "";
    $("#correo").focus();
  }

  function mostrarDenegado(usuario) {
    limpiarTablero();
    $("#denegado-correo").textContent = usuario?.email || "esta cuenta";
    mostrar("denegado");
    $("#denegado-titulo").focus();
  }

  function mostrarError(texto) {
    limpiarTablero();
    $("#error-texto").textContent = texto;
    mostrar("error");
    $("#error-titulo").focus();
  }

  // ------------------------------------------------------------ sesión y acceso
  // Clasifica un error de Auth o de PostgREST: «sin-sesion» (vencida o inválida) o «red».
  function clasificar(error) {
    if (!error) return "red";
    const estado = Number(error.status) || 0;
    const codigo = String(error.code || "");
    if (error.name === "AuthSessionMissingError") return "sin-sesion";
    if (estado === 401 || estado === 403 || /^PGRST30[0-3]$/.test(codigo) || ["bad_jwt", "session_not_found", "user_not_found", "refresh_token_not_found"].includes(codigo)) {
      return "sin-sesion";
    }
    return "red";
  }

  // Comprueba con el servidor la sesión y el permiso de administración.
  async function comprobarAcceso() {
    let usuario;
    try {
      const { data, error } = await cliente.auth.getUser();
      if (error) return { estado: clasificar(error) };
      usuario = data?.user;
    } catch {
      return { estado: "red" };
    }
    if (!usuario) return { estado: "sin-sesion" };
    try {
      const { data, error } = await cliente.rpc("fn_es_administrador");
      if (error) return { estado: clasificar(error), usuario };
      return { estado: data === true ? "admin" : "denegado", usuario };
    } catch {
      return { estado: "red", usuario };
    }
  }

  // Aplica el resultado de una comprobación. Devuelve true si se puede seguir mostrando datos.
  async function aplicarAcceso(acceso) {
    ultimaRevision = Date.now();
    if (acceso.estado === "admin") { usuarioActual = acceso.usuario || usuarioActual; return true; }
    generacion += 1; // cualquier respuesta pendiente queda descartada
    if (acceso.estado === "sin-sesion") {
      await borrarSesionLocal();
      mostrarIngreso("Tu sesión terminó. Vuelve a ingresar.");
    } else if (acceso.estado === "denegado") {
      mostrarDenegado(acceso.usuario);
    } else {
      mostrarError("No pudimos comprobar tu acceso. Revisa tu conexión a internet e inténtalo de nuevo.");
    }
    return false;
  }

  async function entrar() {
    const mia = ++generacion;
    limpiarTablero();
    mostrar("inicio");
    const acceso = await comprobarAcceso();
    if (mia !== generacion) return;
    if (!(await aplicarAcceso(acceso))) return;
    $("#barra-correo").textContent = acceso.usuario.email || "";
    mostrar("tablero");
    await cargarCatalogo();
  }

  // Quita SOLO las claves de la sesión del panel; nada más del almacenamiento del sitio.
  async function borrarSesionLocal() {
    cierreLocal = true;
    try { await cliente.auth.signOut({ scope: "local" }); } catch { /* sin red: se limpia abajo */ }
    finally { cierreLocal = false; }
    try {
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const clave = localStorage.key(i);
        if (clave && clave.startsWith(CLAVE_SESION)) localStorage.removeItem(clave);
      }
    } catch { /* almacenamiento no disponible */ }
  }

  async function salir() {
    generacion += 1;
    limpiarTablero();
    document.querySelectorAll('[data-accion="salir"]').forEach((b) => { b.disabled = true; });
    await borrarSesionLocal();
    document.querySelectorAll('[data-accion="salir"]').forEach((b) => { b.disabled = false; });
    mostrarIngreso("Cerraste la sesión en este dispositivo.");
  }

  // Al volver a la pestaña se revisa el permiso: si se retiró, los datos desaparecen.
  async function revisarAlVolver() {
    if (document.body.dataset.vista !== "tablero" || document.visibilityState !== "visible") return;
    if (Date.now() - ultimaRevision < REVISION_MINIMA_MS) return;
    const mia = generacion;
    const acceso = await comprobarAcceso();
    if (mia !== generacion) return;
    await aplicarAcceso(acceso);
  }

  // ------------------------------------------------------------------ ingreso
  function ocultarErrorIngreso() {
    const error = $("#error-ingreso");
    error.hidden = true;
    error.textContent = "";
    for (const id of ["correo", "clave"]) {
      $(`#${id}`).removeAttribute("aria-invalid");
      $(`#${id}`).removeAttribute("aria-describedby");
    }
  }

  function errorIngreso(texto, campo) {
    const error = $("#error-ingreso");
    error.textContent = texto;
    error.hidden = false;
    if (campo) {
      const nodo = $(`#${campo}`);
      nodo.setAttribute("aria-invalid", "true");
      nodo.setAttribute("aria-describedby", "error-ingreso");
      nodo.focus();
    }
  }

  // Mensajes comprensibles, sin detalles técnicos y sin distinguir si la cuenta existe.
  function mensajeDeIngreso(error) {
    const estado = Number(error?.status) || 0;
    const codigo = String(error?.code || "");
    if (estado === 429 || /rate_limit/.test(codigo)) return "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.";
    if (error?.name === "AuthRetryableFetchError" || estado === 0 || estado >= 500) return "No pudimos conectar. Revisa tu conexión a internet e inténtalo de nuevo.";
    return "El correo o la contraseña no son correctos.";
  }

  async function ingresar(evento) {
    evento.preventDefault();
    if (enviando) return;
    ocultarErrorIngreso();
    $("#aviso-ingreso").hidden = true;
    const correo = $("#correo").value.trim();
    const clave = $("#clave").value;
    if (!correo) return errorIngreso("Escribe tu correo.", "correo");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return errorIngreso("Revisa el correo: parece incompleto.", "correo");
    if (!clave) return errorIngreso("Escribe tu contraseña.", "clave");

    enviando = true;
    const boton = $("#boton-ingresar");
    boton.disabled = true;
    boton.setAttribute("aria-busy", "true");
    boton.querySelector(".boton-texto").textContent = "Ingresando…";
    try {
      let resultado;
      try {
        resultado = await cliente.auth.signInWithPassword({ email: correo, password: clave });
      } catch (e) {
        resultado = { error: e };
      }
      if (resultado.error || !resultado.data?.session) {
        errorIngreso(mensajeDeIngreso(resultado.error), resultado.error && (Number(resultado.error.status) || 0) === 400 ? "clave" : null);
        return;
      }
      $("#clave").value = "";
      await entrar();
    } finally {
      enviando = false;
      boton.disabled = false;
      boton.removeAttribute("aria-busy");
      boton.querySelector(".boton-texto").textContent = "Ingresar";
    }
  }

  function alternarClave() {
    const campo = $("#clave");
    const boton = $("#boton-ver-clave");
    const ver = campo.type === "password";
    campo.type = ver ? "text" : "password";
    boton.setAttribute("aria-pressed", String(ver));
    boton.textContent = ver ? "Ocultar" : "Mostrar";
    boton.setAttribute("aria-label", ver ? "Ocultar contraseña" : "Mostrar contraseña");
  }

  // ------------------------------------------------------------------ catálogo
  const pesos = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
  const normalizar = (texto) => String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const ESTADOS = {
    DISPONIBLE: { clase: "talla-disponible", texto: "disponible", nombre: "Disponible" },
    POR_REVISAR: { clase: "talla-revisar", texto: "por revisar", nombre: "Por revisar" },
    AGOTADO: { clase: "talla-agotada", texto: "agotada", nombre: "Agotada" },
    OCULTA: { clase: "talla-oculta", texto: "no visible en la tienda", nombre: "No visible en la tienda" }
  };
  const GUARDADOS = { CONFIRMADA: "Confirmada", AGOTADA: "Agotada", REVISAR: "Por revisar" };
  const ORIGENES = { publicacion: "publicación del proveedor", proveedor: "confirmación del proveedor", manual: "registro manual", migracion: "catálogo anterior" };
  // Las retiradas (etapa 16) solo aparecen en su propio filtro: siguen existiendo, con todo.
  const vigente = (p) => !p.retirado_en;
  const FILTROS = [
    { id: "todas", texto: "Todas", cumple: vigente },
    { id: "disponibles", texto: "Con tallas disponibles", cumple: (p) => vigente(p) && p.estados.has("DISPONIBLE") },
    { id: "revisar", texto: "Con tallas por revisar", cumple: (p) => vigente(p) && p.estados.has("POR_REVISAR") },
    { id: "agotadas", texto: "Con tallas agotadas", cumple: (p) => vigente(p) && p.estados.has("AGOTADO") },
    { id: "ocultos", texto: "Con elementos ocultos", cumple: (p) => vigente(p) && p.tieneOculto },
    { id: "retiradas", texto: "Retiradas", cumple: (p) => !vigente(p) }
  ];
  const PAGINA = 500;           // por debajo del máximo de filas de la API: se pide por páginas
  const COLUMNAS_TALLA = "id,variante_id,talla,estado,activa,vigencia_desde,vence_en,vigencia_horas,origen,publicado_en,confirmado_en,actualizado_en";
  // Colombia usa UTC−5 todo el año (sin horario de verano): la conversión no depende del computador.
  const ZONA = "America/Bogota";
  const DESFASE_COLOMBIA_MS = -5 * 3600e3;
  const formatoFecha = new Intl.DateTimeFormat("es-CO", { timeZone: ZONA, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const fecha = (iso) => (iso ? formatoFecha.format(new Date(iso)) : "—");

  let filtro = "todas";
  let vigenciaPredeterminada = 48;
  let seleccion = { varianteId: null, ids: new Set() };
  let ocupado = false;               // hay una acción en curso: todo lo demás queda bloqueado
  let verificacionPendiente = false; // un resultado quedó incierto: nada se repite hasta recargar
  let historialCursor = null;
  let accionAbierta = null;
  let usuarioActual = null;     // para mostrar «Tú» en el historial
  let configuracionPanel = null; // { url, clave } ya validadas: el editor sube fotos con ellas

  // Valor de una talla solo para ordenar en pantalla (misma gramática que la base).
  function valorTalla(talla) {
    const m = /^(\d{1,3})(?:[.,](\d{1,2})| (\d{1,2})\/(\d{1,2}))?$/.exec(String(talla));
    if (!m) return Number.POSITIVE_INFINITY;
    let valor = Number(m[1]);
    if (m[2]) valor += Number(`0.${m[2]}`);
    if (m[3] && Number(m[4]) > 0) valor += Number(m[3]) / Number(m[4]);
    return valor;
  }

  function limpiarTablero() {
    // El editor guarda en memoria lo que no se llegó a guardar (por ejemplo, si la sesión vence).
    window.GamaTallaEditor?.alPerderAcceso?.();
    catalogo = [];
    seleccion = { varianteId: null, ids: new Set() };
    accionAbierta = null;
    const dialogo = $("#dialogo-accion");
    if (dialogo?.open) dialogo.close();
    const lista = $("#lista-productos");
    if (lista) lista.replaceChildren();
    for (const id of ["tablero-resumen", "tablero-estado", "barra-correo", "historial-estado"]) {
      const n = $(`#${id}`);
      if (n) n.textContent = "";
    }
    for (const id of ["tablero-aviso", "resultado-accion", "historial-lista"]) {
      const n = $(`#${id}`);
      if (n) n.replaceChildren();
    }
    for (const id of ["tablero-aviso", "resultado-accion", "historial", "leyenda", "filtros", "barra-acciones"]) {
      const n = $(`#${id}`);
      if (n) n.hidden = true;
    }
    $("#boton-historial")?.setAttribute("aria-expanded", "false");
    // 17: lo que llegue tarde del historial se descarta, y al volver empieza en «Todos».
    historialPeticion += 1;
    historialCursor = null;
    historialFiltro = "todos";
    nombresAdmin = new Map();
    pintarFiltrosHistorial();
    $("#historial-mas")?.setAttribute("hidden", "");
    document.body.classList.remove("con-seleccion");
  }

  // Fotos: rutas del sitio («assets/...») o URLs http(s). Cualquier otra cosa se descarta.
  function urlFoto(ruta) {
    try {
      const url = new URL(String(ruta || ""), new URL("../", location.href));
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
    } catch { return null; }
  }

  // Lee todas las filas por páginas ordenadas: nunca se trunca en silencio en el límite de la API.
  async function leerPaginado(fabrica) {
    const filas = [];
    for (let desde = 0; ; desde += PAGINA) {
      let respuesta;
      try { respuesta = await fabrica().range(desde, desde + PAGINA - 1); } catch { return { error: { status: 0 } }; }
      if (respuesta.error) return { error: respuesta.error, status: respuesta.status };
      const datos = respuesta.data || [];
      filas.push(...datos);
      if (datos.length < PAGINA) return { data: filas };
    }
  }

  function preparar(productos, tallas, vista) {
    // Estado efectivo calculado por Supabase (catalogo_publico): solo existe para lo que la
    // tienda muestra. Lo que no está publicado se presenta como «no visible en la tienda».
    const efectivo = new Map();
    for (const p of vista || []) {
      for (const v of p.variantes || []) {
        for (const t of v.tallas || []) efectivo.set(`${v.codigoVariante}|${t.talla}`, t.estado);
      }
    }
    const tallasPorVariante = new Map();
    for (const t of tallas || []) {
      if (!tallasPorVariante.has(t.variante_id)) tallasPorVariante.set(t.variante_id, []);
      tallasPorVariante.get(t.variante_id).push(t);
    }
    return (productos || []).map((p) => {
      const variantes = [...(p.variantes || [])]
        .sort((a, b) => a.orden - b.orden || a.codigo_variante.localeCompare(b.codigo_variante))
        .map((v) => ({
          ...v,
          fotos: [...(v.fotos || [])].sort((a, b) => a.orden - b.orden),
          tallas: (tallasPorVariante.get(v.id) || [])
            .sort((a, b) => valorTalla(a.talla) - valorTalla(b.talla) || a.talla.localeCompare(b.talla))
            .map((t) => {
              const visible = p.activo && v.activa && t.activa;
              const estado = visible ? efectivo.get(`${v.codigo_variante}|${t.talla}`) : "OCULTA";
              return { ...t, efectivo: ESTADOS[estado] ? estado : "OCULTA" };
            })
        }));
      const todas = variantes.flatMap((v) => v.tallas);
      const busqueda = normalizar([p.codigo_interno, p.referencia_proveedor, p.marca, p.nombre,
        ...variantes.flatMap((v) => [v.codigo_variante, v.referencia_variante, v.color])].join(" "));
      return {
        ...p,
        variantes,
        busqueda,
        estados: new Set(todas.map((t) => t.efectivo).filter((e) => e !== "OCULTA")),
        tieneOculto: !p.activo || variantes.some((v) => !v.activa) || todas.some((t) => !t.activa)
      };
    });
  }

  async function cargarCatalogo({ conservarPosicion = false } = {}) {
    const mia = generacion;
    const posicion = window.scrollY;
    limpiarCatalogoVisible();
    const estado = $("#tablero-estado");
    estado.textContent = "Cargando catálogo…";
    $("#tablero").setAttribute("aria-busy", "true");
    $("#boton-actualizar").disabled = true;
    try {
      // El permiso se vuelve a comprobar en cada carga: si se retiró, no se pinta nada.
      const acceso = await comprobarAcceso();
      if (mia !== generacion) return;
      if (!(await aplicarAcceso(acceso))) return;

      const respuestas = await Promise.all([
        leerPaginado(() => cliente.from("productos")
          .select("id,codigo_interno,referencia_proveedor,nombre,marca,categoria,activo,orden,retirado_en," +
                  "variantes(id,codigo_variante,color,referencia_variante,precio,precio_anterior,activa,orden,fotos(ruta,orden,alt))")
          .order("orden").order("codigo_interno").order("id")),
        leerPaginado(() => cliente.rpc("fn_admin_tallas").select(COLUMNAS_TALLA).order("variante_id").order("id")),
        leerPaginado(() => cliente.from("catalogo_publico").select("codigoInterno,variantes").order("orden").order("codigoInterno")),
        cliente.from("configuracion").select("valor").eq("clave", "vigencia_horas_predeterminada").maybeSingle()
          .then((r) => r, () => ({ error: { status: 0 } }))
      ]);
      if (mia !== generacion) return;
      const fallo = respuestas.find((r) => r.error);
      if (fallo) {
        if (clasificar(fallo.error) === "sin-sesion") { await aplicarAcceso({ estado: "sin-sesion" }); return; }
        mostrarFalloCatalogo();
        return;
      }
      const horas = Number(respuestas[3].data?.valor);
      vigenciaPredeterminada = Number.isInteger(horas) && horas >= 1 && horas <= 60 ? horas : 48;
      catalogo = preparar(respuestas[0].data, respuestas[1].data, respuestas[2].data);
      verificacionPendiente = false; // los datos vuelven a venir del servidor
      pintarCatalogo();
      if (conservarPosicion) window.scrollTo(0, posicion);
    } finally {
      if (mia === generacion) {
        $("#tablero").removeAttribute("aria-busy");
        $("#boton-actualizar").disabled = ocupado;
      }
    }
  }

  function limpiarCatalogoVisible() {
    catalogo = [];
    seleccion = { varianteId: null, ids: new Set() };
    $("#lista-productos").replaceChildren();
    $("#tablero-resumen").textContent = "";
    $("#tablero-estado").textContent = "";
    const aviso = $("#tablero-aviso");
    aviso.hidden = true;
    aviso.replaceChildren();
    $("#leyenda").hidden = true;
    $("#filtros").hidden = true;
    actualizarBarraAcciones();
  }

  function avisoTablero({ titulo, texto, accion, rol = "status" }) {
    const aviso = $("#tablero-aviso");
    aviso.setAttribute("role", rol);
    aviso.replaceChildren(nodo("h2", "", titulo), nodo("p", "", texto));
    if (accion) {
      const boton = nodo("button", "boton boton-secundario", accion.texto);
      boton.type = "button";
      boton.addEventListener("click", accion.alPulsar);
      aviso.append(boton);
    }
    aviso.hidden = false;
  }

  function mostrarFalloCatalogo() {
    limpiarCatalogoVisible();
    avisoTablero({
      titulo: "No pudimos cargar el catálogo",
      texto: "Revisa tu conexión a internet. No mostramos datos anteriores para evitar confusiones.",
      accion: { texto: "Reintentar", alPulsar: () => cargarCatalogo() },
      rol: "alert"
    });
  }

  function resumen() {
    const variantes = catalogo.reduce((n, p) => n + p.variantes.length, 0);
    const conteo = { DISPONIBLE: 0, POR_REVISAR: 0, AGOTADO: 0 };
    for (const p of catalogo) for (const v of p.variantes) for (const t of v.tallas) if (t.efectivo in conteo) conteo[t.efectivo] += 1;
    const partes = [
      `${catalogo.length} ${catalogo.length === 1 ? "zapatilla" : "zapatillas"}`,
      `${variantes} ${variantes === 1 ? "color" : "colores"}`
    ];
    const tallas = [
      `${conteo.DISPONIBLE} ${conteo.DISPONIBLE === 1 ? "talla disponible" : "tallas disponibles"}`,
      `${conteo.POR_REVISAR} por revisar`,
      `${conteo.AGOTADO} ${conteo.AGOTADO === 1 ? "agotada" : "agotadas"}`
    ];
    return `${partes.join(" · ")}. En la tienda: ${tallas.join(", ")}.`;
  }

  // 16.3: el resumen del plegable «Filtros» (celular) dice qué filtro está elegido.
  function pintarEstadoFiltros() {
    const elegido = FILTROS.find((f) => f.id === filtro) || FILTROS[0];
    const estadoFiltros = $("#filtros-estado");
    if (estadoFiltros) estadoFiltros.textContent = `${elegido.texto} (${catalogo.filter(elegido.cumple).length})`;
  }

  function pintarFiltros() {
    const caja = $("#filtros");
    caja.replaceChildren(...FILTROS.map((f) => {
      const cuantos = catalogo.filter(f.cumple).length;
      const boton = nodo("button", "filtro", `${f.texto} (${cuantos})`);
      boton.type = "button";
      boton.dataset.filtro = f.id;
      boton.setAttribute("aria-pressed", String(filtro === f.id));
      boton.disabled = ocupado;
      return boton;
    }));
    caja.hidden = false;
    pintarEstadoFiltros();
  }

  function pintarCatalogo() {
    const lista = $("#lista-productos");
    const estado = $("#tablero-estado");
    const aviso = $("#tablero-aviso");
    aviso.hidden = true;
    aviso.replaceChildren();
    const buscador = $("#formulario-buscar");

    if (!catalogo.length) {
      lista.replaceChildren();
      $("#tablero-resumen").textContent = "";
      $("#leyenda").hidden = true;
      $("#filtros").hidden = true;
      buscador.hidden = true;
      estado.textContent = "";
      seleccion = { varianteId: null, ids: new Set() };
      actualizarBarraAcciones();
      window.GamaTallaEditor?.ofrecerBorrador?.();
      avisoTablero({
        titulo: "Todavía no hay zapatillas en el catálogo",
        texto: "Agrega la primera con sus colores, precios, tallas y fotos. Se guarda oculta hasta que decidas publicarla.",
        accion: { texto: "Agregar zapatilla", alPulsar: (e) => abrirEditor(null, e?.currentTarget || null) }
      });
      return;
    }

    buscador.hidden = false;
    $("#tablero-resumen").textContent = resumen();
    $("#leyenda").hidden = false;
    pintarFiltros();
    const consulta = normalizar($("#buscar").value);
    const criterio = FILTROS.find((f) => f.id === filtro) || FILTROS[0];
    const visibles = catalogo.filter((p) => (!consulta || p.busqueda.includes(consulta)) && criterio.cumple(p));

    // Una selección que ya no está a la vista se quita: nunca se actúa sobre lo que no se ve.
    let nota = "";
    if (seleccion.varianteId && !visibles.some((p) => p.variantes.some((v) => v.id === seleccion.varianteId))) {
      seleccion = { varianteId: null, ids: new Set() };
      nota = "Se quitó la selección porque ese color ya no está en la lista. ";
    }
    lista.replaceChildren(...visibles.map(tarjetaProducto));
    actualizarBarraAcciones();

    if (!visibles.length) {
      estado.textContent = nota.trim();
      const texto = $("#buscar").value.trim();
      avisoTablero(consulta
        ? {
            titulo: `Ninguna zapatilla coincide con «${texto}»`,
            texto: "Prueba con el código interno (GT-…), la referencia del proveedor, la marca o el nombre del modelo.",
            accion: { texto: "Limpiar búsqueda", alPulsar: () => { $("#buscar").value = ""; pintarCatalogo(); $("#buscar").focus(); } }
          }
        : {
            titulo: "Ninguna zapatilla tiene tallas en ese estado",
            texto: "Elige otro filtro para ver el resto del catálogo.",
            accion: { texto: "Ver todas", alPulsar: () => { filtro = "todas"; pintarCatalogo(); } }
          });
      return;
    }
    estado.textContent = (nota + (consulta || filtro !== "todas"
      ? `${visibles.length} de ${catalogo.length} ${catalogo.length === 1 ? "zapatilla" : "zapatillas"} a la vista.`
      : "")).trim();
    window.GamaTallaEditor?.ofrecerBorrador?.();
  }

  function nodo(etiqueta, clase, texto) {
    const n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto !== undefined && texto !== null) n.textContent = texto;
    return n;
  }

  function tarjetaProducto(p) {
    const li = nodo("li", "producto");
    const articulo = nodo("article", "producto-articulo");
    const idTitulo = `producto-${p.id}`;
    articulo.setAttribute("aria-labelledby", idTitulo);

    const portada = p.variantes.flatMap((v) => v.fotos.map((f) => ({ f, v })))[0];
    const marco = nodo("div", "producto-foto");
    const url = portada ? urlFoto(portada.f.ruta) : null;
    if (url) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = portada.f.alt || `${p.nombre}, color ${portada.v.color}`;
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("error", () => { marco.replaceChildren(nodo("span", "producto-sin-foto", "Foto no disponible")); }, { once: true });
      marco.append(img);
    } else {
      marco.append(nodo("span", "producto-sin-foto", "Sin foto"));
    }

    const cuerpo = nodo("div", "producto-cuerpo");
    const codigos = nodo("p", "producto-codigos");
    codigos.append(nodo("span", "codigo", p.codigo_interno));
    if (p.referencia_proveedor) codigos.append(nodo("span", "producto-ref", `Ref. ${p.referencia_proveedor}`));
    const titulo = nodo("h2", "producto-nombre", p.nombre);
    titulo.id = idTitulo;
    const meta = nodo("p", "producto-meta", [p.marca, p.categoria].filter(Boolean).join(" · "));
    const publicado = nodo("p", `producto-estado ${p.retirado_en ? "es-retirado" : p.activo ? "es-publicado" : "es-oculto"}`,
      p.retirado_en ? "Retirado del catálogo" : p.activo ? "Publicado en la tienda" : "Oculto en la tienda");
    const editar = nodo("button", "boton boton-secundario boton-compacto producto-editar", "Editar");
    editar.type = "button";
    editar.dataset.accion = "editar-producto";
    editar.dataset.productoId = p.id;
    editar.setAttribute("aria-label", `Editar ${p.nombre} (${p.codigo_interno})`);
    editar.disabled = ocupado;
    cuerpo.append(codigos, titulo, meta, publicado, editar);

    const variantes = nodo("ul", "variantes");
    variantes.setAttribute("aria-label", `Colores de ${p.nombre}`);
    if (!p.variantes.length) variantes.append(nodo("li", "variante-vacia", "Sin colores registrados."));
    for (const v of p.variantes) variantes.append(filaVariante(p, v));
    cuerpo.append(variantes);

    articulo.append(marco, cuerpo);
    li.append(articulo);
    return li;
  }

  function filaVariante(p, v) {
    const li = nodo("li", "variante");
    li.dataset.varianteId = v.id;
    const cabecera = nodo("div", "variante-cabecera");
    cabecera.append(nodo("span", "variante-color", v.color));
    cabecera.append(nodo("span", "codigo codigo-suave", v.codigo_variante));
    // Referencia que ve el cliente (16.1): la propia si se escribió; si no, es el mismo código.
    const referencia = String(v.referencia_variante || "").trim();
    // Etapa 16.2: el código del color es la referencia que ve el cliente; la del proveedor es aparte.
    if (referencia && referencia !== v.codigo_variante) cabecera.append(nodo("span", "variante-referencia", `Ref. proveedor: ${referencia}`));
    const precio = nodo("span", "variante-precio");
    if (v.precio > 0) {
      precio.append(nodo("span", "", pesos.format(v.precio)));
      if (v.precio_anterior > v.precio) {
        const antes = nodo("s", "variante-antes", pesos.format(v.precio_anterior));
        antes.setAttribute("aria-label", `antes ${pesos.format(v.precio_anterior)}`);
        precio.append(antes);
      }
    } else {
      precio.append(nodo("span", "variante-sin-precio", "Precio por confirmar"));
    }
    cabecera.append(precio);
    if (p.activo && !v.activa) cabecera.append(nodo("span", "variante-oculta", "Color oculto en la tienda"));
    li.append(cabecera);

    if (!v.tallas.length) {
      li.append(nodo("p", "variante-sin-tallas", "Sin tallas registradas."));
      return li;
    }
    const tallas = nodo("ul", "tallas");
    tallas.setAttribute("aria-label", `Tallas EU de ${p.nombre}, color ${v.color}. Pulsa una talla para seleccionarla`);
    for (const t of v.tallas) {
      const item = nodo("li");
      const boton = nodo("button", `talla ${ESTADOS[t.efectivo].clase}`, t.talla);
      boton.type = "button";
      boton.dataset.tallaId = t.id;
      boton.dataset.varianteId = v.id;
      boton.title = `Talla ${t.talla}: ${ESTADOS[t.efectivo].texto}`;
      boton.setAttribute("aria-pressed", String(seleccion.varianteId === v.id && seleccion.ids.has(t.id)));
      boton.disabled = ocupado || verificacionPendiente;
      boton.append(nodo("span", "solo-lectores", `, ${ESTADOS[t.efectivo].texto}`));
      item.append(boton);
      tallas.append(item);
    }
    li.append(tallas);
    if (seleccion.varianteId === v.id) li.append(detalleSeleccion(v));
    return li;
  }

  // ------------------------------------------------------------------ selección
  function buscarVariante(varianteId) {
    for (const p of catalogo) {
      const v = p.variantes.find((x) => x.id === varianteId);
      if (v) return { producto: p, variante: v };
    }
    return null;
  }

  function tallasSeleccionadas() {
    const encontrado = seleccion.varianteId && buscarVariante(seleccion.varianteId);
    if (!encontrado) return null;
    const tallas = encontrado.variante.tallas.filter((t) => seleccion.ids.has(t.id));
    return tallas.length ? { ...encontrado, tallas } : null;
  }

  // Lo que ayuda a decidir: estado en la tienda, estado guardado, vigencia y procedencia.
  function detalleSeleccion(v) {
    const lista = nodo("ul", "detalle-seleccion");
    lista.setAttribute("aria-label", `Detalle de las tallas seleccionadas de ${v.color}`);
    for (const t of v.tallas.filter((x) => seleccion.ids.has(x.id))) {
      const item = nodo("li", "detalle-talla");
      item.append(nodo("strong", "", `Talla ${t.talla}`));
      const datos = [
        `En la tienda: ${ESTADOS[t.efectivo].texto}`,
        `Guardada como: ${(GUARDADOS[t.estado] || t.estado).toLowerCase()}`
      ];
      if (t.vigencia_desde) datos.push(`Vigencia: ${fecha(t.vigencia_desde)} → ${fecha(t.vence_en)} (${t.vigencia_horas} h)`);
      if (t.origen) datos.push(`Procedencia: ${ORIGENES[t.origen] || t.origen}`);
      if (t.publicado_en) datos.push(`Publicación original: ${fecha(t.publicado_en)}`);
      if (!t.activa) datos.push("Talla desactivada");
      item.append(nodo("span", "", datos.join(" · ")));
      lista.append(item);
    }
    return lista;
  }

  function alternarTalla(boton) {
    if (ocupado || verificacionPendiente) return;
    const { tallaId, varianteId } = boton.dataset;
    if (seleccion.varianteId !== varianteId) {
      // La selección es siempre de un solo color: cambiar de color empieza una nueva.
      seleccion = { varianteId, ids: new Set([tallaId]) };
    } else if (seleccion.ids.has(tallaId)) {
      seleccion.ids.delete(tallaId);
      if (!seleccion.ids.size) seleccion = { varianteId: null, ids: new Set() };
    } else {
      seleccion.ids.add(tallaId);
    }
    refrescarSeleccionVisible();
  }

  // Actualiza la selección sin repintar la lista: el foco se queda en la talla pulsada.
  function refrescarSeleccionVisible() {
    document.querySelectorAll("#lista-productos .talla[data-talla-id]").forEach((b) => {
      b.setAttribute("aria-pressed", String(seleccion.varianteId === b.dataset.varianteId && seleccion.ids.has(b.dataset.tallaId)));
    });
    document.querySelectorAll("#lista-productos .detalle-seleccion").forEach((n) => n.remove());
    if (seleccion.varianteId) {
      const fila = document.querySelector(`#lista-productos .variante[data-variante-id="${CSS.escape(seleccion.varianteId)}"]`);
      const encontrado = buscarVariante(seleccion.varianteId);
      if (fila && encontrado) fila.append(detalleSeleccion(encontrado.variante));
    }
    actualizarBarraAcciones();
  }

  function quitarSeleccion() {
    seleccion = { varianteId: null, ids: new Set() };
    refrescarSeleccionVisible();
  }

  function actualizarBarraAcciones() {
    const barra = $("#barra-acciones");
    if (!barra) return;
    const elegidas = tallasSeleccionadas();
    if (!elegidas) {
      barra.hidden = true;
      document.body.classList.remove("con-seleccion");
      return;
    }
    const { producto, variante, tallas } = elegidas;
    $("#seleccion-resumen").textContent =
      `${tallas.length} ${tallas.length === 1 ? "talla seleccionada" : "tallas seleccionadas"} · ` +
      `${producto.nombre} · ${variante.color} (${variante.codigo_variante}): ${tallas.map((t) => t.talla).join(", ")}`;
    barra.querySelectorAll("button").forEach((b) => { b.disabled = ocupado || verificacionPendiente; });
    barra.hidden = false;
    document.body.classList.add("con-seleccion");
  }

  function marcarOcupado(si) {
    ocupado = si;
    document.querySelectorAll("#lista-productos .talla[data-talla-id], #lista-productos .producto-editar, #boton-nuevo, #filtros button, #barra-acciones button, #boton-actualizar, #boton-historial, #boton-exportar, [data-accion='salir'], #historial button")
      .forEach((b) => { b.disabled = si || (verificacionPendiente && b.matches(".talla, #barra-acciones button")); });
    $("#barra-acciones")?.setAttribute("aria-busy", String(si));
    document.querySelectorAll("#dialogo-accion button").forEach((b) => { b.disabled = si; });
  }

  // ------------------------------------------------------------------- acciones
  const ACCIONES = {
    proveedor: {
      titulo: "Confirmación directa del proveedor",
      boton: "Confirmar disponibilidad",
      hecho: "confirmada por el proveedor",
      hechas: "confirmadas por el proveedor",
      funcion: "fn_confirmar_por_proveedor",
      estadoEsperado: "CONFIRMADA"
    },
    publicacion: {
      titulo: "Nueva publicación del proveedor",
      boton: "Registrar publicación",
      hecho: "confirmada por publicación",
      hechas: "confirmadas por publicación",
      funcion: "fn_confirmar_por_publicacion",
      estadoEsperado: "CONFIRMADA"
    },
    agotada: {
      titulo: "Marcar como agotada",
      boton: "Marcar agotada",
      hecho: "marcada agotada",
      hechas: "marcadas agotadas",
      funcion: "fn_marcar_agotada",
      estadoEsperado: "AGOTADA"
    },
    revisar: {
      titulo: "Dejar por revisar",
      boton: "Dejar por revisar",
      hecho: "dejada por revisar",
      hechas: "dejadas por revisar",
      estadoEsperado: "REVISAR"
    }
  };

  function campo({ id, etiqueta, ayuda, control }) {
    const caja = nodo("div", "campo");
    const label = nodo("label", "", etiqueta);
    label.htmlFor = id;
    control.id = id;
    caja.append(label, control);
    if (ayuda) {
      const nota = nodo("p", "campo-ayuda", ayuda);
      nota.id = `${id}-ayuda`;
      control.setAttribute("aria-describedby", nota.id);
      caja.append(nota);
    }
    return caja;
  }

  function campoHoras() {
    const control = document.createElement("input");
    control.type = "number";
    control.inputMode = "numeric";
    control.min = "1";
    control.max = "60";
    control.step = "1";
    control.value = String(vigenciaPredeterminada);
    control.required = true;
    return campo({ id: "accion-horas", etiqueta: "Horas de vigencia", ayuda: `De 1 a 60. La predeterminada de la tienda es ${vigenciaPredeterminada} h.`, control });
  }

  // Fecha de hoy en Colombia (para el máximo del selector), sin usar la zona del computador.
  const hoyEnColombia = () => new Date(Date.now() + DESFASE_COLOMBIA_MS).toISOString().slice(0, 10);

  // «AAAA-MM-DD» + «HH:MM» en hora de Colombia → instante ISO con su desfase (−05:00).
  function instanteColombia(dia, hora) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !/^\d{2}:\d{2}$/.test(hora)) return null;
    const iso = `${dia}T${hora}:00-05:00`;
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) return null;
    const local = new Date(ms + DESFASE_COLOMBIA_MS); // comprueba que la fecha exista (p. ej. 31 de febrero)
    if (local.toISOString().slice(0, 10) !== dia || local.toISOString().slice(11, 16) !== hora) return null;
    return { iso, ms };
  }

  function abrirAccion(tipo) {
    if (ocupado || verificacionPendiente) return;
    const elegidas = tallasSeleccionadas();
    if (!elegidas) {
      anunciarResultado({ titulo: "Selecciona al menos una talla", lineas: [], tipo: "aviso" });
      return;
    }
    const def = ACCIONES[tipo];
    const { producto, variante, tallas } = elegidas;
    accionAbierta = {
      tipo,
      producto: { id: producto.id, nombre: producto.nombre, codigo: producto.codigo_interno, activo: producto.activo },
      variante: { id: variante.id, color: variante.color, codigo: variante.codigo_variante, activa: variante.activa },
      tallas: tallas.map((t) => ({ id: t.id, talla: t.talla, efectivo: t.efectivo, estado: t.estado, activa: t.activa, actualizado_en: t.actualizado_en }))
    };

    $("#dialogo-titulo").textContent = def.titulo;
    $("#dialogo-confirmar").textContent = def.boton;
    $("#dialogo-error").hidden = true;
    $("#dialogo-progreso").textContent = "";
    const cuerpo = $("#dialogo-cuerpo");
    cuerpo.replaceChildren();

    const datos = nodo("dl", "dialogo-datos");
    const par = (t, d) => { const caja = nodo("div"); caja.append(nodo("dt", "", t), nodo("dd", "", d)); datos.append(caja); };
    par("Modelo", `${producto.nombre} (${producto.codigo_interno})`);
    par("Color", `${variante.color} (${variante.codigo_variante})`);
    par(tallas.length === 1 ? "Talla" : "Tallas", tallas.map((t) => `${t.talla} (${ESTADOS[t.efectivo].texto})`).join(", "));
    cuerpo.append(datos);

    const efectos = nodo("ul", "dialogo-efectos");
    const efecto = (texto, aviso = false) => efectos.append(nodo("li", aviso ? "es-aviso" : "", texto));
    const inactivas = tallas.filter((t) => !t.activa).map((t) => t.talla);
    if (tipo === "proveedor") {
      efecto("Úsala solo cuando el proveedor te haya confirmado la disponibilidad directamente.");
      efecto("La fecha de confirmación la pone el servidor en el momento de guardar; la vigencia empieza ahí.");
      efecto("La fecha de la publicación original, si la hay, se conserva.");
    } else if (tipo === "publicacion") {
      efecto("Úsala cuando el proveedor volvió a publicar el modelo. La vigencia empieza en la fecha y hora de esa publicación, no ahora.");
      efecto("Escribe la hora tal como aparece en la publicación, en hora de Colombia.");
    } else if (tipo === "agotada") {
      efecto("La talla se mostrará agotada en la tienda hasta que vuelvas a confirmarla. No se borra.");
      efecto("Se retira de los carritos de los clientes que la tengan guardada.");
    } else {
      efecto("La talla deja de mostrarse como disponible o agotada y queda por revisar: se podrá consultar, no comprar.");
      efecto("No se inventan fechas ni se confirma nada; las fechas anteriores quedan en el historial.");
    }
    if (inactivas.length && (tipo === "proveedor" || tipo === "publicacion")) {
      efecto(`${inactivas.length === 1 ? "La talla" : "Las tallas"} ${inactivas.join(", ")} ${inactivas.length === 1 ? "está desactivada: al confirmarla se reactivará" : "están desactivadas: al confirmarlas se reactivarán"} y volverá a ofrecerse.`, true);
    } else if (inactivas.length) {
      efecto(`${inactivas.length === 1 ? "La talla" : "Las tallas"} ${inactivas.join(", ")} ${inactivas.length === 1 ? "sigue" : "siguen"} desactivada${inactivas.length === 1 ? "" : "s"}.`, true);
    }
    if (!producto.activo) efecto("El producto está oculto en la tienda y seguirá oculto: este cambio no lo publica.", true);
    else if (!variante.activa) efecto("Este color está oculto en la tienda y seguirá oculto: este cambio no lo publica.", true);
    if (tallas.length > 1 && tipo !== "revisar") efecto("Cada talla se guarda por separado: si algo falla verás cuáles se aplicaron y cuáles no.");
    cuerpo.append(efectos);

    if (tipo === "publicacion") {
      const fila = nodo("div", "campos-fila");
      const dia = document.createElement("input");
      dia.type = "date";
      dia.required = true;
      dia.max = hoyEnColombia();
      const hora = document.createElement("input");
      hora.type = "time";
      hora.required = true;
      fila.append(
        campo({ id: "accion-fecha", etiqueta: "Fecha de la publicación", control: dia }),
        campo({ id: "accion-hora", etiqueta: "Hora (Colombia, UTC−5)", control: hora })
      );
      cuerpo.append(fila);
    }
    if (tipo === "proveedor" || tipo === "publicacion") cuerpo.append(campoHoras());
    if (tipo === "publicacion") {
      const previa = nodo("p", "dialogo-previa");
      previa.id = "accion-previa";
      previa.setAttribute("aria-live", "polite");
      cuerpo.append(previa);
      cuerpo.addEventListener("input", actualizarPrevia);
    }
    if (tipo === "agotada") {
      const nota = document.createElement("textarea");
      nota.maxLength = 500;
      nota.rows = 2;
      cuerpo.append(campo({ id: "accion-nota", etiqueta: "Nota interna (opcional)", ayuda: "Por ejemplo, quién lo confirmó. No se muestra en la tienda.", control: nota }));
    }

    const dialogo = $("#dialogo-accion");
    dialogo.showModal();
    (cuerpo.querySelector("input, textarea") || $("#dialogo-confirmar")).focus();
  }

  function actualizarPrevia() {
    const previa = $("#accion-previa");
    if (!previa) return;
    const instante = instanteColombia($("#accion-fecha")?.value || "", $("#accion-hora")?.value || "");
    const horas = Number($("#accion-horas")?.value);
    if (!instante) { previa.textContent = ""; return; }
    if (instante.ms > Date.now()) { previa.textContent = "Esa fecha es posterior a la hora actual: no se puede registrar una publicación futura."; return; }
    if (!Number.isInteger(horas) || horas < 1 || horas > 60) { previa.textContent = ""; return; }
    const fin = instante.ms + horas * 3600e3;
    previa.textContent = fin <= Date.now()
      ? `La vigencia iría del ${fecha(instante.iso)} al ${fecha(new Date(fin).toISOString())} y ya terminó: las tallas quedarán por revisar en la tienda.`
      : `La vigencia irá del ${fecha(instante.iso)} al ${fecha(new Date(fin).toISOString())} (hora de Colombia).`;
  }

  function errorDialogo(texto, foco) {
    const error = $("#dialogo-error");
    error.textContent = texto;
    error.hidden = false;
    if (foco) $(foco)?.focus();
  }

  function leerParametros(tipo) {
    $("#dialogo-error").hidden = true;
    const parametros = {};
    if (tipo === "proveedor" || tipo === "publicacion") {
      const horas = Number($("#accion-horas").value);
      if (!Number.isInteger(horas) || horas < 1 || horas > 60) { errorDialogo("Las horas de vigencia deben ser un número entero entre 1 y 60.", "#accion-horas"); return null; }
      parametros.horas = horas;
    }
    if (tipo === "publicacion") {
      const dia = $("#accion-fecha").value;
      const hora = $("#accion-hora").value;
      if (!dia || !hora) { errorDialogo("Escribe la fecha y la hora en que el proveedor publicó el modelo.", dia ? "#accion-hora" : "#accion-fecha"); return null; }
      const instante = instanteColombia(dia, hora);
      if (!instante) { errorDialogo("Revisa la fecha y la hora: no son válidas.", "#accion-fecha"); return null; }
      if (instante.ms > Date.now()) { errorDialogo("Esa fecha es posterior a la hora actual. Usa la fecha real de la publicación.", "#accion-fecha"); return null; }
      parametros.publicadoEn = instante.iso;
    }
    if (tipo === "agotada") parametros.nota = $("#accion-nota").value.trim() || null;
    return parametros;
  }

  function cerrarDialogo(forzar = false) {
    if (ocupado && !forzar) return;
    const dialogo = $("#dialogo-accion");
    if (dialogo.open) dialogo.close();
    $("#dialogo-cuerpo").removeEventListener("input", actualizarPrevia);
  }

  // Clasifica el error de una escritura. «red» = no sabemos si llegó: el resultado es incierto.
  function clasificarEscritura(respuesta) {
    const error = respuesta?.error || {};
    const estado = Number(respuesta?.status ?? error.status) || 0;
    const codigo = String(error.code || "");
    const mensaje = String(error.message || "");
    if (estado === 0 && !codigo) return "red";
    if (estado === 401 || /^PGRST30[0-3]$/.test(codigo)) return "sin-sesion";
    if (codigo === "42501" || /Solo un administrador/.test(mensaje)) return "sin-permiso";
    if (["23514", "22007", "22008", "22P02", "23502"].includes(codigo)) return "validacion";
    if (estado >= 500) return "red";
    return "otro";
  }

  function textoError(tipo, respuesta) {
    const mensaje = String(respuesta?.error?.message || "");
    if (tipo === "validacion" && /futura/.test(mensaje)) return "la fecha es posterior a la hora actual del servidor";
    if (tipo === "validacion" && /vigencia_horas/.test(mensaje)) return "la vigencia debe estar entre 1 y 60 horas";
    if (tipo === "validacion") return "el servidor rechazó los datos";
    if (tipo === "sin-permiso") return "la cuenta ya no tiene permiso de administración";
    if (tipo === "sin-sesion") return "la sesión terminó";
    if (/No existe la talla/.test(mensaje)) return "la talla ya no existe";
    return "el servidor no aplicó el cambio";
  }

  // Solo lectura, con las columnas internas (fn_admin_tallas): nunca escribe ni renueva nada.
  async function leerTallasVariante(varianteId) {
    try {
      const r = await cliente.rpc("fn_admin_tallas", { p_variante_id: varianteId }).select(COLUMNAS_TALLA);
      if (r.error) return { error: r.error, status: r.status };
      return { data: r.data || [] };
    } catch {
      return { error: { status: 0 } };
    }
  }

  function llamarFuncion(tipo, id, parametros) {
    const def = ACCIONES[tipo];
    const args = { p_talla_id: id };
    if (tipo === "proveedor") args.p_vigencia_horas = parametros.horas;
    if (tipo === "publicacion") { args.p_publicado_en = parametros.publicadoEn; args.p_vigencia_horas = parametros.horas; }
    if (tipo === "agotada") args.p_nota = parametros.nota;
    // Solo columnas públicas en la respuesta.
    return cliente.rpc(def.funcion, args).select("id,estado,activa");
  }

  async function ejecutarAccion(evento) {
    evento.preventDefault();
    const accion = accionAbierta;
    if (!accion || ocupado) return;
    const parametros = leerParametros(accion.tipo);
    if (!parametros) return;

    const mia = generacion;
    const def = ACCIONES[accion.tipo];
    const progreso = $("#dialogo-progreso");
    const resultados = accion.tallas.map((t) => ({ ...t, resultado: "no-intentada", detalle: "" }));
    marcarOcupado(true);
    try {
      progreso.textContent = "Comprobando tu sesión y tu permiso…";
      const acceso = await comprobarAcceso();
      if (mia !== generacion) return;
      if (acceso.estado !== "admin") { cerrarDialogo(true); await aplicarAcceso(acceso); return; }

      progreso.textContent = "Comprobando que la selección sigue vigente…";
      const frescas = await leerTallasVariante(accion.variante.id);
      if (mia !== generacion) return;
      if (frescas.error) {
        errorDialogo("No pudimos comprobar el estado actual de las tallas. No se cambió nada: revisa tu conexión e inténtalo de nuevo.");
        progreso.textContent = "";
        return;
      }
      const actuales = new Map(frescas.data.map((t) => [t.id, t]));
      const cambiadas = accion.tallas.filter((t) => !actuales.has(t.id) || actuales.get(t.id).actualizado_en !== t.actualizado_en);
      if (cambiadas.length) {
        cerrarDialogo(true);
        anunciarResultado({
          titulo: "La disponibilidad cambió mientras revisabas",
          texto: `${cambiadas.map((t) => t.talla).join(", ")}: ${cambiadas.length === 1 ? "cambió" : "cambiaron"} desde que cargaste el panel. No se aplicó nada; revisa los datos actualizados y vuelve a elegir.`,
          lineas: [],
          tipo: "aviso"
        });
        marcarOcupado(false);
        await cargarCatalogo({ conservarPosicion: true });
        return;
      }

      if (accion.tipo === "revisar") {
        // Una sola escritura para toda la selección: se aplica a todas o a ninguna.
        progreso.textContent = `Guardando ${resultados.length === 1 ? "la talla" : `las ${resultados.length} tallas`}…`;
        let respuesta;
        try {
          respuesta = await cliente.from("tallas").update({ estado: "REVISAR" })
            .in("id", accion.tallas.map((t) => t.id)).eq("variante_id", accion.variante.id).select("id,estado");
        } catch { respuesta = { error: { status: 0 } }; }
        if (respuesta.error) {
          const tipo = clasificarEscritura(respuesta);
          for (const r of resultados) {
            r.resultado = tipo === "red" ? "no-confirmada" : "fallida";
            r.motivo = tipo;
            r.detalle = tipo === "red" ? "se perdió la respuesta del servidor" : textoError(tipo, respuesta);
          }
        } else {
          const hechas = new Map((respuesta.data || []).map((f) => [f.id, f]));
          for (const r of resultados) {
            const fila = hechas.get(r.id);
            r.resultado = fila && fila.estado === "REVISAR" ? "aplicada" : "fallida";
            if (!fila) r.detalle = "no se modificó (sin permiso o ya no existe)";
          }
        }
      } else {
        for (let i = 0; i < resultados.length; i += 1) {
          const r = resultados[i];
          progreso.textContent = `Aplicando ${i + 1} de ${resultados.length}: talla ${r.talla}…`;
          let respuesta;
          try { respuesta = await llamarFuncion(accion.tipo, r.id, parametros); } catch { respuesta = { error: { status: 0 } }; }
          if (mia !== generacion) return;
          if (respuesta.error) {
            const tipo = clasificarEscritura(respuesta);
            r.motivo = tipo;
            r.resultado = tipo === "red" ? "no-confirmada" : "fallida";
            r.detalle = tipo === "red" ? "se perdió la respuesta del servidor" : textoError(tipo, respuesta);
            // Sin reintentos automáticos: tras un error de red, de sesión, de permiso o de
            // validación no se sigue con las demás (darían el mismo error o un resultado dudoso).
            if (tipo !== "otro") {
              for (const resto of resultados.slice(i + 1)) resto.detalle = "no se intentó";
              break;
            }
            continue;
          }
          const fila = Array.isArray(respuesta.data) ? respuesta.data[0] : respuesta.data;
          if (fila && fila.id === r.id && fila.estado === def.estadoEsperado) r.resultado = "aplicada";
          else { r.resultado = "no-confirmada"; r.detalle = "la respuesta no confirma el cambio"; }
        }
      }

      // Resultado no confirmado. Solo una respuesta válida de la escritura confirma qué hizo esa
      // petición. Releer la talla dice cómo está AHORA, pero no qué operación la dejó así: una
      // marca de actualización distinta puede venir de otra acción u otra cuenta, y una fila sin
      // cambios no prueba que la petición fallara (puede seguir en camino). Por eso la relectura
      // solo se muestra como «estado actual», sin convertirla en éxito ni en fracaso. No se
      // reintenta ni se escribe nada para comprobarlo.
      const sinConfirmar = resultados.filter((r) => r.resultado === "no-confirmada");
      if (sinConfirmar.length) {
        progreso.textContent = "Consultando el estado actual…";
        const despues = await leerTallasVariante(accion.variante.id);
        if (mia !== generacion) return;
        if (despues.error) {
          verificacionPendiente = true;
          for (const r of sinConfirmar) r.actual = { leido: false };
        } else {
          const ahora = new Map(despues.data.map((t) => [t.id, t]));
          for (const r of sinConfirmar) r.actual = { leido: true, fila: ahora.get(r.id) || null };
        }
      }

      cerrarDialogo(true);
      const sesionPerdida = resultados.some((r) => r.motivo === "sin-sesion");
      const sinPermiso = resultados.some((r) => r.motivo === "sin-permiso");
      const aplicadas = resultados.filter((r) => r.resultado === "aplicada").length;
      if (sesionPerdida) {
        generacion += 1;
        await borrarSesionLocal();
        mostrarIngreso(`Tu sesión terminó durante la operación. Se aplicó a ${aplicadas} de ${resultados.length} ${resultados.length === 1 ? "talla" : "tallas"}; revisa el historial al volver a ingresar.`);
        return;
      }
      if (sinPermiso) {
        const otraVez = await comprobarAcceso();
        if (!(await aplicarAcceso(otraVez))) return;
      }
      anunciarResultado(resumenResultados(accion, resultados));
      // Tras un resultado no confirmado no queda nada preparado para repetir: cualquier acción
      // posterior pide elegir las tallas y confirmar otra vez, ya con los datos recargados.
      if (sinConfirmar.length) seleccion = { varianteId: null, ids: new Set() };
      marcarOcupado(false);
      if (!verificacionPendiente) {
        await cargarCatalogo({ conservarPosicion: true });
      } else {
        // No se pintan los estados anteriores como si siguieran vigentes.
        limpiarCatalogoVisible();
        avisoTablero({
          titulo: "Comprueba el resultado antes de seguir",
          texto: "No pudimos confirmar qué se guardó. Cuando vuelva la conexión pulsa «Actualizar» para ver el estado real; hasta entonces las acciones quedan bloqueadas.",
          accion: { texto: "Actualizar", alPulsar: () => cargarCatalogo() },
          rol: "alert"
        });
      }
      $("#resultado-accion").focus();
    } finally {
      // Siempre se libera, también si la sesión o el permiso se perdieron por el camino.
      marcarOcupado(false);
    }
  }

  function resumenResultados(accion, resultados) {
    const def = ACCIONES[accion.tipo];
    const total = resultados.length;
    const aplicadas = resultados.filter((r) => r.resultado === "aplicada").length;
    const sinConfirmar = resultados.filter((r) => r.resultado === "no-confirmada");
    const sinLeer = sinConfirmar.some((r) => !r.actual?.leido);
    const quien = `${accion.producto.nombre} · ${accion.variante.color}`;
    let titulo;
    if (sinConfirmar.length) titulo = "Resultado no confirmado";
    else if (aplicadas === total) titulo = total === 1 ? `Talla ${resultados[0].talla} ${def.hecho}` : `${total} tallas ${def.hechas}`;
    else if (aplicadas) titulo = `Se aplicó a ${aplicadas} de ${total} tallas`;
    else titulo = "No se aplicó ningún cambio";
    const lineas = resultados.map((r) => {
      if (r.resultado === "no-confirmada") return `${r.talla}: resultado no confirmado (${r.detalle}). ${textoEstadoActual(r)}`;
      const estado = { aplicada: def.hecho, fallida: "no se aplicó", "no-intentada": "no se aplicó" }[r.resultado];
      return `${r.talla}: ${estado}${r.detalle ? ` (${r.detalle})` : ""}`;
    });
    let texto = quien;
    if (sinConfirmar.length) {
      texto += `. No sabemos si la petición de ${sinConfirmar.length === 1 ? `la talla ${sinConfirmar[0].talla}` : `las tallas ${sinConfirmar.map((r) => r.talla).join(", ")}`} se aplicó.`;
      texto += sinLeer
        ? " Tampoco pudimos leer el estado actual: no repitas la acción y pulsa «Actualizar» cuando vuelva la conexión."
        : " El estado actual es el que tiene ahora en el servidor, pero no indica qué operación lo produjo. No repitas la acción sin revisarlo; si hace falta, vuelve a elegir las tallas y confirma de nuevo.";
    }
    if (aplicadas !== total && total > 1 && accion.tipo !== "revisar") texto += `${sinConfirmar.length ? "" : "."} Cada talla se guardó por separado; no fue una operación única.`;
    return { titulo, texto, lineas, tipo: sinConfirmar.length || aplicadas !== total ? "aviso" : "ok" };
  }

  // Describe la fila releída tal como está, sin atribuirla a la petición sin confirmar.
  function textoEstadoActual(r) {
    if (!r.actual?.leido) return "No pudimos leer su estado actual.";
    const fila = r.actual.fila;
    if (!fila) return "Estado actual: la talla ya no aparece en este color.";
    const datos = [`guardada como ${(GUARDADOS[fila.estado] || fila.estado).toLowerCase()}`];
    if (fila.origen) datos.push(`procedencia: ${ORIGENES[fila.origen] || fila.origen}`);
    if (fila.publicado_en) datos.push(`publicación original: ${fecha(fila.publicado_en)}`);
    if (fila.vigencia_desde) datos.push(`vigencia: ${fecha(fila.vigencia_desde)} → ${fecha(fila.vence_en)}`);
    if (!fila.activa) datos.push("desactivada");
    const cambio = fila.actualizado_en !== r.actualizado_en
      ? "Cambió después de la comprobación previa, pero no sabemos por qué operación."
      : "Sin cambios por ahora; la petición todavía podría aplicarse.";
    return `Estado actual: ${datos.join(" · ")}. ${cambio}`;
  }

  function anunciarResultado({ titulo, texto = "", lineas = [], tipo = "ok" }) {
    const caja = $("#resultado-accion");
    caja.className = `resultado-accion es-${tipo}`;
    const cerrar = nodo("button", "boton boton-texto boton-compacto", "Cerrar aviso");
    cerrar.type = "button";
    cerrar.dataset.accion = "cerrar-resultado";
    const partes = [nodo("h2", "", titulo)];
    if (texto) partes.push(nodo("p", "", texto));
    if (lineas.length) {
      const lista = nodo("ul", "resultado-lineas");
      for (const l of lineas) lista.append(nodo("li", "", l));
      partes.push(lista);
    }
    partes.push(cerrar);
    caja.replaceChildren(...partes);
    caja.hidden = false;
  }

  // ------------------------------------------------------------------ historial
  /* Etapa 17: zapatillas, colores y tallas (lo que ya registra public.historial por disparador).
   * Solo lectura y solo para administradores (RLS historial_lectura_admin; además se comprueba
   * el acceso antes de cada página). Paginación por id descendente con cursor; cambiar el filtro
   * reinicia la paginación. Cada petición lleva un número: la respuesta de un filtro anterior, de
   * una sesión cerrada o de un historial ya cerrado se descarta sin pintarse. */
  const HISTORIAL_PAGINA = 25;
  const HISTORIAL_FILTROS = {
    todos: { texto: "Todos", vacio: "Todavía no hay cambios registrados.", tablas: ["productos", "variantes", "tallas"] },
    productos: { texto: "Zapatillas", vacio: "Todavía no hay cambios de zapatillas registrados.", tablas: ["productos"] },
    variantes: { texto: "Colores", vacio: "Todavía no hay cambios de colores registrados.", tablas: ["variantes"] },
    tallas: { texto: "Tallas", vacio: "Todavía no hay cambios de tallas registrados.", tablas: ["tallas"] }
  };
  const TIPO_FILA = { productos: "Zapatilla", variantes: "Color", tallas: "Talla" };
  const PUBLICO_TEXTO = { hombre: "Hombre", dama: "Dama", unisex: "Unisex" };
  const SEGMENTO_TEXTO = { hombre: "hombre", mujer: "mujer" };
  let historialFiltro = "todos";
  let historialPeticion = 0;        // sube con cada petición: solo se pinta la respuesta de la última
  let nombresAdmin = new Map();     // user_id → nombre de la administración (si se puede leer)

  const siNo = (v) => (v ? "sí" : "no");
  const textoPublico = (v) => (v ? PUBLICO_TEXTO[v] || String(v) : "sin clasificar");
  const textoPrecio = (v) => (Number(v) > 0 ? pesos.format(Number(v)) : "por confirmar");
  const textoAnterior = (v) => (Number(v) > 0 ? pesos.format(Number(v)) : "sin precio anterior");
  const textoVacio = (v) => (v === null || v === undefined || v === "" ? "—" : String(v));
  const recortar = (texto, max = 80) => (String(texto).length > max ? `${String(texto).slice(0, max - 1)}…` : String(texto));

  // Campos que se describen con su valor anterior y el nuevo. Los internos (versión, operación,
  // marcas de tiempo, claves inmutables) no se muestran: no son decisiones de la persona.
  const CAMPOS = {
    productos: {
      nombre: ["Modelo", textoVacio], marca: ["Marca", textoVacio], categoria: ["Categoría", textoVacio],
      codigo_interno: ["Código", textoVacio], referencia_proveedor: ["Referencia del proveedor", textoVacio],
      segmento: ["Tabla de la guía de tallas", (v) => SEGMENTO_TEXTO[v] || (v ? String(v) : "sin indicar")],
      publico: ["Público", textoPublico], destacado: ["Destacada", siNo], nuevo_ingreso: ["Nuevo ingreso", siNo],
      orden: ["Orden", textoVacio]
    },
    variantes: {
      color: ["Color", textoVacio], codigo_variante: ["Código del color", textoVacio],
      referencia_variante: ["Referencia del proveedor", textoVacio], precio: ["Precio", textoPrecio],
      precio_anterior: ["Precio anterior", textoAnterior], muestra_color: ["Muestra", (v) => (v ? String(v).toUpperCase() : "sin muestra")],
      orden: ["Orden", textoVacio]
    },
    tallas: {}
  };
  const INTERNOS = new Set(["id", "version", "ultima_operacion", "actualizado_en", "creado_en", "clave_catalogo", "clave_legado", "id_legado",
    "producto_id", "variante_id", "registrado_en", "vence_en", "estado_migrado"]);

  function describirTalla(h, antes, ahora, cambios) {
    if (h.operacion === "INSERT") return [`Talla ${ahora.talla} registrada como ${(GUARDADOS[ahora.estado] || ahora.estado || "").toLowerCase()}${ahora.activa === false ? " (desactivada)" : ""}`];
    const partes = [];
    if (cambios.has("estado")) partes.push(`Estado: ${GUARDADOS[antes.estado] || antes.estado} → ${GUARDADOS[ahora.estado] || ahora.estado}`);
    if (ahora.estado === "CONFIRMADA" && (cambios.has("vigencia_desde") || cambios.has("vigencia_horas"))) {
      partes.push(`Vigencia: desde ${fecha(ahora.vigencia_desde)} por ${ahora.vigencia_horas} h (${ORIGENES[ahora.origen] || ahora.origen})`);
    } else if (cambios.has("vigencia_horas")) partes.push(`Horas de vigencia: ${antes.vigencia_horas} → ${ahora.vigencia_horas}`);
    if (cambios.has("activa")) partes.push(ahora.activa ? "Reactivada" : "Desactivada");
    if (cambios.has("nota")) partes.push(ahora.nota ? `Nota: «${recortar(ahora.nota)}»` : "Nota borrada");
    if (cambios.has("talla")) partes.push(`Etiqueta: ${antes.talla} → ${ahora.talla}`);
    if (cambios.has("publicado_en") && !cambios.has("vigencia_desde")) partes.push(`Publicación original: ${fecha(antes.publicado_en)} → ${fecha(ahora.publicado_en)}`);
    return partes;
  }

  function describirCambio(h) {
    const antes = h.fila_anterior || {};
    const ahora = h.fila_nueva || {};
    const cambios = new Set(h.cambios || []);
    if (h.operacion === "DELETE") return [`${TIPO_FILA[h.tabla] || "Registro"} eliminado por mantenimiento`];
    if (h.tabla === "tallas") {
      const partes = describirTalla(h, antes, ahora, cambios);
      return partes.length ? partes : ["Otros datos internos actualizados"];
    }
    if (h.operacion === "INSERT") {
      if (h.tabla === "productos") {
        return [`Zapatilla creada: ${[ahora.marca, ahora.categoria].filter(Boolean).join(" · ")}`,
          `Público: ${textoPublico(ahora.publico)}`, ahora.activo ? "Publicada en la tienda" : "Oculta en la tienda"];
      }
      return [`Color agregado: ${ahora.color} (${ahora.codigo_variante})`, `Precio: ${textoPrecio(ahora.precio)}`,
        ahora.activa === false ? "Oculto en la tienda" : "Visible en la tienda"];
    }
    const partes = [];
    if (h.tabla === "productos") {
      if (cambios.has("activo")) partes.push(ahora.activo ? "Publicada en la tienda" : "Oculta en la tienda");
      if (cambios.has("retirado_en")) partes.push(ahora.retirado_en ? "Retirada del catálogo" : "Restaurada (sigue oculta)");
      if (cambios.has("descripcion")) partes.push(ahora.descripcion ? "Descripción actualizada" : "Descripción borrada");
    }
    if (h.tabla === "variantes" && cambios.has("activa")) partes.push(ahora.activa ? "Color visible en la tienda" : "Color oculto en la tienda");
    const campos = CAMPOS[h.tabla] || {};
    for (const [clave, [etiqueta, formato]] of Object.entries(campos)) {
      if (cambios.has(clave)) partes.push(`${etiqueta}: ${recortar(formato(antes[clave]))} → ${recortar(formato(ahora[clave]))}`);
    }
    const otros = [...cambios].filter((c) => !INTERNOS.has(c) && !(c in campos) && !["activo", "retirado_en", "descripcion", "activa"].includes(c));
    if (otros.length) partes.push(`Otros datos actualizados (${otros.join(", ")})`);
    if (!partes.length) {
      // Un guardado del panel siempre sube la versión de la zapatilla; si nada más cambió en ella,
      // lo que cambió está en sus colores o tallas (mismo «lote»).
      partes.push(h.tabla === "productos" && cambios.has("version")
        ? "Guardada desde el panel sin cambios en sus datos (lo que cambió está en sus colores o tallas, en la misma operación)"
        : "Datos internos actualizados");
    }
    return partes;
  }

  function autorDe(h) {
    if (!h.autor) return "Sistema o mantenimiento";
    if (usuarioActual && h.autor === usuarioActual.id) return "Tú";
    const nombre = nombresAdmin.get(h.autor);
    return nombre ? `${nombre} (${String(h.autor).slice(0, 8)})` : `Otra cuenta (${String(h.autor).slice(0, 8)})`;
  }

  // Qué zapatilla, color o talla se afectó: primero con el tablero actual; si el registro ya no
  // está en él, con los datos guardados en el propio evento.
  function ubicacionDe(h) {
    const fila = h.fila_nueva || h.fila_anterior || {};
    const zapatilla = (id) => catalogo.find((p) => p.id === id);
    const color = (id) => {
      for (const p of catalogo) { const v = p.variantes.find((x) => x.id === id); if (v) return { p, v }; }
      return null;
    };
    if (h.tabla === "productos") {
      const p = zapatilla(h.fila_id);
      if (p) return `${p.nombre} (${p.codigo_interno})`;
      return `${fila.nombre || "Zapatilla"}${fila.codigo_interno ? ` (${fila.codigo_interno})` : ""} · ya no está en el tablero`;
    }
    if (h.tabla === "variantes") {
      const encontrado = color(h.fila_id);
      if (encontrado) return `${encontrado.p.nombre} · ${encontrado.v.color} (${encontrado.v.codigo_variante})`;
      const p = zapatilla(fila.producto_id);
      return `${p ? `${p.nombre} · ` : ""}${fila.color || "Color"}${fila.codigo_variante ? ` (${fila.codigo_variante})` : ""}${p ? "" : " · ya no está en el tablero"}`;
    }
    for (const p of catalogo) for (const v of p.variantes) {
      const t = v.tallas.find((x) => x.id === h.fila_id);
      if (t) return `${p.nombre} · ${v.color} · talla ${t.talla}`;
    }
    const encontrado = color(fila.variante_id);
    if (encontrado) return `${encontrado.p.nombre} · ${encontrado.v.color} · talla ${fila.talla}`;
    return fila.talla ? `Talla ${fila.talla} · su color ya no está en el tablero` : "Talla que ya no está en el tablero";
  }

  function pintarFiltrosHistorial() {
    document.querySelectorAll("#historial [data-historial-filtro]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.historialFiltro === historialFiltro));
    });
  }

  async function alternarHistorial() {
    const seccion = $("#historial");
    const abrir = seccion.hidden;
    seccion.hidden = !abrir;
    $("#boton-historial").setAttribute("aria-expanded", String(abrir));
    if (abrir) await cargarHistorial(true);
    else historialPeticion += 1; // lo que llegue tarde ya no se pinta
  }

  function elegirFiltroHistorial(id) {
    if (!HISTORIAL_FILTROS[id] || id === historialFiltro) return;
    historialFiltro = id;
    pintarFiltrosHistorial();
    cargarHistorial(true);
  }

  async function leerNombresAdmin() {
    try {
      const r = await cliente.from("administradores").select("user_id,nombre");
      if (!r.error) nombresAdmin = new Map((r.data || []).filter((a) => a.nombre).map((a) => [a.user_id, a.nombre]));
    } catch { /* sin nombres: se muestra el identificador abreviado */ }
  }

  function itemHistorial(h, anterior) {
    const item = nodo("li", "historial-item");
    item.dataset.tabla = h.tabla;
    item.dataset.id = String(h.id);
    if (h.lote) item.dataset.lote = h.lote;
    const mismoLote = Boolean(h.lote) && anterior?.dataset.lote === h.lote;
    if (mismoLote) item.classList.add("historial-mismo-lote");
    const meta = nodo("p", "historial-meta");
    const cuando = nodo("time", "historial-fecha", fecha(h.ocurrido_en));
    cuando.dateTime = h.ocurrido_en;
    meta.append(nodo("span", "historial-tipo", TIPO_FILA[h.tabla] || h.tabla), cuando, nodo("span", "historial-quien", autorDe(h)));
    if (h.lote) {
      const lote = nodo("span", "historial-lote", mismoLote ? "misma operación" : `operación ${String(h.lote).slice(0, 8)}`);
      lote.title = `Identificador de la operación: ${h.lote}`;
      meta.append(lote);
    }
    const cambios = nodo("ul", "historial-cambios");
    for (const texto of describirCambio(h)) cambios.append(nodo("li", "", texto));
    item.append(meta, nodo("strong", "historial-donde", ubicacionDe(h)), cambios);
    return item;
  }

  async function cargarHistorial(reiniciar) {
    const mia = generacion;
    const peticion = ++historialPeticion;
    const filtroPedido = historialFiltro;
    const vigente = () => mia === generacion && peticion === historialPeticion && !$("#historial").hidden;
    const lista = $("#historial-lista");
    const estado = $("#historial-estado");
    const mas = $("#historial-mas");
    if (reiniciar) { lista.replaceChildren(); historialCursor = null; }
    const cursor = historialCursor;
    mas.hidden = true;
    estado.textContent = "Cargando historial…";
    $("#historial").setAttribute("aria-busy", "true");
    try {
      const acceso = await comprobarAcceso();
      if (mia !== generacion) return;
      if (!(await aplicarAcceso(acceso))) return;
      if (!vigente()) return;
      if (reiniciar) await leerNombresAdmin();
      if (!vigente()) return;
      let consulta = cliente.from("historial")
        .select("id,tabla,fila_id,operacion,cambios,fila_anterior,fila_nueva,autor,lote,ocurrido_en")
        .in("tabla", HISTORIAL_FILTROS[filtroPedido].tablas)
        .order("id", { ascending: false }).limit(HISTORIAL_PAGINA);
      if (cursor) consulta = consulta.lt("id", cursor);
      let r;
      try { r = await consulta; } catch { r = { error: { status: 0 } }; }
      if (!vigente()) return;
      if (r.error) {
        if (clasificar(r.error) === "sin-sesion") { await aplicarAcceso({ estado: "sin-sesion" }); return; }
        estado.textContent = "No pudimos cargar el historial. Revisa tu conexión e inténtalo de nuevo.";
        mas.hidden = !cursor; // si ya había páginas, se puede volver a pedir la siguiente
        return;
      }
      const filas = r.data || [];
      for (const h of filas) lista.append(itemHistorial(h, lista.lastElementChild));
      if (filas.length) historialCursor = filas[filas.length - 1].id;
      mas.hidden = filas.length < HISTORIAL_PAGINA;
      const n = lista.children.length;
      const filtro = HISTORIAL_FILTROS[filtroPedido];
      estado.textContent = n
        ? `${n} ${n === 1 ? "cambio" : "cambios"}${filtroPedido === "todos" ? "" : ` (${filtro.texto.toLowerCase()})`}, del más reciente al más antiguo. Hora de Colombia.`
        : filtro.vacio;
    } finally {
      if (peticion === historialPeticion) $("#historial").removeAttribute("aria-busy");
    }
  }

  // ------------------------------------------------------------- exportar (17)
  /* CSV del inventario COMPLETO (también lo oculto y lo retirado): una fila por color y talla; un
   * modelo sin colores o un color sin tallas da una fila con esas columnas vacías. UTF-8 con BOM y
   * punto y coma, para que Excel en español lo abra bien. Se comprueba el acceso y se reutilizan
   * las lecturas paginadas del tablero: si cualquier página falla, no se descarga nada. */
  const ESTADO_ZAPATILLA = (p) => (p.retirado_en ? "Retirada" : p.activo ? "Publicada" : "Oculta");
  const DISPONIBILIDAD_TIENDA = { DISPONIBLE: "Disponible", POR_REVISAR: "Por revisar", AGOTADO: "Agotada", OCULTA: "No visible en la tienda" };
  const COLUMNAS_CSV = [
    "Código zapatilla", "Modelo", "Marca", "Categoría", "Público", "Referencia proveedor", "Estado en la tienda",
    "Código color", "Color", "Referencia proveedor color", "Color visible", "Precio (COP)", "Precio anterior (COP)",
    "Talla EU", "Talla activa", "Disponibilidad guardada", "Disponibilidad en la tienda", "Procedencia",
    "Vigencia desde (hora Colombia)", "Vence (hora Colombia)", "Vigencia (horas)"
  ];
  const formatoFechaCsv = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const fechaCsv = (iso) => (iso ? formatoFechaCsv.format(new Date(iso)).replace(",", "") : "");
  let exportando = false;

  // Una celda de texto: protegida contra fórmulas de hoja de cálculo y escapada.
  function celdaCsv(valor, { numero = false } = {}) {
    let texto = valor === null || valor === undefined ? "" : String(valor);
    if (!numero && /^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
    return /[";\r\n]/.test(texto) || /^\s|\s$/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  }

  function filasCsv(productos) {
    const filas = [];
    for (const p of productos) {
      const base = [p.codigo_interno, p.nombre, p.marca, p.categoria, p.publico ? PUBLICO_TEXTO[p.publico] || p.publico : "Sin clasificar",
        p.referencia_proveedor || "", ESTADO_ZAPATILLA(p)].map((v) => celdaCsv(v));
      if (!p.variantes.length) { filas.push([...base, ...Array(COLUMNAS_CSV.length - base.length).fill("")]); continue; }
      for (const v of p.variantes) {
        const color = [celdaCsv(v.codigo_variante), celdaCsv(v.color), celdaCsv(v.referencia_variante || ""), celdaCsv(v.activa ? "Sí" : "No"),
          celdaCsv(v.precio ?? 0, { numero: true }), celdaCsv(Number(v.precio_anterior) > 0 ? v.precio_anterior : "", { numero: true })];
        if (!v.tallas.length) { filas.push([...base, ...color, ...Array(COLUMNAS_CSV.length - base.length - color.length).fill("")]); continue; }
        for (const t of v.tallas) {
          filas.push([...base, ...color, celdaCsv(t.talla), celdaCsv(t.activa ? "Sí" : "No"), celdaCsv(GUARDADOS[t.estado] || t.estado),
            celdaCsv(DISPONIBILIDAD_TIENDA[t.efectivo] || t.efectivo), celdaCsv(ORIGENES[t.origen] || t.origen || ""),
            celdaCsv(fechaCsv(t.vigencia_desde)), celdaCsv(fechaCsv(t.vence_en)), celdaCsv(t.vigencia_desde ? t.vigencia_horas : "", { numero: true })]);
        }
      }
    }
    return filas;
  }

  function descargarCsv(nombre, filas) {
    const texto = [COLUMNAS_CSV.map((c) => celdaCsv(c)), ...filas].map((f) => f.join(";")).join("\r\n") + "\r\n";
    const blob = new Blob(["﻿", texto], { type: "text/csv;charset=utf-8" });
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(blob);
    enlace.download = nombre;
    enlace.hidden = true;
    document.body.append(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 60000);
  }

  async function exportarCatalogo() {
    if (ocupado || exportando) return;
    const mia = generacion;
    const boton = $("#boton-exportar");
    exportando = true;
    boton.disabled = true;
    boton.setAttribute("aria-busy", "true");
    boton.textContent = "Exportando…";
    try {
      const acceso = await comprobarAcceso();
      if (mia !== generacion) return;
      if (!(await aplicarAcceso(acceso))) return;
      const respuestas = await Promise.all([
        leerPaginado(() => cliente.from("productos")
          .select("id,codigo_interno,referencia_proveedor,nombre,marca,categoria,publico,activo,orden,retirado_en," +
                  "variantes(id,codigo_variante,color,referencia_variante,precio,precio_anterior,activa,orden)")
          .order("orden").order("codigo_interno").order("id")),
        leerPaginado(() => cliente.rpc("fn_admin_tallas").select(COLUMNAS_TALLA).order("variante_id").order("id")),
        leerPaginado(() => cliente.from("catalogo_publico").select("codigoInterno,variantes").order("orden").order("codigoInterno"))
      ]);
      if (mia !== generacion) return;
      const fallo = respuestas.find((r) => r.error);
      if (fallo) {
        if (clasificar(fallo.error) === "sin-sesion") { await aplicarAcceso({ estado: "sin-sesion" }); return; }
        anunciarResultado({ titulo: "No se pudo exportar el catálogo", texto: "Falló la lectura de una de las páginas del inventario. No se descargó ningún archivo para no entregar un catálogo incompleto. Revisa tu conexión e inténtalo de nuevo.", tipo: "aviso" });
        return;
      }
      const productos = preparar(respuestas[0].data, respuestas[1].data, respuestas[2].data);
      const filas = filasCsv(productos);
      const nombre = `gama-talla-catalogo-${hoyEnColombia()}.csv`;
      descargarCsv(nombre, filas);
      const colores = productos.reduce((n, p) => n + p.variantes.length, 0);
      const tallas = productos.reduce((n, p) => n + p.variantes.reduce((m, v) => m + v.tallas.length, 0), 0);
      anunciarResultado({
        titulo: "Catálogo exportado",
        texto: `${nombre}: ${filas.length} ${filas.length === 1 ? "fila" : "filas"} con ${productos.length} ${productos.length === 1 ? "zapatilla" : "zapatillas"}, ${colores} ${colores === 1 ? "color" : "colores"} y ${tallas} ${tallas === 1 ? "talla" : "tallas"}, incluidas las ocultas y retiradas.`,
        tipo: "ok"
      });
    } finally {
      exportando = false;
      boton.disabled = ocupado;
      boton.removeAttribute("aria-busy");
      boton.textContent = "Exportar catálogo";
    }
  }

  // ------------------------------------------------------- puente con el editor
  function abrirEditor(productoId, disparador = null) {
    if (!window.GamaTallaEditor) {
      anunciarResultado({ titulo: "El editor no se pudo cargar", texto: "Recarga la página.", tipo: "aviso" });
      return;
    }
    quitarSeleccion();
    window.GamaTallaEditor.abrir(productoId, disparador);
  }

  // Lo mínimo que necesita editor.js; la sesión, el acceso y la recarga siguen siendo de aquí.
  window.GamaTallaPanel = Object.freeze({
    cliente: () => cliente,
    configuracion: () => configuracionPanel,
    comprobarAcceso,
    aplicarAcceso,
    generacion: () => generacion,
    ocupado: () => ocupado,
    recargar: () => cargarCatalogo({ conservarPosicion: true }),
    anunciar: anunciarResultado,
    productos: () => catalogo,
    vigenciaPredeterminada: () => vigenciaPredeterminada,
    fecha,
    valorTalla
  });

  // ------------------------------------------------------------------- arranque
  async function arrancar() {
    const configuracion = leerConfiguracion();
    if (!configuracion || !window.supabase?.createClient) { mostrar("configuracion"); return; }
    configuracionPanel = configuracion;
    cliente = window.supabase.createClient(configuracion.url, configuracion.clave, {
      auth: { storageKey: CLAVE_SESION, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });

    // Si Auth cierra la sesión (otra pestaña, token revocado), los datos desaparecen. La lógica
    // va fuera del callback: dentro de él no deben esperarse otras llamadas de Auth.
    cliente.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_OUT" && !cierreLocal && document.body.dataset.vista !== "ingreso") {
        setTimeout(() => { generacion += 1; mostrarIngreso("Tu sesión terminó. Vuelve a ingresar."); }, 0);
      }
    });

    $("#formulario-ingreso").addEventListener("submit", ingresar);
    $("#boton-ver-clave").addEventListener("click", alternarClave);
    $("#boton-ver-clave").setAttribute("aria-label", "Mostrar contraseña");
    $("#formulario-buscar").addEventListener("submit", (e) => e.preventDefault());
    $("#buscar").addEventListener("input", () => {
      clearTimeout(temporizadorBusqueda);
      temporizadorBusqueda = setTimeout(pintarCatalogo, 120);
    });
    $("#formulario-accion").addEventListener("submit", ejecutarAccion);
    // Mientras se aplica un cambio, el diálogo no se cierra con Escape.
    $("#dialogo-accion").addEventListener("cancel", (e) => { if (ocupado) e.preventDefault(); });
    $("#dialogo-accion").addEventListener("close", () => { if (!ocupado) accionAbierta = null; });
    document.addEventListener("click", (e) => {
      const talla = e.target.closest("#lista-productos .talla[data-talla-id]");
      if (talla) { alternarTalla(talla); return; }
      const botonFiltro = e.target.closest("#filtros [data-filtro]");
      if (botonFiltro) { if (!ocupado) { filtro = botonFiltro.dataset.filtro; pintarCatalogo(); } return; }
      const accion = e.target.closest("[data-accion]")?.dataset.accion;
      if (accion === "salir") { if (!ocupado) salir(); }
      else if (accion === "reintentar") entrar();
      else if (accion === "actualizar") { if (!ocupado) cargarCatalogo({ conservarPosicion: true }); }
      else if (accion === "historial") { if (!ocupado) alternarHistorial(); }
      else if (accion === "historial-mas") { if (!ocupado) cargarHistorial(false); }
      else if (accion === "historial-filtro") { if (!ocupado) elegirFiltroHistorial(e.target.closest("[data-historial-filtro]").dataset.historialFiltro); }
      else if (accion === "exportar") { if (!ocupado) exportarCatalogo(); }
      else if (accion in ACCIONES) abrirAccion(accion);
      else if (accion === "deseleccionar") { if (!ocupado) quitarSeleccion(); }
      else if (accion === "cancelar-dialogo") cerrarDialogo();
      else if (accion === "cerrar-resultado") { const caja = $("#resultado-accion"); caja.hidden = true; caja.replaceChildren(); }
      else if (accion === "nuevo-producto") { if (!ocupado) abrirEditor(null, e.target.closest("[data-accion]")); }
      else if (accion === "editar-producto") { const b = e.target.closest("[data-producto-id]"); if (!ocupado) abrirEditor(b.dataset.productoId, b); }
    });
    document.addEventListener("visibilitychange", revisarAlVolver);
    window.addEventListener("focus", revisarAlVolver);

    let habiaSesion = false;
    try { habiaSesion = Boolean(localStorage.getItem(CLAVE_SESION)); } catch { /* sin almacenamiento */ }
    let sesion = null;
    try {
      const { data } = await cliente.auth.getSession();
      sesion = data?.session || null;
    } catch { sesion = null; }
    if (!sesion) {
      mostrarIngreso(habiaSesion ? "Tu sesión terminó. Vuelve a ingresar." : "");
      return;
    }
    await entrar();
  }

  /* 16.3: filtros y leyenda plegables solo en celular. Desde 768 px se abren y su resumen se oculta
     (CSS), así el escritorio se ve como antes. En celular empiezan plegados. */
  function prepararPlegables() {
    const escritorio = window.matchMedia("(min-width: 768px)");
    const aplicar = () => document.querySelectorAll("[data-plegable]").forEach((d) => { d.open = escritorio.matches; });
    aplicar();
    escritorio.addEventListener("change", aplicar);
  }

  document.addEventListener("DOMContentLoaded", () => { prepararPlegables(); arrancar(); });
})();
