# B10-R18-22 — Fully ordered R05 → wall → corrected map-transfer → campaign-affinity SQL rehearsal

**12 November 2026 · Australia/Melbourne · STAGING ONLY · LIVE SQL/FRONTEND NO-GO**

## 1. Exact parent, motivation and production boundary

Parent: approved engineering stage **B10-R18-21**, draft PR #124, exact SHA `5164a4c8af877c88c98ef17b6fea4f3a88af152a`, 22 preserved staged branches. Git `main` continues at R16 `90df8c960e79e8d66c322095611427da7bb09de4`. The current site uses approved frontend-only R18-15 Vercel deployment `dpl_E1P6cNfuswAMH7qAFnSLPrTWN6kQ`. Supabase migration version `20261111023204` (frozen R05) is **unapplied** and there are 83 registered live versions (last `20261109171247`). VITE_WORLD_V2_OBSERVER_GUARDED_RECOVERY 700ms mode is OFF and frontend still defaults to strict wall collision. This stage changes no production data, SQL, feature flags, deployments, costs, or permissions.

R18-21 demonstrated that R18-19's initial SQL candidate omitted the *live* private `forge_world_v2.commit_allows_piece_v2` checkpoint from two legacy collision triggers. R18-21 rebuilt those triggers from installed source and pinned exact function-body equivalence after stripping only intentional map-transfer checks. But its isolated R05 test **restored the original RPCs afterward**, while wall, map and affinity candidates ran in separate rolled-back fixtures. The missing gate was a single disposable database with R05 left active and all three proposed follow-on SQL changes installed in exact order.

## 2. New third-disposable-DB end-to-end setup

`tests/world-v2-b10-postgres/rehearse-r18-22.sh` runs only after `WORLD_V2_B10_ISOLATED=yes`, `PGHOST=localhost/127.0.0.1` and caller `PGDATABASE=world_v2_b10`. It refuses known external connection overrides (`PGSERVICE`, `PGSERVICEFILE`, `DATABASE_URL`, `SUPABASE_DB_URL`). It creates **`world_v2_b10_r18_22`** in the GitHub Actions job's ephemeral PostgreSQL 17 service; reuses the original, pinned B04/B07/B08 minimal fixture and source-extracted released V2 engine, viewer authority and original public Commit. No Supabase project connection or production credentials.

`tests/world-v2-b10-postgres/ordered-stack-r18-22.sql` uses the SELECT-only source-captured live legacy token/tool validators, the latest per-leg legacy trajectory function, the current checkpoint-aware token/tool collision triggers and the actual signed V2 checkpoint helper. Only missing *fixture* columns needed for live validators are created locally.

Four **separate committed local transactions** then execute:

1. **Frozen R05 versioned migration** `supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql` — exact Git blob `f4e296725c09055685321726cbe4bc6e09dbce5a`. Its original four authority functions are backed up; four new function definitions remain installed. Unlike R18-21's recovery rehearsal, the fixture does **NOT** restore originals afterward.
2. **Dual wall helpers** `supabase/candidates/world_v2_r18_17_wall_edge_clearance.sql` — blob `c78998da8a9013591f2bb479cca4b222f41ef2d7`; test checks 0.05-cell edge clearance legal and 0.20-cell collision blocked for both V2 and legacy swept geometry.
3. **Corrected checkpoint-aware direct-write guards** `supabase/candidates/world_v2_r18_19_cross_map_guard.sql` — blob `55db7e6b6839d1d8b489203baa11c99264648a55`; both replacement functions retain the existing `commit_allows_piece_v2` authorization checkpoint, server-authorized commit and per-leg collision.
4. **Map/token campaign identity guard** `supabase/candidates/world_v2_r18_20_campaign_affinity.sql` — blob `3980808966ec56ad74120bc4f737c78ddd2056bb`; campaign identity changes blocked; tool's deployed validator already covers its identity.

The latter three files are explicitly **unversioned candidates, not approved migrations**. Their separate local commits simulate a possible release order, not a real Supabase CLI history state.

## 3. New O01–O20 assertions — all pass on actual post-R05 source

- **O01–O06:** live-shaped baseline contains signed checkpoint-aware triggers; frozen R05 installs and leaves all four changed authority functions active; private RLS/ACL retained; both geometry paths accept shallow edge and reject deeper collision; both corrected map guards preserve the signed V2 checkpoint; campaign affinity guards install without reverting R05.
- **O07–O10:** *real public* post-R05 `begin_world_motion_v2` / `advance_world_motion_v2` / `commit_world_motion_v2` for a player-owned token accept a shallow border, perform a signed canonical Commit through the corrected legacy trigger, persist the authorized endpoint, and reject a tampered retry.
- **O11–O16:** player-issued tool map transfer denied; a direct token write that crosses a wall remains blocked; same-campaign DM relocation remains permitted; token and map campaign reassignment fail even for a DM belonging to two campaigns; recovery backup, private helper ACL, and anonymous Commit denial remain intact.
- **O17:** independently rolled-back hostile scenario leaves token data and sessions clean while the **installed** R05 and three candidates remain on the *ephemeral* database after the transaction.
- **O18–O20:** a separate player-owned **2×2 mounted tool** completes authentic post-R05 Begin, Advance and Commit through the guarded tool trigger while a wall lies only 0.05 cell inside its outer band. Both authority approval and canonical database update pass.

