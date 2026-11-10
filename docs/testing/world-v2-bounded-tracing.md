# A05 — World Engine V2 bounded movement and renderer trace

**Status:** Staged instrumentation specification, **not a live performance measurement**.  
**Trace:** Existing \`src/engine/v2/WorldTrace.js\`, augmented in A05; no telemetry endpoint, storage, full payload capture or console scraping.

## Activate and read

In an authorized test browser, append \`?worldV2Trace=1\` to the tabletop page URL. When a test run begins, call in browser DevTools:

\`\`\`js
window.__worldV2Trace.clear();
\`\`\`

After performing a **single role-specific** test series:

\`\`\`js
const diagnostic = window.__worldV2Trace.snapshot();
console.log(diagnostic);
\`\`\`

The trace is **in-memory and opt-in**, limited to the most recent 256 events and 256 samples per named duration by default (configurable helper factory limit bounded 16–512 in isolated tests). Event counters saturate at safe integers. Clearing the trace removes event/duration samples, event counts, pending motion starts and prior frame timestamp.

Do not copy auth tokens, cookies, private Realtime payloads, raw RPC responses, IDs, coordinates, secret NPCs or users' information into the performance report. Do not enable generic network HAR/body capture as an alternative to this sanitized trace.

## Measurements and precise meanings

| Field or event | Meaning | Limitations |
|---|---|---|
| \`movement.local-first-position-paint\` | Time from **authorized local renderer grabbed event** to first changed visible token \`style.translate\` in the renderer | This is a **renderer position-style update**, not a measured physical mouse press timestamp or a guarantee that the browser compositor displayed the pixel |
| \`movement.remote-first-position-paint\` | Time from a **validated, already-rostered private observer path accepted** by renderer to first changed visible nonlocal sprite translate | It does **not** include server processing or wire delay before path receipt. Deferred/hidden/unknown paths never start a timer |
| \`authority.begin\`, \`authority.advance\`, \`authority.commit\`, \`authority.cancel\` | End-to-end JS Supabase RPC await duration on this client | Includes network/transaction time but does not reveal precise DB-internal processing; compare with read-only server-side stats at A06 |
| \`visibility.rpc\` | Viewer-scoped authorized visibility RPC await duration | Same client-side RTT limitation |
| \`render.frame\` | JS renderer callback work duration | Not end-to-end browser rendering or paint/compositing cost |
| \`render.frame-interval\` | Spacing between delivered renderer \`requestAnimationFrame\` callbacks (positive and under 1 second) | Excludes long background-tab suspensions; render callbacks only happen while scheduler is active |
| \`render.frame-gap\` | Foreground renderer frame interval longer than 50 ms | One event per qualifying interval |
| \`renderer.mount\`, \`renderer.unmount\` | Actual \`WorldCanvasStack\` effect mount/unmount | React Strict Mode or map identity change can legitimately remount; compare delta during ordinary moves |
| \`renderer.sprite-create\`, \`renderer.sprite-remove\` | Native authorized sprite node creation/removal | Not exact React child portal mount counts |
| \`renderer.terrain-assign\` | Persistent map terrain \`img\` source reassign | Count increases on legitimate map/artwork change, but should stay constant for ordinary motion |
| \`renderer.opaque\`, \`renderer.seal\` | Renderer conceal/authorization reset; \`renderer.seal\` has sanitized reason | A genuine revocation is correct security behavior, not automatically a performance defect |
| \`renderer.fog-full\`, \`renderer.fog-partial\` | Full or incremental fog paint | Interpret together with map publication, authorization changes and viewer scope |
| \`renderer.observer-await-vision\` | A path entered a cell not certified by currently painted sight and awaits an RPC | Not permission to render unrevealed coordinates |
| \`observer.sequence-gap\`, \`observer.resync\`, \`observer.unknown-piece\` | Private stream synchronization and roster-recovery cause | Observer is still receive-only |
| \`observer.sight-hold\` | Same-authority observer recovery retains previously certified pixels | **Reserved** for separately staged PR #71; it does not emit in unchanged A05 runtime until that recovery patch is approved and merged |

All newly introduced events and kind strings are allowlisted (\`local\`/\`remote\`); no arbitrary strings or packet objects enter the trace. \`positionPaint\` is recorded only after a previously **visible** sprite's position changes, not when it is initially mounted, hidden, or merely highlighted. Pending traces are cleared on movement cancellation, revocation, component unmount and disposal. No new RAF owner, network subscription or timed worker is introduced.

## A06 capture sequence

Use [A04 authenticated fixture](world-v2-authenticated-multiplayer-fixture.md). For each participant (DM normal, DM player-preview, P1, P2), with three distinct real accounts present:

1. Record build/commit, scene publication revision, whether fog and collision are enabled, device/browser, map class and nominal RTT.
2. Clear the trace **after** account/map setup, so first-load mount events are not mistaken for movement-induced remounts. Record the initial trace counters after clearing and before each scenario.
3. Perform an open-corridor single drag, rapid arrow burst and a remote token watch; repeat 20 times where required by PERF-02.
4. Save only sanitized \`snapshot()\` summaries with counts, p50/p95 and short bounded event windows. Note **NOT RUN**, **BLOCKED** or **FAIL** explicitly instead of fabricating data.
5. Compare locally observed gesture position time, client RPC RTTs, accepted path-to-render time, \`render.frame\` work, \`render.frame-interval\`, \`render.frame-gap\`, sight refresh, full fog/opaque events, terrain assignments and native sprite create/removes.
6. If a map flashes but the trace records **no** terrain assignment, opacity, full-fog paint or renderer mount, separately inspect CSS/browser compositor and React map parent changes. These counters cannot rule out all kinds of visual flash.
7. Classify actual causes before making B01–B10 protocol changes. Do not treat DM player-preview's local authority timing as proof that live RPC movement is fixed.

### Example expected fields, not example test data

\`\`\`text
counts['renderer.mount']
counts['renderer.unmount']
counts['renderer.terrain-assign']
counts['renderer.opaque']
counts['renderer.fog-full']
counts['renderer.fog-partial']
counts['renderer.sprite-create']
counts['renderer.sprite-remove']
counts['observer.sequence-gap']
counts['observer.unknown-piece']
counts['renderer.observer-await-vision']
durations['movement.local-first-position-paint']?.p95Ms
durations['movement.remote-first-position-paint']?.p95Ms
durations['authority.begin']?.p95Ms
durations['authority.advance']?.p95Ms
durations['authority.commit']?.p95Ms
durations['visibility.rpc']?.p95Ms
durations['render.frame']?.p95Ms
durations['render.frame-interval']?.p95Ms
\`\`\`

A missing metric means **no valid sample was captured**, not zero latency. A single metric cannot establish player experience or authorization; always use the full multi-role observation matrix.

## Non-goals and release control

A05 changes diagnostics only: no SQL migration, Supabase policy, movement authority, grant semantics, collision, visibility projection, sprite interpolation or frontend release. It is stacked on the A03/A04 documentation branches. Await exact-head CI and eventual independent designer approval before any merge/deployment. A06 is a **separate** step for authenticated live measurements and may require explicitly approved fixture setup/release; it has not happened in A05.
