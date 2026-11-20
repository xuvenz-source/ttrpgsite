# B10-R18-141 — Original SQL field-projection audit and closed cutover contract

**21 November 2026, Melbourne.** Source-only, stacked directly on
**R18-140 PR #248** at `8203f37052c4d7896635999befe3f8247095613b`.
**Production and hosted QA NO_GO.** Do not deploy, merge, apply a migration,
grant browser access, or change Supabase exposed schemas.

## Grounded original Supabase read-only findings

Used original project's `pg_catalog`, `information_schema`,
`pg_policies`, `storage.buckets`, and `pg_publication_tables`.
The queries selected metadata/SQL source, not application records.
Observed **83 original migrations**, **0 QA migrations / 0 QA public
application tables**, **77 public callable functions for authenticated**,
**67 of those SECURITY DEFINER**, **31 public tables/views**,
**17 published public Realtime tables** (all default replica identity), and
**three private Storage buckets** (`battlemap-assets`,
`personal-token-art`, `tabletop-artwork`).

The original authenticated role **still has USAGE on public**;
`forge_v3_api` has **not** been installed on hosted Supabase. The
R128 freeze and R140 five additional experimental API functions exist
only as unapplied source candidates.

The following ten original public tables each have RLS and policy rules.
PostgreSQL `SELECT` grants permit access to RLS-visible rows, but do
**not automatically restrict the columns** in those rows:

| Original table | Authenticated direct SELECT | Observed row-policy meaning | V3 projection hazard |
| --- | --- | --- | --- |
| battle_maps | Yes | Authorized campaign map or DM | Raw `storage_path` |
| campaign_handouts | Yes | DM, revealed, or visible exposed-map-pin handout | Unrevealed `body` |
| campaign_map_pins | Yes | DM or map-authorized visible pins | Concealed `x,y` and associations |
| campaign_members | Yes | Current campaign membership | Minimal roster IDs/roles |
| campaign_tool_issues | Yes | DM, owning recipient or party shared | `config` / `state` |
| characters | Yes | Owner or campaign DM | `field_values`, art paths |
| map_combat_entries | Yes | Campaign DM only | Private `token_id`, rolls, modifiers |
| map_environments | Yes | Campaign DM only | `prepared` and `live` geometry |
| map_tokens | **No** | RLS visibility exists, but no authenticated SELECT grant | Never restore raw `npc_values` access |
| npc_templates | Yes | Campaign DM only | NPC `field_values`, art paths |

**These are metadata-and-policy observations, not signed user authorization
proofs.** A future API must bind signed actor/campaign/map, select only
necessary fields, respect owners/DMs/recipients, and recheck revocation.
Do **not** copy `select('*')` from `src/TabletopApp.jsx` or
`src/useCampaignHandouts.js` into a blanket V3 SELECT grant.

Selected original function bodies were inspected read-only:
`get_dm_map_npc_values` checks DM rights and returns private NPC
values; `get_authorized_map_combat` projects observed participants for
players and permits DM-only private entry mapping; `collect_campaign_map_pin`
revalidates membership/map visibility and mutates handout reveal;
`get_campaign_account_names` uses display metadata for names, **not**
authorization. Crucially, `get_campaign_sheet_inventory` appears to read
inventory but can generate missing `_inventoryId` values and **UPDATE**
a character, NPC template or map token row. Treat it as a privileged
**mutating operation**. No approval is inferred for any of the other
67 original SECURITY DEFINER bodies.

## Realtime and Storage revocation boundaries

The inherited R130 scanner currently detects **19 Postgres Changes
listener declarations** across seven source files, **16** of which
include DELETE. All 19 have no explicit column projection option.
R141 compares live source against the R130 exact baseline and the
current 17 published table names; new/missing listeners fail CI.
The R131 client quarantine and R135 V3 observer bridge remain
**dormant**. The existing original V2 scene and observer topic producers
remain in `src/engine/v2/SceneTransport.js` and
`src/engine/v2/RealtimeTransport.js`. Local channel removal and client
buffer invalidation do **not** prove an already joined V2 socket has
stopped receiving bytes. The server must fence all senders/receivers,
legacy Postgres Changes and queued messages, and signed real
multi-tab tests must prove the cutoff.

The `src/SignedAssetUrls.js` cache still requests **3600-second**
signed URLs. Its `clear()` method drops local references and can
immediately refresh subscriptions; it does **not** invalidate previously
issued bearer URLs. Three private buckets alone do not solve this.
Issue #231 remains a hard release gate until a server-side revocation
mechanism, approved short-lived proxy access, object key rotation, or a
rigorously bounded expiry risk is implemented and verified. Do not
pretend the client can retract a link already shared.

## Source-only cutover sequence (not runnable release automation)

1. Preserve R128 public legacy RPC denial and independently fence all
   original seven known publishers and any other Realtime/Edge sender.
2. **Synchronously** mask the entire campaign/map and cancel in-flight
   motion, sight, roster, image and data requests.
3. Invalidate all local scene/fog/light/navigation caches and remove
   local signed URL references without claiming server revocation.
4. Quarantine 19 Postgres Changes consumers and retire old V2 observer,
   scene and campaign channels; failed removal remains terminal.
5. Prove server-side no-old-socket-delivery and already-issued signed
   asset revocation **before** treating a reconnect as safe.
6. Require signed current member/map/recipient V3 epoch, fresh authorized
   scene + sight + fog + light/navigation and independent permission
   generation before any view is unmasked. Never accept browser
   protocol flags as authorization.
7. Run real signed DM/P1/P2/outsider, revoked/rejoined and multi-tab
   old-socket tests plus collision/LOS/fog and free-tier p50/p95/p99.
8. Obtain human R127 release approval and prove rollback returns to a
   fenced, hidden state without re-enabling legacy public APIs.

The companion `ProjectionCutoverAudit.mjs` is a **source review aid**,
not imported from `src/`, not a release toggle and never executes a
network/database command. Even simulated client evidence saying
`allChecksPassed` cannot produce GO.

## Verification scope and next work

This step audits ten sensitive table metadata/policies and five selected
original privileged routine source bodies. It has **not** completed
the original 67-function transitive body audit, all 77 RPC dispositions,
the 31-relation signed projection matrix, or actual signed QA. No
original SQL migrations were applied. The inherited 26 dynamic
browser call sites and 6 R139 review groups remain unchanged.

Open issues **#220, #223, #229, #231** persist.
No production branch change, hosted write, migration, public grant,
paid infrastructure or user manual action is requested.

**R18-142:** develop separately reviewable, default-denied
owner/DM/recipient field-projection prototypes for characters, handouts,
tools and map metadata with disposable PG17 actor tests. Never expose
them until the broader release gates pass.

**Final decision: NO_GO.**
