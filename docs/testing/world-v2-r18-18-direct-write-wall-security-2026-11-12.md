# B10-R18-18 — Source-real legacy direct-write collision security validation

**12 November 2026 (Melbourne) · Stage only · Production/SQL NO-GO.**

## Baseline and exact release boundary

Parent: R18-17 [draft PR #120] at SHA `79afb01a68a7c6cc6107e51dd5e97b5e3740a45e`. Current frontend canary remains R18-15 `dpl_E1P6cNfuswAMH7qAFnSLPrTWN6kQ`, 12-second signed observer recovery enabled and 700ms guarded recovery OFF. Git `main` remains R16 `90df8c960e79e8d66c322095611427da7bb09de4`. The existing R05 migration remains unapplied and its file unchanged. User delegated engineering **staging only**; no SQL apply, Vercel deployment, migration history rewrite, feature-flag or expense change.

R18-17 independently staged a strict-default client 0.10-cell preflight, plus an UNAPPLIED candidate replacing **both** original identical-signature swept SQL helpers in `forge_world_v2` and `forge_visibility`. The latter is used by World V2 authority and legacy direct token/tool SQL `BEFORE UPDATE` collision triggers.

## Verified production trigger definitions (SELECT only)

Read-only inspection of live PG17 `pg_proc`/ `pg_trigger` confirmed:
- `forge_visibility.enforce_collision()`: existing SECURITY DEFINER, pinned empty `search_path`; `forge_player_collision` fires BEFORE UPDATE of `x,y,span_x,span_y,map_id` on `public.map_tokens`.
- `forge_visibility.enforce_tool_collision()`: likewise; `forge_tool_collision` fires BEFORE UPDATE of `map_id,x,y,config` on `public.campaign_tool_issues`.
- Live original SQL MD5s of compiled definitions: token guard `7e652f0f2334980ccc724e1748d334ba`, tool guard `771ea1716498a43210661532f9c24977`; these are **live PG-formatted hashes**, not raw repository Git blobs. Direct trigger source is pinned to historical repo migration blobs for tests.
- The visible production `map_tokens` UPDATE RLS policy `dm or owner update tokens` uses DM or owner + visible + map access. `campaign_tool_issues` UPDATE RLS policy `recipient or dm edit issued state and position` checks membership and owner/shared rights, with `USING` and `WITH CHECK`. These policy statements were inspected **read-only**, not replayed in isolation; no inference of cross-account authorization acceptance.

## Source-real test implementation

1. `tests/world-v2-b10-postgres/extract_real_collision_triggers_r18_18.py` reads the historical, committed source files with exact **Git blob SHA1** `fcac1768285a2774fe62894ec2ec0649f0174769` and `c774aa7d13e89aa2d783d8d5fdc6f46326e28206`. It fails closed on source drift, extracts actual `forge_visibility.wall_passes` and both `enforce_...` bodies plus their exact original `CREATE TRIGGER` DDL, and emits no network or privileged production operation. Unlike a test mock, the two AFTER-extracted triggers are the same originally shipped SQL bodies.
2. `tests/world-v2-b10-postgres/direct-write-wall-r18-18.sql` uses only the disposable PG17 fixture, `BEGIN`/ `ROLLBACK`, a fixture-only `fog_enforced` column parity shim, and the still UNAPPLIED R18-17 dual helper candidate. It executes real `UPDATE public.map_tokens` and `UPDATE public.campaign_tool_issues`, checks both accepted changes and precise rejection messages, verifies denied writes leave position/size unchanged, and never writes to Supabase.
3. **38 original hostile assertions (T01–T38)** verify: both trigger registrations and SECURITY DEFINER modes, token 5%-edge accept versus 25%-edge reject and near-edge true crossing, boundary-only touch, closed/open doors and see-through/broken windows, conditional attribute passage, token span resize, full-footprint map bounds, 2x2 token clearance and rejection, DM strict default and explicit override, 2x2 mount movement and config resize, unsigned-user denial and unpublished/corrupted published environment fail-closed.
4. **Four additional permission assertions (P01–P04)** verify player token transfers between maps are rejected by the unchanged trigger, and revoking the fixture DM's membership prevents a previously set explicit collision override from bypassing the wall. Restoring DM status plus explicit flag restores the guarded override. **These do not constitute production row-level-security or real player authorization tests** because the disposable fixture's token/tool tables are intentionally simplified and do not reproduce production RLS.
5. `tests/world-v2-r18-18-direct-write-security.test.mjs`: pins both source blob hashes, confirms exact UPDATE trigger columns and test-only SQL rollback, confirms token/tool position/config updates and error assertions really exist, verifies no extra schema authority APIs, and preserves the frozen R05 release route.
6. `tests/world-v2-b10-postgres/run.sh` now invokes the source extraction and direct-write test after R18-17’s 14 PG17 pure-authority predicates, with rollback, BEFORE the independent R05 rehearsal in a second clean disposable DB. Existing B03/B07/B08/R01/R03 regression and isolated R05 tests all remain.

## Security implications and open questions

- **This improves confidence in collision consistency but does not change live collision rules.** Actual live database still blocks shallow wall-edge overlap until a separately approved, correctly versioned SQL migration is installed in a controlled order after R05. The client still defaults to strict collision.
- The exact trigger body for issued tools checks whether a destination map has fog/collision rules before enforcing a DM placement requirement. Its ultimate authorization also depends on live RLS. A separate cross-map tool authorization audit with real role/map membership and complete production RLS is advisable before an SQL release; do not assume this isolated trigger suite proves that a player cannot relocate a tool to an unrelated map.
- Full canonical `public.commit_world_motion_v2`, alternate direct-write RPCs, `forge_visibility.validate_piece_trajectory`, existing RLS policies, private LOS and passive P2 transport must still be validated together against correctly versioned migrations. No private wall coordinates or NPC attributes should reach player clients from the new geometry. The tests check physical collision and the private V2 schema privileges but do not simulate an actual second authenticated account.
- Every test fixture update is rolled back, and new geometry helpers are invoked only inside isolated test transactions. The active production SQL and R16 main lineage remain untouched.
- The repetitive movement lag is **not** solved in this package: current baseline still has ~1.06-second median commit and 2.38-second p95 release-to-terminal lock. R18-16 bounded, opt-in movement latency bins remain staged; a later separately approved frontend canary should compare equal-workload early/late movement to identify whether transport/commit saturation grows.

## Next gated step

Continue with source-real **`validate_piece_trajectory` and alternate movement RPC integration**, and a real-auth RLS/authorization fixture (especially cross-map issued tool permissions), followed by migration-history reconciliation with authenticated pinned CLI. Both R05 and new R18-17 wall-helper SQL require **separate explicit backend approval**. After the backend is known compatible, the client 0.10 option needs an independently approved frontend activation and genuine cross-account player/P2 fog safety tests.

**Engineering decision:** VERIFIED IN STAGING AFTER EXACT-HEAD CI, but **NO-GO for SQL, merge, or new live frontend deployment**.
