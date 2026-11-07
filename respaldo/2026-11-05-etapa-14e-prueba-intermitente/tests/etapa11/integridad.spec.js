// Etapa 11 · Integridad de las guías: compara data/guias-tallas.json con las tablas de origen transcritas.
// No usa navegador: se ejecuta una sola vez, en el proyecto chromium.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as O from './tablas-de-origen.js';

const datos = JSON.parse(fs.readFileSync('data/guias-tallas.json', 'utf8'));
const catalogo = JSON.parse(fs.readFileSync('data/productos.json', 'utf8')).productos;
const fuentesMd = fs.readFileSync('data/guias-tallas-fuentes.md', 'utf8');
const segmento = (marca, id) => datos.marcas.find((m) => m.nombre === marca).segmentos.find((s) => s.id === id);
const OFICIAL = 'OFICIAL_DE_MARCA';
const CRUCE = 'OFICIAL_POR_CORRESPONDENCIA';
const SIN = 'SIN_EQUIVALENCIA_CONFIRMADA';
// Marca provisional del catálogo: no es una marca real y no debe recibir guía.
const SIN_CLASIFICAR = ['CAMBIARRRRRRRRRRRRRRRR IMAGEN 18'];
const valor = (t) => { const [e, f] = String(t).split(' '); const [a, b] = String(f || '').split('/').map(Number); return Number(e) + (b ? a / b : 0); };

test.beforeEach(({}, info) => test.skip(info.project.name !== 'chromium', 'Comprueba datos, no un navegador: basta una ejecución.'));

test.describe('Clasificación de marcas', () => {
  test('todas las marcas del catálogo real tienen guía o están clasificadas como provisionales', () => {
    const delCatalogo = [...new Set(catalogo.map((p) => p.marca))];
    const conGuia = datos.marcas.map((m) => m.nombre);
    expect(delCatalogo.filter((m) => !conGuia.includes(m)), 'marcas sin clasificar').toEqual(SIN_CLASIFICAR);
    expect(conGuia.filter((m) => !delCatalogo.includes(m)), 'guías de marcas ajenas al catálogo').toEqual([]);
  });

  test('cada marca tiene su tabla, con hombre y mujer separados', () => {
    for (const marca of datos.marcas) {
      expect(marca.segmentos.map((s) => s.id).sort(), marca.nombre).toEqual(['hombre', 'mujer']);
      const [a, b] = marca.segmentos;
      expect(JSON.stringify(a.filas.map((f) => [f.col, f.eu])), `${marca.nombre}: tablas distintas`).not.toBe(JSON.stringify(b.filas.map((f) => [f.col, f.eu])));
    }
    const ids = datos.marcas.flatMap((m) => m.segmentos.map((s) => s.fuentePrincipal));
    expect(new Set(ids).size, 'ninguna marca reutiliza la fuente principal de otra').toBeGreaterThanOrEqual(9);
  });

  test('New Balance no tiene talla COL y se declara sin equivalencia confirmada', () => {
    const marca = datos.marcas.find((m) => m.nombre === 'New Balance');
    for (const s of marca.segmentos) {
      expect(s.nivel).toBe(SIN);
      expect(s.filas.every((f) => f.col === null)).toBe(true);
    }
  });
});

