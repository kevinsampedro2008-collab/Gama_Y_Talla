"use strict";

/* =========================================================
   GAMA & TALLA — catálogo, guía de tallas y carrito.
   Edita los datos comerciales en CONFIG y los productos en
   data/productos.json. Los productos incluidos son ejemplos.
   ========================================================= */
const CONFIG = {
  tienda: "Gama & Talla",
  descripcion: "Tienda de zapatillas en Colombia. Explora el catálogo, consulta tallas y arma tu pedido por WhatsApp.",
  whatsapp: "573000000000", // Sustituir por el número real antes de publicar.
  horario: "",
  mensajeGeneral: "Hola, quiero consultar los modelos y tallas disponibles en Gama & Talla.",
  datosUrl: "data/productos.json",
  imagenRespaldo: "assets/images/branding/placeholder.svg",
  claveCarrito: "gama-talla-carrito-v2",
  cantidadMaxima: 10,
  limiteEnlaceWhatsApp: 3000
};

const NUMERO_PROVISIONAL = "573000000000";
const TODOS = "Todos";
const $ = (selector, raiz = document) => raiz.querySelector(selector);
const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];
const formatoNumero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const normalizarTexto = (valor) => String(valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const limpiarTexto = (valor, respaldo = "") => {
  const texto = typeof valor === "string" || typeof valor === "number" ? String(valor).trim() : "";
  return texto || respaldo;
};
const pesos = (valor) => formatoMoneda.format(Number(valor) || 0).replace(/\u00a0/g, " ");
const precioMensaje = (valor) => Number(valor) > 0 ? `$${formatoNumero.format(Number(valor))} COP` : "Por confirmar";
const formatearPrecio = (valor) => Number(valor) > 0 ? pesos(valor) : "Precio por confirmar";
const animacionReducida = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const grilla = () => $("#grilla-productos");
const productoPorId = (id) => estado.productos.find((producto) => producto.id === id);
const claveLinea = (id, talla) => `${id}__${talla}`;

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
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#${id}`);
  svg.append(use);
  return svg;
}

function crearBoton(clase, contenido, datos = {}) {
  const boton = crearElemento("button", clase);
  boton.type = "button";
  (Array.isArray(contenido) ? contenido : [contenido]).forEach((parte) => {
    boton.append(typeof parte === "string" ? document.createTextNode(parte) : parte);
  });
  Object.assign(boton.dataset, datos);
  return boton;
}

function abrirWhatsApp(mensaje) {
  const numero = String(CONFIG.whatsapp).replace(/\D/g, "");
  if (!numero || numero === NUMERO_PROVISIONAL) {
    mostrarAvisoFlotante("El número de WhatsApp todavía es provisional. Actualízalo en CONFIG antes de publicar.", false);
    return false;
  }
  window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, "_blank", "noopener,noreferrer");
  return true;
}

const enlaceWhatsApp = (mensaje) => `https://wa.me/${String(CONFIG.whatsapp).replace(/\D/g, "")}?text=${encodeURIComponent(mensaje)}`;

function mensajePedidoProducto(producto, talla, cantidad = 1) {
  const subt = producto.precio > 0 ? precioMensaje(producto.precio * cantidad) : "Por confirmar";
  return [
    `Hola, quiero consultar este pedido en ${CONFIG.tienda}:`, "",
    `Modelo: ${nombreCompleto(producto)}`,
    `Color: ${producto.color}`,
    `Código: ${producto.id}`,
    `Talla: EU ${talla}`,
    `Cantidad: ${cantidad}`,
    `Precio unitario: ${precioMensaje(producto.precio)}`,
    `Subtotal: ${subt}`,
    "Envío: por confirmar", "",
    "¿Me confirmas disponibilidad, precio final y proceso de compra?"
  ].join("\n");
}

function nombreCompleto(producto) {
  const nombre = normalizarTexto(producto.nombre);
  const marca = normalizarTexto(producto.marca);
  return nombre.includes(marca) ? producto.nombre : `${producto.marca} ${producto.nombre}`;
}

const estado = {
  productos: [],
  guias: {},
  firmaDatos: "",
  catalogoListo: false,
  cargando: false,
  busqueda: "",
  marca: TODOS,
  categoria: TODOS,
  soloNuevos: false,
  orden: "destacados",
  tallas: new Map(),
  detalle: null,
  carrito: []
};

