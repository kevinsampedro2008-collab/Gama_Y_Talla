// @ts-check
/* Etapa 17.6 · Política de privacidad y autorización de datos. Supabase simulado; WhatsApp no se abre
 * (window.open queda registrado). Datos FICTICIOS. */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CELULAR, ESCRITORIO, abrirDetalle, DATOS_ENVIO, nuevaPagina, BASE } from '../etapa9/ayudas.js';
import { CATALOGO_MIGRADO, clonar, tiendaConSupabase, abrirCarritoDesdeCabecera } from '../etapa14/ayudas-etapa14.js';

const CAPTURAS = process.env.GT_CAPTURAS_17_6 || path.join(os.tmpdir(), 'gama-talla-17-6-capturas');
fs.mkdirSync(CAPTURAS, { recursive: true });
const TEL = { nombre: '360', ancho: 360, alto: 780, tactil: true };

function catalogo() {
  const ps = clonar(CATALOGO_MIGRADO.slice(0, 2));
  ps.forEach((p) => {
    const v = p.variantes[0];
    for (const f of v.tallas) { const d = ['40', '41'].includes(f.talla); f.estado = d ? 'DISPONIBLE' : 'POR_REVISAR'; f.vigenciaDesde = d ? new Date(Date.now() - 36e5).toISOString() : null; f.venceEn = d ? new Date(Date.now() + 36e5).toISOString() : null; }
    v.tallasDisponibles = ['40', '41']; v.tallasPorRevisar = v.tallas.filter((t) => !['40', '41'].includes(t.talla)).map((t) => t.talla); v.tallasAgotadas = [];
  });
  return ps;
}
const CATALOGO = catalogo();
const ultimaUrl = (p) => p.evaluate(() => window.__abiertas.at(-1) ?? null);
const abiertas = (p) => p.evaluate(() => window.__abiertas.length);
const llenar = async (p, datos = DATOS_ENVIO) => { for (const [c, v] of Object.entries(datos)) await p.locator(`#envio-${c}`).fill(v); };

