# R229 — Original PostgreSQL privileged RPC catalog review (NO_GO)

Date: 22 November 2026. Staging-only child of [R228 draft PR #341](https://github.com/xuvenz-source/ttrpgsite/pull/341), exact prior green head `35d6b7dbc94b7b44a1a84d7bd20848dded685c7d` (disposable PG17 `45008972807`, staged repository `45008972896`, both SUCCESS).

## Authorization and data boundary

The owner expressly approved **read-only security review of the 67 authenticated-callable privileged PostgreSQL functions** in the original TTRPG Site Supabase project, forbidding function execution, either database change, raw SQL definition export, merges or deployments. The approved inspection used only `SELECT` queries over `pg_catalog.pg_proc`, `pg_catalog.pg_namespace` and `pg_catalog.pg_roles`, plus PostgreSQL catalog privilege-check built-ins. It evaluated `prosrc` lexically **inside the original DB** and returned only bounded counts/booleans/function names/helper edges in private tool responses, not raw SQL definitions or any application table rows. No original/QA SQL writes, migrations, Auth/campaign/character/Storage record reads, function invocations, real user tokens, merges, deployments or paid resources.

The committed `scripts/release/r229_CURRENT_privileged_rpc_catalog_only.sql` is the reviewed, **catalog-only, one-statement SELECT** returning only aggregate counts. It never selects `prosrc` or `pg_get_functiondef` as a result column and has no database-changing statements. Its source is staged for reproducibility; no CI job connects to either Supabase project or executes it.

## Exact authenticated-callable privileged inventory

The original project's `public` schema has **67 functions** with `SECURITY DEFINER` and effective PostgreSQL `EXECUTE` for `authenticated`. All 67:
- have explicit authenticated `EXECUTE` ACL entries and no effective anonymous function execution;
- are owned by `postgres`, a role with `BYPASSRLS`, so each routine's own authorization predicates and delegated calls are security-critical;
- have a fixed **empty** `search_path`, reducing untrusted-name substitution risk, but this does not itself enforce campaign authorization.

The separately present `forge_visibility` helpers are *not* included in this exact 67 count, though a subset appears in qualified-call paths from public functions and must be reviewed transitively. A direct function EXECUTE grant in a non-usable schema does not itself prove direct SQL callability to `authenticated`.

## Catalog-only lexical risk surface — NOT semantics

- 60/67 contain a direct `auth.uid()` textual marker; seven do not. Six of those seven have statically recognizable calls to other existing helper functions that themselves contain actor identity markers. Across the best-effort qualified-call graph (public and forge_visibility, cycle bounded to depth seven), **66/67** have a direct or reachable actor marker. **One** lacks both.
- 53/67 have a common membership/DM/map helper name in the direct or static call closure, but the absence of such a name need not mean unsafe access; some are direct membership helpers, campaign creation, and actor-owned cleanup.
- 42/67 contain strict INSERT/UPDATE/DELETE/TRUNCATE text patterns; the earlier R208 count of 43 used a *different* lexical matching definition. No change to hosted bodies is established by this lexical difference.
- None of the 67 matched the reviewed dynamic-EXECUTE/format/quote_ident source patterns; a historical dynamic-SQL marker in the 83 private migrations and other schemas remains outside this conclusion.
- One privileged routine contains user-editable Auth metadata words, for **account display labels**. It has direct signed-actor/membership markers. Display use is not evidence that metadata is accepted as an authorization claim; signed negative tests and helper review remain necessary.
- Seven have exception-capture text markers. Catching an exception may be a fail-closed response, a silent failure, or a data problem; source words cannot establish behavior.

**These are bounded static indicators and are NOT a semantic security approval for any of the 67.** Functions can contain dead code/comments, unqualified calls, conditionally bypass guards, stale claims, or unsafe branches. True RPC behavior requires review of each exact body, relevant RLS/table grants and actual signed-user actor states.

## Five priority paths — existing blockers, no duplicated candidate

1. **Fog-publication oracle `is_map_fog_published` — previously reproduced (#212 / R104–R105).** The current privileged authenticated-callable function remains the lone function in this 67-roots catalog closure with no detected direct/delegated `auth.uid` marker. Its source fingerprint is consistent with earlier read-only source observations. Source-exact disposable PostgreSQL17 R105 showed the nonmember fog publication-status leak and a staged, **uninstalled** correction; this does NOT prove hosted behavior is repaired.
2. **Revoked sheet-owner access (#220 / R115 and R198).** Public privileged sheet GET/PATCH wrappers delegate to the internal editor helper. That helper's original source still admits an owner path lacking a current campaign-membership predicate, confirmed by earlier source-exact PG17 synthetic revocation tests. The separately staged R115 patch remains unapplied. An actor's own stale lease release should remain allowed while data reads and mutations after removal are denied.
3. **Removed player reusing unchanged generic invite (#223 / R119–R122).** The current signed-user `join_campaign` function references current actor and member insert/upsert, but no revocation/tombstone text marker. Earlier source-exact disposable PG17 work reproduced rejoin after removal. DM-controlled reinstatement policy and existing invite revocation need an approved forward guard, not an unsupported claim that membership helpers solve invitations.
4. **Stale movement/session authorization (#212 / R208).** Current `advance_world_motion_v2` has actor and row-lock markers, but no direct/common qualified membership/DM/map guard in the scan. This does **not** prove a stale player can advance a world session after removal; it is a targeted signed QA requirement. Cancellation/end/release routines may properly allow a removed actor to clean up only their own held sessions, but never another actor's.
5. **Editable display metadata and account-name exposure (R207).** One routine references editable user metadata and directly checks signed-actor membership. This is a display-label/data-minimization review item, **not evidence** metadata grants campaign membership.

Still open independently: R226/R228 same-campaign relational constraints (#340); five authenticated public-table TRUNCATE grants (#306; existing separate R197 draft #307); privileged membership TRUNCATE/UPDATE (#229); already-issued 3,600-second Storage signed URL lifetime and reissue (#231); all 83 owner-private migration source/chronology semantics (#212).

## What can be concluded / what cannot

**Confirmed:** exact 67 ACL/definer count, owner RLS-bypass, empty function search_path, no anon direct EXECUTE, text marker and qualified-helper topology counts, known open cross-user risks from prior synthetic source-exact tests.

**Not established:** an end-to-end signed user's effective access for each RPC; whether current RLS/role grants/client Data API settings permit specific entrypoints; safe DML under attacker-controlled UUIDs/JSON; correct behavior after DM removal/reinstatement, concurrent movement, stale sessions, shared scene fog or signed URLs; history and rollback/portability of private 83 migrations; authorization to install patches.

**Decision: SECURITY NO_GO.** Do not merge, deploy, create paid resources, install migrations on original/QA, run functions, or claim signed DM/P1/P2/removed/outsider acceptance. This review closes **only the current 67-routine catalog census**, not the per-function semantic approval gate. Next authorization boundary remains private-history semantic review or a separately approved isolated QA-only install/rollback and signed-user test plan; generic `Proceed` never grants it.

PostgreSQL 17 reference: https://www.postgresql.org/docs/17/sql-createfunction.html
