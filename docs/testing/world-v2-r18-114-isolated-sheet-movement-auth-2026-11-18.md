# B10-R18-114 — Isolated source-hash-bound campaign sheet + movement authorization

**18 November 2026. Draft, no deployment, original/QA database untouched.** Direct parent: R18-113 PR #216 `3bf5ebb78465ee1c31b00c5edc808972acac6f46`.

## Goal and provenance

R18-113 passed source-exact DM NPC authorization in disposable PostgreSQL17 with synthetic Auth and DM helpers. R18-114 expands *actual PostgreSQL execution* to campaign-sheet inventory and token/tool movement authorization.

The extractor `tests/world-v2-r18-114-postgres/extract_source.py` selects **six functions already in tracked Git SQL** (four campaign-sheet functions, `can_view_campaign_map`, `dispatch_movement_preview`) and checks **exact source-body SHA-256 plus byte length against the frozen read-only R18-103 original PostgreSQL catalog record** before generating any SQL. R18-103 also established direct live source-body equality for the latter two. The four sheet sources are additionally bound by R18-103 live `pg_proc` SHA-256; a hash match still does not certify runtime authorization.

All generated SQL is temporary and executed only against a scratch PostgreSQL17 container within GitHub Actions. There are no real original migrations from the private Ubuntu folder, live users, original campaign data, Supabase auth credentials, or network writes.

## Fixture boundaries

- `auth.uid()`, `is_campaign_dm`, and a synthetic public movement delegator are **test stubs**, not signed Supabase Auth sessions or live-source-equal implementations.
- `can_view_campaign_map` and `dispatch_movement_preview` ARE exact functions from tracked Git migrations with R18-103 live-source equality, but the Realtime sender, line-of-sight observer and collision helpers are simulated. They do not prove fog secrecy or real multiplayer synchronization.
- Test tables hold invented campaign A/B, DMs, P1/P2, outsider, mismatched rows and private JSON fields. Application roles cannot SELECT base tables; SECURITY DEFINER functions run with privileged synthetic postgres ownership and require explicit authorization.
- Network/tool isolation: CI runner requires exact localhost client PostgreSQL 17, `world_v2_r18_114` DB, explicit disposable marker, ephemeral fixed synthetic password and rejects external database URL and libpq connection overrides.

## Test assertions

**38 sheet cases:** 17 source-exact permission-chain results, 12 inventory getter allow/deny outcomes, 9 sheet PATCH allow/deny outcomes. Verify owners/DM/other player/other campaign/outsider/null identity, NPC template/token DM-only access, real inventory-field declarations, and that noninventory PATCH cannot overwrite inventory without a lease. Direct authenticated SELECT of private character table and direct private helper EXECUTE are denied.

**25 movement cases:** source-exact movement dispatcher called through a synthetic public wrapper, checking player token ownership/visibility, map membership, foreign-campaign and outsider rejection, invalid kind/seq/grid, DM-only collision override, private tool owner checks, accepted previews, replay and deterministic rapid-input rejection, no persisted token-coordinate mutation and immediate membership revocation denial. A dummy observer returns no recipients for broadcasting, so this is **not a Realtime or LOS test**.

**5 additional role ACL denials:** anonymous inventory/movement RPCs, authenticated direct character SELECT, authenticated private sheet helper EXECUTE, and authenticated direct `forge_visibility` dispatcher access.

The tests intentionally fail on incorrect permission outcomes and cannot be treated as QA approval. All test pass claims must be supported by exact-head GitHub Actions workflow logs, not merely file existence.

## Remaining gates

The known `is_map_fog_published` cross-campaign metadata leak is unfixed in hosted original, as demonstrated in earlier R18-104/R18-105 tests. Exact 83 private history semantic reviewer decisions remain pending, no independent linked CLI source authentication attestation has been completed, and the 67 callable privileged RPCs have not all passed per-function source and signed-account tests. No QA historical schema replay/dry-run or installation is approved; no hosted DM/P1/P2 signed test, browser movement p95/lag testing, paid resource or production deployment is authorized.

**Release: NO_GO. Keep PR draft and unmerged. No manual Ubuntu step needed for this CI fixture.**
