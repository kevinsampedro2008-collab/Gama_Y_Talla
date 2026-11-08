// Etapa 14 · La ficha abierta se pone al día cuando cambia la disponibilidad,
// sin cerrarse ni perder la galería, y el entorno decide si el JSON local vale.
import { test, expect } from '@playwright/test';
import { VISTAS, CELULAR, ESCRITORIO, abrirDetalle } from '../etapa9/ayudas.js';
import {
  CATALOGO_MIGRADO, conEstados, sinTalla, tiendaConSupabase, tallaEnFicha,
  URL_SUPABASE, CLAVE_CARRITO, CLAVE_CACHE, abrirCarritoDesdeCabecera, cacheReal, CLAVE_PUBLICABLE_FICTICIA
} from './ayudas-etapa14.js';

const SAMBA = 'SAMBA';
// Estado de partida: 40, 41 y 42 comprables; el resto por revisar.
const CON_TRES = conEstados(CATALOGO_MIGRADO, SAMBA, { 40: 'DISPONIBLE', 41: 'DISPONIBLE', 42: 'DISPONIBLE' });

// Lee la galería para comprobar que un refresco no la toca.
const estadoGaleria = (dialogo) => dialogo.evaluate((d) => {
  const pista = d.querySelector('.galeria-pista');
  const foto = d.querySelector('.galeria-foto img');
  return {
    foto: foto?.getAttribute('src') ?? null,
    indice: estado.detalle.foto,
    desplazamiento: Math.round(pista?.scrollLeft ?? -1),
    contador: d.querySelector('.galeria-contador')?.textContent?.trim() ?? null,
    abierta: d.open
  };
});

