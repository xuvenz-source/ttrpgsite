# World Engine V2 — Phase 1 instrumentation, 10 November 2026

This is **staging-only** opt-in instrumentation, not a fix or deployment. No SQL/RLS, additional Realtime subscriptions, telemetry uploads or game-behaviour changes. Recording is off by default and strictly bounded (256 timeline events and 256 samples per metric); event names and reason details are allowlisted, without IDs, coordinates, hidden fog data, RPC bodies, messages or free-form error strings.

## Authenticated capture procedure (after explicit live-test approval)

Open the map as DM and as a separate player/observer in independent browsers, adding \`?worldV2Trace=1\` to the URL (\`&worldV2Trace=1\` when a query string already exists). In each browser, run \`window.__worldV2Trace.clear()\` in DevTools. Reproduce one issue at a time: DM drag, player drag, preview drag, arrows, and remote-token movement. Immediately after the failure, inspect \`window.__worldV2Trace.snapshot()\` or use \`copy(window.__worldV2Trace.snapshot())\`. Trace is in-memory and disappears on reload; it sends nothing over the network.

Read the event ordering in \`events\` and the p50/p95/max timings in \`durations\`. \`input.pointer.status:selection/begin/busy\` without \`input.pointer.start\` means gesture admission/hit-test failure. \`observer.sequence-gap\` -> \`observer.seal\` -> \`renderer.seal\` indicates transport recovery. \`visibility.reject\` or \`renderer.visibility-reject\` -> \`renderer.seal\` indicates sight/cursor reconciliation. \`renderer.fog-full\`, \`renderer.opaque\`, \`renderer.sprite-remove/create\` and \`renderer.terrain-assign\` distinguish fog clearing, sprite lifecycle and bitmap reassignment. Capture the acting and observing clients independently.

**Phase 1 release gate remains OPEN:** unit/build/CI checks must be green and an authenticated browser reproduction must identify the event immediately preceding the flash. The new tracing does not itself repair visibility or input; Phase 2 must preserve fail-closed security on true permission revocation.
