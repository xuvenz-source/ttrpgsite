# B10 — Integrated Movement Release Qualification

**Date:** 11 November 2026 (Australia/Melbourne).  
**Decision:** **NO-GO / BLOCKED RELEASE GATE**. Staging source and read-only inspection may continue; merging, SQL application, Vercel release, feature activation and live campaign fixture mutations are **not authorized**.  
**Approved scope:** Designer's “Proceed” after B09 permits exactly workflow **B10** only. This is a source-integration and qualification pass, not automatic production approval.  
**Live baseline:** `main@b246b3a72537b53b2afc2a9a38cbe1db3609a8af`; Vercel `dpl_FNwPjVY7o1781dc8Uo6Eizgf8rb4` READY at same SHA.  
**Staging parent:** B09 draft PR #84 at `21de65468a013fed7bf59c7803a5089e9b2201b8`; this B10 draft inherits the complete A03→B09 stack, not PR #71.  
**Source of truth:** `staging/world-v2-b10-release-qualification.json`, `staging/engineering-progress.json`, `staging/next-release-ledger.json`.

## 1. Precise source and authorization reconciliation

The current live Supabase Free project contains 83 applied migrations; latest `20261109171247`, `free_tier_rls_initplan_optimization_20261110050000`. No B03, B07 or B08 migration has been applied. **A read-only `pg_catalog` check directly on live Supabase** verified:

| Existing live property | Confirmed |
|---|---|
| `forge_world_v2.validate_motion_path_batch_b03` | NOT installed |
| `forge_world_v2.observer_pending_b07`, `observer_budget_b07` | NOT installed |
| `forge_world_v2.drain_committed_observers_b08` | NOT installed |
| Live `advance_core_v2` references B03 validator | NO |
| Authenticated browser USAGE on `forge_world_v2` private schema | DENIED |
| Anonymous EXECUTE on public `advance_world_motion_v2` | DENIED |
| Authenticated EXECUTE on public `advance_world_motion_v2` | ALLOWED |

Therefore source-real isolated SQL tests can prove that candidate functions work together **without** proving they are on the live call path. Existing public `advance_world_motion_v2` is intentionally a `SECURITY DEFINER` endpoint with actor/session checks; replacing or revoking it wholesale would break movement and is not permitted.

