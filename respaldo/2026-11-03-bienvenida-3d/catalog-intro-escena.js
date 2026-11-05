/* =========================================================
   GAMA & TALLA — Escena 3D de la presentación del catálogo
   Three.js 0.165.0 (copia local en assets/vendor). Recibe el GLB ya
   descargado, lo prepara sin alterarlo (solo transformaciones de escena)
   y dirige cámara e iluminación según el tiempo que marca el controlador.
   ========================================================= */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const RUTA_DRACO = new URL("../vendor/three-0.165.0/examples/jsm/libs/draco/gltf/", import.meta.url).href;
const GRADO = Math.PI / 180;

/* Guion de cámara e iluminación.
   az: azimut alrededor de la zapatilla (0 = perfil exterior, −90 = de frente, + hacia el talón).
   el: elevación de la cámara. ajuste: fracción del encuadre seguro que ocupa la zapatilla.
   giro: giro propio de la zapatilla. cierre: 0 = encuadre central, 1 = encuadre del cierre (más alto).
   Luces en múltiplos de su intensidad base; exp = exposición; piscina = luz del fondo. */
const CLAVES = [
  { t: 0.0, az: 34, el: 5, ajuste: 0.42, giro: -16, cierre: 0, dx: 0, exp: 0.00, clave: 0.00, borde: 0.0, relleno: 0.00, cobalto: 0.0, entorno: 0.0, piscina: 0.00 },
  { t: 2.2, az: 32, el: 5, ajuste: 0.44, giro: -15, cierre: 0, dx: 0, exp: 0.00, clave: 0.00, borde: 0.0, relleno: 0.00, cobalto: 0.0, entorno: 0.0, piscina: 0.00 },
  // Aparición: primero el contorno, después la luz lateral que revela las formas.
  { t: 3.4, az: 24, el: 5, ajuste: 0.52, giro: -11, cierre: 0, dx: 0, exp: 0.60, clave: 0.08, borde: 1.10, relleno: 0.05, cobalto: 0.5, entorno: 0.15, piscina: 0.35 },
  { t: 5.0, az: 8, el: 5, ajuste: 0.62, giro: -3, cierre: 0, dx: 0.06, exp: 1.00, clave: 1.00, borde: 0.85, relleno: 1.00, cobalto: 0.6, entorno: 1.0, piscina: 1.00 },
  // Perfil: acercamiento lento; la frase va a la izquierda, la zapatilla se corre a la derecha.
  { t: 7.4, az: 0, el: 3, ajuste: 0.68, giro: 0, cierre: 0, dx: 0.08, exp: 1.00, clave: 1.00, borde: 0.85, relleno: 1.00, cobalto: 0.6, entorno: 1.0, piscina: 1.00 },
  // Silueta: contraluz. La zapatilla se oscurece contra el resplandor cálido; pausa.
  { t: 8.2, az: -1, el: 2.5, ajuste: 0.66, giro: 0, cierre: 0, dx: -0.11, exp: 0.80, clave: 0.04, borde: 2.20, relleno: 0.03, cobalto: 1.1, entorno: 0.08, piscina: 1.00 },
  { t: 9.2, az: -3, el: 2, ajuste: 0.66, giro: 0, cierre: 0, dx: -0.11, exp: 0.80, clave: 0.04, borde: 2.20, relleno: 0.03, cobalto: 1.1, entorno: 0.08, piscina: 1.00 },
  // Tres cuartos frontal, con la cámara algo más alta.
  { t: 11.4, az: -42, el: 17, ajuste: 0.66, giro: 8, cierre: 0, dx: 0.13, exp: 1.00, clave: 1.00, borde: 0.90, relleno: 1.00, cobalto: 0.6, entorno: 1.0, piscina: 1.00 },
  // Frente: la puntera mira a la cámara.
  { t: 13.2, az: -84, el: 7, ajuste: 0.56, giro: 2, cierre: 0, dx: -0.08, exp: 1.00, clave: 1.00, borde: 0.90, relleno: 1.00, cobalto: 0.7, entorno: 1.0, piscina: 1.00 },
  // Cierre: tres cuartos de presentación, la zapatilla sube para dejar sitio al titular.
  { t: 15.2, az: -30, el: 12, ajuste: 0.62, giro: -6, cierre: 1, dx: 0, exp: 1.05, clave: 1.10, borde: 1.00, relleno: 1.00, cobalto: 0.6, entorno: 1.0, piscina: 1.00 },
  { t: 17.5, az: -26, el: 12, ajuste: 0.63, giro: -7, cierre: 1, dx: 0, exp: 1.05, clave: 1.10, borde: 1.00, relleno: 1.00, cobalto: 0.6, entorno: 1.0, piscina: 1.00 }
];
const CANALES_CAMARA = ["az", "el", "ajuste", "giro", "cierre", "dx"];
const CANALES_LUZ = ["exp", "clave", "borde", "relleno", "cobalto", "entorno", "piscina"];

