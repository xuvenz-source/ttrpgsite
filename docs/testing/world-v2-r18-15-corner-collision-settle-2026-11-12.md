# B10-R18-15 — Drag cell-edge jitter, denied-collision retry, and terminal lock timing

**12 November 2026, Australia/Melbourne — staged only / NO-GO for another deployment.**

## Exact live baseline and user-reported regression

The currently deployed frontend canary is R18-14, production Vercel deployment `dpl_82NADuBV58sGdaXdcEgm2Gm2pzBb`, source `96c90f9d38eb4b794f2cb73b0f93c9a3d04ec2e3`, on `https://ttrpgsite.vercel.app`. The Git repository's protected `main` remains R16 `90df8c960e79e8d66c322095611427da7bb09de4`. R05 backend SQL has **not** been installed. Current canary enables only `VITE_WORLD_V2_OBSERVER_RECOVERY=1` (12s signed observer recovery); guarded 700ms observer mode remains OFF.

Solo-DM normal movement screenshot/trace after the canary: `authority.begin` n=5 p50 **226.9ms**, p95 **371.9ms**; `authority.advance` n=19 p50 **381.3ms**, p95 **1105.1ms**; `authority.commit` n=5 p50 **1168.4ms**, p95 **1462.5ms**; `visibility.rpc` n=6 p50 **260.8ms**, p95 **363.8ms**. `movement.blocked=2`, `movement.committed=4`, `input.pointer.status:busy` multiple times, one keyboard and four drag gestures, and one `blur` cancellation. Render JS timer p95 0.1ms. User reports that placing on a cell corner, wall collision and fog boundary temporarily lock further movement.

Illustrative dragged gesture: grabbed at t=9,120ms, released at t=11,198ms, additional server-approved advances at 11,713ms and 12,279ms, *committed* at t=13,741ms. This is **2,543ms post-release wait**. A second drag released at 14,328ms and committed at 17,100ms (**2,772ms post-release wait**). Another at 22,772ms committed at 24,128ms (**1,356ms**). These include remaining authorized advances, terminal SQL commit, and client scheduling. This is NOT a measured network RTT or a measured renderer cost. A later same-identity gesture can be rejected as `busy` until the previous transaction finishes.

Before: R16 p50 begin 555.7 / advance 984.4 / commit 1654.9 / sight 646.8ms. R18-14 improved all medians but still doesn't achieve crisp release/regrab. Baseline sessions differ, so do not attribute all gains causally to the frontend.

## Source-based diagnosis and actual scoped fix

In `GesturePath.js`, `gridPoint` rounds floating map-pointer coordinates around half-cell boundaries. `MovementController.updateGesture` previously made **every** near-boundary flip a distinct path bend, including zigzags at a cell corner. This may create excess server Advance calls and a release backlog. `KeyboardStepper` already suppressed an identical server-ACKed blocked crossing, but pointer drags did not: repeated exact denied targets could requeue additional Advance RPCs.

R18-15 adds the *pure* `PointerIntentCell.js` with **0.10-cell boundary hysteresis** for drag/touch/preview input only. Grid moves into the next cell as soon as the pointer clearly crosses the boundary; integer keyboard input and multi-tile jumps retain their exact semantics. This does **not** confer collision or sight authorization. It normalizes negative zero for deterministic integer cells.

`MovementController` now suppresses only an **identical previously server-denied target** while the authoritative approved origin is unchanged and the gesture is the same. It does not suppress changed endpoints, accepted safe prefixes or new gestures; the server still validates any genuinely new requested route and authorizes each accepted step. A denied ACK is used only as input feedback and never as a sight or wall disclosure. The existing policy to keep the next live gesture locked until the prior authenticated movement commits is **deliberately preserved**: permitting overlapping canonical movement without authoritative ordering would reintroduce rubber-banding and divergence. Unlike keyboard, pointer drag has no new speculative queue of mutable positions.

The bounded opt-in `WorldTrace.js` and offline `scripts/qa/world-v2-solo-dm-analyze.mjs` now expose **`movement.release-to-terminal`** (p50/p95/max) without paths/IDs/coordinates. This metric covers actual user-perceived post-release lock time; it is *not* pure SQL latency. A >750ms p95 is a diagnostic alert only.

Historical integrity `tests/world-v2-r18-05-consolidated-integration.test.mjs` retains the unchanged **original R17 controller blob SHA** and requires an explicit **R18-15 exact reviewed controller SHA** `0603e7b42ebd937a41e2a65e8b13089aa496dfba`, rather than silently rewriting/weakening the frozen hash test. The R17 KeyboardStepper and WorldV2Board hashes remain strictly frozen.

## Test gates / limits

Dedicated tests include (a) 1000 alternating corner jitter samples, diagonals/negative cells, and intentional crossings; (b) 200 exact denied mouse retries yield only one server Advance, followed by a valid changed direction; (c) a blocked route with an *accepted safe prefix* still advances and commits; (d) an independent gesture can retry after a denial; (e) delayed server ACK/commit keeps active lock and records `movement.release-to-terminal`; and (f) source audit of no DB/privileged bypass. These are simulated authority tests, **not live browser acceptance**.

Release criteria for the next frontend-only canary after **new explicit frontend approval**: compare R18-14 vs R18-15 under matching map/DM conditions, inspect post-release lock p95, wall/fog collision behaviour, corner drag redirection, no wall penetration and unchanged fog security. If the busy lock remains dominated by `authority.commit` or pending `authority.advance`, continue the independently gated server-authority redesign. Do not misrepresent this client-only correction as a cure for 1.2s commit RTT.

Server R05 migration remains **frozen and unapplied**; its installation needs a **different explicit approval**, an actual authenticated Supabase CLI 83-history/one-pending dry-run and independent Auth DM/P1/P2 visibility acceptance. Guarded observer 700ms recovery remains OFF. No additional paid services or infrastructure.

**Current decision: STAGING / NO-GO for any further production deployment until separately approved.**
