# B10-R18-73 — Published map wall eligibility: live read-only decision gate

**14 November 2026 · READ-ONLY / SOURCE-ONLY / DRAFT / NO-DEPLOY.** Parent is R18-72 PR #174 at exact SHA \`2711a7f7fe025693d772c314ef319e8eccd2874a\`. No production release, schema migration, persistent fog candidate, role/ACL change, Vercel deploy or database write.

## Question to answer

R18-70/71 established repeated \`ray_blocked\` JSON wall traversal cost in a **synthetic** 24-object scene (three exact repeats of eight simple walls). R18-72 successfully tested frame-local whole-scene reduction of only strict, unconditional, exact-duplicate plain solid-wall objects; its source-real local PG17 samples with eight simulated viewers showed roughly halved ray self-time on **that synthetic fixture**, but no measured benefit on eight unique objects. The R18-72 probe is disposable and rolled back; it was **not installed on Supabase**.

Before building an operator-gated, reversible runtime variant, we must establish whether live *published scene content* actually qualifies for R18-72. Otherwise the implementation adds validation and allocation overhead for a fastpath real maps never take.

## Source-exact eligibility census

\`supabase/release-preflight/world_v2_b10_r18_73_published_wall_eligibility.sql\` is **one SELECT statement**, not a function, mutation, view, migration, or job. It reads only \`public.map_environments.live\` and groups by map ID **internally** without outputting map IDs, coordinates, scene JSON, token ownership, private visibility or player identities. JSON expansions are restricted to scene objects arrays of **2–120 members**, and validated wall point arrays of **2–80 members**. Its output is a **single JSONB aggregate report** containing counts only and explicit \`safe_to_install:false\`, \`operator_cli_verified:false\`, \`independent_dm_p1_p2_verified:false\`, and \`release_decision:"NO_GO"\`.

A strict R18-72 eligible scene requires every object to be exactly a wall object with only \`type\` and \`points\` keys, and every point exactly numeric \`x\`/\`y\` keys; 2–120 objects and 2–80 points per object. A scene with any light, door, window, other authored object, conditional wall, extra key, null, malformed points, or over-limit array **falls back**. Even an eligible scene is potentially useful only if exact JSONB-equal duplicate wall objects actually exist within it. No user-authored geometry is rewritten.

The statement also reports bounded aggregates across five hardcoded object families: wall, door, window, light, and other. It does **not** output arbitrary authored \`type\` strings. Objects in over-limit or malformed scenes are not expanded and thus are **not included** in these family counts; the schema reports the excluded-scene count separately. This is an audit of **published \`live\` scenes**, not saved drafts, archived maps, real-time player load, browser RTT, projected production latency, or the future campaign population.

## Actual live SELECT-only measurement

Run on the connected Tabletop Forge Supabase project at **2026-11-14 12:56:16 UTC**, from the **exact checked-in SQL query source**. A separate plain metadata SELECT showed **83 existing applied migrations**; the official linked CLI 83+8 rehearsal was **not run**.

| Aggregated published-scene value | Observed |
|---|---:|
| Rows in \`public.map_environments\` | **2** |
| Scene object arrays present | **2** |
| Scene arrays over the 120-object limit | **0** |
| Strict whole-scene R18-72 eligibility | **0** |
| Eligible scenes with exact duplicate walls | **0** |
| Eligible duplicate wall objects | **0** |
| Scenes requiring original fallback | **2** |
| Bounded categorized objects | **3** |
| Wall objects | **1** |
| Light objects | **2** |
| Door/window/other objects | **0** |

These outputs are **live, historical point-in-time measurements**, not a representative population study. Neither actual published scene gains from the existing whole-scene R18-72 deduplication condition. The sample is just two environments and may change with DM edits. A light source in a scene may require fall-through to original \`is_lit\`; **do not use this aggregate to infer token vision, author intent or lighting performance**.

**Decision:** the current R18-72 prototype has no demonstrated benefit for today's two published scenes. **Do not build or install a runtime candidate from R18-72 at this stage.** In particular, do not broaden its guards, strip authored lights, weaken LOS, or deduplicate mixed/conditional geometry based on this census. Investigate current fog/LOS cost on representative mixed-light maps with *source-real private frame parity* if performance work continues.

## Offline validation and operator flow

\`scripts/release/validate-world-v2-r18-73-wall-eligibility.mjs\` accepts only a **single aggregate JSON report** with the exact allowlisted keys. It rejects extra/private fields, forged approval, non-integer/negative or inconsistent counts, unknown kinds and future timestamps. It computes a **NO_GO** report and safe classification: no published samples, no eligible scenes, eligible-but-no-duplicates, or review-only duplicates. The optional evidence file must be a regular, non-symlink file **outside the repo** and at most 8 KiB. The command has no Supabase connection or database permissions.

Store aggregate-only JSON outside the checkout and run:

\`\`\`sh
node scripts/release/validate-world-v2-r18-73-wall-eligibility.mjs \
  --input=/secure/private/r73-published-wall-aggregate.json
\`\`\`

It will never approve migrations, runtime installation, frontend flag flips or production deployment. Do not commit even sanitized snapshots as fixture data sourced from live user maps; static tests use synthetic aggregates. The current 2-map observation is documented above only in category totals, without raw map details.

## Release gates, unchanged

All exact-head workflows (Node/Chromium/build/lint/npm audit/Edge, source-real PG17 fog/rollback, isolated PG17 movement authority, CodeQL) must pass. Source-only tests cannot replace the authenticated official Supabase CLI v2.81.3 exact 83+8 linked fetch/list/\`db push --dry-run\`, independent signed DM/P1/passive-P2 canonical movement/collision/fog/revocation browser QA, browser p50/p95, live Free-tier RAM/locks or explicit operator authorization. OAuth preview login has previously passed and need not be repeated.

**R18-73 engineering decision:** measure and document, refuse a speculative fog optimization. **Production release: NO-GO.**
