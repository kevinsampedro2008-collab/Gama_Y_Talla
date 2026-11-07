// Ayudas de la etapa 12: abrir la ficha, añadir un par y leer los mensajes de WhatsApp.
import { expect } from '@playwright/test';
import { abrirDetalle } from '../etapa9/ayudas.js';

export const CLAVE_CARRITO_PRUEBA = 'gama-talla-carrito-v3-prueba';
export const CLAVE_CARRITO = 'gama-talla-carrito-v3';
export const NUMERO = '573124745942';

export const ventanaDe = (pagina) => pagina.locator('#confirmacion-carrito');
export const estaAbierta = (ventana) => ventana.evaluate((d) => d.open);

// Ya abierta y lista para recibir pulsaciones (pasó la protección contra el doble toque).
export async function ventanaLista(pagina) {
  const ventana = ventanaDe(pagina);
  await expect(ventana).toHaveJSProperty('open', true);
  await expect(ventana).not.toHaveAttribute('data-recien', '');
  return ventana;
}

// Elige la talla y añade desde la ficha. Con cantidad > 1 pulsa «+» antes.
export async function anadirDesdeFicha(pagina, nombre, { talla, cantidad = 1, variante } = {}) {
  const dialogo = await abrirDetalle(pagina, nombre);
  if (variante) await dialogo.locator(`[data-variante="${variante}"]`).click();
  await dialogo.locator(`.talla[data-talla="${talla}"]`).click();
  for (let i = 1; i < cantidad; i++) await dialogo.locator('.detalle-compra [data-cantidad-detalle][data-paso="1"]').click();
  const agregar = dialogo.locator('.detalle-acciones [data-accion="agregar"]');
  await agregar.scrollIntoViewIfNeeded();
  await agregar.click();
  return { dialogo, agregar, ventana: await ventanaLista(pagina) };
}

// Cierra la ventana y la ficha para volver a añadir otro par.
export async function volverAlCatalogo(pagina) {
  await ventanaDe(pagina).getByRole('button', { name: 'Seguir explorando' }).click();
  await expect(pagina.locator('#modal-producto')).toHaveJSProperty('open', false);
}

export const textoDe = (url) => new URL(url).searchParams.get('text');
export const moneda = (valor) => `$${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(valor)}`;
// Lo que se ve en la tienda lleva un espacio tras el signo: se compara por las cifras.
export const cifras = (texto) => Number(String(texto).replace(/\D/g, ''));
