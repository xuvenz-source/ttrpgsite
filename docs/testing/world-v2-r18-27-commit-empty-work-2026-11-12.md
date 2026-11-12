# Tabletop Forge — B10-R18-27 Commit empty-work optimization

**12 November 2026 · Australia/Melbourne · STAGED ONLY · RELEASE NO-GO**

## Baseline and goal

Parent R18-26 staged exact commit `331e04bb78fdb15064bd2a54e3bddb6562cc295a`. Current production remains the reverted R18-24 Vercel QA-only frontend `dpl_7HUmXi7eQ2oq2Y5HiW6r5Pvzq1HN`; Supabase Free has **83** registered migration versions and R05 `20261111023204` **is not installed**. The R18-25 latency instrumentation is rolled back, and the R18-26 private wall-prefilter is an unapplied SQL candidate.

The DM trace showed **Advance p95 447.5ms (30 samples)**, **Commit p95 1,133.7ms (9)**, **release p95 1,589.9ms (10)**. Historical pg_stat_statements Commit DB mean was **213.11ms** over 455 calls since November 9: these statistics are NOT a synchronized decomposition of browser RTT. Local prediction p95 **0.1ms** and pointer handling p95 **0.2ms** make client collision CPU an unlikely primary cause.

R18-27 targets *redundant SQL work* within the already frozen R05 Commit procedure. It does NOT attempt to remove any active permission, lock, collision or signed visibility step, reduce TCP/API RTT, or guarantee improved live latency.

## Stage-only candidate

`supabase/candidates/world_v2_r18_27_commit_empty_work.sql` was generated from the **exact frozen R05 public.commit_world_motion_v2** body, with four and only four guarded insertions:

1. For the **already committed, exact-ACK retry** branch, call the original private `drain_committed_observers_b08` only if `EXISTS (SELECT 1 ... observer_pending_b07 WHERE session_id=s.id)`.
2. For a fresh canonical Commit, execute the original token `UPDATE` only when `cardinality(token_ids)>0`; the original signed checkpoint and all token-update triggers still execute for nonempty selections.
3. Execute the original issued-tool `UPDATE` only when `cardinality(tool_ids)>0`; the checkpoint and complete trigger path still execute for nonempty selections.
4. On fresh committed sessions, execute the original private observer drain only when a pending observer row exists. If any are present, no changes are made to viewer/LOS authorization, packet order, certified hide handling, or terminal path retirement.

The original function's actor-bound `SELECT ... FOR UPDATE`, three `session_valid(s)` checks, complete canonical step-replay loop, selected-row locking, permission/map/environment revision locks, trusted checkpoint, idempotent ACK shape and five-argument public signature are byte-for-byte retained. No new grants, RLS, indexes, Realtime topics or browser functionality.

**Concurrency note:** the observed server pipeline queues observer rows during the same actor-locked Advance session. The new `EXISTS` guard runs while the Commit RPC holds that actor's session lock. This does NOT prove cross-session changes or future alternate private writers are safe: changing observer producer architecture requires revisiting this proof before any release.

## Isolated source and behavioral tests

`tests/world-v2-r18-27-commit-empty-work.test.mjs` reconstructs the complete R05 Commit body from four exact known insertions and requires byte identity to the new candidate. It also checks fixed Git blobs for frozen R05, R18-17, corrected R18-19 and R18-20; source unchanged and permission/grant integrity. Original R18-26 SQL file/test are untouched.

`tests/world-v2-b10-postgres/commit-empty-r18-27.sql` executes **AFTER** the existing isolated combined R05→wall→map guard→affinity→R18-26 run. It:

- Clones both real original R05 Commit and R03 drain source into private reference functions inside a local `BEGIN` transaction.
- Uses a **test-only transparent wrapper** around the original private drain: it counts invocations, then calls the exact original implementation; tests fail if any nonempty observer queue is wrongly skipped.
- Exercises real actor-signed token Begin, Advance and canonical Commit; wrong-actor denial, exact retry and altered-retry rejection. Empty private queue causes **zero** drain calls.
- Exercises real player-owned 2x2 mounted-tool Begin, Advance and signed canonical Commit, with an explicitly queued certified private hide; verifies the helper was called **once**, stale path frames cannot remain, and all emitted observer packets are private.
- Verifies existing anon/auth private schema denial and authenticating public RPC grants.
- Rolls **everything** back and confirms no reference function, wrapper, altered SQL, or temporary test table survives.

**Initial isolated PG17 combined SQL run:** all **13/13 R27 gates passed** at source commit `a404a6768fa98c13aef619018d50cbe3343d661f` (#43160749032); all R18-22 O01–O20 and R18-26 4,860 differential cases continued to pass. The updated exact-head CI and CodeQL must also be checked before this stage is marked fully verified.

**Important fixture limitation:** the private viewer/LOS test uses the existing simplified B07 fixture. The instrumented queued-hide test proves this source path **called the original drain**; it does not certify real independent DM/P1/P2 authenticated Realtime recipient privacy or recovery.

## Release blockers and next direction

- No source-backed live Commit timing reduction has yet been measured; **do not claim a percentage gain**. This optimization removes known redundancy but is unlikely to eliminate an entire ~1-second browser Commit interval by itself.
- Actual operator-authenticated pinned CLI v2.81.3 83-body migration fetch, historical digest replay, exact R05-only linked dry run, and distinct R05 release approval remain pending.
- R18-17, corrected R18-19, R18-20, R18-26 and R18-27 remain **unversioned candidates**; do not apply them out of order or through direct production SQL.
- Real independently authenticated DM/P1/passive-P2 sight/LOS/canonical convergence/private observer/revocation suite remains blocked until testers are available; local DM preview and simulated SQL roles do not satisfy it.
- Keep R18-24 frontend, R05 original functions, 700ms guarded recovery flag OFF, no paid infrastructure changes.
- Future optimization should profile observer drain and end-to-end network/queue latency using safe, privacy-preserving measurements rather than weaken canonical authorization to reduce latency.

**Decision: staged, release NO-GO.**