test.describe('Página /privacidad/ y enlaces', () => {
  test('el pie y el formulario enlazan la política (en el formulario, antes de los campos) y la página abre', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, ESCRITORIO, async (pagina) => {
      const pie = pagina.locator('footer a[href="privacidad/"]');
      await expect(pie).toHaveText('Política de privacidad');
      await pie.click();
      await expect(pagina).toHaveURL(/\/privacidad\/$/);
      await expect(pagina.getByRole('heading', { name: 'Política de privacidad', level: 1 })).toBeVisible();
      for (const seccion of ['responsable', 'datos', 'flujo', 'autorizacion', 'derechos', 'solicitudes', 'conservacion']) await expect(pagina.locator(`#${seccion}`)).toBeVisible();
      // Marcadores visibles y la descripción del flujo real (navegador + WhatsApp).
      // Política definitiva: sin marcadores por completar ni aviso de borrador.
      expect(await pagina.locator('mark.completar').count()).toBe(0);
      await expect(pagina.locator('[data-borrador]')).toHaveCount(0);
      const texto = await pagina.locator('main').innerText();
      for (const clave of ['gama-talla-direcciones', 'api.whatsapp.com', 'no se envía hasta que tú lo envías', 'desmarcada', 'Netlify', 'Supabase', 'Google Fonts', 'transportadora', 'Ley 1581', 'Superintendencia de Industria y Comercio', 'no será superior a 5 días hábiles', 'no será superior a 8 días hábiles', 'Vigente desde el 14 de noviembre de 2026', 'artículo 14', 'artículo 15', 'dentro de los cinco días siguientes']) expect(texto, clave).toContain(clave);
      await pagina.screenshot({ path: path.join(CAPTURAS, `privacidad-${browserName}-1440.png`), fullPage: true });
      // «Volver a la tienda» entra sin la presentación (?intro=no), en la cabecera y al final.
      for (const enlace of [pagina.locator('.privacidad-cabecera a.enlace-subrayado'), pagina.locator('.privacidad-volver a')]) expect(new URL(await enlace.evaluate((a) => a.href)).search).toBe('?intro=no');
      await pagina.locator('.privacidad-volver a').click();
      await expect(pagina).toHaveURL(/\/\?intro=no$/);
      await expect(pagina.locator('#intro-catalogo')).not.toHaveJSProperty('open', true);
      await expect(pagina.locator('#catalogo')).toBeAttached();
    }, { respuesta: CATALOGO });
  });

  test('formulario de envío: enlace y aviso antes de los campos; casilla desmarcada; campos y libreta intactos', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await anadir(pagina);
      await abrirCarritoDesdeCabecera(pagina);
      await pagina.locator('#carrito-datos').click();
      const orden = await pagina.evaluate(() => {
        const enlace = document.querySelector('#envio-formulario .envio-privacidad a');
        const campos = ['nombre', 'telefono', 'ciudad', 'direccion', 'nota'].map((c) => document.getElementById(`envio-${c}`));
        const casilla = document.getElementById('envio-autorizo');
        const antes = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
        return { href: enlace?.getAttribute('href'), blank: enlace?.target, antesDeCampos: campos.every((c) => antes(enlace, c)), casillaDespues: campos.every((c) => antes(c, casilla)), marcada: casilla.checked, campos: campos.length };
      });
      expect(orden).toEqual({ href: 'privacidad/', blank: '_blank', antesDeCampos: true, casillaDespues: true, marcada: false, campos: 5 });
      await expect(pagina.locator('#envio-formulario .envio-privacidad')).toHaveText('Usaremos tus datos solo para preparar tu pedido por WhatsApp. Cómo usamos tus datos');
      await expect(pagina.locator('#envio-formulario .envio-privacidad a')).toHaveText('Cómo usamos tus datos');
      // Un solo aviso largo, debajo de «Nota» y antes de la autorización; los dos párrafos largos de antes ya no están arriba.
      const aviso = await pagina.evaluate(() => {
        const a = document.getElementById('envio-aviso-datos');
        const nota = document.getElementById('envio-nota');
        const casilla = document.getElementById('envio-autorizo');
        const sigue = (x, y) => Boolean(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
        return { despuesDeNota: sigue(nota, a), antesDeCasilla: sigue(a, casilla), unico: document.querySelectorAll('#envio-formulario .envio-aviso-datos').length, intro: document.querySelectorAll('#envio-formulario .envio-intro').length, texto: a.textContent };
      });
      expect(aviso).toMatchObject({ despuesDeNota: true, antesDeCasilla: true, unico: 1, intro: 0 });
      for (const frase of ['se guarda solo en este navegador', 'eliminarla cuando quieras desde la libreta', 'Al abrir WhatsApp se comparten los datos del envío con ese servicio para preparar el mensaje']) expect(aviso.texto, frase).toContain(frase);
      // Casilla nativa de 20 px a la izquierda del texto; pulsar el texto la marca; el error queda justo debajo.
      const geom = await pagina.evaluate(() => {
        const c = document.getElementById('envio-autorizo').getBoundingClientRect();
        const t = document.querySelector('#envio-autorizo + span').getBoundingClientRect();
        const n = document.getElementById('envio-nombre').getBoundingClientRect();
        const lab = document.getElementById('envio-autorizo').closest('label').getBoundingClientRect();
        return { w: c.width, h: c.height, izquierda: c.right <= t.left, alineada: Math.abs(lab.left - n.left) <= 1, tipo: document.getElementById('envio-autorizo').type, apariencia: getComputedStyle(document.getElementById('envio-autorizo')).appearance };
      });
      expect(geom.w).toBeGreaterThanOrEqual(18); expect(geom.w).toBeLessThanOrEqual(20); expect(geom.h).toBeLessThanOrEqual(20);
      expect(geom).toMatchObject({ izquierda: true, alineada: true, tipo: 'checkbox' });
      await pagina.locator('#envio-autorizo + span').click({ position: { x: 20, y: 6 } });
      await expect(pagina.locator('#envio-autorizo')).toBeChecked();
      await pagina.locator('#envio-autorizo + span').click({ position: { x: 20, y: 6 } });
      await expect(pagina.locator('#envio-autorizo')).not.toBeChecked();
      // Sin marcar: el error aparece inmediatamente debajo de la casilla y el foco va al control.
      await llenar(pagina);
      await pagina.locator('#envio-guardar').click();
      const error = await pagina.evaluate(() => {
        const e = document.getElementById('envio-autorizo-error').getBoundingClientRect();
        const l = document.getElementById('envio-autorizo').closest('label').getBoundingClientRect();
        const pie = document.querySelector('#envio-formulario .envio-acciones').getBoundingClientRect();
        return { debajo: e.top >= l.bottom - 1 && e.top - l.bottom < 16, activo: document.activeElement.id, errorLibre: e.height > 0 && e.bottom <= pie.top + 0.5 };
      });
      expect(error).toEqual({ debajo: true, activo: 'envio-autorizo', errorLibre: true });
      // Botones: «Guardar dirección» negro y más ancho que «Cancelar» (borde claro), a la misma altura.
      const botones = await pagina.evaluate(() => {
        const g = document.getElementById('envio-guardar'), c = document.querySelector('[data-envio-cancelar]');
        const rg = g.getBoundingClientRect(), rc = c.getBoundingClientRect();
        const cg = getComputedStyle(g), cc = getComputedStyle(c);
        return { fondoGuardar: cg.backgroundColor, masAncho: rg.width > rc.width, mismaAltura: Math.abs(rg.height - rc.height) < 0.6 && Math.abs(rg.top - rc.top) < 0.6, bordeCancelar: cc.borderTopWidth, colorBorde: cc.borderTopColor };
      });
      expect(botones).toMatchObject({ fondoGuardar: 'rgb(20, 20, 20)', masAncho: true, mismaAltura: true, bordeCancelar: '1px' });
      expect(botones.colorBorde).not.toBe('rgba(0, 0, 0, 0)');
      // El pie fijo no tapa la autorización: con el foco en la casilla, el texto completo queda por encima del pie.
      const libre = await pagina.evaluate(() => {
        const l = document.getElementById('envio-autorizo').closest('label').getBoundingClientRect();
        const pie = document.querySelector('#envio-formulario .envio-acciones').getBoundingClientRect();
        return { textoCompletoVisible: l.bottom <= pie.top + 0.5 };
      });
      expect(libre).toEqual({ textoCompletoVisible: true });
      await pagina.screenshot({ path: path.join(CAPTURAS, `formulario-${browserName}-390.png`) });
    }, { respuesta: CATALOGO });
  });
});

