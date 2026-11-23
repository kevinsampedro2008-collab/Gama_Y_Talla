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
 *
 * Etapa 20
 *  - «Pegar varias publicaciones» (separar-publicaciones.js): se pega todo junto, se revisa la división
 *    (separar, unir, dudosas señaladas) y solo «Crear N publicaciones» añade las fichas al lote.
 *  - Perfiles de proveedor (texto-proveedor.js valida y aplica sus reglas; borradores.js los guarda en
 *    este navegador). Cada ficha conserva la instantánea del perfil con el que se leyó: editar o borrar
 *    un perfil no cambia lo ya leído. Volver a leer con otro perfil es una acción expresa.
 *  - Guardado automático del lote en IndexedDB (borradores.js), fotos incluidas: sobrevive a cerrar la
 *    ventana, recargar, cerrar el navegador y cerrar sesión. Separado por proyecto y usuario. No sube
 *    nada a Supabase: eso sigue siendo «Guardar lote como oculto».
 *  - Antes de cada escritura en Supabase (subir fotos, fn_admin_guardar_producto) se guarda el borrador
 *    con los nombres de archivo y la operación: tras una recarga se comprueba (solo lectura) qué se
 *    completó antes de repetir nada.
 */
(() => {
  "use strict";

  const panel = () => window.GamaTallaPanel;
  const fotos = () => window.GamaTallaFotos;
  const texto = () => window.GamaTallaTextoProveedor;
  const separador = () => window.GamaTallaSeparador;
  const almacen = () => window.GamaTallaBorradores;
  const comun = () => window.GamaTallaEditor?.comun;
  const $ = (selector, raiz = document) => raiz.querySelector(selector);
  const pesos = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
  const formatoPesos = (n) => pesos.format(n).replace(/ /g, " ");
  const mayus = (t) => String(t ?? "").toLocaleUpperCase("es");
  const uuid = () => crypto.randomUUID();
  let claves = 0;
  const nuevaClave = (prefijo) => `${prefijo}${++claves}`;

  const NOMBRES_CAMPO = { marca: "marca", modelo: "modelo", publico: "público", precio: "precio del proveedor", tallas: "tallas", color: "color", venta: "precio de venta", colores: "cantidad de colores" };
  // Valor de «Sin cambiar» en los ajustes por lote (distinto de «Sin indicar» de la guía, que es "").
  const CONSERVAR = "conservar";

  // ------------------------------------------------------------------ estado
  let lote = null;          // { fichas, margen, categoria, segmento, publico, erroresAjustes, resumenAjustes, destinos, avisoDestinos, reparto }
  let guardando = false;
  let origen = null;        // botón que abrió el importador
  let formaMuestra = null;  // ¿el servidor guarda la forma de cada color?
  const temporizadores = new Map();

  // Etapa 20: ámbito local (proyecto + usuario), perfiles y estado del guardado en este navegador.
  const CLAVE_GENERAL = "general";
  const pestana = uuid();    // identifica esta pestaña frente a otras con el mismo borrador
  let ambitoActual = null;   // «URL del proyecto|UUID del administrador»
  let perfiles = [];         // perfiles guardados de este ámbito (sin el general), ya validados
  let ultimoBorrador = null; // { ambito, id }: lote con trabajo pendiente que esta pestaña tenía abierto
  let vistaBorradores = false;
  let borradoresLista = [];  // resumen de los borradores del ámbito (para la lista)
  let espacio = null;        // estimación del navegador { usado, cuota }
  let editorPerfil = null;   // formulario de perfil abierto: { id, valores, errores, nuevo }
  let confirmarBorrar = null; // { tipo: "perfil"|"borrador", id }
  let importacion = null;    // respaldo leído que espera una decisión
  let avisoPerfil = "";      // explicación tras cambiar o editar el perfil del lote
  const persistencia = { estado: "inactivo", mensaje: "", cuando: null, tipo: "" };

  function loteNuevo(perfilElegido = null) {
    /* destinos (etapa 19): fichas que recibirán los ajustes, independientes de «Incluir en el guardado».
       null = todas las editables (mientras no se elija nada); un Set de claves de ficha = elegidas a mano
       (las fichas nuevas no se añaden solas). avisoDestinos explica cambios en esa selección.
       Etapa 20: id del borrador local, ámbito (proyecto + usuario), perfil del lote (clave de su
       instantánea en «instantaneas») y el pegado de varias publicaciones en curso. */
    const base = { id: uuid(), ambito: ambitoActual, creado: new Date().toISOString(), instantaneas: {}, perfilLote: CLAVE_GENERAL, pegado: null };
    if (perfilElegido) base.perfilLote = guardarInstantanea(base, perfilElegido);
    return { ...base, fichas: [fichaNueva(base.perfilLote)], margen: "", categoria: "", segmento: CONSERVAR, publico: CONSERVAR,
      ajustesAbiertos: false, erroresAjustes: {}, resumenAjustes: null, destinos: null, avisoDestinos: "" };
  }
  function fichaNueva(perfil = lote?.perfilLote || CLAVE_GENERAL) {
    return {
      clave: nuevaClave("f"), id: uuid(), seleccionada: true,
      marca: "", modelo: "", publico: "", categoria: "", segmento: "",
      editados: new Set(), revisar: new Set(), colores: [colorNuevo()],
      estado: "borrador", mensaje: "", codigo: "", pendiente: null, operaciones: new Set(), ultimaOperacion: null,
      decisionCatalogo: false, distintaDe: new Set(), errores: [],
      // Etapa 20: instantánea del perfil con el que se lee; categoría que puso el perfil (no a mano);
      // propuestas de «Recordar para este proveedor» que se descartaron.
      perfil, origenCategoria: "", descartadas: new Set(),
      // Etapa 20: cantidad de colores pedida («(2 colores)» o escrita a mano). Dato de preparación: no se
      // guarda en el catálogo. Texto tal cual ("" = sin indicar).
      coloresPedidos: ""
    };
  }
  function colorNuevo() {
    return {
      // Etapa 20: encabezado y texto original del pegado de varias publicaciones; lo que leyó el lector
      // (para proponer reglas) y las reglas del perfil que se aplicaron.
      encabezado: "", original: "", leido: null, reglas: [],
      // Etapa 20: color preparado a partir de la publicación de otro color de la ficha («(2 colores)»):
      // propone sus tallas y su precio mientras no se corrijan a mano ni tenga su propio mensaje.
      preparado: false, origen: "",
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
    // Etapa 20: el producto con el MISMO identificador es esta ficha (guardada con una respuesta perdida),
    // no otra zapatilla: no cuenta como coincidencia.
    return panel().productos().filter((p) => p.id !== f.id && texto().claveModelo(p.marca, p.nombre) === k);
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
    // Etapa 20: con el perfil de la ficha (su instantánea). Prioridad: corrección a mano, dato explícito
    // del mensaje, regla del perfil y, por último, el valor general.
    const perfil = perfilDe(f);
    const r = texto().analizar(c.texto, { marcas: marcasConocidas(), perfil });
    const esPrincipal = f.colores[0] === c;
    // Solo se rellena lo que la persona no cambió a mano.
    if (esPrincipal) {
      if (!f.editados.has("marca")) f.marca = r.marca ? mayus(r.marca) : "";
      if (!f.editados.has("modelo")) f.modelo = r.modelo ? mayus(r.modelo) : "";
      if (!f.editados.has("publico")) f.publico = r.publico || "";
      for (const k of ["marca", "modelo", "publico"]) {
        if (r.revisar.includes(k) && !f.editados.has(k)) f.revisar.add(k); else f.revisar.delete(k);
      }
      c.leido = { marca: r.marca, modelo: r.modelo, publico: r.publico };
      // Categoría habitual del perfil: solo si nadie la escribió (a mano o con «Aplicar ajustes»).
      if (!f.editados.has("categoria") && (!f.categoria.trim() || f.origenCategoria === "perfil")) {
        if (perfil.categoria) { f.categoria = perfil.categoria; f.origenCategoria = "perfil"; }
        else if (f.origenCategoria === "perfil") { f.categoria = ""; f.origenCategoria = ""; }
      }
    }
    c.reglas = r.reglas || [];
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
    if (esPrincipal && !f.editados.has("colores")) {
      // Etapa 20: cantidad de colores del mensaje. Solo se anota: los colores se preparan con una acción expresa
      // (o al crear desde «Pegar varias publicaciones»); volver a leer nunca añade colores.
      // Una cantidad no válida se muestra tal como llegó (no se redondea ni se cambia por otra) y queda «Revisar».
      f.coloresPedidos = r.cantidadColores ? String(r.cantidadColores) : (r.notaCantidad ? r.cantidadTexto || "" : "");
      if (r.notaCantidad || (r.cantidadColores && r.cantidadColores > comun().LIM.colores)) f.revisar.add("colores"); else f.revisar.delete("colores");
    }
    aplicarRegla(f);
    // Los colores preparados desde esta publicación siguen sus tallas y su precio (salvo lo corregido a mano).
    for (const otro of f.colores) if (otro !== c && otro.preparado && otro.origen === c.clave && !otro.texto.trim()) proponerDesde(c, otro);
  }

  /* Etapa 20: un color preparado propone las tallas y el precio del proveedor de la publicación de la que
     sale. Lo que se corrigió a mano en ese color no se toca. El nombre queda vacío y «Revisar». */
  function proponerDesde(o, c2) {
    if (!c2.editados.has("tallas")) {
      c2.tallasTexto = o.tallasTexto;
      c2.todas = o.todas;
      c2.expresionRegla = o.expresionRegla;
      c2.notaRegla = o.notaRegla;
      if (o.revisar.has("tallas")) c2.revisar.add("tallas"); else c2.revisar.delete("tallas");
    }
    if (!c2.editados.has("proveedor")) {
      c2.proveedor = o.proveedor;
      c2.precios = [...(o.precios || [])];
      c2.notaPrecios = o.notaPrecios;
      if (o.revisar.has("precio")) c2.revisar.add("precio"); else c2.revisar.delete("precio");
    }
    if (!c2.color.trim()) c2.revisar.add("color");
    if (!c2.ventaManual) ventaAutomatica(c2);
  }
  // Cantidad de colores pedida: { vacio } | { n, valido }.
  function pedidosDe(f) {
    const t = String(f.coloresPedidos ?? "").trim();
    if (!t) return { vacio: true, valido: false, n: 0 };
    const n = /^\d{1,3}$/.test(t) ? Number(t) : NaN;
    return { vacio: false, n, valido: Number.isInteger(n) && n >= 1 && n <= comun().LIM.colores };
  }
  /* Añade los colores que faltan hasta «total» (nunca quita ninguno). Cada uno nace preparado desde el
     primer color: sus propias fotos (ninguna), forma, tono y tallas, con el precio y las tallas propuestas. */
  function prepararColores(f, total) {
    const objetivo = Math.min(total, comun().LIM.colores);
    const origen = f.colores[0];
    const nuevos = [];
    while (f.colores.length < objetivo) {
      const c = colorNuevo();
      c.preparado = true;
      c.origen = origen.clave;
      c.margenAplicado = origen.margenAplicado ?? null;
      proponerDesde(origen, c);
      f.colores.push(c);
      nuevos.push(c);
    }
    if (nuevos.length) { f.pendiente = null; aplicarRegla(f); }
    return nuevos;
  }

  /* «Todas las tallas» o «numeración <público>»: las tallas de cada color que lo dice salen de la regla
     del proveedor según el público de la ficha. Unas tallas escritas a mano no se tocan. Sin público, se
     pide elegirlo. */
  function aplicarRegla(f) {
    const perfil = perfilDe(f);
    for (const c of f.colores) {
      if (!c.todas) continue;
      if (c.editados.has("tallas")) { c.notaRegla = ""; continue; }
      const tallas = texto().tallasPorRegla(f.publico, perfil);
      c.tallasTexto = tallas.join("; ");
      c.notaRegla = texto().notaRegla(f.publico, c.expresionRegla, perfil);
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
    if (!cuerpo) return;
    pintarLocal();
    // Etapa 20: sin lote (al abrir con borradores guardados) o con la lista pedida, primero los borradores.
    if (!lote || vistaBorradores) {
      cuerpo.replaceChildren(pintarBorradores());
      pintarPie();
      return;
    }
    // Otra pestaña continúa este borrador: aquí se detiene para no mezclar cambios.
    if (persistencia.estado === "desconectado") {
      cuerpo.replaceChildren(pintarDesconectado());
      pintarPie();
      return;
    }
    // Etapa 19: primero lo que afecta a varias fichas (ajustes plegables y fotos por lote), después las fichas.
    // Etapa 20: delante, el proveedor y el pegado de varias publicaciones.
    cuerpo.replaceChildren(pintarEntrada(), ...(lote.pegado ? [pintarPegado()] : []), pintarAjustes(), pintarReparto(), pintarListaFichas(), pintarAgregar(), pintarListas());
    pintarPie();
    programarGuardado();
  }

  // Sugerencias de marca y categoría: una sola vez para todo el lote.
  function pintarListas() {
    const caja = nodo("div");
    caja.hidden = true;
    const marcas = nodo("datalist");
    marcas.id = "imp-marcas";
    for (const v of [...new Set([...marcasCatalogo(), ...texto().MARCAS_BASE.map(mayus)])]) { const o = nodo("option"); o.value = v; marcas.append(o); }
    caja.append(marcas); // las categorías usan el selector común (categorias.js)
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
    // Etapa 20: selector común; «Sin cambiar» conserva la categoría de cada ficha.
    const categoria = window.GamaTallaCategorias.crear({ id: "imp-categoria", valor: lote.categoria, modo: "bloque", catalogo: categoriasCatalogo(),
      error: lote.erroresAjustes?.categoria || "", ayuda: "«Sin cambiar»: cada ficha conserva la suya.", datos: { lote: "categoria" } });
    const guia = radios({ nombre: "imp-segmento", id: "imp-lote-segmento", leyenda: "Tabla de la guía de tallas", valor: lote.segmento,
      opciones: [[CONSERVAR, "Sin cambiar"], ...comun().SEGMENTOS], datos: { lote: "segmento" } });
    guia.append(nodo("p", "campo-ayuda", "Independiente del público. «Sin indicar» se aplica si lo eliges expresamente."));
    const margen = campo({ id: "imp-margen", etiqueta: "Sumar al precio del proveedor (COP)", valor: lote.margen, modo: "numeric",
      ayuda: "Precio de venta = precio del proveedor + este importe, siempre desde el del proveedor (aplicarlo dos veces no suma dos veces). Vacío: los precios no cambian. Los escritos a mano se conservan.",
      datos: { lote: "margen" } });
    for (const [clave, caja] of [["margen", margen]]) {
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
    if (c.encabezado) mensajeCaja.append(nodo("p", "importador-encabezado", `Mensaje de WhatsApp: ${c.encabezado}`));
    // Etapa 20: color preparado desde la publicación de la ficha («(2 colores)»).
    if (c.preparado && !c.texto.trim()) {
      const nota = nodo("p", "importador-preparado", "Color preparado desde la publicación de esta ficha: propone sus tallas y su precio del proveedor. Escribe su nombre y añade sus fotos; si el proveedor envió un mensaje propio para este color, pégalo aquí.");
      nota.id = `imp-${c.clave}-preparado`;
      mensajeCaja.append(nota);
    }
    mensajeCaja.append(etiqueta, area, ayudaMensaje);
    // Etapa 20: el texto tal cual se pegó (con encabezado y líneas de multimedia), solo para revisar.
    if (c.original && c.original.trim() !== c.texto.trim()) {
      const original = nodo("details", "importador-original");
      original.append(nodo("summary", "", "Ver el texto original pegado"), nodo("p", "importador-original-texto", c.original));
      mensajeCaja.append(original);
    }
    const omitido = [];
    if (c.omitido?.telefonos) omitido.push(c.omitido.telefonos === 1 ? "un teléfono" : `${c.omitido.telefonos} teléfonos`);
    if (c.omitido?.contacto) omitido.push(c.omitido.contacto === 1 ? "una frase de contacto" : `${c.omitido.contacto} frases de contacto`);
    if (c.omitido?.promocional) omitido.push(c.omitido.promocional === 1 ? "una línea promocional" : `${c.omitido.promocional} líneas promocionales`);
    const listaOmitido = omitido.length > 1 ? `${omitido.slice(0, -1).join(", ")} y ${omitido[omitido.length - 1]}` : omitido[0];
    const avisos = [...(omitido.length ? [`Se omitió ${listaOmitido}.`] : []), ...(c.reglas || []), ...c.notas,
      ...(c.notaPrecios && c.revisar.has("precio") ? [c.notaPrecios] : []), ...(c.notaRegla ? [c.notaRegla] : [])];
    const revisar = [...c.revisar].map((k) => NOMBRES_CAMPO[k]).concat(i === 0 ? [...f.revisar].map((k) => NOMBRES_CAMPO[k]) : []);
    if ((c.texto.trim() || c.preparado) && revisar.length) avisos.push(`Revisa: ${revisar.join(", ")}.`);
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
        obligatorio: true, revisar: f.revisar.has("publico"), datos: { ficha: f.clave, fcampo: "publico" } }), pintarCantidadColores(f));
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
    const recordar = i === 0 ? pintarPropuestas(f, c) : null;
    li.append(paso("importador-datos", `imp-${c.clave}-datos-titulo`, "Datos reconocidos", notaDatos, ...datos, ...(recordar ? [recordar] : [])));

    // 4. Ajustes adicionales: categoría y guía (de la zapatilla) y cómo se muestra este color.
    const ajustes = [];
    if (i === 0) {
      const filaCategoria = nodo("div", "campos-fila");
      filaCategoria.append(window.GamaTallaCategorias.crear({ id: `imp-${f.clave}-categoria`, valor: f.categoria, modo: "obligatorio", catalogo: categoriasCatalogo(),
        datos: { ficha: f.clave, fcampo: "categoria" },
        ayuda: f.origenCategoria === "perfil" && f.categoria ? `Categoría habitual del perfil «${perfilDe(f).nombre}». Puedes cambiarla.` : "" }));
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

  /* Etapa 20: «Cantidad de colores» de la ficha. Muestra cuántos tiene y cuántos se piden; los que faltan
     se añaden con una acción expresa. Una cantidad menor no quita nada: la retirada sigue siendo
     «Separar en otra ficha» y quitar esa ficha. */
  function pintarCantidadColores(f) {
    const lim = comun().LIM.colores;
    const p = pedidosDe(f);
    const tiene = f.colores.length;
    const plural = (n) => `${n} ${n === 1 ? "color" : "colores"}`;
    const caja = campo({ id: `imp-${f.clave}-colores`, etiqueta: "Cantidad de colores", valor: String(f.coloresPedidos ?? ""), modo: "numeric", max: 3,
      revisar: f.revisar.has("colores"), datos: { ficha: f.clave, fcampo: "coloresPedidos" },
      ayuda: "Dato de preparación (no se guarda en el catálogo). Los colores nuevos proponen las tallas y el precio de la publicación; corrígelos por separado." });
    caja.classList.add("importador-cantidad");
    const estado = nodo("div", "importador-cantidad-estado");
    estado.id = `imp-${f.clave}-colores-estado`;
    estado.setAttribute("role", "status");
    let textoEstado;
    let clase = "campo-ayuda";
    if (p.vacio) textoEstado = `Sin cantidad indicada: la ficha tiene ${plural(tiene)}. Escribe cuántos tendrá para preparar los que falten.`;
    else if (!p.valido) { textoEstado = `Escribe un número entero entre 1 y ${lim} (el máximo de colores por zapatilla).`; clase = "campo-error"; }
    else if (p.n > tiene) textoEstado = `La ficha tiene ${plural(tiene)}; se piden ${p.n}. Faltan ${p.n - tiene}.`;
    else if (p.n < tiene) textoEstado = `La ficha tiene ${plural(tiene)}; se piden ${p.n}. No se quita ninguno solo: para retirar uno, usa «Separar en otra ficha» y quita esa ficha.`;
    else textoEstado = `La ficha tiene ${p.n === 1 ? "el color que se pide" : `los ${p.n} colores que se piden`}.`;
    const linea = nodo("p", clase, textoEstado);
    estado.append(linea);
    if (p.valido && p.n > tiene && editable(f)) {
      const faltan = p.n - tiene;
      const anadir = boton(faltan === 1 ? "Añadir 1 color" : `Añadir ${faltan} colores`, "preparar-colores", "boton boton-secundario boton-compacto", { ficha: f.clave });
      anadir.id = `imp-${f.clave}-preparar`;
      anadir.setAttribute("aria-describedby", estado.id);
      estado.append(anadir);
    }
    const entrada = $("input", caja);
    entrada.setAttribute("aria-describedby", `${estado.id} ${entrada.getAttribute("aria-describedby") || ""}`.trim());
    if (!p.vacio && !p.valido) entrada.setAttribute("aria-invalid", "true");
    caja.append(estado);
    return caja;
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
    if (!guardar) return;
    // Sin lote a la vista (lista de borradores, o el borrador sigue en otra pestaña) no hay nada que guardar.
    const sinLote = !lote || vistaBorradores || persistencia.estado === "desconectado";
    guardar.hidden = sinLote;
    if (sinLote) return;
    const marcadas = lote.fichas.filter((f) => editable(f) && f.seleccionada).length;
    guardar.textContent = marcadas ? `Guardar lote como oculto (${marcadas})` : "Guardar lote como oculto";
    document.querySelectorAll("#importador button, #importador input, #importador textarea").forEach((n) => {
      if (n.closest("#importador-salida")) return;
      const bloquear = (guardando && !n.matches('[data-imp="cerrar"]')) || n.dataset.bloqueado === "1";
      if (n.disabled !== bloquear) n.disabled = bloquear;
    });
  }

  // Repinta una ficha conservando el foco y la posición del cursor.
  /* Etapa 20: un menú de categorías abierto sigue abierto tras un repintado diferido (p. ej. el que
     programa escribir el nombre de un color): si no, se cerraría bajo el dedo o el ratón. */
  const menusAbiertos = (raiz) => [...raiz.querySelectorAll(".selector-categoria[open]")].map((d) => d.id).filter(Boolean);
  function reabrirMenus(ids) {
    for (const id of ids) { const d = document.getElementById(id); if (d && !d.open) d.open = true; }
  }
  function repintarFicha(f) {
    const actual = document.getElementById(`imp-${f.clave}`);
    if (!actual) return;
    const activo = document.activeElement;
    const id = activo && actual.contains(activo) ? activo.id : null;
    const seleccion = id && typeof activo.selectionStart === "number" ? [activo.selectionStart, activo.selectionEnd] : null;
    const abiertos = menusAbiertos(actual);
    actual.replaceWith(pintarFicha(f));
    reabrirMenus(abiertos);
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
    programarGuardado();
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
    const abiertos = menusAbiertos(actual);
    actual.replaceWith(pintarAjustes());
    reabrirMenus(abiertos);
    if (activo && document.getElementById(activo)) document.getElementById(activo).focus({ preventScroll: true });
    programarGuardado();
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
    // Etapa 20: «ref» identifica la foto en el borrador local. El original se guarda en este navegador
    // en cuanto se añade: si se recarga mientras se optimiza, se vuelve a procesar al recuperarlo.
    const items = lista.map((archivo) => ({ clave: nuevaClave("p"), ref: uuid(), estado: "procesando", archivo, nombre: archivo.name || "" }));
    c.fotos.push(...items);
    repintarFicha(f);
    guardarBorrador({ inmediato: true });
    await procesarFotos(f, c, items);
  }

  // Optimiza (WebP de fotos.js) unas fotos de un color, de una en una, y repinta cada una al terminar.
  async function procesarFotos(f, c, items) {
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
    programarGuardado();
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
    for (const archivo of lista) r.items.push({ clave: nuevaClave("r"), ref: uuid(), nombre: archivo.name || "imagen sin nombre", archivo, version: 1, estado: "procesando", destino: null });
    r.aplicado = false;
    r.estado = aviso ? { texto: aviso, tipo: "aviso" } : null;
    repintarReparto();
    guardarBorrador({ inmediato: true }); // los originales, por si se recarga mientras se optimizan
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
    Object.assign(it, { nombre: archivo.name || it.nombre, archivo, ref: uuid(), version: it.version + 1, estado: "procesando", mensaje: "", info: null, blob: null, vistaPrevia: null });
    reparto().aplicado = false;
    reparto().estado = { texto: `Reemplazada por «${it.nombre}»: conserva su destino.`, tipo: "ok" };
    repintarReparto();
    document.querySelector(`#imp-reparto [data-imp="reparto-quitar"][data-item="${it.clave}"]`)?.focus({ preventScroll: true });
    guardarBorrador({ inmediato: true });
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
      // La foto conserva la «ref» de la imagen: en el borrador local es el mismo archivo, no se reescribe.
      d.color.fotos.unshift({ clave: nuevaClave("p"), ref: it.ref, estado: "lista", blob: it.blob, vistaPrevia: it.vistaPrevia, info: it.info, archivoLote: it.nombre });
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
    /* Etapa 20: primero se fijan los nombres de archivo de todas las fotos por subir y se guarda el
       borrador local; después se suben. Si la página se recarga a mitad, el borrador conserva esos
       nombres: al reintentar se sube con el MISMO nombre y, si ya estaba, se comprueba y no se duplica. */
    const porSubir = [];
    for (const c of f.colores) {
      for (const foto of c.fotos) {
        if (foto.estado === "subida" && foto.producto === f.id && foto.variante === c.id) continue;
        if (!foto.blob) return `Una foto de ${c.color.trim() || "un color"} no está lista. Quítala o vuelve a añadirla.`;
        if (!foto.objeto || foto.producto !== f.id || foto.variante !== c.id) {
          if (foto.estado === "subida") foto.anterior = foto.objeto;
          foto.objeto = fotos().nombreObjeto(f.id, c.id);
          foto.producto = f.id;
          foto.variante = c.id;
        }
        porSubir.push({ c, foto });
      }
    }
    if (porSubir.length) await guardarBorrador({ inmediato: true });
    for (const { c, foto } of porSubir) {
      foto.estado = "subiendo";
      const r = await fotos().subir({ base: conf.url, clave: conf.clave, token, objeto: foto.objeto, blob: foto.blob });
      if (r.ok || ((r.tipo === "duplicado" || r.tipo === "red") && (await existeObjeto(foto.objeto)) === true)) {
        foto.estado = "subida";
        foto.ruta = fotos().urlPublica(conf.url, foto.objeto);
        if (foto.anterior) comun().limpiarArchivoSinUso(foto.anterior);
        delete foto.anterior;
        continue;
      }
      foto.estado = "lista";
      return r.tipo === "red" || r.tipo === "duplicado"
        ? `Se perdió la conexión al subir una foto de ${c.color.trim() || "un color"} y no pudimos comprobar si llegó. Reintenta: usa el mismo nombre y no se duplicará.`
        : `${r.mensaje || "El servidor rechazó una foto."} (${c.color.trim() || "un color"})`;
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
      /* Etapa 20: una ficha «sin confirmar» (respuesta perdida o recarga a mitad del guardado) se
         comprueba primero, solo lectura, con la operación que conserva el borrador. Si ya se guardó, no
         se reenvía; si sigue sin aparecer, se reintenta con la MISMA operación (no se duplica). */
      const enviar = [];
      for (const f of validas) {
        if (f.estado === "sin-confirmar" && (f.pendiente || f.ultimaOperacion)) {
          mensaje(`Comprobando la ficha ${numero(f)} antes de reintentar…`);
          await comprobar(f);
          if (!lote) return;
          if (f.estado === "guardada") { resumen.guardadas += 1; continue; }
          if (f.estado === "fallida") { resumen.fallidas += 1; continue; }
        }
        enviar.push(f);
      }
      for (const [i, f] of enviar.entries()) {
        mensaje(`Guardando la ficha ${numero(f)} (${i + 1} de ${enviar.length})…`);
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
        guardarBorrador({ inmediato: true }); // el resultado de cada ficha, en el borrador local
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
    // Etapa 20: la operación queda en el borrador local ANTES de enviarla. Tras una recarga a mitad, la
    // ficha vuelve «sin confirmar» con esta misma operación y se comprueba antes de repetir nada.
    await guardarBorrador({ inmediato: true });
    if (!lote) return;
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
    /* Etapa 20: antes de darla por fallida, ¿ya existe esta zapatilla con una operación de esta ficha?
       (Una escritura anterior cuya respuesta se perdió llegó a la vez que el reintento: el servidor
       rechaza el segundo alta.) Si es así, es la nuestra: se reconcilia, no se repite nada. */
    let existente = null;
    try {
      const q = await panel().cliente().from("productos").select("id,ultima_operacion").eq("id", f.id).maybeSingle();
      existente = q.error ? null : q.data;
    } catch { existente = null; }
    if (!lote) return;
    if (existente && f.operaciones.has(existente.ultima_operacion)) { await comprobar(f); return; }
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
    Object.assign(nueva, { marca: ficha.marca, modelo: ficha.modelo, publico: ficha.publico, categoria: ficha.categoria, segmento: ficha.segmento, colores: [color],
      perfil: ficha.perfil, origenCategoria: ficha.origenCategoria });
    nueva.editados = new Set(["marca", "modelo", "publico", ...(ficha.editados.has("categoria") ? ["categoria"] : [])]);
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
      // Una categoría aplicada al lote cuenta como escrita a mano: el perfil no la sustituye.
      if (categoria) { f.categoria = categoria; f.editados.add("categoria"); f.origenCategoria = ""; }
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

  // ================================================================== etapa 20
  // ------------------------------------------------------------------ perfiles: instantáneas
  const general = () => texto().PERFIL_GENERAL;
  const esGeneral = (p) => texto().esGeneral(p);
  function claveInstantanea(p) { return !p || esGeneral(p) ? CLAVE_GENERAL : `${p.id}@${p.revision}`; }
  // Guarda en el lote una copia (congelada) del perfil y devuelve su clave. Editar o borrar el perfil
  // después no cambia esta copia: las fichas leídas con ella se restauran igual.
  function guardarInstantanea(l, p) {
    const k = claveInstantanea(p);
    if (k !== CLAVE_GENERAL && !l.instantaneas[k]) l.instantaneas[k] = p;
    return k;
  }
  function instantanea(k, l = lote) { return (k && k !== CLAVE_GENERAL && l?.instantaneas?.[k]) || general(); }
  const perfilDe = (f) => instantanea(f?.perfil);
  const perfilLote = () => instantanea(lote?.perfilLote);
  // Versión guardada (vigente) del perfil de una instantánea; null para el general o si se eliminó.
  const perfilVivo = (p) => (p && !esGeneral(p) ? perfiles.find((x) => x.id === p.id) || null : null);
  const nombrePerfil = (p) => (esGeneral(p) ? "Perfil general" : p.nombre);
  const rangoTexto = (r) => (r ? `${r.desde}–${r.hasta}` : "");
  function resumenPerfil(p) {
    if (esGeneral(p)) return "Reglas actuales: numeración dama o mujer 36–39; hombre o caballero 36–44; unisex 36–44.";
    const partes = [];
    if (p.marcas.length) partes.push(`${p.marcas.length} ${p.marcas.length === 1 ? "alias de marca" : "alias de marcas"}`);
    if (p.publico.length) partes.push(`${p.publico.length} ${p.publico.length === 1 ? "expresión de público" : "expresiones de público"}`);
    const rangos = ["dama", "hombre", "unisex"].filter((x) => p.rangos[x]).map((x) => `${textoPublico(x)} ${rangoTexto(p.rangos[x])}`);
    if (rangos.length) partes.push(`tallas: ${rangos.join(", ")}`);
    if (p.categoria) partes.push(`categoría ${p.categoria}`);
    if (p.promociones.length) partes.push(`${p.promociones.length} ${p.promociones.length === 1 ? "frase omitida" : "frases omitidas"}`);
    return partes.length ? `${partes.join(" · ")}.` : "Sin reglas propias todavía: lee como el Perfil general.";
  }
  const ordenarPerfiles = (lista) => [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  function validarPerfiles(lista) {
    const salida = [];
    for (const p of lista || []) { const r = texto().normalizarPerfil(p); if (r.perfil) salida.push(r.perfil); }
    return ordenarPerfiles(salida);
  }
  async function recargarPerfiles() {
    if (!almacenOk || !ambitoActual) return;
    try { perfiles = validarPerfiles(await almacen().listarPerfiles(ambitoActual)); } catch { /* se conserva la lista anterior */ }
    if ($("#importador")?.open && lote && !vistaBorradores && persistencia.estado !== "desconectado") { repintarEntrada(); repintarPropuestas(); }
  }

  // ------------------------------------------------------------------ entrada: proveedor y pegado
  function pintarEntrada() {
    const s = nodo("section", "editor-seccion importador-entrada");
    s.id = "imp-entrada";
    s.setAttribute("aria-labelledby", "imp-entrada-titulo");
    const cabecera = nodo("div", "importador-entrada-cabecera");
    const h = nodo("h3", "editor-seccion-titulo", "Publicaciones del proveedor");
    h.id = "imp-entrada-titulo";
    h.tabIndex = -1;
    const pegar = boton("Pegar varias publicaciones", "pegado-abrir", "boton boton-secundario boton-compacto");
    pegar.id = "imp-pegado-abrir";
    pegar.setAttribute("aria-expanded", String(Boolean(lote.pegado)));
    cabecera.append(h, pegar);
    const ayuda = nodo("p", "campo-ayuda importador-entrada-ayuda", "Pega varios mensajes de WhatsApp a la vez y revisa cómo se separan, o pega cada publicación en su ficha, más abajo.");
    s.append(cabecera, ayuda, pintarPerfiles());
    return s;
  }
  function repintarEntrada() {
    const actual = $("#imp-entrada");
    if (!actual || !lote) return;
    const activo = document.activeElement?.id;
    const abiertos = menusAbiertos(actual);
    actual.replaceWith(pintarEntrada());
    reabrirMenus(abiertos);
    if (activo && document.getElementById(activo)) document.getElementById(activo).focus({ preventScroll: true });
    programarGuardado();
  }

  function pintarPerfiles() {
    const actual = perfilLote();
    const eliminado = !esGeneral(actual) && !perfilVivo(actual);
    const d = nodo("details", "importador-perfiles");
    d.id = "imp-perfiles";
    d.open = Boolean(lote.perfilesAbierto || editorPerfil || confirmarBorrar?.tipo === "perfil" || avisoPerfil);
    const resumen = nodo("summary", "importador-ajustes-resumen");
    resumen.id = "imp-perfiles-resumen";
    resumen.append(nodo("span", "importador-ajustes-titulo", `Perfil del proveedor: ${nombrePerfil(actual)}${eliminado ? " (eliminado)" : ""}`),
      nodo("span", "importador-ajustes-pista", "Reglas para leer sus mensajes: alias de marcas, público, numeración, categoría y frases que se omiten."));
    d.append(resumen);

    const grupo = nodo("fieldset", "editor-opciones importador-perfiles-lista");
    grupo.id = "imp-perfil-lote";
    grupo.append(nodo("legend", "", "Perfil para las publicaciones nuevas de este lote"));
    const lista = nodo("ul", "importador-perfiles-opciones");
    const opciones = [general(), ...perfiles];
    if (eliminado) opciones.push(actual);
    opciones.forEach((p, i) => {
      const li = nodo("li", "importador-perfil");
      const caja = nodo("label", "casilla");
      const r = nodo("input");
      r.type = "radio";
      r.name = "imp-perfil-lote";
      r.id = `imp-perfil-lote-${i}`;
      r.value = esGeneral(p) ? CLAVE_GENERAL : p.id;
      r.checked = esGeneral(p) ? esGeneral(actual) : !esGeneral(actual) && actual.id === p.id;
      r.dataset.perfilLote = r.value;
      if (p === actual && eliminado) r.dataset.eliminado = "1";
      const detalle = nodo("span", "importador-perfil-texto");
      detalle.append(nodo("span", "importador-perfil-nombre", `${nombrePerfil(p)}${p === actual && eliminado ? " (eliminado: este lote conserva sus reglas)" : ""}`),
        nodo("span", "importador-perfil-resumen", resumenPerfil(p)));
      caja.append(r, detalle);
      li.append(caja);
      if (!esGeneral(p) && perfilVivo(p)) {
        const acciones = nodo("div", "importador-perfil-acciones");
        const editar = boton("Editar", "perfil-editar", "boton boton-texto boton-mini", { perfil: p.id });
        editar.setAttribute("aria-label", `Editar el perfil ${p.nombre}`);
        const borrar = boton("Eliminar", "perfil-eliminar", "boton boton-texto boton-mini", { perfil: p.id });
        borrar.setAttribute("aria-label", `Eliminar el perfil ${p.nombre}`);
        acciones.append(editar, borrar);
        li.append(acciones);
        if (confirmarBorrar?.tipo === "perfil" && confirmarBorrar.id === p.id) {
          const confirma = nodo("div", "importador-confirmar");
          confirma.setAttribute("role", "group");
          confirma.setAttribute("aria-label", `Confirmar la eliminación del perfil ${p.nombre}`);
          confirma.append(nodo("p", "", `¿Eliminar el perfil «${p.nombre}»? Las fichas y los borradores que ya lo usaron conservan sus reglas; solo deja de ofrecerse para lotes nuevos.`));
          const fila = nodo("div", "editor-botones");
          fila.append(boton("Eliminar el perfil", "perfil-eliminar-si", "boton boton-principal boton-compacto", { perfil: p.id }),
            boton("Cancelar", "confirmar-cancelar", "boton boton-secundario boton-compacto"));
          confirma.append(fila);
          li.append(confirma);
        }
      }
      lista.append(li);
    });
    grupo.append(lista);
    d.append(grupo);

    if (editorPerfil) d.append(pintarEditorPerfil());
    else {
      const crear = boton("Crear perfil de proveedor", "perfil-nuevo", "boton boton-secundario boton-compacto");
      crear.id = "imp-perfil-nuevo";
      if (!almacenOk) { crear.setAttribute("aria-disabled", "true"); crear.setAttribute("aria-describedby", "imp-perfiles-sin-almacen"); }
      d.append(crear);
      if (!almacenOk) {
        const sin = nodo("p", "campo-ayuda", "Este navegador no permite guardar perfiles (almacenamiento local no disponible). Puedes seguir con el Perfil general.");
        sin.id = "imp-perfiles-sin-almacen";
        d.append(sin);
      }
    }
    // Cambiar o editar el perfil no toca lo ya leído; volver a leer es una acción expresa.
    const distintas = lote.fichas.filter((f) => editable(f) && f.perfil !== lote.perfilLote && f.colores.some((c) => c.texto.trim()));
    if (avisoPerfil || distintas.length) {
      const caja = nodo("div", "importador-perfil-aviso");
      caja.id = "imp-perfil-aviso";
      caja.setAttribute("role", "status");
      if (avisoPerfil) caja.append(nodo("p", "", avisoPerfil));
      if (distintas.length) {
        caja.append(nodo("p", "campo-ayuda", `${distintas.length === 1 ? "1 ficha sin guardar se leyó" : `${distintas.length} fichas sin guardar se leyeron`} con otro perfil o con una versión anterior de este. Solo cambian si las vuelves a leer; lo que corregiste a mano se conserva.`));
        const reaplicar = boton(`Volver a leer ${distintas.length === 1 ? "1 ficha" : `${distintas.length} fichas`} con «${nombrePerfil(actual)}»`, "perfil-reaplicar", "boton boton-secundario boton-compacto");
        reaplicar.id = "imp-perfil-reaplicar";
        caja.append(reaplicar);
      }
      d.append(caja);
    }
    return d;
  }

  /* Las fichas que aún no tienen ningún mensaje no han leído nada: pasan al perfil del lote. Las que ya
     se leyeron conservan el suyo hasta que se vuelvan a leer expresamente. */
  function adoptarPerfilEnVacias() {
    for (const f of lote.fichas) if (editable(f) && !f.colores.some((c) => c.texto.trim())) f.perfil = lote.perfilLote;
  }
  // «Recordar para este proveedor» depende de los perfiles guardados y del perfil del lote.
  function repintarPropuestas() {
    for (const f of lote?.fichas || []) if (editable(f) && f.colores[0]?.texto.trim()) repintarFicha(f);
  }
  function elegirPerfilLote(valor) {
    if (valor === CLAVE_GENERAL) lote.perfilLote = CLAVE_GENERAL;
    else {
      const p = perfiles.find((x) => x.id === valor);
      if (!p) return; // el eliminado que conserva el lote: ya es el elegido
      lote.perfilLote = guardarInstantanea(lote, p);
    }
    adoptarPerfilEnVacias();
    const n = lote.fichas.filter((f) => editable(f) && f.colores.some((c) => c.texto.trim())).length;
    avisoPerfil = `Las publicaciones nuevas de este lote se leerán con «${nombrePerfil(perfilLote())}».${n ? " Las fichas ya creadas no cambian." : ""}`;
    lote.perfilesAbierto = true;
    repintarEntrada();
    repintarPropuestas();
    if (lote.pegado?.fase === "revision") repintarPegado();
  }

  function reaplicarPerfil() {
    const fichas = lote.fichas.filter((f) => editable(f) && f.perfil !== lote.perfilLote && f.colores.some((c) => c.texto.trim()));
    if (!fichas.length) return;
    for (const f of fichas) {
      f.perfil = lote.perfilLote;
      f.pendiente = null;
      for (const c of f.colores) if (c.texto.trim()) aplicarTexto(f, c);
    }
    avisoPerfil = `Se volvieron a leer ${fichas.length === 1 ? "1 ficha" : `${fichas.length} fichas`} (${listaNumeros(fichas)}) con «${nombrePerfil(perfilLote())}». Lo que corregiste a mano se conservó.`;
    pintar();
    mensaje(avisoPerfil, "ok");
    $("#imp-perfiles-resumen")?.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ perfiles: formulario
  const lineasDe = (lista, f) => lista.map(f).join("\n");
  function valoresDe(p) {
    return {
      nombre: p?.nombre || "",
      marcas: lineasDe(p?.marcas || [], (m) => `${m.alias} = ${m.marca}`),
      publico: lineasDe(p?.publico || [], (x) => `${x.expresion} = ${x.publico}`),
      numeracion: lineasDe(p?.numeracion || general().numeracion, (x) => `${x.expresion} = ${x.publico}`),
      rangos: Object.fromEntries(["dama", "hombre", "unisex"].map((x) => [x, { desde: p?.rangos?.[x] ? String(p.rangos[x].desde) : "", hasta: p?.rangos?.[x] ? String(p.rangos[x].hasta) : "" }])),
      categoria: p?.categoria || "",
      promociones: (p?.promociones || []).join("\n")
    };
  }
  function abrirEditorPerfil(id) {
    const p = id ? perfiles.find((x) => x.id === id) : null;
    editorPerfil = { id: p?.id || null, valores: valoresDe(p), errores: [] };
    confirmarBorrar = null;
    lote.perfilesAbierto = true;
    repintarEntrada();
    $("#imp-perfil-nombre")?.focus();
  }

  function pintarEditorPerfil() {
    const e = editorPerfil;
    const v = e.valores;
    const caja = nodo("div", "importador-perfil-editor");
    caja.id = "imp-perfil-editor";
    caja.setAttribute("role", "group");
    caja.setAttribute("aria-labelledby", "imp-perfil-editor-titulo");
    const h = nodo("h4", "importador-paso-titulo", e.id ? `Editar el perfil «${v.nombre || "sin nombre"}»` : "Nuevo perfil de proveedor");
    h.id = "imp-perfil-editor-titulo";
    caja.append(h, nodo("p", "campo-ayuda", "Reglas sencillas, una por línea. No admiten fórmulas ni código: cada expresión se compara como palabras completas, sin tildes ni mayúsculas. Se guardan solo en este navegador."));
    const errorDe = (campoPerfil) => e.errores.filter((x) => x.campo === campoPerfil).map((x) => x.mensaje);
    const conError = (nodoCampo, campoPerfil) => {
      const errores = errorDe(campoPerfil);
      if (!errores.length) return nodoCampo;
      const entrada = $("input, textarea", nodoCampo);
      const p = nodo("p", "campo-error", errores.join(" "));
      p.id = `imp-perfil-${campoPerfil}-error`;
      entrada?.setAttribute("aria-invalid", "true");
      entrada?.setAttribute("aria-describedby", `${p.id} ${entrada.getAttribute("aria-describedby") || ""}`.trim());
      nodoCampo.append(p);
      return nodoCampo;
    };
    const L = texto().LIMITES_PERFIL;
    caja.append(
      conError(campo({ id: "imp-perfil-nombre", etiqueta: "Nombre del proveedor", valor: v.nombre, max: L.nombre, obligatorio: true, datos: { perfilCampo: "nombre" } }), "nombre"),
      conError(campo({ id: "imp-perfil-marcas", etiqueta: "Alias de marcas", tipo: "textarea", valor: v.marcas, datos: { perfilCampo: "marcas" },
        ayuda: "alias = marca. Por ejemplo: NB = NEW BALANCE. Un alias de una o dos letras solo cuenta al principio de la línea." }), "marcas"),
      conError(campo({ id: "imp-perfil-publico", etiqueta: "Expresiones de público", tipo: "textarea", valor: v.publico, datos: { perfilCampo: "publico" },
        ayuda: "expresión = dama, hombre o unisex. Por ejemplo: chicas = dama. Las generales (dama, caballero, unisex…) siguen funcionando." }), "publico"),
      conError(campo({ id: "imp-perfil-numeracion", etiqueta: "Palabras de «numeración»", tipo: "textarea", valor: v.numeracion, datos: { perfilCampo: "numeracion" },
        ayuda: "palabra que sigue a «numeración» = público. Por ejemplo: niña = dama («numeración niña»)." }), "numeracion"));
    const rangos = nodo("fieldset", "editor-opciones importador-perfil-rangos");
    rangos.append(nodo("legend", "", "Tallas de «todas las tallas» y «numeración», por público"));
    rangos.append(nodo("p", "campo-ayuda", "Tallas EU enteras. Vacío: se usa el del Perfil general (Dama 36–39, Hombre 36–44, Unisex 36–44). Son convenciones de este proveedor, no límites del catálogo. Las tallas escritas en el mensaje siempre mandan."));
    for (const x of ["dama", "hombre", "unisex"]) {
      const fila = nodo("div", "importador-perfil-rango");
      fila.append(nodo("span", "importador-perfil-rango-nombre", textoPublico(x)),
        campo({ id: `imp-perfil-${x}-desde`, etiqueta: "Desde", valor: v.rangos[x].desde, modo: "numeric", max: 2, datos: { perfilCampo: `rango-${x}-desde` } }),
        campo({ id: `imp-perfil-${x}-hasta`, etiqueta: "Hasta", valor: v.rangos[x].hasta, modo: "numeric", max: 2, datos: { perfilCampo: `rango-${x}-hasta` } }));
      rangos.append(fila);
      for (const m of errorDe(`rango-${x}`)) {
        const p = nodo("p", "campo-error", m);
        p.id = `imp-perfil-rango-${x}-error`;
        fila.querySelectorAll("input").forEach((n) => { n.setAttribute("aria-invalid", "true"); n.setAttribute("aria-describedby", p.id); });
        rangos.append(p);
      }
    }
    caja.append(rangos,
      window.GamaTallaCategorias.crear({ id: "imp-perfil-categoria", etiqueta: "Categoría habitual", valor: v.categoria, modo: "perfil", catalogo: categoriasCatalogo(),
        error: errorDe("categoria").join(" "), datos: { perfilCampo: "categoria" },
        ayuda: "Opcional. Se propone en las fichas nuevas; nunca sustituye una categoría elegida a mano." }),
      conError(campo({ id: "imp-perfil-promociones", etiqueta: "Frases promocionales que se omiten", tipo: "textarea", valor: v.promociones, datos: { perfilCampo: "promociones" },
        ayuda: "Una por línea. Por ejemplo: envío gratis a todo el país. No pasan a la ficha." }), "promociones"));
    const acciones = nodo("div", "editor-botones importador-perfil-botones");
    const guardar = boton("Guardar perfil", "perfil-guardar", "boton boton-principal boton-compacto");
    guardar.id = "imp-perfil-guardar";
    acciones.append(guardar, boton("Cancelar", "perfil-cancelar", "boton boton-secundario boton-compacto"));
    caja.append(acciones);
    return caja;
  }

  // «expresión = valor», una por línea. Devuelve [[izquierda, derecha]] o anota el error.
  function leerEquivalencias(valor, campoPerfil, errores) {
    const salida = [];
    String(valor || "").split(/\r?\n/).forEach((linea, i) => {
      if (!linea.trim()) return;
      const n = linea.indexOf("=");
      if (n < 0) { errores.push({ campo: campoPerfil, mensaje: `Línea ${i + 1}: escribe «expresión = valor».` }); return; }
      salida.push([linea.slice(0, n).trim(), linea.slice(n + 1).trim()]);
    });
    return salida;
  }
  async function guardarPerfilEditado() {
    const e = editorPerfil;
    if (!e || !almacenOk) return;
    const v = e.valores;
    const errores = [];
    const rangos = {};
    for (const x of ["dama", "hombre", "unisex"]) {
      const desde = String(v.rangos[x].desde).trim();
      const hasta = String(v.rangos[x].hasta).trim();
      if (!desde && !hasta) { rangos[x] = null; continue; }
      if (!/^\d{2}$/.test(desde) || !/^\d{2}$/.test(hasta)) { errores.push({ campo: `rango-${x}`, mensaje: `${textoPublico(x)}: escribe «desde» y «hasta» (dos cifras) o deja los dos vacíos.` }); continue; }
      rangos[x] = { desde: Number(desde), hasta: Number(hasta) };
    }
    const entrada = {
      id: e.id || uuid(), nombre: v.nombre,
      revision: (perfiles.find((p) => p.id === e.id)?.revision ?? -1) + 1,
      marcas: leerEquivalencias(v.marcas, "marcas", errores).map(([alias, marca]) => ({ alias, marca })),
      publico: leerEquivalencias(v.publico, "publico", errores).map(([expresion, publico]) => ({ expresion, publico })),
      numeracion: leerEquivalencias(v.numeracion, "numeracion", errores).map(([expresion, publico]) => ({ expresion, publico })),
      rangos, categoria: v.categoria, promociones: String(v.promociones || "").split(/\r?\n/).map((t) => t.trim()).filter(Boolean)
    };
    const r = texto().normalizarPerfil(entrada);
    errores.push(...r.errores.filter((x) => !(x.campo.startsWith("rango-") && errores.some((y) => y.campo === x.campo))));
    if (r.perfil && perfiles.some((p) => p.id !== r.perfil.id && texto().clave(p.nombre) === texto().clave(r.perfil.nombre))) {
      errores.push({ campo: "nombre", mensaje: "Ya hay un perfil con ese nombre." });
    }
    if (errores.length || !r.perfil) {
      e.errores = errores;
      repintarEntrada();
      const primero = errores[0]?.campo || "nombre";
      const id = primero.startsWith("rango-") ? `imp-perfil-${primero.slice(6)}-desde` : `imp-perfil-${primero}`;
      document.getElementById(id)?.focus();
      mensaje("Revisa el perfil: hay reglas por corregir. No se guardó.", "aviso");
      return;
    }
    try {
      await almacen().guardarPerfil(ambitoActual, r.perfil);
    } catch (error) {
      mensaje(error instanceof almacen().ErrorCuota ? "No hay espacio en este navegador para guardar el perfil. Libera espacio eliminando borradores que no necesites." : "No se pudo guardar el perfil en este navegador.", "aviso");
      return;
    }
    const nuevo = !e.id;
    perfiles = ordenarPerfiles([...perfiles.filter((p) => p.id !== r.perfil.id), r.perfil]);
    almacen().avisar({ tipo: "perfiles", ambito: ambitoActual, de: pestana });
    editorPerfil = null;
    // Lo nuevo se usa en las publicaciones nuevas del lote si es su perfil (o si se acaba de crear).
    if (nuevo || perfilLote().id === r.perfil.id) { lote.perfilLote = guardarInstantanea(lote, r.perfil); adoptarPerfilEnVacias(); }
    avisoPerfil = `Perfil «${r.perfil.nombre}» guardado en este navegador${nuevo ? " y elegido para este lote" : ""}. Se aplica a las publicaciones nuevas; las fichas ya creadas no cambian.`;
    repintarEntrada();
    repintarPropuestas();
    if (lote.pegado?.fase === "revision") repintarPegado();
    mensaje(avisoPerfil, "ok");
    $("#imp-perfiles-resumen")?.focus({ preventScroll: true });
  }

  async function eliminarPerfil(id) {
    const p = perfiles.find((x) => x.id === id);
    if (!p) return;
    try { await almacen().eliminarPerfil(ambitoActual, id); } catch { mensaje("No se pudo eliminar el perfil.", "aviso"); return; }
    perfiles = perfiles.filter((x) => x.id !== id);
    almacen().avisar({ tipo: "perfiles", ambito: ambitoActual, de: pestana });
    confirmarBorrar = null;
    avisoPerfil = `Perfil «${p.nombre}» eliminado de este navegador.${perfilLote().id === id ? " Este lote conserva sus reglas para las publicaciones nuevas; elige otro perfil si prefieres." : ""}`;
    repintarEntrada();
    repintarPropuestas();
    mensaje(avisoPerfil, "ok");
    $("#imp-perfiles-resumen")?.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ «Recordar para este proveedor»
  /* Correcciones a mano que pueden convertirse en una regla del perfil. Solo se proponen; se guardan si
     la persona lo confirma. Nunca se corrige la ortografía de un modelo ni se recuerda cada edición. */
  function propuestasDe(f, c) {
    const p = perfilDe(f);
    // Se recuerda en el perfil de la ficha; si se leyó con el general, en el perfil que ya usa el lote.
    const vivo = perfilVivo(p) || (esGeneral(p) ? perfilVivo(perfilLote()) : null);
    const lista = [];
    if (!c?.texto.trim() || !c.leido) return { lista, vivo, p };
    const T = texto();
    // Alias: el lector no reconoció la marca y se escribió a mano. Se propone la primera palabra leída como modelo.
    if (f.editados.has("marca") && f.marca.trim() && !c.leido.marca && c.leido.modelo) {
      const candidato = ((/^[\p{L}\p{N}][\p{L}\p{N}&'.-]*/u.exec(c.leido.modelo.trim()) || [""])[0]).replace(/[.'-]+$/u, "");
      const marca = mayus(f.marca.trim());
      if (candidato.length >= 2 && /\p{L}/u.test(candidato) && T.clave(candidato) !== T.clave(marca) && T.contieneExpresion(c.texto, candidato)
        && !(vivo?.marcas || []).some((m) => T.clave(m.alias) === T.clave(candidato))) {
        lista.push({ tipo: "alias", clave: `alias|${T.clave(candidato)}|${T.clave(marca)}`, regla: `«${candidato}» = ${marca}`, explicacion: "Alias de marca: cuando un mensaje lo diga, la marca será esa.", datos: { alias: candidato, marca } });
      }
    }
    // Categoría escrita a mano distinta de la habitual del perfil.
    if (f.editados.has("categoria") && f.categoria.trim()) {
      const categoria = mayus(f.categoria.trim());
      if (categoria.length <= T.LIMITES_PERFIL.categoria && categoria !== (vivo?.categoria || "")) {
        lista.push({ tipo: "categoria", clave: `categoria|${categoria}`, regla: `Categoría habitual: ${categoria}`, explicacion: "Se propondrá en las fichas nuevas si nadie escribe otra.", datos: { categoria } });
      }
    }
    // Rango: tallas corregidas a mano en un color que pedía la regla («todas las tallas», «numeración …»).
    if (f.publico) {
      for (const cc of f.colores) {
        if (!cc.todas || !cc.editados.has("tallas")) continue;
        const t = T.leerCampoTallas(cc.tallasTexto);
        const n = t.tallas.map(Number);
        if (t.error || n.length < 2 || !n.every((x, i) => Number.isInteger(x) && (i === 0 || x === n[i - 1] + 1)) || n[n.length - 1] - n[0] > T.LIMITES_PERFIL.rangoMax) continue;
        const actual = T.rangoPara(f.publico, vivo || p);
        if (actual && actual.desde === n[0] && actual.hasta === n[n.length - 1]) continue;
        lista.push({ tipo: "rango", clave: `rango|${f.publico}|${n[0]}-${n[n.length - 1]}`, regla: `${textoPublico(f.publico)}: tallas ${n[0]} a ${n[n.length - 1]}`,
          explicacion: `Tallas para «todas las tallas» y «numeración» de ${textoPublico(f.publico)}.`, datos: { publico: f.publico, desde: n[0], hasta: n[n.length - 1] } });
        break;
      }
    }
    // Público elegido a mano cuando el mensaje no lo decía con palabras conocidas: se pide la expresión.
    if (f.editados.has("publico") && f.publico && !c.leido.publico) {
      lista.push({ tipo: "publico", clave: `publico|${f.publico}`, regla: "", explicacion: "", datos: { publico: f.publico } });
    }
    return { lista: lista.filter((x) => !f.descartadas.has(x.clave)), vivo, p };
  }

  function pintarPropuestas(f, c) {
    const { lista, vivo, p } = propuestasDe(f, c);
    if (!lista.length) return null;
    const caja = nodo("div", "importador-recordar");
    caja.id = `imp-${f.clave}-recordar`;
    caja.setAttribute("role", "group");
    caja.setAttribute("aria-labelledby", `imp-${f.clave}-recordar-titulo`);
    const h = nodo("h6", "importador-recordar-titulo", "Recordar para este proveedor");
    h.id = `imp-${f.clave}-recordar-titulo`;
    caja.append(h);
    if (!vivo) {
      caja.append(nodo("p", "campo-ayuda", esGeneral(p)
        ? "Para guardar estas correcciones como reglas, elige o crea arriba el perfil de este proveedor (el Perfil general no se modifica)."
        : `El perfil «${p.nombre}» ya no existe: estas correcciones no se pueden recordar.`));
      return caja;
    }
    caja.append(nodo("p", "campo-ayuda", `Solo se guarda si lo confirmas. Se añadirá al perfil «${vivo.nombre}» y servirá para las publicaciones nuevas; esta ficha no cambia.`));
    const ul = nodo("ul", "importador-recordar-lista");
    for (const x of lista) {
      const li = nodo("li", "importador-recordar-item");
      if (x.tipo === "publico") {
        const entrada = campo({ id: `imp-${f.clave}-recordar-publico`, etiqueta: `Palabras del mensaje que indican ${textoPublico(x.datos.publico)}`, valor: f.recordarPublico || "",
          max: texto().LIMITES_PERFIL.expresion, datos: { recordarPublico: f.clave }, ayuda: "Cópialas tal como aparecen en el mensaje (palabras completas)." });
        const previa = nodo("p", "importador-recordar-regla", textoPrevioPublico(f, x.datos.publico));
        previa.id = `imp-${f.clave}-recordar-previa`;
        previa.setAttribute("aria-live", "polite");
        li.append(entrada, previa);
      } else {
        li.append(nodo("p", "importador-recordar-regla", `Se guardará: ${x.regla}`), nodo("p", "campo-ayuda", x.explicacion));
      }
      const fila = nodo("div", "editor-botones");
      const si = boton("Recordar", "recordar", "boton boton-secundario boton-mini", { ficha: f.clave, propuesta: x.clave });
      si.setAttribute("aria-label", x.tipo === "publico" ? `Recordar la expresión de público para ${vivo.nombre}` : `Recordar ${x.regla} para ${vivo.nombre}`);
      const no = boton("No recordar", "recordar-no", "boton boton-texto boton-mini", { ficha: f.clave, propuesta: x.clave });
      no.setAttribute("aria-label", x.tipo === "publico" ? "No recordar la expresión de público" : `No recordar ${x.regla}`);
      fila.append(si, no);
      li.append(fila);
      ul.append(li);
    }
    caja.append(ul);
    return caja;
  }
  const textoPrevioPublico = (f, publico) => {
    const t = String(f.recordarPublico || "").trim();
    return t ? `Se guardará: «${t}» = ${textoPublico(publico)}` : "Escribe las palabras para ver la regla que se guardará.";
  };

  async function recordar(f, claveProp) {
    const c = f.colores[0];
    const { lista, vivo } = propuestasDe(f, c);
    const x = lista.find((y) => y.clave === claveProp);
    if (!x || !vivo || !almacenOk) return;
    const base = JSON.parse(JSON.stringify(vivo));
    let descripcion = x.regla;
    if (x.tipo === "alias") base.marcas.push({ alias: x.datos.alias, marca: x.datos.marca });
    if (x.tipo === "categoria") base.categoria = x.datos.categoria;
    if (x.tipo === "rango") base.rangos[x.datos.publico] = { desde: x.datos.desde, hasta: x.datos.hasta };
    if (x.tipo === "publico") {
      const expresion = String(f.recordarPublico || "").trim();
      const T = texto();
      const problema = !expresion || !/\p{L}/u.test(expresion) ? "Escribe las palabras del mensaje que indican el público."
        : !T.contieneExpresion(c.texto, expresion) ? `«${expresion}» no aparece como palabras completas en el mensaje.`
          : base.publico.some((y) => T.clave(y.expresion) === T.clave(expresion)) ? `«${expresion}» ya es una regla de este perfil.` : "";
      if (problema) { mensaje(problema, "aviso"); document.getElementById(`imp-${f.clave}-recordar-publico`)?.focus(); return; }
      base.publico.push({ expresion, publico: x.datos.publico });
      descripcion = `«${expresion}» = ${textoPublico(x.datos.publico)}`;
    }
    base.revision = vivo.revision + 1;
    const r = texto().normalizarPerfil(base);
    if (!r.perfil) { mensaje(`No se pudo recordar: ${r.errores.map((y) => y.mensaje).join(" ")}`, "aviso"); return; }
    try { await almacen().guardarPerfil(ambitoActual, r.perfil); } catch { mensaje("No se pudo guardar la regla en este navegador.", "aviso"); return; }
    perfiles = ordenarPerfiles([...perfiles.filter((y) => y.id !== r.perfil.id), r.perfil]);
    almacen().avisar({ tipo: "perfiles", ambito: ambitoActual, de: pestana });
    if (perfilLote().id === r.perfil.id) { lote.perfilLote = guardarInstantanea(lote, r.perfil); adoptarPerfilEnVacias(); }
    if (x.tipo === "publico") f.recordarPublico = "";
    repintarFicha(f);
    repintarEntrada();
    mensaje(`Guardado en el perfil «${r.perfil.nombre}»: ${descripcion}. Se usará en las publicaciones nuevas; las fichas ya creadas no cambian.`, "ok");
    document.getElementById(`imp-${f.clave}-recordar`)?.querySelector("button")?.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ pegar varias publicaciones
  let creandoPegado = false;
  let cachePegado = { texto: null, cortes: "", perfil: "", lista: [] };
  function fragmentosPegado() {
    const p = lote.pegado;
    const cortes = JSON.stringify(p.cortes);
    if (cachePegado.texto !== p.texto || cachePegado.cortes !== cortes || cachePegado.perfil !== lote.perfilLote) {
      cachePegado = { texto: p.texto, cortes, perfil: lote.perfilLote, lista: separador().bloques(p.texto, p.cortes, { marcas: marcasConocidas(), perfil: perfilLote() }) };
    }
    return cachePegado.lista;
  }
  const incluido = (b) => (lote.pegado.incluir[b.inicio] ?? separador().incluidoPorOmision(b));
  const corteEn = (inicio) => lote.pegado.cortes.find((c) => c.linea === inicio);
  function fichaVacia(f) {
    const c = f.colores[0];
    return editable(f) && f.colores.length === 1 && !f.marca.trim() && !f.modelo.trim() && !f.categoria.trim() && !f.publico && !f.editados.size
      && !c.texto.trim() && !c.fotos.length && !c.color.trim() && !String(c.proveedor).trim() && !String(c.venta).trim() && !c.tallasTexto.trim() && !c.editados.size;
  }
  const recorte = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

  function pintarPegado() {
    const p = lote.pegado;
    const S = separador();
    const s = nodo("section", "editor-seccion importador-pegado");
    s.id = "imp-pegado";
    s.setAttribute("aria-labelledby", "imp-pegado-titulo");
    const h = nodo("h3", "editor-seccion-titulo", "Pegar varias publicaciones");
    h.id = "imp-pegado-titulo";
    h.tabIndex = -1;
    s.append(h);
    if (p.fase !== "revision") {
      const caja = nodo("div", "campo importador-mensaje");
      const etiqueta = nodo("label", "importador-mensaje-etiqueta", "Pega aquí los mensajes de WhatsApp");
      etiqueta.htmlFor = "imp-pegado-texto";
      const area = nodo("textarea");
      area.id = "imp-pegado-texto";
      area.value = p.texto;
      area.rows = 10;
      area.maxLength = S.MAX_TEXTO;
      area.autocomplete = "off";
      area.spellcheck = false;
      area.dataset.pegado = "texto";
      area.placeholder = "Copia varios mensajes del chat a la vez, con o sin la fecha y el nombre de cada mensaje.";
      const ayuda = nodo("p", "campo-ayuda", "Se separan por el encabezado de cada mensaje (fecha y nombre), por líneas separadoras (-----) o cuando empieza otra marca después de un precio. Una línea en blanco sola no separa. Antes de crear nada revisas la división; nada se guarda en Supabase.");
      ayuda.id = "imp-pegado-texto-ayuda";
      area.setAttribute("aria-describedby", ayuda.id);
      caja.append(etiqueta, area, ayuda);
      if (p.error) {
        const error = nodo("p", "campo-error", p.error);
        error.id = "imp-pegado-error";
        error.setAttribute("role", "alert");
        area.setAttribute("aria-invalid", "true");
        area.setAttribute("aria-describedby", `${error.id} ${ayuda.id}`);
        caja.append(error);
      }
      const acciones = nodo("div", "importador-pegado-acciones");
      const revisar = boton("Revisar la separación", "pegado-revisar", "boton boton-principal");
      revisar.id = "imp-pegado-revisar";
      acciones.append(revisar, boton("Cancelar", "pegado-cancelar", "boton boton-secundario"));
      s.append(caja, acciones);
      return s;
    }
    const lista = fragmentosPegado();
    const crear = lista.filter(incluido);
    const dudosas = p.cortes.filter((c) => c.dudosa).length;
    // Etapa 20: publicaciones (fragmentos), fichas (una por publicación marcada) y colores (los de cada una).
    const totalColores = crear.reduce((n, b) => n + coloresDe(b).crear, 0);
    const porRevisar = crear.filter((b) => !coloresDe(b).valido).length;
    const resumen = nodo("p", "importador-pegado-resumen",
      `${lista.length} ${lista.length === 1 ? "publicación detectada" : "publicaciones detectadas"} · se ${crear.length === 1 ? "creará 1 ficha" : `crearán ${crear.length} fichas`} con ${totalColores === 1 ? "1 color" : `${totalColores} colores`}${dudosas ? ` · ${dudosas === 1 ? "1 división dudosa" : `${dudosas} divisiones dudosas`} por revisar` : ""}${porRevisar ? ` · ${porRevisar === 1 ? "1 cantidad de colores" : `${porRevisar} cantidades de colores`} por revisar` : ""}.`);
    resumen.id = "imp-pegado-resumen";
    resumen.setAttribute("role", "status");
    s.append(resumen, nodo("p", "campo-ayuda", "Revisa cada una. «Unir con la anterior» junta dos fragmentos y «Separar» divide uno. El texto de cada publicación se conserva tal cual para revisarlo después."));
    const ol = nodo("ol", "importador-pegado-lista");
    ol.setAttribute("aria-label", "Publicaciones detectadas");
    lista.forEach((b, i) => ol.append(pintarFragmento(b, i, lista.length)));
    s.append(ol);
    const acciones = nodo("div", "importador-pegado-acciones");
    const boton1 = boton(crear.length === 1 ? "Crear 1 publicación" : `Crear ${crear.length} publicaciones`, "pegado-crear", "boton boton-principal");
    boton1.id = "imp-pegado-crear";
    boton1.setAttribute("aria-describedby", resumen.id);
    if (!crear.length) boton1.setAttribute("aria-disabled", "true");
    acciones.append(boton1, boton("Volver a editar el texto", "pegado-editar", "boton boton-secundario"), boton("Cancelar", "pegado-cancelar", "boton boton-texto"));
    s.append(acciones);
    return s;
  }

  function pintarFragmento(b, i, total) {
    const corte = corteEn(b.inicio);
    const li = nodo("li", `importador-fragmento${corte?.dudosa ? " es-dudosa" : ""}${incluido(b) ? "" : " es-excluido"}`);
    li.dataset.inicio = String(b.inicio);
    const cabecera = nodo("div", "importador-fragmento-cabecera");
    const h = nodo("h4", "importador-fragmento-titulo", `Publicación ${i + 1}`);
    h.id = `imp-frag-${b.inicio}-titulo`;
    h.tabIndex = -1;
    li.setAttribute("aria-labelledby", h.id);
    cabecera.append(h);
    const caja = nodo("label", "casilla");
    const check = nodo("input");
    check.type = "checkbox";
    check.id = `imp-frag-${b.inicio}-incluir`;
    check.checked = incluido(b);
    check.dataset.pegadoIncluir = String(b.inicio);
    if (b.vacio) { check.disabled = true; check.dataset.bloqueado = "1"; }
    caja.append(check, nodo("span", "", "Crear esta publicación"));
    cabecera.append(caja);
    li.append(cabecera);
    if (b.encabezado) li.append(nodo("p", "importador-encabezado", `Mensaje de WhatsApp: ${b.encabezado}`));
    if (corte?.dudosa) {
      const duda = nodo("p", "importador-fragmento-duda", `División dudosa: ${corte.motivo}`);
      duda.id = `imp-frag-${b.inicio}-duda`;
      li.append(duda);
    }
    const d = b.datos;
    const partes = [d.marca && mayus(d.marca), d.modelo && mayus(d.modelo),
      d.precios.length > 1 ? `${d.precios.map(formatoPesos).join(" o ")} (elegir)` : d.precio ? formatoPesos(d.precio) : "",
      d.tallas.length ? `tallas ${d.tallas.length > 2 ? `${d.tallas[0]} a ${d.tallas[d.tallas.length - 1]}` : d.tallas.join(" y ")}` : "",
      textoPublico(d.publico)].filter(Boolean);
    li.append(nodo("p", "importador-fragmento-datos", b.vacio ? "Sin texto: solo fotos o un aviso de WhatsApp. No se crea." : partes.length ? `Se lee: ${partes.join(" · ")}` : "No se reconoce marca, precio ni tallas: por omisión no se crea."));
    if (!b.vacio) li.append(pintarColoresFragmento(b));
    if (!b.vacio) li.append(nodo("p", "importador-fragmento-texto", b.texto));
    const acciones = nodo("div", "importador-fragmento-acciones");
    if (i > 0) {
      const unir = boton("Unir con la anterior", "pegado-unir", "boton boton-secundario boton-mini", { inicio: String(b.inicio) });
      unir.setAttribute("aria-label", `Unir la publicación ${i + 1} con la ${i}`);
      acciones.append(unir);
    }
    if (corte?.dudosa) {
      const ok = boton("La división está bien", "pegado-ok", "boton boton-texto boton-mini", { inicio: String(b.inicio) });
      ok.setAttribute("aria-label", `La división antes de la publicación ${i + 1} está bien`);
      acciones.append(ok);
    }
    const lineas = b.lineasTexto.filter((x, n) => n > 0 && x.util);
    if (lineas.length) {
      const separar = nodo("details", "importador-fragmento-separar");
      const resumen = nodo("summary", "", "Separar…");
      resumen.setAttribute("aria-label", `Separar la publicación ${i + 1} en dos`);
      separar.append(resumen, nodo("p", "campo-ayuda", "Elige la línea con la que empieza la siguiente publicación:"));
      const fila = nodo("div", "importador-fragmento-lineas");
      for (const x of lineas) {
        const b2 = boton(`Separar antes de «${recorte(texto().limpiarLinea(x.texto) || x.texto.trim(), 48)}»`, "pegado-separar", "boton boton-texto boton-mini", { linea: String(x.linea) });
        fila.append(b2);
      }
      separar.append(fila);
      acciones.append(separar);
    }
    if (acciones.childElementCount) li.append(acciones);
    if (total > 1 && i === total - 1) li.classList.add("es-ultimo");
    return li;
  }
  function repintarPegado() {
    const actual = $("#imp-pegado");
    if (!actual || !lote?.pegado) return;
    const activo = document.activeElement;
    const id = activo?.id;
    const seleccion = id && typeof activo.selectionStart === "number" ? [activo.selectionStart, activo.selectionEnd] : null;
    actual.replaceWith(pintarPegado());
    const n = id && document.getElementById(id);
    if (n) {
      n.focus({ preventScroll: true });
      if (seleccion && typeof n.setSelectionRange === "function") { try { n.setSelectionRange(...seleccion); } catch { /* sin selección */ } }
    }
    programarGuardado();
  }
  /* Etapa 20: colores que se prepararán para un fragmento. La cantidad del mensaje («(2 colores)») o la
     corregida en la revisión; sin cantidad, 1. Una cantidad no válida se señala y se crea con 1 color. */
  function coloresDe(b) {
    const lim = comun().LIM.colores;
    const propia = lote.pegado.colores?.[b.inicio];
    // Sin corregir: la cantidad del mensaje; si no es válida, su valor tal cual (queda «Revisar»); sin cantidad, 1.
    const texto = propia !== undefined ? String(propia) : (b.datos.colores ? String(b.datos.colores) : (b.datos.notaColores ? b.datos.coloresTexto || "" : "1"));
    const n = /^\d{1,3}$/.test(texto.trim()) ? Number(texto.trim()) : NaN;
    const valido = Number.isInteger(n) && n >= 1 && n <= lim;
    return { texto, n, valido, crear: valido ? n : 1, manual: propia !== undefined };
  }
  function pintarColoresFragmento(b) {
    const lim = comun().LIM.colores;
    const k = coloresDe(b);
    const caja = campo({ id: `imp-frag-${b.inicio}-colores`, etiqueta: "Colores a preparar", valor: k.texto, modo: "numeric", max: 3,
      revisar: !k.valido, datos: { pegadoColores: String(b.inicio) } });
    caja.classList.add("importador-fragmento-colores");
    const entrada = $("input", caja);
    let nota = "";
    if (!k.valido) nota = `${b.datos.notaColores && !k.manual ? `${b.datos.notaColores} ` : ""}Escribe un número entre 1 y ${lim}; si no, se creará con 1 color.`;
    else nota = k.n === 1 ? "Una ficha con 1 color." : `Una ficha con ${k.n} colores (Color 1 a Color ${k.n}).`;
    const p = nodo("p", k.valido ? "campo-ayuda" : "campo-error", nota);
    p.id = `imp-frag-${b.inicio}-colores-nota`;
    entrada.setAttribute("aria-describedby", p.id);
    if (!k.valido) entrada.setAttribute("aria-invalid", "true");
    caja.append(p);
    return caja;
  }

  function abrirPegado() {
    if (!lote.pegado) lote.pegado = { fase: "texto", texto: "", cortes: [], incluir: {}, colores: {}, error: "" };
    pintar();
    const destino = lote.pegado.fase === "revision" ? $("#imp-pegado-titulo") : $("#imp-pegado-texto");
    $("#imp-pegado")?.scrollIntoView({ block: "start" });
    destino?.focus({ preventScroll: true });
  }
  function revisarPegado() {
    const p = lote.pegado;
    const S = separador();
    p.error = "";
    if (!p.texto.trim()) p.error = "Pega primero los mensajes.";
    else if (p.texto.length > S.MAX_TEXTO) p.error = `El texto es demasiado largo (máximo ${S.MAX_TEXTO.toLocaleString("es-CO")} caracteres). Pégalo en varias veces.`;
    if (!p.error) {
      const det = S.detectar(p.texto, { marcas: marcasConocidas(), perfil: perfilLote() });
      const n = S.bloques(p.texto, det.cortes).length;
      if (n > S.MAX_BLOQUES) p.error = `Se detectaron ${n} publicaciones; como mucho ${S.MAX_BLOQUES} de una vez. Pégalas en varias veces.`;
      else { p.cortes = det.cortes; p.incluir = {}; p.colores = {}; p.fase = "revision"; }
    }
    pintar();
    if (p.error) { $("#imp-pegado-texto")?.focus(); return; }
    $("#imp-pegado")?.scrollIntoView({ block: "start" });
    $("#imp-pegado-titulo")?.focus({ preventScroll: true });
  }
  function cambiarCortes(nuevos, foco) {
    lote.pegado.cortes = nuevos;
    repintarPegado();
    document.getElementById(foco)?.focus({ preventScroll: true });
  }

  /* «Crear N publicaciones»: añade al FINAL del lote una ficha por publicación marcada (la ficha inicial
     se aprovecha si está completamente vacía). Cada una se lee con el perfil del lote y conserva su texto
     original. No agrupa nada sola ni escribe en Supabase. El pegado se cierra en la misma operación:
     pulsar dos veces no crea nada más. */
  function crearPublicaciones() {
    if (creandoPegado || guardando) return;
    const p = lote.pegado;
    if (!p || p.fase !== "revision") return;
    const lista = fragmentosPegado().filter(incluido);
    if (!lista.length) { mensaje("Marca al menos una publicación para crear.", "aviso"); return; }
    creandoPegado = true;
    try {
      const vacia = lote.fichas.length === 1 && fichaVacia(lote.fichas[0]) ? lote.fichas[0] : null;
      const creadas = [];
      lista.forEach((b, i) => {
        let f = i === 0 ? vacia : null;
        if (f) f.perfil = lote.perfilLote;
        else { f = fichaNueva(lote.perfilLote); lote.fichas.push(f); }
        const c = f.colores[0];
        c.texto = b.texto.slice(0, 4000);
        c.original = b.original.slice(0, 12000);
        c.encabezado = b.encabezado.slice(0, 200);
        aplicarTexto(f, c);
        // Etapa 20: los colores de esta publicación (la cantidad revisada manda sobre la del mensaje).
        const k = coloresDe(b);
        if (k.manual) {
          f.coloresPedidos = k.texto.trim();
          f.editados.add("colores");
          if (k.valido) f.revisar.delete("colores"); else f.revisar.add("colores");
        }
        if (k.valido && k.n > 1) prepararColores(f, k.n);
        creadas.push(f);
      });
      lote.pegado = null;
      const nuevas = creadas.filter((f) => f !== vacia);
      if (lote.destinos && nuevas.length) lote.avisoDestinos = `${nuevas.length === 1 ? "La ficha" : "Las fichas"} ${listaNumeros(nuevas)} ${nuevas.length === 1 ? "es nueva y no está elegida" : "son nuevas y no están elegidas"} para los ajustes: márcalas si quieres ajustarlas.`;
      pintar();
      const primera = creadas[0];
      document.getElementById(`imp-${primera.clave}`)?.scrollIntoView({ block: "start" });
      document.getElementById(`imp-${primera.clave}-titulo`)?.focus({ preventScroll: true });
      const colores = creadas.reduce((n, f) => n + f.colores.length, 0);
      mensaje(`Se ${creadas.length === 1 ? "creó 1 publicación" : `crearon ${creadas.length} publicaciones`} (${creadas.length === 1 ? `ficha ${numero(primera)}` : `fichas ${numero(primera)} a ${numero(creadas[creadas.length - 1])}`}), con ${colores === 1 ? "1 color" : `${colores} colores`} en total. Revisa lo marcado «Revisar» y agrupa los colores de un mismo modelo. Nada se guardó en Supabase.`, "ok");
      guardarBorrador({ inmediato: true });
    } finally {
      creandoPegado = false;
    }
  }

  // ------------------------------------------------------------------ guardado local (IndexedDB)
  let almacenOk = false;
  const metas = new WeakMap(); // por lote: { persistidas: Map(ref → clase), revision, existe, sucio, descartado }
  const meta = (l) => { if (!metas.has(l)) metas.set(l, { persistidas: new Map(), revision: null, existe: false, sucio: false, descartado: false }); return metas.get(l); };
  let temporizadorGuardado = 0;
  let primerCambio = 0;
  let cadena = Promise.resolve();
  const ESPERA_GUARDADO = 800;    // tras el último cambio
  const ESPERA_MAXIMA = 4000;     // aunque se siga escribiendo
  const TRANSITORIOS = new Set(["blob", "archivo", "vistaPrevia", "quitada", "enCurso", "cortar"]);
  const horaCorta = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit" });
  const fechaLarga = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const formatoFecha = (iso, formato = fechaLarga) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : formato.format(d); };

  function estadoLocal(estado, detalle = "", tipo = "", cuando = null) {
    persistencia.estado = estado;
    persistencia.mensaje = detalle;
    persistencia.tipo = tipo;
    if (estado === "guardado") persistencia.cuando = cuando || new Date().toISOString();
    pintarLocal();
  }
  // Estado del guardado local, en la cabecera del importador.
  function pintarLocal() {
    const caja = $("#importador-local");
    if (!caja) return;
    caja.replaceChildren();
    const e = persistencia;
    let textoEstado = "";
    if (!almacenOk && e.estado !== "desconectado") textoEstado = lote ? "Sin guardado local: este navegador no permite guardar borradores. El lote se conserva mientras no recargues la página." : "";
    else if (e.estado === "pendiente" || e.estado === "guardando") textoEstado = "Guardando…";
    else if (e.estado === "guardado") textoEstado = `Guardado en este navegador${e.cuando ? ` · ${formatoFecha(e.cuando, horaCorta)}` : ""}`;
    else if (e.estado === "error") textoEstado = `No se pudo guardar en este navegador: ${e.mensaje}`;
    else if (e.estado === "desconectado") textoEstado = e.tipo === "eliminado" ? "Este borrador se eliminó en otra pestaña." : "Este borrador continúa en otra pestaña.";
    else if (lote && !vistaBorradores) textoEstado = "Borrador local: se guarda en este navegador en cuanto empieces.";
    if (textoEstado) {
      const p = nodo("p", `importador-local-estado es-${!almacenOk && e.estado !== "desconectado" ? "sin-almacen" : e.estado}`, textoEstado);
      p.id = "importador-local-estado";
      if (e.estado === "error" || e.estado === "desconectado") p.setAttribute("role", "alert");
      caja.append(p);
    }
    const acciones = nodo("div", "importador-local-acciones");
    if (e.estado === "error" && lote) acciones.append(boton("Exportar respaldo", "exportar-actual", "boton boton-texto boton-mini"));
    if (almacenOk && ambitoActual && !vistaBorradores) {
      const n = borradoresLista.filter((b) => b.id !== lote?.id).length;
      const ver = boton(n ? `Borradores (${n + (lote && meta(lote).existe ? 1 : 0)})` : "Borradores", "borradores-ver", "boton boton-texto boton-mini");
      ver.id = "importador-ver-borradores";
      acciones.append(ver);
    }
    if (acciones.childElementCount) caja.append(acciones);
  }

  const contarPublicaciones = (l) => l.fichas.reduce((n, f) => n + f.colores.filter((c) => c.texto.trim() || c.fotos.length).length, 0);
  /* Etapa 20: cualquier trabajo cuenta, aunque todavía no haya mensaje ni modelo: un dato escrito o
     elegido a mano en la ficha (marca, categoría, público, guía, cantidad de colores…) o en un color
     (nombre, precios, tallas, tono, forma, fotos), o un color preparado. */
  const colorConContenido = (c) => Boolean(c.texto.trim() || c.fotos.length || c.color.trim() || String(c.proveedor).trim() || String(c.venta).trim()
    || c.tallasTexto.trim() || String(c.muestra).trim() || c.forma !== "circulo" || c.editados.size || c.preparado);
  const conContenido = (f) => Boolean(f.modelo.trim() || f.marca.trim() || f.categoria.trim() || f.segmento || f.editados.size
    || String(f.coloresPedidos ?? "").trim() || f.colores.length > 1 || f.colores.some(colorConContenido));
  // Ajustes del lote elegidos (aunque aún no haya fichas con datos): también son trabajo que recuperar.
  const ajustesDe = (l) => Boolean(String(l.margen).trim() || String(l.categoria).trim() || l.segmento !== CONSERVAR || l.publico !== CONSERVAR
    || l.destinos !== null || l.perfilLote !== CLAVE_GENERAL);
  // Los ajustes solo son trabajo pendiente mientras quede alguna ficha sin guardar a la que aplicarlos: en un
  // lote con todas sus fichas ya en Supabase, los ajustes ya se aplicaron y se guardaron.
  const ajustesPendientes = (l) => ajustesDe(l) && l.fichas.some((f) => f.estado !== "guardada");
  // Trabajo que aún no está confirmado en Supabase: fichas no guardadas con algo (también las que se estaban
  // guardando o quedaron sin confirmar), imágenes del reparto, un pegado o ajustes del lote.
  function pendientesDe(l) {
    return l.fichas.filter((f) => f.estado !== "guardada" && conContenido(f)).length + (l.reparto?.items.length || 0) + (l.pegado?.texto.trim() ? 1 : 0)
      + (ajustesPendientes(l) ? 1 : 0);
  }
  const hayContenido = (l) => pendientesDe(l) > 0 || l.fichas.some((f) => f.estado !== "borrador");

  function serializar(l) {
    return JSON.stringify({ version: 1, lote: l }, (k, v) => {
      if (TRANSITORIOS.has(k)) return undefined;
      if (v instanceof Set) return { $set: [...v] };
      if (typeof Blob !== "undefined" && v instanceof Blob) return undefined;
      return v;
    });
  }
  const revivir = (k, v) => (v && typeof v === "object" && !Array.isArray(v) && Array.isArray(v.$set) && Object.keys(v).length === 1 ? new Set(v.$set) : v);

  // Fotos del lote que deben estar en el borrador: { ref, clase («original» mientras se optimiza, «final» después), blob }.
  function fotosDelLote(l, { todas = false } = {}) {
    const lista = [];
    const considerar = (x) => {
      if (!x?.ref) return;
      if (x.estado === "procesando" && x.archivo) lista.push({ ref: x.ref, clase: "original", blob: x.archivo, nombre: x.nombre || "" });
      else if (x.blob && ["lista", "subida", "subiendo"].includes(x.estado)) lista.push({ ref: x.ref, clase: "final", blob: x.blob, nombre: x.archivoLote || x.nombre || "" });
    };
    for (const f of l.fichas) {
      // Las fichas ya guardadas en Supabase no necesitan sus fotos en el borrador (ocupan espacio).
      if (f.estado === "guardada" && !todas) continue;
      for (const c of f.colores) for (const x of c.fotos) considerar(x);
    }
    for (const it of l.reparto?.items || []) considerar(it);
    return lista;
  }
  function registroDe(l) {
    return {
      id: l.id, creado: l.creado, proveedor: nombrePerfil(instantanea(l.perfilLote, l)), publicaciones: contarPublicaciones(l),
      fichas: l.fichas.length, guardadas: l.fichas.filter((f) => f.estado === "guardada").length, pendientes: pendientesDe(l),
      // Etapa 20: qué está pendiente, para la lista de borradores.
      detalle: { fichas: l.fichas.filter((f) => f.estado !== "guardada" && conContenido(f)).length, imagenes: l.reparto?.items.length || 0, pegado: Boolean(l.pegado?.texto.trim()), ajustes: ajustesPendientes(l) },
      datos: serializar(l)
    };
  }

  function programarGuardado() {
    if (!lote || !almacenOk || !lote.ambito || persistencia.estado === "desconectado") return;
    meta(lote).sucio = true;
    // Hay cambios por guardar: el estado lo dice (un solo repintado por ráfaga, no en cada tecla).
    if (["inactivo", "guardado"].includes(persistencia.estado) && hayContenido(lote)) estadoLocal("pendiente");
    const ahora = Date.now();
    if (!primerCambio) primerCambio = ahora;
    clearTimeout(temporizadorGuardado);
    temporizadorGuardado = setTimeout(() => { guardarBorrador(); }, Math.max(0, Math.min(ESPERA_GUARDADO, ESPERA_MAXIMA - (ahora - primerCambio))));
  }
  /* Guarda el lote (o «objetivo», p. ej. el que se suelta al cerrar sesión). Los guardados van en cola,
     uno detrás de otro: nunca dos a la vez sobre el mismo borrador. Devuelve una promesa que no falla y
     resuelve true solo si el borrador quedó al día en este navegador (o no había nada que guardar). */
  function guardarBorrador({ objetivo = lote } = {}) {
    if (!objetivo || !almacenOk || !objetivo.ambito) return Promise.resolve(false);
    if (objetivo === lote) { clearTimeout(temporizadorGuardado); primerCambio = 0; }
    const resultado = cadena.then(() => escribir(objetivo)).catch(() => false);
    cadena = resultado;
    return resultado;
  }
  async function escribir(l) {
    const m = meta(l);
    if (m.descartado || (l === lote && persistencia.estado === "desconectado")) return false;
    if (!hayContenido(l) && !m.existe) { m.sucio = false; return true; } // un lote vacío no crea borrador (y no hay nada que perder)
    const fotosLote = fotosDelLote(l);
    const vigentes = new Set(fotosLote.map((x) => x.ref));
    const nuevas = fotosLote.filter((x) => m.persistidas.get(x.ref) !== x.clase);
    const registro = registroDe(l);
    if (l === lote) estadoLocal("guardando");
    m.sucio = false;
    try {
      const r = await almacen().guardarBorrador(l.ambito, registro, { pestana, revisionEsperada: m.existe ? m.revision : null, nuevas, vigentes });
      m.revision = r.revision;
      m.existe = true;
      for (const x of nuevas) m.persistidas.set(x.ref, x.clase);
      for (const ref of [...m.persistidas.keys()]) if (!vigentes.has(ref)) m.persistidas.delete(ref);
      if (registro.pendientes > 0) ultimoBorrador = { ambito: l.ambito, id: l.id };
      const i = borradoresLista.findIndex((b) => b.id === l.id);
      const resumen = { ...registro, datos: undefined, revision: r.revision, actualizado: new Date().toISOString(), propietario: pestana };
      if (i >= 0) borradoresLista[i] = resumen; else borradoresLista.unshift(resumen);
      if (l === lote && persistencia.estado !== "desconectado") estadoLocal(m.sucio ? "pendiente" : "guardado");
      return true;
    } catch (error) {
      m.sucio = true;
      if (l !== lote) return false;
      const A = almacen();
      if (error instanceof A.ErrorConflicto) desconectar(error.message === "eliminado" ? "eliminado" : "otra-pestana");
      else if (error instanceof A.ErrorCuota) estadoLocal("error", "falta espacio. Tu trabajo sigue abierto aquí: exporta un respaldo o elimina borradores que no necesites y se volverá a intentar.", "cuota");
      else estadoLocal("error", "el navegador rechazó la escritura. Tu trabajo sigue abierto aquí; exporta un respaldo por si acaso.", "otro");
      return false;
    }
  }
  /* Antes de soltar el lote abierto (empezar otro, continuar otro borrador): se guarda y, si no se puede,
     el lote se queda abierto y se explica. Devuelve true si se puede soltar sin perder nada. */
  async function asegurarGuardado() {
    if (!lote) return true;
    if (!almacenOk) {
      mensaje("Este navegador no permite guardar borradores: el lote abierto se perdería. Termina de guardarlo en Supabase o descártalo antes de cambiar de lote.", "aviso");
      return false;
    }
    if (persistencia.estado === "desconectado") return true; // lo tiene otra pestaña: aquí no hay nada propio
    const ok = await guardarBorrador();
    if (ok && !meta(lote).sucio) return true;
    vistaBorradores = false;
    pintar();
    mensaje("No se pudo guardar el lote abierto en este navegador, así que sigue abierto: no se cambió de lote para no perderlo. Exporta un respaldo o libera espacio eliminando borradores y vuelve a intentarlo.", "aviso");
    $("#importador-local-estado")?.focus?.();
    return false;
  }

  // ------------------------------------------------------------------ restaurar un borrador
  const RE_CLAVE = /^[fcpr]\d{1,9}$/;
  const ESTADOS_FICHA = new Set(["borrador", "guardando", "guardada", "fallida", "sin-confirmar"]);
  const ESTADOS_FOTO = new Set(["procesando", "lista", "subiendo", "subida", "error"]);
  // Comprueba la forma de un lote leído (de IndexedDB o de un respaldo). Lanza Error si no sirve.
  function validarLote(l) {
    const UUID = almacen().UUID;
    const exigir = (ok, que) => { if (!ok) throw new Error(que); };
    const cadenaHasta = (v, n) => typeof v === "string" && v.length <= n;
    exigir(l && typeof l === "object" && Array.isArray(l.fichas) && l.fichas.length >= 1 && l.fichas.length <= 400, "La lista de fichas no es válida.");
    exigir(l.destinos === null || l.destinos === undefined || l.destinos instanceof Set, "La selección de ajustes no es válida.");
    exigir(!l.instantaneas || typeof l.instantaneas === "object", "Los perfiles del borrador no son válidos.");
    for (const f of l.fichas) {
      exigir(f && RE_CLAVE.test(f.clave) && UUID.test(f.id) && ESTADOS_FICHA.has(f.estado), "Una ficha no es válida.");
      for (const k of ["marca", "modelo", "categoria", "segmento"]) exigir(cadenaHasta(f[k] ?? "", 200), `Una ficha tiene un ${k} no válido.`);
      exigir(["", "hombre", "dama", "unisex"].includes(f.publico ?? ""), "Una ficha tiene un público no válido.");
      for (const k of ["editados", "revisar", "operaciones", "distintaDe"]) exigir(f[k] instanceof Set, "Una ficha no es válida.");
      if (!(f.descartadas instanceof Set)) f.descartadas = new Set();
      // Etapa 20: cantidad de colores (texto). Los borradores anteriores no la tienen.
      if (f.coloresPedidos === undefined || f.coloresPedidos === null) f.coloresPedidos = "";
      exigir(cadenaHasta(String(f.coloresPedidos), 10), "Una ficha tiene una cantidad de colores no válida.");
      exigir(Array.isArray(f.colores) && f.colores.length >= 1 && f.colores.length <= 40, "Una ficha tiene una lista de colores no válida.");
      exigir(!f.pendiente || (UUID.test(f.pendiente.operacion) && typeof f.pendiente.huella === "string" && f.pendiente.datos), "Una operación de guardado no es válida.");
      exigir(f.ultimaOperacion === null || f.ultimaOperacion === undefined || UUID.test(f.ultimaOperacion), "Una operación de guardado no es válida.");
      if (!Array.isArray(f.errores)) f.errores = [];
      for (const c of f.colores) {
        exigir(c && RE_CLAVE.test(c.clave) && UUID.test(c.id) && cadenaHasta(c.texto ?? "", 4000) && cadenaHasta(c.original ?? "", 20000), "Un color no es válido.");
        for (const k of ["color", "proveedor", "venta", "tallasTexto", "muestra"]) exigir(cadenaHasta(String(c[k] ?? ""), 400), "Un color no es válido.");
        exigir(c.editados instanceof Set && c.revisar instanceof Set, "Un color no es válido.");
        exigir(Array.isArray(c.fotos) && c.fotos.length <= fotos().LIMITES.fotosPorColor, "Un color tiene demasiadas fotos.");
        if (!Array.isArray(c.notas)) c.notas = [];
        if (!Array.isArray(c.reglas)) c.reglas = [];
        if (!Array.isArray(c.precios)) c.precios = [];
        for (const x of c.fotos) exigir(x && RE_CLAVE.test(x.clave) && ESTADOS_FOTO.has(x.estado) && (!x.ref || UUID.test(x.ref)), "Una foto no es válida.");
      }
    }
    if (l.reparto) {
      exigir(Array.isArray(l.reparto.items) && l.reparto.items.length <= MAX_REPARTO, "El reparto de fotos no es válido.");
      for (const it of l.reparto.items) exigir(it && RE_CLAVE.test(it.clave) && ["procesando", "lista", "error"].includes(it.estado) && (!it.ref || UUID.test(it.ref)), "Una imagen del reparto no es válida.");
    }
    if (l.pegado) {
      exigir(typeof l.pegado.texto === "string" && l.pegado.texto.length <= separador().MAX_TEXTO && Array.isArray(l.pegado.cortes), "El pegado no es válido.");
      for (const c of l.pegado.cortes) exigir(c && Number.isInteger(c.linea) && c.linea >= 0, "El pegado no es válido.");
      if (!l.pegado.incluir || typeof l.pegado.incluir !== "object") l.pegado.incluir = {};
      if (!l.pegado.colores || typeof l.pegado.colores !== "object") l.pegado.colores = {};
    }
  }

  function restaurarFoto(x, fotosGuardadas, guardada) {
    const g = x.ref ? fotosGuardadas.get(x.ref) : null;
    // «Subiendo» al recargar: no se sabe si llegó. Vuelve a «lista» con su mismo nombre de archivo: al
    // guardar se sube con ese nombre y, si ya estaba, se comprueba y no se duplica.
    if (x.estado === "subiendo") x.estado = "lista";
    delete x.enCurso;
    if (guardada) return;
    if (x.estado === "procesando") {
      if (g?.clase === "original") x.archivo = g.blob;
      else if (g?.clase === "final") { x.blob = g.blob; x.vistaPrevia = URL.createObjectURL(g.blob); x.estado = "lista"; }
      else { x.estado = "error"; x.mensaje = "Se perdió el archivo al recargar mientras se optimizaba. Quítala y vuelve a añadirla."; }
      return;
    }
    if (x.estado === "lista" || x.estado === "subida") {
      if (g?.clase === "final") { x.blob = g.blob; x.vistaPrevia = URL.createObjectURL(g.blob); return; }
      // Ya subida (de esta misma ficha y color): se ve desde Storage y no hace falta volver a subirla.
      if (x.estado === "subida" && x.ruta) { x.vistaPrevia = x.ruta; return; }
      x.estado = "error";
      x.mensaje = "No pudimos recuperar esta foto del borrador. Quítala y vuelve a añadirla.";
    }
  }
  /* Convierte un registro guardado en un lote listo para usar. Las fichas que estaban «guardando» al
     recargar pasan a «sin confirmar» (con su operación) o a «fallida» (si no llegó a enviarse). */
  function restaurar(registro, fotosGuardadas, ambito) {
    let raiz;
    try { raiz = JSON.parse(registro.datos, revivir); } catch { throw new Error("Los datos del borrador están dañados."); }
    if (!raiz || raiz.version !== 1) throw new Error("Versión de borrador no admitida.");
    const l = raiz.lote;
    validarLote(l);
    l.id = registro.id;
    l.ambito = ambito;
    l.creado = typeof l.creado === "string" ? l.creado : registro.creado;
    const instantaneas = {};
    for (const [k, p] of Object.entries(l.instantaneas || {})) {
      const r = texto().normalizarPerfil(p);
      if (r.perfil && k === claveInstantanea(r.perfil)) instantaneas[k] = r.perfil;
    }
    l.instantaneas = instantaneas;
    if (l.perfilLote !== CLAVE_GENERAL && !instantaneas[l.perfilLote]) l.perfilLote = CLAVE_GENERAL;
    let mayor = 0;
    const vistas = (k) => { const n = Number(String(k).slice(1)); if (n > mayor) mayor = n; };
    for (const f of l.fichas) {
      vistas(f.clave);
      if (f.perfil !== CLAVE_GENERAL && !instantaneas[f.perfil]) f.perfil = CLAVE_GENERAL;
      if (f.estado === "guardando") {
        if (f.pendiente || f.ultimaOperacion) {
          f.estado = "sin-confirmar";
          f.mensaje = "El guardado se interrumpió (se recargó o se cerró la página) y no sabemos si terminó. Comprueba el resultado: al volver a guardar se comprueba primero y se usa la misma operación, sin duplicar.";
        } else {
          f.estado = "fallida";
          f.mensaje = "El guardado se interrumpió antes de enviar la ficha. Vuelve a guardarla: las fotos que ya subieron se comprueban y no se duplican.";
        }
      }
      for (const c of f.colores) {
        vistas(c.clave);
        for (const x of c.fotos) { vistas(x.clave); restaurarFoto(x, fotosGuardadas, f.estado === "guardada"); }
      }
    }
    if (l.reparto) {
      l.reparto.items.forEach((it) => { vistas(it.clave); restaurarFoto(it, fotosGuardadas, false); });
      if (typeof l.reparto.abierto !== "string") l.reparto.abierto = null;
    }
    claves = Math.max(claves, mayor);
    return l;
  }
  // Retoma lo que se estaba optimizando al recargar (los originales están en el borrador).
  function reanudarProcesos() {
    if (!lote) return;
    for (const f of lote.fichas) for (const c of f.colores) {
      const pendientes = c.fotos.filter((x) => x.estado === "procesando" && x.archivo);
      if (pendientes.length) procesarFotos(f, c, pendientes);
    }
    if (lote.reparto?.items.some((x) => x.estado === "procesando")) procesarReparto();
  }

  // ------------------------------------------------------------------ dos pestañas
  function esperarMensaje(condicion, ms) {
    return new Promise((resolver) => {
      let quitar = () => {};
      const fin = setTimeout(() => { quitar(); resolver(null); }, ms);
      quitar = almacen().escuchar((d) => { if (condicion(d)) { clearTimeout(fin); quitar(); resolver(d); } });
    });
  }
  /* Pide el borrador a la pestaña que lo tenga abierto (intenta guardar lo suyo y se detiene) y lo toma.
     Sin respuesta (pestaña cerrada o recargada), se toma igual: el guardado condicional evita mezclas.
     Devuelve { otra: había otra pestaña, confirmado: la otra confirmó que sus últimos cambios se guardaron }.
     Nunca se da por guardado lo que no se confirmó. */
  async function tomarControl(ambito, id) {
    const es = (tipo) => (d) => d?.tipo === tipo && d.ambito === ambito && d.borrador === id && d.de !== pestana;
    const recibido = esperarMensaje(es("recibido"), 400);
    const cedido = esperarMensaje(es("cedido"), 4000);
    almacen().avisar({ tipo: "ceder", ambito, borrador: id, de: pestana });
    const hubo = await recibido;
    const respuesta = hubo ? await cedido : null;
    await almacen().reclamar(ambito, id, pestana);
    almacen().avisar({ tipo: "reclamado", ambito, borrador: id, de: pestana });
    return { otra: Boolean(hubo), confirmado: Boolean(respuesta?.guardado) };
  }
  async function alMensaje(d) {
    if (!d || d.de === pestana) return;
    if (d.tipo === "perfiles" && d.ambito === ambitoActual) { recargarPerfiles(); return; }
    if (!lote || d.ambito !== lote.ambito || d.borrador !== lote.id) {
      if (["reclamado", "eliminado"].includes(d.tipo) && d.ambito === ambitoActual && vistaBorradores) refrescarBorradores();
      return;
    }
    if (d.tipo === "ceder") {
      almacen().avisar({ tipo: "recibido", ambito: d.ambito, borrador: d.borrador, de: pestana });
      // Se intenta guardar lo pendiente; solo se dice «guardado» si de verdad quedó guardado.
      const ok = persistencia.estado === "desconectado" ? false : await guardarBorrador();
      const guardado = Boolean(ok && lote && !meta(lote).sucio);
      desconectar("otra-pestana", { guardado });
      almacen().avisar({ tipo: "cedido", ambito: d.ambito, borrador: d.borrador, de: pestana, guardado });
    } else if (d.tipo === "reclamado" || d.tipo === "reemplazado") desconectar("otra-pestana");
    else if (d.tipo === "eliminado") desconectar("eliminado");
  }
  /* La pestaña deja de guardar este borrador. «guardado»: sus últimos cambios quedaron guardados antes del
     traspaso (confirmado). Si no, se dice que los cambios hechos aquí tras el último guardado NO están en
     el borrador y se ofrece exportarlos desde esta pantalla. */
  function desconectar(tipo, { guardado = null } = {}) {
    if (!lote) return;
    clearTimeout(temporizadorGuardado);
    if (ultimoBorrador?.id === lote.id) ultimoBorrador = null;
    if (persistencia.estado !== "desconectado") persistencia.alDesconectar = guardado === null ? !meta(lote).sucio : guardado;
    estadoLocal("desconectado", "", tipo);
    if ($("#importador")?.open) { pintar(); $("#imp-desconectado-titulo")?.focus(); }
  }
  function pintarDesconectado() {
    const eliminado = persistencia.tipo === "eliminado";
    const s = nodo("section", "editor-seccion importador-desconectado");
    s.id = "imp-desconectado";
    s.setAttribute("aria-labelledby", "imp-desconectado-titulo");
    const h = nodo("h3", "editor-seccion-titulo", eliminado ? "Este borrador se eliminó en otra pestaña" : "Este borrador continúa en otra pestaña");
    h.id = "imp-desconectado-titulo";
    h.tabIndex = -1;
    const alDia = persistencia.alDesconectar === true;
    s.append(h, nodo("p", "", eliminado
      ? "Esta pestaña dejó de guardarlo. Si quieres conservar lo que ves aquí, guárdalo como un borrador nuevo."
      : `Para no mezclar cambios, esta pestaña dejó de guardarlo. ${alDia
        ? "Sus últimos cambios se guardaron antes del traspaso."
        : "Los cambios hechos aquí después del último guardado NO están en el borrador: si los necesitas, exporta un respaldo desde aquí antes de continuar."} Puedes seguir en la otra pestaña o traerlo aquí con la última versión guardada (la otra se detendrá).`));
    const fila = nodo("div", "editor-botones importador-desconectado-botones");
    if (eliminado) fila.append(boton("Guardar como borrador nuevo", "rescatar", "boton boton-principal boton-compacto"));
    else fila.append(boton("Continuar aquí", "continuar-aqui", "boton boton-principal boton-compacto"));
    if (!alDia && !eliminado) fila.append(boton("Exportar lo de esta pestaña", "exportar-actual", "boton boton-secundario boton-compacto"));
    fila.append(boton("Ver borradores", "borradores-ver", "boton boton-secundario boton-compacto"));
    s.append(fila);
    return s;
  }

  // ------------------------------------------------------------------ lista de borradores
  let avisoBorradores = null; // { texto, tipo }
  // Trabajo pendiente de un borrador, desglosado (fichas, imágenes, pegado y ajustes).
  function textoPendiente(b) {
    if (!b.pendientes) return "sin trabajo pendiente";
    const d = b.detalle;
    if (!d) return `${b.pendientes} con trabajo pendiente`;
    const partes = [d.fichas ? `${d.fichas} ${d.fichas === 1 ? "ficha" : "fichas"} sin guardar` : "", d.imagenes ? `${d.imagenes} ${d.imagenes === 1 ? "imagen" : "imágenes"} sin asignar` : "",
      d.pegado ? "un pegado sin crear" : "", d.ajustes ? "ajustes del lote" : ""].filter(Boolean);
    return `Pendiente: ${partes.join(", ")}`;
  }
  // Espacio legible: KB, MB o GB según el tamaño.
  function tamano(bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toLocaleString("es-CO", { maximumFractionDigits: 1 })} GB`;
    if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2).toLocaleString("es-CO")} MB`;
    return `${Math.max(1, Math.round(n / 1024)).toLocaleString("es-CO")} KB`;
  }
  async function refrescarBorradores() {
    if (!almacenOk || !ambitoActual) return;
    try { borradoresLista = await almacen().listarBorradores(ambitoActual); } catch { /* se conserva la anterior */ }
    espacio = await almacen().estimar();
    if ($("#importador")?.open && (vistaBorradores || !lote)) pintar();
    else pintarLocal();
  }
  function pintarBorradores() {
    const s = nodo("section", "editor-seccion importador-borradores");
    s.id = "imp-borradores";
    s.setAttribute("aria-labelledby", "imp-borradores-titulo");
    const h = nodo("h3", "editor-seccion-titulo", "Borradores guardados en este navegador");
    h.id = "imp-borradores-titulo";
    h.tabIndex = -1;
    s.append(h, nodo("p", "editor-nota", "Cada borrador es un lote del importador con sus fotos, guardado solo en este navegador y para tu usuario. No es lo mismo que guardar en Supabase: las zapatillas llegan al catálogo con «Guardar lote como oculto». Si borras los datos del navegador, los borradores se pierden; exporta un respaldo para conservarlos o llevarlos a otro equipo."));
    if (!almacenOk) {
      s.append(nodo("p", "importador-borradores-aviso es-aviso", "Este navegador no permite guardar borradores (almacenamiento local no disponible o bloqueado)."));
    }
    if (espacio) s.append(nodo("p", "campo-ayuda importador-espacio", `Este sitio usa ${tamano(espacio.usado)} de unos ${tamano(espacio.cuota)} que permite el navegador (estimación del propio navegador; puede cambiar).`));
    if (avisoBorradores) {
      const p = nodo("p", `importador-borradores-aviso es-${avisoBorradores.tipo}`, avisoBorradores.texto);
      p.id = "imp-borradores-aviso";
      p.setAttribute("role", "status");
      s.append(p);
    }
    if (importacion) s.append(pintarImportacion());
    const ul = nodo("ul", "importador-borradores-lista");
    ul.setAttribute("aria-label", "Borradores");
    if (!borradoresLista.length) ul.append(nodo("li", "editor-vacio", "No hay borradores guardados en este navegador."));
    for (const b of borradoresLista) {
      const li = nodo("li", "importador-borrador");
      li.dataset.borrador = b.id;
      const abierto = lote?.id === b.id;
      const titulo = nodo("p", "importador-borrador-titulo");
      titulo.append(nodo("strong", "", b.proveedor || "Perfil general"), ` · ${b.publicaciones === 1 ? "1 publicación" : `${b.publicaciones} publicaciones`}`);
      const meta1 = nodo("p", "importador-borrador-meta", [
        b.guardadas ? `${b.guardadas} ${b.guardadas === 1 ? "guardada" : "guardadas"} en Supabase` : "Nada guardado en Supabase",
        textoPendiente(b)].join(" · "));
      const meta2 = nodo("p", "importador-borrador-meta", `Último cambio: ${formatoFecha(b.actualizado) || "sin fecha"}${abierto ? " · es el lote abierto" : ""}`);
      li.append(titulo, meta1, meta2);
      const fila = nodo("div", "editor-botones importador-borrador-botones");
      const nombre = `${b.proveedor || "Perfil general"}, ${formatoFecha(b.actualizado)}`;
      if (!abierto) {
        const seguir = boton("Continuar", "borrador-continuar", "boton boton-principal boton-compacto", { borrador: b.id });
        seguir.setAttribute("aria-label", `Continuar el borrador ${nombre}`);
        fila.append(seguir);
      }
      const exportar = boton("Exportar respaldo", "borrador-exportar", "boton boton-secundario boton-compacto", { borrador: b.id });
      exportar.setAttribute("aria-label", `Exportar un respaldo del borrador ${nombre}`);
      fila.append(exportar);
      if (!abierto) {
        const borrar = boton("Eliminar", "borrador-eliminar", "boton boton-texto boton-compacto", { borrador: b.id });
        borrar.setAttribute("aria-label", `Eliminar el borrador ${nombre}`);
        fila.append(borrar);
      }
      li.append(fila);
      if (confirmarBorrar?.tipo === "borrador" && confirmarBorrar.id === b.id) {
        const confirma = nodo("div", "importador-confirmar");
        confirma.setAttribute("role", "group");
        confirma.setAttribute("aria-label", `Confirmar la eliminación del borrador ${nombre}`);
        confirma.append(nodo("p", "", `¿Eliminar este borrador de este navegador? ${b.pendientes ? "Su trabajo pendiente se perderá (exporta un respaldo antes si lo necesitas). " : ""}Lo que ya esté guardado en Supabase no cambia y no se borra ningún archivo de Storage.`));
        const filaConfirma = nodo("div", "editor-botones");
        filaConfirma.append(boton("Eliminar el borrador", "borrador-eliminar-si", "boton boton-principal boton-compacto", { borrador: b.id }),
          boton("Cancelar", "confirmar-cancelar", "boton boton-secundario boton-compacto"));
        confirma.append(filaConfirma);
        li.append(confirma);
      }
      ul.append(li);
    }
    s.append(ul);
    const acciones = nodo("div", "importador-borradores-acciones");
    if (lote) acciones.append(boton("Volver al lote abierto", "borradores-volver", "boton boton-secundario"));
    const nuevo = boton(lote ? "Empezar otro lote" : "Empezar un lote nuevo", "borrador-nuevo", lote ? "boton boton-secundario" : "boton boton-principal");
    nuevo.id = "imp-borrador-nuevo";
    acciones.append(nuevo);
    if (almacenOk) {
      const importar = nodo("label", "boton boton-secundario importador-importar", "Importar un respaldo");
      const archivo = nodo("input");
      archivo.type = "file";
      archivo.accept = "application/json,.json";
      archivo.className = "solo-lectores";
      archivo.id = "imp-respaldo-archivo";
      archivo.dataset.respaldo = "1";
      importar.htmlFor = archivo.id;
      importar.append(archivo);
      acciones.append(importar);
    }
    s.append(acciones);
    return s;
  }

  function verBorradores() {
    vistaBorradores = true;
    confirmarBorrar = null;
    avisoBorradores = null;
    mensaje("");
    guardarBorrador();
    pintar();
    $("#imp-borradores-titulo")?.focus();
    refrescarBorradores();
  }
  function volverAlLote() {
    vistaBorradores = false;
    importacion = null;
    confirmarBorrar = null;
    pintar();
    $("#importador-titulo")?.focus();
  }
  async function continuarBorrador(id) {
    if (lote?.id === id) { volverAlLote(); return; }
    // El lote abierto solo se suelta si quedó guardado en este navegador; si no, sigue abierto.
    if (lote) { if (!(await asegurarGuardado())) return; soltarLote(); }
    let control;
    try {
      control = await cargarBorrador(id);
    } catch (error) {
      lote = null;
      vistaBorradores = true;
      avisoBorradores = { texto: `No se pudo abrir el borrador: ${error?.message || "error desconocido"}. Sigue guardado; puedes exportarlo o eliminarlo.`, tipo: "aviso" };
      pintar();
      $("#imp-borradores-aviso")?.focus?.();
      return;
    }
    pintar();
    if (control?.otra && !control.confirmado) {
      mensaje("Borrador traído de otra pestaña. Esa pestaña no confirmó que sus últimos cambios quedaran guardados: aquí está la última versión guardada, y lo que allí no se guardó no está incluido. Esa pestaña ya no lo guarda.", "aviso");
    } else {
      mensaje("Borrador recuperado de este navegador. Lo que ya está en Supabase no se vuelve a enviar.", "ok");
    }
    $("#importador-titulo")?.focus();
  }
  async function cargarBorrador(id) {
    const ambito = ambitoActual;
    const control = await tomarControl(ambito, id);
    const leido = await almacen().leerBorrador(ambito, id);
    if (!leido) throw new Error("ya no existe");
    const l = restaurar(leido.registro, leido.fotos, ambito);
    const m = meta(l);
    m.existe = true;
    m.revision = leido.registro.revision;
    for (const [ref, g] of leido.fotos) m.persistidas.set(ref, g.clase);
    lote = l;
    vistaBorradores = false;
    importacion = null;
    estadoLocal("guardado", "", "", leido.registro.actualizado);
    if (pendientesDe(l) > 0) ultimoBorrador = { ambito, id };
    reanudarProcesos();
    return control;
  }
  async function empezarLote() {
    const perfil = lote ? perfilLote() : null;
    // El lote abierto solo se suelta si quedó guardado en este navegador; si no, sigue abierto.
    if (lote) { if (!(await asegurarGuardado())) return; soltarLote(); }
    lote = loteNuevo(perfil && !esGeneral(perfil) && perfilVivo(perfil) ? perfilVivo(perfil) : null);
    vistaBorradores = false;
    importacion = null;
    estadoLocal(almacenOk ? "inactivo" : "sin-almacen");
    pintar();
    const area = document.getElementById(`imp-${lote.fichas[0].colores[0].clave}-texto`);
    area?.focus({ preventScroll: true });
    area?.closest(".importador-mensaje")?.scrollIntoView({ block: "nearest" });
  }
  async function eliminarBorradorLocal(id) {
    if (lote?.id === id) return;
    // Solo el borrador LOCAL: no se borra nada de Supabase ni de Storage.
    try { await almacen().eliminarBorrador(ambitoActual, id); } catch { avisoBorradores = { texto: "No se pudo eliminar el borrador.", tipo: "aviso" }; pintar(); return; }
    almacen().avisar({ tipo: "eliminado", ambito: ambitoActual, borrador: id, de: pestana });
    if (ultimoBorrador?.id === id) ultimoBorrador = null;
    confirmarBorrar = null;
    borradoresLista = borradoresLista.filter((b) => b.id !== id);
    avisoBorradores = { texto: "Borrador eliminado de este navegador.", tipo: "ok" };
    if (persistencia.tipo === "cuota") estadoLocal("pendiente");
    pintar();
    $("#imp-borradores-titulo")?.focus();
    espacio = await almacen().estimar();
    if (lote) guardarBorrador(); // si faltaba espacio, se reintenta ya
  }

  // ------------------------------------------------------------------ respaldo: exportar e importar
  const separarAmbito = (ambito) => { const i = String(ambito).lastIndexOf("|"); return { proyecto: ambito.slice(0, i), usuario: ambito.slice(i + 1) }; };
  function descargar(blob, nombre) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    a.hidden = true;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }
  const nombreRespaldo = (proveedor) => {
    const base = texto().clave(proveedor || "general").replace(/\s+/g, "-").slice(0, 40) || "lote";
    const d = new Date();
    const dos = (n) => String(n).padStart(2, "0");
    return `borrador-importador-${base}-${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}.json`;
  };
  // Respaldo del lote ABIERTO, desde la memoria: sirve aunque el navegador no tenga espacio para guardarlo.
  async function exportarLoteAbierto() {
    if (!lote) return;
    const registro = { ...registroDe(lote), actualizado: new Date().toISOString() };
    try {
      const blob = await almacen().empaquetar({ ambito: separarAmbito(lote.ambito), registro, fotos: fotosDelLote(lote, { todas: true }) });
      descargar(blob, nombreRespaldo(registro.proveedor));
      mensaje("Respaldo exportado: el archivo .json incluye los datos y las fotos del lote. Guárdalo en un lugar seguro; no contiene contraseñas ni sesión.", "ok");
    } catch { mensaje("No se pudo preparar el respaldo.", "aviso"); }
  }
  async function exportarGuardado(id) {
    if (lote?.id === id) { await guardarBorrador(); return exportarLoteAbierto(); }
    try {
      const leido = await almacen().leerBorrador(ambitoActual, id);
      if (!leido) throw new Error("no existe");
      const fotosLista = [...leido.fotos].map(([ref, g]) => ({ ref, clase: g.clase, blob: g.blob, nombre: g.nombre }));
      const blob = await almacen().empaquetar({ ambito: separarAmbito(ambitoActual), registro: leido.registro, fotos: fotosLista });
      descargar(blob, nombreRespaldo(leido.registro.proveedor));
      avisoBorradores = { texto: "Respaldo exportado con los datos y las fotos del borrador.", tipo: "ok" };
    } catch { avisoBorradores = { texto: "No se pudo exportar el borrador.", tipo: "aviso" }; }
    pintar();
  }

  async function importarRespaldo(archivo) {
    importacion = null;
    avisoBorradores = null;
    let leido;
    try {
      leido = await almacen().leerRespaldo(archivo, { firma: fotos().firma });
      // Los datos del lote se comprueban igual que al recuperar un borrador (sin escribir nada).
      const raiz = JSON.parse(leido.registro.datos, revivir);
      if (!raiz || raiz.version !== 1) throw new almacen().ErrorRespaldo("Versión de datos no admitida.");
      validarLote(raiz.lote);
    } catch (error) {
      avisoBorradores = { texto: `No se importó nada: ${error?.message || "el archivo no es válido"}. Tus borradores siguen como estaban.`, tipo: "aviso" };
      pintar();
      $("#imp-borradores-aviso")?.focus?.();
      return;
    }
    const actual = separarAmbito(ambitoActual);
    if (leido.ambito.proyecto !== actual.proyecto || leido.ambito.usuario !== actual.usuario) {
      importacion = { leido, tipo: "otro-ambito" };
    } else {
      const existente = await almacen().existe(ambitoActual, leido.registro.id);
      if (existente) importacion = { leido, tipo: "existe", existente };
      else { await escribirImportacion(leido, false); return; }
    }
    pintar();
    $("#imp-importacion")?.querySelector("button")?.focus();
  }
  function pintarImportacion() {
    const { leido, tipo, existente } = importacion;
    const caja = nodo("div", "importador-confirmar importador-importacion");
    caja.id = "imp-importacion";
    caja.setAttribute("role", "group");
    caja.setAttribute("aria-label", "Importar un respaldo");
    const r = leido.registro;
    const quien = `«${r.proveedor || "Perfil general"}», ${r.publicaciones === 1 ? "1 publicación" : `${r.publicaciones} publicaciones`}`;
    const fila = nodo("div", "editor-botones");
    if (tipo === "otro-ambito") {
      caja.append(nodo("p", "", `El respaldo ${quien} es de otro proyecto de Supabase o de otro usuario. Puedes importarlo como borrador nuevo: se conservan los textos, los datos y las fotos, pero no sus guardados (lo que se guardó allí no existe aquí y se tratará como pendiente).`));
      fila.append(boton("Importar como borrador nuevo", "importacion-nuevo", "boton boton-principal boton-compacto"));
    } else {
      caja.append(nodo("p", "", `Ya hay en este navegador un borrador con el mismo identificador (último cambio: ${formatoFecha(existente.actualizado) || "sin fecha"}). El respaldo es ${quien}. ¿Sustituir el borrador de este navegador por el del respaldo? El actual se perderá.`));
      fila.append(boton("Sustituir el borrador", "importacion-reemplazar", "boton boton-principal boton-compacto"));
    }
    fila.append(boton("Cancelar", "importacion-cancelar", "boton boton-secundario boton-compacto"));
    caja.append(fila);
    return caja;
  }
  // Respaldo de otro proyecto o usuario: borrador nuevo, sin operaciones ni archivos de aquel entorno.
  function adaptarAOtroAmbito(leido) {
    const raiz = JSON.parse(leido.registro.datos, revivir);
    const l = raiz.lote;
    l.id = uuid();
    for (const f of l.fichas) {
      f.id = uuid();
      f.pendiente = null;
      f.operaciones = new Set();
      f.ultimaOperacion = null;
      f.codigo = "";
      f.decisionCatalogo = false;
      if (f.estado !== "borrador") {
        f.mensaje = "";
        if (f.estado === "guardada") f.seleccionada = true;
        f.estado = "borrador";
      }
      for (const c of f.colores) {
        c.id = uuid();
        for (const x of c.fotos) {
          if (["subida", "subiendo"].includes(x.estado)) x.estado = "lista";
          for (const k of ["objeto", "producto", "variante", "ruta", "anterior"]) delete x[k];
        }
      }
    }
    return { registro: { ...leido.registro, id: l.id, datos: serializar(l) }, fotos: leido.fotos };
  }
  async function escribirImportacion(leido, reemplazar) {
    if (lote?.id === leido.registro.id) {
      avisoBorradores = { texto: "Ese borrador es el lote abierto aquí: para sustituirlo, empieza otro lote y vuelve a importar el respaldo.", tipo: "aviso" };
      importacion = null;
      pintar();
      return;
    }
    try {
      await almacen().importar(ambitoActual, leido, { reemplazar });
    } catch (error) {
      avisoBorradores = { texto: error instanceof almacen().ErrorCuota ? "No hay espacio en este navegador para importar el respaldo. Elimina borradores que no necesites y vuelve a intentarlo." : "No se pudo importar el respaldo; no se cambió nada.", tipo: "aviso" };
      importacion = null;
      pintar();
      return;
    }
    if (reemplazar) almacen().avisar({ tipo: "reemplazado", ambito: ambitoActual, borrador: leido.registro.id, de: pestana });
    importacion = null;
    avisoBorradores = { texto: `Respaldo importado: «${leido.registro.proveedor || "Perfil general"}», ${leido.registro.publicaciones === 1 ? "1 publicación" : `${leido.registro.publicaciones} publicaciones`}. Pulsa «Continuar» para abrirlo.`, tipo: "ok" };
    await refrescarBorradores();
    pintar();
    document.querySelector(`#imp-borradores [data-borrador="${leido.registro.id}"] [data-imp="borrador-continuar"]`)?.focus();
  }

  // Suelta el lote de la memoria (al cerrar sesión, cambiar de borrador…). Con «guardar», lo guarda antes.
  function soltarLote({ guardar = false } = {}) {
    const l = lote;
    if (!l) return Promise.resolve();
    lote = null;
    clearTimeout(temporizadorGuardado);
    primerCambio = 0;
    editorPerfil = null;
    confirmarBorrar = null;
    avisoPerfil = "";
    persistencia.estado = "inactivo";
    persistencia.tipo = "";
    const revocar = () => {
      for (const f of l.fichas) for (const c of f.colores) for (const x of c.fotos) if (String(x.vistaPrevia || "").startsWith("blob:")) URL.revokeObjectURL(x.vistaPrevia);
      for (const it of l.reparto?.items || []) if (String(it.vistaPrevia || "").startsWith("blob:")) URL.revokeObjectURL(it.vistaPrevia);
    };
    if (!guardar) { revocar(); return Promise.resolve(true); }
    /* Si no se puede guardar (p. ej. sin espacio al cerrar sesión), el lote NO se pierde: queda retenido
       en memoria, sin mostrarse, y vuelve al abrir el importador con el mismo usuario y proyecto. */
    return guardarBorrador({ objetivo: l }).then((ok) => {
      if (ok && !meta(l).sucio) revocar();
      else if (pendientesDe(l) > 0 && persistencia.estado !== "desconectado") retenidos.set(l.ambito, l);
      return ok;
    });
  }
  const retenidos = new Map(); // ámbito → lote que no se pudo guardar al soltarlo

  async function prepararAmbito() {
    const usuario = panel().usuario?.();
    const conf = panel().configuracion?.();
    const nuevo = usuario?.id && conf?.url ? `${conf.url}|${usuario.id}` : null;
    if (nuevo !== ambitoActual) {
      ambitoActual = nuevo;
      perfiles = [];
      borradoresLista = [];
      if (ultimoBorrador?.ambito !== nuevo) ultimoBorrador = null;
    }
    almacenOk = false;
    if (ambitoActual && almacen()?.disponible()) {
      try { await almacen().abrirBase(); almacenOk = true; } catch { almacenOk = false; }
    }
    if (!almacenOk) return;
    try { perfiles = validarPerfiles(await almacen().listarPerfiles(ambitoActual)); } catch { perfiles = []; }
    try { borradoresLista = await almacen().listarBorradores(ambitoActual); } catch { borradoresLista = []; }
    espacio = await almacen().estimar();
  }
  async function elegirLoteAlAbrir() {
    if (almacenOk && ultimoBorrador && borradoresLista.some((b) => b.id === ultimoBorrador.id)) {
      try { await cargarBorrador(ultimoBorrador.id); return; } catch { ultimoBorrador = null; }
    }
    // Con borradores que tienen trabajo pendiente se ofrece elegir; si no, un lote nuevo.
    if (almacenOk && borradoresLista.some((b) => b.pendientes > 0)) { lote = null; vistaBorradores = true; return; }
    lote = loteNuevo();
    estadoLocal(almacenOk ? "inactivo" : "sin-almacen");
  }

  // Acciones de la etapa 20. Devuelve true si la atendió.
  function alClicEtapa20(accion, b) {
    const f = fichaDe(b.dataset.ficha);
    switch (accion) {
      // Pegar varias publicaciones
      case "pegado-abrir": abrirPegado(); return true;
      case "pegado-revisar": revisarPegado(); return true;
      case "pegado-editar":
        lote.pegado.fase = "texto";
        pintar();
        $("#imp-pegado-texto")?.focus();
        return true;
      case "pegado-cancelar":
        lote.pegado = null;
        pintar();
        $("#imp-pegado-abrir")?.focus();
        mensaje("Pegado cancelado: no se creó ninguna publicación.");
        return true;
      case "pegado-unir": {
        const inicio = Number(b.dataset.inicio);
        const lista = fragmentosPegado();
        const i = lista.findIndex((x) => x.inicio === inicio);
        delete lote.pegado.incluir[inicio];
        cambiarCortes(separador().unirCon(lote.pegado.cortes, inicio), i > 0 ? `imp-frag-${lista[i - 1].inicio}-titulo` : "imp-pegado-titulo");
        return true;
      }
      case "pegado-separar": {
        const linea = Number(b.dataset.linea);
        cambiarCortes(separador().separarEn(lote.pegado.cortes, linea), `imp-frag-${linea}-titulo`);
        return true;
      }
      case "pegado-ok": {
        const inicio = Number(b.dataset.inicio);
        cambiarCortes(separador().revisado(lote.pegado.cortes, inicio), `imp-frag-${inicio}-titulo`);
        return true;
      }
      case "pegado-crear":
        if (b.getAttribute("aria-disabled") === "true") { mensaje("Marca al menos una publicación para crear.", "aviso"); return true; }
        crearPublicaciones();
        return true;
      // Perfiles
      case "perfil-nuevo":
        if (!almacenOk) { mensaje("Este navegador no permite guardar perfiles.", "aviso"); return true; }
        abrirEditorPerfil(null);
        return true;
      case "perfil-editar": abrirEditorPerfil(b.dataset.perfil); return true;
      case "perfil-cancelar": editorPerfil = null; repintarEntrada(); $("#imp-perfil-nuevo")?.focus(); return true;
      case "perfil-guardar": guardarPerfilEditado(); return true;
      case "perfil-eliminar":
        confirmarBorrar = { tipo: "perfil", id: b.dataset.perfil };
        repintarEntrada();
        $('#imp-perfiles [data-imp="perfil-eliminar-si"]')?.focus();
        return true;
      case "perfil-eliminar-si": eliminarPerfil(b.dataset.perfil); return true;
      case "perfil-reaplicar": reaplicarPerfil(); return true;
      case "recordar": if (f) recordar(f, b.dataset.propuesta); return true;
      case "preparar-colores": {
        // Añade solo los que faltan: pulsar dos veces no duplica nada.
        if (!f || !editable(f)) return true;
        const p = pedidosDe(f);
        if (!p.valido || p.n <= f.colores.length) return true;
        const nuevos = prepararColores(f, p.n);
        repintarFicha(f);
        repintarAjustes();
        const primero = document.getElementById(`imp-${nuevos[0].clave}-titulo`);
        primero?.scrollIntoView({ block: "center" });
        primero?.focus({ preventScroll: true });
        mensaje(`${nuevos.length === 1 ? "Se preparó 1 color" : `Se prepararon ${nuevos.length} colores`} en la ficha ${numero(f)}: escribe sus nombres y añade sus fotos. Proponen las tallas y el precio de la publicación.`, "ok");
        return true;
      }
      case "recordar-no":
        if (!f) return true;
        f.descartadas.add(b.dataset.propuesta);
        repintarFicha(f);
        document.getElementById(`imp-${f.clave}-marca`)?.focus({ preventScroll: true });
        return true;
      // Borradores, respaldo y pestañas
      case "borradores-ver": verBorradores(); return true;
      case "borradores-volver": volverAlLote(); return true;
      case "borrador-continuar": continuarBorrador(b.dataset.borrador); return true;
      case "borrador-exportar": exportarGuardado(b.dataset.borrador); return true;
      case "borrador-eliminar":
        confirmarBorrar = { tipo: "borrador", id: b.dataset.borrador };
        pintar();
        $('#imp-borradores [data-imp="borrador-eliminar-si"]')?.focus();
        return true;
      case "borrador-eliminar-si": eliminarBorradorLocal(b.dataset.borrador); return true;
      case "borrador-nuevo": empezarLote(); return true;
      case "confirmar-cancelar": {
        const tipo = confirmarBorrar?.tipo;
        const id = confirmarBorrar?.id;
        confirmarBorrar = null;
        if (tipo === "perfil") { repintarEntrada(); document.querySelector(`#imp-perfiles [data-imp="perfil-eliminar"][data-perfil="${id}"]`)?.focus(); }
        else { pintar(); document.querySelector(`#imp-borradores [data-imp="borrador-eliminar"][data-borrador="${id}"]`)?.focus(); }
        return true;
      }
      case "importacion-nuevo": if (importacion) escribirImportacion(adaptarAOtroAmbito(importacion.leido), false); return true;
      case "importacion-reemplazar": if (importacion) escribirImportacion(importacion.leido, true); return true;
      case "importacion-cancelar":
        importacion = null;
        avisoBorradores = { texto: "Importación cancelada: no se cambió nada.", tipo: "ok" };
        pintar();
        $("#imp-borradores-titulo")?.focus();
        return true;
      case "exportar-actual": exportarLoteAbierto(); return true;
      case "continuar-aqui": {
        const id = lote.id;
        soltarLote();
        continuarBorrador(id);
        return true;
      }
      case "rescatar": {
        // El borrador se eliminó en otra pestaña: lo que hay aquí se guarda como un borrador nuevo.
        lote.id = uuid();
        metas.delete(lote);
        estadoLocal("pendiente");
        guardarBorrador().then(() => { pintar(); $("#importador-titulo")?.focus(); });
        return true;
      }
      default: return false;
    }
  }

  // ------------------------------------------------------------------ eventos
  // Acciones que funcionan sin un lote abierto (lista de borradores).
  const SIN_LOTE = new Set(["cerrar", "cerrar-pie", "seguir", "conservar", "borradores-ver", "borradores-volver", "borrador-continuar", "borrador-exportar", "borrador-eliminar",
    "borrador-eliminar-si", "borrador-nuevo", "confirmar-cancelar", "importacion-nuevo", "importacion-reemplazar", "importacion-cancelar"]);
  function alClic(e) {
    const b = e.target.closest("[data-imp]");
    if (!b) return;
    const accion = b.dataset.imp;
    if (!lote && !SIN_LOTE.has(accion)) return;
    if (guardando && accion !== "cerrar") return;
    if (alClicEtapa20(accion, b)) return;
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
    // Etapa 20: pegado, perfiles y «Recordar para este proveedor».
    if (n.dataset.pegado === "texto") { if (lote.pegado) { lote.pegado.texto = n.value; lote.pegado.error = ""; } return; }
    if (n.dataset.pegadoColores !== undefined) {
      if (!lote.pegado) return;
      if (!lote.pegado.colores) lote.pegado.colores = {};
      lote.pegado.colores[n.dataset.pegadoColores] = n.value;
      programar("pegado-colores", repintarPegado, 400);
      return;
    }
    if (n.dataset.pegadoIncluir) {
      if (!lote.pegado) return;
      lote.pegado.incluir[n.dataset.pegadoIncluir] = n.checked;
      repintarPegado();
      return;
    }
    if (n.dataset.perfilCampo && editorPerfil) {
      const k = n.dataset.perfilCampo;
      const rango = /^rango-(dama|hombre|unisex)-(desde|hasta)$/.exec(k);
      if (rango) editorPerfil.valores.rangos[rango[1]][rango[2]] = n.value;
      else editorPerfil.valores[k] = n.value;
      return;
    }
    if (n.dataset.perfilLote) { if (n.checked && !n.dataset.eliminado) elegirPerfilLote(n.value); return; }
    if (n.dataset.recordarPublico) {
      const f = fichaDe(n.dataset.recordarPublico);
      if (!f) return;
      f.recordarPublico = n.value;
      const previa = document.getElementById(`imp-${f.clave}-recordar-previa`);
      if (previa) previa.textContent = textoPrevioPublico(f, f.publico);
      return;
    }
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
      if (k === "coloresPedidos") {
        // Etapa 20: dato de preparación (no cambia lo que se guarda): no invalida la operación pendiente.
        f.coloresPedidos = n.value;
        f.editados.add("colores");
        f.revisar.delete("colores");
        programar(`colores-${f.clave}`, () => repintarFicha(f), 400);
        return;
      }
      f[k] = n.type === "checkbox" ? n.checked : n.value;
      f.pendiente = null;
      if (["marca", "modelo", "publico"].includes(k)) { f.editados.add(k); f.revisar.delete(k); }
      if (k === "categoria") {
        f.editados.add("categoria");
        f.origenCategoria = "";
        // La propuesta «Recordar para este proveedor» depende de la categoría escrita.
        programar(`categoria-${f.clave}`, () => repintarFicha(f), 600);
      }
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
    // Etapa 20: importar un respaldo (también sin lote abierto, desde la lista de borradores).
    if (n.type === "file" && n.dataset.respaldo) {
      const archivo = n.files?.[0];
      n.value = "";
      if (archivo) importarRespaldo(archivo);
      return;
    }
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
    return Boolean(lote) && pendientesDe(lote) > 0;
  }

  let abriendo = false;
  async function abrir(disparador = null) {
    const dialogo = $("#importador");
    if (!dialogo || !comun() || !texto() || !fotos() || !separador() || !almacen()) {
      panel()?.anunciar({ titulo: "El importador no se pudo cargar", texto: "Recarga la página.", tipo: "aviso" });
      return;
    }
    if (abriendo) return;
    abriendo = true;
    try {
      origen = disparador instanceof HTMLElement ? disparador : null;
      // Etapa 20: proyecto y usuario de la sesión; perfiles y borradores de ese ámbito.
      await prepararAmbito();
      // Un lote de otro usuario o proyecto (cambio de sesión en esta pestaña) nunca se muestra.
      if (lote && lote.ambito !== ambitoActual) await soltarLote({ guardar: true });
      // El lote sin guardar se conserva (por ejemplo, al cerrar la ventana). Uno vacío se renueva.
      if (lote && !hayPendiente() && lote.fichas.every((f) => f.estado !== "guardada") && !meta(lote).existe) {
        const perfil = perfilVivo(perfilLote());
        lote = loteNuevo(perfil);
      }
      // Un lote retenido porque no se pudo guardar al cerrar sesión vuelve tal cual (mismo usuario y proyecto).
      if (!lote && retenidos.has(ambitoActual)) {
        lote = retenidos.get(ambitoActual);
        retenidos.delete(ambitoActual);
        estadoLocal("pendiente");
        programarGuardado();
      }
      if (!lote) await elegirLoteAlAbrir();
      else if (persistencia.estado !== "desconectado") vistaBorradores = false;
      $("#importador-salida").hidden = true;
      $("#importador-botones").hidden = false;
      mensaje("");
      pintar();
      if (!dialogo.open) { comun().bloquearFondo(); dialogo.showModal(); }
      if (!lote || vistaBorradores) { $("#imp-borradores-titulo")?.focus(); return; }
      if (persistencia.estado === "desconectado") { $("#imp-desconectado-titulo")?.focus(); return; }
      // Lote nuevo: el cuadro del mensaje recibe el foco (pegar es lo primero). Lote conservado: el título.
      const primero = lote.fichas[0]?.colores[0];
      const vacio = lote.fichas.length === 1 && primero && !primero.texto.trim() && !primero.fotos.length && !lote.pegado;
      if (vacio) {
        // Etapa 19: los bloques para varias fichas van arriba; el cuadro del mensaje (lo primero que se hace)
        // se trae entero a la vista, también en celular.
        const area = document.getElementById(`imp-${primero.clave}-texto`);
        area?.focus({ preventScroll: true });
        area?.closest(".importador-mensaje")?.scrollIntoView({ block: "nearest" });
      }
      else $("#importador-titulo").focus();
    } finally {
      abriendo = false;
    }
    if (formaMuestra === null) {
      formaMuestra = await comun().capacidadForma();
      if (formaMuestra === false && lote) pintar();
    }
  }

  function cerrar() {
    const dialogo = $("#importador");
    for (const t of temporizadores.values()) clearTimeout(t);
    temporizadores.clear();
    // Lo último que se escribió queda en el borrador local antes de cerrar.
    if (lote && persistencia.estado !== "desconectado") guardarBorrador();
    if (dialogo?.open) { dialogo.close(); comun().liberarFondo(); }
    $("#importador-cuerpo")?.replaceChildren();
    const destino = origen?.isConnected ? origen : $("#boton-importar");
    origen = null;
    // El foco vuelve al botón que lo abrió sin mover el panel (su posición ya se restauró).
    destino?.focus({ preventScroll: true });
  }

  /* «Descartar el lote»: acción expresa. Borra el borrador LOCAL y, como antes, limpia de Storage solo
     los archivos subidos por este lote que ninguna galería usa (limpieza verificada de limpiarSubidas). */
  function descartar() {
    descartarReparto({ silencio: true });
    const l = lote;
    for (const f of l?.fichas || []) for (const c of f.colores) {
      for (const x of c.fotos) { x.quitada = true; if (String(x.vistaPrevia || "").startsWith("blob:")) URL.revokeObjectURL(x.vistaPrevia); }
      limpiarSubidas(f, c.fotos);
    }
    if (l) {
      const m = meta(l);
      m.descartado = true;
      clearTimeout(temporizadorGuardado);
      if (almacenOk && m.existe && persistencia.estado !== "desconectado") {
        cadena = cadena.then(() => almacen().eliminarBorrador(l.ambito, l.id))
          .then(() => almacen().avisar({ tipo: "eliminado", ambito: l.ambito, borrador: l.id, de: pestana })).catch(() => {});
      }
      if (ultimoBorrador?.id === l.id) ultimoBorrador = null;
      borradoresLista = borradoresLista.filter((b) => b.id !== l.id);
    }
    lote = null;
    persistencia.estado = "inactivo";
    persistencia.tipo = "";
    vistaBorradores = false;
    cerrar();
  }

  function intentarCerrar() {
    if (!lote || vistaBorradores || persistencia.estado === "desconectado") { cerrar(); return; }
    if (guardando) { mensaje("Espera a que termine el guardado en curso.", "aviso"); return; }
    // Etapa 20: cuenta cualquier dato escrito o elegido (también sin mensaje ni modelo) y los ajustes del lote.
    const sinGuardar = lote.fichas.filter((f) => f.estado !== "guardada" && conContenido(f)).length;
    const porAsignar = lote.reparto?.items.length || 0;
    const pegando = lote.pegado?.texto.trim() ? 1 : 0;
    const ajustes = ajustesPendientes(lote) ? 1 : 0;
    if (!sinGuardar && !porAsignar && !pegando && !ajustes) {
      // Nada pendiente. Un lote que ya está en el borrador local (p. ej. con sus fichas guardadas en
      // Supabase) se conserva en la lista: solo se borra con una acción expresa.
      if (almacenOk && meta(lote).existe) { cerrar(); soltarLote({ guardar: true }); return; }
      descartar();
      return;
    }
    mensaje(""); // el pie solo muestra la pregunta: en pantallas bajas no quita sitio al contenido
    const pendientes = [sinGuardar ? (sinGuardar === 1 ? "una ficha sin guardar" : `${sinGuardar} fichas sin guardar`) : "",
      porAsignar ? (porAsignar === 1 ? "una imagen sin asignar" : `${porAsignar} imágenes sin asignar`) : "",
      pegando ? "un pegado de varias publicaciones sin crear" : "", ajustes && !sinGuardar ? "ajustes del lote elegidos" : ""].filter(Boolean).join(" y ");
    $("#importador-salida-texto").textContent = almacenOk
      ? `Hay ${pendientes}. Puedes cerrar y seguir después (queda guardado como borrador en este navegador, no en Supabase) o descartarlo.`
      : `Hay ${pendientes}. Puedes cerrar y seguir después (este navegador no guarda borradores: se conserva mientras no recargues la página) o descartarlo.`;
    $("#importador-salida").hidden = false;
    $("#importador-botones").hidden = true;
    $('[data-imp="seguir"]').focus();
  }

  /* admin.js lo llama al cerrar sesión o perder el acceso. Etapa 20: el lote se guarda en el borrador
     local y deja de estar en memoria (no se muestra a nadie más en esta pestaña); al volver a entrar con
     el mismo usuario y proyecto se recupera. Sin almacenamiento local se conserva en memoria como antes
     (y abrir() lo descarta si entra otro usuario). */
  function alPerderAcceso() {
    if ($("#importador")?.open) cerrar();
    vistaBorradores = false;
    importacion = null;
    if (lote && almacenOk) {
      if (pendientesDe(lote) > 0 && persistencia.estado !== "desconectado") ultimoBorrador = { ambito: lote.ambito, id: lote.id };
      soltarLote({ guardar: persistencia.estado !== "desconectado" });
    }
    perfiles = [];
    borradoresLista = [];
  }

  function preparar() {
    const dialogo = $("#importador");
    if (!dialogo) return;
    $("#importador-formulario").addEventListener("submit", (e) => { e.preventDefault(); if (lote && !vistaBorradores) guardarLote(); });
    dialogo.addEventListener("click", alClic);
    dialogo.addEventListener("pointerdown", () => { pulsando = true; }, true);
    for (const tipo of ["pointerup", "pointercancel"]) window.addEventListener(tipo, () => { pulsando = false; }, true);
    dialogo.addEventListener("input", alEscribir);
    dialogo.addEventListener("change", alCambiar);
    // Etapa 20: cualquier cambio en el formulario programa el guardado local (con espera: no en cada tecla).
    for (const tipo of ["input", "change"]) dialogo.addEventListener(tipo, () => programarGuardado());
    for (const tipo of ["dragenter", "dragover", "dragleave", "drop"]) dialogo.addEventListener(tipo, alArrastrar);
    // Solo el «cancel» del propio diálogo (Escape). El de un selector de archivos que se cierra sin elegir
    // nada (Chromium lo lanza en el <input type="file"> y sube hasta aquí) no es «cerrar el importador».
    dialogo.addEventListener("cancel", (e) => { if (e.target !== dialogo) return; e.preventDefault(); intentarCerrar(); });
    dialogo.addEventListener("toggle", (e) => {
      if (!lote) return;
      if (e.target.id === "imp-ajustes") lote.ajustesAbiertos = e.target.open;
      if (e.target.id === "imp-perfiles") lote.perfilesAbierto = e.target.open;
      // «Cambiar destino» del reparto: uno abierto a la vez.
      if (e.target.classList?.contains("importador-reparto-cambiar")) {
        const r = reparto();
        if (e.target.open) {
          r.abierto = e.target.dataset.item;
          document.querySelectorAll("#imp-reparto .importador-reparto-cambiar[open]").forEach((d) => { if (d !== e.target) d.open = false; });
        } else if (r.abierto === e.target.dataset.item) r.abierto = null;
      }
    }, true);
    // Al ocultar o cerrar la pestaña se guarda ya lo pendiente (sin esperar a la pausa de escritura).
    const vaciar = () => { if (lote && meta(lote).sucio && persistencia.estado !== "desconectado") guardarBorrador(); };
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") vaciar(); });
    window.addEventListener("pagehide", vaciar);
    // Solo se avisa si algo podría perderse: sin almacenamiento local o con cambios aún sin guardar en él.
    window.addEventListener("beforeunload", (e) => {
      if (!hayPendiente()) return;
      const alDia = almacenOk && persistencia.estado === "guardado" && !meta(lote).sucio;
      if (alDia) return;
      vaciar();
      e.preventDefault();
      e.returnValue = "";
    });
    almacen()?.escuchar(alMensaje);
  }

  window.GamaTallaImportador = Object.freeze({ abrir, alPerderAcceso, abierto: () => Boolean($("#importador")?.open) });
  document.addEventListener("DOMContentLoaded", preparar);
})();
