// @ts-check
/* Etapa 16.1 · Tienda: consulta directa desde la ficha, datos de envío obligatorios para pedir
 * y mensaje de WhatsApp con «Mis datos». Supabase se simula (como en la etapa 14): sin red real
 * ni datos remotos. WhatsApp no se abre: window.open queda registrado en window.__abiertas.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CELULAR, VISTAS, abrirDetalle, mostrarTodo, URL_REAL, BASE as SITIO_TIENDA } from '../etapa9/ayudas.js';
import {
  CATALOGO_MIGRADO, conEstados, clonar, tiendaConSupabase, guardadoV3, CLAVE_CARRITO, cacheReal, URL_SUPABASE, CLAVE_PUBLICABLE_FICTICIA
} from '../etapa14/ayudas-etapa14.js';

const SAMBA = 'SAMBA';
const LCS = 'LCS Retro Classic';
const CAPTURAS = path.join(os.tmpdir(), 'gama-talla-16-1-capturas');
fs.mkdirSync(CAPTURAS, { recursive: true });

// 40 disponible y el resto por revisar, en SAMBA y LCS.
const BASE = conEstados(conEstados(CATALOGO_MIGRADO, SAMBA, { 40: 'DISPONIBLE' }), LCS, { 40: 'DISPONIBLE' });

// SAMBA con un segundo color en el que la 40 está por revisar y la 41 disponible.
function conSegundoColor(catalogo) {
  const copia = clonar(catalogo);
  const p = copia.find((x) => x.nombre === SAMBA);
  const otro = clonar(p.variantes[0]);
  Object.assign(otro, { id: 'samba-negro', codigoVariante: 'GT-SAMBA-B', color: 'Negro', referencia: 'SAMBA-NEGRO' });
  otro.tallas = otro.tallas.map((t) => ({ ...t, estado: t.talla === '41' ? 'DISPONIBLE' : 'POR_REVISAR' }));
  otro.tallasDisponibles = ['41'];
  otro.tallasPorRevisar = otro.tallas.filter((t) => t.talla !== '41').map((t) => t.talla);
  otro.tallasAgotadas = [];
  p.variantes.push(otro);
  return copia;
}

const DATOS = { nombre: 'Camila Rodríguez & Cía', telefono: '+57 300 123 4567', ciudad: 'Barranquilla', direccion: 'Calle 84 # 51B-20, apto 302', nota: 'Portería azul, timbre 302 😊' };

const ultimoMensaje = (pagina) => pagina.evaluate(() => {
  const enlace = window.__abiertas.at(-1);
  return enlace ? new URL(enlace).searchParams.get('text') : null;
});
const abiertas = (pagina) => pagina.evaluate(() => window.__abiertas.length);

async function rellenarEnvio(pagina, datos = DATOS) {
  for (const [campo, valor] of Object.entries(datos)) await pagina.locator(`#envio-${campo}`).fill(valor);
}

async function anadir(pagina, nombre, talla, cantidad = 1) {
  await pagina.evaluate(([n, t, c]) => {
    const p = estado.productos.find((x) => x.nombre === n);
    agregarAlCarrito(p.clave, p.variantes[0].id, t, c);
  }, [nombre, talla, cantidad]);
}

async function abrirCarrito(pagina) {
  await pagina.locator('#boton-carrito').click();
  await expect(pagina.locator('#carrito')).toHaveJSProperty('open', true);
}

// Etapa 16.2: las direcciones se guardan SOLO en la libreta (su propia clave). Nada de los datos
// en el carrito, la caché, otras claves, sessionStorage ni la dirección de la página.
const CLAVE_LIBRETA = 'gama-talla-direcciones';
async function sinRastroFueraDeLaLibreta(pagina) {
  const rastro = await pagina.evaluate((clave) => JSON.stringify(Object.entries({ ...localStorage }).filter(([k]) => k !== clave))
    + JSON.stringify({ ...sessionStorage }) + location.href, CLAVE_LIBRETA);
  for (const valor of ['Camila', 'Barranquilla', '51B-20', '300 123 4567']) expect(rastro, `«${valor}» solo en la libreta`).not.toContain(valor);
}

test.describe('Ficha: un solo botón de WhatsApp que pide o consulta', () => {
  test('talla por revisar: consulta directa con modelo, marca, color, referencia, talla, cantidad y precio', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const ficha = await abrirDetalle(pagina, SAMBA);
      const pedir = ficha.locator('[data-accion="pedir-ahora"]');
      await ficha.locator('.talla[data-talla="41"]').click();
      await ficha.locator('.detalle-compra [data-paso="1"]').click();
      await expect(pedir).toHaveText('Consultar esta talla por WhatsApp');
      await expect(pedir).not.toHaveAttribute('aria-disabled', 'true');
      await expect(ficha.locator('.detalle-compra .boton-comprar')).toHaveAttribute('aria-disabled', 'true');
      await expect(ficha.locator('.detalle-por-revisar')).toContainText('Consúltala por WhatsApp');
      await pedir.click();
      const mensaje = await ultimoMensaje(pagina);
      expect(mensaje).toContain('CONSULTA DE DISPONIBILIDAD');
      expect(mensaje).not.toContain('NUEVO PEDIDO');
      for (const parte of ['1. SAMBA', '* Marca: Adidas', '* Color: ', '* Referencia: ', '* Talla EU: 41', '* Cantidad: 2', '* Precio publicado: $120.000',
        'precio publicado continúa vigente']) expect(mensaje).toContain(parte);
      expect(mensaje).not.toContain('Mis datos');
      // Consultar no pide datos de envío ni toca el carrito.
      await expect(pagina.locator('#datos-envio')).toHaveJSProperty('open', false);
      expect(await guardadoV3(pagina)).toBeNull();
      await pagina.screenshot({ path: path.join(CAPTURAS, `ficha-consulta-${browserName}-390.png`) });
    }, { respuesta: BASE });
  });

  test('cambia al elegir talla, color o al llegar una actualización, también en modo consulta', async ({ browser, browserName }) => {
    let respuesta = conSegundoColor(BASE);
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const ficha = await abrirDetalle(pagina, SAMBA);
      const pedir = ficha.locator('[data-accion="pedir-ahora"]');
      await expect(pedir).toHaveText('Pedir este par por WhatsApp');
      // Sin talla: se pide elegirla y no se abre nada.
      await pedir.click();
      await expect(ficha.locator('#detalle-aviso, .detalle-aviso').first()).toContainText('Elige una talla EU');
      expect(await abiertas(pagina)).toBe(0);
      await ficha.locator('.talla[data-talla="40"]').click();
      await expect(pedir).toHaveText('Pedir este par por WhatsApp');
      await ficha.locator('.talla[data-talla="41"]').click();
      await expect(pedir).toHaveText('Consultar esta talla por WhatsApp');
      // Otro color: allí la 41 está disponible.
      await ficha.getByRole('button', { name: /Negro/ }).first().click();
      await expect(ficha.locator('.talla[data-talla="41"]')).toHaveAttribute('aria-pressed', 'true');
      await expect(pedir).toHaveText('Pedir este par por WhatsApp');
      await ficha.locator('.talla[data-talla="40"]').click();
      await expect(pedir).toHaveText('Consultar esta talla por WhatsApp');
      // Una actualización deja la 41 del color negro por revisar.
      await ficha.locator('.talla[data-talla="41"]').click();
      await expect(pedir).toHaveText('Pedir este par por WhatsApp');
      respuesta = conSegundoColor(conEstados(CATALOGO_MIGRADO, LCS, { 40: 'DISPONIBLE' }));
      const samba = respuesta.find((x) => x.nombre === SAMBA).variantes[1];
      samba.tallas = samba.tallas.map((t) => ({ ...t, estado: 'POR_REVISAR' }));
      samba.tallasPorRevisar = samba.tallas.map((t) => t.talla);
      samba.tallasDisponibles = [];
      await pagina.evaluate(() => refrescarCatalogo());
      await expect(pedir).toHaveText('Consultar esta talla por WhatsApp');
    }, { respuesta: () => respuesta });
  });

  test('una caída de conexión pasa la ficha a consulta y la recuperación vuelve a permitir el pedido', async ({ browser, browserName }) => {
    let modo = 'ok';
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const ficha = await abrirDetalle(pagina, SAMBA);
      const pedir = ficha.locator('[data-accion="pedir-ahora"]');
      await ficha.locator('.talla[data-talla="40"]').click();
      await expect(pedir).toHaveText('Pedir este par por WhatsApp');
      modo = 'falla';
      await pagina.evaluate(() => refrescarCatalogo());
      await expect(pedir).toHaveText('Consultar esta talla por WhatsApp');
      await pedir.click();
      expect(await ultimoMensaje(pagina)).toContain('CONSULTA DE DISPONIBILIDAD');
      modo = 'ok';
      await pagina.evaluate(() => refrescarCatalogo());
      await expect(pedir).toHaveText('Pedir este par por WhatsApp');
    }, { respuesta: () => (modo === 'falla' ? { fallo: 'red' } : BASE) });
  });

  test('agotadas no se eligen y una talla por revisar no se añade al carrito', async ({ browser, browserName }) => {
    const conAgotada = conEstados(BASE, SAMBA, { 42: 'AGOTADO' });
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const ficha = await abrirDetalle(pagina, SAMBA);
      await expect(ficha.locator('.talla[data-talla="42"]')).toBeDisabled();
      await ficha.locator('.talla[data-talla="41"]').click();
      await pagina.evaluate(() => agregarDesdeDetalle());
      expect(await guardadoV3(pagina)).toBeNull();
      await expect(pagina.locator('#datos-envio')).toHaveJSProperty('open', false);
    }, { respuesta: conAgotada });
  });
});

test.describe('Carrito: datos de envío obligatorios para el pedido', () => {
  test('sin datos el envío está bloqueado, también en la función; guardar, cancelar y editar', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await anadir(pagina, SAMBA, '40', 1);
      await abrirCarrito(pagina);
      const enviar = pagina.locator('#carrito-enviar');
      await expect(enviar).toHaveAttribute('aria-disabled', 'true');
      await expect(pagina.locator('#carrito-envio-aviso')).toHaveText('Completa tus datos de envío para continuar.');
      await expect(pagina.locator('#carrito-datos')).toHaveText('Agregar datos de envío');
      await expect(pagina.locator('#carrito-copiar')).toHaveCount(0);
      // Playwright no pulsa un botón con aria-disabled: se fuerza el clic y se prueba el teclado.
      await enviar.click({ force: true });
      await enviar.focus();
      await pagina.keyboard.press('Enter');
      await pagina.evaluate(() => enviarPedidoCarrito());
      expect(await abiertas(pagina), 'ni el botón ni la función envían sin datos').toBe(0);
      await expect(pagina.locator('#carrito-notificacion')).toContainText('Completa tus datos de envío');

      // Abrir el formulario sin completarlo no cuenta.
      await pagina.locator('#carrito-datos').click();
      await expect(pagina.locator('#datos-envio')).toHaveJSProperty('open', true);
      await expect(pagina.locator('#envio-nombre')).toBeFocused();
      await pagina.keyboard.press('Escape');
      await expect(pagina.locator('#datos-envio')).toHaveJSProperty('open', false);
      await expect(pagina.locator('#carrito-datos')).toBeFocused();
      await expect(enviar).toHaveAttribute('aria-disabled', 'true');

      // Datos inválidos: errores junto al campo y foco en el primero.
      await pagina.locator('#carrito-datos').click();
      await rellenarEnvio(pagina, { nombre: '    ', telefono: 'abc 123', ciudad: ' ', direccion: '12', nota: '' });
      await pagina.locator('#envio-guardar').click();
      await expect(pagina.locator('#envio-nombre')).toBeFocused();
      await expect(pagina.locator('#envio-nombre')).toHaveAttribute('aria-invalid', 'true');
      await expect(pagina.locator('#envio-nombre-error')).toHaveText('Escribe tu nombre completo.');
      await expect(pagina.locator('#envio-telefono-error')).toContainText('Usa solo números');
      await expect(pagina.locator('#envio-ciudad-error')).toHaveText('Escribe la ciudad.');
      await expect(pagina.locator('#envio-direccion-error')).toContainText('dirección completa');
      await pagina.locator('#envio-telefono').fill('300 12');
      await pagina.locator('#envio-guardar').click();
      await expect(pagina.locator('#envio-telefono-error')).toContainText('entre 7 y 15 dígitos');
      await pagina.keyboard.press('Escape');
      await expect(enviar).toHaveAttribute('aria-disabled', 'true');

      // Guardar: no abre WhatsApp; aparece el resumen y el botón cambia.
      await pagina.locator('#carrito-datos').click();
      await rellenarEnvio(pagina);
      await pagina.locator('#envio-guardar').click();
      await expect(pagina.locator('#datos-envio')).toHaveJSProperty('open', false);
      expect(await abiertas(pagina)).toBe(0);
      await expect(pagina.locator('#carrito-envio')).toBeVisible();
      await expect(pagina.locator('#carrito-envio-datos')).toContainText('Calle 84 # 51B-20, apto 302');
      await expect(pagina.locator('#carrito-datos')).toHaveText('Cambiar dirección de envío');
      await expect(pagina.locator('#carrito-envio-aviso')).toBeHidden();
      await expect(enviar).toHaveAttribute('aria-disabled', 'false');
      await pagina.screenshot({ path: path.join(CAPTURAS, `carrito-datos-${browserName}-390.png`) });

      // Cancelar una edición no sobrescribe lo guardado (16.2: se edita desde el gestor).
      await pagina.locator('#carrito-datos').click();
      await expect(pagina.locator('#envio-libreta')).toBeVisible();
      await pagina.locator('#envio-direcciones').getByRole('button', { name: /^Editar la dirección/ }).click();
      await expect(pagina.locator('#envio-nombre')).toHaveValue(DATOS.nombre);
      await pagina.locator('#envio-nombre').fill('Otra persona');
      await pagina.locator('#datos-envio').getByRole('button', { name: 'Cancelar' }).click();
      await expect(pagina.locator('#envio-libreta')).toBeVisible();
      await pagina.keyboard.press('Escape');
      await expect(pagina.locator('#carrito-envio-datos')).toContainText(DATOS.nombre);

      // Enviar: mensaje completo con nota, codificado correctamente; el carrito sigue.
      const antes = await guardadoV3(pagina);
      await enviar.click();
      let mensaje = await ultimoMensaje(pagina);
      expect(mensaje).toContain('NUEVO PEDIDO');
      expect(mensaje).toContain([
        '─────────────────', 'Mis datos:', `Nombre: ${DATOS.nombre}`, `Teléfono: ${DATOS.telefono}`, `Ciudad: ${DATOS.ciudad}`,
        `Dirección: ${DATOS.direccion}`, `Nota: ${DATOS.nota}`, '─────────────────', '💰TOTAL: $120.000', '🚚 Envío: Por confirmar.'
      ].join('\n'));
      expect(await guardadoV3(pagina), 'abrir WhatsApp no vacía el carrito').toEqual(antes);

      // Editar: sin nota no aparece la línea; con más unidades, cantidades y totales al día.
      await pagina.locator('#carrito-datos').click();
      await pagina.locator('#envio-direcciones').getByRole('button', { name: /^Editar la dirección/ }).click();
      await pagina.locator('#envio-nota').fill('   ');
      await pagina.locator('#envio-guardar').click();
      await expect(pagina.locator('#envio-libreta-aviso')).toContainText('Dirección actualizada.');
      await pagina.keyboard.press('Escape');
      await pagina.locator('#carrito .linea [data-paso="1"]').first().click();
      await enviar.click();
      mensaje = await ultimoMensaje(pagina);
      expect(mensaje).not.toContain('Nota:');
      expect(mensaje).toContain('* Cantidad: 2');
      expect(mensaje).toContain('* Subtotal: $240.000');
      expect(mensaje).toContain('💰TOTAL: $240.000');
      expect(mensaje).toContain(`Dirección: ${DATOS.direccion}\n─────────────────\n💰TOTAL`);
      await sinRastroFueraDeLaLibreta(pagina);
    }, { respuesta: BASE });
  });

  test('carrito mixto y carrito con todo por revisar', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await anadir(pagina, SAMBA, '40', 1);
      await pagina.evaluate(() => {
        const p = estado.productos.find((x) => x.nombre === 'SAMBA');
        estado.carrito.push({ producto: p.clave, variante: p.variantes[0].id, talla: '41', cantidad: 1, precio: p.variantes[0].precio });
        guardarCarrito();
      });
      await abrirCarrito(pagina);
      await expect(pagina.locator('#carrito-datos')).toBeVisible();
      await expect(pagina.locator('#carrito-consultar')).toBeVisible();
      // La consulta funciona sin datos de envío.
      const consulta = new URL(await pagina.locator('#carrito-consultar').getAttribute('href')).searchParams.get('text');
      expect(consulta).toContain('* Talla EU: 41');
      expect(consulta).not.toContain('Mis datos');
      await pagina.locator('#carrito-datos').click();
      await rellenarEnvio(pagina);
      await pagina.locator('#envio-guardar').click();
      await pagina.locator('#carrito-enviar').click();
      const pedido = await ultimoMensaje(pagina);
      expect(pedido).toContain('* Talla EU: 40');
      expect(pedido, 'la talla por revisar no entra en el pedido').not.toContain('* Talla EU: 41');
      // Solo por revisar: no se piden datos ni hay pedido; solo consulta.
      await pagina.evaluate(() => { estado.carrito = estado.carrito.filter((l) => l.talla === '41'); guardarCarrito(); renderizarCarrito(); });
      await expect(pagina.locator('#carrito-datos')).toBeHidden();
      await expect(pagina.locator('#carrito-envio-aviso')).toBeHidden();
      await expect(pagina.locator('#carrito-envio')).toBeHidden();
      await expect(pagina.locator('#carrito-enviar')).toBeHidden();
      await expect(pagina.locator('#carrito-consultar')).toBeVisible();
    }, { respuesta: BASE });
  });

  test('pedido largo: resumen en WhatsApp, mensaje completo copiado o visible si la copia falla', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await anadir(pagina, SAMBA, '40', 1);
      await anadir(pagina, LCS, '40', 3);
      await pagina.evaluate(() => {
        CONFIG.limiteEnlaceWhatsApp = 400;          // fuerza el caso «demasiado largo»
        navigator.clipboard.writeText = () => Promise.reject(new Error('sin permiso'));
        document.execCommand = () => false;
      });
      await abrirCarrito(pagina);
      await pagina.locator('#carrito-datos').click();
      await rellenarEnvio(pagina);
      await pagina.locator('#envio-guardar').click();
      await expect(pagina.locator('#carrito-respaldo')).toBeVisible();
      await expect(pagina.locator('#carrito-copiar-completo')).toBeVisible();
      await pagina.locator('#carrito-enviar').click();
      const corto = await ultimoMensaje(pagina);
      expect(corto).toContain('Te envío el detalle completo en el siguiente mensaje.');
      expect(corto).toContain(`Nombre: ${DATOS.nombre}`);
      const completo = pagina.locator('#carrito-mensaje-completo');
      await expect(completo).toBeVisible();
      const texto = await completo.inputValue();
      for (const parte of ['1. SAMBA', '2. LCS RETRO CLASSIC', '* Cantidad: 3', `Dirección: ${DATOS.direccion}`, `Nota: ${DATOS.nota}`, '💰TOTAL:']) expect(texto).toContain(parte);
      await expect(pagina.locator('#carrito-notificacion')).toContainText('No pudimos copiar automáticamente');
      // Con permiso de copia, el botón contextual copia el mensaje completo.
      await pagina.evaluate(() => { window.__copiado = ''; navigator.clipboard.writeText = (t) => { window.__copiado = t; return Promise.resolve(); }; });
      await pagina.locator('#carrito-copiar-completo').click();
      expect(await pagina.evaluate(() => window.__copiado)).toBe(texto);
    }, { respuesta: BASE });
  });
});

/* Respaldo del mensaje completo (cierre 16.1): si la copia falla y el mensaje queda a la vista,
 * nunca debe ofrecerse un texto que ya no corresponde al pedido ni a los datos actuales. */