The independently blocked draft [PR #71](https://github.com/xuvenz-source/ttrpgsite/pull/71) modifies `WorldV2TabletopRuntime.js`, `WorldTrace.js` and `TabletopApp.jsx`. The B03–B09 stack also touches the runtime and tracing. PR #71 must be amended, conflict-reviewed and explicitly reconciled before any combined release. No PR #71 changes were silently merged into B10.

## 2. SQL dependency order and unverified release wiring

The proposed SQL source order is **B03 → B07 → B08**:

1. `supabase/candidates/world_v2_b03_path_validation.sql`: private `validate_motion_path_batch_b03`; no client grants. It independently computes swept, bounded prefixes but the active `advance_core_v2` still uses its original path-validation implementation. **Release blocker: wire/test it or make an explicit, reviewed choice to retire/retain it.**
2. `supabase/candidates/world_v2_b07_private_observer_budget.sql`: private recipient buffer with RLS and denied browser grants; per-recipient server LOS verification and bounded Free-tier publishing. An urgent certified hide preempts previously unsent same-piece path frames.
3. `supabase/candidates/world_v2_b08_commit_reconciliation.sql`: adds session request identities and replaces existing public Advance/Commit definitions with exact-payload replay checks and bounded private terminal drain after canonical commit. Public signatures unchanged; previous transaction checkpoint, sorted canonical writes, group sweep and revision checks remain.

**Never run these candidates simply because the files exist.** Before an authorized release, prepare/review a forward-only migration matching actual live `pg_catalog` signatures and historical applied-name aliases (source file timestamps differ from live applied migration versions). Preserve a compatible rollback or forward-repair strategy. Avoid an incompatible window where a new client expects B08 request fields but the old RPC is still serving traffic. Do not enable new frontend flags before the matching backend is verified.

The database-only [B10 PostgreSQL 17 CI workflow](../../.github/workflows/world-v2-b10-integrated.yml) compiles the original released geometry/auth helper source and source-real private sight selector, then installs the candidates in this precise order in one **disposable local test database**. It runs B04 hostile, B07 observer and B08 commit tests consecutively with rollback-only data and two browser-role denial checks, then [7 combined integration assertions](../../tests/world-v2-b10-postgres/integrated.sql) for actor-owned Begin, B03 read-only legal prefix, source-real independent public Advance agreement, canonical Commit, replay denial, private RLS/ACL and queue reclamation. The explicit output warns that B03 is **not wired** into the released core. This fixture does not reproduce all production triggers, real Supabase Auth, user permission revocation, Fog/LOS state or three independent client sessions.

## 3. Frontend integration and controlled flags

Existing B05/B06/B08 functionality is present in the staged `WorldV2TabletopRuntime` behind exact opt-ins. Do not change Vercel's live environment in B10.

| Opt-in | Release precondition |
|---|---|
| `VITE_WORLD_V2_COALESCE_MOTION=1` (B05) | B03/B07/B08 authoritative RPC contract verified; bounded, ordered press/drag paths under network RTT |
| `VITE_WORLD_V2_CERTIFIED_MOTION=1` (B06) | Player sight grants and DM-visual parity verified, stale/revoked grants hidden immediately |
| `VITE_WORLD_V2_COMMIT_RECONCILE=1` (B08) | B08 SQL active, exact ACK payload replay and authoritative sight handoff validated |
| B09 keyboard/touch/group/preview | No new flag; common authority, whole-group ownership, single/dual-finger cancellation, nonpersistent preview |

The staged source includes B09 exact canonical keyboard-endpoint and group continuity checks. **Mock and isolated browser-harness tests are not real authenticated multiplayer evidence.** The absence of a measured p95 latency improvement is **not a pass**.

## 4. Free-tier, privacy and failure-mode release criteria

- **Hide/sight revocation:** B07 priority hide may still wait when even hide-priority publishing budget is depleted. The recipient must not continue rendering stale hidden actors; validate signed-sight revocation, queued path deletion and eventual resync on P1/P2 and reconnect/multi-tab. Zero leaks tolerated.
- **Budget starvation:** B08 opportunistic drain happens only on final commit and exact retry. If the broadcaster has no budget and the actor never retries, pending motion may remain until TTL or an independent canonical sight refresh. A guaranteed bounded authorization-safe recovery trigger must be designed and proven or this feature cannot ship.
- **Fanout and memory:** 20 private movement broadcasts/s plus up to 10 priority hides/s is a *physical publish* target, **not** the Supabase billable message ceiling after multiple recipients/tabs. Verify free-tier resource budget and observe bounded buffer expiry/cleanup. Do not add a paid staging database or mandatory worker.
- **No visual resets:** normal DM and player moves must not remount terrain, recreate all sprite roots, black out protected fog or reassign signed image URLs. Measure first visible permitted motion against proposed p95 ≤32 ms on a documented reference device. Measure authorized remote p50/p95 at normal and ~100/200 ms simulated RTT.
- **Strict permissions:** test foreign tokens/tools, hidden NPC/secret walls, map switches, DM preview, 2×2 group collision, one-way vision vs solid movement, permission and scene-generation changes, reconnect, and failed server/path responses. Never expose raw observer packets/JWTs or private map contents in GitHub evidence.

### Live security advisor snapshot (informational; not an automatic vulnerability verdict)

Supabase's existing security advisor reports 15 `rls_enabled_no_policy` **INFO** findings (many intentional private tables with no browser policies), 67 `authenticated_security_definer_function_executable` **WARN** findings requiring per-function owner/permission review, and 1 Auth leaked-password-protection **WARN**. Performance advisor reports 36 unindexed-FK **INFO**, 7 unused-index **INFO** and 2 multiple-permissive-policy **WARN**. These are live project-wide advisories, **not** proof that this B10 candidate introduced them. Relevant references: [RLS without policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [Security Definer callability](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [Leaked password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Avoid indiscriminate blanket revokes; investigate service-to-service contracts in E04.

## 5. Required authenticated A04/A06 matrix (NOT RUN)

All **24** A04 scenario IDs are reproduced below to prevent fabricated human acceptance:

| Scenario | Category | Actors | Real authenticated status |
|---|---|---|---|
| `AUTH-01` | AUTH | DM/P1/P2 | NOT RUN |
| `AUTH-02` | AUTH | P1/P2/DM | NOT RUN |
| `INPUT-01` | INPUT | DM | NOT RUN |
| `INPUT-02` | INPUT | P1/P2 | NOT RUN |
| `INPUT-03` | INPUT | DM/P1/P2 | NOT RUN |
| `INPUT-04` | INPUT | DM/P1/P2 | NOT RUN |
| `INPUT-05` | INPUT | DM | NOT RUN |
| `COLL-01` | COLL | DM/P1/P2 | NOT RUN |
| `COLL-02` | COLL | DM/P1/P2 | NOT RUN |
| `COLL-03` | COLL | DM/P1 | NOT RUN |
| `COLL-04` | COLL | DM | NOT RUN |
| `FOG-01` | FOG | DM/P1/P2 | NOT RUN |
| `FOG-02` | FOG | DM/P1/P2 | NOT RUN |
| `FOG-03` | FOG | DM/P1/P2 | NOT RUN |
| `FOG-04` | FOG | DM/P1/P2 | NOT RUN |
| `FOG-05` | FOG | DM/P1/P2 | NOT RUN |
| `REC-01` | REC | P1/DM | NOT RUN |
| `REC-02` | REC | DM/P1/P2 | NOT RUN |
| `REC-03` | REC | DM/P1 | NOT RUN |
| `REC-04` | REC | P1/DM | NOT RUN |
| `META-01` | META | DM/P1 | NOT RUN |
| `TOOL-01` | TOOL | DM/P1 | NOT RUN |
| `PERF-01` | PERF | DM/P1/P2 | NOT RUN |
| `PERF-02` | PERF | DM/P1/P2 | NOT RUN |

The published candidate fixture lacked protected fog/collision, door, one-way vision barrier, 2×2 actor and some tool/map setup at the A06 audit. No fixture writes were authorized; the current exact state must be reverified before use. Three separate authenticated DM/P1/P2 sessions must be exercised, not three browser windows of one account. Do not proceed with live tests without approval and recoverable pre/post-test snapshots.

## 6. Gate decision and outstanding work

**Source-integrated static/isolated checks**: evidence from B10 GitHub Actions, not a live deployment. CodeQL security-extended scan enabled for this staging branch without switching off Vercel preview protection. The project's two headless Chromium browser harnesses intermittently failed to open a DevTools port when `node --test` ran many worker processes concurrently. B10 retains the protected `run: npm test` workflow policy and changes only `package.json`'s `test` script to `node --test --test-concurrency=1 tests/*.test.mjs`, running the **same complete suite without skipping browser cases**. The actual Chromium DOM harness also retries a fresh temporary Chrome profile **once only when DevToolsActivePort never appears** (with no suppression or retry of any movement, collision or permission assertion). A second startup failure still fails CI. These changes address possible GitHub-runner startup instability; they do not establish real authenticated multiplayer acceptance.

**Gate A:** BLOCKED; real latency/flash and fixture acceptance not executed.  
**Gate B:** **NO-GO**; no measured responsive multiplayer improvement, missing B03 on active call path and unresolved budget/sight recovery.  
**PR #71:** DRAFT, unresolved amendments.  
**Full release reconciliation:** not complete; additional outstanding branches and SQL provenance must be reconciled before a single authorized release.

### Next action requires new designer instruction

Keep B10 PR draft, unmerged. Resolve B03 core wiring strategy, B07/B08 guaranteed observer recovery, PR #71 recovery/permissions, migration packaging and authentic DM/P1/P2 test environment. Re-run the combined CI + CodeQL exact release candidate, then seek separate release authorization. **Do not automatically proceed to C01 or deploy B10 because isolated tests were green.**
