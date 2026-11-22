# R220 — R219 owner-sanitized policy pair receipt and owner-private OR guard topology (NO_GO)

22 November 2026. Source-only child of R219 draft PR #331 final exact parent commit 6f2d27a43ba2e1c5bef6ea24a3ee76cc032fc8a3. Its focused synthetic security workflow 44987372800 and full staged repository verification 44987372831 both succeeded; no merge/deployment or QA/original SQL changes.

## Owner R219 sanitized report (no original source attached)

Owner supplied **only** r219-sanitized-report.json, 2,931 bytes, SHA-256 d7fd65cd142e92bdbce9e74ac01384280939c137f26f680ca4d44f6b4096b7d0 (digest of sanitized JSON **not SQL**). The report records 83 original migration SHA checks and 937 lexical statements, 12 historical Storage policy statements, eight archived final lexical policy keys, **seven unique possible overlapping policy-key pairs**, one Storage table target, and **six previously reported pairs of R111 source migration priority indices**. All 5 numeric R111 priority references 2,3,4,29,50 are included. Seven pairs affect authenticated; operation intersections: 3 SELECT, 3 INSERT, 1 DELETE, 0 UPDATE. Four pair combinations have a raw OR word in one/both policy statements. Zero pair combinations lacked a bucket_id word, lacked a recognized direct auth/campaign helper word, or contained a literal TRUE entire guard. This is **only a lexical word audit**: actual SQL boolean grouping and managed Storage policies are unproven.

The next step targets one specific ambiguity: R219 searches the entire CREATE POLICY statement for an OR *word*, including quoted text and comments. Whether an OR is inside USING/WITH CHECK, at guard top-level, or inside an already-constrained parenthesized expression is much more useful for private prioritization.

## R220 scripts, tests and trust boundary

- `scripts/release/r220_validate_owner_r219_receipt.py` reads **only a bounded owner-sanitized JSON receipt**. It accepts exactly the predetermined R219 schema and always NO_GO; rejects duplicate JSON keys, NaN/floats in counts, private/extra content, forged authority, count/role/operation/priority contradiction, changed limitations. No SQL/DB/network access.
- `scripts/release/r220_private_storage_guard_or_topology.py` runs **only on the owner's existing private Ubuntu WSL migration archive**. It replays R219/R218/.../R154 83-source SHA, chronology/permission/integrity checks and NO_GO gates, then locally masks SQL single/double/dollar-quoted literals and nested block/line comments. It extracts balanced USING and WITH CHECK expression text (held only in process memory), recognizes top-level versus nested OR words, marks any top-level OR branch lacking the literal bucket_id or one of a small set of recognized authorization helper words, and reconciles all seven R219 archived policy-key pairs and four raw-OR-word pair counts. Malformed quoting, unbalanced guards, unsupported ALTER/DROP history fail closed.
- Outputs ONLY preapproved fixed code names and numeric counts, with up to 24 numeric R111 **priority** references and explicit truncation; no original SQL, policy/Storage bucket/table names, guard expression text, original migration names/versions, docket content, source hashes, passwords, JWTs, signed Storage URLs or campaign/Auth rows.
- Synthetic CI uses **fictional** 83-file archives and fabricated sanitized JSON exclusively. It tests OR in quoted literals/comments does not count as a guard OR; inner vs top-level OR, unbalanced source rejection, policy pair reconciliation, source hash tampering, privacy and NO_GO guards, and strict five-path source-only diff. Neither database, app runtime, active migrations, Edge, Vercel, paid resource nor production is touched.

## Interpretation and next gated owner checkpoint

SQL lexical OR placement **is not a PostgreSQL Boolean AST or proof of authorization**. A missing known helper word may be justified by another helper and a present word can still appear in an unsafe logical branch. PostgreSQL composes multiple permissive RLS policies by OR: a restrictive-looking predicate in one policy cannot by itself guarantee an independent permissive policy will not grant access. Live managed policy catalogue and existing signed URLs are not examined.

Reference only:
- https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- https://supabase.com/docs/guides/storage/security/access-control

After **exact-head R220 focused and general CI both succeed**, download its immutable owner-local Python script into the existing `$HOME/ttrpg-history-private` WSL folder under `umask 077`. Prior owner-local private readers R154/R186/R191/R211/R213/R214/R215/R216/R217/R218/R219 must stay available. Run offline and save only stdout as `$HOME/ttrpg-history-private/r220-sanitized-report.json`, then upload **only** that generated JSON. If it refuses, report only the fixed error code `R220_PRIVATE_STORAGE_GUARD_NO_GO`; never send original migration SQL or R111 docket.

All 83 historical migrations remain unapproved semantically; all 67 privileged callable graphs, signed DM/P1/P2/removed/outsider QA, signed URL revocation, effective RLS, blockers #212/#220/#223/#229/#231/#306, QA SQL installation and production remain **NO_GO**. An exact QA SQL/backup/rollback target and zero-dollar resource plan require separate express owner approval; a generic Proceed is not such approval.
