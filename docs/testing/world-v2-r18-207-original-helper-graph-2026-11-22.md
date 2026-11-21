# B10-R18-207 — Reconcile private 11-source lineage with the current 12-function privileged authorization graph (NO_GO)

22 November 2026. Source-only child of [R206 draft #316](https://github.com/xuvenz-source/ttrpgsite/pull/316) exact final SHA `fe36e37480744e661ae003ea9597cb80cda6cfda` (focused and standard exact-head CI `44918104589` and `44918104592`, both SUCCESS).

## Owner R206 receipt accepted

The user submitted **only** `r206-sanitized-report.json`, **11,290 bytes**, SHA-256 `f9d57b16c6b9babdad47ffea69f0e414fc5299277dabc146fbe4178eb2097471`. A strict source-shape/duplicate-key/type/no-private-SQL validator passed:

- 83/83 original historical migration SHA-256 verified, timestamps unique; R200/R198/R193 lineage reverified.
- All **11/11** selected current live target functions have exactly one direct original historical top-level CREATE FUNCTION body, latest body SHA-256 and byte length **equal current installed source**.
- R111 priority docket indices **are not migration chronological positions**; latest direct historical body was selected by actual unique timestamp version and statement ordinal. Numeric private review docket indices only, no filenames or SQL in the receipt.
- The script had **no network or database access** and explicitly records NO_GO for all 11 semantic reviews, all 67 privileged callable function chains, all 83 original migration semantic reviews, signed DM/P1/P2/removed/outsider QA, original fog and character-sheet repairs, QA SQL installation and production release.
- Historical source parity is strong evidence about **what was installed**, not about correct caller authorization, deployed effective RLS, permissive policy combinations, helper graph behavior or hosted signed-user acceptances.

The raw 83 original SQL files and R111 private review docket **remain exclusively in the owner's local Ubuntu WSL workspace**. Never upload them, SQL fragments, credentials, signed URLs, function body SQL, user/campaign records, or original migration paths.

## Current live original database 12-node lexical call-graph

R207 adds reproducible **SELECT-only** `scripts/release/r207_readonly_privileged_helper_graph.sql`, which reads current `pg_catalog.pg_proc` source **inside PostgreSQL only**. Only a fixed list of **known public function identifiers**, body SHA-256/byte lengths, role EXECUTE booleans, lexical helper target slot numbers and identity/membership/user-editable-metadata marker flags leave the server. The 11 R206 current fingerprints all match and the 12th is the **790-byte** `can_edit_campaign_sheet` original-current source SHA `07dd89b2aa9c2e2c4851604de83362da37b3e5bf1716d146fd769b7bb816cb53` already source-matched in the owner's R198 receipt. The 12 observed body hashes and sizes are immutable in the strict R207 source-only manifest.

| Source-level call path | What is established | What is NOT established |
|---|---|---|
| `get_campaign_account_names` → `is_campaign_member` | Direct uid and membership words, one user-editable Auth metadata word, lexical call to current-member helper; metadata word at byte-text position preceding first WHERE word | That every use of metadata is display-only, or no alternative membership bypass exists |
| `get_campaign_sheet_inventory` → `can_edit_campaign_sheet_inventory` → `can_edit_campaign_sheet` → `is_campaign_dm` | **Source-exact known 3-layer inventory getter**; internal guard and sheet-helper callable privileges; known R115 revoked owner issue #220 | That a revoked sheet owner is denied by current hosted source—the R115 candidate is still UNAPPLIED |
| `patch_campaign_sheet_noninventory` → `can_edit_campaign_sheet` | Character-sheet PATCH uses same known source-exact helper and #220 revocation gap | Signed live revocation safety |
| `get_dm_map_npc_values`, `get_npc_token_values`, `publish_map_environment` → `is_campaign_dm` | Three delegated DM-role paths and current `is_campaign_dm` references `auth.uid` and `campaign_members` | Exact cross-campaign ID binding and owner role semantics |
| `is_map_fog_published` | No direct `auth.uid`/membership or lexical callee reference; 102-byte postgres-owned SECURITY DEFINER, authenticated-callable | Already reproduced #212 fog metadata oracle remains UNAPPLIED; no full hosted replay |
| `preview_map_motion` | 110-byte SQL definer, no direct UID/membership or detected public helper call; no UPDATE/INSERT/DELETE textual word | Whether its return semantics are side-effect-free, authorization-safe, or susceptible to IDOR |

**Important distinctions:** Text matching may include comments, aliases or irrelevant functions, and misses dynamic/inherited calls. R207 **does not run** current live helpers against signed identities, export original function bodies or assert all 12 source branches safe. A metadata word **before** the first WHERE is consistent with a projection/display expression but is **not formal proof** of display-only authorization. Current `get_campaign_account_names` remains **not accused** of confirmed metadata privilege escalation.

## Separate disposable PostgreSQL17 metadata spoof regression

The R207 scratch runner uses the GitHub Actions service database on loopback `127.0.0.1` with explicit `R207_ISOLATED=yes`, a unique fake DB/password, and fail-closed rejection of hosted connection variables. It uses ONLY **invented** Auth-like account metadata, membership rows and fake role/session values:

- A current fake DM and active fake player can read campaign membership display names.
- An outsider forging the GM's display name and a fake claimed campaign membership inside **editable metadata** still cannot read.
- A current player changing their display name changes the projected name only; removing their actual membership row immediately blocks their read.
- An intentionally unsafe *fictional* OR authorization using editable metadata lets the fake outsider access a campaign name under an immediate **ROLLBACK**, after which the original fake member-only function is verified restored.

This is a representative distinction between display labels and permissions, **not** reproduction of the exact original SQL or an actual signed Supabase client.

## Release hold

Original/QA SQL untouched. No source application changes, active migration, Edge Functions, merge, deployment or paid infra. **NO_GO** remains for current original #212 fog oracle, #220 revoked sheet owner, #223 invite rejoin, #229 service-role membership TRUNCATE, #231 signed Storage bearer expiry and #306 five authenticated TRUNCATE grants; all 83 original migration **semantic** approvals, all 67 currently callable privileged authorization **semantic** call-graphs, signed DM/P1/P2/removed/outsider multi-window QA, and separate QA/production authorization. No new manual WSL action required for R207.
