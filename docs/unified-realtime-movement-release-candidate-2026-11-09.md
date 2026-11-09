# Unified real-time movement — consolidated pre-deployment candidate

**Date:** 9 November 2026
**Branch:** `stage/unified-realtime-movement-2026-11-09`
**Base production/main:** `ab905866306e9a0669287ac4b7e620c4ee33c880`
**Change policy:** **No production deployment, no main merge and no production SQL without explicit designer authorization.** This page does not grant authorization.
**Scope:** The requested unified movement, collision, fog and rendering release. Preserve all current production features and existing unrelated draft staging branches.

## Release payload — one integrated release, not independent patches

| Work package | Changes staged | Practical release gate |
| --- | --- | --- |
| WP0 Audit and profiling | Confirmed GitHub branch/Vercel production SHA, actual Supabase migration history/function bodies, open draft PRs and SQL latency baseline; added aggregate frame, fog-paint, sprite-mount and batch counters | Browser 2/4/8-player measurements have not been taken |
| WP1 Intent / gesture | Bounded actual pointer bends, up to 24 cells per player batch, frozen mouse-up intent until batch resolution, shared tool/token and DM drag entry, protected revocation/cancel | Real touch, rapid backtracking, map switch and stale ownership QA |
| WP2 Authority | Additive private actor-owned gesture batching, collision-swept group footprints, sanitized accepted prefixes, sequence/environment/permission checks, per-player probe budgets; DM and nonconcealed swept-path session RPC; no anonymous execute | Validate production RLS roles after approved migrations |
| WP3 Renderer and observers | One RAF compositor loop for simultaneously moving pieces, subcell pointer movement on known edges, verified collinear runs and corner waypoints, sticky canonical handoff, stable tool/torch refs, ordered DM buffered observer queue | Browser observer latency, reconnect and high-load QA |
| WP4 Fog/light | Preserve map's published scene revisions, explored history and per-viewer fog deltas. Verified movement writes private transient positions and triggers throttled viewer revisions; per-observer LOS-sanitized path messages; corrected authorized DM-carried torch offsets in both lighting functions | Live fog/torch/door/reveal/party-sharing security QA |
| WP5 Free-tier compatibility | Bounded requests, one canonical final commit, no Redis/dedicated game server, no extra Supabase project or paid services, no per-tile React tool state writes | Measure actual WAL/RSS/swap, SQL calls and Realtime recipient fan-out |
| WP6 Verification | GitHub unit/lint/audit/Vite/Deno workflow, CodeQL, PostgreSQL 16 disposable role/collision/private-packet/torch tests, release/rollback procedure and acceptance matrix | No live browser campaign acceptance yet |

### Exact database migration order (versioned staging files)

1. `20261109000500_batched_concealed_navigation.sql`: add bounded gesture session fields, private rate budget and trigger, versioned server-verified batch RPC. Existing adjacent-step RPC remains for compatibility.
2. `20261109000600_batched_motion_observer_visibility.sql`: private recipient-visible path classification, session-approved observer broadcast and batched private fog updates.
3. `20261109000700_authorized_dm_observer_paths.sql`: actor-owned DM/nonconcealed motion-session path RPC; preserves server collision/override checks and existing legacy endpoint.
4. `20261109000800_dm_held_torch_authorized_motion.sql`: two compatibility-preserving `CREATE OR REPLACE` function changes to allow the authorized DM (as well as token owner) to supply a moving carried-torch position. All other lighting logic remains the audited original.

**All four migrations are staged only. None is executed on production Supabase.** The 00800 function definitions were based on read-only inspection of the production SQL; diff them with the live functions again before applying.

### Security contract

- Player and DM are authenticated via `auth.uid()`; clients never supply trusted actor or origin. Current map assignments, token/tool control and stored scene/generation/version are checked by server functions.
- Hidden geometry, secret NPC data and obstruction identities are never included in batched movement responses or observer broadcasts.
- Observer paths are emitted only from Postgres private channels after membership/map assignment and LOS/light checks for the specific recipient. The browser still requires an authorized RLS token row before creating artwork.
- A failed, stale or maliciously skipped path never gains client-side sight, wall passability or canonical write rights.
- Session limits: bounded per-call cells and bends, 128 attempted cells per player gesture, 64 batch calls, 8-second expiring sessions, and 120 new player gesture starts per minute per actor/map (DM exempt). These mitigate probing but cannot prove that a malicious authenticated client physically dragged a pointer.
- Existing final `commit_map_trajectory`/group persistence still validates canonical position/collision independently.
- Old privileged RPCs remain available for rollback; private session/rate tables remain RLS-protected and directly inaccessible to `anon`/`authenticated`.
- A real attempted collision may still reveal a blocked direction. Do not claim perfect hidden-wall non-disclosure.

