# Conectar la tienda a Supabase

La etapa 14 dejó la tienda lista: **no hay que tocar `app.js`**. La conexión se declara
fuera del código y, mientras no se declare, la tienda lee `data/productos.json` como siempre.

## Lo que falta hacer, y que solo puedes hacer tú

1. **Crear el proyecto en Supabase.** Todavía no está autorizado, así que no lo he creado.
2. **Aplicar las migraciones** de `supabase/migrations/` en ese proyecto.
3. **Añadirte como administrador:**
   ```sql
   insert into public.administradores (user_id, nombre)
   values ('<tu-id-de-usuario>', 'Kevin');
   ```
4. **Copiar dos datos** del panel de Supabase, en *Project Settings → API*:
   - La **URL del proyecto** (`https://xxxxx.supabase.co`).
   - La **clave pública** (`anon` / *publishable*).

## Las dos líneas que hay que añadir a `index.html`

Justo **antes** de `<script src="app.js">`:

```html
<script>
  window.GAMA_TALLA_CONFIG = {
    catalogoUrl: "https://xxxxx.supabase.co/rest/v1/catalogo_publico?select=*&order=orden",
    catalogoClave: "<clave anon>"
  };
</script>
```

Es el único cambio en el repositorio para activar la conexión, y revertirlo
(borrar esas líneas) devuelve la tienda al JSON local.

## Qué clave va y cuál no

| Clave | ¿Va en el navegador? | Por qué |
|---|---|---|
| `anon` / publishable | **Sí** | Está pensada para ser pública. Solo puede leer la vista, y el RLS lo garantiza |
| `service_role` / secret | **Nunca** | Se salta el RLS por completo. Quien la tenga puede leer y borrar todo |

La configuración solo acepta `catalogoUrl` y `catalogoClave`; cualquier otro campo se ignora.

## Comprobación tras conectar

1. Abre la tienda: deben verse los 28 productos y, al no haber confirmado nada todavía,
   **todas las tallas por revisar**.
2. Apaga el wifi y recarga: debe salir la banda **«Modo consulta»** y el carrito debe
   conservarse intacto.
3. Confirma una talla en la base y recarga: esa talla debe poder comprarse.

## Importante antes de conectar en producción

La migración y esta conexión deben ir **a la vez**. Si la tienda empieza a leer de Supabase
con las 180 tallas por revisar, nadie podrá comprar hasta que confirmes disponibilidad.
