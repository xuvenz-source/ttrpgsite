# B10-R18-152 — Synthetic cross-campaign Storage authorization matrix

**21 November 2026.** Exact R151 parent: draft PR #259 at `cf7d0d2a2af7dbc28fcf2bd48c36ccd95de99f86`. This is a **source-only security experiment** in disposable PostgreSQL 17. Production/original and hosted QA remain **NO_GO**.

## Why this is now the highest-value offline work

The user's trusted Ubuntu R111 private review workspace contains 83 original migration files, all hash matched and zero approved. A local structural investigation found three explicitly private Storage bucket INSERTs with ON CONFLICT DO NOTHING; eight historical Storage object policy declarations across three migrations and 20 RLS policies overall in the priority subset. Four storage policies with no direct auth.uid/auth.jwt references call is_campaign_member or is_campaign_dm; two argument aliases were resolved structurally. The exact private SQL bodies were not exported and **have not been semantically inspected by the assistant**. This information supports prioritization, not security certification.

Read-only original Supabase catalog metadata previously found three installed private Storage buckets, eight current Storage object policies, and postgres-owned security-definer authorization helpers that reference current membership and auth.uid. Catalog metadata is not proof that the historical and deployed policies have the same semantics. The original 83 history requires an independent semantic review, including each policy's OR branches, storage object/campaign ownership mapping and helper authorization behavior.

## Fictional PostgreSQL 17 experiment

Use the existing R120 isolated campaign and membership fixture (not the original SQL), with synthetic DB helper functions that bind actor identity from an **invented JWT test GUC**, plus an invented RLS-protected `forge_test.file_objects` table with canonical `campaign_id` and two object visibility classes. The role labels are representative cases, not a statement of current product permissions.

The dedicated disposable test executes a positive and negative matrix: campaign A DM can read A shared and DM-only objects but not B; A player reads A shared only; campaign B DM and B player cannot see A; outsider and anon cannot see any; foreign DM DELETE and a player's direct INSERT fail; spoofing an object-path prefix without changing its canonical campaign ID never grants access; an explicitly authorized same-campaign DM removal records an R120 tombstone, removes authorized A access and blocks unchanged invite; a DM reinstatement restores shared access without DM-only access.

**Two intentionally unresolved negative controls are critical:**
1. A temporary deliberately unsafe permissive `OR` RLS policy allows a B member to read an A object. Dropping that policy restores denial. PostgreSQL combines permissive policies with OR. This is a fictional vulnerability demonstration, **not evidence that the original private policy has this bug**.
2. A fictional preissued bearer token remains valid for an anonymous user after membership revocation. The model does NOT implement the Supabase signed URL algorithm, actual CDN, invalidation, object deletion or original 3600-second token lifetime. It illustrates why immediate cutoff of previously issued signed URLs cannot be claimed merely by updating DB membership or a browser cache.

All of these use local dummy UUIDs, zero real user rows and zero real keys. The synthetic RLS policy is **not** a deployable repair or a statement that historical SQL is correct.

## Release and acceptance gates

Manual R111 independent human review remains required for ALL 83 migration SQL files (not just four flagged); the original 67 authenticated-executable SECURITY DEFINER call paths remain unapproved; original issues #220 (old revoked-owner sheet RPC), #223 (old unchanged invitation rejoin), #229 (privileged member mutations), and #231 (already-issued Storage URLs) remain open. Old joined Realtime sockets/17 published tables/19 listeners, signed DM/P1/P2/outsider/revoked/rejoined QA on independently approved schema, free-tier/performance evidence, out-of-repository admin/service writers and R127 release approval remain **NO_GO**.

The future signed QA acceptance matrix must include same-campaign player/DM/outsider, different-campaign DM and player, revoked member with **fresh authorized requests**, revoked actor with already-issued signed URL (expected unsafe unless a separate approved invalidation design exists), new signed URLs after removal, old joined Realtime sockets, role changes, campaign deletion and DM reinstatement. Do not overstate a test of new authenticated requests as revoking existing bearer capabilities.

**R18-152 is not original policy parity proof. No original or QA SQL writes; no migration changes, frontend runtime changes, new exposed browser grants, merge, production/preview deployment or paid resources.**

Next R18-153: create a fail-closed signed authorization and private SQL review acceptance plan, with operator handoff only for the remaining human-only gates. Never deploy against QA or original without explicitly authorized independent review.
