param(
    [string]$Prefix = "http://127.0.0.1:8088/"
)

Write-Host "This PowerShell backend has been replaced by server.js."
Write-Host "Please start the panel with Start-PalPanel.bat."
exit 1

$ErrorActionPreference = "Stop"
$PanelRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerRoot = Split-Path -Parent $PanelRoot
$PublicRoot = Join-Path $PanelRoot "public"
$SettingsPath = Join-Path $ServerRoot "Pal\Saved\Config\WindowsServer\PalWorldSettings.ini"
$SaveGamesPath = Join-Path $ServerRoot "Pal\Saved\SaveGames"
$LogsPath = Join-Path $ServerRoot "Pal\Saved\Logs"
$BackupsPath = Join-Path $PanelRoot "backups"
$EventsPath = Join-Path $PanelRoot "panel-events.log"

New-Item -ItemType Directory -Force -Path $BackupsPath | Out-Null

function Write-PanelEvent {
    param([string]$Message)
    $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -LiteralPath $EventsPath -Value $line -Encoding UTF8
}

function Send-Bytes {
    param($Context, [byte[]]$Bytes, [string]$ContentType = "application/octet-stream", [int]$StatusCode = 200)
    $Context.Response.StatusCode = $StatusCode
    $Context.Response.ContentType = $ContentType
    $Context.Response.ContentLength64 = $Bytes.Length
    $Context.Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
    $Context.Response.OutputStream.Close()
}

function Send-Json {
    param($Context, $Data, [int]$StatusCode = 200)
    $json = $Data | ConvertTo-Json -Depth 8
    Send-Bytes $Context ([Text.Encoding]::UTF8.GetBytes($json)) "application/json; charset=utf-8" $StatusCode
}

function Read-BodyJson {
    param($Request)
    $reader = New-Object IO.StreamReader($Request.InputStream, $Request.ContentEncoding)
    $raw = $reader.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return @{}
    }
    return $raw | ConvertFrom-Json
}

function Get-PalProcesses {
    $names = @("PalServer", "PalServer-Win64-Shipping-Cmd")
    $result = @()
    foreach ($name in $names) {
        $items = Get-Process -Name $name -ErrorAction SilentlyContinue
        foreach ($p in $items) {
            $result += [ordered]@{
                id = $p.Id
                name = $p.ProcessName
                cpu = [math]::Round([double]$p.CPU, 2)
                memoryMb = [math]::Round($p.WorkingSet64 / 1MB, 1)
                startedAt = if ($p.StartTime) { $p.StartTime.ToString("yyyy-MM-dd HH:mm:ss") } else { $null }
            }
        }
    }
    return $result
}

function Get-SettingsRaw {
    if (Test-Path -LiteralPath $SettingsPath) {
        return Get-Content -LiteralPath $SettingsPath -Raw -Encoding UTF8
    }
    return ""
}

function Split-OptionSettings {
    param([string]$Raw)
    $match = [regex]::Match($Raw, "OptionSettings=\((.*)\)", [Text.RegularExpressions.RegexOptions]::Singleline)
    if (-not $match.Success) {
        return @()
    }
    $text = $match.Groups[1].Value
    $items = New-Object System.Collections.Generic.List[string]
    $buf = New-Object Text.StringBuilder
    $inQuote = $false
    $depth = 0

    foreach ($ch in $text.ToCharArray()) {
        if ($ch -eq '"') {
            $inQuote = -not $inQuote
            [void]$buf.Append($ch)
            continue
        }
        if (-not $inQuote) {
            if ($ch -eq '(') { $depth++ }
            if ($ch -eq ')') { $depth-- }
            if ($ch -eq ',' -and $depth -eq 0) {
                $items.Add($buf.ToString())
                [void]$buf.Clear()
                continue
            }
        }
        [void]$buf.Append($ch)
    }
    if ($buf.Length -gt 0) {
        $items.Add($buf.ToString())
    }
    return $items
}

function Get-SettingsMap {
    $raw = Get-SettingsRaw
    $map = [ordered]@{}
    foreach ($item in (Split-OptionSettings $raw)) {
        $idx = $item.IndexOf("=")
        if ($idx -gt 0) {
            $key = $item.Substring(0, $idx).Trim()
            $value = $item.Substring($idx + 1).Trim()
            $map[$key] = $value
        }
    }
    return $map
}

