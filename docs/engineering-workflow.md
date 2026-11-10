# Tabletop Forge — Incremental Engineering Workflow

**Version:** 1.0 (designer-approved, 10 November 2026)  
**Roles:** Designer = product owner and sole release approver; assistant = lead developer and implementer  
**Status:** Approved plan, staged in A03; implementation work is separately gated.  
**Canonical live-state links:** [Engineering progress](../staging/engineering-progress.json) · [Release ledger](../staging/next-release-ledger.json) · [Development rules](development-workflow.md) · [AGENTS](../AGENTS.md)

## Mission and technical direction

Build a reliable, secure and responsive alternative to Roll20, initially for real small-group campaigns. Keep World Engine V2 as the foundation; evolve the movement authority protocol instead of initiating another wholesale engine rewrite. Optimize real DM/player movement, private fog, collision, observer/rendering continuity, Supabase free-tier costs and maintainability. Preserve sheets, inventories, macros, lighting, initiative, tools, handouts and campaign permissions.

**Architectural boundary:** A locally responsive presentation may only enter server-certified traversable space. Hidden walls, NPCs or positions may never be revealed through client prediction, public broadcasts, failed recovery or role switching.

## Mandatory working contract — one numbered step per user request

1. Execute exactly one numbered microstep per instruction. Never silently continue into another step, gate or release.
2. Keep diffs narrowly reviewable, normally one concern and 1–3 implementation files plus tests. Split work when larger.
3. Finish work within the current turn and report partial completion or blockers. No unsupervised background work.
4. Re-verify current GitHub main, pending PRs, release ledger and relevant live migration history at each step. Never assume a remembered staging state is current.
5. Stage changes on a fresh stage/fix branch; follow AGENTS.md and docs/development-workflow.md. No merge, production deployment, SQL apply, Edge deploy or live settings change unless the designer specifically authorizes it.
6. Preserve other staged work. For any release, reconcile **all** unreleased ready branches and their frontend, SQL, Edge and security dependencies into a single approved release candidate, never copy an old branch over main.
7. Keep server ownership, collision, map permissions, viewer scopes, private observer routing and fog fail-closed. DM preview is nonpersistent and cannot bypass player authorization.
8. Run targeted tests for each change and CI/build/CodeQL at integration gates. Clearly separate mock/static checks, CI, read-only SQL inspection and real authenticated multiplayer tests.
9. Keep within existing free-tier infrastructure. No mandatory paid staging database or additional paid services.
10. End every step with an auditable handoff, repository branch/commit/PR, exact files and checks, blockers, deployment state and next **one** step. Update staging/engineering-progress.json, and the release ledger when release facts change.

## Product invariants and acceptance

- DM and player can click-select, drag and use rapid arrow keys immediately on first entry. No editor overlay may intercept unauthorized input.
- Local token movement responds within server-certified safe space. Server validates canonical movement and collision on all paths, including RPC bypass attempts and multi-token groups.
- No hidden NPC, secret wall, unrevealed fog or private player map data is exposed by Realtime, REST or Storage.
- Ordinary token movement does not reassign terrain images, recreate all sprites or black out the map; other authorized players observe motion **during** dragging.
- Permission, viewer, map or publication changes immediately conceal unauthorized content. Recoveries must be bounded and fail closed.
- Player-preview uses effective player sight but never changes the live token position.
- Character sheets, inventories, macro dice, tools, combat/initiative, lighting, handouts and campaign administration remain usable.
- A deployment must match the approved frontend and applied migration/Edge state.

### Proposed engineering targets (not observed production results)

