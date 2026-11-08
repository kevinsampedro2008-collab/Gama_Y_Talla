// Ayudas de la etapa 14: servir el catálogo de Supabase a la tienda y manejar los tres estados.
import { expect } from '@playwright/test';
import fs from 'node:fs';
import { nuevaPagina, irATienda, URL_REAL } from '../etapa9/ayudas.js';

// URL ficticia de la vista pública: las pruebas la interceptan, no hay red real.
export const URL_SUPABASE = 'https://ejemplo.supabase.co/rest/v1/catalogo_publico?select=*&order=orden';
export const CLAVE_CARRITO = 'gama-talla-carrito-v3';
// Clave publicable FICTICIA con formato válido (etapa 16: solo se admiten formatos explícitos).
export const CLAVE_PUBLICABLE_FICTICIA = 'sb_publishable_CLAVE_FICTICIA_DE_PRUEBA_14';
// Etapa 16: la caché lleva formato y proyecto; la anterior se retira y nunca se usa.
export const CLAVE_CACHE = 'gama-talla-catalogo-v2';
export const CLAVE_CACHE_ANTERIOR = 'gama-talla-catalogo-cache';
export const PROYECTO = new URL(URL_SUPABASE).origin;
// Un catálogo REAL guardado en este navegador para el proyecto de las pruebas.
export const cacheReal = (productos, fecha = Date.now() - 36e5, proyecto = PROYECTO) => ({ formato: 2, proyecto, fecha, productos });

// Catálogo migrado real, generado en la etapa 13 por la migración en seco.
export const CATALOGO_MIGRADO = JSON.parse(fs.readFileSync('supabase/local/vista-publica.json', 'utf8')).productos;

export const clonar = (valor) => JSON.parse(JSON.stringify(valor));

// Cambia el estado de unas tallas de un producto del catálogo migrado.
export function conEstados(catalogo, nombre, estados) {
  const copia = clonar(catalogo);
  const producto = copia.find((p) => p.nombre === nombre);
  if (!producto) throw new Error(`No existe el producto ${nombre} en el catálogo migrado`);
  const variante = producto.variantes[0];
  for (const [talla, valor] of Object.entries(estados)) {
    const fila = variante.tallas.find((t) => t.talla === talla);
    if (!fila) throw new Error(`${nombre} no tiene la talla ${talla}`);
    fila.estado = valor;
    fila.venceEn = valor === 'DISPONIBLE' ? new Date(Date.now() + 36e5).toISOString() : null;
    fila.vigenciaDesde = valor === 'DISPONIBLE' ? new Date(Date.now() - 36e5).toISOString() : null;
  }
  // Las tres listas que lee la tienda deben seguir el mismo criterio.
  const porEstado = (e) => variante.tallas.filter((t) => t.estado === e).map((t) => t.talla);
  variante.tallasDisponibles = porEstado('DISPONIBLE');
  variante.tallasPorRevisar = porEstado('POR_REVISAR');
  variante.tallasAgotadas = porEstado('AGOTADO');
  return copia;
}

// Quita una talla del catálogo por completo (deja de ofrecerse).
export function sinTalla(catalogo, nombre, talla) {
  const copia = clonar(catalogo);
  const variante = copia.find((p) => p.nombre === nombre).variantes[0];
  variante.tallas = variante.tallas.filter((t) => t.talla !== talla);
  ['tallasDisponibles', 'tallasPorRevisar', 'tallasAgotadas'].forEach((lista) => {
    variante[lista] = variante[lista].filter((t) => t !== talla);
  });
  return copia;
}

/* Abre la tienda leyendo de «Supabase». `respuesta` decide qué contesta el servidor:
   un catálogo (array), o {fallo: 500 | 'red'} para simular que no responde. */
export async function tiendaConSupabase({ browser, browserName }, vista, cuerpo, opciones = {}) {
  const { respuesta = CATALOGO_MIGRADO, carrito = null, cache = null, reducido = true, tarjetas = true } = opciones;
  // `config` sustituye por completo a GAMA_TALLA_CONFIG; null = no se declara ninguna.
  // Así se simula un despliegue sin configurar (fuenteLocal: false = «esto es producción»).
  const config = 'config' in opciones
    ? opciones.config
    : { catalogoUrl: URL_SUPABASE, catalogoClave: CLAVE_PUBLICABLE_FICTICIA };
  const { contexto, pagina, problemas } = await nuevaPagina(browser, browserName, vista, { reducido });
  try {
    await pagina.addInitScript(([conf, carritoPrevio, claveCarrito, cacheGuardada, claveCache]) => {
      if (conf) window.GAMA_TALLA_CONFIG = conf;
      window.__abiertas = [];
      window.open = (enlace) => { window.__abiertas.push(String(enlace)); return {}; };
      if (carritoPrevio) localStorage.setItem(claveCarrito, JSON.stringify(carritoPrevio));
      if (cacheGuardada) localStorage.setItem(claveCache, JSON.stringify(cacheGuardada));
    }, [config, carrito, CLAVE_CARRITO, cache, CLAVE_CACHE]);

    const peticiones = { supabase: 0 };
    await pagina.route('**/rest/v1/catalogo_publico**', async (ruta) => {
      peticiones.supabase += 1;
      const actual = typeof respuesta === 'function' ? respuesta(peticiones.supabase) : respuesta;
      if (actual?.fallo === 'red') return ruta.abort('failed');
      if (actual?.fallo) return ruta.fulfill({ status: actual.fallo, body: 'error' });
      await ruta.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(actual) });
    });

    await irATienda(pagina, opciones.url || URL_REAL, { tarjetas });
    await cuerpo(pagina, { peticiones, problemas });
  } finally {
    await contexto.close();
  }
}

// Lo que el cliente ve de una talla concreta en la ficha abierta.
export const tallaEnFicha = (dialogo, talla) => dialogo.locator(`.talla[data-talla="${talla}"]`);

export const estadosDeTallas = (pagina, nombre) => pagina.evaluate((n) => {
  const p = estado.productos.find((x) => x.nombre === n);
  return p ? p.variantes[0].estadosTalla : null;
}, nombre);

export const lineasDelCarrito = (pagina) => pagina.evaluate(() =>
  lineasCarrito().map((l) => ({ producto: l.producto.nombre, talla: l.talla, estado: l.estado, cantidad: l.cantidad })));

export const guardadoV3 = (pagina) => pagina.evaluate((c) =>
  JSON.parse(localStorage.getItem(c) || 'null'), CLAVE_CARRITO);

export async function abrirCarritoDesdeCabecera(pagina) {
  await pagina.evaluate(() => abrirCarrito(document.querySelector('#boton-carrito')));
  await expect(pagina.locator('#carrito')).toHaveJSProperty('open', true);
}

export const textoDe = (url) => new URL(url).searchParams.get('text');
