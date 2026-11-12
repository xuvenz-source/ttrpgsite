# B10-R18-44 — Exact-source atomic server contract rehearsal

**13 November 2026 (Australia/Melbourne) — STAGING ONLY. No Supabase writes, no production or Vercel preview deployment, no migration registration.**

## Verified release state

- Parent is R18-43 draft PR #147 exact head `83efece2ca6bf63034bd224384f85dc54458fbe0`. Parent R18-43 is a **double-flag OFF** client bridge; the actual public atomic SQL endpoint is not installed. Rejected R18-40 movement patch is not inherited.
- Current accepted live release is R18-35 `5ca8c83bdef4a5d9870020b0f2b16723f7790e38`; both public aliases must remain on that exact READY SHA.
- Live Supabase `lwhwgqaunxbmvyndswze` read-only query on 13 Nov: **83** registered versions; latest **`20261109171247`**; `20261111023204` **not applied**; `public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)` **not installed**. Before this package, seven critical live function definitions were independently compared against the frozen release catalog and had no digest drift.
- User's genuine DM-side R18-40 preview QA: Advance p95 ~443 ms, Commit p95 ~1,308 ms, release-to-terminal p95 ~1,704 ms, native pointer CPU ~0.2 ms, 23 paced held-key server approvals in roughly five seconds. R18-42 showed 138 individual Advance SQL calls versus six single-batch calls for six 23-cell routes, in a disposable database. These do **not** establish performance improvements in live browsers.

## This engineering package

Only **unversioned historical candidate SQL**, source-extraction fixture code, isolated PostgreSQL hostile tests, runner wiring, source-blob contract tests and this note. **No** application runtime edits or SQL in `supabase/migrations`.

All 14 imported files are attached by their *original Git blob IDs*, byte-for-byte identical to the previously source-reviewed R18-33 staging branch `9427eafb851c1fded4727ee7eb855f385945d4ef`. Do not fork or rewrite a `SECURITY DEFINER` function just to fit a benchmark. `tests/world-v2-r18-44-source-real-server-bridge.test.mjs` pins all 14 original blob SHAs and the unchanged frozen R05 SHA.

**Third disposable local PostgreSQL 17 database:** `tests/world-v2-b10-postgres/rehearse-r18-44.sh` requires marker `WORLD_V2_B10_ISOLATED=yes`, caller database `world_v2_b10`, caller role `postgres`, port 5432, loopback `PGHOST`, hard-coded `127.0.0.1` transport; rejects `PGHOSTADDR`, `PGSERVICE`, `PGSERVICEFILE`, `DATABASE_URL`, `SUPABASE_DB_URL`. It explicitly creates `world_v2_b10_r18_44` in the CI service; no connection or credentials from Supabase. Existing B10 and independent R05 rehearsal run unchanged first.

The third fixture:

1. Source-extracts **exact deployed** V2 Begin/Advance/Commit, observer caller/permission validators and original token/tool collision triggers from frozen shipped migrations, using historical Git SHA guards. Adds production-shaped legacy trajectory, checkpoint and campaign-affinity checks to the synthetic fixture.
2. Installs frozen R05 `20261111023204` then exact unversioned R18-17 wall clearance, R18-19 cross-map/trajectory protection and R18-20 campaign identity, *in original vetted sequence*. This is ONLY the transient database. The earlier independent R05 rehearsal separately verifies rollback of a failed migration and recovery after an intentionally committed rehearsal.
3. Runs the original R18-28 atomic terminal SQL and 16+ canonical/security/fault tests inside `BEGIN/ROLLBACK`. Then runs R18-28 plus R18-30's corrected blocked-last and no-motion semantics inside a **second rolled-back transaction**, with 13 PG17 authorization/actor/permission/visibility/private-outbox and exact-replay checks. **Never** leave `public.finalize_world_motion_v2` or receipt columns installed when those suites finish.
4. Exports five **synthetic fixture** source-real terminal response types (ordinary, first-blocked no-motion, identical retry, earlier-approved blocked-final, identical retry) to a fixed local `/tmp` file, and passes the actual response JSON into the **current R18-43 `MovementController` and `validAtomicFinalizationAck`**. Validates exact endpoint/session/sequence, rejects malicious mutations, requires no duplicate Commit, and never reads actual user/campaign data.
5. Adds `authority-bridge-r18-44.sql`: a **third rolled-back** R18-28/R18-30 server attempt that tests anonymous ACL denial and private schema, nonexistent session, foreign signed actor, sequence zero/gap, forged start, stale scene/permission revision, 9-target overflow, exact single canonical Commit, byte-identical retry without a second token update, changed-route retry rejection, private observer outbox and full cleanup.
6. The Node release guard pins the 14 historic source blobs and the unchanged R05 migration, validates strict ordering, fixture fail-closed connection markers, absence of privileged schema/membership shortcuts and the double-disabled frontend activation requirement.

## What this does *not* prove

- Local SQL tests do NOT establish live network RTT, browser animation, true snap through a wall at every rendered frame, GPU frame presentation, production token triggers/realtime subscriber timing, server lock pressure or cloud free-tier memory.
- The disposable fixture models recipient-private packets with the historical test environment, not real **DM + independent signed P1 + passive P2** accounts. A sole DM cannot prove actual player-private fog/LOS isolation or revocation across unrelated tokens.
- The proposed atomic operation removes at most one HTTP round trip for a **closing, fully fitting last batch**. It does not change the repeated Advance requests during a held-arrow gesture, nor offer a pre-certified multi-cell viewer corridor. There is **no** authorization to enable the client flags from this PG fixture alone.
- Do not merge this branch into the live migration directory, apply historical candidate overlays, promote the previous rejected R18-40 patch or activate either Vercel atomic flag without a reviewed, versioned, recoverable server release plan.

## Exact release gates

- CI: all Node tests including new source and real cross-layer checks, React Chromium integration, lint, production Vite build, prod npm audit, Edge checks, isolated PostgreSQL authority, combined PostgreSQL 17 (third DB), CodeQL. Record exact head SHA and CI outcomes.
- Security: source digest/candidate package review for public `SECURITY DEFINER`, authenticated-only EXECUTE and private schema, actor/selection/map membership, scene/permission/fog revocation, collision and token/tool swept geometry, old V1 checkpoints, repeated retries, observer recipient isolation, no public outbox, cancellation and canonical rollback on failure.
- Ops: staged SQL must become separately reviewed *versioned* migration(s) only after full live-83-version preflight, recovery rehearsal, negative/positive peer review and explicit rollout design; no production mutation in R18-44.
- QA: independently authenticated DM/P1/passive-P2 testing is a final release prerequisite for any change to server terminal, viewer fog or observer publication. Solo DM can later test responsiveness only, not guarantee fog privacy.

**Decision remains NO-GO for production.** Next work package may formulate the production-safe migration chain and bounded certified movement envelope separately; this package verifies source compatibility and permission invariants only.