const pausa = (pagina) => pagina.evaluate(() => new Promise((listo) => setTimeout(listo, 60)));

// Lo que muestra el respaldo y el mensaje que correspondería AHORA (null si no se puede pedir).
const respaldoCarrito = (pagina) => pagina.evaluate(() => {
  const area = document.querySelector('#carrito-mensaje-completo');
  const lineas = lineasComprables();
  const envio = datosEnvioValidos();
  return { visible: !area.hidden, valor: area.value, actual: lineas.length && envio ? crearMensajePedido(lineas, envio) : null,
           seccion: !document.querySelector('#carrito-respaldo').hidden };
});
const respaldoDirecto = (pagina) => pagina.evaluate(() => {
  const area = document.querySelector('#envio-respaldo');
  const linea = lineaDirecta();
  const envio = datosEnvioValidos();
  return { visible: !area.hidden, valor: area.value, actual: linea && envio ? crearMensajePedido([linea], envio) : null };
});
function sinMensajeAntiguo(r, antiguo) {
  expect(r.valor, 'el texto anterior no se ofrece como actual').not.toBe(antiguo);
  if (r.visible) expect(r.valor, 'si sigue a la vista, es el pedido actual').toBe(r.actual);
  else expect(r.valor, 'oculto y vacío').toBe('');
}

