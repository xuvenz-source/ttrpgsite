# B10-R18-200 — Historical Storage object-policy events and current map helper identity (NO_GO)

21 November 2026. Direct child of R199 [draft PR #309](https://github.com/xuvenz-source/ttrpgsite/pull/309), exact source head `04df56b8d3a3005449dc51664af0c0a35d9142f0`. R199 focused actual signed-asset store and R123 teardown regressions **SUCCESS** `44904614303`, normal repository unit/lint/dependency/build/Edge checks **SUCCESS** `44904614304`. Both hosted original and QA projects unchanged, no merges/deployments/paid resources.

## Verified owner-private and original read-only context

The owner-supplied **only** `r198-sanitized-report.json` (1,734 bytes, SHA-256 `9688c8aedb036f2d393cacb31a9f1852371a732bbe6f8569e8a820fbb6ce78cc`). It reverified original 83/83 migration SHA files and chronology, R193 join/create and the single historical `can_edit_campaign_sheet` definer function, at R111 **priority-sorted docket index 49, SQL statement 7**. Its historical source matches the current live 790-byte helper. This is **not authorization approval**; the existing R115 scratch guard remains unapplied and issue #220 open.

R199 original PostgreSQL **SELECT-only** Storage aggregates returned **3 private, 0 public buckets**, `storage.objects` RLS enabled, **8 total policies**, of which **three SELECT-applicable, all permissive, zero restrictive**. Among SELECT policies, two have direct `auth.uid` markers, one a map visibility helper marker, three bucket markers and **zero direct campaign-members marker**. All policy expressions were kept within PostgreSQL and only counts were returned. Lexical presence/absence is not semantic authorization proof. We must not assert that OR-composed read policies enforce current campaign membership.

A further original **read-only** helper source query (stored as `scripts/release/r200_readonly_map_helper_catalog.sql`) found exactly one current public `can_view_campaign_map`, **SQL-language SECURITY DEFINER, postgres-owned, authenticated-executable, anon-denied, configured empty search_path**. Its `pg_proc.prosrc` is **448 UTF-8 bytes**, SHA-256 `835829ca8012fe26ae5d224df749a1a8cde958136c322d10f3d3fa91a5f3f83c`. Direct `auth.uid()`, `campaign_members` and `campaign_player_maps` text markers are present; no user-editable Auth metadata marker. This is encouraging for **that one helper** but cannot prove the safety of the other two permissive Storage read-policy alternatives.

## One owner-private offline audit, not one upload per policy

`scripts/release/r200_private_storage_policy_lineage.py` imports the already available owner-private R154, R186, R191, R193 and R198 scripts from the existing Ubuntu WSL workspace. It first reruns the full R198 83-file SHA checks and latest historical helper body hash; only if these pass will it scan every original historical migration again (on local WSL only). It:

- Identifies direct top-level historical definitions of the known `can_view_campaign_map` helper, extracts **SQL-language dollar-quoted body** only inside WSL, compares SHA-256 and UTF-8 byte size against the independently observed current live 448-byte fingerprint.
- Counts every **direct top-level original** `CREATE POLICY`, `ALTER POLICY`, and `DROP POLICY` **ON storage.objects**, including supported quoted identifiers, with counts of `FOR SELECT`, `AS RESTRICTIVE`, `TO authenticated`, `auth.uid`, `campaign_members`, map helper, `bucket_id` and user-editable metadata word markers.
- Records a bounded count of DO-block text mentioning policy DDL; this **does not parse or execute dynamic SQL** and cannot claim complete policy evolution.
- Validates all original 83 migration timestamp versions are unique, chronologically sorts source events and emits at most numeric **R111 priority docket index (NOT chronological migration index)** and top-level SQL statement ordinal for the latest helper and policy-change event.
- **Never emits historical SQL, source policy names, function signatures/names, private migration filenames/paths, bucket names, object paths, signed URLs, credentials, user data, JWTs or secrets.** No network or database connection. Abort on private source SHA or structural drift; return `NO_GO` regardless of counts/matches.

This is **historical source-lineage research only**: a historical `CREATE POLICY` count is **not** the effective installed policy list, because later ALTER/DROP, dynamic SQL, defaults, future migrations, pg_catalog normalization and runtime changes can differ. The current effective `storage.objects` policy expression identities, current permission reachability and real revoked-actor signing behavior **remain unverified**. The report must not be used to authorize a database install.

## Synthetic tests and release guards

A new fictional 83-file test archive checks previous R193/R198 source parity, policy DDL detection including `"storage"."objects"`, SELECT/RESTRICTIVE/authenticated/bucket/member/map-helper word-marker counts, direct CREATE/ALTER/DROP counts, dynamic DO word marker, chronological docket indices, current map helper SHA match/mismatch, corrupt source SHA rejection, invalid timestamp rejection and **zero original SQL/policy name disclosure**. GitHub CI runs the synthetic Python tests only; **the real original historical SQL never enters GitHub**.

Original source still uses one-hour `createSignedUrl(path,3600)` bearer links, with 54-minute client cache. R199 reconfirmed that client `clear()` with mounted subscribers re-signs, while explicit `get()` after clear may still request a URL; server must deny issuance to removed actors. [Supabase official Storage serving guide](https://supabase.com/docs/guides/storage/serving/downloads) states already issued signed URLs use a key independent from Auth JWT rotation and survive until expiry; contact Supabase support to revoke existing links. No shortened TTL or changed source is proposed here.

## Hard release boundaries

The owner has no independently configured membership-clearing scripts to their knowledge, but external system integration paths have not been exhaustively certified. No raw original or QA SQL, live signed Storage tokens, runtime UI, active migrations, merges, deployments or paid resources. **NO_GO** remains for real signed DM/Player 1/Player 2/removed/outsider QA, Storage per-policy boolean OR semantics, all 83 original migration semantic reviews, all 67 privileged authenticated-callable function call chains, audited existing bearer handling, and unresolved issues #231, #220, #223, #229, #306 and #212.

**After exact-head CI:** manual owner-local WSL operation is required. Download the SHA-pinned R200 private Python into `$HOME/ttrpg-history-private`, run `umask 077` and write only `r200-sanitized-report.json`. Share **only that report** here, not SQL, docket, file names or logs. Stop if it fails closed. No hosted action authorized.
