# B10-R18-188 — Exact private user-metadata context review (NO_GO)

21 November 2026. Direct child of R187 [draft PR #296](https://github.com/xuvenz-source/ttrpgsite/pull/296) exact head `227c79835c673ae3d29c7d87949f165ed21dbf1e`. No SQL, runtime, database, deployment, merge or paid resources are changed.

## Owner-local R187 evidence

Uploaded sanitized R187 JSON was **8,561 bytes**, SHA-256 `40a0a6afd4fae7059de597e0a62872417a4ccc2b257be0850216d1a9b69588b6`. It reported 83 SHA-pinned history files; 182 historical SECURITY DEFINER statements; 158 lexical findings, partitioned into **1** editable Auth metadata marker, **56** missing direct identity and membership markers, **14** missing direct identity marker only and **87** other lexical markers. The first prioritized target is **R111 priority-sorted docket entry 31 (NOT chronological migration 31), executable statement ordinal 1**.

R187 source-only dedicated and full general CI passed 2/2 on exact head. All live 67 currently callable privileged-function grants/owners/helper-call chains, real DM/P1/P2/removed/outsider Auth, Storage bearer revocation, original migration semantic analysis and production gates remain **NO_GO**.

## What R188 adds

R188 is a new, offline-only, read-only analysis of **exactly one historical statement**. It re-runs R187, R186 and R154's unchanged 83-SHA verification, checks the expected counts, bucket ordering and exact target's R111 index/statement ordinal, re-hashes the target original file, and fails closed unless that exact source definition still carries precisely the R187 metadata marker.

For the target statement only, it separates user-editable metadata word matches in unquoted SQL tokens, single-quoted SQL literal content (which can be JSON keys or dynamic SQL), and commented/source differences. It counts comments and reports fixed booleans for direct `auth.uid`, `auth.jwt`, `auth.users`, `campaign_members`, and app-owned metadata tokens. These measurements deliberately **do not infer** whether a claim influences authorization, whether JWT claims are fresh, whether a helper is safe, or whether this historical function remains effective. The report always says semantic review is required and releases NO_GO.

Neither function name, source SQL, arbitrary SQL text, paths, filenames, sensitive values, secrets nor user identities are printed or committed. Fictional test sources are allowed in CI; the private 83 SQL files remain in the owner's Ubuntu WSL only.

## Local handoff

Once the exact-head CI passes, copy the commit-pinned R188 Python script into the same private WSL directory as the R154/R186/R187 scripts and execute it there with private file permissions. Upload **only** the sanitized JSON, not the 83 historical migrations, private docket, console debug output or credentials.

## Open security gates

Source-exact privileged-function semantics, later replacement chronology, effective SQL ACL/RLS, actor/scope validation and helper call graph must be independently reviewed before QA bootstrap. The confirmed synthetic security blockers #212 (fog status), #220 (removed sheet owner), #223 (rejoin invitation), #229 (privileged TRUNCATE) and #231 (signed media reissuance and existing one-hour bearer URLs) remain unresolved in hosted systems. No evidence here authorizes original/QA SQL, migrations, deployment or signed QA claims.
