<#
.SYNOPSIS
    Deploys the Continents++ mod to the Civilization VII Mods directory.

.DESCRIPTION
    Copies the contents of Mod/ContinentsPlusPlus/ into Mods/ContinentsPlusPlus/.
    Only the Civ VII mod files are copied -- research notes, docs, CLAUDE.md and
    .claude/ never reach the game directory.

.PARAMETER Clean
    Remove files in the destination that no longer exist in Mod/. Without this,
    deploy only adds and overwrites, leaving stale files behind.

.PARAMETER WhatIf
    Show what would be copied without writing anything.

.EXAMPLE
    .\scripts\deploy.ps1
    .\scripts\deploy.ps1 -Clean
    .\scripts\deploy.ps1 -WhatIf
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [switch]$Clean
)

$ErrorActionPreference = 'Stop'

$ModName   = 'ContinentsPlusPlus'
$RepoRoot  = Split-Path -Parent $PSScriptRoot
$Source    = Join-Path $RepoRoot 'Mod\ContinentsPlusPlus'
$ModsRoot  = Join-Path $env:LOCALAPPDATA "Firaxis Games\Sid Meier's Civilization VII\Mods"
$Dest      = Join-Path $ModsRoot $ModName

if (-not (Test-Path $Source)) {
    throw "Mod source folder not found: $Source"
}
if (-not (Test-Path (Join-Path $Source "$ModName.modinfo"))) {
    throw "No $ModName.modinfo at the root of $Source -- the game will not detect the mod."
}
if (-not (Test-Path $ModsRoot)) {
    throw "Civ VII Mods directory not found: $ModsRoot`nIs Civilization VII installed?"
}

# Safety guard: never let $Dest escape the Mods directory.
$resolvedModsRoot = (Resolve-Path $ModsRoot).Path.TrimEnd('\')
if (-not $Dest.StartsWith($resolvedModsRoot + [IO.Path]::DirectorySeparatorChar)) {
    throw "Refusing to deploy: destination '$Dest' resolves outside '$resolvedModsRoot'."
}

Write-Host "Source : $Source"    -ForegroundColor DarkGray
Write-Host "Target : $Dest"      -ForegroundColor DarkGray

if ($Clean -and (Test-Path $Dest)) {
    if ($PSCmdlet.ShouldProcess($Dest, 'Remove stale files (full clean)')) {
        Remove-Item -Path $Dest -Recurse -Force
        Write-Host 'Cleaned existing deployment.' -ForegroundColor Yellow
    }
}

if ($PSCmdlet.ShouldProcess($Dest, 'Deploy mod files')) {
    New-Item -ItemType Directory -Path $Dest -Force | Out-Null
    Copy-Item -Path (Join-Path $Source '*') -Destination $Dest -Recurse -Force

    $count = (Get-ChildItem -Path $Dest -Recurse -File).Count
    Write-Host "Deployed $count files to $Dest" -ForegroundColor Green
    Write-Host 'Map script (.js) changes: just relaunch a game (fresh context per launch).' -ForegroundColor Cyan
    Write-Host 'XML/modinfo/ImportFiles changes: fully restart Civ VII. Shell UI scripts: UI.reloadUI().' -ForegroundColor Cyan
}
