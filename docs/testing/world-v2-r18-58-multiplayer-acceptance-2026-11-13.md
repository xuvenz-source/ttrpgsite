# Tabletop Forge — R18-58 genuine multiplayer QA acceptance and privacy-bounded capture

**13 November 2026 · Engineering staging only · NO release, SQL push, flag flip, merge or deployment.**

## Readiness and source of truth

Exact direct parent R18-57 PR #161 head `54aa1964ae54a55f6637a1ddaa9c8ac210aa6128`. The staged chain contains the frozen 83 historical migrations, eight reviewed **pending** R05/R18-48 SQL migrations, and the separately optional R18-57 fog optimization (NOT part of the eight). R18-55 delayed/dirty fog is a rejected production candidate; R18-26/27 mixed optimizations and rejected R18-40 client patch are also excluded.

**Production as inspected at start of this step**: Vercel alias `ttrpgsite.vercel.app` still serves R18-35 deployment `dpl_GtaJ4PoxHzXDpN7L46nka8Kqb8mN`; Supabase project `lwhwgqaunxbmvyndswze` remains PostgreSQL 17.11, **83 applied migrations**, newest `20261109171247`, with R05 absent. The R18-43 atomic feature flags remain OFF. The production test campaign does not contain an active real campaign.

**Genuine staging multiplayer acceptance is NOT yet available.** There is no already deployed integrated R18-57 test candidate and no independently signed DM, P1 and P2 accounts available through this connector. Sole-DM player preview, synthetic PostgreSQL accounts, locally spoofed receipts, CI browser DOM tests and self-reported declarations are NOT substitutes. Do NOT claim a speedup or fog-security proof on production from these artifacts.

## R18-58 additions

- `scripts/release/validate-world-v2-r18-58-multiplayer-qa.mjs`: read-only offline Node QA **triage**. It never connects to Supabase, invokes the official CLI, reads JWTs, writes a file or inspects private game data. Exact allowed fields, trace events, details, metric names, counts and statistical relationships are checked against the existing sanitized WorldTrace implementation. It reports role-by-role missing checks, telemetry coverage, source SHA match and safe aggregate p95 without returning raw per-event timelines or personally identifying data.
- `tests/world-v2-r18-58-multiplayer-qa.test.mjs`: adversarial synthetic tests for missing/duplicated roles, copied capture tags, mismatched test runs, stale/future timestamps, forged private fields, illegal events, impossible latency summaries, DM player preview incorrectly asserted as P1 and baseline-build mismatch.
- This operator procedure. **No frontend runtime, active SQL migration, release candidate source, permission, Vercel or feature flag mutation.**

## Real-person browser QA protocol when a release-eligible test deployment is separately approved

Three different people/accounts must test the SAME version SHA, same campaign test map and one run code, using **independent signed-in browser sessions**. Never share passwords, email addresses, raw Auth session cookies, JWTs, map geometry, signed visibility packets, coordinates or user IDs. Any evidence containing such information must be discarded rather than uploaded.

**DM (separate account/session, NOT player preview):** Verify continuous fast arrow movement, fast multi-cell drag, majority-of-token corner snapping, true immediate wall collision (never push-through-and-back), no major delay at note pins, fog editor stability, deliberate role/ownership revocation, canonical cell convergence with players, and zero board flashes while players move. In R58 receipt, use `role='dm'`. DM preview is allowed as an auxiliary test but never as P1/P2 evidence.

**P1 (independently signed player):** Verify fast arrow/drag/corner movement, immediate blocked-wall feedback and instant second drag after collision, private authorized fog (no unseen walls or private NPCs leaked), denied sight/movement after DM revokes permission *while a movement is in flight*, safe reconnect without stale sight, exact canonical cell convergence with DM/P2 and zero map flashing. In receipt use `role='p1'`.

**Passive P2 (third independent signed player):** Observe DM and P1 movement without moving own token; ensure only P2-authorized private visibility, no flashed scene or private geometry on revocation/reconnect, and final canonical cell convergence. In receipt use `role='p2'`. Passive P2 must obtain observer-authorized trace events; they cannot be simulated by DM preview.

Run the same 2–5 minute bounded simultaneous movement/fog/collision scenario. Include deliberately quick repeats and corner drags. Have all three browsers visible simultaneously or a reviewer explicitly observe their independent sign-ins. Capture before/after canonical locations in a **private authorized screenshot only** (not in JSON receipt). Observe Supabase RAM, lock waiters, active sessions and browser/network RPC p50/p95 separately; the trace's browser timer samples are not PostgreSQL server timings.

## Use the existing opt-in sanitized browser trace

