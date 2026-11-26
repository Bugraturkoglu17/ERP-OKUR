# PostgreSQL programlarinin (pg_ctl.exe, pg_isready.exe) bulundugu klasoru bulur.
# Bilgisayara gore kurulum yeri degisir; ilk bulunan kullanilir:
#   1. OKUR_PG_BIN ortam degiskeni
#   2. Proje icindeki pgserver kurulumu (local-data\pgvenv)
#   3. Kullanici klasorundeki tasinabilir kurulum (%USERPROFILE%\postgresql\pgsql\bin)
#   4. Program Files\PostgreSQL\<surum>\bin (en yeni surum)
#   5. PATH uzerindeki pg_ctl.exe
function Get-OkurPgBin([string]$root) {
    $candidates = @()
    if ($env:OKUR_PG_BIN) { $candidates += $env:OKUR_PG_BIN }
    $candidates += Join-Path $root "local-data\pgvenv\Lib\site-packages\pgserver\pginstall\bin"
    $candidates += Join-Path $env:USERPROFILE "postgresql\pgsql\bin"
    $candidates += @(Get-ChildItem "$env:ProgramFiles\PostgreSQL\*\bin" -Directory -ErrorAction SilentlyContinue |
        Sort-Object { [int]($_.Parent.Name -replace '\D', '') } -Descending | ForEach-Object FullName)
    foreach ($dir in $candidates) {
        if ($dir -and (Test-Path (Join-Path $dir "pg_ctl.exe"))) { return $dir }
    }
    $cmd = Get-Command pg_ctl.exe -ErrorAction SilentlyContinue
    if ($cmd) { return (Split-Path $cmd.Source) }
    return $null
}
