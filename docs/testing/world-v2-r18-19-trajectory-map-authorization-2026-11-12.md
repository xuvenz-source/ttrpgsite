# B10-R18-19 — Latest trajectory authority and issued-tool cross-map review

**12 November 2026 (Australia/Melbourne) · STAGED ONLY · NO-GO SQL/frontend deployment**

## Release lineage

Parent: B10-R18-18 draft PR #121, exact SHA `d2d1e038c82e4dc1265171846aa829b1f176fd7c`. The current live frontend is still **R18-15** Vercel `dpl_E1P6cNfuswAMH7qAFnSLPrTWN6kQ` at `https://ttrpgsite.vercel.app`, from frontend SHA `7628a319b8c62bf18a4046fffc7bb4b8f28d67be`. Git `main` remains R16 SHA `90df8c960e79e8d66c322095611427da7bb09de4`. The frozen R05 Supabase migration `20261111023204` is unapplied. The R18-17 wall-clearance and R18-19 map-guard SQL files are **unversioned, nonapplied candidates**; no client clearance opt-in, 700ms guarded observer recovery or paid services were enabled.

## Critical correction to R18-18 test scope

R18-18 imported authentic **historical** collision trigger bodies from `20261108031754_world_runtime_movement_fog_collision_20261108.sql`. Read-only inspection of LIVE `pg_get_functiondef` confirms those are NOT the final deployed function bodies: `20261108055943_world_runtime_single_write_trajectory.sql` later added a private `forge_visibility.validate_piece_trajectory`, enhanced BOTH collision triggers with `forge.trajectory_*` context, and changed `public.commit_map_trajectory` to validate every leg before one final write. R18-18 therefore proved historical trigger behavior, **not complete latest deployed trajectory behavior**. R18-19 closes that source-fidelity gap.

`tests/world-v2-b10-postgres/extract_latest_trajectory_r18_19.py` pins the exact original Git blob hashes:
- historical trigger/move-group migration `c774aa7d13e89aa2d783d8d5fdc6f46326e28206`
- later live trajectory migration `2dbb5e3d76ffbfecbb33c739a3a6a7d328baf451`

It source-extracts final `forge_visibility.validate_piece_trajectory`, final `enforce_collision`, final `enforce_tool_collision`, historical (current) `public.move_map_group`, and final `public.commit_map_trajectory`, preserving search_path/definer/invoker distinctions and private function revoke. It makes **no network calls**, imports no alternate movement implementation and fails closed on source drift.

## New security finding — issued tool cross-map shortcut

The latest deployed original `forge_visibility.enforce_tool_collision` body tests `held_by_token_id` and absence of published map rules **before** its usual non-DM cross-map check. Thus **the trigger alone** did not prevent an owner from changing an issued tool's `map_id` to an unpublished destination or moving a held tool across maps. R18-19 first demonstrates the *unpatched historical source-real trigger* permitting those moves in the deliberately simplified disposable fixture (negative controls B01/B02), then restores the fixture before the hardened candidate (B03). **These are trigger-level tests, not a claim that the current external REST API has been exploited**; production row policies, token ownership and PostgREST filters also matter.

The production `campaign_tool_issues` UPDATE RLS expression, observed read-only, grants edit to DM or to a campaign member whose issued tool is owned/shared. Its `USING`/`WITH CHECK` predicates do not intrinsically restrict destination `map_id`. In a SET ROLE authenticated disposable fixture reproducing these RLS Boolean expressions, a player owning the tool can edit its row but the hardened trigger rejects a cross-map transfer (L02); another nonowner's private tool remains uneditable and revoking membership cancels shared edit entitlement (L04/L06).

**Staged corrective candidate:** `supabase/candidates/world_v2_r18_19_cross_map_guard.sql`. This copies the **latest**, trajectory-aware, unchanged-signature SECURITY DEFINER trigger bodies, altering only pre-return map-transfer checks:
1. Issued tool `new.map_id IS DISTINCT FROM old.map_id` requires a current campaign DM. This is checked **before** held-item, null map and absent-rules early returns.
2. A non-null destination map must exist and its `campaign_id` must match the tool's current campaign; otherwise even a DM is denied.
3. Token direct map transfers also require that the destination map belongs to the token campaign; the existing non-DM map transfer deny remains.
4. No new public RPC, policy, role, access grant or production table is introduced.

