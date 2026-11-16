param(
    [switch]$ServeOnly,
    [switch]$NoBrowser,
    [switch]$Stop,
    [int]$Port = 19168
)

$ErrorActionPreference = 'Stop'
$ApplicationId = 'profile-image-generator-v1'
$BaseUrl = "http://127.0.0.1:$Port/"
$HtmlPath = Join-Path $PSScriptRoot '图片生成器.html'

function Get-GeneratorStatus {
    try {
        $Response = Invoke-RestMethod -Uri ($BaseUrl + 'health') -TimeoutSec 1
        if ($Response.application -eq $ApplicationId) { return $Response }
        return $null
    }
    catch [System.Net.WebException] { return $null }
}

if ($Stop) {
    if (Get-GeneratorStatus) {
        Invoke-RestMethod -Uri ($BaseUrl + 'shutdown') -Method Post -TimeoutSec 3 | Out-Null
        Write-Output 'Generator stopped.'
    }
    else { Write-Output 'Generator is not running.' }
    exit 0
}

if (-not (Test-Path -LiteralPath $HtmlPath -PathType Leaf)) {
    throw 'Missing generator HTML file. Please extract the entire package.'
}

if (-not $ServeOnly) {
    if (-not (Get-GeneratorStatus)) {
        $PowerShellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $Arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -ServeOnly -Port {1}' -f $PSCommandPath, $Port
        Start-Process -FilePath $PowerShellPath -ArgumentList $Arguments -WindowStyle Hidden | Out-Null
        $Ready = $false
        for ($Attempt = 0; $Attempt -lt 30; $Attempt++) {
            if (Get-GeneratorStatus) { $Ready = $true; break }
            Start-Sleep -Milliseconds 150
        }
        if (-not $Ready) { throw "Could not start generator on $BaseUrl. The port may be in use." }
    }
    if (-not $NoBrowser) {
        # 浏览器是用户要看到和操作的编辑器；后台服务仍使用隐藏窗口。
        Start-Process -FilePath $BaseUrl | Out-Null
    }
    Write-Output $BaseUrl
    exit 0
}

# 仅绑定回环地址，不开放局域网；仅提供这一个自包含生成器，不暴露目录。
$Listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
$HtmlBytes = [System.IO.File]::ReadAllBytes($HtmlPath)
$LastActivity = [DateTime]::UtcNow
$Running = $true
$Listener.Start()
Write-Output "Generator listening on $BaseUrl"

try {
    while ($Running -and ([DateTime]::UtcNow - $LastActivity).TotalMinutes -lt 120) {
        if (-not $Listener.Pending()) {
            Start-Sleep -Milliseconds 100
            continue
        }
        $Client = $Listener.AcceptTcpClient()
        $Stream = $null
        $Reader = $null
        try {
            $Stream = $Client.GetStream()
            $Stream.ReadTimeout = 3000
            $Stream.WriteTimeout = 5000
            $Reader = New-Object System.IO.StreamReader($Stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
            $RequestLine = $Reader.ReadLine()
            if (-not $RequestLine -or $RequestLine.Length -gt 8192) { continue }
            $HeaderLength = $RequestLine.Length
            do {
                $Line = $Reader.ReadLine()
                $HeaderLength += $Line.Length
                if ($HeaderLength -gt 8192) { throw [System.IO.IOException]::new('Request headers too large.') }
            } while ($Line)
            $Parts = $RequestLine.Split(' ')
            if ($Parts.Count -lt 3) { continue }
            $Method = $Parts[0]
            $RequestPath = $Parts[1].Split('?')[0]
            $LastActivity = [DateTime]::UtcNow
            $Status = '200 OK'
            $ContentType = 'application/json; charset=utf-8'
            if ($Method -eq 'GET' -and $RequestPath -eq '/health') {
                $Body = [System.Text.Encoding]::UTF8.GetBytes('{"application":"profile-image-generator-v1"}')
            }
            elseif ($Method -eq 'POST' -and $RequestPath -eq '/shutdown') {
                $Body = [System.Text.Encoding]::UTF8.GetBytes('{"stopped":true}')
                $Running = $false
            }
            elseif (($Method -eq 'GET' -or $Method -eq 'HEAD') -and ($RequestPath -eq '/' -or $RequestPath -eq '/index.html')) {
                $Body = $HtmlBytes
                $ContentType = 'text/html; charset=utf-8'
            }
            else {
                $Status = '404 Not Found'
                $ContentType = 'text/plain; charset=utf-8'
                $Body = [System.Text.Encoding]::UTF8.GetBytes('Not found')
            }
            $Headers = "HTTP/1.1 $Status`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nConnection: close`r`nCache-Control: no-cache`r`nX-Content-Type-Options: nosniff`r`nReferrer-Policy: strict-origin-when-cross-origin`r`n`r`n"
            $HeaderBytes = [System.Text.Encoding]::ASCII.GetBytes($Headers)
            $Stream.Write($HeaderBytes, 0, $HeaderBytes.Length)
            if ($Method -ne 'HEAD') { $Stream.Write($Body, 0, $Body.Length) }
            $Stream.Flush()
        }
        catch [System.IO.IOException] {
            # 客户端取消预连接或离开页面，不影响后续请求。
        }
        finally {
            if ($Reader) { $Reader.Dispose() }
            if ($Stream) { $Stream.Dispose() }
            $Client.Dispose()
        }
    }
}
finally { $Listener.Stop() }
