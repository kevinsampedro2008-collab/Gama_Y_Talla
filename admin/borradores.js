/* Panel privado de Gama & Talla · etapa 20: almacén LOCAL de perfiles de proveedor y borradores del
 * importador (IndexedDB de este navegador). Expone window.GamaTallaBorradores.
 *
 * Qué guarda y qué no
 *  - Perfiles de proveedor (reglas declarativas) y borradores del importador con sus fotografías.
 *  - Todo queda en ESTE navegador: nada se envía a Supabase. Borrar los datos del navegador lo borra.
 *  - Nunca guarda contraseñas, tokens de sesión ni claves: solo los datos del lote.
 *
 * Separación por proyecto y usuario
 *  - Cada registro lleva un «ámbito» = URL del proyecto de Supabase + UUID del administrador. Solo se
 *    listan y leen los del ámbito de la sesión actual; al cerrar sesión dejan de mostrarse.
 *
 * Escrituras seguras
 *  - Un guardado es UNA transacción: el borrador, sus fotos nuevas y la retirada de las que ya no usa.
 *    Si falla (falta de espacio, por ejemplo), no cambia nada y lo anterior sigue intacto.
 *  - Dos pestañas: cada borrador tiene una pestaña «propietaria». Un guardado de otra pestaña se
 *    rechaza (ErrorConflicto) en vez de sobrescribir; la pestaña que quiera continuar lo pide
 *    expresamente (reclamar). Nada se mezcla.
 *  - Las fotos se guardan como bytes (ArrayBuffer) una sola vez; no se vuelven a escribir al teclear.
 *
 * Respaldo: archivo JSON versionado (formato FORMATO, versión VERSION) con los datos y las fotos en
 * base64. Al importarlo se valida la estructura y la firma de cada foto; si algo falla no se escribe nada.
 */
