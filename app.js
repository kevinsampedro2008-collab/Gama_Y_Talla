"use strict";

/* =========================================================
   GAMA & TALLA — Configuración central de la tienda.
   Cambia aquí los datos del negocio; el resto del sitio los
   toma de este objeto.
   ========================================================= */
const CONFIG = {
  tienda: "Gama & Talla",
  descripcion: "Tienda de zapatillas en Colombia. Explora el catálogo, consulta tallas y haz tu pedido por WhatsApp.",
  // PENDIENTE DE SUSTITUIR: indicativo del país + número, sin "+", espacios ni guiones.
  whatsapp: "573000000000",
  // PENDIENTE DE SUSTITUIR: URL completa del perfil y nombre de usuario (por ejemplo "@mitienda").
  instagramUrl: "https://www.instagram.com/",
  instagramUsuario: "",
  // PENDIENTE: escribe aquí el horario confirmado, por ejemplo "Lunes a sábado, 9:00 a. m. a 6:00 p. m.".
  horario: "",
  mensajeGeneral: "Hola, quiero consultar los modelos y tallas disponibles en Gama & Talla.",
  datosUrl: "data/productos.json",
  imagenRespaldo: "assets/images/branding/placeholder.svg"
};

const NUMERO_PROVISIONAL = "573000000000";
const TODOS = "Todos";
// Etiquetas que no deben mostrarse porque comunican atributos no confirmados.
const ETIQUETAS_NO_PERMITIDAS = ["exclusivo", "edicion limitada", "limitado", "mas vendido", "premium", "original", "unico", "coleccion"];

/* ---------- Utilidades ---------- */
const $ = (selector, raiz = document) => raiz.querySelector(selector);
const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

const normalizarTexto = (valor) => String(valor ?? "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const formatoPesos = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const pesos = (valor) => formatoPesos.format(valor).replace(/ /g, " ");
const formatearPrecio = (valor) => (valor > 0 ? pesos(valor) : "Precio por confirmar");

const animacionReducida = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function crearElemento(etiqueta, clase = "", texto = null) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== null) nodo.textContent = texto;
  return nodo;
}

function crearIcono(id) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "icono");
  svg.setAttribute("aria-hidden", "true");
  const uso = document.createElementNS("http://www.w3.org/2000/svg", "use");
  uso.setAttribute("href", `#${id}`);
  svg.append(uso);
  return svg;
}

/* ---------- WhatsApp ---------- */
const numeroWhatsApp = () => String(CONFIG.whatsapp).replace(/\D/g, "");

const crearEnlaceWhatsApp = (mensaje) =>
  `https://wa.me/${numeroWhatsApp()}?text=${encodeURIComponent(mensaje)}`;

function crearMensajePedido(producto, talla) {
  const precio = producto.precio > 0 ? `${pesos(producto.precio)} COP` : "Por confirmar";
  return [
    "Hola, estoy interesado en estas zapatillas.",
    "",
    `Modelo: ${producto.nombre}`,
    `Marca: ${producto.marca}`,
    `Color: ${producto.color}`,
    `Talla: ${talla}`,
    `Precio publicado: ${precio}`,
    `Código: ${producto.id}`,
    "",
    "¿Me puedes confirmar disponibilidad y proceso de compra?"
  ].join("\n");
}

/* ---------- Estado de la aplicación ---------- */
const estado = {
  productos: [],
  cargando: false,
  busqueda: "",
  marca: TODOS,
  categoria: TODOS,
  soloNuevos: false,
  orden: "destacados",
  tallas: new Map() // id del producto -> talla seleccionada
};

