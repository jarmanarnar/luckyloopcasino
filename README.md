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
npm run build
```

GitHub Pages publishes `dist/`. Each build versions stylesheet and module entry URLs and includes an import map for the same commit, so cached modules from an earlier release cannot mix with new page markup. Module source and provider assets stay unchanged; local development still serves `public/`.

## Current behavior

- Poppins is the shared app font, self-hosted in normal weights 400–800. `public/typography.css` defines the font assets and `--app-font-family`; headers, page text, controls, dialogs, chat and standalone loading screens use it. Startup waits for the font weights before measuring and revealing the layout.

- Interaction styling uses existing hover/pressed surfaces and text colors. Do not add focus outlines, glow rings, focus-triggered border highlights or selection frames to new components. The shared focus rule applies across the app, including chat and dialogs.

- Community Chat opens from the header and slides into a 360px right column on wide screens, resizing the lobby and header. On smaller screens it uses a modal drawer (full screen on mobile), with Escape, focus containment and background scroll locking. General/VIP demo rooms, quoted replies, emoji, per-player local message history and cross-tab updates work without a chat backend. Guests who select Chat see only the login dialog; the chat stays closed until opened by a signed-in user. Signing out closes the chat. The Rain card and its controls have been removed.

- A branded startup loader waits for account initialization, the requested route's real assets and 200ms of measured layout stability. It disappears as soon as these are ready, without waiting for animation cycles. Initial transitions and banner rotation stay disabled through the first revealed paint. Missing assets or startup failures offer a retry instead of exposing an incomplete page on a timer. Refresh retains the desktop sidebar width and restores the page scroll after rendering; mobile drawers stay closed on reload.
- The loader shows only the approved infinity at 120px wide. Its outline is traced from the approved PNG and inlined as SVG with critical styles, so it paints without an image request, bitmap decoding or per-frame canvas drawing. A white snake-like highlight completes a cycle in 1.8 seconds with a 25% trail. Background tabs pause motion; reduced motion shows a static infinity. Completion and errors stop animation and detach listeners.
- Guests see Login and Register in the header, a welcome card and a shared login/registration dialog. Public catalogs remain browsable; account, store and game actions require a local signed-in account. Google and Facebook buttons restore an existing local exercise account without remembered credentials. These buttons do not use external OAuth services.
- One IndexedDB account stores the profile, wallet and append-only transaction ledger. Reward credit and its ledger entry commit together, with operation keys preventing duplicate collection across tabs. Existing local balances and preferences migrate once. Profile and settings changes update the latest stored account. Currency switching counts from zero to the selected currency's balance over 720ms, without interpolating between unrelated GC and SC balances. Initial loading and reduced motion display balances immediately.
- Responsive promotional carousel containing four empty frames: one, two or three per view, circular touch/drag navigation, and a white pagination fill synchronized with automatic rotation. Interaction pauses both the countdown and fill; they resume together. Frames use the same shared surface and radius tokens as the game cards. The earlier artwork remains in `assets/hero/` for later design work and is not loaded by the frames.
- Fixed wallet header with a compact currency selector, a green BUY COINS Store action and a grouped profile/bonus/notifications area. The dropdown shows the actual GC and SC balances, marks the selected currency, and saves Hide Balance through the same account settings used elsewhere. Currency selection retains the balance count animation; masking applies to both the header and dropdown. Controls stay 36px high inside 44px shells, with a compact layout on mobile. The original plus component remains hidden in the document.
- Game cards open a refresh-safe page with an embedded player and GC/SC selection. Both the game page and legacy direct demo links require sign-in before a provider frame can mount. Logging out removes the frame, and currency changes cannot reopen it for a guest. GC uses the provider's public demo; SC shows the verification preview without loading a provider. Information, Description and related games remain below the desktop player.
- A persistent 72px desktop icon rail expands to 232px. Its hamburger and BUY/REDEEM controls precede search, a Daily Bonus banner and grouped casino, reward, membership, partner, account and support destinations. Compact icons show accessible custom tooltips; expanded rows show labels. Below 45rem (720px at the default text size), the menu slides above the page, ending at the permanent 63px bottom bar. The bottom navigation stays in place throughout opening and closing. The covered page is inert, keyboard focus stays within the menu and bottom bar, Escape dismisses the menu and its content scrolls independently. BUY opens Store; REDEEM opens a clearly marked preview. The sidebar stays visible beside games on desktop. The game stage fills the available area below the header down to the viewport bottom during active mobile games, with no outer gap, border or rounded corners.
- Mobile navigation provides Menu, Store, Lobby, Redeem and Profile in that order below the same 45rem boundary outside active games. Lobby sits in the middle and uses the approved infinity from the header wordmark. Search and Providers remain available in Menu. The sidebar starts its casino destinations with Popular, Slots, Tap Games, Instant Win, Scratchcards, Crash, Table Games, Video Poker, New Releases and Providers. Search is the complete game catalog; the former All Games destination redirects there. The top hamburger is hidden while the bottom bar is present. The fixed bar is 63px high with no added bottom safe-area inset, including in standalone mode; matching content padding keeps the last row visible.
- On phones, opening a game fills the dynamic viewport below the original site header in portrait and landscape. The original logo, wallet, BUY COINS and profile controls stay visible; there is no second player toolbar. Supported browser fullscreen is available from the existing profile menu and includes the whole page so the original header remains usable. The sidebar, bottom navigation and game details are hidden; returning to the lobby restores them. Theater mode is a desktop control only. Native fullscreen failure leaves the mobile viewport layout intact, and closing the player cancels pending fullscreen entry.
- Desktop BUY COINS and sidebar BUY open the Store dialog over the current screen. Mobile Store and direct Store links open a page. Both use the same seven USD packages, each with a GC amount and a free SC amount. Package selection and Redeem open the two-step phone verification demo.
- Daily Bonus, Free Money, VIP Club, CoinBack and Invite Friends have independent pages. Rank System, Partners and Affiliate Program are independent wireframe pages inspired by the organization of Qzino. No competitor artwork, program qualification or financial promises are imported.
- Daily Bonus grants local demo GC once per device-local calendar day, advancing a seven-day streak. Three introductory tasks in Free Money grant one-time demo GC for profile customization, opening a game and daily check-in. Eligibility, collection history and discovery ranks persist across refresh. These rewards do not change provider game balances.
- The sidebar Daily Bonus banner uses a gold gift illustration, shows the actual next GC reward, and switches its badge from Ready to the time remaining after collection. It updates on member changes, visibility changes and the next calendar day; there is no duplicate Daily Bonus row. The former Promotions page and its navigation links have been removed.
- Profile name/avatar, Favorites, Activity History and Notifications use real local state. Game openings and reward claims appear in activity history; Transactions includes opening balances and committed rewards from the account ledger. No bets or wins are invented. Unknown game IDs are filtered from stored history, favorites and discovery; restored game IDs remain valid. Settings mask the header balance and reduce interface motion, including stopping banner autoplay. Live Support previews an unsent message and FAQ; Blog contains original prototype guides. VIP, CoinBack, referrals, affiliate and redemption areas remain explicit program previews without external services.
- Search has its own page with live results, category/provider filters and name sorting. The existing monochrome LOOP wordmark is traced into a tightly bounded SVG and displayed in a 104×32px desktop header box. Header and promotional logos use normal contained sizing without CSS enlargement, translation or clipping. Compact header and mobile navigation marks use the existing infinity vector; the padded PNG remains as reference artwork.
- How to Play sits immediately below Settings in the sidebar and opens a three-step modal explaining the GC and SC modes with the original coin artwork. Previous/next arrows, keyboard arrows, Escape and OK work on desktop and mobile. OK closes the explanation and restores focus without navigating, preserving the current page, scroll and any running game. The former bottom-of-menu accordion has been removed.
- Partners is a closed-by-default sidebar disclosure containing Referral (the existing Invite Friends page) and Affiliate. Its children open within the same container, separated by a divider. In the desktop icon rail, selecting Partners expands the sidebar and its group; selecting a child in the mobile menu closes the menu before navigation.
- Only the lobby includes promotional frames and the Popular, Slots, Tap Games, Instant Win, Scratchcards, Crash, Table Games, Video Poker and New Releases category bar. A full-width search field below the category bar shows live results in place; clearing it restores the lobby shelves. It has no bright focus border. Shelves are Popular, Slots, New Releases and finally Game Providers. Game shelves contain up to 24 games followed by a View All card with the full collection count. Arrow navigation keeps the last visible card as the first card after the next click. A nonempty Favorites collection appears in the sidebar and opens its own page; Favorites has no lobby carousel. Popular starts with 37 curated demo titles; it is not an analytics-based ranking. New Releases contains the latest 100 active titles by verified provider release date, selected from all 823 verified dates in game-releases.js. Newest first sorting is also available within searches, providers, favorites and game formats that have verified dates. Unknown dates sort after dated games and are never guessed from an import, page creation or software update date.
- Categories, Favorites, the provider directory, individual providers and search have independent URL routes. Favorites shares the catalog's exact portrait game cards, search, provider filter and pagination, with Recently saved and name sorting. Empty collections and searches with no matching favorites have separate recovery actions. Profile shortcuts and game detail hearts use the same persisted member collection. Provider pages include expandable details derived from the active catalog. Lists load 35 games at a time with Show more. Search and filters survive refresh; Back and Forward restore page scroll. Opening a game remembers its originating page.
- Header Back controls on member pages, catalog/search/provider pages and pre-game details always navigate directly to the lobby, regardless of the previous page. Browser history remains available through native Back and Forward.
- Invite Friends, Affiliate Program, My Profile and Activity History omit the visible page header. Notifications keeps its heading without the Back control. Favorites is the first casino sidebar destination, immediately above Popular, and no longer appears in the account group.
- Clickable carousel titles and All buttons open the same complete collection; category and provider pages show their title.
- Provider detail views highlight Providers; selecting a game category highlights that category.
- Equal game-card sizes in carousels and grids. Official local artwork covers 272 games: the original 15-game Playin sample and all 257 imported Hacksaw games. Hacksaw JPEGs retain their downloaded bytes and use contained sizing to preserve complete game titles. Official Playin thumbnails are matched by game tableId, stored locally as pixel-identical lossless WebP, and shared by catalog cards, details and related games. Covered cards omit the duplicate studio caption; cards without artwork, including failed covers, retain it. Titles remain as fallbacks for missing covers; optional artwork failures do not block startup. Source pages and CDN URLs are recorded in `public/assets/games/README.md`.
- A reviewed 1,080-game catalog across seven providers; Editor’s Favorites contains 14 candidates, with Nip Tuck first. Responsive suitability is being reviewed by the project owner.
- All 33 previously excluded games were restored on 2026-11-01, retaining existing local IDs and original provider demo URLs. Formats distinguish Slots, Tap Games, Blackjack, Roulette, Baccarat, Casino Poker and Video Poker. Table Games groups the four casino table formats; Live Casino is not inferred from table gameplay or an unverified source flag.
- One game iframe mounts below the header and is disposed when leaving the game. Provider readiness signals control the loading transition.

The wallet is local demo state and is independent of provider balances. Game engines load from external public demo services; their availability, mobile rendering and access screens are controlled by those providers. This prototype has no payments, deposits, withdrawals or shared provider wallet integration.

## Files

| Location | Purpose |
| --- | --- |
| `public/index.html`, `styles.css`, `wallet.css` | Page structure and styles |
| `public/bootstrap.js`, `app-readiness.js`, `app.js` | Startup loading, asset/layout readiness and recoverable initialization |
| `public/auth-view.js`, `auth-routing.js`, `auth.css` | Guest/member presentation, local registration and guarded navigation |
| `public/demo-account*.js`, `demo-credentials.js` | Atomic IndexedDB account, wallet ledger, tab synchronization and hashed local credentials |
| `public/routes.js`, `catalog-view.js`, `catalog-page-model.js`, `catalog-pages.css` | Page routing, independent catalog pages, filtering and pagination |
| `public/collections.js`, `game-types.js`, `provider-details.js` | Collections, game formats and provider summaries |
| `public/game-releases.js`, `scripts/import-release-calendar.mjs` | Verified release days for the 823 original catalog games, source pages and repeatable snapshot import; unverified additional-provider dates stay unknown |
| `public/catalog.js`, `hacksaw-games.js` | Reviewed catalog, restored games and verified additional provider records |
| `public/hacksaw-demo.html`, `hacksaw-demo.js` | Dedicated public demo launcher, isolated from catalog browsing |
| `public/game-artwork.js`, `game-artwork-view.js`, `assets/games/` | Official game-cover sample, rendering and source provenance |
| `public/game-view.js`, `game-ready.js`, `game-presentation.js` | Game routing, lifecycle and presentation |
| `public/wallet.js`, `wallet-state.js`, `wallet-menu.js`, `wallet-header.css` | Two-currency local wallet, currency menu, balance visibility and header controls |
| `public/store-view.js`, `store-packages.js`, `store.css` | Store page, observed package values and preview dialog |
| `public/feature-pages.js`, `feature-view.js`, `feature-pages.css` | Member-area route identities, shared page shell and wireframe components |
| `public/rewards-pages.js`, `account-pages.js`, `member-state.js` | Rewards, account/services and validated local activity state |
| `public/site-menu.js`, `site-menu.css`, `site-search.js` | Desktop rail, mobile menu, tooltips and search-page entry |
| `public/how-to-play.js`, `how-to-play.css` | Three-step GC/SC explanation dialog |
| `public/mobile-nav.js`, `mobile-nav.css` | Mobile lobby actions, destination state and bottom safe-area layout |
| `public/hero-carousel.js`, `hero-carousel.css`, `assets/hero/` | Promotional banners, original artwork and carousel behavior |
| `public/vendor/embla-carousel/` | Pinned Embla Carousel browser module and MIT license |
| `public/assets/loop-wordmark.svg`, `loop-infinity.svg` | Tightly bounded vectors of the existing wordmark and compact infinity |
| `public/assets/providers/` | Seven genuine provider SVG marks and their provenance |
| `server.mjs` | Local static server restricted to public app files |
| `tests/` | Catalog restoration, release provenance, provider launch validation, game formats, loader protocol and server-route checks |

All app imports and assets are relative so `public/` can also be hosted as static files. The local server uses the branded `/luckyloopcasino/` path.

Member pages use title-only headers, matching the catalog. Daily Bonus, VIP Club, Rank System, Free Money, Store and Redeem open directly with content, without a visible heading/back row; their accessible headings remain available. Repeated introductory descriptions and prototype explanation paragraphs have been removed from page openings.

## Page addresses

Routes use URL fragments so direct links and refresh also work on static GitHub Pages without server rewrites:

| Page | Fragment |
| --- | --- |
| Lobby | `#/` |
| Popular | `#/popular` |
| Slots | `#/slots` |
| New Releases | `#/new-releases` |
| Favorites | `#/favorites` |
| Providers | `#/providers` |
| Single provider | `#/providers/netent` |
| Search | `#/search?q=Nip+Tuck` |
| Store | `#/store` |
| Daily Bonus / Free Money | `#/daily-bonus`, `#/free-money` |
| Membership | `#/vip-club`, `#/rank-system`, `#/coinback` |
| Partners | `#/partners`, `#/invite-friends`, `#/affiliate-program` |
| Account | `#/profile`, `#/history`, `#/notifications` |
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

