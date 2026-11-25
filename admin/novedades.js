/* Panel privado de Gama & Talla · etapa 23: «Novedades y diferencias» del importador.
 *
 * Reconoce lo que ya está en el catálogo, recuerda las relaciones que la persona confirma y, antes de
 * escribir, muestra qué cambiaría. Expone window.GamaTallaNovedades.crear(ctx); importador.js lo crea y le
 * presta sus utilidades (ctx). Usa inventario.js (lógica), borradores.js (IndexedDB) y la lectura y el cuerpo
 * de guardado del editor.
 *
 * Entradas: cada tarjeta de calzado del PDF abierto y cada publicación de WhatsApp del lote. Cada una se
 * resuelve como: zapatilla nueva · color nuevo de una existente · actualizar un color · otra fotografía de un
 * color · omitir. Lo nuevo sigue el camino de siempre (fichas, «Guardar lote como oculto»); lo existente se
 * aplica aquí con «Aplicar cambios seleccionados».
 *
 * Contexto: una confirmación y los cambios elegidos valen para el proveedor, el destino y el público con que se
 * aprobaron. Si algo de eso cambia se conservan a la vista, pero no se aplican hasta revisarlos. Una operación ya
 * enviada conserva su contexto original.
 *
 * Guardado: una sola operación por producto, con fn_admin_guardar_producto, la versión leída y un identificador
 * de operación que queda en el borrador ANTES de enviarse. Si ese guardado previo falla (o el navegador no permite
 * guardar), no se sube ni se envía nada. Solo se anuncia éxito si el servidor lo confirmó.
 * La memoria local se escribe después y por separado: si falla, se reintenta sin repetir la escritura.
 */