/* Rectángulo seguro (coordenadas normalizadas −1…1) donde debe caber la zapatilla:
   en escritorio, la columna central entre los textos; en celular, la mitad superior. */
const ENCUADRES = {
  amplio: { normal: { cx: 0, cy: 0.02, w: 1.5, h: 1.4 }, cierre: { cx: 0, cy: 0.26, w: 1.3, h: 0.92 } },
  compacto: { normal: { cx: 0, cy: 0.16, w: 1.9, h: 1.0 }, cierre: { cx: 0, cy: 0.26, w: 1.86, h: 0.8 } }
};

const BASE = { clave: 3.1, borde: 3.2, relleno: 0.4, cobalto: 1.5, entorno: 0.42 };

/* ---------- Preparación del modelo ---------- */

// Descomprime el GLB (Draco + WebP) y lo deja centrado, con la puntera hacia −X,
// la suela abajo y 2 unidades de largo. El archivo original no se modifica.
export async function prepararModelo(buffer, { tamanoTextura = 2048 } = {}) {
  const draco = new DRACOLoader().setDecoderPath(RUTA_DRACO);
  const cargador = new GLTFLoader().setDRACOLoader(draco);
  let gltf;
  try {
    gltf = await new Promise((resolver, rechazar) => cargador.parse(buffer, "", resolver, rechazar));
  } finally {
    draco.dispose();
  }

  const modelo = gltf.scene;
  const ajuste = new THREE.Group();
  const pivote = new THREE.Group();
  ajuste.add(modelo);
  pivote.add(ajuste);

  const caja = new THREE.Box3().setFromObject(modelo);
  modelo.position.sub(caja.getCenter(new THREE.Vector3()));
  if (punteraEnMasX(modelo)) ajuste.rotation.y = Math.PI;
  const tam = caja.getSize(new THREE.Vector3());
  ajuste.scale.setScalar(2 / Math.max(tam.x, tam.z));
  pivote.updateMatrixWorld(true);

  // Texturas de 4096 px: se reducen solo en memoria para no ocupar GPU de más.
  modelo.traverse((objeto) => {
    if (!objeto.isMesh) return;
    for (const material of [].concat(objeto.material)) {
      for (const textura of new Set([material.map, material.metalnessMap, material.roughnessMap, material.normalMap].filter(Boolean))) {
        reducirTextura(textura, tamanoTextura);
      }
    }
  });

  const local = new THREE.Box3().setFromObject(pivote);
  const esquinas = [];
  for (const x of [local.min.x, local.max.x]) for (const y of [local.min.y, local.max.y]) for (const z of [local.min.z, local.max.z]) esquinas.push(new THREE.Vector3(x, y, z));
  return { pivote, esquinas, suelo: local.min.y, largo: local.max.x - local.min.x, ancho: local.max.z - local.min.z };
}

// La puntera es el extremo largo más bajo (el talón y el cuello quedan más altos).
function punteraEnMasX(modelo) {
  const p = new THREE.Vector3();
  let altoMenos = -Infinity;
  let altoMas = -Infinity;
  const caja = new THREE.Box3().setFromObject(modelo);
  const corte = (caja.max.x - caja.min.x) * 0.25;
  modelo.updateMatrixWorld(true);
  modelo.traverse((objeto) => {
    if (!objeto.isMesh) return;
    const pos = objeto.geometry.attributes.position;
    const paso = Math.max(1, Math.floor(pos.count / 60000));
    for (let i = 0; i < pos.count; i += paso) {
      p.fromBufferAttribute(pos, i).applyMatrix4(objeto.matrixWorld);
      if (p.x < caja.min.x + corte) altoMenos = Math.max(altoMenos, p.y);
      else if (p.x > caja.max.x - corte) altoMas = Math.max(altoMas, p.y);
    }
  });
  return altoMas < altoMenos;
}

function reducirTextura(textura, maximo) {
  const imagen = textura.image;
  const ancho = imagen?.width;
  const alto = imagen?.height;
  if (!ancho || Math.max(ancho, alto) <= maximo) return;
  const escala = maximo / Math.max(ancho, alto);
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(ancho * escala);
  lienzo.height = Math.round(alto * escala);
  const contexto = lienzo.getContext("2d");
  contexto.imageSmoothingQuality = "high";
  contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  imagen.close?.();
  textura.image = lienzo;
  textura.needsUpdate = true;
}

/* ---------- Escena ---------- */

