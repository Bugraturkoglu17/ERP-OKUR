# Okur ERP arayuzunu uretim modunda derler; kaynak dosyalar son derlemeden sonra
# degismediyse hicbir sey yapmaz. Derleme apps/frontend/.next-prod altina yazilir
# (gelistirme modunun .next klasoruyle karismaz) ve node ile calisan bagimsiz
# sunucu (standalone) icin statik dosyalar yerine kopyalanir.
$ErrorActionPreference = "Stop"
$frontend = Join-Path $PSScriptRoot "..\apps\frontend" | Resolve-Path
$dist = Join-Path $frontend ".next-prod"
$standalone = Join-Path $dist "standalone"
$stamp = Join-Path $dist "BUILD_STAMP"

$sources = @("app", "components", "contexts", "hooks", "lib", "locales", "services", "types", "public") |
    ForEach-Object { Join-Path $frontend $_ } | Where-Object { Test-Path $_ }
$files = @(Get-ChildItem -Path $sources -Recurse -File |
    Where-Object { $_.FullName -notlike "*\types\api.ts" })
$files += @("package.json", "package-lock.json", "next.config.js", "tailwind.config.ts", "postcss.config.js", "tsconfig.json", ".env.local") |
    ForEach-Object { Join-Path $frontend $_ } | Where-Object { Test-Path $_ } | Get-Item
$newest = ($files | Measure-Object -Property LastWriteTimeUtc -Maximum).Maximum

if ((Test-Path $stamp) -and (Test-Path (Join-Path $standalone "server.js")) -and ((Get-Item $stamp).LastWriteTimeUtc -ge $newest)) {
    Write-Host "Arayuz guncel; derleme gerekmiyor."
    exit 0
}

Write-Host "Arayuz derleniyor (kod degisti). Bu islem birkac dakika surebilir..."
Push-Location $frontend
try {
    $env:NEXT_DIST_DIR = ".next-prod"
    & npx next build
    if ($LASTEXITCODE -ne 0) { throw "Derleme basarisiz oldu (cikis kodu $LASTEXITCODE)." }
} finally {
    Remove-Item Env:NEXT_DIST_DIR -ErrorAction SilentlyContinue
    Pop-Location
}

$staticTarget = Join-Path $standalone ".next-prod\static"
Remove-Item -Recurse -Force $staticTarget, (Join-Path $standalone "public") -ErrorAction SilentlyContinue
Copy-Item -Recurse (Join-Path $dist "static") $staticTarget
Copy-Item -Recurse (Join-Path $frontend "public") (Join-Path $standalone "public")
Set-Content -Path $stamp -Value (Get-Date -Format o) -Encoding ascii
Write-Host "Derleme tamamlandi."
