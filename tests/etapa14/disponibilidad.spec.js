// Etapa 14 · La tienda interpreta los tres estados de disponibilidad.
// El catálogo que se sirve es el REAL migrado en la etapa 13 (supabase/local/vista-publica.json).
import { test, expect } from '@playwright/test';
import { VISTAS, CELULAR, ESCRITORIO, enTienda, abrirDetalle, mostrarTodo, sinDesborde } from '../etapa9/ayudas.js';
import {
  CATALOGO_MIGRADO, conEstados, sinTalla, tiendaConSupabase, estadosDeTallas,
  lineasDelCarrito, guardadoV3, abrirCarritoDesdeCabecera, textoDe, CLAVE_CARRITO, CLAVE_CACHE,
  CLAVE_CACHE_ANTERIOR, PROYECTO, cacheReal
} from './ayudas-etapa14.js';

const SAMBA = 'SAMBA';
const LCS = 'LCS Retro Classic';
const claveDe = (catalogo, nombre) => catalogo.find((p) => p.nombre === nombre).id;
const lineaV3 = (catalogo, nombre, talla, cantidad = 1) => {
  const p = catalogo.find((x) => x.nombre === nombre);
  return { producto: p.id, variante: p.variantes[0].id, talla, cantidad, precio: p.variantes[0].precio };
};
const carritoV3 = (lineas) => ({ version: 3, lineas, pendientes: [] });

test.describe('Catálogo migrado: las 180 tallas POR REVISAR', () => {
  for (const vista of VISTAS) {
    test(`${vista.nombre}px: los 28 productos siguen visibles, en su orden y sin marcarse como agotados`, async ({ browser, browserName }) => {
      await tiendaConSupabase({ browser, browserName }, vista, async (pagina, { problemas }) => {
        await mostrarTodo(pagina);
        const r = await pagina.evaluate(() => ({
          productos: estado.productos.length,
          nombres: estado.productos.map((p) => p.nombre),
          porRevisar: estado.productos.reduce((a, p) => a + p.tallasPorRevisar.length, 0),
          disponibles: estado.productos.reduce((a, p) => a + p.tallasDisponibles.length, 0),
          ofrecidos: estado.productos.filter((p) => p.ofrecida).length,
          tarjetas: document.querySelectorAll('.tarjeta').length,
          agotadas: document.querySelectorAll('.tarjeta-agotada').length,
          insignias: document.querySelectorAll('.insignia-agotado').length,
          respaldo: estado.respaldo
        }));
        expect(r.productos).toBe(28);
        expect(r.tarjetas, 'ningún producto desaparece').toBe(28);
        expect(r.porRevisar, 'las 180 tallas migradas están por revisar').toBe(180);
        expect(r.disponibles, 'ninguna se presenta como confirmada').toBe(0);
        expect(r.ofrecidos, 'todos siguen ofreciéndose').toBe(28);
        expect(r.agotadas, 'por revisar no es agotado').toBe(0);
        expect(r.insignias).toBe(0);
        expect(r.respaldo, 'Supabase respondió: no es modo respaldo').toBeNull();
        expect(r.nombres, 'el orden del catálogo no cambia').toEqual(CATALOGO_MIGRADO.map((p) => p.nombre));
        expect(problemas).toEqual([]);
        await sinDesborde(pagina);
      });
    });
  }

  test('la tira de tallas de la tarjeta sigue mostrando las tallas ofrecidas', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const tarjeta = pagina.locator('.tarjeta').first();
      await expect(tarjeta.locator('.talla-mini').first()).toBeVisible();
      await expect(tarjeta.locator('.tarjeta-sin-tallas')).toHaveCount(0);
    });
  });

  test('el filtro por talla encuentra productos cuya talla está por revisar', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, ESCRITORIO, async (pagina) => {
      const conLa40 = await pagina.evaluate(() =>
        estado.productos.filter((p) => p.tallasOfrecidas.includes('40')).length);
      expect(conLa40).toBeGreaterThan(0);
      await pagina.evaluate(() => { estado.talla = '40'; renderizarCatalogo(); });
      await expect(pagina.locator('.tarjeta')).toHaveCount(Math.min(conLa40, 12));
    });
  });
});