(() => {
  "use strict";

  function crear(ctx) {
    const I = () => window.GamaTallaInventario;
    const { nodo, boton, campo, mensaje, formatoPesos, mayus, uuid, $ } = ctx;
    const almacen = () => ctx.almacen();
    const panel = () => ctx.panel();
    const comun = () => ctx.comun();
    const fotos = () => ctx.fotos();
    const lote = () => ctx.lote();
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const MODOS = ["nueva", "color", "actualizar", "foto", "omitir"];
    const NOMBRE_MODO = { nueva: "Crear otra zapatilla", color: "Añadir un color a una zapatilla existente", actualizar: "Actualizar un color existente",
      foto: "Añadir otra fotografía a un color existente", omitir: "Omitir esta entrada" };
    const FILTROS = [["todas", "Todas"], ["nuevas", "Nuevas zapatillas"], ["colores", "Nuevos colores"], ["precio", "Cambios de precio"],
      ["tallas", "Cambios de tallas"], ["fotos", "Nuevas fotografías"], ["sin", "Sin cambios"], ["revisar", "Por reconocer o revisar"], ["omitidas", "Omitidas"]];
    const POR_PAGINA = 20;

    // ------------------------------------------------------------------ memoria local (en RAM y en IndexedDB)
    let memoria = { ambito: null, proveedores: [], asociaciones: [], historial: [] };
    let errorMemoria = "";
    let aplicando = false;
    let importada = null; // memoria leída de un archivo que espera una decisión
    let oyendo = false;
    const ui = { memoriaAbierta: false, memoriaTexto: "", memoriaVer: POR_PAGINA, confirmarOlvido: "", corregir: "", corregirTexto: "", nuevoProveedor: "", errorProveedor: "", proveedorAbierto: false, resolver: {},
      fijas: new Set() }; // entradas decididas aquí: siguen a la vista aunque dejen de cumplir el filtro, hasta cambiarlo

    async function cargarMemoria(ambito) {
      versionMemoria += 1;
      memoria = { ambito, proveedores: [], asociaciones: [], historial: [] };
      errorMemoria = "";
      if (!ambito || !ctx.almacenOk()) { ctx.cambio(); return; }
      if (!oyendo) {
        oyendo = true;
        // Otra pestaña cambió la memoria de este proyecto y usuario: se vuelve a leer.
        almacen().escuchar((d) => { if (d?.tipo === "memoria" && d.ambito === memoria.ambito && d.de !== ctx.pestana) cargarMemoria(memoria.ambito).then(() => repintar()); });
      }
      try {
        const m = await almacen().leerMemoria(ambito);
        if (memoria.ambito !== ambito) return;
        memoria = { ambito, proveedores: m.proveedores.map(I().proveedorLimpio).filter(Boolean), asociaciones: m.asociaciones.map(I().asociacionLimpia).filter(Boolean), historial: m.historial.map(I().historialLimpio).filter(Boolean) };
        versionMemoria += 1;
      } catch { errorMemoria = "No pudimos leer la memoria de reconocimiento de este navegador: las entradas se resuelven a mano."; }
      ctx.cambio();
    }
    /* El almacenamiento local no estaba disponible: se vuelve a intentar abrirlo y se relee la memoria sin perder
       los proveedores que solo existían en esta pestaña. true si ya se puede guardar. */
    async function recuperarAlmacen() {
      if (ctx.almacenOk()) return true;
      if (!(await ctx.reabrirAlmacen())) return false;
      const creados = memoria.proveedores;
      await cargarMemoria(memoria.ambito || lote()?.ambito || null);
      for (const p of creados) if (!memoria.proveedores.some((x) => x.id === p.id)) memoria.proveedores.push(p);
      return true;
    }
    // Escribe y refleja el cambio en RAM. Lanza si no se pudo (el que llama decide cómo explicarlo).
    async function escribirMemoria(cambio) {
      if (!memoria.ambito || !ctx.almacenOk()) throw new Error("sin-almacen");
      await almacen().guardarMemoria(memoria.ambito, cambio, { fusionar: I().fusionarHistorial });
      const poner = (lista, nuevos, unir = (p, n) => n) => { const m = new Map(lista.map((x) => [x.id, x])); for (const n of nuevos || []) m.set(n.id, unir(m.get(n.id), n)); return [...m.values()]; };
      const quitar = new Set(cambio.quitar || []);
      memoria.proveedores = poner(memoria.proveedores, cambio.proveedores);
      memoria.asociaciones = poner(memoria.asociaciones.filter((a) => !quitar.has(a.id)), cambio.asociaciones, (p, n) => ({ ...n, creado: p?.creado || n.creado }));
      memoria.historial = poner(memoria.historial, cambio.historial, I().fusionarHistorial);
      versionMemoria += 1;
      almacen().avisar({ tipo: "memoria", ambito: memoria.ambito, de: ctx.pestana });
      ctx.cambio();
    }

    // ------------------------------------------------------------------ estado en el lote (va en el borrador)
    const vacio = () => ({ abierto: false, proveedor: "", entradas: {}, operaciones: {}, filtro: "", fechas: {}, porRecordar: [], aviso: null });
    function estado() {
      const l = lote();
      if (!l.inventario) l.inventario = vacio();
      return l.inventario;
    }
    const abierto = () => Boolean(lote()?.inventario?.abierto || lote()?.pdf?.documentos?.length || operaciones().length || lote()?.inventario?.porRecordar?.length);
    const operaciones = () => Object.values(lote()?.inventario?.operaciones || {});
    function decision(id) {
      const inv = estado();
      if (!inv.entradas[id]) inv.entradas[id] = {};
      return inv.entradas[id];
    }
    const selVacia = () => ({ precio: { modo: "conservar", valor: "" }, tallas: [], coste: null, foto: true, color: true, contexto: null });
    const verSel = (id) => lote().inventario?.entradas?.[id]?.sel || selVacia();
    // ¿Hay algo elegido? (no añadir la foto o el color es una restricción: no necesita aprobarse otra vez).
    const eligeAlgo = (s) => Boolean(s) && (s.precio.modo !== "conservar" || s.tallas.length > 0 || s.coste !== null);
    /* Para escribir en la selección de una entrada. Lo elegido queda ligado al contexto en que se elige; si ya había
       algo elegido en otro, conserva el suyo (sigue por revisar). */
    function selDe(id) {
      const d = decision(id);
      if (!d.sel) d.sel = selVacia();
      if (!eligeAlgo(d.sel)) {
        const e = entradaPorId(id);
        const r = e && resolver(e);
        d.sel.contexto = r?.producto ? contextoDe(e, r.producto, r.variante) : null;
      }
      return d.sel;
    }

    // ------------------------------------------------------------------ contexto de las aprobaciones
    /* Con qué se aprobó algo: proveedor, destino, público de la zapatilla y de la entrega, y fotos de origen. */
    const contextoDe = (e, producto, variante) => ({
      proveedor: proveedorActual(), producto: producto?.id || "", variante: variante?.id || "", publico: producto?.publico || "", origen: e.leido.publico || "",
      fotos: e.identidades.map((i) => i.exacta).slice(0, 12), texto: producto ? nombreDestino(producto, variante) : ""
    });
    /* ¿Por qué ya no vale en este contexto? "" = sigue valiendo. Los nombres y los colores corregidos no cuentan. */
    function cambioDeContexto(c, e, producto) {
      if (!c) return "No consta con qué proveedor y datos se confirmó: revisa el destino y confírmalo otra vez.";
      const actual = proveedorActual();
      if (c.proveedor !== actual) return `Cambió el proveedor de la entrega (antes ${citarProveedor(c.proveedor)}, ahora ${citarProveedor(actual)}): revisa el destino y confírmalo otra vez.`;
      if (producto && c.publico !== (producto.publico || "")) return `Cuando la confirmaste, la zapatilla era para ${ctx.textoPublico(c.publico) || "un público sin indicar"} y ahora es para ${ctx.textoPublico(producto.publico) || "un público sin indicar"}: revisa el destino y confírmalo otra vez.`;
      if (producto && e.leido.publico && e.leido.publico !== c.origen && e.leido.publico !== producto.publico) return `Cuando la confirmaste, la entrega decía ${ctx.textoPublico(c.origen) || "un público sin indicar"} y ahora dice ${ctx.textoPublico(e.leido.publico)}: revisa el destino y confírmalo otra vez.`;
      if (c.fotos.length && !e.identidades.some((i) => c.fotos.includes(i.exacta))) return "Cambió la fotografía con la que se confirmó: revisa el destino y confírmalo otra vez.";
      return "";
    }
    const citarProveedor = (id) => (id ? `«${nombreProveedor(id)}»` : "sin elegir");
    // Lo elegido antes de que cambiara el proveedor o el público se conserva (por revisar); lo demás empieza de nuevo.
    function selConservada(dec) {
      const c = dec.sel?.contexto;
      if (!eligeAlgo(dec.sel) || !c) return null;
      const p = catalogo().find((x) => x.id === c.producto);
      return c.proveedor !== proveedorActual() || (p && (p.publico || "") !== c.publico) ? dec.sel : null;
    }
    // Cambios elegidos en otro contexto (proveedor, destino o público): no cuentan hasta aprobarlos aquí.
    function selPorRevisar(e, r) {
      const s = verSel(e.id);
      if (!eligeAlgo(s) || !r.producto || r.cerrada) return false;
      const c = s.contexto;
      return !c || c.producto !== r.producto.id || c.variante !== (r.variante?.id || "") || Boolean(cambioDeContexto(c, e, r.producto));
    }
    /* Lo ya enviado conserva su contexto: la operación en curso o sin confirmar, o lo que ya se aplicó. */
    function contextoFijo(id) {
      for (const op of operaciones()) {
        if (!["guardando", "sin-confirmar"].includes(op.estado)) continue;
        const x = op.entradas.find((y) => y.id === id);
        if (x) return { contexto: x.contexto, producto: op.producto, variante: x.variante, modo: x.modo, enCurso: true };
      }
      const dec = lote().inventario?.entradas?.[id];
      return dec?.aplicada ? { contexto: dec.contexto, producto: dec.producto, variante: dec.variante, modo: "actualizar", enCurso: false } : null;
    }
    const claveFecha = (doc) => `${proveedorActual()}|${doc}`;

    // ------------------------------------------------------------------ proveedor de la entrega
    function nombreProveedor(id) {
      if (!id) return "";
      const perfil = id.startsWith("perfil:") ? ctx.perfiles().find((p) => `perfil:${p.id}` === id) : null;
      if (perfil) return perfil.nombre;
      const p = memoria.proveedores.find((x) => x.id === id);
      if (p) return p.nombre;
      const instantanea = ctx.perfilLote();
      return instantanea && !ctx.esGeneral(instantanea) && `perfil:${instantanea.id}` === id ? instantanea.nombre : "Proveedor sin nombre";
    }
    /* Identidad estable: la del PERFIL (su id, no la versión de sus reglas) o la de un proveedor creado aquí.
       Con el Perfil general no hay proveedor hasta que se elija uno: no se mezclan proveedores distintos. */
    function proveedorActual() {
      const l = lote();
      if (!l) return "";
      if (l.inventario?.proveedor) return l.inventario.proveedor;
      const p = ctx.perfilLote();
      return p && !ctx.esGeneral(p) ? `perfil:${p.id}` : "";
    }
    function proveedoresConocidos() {
      const lista = ctx.perfiles().map((p) => ({ id: `perfil:${p.id}`, nombre: p.nombre }));
      for (const p of memoria.proveedores) if (!lista.some((x) => x.id === p.id)) lista.push({ id: p.id, nombre: nombreProveedor(p.id) });
      const actual = proveedorActual();
      if (actual && !lista.some((x) => x.id === actual)) lista.push({ id: actual, nombre: nombreProveedor(actual) });
      return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    }
    const registroProveedor = (id) => ({ id, nombre: nombreProveedor(id), creado: memoria.proveedores.find((p) => p.id === id)?.creado || new Date().toISOString() });

    // ------------------------------------------------------------------ entradas
    const claveModelo = (m, n) => ctx.texto().claveModelo(m, n);
    function entradaPdf(r, a) {
      const t = r.t;
      const docs = [a.principal, ...Object.values(r.parejas).filter((x) => x.tarjeta).map((x) => x.doc)];
      return {
        id: t.id, clase: "pdf", r, numero: r.numero, nombre: `Tarjeta ${r.numero}`,
        identidades: I().identidadValida({ tipo: "pdf", exacta: t.foto?.exacta }) ? [{ tipo: "pdf", exacta: t.foto.exacta, gris: t.foto.gris || "" }] : [],
        leido: { marca: r.leido.marca ? mayus(r.leido.marca) : "", modelo: r.leido.modelo ? mayus(r.leido.modelo) : "", publico: r.leido.publico || "", color: r.leido.color ? mayus(r.leido.color) : "" },
        tallas: r.leido.tallas, porRegla: r.leido.tallasExplicitas === false && Boolean(r.leido.reglaTallas),
        costes: r.comp.costes.map((c) => ({ importe: c.importe, condicion: c.condicion || "", general: Boolean(c.general) })), ventaSugerida: r.comp.ventaSugerida || null,
        documento: a.principal.nombre, entrega: a.principal.huella, lugar: `p${t.pagina}-${t.orden}`, lugarTexto: `página ${t.pagina}, tarjeta ${t.orden}`,
        fecha: I().fechaValida(a.principal.fecha), fechas: docs.map((d) => ({ id: d.huella, nombre: d.nombre, fecha: I().fechaValida(d.fecha) })),
        texto: t.lineas.join(" · "), anadida: ctx.anadidaPdf(r)
      };
    }
    function entradaWa(f, c) {
      const leidas = ctx.texto().leerCampoTallas(c.tallasTexto);
      const proveedor = comun().entero(c.proveedor);
      const varios = c.precios?.length > 1 && !c.editados.has("proveedor");
      const fecha = I().fechaEncabezado(c.encabezado);
      const nombre = `Ficha ${ctx.numero(f)}`;
      return {
        id: c.clave, clase: "wa", f, c, numero: ctx.numero(f), nombre,
        identidades: c.fotos.filter((x) => x.estado !== "error" && I().identidadValida(x.identidad)).map((x) => x.identidad),
        leido: { marca: f.marca, modelo: f.modelo, publico: f.publico, color: c.color },
        tallas: leidas.error ? [] : leidas.tallas, porRegla: Boolean(c.todas),
        costes: varios ? c.precios.map((n) => ({ importe: n, condicion: "", general: false })) : Number.isFinite(proveedor) && proveedor > 0 ? [{ importe: proveedor, condicion: "", general: true }] : [],
        ventaSugerida: null, documento: "Publicación de WhatsApp", entrega: `wa:${c.id}`, lugar: "publicacion", lugarTexto: nombre,
        fecha, fechas: [{ id: fecha ? `wa:${fecha}` : "wa", nombre: "publicaciones de WhatsApp", fecha }],
        texto: c.texto.trim().split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 3).join(" · "), anadida: null
      };
    }
    const esWa = (f, c) => !c.pdf && f.estado !== "guardada" && (c.texto.trim() || c.fotos.length);
    function entradas() {
      const l = lote();
      if (!l) return [];
      const lista = [];
      if (l.pdf?.documentos?.length) {
        const a = ctx.analisisPdf();
        if (a.principal && !a.errores.length) for (const r of a.filas) if (r.tipo === "calzado" || l.inventario?.entradas?.[r.t.id]?.modo) lista.push(entradaPdf(r, a));
      }
      for (const f of l.fichas) for (const c of f.colores) if (esWa(f, c)) lista.push(entradaWa(f, c));
      return lista;
    }
    const entradaPorId = (id) => entradas().find((e) => e.id === id) || null;

    // ------------------------------------------------------------------ resolver
    /* El tablero vacía su lista mientras la relee (y si la lectura falla): entonces se usa la última leída. Sin
       ninguna, no se resuelve nada (no se confunde «no se pudo leer» con «no existe»). */
    let ultimaLectura = null; // { ambito, productos }
    function catalogo() {
      if (panel().catalogoLeido()) ultimaLectura = { ambito: memoria.ambito, productos: panel().productos() };
      return ultimaLectura && ultimaLectura.ambito === memoria.ambito ? ultimaLectura.productos : SIN_CATALOGO;
    }
    const SIN_CATALOGO = [];
    const ESTADOS_DUDA = new Set(["sin-catalogo", "parecida", "ambigua", "contradictoria", "retirada", "inexistente", "desactivada", "por-vincular"]);
    // El resultado se conserva mientras no cambien la entrada, el proveedor, la memoria o el catálogo.
    const reconocidas = new Map();
    let versionMemoria = 0;
    let ultimoCatalogo = null;
    function reconocerEntrada(e) {
      if (ultimoCatalogo !== catalogo()) { ultimoCatalogo = catalogo(); reconocidas.clear(); }
      const clave = JSON.stringify([e.identidades.map((i) => i.tipo + i.exacta), e.leido.marca, e.leido.modelo, e.leido.publico, proveedorActual(), versionMemoria]);
      const previa = reconocidas.get(e.id);
      if (previa?.clave === clave) return previa.valor;
      const valor = calcularReconocimiento(e);
      reconocidas.set(e.id, { clave, valor });
      return valor;
    }
    function calcularReconocimiento(e) {
      return I().reconocer({ identidades: e.identidades, leido: e.leido, proveedor: proveedorActual(), asociaciones: memoria.asociaciones, catalogo: catalogo(), claveModelo,
        distancia: ctx.pdf().distancia, umbral: ctx.pdf().UMBRAL_IGUAL });
    }
    // ¿Se puede escribir en este producto?
    function bloqueoDe(producto, variante, modo) {
      if (!producto) return "La zapatilla elegida ya no existe en el catálogo.";
      if (producto.retirado_en) return "Esta zapatilla está retirada: no se restaura ni se actualiza desde aquí.";
      if (modo !== "color" && !variante) return "El color elegido ya no existe en la zapatilla.";
      if (!producto.publico) return "Esta zapatilla todavía no tiene público: complétalo en el editor antes de actualizarla.";
      return "";
    }
    // Lo que dice la memoria: reconocida (aprobada por la relación recordada), dudosa, o null si no dice nada.
    function segunMemoria(e, rec, base, modelo, nota = "") {
      const motivo = [rec.motivo, nota].filter(Boolean).join(" ");
      if (rec.estado === "reconocida") {
        const destino = I().buscarDestino(catalogo(), rec.elegida.producto, rec.elegida.variante);
        const r = { ...base, modo: "actualizar", estado: "reconocida", fuente: "memoria", producto: destino.producto, variante: destino.variante, motivo, candidatos: rec.candidatos, modelo };
        r.bloqueo = bloqueoDe(r.producto, r.variante, "actualizar") || bloqueoAgrupada(e);
        r.confirmada = !r.bloqueo;
        return r;
      }
      return ESTADOS_DUDA.has(rec.estado) ? { ...base, estado: rec.estado, motivo, candidatos: rec.candidatos, modelo } : null;
    }
    const bloqueoAgrupada = (e) => (e.clase === "wa" && e.f.colores.length > 1 ? "Esta publicación está agrupada con otras en su ficha: sepárala para compararla." : "");
    /* { modo ("" = por resolver), estado, fuente, producto, variante, confirmada, cerrada, bloqueo, motivo, candidatos, modelo } */
    function resolver(e) {
      const dec = lote().inventario?.entradas?.[e.id] || {};
      const base = { modo: "", estado: "", fuente: "", producto: null, variante: null, confirmada: false, cerrada: false, bloqueo: "", motivo: "", candidatos: [], modelo: { mismas: [], otras: [] }, dec };
      if (e.anadida && !dec.aplicada) return { ...base, modo: "nueva", estado: "anadida", motivo: "" };
      if (catalogo() === SIN_CATALOGO) return { ...base, estado: "sin-catalogo", motivo: "No pudimos leer tu catálogo: cierra el importador, actualiza el tablero y vuelve a comparar." };
      const modelo = I().mismoModelo({ leido: e.leido, catalogo: catalogo(), claveModelo });
      // Enviada o aplicada con otro proveedor: conserva su contexto original; con el actual no se ofrece nada.
      const fijo = contextoFijo(e.id);
      if (fijo?.contexto && fijo.contexto.proveedor !== proveedorActual()) {
        const destino = I().buscarDestino(catalogo(), fijo.producto, fijo.variante);
        return { ...base, modo: fijo.modo, estado: "cerrada", fuente: "operacion", producto: destino?.producto || catalogo().find((p) => p.id === fijo.producto) || null, variante: destino?.variante || null, confirmada: true, cerrada: true, modelo,
          motivo: fijo.enCurso ? `Esta entrada tiene un resultado por confirmar con el proveedor ${citarProveedor(fijo.contexto.proveedor)}: se comprueba con su operación.`
            : `Se aplicó con el proveedor ${citarProveedor(fijo.contexto.proveedor)}. Para más cambios de esta entrada, vuelve a elegir ese proveedor.` };
      }
      // Lo decidido vale para el proveedor con el que se decidió: con otro manda lo que diga SU memoria.
      const otroProveedor = MODOS.includes(dec.modo) && dec.modo !== "omitir" && dec.contexto?.proveedor !== proveedorActual();
      if (otroProveedor) {
        const antes = dec.contexto ? dec.contexto.proveedor : "";
        const decidido = dec.modo === "nueva" ? "habías decidido crear otra zapatilla" : dec.contexto?.texto ? `la habías ${dec.confirmada ? "confirmado" : "elegido"} como ${dec.contexto.texto}` : "";
        const porMemoria = segunMemoria(e, reconocerEntrada(e), base, modelo, decidido ? `${antes ? `Con ${citarProveedor(antes)}` : "Sin proveedor"} ${decidido}: esa decisión no se usa con ${citarProveedor(proveedorActual())}.` : "");
        if (porMemoria) return porMemoria;
      }
      if (MODOS.includes(dec.modo)) {
        const r = { ...base, modo: dec.modo, estado: "decidida", fuente: dec.fuente || "manual", modelo, candidatos: reconocerEntrada(e).candidatos };
        if (["nueva", "omitir"].includes(dec.modo)) return r;
        r.producto = dec.producto ? catalogo().find((p) => p.id === dec.producto) || null : null;
        r.variante = r.producto && dec.variante ? (r.producto.variantes || []).find((v) => v.id === dec.variante) || null : null;
        if (!dec.producto || (dec.modo !== "color" && !dec.variante)) { r.motivo = dec.modo === "color" ? "Elige a qué zapatilla se añade el color." : "Elige el color que corresponde."; return r; }
        r.bloqueo = bloqueoDe(r.producto, r.variante, dec.modo);
        const cambio = dec.confirmada ? cambioDeContexto(dec.contexto, e, r.producto) : "";
        r.confirmada = Boolean(dec.confirmada) && !cambio && !r.bloqueo;
        if (!r.bloqueo) {
          if (cambio) r.motivo = cambio;
          else if (e.leido.publico && r.producto.publico && e.leido.publico !== r.producto.publico) r.motivo = `Atención: la entrega dice ${ctx.textoPublico(e.leido.publico)} y la zapatilla es para ${ctx.textoPublico(r.producto.publico)}. Son versiones distintas: confírmalo solo si de verdad corresponde.`;
          else if (r.variante && !r.variante.activa) r.motivo = "Este color está desactivado: se conserva así (no se activa).";
        }
        r.bloqueo = r.bloqueo || bloqueoAgrupada(e);
        return r;
      }
      const rec = reconocerEntrada(e);
      const porMemoria = segunMemoria(e, rec, base, modelo);
      if (porMemoria) return porMemoria;
      // Sin fotografía reconocida. El mismo modelo en el catálogo no identifica un color: se decide.
      if (modelo.mismas.length) {
        const varios = modelo.mismas.length > 1 ? `${modelo.mismas.length} zapatillas con este modelo` : `${modelo.mismas[0].nombre} (${modelo.mismas[0].codigo_interno})`;
        return { ...base, estado: "modelo", motivo: `En el catálogo ya está ${varios}. La marca y el modelo no dicen qué color es: búscalo o decide si es nuevo.`, modelo };
      }
      return { ...base, modo: e.clase === "pdf" && e.r.dec.incluir === false ? "omitir" : "nueva", estado: rec.estado, modelo, motivo: "" };
    }
    // Para importador.js: ¿esta fila del PDF se crea como ficha, o se resuelve aquí?
    function resolverFila(r, a) {
      if (r.tipo !== "calzado" && !lote().inventario?.entradas?.[r.t.id]?.modo) return null;
      return resolver({ ...entradaPdf(r, a), anadida: null });
    }
    // La ficha de WhatsApp que se resuelve aquí (no se crea otra zapatilla): su resolución, o null.
    function fichaResuelta(f) {
      if (f.colores.length !== 1 || !esWa(f, f.colores[0])) return null;
      const r = resolver(entradaWa(f, f.colores[0]));
      return r.modo && r.modo !== "nueva" ? r : null;
    }
    // Errores de una ficha que se va a crear: lo reconocido o dudoso no se crea otra vez sin decidirlo.
    function erroresFicha(f) {
      const errores = [];
      for (const c of f.colores) {
        const nombre = c.color.trim() || "un color";
        // Una relación pendiente vale para el proveedor con el que se pidió.
        if (recuerdoDeOtro(f, c)) errores.push({ campo: null, mensaje: `Pediste recordar ${nombre} para ${citarProveedor(c.recordar)} y el proveedor de la entrega ahora es ${citarProveedor(proveedorActual())}: recuérdala para este o quítala.` });
        // Añadida del catálogo PDF con otro proveedor y reconocida por el actual: no se crea otra sin revisarlo.
        const o = c.pdf?.entrega;
        if (f.estado !== "guardada" && o && typeof o.proveedor === "string" && o.proveedor !== proveedorActual() && proveedorActual()) {
          const rec = I().reconocer({ identidades: c.fotos.map((x) => x.identidad).filter(Boolean), leido: o, proveedor: proveedorActual(), asociaciones: memoria.asociaciones, catalogo: catalogo(), claveModelo, distancia: ctx.pdf().distancia, umbral: ctx.pdf().UMBRAL_IGUAL });
          if (rec.estado === "reconocida") {
            const d = I().buscarDestino(catalogo(), rec.elegida.producto, rec.elegida.variante);
            errores.push({ campo: null, mensaje: `La fotografía de ${nombre} ya está relacionada con ${nombreDestino(d.producto, d.variante)} para ${citarProveedor(proveedorActual())} (se añadió con ${citarProveedor(o.proveedor)}): quita esta ficha y decide en «Novedades y diferencias».` });
          }
        }
        if (!esWa(f, c) || !c.fotos.length) continue;
        const r = resolver(entradaWa(f, c));
        if (r.estado === "reconocida") errores.push({ campo: null, mensaje: `La fotografía de ${c.color.trim() || "una publicación"} ya está relacionada con ${nombreDestino(r.producto, r.variante)}: decide en «Novedades y diferencias» (no se crea otra zapatilla).` });
        else if (!r.modo && ESTADOS_DUDA.has(r.estado)) errores.push({ campo: null, mensaje: `Revisa ${c.color.trim() || "una publicación"} en «Novedades y diferencias»: ${r.motivo}` });
      }
      if (errores.length) estado().abierto = true;
      return errores;
    }
    const nombreDestino = (p, v) => [p ? `${p.marca} ${p.nombre}` : "", v?.color].filter(Boolean).join(" · ");

    // ------------------------------------------------------------------ diferencias y clasificación
    const tallasAjustadas = () => ({ racional: comun().racional, equivalentes: comun().equivalentes });
    function diferenciasDe(e, r) {
      if (!["actualizar", "foto"].includes(r.modo) || !r.variante || r.cerrada) return null;
      const proveedor = proveedorActual();
      return I().diferencias({ entrega: e, destino: { producto: r.producto, variante: r.variante }, anterior: proveedor ? I().ultimo(memoria.historial, proveedor, r.variante.id) : null,
        // Una entrega sin coste elegido no borra el último coste conocido.
        anteriorCoste: proveedor ? I().ultimo(memoria.historial, proveedor, r.variante.id, { conCoste: true }) : null,
        anunciadas: I().compararAnunciadas({ historial: proveedor ? memoria.historial : [], proveedor, variante: r.variante.id, entrega: e.entrega, lugar: e.lugar, fecha: e.fecha, tallas: e.tallas, ...tallasAjustadas() }),
        elegido: verSel(e.id).coste, ...tallasAjustadas() });
    }
    // Fechas de la entrega frente a lo último revisado del proveedor. pendientes: las que piden confirmación.
    function situacionFechas(e) {
      const ultima = proveedorActual() ? I().ultimaFecha(memoria.historial, proveedorActual()) : null;
      const lista = e.fechas.map((d) => ({ ...d, situacion: I().situarFecha(d.fecha, ultima), ultima }));
      return { ultima, lista, pendientes: lista.filter((d) => ["anterior", "desconocida"].includes(d.situacion) && !lote().inventario?.fechas?.[claveFecha(d.id)]) };
    }
    function analizar(e) {
      const r = resolver(e);
      const dif = diferenciasDe(e, r);
      const fechas = situacionFechas(e);
      const tipos = new Set();
      if (r.modo === "omitir") tipos.add("omitidas");
      else if (r.modo === "nueva") { tipos.add("nuevas"); if (e.clase === "pdf" && !e.anadida && (e.r.incompatible || e.r.dudas.length)) tipos.add("revisar"); }
      else if (r.cerrada) tipos.add(contextoFijo(e.id)?.enCurso ? "revisar" : "sin");
      else if (!r.modo || !r.confirmada || r.bloqueo) tipos.add("revisar");
      else if (r.modo === "color") { tipos.add("colores"); if (fechas.pendientes.length) tipos.add("revisar"); }
      else {
        if (dif.marcas.precio) tipos.add("precio");
        if (dif.marcas.tallas) tipos.add("tallas");
        if (r.modo === "foto" && !r.dec.aplicada) tipos.add("fotos");
        if (dif.coste.estado === "por-elegir" || (tipos.size && fechas.pendientes.length)) tipos.add("revisar");
        if (selPorRevisar(e, r)) tipos.add("revisar");
        if (!tipos.size) tipos.add("sin");
      }
      return { e, r, dif, fechas, tipos };
    }

    // ------------------------------------------------------------------ selección de cambios
    function margenLote() {
      const n = String(lote().margen || "").trim() ? comun().entero(lote().margen) : NaN;
      return Number.isInteger(n) && n >= 0 && n <= comun().LIM.precioMax ? n : null;
    }
    function precioElegido(x) {
      const { modo, valor } = verSel(x.e.id).precio;
      if (modo === "sugerida") return x.dif.sugerida ? { valor: x.dif.sugerida } : { error: "Esta entrega no trae venta sugerida." };
      if (modo === "ajuste") return x.dif.coste.valor !== null && margenLote() !== null ? { valor: x.dif.coste.valor + margenLote() } : { error: "Falta el coste elegido o el importe de «Ajustes para varias fichas»." };
      if (modo === "otro") {
        const n = comun().entero(valor);
        return String(valor).trim() && Number.isInteger(n) && n > 0 && n <= comun().LIM.precioMax ? { valor: n } : { error: "Escribe el precio en pesos enteros, sin puntos ni símbolos." };
      }
      return { valor: null };
    }
    function datosColor(x) {
      const { e, r } = x;
      const d = r.dec;
      if (e.clase === "wa") return { id: d.nuevoId, color: mayus(e.c.color.trim()), venta: comun().entero(e.c.venta), tallas: e.tallas, errorTallas: ctx.texto().leerCampoTallas(e.c.tallasTexto).error,
        muestra: e.c.muestra.trim() ? e.c.muestra.trim().toLowerCase() : null, forma: comun().formaValida(e.c.forma), activa: d.visible === true || !r.producto?.activo };
      const n = d.nuevo || {};
      const leidas = ctx.texto().leerCampoTallas(n.tallas ?? e.tallas.join("; "));
      return { id: d.nuevoId, color: mayus(String(n.color ?? e.leido.color).trim()), venta: comun().entero(n.venta ?? ""), tallas: leidas.tallas, errorTallas: leidas.error, muestra: null, forma: "circulo", activa: d.visible === true || !r.producto?.activo };
    }
    function erroresColor(x) {
      const n = datosColor(x);
      const errores = [];
      if (!n.color) errores.push("Escribe el nombre del color.");
      else if (n.color.length > comun().LIM.color) errores.push(`El color admite hasta ${comun().LIM.color} caracteres.`);
      else if ((x.r.producto?.variantes || []).some((v) => mayus(v.color.trim()) === n.color)) errores.push(`La zapatilla ya tiene un color ${n.color}.`);
      if (!Number.isInteger(n.venta) || n.venta <= 0 || n.venta > comun().LIM.precioMax) errores.push("Fija el precio de venta del color (número entero de pesos).");
      if (n.errorTallas) errores.push(n.errorTallas);
      if (n.muestra && !comun().MUESTRA_HEX.test(n.muestra)) errores.push("El tono del círculo debe ser un hexadecimal como #E8DCC8.");
      return errores;
    }
    const avisoFecha = (x) => `Confirma primero la fecha de ${x.fechas.pendientes.map((d) => `«${d.nombre}»`).join(" y ")}.`;
    const fotosDe = (e) => (e.clase === "wa" ? e.c.fotos.filter((x) => x.estado === "lista" || x.estado === "subida") : e.r.t.foto?.ref ? [e.r.t.foto] : []);
    /* Cambios elegidos de una entrada: [{ tipo, … , texto }] y sus errores. Lo no elegido no cuenta. */
    function cambiosDe(x) {
      const { e, r, dif } = x;
      const cambios = [];
      const errores = [];
      if (!["color", "actualizar", "foto"].includes(r.modo) || !r.confirmada || r.bloqueo || r.cerrada || selPorRevisar(e, r)) return { cambios, errores };
      const s = verSel(e.id);
      if (r.modo === "color") {
        if (s.color === false) return { cambios, errores };
        const fallos = erroresColor(x);
        if (fallos.length) return { cambios, errores: fallos };
        if (x.fechas.pendientes.length) return { cambios, errores: [avisoFecha(x)] };
        const n = datosColor(x);
        cambios.push({ tipo: "color", entrada: e.id, variante: n.id, nuevo: n, texto: `color nuevo ${n.color} a ${formatoPesos(n.venta)}${n.tallas.length ? `, tallas ${n.tallas.join(", ")} por revisar` : ""}` });
        return { cambios, errores };
      }
      const precio = precioElegido(x);
      if (precio.error) errores.push(precio.error);
      else if (precio.valor !== null && precio.valor !== r.variante.precio) cambios.push({ tipo: "precio", entrada: e.id, variante: r.variante.id, valor: precio.valor, texto: `precio de venta ${formatoPesos(r.variante.precio)} → ${formatoPesos(precio.valor)}` });
      for (const t of dif.tallas.nuevas) if (s.tallas.includes(t)) cambios.push({ tipo: "talla", entrada: e.id, variante: r.variante.id, talla: t, texto: `talla ${t} (por revisar)` });
      if (r.modo === "foto" && s.foto !== false && !r.dec.aplicada) {
        const lista = fotosDe(e);
        if (!lista.length) errores.push("No hay una fotografía lista para añadir.");
        for (const f of lista) cambios.push({ tipo: "foto", entrada: e.id, variante: r.variante.id, foto: f, texto: "fotografía al final de la galería" });
      }
      if (cambios.length && x.fechas.pendientes.length) return { cambios: [], errores: [...errores, avisoFecha(x)] };
      return { cambios, errores };
    }
    function resumen() {
      const lista = entradas().map(analizar);
      const cuenta = Object.fromEntries(FILTROS.map(([k]) => [k, 0]));
      cuenta.todas = lista.length;
      for (const x of lista) for (const t of x.tipos) cuenta[t] += 1;
      const grupos = new Map();
      const errores = [];
      for (const x of lista) {
        const c = cambiosDe(x);
        if (c.errores.length) errores.push({ x, errores: c.errores });
        if (!c.cambios.length) continue;
        const p = x.r.producto;
        if (!grupos.has(p.id)) grupos.set(p.id, { producto: p, entradas: [] });
        grupos.get(p.id).entradas.push({ x, cambios: c.cambios });
      }
      const destinos = lista.filter((x) => x.r.variante || (x.r.modo === "color" && x.r.producto));
      return { lista, cuenta, grupos, errores,
        productos: new Set(destinos.map((x) => x.r.producto.id)).size,
        colores: new Set(destinos.filter((x) => x.r.variante).map((x) => x.r.variante.id)).size,
        tarjetas: lista.filter((x) => x.e.clase === "pdf").length, publicaciones: lista.filter((x) => x.e.clase === "wa").length };
    }
    const nuevasDelLote = () => lote().fichas.filter((f) => ctx.editable(f) && f.seleccionada && ctx.conContenido(f) && !fichaResuelta(f)).length;
    // Zapatillas existentes con cambios elegidos y todavía sin aplicar (se aplican aparte de «Guardar lote»).
    const porAplicar = () => (lote() && abierto() ? resumen().grupos.size : 0);
    // Una ficha necesita decisión aquí: que la sección esté a la vista.
    const asegurar = () => { if (abierto() && !$("#imp-novedades")) ctx.pintar(); };
    const textoCambios = (cambios) => {
      const n = (t) => cambios.filter((c) => c.tipo === t).length;
      const partes = [];
      for (const [t, uno, varios] of [["color", "1 color nuevo", "colores nuevos"], ["precio", "1 precio", "precios"], ["talla", "1 talla nueva", "tallas nuevas"], ["foto", "1 fotografía", "fotografías"]]) if (n(t)) partes.push(n(t) === 1 ? uno : `${n(t)} ${varios}`);
      return partes.join(", ");
    };

    // ------------------------------------------------------------------ pintar
    const insignia = (texto, clase = "") => nodo("span", `importador-nov-marca ${clase}`.trim(), texto);
    function urlFoto(ruta) {
      try { const u = new URL(String(ruta || ""), new URL("../", location.href)); return ["http:", "https:"].includes(u.protocol) ? u.href : ""; } catch { return ""; }
    }
    function miniaturaDestino(v, alt) {
      const foto = [...(v?.fotos || [])].sort((a, b) => a.orden - b.orden)[0];
      const url = foto ? urlFoto(foto.ruta) : "";
      if (!url) return nodo("span", "importador-pdf-sinfoto", "Sin foto");
      const img = nodo("img", "importador-pdf-miniatura");
      img.src = url;
      img.alt = alt;
      img.loading = "lazy";
      img.decoding = "async";
      return img;
    }
    function miniaturaOrigen(e) {
      if (e.clase === "pdf") return ctx.miniaturaPdf(e.r.t, `Foto de ${e.nombre}`);
      const f = e.c.fotos.find((x) => x.vistaPrevia);
      if (!f) return nodo("span", "importador-pdf-sinfoto", "Sin foto");
      const img = nodo("img", "importador-pdf-miniatura");
      img.src = f.vistaPrevia;
      img.alt = `Foto de ${e.nombre}`;
      return img;
    }
    const estadoProducto = (p) => (p.retirado_en ? "retirada" : p.activo ? "publicada" : "oculta");

    function pintar() {
      const s = nodo("section", "editor-seccion importador-novedades");
      s.id = "imp-novedades";
      s.setAttribute("aria-labelledby", "imp-novedades-titulo");
      const h = nodo("h3", "editor-seccion-titulo", "Novedades y diferencias");
      h.id = "imp-novedades-titulo";
      h.tabIndex = -1;
      s.append(h, nodo("p", "campo-ayuda", "Compara esta entrega con tu catálogo antes de escribir. Reconocer una foto no cambia nada: solo se aplican los cambios que elijas, en una operación por zapatilla, y cada una conserva su estado (publicada u oculta)."));
      const inv = estado();
      if (inv.aviso) {
        const p = nodo("p", `importador-borradores-aviso es-${inv.aviso.tipo}`, inv.aviso.texto);
        p.id = "imp-nov-aviso";
        p.tabIndex = -1;
        p.setAttribute("role", "status");
        s.append(p);
      }
      if (!ctx.almacenOk()) s.append(nodo("p", "editor-nota", "Este navegador no permite guardar la memoria de reconocimiento: puedes comparar y preparar cambios, pero no aplicarlos aquí, porque antes de escribir hay que guardar la operación para poder recuperarla. Las relaciones tampoco se recordarán. Puedes exportar un respaldo y continuar en otro navegador."));
      else if (errorMemoria) s.append(nodo("p", "editor-nota", errorMemoria));
      s.append(pintarProveedor());
      const k = resumen();
      for (const aviso of pintarFechas(k)) s.append(aviso);
      s.append(...pintarOperaciones(inv));
      if (!k.lista.length) s.append(nodo("p", "editor-vacio", "Todavía no hay entradas: importa un catálogo PDF o añade publicaciones con sus fotos."));
      else s.append(...pintarLista(k));
      s.append(pintarMemoria());
      return s;
    }
    function pintarProveedor() {
      const actual = proveedorActual();
      const det = nodo("details", "importador-nov-proveedor");
      det.id = "imp-nov-proveedor";
      det.open = !actual || ui.proveedorAbierto;
      det.dataset.pintado = String(det.open);
      const sum = nodo("summary", "", "");
      sum.id = "imp-nov-proveedor-resumen";
      sum.append("Proveedor de esta entrega: ", nodo("strong", "", actual ? nombreProveedor(actual) : "sin elegir"));
      if (!actual) sum.append(" ", nodo("span", "importador-revisar", "Revisar"));
      det.append(sum, nodo("p", "campo-ayuda", "Las relaciones recordadas son de un solo proveedor. Con un perfil se usa la identidad del perfil (aunque cambien sus reglas); el Perfil general no tiene proveedor: elígelo o créalo."));
      const grupo = nodo("fieldset", "editor-opciones");
      grupo.append(nodo("legend", "", "¿De qué proveedor es?"));
      const lista = nodo("div", "editor-opciones-lista");
      const conocidos = proveedoresConocidos();
      conocidos.forEach((p, i) => {
        const caja = nodo("label", "casilla");
        const radio = nodo("input");
        radio.type = "radio";
        radio.name = "imp-nov-proveedor";
        radio.id = `imp-nov-proveedor-${i}`;
        radio.value = p.id;
        radio.checked = p.id === actual;
        radio.dataset.nov = "proveedor";
        caja.append(radio, nodo("span", "", p.nombre));
        lista.append(caja);
      });
      grupo.append(lista);
      if (!conocidos.length) grupo.append(nodo("p", "campo-ayuda", "Todavía no hay proveedores."));
      det.append(grupo);
      const nuevo = nodo("div", "importador-nov-nuevo-proveedor");
      const c = campo({ id: "imp-nov-proveedor-nombre", etiqueta: "Otro proveedor", valor: ui.nuevoProveedor, max: 80, datos: { nov: "proveedor-nombre" } });
      if (ui.errorProveedor) { const p = nodo("p", "campo-error", ui.errorProveedor); p.id = "imp-nov-proveedor-error"; c.querySelector("input").setAttribute("aria-invalid", "true"); c.querySelector("input").setAttribute("aria-describedby", p.id); c.append(p); }
      nuevo.append(c, boton("Crear proveedor", "nov-proveedor-crear"));
      det.append(nuevo);
      return det;
    }
    function pintarFechas(k) {
      const cajas = [];
      const vistos = new Set();
      for (const x of k.lista) for (const d of x.fechas.lista) {
        if (!["color", "actualizar", "foto"].includes(x.r.modo) || x.r.cerrada) continue;
        if (vistos.has(d.id) || !["anterior", "desconocida"].includes(d.situacion)) continue;
        vistos.add(d.id);
        const caja = nodo("div", "importador-pdf-fechas importador-nov-fecha");
        const p = nodo("p", "", d.situacion === "anterior"
          ? `«${d.nombre}» es del ${ctx.fechaDoc(d.fecha)}: es ANTERIOR al último documento revisado de este proveedor (${ctx.fechaDoc(d.ultima)}). No se trata como lo más reciente.`
          : `La fecha de «${d.nombre}» no se conoce: revísala. Sus datos no se tratan como los más recientes.`);
        const casilla = nodo("label", "casilla");
        const check = nodo("input");
        check.type = "checkbox";
        check.id = `imp-nov-fecha-${vistos.size}`;
        check.checked = Boolean(estado().fechas[claveFecha(d.id)]);
        Object.assign(check.dataset, { nov: "fecha", doc: d.id });
        casilla.append(check, nodo("span", "", d.situacion === "anterior" ? "Lo sé: permitir aplicar cambios de este documento anterior" : "La revisé: permitir aplicar cambios sin fecha conocida"));
        caja.append(p, casilla);
        cajas.push(caja);
      }
      return cajas;
    }
    function pintarOperaciones(inv) {
      const piezas = [];
      const lista = operaciones();
      if (lista.length) {
        const ul = nodo("ul", "importador-nov-operaciones");
        ul.setAttribute("aria-label", "Resultado de las actualizaciones");
        for (const op of lista) {
          const li = nodo("li", `importador-nov-operacion es-${op.estado}`);
          li.dataset.operacion = op.producto;
          li.append(nodo("strong", "", `${op.nombre}${op.codigo ? ` · ${op.codigo}` : ""}`), nodo("p", "", op.mensaje || ""));
          if (["guardando", "sin-confirmar"].includes(op.estado) && op.proveedor !== undefined && op.proveedor !== proveedorActual()) li.append(nodo("p", "", `Enviada ${op.proveedor ? `con el proveedor ${citarProveedor(op.proveedor)}` : "sin proveedor"}. Se comprueba con su propio identificador.`));
          const fila = nodo("div", "editor-botones");
          if (op.estado === "sin-confirmar") fila.append(boton("Comprobar otra vez", "nov-comprobar", "boton boton-secundario boton-compacto", { producto: op.producto }), boton("Reintentar", "nov-reintentar", "boton boton-secundario boton-compacto", { producto: op.producto }));
          if (op.estado === "sin-respaldo") fila.append(boton("Reintentar", "nov-reintentar", "boton boton-secundario boton-compacto", { producto: op.producto }));
          if (op.estado === "sin-respaldo" || op.sinGuardar) fila.append(boton("Exportar respaldo", "exportar-actual", "boton boton-secundario boton-compacto"));
          if (["aplicada", "conflicto"].includes(op.estado)) fila.append(boton("Abrir en el editor", "abrir-editor", "boton boton-secundario boton-mini", { producto: op.producto }));
          if (op.estado !== "sin-confirmar" && op.estado !== "guardando") fila.append(boton("Cerrar aviso", "nov-cerrar-operacion", "boton boton-texto boton-mini", { producto: op.producto }));
          if (fila.childElementCount) li.append(fila);
          ul.append(li);
        }
        piezas.push(ul);
      }
      if (inv.porRecordar.length) {
        const caja = nodo("div", "importador-confirmar");
        caja.id = "imp-nov-pendiente-memoria";
        caja.setAttribute("role", "alert");
        caja.append(nodo("p", "", `Los cambios del catálogo ya están guardados, pero la memoria de este navegador no: ${inv.porRecordar.length === 1 ? "queda 1 registro" : `quedan ${inv.porRecordar.length} registros`} por anotar. Reintentar no repite ninguna escritura del catálogo.`));
        const fila = nodo("div", "editor-botones");
        fila.append(boton("Reintentar guardar en la memoria", "nov-memoria-reintentar", "boton boton-principal boton-compacto"));
        caja.append(fila);
        piezas.push(caja);
      }
      return piezas;
    }
    function filtroActual(k) {
      const f = estado().filtro;
      if (f && (f === "todas" || k.cuenta[f] !== undefined)) return f;
      return k.cuenta.revisar ? "revisar" : "todas";
    }
    function pintarLista(k) {
      const piezas = [];
      const inv = estado();
      const filtro = filtroActual(k);
      const origenes = [k.tarjetas ? `${k.tarjetas} ${k.tarjetas === 1 ? "tarjeta" : "tarjetas"} del documento` : "", k.publicaciones ? `${k.publicaciones} ${k.publicaciones === 1 ? "publicación" : "publicaciones"}` : ""].filter(Boolean).join(" y ");
      const r = nodo("p", "importador-pegado-resumen", `${origenes}. Corresponden a ${k.productos === 1 ? "1 zapatilla" : `${k.productos} zapatillas`} y ${k.colores === 1 ? "1 color" : `${k.colores} colores`} que ya tienes (varias fotografías pueden ser del mismo color).`);
      r.id = "imp-nov-resumen";
      r.tabIndex = -1;
      r.setAttribute("role", "status");
      piezas.push(r);
      const vistas = nodo("div", "importador-pdf-vistas importador-nov-filtros");
      vistas.setAttribute("role", "group");
      vistas.setAttribute("aria-label", "Qué novedades ver");
      for (const [v, etiqueta] of FILTROS) {
        if (["fotos", "omitidas"].includes(v) && !k.cuenta[v] && filtro !== v) continue;
        const b = boton(`${etiqueta} (${k.cuenta[v]})`, "nov-filtro", `boton boton-compacto ${filtro === v ? "boton-principal" : "boton-secundario"}`, { filtro: v });
        b.id = `imp-nov-filtro-${v}`;
        b.setAttribute("aria-pressed", String(filtro === v));
        vistas.append(b);
      }
      piezas.push(vistas);
      const visibles = k.lista.filter((x) => filtro === "todas" || x.tipos.has(filtro) || ui.fijas.has(x.e.id));
      const masivas = pintarMasivas(visibles, k);
      if (masivas) piezas.push(masivas);
      const ol = nodo("ol", "importador-pdf-lista importador-nov-lista");
      ol.id = "imp-nov-lista";
      ol.setAttribute("aria-label", "Entradas de la entrega");
      for (const x of visibles) ol.append(pintarEntrada(x));
      if (!visibles.length) piezas.push(nodo("p", "campo-ayuda", "No hay entradas en este filtro."));
      piezas.push(ol, pintarAplicar(k, inv));
      return piezas;
    }
    function pintarMasivas(visibles) {
      const fila = nodo("div", "editor-botones importador-nov-masivas");
      const conTallas = visibles.filter((x) => x.r.confirmada && x.dif?.tallas.nuevas.some((t) => !verSel(x.e.id).tallas.includes(t)));
      if (conTallas.length) fila.append(boton(`Elegir las tallas nuevas a la vista (${conTallas.reduce((n, x) => n + x.dif.tallas.nuevas.length, 0)})`, "nov-tallas-visibles"));
      const sinRecordar = proveedorActual() ? fichasPorRecordar() : [];
      if (sinRecordar.length) fila.append(boton(`Recordar las fotos de las zapatillas nuevas del lote (${sinRecordar.length})`, "nov-recordar-nuevas"));
      const revisables = porRevisar();
      if (revisables.length) fila.append(boton(`Dar por revisadas sin cambios (${revisables.length})`, "nov-revisadas"));
      return fila.childElementCount ? fila : null;
    }
    const colorRecordable = (c) => c.fotos.some((x) => I().identidadValida(x.identidad));
    function fichasPorRecordar() {
      return lote().fichas.filter((f) => ctx.editable(f) && !fichaResuelta(f)).flatMap((f) => f.colores.filter((c) => colorRecordable(c) && !c.recordar));
    }
    // Reconocidas y confirmadas, sin cambios elegidos y sin anotar todavía en el historial de esta entrega.
    function porRevisar() {
      if (!proveedorActual() || !ctx.almacenOk()) return [];
      return entradas().map(analizar).filter(revisable);
    }
    function revisable(x) {
      if (!proveedorActual() || !ctx.almacenOk() || !x.dif || !x.r.confirmada || x.dif.coste.estado === "por-elegir" || x.fechas.pendientes.length || selPorRevisar(x.e, x.r) || cambiosDe(x).cambios.length) return false;
      return x.dif.anunciadas.estado === "cambio" || !memoria.historial.some((h) => h.id === I().idHistorial(proveedorActual(), x.r.variante.id, x.e.entrega, x.e.lugar));
    }

    function pintarEntrada(x) {
      const { e, r, dif, tipos } = x;
      const li = nodo("li", `importador-pdf-tarjeta importador-novedad${tipos.has("revisar") ? " es-dudosa" : ""}${tipos.has("omitidas") ? " es-excluido" : ""}`);
      li.id = `imp-nov-${e.id}`;
      li.dataset.entrada = e.id;
      const titulo = [e.leido.marca, e.leido.modelo].filter(Boolean).join(" ") || e.texto.split(" · ")[0] || "Sin descripción";
      const h = nodo("h4", "importador-fragmento-titulo", `${e.nombre} · ${titulo}`);
      h.id = `imp-nov-${e.id}-titulo`;
      h.tabIndex = -1;
      li.setAttribute("aria-labelledby", h.id);
      const cab = nodo("div", "importador-fragmento-cabecera");
      const marcas = nodo("span", "importador-nov-marcas");
      for (const [t, etiqueta] of [["nuevas", "Zapatilla nueva"], ["colores", "Color nuevo"], ["precio", "Precio"], ["tallas", "Tallas"], ["fotos", "Fotografía"], ["sin", "Sin cambios"], ["revisar", "Revisar"], ["omitidas", "Omitida"]]) if (tipos.has(t)) marcas.append(insignia(etiqueta, `es-${t}`));
      cab.append(h, marcas);
      li.append(cab);
      // Origen y destino, lado a lado.
      const comparar = nodo("div", "importador-nov-comparar");
      const origen = nodo("div", "importador-nov-lado");
      const datos = nodo("div", "importador-nov-datos");
      datos.append(nodo("p", "importador-nov-rotulo", "En la entrega"), nodo("p", "importador-nov-principal", [e.leido.color || "color sin indicar", ctx.textoPublico(e.leido.publico) || "público sin indicar"].join(" · ")),
        nodo("p", "importador-nov-detalle", `${e.documento} · ${e.lugarTexto} · ${e.fecha ? ctx.fechaDoc(e.fecha) : "fecha desconocida"}`));
      origen.append(miniaturaOrigen(e), datos);
      const destino = nodo("div", "importador-nov-lado");
      const datosDestino = nodo("div", "importador-nov-datos");
      datosDestino.append(nodo("p", "importador-nov-rotulo", "En tu catálogo"));
      if (r.producto) {
        datosDestino.append(nodo("p", "importador-nov-principal", r.modo === "color" ? `${r.producto.marca} ${r.producto.nombre} · color nuevo` : nombreDestino(r.producto, r.variante)),
          nodo("p", "importador-nov-detalle", [r.modo === "color" ? r.producto.codigo_interno : r.variante?.codigo_variante || r.producto.codigo_interno, ctx.textoPublico(r.producto.publico) || "sin público", estadoProducto(r.producto), r.variante && !r.variante.activa ? "color desactivado" : ""].filter(Boolean).join(" · ")));
        destino.append(r.modo === "color" ? nodo("span", "importador-pdf-sinfoto", "Color nuevo") : miniaturaDestino(r.variante, `Foto actual de ${nombreDestino(r.producto, r.variante)}`), datosDestino);
      } else {
        const texto = r.modo === "nueva" ? (r.estado === "anadida" ? `Añadida al lote: ficha ${ctx.numero(e.anadida.ficha)}` : "No está: se crea como zapatilla nueva") : r.modo === "omitir" ? "No se usa" : "Sin destino todavía";
        datosDestino.append(nodo("p", "importador-nov-principal", texto));
        destino.append(nodo("span", "importador-pdf-sinfoto", "—"), datosDestino);
      }
      comparar.append(origen, destino);
      li.append(comparar);
      if (r.motivo || r.bloqueo) {
        const p = nodo("p", `importador-nov-motivo${r.bloqueo || !r.confirmada ? " es-revisar" : ""}`, [r.bloqueo, r.motivo].filter(Boolean).join(" "));
        p.id = `imp-nov-${e.id}-motivo`;
        li.append(p);
      }
      if (e.clase === "wa" && e.f.colores.length > 1 && r.modo !== "nueva" && r.modo !== "omitir") li.append(filaBotones(boton("Separar esta publicación", "nov-separar", "boton boton-secundario boton-compacto", { entrada: e.id })));
      if (!r.confirmada && r.candidatos.length && r.modo !== "nueva" && r.modo !== "omitir" && !r.producto) li.append(pintarCandidatos(x));
      if (r.estado === "anadida") return li;
      if (r.producto && !r.bloqueo && !r.confirmada && (r.modo === "color" || r.variante)) li.append(pintarConfirmar(x));
      if (selPorRevisar(e, r) && r.confirmada) li.append(pintarSelPorRevisar(x));
      if (dif && r.confirmada) li.append(pintarDiferencias(x));
      if (r.cerrada && r.dec.aplicada) li.append(nodo("p", "importador-pdf-estado", `Aplicado: ${r.dec.aplicada.texto}.`));
      if (r.modo === "color" && r.producto && r.confirmada && !r.cerrada && !r.dec.aplicada) li.append(pintarColorNuevo(x));
      const pie = pintarRecuerdo(x);
      if (pie) li.append(pie);
      li.append(pintarResolver(x));
      return li;
    }
    // Cambios elegidos con otro proveedor, destino o público: a la vista, pero sin aprobar.
    function pintarSelPorRevisar({ e, r }) {
      const s = verSel(e.id);
      const c = s.contexto;
      const caja = nodo("div", "importador-confirmar importador-nov-confirmar");
      caja.id = `imp-nov-${e.id}-revisar`;
      caja.setAttribute("role", "group");
      caja.setAttribute("aria-label", `Revisar los cambios elegidos de ${e.nombre}`);
      const elegidos = [s.precio.modo === "otro" ? `precio ${s.precio.valor || "sin escribir"}` : s.precio.modo !== "conservar" ? "otro precio de venta" : "", s.tallas.length ? `tallas ${s.tallas.join(", ")}` : "", s.coste !== null ? "coste del proveedor" : ""].filter(Boolean).join("; ");
      const origen = !c ? "No consta para qué destino los elegiste" : c.producto === r.producto.id && c.variante === (r.variante?.id || "") && c.proveedor === proveedorActual() ? "Los elegiste antes de que cambiaran los datos de la zapatilla o de la entrega"
        : `Los elegiste para ${c.texto || "otro destino"} ${c.proveedor ? `con ${citarProveedor(c.proveedor)}` : "sin proveedor"}`;
      caja.append(nodo("p", "", `Cambios por revisar (${elegidos}). ${origen}: se conservan, pero no se aplican hasta que los revises aquí.`),
        filaBotones(boton("Usar estos cambios aquí", "nov-sel-usar", "boton boton-principal boton-compacto", { entrada: e.id }), boton("Descartarlos", "nov-sel-descartar", "boton boton-secundario boton-compacto", { entrada: e.id })));
      return caja;
    }
    const filaBotones = (...lista) => { const f = nodo("div", "editor-botones importador-nov-botones"); f.append(...lista); return f; };
    function pintarCandidatos(x) {
      const { e, r } = x;
      const caja = nodo("div", "importador-nov-candidatos");
      caja.setAttribute("role", "group");
      caja.setAttribute("aria-label", `Destinos posibles de ${e.nombre}`);
      for (const c of r.candidatos) {
        const d = I().buscarDestino(catalogo(), c.producto, c.variante);
        const fila = nodo("div", "importador-nov-candidato");
        if (!d) { fila.append(nodo("span", "importador-pdf-sinfoto", "—"), nodo("span", "", `Ya no está en el catálogo: ${[c.asociacion?.etiqueta?.marca, c.asociacion?.etiqueta?.modelo, c.asociacion?.etiqueta?.color].filter(Boolean).join(" · ")}`)); caja.append(fila); continue; }
        fila.append(miniaturaDestino(d.variante, `Foto de ${nombreDestino(d.producto, d.variante)}`),
          nodo("span", "", `${nombreDestino(d.producto, d.variante)} · ${d.variante.codigo_variante} · ${ctx.textoPublico(d.producto.publico)} · ${estadoProducto(d.producto)}${c.exacta ? "" : " · foto parecida"}`));
        if (!d.producto.retirado_en) {
          const b = boton("Es este color", "nov-elegir", "boton boton-secundario boton-mini", { entrada: e.id, producto: c.producto, variante: c.variante });
          b.setAttribute("aria-label", `${e.nombre}: es ${nombreDestino(d.producto, d.variante)}`);
          fila.append(b);
        }
        caja.append(fila);
      }
      return caja;
    }
    function pintarConfirmar(x) {
      const { e, r } = x;
      const caja = nodo("div", "importador-confirmar importador-nov-confirmar");
      caja.setAttribute("role", "group");
      caja.setAttribute("aria-label", `Confirmar el destino de ${e.nombre}`);
      caja.append(nodo("p", "", r.modo === "color" ? `¿Es un color nuevo de ${r.producto.marca} ${r.producto.nombre}?` : `¿${e.nombre} es ${nombreDestino(r.producto, r.variante)}?`));
      const fila = filaBotones();
      const recordable = ctx.almacenOk() && e.identidades.length && proveedorActual();
      const b = boton("Confirmar y recordar esta relación", "nov-confirmar", "boton boton-principal boton-compacto", { entrada: e.id, recordar: "1" });
      if (!recordable) b.setAttribute("aria-disabled", "true");
      fila.append(b, boton("Usar solo esta vez", "nov-confirmar", "boton boton-secundario boton-compacto", { entrada: e.id, recordar: "0" }));
      caja.append(fila);
      if (!recordable) caja.append(nodo("p", "campo-ayuda", !proveedorActual() ? "Para recordarla, elige primero el proveedor." : !e.identidades.length ? "Esta entrada no tiene una fotografía de origen que recordar." : "Este navegador no permite recordar relaciones."));
      return caja;
    }
    const linea = (rotulo, ...contenido) => { const li = nodo("li", "importador-nov-diferencia"); li.append(nodo("strong", "", rotulo), ...contenido); return li; };
    function pintarDiferencias(x) {
      const { e, r, dif } = x;
      const s = verSel(e.id);
      const ul = nodo("ul", "importador-nov-diferencias");
      ul.setAttribute("aria-label", `Diferencias de ${e.nombre}`);
      // 1. Coste del proveedor: informativo; nunca cambia el precio de venta.
      const C = dif.coste;
      const conocida = dif.anteriorCoste;
      const cuando = conocida ? `última entrega conocida: ${conocida.documento || "sin documento"}, ${conocida.fecha ? ctx.fechaDoc(conocida.fecha) : "fecha desconocida"}` : "";
      const previo = C.previo === null ? "Sin historial" : `${formatoPesos(C.previo)} (${cuando})`;
      if (C.estado === "sin-dato") ul.append(linea("Coste del proveedor", nodo("p", "", `Último conocido: ${previo}. Esta entrega no trae coste.`)));
      else {
        const texto = C.estado === "sin-historial" ? `${formatoPesos(C.valor)}. Anterior: Sin historial.` : C.estado === "igual" ? `${formatoPesos(C.valor)}, igual que el último conocido (${cuando}).`
          : C.estado === "cambio" ? `${previo} → ${formatoPesos(C.valor)}. Tu precio de venta no cambia por esto.` : `Último conocido: ${previo}. Hay importes condicionados o varios: elige cuál es el coste.`;
        const l = linea("Coste del proveedor", nodo("p", "", texto));
        if (C.elegir && !C.mantenido) {
          const g = nodo("fieldset", `editor-opciones importador-nov-opciones${C.valor === null ? " es-revisar" : ""}`);
          g.append(nodo("legend", "solo-lectores", `Coste de ${e.nombre}`));
          const op = nodo("div", "editor-opciones-lista");
          e.costes.forEach((c, i) => op.append(opcion({ nombre: `imp-nov-${e.id}-coste`, valor: String(i), marcada: s.coste === i, texto: `${formatoPesos(c.importe)}${c.condicion ? ` (${c.condicion.toLocaleLowerCase("es")})` : ""}${c.general ? "" : ", condicionado"}`, datos: { nov: "coste", entrada: e.id } })));
          g.append(op);
          l.append(g);
        }
        ul.append(l);
      }
      // 2. Precio de venta: se conserva salvo elección expresa.
      const notas = [];
      if (dif.sugerida) notas.push(`Venta sugerida: ${formatoPesos(dif.sugerida)}${dif.previaSugerida !== null ? (dif.previaSugerida === dif.sugerida ? " (igual que en la última revisión)" : ` (en la última revisión, ${formatoPesos(dif.previaSugerida)})`) : ""}.`);
      const lp = linea("Precio de venta", nodo("p", "", `Actual: ${formatoPesos(r.variante.precio)}. ${notas.join(" ")}`.trim()));
      const g = nodo("fieldset", "editor-opciones importador-nov-opciones");
      g.append(nodo("legend", "solo-lectores", `Precio de venta de ${e.nombre}`));
      const op = nodo("div", "editor-opciones-lista");
      const precios = [["conservar", `Conservar ${formatoPesos(r.variante.precio)}`]];
      if (dif.sugerida && dif.sugerida !== r.variante.precio) precios.push(["sugerida", `Usar la venta sugerida ${formatoPesos(dif.sugerida)}`]);
      if (C.valor !== null && margenLote() !== null && C.valor + margenLote() !== r.variante.precio) precios.push(["ajuste", `Coste + ajuste del lote (${formatoPesos(margenLote())}) = ${formatoPesos(C.valor + margenLote())}`]);
      precios.push(["otro", "Escribir otro precio"]);
      for (const [v, t] of precios) op.append(opcion({ nombre: `imp-nov-${e.id}-precio`, valor: v, marcada: s.precio.modo === v || (v === "conservar" && !precios.some(([z]) => z === s.precio.modo)), texto: t, datos: { nov: "precio", entrada: e.id } }));
      g.append(op);
      if (s.precio.modo === "otro") {
        const c = campo({ id: `imp-nov-${e.id}-otro`, etiqueta: "Precio de venta (COP)", valor: s.precio.valor, modo: "numeric", max: 12, datos: { nov: "precio-valor", entrada: e.id } });
        const fallo = precioElegido(x).error;
        if (fallo && String(s.precio.valor).trim()) c.append(nodo("p", "campo-error", fallo));
        g.append(c);
      }
      lp.append(g);
      ul.append(lp);
      // 3. Tallas: solo se proponen las nuevas; las ausentes y las existentes se conservan.
      const T = dif.tallas;
      const ordenadas = (lista) => [...lista].sort((a, b) => panel().valorTalla(a) - panel().valorTalla(b));
      const enumerar = (lista) => { const l = ordenadas(lista); return l.length > 1 ? `${l.slice(0, -1).join(", ")} y ${l[l.length - 1]}` : l[0]; };
      const actuales = ordenadas((r.variante.tallas || []).map((t) => t.talla));
      const lt = linea("Tallas", nodo("p", "", `Actuales: ${actuales.join(", ") || "ninguna"}. En la entrega: ${e.tallas.join(", ") || "sin indicar"}${e.porRegla ? " (por la regla del perfil)" : ""}.`));
      if (T.nuevas.length) {
        const gt = nodo("fieldset", "editor-opciones importador-nov-opciones");
        gt.append(nodo("legend", "", "Tallas nuevas (nacen «por revisar»; no confirma disponibilidad)"));
        const lista = nodo("div", "editor-opciones-lista");
        for (const t of T.nuevas) lista.append(opcion({ tipo: "checkbox", nombre: `imp-nov-${e.id}-talla`, valor: t, marcada: s.tallas.includes(t), texto: `Añadir ${t}`, datos: { nov: "talla", entrada: e.id } }));
        gt.append(lista);
        lt.append(gt);
      }
      // Lo que el proveedor anuncia distinto que en la última entrega revisada (aparte de lo que hay en el catálogo).
      const A = dif.anunciadas;
      if (A.estado === "cambio") {
        const enCatalogo = (t) => (r.variante.tallas || []).some((x) => comun().equivalentes(comun().racional(x.talla), comun().racional(t)));
        const quedan = A.retiradas.filter(enCatalogo);
        const fuera = A.retiradas.filter((t) => !enCatalogo(t));
        const doc = A.anterior;
        const p = nodo("p", "importador-nov-detalle", `Frente a la última entrega revisada (${doc.documento || "sin documento"}, ${doc.fecha ? ctx.fechaDoc(doc.fecha) : "fecha desconocida"}), que anunciaba ${ordenadas(doc.revisado.tallas).join(", ")}:`);
        lt.append(p);
        const cambios = nodo("ul", "importador-nov-anunciadas");
        if (quedan.length) cambios.append(nodo("li", "", `Esta entrega ya no menciona ${enumerar(quedan)}. Se ${quedan.length === 1 ? "conserva" : "conservan"} en el catálogo; no se desactivó nada.`));
        if (fuera.length) cambios.append(nodo("li", "", `Esta entrega ya no menciona ${enumerar(fuera)} (no ${fuera.length === 1 ? "está" : "están"} en tu catálogo).`));
        if (A.agregadas.length) cambios.append(nodo("li", "", `Ahora menciona también ${enumerar(A.agregadas)}. ${A.agregadas.some((t) => !T.nuevas.includes(t)) ? "Las que ya tienes no cambian de estado." : ""}`.trim()));
        lt.append(cambios);
        if (revisable(x)) lt.append(filaBotones(boton("Marcar como revisada", "nov-revisada", "boton boton-secundario boton-compacto", { entrada: e.id })), nodo("p", "campo-ayuda", "Solo se anota en la memoria de este navegador: el catálogo no cambia."));
        else {
          const falta = C.estado === "por-elegir" ? "elige antes el coste" : x.fechas.pendientes.length ? "confirma antes la fecha del documento" : "";
          if (falta) lt.append(nodo("p", "campo-ayuda", `Para marcarla como revisada, ${falta}.`));
        }
      }
      const sinMencion = T.ausentes.filter((t) => !(A.estado === "cambio" && A.retiradas.some((z) => comun().equivalentes(comun().racional(z), comun().racional(t)))));
      const conservan = [A.estado === "sin-dato" ? "Esta entrega no trae tallas: no se compara ni cambia nada." : "", sinMencion.length ? `No se mencionan y se conservan igual: ${sinMencion.join(", ")}.` : "", T.desactivadas.length ? `Mencionadas pero desactivadas en tu catálogo (no se activan): ${T.desactivadas.join(", ")}.` : ""].filter(Boolean).join(" ");
      if (conservan) lt.append(nodo("p", "importador-nov-detalle", conservan));
      ul.append(lt);
      if (r.modo === "foto" && !r.dec.aplicada) {
        const lf = linea("Fotografía", nodo("p", "", `La galería tiene ${(r.variante.fotos || []).length}. Se añade al final: no cambia la principal ni el orden.`));
        lf.append(opcion({ tipo: "checkbox", nombre: `imp-nov-${e.id}-foto`, valor: "1", marcada: s.foto !== false, texto: fotosDe(e).length > 1 ? `Añadir ${fotosDe(e).length} fotografías a ${r.variante.color}` : `Añadir esta fotografía a ${r.variante.color}`, datos: { nov: "foto", entrada: e.id } }));
        ul.append(lf);
      }
      const caja = nodo("div", "importador-nov-bloque");
      caja.append(ul);
      const { cambios, errores } = cambiosDe(x);
      const modifica = cambios.length ? `Se modificará: ${cambios.map((c) => c.texto).join("; ")}. ` : "No se modificará nada. ";
      const p = nodo("p", "importador-nov-efecto", `${modifica}Se conserva lo demás: nombre, color, códigos, referencias, galería, tallas existentes con su estado y vigencia, y el estado ${estadoProducto(r.producto)}.`);
      p.id = `imp-nov-${e.id}-efecto`;
      caja.append(p);
      for (const m of errores) caja.append(nodo("p", "campo-error", m));
      if (r.dec.aplicada) caja.append(nodo("p", "importador-pdf-estado", `Aplicado: ${r.dec.aplicada.texto}.`));
      return caja;
    }
    function opcion({ tipo = "radio", nombre, valor, marcada, texto, datos }) {
      const caja = nodo("label", "casilla");
      const n = nodo("input");
      n.type = tipo;
      n.name = nombre;
      n.id = `${nombre}-${String(valor).replace(/[^\w]/g, "_")}`;
      n.value = valor;
      n.checked = marcada;
      Object.assign(n.dataset, datos);
      caja.append(n, nodo("span", "", texto));
      return caja;
    }
    function pintarColorNuevo(x) {
      const { e, r } = x;
      const caja = nodo("div", "importador-nov-bloque");
      const n = r.dec.nuevo || {};
      if (e.clase === "pdf") {
        const rejilla = nodo("div", "importador-nov-campos");
        rejilla.append(campo({ id: `imp-nov-${e.id}-color`, etiqueta: "Color", valor: n.color ?? e.leido.color, max: comun().LIM.color, mayusculas: true, obligatorio: true, datos: { nov: "nuevo-color", entrada: e.id } }),
          campo({ id: `imp-nov-${e.id}-venta`, etiqueta: "Precio de venta (COP)", valor: n.venta ?? "", modo: "numeric", max: 12, obligatorio: true, ayuda: [e.ventaSugerida ? `Venta sugerida: ${formatoPesos(e.ventaSugerida)}.` : "", e.costes.length ? `Coste: ${e.costes.map((c) => `${formatoPesos(c.importe)}${c.condicion ? ` (${c.condicion.toLocaleLowerCase("es")})` : ""}`).join(" o ")}.` : ""].filter(Boolean).join(" "), datos: { nov: "nuevo-venta", entrada: e.id } }),
          campo({ id: `imp-nov-${e.id}-tallas`, etiqueta: "Tallas EU", valor: n.tallas ?? e.tallas.join("; "), max: 200, ayuda: "Nacen «por revisar».", datos: { nov: "nuevo-tallas", entrada: e.id } }));
        caja.append(rejilla);
        if (e.ventaSugerida && String(n.venta ?? "") !== String(e.ventaSugerida)) caja.append(filaBotones(boton(`Usar la venta sugerida ${formatoPesos(e.ventaSugerida)}`, "nov-usar-sugerida", "boton boton-secundario boton-mini", { entrada: e.id })));
      } else caja.append(nodo("p", "campo-ayuda", `Usa el color, el precio de venta, las tallas, el tono y las fotos de la ${e.nombre.toLocaleLowerCase("es")}, más abajo.`));
      if (r.producto.activo) {
        const g = nodo("fieldset", "editor-opciones importador-nov-opciones");
        g.append(nodo("legend", "", "La zapatilla está publicada. El color nuevo:"));
        const op = nodo("div", "editor-opciones-lista");
        op.append(opcion({ nombre: `imp-nov-${e.id}-visible`, valor: "no", marcada: r.dec.visible !== true, texto: "Se crea desactivado (no se ve en la tienda hasta que lo actives en el editor)", datos: { nov: "visible", entrada: e.id } }),
          opcion({ nombre: `imp-nov-${e.id}-visible`, valor: "si", marcada: r.dec.visible === true, texto: "Se ve en la tienda al aplicarlo", datos: { nov: "visible", entrada: e.id } }));
        g.append(op);
        caja.append(g);
      }
      caja.append(opcion({ tipo: "checkbox", nombre: `imp-nov-${e.id}-aplicar`, valor: "1", marcada: verSel(e.id).color !== false, texto: "Crear este color al aplicar los cambios", datos: { nov: "color", entrada: e.id } }));
      const { errores } = cambiosDe(x);
      for (const m of errores) caja.append(nodo("p", "campo-error", m));
      caja.append(nodo("p", "importador-nov-efecto", `Los demás colores de ${r.producto.nombre}, sus códigos, galerías y tallas se conservan. La zapatilla sigue ${estadoProducto(r.producto)}.`));
      return caja;
    }
    // Qué se recuerda de esta entrada (o qué falta para recordarla).
    function asociacionDe(e, variante) {
      const p = proveedorActual();
      return p && variante ? memoria.asociaciones.find((a) => a.proveedor === p && a.variante === variante && a.estado === "confirmada" && e.identidades.some((i) => i.tipo === a.tipo && i.exacta === a.exacta)) || null : null;
    }
    function pintarRecuerdo(x) {
      const { e, r } = x;
      if (!r.confirmada || r.cerrada || !["color", "actualizar", "foto"].includes(r.modo)) return null;
      const p = nodo("p", "importador-nov-recuerdo");
      const a = r.variante ? asociacionDe(e, r.variante.id) : null;
      if (a) {
        p.append(`Relación recordada para «${nombreProveedor(a.proveedor)}». `, boton("Olvidar", "nov-olvidar-entrada", "boton boton-texto boton-mini", { entrada: e.id }));
        p.lastChild.setAttribute("aria-label", `Olvidar la relación de ${e.nombre}`);
        return p;
      }
      if (r.modo === "color" && r.dec.recordar) { p.append("Relación pendiente: se recordará cuando se confirme la creación del color. ", boton("No recordar", "nov-no-recordar", "boton boton-texto boton-mini", { entrada: e.id })); return p; }
      if (!e.identidades.length || !ctx.almacenOk()) return null;
      const b = boton("Confirmar y recordar esta relación", "nov-confirmar", "boton boton-texto boton-mini", { entrada: e.id, recordar: "1" });
      if (!proveedorActual()) b.setAttribute("aria-disabled", "true");
      p.append("Se usa solo esta vez. ", b);
      return p;
    }
    function pintarResolver(x) {
      const { e, r } = x;
      const det = nodo("details", "importador-original importador-nov-resolver");
      det.id = `imp-nov-${e.id}-resolver`;
      const bloqueado = Boolean(r.dec.aplicada) || operacionEnCurso(e.id);
      det.open = (ui.resolver[e.id] ?? (!r.modo || (["color", "actualizar", "foto"].includes(r.modo) && (!r.producto || (r.modo !== "color" && !r.variante))))) && !bloqueado;
      det.dataset.pintado = String(det.open);
      det.append(nodo("summary", "", r.modo ? `Qué se hace: ${NOMBRE_MODO[r.modo].toLocaleLowerCase("es")} · Cambiar` : "Elige qué hacer con esta entrada"));
      if (bloqueado) { det.append(nodo("p", "campo-ayuda", "Esta entrada ya se aplicó o tiene un resultado por confirmar.")); return det; }
      const g = nodo("fieldset", `editor-opciones${r.modo ? "" : " es-revisar"}`);
      g.append(nodo("legend", "", "Esta entrada es para"));
      const op = nodo("div", "editor-opciones-lista");
      for (const m of MODOS) op.append(opcion({ nombre: `imp-nov-${e.id}-modo`, valor: m, marcada: r.modo === m, texto: NOMBRE_MODO[m], datos: { nov: "modo", entrada: e.id } }));
      g.append(op);
      det.append(g);
      if (["color", "actualizar", "foto"].includes(r.modo)) det.append(pintarBuscador({ id: `imp-nov-${e.id}`, texto: ui.resolver[`${e.id}:texto`] ?? [e.leido.marca, e.leido.modelo].filter(Boolean).join(" "), soloProducto: r.modo === "color", accion: "nov-elegir", datos: { entrada: e.id }, campoDato: "buscar" }));
      return det;
    }
    // Buscar en el catálogo una zapatilla (y un color): por código, referencia, marca, modelo o color.
    const normal = (t) => ctx.texto().clave(t);
    function buscarCatalogo(texto) {
      const palabras = normal(texto).split(" ").filter(Boolean);
      if (!palabras.length) return [];
      const puntos = (p) => {
        const todo = normal([p.marca, p.nombre, p.codigo_interno, p.referencia_proveedor, ctx.textoPublico(p.publico), ...(p.variantes || []).flatMap((v) => [v.color, v.codigo_variante, v.referencia_variante])].filter(Boolean).join(" "));
        return palabras.filter((w) => todo.includes(w)).length;
      };
      return catalogo().map((p) => ({ p, n: puntos(p) })).filter((x) => x.n >= Math.max(1, Math.ceil(palabras.length / 2))).sort((a, b) => b.n - a.n || a.p.nombre.localeCompare(b.p.nombre, "es")).slice(0, 8).map((x) => x.p);
    }
    function pintarBuscador({ id, texto, soloProducto, accion, datos, campoDato }) {
      const caja = nodo("div", "importador-nov-buscador");
      caja.append(campo({ id: `${id}-buscar`, etiqueta: soloProducto ? "Buscar la zapatilla" : "Buscar la zapatilla y el color", tipo: "search", valor: texto, max: 80, ayuda: "Código, referencia, marca, modelo o color. Una referencia puede repetirse: comprueba la foto.", datos: { nov: campoDato, ...datos } }));
      const ul = nodo("ul", "importador-nov-resultados");
      ul.setAttribute("aria-label", "Resultados en el catálogo");
      const lista = buscarCatalogo(texto);
      for (const p of lista) {
        const li = nodo("li", "importador-nov-resultado");
        li.append(nodo("p", "importador-nov-principal", `${p.marca} ${p.nombre} · ${p.codigo_interno} · ${ctx.textoPublico(p.publico) || "sin público"} · ${estadoProducto(p)}`));
        const fila = nodo("div", "importador-nov-colores");
        if (p.retirado_en) fila.append(nodo("span", "campo-ayuda", "Retirada: no se puede elegir."));
        else if (soloProducto) {
          const b = boton("Elegir esta zapatilla", accion, "boton boton-secundario boton-mini", { ...datos, producto: p.id });
          b.setAttribute("aria-label", `Elegir ${p.marca} ${p.nombre} ${p.codigo_interno}`);
          fila.append(b);
        } else for (const v of [...(p.variantes || [])].sort((a, b) => a.orden - b.orden)) {
          const b = boton("", accion, "boton boton-secundario boton-mini importador-nov-color", { ...datos, producto: p.id, variante: v.id });
          b.append(miniaturaDestino(v, ""), nodo("span", "", `${v.color} · ${v.codigo_variante}${v.activa ? "" : " · desactivado"}`));
          b.setAttribute("aria-label", `Elegir ${p.nombre} ${v.color} ${v.codigo_variante}`);
          fila.append(b);
        }
        li.append(fila);
        ul.append(li);
      }
      if (!lista.length) ul.append(nodo("li", "campo-ayuda", texto.trim() ? "Sin resultados." : "Escribe para buscar."));
      caja.append(ul);
      return caja;
    }
    function pintarAplicar(k) {
      const caja = nodo("div", "importador-nov-aplicar");
      const todos = [...k.grupos.values()].flatMap((g) => g.entradas.flatMap((x) => x.cambios));
      const nuevas = nuevasDelLote();
      const pendientesPdf = k.lista.filter((x) => x.tipos.has("nuevas") && x.e.clase === "pdf" && !x.e.anadida && x.e.r.incluir && x.e.r.raiz === x.e.r).length;
      const partes = [k.grupos.size
        ? `Actualizar: ${k.grupos.size === 1 ? "1 zapatilla existente" : `${k.grupos.size} zapatillas existentes`} (${textoCambios(todos)}); cada una conserva su estado publicado u oculto.`
        : "Actualizar: ningún cambio elegido en zapatillas existentes."];
      if (nuevas) partes.push(`Crear: ${nuevas === 1 ? "1 zapatilla nueva del lote, oculta" : `${nuevas} zapatillas nuevas del lote, ocultas`}, con «Guardar lote como oculto».`);
      if (pendientesPdf) partes.push(pendientesPdf === 1 ? "1 tarjeta nueva está sin añadir al lote." : `${pendientesPdf} tarjetas nuevas están sin añadir al lote.`);
      const p = nodo("p", "importador-nov-plan", partes.join(" "));
      p.id = "imp-nov-plan";
      p.setAttribute("role", "status");
      const b = boton(k.grupos.size ? `Aplicar cambios seleccionados (${k.grupos.size === 1 ? "1 zapatilla" : `${k.grupos.size} zapatillas`})` : "Aplicar cambios seleccionados", "nov-aplicar", "boton boton-principal");
      b.id = "imp-nov-aplicar";
      b.setAttribute("aria-describedby", p.id);
      if (!k.grupos.size || ctx.ocupado()) b.setAttribute("aria-disabled", "true");
      caja.append(p);
      if (k.errores.length) caja.append(nodo("p", "campo-error", `${k.errores.length === 1 ? "1 entrada tiene" : `${k.errores.length} entradas tienen`} datos por corregir y no se aplicará${k.errores.length === 1 ? "" : "n"}: ${k.errores.map((x) => x.x.e.nombre).join(", ")}.`));
      caja.append(b);
      return caja;
    }

    // ------------------------------------------------------------------ pintar la memoria
    function pintarMemoria() {
      const det = nodo("details", "importador-nov-memoria");
      det.id = "imp-memoria";
      det.open = ui.memoriaAbierta;
      const total = memoria.asociaciones.length;
      const sumario = nodo("summary", "", `Memoria de reconocimiento (${total === 1 ? "1 relación" : `${total} relaciones`})`);
      sumario.id = "imp-memoria-resumen";
      det.append(sumario,
        nodo("p", "campo-ayuda", "Relaciones entre fotografías del proveedor y colores de tu catálogo, guardadas solo en este navegador, para este proyecto y tu usuario. Olvidar una relación no cambia ni borra nada del catálogo. Si borras los datos del navegador se pierden: exporta la memoria."));
      if (!det.open) return det;
      const acciones = filaBotones();
      const exportar = boton("Exportar memoria", "nov-memoria-exportar");
      if (!total && !memoria.historial.length) exportar.setAttribute("aria-disabled", "true");
      const importar = nodo("label", "boton boton-secundario boton-compacto importador-importar", "Importar memoria");
      const archivo = nodo("input");
      archivo.type = "file";
      archivo.accept = "application/json,.json";
      archivo.className = "solo-lectores";
      archivo.id = "imp-memoria-archivo";
      archivo.dataset.nov = "memoria-archivo";
      // En el propio campo: la sección se puede repintar mientras el selector de archivos está abierto y el
      // aviso de un campo ya sustituido no llegaría a los oyentes del diálogo.
      archivo.addEventListener("change", (ev) => {
        ev.stopPropagation();
        const elegido = archivo.files?.[0];
        if (elegido && memoria.ambito && lote()) leerArchivoMemoria(elegido);
        archivo.value = "";
      });
      importar.htmlFor = archivo.id;
      importar.append(archivo);
      acciones.append(exportar, importar);
      det.append(acciones);
      if (importada) {
        const caja = nodo("div", "importador-confirmar");
        caja.id = "imp-memoria-importada";
        caja.setAttribute("role", "group");
        caja.setAttribute("aria-label", "Importar la memoria");
        const n = importada.datos.asociaciones.length;
        caja.append(nodo("p", "", importada.otra
          ? `Es la memoria de otro proyecto o usuario: sus zapatillas no son las de este catálogo. Se importan ${n === 1 ? "1 relación" : `${n} relaciones`} «por vincular» (hay que buscarlas y confirmarlas); no se usan solas y su historial no se importa.`
          : `Se añaden ${n === 1 ? "1 relación" : `${n} relaciones`} y ${importada.datos.historial.length} registros de historial. Lo que ya tienes no se borra.`));
        caja.append(filaBotones(boton(importada.otra ? "Importar por vincular" : "Importar", "nov-memoria-importar", "boton boton-principal boton-compacto"), boton("Cancelar", "nov-memoria-cancelar")));
        det.append(caja);
      }
      if (!total) { det.append(nodo("p", "editor-vacio", "Todavía no hay relaciones recordadas.")); return det; }
      det.append(campo({ id: "imp-memoria-buscar", etiqueta: "Buscar en la memoria", tipo: "search", valor: ui.memoriaTexto, max: 80, datos: { nov: "memoria-buscar" } }));
      const palabras = normal(ui.memoriaTexto).split(" ").filter(Boolean);
      const filas = memoria.asociaciones.map((a) => {
        const d = a.variante ? I().buscarDestino(catalogo(), a.producto, a.variante) : null;
        return { a, d, texto: normal([nombreProveedor(a.proveedor), d ? nombreDestino(d.producto, d.variante) : "", d?.variante.codigo_variante, a.etiqueta.modelo, a.etiqueta.color, a.origen.documento].filter(Boolean).join(" ")) };
      }).filter((x) => palabras.every((w) => x.texto.includes(w))).sort((x, y) => String(y.a.actualizado).localeCompare(String(x.a.actualizado)));
      const ul = nodo("ul", "importador-nov-relaciones");
      ul.setAttribute("aria-label", "Relaciones recordadas");
      for (const { a, d } of filas.slice(0, ui.memoriaVer)) ul.append(pintarRelacion(a, d));
      if (!filas.length) ul.append(nodo("li", "campo-ayuda", "Ninguna relación coincide."));
      det.append(ul);
      if (filas.length > ui.memoriaVer) det.append(filaBotones(boton(`Ver más (${filas.length - ui.memoriaVer})`, "nov-memoria-mas")));
      return det;
    }
    function pintarRelacion(a, d) {
      const li = nodo("li", "importador-nov-relacion");
      li.dataset.relacion = a.id;
      const cuerpo = nodo("div", "importador-nov-datos");
      const nombre = d ? `${nombreDestino(d.producto, d.variante)} · ${d.variante.codigo_variante}` : [a.etiqueta.marca, a.etiqueta.modelo, a.etiqueta.color].filter(Boolean).join(" · ") || "Sin nombre";
      const situacion = a.estado === "por-vincular" ? "Por vincular (de otro proyecto o usuario): no se usa sola." : !d ? "Ya no existe en el catálogo: queda para revisión." : d.producto.retirado_en ? "Zapatilla retirada: queda para revisión." : a.etiqueta.publico && a.etiqueta.publico !== (d.producto.publico || "") ? `Era para ${ctx.textoPublico(a.etiqueta.publico)} y ahora es para ${ctx.textoPublico(d.producto.publico) || "un público sin indicar"}: queda para revisión.` : !d.variante.activa ? "Color desactivado: queda para revisión." : "";
      cuerpo.append(nodo("p", "importador-nov-principal", nombre),
        nodo("p", "importador-nov-detalle", `${nombreProveedor(a.proveedor)} · ${a.tipo === "pdf" ? "foto de catálogo PDF" : "foto de WhatsApp"} · ${[a.origen.documento, a.origen.lugar, a.origen.fecha ? ctx.fechaDoc(a.origen.fecha) : ""].filter(Boolean).join(", ")} · confirmada el ${ctx.formatoFecha(a.creado) || "—"}`));
      if (situacion) cuerpo.append(nodo("p", "importador-nov-motivo es-revisar", situacion));
      li.append(d ? miniaturaDestino(d.variante, `Foto de ${nombre}`) : nodo("span", "importador-pdf-sinfoto", "—"), cuerpo);
      const fila = filaBotones();
      if (ui.confirmarOlvido === a.id) fila.append(nodo("span", "", "¿Olvidar esta relación? El catálogo no cambia."), boton("Olvidar", "nov-olvidar-si", "boton boton-principal boton-mini", { relacion: a.id }), boton("Cancelar", "nov-olvidar-no", "boton boton-secundario boton-mini", { relacion: a.id }));
      else {
        const corregir = boton(a.estado === "por-vincular" || !d ? "Vincular" : "Corregir", "nov-corregir", "boton boton-secundario boton-mini", { relacion: a.id });
        corregir.setAttribute("aria-label", `${corregir.textContent} la relación de ${nombre}`);
        corregir.setAttribute("aria-expanded", String(ui.corregir === a.id));
        const olvidar = boton("Olvidar", "nov-olvidar", "boton boton-texto boton-mini", { relacion: a.id });
        olvidar.setAttribute("aria-label", `Olvidar la relación de ${nombre}`);
        fila.append(corregir, olvidar);
      }
      li.append(fila);
      if (ui.corregir === a.id) li.append(pintarBuscador({ id: "imp-memoria-corregir", texto: ui.corregirTexto, soloProducto: false, accion: "nov-corregir-elegir", datos: { relacion: a.id }, campoDato: "corregir-buscar" }));
      return li;
    }

    // ------------------------------------------------------------------ repintar
    function repintar() {
      const actual = $("#imp-novedades");
      if (!lote()) return;
      if (!actual) { if (abierto() && $("#imp-entrada")) ctx.pintar(); return; }
      if (!abierto()) { actual.remove(); return; }
      const activo = document.activeElement;
      const id = activo && actual.contains(activo) ? activo.id : "";
      const sel = id && typeof activo.selectionStart === "number" ? [activo.selectionStart, activo.selectionEnd] : null;
      actual.replaceWith(pintar());
      const n = id ? document.getElementById(id) : null;
      if (n) { n.focus({ preventScroll: true }); if (sel) { try { n.setSelectionRange(...sel); } catch { /* tipo sin selección */ } } }
      ctx.pintarPie();
      ctx.programarGuardado();
    }
    const repintarLuego = (ms = 350) => { if ($("#imp-novedades")) ctx.programar("novedades", repintar, ms); };
    // La decisión de una entrada del PDF cambia también su fila en la revisión del documento.
    function trasDecidir(id, foco = `imp-nov-${id}-titulo`) {
      ui.fijas.add(id);
      ctx.cambio();
      const e = entradaPorId(id);
      if (e?.clase === "wa") ctx.repintarFicha(e.f);
      if (lote().pdf) ctx.repintarPdf(); else repintar();
      const n = document.getElementById(foco) || document.getElementById(`imp-nov-${id}-titulo`) || $("#imp-nov-resumen");
      n?.focus({ preventScroll: !n.matches?.("h4") });
    }
    // Confirmaciones breves: en el pie (siempre a la vista). Los resultados de «Aplicar», en la propia sección.
    function avisar(texto, tipo = "ok") {
      estado().aviso = null;
      mensaje(texto, tipo);
    }
    function avisarSeccion(texto, tipo = "ok") {
      estado().aviso = { texto, tipo };
      mensaje("");
    }
    function abrirSeccion() {
      estado().abierto = true;
      ctx.pintar();
      $("#imp-novedades")?.scrollIntoView({ block: "start" });
      $("#imp-novedades-titulo")?.focus({ preventScroll: true });
    }

    // ------------------------------------------------------------------ recordar relaciones
    const etiquetaDe = (p, v, color = "") => ({ marca: p.marca, modelo: p.nombre, publico: p.publico || "", color: v?.color || color, codigo: p.codigo_interno || "", codigoColor: v?.codigo_variante || "" });
    function asociacionesDe(e, producto, variante, via, color = "") {
      const proveedor = proveedorActual();
      const ahora = new Date().toISOString();
      return e.identidades.map((i) => I().asociacionLimpia({
        proveedor, tipo: i.tipo, exacta: i.exacta, gris: i.gris || "", estado: "confirmada", producto: producto.id, variante: variante.id, etiqueta: etiquetaDe(producto, variante, color),
        origen: { documento: e.documento, huella: e.clase === "pdf" ? e.entrega : "", fecha: e.fecha, lugar: e.lugarTexto, texto: e.texto, marca: e.leido.marca, modelo: e.leido.modelo, publico: e.leido.publico }, via, creado: ahora, actualizado: ahora
      })).filter(Boolean);
    }
    function historialDe(e, productoId, varianteId, { dif = null, precioCatalogo = null, operacion = null, cambios = [], coste = undefined } = {}) {
      const ahora = new Date().toISOString();
      const c = coste !== undefined ? coste : dif ? dif.coste.valor : e.costes.length === 1 && e.costes[0].general ? e.costes[0].importe : null;
      return I().historialLimpio({
        proveedor: proveedorActual(), producto: productoId, variante: varianteId, entrega: e.entrega, lugar: e.lugar, documento: e.documento, fecha: e.fecha,
        revisado: { cuando: ahora, costes: e.costes, coste: c, ventaSugerida: e.ventaSugerida, precioCatalogo, tallas: e.tallas },
        aplicado: operacion ? [{ operacion, cuando: ahora, cambios }] : []
      });
    }
    async function confirmarEntrada(id, recordar) {
      const e = entradaPorId(id);
      if (!e) return;
      const r = resolver(e);
      const dec = decision(id);
      if (!r.producto || r.bloqueo || (r.modo !== "color" && !r.variante)) return;
      if (r.cerrada) return;
      // Confirmada antes en otro contexto: la foto o el color que se iba a añadir también se vuelve a elegir.
      if (dec.confirmada && dec.contexto && cambioDeContexto(dec.contexto, e, r.producto) && ["color", "foto"].includes(r.modo)) selDe(id)[r.modo] = false;
      // Lo reconocido por la memoria pasa a decisión expresa de esta entrega, con su contexto.
      Object.assign(dec, { modo: r.modo, producto: r.producto.id, variante: r.variante?.id || "", confirmada: true, contexto: contextoDe(e, r.producto, r.variante) });
      if (r.modo === "color") {
        if (!dec.nuevoId) dec.nuevoId = uuid();
        // Todavía no existe: la relación queda pendiente hasta confirmar su creación.
        dec.recordar = recordar;
        avisar(recordar ? "Destino confirmado. La relación queda pendiente hasta que se cree el color." : "Destino confirmado solo para esta entrega.");
      } else if (recordar) {
        try {
          await escribirMemoria({ proveedores: [registroProveedor(proveedorActual())], asociaciones: asociacionesDe(e, r.producto, r.variante, dec.fuente || "manual") });
          avisar(`Relación recordada: ${nombreDestino(r.producto, r.variante)} (${r.variante.codigo_variante}). El catálogo no cambió.`);
        } catch { avisar("El destino quedó confirmado para esta entrega, pero este navegador no pudo guardar la relación (falta espacio o el almacenamiento está bloqueado). Puedes volver a intentarlo.", "aviso"); }
      } else avisar("Destino confirmado solo para esta entrega: no se recordará.");
      ui.resolver[id] = false;
      trasDecidir(id);
    }
    async function olvidar(ids, foco) {
      try {
        await escribirMemoria({ quitar: ids });
        avisar(ids.length === 1 ? "Relación olvidada. El catálogo no cambió." : `${ids.length} relaciones olvidadas. El catálogo no cambió.`);
      } catch { avisar("No se pudo olvidar la relación en este navegador.", "aviso"); }
      ui.confirmarOlvido = "";
      refrescarTodo();
      document.getElementById(foco)?.focus({ preventScroll: true });
    }
    // Otro proveedor: cambian el reconocimiento de cada entrada y lo que se puede crear o recordar de cada ficha.
    function trasCambiarProveedor() {
      repintarFichas();
      refrescarTodo();
    }
    function repintarFichas() {
      ctx.cambio();
      for (const f of lote().fichas) if (f.colores.some((c) => c.recordar || esWa(f, c))) ctx.repintarFicha(f);
    }
    function refrescarTodo() {
      ctx.cambio();
      if (lote()?.pdf) ctx.repintarPdf(); else repintar();
    }
    async function corregir(relacion, producto, variante) {
      const a = memoria.asociaciones.find((x) => x.id === relacion);
      const d = I().buscarDestino(catalogo(), producto, variante);
      if (!a || !d) return;
      const nueva = I().asociacionLimpia({ ...a, estado: "confirmada", producto, variante, etiqueta: etiquetaDe(d.producto, d.variante), via: "corregida", actualizado: new Date().toISOString() });
      try {
        await escribirMemoria({ asociaciones: [nueva], quitar: nueva.id === a.id ? [] : [a.id] });
        ui.corregir = "";
        avisar(`Relación corregida: ahora corresponde a ${nombreDestino(d.producto, d.variante)}. El catálogo no cambió.`);
      } catch { avisar("No se pudo corregir la relación en este navegador.", "aviso"); }
      refrescarTodo();
      $("#imp-memoria summary")?.focus({ preventScroll: true });
    }
    async function darPorRevisadas(id = "") {
      const lista = porRevisar().filter((x) => !id || x.e.id === id);
      if (!lista.length) return;
      if (id) ui.fijas.add(id);
      try {
        await escribirMemoria({ proveedores: [registroProveedor(proveedorActual())], historial: lista.map((x) => historialDe(x.e, x.r.producto.id, x.r.variante.id, { dif: x.dif, precioCatalogo: x.r.variante.precio })).filter(Boolean) });
        avisar(`${lista.length === 1 ? "1 entrada anotada" : `${lista.length} entradas anotadas`} como ${id ? "revisada" : "revisadas"} (sin escribir en el catálogo).`);
      } catch { avisar("No se pudo anotar la revisión en este navegador.", "aviso"); }
      refrescarTodo();
      (id ? document.getElementById(`imp-nov-${id}-titulo`) : $("#imp-nov-resumen"))?.focus({ preventScroll: true });
    }

    // Pedida para otro proveedor que el de la entrega actual (y todavía sin enviar): hay que decidirla otra vez.
    const recuerdoDeOtro = (f, c) => Boolean(c.recordar) && c.recordar !== proveedorActual() && !["guardada", "guardando", "sin-confirmar"].includes(f.estado);
    // Colores NUEVOS del lote (fichas por crear): se recuerdan al confirmarse su creación.
    function pintarRecordarColor(f, c) {
      if (!ctx.editable(f) || !colorRecordable(c) || fichaResuelta(f) || !(abierto() || c.recordar || c.pdf)) return null;
      const n = c.fotos.filter((x) => I().identidadValida(x.identidad)).length;
      const p = nodo("p", "importador-nov-recuerdo");
      p.id = `imp-${c.clave}-recuerdo`;
      if (recuerdoDeOtro(f, c)) {
        p.classList.add("es-revisar");
        p.append(`Pediste recordarla para ${citarProveedor(c.recordar)} y el proveedor de la entrega ahora es ${citarProveedor(proveedorActual())}: revísala. `);
        if (proveedorActual()) p.append(boton(`Recordarla para ${citarProveedor(proveedorActual())}`, "nov-color-si", "boton boton-texto boton-mini", { color: c.clave }), " ");
        p.append(boton("No recordar", "nov-color-no", "boton boton-texto boton-mini", { color: c.clave }));
      } else if (c.recordar) p.append(`Relación pendiente: al crearse la zapatilla se ${n === 1 ? "recordará 1 fotografía" : `recordarán ${n} fotografías`} para «${nombreProveedor(c.recordar)}». `, boton("No recordar", "nov-color-no", "boton boton-texto boton-mini", { color: c.clave }));
      else {
        const b = boton("Confirmar y recordar esta relación", "nov-color-si", "boton boton-texto boton-mini", { color: c.clave });
        if (!proveedorActual() || !ctx.almacenOk()) b.setAttribute("aria-disabled", "true");
        p.append(`Para reconocer ${n === 1 ? "esta fotografía" : "estas fotografías"} en próximas entregas: `, b);
      }
      return p;
    }
    // Una ficha se creó de verdad (confirmado): se escribe la relación que estaba pendiente.
    async function trasCrear(f, operacion, codigo) {
      const colores = f.colores.filter((c) => c.recordar && colorRecordable(c));
      if (!colores.length) return;
      const ahora = new Date().toISOString();
      const cambio = { proveedores: [], asociaciones: [], historial: [] };
      for (const c of colores) {
        const proveedor = c.recordar;
        if (!cambio.proveedores.some((p) => p.id === proveedor)) cambio.proveedores.push(registroProveedor(proveedor));
        const o = c.pdf?.entrega || {};
        const leido = c.pdf?.entrega ? o : c.leido || { marca: f.marca, modelo: f.modelo, publico: f.publico };
        for (const x of c.fotos) {
          if (!I().identidadValida(x.identidad)) continue;
          const a = I().asociacionLimpia({ proveedor, ...x.identidad, estado: "confirmada", producto: f.id, variante: c.id,
            etiqueta: { marca: mayus(f.marca.trim()), modelo: mayus(f.modelo.trim()), publico: f.publico, color: mayus(c.color.trim()), codigo, codigoColor: "" },
            origen: { documento: o.documento || "Publicación de WhatsApp", huella: o.huella || "", fecha: o.fecha || I().fechaEncabezado(c.encabezado), lugar: o.lugarTexto || `ficha ${ctx.numero(f)}`, texto: c.texto.split("\n")[0], marca: leido.marca, modelo: leido.modelo, publico: leido.publico },
            via: "creacion", creado: ahora, actualizado: ahora });
          if (a) cambio.asociaciones.push(a);
        }
        const coste = comun().entero(c.proveedor);
        const costes = c.pdf?.costes?.length ? c.pdf.costes : Number.isInteger(coste) && coste > 0 ? [{ importe: coste, condicion: "", general: true }] : [];
        const h = I().historialLimpio({ proveedor, producto: f.id, variante: c.id, entrega: o.huella || `wa:${c.id}`, lugar: o.lugar || "publicacion", documento: o.documento || "Publicación de WhatsApp", fecha: o.fecha || I().fechaEncabezado(c.encabezado),
          revisado: { cuando: ahora, costes, coste: Number.isInteger(coste) && coste > 0 && !c.revisar.has("precio") ? coste : null, ventaSugerida: c.pdf?.ventaSugerida || null, precioCatalogo: comun().entero(c.venta), tallas: Array.isArray(o.tallas) ? o.tallas : ctx.texto().leerCampoTallas(c.tallasTexto).tallas },
          aplicado: operacion ? [{ operacion, cuando: ahora, cambios: ["zapatilla creada"] }] : [] });
        if (h) cambio.historial.push(h);
      }
      const ok = await anotar(cambio);
      f.memoria = ok ? `Se ${cambio.asociaciones.length === 1 ? "recordó 1 fotografía" : `recordaron ${cambio.asociaciones.length} fotografías`} para reconocerla en próximas entregas.` : "La zapatilla se creó, pero la memoria local quedó pendiente (ver «Novedades y diferencias»).";
      if (ok) for (const c of colores) c.recordar = "";
    }
    /* Escribe en la memoria DESPUÉS de una escritura confirmada. Si falla, el registro queda en el borrador
       como pendiente: reintentarlo no vuelve a escribir en el catálogo. */
    async function anotar(cambio) {
      const inv = estado();
      try { await escribirMemoria(cambio); return true; } catch {
        inv.porRecordar.push({ ambito: memoria.ambito || lote().ambito, cambio });
        inv.abierto = true;
        return false;
      }
    }
    async function reintentarMemoria() {
      const inv = estado();
      const quedan = [];
      let hechas = 0;
      for (const p of inv.porRecordar) {
        if (p.ambito !== memoria.ambito) { quedan.push(p); continue; }
        try { await escribirMemoria(p.cambio); hechas += 1; } catch { quedan.push(p); }
      }
      inv.porRecordar = quedan;
      avisarSeccion(quedan.length ? "La memoria sigue sin poder guardarse en este navegador. El catálogo no cambió." : `Memoria guardada (${hechas === 1 ? "1 registro" : `${hechas} registros`}). No se repitió ninguna escritura del catálogo.`, quedan.length ? "aviso" : "ok");
      ctx.guardarBorrador();
      refrescarTodo();
      $("#imp-nov-aviso")?.focus({ preventScroll: true });
    }

    // ------------------------------------------------------------------ aplicar cambios
    const operacionEnCurso = (id) => operaciones().some((op) => ["guardando", "sin-confirmar"].includes(op.estado) && op.entradas.some((x) => x.id === id));
    async function aplicar(soloProducto = "") {
      if (aplicando || ctx.ocupado()) return; // doble clic: nada más se envía
      if (!ctx.almacenOk()) {
        // Sin guardado local no se escribe: quizá ya se puede guardar.
        const abierto = lote();
        aplicando = true;
        try { await recuperarAlmacen(); } finally { aplicando = false; }
        if (lote() !== abierto) return;
      }
      const k = resumen();
      const grupos = [...k.grupos.values()].filter((g) => !soloProducto || g.producto.id === soloProducto);
      for (const g of grupos) g.proveedor = proveedorActual(); // lo elegido se aprobó con este
      // Una operación sin confirmar se comprueba siempre antes, aunque su selección ya no esté.
      const dudosas = operaciones().filter((op) => op.estado === "sin-confirmar" && (!soloProducto || op.producto === soloProducto));
      if (!grupos.length && !dudosas.length) { mensaje(k.errores.length ? "Corrige los datos marcados: no hay cambios que se puedan aplicar." : "Elige al menos un cambio para aplicar.", "aviso"); return; }
      aplicando = true;
      ctx.fijarOcupado(true);
      const loteActual = lote();
      const cuenta = { aplicadas: 0, iguales: 0, fallidas: 0, sinConfirmar: 0, sinRespaldo: 0 };
      const idsTratados = new Set();
      try {
        mensaje("Comprobando tu acceso…");
        const acceso = await panel().comprobarAcceso();
        if (lote() !== loteActual) return;
        if (acceso.estado !== "admin") {
          if (acceso.estado === "red") { avisar("No pudimos comprobar tu sesión. Revisa tu conexión; no se envió nada.", "aviso"); return; }
          ctx.fijarOcupado(false);
          await panel().aplicarAcceso(acceso);
          return;
        }
        for (const op of dudosas) {
          mensaje(`Comprobando ${op.nombre} antes de reintentar…`);
          const res = await comprobarOperacion(op);
          if (lote() !== loteActual) return;
          if (res !== "no-llego") { idsTratados.add(op.producto); if (op.estado === "aplicada") cuenta.aplicadas += 1; else if (op.estado === "sin-confirmar") cuenta.sinConfirmar += 1; else cuenta.fallidas += 1; continue; }
          // No llegó y la versión sigue igual: se reenvía EXACTAMENTE lo mismo, con la misma operación. Si desde
          // entonces se cambió la selección o el proveedor (y no se pidió «Reintentar»), no se envía lo que ya no se quiere.
          const g = k.grupos.get(op.producto);
          const ahora = g ? g.entradas.map((x) => `${x.x.e.id}:${x.cambios.map((c) => c.texto).join("; ")}`).sort().join("|") : "";
          if (!soloProducto && ahora !== op.entradas.map((x) => `${x.id}:${x.texto}`).sort().join("|")) {
            op.enviada = false;
            fallar(op, "El envío anterior no llegó al servidor y después cambiaste la selección o el proveedor: no se repitió.");
            if (!g) cuenta.fallidas += 1;
            continue;
          }
          idsTratados.add(op.producto);
          await enviar(op);
          if (lote() !== loteActual) return;
          contar(op, cuenta);
        }
        for (const [i, g] of grupos.entries()) {
          if (idsTratados.has(g.producto.id)) continue;
          mensaje(`Aplicando ${g.producto.nombre} (${i + 1} de ${grupos.length})…`);
          const op = await aplicarGrupo(g);
          if (lote() !== loteActual) return;
          contar(op, cuenta);
          if (op.cortar) { delete op.cortar; break; }
        }
      } finally {
        // Se releen los datos antes de soltar: las diferencias que se ven después son las actuales.
        if (lote() === loteActual) { try { await panel().recargar(); } catch { /* el tablero avisa de su propio error */ } }
        aplicando = false;
        ctx.fijarOcupado(false);
        if (lote() === loteActual) {
          ctx.cambio();
          ctx.pintar();
          ctx.guardarBorrador();
        }
      }
      if (lote() !== loteActual) return;
      const partes = [];
      if (cuenta.aplicadas) partes.push(cuenta.aplicadas === 1 ? "Se actualizó 1 zapatilla existente (confirmado por el servidor); conserva su estado publicado u oculto."
        : `Se actualizaron ${cuenta.aplicadas} zapatillas existentes (confirmado por el servidor); conservan su estado publicado u oculto.`);
      if (cuenta.iguales) partes.push(`${cuenta.iguales === 1 ? "1 ya estaba igual" : `${cuenta.iguales} ya estaban iguales`}: no se envió nada.`);
      if (cuenta.fallidas) partes.push(`${cuenta.fallidas === 1 ? "1 no se aplicó" : `${cuenta.fallidas} no se aplicaron`}: mira el motivo junto a cada una.`);
      if (cuenta.sinRespaldo) partes.push(`${cuenta.sinRespaldo === 1 ? "1 no se envió porque no se pudo guardar antes" : `${cuenta.sinRespaldo} no se enviaron porque no se pudieron guardar antes`} en este navegador: reintenta o exporta un respaldo.`);
      if (cuenta.sinConfirmar) partes.push(`${cuenta.sinConfirmar === 1 ? "1 quedó" : `${cuenta.sinConfirmar} quedaron`} sin confirmar: compruébala antes de reintentar.`);
      if (estado().porRecordar.length) partes.push("La memoria local quedó pendiente: reintenta solo la memoria.");
      if (partes.length) {
        avisarSeccion(partes.join(" "), cuenta.fallidas || cuenta.sinConfirmar || cuenta.sinRespaldo || estado().porRecordar.length ? "aviso" : "ok");
        repintar();
        const n = $("#imp-nov-aviso");
        n?.scrollIntoView({ block: "center" });
        n?.focus({ preventScroll: true });
      }
    }
    function contar(op, cuenta) {
      if (op.estado === "aplicada") cuenta.aplicadas += 1;
      else if (op.estado === "igual") cuenta.iguales += 1;
      else if (op.estado === "sin-confirmar") cuenta.sinConfirmar += 1;
      else if (op.estado === "sin-respaldo") cuenta.sinRespaldo += 1;
      else cuenta.fallidas += 1;
    }
    function operacionDe(producto) {
      const inv = estado();
      if (!inv.operaciones[producto.id]) inv.operaciones[producto.id] = { producto: producto.id, nombre: `${producto.marca} ${producto.nombre}`, codigo: producto.codigo_interno, estado: "", mensaje: "", operaciones: [], pendiente: null, entradas: [], fotos: [], memoria: null };
      return inv.operaciones[producto.id];
    }
    const fallar = (op, texto, est = "fallida") => { op.estado = est; op.mensaje = texto; op.sinGuardar = false; if (!["sin-confirmar", "sin-respaldo"].includes(est)) op.pendiente = null; return op; };
    /* No se pudo guardar ANTES en este navegador: no se sube ni se envía nada más. Lo preparado sigue en memoria con
       sus mismos nombres y su misma operación. Si ya se había enviado, sigue «sin confirmar». */
    function sinRespaldo(op, enviadaAntes, despuesDeSubir) {
      const motivo = ctx.falloLocal();
      if (enviadaAntes) {
        fallar(op, `No se reintentó: este navegador no pudo guardar antes los datos para recuperar la actualización (${motivo}). Sigue sin confirmar el envío anterior; compruébalo o vuelve a intentarlo.`, "sin-confirmar");
        op.sinGuardar = true;
        return op;
      }
      op.enviada = false;
      return fallar(op, `${despuesDeSubir ? "No se envió la actualización: este navegador no pudo guardar antes su operación" : "No se envió nada: este navegador no pudo guardar antes los datos para recuperar la actualización"} (${motivo}). Lo preparado sigue abierto aquí, pero lo que no se guardó se perdería al recargar: libera espacio y pulsa «Reintentar», o exporta un respaldo.${despuesDeSubir && op.fotos.some((x) => x.estado === "subida") ? " Las fotografías ya subidas se reutilizan con el mismo nombre." : ""}`, "sin-respaldo");
    }

    /* Prepara y envía los cambios de UN producto: lectura completa, consolidación, fotos y una sola escritura. */
    async function aplicarGrupo(g) {
      const op = operacionDe(g.producto);
      op.nombre = `${g.producto.marca} ${g.producto.nombre}`;
      const leido = await comun().leerProducto(g.producto.id);
      if (leido.error) {
        const tipo = comun().tipoError({ error: leido.error, status: leido.error.status });
        if (tipo === "sin-sesion" || tipo === "sin-permiso") { op.cortar = true; panel().comprobarAcceso().then((a) => panel().aplicarAcceso(a)); }
        return fallar(op, "No pudimos leer la zapatilla. No se envió nada; inténtalo de nuevo.");
      }
      if (!leido.data) return fallar(op, "La zapatilla ya no existe. No se envió nada.");
      if (leido.data.retirado_en) return fallar(op, "La zapatilla está retirada del catálogo: no se restaura ni se actualiza.");
      // El contexto con que se aprobó ya no es el de ahora (p. ej. se creó otro proveedor mientras se aplicaba).
      if (g.proveedor !== proveedorActual()) return fallar(op, "Cambió el proveedor de la entrega mientras se aplicaba. No se envió nada: revisa los cambios con el proveedor actual.");
      if (leido.data.version !== g.producto.version || (leido.data.publico || "") !== (g.producto.publico || "")) return fallar(op, "Otra edición cambió esta zapatilla desde que la revisaste. No se escribió nada: se cargó su estado actual, revisa las diferencias y vuelve a aplicar.", "conflicto");
      const base = comun().cuerpoSinCambios(leido.data, leido.tallas);
      const version = leido.data.version;

      // 1. Fotos de las entradas: nombre de archivo estable (se conserva al reintentar).
      const cambios = [];
      for (const { x, cambios: lista } of g.entradas) {
        for (const c of lista) {
          if (c.tipo === "foto") { const f = prepararFoto(op, x.e, c.foto, g.producto.id, c.variante); if (f) cambios.push({ ...c, ruta: f.ruta, entrada: x.e.nombre }); }
          else if (c.tipo === "color") {
            const n = c.nuevo;
            const rutas = fotosDe(x.e).map((f) => prepararFoto(op, x.e, f, g.producto.id, n.id)).filter(Boolean).map((f) => ({ ruta: f.ruta, alt: null }));
            const datos = { id: n.id, codigo_variante: "", color: n.color, referencia_variante: null, muestra_color: n.muestra, forma_muestra: n.forma, precio: n.venta, precio_anterior: 0, activa: n.activa,
              tallas: n.tallas.map((t) => ({ talla: t, activa: true })), fotos: rutas };
            const muestraAdmitida = base.variantes[0] && "muestra_color" in base.variantes[0];
            const formaAdmitida = base.variantes[0] && "forma_muestra" in base.variantes[0];
            if (base.variantes.length && !muestraAdmitida) delete datos.muestra_color;
            if (base.variantes.length && !formaAdmitida) delete datos.forma_muestra;
            cambios.push({ tipo: "color", entrada: x.e.nombre, datos, texto: c.texto });
          } else cambios.push({ ...c, entrada: x.e.nombre });
        }
      }
      // 2. Todo lo elegido de este producto, en un solo cuerpo.
      const L = comun().LIM;
      const r = I().consolidar(base, cambios, { limites: { colores: L.colores, tallas: L.tallas, fotos: fotos().LIMITES.fotosPorColor }, ...tallasAjustadas() });
      if (r.errores.length) return fallar(op, `No se envió nada. ${r.errores.map((e) => `${e.entrada}: ${e.mensaje}`).join(" ")}`);
      if (!r.aplicados.length) { limpiarSeleccion(g); return fallar(op, "Ya estaba igual: no se envió nada.", "igual"); }
      for (const v of r.cuerpo.variantes) for (const t of v.tallas) if (!t.id) t.id = null;
      const huella = JSON.stringify(r.cuerpo);
      const proveedor = proveedorActual();
      if (!op.pendiente || op.pendiente.huella !== huella || op.pendiente.version !== version || (op.pendiente.proveedor ?? proveedor) !== proveedor) {
        const datos = JSON.parse(huella);
        for (const v of datos.variantes) for (const t of v.tallas) if (!t.id) t.id = uuid();
        op.pendiente = { operacion: uuid(), huella, version, datos, proveedor };
      }
      op.operaciones = [...new Set([...op.operaciones, op.pendiente.operacion])].slice(-10);
      // 3. Lo que habrá que anotar cuando se confirme y el contexto en que se aprobó (quedan con la operación: aunque
      //    después cambie el proveedor de la entrega, esta operación sigue siendo del suyo).
      op.proveedor = proveedor;
      op.entradas = g.entradas.map(({ x, cambios: lista }) => ({ id: x.e.id, nombre: x.e.nombre, modo: x.r.modo, variante: x.r.modo === "color" ? x.r.dec.nuevoId : x.r.variante.id, texto: lista.map((c) => c.texto).join("; "), contexto: contextoDe(x.e, x.r.producto, x.r.variante) }));
      op.memoria = null;
      if (proveedor) {
        const memo = { proveedores: [registroProveedor(proveedor)], asociaciones: [], historial: [] };
        for (const { x, cambios: lista } of g.entradas) {
          const textos = lista.map((c) => c.texto);
          const vId = x.r.modo === "color" ? x.r.dec.nuevoId : x.r.variante.id;
          if (x.r.modo === "color" && x.r.dec.recordar) memo.asociaciones.push(...asociacionesDe(x.e, g.producto, { id: vId, color: lista[0].nuevo.color, codigo_variante: "" }, "creacion", lista[0].nuevo.color));
          const precioFinal = lista.find((c) => c.tipo === "precio")?.valor ?? (x.r.modo === "color" ? lista[0].nuevo.venta : x.r.variante.precio);
          const h = historialDe(x.e, g.producto.id, vId, { dif: x.dif, precioCatalogo: precioFinal, operacion: op.pendiente.operacion, cambios: textos });
          if (h) memo.historial.push(h);
        }
        op.memoria = memo;
      }
      await enviar(op);
      return op;
    }
    // Foto de la operación: una por origen y color; su archivo en Storage no cambia de nombre al reintentar.
    function prepararFoto(op, e, f, producto, variante) {
      const clave = `${e.id}|${f.ref || f.clave}|${variante}`;
      let x = op.fotos.find((y) => y.clave === clave);
      if (!x) {
        const objeto = fotos().nombreObjeto(producto, variante);
        x = { clave, ref: uuid(), objeto, ruta: fotos().urlPublica(panel().configuracion().url, objeto), estado: "pendiente", color: e.leido.color || e.nombre };
        op.fotos.push(x);
      }
      if (!x.blob) {
        if (e.clase === "wa") x.blob = f.blob || null;
        else { const bruto = lote().pdf?.blobs?.[f.ref]; if (bruto) x.origen = bruto; }
      }
      return x;
    }
    // "" = todo subido; { previo: true } = no se pudo guardar antes el borrador (no se subió nada); o el motivo.
    async function subirFotos(op) {
      const usadas = new Set(op.pendiente.datos.variantes.flatMap((v) => v.fotos.map((f) => f.ruta)));
      const lista = op.fotos.filter((x) => usadas.has(x.ruta) && x.estado !== "subida");
      if (!lista.length) return "";
      let token = null;
      try { token = (await panel().cliente().auth.getSession()).data?.session?.access_token || null; } catch { token = null; }
      if (!token) return "La sesión terminó o no se pudo leer. Vuelve a ingresar y reintenta.";
      const conf = panel().configuracion();
      for (const x of lista) {
        if (!x.blob && x.origen) {
          const tipo = x.origen.type || "image/webp";
          try { x.blob = (await fotos().preparar(new File([x.origen], `catalogo.${tipo.split("/")[1]}`, { type: tipo }))).blob; delete x.origen; } catch (error) { return error instanceof fotos().ErrorFoto ? error.message : "No pudimos preparar una fotografía."; }
        }
        if (!x.blob && x.estado !== "subiendo") return "No se encontró el archivo de una fotografía. Vuelve a elegirla.";
      }
      // Nombres y archivos, ANTES de subir: sin eso, una recarga a mitad dejaría archivos que nadie sabría recuperar.
      if (!(await ctx.guardarBorrador())) return { previo: true };
      for (const x of lista) {
        const previo = x.estado;
        x.estado = "subiendo";
        const r = x.blob ? await fotos().subir({ base: conf.url, clave: conf.clave, token, objeto: x.objeto, blob: x.blob }) : { ok: false, tipo: "red" };
        if (r.ok || ((r.tipo === "duplicado" || r.tipo === "red") && (await ctx.existeObjeto(x.objeto)) === true)) { x.estado = "subida"; continue; }
        x.estado = previo === "subiendo" ? "subiendo" : "pendiente";
        return r.tipo === "red" || r.tipo === "duplicado" ? "Se perdió la conexión al subir una fotografía. Reintenta: usa el mismo nombre y no se duplicará." : r.mensaje || "El servidor rechazó una fotografía.";
      }
      return "";
    }
    async function enviar(op) {
      const loteActual = lote();
      const enviadaAntes = op.estado === "sin-confirmar"; // un reintento: si no se puede guardar antes, sigue sin confirmar
      op.estado = "guardando";
      op.mensaje = "Guardando…";
      op.sinGuardar = false;
      const fallo = await subirFotos(op);
      if (lote() !== loteActual) return op;
      if (fallo?.previo) return sinRespaldo(op, enviadaAntes, false);
      if (fallo && enviadaAntes) return fallar(op, `${fallo} No se reintentó; el envío anterior sigue sin confirmar.`, "sin-confirmar");
      if (fallo) { op.estado = "fallida"; op.mensaje = `${fallo} No se guardó ningún cambio de esta zapatilla.`; return op; }
      // La operación queda en el borrador ANTES de enviarse: una recarga a mitad la deja «sin confirmar».
      op.enviada = true;
      const guardada = await ctx.guardarBorrador();
      if (lote() !== loteActual) return op;
      if (!guardada) return sinRespaldo(op, enviadaAntes, true);
      let r;
      try { r = await panel().cliente().rpc("fn_admin_guardar_producto", { p_datos: op.pendiente.datos, p_version: op.pendiente.version, p_operacion: op.pendiente.operacion }); } catch { r = { error: { status: 0 } }; }
      if (lote() !== loteActual) return op;
      if (!r.error) { await confirmarOperacion(op, r.data?.estado === "ya_aplicada" ? "ya se había aplicado; no se repitió" : ""); return op; }
      const tipo = comun().tipoError(r);
      if (tipo === "red" || tipo === "conflicto") { await comprobarOperacion(op); return op; }
      if (tipo === "sin-sesion" || tipo === "sin-permiso") {
        op.cortar = true;
        panel().comprobarAcceso().then((a) => panel().aplicarAcceso(a));
        op.enviada = false;
        return fallar(op, "La sesión terminó o se perdió el permiso. No se guardó; vuelve a ingresar: tu selección se conserva.");
      }
      op.enviada = false;
      if (tipo === "no-existe") return fallar(op, "La zapatilla ya no existe. No se guardó nada.");
      return fallar(op, `${r.error?.message || "El servidor rechazó los datos."} No se guardó ningún cambio de esta zapatilla.`);
    }
    /* Solo lectura: ¿se aplicó ESTA operación? Por ultima_operacion o, si otra edición vino después, por el
       historial del servidor (que guarda el identificador de cada guardado). Que el estado «se parezca» no
       basta para anunciar el éxito. Devuelve «aplicada», «no-llego», «conflicto», «no-existe» o «duda». */
    async function comprobarOperacion(op) {
      const loteActual = lote();
      if (!op.pendiente) return "duda";
      let r;
      let h = { data: null };
      try { r = await panel().cliente().from("productos").select("id,version,ultima_operacion").eq("id", op.producto).maybeSingle(); } catch { r = { error: { status: 0 } }; }
      if (lote() !== loteActual) return "duda";
      if (r.error) { fallar(op, "Se perdió la respuesta y no pudimos leer el estado actual. Comprueba antes de reintentar (usa la misma operación: no se duplica).", "sin-confirmar"); return "duda"; }
      if (!r.data) { fallar(op, "La zapatilla ya no existe."); return "no-existe"; }
      if (r.data.ultima_operacion === op.pendiente.operacion) { await confirmarOperacion(op, "comprobado con el identificador de esta operación"); return "aplicada"; }
      if (r.data.version === op.pendiente.version) { fallar(op, "Se perdió la respuesta y el cambio todavía no aparece en el servidor. Comprueba otra vez o reintenta (usa la misma operación: no se duplica).", "sin-confirmar"); return "no-llego"; }
      try { h = await panel().cliente().from("historial").select("id").eq("lote", op.pendiente.operacion).limit(1); } catch { h = { error: { status: 0 } }; }
      if (lote() !== loteActual) return "duda";
      if (h.error) { fallar(op, "La zapatilla cambió por otra edición y no pudimos confirmar si la tuya llegó antes. Comprueba otra vez.", "sin-confirmar"); return "duda"; }
      if (h.data?.length) { await confirmarOperacion(op, "comprobado en el historial del servidor; después hubo otra edición"); return "aplicada"; }
      fallar(op, "Otra edición de esta zapatilla se guardó antes. No se aplicó nada: se cargó su estado actual, revisa las diferencias y vuelve a aplicar.", "conflicto");
      op.enviada = false;
      return "conflicto";
    }
    async function confirmarOperacion(op, nota = "") {
      const inv = estado();
      const pendiente = op.pendiente;
      op.estado = "aplicada";
      op.enviada = false;
      op.pendiente = null;
      for (const x of op.entradas) {
        const dec = decision(x.id);
        dec.aplicada = { operacion: pendiente?.operacion || "", cuando: new Date().toISOString(), texto: x.texto, modo: x.modo };
        dec.sel = null;
        Object.assign(dec, { modo: x.modo === "omitir" ? "omitir" : "actualizar", producto: op.producto, variante: x.variante, confirmada: true, recordar: false,
          contexto: x.contexto ? { ...x.contexto, variante: x.variante, texto: x.contexto.variante ? x.contexto.texto : op.nombre } : null });
        delete dec.nuevo;
        // Una publicación de WhatsApp aplicada a una zapatilla existente deja de ser una ficha por crear.
        const f = lote().fichas.find((y) => y.colores.length === 1 && y.colores[0].clave === x.id);
        if (f) { f.estado = "guardada"; f.seleccionada = false; f.aplicadaA = { producto: op.producto, texto: `${op.nombre}: ${x.texto}` }; f.codigo = op.codigo; f.mensaje = ""; }
      }
      op.fotos = [];
      op.mensaje = `Actualizada${nota ? ` (${nota})` : ""}: ${op.entradas.map((x) => x.texto).join("; ")}.`;
      if (op.memoria) {
        const ok = await anotar(op.memoria);
        op.memoria = null;
        if (!ok) op.mensaje += " La memoria local quedó pendiente; el catálogo ya está guardado.";
      }
      inv.abierto = true;
      ctx.cambio();
    }
    function limpiarSeleccion(g) { for (const { x } of g.entradas) decision(x.e.id).sel = null; }
    async function accionOperacion(producto, reintentar) {
      const op = estado().operaciones[producto];
      if (!op || aplicando || ctx.ocupado()) return;
      if (reintentar) { await aplicar(producto); return; }
      aplicando = true;
      ctx.fijarOcupado(true);
      try { await comprobarOperacion(op); } finally {
        aplicando = false;
        ctx.fijarOcupado(false);
        if (lote()) {
          try { await panel().recargar(); } catch { /* su propio aviso */ }
          ctx.cambio();
          ctx.pintar();
          ctx.guardarBorrador();
          mensaje(`${op.nombre}: ${op.mensaje}`, op.estado === "aplicada" ? "ok" : "aviso");
          $("#imp-novedades-titulo")?.focus({ preventScroll: true });
        }
      }
    }

    // ------------------------------------------------------------------ respaldo de la memoria
    function exportarMemoria() {
      const m = { proveedores: memoria.proveedores, asociaciones: memoria.asociaciones, historial: memoria.historial };
      const i = memoria.ambito.lastIndexOf("|");
      const d = new Date();
      const dos = (n) => String(n).padStart(2, "0");
      ctx.descargar(I().empaquetarMemoria({ ambito: { proyecto: memoria.ambito.slice(0, i), usuario: memoria.ambito.slice(i + 1) }, ...m }), `memoria-inventario-${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}.json`);
      avisar("Memoria exportada (relaciones e historial, sin fotos). Los borradores se exportan aparte.");
      repintar();
    }
    async function leerArchivoMemoria(archivo) {
      importada = null;
      try {
        const leida = await I().leerMemoria(archivo);
        const i = memoria.ambito.lastIndexOf("|");
        const otra = leida.ambito.proyecto !== memoria.ambito.slice(0, i) || leida.ambito.usuario !== memoria.ambito.slice(i + 1);
        importada = { otra, datos: otra ? I().adaptarMemoria(leida) : leida };
      } catch (error) { avisar(`No se importó nada: ${error?.message || "el archivo no es válido"}`, "aviso"); }
      ui.memoriaAbierta = true;
      repintar();
      ($("#imp-memoria-importada button") || $("#imp-memoria summary"))?.focus({ preventScroll: true });
    }
    async function importarMemoria() {
      const { datos, otra } = importada;
      // De la misma memoria: gana lo más reciente; nada se borra.
      const previas = new Map(memoria.asociaciones.map((a) => [a.id, a]));
      const asociaciones = datos.asociaciones.filter((a) => !previas.has(a.id) || String(a.actualizado) > String(previas.get(a.id).actualizado));
      const proveedores = datos.proveedores.filter((p) => !memoria.proveedores.some((x) => x.id === p.id));
      try {
        await escribirMemoria({ proveedores, asociaciones, historial: datos.historial });
        avisar(`Memoria importada: ${asociaciones.length === 1 ? "1 relación" : `${asociaciones.length} relaciones`}${otra ? " por vincular" : ` y ${datos.historial.length} registros de historial`}. El catálogo no cambió.`);
        importada = null;
      } catch { avisar("No se pudo importar la memoria en este navegador (falta espacio o está bloqueado); no se cambió nada.", "aviso"); }
      refrescarTodo();
      $("#imp-memoria summary")?.focus({ preventScroll: true });
    }

    // ------------------------------------------------------------------ decisiones
    function elegirModo(id, modo) {
      const e = entradaPorId(id);
      if (!e || operacionEnCurso(id)) return;
      const r = resolver(e);
      if (r.cerrada) return;
      const dec = decision(id);
      const previo = { producto: r.producto?.id || dec.producto || "", variante: r.variante?.id || dec.variante || "" };
      if (e.clase === "pdf") ctx.decisionPdf(id).incluir = modo === "nueva" ? true : modo === "omitir" ? false : undefined;
      Object.assign(dec, { modo, fuente: "manual", confirmada: false, sel: ["nueva", "omitir"].includes(modo) ? null : selConservada(dec), contexto: contextoDe(e, null, null) });
      if (["nueva", "omitir"].includes(modo)) { dec.producto = ""; dec.variante = ""; dec.recordar = false; ui.resolver[id] = false; trasDecidir(id); return; }
      // Cambiar entre «actualizar» y «otra fotografía» conserva el destino ya confirmado.
      dec.producto = previo.producto;
      dec.variante = modo === "color" ? "" : previo.variante;
      if (modo !== "color" && r.confirmada && r.variante && previo.variante === r.variante.id) dec.confirmada = true;
      if (dec.producto) dec.contexto = contextoDe(e, catalogo().find((p) => p.id === dec.producto) || null, dec.variante && dec.variante === r.variante?.id ? r.variante : null);
      if (modo === "color") dec.nuevoId = dec.nuevoId || uuid();
      ui.resolver[id] = true;
      if (e.clase === "wa" && e.f.colores.length > 1) ctx.separarPublicacion(e.c.clave);
      trasDecidir(id, `imp-nov-${id}-buscar`);
    }
    function elegirDestino(id, producto, variante) {
      const e = entradaPorId(id);
      if (!e || operacionEnCurso(id)) return;
      const dec = decision(id);
      const r = resolver(e);
      if (r.cerrada) return;
      const modo = ["color", "actualizar", "foto"].includes(dec.modo) ? dec.modo : "actualizar";
      const fuente = r.candidatos.some((c) => c.variante === variante) ? (r.candidatos.find((c) => c.variante === variante).exacta ? "memoria" : "parecida") : "manual";
      Object.assign(dec, { modo, producto, variante: modo === "color" ? "" : variante || "", confirmada: false, fuente, sel: selConservada(dec) });
      const destino = catalogo().find((p) => p.id === producto) || null;
      dec.contexto = contextoDe(e, destino, destino && dec.variante ? (destino.variantes || []).find((v) => v.id === dec.variante) : null);
      if (modo === "color") dec.nuevoId = dec.nuevoId || uuid();
      if (e.clase === "pdf") ctx.decisionPdf(id).incluir = undefined;
      if (e.clase === "wa" && e.f.colores.length > 1) ctx.separarPublicacion(e.c.clave);
      ui.resolver[id] = false;
      trasDecidir(id);
    }
    function crearProveedor() {
      const nombre = ui.nuevoProveedor.trim();
      ui.errorProveedor = "";
      if (!nombre) ui.errorProveedor = "Escribe el nombre del proveedor.";
      else if (proveedoresConocidos().some((p) => normal(p.nombre) === normal(nombre))) ui.errorProveedor = "Ya hay un proveedor con ese nombre: elígelo en la lista.";
      if (ui.errorProveedor) { repintar(); $("#imp-nov-proveedor-nombre")?.focus(); return; }
      const p = { id: `prov:${uuid()}`, nombre: nombre.slice(0, 80), creado: new Date().toISOString() };
      const fin = () => { estado().proveedor = p.id; ui.nuevoProveedor = ""; ui.proveedorAbierto = false; avisar(`Proveedor de esta entrega: ${p.nombre}.`); trasCambiarProveedor(); $("#imp-nov-proveedor-resumen")?.focus({ preventScroll: true }); };
      escribirMemoria({ proveedores: [p] }).then(fin, () => { memoria.proveedores.push(p); fin(); avisar("El proveedor vale para esta entrega, pero este navegador no pudo guardarlo.", "aviso"); repintar(); });
    }

    // ------------------------------------------------------------------ eventos (devuelven true si eran de aquí)
    function alClic(accion, b) {
      if (!accion.startsWith("nov-")) return false;
      const id = b.dataset.entrada;
      if (b.getAttribute("aria-disabled") === "true") {
        if (accion === "nov-aplicar") mensaje(ctx.ocupado() ? "Espera a que termine el proceso en curso." : "Elige al menos un cambio para aplicar.", "aviso");
        else if (["nov-confirmar", "nov-color-si"].includes(accion)) { mensaje(!proveedorActual() ? "Elige primero el proveedor de esta entrega." : "Esta entrada no se puede recordar.", "aviso"); if (!proveedorActual()) { estado().abierto = true; ui.proveedorAbierto = true; if (!$("#imp-novedades")) ctx.pintar(); $("#imp-nov-proveedor-resumen")?.focus(); } }
        return true;
      }
      switch (accion) {
        case "nov-abrir": abrirSeccion(); break;
        case "nov-filtro": ui.fijas.clear(); estado().filtro = b.dataset.filtro; repintar(); document.getElementById(`imp-nov-filtro-${b.dataset.filtro}`)?.focus({ preventScroll: true }); break;
        case "nov-proveedor-crear": crearProveedor(); break;
        case "nov-elegir": elegirDestino(id, b.dataset.producto, b.dataset.variante); break;
        case "nov-confirmar": confirmarEntrada(id, b.dataset.recordar === "1"); break;
        case "nov-no-recordar": decision(id).recordar = false; trasDecidir(id); break;
        case "nov-separar": { const e = entradaPorId(id); if (e) { ctx.separarPublicacion(e.c.clave); trasDecidir(id); } break; }
        case "nov-olvidar-entrada": {
          const e = entradaPorId(id);
          const v = e && resolver(e).variante;
          const ids = memoria.asociaciones.filter((a) => a.proveedor === proveedorActual() && v && a.variante === v.id && e.identidades.some((i) => i.tipo === a.tipo && i.exacta === a.exacta)).map((a) => a.id);
          if (ids.length) olvidar(ids, `imp-nov-${id}-titulo`);
          break;
        }
        case "nov-usar-sugerida": { const e = entradaPorId(id); const d = decision(id); d.nuevo = { ...(d.nuevo || {}), venta: String(e.ventaSugerida) }; repintar(); document.getElementById(`imp-nov-${id}-venta`)?.focus({ preventScroll: true }); break; }
        case "nov-tallas-visibles": {
          const k = resumen();
          const filtro = filtroActual(k);
          let n = 0;
          for (const x of k.lista) if ((filtro === "todas" || x.tipos.has(filtro)) && x.r.confirmada && x.dif) for (const t of x.dif.tallas.nuevas) { const s = selDe(x.e.id); if (!s.tallas.includes(t)) { s.tallas.push(t); n += 1; } }
          mensaje(`${n === 1 ? "1 talla nueva elegida" : `${n} tallas nuevas elegidas`}. Todavía no se escribió nada.`, "ok");
          repintar();
          $("#imp-nov-aplicar")?.focus({ preventScroll: true });
          break;
        }
        case "nov-recordar-nuevas": {
          const lista = fichasPorRecordar();
          for (const c of lista) c.recordar = proveedorActual();
          mensaje(`${lista.length === 1 ? "1 color se recordará" : `${lista.length} colores se recordarán`} cuando se cree su zapatilla.`, "ok");
          ctx.pintar();
          $("#imp-novedades-titulo")?.focus({ preventScroll: true });
          break;
        }
        case "nov-color-si": case "nov-color-no": {
          const ref = ctx.colorDe(b.dataset.color);
          if (!ref || !ctx.editable(ref.ficha)) break;
          ref.color.recordar = accion === "nov-color-si" ? proveedorActual() : "";
          ctx.repintarFicha(ref.ficha);
          repintarLuego(0);
          document.querySelector(`#imp-${ref.color.clave}-recuerdo button`)?.focus({ preventScroll: true });
          break;
        }
        case "nov-revisadas": darPorRevisadas(); break;
        case "nov-revisada": darPorRevisadas(id); break;
        case "nov-sel-usar": { const e = entradaPorId(id); const r = e && resolver(e); if (r?.producto && r.confirmada) { verSel(id).contexto = contextoDe(e, r.producto, r.variante); mensaje("Cambios revisados para este destino. Todavía no se escribió nada.", "ok"); } trasDecidir(id); break; }
        case "nov-sel-descartar": { const d = decision(id); d.sel = { ...selVacia(), foto: verSel(id).foto, color: verSel(id).color }; mensaje("Cambios descartados. Todavía no se escribió nada.", "ok"); trasDecidir(id); break; }
        case "nov-aplicar": aplicar(); break;
        case "nov-comprobar": accionOperacion(b.dataset.producto, false); break;
        case "nov-reintentar": accionOperacion(b.dataset.producto, true); break;
        case "nov-cerrar-operacion": { const op = estado().operaciones[b.dataset.producto]; if (op) { limpiarFotosDe(op); delete estado().operaciones[b.dataset.producto]; } estado().aviso = null; repintar(); $("#imp-novedades-titulo")?.focus({ preventScroll: true }); break; }
        case "nov-memoria-reintentar": reintentarMemoria(); break;
        case "nov-memoria-exportar": exportarMemoria(); break;
        case "nov-memoria-importar": importarMemoria(); break;
        case "nov-memoria-cancelar": importada = null; repintar(); $("#imp-memoria summary")?.focus({ preventScroll: true }); break;
        case "nov-memoria-mas": ui.memoriaVer += POR_PAGINA; repintar(); break;
        case "nov-olvidar": ui.confirmarOlvido = b.dataset.relacion; repintar(); document.querySelector('#imp-memoria [data-imp="nov-olvidar-si"]')?.focus({ preventScroll: true }); break;
        case "nov-olvidar-no": ui.confirmarOlvido = ""; repintar(); $("#imp-memoria summary")?.focus({ preventScroll: true }); break;
        case "nov-olvidar-si": olvidar([b.dataset.relacion], "imp-memoria-resumen"); break;
        case "nov-corregir": {
          const a = memoria.asociaciones.find((x) => x.id === b.dataset.relacion);
          ui.corregir = ui.corregir === b.dataset.relacion ? "" : b.dataset.relacion;
          ui.corregirTexto = a ? [a.etiqueta.marca, a.etiqueta.modelo].filter(Boolean).join(" ") : "";
          repintar();
          (ui.corregir ? $("#imp-memoria-corregir-buscar") : $("#imp-memoria summary"))?.focus({ preventScroll: true });
          break;
        }
        case "nov-corregir-elegir": corregir(b.dataset.relacion, b.dataset.producto, b.dataset.variante); break;
        default: break;
      }
      return true;
    }
    function alEscribir(n) {
      const k = n.dataset?.nov;
      if (!k) return false;
      if (k === "memoria-archivo") return true;
      if (n.type === "radio" && !n.checked) return true;
      const id = n.dataset.entrada;
      switch (k) {
        case "proveedor": estado().proveedor = n.value; ui.proveedorAbierto = true; trasCambiarProveedor(); document.getElementById(n.id)?.focus({ preventScroll: true }); break;
        case "proveedor-nombre": ui.nuevoProveedor = n.value; break;
        case "fecha": estado().fechas[claveFecha(n.dataset.doc)] = n.checked; repintar(); document.getElementById(n.id)?.focus({ preventScroll: true }); break;
        case "modo": elegirModo(id, n.value); break;
        case "buscar": ui.resolver[`${id}:texto`] = n.value; ui.resolver[id] = true; repintarLuego(300); break;
        case "corregir-buscar": ui.corregirTexto = n.value; repintarLuego(300); break;
        case "memoria-buscar": ui.memoriaTexto = n.value; ui.memoriaVer = POR_PAGINA; repintarLuego(300); break;
        case "coste": selDe(id).coste = Number(n.value); repintar(); break;
        case "precio": selDe(id).precio.modo = n.value; repintar(); if (n.value === "otro") document.getElementById(`imp-nov-${id}-otro`)?.focus({ preventScroll: true }); break;
        case "precio-valor": selDe(id).precio.valor = n.value; repintarLuego(); break;
        case "talla": { const s = selDe(id); s.tallas = n.checked ? [...new Set([...s.tallas, n.value])] : s.tallas.filter((t) => t !== n.value); repintar(); break; }
        case "foto": selDe(id).foto = n.checked; repintar(); break;
        case "color": selDe(id).color = n.checked; repintar(); break;
        case "visible": decision(id).visible = n.value === "si"; repintar(); break;
        case "nuevo-color": case "nuevo-venta": case "nuevo-tallas": { const d = decision(id); d.nuevo = { ...(d.nuevo || {}), [k.slice(6)]: n.value }; repintarLuego(); break; }
        default: break;
      }
      ctx.programarGuardado();
      return true;
    }
    function alIntro(n) { if (n.dataset.nov === "proveedor-nombre") { ui.nuevoProveedor = n.value; crearProveedor(); } }
    function alAlternar(n) {
      if (n.id === "imp-memoria" && n.open !== ui.memoriaAbierta) { ui.memoriaAbierta = n.open; if (n.open) { repintar(); $("#imp-memoria summary")?.focus({ preventScroll: true }); } return true; }
      // El navegador también avisa de los que se pintan ya abiertos: solo cuenta lo que abre o cierra la persona.
      const cambiado = n.dataset?.pintado !== String(n.open);
      if (n.id === "imp-nov-proveedor") { if (cambiado) { ui.proveedorAbierto = n.open; n.dataset.pintado = String(n.open); } return true; }
      const m = /^imp-nov-(.+)-resolver$/.exec(n.id || "");
      if (m) { if (cambiado) { ui.resolver[m[1]] = n.open; n.dataset.pintado = String(n.open); } return true; }
      return false;
    }

    // ------------------------------------------------------------------ borrador y respaldo
    // Fotos de las operaciones sin terminar (van en el borrador como «final», ya optimizadas).
    const fotosPendientes = (l) => Object.values(l.inventario?.operaciones || {}).flatMap((op) => (op.fotos || []).filter((x) => x.blob)).map((x) => ({ ref: x.ref, clase: "final", blob: x.blob, nombre: "actualizacion" }));
    const pendientes = (l) => Object.values(l.inventario?.operaciones || {}).filter((op) => ["guardando", "sin-confirmar"].includes(op.estado)).length + (l.inventario?.porRecordar?.length || 0);
    const texto = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
    // Sin contexto (borradores anteriores): lo aprobado se vuelve a revisar.
    function contextoLimpio(c) {
      if (!c || typeof c !== "object" || typeof c.proveedor !== "string" || (c.proveedor && !I().ID_PROVEEDOR.test(c.proveedor))) return null;
      const u = (x) => (UUID.test(String(x || "")) ? x : "");
      return { proveedor: c.proveedor, producto: u(c.producto), variante: u(c.variante), publico: texto(c.publico, 20), origen: texto(c.origen, 20),
        fotos: (Array.isArray(c.fotos) ? c.fotos : []).filter((x) => /^[0-9a-f]{64}$/.test(String(x))).slice(0, 12), texto: texto(c.texto, 260) };
    }
    // Da forma segura a lo leído de un borrador o de un respaldo (los anteriores no lo traen).
    function normalizar(l) {
      if (!l.inventario || typeof l.inventario !== "object" || Array.isArray(l.inventario)) { l.inventario = null; return; }
      const v = l.inventario;
      const r = vacio();
      const objeto = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
      const u = (x) => (UUID.test(String(x || "")) ? x : "");
      r.abierto = v.abierto === true;
      r.proveedor = I().ID_PROVEEDOR.test(String(v.proveedor || "")) ? v.proveedor : "";
      r.filtro = FILTROS.some(([k]) => k === v.filtro) ? v.filtro : "";
      for (const [k, x] of Object.entries(objeto(v.fechas)).slice(0, 200)) if (x === true) r.fechas[k.slice(0, 200)] = true;
      for (const [k, d] of Object.entries(objeto(v.entradas)).slice(0, 1500)) {
        if (!/^(?:c\d{1,9}|d[0-9a-f]{8}-[\w-]{1,20})$/.test(k) || !d || typeof d !== "object") continue;
        const s = objeto(d.sel);
        r.entradas[k] = {
          ...(MODOS.includes(d.modo) ? { modo: d.modo } : {}), producto: u(d.producto), variante: u(d.variante), nuevoId: u(d.nuevoId), fuente: texto(d.fuente, 20), confirmada: d.confirmada === true, recordar: d.recordar === true, visible: d.visible === true, contexto: contextoLimpio(d.contexto),
          nuevo: d.nuevo && typeof d.nuevo === "object" ? Object.fromEntries(["color", "venta", "tallas"].filter((c) => typeof d.nuevo[c] === "string").map((c) => [c, d.nuevo[c].slice(0, 200)])) : undefined,
          sel: d.sel ? { precio: { modo: ["conservar", "sugerida", "ajuste", "otro"].includes(s.precio?.modo) ? s.precio.modo : "conservar", valor: texto(s.precio?.valor, 12) }, tallas: (Array.isArray(s.tallas) ? s.tallas : []).filter((t) => typeof t === "string" && t.length <= 12).slice(0, 40),
            coste: Number.isInteger(s.coste) ? s.coste : null, foto: s.foto !== false, color: s.color !== false, contexto: contextoLimpio(s.contexto) } : null,
          ...(d.aplicada && typeof d.aplicada === "object" ? { aplicada: { operacion: u(d.aplicada.operacion), cuando: texto(d.aplicada.cuando, 40), texto: texto(d.aplicada.texto, 600), modo: texto(d.aplicada.modo, 20) } } : {})
        };
      }
      for (const [k, o] of Object.entries(objeto(v.operaciones)).slice(0, 400)) {
        if (!UUID.test(k) || !o || o.producto !== k || !Array.isArray(o.entradas) || !Array.isArray(o.fotos)) continue;
        const p = o.pendiente && UUID.test(String(o.pendiente.operacion)) && typeof o.pendiente.huella === "string" && Number.isInteger(o.pendiente.version) && o.pendiente.datos?.id === k ? o.pendiente : null;
        const op = { producto: k, nombre: texto(o.nombre, 200), codigo: texto(o.codigo, 40), estado: texto(o.estado, 20), mensaje: texto(o.mensaje, 1500), operaciones: (Array.isArray(o.operaciones) ? o.operaciones : []).filter(u).slice(-10), pendiente: p, enviada: o.enviada === true, ...(typeof o.proveedor === "string" ? { proveedor: I().ID_PROVEEDOR.test(o.proveedor) ? o.proveedor : "" } : {}),
          entradas: o.entradas.filter((x) => x && typeof x.id === "string" && u(x.variante)).slice(0, 60).map((x) => ({ id: x.id, nombre: texto(x.nombre, 80), modo: texto(x.modo, 20), variante: x.variante, texto: texto(x.texto, 600), contexto: contextoLimpio(x.contexto) })),
          fotos: o.fotos.filter((x) => x && u(x.ref) && typeof x.objeto === "string" && typeof x.ruta === "string").slice(0, 60).map((x) => ({ clave: texto(x.clave, 120), ref: x.ref, objeto: texto(x.objeto, 200), ruta: texto(x.ruta, 400), estado: ["subida", "subiendo"].includes(x.estado) ? x.estado : "pendiente", color: texto(x.color, 80) })),
          memoria: o.memoria && typeof o.memoria === "object" ? cambioLimpio(o.memoria) : null };
        // Se recargó a mitad: si llegó a enviarse, no sabemos el resultado; si no, no se aplicó nada.
        if (op.estado === "guardando") {
          if (op.enviada && p) { op.estado = "sin-confirmar"; op.mensaje = "El guardado se interrumpió (se recargó o se cerró la página) y no sabemos si terminó. Comprueba el resultado antes de reintentar: se usa la misma operación, sin duplicar."; }
          else { op.estado = "fallida"; op.mensaje = "El guardado se interrumpió antes de enviarse: no se cambió nada. Vuelve a aplicar."; }
        }
        if (op.estado === "sin-confirmar" && !p) { op.estado = "fallida"; op.mensaje = "No se pudo recuperar la operación: compara otra vez antes de aplicar."; }
        r.operaciones[k] = op;
      }
      r.porRecordar = (Array.isArray(v.porRecordar) ? v.porRecordar : []).slice(0, 200).filter((x) => x && typeof x.ambito === "string").map((x) => ({ ambito: x.ambito.slice(0, 400), cambio: cambioLimpio(x.cambio) }));
      l.inventario = r;
    }
    const cambioLimpio = (c) => ({ proveedores: (c?.proveedores || []).map(I().proveedorLimpio).filter(Boolean), asociaciones: (c?.asociaciones || []).map(I().asociacionLimpia).filter(Boolean), historial: (c?.historial || []).map(I().historialLimpio).filter(Boolean) });
    function restaurarFotos(l, guardadas) {
      for (const op of Object.values(l.inventario?.operaciones || {})) for (const x of op.fotos) { const g = guardadas.get(x.ref); if (g?.clase === "final") x.blob = g.blob; }
    }
    // Borrador de otro proyecto o usuario: sus UUID y sus operaciones no valen aquí.
    function adaptar(l) {
      for (const f of l.fichas) { delete f.aplicadaA; f.memoria = ""; for (const c of f.colores) c.recordar = ""; }
      if (!l.inventario) return;
      const entradas = {};
      for (const [k, d] of Object.entries(l.inventario.entradas || {})) if (["nueva", "omitir"].includes(d?.modo)) entradas[k] = { modo: d.modo };
      l.inventario = { ...vacio(), abierto: l.inventario.abierto === true, entradas };
    }
    // Archivos subidos por una operación que no llegó a guardarse: se limpian solo si nadie los usa (verificado).
    function limpiarFotosDe(op) {
      if (["sin-confirmar", "guardando", "aplicada"].includes(op.estado)) return;
      for (const x of op.fotos || []) if (["subida", "subiendo"].includes(x.estado)) comun().limpiarArchivoSinUso(x.objeto);
    }
    const limpiarSubidas = (l) => { for (const op of Object.values(l?.inventario?.operaciones || {})) limpiarFotosDe(op); };
    // Al cerrar la importación PDF: sus decisiones se van con ella (no las aplicadas sin confirmar).
    const pdfBloqueado = () => operaciones().some((op) => ["guardando", "sin-confirmar"].includes(op.estado) && op.entradas.some((x) => /^d/.test(x.id)));
    function olvidarEntradasPdf() {
      const inv = lote()?.inventario;
      if (!inv) return;
      for (const k of Object.keys(inv.entradas)) if (/^d/.test(k)) delete inv.entradas[k];
      for (const [k, op] of Object.entries(inv.operaciones)) if (!["guardando", "sin-confirmar"].includes(op.estado)) { limpiarFotosDe(op); delete inv.operaciones[k]; }
      inv.aviso = null;
    }

    // ------------------------------------------------------------------ identidad de una foto de WhatsApp
    /* ANTES de optimizarla: SHA-256 de los bytes del archivo y huella gris (aproximada). null si no se puede. */
    async function identidadDe(archivo) {
      try {
        const bytes = await archivo.arrayBuffer();
        const exacta = await ctx.pdf().sha256(bytes);
        let gris = "";
        try {
          const mapa = await createImageBitmap(archivo);
          const f = Math.min(1, 320 / Math.max(mapa.width, mapa.height));
          const lienzo = document.createElement("canvas");
          lienzo.width = Math.max(1, Math.round(mapa.width * f));
          lienzo.height = Math.max(1, Math.round(mapa.height * f));
          const c = lienzo.getContext("2d", { willReadFrequently: true });
          c.drawImage(mapa, 0, 0, lienzo.width, lienzo.height);
          mapa.close?.();
          const d = c.getImageData(0, 0, lienzo.width, lienzo.height);
          gris = ctx.pdf().aHex(ctx.pdf().grisDe({ width: lienzo.width, height: lienzo.height, kind: 3, data: d.data }));
        } catch { gris = ""; }
        return { tipo: "archivo", exacta, gris };
      } catch { return null; }
    }
    // Se añadió una foto a una publicación: si la memoria la reconoce (o duda), se abre la comparación.
    function alCambiarFotos(f, c) {
      if (!lote() || !esWa(f, c)) return;
      if (!abierto()) {
        const r = resolver(entradaWa(f, c));
        if (r.estado !== "reconocida" && !ESTADOS_DUDA.has(r.estado)) return;
        estado().abierto = true;
        ctx.pintar();
        mensaje(r.estado === "reconocida" ? `Esta fotografía ya es de ${nombreDestino(r.producto, r.variante)}: compárala en «Novedades y diferencias».` : `Revisa esta fotografía en «Novedades y diferencias»: ${r.motivo}`, "info");
        return;
      }
      repintarLuego(0);
    }

    return Object.freeze({
      cargarMemoria, recuperarAlmacen, abierto, abrirSeccion, pintar, repintar, repintarLuego, repintarFichas, proveedorActual, catalogo, resolverFila, fichaResuelta, erroresFicha, porAplicar, asegurar, nombreDestino, pintarRecordarColor, trasCrear, identidadDe, alCambiarFotos,
      alClic, alEscribir, alIntro, alAlternar, normalizar, restaurarFotos, adaptar, fotosPendientes, pendientes, limpiarSubidas, pdfBloqueado, olvidarEntradasPdf,
      decidir: (id, modo) => { const e = entradaPorId(id); Object.assign(decision(id), { modo, producto: "", variante: "", confirmada: false, sel: null, contexto: e ? contextoDe(e, null, null) : null }); },
      decidida: (id) => MODOS.includes(lote()?.inventario?.entradas?.[id]?.modo)
    });
  }

  window.GamaTallaNovedades = Object.freeze({ crear });
})();
