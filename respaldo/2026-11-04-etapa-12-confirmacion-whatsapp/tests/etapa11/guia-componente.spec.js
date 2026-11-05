// Etapa 11 · Guía de equivalencias en el detalle: marca correcta, datos correctos y compra intacta.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { VISTAS, CELULAR, ESCRITORIO, BASE, URL_REAL, URL_PRUEBA, enTienda, nuevaPagina, abrirDetalle, irATienda, mostrarTodo, sinDesborde, detalleQuieto } from '../etapa9/ayudas.js';

const datos = JSON.parse(fs.readFileSync('data/guias-tallas.json', 'utf8'));
const guia = (marca) => datos.marcas.find((m) => m.nombre === marca);
const norm = (t) => t.replace(/\s+/g, ' ').trim();

// Un producto real de cada marca del catálogo, con tallas EU suyas.
const MARCAS = [
  { marca: 'Adidas', modelo: 'SAMBA', tallaConCol: { hombre: '40', mujer: '40' }, tallaSinFila: '41' },
  { marca: 'Nike', modelo: 'Dunk Low Retro', tallaConCol: { hombre: '42', mujer: '42' }, tallaSinFilaHombre: '38' },
  { marca: 'Jordan', modelo: 'Air Jordan 1 Retro High OG', tallaConCol: { hombre: '43', mujer: '43' }, tallaSinFilaHombre: '38' },
  { marca: 'Le Coq Sportif', modelo: 'LCS Retro Classic', tallaConCol: { hombre: '40', mujer: '40' }, tallaSinFilaHombre: '37' },
  { marca: 'New Balance', modelo: '550', sinCol: true, tallaConFila: { hombre: '40', mujer: '40' } },
];

const columnasEsperadas = (s) => {
  const conCol = s.filas.some((f) => f.col);
  const conCm = s.medidaCm?.enFicha && s.filas.some((f) => f.cm);
  return [...(conCol ? ['Talla COL', 'Talla EU'] : ['Talla EU', 'Talla US']), ...(conCm ? [s.medidaCm.rotulo] : [])];
};
const celdasEsperadas = (s) => {
  const conCol = s.filas.some((f) => f.col);
  const conCm = s.medidaCm?.enFicha && s.filas.some((f) => f.cm);
  return s.filas.map((f) => [...(conCol ? [f.col ?? '—', f.eu] : [f.eu, f.us ?? '—']), ...(conCm ? [f.cm ?? '—'] : [])]);
};
const leerTabla = (bloque) => bloque.locator('.equivalencias-tabla').evaluate((t) => ({
  columnas: [...t.tHead.rows[0].cells].map((c) => c.textContent.trim()),
  filas: [...t.tBodies[0].rows].map((f) => [...f.cells].map((c) => c.textContent.trim())),
  resaltadas: [...t.tBodies[0].rows].filter((f) => f.getAttribute('aria-current') === 'true').map((f) => f.dataset.eu),
}));
async function verTablaCompleta(bloque) {
  const boton = bloque.locator('[data-tabla-completa]');
  if ((await boton.count()) && (await boton.getAttribute('aria-expanded')) === 'false') await boton.click();
}
const elegirSegmento = (bloque, id) => bloque.locator(`.equivalencias-segmentos [data-segmento-guia="${id}"]`).click();