test.describe('Ficha: una talla por revisar se elige pero no se compra', () => {
  for (const vista of [CELULAR, ESCRITORIO]) {
    test(`${vista.nombre}px: seleccionable, marcada y no añadible`, async ({ browser, browserName }) => {
      await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
        const dialogo = await abrirDetalle(pagina, SAMBA);
        const talla = dialogo.locator('.talla[data-talla="40"]');
        await expect(talla).toBeEnabled();
        await expect(talla).toHaveClass(/talla-por-revisar/);
        await expect(talla).toHaveAttribute('aria-label', 'EU 40, por revisar');
        await talla.click();
        await expect(talla).toHaveAttribute('aria-pressed', 'true');
        // El rótulo general del color ya no existe: el estado vive en la talla.
        await expect(dialogo.locator('#detalle-disponibilidad')).toBeHidden();
        await expect(dialogo.locator('.tallas-nota')).toContainText('por revisar');

        const agregar = dialogo.locator('.detalle-acciones [data-accion="agregar"]');
        await agregar.scrollIntoViewIfNeeded();
        // Marcado como inerte: ni el cliente ni un lector de pantalla lo ven comprable.
        await expect(agregar).toHaveAttribute('aria-disabled', 'true');
        await expect(agregar).toHaveAttribute('aria-describedby', 'detalle-nota-por-revisar');
        await expect(dialogo.locator('#detalle-nota-por-revisar')).toContainText('necesita confirmación');
        // Y forzando la pulsación tampoco compra.
        await agregar.click({ force: true });
        await expect(dialogo.locator('#detalle-aviso')).toContainText('está por revisar');
        await expect(pagina.locator('#confirmacion-carrito'), 'no se abre la confirmación').toHaveJSProperty('open', false);
        expect(await pagina.evaluate((c) => localStorage.getItem(c), CLAVE_CARRITO), 'nada entra al carrito').toBeNull();
      });
    });
  }

  test('la marca no depende solo del color: trazo discontinuo y rótulo', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, SAMBA);
      const estilo = await dialogo.locator('.talla[data-talla="40"]').evaluate((b) => getComputedStyle(b).borderTopStyle);
      expect(estilo).toBe('dashed');
    });
  });

  test('«Pedir este par» no manda un pedido de una talla por revisar', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, SAMBA);
      await dialogo.locator('.talla[data-talla="40"]').click();
      const pedir = dialogo.getByRole('button', { name: 'Pedir este par por WhatsApp' });
      await pedir.scrollIntoViewIfNeeded();
      // Pedir el par es una compra directa: también debe quedar inerte.
      await expect(pedir).toHaveAttribute('aria-disabled', 'true');
      await pedir.click({ force: true });
      await expect(dialogo.locator('#detalle-aviso')).toContainText('por revisar');
      expect(await pagina.evaluate(() => window.__abiertas)).toEqual([]);
    });
  });

  test('con la talla confirmada, la compra funciona igual que antes', async ({ browser, browserName }) => {
    const catalogo = conEstados(CATALOGO_MIGRADO, SAMBA, { 40: 'DISPONIBLE' });
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, SAMBA);
      const talla = dialogo.locator('.talla[data-talla="40"]');
      await expect(talla).not.toHaveClass(/talla-por-revisar/);
      await talla.click();
      await expect(dialogo.locator('#detalle-disponibilidad')).toBeHidden();
      const agregar = dialogo.locator('.detalle-acciones [data-accion="agregar"]');
      await agregar.scrollIntoViewIfNeeded();
      await expect(agregar, 'una talla confirmada no marca el botón').not.toHaveAttribute('aria-disabled', 'true');
      await expect(dialogo.locator('#detalle-nota-por-revisar')).toHaveCount(0);
      await agregar.click();
      await expect(pagina.locator('#confirmacion-carrito')).toHaveJSProperty('open', true);
      const guardado = await guardadoV3(pagina);
      expect(guardado.version).toBe(3);
      expect(guardado.lineas).toHaveLength(1);
    }, { respuesta: catalogo });
  });
});

