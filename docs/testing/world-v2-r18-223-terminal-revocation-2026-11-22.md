# R223 — Terminal per-bridge cache revocation and fresh-session reentry gate (staging-only)

22 November 2026. Child of R222 [draft PR #334](https://github.com/xuvenz-source/ttrpgsite/pull/334) at exact base commit `799dd7158e19d8c3c12b23eef33124cd7611ff36`. R222 focused `44989523542` and full staged repository `44989523550` GitHub Actions both passed. R221's source candidate and R123 membership sentinel/teardown are likewise **staging-only**. No application `src/` code is changed and the R81 frozen preview source SHA remains intact.

## Concrete finding

The R123 access sentinel intentionally permits `begin()` after a confirmed revoke, to support future re-entry with new proof. The R221 signed-asset cache lock intentionally has **no unlock API**, and R222 can be begun again after a confirmed revoke. Therefore an old R222 bridge can potentially issue `onAllow` after membership is reinstated while that same bridge's signed-asset cache remains permanently locked. This mismatch is a **staging integration flaw**, not a confirmed live exploit. A new signed session must never use a previously revoked instance to unmask a campaign or request artwork.

## R223 source-only remedy

`staging/world-v2-b10-r18-223-terminal-revocation-bridge/TerminalRevocationBridge.js` composes, without editing, the existing R222 bridge and denies all attempts to `begin()` after `revocationStarted` or an already locked asset store. It refuses construction with a pre-sealed store and requires a **fresh unlocked store and fresh bridge instance** plus a new R123 actor-identity/membership proof after legitimate reinstatement. It intercepts `onAllow` so a cache sealed before or during the callback cannot yield an authorized view state. It also rejects asynchronous `onAllow` callbacks because a Promise is not a synchronous authorization/view-enable boundary. Locked/terminal snapshots always report `allowed:false`, and urgent notifications cannot reopen a terminal instance. Error codes are fixed, without exception details, auth IDs, SQL or signed URLs.

This is a *local UI and signing-cache lifecycle* contract only. A hostile already-issued bearer URL, pending network request already accepted by Supabase Storage, compromised server role, permissive RLS or malicious second browser tab cannot be revoked by client-side state. The live `src/` app does not import R123, R221, R222 or R223. An external lock while the host is not calling the bridge cannot synchronously mask arbitrary unrelated UI surfaces; the eventual live owner must wire a complete synchronous mask/teardown and other-window coordination, with server-side authorization as the real enforcement boundary.

`tests/world-v2-r18-223-terminal-revocation-bridge.test.mjs` uses only fake Supabase clients, synthetic account/campaign IDs, and fake signed URLs. Tests cover confirmed removal followed by membership reinstatement in the SAME bridge (must be denied), a legitimately new bridge and fresh unlocked store (can pass only fresh RLS proof), reentrant store sealing during `onAllow`, asynchronous `onAllow`, mismatched actor membership, missing/throwing/prelocked stores, and healthy membership hint rechecks. The dedicated workflow reruns R123, R221, and R222 focused tests with no real database/network access.

**Exact changed-file scope:** one `staging/` JS module, one synthetic `tests/` file, this document, and one new `.github/workflows/` file; zero `src/`, active migrations/Edge, package/dependency, Vercel, deployment or paid-resource changes. No merge/deploy, no SQL execution and no original/QA database writes.

## QA and security boundary

All 83 private original migrations still require semantic security review, the 67 authenticated-callable privileged function graphs remain unapproved, and effective PostgreSQL/Storage RLS and existing signed URL revocation are NOT verified. The original security issues #212/#220/#223/#229/#231/#306 remain NO_GO. R220's bounded owner-sanitized report found seven archived lexical Storage policy-key pairs and four with nested OR; **no actual hosted policy results** were obtained.

Next stage should test simulated **independent actor/tab contexts**, including a revoked P1, still-authorized P2, DM, outsider and stale window; **no traffic to Supabase and no real auth/session tokens**. A real isolated QA session or migration installation requires a separate explicitly reviewed approval; the QA schema is still blank and original/production SQL is not authorized. Owner manual action is **not required** for R223.
