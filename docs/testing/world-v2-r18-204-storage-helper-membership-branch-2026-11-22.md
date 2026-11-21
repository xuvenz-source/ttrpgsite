# B10-R18-204 — Current map-visibility helper nested role OR, Storage operation markers, synthetic revoked access (NO_GO)

22 November 2026. Exact source-only child of [R203 draft PR #313](https://github.com/xuvenz-source/ttrpgsite/pull/313), head `f70e1528921353dd5c211d23db833d353d652e55`, focused and standard CI 2/2 SUCCESS: `44907900317`, `44907900208`. No original/QA SQL writes, live application/Edge changes, active migrations, merge, deploy or paid services.

## Confirmed current original Storage bucket guard, not full authorization

R203 used **read-only** anonymous `pg_policy.polqual` root argument inspection in the original project: all **three** Storage SELECT policies are authenticated-only, permissive, and each has a **separate first top-level AND child** comparing the known `bucket_id` column by an equality operator to a constant; the three bucket values differ. The sole nested OR is in a **later** child of the middle policy. No bucket names, object paths, exact original policy SQL, AST text, actor identities, user records or Storage signed URLs were exported. A disposable PG17 regression rejects a deliberately weakened OR in the bucket factor. This substantially reduces the specific cross-bucket missing-root-guard risk but **does not prove per-bucket permission correctness**.

## New live helper source structure without exporting SQL

`scripts/release/r204_readonly_map_helper_or_depth.sql` performs a `SELECT` over the known original `public.can_view_campaign_map` `pg_proc.prosrc`, computing **only fixed numeric counts/hashes, parenthesis depth and boolean markers inside PostgreSQL**. The actual helper SQL body, function signature and caller records remain private.

| Original live source observation | Value |
|---|---|
| `can_view_campaign_map` overload | 1 |
| SQL body UTF-8 bytes / SHA-256 | 448 / `835829ca8012fe26ae5d224df749a1a8cde958136c322d10f3d3fa91a5f3f83c` |
| Function privileges | postgres-owned SECURITY DEFINER, authenticated EXECUTE, anon denied |
| Text word counts | 1 EXISTS, 1 OR, 5 AND, 1 campaign_members, 1 campaign_player_maps |
| Direct `auth.uid()` calls | 2 |
| OR text offset and parenthesis depth | 393 / depth 2 |
| EXISTS, membership and player-map references | depths 0, 1 and 1 |
| First and second identity call depths | 0 and 1 |
| Membership/player-map text references before OR | Yes |
| User-editable metadata marker | Absent |

The OR inside a deeper parenthesis is **consistent with** the member requirement enclosing the DM/assigned-player alternative. But SQL string parenthesis depths are **not a parsed/executed SQL authorization graph**. A secure actual guarantee requires exact current SQL semantics review and/or real signed-actor behavior, neither provided by this source-only work.

A second reproducible original **SELECT-only** query, `scripts/release/r204_readonly_storage_operation_markers.sql`, finds three `storage.objects` SELECT-applicable policies. None contains `storage.allow_only_operation`, `storage.allow_any_operation`, explicit object-list, authenticated-download or signing-operation word markers; one references `storage.foldername`, one `owner_id`, two `auth.uid()` and one `can_view_campaign_map`. Thus **no explicit operation-specific distinction is visible lexically** in these three current SQL predicates. This does *not* establish how the Supabase Storage service actually applies RLS for list/download/sign operations. [Supabase Storage private bucket docs](https://supabase.com/docs/guides/storage/buckets/fundamentals) describe authorization-governed private download and signed-URL issuance; actual implementation/permissions and signed acceptance still require testing.

## Source-only PG17 adversarial authorization fixture

The new loopback-only GitHub Actions PostgreSQL17 runner reuses the **unchanged R201/R202/R203** synthetic fixture and strict bucket-scope tests. It creates only fabricated campaigns/members/role assignments and a synthetic `SECURITY DEFINER` SQL map-view helper, **not copied from current original function SQL**. In this invented fixture, a DM can view their map; a current assigned player can view theirs; a **removed owner with a stale assignment** is denied because current membership encloses the DM/assignment OR; outsider, null actor and cross-campaign requests are denied.

A **deliberately insecure synthetic** `CREATE OR REPLACE FUNCTION` moves stale assignment OR outside the membership EXISTS. It allows the revoked fake player to see a fake map, then **ROLLBACK** restores current membership enforcement and legitimate DM access. This is a reproducible class-of-bug test, **not a claim the live helper makes this mistake**.

R204 source validator SHA-pins both original read-only SQL queries, unchanged R203 scratch runner and R204 runner, and exact source fingerprint/parenthesis/operation evidence. Adversarial tests reject changed code bytes, lexical branch drift, stolen approval flags, unsafe QA/production assumptions and accidental private SQL exposure.

## Future signed QA acceptance gates — not yet authorized or executed

Real QA must test DM, active assigned Player 1, unassigned Player 2, removed former member, outsider, anonymous and other-campaign identities across campaign-map visibility, profile/personal assets and **fresh `createSignedUrl` requests** after revocation. It must separately check **already-issued bearer URLs after removal and through expiry**, because a browser cache clear or Auth JWT key rotation does not revoke those one-hour tokens. Validate disconnect/reconnect and ownership/permission changes without race-driven signing reissue. Until QA schema has been independently reviewed and explicitly approved for isolated installation, **do not run signed hosted tests requiring mutations**.

## Hard release boundary

Full original historical **83 migration semantic** reviews, **67 authenticated-callable privileged function** authorization call graphs, actual signed multi-user QA, current exact helper boolean semantics and Storage service operational behavior remain unapproved. Security issues #231/#220/#223/#229/#306/#212 remain open. **NO_GO** for QA SQL, original/production deployment, merging any staged source, application runtime or Edge migration changes. Owner WSL action not needed for R204; private source must stay private.
