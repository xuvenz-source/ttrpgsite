# TTRPG Site — infrastructure and private-data security review
**Reviewed:** 7 November 2026
**Systems:** Cloudflare Turnstile, GitHub `xuvenz-source/ttrpgsite`, Supabase `lwhwgqaunxbmvyndswze`, Vercel `ttrpgsite`

This is a configuration and source/RLS audit, not a penetration test. All SQL queries used to inspect policies/functions were read-only; no user character records, passwords, secret keys, uploaded images, or private messages were retrieved. Do **not** interpret "RLS enabled" as proof against all cross-user data exposure. The 19 callable elevated RPCs are findings requiring authorization review, not 19 proven vulnerabilities.

## Confirmed safeguards

- 18 public application tables were inspected; all have RLS enabled. No exposed public view found. The private registration-limit table has RLS with no direct client policy, deliberately.
- No public-schema SECURITY DEFINER RPC is executable by `anon`; 19 functions are intentionally or potentially reachable by `authenticated` and have fixed empty search paths.
- Sensitive `map_tokens.npc_values` is **not** SELECT-granted to `authenticated` (column-level privileges); approved resource fields are served by permission-checked RPCs. Position/status updates are guarded by additional triggers.
- Supabase buckets `battlemap-assets`, `personal-token-art`, and `tabletop-artwork` are all non-public; image MIME/size limits are configured.
- `map_environments` is DM-only by RLS; `npc_templates` are DM-only; `characters` are owner/DM; `campaign_player_maps` are DM or affected user; chat rows are limited by campaign/map visibility.
- Vercel production is public by design; preview SSO is enabled. There is only one Vercel team member in its current member listing. Environment variable names consist of public Supabase URL/publishable key and the public Turnstile site key, not an admin API key.
- The live Turnstile widget is **Managed**, with server-side Siteverify implemented in Supabase `username-register` version 5, and without pre-clearance. Project source code contains no tracked `.env` file.
- GitHub Actions already uses a read-only workflow token for its test/build job and a production dependency vulnerability audit.
- The Supabase project is hosted in `ap-northeast-1`. Backups and recovery were not independently verified.

## Priority 0 / important access decisions

### GitHub release governance — confirmed gap
**Finding:** repository is PUBLIC and repository rulesets API returned an empty array (`[]`); branch protection read returned a 403 and could not be independently verified. Public code is not inherently insecure, but this exposes source to everyone and creates a supply-chain risk if credentials are ever committed. Ownership and release privileges are important because pushes to `main` trigger production deployments.

**Action for GitHub owner:** `Settings → Rules → Rulesets → New branch ruleset` targeting default branch `main`:
- Require a pull request to merge, at least one approval, dismiss stale approvals, require **Code Owner review** for owned paths, and require conversations resolved.
- Require successful checks `build-and-test` and CodeQL once its first scan succeeds; optionally require up-to-date branch before merge if it does not disrupt the team.
- Block force pushes and deletions; restrict bypass to the repository owner/admin only when necessary.
- Enable 2FA/passkeys on GitHub and Cloudflare, Vercel and Supabase logins; audit/revoke unneeded OAuth integrations and personal tokens. Avoid granting broad admin permissions to bots.
- Choose whether to make the repo private for proprietary IP. This is a business decision, not a prerequisite for safe source code.

**Staged:** `.github/CODEOWNERS`, `.github/workflows/codeql.yml`, `.github/dependabot.yml`, regression tests. CODEOWNERS *does not enforce review until branch protection requires it*.

### User passwords — confirmed Supabase warning
Supabase Security Advisor says **Leaked Password Protection Disabled**. Enable in `Authentication → Settings → Password Security` if available for the project's plan and verify existing user sign-in remains functional. Use a sensible minimum password strength, short/appropriate session expiry and admin MFA. No changes to Auth provider settings were made here.

Username-only accounts use synthetic email addresses and lack standard email password recovery. Add a verified account-recovery process or allow users to attach verified email/passkeys. Do not implement a reset endpoint based only on a username or player DM assertion.

### Private campaign artwork — confirmed scope mismatch
The `storage.objects` policy `campaign members access artwork` permits an authenticated member to read any file in `tabletop-artwork` under their campaign ID. This includes **DM `npcs/` artwork** if the path is known. Storage being a private bucket only prevents truly public access; it doesn't make all files secret from members.

Proposed safe redesign (requires gameplay/UX acceptance):
1. Keep DM library art under a separate DM-only bucket/path or restrict the `npcs/` folder to DMs.
2. When an NPC token is revealed, publish/copy an explicitly shareable token image under a player-visible path, or build a path policy based on visible assigned-map tokens, so players can still see revealed token artwork.
3. Preserve player character image sharing as required by the game, but restrict private/unassigned portraits if user privacy demands it.
4. Test one DM and two unrelated player accounts for visible and hidden NPCs, hidden maps and past sessions. Do not revoke the entire campaign-art read policy before implementing the visible-image delivery path.

### Privileged RPCs — audit needed
The Supabase Advisor reports **19 `SECURITY DEFINER` functions executable by `authenticated`**. Selected definitions of create/join campaign, die rolls, NPC quick adjustments, token monitor values, token reference, macros, weapon/spell rolls and NPC lookup were reviewed and contain membership/role checks; the token update trigger enforces allowed owner changes. No unauthenticated public privileged RPCs were found. This is not proof of correctness for every function, including all argument and cross-campaign combinations.