### GitHub staging checks (free GitHub Actions runners)

- `.github/workflows/verify-staged.yml`: critical lint, all Node tests, production dependency audit, Vite build, Edge Function Deno type checks.
- `.github/workflows/codeql.yml`: JavaScript/TypeScript security-extended CodeQL on this branch.
- `.github/workflows/staging-unified-movement-sql.yml`: disposable PostgreSQL 16 applies all staged migrations to **synthetic** tables and actors, then tests grants/ownership, one-session-per-piece previews, hidden-wall prefix denial, group collision, private recipient fan-out, stale scene and permission denial, DM corners and moving held torch.
- No live project credentials are used in the SQL fixture. Production DB is queried read-only for audit only.
- CI source-level passes do **not** prove actual Supabase RLS integration, Vercel app behavior, 60fps, p95 network latency, or RAM/swap savings.

### Before approval

1. Confirm no new `main` changes or staged branch conflicts since base SHA. Review draft PRs #20/#21/#32/#33 separately: most historical code already has later main versions; `#20` private NPC-artwork SQL candidate remains an independent unreleased security proposal, not silently merged.
2. Require a green GitHub build/lint/audit/Deno suite, CodeQL, and isolated PostgreSQL SQL contract on the **same final staging SHA**.
3. Review migration scripts and role grants as a set. Before applying 00800, compare definitions of `forge_visibility.is_lit` and `public.get_authorized_map_light_masks` with their current production definitions to avoid overwriting newer changes.
4. Prepare a campaign owner/DM and two controlled player accounts for live test campaigns. Ensure no active sessions are relying on old gesture state during the approved rollout.
5. Obtain the designer's explicit authorization **before** SQL/merge/deploy. The normal Vercel GitHub integration may auto-deploy a main merge; treat merging as a production-changing action.

### With designer approval only — intended one-release sequence

1. Record current production Vercel SHA, current migration history and a rollback pointer. Confirm usage within Supabase/Vercel Free plans.
2. Apply all four additive/replacement migrations in the numbered order, checking `anon`, authorized player, unrelated user and DM executable function grants and private RLS. Abort on any mismatch; do not deploy frontend until permissions work.
3. Merge the **entire integrated candidate once**, after ensuring no previously staged functionality was omitted or reverted. Permit only one consolidated Vercel production deployment.
4. Verify a real DM plus two players with normal collision, a secret wall, group movement, carried lights, sharing modes and reconnect; then perform expanded stress tests.
5. Compare before/after p50/p95 local motion latency, remote observer delay, token/torch coordinate continuity, fog canvas dirty/full paint counts, SQL calls/time, WAL, Realtime messages and actual database process RSS/swap (not just committed memory).
6. Keep canonical commit and observer channels under active monitoring; halt rollout if hidden geometry, NPC rows, lights or permission revocation leaks occur.

### User acceptance matrix

- DM and player: slow and fast mouse drags, long multi-tile bends, immediate mouse-up, rapid backtracking, blocked/diagonal corner, sliding, closed/open doors, one-way/conditional walls, large footprints, NPC ownership change mid-gesture.
- DM collision override, DM player-preview simulation (must not persist), arrow-key nudges, token + tool multi-select, held/placed torch, mount and shared tools, token artwork/status monitors/selection frames following the same position.
- Private fog/party-shared fog/fog-disabled scenes; static published wall/light caching; moving vision and moving torch; explored dimmed state; stationary NPC reveal; unrelated token hiding; light must never pass a solid wall; reconnect, stale/replayed/out-of-order packets, browser background/foreground.
- 10, 50 and 100 tokens with at least 2, 4 and 8 real clients, observing both remote position order and board/render memory. Test on disposable campaigns only.
- Verify inventory, sheets/autosave, combat, initiative, hotbar, measurement, pins, DM environment editing and non-movement features after consolidated deploy.

### Rollback

- First revert frontend deployment to last verified production SHA, so older client uses preserved original gesture and motion RPCs.
- All new SQL RPCs are additive and inactive under the old frontend. Do not blindly undo privilege changes or drop private session columns while active transactions exist.
- If 00800 compatibility functions regress torch/vision, restore the exact prior function definitions previously recorded from production after an approved role/security review, never remove RLS to make a feature work.
- Reconcile pending sessions and per-viewer fog from authoritative RLS snapshots, never from stale client positions; preserve explored history and campaign data.

**Final classification before authorized live testing:** staged/CI-verifiable; full browser and production-role acceptance is still outstanding and cannot be represented as complete without an approved environment.
