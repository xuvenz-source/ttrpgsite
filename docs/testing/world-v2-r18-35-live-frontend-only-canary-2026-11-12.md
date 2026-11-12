# R18-35 — isolated frontend-only zero-motion collision canary

**12 November 2026 · engineering baseline R18-31 · live deployment requires complete gates.**

## Source-of-truth
- The actual user-facing test-ground `ttrpgsite.vercel.app` was restored to **R18-31** Git `d94985e1135822953c9f67d9b46d238facaaaa1f` and Vercel `dpl_DCyZdsSTjmvbT5YnMK7sjbzGTgem`.
- The live Supabase project has 83 migrations; R05 version `20261111023204` is **not installed**. No R18-28/R18-30 atomic terminal RPC, SQL candidates, extra public grant or fog scheme may accompany this frontend-only test.
- Cumulative draft PR #138 (R18-34) is *not* a safe frontend deploy source: it contains unreleased server code in its ancestry. Its tiny reviewed no-motion UI changes can be individually transplanted here because the two relevant original blobs exactly match live R18-31.

## Strict R18-35 review scope (compare exact R18-31 parent to this branch)
1. `src/engine/v2/KeyboardStepper.js` — reviewed R18-34 blob `59b835fda26bfefe1eba0fce62a4a1b4b13b05d1`. Skip an extra post-terminal keyboard sight RPC ONLY after `committed + noMotion:true` and unchanged actor-bound signed frame, scene, map, permission/scene generations, same roster position, authorized renderer and unlocked stream. All other outcomes retain existing refresh.
2. `src/engine/v2/WorldRenderer.js` — reviewed R18-34 blob `5a79011fee89d6fd27082a3ec594a54770f884f0`. Retire the local highlight after no-motion at the exact original point without canonical handoff and extra renderer resync. Mismatches fail closed; canonical motion unchanged.
3. `src/engine/v2/WorldV2TabletopRuntime.js` — two additive checks, `!event.noMotion`, at real canonical handoff and post-commit visibility. Preview still runs its separate non-mutating player-effective sight refresh. Actual movement still triggers canonical Commit notification and signed visibility.
4. `src/engine/v2/MovementController.js` — **one event-contract backport**, `noMotion:true` in the final `committed` event ONLY if existing, validated controller result `noMotion===true`. R18-31 queue detachment, authority Advance/Commit, signed collision, cancel behavior and absence of `finalize_world_motion_v2` remain untouched.
5. Node/controller, keyboard, renderer, frozen source hash and negative security tests; this record.

**Not in this release:** SQL migrations, R05 server core, R18-26/27/28/30 SQL candidates, R18-29 atomic client, R18-32 pointer-backlog experiment, Vercel project env changes, Realtime/RLS/visibility/door/wall rules changes, dependencies or paid infrastructure.

## Evidence and release gates
- Confirm strict diff against pinned live R18-31 parent contains ONLY items above.
- Require exact-head GitHub Actions: Node tests, lint, production-dependency audit, Vite build, Edge checks, CodeQL, independent source-real PostgreSQL authority and existing combined isolated PG17. No production DB modification in CI.
- Verify signed no-motion case and rejected/revoked/mismatched-sight case as separate unit tests; actual committed progress must preserve canonical handoff.
- Build a preview from the exact passing Git SHA, verify deployment source, and promote/alias to the live test domain only after passing all gates and retaining the R18-31 rollback target. Verify both public aliases after promotion.
- A sole DM can test repeated wall hits, then direction changes/keyboard bursts, corner drags, and sustained movement. This does NOT certify independent DM/P1/P2 observer visibility or revocation. Do not activate unreleased R05 server redesign.
- Roll back to R18-31 immediately if latency worsens, collisions slip, unapproved positions appear, or map flashes return.

## Interpretation

This frontend optimization removes **redundant visibility work after a confirmed zero-motion gesture**; it cannot remove the initial wall-validation RPC time or speed a real canonical Commit. Even if CI is green, perceptual improvement remains unproven until a focused live test. Every other movement still uses the existing authority and signed sight gates.
