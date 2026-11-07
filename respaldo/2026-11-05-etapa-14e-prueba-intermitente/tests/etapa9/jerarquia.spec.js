// Etapa 9 · Objetivo 2: jerarquía «marca · categoría» → modelo, con datos reales, en todo el catálogo.
import { test, expect } from '@playwright/test';
import { VISTAS, BASE, enTienda, mostrarTodo } from './ayudas.js';

for (const vista of VISTAS) {
  test(`los 28 productos reales: marca · categoría sobre el modelo · ${vista.nombre}px`, async ({ browser, browserName }) => {
    test.setTimeout(120000);
    await enTienda({ browser, browserName }, vista, async (pagina) => {
      const respuesta = await pagina.request.get(`${BASE}/data/productos.json`);
      const crudo = await respuesta.json();
      const catalogo = Array.isArray(crudo) ? crudo : crudo.productos;
      await mostrarTodo(pagina);
      await expect(pagina.locator('.tarjeta')).toHaveCount(catalogo.length);

      // Se recorre todo el catálogo dentro de la página: se abre cada ficha y se mide lo que se ve.
      const fichas = await pagina.evaluate(async () => {
        const dos = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const salida = [];
        for (const tarjeta of document.querySelectorAll('.tarjeta')) {
          tarjeta.querySelector('.tarjeta-enlace').click();
          await dos();
          const m = document.querySelector('#modal-producto');
          const caja = m.querySelector('.modal-caja');
          const marca = m.querySelector('.detalle-marca');
          const nombre = m.querySelector('#detalle-nombre');
          const precio = m.querySelector('#detalle-precio');
          const sM = getComputedStyle(marca);
          const sN = getComputedStyle(nombre);
          const rM = marca.getBoundingClientRect();
          const rN = nombre.getBoundingClientRect();
          const rP = precio.getBoundingClientRect();
          const rango = document.createRange();
          rango.selectNodeContents(nombre);
          const lineas = new Set([...rango.getClientRects()].map((r) => Math.round(r.top))).size;
          salida.push({
            textoMarca: marca.textContent.trim(), textoNombre: nombre.textContent.trim(), meta: tarjeta.querySelector('.tarjeta-meta').textContent.trim(),
            ruta: m.querySelector('.detalle-ruta').textContent, marcas: m.querySelectorAll('.detalle-marca').length,
            fuenteMarca: sM.fontFamily, fuenteNombre: sN.fontFamily, tamMarca: parseFloat(sM.fontSize), tamNombre: parseFloat(sN.fontSize), pesoNombre: sN.fontWeight,
            // El precio va debajo del modelo; en tableta, a su derecha, sin pisarlo.
            transformacion: sN.textTransform, marcaArriba: rM.bottom <= rN.top + 1, precioDespues: rN.bottom <= rP.top + 1 || rP.left >= rN.right - 1, separacion: Math.round(rN.top - rM.bottom),
            lineas, desbordaNombre: nombre.scrollWidth > nombre.clientWidth + 1, desbordaMarca: rM.right > caja.getBoundingClientRect().right,
            enVentana: rM.top >= 0 && rN.bottom <= innerHeight, desbordaFicha: caja.scrollWidth > caja.clientWidth,
          });
          m.querySelector('[data-cerrar]').click();
          await dos();
        }
        return salida;
      });

      expect(fichas).toHaveLength(catalogo.length);
      for (const f of fichas) {
        const ctx = `«${f.textoNombre}»`;
        // Los valores salen de los datos reales: la pareja marca/categoría existe en el JSON para ese modelo.
        const registro = catalogo.find((p) => p.nombre === f.textoNombre && f.textoMarca === `${p.marca} · ${p.categoria}`);
        expect(registro, `${ctx}: «${f.textoMarca}» sale del catálogo real`).toBeTruthy();
        expect(f.meta.startsWith(f.textoMarca), `${ctx}: coincide con su tarjeta`).toBe(true);
        expect(f.marcas, `${ctx}: una sola línea de marca`).toBe(1);
        // Sin duplicar: la ruta ya no nombra marca ni categoría; solo el catálogo y el modelo.
        expect(f.ruta, `${ctx}: ruta`).toBe(`Catálogo${f.textoNombre}`);
        expect(f.marcaArriba, `${ctx}: la marca va encima del modelo`).toBe(true);
        expect(f.precioDespues, `${ctx}: el precio sigue al modelo, sin pisarlo`).toBe(true);
        expect(f.separacion, `${ctx}: marca y modelo van juntos`).toBeLessThanOrEqual(16);
        expect(f.fuenteMarca, `${ctx}: marca en mono`).toContain('IBM Plex Mono');
        expect(f.fuenteNombre, `${ctx}: modelo en Archivo`).toContain('Archivo');
        expect(f.tamNombre / f.tamMarca, `${ctx}: el modelo manda (${f.tamNombre}px)`).toBeGreaterThanOrEqual(2.5);
        expect(f.pesoNombre, ctx).toBe('800');
        expect(f.transformacion, ctx).toBe('uppercase');
        expect(f.lineas, `${ctx}: máximo dos líneas`).toBeLessThanOrEqual(2);
        expect(f.desbordaNombre, `${ctx}: el nombre no se sale`).toBe(false);
        expect(f.desbordaMarca, `${ctx}: la marca no se sale`).toBe(false);
        expect(f.desbordaFicha, `${ctx}: sin desborde horizontal en la ficha`).toBe(false);
        // Una marca larga provisional puede ocupar más líneas; aun así debe verse sin desplazar.
        expect(f.enVentana, `${ctx}: marca y modelo a la vista al abrir`).toBe(true);
      }
    }, { reducido: true });
  });
}
