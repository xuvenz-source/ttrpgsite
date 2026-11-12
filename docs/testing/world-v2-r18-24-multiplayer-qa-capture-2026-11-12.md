# B10-R18-24 — Opt-in browser QA capture for independent DM/P1/P2 verification

**12 November 2026, Australia/Melbourne. STAGING ONLY, production SQL/FRONTEND NO-GO.**

## Goal and exact source

Parent: B10-R18-23 staged draft PR #126 at `425f1da12a1f936a87bd04f4f7ef273f1346e220`.
This increment reduces nontechnical tester friction and protects the release security boundary. Earlier manual DevTools snippets were damaged when shared via Discord formatting; copy-only in-app controls avoid that problem.

R18-24 does **not** establish signed account independence, run a linked Supabase CLI, install R05, change observer ACLs, change collision rules, enable observer guarded mode, or deploy a test frontend. Git main and released R18-15 Vercel remain unchanged.

## What changes (staged source only)

- The existing `WorldTrace.js` event, detail, and latency-key allowlists are reused rather than inventing another telemetry source.
- `WorldTraceDiagnosticReport.js` transforms a bounded trace snapshot to an *allowlist-only* JSON report. Arbitrary keys are dropped, unexpected event names/details rejected, lengths/latencies/counts bounded. No account, map, token, NPC identifiers, coordinates, JWTs, signed visibility payloads, URL or absolute timestamp is exported. The report is explicitly `NO_GO` with `authenticatedAccountsVerified: false` and `recipientRealtimeIsolationVerified: false`.
- `WorldTraceCapturePanel.jsx` is mounted **only** on the World V2 board and hidden unless `?worldV2Trace=1` has been explicitly set. It opens as a small `QA capture` button. The tester chooses a scenario (A01–A12 or an extra movement/fog/performance phase); a real player chooses Player 1 or passive Player 2 as a *self-reported* label, and the DM is labeled directly. Press **Start / reset** before the scenario, then **Copy safe report** afterward. If clipboard permission is denied, a selectable read-only text box appears.
- The UI cannot read the current account ID, launch a privileged request, join a Realtime topic, save browser data, alter campaign state, or silently upload diagnostics. It only copies the local trace when clicked.
- This report is diagnostic evidence, not server-signed proof of actual independently authenticated identities or fog authorization. Only manual and server-backed live test acceptance clears the security gate.

## Safe operator testing procedure (on a separately approved test frontend)

1. Confirm an approved build actually contains R18-24, the live site still uses the authorized **test campaign**, and the existing production SQL remains in its reviewed state. If not, stop: this staging-only UI is not yet available to users.
2. The DM opens the test campaign link with `?worldV2Trace=1`. In the same campaign, Player 1 and passive Player 2 use **their own real logins**, each in their own browser session/profile; append `?worldV2Trace=1` to each URL. Never send passwords, full client state, browser network headers or JWTs.
3. Each person opens **QA capture** in their browser. Players select their self-reported role; all select the *same* scenario code. Press **Start / reset** before movement, role changes or idle observation. This is a LOCAL reset, not a map reset.
4. Perform the scenario from `docs/testing/world-v2-r18-23-live-history-auth-gates-2026-11-12.md` (A01–A12). Player 2 remains passive for observer-delivery tests. For a revocation scenario, the DM changes membership using the regular app controls; do not run SQL impersonation or bypass membership policy.
5. Each tester presses **Copy safe report**, pastes the report into the testing discussion, and describes visible symptoms separately: map flash, token endpoint mismatch, fog/hidden NPC leakage, wall bounce, stalling or missed observer movement. The report itself contains neither user identity nor hidden geometry and **cannot certify a pass on its own**.
6. If actual hidden data becomes visible to the wrong player, immediately halt that scenario and preserve privacy; do not post sensitive content in diagnostics. Use normal release incident procedures. Keep 700 ms guarded observer recovery OFF.

No browser console commands are required. The UI only appears on a future separately approved build; no production release or hidden query parameter is activated by this PR alone.

## Tests and security boundaries

`tests/world-v2-r18-24-multiplayer-diagnostic-capture.test.mjs` covers:

- Real `WorldTrace` sample → whitelisted report with fixed schema and NO-GO fields.
- Ignoring unknown raw IDs, coordinates, JWT-like keys, signed NPC payloads, and malicious extra properties.
- Rejecting unexpected event labels/details/count names, negative/oversized timings, and corrupt capture length.
- Rejecting unknown role/scenario values and preserving the explicit local-only DM preview indicator.
- Ensuring frontend controls are opt-in, clipboard-triggered, have a manual text fallback, and never call Supabase RPC, subscribe Realtime, store browser state, poll or upload.

The new UI adds no mutation or traffic, so free-tier Supabase load remains unchanged until testers exercise existing movement.

## Remaining hard gates

1. **Pinned authenticated Supabase CLI v2.81.3** linked 83-body history fetch + exact R05-only dry run in an isolated external workspace (R18-12 runner remains operator-only). Supabase CLI v3 changed default target semantics in November 2026; do not silently substitute it.
2. **Real independent Auth/Realtime/LOS acceptance** across DM/P1/passive P2 A01–A12; do not claim a signed proof from this manually labeled trace. Auth membership should be verified through normal application login, correct private recipient delivery, map access, vision changes and revocation behavior.
3. **Separately approved frontend compatibility canary** and then distinct SQL installation approval; R05 is frozen and unapplied. Verify after R05 and version the later wall/cross-map/campaign-affinity SQL candidates separately.
4. Extended three-viewer movement lag/RAM p95 acceptance and the full R18-06 24-case regression matrix remain pending. Keep guarded 700ms recovery OFF.

**Release decision: STAGING ONLY / SQL + FRONTEND NO-GO.** R18-24 improves diagnosability, not proof that private multiplayer security or movement performance has passed.
