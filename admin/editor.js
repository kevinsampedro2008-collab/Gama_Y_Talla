/* Panel privado de Gama & Talla · etapa 16: editor del catálogo.
 *
 * Crear y editar una zapatilla con sus colores, precios, tallas y fotos, y publicarla,
 * ocultarla, retirarla o restaurarla. Usa la sesión, el acceso y la recarga de admin.js
 * (window.GamaTallaPanel) y el procesado de fotos de fotos.js (window.GamaTallaFotos).
 *
 * Garantías
 *  - Un guardado es UNA llamada a fn_admin_guardar_producto: producto, colores, tallas y
 *    galería en una sola transacción. Si falla, no queda nada a medias.
 *  - Guardar nunca publica. «Guardar y publicar» guarda y, si se guardó, publica aparte: si la
 *    publicación se rechaza (falta una foto, por ejemplo), la zapatilla queda guardada y oculta.
 *  - Ninguna acción confirma disponibilidad ni renueva vigencias: una talla nueva nace «por
 *    revisar» y las existentes solo se desactivan o reactivan. Las confirmaciones siguen siendo
 *    las acciones de 15B del tablero.
 *  - Identificadores: el formulario genera los UUID de lo nuevo UNA vez y los conserva. Cada
 *    guardado lleva un identificador de operación aleatorio que se reutiliza al reintentar el
 *    mismo contenido: el servidor no aplica dos veces la misma operación ni crea duplicados.
 *  - Respuesta perdida: no se declara éxito ni fracaso sin pruebas. Se relee la zapatilla
 *    (solo lectura): si su «ultima_operacion» es la de este guardado, se aplicó (nadie más
 *    conoce ese valor); si no, el resultado sigue sin confirmar y se dice así.
 *  - Formularios desactualizados: el servidor compara la versión y la actualiza en la misma
 *    transacción. Si otra edición se guardó antes, no se sobrescribe nada.
 *  - Fotos: se suben a Storage antes de guardar, con nombres únicos (nada se sobrescribe). El
 *    guardado solo acepta archivos que ya están en Storage. Quitar o reemplazar una foto no
 *    borra su archivo: borrarlo es otra acción, con confirmación, que comprueba antes que
 *    ninguna galería lo usa y nunca se ofrece mientras haya un guardado sin confirmar.
 */
