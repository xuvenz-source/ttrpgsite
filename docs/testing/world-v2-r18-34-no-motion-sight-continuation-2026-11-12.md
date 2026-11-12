# B10-R18-34 — Zero-motion collision terminal/signed sight reuse

**12 November 2026, Australia/Melbourne — staged only / release NO-GO.**

## Verified parent and live containment

Parent is the exact R18-33 cumulative staging commit `9427eafb851c1fded4727ee7eb855f385945d4ef`, draft PR #137. This is a child staging branch, not an isolated live frontend release fork. GitHub's raw diff versus `main` contains all unreleased R05/R18-17/19/20/26/27/28/30 dependencies: **do not merge or deploy that diff**. The user rejected the R18-32 live frontend canary due to worsened collision lag and rubber-banding. The public test-ground was rolled back to original R18-31 `d94985e1135822953c9f67d9b46d238facaaaa1f`, deployment `dpl_DCyZdsSTjmvbT5YnMK7sjbzGTgem`. Live Supabase has 83 registered migrations and R05 `20261111023204` is not installed.

## Specific source-backed problem

Before R18-34, the real `WorldV2TabletopRuntime` always handled `committed` by emitting `onCommit` and starting fresh `refreshVisibility('committed')`, even for the `noMotion:true` outcome where no canonical token/tool position changed. `WorldRenderer` independently converted that no-motion gesture into a pending canonical handoff and fired its resync hook. If keyboard keys arrived during terminal completion, `KeyboardStepper.finish()` performed `refreshVisibility('keyboard-continuation')` before draining them even if the server had confirmed that the token never left its existing signed sight position. These are avoidable sight/continuation waits after an explicitly blocked gesture. They are **not** proof that SQL wall collision or network Commit RPC has been accelerated.

## Bounded amendment

1. **WorldRenderer:** For `event.type==='committed'`, `event.noMotion===true` and the same exact original local anchor, retire the movement outline/overlay, invalidate the sprite pass, and **do not create a canonical handoff** or request canonical resync. A non-origin or malformed no-motion event fails closed. For actual movement, unchanged renderer handoff/resync code executes.
2. **WorldV2TabletopRuntime:** Only real committed motions with `!event.noMotion` emit canonical Commit notification and request post-commit signed visibility. Unchanged no-motion already has certified sight. All real Commit, failure, revocation, preview and observer handling remain as before.
3. **KeyboardStepper:** Capture the original **signed visible piece**, map/scene frame identity, revisions, permission generation and scope when an actual keyboard gesture begins. When `endGesture` finishes with exactly `{status:'committed',noMotion:true}`, skip the keyboard-continuation refresh ONLY if the runtime is still authorized, renderer-authorized, not stale or stream-locked; the signed same frame and scene remain identical; the player/DM (never preview) scope and the original piece's source cell still match. Otherwise preserve the former refresh and queued input behavior. Never infer walls or client-write coordinates.
4. **Tests:** Add adversarial keyboard source/identity/revocation/scene/real Commit checks, and renderer tests for no-motion overlay retirement and forged mismatched coordinates. The historical R17 KeyboardStepper blob `1951a5802b7ed6b15af080660bc8f88627c83d2c` remains explicitly recorded, and a separate R18-34 reviewed blob `59b835fda26bfefe1eba0fce62a4a1b4b13b05d1` is pinned in the consolidated source-lock test.

## Non-goals and limitations

- This avoids redundant sight RPC(s) **only after a truly unchanged position** and can reduce subsequent queued keyboard collision delays if signed visibility remains usable.
- It cannot make a blocked **Advance** execute faster, shorten a real **Commit**, remove a necessary signed sight request, make multi-cell ungranted player prediction safe, or improve drag movement with an accepted prefix (which still requires normal Commit/reconciliation).
- There is no measured live latency gain. R18-33 SQL-local benchmarks were too small and mixed to establish a consistent database speedup.
- This cumulative branch must not be deployed to live. Only a separately re-isolated frontend-only canary from the exact R18-31 live source, with all security/CI gates passing and rollback, would be eligible for limited single-DM testing. R05/post-R05 SQL is a separate release, blocked on authenticated migration/CLI reconciliation and real DM/P1/passive-P2 sight/LOS/revocation validation.
- No new SQL, RPC, environment key, grants, RLS changes, paid resource, Realtime subscriptions or polling.

## Required checks

Run exact-head Node and renderer regressions, production Vite build, dependency audit, lint, Edge type checks, CodeQL, isolated PG17 authority and combined PostgreSQL integration. Confirm full source diff against R18-33 parent and verify live alias + migration count remain unchanged. Fail closed on any test or signed-sight mismatch.

**Decision: source staging only; live release NO-GO.**
