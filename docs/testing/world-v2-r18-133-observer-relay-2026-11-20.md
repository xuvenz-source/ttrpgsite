# R18-133 — V3 observer relay and remaining six legacy sender boundaries

**20 November 2026, Australia/Melbourne.** Direct source-only child of R18-132 draft PR #240 at `757bf053c4ee758b298ecea0e536ded2656fd5c1`. R132 dedicated, standard and combined SQL checks were green on this exact parent. Original has **83 migrations**, QA has **zero migrations and zero public application tables**. **NO_GO** for hosted SQL, deployment, merge or production.

## Original six live Realtime sender functions (read-only source inspected)

These functions remain byte-for-byte unchanged in the original database and in `src/`. The original public/visibility engine code uses two legacy observer topic families:

| Function | Legacy topic / event | Source access and concealment to retain |
| --- | --- | --- |
| `forge_visibility.dispatch_movement_preview` | `forge-observer:<map>:<viewer>` / `motion` | Signed actor, ownership, map authorization, LOS and concealment |
| `forge_visibility.publish_approved_navigation_batch` | `forge-observer:<map>:<viewer>` / `motion` | Gesture actor, validated route, path visibility, rate limits |
| `public.advance_map_motion_session` | `forge-observer:<map>:<viewer>` / `motion` | Session owner, collision validation and cached observer LOS |
| `public.advance_map_motion_session_path` | `forge-observer:<map>:<viewer>` / `motion` | Session actor, approved path, observer LOS and fog updates |
| `forge_world_v2.bump_vision_epoch_v2` | `forge-world-v2:<map>:<viewer>` / `world-vision-v2` | Current viewer_on_map; epoch increments and environment/scene revision |
| `forge_world_v2.publish_approved_observers` | `forge-world-v2:<map>:<viewer>` / `world-motion-v2` | Signed session_valid, member enumeration, viewer position and concealed path |

**Transitive vision audit (read-only live original):** `forge_world_v2.bump_vision_epoch_v2` is also invoked from four SQL functions: `notify_party_source_change_v2`, `notify_roster_change_v2`, `signal_light_edit_v2`, and `signal_movement_vision_v2`. The first three are reached from **four enabled live original database triggers**: `world_v2_player_map_changed` on `public.campaign_player_maps`, `world_v2_campaign_map_changed` on `public.campaigns`, `world_v2_token_roster_changed` on `public.map_tokens`, and `world_v2_tool_light_change` on `public.campaign_tool_map_tokens`. These database changes can also be initiated without a signed `auth.uid()` through a trusted operation. **The R133 relay deliberately requires a signed actor and therefore cannot be substituted blindly for those vision sends.** R18-134 must design a *separate private server-only system-origin relay*, with current recipient membership/epoch and explicit trusted origin checks, instead of pretending any user can claim a privileged system actor. The fourth movement-related caller also requires its existing session checks to be preserved.

These are **six potential live legacy publishers**, not six confirmed exploit paths. **Already-connected** legacy Broadcast sockets are not forcibly removed by a new RLS predicate, and their original senders still require cutover. They enumerate current recipients or validate a map before sending. Yet their map+viewer legacy topic names are not R125 membership-epoch scoped; a previously joined listener after removal/reinstatement requires real server-side stop and resend-order proof. A call to `realtime.send` in an existing SECURITY DEFINER routine can bypass a separate scene-only gate unless that routine is explicitly converted.

The staged `legacy-observer-sender-matrix.json` pins the six exact original SQL MD5s and their existing event/topic families, confirms **zero of six live call sites are replaced** and requires individual preservation of LOS/concealment, collision, actor and rate-limit semantics.

## R18-133 isolated V3 observer relay candidate

`unapplied-v3-observer-relay.sql` is **NOT a hosted migration**. In disposable PG17, AFTER synthetic R125 epoch functions, R126 V3 scene policy, and R132 transaction-locked gate, it adds:

- A private `forge_observer_v3` schema. Authenticated users may only execute the safe Boolean receive predicate, not the privileged sender or any epoch table query.
- A private RLS SELECT policy on `realtime.messages` for a V3 observer topic of form `forge-world-observer-v3:<map>:<viewer>:<epoch>`. The predicate validates format then reuses R125's current signed actor, campaign membership, map routing and epoch checks. Revoking a member denies a fresh join and reinstatement rotates the epoch.
- `dispatch_authorized_observer_v3(map,viewer,event,payload)`: a trusted **server-only** private SECURITY DEFINER function, with **no anonymous/authenticated EXECUTE grant**. It restricts events to legacy observer motion/vision notices, enforces payload length/shape, supplied actor and viewer fields, current signed actor membership/map access and current recipient epoch. Its R132 `SELECT ... FOR SHARE` gate is acquired before any event emit, and membership row locking orders deletion relative to guarded sending. It never falls back to `forge-observer`, `forge-world-v2` or a shared map channel.

This helps establish the future V3 recipient boundary, but the relay **does not itself authorize token movement or compute line of sight**. The six trusted callers must retain their own movement, fog, LOS, session and collision authorization when replaced. The relay does not add per-frame/per-movement browser authentication requests; it is a server-side check on authorized **outbound notifications** only, and any performance effect must be measured.

**Crucial:** No existing caller calls the new relay. R133 adds a *candidate future interface*, not a guarantee that all six original senders have been gated. Do not merge or deploy this code in isolation.

## Synthetic PG17 verification and its deliberate negative control

The test uses fictional DM/P1/P2/outsider membership and an in-database `realtime.messages` log, which is **not** the actual Supabase WebSocket service. It tests default fenced state, V3 relay delivery to P2, signed RLS acceptance only for P2, outsider/wrong-actor denial, invalid JSON and event denial, membership DELETE, restored epoch replacement, off-map recipient denial, and maintenance cutoff.

A live database transaction test keeps a successful R133 dispatch open after it has acquired the R132 gate FOR SHARE lock; a parallel maintenance UPDATE with a short `lock_timeout` must fail until the dispatcher transaction commits. This verifies database transaction ordering for the **new relay only**, not network message delivery or unguarded SQL.

A deliberate trusted `realtime.send` directly publishes to an old `forge-observer:<map>:<viewer>` topic despite the gate being fenced. The old receiver policy and connection still represent a release risk. This negative control is proof **the six unreplaced senders and any service-role, client or Edge sender must be audited and cut over**, not evidence that old sockets are safe.

## Production NO_GO and next step R18-134

Stage exact-definition, hash-pinned replacements of all six SQL emitter call sites, preserving existing server actor/session/LOS/concealment behavior; require no legacy topic to be sent after R132/R133 gate closure. Validate old and new signed clients, reconnect/revoke/reinstatement, per-member observer packet absence, real fog redraw, movement latency, message fanout and free-tier limits. R123/R131 client quarantine, R125/R126/R127 maintenance rollout, R128 read/write fence, 67 RPC and 83 historical SQL reviews, Postgres Changes event handling and #220/#223/#229/#231 signed Storage links remain blockers.

Never patch provider-owned `realtime` internal schemas or bypass Redis/network authorization by invoking untrusted browser code. See [Supabase Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization) and [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).

**Manual work: none now. Original and QA hosted resources unchanged. Production NO_GO.**
