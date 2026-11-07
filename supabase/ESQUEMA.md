# Esquema de catálogo y disponibilidad · Etapa 13

Validado en **PostgreSQL 17.11** (contenedor local desechable, la misma versión mayor
que usa Supabase por omisión). Nada de esto está aplicado en producción.

## Idea central

Solo se guardan **dos cosas**: una talla está *confirmada con su fecha* o está *agotada*.
El estado «por revisar» **no se almacena**: lo deduce la base comparando fechas al leer.
Por eso no hay tareas programadas que puedan quedarse dormidas.

| Estado guardado (`tallas.estado`) | Estado público que ve el cliente |
|---|---|
| `CONFIRMADA` + `vigencia_desde` vigente | `DISPONIBLE` |
| `CONFIRMADA` + vigencia vencida | `POR_REVISAR` |
| `REVISAR` (marca manual) | `POR_REVISAR` |
| Sin `vigencia_desde` | `POR_REVISAR` |
| `AGOTADA` | `AGOTADO` (no vence nunca) |

## Tablas

| Tabla | Para qué |
|---|---|
| `productos` | Modelo. Lleva `codigo_interno` (nuestro) y `referencia_proveedor` (del proveedor) |
| `variantes` | Un color del modelo, con su precio |
| `fotos` | Rutas del sitio o URLs de Storage |
| `tallas` | **El corazón.** Estado y las cinco fechas, por variante y talla |
| `historial` | Solo se añade. Lo escribe un disparador |
| `administradores` | Quién puede escribir |
| `configuracion` | Vigencia predeterminada (48 h, hasta 60) |

## Identificadores

| Campo | Ejemplo | Regla |
|---|---|---|
| `productos.id` | UUID | Técnico, interno |
| `productos.codigo_interno` | `GT-00001` | Único, legible, permanente. Lo asigna un disparador |
| `productos.referencia_proveedor` | `GT-005` | **Puede repetirse.** Sin restricción de unicidad |
| `variantes.codigo_variante` | `GT-00001-A` | Derivado del producto |
| `productos.clave_legado` | `ADD-SAM~zapatilla-01` | Compatibilidad con carritos V3 guardados |
| `tallas (variante_id, talla)` | — | Único. Nunca se borra: se desactiva |

El `codigo_interno` lo asigna un disparador `SECURITY DEFINER`, no un valor por omisión,
para que **ningún rol de aplicación necesite permiso sobre la secuencia**.

## Las cinco fechas

| Campo | Qué guarda | ¿Mueve el reloj? |
|---|---|---|
| `publicado_en` | Publicación original del proveedor | Solo en el escenario A |
| `registrado_en` | Cuándo se registró aquí | Nunca |
| `confirmado_en` | Confirmación directa del proveedor | Solo en el escenario B |
| **`vigencia_desde`** | **La fecha que cuenta** | **Sí** |
| `vence_en` | `vigencia_desde + vigencia_horas` | Calculada por disparador |

- **Escenario A** (`fn_confirmar_por_publicacion`): el modelo reaparece. `vigencia_desde` = fecha de esa publicación.
- **Escenario B** (`fn_confirmar_por_proveedor`): el proveedor confirma por mensaje. `vigencia_desde` = ahora.
  Así una confirmación reciente **no queda POR REVISAR** por arrastrar una publicación antigua.

## Por qué `vence_en` no es una columna generada

La primera propuesta era:

```sql
vence_en timestamptz generated always as
  (publicado_en + (vigencia_horas || ' hours')::interval) stored
```

**PostgreSQL la rechaza:** `ERROR: generation expression is not immutable`. La documentación
exige funciones inmutables, y `timestamptz + interval` es `STABLE` porque depende del ajuste
`TimeZone`. Comprobado en el motor:

```
timestamptz_pl_interval | STABLE
timestamp_pl_interval   | IMMUTABLE
```

Un disparador sí puede llamar funciones `STABLE`, así que `vence_en` se guarda de verdad y
puede **indexarse y ordenarse**, que es lo que necesita el panel.
El estado efectivo depende de `now()` y por eso **nunca se almacena**: vive en la vista.

## Seguridad

Dos cerrojos independientes:

1. **Privilegios**: qué tablas y **qué columnas** puede tocar cada rol.
2. **RLS**: qué filas ve de las que puede tocar.

La vista `catalogo_publico` usa `security_invoker = true`. Sin eso se ejecutaría con los
permisos de su propietario y **se saltaría el RLS** de las tablas base.

**El visitante no puede leer**, ni por la vista ni consultando las tablas: `nota`,
`estado_migrado`, `origen`, `publicado_en`, `confirmado_en`, `registrado_en`,
`vigencia_horas`, `historial`, `administradores`, `configuracion`, ni la secuencia de códigos.

**Matiz del historial:** el privilegio `SELECT` se concede al rol `authenticated` porque el
administrador también es `authenticated`, y los privilegios son por rol, no por usuario. La
separación la hace el RLS: quien no es administrador ejecuta la consulta y recibe **cero filas**.
Nadie, ni el administrador, puede modificarlo ni borrarlo.

## Cómo validar

```bash
bash scripts/validar-esquema.sh
```

Levanta PostgreSQL 17 en Docker, aplica las migraciones, ejecuta las pruebas de vigencia y
de seguridad, hace la migración en seco de los 28 productos y la verifica contra la tienda real.
