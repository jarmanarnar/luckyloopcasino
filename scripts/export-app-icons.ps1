$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

# Export installation sizes from the approved CC artwork; never redraw the logo.
$brandRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../public/assets/brand'))
$sourcePath = Join-Path $brandRoot 'cop-coin-cc.png'
$iconRoot = Join-Path $brandRoot 'app-icons'
[IO.Directory]::CreateDirectory($iconRoot) | Out-Null
$source = [Drawing.Bitmap]::FromFile($sourcePath)
try {
  # Bounds of the visible letters, excluding the transparent source canvas.
  $sourceBounds = [Drawing.RectangleF]::new(220, 215, 1080, 627)
  $exports = @(
    @{ Name = 'apple-touch-icon.png'; Size = 180; Fill = 0.80 },
    @{ Name = 'icon-192.png'; Size = 192; Fill = 0.80 },
    @{ Name = 'icon-512.png'; Size = 512; Fill = 0.80 },
    @{ Name = 'icon-maskable-512.png'; Size = 512; Fill = 0.66 }
  )
  foreach ($item in $exports) {
    $canvas = [Drawing.Bitmap]::new($item.Size, $item.Size)
    $graphics = [Drawing.Graphics]::FromImage($canvas)
    try {
      $graphics.Clear([Drawing.Color]::FromArgb(255, 7, 7, 8))
      $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $width = $item.Size * $item.Fill
      $height = $width * $sourceBounds.Height / $sourceBounds.Width
      $destination = [Drawing.RectangleF]::new(($item.Size - $width) / 2, ($item.Size - $height) / 2, $width, $height)
      $graphics.DrawImage($source, $destination, $sourceBounds, [Drawing.GraphicsUnit]::Pixel)
      $canvas.Save((Join-Path $iconRoot $item.Name), [Drawing.Imaging.ImageFormat]::Png)
      Write-Output "$($item.Name): $($item.Size)x$($item.Size)"
    } finally { $graphics.Dispose(); $canvas.Dispose() }
  }
} finally { $source.Dispose() }
