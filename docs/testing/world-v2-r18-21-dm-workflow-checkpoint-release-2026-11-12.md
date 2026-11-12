# B10-R18-21 — DM map workflow compatibility, corrected live collision-guard parity and coordinated SQL preflight

**12 November 2026 (Australia/Melbourne). Staging-only engineering; NO-GO for Git merge, Vercel rollout, and Supabase SQL.**

## Baseline and scope

Parent: R18-20 draft PR #123 at `60e4016d0934b42d6fc3342defa5a670ead9afa5`. The project currently serves the frontend-only R18-15 live canary `dpl_E1P6cNfuswAMH7qAFnSLPrTWN6kQ`. Git `main` remains R16 `90df8c960e79e8d66c322095611427da7bb09de4`. Supabase Free project `lwhwgqaunxbmvyndswze` has 83 registered migrations, latest `20261109171247`; frozen R05 `20261111023204` is not installed. Guarded 700ms observer recovery stays OFF; 12-second signed recovery stays ON. All SQL changes here run **only in isolated postgres:17 with BEGIN/ROLLBACK**. No production DDL/DML, CLI push, PR merge or deployment.

The approved goal was to confirm that R18-20 campaign identity triggers would not break DM map upload, map calibration, party routing or future safe map copying, and to prepare an honest ordered-release gate. A more urgent release-critical blocker was also identified and fixed while auditing function parity.

## Confirmed DM workflow contract

Reviewed `src/TabletopApp.jsx`, `src/Welcome.jsx`, the current `public.move_entire_party_to_map(uuid,uuid)` live `pg_get_functiondef` (SELECT-only, MD5 `2e7de20ead8eb0dd156fe4e6f2f08bb7`), the active campaign RLS, and live maps/pieces:

- **Map upload:** create a NEW `battle_maps` row by `INSERT` with `campaign_id:activeId`; it does not UPDATE an existing map's campaign.
- **Map calibration:** `battle_maps.UPDATE` changes width, height and grid size, guarded by map/campaign match and optimistic old values, not identity.
- **DM map selection / assignments:** `campaign_map_views` and `campaign_player_maps` upserts, no identity reparent.
- **Publish active map:** `campaigns.active_map_id` changes, not the map row's campaign.
- **Move entire party:** actual live SECURITY DEFINER RPC validates DM membership and same-campaign destination, sets `campaigns.active_map_id`, deletes `campaign_player_maps` overrides; **does NOT relocate canonical token/tool rows**.
- **Map-copy/import:** the current app does **not** expose general cross-campaign map cloning or whole-campaign import. Sheet-template JSON import and account-owned token artwork are different workflows. A future safe map-copy workflow should INSERT a fresh map ID in its target campaign and copy/map assets under the new campaign, not UPDATE campaign_id on an existing map. SQL test W16 verifies only the new-row identity pattern, **not a shipping map-copy feature**.
- The R18-20 proposed map/token `campaign_id` immutability guard is compatible with the observed DM routes. This does not certify external admin scripts or unreviewed future imports. The older, existing live token/tool validator functions already verify map/campaign affinity; R18-20 protects *coherent* identity reparenting.

`tests/world-v2-b10-postgres/live-party-route-r18-21.sql` is the **read-only-captured original** function. `tests/world-v2-b10-postgres/dm-workflow-affinity-r18-21.sql` tests actual DM/independent player roles and source-real guard plus R18-20, with **W01–W17** asserting upload, copy-by-insert, map calibration, valid/invalid party routing, cleared override mappings, no movement of existing pieces on party route, same-campaign DM token map change, reparent rejection, and private helper privileges. All are rollback-only.

## Critical release blocker discovered — R18-19 SQL candidate omitted live checkpoint logic

The original R18-19 `supabase/candidates/world_v2_r18_19_cross_map_guard.sql` copied collision functions from historical migration `20261108055943`. A **later deployed** World V2 amendment had added:

`forge_world_v2.commit_allows_piece_v2(...)`

inside **both** live `forge_visibility.enforce_collision()` and `forge_visibility.enforce_tool_collision()`, ensuring that an already-approved canonical World V2 commit can pass the legacy row trigger without paying for or failing a second geometry sweep. Thus the old R18-19 candidate, if applied, **would silently remove a required production behavior** and risk precisely the delayed movement/rubberbanding we are trying to eliminate. Existing R18-19 source-real tests did not catch that because they tested the older migration version of the trigger.

