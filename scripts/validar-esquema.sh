#!/usr/bin/env bash
# Etapa 13 · Valida el esquema de cabo a rabo en un PostgreSQL local desechable.
# Etapa 14f.2 · Cada batería se ejecuta UNA vez por pasada, se muestra su salida completa y se
# respeta su código de salida: un error de psql, de conexión o de la tubería cuenta como fallo.
# No toca producción, no necesita cuenta de Supabase y no modifica el catálogo.
#
#   bash scripts/validar-esquema.sh            valida y deja la base en pie
#   bash scripts/validar-esquema.sh --limpiar  valida y elimina el contenedor
#
# CONTENEDOR y PUERTO se pueden cambiar para no tocar un contenedor que ya exista:
#   CONTENEDOR=gt-pg-otro PUERTO=55433 bash scripts/validar-esquema.sh
set -u
set -o pipefail

CONTENEDOR="${CONTENEDOR:-gt-pg13}"
PUERTO="${PUERTO:-55432}"
BASE=gamaytalla
IMAGEN=postgres:17-alpine
TIENDA="${TIENDA:-http://127.0.0.1:8765/?intro=no}"
fallos=0
REGISTRO="$(mktemp -d)"
trap 'rm -rf "$REGISTRO"' EXIT

titulo() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
psql_() { docker exec -i "$CONTENEDOR" psql -X -U postgres -d "$BASE" "$@"; }
fallo() { echo "  -> FALLO: $1"; fallos=$((fallos+1)); }

# Ejecuta un archivo SQL una sola vez, muestra TODA su salida y decide por el código de
# salida de psql y por el contenido: FALLA o ERROR en la salida, o ninguna comprobación OK,
# no pueden terminar en «Sin fallos».
bateria() {
  local nombre="$1" archivo="$2" salida="$REGISTRO/$(basename "$2").txt" codigo oks
  titulo "$nombre"
  if [ ! -f "$archivo" ]; then fallo "no existe $archivo"; return; fi
  psql_ -q -v ON_ERROR_STOP=1 < "$archivo" > "$salida" 2>&1
  codigo=$?
  sed -e 's/^NOTICE:  //' -e 's/^/  /' "$salida"
  oks=$(grep -c '^NOTICE:  OK ' "$salida")
  if [ "$codigo" -ne 0 ]; then
    fallo "psql terminó con código $codigo"
  elif grep -qE 'FALLA|ERROR' "$salida"; then
    fallo "la salida contiene FALLA o ERROR"
  elif [ "$oks" -eq 0 ]; then
    fallo "ninguna comprobación OK: una batería vacía no cuenta como superada"
  else
    echo "  -> $oks comprobaciones OK, código $codigo"
  fi
}

titulo "1. PostgreSQL local ($CONTENEDOR, puerto $PUERTO)"
if ! docker info >/dev/null 2>&1; then
  echo "Docker no responde. Arranca Docker Desktop y repite."; exit 1
fi
docker rm -f "$CONTENEDOR" >/dev/null 2>&1
if ! docker run -d --name "$CONTENEDOR" -e POSTGRES_PASSWORD=validacion \
     -e POSTGRES_DB="$BASE" -p "$PUERTO":5432 "$IMAGEN" >/dev/null; then
  echo "No se pudo crear el contenedor $CONTENEDOR."; exit 1
fi
listo=0
for _ in $(seq 1 60); do
  docker exec "$CONTENEDOR" pg_isready -U postgres -d "$BASE" >/dev/null 2>&1 && { listo=1; break; }
  sleep 1
done
# pg_isready responde antes de que termine la inicialización: se espera a una consulta real.
for _ in $(seq 1 30); do
  psql_ -tAc "select 1" >/dev/null 2>&1 && break
  sleep 1
done
if [ "$listo" -ne 1 ] || ! psql_ -tAc "select 'motor: ' || version()" | cut -c1-60; then
  echo "PostgreSQL no respondió en $CONTENEDOR."; exit 1
fi

titulo "2. Entorno que Supabase ya trae (solo local)"
if psql_ -q -v ON_ERROR_STOP=1 < supabase/local/00_entorno_supabase.sql; then
  echo "roles anon/authenticated/service_role, auth.uid() y pgcrypto en «extensions» listos"
