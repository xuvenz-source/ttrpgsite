# B10-R18-72 — Isolated, frame-local plain-solid-wall ray cost probe

**14 November 2026 · DRAFT / NO-DEPLOY / test-only PostgreSQL 17.** Exact parent is R18-71 PR #173 SHA \`12f631911805e36aa1e96eb9ad9a0006afa7c1da\`; release remains **NO-GO**. No runtime code, reviewed migration, public grant, live Supabase data or Vercel setting is changed.

## Evidence and hypothesis

R18-70 recorded **782** remaining \`forge_visibility.ray_blocked\` calls for eight protected frames on the sealed R18-57 fastpath in a 24-wall fixture. R18-71 found that the fixture has three copies each of eight identical simple solid walls. In separate PostgreSQL runners, the mean instrumented ray self-time for 24 repeated objects versus eight unique objects was **60.091 → 30.804 ms** and **41.628 → 19.539 ms**, despite the same **782 ray calls**. That is diagnostic evidence of traversal/JSON processing cost in this fixture, *not* evidence that production-authored walls are redundant or that actual user RTT is improved.

R18-72 tests the narrower hypothesis: within a **single authorized frame only**, an exact duplicate of an otherwise unconditionally solid, structurally valid wall can be evaluated once without changing the final boolean ray-block result. This is a test-only *local scene argument* for the existing original \`ray_blocked\` function, not a cache or persistent geometry rewrite.

## Strict eligibility / original fallback

The experimental variant is derived from PostgreSQL's **exact sealed R18-57 protected private frame function**, with a source-MD5 gate; no copied or guessed rewrite of its original membership or exploration logic. For the ray argument alone, it starts with the **unchanged original scene** and considers a reduced local JSONB array **only** if the authored \`objects\` property is an array containing 2–120 items and **every** item is precisely an object with the two keys \`type:"wall"\` and \`points\`. Each points array must contain 2–80 point objects, every point must contain exactly \`x\` and \`y\` numeric JSON values. Exact JSONB-equal duplicate wall objects are removed while preserving first-occurrence order. The local reduction is used only if the object count actually decreases.

**Original fallback for the entire scene:** any door, window, conditional/one-way wall, extra object key, scene light, decoration, malformed/null member, nonnumeric point, invalid array, over-120 objects or validation error. The original, unmodified \`ray_blocked\` still performs intersection and per-wall checks for every authorized target. The original scene remains in the database and continues to feed original \`is_lit\`; other lighting, movement, collision, permissions, revocation and published geometry functions remain unchanged. This does not optimize real mixed-content authored maps.

## Containment and parity

\`tests/world-v2-b10-postgres/r72-frame-local-solid-wall-probe.sql\` runs after R18-71 within the original R57 disposable \`BEGIN/ROLLBACK\`. It additionally uses a dedicated \`SAVEPOINT\` around the entire transient \`CREATE OR REPLACE FUNCTION\` experiment. It requires the synthetic 91-history fixture, eight private viewer memberships, exact sealed ray/function hashes, private \`SECURITY DEFINER\` and ACL, and original R71 samples. It must explicitly roll back the one patched private source, restore the exact R18-57 MD5 and ACL and the initial viewer roster before continuing into the unchanged R57 signed Commit/collision/revocation/rollback tests.

- Complete original-vs-experimental **private JSONB frame equality** for all eight source fixture viewers across **23 named scenes (184 comparisons)**, including R69 hostile/malformed/portal/over-limit, R57 open/wall-heavy/lit, R71 geometry shapes, and eight new mixed/conditional/dark/shared/invalid/overlimit cases.
- Explicit revoked-viewer denial by both the original alias and isolated probe.
- Original ray calls/self-time and total eight-frame elapsed from local transaction \`pg_stat_xact_user_functions\` for **2 iterations × 3 shapes × 8 frames = 48 measured frames**. Tracking is restored to \`none\` before original R57 Commit timing. Report aggregates only, not private visibility, geometry or player identifiers. R71 baseline is earlier in the same transaction, so there is **potential ordering/warm-cache bias**; no hard speedup claim is allowed.
- Six-plus static containment/source assertions plus source-real PG17, movement authority, Node/Chromium/Edge/build/lint/audit and CodeQL exact-head CI.

If this proof of concept passes and produces a real timing benefit, a later **separate, reviewed operator-gated reversible candidate** can be considered for a much broader independent original/candidate comparison, with informed runtime risk assessment and appropriate fail-closed handling. The experiment is never an installable migration.

## Non-negotiable release gates

The authenticated official Supabase CLI v2.81.3 exact 83+8 linked fetch/list/\`db push --dry-run\`, independently signed DM/P1/passive P2 live movement/collision/fog/revocation acceptance, browser RTT/p95, Supabase Free RAM/locks and explicit release authorization remain outstanding. Google OAuth preview acceptance was already recorded and need not be repeated. **Production release: NO-GO.**
