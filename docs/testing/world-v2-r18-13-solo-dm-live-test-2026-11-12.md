# B10-R18-13 — Solo-DM live-canary field protocol

**12 November 2026 · Stage-only QA preparation / no deploy.** Parent: exact verified R18-12 PR #114 HEAD `163b655e2655e35d23abc7ce1a38c83387df048b`. Live production currently **R16** `90df8c960e79e8d66c322095611427da7bb09de4`, Vercel production deployment `dpl_3US3Jm1P6iYSnuZeFAUbyLrfrr1g`, READY and rollback candidate. No R17/R18 staging branch has been merged. No changes to production SQL, environment flags or runtime are authorized here.

## What one DM can and cannot establish

**Can measure:** actual normal-DM mouse grab/start/release/commit, rapid keyboard, server RPC p50/p95, client input lifecycle, wall/fog collision stalls, screen flashing, duplicate sprite/terrain recreation, visual canonical drift after commit, zoom, idle redraws; and **local** DM player-preview movement/virtual fog independently.

**Cannot establish as one logged-in DM:** independently authenticated P1/P2 realtime delivery, passive Player 2 token convergence, recipient-specific private channel ACL, independent player fog/LOS revocation, network permission changes for other accounts, or observer sequence-gap fix on an actual player's separate client. DM preview is intentionally **local**; two tabs logged into the same DM account do not become two independent player identities. These are mandatory later before SQL release/guarded observer activation.

A single human **could** optionally test multiple separately authenticated accounts (normal app sign-in in an incognito profile with an existing disposable test-player account); that would be genuine cross-account evidence, unlike same-DM-tab preview. This option is NOT needed to perform the basic solo-DM smoke pass. Never share credentials or weaken membership/RLS rules for testing.

## Live starting point and no-change controls

- On 12 November, read-only Vercel confirms READY production is still R16 `90df8c9`; the V2 observer recovery and guarded recovery environment keys are not configured in the inspected project environment inventory.
- Supabase connected free project `lwhwgqaunxbmvyndswze` remains the existing project. Last completed live SELECT-only preflight: 83/83 historical migration bodies unchanged, 7/7 original server function MD5 matches, 0 active unexpired gestures, no partial R05 install, anon/private grants unchanged.
- No additional paid preview database, Supabase branch, SQL migration, WebSocket channel, rollout flag or server log instrumentation is necessary to capture R16 baseline. Existing V2 `WorldTrace.js` is available on R16 and opt-in only.
- Use the **testing campaign only**, a DM-controllable token and a published map with one open route, a solid wall and (if available) an existing fog/light boundary. Do not delete maps, characters or campaign assets for this smoke.
- Before an approved frontend canary, no deployment should occur. After user **explicitly approves frontend only**, build `VITE_WORLD_V2_OBSERVER_RECOVERY=1` and leave `VITE_WORLD_V2_OBSERVER_GUARDED_RECOVERY` OFF, merge/deploy one verified consolidated branch, **without SQL**. Both client R16 baseline and approved canary use this identical test.

## Browser setup — three small commands, no Discord formatting

1. Open the test campaign in Chrome or Edge **as the DM**. Add `worldV2Trace=1` to the address: if no query parameters, append `?worldV2Trace=1`; otherwise append `&worldV2Trace=1`. Reload and let the map finish rendering.
2. Open Developer Tools (F12) → **Console**. Verify:
   ```js
   typeof window.__worldV2Trace?.snapshot === 'function'
   ```
   Expected `true`. If false, stop and report it; don't paste credentials or run network scripts.
3. **Before each separate scenario**, enter:
   ```js
   window.__worldV2Trace.clear()
   ```
   **After each scenario**, enter:
   ```js
   copy(JSON.stringify(window.__worldV2Trace.snapshot(), null, 2))
   ```
   The result is copied to the clipboard in Chrome/Edge DevTools. Paste it into ChatGPT labelled `idle`, `open`, `collision`, `fog`, or `preview`. The snapshot is bounded and whitelists event categories; it does not include token IDs, coordinates, wall geometry, user names, auth tokens or full SQL. Do **not** paste DevTools Network headers, URLs with session tokens, or raw app state. If `copy` isn't available, evaluate `window.__worldV2Trace.snapshot()` and copy its displayed JSON using DevTools.

## Five separate capture scenarios