function Convert-SettingValue {
    param($Value)
    if ($null -eq $Value) { return '""' }
    if ($Value -is [bool]) { return ($(if ($Value) { "True" } else { "False" })) }
    if ($Value -is [int] -or $Value -is [long] -or $Value -is [decimal] -or $Value -is [double]) {
        return ([string]$Value)
    }

    $text = [string]$Value
    if ($text -match "^(True|False|None|\d+(\.\d+)?|\(.*\)|https?://.*)$") {
        return $text
    }
    $escaped = $text.Replace("\", "\\").Replace('"', '\"')
    return '"' + $escaped + '"'
}

function Update-Settings {
    param($Updates)
    $raw = Get-SettingsRaw
    if ([string]::IsNullOrWhiteSpace($raw)) {
        throw "Settings file is empty: $SettingsPath"
    }
    $items = Split-OptionSettings $raw
    $updated = New-Object System.Collections.Generic.List[string]
    $seen = @{}

    foreach ($item in $items) {
        $idx = $item.IndexOf("=")
        if ($idx -gt 0) {
            $key = $item.Substring(0, $idx).Trim()
            if ($Updates.PSObject.Properties.Name -contains $key) {
                $value = Convert-SettingValue $Updates.$key
                $updated.Add("$key=$value")
                $seen[$key] = $true
                continue
            }
        }
        $updated.Add($item)
    }

    foreach ($prop in $Updates.PSObject.Properties) {
        if (-not $seen.ContainsKey($prop.Name)) {
            $updated.Add(("{0}={1}" -f $prop.Name, (Convert-SettingValue $prop.Value)))
        }
    }

    $newBlock = "OptionSettings=(" + ($updated -join ",") + ")"
    $newRaw = [regex]::Replace($raw, "OptionSettings=\(.*\)", $newBlock, [Text.RegularExpressions.RegexOptions]::Singleline)
    Set-Content -LiteralPath $SettingsPath -Value $newRaw -Encoding UTF8
}

function Get-LocalIp {
    $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.AddressState -eq "Preferred" } |
        Select-Object -First 1
    if ($ip) { return $ip.IPAddress }
    return "127.0.0.1"
}

function Get-ServerStatus {
    $processes = Get-PalProcesses
    $endpoint = Get-NetUDPEndpoint -LocalPort 8211 -ErrorAction SilentlyContinue | Select-Object -First 1
    $settings = Get-SettingsMap
    $shipping = $processes | Where-Object { $_.name -eq "PalServer-Win64-Shipping-Cmd" } | Select-Object -First 1
    $running = $null -ne $shipping -or $null -ne $endpoint
    $localIp = Get-LocalIp
    return [ordered]@{
        running = $running
        state = if ($running) { "running" } else { "stopped" }
        address = ("{0}:{1}" -f $localIp, ($settings.PublicPort -replace '"', ""))
        localIp = $localIp
        port = ($settings.PublicPort -replace '"', "")
        serverName = ($settings.ServerName -replace '^"|"$', "")
        maxPlayers = ($settings.ServerPlayerMaxNum -replace '"', "")
        pvp = ($settings.bIsPvP -replace '"', "")
        passwordEnabled = -not [string]::IsNullOrWhiteSpace(($settings.ServerPassword -replace '^"|"$', ""))
        processes = $processes
        endpoint = if ($endpoint) {
            [ordered]@{
                localAddress = $endpoint.LocalAddress
                localPort = $endpoint.LocalPort
                owningProcess = $endpoint.OwningProcess
            }
        } else { $null }
        time = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    }
}

function Start-PalServer {
    $status = Get-ServerStatus
    if ($status.running) {
        return "Server is already running."
    }
    $exe = Join-Path $ServerRoot "PalServer.exe"
    if (-not (Test-Path -LiteralPath $exe)) {
        throw "PalServer.exe not found."
    }
    Start-Process -FilePath $exe -ArgumentList "-log" -WorkingDirectory $ServerRoot -WindowStyle Hidden | Out-Null
    Write-PanelEvent "start server"
    Start-Sleep -Seconds 3
    return "Server start requested."
}

function Stop-PalServer {
    $items = Get-Process -Name "PalServer","PalServer-Win64-Shipping-Cmd" -ErrorAction SilentlyContinue
    if (-not $items) {
        return "Server is not running."
    }
    foreach ($p in $items) {
        Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    }
    Write-PanelEvent "stop server"
    Start-Sleep -Seconds 1
    return "Server stop requested."
}

function New-Backup {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $target = Join-Path $BackupsPath "pal-save-$stamp.zip"
    $include = @()
    if (Test-Path -LiteralPath $SaveGamesPath) { $include += $SaveGamesPath }
    if (Test-Path -LiteralPath $SettingsPath) { $include += $SettingsPath }
    if ($include.Count -eq 0) {
        throw "No save or settings files found."
    }
    Compress-Archive -LiteralPath $include -DestinationPath $target -Force
    Write-PanelEvent "backup $target"
    return Get-BackupList | Select-Object -First 1
}