1. After signing in to the intended test deployment, open the game with `?worldV2Trace=1` in the page URL. If the sign-in redirects or drops the query, add the parameter again after the campaign loads. Reload, confirm the token/map is in the correct test map, and check `window.__worldV2Trace` exists **locally**. No diagnostic code is required on normal production users.
2. If the app exposes a QA capture control, use its sanitized trace export. Otherwise DM or the operator can use the **Discord-safe command** below in Chrome DevTools. It spells the two underscore characters as ASCII codes rather than literal double underscores (Discord can otherwise mangle them). These commands do not transmit any trace:

    Clear before the 2–5 minute scenario:

    `window[String.fromCharCode(95,95)+'worldV2Trace']?.clear()`

    Copy the finished bounded trace (Chrome DevTools `copy()` helper):

    `copy(JSON.stringify(window[String.fromCharCode(95,95)+'worldV2Trace']?.snapshot(),null,2))`

3. A missing trace object or `enabled:false` means **NOT RUN**; do not invent events. The clipboard operation is local only, but do not paste private content into Discord. The raw trace allowlist intentionally stores no actor IDs, map/campaign IDs, token coordinates, server response payloads or hidden fog geometry.

## Building three private receipt records

The operator packages three reports as a **PRIVATE LOCAL** UTF-8 JSON array. Each record must have exactly this shape (example placeholder only; **NOT real evidence**, do not submit as PASS):

```json
{
  "schema": 1,
  "runCode": "R58-20261113-001",
  "role": "p1",
  "captureTag": "aaaaaaaaaaaaaaaaaaaa",
  "capturedAt": "2026-11-13T12:00:00.000Z",
  "buildSha": "54aa1964ae54a55f6637a1ddaa9c8ac210aa6128",
  "independentSignInDeclared": false,
  "independentBrowserDeclared": false,
  "previewMode": true,
  "checks": {
    "fastArrow": "not_run",
    "fastDrag": "not_run",
    "cornerSnap": "not_run",
    "solidWall": "not_run",
    "instantRegrab": "not_run",
    "privateFog": "not_run",
    "revocationDenied": "not_run",
    "safeReconnect": "not_run",
    "canonicalConvergence": "not_run",
    "noMapFlash": "not_run"
  },
  "trace": { "enabled": false, "limit": 256, "events": [], "counts": {}, "durations": {} }
}
```

Use a different random synthetic 20–32 lowercase-hex `captureTag` for each independent browser (for example, a new `crypto.randomUUID().replaceAll('-','')` shortened to 24 characters); this is NOT an account or session ID. Record the **verified deployed commit SHA**, not the head SHA of an un-deployed PR. Use the identical 6–36-character uppercase/digit/hyphen `runCode` for all three. Set `capturedAt` to exact UTC ISO 8601 and keep reports within one hour of each other and within 48h of validator execution. Every check is strictly `pass`, `fail`, or `not_run` based on actual observation. DM and P2 have their own named check sets; see `tests/world-v2-r18-58-multiplayer-qa.test.mjs` for the exact contract.

On operator-controlled machine (offline, no remote service):

```bash
node scripts/release/validate-world-v2-r18-58-multiplayer-qa.mjs \
  --receipts=/absolute/private/qa-receipts.json \
  --expected-build=<exact-reviewed-deployed-commit-sha>
```

The validator requires a functioning opt-in trace with at least five Advance and five Commit/Finalize samples for moving DM and P1, and at least one authorized/accepted observer event for passive P2. It checks source SHA, role and capture uniqueness, check completeness and timing sanity; it only emits aggregate reports and **always** returns `decision:NO_GO`, `safeToDeploy:false`. Even a complete set is only `selfReportedEvidenceComplete:true`; independently verified accounts, fog revocation and actual Supabase CLI results remain **false** pending separate operator verification.

## Go/no-go policy

**Block release** if any account is absent, preview substituted for a player, source build differs, telemetry is disabled/insufficient, a required check failed or was not run, canonical cells disagree, there is fog/LOS leakage or collision pushback, there is repeated rubber-banding/large release-to-terminal latency, the map flashes, or free-tier memory/lock/connection headroom is not measured. No generic 'looks good' checkbox overrides these blockers.

R18-58 cannot create genuine tester accounts, prove login from sanitized local traces or execute an authenticated linked Supabase CLI 2.81.3 session. The immutable 83+8 migration workspace + real `migration list` and `db push --dry-run` **must still be performed by an authorized operator** according to R18-51. The separate R18-57 opt-in candidate remains un-applied and intentionally outside those eight migration versions. Production release remains strictly NO-GO until every independent gate is reviewed and signed.