test.describe('Ficha abierta y catálogo que cambia por detrás', () => {
  for (const vista of [CELULAR, ESCRITORIO]) {
    test(`${vista.nombre}px: de DISPONIBLE a POR REVISAR sin cerrar la ficha`, async ({ browser, browserName }) => {
      const despues = conEstados(CON_TRES, SAMBA, { 41: 'POR_REVISAR' });
      await tiendaConSupabase({ browser, browserName }, vista, async (pagina, { problemas }) => {
        const dialogo = await abrirDetalle(pagina, SAMBA);
        await tallaEnFicha(dialogo, '41').click();
        await expect(tallaEnFicha(dialogo, '41')).not.toHaveClass(/talla-por-revisar/);
        const antes = await estadoGaleria(dialogo);

        await pagina.evaluate(() => refrescarCatalogo());

        // La talla se marca en el acto, sin reabrir nada.
        await expect(tallaEnFicha(dialogo, '41')).toHaveClass(/talla-por-revisar/);
        await expect(tallaEnFicha(dialogo, '41')).toHaveAttribute('aria-label', 'EU 41, por revisar');
        await expect(tallaEnFicha(dialogo, '41'), 'sigue eligible para consultarla').toBeEnabled();
        await expect(dialogo, 'la ficha no se cierra').toHaveJSProperty('open', true);
        await expect(dialogo.locator('.detalle-por-revisar')).toContainText('necesita confirmación');
        await expect(dialogo.locator('.detalle-compra')).toHaveAttribute('data-talla-por-revisar', '');

        // La galería no se ha tocado.
        expect(await estadoGaleria(dialogo)).toEqual(antes);

        // Y el botón ya no compra: queda marcado como inerte en el acto, sin reabrir.
        const agregar = dialogo.locator('.detalle-acciones [data-accion="agregar"]');
        await agregar.scrollIntoViewIfNeeded();
        await expect(agregar).toHaveAttribute('aria-disabled', 'true');
        await expect(dialogo.getByRole('button', { name: 'Pedir este par por WhatsApp' }))
          .toHaveAttribute('aria-disabled', 'true');
        await agregar.click({ force: true });
        await expect(dialogo.locator('#detalle-aviso')).toContainText('está por revisar');
        expect(await pagina.evaluate((c) => localStorage.getItem(c), CLAVE_CARRITO)).toBeNull();
        expect(problemas).toEqual([]);
      }, { respuesta: (n) => (n === 1 ? CON_TRES : despues) });
    });

    test(`${vista.nombre}px: de DISPONIBLE a AGOTADO deshabilita y suelta la talla`, async ({ browser, browserName }) => {
      const despues = conEstados(CON_TRES, SAMBA, { 41: 'AGOTADO' });
      await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
        const dialogo = await abrirDetalle(pagina, SAMBA);
        await tallaEnFicha(dialogo, '41').click();
        await expect(dialogo.locator('#detalle-talla')).toHaveText('41');
        const antes = await estadoGaleria(dialogo);

        await pagina.evaluate(() => refrescarCatalogo());

        await expect(tallaEnFicha(dialogo, '41')).toBeDisabled();
        await expect(tallaEnFicha(dialogo, '41')).toHaveClass(/talla-agotada/);
        await expect(tallaEnFicha(dialogo, '41')).toHaveAttribute('aria-label', 'EU 41, agotada');
        // La talla deja de estar elegida: el botón no puede quedar listo para comprarla.
        await expect(dialogo.locator('#detalle-talla')).toHaveText('Sin elegir');
        await expect(dialogo.locator('#detalle-aviso')).toContainText('se agotó');
        await expect(dialogo).toHaveJSProperty('open', true);
        expect(await estadoGaleria(dialogo)).toEqual(antes);

        // Añadir ahora pide una talla, no compra la agotada.
        const agregar = dialogo.locator('.detalle-acciones [data-accion="agregar"]');
        await agregar.scrollIntoViewIfNeeded();
        await agregar.click();
        await expect(dialogo.locator('#detalle-aviso')).toContainText('Elige una talla EU');
        expect(await pagina.evaluate((c) => localStorage.getItem(c), CLAVE_CARRITO)).toBeNull();
      }, { respuesta: (n) => (n === 1 ? CON_TRES : despues) });
    });
  }

  test('si sigue DISPONIBLE, nada cambia y se puede comprar igual', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, SAMBA);
      await tallaEnFicha(dialogo, '41').click();
      const antes = await estadoGaleria(dialogo);

      await pagina.evaluate(() => refrescarCatalogo());

      await expect(tallaEnFicha(dialogo, '41')).not.toHaveClass(/talla-por-revisar/);
      await expect(tallaEnFicha(dialogo, '41')).toHaveAttribute('aria-pressed', 'true');
      await expect(dialogo.locator('#detalle-talla'), 'conserva la talla elegida').toHaveText('41');
      await expect(dialogo.locator('.detalle-por-revisar')).toHaveCount(0);
      expect(await estadoGaleria(dialogo)).toEqual(antes);

      const agregar = dialogo.locator('.detalle-acciones [data-accion="agregar"]');
      await agregar.scrollIntoViewIfNeeded();
      await agregar.click();
      await expect(pagina.locator('#confirmacion-carrito')).toHaveJSProperty('open', true);
    }, { respuesta: CON_TRES });
  });

  test('la talla desaparece del catálogo: se suelta y la ficha sigue abierta', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, SAMBA);
      await tallaEnFicha(dialogo, '41').click();
      await pagina.evaluate(() => refrescarCatalogo());
      await expect(tallaEnFicha(dialogo, '41'), 'ya no se ofrece').toHaveCount(0);
      await expect(dialogo.locator('#detalle-talla')).toHaveText('Sin elegir');
      await expect(dialogo).toHaveJSProperty('open', true);
    }, { respuesta: (n) => (n === 1 ? CON_TRES : sinTalla(CON_TRES, SAMBA, '41')) });
  });

  test('con la foto cambiada y desplazada, un refresco no mueve la galería', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, ESCRITORIO, async (pagina) => {
      const ficha = await abrirDetalle(pagina, SAMBA);
      await tallaEnFicha(ficha, '41').click();
      const antes = await estadoGaleria(ficha);
      await pagina.evaluate(() => refrescarCatalogo());
      await pagina.evaluate(() => refrescarCatalogo());      // dos veces seguidas
      const despues = await estadoGaleria(ficha);
      expect(despues).toEqual(antes);
      await expect(ficha).toHaveJSProperty('open', true);
    }, { respuesta: CON_TRES });
  });

  test('refrescos repetidos no duplican la rejilla ni la nota', async ({ browser, browserName }) => {
    const despues = conEstados(CON_TRES, SAMBA, { 41: 'POR_REVISAR' });
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina, { problemas }) => {
      const dialogo = await abrirDetalle(pagina, SAMBA);
      await tallaEnFicha(dialogo, '41').click();
      for (let i = 0; i < 3; i++) await pagina.evaluate(() => refrescarCatalogo());
      const conteo = await dialogo.evaluate((d) => ({
        tallas: d.querySelectorAll('.talla').length,
        unicas: new Set([...d.querySelectorAll('.talla')].map((b) => b.dataset.talla)).size,
        notas: d.querySelectorAll('.detalle-por-revisar').length,
        rejillas: d.querySelectorAll('.tallas').length
      }));
      expect(conteo.tallas, 'ninguna talla duplicada').toBe(conteo.unicas);
      expect(conteo.notas, 'una sola nota').toBe(1);
      expect(conteo.rejillas).toBe(1);
      await expect(dialogo).toHaveJSProperty('open', true);
      expect(problemas).toEqual([]);
    }, { respuesta: (n) => (n === 1 ? CON_TRES : despues) });
  });

  test('el carrito también se pone al día con la ficha abierta', async ({ browser, browserName }) => {
    const carrito = { version: 3, pendientes: [], lineas: [
      { producto: CON_TRES.find((p) => p.nombre === SAMBA).id, variante: 'unica', talla: '40', cantidad: 1, precio: 120000 }
    ] };
    const despues = conEstados(CON_TRES, SAMBA, { 40: 'POR_REVISAR' });
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, SAMBA);
      await pagina.evaluate(() => refrescarCatalogo());
      await expect(dialogo).toHaveJSProperty('open', true);
      const lineas = await pagina.evaluate(() => estado.carrito.length);
      expect(lineas, 'la línea se conserva').toBe(1);
    }, { respuesta: (n) => (n === 1 ? CON_TRES : despues), carrito });
  });
});

