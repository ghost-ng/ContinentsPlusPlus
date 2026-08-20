# Continents++ regression gate — run BEFORE every deploy.
# Sweeps the headless harness across ALL THREE count modes x all 5 sizes.
# Exit 0 = gate passed; exit 1 = regressions (details printed per seed).
#
#   .\scripts\gate.ps1              # 6 seeds/size (90 runs, ~3 min)
#   .\scripts\gate.ps1 -Seeds 3     # faster smoke gate

param([int]$Seeds = 6)

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$fail = $false
foreach ($mode in 0, 1, 2) {
    $name = @('Few', 'Many', 'Random')[$mode]
    Write-Host "=== gate: mode $mode ($name), $Seeds seeds/size ===" -ForegroundColor Cyan
    node --import ./harness/register.mjs harness/run.mjs --mode $mode --seeds $Seeds 2>$null |
        Select-String -Pattern '^\[(tiny|small|standard|large|huge)', '^    ' | ForEach-Object { $_.Line }
    if ($LASTEXITCODE -ne 0) { $fail = $true; Write-Host "mode $mode ($name): FAIL" -ForegroundColor Red }
    else { Write-Host "mode $mode ($name): PASS" -ForegroundColor Green }
}

if ($fail) { Write-Host "`nGATE FAILED — do not deploy." -ForegroundColor Red; exit 1 }
Write-Host "`nGATE PASSED." -ForegroundColor Green
exit 0
