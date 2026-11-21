# B10-R18-161 — AI-led original migration provenance and security triage

21 November 2026 | Exact parent R18-160 draft PR #268 `e5dec83f2158344c6deed0663d66273df09ad4c1`. **NO_GO**. Source-only evidence record, no hosted SQL changes.

## Reviewer assignment

The project owner has identified the lead AI developer as the only available trusted technical security reviewer. **Do not require the owner to locate another human reviewer.** The AI will own the technical review and produce per-migration and privileged-function evidence. This is **not** an independent second-party audit: the reviewer is also the implementer. The owner must explicitly decide whether to accept this residual process risk before any production release; no silent sign-off or self-approval. Production R127 approval and genuine signed-account QA remain independent release gates.

## New read-only evidence

- The original connected Supabase `supabase_migrations.schema_migrations` contains **83 records, each with a nonempty stored SQL statement array**, totaling **709,936 bytes**. Earlier private Ubuntu evidence was not required for this discovery.
- Git staging branch migration directory contains **62 .sql files**.
- Using **Git-compatible SHA-1 blob preimage hashes calculated inside the original PostgreSQL** (not exported SQL) and the GitHub blob SHAs, **47/62** tracked files match original migration contents exactly. Nine of these match under different migration names/version prefixes.
- **14** same-name files differ byte-for-byte but a **read-only heuristic comparison of whitespace and line-comment-stripped text** matched. This does not prove semantic equivalence because stripping comments naively can affect SQL string literals or dollar-quoted function bodies. They remain unapproved.
- **22** original database records have no matched GitHub source file; they must be reviewed **in place** from the stored original SQL, not reconstructed from the tracked filename.
- **One** Git file, `20261111023204_world_v2_b10_integrated_motion.sql`, is not matched to an original registered SQL body. Do not treat it as applied, authorized or safe to push.

The sanitized `staging/world-v2-b10-r18-161-original-history-ai-audit/manifest.json` lists each original version/name, size, classification and lexical risk hints. It **does not contain any raw historical SQL, credentials, private data, complete function bodies or live users**.

## Security triage: not final approval

Original SQL lexical markers flagged 66 files with SECURITY DEFINER text, 25 with policy changes, 62 with GRANT/REVOKE, 5 with Storage references, 25 with Realtime/publication references, 20 with trigger changes, and 12 with Auth references. These are *file-level string indicators*, not proof of actual AST semantics, ownership, RLS effectiveness or absence of hardcoded credentials.

The current original live catalog separately shows 67 authenticated-callable privileged functions, including seven without direct auth.uid marker. R159's seven-way classification is retained, but **none of the remaining sixty is hereby semantically approved**. Confirmed issue #220 revoked character-owner privilege and issue #212 fog-status oracle are still live blockers; pending #223 invitation rejoin, #229 privileged member writer bypass and #231 signed URL/realtime revocation remain unapproved.

## Follow-on AI review sequence

1. Audit all **22 original-only** migration bodies via read-only, in-database source review and safe summaries, prioritizing Auth, Storage, grants, definer, RLS, triggers, and data-dependent replay hazards.
2. Independently adjudicate the **14** normalized matches at the SQL grammar/behavior level; a whitespace/comment regex cannot sign them off.
3. Validate exact-source runtime authorization for remaining privileged RPCs and helper chains, RLS function ACLs and current policy composition. Reconcile legacy declarations against final deployed schema and historical replay behavior.
4. Produce explicit per-file outcomes (PASS / CHANGE_REQUIRED / BLOCKED) and a reviewed, forward-only QA repair plan. Do not alter original 83 files or push scratch candidates.
5. Verify separate QA target and dependencies; do not run hosted QA SQL until separately authorized. Execute real signed QA actor acceptance and free-tier performance tests.
6. Request owner's explicit acceptance of remaining findings and **lack of independent human audit** only at the release decision point. The AI reviewer must not self-authorize production.

**NO_GO**: no source-only scan, even one covering all 83 rows, is equivalent to a semantic audit. No SQL, migration, runtime, merge, deployment, paid infrastructure or production approval is performed.
