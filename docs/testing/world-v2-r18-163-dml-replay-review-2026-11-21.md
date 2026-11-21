# B10-R18-163 — Historical data-write replay conditions and private bucket postconditions

21 November 2026. Exact child of R18-162 [draft PR #270](https://github.com/xuvenz-source/ttrpgsite/pull/270) at `e3bfc9097c794bc2beea7f19ff4f6bfae6dd745a`. **NO_GO**, source-only AI technical review.

## Read-only original historical SQL targeted examination

The four top-level data-write statements found in R162 were inspected in memory, **without exporting original raw SQL or account/storage records**.

Three original migrations insert bucket metadata into `storage.buckets`, each using `ON CONFLICT DO NOTHING` rather than overwriting an existing bucket. This avoids automatic replacement during a repeat, but it is **conditional idempotency, not configuration correctness**: an existing incorrectly public or differently restricted bucket could survive. An independently checked QA replay must assert every intended bucket's final privacy, identity and RLS policy after installation. Do not use bare `ON CONFLICT` success as a security approval.

The fourth statement conditionally updates `public.battle_maps` source-dimension fields with a WHERE clause, NULL checks and COALESCE logic. It is a data backfill, not a pure DDL declaration; prove behavior with zero maps, NULL legacy dimensions, and partially migrated rows before QA promotion. The targeted four direct top-level operations contained no observed hardcoded UUID literal under the limited scan, which does not rule out other data-dependent sources.

Fresh **read-only hosted inventory**: original project has **3 private Storage buckets and 0 public**; isolated QA project currently has **0 buckets**. This supports the expected privacy posture but does not prove that full historical replay results in correct policy or that issued signed URLs have been revoked. Signed URL revocation security issue #231 is independent.

## Trigger/caller consequences

Four original-only SECURITY DEFINER function declarations without local actor markers are trigger routines: `validate_token_map`, `validate_npc_structure`, `sync_character_token_art`, `notify_character_token_resources`. They lack direct anon/authenticated EXECUTE in the current live catalog, but run as an effect of changes to their host tables. The former two validate relationships, while the latter two can update dependent token state; all side effects still need source-exact and signed table-operation review.

The distinct `claim_tabletop_registration_slot` boolean helper has no direct anon/authenticated EXECUTE; its privileged caller provenance and token/registration throttling contract remain unresolved rather than stamped secure.

## Decision

This package narrows the original-only historical DML replay risk. It does **not** complete an 83-file semantic audit, review all 67 privileged RPCs, install QA, run signed accounts or authorize release. Existing #212/#220/#223/#229/#231 remain blocked, and #218 remains independently unresolved.

AI reviewer continues the technical audit; no separate reviewer is required to proceed with review steps. The owner still controls production and acceptance of the single-reviewer residual risk. No hosted writes, history rewrites, source changes, merge, deploy or paid infrastructure.