`public/catalog.js` is the active reviewed catalog. All prior manual exclusions were revoked by the owner on 2026-11-01. Preserve existing local game IDs and original launch URLs, avoid duplicate provider game codes and update provider counts when changing the catalog.

`public/game-releases.js` contains general release dates for all 823 games, observed in the official calendar on 2026-11-01. It records the source game page and verification date for each original Playin title. The additional Hacksaw catalog does not supply general release dates, so those 257 titles remain undated and do not enter New Releases. These dates are distinct from demo release, content creation, import and modification dates. The newest 100 released games form New Releases.

To update dates from a fresh, rendered official calendar snapshot, run `npm run catalog:releases -- <snapshot.json>`. The JSON must contain `source: "https://games.nolimitcity.com/"`, `observedOn: "YYYY-MM-DD"` and a `games` array of `{ title, date, url }` entries. Read the displayed date element separately from the title (titles ending in digits must not be concatenated with the date). The importer requires a unique complete-title match for every active game from that Playin source and rejects invalid dates, missing matches, duplicates, future active releases and unexpected source pages. Run the existing tests after importing. This is an explicit import, not a background synchronization job.

Provider trademarks and game content belong to their respective owners. Artwork sources are documented in `public/assets/providers/README.md`.

## Additional provider demos

Hacksaw Gaming adds 257 official public-demo titles, checked on 2026-11-01: 190 Slots, 14 Instant Win, 52 Scratchcards and one Crash game. Their numeric provider IDs, names, source section formats and thumbnails come from https://www.hacksawgaming.com/games. Each imported public demo version document and game client returned HTTP 200; every thumbnail was downloaded unchanged. Provider logo and image provenance are recorded in the assets directories.

Catalog and details browsing mount no provider frame. Play opens a local wrapper that loads the official public launcher SDK. It resolves the current game version with the public demo partner and demo mode, without a private operator key or stored player session. The SDK callback is used on both desktop and mobile to keep the game inside the site. The resolved URL must match the selected numeric game ID, official static origin and public demo mode.

The wrapper hands the screen to the provider loading/intro scene after the provider document loads; this is recorded as provider loading, not engine readiness. Messages are accepted only from the active same-origin wrapper with the matching game ID. Errors follow the error path, and stale callbacks are ignored after disposal. No timer marks the game ready. The game balance remains the provider demo balance, separate from the local account wallet.

## Interface colors

All interface colors are defined in `public/theme.css`, loaded before component styles and the startup loader. Use its semantic tokens for page, panel, control, hover/selected, border, text, action and error roles. Wallet, Rewards, Profile, Notifications, Store, authentication and chat share the same panel color. Titles stay white in both GC and SC modes; changing currencies must not override application colors. Gold and mint identify currencies or explicit reward/rank meaning, while lime identifies actions. Provider artwork, currency illustrations, external brand marks and opacity masks are the only exceptions to token-based UI colors.
