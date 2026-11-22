# R230 — private historical DO/anonymous PLpgSQL effect preflight (NO_GO)

Source-only child of R229 [draft PR #342](https://github.com/xuvenz-source/ttrpgsite/pull/342) at exact green baseline `3578beecc679d04c59bb9653eeef7a1b324faec0`, whose focused current 67-function catalog test and staged repo verification both passed. R229 completed **catalog inventory**, not 67-function semantic authorization or 83-migration history approval.

## Why this stage

The independently SHA-verified **83 original migrations** contain 937 lexically separated top-level statements; the R211/R215 report family counted **12 opaque top-level `DO` statements** and **22 risk-flagged migrations**. A top-level `DO` can execute data writes, manage roles, make dynamic SQL calls, or depend on live data. Basic top-level SQL/keyword checks cannot prove it is safe to replay against empty isolated QA or production. Further repeating a direct `GRANT ALL` or Storage policy-word scan would add little.

## Exact source-only deliverable

`scripts/release/r230_private_opaque_do_effects.py` runs **only on the owner's Ubuntu WSL private archive**, not in Supabase. It calls the existing R211 complete 83-source SHA/permissions/chronology and prior 937/22/12 counts. It independently checks each original file's SHA again and sorts original SQL history privately by migration timestamp (never exports timestamp). Only the 12 top-level `DO` statements are classified using **limited lexical markers**:
- `DYNAMIC_EXECUTE_WORD` — `EXECUTE` or `format(` words
- `DML_OR_TRUNCATE_WORD` — INSERT/UPDATE/DELETE/TRUNCATE words
- `DDL_POLICY_GRANT_WORD` — CREATE/ALTER/DROP/GRANT/REVOKE/POLICY
- `MANAGED_AUTH_STORAGE_WORD` — `auth.` or `storage.`
- `NETWORK_OR_NOTIFY_WORD` — network, dblink or NOTIFY helper words
- `ROLE_OR_EXTENSION_WORD` — role, user, extension, publication
- `EXCEPTION_HANDLER_WORD` — exception/raise
- `CONDITIONAL_LOOP_WORD` — conditional or loop constructs
- `DOLLAR_OR_QUOTED_DYNAMIC_WORD` — quoted block delimiters or quote helper words
- `OPAQUE_UNCLASSIFIED_WORDS` — none of these; **not a safety clearance**.

A single DO can appear in several categories. Strings and comments can match; a dynamic helper can have side effects not revealed by lexical words. It is impossible to conclude full SQL semantics, replay ordering, dependency state or effect safety from these flags. All 12 remain unreviewed for semantic QA approval. The bounded JSON contains only aggregate counts, fixed category codes, at most 24 **numeric R111 priority slots** (not chronological positions), false approval/export/execution flags and NO_GO. No source SQL, private names or versions, paths, JSON/records, live policy/body definitions, credentials or bearer URLs leave the owner computer.

The synthetic-only test generates a fabricated 83-file archive with made-up SQL and rejects source SHA drift, unexpected totals, forged historical approval, raw SQL export and unapproved state changes. GitHub CI does not read the owner's archive or access Supabase.

## Owner action after 2/2 exact-head CI SUCCESS

Only after exact-head green CI, download the script from the **final pinned commit** into the existing `$HOME/ttrpg-history-private` WSL folder. Run it **offline** with the already present private `r154_...`, `r191_...`, and `r211_...` supporting scripts and 83 original private SQLs. Upload **only** the output `r230-sanitized-report.json` to the chat. Do **not** upload the original SQLs, filenames, docket, output of verbose failures, credentials or other private material. If it fails, share only the fixed `R230_PRIVATE_DO_NO_GO` code, not logs or contents.

This operator action does not require any new QA/production resources, database access, SQL installation, OAuth or changes to GitHub PRs. A successful sanitized report still cannot approve QA schema installation. We will need owner-reviewed **exact semantics** for the 83 original migrations (including all 12 DO blocks) and privileged RPCs plus a bounded QA-only $0 install/rollback plan and signed users.

All production/QA SQL writes, merges, deployments and paid resources remain disallowed. **SECURITY NO_GO.**
