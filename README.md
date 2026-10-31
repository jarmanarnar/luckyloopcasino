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
- Game cards open a dedicated, refresh-safe introduction page with a wireframe portrait, linked provider, shared favorites, game format, known release date, collection links and related games. Information and Description tabs keep details separate from launch. Play demo starts the existing framed game; browsing details does not load a provider or count as a game visit. Legacy direct demo links still work. Unavailable RTP, volatility and win statistics are omitted.
- A persistent 72px desktop icon rail expands to 232px. Its hamburger and BUY/REDEEM controls precede search, Promotions and grouped casino, reward, membership, partner, account and support destinations. Compact icons show accessible custom tooltips; expanded rows show labels. Below 45rem (720px at the default text size), the menu slides above the page, ending at the permanent 63px bottom bar. The bottom navigation stays in place throughout opening and closing. The covered page is inert, keyboard focus stays within the menu and bottom bar, Escape dismisses the menu and its content scrolls independently. BUY opens Store; REDEEM opens a clearly marked preview. The sidebar stays visible beside framed games on desktop.
- Mobile navigation provides Menu, Store, Lobby, Redeem and Promotions in that order below the same 45rem boundary, including during games. Lobby sits in the middle and uses the approved infinity from the header wordmark. Search and Providers remain available in Menu. Lobby also has a standalone group in the sidebar. Search is the complete game catalog; the former All Games destination redirects there. The top hamburger is hidden while the bottom bar is present. The fixed bar is 63px high with no added bottom safe-area inset, including in standalone mode; matching content padding keeps the last row visible.
- Store is an independent page opened by mobile Store, sidebar BUY or the header plus. Its nine USD package prices, GC amounts, free SC and Popular/Best labels match the Crown Coins Store observed on 2026-10-31. Price buttons open package previews only; they do not charge or change demo balances. The former wallet dialog and free-credit button have been removed; currency switching and header balance animation remain.
- The Lounge links VIP Club, Daily Bonus, Invite Friends and CoinBack, following the four areas observed in Crown Coins. Bonus Hub, Rank System, Free Money, Missions, Promotions, Partners, Affiliate Program and Crypto & Earn are independent wireframe pages inspired by the organization of Qzino. No competitor artwork, program qualification or financial promises are imported.
- Daily Bonus grants local demo GC once per device-local calendar day, advancing a seven-day streak. Three introductory missions grant one-time demo GC for profile customization, opening a game and daily check-in. Eligibility, collection history and discovery ranks persist across refresh. These rewards do not change provider game balances.
- Profile name/avatar, Favorites, Activity History and Notifications use real local state. Only game openings and local reward claims are recorded; no invented bets, wins or transactions. Removed games are filtered from stored history, favorites and discovery. Settings mask the header balance and reduce interface motion, including stopping banner autoplay. Live Support previews an unsent message and FAQ; Blog contains original prototype guides. VIP, CoinBack, referrals, affiliate, crypto and redemption areas remain explicit program previews without external services.
- Search has its own page with live results, category/provider filters and name sorting. The header uses the selected monochrome LOOP concept as its current wireframe logo.
- Only the lobby includes promotional frames and the Popular, Slots, New Releases category bar. Its shelves are Popular, Slots, New Releases and finally Game Providers. Popular starts with 12 curated demo titles; it is not an analytics-based ranking. New Releases uses a verified subset of provider release dates recorded in collections.js.
- Categories, the provider directory, individual providers and search have independent URL routes. Provider pages include expandable details derived from the active catalog. Lists load 35 games at a time with Show more. Search and filters survive refresh; Back and Forward restore page scroll. Opening a game remembers its originating page.
- Clickable carousel titles and All buttons open the same complete collection; category and provider pages show their title.
- Provider detail views highlight Providers; selecting a game category highlights that category.
- Equal game-card sizes in carousels and grids. Game cover artwork is intentionally omitted.
- A reviewed 791-game catalog across six providers; Editor’s Favorites contains 15 candidates, with Nip Tuck first. Responsive suitability is being reviewed by the project owner.
- Removed games stay excluded from collections and direct game links, including original vendor-code aliases.
- One game iframe mounts below the header and is disposed when leaving the game. Provider readiness signals control the loading transition.

The wallet is local demo state and is independent of provider balances. Game engines load from external public demo services; their availability, mobile rendering and access screens are controlled by those providers. This prototype has no payments, deposits, withdrawals or shared provider wallet integration.

## Files

| Location | Purpose |
| --- | --- |
| `public/index.html`, `styles.css`, `wallet.css` | Page structure and styles |
| `public/routes.js`, `catalog-view.js`, `catalog-page-model.js`, `catalog-pages.css` | Page routing, independent catalog pages, filtering and pagination |
| `public/collections.js`, `game-types.js`, `provider-details.js` | Collections, verified release dates, game formats and provider summaries |
| `public/catalog.js`, `removed-games.js` | Reviewed games and permanent exclusions |
| `public/game-view.js`, `game-ready.js`, `game-presentation.js` | Game routing, lifecycle and presentation |
| `public/wallet.js`, `wallet-state.js` | Two-currency local demo wallet |
| `public/store-view.js`, `store-packages.js`, `store.css` | Store page, observed package values and preview dialog |
| `public/feature-pages.js`, `feature-view.js`, `feature-pages.css` | Member-area route identities, shared page shell and wireframe components |
| `public/rewards-pages.js`, `account-pages.js`, `member-state.js` | Lounge/rewards, account/services and validated local activity state |
| `public/site-menu.js`, `site-menu.css`, `site-search.js` | Desktop rail, mobile menu, tooltips and search-page entry |
| `public/mobile-nav.js`, `mobile-nav.css` | Mobile lobby actions, destination state and bottom safe-area layout |
| `public/hero-carousel.js`, `hero-carousel.css`, `assets/hero/` | Promotional banners, original artwork and carousel behavior |
| `public/vendor/embla-carousel/` | Pinned Embla Carousel browser module and MIT license |
| `public/assets/providers/` | Six genuine provider SVG marks and their provenance |
| `server.mjs` | Local static server restricted to public app files |
| `tests/` | Catalog exclusions, loader protocol and server-route checks |

