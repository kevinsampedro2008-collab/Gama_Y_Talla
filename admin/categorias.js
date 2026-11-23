/* Panel privado de Gama & Talla · etapa 20: selector de categorías, común a todo el panel.
 *
 * Una sola lista y un solo comportamiento para el editor de zapatillas, las fichas del importador, los
 * «Ajustes para varias fichas» y la categoría habitual del perfil de proveedor. Expone
 * window.GamaTallaCategorias.
 *
 *  - Opciones: URBANAS, RUNNING y CASUALES (las de siempre del panel) y las que ya existen en el
 *    catálogo, sin duplicados por mayúsculas ni espacios. La tienda no fija categorías propias: construye
 *    sus filtros con las del catálogo.
 *  - «Otra categoría…» abre un campo para escribir una nueva. Las categorías personalizadas y las de
 *    fichas antiguas se conservan: el valor actual siempre aparece entre las opciones, tal cual.
 *  - La opción inicial depende del uso: «Selecciona una categoría» (ficha o zapatilla; sigue siendo
 *    obligatoria), «Sin cambiar» (ajustes en bloque) o «Sin categoría predeterminada» (perfil). Esas
 *    etiquetas y «Otra categoría…» son de la interfaz: nunca se guardan como categoría.
 *  - Es un menú desplegable hecho con <details> y opciones de radio (sin <select>: el de WebKit en
 *    Windows inyecta un estilo que la CSP del panel bloquea). Teclado: Intro/Espacio lo abre, las
 *    flechas eligen, Escape lo cierra sin cerrar la ventana. Ratón y tacto: elegir lo cierra.
 *  - El valor vive en un <input type="hidden"> con los datos del formulario que lo usa; al cambiar,
 *    ese campo emite «input» como cualquier otro, así cada formulario lo trata con su lógica de siempre.
 *    Abrir una ficha no emite nada: su categoría no cambia hasta que se elige otra.
 */
