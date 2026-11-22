# R228 — Same-campaign active-map relationship (source-only / NO_GO)

22 November 2026. Exact staging-only child of [R227 draft PR #339](https://github.com/xuvenz-source/ttrpgsite/pull/339) at commit `c323ab3dc10b9aa837434463e1575acc1ed95cf8`; R227's disposable PG17 aggregate `44994207003` and full staged repository checks `44994207048` succeeded. The owner separately authorized a single original read-only R227 aggregate and its one retry, which reported no mismatched token→map, token→character or campaign→active-map references at that moment. This does **not** authorize additional original queries or any SQL writes. Do not export raw original records, IDs, private historical SQL or the aggregate counts to public logs.

## Metadata-level integrity gap and candidate

Existing `public.campaigns.active_map_id` has a single-column FK referencing `public.battle_maps(id)`, which checks map existence but not that a given map belongs to the campaign referencing it. Existing `battle_maps(campaign_id,id)` is unique. A separately authorized read-only review showed the definition-level gap, not a signed-user exploit.

`staging/world-v2-b10-r18-228-active-map-integrity/unapplied-active-map-composite-fk.sql` is **independently authored, UNAPPLIED and NOT a real migration**. It adds a `NOT VALID` composite FK from `public.campaigns(id,active_map_id)` to `public.battle_maps(campaign_id,id)`. PostgreSQL 17 supports `ON DELETE SET NULL (active_map_id)`: deleting a referenced map clears only the nullable active_map pointer, never the campaign's primary key `id`. A new FK would cover **new writes and updates** while historical rows remain unvalidated. There are **no** changes to original policies, auth, grants, movement, actual map content or old migrations.

## Isolated proof

The companion `tests/world-v2-r18-228-postgres/run.sh` uses only R226's made-up two-campaign PG17 fixture on an isolated loopback GitHub Actions service. It first applies the **staged R226 candidate only to the fictional fixture** to test compatibility. A wrong-campaign active-map assignment succeeds against the synthetic legacy one-column FK; after the R228 candidate it must fail with SQLSTATE `23503`. Same-campaign active-map and explicit NULL updates succeed; map deletion clears exactly the active-map pointer without changing the campaign ID or another campaign. An independently signed-mock player token INSERT still succeeds with the R226 FKs. Both new FKs are left `NOT VALID`. The executable refuses any non-GitHub-runner, non-loopback host, alternate database/password, or Supabase credential/connection override. No user/project data, SQL histories or actual bearer URLs are used in CI.

Official documentation: [PostgreSQL 17 foreign keys and column-specific SET NULL](https://www.postgresql.org/docs/17/ddl-constraints.html).

## Remaining release boundary

R226 and R228 are complementary **draft** NOT VALID FKs, not an integrated release-safe migration. A future install still needs the entire historical 83-file semantic/portability review, reconciliation of 67 privileged functions, exact RLS player INSERT rewrite to remove a self-comparison, future SQL migration conflict/trigger ordering review, app movement/editor/DM/NPC compatibility, data repair strategy, lock timing/resource budget, and verified $0 QA target with rollback. R227 found no aggregate mismatches at one point in time; that result may change before installation and is not a transactional validation.

Existing R197 [draft PR #307](https://github.com/xuvenz-source/ttrpgsite/pull/307) covers distinct authenticated TRUNCATE privilege removal; do not duplicate. Security issues #212/#220/#223/#229/#231/#306/#340 and server-side signed URL expiration/access remain NO_GO. **Zero original/QA SQL executions, changes, merges, deployments or paid resources in R228.**

Next recommended source-only stage: isolate a synthetic RLS policy-level campaign-binding guard for character token placement, independent of FK presence; avoid copying the original SQL policy body to GitHub.