Run results: **20/20 O assertions passed** in the same disposable PG17 database. Earlier independent B03/B07/B08/R01/R03, R18-17/18/19/20/21 source-real rollback suites and the separate R05 atomic-abort/after-commit recovery test are retained and run before this third-DB test. The deliberately simplified B07 private viewer/LOS stub remains; no attempt is made to represent a real authenticated independent player or prove private fog access.

`tests/world-v2-r18-22-ordered-post-r05.test.mjs` additionally fails closed on:
- Any changed frozen R05 or three candidate Git blobs.
- Unsafe nonlocal database configuration or removed isolated third DB guard.
- Out-of-order SQL, missing commit boundaries, accidental `world_v2_b10_r05_restore_original_authority` in the installed chain, or skipped earlier independent R05 recovery rehearsal.
- Missing actual authenticated-signature Begin/Advance/Commit token and tool SQL, 20 named O assertions, and local test-data ROLLBACK.
- Incorrect frontend strict-collision default or ignored pinned migration release gates.

## 4. What this result **does not** prove

- This is **source-real SQL function integration with simplified disposable tables**, not exact full production DDL, policies, triggers, roles, customer data, Realtime/Supabase Auth, or a second signed player account. The real viewer visibility hook is replaced by a test status stub, so authenticated P1/passive-P2 private fog, hidden NPC state, observer revocation and map permission changes remain unverified.
- No **actual pinned authenticated Supabase CLI v2.81.3** `migration fetch --linked`, 83-body digest reconciliation, `migration list --linked`, or `db push --dry-run --linked` has occurred. As of this stage, the real live project still has 83 registered migration versions and frozen R05 is absent.
- R18-17/R18-19/R18-20 candidates do **not** yet have approved SQL version numbers, and running separate local COMMIT transactions **does not** make them production migrations. No automatic installation follows.
- R05's source version/frozen hash must remain unchanged. Following R05 rollout, its new function definitions and the still-running *live* checkpoint/trigger definitions must be re-read before versioning any new SQL (the R18-21 snapshot was correct when captured but can become stale).
- The cross-map **DM-only** issued-tool policy is a product authorization choice; explicitly confirm this fits intended gameplay. The released tool validator already rejects cross-campaign map mismatch and tool campaign identity mutation.
- No evidence of a reduction in real live commit RTT, release-to-terminal lock, accumulated movement lag, Supabase RAM or WebSocket load is provided by this SQL correctness rehearsal. R18-16 opt-in cadence diagnostics and authenticated extended-session P1/P2 movement will be required.

## 5. Release plan and engineer handoff

**R18-22 complete after exact-head CI** only; live release remains **NO-GO**.

Remaining hard gates, in order:
1. Pinned, authenticated CLI isolated workspace and freshly fetched 83 SQL bodies/statement digests, correct project ref and config; R05 **alone** pending, no history repairs or bulk repo-root push.
2. Independently approved **R05 SQL release**, after existing R18-08 real-Auth observer signed recovery and R16 baseline preflight. Reconfirm 84 registered versions post-install; use protected rollback or forward source recovery only per approved runbook.
3. Re-read actual live function source hashes *after R05*; create and independently approve new CLI-versioned wall, **corrected** map-transfer and campaign-identity migrations, following this verified dependency order. Exact production schema/ACL and source compatibility must be rechecked; keep old PR #122/#123 superseded function copies forbidden.
4. Independently authenticated DM/P1/passive-P2 tests for fog/LOS/revocation/hidden geometry, map rights, held tool/2×2 collision and extended movement load. Do not treat local DM player preview or a scripted stub as actual player acceptance.
5. Separate later approved frontend enablement of 0.10-cell wall preflight, **700ms guarded observer recovery remains OFF** until its own security gate.
6. Address observed sustained movement lag separately with a measured authority transport/server optimization within free-tier infrastructure.

**Exact staged outputs:** `tests/world-v2-b10-postgres/rehearse-r18-22.sh`, `ordered-stack-r18-22.sql`, `tests/world-v2-r18-22-ordered-post-r05.test.mjs`, this handoff and readiness ledger.

**Do not merge or deploy this staging package by interpreting the local combined SQL pass as live authorization.**
