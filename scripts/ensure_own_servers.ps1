# Okur ERP kisayolu acilmadan once 5433 / 8001 / 3001 portlarini denetler.
# Portu dinleyen surec bu klasorden baslamadiysa (programin baska bir kopyasi),
# arayuz gelistirme modunda aciksa ya da API calismaya basladiktan sonra arka uc
# kodu degistiyse o sureci kapatir; start_okur_web.bat ardindan bu klasordeki
# guncel surumu baslatir. Boylece kisayol her zaman tamamen bu projeyi calistirir.
$ErrorActionPreference = "SilentlyContinue"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path.TrimEnd("\")
. (Join-Path $PSScriptRoot "pg_bin.ps1")
$pgBin = Get-OkurPgBin $root
$pgctl = if ($pgBin) { Join-Path $pgBin "pg_ctl.exe" } else { "pg_ctl.exe" }

function Get-Chain([int]$processId) {
    # Surecin kendisi ve en fazla 3 ust sureci (venv python ve "cmd /c" sarmalayicilari icin).
    $chain = @()
    for ($i = 0; $i -lt 4 -and $processId -gt 0; $i++) {
        $p = Get-CimInstance Win32_Process -Filter "ProcessId=$processId"
        if (-not $p) { break }
        $chain += $p
        $processId = [int]$p.ParentProcessId
    }
    return $chain
}

function Get-ChainText($chain) {
    (($chain | ForEach-Object { "$($_.ExecutablePath) $($_.CommandLine)" }) -join " ").Replace("/", "\")
}

function Stop-Listener($chain) {
    # Dinleyen sureci ve onu baslatan python/node sarmalayicisini kapatir.
    $names = @("python.exe", "node.exe")
    Stop-Process -Id $chain[0].ProcessId -Force
    if ($chain.Count -gt 1 -and $names -contains $chain[1].Name) { Stop-Process -Id $chain[1].ProcessId -Force }
}

function Get-ListenerPids([int]$port) {
    @(Get-NetTCPConnection -LocalPort $port -State Listen | Select-Object -ExpandProperty OwningProcess -Unique)
}

# PostgreSQL (5433): baska bir veri klasorunden calisiyorsa duzgunce durdur.
foreach ($id in Get-ListenerPids 5433) {
    $chain = Get-Chain $id
    $text = Get-ChainText $chain
    if ($text -like "*$root\local-data\pgdata*") { continue }
    Write-Host "5433 portunda baska bir veritabani calisiyor; kapatiliyor..."
    $stopped = $false
    if ($text -match '-D\s+"([^"]+)"') {
        & $pgctl stop -D $Matches[1] -m fast -w | Out-Null
        $stopped = ($LASTEXITCODE -eq 0)
    }
    if (-not $stopped) { Stop-Process -Id $id -Force }
}

# API (8001): baska klasorden basladiysa ya da arka uc kodu sonradan degistiyse kapat.
$backend = Join-Path $root "apps\backend"
foreach ($id in Get-ListenerPids 8001) {
    $chain = Get-Chain $id
    $text = Get-ChainText $chain
    $reason = $null
    if ($text -notlike "*$backend\*") {
        $reason = "8001 portunda baska bir kopyanin API'si calisiyor"
    } else {
        $started = (Get-Process -Id $id).StartTime
        $paths = @("app", "alembic", ".env", "requirements.txt") | ForEach-Object { Join-Path $backend $_ } | Where-Object { Test-Path $_ }
        $newest = (Get-ChildItem -Path $paths -Recurse -File |
            Where-Object { $_.FullName -notlike "*\__pycache__\*" } |
            Measure-Object -Property LastWriteTime -Maximum).Maximum
        if ($newest -and $started -and $newest -gt $started) { $reason = "Arka uc kodu degismis" }
    }
    if ($reason) {
        Write-Host "$reason; API yeniden baslatilacak..."
        Stop-Listener $chain
    }
}

# Web (3001): yalnizca bu klasorun uretim derlemesi kalabilir (gelistirme sunucusu da kapatilir).
foreach ($id in Get-ListenerPids 3001) {
    $chain = Get-Chain $id
    $text = Get-ChainText $chain
    if ($text -like "*$root\apps\frontend\.next-prod\standalone\*") { continue }
    Write-Host "3001 portunda bu projenin guncel arayuzu calismiyor; kapatiliyor..."
    Stop-Listener $chain
}

# Portlarin bosalmasi icin kisa bir bekleme.
for ($i = 0; $i -lt 20; $i++) {
    $busy = $false
    foreach ($port in 8001, 3001) {
        foreach ($id in Get-ListenerPids $port) {
            $t = Get-ChainText (Get-Chain $id)
            if ($t -notlike "*$root\apps\*") { $busy = $true }
        }
    }
    if (-not $busy) { break }
    Start-Sleep -Milliseconds 300
}
exit 0
