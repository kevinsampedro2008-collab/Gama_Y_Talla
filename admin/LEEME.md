# Panel privado de Gama & Talla · etapa 15A

Ingreso con correo y contraseña y tablero de **consulta** del catálogo. Todavía no edita nada: la
disponibilidad y la carga del catálogo llegan en 15B; la administración completa, en la etapa 16.

## Abrirlo en local

En la raíz del proyecto, en PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\abrir-panel.ps1
```

El guion arranca el servidor estático en `127.0.0.1:8765` si no está en marcha y abre
**http://127.0.0.1:8765/admin/**. A mano es lo mismo:

```bash
python -m http.server 8765 --bind 127.0.0.1
# y abrir http://127.0.0.1:8765/admin/
```

El panel habla directamente con el proyecto de Supabase configurado: con `admin/config.js` apuntando
a `gama-talla-dev`, lo que se ve son los datos reales.

## Configuración

`admin/config.js` **no se versiona** (está en `.gitignore`). Se crea copiando `config.ejemplo.js`:

| Valor | Dónde se obtiene |
|---|---|
| `supabaseUrl` | Dashboard → Project Settings → Data API → Project URL |
| `clavePublicable` | Dashboard → Project Settings → API Keys → Publishable key (`sb_publishable_…`) |

Solo la clave **publicable**. El panel rechaza una clave secreta (`sb_secret_…`) o un JWT y muestra
«Falta configurar el panel». La protección real la hacen el RLS y las funciones de Supabase.

## Cómo protege el acceso

- **Sesión:** la gestiona el SDK oficial (`vendor/supabase-js-2.118.0`, versión fijada y servida desde
  el propio sitio; ver su `LEEME.txt`). Se guarda solo bajo la clave `gama-talla-panel-sesion` de
  `localStorage`: el carrito y la caché de la tienda no se tocan, y la tienda sigue consultando como
  visitante con su clave publicable, sin la sesión del panel.
- **Permiso:** antes de mostrar o recargar datos se verifica la sesión con Auth en el servidor
  (`getUser`) y el permiso con `fn_es_administrador()`. Se repite en cada «Actualizar» y al volver a la
  pestaña (como mucho cada 30 s). Si el permiso se retira o la sesión vence, los datos desaparecen.
- **Errores de red:** no se muestran datos anteriores; el SDK reintenta las lecturas hasta 3 veces y
  después aparece un aviso con «Reintentar».
- **Cerrar sesión:** cierra la sesión de este dispositivo con el SDK (`signOut({ scope: "local" })`),
  lo que revoca su token de refresco, y borra solo la clave del panel.
- **Página:** política de seguridad de contenido estricta (solo scripts propios; conexiones solo a
  Supabase), `noindex` y sin `Referer`. Todo el contenido se pinta con `textContent`.

## Qué lee

| Dato | De dónde |
|---|---|
| Productos, colores, precios y fotos (también ocultos) | Tablas `productos`, `variantes` y `fotos` (RLS de administrador) |
| Tallas y sus columnas internas | `fn_admin_tallas()` |
| Estado de cada talla en la tienda | `catalogo_publico`: lo calcula Supabase, no el reloj del navegador |

Lo que no está publicado (producto, color o talla inactivos) se presenta como «no visible en la tienda».

## Pruebas (solo local)

Con el stack local de Supabase y la tienda servida:

```bash
npx --yes supabase@3.0.0 start -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
python -m http.server 8765 --bind 127.0.0.1      # en otra terminal
npx playwright test tests/etapa15 --workers=1
npx --yes supabase@3.0.0 stop --no-backup
```

Las pruebas crean usuarios y productos **ficticios** en el stack local con su clave de servicio
local, los borran al terminar y se niegan a correr si la API no está en `127.0.0.1`. Usan un solo
proceso (`--workers=1`): el servidor de Python no aguanta conexiones en paralelo. Las capturas se
guardan en la carpeta temporal del sistema (`gama-talla-15a-capturas`), fuera del repositorio.
