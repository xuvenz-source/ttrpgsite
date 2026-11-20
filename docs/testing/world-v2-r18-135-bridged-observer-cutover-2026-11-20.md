# B10-R18-135 — Dormant V3 observer bridge, synthetic old-socket audit, and coordinated cutover NO_GO

**20 November 2026, Melbourne.** Direct isolated child of R18-134 draft PR #242 at `bdfa855c67cd5e96b7d1a9e3e6487c1fae9c1103`, whose dedicated, standard, and combined staging-only PostgreSQL checks all passed. **No versioned migration, live frontend source, hosted QA/original SQL, merge, deployment or paid infrastructure. Production NO_GO.**

## Source-of-truth and deliberate scope

R18-134 has exact-source replacements for **six** legacy observer SQL functions: seven signed-recipient V3 relay calls and one trusted no-JWT system-origin vision call, while R132 protects the seventh direct database sender, the map scene-generation publisher. All SQL is **unapplied**; the original still has **83 migrations**, seven legacy SQL senders and the old map-wide V2 scene policy. QA has **zero migrations and zero application tables**.

R18-123 supplies a dormant campaign membership sentinel, R18-126 a dormant V3 scene transition, R18-127 a stage-by-stage **FENCE → SERVER V3 → CLIENT V3 → SIGNED QA → HUMAN REVIEW** evidence interlock, R18-128 a disruptive public-schema maintenance freeze candidate, and R18-131 a dormant client stream quarantine for 19 Postgres Changes listeners. None is wired into the production application.

**Important R128 incompatibility:** the staged maintenance freeze revokes `USAGE` on the public schema, which also denies the public `get_authorized_scene_channel_v3` RPC needed by R126 and this client bridge. Before any hosted rollout, a server-side protocol-specific access/fence strategy must provide the V3 membership RPC while *continuing* to deny all old-client reads/writes. Restoring blanket `public` USAGE would reopen legacy interfaces. R135 does **not** solve that server-side conflict and is therefore intentionally NO_GO.

## Preserve the smooth original movement engine

The original `src/engine/v2/RealtimeTransport.js` already performs strict `world-motion-v2` frame validation, server-authorized viewer sight/roster and stream cursor checks, sequence gap handling, guard recovery, hide-first concealment and token path rejection. Duplicating that logic risks reintroducing rubber banding, fog flashes or path leaks.

R135's **dormant**, staging-only `ObserverV3ChannelBridge.mjs` keeps using the exact existing `createWorldRealtimeTransport` through a restrictive DB channel adapter, with **no `src/` change**. The old transport requests its familiar `forge-world-v2:<map>:<viewer>` topic *inside the process only*; the bridge **never passes that name to Supabase**, and instead opens exactly `forge-world-observer-v3:<map>:<viewer>:<epoch>` after an independently signed `auth.getUser()` check and the current actor's R125 `get_authorized_scene_channel_v3(map)` RPC. It rejects invalid map/user/epoch, stale context, unexpected channel/event, unconfirmed synchronous mask, failed unsubscribe and account changes. A second `SUBSCRIBED` following socket reconnection forces a new signed epoch and a new underlying private V3 channel; old callbacks can no longer invoke movement.

The bridge requires an explicit host-supplied R127 release-evidence tripwire stating server V3 mode, old sender fences, legacy API denial and a signed/masked scene. **This evidence flag is not an authorization certificate; a compromised browser can forge it.** The real private Realtime RLS join, signed topic RPC, actor map/sight checks and server-side publisher fencing provide actual security. The bridge never unmasks the campaign: an authorized observer cursor and signed sight only notify the host that *observer transport* is ready. The R126 signed scene, R123 membership gate and complete R123/R131 teardown must also be mounted before any sensitive view can be revealed.

The current V2 renderer also already validates recipient `world-vision-v2` events; the bridge will not forward a vision notice to the host before accepting signed sight. It never adds a browser RPC, token payload upload or Realtime join to the movement, collision, pointer drag, arrow-key or frame-rendering hot path. **Synthetic frame-count tests demonstrate no new authorization calls during event processing; they do not measure real latency or bandwidth.**

## Already-connected V2 socket: what source-only proof can and cannot show

R135's separate disposable PG17 fixture records three *standing legacy topic names* — map-wide `forge-world-scene-v2:<map>`, `forge-world-v2:<map>:<viewer>` and `forge-observer:<map>:<viewer>` — to model an already-joined old browser without operating actual WebSockets. It installs fictional R125/R126/R132/R133/R134 candidate SQL, obtains private DM/P2 epochs and performs trusted scene + trigger-style vision publications in `v3-only` mode. It asserts the generated messages target only current recipient V3 topics, then deletes P2 membership and confirms no new P2 or legacy topic notice. Closing the R132 gate prevents further candidate notices.

**Crucial negative control:** a privileged *unguarded* direct `realtime.send` still produces a message on a standing old V2 topic even while the gate is fenced. Thus the test proves **candidate-emitter isolation only**, not that an already-connected V2 socket is actually disconnected or cannot receive messages from other emitters. Supabase private channel permissions are checked at subscription/join and cannot be retroactively relied upon for immediate existing-socket revocation; see [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization). Postgres Changes 17-table subscriptions, client-origin and Edge/REST broadcasts, Presence, other privileged sender functions, queued events and pre-issued signed artwork URLs remain outside the mock.

The mock `realtime.messages` table is a fictional persistent send log, whereas Supabase's real `realtime.messages` is used for Realtime authorization and does not persist these broadcasts. No test invents a result for real network delivery.

## The *actual* coordinated release path, blocked pending evidence

1. **Fence:** independent maintenance owner verifies all sensitive rendering masked, old clients denied server-side, all seven direct SQL publishers and client/Edge senders fenced, in-flight protected writers/drainers quiesced and post-revocation old sockets cannot get new data. This requires real sessions and real Realtime, not only R135 mocks.
2. **Server V3:** apply reviewed source lineage R125/R126/R132/R133/R134, retain old V2 topic retirement, current membership per-recipient epoch and full R128-compatible V3 public RPC authorization. Verify no legacy routes are accidentally reopened.
3. **Client V3:** integrate R123 synchronous mask/teardown, R126 authorized scene, R131 Postgres Changes quarantine and R135 observer bridge in one pinned release; no V2 fallback, no old channel resubscribe, and no reveal before full signed scene + observer sight.
4. **Signed QA:** test DM/P1/P2/outsider; account removal, reinstatement, multiple tabs, off-map assignments, old connected socket, foreground/reconnect, 17 Postgres Changes feeds, signed Storage URL exposure (#231), movement/drag/collision/LOS/fog and free-tier performance.
5. **Release:** only after R127 all-phase human review, complete 67 privileged RPC and 83 original migration audits, unresolved #220/#223/#229/#231, and rollback/fence drill. Abort to **server-side maintenance fenced**, never to old V2 publishing.

The staged `cutover-risk-matrix.json` explicitly marks `oldSocketDeliveryStoppedInProduction:false`, `hostedSignedQaPerformed:false`, `v3BrowserIntegrated:false`, `realMovementPerformanceVerified:false`, `postgresChangesCovered:false`, and `preissuedStorageUrlsRevoked:false`. These must not be promoted to true based on synthetic success.

**Next R18-136:** reconcile R128 hard public-schema freeze with signed V3 RPC access and old-client server denial, then run actual signed-user QA once a fully authorized $0 staging rehearsal is approved. No hosted test action or manual user work is requested at this stage.