/* ---------- La política se abre ENCIMA del pedido (17.7) ---------- */
const TEL_BAJO = { nombre: '360x560', ancho: 360, alto: 560, tactil: true };
const TEL_390 = { nombre: '390', ancho: 390, alto: 800, tactil: true };

// Fotografía del estado del pedido que no debe cambiar mientras se lee la política.
const estadoPedido = (p) => p.evaluate(() => {
  const abiertos = [...document.querySelectorAll('dialog.modal[open]')].map((d) => d.id).filter((id) => id !== 'dialogo-privacidad');
  const scrolls = {};
  for (const d of document.querySelectorAll('dialog.modal[open]')) if (d.id !== 'dialogo-privacidad') for (const e of d.querySelectorAll('*')) if (e.scrollTop > 0) scrolls[`${d.id}>${e.id || e.className}`] = e.scrollTop;
  const valores = Object.fromEntries(['nombre', 'telefono', 'ciudad', 'direccion', 'nota'].map((c) => [c, document.getElementById(`envio-${c}`).value]));
  return {
    abiertos, scrolls, valores,
    autorizo: ['envio-autorizo', 'carrito-autorizo', 'envio-autorizo-revision'].map((id) => document.getElementById(id).checked),
    ventanaScroll: window.scrollY,
    marca: window.__marcaTienda ?? null,
  };
});