(() => {
  "use strict";

  const BASE = Object.freeze(["URBANAS", "RUNNING", "CASUALES"]);
  const OTRA = "__otra__";
  const MAX = 60;
  const INICIALES = Object.freeze({ obligatorio: "Selecciona una categoría", bloque: "Sin cambiar", perfil: "Sin categoría predeterminada" });
  // Campos en modo «Otra categoría…» (por id): se conserva al repintar mientras se escribe.
  const enOtra = new Set();

  const normalizar = (t) => String(t ?? "").replace(/\s+/g, " ").trim().toLocaleUpperCase("es");
  const clave = normalizar;
  // Base primero y después las del catálogo (orden alfabético), sin duplicados.
  function opciones(catalogo = [], actual = "") {
    const vistas = new Map(BASE.map((c) => [clave(c), c]));
    const extra = [];
    for (const c of catalogo) {
      const k = clave(c);
      if (!k || vistas.has(k)) continue;
      vistas.set(k, normalizar(c));
      extra.push(normalizar(c));
    }
    extra.sort((a, b) => a.localeCompare(b, "es"));
    const lista = [...BASE, ...extra];
    // El valor actual (antiguo o personalizado) siempre es una opción, aunque no esté en la lista.
    if (clave(actual) && !vistas.has(clave(actual))) lista.push(normalizar(actual));
    return lista;
  }

  function nodo(etiqueta, clase, texto) {
    const n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto !== undefined && texto !== null) n.textContent = texto;
    return n;
  }

  /* Crea el campo. modo: "obligatorio" | "bloque" | "perfil". datos: los data-* del formulario (van en
     el campo oculto que lleva el valor). error: mensaje junto al control. */
  function crear({ id, etiqueta = "Categoría", valor = "", modo = "obligatorio", datos = {}, revisar = false, ayuda = "", error = "", catalogo = [] }) {
    const actual = String(valor ?? "");
    const lista = opciones(catalogo, actual);
    const elegida = lista.find((c) => clave(c) === clave(actual)) || "";
    const otra = enOtra.has(id);
    const caja = nodo("div", `campo campo-categoria${revisar ? " es-revisar" : ""}${error ? " con-error" : ""}`);
    caja.dataset.selectorCategoria = id;
    const titulo = nodo("span", "campo-categoria-etiqueta", etiqueta);
    titulo.id = `${id}-etiqueta`;
    if (modo === "obligatorio") titulo.append(nodo("span", "campo-obligatorio", " (obligatorio)"));
    if (revisar) titulo.append(" ", nodo("span", "importador-revisar", "Revisar"));

    const menu = nodo("details", "selector-categoria");
    menu.id = `${id}-menu`;
    const resumen = nodo("summary", "selector-categoria-boton");
    resumen.id = id;
    const valorVisible = nodo("span", `selector-categoria-valor${clave(actual) ? "" : " es-vacio"}`, clave(actual) ? (otra ? normalizar(actual) : elegida) : INICIALES[modo]);
    valorVisible.id = `${id}-valor`;
    resumen.setAttribute("aria-labelledby", `${titulo.id} ${valorVisible.id}`);
    resumen.append(valorVisible);
    const descritos = [];
    if (error) descritos.push(`${id}-error`);
    if (ayuda) descritos.push(`${id}-ayuda`);
    if (descritos.length) resumen.setAttribute("aria-describedby", descritos.join(" "));
    if (error) resumen.setAttribute("aria-invalid", "true");

    const panel = nodo("fieldset", "selector-categoria-opciones");
    const leyenda = nodo("legend", "solo-lectores", `${etiqueta}: opciones`);
    panel.append(leyenda);
    const nombre = `${id}-opcion`;
    const filas = [["", INICIALES[modo]], ...lista.map((c) => [c, c]), [OTRA, "Otra categoría…"]];
    filas.forEach(([v, texto], i) => {
      const fila = nodo("label", "casilla selector-categoria-opcion");
      const r = nodo("input");
      r.type = "radio";
      r.name = nombre;
      r.id = `${id}-opcion-${i}`;
      r.value = v;
      r.dataset.categoriaDe = id;
      r.checked = otra ? v === OTRA : v === elegida && (v !== "" || !clave(actual));
      fila.append(r, nodo("span", v === "" || v === OTRA ? "selector-categoria-interfaz" : "", texto));
      panel.append(fila);
    });
    menu.append(resumen, panel);

    const zonaOtra = nodo("div", "selector-categoria-otra");
    zonaOtra.hidden = !otra;
    const etiquetaOtra = nodo("label", "", "Escribe la nueva categoría");
    etiquetaOtra.htmlFor = `${id}-otra`;
    const escribir = nodo("input");
    escribir.type = "text";
    escribir.id = `${id}-otra`;
    escribir.maxLength = MAX;
    escribir.autocomplete = "off";
    escribir.value = otra ? actual : "";
    escribir.dataset.categoriaOtra = id;
    escribir.classList.add("campo-mayus-local");
    zonaOtra.append(etiquetaOtra, escribir);

    const dato = nodo("input");
    dato.type = "hidden";
    dato.id = `${id}-dato`;
    dato.className = "selector-categoria-dato";
    dato.value = actual;
    Object.assign(dato.dataset, datos);

    caja.append(titulo, menu, zonaOtra, dato);
    if (error) {
      const p = nodo("p", "campo-error", error);
      p.id = `${id}-error`;
      caja.append(p);
    }
    if (ayuda) {
      const p = nodo("p", "campo-ayuda", ayuda);
      p.id = `${id}-ayuda`;
      caja.append(p);
    }
    return caja;
  }

  // Escribe el valor en el campo oculto y avisa al formulario (evento «input», como cualquier campo).
  function emitir(caja, valor) {
    const dato = caja.querySelector(".selector-categoria-dato");
    if (!dato) return;
    dato.value = valor;
    const visible = caja.querySelector(".selector-categoria-valor");
    const id = caja.dataset.selectorCategoria;
    const modo = caja.querySelector(".selector-categoria-opciones input[value='']")?.nextElementSibling?.textContent || "";
    if (visible) {
      visible.textContent = valor || modo;
      visible.classList.toggle("es-vacio", !valor);
    }
    dato.dispatchEvent(new Event("input", { bubbles: true }));
    if (id) caja.querySelector(`#${CSS.escape(id)}`)?.removeAttribute("aria-invalid");
  }
  function cerrar(menu, enfocar = true) {
    if (!menu) return;
    menu.open = false;
    if (enfocar) menu.querySelector("summary")?.focus({ preventScroll: true });
  }

  function alCambiar(e) {
    const n = e.target;
    if (n.type === "radio" && n.dataset.categoriaDe) {
      if (!n.checked) return;
      const caja = n.closest(".campo-categoria");
      const id = n.dataset.categoriaDe;
      const zonaOtra = caja.querySelector(".selector-categoria-otra");
      const escribir = caja.querySelector("[data-categoria-otra]");
      if (n.value === OTRA) {
        enOtra.add(id);
        zonaOtra.hidden = false;
        emitir(caja, normalizar(escribir.value));
        cerrar(n.closest("details"), false);
        escribir.focus();
        return;
      }
      enOtra.delete(id);
      zonaOtra.hidden = true;
      escribir.value = "";
      emitir(caja, n.value);
    }
  }
  function alEscribir(e) {
    const n = e.target;
    if (!n.dataset?.categoriaOtra) return;
    emitir(n.closest(".campo-categoria"), normalizar(n.value));
  }
  // Ratón o tacto (detail > 0): elegir cierra el menú. Con las flechas (detail 0) sigue abierto.
  function alPulsar(e) {
    const r = e.target.closest?.(".selector-categoria input[type=radio]");
    if (!r || e.detail === 0 || r.value === OTRA) return;
    cerrar(r.closest("details"));
  }
  function alTeclear(e) {
    const menu = e.target.closest?.(".selector-categoria[open]");
    if (!menu) return;
    if (e.key === "Escape") {
      // Cierra el menú sin cerrar el diálogo que lo contiene.
      e.preventDefault();
      e.stopPropagation();
      cerrar(menu);
    } else if (e.key === "Enter" && e.target.type === "radio") {
      e.preventDefault();
      if (e.target.value === OTRA) { e.target.checked = true; e.target.dispatchEvent(new Event("change", { bubbles: true })); return; }
      cerrar(menu);
    }
  }
  // Al abrir, el foco va a la opción elegida (las flechas recorren la lista desde ahí).
  function alAbrir(e) {
    const menu = e.target;
    if (!menu.classList?.contains("selector-categoria") || !menu.open) return;
    // Solo un menú abierto a la vez.
    document.querySelectorAll(".selector-categoria[open]").forEach((d) => { if (d !== menu) d.open = false; });
    (menu.querySelector("input:checked") || menu.querySelector("input"))?.focus({ preventScroll: true });
  }

  document.addEventListener("change", alCambiar, true);
  document.addEventListener("input", alEscribir, true);
  document.addEventListener("click", alPulsar);
  document.addEventListener("keydown", alTeclear, true);
  document.addEventListener("toggle", alAbrir, true);

  window.GamaTallaCategorias = Object.freeze({ BASE, OTRA, MAX, normalizar, opciones, crear, enOtra });
})();