const ordenadores = {
  destacados: (a, b) => Number(b.destacado) - Number(a.destacado)
    || Number(b.disponible) - Number(a.disponible)
    || a.indice - b.indice,
  "precio-asc": (a, b) => a.precio - b.precio || a.indice - b.indice,
  "precio-desc": (a, b) => b.precio - a.precio || a.indice - b.indice,
  nombre: (a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
};

/* ---------- Normalización del JSON ---------- */
const textoLimpio = (valor, respaldo = "") => {
  const texto = typeof valor === "string" || typeof valor === "number" ? String(valor).trim() : "";
  return texto || respaldo;
};

function listaDeTallas(valor) {
  if (!Array.isArray(valor)) return [];
  return [...new Set(valor.map((talla) => textoLimpio(talla)).filter(Boolean))];
}

const compararTallas = (a, b) => {
  const diferencia = parseFloat(a.replace(",", ".")) - parseFloat(b.replace(",", "."));
  return Number.isNaN(diferencia) ? a.localeCompare(b, "es", { numeric: true }) : diferencia;
};

function etiquetaVisible(producto, badge) {
  if (producto.nuevoIngreso) return "Nuevo";
  const normalizada = normalizarTexto(badge);
  if (!normalizada || normalizada === "nuevo") return "";
  return ETIQUETAS_NO_PERMITIDAS.some((palabra) => normalizada.includes(palabra)) ? "" : badge;
}

function normalizarProducto(bruto, indice, idsUsados) {
  if (!bruto || typeof bruto !== "object") return null;

  let id = textoLimpio(bruto.id, `GT-${String(indice + 1).padStart(3, "0")}`);
  if (idsUsados.has(id)) {
    console.warn(`Código duplicado en productos.json: ${id}. Se renombró automáticamente.`);
    id = `${id}-${indice + 1}`;
  }
  idsUsados.add(id);

  const agotadas = listaDeTallas(bruto.tallasAgotadas);
  // Si una talla aparece en ambas listas, prevalece como agotada.
  const disponibles = listaDeTallas(bruto.tallasDisponibles).filter((talla) => !agotadas.includes(talla));

  const producto = {
    id,
    nombre: textoLimpio(bruto.nombre, "Modelo sin nombre"),
    marca: textoLimpio(bruto.marca, "Sin marca"),
    categoria: textoLimpio(bruto.categoria, "Sin categoría"),
    color: textoLimpio(bruto.color, "Por confirmar"),
    precio: Math.max(0, Math.round(Number(bruto.precio) || 0)),
    imagen: textoLimpio(bruto.imagen, CONFIG.imagenRespaldo),
    tallasDisponibles: disponibles.sort(compararTallas),
    tallasAgotadas: agotadas.sort(compararTallas),
    disponible: bruto.disponible !== false && disponibles.length > 0,
    destacado: bruto.destacado === true,
    nuevoIngreso: bruto.nuevoIngreso === true,
    indice
  };
  producto.badge = etiquetaVisible(producto, textoLimpio(bruto.badge));
  producto.textoBusqueda = normalizarTexto([producto.nombre, producto.marca, producto.color, producto.id].join(" "));
  return producto;
}

const buscarProducto = (id) => estado.productos.find((producto) => producto.id === id);

/* ---------- Configuración visible ---------- */
function aplicarConfiguracion() {
  const enlaceGeneral = crearEnlaceWhatsApp(CONFIG.mensajeGeneral);
  const abrirEnPestana = (enlace) => {
    enlace.target = "_blank";
    enlace.rel = "noopener noreferrer";
  };

  $$("[data-marca]").forEach((nodo) => { nodo.textContent = CONFIG.tienda; });
  $$("[data-descripcion]").forEach((nodo) => { nodo.textContent = CONFIG.descripcion; });
  $$("[data-wa]").forEach((enlace) => { enlace.href = enlaceGeneral; abrirEnPestana(enlace); });
  $$("[data-ig]").forEach((enlace) => { enlace.href = CONFIG.instagramUrl; abrirEnPestana(enlace); });
  $$("[data-ig-usuario]").forEach((nodo) => {
    nodo.textContent = CONFIG.instagramUsuario ? `Síguenos en ${CONFIG.instagramUsuario}.` : "Síguenos en Instagram.";
  });
  $$("[data-horario]").forEach((nodo) => {
    nodo.textContent = CONFIG.horario || "Consulta nuestro horario de atención por WhatsApp.";
  });
  $$("[data-anio]").forEach((nodo) => { nodo.textContent = String(new Date().getFullYear()); });

  if (numeroWhatsApp() === NUMERO_PROVISIONAL) {
    console.warn("Gama & Talla: el número de WhatsApp es provisional. Sustitúyelo en CONFIG.whatsapp (app.js).");
  }
}

/* ---------- Estados del catálogo ---------- */
const grilla = () => $("#grilla-productos");

function actualizarContador(texto) {
  const contador = $("#contador");
  if (contador) contador.textContent = texto;
}

function mostrarCarga() {
  const contenedor = grilla();
  if (!contenedor) return;
  const fragmento = document.createDocumentFragment();
  for (let i = 0; i < 6; i += 1) {
    const esqueleto = crearElemento("div", "tarjeta-esqueleto");
    esqueleto.setAttribute("aria-hidden", "true");
    esqueleto.append(crearElemento("span", "esqueleto-imagen"), crearElemento("span", "esqueleto-linea"), crearElemento("span", "esqueleto-linea corta"));
    fragmento.append(esqueleto);
  }
  contenedor.replaceChildren(fragmento);
  contenedor.setAttribute("aria-busy", "true");
  actualizarContador("Cargando catálogo…");
}

function mostrarEstado({ titulo, mensaje, textoBoton = "", accion = "" }) {
  const contenedor = grilla();
  if (!contenedor) return;
  const bloque = crearElemento("div", "estado-catalogo");
  bloque.setAttribute("role", "status");
  bloque.append(crearElemento("h3", "", titulo), crearElemento("p", "", mensaje));
  if (textoBoton) {
    const boton = crearElemento("button", "boton boton-secundario", textoBoton);
    boton.type = "button";
    boton.dataset.accion = accion;
    bloque.append(boton);
  }
  contenedor.replaceChildren(bloque);
  contenedor.setAttribute("aria-busy", "false");
}

/* ---------- Carga de productos ---------- */
async function cargarProductos() {
  if (estado.cargando) return;
  estado.cargando = true;
  mostrarCarga();
  try {
    const respuesta = await fetch(CONFIG.datosUrl, { cache: "no-cache" });
    if (!respuesta.ok) throw new Error(`Respuesta HTTP ${respuesta.status}`);
    const datos = await respuesta.json();
    const lista = Array.isArray(datos) ? datos : datos?.productos;
    if (!Array.isArray(lista)) throw new Error("El JSON no contiene una lista de productos.");

    const idsUsados = new Set();
    estado.productos = lista
      .map((bruto, indice) => normalizarProducto(bruto, indice, idsUsados))
      .filter(Boolean);
    construirFiltros();
    renderizarCatalogo();
  } catch (error) {
    console.error("No se pudo cargar el catálogo:", error);
    actualizarContador("Catálogo no disponible");
    const esArchivoLocal = window.location.protocol === "file:";
    mostrarEstado({
      titulo: "No pudimos cargar el catálogo",
      mensaje: esArchivoLocal
        ? "Abre el sitio con un servidor local (por ejemplo, Live Server); el navegador bloquea la lectura del catálogo desde file://."
        : "Ocurrió un problema al leer la lista de productos. Inténtalo de nuevo en unos segundos.",
      textoBoton: "Reintentar",
      accion: "reintentar"
    });
  } finally {
    estado.cargando = false;
  }
}

/* ---------- Filtros ---------- */
const valoresUnicos = (campo) => [...new Set(estado.productos.map((producto) => producto[campo]).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

function crearChip(tipo, valor, texto = valor) {
  const chip = crearElemento("button", "chip", texto);
  chip.type = "button";
  chip.dataset.filtro = tipo;
  chip.dataset.valor = valor;
  chip.setAttribute("aria-pressed", "false");
  return chip;
}

function construirFiltros() {
  const marcas = valoresUnicos("marca");
  const categorias = valoresUnicos("categoria");
  const hayNuevos = estado.productos.some((producto) => producto.nuevoIngreso);

  $("#filtro-marca")?.replaceChildren(...[TODOS, ...marcas].map((marca) => crearChip("marca", marca, marca === TODOS ? "Todas" : marca)));
  $("#filtro-categoria")?.replaceChildren(...[TODOS, ...categorias].map((categoria) => crearChip("categoria", categoria, categoria === TODOS ? "Todas" : categoria)));

  const grupoNuevos = $("#grupo-nuevos");
  if (grupoNuevos) grupoNuevos.hidden = !hayNuevos;
  if (!hayNuevos) estado.soloNuevos = false;

  // Accesos a categorías en la navegación lateral.
  const menuCategorias = $("#menu-categorias");
  const bloqueCategorias = $("#menu-categorias-bloque");
  if (menuCategorias && bloqueCategorias) {
    const elementos = [TODOS, ...categorias].map((categoria) => {
      const item = crearElemento("li");
      const boton = crearChip("categoria", categoria, categoria === TODOS ? "Todas las zapatillas" : categoria);
      boton.className = "menu-categoria";
      boton.dataset.desplazar = "true";
      item.append(boton);
      return item;
    });
    menuCategorias.replaceChildren(...elementos);
    bloqueCategorias.hidden = categorias.length === 0;
  }

  // Si un filtro activo ya no existe tras recargar, se restablece.
  if (!marcas.includes(estado.marca)) estado.marca = TODOS;
  if (!categorias.includes(estado.categoria)) estado.categoria = TODOS;

  const filtros = $("#filtros");
  if (filtros) filtros.hidden = estado.productos.length === 0;
  sincronizarFiltros();
}

function sincronizarFiltros() {
  $$("[data-filtro]").forEach((boton) => {
    const { filtro, valor } = boton.dataset;
    let activo = false;
    if (filtro === "marca") activo = valor === estado.marca;
    if (filtro === "categoria") activo = valor === estado.categoria;
    if (filtro === "nuevos") activo = estado.soloNuevos;
    boton.setAttribute("aria-pressed", String(activo));
    boton.classList.toggle("activo", activo);
  });
  const hayFiltros = estado.busqueda.trim() !== "" || estado.marca !== TODOS || estado.categoria !== TODOS || estado.soloNuevos;
  const limpiar = $("#limpiar-filtros");
  if (limpiar) limpiar.hidden = !hayFiltros;
}

function productosFiltrados() {
  const terminos = normalizarTexto(estado.busqueda).split(/\s+/).filter(Boolean);
  return estado.productos
    .filter((producto) => estado.marca === TODOS || producto.marca === estado.marca)
    .filter((producto) => estado.categoria === TODOS || producto.categoria === estado.categoria)
    .filter((producto) => !estado.soloNuevos || producto.nuevoIngreso)
    .filter((producto) => terminos.every((termino) => producto.textoBusqueda.includes(termino)))
    .sort(ordenadores[estado.orden] || ordenadores.destacados);
}

function limpiarFiltros() {
  estado.busqueda = "";
  estado.marca = TODOS;
  estado.categoria = TODOS;
  estado.soloNuevos = false;
  const buscar = $("#buscar");
  if (buscar) buscar.value = "";
  renderizarCatalogo();
}

/* ---------- Renderizado ---------- */
function renderizarCatalogo() {
  sincronizarFiltros();
  const contenedor = grilla();
  if (!contenedor) return;

  if (estado.productos.length === 0) {
    actualizarContador("0 productos");
    mostrarEstado({ titulo: "Aún no hay productos", mensaje: "Pronto publicaremos nuestro catálogo. Escríbenos por WhatsApp para consultar modelos y tallas." });
    return;
  }

  const lista = productosFiltrados();
  const total = estado.productos.length;
  const palabra = lista.length === 1 ? "producto" : "productos";
  actualizarContador(lista.length === total ? `${total} ${palabra}` : `${lista.length} de ${total} productos`);

  if (lista.length === 0) {
    mostrarEstado({
      titulo: "No encontramos productos",
      mensaje: "Prueba con otra búsqueda o quita algunos filtros para ver más zapatillas.",
      textoBoton: "Limpiar filtros",
      accion: "limpiar"
    });
    return;
  }

  const fragmento = document.createDocumentFragment();
  lista.forEach((producto) => fragmento.append(crearTarjeta(producto)));
  contenedor.replaceChildren(fragmento);
  contenedor.setAttribute("aria-busy", "false");
}

function crearImagen(producto) {
  const imagen = new Image(600, 600);
  imagen.loading = "lazy";
  imagen.decoding = "async";
  const esIlustracion = /\.svg($|\?)/i.test(producto.imagen);
  imagen.alt = esIlustracion
    ? `Ilustración provisional de las zapatillas ${producto.marca} ${producto.nombre}`
    : `Zapatillas ${producto.marca} ${producto.nombre}, color ${producto.color}`;
  imagen.addEventListener("error", () => {
    if (imagen.dataset.respaldo === "true") return;
    imagen.dataset.respaldo = "true";
    imagen.alt = `Imagen no disponible de ${producto.marca} ${producto.nombre}`;
    imagen.src = CONFIG.imagenRespaldo;
  });
  imagen.src = producto.imagen;
  return imagen;
}

function crearBotonTalla(talla, agotada, seleccionada) {
  const boton = crearElemento("button", `talla${agotada ? " talla-agotada" : ""}`, talla);
  boton.type = "button";
  boton.dataset.talla = talla;
  boton.disabled = agotada;
  boton.setAttribute("aria-pressed", String(seleccionada));
  boton.setAttribute("aria-label", agotada ? `Talla ${talla}, agotada` : `Talla ${talla}`);
  return boton;
}

function actualizarBotonPedido(enlace, producto, talla) {
  if (!enlace) return;
  const valido = producto.disponible && producto.tallasDisponibles.includes(talla);
  if (valido) {
    enlace.href = crearEnlaceWhatsApp(crearMensajePedido(producto, talla));
    enlace.removeAttribute("aria-disabled");
    enlace.classList.remove("pendiente");
  } else {
    enlace.href = `#producto-${producto.id}`;
    enlace.setAttribute("aria-disabled", "true");
    enlace.classList.add("pendiente");
  }
}

function crearTarjeta(producto) {
  const agotado = !producto.disponible;
  const tarjeta = crearElemento("article", `tarjeta${agotado ? " tarjeta-agotada" : ""}`);
  tarjeta.id = `producto-${producto.id}`;
  tarjeta.dataset.id = producto.id;
  const idTitulo = `nombre-${producto.id}`;
  tarjeta.setAttribute("aria-labelledby", idTitulo);

  // Imagen
  const media = crearElemento("div", "tarjeta-media");
  media.append(crearImagen(producto), crearElemento("span", "tarjeta-codigo", producto.id));
  if (producto.badge) media.append(crearElemento("span", "etiqueta", producto.badge));
  if (agotado) media.append(crearElemento("span", "etiqueta-agotado", "Agotado"));

  // Información
  const cuerpo = crearElemento("div", "tarjeta-cuerpo");
  const meta = crearElemento("p", "tarjeta-meta");
  meta.append(crearElemento("span", "", producto.marca), crearElemento("span", "", producto.categoria));
  const nombre = crearElemento("h3", "tarjeta-nombre", producto.nombre);
  nombre.id = idTitulo;
  const detalle = crearElemento("p", "tarjeta-detalle");
  detalle.append(crearElemento("span", "", producto.color), crearElemento("span", "", `Ref. ${producto.id}`));

  const lineaPrecio = crearElemento("div", "tarjeta-precio");
  lineaPrecio.append(
    crearElemento("p", "precio", formatearPrecio(producto.precio)),
    crearElemento("p", `disponibilidad${agotado ? " no" : ""}`, agotado ? "Agotado" : "Disponible")
  );

  // Tallas
  const bloqueTallas = crearElemento("div", "tarjeta-tallas");
  const idEtiquetaTallas = `tallas-${producto.id}`;
  const etiquetaTallas = crearElemento("p", "tallas-titulo", agotado ? "Sin tallas disponibles" : "Tallas disponibles");
  etiquetaTallas.id = idEtiquetaTallas;
  const tallas = crearElemento("div", "tallas");
  tallas.setAttribute("role", "group");
  tallas.setAttribute("aria-labelledby", `${idEtiquetaTallas} ${idTitulo}`);

  let tallaElegida = estado.tallas.get(producto.id) || "";
  if (!producto.tallasDisponibles.includes(tallaElegida)) {
    estado.tallas.delete(producto.id);
    tallaElegida = "";
  }
  [
    ...producto.tallasDisponibles.map((talla) => [talla, false]),
    ...producto.tallasAgotadas.map((talla) => [talla, true])
  ]
    .sort((a, b) => compararTallas(a[0], b[0]))
    .forEach(([talla, agotada]) => tallas.append(crearBotonTalla(talla, agotada, talla === tallaElegida)));

  bloqueTallas.append(etiquetaTallas);
  if (tallas.childElementCount > 0) bloqueTallas.append(tallas);
  if (producto.tallasAgotadas.length > 0 && !agotado) {
    bloqueTallas.append(crearElemento("p", "tallas-nota", "Las tallas tachadas están agotadas."));
  }

  const aviso = crearElemento("p", "tarjeta-aviso", tallaElegida ? `Talla ${tallaElegida} seleccionada.` : "");
  aviso.setAttribute("aria-live", "polite");

  // Botón de pedido
  let accion;
  if (agotado) {
    accion = crearElemento("button", "boton-pedido", "Producto agotado");
    accion.type = "button";
    accion.disabled = true;
  } else {
    accion = crearElemento("a", "boton-pedido");
    accion.append(crearIcono("icono-whatsapp"), document.createTextNode("Pedir por WhatsApp"));
    accion.target = "_blank";
    accion.rel = "noopener noreferrer";
    accion.dataset.accion = "pedir";
    actualizarBotonPedido(accion, producto, tallaElegida);
  }

  cuerpo.append(meta, nombre, detalle, lineaPrecio, bloqueTallas, aviso, accion);
  tarjeta.append(media, cuerpo);
  return tarjeta;
}

function mostrarAviso(tarjeta, mensaje, esError = false) {
  const aviso = $(".tarjeta-aviso", tarjeta);
  if (!aviso) return;
  aviso.textContent = mensaje;
  aviso.classList.toggle("error", esError);
}

/* ---------- Eventos ---------- */
function seleccionarTalla(tarjeta, producto, botonTalla) {
  const talla = botonTalla.dataset.talla;
  if (botonTalla.disabled || !producto.disponible || !producto.tallasDisponibles.includes(talla)) {
    mostrarAviso(tarjeta, "Esa talla está agotada. Elige otra talla disponible.", true);
    return;
  }
  estado.tallas.set(producto.id, talla);
  $$(".talla", tarjeta).forEach((boton) => boton.setAttribute("aria-pressed", String(boton === botonTalla)));
  mostrarAviso(tarjeta, `Talla ${talla} seleccionada.`);
  actualizarBotonPedido($("[data-accion='pedir']", tarjeta), producto, talla);
}

function validarPedido(evento, tarjeta, producto, enlace) {
  if (!producto) {
    evento.preventDefault();
    mostrarAviso(tarjeta, "No encontramos este producto. Recarga la página e inténtalo de nuevo.", true);
    return;
  }
  if (!producto.disponible) {
    evento.preventDefault();
    mostrarAviso(tarjeta, "Este producto está agotado y no se puede pedir por ahora.", true);
    return;
  }
  const talla = estado.tallas.get(producto.id);
  if (!talla || !producto.tallasDisponibles.includes(talla)) {
    evento.preventDefault();
    mostrarAviso(tarjeta, "Selecciona una talla disponible para hacer tu pedido.", true);
    $(".talla:not(:disabled)", tarjeta)?.focus();
    return;
  }
  // Se regenera el enlace justo antes de abrir WhatsApp para garantizar datos actualizados.
  actualizarBotonPedido(enlace, producto, talla);
}

function iniciarCatalogo() {
  const buscar = $("#buscar");
  const orden = $("#orden");
  const contenedor = grilla();

  buscar?.addEventListener("input", (evento) => {
    estado.busqueda = evento.target.value;
    renderizarCatalogo();
  });

  orden?.addEventListener("change", (evento) => {
    estado.orden = ordenadores[evento.target.value] ? evento.target.value : "destacados";
    renderizarCatalogo();
  });

  $("#limpiar-filtros")?.addEventListener("click", limpiarFiltros);

  // Un único manejador para chips de filtros y accesos del menú.
  document.addEventListener("click", (evento) => {
    const boton = evento.target.closest("[data-filtro]");
    if (!boton) return;
    const { filtro, valor } = boton.dataset;
    if (filtro === "marca") estado.marca = valor;
    if (filtro === "categoria") estado.categoria = valor;
    if (filtro === "nuevos") estado.soloNuevos = !estado.soloNuevos;
    renderizarCatalogo();
    if (boton.dataset.desplazar === "true") {
      cerrarMenu();
      $("#catalogo")?.scrollIntoView({ behavior: animacionReducida() ? "auto" : "smooth", block: "start" });
    }
  });

  // Delegación de eventos en la grilla: tallas, pedidos y acciones de estado.
  contenedor?.addEventListener("click", (evento) => {
    const accion = evento.target.closest("[data-accion]");
    if (accion?.dataset.accion === "reintentar") { cargarProductos(); return; }
    if (accion?.dataset.accion === "limpiar") { limpiarFiltros(); return; }

    const tarjeta = evento.target.closest(".tarjeta");
    if (!tarjeta) return;
    const producto = buscarProducto(tarjeta.dataset.id);

    const botonTalla = evento.target.closest(".talla");
    if (botonTalla && producto) { seleccionarTalla(tarjeta, producto, botonTalla); return; }

    if (accion?.dataset.accion === "pedir") validarPedido(evento, tarjeta, producto, accion);
  });
}

/* ---------- Menú móvil ---------- */
let cerrarMenu = () => {};

function iniciarMenu() {
  const boton = $("#boton-menu");
  const menu = $("#menu-principal");
  const cabecera = $("#cabecera");
  if (!boton || !menu || !cabecera) return;

  const escritorio = window.matchMedia("(min-width: 1024px)");
  const cambiarMenu = (abrir) => {
    cabecera.classList.toggle("menu-abierto", abrir);
    document.body.classList.toggle("menu-activo", abrir);
    boton.setAttribute("aria-expanded", String(abrir));
    boton.setAttribute("aria-label", abrir ? "Cerrar menú" : "Abrir menú");
  };
  cerrarMenu = () => cambiarMenu(false);

  boton.addEventListener("click", () => cambiarMenu(boton.getAttribute("aria-expanded") !== "true"));
  menu.addEventListener("click", (evento) => {
    if (evento.target.closest("a")) cerrarMenu();
  });
  document.addEventListener("click", (evento) => {
    if (cabecera.classList.contains("menu-abierto") && !cabecera.contains(evento.target)) cerrarMenu();
  });
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && cabecera.classList.contains("menu-abierto")) {
      cerrarMenu();
      boton.focus();
    }
  });
  escritorio.addEventListener("change", (consulta) => { if (consulta.matches) cerrarMenu(); });
}

/* ---------- Inicio ---------- */
function iniciar() {
  try {
    aplicarConfiguracion();
    iniciarMenu();
    iniciarCatalogo();
  } catch (error) {
    console.error("Error al iniciar la página:", error);
  }
  cargarProductos();
}

iniciar();