function Get-BackupList {
    if (-not (Test-Path -LiteralPath $BackupsPath)) {
        return @()
    }
    return Get-ChildItem -LiteralPath $BackupsPath -Filter "*.zip" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        ForEach-Object {
            [ordered]@{
                name = $_.Name
                sizeMb = [math]::Round($_.Length / 1MB, 2)
                createdAt = $_.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
            }
        }
}

function Get-LogText {
    $chunks = @()
    if (Test-Path -LiteralPath $LogsPath) {
        $latest = Get-ChildItem -LiteralPath $LogsPath -File -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if ($latest) {
            $chunks += "== $($latest.Name) =="
            $chunks += (Get-Content -LiteralPath $latest.FullName -Tail 220 -ErrorAction SilentlyContinue)
        }
    }
    if (Test-Path -LiteralPath $EventsPath) {
        $chunks += "== panel-events.log =="
        $chunks += (Get-Content -LiteralPath $EventsPath -Tail 80 -ErrorAction SilentlyContinue)
    }
    if ($chunks.Count -eq 0) {
        return "No logs yet."
    }
    return ($chunks -join "`n")
}

function Send-StaticFile {
    param($Context, [string]$Path)
    if ($Path -eq "/") { $Path = "/index.html" }
    $relative = $Path.TrimStart("/") -replace "/", "\"
    $full = [IO.Path]::GetFullPath((Join-Path $PublicRoot $relative))
    $publicFull = [IO.Path]::GetFullPath($PublicRoot)
    if (-not $full.StartsWith($publicFull, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $full)) {
        Send-Json $Context @{ error = "Not found" } 404
        return
    }
    $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
    $type = switch ($ext) {
        ".html" { "text/html; charset=utf-8" }
        ".css" { "text/css; charset=utf-8" }
        ".js" { "application/javascript; charset=utf-8" }
        ".svg" { "image/svg+xml" }
        default { "application/octet-stream" }
    }
    Send-Bytes $Context ([IO.File]::ReadAllBytes($full)) $type
}

$listener = [Net.HttpListener]::new()
$listener.Prefixes.Add($Prefix)

try {
    $listener.Start()
} catch {
    Write-Host "Failed to start panel at $Prefix"
    Write-Host $_.Exception.Message
    exit 1
}

Write-PanelEvent "panel started $Prefix"
Write-Host "Palworld web panel is running at $Prefix"
Write-Host "Press Ctrl+C to stop the panel."

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $path = $request.Url.AbsolutePath
        $method = $request.HttpMethod.ToUpperInvariant()

        try {
            if ($path -eq "/api/status" -and $method -eq "GET") {
                Send-Json $context (Get-ServerStatus)
            } elseif ($path -eq "/api/server/start" -and $method -eq "POST") {
                $message = Start-PalServer
                Send-Json $context @{ ok = $true; message = $message; status = Get-ServerStatus }
            } elseif ($path -eq "/api/server/stop" -and $method -eq "POST") {
                $message = Stop-PalServer
                Send-Json $context @{ ok = $true; message = $message; status = Get-ServerStatus }
            } elseif ($path -eq "/api/server/restart" -and $method -eq "POST") {
                [void](Stop-PalServer)
                Start-Sleep -Seconds 2
                $message = Start-PalServer
                Write-PanelEvent "restart server"
                Send-Json $context @{ ok = $true; message = $message; status = Get-ServerStatus }
            } elseif ($path -eq "/api/config" -and $method -eq "GET") {
                Send-Json $context @{ settings = Get-SettingsMap; raw = Get-SettingsRaw }
            } elseif ($path -eq "/api/config" -and $method -eq "POST") {
                $body = Read-BodyJson $request
                Update-Settings $body
                Write-PanelEvent "update settings"
                Send-Json $context @{ ok = $true; settings = Get-SettingsMap }
            } elseif ($path -eq "/api/config/raw" -and $method -eq "POST") {
                $body = Read-BodyJson $request
                Set-Content -LiteralPath $SettingsPath -Value ([string]$body.raw) -Encoding UTF8
                Write-PanelEvent "update raw settings"
                Send-Json $context @{ ok = $true }
            } elseif ($path -eq "/api/backups" -and $method -eq "GET") {
                Send-Json $context @{ backups = @(Get-BackupList) }
            } elseif ($path -eq "/api/backups" -and $method -eq "POST") {
                $backup = New-Backup
                Send-Json $context @{ ok = $true; backup = $backup; backups = @(Get-BackupList) }
            } elseif ($path -eq "/api/logs" -and $method -eq "GET") {
                Send-Json $context @{ text = Get-LogText }
            } else {
                Send-StaticFile $context $path
            }
        } catch {
            Send-Json $context @{ ok = $false; error = $_.Exception.Message } 500
        }
    } catch {
        if ($listener.IsListening) {
            Write-Host $_.Exception.Message
        }
    }
}
