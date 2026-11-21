# B10-R18-190 — Original read-only privileged authorization catalogue, 21 Nov 2026

**SOURCE-ONLY; release NO_GO.** Exact child of [R189 draft PR #298](https://github.com/xuvenz-source/ttrpgsite/pull/298), head `7b1ca1ced5ed76df4a2a9e586818de32d6a72a93`. R189 exact-head source-only workflows 2/2 succeeded. The owner uploaded **only** `r189-sanitized-report.json` (1,791 bytes, SHA-256 `48468e18b5deb53350cbefb75b29e984505fa99d90804e346d98a818caa3cb57`), which confirmed historical R111 **priority docket index 31, statement 1** SQL-language body SHA-256 **and byte-length parity** with a single live metadata-bearing SQL function's stored `pg_proc.prosrc`. No private source SQL or user identities were exported.

## Fresh original read-only catalogue results

A **single aggregate-only SELECT** over the verified original Supabase project's `pg_catalog.pg_proc` / namespace, with `has_function_privilege`, was run read-only and yielded only fixed counts/booleans. The exact query is saved at `scripts/release/r190_live_authorization_catalog_readonly.sql`; its sanitized result is `staging/world-v2-b10-r18-190-live-catalog-authorization-triage/sanitized-catalog-snapshot.json`. It neither invokes functions nor looks at application rows.

| Observation | Captured |
|---|---:|
| Current public SECURITY DEFINER functions | 85 |
| Authenticated-executable privileged functions | 67 |
| Authenticated-executable definitions with direct auth.uid/auth.jwt string markers | 60 |
| Authenticated-executable privileged definitions **without** direct identity markers | **7** |
| Anonymous-executable privileged functions | 0 |
| Authenticated-callable metadata-bearing definitions | 1 |
| Metadata words before the **first** FROM | 2 |
| Metadata words at or after the **first** WHERE | 0 |
| auth.uid token at or after first WHERE (metadata candidate) | 1 |
| Metadata candidate returns SETOF record | True |
| `is_map_fog_published` authenticated-callable SECURITY DEFINER overloads | 1 |
| `is_map_fog_published` anonymous-callable | False |
| `is_map_fog_published` direct auth.uid/auth.jwt marker | False |
| `is_map_fog_published` direct campaign_members or can_view_campaign_map marker | False |

**Evidence interpretation:** The metadata words occur within text preceding the first FROM, consistent with projection/display fields rather than direct WHERE-based authorization. This is **not a SQL AST proof**, and a SQL function can still leak sensitive data or delegate scope incorrectly. The WHERE segment contains an auth.uid token; this does not by itself guarantee correctness of the JOIN predicates or the revocation boundary. No metadata-derived privilege bypass has been demonstrated. It remains under semantic review, **not approved**.

The fog status function still has no direct identity/scope/helper checks in the catalog-level lexical review, despite being callable by authenticated users with definer privileges. This is **not proof of arbitrary map access**, but it materially increases priority of existing issue [#212](https://github.com/xuvenz-source/ttrpgsite/issues/212) and requires exact function source review and signed DM/P1/P2/removed/outsider tests before any acceptance.

## Engineering scope and audit controls

R190 source-only work stores a self-contained reproducible read-only catalog query, its sanitized aggregate evidence, a fail-closed validator and fictional drift tests. No original SQL definitions, SQL bodies, raw metadata values, function argument signatures, private migration filenames, credential paths or user identities are written to GitHub or CI. No hosted QA/original SQL changes, no versioned migration file, no app code, no Edge Function, no deploy, merge or paid resource. A future catalog drift requires reinspection and a new independently verified snapshot, never accepting arbitrary numbers as authorization.

## Remaining gates

1. Semantically audit all **seven** indirect-identity privileged call chains and the fog status function in particular; direct string markers are insufficient either way.
2. Verify the historical 83 migration functions and effective source chronology, ownership, grants and RLS composition.
3. Perform independent signed DM, Player 1, passive Player 2, revoked/removed and outsider QA including revocation and storage URL bearer behavior.
4. Obtain separate owner approval before an authenticated QA-only repair install, and separately again for production.

Original project was **ACTIVE_HEALTHY** when checked. This is a one-time point-in-time snapshot, not continuous proof. Hard blockers #212, #220, #223, #229 and #231 remain **NO_GO**. No change to any production, original or QA data was authorized or performed.
