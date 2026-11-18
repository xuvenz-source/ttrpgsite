# B10-R18-115 — Inventory lease and revocation authorization preflight

**18 November 2026 | DRAFT, unmerged, isolated source-only.** Direct parent R18-114 PR #217, head `05532c1830dd0931c974920708424e667b2481e8`. The original Supabase database has 83 registered migrations. Separate QA has zero migrations and no application tables. Never operate SQL outside disposable GitHub Actions PostgreSQL17 in this work package.

## Purpose / evidence boundaries

R18-114 proved the existing inventory reader unnecessarily regenerated valid UUIDs and tested an **unapplied** one-regex correction in disposable PG17. R18-115 examines whether the item collaboration lease protocol remains safe across simultaneous active leases, ownership transfers, expiration, source permission changes and campaign removal.

A read-only original `pg_proc` metadata check pinned the current `claim_campaign_sheet_item`, `release_campaign_sheet_item`, `mutate_campaign_sheet_item`, and `can_edit_campaign_sheet` function lengths/MD5, postgres ownership, empty configured search_path, and authenticated/anonymous EXECUTE permissions. No source function text, production rows, secrets or private SQL was returned from original.

The existing **Git-tracked** historical SQL is the sole fixture source. The R115 extractor refuses to run unless the three lease bodies match exact read-only live MD5/byte lengths. The membership helper was already matched to current live in R114. No 83-body private Ubuntu history is read or installed.

## Lease and revocation test plan

The R115 workflow runs the entire R114 source-exact original getter reproduction and scratch-only UUID candidate, 38 sheet and 25 movement scenarios, then creates the original lease table constraints in a disposable PostgreSQL17 service.

**Baseline synthetic cases:** P1 and DM hold two different item leases, and their interleaved updates preserve both items. Wrong user cannot claim or release, another actor cannot steal a held lease without DM takeover, explicit DM takeover invalidates the former holder's mutation, expired claims can be reacquired and expired mutations fail, crafted `_inventoryId` payload injection fails, and cross-campaign character access is denied. These are **interleaved operations**, not a timing/performance/concurrent-transaction stress test.

**Critical revocation hypothesis (to prove before any release claim):** The original `can_edit_campaign_sheet` source allows a direct character owner via `c.user_id=actor` without a campaign-membership predicate. In a synthetic fixture that removes P1's `campaign_members` row but leaves character ownership assigned, the original source is expected to permit claim, GET and PATCH. A protected SECURITY DEFINER caller then bypasses direct table RLS. This would be a cross-campaign *revocation* authorization failure, distinct from R18-114's UUID churn.

The **separate, unapplied R18-115 candidate** `staging/world-v2-b10-r18-115-revocation-guard/unapplied-campaign-membership-required.sql` changes one helper precondition to require a current campaign membership row for the actor. It is NOT a versioned migration. Its exact DDL is checked against the current Git source by Node tests; all other logic and restricted EXECUTE grants remain intact. The scratch-only candidate must reject the removed user's claim/GET/mutate/PATCH, allow the removed user to release an existing lease for cleanup, retain DM editing and cross-campaign denial, and allow a properly rejoined player to resume access.

## Deployment safety and rollback plan — NOT AUTHORIZED

Both R18-114 and R18-115 candidates remain distinct source-only patches. Historical `supabase/migrations` files MUST NOT be edited to rewrite already-applied history. Any future release must:
1. Complete trusted 83-file historical SQL security review and independent operator-authenticated source attestation; verify isolated QA-only target, approved schema bootstrap and freeze source fingerprints.
2. Have independent reviewer confirm source ownership, live function MD5s, ACL, search_path, row count, activity/lock exposure, dependent RPCs and custom campaign removal behavior. An unknown runtime trigger or business rule may require a different fix.
3. Create a **new, reviewed** release migration through the approved CLI workflow only after authorized, with explicit target verification. Never apply these scratch candidate files to original or QA as part of R115.
4. Run QA signed DM/P1/P2/outsider negative tests, rejoin/removal, lease takeover/expiry, item IDs across repeated reads, collaboration and data-integrity checks. Include NPC token/template and character inventories, 18-second leases, reconnections and stale references.
5. Verify rollback uses a **reviewed safe function version**, not the original buggy UUID checker or the revoked-owner helper. No automatic rollback to known-vulnerable code. Back up affected data before any potentially destructive operation.
6. Keep R18-104 confirmed fog-status cross-campaign metadata oracle as an independent blocker. The remaining 67 public authenticated privileged RPCs require source and negative signed-hosted tests, plus free-tier performance/lock/load acceptance.

**No production or QA SQL change, no merge, no Vercel deployment, no paid infrastructure. Historical SQL and signed hosted tests: NO_GO.**
