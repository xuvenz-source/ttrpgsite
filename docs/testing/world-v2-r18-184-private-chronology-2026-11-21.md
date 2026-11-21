# B10-R18-184 — Offline private migration chronology parity handoff

21 November 2026. Exact child of R18-183 draft [PR #292](https://github.com/xuvenz-source/ttrpgsite/pull/292) commit `e30aeed072fba007ff8df1587964e9d5401c1088`. **NO_GO.**

This step adds a read-only, **offline** Python audit that executes only on the owner's existing private `~/ttrpg-history-private` migration recovery directory. It calls the unchanged R154 auditor to verify all 83 SHA256 hashes against the private R111 docket, checks the two exact predecessor RPC definitions and the DO rewrite in the chronological recovery files, and checks the later monitor replacement. It also counts top-level executable SQL and DO blocks.

No SQL, filenames, paths, secrets, arbitrary SQL identifiers or raw migration text are printed. The report contains only approved booleans, bounded counts and NO_GO fields. The test suite uses fictional text, never reads the user's private archive and requires no Supabase credentials.

The original live database was inspected read-only in R181–R183. The user-local archive is the **second independent source copy**, and matching the two would increase confidence before any QA bootstrap. A local manual run is necessary because the AI GitHub runner cannot access the owner's private filesystem. **Do not attach the original 83 SQL files, the private docket, credentials or console logs. Only attach the generated sanitized JSON.**

A source-only tested script does **not** approve historical semantics, all 67 privileged functions, signed QA, hosted migration installs, old signed URL revocation or production. Nothing in original or QA Supabase changes until a separate owner-authorized, reviewed release step.
