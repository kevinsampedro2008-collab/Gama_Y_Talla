"use strict";

/* =========================================================
   GAMA & TALLA — catálogo, detalle con variantes de color,
   guía de tallas y carrito.
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
  // Catálogo ficticio para probar variantes de color. Solo se carga con «?datos-prueba»
  // y nunca se mezcla con el catálogo real.
  datosPruebaUrl: "data/pruebas/productos-prueba.json",
  imagenRespaldo: "assets/images/branding/placeholder.svg",
  // Carrito V3: producto + variante (color) + talla. El V2 se migra una vez y se conserva.
  claveCarrito: "gama-talla-carrito-v3",
  claveCarritoAnterior: "gama-talla-carrito-v2",
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
const MODO_PRUEBA = new URLSearchParams(window.location.search).has("datos-prueba");
// El modo de prueba usa su propio carrito: nunca toca el carrito real ni migra el V2.
if (MODO_PRUEBA) {
  CONFIG.claveCarrito += "-prueba";
  CONFIG.claveCarritoAnterior = "";
}
const productoPorClave = (clave) => estado.productos.find((producto) => producto.clave === clave);
const claveLinea = (producto, variante, talla) => `${producto}|${variante}|${talla}`;
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

function mensajePedidoProducto(producto, variante, talla, cantidad = 1) {
  const subtotal = variante.precio > 0 ? precioMensaje(variante.precio * cantidad) : "Por confirmar";
  return [
    `Hola, quiero consultar este pedido en ${CONFIG.tienda}:`, "",
    ...(producto.prueba ? ["Nota: pedido de prueba con un producto ficticio.", ""] : []),
    `Modelo: ${producto.nombre}`,
    `Marca: ${producto.marca}`,
    `Color: ${variante.color}`,
    `Referencia: ${variante.referencia}`,
    `Talla: EU ${talla}`,
    `Cantidad: ${cantidad}`,
    `Precio unitario: ${precioMensaje(variante.precio)}`,
    `Subtotal: ${subtotal}`,
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
  conflictos: [],
  identificadoresV2: new Map(),
  // Color y talla elegidos por producto (en memoria): el detalle y el añadido rápido los recuerdan.
  seleccion: new Map(),
  detalle: null,
  carrito: [],
  pendientes: [],
  carritoOrigen: "vacio",
  carritoPreparado: false,
  unidadesPrevias: 0,
  avisoCarrito: ""
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

const slug = (valor) => normalizarTexto(valor).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const enteroPositivo = (valor) => Math.max(0, Math.round(Number(valor) || 0));
const calcularDescuento = (precio, anterior) => (precio > 0 && anterior > precio ? Math.round((1 - precio / anterior) * 100) : 0);
const definido = (valor) => valor !== undefined && valor !== null && valor !== "";

// Primera lista de fotos que tenga contenido (variante → producto → respaldo).
function listaDeImagenes(...fuentes) {
  for (const fuente of fuentes) {
    const lista = (Array.isArray(fuente) ? fuente : [fuente]).map((ruta) => limpiarTexto(ruta)).filter(Boolean);
    if (lista.length) return [...new Set(lista)];
  }
  return [CONFIG.imagenRespaldo];
}

/* Variante = un color del modelo, con sus fotos, sus tallas EU y, si lo indica, su precio.
   Los productos con el formato anterior (sin variantes[]) reciben una variante única
   «heredada» construida con color, imagen/imagenes, tallas y precios del propio producto. */
function normalizarVariante(bruto, base, idsUsados) {
  const agotadas = listaDeTallas(bruto.tallasAgotadas);
  const disponibles = listaDeTallas(bruto.tallasDisponibles).filter((talla) => !agotadas.includes(talla)).sort(compararTallas);
  const color = limpiarTexto(bruto.color, "Color por confirmar");
  // Con precio propio, el precio anterior solo viene de la variante: no se hereda un descuento.
  const precioPropio = !base.heredada && definido(bruto.precio);
  const precio = precioPropio ? enteroPositivo(bruto.precio) : base.precio;
  const precioAnterior = precioPropio || (!base.heredada && definido(bruto.precioAnterior)) ? enteroPositivo(bruto.precioAnterior) : base.precioAnterior;

  let id = base.heredada ? "unica" : limpiarTexto(bruto.id) || `${base.id}-${slug(color) || "color"}`;
  if (idsUsados.has(id)) {
    let numero = 2;
    while (idsUsados.has(`${id}-${numero}`)) numero += 1;
    id = `${id}-${numero}`;
  }
  idsUsados.add(id);

  const imagenes = base.heredada ? listaDeImagenes(bruto.imagenes, bruto.imagen) : listaDeImagenes(bruto.imagenes, bruto.imagen, base.imagenes);
  return {
    id,
    heredada: base.heredada,
    color,
    referencia: base.heredada ? base.id : limpiarTexto(bruto.referencia, id),
    fotoPrincipal: imagenes[0],
    imagenes: imagenes.map(rutaImagen),
    tallasDisponibles: disponibles,
    tallasAgotadas: agotadas.sort(compararTallas),
    disponible: bruto.disponible !== false && disponibles.length > 0,
    precio,
    precioAnterior,
    descuento: calcularDescuento(precio, precioAnterior)
  };
}

function normalizarProducto(bruto, indice) {
  if (!bruto || typeof bruto !== "object") return null;
  const nombre = limpiarTexto(bruto.nombre, "Modelo sin nombre");
  const marca = limpiarTexto(bruto.marca, "Marca por confirmar");
  // Sin referencia, una derivada del contenido (nunca de la posición en el JSON).
  const id = limpiarTexto(bruto.id) || `SIN-REF-${slug(marca)}-${slug(nombre)}`;
  const base = { id, precio: enteroPositivo(bruto.precio), precioAnterior: enteroPositivo(bruto.precioAnterior) };
  const idsVariantes = new Set();
  const explicitas = Array.isArray(bruto.variantes) ? bruto.variantes.filter((variante) => variante && typeof variante === "object") : [];
  const variantes = explicitas.length
    ? explicitas.map((variante) => normalizarVariante(variante, { ...base, heredada: false, imagenes: bruto.imagenes ?? bruto.imagen }, idsVariantes))
    : [normalizarVariante(bruto, { ...base, heredada: true }, idsVariantes)];

  const aLaVenta = variantes.filter((variante) => variante.disponible);
  const principal = aLaVenta[0] || variantes[0];
  const referencias = aLaVenta.length ? aLaVenta : variantes;
  const conPrecio = referencias.map((variante) => variante.precio).filter((precio) => precio > 0);
  // Si los colores tienen precios distintos, la tarjeta muestra «Desde» y no anuncia un descuento único.
  const preciosDistintos = new Set(referencias.map((variante) => variante.precio)).size > 1;
  const tallasDisponibles = [...new Set(aLaVenta.flatMap((variante) => variante.tallasDisponibles))].sort(compararTallas);
  const tallasAgotadas = [...new Set(variantes.flatMap((variante) => variante.tallasAgotadas))]
    .filter((talla) => !tallasDisponibles.includes(talla)).sort(compararTallas);

  const producto = {
    id,
    clave: id,
    firma: slug(String(principal.fotoPrincipal).split("/").pop().replace(/\.[a-z0-9]+$/i, "")) || "sin-foto",
    nombre,
    marca,
    categoria: limpiarTexto(bruto.categoria, "Otras"),
    descripcion: limpiarTexto(bruto.descripcion),
    variantes,
    principal: principal.id,
    color: principal.color,
    imagen: principal.imagenes[0],
    precio: preciosDistintos ? (conPrecio.length ? Math.min(...conPrecio) : 0) : principal.precio,
    precioAnterior: preciosDistintos ? 0 : principal.precioAnterior,
    precioDesde: preciosDistintos,
    descuento: preciosDistintos ? 0 : principal.descuento,
    tallasDisponibles,
    tallasAgotadas,
    disponible: bruto.disponible !== false && aLaVenta.length > 0,
    destacado: bruto.destacado === true,
    nuevoIngreso: bruto.nuevoIngreso === true,
    prueba: MODO_PRUEBA,
    referenciaRepetida: false,
    indice
  };
  // Evita mostrar reclamos comerciales no confirmados. Solo mostramos «Nuevo» si el campo lo indica.
  producto.badge = producto.nuevoIngreso ? "Nuevo" : "";
  producto.textoBusqueda = normalizarTexto([producto.nombre, producto.marca, producto.categoria, producto.id, ...variantes.flatMap((variante) => [variante.color, variante.referencia])].join(" "));
  return producto;
}

// Datos comerciales de un registro (para saber si dos registros con la misma referencia son el mismo par).
const firmaComercial = (producto) => JSON.stringify([
  producto.nombre, producto.marca, producto.categoria,
  producto.variantes.map((variante) => [variante.color, variante.precio, variante.precioAnterior, variante.tallasDisponibles, variante.tallasAgotadas])
]);

/* Clave interna estable de cada registro. Es la referencia comercial cuando es única; si se
   repite, se le añade el nombre de la foto principal del registro (no su posición en el JSON),
   así que reordenar el archivo no cambia la clave. Registros idénticos se numeran entre sí.
   Las referencias comerciales no se renombran: los conflictos se informan. */
function asignarClaves(productos) {
  const grupos = new Map();
  productos.forEach((producto) => grupos.set(producto.id, [...(grupos.get(producto.id) || []), producto]));
  const conflictos = [];
  grupos.forEach((grupo, id) => {
    if (grupo.length === 1) return;
    const vistas = new Map();
    grupo.forEach((producto) => {
      const numero = (vistas.get(producto.firma) || 0) + 1;
      vistas.set(producto.firma, numero);
      producto.clave = numero === 1 ? `${id}~${producto.firma}` : `${id}~${producto.firma}-${numero}`;
      producto.referenciaRepetida = true;
    });
    conflictos.push({
      referencia: id,
      registros: grupo.length,
      mismosDatos: grupo.every((producto) => firmaComercial(producto) === firmaComercial(grupo[0])),
      fotosRepetidas: [...vistas.values()].some((numero) => numero > 1)
    });
  });
  return conflictos;
}

// Reproduce cómo identificaba el carrito V2 cada registro: su referencia y, si ya se había
// usado, «referencia-posición». Solo sirve para migrar carritos guardados con esa versión.
function identificadoresV2(lista, productos) {
  const porIndice = new Map(productos.map((producto) => [producto.indice, producto]));
  const usados = new Set();
  const mapa = new Map();
  lista.forEach((bruto, indice) => {
    if (!bruto || typeof bruto !== "object") return;
    let id = limpiarTexto(bruto.id, `GT-${String(indice + 1).padStart(3, "0")}`);
    if (usados.has(id)) id = `${id}-${indice + 1}`;
    usados.add(id);
    if (porIndice.has(indice)) mapa.set(id, porIndice.get(indice));
  });
  return mapa;
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
  const respuesta = await fetch(MODO_PRUEBA ? CONFIG.datosPruebaUrl : CONFIG.datosUrl, { cache: "no-cache" });
  if (!respuesta.ok) throw new Error(`Respuesta HTTP ${respuesta.status}`);
  const texto = await respuesta.text();
  const datos = JSON.parse(texto);
  const lista = Array.isArray(datos) ? datos : datos?.productos;
  if (!Array.isArray(lista)) throw new Error("El JSON no contiene una lista de productos.");
  const productos = lista.map((bruto, indice) => normalizarProducto(bruto, indice)).filter(Boolean);
  const conflictos = asignarClaves(productos);
  return {
    firma: texto,
    productos,
    conflictos,
    identificadoresV2: identificadoresV2(lista, productos),
    guias: normalizarGuias(datos?.guiasTallas)
  };
}

