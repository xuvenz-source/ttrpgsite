# B10-R18-191 — owner-private fog-publication RPC historical source lineage (NO_GO)

21 November 2026. Exact-parent source-only child of R190 [draft PR #299](https://github.com/xuvenz-source/ttrpgsite/pull/299), SHA `657269ca610dcd9a951c2644cbe5f2fecf69160d`, whose dedicated and repository-wide workflows both succeeded. The R190 aggregate-only live catalog inspection was read-only, with no user data or function source exported.

## Why this is now the highest-priority private source question

There are 85 currently installed `public` SECURITY DEFINER functions, with 67 callable by authenticated and **seven** without direct `auth.uid`/`auth.jwt` source markers. A specific live fog publication status RPC, `is_map_fog_published`, has exactly **one** public authenticated-callable, anonymous-noncallable overload returning boolean. Read-only PostgreSQL catalog metadata confirms that its source is a **102-byte SQL-language function**, owned by `postgres` and configured with an empty local `search_path`. Its stored body `pg_proc.prosrc` SHA-256 is `767cbcd8bd4813c0a535fa71bf1ecc3a9cf8a6dd02c239499c0be1737a28c96f`. None of the direct `auth.uid`/`auth.jwt`, `campaign_members` or `can_view_campaign_map` lexical markers appear in the captured live definition. That is a **risk requiring full source and signed authorization review**, not proof of exploitation or a final call graph.

Historical private SQL is available *only* on the owner's Ubuntu WSL workspace. We have not downloaded or published it, and a R111 docket index is a **priority-sorted review index, NOT migration chronology**. Thus, the next meaningful verification is private source lineage against the live function body, not another generic marker count.

## R191 workflow

The owner-local, read-only `scripts/release/r191_private_fog_status_lineage.py` calls unchanged R154's SHA-pinning 83-file audit and rechecks source SHA-256 on each private read. It scans **direct top-level** `CREATE [OR REPLACE] FUNCTION` statements for the one known fog-status RPC (including quoted or schema-qualified spellings), identifies directly declared `SECURITY DEFINER` and SQL-language/dollar-quoted bodies, calculates private body SHA-256 and byte length, and compares them against the previously observed live source fingerprint. It does not execute SQL or connect to Supabase.

For final-source ordering it **requires all 83 filename versions to contain unique valid 14-digit Supabase migration timestamps**. Without that, the report does not identify a latest chronological source candidate. It reports only counts, booleans, latest *numeric R111 docket index* and SQL statement ordinal, **never private migration names, SQL, function names/signatures, paths, user records or secrets**. A hash failure is a hard error. Unsupported source forms and a legitimate body mismatch are retained as release NO_GO findings.

This review explicitly cannot detect dynamic SQL hidden inside DO blocks, prove signature/argument equivalence or show installed ACL/grants/RLS composition. Even an exact historical/current source-body match **does not establish safe fog access**. A DM/Player 1/Player 2/removed/outsider signed test of the current RPC and real effective membership/campaign scope remains necessary.

## Release and operator safety

The original project, separate QA schema and production remain untouched. No original migration, source patch, generated SQL, repair, merge, Vercel deployment or paid service is authorized. Existing issues #212 (fog status), #220 (removed sheet owner), #223 (invite reuse), #229 (privileged TRUNCATE), #231 (signed Storage bearer) and all 83/67/real-signed-QA acceptance remain **NO_GO**.

**Manual checkpoint after exact-head CI:** The owner runs the *commit SHA pinned* R191 Python file in the existing `$HOME/ttrpg-history-private` WSL directory with R154 and R186 already there, using `umask 077`, writes only `r191-sanitized-report.json`, and uploads **only this JSON**. Do not upload source SQL, private docket, file lists or credentials.
