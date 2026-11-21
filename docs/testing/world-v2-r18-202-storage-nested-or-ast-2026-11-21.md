# B10-R18-202 — Current Storage SELECT policy root AND and nested OR (NO_GO)

21 November 2026, exact child of [R201 draft PR #311](https://github.com/xuvenz-source/ttrpgsite/pull/311), final parent `8aa37b14b99734073113137c2336149ef375d530`. **R201 2/2 exact-head successful CI:** dedicated `44906600134` source and loopback synthetic PG17 isolation; general staged frontend unit/dependency/build/Edge `44906600199`. No hosted SQL writes, app/Edge runtime or migration edits, merges, deployments or paid resources.

## Read-only original Storage AST structural evidence

R200 owner-only sanitized receipt (3,183 B, SHA256 `4d9f09d70ff13208700e4428b33910039029a4ac2d823c429bcce0ff500c2b53`) validates 83/83 historical SQL file hashes and source chronology; direct historical `storage.objects` policy events 10 CREATE, 0 ALTER, 2 DROP; one historical current-matching map visibility helper. **No original SQL or policy names exported.**

R201 original `pg_catalog` SELECT-only classification of **three current** `storage.objects` permissive SELECT policies: all apply to authenticated and not anon; each has bucket+path markers, one contains a current-member map helper, two direct identity markers, and the middle anonymous slot additionally has owner/EXISTS/AND/OR words. This was word-based: an OR marker alone cannot establish bucket-scope bypass.

R202 adds a stricter **read-only anonymous SQL AST root classification** via `pg_catalog.pg_policy.polqual::text`, checking **only boolean regex results** inside PostgreSQL. `polqual` and `pg_get_expr` stay entirely in PostgreSQL and are never emitted as SQL or AST text. Reproducible query: `scripts/release/r202_readonly_storage_policy_ast_root.sql`.

| Anonymous source slot | AST root | Nested OR anywhere | Serialized AST length |
|---|---|---|---:|
| 1 | AND | No | 3,463 chars |
| 2 | AND | **Yes** | 10,360 chars |
| 3 | AND | No | 2,423 chars |

This **rules out a top-level OR** in the current policy expressions. It **does not prove** the bucket condition is an unconditional sibling of every nested OR arm, nor that personal-owner alternatives are bucket-isolated. `pg_node_tree` textual representations are internal implementation details: this check is an evidence marker and a regression snapshot, *not* a semantic SQL AST proof.

## Targeted disposable PG17 nested-OR counterexample

R202 `tests/world-v2-r18-202-postgres/run.sh` re-runs the **unchanged R201 synthetic PostgreSQL17 test** first: active campaign DM reads a fictional map; removed actor and outsider do not; removed owner retains unrelated personal art/profile; an improperly scoped top-level OR causes a synthetic bypass but is ROLLED BACK.

R202 then further simulates a **bad nested OR while preserving a TOP-LEVEL AND**:

`(bucket_is_personal OR owner_is_user) AND (path_is_personal OR path_is_campaign)`

That deliberately bad *fictional* personal-art rule permits a removed actor owning a map object to read the synthetic protected campaign map, despite denial by the map helper. The test explicitly asserts its PostgreSQL `polqual` root is still AND, verifies the unintended synthetic read, **ROLLS BACK**, then confirms the original bucket-scoped deny and unrelated personal-art/profile grants are restored. Neither original Storage policy body nor real assets, bucket names/paths or signed URL tokens are copied to CI or used in this scratch test.

All test connection overrides fail closed unless `GITHUB_ACTIONS=true`, explicit R201/R202 scratch markers, unique loopback-only PostgreSQL17 DB/user/password are present. The original current policy AST anonymous result, R200 receipt checksum, unchanged R201 test runner and new R202 test/query sources are SHA-pinned in a strict source-only validator with hostile drift/release-approval tests.

## Remaining security gates

No original live Storage policy semantics are proven secure or exploitable; the nested-OR counterexample is **not** based on the actual installed policy text. Actual current bucket constraints must be reviewed per boolean arm, and signed DM/P1/P2/removed/outsider real Storage authorization tested only after independent QA permission. The live one-hour `createSignedUrl(path,3600)` bearer link survives client cache clearing and Auth key rotation; fresh URL issuance must be rejected server-side after removal and old-token mitigation/expiry policy separately approved.

All **83 original historical migration semantics**, **67 current authenticated-callable privileged RPC call graphs**, signed multiuser QA and original/QA installation/production approvals remain **NO_GO**. Security issues #231/#220/#223/#229/#306/#212 open. No additional owner WSL historical SQL upload needed for R202. No merges, deployments or new paid infrastructure.
