# B10-R18-94 — Phase 3 real Chromium pointer-capture test shutdown repair

**16 November 2026, Melbourne · draft PR #196 · source/test-only · no hosted SQL, production runtime, deployment, or paid change.**

Direct parent: R18-93 PR #195 exact `c365bd6a22b1b3c79b0a55d3c5c64cbd5131eaed`.

## R18-93 final CI blocker (verified)

R18-93's six final-head workflows were **5/6 green**. The general job `43725949176` ended **cancelled** after 20 minutes, at its GitHub Actions job timeout. The log's last named failing test was:

`actual Chromium DOM pointer capture: player, DM unlocked, preview, locked editor`

at approximately 8.5 seconds, followed by a stranded Node test worker until the timeout. The previous R18-92 repair had corrected immediate Chromium kill/profile removal **only in the different R12 real-React browser harness**. The Phase 3 harness, `tests/world-v2-phase3-real-dom.test.mjs`, independently repeated the same unsafe order:

`ws?.close(); child.kill('SIGKILL'); await rm(profile)`

on normal and exceptional exit. Chrome descendants may continue to write into `Default` after SIGKILL is sent. This is a genuine teardown race and a credible cause of an `ENOTEMPTY`/hanging worker, as already reproduced for the related R12 test. The R18-93 log alone does **not** prove that the Phase 3 test's first assertion failure was caused exclusively by teardown; that assertion remains a regression signal that must not be skipped.

## R18-94 actions and acceptance

A new credential-free isolated CI job `.github/workflows/world-v2-r18-94-dom-capture-isolated.yml` invokes the **exact** Phase 3 test using one Node test worker, TAP output, an external 140-second watchdog and no Supabase secrets. It **fails** if Chromium is absent rather than quietly skipping the browser test. Isolated baseline on unmodified Phase 3 cleanup `43738248230` **passed**, showing the test can pass when run alone. This reinforces the concurrency/teardown explanation, but does not establish the prior full-suite failure was spurious.

`tests/world-v2-phase3-real-dom.test.mjs` now uses **one idempotent shutdown** for both success and error:
- close the DevTools WebSocket and signal Chrome to terminate;
- await the OS child `close` or `error` event, with a bounded 2,500 ms fallback;
- remove the temporary browser profile using recursive force with up to 20 retries, 100 ms apart.

The original test still runs actual CDP pointer movement for player, DM unlocked, preview, locked editor and nested status button, including start/move/end, marquee exclusion, document capture ownership, actual browser capture, editor refusal and status control checks. There is no relaxed assertion, flag/feature bypass or production movement logic modification. R94's `tests/world-v2-r18-94-phase3-chromium-cleanup.test.mjs` statically locks shutdown and the original assertions.

### R79 immutability audit maintenance uncovered by the now-completing general suite

Once the Chromium teardown was fixed, the general Node run **completed** and exposed a separate source-only ledger validator defect: the original R91 historical entry was still checked with a brittle `branches.at(-2)` index even after R92–R94 were added. It did not indicate a released migration or changed fog permission. R18-94 replaces **all 15 cumulative R80–R94 successor-relative ledger positions** with fixed array positions **165–179**, derived from the frozen original 165-entry R79 inventory and each sequential staged successor. The existing explicit entry classification, source parent SHA, NO_GO records and latest-release membership checks remain in place. Additional static tests require every fixed index and reject any return of a moving `branches.at(...)` ladder in R79.

The existing R18-92 R12 isolated real Chromium job continues unchanged, so both browser lifecycle tests have independent checks. Full Node suite, lint, Vite/npm audit, original isolated PG movement authority, disposable source-real R54/R83–R88 fog/Commit/rollback, pinned v2.81.3 CLI help and CodeQL must be green on the **exact final SHA** before declaring engineering PASS. A single isolated Chrome PASS does not substitute for the full general suite.

## Infrastructure and production boundary

The shared connected Supabase source still has 83 registered migrations, while the reviewed R05 + seven pending require an independently authenticated pinned Supabase 2.81.3 exact 83+8 linked `migration fetch/list/db push --linked --dry-run` **before** any separate migration application approval. R91/R93's operator-only runner remains unexecuted against the live project. Combined private fog R57 + R77 is source-sealed but **not hosted**. There is no verified isolated QA database for the permanent Vercel preview; a test-only Vercel frontend does not isolate shared Supabase backend effects.

We have not accepted independent DM/P1/passive P2 real-time sight/collision/revocation, quick corner regrab, browser p50/p95, observer convergence, actual Free RAM/swap/lock load, or post-install restoration on shared infrastructure. Those remain release blockers even if all Chromium CI checks pass.

**Engineering R18-94 scope:** repair a second test-harness shutdown race and restore reliable full-suite verification. **Actual hosted movement performance and production/shared-backend SQL remain NO-GO.**

**Next R18-95** after green CI: pursue actual credentialed operator-linked 83+8 dry-run evidence or separately approved isolated Auth/Realtime QA; avoid treating synthetic performance benchmarks as evidence of player-visible improvement.
