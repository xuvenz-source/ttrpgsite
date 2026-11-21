# B10-R18-212 — Effective PostgreSQL ACLs versus owner-private migration word markers (NO_GO)

22 November 2026. Source-only child of [R211 draft PR #321](https://github.com/xuvenz-source/ttrpgsite/pull/321), exact parent commit `eafc1a42a44a95642303ec5b018833f69f29fc1d`, dedicated 83-invented-file tests `44927400163` and standard staged app check `44927400138` both **SUCCESS**. User approved QA **preparation only**, not SQL installation.

## R211 owner-local sanitized preflight receipt accepted

Only `r211-sanitized-report.json` was uploaded. Strict duplicate-key/exact-22-field schema, scalar types, sums, range, private safety and NO_GO checks passed on **3,342 bytes**, SHA-256 **`d718a19fab36778a3360a4ee9f514a9e728c8d2772d4f31e4704d02e1eea03f3`**. The owner-local script reverified **83/83** private original migration SHA+unique timestamp order, counted **937** top-level SQL statements with **0** other/unclassified statements, and flagged **22** original migration files (22 numeric R111 priority docket indices, **not migration chronology**, all available without truncation). Top-level historical counts include 231 CREATE FUNCTION, 104 CREATE POLICY, 13 ALTER POLICY, 23 DROP POLICY, 49 CREATE TRIGGER, 17 DROP TRIGGER, 12 DO, 1 extension change, 4 publication changes, 111 GRANT, 190 REVOKE and 4 UPDATE. **These are classification counters**, not executable dependency or authorization proofs. R211 also records 182 SECURITY DEFINER declaration word markers, 133 EXECUTE word markers, 1 dynamic-format EXECUTE marker, 45 RLS toggle word markers and 3 Storage write word markers; all can include content in SQL bodies and do not prove operations actually happen.

**Important newly demonstrated gap:** The owner-private R211 report contains **0 lexical `grant_truncate_word` markers**, but **5 current original public tables** grant effective `TRUNCATE` to the `authenticated` Postgres role. This is not contradictory: a broad `GRANT ALL [PRIVILEGES]` or different grant configuration can establish `TRUNCATE` without the literal two-word `GRANT TRUNCATE` text. RLS does not make `TRUNCATE` row-scoped. The open original authenticated TRUNCATE blocker #306 therefore **persists** despite a zero historical lexical count.

## Reproducible SELECT-only effective privilege surface

The **identical immutable `pg_catalog` read-only SQL** `scripts/release/r212_readonly_qa_effective_permission_surface.sql` was run independently on original and already-existing separate isolated QA Supabase. Only aggregate counts leave the server—**no original/private migration SQL, function source, role/policy/table names, R111 docket, user/campaign rows, Auth identifiers, credentials, bucket/object paths or bearer URLs**.

| Metric | Original installed | Existing isolated QA |
|---|---:|---:|
| Public tables | 31 | 0 |
| Public tables with RLS enabled | **31** | 0 |
| Public policies, all permissive | **77** | 0 |
| Public functions | 112 | 0 |
| Privileged SECURITY DEFINER functions | 85 | 0 |
| Authenticated-callable privileged functions | 67 | 0 |
| Anonymous-callable privileged functions | 0 | 0 |
| Authenticated SELECT / INSERT / UPDATE / DELETE grants (table counts) | 29 / 20 / 20 / 18 | 0 |
| Authenticated **TRUNCATE** grants (table counts) | **5** | 0 |
| Storage objects policies, all permissive | **8** | 0 |
| Non-internal public triggers | 45 | 0 |
| Installed extension count | 5 | 5 |
| Publication relation count | 18 | 0 |

The same count of five installed extensions on both projects **does not** prove the same extension names, versions or privileges. Neither 31/31 RLS enablement nor 77 permissive policy count proves effective role-safe authorization: permissive policy rules combine through OR, and SECURITY DEFINER may bypass RLS. QA's blank app schema cannot support meaningful signed-app QA until separately approved, reviewed installation.

## Isolated PostgreSQL17 negative test

GitHub Actions uses a disposable loopback-only PostgreSQL17 service with **fabricated** table rows, Postgres role `authenticated` and zero RLS SELECT policies. The synthetic baseline grants `GRANT ALL PRIVILEGES` rather than a literal `GRANT TRUNCATE` and verifies `has_table_privilege(...,'TRUNCATE')` is true; RLS hides the fabricated row but the role can still `TRUNCATE` within a transaction. The test **immediately ROLLBACKs** the unsafe action and verifies the row restored. A synthetic corrective `REVOKE TRUNCATE` blocks future table TRUNCATE while preserving SELECT; a denied attempted truncate cannot change the fake row. This is **not** an installed original/QA repair, nor does it reveal any of the five affected table names.

The workflow fails closed unless `GITHUB_ACTIONS=true`, `R212_ISOLATED=yes`, `PGHOST=127.0.0.1`, expected disposable scratch DB/password and PostgreSQL17 are active; hosted connection variables are rejected. The Python source-only validator SHA-pins the exact original/QA current aggregate ACL counts, R211 owner-sanitized receipt hash, read-only SQL query and fictional PG runner, and refuses claims of QA installation, privileged-callgraph/83 SQL review completion or production release.

## Next review gate

**No manual WSL action is required for R212.** The next step is to build a much narrower **owner-private review of the 22 R211 risk-flagged file indices**, especially dynamically executed `DO`, extension/publication changes, Auth/Storage side effects, RLS policy grants, and effective (not textual) `TRUNCATE` privilege. Any future report must contain only fixed numeric codes/counts (no private filename, migration timestamp, source SQL or identifier); risk markers do not substitute for private semantic review and a dependency-complete schema install plan.

**Security remains NO_GO:** #212 fog status, #220 revoked sheet owner, #223 invite, #229 membership TRUNCATE, #231 signed Storage bearer, #306 authenticated TRUNCATE; 67 callable privileged function semantic reviews, 83 original SQL migration semantic reviews, real signed DM/P1/P2/removed/outsider tests. QA SQL installation, original/production SQL, merge/deploy and paid resources remain prohibited absent separate owner authorization.