for (const vista of VISTAS) {
  for (const caso of MARCAS) {
    test.describe(`${caso.marca} · ${vista.nombre}px`, () => {
      test('carga la guía de su marca, con los datos de cada segmento separados', async ({ browser, browserName }) => {
        await enTienda({ browser, browserName }, vista, async (pagina) => {
          const dialogo = await abrirDetalle(pagina, caso.modelo);
          const bloque = dialogo.locator('.equivalencias');
          await expect(bloque.locator('h3')).toHaveText('Guía de equivalencias');
          for (const s of guia(caso.marca).segmentos) {
            await elegirSegmento(bloque, s.id);
            await expect(bloque.locator(`[data-segmento-guia="${s.id}"]`).first()).toHaveAttribute('aria-pressed', 'true');
            await expect(bloque.locator('.equivalencias-marca-nombre')).toHaveText(`${caso.marca} · ${s.rotulo}`);
            await verTablaCompleta(bloque);
            const tabla = await leerTabla(bloque);
            expect(tabla.columnas, 'columnas').toEqual(columnasEsperadas(s));
            expect(tabla.filas, 'todas las filas son las de sus datos').toEqual(celdasEsperadas(s));
            // Identificación de la fuente: enlace a la que realmente respalda esta tabla.
            const enlaces = await bloque.locator('a.orientacion-fuente').evaluateAll((a) => a.map((x) => ({ href: x.href, target: x.target, rel: x.rel, texto: x.textContent })));
            expect(enlaces[0].href, 'fuente principal').toBe(datos.fuentes[s.fuentePrincipal].url);
            expect(enlaces[0].texto).toContain(datos.fuentes[s.fuentePrincipal].entidad);
            expect(enlaces[0].target).toBe('_blank');
            expect(enlaces[0].rel).toContain('noopener');
            if (s.fuenteCruce) expect(enlaces[1].href, 'fuente del cruce').toBe(datos.fuentes[s.fuenteCruce].url);
          }
          await sinDesborde(pagina);
          const desborde = await dialogo.locator('.modal-caja').evaluate((c) => c.scrollWidth - c.clientWidth);
          expect(desborde, 'sin desborde en la ficha').toBeLessThanOrEqual(0);
        }, { reducido: true });
      });

      test('resalta la fila de la talla elegida y no cambia la talla real', async ({ browser, browserName }) => {
        await enTienda({ browser, browserName }, vista, async (pagina) => {
          const dialogo = await abrirDetalle(pagina, caso.modelo);
          const bloque = dialogo.locator('.equivalencias');
          for (const s of guia(caso.marca).segmentos) {
            await elegirSegmento(bloque, s.id);
            const eu = caso.sinCol ? caso.tallaConFila[s.id] : caso.tallaConCol[s.id];
            await dialogo.locator(`.talla[data-talla="${eu}"]`).click();
            const fila = s.filas.find((f) => f.eu === eu);
            expect(fila, `EU ${eu} existe en sus datos`).toBeTruthy();
            await expect(bloque.locator(`tr[data-eu="${eu}"]`)).toHaveAttribute('aria-current', 'true');
            const tabla = await leerTabla(bloque);
            expect(tabla.resaltadas, 'una sola fila resaltada').toEqual([eu]);
            const estado = norm(await bloque.locator('.equivalencias-estado').textContent());
            if (fila.col) expect(estado).toBe(`EU ${eu} equivale a talla Colombia ${fila.col} en la tabla de ${s.rotulo.toLowerCase()}.`);
            else expect(estado, 'sin talla COL no se inventa').toContain('no tiene talla Colombia publicada');
            const fondo = await bloque.locator(`tr[data-eu="${eu}"] > *`).first().evaluate((c) => getComputedStyle(c).backgroundColor);
            expect(fondo, 'fila en tinta').toBe('rgb(20, 20, 20)');
            // La talla de la compra sigue siendo la EU elegida.
            await expect(dialogo.locator('#detalle-talla')).toHaveText(eu);
            await expect(dialogo.locator(`.talla[data-talla="${eu}"]`)).toHaveAttribute('aria-pressed', 'true');
          }
        }, { reducido: true });
      });

      if (caso.sinCol) {
        test('no muestra columna COL y explica que la marca no la publica', async ({ browser, browserName }) => {
          await enTienda({ browser, browserName }, vista, async (pagina) => {
            const dialogo = await abrirDetalle(pagina, caso.modelo);
            const bloque = dialogo.locator('.equivalencias');
            const tabla = await leerTabla(bloque);
            expect(tabla.columnas).not.toContain('Talla COL');
            await expect(bloque.locator('.equivalencias-marca')).toContainText('La marca no publica talla colombiana');
            await expect(bloque.locator('.equivalencias-estado')).toContainText('no publica una conversión a talla colombiana');
            expect(norm(await bloque.textContent())).not.toMatch(/\bCOL\b/);
          }, { reducido: true });
        });
      }

      test('legible y utilizable en esta resolución', async ({ browser, browserName }) => {
        await enTienda({ browser, browserName }, vista, async (pagina) => {
          const dialogo = await abrirDetalle(pagina, caso.modelo);
          const m = await dialogo.locator('.equivalencias').evaluate((b) => {
            const r = (e) => e.getBoundingClientRect();
            const tabla = b.querySelector('.equivalencias-tabla');
            const info = r(b.closest('.detalle-info'));
            return {
              fuente: parseFloat(getComputedStyle(tabla.tBodies[0].rows[0].cells[0]).fontSize),
              dentro: r(tabla).right <= info.right + 1 && r(tabla).left >= info.left - 1,
              filasVisibles: tabla.tBodies[0].rows.length,
              altoTabla: r(tabla).height,
              segmentos: [...b.querySelectorAll('.equivalencias-segmento')].map((x) => r(x).height),
              pie: [...b.querySelectorAll('.equivalencias-pie > *')].map((x) => r(x).height),
            };
          });
          expect(m.fuente, 'texto legible').toBeGreaterThanOrEqual(12);
          expect(m.dentro, 'la tabla cabe en su columna').toBe(true);
          expect(m.filasVisibles, 'tabla compacta').toBeLessThanOrEqual(vista.ancho >= 960 ? 3 : 6);
          expect(m.altoTabla, 'no ocupa toda la pantalla').toBeLessThan(vista.alto * 0.4);
          if (vista.tactil) {
            for (const alto of m.segmentos) expect(alto, 'selector táctil').toBeGreaterThanOrEqual(44);
            for (const alto of m.pie) expect(alto, 'enlaces y acciones táctiles').toBeGreaterThanOrEqual(44);
          }
        }, { reducido: true });
      });
    });
  }
}

