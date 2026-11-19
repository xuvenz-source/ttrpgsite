# B10-R18-129 — Privileged RPC, Realtime stream inventory and fog metadata authorization

**19 November 2026, Australia/Melbourne.** Direct child of R18-128 draft PR #236 pinned at `ff63103b4767057fe2165503e35d8f75f9a9ed41`. All changes are source-only; **NO-GO** for hosted SQL, QA bootstrap, merge, deployment, production or paid infrastructure.

## Prior R18-128 checkpoint

All exact-head R18-128 checks passed: dedicated PG17/source-contract, standard build/security (the failed Chromium startup retried successfully) and combined B10 staging-only SQL. R18-128's public-schema maintenance freeze is **not installed**, and its private-schema, Realtime and Storage gaps remain. Original migration count is **83**; independent QA has **zero migrations and zero application tables**.

## Read-only live original function census

The app schemas contain **85** `public`, **30** `forge_visibility` and **24** `forge_world_v2` functions under the relevant catalog filter. **67** `public` functions are authenticated-callable SECURITY DEFINER entrypoints. Exactly **15** of those have no *direct text* reference to `can_view_campaign_map`, `is_campaign_member`, `is_campaign_dm`, or `campaign_members`.

These 15 are a **text-screening queue, not 15 confirmed vulnerabilities**. Several delegate to secured helpers. Examples: `advance_world_motion_v2` delegates to `forge_world_v2.advance_core_v2`, which invokes `session_valid`, which checks current `can_view_campaign_map`. `get_authorized_map_fog_v2` delegates to `get_authorized_map_fog`, which checks map access. `get_campaign_sheet_inventory`, `mutate_campaign_sheet_item` and `patch_campaign_sheet_noninventory` delegate to sheet ownership helpers; the original `can_edit_campaign_sheet` has the separately confirmed revoked-owner gap from R18-115/R18-124. Actor-scoped cleanup helpers must still be audited for timing, races and previously issued leases. No blanket GO is inferred from an indirect call.

The two internal engine schemas `forge_visibility` and `forge_world_v2` **currently deny authenticated schema USAGE**. PostgreSQL `has_function_privilege` may report an EXECUTE grant on a private function without making it directly callable if schema usage is absent. The R18-128 synthetic private-schema bypass was a deliberately exposed negative control; do **not** mistake that fixture for a demonstrated live private-schema exposure. Privileged public wrappers and triggers can still invoke private functions. A full 67-entrypoint *transitive* review and all 83 original private SQL migrations remain mandatory.

## Specific unguarded fog metadata function

The read-only original `public.is_map_fog_published(uuid)` definition, MD5 `8841970de390b1eaef9dbd0f0886ed81`, is an authenticated-callable SECURITY DEFINER Boolean over `forge_visibility.map_rules`. The body contains **no auth.uid(), campaign membership or authorized map check**. The private `map_rules` table itself is not directly selectable by authenticated clients. A catalog search found no other application database function directly calling this helper. This exposes the presence/absence of a published fog flag for a supplied map UUID at the *function-authority level*. It is a narrower **metadata oracle**; it does not itself disclose fog geometry, map content or unknown map IDs.

The proposed **unapplied** `unapplied-fog-published-auth-guard.sql` retains the exact signature, stable Boolean return and SECURITY DEFINER search path. It returns true only if the current signed actor is authorized by `public.can_view_campaign_map` for that map **and** the source fog flag is enabled. Unauthorized, missing and null maps return false; no caller gain or grant is added. This is a candidate correction, NOT an installed repair, and not a replacement for all R18-104 metadata-oracle investigations.

The disposable PG17 fixture reproduces the original behavior for a signed outsider and revoked campaign member. It then installs the candidate **only in a fictional local database** and asserts strict false for revoked actor, outsider, off-map player and null identity, while legitimate P1/P2/DM and explicit reinstatement retain valid results. Direct anon function execution, authenticated table and private-schema access must still fail.

## Direct database Realtime publishing inventory

Seven function bodies in the three application schemas directly reference `realtime.send` or another searched emitter token:

