# Tabletop Forge B10-R18-49 — 83+8 linked-CLI evidence and revocation choreography

13 November 2026, Australia/Melbourne. **Draft staging only. NO production deployment, remote SQL mutation, migration repair, or atomic feature activation.**

## Authority and release state

Parent: R18-48 draft PR #152, exact source SHA 1448d602d2dfdb5bb99b22ff3fb2afc5ed0af031. This narrow package has SEVEN CLI-versioned staged SQL files plus frozen, unapplied R05: **EIGHT pending**. The R18-26 swept-AABB and R18-27 empty-Commit performance experiments are excluded. The original V2 step validator is preserved. Rejected R18-40 UX changes remain excluded.

Last verified production baseline (13 November R18-48, not remeasured by R18-49): 83 migrations (latest 20261109171247), 83/83 historical source SQL digests unchanged, R05 unapplied, finalizer RPC absent, zero active sessions at measurement, R18-35 production frontend, both atomic feature flags OFF. The current live state must be freshly checked before any release operation.

**Current decision: NO-GO.** This increment creates an offline, source-pinned verifier and operator playbook, not a linked Supabase CLI session. The verifier never connects to Supabase, runs SQL, modifies remote history or installs an application.

## Fresh 83+8 independent workspace gate

The repository-root Supabase migrations are hazardous as a release source: prior read-only check observed 62 local SQL migration files, 63 remote-only versions, 35 local-only versions and only 20 overlapping versions. Do not execute a repo-root migration push, backfill fake versions, or repair the live history.

A separate credentialed operator, after approval, must:

1. Create a new isolated directory **outside the source checkout**, confirm production project reference lwhwgqaunxbmvyndswze, use official **Supabase CLI 2.81.3** and inspect installed --help for migration fetch, migration list, and db push. Do not share CLI credentials or passwords.
2. In that isolated directory alone, use the authenticated official CLI migration fetch --linked to retrieve all **83 real historical SQL bodies**, not placeholders. This writes to local files only. Independently obtain an up-to-date read-only SQL-history snapshot containing version, name, statement_count and fetched_sql_md5, calculated with exactly the R18-08 CLI-materialization method: md5(array_to_string(statements, E';\n') || E';\n'). Compare all 83 bodies and metadata against staging/world-v2-b10-r18-08-remote-history-content-hashes.json, refusing every drift or missing version. Do not log SQL source bodies or tokens.
3. Copy ONLY existing R05 20261111023204_world_v2_b10_integrated_motion.sql and the seven staged files enumerated by staging/world-v2-b10-r18-48-narrow-pending/manifest.json, in version order. Ensure precisely **91** migration files, with no R18-26/R18-27 files and no unreviewed migrations.
4. Require the CLI-linked .temp/project-ref to match the expected project, a single db.migrations section with enabled = true, a single db.seed section with enabled = false, and absence of roles.sql and seed.sql. Remove unexpected project-ref environment overrides.
5. Run the R18-49 source-checkout **offline** verifier against that external directory and the fresh read-only JSON fingerprint export, using these arguments:

       node scripts/release/validate-world-v2-r18-49-linked-workspace.mjs --workspace=/absolute/external/isolated-workspace --fresh-sql-digests=/absolute/private/remote-history-readonly.json

   Required report: decision DRY_RUN_ONLY, safeToApply false, historicalBodiesChecked 83, pendingChecked 8, totalFilesChecked 91. This only validates the supplied files and metadata; it cannot independently attest when the external snapshot was produced.
6. If and only if the offline verifier passes, perform official linked CLI **migration list --linked** and **db push --dry-run --linked** from the isolated directory. Inspect both outputs manually for exactly eight pending in expected order and zero historical replays, seed or role changes. The dry-run must not include --include-all or automatic confirmation. If repair is suggested, any target is ambiguous, or any version differs: **STOP**.
7. Stop after the evidence dry run. It is not approval to install SQL. Neither migration fetch nor the actual linked CLI dry run has occurred in R18-49. Never run db push without --dry-run, migration repair, migration up, arbitrary live DDL, or MCP apply_migration as part of this package.

