# Erzeugt die PNG-App-Icons (gleiches Motiv wie icons/icon.svg).
# Aufruf: powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot '..\icons'

function RoundRect($g, $brush, $x, $y, $w, $h, $r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $p.AddArc($x, $y, $d, $d, 180, 90); $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90); $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure(); $g.FillPath($brush, $p); $p.Dispose()
}

# $maskable: vollflächiger Hintergrund, Motiv in der inneren Sicherheitszone (Android schneidet zu)
function MakeIcon($size, $file, $maskable) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $s = $size / 512.0
  $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 79, 70, 229))
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $soft = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(217, 255, 255, 255))
  if ($maskable) { $g.FillRectangle($bg, 0, 0, $size, $size); $k = 0.72 } else { RoundRect $g $bg 0 0 $size $size (112 * $s); $k = 1.0 }
  $o = 256 * $s * (1 - $k)
  $t = $s * $k
  RoundRect $g $white ($o + 112 * $t) ($o + 112 * $t) (128 * $t) (176 * $t) (28 * $t)
  RoundRect $g $soft  ($o + 272 * $t) ($o + 112 * $t) (128 * $t) (112 * $t) (28 * $t)
  RoundRect $g $soft  ($o + 112 * $t) ($o + 320 * $t) (128 * $t) (80 * $t)  (28 * $t)
  RoundRect $g $white ($o + 272 * $t) ($o + 256 * $t) (128 * $t) (144 * $t) (28 * $t)
  $bmp.Save((Join-Path $out $file), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

MakeIcon 192 'icon-192.png' $false
MakeIcon 512 'icon-512.png' $false
MakeIcon 512 'maskable-512.png' $true