const ordenadores = {
  destacados: (a, b) => Number(b.destacado) - Number(a.destacado) || Number(b.disponible) - Number(a.disponible) || a.indice - b.indice,
  "precio-asc": (a, b) => a.precio - b.precio || a.indice - b.indice,
  "precio-desc": (a, b) => b.precio - a.precio || a.indice - b.indice,
  nombre: (a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
};

function listaDeTallas(valor) {
  if (!Array.isArray(valor)) return [];
  return [...new Set(valor.map((talla) => limpiarTexto(talla).replace(/^eu\s*/i, "")).filter(Boolean))];
}

function compararTallas(a, b) {
  const numeroA = Number(String(a).replace(",", "."));
  const numeroB = Number(String(b).replace(",", "."));
  if (Number.isFinite(numeroA) && Number.isFinite(numeroB)) return numeroA - numeroB;
  return String(a).localeCompare(String(b), "es", { numeric: true });
}

function normalizarProducto(bruto, indice, idsUsados) {
  if (!bruto || typeof bruto !== "object") return null;
  let id = limpiarTexto(bruto.id, `GT-${String(indice + 1).padStart(3, "0")}`);
  if (idsUsados.has(id)) id = `${id}-${indice + 1}`;
  idsUsados.add(id);

  const agotadas = listaDeTallas(bruto.tallasAgotadas);
  const disponibles = listaDeTallas(bruto.tallasDisponibles).filter((talla) => !agotadas.includes(talla)).sort(compararTallas);
  const producto = {
    id,
    nombre: limpiarTexto(bruto.nombre, "Modelo sin nombre"),
    marca: limpiarTexto(bruto.marca, "Marca por confirmar"),
    categoria: limpiarTexto(bruto.categoria, "Otras"),
    color: limpiarTexto(bruto.color, "Por confirmar"),
    precio: Math.max(0, Math.round(Number(bruto.precio) || 0)),
    precioAnterior: Math.max(0, Math.round(Number(bruto.precioAnterior) || 0)),
    imagen: limpiarTexto(bruto.imagen, CONFIG.imagenRespaldo),
    tallasDisponibles: disponibles,
    tallasAgotadas: agotadas.sort(compararTallas),
    disponible: bruto.disponible !== false && disponibles.length > 0,
    destacado: bruto.destacado === true,
    nuevoIngreso: bruto.nuevoIngreso === true,
    indice
  };
  producto.descuento = producto.precio > 0 && producto.precioAnterior > producto.precio ? Math.round((1 - producto.precio / producto.precioAnterior) * 100) : 0;
  // Evita mostrar reclamos comerciales no confirmados. Solo mostramos «Nuevo» si el campo lo indica.
  producto.badge = producto.nuevoIngreso ? "Nuevo" : "";
  producto.textoBusqueda = normalizarTexto([producto.nombre, producto.marca, producto.color, producto.categoria, producto.id].join(" "));
  return producto;
}

function normalizarGuias(datos) {
  const guias = {};
  if (!datos || typeof datos !== "object") return guias;
  Object.entries(datos).forEach(([marca, bruto]) => {
    if (!bruto || typeof bruto !== "object") return;
    const tallas = {};
    if (bruto.tallas && typeof bruto.tallas === "object") {
      Object.entries(bruto.tallas).forEach(([talla, medida]) => {
        if (!medida || typeof medida !== "object") return;
        tallas[String(talla)] = {
          cm: limpiarTexto(medida.cm),
          colombia: limpiarTexto(medida.colombia),
          us: limpiarTexto(medida.us)
        };
      });
    }
    guias[normalizarTexto(marca)] = {
      marca,
      verificada: bruto.verificada === true,
      usaGuiaDe: limpiarTexto(bruto.usaGuiaDe),
      fuente: limpiarTexto(bruto.fuente),
      url: /^https:\/\//i.test(limpiarTexto(bruto.url)) ? limpiarTexto(bruto.url) : "",
      urlAlterna: /^https:\/\//i.test(limpiarTexto(bruto.urlAlterna)) ? limpiarTexto(bruto.urlAlterna) : "",
      nota: limpiarTexto(bruto.nota),
      tallas
    };
  });
  return guias;
}

function guiaDeMarca(marca) {
  const propia = estado.guias[normalizarTexto(marca)];
  if (!propia) return null;
  if (propia.usaGuiaDe) {
    const base = estado.guias[normalizarTexto(propia.usaGuiaDe)];
    if (base) {
      return {
        ...base,
        verificada: propia.verificada && base.verificada,
        nota: propia.nota || base.nota,
        fuente: propia.fuente || base.fuente,
        url: propia.url || base.url,
        marcaBase: base.marca
      };
    }
  }
  return propia;
}

function orientacionTalla(producto, talla) {
  const guia = guiaDeMarca(producto.marca);
  if (!guia || !guia.verificada) {
    return { verificada: false, texto: `No tenemos una equivalencia nacional verificada para ${producto.marca}. Confirma la talla de este modelo con el vendedor.` };
  }
  const medida = guia.tallas[String(talla)];
  if (!medida) {
    return { verificada: false, texto: `La talla EU ${talla} no aparece en la tabla disponible. Confirma la equivalencia con el vendedor.` };
  }
  const partes = [];
  if (medida.colombia) partes.push(`talla Colombia ${medida.colombia}`);
  if (medida.cm) partes.push(`${medida.cm} cm de largo de pie`);
  if (medida.us) partes.push(`US hombre ${medida.us}`);
  const texto = medida.colombia
    ? `Según las guías oficiales consultadas de ${guia.marcaBase || guia.marca}, EU ${talla} corresponde a ${partes.join(" · ")}. La horma puede variar según el modelo.`
    : `La guía global de ${guia.marcaBase || guia.marca} indica EU ${talla}${medida.cm ? ` y ${medida.cm} cm de largo de pie` : ""}${medida.us ? ` (US hombre ${medida.us})` : ""}, pero la tabla colombiana consultada no publica una equivalencia nacional para esta talla. Confirma con el vendedor.`;
  return { verificada: true, texto, url: guia.url, urlAlterna: guia.urlAlterna, fuente: guia.fuente };
}

function aplicarConfiguracion() {
  $$('[data-marca]').forEach((nodo) => { nodo.textContent = CONFIG.tienda; });
  $$('[data-descripcion]').forEach((nodo) => { nodo.textContent = CONFIG.descripcion; });
  $$('[data-wa]').forEach((enlace) => {
    enlace.href = String(CONFIG.whatsapp).replace(/\D/g, "") === NUMERO_PROVISIONAL
      ? "#contacto"
      : enlaceWhatsApp(CONFIG.mensajeGeneral);
    enlace.target = "_blank";
    enlace.rel = "noopener noreferrer";
  });
  $$('[data-horario]').forEach((nodo) => {
    nodo.textContent = CONFIG.horario || "Consulta nuestro horario de atención por WhatsApp.";
  });
  $$('[data-anio]').forEach((nodo) => { nodo.textContent = String(new Date().getFullYear()); });
  if (String(CONFIG.whatsapp).replace(/\D/g, "") === NUMERO_PROVISIONAL) {
    console.warn("Gama & Talla: el número de WhatsApp es provisional. Cámbialo en CONFIG.whatsapp antes de publicar.");
  }
}

function actualizarContador(texto) {
  const nodo = $("#contador");
  if (nodo) nodo.textContent = texto;
}

function mostrarCarga() {
  const contenedor = grilla();
  if (!contenedor) return;
  const fragmento = document.createDocumentFragment();
  for (let i = 0; i < 6; i += 1) {
    const tarjeta = crearElemento("div", "tarjeta-esqueleto");
    tarjeta.setAttribute("aria-hidden", "true");
    tarjeta.append(crearElemento("span", "esqueleto-imagen"), crearElemento("span", "esqueleto-linea"), crearElemento("span", "esqueleto-linea corta"));
    fragmento.append(tarjeta);
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
  if (textoBoton) bloque.append(crearBoton("boton boton-claro", textoBoton, { accion }));
  contenedor.replaceChildren(bloque);
  contenedor.setAttribute("aria-busy", "false");
}

async function leerCatalogo() {
  const respuesta = await fetch(CONFIG.datosUrl, { cache: "no-cache" });
  if (!respuesta.ok) throw new Error(`Respuesta HTTP ${respuesta.status}`);
  const texto = await respuesta.text();
  const datos = JSON.parse(texto);
  const lista = Array.isArray(datos) ? datos : datos?.productos;
  if (!Array.isArray(lista)) throw new Error("El JSON no contiene una lista de productos.");
  const idsUsados = new Set();
  return {
    firma: texto,
    productos: lista.map((bruto, indice) => normalizarProducto(bruto, indice, idsUsados)).filter(Boolean),
    guias: normalizarGuias(datos?.guiasTallas)
  };
}

function aplicarCatalogo(catalogo) {
  const cambio = catalogo.firma !== estado.firmaDatos;
  estado.firmaDatos = catalogo.firma;
  estado.productos = catalogo.productos;
  estado.guias = catalogo.guias;
  estado.catalogoListo = true;
  return cambio;
}

async function cargarProductos() {
  if (estado.cargando) return;
  estado.cargando = true;
  mostrarCarga();
  try {
    aplicarCatalogo(await leerCatalogo());
    construirFiltros();
    renderizarCatalogo();
    validarCarrito(false);
  } catch (error) {
    console.error("No se pudo cargar el catálogo:", error);
    actualizarContador("Catálogo no disponible");
    mostrarEstado({
      titulo: "No pudimos cargar las zapatillas",
      mensaje: window.location.protocol === "file:" ? "Abre la página con Live Server en Visual Studio Code. El navegador bloquea la lectura del JSON al abrir el HTML directamente." : "Ocurrió un problema al leer el catálogo. Comprueba tu conexión e inténtalo de nuevo.",
      textoBoton: "Reintentar",
      accion: "reintentar"
    });
  } finally {
    estado.cargando = false;
  }
}

async function refrescarCatalogo() {
  try {
    const cambio = aplicarCatalogo(await leerCatalogo());
    if (cambio) {
      construirFiltros();
      renderizarCatalogo();
      validarCarrito(false);
    }
    return true;
  } catch (error) {
    console.warn("No se pudo actualizar el catálogo:", error);
    return estado.catalogoListo;
  }
}

const valoresUnicos = (campo) => [...new Set(estado.productos.map((producto) => producto[campo]).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

function crearChip(tipo, valor, texto = valor) {
  const chip = crearBoton("chip", texto, { filtro: tipo, valor });
  chip.setAttribute("aria-pressed", "false");
  return chip;
}

function construirFiltros() {
  const marcas = valoresUnicos("marca");
  const categorias = valoresUnicos("categoria");
  const grupo = $("#filtros");
  if (grupo) grupo.hidden = estado.productos.length === 0;

  $("#filtro-marca")?.replaceChildren(...[TODOS, ...marcas].map((marca) => crearChip("marca", marca, marca === TODOS ? "Todas las marcas" : marca)));
  $("#filtro-categoria")?.replaceChildren(...[TODOS, ...categorias].map((categoria) => crearChip("categoria", categoria, categoria === TODOS ? "Todas las categorías" : categoria)));
  const hayNuevos = estado.productos.some((producto) => producto.nuevoIngreso);
  const chipNuevos = $("#chip-nuevos");
  if (chipNuevos) chipNuevos.hidden = !hayNuevos;
  if (!hayNuevos) estado.soloNuevos = false;
  if (!marcas.includes(estado.marca)) estado.marca = TODOS;
  if (!categorias.includes(estado.categoria)) estado.categoria = TODOS;
  sincronizarFiltros();
}

function sincronizarFiltros() {
  $$('[data-filtro]').forEach((boton) => {
    const tipo = boton.dataset.filtro;
    const valor = boton.dataset.valor;
    const activo = tipo === "marca" ? valor === estado.marca
      : tipo === "categoria" ? valor === estado.categoria
        : tipo === "nuevos" ? estado.soloNuevos : false;
    boton.setAttribute("aria-pressed", String(activo));
    boton.classList.toggle("activo", activo);
  });
  const hayFiltros = Boolean(estado.busqueda.trim()) || estado.marca !== TODOS || estado.categoria !== TODOS || estado.soloNuevos;
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
  if ($("#buscar")) $("#buscar").value = "";
  sincronizarFiltros();
  renderizarCatalogo();
}

function renderizarCatalogo() {
  sincronizarFiltros();
  const contenedor = grilla();
  if (!contenedor) return;
  if (!estado.productos.length) {
    actualizarContador("0 productos");
    mostrarEstado({ titulo: "Aún no hay productos", mensaje: "Pronto publicaremos nuestro catálogo. Escríbenos por WhatsApp para consultar modelos y tallas." });
    return;
  }
  const lista = productosFiltrados();
  actualizarContador(lista.length === estado.productos.length
    ? `${lista.length} ${lista.length === 1 ? "producto" : "productos"}`
    : `${lista.length} de ${estado.productos.length} productos`);
  if (!lista.length) {
    mostrarEstado({ titulo: "No encontramos zapatillas", mensaje: "Prueba con otra búsqueda o elimina algunos filtros.", textoBoton: "Limpiar filtros", accion: "limpiar" });
    return;
  }
  const fragmento = document.createDocumentFragment();
  lista.forEach((producto) => fragmento.append(crearTarjeta(producto)));
  contenedor.replaceChildren(fragmento);
  contenedor.setAttribute("aria-busy", "false");
}

function crearImagen(producto, { perezosa = true } = {}) {
  const imagen = new Image(600, 390);
  if (perezosa) imagen.loading = "lazy";
  imagen.decoding = "async";
  imagen.alt = `Ilustración provisional de zapatillas ${nombreCompleto(producto)}, color ${producto.color}`;
  imagen.addEventListener("error", () => {
    if (imagen.dataset.respaldo === "true") return;
    imagen.dataset.respaldo = "true";
    imagen.alt = `Imagen de respaldo para ${nombreCompleto(producto)}`;
    imagen.src = CONFIG.imagenRespaldo;
  });
  imagen.src = producto.imagen;
  return imagen;
}

function crearTarjeta(producto) {
  const agotado = !producto.disponible;
  const tarjeta = crearElemento("article", `tarjeta${agotado ? " tarjeta-agotada" : ""}`);
  tarjeta.dataset.id = producto.id;
  tarjeta.dataset.tono = String(producto.indice % 4);

  const botonImagen = crearBoton("tarjeta-media", crearImagen(producto), { accion: "detalles" });
  botonImagen.setAttribute("aria-label", `Ver detalles de ${nombreCompleto(producto)}`);
  if (agotado) botonImagen.append(crearElemento("span", "etiqueta etiqueta-agotado", "Agotado"));
  else if (producto.descuento) {
    const oferta = crearElemento("span", "etiqueta-oferta");
    oferta.append(crearElemento("span", "etiqueta-oferta-sello", "SALE"), crearElemento("span", "etiqueta-oferta-porcentaje", `-${producto.descuento}%`));
    botonImagen.append(oferta);
  } else if (producto.badge) botonImagen.append(crearElemento("span", "etiqueta", producto.badge));

  const cuerpo = crearElemento("div", "tarjeta-cuerpo");
  const marca = crearElemento("p", "tarjeta-marca", producto.marca);
  const nombre = crearElemento("h3", "tarjeta-nombre", producto.nombre);
  const precio = crearElemento("div", "precio precio-oferta");
  precio.append(crearElemento("span", "precio-actual", formatearPrecio(producto.precio)));
  if (producto.descuento) {
    precio.append(crearElemento("del", "precio-anterior", formatearPrecio(producto.precioAnterior)));
    precio.append(crearElemento("span", "precio-ahorro", `${producto.descuento}% OFF`));
  }
  const acciones = crearElemento("div", "tarjeta-acciones");
  const detalle = crearBoton("boton boton-principal boton-compacto boton-detalles", "Ver detalles", { accion: "detalles" });
  detalle.setAttribute("aria-label", `Ver detalles de ${nombreCompleto(producto)}`);
  acciones.append(detalle);
  const talla = estado.tallas.get(producto.id);
  if (tallaValida(producto, talla)) {
    const rapido = crearBoton("boton-rapido", [crearIcono("icono-mas"), `EU ${talla}`], { accion: "rapido", talla });
    rapido.setAttribute("aria-label", `Añadir ${nombreCompleto(producto)}, talla EU ${talla}, al carrito`);
    rapido.title = "Añadir al carrito con la talla seleccionada";
    acciones.append(rapido);
  }
  cuerpo.append(marca, nombre, precio, acciones);
  tarjeta.append(botonImagen, cuerpo);
  return tarjeta;
}

/* ---------- Diálogos y foco ---------- */
const origenesFoco = new WeakMap();
const modalProducto = () => $("#modal-producto");
const carritoDialogo = () => $("#carrito");

function abrirDialogo(dialogo, origen = document.activeElement) {
  if (!dialogo || dialogo.open) return;
  origenesFoco.set(dialogo, origen instanceof HTMLElement ? origen : null);
  cerrarMenu();
  dialogo.showModal();
  document.documentElement.classList.add("sin-desplazamiento");
}

function cerrarDialogo(dialogo) {
  if (dialogo?.open) dialogo.close();
}

function iniciarDialogos() {
  $$("dialog.modal").forEach((dialogo) => {
    dialogo.addEventListener("click", (evento) => {
      if (evento.target === dialogo || evento.target.closest("[data-cerrar]")) cerrarDialogo(dialogo);
    });
    dialogo.addEventListener("close", () => {
      if (!$$("dialog.modal").some((otro) => otro.open)) document.documentElement.classList.remove("sin-desplazamiento");
      const origen = origenesFoco.get(dialogo);
      if (origen?.isConnected) origen.focus({ preventScroll: true });
    });
  });
}

function tallaValida(producto, talla) {
  return Boolean(producto && producto.disponible && talla && producto.tallasDisponibles.includes(String(talla)));
}

function obtenerTallaRecordada(producto) {
  const talla = estado.tallas.get(producto.id) || "";
  if (talla && !tallaValida(producto, talla)) {
    estado.tallas.delete(producto.id);
    return "";
  }
  return talla;
}

function crearSelectorCantidad(valor, etiqueta, datos = {}, maximo = CONFIG.cantidadMaxima) {
  const grupo = crearElemento("div", "cantidad");
  grupo.setAttribute("role", "group");
  grupo.setAttribute("aria-label", etiqueta);
  const menos = crearBoton("cantidad-boton", crearIcono("icono-menos"), { ...datos, paso: "-1" });
  menos.disabled = valor <= 1;
  menos.setAttribute("aria-label", "Disminuir cantidad");
  const numero = crearElemento("output", "cantidad-valor", String(valor));
  numero.setAttribute("aria-live", "polite");
  const mas = crearBoton("cantidad-boton", crearIcono("icono-mas"), { ...datos, paso: "1" });
  mas.disabled = valor >= maximo;
  mas.setAttribute("aria-label", "Aumentar cantidad");
  grupo.append(menos, numero, mas);
  return grupo;
}

function renderizarDetalle({ selectorFoco = "" } = {}) {
  const contenedor = $("#detalle-contenido");
  const producto = estado.detalle && productoPorId(estado.detalle.id);
  if (!contenedor || !producto) return;
  const agotado = !producto.disponible;
  const talla = obtenerTallaRecordada(producto);
  const cantidad = estado.detalle.cantidad;

  const media = crearElemento("div", "detalle-media");
  media.dataset.tono = String(producto.indice % 4);
  media.append(crearImagen(producto, { perezosa: false }));
  if (agotado) media.append(crearElemento("span", "etiqueta etiqueta-agotado", "Agotado"));
  else if (producto.descuento) media.append(crearElemento("span", "detalle-rebaja", `OFERTA · ${producto.descuento}% OFF`));

  const info = crearElemento("div", "detalle-info");
  const cabecera = crearElemento("div", "detalle-cabecera");
  cabecera.append(crearElemento("p", "sobretitulo", `${producto.marca} · ${producto.categoria}`));
  const titulo = crearElemento("h2", "detalle-nombre", producto.nombre);
  titulo.id = "detalle-nombre";
  const precioDetalle = crearElemento("div", "detalle-precio detalle-precio-oferta");
  precioDetalle.append(crearElemento("span", "", formatearPrecio(producto.precio)));
  if (producto.descuento) {
    precioDetalle.append(crearElemento("del", "precio-anterior", formatearPrecio(producto.precioAnterior)));
    precioDetalle.append(crearElemento("span", "precio-ahorro", `${producto.descuento}% OFF`));
  }
  cabecera.append(titulo, precioDetalle);

  const ficha = crearElemento("dl", "detalle-ficha");
  [["Color", producto.color], ["Referencia", producto.id], ["Disponibilidad", agotado ? "Agotado" : "Disponible"]].forEach(([clave, valor]) => {
    const fila = crearElemento("div");
    fila.append(crearElemento("dt", "", clave), crearElemento("dd", clave === "Disponibilidad" ? `estado-stock${agotado ? " no" : ""}` : "", valor));
    ficha.append(fila);
  });

  const bloqueTallas = crearElemento("div", "detalle-tallas");
  const encabezadoTallas = crearElemento("div", "detalle-tallas-titulo");
  encabezadoTallas.append(crearElemento("p", "", agotado ? "Sin tallas disponibles" : "Elige tu talla (EU)"));
  encabezadoTallas.lastChild.id = "etiqueta-tallas";
  const guia = crearBoton("boton-texto", [crearIcono("icono-regla"), "Guía de tallas"], { abrirGuia: "", marcaGuia: producto.marca });
  encabezadoTallas.append(guia);
  const tallas = crearElemento("div", "tallas");
  tallas.setAttribute("role", "group");
  tallas.setAttribute("aria-labelledby", "etiqueta-tallas");
  [...producto.tallasDisponibles.map((valor) => [valor, false]), ...producto.tallasAgotadas.map((valor) => [valor, true])]
    .sort((a, b) => compararTallas(a[0], b[0]))
    .forEach(([valor, sinStock]) => {
      const boton = crearBoton(`talla${sinStock ? " talla-agotada" : ""}`, `EU ${valor}`, { talla: valor });
      boton.disabled = sinStock || agotado;
      boton.setAttribute("aria-pressed", String(valor === talla));
      boton.setAttribute("aria-label", sinStock || agotado ? `EU ${valor}, agotada` : `EU ${valor}`);
      tallas.append(boton);
    });
  bloqueTallas.append(encabezadoTallas, tallas);
  if (producto.tallasAgotadas.length) bloqueTallas.append(crearElemento("p", "tallas-nota", "Las tallas tachadas están agotadas."));

  const orientacion = crearElemento("div", "orientacion");
  orientacion.setAttribute("aria-live", "polite");
  if (talla) {
    const datos = orientacionTalla(producto, talla);
    orientacion.classList.add(datos.verificada ? "verificada" : "pendiente");
    orientacion.append(crearElemento("p", "orientacion-talla", `Talla seleccionada: EU ${talla}`), crearElemento("p", "orientacion-texto", datos.texto));
    if (datos.url) {
      const fuente = crearElemento("a", "orientacion-fuente", `Consultar guía de ${producto.marca}`);
      fuente.href = datos.url;
      fuente.target = "_blank";
      fuente.rel = "noopener noreferrer";
      orientacion.append(fuente);
    }
    if (datos.urlAlterna) {
      const fuenteAlterna = crearElemento("a", "orientacion-fuente", "Ver tabla global de la marca");
      fuenteAlterna.href = datos.urlAlterna;
      fuenteAlterna.target = "_blank";
      fuenteAlterna.rel = "noopener noreferrer";
      orientacion.append(fuenteAlterna);
    }
  } else if (!agotado) {
    orientacion.append(crearElemento("p", "orientacion-texto", "Selecciona una talla EU para consultar la orientación disponible para esta marca."));
  }

  const aviso = crearElemento("p", "detalle-aviso");
  aviso.id = "detalle-aviso";
  aviso.setAttribute("role", "status");
  const acciones = crearElemento("div", "detalle-acciones");
  if (agotado) {
    const botonAgotado = crearBoton("boton boton-claro boton-ancho", "Producto agotado");
    botonAgotado.disabled = true;
    acciones.append(botonAgotado);
  } else {
    const filaCompra = crearElemento("div", "detalle-compra");
    filaCompra.append(crearSelectorCantidad(cantidad, "Cantidad", { cantidadDetalle: "" }));
    filaCompra.append(crearBoton("boton boton-principal boton-ancho", [crearIcono("icono-bolsa"), "Añadir al carrito"], { accion: "agregar" }));
    const pedir = crearBoton("boton boton-whatsapp-suave boton-ancho", [crearIcono("icono-whatsapp-solido"), "Pedir este par por WhatsApp"], { accion: "pedir-ahora" });
    acciones.append(filaCompra, pedir);
  }

  info.append(cabecera, ficha, bloqueTallas, orientacion, aviso, acciones);
  contenedor.replaceChildren(media, info);
  if (selectorFoco) $(selectorFoco, contenedor)?.focus();
}

function abrirDetalles(id, origen) {
  const producto = productoPorId(id);
  if (!producto) return;
  estado.detalle = { id, cantidad: 1 };
  renderizarDetalle();
  abrirDialogo(modalProducto(), origen);
}

function mostrarAvisoDetalle(mensaje) {
  const nodo = $("#detalle-aviso");
  if (nodo) nodo.textContent = mensaje;
}

function renderizarGuia(marcaDestacada = "") {
  const contenedor = $("#guia-marcas");
  if (!contenedor) return;
  const marcas = valoresUnicos("marca");
  if (marcaDestacada && marcas.includes(marcaDestacada)) {
    marcas.splice(marcas.indexOf(marcaDestacada), 1);
    marcas.unshift(marcaDestacada);
  }
  if (!marcas.length) {
    contenedor.replaceChildren(crearElemento("p", "guia-vacia", "Las guías aparecerán cuando cargue el catálogo."));
    return;
  }

  const bloques = marcas.map((marca) => {
    const guia = guiaDeMarca(marca);
    const verificada = Boolean(guia?.verificada && Object.keys(guia.tallas || {}).length);
    const bloque = crearElemento("section", `guia-marca${marca === marcaDestacada ? " destacada" : ""}`);
    const cabecera = crearElemento("div", "guia-marca-cabecera");
    cabecera.append(crearElemento("h3", "", marca), crearElemento("span", `sello ${verificada ? "sello-ok" : "sello-pendiente"}`, verificada ? "Tabla consultada" : "Por confirmar"));
    bloque.append(cabecera);
    if (!verificada) {
      bloque.append(crearElemento("p", "", guia?.nota || `Aún no hay equivalencias verificadas para ${marca}.`));
      if (guia?.url) {
        const enlace = crearElemento("a", "orientacion-fuente", "Consultar guía de la marca");
        enlace.href = guia.url;
        enlace.target = "_blank";
        enlace.rel = "noopener noreferrer";
        bloque.append(enlace);
      }
      bloque.append(crearElemento("p", "guia-consulta", "Confirma la talla de este modelo con el vendedor por WhatsApp."));
      return bloque;
    }

    const tabla = crearElemento("table", "guia-tabla");
    const thead = crearElemento("thead");
    const filaCab = crearElemento("tr");
    ["Talla EU", "Talla Colombia", "Pie (cm)", "US hombre"].forEach((texto) => {
      const th = crearElemento("th", "", texto); th.scope = "col"; filaCab.append(th);
    });
    thead.append(filaCab);
    const tbody = crearElemento("tbody");
    Object.keys(guia.tallas).sort(compararTallas).forEach((talla) => {
      const dato = guia.tallas[talla];
      const fila = crearElemento("tr");
      const th = crearElemento("th", "", `EU ${talla}`); th.scope = "row";
      fila.append(th, crearElemento("td", "", dato.colombia || "—"), crearElemento("td", "", dato.cm ? `${dato.cm} cm` : "—"), crearElemento("td", "", dato.us || "—"));
      tbody.append(fila);
    });
    tabla.append(thead, tbody);
    const envoltura = crearElemento("div", "guia-tabla-envoltura");
    envoltura.append(tabla);
    bloque.append(envoltura);
    if (guia.nota) bloque.append(crearElemento("p", "guia-fuente", guia.nota));
    if (guia.url) {
      const fuente = crearElemento("a", "orientacion-fuente", "Ver guía oficial de Nike Colombia");
      fuente.href = guia.url; fuente.target = "_blank"; fuente.rel = "noopener noreferrer"; bloque.append(fuente);
    }
    if (guia.urlAlterna) {
      const fuenteAlterna = crearElemento("a", "orientacion-fuente", "Ver guía global de Nike");
      fuenteAlterna.href = guia.urlAlterna; fuenteAlterna.target = "_blank"; fuenteAlterna.rel = "noopener noreferrer"; bloque.append(fuenteAlterna);
    }
    return bloque;
  });
  contenedor.replaceChildren(...bloques);
}

function abrirGuia(origen, marca = "") {
  renderizarGuia(marca);
  abrirDialogo($("#guia-tallas"), origen);
}

/* ---------- Carrito ---------- */
function leerCarritoGuardado() {
  try {
    const datos = JSON.parse(window.localStorage.getItem(CONFIG.claveCarrito) || "[]");
    if (!Array.isArray(datos)) return [];
    const lineas = new Map();
    datos.forEach((linea) => {
      const id = limpiarTexto(linea?.id);
      const talla = limpiarTexto(linea?.talla).replace(/^eu\s*/i, "");
      const cantidad = Math.floor(Number(linea?.cantidad));
      if (!id || !talla || !(cantidad > 0)) return;
      const clave = claveLinea(id, talla);
      const previa = lineas.get(clave);
      lineas.set(clave, { id, talla, cantidad: Math.min(CONFIG.cantidadMaxima, (previa?.cantidad || 0) + cantidad) });
    });
    return [...lineas.values()];
  } catch (error) {
    console.warn("No se pudo leer el carrito guardado:", error);
    return [];
  }
}

function guardarCarrito() {
  try { localStorage.setItem(CONFIG.claveCarrito, JSON.stringify(estado.carrito)); }
  catch (error) { console.warn("No se pudo guardar el carrito:", error); }
}

const unidadesCarrito = () => estado.carrito.reduce((suma, linea) => suma + linea.cantidad, 0);

function actualizarInsignia() {
  const unidades = unidadesCarrito();
  const insignia = $("#insignia-carrito");
  if (insignia) { insignia.textContent = unidades > 99 ? "99+" : String(unidades); insignia.hidden = unidades === 0; }
  $("#boton-carrito")?.setAttribute("aria-label", `Abrir carrito, ${unidades} ${unidades === 1 ? "unidad" : "unidades"}`);
}

function notificarCarrito(mensaje) {
  const nodo = $("#carrito-notificacion");
  if (!nodo) return;
  nodo.textContent = mensaje;
  nodo.hidden = !mensaje;
}

function validarCarrito(notificar = true) {
  if (!estado.catalogoListo) return [];
  const retirados = [];
  estado.carrito = estado.carrito.filter((linea) => {
    const producto = productoPorId(linea.id);
    if (tallaValida(producto, linea.talla)) return true;
    retirados.push(producto ? `${nombreCompleto(producto)} (EU ${linea.talla})` : `${linea.id} (EU ${linea.talla})`);
    return false;
  });
  if (retirados.length) {
    guardarCarrito();
    if (notificar) notificarCarrito(`Retiramos del carrito los productos que ya no están disponibles: ${retirados.join(", ")}.`);
  }
  actualizarInsignia();
  if (carritoDialogo()?.open) renderizarCarrito();
  return retirados;
}

function agregarAlCarrito(id, talla, cantidad = 1) {
  const producto = productoPorId(id);
  if (!tallaValida(producto, talla)) {
    mostrarAvisoFlotante("Esa talla ya no está disponible. Elige otra talla.", false);
    return false;
  }
  const unidades = Math.max(1, Math.min(CONFIG.cantidadMaxima, Math.floor(Number(cantidad) || 1)));
  const existente = estado.carrito.find((linea) => linea.id === id && linea.talla === String(talla));
  if (existente) {
    const total = existente.cantidad + unidades;
    existente.cantidad = Math.min(CONFIG.cantidadMaxima, total);
    if (total > CONFIG.cantidadMaxima) mostrarAvisoFlotante(`Máximo ${CONFIG.cantidadMaxima} unidades por talla.`, true);
    else mostrarAvisoFlotante(`${nombreCompleto(producto)} · EU ${talla} actualizado en el carrito.`, true);
  } else {
    estado.carrito.push({ id, talla: String(talla), cantidad: unidades });
    mostrarAvisoFlotante(`${nombreCompleto(producto)} · EU ${talla} añadido al carrito.`, true);
  }
  guardarCarrito();
  actualizarInsignia();
  animarInsignia();
  return true;
}

function resumenCarrito(lineas) {
  const unidades = lineas.reduce((suma, linea) => suma + linea.cantidad, 0);
  const conPrecio = lineas.filter((linea) => linea.producto.precio > 0);
  const subtotal = conPrecio.reduce((suma, linea) => suma + linea.producto.precio * linea.cantidad, 0);
  return { unidades, subtotal, hayPorConfirmar: conPrecio.length < lineas.length, todosPorConfirmar: conPrecio.length === 0 };
}

function lineasCarrito() {
  return estado.carrito.map((linea) => ({ ...linea, producto: productoPorId(linea.id) }))
    .filter((linea) => tallaValida(linea.producto, linea.talla));
}

function crearMensajeCarrito(lineas) {
  const resumen = resumenCarrito(lineas);
  const partes = [`Hola, quiero consultar el siguiente pedido en ${CONFIG.tienda}:`, ""];
  lineas.forEach((linea, indice) => {
    const producto = linea.producto;
    partes.push(
      `*Producto ${indice + 1}*`,
      `- Modelo: ${nombreCompleto(producto)}`,
      `- Color: ${producto.color}`,
      `- Código: ${producto.id}`,
      `- Talla: EU ${linea.talla}`,
      `- Cantidad: ${linea.cantidad}`,
      `- Precio unitario: ${precioMensaje(producto.precio)}`,
      `- Subtotal: ${producto.precio > 0 ? precioMensaje(producto.precio * linea.cantidad) : "Por confirmar"}`,
      ""
    );
  });
  let subtotal = precioMensaje(resumen.subtotal);
  if (resumen.todosPorConfirmar) subtotal = "Por confirmar";
  else if (resumen.hayPorConfirmar) subtotal += " (sin incluir productos con precio por confirmar)";
  partes.push("*Resumen del pedido*", `- Total de unidades: ${resumen.unidades}`, `- Subtotal estimado: ${subtotal}`, "- Envío: por confirmar", "", "¿Me confirmas disponibilidad, precio final y proceso de compra?");
  return partes.join("\n");
}

function crearLineaCarrito(linea) {
  const { producto, talla, cantidad } = linea;
  const clave = claveLinea(producto.id, talla);
  const item = crearElemento("li", "linea");
  item.dataset.tono = String(producto.indice % 4);
  const media = crearElemento("div", "linea-media");
  media.append(crearImagen(producto));
  const info = crearElemento("div", "linea-info");
  info.append(crearElemento("p", "linea-nombre", nombreCompleto(producto)), crearElemento("p", "linea-meta", `EU ${talla} · ${producto.color}`), crearElemento("p", "linea-unitario", `${formatearPrecio(producto.precio)}${producto.precio > 0 ? " c/u" : ""}`));
  const controles = crearElemento("div", "linea-controles");
  controles.append(crearSelectorCantidad(cantidad, `Cantidad de ${nombreCompleto(producto)} talla EU ${talla}`, { linea: clave }));
  const eliminar = crearBoton("boton-icono", crearIcono("icono-papelera"), { eliminar: clave });
  eliminar.setAttribute("aria-label", `Eliminar ${nombreCompleto(producto)} EU ${talla} del carrito`);
  controles.append(eliminar);
  info.append(controles);
  const subtotal = crearElemento("p", "linea-subtotal", producto.precio > 0 ? pesos(producto.precio * cantidad) : "Por confirmar");
  item.append(media, info, subtotal);
  return item;
}

function renderizarCarrito({ selectorFoco = "" } = {}) {
  const cuerpo = $("#carrito-cuerpo");
  const pie = $("#carrito-pie");
  if (!cuerpo || !pie) return;
  if (!estado.catalogoListo && estado.carrito.length) {
    const vacio = crearElemento("div", "carrito-vacio");
    vacio.append(crearElemento("h3", "", "No pudimos verificar el carrito"), crearElemento("p", "", "Necesitamos cargar el catálogo para comprobar las tallas y los precios."), crearBoton("boton boton-claro", "Reintentar", { reintentarCarrito: "" }));
    cuerpo.replaceChildren(vacio);
    pie.hidden = true;
    return;
  }
  const lineas = lineasCarrito();
  if (!lineas.length) {
    const vacio = crearElemento("div", "carrito-vacio");
    const dibujo = crearElemento("span", "carrito-vacio-icono"); dibujo.append(crearIcono("icono-bolsa"));
    const explorar = crearElemento("a", "boton boton-principal", "Explorar catálogo"); explorar.href = "#catalogo"; explorar.dataset.cerrar = "";
    vacio.append(dibujo, crearElemento("h3", "", "Tu carrito está vacío"), crearElemento("p", "", "Abre los detalles de una zapatilla, selecciona una talla EU y añádela aquí. Puedes combinar varios pares."), explorar);
    cuerpo.replaceChildren(vacio);
    pie.hidden = true;
    return;
  }
  const lista = crearElemento("ul", "lineas");
  lineas.forEach((linea) => lista.append(crearLineaCarrito(linea)));
  cuerpo.replaceChildren(lista);
  pie.hidden = false;
  const resumen = resumenCarrito(lineas);
  $("#carrito-unidades").textContent = String(resumen.unidades);
  $("#carrito-subtotal").textContent = resumen.todosPorConfirmar ? "Por confirmar" : pesos(resumen.subtotal);
  $("#carrito-nota").textContent = resumen.hayPorConfirmar && !resumen.todosPorConfirmar
    ? "Subtotal estimado sin incluir productos con precio por confirmar ni el envío. El vendedor confirmará el precio final."
    : "El subtotal es estimado y no incluye envío. El vendedor confirmará precio final y disponibilidad.";

  const mensaje = crearMensajeCarrito(lineas);
  const demasiadoLargo = enlaceWhatsApp(mensaje).length > CONFIG.limiteEnlaceWhatsApp;
  const enviar = $("#carrito-enviar");
  enviar.href = demasiadoLargo ? enlaceWhatsApp(`Hola, quiero hacer un pedido en ${CONFIG.tienda}. Te enviaré el detalle completo del carrito.`) : enlaceWhatsApp(mensaje);
  enviar.dataset.largo = String(demasiadoLargo);
  $("#carrito-respaldo").hidden = !demasiadoLargo;
  if (selectorFoco) $(selectorFoco, cuerpo)?.focus();
}

async function abrirCarrito(origen) {
  notificarCarrito("");
  renderizarCarrito();
  abrirDialogo(carritoDialogo(), origen);
  await refrescarCatalogo();
  validarCarrito();
  renderizarCarrito();
}

async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = crearElemento("textarea");
    area.value = texto;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    (carritoDialogo()?.open ? carritoDialogo() : document.body).append(area);
    area.select();
    let resultado = false;
    try { resultado = document.execCommand("copy"); } catch { resultado = false; }
    area.remove();
    return resultado;
  }
}

function iniciarCarrito() {
  estado.carrito = leerCarritoGuardado();
  actualizarInsignia();
  $("#boton-carrito")?.addEventListener("click", (evento) => abrirCarrito(evento.currentTarget));
  document.addEventListener("click", (evento) => {
    const abrir = evento.target.closest("[data-abrir-carrito]");
    if (abrir) { ocultarAvisoFlotante(); abrirCarrito(abrir); }
  });

  const dialogo = carritoDialogo();
  dialogo?.addEventListener("click", async (evento) => {
    const paso = evento.target.closest("[data-linea]");
    if (paso) { cambiarCantidad(paso.dataset.linea, Number(paso.dataset.paso)); return; }
    const eliminar = evento.target.closest("[data-eliminar]");
    if (eliminar) { eliminarLinea(eliminar.dataset.eliminar); return; }
    if (evento.target.closest("[data-reintentar-carrito]")) { await cargarProductos(); renderizarCarrito(); }
  });

  $("#carrito-enviar")?.addEventListener("click", async (evento) => {
    const lineas = lineasCarrito();
    if (!lineas.length) {
      evento.preventDefault();
      notificarCarrito("Tu carrito está vacío. Añade al menos un producto.");
      return;
    }
    if (evento.currentTarget.dataset.largo === "true") {
      evento.preventDefault();
      const ventana = window.open(enlaceWhatsApp(`Hola, quiero consultar un pedido en ${CONFIG.tienda}. Te voy a enviar el detalle completo del carrito.`), "_blank", "noopener,noreferrer");
      const copiado = await copiarTexto(crearMensajeCarrito(lineas));
      notificarCarrito(copiado ? "Copiamos el pedido completo. Pégalo en el chat de WhatsApp que se abrió." : (ventana ? "El pedido es largo. Usa «Copiar pedido» y pégalo en WhatsApp." : "El pedido es largo. Copia el detalle y abre WhatsApp manualmente."));
    }
    // No se vacía el carrito: abrir WhatsApp no confirma una compra.
  });

  $("#carrito-copiar")?.addEventListener("click", async () => {
    const lineas = lineasCarrito();
    if (!lineas.length) return notificarCarrito("Tu carrito está vacío.");
    const copiado = await copiarTexto(crearMensajeCarrito(lineas));
    notificarCarrito(copiado ? "Pedido copiado. Ya puedes pegarlo en WhatsApp." : "No pudimos copiar automáticamente. Selecciona y copia el pedido de nuevo.");
  });

  window.addEventListener("storage", (evento) => {
    if (evento.key !== CONFIG.claveCarrito) return;
    estado.carrito = leerCarritoGuardado();
    validarCarrito();
    actualizarInsignia();
    if (dialogo?.open) renderizarCarrito();
  });
}

function cambiarCantidad(clave, paso) {
  const linea = estado.carrito.find((item) => claveLinea(item.id, item.talla) === clave);
  if (!linea) return;
  linea.cantidad = Math.min(CONFIG.cantidadMaxima, Math.max(1, linea.cantidad + paso));
  guardarCarrito(); actualizarInsignia(); renderizarCarrito({ selectorFoco: `[data-linea="${CSS.escape(clave)}"][data-paso="${paso}"]:not(:disabled)` });
}

function eliminarLinea(clave) {
  const indice = estado.carrito.findIndex((item) => claveLinea(item.id, item.talla) === clave);
  if (indice < 0) return;
  estado.carrito.splice(indice, 1);
  guardarCarrito(); actualizarInsignia(); renderizarCarrito();
  $("#carrito-titulo")?.focus?.();
}

/* ---------- Aviso flotante ---------- */
let temporizadorAviso = 0;
function mostrarAvisoFlotante(mensaje, conCarrito = true) {
  const aviso = $("#aviso-flotante");
  if (!aviso) return;
  $("#aviso-flotante-texto").textContent = mensaje;
  const boton = $("[data-abrir-carrito]", aviso);
  if (boton) boton.hidden = !conCarrito;
  aviso.hidden = false;
  requestAnimationFrame(() => aviso.classList.add("visible"));
  window.clearTimeout(temporizadorAviso);
  temporizadorAviso = window.setTimeout(ocultarAvisoFlotante, 4500);
}

function ocultarAvisoFlotante() {
  const aviso = $("#aviso-flotante");
  if (!aviso) return;
  aviso.classList.remove("visible");
  window.setTimeout(() => { if (!aviso.classList.contains("visible")) aviso.hidden = true; }, 320);
}

function animarInsignia() {
  const boton = $("#boton-carrito");
  if (!boton || animacionReducida()) return;
  boton.classList.remove("rebote");
  void boton.offsetWidth;
  boton.classList.add("rebote");
}

/* ---------- Eventos de catálogo y panel de producto ---------- */
function iniciarCatalogo() {
  $("#buscar")?.addEventListener("input", (evento) => { estado.busqueda = evento.target.value; renderizarCatalogo(); });
  $("#orden")?.addEventListener("change", (evento) => { estado.orden = ordenadores[evento.target.value] ? evento.target.value : "destacados"; renderizarCatalogo(); });
  $("#limpiar-filtros")?.addEventListener("click", limpiarFiltros);

  $("#filtros")?.addEventListener("click", (evento) => {
    const boton = evento.target.closest("[data-filtro]");
    if (!boton) return;
    if (boton.dataset.filtro === "marca") estado.marca = boton.dataset.valor;
    if (boton.dataset.filtro === "categoria") estado.categoria = boton.dataset.valor;
    if (boton.dataset.filtro === "nuevos") estado.soloNuevos = !estado.soloNuevos;
    renderizarCatalogo();
  });

  grilla()?.addEventListener("click", (evento) => {
    const accion = evento.target.closest("[data-accion]");
    if (!accion) return;
    if (accion.dataset.accion === "reintentar") { cargarProductos(); return; }
    if (accion.dataset.accion === "limpiar") { limpiarFiltros(); return; }
    const tarjeta = accion.closest(".tarjeta");
    if (!tarjeta) return;
    if (accion.dataset.accion === "detalles") abrirDetalles(tarjeta.dataset.id, accion);
    if (accion.dataset.accion === "rapido") agregarAlCarrito(tarjeta.dataset.id, accion.dataset.talla, 1);
  });

  modalProducto()?.addEventListener("click", (evento) => {
    const botonGuia = evento.target.closest("[data-abrir-guia]");
    if (botonGuia) { abrirGuia(botonGuia, botonGuia.dataset.marcaGuia || ""); return; }
    const producto = estado.detalle && productoPorId(estado.detalle.id);
    if (!producto) return;
    const botonTalla = evento.target.closest("[data-talla]");
    if (botonTalla) {
      if (!tallaValida(producto, botonTalla.dataset.talla)) { mostrarAvisoDetalle("Esa talla no está disponible. Elige otra talla."); return; }
      estado.tallas.set(producto.id, botonTalla.dataset.talla);
      renderizarDetalle({ selectorFoco: `[data-talla="${CSS.escape(botonTalla.dataset.talla)}"]` });
      renderizarCatalogo();
      return;
    }
    const paso = evento.target.closest("[data-cantidad-detalle]");
    if (paso) {
      estado.detalle.cantidad = Math.min(CONFIG.cantidadMaxima, Math.max(1, estado.detalle.cantidad + Number(paso.dataset.paso)));
      renderizarDetalle({ selectorFoco: `[data-cantidad-detalle][data-paso="${paso.dataset.paso}"]:not(:disabled)` });
      return;
    }
    const tipo = evento.target.closest("[data-accion]")?.dataset.accion;
    if (tipo !== "agregar" && tipo !== "pedir-ahora") return;
    const talla = obtenerTallaRecordada(producto);
    if (!tallaValida(producto, talla)) { mostrarAvisoDetalle("Selecciona una talla EU disponible antes de continuar."); $("[data-talla]:not(:disabled)", modalProducto())?.focus(); return; }
    if (tipo === "agregar") {
      if (agregarAlCarrito(producto.id, talla, estado.detalle.cantidad)) cerrarDialogo(modalProducto());
    } else {
      abrirWhatsApp(mensajePedidoProducto(producto, talla, estado.detalle.cantidad));
    }
  });

  grilla()?.addEventListener("click", (evento) => {
    const boton = evento.target.closest('[data-accion="reintentar-carrito"]');
    if (boton) cargarProductos();
  });
}

function iniciarGuia() {
  document.addEventListener("click", (evento) => {
    const enlaceWhats = evento.target.closest("[data-wa]");
    if (enlaceWhats && String(CONFIG.whatsapp).replace(/\D/g, "") === NUMERO_PROVISIONAL) {
      evento.preventDefault();
      mostrarAvisoFlotante("Configura el número real de WhatsApp en app.js antes de publicar.", false);
      return;
    }
    const boton = evento.target.closest("[data-abrir-guia]");
    if (!boton || modalProducto()?.contains(boton)) return;
    abrirGuia(boton, boton.dataset.marcaGuia || "");
  });
}

/* ---------- Menú adaptable ---------- */
let cerrarMenu = () => {};
function iniciarMenu() {
  const cabecera = $("#cabecera");
  const boton = $("#boton-menu");
  const menu = $("#menu-principal");
  if (!cabecera || !boton || !menu) return;
  const escritorio = window.matchMedia("(min-width: 960px)");
  const cambiarMenu = (abrir) => {
    cabecera.classList.toggle("menu-abierto", abrir);
    boton.setAttribute("aria-expanded", String(abrir));
    boton.setAttribute("aria-label", abrir ? "Cerrar menú" : "Abrir menú");
  };
  cerrarMenu = () => cambiarMenu(false);
  boton.addEventListener("click", () => cambiarMenu(boton.getAttribute("aria-expanded") !== "true"));
  menu.addEventListener("click", (evento) => { if (evento.target.closest("a")) cerrarMenu(); });
  document.addEventListener("click", (evento) => {
    if (cabecera.classList.contains("menu-abierto") && !cabecera.contains(evento.target)) cerrarMenu();
  });
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && cabecera.classList.contains("menu-abierto")) { cerrarMenu(); boton.focus(); }
  });
  escritorio.addEventListener("change", (consulta) => { if (consulta.matches) cerrarMenu(); });
  const marcarDesplazamiento = () => cabecera.classList.toggle("desplazada", window.scrollY > 12);
  window.addEventListener("scroll", marcarDesplazamiento, { passive: true });
  marcarDesplazamiento();
}