| Indicator | Initial target / gate |
|---|---|
| Input to first visible permitted local motion | p95 at most 32 ms on a defined reference device/browser |
| Typical local rendering | Aim for 60 fps; avoid routine frames exceeding 50 ms |
| Full-map blackout / terrain reassignment from ordinary motion | Zero |
| Hidden information or unauthorized movement disclosure | Zero tolerance |
| Remote observer latency | Measure p50/p95 at normal, 100 ms and 200 ms simulated RTT; set a defensible budget after baseline |
| Movement database work | Eliminate unnecessary sequential per-cell waits; bound authorizing RPC cost |
| Reconnect or permission failure | Restore coherent scoped sight or visibly fail closed |
| Campaign feature parity | Authenticated DM and two-player smoke matrix passes |

## Step tracker convention

The machine-readable tracker is staging/engineering-progress.json. Valid states: NOT STARTED, IN PROGRESS, BLOCKED, STAGED, VERIFIED, RELEASED. **STAGED does not mean production-ready or deployed.** VERIFIED means the step-specific gate was met; it does not imply a live multiplayer UX test unless explicitly reported. Each step must have evidence and carry-forward blockers.

## Track A — Baseline, release control and test conditions

**A01 — Establish source of truth — read-only.** Check GitHub main/branches/PRs, Vercel production SHA, Supabase migration versions, staging ledger, test campaigns and unreleased dependencies. **Done:** dated reproducible baseline; identify old/conflicting branches and active PRs.

**A02 — Review PR #71 in isolation — read-only.** Inspect full diff, same-authority sight retention, unknown pieces, failed recovery, retry limits, trailing refresh and exact CI. Choose retain, amend or supersede. **Done:** concrete decision and edit list with no merge.

**A03 — Publish persistent engineering workflow and progress ledger — staged.** Preserve this approved plan in docs/engineering-workflow.md, create a step tracker with baseline/handoffs, reconcile staging/next-release-ledger.json against verified merged PRs and applied migration versions; do not erase historical records. **Done:** a new development chat can locate next work and its blockers from GitHub.

**A04 — Define authenticated multiplayer test fixture — staged docs/tests.** Specify DM + two players, visible/hidden NPCs, doors, one-way walls, 2×2 tokens, torches, fog changes, player map switches and reconnect. Prefer existing test campaigns; do not include credentials. **Done:** reproducible manual browser test matrix.

**A05 — Baseline tracing — bounded staging.** Instrument or expose existing sanitized World V2 traces for gesture start, visible first paint, begin/advance/commit RPCs, observer gaps, sight holds, fog redraw and terrain/sprite remounts. **Done:** bounded, nonprivate logs distinguish network from rendering causes.

**A06 — Capture baseline — read-only / human QA.** Measure normal DM, DM player-preview, player arrows/drag, remote movement and fog flash with reference fixture; correlate browser traces, server RPC execution and free-tier usage. **Done:** recorded latency/flash reproduction with counts and caveats.

**Gate A:** PR #71 handling and core regressions measured. If release testing is necessary, obtain specific permission to deploy first.

## Track B — Movement authority redesign (critical path)

**B01 — Freeze protocol and security contract — design only.** Formalize beginning a gesture, validating waypoint bundles, committing, cancellation, permissions, collision, group movement and revisions. **Done:** state transitions and hostile-input contract.

**B02 — Evaluate transport alternatives — design/read-only.** Compare coalesced Supabase RPC path with optional dedicated low-latency authority service; model RTT and free-tier cost. **Done:** one defensible design choice and measurement criteria.

**B03 — Server path-validation core — staged SQL candidate only.** Add exact path, swept wall, door, footprint, one-way, owner and generation checks. **Done:** auditable nonapplied validation candidate.

**B04 — Hostile-authority regression suite — staged tests.** Test forged IDs, stale generations, replay, wall jumping, NPC access, tool/group privilege escalation and direct RPC calls. **Done:** denied paths never persist or reveal private geometry.

**B05 — Coalescing authority adapter — staged frontend.** Buffer newest gesture targets, bound in-flight validation, sequence/abort safely and preserve the old adapter behind a feature boundary. **Done:** deterministic ordering and cancellation tests.