const PUNTOS = {
  carrito: { enlace: '#carrito-autorizo-fila a[data-privacidad]', volver: 'Volver al carrito', dialogo: '#carrito' },
  envio: { enlace: '#envio-formulario .envio-privacidad a', volver: 'Volver a datos de envío', dialogo: '#datos-envio' },
  envioCasilla: { enlace: '#envio-formulario .casilla-autorizo a', volver: 'Volver a datos de envío', dialogo: '#datos-envio' },
  pedido: { enlace: '#envio-revision .casilla-autorizo a', volver: 'Volver al pedido', dialogo: '#datos-envio' },
};

async function llegarA(pagina, punto) {
  if (punto === 'pedido') {
    const ficha = await abrirDetalle(pagina, CATALOGO[0].nombre);
    await ficha.locator('.talla[data-talla="40"]').click();
    await ficha.getByRole('button', { name: 'Pedir este par por WhatsApp' }).click();
    await llenar(pagina);
    await pagina.locator('#envio-autorizo').check();
    await pagina.locator('#envio-guardar').click();
    await expect(pagina.locator('#envio-revision')).toBeVisible();
    await pagina.locator('#envio-autorizo-revision').uncheck();
    return;
  }
  await anadir(pagina);
  await abrirCarritoDesdeCabecera(pagina);
  if (punto === 'carrito') {
    await pagina.locator('#carrito-datos').click();
    await llenar(pagina);
    await pagina.locator('#envio-autorizo').check();
    await pagina.locator('#envio-guardar').click();
    await expect(pagina.locator('#datos-envio')).toHaveJSProperty('open', false);
    await pagina.locator('#carrito-autorizo').uncheck();
    await expect(pagina.locator('#carrito-autorizo-fila')).toBeVisible();
    return;
  }
  await pagina.locator('#carrito-datos').click();
  // Datos escritos SIN guardar.
  await llenar(pagina, { ...DATOS_ENVIO, nota: 'Portería, torre 2' });
}

