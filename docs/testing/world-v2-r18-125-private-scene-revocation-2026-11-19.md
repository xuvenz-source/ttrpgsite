# B10-R18-125 — Recipient-scoped scene revocation security prototype

**19 November 2026, Australia/Melbourne.** Direct child of draft PR #232 pinned at 7de314357be6aa1c5ac11df6a0956443600bf453. Source-only; no hosted SQL, source app changes, merge, versioned migration, deployment, or paid resources. **NO_GO.**

## Actual-original, read-only findings

1. **Shared V2 scene broadcast:** forge_world_v2.bump_scene_publication_v2(p_map) emits only map UUID and scene generation metadata, but uses a shared forge-world-scene-v2:<map_id> topic with no current-recipient filtering. Existing revoked subscribers may still receive revisions. This is a stale-channel metadata risk, **not proof of a full fog/map data leak**.
2. **Private V2 observer movement is better restricted:** publish_approved_observers enumerates current campaign_members, applies viewer_on_map, and sends to private forge-world-v2:<map>:<viewer> recipients; bump_vision_epoch_v2 also checks viewer_on_map. These checks do not cover every Realtime surface or an in-flight race.
3. **Realtime policy timing:** the existing realtime.messages RLS policies authorize private channel joins against current map membership. Supabase documents connection-time authorization; already-connected sockets are not necessarily removed when campaign membership is deleted. campaign_members is not published on the original Realtime publication.
4. **Signed Storage:** battlemap-assets, tabletop-artwork and personal-token-art are all private buckets. RLS can block new signed URL issuance after revocation; it cannot retroactively revoke a bearer URL already issued for 3600 seconds. Current SignedAssetUrls.clear() can issue new URLs to still-subscribed art components. Security issue #231 remains.
5. **Schema alignment:** original campaign_members is keyed by (campaign_id,user_id), and battle_maps has a unique (campaign_id,id), allowing a private epoch to reference both securely.

## R18-125 unapplied source contract

The staged SQL prototype adds a private member_scene_epochs table keyed to member, map and an opaque UUID epoch, with an ON DELETE CASCADE foreign key to live membership. The new topic format is recipient-specific: forge-world-scene-v3:<map>:<viewer>:<epoch>. A signed actor can mint only its own epoch after current membership and map access checks. Explicit reinstatement generates a distinct epoch: old topics must remain invalid.

The private can_receive_scene_topic_v3 predicate accepts only the signed actor's currently authorized map and exact epoch. Authenticated users can execute this boolean predicate for a future RLS policy, but cannot read or modify epoch rows or invoke the private server-only recipient topic resolver. The latter checks current membership using FOR SHARE, then current map assignment; an approved future publisher must send within that same transaction.

**Not operational:** this file neither installs a realtime.messages policy nor replaces the old V2 scene sender or client. It is not a forward migration and cannot disconnect an already-connected socket.

## Atomic future cutover requirements

1. Add and validate a reviewed realtime.messages SELECT policy for recipient-scoped V3 scene topics; private channels must remain private.
2. Replace **every** server producer that emits the legacy shared scene topic with membership-authorized, per-recipient V3 sends. Remove old shared V2 sends and authorization in the same coordinated release.
3. Update SceneTransport.js and the R18-123 access sentinel together; on revocation, synchronously mask content and stop input, then unmount subscribers before clearing signed art. Prevent late reads or concurrent session responses from remounting it.
4. Verify mapping changes, removal during a scene send, direct DM removal paths, reinstatement, reconnects, off-map and outsider permissions, and all open private Realtime/Postgres Changes subscriptions in signed QA.
5. Prove there is no per-movement or per-render membership RPC; quantify extra per-recipient scene notifications, Realtime quota/egress, and cold-join latency within the $0 budget.

Important: **a new V3 policy alone does not revoke a client still joined to the old V2 topic**. New topic rollout without retiring legacy sender routes is unsafe. This source prototype intentionally does not claim otherwise.

## Isolated test evidence and limits

The disposable PostgreSQL 17 fixture uses fabricated DM/P1/P2/outsider identities and synthetic original authorization helpers. It tests stable active epochs, per-viewer isolation, valid/invalid topics, membership deletion cascade, continued access for other members, reinstatement with a newly generated epoch, route reassignment and null identity. Four direct ACL denial checks validate private function/table restrictions. This test **does not** validate hosted Realtime sockets, JWT expiry, original private migrations, browser unmounting, stored procedure races, or real signed-user behavior.

## Unclosed release gates

Membership and RPC blockers #220 and #223; privileged service_role TRUNCATE and identity mutation #229; pre-issued signed Storage URLs #231; R18-104 fog metadata oracle; R18-114 inventory UUID churn; review of 83 private historical SQL files and all 67 privileged authenticated RPCs; approved QA bootstrap; signed DM/P1/P2/outsider browser/SQL tests; latency and free-tier measurements. No hosted SQL, deployment or merge is approved.

**Manual work required now: none. Production decision: NO_GO.**