export function crearEscena({ contenedor, preparado, compacto: compactoInicial }) {
  let compacto = compactoInicial;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute("aria-hidden", "true");
  contenedor.append(renderer.domElement);

  const escena = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const habitacion = new RoomEnvironment();
  const entorno = pmrem.fromScene(habitacion, 0.04).texture;
  habitacion.dispose?.();
  escena.environment = entorno;

  const camara = new THREE.PerspectiveCamera(26, 1, 0.05, 60);
  const { pivote, esquinas } = preparado;
  escena.add(pivote);

  // Luz lateral cálida (revela volumen), contorno desde atrás, un filo cobalto de marca y relleno suave.
  const luzClave = new THREE.DirectionalLight(0xffdcb6, 0);
  luzClave.position.set(-2.4, 2.8, 2.6);
  const luzBorde = new THREE.DirectionalLight(0xffedd7, 0);
  luzBorde.position.set(1.6, 2.2, -3.4);
  const luzCobalto = new THREE.DirectionalLight(0x4b62ff, 0);
  luzCobalto.position.set(-3.2, 0.7, -1.9);
  const luzRelleno = new THREE.HemisphereLight(0xffe8cf, 0x2a170b, 0);
  escena.add(luzClave, luzBorde, luzCobalto, luzRelleno);

  // Sombra de contacto: un degradado suave bajo la suela que gira con la zapatilla.
  const texturaSombra = crearTexturaSombra();
  const sombra = new THREE.Mesh(
    new THREE.PlaneGeometry(preparado.largo * 1.25, preparado.ancho * 1.5),
    new THREE.MeshBasicMaterial({ map: texturaSombra, transparent: true, depthWrite: false, opacity: 0 })
  );
  sombra.rotation.x = -Math.PI / 2;
  sombra.position.y = preparado.suelo - 0.004;
  const grupoSombra = new THREE.Group();
  grupoSombra.add(sombra);
  escena.add(grupoSombra);

  const valores = {};
  const direccion = new THREE.Vector3();
  const punto = new THREE.Vector3();

  function redimensionar(nuevoCompacto = compacto) {
    compacto = nuevoCompacto;
    const ancho = contenedor.clientWidth || window.innerWidth;
    const alto = contenedor.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compacto ? 1.5 : 1.75));
    renderer.setSize(ancho, alto, false);
    camara.aspect = ancho / alto;
    camara.fov = compacto ? 30 : 24;
    camara.updateProjectionMatrix();
  }

  // Coloca la cámara a la distancia justa para que la caja de la zapatilla ocupe la fracción
  // pedida del rectángulo seguro, y desplaza la lente (sin girar) para centrarla en él.
  function encuadrar(az, el, fraccion, rect) {
    direccion.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    let distancia = 6;
    let extremos;
    for (let i = 0; i < 3; i += 1) {
      camara.position.copy(direccion).multiplyScalar(distancia);
      camara.lookAt(0, 0, 0);
      camara.updateMatrixWorld();
      camara.updateProjectionMatrix();
      extremos = proyectar();
      const escala = Math.max((extremos.maxX - extremos.minX) / (fraccion * rect.w), (extremos.maxY - extremos.minY) / (fraccion * rect.h));
      distancia *= escala;
    }
    camara.position.copy(direccion).multiplyScalar(distancia);
    camara.lookAt(0, 0, 0);
    camara.updateMatrixWorld();
    camara.updateProjectionMatrix();
    extremos = proyectar();
    const e = camara.projectionMatrix.elements;
    e[8] -= rect.cx - (extremos.minX + extremos.maxX) / 2;
    e[9] -= rect.cy - (extremos.minY + extremos.maxY) / 2;
    camara.projectionMatrixInverse.copy(camara.projectionMatrix).invert();
  }

  function proyectar() {
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    for (const esquina of esquinas) {
      punto.copy(esquina).applyMatrix4(pivote.matrixWorld).project(camara);
      minX = Math.min(minX, punto.x); maxX = Math.max(maxX, punto.x);
      minY = Math.min(minY, punto.y); maxY = Math.max(maxY, punto.y);
    }
    return { minX, maxX, minY, maxY };
  }

  function actualizar(t) {
    muestrear(t, valores);
    const juego = compacto ? ENCUADRES.compacto : ENCUADRES.amplio;
    const rect = mezclarRect(juego.normal, juego.cierre, valores.cierre);
    // En pantallas amplias, la zapatilla cede espacio al lado donde aparece la frase.
    if (!compacto) rect.cx += valores.dx;

    // Primero la pose de guion (sin flotación) para encuadrar; después la flotación sutil.
    pivote.position.set(0, 0, 0);
    pivote.rotation.set(0, valores.giro * GRADO, 0);
    pivote.updateMatrixWorld(true);
    // En vertical la zapatilla se lee mejor un poco más grande (el ancho manda).
    const fraccion = compacto ? Math.min(0.86, valores.ajuste * 1.15) : valores.ajuste;
    encuadrar(valores.az * GRADO, valores.el * GRADO, fraccion, rect);
    const flotacion = Math.sin(t * 1.05) * 0.018;
    pivote.position.y = flotacion;
    pivote.rotation.z = Math.sin(t * 0.8) * 0.6 * GRADO;
    pivote.rotation.x = Math.sin(t * 0.63 + 1.2) * 0.35 * GRADO;
    pivote.updateMatrixWorld(true);
    grupoSombra.rotation.y = valores.giro * GRADO;

    renderer.toneMappingExposure = valores.exp;
    luzClave.intensity = BASE.clave * valores.clave;
    luzBorde.intensity = BASE.borde * valores.borde;
    luzCobalto.intensity = BASE.cobalto * valores.cobalto;
    luzRelleno.intensity = BASE.relleno * valores.relleno;
    escena.environmentIntensity = BASE.entorno * valores.entorno;
    // Mientras la escena está en penumbra, el lienzo aparece con la exposición (sin silueta negra).
    renderer.domElement.style.opacity = Math.min(1, valores.exp * 2.5).toFixed(3);
    sombra.material.opacity = 0.62 * valores.piscina * (1 - flotacion * 6);

    renderer.render(escena, camara);
    return valores.piscina;
  }

  function precalentar() {
    renderer.compile(escena, camara);
    actualizar(0);
  }

  function exportar() {
    renderer.render(escena, camara);
    return renderer.domElement.toDataURL("image/png");
  }

  function destruir() {
    escena.traverse((objeto) => {
      if (!objeto.isMesh) return;
      objeto.geometry?.dispose();
      for (const material of [].concat(objeto.material)) {
        for (const valor of Object.values(material)) if (valor?.isTexture) valor.dispose();
        material.dispose();
      }
    });
    texturaSombra.dispose();
    entorno.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  }

  redimensionar(compacto);
  return { actualizar, redimensionar, precalentar, exportar, destruir };
}

