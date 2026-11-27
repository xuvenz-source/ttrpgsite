# TTRPG Site — development and release rules

**Applies to every developer, coding agent, and ChatGPT conversation working on this repository.** Read `docs/development-workflow.md` before staging, reviewing, or publishing changes.

## Default: stage changes; do not deploy them

- The user is the designer; the assistant acts as developer. Follow explicit staging/publishing instructions and preserve unrelated work.
- Stage iterative changes on separate `stage/**`, `feature/**`, `fix/**`, or `ops/**` branches. Small, frequent commits are allowed.
- Run GitHub Actions tests and the local Vite build for each change; inspect failed checks before reporting readiness.
- **Do not trigger a Vercel deployment for every commit.** Avoid Vercel deploy/redeploy/preview API calls, Deploy Hooks, or GitHub CI deploy steps during ordinary staging. A code review is not authorization to publish.
- Vercel project `ttrpgsite` has `previewDeploymentsDisabled=true` to prevent project-wide automatic previews, including pushes from older staging branches. Keep this setting enabled by default.
- `vercel.json` has `git.deploymentEnabled`: `main: true`, `**: false`, so Git-triggered production releases are permitted but all other branch pushes are excluded. Preserve this configuration.
- **Batch all outstanding staged work into the next approved production update.** When the designer says "push an update" or "push to live", do not ship only the most recent branch: audit every `stage/**` (and intentionally staged `feature/**`/`fix/**`) branch and the ledger in `staging/next-release-ledger.json`. Include **all still-unreleased, ready staged components**, including their database and Edge Function dependencies, in one consolidated release unless the designer explicitly defers an item.
- Feature development may occur on separate branches, but each ready feature must be integrated into `stage/next-release-consolidated-2026-11-07` (or its successor after a release). Reconcile code from **current production `main`**, never overwrite newer live code with a stale branch snapshot. Resolve git, UI, realtime, database and permission conflicts before release, then verify the combined result.
- A green feature-branch test does **not** mean the combined release is safe. Require a green **consolidated** test/build and security scan; check that the database migration(s) and Edge Function(s) match the exact consolidated frontend. If any staged component is incompatible or unsafe, clearly identify the blocker and **do not silently omit it** from the update.
- Publish deliberately with one merge to `main` and one Vercel production deployment whenever possible; never deploy each feature branch separately. After release, reconcile the ledger and preserve any explicitly deferred items for the next batch.
- For a browser preview **only when explicitly requested**, arrange one on-demand preview; see `docs/development-workflow.md`. Coordinate any temporary change to Vercel's project-wide preview setting, and restore it after preview creation. Do not leave bulk automatic previews enabled.
- After publishing, verify the actual Vercel production deployment SHA/URL/ready state and any relevant Supabase Edge Function or database migrations separately. A green GitHub Action or merge does not prove Vercel served the new release.
- Keep secrets in Vercel/Supabase protected environments, never Git or chat. Never make database migrations or deploy Edge Functions as side effects of frontend staging.
- In an explicitly **ideas-only/log-only** conversation, document requested ideas but perform no changes.
- A staging request is **never** approval to deploy. Keep the release bundle on GitHub with previews disabled, even when CI is green.

## Database testing policy — isolated pre-release security checks and authorized live acceptance

- The 7 November 2026 live-only testing decision is superseded where the designer subsequently authorized $0 isolated QA and local sandbox verification. No paid testing platform or paid private CI is permitted.
- Stage and review SQL/RLS/RPC changes first. Use isolated local Docker with synthetic fixtures and reviewed allowlisted manifests; keep owner-private migration source in its restricted repository/local registry. Do not replay unreviewed historical SQL into hosted environments or expose private source or data.
- Before releasing access-control changes, verify the exact forward candidate against a source-equivalent isolated baseline, check integrated frontend/backend compatibility, and perform separately authorized authenticated QA. A green synthetic test is not proof of production permissions or authenticated behavior.
- Only an explicit designer production release approval authorizes compatible live migrations, Edge Function updates or application deployment. Verify the intended behavior afterward using approved test campaigns. Do not use a test failure as authorization to alter production.
- Before destructive changes, identify affected data, prefer transactional forward fixes, document recovery and disclose irreversible risk. Preserve historical migrations, RLS, least privilege and zero-cost constraints.
- Follow docs/engineering-workflow.md (or the linked staged reconciliation if unmerged): bounded related iterations, original A–F gates, durable handoffs and independently reconciled local agent receipts. No claim of continuous assistant execution.

## Guardrails

If the daily Vercel deployment quota is exhausted, report the blockage and preserve live functionality. Do not retry deployments in a loop or upgrade billing without user authorization. For staged UI functionality, prefer automated tests and a single approved browser preview at a milestone.

These are repository-level instructions, not a claim that individual chats share live state. The Vercel project setting and Git configuration enforce the no-auto-preview rule independently of chat history.
