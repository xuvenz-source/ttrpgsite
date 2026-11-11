# B10-R08 — Designer-reported PR #70 failure triage and zero-deploy trace plan

**11 November 2026, Melbourne.** Status **STAGED / LIVE RELEASE NO-GO**. Parent [R07 PR #92](https://github.com/xuvenz-source/ttrpgsite/pull/92) at `d626f8b60f2d76995d40a5167291951800241050`. Live main/READY Vercel deployment remains `b246b3a72537b53b2afc2a9a38cbe1db3609a8af` (PR #70). Database unchanged: 83 applied migrations, latest `20261109171247`. No Vercel deployment, migration, feature flag, campaign edit or purchase.

## Baseline received

The designer completed all six R07 baseline cases. **FAIL:** BASE-01 normal DM movement, BASE-02 DM player preview, BASE-03 player-owned movement, BASE-04 remote movement/flashing, BASE-05 repeated movement. **PASS:** BASE-06 reconnect.

**This is a validated user-reported outcome, not a reproducible developer-observed test trace.** The report does *not* say which individual drag or arrow substeps failed, how bad each lag was, or whether each flash was a terrain reset, fog opaque frame, sprite remount or network stall. No exact p95, count of flashes, videos, or independently authenticated test-session evidence accompanied the binary results. The protected fog/collision fixture remained OFF. Never fill these gaps with invented facts or claim A06's 24-case matrix passed.

Machine baseline: `staging/world-v2-b10-r08-baseline-results.json`.

## Read-only code and live database analysis

The actual **production** MovementController still processes Begin -> 1+ sequential Advance RPCs -> Commit, with authoritative visibility refresh on completion. The pre-existing private stream and renderer separately acquire and reconcile signed sight. These are distinct possible causes of poor responsiveness and flashing. Staged B05 coalescing can reduce sequential network waits, but its SQL-side contract is not live and turning on B05/B08 client switches without R05 SQL is prohibited.

Read-only `pg_stat_statements` (cumulative since an older reset, multiple releases, not representative of this latest six-case test) observed: Begin 274 calls mean 24.2 ms; Advance 471 mean 53.8 ms; Commit 231 mean 128.1 ms; signed visibility 702 mean 46.2 ms. This **excludes RTT, frame time, observer fanout and current-release-only p95**. It suggests sequential request overhead matters but cannot diagnose map flashing or which of six cases failed at the UI level.

**Direct release consequence:** Hold the proposed R02 client-only canary from R07. R02's 6-second signed sight polling is a recovery fallback for lost/stranded observer updates, not a fix for initial drag/arrow/preview regressions. Adding its extra DB load before identifying the failure may make the free-tier experience worse. Also defer R05 server SQL (history mismatch and global R03 client compatibility remain blockers). Reconnect passing makes it a *lower diagnostic priority*, not proof there is no viewer authorization issue.

## No-deployment telemetry available RIGHT NOW on PR #70

**Source verified:** `src/engine/v2/WorldTrace.js` on production main already offers an in-memory, opt-in, bounded, sanitized trace. It records only whitelisted event names, details and aggregate times (no identities, coordinates, tokens, private map data, session keys or payloads). No network upload, local storage or paid service.

1. Open the existing [live site](https://ttrpgsite.vercel.app), sign in normally, navigate to the real campaign/map, then append **`?worldV2Trace=1` to the end of that final map-page URL** (use `&worldV2Trace=1` if it already has a `?`). Let the page reload; ensure the parameter survives any redirect. Do not share the complete private map URL.
2. Run only 1–2 failed normal DM movements (first drag and short arrow sequence). If feasible, switch to DM player preview and repeat. In browser DevTools Console (F12), enter **`JSON.stringify(window.__worldV2Trace?.snapshot())`** and send only that resulting sanitized JSON. If it returns `undefined`, the parameter was lost or the console is in another frame.
3. Prefer one independently authenticated Player1 profile: repeat one failed drag/arrow gesture while Player2 watches. Capture Player1 and observer Player2 trace separately. Repeated sampling only if needed. After a capture, `window.__worldV2Trace?.clear()` resets counters for a clean second drill.
4. Optional brief video of observer flashing is useful; do not record private hidden NPCs, unshared fog areas, passwords, Network-tab responses, cookies or session tokens.

Source event families used for classification are enumerated in `staging/world-v2-b10-r08-trace-plan.json`; never interpret a missing event as proof of no backend work unless the same trace confirms it was active.

### Falsifiable hypotheses — no diagnosis claimed

| Trace evidence | First code region to inspect |
|---|---|
| pointer status but no `movement.grabbed` | native pointer capture / picking / ownership / viewer authorization |
| grabbed but long `authority.begin`, unapproved or repeated denials | Begin–Advance–Commit and server session/ACK |
| movement approved yet terrain assignments, full fog paints or renderer seals correlate with flashes | V2 visibility/renderer authority reconciliation and terrain ownership |
| observer resync/unknown-piece/sequence gaps correlate with viewer flashing | private observer stream / signed viewer sight |
| preview failure with no ordinary Begin/Commit | virtual player-effective sight refresh, local preview input/renderer |

The test map currently has **automatic fog and collision OFF**. No wall-crossing or concealed NPC acceptance verdict is meaningful until a protected test fixture is prepared. No new test database is needed.

## Release / handoff

- **STEP:** B10-R08
- **STATUS:** STAGED, diagnostic classification prepared; all six designer baseline results recorded.
- **SCOPE:** read-only live source/catalog + existing opt-in trace handoff, one machine-readable evidence matrix and a non-brittle prior step test.
- **EVIDENCE:** User 5 FAIL / 1 PASS; live current main and cumulative SQL stats; source of opt-in trace verified. **No** actual browser trace uploaded or observed yet.
- **SECURITY:** unchanged server-owned fog, collision and role checks. No new RLS grants, token publication or telemetry endpoints.
- **SQL / DEPLOYMENT:** none. R02 canary and R05 migration held.
- **BLOCKERS:** unknown precise failure categories, no render trace/p95; A06 authenticated 24-case protected matrix not run; unresolved SQL history source/version drift.
- **NEXT:** B10-R09 — after receiving sanitized PR70 trace, implement only the first evidence-backed movement/render fault on staging; validate integrated PostgreSQL/CodeQL/Node regression gates before any authorized test build. If trace is unavailable, narrow using existing local tests and a separately approved, feature-disabled diagnostics-only build, never enable unsafe SQL-dependent flags.