test('tableta en horizontal: el bloque compacto de escritorio conserva objetivos táctiles de 44 px', async ({ browser, browserName }) => {
  test.skip(browserName === 'firefox', 'Firefox no admite isMobile en Playwright: no emula un puntero táctil.');
  const tableta = { nombre: '1024-tactil', ancho: 1024, alto: 768, tactil: true };
  await enTienda({ browser, browserName }, tableta, async (pagina) => {
    const dialogo = await abrirDetalle(pagina, 'SAMBA');
    const alturas = await dialogo.locator('.equivalencias').evaluate((b) => [...b.querySelectorAll('.equivalencias-segmento, .equivalencias-pie > *')].map((x) => x.getBoundingClientRect().height));
    expect(alturas.length).toBeGreaterThan(0);
    for (const alto of alturas) expect(alto).toBeGreaterThanOrEqual(44);
  }, { reducido: true });
});

test('escritorio 1440×900: el botón de compra sigue a la vista sin desplazar, en todo el catálogo', async ({ browser, browserName }) => {
  test.setTimeout(120000);
  await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
    await mostrarTodo(pagina);
    const medidas = await pagina.evaluate(async () => {
      const dos = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const salida = [];
      for (const t of document.querySelectorAll('.tarjeta')) {
        t.querySelector('.tarjeta-enlace').click();
        await dos();
        const m = document.querySelector('#modal-producto');
        const boton = m.querySelector('.detalle-acciones [data-accion="agregar"]').getBoundingClientRect();
        salida.push({ nombre: m.querySelector('#detalle-nombre').textContent, sobra: Math.round(m.querySelector('.modal-caja').getBoundingClientRect().bottom - boton.bottom) });
        m.querySelector('[data-cerrar]').click();
        await dos();
      }
      return salida;
    });
    expect(medidas).toHaveLength(28);
    for (const { nombre, sobra } of medidas) expect(sobra, `${nombre}: píxeles entre el botón y el borde inferior`).toBeGreaterThanOrEqual(0);
  }, { reducido: true });
});

