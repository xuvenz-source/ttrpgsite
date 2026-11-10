# World Engine V2: production DM sight regression investigation and staged repair

Status: **staged only**, 10 November 2026. Production remains at PR #62 (commit `e314b879`). No deployment or database modification is part of this branch.

## Confirmed evidence
The DM reports an immediate `No authorized V2 observer sight` after PR #62, with movement failing both in and out of preview. A production, read-only Supabase diagnostic of the map with six tokens independently generated a valid DM-scoped `get_world_visibility_v2` frame with six roster entries. A second read-only check also returned a valid player-effective DM preview frame for an assigned player on that map. The SQL visibility service and DM preview authorization can therefore supply valid frames; authenticated browser traces have not been captured.

## Failure modes
1. `SceneTransport.pump` previously did **not** requeue a failed stale scene load if an earlier retained scene's generation was already at the requested target. This could leave a live scene subscription stale and with no subsequent `scene-current` event.
2. The PR #62 `scene-current` handler unconditionally called `stream.resync` while the initial observer request might still be in flight. New resyncs revoked renderer and observer state and invalidated the earlier response. The resulting transient error was immediately shown even if a later sight eventually succeeded.
3. `VisibilityController` previously accepted an RPC frame even when `WorldRenderer.adoptVisibility` rejected it; its `onSnapshot` callback's result was swallowed, allowing contradictory authorization state.
4. Once the UI showed an observer error, it was not cleared on successful reauthorization, so the message could outlive the failure.

## Repair
- Retry stale scene loads with bounded attempts (four), regardless of retained generation, retaining fail-closed behaviour.
- Serialize scene-current observer recovery behind an already-running observer resync; obtain fresh sight only if still locked or not authorized after the prior attempt.
- Treat renderer rejection as a failed sight adoption, revoke the frame, and report only a bounded rejection code.
- Defer transport's user-visible error until the bounded recovery attempts are exhausted, and clear relevant transient V2 sight messages once both sight and the stream are authorized.
- Add integration tests covering canceled-in-flight sight, scene load retry with retained generation, player-preview scene rejoin, permanent sight denial, and renderer rejection.

No SQL migrations, authorization shortcuts, new Realtime channels or persistent polling. Existing movement and fog authority remain server-owned.

## Release gate
All frontend tests, Vite build, PostgreSQL authority checks and CodeQL must pass on the exact branch SHA. Actual acceptance requires the affected DM campaign with a separate player session: immediate drag/keyboard movement after refresh, preview entry/exit, scene reconnect, wall collision, fog visibility and unchanged hidden-piece permissions. Do not merge/deploy until explicitly approved.
