# B10-R18-198 — Private historical character-sheet authorization lineage and existing R115 repair (NO_GO)

21 November 2026. Exact source-only child of R197 [draft PR #307](https://github.com/xuvenz-source/ttrpgsite/pull/307), pinned SHA `0663a3f37e54078cb0b1e9b3ab97612255e872dc`, 2/2 successful exact-head CI (R197 isolated PG17 `44903245453`, standard frontend/build/security/Edge `44903245401`). No hosted QA/original SQL, production runtime, active migration, merge, deployment or paid resources.

## Confirmed revocation gap, existing reviewed candidate

[Issue #220](https://github.com/xuvenz-source/ttrpgsite/issues/220) and original [R115 draft PR #219](https://github.com/xuvenz-source/ttrpgsite/pull/219) already source-matched the original current `public.can_edit_campaign_sheet` helper. Its *character owner* branch does not require that `auth.uid()` still belongs to the requested `campaign_members`. In isolated PostgreSQL17 using exact source-matched live SQL functions and **fabricated** actors/rows, a removed owner retained inventory claim, GET and PATCH privileges. Original R115 **UNAPPLIED** single-check candidate closes those revoked-owner operations in scratch while preserving DM authority, own stale lease release and legitimate rejoin. It also passed 23 original lease authorization scenarios; this was not real signed Supabase Auth QA. Restoring the original code would reinstate the defect.

## Fresh live source identity, no private SQL export

A new original Supabase **read-only** `pg_catalog.pg_proc` query returned only public known RPC names, SHA/MD5 body hashes, byte lengths, owner/ACL/empty search_path booleans (no SQL contents, signatures or user data):

| Current known RPC | Stored SQL body | Authenticated EXECUTE |
|---|---:|---|
| `can_edit_campaign_sheet` | **790 bytes**, SHA-256 `07dd89b2aa9c2e2c4851604de83362da37b3e5bf1716d146fd769b7bb816cb53` | No (internal helper) |
| `claim_campaign_sheet_item` | **1,379 bytes**, SHA-256 `7c7916294b992927098b797e83406eaf6113920231bd22cbb7c8f53e0c4cbf44` | Yes |
| `mutate_campaign_sheet_item` | **2,752 bytes**, SHA-256 `8d749e88cd95ab6dd14f781d80bfa114f28396a5ebcd2c1f84b64b38b1f7d5fa` | Yes |
| `release_campaign_sheet_item` | **271 bytes**, SHA-256 `e31447390c4a34dac06f1c6a6beaedb33ec9c730f02933e6129c43a54fe2fe22` | Yes |

All four are **one overload**, postgres-owned SECURITY DEFINER, configured empty search_path; anonymous EXECUTE denied. The 790-byte helper has direct `auth.uid()`, DM helper, character owner/NPC branch markers, **no direct `campaign_members` word**. No direct membership lexical marker is evidence of the missing local guard, not by itself a complete authorization proof or a successful real hosted exploit.

R198 pins the **unchanged original R115 candidate SQL**, the exact R115/114 source extractor, runner and candidate/baseline SQL test files by immutable Git blob SHA-1. It replays the **existing, source-exact synthetic PG17** R114/R115 regression on this new exact branch head, keeping original SQL functions extracted from publicly tracked Git migration sources and executed only in disposable PG17. It does **not** copy the operator's private original 83 migration bodies to CI or GitHub.

## New owner's private chronological check

`scripts/release/r198_private_sheet_auth_lineage.py` is a read-only offline WSL helper. It reruns R193's full R154 83-file SHA review and independently rechecks historical `join_campaign` and `create_campaign` body parity (the owner supplied the sanitized R193 receipt). It then scans **direct top-level** historical `CREATE FUNCTION` declarations for the single sheet authorization helper, validates all 83 original timestamp-ordered migration filenames and each source hash, identifies the latest direct version, and compares only its inner PL/pgSQL body SHA-256 and byte length to the current live 790-byte fingerprint.

The report prints **only fixed numeric/boolean fields**, R111 **priority docket index (NOT chronological migration number)** and executable statement ordinal. It never prints private original SQL, function names or signatures, original migration filenames/paths, user/campaign records, credentials or invite codes. A source mismatch returns NO_GO; source-tampering, a broken original chronological proof or an invalid R193 parity guard fails closed. No network or database access occurs from the script.

Even a matching body **does not** establish effective grants/ownership/RLS, downstream helper call paths or safe removed-player semantics. The old R115 source-exact signed-actor simulation is still not a real QA test.

## Release hold points

- All 83 private historical migration semantic audits and 67 live authenticated-executable privileged authorization call chains remain **NO_GO**.
- Hosted DM, assigned Player 1, passive Player 2, removed/revoked owner, outsider and cross-campaign signed Auth QA (including GET/PATCH/claim/mutate/release/Realtime/Storage) remains **NOT RUN**.
- Issues #220 (revoked sheet), #218 (inventory UUID), #212 (fog), #223 (invite reuse), #229 (privileged membership TRUNCATE), #231 (signed Storage bearer) and new #306 (ordinary authenticated TRUNCATE grants) remain open. No safe original/QA migration replay or owner-authorized production release.
- The source-only branch adds **no versioned migration**, runtime or Edge code, hosted data access, paid resource, merge or deployment. The R115 candidate is **UNAPPLIED**; do not restore the unsafe historical original as rollback.

**Owner-only manual checkpoint after successful exact-head CI:** keep the existing private `$HOME/ttrpg-history-private` WSL workspace (R154/R186/R191/R193 Python files plus R111 docket/R106 83 source files), download R198 Python at its exact commit SHA, run offline under `umask 077` and upload **only** `r198-sanitized-report.json`. Never upload raw SQL, docket, migration filenames, user data, keys or verbose logs.
