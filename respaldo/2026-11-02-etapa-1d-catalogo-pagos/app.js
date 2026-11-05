"use strict";

/* =========================================================
   GAMA & TALLA — catálogo, guía de tallas y carrito.
   Edita los datos comerciales en CONFIG y los productos en
   data/productos.json. Los productos incluidos son ejemplos.
   ========================================================= */
const CONFIG = {
  tienda: "Gama & Talla",
  descripcion: "Tienda de zapatillas en Colombia. Explora el catálogo, consulta tallas y arma tu pedido por WhatsApp.",
  whatsapp: "573124745942", // Sustituir por el número real antes de publicar.
  horario: "",
  mensajeGeneral: "Hola, quiero consultar los modelos y tallas disponibles en Gama & Talla.",
  datosUrl: "data/productos.json",
  imagenRespaldo: "assets/images/branding/placeholder.svg",
  claveCarrito: "gama-talla-carrito-v2",
  cantidadMaxima: 10,
  limiteEnlaceWhatsApp: 3000,
  // Fotos de prueba ya recortadas (sin barras de captura). Es provisional:
  // con el catálogo definitivo, cada ruta irá directamente en el JSON.
  carpetaFotosEditadas: "assets/images/productos/editadas/",
  fotosEditadas: [
    "zapatilla_01.webp", "zapatilla_02.webp", "zapatilla_03.webp", "zapatilla_04.webp",
    "zapatilla_08.webp", "zapatilla_11.webp", "zapatilla_14.webp", "zapatilla_24.webp",
    "zapatilla_27.webp", "zapatilla_29.webp", "zapatilla_32.webp", "zapatilla_44.webp",
    "zapatilla_48.webp"
  ]
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
const fotosEditadas = new Set(CONFIG.fotosEditadas);
const MAX_TALLAS_TARJETA = 5;

function rutaImagen(ruta) {
  const archivo = String(ruta).split("/").pop();
  return fotosEditadas.has(archivo) ? `${CONFIG.carpetaFotosEditadas}${archivo}` : ruta;
}

function unirConY(lista) {
  return lista.length > 1 ? `${lista.slice(0, -1).join(", ")} y ${lista[lista.length - 1]}` : (lista[0] || "");
}

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
  talla: TODOS,
  orden: "destacados",
  productosVisibles: 12,
  animarDesde: null,
  firmaVistaCatalogo: "",
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
  const convertir = (valor) => {
    const texto = String(valor).trim().replace(",", ".");
    const fraccion = texto.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    return fraccion ? Number(fraccion[1]) + Number(fraccion[2]) / Number(fraccion[3]) : Number(texto);
  };
  const numeroA = convertir(a);
  const numeroB = convertir(b);
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
    return {
      verificada: false,
      texto: guia?.nota || `No tenemos una equivalencia verificada para ${producto.marca}. Confirma la talla exacta de este modelo antes de comprar.`,
      url: guia?.url || "",
      urlAlterna: guia?.urlAlterna || "",
      fuente: guia?.fuente || ""
    };
  }
  const medida = guia.tallas[String(talla)];
  if (!medida) {
    return {
      verificada: false,
      texto: `La talla EU ${talla} no figura en la tabla oficial consultada de ${producto.marca}. Comprueba la talla exacta de la etiqueta del par antes de comprar; no se asigna una equivalencia estimada.`,
      url: guia.url,
      urlAlterna: guia.urlAlterna,
      fuente: guia.fuente
    };
  }
  const partes = [];
  if (medida.colombia) partes.push(`talla Colombia ${medida.colombia}`);
  if (medida.cm) partes.push(`${medida.cm} cm de largo de pie`);
  if (medida.us) partes.push(`US hombre ${medida.us}`);
  const texto = medida.colombia
    ? `Según la tabla oficial consultada de ${guia.marcaBase || guia.marca}, EU ${talla}: ${partes.join(" · ")}. Confirma la categoría (hombre/mujer/unisex) y el ajuste del modelo.`
    : `La tabla oficial de ${guia.marcaBase || guia.marca} indica EU ${talla}${medida.cm ? ` · referencia ${medida.cm} cm` : ""}${medida.us ? ` · US hombre ${medida.us}` : ""}. No se dispone de conversión nacional colombiana verificada para esta talla. Confirma la etiqueta y el modelo.`;
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
  const paginacion = $("#catalogo-paginacion");
  if (paginacion) paginacion.hidden = true;
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
  const paginacion = $("#catalogo-paginacion");
  if (paginacion) paginacion.hidden = true;
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
  if (cambio) {
    estado.productosVisibles = 12;
    estado.firmaVistaCatalogo = "";
  }
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
  const tallas = tallasCatalogo();
  $("#filtro-talla")?.replaceChildren(...[TODOS, ...tallas].map((talla) => {
    const chip = crearChip("talla", talla, talla === TODOS ? "Todas" : talla);
    if (talla !== TODOS) chip.setAttribute("aria-label", `Talla EU ${talla}`);
    return chip;
  }));
  const hayNuevos = estado.productos.some((producto) => producto.nuevoIngreso);
  const chipNuevos = $("#chip-nuevos");
  if (chipNuevos) chipNuevos.hidden = !hayNuevos;
  if (!hayNuevos) estado.soloNuevos = false;
  if (!marcas.includes(estado.marca)) estado.marca = TODOS;
  if (!categorias.includes(estado.categoria)) estado.categoria = TODOS;
  if (!tallas.includes(estado.talla)) estado.talla = TODOS;
  actualizarPortada(tallas);
  sincronizarFiltros();
}

