# Reproducir las verificaciones de la etapa 14f.2 · SOLO LOCAL

Todo lo de esta carpeta se ejecuta contra el **stack local desechable** de Supabase (proyecto
`Yeny_Oficial`, contenedor `supabase_db_Yeny_Oficial`) o contra un PostgreSQL local en Docker.
**Nunca contra el proyecto remoto**: los guiones de mutación y el ciclo escriben y deshacen, y el
`ROLLBACK` no devuelve las secuencias. Los `.mjs` hablan con la base por `docker exec` y se niegan a
empezar si el contenedor local no está en marcha o no tiene la migración `20261107030000`; el ciclo
trabaja en una copia temporal sin enlace a ningún proyecto y aborta si `db push --dry-run` no apunta
al stack local. No se guardan capturas, volcados ni resultados en el repositorio.

## Qué cubre cada herramienta

| Qué | Cómo | Necesita |
|---|---|---|
| Migraciones en orden, semilla, verificación de la tienda y del carrito V3, pruebas SQL 10, 20, 30, 40 y 60, auditoría | `bash scripts/validar-esquema.sh` | Docker y la tienda servida en `127.0.0.1:8765` |
| Atomicidad y repetibilidad por `supabase db push` | `ciclo_atomicidad.sh` | Docker y Node (Supabase CLI 3.0.0 por `npx`) |
| Acceso por HTTP real (Kong, PostgREST, Auth) | `node supabase/pruebas/50_postgrest_local.mjs` | Stack local en marcha |
| Que la comprobación final de la migración detecta cada protección rota | `mutaciones_comprobacion_final.mjs` | Stack local con la migración aplicada |
| Que las pruebas 60 y 40 detectan cada protección rota | `mutaciones_pruebas.mjs` | Igual |
| Que la auditoría por firmas detecta cada desviación, también con un `search_path` hostil | `mutaciones_auditoria.mjs` | Igual |
| La tienda real leyendo el stack local en 3 navegadores y 5 anchos | `humo_tienda.mjs` | Stack local, tienda en `127.0.0.1:8765`, navegadores de Playwright |

El validador **no** cubre la atomicidad por `db push`, la prueba HTTP ni las mutaciones ni el humo:
usa un PostgreSQL corriente, sin Supabase CLI, Kong, PostgREST ni Auth.

## Etapa 16.2 · Migrar desde las 12 anteriores con datos previos

`20261108030000_codigos_editables_y_mayusculas.sql` se prueba sobre un stack local que todavía
tiene solo las 12 migraciones anteriores, con datos FICTICIOS previos (claves heredadas con `~`,
un producto creado por el panel, nombres en minúsculas con tildes y Ñ, tallas con vigencias y
fotos):

```bash
# La CLI admite «db reset --version 20261108020000»; en 16.2 se usó un stack creado antes de añadir
# la migración nueva, que ya tenía solo las 12 anteriores.
npx --yes supabase@3.0.0 db reset --local --version 20261108020000
docker exec -i supabase_db_Yeny_Oficial psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/pruebas/reproducir/datos_previos_16_2.sql
npx --yes supabase@3.0.0 migration up --local
docker exec -i supabase_db_Yeny_Oficial psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/pruebas/reproducir/verificar_migracion_16_2.sql
npx --yes supabase@3.0.0 db reset --local   # deja la base local limpia para las pruebas del panel
```

`verificar_migracion_16_2.sql` comprueba que los identificadores públicos no cambian al migrar
ni al renombrar, las mayúsculas, las versiones, las tallas, las fotos y el historial, y lo
deshace todo al terminar. Después: `supabase/pruebas/90_codigos_editables.sql`.

## Etapa 16.3 · Migrar desde las 13 anteriores con datos previos

```bash
npx --yes supabase@3.0.0 db reset --local --version 20261108030000
docker exec -i supabase_db_Yeny_Oficial psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/pruebas/reproducir/datos_previos_16_3.sql
npx --yes supabase@3.0.0 migration up --local
docker exec -i supabase_db_Yeny_Oficial psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/pruebas/reproducir/verificar_migracion_16_3.sql
npx --yes supabase@3.0.0 db reset --local
```

Comprueba que la vista conserva cada campo e identificador anterior, que lo existente queda sin
clasificar y sin muestra, y que un cliente anterior no borra lo guardado. Después:
`supabase/pruebas/91_publico_y_muestras.sql` (también la ejecuta `scripts/validar-esquema.sh`).

## Etapa 17 · Migrar desde las 14 anteriores con un producto sin público

