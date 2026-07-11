# Rex installer for Windows — https://github.com/MoustafaTech/rex
# Usage (PowerShell):
#   irm https://raw.githubusercontent.com/MoustafaTech/rex/main/install.ps1 | iex
# Downloads the latest release, installs it silently, and starts Rex detached
# from the terminal — close this window and Rex keeps running in the tray.
$ErrorActionPreference = 'Stop'

Write-Host '==> Finding the latest Rex release...' -ForegroundColor Green
$rel = Invoke-RestMethod -Uri 'https://api.github.com/repos/MoustafaTech/rex/releases/latest' `
                         -Headers @{ 'User-Agent' = 'rex-installer' }
$asset = $rel.assets | Where-Object { $_.name -like '*win-x64.exe' } | Select-Object -First 1
if (-not $asset) { throw 'Could not find a Windows download in the latest release.' }

$setup = Join-Path $env:TEMP $asset.name
Write-Host "==> Downloading $($asset.name)..." -ForegroundColor Green
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $setup
# Remove mark-of-the-web so the silent install isn't blocked.
Unblock-File -Path $setup

Write-Host '==> Installing Rex (silent)...' -ForegroundColor Green
Start-Process -FilePath $setup -ArgumentList '/S' -Wait
Remove-Item $setup -ErrorAction SilentlyContinue

$rex = Join-Path $env:LOCALAPPDATA 'Programs\Rex\Rex.exe'
if (-not (Test-Path $rex)) { throw "Install finished but $rex was not found." }

Write-Host '==> Starting Rex...' -ForegroundColor Green
Start-Process -FilePath $rex

Write-Host ''
Write-Host 'Rex is installed and running in your system tray (near the clock).' -ForegroundColor Green
Write-Host 'Select text anywhere, then tap Ctrl to ask about it. You can close this window.'
