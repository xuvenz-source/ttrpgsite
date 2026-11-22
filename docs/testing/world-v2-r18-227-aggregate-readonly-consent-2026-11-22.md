# R227 — Owner consent gate for read-only aggregate cross-campaign data preflight (NO_GO)

22 November 2026. This is a **source-only proposal**, child of R226 [draft PR #338](https://github.com/xuvenz-source/ttrpgsite/pull/338) exact green head `0d430b38c6d1ec1566fff68a9caee85aca0c6bd9`; R226's synthetic 17 PG foreign-key workflow `44994013315` and general repository `44994013290` passed at this exact head after two deliberately fixed fictional test-fixture errors. R226 remains draft/unmerged/unapplied. R197 draft PR #307 already covers five authenticated TRUNCATE grants, so no duplicate patch.

## Why a new approval is required

Owner's prior approval covered **original TTRPG Site Storage/RLS metadata only**, not the content of any `public.map_tokens`, `public.battle_maps`, `public.characters`, or `public.campaigns` rows. The R226 synthetic PG17 test demonstrated that adding narrow composite FKs can prevent new inconsistent links. However, the draft includes `NOT VALID` constraints, so historic mismatches are still possible, and R226 source-only tests cannot establish how many original records would need legitimate repair. The correct next step requires separate consent even for **aggregate-only SELECTs**, because computing an aggregate necessarily reads live application rows.

The exact, **unexecuted** `scripts/release/r227_PROPOSED_readonly_original_aggregate_only.sql` selects only four numerical results:
1. Total number of token rows, to identify denominator.
2. Number of tokens whose referenced map's campaign differs from the token's campaign.
3. Number of tokens with a non-null character whose referenced character's campaign differs from the token's campaign.
4. Number of campaigns whose active-map ID resolves to a map in a different campaign.

The SQL intentionally returns **no** campaign/character/map/token identifiers, names, coordinates, ownership, raw JSON, JWTs, bucket paths, signed URLs or rows. It has one pure `WITH ... SELECT` statement; no `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `CREATE`, `DROP`, `DO`, `CALL`, or `TRUNCATE`. It does not make user data public, but the aggregate counts are still private original-project facts; do not publish even these values unnecessarily.

This query is **NOT executed in CI against Supabase**. It is presently only exercised in `tests/world-v2-r18-227-postgres/fictional-records.sql` and `run.sh` against an **entirely disposable PostgreSQL17 instance**, seeded with five invented token rows and no real secrets. The regression result must be exactly `5|2|2|1`, and the runner must verify the source fixture remains unchanged. The workflow denies any `src/`, Supabase migration/Edge, Vercel, dependency or deployment edits, and requires exactly five narrow review files.

## Proposed separately authorized manual boundary

Owner may reply with this explicit scope (no dashboard, terminal or project secret is required):

> I authorize one read-only, aggregate-only cross-campaign integrity SELECT on the original TTRPG Site Supabase project, using only the exact R227 approved query. Return only four numeric counts. Do not export any records, modify either database, install migrations, merge or deploy.

Once the owner gives that approval, a new assistant turn can use the already connected Supabase project carefully and run only the exact query, returning only the four numeric totals. It must not broaden to Auth/user data, other SQL, raw query outputs or personally identifying data. It must not touch the separate Tabletop Forge QA project. Even if the mismatch counts are zero, **do not automatically install R226**: forward migration still requires private 83-file semantic review, additional migration-specific source review, no data-dependency conflicts, a precise $0 isolated QA target, rollback planning and separate explicit installation approval.

**Nothing has been executed against the original/QA database by R227.** The master gates #212/#220/#223/#229/#231/#306, original 83 migration reviews, 67 privileged callable function chains, already-issued Storage bearer URLs and signed DM/P1/P2/removed/outsider QA remain NO_GO.
