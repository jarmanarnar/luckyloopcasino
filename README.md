# LuckyLoop Casino

The current casino interface built from reusable UI atoms. This repository contains the active application only; earlier design experiments, reference captures, raw catalog seeds and the rejected mobile preview remain in the local project archive.

## Run locally

Use Node.js 22 or newer. Browser dependencies are bundled in `public/vendor/`; no installation step, credentials or external backend are required to serve the interface.

```sh
npm start
```

Open [LuckyLoop Casino](http://127.0.0.1:4320/luckyloopcasino/). Only one local server starts. The previous `/atomic-design/` and `/luckyloop-casino/` entries redirect here and preserve a game fragment such as `#game=niptuck000000000`.

```sh
npm run check
npm test
```

## Current behavior

- Responsive promotional carousel containing four empty frames: one, two or three per view, circular touch/drag navigation, and a white pagination fill synchronized with automatic rotation. Interaction pauses both the countdown and fill; they resume together. Frames use the same shared surface and radius tokens as the game cards. The earlier artwork remains in `assets/hero/` for later design work and is not loaded by the frames.
- Fixed wallet header with safe-area spacing, original gold G and emerald S coins, separate demo balances and an independent coin switch.
- A persistent 72px desktop icon rail expands to 232px. Its hamburger and BUY/REDEEM controls precede search, an Our Picks promotion and grouped category/provider navigation. Compact icons show accessible custom tooltips; expanded rows show labels. Below 64rem the same content moves into a 232px hamburger drawer with native modal focus handling, Escape/backdrop dismissal and independent scrolling. BUY opens the demo wallet; REDEEM remains disabled. The sidebar is hidden during play and the game retains the full width below its header.
- Sidebar search opens a focused dialog and filters the actual catalog by game or provider name. The header uses the owner's supplied logo sketch; the original bitmap is retained unchanged.
- Popular is the first home game shelf and follows All Games in the category bar. It starts with 12 curated demo titles; it is not an analytics-based ranking. Providers remain available through the home provider carousel and hamburger menu, with no Providers item in the horizontal category bar.
- Clickable carousel titles and All buttons open the same complete collection; category and provider pages show their title.
- Provider detail views highlight Providers; selecting a game category highlights that category.
- Equal game-card sizes in carousels and grids. Game cover artwork is intentionally omitted.
- A reviewed 791-game catalog across six providers; Our Picks contains 15 candidates, with Nip Tuck first. Responsive suitability is being reviewed by the project owner.
- Removed games stay excluded from collections and direct game links, including original vendor-code aliases.
- One game iframe mounts below the header and is disposed when leaving the game. Provider readiness signals control the loading transition.

The wallet is local demo state and is independent of provider balances. Game engines load from external public demo services; their availability, mobile rendering and access screens are controlled by those providers. This prototype has no payments, deposits, withdrawals or shared provider wallet integration.

## Files

| Location | Purpose |
| --- | --- |
| `public/index.html`, `styles.css`, `wallet.css` | Page structure and styles |
| `public/catalog-view.js`, `collections.js`, `game-types.js` | Catalog navigation, curated collections and game-format mapping |
| `public/catalog.js`, `removed-games.js` | Reviewed games and permanent exclusions |
| `public/game-view.js`, `game-ready.js`, `game-presentation.js` | Game routing, lifecycle and presentation |
| `public/wallet.js`, `wallet-state.js` | Two-currency local demo wallet |
| `public/site-menu.js`, `site-menu.css`, `site-search.js`, `site-search.css` | Desktop rail, mobile drawer, tooltips and catalog search |
| `public/hero-carousel.js`, `hero-carousel.css`, `assets/hero/` | Promotional banners, original artwork and carousel behavior |
| `public/vendor/embla-carousel/` | Pinned Embla Carousel browser module and MIT license |
| `public/assets/providers/` | Six genuine provider SVG marks and their provenance |
| `server.mjs` | Local static server restricted to public app files |
| `tests/` | Catalog exclusions, loader protocol and server-route checks |

All app imports and assets are relative so `public/` can also be hosted as static files. The local server uses the branded `/luckyloopcasino/` path.

## Hosting

The public site is hosted at [LuckyLoop Casino](https://jarmanarnar.github.io/luckyloopcasino/). `.github/workflows/pages.yml` checks the source and runs the existing tests before publishing only `public/` to GitHub Pages on each push to `main`. It can also be run manually from GitHub Actions. No installation, build process, server function or environment variables are needed. Keep the local server for development only; its legacy-path redirects apply locally.

Demo wallet state is saved per browser and origin. A phone or the hosted address starts with its own demo balance; it does not share balances with localhost.

## Responsive sizing

The header uses self-hosted Arimo Bold, matching the editable [LuckyLoop header library in Figma](https://www.figma.com/design/HFNWKij5h9moTbn1QNOivI?node-id=6-312). Phase 1 contains the header atoms, GC/SC wallet and lobby/game header variants, plus [375×812 baseline frames](https://www.figma.com/design/HFNWKij5h9moTbn1QNOivI?node-id=7-538). The rest of the interface retains its current typography pending the next design stages. Original coin SVGs remain editable vector components in Figma; no flattened UI screenshots are used as components.

The header is 64 CSS pixels tall at the default text size, plus any top safe-area inset. Its controls use consistent 36px mobile and 40px desktop heights. The content is capped at 1136px, with 16px mobile and 48px desktop gutters. Sidebar controls use 44px targets and 40px category rows. Shared `rem` tokens preserve user text preferences; breakpoints change layout roles rather than scaling every atom independently. The logo is hidden below 360px to preserve the wallet and coin-switch space.

Game cards keep an 8:11 aspect ratio and one width token shared by carousels and category grids. [Container queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries) choose one to eight columns from the available catalog width, with three columns on standard portrait phones. Cards divide that width equally, including gaps; at the full 1136px content width they measure 128×176px with 16px gaps. Browsers without container units retain the fixed-width fallback. Promotional banners are 216px tall on mobile and 188px on desktop, with one, two or three per view according to their container width. All lobby sections and the header share one content width and safe-area inset.

The Providers page uses equal flexible columns, with two provider tiles on standard portrait phones. Tiles fill the available row width and keep a 2.1:1 aspect ratio; logos remain contained without cropping or distortion. The home provider carousel keeps its existing compact tile dimensions.

Wallet text stays the same size throughout a balance animation. Layout measurements are invalidated by relevant width/font changes, while height-only mobile browser changes preserve the running counter. The header always stays in one row, with the plus beside the balance. The wallet stays centered while it fits and can move slightly within the free space between the back control and currency switch on narrow screens. Navigation controls have at least a 44px target at the default text size; the wallet plus expands its hit area without enlarging the artwork.

The layout follows [content-based responsive design](https://web.dev/articles/responsive-web-design-basics), [bounded fluid CSS sizing](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/clamp), and [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html). These sources inform the behavior; the numerical proportions are this project's design choices.

## Updating the catalog

`public/catalog.js` is the active reviewed catalog. Keep `removed-games.js` when importing new data or curating picks; the archived source list includes games the owner removed. Update provider counts when changing the active catalog. Keep real provider IDs and launch URLs unchanged when renaming the platform.

Provider trademarks and game content belong to their respective owners. Artwork sources are documented in `public/assets/providers/README.md`.
