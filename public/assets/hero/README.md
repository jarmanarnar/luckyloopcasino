# LuckyLoop promotional artwork

All current COP COIN banner illustrations use a shared width of `calc(13rem * 1.13)` (235.04px at the default font size). They retain their natural aspect ratios, fixed size across responsive layouts, and the existing 256px card height. Copy reflows alongside the art; every banner uses a localized dark fade behind the copy at card widths of 352px or less.

## COP COIN Rip Packs banner

`cop-coin-rip-packs-v1.webp` is original collectible-card artwork: a torn blue/silver foil pack with three holographic cards depicting a cosmic lion, an astronaut, and an original geometric card back. It was generated with the built-in image generator using the approved silver gift as a material and lighting reference. It contains no existing card franchise or characters. The exact prompt is in `cop-coin-rip-packs-v1.prompt.txt`.

The unchanged 1254 × 1254 source PNG is archived in `artifacts/casino-banner-sources/cop-coin-rip-packs-v1.png`. Its 624 × 624 delivery WebP is 147,724 bytes (quality 92, method 6), with alpha verified identical to the resized original. It uses the shared banner layout at a fixed 235.04px width and loads lazily at low priority. The fifth local hero slide is a Coming Soon teaser; its disabled button has no navigation or pack-opening action.

## COP COIN wheel banner

`cop-coin-wheel-v3.webp` is the current approved local Spin & Win illustration: the silver, purple and gold wheel with a slight tilt toward the text and all external coins removed. It retains the existing shared banner size and positioning. The 1254 × 1254 source is archived unchanged in `artifacts/casino-banner-sources/cop-coin-wheel-v3.png`; its 624 × 624 WebP is 90,830 bytes, encoded at quality 92 with exact resized alpha. Both editing prompts are recorded in `cop-coin-wheel-v3.prompt.txt`. This asset is used only by the hero banner.

Earlier versions retained for reference:

`cop-coin-wheel-v2.webp` is the approved local Spin & Win illustration: a smooth silver wheel with purple and gold sectors, a gold pointer, and two G and two S coins. Generated with the built-in image generator on 2026-11-17 using the Rip Packs, bell and gift graphics as material references. The unchanged 1254 × 1254 PNG is archived in `artifacts/casino-banner-sources/cop-coin-wheel-v2.png`; the 624 × 624 delivery WebP is 132,246 bytes (quality 92, method 6), with alpha verified identical to the resized source. Full prompt: `cop-coin-wheel-v2.prompt.txt`. It replaces only the local hero illustration, retaining the shared 235.04px art size, title, button and responsive layout. The interactive wheel and its sidebar artwork are separate assets.

Previous illustration retained for reference:

`cop-coin-wheel-v1.png` is an original 1254 × 1254 RGBA illustration generated with the built-in OpenAI image generator on 2026-11-17. The existing G and S coins and chrome wordmark were supplied as style references. Its alpha channel is preserved. The complete illustration is displayed at a fixed 235.04px square at every viewport width, inset 8px from the top and flush with the right edge of the slide. Narrow cards reflow the copy without shrinking the artwork or its 30px heading. The background is inset 24px from the top and 8px from the right, so the coins extend above and beside the panel while the complete artwork stays within the slide. Copy and the interactive silver button are HTML. Full generation prompt: `cop-coin-wheel-v1.prompt.txt`.

## COP COIN Nolimit banner

`cop-coin-nolimit-character-v1.webp` is the current approved local Nolimit City banner art: the pointing adult character in an orange shirt and blue bandana, generated from the user's supplied San Quentin character reference in the site's dimensional illustration style. The 1254 × 1254 original is archived unchanged at `artifacts/casino-banner-sources/cop-coin-nolimit-character-v1.png`; delivery is a 624 × 624 WebP (126,010 bytes, quality 92, method 6), with the resized alpha preserved exactly. Full prompt: `cop-coin-nolimit-character-v1.prompt.txt`. It uses the shared hero layout, lazy loading and low fetch priority, replacing only the local slot-machine illustration.

Previous illustration retained for reference:

`cop-coin-nolimit-slot-v3.webp` is the approved local Nolimit City banner illustration: a black and chrome slot machine with red 777 reels, a gold lever ball, and the original small coins inside its payout tray. The four external G/S coins were removed. It replaces the earlier chrome-skull artwork (`cop-coin-nolimit-v2.webp`) in the local banner. It is original promotional artwork, not an official Nolimit City logo or game asset. The generation and approved edit prompts are in `cop-coin-nolimit-slot-v3.prompt.txt`.

The unchanged 1254 × 1254 RGBA original is preserved locally under `artifacts/casino-banner-sources/cop-coin-nolimit-slot-v3.png`. Its 624 × 624 delivery WebP uses quality 92, method 6, with alpha verified identical to the resized original; it is 79,050 bytes instead of 1,657,555 bytes. Loading is lazy, asynchronous and low priority.

