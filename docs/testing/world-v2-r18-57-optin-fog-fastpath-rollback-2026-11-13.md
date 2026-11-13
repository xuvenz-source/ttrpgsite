# Tabletop Forge — B10-R18-57 reversible synchronous-fog SQL release candidate

**13 November 2026 · Staging only · NOT APPLIED · Production release NO-GO.**

## Exact lineage and SQL source

Direct parent is R18-56 PR #160, head `fbc29f9c7c7f893645b3a2073b535e8c2fd8d028`. This stage contains a separately guarded and reversible **unversioned** candidate, not a new migration. Its protected function body is byte-for-byte the R18-56 source-real tested fog signer, derived from current live `forge_visibility.authorized_viewer_fog_frame(uuid,uuid)` original `pg_get_functiondef` MD5 `ee3356af321fec1a3e167a75c6245e86`. The PG17-normalized candidate after CREATE OR REPLACE has exact MD5 `f37c8d13e8d48bea123b4c811ae6de4d`. All 13 earlier source-exact PostgreSQL 17 functions and collision/fog triggers remain unchanged.

The ONLY two SQL release candidates reside at `supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql` and `supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql`. They are NOT in root `supabase/migrations` or any staged 83+8 migration workspace. Neither candidate creates public RPCs, roles, tables, migrations, queues or grants, changes client flags or alters collision. The existing private signer keeps the SAME function OID, owner, SECURITY DEFINER, empty search_path and exact private ACL. It only adds guarded synchronous no-obstacle/no-light fast paths to the existing source-real fog calculation; no async dirty state or extra network round trips.

## Fail-closed deployment and rollback guards

Each candidate is a **single atomic PostgreSQL DO statement**. On any rejection, its whole statement is rolled back. In addition to explicit release sign-off outside code, the DO guard requires all of:

- Database role exactly `postgres` and database name either production `postgres` or disposable `world_v2_b10_r05`.
- Separate, transaction-local `forge.r18_57_release_authorization` value. Installation and restoration have different exact marker values. This setting is an **operator tripwire**, not a credential or proof that QA passed.
- Exactly **91** rows in official `supabase_migrations.schema_migrations`, with the reviewed 83 historical migrations plus **all eight specific pending R05/R18-48 versions** present and newest version exactly `20261113024116`. Current live has only **83**, so the candidate refuses live installation today. The guard checks version shape, not actual SQL-body hashes; the external official authenticated CLI history and 83/83 source digest verification is still mandatory.
- Exact signature, expected source MD5, owner `postgres`, SECURITY DEFINER on, empty search_path and private explicit `proacl` `{postgres=X/postgres}`; neither `anon` nor `authenticated` has EXECUTE permission.
- Post-DDL exact MD5 verification and continued denial of browser role EXECUTE. The rollback only runs when the current function is **exactly** the pinned R18-57 candidate and independently verifies the restored original MD5; it refuses any intervening source or migration drift.

A future authorized operator must use a reviewed SQL transaction with `SET LOCAL forge.r18_57_release_authorization` to the matching mode, then execute the corresponding one-DO file, and commit only after all independent release gates pass. **DO NOT execute these files against production at the current NO-GO state.** If the live schema or grants drift, stop and review rather than bypassing any guard. A later migration could change the 91-version requirement and intentionally block this rollback; preserve a source-exact manual recovery plan under independent authorization rather than weakening the SQL gate.

## Actual disposable PostgreSQL 17 evidence

The expanded fixture `tests/world-v2-b10-postgres/r57-guarded-fog-release-benchmark.sql` runs in local disposable database under `BEGIN/ROLLBACK`. It creates **synthetic 91-row migration history** from the 83 historical version records and R18-48 seven source-sealed files plus R05, then installs eight synthetic viewer memberships and owned map tokens (2 original fixture viewers plus 6 new), and constructs 24 wall obstacles. Synthetic history and simulated viewers are NOT official authenticated CLI proof or independent signed browser accounts.

The fixture then executes the **actual production-shaped guarded candidate DO** with the required transaction-local setting. It compares complete JSONB authorized fog frames (not merely counts) for all eight viewers in open, 24-wall, mixed ambient/24-wall and 24-wall plus enabled torch scenes. It measures genuine actor-bound Begin/Advance/Commit, ensures all eight recipients synchronously receive source-exact private fog tick/frame revisions on each canonical move, verifies a solid wall still denies crossing without revealing geometry, and verifies a revoked viewer is denied by the original and new signer. It then executes the **actual guarded rollback DO**, verifies exactly restored original function MD5 and ACL, and finally rolls back all test data/DDL and confirms zero residual sessions, altered tokens, synthetic history or private functions.

A further adversarial suite invokes the ACTUAL candidate under **three invalid states**: altered function source (`ALTER FUNCTION ... COST 999`), missing R18-48 seal migration version, and incorrect release authorization GUC. All three are expected to emit explicit SQL errors; the fixture checks their refusal and exact original source/history afterward, then rolls back cleanly. Node static contract tests independently verify all original/optimized full SQL bodies, source pins, approved version IDs, guards, and CI isolation.

## Measured SQL-only latency (one early green disposable run)

| Eight-recipient canonical Commit, 24-wall fixture | Source-original mean | Optimized mean | Relative reduction |
|---|---:|---:|---:|
| Open ambient25 map (four samples per variant) | 68.957 ms | 20.473 ms | 70% |
| 24-wall ambient25 map (four samples per variant) | 265.072 ms | 153.269 ms | 42% |

Both implementations still perform all eight recipient revisions and synchronous private fog computation; **no delayed sight, fog blackout or asynchronous queue** was introduced. These are **n=4, ordered original-before-optimized, single-host SQL timings**, so p95 is not a robust production statistic and cache/order effects may inflate apparent benefit. No measured improvement in player/DM browser p50/p95 or free-tier Supabase RAM/locks can be inferred. The 24-wall benchmark is a geometry stress fixture, not a replica of users' current maps.

## Production and release decision

**R18-57 engineering staging only; PRODUCTION NO-GO.** Live Vercel should remain the R18-35 deployment, original 83 migrations remain applied, R05 remains unapplied, and both R18-43 atomic movement client flags remain OFF. The separate approved 83+8 pending migration chain is unchanged and intentionally excludes mixed-performing R18-26/27 changes and rejected R18-40 frontend patch.

Mandatory still missing: actual authenticated official Supabase CLI 2.81.3 **83-source fetch/list and `db push --dry-run`** from the isolated version-exact 83+8 workspace; 83/83 source-body MD5s; independent signed DM/P1/passive P2 multiplayer fog/LOS, collision, revocation and canonical convergence tests; observed production free-tier RAM/locks and user browser RTT; and explicit operator authorization. No release approval is implied by a synthetic CI fixture, even if every assertion is green.

## Handoff / validation

CI must pass the exact final source SHA: all Node tests, CodeQL, production build/lint/security dependency/Edge checks, independent V2 authority PostgreSQL, and the dedicated disposable R54/R55/R56/R57 source-real PostgreSQL job. Previously an unrelated Chromium DevTools startup failure occurred during a loaded GitHub CI run; retry the exact SHA and do not describe a failed run as green. Retarget the draft PR to exact parent R18-56 only after final CI acceptance. Always leave PR draft and unmerged.