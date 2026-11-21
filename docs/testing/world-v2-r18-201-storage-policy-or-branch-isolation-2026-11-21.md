# B10-R18-201 — Anonymous live Storage policy branches, OR isolation (NO_GO)

21 November 2026. Exact source-only child of [R200 draft PR #310](https://github.com/xuvenz-source/ttrpgsite/pull/310), pinned `83feb12629e2ce92e7114a49ab17b28a6c04e9b0`, with **2/2 successful exact-head GitHub Actions** (fictional private original 83-file policy audit `44905133304` and general staged app/build/Edge `44905133290`). No hosted writes, runtime changes, active migrations, merges, deploys or paid resources.

## Source of truth

Owner's R200 **3,183-byte sanitized JSON**, SHA-256 `4d9f09d70ff13208700e4428b33910039029a4ac2d823c429bcce0ff500c2b53`, passed independent exact 53-key schema/type/no-leak validation. **83/83** original migration files SHA-verified and chronology unique; prior R198/R193 source parity rechecked. Exactly **one** original SQL SECURITY DEFINER map-visibility helper definition at R111 priority docket index **29**, statement **12**, original SHA-256 and 448-byte length matching current live `can_view_campaign_map`. Historical direct `storage.objects` policy events: **10 CREATE + 0 ALTER + 2 DROP = 12**, last at R111 priority docket **50**, SQL statement **75**. These are priority-sorted indexes, **not migration chronology**. No original SQL, private source/policy names, bucket/object paths, tokens or user data exported. **10 minus 2 matching 8 current total live policies numerically is not proof of current policy identity**.

Original `storage.objects` has RLS, three private buckets, **eight total policies**, **three SELECT-applicable policies—all permissive** and all applying to authenticated, none anon. Current `can_view_campaign_map` is SQL SECURITY DEFINER, 448-byte body SHA-256 `835829ca8012fe26ae5d224df749a1a8cde958136c322d10f3d3fa91a5f3f83c`, direct membership/auth identity/player-map lexical markers, not a full authorization review.

R201 recorded a new **SELECT-only**, reproducible original catalog query `scripts/release/r201_readonly_storage_policy_branch_matrix.sql` returning **anonymous SHA-sorted ordinal slots and booleans only**. It reads `pg_get_expr(polqual)` only *inside* PostgreSQL to compute markers and never outputs expression SQL, policy/bucket names, object paths, authenticated user identities or URLs.

| Anonymous slot | Authentication / permissions | Bucket/path | Direct identity | Member helper | Owner marker | Explicit AND/OR words |
|---|---|---|---|---|---|---|
| 1 | Authenticated, PERMISSIVE | Both | No direct `auth.uid()` | `can_view_campaign_map` | No | AND only |
| 2 | Authenticated, PERMISSIVE | Both | `auth.uid()` | None | Yes | **AND and OR** |
| 3 | Authenticated, PERMISSIVE | Both | `auth.uid()` | None | No | AND only |

Every branch has an explicit USING expression, a bucket marker and a path marker, with no `TRUE` or user-editable Auth metadata markers. All three have no direct `campaign_members` text. The second branch's presence of **both AND and OR** is a key structural risk to investigate: without checking *exact parentheses and scope* we cannot establish that its bucket check and owner/current-user conditions apply to **every OR arm**. This is **not an assertion of an exploitable hosted policy flaw**. Personal-asset policies may legitimately continue granting access to personally owned art after campaign removal; a blanket restrictive membership rule over all Storage would be incorrect.

## Independent representative PostgreSQL17 test

New `tests/world-v2-r18-201-postgres/run.sh` starts only in GitHub Actions with explicit `R201_ISOLATED=yes`, loopback `127.0.0.1`, unique disposable DB/user/password and rejection of hosted connection overrides. It creates **three fictional PERMISSIVE SELECT policies** on an invented `storage.objects` table and fabricated map/member/users/object assets. Its policies are deliberately *NOT copied from the original hosted Storage SQL*. It proves:

- A synthetic currently active campaign DM can read the fictional map while a removed member, outsider and null actor cannot.
- The removed synthetic member can still read **their own independent artwork and user-profile path**. An outsider cannot.
- In an immediate-rollback *negative test*, an intentionally misplaced `OR` in the personal-owner policy permits the removed actor to see a fictional campaign map **despite the map helper's current-membership denial**, illustrating PostgreSQL's permissive OR/parenthesization risk.
- `ROLLBACK` restores the bucket-scoped good policy and revocation denial; no original/QA database accessed, no real signed Storage bearer issued or revoked.

This does **not** prove that original live policy slot 2 contains that flawed parentheses, nor that any existing bearer link was used. It demonstrates why anonymous word markers cannot authorize release.

## Strict source and release gates

R201 source-only SHA validator pins the R200 sanitized receipt checksum and count fields, live current anonymous 3-slot marker matrix, current known 448-byte map helper hash and exact Git blobs for read-only catalog query and isolated PG17 runner. Synthetic adversarial tests reject altered slot/role/bucket/OR flags, changed source bytes, historical report drift, false exploit claims, unauthorized QA/prod GO and inadvertent policy source/name/token exports. The dedicated GitHub Actions job rejects any diffs in `src/`, `supabase/migrations/`, `supabase/functions/` or Vercel config and runs scratch PG17 only after the source gate passes.

**Still NO_GO:** Actual original policy SQL boolean semantics and bucket isolation, user-owned vs campaign-owned object protection, server-side denial of new signed URL issuance after DM removal, handling of already-issued one-hour bearers (which local cache clear and Auth key rotation do not revoke), all **83 historical migration semantics**, all **67 privileged call chains**, real signed DM/P1/P2/removed/outsider multi-window QA, verified QA-only authorization and separate production approval. Issues #231 (Storage), #220 (revoked sheets), #223 (invite reuse), #229/#306 (TRUNCATE), #212 (fog) remain open.

No further owner-private original SQL upload is required for R201. Do not install any Storage/RLS changes, merge or deploy from this step.