(() => {
  "use strict";

  const BASE = "gama-talla-panel";
  const VERSION_BASE = 1;
  const FORMATO = "gama-talla/borrador-importador";
  const VERSION = 1;
  const BYTES_ORIGINAL_MAX = 15 * 1024 * 1024; // el mismo límite de entrada de fotos.js
  const BYTES_FINAL_MAX = 1024 * 1024;          // el bucket admite 1 MiB
  const RESPALDO_MAX = 400 * 1024 * 1024;       // archivo de respaldo
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  class ErrorCuota extends Error {}
  class ErrorConflicto extends Error {}
  class ErrorRespaldo extends Error {}

  // ------------------------------------------------------------------ base de datos
  let base = null;
  let fallo = null;
  function disponible() {
    try { return typeof indexedDB !== "undefined" && indexedDB !== null; } catch { return false; }
  }
  function abrirBase() {
    if (base) return base;
    if (!disponible()) return Promise.reject(new Error("IndexedDB no está disponible en este navegador."));
    base = new Promise((resolver, rechazar) => {
      let peticion;
      try { peticion = indexedDB.open(BASE, VERSION_BASE); } catch (e) { rechazar(e); return; }
      peticion.onupgradeneeded = () => {
        const db = peticion.result;
        if (!db.objectStoreNames.contains("perfiles")) db.createObjectStore("perfiles", { keyPath: "clave" }).createIndex("ambito", "ambito");
        if (!db.objectStoreNames.contains("borradores")) db.createObjectStore("borradores", { keyPath: "clave" }).createIndex("ambito", "ambito");
        if (!db.objectStoreNames.contains("fotos")) db.createObjectStore("fotos", { keyPath: "clave" }).createIndex("borrador", "borrador");
      };
      peticion.onsuccess = () => {
        const db = peticion.result;
        // Otra pestaña con una versión nueva del panel pide actualizar la base: se cede.
        db.onversionchange = () => { db.close(); base = null; };
        resolver(db);
      };
      peticion.onerror = () => { fallo = peticion.error; base = null; rechazar(peticion.error || new Error("No se pudo abrir IndexedDB.")); };
      peticion.onblocked = () => { /* otra pestaña con la versión anterior abierta: se espera */ };
    });
    return base;
  }

  const esCuota = (e) => Boolean(e) && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || /quota/i.test(String(e.message || "")));
  // Ejecuta una transacción y resuelve al confirmarse (no al terminar la última petición).
  async function transaccion(almacenes, modo, trabajo) {
    const db = await abrirBase();
    return new Promise((resolver, rechazar) => {
      let tx;
      try { tx = db.transaction(almacenes, modo); } catch (e) { rechazar(e); return; }
      let resultado;
      let rechazo = null;
      tx.oncomplete = () => resolver(resultado);
      tx.onabort = () => {
        const e = rechazo || tx.error;
        rechazar(esCuota(e) ? new ErrorCuota("No hay espacio suficiente en este navegador.") : (e || new Error("La operación se canceló.")));
      };
      tx.onerror = (ev) => { if (!rechazo) rechazo = ev.target?.error || tx.error; };
      const abortar = (e) => { rechazo = e; try { tx.abort(); } catch { /* ya terminó */ } };
      try {
        Promise.resolve(trabajo(tx, abortar)).then((r) => { resultado = r; }, abortar);
      } catch (e) { abortar(e); }
    });
  }
  const pedir = (peticion) => new Promise((resolver, rechazar) => {
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });

  const claveDe = (ambito, id) => `${ambito}|${id}`;
  const claveFoto = (ambito, borrador, ref) => `${ambito}|${borrador}|${ref}`;

  // ------------------------------------------------------------------ perfiles
  async function listarPerfiles(ambito) {
    return transaccion(["perfiles"], "readonly", async (tx) => {
      const filas = await pedir(tx.objectStore("perfiles").index("ambito").getAll(IDBKeyRange.only(ambito)));
      return filas.map((f) => f.perfil);
    });
  }
  async function guardarPerfil(ambito, perfil) {
    return transaccion(["perfiles"], "readwrite", (tx) => {
      tx.objectStore("perfiles").put({ clave: claveDe(ambito, perfil.id), ambito, id: perfil.id, perfil: JSON.parse(JSON.stringify(perfil)), actualizado: new Date().toISOString() });
    });
  }
  async function eliminarPerfil(ambito, id) {
    return transaccion(["perfiles"], "readwrite", (tx) => { tx.objectStore("perfiles").delete(claveDe(ambito, id)); });
  }

  // ------------------------------------------------------------------ borradores
  // Resumen para la lista (sin los datos ni las fotos).
  const resumen = (r) => ({
    id: r.id, creado: r.creado, actualizado: r.actualizado, proveedor: r.proveedor, publicaciones: r.publicaciones,
    fichas: r.fichas, guardadas: r.guardadas, pendientes: r.pendientes, detalle: r.detalle || null, propietario: r.propietario, revision: r.revision
  });
  async function listarBorradores(ambito) {
    return transaccion(["borradores"], "readonly", async (tx) => {
      const filas = await pedir(tx.objectStore("borradores").index("ambito").getAll(IDBKeyRange.only(ambito)));
      return filas.map(resumen).sort((a, b) => String(b.actualizado).localeCompare(String(a.actualizado)));
    });
  }

  // Bytes de un Blob, ANTES de abrir la transacción (una transacción no puede esperar a otra cosa).
  async function aBytes(fotos) {
    const salida = [];
    for (const f of fotos) salida.push({ ref: f.ref, clase: f.clase, tipo: f.blob.type || "application/octet-stream", nombre: f.nombre || "", bytes: await f.blob.arrayBuffer() });
    return salida;
  }

  /* Guarda un borrador. registro: { id, creado, proveedor, publicaciones, fichas, guardadas, pendientes,
     datos (texto JSON) }. opciones: { pestana, revisionEsperada, nuevas: [{ ref, clase, blob, nombre }],
     vigentes: Set(ref) | null (con un Set, se retiran las fotos guardadas que no están en él) }.
     Devuelve { revision }. ErrorConflicto si otra pestaña lo tomó o lo cambió; ErrorCuota sin espacio. */
  async function guardarBorrador(ambito, registro, { pestana, revisionEsperada = null, nuevas = [], vigentes = null } = {}) {
    const bytes = await aBytes(nuevas);
    const clave = claveDe(ambito, registro.id);
    return transaccion(["borradores", "fotos"], "readwrite", async (tx, abortar) => {
      const borradores = tx.objectStore("borradores");
      const actual = await pedir(borradores.get(clave));
      if (actual && actual.propietario && actual.propietario !== pestana) { abortar(new ErrorConflicto("otra-pestana")); return null; }
      if (actual && revisionEsperada !== null && actual.revision !== revisionEsperada) { abortar(new ErrorConflicto("revision")); return null; }
      if (!actual && revisionEsperada !== null) { abortar(new ErrorConflicto("eliminado")); return null; }
      const revision = (actual?.revision || 0) + 1;
      borradores.put({ ...registro, clave, ambito, revision, propietario: pestana, actualizado: new Date().toISOString(), creado: actual?.creado || registro.creado });
      const fotos = tx.objectStore("fotos");
      for (const b of bytes) fotos.put({ clave: claveFoto(ambito, registro.id, b.ref), borrador: clave, ref: b.ref, clase: b.clase, tipo: b.tipo, nombre: b.nombre, bytes: b.bytes });
      if (vigentes) {
        const claves = await pedir(fotos.index("borrador").getAllKeys(IDBKeyRange.only(clave)));
        for (const k of claves) {
          const ref = k.slice(k.lastIndexOf("|") + 1);
          if (!vigentes.has(ref)) fotos.delete(k);
        }
      }
      return { revision };
    });
  }

  // Lee un borrador completo: { registro, fotos: Map(ref → { clase, blob, nombre }) }.
  async function leerBorrador(ambito, id) {
    const clave = claveDe(ambito, id);
    const leido = await transaccion(["borradores", "fotos"], "readonly", async (tx) => {
      const registro = await pedir(tx.objectStore("borradores").get(clave));
      if (!registro) return null;
      const fotos = await pedir(tx.objectStore("fotos").index("borrador").getAll(IDBKeyRange.only(clave)));
      return { registro, fotos };
    });
    if (!leido) return null;
    const fotos = new Map(leido.fotos.map((f) => [f.ref, { clase: f.clase, nombre: f.nombre || "", blob: new Blob([f.bytes], { type: f.tipo }) }]));
    return { registro: leido.registro, fotos };
  }

  // Esta pestaña pasa a ser la propietaria (acción expresa de la persona: «Continuar aquí»).
  async function reclamar(ambito, id, pestana) {
    const clave = claveDe(ambito, id);
    return transaccion(["borradores"], "readwrite", async (tx) => {
      const almacen = tx.objectStore("borradores");
      const actual = await pedir(almacen.get(clave));
      if (!actual) return null;
      almacen.put({ ...actual, propietario: pestana });
      return actual.revision;
    });
  }

  // Borra un borrador y sus fotos LOCALES. No toca Supabase ni Storage.
  async function eliminarBorrador(ambito, id) {
    const clave = claveDe(ambito, id);
    return transaccion(["borradores", "fotos"], "readwrite", async (tx) => {
      tx.objectStore("borradores").delete(clave);
      const fotos = tx.objectStore("fotos");
      const claves = await pedir(fotos.index("borrador").getAllKeys(IDBKeyRange.only(clave)));
      for (const k of claves) fotos.delete(k);
    });
  }

  // Estimación del navegador (no es una cuota fija: cada navegador decide). null si no la da.
  async function estimar() {
    try {
      if (!navigator.storage?.estimate) return null;
      const e = await navigator.storage.estimate();
      return Number.isFinite(e.usage) && Number.isFinite(e.quota) ? { usado: e.usage, cuota: e.quota } : null;
    } catch { return null; }
  }

  // ------------------------------------------------------------------ respaldo
  async function aBase64(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binario = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binario);
  }
  function deBase64(texto) {
    const binario = atob(texto);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
    return bytes;
  }

  /* Archivo de respaldo (Blob JSON). ambito: { proyecto, usuario }; registro: el del borrador (datos en
     texto JSON); fotos: [{ ref, clase, blob, nombre }]. Sin sesión, tokens ni claves. */
  async function empaquetar({ ambito, registro, fotos }) {
    const lista = [];
    for (const f of fotos) lista.push({ ref: f.ref, clase: f.clase, tipo: f.blob.type || "image/webp", nombre: f.nombre || "", base64: await aBase64(f.blob) });
    const contenido = {
      formato: FORMATO, version: VERSION, exportado: new Date().toISOString(),
      ambito: { proyecto: ambito.proyecto, usuario: ambito.usuario },
      borrador: {
        id: registro.id, creado: registro.creado, actualizado: registro.actualizado || new Date().toISOString(),
        proveedor: registro.proveedor, publicaciones: registro.publicaciones, fichas: registro.fichas,
        guardadas: registro.guardadas, pendientes: registro.pendientes, datos: JSON.parse(registro.datos)
      },
      fotos: lista
    };
    return new Blob([JSON.stringify(contenido)], { type: "application/json" });
  }

  /* Lee y valida un archivo de respaldo. Devuelve { ambito, registro (datos en texto JSON), fotos:
     [{ ref, clase, blob, nombre }] } o lanza ErrorRespaldo con el motivo. No escribe nada. */
  async function leerRespaldo(archivo, { firma } = {}) {
    if (!(archivo instanceof Blob)) throw new ErrorRespaldo("No es un archivo.");
    if (archivo.size > RESPALDO_MAX) throw new ErrorRespaldo("El archivo es demasiado grande para ser un respaldo del importador.");
    let datos;
    try { datos = JSON.parse(await archivo.text()); } catch { throw new ErrorRespaldo("No es un respaldo del importador (no es JSON válido)."); }
    if (!datos || typeof datos !== "object" || datos.formato !== FORMATO) throw new ErrorRespaldo("No es un respaldo del importador de Gama & Talla.");
    if (datos.version !== VERSION) throw new ErrorRespaldo(`Versión de respaldo no admitida (${String(datos.version).slice(0, 10)}). Esta versión del panel lee la ${VERSION}.`);
    const a = datos.ambito;
    if (!a || typeof a.proyecto !== "string" || typeof a.usuario !== "string" || a.proyecto.length > 300 || !UUID.test(a.usuario)) throw new ErrorRespaldo("El respaldo no indica su proyecto y usuario.");
    const b = datos.borrador;
    if (!b || typeof b !== "object" || !UUID.test(String(b.id)) || !b.datos || typeof b.datos !== "object") throw new ErrorRespaldo("El respaldo no contiene un borrador válido.");
    if (!Array.isArray(datos.fotos) || datos.fotos.length > 2000) throw new ErrorRespaldo("La lista de fotos del respaldo no es válida.");
    const fotos = [];
    const vistas = new Set();
    for (const [i, f] of datos.fotos.entries()) {
      if (!f || !UUID.test(String(f.ref)) || vistas.has(f.ref) || !["final", "original"].includes(f.clase) || typeof f.base64 !== "string") throw new ErrorRespaldo(`La foto ${i + 1} del respaldo no es válida.`);
      vistas.add(f.ref);
      let bytes;
      try { bytes = deBase64(f.base64); } catch { throw new ErrorRespaldo(`La foto ${i + 1} del respaldo está dañada.`); }
      if (!bytes.length || bytes.length > (f.clase === "final" ? BYTES_FINAL_MAX : BYTES_ORIGINAL_MAX)) throw new ErrorRespaldo(`La foto ${i + 1} del respaldo está vacía o es demasiado grande.`);
      const tipo = { webp: "image/webp", jpeg: "image/jpeg", png: "image/png" };
      const blob = new Blob([bytes]);
      const real = firma ? await firma(blob) : "webp";
      if (!real || (f.clase === "final" && real !== "webp")) throw new ErrorRespaldo(`La foto ${i + 1} del respaldo no es una imagen admitida.`);
      fotos.push({ ref: f.ref, clase: f.clase, nombre: String(f.nombre || "").slice(0, 200), blob: new Blob([bytes], { type: tipo[real] }) });
    }
    const numero = (n) => (Number.isInteger(n) && n >= 0 && n < 100000 ? n : 0);
    const registro = {
      id: b.id, creado: typeof b.creado === "string" ? b.creado.slice(0, 40) : new Date().toISOString(),
      actualizado: typeof b.actualizado === "string" ? b.actualizado.slice(0, 40) : "",
      proveedor: String(b.proveedor || "").slice(0, 80), publicaciones: numero(b.publicaciones), fichas: numero(b.fichas),
      guardadas: numero(b.guardadas), pendientes: numero(b.pendientes), datos: JSON.stringify(b.datos)
    };
    return { ambito: { proyecto: a.proyecto, usuario: a.usuario }, registro, fotos };
  }

  /* Escribe un borrador importado en una sola transacción. Sin «reemplazar», si ya existe uno con el
     mismo identificador no se toca y se lanza ErrorConflicto. Con «reemplazar», se sustituye entero
     (sus fotos también), salvo que otra pestaña lo tenga abierto. */
  async function importar(ambito, { registro, fotos }, { reemplazar = false } = {}) {
    const bytes = await aBytes(fotos);
    const clave = claveDe(ambito, registro.id);
    return transaccion(["borradores", "fotos"], "readwrite", async (tx, abortar) => {
      const borradores = tx.objectStore("borradores");
      const actual = await pedir(borradores.get(clave));
      if (actual && !reemplazar) { abortar(new ErrorConflicto("existe")); return null; }
      const almacenFotos = tx.objectStore("fotos");
      if (actual) {
        const claves = await pedir(almacenFotos.index("borrador").getAllKeys(IDBKeyRange.only(clave)));
        for (const k of claves) almacenFotos.delete(k);
      }
      borradores.put({ ...registro, clave, ambito, revision: (actual?.revision || 0) + 1, propietario: null, actualizado: registro.actualizado || new Date().toISOString() });
      for (const b of bytes) almacenFotos.put({ clave: claveFoto(ambito, registro.id, b.ref), borrador: clave, ref: b.ref, clase: b.clase, tipo: b.tipo, nombre: b.nombre, bytes: b.bytes });
      return true;
    });
  }
  async function existe(ambito, id) {
    return transaccion(["borradores"], "readonly", async (tx) => resumenOnull(await pedir(tx.objectStore("borradores").get(claveDe(ambito, id)))));
  }
  const resumenOnull = (r) => (r ? resumen(r) : null);

  // ------------------------------------------------------------------ aviso entre pestañas
  let canal = null;
  const oyentes = new Set();
  function escuchar(fn) {
    oyentes.add(fn);
    if (!canal && typeof BroadcastChannel !== "undefined") {
      try {
        canal = new BroadcastChannel("gama-talla-importador");
        canal.onmessage = (e) => { for (const o of oyentes) { try { o(e.data); } catch { /* un oyente no rompe a los demás */ } } };
      } catch { canal = null; }
    }
    return () => oyentes.delete(fn);
  }
  function avisar(mensaje) {
    try { canal?.postMessage(mensaje); } catch { /* sin canal: el guardado condicional sigue protegiendo */ }
  }

  window.GamaTallaBorradores = Object.freeze({
    disponible, abrirBase, fallo: () => fallo,
    listarPerfiles, guardarPerfil, eliminarPerfil,
    listarBorradores, guardarBorrador, leerBorrador, reclamar, eliminarBorrador, existe, estimar,
    empaquetar, leerRespaldo, importar, escuchar, avisar,
    ErrorCuota, ErrorConflicto, ErrorRespaldo, FORMATO, VERSION, UUID, esCuota
  });
})();
