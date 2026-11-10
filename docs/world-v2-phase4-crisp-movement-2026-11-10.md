# World Engine V2 — Phase 4: Crisp server-certified motion (10 November 2026)

## Implemented in staging
- Preserve immediate grab feedback and the single existing RAF scheduler. The authority remains the sole source of approved movement; untrusted pointer intent cannot move a player through hidden collision.
- Attach a copy of the validated accepted server path to each movement acknowledgement. The local renderer now interpolates **only those adjacent authorized cells**, preserving bends and avoiding jumps to each multi-tile batch endpoint. No second animation system or server writes.
- Keep a server-certified local prediction ahead of older ACKs. Release that prediction once the approved path actually reaches or passes the predicted position; a wall denial immediately clamps the display to the last approved cell. No unbounded guessed travel when player sight lacks prediction grants.
- Run remote interpolation through the existing observer buffer but cap catch-up displacement to 2.5 approved cells per rendered frame, including after bursty packets.
- Queue at most 96 local approved waypoints, replacing an excessive cosmetic backlog at a **verified approved endpoint**. Continue to validate every server ACK and never shortcut unapproved geometry.

## Limits / release gate
The currently published player-effective prediction grants authorize at most a single adjacent cell. This phase deliberately **does not** turn those grants into a blanket multi-cell visibility/collision bypass. Under unknown geometry or slow server acknowledgement, a player may still trail the pointer until the server responds; that is preferable to leaking undisclosed walls or promising impossible client-side motion.

Automated tests must confirm ordered bend presentation, first-frame grab, no sprite/canvas churn, 100-frame no-blackout regressions, multi-client server permissions, frame delta cap, bounded queues and no unapproved through-wall path. Authenticated live DM/player/preview/browser testing with actual server timing and disconnects is a separate remaining gate.

No database migration, new Realtime channel, telemetry upload or production deployment.
