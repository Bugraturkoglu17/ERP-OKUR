@echo off
rem Okur ERP: PostgreSQL (5433), API (8001) ve arayuzu (3001) baslatir, tarayicida acar.
set "ROOT=%~dp0.."
set "PGBIN=%ROOT%\local-data\pgvenv\Lib\site-packages\pgserver\pginstall\bin"

rem PostgreSQL
"%PGBIN%\pg_ctl.exe" status -D "%ROOT%\local-data\pgdata" >nul 2>&1
if errorlevel 1 "%PGBIN%\pg_ctl.exe" start -D "%ROOT%\local-data\pgdata" -l "%ROOT%\local-data\postgres.log" -o "-p 5433 -c listen_addresses=127.0.0.1" -w

rem API
netstat -ano | findstr /r /c:"127.0.0.1:8001 .*LISTENING" >nul
if errorlevel 1 start "Okur ERP - API (8001)" /d "%ROOT%\apps\backend" .venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8001

rem Web
netstat -ano | findstr /r /c:"127.0.0.1:3001 .*LISTENING" >nul
if errorlevel 1 (
    start "Okur ERP - Web (3001)" /d "%ROOT%\apps\frontend" npm run dev -- --hostname 127.0.0.1 --port 3001
    timeout /t 10 /nobreak >nul
)

start "" http://localhost:3001