else
  fallo "no se pudo preparar el entorno"
fi

titulo "3. Migraciones (en orden, una vez)"
for f in supabase/migrations/*.sql; do
  printf '%-56s ' "$(basename "$f")"
  if psql_ -q -v ON_ERROR_STOP=1 < "$f" > "$REGISTRO/migracion.txt" 2>&1; then
    echo "OK"
    grep -E '^NOTICE' "$REGISTRO/migracion.txt" | sed 's/^/    /'
  else
    echo "FALLO"; sed 's/^/    /' "$REGISTRO/migracion.txt"; fallos=$((fallos+1))
  fi
done

titulo "4. Migración en seco de los 28 productos"
if curl -s -o /dev/null --max-time 4 "${TIENDA%%\?*}"; then
  node scripts/migracion-en-seco.mjs "$TIENDA" || fallo "migracion-en-seco.mjs"
  psql_ -q -v ON_ERROR_STOP=1 < supabase/local/semilla-28-productos.sql || fallo "semilla-28-productos.sql"
  psql_ -tA -c "select 'cargado: ' || (select count(*) from productos) || ' productos, '
                   || (select count(*) from tallas) || ' tallas, codigos '
                   || (select min(codigo_interno) from productos) || '..'
                   || (select max(codigo_interno) from productos)" || fallo "recuento de la carga"
  psql_ -tA -v ON_ERROR_STOP=1 > supabase/local/vista-publica.json <<'SQL' || fallo "lectura de catalogo_publico"
select jsonb_pretty(jsonb_build_object('productos',
  coalesce(jsonb_agg(to_jsonb(c) order by c.orden), '[]'::jsonb))) from public.catalogo_publico c;
SQL

  titulo "5. Verificación contra la tienda real y el carrito V3"
  node scripts/verificar-migracion.mjs "$TIENDA" || fallo "verificar-migracion.mjs"
else
  echo "La tienda no responde en $TIENDA."
  echo "Arranca:  python -m http.server 8765 --bind 127.0.0.1"
  fallo "tienda no disponible: secciones 4 y 5 sin ejecutar"
fi

bateria "6. Pruebas de vigencia y fechas" supabase/pruebas/10_vigencia.sql
bateria "7. Pruebas de RLS y privilegios" supabase/pruebas/20_seguridad.sql
bateria "8. Endurecimiento de funciones" supabase/pruebas/30_endurecimiento.sql
bateria "9. Acceso a los datos internos" supabase/pruebas/40_acceso_interno.sql
bateria "10. Integridad de tallas y vigencia (14f.2)" supabase/pruebas/60_integridad_tallas_vigencia.sql
bateria "10b. Catálogo desde el panel y políticas de fotos (etapa 16)" supabase/pruebas/70_catalogo_admin.sql
bateria "10c. Códigos editables y mayúsculas (etapa 16.2)" supabase/pruebas/90_codigos_editables.sql
bateria "10d. Público y muestras de color (etapa 16.3)" supabase/pruebas/91_publico_y_muestras.sql

titulo "11. Auditoría de funciones (solo lectura; cero filas = sin hallazgos)"
if psql_ -tA -F ' | ' -v ON_ERROR_STOP=1 < supabase/pruebas/auditar_funciones.sql > "$REGISTRO/auditoria.txt" 2>&1; then
  sed 's/^/  /' "$REGISTRO/auditoria.txt"
  filas=$(grep -c . "$REGISTRO/auditoria.txt")
  if [ "$filas" -eq 0 ]; then echo "  -> 0 filas: sin hallazgos"; else fallo "$filas hallazgo(s)"; fi
else
  sed 's/^/  /' "$REGISTRO/auditoria.txt"; fallo "la auditoría no se pudo ejecutar"
fi

titulo "Resultado"
if [ "$fallos" -eq 0 ]; then echo "Sin fallos."; else echo "$fallos bloque(s) con fallos."; fi
[ "${1:-}" = "--limpiar" ] && docker rm -f "$CONTENEDOR" >/dev/null && echo "contenedor eliminado"
exit "$fallos"
