# B10-R18-131 — Post-revocation client stream quarantine and legacy Broadcast boundaries

**20 November 2026 (Australia/Melbourne).** Direct child of R18-130 draft PR #238 at `bac02f6bc9769fd5ddc9dc3e6a91b4fa44c0b20e`. Source-only. **Production NO_GO.** No frontend `src/` changes, hosted SQL, versioned migrations, merges, QA bootstrap, deployments or paid infrastructure.

## Verified baseline

At the R18-130 parent all dedicated source, standard build/security and combined staging PostgreSQL integration checks passed. The static source inventory captured exactly **19** Postgres Changes declarations across **7** files: **16** wildcard `event:'*'` handlers, **19** filtered subscriptions, **0** explicit column projections, and one known dynamic table target (`characters`, `npc_templates`, `map_tokens`). The original `supabase_realtime` publication has **17** RLS-enabled tables, all using default replica identity. `map_tokens` lacks an authenticated base-table SELECT grant.

A fresh read-only original query still found five authenticated Realtime Broadcast SELECT policies and one authenticated INSERT policy. The named V2 map-wide scene receive policy remains; no V3 private topic RPC or V3 recipient policy has been installed. Both private channel join authorization and per-event Postgres Changes RLS need independently signed verification.

**Supabase removeChannel returns `'ok'`, `'timed out'`, or `'error'`.** A timeout is not an authenticated disconnect. See https://supabase.com/docs/reference/javascript/removechannel . Supabase Realtime private Broadcast uses join authorization (not forced immediate disconnection of already-joined sockets), whereas Postgres Changes authorization is checked per event for INSERT/UPDATE. DELETE and filtering need separate verification. See https://supabase.com/docs/guides/realtime/authorization and https://supabase.com/docs/guides/realtime/postgres-changes .

## Current source payload classification (not a claim of live exploitation)

`stream-risk-matrix.json` ties all 19 observed listener declarations to future handler contracts. **Fifteen** can be refactored to consume only a stripped table/event-type refresh hint and re-query authorized data. Four need additional review because they currently consume event fields for immediate token and fog behavior:

- `TabletopApp.jsx` map token events can update visible canonical positions directly. The future adapter must verify the signed current map/viewer context, and its domain validator must not trust a revoked player merely because an old socket delivered a packet.
- `useAuthorizedMapFog.js` two per-viewer visibility-tick listeners use `event.new` through `adoptVerifiedViewerTick`; these deliberately exclude DELETE and must retain that choice.
- The global fog tick listener uses `event.new` to invalidate prior sight; it must not accept DELETE as a signed full visibility frame.
- `TabletopApp.jsx` campaign routing currently checks `event.new.user_id` before re-querying. A future hint-only replacement may refresh the current user's routing unconditionally, after signed current-member verification, without using the event's user ID as authority.

Preserve deletion UX: **do not simply replace wildcard listeners with INSERT/UPDATE** on chat, roster, tools, leases and routing. DELETE notifications may be required to clear stale cached UI, yet the existing filtered DELETE events are not guaranteed or sufficient as a security revocation mechanism. Future rollout must provide a server-authoritative reconciliation/fence path. Never silently adopt untrusted `event.old` record contents.

## Broadcast and Presence boundaries

The matrix separately identifies four important existing Broadcast consumers.

1. `vtt-routing-<campaign>` in `TabletopApp.jsx` is **not declared private**. Its `routing-changed` and `monitors-changed` payloads are refresh hints. They must remain untrusted input and be rate-bounded server-side; signed member checks must protect the subsequent database read. Untrusted public Broadcast is not a permission grant.
2. `forge-map:<map>` measurement transport **is private** and accepts client-origin measurement fields after a local packet check. Current Realtime sender/recipient RLS must still be validated for actual actor authenticity, spoofing and post-removal access. Realtime access alone does not authenticate the `payload.actor` field.
3. `forge-world-scene-v2:<map>` is a private but shared map-wide scene-generation channel. R125/R126 propose per-recipient V3 epoch topics; these are **unapplied**. An old joined socket may still be present until the **server** retires the publisher and removes/denies access.
4. `forge-world-v2:<map>:<viewer>` private observer movement/vision notices also require independently verified sender fanout and removal/epoch behavior. The observer renderer's current signed-sight checks are useful but not an established network cutoff.

