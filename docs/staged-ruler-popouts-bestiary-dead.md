# Staging: route ruler, character pop-outs, Bestiary inheritance and Dead overlays

**Scope:** independent staging branch created from production `main` on 7 November 2026.
**Production status:** no merge, Vercel deployment, new billed infrastructure, Supabase migration or production data writes.
**Cost:** GitHub CI, existing Supabase Free and Vercel free only.

## Changes staged

### 1. Multi-leg line ruler
- Left-drag starts a line and follows snapped cell centres.
- While holding the original left mouse button, right-click at the next turning point to add a waypoint. Repeat for multiple bends (up to 64); cumulative 5-ft legs are shown and broadcast to other map viewers.
- Right-button pressed later is identified using the original drag's sourceButton, not `event.buttons & 1`, which can fail under pointer capture and mouse-button chords. Duplicate turns do not accumulate.
- Native `mousedown` catches right clicks over the toolbar or map, `mousemove` continues the line after lost pointer capture, and `mouseup` ends the original left-drag immediately even if another button is held.
- Standalone right-drag still creates a persistent pinned measurement; a simple left-drag remains temporary.

### 2. Character sheets in separate browser pop-out
- Units' small ↗ button and the sheet editor request a popup-sized browser window (`popup=yes,width=920,height=760,resizable=yes,scrollbars=yes`), matching the existing NPC workflow. This opens only the authenticated character sheet interface; the duplicate main tabletop shell is hidden.
- No credentials or sheet contents enter the URL; the campaign and sheet UUID alone identify what an already authorized session may read.
- Window placement ultimately depends on browser settings, popup blockers and the operating system. The UI makes a popup request rather than a normal tab request.

### 3. Bestiary templates and independent placed NPC instances
- The DM retrieves the current authorized template from the database on each placement, clones `field_values` into a distinct `map_tokens.npc_values` payload and preserves the original `npc_template_id`.
- The staged SQL candidate adds a trigger: changing a Bestiary template updates only still-inherited fields on its placed NPCs; tokens with divergent values keep their modifications. Resource `current` and `max` are checked separately. Token names, artwork, statuses, positions and hand-edited nonmatching values are never reset automatically.
- A **Restore Bestiary defaults** action on a placed NPC's sheet allows the DM to explicitly refresh that one token with the latest template values, then review/save; other tokens are unaffected.
- The legacy schema stored full snapshots without a record of explicit override intent. If a token has exactly the old default, it will continue to inherit updates; if it differs, it stays independent. Previously out-of-sync instances need the explicit Restore action. For complex nested objects (equipment and spells), full-object matches inherit; modified objects stay local.

### 4. Dead status and visual overlay
- The Quick Adjust window now exposes a **Dead** checkbox, using the existing normalized `status_effects` system rather than a separate boolean.
- Applying or clearing it invokes the existing authorized `set_token_statuses` workflow, retaining normal player-token ownership/DM permissions and Realtime synchronization.
- When the built-in `dead` effect is present, every authorized viewer sees a translucent red tint covering the entire token footprint; input remains functional, and status/monitor controls remain above the overlay.
- The backend currently rejects the new built-in status until the SQL validation function is upgraded; this upgrade is included in the same staging-only SQL candidate. Do not deploy the UI first.

## Backend staging candidate and release sequence

Candidate file: `staging/sql-candidates/npc_template_inheritance_and_dead_status.sql`.

This is deliberately **not** an applied migration and is not in `supabase/migrations`. The Supabase CLI is unavailable in this staging environment; when the batch is approved for release, generate an official versioned migration with the CLI, review it, then apply it using the existing **free** Supabase project before the frontend release. No paid staging database/branch or recurring worker is required.

1. Perform transactionally rolled-back SQL QA on disposable synthetic template/token rows: same defaults, number overrides, partial resource overrides, complex object overrides, template add/remove, missing values, and unauthorized non-DM update attempts.
2. Validate `valid_token_statuses('[{"id":"dead","level":1}]', '[]')` succeeds only after candidate application, and invalid status IDs or stacking are still rejected.
3. Apply the reviewed schema candidate as a migration only with release authorization, verify permissions, status validation and trigger effects, then publish the matching Vercel frontend change once.
4. Test with a connected DM and two players and confirm no unrelated NPC data or existing token settings were altered. Record rollback SQL if trigger or validation behaviour is wrong.

## Manual UI acceptance

- Ruler: start on toolbar and map, add two or more right-click bends while left held, verify totals and remote presentation; left release removes temporary ruler; pure right-drag pins until explicit clear; test zoom, map switch, toolbar capture and different browsers.
- Pop-out: Units ↗, player own sheet and DM-owned character editor; ensure separate small window where permitted; verify authenticated access, close, unsaved changes and session isolation.
- Bestiary: place two copies, modify HP of one, change parent template HP/max, confirm only inherited parts change; reset one token without changing sibling; confirm non-template NPCs and players are unaffected.
- Dead: mark player/NPC dead and alive, verify translucent red tint and status marker for everyone, image/no-image tokens, token size and movement, restricted account cannot edit another player's NPC.

## Regression checks

Run `npm test`, `npm run build`, production dependency audit and Deno checks through GitHub Actions. Keep `vercel.json` no-preview policy intact. Browser multiplayer testing and database migration QA are required separately; green CI does not prove those integrations.