// Carrito con SAMBA ×1 y LCS ×3, datos guardados, copia imposible y un límite que hace largo
// el pedido completo pero no el de SAMBA sola (quitar LCS = el pedido deja de ser largo).
async function pedidoLargoSinCopia(pagina) {
  await anadir(pagina, SAMBA, '40', 1);
  await anadir(pagina, LCS, '40', 3);
  await pagina.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error('sin permiso'));
    document.execCommand = () => false;
  });
  await abrirCarrito(pagina);
  await pagina.locator('#carrito-datos').click();
  await rellenarEnvio(pagina);
  await pagina.locator('#envio-guardar').click();
  await expect(pagina.locator('#datos-envio')).toHaveJSProperty('open', false);
  await pagina.evaluate(() => {
    const envio = datosEnvioValidos();
    const medir = (lineas) => enlaceWhatsApp(crearMensajePedido(lineas, envio)).length;
    const todas = lineasComprables();
    CONFIG.limiteEnlaceWhatsApp = Math.floor((medir(todas.filter((l) => l.producto.nombre === 'SAMBA')) + medir(todas)) / 2);
    renderizarCarrito();
  });
  await expect(pagina.locator('#carrito-respaldo')).toBeVisible();
}
const lineaLcs = (pagina) => pagina.locator('#carrito .lineas li').filter({ hasText: 'LCS' });

test.describe('Respaldo del mensaje completo: siempre el pedido actual', () => {
  test('copia fallida, mensaje visible y cambio de cantidad: se actualiza o se retira; deja de ser largo = se oculta', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await pedidoLargoSinCopia(pagina);
      await pagina.locator('#carrito-enviar').click();
      const area = pagina.locator('#carrito-mensaje-completo');
      await expect(area).toBeVisible();
      const antiguo = await area.inputValue();
      expect(antiguo).toContain('* Cantidad: 3');
      await lineaLcs(pagina).getByRole('button', { name: 'Aumentar cantidad' }).click();
      await expect(lineaLcs(pagina)).toContainText('4');
      const tras = await respaldoCarrito(pagina);
      sinMensajeAntiguo(tras, antiguo);
      if (tras.visible) expect(tras.valor).toContain('* Cantidad: 4');
      // Sin LCS el pedido ya no es largo: el respaldo desaparece y queda vacío.
      await lineaLcs(pagina).locator('[data-eliminar]').click();
      await expect(pagina.locator('#carrito-respaldo')).toBeHidden();
      const corto = await respaldoCarrito(pagina);
      expect(corto).toMatchObject({ visible: false, valor: '', seccion: false });
    }, { respuesta: BASE });
  });

  test('copia fallida, mensaje visible y nueva dirección: el texto con la dirección anterior no se ofrece', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await pedidoLargoSinCopia(pagina);
      await pagina.locator('#carrito-enviar').click();
      const area = pagina.locator('#carrito-mensaje-completo');
      await expect(area).toBeVisible();
      const antiguo = await area.inputValue();
      expect(antiguo).toContain(`Dirección: ${DATOS.direccion}`);
      await pagina.locator('#carrito-datos').click();
      await expect(pagina.locator('#datos-envio')).toHaveJSProperty('open', true);
      await pagina.locator('#envio-direcciones').getByRole('button', { name: /^Editar la dirección/ }).click();
      await pagina.locator('#envio-direccion').fill('Carrera 50 # 70-15, casa 4');
      await pagina.locator('#envio-guardar').click();
      await expect(pagina.locator('#envio-libreta-aviso')).toContainText('Dirección actualizada.');
      await pagina.keyboard.press('Escape');
      await expect(pagina.locator('#datos-envio')).toHaveJSProperty('open', false);
      const tras = await respaldoCarrito(pagina);
      sinMensajeAntiguo(tras, antiguo);
      expect(tras.valor).not.toContain(DATOS.direccion);
      if (tras.visible) expect(tras.valor).toContain('Dirección: Carrera 50 # 70-15, casa 4');
      // El botón contextual copia el mensaje con la dirección nueva.
      await pagina.evaluate(() => { window.__copiado = ''; navigator.clipboard.writeText = (t) => { window.__copiado = t; return Promise.resolve(); }; });
      await pagina.locator('#carrito-copiar-completo').click();
      await expect.poll(() => pagina.evaluate(() => window.__copiado)).toContain('Dirección: Carrera 50 # 70-15, casa 4');
    }, { respuesta: BASE });
  });

  test('copia demorada: si el pedido cambia mientras se copia, no reaparece el mensaje anterior ni se da por copiado', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await pedidoLargoSinCopia(pagina);
      const demorar = () => pagina.evaluate(() => {
        navigator.clipboard.writeText = () => new Promise((ok, mal) => { window.__copia = { ok, mal }; });
      });
      // 1) La copia termina en fallo DESPUÉS de cambiar la cantidad.
      await demorar();
      const antes = await abiertas(pagina);
      const antiguo = (await respaldoCarrito(pagina)).actual;
      await pagina.locator('#carrito-enviar').click();
      await expect.poll(() => abiertas(pagina)).toBe(antes + 1);
      await expect.poll(() => pagina.evaluate(() => Boolean(window.__copia))).toBe(true);
      await lineaLcs(pagina).getByRole('button', { name: 'Aumentar cantidad' }).click();
      await pagina.evaluate(() => window.__copia.mal(new Error('sin permiso')));
      await pausa(pagina);
      sinMensajeAntiguo(await respaldoCarrito(pagina), antiguo);
      await expect(pagina.locator('#carrito-notificacion')).not.toContainText('Selecciona el mensaje completo de abajo');
      // 2) La copia termina bien DESPUÉS del cambio: lo copiado ya no es el pedido actual.
      await pagina.evaluate(() => { window.__copia = null; });
      const otro = (await respaldoCarrito(pagina)).actual;
      await pagina.locator('#carrito-enviar').click();
      await expect.poll(() => pagina.evaluate(() => Boolean(window.__copia))).toBe(true);
      await lineaLcs(pagina).getByRole('button', { name: 'Disminuir cantidad' }).click();
      await pagina.evaluate(() => window.__copia.ok());
      await pausa(pagina);
      sinMensajeAntiguo(await respaldoCarrito(pagina), otro);
      await expect(pagina.locator('#carrito-notificacion')).not.toContainText('copiamos el mensaje completo');
      await expect(pagina.locator('#carrito-notificacion')).toContainText('cambió');
    }, { respuesta: BASE });
  });

  test('pedido directo: el respaldo sigue al precio, la referencia, los datos y la disponibilidad; copia demorada', async ({ browser, browserName }) => {
    const conCambios = (cambios) => { const copia = clonar(BASE); Object.assign(copia.find((x) => x.nombre === SAMBA).variantes[0], cambios); return copia; };
    let respuesta = BASE;
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await pagina.evaluate(() => {
        CONFIG.limiteEnlaceWhatsApp = 300;
        navigator.clipboard.writeText = () => Promise.reject(new Error('sin permiso'));
        document.execCommand = () => false;
      });
      const ficha = await abrirDetalle(pagina, SAMBA);
      await ficha.locator('.talla[data-talla="40"]').click();
      await ficha.locator('[data-accion="pedir-ahora"]').click();
      await rellenarEnvio(pagina);
      await pagina.locator('#envio-guardar').click();
      await expect(pagina.locator('#envio-revision')).toBeVisible();
      await pagina.locator('#envio-enviar').click();
      const area = pagina.locator('#envio-respaldo');
      await expect(area).toBeVisible();
      const antiguo = await area.inputValue();
      expect(antiguo).toContain('GT-00001-A');
      expect(antiguo).toContain('$120.000');
      // Llega otro precio y otro código del color (16.2: es la referencia visible).
      respuesta = conCambios({ precio: 150000, codigoVariante: 'GT-00001-N' });
      await pagina.evaluate(() => refrescarCatalogo());
      await expect(pagina.locator('#envio-revision-par')).toContainText(/150\.000/);
      const trasPrecio = await respaldoDirecto(pagina);
      sinMensajeAntiguo(trasPrecio, antiguo);
      if (trasPrecio.visible) expect(trasPrecio.valor).toContain('GT-00001-N');
      // La talla pasa a por revisar: no hay pedido posible, el respaldo se retira.
      respuesta = conEstados(conCambios({ precio: 150000, codigoVariante: 'GT-00001-N' }), SAMBA, { 40: 'POR_REVISAR' });
      await pagina.evaluate(() => refrescarCatalogo());
      await expect(pagina.locator('#envio-enviar')).toHaveAttribute('aria-disabled', 'true');
      expect(await respaldoDirecto(pagina)).toMatchObject({ visible: false, valor: '', actual: null });
      // Vuelve a estar disponible; se envía, falla la copia y se editan los datos.
      respuesta = conCambios({ precio: 150000, codigoVariante: 'GT-00001-N' });
      await pagina.evaluate(() => refrescarCatalogo());
      await expect(pagina.locator('#envio-enviar')).toHaveAttribute('aria-disabled', 'false');
      await pagina.locator('#envio-enviar').click();
      await expect(area).toBeVisible();
      const conDatos = await area.inputValue();
      await pagina.locator('[data-envio-editar]').click();
      await pagina.locator('#envio-direcciones').getByRole('button', { name: /^Editar la dirección/ }).click();
      await pagina.locator('#envio-ciudad').fill('Santa Marta');
      await pagina.locator('#envio-guardar').click();
      await pagina.locator('#envio-usar').click();
      await expect(pagina.locator('#envio-revision-datos')).toContainText('Santa Marta');
      sinMensajeAntiguo(await respaldoDirecto(pagina), conDatos);
      // Copia demorada que falla después de un cambio de precio.
      await pagina.evaluate(() => { navigator.clipboard.writeText = () => new Promise((ok, mal) => { window.__copia = { ok, mal }; }); });
      const previo = (await respaldoDirecto(pagina)).actual;
      await pagina.locator('#envio-enviar').click();
      await expect.poll(() => pagina.evaluate(() => Boolean(window.__copia))).toBe(true);
      respuesta = conCambios({ precio: 135000, codigoVariante: 'GT-00001-N' });
      await pagina.evaluate(() => refrescarCatalogo());
      await expect(pagina.locator('#envio-revision-par')).toContainText(/135\.000/);
      await pagina.evaluate(() => window.__copia.mal(new Error('sin permiso')));
      await pausa(pagina);
      sinMensajeAntiguo(await respaldoDirecto(pagina), previo);
      await expect(pagina.locator('#envio-aviso')).not.toContainText('Selecciona el mensaje completo de abajo');
    }, { respuesta: () => respuesta });
  });
});

