# B10-R18-96 — Independent Free QA provisioned; release NO_GO

**2026-11-16 Melbourne · dedicated QA resources created, no SQL, no site deployment.**

**Direct R18-95 parent:** draft [PR #197](https://github.com/xuvenz-source/ttrpgsite/pull/197), exact head `abfbceddef010eef7cca246bcd6e67bc5e09827f`. The preceding preflight remains an immutable historical snapshot. This is the first provisioning receipt, not an authorization to migrate or deploy the app.

## Confirmed authority and actual provider outcome

The operator explicitly selected Supabase organization **Xuven** (`uukoiflquxqdszrzgoyg`), mandated verified $0-only resources, and prohibited any existing project or production change. The connected Supabase provider returned `{type:"project",recurrence:"monthly",amount:0}` immediately before creation. The provider required an additional cost confirmation token for the previously approved **$0/month** cost. One project was then created:

- New Supabase **Tabletop Forge QA**, ref `bgydsamxypjslergfpla`, `ap-northeast-1`, `ACTIVE_HEALTHY`, independent API URL `https://bgydsamxypjslergfpla.supabase.co`, PostgreSQL 17. New project reports **zero registered migrations**. Modern `sb_publishable_` key availability confirmed without logging its value. The original production `lwhwgqaunxbmvyndswze` remained `ACTIVE_HEALTHY`. The connected organization now exposes two projects.
- New **unlinked, undeployed** Vercel **tabletop-forge-qa**, id `prj_49bkFS9Ti4FoPa38LjNNxjgEaZwX`, under existing team `team_x0HgomZNnFpGbnYWHgut76AX`, Vite. Only QA `VITE_SUPABASE_URL` and QA `VITE_SUPABASE_PUBLISHABLE_KEY` are present, **encrypted** and scoped to **preview/development**, not production. There is **no attached Git repo, no latest deployment, zero deployment records**, no hosted test URL and Vercel Authentication protection is enabled. No privileged/service-role credentials were supplied.
- Existing Vercel `ttrpgsite` (`prj_JvLavoId5bra74h24BDL7ZyMKizN`) retains its original shared Supabase environment entries. No original environment values were updated and the permanent/previous QA alias was not repointed.
- Supabase cost was explicitly quoted $0/month. Vercel public Hobby documentation permits multiple projects; the connected team API did **not** expose an account-specific price quote. There was **no Vercel deployment or paid add-on provisioned**. Do not claim an independently quoted Vercel price or increased free resource quota.

## Strict NO_GO boundary

**Not yet done:** linked official 83-original + 8-pending migration dry run, original historical schema bootstrap on QA, narrow R05/R48 migrations, separate optional R57/R77 candidate with inverse, QA-only Google/Discord providers and redirect allowlists, synthetic DM/P1/passive-P2 sessions, hosted fog/privacy/revocation/collision and Commit rollback tests, browser/realtime p50/p95, real physical Free RAM/lock monitoring, and production operator release approval.

This provisioned backend is intentionally **blank** and the QA frontend is intentionally **undeployed**. Do not try logging into it or interpret it as a functional movement preview.

## Forward work packages (separate gates)

1. Source-exact schema bootstrap plan: compare 83 historically registered source migrations against review-proven hashes, run original CLI 2.81.3 linked read-only list/fetch, and produce non-destructive dry-run evidence specific to QA project ID. Do not copy production Auth, campaigns, maps or secrets.
2. Obtain explicit approval for applying a reviewed, ordered QA-only baseline, then independently review the eight pending migrations. Optional candidate is a separate rollback-protected decision. Never run bootstrap against the original production project.
3. Configure QA auth allowlists and OAuth credentials through the QA Supabase project only; create synthetic accounts with no production identity reuse.
4. Link a reviewed Git SHA to the **separate** Vercel project after the schema/auth gates, deploy a QA-only preview, verify compiled Vite variables against its exact backend, and establish a stable test URL. Leave existing alias untouched.
5. Conduct real signed DM/P1/passive-P2 acceptance, fog/LOS revocation, rapid drag/keys, wall/corner true collision, repeated gestures, render no-flash, p95 Commit, RAM/swap/locks, and rollback under Free quotas.

## Evidence and persistence

The receipt is `staging/world-v2-b10-r18-96-free-qa-provisioning/manifest.json`. It contains public project IDs, source identity, scoped environment **metadata only**, and explicit false release gates; no publishable key value, auth credential, DB password, Vercel token, or production user data. Original R18-95 manifest retains its true *then-unprovisioned* state. The new source-only release guard must always return **NO_GO** until independently signed hosted acceptance and production approval in later steps.
