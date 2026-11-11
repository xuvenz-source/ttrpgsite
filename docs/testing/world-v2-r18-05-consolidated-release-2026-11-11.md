# B10-R18-05 — Consolidated R17 keyboard + R18-01…R18-04 observer release candidate

**Engineering handoff · 11 November 2026, Australia/Melbourne.**
**STAGING ONLY / NO-GO for publishing, SQL, or enabling recovery flags.**

## Source of truth and history

- Live production remains **R16** `main@90df8c960e79e8d66c322095611427da7bb09de4`.
- The R18-05 branch was created from exact staged **R18-04 PR #106** `2ade6db11469573a35d889e731a1a872c676532a`, which incorporates R18-01 audit #103, R18-02 default-off signed catch-up #104 and R18-03 frozen terminal SQL candidate #105.
- **R17 PR #102**, `6957e2b87cfb7ae63d42b2396d118f6bb281043c`, is incorporated here without git/text conflict: `KeyboardStepper.js`, `MovementController.js` and `WorldV2Board.jsx` in R18-04 had exact `main` content SHA, so the three tested R17 blobs were copied **verbatim**, along with their R17 test and design record.
- R17’s ledger was NOT copied over the newer R18 ledger. All five original unpublished stage entries remain tracked, and this consolidated branch adds a sixth auditable staging entry. Do not merge original stacked PRs separately; there is a single future integrated source candidate.
- A prior ledger feature `world-engine-v2-phase10-integrated` still records historical `staged-unreleased` metadata and early `included` features. Those are legacy ledger semantics, **not** proof that additional old SQL is release-ready. Reconcile their actual live migrations and audit PRs before production; do not silently reapply historical migration versions.
- The approved project workflow mandates one deliberate `main` merge / one Vercel production deployment, not repeated previews. This step makes neither.

## Combined functionality

**R17 blocked keyboard gesture:** verified ACK-derived first denied adjacent waypoint; local arrow cursor rebased to last server-approved cell; only repeat of the exact denied crossing is suppressed, while another direction makes a normal server-authorized move. Drag, DM preview and server collision rules are unchanged. Does not remove the original per-movement RPC latency.

**R18-01 incident baseline:** passive Player 2 had 51 accepted movement frames, two `unknown-piece`, two `sequence-gap`, four 312–424ms concealment/fog-reset windows. Their exact upstream packet-loss/roster race is unproven; the fail-closed scenario remains a regression test.

**R18-02 signed quiet-observer recovery:** optional **12s foreground-only** existing signed `get_world_visibility_v2` RPC, single flight, no extra Realtime channel. Renderer must adopt authenticated sight before cosmetic stream alignment; signed positions fence delayed old-path rewind. **`VITE_WORLD_V2_OBSERVER_RECOVERY=1` default OFF**. At 10 constantly active connected viewers the nominal steady-state extra sight load could approach ~0.83 RPC/s; measure on Supabase Free, do not assume harmless.

**R18-03 terminal server authority:** exact frozen reviewed R05 #90 B03→B07→B08→R01→R03 migration under `supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql`, **NONAPPLIED**. Includes recipient-specific budget/LOS send checks, atomic canonical Commit and idempotent retry, queued terminal drain/coordinate retirement, private tables, read-only exact live preflight and manual original-function restore. GitHub-hosted source-real isolated PostgreSQL 17 rehearsal has exercised these historically, but no live migration has occurred. Remote live migration history has **83 applied entries**, newest `20261109171247`, which differs from repository version aliases. Never generic `supabase db push` or history repair: only targeted, separately approved versioned installation after re-running exact preflight.

**R18-04 guarded transient observer repair:** optional **700ms scheduled** single-flight same-generation `unknown-piece`/sequence-gap recovery; it does NOT paint or queue unauthorized paths and requires newer Auth-signed sight to realign. At most 16 incoming packets are counted as monotonic cursor hints. Invalid packet, permission/map/scene revision, timeout, overflow, disconnect, denial and backgrounding force full concealment/reauthorization. `VITE_WORLD_V2_OBSERVER_GUARDED_RECOVERY=1` default OFF; DM player preview excluded. Retaining the previously authorized view briefly is a **deliberate privacy tradeoff**, not proven safe under all map/role revocation and suspended-browser races.

The two flags are independent and are NOT enabled in repo or live Vercel in this change. No new public token feed, client-authorized coordinate write, socket, paid service, cron, Edge mutation or authentication grant.

## R18-05 joint verification

The new `tests/world-v2-r18-05-consolidated-integration.test.mjs`:
1. Enforces exact R17 source Git blob IDs for all three files and the default-off R18 dual recovery flags. Validates all original staged PRs #102–106 remain recorded and no database release is marked applied.
2. Runs a real `MovementController` + `KeyboardStepper` against a synthetic server ACK that blocks a wall crossing, plus a same-session real `RealtimeTransport` observer. Proves 16 repeated denied arrow presses generate **no** new Advance, a turn generates exactly one authorized Advance, the canonical Commit endpoint agrees with passive observer movement, and a private hidden NPC packet **never** grants a sprite or path. The signed-sight response is a synthetic authority fixture; this is NOT real authenticated player LOS or browser acceptance.

Keep the R17 3 tests, R18-01 synthetic 51-frame fault, R18-02 authenticated-sight watch 13 cases, R18-03 frozen-source and PostgreSQL 17 tests, R18-04 12 hostile transport tests and real Chromium board tests in the exact-head build. Require ESLint, production dependency audit, Vite build, Deno checks, CodeQL and private PostgreSQL authority tests.

## Mandatory NO-GO gates before any release

1. **Complete diff/security review:** Compare R18-05 HEAD against current main; verify only intended R17 + R18 files and the exact frozen reviewed R05 SQL bundle. Inspect dependencies and verify R05 no-op/incompatible live schema hazards. No unrelated historical `stage/**` feature may be silently omitted or pushed.
2. **Real authenticated DM + P1 + passive P2 protected fog/hidden NPC matrix:** verify no stale hidden NPC or obscured map portion is exposed during grace; permissions/scene/role/map revocation, LOS exit, sight-denial and reconnect must conceal immediately. Use current test campaigns only once the designer explicitly approves an integrated release. Genuine player preview stays local.
3. **Performance and convergence:** reproduce 2 unknown-piece and 2 sequence gaps with realistic recipient stream delivery, verify zero unauthorized sprites and fewer ordinary full-map resets, no DM/P2 canonical position split after Commit, no repeated blocked Arrow RPC storm, acceptable Advance/Commit RPC p50/p95 and passive sight load/RAM on Free. Browser timer suspension makes 700ms a scheduled bound, **not a guaranteed wall-clock deadline**.
4. **Authorization/security:** source-real database tests do not establish live Auth/RLS behavior; require recipient topic scope, current LOS, group movement, replay/duplicate drops, visibility revocation, 2×2 footprints and server collision wall blocking under live accounts.
5. **Migration sequence and recovery:** separate explicit designer approval; quiesce test motion; run read-only catalog preflight immediately before migration; apply only exact targeted SQL transaction and validate seven authority fingerprints/grants/realtime topics, verify backup; compatible frontend deploy once; execute protected live test; manual recovery if failed. Do not install backend without a matching approved client plan.
6. **Free-tier restrictions:** no paid branch/db, no new high-volume SQL polling; capture network and Supabase RAM/CPU under 2–10 viewers before enabling the 12s watch or 700ms guarded recovery. If network loss or security behavior does not meet release bar, leave flags off or decline release.

**Handoff decision:** R18-05 is an integrated, reviewable staging candidate, NOT a production authorization or proof of complete live performance repair.