test.describe('Una talla que deja de ofrecerse', () => {
  /* La etapa 12 cubría este caso alterando a mano variante.tallasDisponibles. Desde la
     etapa 14 el estado de cada talla vive en variante.estadosTalla, así que esa
     alteración deja un estado imposible en la aplicación real. Aquí se reproduce como
     ocurre de verdad: la talla desaparece del catálogo que entrega Supabase. */
  for (const vista of [CELULAR, ESCRITORIO]) {
    test(`${vista.nombre}px: no se añade y la ficha sigue abierta`, async ({ browser, browserName }) => {
      const conDisponible = conEstados(CATALOGO_MIGRADO, SAMBA, { 40: 'DISPONIBLE' });
      await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
        const dialogo = await abrirDetalle(pagina, SAMBA);
        await dialogo.locator('.talla[data-talla="40"]').click();
        // El catálogo se refresca y la 40 ya no se ofrece. La ficha abierta no se
        // reconstruye (el botón sigue dibujado), pero la validación usa el dato nuevo.
        await pagina.evaluate(() => refrescarCatalogo());
        expect(await pagina.evaluate(() =>
          estado.productos.find((x) => x.nombre === 'SAMBA').variantes[0].estadosTalla['40']),
          'la talla ya no figura en el catálogo').toBeUndefined();
        const agregar = dialogo.locator('.detalle-acciones [data-accion="agregar"]');
        await agregar.scrollIntoViewIfNeeded();
        await agregar.click();
        await expect(dialogo.locator('#detalle-aviso')).toContainText('Elige una talla EU');
        await expect(dialogo, 'la ficha sigue abierta').toHaveJSProperty('open', true);
        await expect(pagina.locator('#confirmacion-carrito')).toHaveJSProperty('open', false);
        expect(await pagina.evaluate((c) => localStorage.getItem(c), CLAVE_CARRITO)).toBeNull();
      }, { respuesta: (n) => (n === 1 ? conDisponible : sinTalla(CATALOGO_MIGRADO, SAMBA, '40')) });
    });
  }

  test('una talla agotada no se puede elegir en la ficha', async ({ browser, browserName }) => {
    const agotada = conEstados(CATALOGO_MIGRADO, SAMBA, { 40: 'AGOTADO' });
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, SAMBA);
      const talla = dialogo.locator('.talla[data-talla="40"]');
      await expect(talla).toBeDisabled();
      await expect(talla).toHaveClass(/talla-agotada/);
      await expect(talla).toHaveAttribute('aria-label', 'EU 40, agotada');
    }, { respuesta: agotada });
  });
});

