# Abre el panel privado de Gama & Talla en local (etapa 15A).
# Arranca el servidor estático en 127.0.0.1:8765 si no está en marcha y abre /admin/.
#   powershell -ExecutionPolicy Bypass -File scripts\abrir-panel.ps1
$raiz = Split-Path -Parent $PSScriptRoot
$url = "http://127.0.0.1:8765/admin/"

if (-not (Test-Path (Join-Path $raiz "admin\config.js"))) {
  Write-Host "Falta admin\config.js. Copia admin\config.ejemplo.js como admin\config.js y complétalo (ver admin\LEEME.md)."
}

$enMarcha = $false
try { $enMarcha = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 $url).StatusCode -eq 200 } catch { $enMarcha = $false }

if (-not $enMarcha) {
  $python = (Get-Command python -ErrorAction SilentlyContinue).Source
  if (-not $python) { Write-Host "No se encontró Python. Instálalo o sirve la carpeta del proyecto con otro servidor estático."; exit 1 }
  Start-Process -FilePath $python -ArgumentList "-m", "http.server", "8765", "--bind", "127.0.0.1" -WorkingDirectory $raiz -WindowStyle Minimized
  for ($i = 0; $i -lt 20 -and -not $enMarcha; $i++) {
    Start-Sleep -Milliseconds 300
    try { $enMarcha = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 $url).StatusCode -eq 200 } catch { }
  }
  if (-not $enMarcha) { Write-Host "El servidor no respondió en $url."; exit 1 }
  Write-Host "Servidor iniciado en http://127.0.0.1:8765 (ciérralo cerrando su ventana de Python)."
}

Write-Host "Abriendo $url"
Start-Process $url
