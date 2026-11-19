/* Panel privado de Gama & Talla · etapa 18: importar varias zapatillas desde WhatsApp.
 *
 * Se pega la descripción de cada publicación del proveedor y se añaden sus fotos originales. El
 * texto se lee en el navegador (texto-proveedor.js); las fotos se validan y convierten a WebP aquí
 * mismo (fotos.js). Nada se guarda hasta pulsar «Guardar lote como oculto».
 *
 * Garantías (las mismas del editor, que este módulo reutiliza)
 *  - Cada ficha se guarda con UNA llamada a fn_admin_guardar_producto: producto, colores, tallas y
 *    galería en una transacción. Nunca publica ni confirma tallas: las tallas nuevas nacen «por
 *    revisar» y la publicación sigue siendo la acción del panel.
 *  - Identificadores generados una vez por ficha y color. Reintentar el mismo contenido usa la misma
 *    operación: el servidor no aplica nada dos veces ni duplica la zapatilla.
 *  - Respuesta perdida: antes de reintentar se comprueba (solo lectura) si la zapatilla ya existe con
 *    la operación de este guardado.
 *  - Una ficha que falla conserva todos sus datos para corregirla y reintentar; las guardadas no se
 *    vuelven a enviar.
 *  - Fotos: se suben al guardar, con la ruta de su ficha y su color (el servidor lo exige), con
 *    nombres únicos y sin sobrescribir. Una foto ya subida no se vuelve a subir al reintentar.
 */
