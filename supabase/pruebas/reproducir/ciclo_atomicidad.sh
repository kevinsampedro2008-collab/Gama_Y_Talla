#!/usr/bin/env bash
# Atomicidad y repetibilidad de 20261107030000 por el camino real (`supabase db push`). SOLO LOCAL.
#
#   bash supabase/pruebas/reproducir/ciclo_atomicidad.sh
#
# 1. Copia en una carpeta temporal (fuera del repositorio) config.toml, las 9 migraciones
#    anteriores y, si existen, los archivos de VERSIÓN de supabase/.temp (nunca project-ref,
#    linked-project.json ni pooler-url: la copia no queda enlazada a ningún proyecto remoto).
# 2. `supabase stop --no-backup` + `supabase start` del proyecto local «Yeny_Oficial»: BORRA los
#    datos del stack LOCAL de este proyecto. No toca otros contenedores ni el remoto.
# 3. Carga datos_previos.sql (con una talla no válida) y comprueba:
#    a) db push falla, enumera la talla y el esquema queda idéntico (atomicidad del archivo);
#    b) tras corregir el dato, una copia saboteada al final falla y tampoco deja nada;
#    c) db push real aplica la migración; d) repetir el archivo no cambia el esquema y
#    db push no lo reaplica.
# Cada archivo de migración es atómico; el conjunto no: si este falla, las 9 anteriores siguen.
# Deja el stack local en marcha con las 10 migraciones, para las demás pruebas (README.md).
set -u
set -o pipefail

RAIZ="$(cd "$(dirname "$0")/../../.." && pwd)"
M=20261107030000_integridad_tallas_y_vigencia.sql
CLI="npx --yes supabase@3.0.0"
TRABAJO="$(mktemp -d)"
fallos=0
ok() { echo "OK     $1"; }
mal() { echo "FALLA  $1"; fallos=$((fallos+1)); }
sqlq() { docker exec supabase_db_Yeny_Oficial psql -X -U postgres -d postgres -tAc "$1"; }
volcado() { docker exec supabase_db_Yeny_Oficial pg_dump -U postgres -d postgres --schema-only --schema=public | tr -d '\r' | grep -v -e '^.restrict ' -e '^.unrestrict '; }
migraciones() { sqlq "select count(*) || ' ' || max(version) from supabase_migrations.schema_migrations"; }
# Antes de cada push real: el destino debe ser el stack local.
destino_local() {
  ( cd "$TRABAJO" && $CLI db push --dry-run 2>&1 ) | grep -q '"kind":"local"' \
    || { echo "ABORTADO: db push no apunta al stack local."; exit 2; }
}

echo "=== 0. Copia de trabajo en $TRABAJO ==="
mkdir -p "$TRABAJO/supabase/migrations" "$TRABAJO/supabase/.temp"
cp "$RAIZ/supabase/config.toml" "$TRABAJO/supabase/"
for f in postgres-version rest-version gotrue-version storage-version; do
  [ -f "$RAIZ/supabase/.temp/$f" ] && cp "$RAIZ/supabase/.temp/$f" "$TRABAJO/supabase/.temp/"
done
for f in project-ref linked-project.json pooler-url; do
  [ -e "$TRABAJO/supabase/.temp/$f" ] && { echo "ABORTADO: la copia quedó enlazada ($f)."; exit 2; }
