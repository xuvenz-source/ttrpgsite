# Tabletop Forge — security audit and signup bot protection
Date: 7 November 2026  
Scope: GitHub staging source, live Supabase metadata / RLS / storage / RPC advisory results and Vercel project metadata. **Not** a penetration test or a proof of secure production deployment.

## Summary

The app stores character data, campaigns, private DM content, token art, saved macros and authentication accounts in Supabase. Review treated private DM maps/notes, usernames, membership and user content as sensitive.

### Controls verified from live configuration

- All **18** public application tables inspected have RLS enabled; `tabletop_registration_limits` intentionally has no RLS policy and denies direct client access.
- No public application table without RLS was detected. No public-schema `SECURITY DEFINER` RPC is currently executable by `anon`.
- All three Storage buckets (`battlemap-assets`, `tabletop-artwork`, `personal-token-art`) have `public=false`. Storage object RLS policies gate map access, campaign artwork access and per-account private token art.
- Selected privileged RPC definitions are scoped to signed-in campaign membership, ownership, per-map visibility or DM role; this does **not** prove all privileged functions safe.
- Vercel frontend config contains only `VITE_SUPABASE_URL` and the *public publishable key*, not a service role key. Privileged account creation stays in Supabase Edge Functions, not client JavaScript.
- Vercel preview SSO protection is enabled; production remains publicly accessible by design.
- GitHub Actions runs Node tests, a Vite production build and a Deno check; no secrets were present in the sampled frontend files.

### High-priority findings

**H1 — Signup bot controls and bypass paths**
The current live `username-register` Edge Function has `verify_jwt=false` and calls administrative `createUser`. Its Origin header and IP-derived rate limit are not reliable proof of a human because non-browser clients can supply headers. Stage a Cloudflare Turnstile token and verify it server-side before any privileged createUser call; preserve the existing daily rate limit. *Code staged, not deployed.*

A second potential signup path is Supabase's **native public Auth signup endpoint**. To prevent bypassing the custom CAPTCHA, the administrator must disable direct public signups in Supabase Auth **or** enforce CAPTCHA at every direct signup path; simply adding this widget to the React page does not block Auth requests made directly. Test OAuth registrations separately. Native CAPTCHA protection can also affect password sign-in and password reset, so do not enable it without updating every affected client flow. The existing legacy email-link client flow is changed to `shouldCreateUser:false`.

**H2 — Credential recovery and compromised passwords**
Username-only accounts use a synthetic email address, are auto-confirmed by admin createUser, and **cannot receive password recovery emails**. Accounts with lost passwords need an independently designed recovery and identity-verification process. The Supabase security advisor also reports *leaked-password protection disabled*; enable where available. Require developer MFA and consider user MFA / passkeys in a later auth release.

**H3 — Public source and release governance**
GitHub repository `xuvenz-source/ttrpgsite` is **public**. No GitHub rulesets were reported, and branch-protection details returned a permissions error, so protection could not be verified. Source visibility is a product choice (public code can be secure), but do not mistake it for a private repository. Enable main-branch pull request approvals, required CI, protected deploy credentials and secret scanning; consider making the repo private if proprietary code confidentiality is required, with Vercel/GitHub integration reviewed first.

### Medium-priority findings

**M1 — Privileged Postgres RPC surface.** Supabase advisor reports **19 authenticated-executable SECURITY DEFINER functions**. Some are intentional and have membership / ownership checks, but each callable RPC must be tested with two unrelated campaign accounts, a DM account and a player account to look for broken object authorization. Check map token quick-edit, dice/macros, NPC values and derived monitor values against cross-campaign IDs. Avoid globally revoking functions that the app requires.

**M2 — Excess database grants.** Some sensitive tables expose broad SQL grants to `anon` even though authenticated-only RLS policies currently deny anonymous row access. Stage a privilege minimization migration after confirming which tables and roles depend on those grants. Do not bypass RLS to fix data queries.

**M3 — Campaign artwork visibility.** The `tabletop-artwork` read policy grants campaign-wide artwork access to members, not necessarily per-token or per-map access. If unrevealed monster art must remain secret from players, store DM-only assets separately or attach resource-specific access rules before declaring them private. Battlemap image access follows assigned-map visibility; personal-token-art is owner-only.

**M4 — Browser hardening.** Current `vercel.json` contains only SPA rewrites. Stage CSP and standard browser headers, then test auth redirects, image uploads, map art, canvas and Turnstile. No sanitizer-bypassing HTML injection sink was found in a targeted review of the main React components; this is not a complete XSS assessment.

**M5 — Dependency hygiene and observability.** Direct package versions are pinned, but no committed lockfile was present. CI uses `npm install`, so transitive packages may drift. Stage an npm vulnerability audit, then add a reviewed lockfile and `npm ci` in a separate dependency maintenance pass. Establish alerting for suspicious account creation, authentication failures, abnormal RPCs, and storage upload spikes; avoid storing passwords, verification tokens, access tokens or full IPs in logs.

