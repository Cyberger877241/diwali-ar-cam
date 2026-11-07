# tiny static server so the browser allows camera access (it needs http://localhost)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8642

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
try {
    $listener.Start()
} catch {
    Write-Host "Couldn't start on port $port. Is spiderlily already open in another window?"
    Read-Host "Press Enter to close"
    exit 1
}

Write-Host "diwali-ar-cam running at http://localhost:$port"
Write-Host "Leave this window open while you use it. Close it to stop."
Start-Process "http://localhost:$port"

$types = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'text/javascript'
    '.css'  = 'text/css'
    '.json' = 'application/json'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.md'   = 'text/plain; charset=utf-8'
    '.woff2' = 'font/woff2'
    '.txt'  = 'text/plain; charset=utf-8'
}

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $relPath = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    $fullPath = [IO.Path]::GetFullPath((Join-Path $root $relPath))
    # folders serve their index.html
    if (Test-Path $fullPath -PathType Container) {
        if (-not $ctx.Request.Url.AbsolutePath.EndsWith('/')) {
            # /diwali -> /diwali/ so relative paths (fonts) resolve inside the folder
            $ctx.Response.StatusCode = 301
            $ctx.Response.RedirectLocation = $ctx.Request.Url.AbsolutePath + '/'
            $ctx.Response.Close()
            continue
        }
        $fullPath = Join-Path $fullPath 'index.html'
    }

    if ($fullPath.StartsWith($root) -and (Test-Path $fullPath -PathType Leaf)) {
        $bytes = [IO.File]::ReadAllBytes($fullPath)
        $ext = [IO.Path]::GetExtension($fullPath).ToLower()
        if ($types.ContainsKey($ext)) { $ctx.Response.ContentType = $types[$ext] }
        else { $ctx.Response.ContentType = 'application/octet-stream' }
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $ctx.Response.StatusCode = 404
    }
    $ctx.Response.Close()
}
