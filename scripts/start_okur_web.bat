@echo off
rem Okur ERP: PostgreSQL (5433), API (8001) ve arayuzu (3001, uretim modu) baslatir, uygulama penceresinde acar.
for %%I in ("%~dp0..") do set "ROOT=%%~fI"
set "PGBIN=%ROOT%\local-data\pgvenv\Lib\site-packages\pgserver\pginstall\bin"
set "NOWIN="
if /i "%~1"=="/nowindow" set "NOWIN=1"
title Okur ERP aciliyor
echo Okur ERP aciliyor, lutfen bekleyin...

rem Portlarda baska bir kopya, gelistirme sunucusu ya da eski kodla calisan API varsa kapatilir;
rem boylece asagida her zaman bu klasordeki guncel surum baslar.
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\ensure_own_servers.ps1"

rem PostgreSQL
"%PGBIN%\pg_ctl.exe" status -D "%ROOT%\local-data\pgdata" >nul 2>&1
if errorlevel 1 "%PGBIN%\pg_ctl.exe" start -D "%ROOT%\local-data\pgdata" -l "%ROOT%\local-data\postgres.log" -o "-p 5433 -c listen_addresses=127.0.0.1" -w

rem API
netstat -ano | findstr /r /c:"127.0.0.1:8001 .*LISTENING" >nul
if errorlevel 1 start "Okur ERP - API (8001)" /d "%ROOT%\apps\backend" "%ROOT%\apps\backend\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8001

rem Web (uretim modu): kod degistiyse once derlenir, sonra hazir derleme calistirilir.
rem Arayuz sunucusu acik kalmis ama kod degismisse, eski sunucu kapatilir ki yeni surum derlenip acilsin.
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\build_web_if_needed.ps1" -CheckOnly >nul 2>&1
if errorlevel 2 (
    echo Kod degismis; calisan arayuz yenileniyor...
    powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1
    timeout /t 2 /nobreak >nul
)
netstat -ano | findstr /r /c:"127.0.0.1:3001 .*LISTENING" >nul
if errorlevel 1 (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\build_web_if_needed.ps1"
    if errorlevel 1 (
        echo Arayuz derlenemedi. Ayrintilar yukarida.
        if not defined NOWIN pause
        exit /b 1
    )
    start "Okur ERP - Web (3001)" /d "%ROOT%\apps\frontend\.next-prod\standalone" cmd /c "set PORT=3001&& set HOSTNAME=127.0.0.1&& node "%ROOT%\apps\frontend\.next-prod\standalone\server.js""
)

rem Pencere, API ve arayuz yanit vermeye baslayinca acilir (en fazla ~3 dakika beklenir).
echo Sunucularin hazir olmasi bekleniyor...
set /a TRIES=0
:bekle
set /a TRIES+=1
powershell -NoProfile -Command "try { $null = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8001/health -TimeoutSec 5; $null = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3001/login -TimeoutSec 10; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto hazir
if %TRIES% GEQ 90 (
    echo Sunucular zamaninda acilmadi. "Okur ERP - API" ve "Okur ERP - Web" pencerelerindeki hatalara bakin.
    if not defined NOWIN pause
    exit /b 1
)
timeout /t 2 /nobreak >nul
goto bekle
:hazir
rem /nowindow: sunucular hazir olunca pencere acmadan biter (gelistirme sirasinda yeniden derleme icin).
if defined NOWIN exit /b 0

rem Adres cubugu ve sekmeler olmadan, ayri bir uygulama penceresi (Chrome/Edge --app).
set "URL=http://localhost:3001"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if exist "%CHROME%" (
    start "" "%CHROME%" --app=%URL% --window-size=1366,800
) else if exist "%EDGE%" (
    start "" "%EDGE%" --app=%URL% --window-size=1366,800
) else (
    start "" %URL%
)
