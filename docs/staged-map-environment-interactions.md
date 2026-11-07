# Staged Map setting refinements — 7 November 2026

Branch: `stage/map-environment-interactions-2026-11-07`  
Release status: **staging only** — do not merge or deploy to production without review.

## Included

1. **DM token-perspective preview:** Under DM Tools → Map setting, choose a visible token and click **Preview as player**. The DM editor/secret object markers are hidden. A per-token sight polygon based on walls, one-way directions, door/window state and the token's linked numerical elevation attribute darkens space outside its current line of sight. Bright and additional dim light radius configuration affects the visual approximation. Hidden tokens and tokens outside the sight polygon are excluded; normal map interactions are disabled while previewing. Click **Exit player preview** to return.

2. **Quick-adjust windows:** DM-only map markers for doors, windows and lights remain clickable outside editing mode. Clicking opens a compact map-anchored menu. Window: curtains, locked and opened; door: locked and opened; light: enabled, bright/dim radii, colour, intensity, elevation, effect. Walls expose movement/light/vision and attribute conditions in Advanced settings. The existing sidebar property inspector is retained.

3. **Free-position geometry:** Wall line/freehand and door/window placement use exact cursor-relative map coordinates, not grid snapping; underlying stored coordinates remain in fractional cell units.

4. **Door and window endpoint dragging:** In Light Layer edit mode with Select/edit tool, drag either red endpoint to resize or rotate a portal; the other endpoint stays fixed. Invalid zero-length paths are rejected and edits are persisted using the current serial map-save queue.

5. **Markers inspired by reference screenshot:** Distinct original small icon buttons identify doors, windows and lights, with red endpoints for doors/windows. Markers only render for the DM and are removed during player-perspective preview.

## Scope caveat

**Player-perspective preview is a DM-only simulation, not a complete representation of what a connected player currently sees.** The application does not yet enforce line of sight, fog persistence, lighting occlusion or token collision for actual players. The preview calculation is client-side for DM inspection only. It must not be used to authorize player movement or reveal private object geometry.

No database migration, schema change, deployment or change to player access policies is included in this refinement.

## Review checklist

- DM draws unsnapped chained and freehand walls; right-click finishes.
- DM drags each end of a door/window at multiple map zooms, including rotated lines; saves persist after map switch/reload.
- DM clicks an icon when the editor is closed; the menu opens and toggles persist.
- Check a window with curtains vs without, closed vs open, and a directional wall in both viewing directions.
- Preview as two different tokens with differing Elevation values; verify current occlusion and that DM markers disappear.
- Confirm player accounts cannot see marker icons, quick adjust menus or raw environment tables.
- Verify token drag, group drag, measurement, map panning, combat rolls and hotbar are unchanged outside edit/preview mode.
- Run `npm test` and `npm run build`; validate connected DM/player multiplayer sessions before production release.