/* ---------- Aparición sutil al desplazarse ---------- */
function iniciarRevelado() {
  const elementos = $$(".revelar");
  if (animacionReducida() || !("IntersectionObserver" in window)) {
    elementos.forEach((elemento) => elemento.classList.add("visible"));
    return;
  }
  document.documentElement.classList.add("con-revelado");
  const observador = new IntersectionObserver((entradas) => {
    entradas.forEach((entrada) => {
      if (!entrada.isIntersecting) return;
      entrada.target.classList.add("visible");
      observador.unobserve(entrada.target);
    });
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.08 });
  elementos.forEach((elemento) => observador.observe(elemento));
}

function iniciarNavegacionActiva() {
  const secciones = ["inicio", "como-comprar", "catalogo", "pagos", "contacto"].map((id) => document.getElementById(id)).filter(Boolean);
  const enlaces = $$(".menu-enlaces a");
  function actualizar() {
    const umbral = Math.min(230, window.innerHeight * .35);
    let actual = "inicio";
    for (const seccion of secciones) if (seccion.getBoundingClientRect().top <= umbral) actual = seccion.id;
    // En la parte inferior de la página Contacto debe permanecer activo,
    // aunque la sección no alcance el umbral por falta de espacio para desplazar.
    const cercaDelFinal = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 24;
    if (cercaDelFinal && document.getElementById("contacto")) actual = "contacto";
    enlaces.forEach((a) => {
      const activo = a.getAttribute("href") === `#${actual}`;
      a.classList.toggle("navegacion-activa", activo);
      if (activo) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
    });
    document.body.classList.toggle("viendo-catalogo", actual === "catalogo");
  }
  window.addEventListener("scroll", actualizar, { passive: true });
  window.addEventListener("resize", actualizar, { passive: true });
  window.addEventListener("hashchange", () => requestAnimationFrame(actualizar));
  actualizar();
}

function iniciar() {
  iniciarNavegacionActiva();
  aplicarConfiguracion();
  iniciarMenu();
  iniciarDialogos();
  iniciarCatalogo();
  iniciarCarrito();
  iniciarGuia();
  iniciarRevelado();
  cargarProductos();
}

iniciar();
