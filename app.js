"use strict";

/* UMBRAL — cambia estos datos antes de publicar. WhatsApp: indicativo + número, sin + ni espacios. */
const CONFIG = {
  tienda: "Umbral",
  descripcion: "Una selección de sneakers para moverse distinto.",
  whatsapp: "573000000000",
  instagramUrl: "https://www.instagram.com/tu_tienda/",
  instagramUser: "@tu_tienda",
  horario: "",
  mensajeGeneral: "Hola, quiero consultar los sneakers disponibles.",
  datosUrl: "data/productos.json",
  imagenRespaldo: "assets/images/branding/placeholder.svg"
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const normalizarTexto = (valor) => String(valor ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const formatoNumero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const formatoPrecio = (valor) => `$ ${formatoNumero.format(Number(valor) || 0)}`;
const crear = (tag, clase = "", texto = null) => {
  const nodo = document.createElement(tag);
  if (clase) nodo.className = clase;
  if (texto !== null) nodo.textContent = texto;
  return nodo;
};
const crearIcono = (id) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#${id}`);
  svg.append(use);
  return svg;
};
const crearEnlaceWhatsApp = (mensaje) =>
  `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(mensaje)}`;
const crearMensajePedido = (producto, talla) => [
  `Hola, estoy interesado en estas zapatillas de ${CONFIG.tienda}:`,
  "",
  `Modelo: ${producto.nombre}`,
  `Marca: ${producto.marca}`,
  `Color: ${producto.color}`,
  `Talla: ${talla}`,
  `Precio publicado: ${formatoNumero.format(producto.precio)} COP`,
  `Código: ${producto.id}`,
  "",
  "¿Me confirmas la disponibilidad y el proceso de compra?"
].join("\n");

const estado = {
  productos: [],
  busqueda: "",
  categoria: "Todos",
  orden: "destacados",
  tallas: new Map()
};

const ordenadores = {
  destacados: (a, b) => Number(b.destacado) - Number(a.destacado) || Number(b.nuevoIngreso) - Number(a.nuevoIngreso) || a._indice - b._indice,
  "precio-asc": (a, b) => a.precio - b.precio,
  "precio-desc": (a, b) => b.precio - a.precio,
  nombre: (a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
};

function normalizarProducto(producto, indice) {
  const disponibles = Array.isArray(producto.tallasDisponibles) ? producto.tallasDisponibles.map(String) : [];
  const agotadas = Array.isArray(producto.tallasAgotadas) ? producto.tallasAgotadas.map(String) : [];
  const normalizado = {
    ...producto,
    id: String(producto.id ?? `SKU-${indice + 1}`),
    nombre: String(producto.nombre ?? "Modelo sin nombre"),
    marca: String(producto.marca ?? ""),
    categoria: String(producto.categoria ?? "Lifestyle"),
    color: String(producto.color ?? ""),
    precio: Math.max(0, Number(producto.precio) || 0),
    imagen: String(producto.imagen ?? CONFIG.imagenRespaldo),
    tallasDisponibles: disponibles.filter((t) => !agotadas.includes(t)),
    tallasAgotadas: agotadas,
    badge: String(producto.badge ?? ""),
    disponible: producto.disponible !== false && disponibles.some((t) => !agotadas.includes(t)),
    destacado: Boolean(producto.destacado),
    nuevoIngreso: Boolean(producto.nuevoIngreso),
    _indice: indice
  };
  normalizado._busqueda = normalizarTexto([
    normalizado.id, normalizado.nombre, normalizado.marca,
    normalizado.categoria, normalizado.color
  ].join(" "));
  return normalizado;
}

function aplicarConfiguracion() {
  $$('[data-marca]').forEach((nodo) => { nodo.textContent = CONFIG.tienda.toLowerCase(); });
  $$('[data-desc]').forEach((nodo) => { nodo.textContent = CONFIG.descripcion; });
  $$('[data-wa]').forEach((enlace) => {
    enlace.href = crearEnlaceWhatsApp(CONFIG.mensajeGeneral);
    enlace.target = "_blank";
    enlace.rel = "noopener noreferrer";
  });
  $$('[data-ig]').forEach((enlace) => {
    enlace.href = CONFIG.instagramUrl;
    enlace.target = "_blank";
    enlace.rel = "noopener noreferrer";
  });
  $$('[data-ig-user]').forEach((nodo) => { nodo.textContent = CONFIG.instagramUser; });
  $$('[data-horario]').forEach((nodo) => {
    nodo.textContent = CONFIG.horario || "Escríbenos por WhatsApp para confirmar el horario de atención.";
  });
  $$('[data-year]').forEach((nodo) => { nodo.textContent = String(new Date().getFullYear()); });
}

function mostrarEstado(titulo, mensaje, textoBoton = "", accion = "") {
  const grid = $("#grid");
  const bloque = crear("div", "catalog-state");
  bloque.setAttribute("role", "status");
  bloque.append(crear("h3", "", titulo), crear("p", "", mensaje));
  if (textoBoton) {
    const boton = crear("button", "button button-dark", textoBoton);
    boton.type = "button";
    boton.dataset.accion = accion;
    bloque.append(boton);
  }
  grid.replaceChildren(bloque);
  grid.setAttribute("aria-busy", "false");
}

function mostrarCarga() {
  const grid = $("#grid");
  const bloque = crear("div", "catalog-state");
  const spinner = crear("span", "spinner");
  spinner.setAttribute("aria-hidden", "true");
  bloque.append(spinner, crear("p", "", "Cargando selección…"));
  grid.replaceChildren(bloque);
  grid.setAttribute("aria-busy", "true");
  $("#contador").textContent = "Cargando selección…";
}

async function cargarProductos() {
  mostrarCarga();
  try {
    const respuesta = await fetch(CONFIG.datosUrl, { cache: "no-cache" });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const datos = await respuesta.json();
    const lista = Array.isArray(datos) ? datos : datos.productos;
    if (!Array.isArray(lista)) throw new Error("El JSON no contiene una lista de productos.");
    estado.productos = lista.map(normalizarProducto);
    construirFiltros();
    aplicarFiltros();
  } catch (error) {
    console.error("No se pudo cargar el catálogo:", error);
    $("#contador").textContent = "Catálogo no disponible";
    mostrarEstado("No pudimos cargar el catálogo", "Comprueba que data/productos.json exista y abre el proyecto mediante un servidor local.", "Reintentar", "reintentar");
  }
}

function listaCategorias() {
  const categorias = new Set(["Todos"]);
  estado.productos.forEach((p) => { if (p.marca) categorias.add(p.marca); });
  estado.productos.forEach((p) => { if (p.categoria) categorias.add(p.categoria); });
  if (estado.productos.some((p) => p.nuevoIngreso)) categorias.add("Nuevos ingresos");
  return [...categorias];
}

function crearBotonCategoria(nombre, lateral = false) {
  const boton = crear("button", lateral ? "side-filter" : "chip", nombre === "Todos" && lateral ? "Todos los sneakers" : nombre);
  boton.type = "button";
  boton.dataset.cat = nombre;
  boton.setAttribute("aria-pressed", String(nombre === estado.categoria));
  if (nombre === estado.categoria) boton.classList.add(lateral ? "is-active" : "is-active");
  if (lateral) {
    const flecha = crear("span", "", "↗");
    boton.append(flecha);
  }
  return boton;
}

function construirFiltros() {
  const categorias = listaCategorias();
  const chips = $("#chips");
  const lateral = $("#side-categories");
  const botonesChips = categorias.map((categoria) => crearBotonCategoria(categoria));
  const botonesLaterales = categorias.filter((categoria) => categoria !== "Todos").map((categoria) => crearBotonCategoria(categoria, true));
  chips.replaceChildren(...botonesChips);
  lateral.replaceChildren(...botonesLaterales);
  actualizarCategoriasActivas();
}

function categoriaCoincide(producto, categoria) {
  if (categoria === "Todos") return true;
  if (categoria === "Nuevos ingresos") return producto.nuevoIngreso;
  return producto.marca === categoria || producto.categoria === categoria;
}

function actualizarCategoriasActivas() {
  $$('[data-cat]').forEach((boton) => {
    const activo = boton.dataset.cat === estado.categoria;
    boton.setAttribute("aria-pressed", String(activo));
    boton.classList.toggle("is-active", activo);
  });
}

function aplicarFiltros() {
  const terminos = normalizarTexto(estado.busqueda).split(/\s+/).filter(Boolean);
  const lista = estado.productos
    .filter((producto) => categoriaCoincide(producto, estado.categoria) && terminos.every((termino) => producto._busqueda.includes(termino)))
    .sort(ordenadores[estado.orden] || ordenadores.destacados);

  const total = estado.productos.length;
  $("#contador").textContent = `${lista.length} ${lista.length === 1 ? "modelo" : "modelos"}${lista.length !== total ? ` de ${total}` : ""}`;
  if (lista.length === 0) {
    mostrarEstado("No encontramos ese modelo", "Prueba con otra búsqueda o elimina los filtros para ver toda la selección.", "Limpiar filtros", "limpiar");
    return;
  }

  const fragmento = document.createDocumentFragment();
  lista.forEach((producto) => fragmento.append(crearTarjeta(producto)));
  $("#grid").replaceChildren(fragmento);
  $("#grid").setAttribute("aria-busy", "false");
}

function crearTallaBoton(talla, agotada, seleccionada, sinStock) {
  const boton = crear("button", "size-btn", talla);
  boton.type = "button";
  boton.dataset.talla = talla;
  boton.disabled = agotada || sinStock;
  boton.setAttribute("aria-pressed", String(seleccionada));
  boton.setAttribute("aria-label", `Talla ${talla}${agotada || sinStock ? ", agotada" : ""}`);
  return boton;
}

function actualizarEnlacePedido(enlace, producto, talla) {
  if (talla && producto.disponible && producto.tallasDisponibles.includes(talla)) {
    enlace.href = crearEnlaceWhatsApp(crearMensajePedido(producto, talla));
    enlace.removeAttribute("aria-disabled");
  } else {
    enlace.href = "#catalogo";
    enlace.setAttribute("aria-disabled", "true");
  }
}

function crearTarjeta(producto) {
  const sinStock = !producto.disponible;
  const tarjeta = crear("article", `card${sinStock ? " agotado" : ""}`);
  tarjeta.dataset.id = producto.id;

  const media = crear("div", "media");
  media.append(crear("span", "product-code", producto.id));
  if (producto.badge) {
    media.append(crear("span", `badge${normalizarTexto(producto.badge) === "exclusivo" ? " excl" : ""}`, producto.badge));
  }
  const imagen = new Image(600, 600);
  imagen.loading = "lazy";
  imagen.decoding = "async";
  imagen.alt = `${producto.marca} ${producto.nombre}, color ${producto.color}`;
  imagen.addEventListener("error", () => {
    if (imagen.dataset.fallback !== "true") {
      imagen.dataset.fallback = "true";
      imagen.src = CONFIG.imagenRespaldo;
    }
  });
  imagen.src = producto.imagen || CONFIG.imagenRespaldo;
  media.append(imagen);

  const cuerpo = crear("div", "card-body");
  const kicker = crear("div", "product-kicker");
  kicker.append(crear("span", "", producto.marca), crear("span", "", producto.categoria));
  const nombre = crear("h3", "", producto.nombre);
  const color = crear("p", "product-color", producto.color);
  const lineaPrecio = crear("div", "price-line");
  const precio = crear("p", "price");
  precio.append(document.createTextNode(formatoPrecio(producto.precio) + " "));
  precio.append(crear("small", "", "COP"));
  lineaPrecio.append(precio, crear("p", `stock${sinStock ? " no" : ""}`, sinStock ? "Agotado" : "Disponible"));

  const etiquetaTallas = crear("p", "size-label", sinStock ? "Sin tallas disponibles" : "Selecciona tu talla");
  const contenedorTallas = crear("div", "sizes");
  contenedorTallas.setAttribute("role", "group");
  contenedorTallas.setAttribute("aria-label", `Tallas de ${producto.nombre}`);
  const tallaElegida = estado.tallas.get(producto.id) || "";
  const todasLasTallas = [
    ...producto.tallasDisponibles.map((talla) => [talla, false]),
    ...producto.tallasAgotadas.map((talla) => [talla, true])
  ].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
  todasLasTallas.forEach(([talla, agotada]) => {
    contenedorTallas.append(crearTallaBoton(talla, agotada, tallaElegida === talla, sinStock));
  });

  const avisoTalla = crear("p", "size-hint", "");
  avisoTalla.setAttribute("aria-live", "polite");
  let cta;
  if (sinStock) {
    cta = crear("button", "card-cta", "Actualmente agotado");
    cta.type = "button";
    cta.disabled = true;
  } else {
    cta = crear("a", "card-cta");
    cta.append(document.createTextNode("Pedir por WhatsApp"), crearIcono("icon-chat"));
    cta.target = "_blank";
    cta.rel = "noopener noreferrer";
    cta.dataset.accion = "pedir";
    actualizarEnlacePedido(cta, producto, tallaElegida);
  }

  cuerpo.append(kicker, nombre, color, lineaPrecio, etiquetaTallas, contenedorTallas, avisoTalla, cta);
  tarjeta.append(media, cuerpo);
  return tarjeta;
}

function limpiarFiltros() {
  estado.busqueda = "";
  estado.categoria = "Todos";
  estado.orden = "destacados";
  $("#buscar").value = "";
  $("#orden").value = "destacados";
  actualizarCategoriasActivas();
  aplicarFiltros();
}

function iniciarCatalogo() {
  $("#buscar").addEventListener("input", (evento) => {
    estado.busqueda = evento.target.value;
    aplicarFiltros();
  });
  $("#orden").addEventListener("change", (evento) => {
    estado.orden = evento.target.value;
    aplicarFiltros();
  });

  document.addEventListener("click", (evento) => {
    const filtro = evento.target.closest("[data-cat]");
    if (filtro) {
      estado.categoria = filtro.dataset.cat;
      actualizarCategoriasActivas();
      aplicarFiltros();
      return;
    }

    const accion = evento.target.closest("[data-accion]");
    if (accion?.dataset.accion === "reintentar") {
      cargarProductos();
      return;
    }
    if (accion?.dataset.accion === "limpiar") {
      limpiarFiltros();
      return;
    }

    const tarjeta = evento.target.closest(".card");
    if (!tarjeta) return;
    const producto = estado.productos.find((p) => p.id === tarjeta.dataset.id);
    if (!producto) return;
    const ayuda = $(".size-hint", tarjeta);
    const botonTalla = evento.target.closest(".size-btn");

    if (botonTalla && !botonTalla.disabled) {
      const talla = botonTalla.dataset.talla;
      if (!producto.disponible || !producto.tallasDisponibles.includes(talla)) return;
      estado.tallas.set(producto.id, talla);
      $$(".size-btn", tarjeta).forEach((boton) => boton.setAttribute("aria-pressed", String(boton === botonTalla)));
      ayuda.textContent = "";
      actualizarEnlace($("[data-accion='pedir']", tarjeta), producto, talla);
      return;
    }

    if (accion?.dataset.accion === "pedir" && accion.getAttribute("aria-disabled") === "true") {
      evento.preventDefault();
      ayuda.textContent = "Selecciona una talla disponible para continuar.";
    }
  });
}

function iniciarMenu() {
  const boton = $("#menu-btn");
  const menu = $("#mobile-menu");
  if (!boton || !menu) return;
  const cambiarMenu = (abrir) => {
    menu.classList.toggle("open", abrir);
    boton.setAttribute("aria-expanded", String(abrir));
    boton.setAttribute("aria-label", abrir ? "Cerrar menú" : "Abrir menú");
  };
  boton.addEventListener("click", () => cambiarMenu(!menu.classList.contains("open")));
  menu.addEventListener("click", (evento) => {
    if (evento.target.closest("a")) cambiarMenu(false);
  });
  document.addEventListener("click", (evento) => {
    if (menu.classList.contains("open") && !evento.target.closest(".mobile-head")) cambiarMenu(false);
  });
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && menu.classList.contains("open")) {
      cambiarMenu(false);
      boton.focus();
    }
  });
}

function iniciarAccesos() {
  const buscar = $("#buscar");
  const botonBuscar = $("#search-focus");
  if (botonBuscar && buscar) {
    botonBuscar.addEventListener("click", () => {
      document.querySelector("#catalogo").scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => buscar.focus({ preventScroll: true }), 350);
    });
  }
}

aplicarConfiguracion();
iniciarMenu();
iniciarCatalogo();
iniciarAccesos();
cargarProductos();
