# B10-R18-92 — Chromium R12 rapid-regrab regression harness repair

**16 November 2026 (Melbourne) · Draft PR #194 · test/CI changes ONLY · NO Supabase SQL, migration or Vercel deployment.**

Direct parent: R18-91 draft PR #193 exact SHA `6e293f52c38d0f4410cf5d8f53922021aa3c6b05`. R18-91's full general CI `43713696848` was **cancelled at the 20-minute job timeout**, despite the original PostgreSQL authority, source-real R54 fog/collision/rollback, pinned CLI help and CodeQL workflows passing. The cancelled Node log showed a failed R12 real React board test and never returned final Node TAP totals.

## Reproduction and root cause

R18-92 first isolated the **same** `R12 real React V2 player can drag again before lagged signed sight catches up` test in a new **credential-free, time-bounded** GitHub Actions workflow `.github/workflows/world-v2-r18-92-regrab-isolated.yml`:

- Baseline targeted run **`43719325470`** failed with `ENOTEMPTY: directory not empty, rmdir '/tmp/world-v2-react-drag-…/Default'`, then remained open until the **140-second external watchdog** killed it.
- Source inspection found `browser.close()` in `tests/world-v2-real-react-board-drag.test.mjs` called `proc.kill('SIGKILL')` and **immediately** `rm(dir,{recursive:true,force:true})`. Chrome and descendants could still hold/write `Default` after the kill signal. The same race existed in the browser initialization-error cleanup. The failure in this isolated attempt arose from **test-harness teardown**, not a demonstrated movement/collision rejection.
- Corrective change: create one promise for the actual Chromium child-process `close` (or `error`) event; centralize idempotent shutdown used by both normal return and error cleanup; close the CDP WebSocket, kill Chrome, await the process-close signal with a **2,500 ms** upper bound, and recursively remove the temporary Chrome profile with **20 retries at 100 ms intervals**. No path to the original immediate kill/delete race remains.
- First fixed targeted run **`43720224796`** **PASS**, with the actual R12 regrab assertion enabled and Chromium present. The same test also passed as part of the **1,353/1,353 green Node tests** in full general run **`43720224720`** on that stage head. A new `tests/world-v2-r18-92-browser-cleanup.test.mjs` and R78/R79 ledger guards prevent future weakening of teardown, omission of R12 assertions or silent conversion of this test-only repair into a production release approval.

**Interpretation:** The teardown race explains the reproducible `ENOTEMPTY` error, lingering Node test worker and cancelled CI. Since the R12 test actually passed in the fixed isolated/full runs, we have *not* reproduced a remaining gameplay bug from that CI incident. However, actual player-reported lag near walls and during rapid movements is still unresolved **on the deployed build**: this PR changes no movement logic, browser production code or backend.

## Release and infrastructure state

R18-92 is **not** a movement-system optimization. The approved release sequence remains blocked: live Supabase has **83** registered migrations (R05 + seven reviewed narrow pending migrations must first pass the independent authenticated pinned CLI 2.81.3 `migration fetch/list/db push --linked --dry-run` gate before any separately authorized apply); combined R57 + R77 candidate has not been installed; no isolated QA Supabase backend has been verified; no real independently signed DM/P1/passive P2 fog/collision/revocation, rapid corner regrab/browser p95, observer convergence or Supabase Free physical RAM/lock load accepted. Production and permanent QA preview unchanged.

The R18-91 operator-only read-only linked CLI runner remains draft and **has not been run** with real credentials. Nothing in R18-92 should be treated as new authorization for SQL, migrations, merging the 100+ unapproved staging branches, paid infrastructure or deployment. This is a **NO-GO** release.

## Acceptance

The exact R18-92 final head must pass: general Node unit/regression + build/lint/audit, isolated R12 real Chromium test with external watchdog, PG17 movement authority and original R54/R83–R88 signed fog/collision/rollback, pinned v2.81.3 offline CLI help, and CodeQL. Record any workflow running on a preceding head as such.

**Next R18-93:** Having repaired the reliability of this critical movement integration test, return to the *actual hosted movement problem*: obtain R18-91's independently authenticated CLI read-only attestation, then design a separately authorized QA backend release or genuinely isolated multiuser browser test. Do not substitute more synthetic speed figures for hosted p95 and authentic player/DM sync.
