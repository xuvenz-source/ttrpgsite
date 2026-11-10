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
