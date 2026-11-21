# B10-R18-189 — SHA-backed historical versus live metadata-function body, NO_GO

**21 November 2026.** Exact child of R188 [draft PR #297](https://github.com/xuvenz-source/ttrpgsite/pull/297), SHA `60803e1036d7bab3154cc4966c098a7e8a0963ca`. No original/QA writes, app/runtime changes, migrations, merge, deploy or paid resources.

## What was independently observed

The private R188 sanitized JSON (1,546 bytes; SHA-256 `bf8bbf90452a50ed7c4d20ac5d53e8fc7b21a2532931649405cf161a55aa9313`) confirmed the historical target in **R111 priority docket position 31 (NOT chronological migration 31), executable SQL statement 1** contains exactly **two** user-editable metadata tokens in unquoted SQL code, zero in literal strings or comments. It also has direct `auth.uid()`, `auth.users`, and `campaign_members` markers, but these tokens alone cannot establish authorized data flow.

Separate **read-only** original Supabase `pg_catalog` inspection (query returns only fixed count/boolean/hash fields, no function names or source text) confirms 85 current public SECURITY DEFINER functions, including 67 authenticated-callable. Exactly one current public SECURITY DEFINER definition contains a metadata token; it has two metadata token occurrences, authenticated EXECUTE, no anonymous EXECUTE, postgres ownership, configured empty search_path, direct uid/Auth user/campaign-members token matches, and SQL-language source-text body of **378 bytes**.

The current original database `pg_proc.prosrc` byte SHA-256 for that one candidate is `bd98b2ec061445b828724d0830f1da245b845a3e9c83fcf7c1a17bd34343c9a6`. This is a fingerprint only, not a copied source body or a claim about user-record contents.

## Why an additional offline gate is necessary

R188's source checks identified metadata in actual SQL, but did **not** establish whether the original historical body and currently installed body are byte-identical. R189 reads the already-SHA-pinned private R111/R106 source file, re-executes R154/R186/R187/R188 integrity guards, extracts only the single historical SQL-language `AS $tag$ ... $tag$` function body locally, hashes it, and compares its digest and UTF-8 byte length against the previously observed **one** current candidate. It prints only fixed booleans and counts. If the source is unsupported/malformed or private hashes have drifted, it rejects the run; a legitimate fingerprint mismatch produces `NO_GO` with both comparison booleans false.

Even **identical body bytes** would not independently prove signature identity, owner/ACL changes, effective RLS, called helper behavior, or whether metadata participates in authorization. No test user or real campaign data is accessed. Use the result to decide whether a source-equivalent local PostgreSQL model and actual independent signed QA are needed; never merge/repair from this observation alone.

## Manual WSL gate, after 2/2 exact-head CI

Download only the exact **commit-SHA-pinned R189 Python script** into the existing private `$HOME/ttrpg-history-private` WSL directory containing earlier R154/R186/R187/R188 files. Run it offline with `umask 077`, redirect stdout to `r189-sanitized-report.json` and upload **only** that JSON. Do not upload raw SQL, private docket, function source/name/signature, Auth secrets or verbose console output.

## Security barriers

Unfixed hosted defects and acceptance gates remain #212 (fog metadata oracle, historical review), #220 (removed character owner), #223 (invitation reuse), #229 (privileged membership TRUNCATE) and #231 (signed Storage bearer lifetime/reissuance). All 83 historical migration semantics, all 67 live privileged RPC authorization call chains, signed DM/P1/P2/revoked/outsider QA, signed media URL revocation and separate owner production approval remain **NO_GO**.
