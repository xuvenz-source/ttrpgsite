# R18-59 — Tester-friendly multiplayer QA receipt in the existing panel

13 November 2026 · Tabletop Forge staging only · Draft PR. NO production deployment and NO simulated multiplayer GO.

## Problem solved

The World V2 board already has an opt-in **QA capture** button in `src/engine/v2/WorldTraceCapturePanel.jsx`. Its original R18-24 report is a safe, copy-only **single-scenario diagnostic** (`world-v2-local-qa-capture`), not an R18-58 DM/P1/passive-P2 acceptance receipt. R18-58 initially required a technically skilled operator to build a different JSON document by hand, risking missing trace `enabled`, wrong role names and accidental inclusion of sensitive game information.

R18-59 preserves the original panel's `Quick scenario report` mode **unchanged by default**, and adds an explicitly chosen `R18-58 multiplayer acceptance` mode in the SAME opt-in panel. It adds no new server requests, credentials, stored IDs, network monitoring, Realtime subscriptions, animations or token-handling effects. Normal users never see the panel unless the board is using V2 and the URL includes `?worldV2Trace=1`.

## How real independent testers use it — no DevTools

1. After an **explicitly authorized** integrated test deployment exists, the operator/DM verifies the **exact deployed build commit SHA** from the deployment source, creates a short shared test run code such as `R59-TEST-001`, then sends the same run code and source SHA to P1 and passive P2 by a trusted channel. **Do not use the PR head SHA unless that commit was actually deployed.**
2. DM, P1, P2 sign in with **three distinct accounts in their own browsers**, load the same test map, and add `?worldV2Trace=1` to the loaded campaign URL. Sign-in redirects may remove the query; if so, add it again once the campaign loads. The existing fixed-bottom-right `QA capture` button will appear when the V2 board is active.
3. Each tester selects `R18-58 multiplayer acceptance`; P1 selects Player 1 and P2 selects Player 2 (passive observer). DM should NOT enter DM player preview. The panel clearly identifies previews as **local** and the offline checker never counts them as independent player evidence.
4. Each tester enters the shared run code. The build SHA may already be filled in at build time if the Vercel project **exposes** `VERCEL_GIT_COMMIT_SHA`; if absent, the panel intentionally leaves the SHA blank and asks the tester to paste the exact deployed SHA from the DM. This public Git hash contains no credentials. Vite only defines `import.meta.env.VITE_WORLD_V2_QA_BUILD_SHA` from an allowlisted 40-character SHA; no general environment variables are exposed.
5. Click `Start / reset`; this clears only local bounded diagnostic counters and creates a fresh random **capture tag** (24 lowercase hex digits from browser cryptographic randomness; neither an account ID nor a login proof). No web storage is used. The tester confirms whether their own sign-in/browser are independent; these are declarations and must be externally verified by the reviewer.
6. Perform the real two-to-five-minute multiplayer sequence (fast arrow+drag, repeated corners, true wall blocking and immediate re-grab, note-pin proximity, fog/LOS, DM revocation during movement, P1/P2 reconnect, P2 passive observation, zero map flashing and canonical convergence). Mark each named check **Pass**, **Fail** or **Not run**; every check defaults to **Not run**. Failure and missing evidence must not be silently converted to Pass.
7. Click **Copy acceptance receipt**. This creates the exact R18-58 accepted shape, including `{enabled:true, limit, events, counts, durations}` from the already allowlisted trace output, fixed canonical `dm`/`p1`/`p2` role, run code, source SHA, time and self-selected checklist. If the clipboard is unavailable, the existing read-only manual copy field appears. No request is sent to the server.
8. Share each sanitized receipt only in the authorized project test channel or private file collection. Do **not** include passwords, emails, user IDs, JWTs, private wall coordinates, signed sight payloads or full browser network logs. The operator runs the R18-58 offline validator on the three receipts. Even if all appear complete, the output stays `NO_GO` until independently authenticated accounts, real CLI history and deployment approval are separately attested.

## Scope and security invariants

- The browser-only receipt builder lives at `src/engine/v2/WorldV2QaReceipt.js` and calls the previous R18-24 `createWorldV2DiagnosticReport` allowlist before placing its bounded results in the R18-58 shape. Raw snapshots, unknown event names, extra IDs, coordinates and signed payloads cannot be serialized by this builder.
- The R18-58 Node validator now **imports the same immutable checklist** shared by the panel rather than carrying a duplicate set of keys; labels remain controlled static strings. An attacker can type fake Pass values or edit JSON, so it remains explicitly self-reported, **not proof of identity or server-side revocation**.
- The random capture tag only reduces accidental duplicate-browser evidence. It cannot establish user uniqueness. The build SHA can be typed by a tester and must be checked against Vercel by the operator. The opt-in panel does not query Vercel or Supabase.
- Normal quick capture, pointer interception, keyboard input isolation, clipboard fallback and trace opt-in must remain functional. The panel must not change world motion, fog masking or server authority, and normal gameplay must continue with the panel hidden.
- No production SQL or migration files, staging approved 83+8 source, R18-57 SQL candidate, R18-43 flags, Vercel deployments or Supabase grants are modified.

## Release gate and validation

R18-59 is an engineering convenience for **future, genuine** multiplayer testing, not a movement performance or fog authorization fix. The existing 83 applied migrations, production R18-35 site, eight pending narrow release SQL files and separately staged R18-57 opt-in fast path remain unchanged. A sole DM test (including preview) is useful for diagnosis but cannot sign off real P1/P2 sight revocation.

Complete CI must validate actual panel-to-R18-58 receipt compatibility, privacy injection refusals, no automatic Pass, no network or storage calls, public SHA only, existing R18-24 quick capture, JSX compile, Chrome movement tests, source-real PostgreSQL authority and CodeQL. All three independent signed sessions, official authenticated isolated CLI v2.81.3 83+8 dry-run, free-tier RAM/lock/RTT under load and operator release approval are still **NOT DONE**.

Technical note: Vercel documents `VERCEL_GIT_COMMIT_SHA` as an optional exposed system environment variable. Whether it is exposed on this project's deploy is not asserted. If unavailable, explicit user entry is required and independently verified; the UI cannot legitimately fill it from a PR head.