test.describe('Carrito: conservar, excluir y retirar', () => {
  test('mezcla de DISPONIBLE y POR REVISAR: ambas se conservan, solo una se pide', async ({ browser, browserName }) => {
    const catalogo = conEstados(CATALOGO_MIGRADO, SAMBA, { 40: 'DISPONIBLE' });
    const carrito = carritoV3([lineaV3(catalogo, SAMBA, '40', 2), lineaV3(catalogo, SAMBA, '41', 1)]);
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const lineas = await lineasDelCarrito(pagina);
      expect(lineas, 'las dos líneas se conservan').toHaveLength(2);
      expect(lineas.map((l) => l.estado).sort()).toEqual(['DISPONIBLE', 'POR_REVISAR']);

      await abrirCarritoDesdeCabecera(pagina);
      await expect(pagina.locator('#carrito .linea')).toHaveCount(2);
      await expect(pagina.locator('#carrito .linea-por-revisar')).toHaveCount(1);
      await expect(pagina.locator('#carrito .linea-aviso')).toContainText('no se incluye en el pedido');
      await expect(pagina.locator('#carrito-nota')).toContainText('por revisar');
      await expect(pagina.locator('#carrito-unidades'), 'el resumen cuenta lo pedible').toHaveText('2');

      const mensaje = textoDe(await pagina.locator('#carrito-enviar').getAttribute('href'));
      expect(mensaje).toContain('Talla EU: 40');
      expect(mensaje, 'la talla por revisar no entra en NUEVO PEDIDO').not.toContain('Talla EU: 41');
      expect(mensaje.match(/^\d+\. /gm), 'una sola entrada').toHaveLength(1);
      expect(mensaje, 'el formato aprobado no cambia').toContain('*GAMA & TALLA — NUEVO PEDIDO*');
      expect(mensaje).not.toContain('Disponibilidad');
    }, { respuesta: catalogo, carrito });
  });

  test('una línea vence mientras está en el carrito: se conserva y se marca', async ({ browser, browserName }) => {
    const conDisponible = conEstados(CATALOGO_MIGRADO, SAMBA, { 40: 'DISPONIBLE' });
    const carrito = carritoV3([lineaV3(conDisponible, SAMBA, '40', 2)]);
    // La primera lectura la da como disponible; al refrescar, ya venció.
    const respuesta = (n) => (n === 1 ? conDisponible : CATALOGO_MIGRADO);
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      expect((await lineasDelCarrito(pagina))[0].estado).toBe('DISPONIBLE');
      await abrirCarritoDesdeCabecera(pagina);          // refrescarCatalogo vuelve a leer
      await expect(pagina.locator('#carrito .linea')).toHaveCount(1);
      await expect(pagina.locator('#carrito .linea-por-revisar')).toHaveCount(1);
      expect((await lineasDelCarrito(pagina))[0].estado).toBe('POR_REVISAR');
      expect((await guardadoV3(pagina)).lineas, 'la línea sigue guardada').toHaveLength(1);
      await expect(pagina.locator('#carrito-enviar')).toHaveAttribute('data-sin-pedido', 'true');
      await expect(pagina.locator('#carrito-notificacion')).not.toContainText('Retiramos');
    }, { respuesta, carrito });
  });

  test('una línea pasa a AGOTADO: se retira y se informa', async ({ browser, browserName }) => {
    const conDisponible = conEstados(CATALOGO_MIGRADO, SAMBA, { 40: 'DISPONIBLE' });
    const agotada = conEstados(CATALOGO_MIGRADO, SAMBA, { 40: 'AGOTADO' });
    const carrito = carritoV3([lineaV3(conDisponible, SAMBA, '40', 1)]);
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await abrirCarritoDesdeCabecera(pagina);
      await expect(pagina.locator('#carrito-notificacion')).toContainText('agotados');
      await expect(pagina.locator('#carrito .linea')).toHaveCount(0);
      expect((await guardadoV3(pagina)).lineas).toHaveLength(0);
    }, { respuesta: (n) => (n === 1 ? conDisponible : agotada), carrito });
  });

  test('una talla que desaparece del catálogo se retira', async ({ browser, browserName }) => {
    const conDisponible = conEstados(CATALOGO_MIGRADO, SAMBA, { 40: 'DISPONIBLE' });
    const carrito = carritoV3([lineaV3(conDisponible, SAMBA, '40', 1)]);
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await abrirCarritoDesdeCabecera(pagina);
      await expect(pagina.locator('#carrito .linea')).toHaveCount(0);
    }, { respuesta: (n) => (n === 1 ? conDisponible : sinTalla(CATALOGO_MIGRADO, SAMBA, '40')), carrito });
  });

  test('solo por revisar: no se puede enviar el pedido, pero nada se pierde', async ({ browser, browserName }) => {
    const carrito = carritoV3([lineaV3(CATALOGO_MIGRADO, SAMBA, '40', 1), lineaV3(CATALOGO_MIGRADO, LCS, '38', 1)]);
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await abrirCarritoDesdeCabecera(pagina);
      await expect(pagina.locator('#carrito .linea')).toHaveCount(2);
      // Sin nada confirmado, no se ofrece ninguna accion de pedido normal.
      const enviar = pagina.locator('#carrito-enviar');
      await expect(enviar).toBeHidden();
      await expect(pagina.locator('#carrito-copiar')).toBeHidden();
      expect(await enviar.getAttribute('href'), 'sin pedido no hay enlace').toBeNull();
      await expect(pagina.locator('#carrito-nota')).toContainText('por revisar');
      expect(await pagina.evaluate(() => window.__abiertas)).toEqual([]);
      expect((await guardadoV3(pagina)).lineas).toHaveLength(2);
    }, { respuesta: CATALOGO_MIGRADO, carrito });
  });

  test('un carrito V3 guardado antes de la migración sigue reconociendo sus productos', async ({ browser, browserName }) => {
    // Claves heredadas tal y como las calculaba la tienda antes de Supabase.
    const carrito = carritoV3([
      { producto: 'ADD-SAM~zapatilla-01', variante: 'unica', talla: '40', cantidad: 2, precio: 120000 },
      { producto: 'LCS-RET-01~zapatilla-02', variante: 'unica', talla: '38', cantidad: 1, precio: 120000 }
    ]);
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const resueltas = await pagina.evaluate(() => estado.carrito.map((l) => ({
        clave: l.producto,
        producto: Boolean(productoPorClave(l.producto)),
        variante: Boolean(varianteDe(productoPorClave(l.producto), l.variante))
      })));
      expect(resueltas).toHaveLength(2);
      expect(resueltas.every((r) => r.producto && r.variante), JSON.stringify(resueltas)).toBe(true);
      const guardado = await guardadoV3(pagina);
      expect(guardado.version, 'la estructura V3 no cambia').toBe(3);
      expect(guardado.lineas, 'ninguna línea se pierde').toHaveLength(2);
    }, { respuesta: CATALOGO_MIGRADO, carrito });
  });
});