test.describe('Qué pasa sin configuración de Supabase', () => {
  const PRODUCCION = { fuenteLocal: false };
  const carrito = { version: 3, pendientes: [], lineas: [
    { producto: 'ADD-SAM~zapatilla-01', variante: 'unica', talla: '40', cantidad: 2, precio: 120000 }
  ] };

  const leer = (pagina) => pagina.evaluate(() => ({
    respaldo: estado.respaldo,
    productos: estado.productos.length,
    disponibles: estado.productos.reduce((a, p) => a + p.tallasDisponibles.length, 0),
    porRevisar: estado.productos.reduce((a, p) => a + p.tallasPorRevisar.length, 0),
    ofrecidos: estado.productos.filter((p) => p.ofrecida).length
  }));

  // Etapa 16: en producción los 28 productos del JSON (ejemplos) ya no se muestran como respaldo.
  const sinCatalogo = async (pagina, titulo) => {
    const r = await leer(pagina);
    expect(r.productos, 'ningún ejemplo del JSON se presenta como catálogo').toBe(0);
    expect(r.disponibles).toBe(0);
    await expect(pagina.locator('.estado-catalogo h3')).toHaveText(titulo);
    await expect(pagina.locator('.tarjeta')).toHaveCount(0);
    const pedidos = await pagina.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name));
    expect(pedidos.filter((n) => n.includes('productos.json')), 'ni siquiera se pide el JSON de ejemplos').toEqual([]);
  };

  test('PRODUCCIÓN sin configuración: no se muestran los ejemplos del JSON, sino un aviso', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await sinCatalogo(pagina, 'El catálogo no está disponible en este momento');
      await expect(pagina.locator('.estado-catalogo')).toContainText('WhatsApp');
    }, { config: PRODUCCION, tarjetas: false });
  });

  for (const [nombre, valor] of [
    ['vacía', ''],
    ['sin protocolo', 'supabase.co/rest/v1/catalogo_publico'],
    ['con protocolo no admitido', 'javascript:alert(1)'],
    ['texto sin sentido', '???']
  ]) {
    test(`PRODUCCIÓN con configuración inválida (${nombre}): aviso, sin ejemplos`, async ({ browser, browserName }) => {
      await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
        await sinCatalogo(pagina, 'El catálogo no está disponible en este momento');
      }, { config: { ...PRODUCCION, catalogoUrl: valor, catalogoClave: CLAVE_PUBLICABLE_FICTICIA }, tarjetas: false });
    });
  }

  test('PRODUCCIÓN sin configuración: el carrito se conserva intacto', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      expect(await pagina.evaluate((c) => JSON.parse(localStorage.getItem(c)), CLAVE_CARRITO)).toEqual(carrito);
      await expect(pagina.locator('#carrito-notificacion')).not.toContainText('Retiramos');
    }, { config: PRODUCCION, carrito, tarjetas: false });
  });

  test('PRODUCCIÓN con caché real y Supabase sin respuesta: se puede consultar, no pedir; el carrito se conserva', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      expect(await pagina.evaluate((c) => JSON.parse(localStorage.getItem(c)).lineas.length, CLAVE_CARRITO)).toBe(1);
      await abrirCarritoDesdeCabecera(pagina);
      await expect(pagina.locator('#carrito .linea'), 'la línea sigue ahí').toHaveCount(1);
      await expect(pagina.locator('#carrito-enviar'), 'sin acción de pedido normal').toBeHidden();
      await expect(pagina.locator('#carrito-copiar')).toBeHidden();
      await expect(pagina.locator('#carrito-nota')).toContainText('por revisar');
      await expect(pagina.locator('#carrito-notificacion')).not.toContainText('Retiramos');
    }, { config: { ...PRODUCCION, catalogoUrl: URL_SUPABASE, catalogoClave: CLAVE_PUBLICABLE_FICTICIA }, respuesta: { fallo: 'red' }, cache: cacheReal(CATALOGO_MIGRADO), carrito });
  });

  test('DESARROLLO (localhost) sin configuración: el JSON vale, como hasta ahora', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const r = await leer(pagina);
      expect(r.respaldo, 'en local no es modo consulta').toBeNull();
      expect(r.disponibles, 'las 138 del JSON siguen siendo comprables en desarrollo').toBe(138);
      await expect(pagina.locator('#aviso-respaldo')).toHaveCount(0);
    }, { config: null });
  });

  test('MODO DE PRUEBAS explícito: catálogo ficticio válido aunque se marque producción', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const r = await leer(pagina);
      expect(r.productos, 'catálogo de prueba').toBe(6);
      expect(r.respaldo, 'el modo de pruebas nunca entra en consulta').toBeNull();
      expect(r.disponibles).toBeGreaterThan(0);
    }, { config: PRODUCCION, url: 'http://127.0.0.1:8767/?datos-prueba&intro=no' });
  });

  test('PRODUCCIÓN con Supabase configurado pero inaccesible: modo consulta por caché', async ({ browser, browserName }) => {
    const cache = cacheReal(CON_TRES, Date.now() - 72e5);
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      const r = await leer(pagina);
      expect(r.respaldo?.motivo).toBe('cache');
      expect(r.disponibles, 'ni siquiera lo que la caché daba por disponible').toBe(0);
      await expect(pagina.locator('#aviso-respaldo')).toContainText('Última información');
    }, { config: { ...PRODUCCION, catalogoUrl: URL_SUPABASE, catalogoClave: CLAVE_PUBLICABLE_FICTICIA }, respuesta: { fallo: 'red' }, cache });
  });

  test('PRODUCCIÓN con Supabase inaccesible y sin caché: aviso de conexión, nunca el JSON', async ({ browser, browserName }) => {
    await tiendaConSupabase({ browser, browserName }, CELULAR, async (pagina) => {
      await sinCatalogo(pagina, 'No pudimos cargar las zapatillas');
      await expect(pagina.locator('.estado-catalogo').getByRole('button', { name: 'Reintentar' })).toBeVisible();
    }, { config: { ...PRODUCCION, catalogoUrl: URL_SUPABASE, catalogoClave: CLAVE_PUBLICABLE_FICTICIA }, respuesta: { fallo: 500 }, tarjetas: false });
  });

  for (const vista of VISTAS) {
    test(`${vista.nombre}px: el aviso de modo consulta se lee y no tapa el catálogo`, async ({ browser, browserName }) => {
      await tiendaConSupabase({ browser, browserName }, vista, async (pagina) => {
        const aviso = pagina.locator('#aviso-respaldo');
        await expect(aviso).toBeVisible();
        const m = await aviso.evaluate((n) => {
          const r = n.getBoundingClientRect();
          const tarjeta = document.querySelector('.tarjeta')?.getBoundingClientRect();
          return { fuente: parseFloat(getComputedStyle(n).fontSize), ancho: r.width, vw: document.documentElement.clientWidth,
                   fijo: getComputedStyle(n).position === 'fixed', solapa: tarjeta ? r.bottom > tarjeta.top : false };
        });
        expect(m.fuente).toBeGreaterThanOrEqual(13);
        expect(m.ancho).toBeLessThanOrEqual(m.vw + 1);
        expect(m.fijo, 'va en el flujo, no flotando sobre el contenido').toBe(false);
        expect(m.solapa, 'no tapa las tarjetas').toBe(false);
      }, { config: { ...PRODUCCION, catalogoUrl: URL_SUPABASE, catalogoClave: CLAVE_PUBLICABLE_FICTICIA }, respuesta: { fallo: 'red' }, cache: cacheReal(CATALOGO_MIGRADO) });
    });
  }
});
