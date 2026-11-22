# R226 — Cross-campaign token/map/character referential integrity (NO_GO)

Date: 22 November 2026. Staging-only child of R225 draft PR #337, exact parent `7087467faf9105830b4ad3b230bd7476955ac217` (focused signing-source and full staged repository CI 2/2 success). No deployed frontend, active `supabase/migrations`, original/QA database, Edge Function, credentials, or paid infra changes.

## Live read-only catalog basis, NOT original SQL export

During the separately approved **metadata-only** inspection of the original TTRPG Site Supabase project, the live `public.map_tokens` player INSERT RLS definition included a self-comparison of the referenced character's campaign identifier. A self-comparison is tautological for non-null campaigns, not a comparison against the token's campaign. The current relational constraints have individual `map_tokens.campaign_id`, `map_tokens.map_id`, and `map_tokens.character_id` foreign keys, but **do not enforce composite (campaign_id,map_id) or (campaign_id,character_id) equality**. `public.battle_maps` already advertises a unique (campaign_id,id) reference key, whereas `public.characters` only has id PRIMARY KEY. Other helper predicates may partially mitigate an individual write; no signed hostile role exploit or existing corrupt row has been demonstrated, and no application/character/Storage rows were read.

A related `campaigns.active_map_id` single-column FK can reference a map by ID without the row's campaign ID. R226 isolates that mismatch in a **fictional PG17 fixture**; broader parent table remediation still requires separate dependency review.

## Proposed source-only first stage

`staging/world-v2-b10-r18-226-cross-campaign-integrity/unapplied-composite-campaign-keys.sql` is an independently authored **UNAPPLIED DDL CANDIDATE** and **NOT A VERSIONED MIGRATION**. It adds a required character composite uniqueness constraint and two `NOT VALID` composite foreign keys to `map_tokens` so future token writes cannot point at a character or map in a different campaign. The optional character link uses PostgreSQL17 `ON DELETE SET NULL (character_id)` to preserve campaign_id when a character is removed. The map link uses ON DELETE CASCADE conceptually consistent with the existing map-id FK. The candidate leaves existing policies, other CRUD permissions, ownership and RLS unchanged.

**Crucial limitations:** Adding uniqueness can scan or lock live data and may disrupt existing traffic; new `NOT VALID` foreign keys enforce **new writes only**, not historic rows. The candidate intentionally has **no** `VALIDATE CONSTRAINT`; historical mismatches must be audited privately, repaired under an independently approved plan, and only then validated. The live self-comparison is still present after this candidate and must be replaced by an exact reviewed forward policy with the correct campaign equality, without copying raw live SQL into Git. The wider map/character RPC write graph and DM NPC, sheet and map moves require validation before any live DDL.

## Disposable PG17 negative and positive controls

`tests/world-v2-r18-226-postgres/fictional-tenant-fixture.sql` defines **invented** two campaigns, two maps, two owned characters and fictional signed actor IDs, with an intentionally unsafe synthetic player INSERT policy that models the self-comparison **structural mistake** (not a verbatim live policy). In isolated PG17 only, `run.sh`:
- proves an authenticated fake member can link their character from Campaign A to their token in Campaign B when only separate single-column FKs exist;
- proves a fictional admin pointing Campaign A's active-map ID at Campaign B's map can make a fake player token reference an out-of-campaign map without a composite FK;
- proves an unrelated actor is denied even in the unsafe model, distinguishing a real guard from a total lack of RLS;
- applies the proposed composite FK candidate **only to the temporary PostgreSQL 17 service**, then verifies both wrong-campaign writes fail with FK SQLSTATE `23503`, while same-campaign player writes and legitimate DM tokens without a character succeed;
- checks that deleting a character nulls **only** character_id, not campaign_id, and the new FKs remain `NOT VALID` until an separately approved validation.
All negative/positive synthetic DML is inside ROLLBACK. No user data, production schema, private 83-migration SQL or Auth tokens are imported into CI.

The runner requires GitHub Actions, exact local PGHOST=127.0.0.1, disposable PGDATABASE and fake password, disallows production/Supabase connection override variables, and aborts unless PostgreSQL server major version is 17. Dedicated workflow enforces exactly five R226 changed files; general repository CI must independently pass on the same final head.

## Separate release blockers and manual boundary

Issue #306 already has a **complete, unmerged** five-table authenticated TRUNCATE revocation proposal in [R197 draft PR #307](https://github.com/xuvenz-source/ttrpgsite/pull/307), with real disposable PostgreSQL17 source tests. R226 deliberately does **not** duplicate it. A source-only fix is **not yet a release repair**.

Original 83 private migration semantics, 67 authenticated-callable privileged function paths, 3,600-second previously issued signed bearer URLs, signed DM/P1/P2/removed/outsider QA, original issues #212/#220/#223/#229/#231/#306, and cross-campaign historical data integrity remain NO_GO. No merge, QA schema bootstrapping, production SQL, deploy or cost authorized.

**No owner WSL action for R226.** Before actual QA work the owner must explicitly authorize a specific backup/rollback-safe $0 isolated QA schema plan, after private migration review and an independently reviewed exact target. The prior read-only Storage metadata approval does not authorize this DDL candidate for either project.

PostgreSQL17 reference: https://www.postgresql.org/docs/17/ddl-constraints.html (composite FKs and column-targeted ON DELETE SET NULL).