**B06 — Local certified motion presentation — staged frontend.** Follow only finite server-certified traversable grants and stop at the safe frontier, never speculatively cross hidden obstacles. **Done:** immediate safe movement without concealment leaks.

**B07 — Live observer progress during drag — staged transport.** Publish per-recipient validated path segments at controlled cadence without trusting browser broadcasts; maintain visual interpolation independent of persistence. **Done:** authorized remote clients see motion before release.

**B08 — Atomic final commit and reconciliation — staged frontend/SQL.** Finalize approved endpoint with version/cursor ordering and retain sprites until canonical position catches up. **Done:** no double commit, stale snapback or reordering.

**B09 — Keyboard, touch, group and preview parity — staged tests/frontend.** Use common gesture authority, coalesce rapid keys and preserve preview as local-only. **Done:** consistent movement and permissions across inputs.

**B10 — Integrated movement release qualification — staged integration.** Combine B03–B09 with full tests, build, CodeQL, migration order, security and authenticated multiplayer matrix. Seek separate designer approval for deployment. **Done:** measured gain with no security/collision regressions.

**Gate B:** Responsive authorized normal DM/player movement, preview parity, collision protection, and stable remote presentation.

## Track C — Renderer, fog and observer continuity

**C01 — Trace full-map invalidation causes — read-only.** Classify scene publication, renderer seal, sight revoke, observer resync, signed URL reassignments, React remounts and sprite churn. **Done:** cause matrix grounded in actual traces/code.

**C02 — Strict revocation policy — staged.** Differentiate same-scoped benign observer recovery from true authority changes, enforce deadlines and fail-closed unknown-piece behavior. **Done:** no stale visibility or hidden entity leaks.

**C03 — Stabilize terrain and sprite ownership — staged.** Keep terrain and authorized sprite containers mounted across ordinary motion, with one renderer owner. **Done:** zero unintended remount/terrain reassign counts.

**C04 — Incremental fog and light updates — staged.** Persist prepared map geometry and update only changed server-authorized viewer sight/light regions. **Done:** no normal movement blackout and correct moving lights/doors.

**C05 — Robust observer resync/reconnect — staged.** Validate cursor monotonicity, packet loss/gaps, retries, scene changes, focus restoration, actor swaps and concealed pieces. **Done:** recovery or safe concealment without permanent movement disablement.

**C06 — Renderer/fog release gate — staged integration.** Run full authenticated DM/player latency/reconnect/permission acceptance; separately request release approval. **Done:** visual stability and confidentiality under live conditions.

## Track D — Codebase ownership and reproducible quality

**D01 — Active vs legacy reachability audit — read-only.** Trace TabletopApp, legacy BattlemapBoard, V2 and feature flags; identify truly dead code without deleting it. **Done:** ownership/import graph.

**D02 — Isolate V2 adapter from TabletopApp — staged.** Extract one bounded world-owner module at a time, without unrelated sheet/chat/inventory edits. **Done:** fewer cross-system rerenders and parity tests.

**D03 — Centralize campaign refresh and Realtime ownership — staged.** Separate positional vs metadata changes, dedupe subscriptions, protect map/user context. **Done:** no duplicated polling/listener or stale cross-map reads.

**D04 — Delete proven obsolete movement paths — staged.** Remove only after reachability, security and rollback checks; never rewrite applied migration history. **Done:** smaller active runtime with preserved functionality.

**D05 — Reproducible build and lint — staged.** Commit a lockfile, adopt npm ci, expand V2 lint and add authenticated browser smoke support. **Done:** repeatable CI builds and key code checks.

**Gate D:** Clear subsystem ownership and deterministic quality controls.

## Track E — Free-tier database performance and security

**E01 — Profile database hot paths — read-only.** Measure World V2 RPC mean/p95/frequency and EXPLAIN specific suspects, keeping RTT separate. **Done:** ranked, measured bottlenecks.

