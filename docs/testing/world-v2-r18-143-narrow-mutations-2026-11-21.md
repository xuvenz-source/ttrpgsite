# B10-R18-143 — Narrow signed mutation contracts, trigger preservation, and stale-edit gating

**21 November 2026 (Melbourne).** Direct source-only draft child of R18-142
PR #250 at exact commit `282927baca1f11014cfc03d10524546ea203f299`.
**Production and hosted QA remain NO_GO**. Do not run any staged SQL
against original/QA, expose browser API EXECUTE, merge, deploy, or use paid resources.

## Read-only original SQL and permission basis

R18-143 inspected original `pg_get_functiondef` definitions of
`public.can_edit_campaign_sheet`,
`public.can_edit_campaign_sheet_inventory`,
`public.patch_campaign_sheet_noninventory`,
`public.get_campaign_sheet_inventory`,
`public.collect_campaign_map_pin`, and the server-side
`is_campaign_dm` and `can_view_campaign_map` helpers.
The original `patch_campaign_sheet_noninventory` checks owner/DM
rights, protects inventory fields by deriving them from the campaign
sheet template, then performs a scoped update. Its raw return is
`to_jsonb(row)` and **must not be forwarded to a browser**, because it
contains unrelated sensitive metadata (art/Storage paths and more).
The original `get_campaign_sheet_inventory` can mutate missing
inventory IDs and is NOT a safe read-only method.

Original character triggers were inspected:
`characters_protect` prevents changing owner/user/campaign identity;
`characters_touch` uses `now()`; inventory overwrite protection
checks `current_user='authenticated'`, which can be bypassed by a
privileged SECURITY DEFINER, so the new route independently
**rejects inventory field IDs rather than relying on that trigger**.
Other original character triggers notify resources and tick elevation.

Original handout update triggers `campaign_handout_validate`,
`campaign_handout_hide_pins` and `campaign_handout_tick` enforce
identity/folder scope, set `updated_at`, conceal visible pins on
a revealed-to-hidden transition, and publish handout revision events.
Original `collect_campaign_map_pin` locks the pin, requires its
`visible` and `collectable` flags plus current signed campaign/map
authorization, then marks the related handout revealed+collected.
The candidate delegates collection to that exact original function,
rather than cloning collection side effects.

The original row and trigger semantics were inspected **read-only**,
but a complete transitive review of all 67 original public privileged
functions has not occurred.

## Three exact V3 mutation proposals (all default-denied)

| New private operation | Signed, current actor requirements | Bounded output |
| --- | --- | --- |
| `patch_authorized_character_v3(character,values,expected_updated_at)` | Owner or campaign DM and current membership, original `can_edit_campaign_sheet`, matching revision, non-inventory template keys only; 1–32 keys and max 16 KiB | Character/campaign IDs, changed key names, updated timestamp, no raw row |
| `edit_authorized_handout_v3(handout,title,body,revealed,expected_updated_at)` | Current campaign DM, matching revision, bounded title/body; original validation/hide-pins/revision triggers | Handout/campaign IDs, `revealed`, updated timestamp, no handout body |
| `collect_authorized_pin_v3(pin)` | Signed campaign member, visible **and collectable** pinned note on currently authorized map, locked pin, original collector | Collected handout ID only, no hidden note body or pin coordinates |

All three are **explicit**, not a generic privileged mutation or
caller-selected SQL/router. No character owner, art path, token, NPC
template, inventory, handout folder, map-pin coordinates, tool state,
or direct map environment write route is introduced. There is no
movement/collision/fog hot-path RPC.

All three private functions are SECURITY DEFINER with empty
`search_path` in the unexposed `forge_v3_internal` schema; their
corresponding `forge_v3_api` wrappers are SECURITY INVOKER and are
also explicitly `REVOKE EXECUTE` for PUBLIC, anon and authenticated.
There are **zero SQL GRANT statements in the implementation candidate**,
zero new browser-callable functions, no `src/` changes and no
versioned migration. Inherited R128 public schema freeze, R132
maintenance fence and R142 exactly 17+17 private/exposed function
inventory are mandatory. The staged R143 census is **20+20**,
with only the inherited narrow scene-topic function potentially
callable by authenticated.

## Optimistic concurrency and remaining subtleties

The character and DM handout mutations use row `FOR UPDATE` plus
strict supplied `updated_at` equality; stale edits return no data and
make no write. Existing `updated_at` triggers use `now()`, which is
**transaction timestamp**, not a globally monotonic revision. Two
edits in the same transaction can share it, and external same-epoch
concurrency remains to be tested using the real original schema.
Before browser exposure, investigate a dedicated monotonically
increasing per-row revision, true multi-tab CAS tests, and handling of
errors versus authorization denial. Repeated original collection
may generate additional handout ticks; assess idempotency and repeated
clicks before rollout.

A client-supplied DM flag, protocol version or JWT user metadata
does not authorize mutations. Each privileged helper uses signed
`auth.uid()` and current server membership. Nevertheless real
signature freshness, user-session revocation, old socket delivery,
Postgres Changes and preissued **Storage** signed bearer URLs
cannot be proven by these wrappers.

## Verification scope

The R143 isolated PostgreSQL 17 workflow chains existing R142 fictional
schema setup, adds synthetic source-authored character/handout/pin
mutation fixtures, compiles the three new functions and tests
fenced mode, direct browser privilege denial, DM/P1/P2/outsider and
nonmember roles, invalid/foreign/stale character patches,
non-inventory key acceptance, handout revision and hide-pin trigger,
allowed collection, cross-map pin denial, map reassignment,
rollback-only temporary role grants, fresh revoked-user denial,
and final re-fencing.

**These are synthetic PostgreSQL sessions, not real signed Supabase
DM/P1/P2/outsider QA.** Original 83 migrations, actual RLS,
trigger dependency closure, Realtime packet revocation, Storage signed
URL revocation, collision, LOS/fog and free-tier p50/p95/p99
movement performance are still unverified. QA stays empty and
production untouched. Issues #220/#223/#229/#231 remain open; human
R127 release approval is still missing.

**Next step R18-144:** review original mutation side effects,
idempotency, timestamp/CAS hazards and client request compatibility,
then develop signed-QA and rollback plans without opening the public
API or deploying.

**NO manual work required now. Production NO_GO.**
