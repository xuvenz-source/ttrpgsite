# B10-R18-117 — Campaign rejoin / tool mutation / lease release authorization gate

**18 November 2026. Source-only, draft, NO_GO.** Direct parent R18-116 draft PR #221 pinned at `c9db800042e31eb4bb03790aaea7fed3d193946b`. The original Supabase project has 83 registered migrations; separate QA has zero. No source-original SQL function bodies, user data, credentials or private Ubuntu historical SQL files were downloaded.

## Read-only live PostgreSQL catalog evidence

Current `public` privileged functions confirmed as `SECURITY DEFINER`, authenticated-executable, anon-denied:
- `mutate_campaign_tool_item`: 2,178-byte body, MD5 `0692ac50eb864f3dd0f91064f478309e`
- `release_campaign_tool_item`: 220-byte body, MD5 `775ad6515c74f23367ce6e55513f8744`
- `patch_campaign_tool_details`: 1,086-byte body, MD5 `12841d624886adab4f33e98f2c7716ac`

The R117 extractor verifies their *Git source bodies* in the applied historical migration `supabase/migrations/20261107095343_campaign_tool_item_collaboration.sql` against these exact current catalog MD5/byte lengths before writing temporary scratch SQL. This is a metadata-bound source match, **not** an independent direct live-body equality attestation.

All three bodies run with a postgres-owned definer in a disposable GitHub Actions `postgres:17` service. `auth.uid()`, `is_campaign_dm` and `is_campaign_member` are intentionally **synthetic** in the fixture, as in R18-116. It is not real signed hosted Supabase testing.

## Tool mutation/metadata/lease release test matrix

The executable test suite checks:
- Source-bound private/shared tool mutation, owner and DM access, another holder's lease, duplicate/invalid item metadata, new item creation and removal, and that separate claimed item edits are preserved (no lost update or UUID replacement)
- Non-DM mount attribute edits denied; owner light toggle allowed; campaign DM allowed mount attributes; attributes on inventory-only tools denied
- Wrong holder cannot release another user's item lease; rightful holder can release once, cannot keep editing after release; release is allowed for the revoked former holder as a safe cleanup
- Removing P1's campaign membership denies mutations and light edits despite owner/lease identity; removing the campaign DM denies mutations and metadata updates; restoration permits correct operations
- Five actual Postgres ACL negative probes deny anonymous tool mutation/release/metadata RPC execution and authenticated direct tool/lease table changes

This is **interleaved sequential** testing, not simultaneous true-parallel load. It inherits the earlier R114/R115/R116 fixture, including its scratch-only inventory UUID correction and revoked-character-sheet permission candidate, both unapplied to hosted databases.

## Invitation/rejoining: deliberately NOT certified

Read-only original `pg_proc` confirmed:
- `public.create_campaign`: authenticated-callable SECURITY DEFINER, 475-byte body, MD5 `9a12043761641127b6f60304eea876c5`, with text markers for `auth.uid()` and membership INSERT
- `public.join_campaign`: authenticated-callable SECURITY DEFINER, 742-byte body, MD5 `9fd65eca8e3160acd7a674931aad51c5`, with textual markers for invitation-code lookup, `auth.uid()`, membership INSERT and `ON CONFLICT`

Those *text markers* do **not** establish whether a removed member can reuse the same invitation code to rejoin, whether rejoin requires fresh DM consent, what role is granted on conflict, how invite rotation works or whether session revocation is immediate. We have **not** located a trustworthy exact, current Git function body for `join_campaign` / `create_campaign` or safely executed them with signed users. Consequently the invitation workflow is an explicit separate **NO_GO security gate**, not a passing test, nor a confirmed vulnerability. A verified private reviewer must reconcile their bodies and target invitation lifecycle rules before any hosted QA installation.

## Release and rollback

R18-104 fog-status metadata oracle, R18-114 canonical inventory UUID regeneration and R18-115 revoked-owner sheet authorization gap remain confirmed unresolved **hosted** defects. All repair candidates remain source-only and unapplied. Do not revert to those vulnerable original implementations in an automated rollback. Do not edit previously applied migration history; any eventual fix requires a new independently reviewed forward migration and staged rollback/forward-recovery plan.

A trusted reviewer must sign off on all 83 private historical migration bodies and independent original linked source credentials; then separately review an isolated QA-only dry-run and bootstrap before running signed DM/P1/P2/outsider invite/rejoin, tool collaboration, fog and movement checks. The full 67 callable privileged-function audit and free-tier performance are still pending.

**Hard restrictions:** no original or QA SQL changes, no migration replay or dry-run approval, no merged PR, no Vercel production deployment, no private SQL or credentials in GitHub, no paid infrastructure. **QA install / production: NO_GO.**
