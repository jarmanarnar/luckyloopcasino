# LuckyLoop promotional artwork

All four current COP COIN banner illustrations use a shared width of `calc(13rem * 1.13)` (235.04px at the default font size), exactly 13% above their former 208px width. They retain their natural aspect ratios, fixed size across responsive layouts, and the existing 256px card height. Copy reflows alongside the art; all four use a localized dark fade behind the copy at card widths of 352px or less.

## COP COIN wheel banner

`cop-coin-wheel-v1.png` is an original 1254 × 1254 RGBA illustration generated with the built-in OpenAI image generator on 2026-11-17. The existing G and S coins and chrome wordmark were supplied as style references. Its alpha channel is preserved. The complete illustration is displayed at a fixed 235.04px square at every viewport width, inset 8px from the top and flush with the right edge of the slide. Narrow cards reflow the copy without shrinking the artwork or its 30px heading. The background is inset 24px from the top and 8px from the right, so the coins extend above and beside the panel while the complete artwork stays within the slide. Copy and the interactive silver button are HTML. Full generation prompt: `cop-coin-wheel-v1.prompt.txt`.

## COP COIN Nolimit banner

`cop-coin-nolimit-v2.png` is an original 1224 × 1285 RGBA casino illustration generated with the built-in OpenAI image generator on 2026-11-17. Its chrome skull, black cards and chips, gold G coins and blue S coin are original promotional artwork, not an official Nolimit City game character. This is the visual direction selected by the user. Full prompt: `cop-coin-nolimit-v2.prompt.txt`.

The illustration is rendered at a fixed 235.04px wide at every viewport width, top 8px/right 0, within the same inset panel as the wheel. The alpha is unchanged. Cards fill the lane in one, two or three complete columns; image dimensions are independent of that width. The wheel artwork remains unchanged; the daily-login and first-purchase banners use the approved character artwork described below. Rejected and exploratory images and prompts are retained under `artifacts/casino-banner-drafts/`, outside public assets.

## COP COIN daily-login and first-purchase banners

`cop-coin-daily-streak-v1.webp` depicts a casino bulldog with a seven-day calendar and G/S coins. `cop-coin-first-purchase-v1.webp` depicts an adult casino host with an open chrome vault and G/S coins. Both are original illustrations generated with the built-in OpenAI image generator on 2026-11-17 and approved for integration. Their exact generation prompts are stored alongside the WebPs as matching `.prompt.txt` files.

The unchanged 1254 × 1254 PNG originals are archived locally under `artifacts/casino-banner-sources/`. The 624 × 624 WebPs use quality 92, method 6, with alpha verified identical to the resized originals. They are 149,036 and 142,972 bytes respectively, instead of 5,044,467 combined PNG bytes. They load lazily at low priority and do not block application readiness.

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
