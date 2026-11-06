# Performance & redundancy audit — 7 November 2026

## Scope and safety boundary
Review of GitHub `xuvenz-source/ttrpgsite`, based on `stage/dm-map-environment-tools` at commit `768fd860b447592087c48531983965b1e01ef758`, with production `main` at `e0c0215e878eb2fbcf632d1cb7d6711b3afd2ac8`. The staged tree contains 137 tracked files (~891 KB uncompressed; excluding dependencies). Source review focused on render hot paths, live-map networking, editor updates, image management, CI and tests. This is a static review, **not** a browser performance profile, database query benchmark, security certification or exhaustive audit.

Never remove RLS, authoritative database writes, optimistic-write reconciliation, packet validation, private map channels or stale-response protections to gain speed. Never alter existing schema contracts or public player visibility to optimize presentation.

## Implemented low-risk improvements (this isolated branch)
1. **MapEnvironmentOverlay**: pointer movement only updates the connected-line hover coordinate when that grid position changes. Other tools no longer set unused hover state; freehand pen still appends points during drawing. This avoids repeatedly reconciling up to 2,500 SVG environment objects on movement that doesn't affect the preview.
2. **MapSettingPanel**: memoize `normalizeEnvironment(environment)` by the incoming immutable environment reference. Unrelated parent renders no longer re-copy every prepared object.
3. **Board in main.jsx**: derive one visible-token collection for token art and monitor layers; calculate status placement once per render; calculate each token's hover status titles once, rather than normalizing the same status list twice. Player/DM visibility conditions and token/monitor stacking remain unchanged.

These updates are deliberately local. No backend, migrations, RLS, user-visible rules or persistence format changed.

## Findings and priorities

### High priority — tabletop render isolation
`src/main.jsx` is ~2,661 lines and owns campaign state, chat, character sheets, maps, tokens, timing, RPCs and a board. Board renders token art and monitor nodes in two full collection passes and re-renders during local drag previews, remote movement and measurement interactions. This multiplies work with token count. **Next**: use React Profiler with 10/50/100 visible tokens during drag and chat; then extract memoized token/monitor layers or a subscription-driven move preview so unrelated state doesn't reconcile all nodes. Avoid a full App rewrite in one commit.

### High priority — redundant network reconciliation
`src/main.jsx` registers Realtime chat updates **and** a visible-tab chat poll every 4s (`~759–776`), and Realtime character-roster updates **and** an 8s roster poll (`~778–798`). In addition, the map_tokens Realtime handler re-fetches tokens and monitor RPCs for **any** token change in the campaign (`~747–750`), even when the current viewer's map is unaffected. These are intentional reliability fallbacks, but contribute repeated requests. **Next**: instrument request counts / Supabase latencies and separate event-triggered refreshing from longer, adaptive stale-connection reconciliation. Never simply disable the fallback.

### High priority — broad campaign reloads
A `campaigns` Postgres change causes `fetchCampaign(activeId)` (`~747`), which fetches approximately eleven different campaign-related resources in parallel (`~185–197`). A small campaign metadata update can therefore reload chat, templates, maps, roster and more, with unnecessary UI-state churn. **Next**: inspect trigger event payloads and refresh only the changed resources; keep the first-load snapshot and map routing authority intact. Add tests for switching campaigns while old requests are still in flight.

### Medium priority — image URL refresh overhead
`src/Artwork.jsx` creates one 54-minute interval for each mounted piece of art; its cache reduces repeated signing, but has no eviction. `src/main.jsx` independently signs all map images when the map list changes (`~878`). **Next**: profile mounted images and signing calls, then use a shared expiration-aware cache and one scheduler if justified. Signed URL expiry and access permissions must remain enforced.

### Medium priority — save write amplification
`saveMapEnvironment` in `src/main.jsx` (`~1464–1485`) serializes an entire normalized environment and queues a Supabase upsert after every editor input change. This provides reliable write ordering but can generate many full-JSON writes for rapid settings edits, especially on complex maps. **Next**: retain optimistic UI and serialized commits while adding a well-tested, trailing-edge debounce / flush-on-navigation solution. Never drop the final write or allow an old map's write to overwrite a new map.

### Medium priority — test / CI coverage
The existing `.github/workflows/verify-staged.yml` successfully verifies the staging branch (unit tests, Vite build, Deno check), but its push trigger explicitly names branches and does not include `main`. Some tests examine source text rather than runtime behaviour. **Next**: extend PR/main CI after reviewing Action costs and branch protections; introduce React interaction tests and multiplayer reconnect/drag tests before performance-related refactors.

### Low priority — stylesheet duplication and component boundaries
`src/style.css` is ~140 KB and `src/main.jsx` ~138 KB, making global style changes and cross-component optimizations riskier. **Next**: audit CSS specificity and unused selectors with browser coverage before deleting them; progressively extract cohesive map/chat/sheet modules. Do not use bulk deletion or automated rewrite against active staging work.

## Release and verification gate
- This branch intentionally differs from the DM map staging branch only in localized render optimizations, a review document and verification workflow configuration.
- Run the existing Node unit suite, Vite build and Deno checks in GitHub Actions.
- Before merge or production promotion, manually compare DM wall line/pen tools, multi-token movement, token status hover labels, player-hidden tokens, monitors, map layer show/hide, saving and map switching.
- Treat improvements as **expected reductions in unnecessary work**, not proven FPS/latency gains, until browser and network measurements are taken.
- Do not merge this branch into `main` or deploy to production without explicit release approval.
