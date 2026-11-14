param(
  [int]$GgufPort = 8080,
  [int]$ContextSize = 4096,
  [int]$Threads = 4
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$modelsDir = Join-Path $repoRoot "models"
$binDir = Join-Path $modelsDir "bin"
$ggufPath = Join-Path $modelsDir "orca-fa-qwen2.5-3b-q4_k_m.gguf"

$llamaProc = $null

try {
  if (Test-Path $ggufPath) {
    $llamaServer = Get-Command llama-server -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
    if (-not $llamaServer) {
      $localExe = Get-ChildItem -Path $binDir -Recurse -Filter "llama-server.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($localExe) { $llamaServer = $localExe.FullName }
    }

    if (-not $llamaServer) {
      Write-Host "[Orca GGUF] Dang tai llama-server.exe (chay truc tiep GGUF, khong can Ollama)..."
      New-Item -ItemType Directory -Path $binDir -Force | Out-Null
      $headers = @{ "User-Agent" = "orca-fa-local-gguf" }
      $release = Invoke-RestMethod -Uri "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest" -Headers $headers
      $asset = $release.assets | Where-Object {
        $_.name -match "bin-win-cpu-x64\.zip$" -or ($_.name -match "win" -and $_.name -match "x64" -and $_.name -match "cpu" -and $_.name -match "\.zip$")
      } | Select-Object -First 1

      if ($asset) {
        $zipPath = Join-Path $binDir $asset.name
        Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath -Headers $headers
        Expand-Archive -Path $zipPath -DestinationPath $binDir -Force
        Remove-Item $zipPath -Force
        $localExe = Get-ChildItem -Path $binDir -Recurse -Filter "llama-server.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($localExe) { $llamaServer = $localExe.FullName }
      }
    }

    if ($llamaServer) {
      Write-Host "[Orca GGUF] Khoi dong C++ Engine ngam tai loopback noi bo (Port $GgufPort)..."
      $llamaArgs = @(
        "-m", $ggufPath,
        "--alias", "orca-fa-qwen2.5-3b",
        "--host", "127.0.0.1",
        "--port", "$GgufPort",
        "-c", "$ContextSize",
        "-t", "$Threads"
      )
      $llamaProc = Start-Process -FilePath $llamaServer -ArgumentList $llamaArgs -PassThru -WindowStyle Hidden

      # Wait briefly for llama-server /health before launching Next.js
      for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 500
        try {
          $h = Invoke-WebRequest -Uri "http://127.0.0.1:$GgufPort/health" -UseBasicParsing -TimeoutSec 2
          if ($h.StatusCode -eq 200) {
            Write-Host "[Orca GGUF] Model da san sang ket noi!"
            break
          }
        } catch {
          # Still loading model into RAM
        }
      }

      $env:INTERNAL_GGUF_PORT = "$GgufPort"
      if (-not $env:LOCAL_GGUF_BASE_URL) { $env:LOCAL_GGUF_BASE_URL = "http://127.0.0.1:$GgufPort/v1" }
      if (-not $env:LOCAL_GGUF_MODEL) { $env:LOCAL_GGUF_MODEL = "orca-fa-qwen2.5-3b" }
      if (-not $env:LOCAL_GGUF_PRIORITY) { $env:LOCAL_GGUF_PRIORITY = "primary" }

      Write-Host ""
      Write-Host "============================================================" -ForegroundColor Cyan
      Write-Host "  ORCA-FA SINGLE GATEWAY (1 PORT DUY NHAT: 3000)" -ForegroundColor Green
      Write-Host "  - Web UI & Dashboard: http://localhost:3000" -ForegroundColor White
      Write-Host "  - AI Chat Endpoint:   http://localhost:3000/api/ask-orca" -ForegroundColor White
      Write-Host "  - OpenAI /v1 API:     http://localhost:3000/v1/chat/completions" -ForegroundColor White
      Write-Host "  - Model Healthcheck:  http://localhost:3000/model-health" -ForegroundColor White
      Write-Host "  - Backend Engine:     C++ Qwen2.5-3B Q4_K_M (Internal Loopback)" -ForegroundColor DarkGray
      Write-Host "============================================================" -ForegroundColor Cyan
      Write-Host ""
    } else {
      Write-Warning "[Orca GGUF] Khong tim thay llama-server.exe; chay Web UI o che do mac dinh."
    }
  } else {
    Write-Host "[Orca GGUF] Chua co $ggufPath; chay Web UI o che do mac dinh."
  }

  Push-Location $repoRoot
  try {
    & npx next dev --webpack -p 3000 -H 0.0.0.0
  } finally {
    Pop-Location
  }
} finally {
  if ($llamaProc -and -not $llamaProc.HasExited) {
    Write-Host "[Orca GGUF] Dang dung llama-server va giai phong RAM..."
    Stop-Process -Id $llamaProc.Id -Force -ErrorAction SilentlyContinue
  }
}