test.describe('Sin equivalencia exacta', () => {
  test('Adidas EU 41: no se resalta ninguna fila, se nombran las vecinas y no se convierte', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, 'SAMBA');
      const bloque = dialogo.locator('.equivalencias');
      await dialogo.locator('.talla[data-talla="41"]').click();
      const tabla = await leerTabla(bloque);
      expect(tabla.resaltadas).toEqual([]);
      await expect(bloque.locator('.equivalencias-estado')).toHaveText('EU 41 no figura en la tabla de hombre de Adidas. Publica 40 2/3 y 41 1/3. Confírmala con nosotros antes de comprar.');
      await expect(dialogo.locator('#detalle-talla'), 'la talla real no cambia').toHaveText('41');
    }, { reducido: true });
  });

  for (const [marca, modelo] of [['Nike', 'Dunk Low Retro'], ['Jordan', 'Air Jordan 1 Retro High OG']]) {
    test(`${marca} EU 38 en hombre: no hay fila; se ofrece la tabla de mujer, que sí la publica`, async ({ browser, browserName }) => {
      await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
        const dialogo = await abrirDetalle(pagina, modelo);
        const bloque = dialogo.locator('.equivalencias');
        await elegirSegmento(bloque, 'hombre');
        await dialogo.locator('.talla[data-talla="38"]').click();
        expect((await leerTabla(bloque)).resaltadas).toEqual([]);
        await expect(bloque.locator('.equivalencias-estado')).toContainText('EU 38 no figura en la tabla de hombre');
        await bloque.locator('.equivalencias-accion', { hasText: 'Ver tabla de mujer' }).click();
        const fila = guia(marca).segmentos.find((s) => s.id === 'mujer').filas.find((f) => f.eu === '38');
        await expect(bloque.locator('tr[data-eu="38"]')).toHaveAttribute('aria-current', 'true');
        await expect(bloque.locator('.equivalencias-estado')).toHaveText(`EU 38 equivale a talla Colombia ${fila.col} en la tabla de mujer.`);
        await expect(bloque.locator('[data-segmento-guia="mujer"]').first(), 'el foco no se pierde').toBeFocused();
      }, { reducido: true });
    });
  }

  test('Adidas mujer EU 46: la marca no publica COL y no se inventa', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, 'SAMBA');
      const bloque = dialogo.locator('.equivalencias');
      await elegirSegmento(bloque, 'mujer');
      await verTablaCompleta(bloque);
      const filas = (await leerTabla(bloque)).filas;
      expect(filas.find((f) => f[1] === '46')[0], 'celda vacía publicada').toBe('—');
      expect(filas.find((f) => f[1] === '46 2/3')[0]).toBe('—');
    }, { reducido: true });
  });

  test('Le Coq Sportif: los CMS sin definir no se presentan como largo del pie en la ficha', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, 'LCS Retro Classic');
      const tabla = await leerTabla(dialogo.locator('.equivalencias'));
      expect(tabla.columnas).toEqual(['Talla COL', 'Talla EU']);
    }, { reducido: true });
  });
});