test.describe('Política abierta encima del pedido', () => {
  for (const [nombre, vista] of [['360', TEL_BAJO], ['390', TEL_390]]) {
    for (const [clave, cierre] of [['carrito', 'boton'], ['envio', 'x'], ['envioCasilla', 'escape'], ['pedido', 'boton'], ['envio', 'boton']]) {
      test(`${nombre}px · desde «${clave}» se cierra con ${cierre}: el pedido, el foco y el desplazamiento quedan intactos`, async ({ browser, browserName }) => {
        const punto = PUNTOS[clave];
        await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
          const contexto = pagina.context();
          await llegarA(pagina, clave === 'envioCasilla' ? 'envio' : clave);
          await pagina.evaluate(() => { window.__marcaTienda = 'misma-carga'; });
          const paginas = contexto.pages().length;
          const url = pagina.url();
          // Con el pedido en pantalla: desplazar el diálogo hasta el final para comprobar que se conserva.
          if (clave === 'envioCasilla') await pagina.evaluate(() => { const f = document.getElementById('envio-formulario'); f.scrollTop = f.scrollHeight; });
          const enlace = pagina.locator(punto.enlace);
          await enlace.scrollIntoViewIfNeeded();
          const antes = await estadoPedido(pagina);
          if (clave === 'envioCasilla' && vista === TEL_BAJO) expect(Object.keys(antes.scrolls).length, 'el formulario estaba desplazado').toBeGreaterThan(0);
          await enlace.click();
          const politica = pagina.locator('#dialogo-privacidad');
          await expect(politica).toHaveJSProperty('open', true);
          await expect(politica.locator('#responsable')).toBeVisible();
          await expect(politica.locator('#privacidad-dialogo-volver')).toHaveText(punto.volver);
          await expect(politica.getByRole('heading', { name: 'Política de privacidad' })).toBeVisible();
          // Sin pestaña nueva, sin recargar, misma URL, intro sin repetirse; el pedido sigue debajo.
          expect(contexto.pages().length).toBe(paginas);
          expect(pagina.url()).toBe(url);
          expect(await pagina.evaluate(() => window.__marcaTienda)).toBe('misma-carga');
          await expect(pagina.locator('#intro-catalogo')).not.toHaveJSProperty('open', true);
          await expect(pagina.locator(punto.dialogo)).toHaveJSProperty('open', true);
          // Sólo el apartado 1 muestra marcadores.
          expect(await politica.locator('mark.completar').count()).toBe(0);
          expect(await politica.evaluate((d) => d.querySelector('.privacidad-volver, h1') === null)).toBe(true);
          await pagina.screenshot({ path: path.join(CAPTURAS, `politica-encima-${clave}-${browserName}-${vista.ancho}.png`) });
          // Leerla no marca ninguna autorización.
          expect((await estadoPedido(pagina)).autorizo).toEqual(antes.autorizo);
          if (cierre === 'boton') await politica.locator('#privacidad-dialogo-volver').click();
          else if (cierre === 'x') await politica.locator('.boton-cerrar').click();
          else await pagina.keyboard.press('Escape');
          await expect(politica).toHaveJSProperty('open', false);
          // Solo se cerró la política: todo lo demás igual, y el foco volvió al enlace original.
          await expect(pagina.locator(punto.dialogo)).toHaveJSProperty('open', true);
          const despues = await estadoPedido(pagina);
          expect(despues).toEqual(antes);
          await expect(enlace).toBeFocused();
          expect(contexto.pages().length).toBe(paginas);
          expect(pagina.url()).toBe(url);
          expect(await pagina.evaluate(() => window.__abiertas.length), 'no se abrió WhatsApp').toBe(0);
        }, { respuesta: CATALOGO });
      });
    }
  }

  test('si el texto no carga: «Reintentar» en el diálogo y el pedido queda como está', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, TEL_390, async (pagina) => {
      await llegarA(pagina, 'envio');
      let falla = true;
      await pagina.route('**/privacidad/', (ruta) => (falla ? ruta.abort('failed') : ruta.continue()));
      const antes = await estadoPedido(pagina);
      await pagina.locator(PUNTOS.envio.enlace).click();
      const politica = pagina.locator('#dialogo-privacidad');
      await expect(politica.getByRole('button', { name: 'Reintentar' })).toBeVisible();
      await expect(politica).toContainText('Tu pedido no cambió');
      await pagina.screenshot({ path: path.join(CAPTURAS, `politica-error-${browserName}.png`) });
      expect((await estadoPedido(pagina))).toEqual(antes);
      falla = false;
      await politica.getByRole('button', { name: 'Reintentar' }).click();
      await expect(politica.locator('#responsable')).toBeVisible();
      await expect(politica.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
      await politica.locator('#privacidad-dialogo-volver').click();
      expect((await estadoPedido(pagina))).toEqual(antes);
    }, { respuesta: CATALOGO });
  });

  test('la política abierta no habilita el envío: aún hay que marcar la autorización', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, TEL_390, async (pagina) => {
      await llegarA(pagina, 'carrito');
      await pagina.locator(PUNTOS.carrito.enlace).click();
      await pagina.locator('#privacidad-dialogo-volver').click();
      await expect(pagina.locator('#carrito-autorizo')).not.toBeChecked();
      await pagina.locator('#carrito-enviar').click();
      expect(await abiertas(pagina)).toBe(0);
      await expect(pagina.locator('#carrito-notificacion')).toContainText('Marca la autorización de datos');
    }, { respuesta: CATALOGO });
  });
});

