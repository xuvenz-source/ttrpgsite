# Staged DM Map Environment System (Phase 1)

**Staging branch:** `stage/dm-map-environment-tools`  
**Release status:** NOT approved for production. Do not merge/apply migration until reviewed.

## DM Tools > Map setting

Two initial DM-only editor layers:

1. **Map / Background** — image and grid calibration, independent of environment objects.
2. **Light Layer** — walls, doors, windows, lights and their configured behaviors.

DM editor display visibility/locking does not affect players. Editing geometry is never exposed through the player UI. Map setting is collapsed by default, using the existing account/campaign menu persistence.

## Implemented in this first stage

- Light Layer editing mode with snap-to-grid, connected multi-click walls (right-click or Enter to finish, Escape to cancel), and freehand pen (drag and release).
- Object placement for door, window, and light markers.
- Select existing objects and configure movement blocking, vision blocking or one-way direction, light blocking, and elevation-dependent thresholds against custom sheet numeric/attribute fields.
- Map-local light sources with separate bright and additional dim radii, colour, intensity, effect type and elevation.
- Prepared environment settings for ambient light, automatic fog-of-war option, party-shared exploration option, and weather presets.
- DM-only map environment data model with map-specific database persistence, RLS and separate prepared/live JSON columns.
- Pure unit tests for wall presets, elevation conditions, invalid values, per-map state and two-radius lights.

## Explicitly NOT active yet

This stage provides **preparation/editing controls**, not a production-ready environment simulation.

- Collision/movement restrictions are not yet enforced on the server; no collision checks may be delegated to a client-only implementation.
- Walls do not yet clip rendered player light, line-of-sight or fog-of-war.
- Party exploration history is not yet calculated or stored by token/player.
- Doors/windows do not yet trigger live player interactions, lock checks or breakable state.
- Lighting/weather effects are saved as settings but not yet rendered in the player session.
- Prepared/live columns exist; live state switching, reset controls and real-time synchronization require follow-up implementation.
- Elevation comparison helpers exist but require server-side application to token movement and visibility before they can affect players.
- Copy/duplicate map environment and undo/redo are follow-up workflow work.

## Security and rollout

**Do not apply** `supabase/migrations/20261107033000_dm_map_environment_layers.sql` to a production database without explicit release approval. Preview frontend will report map storage unavailable until the staged migration is applied to a dedicated test database.

Players must NEVER receive raw wall geometry or unexplored object properties via direct table reads. The new `map_environments` table has DM-only SELECT/WRITE policies. Subsequent server-side RPCs must evaluate movement and visibility while returning only authorized results.

## Verification

Staging GitHub Actions performs `node --test tests/*.test.mjs` and `npm run build`. The production branch and production database are not modified by the commits on this staging branch.