test.describe('Productos sin guía', () => {
  test('marca provisional: sin tabla, sin datos inventados y sin la guía de Nike', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
      await pagina.evaluate(() => {
        const provisional = estado.productos.find((p) => /^CAMBIAR/.test(p.marca));
        abrirDetalles(provisional.clave, document.querySelector('.tarjeta-enlace'));
      });
      const dialogo = await detalleQuieto(pagina);
      const bloque = dialogo.locator('.equivalencias');
      await expect(bloque.locator('.equivalencias-tabla')).toHaveCount(0);
      await expect(bloque).toContainText('No hay una guía de tallas registrada para esta marca.');
      await dialogo.locator('.talla[data-talla="40"]').click();
      await expect(dialogo.locator('#detalle-talla')).toHaveText('40');
      await expect(bloque.locator('.equivalencias-tabla')).toHaveCount(0);
    }, { reducido: true });
  });

  test('catálogo de prueba: no recibe la guía de ninguna marca real y sus variantes siguen funcionando', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, 'tres colores');
      const bloque = dialogo.locator('.equivalencias');
      await expect(bloque).toContainText('No hay una guía de tallas registrada para esta marca.');
      await dialogo.locator('[data-variante="PRUEBA-TRES-NB"]').click();
      await expect(dialogo.locator('#detalle-color')).toHaveText('Negro / blanco');
      await expect(bloque.locator('.equivalencias-tabla')).toHaveCount(0);
    }, { url: URL_PRUEBA, reducido: true });
  });

  test('ningún producto del catálogo muestra el mensaje de equivalencias pendientes', async ({ browser, browserName }) => {
    test.setTimeout(120000);
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      await mostrarTodo(pagina);
      const textos = await pagina.evaluate(async () => {
        const dos = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const salida = [];
        for (const t of document.querySelectorAll('.tarjeta')) {
          t.querySelector('.tarjeta-enlace').click();
          await dos();
          const m = document.querySelector('#modal-producto');
          salida.push({ nombre: m.querySelector('#detalle-nombre').textContent, marca: m.querySelector('.detalle-marca-nombre').textContent, ident: m.querySelector('.equivalencias-marca-nombre')?.textContent ?? null, texto: m.querySelector('.detalle-info').textContent });
          m.querySelector('[data-cerrar]').click();
          await dos();
        }
        return salida;
      });
      expect(textos).toHaveLength(28);
      for (const t of textos) {
        expect(t.texto, t.nombre).not.toMatch(/pendientes de confirmar|por investigar|sin verificar/i);
        // Cada ficha lleva la guía de su propia marca, nunca la de otra.
        if (t.ident) expect(t.ident.startsWith(t.marca), `${t.nombre}: ${t.ident} con marca ${t.marca}`).toBe(true);
        else expect(t.marca).toMatch(/^CAMBIAR/);
      }
    }, { reducido: true });
  });
});

test.describe('Segmento y variantes', () => {
  // Producto real con datos ampliados solo en esta prueba: el archivo no se modifica.
  async function conCatalogoAmpliado(pagina, cambio) {
    await pagina.route('**/data/productos.json', async (ruta) => {
      const respuesta = await ruta.fetch();
      const json = await respuesta.json();
      cambio(json);
      await ruta.fulfill({ response: respuesta, json });
    });
  }

  test('con segmento en el catálogo, la tabla queda fija y desaparece el selector', async ({ browser, browserName }) => {
    const { contexto, pagina, problemas } = await nuevaPagina(browser, browserName, ESCRITORIO, { reducido: true });
    await conCatalogoAmpliado(pagina, (json) => { json.productos.filter((p) => p.nombre === 'SAMBA').forEach((p) => { p.segmento = 'mujer'; }); });
    await irATienda(pagina, URL_REAL);
    const dialogo = await abrirDetalle(pagina, 'SAMBA');
    const bloque = dialogo.locator('.equivalencias');
    await expect(bloque.locator('.equivalencias-segmentos')).toHaveCount(0);
    await expect(bloque.locator('.equivalencias-marca-nombre')).toHaveText('Adidas · Mujer');
    await dialogo.locator('.talla[data-talla="40"]').click();
    await expect(bloque.locator('.equivalencias-estado')).toHaveText('EU 40 equivale a talla Colombia 38 en la tabla de mujer.');
    expect(problemas).toEqual([]);
    await contexto.close();
  });

  test('las variantes de un producto real mantienen la guía de su marca', async ({ browser, browserName }) => {
    const { contexto, pagina, problemas } = await nuevaPagina(browser, browserName, ESCRITORIO, { reducido: true });
    await conCatalogoAmpliado(pagina, (json) => {
      const base = json.productos.find((p) => p.nombre === 'Dunk Low Retro');
      base.variantes = [
        { id: 'NK-A', color: 'Negro / blanco', imagenes: [base.imagen], tallasDisponibles: ['40', '42'], tallasAgotadas: [] },
        { id: 'NK-B', color: 'Gris', imagenes: [base.imagen], tallasDisponibles: ['41', '42'], tallasAgotadas: ['40'] },
      ];
    });
    await irATienda(pagina, URL_REAL);
    const dialogo = await abrirDetalle(pagina, 'Dunk Low Retro');
    const bloque = dialogo.locator('.equivalencias');
    await dialogo.locator('.talla[data-talla="42"]').click();
    await expect(bloque.locator('tr[data-eu="42"]')).toHaveAttribute('aria-current', 'true');
    await dialogo.locator('[data-variante="NK-B"]').click();
    await expect(bloque.locator('.equivalencias-marca-nombre'), 'sigue siendo Nike').toHaveText(/^Nike · /);
    await expect(bloque.locator('tr[data-eu="42"]'), 'la talla se conserva y sigue resaltada').toHaveAttribute('aria-current', 'true');
    await dialogo.locator('.talla[data-talla="41"]').click();
    await expect(bloque.locator('tr[data-eu="41"]')).toHaveAttribute('aria-current', 'true');
    expect(problemas).toEqual([]);
    await contexto.close();
  });

  test('la tabla elegida se mantiene al pasar a otro producto, sin mezclar marcas', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      let dialogo = await abrirDetalle(pagina, 'SAMBA');
      await elegirSegmento(dialogo.locator('.equivalencias'), 'mujer');
      await dialogo.getByRole('button', { name: 'Cerrar detalles' }).click();
      dialogo = await abrirDetalle(pagina, 'Dunk Low Retro');
      await expect(dialogo.locator('.equivalencias-marca-nombre')).toHaveText('Nike · Mujer');
    }, { reducido: true });
  });
});

