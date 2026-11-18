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

## Source-confirmed inventory item identity defect

During R18-114, the disposable PG17 test of the exact original `get_campaign_sheet_inventory` source failed on a previously valid inventory item ID. The original SQL used a **four-group** pattern `8-4-4-12` instead of canonical UUID `8-4-4-4-12`. The fallback branch runs `gen_random_uuid()::text` and writes the replaced row back. Because generated UUIDs also fail the original pattern, repeated authorized reads can repeatedly regenerate persistent item IDs.

A **read-only** original Supabase SQL check confirmed `existing_regex_accepts_valid_uuid=false` and `corrected_regex_accepts_valid_uuid=true` on a synthetic canonical UUID, with live function body MD5 `5f47826bc6673b92a0cbc277b1b77c51` and 1,950 body bytes. The R18-103 stored SHA-256 `4b168977eaa254f665fa1f26ed81d7296053bb988b991e60574c1610de0a879e` is also matched against the committed Git body during fixture extraction.

In disposable PG17 the **exact original function** was executed twice: the same already valid inventory row received two different UUIDs and persisted the replacement. The fixture then restored its synthetic original row, applied **only** `staging/world-v2-b10-r18-114-inventory-uuid-guard/unapplied-inventory-uuid-five-segment-guard.sql` inside scratch PG17, and verified both repeated preservation of valid IDs and one-time generation of legacy IDs. A Node regression test compares the candidate function DDL to the original and requires **exactly one textual UUID regex change**, preserving everything else. The original migration remains unchanged.

**Sequence clarity:** The 38 sheet permission/GET/PATCH scenarios run against the source-exact campaign authorization helpers and PATCH body, but the GET function is the **scratch-only patched candidate** after the reproduced original defect. Accordingly those 38 pass results are NOT a pass for the unrepaired live inventory getter. The 25 movement cases run the original source-exact dispatcher. No candidate is applied to original or QA. Any eventual release requires a separate reviewed migration and approval. The potential impact on collaborative inventory locks and unnecessary writes is a code-level consequence; no live latency or production impact measurement was made.

## Test assertions

**38 sheet cases:** 17 source-exact permission-chain results, 12 inventory getter allow/deny outcomes, 9 sheet PATCH allow/deny outcomes. Verify owners/DM/other player/other campaign/outsider/null identity, NPC template/token DM-only access, real inventory-field declarations, and that noninventory PATCH cannot overwrite inventory without a lease. Direct authenticated SELECT of private character table and direct private helper EXECUTE are denied.

**25 movement cases:** source-exact movement dispatcher called through a synthetic public wrapper, checking player token ownership/visibility, map membership, foreign-campaign and outsider rejection, invalid kind/seq/grid, DM-only collision override, private tool owner checks, accepted previews, replay and deterministic rapid-input rejection, no persisted token-coordinate mutation and immediate membership revocation denial. A dummy observer returns no recipients for broadcasting, so this is **not a Realtime or LOS test**.

**5 additional role ACL denials:** anonymous inventory/movement RPCs, authenticated direct character SELECT, authenticated private sheet helper EXECUTE, and authenticated direct `forge_visibility` dispatcher access.

The tests intentionally fail on incorrect permission outcomes and cannot be treated as QA approval. All test pass claims must be supported by exact-head GitHub Actions workflow logs, not merely file existence.

## Remaining gates

The known `is_map_fog_published` cross-campaign metadata leak is unfixed in hosted original, as demonstrated in earlier R18-104/R18-105 tests. Exact 83 private history semantic reviewer decisions remain pending, no independent linked CLI source authentication attestation has been completed, and the 67 callable privileged RPCs have not all passed per-function source and signed-account tests. No QA historical schema replay/dry-run or installation is approved; no hosted DM/P1/P2 signed test, browser movement p95/lag testing, paid resource or production deployment is authorized.

**Release: NO_GO. Keep PR draft and unmerged. No manual Ubuntu step needed for this CI fixture.**
