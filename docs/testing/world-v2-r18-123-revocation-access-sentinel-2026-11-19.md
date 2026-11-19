# B10-R18-123 — Revoked campaign access, live data teardown, and free-tier movement protection

**19 November 2026, Australia/Melbourne.** Strictly source-only, unmounted design and Node regression package. Direct parent [R18-122 draft PR #228](https://github.com/xuvenz-source/ttrpgsite/pull/228), pinned at `1616cb82cd34f2993f4b021d57749465d99e4577`. Neither original nor QA Supabase is changed, no forward migration, no merge, no preview/production deployment and no paid infrastructure.

## Findings grounded in actual current source and read-only original catalogs

1. **Original Realtime publication cannot provide membership revocation notifications.** A read-only `pg_publication_tables` query showed `campaigns`, `characters`, `map_tokens` and `campaign_player_maps` are published; **`campaign_members` is not**. `campaign_members.relreplident` is default (`d`). `src/TabletopApp.jsx` subscribes to `characters` changes for roster refresh plus focus/presence reconciliation, not to membership INSERT/DELETE. A player removal therefore has no guaranteed immediate membership event to that tab. Merely publishing DELETE events is not sufficient: Supabase documents that DELETE changes are not subject to the normal RLS authorization check and can expose old-row primary keys; real-time channel authorization also has reconnect/JWT freshness limitations. This is a reason **not to add an unreviewed client DELETE subscription or broadcast names/IDs**.
2. **The client does not automatically exit on a membership deletion.** `src/TabletopApp.jsx` uses `activeId` and `roles` derived from campaign roster fetches; session authentication stays valid after a DM removes a campaign membership. The existing `activeId` reset clears portions of React data but does not constitute full access eviction. Existing RLS and privileged RPC authorization must independently deny all new server reads/writes on revocation; R18-115 confirmed a separate revoked-character-sheet owner path needing repair.
3. **Multiple independent campaign data owners require teardown.** The main component has token, map, fog, chat, player sheets, editor popouts, pending movement, sheet write queues, quick caches and Realtime channel refs. `useAuthorizedMapFog` is scoped by user/campaign/map; `useCampaignHandouts`, `useCampaignTools` and `useCampaignPresence` tear down listeners on context/unmount, while `engine/v2/WorldV2Board.jsx` disposes its runtime on renderer removal and `CampaignRefreshCoordinator.invalidateAll()` invalidates pending read results. A future actual UI integration must synchronously **mask and stop input** before asynchronously destroying these resources, and must fence stale promises from repainting revoked data.
4. **Signed artwork URL behavior is especially sensitive.** `src/SignedAssetUrls.js` issues storage signed bearer URLs for **3,600 seconds**, retains local cache entries for **54 minutes**, and calls the signer again for any *still-subscribed* artwork when `signedAssetStore.clear()` runs. The R18-123 tests reproduce this with a fake signer and show that actual unsubscription must precede clearing. Already-issued bearer URLs may remain valid independently of a user's revoked membership, until expiry. Preventing further server issuance and addressing long-lived existing URLs is a **separate security gate**—local cache clearing alone does not revoke an issued link.
5. **Performance:** Movement, fog and collision rendering must not depend on network membership queries per frame, keyboard step, drag sample, token collision, or map repaint. The existing movement lag work makes that a non-negotiable design constraint.

## R18-123 source-only sentinel (not mounted)

`staging/world-v2-b10-r18-123-access-revocation-guard/CampaignAccessSentinel.js` exports a pure, **dormant** access state machine. `R123_LIVE_ENABLED=false`; nothing in `src/TabletopApp.jsx` or the V2 board imports it.

| Situation | Proposed client behavior |
| --- | --- |
| Enter campaign or switch signed user/campaign | Synchronously hide the old campaign; re-prove actor identity and RLS-visible self membership before displaying |
| Current signed `campaign_members` row is present and valid | Permit UI rendering as a consequence of fresh server proof (never as authorization for an RPC) |
| Membership query returns zero rows | Immediately mask, mark `revoked` once, run full teardown; terminal until a **new explicit** campaign entry after DM reinstatement |
| Network error, malformed row, identity mismatch or uncertain RPC | `suspended`: deny new UI access, do not mislabel the player as confirmed removed; require a successful new probe |
| Focus, reconnect, untrusted membership hint, server access-denied | Synchronously mask and query the authoritative actor membership; a client hint alone grants or revokes nothing |
| Passive periodic reconciliation | At most one validation **per minute** while active, with concurrent request sharing; a healthy verified view remains mounted until a result requires action |
| Pending old request returns after user/campaign change | Ignore it via a context generation; only the new actor/campaign proof may reopen content |
| Probe already in flight and a more urgent signal arrives | Lock immediately, invalidate old proof, serialize one follow-up request; no independent movement hot-path RPC |
| No explicit re-entry after revocation | Do not automatically grant membership from a Realtime event or cached role |

The R18-123 sample validates the authenticated user through `db.auth.getUser()`, then reads **only their own** `public.campaign_members(user_id,role)` with a server-enforced RLS SELECT. A row or cache from the previous account is invalid; no `user_metadata`, client-provided membership role, private SQL, service-role credential, browser timers, Realtime memberships or movement hooks are trusted. A 60-second passive interval is a **trade-off**, not an immediate revocation guarantee, and is intentionally a floor for this staged free-tier contract.

## Mandatory teardown ordering and verified subscriber barrier

`staging/world-v2-b10-r18-123-access-revocation-guard/CampaignRevocationTeardown.js` is **also unmounted**. It mandates synchronous client operations: mask campaign, invalidate pending read contexts, cancel queued uncommitted writes, stop movement/preview, clear map/fog/tokens, clear sheets/editors, clear handouts/tools, clear chat/roster, close campaign popouts, route to the campaign hub.

Only then may asynchronous cleanup complete: explicitly confirm the campaign and its artwork components have **actually unmounted**, dispose World V2 runtime, unsubscribe campaign channels and presence, and finally clear signed-asset URLs. If unmount/subscription teardown is not positively confirmed, **do not call `signedAssetStore.clear()`**: its current behavior would re-sign for active listeners. A cleanup error remains visible as an incomplete safe result; no raw sensitive logs are retained. A future integration must ensure that the view mask itself works synchronously and cannot be overridden by a late render.

**Not implemented by this package:** React hook wiring, DM kick events, active-campaign forced navigation, popup cross-tab signaling, pending RPC cancellation, server-side suppression of stale Broadcast/Realtime listeners, or actual browser storage revocation. This is an acceptance contract and a test harness, not an operational feature.

## Threats, sequencing and NO_GO gates

- **Server-side immediate revocation remains mandatory.** All privileged RPCs, RLS policies, Realtime/Broadcast topic authorization, Storage operations, sheet owner edits, fog/observer streams and movement commits must consult **current** campaign membership. Client polling cannot guarantee instantaneous revocation and cannot retroactively recall data already sent to a player.
- Supabase's documented DELETE behavior and JWT/channel lifetime prohibit assuming that a `postgres_changes DELETE` event or a stale channel membership will be sufficient. A safe server-origin revocation signal should disclose no campaign-sensitive metadata, be independently authorized and trigger an immediate member recheck. Publishing raw tombstones/roster delete records to clients is prohibited without review.
- Before enabling a client guard, audit all campaign writers and subscriptions. R18-122 found original `service_role` has `TRUNCATE` on `campaign_members`, which bypasses row DELETE triggers; issue [#229](https://github.com/xuvenz-source/ttrpgsite/issues/229) tracks that independently.
- A future mounted implementation must demonstrate **no fog flashing or movement input stall** under normal membership heartbeat, no duplicate Realtime subscriptions, no extra RPCs on movement, and deterministic cleanup when a member is removed while a sheet write/map drag is pending.
- Signed URL expiry/rotation and cross-window art access need a separate security review before claiming immediate artifact revocation.
- Human private review of 83 original migration bodies, original operator attestation, all 67 privileged authenticated RPC review, QA-only bootstrap approval, signed DM/P1/P2/outsider hosted tests, R18-104 fog oracle, R18-114 UUID inventory bug, R18-115 revoked sheet-owner gap and product DM-removal policy remain hard **NO_GO**.

**Decision:** R18-123 source-only design and isolated Node tests may proceed. No live feature activation or hosted SQL change is authorized. QA installation and production release: **NO_GO**.
