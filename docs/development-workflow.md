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

The 7 November 2026 live-only testing decision remains historical. Subsequent designer instructions authorize free isolated local Docker security verification and a separately authorized free QA environment. No paid Supabase branch, metered private Actions or unapproved hosted mutation is permitted.

1. **Stage:** review forward-only SQL/RLS/RPC changes with related frontend changes; preserve actual historical migrations. Keep private source and test records restricted.
2. **Verify pre-release:** use reviewed, pinned local test jobs and source-equivalent isolated baselines for security-sensitive changes; reconcile results, integrated CI, privilege and rollback checks. Synthetic, source-bound and complete historical replay evidence must be identified separately.
3. **Qualify:** verify the exact integrated frontend/backend contract and real authenticated multi-user scenarios in the separately authorized QA context. No unreviewed historical SQL replay to hosted resources; no production change as a side effect of testing.
4. **Obtain explicit release approval:** identify exact candidate, migration order, risk, recovery and full staging inventory. Stage/QA permission is not production permission.
5. **Deploy deliberately:** apply compatible authorized changes in the approved order and verify deployed versions independently. Run approved live test-campaign acceptance after deployment.
6. **Recover safely:** use reviewed forward fixes or safe recovery; do not restore insecure privileges or bypass RLS.

See docs/engineering-workflow.md for A–F milestones, scoped work packages, local agent receipts and release gates. Old live-only guidance in historical PRs does not supersede these staged rules once approved.

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
