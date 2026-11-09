# PR #58 — ten-phase code audit and staging corrections

**Scope:** code, fixtures and compatibility boundary only. No production
Supabase SQL applied. No Vercel deployment or live multiplayer sessions.
The V2 double cutover remains off and PR #58 remains draft.

## Findings from reading the implementation, not just the Phase 10 report

| Original concern | Corrective staging action | Proof available | Release boundary |
| --- | --- | --- | --- |
| NPC/tool movement from concealed to authorized sight could be missed | `signal_movement_vision_v2` now compares the start and end of each approved piece under each player's own V2 sight sources; when it crosses the sight boundary, bumps an identity-free recipient epoch | PostgreSQL contract exercises an NPC beginning concealed, crossing into view, and becoming roster-visible without broadcasting its ID/position; invisible NPC remains silent | Still test 2+ real players, moving NPCs and reconnects in browsers |
| Fog-disabled light canvas returned an error | Moving-light painter now clears the cosmetic layer successfully for fogless maps, including large maps | Node test exercises 10-cell and 200-cell fogless cases plus prior-lit cleanup | Verify visually with dynamic torches and switching fog on/off |
| Player tool dragging lacked immediate safe prediction | Server now grants the same conservative local collision-free quadrants to individually owned or party-shared unheld tools; mount footprints and attributes must match authoritative movement; client accepts tool-only or mixed token/tool grants | PostgreSQL checks owner/shared/unowned/held permissions; Node tests check mixed groups, stale/unknown directions, and grant validation | This is a one-cell envelope only; do not claim arbitrary long drags are locally predictable without live latency measurements |
| Newly added roster invalidation may increase PostgreSQL CPU | Uses one viewer source list per recipient (not once per torch) and computes full light rays only for nearby candidate crossings | SQL integration suite checks behavior, not production CPU | Measure p50/p95 RPC, Supabase CPU/RSS/WAL with 2/4/8-player stress |

## Audited residual legacy pieces

**Must remain for the existing live board until designer-approved cutover and
successful V2 acceptance:**

- `src/BattlemapBoard.jsx` and its old collision, movement and fog
  dependencies. The app uses an exclusive lazy-loaded board selector;
  no old board is mounted or imported eagerly when V2 is selected.
- The existing `forge_visibility.enforce_collision` and
  `forge_visibility.enforce_tool_collision` trigger definitions; Phase 10
  adds a private transaction checkpoint branch for V2 while preserving
  V1 trajectory checks for rollback compatibility.
- The outer campaign/measurement channel and non-movement campaign data
  refreshers; V2 uses these for measurements and UI metadata only.
  The legacy per-map movement/fog observers, client navigation grant
  polling and authorized light-mask subscriptions remain guarded OFF by
  the V2 cutover.
- Original sheet, hotbar, status, combat, pin, measuring, DM editor,
  inventory and tool-management UI components. Shared UI is not a
  second movement/visibility authority.

**Must NOT become active under V2:** old movement writers, legacy
`forge.trajectory_*` GUCs in the V2 canonical commit, old
`forge_visibility.observer_verified_path_status` inside the final V2
observer gate, duplicate token React roots, or legacy fog polling.

**Not removed yet:** the legacy board and fallback SQL *source*. Deleting
them before the replacement is proven live would break the existing
production application and violate the one-release/rollback policy.
After V2 acceptance, plan one tightly scoped cleanup migration and
corresponding frontend deletion with a new security/test review.

## Acceptance criteria that still require real browser/runtime checks

1. Two players + DM moving independently at the same time, including fast
   consecutive grabs, group drags, tool drops and multi-cell drag release.
2. NPC entering and leaving the player's sight; explicit DM-hide,
   dynamic torch light, walls/doors/windows, fog toggle, reconnect and
   immediate permission revocation.
3. Existing sheets, hotbar, inventories, tools, DM map editor, monitoring,
   character actions, handouts, status menus, combat and measurements.
4. Measure grab-to-paint, observer-to-paint, p50/p95 authorization,
   renderer RAF budget, Supabase CPU/RSS/WAL and active realtime channels.
5. Confirm every required V2 migration is applied in ascending order,
   relevant staged changes from the release ledger are reconciled, and
   rollback compatibility works. None of this is approved/applied yet.

**Recommendation:** retain PR #58 as one integrated draft. Do not
interpret green unit/build/PostgreSQL/CodeQL checks as proof of smoothness
or deployed security. Recheck the exact latest commit SHA before approving
a coordinated deployment.

## Live Supabase schema reconciliation (read-only, 10 November 2026)

- Verified the connected TTRPG Site database reports PostgreSQL 17.11.
- Verified V2 `motion_sessions`, `commit_checkpoints`, `vision_epochs`,
  `begin_world_motion_v2` and `get_world_visibility_v2` are **absent**.
  The eight staged V2 migration versions do not appear in the recorded
  production migrations; nothing V2 has been applied during this audit.
- Verified existing `forge_player_collision` and `forge_tool_collision`
  triggers remain enabled and refer to
  `forge_visibility.enforce_collision` and
  `forge_visibility.enforce_tool_collision`.
- Compared the live function bodies with the staged Phase 10 compatibility
  replacements: every nontrivial existing body line was retained, with
  only the V2 private checkpoint authorization branch added. This avoids
  accidentally replacing a later production collision fix.
- Relevant production canonical tables and fields (token footprint,
  tool config/state, placement span, fog rules, permission generation)
  match the staging migration dependency assumptions.
- These are **schema/definition checks only**, not a dry-run migration
  against a restored production database, live performance test, or
  proof of application success. No production rows were changed.