/* ---------- Interpolación del guion ---------- */

// Cámara: curva de Hermite con tangentes según el tiempo (movimiento continuo entre claves).
// Luces: transición suave entre claves.
function muestrear(t, salida) {
  const ultimo = CLAVES.length - 1;
  let i = 0;
  while (i < ultimo - 1 && t >= CLAVES[i + 1].t) i += 1;
  const a = CLAVES[Math.max(0, i - 1)];
  const b = CLAVES[i];
  const c = CLAVES[Math.min(ultimo, i + 1)];
  const d = CLAVES[Math.min(ultimo, i + 2)];
  const duracion = Math.max(1e-6, c.t - b.t);
  const s = Math.min(1, Math.max(0, (t - b.t) / duracion));
  for (const canal of CANALES_CAMARA) {
    const m1 = b === a ? 0 : ((c[canal] - a[canal]) / (c.t - a.t)) * duracion;
    const m2 = d === c ? 0 : ((d[canal] - b[canal]) / (d.t - b.t)) * duracion;
    salida[canal] = hermite(b[canal], c[canal], m1, m2, s);
  }
  const suave = s * s * (3 - 2 * s);
  for (const canal of CANALES_LUZ) salida[canal] = b[canal] + (c[canal] - b[canal]) * suave;
  salida.cierre = Math.min(1, Math.max(0, salida.cierre));
  salida.ajuste = Math.min(0.8, Math.max(0.3, salida.ajuste));
}

function hermite(p1, p2, m1, m2, s) {
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p1 + (s3 - 2 * s2 + s) * m1 + (-2 * s3 + 3 * s2) * p2 + (s3 - s2) * m2;
}

function mezclarRect(a, b, k) {
  return { cx: a.cx + (b.cx - a.cx) * k, cy: a.cy + (b.cy - a.cy) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k };
}

function crearTexturaSombra() {
  const lienzo = document.createElement("canvas");
  lienzo.width = 256;
  lienzo.height = 256;
  const contexto = lienzo.getContext("2d");
  const degradado = contexto.createRadialGradient(128, 128, 0, 128, 128, 128);
  degradado.addColorStop(0, "rgba(0,0,0,0.85)");
  degradado.addColorStop(0.45, "rgba(0,0,0,0.42)");
  degradado.addColorStop(1, "rgba(0,0,0,0)");
  contexto.fillStyle = degradado;
  contexto.fillRect(0, 0, 256, 256);
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}