test.describe('«Pedir este par» desde la ficha', () => {
  test('pide datos si faltan, revisa y envía SOLO ese par con su cantidad; el carrito no cambia', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await anadir(pagina, LCS, '40', 1);
      const carrito = await guardadoV3(pagina);
      const ficha = await abrirDetalle(pagina, SAMBA);
      await ficha.locator('.talla[data-talla="40"]').click();
      await ficha.locator('.detalle-compra [data-paso="1"]').click();
      await ficha.locator('[data-accion="pedir-ahora"]').click();
      await expect(pagina.locator('#datos-envio')).toHaveJSProperty('open', true);
      await expect(pagina.locator('#envio-guardar')).toHaveText('Guardar y revisar el pedido');
      await rellenarEnvio(pagina);
      await pagina.locator('#envio-guardar').click();
      // Guardar no envía: hay una acción explícita.
      expect(await abiertas(pagina)).toBe(0);
      await expect(pagina.locator('#envio-revision')).toBeVisible();
      await expect(pagina.locator('#envio-revision-par')).toContainText('2');
      await pagina.screenshot({ path: path.join(CAPTURAS, `ficha-revision-${browserName}-390.png`) });
      await pagina.locator('#envio-enviar').click();
      const mensaje = await ultimoMensaje(pagina);
      expect(mensaje).toContain('1. SAMBA');
      expect(mensaje).toContain('* Cantidad: 2');
      expect(mensaje).toContain('💰TOTAL: $240.000');
      expect(mensaje, 'no incluye lo que hay en el carrito').not.toContain('LCS');
      expect(mensaje).not.toContain('2. ');
      expect(await guardadoV3(pagina), 'no añade nada al carrito').toEqual(carrito);
      // Con los datos ya guardados, va directo a la revisión.
      await pagina.keyboard.press('Escape');
      await ficha.locator('[data-accion="pedir-ahora"]').click();
      await expect(pagina.locator('#envio-revision')).toBeVisible();
      await expect(pagina.locator('#envio-formulario')).toBeHidden();
      await expect(pagina.locator('#envio-revision-par')).toContainText('SAMBA');
      await expect(pagina.locator('#envio-revision-datos')).toContainText(DATOS.nombre);
    }, { respuesta: BASE });
  });
});

for (const vista of VISTAS) {
  test(`${vista.nombre}px: formulario y resumen de envío sin desbordes, con controles táctiles`, async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
      await anadir(pagina, SAMBA, '40', 1);
      await abrirCarrito(pagina);
      await pagina.locator('#carrito-datos').click();
      await pagina.locator('#envio-guardar').click();
      await pagina.screenshot({ path: path.join(CAPTURAS, `envio-errores-${browserName}-${vista.nombre}.png`) });
      const medida = await pagina.evaluate(() => {
        const caja = document.querySelector('#datos-envio .envio');
        const r = caja.getBoundingClientRect();
        const controles = [...caja.querySelectorAll('input, textarea, button')].filter((n) => n.offsetParent).map((n) => n.getBoundingClientRect());
        return { dentro: r.left >= -1 && r.right <= innerWidth + 1, desborde: caja.scrollWidth - caja.clientWidth, pequeno: controles.filter((c) => c.height < 40).length };
      });
      expect(medida).toEqual({ dentro: true, desborde: 0, pequeno: 0 });
      await rellenarEnvio(pagina);
      await pagina.locator('#envio-guardar').click();
      // Con datos válidos el botón de envío recupera su color (tras su transición).
      await pagina.mouse.move(1, 1);
      await expect.poll(() => pagina.locator('#carrito-enviar').evaluate((b) => getComputedStyle(b).backgroundColor)).toBe('rgb(15, 122, 65)');
      await pagina.locator('#carrito-envio').scrollIntoViewIfNeeded();
      await pagina.screenshot({ path: path.join(CAPTURAS, `carrito-resumen-${browserName}-${vista.nombre}.png`) });
      expect(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      // Gestor de direcciones (16.2): sin desbordes y con controles cómodos.
      await pagina.locator('#carrito-datos').click();
      await expect(pagina.locator('#envio-libreta')).toBeVisible();
      const gestor = await pagina.evaluate(() => {
        const caja = document.querySelector('#datos-envio .envio');
        const seccion = document.querySelector('#envio-libreta');
        const r = caja.getBoundingClientRect();
        const controles = [...seccion.querySelectorAll('button, label.envio-direccion-opcion')].filter((n) => n.offsetParent).map((n) => n.getBoundingClientRect());
        return { dentro: r.left >= -1 && r.right <= innerWidth + 1, desborde: seccion.scrollWidth - seccion.clientWidth,
                 controlesDentro: controles.every((c) => c.right <= r.right + 1 && c.left >= r.left - 1), pequeno: controles.filter((c) => c.height < 40).length };
      });
      expect(gestor).toEqual({ dentro: true, desborde: 0, controlesDentro: true, pequeno: 0 });
      await pagina.screenshot({ path: path.join(CAPTURAS, `gestor-${browserName}-${vista.nombre}.png`) });
      await pagina.keyboard.press('Escape');
      // Revisión del pedido directo desde la ficha: sin desbordes y con controles cómodos.
      await pagina.keyboard.press('Escape');
      const ficha = await abrirDetalle(pagina, SAMBA);
      await ficha.locator('.talla[data-talla="40"]').click();
      await ficha.locator('[data-accion="pedir-ahora"]').click();
      await expect(pagina.locator('#envio-revision')).toBeVisible();
      await expect(pagina.locator('#envio-revision-par')).toContainText('SAMBA');
      await expect(pagina.locator('#envio-revision-datos')).toContainText(DATOS.direccion);
      const revision = await pagina.evaluate(() => {
        const caja = document.querySelector('#datos-envio .envio');
        const seccion = document.querySelector('#envio-revision');
        const r = caja.getBoundingClientRect();
        const botones = [...seccion.querySelectorAll('button')].map((n) => n.getBoundingClientRect());
        return { dentro: r.left >= -1 && r.right <= innerWidth + 1, desborde: seccion.scrollWidth - seccion.clientWidth,
                 botonesDentro: botones.every((c) => c.right <= r.right + 1 && c.left >= r.left - 1), pequeno: botones.filter((c) => c.height < 40).length };
      });
      expect(revision).toEqual({ dentro: true, desborde: 0, botonesDentro: true, pequeno: 0 });
      await pagina.screenshot({ path: path.join(CAPTURAS, `ficha-revision-${browserName}-${vista.nombre}.png`) });
    }, { respuesta: BASE });
  });
}

/* ---------------------------------------------------------------------------------------------
 * Etapa 16.2 · Libreta de direcciones en este navegador (sustituye la regla de 16.1 «datos solo
 * en memoria»). Se guardan al confirmar un formulario válido, con su propia clave y formato
 * versionado; la elegida se recuerda; nunca se usa otra en silencio.
 * ------------------------------------------------------------------------------------------- */
const DATOS2 = { nombre: 'Andrés Peña Ñúñez', telefono: '310 555 0101', ciudad: 'Santa Marta', direccion: 'Carrera 5 # 10-20, casa 3', nota: '' };
const libretaGuardada = (pagina) => pagina.evaluate((clave) => { const t = localStorage.getItem(clave); return t === null ? null : JSON.parse(t); }, CLAVE_LIBRETA);
const enGestor = (pagina, nombre) => pagina.locator('#envio-direcciones .envio-direccion').filter({ hasText: nombre });

async function nuevaVisita(pagina) {
  await pagina.goto('about:blank');
  await pagina.goto(URL_REAL);
  await pagina.locator('#grilla-productos[aria-busy="false"]').waitFor();
}

// Con el carrito abierto: añade una dirección (formulario directo si no hay ninguna, o desde el gestor).
async function anadirDireccion(pagina, datos) {
  await pagina.locator('#carrito-datos').click();
  await expect(pagina.locator('#datos-envio')).toHaveJSProperty('open', true);
  if (await pagina.locator('#envio-libreta').isVisible()) await pagina.locator('#envio-nueva').click();
  await expect(pagina.locator('#envio-formulario')).toBeVisible();
  await rellenarEnvio(pagina, datos);
  await pagina.locator('#envio-guardar').click();
  await expect(pagina.locator('#datos-envio')).toHaveJSProperty('open', false);
}

