# Rebuild the app's original geometric icon without external dependencies.
Add-Type -AssemblyName System.Drawing
$assetDir = Join-Path $PSScriptRoot '../src/assets'
function RoundedRect($x, $y, $w, $h, $r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $p.AddArc($x,$y,$d,$d,180,90)
  $p.AddArc(($x+$w-$d),$y,$d,$d,270,90)
  $p.AddArc(($x+$w-$d),($y+$h-$d),$d,$d,0,90)
  $p.AddArc($x,($y+$h-$d),$d,$d,90,90)
  $p.CloseFigure()
  return ,$p
}
$master = New-Object System.Drawing.Bitmap 512,512
$g = [Drawing.Graphics]::FromImage($master)
$g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([Drawing.Color]::Transparent)
$navy = New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml('#172437'))
$white = New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml('#F4F7FC'))
$blue = New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml('#65AAFF'))
$tile = RoundedRect 16 16 480 480 104
$g.FillPath($navy,$tile)
$panel = RoundedRect 100 124 312 248 42
$pen = New-Object Drawing.Pen ([Drawing.ColorTranslator]::FromHtml('#F4F7FC')),24
$g.DrawPath($pen,$panel)
$line1 = RoundedRect 148 192 216 28 14
$line2 = RoundedRect 148 260 156 28 14
$g.FillPath($white,$line1)
$g.FillPath($blue,$line2)
$master.Save((Join-Path $assetDir 'app.png'),[Drawing.Imaging.ImageFormat]::Png)
$frames = @()
foreach ($size in @(16,24,32,48,64,128,256)) {
  $bmp = New-Object Drawing.Bitmap $size,$size
  $draw = [Drawing.Graphics]::FromImage($bmp)
  $draw.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $draw.DrawImage($master,0,0,$size,$size)
  $stream = New-Object IO.MemoryStream
  $bmp.Save($stream,[Drawing.Imaging.ImageFormat]::Png)
  $frames += ,@{ Size=$size; Bytes=$stream.ToArray() }
  $stream.Dispose(); $draw.Dispose(); $bmp.Dispose()
}
$output = [IO.File]::Create((Join-Path $assetDir 'app.ico'))
$writer = New-Object IO.BinaryWriter $output
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$frames.Count)
$offset = 6 + 16 * $frames.Count
foreach($frame in $frames) {
  $dimension = if($frame.Size -eq 256){0}else{$frame.Size}
  $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
  $writer.Write([byte]0); $writer.Write([byte]0)
  $writer.Write([uint16]1); $writer.Write([uint16]32)
  $writer.Write([uint32]$frame.Bytes.Length); $writer.Write([uint32]$offset)
  $offset += $frame.Bytes.Length
}
foreach($frame in $frames){$writer.Write([byte[]]$frame.Bytes)}
$writer.Dispose(); $output.Dispose()
$g.Dispose(); $master.Dispose(); $navy.Dispose(); $white.Dispose(); $blue.Dispose(); $pen.Dispose()
$tile.Dispose(); $panel.Dispose(); $line1.Dispose(); $line2.Dispose()