test.describe('/privacidad/ como página independiente', () => {
  for (const vista of [TEL, TEL_390]) {
    test(`${vista.ancho}px: se lee sin la tienda y su regreso entra sin presentación`, async ({ browser, browserName }) => {
      const { contexto, pagina } = await nuevaPagina(browser, browserName, vista, { reducido: true });
      try {
        await pagina.goto(`${BASE}/privacidad/`);
        await expect(pagina.getByRole('heading', { name: 'Política de privacidad', level: 1 })).toBeVisible();
        expect(await pagina.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'sin desplazamiento horizontal').toBe(true);
        expect(await pagina.locator('mark.completar').count()).toBe(0);
        await pagina.screenshot({ path: path.join(CAPTURAS, `privacidad-pagina-${browserName}-${vista.ancho}.png`), fullPage: true });
        const hrefs = await pagina.locator('.privacidad a[href*="intro"], .privacidad-cabecera a[href*="intro"]').evaluateAll((as) => as.map((a) => new URL(a.href).pathname + new URL(a.href).search));
        expect(hrefs).toEqual(['/?intro=no', '/?intro=no', '/?intro=no']);
        await pagina.locator('.privacidad-volver a').click();
        await expect(pagina).toHaveURL(/\/\?intro=no$/);
        await expect(pagina.locator('#intro-catalogo')).not.toHaveJSProperty('open', true);
        await expect(pagina.locator('#catalogo')).toBeAttached();
      } finally { await contexto.close(); }
    });
  }
});

async function anadir(pagina, i = 0, talla = '40') {
  await pagina.evaluate(([n, t]) => { const p = estado.productos[n]; agregarAlCarrito(p.clave, p.variantes[0].id, t, 1); }, [i, talla]);
}

