// Ayudas de la etapa 10. Las ventanas de portátil son las que destaparon el descentrado:
// mismo ancho de escritorio, pero poca altura (la que deja la barra del navegador).
export const VENTANAS_PORTATIL = [
  { nombre: '1366x650', ancho: 1366, alto: 650, tactil: false },
  { nombre: '1536x730', ancho: 1536, alto: 730, tactil: false },
  { nombre: '1280x720', ancho: 1280, alto: 720, tactil: false },
  { nombre: '1920x950', ancho: 1920, alto: 950, tactil: false },
];

// Lee dónde queda pintada la foto activa: el rectángulo real tras `object-fit: contain`,
// y sus márgenes respecto al espacio de la galería (el campo de papel en escritorio; el escenario
// en celular y tableta, donde la foto no lleva ruta encima dentro del mismo campo).
export const medirFoto = () => {
  const m = document.querySelector('#modal-producto');
  const R = (e) => e.getBoundingClientRect();
  const img = m.querySelector('.galeria-foto img');
  const caja = R(m.querySelector('.modal-caja'));
  const galeria = R(m.querySelector('.galeria'));
  const info = R(m.querySelector('.detalle-info'));
  const detalle = R(m.querySelector('.detalle'));
  const pista = R(m.querySelector('.galeria-pista'));
  const ib = R(img);
  const escala = Math.min(ib.width / img.naturalWidth, ib.height / img.naturalHeight);
  const w = img.naturalWidth * escala;
  const h = img.naturalHeight * escala;
  const x = ib.left + (ib.width - w) / 2;
  const y = ib.top + (ib.height - h) / 2;
  const dosColumnas = info.left > galeria.left + 50;
  const campo = dosColumnas
    ? { izq: detalle.left, der: info.left, arr: galeria.top, aba: Math.min(galeria.bottom, caja.bottom) }
    : { izq: pista.left, der: pista.right, arr: pista.top, aba: pista.bottom };
  return {
    nombre: m.querySelector('#detalle-nombre').textContent.trim(),
    src: img.getAttribute('src'),
    natural: img.naturalWidth / img.naturalHeight,
    pintada: w / h,
    ajuste: getComputedStyle(img).objectFit,
    dosColumnas,
    ancho: w,
    alto: h,
    izq: x - campo.izq,
    der: campo.der - (x + w),
    arr: y - campo.arr,
    aba: campo.aba - (y + h),
    dentroDeCaja: y >= caja.top - 1 && y + h <= caja.bottom + 1,
  };
};

// Márgenes medidos en la pantalla: localiza los píxeles que no son papel (#F3F3F0) dentro de una
// zona y devuelve cuánto queda libre a cada lado, en píxeles CSS. Comprueba lo que se ve, no el CSS.
export async function margenesEnPantalla(pagina, zona) {
  const png = await pagina.screenshot({ clip: zona });
  return pagina.evaluate(async ({ datos, ancho, alto }) => {
    const imagen = new Image();
    imagen.src = `data:image/png;base64,${datos}`;
    await imagen.decode();
    const lienzo = document.createElement('canvas');
    lienzo.width = imagen.width;
    lienzo.height = imagen.height;
    const dibujo = lienzo.getContext('2d');
    dibujo.drawImage(imagen, 0, 0);
    const p = dibujo.getImageData(0, 0, lienzo.width, lienzo.height).data;
    const noPapel = (i) => Math.abs(p[i] - 243) > 4 || Math.abs(p[i + 1] - 243) > 4 || Math.abs(p[i + 2] - 240) > 4;
    let izq = lienzo.width, der = -1, arr = lienzo.height, aba = -1;
    for (let y = 0; y < lienzo.height; y++) {
      for (let x = 0; x < lienzo.width; x++) {
        if (noPapel((y * lienzo.width + x) * 4)) {
          if (x < izq) izq = x;
          if (x > der) der = x;
          if (y < arr) arr = y;
          if (y > aba) aba = y;
        }
      }
    }
    const ex = lienzo.width / ancho;
    const ey = lienzo.height / alto;
    return { izq: izq / ex, der: (lienzo.width - 1 - der) / ex, arr: arr / ey, aba: (lienzo.height - 1 - aba) / ey, vacia: der < 0 };
  }, { datos: png.toString('base64'), ancho: zona.width, alto: zona.height });
}

// Recorre todas las tarjetas: abre cada ficha, ejecuta la medida en la página y cierra.
export async function recorrerCatalogo(pagina, medida) {
  return pagina.evaluate(async (fuente) => {
    const dos = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const medir = new Function(`return (${fuente})();`);
    const salida = [];
    for (const tarjeta of document.querySelectorAll('.tarjeta')) {
      tarjeta.querySelector('.tarjeta-enlace').click();
      await dos();
      const m = document.querySelector('#modal-producto');
      const img = m.querySelector('.galeria-foto img');
      if (img && !img.complete) await new Promise((r) => { img.onload = r; img.onerror = r; setTimeout(r, 4000); });
      salida.push(medir());
      m.querySelector('[data-cerrar]').click();
      await dos();
    }
    return salida;
  }, medida.toString());
}
