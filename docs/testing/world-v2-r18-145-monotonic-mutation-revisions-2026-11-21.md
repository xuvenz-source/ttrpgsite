# B10-R18-145 — All-writer monotonic mutation revisions and once-only V3 collection

**21 November 2026, Melbourne.** Direct source-only child of verified
R18-144 draft PR #252, parent SHA
`c4c26fb8d736e021862a754008c0361ba67fd2eb`.
**Production and hosted QA NO_GO.** No SQL migration application,
new browser function GRANT, source `src/` edit, merge, deployment
or paid resource.

## Reason for the redesign

R18-144 proved in disposable PostgreSQL 17 that an original
`updated_at:=now()` trigger can emit the **same edit token for multiple
mutations in one transaction**. R143's original timestamp-only
compare-and-swap is therefore not a strictly monotonic version.
R18-144 also observed that the original `collect_campaign_map_pin`
unconditionally updates `campaign_handouts` for each allowed click,
and its AFTER UPDATE revision trigger can send duplicate handout
events for retries. These are demonstrated design risks, not evidence
that all real browser RPC requests are affected.

## Proposed *unapplied* schema and default-denied API

The R145 candidate has exactly two potential source-table columns,
`public.characters.forge_mutation_revision bigint NOT NULL DEFAULT 0`
and `public.campaign_handouts.forge_mutation_revision`. One
`BEFORE UPDATE` trigger is proposed **without a column filter** on
each table, so legitimate old privileged writers, direct allowed
writers, and V3 mutators all advance the same row's revision.
The trigger overwrites a user-supplied revision with
`OLD.forge_mutation_revision + 1`, and refuses overflow.
The original `updated_at` field remains for UI compatibility
but must no longer be the V3 conflict identity.

Five newly proposed V3 API routes remain entirely EXECUTE-revoked:

| Closed route | Behavior |
| --- | --- |
| `get_authorized_character_sheet_revision_v3` | Lock row for coherent read; delegate R142 owner/DM sheet; attach authorized numeric `mutationRevision` |
| `get_authorized_handout_revision_v3` | Lock row; delegate R142 signed revealed/DM/pin-viewer projection; attach revision only after authorization |
| `patch_authorized_character_revision_v3` | Lock row, compare bigint revision, delegate R143 owner/DM non-inventory guard, verify counter +1, return sanitized receipt |
| `edit_authorized_handout_revision_v3` | Lock row, compare bigint revision, delegate R143 DM-only authoring and original hide-pin/revision triggers |
| `collect_authorized_pin_once_v3` | Require current signed map access, lock HANDOUT then PIN, recheck visibility/collectability and recipient, avoid update on already-revealed+collected handout |

The private privileged helpers remain in the non-exposed
`forge_v3_internal` schema. All five corresponding exposed functions
are SECURITY INVOKER in `forge_v3_api`; the source contains
**no GRANT statements** and explicitly revokes EXECUTE on all eleven
new functions (five API, five helpers and one trigger helper).
The inherited V3 source-only total grows to 25 API routes and 26
private functions (including the private trigger function); the only
previously approved narrow scene-topic method retains its prior grant
in the staged candidate.

### Consistent lock order and idempotence

The original DM handout hide action locks a handout before its trigger
updates visible pins. The R143 collector locks the pin before updating
the handout, which can create an inverse lock-order cycle. R145's new
collector takes a non-locking pin identity read first, validates
current signed membership/map, then locks the HANDOUT, then PIN,
and revalidates all mutable pin identity/visibility fields.
It delegates to R143's original collector only when the handout
is not already both revealed and collected. A subsequent authorized
request returns `already-collected` and the current revision
without an additional handout UPDATE. This addresses repeated
updates **inside this new V3 route only**; existing privileged old
writers remain a separate inventory and release gate.

## Synthetic test limits and real-world blockers

The isolated PG17 fixture includes original-shaped V2 functions and
trigger surrogates, **not the actual original 83-migration schema**.
The new tests verify same-transaction bigint increments, stale
client revision denial, direct legacy-row UPDATE increments,
DM/P1/P2/outsider/revoked actor scopes, duplicate collection causing
only one handout update, hidden pin refusal, transactionally rolled-back
temporary authenticated grants and restoring the maintenance gate.
The R144 source inventory continues to mark five client migration
flows incompatible or incomplete.

This candidate intentionally modifies `public` table definitions **in
disposable CI only**. Applying it later would acquire DDL locks and
introduce per-row trigger writes. Its lock duration, trigger ordering,
historic original side effects and actual Supabase nano/free-tier CPU,
memory and p95 performance remain UNMEASURED. No real multi-tab
deadlock/revocation stress has been performed. Before any QA or
production SQL apply, audit all original triggers and direct writers
and prepare a transaction-safe, reversible schema migration, on
a verified **$0 isolated QA project**, with explicit human approval.

Original R128 legacy API freeze, R132 maintenance gate, existing
R142/R143 actor checks, and all other closed API paths are preserved.
The original 67 public privileged functions, 31 relations,
17 published Realtime tables, 19 frontend Postgres Changes listeners,
old socket delivery, preissued 3600-second Storage signed URLs
(issue #231), signed DM/P1/P2/outsider/revoked/rejoined actors,
free-tier collision/LOS/fog and R127 human approval remain release
blockers. Issues #220/#223/#229/#231 stay open.

**Next R18-146:** investigate exact original dependency trigger and
lock-order graph, add realistic concurrent PG17 locking tests and
complete client mutation request/response compatibility preflight.
No browser access or production deployment until a separate GO gate.

**NO_GO. No manual work required for this source-only step.**
