# Staging — seamless multiplayer token movement

**Staging only.** No frontend deployment, Supabase migration execution, Vercel preview or new paid testing infrastructure was authorized.

## Implemented
- RLS-authorized Realtime map-token UPDATE coordinates immediately patch the DM/player board. Background full-token refresh remains the reconciliation fallback for missing or deleted rows.
- Local movement and keyboard commands stay optimistic. Unrelated token refreshes no longer interrupt a live drag, and incoming 50ms movement previews get a brief CSS transition without delaying local movement.
- On **fog-enabled** maps, shared coordinate previews remain disabled for privacy. Instead, active dragging persists intermediate x/y destinations through existing server-authorized token writes, throttled to about 5–6 steps/second per controlled drag. The queued-writes layer coalesces intermediate steps when the network is slower. DM and observing players receive these through RLS-filtered change events, without waiting for mouse-up. Canceling a drag restores its initial destination.
- A final preview is removed when the database confirms its exact destination; unconfirmed previews expire earlier and fall back to the canonical row.
- On a visibility revision, token authorization still immediately revokes previously visible cells. Only map artwork inside the previously visible **and already explored** set can remain bright while the per-viewer RPC returns. Unknown/unexplored cells and secret tokens remain hidden.
- A staged SQL migration skips visibility ticks for pure x/y token movement when the map has fog OFF. It still generates ticks on fog ON and on access-changing or map-changing updates.

## Release requirements
This branch must be reconciled with **all** still-unreleased staged features in `staging/next-release-ledger.json`. Apply compatible SQL migrations only after explicit release approval, before the one matching production frontend update. Use existing Supabase Free project and test campaigns; do not require a separate paid DB test environment.

## Live multiplayer QA
With a DM and at least two players in existing test campaigns, test simultaneous dragging, keyboard movement, movement of other players, camera/zoom stability, network delay, temporary Realtime disconnection, final-position convergence, wall collisions and rejected moves. Verify no map image reload, greying/black flash or drag flicker.

Repeat with fog OFF and ON, shared fog, line-of-sight blockers, unrevealed NPCs, map assignment differences, DM rule changes and affected tool placements. Verify the server still withholds hidden coordinates and content from unauthorized players. Verify pure fog-OFF movement no longer bumps visibility revisions but fog-ON movement does.

Recovery: revert frontend in a controlled release. If the SQL change misbehaves, restore the original `forge_visibility.tick_tokens()` definition from the authoritative fog migration and retest on existing campaigns.
