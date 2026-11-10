# World V2 pointer drag / DM player-preview recovery
STAGED ONLY — no production deployment or SQL.

Live after PR #64: click-selection works, dragging fails as DM and in player preview, arrow response improved, preview cannot move.

Code findings: native board pointerdown was registered in the bubble phase and could be stopped by a React portal or overlay while the separate React click still selected a token. A valid DM player preview also inherited the real map editor's lockTokens restriction, despite using a non-persistent, collision-authorized preview authority.

Repair: capture native pointerdown before child handlers; keep all server-authorized sight, token owner and tool permission gates; skip editor/handout/resize controls before token hit testing; allow only valid virtual DM preview to bypass editor token locking. Real DM editing remains locked, and invalid preview identities remain denied.

Tests simulate a full preview pointer down / advance / server player-effective sight refresh and assert no persistent motion RPC. A second test verifies native capture registration and cleanup.

Live release acceptance: DM and player token drag, preview arrow and drag, walls and fog, zoomed map, resize, handout pins and map editor. This branch has no migrations or new Realtime channels. Do not deploy without approval.
