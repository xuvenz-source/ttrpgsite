# R218 — Owner R217 sanitized policy findings and private chronological policy lifecycle (NO_GO)

22 November 2026. Source-only child of R217 draft PR #329 exact parent head 47593a171f4384c66e6c1f735946258395aade88. Its dedicated synthetic Storage-policy workflow 44979626710 and full staged repository workflow 44979626719 both succeeded. Neither original nor isolated QA Supabase database was changed, and no PR was merged/deployed.

## Sanitized R217 receipt — bounded, private evidence only

Owner uploaded ONLY r217-sanitized-report.json: 5,203 bytes, SHA-256 89e29ee529c8c06257608cf8ef4a3c8c2d34dac9d696a1f4344a50b82d07dd5c (digest of sanitized JSON only, NOT original SQL). It reports original 83/83 private migration SHA verification, 937 top-level lexical statements, 12 historical Storage policy statements, 10 CREATE POLICY, 2 DROP POLICY and 0 ALTER POLICY. The complete 5 R111 priority references are 2, 3, 4, 29, 50. Historical lexical markers: 10 policy statements mention authenticated, 10 bucket_id, 7 known campaign guard helper, 5 direct UID/JWT, 3 OR, 1 owner_id; 0 literal TRUE, editable user metadata, or storage operation helper detected. All 12 statements have R217's broad permissive/default word code, INCLUDING the two DROP statements, so this does **not** assert all 12 were actual permissive live policies. No semantic RLS, privilege or signed URL conclusion can be drawn.

scripts/release/r218_validate_owner_r217_receipt.py checks ONLY sanitized JSON: strict fixed keys, duplicate JSON rejection, wrong types/NaN/unknown private strings, statement/file category cross-counts, bounded R111 priority references, genuine truncation flags, exact NO_GO and no-SQL guards. It cannot approve QA installation.

## Offline private policy lifecycle preflight

scripts/release/r218_private_storage_policy_lifecycle.py runs ONLY in owner's existing Ubuntu WSL private archive. It reruns R217/R216/R215/R214/R213/R211/R154 original 83-source SHA, private-permission, timestamp chronology and NO_GO checks. Using the chronological private SQL **in local process memory only**, the script tracks CREATE/ALTER/DROP POLICY by private policy name and table for Storage targets, checking lexical duplicate CREATE before DROP, DROP/ALTER without preceding archived CREATE, re-creation after DROP, ambiguous explicit role scope, and **possible** overlaps of final archived permissive policies on the same target, operation and broad role marker. Its goal is to identify historical audit priorities that simple counts cannot distinguish.

It exports ONLY fixed numeric counts and fixed risk codes, with at most 24 numeric R111 priority references and explicit truncation. It NEVER exports original policy names, target or bucket names, SQL, function bodies, migration filenames/versions, R111 private docket, source hashes, Auth/campaign rows, JWTs, credentials or signed Storage bearer URLs. It executes no SQL, makes no network or database calls, writes no files itself, and always returns NO_GO.

**Interpretation limits:** a private source-text timeline is not a PostgreSQL parser, a real installed policy catalogue, executable migration dependency, RLS role/privilege test or authenticated user test. Managed Supabase schemas may have pre-existing policies; indirect helpers/dynamic SQL and altered policies may change effective access; quoted or unsupported statements may be unparsed. A potential permissive overlap is NOT evidence of an exploit. An apparent clean final set is NOT proof of secure RLS or revocation of previously issued signed URLs. The isolated QA project is still blank and SQL installation remains unauthorised.

CI uses invented 83-file histories only, with adversarial duplicate/drop/re-create/unknown-role/overlap cases and sanitized-only report tests, plus a strict five-file diff gate prohibiting runtime, active Supabase migrations/functions, Vercel and production changes. No paid resources.

## Manual checkpoint only after exact-head R218 CI passes

In Ubuntu WSL under umask 077, download the immutable R218 Python script pinned to the final successful commit into the owner's existing $HOME/ttrpg-history-private folder. Keep previously downloaded owner-local R154/R186/R191/R211/R213/R214/R215/R216/R217 helper scripts present. Run offline and redirect stdout to $HOME/ttrpg-history-private/r218-sanitized-report.json. Upload ONLY that JSON to chat. If it fails share only the fixed R218_PRIVATE_STORAGE_LIFECYCLE_NO_GO code, never unredacted private SQL, docket, credentials or terminal logs.

All 83 migration semantic reviews, 67 live authenticated-callable privileged function graphs, signed DM/P1/P2/removed/outsider QA and security blockers #212/#220/#223/#229/#231/#306 remain unapproved. Any future SQL installation requires a **separate explicit** owner-approved QA-only exact target, semantic source/effects, $0 resource scope, backup, rollback and signed QA plan. Production remains NO_GO.