(() => {
  "use strict";

  const panel = () => window.GamaTallaPanel;
  const fotos = () => window.GamaTallaFotos;
  const texto = () => window.GamaTallaTextoProveedor;
  const comun = () => window.GamaTallaEditor?.comun;
  const $ = (selector, raiz = document) => raiz.querySelector(selector);
  const pesos = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
  const formatoPesos = (n) => pesos.format(n).replace(/ /g, " ");
  const mayus = (t) => String(t ?? "").toLocaleUpperCase("es");
  const uuid = () => crypto.randomUUID();
  let claves = 0;
  const nuevaClave = (prefijo) => `${prefijo}${++claves}`;

  const NOMBRES_CAMPO = { marca: "marca", modelo: "modelo", publico: "público", precio: "precio del proveedor", tallas: "tallas", color: "color", venta: "precio de venta" };
  // Valor de «Sin cambiar» en los ajustes por lote (distinto de «Sin indicar» de la guía, que es "").
  const CONSERVAR = "conservar";

  // ------------------------------------------------------------------ estado
  let lote = null;          // { fichas, margen, categoria, segmento, publico, erroresAjustes, resumenAjustes, destinos, avisoDestinos, reparto }
  let guardando = false;
  let origen = null;        // botón que abrió el importador
  let formaMuestra = null;  // ¿el servidor guarda la forma de cada color?
  const temporizadores = new Map();

  function loteNuevo() {
    /* destinos (etapa 19): fichas que recibirán los ajustes, independientes de «Incluir en el guardado».
       null = todas las editables (mientras no se elija nada); un Set de claves de ficha = elegidas a mano
       (las fichas nuevas no se añaden solas). avisoDestinos explica cambios en esa selección. */
    return { fichas: [fichaNueva()], margen: "", categoria: "", segmento: CONSERVAR, publico: CONSERVAR,
      ajustesAbiertos: false, erroresAjustes: {}, resumenAjustes: null, destinos: null, avisoDestinos: "" };
  }
  function fichaNueva() {
    return {
      clave: nuevaClave("f"), id: uuid(), seleccionada: true,
      marca: "", modelo: "", publico: "", categoria: "", segmento: "",
      editados: new Set(), revisar: new Set(), colores: [colorNuevo()],
      estado: "borrador", mensaje: "", codigo: "", pendiente: null, operaciones: new Set(), ultimaOperacion: null,
      decisionCatalogo: false, distintaDe: new Set(), errores: []
    };
  }
  function colorNuevo() {
    return {
      clave: nuevaClave("c"), id: uuid(), texto: "", color: "", proveedor: "", venta: "", ventaManual: false,
      tallasTexto: "", muestra: "", errorTono: "", forma: "circulo", fotos: [], editados: new Set(), revisar: new Set(), notas: [], omitido: null,
      // Etapa 19: el mensaje dice «todas las tallas» sin tallas concretas: las tallas salen de la regla
      // del proveedor según el público de la ficha (y cambian con él mientras no se escriban a mano).
      todas: false, notaRegla: "", expresionRegla: "",
      // Varios precios en el mensaje: candidatos para elegir el del proveedor (elegir uno cuenta como a mano).
      precios: [], notaPrecios: "",
      // Importe sumado al precio del proveedor por «Aplicar ajustes» A ESTE COLOR (null = nunca se le aplicó).
      // Es del color, no del lote: un color de una ficha fuera de los destinos no lo hereda nunca.
      margenAplicado: null
    };
  }

  const fichaDe = (claveFicha) => lote?.fichas.find((f) => f.clave === claveFicha);
  function colorDe(claveColor) {
    for (const f of lote?.fichas || []) {
      const c = f.colores.find((x) => x.clave === claveColor);
      if (c) return { ficha: f, color: c };
    }
    return null;
  }
  const editable = (f) => f.estado !== "guardada" && f.estado !== "guardando";
  const numero = (f) => lote.fichas.indexOf(f) + 1;
  const nombreFicha = (f) => [f.marca, f.modelo].map((t) => t.trim()).filter(Boolean).join(" ") || "sin nombre";
  // Etapa 19: el público identifica la versión de un mismo modelo («NIKE 7 CAMARAS · Dama»). El modelo
  // sigue escrito tal cual en su campo; el público solo se añade a la etiqueta.
  const textoPublico = (p) => comun()?.PUBLICOS.find(([v]) => v === p)?.[1] || "";
  const etiquetaFicha = (f) => [nombreFicha(f), textoPublico(f.publico)].filter(Boolean).join(" · ");

  // ------------------------------------------------------------------ utilidades de DOM
  function nodo(etiqueta, clase, contenido) {
    const n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (contenido !== undefined && contenido !== null) n.textContent = contenido;
    return n;
  }
  function boton(textoBoton, accion, clase = "boton boton-secundario boton-compacto", datos = {}) {
    const b = nodo("button", clase, textoBoton);
    b.type = "button";
    b.dataset.imp = accion;
    Object.assign(b.dataset, datos);
    return b;
  }
  function campo({ id, etiqueta, valor = "", tipo = "text", ayuda = "", lista = "", max = 0, modo = "", obligatorio = false, datos = {}, revisar = false, mayusculas = false, soloLectura = false }) {
    const caja = nodo("div", `campo${revisar ? " es-revisar" : ""}`);
    const label = nodo("label", "", etiqueta);
    label.htmlFor = id;
    if (obligatorio) label.append(nodo("span", "campo-obligatorio", " (obligatorio)"));
    if (revisar) label.append(" ", nodo("span", "importador-revisar", "Revisar"));
    const entrada = tipo === "textarea" ? nodo("textarea") : nodo("input");
    if (tipo !== "textarea") entrada.type = tipo;
    entrada.id = id;
    entrada.value = valor;
    entrada.autocomplete = "off";
    if (max) entrada.maxLength = max;
    if (modo) entrada.inputMode = modo;
    if (lista) entrada.setAttribute("list", lista);
    if (mayusculas) entrada.classList.add("campo-mayus");
    if (soloLectura) entrada.readOnly = true;
    Object.assign(entrada.dataset, datos);
    caja.append(label, entrada);
    if (ayuda) {
      const p = nodo("p", "campo-ayuda", ayuda);
      p.id = `${id}-ayuda`;
      entrada.setAttribute("aria-describedby", p.id);
      caja.append(p);
    }
    return caja;
  }
  function radios({ nombre, leyenda, opciones, valor, datos = {}, obligatorio = false, revisar = false, bloqueado = false, id }) {
    const grupo = nodo("fieldset", `editor-opciones${revisar ? " es-revisar" : ""}`);
    if (id) grupo.id = id;
    const l = nodo("legend", "", leyenda);
    if (obligatorio) l.append(nodo("span", "campo-obligatorio", " (obligatorio)"));
    if (revisar) l.append(" ", nodo("span", "importador-revisar", "Revisar"));
    grupo.append(l);
    const lista = nodo("div", "editor-opciones-lista");
    opciones.forEach(([v, t], i) => {
      const caja = nodo("label", "casilla");
      const r = nodo("input");
      r.type = "radio";
      r.name = nombre;
      r.id = `${nombre}-${i}`;
      r.value = v;
      r.checked = valor === v;
      r.disabled = bloqueado;
      Object.assign(r.dataset, datos);
      caja.append(r, nodo("span", "", t));
      lista.append(caja);
    });
    grupo.append(lista);
    return grupo;
  }

  // ------------------------------------------------------------------ catálogo y coincidencias
  const marcasCatalogo = () => [...new Set(panel().productos().map((p) => p.marca).filter(Boolean))];
  /* Marcas que el lector reconoce además de su lista base: las del catálogo (también las que se crearon a
     mano en el panel) y las escritas a mano en fichas de este lote. */
  const marcasConocidas = () => [...new Set([...marcasCatalogo(),
    ...(lote?.fichas || []).filter((f) => f.editados.has("marca") && f.marca.trim()).map((f) => mayus(f.marca.trim()))])];
  const categoriasCatalogo = () => [...new Set(panel().productos().map((p) => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  const claveFicha = (f) => texto().claveModelo(f.marca, f.modelo);

  function coincidenciasCatalogo(f) {
    const k = claveFicha(f);
    if (!k) return [];
    return panel().productos().filter((p) => texto().claveModelo(p.marca, p.nombre) === k);
  }
  /* Etapa 19: las coincidencias tienen en cuenta el público. Con la misma marca y modelo:
     - mismo público → otro color de la misma zapatilla: se propone agrupar (la ficha anterior);
     - públicos distintos → versiones independientes del modelo (Dama y Hombre): es válido y solo se
       informa;
     - falta el público en alguna de las dos → hay que elegirlo antes de decidir.
     Todo por identificadores estables de ficha (f.clave). */
  function relacionLote(f) {
    const k = claveFicha(f);
    const vacia = { agrupar: null, sinPublico: null, versiones: [] };
    if (!k || !editable(f)) return vacia;
    const i = lote.fichas.indexOf(f);
    const mismas = lote.fichas.filter((o) => o !== f && editable(o) && claveFicha(o) === k);
    const anteriores = mismas.filter((o) => lote.fichas.indexOf(o) < i && !f.distintaDe.has(o.clave));
    const agrupar = f.publico ? anteriores.find((o) => o.publico === f.publico) || null : null;
    const sinPublico = agrupar ? null : anteriores.find((o) => !f.publico || !o.publico) || null;
    const versiones = f.publico ? mismas.filter((o) => o.publico && o.publico !== f.publico) : [];
    return { agrupar, sinPublico, versiones };
  }
  // Otra ficha ANTERIOR del lote, mismo modelo y MISMO público, que no se haya marcado como distinta.
  const coincidenciaLote = (f) => relacionLote(f).agrupar;
  // Catálogo: «mismas» (mismo público, o sin clasificar) piden decidir; «otras» son versiones para otro público.
  function relacionCatalogo(f) {
    const todas = coincidenciasCatalogo(f);
    if (!f.publico) return { todas, mismas: todas, otras: [] };
    return { todas, mismas: todas.filter((p) => !p.publico || p.publico === f.publico), otras: todas.filter((p) => p.publico && p.publico !== f.publico) };
  }

  // ------------------------------------------------------------------ leer la publicación
  function aplicarTexto(f, c) {
    const r = texto().analizar(c.texto, { marcas: marcasConocidas() });
    const esPrincipal = f.colores[0] === c;
    // Solo se rellena lo que la persona no cambió a mano.
    if (esPrincipal) {
      if (!f.editados.has("marca")) f.marca = r.marca ? mayus(r.marca) : "";
      if (!f.editados.has("modelo")) f.modelo = r.modelo ? mayus(r.modelo) : "";
      if (!f.editados.has("publico")) f.publico = r.publico || "";
      for (const k of ["marca", "modelo", "publico"]) {
        if (r.revisar.includes(k) && !f.editados.has(k)) f.revisar.add(k); else f.revisar.delete(k);
      }
    }
    if (!c.editados.has("color")) c.color = r.color ? mayus(r.color) : "";
    if (!c.editados.has("proveedor")) c.proveedor = r.precio ? String(r.precio) : "";
    if (!c.editados.has("tallas")) c.tallasTexto = r.tallas.join("; ");
    for (const k of ["color", "precio", "tallas"]) {
      const campoColor = k === "precio" ? "proveedor" : k;
      if (r.revisar.includes(k) && !c.editados.has(campoColor)) c.revisar.add(k); else c.revisar.delete(k);
    }
    // Las notas de la regla dependen del público de la FICHA (que puede elegirse a mano): las pone
    // aplicarRegla. La de varios precios solo se muestra mientras no se elija uno (pintarColor).
    c.notas = r.notas.filter((n) => !r.notasRegla.includes(n) && n !== r.notaPrecios);
    c.precios = r.precios.length > 1 ? r.precios : [];
    c.notaPrecios = r.notaPrecios;
    // «Todas las tallas» o «numeración <público>» sin tallas concretas: las tallas siguen la regla.
    c.todas = r.reglaTallas && !r.tallasExplicitas;
    c.expresionRegla = r.expresionRegla;
    c.notaRegla = r.reglaTallas && r.tallasExplicitas ? r.notasRegla.join(" ") : "";
    c.omitido = r.omitido;
    if (!c.ventaManual) ventaAutomatica(c);
    aplicarRegla(f);
  }

  /* «Todas las tallas» o «numeración <público>»: las tallas de cada color que lo dice salen de la regla
     del proveedor según el público de la ficha. Unas tallas escritas a mano no se tocan. Sin público, se
     pide elegirlo. */
  function aplicarRegla(f) {
    for (const c of f.colores) {
      if (!c.todas) continue;
      if (c.editados.has("tallas")) { c.notaRegla = ""; continue; }
      const tallas = texto().tallasPorRegla(f.publico);
      c.tallasTexto = tallas.join("; ");
      c.notaRegla = texto().notaRegla(f.publico, c.expresionRegla);
      if (tallas.length) c.revisar.delete("tallas"); else c.revisar.add("tallas");
    }
  }

  // Precio de venta = proveedor + importe aplicado a ESTE color, salvo que se haya escrito a mano.
  function ventaAutomatica(c) {
    const proveedor = comun().entero(c.proveedor);
    if (c.margenAplicado === null || c.margenAplicado === undefined || !Number.isFinite(proveedor) || proveedor <= 0) return;
    c.venta = String(proveedor + c.margenAplicado);
    c.revisar.delete("venta");
  }

  // ------------------------------------------------------------------ pintar
  function pintar() {
    const cuerpo = $("#importador-cuerpo");
    if (!cuerpo || !lote) return;
    // Etapa 19: primero lo que afecta a varias fichas (ajustes plegables y fotos por lote), después las fichas.
    cuerpo.replaceChildren(pintarAjustes(), pintarReparto(), pintarListaFichas(), pintarAgregar(), pintarListas());
    pintarPie();
  }

  // Sugerencias de marca y categoría: una sola vez para todo el lote.
  function pintarListas() {
    const caja = nodo("div");
    caja.hidden = true;
    const marcas = nodo("datalist");
    marcas.id = "imp-marcas";
    for (const v of [...new Set([...marcasCatalogo(), ...texto().MARCAS_BASE.map(mayus)])]) { const o = nodo("option"); o.value = v; marcas.append(o); }
    const categorias = nodo("datalist");
    categorias.id = "imp-categorias";
    for (const v of categoriasCatalogo()) { const o = nodo("option"); o.value = v; categorias.append(o); }
    caja.append(marcas, categorias);
    return caja;
  }

  /* «Ajustes para varias fichas»: bloque plegable y secundario, debajo de las publicaciones. Se configura
     lo que se quiera cambiar y una sola acción, «Aplicar todos los ajustes», lo aplica a las fichas
     editables marcadas. «Sin cambiar» (o un campo vacío) conserva lo que tenga cada ficha. */
  function pintarAjustes() {
    const s = nodo("details", "editor-seccion importador-ajustes");
    s.id = "imp-ajustes";
    s.open = Boolean(lote.ajustesAbiertos);
    const resumen = nodo("summary", "importador-ajustes-resumen");
    resumen.append(nodo("span", "importador-ajustes-titulo", "Ajustes para varias fichas"),
      nodo("span", "importador-ajustes-pista", "Público, categoría, guía de tallas y precio de venta para todas las fichas marcadas, de una vez."));
    const nota = nodo("p", "editor-nota", "Elige las fichas que recibirán los ajustes y solo lo que quieras cambiar. Lo que quede «Sin cambiar» o vacío no se toca. Esta elección es independiente de «Incluir en el guardado»: se guarda después, con «Guardar lote como oculto».");
    const seleccion = pintarDestinos();

    const publico = radios({ nombre: "imp-lote-publico", id: "imp-lote-publico", leyenda: "Público en la tienda", valor: lote.publico,
      opciones: [[CONSERVAR, "Sin cambiar"], ...comun().PUBLICOS], datos: { lote: "publico" } });
    const categoria = campo({ id: "imp-categoria", etiqueta: "Categoría", valor: lote.categoria, lista: "imp-categorias", max: 60, mayusculas: true,
      ayuda: "Vacía: cada ficha conserva la suya. Por ejemplo: RUNNING, URBANAS, CASUALES.", datos: { lote: "categoria" } });
    const guia = radios({ nombre: "imp-segmento", id: "imp-lote-segmento", leyenda: "Tabla de la guía de tallas", valor: lote.segmento,
      opciones: [[CONSERVAR, "Sin cambiar"], ...comun().SEGMENTOS], datos: { lote: "segmento" } });
    guia.append(nodo("p", "campo-ayuda", "Independiente del público. «Sin indicar» se aplica si lo eliges expresamente."));
    const margen = campo({ id: "imp-margen", etiqueta: "Sumar al precio del proveedor (COP)", valor: lote.margen, modo: "numeric",
      ayuda: "Precio de venta = precio del proveedor + este importe, siempre desde el del proveedor (aplicarlo dos veces no suma dos veces). Vacío: los precios no cambian. Los escritos a mano se conservan.",
      datos: { lote: "margen" } });
    for (const [clave, caja] of [["categoria", categoria], ["margen", margen]]) {
      const error = lote.erroresAjustes?.[clave];
      if (!error) continue;
      const entrada = $("input", caja);
      const p = nodo("p", "campo-error", error);
      p.id = `imp-${clave}-error`;
      entrada.setAttribute("aria-invalid", "true");
      entrada.setAttribute("aria-describedby", `${p.id} ${entrada.getAttribute("aria-describedby") || ""}`.trim());
      caja.append(p);
    }

    const acciones = nodo("div", "importador-ajustes-acciones");
    const elegidas = fichasDestino().length;
    const aplicar = boton(`Aplicar ajustes a ${elegidas} ${elegidas === 1 ? "ficha" : "fichas"}`, "aplicar-ajustes", "boton boton-principal");
    aplicar.id = "imp-aplicar-ajustes";
    aplicar.setAttribute("aria-describedby", "imp-destinos-resumen");
    const estado = nodo("p", `importador-ajustes-estado${lote.resumenAjustes?.tipo === "aviso" ? " es-aviso" : ""}`, lote.resumenAjustes?.texto || "");
    estado.id = "imp-ajustes-estado";
    estado.setAttribute("role", "status");
    estado.hidden = !lote.resumenAjustes?.texto;
    acciones.append(aplicar, estado);

    s.append(resumen, nota, seleccion, publico, categoria, guia, margen, acciones);
    return s;
  }

  // ------------------------------------------------------------------ destinos de los ajustes (etapa 19)
  // Fichas que recibirán «Aplicar ajustes»: las editables elegidas (todas mientras no se elija a mano).
  const fichasDestino = () => lote.fichas.filter((f) => editable(f) && (lote.destinos === null || lote.destinos.has(f.clave)));
  const enDestinos = (f) => editable(f) && (lote.destinos === null || lote.destinos.has(f.clave));
  const listaNumeros = (fs) => {
    const n = fs.map(numero);
    return n.length > 1 ? `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}` : String(n[0] ?? "");
  };
  // Pasar a selección elegida a mano (a partir de lo que se ve marcado).
  function fijarDestinos() {
    if (lote.destinos === null) lote.destinos = new Set(lote.fichas.filter(editable).map((f) => f.clave));
    return lote.destinos;
  }
  // Aviso junto al bloque cuando una ficha cambia (nueva, agrupada, quitada o guardada) y la selección elegida no la sigue sola.
  function avisarDestinos(texto) {
    lote.avisoDestinos = texto;
    repintarAjustes();
  }

  /* Lista de fichas con una casilla cada una (número, marca, modelo y público), «Elegir todas», «Quitar
     selección» y el recuento. Las guardadas aparecen sin casilla activa. */
  function pintarDestinos() {
    const grupo = nodo("fieldset", "editor-opciones importador-destinos");
    grupo.id = "imp-destinos";
    grupo.append(nodo("legend", "", "Fichas que recibirán los ajustes"));
    const cabecera = nodo("div", "importador-destinos-cabecera");
    const editables = lote.fichas.filter(editable);
    const elegidas = fichasDestino();
    const cuenta = nodo("p", "importador-seleccion-texto", `${elegidas.length} de ${editables.length} ${editables.length === 1 ? "ficha elegida" : "fichas elegidas"}${elegidas.length ? ` (${elegidas.length === 1 ? "la" : "las"} ${listaNumeros(elegidas)})` : ""}.`);
    cuenta.id = "imp-destinos-resumen";
    cuenta.setAttribute("aria-live", "polite");
    cabecera.append(cuenta, boton("Elegir todas", "destinos-todas", "boton boton-texto boton-mini"), boton("Quitar selección", "destinos-ninguna", "boton boton-texto boton-mini"));
    const lista = nodo("ul", "importador-destinos-lista");
    for (const f of lote.fichas) {
      const li = nodo("li");
      const caja = nodo("label", "casilla");
      const check = nodo("input");
      check.type = "checkbox";
      check.id = `imp-${f.clave}-destino-ajustes`;
      check.checked = enDestinos(f);
      check.dataset.destinoAjustes = f.clave;
      if (!editable(f)) { check.disabled = true; check.dataset.bloqueado = "1"; }
      const estado = f.estado === "guardada" ? " (guardada)" : f.estado === "guardando" ? " (guardando…)" : "";
      caja.append(check, nodo("span", "", `Ficha ${numero(f)} · ${etiquetaFicha(f)}${estado}`));
      li.append(caja);
      lista.append(li);
    }
    grupo.append(cabecera, lista);
    if (lote.avisoDestinos) {
      const aviso = nodo("p", "importador-destinos-aviso", lote.avisoDestinos);
      aviso.id = "imp-destinos-aviso";
      aviso.setAttribute("role", "status");
      grupo.append(aviso);
    }
    return grupo;
  }

  function pintarListaFichas() {
    const ol = nodo("ol", "importador-fichas");
    ol.id = "imp-fichas";
    ol.setAttribute("aria-label", "Fichas del lote");
    for (const f of lote.fichas) ol.append(pintarFicha(f));
    return ol;
  }

  function pintarAgregar() {
    const caja = nodo("div", "importador-agregar");
    const b = boton("Añadir otra publicación", "agregar-ficha", "boton boton-secundario");
    b.id = "imp-agregar";
    caja.append(b, nodo("p", "campo-ayuda", "Cada publicación crea una ficha. Si dos publicaciones son la misma zapatilla en otro color, agrúpalas después: cada color conserva su mensaje, sus fotos y sus datos."));
    return caja;
  }

  function pintarFicha(f) {
    const li = nodo("li", `importador-ficha es-${f.estado}`);
    li.id = `imp-${f.clave}`;
    li.dataset.ficha = f.clave;
    const articulo = nodo("article", "editor-seccion importador-ficha-articulo");
    const titulo = nodo("h3", "editor-seccion-titulo", `Ficha ${numero(f)} · ${etiquetaFicha(f)}`);
    titulo.id = `imp-${f.clave}-titulo`;
    titulo.tabIndex = -1;
    articulo.setAttribute("aria-labelledby", titulo.id);

    const cabecera = nodo("div", "importador-ficha-cabecera");
    cabecera.append(titulo);
    if (editable(f)) {
      const incluir = nodo("label", "casilla");
      const check = nodo("input");
      check.type = "checkbox";
      check.id = `imp-${f.clave}-incluir`;
      check.checked = f.seleccionada;
      check.dataset.ficha = f.clave;
      check.dataset.fcampo = "seleccionada";
      incluir.append(check, nodo("span", "", "Incluir en el guardado"));
      cabecera.append(incluir);
      if (lote.fichas.length > 1) {
        const quitar = boton("Quitar ficha", "quitar-ficha", "boton boton-texto boton-mini", { ficha: f.clave });
        quitar.setAttribute("aria-label", `Quitar la ficha ${numero(f)} del lote`);
        cabecera.append(quitar);
      }
    }
    articulo.append(cabecera, pintarEstadoFicha(f));

    if (f.estado === "guardada") {
      li.append(articulo);
      return li;
    }
    // Cada color es una publicación: su mensaje, sus fotos, sus datos y sus ajustes, en ese orden.
    const colores = nodo("ol", "editor-variantes importador-colores");
    colores.setAttribute("aria-label", `Publicaciones de la ficha ${numero(f)}`);
    f.colores.forEach((c, i) => colores.append(pintarColor(f, c, i)));

    articulo.append(colores, pintarAgrupar(f));
    if (f.errores.length) {
      const errores = nodo("ul", "importador-errores");
      errores.id = `imp-${f.clave}-errores`;
      errores.setAttribute("role", "alert");
      errores.tabIndex = -1;
      for (const e of f.errores) errores.append(nodo("li", "", e.mensaje));
      articulo.append(errores);
    }
    li.append(articulo);
    return li;
  }

  function pintarEstadoFicha(f) {
    const caja = nodo("div", `importador-estado es-${f.estado}`);
    caja.id = `imp-${f.clave}-estado`;
    caja.setAttribute("role", "status");
    const textos = {
      borrador: "", guardando: "Guardando…",
      guardada: `Guardada oculta${f.codigo ? ` · ${f.codigo}` : ""}. Publícala y confirma sus tallas desde el panel.`,
      fallida: f.mensaje || "No se guardó.", "sin-confirmar": f.mensaje || "Resultado sin confirmar."
    };
    const t = f.estado === "guardada" && f.mensaje ? `${textos.guardada} ${f.mensaje}` : textos[f.estado];
    if (!t) { caja.hidden = true; return caja; }
    caja.append(nodo("p", "", t));
    const acciones = nodo("div", "editor-botones");
    if (f.estado === "guardada") acciones.append(boton("Abrir en el editor", "abrir-editor", "boton boton-secundario boton-compacto", { producto: f.id }));
    if (f.estado === "sin-confirmar") acciones.append(boton("Comprobar el resultado", "comprobar", "boton boton-secundario boton-compacto", { ficha: f.clave }));
    if (acciones.childElementCount) caja.append(acciones);
    return caja;
  }

  function pintarCoincidencias(f) {
    const bloques = [];
    const grupo = (clase, etiqueta) => {
      const caja = nodo("div", `importador-coincidencia ${clase}`.trim());
      caja.setAttribute("role", "group");
      caja.setAttribute("aria-label", etiqueta);
      bloques.push(caja);
      return caja;
    };
    const { agrupar: enLote, sinPublico, versiones } = relacionLote(f);
    if (enLote) {
      // Mismo modelo y mismo público: otro color de la misma zapatilla, o una zapatilla distinta.
      const caja = grupo("", "Coincidencia en el lote");
      caja.append(nodo("p", "", `Mismo modelo que la ficha ${numero(enLote)} (${nombreFicha(enLote)}), también para ${textoPublico(f.publico)}. ¿Es otro color de la misma zapatilla?`));
      const fila = nodo("div", "editor-botones");
      fila.append(boton(`Agrupar como color de la ficha ${numero(enLote)}`, "agrupar", "boton boton-principal boton-compacto", { ficha: f.clave, destino: enLote.clave }),
        boton("Son zapatillas distintas", "distinta", "boton boton-secundario boton-compacto", { ficha: f.clave, destino: enLote.clave }));
      caja.append(fila);
    } else if (sinPublico) {
      // Falta el público: no se puede saber si es otro color o una versión para otro público.
      const caja = grupo("es-pendiente", "Coincidencia en el lote");
      const falta = !f.publico ? "de esta ficha" : `de la ficha ${numero(sinPublico)}`;
      caja.append(nodo("p", "", `Mismo modelo que la ficha ${numero(sinPublico)} (${etiquetaFicha(sinPublico)}). Elige el público ${falta} para saber si es otro color de la misma zapatilla o una versión para otro público.`));
    }
    if (versiones.length) {
      // Mismo modelo, públicos distintos: versiones independientes. Es válido; solo se informa.
      const caja = grupo("es-version", "Versiones del modelo");
      const otras = versiones.map((o) => `la ficha ${numero(o)} es la versión para ${textoPublico(o.publico)}`).join("; ");
      caja.append(nodo("p", "", `Versión para ${textoPublico(f.publico)} de ${nombreFicha(f)}: ${otras}. Se guardarán como zapatillas independientes, cada una con su público.`));
    }
    const { todas: existentes, mismas, otras } = relacionCatalogo(f);
    if (existentes.length) {
      const caja = grupo(mismas.length ? "es-catalogo" : "es-version", "Ya existe en el catálogo");
      const titulo = mismas.length
        ? (f.publico ? `Este modelo ya está en el catálogo para ${textoPublico(f.publico)}${mismas.some((p) => !p.publico) ? " (o sin público)" : ""}:` : (existentes.length === 1 ? "Este modelo ya está en el catálogo:" : "Este modelo ya está en el catálogo varias veces:"))
        : `En el catálogo está este modelo para otro público (esta ficha es la versión para ${textoPublico(f.publico)}):`;
      caja.append(nodo("p", "importador-coincidencia-titulo", titulo));
      const lista = nodo("ul", "importador-existentes");
      for (const p of existentes) {
        const li = nodo("li", "importador-existente");
        const estado = p.retirado_en ? "retirada" : p.activo ? "publicada" : "oculta";
        const colores = (p.variantes || []).map((v) => v.color).filter(Boolean);
        li.append(nodo("span", "codigo", p.codigo_interno), nodo("span", "", ` ${p.nombre} · ${textoPublico(p.publico) || "sin público"} · ${estado}`),
          nodo("span", "importador-existente-colores", colores.length ? `Colores: ${colores.join(", ")}` : "Sin colores"));
        const abrir = boton("Abrir en el editor", "abrir-editor", "boton boton-secundario boton-mini", { producto: p.id });
        abrir.setAttribute("aria-label", `Abrir ${p.codigo_interno} en el editor para añadir un color o revisar una reposición`);
        li.append(abrir);
        lista.append(li);
      }
      caja.append(lista);
      if (!mismas.length) {
        caja.append(nodo("p", "campo-ayuda", `Se creará una zapatilla independiente para ${textoPublico(f.publico)}. Para añadir un color a la otra versión, ábrela en el editor.`));
      } else {
        caja.append(nodo("p", "campo-ayuda", f.publico
          ? "Para añadir este color o revisar una reposición, ábrela en el editor. Si de verdad es otra zapatilla, confírmalo:"
          : "Elige el público: si es para otro público, será una versión independiente. Para añadir este color o revisar una reposición, ábrela en el editor. Si de verdad es otra zapatilla, confírmalo:"));
        const decision = nodo("label", "casilla");
        const check = nodo("input");
        check.type = "checkbox";
        check.id = `imp-${f.clave}-decision`;
        check.checked = f.decisionCatalogo;
        check.dataset.ficha = f.clave;
        check.dataset.fcampo = "decisionCatalogo";
        decision.append(check, nodo("span", "", "Crear otra ficha con este mismo modelo de todas formas"));
        caja.append(decision);
      }
    }
    return bloques;
  }

  function pintarAgrupar(f) {
    const otras = lote.fichas.filter((o) => o !== f && editable(o));
    const caja = nodo("details", "importador-mover");
    if (!otras.length || !editable(f)) { caja.hidden = true; return caja; }
    caja.append(nodo("summary", "", "Agrupar con otra ficha"));
    // Solo fichas compatibles: con el mismo público (un color no cambia de público al agruparse).
    if (!f.publico) {
      caja.append(nodo("p", "campo-ayuda", "Elige el público de esta ficha para ver con qué fichas se puede agrupar (las del mismo público)."));
      return caja;
    }
    const compatibles = otras.filter((o) => o.publico === f.publico);
    caja.append(nodo("p", "campo-ayuda", compatibles.length
      ? `Los colores de esta ficha pasan a la ficha elegida, cada uno con su mensaje, sus fotos, precios, tallas y forma de mostrarse. Se conservan la marca y el modelo de la ficha elegida. Solo se ofrecen fichas para ${textoPublico(f.publico)}.`
      : `No hay otra ficha para ${textoPublico(f.publico)} con la que agrupar: las de otro público son zapatillas independientes.`));
    const fila = nodo("div", "editor-botones importador-mover-lista");
    for (const o of compatibles) fila.append(boton(`Mover a la ficha ${numero(o)} · ${etiquetaFicha(o)}`, "agrupar", "boton boton-secundario boton-mini", { ficha: f.clave, destino: o.clave }));
    if (compatibles.length) caja.append(fila);
    return caja;
  }

  // Un paso de la publicación: título y contenido, agrupados para los lectores de pantalla.
  function paso(clase, idTitulo, tituloPaso, ...contenido) {
    const caja = nodo("div", `importador-paso ${clase}`);
    caja.setAttribute("role", "group");
    const h = nodo("h5", "importador-paso-titulo", tituloPaso);
    h.id = idTitulo;
    caja.setAttribute("aria-labelledby", h.id);
    caja.append(h, ...contenido);
    return caja;
  }

  function pintarColor(f, c, i) {
    const li = nodo("li", "editor-variante importador-color");
    li.id = `imp-${c.clave}`;
    li.dataset.color = c.clave;
    const cab = nodo("div", "editor-variante-cabecera");
    const nombreColor = c.color.trim();
    const h = nodo("h4", "", f.colores.length > 1 ? `Color ${i + 1}${nombreColor ? ` · ${nombreColor}` : ""}` : `Publicación${nombreColor ? ` · ${nombreColor}` : ""}`);
    h.id = `imp-${c.clave}-titulo`;
    h.tabIndex = -1;
    li.setAttribute("aria-labelledby", h.id);
    cab.append(h);
    if (f.colores.length > 1) cab.append(boton("Separar en otra ficha", "separar", "boton boton-texto boton-mini", { color: c.clave }));
    li.append(cab);

    // 1. El mensaje: lo primero que se ve al abrir.
    const mensajeCaja = nodo("div", "campo importador-mensaje");
    const etiqueta = nodo("label", "importador-mensaje-etiqueta", "Pega aquí el mensaje de WhatsApp");
    etiqueta.htmlFor = `imp-${c.clave}-texto`;
    const area = nodo("textarea");
    area.id = `imp-${c.clave}-texto`;
    area.value = c.texto;
    area.rows = 6;
    area.maxLength = 4000;
    area.autocomplete = "off";
    area.spellcheck = false;
    area.placeholder = "Ejemplo:\nNew Balance 603\nHombre $115.000\n40 al 44 Euro";
    Object.assign(area.dataset, { color: c.clave, ccampo: "texto" });
    const ayudaMensaje = nodo("p", "campo-ayuda", "Se lee en este navegador. Los teléfonos y el texto promocional no pasan a la ficha.");
    ayudaMensaje.id = `imp-${c.clave}-texto-ayuda`;
    area.setAttribute("aria-describedby", ayudaMensaje.id);
    mensajeCaja.append(etiqueta, area, ayudaMensaje);
    const omitido = [];
    if (c.omitido?.telefonos) omitido.push(c.omitido.telefonos === 1 ? "un teléfono" : `${c.omitido.telefonos} teléfonos`);
    if (c.omitido?.contacto) omitido.push(c.omitido.contacto === 1 ? "una frase de contacto" : `${c.omitido.contacto} frases de contacto`);
    if (c.omitido?.promocional) omitido.push(c.omitido.promocional === 1 ? "una línea promocional" : `${c.omitido.promocional} líneas promocionales`);
    const listaOmitido = omitido.length > 1 ? `${omitido.slice(0, -1).join(", ")} y ${omitido[omitido.length - 1]}` : omitido[0];
    const avisos = [...(omitido.length ? [`Se omitió ${listaOmitido}.`] : []), ...c.notas,
      ...(c.notaPrecios && c.revisar.has("precio") ? [c.notaPrecios] : []), ...(c.notaRegla ? [c.notaRegla] : [])];
    const revisar = [...c.revisar].map((k) => NOMBRES_CAMPO[k]).concat(i === 0 ? [...f.revisar].map((k) => NOMBRES_CAMPO[k]) : []);
    if (c.texto.trim() && revisar.length) avisos.push(`Revisa: ${revisar.join(", ")}.`);
    if (avisos.length) {
      const p = nodo("p", "editor-nota importador-lectura", avisos.join(" "));
      p.id = `imp-${c.clave}-lectura`;
      p.setAttribute("role", "status");
      mensajeCaja.append(p);
    }
    li.append(mensajeCaja);

    // 2. Las fotos de esta publicación.
    li.append(pintarFotos(f, c));

    // 3. Datos reconocidos: editables; lo dudoso lleva «Revisar».
    const datos = [];
    if (i === 0) {
      datos.push(...pintarCoincidencias(f));
      const filaModelo = nodo("div", "campos-fila");
      filaModelo.append(
        campo({ id: `imp-${f.clave}-marca`, etiqueta: "Marca", valor: f.marca, max: 60, lista: "imp-marcas", obligatorio: true, mayusculas: true, revisar: f.revisar.has("marca"), datos: { ficha: f.clave, fcampo: "marca" } }),
        campo({ id: `imp-${f.clave}-modelo`, etiqueta: "Modelo", valor: f.modelo, max: 120, obligatorio: true, mayusculas: true, revisar: f.revisar.has("modelo"), datos: { ficha: f.clave, fcampo: "modelo" } }));
      datos.push(filaModelo, radios({ nombre: `imp-${f.clave}-publico`, id: `imp-${f.clave}-publico`, leyenda: "Público en la tienda", opciones: comun().PUBLICOS, valor: f.publico,
        obligatorio: true, revisar: f.revisar.has("publico"), datos: { ficha: f.clave, fcampo: "publico" } }));
    }
    const filaA = nodo("div", "campos-fila");
    filaA.append(campo({ id: `imp-${c.clave}-color`, etiqueta: "Color", valor: c.color, max: 60, obligatorio: true, mayusculas: true, revisar: c.revisar.has("color"),
      ayuda: "Por ejemplo: BLANCO CON ROJO. El cliente lo ve en la ficha.", datos: { color: c.clave, ccampo: "color" } }),
    campo({ id: `imp-${c.clave}-tallas`, etiqueta: "Tallas EU", valor: c.tallasTexto, revisar: c.revisar.has("tallas"),
      ayuda: "Separadas por punto y coma: 40; 41; 40,5; 41 1/3. También «40 al 44». Quedan «por revisar».", datos: { color: c.clave, ccampo: "tallasTexto" } }));
    const leidas = texto().leerCampoTallas(c.tallasTexto);
    const resumenTallas = nodo("p", leidas.error ? "campo-error" : "campo-ayuda importador-tallas-leidas",
      leidas.error || (leidas.tallas.length ? `${leidas.tallas.length} ${leidas.tallas.length === 1 ? "talla" : "tallas"}: ${leidas.tallas.join(" · ")}` : "Sin tallas todavía."));
    resumenTallas.id = `imp-${c.clave}-tallas-leidas`;
    resumenTallas.setAttribute("aria-live", "polite");
    filaA.lastChild.append(resumenTallas);
    const filaB = nodo("div", "campos-fila");
    const proveedor = comun().entero(c.proveedor);
    filaB.append(
      campo({ id: `imp-${c.clave}-proveedor`, etiqueta: "Precio del proveedor (COP)", valor: c.proveedor, modo: "numeric", revisar: c.revisar.has("precio"),
        ayuda: Number.isFinite(proveedor) && proveedor > 0 ? `Leído: ${formatoPesos(proveedor)}. Solo para tu revisión: no se publica.` : "Solo para tu revisión: no se publica.",
        datos: { color: c.clave, ccampo: "proveedor" } }),
      campo({ id: `imp-${c.clave}-venta`, etiqueta: "Precio de venta (COP)", valor: c.venta, modo: "numeric", obligatorio: true, revisar: c.revisar.has("venta"),
        ayuda: textoVenta(c), datos: { color: c.clave, ccampo: "venta" } }));
    datos.push(filaA, filaB);
    // Varios precios en el mensaje: se elige el del proveedor entre los leídos (o se escribe otro). Elegir
    // cuenta como corrección a mano: volver a leer el mensaje la conserva. El precio de venta es aparte.
    if (c.precios?.length > 1) {
      const proveedorActual = comun().entero(c.proveedor);
      const grupoPrecios = nodo("fieldset", `editor-opciones importador-precios${c.revisar.has("precio") ? " es-revisar" : ""}`);
      grupoPrecios.id = `imp-${c.clave}-precios`;
      const leyenda = nodo("legend", "", "Precios del mensaje: ¿cuál es el del proveedor?");
      if (c.revisar.has("precio")) leyenda.append(" ", nodo("span", "importador-revisar", "Revisar"));
      grupoPrecios.append(leyenda);
      const listaPrecios = nodo("div", "editor-opciones-lista");
      c.precios.forEach((valor, n) => {
        const caja = nodo("label", "casilla");
        const radio = nodo("input");
        radio.type = "radio";
        radio.name = `imp-${c.clave}-precio`;
        radio.id = `imp-${c.clave}-precio-${n}`;
        radio.value = String(valor);
        radio.checked = proveedorActual === valor && !c.revisar.has("precio");
        radio.dataset.color = c.clave;
        radio.dataset.cprecio = "1";
        caja.append(radio, nodo("span", "", formatoPesos(valor)));
        listaPrecios.append(caja);
      });
      grupoPrecios.append(listaPrecios);
      datos.push(grupoPrecios);
    }
    const pendientes = (i === 0 ? f.revisar.size : 0) + c.revisar.size;
    const notaDatos = nodo("p", "campo-ayuda importador-datos-nota", pendientes
      ? `${pendientes === 1 ? "Un dato necesita" : `${pendientes} datos necesitan`} revisión (marcados «Revisar»). Lo que cambies a mano no se sobrescribe al volver a leer el mensaje.`
      : "Puedes corregir cualquier dato. Lo que cambies a mano no se sobrescribe al volver a leer el mensaje.");
    li.append(paso("importador-datos", `imp-${c.clave}-datos-titulo`, "Datos reconocidos", notaDatos, ...datos));

    // 4. Ajustes adicionales: categoría y guía (de la zapatilla) y cómo se muestra este color.
    const ajustes = [];
    if (i === 0) {
      const filaCategoria = nodo("div", "campos-fila");
      filaCategoria.append(campo({ id: `imp-${f.clave}-categoria`, etiqueta: "Categoría", valor: f.categoria, max: 60, lista: "imp-categorias", obligatorio: true, mayusculas: true, datos: { ficha: f.clave, fcampo: "categoria" } }));
      ajustes.push(filaCategoria,
        radios({ nombre: `imp-${f.clave}-segmento`, leyenda: "Tabla de la guía de tallas", opciones: comun().SEGMENTOS, valor: f.segmento, datos: { ficha: f.clave, fcampo: "segmento" } }),
        nodo("p", "campo-ayuda", "El público decide dónde aparece en la tienda; la guía de tallas, qué tabla de equivalencias se muestra. Son independientes."));
    }
    const forma = comun().crearCampoPresentacion({ id: `imp-${c.clave}-forma`, idTono: `imp-${c.clave}-muestra`, nombre: nombreColor || `el color ${i + 1}`,
      forma: c.forma, muestra: c.muestra, foto: fotoPrincipal(c), bloqueadoForma: formaMuestra === false,
      datosForma: { color: c.clave, ccampo: "forma" }, datosTono: { color: c.clave, ccampo: "muestra" },
      datosSelector: { color: c.clave, cselector: "muestra" }, datosAuto: { imp: "tono-auto", color: c.clave } });
    if (c.errorTono) {
      const error = forma.querySelector(".editor-tono-error");
      if (error) { error.textContent = c.errorTono; error.hidden = false; }
      forma.querySelector("[data-tono-texto]")?.setAttribute("aria-invalid", "true");
    }
    if (formaMuestra === false) forma.append(nodo("p", "editor-nota editor-codigos-aviso", "Este servidor todavía no guarda cómo se muestra cada color (falta la migración 20261117010000_forma_muestra_color): se usará el círculo."));
    ajustes.push(forma);
    li.append(paso("importador-ajustes-color", `imp-${c.clave}-ajustes-titulo`, "Ajustes adicionales", ...ajustes));
    return li;
  }

  function textoVenta(c) {
    const venta = comun().entero(c.venta);
    const proveedor = comun().entero(c.proveedor);
    if (!String(c.venta).trim()) return "Escríbelo o usa «Aplicar precio de venta» arriba.";
    if (!Number.isFinite(venta)) return "Solo números, sin puntos ni símbolos.";
    const base = `Se guardará ${formatoPesos(venta)}.`;
    if (Number.isFinite(proveedor) && proveedor > 0) {
      const diferencia = venta - proveedor;
      return `${base} ${diferencia >= 0 ? `${formatoPesos(diferencia)} más` : `${formatoPesos(-diferencia)} menos`} que el proveedor${c.ventaManual ? " (escrito a mano)" : ""}.`;
    }
    return base;
  }

  const fotoLista = (x) => ["lista", "subida"].includes(x.estado);
  function fotoPrincipal(c) {
    const f = c.fotos.find(fotoLista);
    return f ? f.vistaPrevia : null;
  }

  function pintarFotos(f, c) {
    const caja = nodo("fieldset", "editor-fotos importador-fotos");
    caja.id = `imp-${c.clave}-fotos`;
    caja.append(nodo("legend", "", "Fotos de esta publicación"));
    const L = fotos().LIMITES;
    const zona = nodo("label", "importador-soltar");
    zona.dataset.soltar = c.clave;
    const input = nodo("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/webp,image/jpeg,image/png";
    input.className = "solo-lectores";
    input.id = `imp-${c.clave}-archivo`;
    input.dataset.archivos = c.clave;
    zona.htmlFor = input.id;
    zona.append(nodo("span", "importador-soltar-titulo", c.fotos.length ? "Añadir más fotos" : "Añadir fotos"),
      nodo("span", "importador-soltar-detalle", `Arrástralas aquí o elígelas (en el celular, desde la galería). JPEG, PNG o WebP; se convierten a WebP de hasta ${L.ladoMaximo} px, sin recortes. Hasta ${L.fotosPorColor}.`),
      input);
    const lista = nodo("ol", "editor-fotos-lista importador-fotos-lista");
    if (!c.fotos.length) lista.append(nodo("li", "editor-vacio", "Todavía no hay fotos de esta publicación."));
    c.fotos.forEach((foto, i) => lista.append(pintarFoto(c, foto, i)));
    caja.append(zona, lista);
    return caja;
  }

  function pintarFoto(c, foto, i) {
    const item = nodo("li", `editor-foto es-${foto.estado}`);
    item.dataset.foto = foto.clave;
    const marco = nodo("div", "editor-foto-marco");
    if (foto.vistaPrevia) {
      const img = nodo("img");
      img.src = foto.vistaPrevia;
      img.alt = `Foto ${i + 1} de ${c.color.trim() || "esta publicación"}`;
      marco.append(img);
    }
    const principal = i === 0 && fotoLista(foto);
    if (principal) marco.append(nodo("span", "editor-foto-principal", "Principal"));
    item.append(marco);
    const info = nodo("div", "editor-foto-info");
    const estado = { procesando: "Optimizando…", lista: "Lista · se subirá al guardar", subiendo: "Subiendo…", subida: "Subida", error: "No se puede usar" }[foto.estado];
    const linea = nodo("p", "editor-foto-estado", estado);
    linea.setAttribute("role", foto.estado === "error" ? "alert" : "status");
    info.append(linea);
    if (foto.info) {
      const p = foto.info;
      info.append(nodo("p", "editor-foto-peso", `${p.ancho}×${p.alto} px · ${fotos().peso(p.pesoOriginal)} → ${fotos().peso(p.pesoFinal)}${p.recomprimida ? "" : " (sin recomprimir)"}`));
      if (p.aviso) info.append(nodo("p", "editor-foto-aviso", p.aviso));
    }
    if (foto.mensaje) info.append(nodo("p", "editor-foto-mensaje", foto.mensaje));
    if (foto.archivoLote) info.append(nodo("p", "editor-foto-peso importador-foto-origen", `Asignada por lote · ${foto.archivoLote}`));
    const acciones = nodo("div", "editor-foto-acciones");
    const datos = { color: c.clave, foto: foto.clave };
    if (fotoLista(foto) && i > 0) {
      const b = boton("Hacer principal", "foto-principal", "boton boton-texto boton-mini", datos);
      b.setAttribute("aria-label", `Hacer principal la foto ${i + 1}`);
      acciones.append(b);
    }
    // «Quitar foto» siempre, también mientras se optimiza: la respuesta tardía no la vuelve a mostrar.
    // Durante el guardado del lote todos los botones quedan bloqueados (pintarPie).
    const quitar = boton("Quitar foto", "foto-quitar", "boton boton-secundario boton-mini editor-foto-quitar", datos);
    quitar.setAttribute("aria-label", `Quitar la foto ${i + 1} de ${c.color.trim() || "esta publicación"}`);
    acciones.append(quitar);
    info.append(acciones);
    item.append(info);
    return item;
  }

  function pintarPie() {
    const guardar = $("#importador-guardar");
    if (!guardar || !lote) return;
    const marcadas = lote.fichas.filter((f) => editable(f) && f.seleccionada).length;
    guardar.textContent = marcadas ? `Guardar lote como oculto (${marcadas})` : "Guardar lote como oculto";
    document.querySelectorAll("#importador button, #importador input, #importador textarea").forEach((n) => {
      if (n.closest("#importador-salida")) return;
      const bloquear = (guardando && !n.matches('[data-imp="cerrar"]')) || n.dataset.bloqueado === "1";
      if (n.disabled !== bloquear) n.disabled = bloquear;
    });
  }

  // Repinta una ficha conservando el foco y la posición del cursor.
  function repintarFicha(f) {
    const actual = document.getElementById(`imp-${f.clave}`);
    if (!actual) return;
    const activo = document.activeElement;
    const id = activo && actual.contains(activo) ? activo.id : null;
    const seleccion = id && typeof activo.selectionStart === "number" ? [activo.selectionStart, activo.selectionEnd] : null;
    actual.replaceWith(pintarFicha(f));
    if (id) {
      const n = document.getElementById(id);
      if (n) {
        n.focus({ preventScroll: true });
        if (seleccion && typeof n.setSelectionRange === "function") { try { n.setSelectionRange(...seleccion); } catch { /* tipo sin selección */ } }
      }
    }
    // Los destinos del reparto de fotos dependen de los nombres y de las fotos de las fichas.
    if (lote.reparto?.items.length) repintarReparto();
    pintarPie();
  }
  // Las coincidencias de las demás fichas dependen de la marca y el modelo de esta.
  function repintarOtras(f) {
    for (const o of lote.fichas) if (o !== f) repintarFicha(o);
    // La lista de destinos de los ajustes muestra la marca, el modelo y el público de cada ficha.
    repintarAjustes();
  }
  function repintarAjustes() {
    const actual = $("#imp-ajustes");
    if (!actual) return;
    const activo = document.activeElement?.id;
    actual.replaceWith(pintarAjustes());
    if (activo && document.getElementById(activo)) document.getElementById(activo).focus({ preventScroll: true });
  }

  function mensaje(textoMensaje, tipo = "info", acciones = []) {
    const caja = $("#importador-resultado");
    caja.className = `editor-resultado es-${tipo}`;
    caja.replaceChildren();
    if (!textoMensaje) return;
    caja.append(nodo("p", "", textoMensaje));
    if (acciones.length) {
      const fila = nodo("div", "editor-botones");
      for (const a of acciones) fila.append(boton(a.texto, a.accion, a.principal ? "boton boton-principal boton-compacto" : "boton boton-secundario boton-compacto"));
      caja.append(fila);
    }
  }

  // ------------------------------------------------------------------ fotos
  async function agregarArchivos(f, c, archivos) {
    const L = fotos().LIMITES;
    const libres = L.fotosPorColor - c.fotos.length;
    let lista = [...archivos].filter((a) => a instanceof Blob);
    if (!lista.length) return;
    if (lista.length > libres) {
      mensaje(`Solo caben ${Math.max(0, libres)} ${libres === 1 ? "foto" : "fotos"} más en este color (máximo ${L.fotosPorColor}).`, "aviso");
      lista = lista.slice(0, Math.max(0, libres));
    }
    const items = lista.map((archivo) => ({ clave: nuevaClave("p"), estado: "procesando", archivo }));
    c.fotos.push(...items);
    repintarFicha(f);
    const loteActual = lote;
    for (const item of items) {
      if (item.quitada) continue;
      try {
        item.info = await fotos().preparar(item.archivo);
        delete item.archivo;
        // Quitada mientras se optimizaba, o lote descartado: no vuelve a aparecer.
        if (item.quitada || lote !== loteActual) continue;
        item.blob = item.info.blob;
        item.vistaPrevia = URL.createObjectURL(item.blob);
        item.estado = "lista";
      } catch (e) {
        delete item.archivo;
        if (item.quitada || lote !== loteActual) continue;
        item.estado = "error";
        item.mensaje = e instanceof fotos().ErrorFoto ? e.message : "No pudimos procesar la foto.";
      }
      // La foto pudo cambiar de ficha (agrupar o separar mientras se optimizaba).
      const propietaria = lote.fichas.find((x) => x.colores.includes(c)) || f;
      repintarFicha(propietaria);
    }
  }

  // ------------------------------------------------------------------ asignar fotos por lote (etapa 19)
  /* Se eligen varias imágenes a la vez y cada una pasa a ser la foto principal de un color SIN fotos de
     las fichas editables marcadas: en el orden de las fichas en pantalla y, dentro de cada una, en el
     orden de sus colores. Un color con fotos (también si una se está optimizando) se salta.
     Antes de aplicar hay una revisión: miniatura, archivo y destino de cada imagen; se puede cambiar el
     orden (que es el que se usa), elegir a mano el destino de una imagen, quitarla o reemplazarla si
     falló. «Asignar fotos» aplica todo de una vez y solo al borrador: la subida sigue siendo al guardar.
     - Destinos por identificador estable de color (c.clave): agrupar o separar fichas durante la revisión
       no los cambia; un destino que deja de estar pendiente vuelve al orden (y se avisa).
     - Una imagen que falla o aún se optimiza conserva su destino: las siguientes no se corren.
     - Las imágenes se optimizan de una en una, cediendo el hilo entre ellas: la ventana sigue usable.
     - Lo asignado sale de la revisión: pulsar otra vez no duplica nada. */
  const MAX_REPARTO = 60;      // imágenes en una misma revisión (no es el límite de fotos por color)
  const NINGUNO = "ninguno";   // destino elegido a mano: «Sin destino»
  const SIN_DESTINO = "Sin destino (no se asigna)";
  let procesandoReparto = false;

  // abierto: imagen cuyo desplegable «Cambiar destino» está abierto (se conserva al repintar).
  const reparto = () => lote.reparto || (lote.reparto = { items: [], estado: null, aplicado: false, abierto: null });
  // ¿Tiene ya fotos? Cuentan las listas, las subidas y las que se están optimizando; no las que fallaron.
  const tieneFoto = (c) => c.fotos.some((x) => x.estado !== "error");
  function destinosPendientes() {
    const L = fotos().LIMITES;
    const lista = [];
    for (const f of lote.fichas) {
      if (!editable(f) || !f.seleccionada) continue;
      f.colores.forEach((c, i) => { if (!tieneFoto(c) && c.fotos.length < L.fotosPorColor) lista.push({ ficha: f, color: c, indice: i }); });
    }
    return lista;
  }
  function nombreDestino(d) {
    const nombreColor = d.color.color.trim();
    return `Ficha ${numero(d.ficha)} · ${etiquetaFicha(d.ficha)} · Color ${d.indice + 1}${nombreColor ? ` · ${nombreColor}` : ""}`;
  }
  // Destino actual de un color (puede haber cambiado de ficha o de posición).
  function destinoDe(claveColor) {
    const ref = colorDe(claveColor);
    return ref ? { ficha: ref.ficha, color: ref.color, indice: ref.ficha.colores.indexOf(ref.color) } : null;
  }

  /* Reparto actual: las imágenes con destino elegido a mano lo reservan; las demás, en el orden de la
     revisión, toman los colores pendientes que quedan. Sin color libre, la imagen queda «sin destino». */
  function calcularReparto() {
    const r = reparto();
    const pendientes = destinosPendientes();
    const porClave = new Map(pendientes.map((d) => [d.color.clave, d]));
    const reservados = new Set();
    for (const it of r.items) {
      if (!it.destino || it.destino === NINGUNO) continue;
      if (porClave.has(it.destino) && !reservados.has(it.destino)) { reservados.add(it.destino); continue; }
      it.destino = null;
      r.estado = { texto: `El destino elegido para «${it.nombre}» ya no está pendiente (tiene fotos, se desmarcó o se quitó su ficha): vuelve al orden de la revisión.`, tipo: "aviso" };
    }
    const libres = pendientes.filter((d) => !reservados.has(d.color.clave));
    const asignacion = new Map();
    for (const it of r.items) {
      if (it.destino === NINGUNO) asignacion.set(it.clave, null);
      else if (it.destino) asignacion.set(it.clave, porClave.get(it.destino));
      else asignacion.set(it.clave, libres.shift() || null);
    }
    const usados = new Set([...asignacion.values()].filter(Boolean).map((d) => d.color.clave));
    return {
      pendientes, asignacion,
      sinFoto: pendientes.filter((d) => !usados.has(d.color.clave)),
      sobrantes: r.items.filter((it) => !asignacion.get(it.clave))
    };
  }

  function pintarReparto() {
    const r = reparto();
    const s = nodo("section", "editor-seccion importador-reparto");
    s.id = "imp-reparto";
    s.setAttribute("aria-labelledby", "imp-reparto-titulo");
    const cabecera = nodo("div", "importador-reparto-cabecera");
    const titulo = nodo("h3", "editor-seccion-titulo", "Fotos para varias fichas");
    titulo.id = "imp-reparto-titulo";
    titulo.tabIndex = -1;
    const elegir = boton(r.items.length ? "Añadir más imágenes" : "Asignar fotos por lote", "reparto-elegir", "boton boton-secundario boton-compacto");
    elegir.id = "imp-reparto-elegir";
    const input = nodo("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/webp,image/jpeg,image/png";
    input.className = "solo-lectores";
    input.id = "imp-reparto-archivo";
    input.tabIndex = -1;
    input.setAttribute("aria-hidden", "true");
    input.dataset.reparto = "nuevas";
    cabecera.append(titulo, elegir, input);
    const ayuda = nodo("p", "campo-ayuda importador-reparto-ayuda", "Elige varias fotos a la vez: cada una será la foto principal de un color que aún no tiene fotos, en el orden de las fichas marcadas y de sus colores. Antes de asignarlas revisas el orden y los destinos.");
    ayuda.id = "imp-reparto-ayuda";
    elegir.setAttribute("aria-describedby", ayuda.id);
    const estado = nodo("p", `importador-reparto-estado${r.estado?.tipo === "aviso" ? " es-aviso" : ""}`, r.estado?.texto || "");
    estado.id = "imp-reparto-estado";
    estado.setAttribute("role", "status");
    estado.hidden = !r.estado?.texto;
    s.append(cabecera, ayuda, estado);
    if (r.items.length) s.append(pintarRevisionReparto(r, calcularReparto()));
    // calcularReparto pudo dejar un aviso (un destino que ya no está pendiente).
    if (r.estado?.texto) { estado.textContent = r.estado.texto; estado.hidden = false; estado.classList.toggle("es-aviso", r.estado.tipo === "aviso"); }
    return s;
  }

  function pintarRevisionReparto(r, plan) {
    const caja = nodo("div", "importador-reparto-revision");
    caja.setAttribute("role", "group");
    caja.setAttribute("aria-labelledby", "imp-reparto-revision-titulo");
    const h = nodo("h4", "importador-paso-titulo", "Revisa el reparto");
    h.id = "imp-reparto-revision-titulo";
    h.tabIndex = -1;
    const procesando = r.items.filter((it) => it.estado === "procesando").length;
    const errores = r.items.filter((it) => it.estado === "error").length;
    const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
    const resumen = nodo("p", "importador-reparto-resumen",
      `${plural(r.items.length, "imagen", "imágenes")} · ${plural(plan.pendientes.length, "color sin foto", "colores sin foto")} en las fichas marcadas.${procesando ? ` Optimizando: ${plural(procesando, "imagen pendiente", "imágenes pendientes")}…` : ""}`);
    resumen.id = "imp-reparto-resumen";
    resumen.setAttribute("aria-live", "polite");
    const herramientas = nodo("div", "importador-reparto-herramientas");
    herramientas.append(nodo("p", "campo-ayuda", "El orden de esta lista es el que se usa. Cámbialo con «Subir» y «Bajar» o elige el destino de una imagen."),
      boton("Ordenar por nombre de archivo", "reparto-ordenar", "boton boton-texto boton-mini"));

    const lista = nodo("ol", "importador-reparto-lista");
    lista.setAttribute("aria-label", "Imágenes del reparto, en orden");
    r.items.forEach((it, i) => lista.append(pintarItemReparto(r, plan, it, i)));

    const avisos = nodo("div", "importador-reparto-avisos");
    if (!plan.pendientes.length) {
      avisos.append(nodo("p", "importador-reparto-aviso", "Todas las fichas marcadas ya tienen fotos en todos sus colores: no queda ningún destino. Marca otra ficha, quita una foto o descarta el reparto."));
    } else if (plan.sinFoto.length) {
      const p = nodo("div", "importador-reparto-aviso");
      p.append(nodo("p", "", `Faltan imágenes: ${plural(plan.sinFoto.length, "color quedará", "colores quedarán")} sin foto.`));
      const ul = nodo("ul", "importador-reparto-destinos");
      for (const d of plan.sinFoto) ul.append(nodo("li", "", nombreDestino(d)));
      p.append(ul);
      avisos.append(p);
    }
    if (plan.sobrantes.length && plan.pendientes.length) {
      avisos.append(nodo("p", "importador-reparto-aviso", `Sobran imágenes: ${plan.sobrantes.map((it) => `«${it.nombre}»`).join(", ")} ${plan.sobrantes.length === 1 ? "no tiene" : "no tienen"} destino. Elige uno, cámbialas de orden o quítalas.`));
    }
    if (errores) avisos.append(nodo("p", "importador-reparto-aviso es-error", `${plural(errores, "imagen no se puede usar", "imágenes no se pueden usar")}: ${errores === 1 ? "conserva su destino; reemplázala o quítala" : "conservan su destino; reemplázalas o quítalas"}.`));
    avisos.hidden = !avisos.childElementCount;

    const acciones = nodo("div", "importador-reparto-acciones");
    const asignar = boton("Asignar fotos", "reparto-asignar", "boton boton-principal");
    asignar.id = "imp-reparto-asignar";
    const listos = r.items.filter((it) => it.estado === "lista" && plan.asignacion.get(it.clave)).length;
    if (procesando || !listos) asignar.setAttribute("aria-disabled", "true");
    asignar.setAttribute("aria-describedby", resumen.id);
    acciones.append(asignar, boton("Descartar el reparto", "reparto-descartar", "boton boton-secundario"));
    caja.append(h, resumen, herramientas, lista, avisos, acciones);
    return caja;
  }

  function pintarItemReparto(r, plan, it, i) {
    const li = nodo("li", `importador-reparto-item es-${it.estado}`);
    li.dataset.item = it.clave;
    const marco = nodo("div", "importador-reparto-miniatura");
    if (it.vistaPrevia) {
      const img = nodo("img");
      img.src = it.vistaPrevia;
      img.alt = "";
      marco.append(img);
    } else {
      marco.append(nodo("span", "", it.estado === "error" ? "Sin vista" : "…"));
    }
    const posicion = nodo("span", "importador-reparto-posicion", String(i + 1));
    posicion.setAttribute("aria-hidden", "true");
    marco.append(posicion);
    const info = nodo("div", "importador-reparto-info");
    info.append(nodo("p", "importador-reparto-archivo", it.nombre));
    const estados = { procesando: "Optimizando…", lista: it.info ? `Lista · ${it.info.ancho}×${it.info.alto} px · ${fotos().peso(it.info.pesoFinal)}` : "Lista", error: "No se puede usar" };
    const estado = nodo("p", "importador-reparto-estado-item", estados[it.estado]);
    if (it.estado === "error") estado.setAttribute("role", "alert");
    info.append(estado);
    if (it.mensaje) info.append(nodo("p", "editor-foto-mensaje", it.mensaje));

    /* Destino: el que da el orden o el elegido a mano. Se cambia con opciones (no con un <select>: el de
       WebKit en Windows inyecta un estilo interno que la política de seguridad del panel bloquea, y las
       opciones son más cómodas al tacto). Solo un desplegable abierto a la vez. */
    const destino = plan.asignacion.get(it.clave) || null;
    const campoDestino = nodo("div", "importador-reparto-destino");
    const textoDestino = nodo("p", "importador-reparto-destino-texto", "Destino: ");
    textoDestino.append(nodo("strong", "", destino ? nombreDestino(destino) : SIN_DESTINO));
    const cambiar = nodo("details", "importador-reparto-cambiar");
    cambiar.dataset.item = it.clave;
    cambiar.open = r.abierto === it.clave;
    const resumen = nodo("summary", "", "Cambiar destino");
    resumen.id = `imp-${it.clave}-cambiar`;
    resumen.setAttribute("aria-label", `Cambiar el destino de ${it.nombre}`);
    const grupo = nodo("fieldset", "editor-opciones importador-reparto-opciones");
    grupo.append(nodo("legend", "", `Destino de ${it.nombre}`));
    const lista = nodo("div", "importador-reparto-opciones-lista");
    const opciones = [...plan.pendientes.map((d) => [d.color.clave, nombreDestino(d)]), [NINGUNO, SIN_DESTINO]];
    opciones.forEach(([valor, textoOpcion], n) => {
      const caja = nodo("label", "casilla");
      const radio = nodo("input");
      radio.type = "radio";
      radio.name = `imp-${it.clave}-destino`;
      radio.id = `imp-${it.clave}-destino-${n}`;
      radio.value = valor;
      radio.checked = (destino ? destino.color.clave : NINGUNO) === valor;
      radio.dataset.repartoDestino = it.clave;
      caja.append(radio, nodo("span", "", textoOpcion));
      lista.append(caja);
    });
    grupo.append(lista);
    cambiar.append(resumen, grupo);
    campoDestino.append(textoDestino, cambiar);
    if (it.destino) {
      const fila = nodo("p", "importador-reparto-manual");
      fila.append(nodo("span", "importador-revisar", "Elegido a mano"), " ");
      const volver = boton("Volver al orden", "reparto-orden", "boton boton-texto boton-mini", { item: it.clave });
      volver.setAttribute("aria-label", `Volver al orden para ${it.nombre}`);
      fila.append(volver);
      campoDestino.append(fila);
    }
    info.append(campoDestino);

    const acciones = nodo("div", "importador-reparto-botones");
    const subir = boton("Subir", "reparto-subir", "boton boton-secundario boton-mini", { item: it.clave });
    subir.setAttribute("aria-label", `Subir ${it.nombre} una posición`);
    if (i === 0) subir.setAttribute("aria-disabled", "true");
    const bajar = boton("Bajar", "reparto-bajar", "boton boton-secundario boton-mini", { item: it.clave });
    bajar.setAttribute("aria-label", `Bajar ${it.nombre} una posición`);
    if (i === r.items.length - 1) bajar.setAttribute("aria-disabled", "true");
    acciones.append(subir, bajar);
    if (it.estado === "error") {
      const reemplazar = nodo("label", "boton boton-secundario boton-mini importador-reparto-reemplazar", "Reemplazar");
      const archivo = nodo("input");
      archivo.type = "file";
      archivo.accept = "image/webp,image/jpeg,image/png";
      archivo.className = "solo-lectores";
      archivo.id = `imp-${it.clave}-reemplazar`;
      archivo.dataset.reparto = "reemplazar";
      archivo.dataset.item = it.clave;
      archivo.setAttribute("aria-label", `Reemplazar ${it.nombre}`);
      reemplazar.htmlFor = archivo.id;
      reemplazar.append(archivo);
      acciones.append(reemplazar);
    }
    const quitar = boton("Quitar", "reparto-quitar", "boton boton-texto boton-mini", { item: it.clave });
    quitar.setAttribute("aria-label", `Quitar ${it.nombre} del reparto`);
    acciones.append(quitar);
    info.append(acciones);
    li.append(marco, info);
    return li;
  }

  // Repinta la sección conservando el foco (por id o por la acción y la imagen del botón enfocado).
  function repintarReparto() {
    const actual = $("#imp-reparto");
    if (!actual || !lote) return;
    const activo = document.activeElement;
    const dentro = activo && actual.contains(activo);
    const id = dentro ? activo.id : "";
    const accion = dentro ? activo.dataset?.imp : "";
    const item = dentro ? activo.dataset?.item : "";
    actual.replaceWith(pintarReparto());
    if (!dentro) return;
    const destino = (id && document.getElementById(id))
      || (accion && document.querySelector(`#imp-reparto [data-imp="${accion}"]${item ? `[data-item="${item}"]` : ""}`))
      || $("#imp-reparto-titulo");
    destino?.focus({ preventScroll: true });
  }

  function estadoReparto(textoEstado, tipo = "ok") {
    reparto().estado = textoEstado ? { texto: textoEstado, tipo } : null;
    repintarReparto();
  }

  // «Asignar fotos por lote»: abre el selector de archivos solo si hay algún color esperando foto.
  function elegirReparto() {
    if (!lote.fichas.some((f) => editable(f) && f.seleccionada)) { estadoReparto("Marca al menos una ficha con «Incluir en el guardado».", "aviso"); return; }
    if (!destinosPendientes().length) { estadoReparto("Todas las fichas marcadas ya tienen fotos en todos sus colores: no hay a dónde asignar.", "aviso"); return; }
    $("#imp-reparto-archivo")?.click();
  }

  function agregarAlReparto(archivos) {
    const r = reparto();
    let lista = [...archivos].filter((a) => a instanceof Blob);
    if (!lista.length) return;
    const libres = MAX_REPARTO - r.items.length;
    let aviso = "";
    if (lista.length > libres) {
      aviso = `La revisión admite ${MAX_REPARTO} imágenes a la vez: se añadieron ${Math.max(0, libres)}. Asigna estas y elige las demás después.`;
      lista = lista.slice(0, Math.max(0, libres));
    }
    for (const archivo of lista) r.items.push({ clave: nuevaClave("r"), nombre: archivo.name || "imagen sin nombre", archivo, version: 1, estado: "procesando", destino: null });
    r.aplicado = false;
    r.estado = aviso ? { texto: aviso, tipo: "aviso" } : null;
    repintarReparto();
    $("#imp-reparto-revision-titulo")?.focus({ preventScroll: true });
    $("#imp-reparto")?.scrollIntoView({ block: "start" });
    procesarReparto();
  }

  // Optimiza las imágenes de una en una (validación y WebP de fotos.js) y repinta cada una al terminar.
  async function procesarReparto() {
    if (procesandoReparto) return;
    procesandoReparto = true;
    const loteActual = lote;
    try {
      for (;;) {
        if (!lote || lote !== loteActual) break;
        const it = reparto().items.find((x) => x.estado === "procesando" && !x.enCurso);
        if (!it) break;
        it.enCurso = true;
        const version = it.version;
        let info = null;
        let error = "";
        try { info = await fotos().preparar(it.archivo); } catch (e) { error = e instanceof fotos().ErrorFoto ? e.message : "No pudimos procesar la imagen."; }
        it.enCurso = false;
        // Quitada, reemplazada o lote descartado mientras se optimizaba: este resultado ya no vale.
        if (it.quitada || it.version !== version || lote !== loteActual) continue;
        delete it.archivo;
        if (info) {
          it.info = info;
          it.blob = info.blob;
          it.vistaPrevia = URL.createObjectURL(info.blob);
          it.estado = "lista";
        } else {
          it.estado = "error";
          it.mensaje = error;
        }
        repintarReparto();
        await new Promise((resolver) => setTimeout(resolver, 0)); // cede el hilo entre imagen e imagen
      }
    } finally {
      procesandoReparto = false;
    }
  }

  const itemDe = (claveItem) => reparto().items.find((x) => x.clave === claveItem);
  function soltarItem(it) {
    it.quitada = true;
    if (it.vistaPrevia) URL.revokeObjectURL(it.vistaPrevia);
  }

  function moverItem(claveItem, paso) {
    const r = reparto();
    const i = r.items.findIndex((x) => x.clave === claveItem);
    const j = i + paso;
    if (i < 0 || j < 0 || j >= r.items.length) return;
    [r.items[i], r.items[j]] = [r.items[j], r.items[i]];
    r.aplicado = false;
    r.estado = { texto: `«${r.items[j].nombre}» ahora es la ${j + 1}.ª imagen.`, tipo: "ok" };
    repintarReparto();
    // El foco sigue a la imagen movida; en un extremo pasa al otro botón.
    const otro = paso < 0 ? "reparto-bajar" : "reparto-subir";
    const mismo = paso < 0 ? "reparto-subir" : "reparto-bajar";
    const enExtremo = paso < 0 ? j === 0 : j === r.items.length - 1;
    document.querySelector(`#imp-reparto [data-imp="${enExtremo ? otro : mismo}"][data-item="${claveItem}"]`)?.focus({ preventScroll: false });
  }

  function elegirDestino(claveItem, valor) {
    const r = reparto();
    const it = itemDe(claveItem);
    if (!it) return;
    if (valor !== NINGUNO) for (const otro of r.items) if (otro !== it && otro.destino === valor) otro.destino = null;
    it.destino = valor || null;
    r.aplicado = false;
    r.abierto = null;
    const destino = calcularReparto().asignacion.get(it.clave);
    r.estado = { texto: `«${it.nombre}» → ${destino ? nombreDestino(destino) : SIN_DESTINO}.`, tipo: "ok" };
    repintarReparto();
    document.getElementById(`imp-${it.clave}-cambiar`)?.focus({ preventScroll: true });
  }

  function quitarDelReparto(claveItem) {
    const r = reparto();
    const i = r.items.findIndex((x) => x.clave === claveItem);
    if (i < 0) return;
    const [it] = r.items.splice(i, 1);
    soltarItem(it);
    r.aplicado = false;
    r.estado = { texto: `«${it.nombre}» se quitó del reparto.`, tipo: "ok" };
    repintarReparto();
    const siguiente = r.items[Math.min(i, r.items.length - 1)];
    (siguiente ? document.querySelector(`#imp-reparto [data-imp="reparto-quitar"][data-item="${siguiente.clave}"]`) : $("#imp-reparto-elegir"))?.focus({ preventScroll: true });
  }

  function reemplazarEnReparto(claveItem, archivo) {
    const it = itemDe(claveItem);
    if (!it || !(archivo instanceof Blob)) return;
    if (it.vistaPrevia) URL.revokeObjectURL(it.vistaPrevia);
    Object.assign(it, { nombre: archivo.name || it.nombre, archivo, version: it.version + 1, estado: "procesando", mensaje: "", info: null, blob: null, vistaPrevia: null });
    reparto().aplicado = false;
    reparto().estado = { texto: `Reemplazada por «${it.nombre}»: conserva su destino.`, tipo: "ok" };
    repintarReparto();
    document.querySelector(`#imp-reparto [data-imp="reparto-quitar"][data-item="${it.clave}"]`)?.focus({ preventScroll: true });
    procesarReparto();
  }

  function descartarReparto({ silencio = false } = {}) {
    const r = lote?.reparto;
    if (!r) return;
    for (const it of r.items) soltarItem(it);
    r.items = [];
    r.aplicado = false;
    r.estado = silencio ? null : { texto: "Reparto descartado: no se asignó ninguna foto.", tipo: "ok" };
  }

  /* «Asignar fotos»: aplica de una vez lo que está listo y tiene destino. Cada destino se comprueba otra
     vez (el color sigue existiendo, su ficha sigue marcada y editable, y sigue sin fotos). Lo asignado sale
     de la revisión; lo que falló, sobra o no tiene destino se queda para revisarlo. */
  function asignarReparto() {
    const r = reparto();
    const plan = calcularReparto();
    const procesando = r.items.filter((it) => it.estado === "procesando").length;
    if (procesando) { estadoReparto(`Espera: ${procesando === 1 ? "queda 1 imagen" : `quedan ${procesando} imágenes`} por optimizar. Después pulsa «Asignar fotos».`, "aviso"); return; }
    const listos = r.items.filter((it) => it.estado === "lista" && plan.asignacion.get(it.clave));
    if (!listos.length) {
      // Segunda pulsación (doble clic): lo asignado ya salió de la revisión y no se repite nada.
      if (!r.aplicado) estadoReparto(plan.pendientes.length ? "No hay imágenes listas con destino para asignar." : "Todas las fichas marcadas ya tienen fotos en todos sus colores: no hay a dónde asignar.", "aviso");
      return;
    }
    const tocadas = [];
    const asignadas = [];
    for (const it of listos) {
      const d = destinoDe(plan.asignacion.get(it.clave).color.clave);
      if (!d || !editable(d.ficha) || !d.ficha.seleccionada || tieneFoto(d.color)) continue;
      d.color.fotos.unshift({ clave: nuevaClave("p"), estado: "lista", blob: it.blob, vistaPrevia: it.vistaPrevia, info: it.info, archivoLote: it.nombre });
      d.ficha.pendiente = null;
      d.ficha.errores = [];
      if (!tocadas.includes(d.ficha)) tocadas.push(d.ficha);
      asignadas.push(it);
    }
    r.items = r.items.filter((it) => !asignadas.includes(it));
    r.aplicado = true;
    const partes = [`${asignadas.length === 1 ? "Se asignó 1 foto principal" : `Se asignaron ${asignadas.length} fotos principales`} en ${tocadas.length === 1 ? `la ficha ${numero(tocadas[0])}` : `las fichas ${tocadas.map(numero).join(", ")}`}. Se subirán con «Guardar lote como oculto».`];
    const quedan = calcularReparto();
    if (quedan.sinFoto.length) partes.push(`${quedan.sinFoto.length === 1 ? "1 color sigue" : `${quedan.sinFoto.length} colores siguen`} sin foto.`);
    if (r.items.length) partes.push(`${r.items.length === 1 ? "Queda 1 imagen" : `Quedan ${r.items.length} imágenes`} en la revisión (sin destino o que no se pueden usar).`);
    r.estado = { texto: partes.join(" "), tipo: quedan.sinFoto.length || r.items.length ? "aviso" : "ok" };
    for (const f of tocadas) repintarFicha(f);
    repintarReparto();
    mensaje(r.estado.texto, r.estado.tipo);
    ($("#imp-reparto-asignar") || $("#imp-reparto-titulo"))?.focus({ preventScroll: true });
  }

  async function existeObjeto(objeto) {
    const partes = objeto.split("/");
    const archivo = partes.pop();
    try {
      const r = await panel().cliente().storage.from(fotos().BUCKET).list(partes.join("/"), { search: archivo, limit: 10 });
      if (r.error) return null;
      return (r.data || []).some((o) => o.name === archivo);
    } catch { return null; }
  }

  // Sube las fotos de una ficha que aún no estén en Storage con la ruta de ESTA ficha y color.
  async function subirFotosDe(f) {
    let token = null;
    try { token = (await panel().cliente().auth.getSession()).data?.session?.access_token || null; } catch { token = null; }
    if (!token) return "La sesión terminó o no se pudo leer. Vuelve a ingresar y reintenta.";
    const conf = panel().configuracion();
    for (const c of f.colores) {
      for (const foto of c.fotos) {
        if (foto.estado === "subida" && foto.producto === f.id && foto.variante === c.id) continue;
        if (!foto.blob) return `Una foto de ${c.color.trim() || "un color"} no está lista. Quítala o vuelve a añadirla.`;
        let anterior = null;
        if (!foto.objeto || foto.producto !== f.id || foto.variante !== c.id) {
          anterior = foto.estado === "subida" ? foto.objeto : null;
          foto.objeto = fotos().nombreObjeto(f.id, c.id);
          foto.producto = f.id;
          foto.variante = c.id;
        }
        foto.estado = "subiendo";
        const r = await fotos().subir({ base: conf.url, clave: conf.clave, token, objeto: foto.objeto, blob: foto.blob });
        if (r.ok || ((r.tipo === "duplicado" || r.tipo === "red") && (await existeObjeto(foto.objeto)) === true)) {
          foto.estado = "subida";
          foto.ruta = fotos().urlPublica(conf.url, foto.objeto);
          if (anterior) comun().limpiarArchivoSinUso(anterior);
          continue;
        }
        foto.estado = "lista";
        return r.tipo === "red" || r.tipo === "duplicado"
          ? `Se perdió la conexión al subir una foto de ${c.color.trim() || "un color"} y no pudimos comprobar si llegó. Reintenta: usa el mismo nombre y no se duplicará.`
          : `${r.mensaje || "El servidor rechazó una foto."} (${c.color.trim() || "un color"})`;
      }
    }
    return "";
  }

  // ------------------------------------------------------------------ validar
  function validarFicha(f) {
    const C = comun();
    const errores = [];
    const exigir = (ok, campoId, textoError) => { if (!ok) errores.push({ campo: campoId, mensaje: textoError }); };
    exigir(f.marca.trim() && f.marca.trim().length <= C.LIM.marca, `imp-${f.clave}-marca`, "Escribe la marca.");
    exigir(f.modelo.trim() && f.modelo.trim().length <= C.LIM.nombre, `imp-${f.clave}-modelo`, "Escribe el modelo.");
    exigir(f.categoria.trim() && f.categoria.trim().length <= C.LIM.categoria, `imp-${f.clave}-categoria`, "Escribe la categoría.");
    exigir(C.PUBLICOS.some(([v]) => v === f.publico), `imp-${f.clave}-publico-0`, "Elige el público: Hombre, Dama o Unisex.");
    if (coincidenciaLote(f)) errores.push({ campo: null, mensaje: "Decide si es otro color de la ficha con el mismo modelo (agrúpala) o una zapatilla distinta." });
    // Una versión para otro público ya en el catálogo no pide decisión: es otra zapatilla.
    if (relacionCatalogo(f).mismas.length && !f.decisionCatalogo) {
      errores.push({ campo: `imp-${f.clave}-decision`, mensaje: "Este modelo ya está en el catálogo: ábrelo en el editor o confirma que quieres crear otra ficha." });
    }
    if (f.colores.length > C.LIM.colores) errores.push({ campo: null, mensaje: `Como mucho ${C.LIM.colores} colores por zapatilla.` });
    const nombres = new Set();
    f.colores.forEach((c, i) => {
      const nombre = c.color.trim() || `el color ${i + 1}`;
      exigir(c.color.trim() && c.color.trim().length <= C.LIM.color, `imp-${c.clave}-color`, `Escribe el nombre del color ${i + 1}.`);
      const k = mayus(c.color.trim());
      if (k && nombres.has(k)) errores.push({ campo: `imp-${c.clave}-color`, mensaje: `Dos colores se llaman ${k}: cambia uno.` });
      nombres.add(k);
      const venta = C.entero(c.venta);
      exigir(String(c.venta).trim() && Number.isFinite(venta) && venta > 0 && venta <= C.LIM.precioMax, `imp-${c.clave}-venta`, `Fija el precio de venta de ${nombre} (número entero de pesos).`);
      const proveedor = C.entero(c.proveedor);
      exigir(Number.isFinite(proveedor) && proveedor >= 0 && proveedor <= C.LIM.precioMax, `imp-${c.clave}-proveedor`, `El precio del proveedor de ${nombre} debe ser un número entero de pesos.`);
      const leidas = texto().leerCampoTallas(c.tallasTexto);
      exigir(!leidas.error, `imp-${c.clave}-tallas`, `${nombre}: ${leidas.error}`);
      exigir(!c.muestra.trim() || C.MUESTRA_HEX.test(c.muestra.trim()), c.forma === "foto" ? `imp-${c.clave}-forma-circulo` : `imp-${c.clave}-muestra`,
        `El tono del círculo de ${nombre} debe ser un hexadecimal como #E8DCC8 (o «Usar color automático»).`);
      if (c.fotos.some((x) => x.estado === "procesando")) errores.push({ campo: null, mensaje: `Espera a que terminen de procesarse las fotos de ${nombre}.` });
      if (c.fotos.some((x) => x.estado === "error")) errores.push({ campo: `imp-${c.clave}-archivo`, mensaje: `Descarta las fotos de ${nombre} que no se pueden usar.` });
    });
    return errores;
  }

  function datosFicha(f) {
    return {
      id: f.id, codigo_interno: "", publico: f.publico, nombre: mayus(f.modelo.trim()), marca: mayus(f.marca.trim()), categoria: mayus(f.categoria.trim()),
      referencia_proveedor: null, descripcion: null, segmento: f.segmento || null, destacado: false, nuevo_ingreso: false, orden: 0,
      variantes: f.colores.map((c, i) => {
        const variante = {
          id: c.id, codigo_variante: "", color: mayus(c.color.trim()), referencia_variante: null,
          muestra_color: c.muestra.trim() ? c.muestra.trim().toLowerCase() : null, forma_muestra: comun().formaValida(c.forma),
          precio: comun().entero(c.venta), precio_anterior: 0, activa: true, orden: i,
          tallas: texto().leerCampoTallas(c.tallasTexto).tallas.map((t) => ({ talla: t, activa: true })),
          fotos: c.fotos.filter((x) => x.estado === "subida").map((x) => ({ ruta: x.ruta, alt: null }))
        };
        if (formaMuestra === false) delete variante.forma_muestra;
        return variante;
      })
    };
  }

  // ------------------------------------------------------------------ guardar
  async function guardarLote() {
    if (!lote || guardando) return;
    const marcadas = lote.fichas.filter((f) => editable(f) && f.seleccionada);
    if (!marcadas.length) { mensaje("Marca al menos una ficha con «Incluir en el guardado».", "aviso"); return; }
    // Primero se valida todo: si alguna ficha tiene errores, se dice antes de tocar el servidor.
    let primero = null;
    for (const f of marcadas) {
      f.errores = validarFicha(f);
      if (f.errores.length && !primero) primero = f;
    }
    for (const f of lote.fichas) if (!marcadas.includes(f)) f.errores = [];
    marcadas.forEach(repintarFicha);
    const conErrores = marcadas.filter((f) => f.errores.length);
    const validas = marcadas.filter((f) => !f.errores.length);
    if (!validas.length) {
      mensaje(`${conErrores.length === 1 ? "La ficha marcada tiene" : "Las fichas marcadas tienen"} datos por corregir. No se guardó nada.`, "aviso");
      enfocarError(primero);
      return;
    }
    if (formaMuestra === null) formaMuestra = await comun().capacidadForma();

    guardando = true;
    pintarPie();
    const resumen = { guardadas: 0, fallidas: 0, sinConfirmar: 0 };
    try {
      const acceso = await panel().comprobarAcceso();
      if (acceso.estado !== "admin") {
        if (acceso.estado === "red") { mensaje("No pudimos comprobar tu sesión. Revisa tu conexión; el lote sigue aquí.", "aviso"); return; }
        guardando = false;
        await panel().aplicarAcceso(acceso);
        return;
      }
      for (const [i, f] of validas.entries()) {
        mensaje(`Guardando la ficha ${numero(f)} (${i + 1} de ${validas.length})…`);
        await guardarFicha(f);
        if (f.estado === "guardada") resumen.guardadas += 1;
        else if (f.estado === "sin-confirmar") resumen.sinConfirmar += 1;
        else resumen.fallidas += 1;
        if (f.cortar) { delete f.cortar; break; }
      }
    } finally {
      guardando = false;
      if (lote) {
        // Una ficha guardada deja de ser editable y de recibir ajustes: si estaba elegida, se dice.
        const salen = lote.destinos ? lote.fichas.filter((f) => !editable(f) && lote.destinos.has(f.clave)) : [];
        if (salen.length) {
          for (const f of salen) lote.destinos.delete(f.clave);
          lote.avisoDestinos = `${salen.length === 1 ? "La ficha" : "Las fichas"} ${listaNumeros(salen)} ya ${salen.length === 1 ? "está guardada y deja" : "están guardadas y dejan"} de recibir ajustes.`;
        }
        pintar();
        panel().recargar();
      }
    }
    if (!lote) return;
    const partes = [`Se ${resumen.guardadas === 1 ? "guardó" : "guardaron"} ${resumen.guardadas} de ${validas.length} ${validas.length === 1 ? "ficha" : "fichas"} como ocultas.`];
    if (resumen.fallidas) partes.push(`${resumen.fallidas} no se ${resumen.fallidas === 1 ? "pudo" : "pudieron"} guardar: conservan sus datos para corregir y volver a guardar.`);
    if (resumen.sinConfirmar) partes.push(`${resumen.sinConfirmar} ${resumen.sinConfirmar === 1 ? "quedó" : "quedaron"} sin confirmar: comprueba su resultado antes de reintentar.`);
    if (conErrores.length) partes.push(`${conErrores.length} ${conErrores.length === 1 ? "tenía" : "tenían"} datos por corregir y no se ${conErrores.length === 1 ? "envió" : "enviaron"}.`);
    if (resumen.guardadas) partes.push("Publícalas y confirma sus tallas con las acciones del panel.");
    mensaje(partes.join(" "), resumen.fallidas || resumen.sinConfirmar || conErrores.length ? "aviso" : "ok");
  }

  function enfocarError(f) {
    if (!f) return;
    const campoId = f.errores.find((e) => e.campo)?.campo;
    const destino = (campoId && document.getElementById(campoId)) || document.getElementById(`imp-${f.clave}-errores`) || document.getElementById(`imp-${f.clave}-titulo`);
    destino?.focus?.();
    destino?.scrollIntoView?.({ block: "center" });
  }

  async function guardarFicha(f) {
    f.estado = "guardando";
    f.mensaje = "";
    repintarFicha(f);
    const fallo = await subirFotosDe(f);
    if (!lote) return;
    if (fallo) { f.estado = "fallida"; f.mensaje = `${fallo} No se guardó la ficha; sus datos siguen aquí.`; repintarFicha(f); return; }

    const datos = datosFicha(f);
    // Huella sin los identificadores de las tallas: reintentar el mismo contenido reenvía el MISMO
    // cuerpo (con las mismas tallas e identificadores) y la misma operación.
    const huella = JSON.stringify(datos);
    if (!f.pendiente || f.pendiente.huella !== huella) {
      for (const v of datos.variantes) for (const t of v.tallas) t.id = uuid();
      f.pendiente = { operacion: uuid(), huella, datos };
    }
    f.operaciones.add(f.pendiente.operacion);
    f.ultimaOperacion = f.pendiente.operacion;
    let r;
    try {
      r = await panel().cliente().rpc("fn_admin_guardar_producto", { p_datos: f.pendiente.datos, p_version: null, p_operacion: f.pendiente.operacion });
    } catch { r = { error: { status: 0 } }; }
    if (!lote) return;
    if (!r.error) { confirmar(f, r.data); return; }
    const tipo = comun().tipoError(r);
    if (tipo === "red" || tipo === "conflicto") { await comprobar(f); return; }
    if (tipo === "sin-sesion" || tipo === "sin-permiso") {
      f.estado = "fallida";
      f.mensaje = "La sesión terminó o se perdió el permiso. Vuelve a ingresar: el lote se conserva.";
      f.cortar = true;
      repintarFicha(f);
      panel().comprobarAcceso().then((a) => panel().aplicarAcceso(a));
      return;
    }
    f.pendiente = null;
    f.estado = "fallida";
    f.mensaje = `${r.error?.message || "El servidor rechazó los datos."} No se guardó la ficha; corrígela y vuelve a guardar.`;
    repintarFicha(f);
  }

  function confirmar(f, respuesta, comprobado = false) {
    f.estado = "guardada";
    f.seleccionada = false;
    f.codigo = respuesta?.codigo_interno || f.codigo;
    f.pendiente = null;
    const avisos = [];
    if (comprobado) avisos.push("(comprobado con el identificador de esta operación)");
    else if (respuesta?.estado === "ya_aplicada") avisos.push("(ese guardado ya se había aplicado; no se repitió)");
    if (!comprobado && formaMuestra !== false && respuesta && respuesta.forma_muestra !== true && f.colores.some((c) => c.forma === "foto")) {
      formaMuestra = false;
      avisos.push("Atención: este servidor no guardó cómo se muestra cada color (falta la migración 20261117010000); la tienda usará el círculo.");
    }
    f.mensaje = avisos.join(" ");
    repintarFicha(f);
  }

  // Solo lectura: ¿la zapatilla existe con la operación de este guardado?
  async function comprobar(f) {
    const operacion = f.pendiente?.operacion || f.ultimaOperacion;
    if (!operacion) return;
    let r;
    try {
      r = await panel().cliente().from("productos").select("id,codigo_interno,ultima_operacion").eq("id", f.id).maybeSingle();
    } catch { r = { error: { status: 0 } }; }
    if (!lote) return;
    if (r.error) {
      f.estado = "sin-confirmar";
      f.mensaje = "Se perdió la respuesta y no pudimos leer el estado actual. Comprueba el resultado antes de reintentar (reintentar usa la misma operación: no se duplica).";
    } else if (r.data && r.data.ultima_operacion === operacion) {
      confirmar(f, { codigo_interno: r.data.codigo_interno }, true);
      return;
    } else if (r.data && f.operaciones.has(r.data.ultima_operacion)) {
      // Un guardado anterior de esta misma ficha (con otro contenido) ya la creó.
      f.estado = "guardada";
      f.seleccionada = false;
      f.codigo = r.data.codigo_interno;
      f.pendiente = null;
      f.mensaje = "Se creó con un guardado anterior de este lote: ábrela en el editor y revisa que tenga los datos actuales.";
    } else if (!r.data) {
      f.estado = "sin-confirmar";
      f.mensaje = "Se perdió la respuesta y la zapatilla todavía no aparece en el servidor. Comprueba otra vez; si sigue sin aparecer, vuelve a guardar el lote (usa la misma operación: no se duplica).";
    } else {
      f.estado = "fallida";
      f.pendiente = null;
      f.mensaje = "Ya existe una zapatilla con el identificador de esta ficha que no creó este lote. No se cambió nada.";
    }
    repintarFicha(f);
  }

  // ------------------------------------------------------------------ agrupar, separar, quitar
  function agrupar(f, destino) {
    if (!editable(f) || !editable(destino) || f === destino) return;
    // Etapa 19: solo fichas compatibles (mismo público). Versiones para públicos distintos no se mezclan.
    if (!f.publico || f.publico !== destino.publico) {
      mensaje(!f.publico || !destino.publico
        ? "Elige el público de las dos fichas antes de agruparlas."
        : `La ficha ${numero(f)} es para ${textoPublico(f.publico)} y la ${numero(destino)} para ${textoPublico(destino.publico)}: son versiones independientes y no se agrupan.`, "aviso");
      return;
    }
    if (destino.colores.length + f.colores.length > comun().LIM.colores) { mensaje(`Una zapatilla admite como mucho ${comun().LIM.colores} colores.`, "aviso"); return; }
    // Los colores cambian de zapatilla: sus fotos se subirán con la ruta de la ficha destino.
    // Destinos de los ajustes elegidos a mano: la ficha que desaparece sale de la selección; si las dos no
    // estaban igual de elegidas, se avisa (sin cambiar la selección por su cuenta).
    if (lote.destinos) {
      const estabaF = lote.destinos.delete(f.clave);
      const estaDestino = lote.destinos.has(destino.clave);
      lote.avisoDestinos = estabaF === estaDestino ? "" : estabaF
        ? `La ficha ${numero(f)} (elegida para los ajustes) se agrupó con la ${numero(destino)}, que no está elegida: márcala si quieres ajustarla.`
        : `Los colores de la ficha ${numero(f)} pasaron a la ${numero(destino)}, que está elegida para los ajustes.`;
    }
    destino.colores.push(...f.colores);
    destino.pendiente = null;
    aplicarRegla(destino); // los colores movidos toman el público de la ficha elegida
    destino.errores = [];
    lote.fichas = lote.fichas.filter((x) => x !== f);
    pintar();
    const ultimo = destino.colores[destino.colores.length - f.colores.length];
    document.getElementById(`imp-${ultimo.clave}-titulo`)?.scrollIntoView({ block: "center" });
    document.getElementById(`imp-${ultimo.clave}-color`)?.focus({ preventScroll: true });
    mensaje(`Agrupado: la ficha ${numero(destino)} tiene ahora ${destino.colores.length} colores.`, "ok");
  }

  function separar(c) {
    const ref = colorDe(c);
    if (!ref || !editable(ref.ficha) || ref.ficha.colores.length < 2) return;
    const { ficha, color } = ref;
    ficha.colores = ficha.colores.filter((x) => x !== color);
    ficha.pendiente = null;
    const nueva = fichaNueva();
    Object.assign(nueva, { marca: ficha.marca, modelo: ficha.modelo, publico: ficha.publico, categoria: ficha.categoria, segmento: ficha.segmento, colores: [color] });
    nueva.editados = new Set(["marca", "modelo", "publico"]);
    // Separarla es decidir que es otra zapatilla: no se vuelve a proponer agruparla.
    nueva.distintaDe.add(ficha.clave);
    lote.fichas.splice(lote.fichas.indexOf(ficha) + 1, 0, nueva);
    if (lote.destinos) lote.avisoDestinos = `La ficha ${numero(nueva)} (separada de la ${numero(ficha)}) es nueva y no está elegida para los ajustes: márcala si quieres ajustarla.`;
    pintar();
    document.getElementById(`imp-${nueva.clave}-titulo`)?.focus?.();
    document.getElementById(`imp-${nueva.clave}-modelo`)?.focus({ preventScroll: false });
  }

  /* Archivos ya subidos de una foto que se quita: si la ficha nunca llegó a guardarse (o su
     guardado falló), ninguna galería los usa y se borran; limpiarArchivoSinUso lo comprueba antes.
     Con un guardado sin confirmar no se toca nada. */
  function limpiarSubidas(f, lista) {
    if (!f || f.estado === "sin-confirmar" || f.estado === "guardada") return;
    for (const x of lista) if (x.estado === "subida" && x.objeto) comun().limpiarArchivoSinUso(x.objeto);
  }

  function quitarFicha(f) {
    if (!editable(f) || lote.fichas.length < 2) return;
    for (const c of f.colores) for (const x of c.fotos) { x.quitada = true; if (x.vistaPrevia) URL.revokeObjectURL(x.vistaPrevia); }
    for (const c of f.colores) limpiarSubidas(f, c.fotos);
    const i = lote.fichas.indexOf(f);
    // Un aviso anterior (p. ej. «la ficha 4 es nueva») ya no vale: los números cambian al quitar una ficha.
    lote.avisoDestinos = lote.destinos?.delete(f.clave) ? `Se quitó la ficha ${numero(f)} (${etiquetaFicha(f)}), que estaba elegida para los ajustes.` : "";
    lote.fichas = lote.fichas.filter((x) => x !== f);
    for (const o of lote.fichas) o.distintaDe.delete(f.clave);
    pintar();
    const siguiente = lote.fichas[Math.min(i, lote.fichas.length - 1)];
    document.getElementById(`imp-${siguiente.clave}-titulo`)?.scrollIntoView({ block: "center" });
    $("#imp-agregar")?.focus({ preventScroll: true });
  }

  function agregarFicha() {
    const f = fichaNueva();
    lote.fichas.push(f);
    $("#imp-fichas")?.append(pintarFicha(f));
    // Con destinos elegidos a mano, la ficha nueva no se añade sola a la selección: se dice.
    if (lote.destinos) lote.avisoDestinos = `La ficha ${numero(f)} es nueva y no está elegida para los ajustes: márcala si quieres ajustarla.`;
    repintarAjustes();
    if (lote.reparto?.items.length) repintarReparto();
    pintarPie();
    const area = document.getElementById(`imp-${f.colores[0].clave}-texto`);
    document.getElementById(`imp-${f.clave}`)?.scrollIntoView({ block: "start" });
    area?.focus({ preventScroll: true });
    mensaje(`Ficha ${numero(f)} añadida: pega su mensaje de WhatsApp.`);
  }

  /* «Aplicar todos los ajustes». Primero se validan los valores generales: si alguno no sirve, se marca
     junto a su control y no se toca ninguna ficha. Después se aplica a las fichas editables marcadas:
     - Público: cuenta como elegido a mano (al releer el mensaje no se pisa).
     - Categoría vacía y «Sin cambiar» conservan lo de cada ficha. «Sin indicar» de la guía se aplica.
     - Precio de venta = proveedor + importe, recalculado desde el proveedor cada vez (no se acumula);
       los escritos a mano se conservan; sin precio del proveedor, el de venta queda «Revisar». */
  function aplicarAjustes() {
    const C = comun();
    const errores = {};
    let margen = null;
    if (String(lote.margen).trim()) {
      const n = C.entero(lote.margen);
      if (!Number.isFinite(n) || n < 0 || n > C.LIM.precioMax) errores.margen = "Escribe el importe en pesos enteros, sin puntos ni símbolos (por ejemplo 40000).";
      else margen = n;
    }
    const categoria = mayus(String(lote.categoria).trim());
    if (categoria.length > C.LIM.categoria) errores.categoria = `La categoría admite hasta ${C.LIM.categoria} caracteres.`;
    const publico = C.PUBLICOS.some(([v]) => v === lote.publico) ? lote.publico : null;
    const segmento = lote.segmento !== CONSERVAR && C.SEGMENTOS.some(([v]) => v === lote.segmento) ? lote.segmento : null;
    lote.erroresAjustes = errores;
    if (Object.keys(errores).length) {
      lote.resumenAjustes = { texto: "Corrige el ajuste marcado: no se cambió ninguna ficha.", tipo: "aviso" };
      repintarAjustes();
      (document.getElementById(errores.categoria ? "imp-categoria" : "imp-margen"))?.focus();
      mensaje(lote.resumenAjustes.texto, "aviso");
      return;
    }
    // Etapa 19: los destinos se eligen en el propio bloque (independientes de «Incluir en el guardado»).
    const marcadas = fichasDestino();
    const avisar = (texto, foco) => {
      lote.resumenAjustes = { texto, tipo: "aviso" };
      repintarAjustes();
      mensaje(texto, "aviso");
      document.querySelector(foco)?.focus();
    };
    if (!publico && !categoria && segmento === null && margen === null) {
      avisar("Elige al menos un ajuste: público, categoría, guía de tallas o importe a sumar al precio del proveedor.", "#imp-lote-publico input:checked");
      return;
    }
    if (!marcadas.length) { avisar("Marca al menos una ficha en «Fichas que recibirán los ajustes».", "#imp-destinos input:not(:disabled)"); return; }

    let aplicados = 0;
    let manuales = 0;
    let sinProveedor = 0;
    for (const f of marcadas) {
      if (publico) { f.publico = publico; f.editados.add("publico"); f.revisar.delete("publico"); aplicarRegla(f); }
      if (categoria) f.categoria = categoria;
      if (segmento !== null) f.segmento = segmento;
      if (margen !== null) {
        for (const c of f.colores) {
          // El importe queda en el color: al elegir o cambiar después su precio del proveedor, su precio de
          // venta lo sigue. Los colores de fichas fuera de los destinos no lo reciben.
          c.margenAplicado = margen;
          if (c.ventaManual) { manuales += 1; continue; }
          const p = C.entero(c.proveedor);
          if (!Number.isFinite(p) || p <= 0) { sinProveedor += 1; c.revisar.add("venta"); continue; }
          c.venta = String(p + margen);
          c.revisar.delete("venta");
          aplicados += 1;
        }
      }
      f.pendiente = null;
    }
    // Con otro público cambian también las coincidencias de las fichas no marcadas (versiones o agrupar).
    (publico ? lote.fichas : marcadas).forEach(repintarFicha);

    const hechos = [];
    if (publico) hechos.push(`público ${C.PUBLICOS.find(([v]) => v === publico)[1]}`);
    if (categoria) hechos.push(`categoría ${categoria}`);
    if (segmento !== null) hechos.push(`guía de tallas «${segmento ? C.SEGMENTOS.find(([v]) => v === segmento)[1] : "Sin indicar"}»`);
    if (margen !== null) hechos.push(`precio de venta = proveedor + ${formatoPesos(margen)} en ${aplicados} ${aplicados === 1 ? "color" : "colores"}`);
    const partes = [`${marcadas.length === 1 ? "1 ficha actualizada" : `${marcadas.length} fichas actualizadas`}: ${hechos.join(", ")}.`];
    if (manuales) partes.push(`${manuales === 1 ? "1 precio escrito a mano se conservó" : `${manuales} precios escritos a mano se conservaron`}.`);
    if (sinProveedor) partes.push(`${sinProveedor === 1 ? "1 color no tiene" : `${sinProveedor} colores no tienen`} precio del proveedor: su precio de venta queda por revisar.`);
    partes.push(`Actualizadas: ${marcadas.length === 1 ? "ficha" : "fichas"} ${listaNumeros(marcadas)}. Se guardan con «Guardar lote como oculto».`);
    lote.resumenAjustes = { texto: partes.join(" "), tipo: sinProveedor ? "aviso" : "ok" };
    repintarAjustes();
    mensaje(lote.resumenAjustes.texto, lote.resumenAjustes.tipo);
    $("#imp-aplicar-ajustes")?.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ eventos
  function alClic(e) {
    const b = e.target.closest("[data-imp]");
    if (!b || !lote) return;
    const accion = b.dataset.imp;
    if (guardando && accion !== "cerrar") return;
    const f = fichaDe(b.dataset.ficha);
    switch (accion) {
      case "cerrar": intentarCerrar(); break;
      case "seguir": $("#importador-salida").hidden = true; $("#importador-botones").hidden = false; $('[data-imp="cerrar-pie"]')?.focus(); break;
      case "cerrar-pie": intentarCerrar(); break;
      case "descartar": descartar(); break;
      case "conservar": cerrar(); break;
      case "guardar": guardarLote(); break;
      case "agregar-ficha": agregarFicha(); break;
      case "quitar-ficha": if (f) quitarFicha(f); break;
      case "agrupar": { const d = fichaDe(b.dataset.destino); if (f && d) agrupar(f, d); break; }
      case "distinta": {
        if (!f) break;
        f.distintaDe.add(b.dataset.destino);
        repintarFicha(f);
        document.getElementById(`imp-${f.clave}-marca`)?.focus({ preventScroll: true });
        break;
      }
      case "separar": separar(b.dataset.color); break;
      case "destinos-todas": case "destinos-ninguna":
        // Elegir todas o ninguna: cuenta como selección a mano (las fichas nuevas ya no se añaden solas).
        lote.destinos = new Set(accion === "destinos-todas" ? lote.fichas.filter(editable).map((x) => x.clave) : []);
        lote.avisoDestinos = "";
        lote.resumenAjustes = null;
        repintarAjustes();
        $(`[data-imp="${accion}"]`)?.focus();
        break;
      case "aplicar-ajustes": aplicarAjustes(); break;
      case "reparto-elegir": elegirReparto(); break;
      case "reparto-asignar": asignarReparto(); break;
      case "reparto-descartar": descartarReparto(); repintarReparto(); $("#imp-reparto-elegir")?.focus({ preventScroll: true }); break;
      case "reparto-ordenar": {
        const r = reparto();
        r.items.sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true, sensitivity: "base" }));
        r.aplicado = false;
        estadoReparto("Imágenes ordenadas por nombre de archivo.");
        break;
      }
      case "reparto-subir": case "reparto-bajar":
        if (b.getAttribute("aria-disabled") !== "true") moverItem(b.dataset.item, accion === "reparto-subir" ? -1 : 1);
        break;
      case "reparto-orden": elegirDestino(b.dataset.item, null); break;
      case "reparto-quitar": quitarDelReparto(b.dataset.item); break;
      case "abrir-editor": window.GamaTallaEditor?.abrir(b.dataset.producto, b); break;
      case "comprobar": if (f) comprobar(f); break;
      case "foto-principal": case "foto-quitar": {
        const ref = colorDe(b.dataset.color);
        if (!ref || !editable(ref.ficha)) break;
        const i = ref.color.fotos.findIndex((x) => x.clave === b.dataset.foto);
        if (i < 0) break;
        const [foto] = ref.color.fotos.splice(i, 1);
        if (accion === "foto-principal") ref.color.fotos.unshift(foto);
        else {
          foto.quitada = true;
          if (foto.vistaPrevia) URL.revokeObjectURL(foto.vistaPrevia);
          limpiarSubidas(ref.ficha, [foto]);
        }
        ref.ficha.pendiente = null;
        repintarFicha(ref.ficha);
        // Tras quitar: la foto que ocupa su lugar (si era la principal, la nueva principal) o «Añadir fotos».
        const siguiente = ref.color.fotos[Math.min(i, ref.color.fotos.length - 1)];
        const destino = accion === "foto-principal"
          ? document.querySelector(`#imp-${ref.color.clave}-fotos [data-imp="foto-quitar"][data-foto="${foto.clave}"]`)
          : (siguiente ? document.querySelector(`#imp-${ref.color.clave}-fotos [data-imp="foto-quitar"][data-foto="${siguiente.clave}"]`) : document.getElementById(`imp-${ref.color.clave}-archivo`));
        destino?.focus({ preventScroll: true });
        mensaje(accion === "foto-quitar" ? `Foto quitada de ${ref.color.color.trim() || "la publicación"}.${i === 0 && siguiente ? " La siguiente es ahora la principal." : ""}${ref.color.fotos.length ? "" : " Ya no tiene fotos: añade otras o se mostrará el círculo."}` : "");
        break;
      }
      case "tono-auto": {
        const ref = colorDe(b.dataset.color);
        if (!ref || !editable(ref.ficha)) break;
        ref.color.muestra = "";
        ref.color.errorTono = "";
        ref.ficha.pendiente = null;
        comun().pintarTono(document.getElementById(`imp-${ref.color.clave}-forma`), "");
        document.getElementById(`imp-${ref.color.clave}-muestra-selector`)?.focus();
        break;
      }
      default: break;
    }
  }

  function alEscribir(e) {
    if (!lote || guardando) return;
    const n = e.target;
    if (n.dataset.destinoAjustes) {
      // Destinos de «Aplicar ajustes»: independientes de «Incluir en el guardado» y del reparto de fotos.
      const f = fichaDe(n.dataset.destinoAjustes);
      if (!f || !editable(f)) return;
      const destinos = fijarDestinos();
      if (n.checked) destinos.add(f.clave); else destinos.delete(f.clave);
      lote.avisoDestinos = "";
      lote.resumenAjustes = null;
      repintarAjustes();
      return;
    }
    if (n.dataset.lote) {
      if (n.type === "radio" && !n.checked) return;
      lote[n.dataset.lote] = n.value;
      return;
    }
    if (n.dataset.fcampo) {
      const f = fichaDe(n.dataset.ficha);
      if (!f || !editable(f)) return;
      const k = n.dataset.fcampo;
      if (n.type === "radio" && !n.checked) return;
      f[k] = n.type === "checkbox" ? n.checked : n.value;
      f.pendiente = null;
      if (["marca", "modelo", "publico"].includes(k)) { f.editados.add(k); f.revisar.delete(k); }
      if (k === "seleccionada") { repintarAjustes(); if (lote.reparto?.items.length) repintarReparto(); pintarPie(); return; }
      if (k === "marca" || k === "modelo") {
        // Título y coincidencias (de esta ficha y de las demás) dependen de la marca y el modelo.
        programar(`coincidencias-${f.clave}`, () => { repintarFicha(f); repintarOtras(f); }, 350);
        const t = document.getElementById(`imp-${f.clave}-titulo`);
        if (t) t.textContent = `Ficha ${numero(f)} · ${etiquetaFicha(f)}`;
      }
      if (k === "publico") {
        n.closest("fieldset")?.classList.remove("es-revisar");
        // «Todas las tallas»: el público decide las tallas propuestas (si no se escribieron a mano).
        // El público decide además las tallas propuestas por la regla (si no se escribieron a mano), el título
        // de la ficha y sus coincidencias con las demás (mismo público: agrupar; distinto: versiones).
        aplicarRegla(f);
        programar(`coincidencias-${f.clave}`, () => { repintarFicha(f); repintarOtras(f); }, 0);
      }
      return;
    }
    if (n.dataset.cselector === "muestra") {
      // El recuadro de color: solo cuenta cuando la persona elige un tono (su gris inicial no se guarda).
      const ref = colorDe(n.dataset.color);
      if (!ref || !editable(ref.ficha) || n.dataset.bloqueado === "1") return;
      ref.color.muestra = n.value.toUpperCase();
      ref.color.errorTono = "";
      ref.ficha.pendiente = null;
      comun().pintarTono(document.getElementById(`imp-${ref.color.clave}-forma`), ref.color.muestra);
      return;
    }
    if (n.dataset.ccampo) {
      const ref = colorDe(n.dataset.color);
      if (!ref || !editable(ref.ficha)) return;
      const { ficha: f, color: c } = ref;
      const k = n.dataset.ccampo;
      f.pendiente = null;
      if (k === "forma") {
        if (!n.checked) return;
        c.forma = comun().formaValida(n.value);
        comun().pintarFormaElegida(document.getElementById(`imp-${c.clave}-forma`), c.forma, Boolean(fotoPrincipal(c)));
        return;
      }
      if (k === "muestra") {
        // Se puede terminar de escribir: el aviso de un valor incompleto llega al salir del campo.
        c.muestra = n.value;
        if (!n.value.trim() || comun().normalizarTono(n.value)) c.errorTono = "";
        comun().pintarTono(document.getElementById(`imp-${c.clave}-forma`), n.value, { escribiendo: true });
        return;
      }
      c[k] = n.value;
      if (k === "texto") { programar(`texto-${c.clave}`, () => { aplicarTexto(f, c); repintarFicha(f); repintarOtras(f); }, 300); return; }
      if (k === "venta") { c.ventaManual = String(n.value).trim() !== ""; if (c.ventaManual) c.revisar.delete("venta"); }
      const mapaRevisar = { proveedor: "precio", tallasTexto: "tallas", color: "color" };
      if (mapaRevisar[k]) { c.editados.add(k === "tallasTexto" ? "tallas" : k); c.revisar.delete(mapaRevisar[k]); }
      if (k === "proveedor" && !c.ventaManual) ventaAutomatica(c);
      programar(`color-${c.clave}`, () => repintarFicha(f), 400);
    }
  }

  function alCambiar(e) {
    const n = e.target;
    if (lote && n.dataset.ccampo === "muestra" && n.type === "text") {
      const ref = colorDe(n.dataset.color);
      if (!ref || !editable(ref.ficha)) return;
      const caja = document.getElementById(`imp-${ref.color.clave}-forma`);
      ref.color.muestra = comun().cerrarTono(caja, ref.color.color.trim() || "este color");
      const error = document.getElementById(`imp-${ref.color.clave}-muestra-error`);
      ref.color.errorTono = error && !error.hidden ? error.textContent : "";
      return;
    }
    if (n.classList?.contains("campo-mayus")) {
      const normal = mayus(n.value);
      if (n.value !== normal) { n.value = normal; alEscribir(e); }
    }
    // Precio del proveedor elegido entre los del mensaje: cuenta como escrito a mano (se conserva al releer).
    if (lote && n.dataset.cprecio && n.checked) {
      const ref = colorDe(n.dataset.color);
      if (!ref || !editable(ref.ficha) || guardando) return;
      const { ficha: f, color: c } = ref;
      c.proveedor = n.value;
      c.editados.add("proveedor");
      c.revisar.delete("precio");
      f.pendiente = null;
      if (!c.ventaManual) ventaAutomatica(c);
      repintarFicha(f);
      return;
    }
    if (lote && n.dataset.repartoDestino) { if (n.checked) elegirDestino(n.dataset.repartoDestino, n.value); return; }
    if (n.type !== "file" || !lote) return;
    if (n.dataset.reparto) {
      const elegidos = [...(n.files || [])];
      n.value = "";
      if (guardando || !elegidos.length) return;
      if (n.dataset.reparto === "reemplazar") reemplazarEnReparto(n.dataset.item, elegidos[0]);
      else agregarAlReparto(elegidos);
      return;
    }
    const archivos = [...(n.files || [])];
    n.value = "";
    const ref = colorDe(n.dataset.archivos);
    if (ref && archivos.length && editable(ref.ficha)) { ref.ficha.pendiente = null; agregarArchivos(ref.ficha, ref.color, archivos); }
  }

  /* Repintados diferidos (al escribir). Mientras el puntero está pulsado dentro del importador se
     esperan: si el botón pulsado se sustituyera entre «pulsar» y «soltar», el navegador perdería el clic
     (WebKit lo descarta). */
  let pulsando = false;
  function programar(claveTarea, tarea, ms) {
    clearTimeout(temporizadores.get(claveTarea));
    temporizadores.set(claveTarea, setTimeout(() => {
      temporizadores.delete(claveTarea);
      if (pulsando) { programar(claveTarea, tarea, 120); return; }
      if (lote && !guardando) tarea();
    }, ms));
  }

  // Arrastrar y soltar: solo sobre la zona de un color. Fuera de ella el navegador no abre el archivo.
  function alArrastrar(e) {
    if (!e.dataTransfer || ![...(e.dataTransfer.types || [])].includes("Files")) return;
    e.preventDefault();
    const zona = e.target.closest?.("[data-soltar]");
    document.querySelectorAll("#importador .importador-soltar.es-encima").forEach((z) => { if (z !== zona) z.classList.remove("es-encima"); });
    if (e.type === "dragleave") { if (zona && !zona.contains(e.relatedTarget)) zona.classList.remove("es-encima"); return; }
    if (zona) zona.classList.add("es-encima");
    e.dataTransfer.dropEffect = zona ? "copy" : "none";
    if (e.type !== "drop") return;
    zona?.classList.remove("es-encima");
    if (!zona || guardando) return;
    const ref = colorDe(zona.dataset.soltar);
    if (ref && editable(ref.ficha)) { ref.ficha.pendiente = null; agregarArchivos(ref.ficha, ref.color, e.dataTransfer.files); }
  }

  // ------------------------------------------------------------------ abrir y cerrar
  function hayPendiente() {
    return Boolean(lote) && (Boolean(lote.reparto?.items.length) || lote.fichas.some((f) => editable(f) && (f.colores.some((c) => c.texto.trim() || c.fotos.length || c.color.trim()) || f.modelo.trim())));
  }

  async function abrir(disparador = null) {
    const dialogo = $("#importador");
    if (!dialogo || !comun() || !texto() || !fotos()) {
      panel()?.anunciar({ titulo: "El importador no se pudo cargar", texto: "Recarga la página.", tipo: "aviso" });
      return;
    }
    origen = disparador instanceof HTMLElement ? disparador : null;
    // El lote sin guardar se conserva (por ejemplo, tras volver a ingresar).
    if (!lote || !hayPendiente() && lote.fichas.every((f) => f.estado !== "guardada")) lote = loteNuevo();
    $("#importador-salida").hidden = true;
    $("#importador-botones").hidden = false;
    mensaje("");
    pintar();
    if (!dialogo.open) { comun().bloquearFondo(); dialogo.showModal(); }
    // Lote nuevo: el cuadro del mensaje recibe el foco (pegar es lo primero). Lote conservado: el título.
    const primero = lote.fichas[0]?.colores[0];
    const vacio = lote.fichas.length === 1 && primero && !primero.texto.trim() && !primero.fotos.length;
    if (vacio) {
      // Etapa 19: los bloques para varias fichas van arriba; el cuadro del mensaje (lo primero que se hace)
      // se trae entero a la vista, también en celular.
      const area = document.getElementById(`imp-${primero.clave}-texto`);
      area?.focus({ preventScroll: true });
      area?.closest(".importador-mensaje")?.scrollIntoView({ block: "nearest" });
    }
    else $("#importador-titulo").focus();
    if (formaMuestra === null) {
      formaMuestra = await comun().capacidadForma();
      if (formaMuestra === false && lote) pintar();
    }
  }

  function cerrar() {
    const dialogo = $("#importador");
    for (const t of temporizadores.values()) clearTimeout(t);
    temporizadores.clear();
    if (dialogo?.open) { dialogo.close(); comun().liberarFondo(); }
    $("#importador-cuerpo")?.replaceChildren();
    const destino = origen?.isConnected ? origen : $("#boton-importar");
    origen = null;
    // El foco vuelve al botón que lo abrió sin mover el panel (su posición ya se restauró).
    destino?.focus({ preventScroll: true });
  }

  function descartar() {
    descartarReparto({ silencio: true });
    for (const f of lote?.fichas || []) for (const c of f.colores) {
      for (const x of c.fotos) { x.quitada = true; if (x.vistaPrevia) URL.revokeObjectURL(x.vistaPrevia); }
      limpiarSubidas(f, c.fotos);
    }
    lote = null;
    cerrar();
  }

  function intentarCerrar() {
    if (!lote) { cerrar(); return; }
    if (guardando) { mensaje("Espera a que termine el guardado en curso.", "aviso"); return; }
    const sinGuardar = lote.fichas.filter((f) => editable(f) && (f.colores.some((c) => c.texto.trim() || c.fotos.length) || f.modelo.trim())).length;
    const porAsignar = lote.reparto?.items.length || 0;
    if (!sinGuardar && !porAsignar) { descartar(); return; }
    mensaje(""); // el pie solo muestra la pregunta: en pantallas bajas no quita sitio al contenido
    const pendientes = [sinGuardar ? (sinGuardar === 1 ? "una ficha sin guardar" : `${sinGuardar} fichas sin guardar`) : "",
      porAsignar ? (porAsignar === 1 ? "una imagen sin asignar" : `${porAsignar} imágenes sin asignar`) : ""].filter(Boolean).join(" y ");
    $("#importador-salida-texto").textContent = `Hay ${pendientes}. Puedes cerrar y seguir después (el lote se conserva mientras no recargues la página) o descartarlo.`;
    $("#importador-salida").hidden = false;
    $("#importador-botones").hidden = true;
    $('[data-imp="seguir"]').focus();
  }

  // admin.js lo llama al perder la sesión o el acceso: el lote queda en memoria.
  function alPerderAcceso() {
    if ($("#importador")?.open) cerrar();
  }

  function preparar() {
    const dialogo = $("#importador");
    if (!dialogo) return;
    $("#importador-formulario").addEventListener("submit", (e) => { e.preventDefault(); guardarLote(); });
    dialogo.addEventListener("click", alClic);
    dialogo.addEventListener("pointerdown", () => { pulsando = true; }, true);
    for (const tipo of ["pointerup", "pointercancel"]) window.addEventListener(tipo, () => { pulsando = false; }, true);
    dialogo.addEventListener("input", alEscribir);
    dialogo.addEventListener("change", alCambiar);
    for (const tipo of ["dragenter", "dragover", "dragleave", "drop"]) dialogo.addEventListener(tipo, alArrastrar);
    // Solo el «cancel» del propio diálogo (Escape). El de un selector de archivos que se cierra sin elegir
    // nada (Chromium lo lanza en el <input type="file"> y sube hasta aquí) no es «cerrar el importador».
    dialogo.addEventListener("cancel", (e) => { if (e.target !== dialogo) return; e.preventDefault(); intentarCerrar(); });
    dialogo.addEventListener("toggle", (e) => {
      if (!lote) return;
      if (e.target.id === "imp-ajustes") lote.ajustesAbiertos = e.target.open;
      // «Cambiar destino» del reparto: uno abierto a la vez.
      if (e.target.classList?.contains("importador-reparto-cambiar")) {
        const r = reparto();
        if (e.target.open) {
          r.abierto = e.target.dataset.item;
          document.querySelectorAll("#imp-reparto .importador-reparto-cambiar[open]").forEach((d) => { if (d !== e.target) d.open = false; });
        } else if (r.abierto === e.target.dataset.item) r.abierto = null;
      }
    }, true);
    window.addEventListener("beforeunload", (e) => { if (hayPendiente()) { e.preventDefault(); e.returnValue = ""; } });
  }

  window.GamaTallaImportador = Object.freeze({ abrir, alPerderAcceso, abierto: () => Boolean($("#importador")?.open) });
  document.addEventListener("DOMContentLoaded", preparar);
})();
