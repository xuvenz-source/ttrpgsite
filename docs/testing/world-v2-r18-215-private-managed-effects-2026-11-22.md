# R215 — R214 receipt verification and owner-private managed schema effects triage (NO_GO)

22 November 2026. Source-only child of R214 draft PR #326 at final parent commit dfaadf13cb74c6049808eb200e1f347b6be31fc3. The exact parent committed code passed both the focused fake-source CI workflow 44973399607 and full staged repository workflow 44973399638. No PR merge, hosted SQL or deployment occurred.

## Owner R214 sanitized-only result

The owner's R214 report is 1,849 bytes, SHA-256 ad9f7ea2a4bf19aa7af1de3e0e4518a07ef87dd605b1c9033cce2ab66317433f (hash of sanitized JSON, **not** original SQL). The R215 strict validator accepts this report: 83/83 original private migration SHA rechecks, 937 lexical top-level statements, 367 recognisable structural table-targeting statements, 31 explicit public table creates, 280 explicit public table references, 56 explicitly non-public table targets, 0 unqualified or unparsed target forms, 0 public target without an earlier lexical CREATE and 0 flagged R111 table-order review files. This is **only** the R214 limited structural order check, not proof of executable dependencies, effective RLS, signed QA or safe migration installation.

The new scripts/release/r215_validate_owner_r214_receipt.py takes only a bounded sanitized R214 JSON, rejects extra fields and duplicate JSON keys, false approvals, changed limitations, non-integer/floating/NaN numbers, inconsistent aggregate category sums, invalid numeric priority IDs or inconsistent truncation. It emits fixed NO_GO-only aggregate fields; no private source.

## New owner-private targeted effect queue

scripts/release/r215_private_managed_effect_scope.py, owner **Ubuntu WSL only**, re-runs the complete unchanged R214/R213/R211/R154 private SHA, chronology, permissions and no-approval checks against 83 archived historical original SQL files, then groups textual statements into nine fixed risk codes: direct Auth DML; direct Storage DML; Storage policy target; managed-schema DDL word marker; managed-schema GRANT/REVOKE marker; extension/role change; publication change; opaque top-level DO; and dynamic EXECUTE word within function definitions.

The report contains only fixed code names and numeric statement/file counts, with at most 24 sorted numeric R111 priority docket references (and explicit truncation), always NO_GO. **No original SQL body, function signature, table/policy name, migration name or version, private docket contents, original file path, source hash, Auth/campaign data, JWT, credential or Storage bearer URL leaves the owner's private computer.** The script makes no network/database calls and executes no SQL; it writes no files itself. On failure stderr contains only a fixed error.

Distinguishing direct top-level managed-schema writes from opaque DO/function effects is useful for *triage*, not semantic approval: function/trigger bodies, dynamic SQL, authorization helpers, RLS, managed Supabase schemas and grants require private source inspection. Even a zero managed-DML count **does not exclude** indirect writes. All 83 historical migrations and all 67 live authenticated-callable privileged function chains remain unapproved.

GitHub CI uses an entirely fictional 83-file migration archive and sanitized mock reports to test direct storage/auth SQL markers, policy/grant/extension/publication/DO markers, source SHA tampering, statement count reconciliation, bounded output secrecy, forged approval flags, duplicate JSON keys, and strict five-path source-only scope. No real private source is in GitHub or CI. There are no app frontend, live migrations, Edge, Vercel, paid resource, original/QA SQL, PR merge or deployment changes.

## Next owner manual checkpoint after exact-head CI

Download the reviewed commit-pinned R215 offline script to the existing $HOME/ttrpg-history-private Ubuntu WSL folder under umask 077 and run it locally. It uses the R154/R186/R191/R211/R213/R214 Python source readers already downloaded during earlier owner checks; it installs no packages, services or databases. Upload **only** r215-sanitized-report.json into chat, never the original 83 migrations, private R111 docket, migration filenames/versions, function/policy SQL, connection strings, Auth/campaign rows or unredacted logs. If the script fails, send only R215_PRIVATE_MANAGED_EFFECT_NO_GO.

Future installation of any historical SQL into the isolated QA database requires an **independent, exact, owner-approved QA-only SQL write and backup/rollback plan**, following complete private semantic review and verification of 0-dollar resource limits. General approval to proceed is not SQL installation approval. Original production and issue blockers #212/#220/#223/#229/#231/#306, privileged function graphs, signed DM/P1/P2/removed/outsider QA and all 83 migration semantics remain security NO_GO.
