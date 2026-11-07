#!/usr/bin/env bash
# Etapa 13 · Valida el esquema de cabo a rabo en un PostgreSQL local desechable.
# No toca producción, no necesita cuenta de Supabase y no modifica el catálogo.
#
#   bash scripts/validar-esquema.sh            valida y deja la base en pie
#   bash scripts/validar-esquema.sh --limpiar  valida y elimina el contenedor
set -u

CONTENEDOR=gt-pg13
BASE=gamaytalla
IMAGEN=postgres:17-alpine
TIENDA="${TIENDA:-http://127.0.0.1:8765/?intro=no}"
fallos=0

titulo() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
psql_() { docker exec -i "$CONTENEDOR" psql -U postgres -d "$BASE" "$@"; }

titulo "1. PostgreSQL local"
if ! docker info >/dev/null 2>&1; then
  echo "Docker no responde. Arranca Docker Desktop y repite."; exit 1
fi
docker rm -f "$CONTENEDOR" >/dev/null 2>&1
docker run -d --name "$CONTENEDOR" -e POSTGRES_PASSWORD=validacion \
  -e POSTGRES_DB="$BASE" -p 55432:5432 "$IMAGEN" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$CONTENEDOR" pg_isready -U postgres -d "$BASE" >/dev/null 2>&1 && break
  sleep 1
done
psql_ -tAc "select 'motor: ' || version()" | cut -c1-60

titulo "2. Entorno que Supabase ya trae (solo local)"
psql_ -q -v ON_ERROR_STOP=1 < supabase/local/00_entorno_supabase.sql && echo "roles anon/authenticated/service_role y auth.uid() listos"

titulo "3. Migraciones"
for f in supabase/migrations/*.sql; do
  printf '%-48s ' "$(basename "$f")"
  if psql_ -q -v ON_ERROR_STOP=1 < "$f" 2>/tmp/gt-err; then echo "OK"; else
    echo "FALLO"; sed 's/^/    /' /tmp/gt-err | head -5; fallos=$((fallos+1))
  fi
done

titulo "4. Migración en seco de los 28 productos"
if curl -s -o /dev/null --max-time 4 "${TIENDA%%\?*}"; then
  node scripts/migracion-en-seco.mjs "$TIENDA" || fallos=$((fallos+1))
  psql_ -q -v ON_ERROR_STOP=1 < supabase/local/semilla-28-productos.sql || fallos=$((fallos+1))
  psql_ -tA -c "select 'cargado: ' || (select count(*) from productos) || ' productos, '
                   || (select count(*) from tallas) || ' tallas, codigos '
                   || (select min(codigo_interno) from productos) || '..'
                   || (select max(codigo_interno) from productos)"
  psql_ -tA > supabase/local/vista-publica.json <<'SQL'
select jsonb_pretty(jsonb_build_object('productos',
  coalesce(jsonb_agg(to_jsonb(c) order by c.orden), '[]'::jsonb))) from public.catalogo_publico c;
SQL

  titulo "5. Verificación contra la tienda real y el carrito V3"
  node scripts/verificar-migracion.mjs "$TIENDA" || fallos=$((fallos+1))
else
  echo "La tienda no responde en $TIENDA."
  echo "Arranca:  python -m http.server 8765 --bind 127.0.0.1"
  fallos=$((fallos+1))
fi

titulo "6. Pruebas de vigencia y fechas"
psql_ -q < supabase/pruebas/10_vigencia.sql 2>&1 | grep -E 'OK |FALLA' | sed 's/^NOTICE:  //'
psql_ -q < supabase/pruebas/10_vigencia.sql 2>&1 | grep -q FALLA && fallos=$((fallos+1))

titulo "7. Pruebas de RLS y privilegios"
psql_ -q < supabase/pruebas/20_seguridad.sql 2>&1 | grep -E 'OK |FALLA' | sed 's/^NOTICE:  //'
psql_ -q < supabase/pruebas/20_seguridad.sql 2>&1 | grep -q FALLA && fallos=$((fallos+1))

titulo "8. Endurecimiento de funciones"
psql_ -q < supabase/pruebas/30_endurecimiento.sql 2>&1 | grep -E 'OK |FALLA|ERROR' | sed 's/^NOTICE:  //' | tail -3
psql_ -q < supabase/pruebas/30_endurecimiento.sql 2>&1 | grep -qE 'FALLA|ERROR' && fallos=$((fallos+1))

titulo "9. Acceso a los datos internos"
psql_ -q < supabase/pruebas/40_acceso_interno.sql 2>&1 | grep -E 'OK |FALLA|ERROR' | sed 's/^NOTICE:  //' | tail -3
psql_ -q < supabase/pruebas/40_acceso_interno.sql 2>&1 | grep -qE 'FALLA|ERROR' && fallos=$((fallos+1))

titulo "Resultado"
if [ "$fallos" -eq 0 ]; then echo "Sin fallos."; else echo "$fallos bloque(s) con fallos."; fi
[ "${1:-}" = "--limpiar" ] && docker rm -f "$CONTENEDOR" >/dev/null && echo "contenedor eliminado"
exit "$fallos"
