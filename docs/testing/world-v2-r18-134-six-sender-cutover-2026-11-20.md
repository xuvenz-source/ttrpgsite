# R18-134 — Six exact-source V3 observer sender replacements

**20 November 2026, Melbourne.** Direct child of draft PR #241 at `4cb9c800d90129994b678b5369ab4f213ab1b6b0`. R133 final dedicated, standard, combined PostgreSQL checks passed. **NO_GO** for production, hosted QA, merges, versioned migrations, frontend changes, or deployment.

## Exact-source replacement contract

The original hosted Supabase functions were read **without modification** on 20 November 2026, and all six `pg_get_functiondef` MD5 values matched the pinned R129/R133 baseline. `immutable-original-six.json` records the exact original function definitions for lossless regression. `unapplied-six-legacy-observer-replacements.sql` is a separate **source-only, unapplied** candidate.

The candidate preserves the six full SQL bodies, replacing **eight** `realtime.send` call sites: **seven** use R133's signed-actor `forge_observer_v3.dispatch_authorized_observer_v3`; **one** vision-epoch call uses a new private trusted system-origin relay. There is no legacy `forge-observer:<map>:<viewer>` or `forge-world-v2:<map>:<viewer>` send in the six candidate bodies.

The six replacements are `forge_visibility.dispatch_movement_preview`, `forge_visibility.publish_approved_navigation_batch`, `forge_world_v2.bump_vision_epoch_v2`, `forge_world_v2.publish_approved_observers`, `public.advance_map_motion_session`, and `public.advance_map_motion_session_path`.

All existing movement session ownership, collision, validated path, LOS visibility/concealment, fog generation, throttling and scene revision logic remains part of the original full functions. The `publish_approved_observers` return count now increases only when the V3 relay acknowledges a send. A static byte-comparison regeneration test proves the intended call-site replacement is the only behavioral source rewrite besides this count condition. **This is not yet a proof that every movement branch behaves identically at runtime**: client V3 observer subscriptions and real signed-user/LOS/fog stress tests still need implementation.

## Trusted system-origin vision is separate from signed user movement

Four enabled original database triggers create visibility changes through `notify_party_source_change_v2`, `notify_roster_change_v2`, or `signal_light_edit_v2`, ultimately calling `forge_world_v2.bump_vision_epoch_v2`. These paths can run with a NULL `auth.uid()`. Reusing the signed-user motion dispatcher would silently suppress these notifications.

The new private `forge_observer_v3.dispatch_trusted_vision_v3(campaign,map,viewer,payload)` therefore:

- Is **not callable by authenticated or anonymous roles**; it is for already trusted database functions operating under their original invocation and trigger permissions.
- Uses the existing R132 transaction-scoped `FOR SHARE` maintenance gate, requires matching campaign/map, verifies current `viewer_on_map` player assignment and resolves the recipient's **current R125 membership epoch**.
- Requires a bounded JSON object with a matching map, viewer and V2 vision payload version, and sends only to `forge-world-observer-v3:<map>:<viewer>:<epoch>`. It never sends to an old observer topic or falls back on error.
- Does **not** calculate token LOS or establish original trusted caller authorization. That remains the responsibility of the six preserved functions and their original triggers. A privileged direct SQL caller remains a separate trust boundary.

The seven signed actor emissions continue to use the R133 private relay, including its actor membership/map, recipient epoch and maintenance checks. All checks run at server-side notification boundaries rather than making an extra browser RPC for each movement or render frame. **Performance and fanout costs have not yet been measured on live Supabase**.

## Disposable PostgreSQL 17 checks

The isolated runner installs fictional R125 membership/epoch, R126 scene recipient policy, R132 gate, and R133 observer relay, plus structural table stubs for the six full original definitions. It compiles the R134 replacement SQL, verifies all six function bodies now call the V3 relay and none directly calls `realtime.send`, then exercises the trusted sight path:

1. In default fenced mode, a no-JWT trigger-style vision update increments the epoch without emitting a notice.
2. With trusted V3 mode enabled, a no-JWT update sends a private `world-vision-v2` notice carrying the original environment revision, permission generation, viewer and counter.
3. Removing P2 prevents new notices; reinstatement rotates the epoch and new observer topic; assigning P2 off-map suppresses the old map's notices.
4. An emergency maintenance fence blocks the trusted origin. Browser roles cannot invoke its function or inspect the private gate.
5. Legacy movement RPCs retain early signed-actor/null-gesture rejection, and every compiled candidate uses V3 relay instead of a direct legacy sender.

PostgreSQL's synthetic `realtime.messages` table logs database-side calls only. It does **not** reproduce Supabase socket delivery, existing join-time policy persistence, client fog rendering, path concealment, transaction throughput or full production schema dependencies. Compilation with fictional stub tables is not the same as a full original-schema rehearsal.

## Release state and next R18-135 gate

The original has **83 migrations** and QA has **zero migrations and zero application tables**. Nothing has been applied to either project; `src/` and `supabase/migrations/` remain unchanged. These SQL definitions are for review and disposable PG17 compilation only, **not a production-ready migration**.

The remaining risks include the R123/R131 access sentinel and synchronous client teardown, R125/R126 V3 recipient transport and browser migration, R127/R128 hard server maintenance/rollback contract, remaining client/external Broadcast and 17 Postgres Changes feeds, all 67 public privileged SECURITY DEFINER RPCs, all 83 original migration bodies, service-role membership/TRUNCATE paths, Storage bearer URLs (#231), and real signed DM/P1/P2/outsider revocation/visibility/collision/performance testing. Open issues #220/#223/#229/#231 persist.

**Next R18-135:** integrate an explicitly versioned V3 client observer alongside an all-or-nothing server publication cutoff, then verify old already-connected V2 sockets cannot receive new protected payloads across scene/observer and alternate feeds. Use free-tier staging resources only after the complete security gate; no premature QA or production deployment.

**Manual work required now: none. Production remains NO_GO.**