test.describe('Libreta de direcciones (16.2)', () => {
  test('dos direcciones: se guardan al confirmar, siguen al recargar y en una nueva visita, con la elegida', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const consola = [];
      pagina.on('console', (m) => consola.push(m.text()));
      await anadir(pagina, SAMBA, '40', 1);
      await abrirCarrito(pagina);
      await expect(pagina.locator('#carrito-datos')).toHaveText('Agregar datos de envío');
      // Escribir no guarda nada: solo confirmar un formulario válido.
      await pagina.locator('#carrito-datos').click();
      await expect(pagina.locator('#envio-formulario .envio-intro')).toContainText('únicamente en este navegador');
      await expect(pagina.locator('#envio-formulario .envio-intro')).toContainText('editarlas o eliminarlas');
      await rellenarEnvio(pagina);
      expect(await libretaGuardada(pagina), 'nada se guarda mientras se escribe').toBeNull();
      await pagina.locator('#envio-guardar').click();
      await expect(pagina.locator('#datos-envio')).toHaveJSProperty('open', false);
      await expect(pagina.locator('#carrito-datos')).toHaveText('Cambiar dirección de envío');
      await expect(pagina.locator('#carrito-envio-datos')).toContainText(DATOS.direccion);
      // La segunda NO sobrescribe la primera y queda elegida.
      await anadirDireccion(pagina, DATOS2);
      await expect(pagina.locator('#carrito-envio-datos')).toContainText(DATOS2.direccion);
      const guardada = await libretaGuardada(pagina);
      expect(guardada.version).toBe(1);
      expect(guardada.direcciones.map((d) => d.nombre)).toEqual([DATOS.nombre, DATOS2.nombre]);
      const [id1, id2] = guardada.direcciones.map((d) => d.id);
      expect(id1).not.toBe(id2);
      expect(guardada.seleccionada).toBe(id2);
      await sinRastroFueraDeLaLibreta(pagina);
      const carrito = await guardadoV3(pagina);
      expect(JSON.stringify(carrito), 'el carrito V3 no guarda direcciones').not.toContain('Camila');

      // Recargar: ambas siguen, con la misma elegida.
      await pagina.reload();
      await pagina.locator('#grilla-productos[aria-busy="false"]').waitFor();
      await abrirCarrito(pagina);
      await expect(pagina.locator('#carrito-envio-datos')).toContainText(DATOS2.direccion);
      await expect(pagina.locator('#carrito-enviar')).toHaveAttribute('aria-disabled', 'false');
      await pagina.locator('#carrito-datos').click();
      await expect(pagina.locator('#envio-libreta')).toBeVisible();
      await expect(pagina.locator('#envio-direcciones .envio-direccion')).toHaveCount(2);
      await expect(enGestor(pagina, DATOS2.nombre).getByRole('radio')).toBeChecked();
      await pagina.screenshot({ path: path.join(CAPTURAS, `gestor-direcciones-${browserName}-390.png`) });
      // Elegir la otra la recuerda en una nueva visita del mismo navegador.
      await enGestor(pagina, DATOS.nombre).getByRole('radio').check();
      // 16.3: elegir es una operación sobre la libreta guardada (asíncrona): se espera su aviso.
      await expect(pagina.locator('#envio-libreta-aviso')).toContainText('Dirección elegida');
      await expect(pagina.locator('#envio-libreta-aviso')).toContainText('Dirección elegida para el pedido.');
      await pagina.locator('#envio-usar').click();
      await expect(pagina.locator('#carrito-envio-datos')).toContainText(DATOS.direccion);
      await nuevaVisita(pagina);
      await abrirCarrito(pagina);
      await expect(pagina.locator('#carrito-envio-datos')).toContainText(DATOS.direccion);
      expect(await guardadoV3(pagina), 'el carrito sigue igual').toEqual(carrito);
      const otraVez = await libretaGuardada(pagina);
      expect(otraVez.direcciones.map((d) => d.id), 'identificadores estables').toEqual([id1, id2]);
      expect(otraVez.seleccionada).toBe(id1);
      expect(consola.join('\n'), 'nada de los datos en la consola').not.toContain('Camila');
    }, { respuesta: BASE });
  });

  test('editar cambia solo la elegida, cancelar no sobrescribe y ambos pedidos usan la dirección actual', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await anadir(pagina, SAMBA, '40', 1);
      await abrirCarrito(pagina);
      await anadirDireccion(pagina, DATOS);
      await anadirDireccion(pagina, DATOS2);
      const antes = await libretaGuardada(pagina);
      // Cancelar una edición no cambia nada guardado.
      await pagina.locator('#carrito-datos').click();
      await enGestor(pagina, DATOS2.nombre).getByRole('button', { name: /^Editar la dirección/ }).click();
      await expect(pagina.locator('#envio-titulo')).toHaveText('Editar dirección de envío');
      await expect(pagina.locator('#envio-direccion')).toHaveValue(DATOS2.direccion);
      await pagina.locator('#envio-direccion').fill('Esto no se guarda 123');
      await pagina.locator('#datos-envio').getByRole('button', { name: 'Cancelar' }).click();
      await expect(pagina.locator('#envio-libreta')).toBeVisible();
      expect(await libretaGuardada(pagina)).toEqual(antes);
      // Editar: solo esa dirección, con su mismo identificador; la otra intacta; la elegida no cambia.
      await enGestor(pagina, DATOS2.nombre).getByRole('button', { name: /^Editar la dirección/ }).click();
      await pagina.locator('#envio-direccion').fill('Carrera 5 # 10-20, casa 9');
      await pagina.locator('#envio-guardar').click();
      await expect(pagina.locator('#envio-libreta-aviso')).toContainText('Dirección actualizada.');
      const despues = await libretaGuardada(pagina);
      expect(despues.direcciones[0]).toEqual(antes.direcciones[0]);
      expect(despues.direcciones[1]).toEqual({ ...antes.direcciones[1], direccion: 'Carrera 5 # 10-20, casa 9' });
      expect(despues.seleccionada).toBe(antes.seleccionada);
      await pagina.locator('#envio-usar').click();
      // Pedido del carrito: la dirección elegida y actual.
      await pagina.locator('#carrito-enviar').click();
      let mensaje = await ultimoMensaje(pagina);
      expect(mensaje).toContain(`Nombre: ${DATOS2.nombre}`);
      expect(mensaje).toContain('Dirección: Carrera 5 # 10-20, casa 9');
      expect(mensaje).not.toContain(DATOS.direccion);
      // Pedido directo: la misma; y al elegir otra desde la revisión, la nueva.
      await pagina.keyboard.press('Escape');
      const ficha = await abrirDetalle(pagina, SAMBA);
      await ficha.locator('.talla[data-talla="40"]').click();
      await ficha.locator('[data-accion="pedir-ahora"]').click();
      await expect(pagina.locator('#envio-revision')).toBeVisible();
      await expect(pagina.locator('#envio-revision-datos')).toContainText('Carrera 5 # 10-20, casa 9');
      await pagina.locator('#envio-enviar').click();
      mensaje = await ultimoMensaje(pagina);
      expect(mensaje).toContain('Dirección: Carrera 5 # 10-20, casa 9');
      await pagina.locator('#datos-envio').getByRole('button', { name: 'Cambiar dirección de envío' }).click();
      await expect(pagina.locator('#envio-libreta')).toBeVisible();
      await expect(pagina.locator('#envio-usar')).toHaveText('Revisar el pedido');
      await enGestor(pagina, DATOS.nombre).getByRole('radio').check();
      // 16.3: elegir es una operación sobre la libreta guardada (asíncrona): se espera su aviso.
      await expect(pagina.locator('#envio-libreta-aviso')).toContainText('Dirección elegida');
      await pagina.locator('#envio-usar').click();
      await expect(pagina.locator('#envio-revision-datos')).toContainText(DATOS.direccion);
      await pagina.locator('#envio-enviar').click();
      mensaje = await ultimoMensaje(pagina);
      expect(mensaje).toContain(`Dirección: ${DATOS.direccion}`);
      expect(mensaje).toContain(`Nota: ${DATOS.nota}`);
      expect(mensaje).not.toContain('casa 9');
      await pagina.screenshot({ path: path.join(CAPTURAS, `revision-direccion-elegida-${browserName}-390.png`) });
    }, { respuesta: BASE });
  });

  test('eliminar la elegida bloquea el envío hasta elegir otra; nunca se usa otra en silencio', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await anadir(pagina, SAMBA, '40', 1);
      await abrirCarrito(pagina);
      await anadirDireccion(pagina, DATOS);
      await anadirDireccion(pagina, DATOS2);
      await pagina.locator('#carrito-datos').click();
      // Eliminar pide confirmación; «Conservar» no borra nada.
      await enGestor(pagina, DATOS2.nombre).getByRole('button', { name: /^Eliminar la dirección/ }).click();
      await expect(pagina.locator('[data-envio-confirmar-eliminar]')).toBeFocused();
      await pagina.screenshot({ path: path.join(CAPTURAS, `gestor-eliminar-${browserName}-390.png`) });
      await enGestor(pagina, DATOS2.nombre).getByRole('button', { name: 'Conservar' }).click();
      expect((await libretaGuardada(pagina)).direcciones).toHaveLength(2);
      await enGestor(pagina, DATOS2.nombre).getByRole('button', { name: /^Eliminar la dirección/ }).click();
      await enGestor(pagina, DATOS2.nombre).getByRole('button', { name: 'Sí, eliminar' }).click();
      await expect(pagina.locator('#envio-libreta-aviso')).toContainText('Eliminaste la dirección elegida. Elige otra antes de enviar el pedido.');
      await expect(pagina.locator('#envio-direcciones .envio-direccion')).toHaveCount(1);
      await expect(enGestor(pagina, DATOS.nombre).getByRole('radio')).not.toBeChecked();
      await expect(pagina.locator('#envio-usar')).toHaveAttribute('aria-disabled', 'true');
      expect(await libretaGuardada(pagina)).toMatchObject({ seleccionada: null });
      await pagina.keyboard.press('Escape');
      // El carrito no envía ni usa la otra dirección por su cuenta.
      await expect(pagina.locator('#carrito-enviar')).toHaveAttribute('aria-disabled', 'true');
      await expect(pagina.locator('#carrito-envio-aviso')).toHaveText('Elige una dirección de envío para continuar.');
      await expect(pagina.locator('#carrito-envio')).toBeHidden();
      await pagina.evaluate(() => enviarPedidoCarrito());
      expect(await abiertas(pagina)).toBe(0);
      await expect(pagina.locator('#carrito-notificacion')).toContainText('Elige una dirección de envío');
      // Pedido directo: pide elegir, tampoco envía.
      await pagina.keyboard.press('Escape');
      const ficha = await abrirDetalle(pagina, SAMBA);
      await ficha.locator('.talla[data-talla="40"]').click();
      await ficha.locator('[data-accion="pedir-ahora"]').click();
      await expect(pagina.locator('#envio-libreta')).toBeVisible();
      await expect(pagina.locator('#envio-libreta-aviso')).toContainText('Elige');
      await pagina.evaluate(() => enviarPedidoDirecto());
      expect(await abiertas(pagina)).toBe(0);
      // Elegirla expresamente permite el pedido.
      await enGestor(pagina, DATOS.nombre).getByRole('radio').check();
      // 16.3: elegir es una operación sobre la libreta guardada (asíncrona): se espera su aviso.
      await expect(pagina.locator('#envio-libreta-aviso')).toContainText('Dirección elegida');
      await pagina.locator('#envio-usar').click();
      await pagina.locator('#envio-enviar').click();
      expect(await ultimoMensaje(pagina)).toContain(`Dirección: ${DATOS.direccion}`);
    }, { respuesta: BASE });
  });

  test('almacenamiento bloqueado, corrupto, de formato desconocido o manipulado', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await anadir(pagina, SAMBA, '40', 1);
      const carrito = await guardadoV3(pagina);
      const recargar = async () => { await pagina.reload(); await pagina.locator('#grilla-productos[aria-busy="false"]').waitFor(); };

      // 1) JSON inválido: se avisa, no se rompe el carrito y guardar lo reemplaza por uno válido.
      await pagina.evaluate((c) => localStorage.setItem(c, '{"version":1,"direcciones":[{'), CLAVE_LIBRETA);
      await recargar();
      expect(await guardadoV3(pagina)).toEqual(carrito);
      await abrirCarrito(pagina);
      await expect(pagina.locator('#carrito-datos')).toHaveText('Agregar datos de envío');
      await pagina.locator('#carrito-datos').click();
      await expect(pagina.locator('#envio-formulario-aviso')).toContainText('No pudimos leer las direcciones guardadas');
      await rellenarEnvio(pagina);
      await pagina.locator('#envio-guardar').click();
      // 16.3: guardar es asíncrono (bloqueo entre pestañas): se espera a que termine.
      await expect(pagina.locator('#datos-envio')).toHaveJSProperty('open', false);
      expect((await libretaGuardada(pagina)).direcciones).toHaveLength(1);

      // 2) Manipulado: una dirección inválida, un id raro y HTML: se descartan o se muestran como texto.
      await pagina.evaluate((c) => localStorage.setItem(c, JSON.stringify({ version: 1, seleccionada: 'id-malo!!', direcciones: [
        { id: 'aaaaaaaa-1111', nombre: '<img src=x onerror="window.__xss=1">Ana', telefono: '300 111 2222', ciudad: 'Cali', direccion: 'Calle 1 # 2-3', nota: '<b>hola</b>' },
        { id: 'bbbbbbbb-2222', nombre: 'Sin teléfono', telefono: 'abc', ciudad: 'Cali', direccion: 'Calle 9 # 9-9', nota: '' },
        { id: 'id-malo!!', nombre: 'Id raro', telefono: '300 111 2222', ciudad: 'Cali', direccion: 'Calle 8 # 8-8', nota: '' }
      ] })), CLAVE_LIBRETA);
      await recargar();
      await abrirCarrito(pagina);
      await expect(pagina.locator('#carrito-enviar'), 'la elegida guardada no existe: hay que elegir').toHaveAttribute('aria-disabled', 'true');
      await pagina.locator('#carrito-datos').click();
      await expect(pagina.locator('#envio-direcciones .envio-direccion')).toHaveCount(1);
      await expect(pagina.locator('#envio-libreta-aviso')).toContainText('2 direcciones guardadas no eran válidas');
      await expect(enGestor(pagina, 'Ana')).toContainText('<img src=x');
      expect(await pagina.locator('#envio-direcciones img, #envio-direcciones b').count(), 'el HTML no se interpreta').toBe(0);
      expect(await pagina.evaluate(() => window.__xss)).toBeUndefined();
      await pagina.keyboard.press('Escape');

      // 3) Formato de una versión más nueva: no se toca y se avisa; se usa durante la visita.
      const futuro = JSON.stringify({ version: 2, libreta: ['formato nuevo'] });
      await pagina.evaluate(([c, f]) => localStorage.setItem(c, f), [CLAVE_LIBRETA, futuro]);
      await recargar();
      await abrirCarrito(pagina);
      await pagina.locator('#carrito-datos').click();
      await expect(pagina.locator('#envio-formulario-aviso')).toContainText('no reconoce; no las modificamos');
      await rellenarEnvio(pagina);
      await pagina.locator('#envio-guardar').click();
      await expect(pagina.locator('#carrito-notificacion')).toContainText('No la guardamos para no modificar las direcciones de una versión más nueva');
      await expect(pagina.locator('#carrito-enviar')).toHaveAttribute('aria-disabled', 'false');
      expect(await pagina.evaluate((c) => localStorage.getItem(c), CLAVE_LIBRETA), 'el formato nuevo queda intacto').toBe(futuro);
      await pagina.keyboard.press('Escape');

      // 4) Navegador que no deja guardar: sirve durante la visita, se dice, y no se recuerda.
      await pagina.evaluate((c) => localStorage.removeItem(c), CLAVE_LIBRETA);
      await pagina.addInitScript((c) => {
        const escribir = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) { if (k === c) throw new DOMException('Bloqueado', 'SecurityError'); return escribir.call(this, k, v); };
      }, CLAVE_LIBRETA);
      await recargar();
      expect(await guardadoV3(pagina)).toEqual(carrito);
      await abrirCarrito(pagina);
      await pagina.locator('#carrito-datos').click();
      await rellenarEnvio(pagina);
      await pagina.locator('#envio-guardar').click();
      await expect(pagina.locator('#carrito-notificacion')).toContainText('Este navegador no nos deja guardarla: servirá durante esta visita, pero no se recordará.');
      await expect(pagina.locator('#carrito-enviar')).toHaveAttribute('aria-disabled', 'false');
      await pagina.locator('#carrito-enviar').click();
      expect(await ultimoMensaje(pagina)).toContain(`Dirección: ${DATOS.direccion}`);
      expect(await guardadoV3(pagina), 'el carrito no se rompe').toEqual(carrito);
      await recargar();
      await abrirCarrito(pagina);
      await expect(pagina.locator('#carrito-datos'), 'no se presenta como guardada').toHaveText('Agregar datos de envío');
      expect(await guardadoV3(pagina)).toEqual(carrito);
    }, { respuesta: BASE });
  });

  test('otra pestaña: altas, ediciones y borrados actualizan selección, resumen y bloqueo', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await anadir(pagina, SAMBA, '40', 1);
      await abrirCarrito(pagina);
      await anadirDireccion(pagina, DATOS);
      // Otra pestaña del mismo navegador y del mismo sitio. Es un documento estático (sin la tienda)
      // para no tocar el carrito de esta: solo cambia la libreta, como lo haría otra pestaña.
      const otra = await pagina.context().newPage();
      await otra.goto(`${SITIO_TIENDA}/favicon.svg`);
      const cambiarEnOtra = (cambio) => otra.evaluate(([c, f]) => {
        const libreta = JSON.parse(localStorage.getItem(c));
        new Function('libreta', f)(libreta);
        localStorage.setItem(c, JSON.stringify(libreta));
      }, [CLAVE_LIBRETA, cambio]);
      // Edita la elegida: aquí cambia el resumen y el mensaje.
      await cambiarEnOtra("libreta.direcciones[0].direccion = 'Calle 99 # 1-1, desde otra pestaña';");
      await expect(pagina.locator('#carrito-envio-datos')).toContainText('Calle 99 # 1-1, desde otra pestaña');
      await pagina.locator('#carrito-enviar').click();
      expect(await ultimoMensaje(pagina)).toContain('Dirección: Calle 99 # 1-1, desde otra pestaña');
      // Añade una y la elige.
      await cambiarEnOtra("libreta.direcciones.push({ id: 'cccccccc-3333', nombre: 'Otra Pestaña', telefono: '300 999 8888', ciudad: 'Cúcuta', direccion: 'Avenida 3 # 4-5', nota: '' }); libreta.seleccionada = 'cccccccc-3333';");
      await expect(pagina.locator('#carrito-envio-datos')).toContainText('Avenida 3 # 4-5');
      // Con el gestor abierto: la lista se actualiza y se avisa.
      await pagina.locator('#carrito-datos').click();
      await expect(pagina.locator('#envio-direcciones .envio-direccion')).toHaveCount(2);
      await cambiarEnOtra("libreta.direcciones = libreta.direcciones.filter((d) => d.id !== 'cccccccc-3333'); libreta.seleccionada = null;");
      await expect(pagina.locator('#envio-libreta-aviso')).toContainText('Tus direcciones cambiaron en otra pestaña.');
      await expect(pagina.locator('#envio-direcciones .envio-direccion')).toHaveCount(1);
      await expect(pagina.locator('#envio-usar')).toHaveAttribute('aria-disabled', 'true');
      await pagina.keyboard.press('Escape');
      // Sin elegida: bloqueado, sin usar otra en silencio.
      await expect(pagina.locator('#carrito-enviar')).toHaveAttribute('aria-disabled', 'true');
      await expect(pagina.locator('#carrito-envio-aviso')).toHaveText('Elige una dirección de envío para continuar.');
      // Editando una dirección que otra pestaña elimina: se avisa que se guardará como nueva.
      await pagina.locator('#carrito-datos').click();
      await enGestor(pagina, DATOS.nombre).getByRole('button', { name: /^Editar la dirección/ }).click();
      await cambiarEnOtra('libreta.direcciones = [];');
      await expect(pagina.locator('#envio-formulario-aviso')).toContainText('se eliminó en otra pestaña');
      await expect(pagina.locator('#envio-titulo')).toHaveText('Nueva dirección de envío');
      await otra.close();
    }, { respuesta: BASE });
  });

  test('respaldo largo y copia demorada al cambiar de dirección (carrito y pedido directo)', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await anadir(pagina, SAMBA, '40', 1);
      await anadir(pagina, LCS, '40', 3);
      await pagina.evaluate(() => {
        navigator.clipboard.writeText = () => Promise.reject(new Error('sin permiso'));
        document.execCommand = () => false;
        CONFIG.limiteEnlaceWhatsApp = 300;
      });
      await abrirCarrito(pagina);
      await anadirDireccion(pagina, DATOS);
      await anadirDireccion(pagina, DATOS2);
      await pagina.evaluate(() => renderizarCarrito());
      // Copia fallida: el mensaje completo (con DATOS2) a la vista; elegir DATOS lo rehace.
      await pagina.locator('#carrito-enviar').click();
      const area = pagina.locator('#carrito-mensaje-completo');
      await expect(area).toBeVisible();
      const antiguo = await area.inputValue();
      expect(antiguo).toContain(DATOS2.direccion);
      await pagina.locator('#carrito-datos').click();
      await enGestor(pagina, DATOS.nombre).getByRole('radio').check();
      // 16.3: elegir es una operación sobre la libreta guardada (asíncrona): se espera su aviso.
      await expect(pagina.locator('#envio-libreta-aviso')).toContainText('Dirección elegida');
      await pagina.keyboard.press('Escape');
      const tras = await respaldoCarrito(pagina);
      sinMensajeAntiguo(tras, antiguo);
      if (tras.visible) expect(tras.valor).toContain(DATOS.direccion);
      // Copia demorada: termina en fallo DESPUÉS de cambiar de dirección; no reaparece la anterior.
      await pagina.evaluate(() => { navigator.clipboard.writeText = () => new Promise((ok, mal) => { window.__copia = { ok, mal }; }); });
      const previo = (await respaldoCarrito(pagina)).actual;
      await pagina.locator('#carrito-enviar').click();
      await expect.poll(() => pagina.evaluate(() => Boolean(window.__copia))).toBe(true);
      await pagina.locator('#carrito-datos').click();
      await enGestor(pagina, DATOS2.nombre).getByRole('radio').check();
      // 16.3: elegir es una operación sobre la libreta guardada (asíncrona): se espera su aviso.
      await expect(pagina.locator('#envio-libreta-aviso')).toContainText('Dirección elegida');
      await pagina.keyboard.press('Escape');
      await pagina.evaluate(() => window.__copia.mal(new Error('sin permiso')));
      await pausa(pagina);
      sinMensajeAntiguo(await respaldoCarrito(pagina), previo);
      await expect(pagina.locator('#carrito-notificacion')).toContainText('cambió');

      // Pedido directo: copia demorada y cambio de dirección desde la revisión.
      await pagina.keyboard.press('Escape');
      await pagina.evaluate(() => { window.__copia = null; });
      const ficha = await abrirDetalle(pagina, SAMBA);
      await ficha.locator('.talla[data-talla="40"]').click();
      await ficha.locator('[data-accion="pedir-ahora"]').click();
      await expect(pagina.locator('#envio-revision')).toBeVisible();
      const previoDirecto = (await respaldoDirecto(pagina)).actual;
      expect(previoDirecto).toContain(DATOS2.direccion);
      await pagina.locator('#envio-enviar').click();
      await expect.poll(() => pagina.evaluate(() => Boolean(window.__copia))).toBe(true);
      await pagina.locator('#datos-envio').getByRole('button', { name: 'Cambiar dirección de envío' }).click();
      await enGestor(pagina, DATOS.nombre).getByRole('radio').check();
      // 16.3: elegir es una operación sobre la libreta guardada (asíncrona): se espera su aviso.
      await expect(pagina.locator('#envio-libreta-aviso')).toContainText('Dirección elegida');
      await pagina.locator('#envio-usar').click();
      await expect(pagina.locator('#envio-revision-datos')).toContainText(DATOS.direccion);
      await pagina.evaluate(() => window.__copia.mal(new Error('sin permiso')));
      await pausa(pagina);
      sinMensajeAntiguo(await respaldoDirecto(pagina), previoDirecto);
      await expect(pagina.locator('#envio-aviso')).not.toContainText('Selecciona el mensaje completo de abajo');
    }, { respuesta: BASE });
  });
});