done
for f in "$RAIZ"/supabase/migrations/*.sql; do
  [ "$(basename "$f")" = "$M" ] || cp "$f" "$TRABAJO/supabase/migrations/"
done
[ "$(ls "$TRABAJO/supabase/migrations" | wc -l)" -eq 9 ] && ok "9 migraciones anteriores copiadas" || mal "no son 9 migraciones"

echo "=== 1. Stack local nuevo con las 9 migraciones ==="
( cd "$TRABAJO" && $CLI stop --no-backup >/dev/null 2>&1
  $CLI start -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor >/dev/null 2>&1 ) \
  || { echo "No arrancó el stack local."; exit 1; }
docker ps --format '{{.Names}} {{.Image}}' | grep Yeny_Oficial | sed 's/^/  /'
[ "$(migraciones)" = "9 20261107020000" ] && ok "aplicadas las 9 anteriores" || mal "migraciones: $(migraciones)"
docker exec -i supabase_db_Yeny_Oficial psql -X -q -U postgres -d postgres -tA < "$RAIZ/supabase/pruebas/reproducir/datos_previos.sql" | sed 's/^/  /'
volcado > "$TRABAJO/esquema-9.sql"

echo "=== 2. db push con una talla no válida: debe fallar sin dejar nada ==="
cp "$RAIZ/supabase/migrations/$M" "$TRABAJO/supabase/migrations/"
destino_local
( cd "$TRABAJO" && $CLI db push --yes > "$TRABAJO/push1.txt" 2>&1 ) && mal "db push debía fallar" || ok "db push falla"
grep -q "30000000-0f2a-0000-0000-000000000005 'foo'" "$TRABAJO/push1.txt" && ok "el error enumera la talla 'foo'" || mal "el error no enumera la talla"
[ "$(migraciones)" = "9 20261107020000" ] && ok "siguen 9 migraciones" || mal "migraciones: $(migraciones)"
volcado | cmp -s - "$TRABAJO/esquema-9.sql" && ok "esquema public idéntico" || mal "el esquema cambió"

echo "=== 3. Dato corregido a mano y archivo saboteado al final: debe fallar sin dejar nada ==="
sqlq "delete from public.tallas where id = '30000000-0f2a-0000-0000-000000000005'" >/dev/null && ok "talla 'foo' retirada (mantenimiento, como postgres)"
printf '\n-- SABOTAJE (solo en la copia temporal)\ndo $$ begin raise exception %s; end $$;\n' "'SABOTAJE al final del archivo'" >> "$TRABAJO/supabase/migrations/$M"
destino_local
( cd "$TRABAJO" && $CLI db push --yes > "$TRABAJO/push2.txt" 2>&1 ) && mal "db push debía fallar" || ok "db push falla"
grep -q 'SABOTAJE al final del archivo' "$TRABAJO/push2.txt" && ok "falla por el sabotaje, tras pasar la comprobación final" || mal "falla por otro motivo"
volcado | cmp -s - "$TRABAJO/esquema-9.sql" && ok "esquema public idéntico" || mal "el esquema cambió"

echo "=== 4. db push real ==="
cp "$RAIZ/supabase/migrations/$M" "$TRABAJO/supabase/migrations/"
destino_local
( cd "$TRABAJO" && $CLI db push --yes > "$TRABAJO/push3.txt" 2>&1 ) && ok "db push aplica la migración" || { mal "db push falló"; cat "$TRABAJO/push3.txt"; }
[ "$(migraciones)" = "10 20261107030000" ] && ok "10 migraciones" || mal "migraciones: $(migraciones)"
[ "$(sqlq "select has_table_privilege('authenticated','public.tallas','DELETE')")" = "f" ] && ok "authenticated sin DELETE en tallas" || mal "authenticated conserva DELETE"
volcado > "$TRABAJO/esquema-10.sql"
diff "$TRABAJO/esquema-9.sql" "$TRABAJO/esquema-10.sql" | grep '^[<>] *GRANT' | sed 's/^/  /'
docker exec -i supabase_db_Yeny_Oficial psql -X -q -U postgres -d postgres <<'SQL'
begin; set local role anon;
select v->'tallasDisponibles' as disponibles,
       (select jsonb_agg(t->>'talla') from jsonb_array_elements(v->'tallas') t) as orden
  from public.catalogo_publico c, jsonb_array_elements(c.variantes) v where c.nombre = 'PREVIO 14F2';
rollback;
SQL

echo "=== 5. Repetir el archivo ==="
docker exec -i supabase_db_Yeny_Oficial psql -X -q -1 -v ON_ERROR_STOP=1 -U postgres -d postgres < "$RAIZ/supabase/migrations/$M" \
  && ok "segunda ejecución sin error" || mal "la segunda ejecución falló"
volcado | cmp -s - "$TRABAJO/esquema-10.sql" && ok "esquema idéntico tras repetir" || mal "el esquema cambió al repetir"
destino_local
( cd "$TRABAJO" && $CLI db push --yes 2>&1 ) | grep -q 'up to date' && ok "db push no la reaplica" || mal "db push quiso reaplicar"

echo
if [ "$fallos" -eq 0 ]; then echo "CICLO: sin fallos."; else echo "CICLO: $fallos fallo(s)."; fi
echo "El stack local sigue en marcha. Para detenerlo y borrar sus datos: (cd \"$TRABAJO\" && $CLI stop --no-backup)"
exit "$fallos"