All app imports and assets are relative so `public/` can also be hosted as static files. The local server uses the branded `/luckyloopcasino/` path.

## Page addresses

Routes use URL fragments so direct links and refresh also work on static GitHub Pages without server rewrites:

| Page | Fragment |
| --- | --- |
| Lobby | `#/` |
| Popular | `#/popular` |
| Slots | `#/slots` |
| New Releases | `#/new-releases` |
| Providers | `#/providers` |
| Single provider | `#/providers/netent` |
| Search | `#/search?q=Nip+Tuck` |
| Store | `#/store` |
| Lounge / Bonus Hub | `#/lounge`, `#/bonus-hub` |
| Daily Bonus / Missions | `#/daily-bonus`, `#/missions`, `#/free-money` |
| Membership | `#/vip-club`, `#/rank-system`, `#/coinback` |
| Promotions / Partners | `#/promotions`, `#/partners`, `#/invite-friends`, `#/affiliate-program`, `#/crypto-earn` |
| Account | `#/profile`, `#/history`, `#/favorites`, `#/notifications` |
| Services | `#/support`, `#/blog`, `#/settings`, `#/redeem` |

Provider/category filters and sorting are encoded in the fragment query. Existing `#game=…` links remain supported; launches from a page include a `from` parameter for refresh-safe return navigation.

Legacy `#/all-games` and `#/all` addresses redirect to `#/search`, preserving search, provider and sorting filters. All Games remains a search filter for the complete catalog, not a separate page or navigation entry.

## Hosting

The public site is hosted at [LuckyLoop Casino](https://jarmanarnar.github.io/luckyloopcasino/). `.github/workflows/pages.yml` checks the source and runs the existing tests before publishing only `public/` to GitHub Pages on each push to `main`. It can also be run manually from GitHub Actions. No installation, build process, server function or environment variables are needed. Keep the local server for development only; its legacy-path redirects apply locally.

Demo wallet state is saved per browser and origin. A phone or the hosted address starts with its own demo balance; it does not share balances with localhost.

## Responsive sizing

The header uses self-hosted Arimo Bold, matching the editable [LuckyLoop header library in Figma](https://www.figma.com/design/HFNWKij5h9moTbn1QNOivI?node-id=6-312). Phase 1 contains the header atoms, GC/SC wallet and lobby/game header variants, plus [375×812 baseline frames](https://www.figma.com/design/HFNWKij5h9moTbn1QNOivI?node-id=7-538). The rest of the interface retains its current typography pending the next design stages. Original coin SVGs remain editable vector components in Figma; no flattened UI screenshots are used as components.

The header is 64 CSS pixels tall at the default text size, plus any top safe-area inset. Its controls use consistent 36px mobile and 40px desktop heights. The content is capped at 1136px, with 16px mobile and 48px desktop gutters. Sidebar controls use 44px targets and 40px category rows. Shared `rem` tokens preserve user text preferences; breakpoints change layout roles rather than scaling every atom independently. In the mobile lobby the logo uses the space freed by the hidden top hamburger; game headers retain their separate narrow-screen layout.

Game cards keep an 8:11 aspect ratio and one width token shared by carousels and category grids. [Container queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries) choose one to eight columns from the available catalog width, with three columns on standard portrait phones. Cards divide that width equally, including gaps; at the full 1136px content width they measure 128×176px with 16px gaps. Browsers without container units retain the fixed-width fallback. Promotional banners are 216px tall on mobile and 188px on desktop, with one, two or three per view according to their container width. All lobby sections and the header share one content width and safe-area inset.

The Providers page uses equal flexible columns, with two provider tiles on standard portrait phones. Tiles fill the available row width and keep a 2.1:1 aspect ratio; logos remain contained without cropping or distortion. The home provider carousel keeps its existing compact tile dimensions.

Wallet text stays the same size throughout a balance animation. Layout measurements are invalidated by relevant width/font changes, while height-only mobile browser changes preserve the running counter. The header always stays in one row, with the plus beside the balance. The wallet stays centered while it fits and can move slightly within the free space between the back control and currency switch on narrow screens. Navigation controls have at least a 44px target at the default text size; the wallet plus expands its hit area without enlarging the artwork.

The layout follows [content-based responsive design](https://web.dev/articles/responsive-web-design-basics), [bounded fluid CSS sizing](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/clamp), and [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html). These sources inform the behavior; the numerical proportions are this project's design choices.

## Updating the catalog

`public/catalog.js` is the active reviewed catalog. Keep `removed-games.js` when importing new data or curating picks; the archived source list includes games the owner removed. Update provider counts when changing the active catalog. Keep real provider IDs and launch URLs unchanged when renaming the platform.

Provider trademarks and game content belong to their respective owners. Artwork sources are documented in `public/assets/providers/README.md`.
