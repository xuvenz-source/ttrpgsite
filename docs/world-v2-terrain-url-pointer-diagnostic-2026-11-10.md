# World Engine V2 — terrain image and pointer drag follow-up
Status: staged only, 10 November 2026. No SQL or production deployment.

Live regression after PR #65: the map terrain image is blank and mouse dragging still does not move tokens. Click selection worked previously; arrow movement improved.

**Confirmed terrain bug:** the signed map URL is delivered asynchronously by SignedAssetStore, but WorldV2Board only calls setTerrainSource inside the initial onScene callback. Late or refreshed URLs are never applied. The app also indexes the map URL by activeMap rather than displayedMap.

**Changes:** a layout effect syncs the signed URL with the persistent renderer without changing scene, authorization, fog or remounting sprites; the renderer can clear its URL on explicit authorization invalidation; correct displayedMap indexing.

**Drag investigation and repair candidate:** the native pointer controller now captures on the encompassing viewport, not only on the interior board; touch input uses authorized hit testing before entering pan mode. Add bounded status feedback when a visible controllable token pointerdown is refused. Feedback contains no secret IDs, coordinates or RPC results. We cannot fully diagnose the user's browser interaction from Node-only simulated handlers, so authenticated live verification is mandatory. No new sockets, polling or permission bypass.

Release acceptance: CI, CodeQL, isolated PostgreSQL authority; browser map images with cold and delayed signed URLs, token click/drag at zoom levels, DM editor Lock Tokens, preview movement, players and hidden-fog rules.
