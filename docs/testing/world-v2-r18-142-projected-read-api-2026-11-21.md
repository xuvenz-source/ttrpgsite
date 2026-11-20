# B10-R18-142 — Four default-denied least-privilege read projections

**21 November 2026, Melbourne.** Strict child of R18-141 draft
PR #249, exact verified parent commit
`0b09cf5c66994b4082d17058699f9d54141adee3`.
**NO_GO** for hosted QA execution, production, migrations, browser grants,
Data API exposure, merges, deployments, paid resources or client activation.

## Source and authority basis

R18-141 used **read-only original Supabase SQL/catalog and policy text**
to verify ten sensitive RLS tables, original 77 public authenticated
functions including 67 privileged SECURITY DEFINER routines, 31
public relations, 17 Realtime published public tables, 19 frontend
Postgres Changes declarations and three private Storage buckets.
R18-142 additionally inspected exact original live signatures and
source of `is_campaign_member(uuid)`, `is_campaign_dm(uuid)` and
`can_view_campaign_map(uuid,uuid)`, plus original RLS read expressions
and exact column types for characters, campaign_handouts,
campaign_map_pins, campaign_tool_issues and battle_maps.

The role helpers use server-side `auth.uid()` and current campaign
membership. `can_view_campaign_map` checks DM or the player's currently
assigned map (including campaign-player override), not merely an
untrusted browser-selected map ID. PostgreSQL grants and RLS alone do
**not** establish field-level projection: a SECURITY DEFINER may
bypass table RLS, so each candidate below independently checks actor
scope. The five original table read policies were used as **minimum
permission boundaries**, not a final release authorization guarantee.

## Four proposed candidate interfaces

All four functions are **read-only data projections** and do not modify
the character, handout, tool or map rows. They are *source-only*
PostgreSQL SQL candidates under
`staging/world-v2-b10-r18-142-projected-read-api/`, not versioned
migrations or hosted installs. Note that the inherited signed V3
recipient topic helper may maintain its own epoch state; do not assume
every nested helper is globally read-only without further analysis.

| Candidate private API | Signed actor authorization | Fields deliberately withheld |
| --- | --- | --- |
| `get_authorized_character_sheet_v3(character)` | Current character owner OR current campaign DM, plus membership | Art/storage paths and any other character row columns; full `fieldValues` restricted to owner/DM |
| `get_authorized_handout_v3(handout)` | Current DM, or current member with revealed handout, or visible pin on that member's authorized map | Unrevealed notes not exposed by a visible pin; other campaigns and maps |
| `get_authorized_tool_issue_v3(issue)` | Current DM, owner on currently authorized map, or party-shared current member on authorized map | Shared-party recipients never get private `config` or `state`; no location/held token/template IDs or hidden geometry |
| `get_authorized_map_metadata_v3(map)` | Current viewer assigned to map, plus current server-issued V3 scene recipient topic | `storage_path`, map image URLs, hidden scene geometry, source dimensions, NPC stats |

A visible handout pin can authorize its text even when the handout's
`revealed` flag remains false: that matches the **original RLS read
policy**. It still requires a visible pin, matching campaign, and
a currently authorized viewer for that map. This disclosure choice
requires real DM/player testing before a rollout.

Party-shared tool data has a distinct minimal projection. The
`config` and `state` JSON fields remain reserved for a current
owner or DM, and party-shared status never implies visibility of
location, hidden objects, private sheet data or a different map.
A nullable owner cannot accidentally count as an authorized owner.

No movement/fog/rendering hot-path RPC is introduced. The existing
V2 authorization/LOS/collision implementations remain the source of
truth for their respective systems; R142 does not attempt to replicate
them.

## Security isolation and synthetic verification

R142 stages **four private SECURITY DEFINER** helpers with
`SET search_path=''`, and **four SECURITY INVOKER** outer API
wrappers. All eight new functions explicitly revoke EXECUTE from
PUBLIC, anon and authenticated; the existing 13 V3 API routines
remain on the R140 inheritance chain. The final source-only
catalog preflight/postflight checks **17 private plus 17 API
routines**, the R128 public schema freeze, R132 maintenance gate and
all existing privileged browser API denials.

The `tests/world-v2-r18-142-postgres/run.sh` suite is isolated
to a disposable GitHub Actions **PostgreSQL 17** service, loopback
address and named fictional database. It runs the earlier R140
fixture/tests, extends it with invented characters, handouts, pins
and tools, and checks in the **synthetic SQL role model**:

- DM can read eligible private sheets, private handouts and tool state;
  a DM from another campaign cannot cross that boundary.
- Player P1 can read their own sheet and visible/revealed handouts,
  but not P2's private sheet, hidden notes or unassigned-map assets.
- Player P2 can see party-shared tool *public descriptors* but not
  its owner/DM configuration or private state.
- Outsider, anonymous, nonmember and revoked actor access fail closed.
- A temporary authenticated function grant is rolled back, and the
  synthetic scene maintenance gate returns to `fenced`.

These are synthetic fixtures and role/session simulations. They do
**not** execute the original 83 migrations or prove actual signed
DM/P1/P2/outsider sessions, Realtime subscriber/sender revocation,
old socket network delivery, preissued 3600-second Storage signed URL
revocation (#231), full 67-function transitive privilege audit,
collision/LOS, or free-tier movement/lighting/fog latency.

The original Supabase project remains at 83 migrations and QA at
zero migrations and zero application tables. No browser execution
access, schema visibility, app `src/` or versioned migration
changes are authorized. Issues #220, #223, #229 and #231 remain open.

## Next step

**R18-143** should narrow and verify required *write/mutation*
contracts and role transitions without generic RPC routing,
particularly character edits, handout collection and DM editor
rights, as well as address the transitive authorization and release
gates. Any real signed QA installation requires an explicitly
approved security/maintenance preflight and must remain isolated
from production.

**Production remains NO_GO. No manual action required for R18-142.**
