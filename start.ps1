# ==============================================================================
# ORCA FINANCIAL — MASTER STARTUP SCRIPT (1 PORT DUY NHẤT: 3000)
# ==============================================================================
param(
  [int]$Port = 3000,
  [switch]$Prod
)

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
Set-Location $repoRoot

$env:PORT = "$Port"
$env:LOCAL_GGUF_BASE_URL = "http://127.0.0.1:8080/v1"
$env:LOCAL_GGUF_MODEL = "orca-financial-qwen2.5-3b"
$env:LOCAL_GGUF_PATH = "models/orca-financial-qwen2.5-3b-q4_k_m.gguf"
$env:LOCAL_GGUF_PRIORITY = "primary"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   ORCA FINANCIAL — UNIFIED SINGLE-PORT MASTER TERMINAL     " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  🌐 Gateway & Web Dashboard: http://localhost:$Port" -ForegroundColor White
Write-Host "  🤖 AI Chat Endpoint:       http://localhost:$Port/api/ask-orca" -ForegroundColor White
Write-Host "  ⚡ OpenAI API v1:          http://localhost:$Port/v1/chat/completions" -ForegroundColor White
Write-Host "  🩺 Model Healthcheck:      http://localhost:$Port/model-health" -ForegroundColor White
Write-Host "  🧠 Local Engine:           orca-financial-qwen2.5-3b-q4_k_m.gguf" -ForegroundColor DarkGray
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

if ($Prod) {
  $env:NODE_ENV = "production"
  $env:START_PROD = "true"
  if (-not (Test-Path "dist\index.html")) {
    Write-Host "[Build] Chua co dist/index.html, dang build SPA bundle..." -ForegroundColor Yellow
    npm run build
  }
}

npm start