/* ---------------------------------------------------------------------------------------------
 * Etapa 16.2 · Códigos comerciales en la tienda: la referencia visible es el código ACTUAL del
 * color; la identidad del carrito es la clave inmutable, así que renombrar no pierde líneas.
 * ------------------------------------------------------------------------------------------- */
test.describe('Códigos comerciales en la tienda (16.2)', () => {
  test('renombrar ambos códigos no pierde el carrito; ficha, carrito, búsqueda y WhatsApp usan los nuevos', async ({ browser, browserName }) => {
    let respuesta = BASE;
    const renombrado = () => {
      const copia = clonar(BASE);
      const p = copia.find((x) => x.nombre === SAMBA);
      p.codigoInterno = 'SAMBA-OG';
      p.variantes[0].codigoVariante = 'SAMBA-OG/ROSA';
      return copia;
    };
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const original = BASE.find((x) => x.nombre === SAMBA);
      await anadir(pagina, SAMBA, '40', 2);
      await anadir(pagina, LCS, '40', 1);
      const carrito = await guardadoV3(pagina);
      expect(carrito.lineas.map((l) => l.producto), 'la línea usa la clave pública, no el código').toContain(original.id);
      const ficha = await abrirDetalle(pagina, SAMBA);
      await expect(ficha.locator('#detalle-referencia')).toHaveText(original.variantes[0].codigoVariante);
      await pagina.keyboard.press('Escape');
      // Llega el catálogo con los códigos cambiados (mismos id): se recarga la página.
      respuesta = renombrado();
      await pagina.reload();
      await pagina.locator('#grilla-productos[aria-busy="false"]').waitFor();
      expect(await guardadoV3(pagina), 'el carrito no se vacía ni se fusiona').toEqual(carrito);
      expect(await pagina.evaluate(() => lineasComprables().map((l) => [l.producto.nombre, l.talla, l.cantidad, l.variante.referencia])))
        .toEqual([['SAMBA', '40', 2, 'SAMBA-OG/ROSA'], ['LCS Retro Classic', '40', 1, BASE.find((x) => x.nombre === LCS).variantes[0].codigoVariante]]);
      await abrirCarrito(pagina);
      await expect(pagina.locator('#carrito .linea').first()).toContainText('Ref. SAMBA-OG/ROSA');
      await anadirDireccion(pagina, DATOS);
      await pagina.locator('#carrito-enviar').click();
      const mensaje = await ultimoMensaje(pagina);
      expect(mensaje).toContain('* Referencia: SAMBA-OG/ROSA');
      expect(mensaje, 'la referencia del proveedor no sustituye al código').not.toContain(`* Referencia: ${original.variantes[0].referencia}`);
      await pagina.keyboard.press('Escape');
      // Búsqueda por el código actual; el anterior ya no encuentra la zapatilla.
      await mostrarTodo(pagina);
      await pagina.locator('#buscar').fill('samba-og');
      await expect(pagina.locator('article.tarjeta')).toHaveCount(1);
      await pagina.locator('#buscar').fill(original.codigoInterno);
      await expect(pagina.locator('article.tarjeta')).toHaveCount(0);
      await pagina.locator('#buscar').fill('');
      const otraFicha = await abrirDetalle(pagina, SAMBA);
      await expect(otraFicha.locator('#detalle-referencia')).toHaveText('SAMBA-OG/ROSA');
    }, { respuesta: () => respuesta });
  });

  test('valores en mayúsculas del servidor: la tienda y WhatsApp los muestran tal cual, sin duplicar filtros', async ({ browser, browserName }) => {
    const mayus = clonar(BASE).map((p) => ({ ...p, nombre: p.nombre.toUpperCase(), marca: p.marca.toUpperCase(), categoria: p.categoria.toUpperCase(),
      variantes: p.variantes.map((v) => ({ ...v, color: v.color.toUpperCase() })) }));
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const marcas = await pagina.evaluate(() => [...new Set(estado.productos.map((p) => p.marca))]);
      expect(marcas.every((m) => m === m.toUpperCase())).toBe(true);
      expect(new Set(marcas.map((m) => m.toLowerCase())).size, 'una sola entrada por marca').toBe(marcas.length);
      await anadir(pagina, SAMBA, '40', 1);
      await abrirCarrito(pagina);
      await anadirDireccion(pagina, DATOS);
      await pagina.locator('#carrito-enviar').click();
      const mensaje = await ultimoMensaje(pagina);
      expect(mensaje).toContain('* Marca: ADIDAS');
      expect(mensaje).toContain('* Color: ROSA / BLANCO / BEIGH');
      expect(mensaje, 'los datos del cliente no pasan a mayúsculas').toContain(`Nombre: ${DATOS.nombre}`);
      await pagina.keyboard.press('Escape');
      await mostrarTodo(pagina);
      // La búsqueda no distingue mayúsculas.
      await pagina.locator('#buscar').fill('samba');
      await expect(pagina.locator('article.tarjeta', { hasText: 'SAMBA' }).first()).toBeVisible();
    }, { respuesta: mayus });
  });
});