| Phase | Exact DM action after `clear()` | What to record visually | Expected engineering evidence |
| --- | --- | --- | --- |
| `idle` | In normal DM mode, no active movement or edit; leave tab foreground for **40 seconds** | Any map flash, token disappearance, fog repaint or image reload | No unexpected terrain reassignment, sprite recreation, fog-full or permission seal after a stable clear. A 12-second signed recovery may legitimately fetch sight on the **later** opted-in canary, but should not visually remount the map |
| `open` | Normal DM view: select one token, **10 rapid arrow steps**, then **5 short mouse drags** across open floor. Do not alternate accounts | Delays between arrows, drag latency, rubber banding, token endpoint vs approved cell, entire map flash | Actual `authority.begin/advance/commit` timings, movement approvals/commits, no unexplained observer/renderer seal or sprite recreation. Record p95 and subjective responsiveness |
| `collision` | Normal DM view: approach a known **solid wall** with repeated arrows and a dragged path into/along it (about 5 contacts) | Any visual penetration before bouncing out, blocked movement, stalls, wall sliding | `movement.blocked`, RPC tails, no unapproved canonical crossing. No wall penetration is acceptable even if an animation appears temporarily out of bounds |
| `fog` | Normal DM view on the testing map: drag near a published **fog boundary/light source** and toward a solid wall 5 times, without editing its geometry during this phase. Skip if map has no fog | Stalls near fog, full screen black flash, flickering tokens, fog redraw at token move | Correlate `renderer.fog-full` / `fog-partial`, `visibility.rpc` and `authority.advance` p95. A full redraw may be valid if sight changes; distinguish a necessary fog change from an entire terrain/sprite remount |
| `preview` | Enter DM **player preview** using an actual assigned player identity if present. Wait for it to settle, **then clear()**. Move one preview-owned token through open space and against fog/wall; leave preview and check real canonical token was not moved | Preview smoothness, virtual fog/LOS, private walls hidden, player-visible NPC roster, real token position unchanged on exit | Preview uses local movement authority; no live `authority.begin/advance/commit` timings should be generated *during the cleared preview interval*. This is not a real observer-side Realtime test |

If a step cannot run (e.g., no valid preview player or fog map), report `not tested`. **Do not substitute a fabricated pass.** Record browser type, whether the campaign was loaded/reloaded mid-test, subjective delay (none / mild / severe), rough number of flashes, and whether tokens ever appeared on the wrong side of a wall. A short screen recording of a failed case is useful; it is optional.

**Console sanity:** call `clear()` *after* entering a stable preview to avoid counting loading and old in-flight requests. The trace retains up to 256 recent events, but cumulative counters and bounded latency distributions continue independently; use separate phase captures rather than one continuous all-day trace.

## Offline engineering triage

The optional repository-only analyzer `scripts/qa/world-v2-solo-dm-analyze.mjs` accepts these trace snapshots as local JSON files. It never reads credentials or invokes a browser, server, API, SQL or network. Example for an engineer (not required for the DM):

```bash
node scripts/qa/world-v2-solo-dm-analyze.mjs \
  --idle=/private/qa/idle.json \
  --open=/private/qa/open.json \
  --collision=/private/qa/collision.json \
  --fog=/private/qa/fog.json \
  --preview=/private/qa/preview.json
```

A scenario marked `observed` means its trace is syntactically sound and has no encoded automatic blocker; it does **not** mean production acceptance. `investigate` flags unexpected idle fog/terrain/sprite churn, authorization seals during movement, or live movement authority usage in preview. `inconclusive` indicates missing movement or collision evidence. 750ms p95 flags are **diagnostic alerts**, not release acceptance thresholds. No renderer JavaScript frame timing is a substitute for browser presentation, no console trace proves actual wall penetration or passive observer convergence. Correlate reports with DM observations and current free-tier RAM/CPU screenshots if available.

### Comparison and release gates

Keep **two separate sets** of captures: `R16-before` and later `R18-client-canary-after`, same map/token/browser if possible. Compare p50/p95 of movement begin/advance/commit and sight, `renderer.fog-full`, `renderer.terrain-assign`, sprite create/remove and sealed observer frames; record fog collision symptoms. On a later canary, observe at least two 12-second foreground intervals without unexpected redraws. At this stage **NO-GO** if unapproved wall crossing, leaking hidden geometry, unexpected scope, repeating map flash/seals, or major regression in performance. A green solo-DM pass authorizes **only continued investigation**, never R05 SQL or guarded R18-04 activation.

Before SQL installation: genuinely independent authenticated P1 and passive P2 tests remain required; so does the safe linked CLI rehearsal. The site can remain under DM-only testing until those become available. Never redefine local DM preview as cross-client user acceptance.

## Handoff / pending decisions

**Production frontend approval: NOT GIVEN** by "prepare for live-test"; **production SQL approval: NOT GIVEN**. R18-12 canary source remains staged; this step adds only QA tooling, tests and docs. The proposed recovery flag is embedded at Vite build time, so explicit frontend canary approval and a verified new Vercel build are required before exercising its runtime behavior. Until then, collect the **current R16 DM baseline** safely.
