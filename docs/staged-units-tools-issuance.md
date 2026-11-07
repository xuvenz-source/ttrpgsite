# Units → Tools: reusable DM tools and issued player assets

**Staging branch:** `stage/units-tools-issuance-torch-mount-inventories-2026-11-07`

**Release boundary:** DRAFT staging only. No schema has been applied. No Vercel deployment, cloud preview, paid database branch, hourly background worker, or production data changes.

## User experience

In **Units**, choose **Characters** (current view) or **Tools**.

- The **DM** manages a reusable Tool library with types: **Light source** (torch, lamp, etc.), **Mount / pack animal**, or **Inventory** (party chest/bag). Names, emoji icons and the appropriate type-specific settings are editable. Mounts can have custom numeric attributes and a selectable 1–4-cell token footprint.
- The DM chooses **Issue** on a template, picks a recipient (one character's player account, or **Entire party**) and can change name, icon, light range/color/intensity, inventory grid/list dimensions, or mount statistics *for that issuance only*. A snapshot is created; editing another issued tool does not change the original template or siblings.
- Both DM and recipients see **Issued tools**. Open a sheet to toggle light, view/edit mount attributes (DM-only) and manage the issued inventory. Grid/list editing reuses the exact `InventoryPanel` system, including item metadata and positioning. Save commits the updated sheet using an expected revision to avoid overwriting simultaneous edits.
- An issued tool can be **dragged from Tools onto the active battlemap**, where it appears with a dedicated icon token. A torch draws a coloured radial light effect at its configured bright/dim radii, following the token as it moves. A mount occupies a configurable number of grid cells. Eligible players can move their own/party tools, open a sheet by double-clicking, or pick a tool back up from the Units list. The DM can withdraw issued copies.
- Other authorized map viewers see map tool icons and light, even when they cannot open the tool's private inventory.

## Architecture and security model

The SQL candidate in `staging/sql-candidates/campaign_tools_issuance.sql` creates **three separate tables**:

1. `campaign_tool_templates`: reusable DM-only library, with RLS allowing only campaign DMs to read/change templates.
2. `campaign_tool_issues`: issued snapshots containing recipient/private state. A player can only access their assigned copy or a party-shared copy. A BEFORE trigger rejects player changes to recipient, kind, icon, config, name, campaign ID, mount attributes or other protected fields. Position changes must use a map the actor is permitted to view; the database validates map bounds and recipient membership. A `revision` column prevents losing concurrent edits.
3. `campaign_tool_map_tokens`: **sanitized public map projections**, maintained exclusively by an AFTER trigger on issues. These contain only name, icon, type, position, footprint, lighting values and visible status, never inventory rows, private stats, or recipient data. A player can read projections only on a map allowed by existing `can_view_campaign_map` rules; no client has direct write grants to this table.

The map projection trigger does not broadcast when an inventory-only change occurs. Supabase Realtime PostgreSQL change events refresh authorized snapshots; returning to an app after browser tab suspension also reconciles. There are no recurring paid jobs.

### Limits and dependencies

- **Light effects in this batch are visual radii.** They do not yet participate in server-authoritative player fog/line of sight or wall occlusion. Fog/collision remains the separate security-gated feature in Issue #23. Do not claim these torches reveal only fog-authorized cells until that feature is complete.
- The mount uses an icon-based map token and a compact numeric stats sheet; it does not automatically join Initiative, calculate movement speed restrictions or roll attacks. Those are future gameplay integrations.
- The icon is a customizable emoji/text glyph. Uploading arbitrary public/private artwork directly for a tool is not part of this batch.
- Tools have a single current placement. One issued copy can be moved or picked up; it cannot be simultaneously placed multiple times.
- Inventory state changes are explicit **Save changes** operations, not individual remote writes per keystroke.
- Issue to **a player account** (not a single character sheet), or to the whole party; this keeps a pack mule available if that user controls multiple sheets.

## Backend rollout and test gates

1. **Do not** apply `staging/sql-candidates/campaign_tools_issuance.sql` directly to the live database. On approval, generate an official Supabase migration via CLI, review it, and test with disposable local/synthetic data first. The candidate is not presently in `supabase/migrations`.
2. Verify PostgreSQL RLS under DM A, player A, player B, unauthorized campaign member C, and unauthenticated roles:
   - Non-DM can't see templates, create issues, update protected tool config, access another player's private inventory, change mount attributes, or place a tool on another map.
   - Party-shared inventories allow both player accounts to save, but stale revision writes fail rather than overwriting each other.
   - All map members can see the sanitized placement without learning private state, and members of different campaigns/maps see no projection.
3. Verify trigger semantics for issue, move, map switch, light on/off, deleted map, withdrawn issue, deleted template (issued snapshots remain intact), and campaign deletion.
4. Test list and grid inventory with a DM + two connected browsers. Place a 20-ft torch, move it, and verify all clients observe correct size/colour/light state. Test a horse/mule footprint and individual saved stat changes. Check no unexpected writes to the existing `map_tokens`, `map_environments`, or character sheets.
5. Run GitHub `npm test`, dependency audit, Vite build, Deno type-check and CodeQL checks. Manual browser testing is still required: GitHub CI cannot validate pointer/drag ergonomics.
6. Once approved, apply reviewed migration **before** publishing the matching frontend in a single coordinated release. Do not enable non-production previews by default; preserve the existing free plan and single-release deployment budget.

## QA in staging code

`tests/campaign-tools.test.mjs` covers template presets, independent state, player/party ownership, map light/token rendering, inventory reuse, and RLS/role-protection invariants in the SQL candidate. SQL has **not** been executed against any database during staging.