test.describe('Autorización antes de guardar y antes de abrir WhatsApp', () => {
  for (const vista of [TEL, ESCRITORIO]) {
    test(`${vista.ancho}px: sin autorización no se guarda; con ella sí; en una visita nueva la dirección guardada también la exige`, async ({ browser, browserName }) => {
      await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
        const peticiones = [];
        pagina.on('request', (r) => peticiones.push(`${r.url()} ${r.postData() ?? ''}`));
        await anadir(pagina);
        await abrirCarritoDesdeCabecera(pagina);
        await pagina.locator('#carrito-datos').click();
        await llenar(pagina);
        // 1) Sin marcar: no guarda, avisa junto a la casilla y le da el foco.
        await pagina.locator('#envio-guardar').click();
        await expect(pagina.locator('#envio-autorizo-error')).toBeVisible();
        await expect(pagina.locator('#envio-autorizo-error')).toContainText('Marca la autorización');
        await expect(pagina.locator('#envio-autorizo')).toBeFocused();
        await expect(pagina.locator('#datos-envio')).toHaveJSProperty('open', true);
        expect(await pagina.evaluate(() => localStorage.getItem('gama-talla-direcciones'))).toBeNull();
        // Los campos escritos se conservan.
        await expect(pagina.locator('#envio-direccion')).toHaveValue(DATOS_ENVIO.direccion);
        // 2) Con la casilla: guarda y el carrito refleja la autorización de la visita.
        await pagina.locator('#envio-autorizo').check();
        await expect(pagina.locator('#envio-autorizo-error')).toBeHidden();
        await pagina.locator('#envio-guardar').click();
        await expect(pagina.locator('#datos-envio')).toHaveJSProperty('open', false);
        expect(await pagina.evaluate(() => JSON.parse(localStorage.getItem('gama-talla-direcciones')).direcciones.length)).toBe(1);
        await expect(pagina.locator('#carrito-autorizo')).toBeChecked();
        await pagina.locator('#carrito-enviar').click();
        let url = new URL(await ultimaUrl(pagina));
        expect(url.searchParams.get("text")).not.toContain("Autorización de datos");
        expect(url.searchParams.get("text")).toContain("*Mis datos:*");
        expect(url.searchParams.get('text')).toContain('Nombre: Camila Rodríguez');
        // Desmarcar la casilla del carrito vuelve a bloquear el envío.
        await pagina.locator('#carrito-autorizo').uncheck();
        const antes = await abiertas(pagina);
        await pagina.locator('#carrito-enviar').click();
        expect(await abiertas(pagina)).toBe(antes);
        await expect(pagina.locator('#carrito-notificacion')).toContainText('Marca la autorización de datos');
        await expect(pagina.locator('#carrito-autorizo')).toBeFocused();
        // 3) Visita nueva con la dirección ya guardada: la casilla nace desmarcada y se pide otra vez.
        await pagina.reload();
        await pagina.waitForFunction('typeof estado !== "undefined" && estado.catalogoListo === true');
        await abrirCarritoDesdeCabecera(pagina);
        await expect(pagina.locator('#carrito-entrega-ciudad')).toHaveText('Barranquilla');
        await expect(pagina.locator('#carrito-autorizo')).not.toBeChecked();
        await pagina.locator('#carrito-enviar').click();
        expect(await abiertas(pagina)).toBe(0);
        await pagina.screenshot({ path: path.join(CAPTURAS, `carrito-sin-autorizar-${browserName}-${vista.ancho}.png`) });
        await pagina.locator('#carrito-autorizo').check();
        await pagina.locator('#carrito-enviar').click();
        url = new URL(await ultimaUrl(pagina));
        expect(url.searchParams.get('text')).not.toContain('Autorización de datos');
        // Los datos de envío solo viajan en el enlace de WhatsApp: ninguna petición del sitio los lleva.
        expect(peticiones.filter((p) => /Camila|Calle%2084|Calle 84|300%20123|300 123/.test(decodeURIComponent(p)) && !p.startsWith('https://api.whatsapp.com')), 'sin datos de envío en peticiones').toEqual([]);
      }, { respuesta: CATALOGO });
    });
  }

  test('«Pedir este par»: la revisión exige la autorización, también con una dirección guardada', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, ESCRITORIO, async (pagina) => {
      const pedir = async () => {
        const ficha = await abrirDetalle(pagina, CATALOGO[0].nombre);
        await ficha.locator('.talla[data-talla="40"]').click();
        await ficha.getByRole('button', { name: 'Pedir este par por WhatsApp' }).click();
        return ficha;
      };
      await pedir();
      await llenar(pagina);
      await pagina.locator('#envio-guardar').click();
      await expect(pagina.locator('#envio-autorizo-error')).toBeVisible();
      await pagina.locator('#envio-autorizo').check();
      await pagina.locator('#envio-guardar').click();
      await expect(pagina.locator('#envio-revision')).toBeVisible();
      await expect(pagina.locator('#envio-autorizo-revision')).toBeChecked();
      await pagina.locator('#envio-autorizo-revision').uncheck();
      await pagina.locator('#envio-enviar').click();
      expect(await abiertas(pagina)).toBe(0);
      await expect(pagina.locator('#envio-aviso')).toContainText('Marca la autorización');
      await expect(pagina.locator('#envio-autorizo-revision')).toBeFocused();
      await pagina.locator('#envio-autorizo-revision').check();
      await pagina.locator('#envio-enviar').click();
      expect(new URL(await ultimaUrl(pagina)).searchParams.get('text')).not.toContain('Autorización de datos');
      // Visita nueva con la dirección guardada.
      await pagina.reload();
      await pagina.waitForFunction('typeof estado !== "undefined" && estado.catalogoListo === true');
      await pedir();
      await expect(pagina.locator('#envio-revision')).toBeVisible();
      await expect(pagina.locator('#envio-autorizo-revision')).not.toBeChecked();
      await pagina.locator('#envio-enviar').click();
      expect(await abiertas(pagina)).toBe(0);
    }, { respuesta: CATALOGO });
  });

  test('consultar la disponibilidad de una talla no pide datos de envío ni autorización', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, ESCRITORIO, async (pagina) => {
      const ficha = await abrirDetalle(pagina, CATALOGO[0].nombre);
      await ficha.locator('.talla[data-talla="42"]').click();
      await ficha.locator('[data-accion="pedir-ahora"]').click();
      expect(new URL(await ultimaUrl(pagina)).searchParams.get('text')).not.toContain('Autorización');
      await expect(pagina.locator('#datos-envio')).toHaveJSProperty('open', false);
    }, { respuesta: CATALOGO });
  });
});