test.describe('Calidad de cada tabla', () => {
  for (const marca of datos.marcas) {
    for (const s of marca.segmentos) {
      test(`${marca.nombre} · ${s.id}: sin duplicados, ordenada, con fuente y nivel coherente`, () => {
        for (const campo of ['nivel', 'sistema', 'metodo', 'fuentePrincipal', 'observaciones', 'rotulo']) expect(s[campo], campo).toBeTruthy();
        expect(s.filas.length).toBeGreaterThan(0);
        const eu = s.filas.map((f) => f.eu);
        expect(new Set(eu).size, `EU repetida: ${eu}`).toBe(eu.length);
        const col = s.filas.map((f) => f.col).filter(Boolean);
        expect(new Set(col).size, `COL repetida: ${col}`).toBe(col.length);
        for (let i = 1; i < s.filas.length; i++) {
          expect(valor(s.filas[i].eu), `EU en orden: ${s.filas[i].eu}`).toBeGreaterThan(valor(s.filas[i - 1].eu));
          if (s.filas[i].col && s.filas[i - 1].col) expect(Number(s.filas[i].col), `COL en orden: ${s.filas[i].col}`).toBeGreaterThan(Number(s.filas[i - 1].col));
          if (s.filas[i].cm && s.filas[i - 1].cm) expect(Number(s.filas[i].cm), `cm en orden: ${s.filas[i].cm}`).toBeGreaterThanOrEqual(Number(s.filas[i - 1].cm));
        }
        for (const f of s.filas) {
          expect(f.eu, 'toda fila tiene EU').toBeTruthy();
          expect(Object.keys(datos.niveles), 'nivel conocido').toContain(f.nivel);
          expect(f.fuentes?.length, `fila EU ${f.eu} con fuente`).toBeGreaterThan(0);
          for (const id of f.fuentes) expect(datos.fuentes[id], `fuente «${id}» definida`).toBeTruthy();
          if (f.nivel === SIN) expect(f.col, `EU ${f.eu}: sin equivalencia no lleva COL`).toBeNull();
          else expect(f.col, `EU ${f.eu}: nivel ${f.nivel} exige COL`).toBeTruthy();
        }
        expect(datos.fuentes[s.fuentePrincipal], 'fuente principal definida').toBeTruthy();
        // Solo «Pie (cm)» presenta los centímetros como largo del pie.
        if (s.medidaCm.rotulo === 'Pie (cm)') expect(s.medidaCm.tipo).toBe('largo-del-pie');
        else expect(s.medidaCm.definicion, 'si no es el pie, se explica qué es').toBeTruthy();
      });
    }
  }

  test('ninguna fila se presenta como referencia comercial: no hay fuentes comerciales en los datos', () => {
    const comerciales = Object.entries(datos.fuentes).filter(([, f]) => f.tipo === 'contraste-comercial').map(([id]) => id);
    for (const marca of datos.marcas) for (const s of marca.segmentos) {
      for (const f of s.filas) for (const id of f.fuentes) expect(comerciales, `${marca.nombre} EU ${f.eu}`).not.toContain(id);
      expect(comerciales).not.toContain(s.fuentePrincipal);
    }
  });

  test('todas las fuentes tienen entidad, URL segura, tipo, fecha y sistemas', () => {
    for (const [id, f] of Object.entries(datos.fuentes)) {
      expect(f.url, id).toMatch(/^https:\/\//);
      for (const campo of ['titulo', 'entidad', 'tipo', 'fechaConsulta', 'acceso']) expect(f[campo], `${id}.${campo}`).toBeTruthy();
      expect(f.sistemas?.length, `${id}.sistemas`).toBeGreaterThan(0);
    }
  });
});

test.describe('Datos contra tablas de origen', () => {
  const unir = (claves, valores) => new Map(claves.map((c, i) => [c, valores[i]]));

  for (const [marca, h, m, usH, colH, cmH, usM, colM, cmM] of [
    ['Nike', 'nike-co-hombre', 'nike-co-mujer', O.NIKE_CO_HOMBRE.usHombre, O.NIKE_CO_HOMBRE.colHombre, O.NIKE_CO_HOMBRE.largoPieCm, O.NIKE_CO_MUJER.usMujer, O.NIKE_CO_MUJER.colMujer, O.NIKE_CO_MUJER.largoPieCm],
    ['Jordan', 'jordan-co-hombre', 'jordan-co-mujer', O.JORDAN_CO_HOMBRE.usHombre, O.JORDAN_CO_HOMBRE.colHombre, O.JORDAN_CO_HOMBRE.largoCm, O.JORDAN_CO_MUJER.usMujer, O.JORDAN_CO_MUJER.colMujer, O.JORDAN_CO_MUJER.largoMujerCm],
  ]) {
    test(`${marca}: COL y largo de Colombia, EU de Nike Global cruzado por talla US`, () => {
      const euH = unir(O.NIKE_GLOBAL_HOMBRE.usHombre, O.NIKE_GLOBAL_HOMBRE.eu);
      const euM = unir(O.NIKE_GLOBAL_MUJER.usMujer, O.NIKE_GLOBAL_MUJER.eu);
      expect(segmento(marca, 'hombre').filas.map((f) => [f.us, f.col, f.eu, f.cm, f.nivel])).toEqual(usH.map((u, i) => [u, colH[i], euH.get(u), cmH[i], CRUCE]));
      expect(segmento(marca, 'mujer').filas.map((f) => [f.us, f.col, f.eu, f.cm, f.nivel])).toEqual(usM.map((u, i) => [u, colM[i], euM.get(u), cmM[i], CRUCE]));
      expect(segmento(marca, 'hombre').fuentePrincipal).toBe(h);
      expect(segmento(marca, 'mujer').fuentePrincipal).toBe(m);
      for (const s of ['hombre', 'mujer']) expect(segmento(marca, s).filas.every((f) => f.eu), 'toda talla US cruza con una EU').toBe(true);
    });
  }

  test('las tablas de hombre de Nike y Jordan coinciden, porque Nike Colombia publica la misma', () => {
    expect(O.JORDAN_CO_HOMBRE.colHombre).toEqual(O.NIKE_CO_HOMBRE.colHombre);
    expect(O.JORDAN_CO_HOMBRE.usHombre).toEqual(O.NIKE_CO_HOMBRE.usHombre);
    expect(O.JORDAN_CO_MUJER.colMujer.slice(0, O.NIKE_CO_MUJER.colMujer.length)).toEqual(O.NIKE_CO_MUJER.colMujer);
  });

  test('Adidas: filas idénticas a la tabla de adidas Colombia', () => {
    expect(segmento('Adidas', 'hombre').filas.map((f) => [f.cm, f.us, f.col, f.eu])).toEqual(O.ADIDAS_CO.map(([cm, us, co, , , fr]) => [cm, us, co, fr]));
    expect(segmento('Adidas', 'mujer').filas.map((f) => [f.cm, f.us, f.col ?? '—', f.eu])).toEqual(O.ADIDAS_CO.map(([cm, , , us, co, fr]) => [cm, us, co, fr]));
    expect(segmento('Adidas', 'mujer').filas.filter((f) => f.col === null).map((f) => f.eu)).toEqual(['46', '46 2/3']);
  });

  test('Adidas: EU, US y cm coinciden con el soporte oficial, leído directamente', () => {
    const g = O.ADIDAS_GLOBAL;
    expect(O.ADIDAS_CO.map((f) => f[5])).toEqual(g.eu);
    expect(O.ADIDAS_CO.map((f) => f[0])).toEqual(g.heelToeCm);
    expect(O.ADIDAS_CO.map((f) => f[1])).toEqual(g.usHombre);
    expect(O.ADIDAS_CO.map((f) => f[3])).toEqual(g.usMujer);
  });

  test('Adidas: la columna COL coincide con dos fuentes colombianas independientes', () => {
    expect(O.ADIDAS_CO.map(([cm, us, co]) => [us, cm, co])).toEqual(O.CONTRASTE_RUNNING_BALBOA.hombre);
    expect(O.ADIDAS_CO.map(([cm, , , us, co]) => [us, cm, co === '—' ? '-' : co])).toEqual(O.CONTRASTE_RUNNING_BALBOA.mujer);
    const porUs = new Map(O.ADIDAS_CO.map(([, us, co]) => [us, co]));
    for (const [us, col] of O.CONTRASTE_FALABELLA_ADIDAS_HOMBRE) expect(porUs.get(us), `Falabella US ${us}`).toBe(col);
  });

  test('Le Coq Sportif: filas idénticas a las variantes publicadas, y CMS solo de la guía', () => {
    for (const [id, variantes, guia] of [['hombre', O.LCS_VARIANTES_HOMBRE, O.LCS_GUIA_HOMBRE], ['mujer', O.LCS_VARIANTES_MUJER, O.LCS_GUIA_MUJER]]) {
      const filas = segmento('Le Coq Sportif', id).filas;
      expect(filas.map((f) => `${f.eu} EUR / ${f.us} US / ${f.col} COL`)).toEqual(variantes);
      for (const [eu, us, col, cms] of guia) {
        const fila = filas.find((f) => f.eu === eu);
        expect(fila, `EUR ${eu} de la guía`).toBeTruthy();
        expect([fila.us, fila.col, fila.cm]).toEqual([us, col, cms]);
      }
      const enGuia = new Set(guia.map((g) => g[0]));
      for (const f of filas) if (!enGuia.has(f.eu)) expect(f.cm, `EUR ${f.eu} no tiene CMS publicado`).toBeNull();
      expect(segmento('Le Coq Sportif', id).medidaCm.enFicha, 'CMS sin definir no se muestra en la ficha').toBe(false);
    }
  });

  test('New Balance: filas idénticas a sus tablas oficiales', () => {
    expect(segmento('New Balance', 'hombre').filas.map((f) => [f.us, f.uk, f.eu, f.cm])).toEqual(O.NB_CO_HOMBRE.map(([us, , uk, eu, cm]) => [us, uk, eu, cm]));
    expect(segmento('New Balance', 'mujer').filas.map((f) => [f.us, f.uk, f.eu, f.cm])).toEqual(O.NB_CO_MUJER.map(([us, , uk, eu, cm]) => [us, uk, eu, cm]));
    expect(segmento('New Balance', 'hombre').medidaCm.rotulo, 'conserva el nombre que usa la marca').toBe('Largo (cm)');
  });

  test('las equivalencias no son una resta fija común a todas las marcas', () => {
    const diferencia = (marca, id, eu) => { const f = segmento(marca, id).filas.find((x) => x.eu === eu); return valor(f.eu) - Number(f.col); };
    expect(diferencia('Nike', 'hombre', '42')).toBe(2.5);
    expect(diferencia('Le Coq Sportif', 'hombre', '42')).toBe(2);
    expect(diferencia('Nike', 'hombre', '40')).toBe(2);
    expect(segmento('Le Coq Sportif', 'hombre').filas.find((f) => f.eu === '39').col).not.toBe(segmento('Le Coq Sportif', 'mujer').filas.find((f) => f.eu === '39').col);
  });
});

test.describe('Documentación y protección', () => {
  test('el documento de fuentes menciona todas las marcas y las URL oficiales', () => {
    for (const marca of datos.marcas) expect(fuentesMd, marca.nombre).toContain(marca.nombre);
    const principales = new Set(datos.marcas.flatMap((m) => m.segmentos.flatMap((s) => [s.fuentePrincipal, s.fuenteCruce]).filter(Boolean)));
    for (const id of principales) expect(fuentesMd, `URL de ${id}`).toContain(datos.fuentes[id].url);
    expect(fuentesMd, 'documenta la marca provisional').toContain(SIN_CLASIFICAR[0]);
  });

  test('data/productos.json conserva su SHA-1 y sigue siendo el catálogo de 28 registros', () => {
    const huella = crypto.createHash('sha1').update(fs.readFileSync('data/productos.json')).digest('hex');
    expect(huella).toBe('489f210beb98def38966095190f3cfd6015033ee');
    expect(catalogo).toHaveLength(28);
  });

  test('el código no calcula tallas ni conserva el mensaje de equivalencias pendientes', () => {
    const app = fs.readFileSync('app.js', 'utf8');
    expect(app).not.toMatch(/pendientes de confirmar/i);
    expect(JSON.stringify(datos)).not.toMatch(/pendientes de confirmar/i);
    expect(app, 'sin el mapa de equivalencias antiguo').not.toContain('orientacionTalla');
  });
});
