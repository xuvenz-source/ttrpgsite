# R221 — Revocation-lock hardening for signed asset URLs (source-only, NO_GO)

22 November 2026. Child of R220 draft PR #332, exact parent `a7b299cd5d313a5684f804af116161f5312c78c3` with focused synthetic security and full staged repository CI both successful. R221 changes an isolated **draft-only staged candidate** plus tests/documentation/CI; the live signed asset module remains byte-for-byte unchanged. No merges, live app deployment, Supabase SQL or original/isolated QA database writes.

## Evidence and risk

Owner uploaded **only** `r220-sanitized-report.json`, 3,335 bytes, SHA-256 `0a88d58f78761f07635d1e9969e20c1fa6c3be640214a1576fa05663a33d2cfd` of the **sanitized JSON only**. R220 returned NO_GO with 83 historical private migration hashes, 937 lexical top-level statements, 12 historical Storage policies, eight archived final policy keys and seven possible overlapping policy-key pairs. Four pairs involve nested OR in guard expressions; **none** involve top-level guard OR by the bounded lexical checks, and no top-level OR branch was marked as lacking a bucket/auth-helper word. The original SQL, migration names/versions, private R111 docket, signed URLs, Auth/campaign data and credentials remain strictly private. Nested OR markers do not clear RLS or signed URL revocation.

Repository issue [#231](https://github.com/xuvenz-source/ttrpgsite/issues/231) confirms the actual `src/SignedAssetUrls.js` `clear()` method, with active listeners, immediately calls the signer again. This can reissue 3,600-second signed bearer URLs during incorrectly ordered campaign revocation teardown. R123's independent draft teardown contract requires unmount-before-clear, but its staged contract is not integrated into the live app. Existing signed bearer URLs do not become invalid merely because React hides an image or clears local memory.

## R221 narrow change

`staging/world-v2-b10-r18-221-signed-asset-revocation-lock/SignedAssetUrlsRevocationCandidate.js` (not imported by the app) now exposes `lockForRevocation()` and `isRevocationLocked()`:
- Synchronously and permanently locks **that cache instance**, increments its request epoch, cancels the refresh timer, clears cached URL state and listeners, and notifies subscribers with empty URLs. Failing or rejecting listener callbacks cannot interrupt the lock.
- `subscribe()`, `get()`, `peek()`, `load()` and refresh scheduling remain inert while the lock is active. `clear()` cannot reset/unlock the revocation lock or request any new URLs.
- A preexisting in-flight signer call cannot necessarily be cancelled at the service, but **its result is fenced by the epoch** and cannot repopulate the cache, notify a revoked subscriber or be retrieved afterwards.
- Calling the lock again is idempotent. Reentry after independently verified account/campaign authorization requires **a fresh store instance**, normally a full app reload; the old singleton cannot be unlocked from an untrusted event.
- The legacy `clear()` behavior remains unchanged for regular, non-revocation same-tab auth transitions; this is critical for existing visual behavior.

This is **staged only**. The live campaign revocation path is NOT wired to `lockForRevocation()` in R221, and its existence cannot be treated as a working user-removal fix. A follow-on release-pinned integration with the R123 synchronous mask, verified membership sentinel and confirmed unsubscribe/unmount barrier is mandatory. The server must prevent all new signed URL issuances after removal. Previously issued links can remain valid until server expiry, and a client cache lock cannot revoke them. Cross-window/popup safety, session transitions and signed DM/P1/P2/removed/outsider QA are still untested.

`tests/world-v2-r18-221-signed-asset-revocation-lock.test.mjs` invokes the **staged copy of the real source store** with fictional signers and synthetic URLs (never a real Supabase project), covering: lock with active subscribers, clear-after-lock, subscribe/get/peek-after-lock, stale in-flight sign completion, cancelled timer callback racing after the lock, throwing/rejected listener isolation, unchanged ordinary clear behavior, and fresh-instance isolation. Existing R123 source-only revocation tests against the unchanged LIVE store must continue to pass; R123's special requirement that **ordinary** clear reissues for live subscribers remains true. No Storage service credential or network/database call is involved in tests.

R221 scoped GitHub Actions requires exactly four files changed relative to R220, with one staging-only module and **zero changes to src/** and excludes all Supabase migrations, Edge functions, Vercel/deployment config, other frontend files, package/dependency changes and paid resources. The full staged repository verification is a separate exact-head required gate.

## Release blockers

The first full-repository CI attempt correctly FAILED R81's frozen preview-source SHA gate when the candidate was placed under `src/`. We restored the live file EXACTLY from R220 and moved the implementation under `staging/`; R81's source-hash safety invariant is deliberately preserved. A fresh exact-head 2/2 CI success is required. R221 intentionally does not merge, deploy, modify production or touch either Supabase project. All 83 private migration semantics, 67 authenticated-callable privileged graphs, effective RLS and managed Storage policy compositions, signed bearer URL revocation and issues #212/#220/#223/#229/#231/#306 remain security **NO_GO**. A release-integrated revocation route and server validation, backup/rollback for any separately approved QA-only SQL plan, and signed multi-user testing are still mandatory.

**No owner-local SQL or WSL task is required for R221.** Owner manual work will only be requested when the release integration is ready for isolated live verification or an exact owner-approved QA-only SQL plan is necessary.
