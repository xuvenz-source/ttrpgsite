# World Engine V2 — integrated live regression repair (staging only)

**Branch:** `stage/world-v2-live-regression-integrated-2026-11-10`
**Base:** `7fb2c04fe4ca85721e08772e936265a649784bda` (production, including PR #60)
**Scope:** Frontend-only. No production DB writes, SQL migration, environment change, deployment or merge.

## Integrated fixes

1. **Startup authority race** — initial scene load no longer triggers a second simultaneous sight fetch. Start is single-flight and marks the runtime started only after one matching sight and both streams are ready. Overlapping sight requests await their queued frame instead of treating it as a false failure. Permissions and revision checks stay strict.
2. **Map-sized renderer stage** — the camera transforms a stage explicitly sized to the original map pixels. Grid and measurement visuals remain beneath server-authorized fog.
3. **Popups and light editor** — already-authorized interactive overlays sit in a separate, map-sized foreground above fog. Player handout pins continue using `visibleWorldPins` and cannot be rendered without sight authorization.
4. **CTRL+wheel** — native wheel listener with `passive:false` restores cancellation of browser zoom and uses the map's existing cursor-anchored zoom stops.
5. **Arrow movement** — current custom keybinding mapping pushes held key repeats and quick taps into a buffered V2 gesture rather than committing each tile separately. Release uses a 90ms idle flush. Legacy/preview throttle remains isolated. Authority, collision and fog remain server-enforced.

## Release and live acceptance gates

- Fresh DM and two real players authorize after refresh/reconnect without a V2 unavailable banner; verify scene/sight RPC order and private channel subscriptions.
- Player preview on a genuine player-owned token shows only their authorized sight and never changes canonical position; invalid/mismatched preview scopes fail closed.
- Test grid, click targets and Ctrl+wheel at 25% through 300% on several map sizes. Handout panels, light quick-adjust and other popups must be legible and usable near all four map edges.
- Test held and rapidly tapped custom arrow binds, immediate local feedback, one final commit per continuous gesture, collisions, revocation and route discontinuity.
- Validate player/DM multi-browser movement, no token flashing, static fog persistence, realtime motion, input focus restrictions, torch lighting, tools and measurements.
- Measure movement p50/p95, Supabase CPU/RSS/WAL and Realtime changes during existing live campaign testing. Synthetic CI cannot certify these.

Staging branch pushes do not invoke Vercel under `vercel.json`. Reconcile every release-ready staged branch before a designer-authorized consolidated production release.
