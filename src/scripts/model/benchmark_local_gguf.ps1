param(
  [string]$BaseUrl = "http://127.0.0.1:8080/v1",
  [string]$Model = "orca-fa-qwen2.5-3b",
  [int]$Runs = 3
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   ORCA-FA GGUF LOCAL C++ INFERENCE BENCHMARK (CPU x64)   " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Target Endpoint: $BaseUrl/chat/completions"
Write-Host "Target Model   : $Model"
Write-Host "Runs per prompt: $Runs"
Write-Host ""

# 1. Health check
try {
  $healthUrl = $BaseUrl.Replace("/v1", "/health")
  $health = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 3
  Write-Host "[Health Check] Server is active! Status: $($health.status)" -ForegroundColor Green
} catch {
  Write-Warning "[Health Check] llama-server does not appear to be running at $BaseUrl."
  Write-Host "Tip: Start server via: powershell -ExecutionPolicy Bypass -File src/scripts/model/start_gguf_server.ps1"
  exit 1
}

# 2. Benchmark Queries
$benchmarks = @(
  @{
    Name = "Screener Multi-Factor"
    Prompt = "Hãy tìm cho tôi những cổ phiếu có tiêu chí ROE > 20%, P/E < 12 và nợ thấp."
  },
  @{
    Name = "Forensic Red Flags"
    Prompt = "Vì sao doanh nghiệp bất động sản báo lãi đột biến nhưng dòng tiền thuần HĐKD (CFO) lại âm sâu? Nhận diện bẫy lợi nhuận giấy như thế nào?"
  },
  @{
    Name = "Commodity Macro Transmission"
    Prompt = "Giá dầu thô Brent tăng vượt 90 USD/thùng thì chuỗi cổ phiếu dầu khí PVD, PVS, BSR hưởng lợi như thế nào?"
  }
)

$results = @()

foreach ($bench in $benchmarks) {
  Write-Host "--- Benchmarking: $($bench.Name) ---" -ForegroundColor Yellow
  $latencies = @()
  $tokenCounts = @()

  for ($i = 1; $i -le $Runs; $i++) {
    $body = @{
      model = $Model
      messages = @(
        @{ role = "system"; content = "Bạn là ORCA FA AI, chuyên gia tài chính định lượng và phân tích cơ bản." },
        @{ role = "user"; content = $bench.Prompt }
      )
      temperature = 0.7
      max_tokens = 512
    } | ConvertTo-Json -Depth 5

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
      $response = Invoke-RestMethod -Uri "$BaseUrl/chat/completions" -Method Post -Body $body -ContentType "application/json; charset=utf-8" -TimeoutSec 60
      $sw.Stop()
      $elapsedMs = $sw.ElapsedMilliseconds
      $tokens = $response.usage.completion_tokens
      $tps = [math]::Round(($tokens / ($elapsedMs / 1000)), 2)

      $latencies += $elapsedMs
      $tokenCounts += $tokens
      Write-Host "  Run $i : ${elapsedMs}ms | Tokens: $tokens | Speed: $tps tokens/s" -ForegroundColor Gray
    } catch {
      $sw.Stop()
      Write-Warning "  Run $i failed: $_"
    }
  }

  if ($latencies.Count -gt 0) {
    $avgLatency = [math]::Round(($latencies | Measure-Object -Average).Average, 1)
    $avgTokens = [math]::Round(($tokenCounts | Measure-Object -Average).Average, 1)
    $avgTps = [math]::Round(($avgTokens / ($avgLatency / 1000)), 2)

    $results += [PSCustomObject]@{
      Scenario = $bench.Name
      AvgLatencyMs = $avgLatency
      AvgTokens = $avgTokens
      TokensPerSec = $avgTps
    }
  }
}

Write-Host ""
Write-Host "=================== BENCHMARK SUMMARY ===================" -ForegroundColor Cyan
$results | Format-Table -AutoSize

# Check llama-server RAM usage
$llamaProcess = Get-Process -Name "llama-server" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($llamaProcess) {
  $ramMb = [math]::Round($llamaProcess.WorkingSet64 / 1MB, 1)
  Write-Host "Memory Usage: llama-server.exe is consuming $ramMb MB RAM." -ForegroundColor Green
}
Write-Host "Benchmark complete!" -ForegroundColor Cyan
