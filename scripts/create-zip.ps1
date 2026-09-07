$ErrorActionPreference = "Stop"

$workspaceRoot = $PSScriptRoot | Split-Path -Parent
$desktopDir = Split-Path $workspaceRoot -Parent
$zipName = "online-examination-system.zip"
$destDesktop = Join-Path $desktopDir $zipName
$destLocal = Join-Path $workspaceRoot $zipName

$items = @(
    "src",
    "public",
    "api",
    "server",
    "scripts",
    "dist",
    "data",
    "index.html",
    "vercel.json",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "vite.config.ts",
    "README.md",
    "Online_Examination_System.pdf"
)

Write-Host "Creating zip package with tar.exe..."
Push-Location $workspaceRoot
try {
    tar.exe -a -c -f $destDesktop $items
    Copy-Item -Path $destDesktop -Destination $destLocal -Force
} finally {
    Pop-Location
}

$sizeMB = [math]::Round((Get-Item $destDesktop).Length / 1MB, 2)
Write-Host "=========================================="
Write-Host "ZIP PACKAGE UPDATED SUCCESSFULLY!"
Write-Host "Desktop Location: $destDesktop"
Write-Host "Project Location: $destLocal"
Write-Host "Total Size:       $sizeMB MB"
Write-Host "=========================================="
