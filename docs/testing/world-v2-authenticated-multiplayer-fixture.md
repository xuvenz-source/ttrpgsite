# A04 — World V2 authenticated multiplayer acceptance fixture

**Status:** SPECIFIED / NOT EXECUTED  
**Date:** 10 November 2026  
**Workflow step:** A04 only, see [engineering-workflow.md](../engineering-workflow.md)  
**Machine-readable scenario list:** [world-v2-multiplayer-manifest.json](../../tests/fixtures/world-v2-multiplayer-manifest.json)  
**Production release requirement:** Designer must approve a release separately. This document authorizes **no** changes to campaign data, permissions, production, SQL or deployments.

## Purpose

Provide repeatable, manually executed and independently observable tests that distinguish the fast local DM preview from the actual DM/player multiplayer path. These tests are **not** simulated Node/Chromium unit tests: they require authenticated accounts and a real private Supabase observer channel. This fixture is a **design contract** and does **not** assert that any tests have passed, that a map is already configured or that PR #71 has been approved.

## Starting inventory — read-only Supabase inspection, 10 November 2026

| Candidate | Current shape | Assessment |
|---|---|---|
| \`TestCampaign\` | 1 DM + 8 other campaign members, 2 maps; active \`GumfordGarden\` map has 6 tokens including 5 owned by distinct users and 1 NPC; 1 published environment | **Preferred**; choose two cooperating player accounts that already own tokens |
| \`TestCampaign2\` | 1 DM + 0 other members, 1 map, 1 token | Not yet a viable 3-account fixture |

The active \`TestCampaign\` map currently has one wall and two static lights, but the published environment has **fog automatic=false** and **collision enabled=false**, and no door, one-way vision wall or 2×2 token. Its other map has no placed tokens or published environment. The current two issued campaign tools are **not placed** on a map. None of these gaps may be silently treated as covered.

The \`GumfordGarden\` maps in different campaigns are distinct; always confirm the campaign **and** map, not just the map name. Do not commit player UUIDs, invite codes, user emails, signed asset links, JWTs or hidden NPC details to the repository.

## Participants and sessions

Three simultaneously active **distinct authenticated accounts**, each in an isolated browser profile (or different browser with separate cookies):

| Role | Alias | Required access |
|---|---|---|
| Dungeon Master | DM | Actual campaign DM; **normal DM tabletop**, not preview |
| Player 1 | P1 | Real campaign member, owns token A, no DM privileges |
| Player 2 | P2 | Different campaign member, owns token B, no DM privileges |

Player DM-preview is a **fourth test mode of the DM browser**, not an independent third player. Before entering it, choose a token that belongs to an actual campaign player. Preview must never change saved production token positions.

Use an incognito/different browser profile for each role, not multiple tabs sharing the same login. Keep all three profiles visible during synchronized movement tests; explicitly test background tab behavior only in scenarios that require it.

## Fixture setup checklist — **not performed by A04**

When the designer later authorizes an actual test window, prepare **only** the chosen test campaign. Capture a pre-test map environment export/snapshot and initial token positions via supported DM UI or an explicitly authorized export. Do not run arbitrary SQL writes or mutate another campaign. Prefer an expendable duplicate map if the existing live test map needs preservation. If a feature cannot be configured safely using existing UI, mark it **BLOCKED**, never bypass through database privileges.

- [ ] Confirm DM, P1 and P2 are distinct authenticated campaign members; each player controls one different 1×1 token in the selected test map.
- [ ] Create a clearly bounded open movement area with stable terrain image and a visible map grid.
- [ ] Publish a map environment with server-authoritative fog, collision and a solid wall (and note the publication revision); avoid testing stale *prepared* editor geometry as if it were live.
- [ ] Add a closed/openable **door** crossing one passage; record two safe endpoints outside the door.
- [ ] Add a directional **one-way vision** wall. The current \`wallPreset('one-way')\` is **not** one-way movement: collision remains solid from both sides; test vision from each side separately.
- [ ] Arrange a DM-controlled 2×2 footprint token with enough clear space and a narrow 1-cell passage it cannot traverse.
- [ ] Put an NPC behind opaque geometry. Record its location/identity **privately for the DM**; do not expose it to player devices or logs.
- [ ] Keep one static light and configure a portable torch/held-light tool, if supported by the current tool UI. Distinguish those cases.
- [ ] Prepare a second map to switch to and back from, with a known authorized token or an explicit expectation that players see no tokens.
- [ ] Identify safe pre-test/post-test cleanup actions; agree on player consent and a short test window before changing map permissions.
- [ ] Use the exact frontend SHA and note whether PR #71 / its future amendments are deployed. Do not compare results from differing builds as if they were one run.

## Reproducible execution

1. Record date/time (with timezone), commit SHA reported as deployed, browser/OS/device, map environment revision, participant aliases and flags for fog/collision/light.
2. Capture a screenshot and network/trace baseline **on the DM device only**, without revealing hidden details in player-side artifacts.
3. Open all three distinct user sessions; verify both player accounts receive the correct RLS-authorized map/roster and private observer transport.
4. Run **AUTH → INPUT → COLLISION → FOG/LIGHT → RECOVERY → METADATA → PERFORMANCE** scenarios in manifest order, resetting tokens to known authorized starting positions **between** scenarios. Do not switch from DM normal to preview mid-movement.
5. For timing: execute 20 identical short traversals per role and 10 simultaneous P1/P2 traversals, in an open safe corridor, first with normal networking, then optionally browser-emulated ~100 ms and ~200 ms RTT; note that throttling is an approximation and may affect other requests. Record sample count and p50/p95 rather than declaring subjective impressions as a measured improvement.
6. Where a blocked test depends on missing UI setup or an account capability, record \`BLOCKED\` with the exact missing precondition. **Never create access with direct SQL or force a private observer message from the client** to make a test pass.
7. Capture per-case PASS / FAIL / BLOCKED / NOT RUN, minimal reproduction, whether the failure affects DM/P1/P2, current generation/revision, and optional sanitized \`?worldV2Trace=1\` event counts/timing. Do not upload private Realtime payloads, authorization headers, hidden NPC lists or user identifiers to public CI/artifacts.
8. Restore the test campaign/map/token state using the agreed method, have each player confirm their permissions and map, and note any items unable to restore.

## Acceptance matrix

The canonical IDs, roles, preconditions, actions and expected outcomes appear in the JSON manifest. This table is the human-readable run order.

| ID | Case | Pass condition |
|---|---|---|
| AUTH-01 | DM and two players enter map | All see the same current map; each player sees only server-authorized entities, with no false first-load movement block |
| AUTH-02 | Foreign token and hidden-NPC access | Players cannot move another player's/DM's token or learn NPC identity outside sight through DOM, accessible artwork or permitted APIs |
| INPUT-01 | First normal DM drag | Token picks up immediately without visiting preview; no map reload or extra pointer release |
| INPUT-02 | First player drag P1/P2 | Both can drag their own tokens immediately and receive authoritative commit |
| INPUT-03 | Rapid arrow press/hold | Repeated keys continue motion through the safe corridor without per-cell freezes or dropped input |
| INPUT-04 | Simultaneous two-player drag | All three views receive ongoing validated remote movement during gestures; stable existing sprite mounts |
| INPUT-05 | DM player-preview parity | Preview moves immediately with player-effective sight, without live writes or another player's observer credentials |
| COLL-01 | Solid barrier, pointer and keyboard | No painted or persisted passage through wall; fast jumps and diagonals do not bypass |
| COLL-02 | Door transition | Closed door blocks; DM-published open door permits the now-authorized path and updates both players |
| COLL-03 | 2×2 footprint and narrow gap | Cannot clip corners or fit through a one-cell passage; valid open route remains smooth |
| COLL-04 | Group movement | Group moves atomically within permission/collision constraints; rejected member cannot be left behind or teleported |
| FOG-01 | Move while fog is enabled | No entire-map blackout/reload; previously explored tiles retain correct dim state; fresh sight is server-authorized |
| FOG-02 | Enter/leave hidden NPC sight | Unknown NPC is not disclosed by private movement before authorized roster; hide and reveal work promptly |
| FOG-03 | One-way vision | Directional sight obeys wall's arrow; movement still blocked both ways if barrier blocks movement |
| FOG-04 | Static and carried light | Light changes reveal only server-authorized cells; player and DM views agree after approved movement |
| FOG-05 | Environment publication | Real revision/permission changes invalidate stale sight; ordinary token movement alone does not re-fetch terrain |
| REC-01 | Disconnect/reconnect | Private observer locks; no stale unauthorized content, and coherent reauthorization restores safe movement |
| REC-02 | Map switch and return | Both players route to the correct active map; old sprites/fog never bleed into new map |
| REC-03 | Role/ownership revocation | Previously controlled or visible content conceals promptly; no input bypass; execute only with a preapproved safe test account |
| REC-04 | Interrupted motion | Offline mid-drag cannot commit forged or stale motion; reconnect yields server-authorized final position |
| META-01 | Sheet/status update during motion | Metadata changes remain reflected in sheets and tokens without resetting map/sprites |
| TOOL-01 | Placed tool and held torch | Tool movement/visibility obey actor controls and updates carried light; no extra asset churn |
| PERF-01 | Reference timing across roles | Count first response, RAF frame time, begin/advance/commit RTT, observer lag, fog redraw and terrain/sprite changes separately |
| PERF-02 | Long burst + multiple clients | 20 repeated moves per role and 10 overlapping P1/P2 moves: report p50/p95, full blackout count, RPC counts, Realtime gaps and Supabase resource snapshots |

**Absolute failures (no tolerance):** hidden identities disclosed; unauthorized motion persisted; solid-wall bypass; stale permissions accepted; wrong map/player sight; normal token movement triggers a full-map blackout or terrain reassignment. Performance gates are **proposed targets** from the workflow and should be calibrated in A06; A04 makes no latency claims.

## Evidence and defect record

Copy this record for every scenario; do not populate with imaginary measurements.

\`\`\`text
Run ID / date / timezone:
Build / Git SHA / V2 flags:
Campaign alias / Map alias / published scene revision:
Browsers / devices / DM-P1-P2 distinct sessions:
Case ID:
Status: PASS | FAIL | BLOCKED | NOT RUN
Setup verified:
Steps actually executed:
Expected vs actual:
Input-to-first-paint / begin RPC / advance RPC / commit RPC / observer lag:
Frames >50 ms / terrain-source assignments / sprite remounts / fog full redraw count:
Sanitized trace excerpt (no private IDs or coordinates):
Failure severity / issue or PR:
Restoration status:
\`\`\`

A screenshot of a player-view flash, if included, must not expose other users' personal information, credentials or intentionally hidden DM content. For security cases, compare independent DM/player observations and explicit server-denial results, not trust in DOM hiding alone.

## Release and future steps

- A04 completes when this design and manifest are staged and structurally verified. It does **not** configure live data, execute test runs or pass Gate A.
- A05 will work on bounded instrumentation only; A06 will **execute and measure** the authenticated fixture after any required release/testing permission. Actual live testing must not be claimed based on the existing mocked React/CDP harness.
- A02 PR #71 remains **AMEND BEFORE MERGE**; run this matrix against any amended release when authorized. This fixture is not authorization to merge PR #71, stage its code amendments or modify production.
- A04 is stacked on draft A03 PR #72 so the permanent progress record is inherited, not rewritten independently from an obsolete \`main\` version. No PR in this chain is production-ready solely by being staged.