Supabase version-specific documentation reference: https://supabase.com/docs/reference/cli/introduction .

## Lock, revocation and recovery choreography (a future release, NOT executed)

| Phase | Required gate | Failure or incident action |
|---|---|---|
| A — Freeze | Check exact app SHA, baseline 83/83 fresh history, approved SQL version list, both R18-43 atomic flags OFF, no active gestures; rerun R18-45 read-only function source/ACL/active-session preflight immediately before any future installation. | Any drift/active sessions: STOP; do not delete player movements or force-clear sessions. |
| B — Independent multiplayer | Separately signed-in **DM, P1, passive P2** on same test campaign. Check actual walls and corner snapping; permitted observer fanout, hidden walls, fog/LOS, revocation, reconnect and exact canonical token convergence. Player preview does not count as independent P1/P2. | Any secret visibility, failed revoke, unauthorized movement or divergence: NO-GO. |
| C — Free-tier performance | Measure p50/p95 Begin/Advance/Commit/finalize and gesture release-to-confirmation under repeated fast arrow, drag, corners, wall collision and immediate regrab. Check locks, CPU/RAM, DB connections, and rollback-ready deployment. | Any regression or free-tier budget overshoot: preserve current live R18-35. The atomic finalizer cannot solve continuous serialized Advance RTT. |
| D — Future SQL | Only after explicit independent GO and signed review, install exactly the eight versions using authorized operator process; flags remain OFF; validate R46 protected original source capture, R48 narrow source seal, R18-20 guard triggers, observer queue and browser ACL after installation. | Partial install or source drift: stop, isolate incident; do not improvise history repair or trigger rollback. |
| E — Future client canary | Deploy only exact reviewed frontend after server proof, initial two flags OFF, repeat independently signed multiplayer tests, then consider supervised dual-flag activation with an explicit known-good fallback. | Disable both atomic flags on any observer/revocation/LOS/canonical regression; restore previous READY R18-35 frontend where needed. |
| F — Emergency containment | Manual, reviewed R18-45 atomic containment can revoke NEW authenticated terminal EXECUTE if the optional RPC has already been installed and exact source/ACL checks pass. Regular Begin/Advance/Commit remain available. | Cannot cancel in-flight SQL, reverse moved tokens, unwind migration history or undo previous observations. Privileged R05/R46 source recovery requires separate incident approval and zero active sessions; retain stronger R18-20 campaign-affinity triggers. |

**Important revocation test:** While P1 movement is in flight, the DM revokes permission or alters light/LOS. Confirm that P1 receives no unauthorized new private sight after the revocation boundary, P2 remains passive and receives only permitted geometry, and the gesture either authoritatively finishes within permission or is denied and canonically resynchronized. Cosmetic client prediction is not evidence of security.

Signed QA receipts must document: tested SHA and deployment, independent DM/P1/P2 roles (no credentials), fog/LOS and revoke boundaries, observer recipient sets, token-cell convergence, live network RTT p50/p95, lock/memory headroom and rollback status. Never paste private sight payloads, session tokens or hidden map geometry. Missing evidence means PENDING, never PASS.

## Rehearsal guarantees and limits

The new local test suite uses **synthetic** 83-row SQL and a real R18-48 pending source list, checking 91-file exactness, digest changes, symlinks, extra optimizer files, wrong linked project, unsafe seed config and missing versions. The public validator loads the original immutable R18-08 baseline and executes the prior R18-48 narrow-source checker; the synthetic helper alone does not issue deployment approval.

No fresh connected CLI proof, multiplayer fog/revocation receipts, live free-tier lock/memory stress, deployment, database DDL or feature flag change has occurred. **R18-49 remains NO-GO**. The next bounded work is a separately authorized live read-only CLI evidence capture and true DM/P1/passive-P2 testing.
