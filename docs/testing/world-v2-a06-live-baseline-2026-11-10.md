# A06 — World Engine V2 live baseline: verified read-only evidence and execution blocker

**Audit date:** 10 November 2026 (snapshot 11:22:13 UTC / 22:22:13 Melbourne)  
**Step status:** **BLOCKED / PARTIALLY EVIDENCED**, NOT VERIFIED, NOT RELEASED  
**Scope:** Read-only GitHub, Vercel and Supabase inspection; historical designer-reported UX. No live movement was initiated, no accounts signed in, no users' tokens moved, no test campaign altered, no SQL mutation, no PR merged and no deployment.

This is the required A06 evidence record. The full A06 authenticated browser matrix could **not** be run in this development session. Future chats must not treat this file as successful multiplayer QA or declare Gate A passed.

## 1. Source of truth and conditions

| Item | Observed state |
|---|---|
| GitHub \`main\` | \`b246b3a72537b53b2afc2a9a38cbe1db3609a8af\` (PR #70) |
| Vercel production | Deployment \`dpl_FNwPjVY7o1781dc8Uo6Eizgf8rb4\`, READY, exactly same SHA |
| Supabase | Existing Free project \`lwhwgqaunxbmvyndswze\`, ACTIVE_HEALTHY, Tokyo / Postgres 17 |
| Diagnostic deployment | A05 opt-in tracing in draft PR #74 **not deployed** |
| PR #71 | Draft and independently blocked by A02 security-review requirements |
| PR #72 → #73 → #74 | Stacked drafts; no merge or production release |
| Real authenticated tester access | No DM / P1 / P2 browser sessions accessible from this tool context |
| Live map fixture | Incomplete for protected fog/collision tests; needs designer-approved setup |

A05's test result (772 automated tests, zero failures at the final A05 head) confirms *only* isolated tests, including a simulated-authority React browser harness. It does **not** provide actual account-level input/observer RTT, fog redraw or map-flash measurements.

### Previously reported UX (not independently reproduced during A06)

The designer's most recent live-test report before this workflow described:
- Normal DM mode: dragging and arrow movement working but very laggy, and map flashes/reloads when tokens move.
- DM player-preview: movement responsive and smooth.
- Player mode: movement laggy and map flashes/reloads when local or other tokens move.

These observations motivate the analysis. No fresh recorded repro count, timestamped video or authenticated browser trace was collected in A06.

## 2. Supabase historical query statistics

**Evidence source:** read-only \`pg_stat_statements\` grouped by recognized World V2 function names. Statement-statistics reset was **5 Nov 2026, 09:51:43 UTC**, so these are cumulative history over multiple code revisions and interactions, **not a 10 Nov user-test time window**. Numeric estimates are from PostgreSQL's server-side SQL execution metrics: they exclude wire RTT, auth handshake, browser scheduling, React re-rendering, decoding and compositing. Mean values are per recorded matching statement call; the slowest call is not p95.

| Statement group | Calls | Mean DB execution | Max recorded DB execution | Cumulative DB time |
|---|---:|---:|---:|---:|
| \`begin_world_motion_v2\` | 250 | 24.30 ms | 743.61 ms | 6,074.4 ms |
| \`advance_world_motion_v2\` | 426 | 53.20 ms | 1,534.19 ms | 22,661.4 ms |
| \`commit_world_motion_v2\` | 209 | 135.74 ms | 2,765.80 ms | 28,370.5 ms |
| \`cancel_world_motion_v2\` | 17 | 24.02 ms | 235.48 ms | 408.3 ms |
| \`get_world_visibility_v2\` | 622 | 49.16 ms | 1,844.02 ms | 30,578.7 ms |
| \`get_world_scene_v2\` | 89 | 30.32 ms | 525.77 ms | 2,698.0 ms |
| \`get_authorized_map_fog_v2\` | 99 | 130.66 ms | 2,422.86 ms | 12,934.9 ms |

A typical **serial begin, single advance and commit** would have an *illustrative sum of the separate historical per-call means* of approximately **213.2 ms before networking**, not a measured gesture latency. It cannot substitute for a per-gesture trace. More advances, subsequent visibility refresh or observer delivery can increase total waiting. Some of these statement groups also include historical schema/API versions.

**Interpretation:** commit cost (mean 135.74 ms, max 2.77 s) and serialized round trips are strong suspects for sluggish live movement. The server stats alone **do not establish** that the commit triggers a renderer blank, nor identify actual 2026-11-10 p95.

## 3. DB resource and activity counters

| Read-only counter | Observed | Interpretation |
|---|---:|---|
| Database footprint | 22 MB | Small dataset; does not prove low memory usage |
| Active/idle connections at snapshot | 1 active / 5 idle | Snapshot only, not a stress test |
| \`forge_world_v2.viewer_streams\` estimated rows | 9 | Private schema, not \`public\` |
| \`forge_world_v2.viewer_streams\` cumulative updates | 3,063 | Candidate for later E01/E02 write-path analysis, not evidence of causation |
| \`public.map_tokens\` estimated rows | 7 | Current estimate, not exact row count |
| \`public.map_tokens\` cumulative updates | 1,758 | Historical across testing, not a per-gesture rate |
| \`public.campaign_members\` index scans | 931,861 | Small table and accumulated calls, not proof of missing index or bad query plan |
| PostgreSQL recorded deadlocks | 0 | Historical counter, not a complete health clearance |

Database-wide counters and statement statistics have different reset histories. Do not compare them as if they came from an identical measurement window. No sampled memory percentage, client CPU/GPU usage, browser RAF p95 or Realtime observer delivery RTT was accessible in this read-only audit.

Supabase's last-24-hour unified logs reported 82 \`realtime_logs\` entries categorized as \`info\`; this is **not** a measure of event packet delivery latency, retained-sight safety, or absence of application-level errors. We did not inspect raw log payloads, which could contain confidential campaign data.

## 4. Authenticated A04 fixture readiness

The latest read-only audit found:
- \`TestCampaign\`: 1 DM and 8 non-DM memberships, 2 maps, 6 tokens, 5 distinct token owners. Sufficient *potential* identities for DM/P1/P2, but three distinct authenticated sessions have not been exercised.
- Active \`GumfordGarden\`: published environment revision 41; automatic fog **false**, collision **false**, 3 published environment objects; **no door**, **no one-way-vision wall**, **no 2×2 token**.
- \`TestCampaign2\`: 1 DM and **no other members**; not suitable as a full 3-account fixture.
- No map/token/configuration writes were executed.

Therefore the full 24-case A04 test matrix is **NOT RUN**. Specifically, player sight concealment, published collision, door authority, 2×2 footprints, carried torch, forced reconnect and permission revocation are not demonstrated.

## 5. Missing evidence and minimum A06 acceptance

The following are explicitly **NOT MEASURED**, not zeros:
- Input pointerdown → first visible sprite position change p50/p95 in normal DM, DM preview, P1 and P2.
- Authorized remote path receipt → viewer sprite position change p50/p95 and, separately, **server-send to observer-receive** time.
- \`begin\`, \`advance\`, \`commit\`, visibility RPC client-side RTT p50/p95 per role; accepted vs denied/cancelled gesture counts.
- Renderer RAF work and spacing p50/p95; >50 ms frame-gap count; fog full vs partial paints; renderer seals, opacities, sprite remounts and terrain source reassignments.
- Map blackout **visual** count and reproduction video, correlated by role and motion cause; security regression checks under actual published fog/collision.
- 20 identical open-corridor trials per role plus 10 simultaneous P1/P2 trials, including 100 ms and 200 ms RTT emulation where meaningful; no live campaign stress test was conducted.

To unblock A06:
1. **Designer approval for an appropriately scoped live release** of A03/A04/A05 instrumentation and combined security checks on the exact integrated revision. This is an upcoming approval requirement, not a grant made by "Proceed with A06". No SQL/Edge operation is needed by A05 itself; PR #71 must remain separately reviewed and blocked unless its security amendments have been completed.
2. **Controlled test campaign setup** via DM UI, with authorization and state backup, enabling published fog/collision, door, directional vision, 2×2 footprint and torch as supported. Do not alter the user's live campaign without agreement; choose an expendable copy when feasible.
3. **DM + two separate player browser sessions** with correct permissions. Use the A04 manifest, sanitized A05 trace \`?worldV2Trace=1\`, reference browser/device and the actual deployed SHA. Only that browser exercise can supply live p50/p95/flash counts.
4. Capture role-separated evidence with clearly labeled **PASS / FAIL / BLOCKED / NOT RUN** for all 24 cases, restore test campaign state, and verify no hidden information leaks.
5. Update this same A06 evidence record and \`staging/engineering-progress.json\` with measured results; only then mark A06 VERIFIED and consider Gate A.

## 6. Engineering implications and constraints

- **Supported next investigation:** Compare the sequential-authority pipeline against a coalesced safe-path RPC design at B01/B02; commits, RPC RTT and visibility refresh deserve measurement. No protocol decision is authorized before live baseline / explicit gate override.
- **Renderer flash still unclassified:** A05 has counters that can distinguish ordinary fog redraw, renderer revocation/seal, terrain reassignment, sprite churn and real React remount. They are **not deployed**, so a causal explanation for flashing is unverified.
- **Security first:** PR #71 still needs a hard sight-retention deadline on a hanging RPC, input gating while private observer stream is locked, actual-renderer recovery tests and selective metadata reconciliation.
- **Free-tier:** avoid creating paid staging databases or introducing per-gesture expensive polling. Current database execution figures favor protocol design/traffic reduction investigation, not automatic index creation or wholesale security changes.

**Status summary: A06 PARTIALLY EVIDENCED, BLOCKED for real authenticated browser QA. Gate A NOT PASSED. Remain on A06 as the next step; do not silently advance to B01 or deploy.**
