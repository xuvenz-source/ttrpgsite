# B10-R18-82 — Real DM failure: coalesced Advance dispatch correction

**15 November 2026, Australia/Melbourne · stage-only · direct parent R18-81 PR #183 head `b3cbe1215172cec7837103ce394d0731053c128c`.**
**User observed REAL preview lag near walls and fast movement.** This is a genuine user-experience FAIL; do not mark release ready.

## Current source and test surface

The user used the permanent QA host `https://ttrpgsite-qa-ttrpg-site.vercel.app` on the protected READY R18-81 preview deployment `dpl_Bdek3W7xXVYW3f7QDZpjrDDp9V3F`, pinned R18-62 frontend source `380e31bda9e20638c3e1f660a2cdf001b8e37c0d`. Real Google login worked. The supplied report is a bounded `world-v2-local-qa-capture`, `caseId:"A03"`, `role:"dm"`, `dmPreview:false`. A03 is a self-selected report category, **not independent signed observer or private-fog certification**. There are seven gestures, 20 server-approved events, three blocked events and four pointer-busy events; no explicit authority reject. The trace includes 181 native pointer events/724 coalesced samples, 166 pointer batches; it does not reveal coordinates, private map walls, player IDs or raw sight.

| Browser-observed instrumented metric | n | p50 ms | p95 ms | max ms |
|---|---:|---:|---:|---:|
| `input.pointer.processing` | 181 | 0.1 | **0.2** | 0.4 |
| `movement.prediction-check` | 247 | 0 | **0.2** | 0.3 |
| `render.frame` (instrumented only) | 256 | 0 | **0.1** | 0.2 |
| `authority.begin` | 7 | 203.2 | **277.4** | 277.4 |
| `authority.advance` | 23 | 232.9 | **740.1** | 836.4 |
| `authority.commit` | 7 | 1128.7 | **1451.7** | 1451.7 |
| `movement.release-to-terminal` | 7 | 1247.5 | **2226.1** | 2226.1 |
| `visibility.rpc` | 6 | 264.1 | **523.0** | 523.0 |

A separate **read-only** `pg_stat_statements` snapshot at 2026-11-15 02:48 UTC showed historical Advance 1,843 calls / **63.60 ms mean SQL**, Commit 532 / **306.84 ms mean SQL**, Begin 632 / **25.02 ms mean SQL**, private Visibility 1,413 / **43.44 ms mean SQL**. A read-only `pg_stat_activity` snapshot observed **29** sessions, **2 active**, **0 waiting locks** and **0 idle-in-transaction**. **Do not subtract these historical SQL averages from the individual browser p95 timings to claim specific network RTT**; the time windows and request identities differ. No physical RAM/swap or concurrent DM/P1/P2 measurement exists.

## Confirmed input-layer inefficiency and contained implementation

`InputController.js` already collates one browser `pointermove` event into `getCoalescedEvents()` and calls `MovementController.updateGestureSamples(points)` exactly once. R18-38 reduced expensive local prediction checks to *only the final sample*, but the pre-R18-82 implementation called `updatePointer` for each sample and let it synchronously call `drain(g)` on the **first intermediate cell crossing**. `drain` immediately dispatches a signed Advance and marks that early target as in flight, even though the rest of the **same native event** contains other bends. Those bends then require a second serialized Advance after the first reply. This causes avoidable HTTP/RPC work for some multi-cell browser input bursts, compounding user-visible lag.

R18-82 only changes that boundary:

- The existing `updatePointer` accepts an internal `deferAdvance=false` parameter; ordinary single-pointer, held keyboard, mouse-up and preview use the **exact previous eager dispatch**. No exported API changes.
- `updateGestureSamples` first validates the **whole native batch** for finite points. It appends all bends/turns/reversals synchronously with `deferAdvance=true`. The **last** sample alone still performs the one local preflight / fractional presentation. After the event is complete, it invokes **one** existing `drain(g)` if the exact same authorized gesture remains active.
- The existing 24-cell/8-target per-RPC limits, server ACL, fixed signed sequence numbers, exact server-accepted prefix validation, wall collision stop, permission/scene revocation, cancel and independent Commit remain unchanged. The queued branches while an Advance is already in flight remain isolated by R18-31. Nothing bypasses canonical authorization or exposes player-hidden geometry.

### What this definitely does NOT fix

The report's biggest latency is **Commit p95 1.45 seconds** and **release-to-terminal p95 2.23 seconds**. This change does not alter either operation, install any SQL or remove the separate sight refresh. It is a specific *RPC count reduction* on some coalesced fast drags, **not a claim of solved wall collision or crisp movement**. Some browser events stay in one cell, so 166 coalesced batches are *not* 166 redundant Advances. Real end-to-end speedup cannot be claimed until a separately approved staged preview is tested by DM.

The root architecture is still sequential Begin → bounded Advance(s) → Commit, then fresh private visibility, with active gesture locked until a signed canonical result. R18-43's opt-in atomic finalize has both flags OFF because the server endpoint is not yet installed in the **83-migration** production database. R05 plus seven narrow R18-48 migrations remain pending; optional R18-57/R18-77 fog/ray SQL is uninstalled. **Never flip atomic/observer flags or apply production migrations to make a preview seem faster**. The pending backend package needs pinned official Supabase CLI history/fetch/list/dry-run (83 + 8), independent signed DM/P1/passive P2, protected sight/fog/collision/revocation verification and Free-tier physical RAM/locks before release.

## Source-level validation

The R18-38 original test for coalesced intent previously asserted *identical Advance wire segmentation* versus individually delivered points. R18-82 deliberately corrects that obsolete invariant: it asserts **fewer** Advance calls, but exactly identical full ordered server-approved cells and endpoint, strict final-pointer-only prediction, and one ordinary canonical Commit. R18-82 adds isolated tests for:

- Single native burst of 6 ordered turns/reversals → exactly one bounded signed Advance and one Commit, no premature intermediate RPC.
- Non-granted prediction stays unpainted; same final-sample-only local collision preflight.
- A second burst while a prior Advance is unresolved: still one authority in flight, all later bends retained.
- Blocked wall first cell → no Commit or client-only teleport.
- Partially accepted collision → canonical only at accepted prefix; denied subsequent route discarded.
- NaN intermediate sample → atomically reject burst without emitting a partial Advance.
- Permission revocation during deferred Advance → no late Commit/presentation.
- 40-cell coalesced path → exactly two bounded 24+16 cell signed Advances.
- Plain keyboard/single-pointer input remains eager; atomic finalizer still default off; source never directly calls RPC, storage or broad private fog.

**CI gate:** all exact-head four workflows—Node/Chromium/lint/Vite/Edge/npm audit, PostgreSQL 17 isolated movement authority, PostgreSQL 17 source-real private fog/rollback and CodeQL—must be green. Production and QA preview are **unchanged** during this step. Stage as draft based on previous exact R18-81 head and do **not deploy** before a separate, integrated movement-performance decision.

## Next bounded engineering priority

R18-83: investigate the real signed Commit bottleneck with source-real parity under R05 + reviewed narrow migrations; isolate backend CPU, locks, network and observer visibility costs without disclosing map or player information. Evaluate bounded atomic finalization only after exact backend version and source gates pass. The current preview's **poor movement result remains the baseline FAILURE**. Keep the permanent QA alias on the previously authenticated build until a meaningful candidate and release gates are met.
