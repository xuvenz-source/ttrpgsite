# B10-R18-79 — Reconcile actual GitHub branches/PRs with the next-release ledger

**15 November 2026 · Draft / NO-DEPLOY · parent R18-78 PR #180 exact head `5102f62ffe1017a1c7f66df738bee5bfaaaebc38`**

## Purpose and source of truth

The checked-in `staging/next-release-ledger.json` was last updated 12 November 2026, ended at R18-15, and recorded 66 branch outcomes. However, GitHub now contains many later, **unmerged draft branches**, as well as historical staging branches not in that ledger. A CI-successful draft is **not release approval**, and a Vercel deployment record is **not proof of ownership of the canonical production alias**.

R18-79 reads the GitHub REST **pull request list (both pages), all branch pages, the actual release ledger**, and the PR source for important exceptions. It will record a bounded inventory of observed branch and PR metadata, add missing work-package branches to the shared ledger **without calling them release ready**, and retain old accepted release/feature/migration history. It will not create a release bundle, close older PRs, merge into `main`, change Supabase, deploy Vercel or activate any feature flag.

## Proven exceptions (do not silently reintroduce)

- **R18-35 / PR #139**: canonical `ttrpgsite.vercel.app` is READY on commit `5ca8c83bdef4a5d9870020b0f2b16723f7790e38`. This PR is **unmerged** but the precise canary is **live** on the canonical domain. Treat this as an *alias-verified frontend release*, not as merged to main or installed R05 SQL.
- **R18-36 / PR #140**: PR closed/unmerged after live drag/collision regression; later deployment record `da078abe7e0e5f28dbb9eeaa5f26fa570fbc7c19` exists but it **does not** currently own the canonical alias. Explicitly rejected/rolled back; never carry its cosmetic snap into the next release by accident.
- **R18-40 / PR #144**: preview was tested by the sole DM; slow collision/rapid movement persisted, and the PR expressly records **NO-GO**. Its branch **diverges** from the later main R18-41→R18-78 research lineage. Keep as failed-QA evidence, not an approved enhancement.
- **R18-26 / PR #130** and **R18-27 / PR #131**: standalone benchmark candidates are expressly **excluded** by the R18-48 narrow eight-version package. A historic experiment may remain in Git; do not add its SQL versions `20261113021015` or `20261113021017`.
- **R18-57 / PR #161** and **R18-77 / PR #179**: separate optional, operator-gated fog and ray SQL candidate files; tested in disposable PG17, **not installed in the 83-migration linked production database**, and **not part of** the eight versioned R05+R18-48 migrations.
- **R18-58/59** staged QA receipts are not present in the canonical R18-35 browser build; do not treat an unserved staging SHA as accepted DM/P1/passive-P2 multiplayer evidence.

## Operational reconciliation rules

1. Classify every missing stage/fix/feature branch using **GitHub PR state, merge timestamp, branch name and explicitly verified release/QA facts**. Merge or close events are not, alone, canonical-deployment proof. Retain orphan branches as unreviewed instead of assuming they are safe or obsolete.
2. Keep `staging/next-release-ledger.json` prior `releaseHistory`, `lastRelease`, historical feature status and historical database/Edge records **byte-equivalent at the data level**. Do not rewrite their provenance or say old test suites approved current release.
3. Explicitly mark every newly reconciled branch as **not release ready** until independently authorized. The `upcomingRelease.outstandingBranches` list may list open blocked work for *accounting*; it is not a bulk-merge queue. The active `stage/*` branch is an engineering integration **reference**, not an approved release target.
4. Add a source-backed audit snapshot of every GitHub branch and the later PR metadata so the ledger is reproducible, with special dispositions for known-rejected and currently canonical work. Avoid secrets, private maps, player IDs and PR body text in automated output.
5. Keep the R18-78 original observation **historical**: its “ledger last updated 12 November” statement was correct when observed and must not be silently rewritten. Adapt its offline validator to allow a newer audited ledger while preserving frozen 2026-11-14 read-only evidence and unconditional **NO_GO**.
6. On any unknown branch, missing PR metadata or ancestor divergence, **do not promote**. Require an explicit integrated review of actual diffs and dependencies before merging any production release. The latest research branch is cumulative in places but older branches are sometimes divergent, so do not mass merge all PRs.

## Still-open release gates

Connected Supabase remains at **83** frozen migrations, with exactly **R05 plus seven narrow R18-48** SQL files planned, and no independently attested authenticated official CLI v2.81.3 linked fetch/list/`db push --dry-run`. The release cannot proceed until independently signed DM/P1/passive-P2 gameplay/fog/revocation acceptance, true collision and instant-regrab, end-to-end browser p95, Free-tier physical RAM/locks and **separate designer/operator approval**. The canonical Vercel alias, `main` and production-target deployment have different source SHAs. No unverified “green” may be substituted for these hard gates.

## Next engineering package

After exact final-head four-workflow CI and ledger validation, R18-80 should build the *smallest truthful QA preview candidate from the currently proven lineage*, independently review release dependencies and opt-in flags, and stop for operator approval of a **single controlled free-tier preview**. It should never assume the old R18-36 production-target deployment is the active build or merge 100 old branches mechanically.

**R18-79 engineering record: audit/reconciliation only. Production: NO-GO.**
