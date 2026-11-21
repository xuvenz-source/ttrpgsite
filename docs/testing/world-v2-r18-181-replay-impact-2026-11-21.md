# R18-181 — Original historical replay impact and top-level SQL classification

21 November 2026. Exact child of all-green R18-180 draft PR #289 at 9412e8e35a7a1251f341f13e98156823eda5b912. Source-only NO_GO.

Original private Supabase migration history (83 records) was parsed in place using an SQL-aware lexical splitter. Comments, quotes and dollar-quoted function bodies were not mistaken for top-level statements. This identified 943 lexical segments, of which six are trailing comments and 937 are executable top-level SQL statements. No original raw scripts or user data were exported.

Recognized top-level replay statements: 4 UPDATE (all have WHERE), 3 INSERT (all into Storage buckets with private flag and ON CONFLICT), 0 direct DELETE, 0 TRUNCATE, 40 DROP (23 policies and 17 triggers; no direct DROP TABLE), and 12 DO statements. There are 111 GRANT and 190 REVOKE prefixes. These are statement-shape facts only, not security approvals.

The four direct updates target battle_maps source dimensions, chat_messages map assignment, campaign_tool_issues state, and map_visibility_ticks fog_enforced. One DO block updates campaigns token_display_config, while other DO blocks perform publication, grants or dynamic DDL. All 937 executable SQL statement prefixes are classified; full semantic audit remains outstanding.

A partial history replay MUST remain isolated; dropped policies/triggers and new functions can temporarily change authorization. Backfills may fire triggers. Full 83-file semantics, all 67 privileged chains, signed tests, issue #220/#212 repairs, member/Storage revocation and independent QA authorization remain unfinished.

NO original/QA hosted writes, raw private SQL, runtime modifications, migration files, merges, deployments or paid resources were introduced.

## Mandatory dynamic function-rewrite gate (corrected after source inspection)

The original `20261106074754 20261106_private_player_maps` migration **creates/replaces `public.can_view_campaign_map(uuid,uuid)` statically**. A subsequent DO block dynamically rewrites two *different* existing RPC definitions, using `pg_get_functiondef`, guarded string replacement and `EXECUTE`:

- `public.get_token_monitor_values(p_map uuid)`: replaces an active-campaign-map equality check with `can_view_campaign_map(campaign_id,map_id)` authorization.
- `public.post_token_reference(p_token uuid,p_code text)`: augments the owner check with `can_view_campaign_map(token_campaign,token_map)`.

Both replacements require exact prior function bodies and raise if the expected text is missing. They must be replayed chronologically and checked against the later definitions and signed P1/P2/DM/outsider authorization. **Do not misidentify `can_view_campaign_map` itself as a dynamically rewritten target.** R18-181 marks both individual input-body and authorization tests as unapproved, so hosted QA remains NO_GO. No original private SQL is exported.
