# World Engine V2 — map image, pointer lifecycle, and preview movement

**Status:** Staged in PR #66 on 10 November 2026. No production deployment or database migration.

## Live failures reproduced by tester (after PR #65)
- The map terrain bitmap disappeared after an otherwise successful V2 cutover.
- Token click selection works; dragging does not move a token either as DM or player.
- DM player-preview movement does not work, while rapid normal arrow movement is improved.

## Code faults and amendments

1. **Signed terrain source lifecycle:** A V2 scene can arrive before the asynchronously signed map URL. The scene callback alone cannot assign the late URL. Bind the persistent renderer to changes in signed URL, map identity, and effective viewer; select URLs by `displayedMap.id`, not `activeMap.id`. Explicit invalidation removes the image source without remounting fog, sprites, or scene.
2. **Pointer capture surface and recovery:** Attach one native input controller at the map viewport in capture phase, ahead of nested React portals. Keep the authorization and editor checks inside the existing resolver. If `setPointerCapture` is unsupported, throws, or capture is lost, track that pointer on the owning document until pointerup/cancel. Cancel on actual window blur (the map's arrow-key target is deliberately a no-op). Remove every temporary handler on release/unmount; do not introduce another movement controller.
3. **Native browser gestures:** Stop HTML dragstart on world sprites and reserve their surface for pointer movements with `touch-action: none` / `user-select: none`. Do not intercept drops from the Units, Characters, or Tools panel, empty-map touch panning, the resize handle, handouts, or DM environment controls.
4. **Preview actor selection:** Entering DM preview can leave a previously selected multi-token or tool group. The preview movement RPC deliberately authorizes **exactly one** player-owned token, so a grouped gesture is denied. Construct a singleton preview selection even when the clicked preview actor was previously part of a DM group. Maintain actual player identity, published sight restrictions, collision scene, and no persistent preview motion writes.
5. **Safe diagnostics:** Surface bounded permission, editor-lock, selection and active-gesture failures without IDs, grid coordinates, permission grant details, or additional RPCs. Display generic sight-unavailable feedback even when the visible roster is empty.

## Regression coverage

- Signed URL late delivery, renewal, invalidation, and source safety
- Native event capture; viewport lifecycle; document-level fallback; capture loss; blur/unmount cleanup
- Native browser drag prevention scoped only to map sprites
- Preview singleton selection cannot inherit multi-token/tool groups
- Existing phase-9 virtual preview movement test with no live position writes
- CI build/frontend tests, isolated PostgreSQL authority tests, CodeQL

## Manual release gates (still required)

1. Cold load a player-visible map and switch maps; verify terrain appears even if signed URL arrives late.
2. As DM, drag an authorized token continuously across several cells; release and confirm one canonical endpoint. Repeat at 0.5x, 1x and 2x zoom.
3. As a player, drag only an owned or otherwise granted token; verify no hidden actor becomes selectable and the token stays responsive with fog enabled.
4. Select multiple DM tokens, enter preview of a player-owned token, then drag and arrow-move only that preview actor. Leaving preview must preserve the live token's original persisted position/exploration.
5. Confirm wall collision, editor Lock Tokens, resizing, handout interaction, empty-map touch pan, map drops and ctrl+wheel zoom.
6. Watch movement for flashing, duplicate subscriptions, map reloading, and unnecessary Supabase RPC activity.

This PR fixes concrete input lifecycle paths but cannot establish authenticated browser acceptance without a live session. Do not treat green Node tests as proof of smooth user interaction.
