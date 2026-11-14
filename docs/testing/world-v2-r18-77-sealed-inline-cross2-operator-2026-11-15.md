# B10-R18-77 — Source-sealed, reversible inlined ray candidate (NO DEPLOY)

**15 November 2026 · DRAFT / NO-DEPLOY · exact parent R18-76 PR #178, SHA b611513396f0f42293cff3e724c10a4e157f2bd8**

## Decision and scope

R18-75 and R18-76 found that removing individual SQL `forge_visibility.cross2` helper calls from the original private `ray_blocked` loop while retaining the exact cross-product arithmetic produced substantially lower **local, instrumented PostgreSQL 17 processing time** in synthetic mixed wall-and-light scenes. R18-76 corrected the earlier source-first warm-order bias using a symmetric ABBA/BAAB sequence and passed 15,744 direct original/inline ray parity checks, 656 full private-frame matches, 16 torch/light matches and explicit revocation denial. Those results make a **reviewable opt-in candidate** reasonable; they do **not** prove user-visible movement improvement or authorize installing it.

This step creates two **unversioned, standalone, operator-gated SQL scripts in `supabase/candidates/`**, with a matching source-real disposable 91-history PostgreSQL rehearsal. Neither SQL file is a migration, and nothing in this PR is ever invoked by deployed application code. No live Supabase SQL write, frontend/Vercel release, token collision change, fog privilege change, setting change or grant is made.

## Strictly bounded change

`supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql` derives the proposed definition from the exact PostgreSQL-catalog source for:

`forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)`

It requires the original source digest **a9fc198168c29fd5d80041b05337017e** and original `cross2` digest **65c4bff8aaa6ecf38e335a44e95d874e**, `wall_passes` digest **5c52255db93f2a9ed892e684dd11f898**, `is_lit` digest **cec916b326a14937ceee2e170619cca2** and exactly one of the two already reviewed original/R18-57 private fog-frame digests. Exactly four individual `cross2` call-site source strings must occur once each; only those strings become inline `double precision` arithmetic with **matching original operand order**. Conditional walls, side selection, door/window state, one-way lighting, malformed fail-closed geometry and 120-object limit are left verbatim. The helper function `cross2` itself remains unchanged.

The source-original function is verified as postgres-owned, STABLE, `SECURITY INVOKER`, `PARALLEL UNSAFE`, exactly one default argument, exact `search_path=""`, PostgreSQL `plpgsql` language, and **NULL implicit function ACL**. Importantly, the original function is *not* SECURITY DEFINER or explicitly granted to application roles. Both `anon` and `authenticated` must lack USAGE on the private `forge_visibility` schema and may not execute the protected fog frame. Operator function source, PostgreSQL ownership, ACL, search path and safety settings are rechecked after the atomic DDL. Any mismatch causes a raised exception that **rolls back the whole DO statement**.

Both scripts require an authenticated `postgres` database operator, correct database name, an explicit **transaction-local authorization value**, and a verified exact **91-migration state** with the reviewed eight R18-48 versions and final history version `20261113024116`. The current linked project historically showed **83** migrations; it has *not* passed the official signed 83+8 CLI rehearsal. Therefore the candidate **cannot be approved for installation today**.

## Rollback

`supabase/candidates/world_v2_r18_77_inline_cross2_ray_rollback.sql` uses a **different rollback-only transaction-local authorization**. It refuses a missing, changed, partially installed, already rolled-back or unrecognized candidate. Instead of shipping a potentially stale hand-written function body, it reverses the four exact inline expressions, proves the result has the original MD5, then re-applies the four forward transformations and requires a byte-for-byte match of the candidate's reviewed source text. Function identity and all privilege/owner/security settings must remain unchanged. Only that exact sealed transform is eligible for inverse restoration. The rollback restores the original catalog function definition and validates the original MD5 and every permission property, without modifying a table, grant, RLS policy, migration ledger, movement procedure or application setting.

If the installed source has drifted from the verified candidate, **the rollback intentionally refuses to overwrite it**. The correct response is a separate forensic review and independently approved recovery, not relaxing the checks. A transaction must not commit on any error.

## Disposable source-real operator rehearsal

`tests/world-v2-b10-postgres/r77-operator-sealed-inline-cross2-rehearsal.sql` is included after R18-76's complete source restoration and before the original R18-57 signed Commit/collision/revocation/rollback. It exercises **these actual two operator SQL files**, not a simulated clone.

The rehearsal must prove all of the following before engineering PASS:

- Rejected install without its exact GUC, with missing R18-48 history, with drifted original ray function properties, and on second installation. Every negative attempt has its own PostgreSQL SAVEPOINT.
- Successful install with exact source, role, owner, schema USAGE restriction, function ACL, volatility, search path, and original unchanged `cross2` helper.
- **15,744/15,744** exact direct ray comparisons and **656/656** complete original-versus-candidate private fog JSONB frames across 41 mixed/hostile/conditional/near-epsilon scenes. **16/16** equipped torch+authored light private frames, plus both authorized wrappers denying a revoked viewer.
- Wrong rollback GUC and source-drift rollback both refused; valid independent rollback restores the exact original source and ACL; second rollback refused.
- Every candidate, torch, role, map and exploration test mutation is rolled back by the dedicated rehearsal SAVEPOINT before existing R18-57 signed movement/collision/negative tests and original outer transaction ROLLBACK.

The fixture is an invented synthetic 91-history **test database**, not evidence of a real authenticated CLI rehearsal. The original source remains installed in production. CI logs contain only test outcomes and aggregate data, no private sight cells, player identities or author-authored geometry. Static tests also guard the scripts' placement, exact history, source anchors, privilege invariants, failure gates and containment.

## Operator release process — NOT YET AUTHORIZED

Even once CI passes, **do not install** this candidate through the Supabase MCP API, SQL editor, CLI, migrations or any automated production deploy. If an independently approved release window is eventually authorized, separately review the linked official pinned Supabase CLI history/fetch/list/`db push --dry-run`, 83+8 exact migration bodies and pending steps, signed DM/P1/passive P2 visibility and movement checks, browser input-to-commit p95, Free-tier RAM/locks and explicit operator approval.

Only after those gates pass, a reviewed DB operator can use a **transactional and explicitly authorized** candidate application; the separately guarded rollback is the inverse. The candidate and rollback require different transaction-local `forge.r18_77_release_authorization` values, and a failed DO must cause a transaction rollback rather than a partially completed application. This document does **not** approve or schedule that transaction.

**R18-77 production decision: NO-GO.**