function aplicarCatalogo(catalogo) {
  const cambio = catalogo.firma !== estado.firmaDatos;
  estado.firmaDatos = catalogo.firma;
  estado.productos = catalogo.productos;
  estado.guias = catalogo.guias;
  estado.identificadoresV2 = catalogo.identificadoresV2;
  if (cambio && catalogo.conflictos.length) {
    // Informativo: las referencias repetidas no se renombran; se distinguen por su foto principal.
    console.info(`Gama & Talla: ${catalogo.conflictos.length} referencias se repiten en el catálogo y se distinguen por su foto principal:`,
      catalogo.conflictos.map((c) => `${c.referencia} (${c.registros} registros${c.mismosDatos ? "" : ", con datos distintos"})`).join(", "));
  }
  estado.conflictos = catalogo.conflictos;
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
    prepararCarrito();
    construirFiltros();
    renderizarCatalogo();
    validarCarrito(false);
    if (MODO_PRUEBA) mostrarAvisoPrueba();
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

// Modo de prueba: un aviso visible deja claro que el catálogo es ficticio.
function mostrarAvisoPrueba() {
  if ($("#aviso-prueba")) return;
  const aviso = crearElemento("p", "aviso-prueba", "Modo de prueba: catálogo ficticio para revisar variantes de color. No son productos reales.");
  aviso.id = "aviso-prueba";
  aviso.setAttribute("role", "note");
  $("#catalogo .seccion-encabezado")?.after(aviso);
}

async function refrescarCatalogo() {
  try {
    const cambio = aplicarCatalogo(await leerCatalogo());
    prepararCarrito();
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

// Opción de marca o categoría: marca de selección, nombre y cantidad de resultados.
function crearOpcion(tipo, valor, texto) {
  const opcion = crearBoton("opcion", [crearIcono("icono-tilde"), crearElemento("span", "opcion-texto", texto), crearElemento("span", "opcion-cantidad")], { filtro: tipo, valor });
  opcion.setAttribute("aria-pressed", "false");
  return opcion;
}

function crearOpcionTalla(valor) {
  const opcion = crearBoton(`opcion-talla${valor === TODOS ? " opcion-talla-todas" : ""}`, valor === TODOS ? "Todas" : valor, { filtro: "talla", valor });
  opcion.setAttribute("aria-pressed", "false");
  if (valor !== TODOS) opcion.setAttribute("aria-label", `Talla EU ${valor}`);
  return opcion;
}

function construirFiltros() {
  const marcas = valoresUnicos("marca");
  const categorias = valoresUnicos("categoria");
  const tallas = tallasCatalogo();
  const grupo = $("#filtros");
  if (grupo) grupo.hidden = estado.productos.length === 0;

  // Las mismas opciones viven en los paneles de escritorio y en la hoja de celular;
  // sincronizarFiltros() mantiene ambas copias al día.
  const opcionesMarca = () => [TODOS, ...marcas].map((marca) => crearOpcion("marca", marca, marca === TODOS ? "Todas las marcas" : marca));
  const opcionesCategoria = () => [TODOS, ...categorias].map((categoria) => crearOpcion("categoria", categoria, categoria === TODOS ? "Todas las categorías" : categoria));
  const opcionesTalla = () => [TODOS, ...tallas].map(crearOpcionTalla);
  $("#filtro-marca")?.replaceChildren(...opcionesMarca());
  $("#hoja-marca")?.replaceChildren(...opcionesMarca());
  $("#filtro-categoria")?.replaceChildren(...opcionesCategoria());
  $("#hoja-categoria")?.replaceChildren(...opcionesCategoria());
  $("#filtro-talla")?.replaceChildren(...opcionesTalla());
  $("#hoja-talla")?.replaceChildren(...opcionesTalla());

  const hayNuevos = estado.productos.some((producto) => producto.nuevoIngreso);
  const chipNuevos = $("#chip-nuevos");
  if (chipNuevos) chipNuevos.hidden = !hayNuevos;
  const grupoNuevos = $("#hoja-grupo-nuevos");
  if (grupoNuevos) grupoNuevos.hidden = !hayNuevos;
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

  // Valor visible de cada campo de escritorio y marca de campo activo.
  const valores = {
    marca: estado.marca === TODOS ? "Todas" : estado.marca,
    categoria: estado.categoria === TODOS ? "Todas" : estado.categoria,
    talla: estado.talla === TODOS ? "Todas" : `EU ${estado.talla}`
  };
  $$("[data-valor-campo]").forEach((nodo) => { nodo.textContent = valores[nodo.dataset.valorCampo]; });
  $$(".campo[data-campo]").forEach((campo) => campo.toggleAttribute("data-activo", estado[campo.dataset.campo] !== TODOS));

  // Cuántos productos daría cada opción manteniendo los demás criterios.
  $$(".opcion[data-filtro], .opcion-talla[data-filtro]").forEach((opcion) => {
    const { filtro, valor } = opcion.dataset;
    if (filtro === "nuevos") return;
    const cantidad = contarCon({ [filtro]: valor });
    opcion.classList.toggle("sin-resultados", cantidad === 0);
    $(".opcion-cantidad", opcion)?.replaceChildren(String(cantidad), crearElemento("span", "sr-only", cantidad === 1 ? " producto" : " productos"));
  });

  // Resumen del acceso móvil y botón de la hoja con el total en vivo.
  const activos = [estado.marca !== TODOS, estado.categoria !== TODOS, estado.talla !== TODOS, estado.soloNuevos].filter(Boolean).length;
  const resumen = $("#resumen-filtros");
  if (resumen) resumen.textContent = activos ? `${activos} ${activos === 1 ? "activo" : "activos"}` : "Ninguno";
  $("#abrir-filtros")?.toggleAttribute("data-activo", activos > 0);
  const aplicar = $("#hoja-aplicar");
  if (aplicar) {
    const total = estado.catalogoListo ? filtrarProductos().length : 0;
    aplicar.textContent = total ? `Ver ${total} ${total === 1 ? "producto" : "productos"}` : "Sin resultados";
  }
  renderizarFiltrosActivos();
}

// Fichas de los criterios aplicados; cada una se quita por separado.
function renderizarFiltrosActivos() {
  const lista = $("#filtros-activos");
  if (!lista) return;
  const busqueda = estado.busqueda.trim();
  const activos = [
    busqueda && ["busqueda", "Búsqueda", `“${busqueda}”`],
    estado.marca !== TODOS && ["marca", "Marca", estado.marca],
    estado.categoria !== TODOS && ["categoria", "Categoría", estado.categoria],
    estado.talla !== TODOS && ["talla", "Talla", `EU ${estado.talla}`],
    estado.soloNuevos && ["nuevos", "Novedades", "Solo nuevos"]
  ].filter(Boolean);
  lista.replaceChildren(...activos.map(([tipo, etiqueta, valor]) => {
    const item = crearElemento("li");
    const boton = crearBoton("filtro-activo", [crearElemento("span", "filtro-activo-tipo", etiqueta), crearElemento("span", "filtro-activo-valor", valor), crearIcono("icono-cerrar")], { quitar: tipo });
    boton.setAttribute("aria-label", `Quitar ${etiqueta.toLowerCase()}: ${valor}`);
    item.append(boton);
    return item;
  }));
  lista.hidden = activos.length === 0;
}

// Aplica búsqueda y filtros con los criterios dados (por defecto, el estado actual).
function filtrarProductos(criterios = estado) {
  const terminos = normalizarTexto(criterios.busqueda).split(/\s+/).filter(Boolean);
  return estado.productos.filter((producto) =>
    (criterios.marca === TODOS || producto.marca === criterios.marca)
    && (criterios.categoria === TODOS || producto.categoria === criterios.categoria)
    && (!criterios.soloNuevos || producto.nuevoIngreso)
    && (criterios.talla === TODOS || (producto.disponible && producto.tallasDisponibles.includes(criterios.talla)))
    && terminos.every((termino) => producto.textoBusqueda.includes(termino)));
}

const contarCon = (cambio) => filtrarProductos({ ...estado, ...cambio }).length;

function productosFiltrados() {
  return filtrarProductos().sort(ordenadores[estado.orden] || ordenadores.destacados);
}

function limpiarFiltros({ conservarBusqueda = false } = {}) {
  if (!conservarBusqueda) {
    estado.busqueda = "";
    if ($("#buscar")) $("#buscar").value = "";
  }
  estado.marca = TODOS;
  estado.categoria = TODOS;
  estado.talla = TODOS;
  estado.soloNuevos = false;
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

function crearImagenRuta(ruta, alt, { perezosa = true, prioridad = false } = {}) {
  const imagen = new Image(800, 800);
  // El navegador pospone las imágenes perezosas que están fuera de pantalla.
  imagen.loading = perezosa ? "lazy" : "eager";
  imagen.decoding = "async";
  imagen.setAttribute("fetchpriority", prioridad ? "high" : perezosa ? "low" : "auto");
  imagen.alt = alt;
  imagen.addEventListener("error", () => {
    if (imagen.dataset.respaldo === "true") return;
    imagen.dataset.respaldo = "true";
    imagen.src = CONFIG.imagenRespaldo;
  });
  imagen.src = ruta;
  return imagen;
}

function crearImagen(producto, { perezosa = true } = {}) {
  return crearImagenRuta(producto.imagen, `Zapatillas ${nombreCompleto(producto)}, color ${producto.color}`, { perezosa, prioridad: !perezosa });
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
  tarjeta.dataset.id = producto.clave;

  const media = crearElemento("div", "tarjeta-media");
  media.append(crearImagen(producto, { perezosa: indiceVisible >= 4 }));
  const insignia = crearInsignia(producto);
  if (insignia) media.append(insignia);
  // Añadido rápido con el color y la talla que se eligieron en el detalle.
  const elegida = seleccionRecordada(producto);
  if (elegida) {
    const color = producto.variantes.length > 1 ? `, color ${elegida.variante.color}` : "";
    const rapido = crearBoton("tarjeta-rapido", [crearIcono("icono-mas"), `EU ${elegida.talla}`], { accion: "rapido" });
    rapido.setAttribute("aria-label", `Añadir ${nombreCompleto(producto)}${color}, talla EU ${elegida.talla}, al carrito`);
    rapido.title = "Añadir al carrito con el color y la talla elegidos";
    media.append(rapido);
  }

  const cuerpo = crearElemento("div", "tarjeta-cuerpo");
  const nombre = crearElemento("h3", "tarjeta-nombre");
  nombre.append(crearElemento("span", "", producto.nombre));
  const precio = crearElemento("p", "tarjeta-precio");
  // Si los colores tienen precios distintos, se indica el menor («Desde»).
  precio.append(crearElemento("span", "precio-actual", producto.precioDesde && producto.precio > 0 ? `Desde ${formatearPrecio(producto.precio)}` : formatearPrecio(producto.precio)));
  if (producto.descuento) precio.append(crearElemento("del", "precio-anterior", formatearPrecio(producto.precioAnterior)));
  // «Ver detalles» es el único control de la tarjeta; su ::after la cubre entera,
  // así que la foto y el texto también lo activan (un solo botón, un solo evento).
  // El marco vive en una «caja» interior: el botón no puede posicionarse ni transformarse sin
  // encoger ese ::after. Encima va la capa de tinta (repite el texto por CSS, no en el DOM):
  // en reposo solo asoma su celda con la flecha; al activar se abre sobre toda la caja.
  const acciones = crearElemento("div", "tarjeta-acciones");
  const flecha = crearElemento("span", "tarjeta-enlace-flecha");
  flecha.setAttribute("aria-hidden", "true");
  const tinta = crearElemento("span", "tarjeta-enlace-tinta");
  tinta.setAttribute("aria-hidden", "true");
  tinta.dataset.texto = "Ver detalles";
  tinta.append(flecha);
  const caja = crearElemento("span", "tarjeta-enlace-caja");
  caja.append(crearElemento("span", "tarjeta-enlace-texto", "Ver detalles"), tinta);
  const detalles = crearBoton("tarjeta-enlace", caja, { accion: "detalles" });
  detalles.setAttribute("aria-label", `Ver detalles de ${nombreCompleto(producto)}`);
  acciones.append(detalles);
  const meta = crearElemento("p", "tarjeta-meta", `${producto.marca} · ${producto.categoria}`);
  if (producto.variantes.length > 1) meta.append(crearElemento("span", "tarjeta-colores", ` · ${producto.variantes.length} colores`));
  cuerpo.append(meta, nombre, precio, crearTiraTallas(producto), acciones);
  if (producto.prueba) cuerpo.prepend(crearElemento("p", "sello sello-prueba", "Dato de prueba"));

  tarjeta.append(media, cuerpo);
  return tarjeta;
}

// Un toque rápido dura menos que la respuesta visual: la tinta se mantiene abierta un instante,
// mientras el detalle empieza a entrar, para que pulsar siempre se vea (también en celular).
function sostenerPulsacion(boton) {
  boton.dataset.pulsado = "";
  window.setTimeout(() => boton.removeAttribute("data-pulsado"), 420);
}

/* Con el dedo, :active no es fiable: cada navegador móvil lo activa a su manera y Safari en iOS
   ni siquiera lo aplica sin un oyente de toque. La respuesta se da aquí, al apoyar el dedo en
   cualquier punto de la tarjeta. Espera 70 ms porque un desplazamiento también empieza apoyando
   el dedo: si es eso, llega pointercancel antes y la tinta no llega a parpadear. */
const ESPERA_PULSACION_TACTIL = 70;
function iniciarPulsacionTactil() {
  const contenedor = grilla();
  if (!contenedor) return;
  let boton = null;
  let temporizador = 0;
  const soltar = () => {
    window.clearTimeout(temporizador);
    boton?.removeAttribute("data-pulsado");
    boton = null;
  };
  contenedor.addEventListener("pointerdown", (evento) => {
    if (evento.pointerType !== "touch") return;
    soltar();
    boton = evento.target.closest?.(".tarjeta-enlace") || null;
    if (boton) temporizador = window.setTimeout(() => { boton.dataset.pulsado = ""; }, ESPERA_PULSACION_TACTIL);
  }, { passive: true });
  contenedor.addEventListener("pointerup", soltar, { passive: true });
  contenedor.addEventListener("pointercancel", soltar, { passive: true });
}

// Sustituye solo la tarjeta afectada, sin volver a construir toda la grilla.
function actualizarTarjeta(clave) {
  const contenedor = grilla();
  const producto = productoPorClave(clave);
  const actual = contenedor && $(`.tarjeta[data-id="${CSS.escape(clave)}"]`, contenedor);
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
      if (dialogo === modalProducto()) cerrarDetalleLimpio();
      if (!$$("dialog.modal").some((otro) => otro.open)) document.documentElement.classList.remove("sin-desplazamiento");
      const origen = origenesFoco.get(dialogo);
      if (origen?.isConnected) origen.focus({ preventScroll: true });
    });
  });
}

