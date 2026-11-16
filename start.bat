@echo off
title Orca Financial Unified Server
echo ============================================================
echo   ORCA FINANCIAL -- UNIFIED MASTER TERMINAL (PORT 3000)
echo ============================================================
echo   Web UI ^& Dashboard: http://localhost:3000
echo   AI Assistant:      http://localhost:3000/api/ask-orca
echo   OpenAI Endpoint:   http://localhost:3000/v1/chat/completions
echo   Model Health:      http://localhost:3000/model-health
echo ============================================================
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
