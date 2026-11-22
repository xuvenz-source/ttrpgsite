# R222 — R123 confirmed-membership revocation to R221 signed-asset lock bridge (staging-only, NO_GO)

22 November 2026. Child of R221 draft PR #333 exact corrected head 14e7fba803b9ec4ca0eeab92be27d59c2abc6f67. R221 focused signed-asset test workflow 44989351109 and full staged repository verification 44989351133 both SUCCESS, including **R81 frozen preview source-hash preservation**. No source file under src/, production, Vercel, active SQL migrations or Supabase Edge functions is modified here.

## Owner-private evidence and scope

R220 owner report arrived as **only sanitized JSON** (3,335 bytes, SHA-256 0a88d58f78761f07635d1e9969e20c1fa6c3be640214a1576fa05663a33d2cfd of sanitized JSON only): 83/83 historical source SHA checks, 937 top-level lexical statements, 12 historical Storage policy statements and 7 possible same-target/role/operation pairs. Four pairs contain **nested OR** in an archived policy guard, no top-level OR markers. PostgreSQL effective RLS, actual hosted Storage policy catalogue, membership revocation, signed bearer URL invalidation, and all 83 original migration semantics remain NO_GO.

Issue #231 is an independently confirmed client hazard: live src/SignedAssetUrls.js currently reissues signed URLs via clear() for active subscribers. Already-issued signed URLs persist as bearer tokens for up to 3,600 seconds; local cache clearing cannot invalidate them. R123 sentinel/teardown is currently staging-only and not imported live.

## R222 staging-only prototype

The new **staging/world-v2-b10-r18-222-signed-asset-revocation-bridge/SignedAssetRevocationBridge.js** imports the existing R123 *staging-only* signed-membership sentinel and teardown ordering contract and accepts an R221 *staging-only* revocation-lock candidate as an injected dependency. It requires the host-supplied DB actor membership proof, current campaign context, synchronous mask and allow callbacks and ALL mandatory R123 teardown hooks. It introduces no timer, movement-frame polling or extra hosted database calls. Nothing imports it into live src/.

- An UNTRUSTED membership hint or an RLS/network failure causes the existing R123 synchronous view mask and recheck. It never asserts confirmed revocation based only on a hint or SQL error; unverified states remain locked visually but do **not** lock the cache permanently. This is a release blocker until all new signing is denied server-side.
- **Only after a genuine R123 signed membership-absent proof**, onRevoked synchronously calls R221 lockForRevocation BEFORE any async unmount barrier. It permanently seals the staged cache instance and fences its signer, so teardown cannot reopen it.
- The R123 teardown then performs all synchronous masks/purges and the mandatory confirmed-unmount and channel-unsubscribe barriers. Its clearSignedAssetUrls hook is replaced by an internal sealed-only clear; no caller-supplied cache-clearing function is invoked to accidentally reissue.
- If the cache lock throws, returns a Promise, or is not confirmed, the view teardown still proceeds but the result is forcibly **incomplete** and the cache clear hook refuses. Returned results contain only fixed status codes, never raw error details.
- Browser-window/popup, actual remote RLS changes and existing bearer URL validity are not proven by these source-only tests.

Tests use the REAL R123 staging sentinel and teardown classes together with R221's STAGED cache candidate, completely invented actor IDs, mocked RLS membership result and mocked signer only. Tests confirm the lock occurs before asynchronous unmount, prevents post-removal signer refresh, preserves healthy authorization on untrusted hints, keeps network-error state unknown and masked, reports a broken lock incomplete, rejects missing security hooks, and explicitly documents that previously issued URLs are unaffected at the server. R221 candidate tests and R123 staging tests are rerun for compatibility.

## Release restrictions

This package is only a safe integration **prototype**. No code is live-imported, deployed, merged, or connected to an active campaign; no SQL executed and neither original nor isolated QA Supabase project was changed. The security blockers #212/#220/#223/#229/#231/#306, 83 historical migration reviews, 67 privileged callable graphs, effective RLS and signed URL revocation, and signed DM/P1/P2/removed/outsider QA remain **NO_GO**.

Before any actual release, the next separately reviewed change must integrate an authenticated membership-gated revocation path into the live app, preserve performance/World V2 movement isolation, verify map/sheet/chat/popout teardown and freshness, establish a $0-compatible server-side signed-asset policy and existing URL revocation strategy, and pass exact signed multi-actor isolated QA. A generic Proceed does NOT authorize DB writes or production deployment.

**No owner-local WSL or SQL step is required for R222.** An owner action is necessary only for subsequent separately approved QA/live tests or a fully scoped QA-only SQL installation plan with backup/rollback.