Before rollout of sensitive DM-only features, add role-switched integration tests across:
- Signed-out, DM A, Player A, Player B (same campaign), and Player C (different campaign).
- Hidden map/visible map combinations and moved/hidden tokens.
- Private character/NPC data, token monitor/quick-edit functions, item grants, macros and chat.
- Denials for cross-campaign UUIDs, reused invites, stale membership and revoked sessions.

### Private data retention and recovery — not verified
Document retention/deletion for user accounts, campaign content and uploaded art. Implement a supported self-service export and verified account deletion flow including storage cleanup. Confirm Supabase backups, restore options, recovery objectives and access logs. **Do not** store admin keys in the browser or give direct browser access to administrative APIs.

## Priority 1 / hardening follow-ups

### Cloudflare scope and environment isolation
Cloudflare currently protects signup through Turnstile only. **The app is on `*.vercel.app` domains**, so its application traffic is **not routed through Cloudflare WAF**. Vercel's firewall/platform protection and Supabase's server authorization/rate limits remain relevant. Do not treat Turnstile as general DDoS protection.

The live Turnstile widget allows production domains **and localhost / 127.0.0.1**. Split **production** and **development** widgets/keys, keeping production Siteverify hostname allowlists server-controlled; do not derive production approved hostname exclusively from the caller-supplied `Origin` header. Current origin/hostname matching still verifies the token/action but allows the local testing origin. Removing localhost now would break local account signup against the shared production Supabase backend, so coordinate a separate staging backend first.

Keep widget secret only in Supabase Edge secrets. Monitor Turnstile analytics for unusual rejection rates and rotate secrets via a two-key plan without causing signup outages. Current bot protection does not stop authenticated spam or direct Supabase Data API abuse; enforce RLS and per-user limits.

### Vercel
The frontend currently has `nosniff`, `X-Frame-Options: DENY`, Referrer-Policy and Permissions-Policy headers; **no verified Content-Security-Policy**. Design a CSP covering only required Supabase, WebSocket, Cloudflare Turnstile, images/fonts and scripts, test with login and token-canvas features, then deploy. Avoid unsafe-eval.

Preview SSO is enabled. Because Vercel Preview and Production variables currently point to the same Supabase backend, staging/preview UI can access *production* user records through authenticated credentials. Isolate preview/testing in a distinct Supabase project (may incur cost), or strictly limit who can open/use previews. Vercel's default platform DDoS layer remains; custom firewall read returned “Config not found” (no custom configuration was independently confirmed). Avoid turning on WAF rules that could block valid players before testing.

I submitted non-disruptive settings to Vercel's project configuration for `gitForkProtection=true`, `protectedSourcemaps=true` and `directoryListing=false`; the update was accepted, but the normalized project read API does not echo those fields, so the dashboard must be used for independent verification.

### Minimal database privileges
Three user-specific tables (`campaign_map_views`, `campaign_player_maps`, `tabletop_menu_preferences`) still have `anon` table/column privileges, although their RLS policies only allow `authenticated` rows; anonymous row reads remain blocked. Test then revoke redundant `anon` privileges as defense in depth, without changing authenticated policy outcomes. Do not deploy this as an untested production SQL patch.

### Dependencies and code scanning
The repository currently has no tracked `package-lock.json` despite pinned *direct* package versions. `npm install` therefore resolves transitive dependencies at build time, so builds are less reproducible. Generate/review/commit a lockfile in a networked build environment and change CI to `npm ci` afterward. The staged Dependabot and CodeQL workflows make supply-chain vulnerabilities more visible but do **not** replace a lockfile.

For GitHub Actions, use minimal permissions, restrict CI secrets to protected branches/environments, keep `CODEOWNERS` and required reviews, and review dependencies/Action updates rather than auto-merging. CodeQL workflows may need code scanning enabled in Repository Security settings; their actual execution is pending until merged/approved.

## Production release protection
No production changes are required for the staged GitHub workflows. Normal `stage/**` pushes continue through GitHub tests only, preserving `vercel.json` `git.deploymentEnabled` and Vercel `previewDeploymentsDisabled`. Merge only after verification. Do not roll out DM-art Storage policy restrictions, Supabase Auth settings or new CSP without two-player/DM browser tests.

## Manual account security checklist

- **GitHub:** `Settings → Rules → Rulesets`, `Settings → Security` (Dependabot alerts, Secret Scanning, CodeQL), account passkeys/2FA, Actions and GitHub App permissions. Confirm the repository privacy choice.
- **Supabase:** `Authentication → Settings` (leaked-password protection, signup disabled, provider permissions, MFA), `Database → Security Advisor`, Storage bucket policies, backup/restore settings.
- **Vercel:** `Project → Settings → Security / Deployment Protection` (preview SSO, Git fork protection, source map protection), `Project → Firewall`, team membership and MFA.
- **Cloudflare:** `Turnstile → Analytics`, production widget domains, OAuth scopes, developer MFA, audit/account logs.

## Evidence & limits
Live Supabase Security Advisor findings; SQL catalog RLS/policies/role grants/bucket metadata/function definitions; GitHub repo metadata, `main` source tree, rulesets endpoint; Vercel project/domain/team member/environment-variable names; Cloudflare Turnstile widget listing. **No production pen test or account-to-account access test**, and **no secret values were retrieved**. Platform protection alone cannot prove that user data is secure.

Official references: [Supabase security](https://supabase.com/docs/guides/security/product-security), [Supabase advisors](https://supabase.com/docs/guides/observability/advisors), [GitHub repository rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets), [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/get-started/), [Vercel firewall](https://vercel.com/docs/vercel-firewall).
