# B10-R18-162 — Source-local original-only structural SQL and live access-control audit

**21 November 2026 — NO_GO.** Exact parent [R18-161 draft PR #269](https://github.com/xuvenz-source/ttrpgsite/pull/269) commit `25bd4b0d1f41b1ee6113b70b67f1cf51b68b31cb`. AI-led primary security review; second-party human review is not represented as available or completed.

## Scope and integrity

The original Supabase database has 83 stored migration SQL bodies; 22 are absent from the existing Git tracked migration source under R161 reconciliation. In this stage, 22 full original-only migration statements were **read in memory within an authenticated read-only database query/temporary tool processing step**. The tool output exported only sanitized structural findings, not raw source text to GitHub, chat or CI.

A conservative lexer handled quoted strings, quoted identifiers, line/block comments, dollar-quoted bodies and semicolon separation. It identified **190 top-level statements**, **23 CREATE FUNCTION**, **20 SECURITY DEFINER**, **43 CREATE POLICY** and four versioned migration bodies with top-level DML. This is **not** a full PostgreSQL parse/semantic review and lexer completeness is not proven; nested constructs, alternate syntax and generated SQL require further analysis.

Top-level data-write migration versions requiring individually reviewed replay predicates and idempotency:
- `20261105111916` — tabletop_functions_and_map_storage
- `20261105114239` — add_npc_bestiary_and_character_artwork
- `20261105133019` — create_personal_token_libraries
- `20261105143416` — map_calibration_source_dimensions_and_realtime

Five historical privileged function declarations lacked local actor identity markers. Live original catalog checks now **bound their direct callable surface**, rather than automatically calling them unsafe:
- `validate_token_map`, `validate_npc_structure`, `sync_character_token_art`, `notify_character_token_resources` are privileged trigger functions with respectively 1, 2, 1 and 1 current enabled trigger use, **not directly executable by anon/authenticated**.
- `claim_tabletop_registration_slot(p_fingerprint text)` is a privileged boolean helper with **no direct anon or authenticated EXECUTE** and no trigger use; its approved caller chain and identity semantics remain to be reviewed.

A trigger not directly callable by normal users can still run with elevated privileges when a user mutates the base table; trigger source and table operation RLS still require semantic authorization review. Grant revocation is a boundary, not a proof of safety.

## Current live catalog cross-check

- **31/31 public application tables have RLS enabled.** No public table has an anon SELECT privilege; the private registration-limits table has RLS and zero policies.
- **77 public RLS policies**, all permissive. None of the policy expression checks is a literal `true` predicate; policies with a USING expression contain at least one known identity/helper marker in this limited text classification. As permissive policies compose with OR, any unscoped additional policy could still leak; full expression and role-grant review remains required.
- **67 authenticated-callable SECURITY DEFINER functions**, zero anon callable. Seven without direct `auth.uid` marker have already been triaged at R159; neither this pass nor R161 authorizes the other sixty.
- The known revoked sheet-owner gap (#220) and fog-status metadata oracle (#212) remain unresolved live issues. Invites (#223), privileged writers (#229) and issued URL / stale subscription (#231) remain NO_GO.

## Decision and next step

**Structural source triage is completed for 22 original-only records; semantic approval for all 22 is STILL OPEN.** Next review targets actual DML replay hazards, privileged trigger caller chains, and policy composition without copying private raw SQL to the repo. Source-only tests prevent accidental conversion of triage into a green release gate.

No hosted SQL changes, migration edits, application code, merge, deployment, charged infrastructure, QA bootstrap or owner production approval. Owner risk acceptance of the single-AI-reviewer process is required only at the release decision point, not as a precondition to technical review.
