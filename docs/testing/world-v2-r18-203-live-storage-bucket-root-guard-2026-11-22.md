# B10-R18-203 — Independent live Storage SELECT bucket-guard root proof (NO_GO)

22 November 2026. Exact source-only child of [R202 draft PR #312](https://github.com/xuvenz-source/ttrpgsite/pull/312), commit `4135d0bc277a5f1d8a23c4bbc5f2c04bd34b4da1`, which passed dedicated `44907082875` and standard frontend/build/Edge `44907082791` GitHub Actions (2/2). **No original/QA database writes, original policy SQL export, app/Edge runtime edits, active migrations, merges, deployment or paid resources.**

## Objective: distinguish OR risk from demonstrated hosted protection

The preceding R201/R202 synthetic PostgreSQL17 negative tests showed that a permissive personal-asset rule may accidentally expose campaign assets when an owner OR branch escapes the bucket guard, even if the policy AST root is AND. This was **a representative class-of-bug counterexample**, not proof the installed policy was wrong.

R203 goes further, interrogating the **actual three installed current original Storage SELECT policy ASTs read-only** while keeping complete `polqual` internal node trees, `pg_get_expr` expressions, policy and bucket names/values, object paths and Auth identities exclusively within PostgreSQL. Its reproducible `SELECT` is `scripts/release/r203_readonly_storage_bucket_root_guards.sql`. It parses balanced top-level `pg_node_tree` BOOLEXPR-AND argument-node braces into anonymous expression child counts, compares first child's operator through `pg_operator`, resolves the known `storage.objects.bucket_id` column through `pg_attribute`, checks its direct VAR and CONST markers and verifies nested OR is absent from that first child. An internal regex extracts only the bucket literal for an **aggregate distinct count**; no literal leaves the database.

| Anonymous current Storage SELECT slot | Root AND children | First child is bucket equality OPEXPR+VAR+CONST, no nested OR | Later child nested OR |
|---|---:|---|---|
| 1 | 3 | **Yes** | No |
| 2 | 2 | **Yes** | **Yes** |
| 3 | 2 | **Yes** | No |

**All three independent bucket literal constants are distinct (3/3)**, verified inside PostgreSQL without exporting their contents. Therefore the dangerous *missing independent top-level bucket guard* variant in R202 is **not observed** in the current original Storage policies. The middle policy's nested OR exists only in a later child under the independent first AND factor; as PostgreSQL boolean AND factors must all be satisfied, the nested OR **cannot bypass that separate bucket equality condition**.

**Limitations:** This is a conservative source-structure finding based on PostgreSQL 17 internal `pg_node_tree` text serialization and the current catalog snapshot. It verifies bucket comparison structure, not whether the chosen bucket is the intended asset classification, whether owner/path predicates or nested subqueries implement correct actor authorization, or whether fresh URL issuance after membership removal is denied. The current policies are not declared fully safe and no signed exploit is claimed. PostgreSQL [17 RLS documentation](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) confirms multiple PERMISSIVE SELECT policies combine using OR; independent bucket gates remain necessary for each arm.

## New unchanged-source PG17 regression

The exact R203 source-only query is SHA pinned, as are the unchanged R202 synthetic fixtures and new R203 loopback-only runner. The runner replays R202 then executes **that same SELECT** against invented, RLS-enabled `storage.objects` and fictional three-policy authorizations. It expects 3 root AND first-child bucket equality checks, 3 distinct invented bucket constants, and no first-child OR. In a transaction, it deliberately creates a fictional personal-owner rule whose first child becomes **(bucket=personal OR owner=actor)**, while keeping root AND and a second path OR child. It checks the classifier now rejects exactly one branch, then **ROLLS BACK** and compares the full synthetic classification bytes to the baseline.

This defends the *source-only evidence gate* against a future bucket-scope regression. Unlike the owner's actual live policies, all scratch policies, roles, buckets, assets and users are invented. Runner refuses hosted DB overrides and requires GitHub Actions + R201/R202/R203 markers and disposable localhost PG17. It neither connects to original/QA nor mints/downloads signed URLs.

The new Python validator pins R200 owner-private receipt SHA `4d9f09d70ff13208700e4428b33910039029a4ac2d823c429bcce0ff500c2b53` (83/83 original SHA-verified migration bodies, 10 historical direct Storage policy CREATE/2 DROP, latest map helper fingerprint matches) and all three original current anonymized per-policy root/OR/bucket comparison booleans, plus unchanged Git blob SHA-1 for the read-only query and scratch runner. Adversarial tests deny drift, lost bucket equality, weakened OR separation, changes to source bytes, and premature hosted security/release flags. R203 is nested atop R202's already verified source-only tests.

## What remains before application security approval

Current `storage.objects` policy **bucket isolation** has positive structural evidence. Nevertheless, the complete owner/campaign-specific authorization clauses, helper permissions, SELECT operation-dependent policy effects and **revoked actor fresh signed URL issuance** have not been verified using real signed clients. Existing one-hour signed Storage bearer URLs cannot be invalidated merely by browser cache clear or Auth JWT signing key rotation; support/expiry policy is still outstanding.

Security release **NO_GO** remains for all 83 original historical migration semantic reviews, 67 callable privileged function authorization graphs, signed DM/P1/P2/removed/outsider Storage and Realtime QA, and separate QA installation and production owner approval. Issues #231, #220, #223, #229, #306 and #212 remain open. No user-side WSL report required for R203. Never install this scratch query as a migration or interpret it as permission to deploy.
