/* Panel privado de Gama & Talla · etapa 15A: ingreso y tablero de consulta.
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
    if (acceso.estado === "admin") return true;
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
    DISPONIBLE: { clase: "talla-disponible", texto: "disponible" },
    POR_REVISAR: { clase: "talla-revisar", texto: "por revisar" },
    AGOTADO: { clase: "talla-agotada", texto: "agotada" },
    OCULTA: { clase: "talla-oculta", texto: "no visible en la tienda" }
  };

  function limpiarTablero() {
    catalogo = [];
    const lista = $("#lista-productos");
    if (lista) lista.replaceChildren();
    for (const id of ["tablero-resumen", "tablero-estado", "barra-correo"]) {
      const nodo = $(`#${id}`);
      if (nodo) nodo.textContent = "";
    }
    const aviso = $("#tablero-aviso");
    if (aviso) { aviso.hidden = true; aviso.replaceChildren(); }
    const leyenda = $("#leyenda");
    if (leyenda) leyenda.hidden = true;
  }

  // Fotos: rutas del sitio («assets/...») o URLs http(s). Cualquier otra cosa se descarta.
  function urlFoto(ruta) {
    try {
      const url = new URL(String(ruta || ""), new URL("../", location.href));
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
    } catch { return null; }
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
      tallasPorVariante.get(t.variante_id).push(t); // ya vienen en orden numérico
    }
    return (productos || []).map((p) => {
      const variantes = [...(p.variantes || [])]
        .sort((a, b) => a.orden - b.orden || a.codigo_variante.localeCompare(b.codigo_variante))
        .map((v) => ({
          ...v,
          fotos: [...(v.fotos || [])].sort((a, b) => a.orden - b.orden),
          tallas: (tallasPorVariante.get(v.id) || []).map((t) => {
            const visible = p.activo && v.activa && t.activa;
            const estado = visible ? efectivo.get(`${v.codigo_variante}|${t.talla}`) : "OCULTA";
            return { talla: t.talla, estado: ESTADOS[estado] ? estado : "OCULTA" };
          })
        }));
      const busqueda = normalizar([p.codigo_interno, p.referencia_proveedor, p.marca, p.nombre,
        ...variantes.flatMap((v) => [v.codigo_variante, v.referencia_variante, v.color])].join(" "));
      return { ...p, variantes, busqueda };
    });
  }

  async function cargarCatalogo() {
    const mia = generacion;
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

      let respuestas;
      try {
        respuestas = await Promise.all([
          cliente.from("productos")
            .select("id,codigo_interno,referencia_proveedor,nombre,marca,categoria,activo,orden," +
                    "variantes(id,codigo_variante,color,referencia_variante,precio,precio_anterior,activa,orden,fotos(ruta,orden,alt))")
            .order("orden").order("codigo_interno"),
          cliente.rpc("fn_admin_tallas"),
          cliente.from("catalogo_publico").select("codigoInterno,variantes")
        ]);
      } catch {
        respuestas = [{ error: { status: 0 } }];
      }
      if (mia !== generacion) return;
      const fallo = respuestas.find((r) => r.error);
      if (fallo) {
        if (clasificar(fallo.error) === "sin-sesion") { await aplicarAcceso({ estado: "sin-sesion" }); return; }
        mostrarFalloCatalogo();
        return;
      }
      catalogo = preparar(respuestas[0].data, respuestas[1].data, respuestas[2].data);
      pintarCatalogo();
    } finally {
      if (mia === generacion) {
        $("#tablero").removeAttribute("aria-busy");
        $("#boton-actualizar").disabled = false;
      }
    }
  }

  function limpiarCatalogoVisible() {
    catalogo = [];
    $("#lista-productos").replaceChildren();
    $("#tablero-resumen").textContent = "";
    $("#tablero-estado").textContent = "";
    const aviso = $("#tablero-aviso");
    aviso.hidden = true;
    aviso.replaceChildren();
    $("#leyenda").hidden = true;
  }

  function avisoTablero({ titulo, texto, accion, rol = "status" }) {
    const aviso = $("#tablero-aviso");
    aviso.setAttribute("role", rol);
    const h = document.createElement("h2");
    h.textContent = titulo;
    const p = document.createElement("p");
    p.textContent = texto;
    aviso.replaceChildren(h, p);
    if (accion) {
      const boton = document.createElement("button");
      boton.type = "button";
      boton.className = "boton boton-secundario";
      boton.textContent = accion.texto;
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
    for (const p of catalogo) for (const v of p.variantes) for (const t of v.tallas) if (t.estado in conteo) conteo[t.estado] += 1;
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
      buscador.hidden = true;
      estado.textContent = "";
      avisoTablero({
        titulo: "Todavía no hay zapatillas en el catálogo",
        texto: "Cuando se carguen los productos aparecerán aquí, con sus colores, precios y tallas."
      });
      return;
    }

    buscador.hidden = false;
    $("#tablero-resumen").textContent = resumen();
    $("#leyenda").hidden = false;
    const consulta = normalizar($("#buscar").value);
    const visibles = consulta ? catalogo.filter((p) => p.busqueda.includes(consulta)) : catalogo;
    lista.replaceChildren(...visibles.map(tarjetaProducto));

    if (!visibles.length) {
      estado.textContent = "";
      avisoTablero({
        titulo: `Ninguna zapatilla coincide con «${$("#buscar").value.trim()}»`,
        texto: "Prueba con el código interno (GT-…), la referencia del proveedor, la marca o el nombre del modelo.",
        accion: { texto: "Limpiar búsqueda", alPulsar: () => { $("#buscar").value = ""; pintarCatalogo(); $("#buscar").focus(); } }
      });
      return;
    }
    estado.textContent = consulta
      ? `${visibles.length} de ${catalogo.length} ${catalogo.length === 1 ? "zapatilla coincide" : "zapatillas coinciden"} con la búsqueda.`
      : "";
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
    const publicado = nodo("p", `producto-estado ${p.activo ? "es-publicado" : "es-oculto"}`, p.activo ? "Publicado en la tienda" : "Oculto en la tienda");
    cuerpo.append(codigos, titulo, meta, publicado);

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
    const cabecera = nodo("div", "variante-cabecera");
    cabecera.append(nodo("span", "variante-color", v.color));
    cabecera.append(nodo("span", "codigo codigo-suave", v.codigo_variante));
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
    tallas.setAttribute("aria-label", `Tallas EU de ${p.nombre}, color ${v.color}`);
    for (const t of v.tallas) {
      const item = nodo("li");
      const chip = nodo("span", `talla ${ESTADOS[t.estado].clase}`, t.talla);
      chip.title = `Talla ${t.talla}: ${ESTADOS[t.estado].texto}`;
      chip.append(nodo("span", "solo-lectores", `, ${ESTADOS[t.estado].texto}`));
      item.append(chip);
      tallas.append(item);
    }
    li.append(tallas);
    return li;
  }

  // ------------------------------------------------------------------- arranque
  async function arrancar() {
    const configuracion = leerConfiguracion();
    if (!configuracion || !window.supabase?.createClient) { mostrar("configuracion"); return; }
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
    document.addEventListener("click", (e) => {
      const accion = e.target.closest("[data-accion]")?.dataset.accion;
      if (accion === "salir") salir();
      else if (accion === "reintentar") entrar();
      else if (accion === "actualizar") cargarCatalogo();
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

  document.addEventListener("DOMContentLoaded", arrancar);
})();