**R18-21 fixes the candidate in its own staged branch without applying SQL:**
- Refreshed both replacement function bodies from a fresh live SELECT-only `pg_get_functiondef` capture, exact MD5 `7e652f0f2334980ccc724e1748d334ba` token and `771ea1716498a43210661532f9c24977` tool.
- Preserved exactly the signed V2 checkpoint bypass logic, transaction authorization, legacy trajectory checks, portal/attribute handling, geometry, search path, security mode, and existing signatures.
- Retained the *only intended behavioral additions* from R18-19: token destination map must belong to token campaign; issued tool cross-map transfer must be DM-authorized and destination map must belong to the campaign, checked before held/unpublished early returns. The full existing token/tool validator remains a separate safety layer.
- `tests/world-v2-b10-postgres/live-collision-baseline-r18-21.sql` pins the complete live original definitions; `tests/world-v2-r18-21-live-checkpoint-parity.test.mjs` strips ONLY the precise intended map-transfer clauses and checks exact normalized body equality to the original LIVE baseline. Any future loss of the V2 checkpoint (or any other deployed body behavior) fails CI.
- `tests/world-v2-b10-postgres/live-v2-checkpoint-r18-21.sql` captures the **real** `forge_world_v2.commit_allows_piece_v2` function (live definition MD5 `7298cb6051ba259a9c5be1963e1a46a5`) and replays it, not a permissive stub, inside each affected disposable PG17 scenario.
- `tests/world-v2-b10-postgres/checkpoint-parity-r18-21.sql` performs **C01–C10**: both trigger bodies retain the signed helper; direct token/tool movement into a wall fails; a matching, private, transaction-scoped V2 checkpoint permits the already-authorized canonical UPDATE for token *and* tool; another actor cannot claim it; deleting the checkpoint restores full collision denial; private schema/insert privileges remain blocked. Artificial test sessions/checkpoints cannot be created by ordinary authenticated players in production.

**Important:** parent PR #122 (R18-19) contains the earlier unsafe SQL candidate and MUST NOT be merged or cherry-picked independently. The corrected, cumulative R18-21 branch supersedes that file. If an older PR is later merged, only the corrected file version from R18-21 may be considered for a new versioned SQL migration, pending the full release gates below.

## Intended backend dependency order (not executed)

1. **Read-only preflight:** verify live 83 history records, all per-statement hashes, exact canonical Supabase project identity, current seven critical function fingerprints and zero pending R05 records. Use the previously reviewed pinned authenticated CLI v2.81.3 isolated-workspace mechanism, *not* repo-root `db push`. The historical SQL files must be fetched securely and compared to fresh live digests. No CLI linked dry run was performed in R18-21.
2. **First SQL version:** frozen R05 `20261111023204_world_v2_b10_integrated_motion.sql` unchanged. The old R18-08 gate expects this as exactly **one** pending migration, in the fresh 83-file isolated history. An explicit, separate SQL approval is required to apply it and verify 84 recorded versions, security, canonical observer convergence and recovery.
3. **Follow-on SQL candidates, all currently unversioned and unapplied:** in order, R18-17 dual `forge_world_v2` and `forge_visibility` swept geometry clearance, R18-19 **corrected live-checkpoint-aware** map-transfer functions, and R18-20 campaign identity triggers. Do not invent migration timestamps or run ad hoc `execute_sql`. Generate new versions only with the pinned authenticated Supabase CLI after the actual 83-history and fresh project state are reconciled, and obtain a **new, separate explicit approval** for these changes. Re-test against actual deployed post-R05 functions before versioning; snapshots may become stale.
4. **Additional blocker:** the current B10 combined staging suite tests the geometry and guards together in one disposable DB and independently rehearses R05 in another. It does **not** yet prove the entire R05→wall→map-guard→affinity SQL chain on one freshly reconstructed production-compatible database. That integrated post-R05 rehearsal remains required before release authorization, alongside rollback and hash verification.
5. **Only after server compatibility is installed and validated:** separately approve and enable the client 0.10-cell preflight for the real site. The frontend stays strict until then, and the 700ms guarded recovery stays OFF. Test actual independently authenticated P1/P2 with DM, fog/hidden wall and NPC confidentiality, signed per-viewer revocation, held-tool/party routing and sustained movement. Local DM preview or a PG observer stub is not P1/P2 acceptance.
6. **Performance:** R18-21 restores a necessary pre-existing authorized checkpoint, but does not reduce ~1s authoritative commit delay or sustained-session overload by itself. Use already staged R18-16 bounded timing to isolate transport/commit/render phases; eventual server optimization follows security clearance. Remain within Vercel/Supabase Free resources.

## Verification and decision

The independent rollback suites contain **17 DM workflow assertions** and **10 checkpoint-preservation assertions**, in addition to all R18-17/18/19/20 source-real tests and isolated R05 rehearsal. The Node tests include source fingerprint/guard-only exact-body checks and snapshot/update UI contracts. Exact-head CI, Vite, CodeQL, combined PostgreSQL 17 and production alias/SQL-history postflight must be recorded after final staging commit.

**Verdict: staged repair is necessary for a safe future SQL release. Live SQL/frontend remain NO-GO; no staging work authorizes production migration or deployment.**
