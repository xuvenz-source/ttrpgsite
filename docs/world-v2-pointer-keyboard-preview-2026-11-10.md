# World Engine V2 input continuity: selection, drag, keyboard and DM preview
Status: **staged only**; production remains commit `bab52861` until designer approval.

## Observed live regression
DM no longer receives sight error on PR #63, but clicks cannot select tokens, drag gestures don't start, keyboard movement works only after Units selection and pauses between tiles, and preview tokens cannot move. This is a separate input-routing defect.

## Integrated frontend-only repair
- Pointer selection: accept the existing sprite ID when available. Otherwise hit test the pointer against the **current server-authorized** piece roster, never against hidden tokens or raw client coordinates as authorization. Require existing DM/owner or issued-tool control checks before selecting, preview only its selected player token. Do not steal events from handout pins, editors or resize handles.
- Portal click: explicitly selects a permitted token/tool on ordinary click; drag remains a single native pointer gesture that can move locally at first frame.
- Arrow input: send ALL V2 directional keys, including DM simulated preview, through the same buffered gesture. The legacy 115 ms repeat throttle remains only on the legacy board.
- Keyboard: a 180 ms release grace period coalesces quick taps/held arrows, and bounded follow-up steps entered while a previous server commit finishes are queued instead of ignored. On new session, re-fetch authorized canonical sight; no client-writable bypass.
- Preview: starts one virtual client-side V2 movement gesture from the currently authorized player token, not the legacy per-tile handler. Preview does not write player movement or exploration.

## Safety and validation
No SQL, RLS, migrations, new Realtime connections, or public broadcasts. Frame identity and permission generation still gate movement. New unit tests cover authorized hit testing, collision/control boundaries, key hold, buffered follow-up and preview mode. Validate CI, build, CodeQL and then live DM plus two-player sessions with varied map zoom and editor modes. Live authenticated pointer and keyboard acceptance remains necessary.

Do **not** deploy until explicit designer authorization and release-ledger reconciliation.
