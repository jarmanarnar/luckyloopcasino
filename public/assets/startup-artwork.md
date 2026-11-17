# Compact COP COIN delivery artwork

The `.webp` files below are resized delivery derivatives of the existing PNG
artwork. The PNG originals remain unchanged. No composition, colors, subject,
transparent margins, or artwork placement was redesigned.

Run `python scripts/optimize-startup-artwork.py` to rebuild them with Pillow's
WebP support. The script uses Lanczos resizing, WebP quality 92 and method 6,
then checks dimensions and verifies that the decoded alpha channel is exactly
the alpha channel of the resized image. Color compression is lossy; these are
not pixel-identical copies of the full-resolution originals.

| Asset (relative to this folder) | Delivery size | PNG bytes | WebP bytes |
| --- | --- | ---: | ---: |
| `brand/cop-coin-beacons.webp` | 320 × 213 | 1,867,087 | 22,104 |
| `brand/cop-coin-wordmark.webp` | 640 × 213 | 1,298,054 | 37,072 |
| `brand/cop-coin-cc.webp` | 480 × 320 | 1,359,073 | 18,294 |
| `coins/gold-coin-front.webp` | 512 × 512 | 1,295,291 | 35,904 |
| `coins/super-coin-front.webp` | 512 × 512 | 1,193,338 | 33,582 |
| `hero/cop-coin-wheel-v1.webp` | 624 × 624 | 2,124,651 | 119,390 |
| `hero/cop-coin-nolimit-v2.webp` | 624 × 655 | 1,891,787 | 128,700 |
| **Total** | | **11,029,281** | **395,046** |

This reduces the seven files' combined delivery size by 96.4%. The 160px
loading illustration has a 2× image, and both 208px banner illustrations have
3× images. The compact logo and coins retain extra resolution for their larger
achievement and win-screen uses. HTML and CSS continue to own display sizes,
so these derivatives do not change layout.
