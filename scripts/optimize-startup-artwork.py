"""Rebuild compact delivery copies without changing the original artwork.

Requires Pillow with WebP support. Run from any working directory:
    python scripts/optimize-startup-artwork.py
"""

from pathlib import Path
import json

from PIL import Image, features


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public" / "assets"
DELIVERY_WIDTHS = {
    "brand/cop-coin-beacons.png": 320,
    "brand/cop-coin-wordmark.png": 640,
    "brand/cop-coin-cc.png": 480,
    "coins/gold-coin-front.png": 512,
    "coins/super-coin-front.png": 512,
    "hero/cop-coin-wheel-v1.png": 624,
    "hero/cop-coin-nolimit-v2.png": 624,
}


def main():
    if not features.check("webp"):
        raise SystemExit("Pillow must have WebP support to rebuild delivery artwork.")

    results = []
    for relative, max_width in DELIVERY_WIDTHS.items():
        original = ASSETS / relative
        output = original.with_suffix(".webp")
        with Image.open(original) as source:
            rgba = source.convert("RGBA")
            width = min(max_width, rgba.width)
            height = round(rgba.height * width / rgba.width)
            resized = rgba.resize((width, height), Image.Resampling.LANCZOS)
            resized.save(output, "WEBP", quality=92, method=6, exact=True)
            with Image.open(output) as decoded:
                # WebP alpha is lossless even though its color plane is compressed.
                if decoded.convert("RGBA").getchannel("A").tobytes() != resized.getchannel("A").tobytes():
                    raise RuntimeError(f"Alpha changed during encoding: {relative}")
                if decoded.size != resized.size:
                    raise RuntimeError(f"Unexpected delivery dimensions: {relative}")
            results.append({
                "source": relative,
                "delivery": output.relative_to(ASSETS).as_posix(),
                "source_dimensions": list(source.size),
                "delivery_dimensions": [width, height],
                "source_bytes": original.stat().st_size,
                "delivery_bytes": output.stat().st_size,
                "alpha_preserved": True,
            })

    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
