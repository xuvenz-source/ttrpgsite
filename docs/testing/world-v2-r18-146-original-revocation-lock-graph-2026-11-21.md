# B10-R18-146 — Original revocation and lock graph: source-only audit

**21 November 2026 (Melbourne).** Child of verified R18-145
draft PR #253, parent SHA `a922556ccd49f19251dfb2bad399d0aea8ee67d9`.
**Production and hosted QA NO_GO**. No merge, deployment, new browser
GRANT, runtime edit or versioned migration.

## Read-only original SQL evidence (not real signed actor QA)

Queried original PostgreSQL `pg_catalog` definitions and role grants,
and reconciled against current source/issue records. The original
database retains 83 migrations. QA has zero migrations and zero public
application tables.

| Original table | Custom trigger count | Relevant side effects |
| --- | ---: | --- |
| `characters` | 6 | Inventory protection, immutable owner, touch timestamp, art sync, monitor refresh, navigation/visibility permission ticks |
| `map_tokens` | 10 | Movement/collision enforcement, visibility ticks, roster publication, combat sync |
| `campaign_handouts` | 3 | Validation/`now()`, revision event, revealed-to-hidden pin updates |
| `campaign_map_pins` | 2 | Map/pin validation and handout event revision |
| `campaign_members` | **0** | No automatic member revocation triggers found |
| `campaigns` | 2 | Validate published map, old V2 map routing publication |
| `campaign_player_maps` | 1 | V2 player routing notices |
| `campaign_tool_issues` | 5 | Tool inventory, map projection, collision and navigation permission updates |
| `map_environments` | 1 | Old V2 published environment signal |

The R128 public API freeze is not installed on hosted Supabase; it remains a staged security precondition.

The original `public.can_edit_campaign_sheet` `character` branch
allows matching `user_id=auth.uid()` without separately checking
current membership. Thus a removed owner may still pass the
legacy helper, consistent with unresolved security issue **#220**.
The new R143/R145 browser-facing prototypes explicitly recheck
membership but remain ungranted. This does **not** fix the still
hosted original public RPC.

The original `public.join_campaign(p_invite_code)` looks up an
unchanged 16-character invitation and re-inserts
`campaign_members` via `ON CONFLICT DO NOTHING`, exposing
the unrotated invite rejoin issue **#223**. No non-internal custom
`campaign_members` trigger exists. Authenticated currently has no
UPDATE/TRUNCATE grant on that table, but `service_role` has
TRUNCATE privileges, so privileged statement-level mutations can
evade removal semantics (#229) unless separately controlled. Old
joined Realtime sockets remain a different revocation boundary.

Preissued Storage signed bearer URLs remain a separate blocker (#231).
No local cache clear or `auth.uid()` check on a *future* request can
invalidate an already minted 3600-second bearer URL.
Issues #220/#223/#229/#231 stay **NO_GO**.

## Verified original lock graph and new contract

Original `collect_campaign_map_pin` acquires a
`campaign_map_pins FOR UPDATE` row lock before updating the handout.
The legacy `campaign_handout_hide_pins` trigger holds the updated
handout and issues a pin UPDATE when a DM hides the note. These create
opposite lock orders: **PIN → HANDOUT** versus **HANDOUT → PIN**.

The new **unapplied** R145 collector avoids the inverse order:
read the pin identity without locking, verify signed actor/map,
lock HANDOUT first, then PIN, recheck mutable pin identity and
visibility, and only then delegate original collection. The
crossed read is rechecked under the row locks to avoid TOCTOU.
This is a source-level risk mitigation, not yet a proof of original
schema deadlock freedom.

This step's isolated PG17 test creates controlled concurrent
interleavings: DM concealment first, V3 collector first, and a
deliberately forced old PIN-first versus HANDOUT-first deadlock.
Only a **fictional** trigger/actor fixture is used.
A deadlock in the forced old path is an expected *risk
demonstration*, never a deployment success signal.
Cross-map tokens, fog, lighting and network Realtime payloads
are not tested by this fixture.

## Required next changes

R18-147 should **reconcile existing unapplied security candidates**:
revoked-character-owner guard in draft PR #219, tool/role tests in #222,
source-only membership UPDATE guard in #228, private tombstone/rejoin
prototypes in R18-120/R18-121, and Storage teardown tests in #230.
Do not duplicate or silently replace these branches. Resolve missing
privileged TRUNCATE and old invite rejoin controls, then integrate signed
actor/recipient generation checks with the latest mutation work. It must preserve DM edit access,
party membership, current map and token ownership and must not grant
broad table or public-schema privileges.

Original 67 privileged routines, 31 public relations, 17 Realtime
publications, 19 Postgres Changes consumers and old socket delivery
remain unaudited for complete release. R145's proposed ALTER TABLE
requires original trigger compatibility, DDL lock cost and free-tier
memory/CPU measurements. Storage bearer revocation and true signed
DM/P1/P2/outsider/revoked/rejoined/multi-tab QA plus R127 human
approval are still mandatory before any hosted installation.

**All tools in this step are read-only against hosted projects.
No manual user action in R18-146. Production NO_GO.**
