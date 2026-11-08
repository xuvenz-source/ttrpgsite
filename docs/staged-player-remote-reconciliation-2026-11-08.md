# Player-side token continuity follow-up — 8 November 2026

**Status:** staged for the next approved consolidated update. **Not deployed.** Based on production commit `26765915deac294e154d1aeac05b23496d76de32` (PR #49). No SQL migration, RLS changes, new Edge Functions, preview deployments or paid infrastructure.

## Player observation

After the one-final-write trajectory rollout, player browsers still exhibit occasional rubber-banding and token/artwork flashing. This is not evidence that the server is again writing intermediate positions.

### Root causes verified in source

1. **Old full-query token snapshots could overwrite newer Realtime rows.** The existing refresh request ID compared reads to *other reads* but did not compare a delayed RLS fetch with a position event applied while the fetch was in flight. `applyAuthoritativeTokenMotion` also left `updated_at` untouched, making stale-versus-newer comparison impossible.
2. **A final position could differ from the last throttled observer preview.** When the authoritative Realtime event did not match `getPreview().x/y`, the client left an old transform mounted until the 1,350ms observer expiry and then cleared it. That can hold a token behind its final server position and eventually snap.
3. **Every React commit recreated token and monitor ref callback identities.** Even without unmounting the actual sprite, repeated null/rebind callbacks dropped the movement runtime's stored base transition or re-captured a temporary remote CSS transition as the permanent base.
4. **Fog invalidation imposed a fixed 60ms extra blanking delay.** A new authoritative visibility tick intentionally revoked unowned token sight immediately, but the authorized `get_authorized_map_fog` RPC was deferred by a 60ms trailing coalescer before even starting network latency. Cached artwork could also remain lazy-loaded when an authorized token reappeared.

### Staged changes

- `LiveTokenMovement.js`: newer `updated_at` database versions win for a token still present in the latest RLS-filtered snapshot; omitted rows **must always disappear**. Realtime patches now advance the token's server timestamp and ignore late older events.
- `RemotePositionSettler.js`, `TabletopApp.jsx`, `TokenMotionRuntime.js`: final saved positions are queued for settlement only after a 180ms gap in private observer packets; a new packet cancels older settlement. The sprite and monitor ease 95ms toward the RLS-authorized final location; the transform is retired only after animation and canonical React layout have had time to catch up. Observer expiry also uses the current authorized token read to settle rather than clearing its old transform unconditionally.
- `BattlemapBoard.jsx`, `TokenMonitorFrames.jsx`: stable sprite/monitor ref callbacks, with canonical coordinates updated in layout effects. This prevents ref teardown/rebinding on unrelated fog, monitor, or token updates.
- `PerformanceScheduling.js`, `useAuthorizedMapFog.js`: the first server visibility tick starts an authorized RPC **immediately**. Subsequent bursts are still coalesced. Authorization revocation remains fail-closed throughout the RPC; no client may assume a token is still visible.
- `Artwork.jsx`: eager loading specifically for already-authorized on-board token art, while off-board artwork stays lazy, so remounted visible tokens can reuse browser imagery with less placeholder delay.
- `tests/player-remote-reconciliation.test.mjs` plus updated fog audit tests validate ordering, missing RLS rows, settling, cancellation, stable bindings, fast fog scheduling and role boundaries in UI source.

### Important security limits / remaining investigations

- A **real new fog visibility revision** can still temporarily remove an unowned token from the board until the server proves it remains visible. Eliminating that completely would require an authenticated per-recipient visibility snapshot/delta protocol; simply keeping old NPC art visible during unverified sight changes could leak hidden NPC locations.
- These fixes have **not yet been validated in a live two-browser player/DM session**. Green static/unit tests are not proof of low remote p95 latency, perfect zero-flash rendering or safe authorized visibility under all racing updates.
- No changes to server-authoritative wall collision, published lighting, private observer broadcast permissions, token ownership, tool movement, trajectory SQL, or RLS policies.
- The previous `20261108055943` one-write migration is already live and **must not be re-applied**.

## Manual release acceptance

With 2+ player browsers and a DM on a fog-enabled map and an otherwise comparable fog-disabled map:

1. Repeated short, fast and bent drags including stop/start and simultaneous movement; check old positions do not briefly rewind.
2. End a drag immediately after a cell crossing, before a 115ms observer preview would normally be sent; ensure the token smoothly resolves to its last committed cell without a 1.35s freeze.
3. Move visible NPCs behind walls, around doors, into/out of LOS and back; verify no concealed token persists or hidden artwork/positions are disclosed. Count any momentary unowned token concealment during real sight revisions.
4. Stress token status bars and signed image art under repeated Realtime updates. Confirm no unrelated tokens flicker when one token moves.
5. Test tool and mount movement, multi-token groups, DM override and denied player collision attempts remain correct.
6. Check Supabase database errors and Realtime warnings and measure browser pointer→local paint, preview RPC→private packet, authoritative commit→remote paint and p50/p95 observed delay. No performance numbers are claimed without these measurements.

**Deployment policy:** stage only until the designer explicitly requests a deployment. Combine all release-ready outstanding staging in one `main` merge and one production Vercel deployment, after code/permissions/conflict audit and green CI/CodeQL.