test.describe('Compra intacta', () => {
  const CLAVE = 'gama-talla-carrito-v3';

  test('el carrito guarda la talla EU real, sea cual sea la tabla mostrada', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, 'Dunk Low Retro');
      const bloque = dialogo.locator('.equivalencias');
      await elegirSegmento(bloque, 'mujer');
      await dialogo.locator('.talla[data-talla="42"]').click();
      const agregar = dialogo.locator('.detalle-acciones [data-accion="agregar"]');
      await agregar.scrollIntoViewIfNeeded();
      await agregar.click();
      await expect(agregar).toContainText('Añadido ✓');
      const carrito = await pagina.evaluate((c) => JSON.parse(localStorage.getItem(c)), CLAVE);
      expect(carrito.version).toBe(3);
      expect(carrito.lineas).toHaveLength(1);
      expect(carrito.lineas[0]).toMatchObject({ talla: '42', cantidad: 1 });
      await expect(pagina.locator('#insignia-carrito')).toHaveText('1');
    }, { reducido: true });
  });

  test('el mensaje de WhatsApp sigue indicando la talla EU', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, 'Dunk Low Retro');
      await dialogo.locator('.talla[data-talla="42"]').click();
      const pedir = dialogo.getByRole('button', { name: 'Pedir este par por WhatsApp' });
      await pedir.scrollIntoViewIfNeeded();
      await pedir.click();
      const [enlace] = await pagina.evaluate(() => window.__abiertas);
      expect(decodeURIComponent(enlace.split('?text=')[1])).toContain('Talla: EU 42');
    }, { reducido: true });
  });

  test('si no cargan las guías, la tienda y la compra siguen funcionando', async ({ browser, browserName }) => {
    const { contexto, pagina } = await nuevaPagina(browser, browserName, ESCRITORIO, { reducido: true });
    await pagina.route('**/data/guias-tallas.json', (ruta) => ruta.fulfill({ status: 500, body: 'error' }));
    await irATienda(pagina, URL_REAL);
    const dialogo = await abrirDetalle(pagina, 'SAMBA');
    await expect(dialogo.locator('.equivalencias')).toContainText('No pudimos cargar la guía de tallas');
    await dialogo.locator('.talla[data-talla="40"]').click();
    const agregar = dialogo.locator('.detalle-acciones [data-accion="agregar"]');
    await agregar.scrollIntoViewIfNeeded();
    await agregar.click();
    await expect(agregar).toContainText('Añadido ✓');
    await contexto.close();
  });
});

