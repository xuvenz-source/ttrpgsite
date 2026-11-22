# R216 — Owner R215 sanitized result and offline Storage policy/direct-DML review (NO_GO)

22 November 2026. Source-only child of R215 draft PR #327 at exact head 84574a63c0b23a654a3996b289d6b58652be9e28, with R215 focused synthetic test workflow 44974911520 and general staged repository verification 44974911523 both SUCCESS. No merge or deployment.

## Owner receipt (sanitized JSON only)

The owner sent only r215-sanitized-report.json (5,197 bytes; SHA-256 dd459c05b1d22c80fe63adada5aa89250d86cb41efbf7e1b5c5acd8806cdf55f, hash of sanitized report, NOT of SQL). It reports 83/83 historical private migration SHA rechecks and 937 previously classified top-level statements. There are 22 flagged original migration R111 priority references, all present without truncation. Per-statement lexical markers: 3 direct top-level Storage DML, 12 Storage policies, 12 opaque DO, 4 publication changes, 16 managed-schema DDL word markers, 1 extension/role change and zero direct top-level Auth DML, managed-schema GRANT/REVOKE, or recognized dynamic function EXECUTE markers. Per-file code totals differ because multiple statements can occur in a single migration and risk categories overlap.

No historical SQL, filename/version, private docket, Auth/campaign rows, signed URLs, passwords or service role keys have been exported. A zero direct Auth-write count does NOT establish absence of Auth writes within functions, DO, triggers or dynamic SQL. The 61 non-flagged files also remain semantically unapproved.

scripts/release/r216_validate_owner_r215_receipt.py validates only this sanitized fixed-shape JSON. It rejects extra/private content, altered NO_GO guards, duplicate keys, non-integer/floating/NaN counts, inconsistent statement/file counts, unbounded review positions, duplicate/misordered R111 priority references and mismatched risk categories. Output is a restricted numeric NO_GO summary only, no SQL or network/database access.

## Owner-private Storage scope triage

scripts/release/r216_private_storage_effect_words.py runs only on the owner's existing private Ubuntu WSL migration archive. It reruns the entire R215/R214/R213/R211/R154 source SHA, restricted-permission, 83 unique chronology and NO_GO gates. It searches all original 83 top-level statements offline, splitting existing R215 direct Storage DML markers into INSERT / UPDATE / DELETE / TRUNCATE and limited WHERE / ON CONFLICT lexical indicators, plus fixed Storage objects/buckets/other target categories. It separately groups policies on Storage targets into SELECT / INSERT / UPDATE / DELETE / ALL/unspecified and whether the statement includes USING, WITH CHECK, direct auth.uid()/auth.jwt() or editable user_metadata words. It reports only predefined category counts and at most 24 numeric R111 priority references with risk-code labels (and explicit truncation). The exact original SQL, table/bucket/policy names and migration filenames stay private. No SQL is executed and no files, Supabase projects or network services are changed.

The heuristics deliberately do NOT judge whether missing WITH CHECK on a SELECT policy is a vulnerability, nor does presence of auth.uid() prove policy correctness. They do NOT evaluate permissive policy OR composition, inherited grants, helper functions, transitive dependencies, signed URL revocation, existing Storage buckets/objects, dynamic SQL or PostgreSQL execution effects. Neither this report nor a zero marker permits any QA installation.

GitHub Actions tests an entirely fictional 83-file archive, and a fabricated sanitized report. It checks source-only diff scope; targeted Storage DML/policy counters; redaction; hash drift; forged approvals, duplicate JSON fields and malformed counts; and leaves frontend, active Supabase SQL/Edge, Vercel settings, infrastructure and production unchanged.

## Manual checkpoint after exact-head CI only

Owner downloads the commit-pinned R216 owner-local script into the existing $HOME/ttrpg-history-private Ubuntu WSL workspace under umask 077 and executes it there. It depends on the already downloaded R154/R186/R191/R211/R213/R214/R215 private helper modules. Save stdout to $HOME/ttrpg-history-private/r216-sanitized-report.json; upload ONLY that JSON to chat. If the script refuses, provide only its fixed R216_PRIVATE_STORAGE_WORDS_NO_GO code, never source SQL, original filename/versions, R111 docket, credential, user data or unredacted logs. Do not execute migration SQL.

Existing QA and original Supabase databases remain unchanged; all 83 private migration semantics and all 67 live privileged caller graphs, issues #212/#220/#223/#229/#231/#306, signed DM/P1/P2/removed/outsider QA and production release remain NO_GO. Future QA-only SQL installation requires separate explicit owner approval of an exact target, reviewed SQL effect plan, $0 resource scope, backup and rollback. General 'proceed' is not installation consent.
