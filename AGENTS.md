# TTRPG Site — development and release rules

**Applies to every developer, coding agent, and ChatGPT conversation working on this repository.** Read `docs/development-workflow.md` before staging, reviewing, or publishing changes.

## Default: stage changes; do not deploy them

- The user is the designer; the assistant acts as developer. Follow explicit staging/publishing instructions and preserve unrelated work.
- Stage iterative changes on separate `stage/**`, `feature/**`, `fix/**`, or `ops/**` branches. Small, frequent commits are allowed.
- Run GitHub Actions tests and the local Vite build for each change; inspect failed checks before reporting readiness.
- **Do not trigger a Vercel deployment for every commit.** Avoid Vercel deploy/redeploy/preview API calls, Deploy Hooks, or GitHub CI deploy steps during ordinary staging. A code review is not authorization to publish.
- Vercel project `ttrpgsite` has `previewDeploymentsDisabled=true` to prevent project-wide automatic previews, including pushes from older staging branches. Keep this setting enabled by default.
- `vercel.json` has `git.deploymentEnabled`: `main: true`, `**: false`, so Git-triggered production releases are permitted but all other branch pushes are excluded. Preserve this configuration.
- Do not move unrelated staged changes into a release. Create a release branch from current `main`, apply only the approved patch, run checks, then merge into `main` deliberately when the user requests publication.
- For a browser preview **only when explicitly requested**, arrange one on-demand preview; see `docs/development-workflow.md`. Coordinate any temporary change to Vercel's project-wide preview setting, and restore it after preview creation. Do not leave bulk automatic previews enabled.
- After publishing, verify the actual Vercel production deployment SHA/URL/ready state and any relevant Supabase Edge Function or database migrations separately. A green GitHub Action or merge does not prove Vercel served the new release.
- Keep secrets in Vercel/Supabase protected environments, never Git or chat. Never make database migrations or deploy Edge Functions as side effects of frontend staging.
- In an explicitly **ideas-only/log-only** conversation, document requested ideas but perform no changes.

## Guardrails

If the daily Vercel deployment quota is exhausted, report the blockage and preserve live functionality. Do not retry deployments in a loop or upgrade billing without user authorization. For staged UI functionality, prefer automated tests and a single approved browser preview at a milestone.

These are repository-level instructions, not a claim that individual chats share live state. The Vercel project setting and Git configuration enforce the no-auto-preview rule independently of chat history.
