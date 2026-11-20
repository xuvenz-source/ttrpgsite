# B10-R18-140 — Default-denied DM-preview, private fog, lighting and navigation APIs

**21 November 2026, Melbourne.** Direct stacked draft child of R18-139 PR #247,
source SHA a5de4681558be7aceaec4060915137eb4f814df7.
**NO_GO** for QA and production installation, Data API exposure, merges,
deployments, paid resources or any new browser grant.

## Actual original authority, verified read-only

R140 inspected live **original** PostgreSQL definitions:
- public.preview_world_visibility_v2(uuid,uuid)
- public.preview_world_visibility_at_v2(uuid,uuid,uuid,integer,integer)
- forge_world_v2.visibility_frame_v2(...)
- public.get_authorized_map_fog_delta(uuid,uuid,bigint,bigint)
- public.get_authorized_map_fog_v2(uuid)
- public.get_authorized_map_light_masks_v2(uuid)
- public.get_authorized_map_navigation(uuid,text,uuid)

This was read-only source inspection, not a full transitive proof.
Original DM preview requires signed auth.uid() and server-side campaign
DM membership; the viewer must be a current player assigned to that map.
Virtual preview requires the viewer's own visible token and legal
footprint/map bounds, and does not store exploration. The returned
world-visibility frame is version 2 and viewer-scoped, never raw DM scene
geometry. The original fog delta checks signed actor/viewer permissions,
serializes viewer snapshots under FOR UPDATE, and returns
snapshot/delta/noop on matched epoch/revision/sequence. Lighting checks
viewer-specific revision; navigation checks signed DM/owner/party-shared
piece access, fog/LOS/collision/environment/permission revision. Original
navigation remains version 1 rather than world-visibility version 2.

## Five candidate APIs, all closed

The source-only SQL introduces exactly five private
forge_v3_internal SECURITY DEFINER implementations and five corresponding
forge_v3_api SECURITY INVOKER forwarding stubs:

| New default-denied V3 API | Original trusted function |
| --- | --- |
| get_authorized_world_preview_v3(map,viewer) | preview_world_visibility_v2 |
| get_authorized_world_preview_at_v3(map,viewer,token,x,y) | preview_world_visibility_at_v2 |
| get_authorized_world_fog_delta_v3(map,epoch,revision,sequence) | get_authorized_map_fog_delta |
| get_authorized_world_light_masks_v3(map) | get_authorized_map_light_masks_v2 |
| get_authorized_world_navigation_v3(map,kind,piece) | get_authorized_map_navigation |

All five new API functions and all five new private helper functions
explicitly revoke EXECUTE from PUBLIC, anon and authenticated. R128
public-schema USAGE freeze, R132 maintenance gate, R138 eight-function
isolated API and private definer placement are mandatory prerequisites.
No grant, RLS policy, table, schema exposure, src/ change or versioned
migration is added; no old public data API is reopened. R138's seven
experimental world functions remain closed. The inherited signed
scene-topic gateway remains the only proposed callable API route.

DM preview checks a current signed DM and an active assigned player
through the original trusted viewer-on-map authority before invoking
the original preview. The original token, bounds and visibility checks
are retained. Fog requires a complete base tuple or a full-snapshot
request with no legacy global fallback; returned mode, map, protocol
and delta keys are validated. Lighting and navigation check the
original typed viewer reply shapes. This is not a copied engine or
new per-frame browser call.

## Synthetic verification boundaries

The isolated GitHub Actions PostgreSQL 17 runner rebuilds R125/R126/R128/
R136/R132/R138 fictional prerequisites and compiles five new default-denied
prototypes. It checks signed-equivalent DM/P1/P2/outsider/map/token
authorization, fog snapshot/delta/noop, lighting/navigation, revocation,
and rollback of a temporary authenticated permission grant. These are
**fictional PostgreSQL role/session simulations**, not real signed DM/P1/P2/
outsider Supabase Auth, original LOS/collision, PostgREST, Realtime,
Storage, network and free-tier latency tests. No live client is unsealed.

## Release gate

The outstanding original inventory still includes **67 privileged
functions**, 31 direct relations, 17 Realtime public tables, 19 Postgres
Changes call sites, alternate publishers, multi-tab **old socket**
revocation, and three private Storage buckets with preissued signed
bearer URLs (#231). Issues #220/#223/#229/#231 stay open.
Real signed QA, rejoin/revocation, map switching, actual fog/collision,
movement latency, resource usage and rollback-to-fenced drills remain
mandatory before browser grants.

**R18-141** should continue the per-route original privilege and
field-projection audit and develop safe client/realtime/Storage teardown
contracts; no generic grants, no free-tier load assumptions.

No manual action. QA remains empty. Production **NO_GO**.
