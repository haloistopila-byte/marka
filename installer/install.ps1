# Installs Marka Photobooth for this Windows user, without an installer .exe that Smart App Control
# would block. It runs in PowerShell's Constrained Language Mode, which App Control turns on, so it
# sticks to plain cmdlets. Only what is missing is fetched: after this, the app updates itself.
#   irm https://raw.githubusercontent.com/haloistopila-byte/marka/installer/install.ps1 | iex

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$base = 'https://raw.githubusercontent.com/haloistopila-byte/marka/installer'
$tar = "$env:SystemRoot\System32\tar.exe"
$dir = "$env:LOCALAPPDATA\Programs\Marka Photobooth"
$temp = "$dir\install.tmp"
$node = "$dir\runtime\node.exe"
$start = "$dir\app\scripts\start-installed.mjs"
$icon = "$dir\app\marka.ico"

function Get-Verified($url, $file, $sha256) {
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $file
    if ((Get-FileHash -Algorithm SHA256 -Path $file).Hash -ine $sha256) {
        throw "Checksum tidak cocok: $url"
    }
}

function Add-Launcher($folder) {
    $name = 'Marka Photobooth'
    New-Item -ItemType Directory -Force -Path $folder | Out-Null
    try {
        $shell = New-Object -ComObject WScript.Shell
        $link = $shell.CreateShortcut("$folder\$name.lnk")
        $link.TargetPath = $node
        $link.Arguments = "`"$start`""
        $link.WorkingDirectory = $dir
        $link.IconLocation = $icon
        $link.Save()
    } catch {
        # App Control can refuse this COM object. A .cmd opens the same app, only without the icon.
        Set-Content -Encoding ASCII -Path "$folder\$name.cmd" -Value "@`"$node`" `"$start`""
    }
}

Write-Host 'Memasang Marka Photobooth...'
$latest = (Invoke-WebRequest -UseBasicParsing -Uri "$base/latest.json").Content | ConvertFrom-Json

if (Test-Path $temp) { Remove-Item -Recurse -Force $temp }
New-Item -ItemType Directory -Force -Path $temp | Out-Null

if (-not (Test-Path $node)) {
    Write-Host "Mengunduh Node $($latest.node.version)..."
    Get-Verified $latest.node.url "$temp\node.zip" $latest.node.sha256
    & $tar -xf "$temp\node.zip" -C $temp $latest.node.entry
    if ($LASTEXITCODE -ne 0) { throw 'Node gagal diekstrak.' }
    New-Item -ItemType Directory -Force -Path "$dir\runtime" | Out-Null
    Move-Item "$temp\$($latest.node.entry)" $node
}

if (-not (Test-Path $start)) {
    Write-Host "Mengunduh app versi $($latest.version)..."
    Get-Verified "$base/$($latest.file)" "$temp\app.zip" $latest.sha256
    New-Item -ItemType Directory -Force -Path "$temp\app" | Out-Null
    & $tar -xf "$temp\app.zip" -C "$temp\app"
    if ($LASTEXITCODE -ne 0) { throw 'App gagal diekstrak.' }
    if (Test-Path "$dir\app") { Remove-Item -Recurse -Force "$dir\app" }
    Move-Item "$temp\app" "$dir\app"
}

Remove-Item -Recurse -Force $temp

# The registry knows when OneDrive has moved the desktop. Calling .NET for this is refused in this mode.
$folders = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders'
Add-Launcher $folders.Desktop
Add-Launcher "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"

Write-Host 'Selesai. Membuka Marka Photobooth...'
Start-Process -FilePath $node -ArgumentList "`"$start`"" -WorkingDirectory $dir