**M6 — Username-update endpoint.** The authenticated `username-update` function enumerates Auth users to confirm username uniqueness, so repeated calls can cause cost/availability problems as the user base grows. Replace it with an indexed reservation/uniqueness mechanism and enforce user-scoped throttling once database changes can be fully tested.

### Lower-priority / explicit trust boundaries

- Realtime presence is pseudonymized and private token-movement channels use map permissions, but test network subscriptions and reconnects with players switching maps.
- UI checks are for usability; authorization must stay in RLS, Storage policies and carefully reviewed server RPCs.
- Environment JSON containing unrevealed geometry is DM-only in the live database RLS; do not expose it to player APIs when dynamic lighting/vision is implemented.
- CAPTCHA reduces automated abuse, not fraud or all bot traffic. It is not a substitute for Auth/Edge rate limiting, monitoring, and user account recovery.

## Signup CAPTCHA implementation — staged only

1. `src/SignupCaptcha.jsx`: Cloudflare Turnstile widget on **Create account** only. Handles token delivery, errors, expiry and reset; the button is disabled without a valid token. It fails closed when no site key is configured.
2. `src/Welcome.jsx`: sends `captchaToken` in the existing `username-register` invocation. Clears the token after an attempt, disables legacy OTP account creation.
3. `supabase/functions/username-register/index.ts`: obtains `TURNSTILE_SECRET_KEY` from Supabase Edge environment; verifies the token directly against Cloudflare Siteverify with a 5-second timeout, checks returned `success`, expected hostname and `username-register` action; rejects invalid/missing/replayed tokens **before** privileged Auth account creation. Never returns raw internal admin errors to the browser.
4. The registration limiter remains in place; stored daily IP-derived fingerprints are now keyed HMACs rather than easily enumerated hashes. Forwarded headers should still be treated as an **untrusted supplementary signal**.
5. `vercel.json`: stages security response headers and a CSP compatible with Turnstile (manual browser validation required).
6. Tests verify the CAPTCHA acceptance predicate, server-call order, signup wiring, legacy flow restriction and response headers. GitHub Actions additionally performs a strict Deno type-check on the registration function.

### Required private configuration before activation

- In the Cloudflare dashboard create a Turnstile widget and authorize production domain(s), plus localhost for local testing if needed. Obtain a **public site key** and a **private secret key**. Never paste the private key into GitHub, source code, a Vite variable or a client-visible setting.
- Set Vercel `VITE_TURNSTILE_SITE_KEY` to the **public site key** for the chosen preview/production environments.
- Set Supabase Edge Function secret `TURNSTILE_SECRET_KEY` to the **private secret**. If Vercel preview and production share one Supabase project, configure Turnstile hostnames accordingly, or use separate preview Supabase projects for complete isolation.
- Configure Supabase Auth to disable native public signups *after* confirming admin createUser still operates and OAuth account-creation policy is understood. Check the `Auth → Bot and Abuse Protection` controls for any other enabled signup paths.
- Deploy the **updated** `username-register` Edge Function with JWT verification **off** (it is deliberately called by anonymous visitors, protected by CAPTCHA and rate limits). Do not enable the frontend first unless the Edge Function is deployed and its private secret exists.
- Use Cloudflare testing keys / a permitted test hostname, verify valid, missing, expired, reused, wrong-host and invalid-action tokens all behave as expected. Check real browsers including ad/content blockers and mobile devices. Verify previously registered accounts can still sign in without CAPTCHA.

### Release order

1. Verify stage branch tests, production build and both Edge Function type-checks.
2. Configure Turnstile site key and secret on preview environment and a *separate test Supabase project* where possible.
3. Test registration, repeated invalid challenges, account login, OAuth and old email-link account handling.
4. Review Vercel CSP in an actual browser and resolve blocked requests without broadening it to unsafe scripts.
5. Approve and deploy Edge Function, configure Auth native-signup policy, then promote frontend only after successful verification. Never deploy a fail-open CAPTCHA to avoid setup steps.
6. Re-run Supabase security advisor and authorization tests with anonymous, unrelated player, campaign member and DM roles.

## Links to official guidance

- [Supabase CAPTCHA protection](https://supabase.com/docs/guides/auth/auth-captcha)
- [Cloudflare server-side token validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Supabase production security checklist](https://supabase.com/docs/guides/security/production-checklist)
- [Supabase SECURITY DEFINER advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [Supabase leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

**Current assurance level:** read-only live metadata review and static code inspection plus automated staging checks. No active exploitation, production schema modification, account modification, secret rotation or production deployment was performed.
