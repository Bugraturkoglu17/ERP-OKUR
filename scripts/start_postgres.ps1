# Okur ERP veritabanini (PostgreSQL, 5433) baslatir ve baglanti kabul edene kadar bekler.
# Sunucu, kisayolun komut penceresinden BAGIMSIZ, gizli bir surecte baslatilir; boylece
# kisayol penceresi kapaninca veritabani da kapanmaz (eskiden "giris yapilamadi" hatasina yol aciyordu).
# Cikis kodu: 0 = veritabani hazir, 1 = baslatilamadi.
$ErrorActionPreference = "SilentlyContinue"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path.TrimEnd("\")
$bin = Join-Path $root "local-data\pgvenv\Lib\site-packages\pgserver\pginstall\bin"
$data = Join-Path $root "local-data\pgdata"
$log = Join-Path $root "local-data\postgres.log"

function Test-Ready {
    & (Join-Path $bin "pg_isready.exe") -h 127.0.0.1 -p 5433 -t 3 | Out-Null
    return ($LASTEXITCODE -eq 0)
}

if (Test-Ready) { exit 0 }

& (Join-Path $bin "pg_ctl.exe") status -D $data | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Veritabani baslatiliyor..."
    Start-Process -FilePath (Join-Path $bin "pg_ctl.exe") -WindowStyle Hidden -ArgumentList @(
        "start", "-D", "`"$data`"", "-l", "`"$log`"", "-o", "`"-p 5433 -c listen_addresses=127.0.0.1`""
    ) | Out-Null
}

# Duzgun kapanmamis veritabani acilista kendini onarir; bu birkac saniye surebilir.
for ($i = 0; $i -lt 60; $i++) {
    if (Test-Ready) { exit 0 }
    Start-Sleep -Seconds 1
}

Write-Host ""
Write-Host "VERITABANI ACILAMADI. Program bu durumda giris kabul etmez."
Write-Host "Ayrintilar: $log"
Get-Content $log -Tail 10 | ForEach-Object { Write-Host "  $_" }
exit 1
