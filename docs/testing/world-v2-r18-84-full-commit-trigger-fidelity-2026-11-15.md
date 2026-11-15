# B10-R18-84 — Full x/y token and issued-tool trigger-fidelity rehearsal

**15 November 2026, Australia/Melbourne · DISPOSABLE PG17 SOURCE-REAL TESTS ONLY · Production and preview NO-GO.**

Parent PR #185 R18-83 exact commit `1006fc709fcaac3d75016f779a4ec1e52552e840`. Draft PR #186 must remain unmerged until separately approved; no SQL migration, live DB write, Vercel deploy/alias, environment flag or paid tier action is part of this step. The permanent protected QA site continues to serve the old R18-62 build, and movement was previously reported unsatisfactory.

## Why R18-84 exists

R18-83 traced the original signed Commit into synchronous private visibility and discovered a coverage defect in its local benchmark. The real live position-only UPDATE on `public.map_tokens` calls six triggers, but R18-54/68 executed only the collision and visibility triggers. Live `public.campaign_tool_issues` position-only UPDATE calls four triggers that the previous measured route did not exercise. Hence the R18-83 local function costs are useful but not a full production trigger cost estimate.

**Read-only verified live catalog source MD5s (15 Nov 2026):**

| Position UPDATE trigger | Original trigger function | pg_get_functiondef MD5 |
|---|---|---|
| forge_player_collision | forge_visibility.enforce_collision() | 7e652f0f2334980ccc724e1748d334ba |
| forge_visibility_token_tick | forge_visibility.tick_tokens() | f6c2eef860141bff253024e0f6d8c7ba |
| npc_token_sheet_items_rpc_only | public.reject_direct_sheet_inventory_overwrite() | 14c6e5f2f18d473a807c8f5a4bd3277d |
| tokens_protected | public.protect_token_fields() | 188ca42e10f52115511eba0a594c29c6 |
| tokens_touch | public.touch_updated_at() | 8639838030b589f3caeaf247e9aa9986 |
| tokens_validate | public.validate_token_map() | 8ddb83de264171910132b2da9979f26c |
| campaign_tool_items_rpc_only | public.reject_direct_tool_inventory_overwrite() | b33940d8d6f5b676b4cf0ec4e0548978 |
| campaign_tool_sync_map | public.sync_campaign_tool_map_token() | 640b3b7ae479936c45271482a150afaa |
| campaign_tool_validate_issue | public.validate_campaign_tool_write() | 3968fd2daec5e268c931cdcf42e9bdc7 |
| forge_tool_collision | forge_visibility.enforce_tool_collision() | 771ea1716498a43210661532f9c24977 |

The first two original function bodies come from existing frozen R54 source. The eight missing original bodies were retrieved through SELECT-only linked Supabase catalog inspection and copied to `tests/world-v2-b10-postgres/r84-live-position-trigger-functions.sql`; every one has a strict `md5(pg_get_functiondef(...))` guard after installing only inside the existing disposable PostgreSQL fixture. All ten trigger names and x/y firing definitions are checked.

## Test architecture and safety

The existing R54/R68/R83 local benchmark remains the **first**, unchanged default pass. A second call to the same R54 test file uses the explicit local `psql -v r84_full=1` flag. Both run only through the `WORLD_V2_B10_ISOLATED=yes` + local `PGHOST` + `PGDATABASE=world_v2_b10` runner, inside the R05 disposable `world_v2_b10_r05` PostgreSQL 17 database. R84 installs original eight additional function bodies and four missing token/four tool triggers in the existing **BEGIN/ROLLBACK** transaction. A compact set of B04-only table columns and dependency tables permits unchanged source bodies to execute; no source function is rewritten, and these simplified tables do **not** certify full production schema, grants, security policies or hosted resources.

R84 retains original R54 wall-blocking and per-viewer private fog revocation; original R68 36 forward/36 return signed token Commits across fog ON/OFF, empty/24 off-route walls and 1/6/12 accepted cells; then transaction-local `SET LOCAL track_functions='all'` records function calls/inclusive/self time. This preserves the original per-viewer visibility and canonical collision authority without fake client-side position updates.

After the signed token baseline, separate original signed **tool** Begin/Advance/Commit + reverse runs exercise all four issued-tool triggers across fog ON/OFF and assert tool revisions and the derived `campaign_tool_map_tokens` position. Hostile checks include player tool reconfiguration rejection, protected token owner overwrite rejection, token cross-campaign validation, solid mount wall block without geometry leakage and mid-session player revocation before Commit. Any failure must abort the disposable transaction and the PostgreSQL workflow. Only aggregate function names/counts/timing can appear in CI logs; private scenes, viewer frames and real actor identifiers are not captured.

The R54 post-rollback gate verifies no source trigger/function, profiler tables, original movement sessions, or unexpected canonical position remains. All SQL changes are local-test-only; linked live Supabase remains `track_functions=none`.

## What evidence can and cannot prove

A clean CI run would validate full ten-trigger **function-source-and-firing fidelity in this disposable fixture**, not exact production timing/CPU, RLS, network, real browser latency, or three-party player convergence. Earlier browser DM baseline remains `Advance p95=740.1ms`, `Commit p95=1451.7ms`, and `release-to-terminal p95=2226.1ms`, **FAIL**. The R18-83 xact function-profile inclusive costs overlap Begin/Advance/warmup/return and must not be interpreted as additive Commit-only phase costs. R18-84 is a test-enablement step, not a speed patch.

**Hard NO-GO remains**: externally authenticated official pinned Supabase CLI v2.81.3 linked 83+8 history fetch/list/`db push --dry-run`; independent truly signed DM/P1/passive P2 wall/fog/revocation/observer canonical convergence; browser p95 under load; physical Free RAM/swap and locks under load; separate explicit production release approval. No source-authenticated optional R18-57 or R18-77 backend candidate is installed. No preview/production merge, deployment or migration is authorized.

## Verification record

The final handoff must record the exact draft PR #186 SHA; clean/failed original and full-trigger PostgreSQL outcomes and bounded aggregate timings; general tests/build/lint/audit and CodeQL; original historical R18-78/R18-79 NO-GO ledger checks; exact diff scope; and retarget draft PR #186 directly to R18-83 staging branch after all eligible GitHub Actions complete. Never declare engineering PASS without actual exact-head CI and committed rollback evidence. Keep the permanent QA host on its existing deployment.
