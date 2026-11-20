# R18-137 — V3 gameplay/data dependency census, source-only NO_GO

**20 November 2026, Melbourne.** This is a direct source-only child of R18-136 draft PR #244, pinned to `696e720470094eb1a9114aaa3a25ad66bf8d3a2f`. The R136 final dedicated, standard build (second attempt after Chromium DevTools startup failure), and combined PostgreSQL checks passed. **Do not merge, deploy, run hosted SQL, configure hosted Data API, or enable a paid service.**

## Why a single V3 topic RPC does not restore gameplay

R128's unapplied hard maintenance prototype revokes `public` schema USAGE. R136's candidate creates **only** `forge_v3_api.get_authorized_scene_channel_v3(uuid)` after that fence and retirement of the old shared V2 receive policy. That safely illustrates a narrow signed-topic entrypoint, but a real Tabletop Forge browser still needs **scene and sight snapshots, DM map editing, movement and collision, campaign membership and roster, character sheets/inventory, chat/tools, Realtime and Storage**. The existing browser talks to public PostgREST tables and functions directly. Restoring blanket `public` USAGE just to make those routes work would reinstate a large unaudited legacy surface. A Javascript `v3` version label is not a secure actor identity or reliable old-client denial.

Supabase's current [Using Custom Schemas](https://supabase.com/docs/guides/api/using-custom-schemas), [Javascript `schema()` reference](https://supabase.com/docs/reference/javascript/schema), and [Securing your API](https://supabase.com/docs/guides/api/securing-your-api) distinguish Data API schema exposure, role grants and RLS. No `GRANT ALL` or default grant is permitted as a workaround.

## Verified original Supabase: source-of-truth read-only snapshot

`live-public-api-acl-snapshot.json` stores *each exact original function name/signature/SECURITY DEFINER flag* and *each relation's authenticated role privileges* at audit time. On original project `lwhwgqaunxbmvyndswze` (83 applied migrations):

| Existing browser-facing category | Verified |
| --- | ---: |
| Authenticated-executable `public` functions | **77** |
| Of these, `SECURITY DEFINER` | **67** |
| Public tables/views in privilege census | **31** |
| Relations with authenticated `SELECT` | **29** |
| Relations with authenticated `INSERT` | **20** |
| Relations with authenticated `UPDATE` | **20** |
| Relations with authenticated `DELETE` | **18** |
| Public tables in `supabase_realtime` publication | **17** |
| Storage buckets, all marked private | **3** |

Source `live-other-data-surfaces.json` pins every one of the 17 Realtime-published tables and the private `battlemap-assets`, `personal-token-art`, and `tabletop-artwork` bucket identifiers. **Private bucket** does not mean a previously issued signed bearer URL immediately stops working after membership removal. The existing `SignedAssetUrls.js` requests signed URLs valid for 3,600 seconds; #231 remains open.

The original does **not** contain R136's `forge_v3_api` gateway; the old V2 scene receiver policy and authenticated `public` schema USAGE remain active. QA project `bgydsamxypjslergfpla` has zero migrations and zero public application tables. No hosted data or configuration has been changed.

## Full frontend source census, not a simulated API migration

`BrowserApiRouteCensus.mjs` walks **all** actual `src/` JavaScript/JSX modules in a GitHub checkout and records **source file, line, offset, kind, exact string target or unresolved expression, feature category and short preview** for direct Supabase calls:

- Literal and dynamic `db.rpc` / `supabase.rpc`, `db.from`, channels, schema-selected RPC, Storage bucket and Edge Function references.
- `postgres_changes` and Broadcast event listeners, as separate Realtime surfaces from Data API RPC or table grants.
- Indirect and dynamic calls as explicit **unresolved audit work**, rather than silently assuming a source literal authorizes a function or assigning all rows of a private table to a browser.
- A comparison of static RPC/relation targets with the pinned original 77-function/31-relation catalog, surfacing references that do **not** appear among currently authenticated-accessible original objects.
- Complete machine-readable call-site census emitted into a bounded, temporary GitHub Actions artifact. The artifact and the scanner's exact count are produced **only after CI succeeds**; do not infer success from this document alone.

The scan is **lexical, not an AST or a transitive call graph**. It does not guarantee every alias, dynamically generated client, asynchronous call chain, currently reachable feature or hidden transport is discovered. The tests fail if known critical source literals disappear, but a green test does **not** establish the entire API is reviewed or safe.

### Key code paths verified from the actual live source

