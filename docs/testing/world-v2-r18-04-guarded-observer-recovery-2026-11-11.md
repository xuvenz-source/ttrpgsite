# B10-R18-04 — Guarded private observer roster and sequence-gap recovery

**11 November 2026 · STAGING ONLY / PRODUCTION NO-GO.**
**Source parent:** R18-03 branch PR #105 `d9f1a24ee7b123a39de3117242a08146436e45d8`, based on current production R16 `90df8c960e79e8d66c322095611427da7bb09de4`. Includes source staged R18-01/02 and the nonapplied, immutable integrated B03/B07/B08/R01/R03 SQL candidate; R17 keyboard correction PR #102 remains an independent unmerged dependency.

## Why R18-04 exists

The passive Player 2 R16 live trace had **51 admitted private motion frames**, **2 unknown-piece**, **2 sequence-gap**, and **4 full renderer seals** with 312–424 ms opaque/fog resets. Legitimate missing paths, new roster certifications and packet delivery races are possible, but the trace cannot identify one unique backend cause. A motion packet is NOT a signed roster grant. The current client seals everything immediately on either fault; that is safe but produces flicker. R18-02's signed sight watch fixes quiet lost-terminal drift only **eventually** (12 s) and is not an immediate fallback. R18-03's exact backend terminal migration helps ordered private flush and stale-path retirement but cannot guarantee Realtime packet delivery or viewer roster transitions.

## Narrow R18-04 client change

1. **Default disabled independent opt-in** `VITE_WORLD_V2_OBSERVER_GUARDED_RECOVERY=1` in non-preview viewer. With unset flag, every historical hard-fail rule and stream remains unchanged. This PR does NOT set Vercel environment variables or deploy.
2. Only a **valid, same-map, same-viewer, same scene/permission-generation** private frame that is missing an expected sequence or refers to an unrostered token may enter a **700 ms scheduled guarded recovery deadline while the JavaScript event loop is active**. Background tab suspension can delay timers; the runtime additionally hard-seals an in-progress guarded recovery when the page becomes hidden and reauthorizes if needed on foreground return. Unknown movement coordinates/IDs are NEVER rendered, added to sprite roster, stored in a queue, or included in diagnostics. All new movement packets are stopped while recovering, and only their sequence numbers update a bounded required-cursor watermark (maximum 16 packets).
3. The observer retains its **previously independently authorized** static frame during this short hold. It never reveals new fog, lights, previously hidden NPCs or positions from the problematic packet. The runtime requires a **fresh viewer-authenticated signed `get_world_visibility_v2` snapshot**, accepted FIRST by `WorldRenderer`, before the transport may realign its cosmetic roster/cursor. Up to three attempts share a single gated recovery window. The signed cursor must cover all observed dropped sequence hints, and the exact viewer, map, scope, permission and scene revisions and all signed positions must match. A newly certified hide removes the concealed sprite using the existing renderer authority; stale origin fences reject older route replay. No novel public API or channel.
4. **Fail closed**, with full current seal + server-signed reacquisition, on malformed/secret-bearing packet, scope/scene/permission generation change, disconnect, invalid/stale or denied signed sight, >16 additional packets, 700ms deadline, or any exception. Disposal/revocation clears timeouts and rejects delayed async answers. DM preview never uses this network transport or recovery flag. The older R16 rendering origin/backlog path still uses its own separate signed sight gate.
5. Telemetry uses allowlisted, identity-free `observer.guarded-start`, `observer.guarded-held`, `observer.guarded-recovered` and existing `observer.seal` counters. No maps, identifiers, private walls, routes, JWTs or player details are logged.

**Privacy caveat:** The previously signed view remains during the active 700ms timed hold, subject to browser timer scheduling. JavaScript suspension cannot guarantee a literal wall-clock upper bound; entering background during guarded recovery triggers fail-closed concealment, while foreground return reauthorizes a locked stream. That information was previously authorized, but it can become *stale* if a permission/visibility transition occurs concurrently. Any detected generation/permission change or signed denial immediately revokes it; the enforced timeout is an additional bound, **not a guarantee of instantaneous role/LOS revocation under network loss**. Do NOT activate on protected campaigns without an authenticated multi-account penetration test of hidden NPC departure, full map visibility revocation, fog boundary and packet tampering. An observer receiving a new signed hide must never retain it. Retaining old signed state is an intentional security/performance tradeoff subject to designer approval, not a blanket declaration that flashing is solved.

## Tests and acceptance gates

`tests/world-v2-r18-04-guarded-roster-recovery.test.mjs` covers:
- known-visible and formerly unknown NPC: no path rendered before independent signed roster acceptance, then only subsequent certified path may animate;
- missing middle sequence: no speculative segment replay; signed cursor reconciliation and origin-fenced late path;
- forged viewer/secret-bearing/malformed packets and scene or permission change still hard-seal;
- out-of-roster hidden NPC never appears even when server response continues to conceal it;
- timed 700ms deadline: hard conceal even if signed sight is stuck, and late result cannot authorize;
- unaccepted scope: immediate fail-closed path;
- more than 16 dropped packets: no memory queue, seal;
- disconnect and unmount: abort timer, no new channel, never authorize late results; backgrounding during guarded recovery immediately requests fail-closed sealing and a locked foreground resumes signed authorization;
- default-off previous behavior, no preview channel, and privacy-safe telemetry.

The historical R18-01 51-frame, two-unknown/two-gap test deliberately remains **default-off** and proves no silent weakening. R18-02 lost-terminal tests and R18-03 frozen SQL provenance/real source hostile PostgreSQL 17 suite must all pass on exact head. GitHub CI verifies Node, real Chromium, Vite production build, lint, audit, CodeQL and private PG17 authority; it does not substitute for live real-Auth protected fog testing. No automatic previews or production deploys.

## Integration and release gates

- **R18-05 consolidated branch** must integrate independent R17 keyboard PR #102 against current `main` and the combined R18-01/02/03/04 stack without overwriting newer runtime. All staged branch ledger entries must remain traceable.
- Before protected activation, prove in real signed DM + Player 1 + Player 2 test accounts that a newly hidden NPC never remains visible beyond the approved grace and that genuine role/map revocation is immediately concealed on signal. Include 24-case fog/LOS, wall/door, light-source, party-shared and per-player fog, 2×2 token, preview-local, simultaneous gestures, sequence skip, unknown roster, malicious packet, disconnect, background tab, session expiry, transition mid-recovery, held DM drag, and high-rate Realtime flood.
- Measure pre/post **renderer.seal**, `renderer.fog-full`, sprite create/remove, idle screen-fog flicker, Advance/Commit/visibility RPC p50/p95, and per-viewer latency. Validate no more than three extra signed sight attempts per fault window, and Supabase Free RAM/SQL load stays acceptable with 2–10 viewers. If timeout mostly expires or stale-role exposure is observed, return **NO-GO** and redesign rather than increasing grace blindly.
- R18-02 12-second independent watch remains OFF until specifically approved. Frozen R18-03 R05 migration remains NONAPPLIED; all historical migration-version/privilege/catalog digest checks must be rerun immediately before a separately authorized **targeted** live installation (not generic `db push`). Recover via reviewed manual four-original-function restore if needed. No paid staging DB or tier required.
- Do NOT claim this gated client path solves the root server delivery mechanism or makes Realtime lossless. We cannot guarantee no full blackout on genuine invalid/permission events; those must still fail closed.

**Decision:** staging/CI only; no production code, database, RLS, Realtime grants, Edge Function, test campaign or Vercel configuration changed. Next action is a single integrated security/release review, not incremental live patches.
