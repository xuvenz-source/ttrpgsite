# B10-R18-183 — Historical DO-block semantic triage

21 November 2026. Exact child of R18-182 [draft PR #291](https://github.com/xuvenz-source/ttrpgsite/pull/291), commit `bfe5c68496dabbddbaffc5f2e2df06c88975a0ce`. Source-only **NO_GO**, original database read-only.

All 12 top-level DO blocks in the 83 original registered historical migrations were inspected in place without exporting raw SQL. **Seven** conditionally change the `supabase_realtime` publication. In particular, the original history publishes `public.characters`, `public.npc_templates`, `public.campaign_sheet_item_leases` and `public.map_viewer_visibility_ticks`; actual signed Realtime access still requires validation of current RLS and subscriber permissions. Do not mistake publication membership for authorization.

**One DO block performs a real data backfill**: migration `20261105163541` updates `public.campaigns.token_display_config` using sheet-template fields to reconcile token-monitor field IDs. This is not read-only or automatically idempotent, and should not run on an existing copied campaign without separately validated transformation. Synthetic fixtures do not establish real historical data integrity.

**One DO block** (migration `20261106074754`) dynamically rewrites two prior privileged RPC definitions, `get_token_monitor_values` and `post_token_reference`, as independently demonstrated in R182's disposable PG17 model. These exact patches must be run chronologically and never simplified into a static mutation of `can_view_campaign_map` (the latter is defined statically).

**Two DO blocks** in `20261107051546` perform grant/policy catalogue assertions, failing the migration if earlier privilege cleanup has not occurred. **One DO block** in `20261107150305` conditionally adds holdable-item constraints to campaign tool templates/issues; historical existing rows must pass those constraints.

The precise, finite list of 12 blocks and their structural purposes is in the manifest with **zero semantic signoffs**. This reduces the 83-script replay audit to specific high-risk installation effects without asserting overall migration safety. Full top-level statement count is **937**, not 943 (six trailing comment segments).

No SQL, migrations, Auth, Storage, application runtime, QA data, merges, deployments or paid resources were changed. The 67 privileged RPC semantics, original #220/#212/#223/#229/#231/#218 repairs, signed DM/P1/P2/revoked QA and owner R127 approval remain open.
