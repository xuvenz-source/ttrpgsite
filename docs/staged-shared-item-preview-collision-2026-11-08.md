# Staged bugfix: shared inventory item creation and DM player preview wall collision

Date: 8 November 2026
Production base: `e2beffa4000fd7b8030ba5f6b1d57c0cb19f2c9c`
Branch: `stage/shared-item-preview-collision-2026-11-08`
Status: staged only — **no production deploy or database changes**.

## + Item in shared inventories
The issued-tool collaboration hook did not expose a `ready` flag even though
the generic InventoryPanel deliberately disables item creation until ready.
It now sets that flag after the first successful lease read, resets it when
switching issued tools, and reports failures rather than silently enabling
writes. Existing per-item lease, RPC persistence and ownership guards remain.

## Player preview movement and collision
Pointer drag already checked swept wall geometry; configured movement hotkeys
could still call the DM's privileged live movement queue. Since DMs can bypass
server collision, this could appear to walk through walls and accidentally
save a preview position. Both inputs now share `movePreviewToken` and the
existing `checkTokenMovement` swept-footprint test. The normal movement
queue is disabled while DM preview is active; real board drops are also
disabled. Preview remains a local, unsaved simulation.

## Verification
- No new migrations, paid services, or separate database environments.
- Automated regression tests cover real-world fractional wall geometry,
  collaboration readiness and all keyboard/pointer write guards.
- GitHub Actions lint, tests, audit, build and CodeQL must pass.
- Live-browser multiplayer checks are intentionally deferred until the next
  explicitly approved production release.
