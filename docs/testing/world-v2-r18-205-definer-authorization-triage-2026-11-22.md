# B10-R18-205 — Original 67 public privileged callable functions: identity, delegation and known blockers (NO_GO)

**22 November 2026.** Nested source-only child of [R204 draft #314](https://github.com/xuvenz-source/ttrpgsite/pull/314), final parent SHA `a3e2b6ceed9be32fdcc767c39ffb2187e81394e2`. R204 isolated SQL-helper and stale-assignment tests `44908475029` **SUCCESS**, general staged app/lint/audit/build/Edge `44908475000` **SUCCESS on exact-head unskipped failed-job rerun** after unrelated Chromium DevTools startup failure. The original and QA Supabase projects remain unchanged. No versioned migration, app/Edge code, PR merge, deployment or paid resource.

## Current original database read-only census (verified, not security signoff)

Two reproducible **SELECT-only** `pg_catalog.pg_proc` queries are staged at `scripts/release/r205_readonly_definer_authorization_census.sql` and `scripts/release/r205_readonly_definer_focus_queue.sql`. The original database SQL reads its own function bodies **only inside PostgreSQL** to compute fixed booleans, byte lengths, SHA-256 hashes and **known public routine names**; **no SQL source text, function signatures/arguments, user records, keys, private migrations or JWT values are returned**.

| Current original catalog attribute | Value |
|---|---:|
| Total `public` functions | **112** |
| `SECURITY DEFINER`, authenticated-callable | **67** |
| Those callable by anonymous role | **0** |
| Those owned by `postgres` | **67** |
| Explicit empty `search_path` | **67** |
| Explicit nonempty / absent `search_path` | 0 / 0 |
| Direct `auth.uid()` marker | 60 |
| **No** direct `auth.uid()` marker | **7** |
| Direct `campaign_members` marker | 10 |
| Direct DM-helper call marker | 42 |
| User-editable Auth metadata marker | 1 |
| `auth.jwt()` / dynamic `EXECUTE` / `TRUNCATE` words | 0 / 0 / 0 |
| `DELETE` / `UPDATE` / `INSERT` text words | 17 / 29 / 21 |

PostgreSQL SECURITY DEFINER executes with owner privileges, and `auth.uid()` mention is not proof that *every* branch checks caller authorization. Direct `campaign_members` absence is not proof of no membership check if a helper is called; the converse does not establish correct campaign matching. The `UPDATE` etc. counts are **lexical text markers**, not executed or reachable write operations. The seven are candidates for call-chain semantic review, **not seven confirmed vulnerabilities**.

## Exact current eight-function focused queue, source hashes pinned

Seven missing-direct-identity functions plus **one separate metadata reader**:

| Current public RPC name | Direct-identity or delegation indicator | Review priority |
|---|---|---|
| `get_campaign_sheet_inventory` | No direct `auth.uid`/membership word; **delegates to `can_edit_campaign_sheet_inventory`, which delegates to `can_edit_campaign_sheet`**; write-verb word | **Existing #220 revoked-owner chain**, not an unguarded standalone getter. Existing R115 source-exact GET test covers this path. |
| `patch_campaign_sheet_noninventory` | Calls **`can_edit_campaign_sheet`**, whose original revoked owner gap #220 is source-exact reproduced | **Existing confirmed blocker**; re-run R115 in disposable PG17 |
| `is_map_fog_published` | No direct `auth.uid`/membership; EXISTS marker | **Existing confirmed fog-status metadata oracle #212**, re-run R105 in disposable PG17 |
| `publish_map_environment` | Calls `is_campaign_dm` but no direct `auth.uid` | Inspect delegated DM branch, public function args and relevant RLS |
| `get_dm_map_npc_values` | Delegates to `is_campaign_dm` | Verify false/outsider, DM authorization and cross-campaign scope |
| `get_npc_token_values` | Delegates to `is_campaign_dm` | Same delegated DM and campaign scoping requirements |
| `preview_map_motion` | Neither direct `auth.uid` nor known helper marker; 110-byte body | Inspect alternate helper/wrapper and actual caller privileges |
| `get_campaign_account_names` | Direct `auth.uid` and membership markers; **user-editable Auth metadata** marker; read-only lexical body | Metadata may be **display name**, not authorization. Verify no authorization decisions depend on editable user claims; do not flag a confirmed privilege escalation |

**Additional source reconciliation:** The checked-in, source-exact `supabase/migrations/20261107095350_campaign_sheet_inventory_collaboration.sql` defines `get_campaign_sheet_inventory` as a definer wrapper that calls the internal `can_edit_campaign_sheet_inventory`, which in turn calls `can_edit_campaign_sheet`. An independent original project read-only `pg_proc` check confirmed the internal inventory guard is one SQL SECURITY DEFINER function, **427 bytes**, SHA-256 `169d6e5ec9fb79a760bc25ab28a3937f4c76cc1a5233c997b673b366cd8176e4`, not directly callable by `authenticated` or `anon`, with a direct call to `can_edit_campaign_sheet`, no direct identity/membership marker. Consequently the getter's missing direct identity is a **delegated authorization chain** and the known R115 revoked-owner fixture already covers its GET outcome. This still does not mean the guard is installed or hosted safe. The original helper source body and signatures were not exported from hosted Supabase.

All eight original current `pg_proc.prosrc` SHA-256/UTF-8 lengths and booleans are pinned in the **source-only manifest**. These are **existing public routine names**, not historical private migration filenames or SQL bodies. Exactly one of the eight has a user-metadata marker; this alone does **not** mean it authorizes access with editable metadata.

## Independent exact-source synthetic regression rechecks

R205's dedicated CI isolates **two independent PostgreSQL 17 containers/jobs**; neither accesses the original or QA Supabase project. It SHA-pins and re-runs the exact unchanged existing:

1. **R105 `tests/world-v2-r18-105-postgres/run.sh`** original-source-bound fog-status function metadata oracle and existing **UNAPPLIED** R104 guard. Real original policy/hosted signed actors not invoked.
2. **R115 `tests/world-v2-r18-115-postgres/run.sh`** including unchanged original-source-bound R114 inventory-lease fixture: a removed synthetic sheet owner can claim/GET/PATCH until existing **UNAPPLIED** R115 campaign-membership check is applied in scratch; verified DM, own stale lease release and legitimate reinstatement, 23 original lease scenarios.

They run only in GitHub Actions with their exact `R105_ISOLATED` or `R114_ISOLATED`+`R115_ISOLATED` markers and local scratch PostgreSQL service names/credentials. Strict R205 source validator pins both existing runner Git blobs (plus R114), the two new SELECT-only queries, current 67-function aggregate, eight known function SHA-256 bodies/marker matrix and hard security NO_GO fields. Hostile tests refuse source drift, false GO, approval inflation and unauthorized hosted actions.

## Scope and remaining blockers

Prioritize already confirmed #212 fog and #220 revoked sheet, then both no-direct-auth/no-known-helper RPCs, delegated DM scope and the metadata display/auth distinction. R205 does **not** approve the remaining 59 privileged function call chains or these eight semantically. All **67 live authenticated-callable definer authorization chains** and **83 private historical migration semantics** remain security review gates.

Still pending: signed DM/P1/P2/removed/outsider full QA on isolated independently authorized environment, fresh Storage signed URL issuance after removal, one-hour already-issued bearer expiry/support handling, invite rejoin #223, privileged campaign membership TRUNCATE #229, authenticated five-table TRUNCATE #306, plus already-named blockers #212/#220/#231.

**No original or QA SQL writes, policy installs, active migration changes, runtime changes, PR merges, deployments or paid resources.** No manual WSL upload is necessary for R205. A successful synthetic CI result is not hosted signed QA or production security approval.
