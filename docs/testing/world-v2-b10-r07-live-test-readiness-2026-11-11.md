# B10-R07 — Release-readiness gate and baseline live test protocol

**11 November 2026 | STAGED / GATE BLOCKED.** Parent R06 draft PR #91 `8c28466e69ce7685289415e059697c1c3aed77f3`. Live main stays at `b246b3a72537b53b2afc2a9a38cbe1db3609a8af`. No migration, Vercel deployment, env change, production merge or test-campaign edits in R07.

## Designer authorization and authority limits

Designer authorized initiating live-test deployments **when engineering release gates are sound**, and requested concrete tests. This does not waive account/LOS security, PostgreSQL source/history conflicts, client compatibility, free-tier quota limits, rollback controls or the incremental workflow rule to ship one reviewed integrated release. Test campaigns are disposable; actual user accounts and cross-account confidentiality are not.

## Independently checked readiness

- Vercel `ttrpgsite` production READY currently deploys PR #70 `b246b3a...`; no R02–R06 build is on the live site.
- Preview SSO protection is currently enabled. The preview environment does not explicitly set the production-only `VITE_WORLD_ENGINE_V2=integrated` and `VITE_WORLD_ENGINE_V2_READY=true`; a preview with current env may not run the same V2 engine. Do **not** disable preview authentication or assume that three Supabase player accounts can pass Vercel SSO just to perform an unsafe test.
- R06 exact-head GitHub CI, combined PG17 and CodeQL succeeded, but these prove neither signed multi-account fog nor the rendering in this Vercel configuration.
- Existing live test maps: `TestCampaign / GumfordGarden` (6 tokens, 3 published environment objects), `TestCampaign / Vaelun Cloudstrider` (0 tokens and no saved environment), `TestCampaign2 / GumfordGarden` (1 token, 0 environment objects). Both GumfordGarden maps have **automatic fog = false and collision.enabled = false**. They are not a protected collision/LOS test fixture. No map, token ID, hidden geometry, Auth ID or credentials are committed to this protocol.
- Last live migration state **83 applied / latest 20261109171247**, no R05 install; historical filename collision and 36 repo-only versioned files remain a backend blocker.

**Decision:** No R06 full-stack production deploy or R05 migration. No forced preview or temporary disabling of SSO while the protected three-session fixture and client build parity are unqualified. The first useful live action is the **no-change baseline** on existing PR #70 and a designer-prepared disposable fog/collision fixture; after results, qualify a compatible scoped R02-only client test build and its access path. This step records the test authorization without pretending a deployment has occurred.

## Current-live baseline instructions for designer (no new deployment)

Use the public `https://ttrpgsite.vercel.app`, the existing `TestCampaign` / `GumfordGarden` map, and two or three **independently signed-in** browser profiles, e.g. regular DM plus Player1 and Player2 in separate private/isolated contexts. Do not share the same Supabase login. Run three approximately 10-cell gestures per role; avoid inventing p95 numbers from intuition. Do not expose login credentials or hidden-player content in shared logs.

| ID | Action | Observation to record |
| --- | --- | --- |
| BASE-01 | DM joins normal map and drags on **first interaction** | Did pick work before preview? Input delay, movement smoothness, repaint/flash count |
| BASE-02 | DM rapidly holds arrows for 10 cells | Discrete stalls, whole-map flashes, actual endpoint |
| BASE-03 | DM enters player preview, moves, exits, immediately tries ordinary drag | Preview parity, normal-mode first-drag regression, any canonical changes caused by preview |
| BASE-04 | Player1 drags own token and repeats with arrows | Whether drag starts, whether 10-cell movement allowed, delays/rubber-band |
| BASE-05 | Player2 watches while Player1 moves then reverse roles | Remote animation before release or only after commit, map flashes, sprite flicker |
| BASE-06 | DM and both players remain connected for two minutes with alternating movement | Frequency of map reload/blackout, stale remote positions, visible errors |
| BASE-07 | Disconnect/reconnect one player and switch to second map, then back | Wrong-map token/fog, stuck controls, recovery |
| BASE-08 | Record sanitized 20–40 second clip per ordinary DM and player view | Count unexpected terrain reassigns/blackouts, compare normal and preview |

Report each row PASS/FAIL, a note about mouse vs arrows, and whether the **entire terrain** flashed versus just token redraw. A short recording is higher-value than subjective “laggy.”

## Protected fixture phase — separate later test

After baseline capture, DM may change the **disposable testing** map: publish **fog automatic on**, **collision on**, a solid wall, closed door, a 2×2 piece, a hidden NPC behind blocking geometry, a moving light and a second map with tokens. Then run A04's 24-case real DM/P1/P2 manifest with both player logins. Never claim R05/R03 authorization/fog compatibility from a currently unprotected map. If three real sessions or fixture assets are unavailable, mark cases BLOCKED, not PASS.

## Criteria before any subsequent live R02 canary deployment

1. Integrate current **main** and all relevant staged dependencies without accidentally enabling B05/B06/B08 or shipping uninstalled SQL-dependant behavior. Run exact-head Node/PG17/CodeQL and Vite with verified build-time V2 and R02-only flags.
2. Obtain a reachable QA deployment for DM/P1/P2 without weakening authentication/secret protections or requiring paid accounts. The current Vercel preview SSO is a real access constraint; options must be reviewed and either demonstrated or ruled out.
3. Scope R02 to an actual disposable test map via `VITE_WORLD_V2_OBSERVER_RECOVERY_CANARY_MAP_ID`, validate signed sight and correct browser cache behavior, measure extra 6-second refresh CPU/RAM load.
4. Qualify the separate **all-map** build and stale-client transition before globally applying R03, and use only the reviewed exact single-migration history-tracking operation; broad db push remains prohibited.
5. Stop on hidden NPC leak, wrong viewer permission, map flicker regression, critical memory rise or stale cached authorization.

**Handoff:** R07 readiness audit and baseline protocol staged, no user action forced on site. Next single step **B10-R08**: evaluate the baseline evidence and prepare (or explicitly block) a separate safely accessible R02-only live test build. No SQL apply without confirmed all-map client compatibility.
