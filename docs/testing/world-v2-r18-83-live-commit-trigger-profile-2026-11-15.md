# B10-R18-83 — Original signed Commit, actual live trigger coverage, and isolated PG17 function costs

**15 November 2026 (Australia/Melbourne) · Source-only staging / NO DEPLOY / production NO-GO.**
Direct parent: R18-82 draft PR #184, exact SHA `5893a0699725cc54f8d3b041cef09c8effefff9c`. R18-82 is still **not deployed**. Permanent QA remains on the working-login but performance-failed R18-81 source (R18-62 Git SHA `380e31bda9e20638c3e1f660a2cdf001b8e37c0d`).

## Verified real-world failure / release constraints

User-reported DM movement still lags around walls and during rapid key/drag movement. Their bounded diagnostic showed seven gestures; browser-observed `authority.advance` p95 **740.1 ms** and `authority.commit` p95 **1,451.7 ms**, terminal release-to-finish p95 **2,226.1 ms**. This is **FAIL**, not movement acceptance. Pointer processing and captured render-frame work were not the dominant time in that trace.

A new **strictly read-only** Supabase survey on project `lwhwgqaunxbmvyndswze`, PostgreSQL 17, captured 15 Nov 2026 ~03:21 UTC, found cumulative `pg_stat_statements` since **5 Nov 2026 09:51:43 UTC**:

| Statement family | Historical calls | Weighted mean SQL | Recorded maximum |
|---|---:|---:|---:|
| Commit | 535 | **305.46 ms** | **3,673.67 ms** |
| Advance | 1,840 | 63.60 ms | 2,256.44 ms |
| Begin | 632 | 25.02 ms | 743.61 ms |
| Get visibility | 1,413 | 43.44 ms | 1,917.24 ms |

The live session has `track_functions=none` and `track_io_timing=off`; **neither setting was changed**. `pg_stat_user_functions` cannot therefore attribute live Commit to particular trigger functions. One later instantaneous read showed **seven connected sessions, zero lock waiters and zero idle-in-transaction sessions**; this is *not* concurrent gameplay load testing or a Free-tier RAM measurement. Statement totals cover an older cumulative window and cannot be subtracted from individual browser timing to calculate an exact network RTT or browser p95. All SQL queries were SELECT-only; no map geometry, actor IDs, sight frames or secrets were exported.

## New source-backed finding: our prior Commit fixture under-models the live token UPDATE

The original production `public.commit_world_motion_v2` repeats every signed accepted movement step through `forge_world_v2.step_allowed`, validates current revisions, locks selected token/tool rows, writes their canonical x/y positions, and only then acknowledges Commit. That canonical row write runs the live table's UPDATE triggers; they cannot be removed without proving equal collision/permission/roster semantics.

Read-only `pg_trigger` and `pg_get_triggerdef` inspected actual **column-specific trigger activation**, not merely the number of enabled update triggers:

| Live table | All enabled UPDATE triggers | Trigger functions actually invoked by a position-only `SET x=…, y=…` |
|---|---:|---:|
| `public.map_tokens` | 10 | **6** |
| `public.campaign_tool_issues` | 5 | **4** |

For tokens, the six are `forge_player_collision`, `forge_visibility_token_tick`, `npc_token_sheet_items_rpc_only`, `tokens_protected`, `tokens_touch` and `tokens_validate`. Column-specific combat, navigation-permission, status and roster-change triggers do **not** fire on an ordinary position-only UPDATE. For issued tools, the four are `campaign_tool_items_rpc_only`, `campaign_tool_sync_map`, `campaign_tool_validate_issue` and `forge_tool_collision`; the navigation-permission trigger is not keyed to x/y.

The **R18-54/68 disposable source-real Commit benchmark installed exactly TWO of SIX token position triggers**: real `forge_visibility.enforce_collision` and `forge_visibility.tick_tokens`. The four additional live token triggers — inventory write guard, protected fields, timestamp touch and map/campaign validation — were not modeled in that simplified fixture. It also lacks full production issued-tool trigger wiring. This is a material limitation of previous R18-54 and R18-68 cost attribution. The prior benchmarks' source-real fog/collision logic is genuine but **full six-trigger production parity remains unverified**. Never interpret synthetic Commit milliseconds as the complete production Commit cost or conclude that removing its security checks is a fix.

