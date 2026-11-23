# Provider logos

Retrieved on 2026-10-30. These are the actual SVG marks served by the official provider affiliate/fansite pages. No artwork was generated or redrawn.

| Local file | Provider | Public source |
| --- | --- | --- |
| `netent.svg` | NetEnt | [Playin studio assets](https://playin.com/affiliates-info) |
| `red-tiger.svg` | Red Tiger | [Playin studio assets](https://playin.com/affiliates-info) |
| `nolimit-city.svg` | Nolimit City | [Playin studio assets](https://playin.com/affiliates-info) |
| `big-time-gaming.svg` | Big Time Gaming | [Playin studio assets](https://playin.com/affiliates-info) |
| `taparoo.svg` | Tap-A-Roo | [Official Tap-A-Roo fansite header](https://tap-a-roo.com/) |
| `sneaky-slots.svg` | Sneaky Slots | [Playin studio assets](https://playin.com/affiliates-info) |

The five Playin marks are the inline SVGs immediately preceding each studio's design-assets download. The Tap-A-Roo mark is the header SVG with `viewBox="0 0 110 48"`.

SVG paths, view boxes, internal fills, clipping and geometry are retained. Only page-specific utility classes were removed and intrinsic width/height were set to the source view-box ratio for use in an image element. The source affiliate page's inherited `fill-white` is made explicit for standalone SVG rendering; existing brand colors remain unchanged.

Tap-A-Roo uses its source site's genuine dark-theme gray: `fill-gray-800` resolves through `--dark-gray-800: 218 218 218` to `#dadada`. This styling is documented in the source [fansite stylesheet](https://tap-a-roo.com/_next/static/css/3cc55c089c9d51e9.css). No arbitrary logo recoloring or CSS image filters are required.

Each SVG was checked for active content and external references. The exported files contain local SVG shapes and internal definitions only.

## Hacksaw Gaming

`hacksaw-gaming.svg` was extracted from the official https://www.hacksawgaming.com/games navigation logo on 2026-11-01. SVG path geometry, transforms and the 1000×250 view box are retained. The source dark-navigation rule (`.Navigation--dark #Logo path { fill: #fff; }` in `/dist/bundle.min.css`) is made explicit on its paths for standalone use. The SVG contains no scripts, external references or embedded raster image.

## BGaming

`bgaming.svg` was downloaded on 2026-11-22 from the official [BGaming brand guidelines](https://bgaming.com/brand-guidelines), which specify the special color version for black and very dark backgrounds. The [original SVG asset](https://bgaming.com/wp-content/uploads/2026/09/Logo-%E2%80%93-Main-black-1.svg) is retained byte-for-byte: 322×56 view box, white GAMING letters, yellow plate and dividers, and black B. No artwork was generated, redrawn or recolored. The SVG contains local paths only, with no scripts, event handlers, external references or embedded raster image.

## Gamzix

`gamzix.svg` was downloaded on 2026-11-23 from the [official Gamzix website](https://gamzix.com/), whose published header metadata identifies [Gamzix 2026 WT.svg](https://energized-gift-ecbe868b20.media.strapiapp.com/Gamzix_2026_WT_bd5d41c09b.svg) as its company logo. The original white logo is retained byte-for-byte, including its 2487×611 view box, for display on dark backgrounds. No artwork was generated, redrawn or recolored. The SVG contains local paths only, with no scripts, event handlers, external references or embedded raster image. Source URL, retrieval date and SHA-256 are recorded in `artifacts/provider-expansion-20261123/gamzix-avatarux/gamzix-logo-provenance.json`.

## AvatarUX

`avatarux.svg` was downloaded on 2026-11-23 from the [official AvatarUX website](https://avatarux.com/), which uses [AUX-logo.svg](https://avatarux.com/wp-content/uploads/2021/06/AUX-logo.svg) in its header. The original white and cyan SVG is retained byte-for-byte, including its 141×32 view box. No artwork was generated, redrawn or recolored. The SVG contains local paths and styles only, with no scripts, event handlers, external references or embedded raster image. Source URL and SHA-256 are recorded in `artifacts/provider-expansion-20261123/avatarux-expansion/logo-provenance.json`.

## Belatra and Relax Gaming — 2026-11-23

Belatra was subsequently removed from the public catalog at the user's request because its demo required leaving the site. Its source module, original covers and logo are archived outside `public` under `artifacts/removed-belatra-20261123/`; the provenance below is historical. Relax Gaming remains active.

`relax.svg` is the unchanged official https://www.relax-gaming.com/static/img/logo.svg. `belatra.svg` preserves all seven paths, fills and the 144x38 view box of the official static header Logo component served by https://belatra.games/_next/static/chunks/4333-697f7597ed866e74.js. Neither logo was redrawn. Both contain local SVG shapes only. Full source URLs and SHA-256 hashes are recorded in artifacts/non-slot-additions-20261123/provider-logos/metadata.json.
