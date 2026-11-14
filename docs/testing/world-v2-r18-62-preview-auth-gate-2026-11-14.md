# B10-R18-62 — Safe OAuth callback in Vercel Preview (release-readiness gate)

**14 November 2026 (Melbourne) · Source-only staging · production deployment/migrations/flags unchanged.**

## Confirmed facts

- The project user observed Google sign-in on a preview returning to production. That symptom is reproducible as a configuration mismatch, but the actual Supabase Auth redirect URL allowlist has **not** been read: the connected Supabase project tools expose database SQL and logs, not GoTrue URL Configuration.
- In the reviewed source `src/Welcome.jsx` at R18-61, `signInWithOAuth({provider,options:{redirectTo:location.origin}})` and OTP `emailRedirectTo:location.origin` send a bare origin with **no trailing slash**. Supabase's documented Vercel wildcard pattern uses a path `/**`, and their recommended callback example ends in `/`. This makes a no-path redirect a plausible reason to return to the configured production Site URL instead. Official reference: https://supabase.com/docs/guides/auth/redirect-urls
- Vercel project `ttrpgsite` has `ssoProtection.enabled:true` scoped to `preview`, per connected read-only `get_project`; the current latest preview deployment at audit time is an **older R18-40** commit and must not be confused with the integrated R18-62 staging head. Protected previews require authorized Vercel access or a suitably scoped shareable link. Neither is Supabase Google login.
- The 14 nested draft PRs #152 through #165 retain exact direct ancestry with draft/unmerged status and full exact-head CI as reported. Production alias remains R18-35 and 83 Supabase migrations are applied. There is **no release candidate deployment yet**.

## Narrow source fix (R18-62)

`src/AuthRedirect.js` converts ONLY the browser's actual `window.location.origin` into `${origin}/`. It enforces HTTPS on non-loopback origins, rejects credentials, path/query/fragment, and permits HTTP only for loopback localhost development. `src/Welcome.jsx` passes this same result to Google/Discord `signInWithOAuth` and existing-email OTP. It does **not** hardcode production, accept a user-controlled redirect query or inject deployment secrets. There is no new Auth provider, callback handler, OAuth token parsing, identity grant or session storage change.

Unit tests cover production and Vercel preview roots, localhost HTTP only, malformed or credentialed origins, no open redirects, preserved provider availability checks and OTP sign-in parity. **The helper does not and cannot authorize the origin in Supabase**. If the preview return URL is absent from GoTrue's allowlist, the server may still fall back to the production Site URL.

## Mandatory secure operator setup after a controlled integrated preview exists

1. Identify the **specific, approved preview deployment hostname** from Vercel and verify its Git commit. Do not use the older R18-40 preview or production domain for candidate validation. No preview is promoted in this step.
2. Open Supabase project `lwhwgqaunxbmvyndswze` → Authentication → URL Configuration (administrator only). Keep Site URL set to `https://ttrpgsite.vercel.app`. Under **Redirect URLs**, allow only the exact authorized preview root `https://<verified-preview-host>/`, not every `*.vercel.app` host. Exact-root allowlisting is the narrowest fit for this source patch. Do not change the Google provider's Supabase callback URI (`https://lwhwgqaunxbmvyndswze.supabase.co/auth/v1/callback`) to a Vercel preview URL.
3. The Vercel project currently protects preview deployments with Vercel Authentication. On the approved preview deployment use Vercel **Share → Anyone with the link** for selected external testers, or issue explicit access grants. Shareable links are available on Hobby/free plans but may have limits (one active shareable link for some Hobby accounts). The link is a bearer access capability: deliver it only to approved testers, never commit it, disclose it in GitHub issues, or pass it as a Supabase OAuth redirect target. Keep general preview Deployment Protection enabled. Reference: https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/sharable-links
4. A reviewer using an independent P1 browser opens the **Vercel-approved** preview URL, verifies it serves the expected Git SHA, signs in with Google, confirms the final hostname is **still that same preview origin** and not `ttrpgsite.vercel.app`, then refreshes and checks the signed session is isolated from any production-site browser session. Repeat independently with passive P2. A DM-only player preview is not a substitute.
5. If OAuth ends at production, stop. Confirm exact path-root allowlist and original browser origin first; capture only the public redirect target host/path and any non-sensitive error code. Never paste redirect URLs containing OAuth `code`, access/refresh tokens or Vercel shareable-link query strings into tickets.
6. **No integrated R18-57/60 movement+fog multiplayer test** can be declared passed merely because social sign-in works. The linked Supabase CLI 2.81.3 real 83+8 dry-run, signed DM/P1/P2 fog revocation and canonical agreement, free-tier RAM/locks/browser p95 and human release approval still remain independent NO-GO gates.

## Security decision

Prefer an exact approved preview root over a blanket Vercel team wildcard. A wildcard that includes unrelated project previews can potentially send OAuth session callbacks to a hostname the application team does not control. Avoid disabling Vercel Authentication globally. This release readiness fix is small, source-only and additive to existing auth paths; **no database/Supabase Auth/Google Console/Vercel settings have been changed in this step**.
