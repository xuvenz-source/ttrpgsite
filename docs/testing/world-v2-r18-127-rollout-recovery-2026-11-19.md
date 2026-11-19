# B10-R18-127 — Fail-closed scene V3 rollout and rollback

**19 November 2026, Australia/Melbourne.** Direct source-only child of draft PR #234 at b37bc136ee39d2045d32703a2d08079f375256f6. **Production NO-GO.** No hosted SQL, versioned migration, live src/ change, merge, deployment, paid service or QA initialization.

## Read-only current-state verification

Original Supabase retains 83 migrations and its named World V2 scene publication receive policy. The R126 V3 recipient receive policy and get_authorized_scene_channel_v3 RPC are absent. QA retains 0 migrations and 0 public application tables. Thus R125/R126 are staged, not operational. The live V2 scene transport still subscribes to a map-wide forge-world-scene-v2 topic.

src/TabletopApp.jsx selects the V2 board with two existing VITE_WORLD_ENGINE_V2 / VITE_WORLD_ENGINE_V2_READY build flags, not a V3 release-negotiation gate. Neither new browser bundles nor future RLS policies can force already-open V2 tabs to update. Supabase Realtime Authorization validates channels when joining; previously joined sockets do not automatically disconnect after membership or policy changes. See https://supabase.com/docs/guides/realtime/authorization .

R18-123 CampaignAccessSentinel.js and CampaignRevocationTeardown.js and R18-126 SceneV3Transition.js remain dormant in staging. The live code does not import them. R18-126 SQL replaces the map-wide publisher with a per-recipient sender, but this change cannot atomically update old browser sessions.

## Selected release strategy: maintenance, not unproven zero-downtime upgrade

Before the database/client cutover, the server must demonstrably block continued old-client access to sensitive scene, fog, sheet, token and write operations, and quiesce old shared scene publications. A maintenance banner, client-side mask or VITE flag alone cannot revoke already-open sockets, cached views or previously issued Storage bearer links. Previously received bytes cannot be erased remotely.

### Ordered future operations (none executed by this package)

1. **Freeze and preflight.** Pin the full reviewed server SQL, browser bundle, rollback artifact and original migration history to commit SHA; audit all 83 private SQL bodies and 67 authenticated privileged RPC chains, check free-tier limits and obtain explicit future authorization.
2. **Server-side hard fence.** In an independently approved implementation, temporarily deny old-client scene/fog/sheet read/write access and old shared event delivery. Demonstrate denial with a previously connected old browser, offline/reconnecting tab, stale JWT, DM, P1, P2 and outsider. Mask and unmount cooperating clients before clearing asset subscriptions. A UI maintenance page is insufficient.
3. **DB recipient-V3 transition.** While the fence holds, apply reviewed and approved R125 epoch dependencies followed by R126 V3 private receive policy / publisher cutover. Prove no map-wide V2 sender remains, the old RLS receive policy is retired and persisted scene generations remain monotonic. Test remove-vs-publish races.
4. **Client V3 transition.** While still fenced, deploy and verify the new V3-compatible client, mount R123 synchronous mask and teardown, and join only fresh signed actor/map/epoch channels. Refuse fallback to V2 and reject stale callbacks. Require a fresh server-authorized scene before unmasking.
5. **Signed QA.** Exercise real DM/P1/P2/outsider and removed/reinstated users on isolated approved QA, including old and reconnecting sockets, Postgres Changes, unauthorized sheet/fog reads, Storage links and all privileged RPCs. Measure scene fanout, transaction lock wait, Realtime quota and movement/fog quality.
6. **Release review then open V3 only.** A separate explicit human authorization must confirm current SHAs, zero unauthorized old clients, functioning signed V3 entry and measured $0 costs. Lift maintenance for verified V3 clients only, keep old-client denial permanently and monitor live metrics.
7. **Abort / rollback.** Any mismatch, leak, failure or latency regression requires maintaining/restoring the server-side hard fence and returning clients to maintenance-only mode. Roll back incomplete SQL transaction effects as reviewed, but NEVER silently re-enable legacy map-wide V2 publishing just to restore apparent availability. A rollback is not considered complete until server-side denial is independently proven.

**Operational blocker:** No production server-side maintenance/protocol fence exists from R123-R126. A source-only state-machine artifact cannot create it. Consequently this runbook cannot yet be executed safely, and a no-downtime switch is not verified.

## Executable offline evidence interlock

The dormant SceneReleaseInterlock.js has no SQL, deployment, network, DOM, timers or event listeners. It only records a pinned commit and unique checklist receipts. Allowed transitions are: planning -> fenced -> server-v3 -> client-v3 -> signed-qa-v3 -> ready-for-human-release-review. Missing and stale evidence or skipped stages are rejected. It NEVER grants production authorization. An abort becomes abort-required rather than pretending that server traffic stopped. Independently proved server-side fencing is required before aborted-fenced. Reopening V2 is not supported.

Critical revocation and privilege issues, including server-side membership enforcement, are not waivable through this checklist. Signed Storage exposure must be remediated rather than ignored; any residual risk needs a separate reviewed decision outside this interlock. Receipts in this model can be fabricated by a caller; they are not cryptographic proof or a substitute for real QA. The pure sceneClientCompatibility function predicts that V2, mismatched versions, missing signed membership, absent mask or maintenance state must stay masked. It grants no server access. The tests exercise model ordering and negative cases, not real old-browser revocation.

## Free-tier performance and security gates

Do not add membership network calls to pointer movement, arrow movement, collision, fog paint, rendering or every scene notification. Measure V3 join latency only on map entry/reconnect, per-recipient scene publication fanout, database lock waits, Realtime bandwidth/egress, visible fog and movement quality. Verify no map flashing, rubber banding, token mismatch or render invalidation loops. Derive quantitative thresholds from actual signed QA rather than inventing measurements.

R18-123 teardown requires an actual view unmount before clearing SignedAssetUrls; clear() can re-sign still-subscribed artwork. Existing issued 3600-second Storage bearer URLs remain valid until their expiry, notwithstanding client logout or RLS. Security issue #231 requires separately approved exposure-window or asset-delivery resolution.

Outstanding release gates: #220 revoked sheets, #223 membership removal, #229 service_role TRUNCATE/identity mutation, #231 signed URL revocation; R18-104 fog metadata and R18-114 UUID inventory; 67 privileged RPC audit; 83 private historical SQL body review; QA schema bootstrap; real signed DM/P1/P2/outsider tests; live WebSocket old-tab isolation and performance acceptance.

**Manual work now: none. Future release will require explicit approval and access to signed QA testers. Production NO-GO.**