**Additional explicit gap:** The existing token/tool trigger firing definitions cover `map_id` but not standalone `campaign_id` updates. A follow-up must validate current RLS and referential constraints, and consider explicit campaign-ID immutability/enforcement with reviewed trigger DDL, before claiming full cross-campaign security. Do not take this staged candidate alone as a complete map-security release.

## Source-real disposable PostgreSQL tests

`tests/world-v2-b10-postgres/trajectory-map-auth-r18-19.sql` runs **inside one BEGIN/ROLLBACK** after R18-18, incorporating real newer trajectory function bodies, the nonapplied dual V2/legacy 0.10-cell swept-wall candidate, and then the nonapplied cross-map guard. The fixture contains no real accounts, real campaign data or production SQL writes.

- **B01–B03:** negative controls: original latest held-tool/unpublished-map trigger shortcuts allow non-DM direct UPDATE *in this unprotected fixture*; restore position/map before installing candidate.
- **A01–A22:** preserve real public RPC invoker, private trajectory helper revoke, 5% wall edge clearance, 25% collision refusal, high-speed thin-wall blocking, safe multi-leg detour, `public.commit_map_trajectory` single final persistent write, mixed token/tool atomic rollback, direct `move_map_group` authority, empty-route/override rejection, non-DM map transfers, held/unplaced tools, map/campaign mismatch rejection even for DM, legitimate same-campaign DM transfer, unchanged private ACL.
- **L01–L07:** with **real PostgreSQL `SET LOCAL ROLE authenticated`** and isolated public tool-table RLS using Boolean predicates from inspected live policy, verify owner same-map edit, cross-map guard denial, no unauthorized ownership reassignment under `WITH CHECK`, independent owner-only edit, sharing, membership revocation and unchanged tool's original map.

These are **32 isolated named assertions** (B 3 + A 22 + L 7), plus all historical B03/B07/B08/R01/R03/R05 and R18-17/R18-18 rollback tests. There are no actual authenticated Supabase browser identities in these tests, and the RLS policy mirror is not the production DDL or private fog/LOS policy.

`tests/world-v2-r18-19-trajectory-map-security.test.mjs` enforces both historical SHA pins, source real extraction, correct placement of hardened checks before early return, true SQL updates and rollback, 32 named cases, no remote or new privilege APIs, original unchanged R05 and strict-default live client. Existing combined PG17 and Node Vite/CodeQL must pass at exact PR HEAD.

## Remaining gates and architectural priorities

1. **Before any SQL:** audit standalone `campaign_id` updates and RLS; inspect cross-campaign map foreign keys, other move/placement RPCs, and test full actual production policy DDL and independent authenticated map-assignment behavior. Source-real `advance_map_motion_session_path` and legacy gesture session table lifecycle are not executable in this fixture; a further isolated production-parity test is needed.
2. Obtain actual pinned Supabase CLI authenticated reconciliation for all **83 live registered migrations** and exact historical SQL digests. Frozen R05 cannot be overwritten. Create the R18-17/R18-19 candidates as separately reviewed, correctly ordered versioned migrations **only after** complete security signoff and explicit designer SQL approval.
3. R05 and new wall/cross-map SQL remain unapplied. Only after backend is verified, obtain **separate frontend deployment approval** for opt-in 0.10-cell preflight. Keep 700ms observer guarded mode OFF. Test independent player P1 and passive P2 convergence, fog/hidden-barrier protection, revocation, and rollback.
4. **Latency is independent:** client R18-15 still has approximately 1.06-second median commit and 2.38-second p95 release-to-terminal lock. Continue staged bounded timing cadence tests and separate server authority optimization; do not claim the wall clearance fixes accumulated movement lag.

**Verdict: R18-19 source-fidelity and authorization candidate may pass staging, but is NOT production release-ready.**