/* ---------------------------------------------------------------------------------------------
 * Etapa 16.3 · Cierre de la libreta: toda operación parte de la última libreta GUARDADA.
 * Regresiones deterministas: los avisos de almacenamiento entre pestañas se silencian a propósito
 * para que la copia en memoria quede atrasada (lo que ocurre si el aviso llega tarde).
 * ------------------------------------------------------------------------------------------- */
const DATOS3 = { nombre: 'Lucía Gómez', telefono: '320 444 5566', ciudad: 'Cali', direccion: 'Avenida 6N # 23-45', nota: '' };
const silenciarOtrasPestanas = (p) => p.addInitScript(() => {
  window.addEventListener('storage', (e) => {
    if (e.key === 'gama-talla-direcciones' || e.key === null) e.stopImmediatePropagation();
  }, true);
});
// Segunda instancia de la tienda en el mismo navegador, con el mismo catálogo simulado.
async function otraInstancia(pagina, respuesta) {
  const otra = await pagina.context().newPage();
  await otra.route('**/rest/v1/catalogo_publico**', (r) => r.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(respuesta) }));
  await otra.addInitScript(([url, clave]) => {
    window.GAMA_TALLA_CONFIG = { catalogoUrl: url, catalogoClave: clave };
    window.__abiertas = [];
    window.open = (enlace) => { window.__abiertas.push(String(enlace)); return {}; };
  }, [URL_SUPABASE, CLAVE_PUBLICABLE_FICTICIA]);
  await silenciarOtrasPestanas(otra);
  await otra.goto(URL_REAL);
  await otra.locator('#grilla-productos[aria-busy="false"]').waitFor();
  return otra;
}
const recargar = async (p) => { await p.reload(); await p.locator('#grilla-productos[aria-busy="false"]').waitFor(); };