```bash
npx --yes supabase@3.0.0 db reset --local --version 20261108040000
docker exec -i supabase_db_Yeny_Oficial psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/pruebas/reproducir/datos_previos_17.sql
npx --yes supabase@3.0.0 migration up --local
docker exec -i supabase_db_Yeny_Oficial psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/pruebas/reproducir/verificar_migracion_17.sql
npx --yes supabase@3.0.0 db reset --local
```

Comprueba que la vista, las filas y el historial no cambian al migrar, que el heredado sin público
sigue visible en «Todos» con su identidad, que guardarlo o publicarlo exige clasificarlo, que un
cliente anterior conserva la clasificación existente y que no se puede quitar. Después:
`supabase/pruebas/92_publico_obligatorio.sql` (también la ejecuta `scripts/validar-esquema.sh`).

## Etapa 17 · Ciclo de respaldo y recuperación

Necesita el stack de este proyecto (origen, catálogo vacío), OTRO stack local vacío preparado con
`scripts/respaldo/preparar-destino.mjs` y la tienda en `127.0.0.1:8765`:

```bash
node scripts/respaldo/preparar-destino.mjs --carpeta "<destino>" --id gt_restauracion_17
npx --yes supabase@3.0.0 start --workdir "<destino>" -x realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
node supabase/pruebas/reproducir/ciclo_respaldo_17.mjs --destino-workdir "<destino>" --salida "<carpeta fuera del repo>"
# Para repetirlo: npx --yes supabase@3.0.0 db reset --workdir "<destino>"
```

## Etapa 17.1 · Verificación de la restauración (1.001 productos y un 503)

```bash
# Sin Supabase: servidor HTTP simulado con max_rows = 1000
node --test supabase/pruebas/reproducir/pruebas_vista_respaldo.mjs

# Con el origen (este proyecto, vacío) y un destino local vacío; el paquete pequeño es el que deja
# ciclo_respaldo_17.mjs. Siembra 1.001 productos, los respalda, los restaura y repite con un 503.
node supabase/pruebas/reproducir/ciclo_verificacion_17_1.mjs --destino-workdir "<destino>" --salida "<carpeta fuera del repo>" --paquete-chico "<paquete>"
```

`GT_RESPALDO_SIMULAR_FALLO=vista-503` hace que `catalogo_publico` responda 503 con un cuerpo de texto
DESPUÉS de confirmar la base (solo pruebas).

## Orden

Desde la raíz del proyecto:

```bash
# Tienda estática (en otra terminal)
python -m http.server 8765 --bind 127.0.0.1

# Validador integral (PostgreSQL corriente; regenera supabase/local/vista-publica.json).
# CONTENEDOR y PUERTO evitan tocar un contenedor existente.
CONTENEDOR=gt-pg-validacion PUERTO=55436 bash scripts/validar-esquema.sh --limpiar

# Stack local de Supabase: lo crea de cero con 9 migraciones, comprueba la atomicidad y deja 10.
# OJO: borra los datos del stack LOCAL de este proyecto.
bash supabase/pruebas/reproducir/ciclo_atomicidad.sh

# Pruebas SQL contra el stack local
for f in 10_vigencia 20_seguridad 30_endurecimiento 40_acceso_interno 60_integridad_tallas_vigencia; do
  docker exec -i supabase_db_Yeny_Oficial psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/pruebas/$f.sql
done
docker exec -i supabase_db_Yeny_Oficial psql -X -U postgres -d postgres < supabase/pruebas/auditar_funciones.sql

# HTTP real, mutaciones y humo
node supabase/pruebas/50_postgrest_local.mjs
node supabase/pruebas/reproducir/mutaciones_comprobacion_final.mjs
node supabase/pruebas/reproducir/mutaciones_pruebas.mjs
node supabase/pruebas/reproducir/mutaciones_auditoria.mjs
docker exec -i supabase_db_Yeny_Oficial psql -X -q -U postgres -d postgres < supabase/local/semilla-28-productos.sql   # opcional: catálogo completo para el humo
node supabase/pruebas/reproducir/humo_tienda.mjs

# Al terminar
npx --yes supabase@3.0.0 stop --no-backup
```

Cada guion termina con código 0 solo si todo lo esperado se cumple; las pruebas omitidas (GraphQL si
`pg_graphql` no está activo, un navegador que no se puede lanzar) se cuentan aparte, nunca como correctas.

## Versiones

`ciclo_atomicidad.sh` copia los archivos de versión de `supabase/.temp` (los que fija `supabase link`) para
arrancar las mismas imágenes que el proyecto remoto. Sin ellos, Supabase CLI usa las suyas por omisión:
compruébalo en la lista de contenedores que imprime el ciclo. En la etapa 14f.2 se usaron postgres
`17.11.0.018`, PostgREST `v14.18`, GoTrue `v2.197.0` y Kong `2.8.1`.