test.describe('Accesibilidad', () => {
  test('tabla semántica, selector con teclado y anuncio de la equivalencia', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, 'SAMBA');
      const bloque = dialogo.locator('.equivalencias');
      await expect(bloque).toHaveAttribute('aria-labelledby', 'equivalencias-titulo');
      await expect(bloque.locator('caption')).toHaveText('Equivalencias de tallas de Adidas, hombre');
      const semantica = await bloque.locator('.equivalencias-tabla').evaluate((t) => ({
        cabeceras: [...t.tHead.rows[0].cells].every((c) => c.tagName === 'TH' && c.scope === 'col'),
        filas: [...t.tBodies[0].rows].every((f) => f.cells[0].tagName === 'TH' && f.cells[0].scope === 'row'),
      }));
      expect(semantica).toEqual({ cabeceras: true, filas: true });
      await expect(bloque.locator('.equivalencias-estado')).toHaveAttribute('role', 'status');
      await expect(bloque.locator('.equivalencias-segmentos')).toHaveAttribute('role', 'group');
      // Con teclado: enfocar la otra tabla y activarla con Enter.
      const mujer = bloque.locator('[data-segmento-guia="mujer"]').first();
      await mujer.focus();
      await pagina.keyboard.press('Enter');
      await expect(bloque.locator('[data-segmento-guia="mujer"]').first()).toHaveAttribute('aria-pressed', 'true');
      await expect(bloque.locator('[data-segmento-guia="mujer"]').first()).toBeFocused();
      await expect(bloque.locator('caption')).toHaveText('Equivalencias de tallas de Adidas, mujer');
      const completa = bloque.locator('[data-tabla-completa]');
      await completa.focus();
      await pagina.keyboard.press('Enter');
      await expect(bloque.locator('[data-tabla-completa]')).toHaveAttribute('aria-expanded', 'true');
      await expect(bloque.locator('[data-tabla-completa]')).toBeFocused();
      await expect(bloque.locator('.equivalencias-tabla tbody tr')).toHaveCount(17);
    }, { reducido: true });
  });
});

test.describe('Guía completa', () => {
  test('la marca del producto va primero y sus tablas coinciden con los datos', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, ESCRITORIO, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, 'LCS Retro Classic');
      await dialogo.getByRole('button', { name: 'Guía de tallas' }).click();
      const guiaModal = pagina.locator('#guia-tallas');
      await expect(guiaModal).toHaveJSProperty('open', true);
      const primera = guiaModal.locator('.guia-marca').first();
      await expect(primera.locator('h3')).toHaveText('Le Coq Sportif');
      await expect(primera.locator('h4')).toHaveText(['Hombre', 'Mujer']);
      await expect(primera, 'los CMS se muestran aquí con su nombre y su advertencia').toContainText('no aclara si es largo del pie');
      const tablas = await primera.locator('table').evaluateAll((ts) => ts.map((t) => ({ col: [...t.tHead.rows[0].cells].map((c) => c.textContent), filas: t.tBodies[0].rows.length })));
      const [h, m] = guia('Le Coq Sportif').segmentos;
      expect(tablas[0].col).toEqual(['Talla COL', 'Talla EU', 'Talla US', 'CMS']);
      expect(tablas.map((t) => t.filas)).toEqual([h.filas.length, m.filas.length]);
      await pagina.keyboard.press('Escape');
      await expect(guiaModal).toHaveJSProperty('open', false);
      await expect(dialogo, 'el detalle sigue abierto').toHaveJSProperty('open', true);
    });
  });

  test('New Balance en la guía completa no tiene columna COL', async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, CELULAR, async (pagina) => {
      const dialogo = await abrirDetalle(pagina, '550');
      await dialogo.getByRole('button', { name: 'Guía de tallas' }).click();
      const primera = pagina.locator('#guia-tallas .guia-marca').first();
      await expect(primera.locator('h3')).toHaveText('New Balance');
      await expect(primera.locator('.sello')).toHaveText('Sin talla COL publicada');
      const encabezados = await primera.locator('thead th').allTextContents();
      expect(encabezados).not.toContain('Talla COL');
      await sinDesborde(pagina);
    });
  });
});

test('el archivo de guías responde en el servidor', async ({ request }) => {
  const r = await request.get(`${BASE}/data/guias-tallas.json`);
  expect(r.ok()).toBe(true);
});