test.describe('Libreta: guardados solapados y datos dañados (16.3)', () => {
  test('dos instancias con la misma libreta atrasada: ningún guardado borra el de la otra', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await anadir(pagina, SAMBA, '40', 1);
      await abrirCarrito(pagina);
      await anadirDireccion(pagina, DATOS);
      // Las dos parten de [A] y no reciben los avisos de la otra.
      await silenciarOtrasPestanas(pagina);
      await recargar(pagina);
      const otra = await otraInstancia(pagina, BASE);
      await abrirCarrito(otra);
      await expect(otra.locator('#carrito-envio-datos')).toContainText(DATOS.direccion);
      // La primera añade B; la segunda, todavía con [A] en memoria, añade C.
      await abrirCarrito(pagina);
      await anadirDireccion(pagina, DATOS2);
      await anadirDireccion(otra, DATOS3);
      let guardada = await libretaGuardada(pagina);
      expect(guardada.direcciones.map((d) => d.nombre), 'la dirección de la otra pestaña se conserva').toEqual([DATOS.nombre, DATOS2.nombre, DATOS3.nombre]);
      expect(guardada.seleccionada).toBe(guardada.direcciones[2].id);
      // La primera, aún atrasada ([A, B]), elige A: también parte de lo último y conserva C.
      await pagina.locator('#carrito-datos').click();
      await enGestor(pagina, DATOS.nombre).getByRole('radio').check();
      // 16.3: elegir es una operación sobre la libreta guardada (asíncrona): se espera su aviso.
      await expect(pagina.locator('#envio-libreta-aviso')).toContainText('Dirección elegida');
      await expect(pagina.locator('#envio-direcciones .envio-direccion'), 'la lista se pone al día').toHaveCount(3);
      guardada = await libretaGuardada(pagina);
      expect(guardada.direcciones).toHaveLength(3);
      expect(guardada.seleccionada).toBe(guardada.direcciones[0].id);
      // La segunda edita B, que nunca vio en su copia inicial: se edita la de verdad, sin duplicarla.
      await otra.locator('#carrito-datos').click();
      await enGestor(otra, DATOS2.nombre).getByRole('button', { name: /^Editar la dirección/ }).click();
      await otra.locator('#envio-direccion').fill('Carrera 5 # 10-20, casa 7');
      await otra.locator('#envio-guardar').click();
      await expect(otra.locator('#envio-libreta-aviso')).toContainText('Dirección actualizada.');
      guardada = await libretaGuardada(pagina);
      expect(guardada.direcciones.map((d) => d.direccion)).toEqual([DATOS.direccion, 'Carrera 5 # 10-20, casa 7', DATOS3.direccion]);
      expect(guardada.seleccionada, 'la elección de la primera se conserva').toBe(guardada.direcciones[0].id);
      await otra.close();
    }, { respuesta: BASE });
  });

  test('un formato posterior que aparece antes de guardar no se sobrescribe; la dirección sirve en la visita', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await anadir(pagina, SAMBA, '40', 1);
      await abrirCarrito(pagina);
      await anadirDireccion(pagina, DATOS);
      // Otra versión de la tienda guarda un formato nuevo; esta pestaña no se ha enterado.
      const futuro = JSON.stringify({ version: 2, libreta: ['formato nuevo'] });
      await pagina.evaluate(([c, f]) => localStorage.setItem(c, f), [CLAVE_LIBRETA, futuro]);
      await anadirDireccion(pagina, DATOS2);
      await expect(pagina.locator('#carrito-notificacion')).toContainText('No la guardamos para no modificar las direcciones de una versión más nueva');
      expect(await pagina.evaluate((c) => localStorage.getItem(c), CLAVE_LIBRETA), 'el formato nuevo sigue intacto').toBe(futuro);
      await expect(pagina.locator('#carrito-enviar')).toHaveAttribute('aria-disabled', 'false');
      await pagina.locator('#carrito-enviar').click();
      expect(await ultimoMensaje(pagina)).toContain(`Dirección: ${DATOS2.direccion}`);
      // Elegir o eliminar tampoco lo tocan.
      await pagina.keyboard.press('Escape');
      await abrirCarrito(pagina);
      await pagina.locator('#carrito-datos').click();
      await enGestor(pagina, DATOS.nombre).getByRole('radio').check();
      // 16.3: elegir es una operación sobre la libreta guardada (asíncrona): se espera su aviso.
      await expect(pagina.locator('#envio-libreta-aviso')).toContainText('Dirección elegida');
      await expect(pagina.locator('#envio-libreta-aviso')).toContainText('no nos deja recordarla');
      await enGestor(pagina, DATOS2.nombre).getByRole('button', { name: /^Eliminar la dirección/ }).click();
      await enGestor(pagina, DATOS2.nombre).getByRole('button', { name: 'Sí, eliminar' }).click();
      await expect(pagina.locator('#envio-direcciones .envio-direccion')).toHaveCount(1);
      expect(await pagina.evaluate((c) => localStorage.getItem(c), CLAVE_LIBRETA)).toBe(futuro);
    }, { respuesta: BASE });
  });

  test('campos dañados con objetos, números o listas: se descartan; con la elegida dañada, el pedido se bloquea', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await anadir(pagina, SAMBA, '40', 1);
      await pagina.evaluate((c) => localStorage.setItem(c, JSON.stringify({ version: 1, seleccionada: 'danada-0001', direcciones: [
        { id: 'danada-0001', nombre: { texto: 'Ana Pérez' }, telefono: '300 111 2222', ciudad: 'Cali', direccion: 'Calle 1 # 2-3', nota: '' },
        { id: 'danada-0002', nombre: 'Beto Ruiz', telefono: 3001112222, ciudad: 'Cali', direccion: 'Calle 2 # 3-4' },
        { id: 'danada-0003', nombre: 'Carla Díaz', telefono: '300 111 2222', ciudad: ['Cali'], direccion: 'Calle 3 # 4-5' },
        { id: 'danada-0004', nombre: 'Dora Paz', telefono: '300 111 2222', ciudad: 'Cali', direccion: 'Calle 4 # 5-6', nota: { x: 1 } },
        { id: 'valida-0005', nombre: 'Elena Ríos', telefono: '300 111 2222', ciudad: 'Cali', direccion: 'Calle 5 # 6-7' }
      ] })), CLAVE_LIBRETA);
      await recargar(pagina);
      await abrirCarrito(pagina);
      await expect(pagina.locator('#carrito-enviar'), 'la elegida estaba dañada: hay que elegir').toHaveAttribute('aria-disabled', 'true');
      await pagina.evaluate(() => enviarPedidoCarrito());
      expect(await abiertas(pagina)).toBe(0);
      await pagina.locator('#carrito-datos').click();
      await expect(pagina.locator('#envio-direcciones .envio-direccion')).toHaveCount(1);
      await expect(pagina.locator('#envio-libreta-aviso')).toContainText('4 direcciones guardadas no eran válidas');
      expect(await pagina.locator('#datos-envio').textContent()).not.toContain('[object');
      // La válida (sin nota: la nota puede faltar) se puede elegir y usar.
      await enGestor(pagina, 'Elena Ríos').getByRole('radio').check();
      // 16.3: elegir es una operación sobre la libreta guardada (asíncrona): se espera su aviso.
      await expect(pagina.locator('#envio-libreta-aviso')).toContainText('Dirección elegida');
      await pagina.locator('#envio-usar').click();
      await pagina.locator('#carrito-enviar').click();
      const mensaje = await ultimoMensaje(pagina);
      expect(mensaje).toContain('Nombre: Elena Ríos');
      expect(mensaje).not.toContain('[object');
      const guardada = await libretaGuardada(pagina);
      expect(guardada.direcciones.map((d) => d.id), 'al guardar quedan solo las válidas').toEqual(['valida-0005']);
    }, { respuesta: BASE });
  });

  test('pulsaciones repetidas al guardar no duplican la dirección', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await anadir(pagina, SAMBA, '40', 1);
      await abrirCarrito(pagina);
      await pagina.locator('#carrito-datos').click();
      await rellenarEnvio(pagina, DATOS);
      await pagina.evaluate(() => { const f = document.querySelector('#envio-formulario'); f.requestSubmit(); f.requestSubmit(); f.requestSubmit(); });
      await expect(pagina.locator('#datos-envio')).toHaveJSProperty('open', false);
      await pausa(pagina);
      expect((await libretaGuardada(pagina)).direcciones).toHaveLength(1);
    }, { respuesta: BASE });
  });
});

test.describe('Libreta: escritura bloqueada durante la visita (cierre 16.3)', () => {
  test('lectura permitida y escritura bloqueada: las direcciones temporales se conservan toda la visita', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await anadir(pagina, SAMBA, '40', 1);
      await abrirCarrito(pagina);
      // Dato persistido antes del bloqueo.
      await anadirDireccion(pagina, DATOS);
      const persistida = await pagina.evaluate((c) => localStorage.getItem(c), CLAVE_LIBRETA);
      const carrito = await guardadoV3(pagina);
      // Desde aquí el navegador deja LEER la libreta pero no ESCRIBIRLA.
      await pagina.addInitScript((c) => {
        const escribir = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) { if (k === c) throw new DOMException('Bloqueado', 'QuotaExceededError'); return escribir.call(this, k, v); };
      }, CLAVE_LIBRETA);
      await recargar(pagina);
      await abrirCarrito(pagina);
      await expect(pagina.locator('#carrito-envio-datos')).toContainText(DATOS.direccion);
      // Dos direcciones en la misma visita: la segunda no puede hacer olvidar la primera.
      await anadirDireccion(pagina, DATOS2);
      await expect(pagina.locator('#carrito-notificacion')).toContainText('servirá durante esta visita');
      await anadirDireccion(pagina, DATOS3);
      await pagina.locator('#carrito-datos').click();
      await expect(pagina.locator('#envio-direcciones .envio-direccion')).toHaveCount(3);
      // Se edita y se elige la primera dirección temporal.
      await enGestor(pagina, DATOS2.nombre).getByRole('button', { name: /^Editar la dirección/ }).click();
      await pagina.locator('#envio-direccion').fill('Carrera 5 # 10-20, casa 11');
      await pagina.locator('#envio-guardar').click();
      await expect(pagina.locator('#envio-libreta-aviso')).toContainText('Dirección actualizada.');
      await expect(pagina.locator('#envio-direcciones .envio-direccion')).toHaveCount(3);
      await enGestor(pagina, DATOS2.nombre).getByRole('radio').check();
      await expect(pagina.locator('#envio-libreta-aviso')).toContainText('Dirección elegida');
      await expect(pagina.locator('#envio-direcciones .envio-direccion')).toHaveCount(3);
      await pagina.locator('#envio-usar').click();
      await expect(pagina.locator('#carrito-envio-datos')).toContainText('Carrera 5 # 10-20, casa 11');
      await pagina.locator('#carrito-enviar').click();
      const mensaje = await ultimoMensaje(pagina);
      expect(mensaje).toContain(`Nombre: ${DATOS2.nombre}`);
      expect(mensaje).toContain('Dirección: Carrera 5 # 10-20, casa 11');
      // Lo persistido antes y el carrito siguen intactos.
      expect(await pagina.evaluate((c) => localStorage.getItem(c), CLAVE_LIBRETA)).toBe(persistida);
      expect(await guardadoV3(pagina)).toEqual(carrito);
    }, { respuesta: BASE });
  });
});