Presence `vtt-presence-<campaign>` is another public channel family owned by `useCampaignPresence.js`; it exposes pseudonymous online state for roster refresh and is **not made secure by this R131 adapter**. Explicitly audit its join/send policies and denial on old connected clients before a production V3 cutover. The four-item Broadcast matrix is **not an exhaustive channel census**.

## Dormant client cutover candidate

The staging-only `StreamRevocationQuarantine.mjs` accepts an existing **R18-123 signed membership sentinel**, a live campaign/user/map context, a host callback that must return `true` *synchronously* after covering all sensitive content, and a Supabase client with `removeChannel`. The host must wire the sentinel's `onAllow` so it **cannot unmask content merely because membership is true**; a fresh V3 scene and fully armed quarantine are also required. The sentinel is dormant itself.

The adapter intentionally does not create channels or call `.on()`; callers must register every future subscription **before** calling `.subscribe()`, use only the returned guarded callbacks, and ensure any async UI work verifies `isCurrent()` after awaiting. A channel can host multiple table listeners and is removed only once.

On explicit reconnect, membership hint or focus, the adapter invalidates the old epoch and synchronously masks the UI, removes all tracked channels, requires every removal response to be **exactly `ok`**, and asks the signed R123 sentinel to verify access again. Removed, timed-out, uncertain or stale contexts remain locked. Old channel objects may not be reused. A server denial, maintenance-fence notification, changed account, or map reassignment is terminal for automatic reopening; a new explicit signed `begin()` is required. No authorization RPC is made for movement, pointer dragging, fog painting, individual events, or animation frames.

`refresh-only` wrapped callbacks receive only `{kind,table,eventType}`; raw `event.new` / `event.old` never reaches that callback. Four audited `validated-payload` handlers require a host domain validator and receive raw INSERT/UPDATE only when the current signed scope is armed. DELETE is converted to a sanitized re-query hint. The validator itself must be reviewed for row-level identity, fog and observer access; a client boolean result is never a server permission certificate. Async callbacks must use the supplied `isCurrent` after awaiting; an uncooperative callback can still modify UI. R123's full synchronous teardown and renderer unmount remain mandatory.

**Critical:** this is a **client callback/teardown quarantine**, not a server-side delivery fence. It cannot withdraw bytes already received, prevent unsolicited events from arriving at the socket before the client detects revocation, terminate remote legacy clients, or invalidate pre-issued Storage bearer links. The `oldSocketDeliveryStopped:false` and `serverAuthorizationProven:false` results deliberately remain false. The adapter is *not imported into the live app*.

## Verification and remaining release gates

Offline Node regressions must cover synchronous mask order, verified re-entry, multiple listeners per channel, stale callbacks, wrong table/event, sanitized DELETE, strict Supabase `removeChannel='ok'`, timed-out and rejected removal, signed proof delay, new map/account, critical server denial, and no per-event or per-frame network requests. The tests do not exercise real Supabase WebSocket servers, Postgres Changes DELETE behavior or signed actor removal/reinstatement.

Open blockers: R18-123 mounted access sentinel/complete teardown, R125/R126 recipient V3 private scene cutover, R127 coordination and R128 hard server fence, full 67 privileged-RPC semantic audit and 83 historic migrations, service_role and membership mutation paths, #220/#223/#229/#231 and Storage signed links, full campaign cache/handout/sheet/chat/asset teardown, real signed DM/P1/P2/outsider QA, old pre-connected socket tests, and $0-tier Realtime/fog/movement budgets.

**No manual work is required now. Production remains NO_GO.**
