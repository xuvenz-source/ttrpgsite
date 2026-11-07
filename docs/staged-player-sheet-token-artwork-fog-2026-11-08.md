# Staging: Player sheet access, local input latency, token art and fog transitions

Date: 8 November 2026
Base production: `f5a5decaa0d6446bfe68f9d5e2bfa1ebb5f36e49`
Branch: `stage/player-sheets-token-artwork-fog-2026-11-08`
Status: staged only. No production or database writes authorized.

## Player Alt + double-click
The battlemap handler only called onTokenEdit for DMs, and openTokenSheet
also exited for players. Owned visible tokens on the assigned map now open
the owner's linked character sheet; unlinked legacy tokens resolve only
when exactly one character belongs to that player. Players cannot open
someone else's sheet or edit NPCs. DM workflows are preserved.

## Sheet input latency
Player sheet fields now live in a focused local-state component instead
of re-rendering the entire tabletop on every keypress. Changes are applied
to local field state immediately, then delivered to the parent as a
batched patch after 140ms of idle time. Existing server patches remain
serial and queued with pending status and explicit error feedback.
Spell casting, attacks, rolls, sheet switches and closes first flush the
local draft. While a write is pending, roster refreshes preserve the
unsaved patch rather than replacing the player's input with stale server
snapshots. The DM/NPC editors and collaborative inventories retain their
existing persistence systems.

## Own token artwork
A production PostgreSQL trigger `protect_token_fields()` currently
rejects owner `image_path` updates, even after the player's character
sheet saves `token_path`. Migration `supabase/migrations/20261108033000_player_owned_token_artwork.sql` is generated from
the live function and adds a tightly scoped exception:
- Only `image_path` changes, no other token property.
- Only a currently controlled, visible, accessible token with a linked
  character in the same campaign owned by the authenticated player.
- The token image must match `characters.token_path` exactly.
- DM changes, collision, movement, statuses, and approved quick changes
  remain governed by existing rules.
The client paints an optimistic new image for the owner's visible tokens
and reports a failed map-token save without deleting art referenced by
the already updated character sheet.

## Fog flicker
A map_visibility_ticks event previously called `setFrame(null)`,
painting all map cells black on every move. Now it invalidates any
in-flight visibility fetch and downgrades the last *server-authorized*
visible cells to **already explored** cells while fetching a fresh
authoritative frame. Truly unexplored cells stay black, and stale
line-of-sight visibility is never reused.

## Release checklist
- Apply migration **before** the frontend rollout after explicit release
  approval. No staging DB/paid resources; production test campaigns only.
- Run GitHub CI and CodeQL, check collisions, permissions and autosave.
- Test with two player browsers, especially Alt+double-click (owned vs
  others), rapid sheet typing, token library equip, fog movement.
- All currently staged work bundled into one approved Vercel deployment.