| Function | Boundary to audit |
| --- | --- |
| `forge_visibility.dispatch_movement_preview` | Legacy preview emitter, member/map guarded in body |
| `forge_visibility.publish_approved_navigation_batch` | Navigation distribution and current recipients |
| `forge_world_v2.bump_scene_publication_v2` | Shared map-wide V2 scene revision (R125/R126 candidate not installed) |
| `forge_world_v2.bump_vision_epoch_v2` | Viewer-targeted V2 vision hints |
| `forge_world_v2.publish_approved_observers` | Current-membership approved observer fanout |
| `public.advance_map_motion_session` | Legacy authenticated motion emitter |
| `public.advance_map_motion_session_path` | Legacy authenticated path emitter |

This is a **static application-schema SQL reference scan**; dynamic SQL, other schemas, client-origin Broadcast, Postgres Changes, server/Edge workers and third-party publishers are not certified complete. A blanket shutdown of the shared scene publisher alone is not a complete R18-128 server fence. The map-wide `forge-map:<map>` client send policy is another residual connection surface requiring review.

## Postgres Changes publication inventory: 17 tables

The actual `supabase_realtime` publication contains:

`battle_maps`, `campaign_handout_events`, `campaign_player_maps`, `campaign_sheet_item_leases`, `campaign_tool_issues`, `campaign_tool_item_leases`, `campaign_tool_map_tokens`, `campaign_tool_templates`, `campaigns`, `characters`, `chat_messages`, `map_combats`, `map_environments`, `map_tokens`, `map_viewer_visibility_ticks`, `map_visibility_ticks`, `npc_templates`.

All 17 have RLS enabled in the observed catalog. The authenticated database role has a SELECT grant for 16; `map_tokens` has a SELECT RLS policy but no authenticated table-level SELECT privilege. The `campaign_members` table is **not** published, so do not propose a naive membership DELETE Postgres Changes subscription as the revocation mechanism.

Several published rows contain sensitive fields, including `campaigns.sheet_template`, `characters.field_values`, `map_environments.live`, `map_tokens.npc_values` and `map_viewer_visibility_ticks.authorized_frame`. Whether Supabase Realtime delivers any of those to a particular signed actor depends on its actual Postgres Changes RLS evaluation and subscriptions. **No live leak is claimed from this inventory.** Test existing connected/revoked sockets, reconnects, DELETE semantics, row SELECT grants, and event timing before treating maintenance mode as an effective stream fence.

Original `realtime.messages` has **five authenticated SELECT** policies and **one authenticated INSERT** policy. Private Broadcast channel RLS authorization alone does not guarantee immediate disconnection of an already joined socket. No V3 receiver or topic RPC is installed yet. Existing 3,600-second signed Storage links also remain an independent bearer access surface.

## Reproducible source-only audit gate

`catalog-evidence.json` pins sanitized, non-user metadata: 15 selected function names and source MD5s, seven emitter names/MD5s, 17 published table names, schema access, RLS and channel policy counts. `CatalogDriftGate.mjs` compares an explicitly supplied new observation to those pins and fails closed on source, membership or count drift. It **always** returns `securityReleaseAuthorized:false`. The accompanying `read-only-catalog-recheck.sql` is for a future authorized manual/audited read; it does not run from CI, request remote credentials or return function bodies or user records.

Matching metadata **does not prove** a complete privilege call graph, actual authorized recipient filtering, WebSocket close, revocation ordering, runtime security or production readiness.

## Next engineering gate (R18-130)

Review all remaining public privileged RPC bodies and nested guards, then enumerate the complete Postgres Changes subscriptions and triggers that could continue publishing to old signed clients. Design a server-enforced fence that can distinguish verified V3 sessions from legacy V2 without accepting caller-controlled version claims. Validate R123 synchronous cleanup, R125/126 private scene migration, R127 rollback, #220/#223/#229/#231 and preissued signed URLs in real signed QA. Preserve existing movement/collision/fog performance and the $0 budget.

**Manual work needed now: none. Original and QA unchanged. No migration, merge or deployment. Production NO-GO.**
