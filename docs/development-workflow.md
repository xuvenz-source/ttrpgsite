# Development workflow — fewer Vercel deployments

Updated: 7 November 2026. Applies to all development work for the **TTRPG Site / Tabletop Forge** repository `xuvenz-source/ttrpgsite` and Vercel project `ttrpgsite`.

## What changed

**Problem:** Vercel's Git integration created a preview deployment for nearly every change to a staging or feature branch. Many small GitHub writes consumed the free deployment API's daily allowance before production releases could be published.

**Project-wide primary safeguard:** Vercel project setting `previewDeploymentsDisabled=true`. This was applied through the connected Vercel project API. It prevents automatic preview-deployment creation for existing as well as newly created branches, even when an older branch has an outdated `vercel.json`. Preview deployment creation may also be unavailable manually while this setting is enabled; temporarily restore previews only for an intentional preview session.

**Repository secondary safeguard:** `vercel.json` contains:
```json
"git": {
  "deploymentEnabled": {
    "**": false,
    "main": true
  }
}
```
Vercel evaluates multiple matching rules so that an explicit `main: true` allows production deployments even with the deny-all `**` pattern. Every other branch, including `stage/*`, `feature/*`, `fix/*`, `release/*`, `ops/*` and `audit/*`, is denied **automatic Git push deployments**. A GitHub `main` merge remains an intentional production release. Source: [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration).

**Staging verification:** `.github/workflows/verify-staged.yml` runs on pushes to **any branch**, pull requests and manual workflow dispatch. It runs `npm test`, production dependency audit, `npm run build`, and strict Deno type-checks on account Edge Functions. Workflow concurrency cancels obsolete checks on the same ref. No deploy tokens or automatic Vercel API calls are needed to test staging changes.

## Daily process for any development chat

1. Begin from the latest appropriate base. Normally create/update a `stage/<feature>` or `fix/<feature>` branch. Register ready work in `staging/next-release-ledger.json` and integrate it into the shared next-release staging bundle based on current production code; don't let ready work wait forgotten on an older branch.
2. Commit changes as needed. Let GitHub Actions verify each revision. The Vercel site should **not** create a preview deployment for these pushes.
3. Summarize what has been staged, which tests passed, and what remains to be checked by a human. Avoid inventing browser test results when only static/CI tests have run.
4. When a visual or multiplayer milestone is ready for review and the user requests a live preview, deploy **once**, not after each commit.
5. When approved for production, **audit every staged branch and release-ledger entry**, then integrate **all outstanding, release-ready staged components** on a single branch based on current `main`. Resolve all code/permission/database conflicts, run the **combined** tests, Vite build, dependency audit and CodeQL, and reconcile the complete migration/Edge Function sequence. Do not silently exclude a ready staged feature just because another request was the most recent. Merge the consolidated release into `main` **once**, after approval, so Vercel creates **one** production deployment. Verify the resulting commit was actually served.
6. For backend changes, coordinate Supabase Edge Functions/SQL migrations in a safe compatibility order; merging frontend code is not itself a backend deployment.

## Database release and testing standard

**Designer decision, 7 November 2026:** this project has **no dedicated database test platform** and will not pay to create one. Database functionality is verified by **live tests after an authorized production release**, using the existing test campaigns. If an issue is discovered, stage and release a fix through the normal approval path.

1. **Prepare on a staging Git branch:** author proposed SQL/RLS/RPC changes alongside related frontend code and inspect them for correctness and authorization boundaries. Automated frontend tests and builds stay part of routine CI. A separate test database, Supabase paid branch, synthetic data environment, and disposable-data SQL runs are **not release gates**.
2. **Assess change safety:** inspect existing live schema and dependencies with read-only queries when possible. For destructive changes, document which data could be lost and provide a feasible rollback/recovery plan; prefer additive migrations and smaller coordinated updates.
3. **Obtain designer's release approval** before running SQL or deploying backend/frontend. An instruction to stage changes is not permission to modify the production database.
4. **Apply migrations on the existing live Supabase Free project** in a compatible order, then deploy the matching approved frontend once. Do not install hourly/paid testing infrastructure.
5. **Test in live:** run the intended actions as DM and players using current test campaigns; inspect permissions, real-time updates, data persistence, and feature-specific regressions. Explicitly disclose what was and was not tested.
6. **Fix issues found in live** with a reviewed, authorized follow-up patch or rollback as appropriate. Urgent access-control exposures may require temporarily disabling the affected action until resolved; never assume a successful SQL execution proves security.

Older draft PR notes requiring a disposable database or separate staging SQL test should be read using this newer policy. A developer can still run optional non-destructive checks, but should not block releases because a database test platform does not exist.

### On-demand preview checklist

- Confirm the user's approval to create one preview and the quota's remaining availability.
- Verify the branch and exact commit, and the test environment's data-isolation and permissions. Avoid letting preview users read production secrets or unreleased DM content.
- If Vercel's project-wide `previewDeploymentsDisabled` setting prevents a preview, **temporarily** change it to `false`, create a preview manually from the desired commit in the Vercel Dashboard (`Project → Deployments → Create Deployment`) or an authorized Vercel API/CLI call, and promptly set it back to `true`.
- The `git.deploymentEnabled` rules continue to suppress automatic branch-push previews for branches that contain the current `vercel.json`. Older staging branches may not contain that file, so avoid bulk pushes while previews are temporarily enabled.
- Verify the preview is READY; do not claim browser acceptance without visiting and exercising it. A preview uses Preview-scoped environment variables and may be protected by Vercel Authentication.
- If preview creation fails due to the deployment quota, retain CI results and resume the release only after quota resolution. Do not blindly repeat failed calls.

### Production release checklist

- User requested publishing; identify exact approved scope and deployment target.
- Fetch all `stage/*`, explicitly staged `feature/*` and `fix/*` branches, and reconcile `staging/next-release-ledger.json`. Identify what is already live, superseded, genuinely pending, or expressly deferred; all ready pending features must ship together unless the designer changes the scope.
- Verify the consolidated staging branch includes the changes from **every** outstanding feature branch; resolve semantic overlaps (realtime security, visual interaction, RLS, schema, auth and other shared files) before deployment. Never copy an obsolete branch over newer production changes.
- Run combined tests/build/CodeQL and document the exact migration and Edge Function deployment ordering. If even one ready feature conflicts or is not verified, block the release and report it; do not quietly leave it behind.
- Fetch current `main`, ensure release branch is current, run tests/build/security checks; check for unintended differences.
- Merge once (or otherwise issue one explicitly authorized production deploy), then inspect Vercel `production` deployment and expected commit SHA. **GitHub CI success does not guarantee production deployment.**
- Verify production URL response and relevant application flows; check Edge Function deployment/version and Auth/security configuration for any backend change.
- If Vercel returns `api-deployments-free-per-day` / 402, stop; do not deploy incompatible backend changes while the frontend is still old.

## Where these rules live

- **Vercel project setting**: governs all branches and chats immediately, independent of Git.
- **`vercel.json`**: persisted in the repository and inherited by new branches.
- **`AGENTS.md`**: shared instructions for developers and AI coding agents.
- **`staging/next-release-ledger.json`**: the auditable list of live/superseded versus outstanding stage branches, bundled features, and backend dependencies.
- **`tests/deployment-policy.test.mjs`**: regression protection for the configuration.
- **GitHub Actions**: tests on commit, without triggering Vercel.

These settings do not retroactively delete old preview deployments or eliminate Vercel's 24-hour quota. To re-enable automatic previews in the future, first obtain explicit designer approval, and review **both** Vercel's project setting and `vercel.json`.