/* ---------- Variante y talla elegidas ---------- */
const varianteDe = (producto, id) => producto?.variantes.find((variante) => variante.id === id) || null;

function tallaValida(producto, variante, talla) {
  return Boolean(producto && variante && variante.disponible && talla && variante.tallasDisponibles.includes(String(talla)));
}

// Selección recordada de un producto (color + talla), solo si sigue siendo válida.
function seleccionRecordada(producto) {
  const guardada = producto && estado.seleccion.get(producto.clave);
  const variante = varianteDe(producto, guardada?.variante);
  if (!variante || !tallaValida(producto, variante, guardada.talla)) return null;
  return { variante, talla: guardada.talla };
}

// Color con el que se abre el detalle: el último elegido; si hay un filtro de talla, uno que la tenga.
function varianteInicial(producto) {
  const recordada = varianteDe(producto, estado.seleccion.get(producto.clave)?.variante);
  if (recordada) return recordada;
  if (estado.talla !== TODOS) {
    const conTalla = producto.variantes.find((variante) => tallaValida(producto, variante, estado.talla));
    if (conTalla) return conTalla;
  }
  return varianteDe(producto, producto.principal) || producto.variantes[0];
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

/* ---------- Detalle del producto ----------
   Se construye una vez al abrir y después solo se actualizan las partes que cambian:
   elegir talla o cantidad no reinicia la galería; cambiar de color sí la lleva a la primera foto. */
const enDetalle = (selector) => $(selector, modalProducto());
let observadorBarra = null;
let destinoGaleria = null;
let temporizadorGaleria = 0;
let ultimoAgregado = -Infinity; // sin añadidos previos: el primero nunca se toma por doble clic

function detalleActual() {
  const producto = estado.detalle && productoPorClave(estado.detalle.clave);
  const variante = varianteDe(producto, estado.detalle?.variante);
  return producto && variante ? { producto, variante } : null;
}

function anunciarDetalle(mensaje) {
  const nodo = enDetalle("#detalle-anuncio");
  if (!nodo) return;
  nodo.textContent = "";
  window.setTimeout(() => { nodo.textContent = mensaje; }, 30);
}

function mostrarAvisoDetalle(mensaje, tipo = "error") {
  const nodo = $("#detalle-aviso");
  if (!nodo) return;
  nodo.dataset.tipo = tipo;
  nodo.textContent = mensaje;
}

function crearBotonAgregar(clase) {
  const boton = crearBoton(clase, [crearIcono("icono-bolsa"), crearElemento("span", "boton-agregar-texto", "Añadir al carrito")], { accion: "agregar" });
  return boton;
}

/* Código de barras de la etiqueta de compra: Code 39 real de la referencia de la variante (no un
   dibujo): cambia con cada color, como en la caja. Cada carácter son 9 elementos alternos
   barra/espacio, de los que 3 son anchos (w = 3 módulos, n = 1), más un espacio entre caracteres. */
const CODE_39 = {
  0: "nnnwwnwnn", 1: "wnnwnnnnw", 2: "nnwwnnnnw", 3: "wnwwnnnnn", 4: "nnnwwnnnw", 5: "wnnwwnnnn", 6: "nnwwwnnnn", 7: "nnnwnnwnw", 8: "wnnwnnwnn", 9: "nnwwnnwnn",
  A: "wnnnnwnnw", B: "nnwnnwnnw", C: "wnwnnwnnn", D: "nnnnwwnnw", E: "wnnnwwnnn", F: "nnwnwwnnn", G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn",
  K: "wnnnnnnww", L: "nnwnnnnww", M: "wnwnnnnwn", N: "nnnnwnnww", O: "wnnnwnnwn", P: "nnwnwnnwn", Q: "nnnnnnwww", R: "wnnnnnwwn", S: "nnwnnnwwn", T: "nnnnwnwwn",
  U: "wwnnnnnnw", V: "nwwnnnnnw", W: "wwwnnnnnn", X: "nwnnwnnnw", Y: "wwnnwnnnn", Z: "nwwnwnnnn", "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "$": "nwnwnwnnn",
  "/": "nwnwnnnwn", "+": "nwnnnwnwn", "%": "nnnwnwnwn", "*": "nwnnwnwnn",
};

function crearCodigoBarras(referencia) {
  const texto = String(referencia || "").toUpperCase();
  // Una referencia que Code 39 no puede representar se queda sin barras antes que con unas falsas.
  if (!texto || [...texto].some((letra) => letra === "*" || !CODE_39[letra])) return null;
  let x = 0;
  let trazo = "";
  [...`*${texto}*`].forEach((letra) => {
    [...CODE_39[letra]].forEach((tipo, indice) => {
      const ancho = tipo === "w" ? 3 : 1;
      if (indice % 2 === 0) trazo += `M${x} 0h${ancho}v1h-${ancho}z`;
      x += ancho;
    });
    x += 1;
  });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${x - 1} 1`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  const barras = document.createElementNS("http://www.w3.org/2000/svg", "path");
  barras.setAttribute("d", trazo);
  svg.append(barras);
  return svg;
}

function construirDetalle(producto) {
  const contenedor = $("#detalle-contenido");
  if (!contenedor) return;
  modalProducto().setAttribute("aria-label", `Detalles de ${nombreCompleto(producto)}`);

  /* Ruta superior: dónde está el cliente. Sigue visible al desplazar la ficha, así que nombra
     el modelo; marca y categoría van encima del nombre, no aquí. */
  const ruta = crearElemento("p", "detalle-ruta");
  ruta.append(...["Catálogo", producto.nombre].filter(Boolean).map((texto) => crearElemento("span", "", texto)));

  /* Galería: pista con desplazamiento nativo (scroll-snap), flechas, puntos y contador. */
  const galeria = crearElemento("section", "detalle-media galeria");
  galeria.setAttribute("aria-label", "Fotos del producto");
  const visor = crearElemento("div", "galeria-visor");
  const pista = crearElemento("ul", "galeria-pista");
  pista.tabIndex = 0;
  pista.setAttribute("aria-roledescription", "carrusel");
  const anterior = crearBoton("galeria-flecha galeria-anterior", crearIcono("icono-chevron"), { galeria: "-1" });
  anterior.setAttribute("aria-label", "Foto anterior");
  const siguiente = crearBoton("galeria-flecha galeria-siguiente", crearIcono("icono-chevron"), { galeria: "1" });
  siguiente.setAttribute("aria-label", "Foto siguiente");
  const sinStock = crearElemento("span", "etiqueta etiqueta-agotado", "Agotado");
  sinStock.hidden = true;
  visor.append(pista, anterior, siguiente, sinStock);
  const pie = crearElemento("div", "galeria-pie");
  const puntos = crearElemento("div", "galeria-puntos");
  puntos.setAttribute("role", "group");
  puntos.setAttribute("aria-label", "Elegir foto");
  const contador = crearElemento("p", "galeria-contador");
  contador.setAttribute("aria-hidden", "true");
  pie.append(puntos, contador);
  galeria.append(visor, pie);

  /* Información, en el orden de lectura de la ficha. */
  const info = crearElemento("div", "detalle-info");
  const cabecera = crearElemento("header", "detalle-cabecera");
  // Primer nivel: marca y categoría. Segundo nivel: el modelo, con todo el protagonismo.
  const identidad = crearElemento("p", "detalle-marca");
  identidad.append(crearElemento("span", "detalle-marca-nombre", producto.marca));
  if (producto.categoria) identidad.append(` · ${producto.categoria}`);
  const titulo = crearElemento("h2", "detalle-nombre", producto.nombre);
  titulo.id = "detalle-nombre";
  const precio = crearElemento("div", "detalle-precio detalle-precio-oferta");
  precio.id = "detalle-precio";
  cabecera.append(identidad, titulo, precio);
  if (producto.prueba) cabecera.prepend(crearElemento("p", "sello sello-prueba", "Dato de prueba · no es un producto real"));

  const colores = crearElemento("section", "detalle-bloque detalle-colores");
  const tituloColor = crearElemento("div", "detalle-bloque-titulo");
  const etiquetaColor = crearElemento("p", "detalle-etiqueta", "Color");
  etiquetaColor.id = "etiqueta-color";
  const valorColor = crearElemento("p", "detalle-valor");
  valorColor.id = "detalle-color";
  tituloColor.append(etiquetaColor, valorColor);
  const variantes = crearElemento("div", "variantes");
  variantes.setAttribute("role", "group");
  variantes.setAttribute("aria-labelledby", "etiqueta-color");
  // Con un solo color no hay nada que elegir: se nombra el color, sin miniaturas ni selector falso
  // (la foto grande ya lo muestra).
  if (producto.variantes.length > 1) {
    producto.variantes.forEach((variante) => {
      const nombreColor = `${variante.color}${variante.disponible ? "" : ", agotado"}`;
      const pieza = crearBoton("variante", crearImagenRuta(variante.imagenes[0], "", { perezosa: false }), { variante: variante.id });
      pieza.setAttribute("aria-label", nombreColor);
      pieza.title = nombreColor;
      pieza.classList.toggle("variante-agotada", !variante.disponible);
      variantes.append(pieza);
    });
    colores.append(tituloColor, variantes);
  } else {
    colores.classList.add("detalle-colores-unico");
    tituloColor.append(crearElemento("span", "variante-unica", "Único color"));
    colores.append(tituloColor);
  }

  const tallas = crearElemento("section", "detalle-bloque detalle-tallas");
  const tituloTallas = crearElemento("div", "detalle-bloque-titulo detalle-tallas-titulo");
  const etiquetaTallas = crearElemento("p", "detalle-etiqueta", "Talla EU");
  etiquetaTallas.id = "etiqueta-tallas";
  const guia = crearBoton("boton-texto detalle-guia", "Guía de tallas", { abrirGuia: "", marcaGuia: producto.marca });
  guia.setAttribute("aria-haspopup", "dialog");
  tituloTallas.append(etiquetaTallas, guia);
  const rejilla = crearElemento("div", "tallas");
  rejilla.setAttribute("role", "group");
  rejilla.setAttribute("aria-labelledby", "etiqueta-tallas");
  const nota = crearElemento("p", "tallas-nota");
  tallas.append(tituloTallas, rejilla, nota);

  const orientacion = crearElemento("div", "orientacion");
  orientacion.setAttribute("aria-live", "polite");
  const aviso = crearElemento("p", "detalle-aviso");
  aviso.id = "detalle-aviso";
  aviso.setAttribute("role", "status");

  /* La etiqueta de compra: un solo objeto impreso, como la etiqueta de la caja. Arriba, los datos
     de la variante con su código de barras y, en su celda, la talla que elige el cliente;
     debajo, sin separación, las acciones. */
  const ficha = crearElemento("dl", "detalle-ficha");
  [["Referencia", "detalle-referencia"], ["Disponibilidad", "detalle-disponibilidad"]].forEach(([clave, id]) => {
    const fila = crearElemento("div");
    const valor = crearElemento("dd");
    valor.id = id;
    fila.append(crearElemento("dt", "", clave), valor);
    ficha.append(fila);
  });
  const datos = crearElemento("div", "compra-datos");
  datos.append(ficha, crearElemento("div", "compra-barras"));
  const celdaTalla = crearElemento("div", "compra-talla");
  const valorTalla = crearElemento("p", "compra-talla-valor");
  valorTalla.id = "detalle-talla";
  celdaTalla.append(crearElemento("p", "compra-talla-rotulo", "Talla EU"), valorTalla);
  const etiquetaCompra = crearElemento("div", "compra-etiqueta");
  etiquetaCompra.append(datos, celdaTalla);

  const acciones = crearElemento("div", "detalle-acciones");
  const compra = crearElemento("div", "detalle-compra");
  compra.append(crearSelectorCantidad(estado.detalle.cantidad, "Cantidad", { cantidadDetalle: "" }), crearBotonAgregar("boton boton-comprar boton-ancho boton-agregar"));
  const pedir = crearBoton("boton boton-whatsapp-suave boton-ancho", [crearIcono("icono-whatsapp-solido"), "Pedir este par por WhatsApp"], { accion: "pedir-ahora" });
  const agotadoColor = crearBoton("boton boton-claro boton-ancho detalle-sin-stock", "Este color está agotado");
  agotadoColor.disabled = true;
  acciones.append(etiquetaCompra, compra, pedir, agotadoColor);

  info.append(cabecera, colores, tallas, orientacion, aviso, acciones);

  // «Sobre este modelo» solo con una descripción real del producto.
  if (producto.descripcion) {
    const descripcion = crearElemento("section", "detalle-bloque detalle-descripcion");
    const tituloDescripcion = crearElemento("h3", "detalle-etiqueta", "Sobre este modelo");
    tituloDescripcion.id = "detalle-sobre";
    const texto = crearElemento("p", "detalle-descripcion-texto", producto.descripcion);
    texto.id = "detalle-descripcion-texto";
    descripcion.setAttribute("aria-labelledby", "detalle-sobre");
    descripcion.append(tituloDescripcion, texto);
    if (producto.descripcion.length > 320) {
      texto.classList.add("recortada");
      const leer = crearBoton("boton-texto detalle-leer-mas", "Leer más", { leerMas: "" });
      leer.setAttribute("aria-expanded", "false");
      leer.setAttribute("aria-controls", texto.id);
      descripcion.append(leer);
    }
    info.append(descripcion);
  }

  // Barra fija de compra (celular y tableta): aparece solo cuando las acciones no están a la vista.
  const barra = crearElemento("div", "detalle-barra");
  barra.inert = true;
  barra.setAttribute("aria-hidden", "true");
  const barraPrecio = crearElemento("p", "detalle-barra-precio");
  barra.append(barraPrecio, crearBotonAgregar("boton boton-comprar boton-agregar"));

  const anuncio = crearElemento("p", "sr-only");
  anuncio.id = "detalle-anuncio";
  anuncio.setAttribute("aria-live", "polite");

  contenedor.replaceChildren(ruta, galeria, info, barra, anuncio);
  pista.addEventListener("scroll", alDesplazarGaleria, { passive: true });
  pista.addEventListener("keydown", teclaGaleria);
  pintarVariante(producto, varianteDe(producto, estado.detalle.variante));
}

// Todo lo que depende del color elegido.
function pintarVariante(producto, variante) {
  pintarGaleria(producto, variante);
  $$(".variante[data-variante]", modalProducto()).forEach((boton) => boton.setAttribute("aria-pressed", String(boton.dataset.variante === variante.id)));
  $("#detalle-color").textContent = variante.color;
  pintarPrecio($("#detalle-precio"), variante);
  const barraPrecio = enDetalle(".detalle-barra-precio");
  barraPrecio.replaceChildren(crearElemento("span", "", formatearPrecio(variante.precio)), crearElemento("span", "detalle-barra-talla"));
  pintarTallas(producto, variante);
  $("#detalle-referencia").textContent = variante.referencia;
  const barras = crearCodigoBarras(variante.referencia);
  enDetalle(".compra-barras").replaceChildren(...(barras ? [barras] : []));
  const disponibilidad = $("#detalle-disponibilidad");
  disponibilidad.textContent = variante.disponible ? "Disponible" : producto.variantes.length > 1 ? "Agotado en este color" : "Agotado";
  disponibilidad.className = `estado-stock${variante.disponible ? "" : " no"}`;
  enDetalle(".galeria .etiqueta-agotado").hidden = variante.disponible;
  // Un color agotado se puede ver, pero no comprar.
  $$(".detalle-compra, [data-accion='pedir-ahora'], .detalle-barra", modalProducto()).forEach((nodo) => nodo.classList.toggle("oculto-sin-stock", !variante.disponible));
  enDetalle(".detalle-sin-stock").hidden = variante.disponible;
}

function pintarPrecio(contenedor, variante) {
  contenedor.replaceChildren(crearElemento("span", "precio-actual", formatearPrecio(variante.precio)));
  // El descuento se muestra una sola vez, en verde junto al precio anterior.
  if (variante.descuento) {
    contenedor.append(crearElemento("del", "precio-anterior", formatearPrecio(variante.precioAnterior)));
    contenedor.append(crearElemento("span", "precio-ahorro", `${variante.descuento}% OFF`));
  }
}

function pintarTallas(producto, variante) {
  const talla = estado.detalle.talla;
  const rejilla = enDetalle(".tallas");
  rejilla.replaceChildren(...[...variante.tallasDisponibles.map((valor) => [valor, false]), ...variante.tallasAgotadas.map((valor) => [valor, true])]
    .sort((a, b) => compararTallas(a[0], b[0]))
    .map(([valor, sinStock]) => {
      const boton = crearBoton(`talla${sinStock ? " talla-agotada" : ""}`, valor, { talla: valor });
      boton.disabled = sinStock || !variante.disponible;
      boton.setAttribute("aria-pressed", String(valor === talla));
      boton.setAttribute("aria-label", boton.disabled ? `EU ${valor}, agotada` : `EU ${valor}`);
      return boton;
    }));
  // Tabla completa: en celular, ocho tallas son 4 + 4 (no 6 + 2); en escritorio, una sola fila.
  const total = Math.max(1, rejilla.children.length);
  rejilla.style.setProperty("--tallas-total", total);
  rejilla.style.setProperty("--tallas-fila", total <= 6 ? total : Math.ceil(total / 2));
  const nota = enDetalle(".tallas-nota");
  nota.textContent = !variante.disponible ? "Este color no tiene tallas disponibles." : variante.tallasAgotadas.length ? "Las tallas tachadas están agotadas en este color." : "";
  pintarTallaElegida(producto, variante);
}

// Actualiza la talla elegida sin reconstruir los botones (el foco se queda donde está).
function pintarTallaElegida(producto, variante) {
  const talla = estado.detalle.talla;
  $$(".tallas .talla", modalProducto()).forEach((boton) => boton.setAttribute("aria-pressed", String(boton.dataset.talla === talla)));
  // La talla se imprime en la celda de la etiqueta y se repite en la barra fija de compra.
  // El rótulo ya dice «Talla EU»: aquí basta el número.
  const valor = $("#detalle-talla");
  // En un color agotado no hay nada que elegir: la celda no lo pide.
  valor.textContent = talla || (variante.disponible ? "Sin elegir" : "—");
  valor.classList.toggle("pendiente", !talla);
  valor.classList.toggle("extensa", String(talla || "").length > 2);
  enDetalle(".compra-talla").toggleAttribute("data-elegida", Boolean(talla));
  const enBarra = enDetalle(".detalle-barra-talla");
  enBarra.textContent = talla ? `EU ${talla}` : "Sin talla";
  enBarra.classList.toggle("pendiente", !talla);
  pintarOrientacion(producto, talla, variante);
}

// Al elegir, el número se estampa en la etiqueta: confirma que la talla quedó impresa.
function estamparTalla() {
  const valor = $("#detalle-talla");
  if (!valor || animacionReducida()) return;
  valor.animate?.([{ transform: "scale(1.22)", opacity: 0.35 }, { transform: "none", opacity: 1 }], { duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)" });
}

function pintarOrientacion(producto, talla, variante) {
  const orientacion = enDetalle(".orientacion");
  orientacion.className = "orientacion";
  orientacion.replaceChildren();
  // Sin talla no hay nada que orientar; la talla elegida ya se lee en el rótulo de la sección.
  if (!talla) return;
  const datos = orientacionTalla(producto, talla);
  orientacion.classList.add(datos.verificada ? "verificada" : "pendiente");
  orientacion.append(crearElemento("p", "orientacion-texto", datos.texto));
  [[datos.url, producto.marca === "Jordan" ? "Consultar cómo encontrar la talla Jordan" : `Consultar guía oficial de ${producto.marca}`],
    [datos.urlAlterna, producto.marca === "Adidas" ? "Ver ayuda de tallas de adidas Colombia" : "Ver otra fuente oficial de la marca"]]
    .filter(([url]) => url)
    .forEach(([url, texto]) => {
      const fuente = crearElemento("a", "orientacion-fuente", texto);
      fuente.href = url;
      fuente.target = "_blank";
      fuente.rel = "noopener noreferrer";
      orientacion.append(fuente);
    });
}

/* ---------- Galería ---------- */
function pintarGaleria(producto, variante) {
  const galeria = enDetalle(".galeria");
  const pista = $(".galeria-pista", galeria);
  const fotos = variante.imagenes;
  const varias = fotos.length > 1;
  pista.setAttribute("aria-label", `Fotos de ${producto.nombre}, color ${variante.color}`);
  pista.replaceChildren(...fotos.map((ruta, indice) => {
    const diapositiva = crearElemento("li", "galeria-foto");
    diapositiva.setAttribute("role", "group");
    diapositiva.setAttribute("aria-roledescription", "foto");
    diapositiva.setAttribute("aria-label", `${indice + 1} de ${fotos.length}`);
    diapositiva.append(crearImagenRuta(ruta, `${nombreCompleto(producto)}, color ${variante.color}${varias ? `, foto ${indice + 1} de ${fotos.length}` : ""}`, { perezosa: false, prioridad: indice === 0 }));
    return diapositiva;
  }));
  // Un color nuevo siempre empieza en su primera foto.
  destinoGaleria = null;
  pista.scrollLeft = 0;
  estado.detalle.foto = 0;
  pista.tabIndex = varias ? 0 : -1;
  $$(".galeria-flecha", galeria).forEach((flecha) => { flecha.hidden = !varias; });
  $(".galeria-pie", galeria).hidden = !varias;
  $(".galeria-puntos", galeria).replaceChildren(...fotos.map((_, indice) => {
    const punto = crearBoton("galeria-punto", crearElemento("span"), { foto: String(indice) });
    punto.setAttribute("aria-label", `Foto ${indice + 1} de ${fotos.length}`);
    return punto;
  }));
  pintarIndicadoresGaleria();
  // El fundido de cambio de color solo con la ficha ya abierta; al abrir manda la entrada.
  if (!animacionReducida() && modalProducto().open) {
    galeria.classList.remove("cambiando");
    void galeria.offsetWidth;
    galeria.classList.add("cambiando");
  }
}

function pintarIndicadoresGaleria() {
  const galeria = enDetalle(".galeria");
  if (!galeria || !estado.detalle) return;
  const total = $(".galeria-pista", galeria).children.length;
  const actual = estado.detalle.foto;
  $(".galeria-contador", galeria).textContent = `${actual + 1} / ${total}`;
  $$(".galeria-punto", galeria).forEach((punto, indice) => {
    if (indice === actual) punto.setAttribute("aria-current", "true");
    else punto.removeAttribute("aria-current");
  });
  $(".galeria-anterior", galeria).disabled = actual <= 0;
  $(".galeria-siguiente", galeria).disabled = actual >= total - 1;
}

function irAFoto(indice) {
  const pista = enDetalle(".galeria-pista");
  if (!pista || !estado.detalle) return;
  const total = pista.children.length;
  const destino = Math.max(0, Math.min(total - 1, indice));
  if (destino === estado.detalle.foto && destinoGaleria === null) return;
  destinoGaleria = destino;
  window.clearTimeout(temporizadorGaleria);
  temporizadorGaleria = window.setTimeout(() => { destinoGaleria = null; }, 700);
  pista.scrollTo({ left: destino * pista.clientWidth, behavior: animacionReducida() ? "auto" : "smooth" });
  estado.detalle.foto = destino;
  pintarIndicadoresGaleria();
  anunciarDetalle(`Foto ${destino + 1} de ${total}`);
}

// Deslizar con el dedo o el trackpad: la foto visible manda sobre los indicadores.
let galeriaPendiente = false;
function alDesplazarGaleria(evento) {
  if (galeriaPendiente) return;
  galeriaPendiente = true;
  requestAnimationFrame(() => {
    galeriaPendiente = false;
    const pista = evento.target;
    if (!estado.detalle || !pista.isConnected) return;
    const visible = Math.round(pista.scrollLeft / Math.max(1, pista.clientWidth));
    if (destinoGaleria !== null) {
      if (visible !== destinoGaleria) return;
      destinoGaleria = null;
    }
    if (visible !== estado.detalle.foto) {
      estado.detalle.foto = visible;
      pintarIndicadoresGaleria();
    }
  });
}

function teclaGaleria(evento) {
  const pasos = { ArrowRight: 1, ArrowLeft: -1 };
  if (!estado.detalle) return;
  if (evento.key in pasos) irAFoto(estado.detalle.foto + pasos[evento.key]);
  else if (evento.key === "Home") irAFoto(0);
  else if (evento.key === "End") irAFoto(Number.MAX_SAFE_INTEGER);
  else return;
  evento.preventDefault();
}

/* ---------- Elegir color, talla y cantidad ---------- */
function elegirVariante(id) {
  const actual = detalleActual();
  if (!actual) return;
  const { producto, variante } = actual;
  const nueva = varianteDe(producto, id);
  if (!nueva || nueva.id === variante.id) return;
  const anterior = estado.detalle.talla;
  // La talla se conserva si el nuevo color la tiene disponible; si no, se limpia.
  const conserva = Boolean(anterior) && tallaValida(producto, nueva, anterior);
  estado.detalle.variante = nueva.id;
  estado.detalle.talla = conserva ? anterior : "";
  estado.seleccion.set(producto.clave, { variante: nueva.id, talla: estado.detalle.talla });
  pintarVariante(producto, nueva);
  const tallasLibres = nueva.tallasDisponibles.length;
  let mensaje = `Color ${nueva.color}. ${nueva.disponible ? `${tallasLibres} ${tallasLibres === 1 ? "talla disponible" : "tallas disponibles"}.` : "Agotado en este color."}`;
  if (anterior && conserva) mensaje += ` Se mantiene la talla EU ${anterior}.`;
  if (anterior && !conserva) {
    mensaje += ` La talla EU ${anterior} no está disponible en este color.`;
    mostrarAvisoDetalle(`La talla EU ${anterior} no está disponible en ${nueva.color}. Elige otra talla.`, "info");
  } else {
    mostrarAvisoDetalle("");
  }
  anunciarDetalle(mensaje);
  actualizarTarjeta(producto.clave);
}

function elegirTalla(talla) {
  const actual = detalleActual();
  if (!actual) return;
  const { producto, variante } = actual;
  if (!tallaValida(producto, variante, talla)) {
    mostrarAvisoDetalle("Esa talla no está disponible en este color. Elige otra talla.");
    return;
  }
  estado.detalle.talla = talla;
  estado.seleccion.set(producto.clave, { variante: variante.id, talla });
  mostrarAvisoDetalle("");
  enDetalle(".detalle-tallas")?.removeAttribute("data-requerida");
  enDetalle(".compra-etiqueta")?.removeAttribute("data-requerida");
  pintarTallaElegida(producto, variante);
  estamparTalla();
  actualizarTarjeta(producto.clave);
}

function cambiarCantidadDetalle(paso) {
  if (!estado.detalle) return;
  estado.detalle.cantidad = Math.min(CONFIG.cantidadMaxima, Math.max(1, estado.detalle.cantidad + paso));
  const anterior = enDetalle(".detalle-compra .cantidad");
  const nuevo = crearSelectorCantidad(estado.detalle.cantidad, "Cantidad", { cantidadDetalle: "" });
  anterior.replaceWith(nuevo);
  $(`[data-paso="${paso}"]:not(:disabled)`, nuevo)?.focus();
}

// Sin talla: mensaje claro, la sección se resalta con suavidad y el foco va a la primera talla libre.
function pedirTalla() {
  const bloque = enDetalle(".detalle-tallas");
  mostrarAvisoDetalle("Elige una talla EU para continuar.");
  if (bloque) {
    bloque.removeAttribute("data-requerida");
    void bloque.offsetWidth;
    bloque.setAttribute("data-requerida", "");
  }
  enDetalle(".compra-etiqueta")?.setAttribute("data-requerida", "");
  const primera = enDetalle(".tallas .talla:not(:disabled)");
  primera?.focus({ preventScroll: true });
  (primera || bloque)?.scrollIntoView({ block: "center", behavior: animacionReducida() ? "auto" : "smooth" });
}

function agregarDesdeDetalle() {
  const actual = detalleActual();
  if (!actual) return;
  const { producto, variante } = actual;
  if (!tallaValida(producto, variante, estado.detalle.talla)) { pedirTalla(); return; }
  // Un doble clic accidental no añade dos veces.
  const ahora = performance.now();
  if (ahora - ultimoAgregado < 450) return;
  ultimoAgregado = ahora;
  if (!agregarAlCarrito(producto.clave, variante.id, estado.detalle.talla, estado.detalle.cantidad)) return;
  confirmarAgregado();
}

// «Añadido ✓» durante 1,5 s en los botones de añadir (el de la ficha y el de la barra).
let temporizadorAgregado = 0;
function confirmarAgregado() {
  const botones = $$("[data-accion='agregar']", modalProducto());
  botones.forEach((boton) => {
    boton.dataset.estado = "anadido";
    $(".boton-agregar-texto", boton).textContent = "Añadido ✓";
  });
  window.clearTimeout(temporizadorAgregado);
  temporizadorAgregado = window.setTimeout(() => {
    botones.forEach((boton) => {
      delete boton.dataset.estado;
      const texto = $(".boton-agregar-texto", boton);
      if (texto) texto.textContent = "Añadir al carrito";
    });
  }, 1500);
}

function pedirDesdeDetalle() {
  const actual = detalleActual();
  if (!actual) return;
  const { producto, variante } = actual;
  if (!tallaValida(producto, variante, estado.detalle.talla)) { pedirTalla(); return; }
  enviarPedidoWhatsApp(mensajePedidoProducto(producto, variante, estado.detalle.talla, estado.detalle.cantidad));
}

function alternarDescripcion(boton) {
  const texto = $("#detalle-descripcion-texto");
  const abierta = boton.getAttribute("aria-expanded") !== "true";
  texto.classList.toggle("recortada", !abierta);
  boton.setAttribute("aria-expanded", String(abierta));
  boton.textContent = abierta ? "Leer menos" : "Leer más";
}

/* ---------- Barra fija de compra ---------- */
function activarBarraCompra() {
  observadorBarra?.disconnect();
  const caja = $(".modal-caja", modalProducto());
  // Se vigila la fila de «Añadir al carrito», no toda la etiqueta: si solo asoma la parte de
  // arriba de la etiqueta, el botón sigue sin verse y la barra debe seguir ahí.
  const compra = enDetalle(".detalle-compra");
  if (!caja || !compra || !("IntersectionObserver" in window)) return;
  observadorBarra = new IntersectionObserver(([entrada]) => mostrarBarraCompra(!entrada.isIntersecting), { root: caja, threshold: 0 });
  observadorBarra.observe(compra);
}

function mostrarBarraCompra(visible) {
  const barra = enDetalle(".detalle-barra");
  if (!barra) return;
  barra.toggleAttribute("data-visible", visible);
  barra.inert = !visible;
  barra.setAttribute("aria-hidden", String(!visible));
}

function abrirDetalles(clave, origen) {
  const producto = productoPorClave(clave);
  if (!producto) return;
  const variante = varianteInicial(producto);
  const recordada = estado.seleccion.get(clave);
  const talla = recordada?.variante === variante.id && tallaValida(producto, variante, recordada.talla) ? recordada.talla : "";
  estado.detalle = { clave, variante: variante.id, talla, cantidad: 1, foto: 0 };
  construirDetalle(producto);
  prepararEntradaDetalle();
  abrirDialogo(modalProducto(), origen);
  // Foco inicial siempre en la ficha (no en «Cerrar», que mostraba su anillo al abrir con el
  // ratón). Con teclado, el primer Tab lleva a «Cerrar»; el lector anuncia «Detalles de…».
  const caja = $(".modal-caja", modalProducto());
  caja.tabIndex = -1;
  caja.focus({ preventScroll: true });
  enDetalle(".galeria-pista").scrollLeft = 0;
  activarBarraCompra();
  iniciarEntradaDetalle();
}

/* ---------- Entrada del detalle ----------
   Construir la ficha, decodificar las fotos y calcular el diseño ocupa el hilo principal
   durante el primer fotograma (en un celular, 200 ms o más). Si la animación arrancara a la
   vez, ese tiempo se comería casi todo su recorrido y la ficha «aparecería de golpe».
   Por eso: la ficha se abre invisible («preparando»), se deja pintar un fotograma y solo
   entonces arranca la coreografía («entrada»), que el CSS escalona por piezas. */
const DURACION_ENTRADA = 1000;
let temporizadorEntrada = 0;
let entradaPendiente = 0;

function prepararEntradaDetalle() {
  const dialogo = modalProducto();
  window.clearTimeout(temporizadorEntrada);
  dialogo.removeAttribute("data-entrada");
  if (!animacionReducida()) dialogo.setAttribute("data-preparando", "");
}

function iniciarEntradaDetalle() {
  const dialogo = modalProducto();
  if (!dialogo.hasAttribute("data-preparando")) return;
  const turno = ++entradaPendiente;
  const arrancar = () => {
    // Un solo arranque por apertura, aunque lleguen el rAF y el respaldo por tiempo.
    if (turno !== entradaPendiente || !dialogo.open || !dialogo.hasAttribute("data-preparando")) return;
    dialogo.removeAttribute("data-preparando");
    dialogo.setAttribute("data-entrada", "");
    temporizadorEntrada = window.setTimeout(() => dialogo.removeAttribute("data-entrada"), DURACION_ENTRADA);
  };
  requestAnimationFrame(() => requestAnimationFrame(arrancar));
  // Respaldo: si la pestaña no pinta (en segundo plano), la ficha no se queda invisible.
  window.setTimeout(arrancar, 250);
}

function cerrarDetalleLimpio() {
  observadorBarra?.disconnect();
  observadorBarra = null;
  window.clearTimeout(temporizadorAgregado);
  window.clearTimeout(temporizadorEntrada);
  entradaPendiente += 1;
  modalProducto().removeAttribute("data-preparando");
  modalProducto().removeAttribute("data-entrada");
  devolverAvisoFlotante();
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
  // Cada apertura empieza arriba (la marca del producto va primero).
  const cuerpo = $("#guia-tallas .guia-cuerpo");
  if (cuerpo) cuerpo.scrollTop = 0;
  abrirDialogo($("#guia-tallas"), origen);
}

/* ---------- Carrito ----------
   Cada línea es producto (clave interna) + variante (color) + talla EU. Se guarda en
   CONFIG.claveCarrito (V3). El carrito V2 (producto + talla) se migra una sola vez y nunca
   se borra ni se sobrescribe. */
function leerAlmacen(clave) {
  try {
    const texto = window.localStorage.getItem(clave);
    return texto === null ? { existe: false } : { existe: true, datos: JSON.parse(texto) };
  } catch (error) {
    return { existe: true, datos: undefined, error };
  }
}

const unidades = (lineas) => lineas.reduce((suma, linea) => suma + linea.cantidad, 0);

function limpiarLineaV3(bruta) {
  const producto = limpiarTexto(bruta?.producto);
  const variante = limpiarTexto(bruta?.variante);
  const talla = limpiarTexto(bruta?.talla).replace(/^eu\s*/i, "");
  const cantidad = Math.floor(Number(bruta?.cantidad));
  if (!producto || !variante || !talla || !(cantidad > 0)) return null;
  return { producto, variante, talla, cantidad: Math.min(CONFIG.cantidadMaxima, cantidad), precio: enteroPositivo(bruta?.precio) };
}

// Devuelve { estado: "vacio" | "valido" | "invalido", lineas, pendientes }. Las líneas
// repetidas se unen y las ilegibles se descartan una a una (sin perder el resto).
function leerCarritoV3() {
  const { existe, datos } = leerAlmacen(CONFIG.claveCarrito);
  if (!existe) return { estado: "vacio", lineas: [], pendientes: [] };
  if (!datos || typeof datos !== "object" || datos.version !== 3 || !Array.isArray(datos.lineas)) return { estado: "invalido", lineas: [], pendientes: [] };
  const lineas = new Map();
  datos.lineas.forEach((bruta) => {
    const linea = limpiarLineaV3(bruta);
    if (!linea) return;
    const clave = claveLinea(linea.producto, linea.variante, linea.talla);
    const previa = lineas.get(clave);
    lineas.set(clave, previa ? { ...previa, cantidad: Math.min(CONFIG.cantidadMaxima, previa.cantidad + linea.cantidad) } : linea);
  });
  const pendientes = (Array.isArray(datos.pendientes) ? datos.pendientes : [])
    .map((bruta) => ({
      id: limpiarTexto(bruta?.id),
      talla: limpiarTexto(bruta?.talla),
      cantidad: Math.max(1, Math.floor(Number(bruta?.cantidad)) || 1),
      nombre: limpiarTexto(bruta?.nombre),
      motivo: limpiarTexto(bruta?.motivo)
    }))
    .filter((pendiente) => pendiente.id && pendiente.talla);
  return { estado: "valido", lineas: [...lineas.values()], pendientes };
}

// Carrito V2 tal como lo leía la versión anterior: [{ id, talla, cantidad }].
function leerCarritoV2() {
  if (!CONFIG.claveCarritoAnterior) return [];
  const { datos } = leerAlmacen(CONFIG.claveCarritoAnterior);
  if (!Array.isArray(datos)) return [];
  const lineas = new Map();
  datos.forEach((linea) => {
    const id = limpiarTexto(linea?.id);
    const talla = limpiarTexto(linea?.talla).replace(/^eu\s*/i, "");
    const cantidad = Math.floor(Number(linea?.cantidad));
    if (!id || !talla || !(cantidad > 0)) return;
    const clave = `${id}__${talla}`;
    const previa = lineas.get(clave);
    lineas.set(clave, { id, talla, cantidad: Math.min(CONFIG.cantidadMaxima, (previa?.cantidad || 0) + cantidad) });
  });
  return [...lineas.values()];
}

function escribirCarrito(datos) {
  try {
    window.localStorage.setItem(CONFIG.claveCarrito, JSON.stringify(datos));
    return true;
  } catch (error) {
    console.warn("No se pudo guardar el carrito:", error);
    return false;
  }
}

function guardarCarrito() {
  return escribirCarrito({ version: 3, lineas: estado.carrito, pendientes: estado.pendientes });
}

// Una línea V2 solo se asigna si el registro se identifica sin ambigüedad.
function motivoSinMigrar(producto) {
  if (!producto) return "ya no está en el catálogo";
  if (producto.variantes.length > 1) return "el modelo ahora tiene varios colores y no sabemos cuál elegiste";
  if (!producto.referenciaRepetida) return "";
  const grupo = estado.productos.filter((otro) => otro.id === producto.id);
  return grupo.every((otro) => firmaComercial(otro) === firmaComercial(producto))
    ? ""
    : "la referencia se repite en el catálogo con datos distintos";
}

/* Migración V2 → V3: solo cuando V3 no existe o es ilegible, con el catálogo ya cargado.
   1. Se traducen las líneas V2 (las dudosas quedan como «pendientes», con sus datos originales).
   2. Se guarda V3, se vuelve a leer y se comprueba que líneas y unidades coinciden.
   3. V2 queda intacto. Si la comprobación falla, V3 se retira y se avisa. */
function migrarCarritoV2() {
  // Si otra pestaña ya migró mientras esta cargaba, se adopta su carrito (no se pisa).
  const yaMigrado = leerCarritoV3();
  if (yaMigrado.estado === "valido") {
    estado.carrito = yaMigrado.lineas;
    estado.pendientes = yaMigrado.pendientes;
    return { migradas: 0, pendientes: yaMigrado.pendientes.length };
  }
  const anteriores = leerCarritoV2();
  if (!anteriores.length) return { migradas: 0, pendientes: 0 };
  const lineas = new Map();
  const pendientes = [];
  anteriores.forEach(({ id, talla, cantidad }) => {
    const producto = estado.identificadoresV2.get(id);
    const motivo = motivoSinMigrar(producto);
    if (motivo) {
      pendientes.push({ id, talla, cantidad, nombre: producto ? producto.nombre : "", motivo });
      return;
    }
    const variante = producto.variantes[0];
    const clave = claveLinea(producto.clave, variante.id, talla);
    const previa = lineas.get(clave);
    lineas.set(clave, { producto: producto.clave, variante: variante.id, talla, cantidad: Math.min(CONFIG.cantidadMaxima, (previa?.cantidad || 0) + cantidad), precio: variante.precio });
  });
  const propuesta = { version: 3, lineas: [...lineas.values()], pendientes, migradoDesde: "v2" };
  const guardado = escribirCarrito(propuesta);
  const leido = leerCarritoV3();
  const correcto = guardado && leido.estado === "valido"
    && leido.lineas.length === propuesta.lineas.length
    && unidades(leido.lineas) === unidades(propuesta.lineas)
    && leido.pendientes.length === pendientes.length
    && unidades(propuesta.lineas) + unidades(pendientes) === unidades(anteriores);
  if (!correcto) {
    try { window.localStorage.removeItem(CONFIG.claveCarrito); } catch { /* sin acceso al almacenamiento */ }
    console.error("Gama & Talla: la migración del carrito no se pudo verificar; se conserva el carrito anterior sin cambios.");
    return { error: true };
  }
  estado.carrito = leido.lineas;
  estado.pendientes = leido.pendientes;
  return { migradas: leido.lineas.length, pendientes: leido.pendientes.length };
}

// Se llama cada vez que hay catálogo; solo hace algo la primera vez.
function prepararCarrito() {
  if (estado.carritoPreparado) return;
  estado.carritoPreparado = true;
  if (estado.carritoOrigen !== "v3") {
    const resultado = migrarCarritoV2();
    if (resultado.error) {
      estado.avisoCarrito = "No pudimos actualizar tu carrito guardado. Lo conservamos tal cual; vuelve a intentarlo recargando la página.";
    } else if (resultado.pendientes) {
      estado.avisoCarrito = "Actualizamos tu carrito. Algunos productos necesitan que los elijas de nuevo.";
    } else if (estado.carritoOrigen === "invalido") {
      estado.avisoCarrito = "No pudimos leer tu carrito guardado y empezamos uno nuevo.";
    }
  }
  estado.unidadesPrevias = 0;
}

const unidadesCarrito = () => (estado.catalogoListo ? unidades(lineasCarrito()) : unidades(estado.carrito)) + (estado.carritoPreparado ? 0 : estado.unidadesPrevias);

function actualizarInsignia() {
  const total = unidadesCarrito();
  const insignia = $("#insignia-carrito");
  if (insignia) { insignia.textContent = total > 99 ? "99+" : String(total); insignia.hidden = total === 0; }
  $("#boton-carrito")?.setAttribute("aria-label", `Abrir carrito, ${total} ${total === 1 ? "unidad" : "unidades"}`);
}

function notificarCarrito(mensaje) {
  const nodo = $("#carrito-notificacion");
  if (!nodo) return;
  nodo.textContent = mensaje;
  nodo.hidden = !mensaje;
}

function resolverLinea(linea) {
  const producto = productoPorClave(linea.producto);
  const variante = varianteDe(producto, linea.variante);
  return { ...linea, producto, variante };
}

// guardar = false: solo se revisa lo que se muestra (p. ej. al recibir el carrito de otra pestaña,
// que puede tener un catálogo más reciente). No se borra nada: las líneas que esta pestaña no
// reconoce se conservan guardadas, aunque no se muestran ni se cuentan.
function validarCarrito(notificar = true, { guardar = true } = {}) {
  if (!estado.catalogoListo) return [];
  const retirados = [];
  const validas = estado.carrito.filter((linea) => {
    const { producto, variante } = resolverLinea(linea);
    if (tallaValida(producto, variante, linea.talla)) return true;
    retirados.push(producto ? `${nombreCompleto(producto)}${variante ? ` · ${variante.color}` : ""} (EU ${linea.talla})` : `${linea.producto} (EU ${linea.talla})`);
    return false;
  });
  if (retirados.length && guardar) {
    estado.carrito = validas;
    guardarCarrito();
    if (notificar) notificarCarrito(`Retiramos del carrito los productos que ya no están disponibles: ${retirados.join(", ")}.`);
  }
  actualizarInsignia();
  if (carritoDialogo()?.open) renderizarCarrito();
  return retirados;
}

function agregarAlCarrito(claveProducto, idVariante, talla, cantidad = 1) {
  const producto = productoPorClave(claveProducto);
  const variante = varianteDe(producto, idVariante);
  if (!tallaValida(producto, variante, talla)) {
    mostrarAvisoFlotante("Esa talla ya no está disponible en este color. Elige otra.", false);
    return false;
  }
  const pedido = Math.max(1, Math.min(CONFIG.cantidadMaxima, Math.floor(Number(cantidad) || 1)));
  const descripcion = `${nombreCompleto(producto)} · ${variante.color} · EU ${talla}`;
  const existente = estado.carrito.find((linea) => linea.producto === producto.clave && linea.variante === variante.id && linea.talla === String(talla));
  if (existente) {
    const total = existente.cantidad + pedido;
    existente.cantidad = Math.min(CONFIG.cantidadMaxima, total);
    existente.precio = variante.precio;
    mostrarAvisoFlotante(total > CONFIG.cantidadMaxima ? `Máximo ${CONFIG.cantidadMaxima} unidades por color y talla. ${descripcion}: ${existente.cantidad} en el carrito.` : `${descripcion} actualizado en el carrito.`, true);
  } else {
    estado.carrito.push({ producto: producto.clave, variante: variante.id, talla: String(talla), cantidad: pedido, precio: variante.precio });
    mostrarAvisoFlotante(`${descripcion} añadido al carrito.`, true);
  }
  guardarCarrito();
  actualizarInsignia();
  animarInsignia();
  return true;
}

function resumenCarrito(lineas) {
  const conPrecio = lineas.filter((linea) => linea.variante.precio > 0);
  const subtotal = conPrecio.reduce((suma, linea) => suma + linea.variante.precio * linea.cantidad, 0);
  return { unidades: unidades(lineas), subtotal, hayPorConfirmar: conPrecio.length < lineas.length, todosPorConfirmar: conPrecio.length === 0 };
}

function lineasCarrito() {
  return estado.carrito.map(resolverLinea).filter((linea) => tallaValida(linea.producto, linea.variante, linea.talla));
}

function crearMensajeCarrito(lineas) {
  const resumen = resumenCarrito(lineas);
  const partes = [`Hola, quiero consultar el siguiente pedido en ${CONFIG.tienda}:`, ""];
  if (lineas.some((linea) => linea.producto.prueba)) partes.push("Nota: pedido de prueba con productos ficticios.", "");
  lineas.forEach((linea, indice) => {
    const { producto, variante } = linea;
    partes.push(
      `*Producto ${indice + 1}*`,
      `- Modelo: ${producto.nombre}`,
      `- Marca: ${producto.marca}`,
      `- Color: ${variante.color}`,
      `- Referencia: ${variante.referencia}`,
      `- Talla: EU ${linea.talla}`,
      `- Cantidad: ${linea.cantidad}`,
      `- Precio unitario: ${precioMensaje(variante.precio)}`,
      `- Subtotal: ${variante.precio > 0 ? precioMensaje(variante.precio * linea.cantidad) : "Por confirmar"}`,
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
  const { producto, variante, talla, cantidad } = linea;
  const clave = claveLinea(producto.clave, variante.id, talla);
  const item = crearElemento("li", "linea");
  item.dataset.clave = clave;
  const media = crearElemento("div", "linea-media");
  media.append(crearImagenRuta(variante.imagenes[0], `${nombreCompleto(producto)}, color ${variante.color}`));
  const info = crearElemento("div", "linea-info");
  info.append(
    crearElemento("p", "linea-nombre", nombreCompleto(producto)),
    crearElemento("p", "linea-meta", `EU ${talla} · ${variante.color}`),
    crearElemento("p", "linea-unitario", `${formatearPrecio(variante.precio)}${variante.precio > 0 ? " c/u" : ""} · Ref. ${variante.referencia}`)
  );
  const controles = crearElemento("div", "linea-controles");
  controles.append(crearSelectorCantidad(cantidad, `Cantidad de ${nombreCompleto(producto)}, ${variante.color}, talla EU ${talla}`, { linea: clave }));
  const eliminar = crearBoton("boton-icono", crearIcono("icono-papelera"), { eliminar: clave });
  eliminar.setAttribute("aria-label", `Eliminar ${nombreCompleto(producto)}, ${variante.color}, EU ${talla} del carrito`);
  controles.append(eliminar);
  info.append(controles);
  const subtotal = crearElemento("p", "linea-subtotal", variante.precio > 0 ? pesos(variante.precio * cantidad) : "Por confirmar");
  item.append(media, info, subtotal);
  return item;
}

// Productos del carrito anterior que no se pudieron asignar con certeza: se muestran tal cual.
function crearPendientes() {
  const bloque = crearElemento("section", "carrito-pendientes");
  bloque.setAttribute("aria-labelledby", "carrito-pendientes-titulo");
  const titulo = crearElemento("h3", "", "Revisa estos productos");
  titulo.id = "carrito-pendientes-titulo";
  const lista = crearElemento("ul");
  estado.pendientes.forEach((pendiente) => {
    const item = crearElemento("li");
    item.append(
      crearElemento("strong", "", pendiente.nombre || `Referencia ${pendiente.id}`),
      crearElemento("span", "", `${pendiente.nombre ? `Ref. ${pendiente.id} · ` : ""}EU ${pendiente.talla} · ${pendiente.cantidad} ${pendiente.cantidad === 1 ? "unidad" : "unidades"}`),
      crearElemento("span", "carrito-pendiente-motivo", `No los añadimos porque ${pendiente.motivo}.`)
    );
    lista.append(item);
  });
  bloque.append(
    titulo,
    crearElemento("p", "", "Estaban en tu carrito anterior y no pudimos identificar con certeza el producto. Ábrelos desde el catálogo y vuelve a añadirlos con su color y talla."),
    lista,
    crearBoton("boton-texto", "Entendido, quitar este aviso", { descartarPendientes: "" })
  );
  return bloque;
}

function renderizarCarrito({ selectorFoco = "" } = {}) {
  const cuerpo = $("#carrito-cuerpo");
  const pie = $("#carrito-pie");
  if (!cuerpo || !pie) return;
  if (!estado.catalogoListo && (estado.carrito.length || estado.unidadesPrevias)) {
    const vacio = crearElemento("div", "carrito-vacio");
    vacio.append(crearElemento("h3", "", "No pudimos verificar el carrito"), crearElemento("p", "", "Necesitamos cargar el catálogo para comprobar los colores, las tallas y los precios."), crearBoton("boton boton-claro", "Reintentar", { reintentarCarrito: "" }));
    cuerpo.replaceChildren(vacio);
    pie.hidden = true;
    return;
  }
  const lineas = lineasCarrito();
  const bloques = estado.pendientes.length ? [crearPendientes()] : [];
  if (!lineas.length) {
    const vacio = crearElemento("div", "carrito-vacio");
    const dibujo = crearElemento("span", "carrito-vacio-icono"); dibujo.append(crearIcono("icono-bolsa"));
    const explorar = crearElemento("a", "boton boton-principal", "Explorar catálogo"); explorar.href = "#catalogo"; explorar.dataset.cerrar = "";
    vacio.append(dibujo, crearElemento("h3", "", "Tu carrito está vacío"), crearElemento("p", "", "Abre los detalles de una zapatilla, elige el color y la talla EU y añádela aquí. Puedes combinar varios pares."), explorar);
    cuerpo.replaceChildren(...bloques, vacio);
    pie.hidden = true;
    return;
  }
  const lista = crearElemento("ul", "lineas");
  lineas.forEach((linea) => lista.append(crearLineaCarrito(linea)));
  cuerpo.replaceChildren(...bloques, lista);
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
  notificarCarrito(estado.avisoCarrito || "");
  estado.avisoCarrito = "";
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
    (carritoDialogo()?.open ? carritoDialogo() : modalProducto()?.open ? modalProducto() : document.body).append(area);
    area.select();
    let resultado = false;
    try { resultado = document.execCommand("copy"); } catch { resultado = false; }
    area.remove();
    return resultado;
  }
}

// Pedido de un par desde el detalle. Si el enlace sería demasiado largo, se abre WhatsApp con un
// saludo corto y se copia el pedido completo (el mismo respaldo que usa el carrito).
async function enviarPedidoWhatsApp(mensaje) {
  if (enlaceWhatsApp(mensaje).length <= CONFIG.limiteEnlaceWhatsApp) {
    abrirWhatsApp(mensaje);
    return;
  }
  const abierto = abrirWhatsApp(`Hola, quiero consultar un pedido en ${CONFIG.tienda}. Te voy a enviar el detalle completo.`);
  const copiado = await copiarTexto(mensaje);
  mostrarAvisoDetalle(copiado ? "Copiamos el pedido completo. Pégalo en el chat de WhatsApp que se abrió." : (abierto ? "El pedido es largo. Cópialo desde el carrito y pégalo en WhatsApp." : "El pedido es largo. Ábrelo desde el carrito para copiarlo."), "info");
}

function iniciarCarrito() {
  const v3 = leerCarritoV3();
  estado.carritoOrigen = v3.estado === "valido" ? "v3" : v3.estado;
  estado.carrito = v3.lineas;
  estado.pendientes = v3.pendientes;
  // Mientras llega el catálogo, la insignia cuenta el carrito anterior que se va a migrar.
  estado.unidadesPrevias = estado.carritoOrigen === "v3" ? 0 : unidades(leerCarritoV2());
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
    if (evento.target.closest("[data-descartar-pendientes]")) {
      estado.pendientes = [];
      guardarCarrito();
      renderizarCarrito();
      $("#carrito-titulo")?.focus?.();
      return;
    }
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

  // Otra pestaña cambió el carrito V3: se adopta su versión (el V2 ya no manda tras la migración).
  window.addEventListener("storage", (evento) => {
    if (evento.key !== CONFIG.claveCarrito) return;
    const v3Actual = leerCarritoV3();
    if (v3Actual.estado !== "valido") return;
    estado.carrito = v3Actual.lineas;
    estado.pendientes = v3Actual.pendientes;
    estado.carritoOrigen = "v3";
    estado.unidadesPrevias = 0;
    validarCarrito(true, { guardar: false });
    actualizarInsignia();
    if (dialogo?.open) renderizarCarrito();
  });
}

function cambiarCantidad(clave, paso) {
  const linea = estado.carrito.find((item) => claveLinea(item.producto, item.variante, item.talla) === clave);
  if (!linea) return;
  linea.cantidad = Math.min(CONFIG.cantidadMaxima, Math.max(1, linea.cantidad + paso));
  guardarCarrito(); actualizarInsignia(); renderizarCarrito({ selectorFoco: `[data-linea="${CSS.escape(clave)}"][data-paso="${paso}"]:not(:disabled)` });
}

function eliminarLinea(clave) {
  const indice = estado.carrito.findIndex((item) => claveLinea(item.producto, item.variante, item.talla) === clave);
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
  const detalle = modalProducto();
  if (detalle?.open && aviso.parentElement !== detalle) detalle.append(aviso);
  $("#aviso-flotante-texto").textContent = mensaje;
  const boton = $("[data-abrir-carrito]", aviso);
  if (boton) boton.hidden = !conCarrito;
  aviso.hidden = false;
  void aviso.offsetWidth; // Fija el estado inicial para que la entrada se anime.
  aviso.classList.add("visible");
  window.clearTimeout(temporizadorAviso);
  temporizadorAviso = window.setTimeout(ocultarAvisoFlotante, 4500);
}

// Al cerrar el detalle, el aviso vuelve a la página y sigue visible el tiempo que le queda.
function devolverAvisoFlotante() {
  const aviso = $("#aviso-flotante");
  if (aviso && aviso.parentElement !== document.body) document.body.append(aviso);
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
  $("#limpiar-filtros")?.addEventListener("click", () => limpiarFiltros());

  // Filtros (paneles de escritorio, hoja de celular), «Novedades» y selector «Tu talla EU» de la portada.
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
    // En escritorio cada panel es de selección única: se cierra y el foco vuelve a su campo.
    const desplegable = boton.closest("[data-desplegable]");
    if (desplegable) cerrarDesplegable(desplegable, true);
    if (desdePortada && estado.talla !== TODOS) irAlCatalogo();
  });

  // Quitar un filtro desde su ficha; el foco pasa a la ficha que ocupa su lugar.
  $("#filtros-activos")?.addEventListener("click", (evento) => {
    const boton = evento.target.closest("[data-quitar]");
    if (!boton) return;
    const indice = $$("#filtros-activos [data-quitar]").indexOf(boton);
    const tipo = boton.dataset.quitar;
    if (tipo === "busqueda") {
      estado.busqueda = "";
      if ($("#buscar")) $("#buscar").value = "";
    }
    if (tipo === "nuevos") estado.soloNuevos = false;
    if (tipo === "marca" || tipo === "categoria" || tipo === "talla") estado[tipo] = TODOS;
    renderizarCatalogo();
    const restantes = $$("#filtros-activos [data-quitar]");
    (restantes[Math.min(indice, restantes.length - 1)] || $("#titulo-catalogo"))?.focus({ preventScroll: true });
  });

  // Hoja de filtros en celular y tableta.
  $("#abrir-filtros")?.addEventListener("click", (evento) => abrirDialogo($("#hoja-filtros"), evento.currentTarget));
  $("#hoja-restablecer")?.addEventListener("click", () => limpiarFiltros({ conservarBusqueda: true }));

  iniciarPulsacionTactil();

  grilla()?.addEventListener("click", (evento) => {
    const accion = evento.target.closest("[data-accion]");
    if (!accion) return;
    if (accion.dataset.accion === "reintentar") { cargarProductos(); return; }
    if (accion.dataset.accion === "limpiar") { limpiarFiltros(); return; }
    const tarjeta = accion.closest(".tarjeta");
    if (!tarjeta) return;
    if (accion.dataset.accion === "detalles") {
      sostenerPulsacion(accion);
      abrirDetalles(tarjeta.dataset.id, accion);
    }
    if (accion.dataset.accion === "rapido") {
      const producto = productoPorClave(tarjeta.dataset.id);
      const elegida = seleccionRecordada(producto);
      if (elegida) agregarAlCarrito(producto.clave, elegida.variante.id, elegida.talla, 1);
    }
  });

  const detalle = modalProducto();
  detalle?.addEventListener("click", (evento) => {
    const botonGuia = evento.target.closest("[data-abrir-guia]");
    // La guía se abre encima del detalle: el color y la talla elegidos no se pierden.
    if (botonGuia) { abrirGuia(botonGuia, botonGuia.dataset.marcaGuia || ""); return; }
    if (!detalleActual()) return;
    const variante = evento.target.closest("[data-variante]");
    if (variante) { elegirVariante(variante.dataset.variante); return; }
    const talla = evento.target.closest("[data-talla]");
    if (talla) { elegirTalla(talla.dataset.talla); return; }
    const paso = evento.target.closest("[data-cantidad-detalle]");
    if (paso) { cambiarCantidadDetalle(Number(paso.dataset.paso)); return; }
    const flecha = evento.target.closest("[data-galeria]");
    if (flecha) { irAFoto(estado.detalle.foto + Number(flecha.dataset.galeria)); return; }
    const punto = evento.target.closest("[data-foto]");
    if (punto) { irAFoto(Number(punto.dataset.foto)); return; }
    const leer = evento.target.closest("[data-leer-mas]");
    if (leer) { alternarDescripcion(leer); return; }
    const tipo = evento.target.closest("[data-accion]")?.dataset.accion;
    if (tipo === "agregar") agregarDesdeDetalle();
    if (tipo === "pedir-ahora") pedirDesdeDetalle();
  });
  // Si cambia el ancho, la galería se recoloca en la foto actual.
  window.addEventListener("resize", () => {
    const pista = detalle?.open && enDetalle(".galeria-pista");
    if (pista && estado.detalle) pista.scrollLeft = estado.detalle.foto * pista.clientWidth;
  }, { passive: true });
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

/* ---------- Campos desplegables del catálogo (escritorio) ---------- */
let cerrarDesplegable = () => {};
function iniciarDesplegables() {
  const desplegables = $$("[data-desplegable]");
  if (!desplegables.length) return;
  const campo = (desplegable) => $(".campo", desplegable);
  const opciones = (desplegable) => $$("[data-filtro]", desplegable);
  const abierto = () => desplegables.find((desplegable) => desplegable.hasAttribute("data-abierto"));

  cerrarDesplegable = (desplegable, devolverFoco = false) => {
    if (!desplegable?.hasAttribute("data-abierto")) return;
    desplegable.removeAttribute("data-abierto");
    campo(desplegable).setAttribute("aria-expanded", "false");
    if (devolverFoco) campo(desplegable).focus();
  };

  function abrir(desplegable, enfocarOpcion = false) {
    const actual = abierto();
    if (actual && actual !== desplegable) cerrarDesplegable(actual);
    desplegable.setAttribute("data-abierto", "");
    campo(desplegable).setAttribute("aria-expanded", "true");
    if (enfocarOpcion) {
      const lista = opciones(desplegable);
      (lista.find((opcion) => opcion.getAttribute("aria-pressed") === "true") || lista[0])?.focus();
    }
  }

  desplegables.forEach((desplegable) => {
    campo(desplegable).addEventListener("click", () => {
      if (desplegable.hasAttribute("data-abierto")) cerrarDesplegable(desplegable);
      else abrir(desplegable);
    });
    desplegable.addEventListener("keydown", (evento) => {
      if (evento.key === "Escape" && desplegable.hasAttribute("data-abierto")) {
        evento.preventDefault();
        cerrarDesplegable(desplegable, true);
        return;
      }
      if (evento.target === campo(desplegable) && evento.key === "ArrowDown") {
        evento.preventDefault();
        abrir(desplegable, true);
        return;
      }
      // Flechas, Inicio y Fin recorren las opciones del panel abierto.
      const lista = opciones(desplegable);
      const actual = lista.indexOf(document.activeElement);
      const pasos = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
      if (actual < 0 || !(evento.key in pasos || evento.key === "Home" || evento.key === "End")) return;
      evento.preventDefault();
      const destino = evento.key === "Home" ? 0
        : evento.key === "End" ? lista.length - 1
          : Math.min(lista.length - 1, Math.max(0, actual + pasos[evento.key]));
      lista[destino].focus();
    });
    // Si el foco sale del campo y su panel (Tab), el panel se cierra.
    desplegable.addEventListener("focusout", (evento) => {
      if (evento.relatedTarget && !desplegable.contains(evento.relatedTarget)) cerrarDesplegable(desplegable);
    });
  });

  document.addEventListener("click", (evento) => {
    const actual = abierto();
    if (actual && !actual.contains(evento.target)) cerrarDesplegable(actual);
  });
  window.matchMedia("(min-width: 960px)").addEventListener("change", () => cerrarDesplegable(abierto()));
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
  iniciarDesplegables();
  iniciarCarrito();
  iniciarGuia();
  cargarProductos();
}

iniciar();