(() => {
  "use strict";

  const panel = () => window.GamaTallaPanel;
  const fotos = () => window.GamaTallaFotos;
  const $ = (selector, raiz = document) => raiz.querySelector(selector);
  const pesos = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
  const formatoPesos = (n) => pesos.format(n).replace(/ /g, " ");

  const LIM = { nombre: 120, marca: 60, categoria: 60, referencia: 60, descripcion: 2000, color: 60, precioMax: 100000000, colores: 20, tallas: 40 };
  // Etapa 16.2: códigos comerciales editables (misma regla que el servidor) y mayúsculas reales.
  const LIM_CODIGO = { producto: 30, color: 40 };
  const FORMATO_CODIGO = /^[A-Z0-9Ñ][A-Z0-9Ñ._/-]*[A-Z0-9Ñ]$/u;
  const mayus = (texto) => String(texto ?? "").toLocaleUpperCase("es");
  const codigoLimpio = (texto) => mayus(String(texto ?? "").trim());
  // ¿El servidor admite cambiar códigos (migración 20261108030000)? null = aún no se sabe.
  let codigosEditables = null;
  const ESTADO_GUARDADO = { CONFIRMADA: "confirmada", AGOTADA: "agotada", REVISAR: "por revisar" };
  const SEGMENTOS = [["", "Sin indicar (la guía muestra la tabla de hombre)"], ["hombre", "Hombre"], ["mujer", "Mujer"]];
  // 16.3: «publico» y «muestra_color» solo existen con la migración 20261108040000. Con un esquema
  // anterior se leen las columnas de siempre y esas opciones quedan bloqueadas (se avisa).
  let publicoYMuestras = null;   // null = aún no se sabe; true/false = el servidor los admite o no
  // Etapa 17: el público es obligatorio (Hombre, Dama o Unisex) al guardar y al publicar. Solo los
  // registros heredados pueden llegar sin él; el formulario pide clasificarlos.
  const PUBLICOS = [["hombre", "Hombre"], ["dama", "Dama"], ["unisex", "Unisex"]];
  const publicoValido = (valor) => PUBLICOS.some(([v]) => v === valor);
  const MENSAJE_PUBLICO = "Elige el público en la tienda: Hombre, Dama o Unisex.";
  const MUESTRA_HEX = /^#[0-9a-f]{6}$/i;
  const columnas = () => "id,codigo_interno,referencia_proveedor,nombre,marca,categoria,descripcion,segmento,destacado,nuevo_ingreso,activo,orden,version,ultima_operacion,retirado_en" +
    (publicoYMuestras === false ? "" : ",publico") +
    `,variantes(id,codigo_variante,color,referencia_variante,precio,precio_anterior,activa,orden${publicoYMuestras === false ? "" : ",muestra_color"},fotos(id,ruta,orden,alt))`;
  const faltaColumnaNueva = (error) => String(error?.code) === "42703" || /publico|muestra_color/.test(error?.message || "");

  let ed = null;          // estado del formulario abierto
  let borrador = null;    // formulario sin guardar conservado al perder la sesión
  let enCurso = false;    // un guardado o un cambio de estado en marcha
  let claves = 0;
  let origen = null;      // el botón que abrió el editor: recibe el foco al cerrarlo

  const nuevaClave = () => `f${++claves}`;
  const uuid = () => crypto.randomUUID();

  function nodo(etiqueta, clase, texto) {
    const n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto !== undefined && texto !== null) n.textContent = texto;
    return n;
  }
  function boton(texto, accion, clase = "boton boton-secundario boton-compacto", datos = {}) {
    const b = nodo("button", clase, texto);
    b.type = "button";
    b.dataset.editor = accion;
    Object.assign(b.dataset, datos);
    return b;
  }

  // ------------------------------------------------------------------ tallas
  // Misma gramática que el CHECK de la base: 40 · 40,5 · 40.5 · 40 1/3 (numerador < denominador).
  function racional(talla) {
    const m = /^([0-9]{1,3})(?:[.,]([0-9]{1,2})| ([0-9]{1,2})\/([0-9]{1,2}))?$/.exec(talla);
    if (!m) return null;
    const entero = Number(m[1]);
    if (m[2] !== undefined) return [entero * 100 + Number(m[2].padEnd(2, "0")), 100];
    if (m[3] !== undefined) {
      const n = Number(m[3]);
      const d = Number(m[4]);
      if (!(d > 0 && n < d)) return null;
      return [entero * d + n, d];
    }
    return [entero, 1];
  }
  const equivalentes = (a, b) => a[0] * b[1] === b[0] * a[1];

  // ------------------------------------------------------------- estado base
  function variantePorDefecto(orden) {
    return { id: uuid(), nueva: true, codigo: "", codigoGuardado: "", color: "", referencia: "", muestra: "", precio: "", precioAnterior: "", activa: true, orden, tallas: [], fotos: [], entradaTalla: "", errorTalla: "" };
  }

  function estadoNuevo() {
    return {
      modo: "crear", id: uuid(), codigo: "", version: null, activo: false, retirado: false,
      datos: { codigo_interno: "", publico: "", nombre: "", marca: "", categoria: "", referencia_proveedor: "", descripcion: "", segmento: "", destacado: false, nuevo_ingreso: false, orden: "0" },
      variantes: [variantePorDefecto(0)],
      operaciones: new Set(), pendiente: null, subidasSesion: new Set(), firmaGuardada: "", sinUsar: null
    };
  }

  function estadoDesdeServidor(p, tallas, anterior = null) {
    const porVariante = new Map();
    for (const t of tallas) {
      if (!porVariante.has(t.variante_id)) porVariante.set(t.variante_id, []);
      porVariante.get(t.variante_id).push(t);
    }
    const ordenTalla = (a, b) => panel().valorTalla(a.talla) - panel().valorTalla(b.talla) || a.talla.localeCompare(b.talla);
    const estado = {
      modo: "editar", id: p.id, codigo: p.codigo_interno, version: p.version, activo: p.activo, retirado: Boolean(p.retirado_en),
      datos: {
        codigo_interno: p.codigo_interno || "",
        publico: publicoValido(p.publico) ? p.publico : "",
        nombre: p.nombre || "", marca: p.marca || "", categoria: p.categoria || "", referencia_proveedor: p.referencia_proveedor || "",
        descripcion: p.descripcion || "", segmento: p.segmento || "", destacado: Boolean(p.destacado), nuevo_ingreso: Boolean(p.nuevo_ingreso),
        orden: String(p.orden ?? 0)
      },
      variantes: [...(p.variantes || [])]
        .sort((a, b) => a.orden - b.orden || a.codigo_variante.localeCompare(b.codigo_variante))
        .map((v) => ({
          id: v.id, nueva: false, codigo: v.codigo_variante, codigoGuardado: v.codigo_variante, color: v.color || "", referencia: v.referencia_variante || "",
          muestra: typeof v.muestra_color === "string" ? v.muestra_color : "",
          precio: String(v.precio ?? 0), precioAnterior: v.precio_anterior ? String(v.precio_anterior) : "", activa: v.activa, orden: v.orden,
          tallas: (porVariante.get(v.id) || []).sort(ordenTalla).map((t) => ({ id: t.id, talla: t.talla, activa: t.activa, activaGuardada: t.activa, nueva: false, estado: t.estado })),
          fotos: [...(v.fotos || [])].sort((a, b) => a.orden - b.orden).map((f) => ({ clave: nuevaClave(), ruta: f.ruta, alt: f.alt || "", estado: "guardada" })),
          entradaTalla: "", errorTalla: ""
        })),
      operaciones: anterior?.operaciones || new Set(), pendiente: null, subidasSesion: anterior?.subidasSesion || new Set(), firmaGuardada: "", sinUsar: null
    };
    estado.firmaGuardada = firma(estado);
    return estado;
  }

  async function leerProducto(id) {
    const c = panel().cliente();
    try {
      let r = await c.from("productos").select(columnas()).eq("id", id).maybeSingle();
      if (r.error && publicoYMuestras !== false && faltaColumnaNueva(r.error)) {
        publicoYMuestras = false;
        r = await c.from("productos").select(columnas()).eq("id", id).maybeSingle();
      }
      if (r.error) return { error: r.error };
      if (!r.data) return { data: null };
      const ids = (r.data.variantes || []).map((v) => v.id);
      let tallas = [];
      if (ids.length) {
        const t = await c.rpc("fn_admin_tallas").select("id,variante_id,talla,activa,estado").in("variante_id", ids);
        if (t.error) return { error: t.error };
        tallas = t.data || [];
      }
      return { data: r.data, tallas };
    } catch {
      return { error: { status: 0 } };
    }
  }

  // ------------------------------------------------------- datos del formulario
  const entero = (texto) => {
    const limpio = String(texto ?? "").replace(/[\s.$]/g, "");
    if (limpio === "") return 0;
    return /^[0-9]+$/.test(limpio) ? Number(limpio) : NaN;
  };

  // Modelo, marca, categoría y color van en MAYÚSCULAS (el servidor también lo hace). Los códigos,
  // en mayúsculas y sin espacios exteriores: vacío al crear = automático.
  function datosParaGuardar(e = ed) {
    const d = e.datos;
    return {
      id: e.id,
      codigo_interno: codigoLimpio(d.codigo_interno),
      publico: publicoValido(d.publico) ? d.publico : null,
      nombre: mayus(d.nombre.trim()), marca: mayus(d.marca.trim()), categoria: mayus(d.categoria.trim()),
      referencia_proveedor: d.referencia_proveedor.trim() || null, descripcion: d.descripcion.trim() || null,
      segmento: d.segmento || null, destacado: d.destacado, nuevo_ingreso: d.nuevo_ingreso,
      orden: Number.isInteger(Number(d.orden)) ? Number(d.orden) : 0,
      variantes: e.variantes.map((v) => ({
        id: v.id, codigo_variante: codigoLimpio(v.codigo), color: mayus(v.color.trim()), referencia_variante: v.referencia.trim() || null,
        muestra_color: v.muestra.trim() ? v.muestra.trim().toLowerCase() : null,
        precio: entero(v.precio), precio_anterior: entero(v.precioAnterior), activa: v.activa, orden: v.orden,
        // Las existentes llevan también cómo estaban al abrir el formulario: el servidor solo
        // aplica lo que se cambió aquí y conserva lo que cambió en otro lugar (por ejemplo, una
        // talla que una confirmación de 15B reactivó mientras se editaba).
        tallas: v.tallas.map((t) => (t.nueva ? { id: t.id, talla: t.talla, activa: t.activa }
          : { id: t.id, talla: t.talla, activa: t.activa, activa_original: t.activaGuardada })),
        fotos: v.fotos.filter((f) => f.ruta && (f.estado === "guardada" || f.estado === "subida")).map((f) => ({ ruta: f.ruta, alt: f.alt || null }))
      }))
    };
  }
  const firma = (e) => JSON.stringify(datosParaGuardar(e));
  const fotosEnCurso = (e = ed) => e.variantes.some((v) => v.fotos.some((f) => !["guardada", "subida"].includes(f.estado)));
  const sucio = (e = ed) => Boolean(e) && (firma(e) !== e.firmaGuardada || fotosEnCurso(e));

  function validar() {
    const errores = [];
    const d = ed.datos;
    const exigir = (ok, campo, mensaje) => { if (!ok) errores.push({ campo, mensaje }); };
    exigir(d.nombre.trim() && d.nombre.trim().length <= LIM.nombre, "ed-nombre", "Escribe el nombre del modelo (hasta 120 caracteres).");
    exigir(d.marca.trim() && d.marca.trim().length <= LIM.marca, "ed-marca", "Escribe la marca (hasta 60 caracteres).");
    exigir(d.categoria.trim() && d.categoria.trim().length <= LIM.categoria, "ed-categoria", "Escribe la categoría (hasta 60 caracteres).");
    exigir(d.referencia_proveedor.trim().length <= LIM.referencia, "ed-referencia", "La referencia admite hasta 60 caracteres.");
    // 17: sin público no se guarda (tampoco «Guardar oculta») ni se publica. Con un servidor anterior
    // a 16.3 la opción está bloqueada y el servidor no lo pide: no se exige.
    if (publicoYMuestras !== false) exigir(publicoValido(d.publico), "ed-publico-hombre", MENSAJE_PUBLICO);
    exigir(d.descripcion.trim().length <= LIM.descripcion, "ed-descripcion", "La descripción admite hasta 2000 caracteres.");
    exigir(/^-?[0-9]{1,6}$/.test(String(d.orden).trim() || "0"), "ed-orden", "El orden debe ser un número entero.");
    exigir(ed.variantes.length >= 1, "ed-agregar-color", "Agrega al menos un color.");
    // Códigos: los mismos límites que el servidor, y únicos (el servidor lo vuelve a comprobar).
    const otras = panel().productos().filter((p) => p.id !== ed.id);
    const codigoP = codigoLimpio(d.codigo_interno);
    if (codigosEditables !== false && (ed.modo === "editar" || codigoP)) {
      const usa = otras.find((p) => codigoLimpio(p.codigo_interno) === codigoP);
      if (!codigoP) exigir(false, "ed-codigo", "Escribe el código de la zapatilla: no puede quedar vacío.");
      else if (codigoP.length < 2 || codigoP.length > LIM_CODIGO.producto || !FORMATO_CODIGO.test(codigoP)) {
        exigir(false, "ed-codigo", `El código de la zapatilla debe tener entre 2 y ${LIM_CODIGO.producto} caracteres: letras, números y - _ . / (sin espacios).`);
      } else if (usa) exigir(false, "ed-codigo", `El código ${codigoP} ya lo usa la zapatilla «${usa.nombre}». Elige otro.`);
    }
    ed.variantes.forEach((v, i) => {
      const nombre = v.color.trim() || `el color ${i + 1}`;
      if (v.muestra.trim() && !MUESTRA_HEX.test(v.muestra.trim())) {
        exigir(false, `ed-v-${v.id}-muestra`, `La muestra de ${nombre} debe ser un color hexadecimal como #E8DCC8 (o quedar vacía).`);
      }
      const codigoV = codigoLimpio(v.codigo);
      if (codigosEditables !== false && (!v.nueva || codigoV)) {
        const campoCodigo = `ed-v-${v.id}-codigo`;
        const enOtra = otras.flatMap((p) => (p.variantes || []).map((x) => ({ ...x, producto: p.nombre })))
          .find((x) => codigoLimpio(x.codigo_variante) === codigoV);
        if (!codigoV) exigir(false, campoCodigo, `Escribe el código de ${nombre}: no puede quedar vacío.`);
        else if (codigoV.length < 2 || codigoV.length > LIM_CODIGO.color || !FORMATO_CODIGO.test(codigoV)) {
          exigir(false, campoCodigo, `El código de ${nombre} debe tener entre 2 y ${LIM_CODIGO.color} caracteres: letras, números y - _ . / (sin espacios).`);
        } else if (ed.variantes.some((o) => o !== v && codigoLimpio(o.codigo) === codigoV)) {
          exigir(false, campoCodigo, `Dos colores tienen el mismo código ${codigoV}.`);
        } else if (enOtra) exigir(false, campoCodigo, `El código ${codigoV} ya lo usa «${enOtra.producto} · ${enOtra.color}». Elige otro.`);
      }
      exigir(v.color.trim() && v.color.trim().length <= LIM.color, `ed-v-${v.id}-color`, `Escribe el nombre del color ${i + 1} (hasta 60 caracteres).`);
      const precio = entero(v.precio);
      const anterior = entero(v.precioAnterior);
      exigir(Number.isFinite(precio) && precio >= 0 && precio <= LIM.precioMax, `ed-v-${v.id}-precio`, `El precio de ${nombre} debe ser un número entero de pesos (0 = precio por confirmar).`);
      exigir(Number.isFinite(anterior) && anterior >= 0 && anterior <= LIM.precioMax, `ed-v-${v.id}-anterior`, `El precio anterior de ${nombre} debe ser un número entero de pesos.`);
      if (Number.isFinite(precio) && Number.isFinite(anterior) && anterior > 0) {
        exigir(precio > 0 && anterior > precio, `ed-v-${v.id}-anterior`, `En ${nombre}, el precio anterior debe ser mayor que el actual, y el actual no puede ser 0.`);
      }
      exigir(v.tallas.length <= LIM.tallas, `ed-v-${v.id}-talla`, `${nombre}: como mucho ${LIM.tallas} tallas.`);
      exigir(v.fotos.length <= fotos().LIMITES.fotosPorColor, `ed-v-${v.id}-fotos`, `${nombre}: como mucho ${fotos().LIMITES.fotosPorColor} fotos.`);
    });
    if (fotosEnCurso()) {
      const conError = ed.variantes.some((v) => v.fotos.some((f) => f.estado === "error"));
      errores.push({ campo: null, mensaje: conError
        ? "Hay fotos que no se pudieron subir. Reintenta su subida o quítalas antes de guardar."
        : "Espera a que terminen de subirse las fotos." });
    }
    return errores;
  }

  // ------------------------------------------------------------------ pintar
  function pintarCabecera() {
    $("#editor-codigo").textContent = ed.modo === "crear" ? "Sin código todavía: se asigna al guardar" : ed.codigo;
    $("#editor-titulo").textContent = ed.modo === "crear" ? "Nueva zapatilla" : (ed.datos.nombre.trim() || "Zapatilla sin nombre");
    const estado = $("#editor-estado");
    estado.className = `editor-estado ${ed.retirado ? "es-retirado" : ed.activo ? "es-publicado" : "es-oculto"}`;
    estado.textContent = ed.modo === "crear" ? "Se guardará oculta en la tienda"
      : ed.retirado ? "Retirada del catálogo (oculta; se conserva todo)" : ed.activo ? "Publicada en la tienda" : "Oculta en la tienda";
    const acciones = $("#editor-acciones-estado");
    acciones.replaceChildren();
    if (ed.modo === "editar") {
      if (ed.retirado) acciones.append(boton("Restaurar", "estado", undefined, { estado: "restaurar" }));
      else {
        if (ed.activo) acciones.append(boton("Ocultar de la tienda", "estado", undefined, { estado: "ocultar" }));
        acciones.append(boton("Retirar del catálogo", "pedir-retiro", "boton boton-texto boton-compacto"));
      }
    }
    pintarBotones();
  }

  // Solo cambia lo que cambia: reescribir el texto o el estado de un botón mientras se pulsa
  // (el campo que pierde el foco dispara «change» entre mousedown y mouseup) hace que WebKit
  // descarte el clic.
  const poner = (n, propiedad, valor) => { if (n && n[propiedad] !== valor) n[propiedad] = valor; };
  function pintarBotones() {
    if (!ed) return;
    const cambios = sucio();
    poner($("#editor-guardar"), "textContent", ed.modo === "crear" ? "Guardar oculta" : "Guardar cambios");
    const publicar = $("#editor-publicar");
    poner(publicar, "hidden", ed.retirado || (ed.modo === "editar" && ed.activo));
    poner(publicar, "textContent", ed.modo === "editar" && !cambios ? "Publicar" : "Guardar y publicar");
    poner($('[data-editor="cancelar"]'), "textContent", cambios ? "Cancelar" : "Cerrar");
    document.querySelectorAll("#editor button, #editor input, #editor select, #editor textarea").forEach((n) => {
      if (n.closest("#editor-salida")) return;
      poner(n, "disabled", (enCurso && !n.matches('[data-editor="cerrar-forzado"]')) || n.dataset.bloqueado === "1");
    });
  }

  function campo({ id, etiqueta, valor = "", tipo = "text", ayuda = "", lista = "", max = 0, modo = "", obligatorio = false, datos = {}, mayusculas = false }) {
    const caja = nodo("div", "campo");
    const label = nodo("label", "", etiqueta);
    label.htmlFor = id;
    if (obligatorio) label.append(nodo("span", "campo-obligatorio", " (obligatorio)"));
    const entrada = tipo === "textarea" ? nodo("textarea") : nodo("input");
    if (tipo !== "textarea") entrada.type = tipo;
    entrada.id = id;
    entrada.value = valor;
    if (max) entrada.maxLength = max;
    if (modo) entrada.inputMode = modo;
    if (lista) entrada.setAttribute("list", lista);
    entrada.autocomplete = "off";
    // Mayúsculas visibles al escribir (sin mover el cursor); el valor se normaliza al salir del
    // campo y antes de guardar.
    if (mayusculas) entrada.classList.add("campo-mayus");
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

  function casilla(id, texto, marcado, datos = {}) {
    const caja = nodo("label", "casilla");
    const entrada = nodo("input");
    entrada.type = "checkbox";
    entrada.id = id;
    entrada.checked = marcado;
    Object.assign(entrada.dataset, datos);
    caja.append(entrada, nodo("span", "", texto));
    return caja;
  }

  function listaDatos(id, valores) {
    const lista = nodo("datalist");
    lista.id = id;
    for (const v of valores) { const o = nodo("option"); o.value = v; lista.append(o); }
    return lista;
  }

  function pintarTodo() {
    const cuerpo = $("#editor-cuerpo");
    const productos = panel().productos();
    const unicos = (campo) => [...new Set(productos.map((p) => p[campo]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));

    const modelo = nodo("section", "editor-seccion");
    modelo.setAttribute("aria-labelledby", "ed-modelo-titulo");
    const h = nodo("h3", "editor-seccion-titulo", "Datos del modelo");
    h.id = "ed-modelo-titulo";
    const d = ed.datos;
    const fila1 = nodo("div", "campos-fila");
    fila1.append(
      campo({ id: "ed-nombre", etiqueta: "Modelo", valor: d.nombre, max: LIM.nombre, obligatorio: true, mayusculas: true, datos: { campo: "nombre" } }),
      campo({ id: "ed-marca", etiqueta: "Marca", valor: d.marca, max: LIM.marca, lista: "ed-marcas", obligatorio: true, mayusculas: true, datos: { campo: "marca" } }));
    const fila2 = nodo("div", "campos-fila");
    fila2.append(
      campo({ id: "ed-categoria", etiqueta: "Categoría", valor: d.categoria, max: LIM.categoria, lista: "ed-categorias", obligatorio: true, mayusculas: true, ayuda: "Por ejemplo: RUNNING, URBANAS, CASUALES. Se guarda en mayúsculas.", datos: { campo: "categoria" } }),
      campoCodigoProducto());
    const fila3 = nodo("div", "campos-fila");
    fila3.append(
      campo({ id: "ed-referencia", etiqueta: "Referencia del proveedor", valor: d.referencia_proveedor, max: LIM.referencia, ayuda: "Para tu control: no se muestra al cliente. Puede repetirse en varias zapatillas; no es su código.", datos: { campo: "referencia_proveedor" } }));
    const avisoCodigos = nodo("p", "editor-nota editor-codigos-aviso", "Este servidor todavía no admite cambiar los códigos: falta aplicar la migración 20261108030000_codigos_editables_y_mayusculas. Puedes guardar lo demás; los códigos se mantienen.");
    avisoCodigos.id = "ed-codigos-aviso";
    avisoCodigos.setAttribute("role", "status");
    avisoCodigos.hidden = codigosEditables !== false;
    // Opciones en lugar de <select>: más cómodas al tacto (y el <select> de WebKit en Windows
    // inyecta un estilo interno que la política de seguridad de la página bloquea).
    const segmento = nodo("fieldset", "editor-opciones");
    segmento.append(nodo("legend", "", "Tabla de la guía de tallas"));
    const listaOpciones = nodo("div", "editor-opciones-lista");
    const opciones = [...SEGMENTOS];
    if (d.segmento && !opciones.some(([v]) => v === d.segmento)) opciones.push([d.segmento, `${d.segmento} (valor guardado)`]);
    opciones.forEach(([valor, texto], i) => {
      const caja = nodo("label", "casilla");
      const radio = nodo("input");
      radio.type = "radio";
      radio.name = "ed-segmento";
      radio.id = `ed-segmento-${i}`;
      radio.value = valor;
      radio.checked = d.segmento === valor;
      radio.dataset.campo = "segmento";
      caja.append(radio, nodo("span", "", texto));
      listaOpciones.append(caja);
    });
    segmento.append(listaOpciones);
    // 16.3 y 17: público de la tienda, obligatorio e independiente de la tabla de la guía de tallas.
    // Al crear no hay ninguna opción marcada: hay que elegir una. No se puede volver a «sin asignar».
    const publico = nodo("fieldset", "editor-opciones editor-publico");
    publico.id = "ed-publico";
    const leyenda = nodo("legend", "", "Público en la tienda");
    leyenda.append(nodo("span", "campo-obligatorio", " (obligatorio)"));
    publico.append(leyenda);
    const listaPublico = nodo("div", "editor-opciones-lista");
    PUBLICOS.forEach(([valor, texto]) => {
      const caja = nodo("label", "casilla");
      const radio = nodo("input");
      radio.type = "radio";
      radio.name = "ed-publico";
      radio.id = `ed-publico-${valor}`;
      radio.value = valor;
      radio.checked = d.publico === valor;
      radio.required = publicoYMuestras !== false;
      radio.dataset.campo = "publico";
      radio.dataset.opcionNueva = "";
      if (publicoYMuestras === false) radio.dataset.bloqueado = "1";
      caja.append(radio, nodo("span", "", texto));
      listaPublico.append(caja);
    });
    const ayudaPublico = nodo("p", "campo-ayuda", "En la tienda se muestra como «Caballero», «Dama» o «Unisex», y en su filtro. No cambia la tabla de la guía de tallas.");
    ayudaPublico.id = "ed-publico-ayuda";
    // Registro heredado sin clasificar: se pide elegirlo para guardarlo o publicarlo.
    const pendientePublico = nodo("p", "editor-nota editor-publico-pendiente", "Esta zapatilla todavía no tiene público (es un registro anterior). Elígelo para poder guardarla o publicarla.");
    pendientePublico.id = "ed-publico-pendiente";
    pendientePublico.hidden = !(ed.modo === "editar" && !publicoValido(d.publico) && publicoYMuestras !== false);
    const errorPublico = nodo("p", "campo-error editor-publico-error", "");
    errorPublico.id = "ed-publico-error";
    errorPublico.hidden = true;
    publico.setAttribute("aria-describedby", `${ayudaPublico.id} ${pendientePublico.id} ${errorPublico.id}`);
    publico.append(listaPublico, errorPublico, ayudaPublico, pendientePublico);
    const avisoPublico = nodo("p", "editor-nota editor-codigos-aviso", "Este servidor todavía no admite el público ni las muestras de color: falta aplicar la migración 20261108040000_publico_y_muestras. Puedes guardar lo demás; esas opciones no se guardarán.");
    avisoPublico.id = "ed-publico-aviso";
    avisoPublico.setAttribute("role", "status");
    avisoPublico.hidden = publicoYMuestras !== false;
    // El orden va en su propia fila: junto a las opciones de la guía quedaba descolocado.
    const orden = campo({ id: "ed-orden", etiqueta: "Orden en el catálogo", valor: d.orden, tipo: "text", modo: "numeric", ayuda: "Los números más bajos aparecen primero.", datos: { campo: "orden" } });
    orden.classList.add("editor-orden");
    const marcas = nodo("div", "casillas");
    marcas.append(casilla("ed-destacado", "Destacada", d.destacado, { campo: "destacado" }), casilla("ed-nuevo", "Nuevo ingreso", d.nuevo_ingreso, { campo: "nuevo_ingreso" }));
    modelo.append(h, avisoCodigos, avisoPublico, fila1, fila2, fila3, publico, segmento, orden,
      campo({ id: "ed-descripcion", etiqueta: "Descripción (opcional)", valor: d.descripcion, tipo: "textarea", max: LIM.descripcion, ayuda: "Solo información real del modelo. La tienda la muestra en «Sobre este modelo».", datos: { campo: "descripcion" } }),
      marcas, listaDatos("ed-marcas", unicos("marca")), listaDatos("ed-categorias", unicos("categoria")));

    const colores = nodo("section", "editor-seccion");
    colores.setAttribute("aria-labelledby", "ed-colores-titulo");
    const hc = nodo("h3", "editor-seccion-titulo", "Colores, precios, tallas y fotos");
    hc.id = "ed-colores-titulo";
    const nota = nodo("p", "editor-nota", "Las tallas nuevas quedan «por revisar». Para confirmar disponibilidad usa las acciones del tablero («Confirmó el proveedor» o «Nueva publicación»): guardar aquí no confirma ni renueva nada.");
    const lista = nodo("ol", "editor-variantes");
    lista.id = "ed-variantes";
    for (const v of ed.variantes) lista.append(pintarVariante(v));
    const agregar = boton("Agregar color", "agregar-color");
    agregar.id = "ed-agregar-color";
    colores.append(hc, nota, lista, agregar);

    cuerpo.replaceChildren(modelo, colores);
    if (ed.modo === "editar") cuerpo.append(pintarSinUsar());
    pintarCabecera();
  }

  function pintarVariante(v) {
    const i = ed.variantes.indexOf(v);
    const li = nodo("li", `editor-variante${v.activa ? "" : " es-inactiva"}`);
    li.id = `ed-v-${v.id}`;
    li.dataset.variante = v.id;
    const cabecera = nodo("div", "editor-variante-cabecera");
    const titulo = nodo("h4", "", v.color.trim() || `Color ${i + 1}`);
    titulo.id = `ed-v-${v.id}-titulo`;
    cabecera.append(titulo, nodo("span", "codigo codigo-suave", v.codigoGuardado || "nuevo"));
    if (v.nueva && ed.variantes.filter((x) => x.nueva).length && v.tallas.length === 0 && v.fotos.length === 0 && ed.variantes.length > 1) {
      cabecera.append(boton("Quitar este color", "quitar-color", "boton boton-texto boton-compacto", { variante: v.id }));
    }
    li.setAttribute("aria-labelledby", titulo.id);

    const filaA = nodo("div", "campos-fila");
    filaA.append(
      campo({ id: `ed-v-${v.id}-color`, etiqueta: "Color", valor: v.color, max: LIM.color, obligatorio: true, mayusculas: true, datos: { variante: v.id, vcampo: "color" } }),
      campoCodigoColor(v));
    const filaR = nodo("div", "campos-fila");
    filaR.append(campo({ id: `ed-v-${v.id}-referencia`, etiqueta: "Referencia del proveedor para este color (opcional)", valor: v.referencia, max: LIM.referencia,
      ayuda: "Dato del proveedor, solo informativo: no cambia el código del color ni es la referencia que ve el cliente.", datos: { variante: v.id, vcampo: "referencia" } }));
    const filaB = nodo("div", "campos-fila");
    filaB.append(
      campo({ id: `ed-v-${v.id}-precio`, etiqueta: "Precio actual (COP)", valor: v.precio, modo: "numeric", ayuda: textoPrecio(v), datos: { variante: v.id, vcampo: "precio" } }),
      campo({ id: `ed-v-${v.id}-anterior`, etiqueta: "Precio anterior (opcional)", valor: v.precioAnterior, modo: "numeric", ayuda: "Para mostrar un descuento: debe ser mayor que el actual.", datos: { variante: v.id, vcampo: "precioAnterior" } }));
    const visible = casilla(`ed-v-${v.id}-activa`, "Color visible en la tienda", v.activa, { variante: v.id, vcampo: "activa" });

    li.append(cabecera, filaA, filaR, campoMuestra(v), filaB, visible, pintarTallas(v), pintarFotos(v));
    return li;
  }

  /* Códigos comerciales (etapa 16.2). Son los que ve el cliente (el del color es la referencia de
     la ficha, el carrito y WhatsApp) y el tablero. Editables: el carrito y las fotos usan
     identificadores que no cambian. Al crear, vacío = automático (GT-…). */
  function campoDeCodigo({ id, etiqueta, valor, max, ayuda, nuevo, datos }) {
    const caja = campo({ id, etiqueta, valor, max, ayuda, mayusculas: true, datos: { ...datos, codigo: "" } });
    const entrada = $("input", caja);
    entrada.spellcheck = false;
    entrada.setAttribute("autocapitalize", "characters");
    if (nuevo) entrada.placeholder = "Automático (GT-…)";
    entrada.readOnly = codigosEditables === false;
    return caja;
  }
  function campoCodigoProducto() {
    const nuevo = ed.modo === "crear";
    return campoDeCodigo({ id: "ed-codigo", etiqueta: "Código de la zapatilla", valor: ed.datos.codigo_interno, max: LIM_CODIGO.producto, nuevo,
      ayuda: nuevo ? "Déjalo vacío para asignar uno automático, o escribe el tuyo. Debe ser único."
        : "Debe ser único. Cambiarlo no cambia los códigos de los colores ni afecta a los carritos guardados.",
      datos: { campo: "codigo_interno" } });
  }
  function campoCodigoColor(v) {
    return campoDeCodigo({ id: `ed-v-${v.id}-codigo`, etiqueta: "Código del color", valor: v.codigo, max: LIM_CODIGO.color, nuevo: v.nueva,
      ayuda: v.nueva ? "Vacío = automático (código de la zapatilla + letra). Es la referencia que ve el cliente."
        : "Es la referencia que ve el cliente en la ficha, el carrito y WhatsApp. Debe ser único.",
      datos: { variante: v.id, vcampo: "codigo" } });
  }

  /* 16.3: muestra del color (opcional). El campo de texto manda (#rrggbb o vacío); el selector de
     color solo ayuda a elegirlo. La vista previa usa el valor solo si es un hexadecimal válido. */
  function pintarVistaMuestra(vista, valor) {
    const valido = MUESTRA_HEX.test(String(valor || "").trim());
    vista.classList.toggle("es-neutra", !valido);
    if (valido) vista.style.setProperty("--muestra", valor.trim().toLowerCase());
    else vista.style.removeProperty("--muestra");
  }
  function campoMuestra(v) {
    const id = `ed-v-${v.id}-muestra`;
    const caja = nodo("div", "campo editor-muestra");
    const label = nodo("label", "", "Muestra del color (opcional)");
    label.htmlFor = id;
    const fila = nodo("div", "editor-muestra-fila");
    const vista = nodo("span", "editor-muestra-vista");
    vista.id = `${id}-vista`;
    vista.setAttribute("aria-hidden", "true");
    pintarVistaMuestra(vista, v.muestra);
    const texto = nodo("input");
    texto.type = "text";
    texto.id = id;
    texto.value = v.muestra;
    texto.maxLength = 7;
    texto.placeholder = "#E8DCC8";
    texto.autocomplete = "off";
    texto.spellcheck = false;
    texto.setAttribute("autocapitalize", "off");
    Object.assign(texto.dataset, { variante: v.id, vcampo: "muestra", opcionNueva: "" });
    texto.readOnly = publicoYMuestras === false;
    const selector = nodo("input");
    selector.type = "color";
    selector.id = `${id}-selector`;
    selector.value = MUESTRA_HEX.test(v.muestra) ? v.muestra.toLowerCase() : "#d9d9d4";
    selector.setAttribute("aria-label", `Elegir la muestra de ${v.color.trim() || "este color"}`);
    Object.assign(selector.dataset, { variante: v.id, vselector: "muestra", opcionNueva: "" });
    if (publicoYMuestras === false) selector.dataset.bloqueado = "1";
    const quitar = boton("Quitar", "quitar-muestra", "boton boton-texto boton-mini", { variante: v.id });
    quitar.id = `${id}-quitar`;
    quitar.hidden = !v.muestra || publicoYMuestras === false;
    quitar.setAttribute("aria-label", `Quitar la muestra de ${v.color.trim() || "este color"}`);
    fila.append(vista, texto, selector, quitar);
    const ayuda = nodo("p", "campo-ayuda", "Color del círculo que verá el cliente, útil para nombres como «BEIGE/BLANCAS». Vacía: un nombre simple usa la paleta de la tienda y uno compuesto, un círculo neutro.");
    ayuda.id = `${id}-ayuda`;
    texto.setAttribute("aria-describedby", ayuda.id);
    caja.append(label, fila, ayuda);
    return caja;
  }

  async function comprobarPublicoYMuestras() {
    if (publicoYMuestras !== null) return;
    try {
      const r = await panel().cliente().from("productos").select("publico").limit(1);
      if (!r.error) publicoYMuestras = true;
      else if (faltaColumnaNueva(r.error)) publicoYMuestras = false;
    } catch { /* sin conexión: se sabrá al guardar */ }
  }
  // Con el esquema anterior, público y muestras quedan bloqueados y se avisa: el servidor los
  // ignoraría y el panel no puede presentarlos como guardados.
  function aplicarCapacidadPublico() {
    if (!ed) return;
    const antiguo = publicoYMuestras === false;
    document.querySelectorAll("#editor [data-opcion-nueva]").forEach((n) => {
      n.dataset.bloqueado = antiguo ? "1" : "";
      if (n.type === "text") n.readOnly = antiguo;
    });
    const aviso = $("#ed-publico-aviso");
    if (aviso) aviso.hidden = !antiguo;
    if (antiguo) {
      document.querySelectorAll('#editor [data-editor="quitar-muestra"]').forEach((b) => { b.hidden = true; });
      document.querySelectorAll('#editor input[name="ed-publico"]').forEach((r) => { r.required = false; });
      const pendiente = $("#ed-publico-pendiente");
      if (pendiente) pendiente.hidden = true;
      errorPublicoVisible("");
    }
    pintarBotones();
  }

  async function comprobarCodigosEditables() {
    if (codigosEditables !== null) return;
    try {
      const r = await panel().cliente().from("productos").select("clave_catalogo").limit(1);
      if (!r.error) codigosEditables = true;
      else if (String(r.error.code) === "42703" || /clave_catalogo/.test(r.error.message || "")) codigosEditables = false;
    } catch { /* sin conexión: se sabrá al guardar */ }
  }
  // Con el esquema anterior los códigos quedan de solo lectura y con su valor guardado: el RPC
  // antiguo los ignoraría y el panel no puede presentar ese cambio como guardado.
  function aplicarCapacidadCodigos() {
    if (!ed) return;
    const antiguo = codigosEditables === false;
    if (antiguo) {
      ed.datos.codigo_interno = ed.codigo || "";
      for (const v of ed.variantes) v.codigo = v.codigoGuardado || "";
    }
    document.querySelectorAll("#editor input[data-codigo]").forEach((n) => {
      n.readOnly = antiguo;
      if (antiguo) n.value = n.dataset.campo ? ed.datos.codigo_interno : (varianteDe(n.dataset.variante)?.codigo || "");
    });
    const aviso = $("#ed-codigos-aviso");
    if (aviso) aviso.hidden = !antiguo;
    pintarBotones();
  }

  function textoPrecio(v) {
    const n = entero(v.precio);
    if (!Number.isFinite(n)) return "Solo números, sin puntos ni símbolos.";
    return n === 0 ? "0 = «Precio por confirmar» en la tienda." : `Se mostrará como ${formatoPesos(n)}.`;
  }

  function pintarTallas(v) {
    const caja = nodo("fieldset", "editor-tallas");
    caja.id = `ed-v-${v.id}-tallas`;
    caja.append(nodo("legend", "", "Tallas EU"));
    const lista = nodo("ul", "editor-tallas-lista");
    if (!v.tallas.length) lista.append(nodo("li", "editor-vacio", "Todavía no hay tallas."));
    for (const t of v.tallas) {
      const item = nodo("li", `editor-talla${t.activa ? "" : " es-inactiva"}`);
      item.append(nodo("span", "editor-talla-valor", t.talla));
      const detalle = t.nueva ? "nueva · por revisar" : `${ESTADO_GUARDADO[t.estado] || t.estado}${t.activa ? "" : " · desactivada"}`;
      item.append(nodo("span", "editor-talla-estado", detalle));
      if (t.nueva) item.append(boton("Quitar", "quitar-talla", "boton boton-texto boton-mini", { variante: v.id, talla: t.id, etiqueta: `Quitar la talla nueva ${t.talla}` }));
      else item.append(boton(t.activa ? "Desactivar" : "Reactivar", "alternar-talla", "boton boton-texto boton-mini", { variante: v.id, talla: t.id }));
      item.lastChild.setAttribute("aria-label", t.nueva ? `Quitar la talla nueva ${t.talla}` : `${t.activa ? "Desactivar" : "Reactivar"} la talla ${t.talla}`);
      lista.append(item);
    }
    const entrada = nodo("div", "editor-talla-nueva");
    const c = campo({ id: `ed-v-${v.id}-talla`, etiqueta: "Añadir talla", valor: v.entradaTalla, ayuda: "Una por vez: 40, 40,5 o 40 1/3. Varias a la vez, separadas por punto y coma (38; 39; 40).", datos: { variante: v.id, vcampo: "entradaTalla" } });
    const input = $("input", c);
    input.dataset.agregarTalla = v.id;
    if (v.errorTalla) {
      input.setAttribute("aria-invalid", "true");
      const error = nodo("p", "campo-error", v.errorTalla);
      error.id = `ed-v-${v.id}-talla-error`;
      input.setAttribute("aria-describedby", `${error.id} ${input.getAttribute("aria-describedby")}`);
      c.append(error);
    }
    entrada.append(c, boton("Añadir", "agregar-talla", "boton boton-secundario boton-compacto", { variante: v.id }));
    caja.append(lista, entrada);
    return caja;
  }

  function pintarFotos(v) {
    const caja = nodo("fieldset", "editor-fotos");
    caja.id = `ed-v-${v.id}-fotos`;
    caja.append(nodo("legend", "", "Fotos de este color"));
    const L = fotos().LIMITES;
    caja.append(nodo("p", "campo-ayuda", `La primera es la principal. JPEG, PNG o WebP de hasta ${fotos().peso(L.bytesEntradaMax)}; se publican en WebP de hasta ${L.ladoMaximo} px, sin recortes. Hasta ${L.fotosPorColor} por color.`));
    const lista = nodo("ol", "editor-fotos-lista");
    if (!v.fotos.length) lista.append(nodo("li", "editor-vacio", "Todavía no hay fotos."));
    v.fotos.forEach((f, i) => lista.append(pintarFoto(v, f, i)));
    const subir = nodo("label", "boton boton-secundario boton-compacto editor-subir");
    const input = nodo("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/webp,image/jpeg,image/png";
    input.className = "solo-lectores";
    input.id = `ed-v-${v.id}-archivo`;
    input.dataset.archivos = v.id;
    subir.htmlFor = input.id;
    subir.append(nodo("span", "", "Añadir fotos"), input);
    caja.append(lista, subir);
    return caja;
  }

  function pintarFoto(v, f, i) {
    const item = nodo("li", `editor-foto es-${f.estado}`);
    item.dataset.clave = f.clave;
    const marco = nodo("div", "editor-foto-marco");
    const src = f.vistaPrevia || (f.ruta ? urlImagen(f.ruta) : null);
    if (src) {
      const img = nodo("img");
      img.src = src;
      img.alt = `Foto ${i + 1} de ${v.color.trim() || "este color"}`;
      img.loading = "lazy";
      marco.append(img);
    }
    if (i === 0 && ["guardada", "subida"].includes(f.estado)) marco.append(nodo("span", "editor-foto-principal", "Principal"));
    item.append(marco);
    const info = nodo("div", "editor-foto-info");
    const estado = {
      guardada: "Guardada", subida: "Subida · se guardará con la zapatilla", procesando: "Optimizando…",
      subiendo: `Subiendo ${Math.round((f.progreso || 0) * 100)} %`, comprobando: "Comprobando si llegó…", error: "No se subió"
    }[f.estado];
    const linea = nodo("p", "editor-foto-estado", f.reemplaza ? `Reemplazo · ${estado}` : estado);
    linea.setAttribute("role", f.estado === "error" ? "alert" : "status");
    info.append(linea);
    if (f.estado === "subiendo") {
      const barra = nodo("progress", "editor-foto-progreso");
      barra.max = 1;
      barra.value = f.progreso || 0;
      barra.setAttribute("aria-label", `Progreso de subida de la foto ${i + 1}`);
      info.append(barra);
    }
    if (f.info) {
      const p = f.info;
      info.append(nodo("p", "editor-foto-peso", `${p.ancho}×${p.alto} px · ${fotos().peso(p.pesoOriginal)} → ${fotos().peso(p.pesoFinal)}${p.recomprimida ? "" : " (sin recomprimir)"}`));
      if (p.aviso) info.append(nodo("p", "editor-foto-aviso", p.aviso));
    }
    if (f.mensaje) info.append(nodo("p", "editor-foto-mensaje", f.mensaje));
    const acciones = nodo("div", "editor-foto-acciones");
    const datos = { variante: v.id, clave: f.clave };
    const listas = ["guardada", "subida"].includes(f.estado);
    if (listas && !f.reemplaza) {
      if (i > 0) acciones.append(boton("Hacer principal", "foto-principal", "boton boton-texto boton-mini", datos));
      if (i > 0) acciones.append(etiquetado(boton("←", "foto-antes", "boton boton-secundario boton-mini", datos), `Mover la foto ${i + 1} antes`));
      if (i < v.fotos.length - 1) acciones.append(etiquetado(boton("→", "foto-despues", "boton boton-secundario boton-mini", datos), `Mover la foto ${i + 1} después`));
      const reemplazo = nodo("label", "boton boton-texto boton-mini");
      const input = nodo("input");
      input.type = "file";
      input.accept = "image/webp,image/jpeg,image/png";
      input.className = "solo-lectores";
      input.id = `ed-reemplazo-${f.clave}`;
      input.dataset.reemplazar = f.clave;
      input.dataset.variante = v.id;
      reemplazo.htmlFor = input.id;
      reemplazo.append(nodo("span", "", "Reemplazar"), input);
      acciones.append(reemplazo);
    }
    if (f.estado === "error" && f.reintentable) acciones.append(boton("Reintentar subida", "foto-reintentar", "boton boton-secundario boton-mini", datos));
    if (!["procesando", "subiendo", "comprobando"].includes(f.estado)) {
      acciones.append(etiquetado(boton(f.estado === "error" || f.reemplaza ? "Descartar" : "Quitar de la galería", "foto-quitar", "boton boton-texto boton-mini", datos),
        f.estado === "error" || f.reemplaza ? `Descartar la foto ${i + 1}` : `Quitar la foto ${i + 1} de la galería (el archivo no se borra)`));
    }
    info.append(acciones);
    item.append(info);
    return item;
  }

  const etiquetado = (n, texto) => { n.setAttribute("aria-label", texto); return n; };

  function urlImagen(ruta) {
    try {
      const url = new URL(String(ruta), new URL("../", location.href));
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
    } catch { return null; }
  }

  function repintarVariante(v, enfocar = null) {
    const actual = document.getElementById(`ed-v-${v.id}`);
    if (actual) actual.replaceWith(pintarVariante(v));
    pintarBotones();
    if (enfocar) document.getElementById(enfocar)?.focus();
  }

  function repintarFotos(v, enfocarSelector = null) {
    const actual = document.getElementById(`ed-v-${v.id}-fotos`);
    if (actual) actual.replaceWith(pintarFotos(v));
    pintarBotones();
    if (enfocarSelector) $(enfocarSelector, document.getElementById(`ed-v-${v.id}-fotos`))?.focus();
  }

  // ----------------------------------------------------------------- mensajes
  function error(texto) {
    const caja = $("#editor-error");
    caja.textContent = texto;
    caja.hidden = !texto;
    if (texto) caja.focus();
  }

  // Un resultado con acciones opcionales: [{ texto, accion, principal }]
  function resultado(texto, acciones = [], tipo = "info") {
    const caja = $("#editor-resultado");
    caja.className = `editor-resultado es-${tipo}`;
    caja.replaceChildren();
    if (!texto) return;
    caja.append(nodo("p", "", texto));
    if (acciones.length) {
      const fila = nodo("div", "editor-botones");
      for (const a of acciones) fila.append(boton(a.texto, a.accion, a.principal ? "boton boton-principal boton-compacto" : "boton boton-secundario boton-compacto", a.datos || {}));
      caja.append(fila);
    }
  }

  function marcarErrores(errores) {
    document.querySelectorAll("#editor [aria-invalid='true']").forEach((n) => { if (!n.dataset.agregarTalla) n.removeAttribute("aria-invalid"); });
    for (const e of errores) if (e.campo) document.getElementById(e.campo)?.setAttribute("aria-invalid", "true");
    errorPublicoVisible(errores.find((e) => e.campo === "ed-publico-hombre")?.mensaje || "");
  }

  // 17: el error del público se muestra también junto a su grupo (además del aviso del pie).
  function errorPublicoVisible(texto) {
    const caja = $("#ed-publico-error");
    const grupo = $("#ed-publico");
    if (!caja || !grupo) return;
    if (caja.textContent !== texto) caja.textContent = texto;
    caja.hidden = !texto;
    if (texto) grupo.setAttribute("aria-invalid", "true");
    else {
      grupo.removeAttribute("aria-invalid");
      grupo.querySelectorAll("input[aria-invalid]").forEach((r) => r.removeAttribute("aria-invalid"));
    }
  }

  // ------------------------------------------------------------ abrir y cerrar
  async function abrir(productoId, desdeBorrador = false, disparador = null) {
    if (ed || enCurso) return;
    const dialogo = $("#editor");
    // En Safari/WebKit pulsar un botón no le da el foco: quien abre lo indica.
    const activo = document.activeElement;
    origen = disparador instanceof HTMLElement ? disparador : (activo instanceof HTMLElement && activo !== document.body ? activo : null);
    if (desdeBorrador && borrador) {
      ed = borrador;
      borrador = null;
      quitarAvisoBorrador();
    } else if (productoId) {
      enCurso = true;
      origen?.setAttribute("aria-busy", "true");
      const leido = await leerProducto(productoId);
      origen?.removeAttribute("aria-busy");
      enCurso = false;
      if (leido.error || !leido.data) {
        panel().anunciar({ titulo: "No pudimos abrir la zapatilla", texto: leido.error ? "Revisa tu conexión e inténtalo de nuevo." : "Ya no existe en el catálogo.", lineas: [], tipo: "aviso" });
        return;
      }
      if (borrador && borrador.id === productoId) { borrador = null; quitarAvisoBorrador(); }
      ed = estadoDesdeServidor(leido.data, leido.tallas);
    } else {
      ed = estadoNuevo();
      ed.firmaGuardada = firma(ed);
    }
    error("");
    resultado("");
    $("#editor-salida").hidden = true;
    $("#editor-botones").hidden = false;
    pintarTodo();
    if (!dialogo.open) dialogo.showModal();
    $("#editor-titulo").focus();
    if (codigosEditables === null) comprobarCodigosEditables().then(aplicarCapacidadCodigos);
    if (publicoYMuestras === null) comprobarPublicoYMuestras().then(aplicarCapacidadPublico);
    else if (publicoYMuestras === false) aplicarCapacidadPublico();
    else if (codigosEditables === false) aplicarCapacidadCodigos();
  }

  function cerrar() {
    const dialogo = $("#editor");
    for (const v of ed?.variantes || []) for (const f of v.fotos) if (f.vistaPrevia && !f.conservarVista) URL.revokeObjectURL(f.vistaPrevia);
    ed = null;
    enCurso = false;
    if (dialogo.open) dialogo.close();
    $("#editor-cuerpo").replaceChildren();
    const destino = origen?.isConnected ? origen : document.querySelector("#boton-nuevo");
    origen = null;
    destino?.focus();
  }

  function intentarCerrar() {
    if (!ed) return;
    if (enCurso) { resultado("Espera a que termine la operación en curso."); return; }
    if (ed.pendiente) {
      resultado("Hay un guardado sin confirmar. Comprueba su resultado antes de cerrar: si cierras ahora, revisa la zapatilla en el tablero.", [
        { texto: "Comprobar el resultado", accion: "comprobar", principal: true },
        { texto: "Cerrar de todas formas", accion: "cerrar-forzado" }
      ], "aviso");
      return;
    }
    if (!sucio()) { cerrar(); return; }
    const sinGuardar = [...ed.subidasSesion].filter((o) => !fotoGuardadaEnFormulario(o)).length;
    $("#editor-salida-texto").textContent = `Tienes cambios sin guardar. ¿Quieres descartarlos?${sinGuardar ? ` ${sinGuardar === 1 ? "Una foto subida quedará" : `${sinGuardar} fotos subidas quedarán`} como archivo sin usar; puedes borrarla${sinGuardar === 1 ? "" : "s"} después desde «Archivos sin usar».` : ""}`;
    $("#editor-salida").hidden = false;
    $("#editor-botones").hidden = true;
    $('[data-editor="seguir"]').focus();
  }

  function fotoGuardadaEnFormulario(objeto) {
    return ed.variantes.some((v) => v.fotos.some((f) => f.estado === "guardada" && fotos().objetoDe(f.ruta) === objeto));
  }

  // admin.js lo llama al perder la sesión o el acceso: lo no guardado se conserva en memoria.
  function alPerderAcceso() {
    if (!ed) return;
    if (sucio() || ed.pendiente) {
      borrador = ed;
      for (const v of borrador.variantes) for (const f of v.fotos) f.conservarVista = true;
    }
    cerrar();
  }

  // Tras volver a entrar, el tablero ofrece recuperar el formulario.
  function ofrecerBorrador() {
    if (!borrador || ed || document.getElementById("editor-borrador")) return;
    const aviso = nodo("div", "editor-borrador");
    aviso.id = "editor-borrador";
    aviso.setAttribute("role", "status");
    aviso.append(nodo("p", "", `Tienes un formulario sin guardar de «${borrador.datos.nombre.trim() || "una zapatilla nueva"}». ${borrador.pendiente ? "Su último guardado quedó sin confirmar." : ""}`.trim()));
    const fila = nodo("div", "editor-botones");
    fila.append(boton("Volver al formulario", "recuperar", "boton boton-principal boton-compacto"), boton("Descartarlo", "descartar-borrador"));
    aviso.append(fila);
    $(".tablero-cabecera")?.after(aviso);
  }
  function quitarAvisoBorrador() { document.getElementById("editor-borrador")?.remove(); }

  // ---------------------------------------------------------------- guardar
  async function guardar({ publicar = false, reintento = false } = {}) {
    if (!ed || enCurso) return;
    error("");
    const errores = validar();
    marcarErrores(errores);
    if (errores.length) {
      error(errores.map((e) => e.mensaje).join(" "));
      const primero = errores.find((e) => e.campo);
      if (primero) document.getElementById(primero.campo)?.focus();
      return;
    }
    // Sin cambios y oculta: «Publicar» no necesita guardar nada.
    if (publicar && ed.modo === "editar" && !sucio() && !ed.pendiente) { await cambiarEstado("publicar"); return; }

    const datos = datosParaGuardar();
    // Con el esquema anterior no se envían códigos: el servidor los ignoraría.
    if (codigosEditables === false) {
      delete datos.codigo_interno;
      for (const v of datos.variantes) delete v.codigo_variante;
    }
    if (publicoYMuestras === false) {
      delete datos.publico;
      for (const v of datos.variantes) delete v.muestra_color;
    }
    const huella = JSON.stringify(datos);
    // La misma operación para el mismo contenido: reintentar no aplica nada dos veces.
    if (!ed.pendiente || ed.pendiente.huella !== huella || ed.pendiente.version !== ed.version || ed.pendiente.tipo !== "guardar") {
      if (reintento) { resultado("El formulario cambió desde el guardado sin confirmar. Comprueba primero su resultado.", [{ texto: "Comprobar el resultado", accion: "comprobar", principal: true }], "aviso"); return; }
      ed.pendiente = { tipo: "guardar", operacion: uuid(), huella, version: ed.version, crear: ed.modo === "crear", publicar };
    }
    ed.pendiente.publicar = publicar;
    ed.pendiente.codigos = codigosPedidos(datos);
    ed.pendiente.extras = "publico" in datos
      ? { publico: datos.publico, muestras: Object.fromEntries(datos.variantes.map((v) => [v.id, v.muestra_color ?? null])) }
      : null;
    ed.operaciones.add(ed.pendiente.operacion);
    const op = ed.pendiente;

    enCurso = true;
    pintarBotones();
    resultado(ed.modo === "crear" ? "Guardando la zapatilla…" : "Guardando los cambios…");
    try {
      const acceso = await panel().comprobarAcceso();
      if (!ed) return;
      if (acceso.estado !== "admin") {
        // Nada se envió: el formulario se conserva y se pide volver a entrar.
        if (acceso.estado === "red") { ed.pendiente = null; resultado("No pudimos comprobar tu sesión. Revisa tu conexión; tus datos siguen en el formulario.", [], "aviso"); return; }
        ed.pendiente = null;
        enCurso = false;
        await panel().aplicarAcceso(acceso);
        return;
      }
      let r;
      try {
        r = await panel().cliente().rpc("fn_admin_guardar_producto", { p_datos: datos, p_version: op.crear ? null : op.version, p_operacion: op.operacion });
      } catch { r = { error: { status: 0 } }; }
      if (!ed) return;
      await tratarRespuestaGuardado(r, op);
    } finally {
      enCurso = false;
      if (ed) pintarBotones();
    }
  }

  const tipoError = (r) => {
    const e = r.error || {};
    const estado = Number(r.status ?? e.status) || 0;
    const codigo = String(e.code || "");
    if (estado === 0 && !codigo) return "red";
    if (estado === 401 || /^PGRST30[0-3]$/.test(codigo)) return "sin-sesion";
    if (codigo === "42501" || estado === 403) return "sin-permiso";
    if (codigo === "PT409" || estado === 409) return "conflicto";
    if (codigo === "PT404") return "no-existe";
    if (codigo === "PT422" || ["23514", "22P02", "23505", "22003"].includes(codigo) || estado === 400 || estado === 422) return "datos";
    if (estado >= 500) return "red";
    return "otro";
  };

  async function tratarRespuestaGuardado(r, op) {
    if (!r.error) {
      await confirmarGuardado(r.data, op);
      return;
    }
    const tipo = tipoError(r);
    if (tipo === "red") {
      resultado("Se perdió la respuesta del servidor. Comprobando qué ocurrió…", [], "aviso");
      await comprobar();
      return;
    }
    if (tipo === "conflicto") {
      let detalle = {};
      try { detalle = JSON.parse(r.error.details || "{}"); } catch { detalle = {}; }
      // Al crear: el identificador ya existe. Solo este formulario lo conoce, así que lo creó
      // un guardado anterior de este mismo formulario; se comprueba por su operación.
      if (op.crear && detalle.motivo === "existe") { await comprobar(); return; }
      ed.pendiente = null;
      resultado(`${r.error.message || "Otra edición se guardó antes."} No se cambió nada y tus datos siguen en el formulario. Para continuar, carga la versión actual (perderás lo que no se guardó).`,
        [{ texto: "Cargar la versión actual", accion: "recargar-actual", principal: true }], "aviso");
      return;
    }
    ed.pendiente = null;
    if (tipo === "datos") {
      const mensaje = String(r.error.message || "");
      // 17: un servidor sin la migración 20261109010000 rechaza «Unisex» con su regla anterior
      // («Hombre o Dama»). Nada se guardó y el formulario se conserva tal cual.
      if (op.extras?.publico === "unisex" && /Hombre o Dama/.test(mensaje)) {
        const texto = "Este servidor todavía no admite «Unisex»: falta aplicar la migración 20261109010000_publico_unisex.";
        errorPublicoVisible(texto);
        error(`${texto} No se guardó nada y tus datos siguen en el formulario. Elige Hombre o Dama, o vuelve a guardar cuando se aplique la migración.`);
        resultado("");
        return;
      }
      if (/Elige el público/.test(mensaje)) errorPublicoVisible(mensaje);
      error(`${mensaje || "El servidor rechazó los datos."} No se guardó nada; corrige y vuelve a guardar.`);
      resultado("");
      return;
    }
    if (tipo === "no-existe") { error("Esta zapatilla ya no existe en el servidor."); resultado(""); return; }
    if (tipo === "sin-sesion" || tipo === "sin-permiso") {
      resultado("");
      enCurso = false;
      await panel().aplicarAcceso(await panel().comprobarAcceso());
      return;
    }
    error("El servidor no pudo guardar. No se cambió nada; tus datos siguen en el formulario.");
    resultado("");
  }

  // Códigos que este guardado pidió (los vacíos al crear son automáticos y no cuentan).
  const codigosPedidos = (datos) => ({
    producto: datos.codigo_interno || "",
    colores: Object.fromEntries((datos.variantes || []).filter((v) => v.codigo_variante).map((v) => [v.id, v.codigo_variante]))
  });
  // Lo pedido que el servidor NO guardó (por ejemplo, un servidor con el esquema anterior).
  function codigosSinAplicar(pedidos, producto) {
    if (!pedidos || !producto) return [];
    const faltan = [];
    if (pedidos.producto && producto.codigo_interno !== pedidos.producto) faltan.push(`zapatilla ${pedidos.producto}`);
    for (const v of producto.variantes || []) {
      const pedido = pedidos.colores[v.id];
      if (pedido && v.codigo_variante !== pedido) faltan.push(`color ${pedido}`);
    }
    return faltan;
  }

  // ¿Se pidió un público o una muestra que el servidor no guardó? Con el esquema anterior las
  // columnas ni siquiera se leen: si se pidió algún valor, no se guardó.
  function extrasSinAplicar(pedidos, producto) {
    if (!pedidos || !producto) return false;
    const algoPedido = pedidos.publico !== null || Object.values(pedidos.muestras).some((m) => m !== null);
    if (!("publico" in producto)) return algoPedido;
    if ((producto.publico ?? null) !== pedidos.publico) return true;
    return (producto.variantes || []).some((v) => v.id in pedidos.muestras && (v.muestra_color ?? null) !== pedidos.muestras[v.id]);
  }

  async function confirmarGuardado(respuesta, op, comprobado = false) {
    const publicarDespues = op.publicar;
    ed.pendiente = null;
    ed.modo = "editar";
    ed.version = respuesta?.version ?? ed.version;
    ed.codigo = respuesta?.codigo_interno || ed.codigo;
    // Se relee del servidor: códigos asignados, estados de las tallas y la galería guardada.
    const leido = await leerProducto(ed.id);
    if (!ed) return;
    if (respuesta?.codigos_editables === true) codigosEditables = true;
    const sinAplicar = codigosSinAplicar(op.codigos, leido.data);
    if (sinAplicar.length) codigosEditables = false;
    if (respuesta?.publico_y_muestras === true) publicoYMuestras = true;
    const extrasSinGuardar = extrasSinAplicar(op.extras, leido.data);
    if (extrasSinGuardar) publicoYMuestras = false;
    if (leido.data) {
      const anterior = ed;
      ed = estadoDesdeServidor(leido.data, leido.tallas, anterior);
      for (const v of anterior.variantes) for (const f of v.fotos) if (f.vistaPrevia) URL.revokeObjectURL(f.vistaPrevia);
    } else {
      for (const v of ed.variantes) {
        v.nueva = false;
        for (const t of v.tallas) { t.nueva = false; t.activaGuardada = t.activa; }
        for (const f of v.fotos) if (f.estado === "subida") f.estado = "guardada";
      }
      ed.firmaGuardada = firma(ed);
    }
    pintarTodo();
    if (sinAplicar.length) aplicarCapacidadCodigos();
    if (extrasSinGuardar) aplicarCapacidadPublico();
    panel().recargar();
    const avisoCodigos = sinAplicar.length
      ? ` Atención: el código no cambió (${sinAplicar.join(", ")}). Este servidor todavía no admite editar códigos (falta aplicar la migración 20261108030000); lo demás sí se guardó.`
      : "";
    const avisoExtras = extrasSinGuardar
      ? " Atención: el público y las muestras de color no se guardaron. Este servidor todavía no los admite (falta aplicar la migración 20261108040000); lo demás sí se guardó."
      : "";
    const conservadas = (Array.isArray(respuesta?.tallas_conservadas) ? respuesta.tallas_conservadas : [])
      .map((t) => `La talla ${t.talla} de «${t.color}» cambió en otro lugar mientras editabas (se ${t.activa ? "reactivó" : "desactivó"}) y se conservó ese cambio.`);
    const base = [comprobado ? "Guardado (comprobado con el identificador de esta operación)." : respuesta?.estado === "ya_aplicada" ? "Ese guardado ya se había aplicado; no se repitió." : "Guardado.", ...conservadas].join(" ") + avisoCodigos + avisoExtras;
    if (publicarDespues && !ed.activo) {
      resultado(`${base} Publicando…`, [], "ok");
      enCurso = false;
      await cambiarEstado("publicar", { trasGuardar: base });
      return;
    }
    resultado(`${base} ${ed.activo ? "Los cambios ya se ven en la tienda." : "La zapatilla sigue oculta en la tienda."}`, [], avisoCodigos || avisoExtras ? "aviso" : "ok");
  }

  // Solo lectura: ¿se aplicó la operación pendiente?
  async function comprobar() {
    if (!ed?.pendiente) return;
    const op = ed.pendiente;
    let r;
    try {
      r = await panel().cliente().from("productos").select("id,version,ultima_operacion,activo,retirado_en").eq("id", ed.id).maybeSingle();
    } catch { r = { error: { status: 0 } }; }
    if (!ed) return;
    const acciones = [
      { texto: "Comprobar otra vez", accion: "comprobar" },
      { texto: op.tipo === "guardar" ? "Reintentar el guardado" : "Reintentar", accion: "reintentar", principal: true }
    ];
    const nota = " Reintentar usa la misma operación: si ya se aplicó, no se repite.";
    if (r.error) {
      resultado(`Resultado no confirmado. Tampoco pudimos leer el estado actual: revisa tu conexión. Tus datos siguen en el formulario.${nota}`, acciones, "aviso");
      return;
    }
    const actual = r.data;
    if (actual && actual.ultima_operacion === op.operacion) {
      if (op.tipo === "guardar") await confirmarGuardado({ version: actual.version, estado: "aplicada" }, op, true);
      else confirmarEstado({ version: actual.version, activo: actual.activo, retirado: Boolean(actual.retirado_en) }, op, true);
      return;
    }
    if (!actual) {
      resultado(`Resultado no confirmado. La zapatilla todavía no aparece en el servidor; el guardado podría seguir en camino.${nota}`, acciones, "aviso");
      return;
    }
    if (op.crear && ed.operaciones.has(actual.ultima_operacion)) {
      // La creó un guardado anterior de este formulario (con otro contenido): se sigue editando
      // sobre esa versión, con los datos actuales del formulario.
      ed.pendiente = null;
      ed.modo = "editar";
      ed.version = actual.version;
      pintarCabecera();
      resultado("La zapatilla ya se había creado con un guardado anterior de este formulario. Tus datos actuales siguen aquí: guárdalos para aplicarlos.", [], "aviso");
      return;
    }
    if (actual.version === op.version) {
      resultado(`Resultado no confirmado. La zapatilla sigue sin cambios por ahora; la operación todavía podría aplicarse.${nota}`, acciones, "aviso");
      return;
    }
    ed.pendiente = null;
    resultado("Resultado no confirmado. La zapatilla cambió después de abrirla, pero no por esta operación: otra edición se guardó. No sabemos si la tuya llegó antes. Carga la versión actual y revisa los datos antes de seguir.",
      [{ texto: "Cargar la versión actual", accion: "recargar-actual", principal: true }], "aviso");
  }

  async function reintentar() {
    if (!ed?.pendiente) return;
    if (ed.pendiente.tipo === "guardar") await guardar({ publicar: ed.pendiente.publicar, reintento: true });
    else await cambiarEstado(ed.pendiente.accion, { reintento: true });
  }

  async function recargarActual() {
    if (!ed || enCurso) return;
    const leido = await leerProducto(ed.id);
    if (!ed) return;
    if (leido.error || !leido.data) { error(leido.error ? "No pudimos leer la versión actual. Revisa tu conexión." : "La zapatilla ya no existe."); return; }
    ed = estadoDesdeServidor(leido.data, leido.tallas, ed);
    error("");
    pintarTodo();
    resultado("Se cargó la versión actual del servidor.", [], "ok");
  }

  // ------------------------------------------------- publicar, ocultar, retirar
  async function cambiarEstado(accion, { reintento = false, trasGuardar = "" } = {}) {
    if (!ed || enCurso || ed.modo !== "editar") return;
    if (!reintento || !ed.pendiente || ed.pendiente.tipo !== "estado" || ed.pendiente.accion !== accion) {
      if (ed.pendiente) { resultado("Hay una operación sin confirmar. Comprueba primero su resultado.", [{ texto: "Comprobar el resultado", accion: "comprobar", principal: true }], "aviso"); return; }
      ed.pendiente = { tipo: "estado", accion, operacion: uuid(), version: ed.version };
    }
    const op = ed.pendiente;
    ed.operaciones.add(op.operacion);
    enCurso = true;
    pintarBotones();
    const textos = { publicar: "Publicando…", ocultar: "Ocultando…", retirar: "Retirando…", restaurar: "Restaurando…" };
    resultado(`${trasGuardar ? `${trasGuardar} ` : ""}${textos[accion]}`);
    try {
      const acceso = await panel().comprobarAcceso();
      if (!ed) return;
      if (acceso.estado !== "admin") {
        ed.pendiente = null;
        if (acceso.estado === "red") { resultado("No pudimos comprobar tu sesión. Revisa tu conexión e inténtalo de nuevo.", [], "aviso"); return; }
        enCurso = false;
        await panel().aplicarAcceso(acceso);
        return;
      }
      let r;
      try {
        r = await panel().cliente().rpc("fn_admin_estado_producto", { p_id: ed.id, p_accion: accion, p_version: op.version, p_operacion: op.operacion });
      } catch { r = { error: { status: 0 } }; }
      if (!ed) return;
      if (!r.error) { confirmarEstado(r.data, op, false, trasGuardar); return; }
      const tipo = tipoError(r);
      if (tipo === "red") { resultado("Se perdió la respuesta del servidor. Comprobando qué ocurrió…", [], "aviso"); enCurso = false; await comprobar(); return; }
      ed.pendiente = null;
      if (tipo === "conflicto") {
        resultado("Otra edición de esta zapatilla se guardó antes. No se cambió nada. Carga la versión actual para continuar.", [{ texto: "Cargar la versión actual", accion: "recargar-actual", principal: true }], "aviso");
        return;
      }
      if (tipo === "datos") {
        resultado(`${trasGuardar ? `${trasGuardar} ` : ""}${r.error.message || "No se pudo completar la acción."}${accion === "publicar" ? " La zapatilla sigue oculta." : ""}`, [], "aviso");
        return;
      }
      if (tipo === "sin-sesion" || tipo === "sin-permiso") { enCurso = false; await panel().aplicarAcceso(await panel().comprobarAcceso()); return; }
      resultado("El servidor no pudo completar la acción. No se cambió nada.", [], "aviso");
    } finally {
      enCurso = false;
      if (ed) pintarBotones();
    }
  }

  function confirmarEstado(respuesta, op, comprobado = false, trasGuardar = "") {
    ed.pendiente = null;
    ed.version = respuesta.version;
    ed.activo = Boolean(respuesta.activo);
    ed.retirado = Boolean(respuesta.retirado);
    pintarCabecera();
    panel().recargar();
    const hecho = { publicar: "Publicada: ya se ve en la tienda.", ocultar: "Oculta: ya no se ve en la tienda.", retirar: "Retirada del catálogo. Se conserva todo y puedes restaurarla.", restaurar: "Restaurada: sigue oculta hasta que la publiques." }[op.accion];
    const prefijo = comprobado ? "Comprobado con el identificador de esta operación. " : respuesta.estado === "ya_aplicada" ? "Esa acción ya se había aplicado; no se repitió. " : "";
    resultado(`${trasGuardar ? `${trasGuardar} ` : ""}${prefijo}${hecho}`, [], "ok");
  }

  // ------------------------------------------------------------------ fotos
  async function agregarArchivos(v, archivos, reemplazarClave = null) {
    const L = fotos().LIMITES;
    let lista = [...archivos];
    if (!lista.length) return;
    const libres = L.fotosPorColor - v.fotos.filter((f) => !f.reemplaza).length + (reemplazarClave ? 1 : 0);
    const maximo = Math.min(L.fotosPorOperacion, reemplazarClave ? 1 : libres);
    if (lista.length > maximo) {
      resultado(`Solo se pueden añadir ${maximo} ${maximo === 1 ? "foto" : "fotos"} más a este color (máximo ${L.fotosPorColor} por color y ${L.fotosPorOperacion} por vez).`, [], "aviso");
      lista = lista.slice(0, Math.max(0, maximo));
    }
    const items = lista.map((archivo) => ({ clave: nuevaClave(), estado: "procesando", ruta: null, alt: "", archivo, reemplaza: reemplazarClave }));
    if (reemplazarClave) {
      const i = v.fotos.findIndex((f) => f.clave === reemplazarClave);
      v.fotos.splice(i + 1, 0, ...items);
    } else v.fotos.push(...items);
    repintarFotos(v);
    // De una en una: menos memoria y un progreso claro.
    for (const item of items) {
      try {
        item.info = await fotos().preparar(item.archivo);
      } catch (e) {
        item.estado = "error";
        item.reintentable = false;
        item.mensaje = e instanceof fotos().ErrorFoto ? e.message : "No pudimos procesar la foto.";
        if (ed) repintarFotos(v);
        continue;
      }
      if (!ed) return;
      item.blob = item.info.blob;
      item.vistaPrevia = URL.createObjectURL(item.blob);
      item.objeto = fotos().nombreObjeto(ed.id, v.id);
      delete item.archivo;
      await subirFoto(v, item);
    }
  }

  async function subirFoto(v, item) {
    item.estado = "subiendo";
    item.progreso = 0;
    item.mensaje = "";
    repintarFotos(v);
    let token = null;
    try { token = (await panel().cliente().auth.getSession()).data?.session?.access_token || null; } catch { token = null; }
    if (!token) { item.estado = "error"; item.reintentable = true; item.mensaje = "La sesión terminó o no se pudo leer. Vuelve a ingresar y reintenta."; repintarFotos(v); return; }
    const conf = panel().configuracion();
    let ultimo = 0;
    const r = await fotos().subir({
      base: conf.url, clave: conf.clave, token, objeto: item.objeto, blob: item.blob,
      alProgreso: (p) => {
        item.progreso = p;
        if (Date.now() - ultimo < 150) return;
        ultimo = Date.now();
        const barra = document.querySelector(`#editor [data-clave="${item.clave}"] progress`);
        if (barra) { barra.value = p; barra.previousElementSibling.textContent = `${item.reemplaza ? "Reemplazo · " : ""}Subiendo ${Math.round(p * 100)} %`; }
      }
    });
    if (!ed) return;
    if (r.ok) { marcarSubida(v, item); return; }
    if (r.tipo === "duplicado" || r.tipo === "red") {
      // El nombre es único y solo lo conoce este formulario: si existe, es esta subida.
      item.estado = "comprobando";
      repintarFotos(v);
      const existe = await existeObjeto(item.objeto);
      if (!ed) return;
      if (existe === true) { marcarSubida(v, item); return; }
      item.estado = "error";
      item.reintentable = true;
      item.mensaje = existe === false
        ? "No pudimos confirmar la subida: la foto todavía no aparece en Storage. Reintenta (usa el mismo nombre: no se duplicará)."
        : "Se perdió la conexión y no pudimos comprobar si la foto llegó. Reintenta (usa el mismo nombre: no se duplicará).";
      repintarFotos(v);
      return;
    }
    item.estado = "error";
    item.reintentable = r.tipo === "sin-sesion";
    item.mensaje = r.mensaje || "No se pudo subir.";
    repintarFotos(v);
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

  function marcarSubida(v, item) {
    item.estado = "subida";
    item.ruta = fotos().urlPublica(panel().configuracion().url, item.objeto);
    ed.subidasSesion.add(item.objeto);
    delete item.blob;
    if (item.reemplaza) {
      // El reemplazo ocupa el lugar de la foto anterior. El archivo anterior NO se borra.
      const i = v.fotos.findIndex((f) => f.clave === item.reemplaza);
      if (i >= 0) v.fotos.splice(i, 1);
      item.reemplaza = null;
    }
    repintarFotos(v);
  }

  // --------------------------------------------------------- archivos sin usar
  function pintarSinUsar() {
    const seccion = nodo("section", "editor-seccion editor-sin-usar");
    seccion.id = "ed-sin-usar";
    seccion.setAttribute("aria-labelledby", "ed-sin-usar-titulo");
    const h = nodo("h3", "editor-seccion-titulo", "Archivos sin usar");
    h.id = "ed-sin-usar-titulo";
    seccion.append(h, nodo("p", "editor-nota", "Fotos de esta zapatilla que están en Storage pero en ninguna galería guardada (por ejemplo, las reemplazadas). Borrarlas es definitivo."));
    if (!ed.sinUsar) {
      seccion.append(boton("Revisar archivos sin usar", "sin-usar"));
    } else if (ed.sinUsar.error) {
      seccion.append(nodo("p", "campo-error", ed.sinUsar.error), boton("Revisar otra vez", "sin-usar"));
    } else if (!ed.sinUsar.lista.length) {
      seccion.append(nodo("p", "", "No hay archivos sin usar."), boton("Revisar otra vez", "sin-usar"));
    } else {
      const lista = nodo("ul", "editor-sin-usar-lista");
      for (const o of ed.sinUsar.lista) {
        const li = nodo("li", "editor-sin-usar-item");
        const img = nodo("img");
        img.src = fotos().urlPublica(panel().configuracion().url, o.objeto);
        img.alt = "";
        img.loading = "lazy";
        li.append(img, nodo("span", "codigo codigo-suave", `${o.objeto.split("/").pop()}${o.bytes ? ` · ${fotos().peso(o.bytes)}` : ""}`));
        if (o.confirmar) {
          li.append(nodo("span", "editor-sin-usar-pregunta", "¿Borrar definitivamente?"),
            boton("Sí, borrar", "borrar-archivo", "boton boton-principal boton-mini", { objeto: o.objeto }),
            boton("No", "no-borrar", "boton boton-secundario boton-mini", { objeto: o.objeto }));
        } else {
          li.append(etiquetado(boton("Borrar definitivamente", "pedir-borrado", "boton boton-texto boton-mini", { objeto: o.objeto }), `Borrar definitivamente ${o.objeto.split("/").pop()}`));
        }
        if (o.mensaje) li.append(nodo("p", "campo-error", o.mensaje));
        lista.append(li);
      }
      seccion.append(lista, boton("Revisar otra vez", "sin-usar"));
    }
    return seccion;
  }
  function repintarSinUsar(enfocar = null) {
    document.getElementById("ed-sin-usar")?.replaceWith(pintarSinUsar());
    pintarBotones();
    if (enfocar) $(enfocar, document.getElementById("ed-sin-usar"))?.focus();
  }

  async function cargarSinUsar() {
    const c = panel().cliente();
    const almacen = c.storage.from(fotos().BUCKET);
    const carpeta = `productos/${ed.id}`;
    try {
      const raiz = await almacen.list(carpeta, { limit: 100 });
      if (raiz.error) throw raiz.error;
      const objetos = [];
      for (const sub of raiz.data || []) {
        const r = await almacen.list(`${carpeta}/${sub.name}`, { limit: 1000 });
        if (r.error) throw r.error;
        for (const o of r.data || []) if (o.id) objetos.push({ objeto: `${carpeta}/${sub.name}/${o.name}`, bytes: o.metadata?.size || 0 });
      }
      const usadas = await c.from("fotos").select("ruta").like("ruta", `%/fotos-catalogo/${carpeta}/%`);
      if (usadas.error) throw usadas.error;
      const enUso = new Set((usadas.data || []).map((f) => fotos().objetoDe(f.ruta)).filter(Boolean));
      // Lo subido en este formulario y todavía en su galería tampoco se ofrece: se va a guardar.
      for (const v of ed.variantes) for (const f of v.fotos) { const o = fotos().objetoDe(f.ruta); if (o) enUso.add(o); }
      ed.sinUsar = { lista: objetos.filter((o) => !enUso.has(o.objeto)) };
    } catch {
      ed.sinUsar = { error: "No pudimos revisar los archivos. Revisa tu conexión e inténtalo de nuevo." };
    }
  }

  async function borrarArchivo(objeto) {
    const item = ed.sinUsar?.lista.find((o) => o.objeto === objeto);
    if (!item) return;
    if (ed.pendiente) { item.mensaje = "Hay una operación sin confirmar: comprueba su resultado antes de borrar archivos."; item.confirmar = false; repintarSinUsar(); return; }
    const c = panel().cliente();
    enCurso = true;
    pintarBotones();
    try {
      // Se comprueba otra vez que ninguna galería lo usa (también la de otro color o zapatilla).
      const uso = await c.from("fotos").select("id").like("ruta", `%/fotos-catalogo/${objeto}`).limit(1);
      if (uso.error) { item.mensaje = "No pudimos comprobar si la foto está en uso; no se borró."; return; }
      if ((uso.data || []).length) { item.mensaje = "Esta foto está en una galería guardada; no se borró."; return; }
      let r;
      try { r = await c.storage.from(fotos().BUCKET).remove([objeto]); } catch { r = { error: { message: "red" } }; }
      if (r.error) { item.mensaje = "No se pudo confirmar el borrado. Revisa la lista otra vez antes de repetirlo."; return; }
      if ((r.data || []).length !== 1) { item.mensaje = "No se borró: el servidor no lo permitió (está en uso o falta permiso)."; return; }
      ed.sinUsar.lista = ed.sinUsar.lista.filter((o) => o.objeto !== objeto);
      ed.subidasSesion.delete(objeto);
      resultado("Archivo borrado definitivamente de Storage.", [], "ok");
    } finally {
      item.confirmar = false;
      enCurso = false;
      if (ed) repintarSinUsar('[data-editor="sin-usar"]');
    }
  }

  // ------------------------------------------------------------------ eventos
  function varianteDe(id) { return ed?.variantes.find((v) => v.id === id); }

  function agregarTallas(v) {
    const texto = v.entradaTalla.trim();
    v.errorTalla = "";
    if (!texto) { v.errorTalla = "Escribe una talla."; repintarVariante(v, `ed-v-${v.id}-talla`); return; }
    const etiquetas = texto.split(";").map((t) => t.trim()).filter(Boolean);
    const nuevas = [];
    for (const etiqueta of etiquetas) {
      const valor = racional(etiqueta);
      if (!valor) { v.errorTalla = `«${etiqueta}» no es una talla válida. Usa 40, 40,5 o 40 1/3.`; break; }
      const choque = [...v.tallas, ...nuevas].find((t) => { const o = racional(t.talla); return o && equivalentes(o, valor); });
      if (choque) {
        v.errorTalla = choque.talla === etiqueta
          ? `La talla ${etiqueta} ya está en este color${choque.activa === false ? " (desactivada: reactívala)" : ""}.`
          : `${etiqueta} equivale a la talla ${choque.talla}, que ya está en este color${choque.activa === false ? " (desactivada: reactívala)" : ""}.`;
        break;
      }
      nuevas.push({ id: uuid(), talla: etiqueta, activa: true, nueva: true, estado: "REVISAR" });
    }
    if (!v.errorTalla && v.tallas.length + nuevas.length > LIM.tallas) v.errorTalla = `Como mucho ${LIM.tallas} tallas por color.`;
    if (!v.errorTalla) {
      v.tallas.push(...nuevas);
      v.tallas.sort((a, b) => panel().valorTalla(a.talla) - panel().valorTalla(b.talla) || a.talla.localeCompare(b.talla));
      v.entradaTalla = "";
    }
    repintarVariante(v, `ed-v-${v.id}-talla`);
  }

  function alClic(e) {
    const objetivo = e.target.closest("[data-editor]");
    if (!objetivo || !ed && !["recuperar", "descartar-borrador"].includes(objetivo.dataset.editor)) return;
    const accion = objetivo.dataset.editor;
    const v = varianteDe(objetivo.dataset.variante);
    if (enCurso && !["cerrar"].includes(accion)) return;
    switch (accion) {
      case "cerrar": case "cancelar": intentarCerrar(); break;
      case "seguir": $("#editor-salida").hidden = true; $("#editor-botones").hidden = false; $('[data-editor="cancelar"]').focus(); break;
      case "descartar": cerrar(); break;
      case "cerrar-forzado": cerrar(); break;
      case "guardar-publicar": guardar({ publicar: true }); break;
      case "comprobar": comprobar(); break;
      case "reintentar": reintentar(); break;
      case "recargar-actual": recargarActual(); break;
      case "estado": cambiarEstado(objetivo.dataset.estado); break;
      case "pedir-retiro":
        resultado("¿Retirar esta zapatilla del catálogo? Deja de verse en la tienda y se conservan sus colores, tallas, fotos e historial. Podrás restaurarla.",
          [{ texto: "No, mantenerla", accion: "cancelar-retiro" }, { texto: "Sí, retirarla", accion: "estado", principal: true, datos: { estado: "retirar" } }], "aviso");
        $('#editor-resultado [data-editor="cancelar-retiro"]')?.focus();
        break;
      case "cancelar-retiro": resultado(""); break;
      case "agregar-color": {
        if (ed.variantes.length >= LIM.colores) { resultado(`Como mucho ${LIM.colores} colores.`, [], "aviso"); break; }
        const orden = Math.max(-1, ...ed.variantes.map((x) => x.orden)) + 1;
        const nueva = variantePorDefecto(orden);
        ed.variantes.push(nueva);
        $("#ed-variantes").append(pintarVariante(nueva));
        pintarBotones();
        document.getElementById(`ed-v-${nueva.id}-color`)?.focus();
        break;
      }
      case "quitar-color": {
        if (!v?.nueva) break;
        ed.variantes = ed.variantes.filter((x) => x !== v);
        document.getElementById(`ed-v-${v.id}`)?.remove();
        pintarBotones();
        $("#ed-agregar-color").focus();
        break;
      }
      case "agregar-talla": if (v) agregarTallas(v); break;
      case "quitar-talla": if (v) { v.tallas = v.tallas.filter((t) => t.id !== objetivo.dataset.talla); repintarVariante(v, `ed-v-${v.id}-talla`); } break;
      case "alternar-talla": {
        const t = v?.tallas.find((x) => x.id === objetivo.dataset.talla);
        if (!t) break;
        t.activa = !t.activa;
        repintarVariante(v);
        document.querySelector(`#ed-v-${v.id} [data-editor="alternar-talla"][data-talla="${t.id}"]`)?.focus();
        break;
      }
      case "foto-principal": case "foto-antes": case "foto-despues": {
        const i = v.fotos.findIndex((f) => f.clave === objetivo.dataset.clave);
        if (i < 0) break;
        const [f] = v.fotos.splice(i, 1);
        const destino = accion === "foto-principal" ? 0 : accion === "foto-antes" ? i - 1 : i + 1;
        v.fotos.splice(destino, 0, f);
        const sel = accion === "foto-principal" ? `[data-clave="${f.clave}"] img` : `[data-editor="${accion}"][data-clave="${f.clave}"]`;
        repintarFotos(v, sel);
        if (!document.activeElement?.closest?.("#editor")) $(`[data-clave="${f.clave}"] button`, document.getElementById(`ed-v-${v.id}-fotos`))?.focus();
        break;
      }
      case "foto-quitar": {
        const f = v.fotos.find((x) => x.clave === objetivo.dataset.clave);
        v.fotos = v.fotos.filter((x) => x !== f);
        if (f?.vistaPrevia) URL.revokeObjectURL(f.vistaPrevia);
        repintarFotos(v, `#ed-v-${v.id}-archivo`);
        break;
      }
      case "foto-reintentar": {
        const f = v.fotos.find((x) => x.clave === objetivo.dataset.clave);
        if (f?.blob) subirFoto(v, f);
        break;
      }
      case "quitar-muestra": {
        if (!v) break;
        v.muestra = "";
        const texto = document.getElementById(`ed-v-${v.id}-muestra`);
        if (texto) { texto.value = ""; texto.removeAttribute("aria-invalid"); texto.focus(); }
        const vista = document.getElementById(`ed-v-${v.id}-muestra-vista`);
        if (vista) pintarVistaMuestra(vista, "");
        objetivo.hidden = true;
        pintarBotones();
        break;
      }
      case "sin-usar": cargarSinUsar().then(() => ed && repintarSinUsar('[data-editor="sin-usar"]')); break;
      case "pedir-borrado": case "no-borrar": {
        const item = ed.sinUsar?.lista.find((o) => o.objeto === objetivo.dataset.objeto);
        if (!item) break;
        item.confirmar = accion === "pedir-borrado";
        item.mensaje = "";
        repintarSinUsar(item.confirmar ? `[data-editor="no-borrar"][data-objeto="${CSS.escape(item.objeto)}"]` : `[data-editor="pedir-borrado"][data-objeto="${CSS.escape(item.objeto)}"]`);
        break;
      }
      case "borrar-archivo": borrarArchivo(objetivo.dataset.objeto); break;
      default: break;
    }
  }

  function alEscribir(e) {
    if (!ed) return;
    const n = e.target;
    if (n.dataset.campo) {
      if (n.type === "radio" && !n.checked) return;
      ed.datos[n.dataset.campo] = n.type === "checkbox" ? n.checked : n.value;
      if (n.dataset.campo === "nombre") $("#editor-titulo").textContent = ed.modo === "crear" ? "Nueva zapatilla" : (n.value.trim() || "Zapatilla sin nombre");
      if (n.dataset.campo === "publico") errorPublicoVisible("");
    } else if (n.dataset.variante && n.dataset.vselector === "muestra") {
      // El selector de color escribe en el campo de texto, que es el que se guarda.
      const v = varianteDe(n.dataset.variante);
      if (!v) return;
      v.muestra = n.value.toUpperCase();
      const texto = document.getElementById(`ed-v-${v.id}-muestra`);
      if (texto) { texto.value = v.muestra; texto.removeAttribute("aria-invalid"); }
      const vista = document.getElementById(`ed-v-${v.id}-muestra-vista`);
      if (vista) pintarVistaMuestra(vista, v.muestra);
      const quitar = document.getElementById(`ed-v-${v.id}-muestra-quitar`);
      if (quitar) quitar.hidden = false;
    } else if (n.dataset.variante && n.dataset.vcampo) {
      const v = varianteDe(n.dataset.variante);
      if (!v) return;
      v[n.dataset.vcampo] = n.type === "checkbox" ? n.checked : n.value;
      if (n.dataset.vcampo === "color") { const t = document.getElementById(`ed-v-${v.id}-titulo`); if (t) t.textContent = n.value.trim() || `Color ${ed.variantes.indexOf(v) + 1}`; }
      if (n.dataset.vcampo === "precio") { const ayuda = document.getElementById(`${n.id}-ayuda`); if (ayuda) ayuda.textContent = textoPrecio(v); }
      if (n.dataset.vcampo === "activa") document.getElementById(`ed-v-${v.id}`)?.classList.toggle("es-inactiva", !n.checked);
      if (n.dataset.vcampo === "muestra") {
        const vista = document.getElementById(`ed-v-${v.id}-muestra-vista`);
        if (vista) pintarVistaMuestra(vista, n.value);
        const selector = document.getElementById(`ed-v-${v.id}-muestra-selector`);
        if (selector && MUESTRA_HEX.test(n.value.trim())) selector.value = n.value.trim().toLowerCase();
        const quitar = document.getElementById(`ed-v-${v.id}-muestra-quitar`);
        if (quitar) quitar.hidden = !n.value.trim();
      }
    } else return;
    if (n.getAttribute("aria-invalid") === "true" && !n.dataset.agregarTalla) n.removeAttribute("aria-invalid");
    pintarBotones();
  }

  function alCambiar(e) {
    const n = e.target;
    // Al salir del campo, el valor REAL queda en mayúsculas (y el código sin espacios exteriores).
    if (ed && n.classList?.contains("campo-mayus")) {
      const normal = n.dataset.codigo !== undefined ? codigoLimpio(n.value) : mayus(n.value);
      if (n.value !== normal) n.value = normal;
    }
    if (!ed || n.type !== "file") { alEscribir(e); return; }
    const archivos = [...(n.files || [])];
    n.value = "";
    if (!archivos.length) return;
    if (n.dataset.archivos) agregarArchivos(varianteDe(n.dataset.archivos), archivos);
    else if (n.dataset.reemplazar) agregarArchivos(varianteDe(n.dataset.variante), archivos.slice(0, 1), n.dataset.reemplazar);
  }

  function alTeclear(e) {
    if (e.key === "Enter" && e.target.dataset?.agregarTalla) {
      e.preventDefault();
      const v = varianteDe(e.target.dataset.agregarTalla);
      if (v && !enCurso) agregarTallas(v);
    }
  }

  function preparar() {
    const dialogo = $("#editor");
    if (!dialogo) return;
    const formulario = $("#editor-formulario");
    formulario.addEventListener("submit", (e) => { e.preventDefault(); guardar(); });
    dialogo.addEventListener("click", alClic);
    dialogo.addEventListener("input", alEscribir);
    dialogo.addEventListener("change", alCambiar);
    dialogo.addEventListener("keydown", alTeclear);
    // Escape no cierra sin preguntar: se trata como «Cancelar».
    dialogo.addEventListener("cancel", (e) => { e.preventDefault(); intentarCerrar(); });
    document.addEventListener("click", (e) => {
      const b = e.target.closest("#editor-borrador [data-editor]");
      if (!b) return;
      if (b.dataset.editor === "recuperar") abrir(null, true, document.querySelector("#boton-nuevo"));
      else if (b.dataset.editor === "descartar-borrador") { borrador = null; quitarAvisoBorrador(); }
    });
    // Abandonar la página con cambios sin guardar pide confirmación al navegador.
    window.addEventListener("beforeunload", (e) => {
      if ((ed && (sucio() || ed.pendiente)) || borrador) { e.preventDefault(); e.returnValue = ""; }
    });
  }

  window.GamaTallaEditor = Object.freeze({ abrir: (id, disparador) => abrir(id, false, disparador), alPerderAcceso, ofrecerBorrador, abierto: () => Boolean(ed) });
  document.addEventListener("DOMContentLoaded", preparar);
})();
