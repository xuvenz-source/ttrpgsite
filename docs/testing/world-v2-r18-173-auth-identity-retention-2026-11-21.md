# B10-R18-173 — Experimental Auth-user deletion ledger cleanup

**21 November 2026.** Exact child of [R18-172 draft PR #281](https://github.com/xuvenz-source/ttrpgsite/pull/281), commit `55ac87f0a82ca984bef63347693750a1d020962c`. **NO_GO.** R172 disposable PostgreSQL17 first demonstrated that deleting a synthetic Auth user cascades membership but retains a revocation tombstone containing the deleted user UUID.

## Narrow experimental candidate

In a **synthetic** database with `auth.users` and the original-shaped member/owner cascades, this candidate:

1. Adds `campaign_member_revocations.user_id REFERENCES auth.users(id) ON DELETE CASCADE`. Existing tombstones for a deleted user therefore disappear when their Auth row is removed.
2. Replaces only the synthetic R120 deletion-stamping trigger function. If the campaign no longer exists (campaign cascade) or the `auth.users` identity no longer exists (Auth cascade), skip stamping; otherwise continue recording a deliberate DM/member removal.
3. Keeps R122 identity-key, R148 TRUNCATE/role mutation and R150 service-role INSERT restrictions unchanged. No new ordinary function EXECUTE permissions.

The source-local, isolated PostgreSQL17 job checks old invite rejection while P1 is actively DM-removed, Auth deletion of already-revoked P1 clears existing tombstone, Auth-only member cascade of P2 creates no tombstone, unrelated campaign state is unaffected by DM owner Auth deletion, and the previously denied service_role writes remain denied.

These are **proposed retention semantics**, not proof of GDPR/privacy compliance. Adding FK relationships to Supabase-managed `auth.users` needs a separately reviewed QA replay, lock/performance consideration and confirmation that orphaned historical revocation rows will not block a forward migration. Deleting an Auth user cannot establish a permanent ban against any future account with different identity. Existing #220/#212 and #223/#229/#231 still block release, along with #218 inventory identifier problems.

No original SQL history edited, no hosted QA or production writes, no runtime changes, no merge/deploy or paid infrastructure. The AI lead is sole technical reviewer; owner separately approves QA installation and R127 production decision.
