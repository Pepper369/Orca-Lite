param(
  [string]$BundlePath = "",
  [string]$TargetDir = "models"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$modelsDir = if ([System.IO.Path]::IsPathRooted($TargetDir)) { $TargetDir } else { Join-Path $repoRoot $TargetDir }
if (-not (Test-Path $modelsDir)) {
  New-Item -ItemType Directory -Path $modelsDir -Force | Out-Null
}

$targetGguf = Join-Path $modelsDir "orca-fa-qwen2.5-3b-q4_k_m.gguf"

if (-not $BundlePath) {
  $candidates = @(
    (Join-Path $env:USERPROFILE "Downloads\orca-fa-gguf-bundle.zip"),
    (Join-Path $env:USERPROFILE "Downloads\orca-fa-qwen2.5-3b-q4_k_m.gguf"),
    (Join-Path $modelsDir "orca-fa-gguf-bundle.zip"),
    $targetGguf
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) {
      $BundlePath = $c
      break
    }
  }
}

if (-not $BundlePath -or -not (Test-Path $BundlePath)) {
  Write-Error "Khong tim thay orca-fa-gguf-bundle.zip hoac orca-fa-qwen2.5-3b-q4_k_m.gguf trong Downloads hoac models/. Hay truyen -BundlePath <duong_dan>."
  exit 1
}

Write-Host "[1/3] Nguon model: $BundlePath"
if ($BundlePath.ToLower().EndsWith(".zip")) {
  $tempExtract = Join-Path $modelsDir "_tmp_extract"
  if (Test-Path $tempExtract) { Remove-Item $tempExtract -Recurse -Force }
  Expand-Archive -Path $BundlePath -DestinationPath $tempExtract -Force
  $ggufFile = Get-ChildItem -Path $tempExtract -Recurse -Filter "*.gguf" | Select-Object -First 1
  if (-not $ggufFile) {
    Remove-Item $tempExtract -Recurse -Force
    Write-Error "Khong tim thay file .gguf ben trong $BundlePath"
    exit 1
  }
  Move-Item -Path $ggufFile.FullName -Destination $targetGguf -Force
  $adapterZip = Get-ChildItem -Path $tempExtract -Recurse -Filter "*lora-adapter*.zip" | Select-Object -First 1
  if ($adapterZip) {
    Copy-Item -Path $adapterZip.FullName -Destination (Join-Path $modelsDir $adapterZip.Name) -Force
  }
  Remove-Item $tempExtract -Recurse -Force
} elseif ((Resolve-Path $BundlePath).Path -ne (Resolve-Path $targetGguf -ErrorAction SilentlyContinue).Path) {
  Copy-Item -Path $BundlePath -Destination $targetGguf -Force
}

Write-Host "[2/3] Kiem tra header GGUF..."
$bytes = [System.IO.File]::ReadAllBytes($targetGguf)[0..7]
$magic = [System.Text.Encoding]::ASCII.GetString($bytes[0..3])
if ($magic -ne "GGUF") {
  Write-Error "File khong dung dinh dang GGUF (magic='$magic')"
  exit 1
}
$sizeMb = [Math]::Round((Get-Item $targetGguf).Length / 1MB, 1)
Write-Host "OK: $targetGguf ($sizeMb MB, magic=GGUF)"

Write-Host "[3/3] Huong dan kich hoat trong Orca-FA (khong can Ollama):"
Write-Host "  powershell -ExecutionPolicy Bypass -File src/scripts/model/start_gguf_server.ps1"
Write-Host "  LOCAL_GGUF_BASE_URL=http://127.0.0.1:8080/v1"
Write-Host "  LOCAL_GGUF_MODEL=orca-fa-qwen2.5-3b"
Write-Host "  LOCAL_GGUF_PRIORITY=primary"