test.describe('Modo respaldo', () => {
  const carrito = carritoV3([{ producto: 'ADD-SAM~zapatilla-01', variante: 'unica', talla: '40', cantidad: 2, precio: 120000 }]);

  for (const [nombre, fallo] of [['error 500', { fallo: 500 }], ['caída de red', { fallo: 'red' }]]) {
    test(`${nombre} con caché: modo consulta, todo por revisar y el carrito intacto`, async ({ browser, browserName }) => {
      const cache = cacheReal(conEstados(CATALOGO_MIGRADO, SAMBA, { 40: 'DISPONIBLE' }));
      await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
        const r = await pagina.evaluate(() => ({
          respaldo: estado.respaldo,
          disponibles: estado.productos.reduce((a, p) => a + p.tallasDisponibles.length, 0),
          productos: estado.productos.length
        }));
        expect(r.productos, 'el catálogo se sigue consultando').toBe(28);
        expect(r.respaldo?.motivo).toBe('cache');
        expect(r.disponibles, 'ni una talla se presenta como confirmada').toBe(0);
        await expect(pagina.locator('#aviso-respaldo')).toBeVisible();
        await expect(pagina.locator('#aviso-respaldo')).toContainText('Modo consulta');
        expect((await guardadoV3(pagina)).lineas, 'un fallo de conexión no vacía el carrito').toHaveLength(1);
        await abrirCarritoDesdeCabecera(pagina);
        await expect(pagina.locator('#carrito .linea')).toHaveCount(1);
        await expect(pagina.locator('#carrito-enviar'), 'no se piden datos sin verificar').toHaveAttribute('data-sin-pedido', 'true');
        await expect(pagina.locator('#carrito-notificacion')).not.toContainText('Retiramos');
      }, { respuesta: fallo, carrito, cache });
    });
  }

  // Etapa 16: los 28 productos del JSON son EJEMPLOS y nunca sustituyen al catálogo real.
  test('sin caché: no se muestran los ejemplos del JSON; aviso de conexión y carrito intacto', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const r = await pagina.evaluate(() => ({ productos: estado.productos.length, listo: estado.catalogoListo }));
      expect(r.productos, 'ningún ejemplo se presenta como catálogo').toBe(0);
      expect(r.listo).toBe(false);
      await expect(pagina.locator('.estado-catalogo h3')).toHaveText('No pudimos cargar las zapatillas');
      await expect(pagina.locator('.estado-catalogo')).toContainText('Comprueba tu conexión');
      await expect(pagina.locator('.tarjeta')).toHaveCount(0);
      const pedidos = await pagina.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name));
      expect(pedidos.filter((n) => n.includes('productos.json')), 'ni se pidió el JSON de ejemplos').toEqual([]);
      expect((await guardadoV3(pagina)).lineas, 'un fallo de conexión no vacía el carrito').toHaveLength(1);
    }, { respuesta: { fallo: 500 }, carrito, tarjetas: false });
  });

  test('una caché antigua (sin proyecto) o de otro proyecto no se usa como catálogo', async ({ browser, browserName }) => {
    for (const cache of [
      { clave: CLAVE_CACHE_ANTERIOR, valor: { texto: JSON.stringify(CATALOGO_MIGRADO), fecha: Date.now() } },
      { clave: CLAVE_CACHE, valor: cacheReal(CATALOGO_MIGRADO, Date.now(), 'https://otro-proyecto.supabase.co') },
      { clave: CLAVE_CACHE, valor: { ...cacheReal(CATALOGO_MIGRADO), formato: 1 } }
    ]) {
      await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
        await pagina.evaluate(([c, v]) => localStorage.setItem(c, JSON.stringify(v)), [cache.clave, cache.valor]);
        await pagina.reload();
        await expect(pagina.locator('.estado-catalogo h3')).toHaveText('No pudimos cargar las zapatillas');
        expect(await pagina.evaluate(() => estado.productos.length)).toBe(0);
        expect(await pagina.evaluate((c) => localStorage.getItem(c), CLAVE_CACHE_ANTERIOR), 'la caché anterior se retira').toBeNull();
      }, { respuesta: { fallo: 'red' }, tarjetas: false });
    }
  });

  test('al recuperarse la conexión, el aviso desaparece y vuelven los estados reales', async ({ browser, browserName }) => {
    const bueno = conEstados(CATALOGO_MIGRADO, SAMBA, { 40: 'DISPONIBLE' });
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await expect(pagina.locator('#aviso-respaldo')).toBeVisible();
      await pagina.evaluate(() => refrescarCatalogo());      // segunda lectura: ya responde
      await expect(pagina.locator('#aviso-respaldo')).toHaveCount(0);
      const r = await pagina.evaluate(() => ({
        respaldo: estado.respaldo,
        disponibles: estado.productos.reduce((a, p) => a + p.tallasDisponibles.length, 0)
      }));
      expect(r.respaldo).toBeNull();
      expect(r.disponibles).toBeGreaterThan(0);
    }, { respuesta: (n) => (n === 1 ? { fallo: 500 } : bueno), cache: cacheReal(CATALOGO_MIGRADO) });
  });

  test('el catálogo bueno se guarda en caché para el próximo fallo', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const cache = await pagina.evaluate((c) => JSON.parse(localStorage.getItem(c) || 'null'), CLAVE_CACHE);
      expect(cache, 'se guardó el catálogo con su formato y su proyecto').toMatchObject({ formato: 2, proyecto: PROYECTO });
      expect(cache.productos).toHaveLength(28);
    });
  });
});

