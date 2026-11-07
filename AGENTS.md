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

## Database testing policy — live environment

- **There is no separate database testing platform.** Do not require a paid staging database, Supabase preview branch, cloned database, disposable test environment, or synthetic-data SQL test run as a prerequisite to an approved database release.
- Stage and review schema/RLS/RPC changes as code first. Use non-invasive checks (static migration review, GitHub CI, query inspection) where feasible. They do **not** establish that a migration has passed live testing.
- **When the designer authorizes a production release**, apply the compatible migration to the existing live Supabase project and test the behaviour directly there using the project's current test campaigns and accounts. Report results and repair observed errors in subsequent controlled fixes.
- Before any potentially destructive change, identify affected data, prefer backward-compatible/transactional migrations, prepare a rollback or recovery path where feasible, and disclose any irreversible risk. Do not use an expensive service or silently expose private data to make testing easier.
- This policy removes the requirement for a separate database testing platform; it does **not** authorize deploying without approval, skipping basic security review, falsely claiming tests passed, or treating live testing as proof that access controls are secure.
- Where older staged PRs demand disposable database or role-switched staging environment tests, apply this live-testing policy instead. Validate permissions in live with authorized test accounts after release, and correct failures promptly.

## Guardrails

If the daily Vercel deployment quota is exhausted, report the blockage and preserve live functionality. Do not retry deployments in a loop or upgrade billing without user authorization. For staged UI functionality, prefer automated tests and a single approved browser preview at a milestone.

These are repository-level instructions, not a claim that individual chats share live state. The Vercel project setting and Git configuration enforce the no-auto-preview rule independently of chat history.
