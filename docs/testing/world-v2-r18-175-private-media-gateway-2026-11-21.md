# B10-R18-175 — Unmounted per-request private-media gateway prototype

21 November 2026. Exact child of R18-174 draft PR #283 at parent 171a23c593081138a86df51aa6f3b6036714b837. **NO_GO.** R174's dedicated, standard and combined scratch CI passed. No hosted SQL/Storage or Edge Function deployment.

Unlike another checklist, this adds a functional, executable, Web-standard request handler in staging/ with ten Node regression scenarios and a fail-closed GitHub workflow. The handler is **NOT imported by any active frontend or backend** and uses only injected synthetic adapters; it cannot access Supabase or real campaign data.

## Security boundary implemented in the prototype
- POST JSON inputs are **only** kind (map-image / campaign-token-art / personal-token-art), resourceId UUID and variant. Caller cannot submit a bucket/path, actor identity, URL or arbitrary object key.
- Each request's Authorization bearer token passes to an **injected authenticator**. A future real adapter must call Supabase Auth getUser and not trust claims from user_metadata. A **fresh per-request resolver** must independently check current campaign membership, map-view, observed-token or personal-owner rights and return the actual record-backed private bucket/path, never a client-controlled path.
- Protected category-to-bucket mapping, canonical path validation, 1KiB bounded request body, restrictive MIME/image signature checks, 8MiB **synthetic configurable** response cap, no 302 redirect or signed URL. Responses include private no-store, nosniff and allowlisted CORS. These values are provisional pending realistic map sizes, free-tier bandwidth and memory profiling. A mock allowlist does **not** prove real database access control.
- Deny before opening private bytes for unknown user, revoked membership, hidden NPC art, wrong map, cross-campaign object guess, invalid path, wrong bucket and storage errors. Retain account-owned personal token art access after leaving a campaign. No stale authorization cache is present.
- Already issued signed URLs, in-flight bytes and local copies remain outside this gateway's revocation ability.

## Free-plan corrections and deployment constraints
Official current Supabase docs list Edge Function memory limit 256MiB and 150-second Free worker wall-clock lifetime (plus CPU limit). Smart CDN is a Pro+ feature, and manual CDN cache purge is also Pro+. Therefore the previous R174 hypothetical CDN-purge transition **cannot be treated as available on the $0 plan**. Source:
https://supabase.com/docs/guides/functions/limits
https://supabase.com/docs/guides/storage/cdn/smart-cdn
https://supabase.com/docs/guides/storage/cdn/purge-cdn-cache
https://supabase.com/docs/guides/functions/auth-headers

This is **not a complete Edge Function**: there is no real Auth adapter, Storage client, SQL resource-to-object resolver, CORS deployment setting, rate limit, signed-account replay or free-tier benchmark. The only safe claim is that ten isolated Node tests exercise the pure contract. Before real deployment, handle existing issued bearer links without assuming per-user revocation is possible and obtain separately approved signed QA.

Remaining confirmed blockers: original #220 sheet-owner, #212 fog metadata, #223 stale invitations, #229 privileged membership, #231 issued links / Realtime, and #218 inventory IDs. 83 historical migrations and 67 privilege chains remain unapproved. AI sole technical reviewer, owner keeps QA and production authorization. No migrations, runtime edits, merges, deployments or paid infrastructure.