test.describe('Lo aprobado sigue igual', () => {
  test('el modo de prueba no toca Supabase y conserva su catálogo ficticio', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
      const r = await pagina.evaluate(() => ({
        productos: estado.productos.length,
        respaldo: estado.respaldo,
        disponibles: estado.productos.reduce((a, p) => a + p.tallasDisponibles.length, 0)
      }));
      expect(r.productos).toBe(6);
      expect(r.respaldo, 'el modo de prueba nunca entra en respaldo').toBeNull();
      expect(r.disponibles, 'sigue habiendo tallas comprables').toBeGreaterThan(0);
    }, { url: 'http://127.0.0.1:8765/?datos-prueba&intro=no', reducido: true });
  });

  test('sin configuración de Supabase, la tienda lee el JSON como hasta ahora', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
      const r = await pagina.evaluate(() => ({
        productos: estado.productos.length,
        respaldo: estado.respaldo,
        disponibles: estado.productos.reduce((a, p) => a + p.tallasDisponibles.length, 0),
        porRevisar: estado.productos.reduce((a, p) => a + p.tallasPorRevisar.length, 0)
      }));
      expect(r.productos).toBe(28);
      expect(r.respaldo).toBeNull();
      expect(r.disponibles, 'el JSON de hoy sigue dando tallas comprables').toBe(138);
      expect(r.porRevisar, 'sin Supabase no hay estado por revisar').toBe(0);
    }, { reducido: true });
  });

  test('la guía de tallas sigue funcionando con el catálogo migrado', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, SAMBA);
      await expect(dialogo.locator('.equivalencias-marca-nombre')).toHaveText('Adidas · Hombre');
      await dialogo.getByRole('button', { name: 'Guía de tallas' }).click();
      await expect(pagina.locator('#guia-tallas')).toHaveJSProperty('open', true);
    });
  });

  test('fotos, precios y descuentos del catálogo migrado', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, SAMBA);
      await expect(dialogo.locator('#detalle-nombre')).toHaveText(SAMBA);
      await expect(dialogo.locator('.detalle-marca')).toContainText('Adidas');
      await expect(dialogo.locator('.detalle-precio .precio-actual')).toContainText('120.000');
      await expect(dialogo.locator('.detalle-precio .precio-anterior')).toContainText('290.000');
      await expect(dialogo.locator('.detalle-precio .precio-ahorro')).toHaveText('59% OFF');
      await expect(dialogo.locator('.galeria-foto img').first()).toHaveAttribute('src', /zapatilla_01\.webp/);
      await expect.poll(() => dialogo.locator('.galeria-foto img').first()
        .evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
    });
  });
});
