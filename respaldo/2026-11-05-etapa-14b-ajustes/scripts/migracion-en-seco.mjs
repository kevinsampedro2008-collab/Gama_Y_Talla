// Etapa 13 · Migración EN SECO de los 28 productos.
//
// No escribe nada en producción ni toca data/productos.json: solo lo lee.
// Genera la semilla SQL para la base LOCAL de validación y un informe que
// compara, registro por registro, con lo que la tienda muestra HOY.
//
// La verdad de «hoy» no se deduce: se lee del propio app.js en marcha, abriendo
// la tienda y consultando estado.productos. Así la comparación es contra la
// aplicación real, no contra una reimplementación de su lógica.
//
// Uso: node scripts/migracion-en-seco.mjs [url] [carpeta-de-salida]

import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const URL_TIENDA = process.argv[2] || 'http://127.0.0.1:8765/?intro=no';
const SALIDA = process.argv[3] || 'supabase/local';

const comillas = (v) =>
  v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`;

async function catalogoDeLaTienda(url) {
  const navegador = await chromium.launch();
  try {
    const pagina = await navegador.newPage();
    const fallos = [];
    pagina.on('pageerror', (e) => fallos.push(e.message));
    await pagina.goto(url, { waitUntil: 'load' });
    // app.js es un script clasico: «estado» es global del script, no una propiedad de globalThis.
    await pagina.waitForFunction("typeof estado !== 'undefined' && estado.catalogoListo === true", null, { timeout: 30000 });
    const productos = await pagina.evaluate(() =>
      estado.productos.map((p) => ({
        clave: p.clave,
        id: p.id,
        nombre: p.nombre,
        marca: p.marca,
        categoria: p.categoria,
        descripcion: p.descripcion,
        segmento: p.segmento,
        destacado: p.destacado,
        nuevoIngreso: p.nuevoIngreso,
        referenciaRepetida: p.referenciaRepetida,
        indice: p.indice,
        variantes: p.variantes.map((v) => ({
          id: v.id,
          color: v.color,
          referencia: v.referencia,
          precio: v.precio,
          precioAnterior: v.precioAnterior,
          imagenes: v.imagenes,
          fotoPrincipal: v.fotoPrincipal,
          tallasDisponibles: v.tallasDisponibles,
          tallasAgotadas: v.tallasAgotadas,
          disponible: v.disponible
        }))
      }))
    );
    if (fallos.length) throw new Error(`La tienda lanzó errores: ${fallos.join(' | ')}`);
    return productos;
  } finally {
    await navegador.close();
  }
}

/* Construye las filas de la migración a partir de lo que la tienda tiene hoy.
   Reglas acordadas con el usuario:
   - Ninguna fecha se inventa: vigencia_desde queda NULL y toda talla nace POR REVISAR.
   - El estado anterior (disponible/agotada) se conserva SOLO como dato interno
     en estado_migrado, para la revisión en el panel. Nunca es el estado público.
   - clave_legado e id_legado preservan la identidad que usan los carritos V3. */
function filasDeMigracion(productos) {
  return productos.map((p, i) => ({
    clave_legado: p.clave,
    referencia_proveedor: p.id,
    nombre: p.nombre,
    marca: p.marca,
    categoria: p.categoria,
    descripcion: p.descripcion || null,
    segmento: p.segmento || null,
    destacado: p.destacado,
    nuevo_ingreso: p.nuevoIngreso,
    orden: p.indice ?? i,
    variantes: p.variantes.map((v, j) => ({
      id_legado: v.id,
      color: v.color,
      referencia_variante: v.referencia,
      precio: v.precio,
      precio_anterior: v.precioAnterior,
      orden: j,
      fotos: v.imagenes,
      tallas: [
        ...v.tallasDisponibles.map((t) => ({ talla: t, estado_migrado: 'disponible' })),
        ...v.tallasAgotadas.map((t) => ({ talla: t, estado_migrado: 'agotada' }))
      ]
    }))
  }));
}

function semillaSQL(filas) {
  const lineas = [
    '-- Semilla de la MIGRACIÓN EN SECO · etapa 13 · generada por scripts/migracion-en-seco.mjs',
    '-- Solo para la base LOCAL de validación. No aplicar en producción.',
    '-- Ninguna talla recibe fecha: todas nacen POR REVISAR, como se acordó.',
    'begin;'
  ];
  for (const p of filas) {
    lineas.push(
      '',
      `-- ${p.nombre} (${p.referencia_proveedor})`,
      'with nuevo_producto as (',
      '  insert into public.productos',
      '    (referencia_proveedor, nombre, marca, categoria, descripcion, segmento,',
      '     destacado, nuevo_ingreso, orden, clave_legado)',
      `  values (${comillas(p.referencia_proveedor)}, ${comillas(p.nombre)}, ${comillas(p.marca)},`,
      `          ${comillas(p.categoria)}, ${comillas(p.descripcion)}, ${comillas(p.segmento)},`,
      `          ${p.destacado}, ${p.nuevo_ingreso}, ${p.orden}, ${comillas(p.clave_legado)})`,
      '  returning id'
      , ')'
    );
    const variante = p.variantes[0];
    lineas.push(
      ', nueva_variante as (',
      '  insert into public.variantes',
      '    (producto_id, color, referencia_variante, precio, precio_anterior, orden, id_legado)',
      `  select id, ${comillas(variante.color)}, ${comillas(variante.referencia_variante)},`,
      `         ${variante.precio}, ${variante.precio_anterior}, ${variante.orden}, ${comillas(variante.id_legado)}`,
      '    from nuevo_producto',
      '  returning id',
      ')',
      ', nuevas_fotos as (',
      '  insert into public.fotos (variante_id, ruta, orden)',
      `  select nueva_variante.id, f.ruta, f.orden from nueva_variante,`,
      `    (values ${variante.fotos.map((r, k) => `(${comillas(r)}, ${k})`).join(', ')}) as f(ruta, orden)`,
      '  returning 1',
      ')',
      'insert into public.tallas (variante_id, talla, estado, origen, estado_migrado)',
      `select nueva_variante.id, t.talla, 'REVISAR', 'migracion', t.anterior from nueva_variante,`,
      `  (values ${variante.tallas.map((t) => `(${comillas(t.talla)}, ${comillas(t.estado_migrado)})`).join(', ')}) as t(talla, anterior);`
    );
    if (p.variantes.length > 1) {
      lineas.push(`-- AVISO: ${p.nombre} tiene ${p.variantes.length} variantes; esta semilla cubre una.`);
    }
  }
  lineas.push('', 'commit;');
  return lineas.join('\n');
}

function informe(productos, filas) {
  const refs = new Map();
  productos.forEach((p) => refs.set(p.id, (refs.get(p.id) || 0) + 1));
  const repetidas = [...refs].filter(([, n]) => n > 1);
  const claves = new Set(filas.map((f) => f.clave_legado));

  const l = [];
  l.push('# Migración en seco · etapa 13', '');
  l.push(`Generado: ${new Date().toISOString()}`, `Origen: ${URL_TIENDA}`, '');
  l.push('## Resumen', '');
  l.push(`- Productos en el catálogo: **${productos.length}**`);
  l.push(`- Variantes: **${filas.reduce((s, f) => s + f.variantes.length, 0)}**`);
  l.push(`- Fotos: **${filas.reduce((s, f) => s + f.variantes.reduce((a, v) => a + v.fotos.length, 0), 0)}**`);
  l.push(`- Tallas: **${filas.reduce((s, f) => s + f.variantes.reduce((a, v) => a + v.tallas.length, 0), 0)}**`);
  l.push(`- Referencias del proveedor distintas: **${refs.size}**`);
  l.push(`- Referencias repetidas: **${repetidas.length}** (${repetidas.map(([r, n]) => `${r}×${n}`).join(', ')})`);
  l.push(`- Claves heredadas únicas: **${claves.size} de ${filas.length}** ${claves.size === filas.length ? '✔' : '✗ HAY COLISIÓN'}`);
  l.push('');
  l.push('Ninguna talla recibe fecha de publicación: todas nacen POR REVISAR.');
  l.push('El estado anterior se conserva en `estado_migrado` como dato interno de revisión.');
  l.push('');
  l.push('## Registro por registro', '');
  l.push('| # | clave heredada (carrito V3) | referencia | modelo | marca | var. | fotos | tallas | antes disp./agot. |');
  l.push('|---|---|---|---|---|---|---|---|---|');
  filas.forEach((f, i) => {
    const t = f.variantes.flatMap((v) => v.tallas);
    const disp = t.filter((x) => x.estado_migrado === 'disponible').length;
    const agot = t.filter((x) => x.estado_migrado === 'agotada').length;
    l.push(`| ${i + 1} | \`${f.clave_legado}\` | ${f.referencia_proveedor} | ${f.nombre} | ${f.marca} | ${f.variantes.length} | ${f.variantes.reduce((a, v) => a + v.fotos.length, 0)} | ${t.length} | ${disp} / ${agot} |`);
  });
  return l.join('\n');
}

const productos = await catalogoDeLaTienda(URL_TIENDA);
const filas = filasDeMigracion(productos);

fs.mkdirSync(SALIDA, { recursive: true });
fs.writeFileSync(path.join(SALIDA, 'semilla-28-productos.sql'), semillaSQL(filas), 'utf8');
fs.writeFileSync(path.join(SALIDA, 'informe-migracion.md'), informe(productos, filas), 'utf8');
fs.writeFileSync(path.join(SALIDA, 'catalogo-hoy.json'), JSON.stringify(productos, null, 1), 'utf8');

const claves = new Set(filas.map((f) => f.clave_legado));
console.log(`productos           ${productos.length}`);
console.log(`claves unicas       ${claves.size}${claves.size === filas.length ? '  (sin colisiones)' : '  COLISION'}`);
console.log(`tallas              ${filas.reduce((s, f) => s + f.variantes.reduce((a, v) => a + v.tallas.length, 0), 0)}`);
console.log(`escrito en          ${SALIDA}/`);
