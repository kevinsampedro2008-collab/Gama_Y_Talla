/* Humo de la tienda REAL leyendo el catálogo del stack LOCAL. SOLO LOCAL.
 *
 * app.js, index.html y styles.css se usan sin modificar: la configuración de Supabase
 * (URL de catalogo_publico y clave publicable LOCAL) se inyecta solo en la página de prueba.
 * Chromium, Firefox y WebKit a 360, 390, 768, 1024 y 1440 px.
 *
 *   python -m http.server 8765 --bind 127.0.0.1        (en la raíz del proyecto, aparte)
 *   node supabase/pruebas/reproducir/humo_tienda.mjs
 *
 * Por combinación: catalogo_publico responde 200, la tienda muestra tantos productos como
 * devuelve la vista, no entra en modo consulta, pinta tarjetas, no desborda en horizontal y no
 * lanza excepciones. Si están cargados datos_previos.sql (ciclo_atomicidad.sh), comprueba además
 * que sus etiquetas («40 1/3», «40,5», «40 2/4»...) llegan intactas y en orden. Las capturas se
 * guardan fuera del repositorio, en la carpeta temporal del sistema. Un navegador que no se pueda
 * lanzar cuenta como OMITIDO, nunca como correcto.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, firefox, webkit } from '@playwright/test';
import { RAIZ } from './comun.mjs';

const salida = execSync('npx --yes supabase@3.0.0 status -o json', { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const entorno = JSON.parse(salida.slice(salida.indexOf('{')));
if (!['127.0.0.1', 'localhost'].includes(new URL(entorno.API_URL).hostname)) {
  console.error(`RECHAZADO: solo contra el stack local. API = ${new URL(entorno.API_URL).hostname}`);
  process.exit(2);
}
const TIENDA = process.env.TIENDA || 'http://127.0.0.1:8765/?intro=no';
const URL_CATALOGO = `${entorno.API_URL}/rest/v1/catalogo_publico?select=*&order=orden`;
const vista = await (await fetch(URL_CATALOGO, { headers: { apikey: entorno.PUBLISHABLE_KEY } })).json();
const esperados = vista.length;
const previo = vista.find((p) => p.nombre === 'PREVIO 14F2');
const ordenPrevio = previo ? previo.variantes[0].tallas.map((t) => t.talla) : null;
const CAPTURAS = fs.mkdtempSync(path.join(os.tmpdir(), 'humo-tienda-'));

let bien = 0; let mal = 0; let omitidas = 0;
console.log(`catálogo local: ${esperados} productos activos según catalogo_publico (anon)${previo ? ` · datos previos: ${JSON.stringify(ordenPrevio)}` : ''}`);

for (const [nombre, tipo] of Object.entries({ chromium, firefox, webkit })) {
  let b;
  try { b = await tipo.launch(); } catch (e) {
    for (const ancho of [360, 390, 768, 1024, 1440]) { omitidas += 1; console.log(`OMITIDA ${nombre} ${ancho}px -> no se pudo lanzar: ${e.message.split('\n')[0]}`); }
    continue;
  }
  for (const ancho of [360, 390, 768, 1024, 1440]) {
    const ctx = await b.newContext({ viewport: { width: ancho, height: 900 }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    const excepciones = []; let http = null;
    p.on('pageerror', (e) => excepciones.push(e.message));
    p.on('response', (r) => { if (r.url().includes('/rest/v1/catalogo_publico')) http = r.status(); });
    await p.addInitScript(([url, clave]) => { window.GAMA_TALLA_CONFIG = { catalogoUrl: url, catalogoClave: clave }; }, [URL_CATALOGO, entorno.PUBLISHABLE_KEY]);
    try {
      await p.goto(TIENDA, { waitUntil: 'load' });
      await p.waitForFunction("typeof estado !== 'undefined' && estado.catalogoListo === true", null, { timeout: 30000 });
      const r = await p.evaluate(() => {
        const previa = estado.productos.find((x) => x.nombre === 'PREVIO 14F2')?.variantes?.[0];
        return {
          productos: estado.productos.length,
          respaldo: estado.respaldo?.motivo || null,
          tarjetas: document.querySelectorAll('.tarjeta').length,
          desborde: document.documentElement.scrollWidth - window.innerWidth,
          previo: previa ? [...previa.tallasDisponibles, ...previa.tallasPorRevisar] : null
        };
      });
      const problemas = [];
      if (http !== 200) problemas.push(`catalogo_publico HTTP ${http}`);
      if (r.respaldo) problemas.push(`modo consulta (${r.respaldo})`);
      if (r.productos !== esperados) problemas.push(`productos ${r.productos} de ${esperados}`);
      if (r.tarjetas < 1) problemas.push('ninguna tarjeta');
      if (r.desborde > 1) problemas.push(`desborde horizontal de ${r.desborde}px`);
      if (ordenPrevio && JSON.stringify([...(r.previo || [])].sort()) !== JSON.stringify([...ordenPrevio].sort())) problemas.push(`etiquetas previas: ${JSON.stringify(r.previo)}`);
      if (excepciones.length) problemas.push(`excepciones: ${excepciones.join(' ; ')}`);
      await p.screenshot({ path: path.join(CAPTURAS, `${nombre}-${ancho}.png`) });
      const linea = `${nombre} ${b.version()} ${ancho}px: HTTP ${http} · ${r.productos} productos · ${r.tarjetas} tarjetas · desborde ${r.desborde}px${r.previo ? ` · previas ${JSON.stringify(r.previo)}` : ''}`;
      if (problemas.length) { mal += 1; console.log(`FALLA   ${linea} -> ${problemas.join('; ')}`); } else { bien += 1; console.log(`OK      ${linea}`); }
    } catch (e) {
      mal += 1; console.log(`FALLA   ${nombre} ${ancho}px -> ${e.message.split('\n')[0]} ${excepciones.join(' ; ')}`);
    }
    await ctx.close();
  }
  await b.close();
}
console.log(`\nHUMO: ${bien} correctas · ${mal} fallidas · ${omitidas} omitidas (no cuentan como correctas) de 15 · capturas en ${CAPTURAS}`);
process.exit(mal || omitidas ? 1 : 0);
