# R18-181 — Original historical replay impact and top-level SQL classification

21 November 2026. Exact child of all-green R18-180 draft PR #289 at 9412e8e35a7a1251f341f13e98156823eda5b912. Source-only NO_GO.

Original private Supabase migration history (83 records) was parsed in place using an SQL-aware lexical splitter. Comments, quotes and dollar-quoted function bodies were not mistaken for top-level statements. This identified 943 top-level statements. No original raw scripts or user data were exported.

Recognized top-level replay statements: 4 UPDATE (all have WHERE), 3 INSERT (all into Storage buckets with private flag and ON CONFLICT), 0 direct DELETE, 0 TRUNCATE, 40 DROP (23 policies and 17 triggers; no direct DROP TABLE), and 12 DO statements. There are 111 GRANT and 190 REVOKE prefixes. These are statement-shape facts only, not security approvals.

The four direct updates target battle_maps source dimensions, chat_messages map assignment, campaign_tool_issues state, and map_visibility_ticks fog_enforced. One DO block updates campaigns token_display_config, while other DO blocks perform publication, grants or dynamic DDL. Eight SQL heads need deeper parser adjudication.

A partial history replay MUST remain isolated; dropped policies/triggers and new functions can temporarily change authorization. Backfills may fire triggers. Full 83-file semantics, all 67 privileged chains, signed tests, issue #220/#212 repairs, member/Storage revocation and independent QA authorization remain unfinished.

NO original/QA hosted writes, raw private SQL, runtime modifications, migration files, merges, deployments or paid resources were introduced.

## Mandatory dynamic function-rewrite gate

A deeper in-place review of historical `20261106074754 20261106_private_player_maps` found a DO block that retrieves the then-existing PostgreSQL definition of `public.can_view_campaign_map` using `pg_get_functiondef`, rewrites its source text and executes the amended function definition. This is not a generic static CREATE FUNCTION. Its resulting authorization behavior depends on the exact earlier chronological function version.

Before authorizing any separate QA replay, attest the source-exact helper version immediately before this migration, verify the transformation's exact intended output and subsequent migrations, and test DM/player/foreign-campaign access after the rewrite. Preserve strict QA API isolation during the entire sequence. This historical rewrite is **not semantically approved** in R18-181. No original SQL body was exported.