The illustration is rendered at a fixed 235.04px wide at every viewport width, top 8px/right 0, within the same inset panel as the wheel. The alpha is unchanged. Cards fill the lane in one, two or three complete columns; image dimensions are independent of that width. The daily-login banner uses the approved gold bell described below; the first-purchase banner uses the silver gift with G/S coins. Rejected and exploratory images and prompts are retained under `artifacts/casino-banner-drafts/`, outside public assets.

## COP COIN daily-login and first-purchase banners

`cop-coin-daily-streak-bell-v2.webp` is the approved Daily Login Streak artwork: a polished three-dimensional gold bell with chrome details and subtle blue reflections, on a transparent background. It replaces the earlier bulldog/calendar illustration (`cop-coin-daily-streak-v1.webp`). `cop-coin-first-purchase-gift-v2.webp` is the approved local first-purchase artwork: an open silver gift box with a ruby-burgundy ribbon, gold G coins and blue S coins. It replaces the casino-host/vault illustration (`cop-coin-first-purchase-v1.webp`) in the local banner. Both current illustrations were generated with the built-in OpenAI image generator on 2026-11-17. Their exact generation prompts are stored alongside the WebPs as matching `.prompt.txt` files.

The unchanged 1254 × 1254 PNG originals are archived locally under `artifacts/casino-banner-sources/`. The 624 × 624 WebPs use quality 92, method 6, with alpha verified identical to the resized originals. The bell is 68,258 bytes (its original PNG is 1,252,312 bytes), and the gift artwork is 107,354 bytes (its original PNG is 2,023,004 bytes). They load lazily at low priority and do not block application readiness.

Both use the existing fixed 235.04px artwork placement (top 8px, right 0), unchanged card height, and inset panel. The full composition remains visible. These cards reflow their HTML copy within the space alongside the art; text remains 30px and the HTML buttons retain their original destinations. At card widths of 352px or less, a localized dark fade behind the copy keeps it readable alongside the fixed-size art. No text or button is baked into the illustration.

## COP COIN officer banner

`cop-coin-officer-v1.png` is an unused original 1122 × 1402 RGBA illustration generated with the built-in OpenAI image generator on 2026-11-17. It depicts a fictional adult female officer with a silver CC badge, dark jacket and blouse, and the existing G/S coin designs. The brand logo and currency art were supplied as style references. Original alpha is preserved. The user rejected this direction; this officer concept is not used. Full prompt: `cop-coin-officer-v1.prompt.txt`.

## Earlier artwork

Original LuckyLoop artwork generated with the built-in OpenAI imagegen tool on 2026-10-30, from original text prompts without image references. These transparent, lossless WebP files preserve the source PNG pixels and alpha exactly.

| Asset | Dimensions | Subject |
| --- | --- | --- |
| `picks-art.webp` | 1402 × 1122 | Gold five-point star, emerald gem, floating gold coins |
| `tap-art.webp` | 1347 × 1168 | Emerald and amethyst gems, glossy white pointer hand tapping a gem |
| `slots-art.webp` | 1402 × 1122 | Compact gold/emerald three-reel block with lucky-star symbols, coins, violet crystal |

Prompt provenance: cohesive premium, playful stylized 3D game illustrations in glossy emerald, warm gold, and subtle violet; elegant reflections; compact floating compositions with transparent margins; readable at card scale. Prompts explicitly excluded words, logos, numbers, watermarks, UI, characters, and rectangular backgrounds. Each asset was generated separately using the subject brief above.

PNG originals are preserved in the parent workspace at `artifacts/luckyloop-hero-sources/`. WebP conversion was format-only, without resizing or changes to the artwork; decoded RGBA pixels were verified identical.

## COP COIN welcome-bonus banner

`cop-coin-welcome-stacks-v2.webp` is the current welcome artwork: two substantial gold G coin stacks alongside one smaller blue S coin stack. It was generated as the requested fuller revision of v1. The complete approved 1254 × 1254 PNG from `artifacts/banner-concepts/` is archived byte-for-byte unchanged at `artifacts/casino-banner-sources/cop-coin-welcome-stacks-v2.png`. Delivery uses a 624 × 624 WebP (110,746 bytes, quality 92, method 6), without cropping or further creative changes and with alpha verified identical to the resized original. The edit prompt is preserved unchanged in `cop-coin-welcome-stacks-v2.prompt.txt`; delivery details and hashes are recorded in `artifacts/welcome-banner-v2-asset-metadata.json`.

Previous illustration retained for reference: `cop-coin-welcome-stacks-v1.webp` has one tall gold G coin stack alongside one smaller blue S coin stack. Its unchanged 1254 × 1254 PNG remains at `artifacts/casino-banner-sources/cop-coin-welcome-stacks-v1.png`; the 624 × 624 WebP is 93,410 bytes (quality 92, method 6), with exact resized alpha. The original concept-stage prompt and `artifacts/welcome-banner-asset-metadata.json` are preserved.