| Path | Observed dependency | Why it blocks the R128 freeze |
| --- | --- | --- |
| `src/TabletopApp.jsx` lines 387–408 | Direct `campaigns`, `campaign_members`, `characters`, maps, NPCs, chat and `get_campaign_account_names` | Cannot serve ordinary signed campaign loading if the entire public schema is inaccessible |
| `src/TabletopApp.jsx` lines 957–960 | Direct map-token projection plus `get_dm_map_npc_values` | Need to reconcile table permissions and ensure player sight never sees private NPC fields |
| `src/engine/v2/SceneManager.js` line 187 | `get_world_scene_v2` | Requires a signed scene snapshot; V3 epoch topic alone is insufficient |
| `src/engine/v2/RealtimeTransport.js` line 80 | `get_world_observer_cursor_v2` | Signed per-viewer sight/cursor cannot be replaced by raw visible map rows |
| `src/engine/v2/VisibilityController.js` | Dynamic `db.rpc(args.name,args.params)` | Indirect fog/sight routes need semantic caller-graph classification |
| `src/engine/v2/AuthorityClient.js` | Dynamic `db.rpc(name,params)`, begin/advance/commit and optional finalize | Preserve actor/session/path/collision controls and avoid extra per-frame RPCs |
| `src/AuthorizedNavigation.js` line 191 | `get_authorized_map_navigation` | Server-authorized walkability data is still needed without leaking fog geometry |
| `src/CharacterEditor.jsx` line 44 | `patch_campaign_sheet_noninventory` | Requires owner/DM permission and schema revision checks |
| `src/InventoryTransfers.js` line 83 | `transfer_campaign_inventory_item` | Needs item ownership, lease and inventory integrity checks |
| `src/SignedAssetUrls.js` line 8 | Dynamic signed Storage bucket URLs | A private bucket grant does not invalidate preissued links |
| `src/AccountSettings.jsx` line 24 | Edge Function `username-update` | Not covered by PostgREST schema grants |
| `src/TabletopApp.jsx` lines 1065–1077, 1452 onward | Broadcast + Postgres Changes subscriptions | R131 stream teardown and real old-socket isolation remain mandatory |

A specific missing live-route warning: `src/engine/v2/AuthorityClient.js` references optional `finalize_world_motion_v2`, but this function is **absent** from the 77 currently callable original public functions. Do not expose, invoke or assume it is installed without separate feature-gate proof. Another discrepancy: `map_tokens` appears in original frontend direct reads but its authenticated table-level `SELECT` privilege is **false** in the pinned catalog (other authenticated write privileges exist). That requires a real current-runtime and authorized projection review, not a blanket grant.

## Twelve-feature V3 coverage plan

`v3-gameplay-api-coverage-plan.json` pins 12 security-gated feature domains covering signed scene/epoch, fog/observer sight, movement, campaign/map/roster, DM map environment, sheets/inventory, tools/handouts/pins, chat/combat/macros, personal preferences, artwork/Edge, Realtime/Postgres Changes, and release-surface isolation. Each records actual source evidence, representative currently accessible original objects, a proposed replacement, priority, owner and required authorization/LOS/performance tests.

**None** is approved as a complete V3 gameplay API. The solitary R136 topic wrapper remains **source-only and unapplied**. All 77 public functions and 31 public relations require individually triaged disposition; the 67 callable SECURITY DEFINER bodies are particularly sensitive. The eventual V3 API should be deliberately small, use precise per-operation grants, server-side actor checks, bounded safe projections and no blanket `GRANT ALL ON ALL ROUTINES`. Do not simply grant direct SELECT on private campaign rows or old `map_tokens`.

Postgres Changes data from 17 published tables, already-joined V2 sockets, client-origin Broadcast/Presence, Edge Functions, service-role bypass, and signed Storage bearer URLs are **separate** from a custom PostgREST schema. The entire release remains **NO_GO** until those channels are independently fenced and tested.

## CI and R18-138 handoff

Dedicated Node tests run the source scanner across the **actual checkout**, compare its route classifications with the original read-only catalog, test the privilege/publication snapshots and enforce all non-ready release flags. The scan can produce a machine-readable R137 report artifact for exact call-site review. Standard build/security plus inherited combined SQL integration run unchanged; production application `src/` and versioned `supabase/migrations/` are pinned to parent R136 commit.

**R18-138** should review every dynamic and indirect call-site from the emitted census, triage remaining catalog functions/relations by safe actor/projection, and design the first multi-operation V3 scene, sight and movement facade **without** restoring `public` USAGE. It should preserve crisp movement/collision/fog handling, avoid new per-frame or per-tile network RPCs, and define real signed DM/P1/P2/outsider/revoked/reinstated and old WebSocket QA gates. Issues #220, #223, #229 and #231, full original migration and privileged RPC review, and free-tier performance checks remain mandatory.

**Manual work now: none.** A future explicit approval would be needed to expose a new Supabase Data API schema and bootstrap a real hosted QA environment. The existing project and test campaign remain unchanged.
