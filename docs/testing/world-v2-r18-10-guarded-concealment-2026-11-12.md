# B10-R18-10 — Guarded observer concealment takes priority over smoothing

**12 November 2026 · Staging only · Production NO-GO**

## Parent / deployment boundary

Stacked on audited R18-09 draft PR #111 at `f09d3b0d16138a223f101c3659d2cc40907a69fb`. Production remains R16 `main@90df8c960e79e8d66c322095611427da7bb09de4`. No frontend/SQL deployment, Supabase permission/realtime/DDL change, feature flag activation or paid infrastructure. The reviewed R05 SQL has not been applied.

## Defect

R18-04's separately gated and **default-OFF** 700ms guarded observer repair retains an already authorized renderer frame while a private sequence gap or unknown roster piece is reconciled using independently signed sight. While `guardedPending`, incoming same-generation frames were counted only as stream-cursor hints and their contents dropped. That included a private `action:'hide'` event for a previously visible token. Likewise a same-generation private `world-vision-v2` dirty notification called a potentially asynchronous sight refresh without synchronously concealing the retained image. These are real concealment signals, not cosmetic movement paths.

The combination meant an already-hidden NPC or LOS region might remain visible until a future signed refresh or the guarded deadline. The implementation previously fail-closed on explicit permission-generation change and disconnect, but not on the two signals above. This was a **staged exposure risk** because the guarded mode has not been activated in production.

## Narrow fix

In `src/engine/v2/RealtimeTransport.js`, ONLY when guarded mode is enabled:
- A validated same-generation frame with a `hide` action that arrives **during an active guarded wait** or **ahead of a sequence gap** immediately calls the existing full `resync('observer-guarded-hide')`, which synchronously seals the renderer before any awaited RPC. The transport does not infer the hide's relative sequence, grant unknown sprites or replay a private path.
- Any private `world-vision-v2` event **while guarded** immediately calls `resync('observer-guarded-vision-dirty')`, avoiding retention of potentially stale LOS/fog while an ordinary refresh is queued.
- Correctly ordered private hides outside recovery still hide only an already rostered sprite, as before. Late old hide frames remain ignored. Default-OFF transport behavior and ordinary successful movement are unchanged.

These responses deliberately trade an exceptional full concealment/redraw for the safety of immediate revocation. We do not optimize it away merely to suppress flashes.

## Verification

`tests/world-v2-r18-10-guarded-concealment.test.mjs` uses the actual transport and controlled Realtime/clock fixtures to test:
1. Known sprite hidden during an unknown-piece grace causes **synchronous seal**, timer cancellation and no late-path resurrection.
2. Gap+hide packet seals without entering grace.
3. Vision-dirty while guarded seals before asynchronous sight and ignores any stale guarded reply.
4. Contiguous known hide retains the existing targeted concealment, unknown hide reveals no private ID.
5. Stale hide cannot revoke a newer signed roster.
6. Default-OFF unknown-piece behavior remains fail-closed.
7. No accidental activation of guarded flag, public channel or sender method.

Run exact-head Node regression, Vite, CodeQL, World V2 isolated PostgreSQL and combined source-real SQL suites. Simulated visibility is **not** authenticated live LOS. The source-only test does not establish full browser privacy.

## Remaining release gates

Same as R18-09: secure real Supabase CLI 2.81.3 isolated 83-history fetch/body comparison and one-R05 dry run; explicit separate production client approval with signed 12s recovery ON and guarded 700ms OFF, verified DM/P1/P2 LOS and token privacy against current R16 SQL; further separately approved R05 migration; 24 protected multiplayer cases and Supabase Free RAM/latency/collision gates. The guarded mode stays OFF for initial release pending distinct revocation/LOS testing and separate authorization. **Never deploy simply because CI is green.**

### Step decision

**Staging candidate, NO-GO for production.** Preserve the frozen SQL and client-before-SQL release dependency. This step improves one concrete security correctness issue, not the measured sequential server movement latency.