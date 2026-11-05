// Etapa 10 · Objetivo 2: todos los modelos con la misma escala tipográfica en cada resolución.
import { test, expect } from '@playwright/test';
import { VISTAS, URL_PRUEBA, enTienda, mostrarTodo } from '../etapa9/ayudas.js';
import { VENTANAS_PORTATIL, recorrerCatalogo } from './ayudas-etapa10.js';

// Tamaño esperado del token --t-modelo en cada ancho de pantalla.
const ESPERADO = { 360: 40, 390: 40, 768: 44, 1024: 48, 1280: 52, 1366: 52, 1440: 52, 1536: 52, 1920: 52 };

const medirNombre = () => {
  const m = document.querySelector('#modal-producto');
  const n = m.querySelector('#detalle-nombre');
  const marca = m.querySelector('.detalle-marca');
  const s = getComputedStyle(n);
  const sM = getComputedStyle(marca);
  const r = n.getBoundingClientRect();
  const rM = marca.getBoundingClientRect();
  const caja = m.querySelector('.modal-caja');
  const info = m.querySelector('.detalle-info').getBoundingClientRect();
  const rango = document.createRange();
  rango.selectNodeContents(n);
  const trozos = [...rango.getClientRects()];
  return {
    nombre: n.textContent.trim(),
    estilos: { tam: s.fontSize, peso: s.fontWeight, familia: s.fontFamily, interlinea: s.lineHeight, interletra: s.letterSpacing, ancho: s.fontStretch, caja: s.textTransform },
    estiloMarca: { tam: sM.fontSize, peso: sM.fontWeight, familia: sM.fontFamily, interletra: sM.letterSpacing },
    tamano: parseFloat(s.fontSize), interlinea: parseFloat(s.lineHeight), tamMarca: parseFloat(sM.fontSize),
    lineas: new Set(trozos.map((t) => Math.round(t.top))).size,
    enLinea: n.getAttribute('style'), atributo: n.hasAttribute('data-largo'),
    token: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--t-modelo')) * 16,
    desbordeX: n.scrollWidth - n.clientWidth,
    // Con interlínea 1 la fuente ocupa algo más que su línea: lo que importa es que nada la recorte.
    recorteAlto: s.overflowY !== 'visible', altoLineas: Math.abs(r.height - new Set(trozos.map((t) => Math.round(t.top))).size * parseFloat(s.lineHeight)),
    finTexto: Math.max(...trozos.map((t) => t.right)), finColumna: info.right,
    cortado: s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none' || s.overflowX === 'hidden' || s.whiteSpace === 'nowrap',
    fichaDesborda: caja.scrollWidth > caja.clientWidth,
    marcaArriba: rM.bottom <= r.top + 1,
    aVista: rM.top >= 0 && r.bottom <= innerHeight,
  };
};

for (const vista of [...VISTAS, ...VENTANAS_PORTATIL]) {
  test(`los 28 modelos comparten la misma escala · ${vista.nombre}`, async ({ browser, browserName }) => {
    test.setTimeout(120000);
    await enTienda({ browser, browserName }, vista, async (pagina) => {
      await mostrarTodo(pagina);
      const fichas = await recorrerCatalogo(pagina, medirNombre);
      expect(fichas).toHaveLength(28);

      // Mismo estilo calculado en todos: se compara el conjunto completo, no solo el tamaño.
      const estilos = new Set(fichas.map((f) => JSON.stringify(f.estilos)));
      expect([...estilos], 'un único estilo de nombre en toda la resolución').toHaveLength(1);
      expect(new Set(fichas.map((f) => JSON.stringify(f.estiloMarca))).size, 'una única línea de marca').toBe(1);
      expect(fichas[0].tamano, 'tamaño del token').toBe(ESPERADO[vista.ancho]);

      for (const f of fichas) {
        const ctx = `«${f.nombre}»`;
        expect(f.tamano, `${ctx}: usa --t-modelo`).toBe(f.token);
        expect(f.estilos.peso, ctx).toBe('800');
        expect(f.estilos.familia, ctx).toContain('Archivo');
        expect(f.estilos.caja, ctx).toBe('uppercase');
        expect(f.enLinea, `${ctx}: sin tamaño puesto por JavaScript`).toBeNull();
        expect(f.atributo, `${ctx}: sin categoría por longitud`).toBe(false);
        // Ni cortado ni desbordado; como mucho, dos líneas.
        expect(f.lineas, `${ctx}: líneas`).toBeLessThanOrEqual(2);
        expect(f.cortado, `${ctx}: sin puntos suspensivos ni recorte`).toBe(false);
        expect(f.desbordeX, `${ctx}: no se sale a lo ancho`).toBeLessThanOrEqual(0);
        expect(f.recorteAlto, `${ctx}: nada recorta el texto en alto`).toBe(false);
        expect(f.altoLineas, `${ctx}: la caja mide exactamente sus líneas`).toBeLessThanOrEqual(1);
        expect(f.finTexto, `${ctx}: dentro de la columna`).toBeLessThanOrEqual(f.finColumna);
        expect(f.fichaDesborda, `${ctx}: sin desborde en la ficha`).toBe(false);
        // La jerarquía sigue funcionando.
        expect(f.marcaArriba, `${ctx}: marca encima del modelo`).toBe(true);
        expect(f.tamano / f.tamMarca, `${ctx}: el modelo manda sobre la marca`).toBeGreaterThanOrEqual(2.5);
        expect(f.aVista, `${ctx}: marca y modelo a la vista al abrir`).toBe(true);
      }

      // Los nombres cortos no crecen y los largos no encogen: lo único que cambia son las líneas.
      const de = (nombre) => fichas.find((f) => f.nombre === nombre);
      expect(de('550').tamano).toBe(de('Air Jordan 1 Retro High OG').tamano);
      expect(de('550').lineas, '«550» en una línea').toBe(1);
      expect(de('SAMBA').lineas, '«SAMBA» en una línea').toBe(1);
      expect(de('Air Jordan 1 Retro High OG').lineas, 'el nombre más largo reparte en dos líneas').toBe(2);
    }, { reducido: true });
  });
}

for (const vista of [VISTAS[1], VISTAS[4]]) {
  test(`el catálogo de prueba usa la misma escala que el real · ${vista.nombre}`, async ({ browser, browserName }) => {
    await enTienda({ browser, browserName }, vista, async (pagina) => {
      const fichas = await recorrerCatalogo(pagina, medirNombre);
      expect(fichas.length).toBeGreaterThan(1);
      expect(new Set(fichas.map((f) => f.estilos.tam)).size).toBe(1);
      expect(fichas[0].tamano).toBe(ESPERADO[vista.ancho]);
    }, { url: URL_PRUEBA, reducido: true });
  });
}