// Tallas EU con existencias en al menos un producto disponible.
function tallasCatalogo() {
  const tallas = new Set();
  estado.productos.forEach((producto) => {
    if (producto.disponible) producto.tallasDisponibles.forEach((talla) => tallas.add(talla));
  });
  return [...tallas].sort(compararTallas);
}

// Selector «Tu talla EU», marcas y resumen de la etiqueta: todo sale del JSON.
function actualizarPortada(tallas) {
  const selector = $("#selector-talla");
  const opciones = $("#portada-tallas");
  if (selector && opciones) {
    selector.hidden = tallas.length === 0;
    opciones.replaceChildren(...tallas.map((talla) => {
      const boton = crearBoton("boton-talla", talla, { filtro: "talla", valor: talla, origen: "portada" });
      boton.setAttribute("aria-pressed", "false");
      boton.setAttribute("aria-label", `Talla EU ${talla}`);
      return boton;
    }));
  }

  const conteo = new Map();
  estado.productos.forEach((producto) => conteo.set(producto.marca, (conteo.get(producto.marca) || 0) + 1));
  const marcas = [...conteo.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .map(([marca]) => marca);
  const textoMarcas = $("[data-marcas-portada]");
  if (textoMarcas && marcas.length) {
    textoMarcas.textContent = marcas.length > 4 ? `${marcas.slice(0, 4).join(", ")} y más` : unirConY(marcas);
  }

  const etiqueta = $("#etiqueta-caja");
  if (!etiqueta) return;
  etiqueta.hidden = estado.productos.length === 0;
  const resumen = {
    productos: String(estado.productos.length),
    marcas: String(conteo.size),
    tallas: tallas.length > 1 ? `${tallas[0]}–${tallas[tallas.length - 1]}` : (tallas[0] || "—")
  };
  $$("[data-resumen]", etiqueta).forEach((nodo) => { nodo.textContent = resumen[nodo.dataset.resumen] ?? "—"; });
}

function irAlCatalogo() {
  $("#catalogo")?.scrollIntoView({ behavior: animacionReducida() ? "auto" : "smooth", block: "start" });
  $("#titulo-catalogo")?.focus({ preventScroll: true });
}

function sincronizarFiltros() {
  $$('[data-filtro]').forEach((boton) => {
    const tipo = boton.dataset.filtro;
    const valor = boton.dataset.valor;
    const activo = tipo === "marca" ? valor === estado.marca
      : tipo === "categoria" ? valor === estado.categoria
        : tipo === "talla" ? valor === estado.talla
          : tipo === "nuevos" ? estado.soloNuevos : false;
    boton.setAttribute("aria-pressed", String(activo));
    boton.classList.toggle("activo", activo);
  });
  const hayFiltros = Boolean(estado.busqueda.trim()) || estado.marca !== TODOS || estado.categoria !== TODOS || estado.talla !== TODOS || estado.soloNuevos;
  const limpiar = $("#limpiar-filtros");
  if (limpiar) limpiar.hidden = !hayFiltros;
}

function productosFiltrados() {
  const terminos = normalizarTexto(estado.busqueda).split(/\s+/).filter(Boolean);
  return estado.productos
    .filter((producto) => estado.marca === TODOS || producto.marca === estado.marca)
    .filter((producto) => estado.categoria === TODOS || producto.categoria === estado.categoria)
    .filter((producto) => !estado.soloNuevos || producto.nuevoIngreso)
    .filter((producto) => estado.talla === TODOS || (producto.disponible && producto.tallasDisponibles.includes(estado.talla)))
    .filter((producto) => terminos.every((termino) => producto.textoBusqueda.includes(termino)))
    .sort(ordenadores[estado.orden] || ordenadores.destacados);
}

function limpiarFiltros() {
  estado.busqueda = "";
  estado.marca = TODOS;
  estado.categoria = TODOS;
  estado.talla = TODOS;
  estado.soloNuevos = false;
  if ($("#buscar")) $("#buscar").value = "";
  sincronizarFiltros();
  renderizarCatalogo();
}

function firmaFiltrosCatalogo() {
  return [
    normalizarTexto(estado.busqueda),
    estado.marca,
    estado.categoria,
    estado.talla,
    estado.soloNuevos ? "1" : "0",
    estado.orden
  ].join("¦");
}

function actualizarPaginacionCatalogo(total, visibles) {
  const contenedor = $("#catalogo-paginacion");
  const boton = $("#mostrar-mas");
  const etiqueta = boton?.querySelector("span");
  const ayuda = $("#catalogo-paginacion-ayuda");
  const progreso = $("#paginacion-progreso-barra");
  if (!contenedor || !boton || !etiqueta) return;

  // El control se mantiene visible al llegar al final para poder retroceder un grupo.
  if (total <= 12) {
    contenedor.hidden = true;
    return;
  }

  contenedor.hidden = false;
  const restantes = Math.max(0, total - visibles);
  const mostrarMenos = restantes === 0;
  boton.classList.toggle("boton-mostrar-mas--menos", mostrarMenos);
  etiqueta.textContent = mostrarMenos ? "Mostrar menos" : "Mostrar más";
  boton.setAttribute(
    "aria-label",
    mostrarMenos ? "Mostrar el grupo anterior de zapatillas" : `Mostrar ${Math.min(12, restantes)} productos más`
  );
  if (progreso) progreso.style.transform = `scaleX(${total ? visibles / total : 0})`;

  if (ayuda) {
    ayuda.textContent = mostrarMenos
      ? `Estás viendo los ${total} productos`
      : `Viendo ${visibles} de ${total} · ${restantes} ${restantes === 1 ? "zapatilla más" : "zapatillas más"}`;
  }
}

function renderizarCatalogo() {
  sincronizarFiltros();
  const contenedor = grilla();
  if (!contenedor) return;

  // Cada cambio de búsqueda, filtro u orden inicia de nuevo desde las primeras 12 tarjetas.
  const firmaActual = firmaFiltrosCatalogo();
  if (firmaActual !== estado.firmaVistaCatalogo) {
    estado.firmaVistaCatalogo = firmaActual;
    estado.productosVisibles = 12;
  }

  if (!estado.productos.length) {
    actualizarContador("0 productos");
    actualizarPaginacionCatalogo(0, 0);
    mostrarEstado({ titulo: "Aún no hay productos", mensaje: "Pronto publicaremos nuestro catálogo. Escríbenos por WhatsApp para consultar modelos y tallas." });
    return;
  }

  const lista = productosFiltrados();
  if (!lista.length) {
    actualizarContador("0 productos");
    actualizarPaginacionCatalogo(0, 0);
    mostrarEstado({ titulo: "No encontramos zapatillas", mensaje: "Prueba con otra búsqueda o elimina algunos filtros.", textoBoton: "Limpiar filtros", accion: "limpiar" });
    return;
  }

  const cantidadVisible = Math.min(estado.productosVisibles, lista.length);
  const productosParaMostrar = lista.slice(0, cantidadVisible);
  if (cantidadVisible < lista.length) {
    actualizarContador(`Mostrando ${cantidadVisible} de ${lista.length} productos`);
  } else {
    actualizarContador(lista.length === estado.productos.length
      ? `${lista.length} ${lista.length === 1 ? "producto" : "productos"}`
      : `${lista.length} de ${estado.productos.length} productos`);
  }

  // Solo las tarjetas que llegan con «Mostrar más» entran con una animación escalonada.
  const animarDesde = estado.animarDesde;
  estado.animarDesde = null;
  const fragmento = document.createDocumentFragment();
  productosParaMostrar.forEach((producto, indice) => {
    const tarjeta = crearTarjeta(producto, indice);
    if (animarDesde !== null && indice >= animarDesde) {
      tarjeta.classList.add("tarjeta-entrante");
      tarjeta.style.setProperty("--retardo", `${Math.min(indice - animarDesde, 8) * 40}ms`);
    }
    fragmento.append(tarjeta);
  });
  contenedor.replaceChildren(fragmento);
  contenedor.setAttribute("aria-busy", "false");
  actualizarPaginacionCatalogo(lista.length, cantidadVisible);
}

function crearImagen(producto, { perezosa = true } = {}) {
  const imagen = new Image(800, 800);
  // Solo se crean imágenes para los productos visibles (máximo 12 por grupo).
  // El navegador pospone las que están fuera de pantalla.
  imagen.loading = perezosa ? "lazy" : "eager";
  imagen.decoding = "async";
  imagen.setAttribute("fetchpriority", perezosa ? "low" : "high");
  imagen.alt = `Zapatillas ${nombreCompleto(producto)}, color ${producto.color}`;
  imagen.addEventListener("error", () => {
    if (imagen.dataset.respaldo === "true") return;
    imagen.dataset.respaldo = "true";
    imagen.alt = `Imagen de respaldo para ${nombreCompleto(producto)}`;
    imagen.src = CONFIG.imagenRespaldo;
  });
  imagen.src = rutaImagen(producto.imagen);
  return imagen;
}

// Insignia única por tarjeta. Prioridad: Agotado > descuento > Nuevo.
function crearInsignia(producto) {
  if (!producto.disponible) return crearElemento("span", "insignia-producto insignia-agotado", "Agotado");
  if (producto.descuento) {
    // Sello estrellado «SALE» + placa con el porcentaje (diseño original).
    const insignia = crearElemento("span", "insignia-producto insignia-descuento");
    const sello = crearElemento("span", "insignia-sello", "SALE");
    const porcentaje = crearElemento("span", "insignia-porcentaje", `-${producto.descuento}%`);
    sello.setAttribute("aria-hidden", "true");
    porcentaje.setAttribute("aria-hidden", "true");
    insignia.append(sello, porcentaje, crearElemento("span", "sr-only", `Oferta: descuento del ${producto.descuento} %`));
    return insignia;
  }
  if (producto.badge) return crearElemento("span", "insignia-producto insignia-nuevo", producto.badge);
  return null;
}

// Tira de tallas EU disponibles; la talla filtrada siempre queda visible y resaltada.
function crearTiraTallas(producto) {
  if (!producto.disponible) return crearElemento("p", "tarjeta-sin-tallas", "Sin tallas disponibles");
  const tallas = producto.tallasDisponibles;
  let visibles = tallas.slice(0, MAX_TALLAS_TARJETA);
  if (estado.talla !== TODOS && tallas.includes(estado.talla) && !visibles.includes(estado.talla)) {
    visibles = [...visibles.slice(0, MAX_TALLAS_TARJETA - 1), estado.talla].sort(compararTallas);
  }
  const tira = crearElemento("div", "tarjeta-tallas");
  tira.append(crearElemento("span", "sr-only", `Tallas EU disponibles: ${tallas.join(", ")}`));
  visibles.forEach((talla) => {
    const pieza = crearElemento("span", `talla-mini${talla === estado.talla ? " es-tu-talla" : ""}`, talla);
    pieza.setAttribute("aria-hidden", "true");
    tira.append(pieza);
  });
  const restantes = tallas.length - visibles.length;
  if (restantes > 0) {
    const mas = crearElemento("span", "talla-mini tarjeta-tallas-mas", `+${restantes}`);
    mas.setAttribute("aria-hidden", "true");
    tira.append(mas);
  }
  return tira;
}

function crearTarjeta(producto, indiceVisible = 12) {
  const agotado = !producto.disponible;
  const tarjeta = crearElemento("article", `tarjeta${agotado ? " tarjeta-agotada" : ""}`);
  tarjeta.dataset.id = producto.id;

  const media = crearElemento("div", "tarjeta-media");
  media.append(crearImagen(producto, { perezosa: indiceVisible >= 4 }));
  const insignia = crearInsignia(producto);
  if (insignia) media.append(insignia);
  const talla = estado.tallas.get(producto.id);
  if (tallaValida(producto, talla)) {
    const rapido = crearBoton("tarjeta-rapido", [crearIcono("icono-mas"), `EU ${talla}`], { accion: "rapido", talla });
    rapido.setAttribute("aria-label", `Añadir ${nombreCompleto(producto)}, talla EU ${talla}, al carrito`);
    rapido.title = "Añadir al carrito con la talla seleccionada";
    media.append(rapido);
  }

  const cuerpo = crearElemento("div", "tarjeta-cuerpo");
  const nombre = crearElemento("h3", "tarjeta-nombre");
  nombre.append(crearElemento("span", "", producto.nombre));
  const precio = crearElemento("p", "tarjeta-precio");
  precio.append(crearElemento("span", "precio-actual", formatearPrecio(producto.precio)));
  if (producto.descuento) precio.append(crearElemento("del", "precio-anterior", formatearPrecio(producto.precioAnterior)));
  // «Ver detalles» es el único control de la tarjeta; su ::after la cubre entera,
  // así que la foto y el texto también lo activan (un solo botón, un solo evento).
  const acciones = crearElemento("div", "tarjeta-acciones");
  const detalles = crearBoton("boton boton-principal tarjeta-enlace", crearElemento("span", "", "Ver detalles"), { accion: "detalles" });
  detalles.setAttribute("aria-label", `Ver detalles de ${nombreCompleto(producto)}`);
  acciones.append(detalles);
  cuerpo.append(crearElemento("p", "tarjeta-meta", `${producto.marca} · ${producto.categoria}`), nombre, precio, crearTiraTallas(producto), acciones);

  tarjeta.append(media, cuerpo);
  return tarjeta;
}

// Sustituye solo la tarjeta afectada, sin volver a construir toda la grilla.
function actualizarTarjeta(id) {
  const contenedor = grilla();
  const producto = productoPorId(id);
  const actual = contenedor && $(`.tarjeta[data-id="${CSS.escape(id)}"]`, contenedor);
  if (!actual || !producto) return;
  const nueva = crearTarjeta(producto, [...contenedor.children].indexOf(actual));
  actual.replaceWith(nueva);
  // Si el detalle se abrió desde esta tarjeta, el foco debe volver a la versión nueva al cerrar.
  const dialogo = modalProducto();
  if (dialogo && actual.contains(origenesFoco.get(dialogo))) origenesFoco.set(dialogo, $(".tarjeta-enlace", nueva));
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
  $$('dialog.modal').forEach((dialogo) => {
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
  media.append(crearImagen(producto, { perezosa: false }));
  // El descuento se muestra una sola vez, en verde junto al precio anterior.
  if (agotado) media.append(crearElemento("span", "etiqueta etiqueta-agotado", "Agotado"));

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
      const textoFuente = producto.marca === "Jordan" ? "Consultar cómo encontrar la talla Jordan" : `Consultar guía oficial de ${producto.marca}`;
      const fuente = crearElemento("a", "orientacion-fuente", textoFuente);
      fuente.href = datos.url;
      fuente.target = "_blank";
      fuente.rel = "noopener noreferrer";
      orientacion.append(fuente);
    }
    if (datos.urlAlterna) {
      const textoAlterno = producto.marca === "Adidas" ? "Ver ayuda de tallas de adidas Colombia" : "Ver otra fuente oficial de la marca";
      const fuenteAlterna = crearElemento("a", "orientacion-fuente", textoAlterno);
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
    cabecera.append(crearElemento("h3", "", marca), crearElemento("span", `sello ${verificada ? "sello-ok" : "sello-pendiente"}`, verificada ? "Tabla oficial" : "Por modelo"));
    bloque.append(cabecera);
    if (!verificada) {
      bloque.append(crearElemento("p", "", guia?.nota || `Aún no hay equivalencias verificadas para ${marca}.`));
      if (guia?.url) {
        const textoEnlace = marca === "Jordan" ? "Consultar cómo encontrar la talla Jordan" : `Consultar guía oficial de ${marca}`;
        const enlace = crearElemento("a", "orientacion-fuente", textoEnlace);
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
      const textoFuente = marca === "Jordan" ? "Consultar cómo encontrar la talla Jordan" : `Consultar guía oficial de ${marca}`;
      const fuente = crearElemento("a", "orientacion-fuente", textoFuente);
      fuente.href = guia.url; fuente.target = "_blank"; fuente.rel = "noopener noreferrer"; bloque.append(fuente);
    }
    if (guia.urlAlterna) {
      const textoAlterno = marca === "Adidas" ? "Ver ayuda de tallas de adidas Colombia" : "Ver otra fuente oficial de la marca";
      const fuenteAlterna = crearElemento("a", "orientacion-fuente", textoAlterno);
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
  void aviso.offsetWidth; // Fija el estado inicial para que la entrada se anime.
  aviso.classList.add("visible");
  window.clearTimeout(temporizadorAviso);
  temporizadorAviso = window.setTimeout(ocultarAvisoFlotante, 4500);
}

function ocultarAvisoFlotante() {
  const aviso = $("#aviso-flotante");
  if (!aviso) return;
  aviso.classList.remove("visible");
  window.setTimeout(() => { if (!aviso.classList.contains("visible")) aviso.hidden = true; }, 200);
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
  $("#mostrar-mas")?.addEventListener("click", () => {
    const total = productosFiltrados().length;
    const yaEstanTodosVisibles = estado.productosVisibles >= total;

    if (yaEstanTodosVisibles && total > 12) {
      // Vuelve al estado inmediatamente anterior de la carga por grupos de 12.
      // Ejemplos: 24 → 12, 25 → 24, 36 → 24, 37 → 36.
      estado.productosVisibles = Math.max(12, Math.floor((total - 1) / 12) * 12);
      renderizarCatalogo();
      // La grilla se acorta: mantenemos el control a la vista.
      $("#catalogo-paginacion")?.scrollIntoView({ block: "center", behavior: animacionReducida() ? "auto" : "smooth" });
      return;
    }
    estado.animarDesde = estado.productosVisibles;
    estado.productosVisibles = Math.min(total, estado.productosVisibles + 12);
    renderizarCatalogo();
  });

  $("#buscar")?.addEventListener("input", (evento) => { estado.busqueda = evento.target.value; renderizarCatalogo(); });
  $("#orden")?.addEventListener("change", (evento) => { estado.orden = ordenadores[evento.target.value] ? evento.target.value : "destacados"; renderizarCatalogo(); });
  $("#limpiar-filtros")?.addEventListener("click", limpiarFiltros);

  // Filtros del catálogo, «Nuevos ingresos» y selector «Tu talla EU» de la portada.
  document.addEventListener("click", (evento) => {
    const boton = evento.target.closest("[data-filtro]");
    if (!boton) return;
    const { filtro, valor, origen } = boton.dataset;
    const desdePortada = origen === "portada";
    if (filtro === "marca") estado.marca = valor;
    if (filtro === "categoria") estado.categoria = valor;
    if (filtro === "talla") estado.talla = desdePortada && estado.talla === valor ? TODOS : valor;
    if (filtro === "nuevos") estado.soloNuevos = !estado.soloNuevos;
    renderizarCatalogo();
    if (desdePortada && estado.talla !== TODOS) irAlCatalogo();
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
      actualizarTarjeta(producto.id);
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

/* ---------- Enlace activo del menú ---------- */
// La sección activa es la última cuyo borde superior ya pasó por debajo de la
// cabecera fija. Se ordenan por su posición real en la página (no por el orden del
// menú) y, al pulsar un enlace, se marca de inmediato y se mantiene hasta que
// termina el desplazamiento para que el scroll en curso no la cambie.
function iniciarNavegacionActiva() {
  const enlaces = $$(".menu-enlaces a[href^='#']");
  const secciones = enlaces
    .map((enlace) => document.getElementById(enlace.hash.slice(1)))
    .filter(Boolean)
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  if (!secciones.length) return;
  const cabecera = $("#cabecera");
  let fijada = "";
  let temporizador = 0;

  function marcar(id) {
    enlaces.forEach((enlace) => {
      const activo = enlace.hash === `#${id}`;
      enlace.classList.toggle("navegacion-activa", activo);
      if (activo) enlace.setAttribute("aria-current", "location"); else enlace.removeAttribute("aria-current");
    });
  }

  function detectar() {
    // Margen bajo la cabecera; mayor que el scroll-padding para absorber redondeos.
    const linea = (cabecera ? cabecera.getBoundingClientRect().bottom : 0) + 32;
    let actual = "";
    secciones.forEach((seccion) => { if (seccion.getBoundingClientRect().top <= linea) actual = seccion.id; });
    // Al final de la página, la última sección queda activa aunque no alcance la línea.
    const alFinal = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 24;
    return alFinal ? secciones[secciones.length - 1].id : actual;
  }

  // Libera la selección fijada cuando el desplazamiento se detiene.
  function esperarFinDeDesplazamiento() {
    window.clearTimeout(temporizador);
    temporizador = window.setTimeout(() => { fijada = ""; marcar(detectar()); }, 140);
  }

  function actualizar() {
    if (fijada) { esperarFinDeDesplazamiento(); return; }
    marcar(detectar());
  }

  let pendiente = false;
  const programar = () => {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => { pendiente = false; actualizar(); });
  };

  // Cualquier enlace interno que lleve a una de estas secciones (menú, portada, pie).
  document.addEventListener("click", (evento) => {
    const enlace = evento.target.closest("a[href^='#']");
    if (!enlace || evento.defaultPrevented || enlace.hash.length < 2) return;
    const destino = secciones.find((seccion) => seccion.id === enlace.hash.slice(1));
    if (!destino) return;
    fijada = destino.id;
    marcar(fijada);
    esperarFinDeDesplazamiento();
  });

  window.addEventListener("scroll", programar, { passive: true });
  window.addEventListener("resize", programar, { passive: true });
  window.addEventListener("load", programar);
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
  cargarProductos();
}

iniciar();