**E02 — Optimize read/write hot paths — staged.** Reduce viewer_streams churn, redundant visibility and metadata reads, intermediate token writes. **Done:** measurable fewer operations without access regression.

**E03 — Index and RLS performance assessment — read-only then narrowly staged.** Prioritize actual slow joins/policies over applying every advisor suggestion. **Done:** cost/benefit and tests for each SQL candidate.

**E04 — Privileged RPC and access audit — read-only then narrowly staged.** Individually assess SECURITY DEFINER, EXECUTE, PostgREST, RLS and Storage/Realtime grants. **Done:** demonstrated correct authorization, never wholesale revoke.

**E05 — Migration provenance and disaster recovery — staged documentation.** Resolve issue #69's historical applied migration source parity, record backups/export, forward-fix/rollback and applied-version aliases; never rerun live SQL for bookkeeping. **Done:** auditable actual migration provenance.

**Gate E:** Safe permissions, measurable free-tier efficiency and documented restore path.

## Track F — Complete gameplay and product readiness

**F01 — Full campaign smoke test.** DM establishes map/fog, players join and move, sheets/inventory/macros work, initiative/chat/handouts/previews function. **Done:** documented end-to-end pass.

**F02 — Reliability, accessibility and loading.** Examine refresh, reconnection, slow signed images, keyboard use, mobile layout and errors. Split fixes into new scoped steps if needed. **Done:** representative browsers/devices pass critical flows.

**F03 — Private beta / launch readiness.** Assess threat model, recovery/export, privacy and account portability, observability, user-facing reliability and hosting terms. **Done:** explicit go/no-go checklist.

**Gate F:** Representative live campaign runs smoothly, privately and repeatably.

## Exact execution order and exceptions

A01 → A02 → A03 → A04 → A05 → A06, then Gate A. Proceed B01–B10 and Gate B, C01–C06 and Gate C, D01–D05, E01–E05, F01–F03. Only move C01/C02 ahead to investigate a blocking blackout or interrupt for a critical authorization defect; document deviation for designer. Do not silently skip or combine steps.

## Per-step report template

STEP: A01/A02/...  
STATUS: NOT STARTED / IN PROGRESS / BLOCKED / STAGED / VERIFIED / RELEASED  
BASE: main@exact SHA  
BRANCH / PR: name and URL (or none)  
SCOPE COMPLETED: exact changes/files  
EVIDENCE: checks and outcomes, clear mock vs real-world distinction  
SECURITY / FEATURE PARITY: preserved and unverified  
SQL / DEPLOYMENT: none, staged only, or exact authorized release details  
BLOCKERS: explicit carry-forward  
NEXT: exact single next microstep  
HANDOFF: canonical repository links, no credentials

## New-chat continuation instruction

Continue Tabletop Forge engineering by reading docs/engineering-workflow.md, staging/engineering-progress.json, staging/next-release-ledger.json, AGENTS.md and docs/development-workflow.md from current GitHub. If this workflow is still unmerged, read it from the linked A03 staging PR branch. Reconfirm main/PR state. Perform **exactly the next instructed step**, stage by default, preserve other staged changes and do not apply SQL or deploy without explicit designer approval. Report a durable standard handoff.

## Baseline carried from A01 / A02 (not a future-state guarantee)

Observed 10 November 2026: main and Vercel production SHA b246b3a72537b53b2afc2a9a38cbe1db3609a8af (PR #70). Draft PR #71 head ae02168387d36c80f13204a4804b6cf765e8d6a5. A02 decision: amend before merge (no hard resync wait deadline, movement gating while observer locked, missing edge tests and unnecessary tool queries). Historical mean World V2 Postgres calls ~24.6 ms begin, ~54.6 ms advance, ~137.7 ms commit and ~49.4 ms visibility, **excluding network**, not measured end-to-end p95. Preview uses local simulated authority; live input serializes begin/advance/commit. Current status must always be checked anew.
