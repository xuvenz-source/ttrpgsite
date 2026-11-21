# B10-R18-211 — Owner-only private QA schema-effects preflight (preparation approved; SQL install NO_GO)

22 November 2026. Source-only child of [R210 draft PR #320](https://github.com/xuvenz-source/ttrpgsite/pull/320), exact parent head `4b39a4173e7643b9a35acdd8b398cc0d322b87b3` with dedicated QA-readiness CI `44924410782` and standard frontend/lint/build/Edge `44924410804` **2/2 SUCCESS**. The user approved **preparation of the already-provisioned isolated QA plan**, restricted to $0 resources. **This is not permission to execute SQL or install anything**, and authorizes nothing involving the original/production database, previews, runtime/Edge code, or a merge.

## Target and private source boundaries

The same original-versus-QA `pg_catalog` SELECT showed original **31 public tables / 112 public functions / migration ledger present** and existing isolated QA **0 public tables / 0 public functions / no migration ledger**. QA also had **0 Auth users, 0 Storage buckets, 0 Storage objects**, based on aggregate-only SELECT. Signed DM/P1/P2/removed-player application testing is impossible until an independently reviewed QA app schema exists. Owner-only private history had **83/83 original migration SHA and chronology verification**, plus **11/11 current prioritized live privileged/helper source body matches**, but this is *not* 83 complete migration semantic approvals, user/role permission proof or an install plan.

Never export any of the 83 historical SQL files, original migration filenames/versions, private R111 docket, function/policy SQL, asset paths, JWTs, user or campaign records, service credentials, production secrets or signed Storage bearer URLs to chat, GitHub, CI, QA, or Vercel.

## New owner-local R211 offline preflight

`scripts/release/r211_private_qa_migration_effects.py` runs **only locally inside the owner's existing Ubuntu WSL `$HOME/ttrpg-history-private` workspace**. It requires the already-present private original 83 SQLs, R111 private docket and locally downloaded R154, R186 and R191 Python readers. This script does not connect to network, database, GitHub, Supabase, storage or CLI; does not execute any SQL; does not write files itself; and catches failures without printing path, filenames, SQL or tracebacks.

Before classification, R211 re-runs the R154 original **83/83** SHA-verified, private-permission, docket and no-security-approval checks. It then independently requires a complete set of 83 timestamp-unique migration names and exact per-file SHA matches and sorts by **actual timestamp chronology** (never R111 priority order). It uses the R154 SQL statement tokenizer to isolate top-level statements without splitting at semicolons in nested comments, strings or dollar-quoted function/DO bodies. It counts known top-level categories (table/function/policy/trigger/index/view/type/schema/sequence/extension/role/publication/default-privilege/grant/revoke/DO/DML/COPY/other).

It also counts **conservative lexical risk markers** for SECURITY DEFINER, functions missing a declaration-level search_path (quoted body text cannot spoof the header), Auth/Storage references and direct writes, Storage buckets/objects, grants including PUBLIC/anon/TRUNCATE, policies with literal TRUE or OR text, role/extension/publication changes, dynamic EXECUTE, network-call words, RLS toggles, editable user metadata and unknown statement categories.

The report contains **only fixed counts, booleans, the first at most 24 numeric R111 priority-sorted docket indices of risky files (not chronological migration positions)**, a truncation indicator and NO_GO limitations. It never returns any original SQL text, historical migration filename/version/path, policy/function name or signature, project/database URL, asset filename or secret. The R111 review indices are merely *private references* so the owner can locate originals locally without sharing them.

This is **lexical triage, not complete SQL parsing or executable dependency analysis**. In particular, dynamic SQL/PLpgSQL/DO bodies, default role privileges, extensions, triggers, existing managed schemas and external effects can cause changes not captured by simple keywords. Neither 0 flagged markers nor all 83 matching SHA files would justify running the archive against QA. Any unsupported syntax, source checksum mismatch, invalid chronology or missing private file fails closed. The output decision is always **NO_GO**.

## CI safety and scope

GitHub CI uses **fabricated, synthetic 83-file archives only**, never the real original SQL or private docket. Tests cover the full private-source hash/chronology gate, category counts, dynamic DO/quoted statements, extension, GRANT TRUNCATE, Auth writes, Storage policy words, unclosed bodies, changed SHA, duplicate names and the rule that quoted SECURITY DEFINER body text cannot impersonate a declaration-level `SET search_path`. A separate immutable source-only gate checks exact source Git blob hashes and fails if QA SQL, original SQL, deploy approval or private report received is forged.

No original/QA SQL modifications, Auth/Storage writes, frontend/Edge/active migration edits, PR merges, production preview deployment or paid resources. The Supabase CLI v3 released November 2026 **changed project targeting**: remote commands now explicitly use `--remote` and hosted changes require confirmation. See [Supabase's official migration guide](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3). **No CLI database command is executed here**; any future approved installation must first check `supabase --version`, the exact command's `--help`, project target, approved backup and rollback method—never guess defaults or blindly `db push`.

## Next manual checkpoint only after exact-head CI

Run the reviewed R211 offline script from an exact commit into the existing owner-private WSL folder under `umask 077`, redirecting JSON into `r211-sanitized-report.json`. Upload **ONLY** that sanitized JSON to this conversation. Do not upload the private docket, 83 original SQL files, original filenames/paths/versions, unredacted logs, connection strings or credentials. If the script refuses execution, report only its fixed R211 error code, not SQL or file details.

After that receipt, we will determine the **specific remaining private semantic review** and prepare a dependency-complete QA-only schema/rollback design. Even that is **not** automatic installation authorization. A further separate, explicit owner approval for an exact QA-only SQL-write window will be required. There is no implied production authorization.

Security remains **NO_GO** for original #212 fog-status, #220 removed sheet owner, #223 invite reuse, #229 privileged membership TRUNCATE, #231 Storage bearer URLs and #306 authenticated TRUNCATE, all 67 callable privileged authorization graphs, all 83 migration semantic effects and signed DM/P1/P2/removed/outsider QA.
