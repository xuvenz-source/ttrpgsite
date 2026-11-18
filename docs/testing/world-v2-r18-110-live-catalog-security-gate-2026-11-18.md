# B10-R18-110 — Original live catalog security gate and private SQL review blockers

**18 November 2026. Source-only metadata evidence / NO_GO.** Direct parent R18-109 PR #211 SHA `8f4de32594137513c9bae1ed139e1ded5d5bacdc`. Release blocker tracked in [#212](https://github.com/xuvenz-source/ttrpgsite/issues/212). No migration SQL, credentials, original campaign/user rows or source-code function bodies exported.

## Read-only original Supabase observations

Executed **SELECT-only** statements against PostgreSQL catalog `pg_proc`, `pg_namespace`, `pg_class` and ACL privilege predicates, plus Supabase security advisors. No writes, SQL migration installation, data reads, production or QA changes.

| Category | Verified observation |
| --- | --- |
| Original / QA registered migrations | **83 / 0** |
| QA public application tables | **0** |
| Original public tables | **31** |
| Original public tables missing RLS | **0** |
| Public views / exposed non-invoker public views | **0 / 0** |
| Public SECURITY DEFINER functions | **85** |
| Authenticated callable `public` SECURITY DEFINER functions | **67** |
| Anonymous callable `public` SECURITY DEFINER functions | **0** |
| The 67 auth-callable functions owned by `postgres` / configured search_path | **67 / 67** |
| Public authenticated callable functions lacking direct `auth.uid()` text | **7** (indirect guard/helper review required) |
| Internal `forge_visibility` SECURITY DEFINER functions | **23** |
| Internal `forge_world_v2` SECURITY DEFINER functions | **24** |
| Internal `forge_visibility` functions with anon function-level EXECUTE but anon has no schema USAGE | **7** |
| Security advisors: RLS enabled no policy INFO / auth definer warning / leaked-password warning | **15 / 67 / 1** |

**Important effective permission distinction:** The seven internal function-level anonymous EXECUTE privileges are not direct anonymous callability because `has_schema_privilege('anon','forge_visibility','USAGE')` is false. They are still grants worth reviewing for defense in depth and unintended indirect paths. Do not revoke them until QA regression and trigger/helper dependency review.

Seven existing R102 elevated `public` functions without a direct `auth.uid()` string: `get_campaign_sheet_inventory`, `get_dm_map_npc_values`, `get_npc_token_values`, `is_map_fog_published`, `patch_campaign_sheet_noninventory`, `preview_map_motion`, `publish_map_environment`. The new live source-byte sizes and MD5s in the manifest confirm the metadata observed now; they do **not** certify authorization correctness. Source-level markers can miss indirect helper auth and role checks.

## Known confirmed vulnerability blocks QA acceptance

R104 source-matched `public.is_map_fog_published(uuid)` (current original byte length 102, MD5 `084a62df8ed72d3e5fffbfce9507ff0f`) and R105 disposable PostgreSQL17 test reproduced an authenticated nonmember's ability to infer another campaign's fog-published status. The exact R104 candidate (Git blob `c84d7cf8b0958621f11ec273cb36361e2501a77f`) closed the synthetic-fixture oracle and preserved authorized DM/player and combat-roster RLS behavior.

**Neither original nor QA has received that candidate; the real 12-case signed-hosted matrix is NOT_RUN.** Restoring the vulnerable source is unsafe as an automatic rollback. A reviewed secure inverse is required before any hosted security acceptance.

## R98–R109 private recovery proof boundaries

The operator's local R18-98/99/108/109 sanitized receipts attest 83 files with matching SHA-256 `fe31759c142602047c1813d8ba1868f734138b8f94c773f7f1b6106b5b6bb783`, and heuristic triage shows four additional priority files, zero credential-pattern detections, and nine migration files with `SECURITY DEFINER` but no direct `auth.uid()` text. These are **file-level heuristics**, neither independent authentication proof nor a human review of each SQL body or function.

No raw historical SQL or private recovery directory copied to GitHub or chat. Existing frozen R98–R109 source-only ledger fields remain historical snapshots and are not silently rewritten as complete operator attestation.

## Strict next gates

1. Exact, private **83-file human / expert SQL semantic review** for production data assumptions, backfills, DML, storage and Realtime writes, owner/role/GRANT defaults, AUTH, RLS, search_path and helper call graphs, source name dependencies, DDL compatibility and replay/rollback risks. Do not upload raw SQL to Git.
2. Validate every elevated callable function **by source and permission tests**, not by string matching. Specifically scrutinize the seven flagged public RPCs and their indirect helper paths, the seven private-schema granted functions and exposed RLS interactions.
3. Gate the known fog-status fix on independent SQL review and explicit **QA-only post-baseline candidate** plan. No signed-player testing or production fixes with the vulnerable original source.
4. Independently attest operator linked CLI source identity; **create separately linked QA workspace** only after review. QA historical dry-run, QA installation, eight pending migrations, protected preview deployment, real signed DM/P1/P2/outsider acceptance, movement/LOS/fog security, p95 latency and free-tier memory/load remain not done.
5. No `db push`, `db reset`, migration repair, SQL DDL/DML or deployment to original/production. Never copy production user/campaign rows into QA.

**Gate status: historical semantic audit NOT DONE; QA SQL installation NO_GO; production release NO_GO.** No user manual action is required to preserve the current status. A trusted reviewer will need secure local access to the 83 SQL files before authorizing any QA schema replay.
