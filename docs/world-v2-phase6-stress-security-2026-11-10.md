# World Engine V2 Phase 6 — integrated stress, authorization and free-tier verification

This work is deliberately staged in PR #68 without deploying or applying SQL.

## Integrated client stress tests
- Real **VisibilityController → WorldRenderer → RealtimeTransport** instances, not a mocked renderer. Synthetic, isolated recipients each own a viewer-scoped private observer channel and validate every server-shaped sight and movement packet.
- 6 concurrent viewer clients × 120 adjacent server-approved moves = **720 simulated private movement deliveries**. Every tenth move adopts a fresh authorized visibility epoch. The test asserts no scene/terrain reassignment, sprite remount, extra full-fog canvas repaint, frame leak or duplicate channel. It verifies the only sight RPCs are the initial grant, subscription reauthorization and the deliberate ten-movement updates.
- Cross-viewer forged envelopes, unknown NPC entry, disconnect, and reconnect must lock the observer, immediately conceal all previous authorized sprites and keep hidden identities absent until the server issues a new authorized sight roster.
- 1,000 direct swept-collision checks across a solid wall and mixed token/tool footprint tests. No client prediction through undisclosed geometry is enabled.
- 25,000 event stress on opt-in, memory-only trace confirms ring-buffer capacity, allowlisted sanitization and no accumulated coordinates, private messages or user data.
- Source-level V2/legacy isolation checks verify the cutover does not mount both board engines or the older fog/observer subscriptions.

## Release gates
Run full Node/Chromium tests, build, production dependency audit, Edge Function checks, CodeQL and existing PostgreSQL V2 authorization contracts at the **same staging commit**. Regression gates must not claim genuine production RLS testing or measured Supabase RAM consumption.

**Still required after explicit designer authorization:** authenticated live DM/player/preview testing on existing campaigns; 100 consecutive movements with observed frame continuity; multi-client fog/walls, hidden NPC reveal, handout pins, light changes, map publication, reconnect and multi-token movement; inspect live Supabase memory, Realtime clients, RPC timings and bandwidth. The automated test supplies a controlled baseline, not a substitute.

No new migrations, RLS policies, SQL writes, Realtime subscriptions, paid services or production deployment.

## Verified Phase 6 staging results (10 November 2026)
758 frontend/Node tests passed, including headless Chromium real pointer capture; 6 private viewer clients × 120 valid observer frames = 720 deliveries through real VisibilityController/WorldRenderer/RealtimeTransport instances; 120 sequential DM virtual-preview sessions with zero persistent commit; 1,000 blocked wall sweeps; 25,000 bounded sanitized trace events. Isolated V2 PostgreSQL role/geometry contracts also passed. These are synthetic harness results, **not** authenticated production acceptance.

### Read-only Supabase snapshot and security triage
The connected live Supabase project reported ACTIVE_HEALTHY, no health-advisor findings, and the six forge_world_v2 tables together occupied approximately 264 kB of PostgreSQL relation storage at inspection. This **does not** establish RAM use, network throughput, or a live movement stress benchmark.

Advisors reported older findings, not necessarily exploitable vulnerabilities: 67 authenticated SECURITY DEFINER function warnings ([advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)); 15 RLS-enabled-without-policy findings, mainly internal private tables ([advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)); 36 unindexed foreign keys, seven unused indexes and two multiple-permissive-policy warnings ([performance advisory](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)); and leaked-password protection disabled ([Auth security guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)).

Live read-only PostgreSQL inspection verified that all nine tested core V2 motion/scene/sight RPCs were callable by signed-in users but **not** by anon, used a locked search_path and included an auth.uid() reference. This is not full proof of RLS security; continue role-based authorization tests after an approved release. No database permissions, indexes or production records were changed.

### Integration and older staged work
PR #68 integrates all six V2 phases. The V2 board route is mutually exclusive with legacy BattlemapBoard; former observer/fog subscriptions have explicit V2 cutover guards. The shared private map-measurement topic remains necessary for measurements and is not a second movement engine. Four older draft PRs (#20, #21, #32, #33) also remain open, and many older stage branches still exist. The release ledger identifies PR #68 as the current integrated staging bundle, but the **final pre-merge review must classify** those older drafts as already released, superseded or outstanding; do not blindly merge old code or silently exclude ready work.

### Approved live test protocol, not yet executed
After explicit approval, use existing test campaigns/accounts to complete at least 100 combined movements: 30 DM gestures starting **without preview**, 40 owned-player pointer/keyboard gestures, 30 DM player-effective preview steps. Check wall/door/corner collisions, multi-token and tool movement, fog exploration persistence, hidden NPC/handout/light concealment, varied zoom, editor controls, map reassignments and disconnect/reconnect. No player may drag another owner's token or learn DM-hidden geometry; DM preview must not commit movement or exploration.

Enable opt-in \`?worldV2Trace=1\` during testing. Investigate unexpected renderer.seal/opaque/sprite-remove/terrain-assign events and full-fog redraws on normal moves; genuine security revocations can intentionally conceal the scene. Record measured RPC p50/p95, frame delay, live Supabase RAM and realtime traffic before asserting this solves free-tier memory pressure.

**No production deployment, migration, live write, impersonated session, or actual live multiplayer stress test was performed in Phase 6 staging.**
