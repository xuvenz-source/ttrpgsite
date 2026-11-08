# Step 6 — GitHub CI, CodeQL and Vite build validation

Date: 2026-11-09
Branch: `stage/complete-predictive-navigation-and-fog-2026-11-09`
Release policy: staging-only validation. **No Vercel deployment, merge, Supabase migration or production data writes.**

## Confirmed GitHub Actions evidence

1. **CI run** [42493625795](https://github.com/xuvenz-source/ttrpgsite/actions/runs/42493625795) on commit `006030dec17241cb8d08531a6bdd748b6a118156`: completed `success`. GitHub job `128771069166` reports:
   - Checkout: success
   - Node setup: success
   - `npm install --no-audit --no-fund`: success
   - `npm test`: **467 tests, 467 passed, zero failed**
   - `npm run lint:critical`: success
   - `npm run build`: success; Vite 6.2.0 built in approximately 1.37 s. Generated entry JS approximately 273.23 kB (88.08 kB gzip), CSS approximately 155.85 kB (28.59 kB gzip).
   - Successful classic GitHub commit status `ttrpg/staging-unit-lint-build`, allowing results to be checked through the connected GitHub API.

2. **CodeQL run** [42493628620](https://github.com/xuvenz-source/ttrpgsite/actions/runs/42493628620) on commit `9ccaa85ee5023cd7a73e7cabff390911245b0185`: completed `success`. GitHub job `128771079231` reports:
   - Checkout, CodeQL initialization and `security-extended` JavaScript/TypeScript analysis: success
   - SARIF code-scanning results: uploaded successfully
   - Successful classic GitHub commit status `ttrpg/staging-codeql`
   - **A successful scan does not mean zero CodeQL security findings.** The connector does not expose a code-scanning alert-listing action; inspect GitHub's Code Scanning alerts before production release.

## Workflow compatibility and changes staged

- The GitHub connector's `fetch_commit_workflow_runs` only returns PR-triggered runs; this branch's push-triggered runs were not visible that way, and the ordinary combined status initially contained no check-run records. To make actual results observable without opening a PR (which might trigger a Vercel preview), both workflows now publish explicit status contexts using the job-scoped GitHub token with `statuses: write`.
- Status publication uses `if: always()`, uses `job.status` to distinguish failure from success, and links to the actual run; no empty status is interpreted as a pass.
- On the first run GitHub warned that `actions/checkout@v4` and `actions/setup-node@v4` use deprecated Node 20 action runtimes. Both staging workflows have since been upgraded to current `actions/checkout@v7` and `actions/setup-node@v7` (where applicable), retaining application Node 22. `package-manager-cache: false` prevents implicit caching without a lockfile.
- The branch CI path filter now also includes changes to the CodeQL workflow, allowing test, lint, build and security checks to validate the same application revision.
- The CI workflow performs no Vercel action, external deployment or database migration; CodeQL only uploads to GitHub Code Scanning.

## Remaining release gates and limitations

- The above run links were verified against specific immutable commits. Later commits, including action-runtime updates and this report, need a fresh successful pair of statuses to be considered checked against the same branch head.
- The repository has no tracked `package-lock.json`, so this workflow deliberately uses `npm install`; transitive dependency resolution is not fully reproducible. Generate/review a lockfile and switch to `npm ci` in a separately reviewed release-hardening change when feasible.
- CodeQL upload confirmation is not an absence-of-alerts guarantee.
- Passing source tests and a Vite build does not compile or execute staged SQL in PostgreSQL and does not prove multiplayer responsiveness, visibility confidentiality or Supabase memory costs. Those are separate approval gates.
- GitHub Actions run timestamps use UTC and can differ from the user's local November 9 date.