The read-only live source digests for all six trigger functions are recorded in `staging/world-v2-b10-r18-83-live-commit-trigger-inventory.json` together with their exact activation classes, explicit no-deploy status and bounded historical SQL metrics. Those values represent program/trigger metadata, not private row content.

## R18-83 incremental implementation

Only add **two guarded disposable SQL modules**, one hook around existing R18-68, the immutable live-metadata inventory, static/security tests, and this runbook. No production SQL change, Vercel preview redeploy, schema migration, public grant, permission edit, or gameplay runtime patch.

The existing CI-only R18-54 script already creates an isolated `world_v2_b10_r05` PostgreSQL 17 database, attaches original source-hash-pinned fog and collision triggers, validates blocked walls and revoked P2 sight, then runs R18-68's **36 signed forward Commit** measurements plus **36 authentic signed return Commit** operations. It caps total sessions below the existing 120/60-second actor budget and rolls everything back.

R18-83 adds a `SET LOCAL track_functions='all'` immediately before R18-68 **only inside that already-open local BEGIN/ROLLBACK**. It records `pg_stat_xact_user_functions` before/after the existing exact R18-68 workload to report original Commit, two real triggers, and other source-real private fog helper function **counts, inclusive time and self time**. The finish assertion checks **72 original signed Commit calls**, both real position trigger families firing, canonical token restored to its source x/y, fog-on viewer revision effects, no installed atomic-finalizer endpoint and unchanged private ACLs. The outer R18-54 ROLLBACK must remove the two profiler temp tables as well as all original temporary sight data.

**Important measurement limit:** the xact function deltas cover the entire R18-68 workload, which includes Begin, Advance, environment setup, fog-frame warmup, timed forward and untimed return Commits. They are *not isolated per-Commit phase timings*. Even if a trigger has a large cumulative self-time, that is prioritization evidence rather than proof that it accounts for any specific browser request. The two-of-six live trigger gap remains. No expensive background profiler is installed on Supabase and no new signed sessions are generated in CI by R18-83.

Additional guardrails: pinned original `public.commit_world_motion_v2` MD5 `f87014e7a967d1db1262dabe9e125552`; original fog/collision source hashes; exact, unchanged R18-68 fixture Git blob `c77a39a89eb2b5eaa98279705251e18befa8e9d1`; local `postgres` role, fixture database name and existing \(PGHOST 127.0.0.1\) runner checks; no action that bypasses wall/fog security or writes tokens outside signed authority. Console only exposes code-function names/counts/aggregated milliseconds; **no user IDs, scene geometry or private frames**.

## Engineering interpretation and next gate

- R18-82's reduction of premature coalesced-Advance dispatch is a narrow frontend improvement **not yet browser validated**. It cannot resolve the large signed Commit cost.
- R18-83 is deliberately **attribution and fidelity**, not a new untested production speed patch. It should help prioritize whether Commit's accepted-route revalidation, scoped visibility tick work or missing real triggers deserve next investigation.
- R18-84 should upgrade the disposable original-Commit test to a validated **six-of-six x/y token-trigger** fixture and **four-of-four tool x/y trigger** fixture, then isolate the exact signed canonical writes and private observer effects without suppressing any security trigger. Compare full source-real parity before changing user-facing movement.
- A separate future versioned server optimization, such as the gated R18-43 atomic last Advance + Commit, **requires the official authenticated pinned Supabase CLI v2.81.3 linked history 83+8 list/fetch/`db push --dry-run`**, complete signed R05+seven narrow SQL hostile tests, separate protected QA build/flag approval, independently signed DM/P1/passive P2 collision/fog/revocation/convergence and Free-tier physical RAM/swap/lock measurements.
- Release remains **NO-GO**. Do not promote the permanent QA alias, install R18-57/R18-77 optional SQL or mutate production merely because CI passes.

### Exact-head handoff requirements

The complete Node/Chromium/Vite/lint/Edge/npm audit, isolated PostgreSQL V2 authority, source-real R18-54/68/83 fog/Commit/rollback fixture, and CodeQL must all succeed on the final PR head. Retarget the draft PR directly to the previous R18-82 staging head; record ahead/behind, changed filenames and generated **aggregate local PG17 function profile** for future R18-84. No need for the user to repeat gameplay QA during R18-83.
