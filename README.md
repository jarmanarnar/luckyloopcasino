# LuckyLoop Casino

The current casino interface built from reusable UI atoms. This repository contains the active application only; earlier design experiments, reference captures, raw catalog seeds and the rejected mobile preview remain in the local project archive.

## Run locally

Use Node.js 22 or newer. No dependencies, installation step, credentials or external backend are required to serve the interface.

```sh
npm start
```

Open [LuckyLoop Casino](http://127.0.0.1:4320/luckyloopcasino/). Only one local server starts. The previous `/atomic-design/` and `/luckyloop-casino/` entries redirect here and preserve a game fragment such as `#game=niptuck000000000`.

```sh
npm run check
npm test
```

## Current behavior

- Fixed wallet header with safe-area spacing, original gold G and emerald S coins, separate demo balances and an independent coin switch.
- Category navigation, a dedicated Providers view, and a provider-logo carousel after all game collections on the home view.
- Clickable carousel titles and All buttons open the same complete collection; category and provider pages show their title.
- Provider detail views highlight Providers; selecting a game category highlights that category.
- Equal game-card sizes in carousels and grids. Game cover artwork is intentionally omitted.
- A reviewed 795-game catalog across six providers; Our Picks contains 15 candidates, with Nip Tuck first. Responsive suitability is being reviewed by the project owner.
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
| `public/assets/providers/` | Six genuine provider SVG marks and their provenance |
| `server.mjs` | Local static server restricted to public app files |
| `tests/` | Catalog exclusions, loader protocol and server-route checks |

All app imports and assets are relative so `public/` can also be hosted as static files. The local server uses the branded `/luckyloopcasino/` path.

## Hosting

The public site is hosted at [LuckyLoop Casino](https://jarmanarnar.github.io/luckyloopcasino/). `.github/workflows/pages.yml` checks the source and runs the existing tests before publishing only `public/` to GitHub Pages on each push to `main`. It can also be run manually from GitHub Actions. No installation, build process, server function or environment variables are needed. Keep the local server for development only; its legacy-path redirects apply locally.

Demo wallet state is saved per browser and origin. A phone or the hosted address starts with its own demo balance; it does not share balances with localhost.

## Updating the catalog

`public/catalog.js` is the active reviewed catalog. Keep `removed-games.js` when importing new data or curating picks; the archived source list includes games the owner removed. Update provider counts when changing the active catalog. Keep real provider IDs and launch URLs unchanged when renaming the platform.

Provider trademarks and game content belong to their respective owners. Artwork sources are documented in `public/assets/providers/README.md`.
