# Staged signup Edge Function hotfix — 8 November 2026

**Status:** ready for review only; **not deployed**. Bundled into draft PR #41.

## Confirmed root cause
Supabase `username-register` Edge Function version 6 returned HTTP 500.
The production function logs show:
`TypeError: Failed to normalize algorithm ... 'hash' is required in 'HmacImportParams'`.

After the CAPTCHA and breach checks, the registration rate-limit fingerprint
attempted `crypto.subtle.importKey('raw', ..., 'HMAC', false, ['sign'])`.
Web Crypto requires `{name:'HMAC',hash:'SHA-256'}`; using a string throws.
The uncaught exception also prevented the function from responding with the
origin-specific CORS headers, so the browser reported a generic transport error.

## Fix
- Move fingerprinting to `registration-fingerprint.js`, explicitly importing
  HMAC-SHA-256. Preserve the previous daily input format, secrecy and rate limits.
- Catch unexpected handler errors and return a sanitized JSON 503 with existing
  allowed-origin CORS response headers. Disallowed origins stay forbidden.
- Translate frontend transport errors into an actionable retry/contact message.
- Add real cryptographic regression tests comparing Web Crypto output to Node's
  HMAC-SHA-256, including daily/source variation, missing secrets, and static
  tests for CAPTCHA-before-createUser and safe exception handling.

## Release dependencies
- **No database migration.**
- **Edge Function deployment required.** `username-register` currently version 6,
  `verify_jwt=false`, since registration is unauthenticated. Preserve this setting
  on release and include all 4 function files.
- The frontend error improvement is part of the consolidated PR #41 frontend.
- Verify deployment metadata version increments and use a non-account-creating
  request to confirm CORS/validation. Do not create a test account in production
  without an approved live test.
- No paid testing environment. The user's latest approval was to stage, not
  a production release; no live changes were made.
