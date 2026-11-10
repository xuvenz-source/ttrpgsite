# World Engine V2: DM observer sight bootstrap recovery

Status: **staged only**, 10 November 2026. No production deployment, Supabase schema change, configuration change, or database write.

## Live symptom and investigation

After the PR #61 V2 frontend regression repair, the DM receives `No authorized V2 observer sight`, with movement unavailable until entering then exiting player preview. The preview toggle remounts WorldV2Board's runtime/renderer and changes Realtime subscription timing.

The V2 startup first adopts one server-authorized scene/sight pair. The private observer `SUBSCRIBED` event then performs an authorized resync, while the independent private scene `SUBSCRIBED` event invalidates the scene and its sight and fetches the scene again. The observer snapshot may therefore fail while the scene is stale. Previously, the observer transport reported a `resync-error`, remained locked, and did not retry automatically after the scene returned to `scene-current`. Refreshing local sight alone did not necessarily reauthorize the observer cursor/roster.

This is a **code-confirmed recovery gap**, not proof that every observed DM failure had this single cause. Production Supabase read-only inspection found required V2 RPC signatures, normal DM role precedence in `viewer_on_map`, and valid map grid dimensions; authenticated browser traces remain necessary to distinguish races from server-side null snapshots. The server's sight function intentionally returns null on authorization failure.

## Staged change

- `WorldV2TabletopRuntime`: on `scene-current`, if the private observer is connected, request its authorized `resync` rather than only refreshing the render-local sight; if it is not connected, refresh local sight and allow its normal `SUBSCRIBED` path to authorize later.
- `RealtimeTransport`: a failed observer resync remains **locked**, and retries at most twice with short, staggered delays. Any successful server snapshot clears retries; a new explicit scene-current resync cancels pending timers. Disconnect and dispose cancel all timers. No polling channel, additional DB table, widened RLS, leaked scene geometry or fallback to non-private topics.
- `tests/world-v2-observer-sight-recovery-2026-11-10.test.mjs`: exercise failed-then-recovered sight, permanent failure staying locked after bounded retries, and the runtime/transport authorization contract.

## Acceptance before live release

1. GitHub CI: Node tests, Vite build, dependency audit, CodeQL; verify exact staging SHA.
2. With one DM and two separate player sessions on the affected campaign, reload simultaneously several times, confirming no `No authorized V2 observer sight`, no `V2 renderer rejected authorized sight`, and immediate DM movement after load without preview toggle.
3. Reconnect/disconnect the DM session; verify the private observer reauthorizes. Confirm players cannot access the DM scene/hidden pieces and preview still never saves player movement/exploration.
4. Confirm grid, Ctrl+wheel, handout/light popups, held arrow movement, collision, fog and realtime token continuity remain intact.
5. Inspect Supabase Free CPU, memory and request rates; the recovery is event-driven with a maximum of two extra sight RPCs per failed subscription.

This is an integrated **staging fix**, not a tested live acceptance. Merge and production deployment require explicit designer approval and reconciliation with other outstanding staged work.
