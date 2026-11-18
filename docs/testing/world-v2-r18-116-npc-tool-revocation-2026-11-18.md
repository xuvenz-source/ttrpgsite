# B10-R18-116 — Campaign membership revocation: tool claim and NPC reader

**18 November 2026. Source-only/draft, NO original or QA SQL and NO production deployment.** Direct parent R18-115 draft PR #219, head `920cd0801b098d3c5de4e8e36a1aa5dca82d1add`. Release blocker #212; revoked sheet owner gap #220, unstable inventory identity #218.

## Reason for this work

R18-115 proved that a removed player retaining `characters.user_id` assignment could still use privileged sheet operations. R18-116 separately asks whether similar **membership revocation** gaps exist in **tool-inventory item claims** and **DM-only NPC map values**. This review specifically avoids inferring security from a textual `is_campaign_member` or `is_campaign_dm` call: the SQL functions execute in disposable PG17 with real role privileges and synthetic actor claims.

## Exact source evidence

The original project's current read-only `pg_proc` catalog describes:

- `public.claim_campaign_tool_item(uuid,uuid,boolean)`: postgres-owned SECURITY DEFINER, configured empty search_path, authenticated-executable/anon denied, **1,693 bytes / MD5 `570c89cc5b88bc739c56825eeb227449`**. The exact body is in tracked later-applied `supabase/migrations/20261108013000_inventory_lease_expiry_qualification.sql`. R116 checks this Git body against the live catalog fingerprint and required membership helper reference; unlike the NPC reader, no independent direct live-body equality has been attested.
- `public.get_dm_map_npc_values(uuid)`: postgres-owned SECURITY DEFINER, authenticated-executable/anon denied, **263 bytes**, SHA-256 `5e5c0657353a54f4812ee5b547e4575bf666f2e8c72a3fe1b6918cfff8293de5`. R18-103 independently checked the Git body against the original source; R116 verifies that parity record and extracts only the tracked `supabase/migrations/20261109000500_dm_map_npc_protected_columns.sql`.

No SQL function bodies were returned from the original project in the current R116 catalog query. No private 83-file Ubuntu recovery data or live account/user/character rows were accessed.

## Isolated test model and limitations

GitHub Actions runs `postgres:17` in its own disposable service, with exact local-only scratch credentials, no Supabase link, no service role token, and fail-closed external connection overrides. The R116 runner first re-runs R114 and R115 source-bound tests, then installs the two selected Git function bodies and synthetic `campaign_tool_item_leases` schema.

The `auth.uid()`, `is_campaign_dm` and `is_campaign_member` implementations are **synthetic fixture helpers**; they are not direct live-source bodies and use unsiged mock GUC identity claims. The test is NOT a hosted Supabase signed-session acceptance, and does not prove every tool mutation/transfer/release RPC. The fixture includes separate campaigns, DMs, players, an outsider, private/shared tool inventories, two per-campaign NPC maps, and a deliberately mismatched cross-campaign token that must not leak.

### Coverage, pending CI execution

- 28 tool/NPC synthetic permission scenarios: owner, private vs shared, cross-campaign DM, outsider, null identity, unknown issue, null item, explicit DM takeover, anti-steal, NPC read for correct DM only, revoked DM NPC and tool denial, revoked player-owner denial, revoked shared-tool owner denial, restored membership and successful rejoin.
- Three actual PostgreSQL role-level denial checks: anonymous tool claim EXECUTE, anonymous NPC read EXECUTE, and authenticated direct update on tool-item lease table.
- Membership removals and restorations are transactionally exercised against synthetic `campaign_members`, not just matched as text.
- These are sequential transaction permission checks, **not** a parallel multiuser stress test or latency benchmark.

## Unresolved review requirements

A pass establishes only the tested function behavior *under the named synthetic helper assumptions*. It cannot certify campaign invitation handling, revoked user session lifecycle, the exact live `is_campaign_member` or `is_campaign_dm` body, or read/write permissions in the other privileged RPCs.

R18-115's membership-security and R18-114's UUID candidate remain **unapplied**, as does the R18-104 fog-status oracle guard. The source-authenticated private 83-file migration review, all 67 authenticated privileged-RPC reviews, QA-only historical schema bootstrap, real signed DM/P1/P2/outsider negative tests, free-tier performance, and production release remain **NO_GO**. No paid resources, merges or Vercel deployment.
