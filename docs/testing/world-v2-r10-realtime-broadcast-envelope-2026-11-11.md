# R10 — Live-test hotfix: Supabase Realtime UUID envelope

**11 Nov 2026.** This is a client-only change branched from production PR #70. No database, migrations, credentials, feature flags, or paid infrastructure are involved.

## Verified mechanism
A separate Player 2 live trace records four `observer.invalid-frame` events during Player 1 movement. Each causes a private resync, full renderer seal and six sprite removals followed by full fog redraw. Terrain was assigned only at startup. Read-only Supabase query established 600/600 sampled movement messages had an injected top-level `id` UUID matching `realtime.messages.id`; the live `realtime.send` function indeed adds that field. All 1,424 adjacent movement transitions sampled were valid. The browser's exact-schema validator rejected the extra `id`, causing the repeated flashing.

## Repair and safety
Allow exactly one optional, UUID-validated delivery metadata key on movement, scene-revision and vision-dirty broadcasts. Do not use it to grant authorization or infer movement. Reject all other unknown properties and keep map/viewer identity, permission-generation, sequence, path-adjacency, private signed roster and concealment checks. No database changes; no Supabase history repair; no separate polling or connections.

## Production live-test gate
Run exact-head application tests/build, PG17 security/integration and CodeQL, review diff and deployment environment before merging hotfix into `main`. Confirm Vercel READY at merged SHA. Designer authorized controlled live testing. Test with separate DM, P1 and P2 accounts, baseline compare using `worldV2Trace=1` on Player 2. On ordinary movement expect `observer.invalid-frame=0`, `renderer.seal=0`, `renderer.sprite-remove=0` and `renderer.terrain-assign=0` after clearing startup trace. If these remain, investigate further, not claim success. Test reconnect and token ownership. Fog/LOS and hidden actor safety remain mandatory for later staged protocol release.

This hotfix does not address serial authority RPC latency, keyboard gesture rejection, or the separate R09 initial boot-order improvement. Unfinished B10-R05–R09 draft stack must absorb this mainline hotfix before later deployment.
