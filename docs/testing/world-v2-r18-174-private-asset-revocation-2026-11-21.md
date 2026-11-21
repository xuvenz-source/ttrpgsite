# B10-R18-174 — Revocable campaign-private asset delivery and signed URL hardening

21 November 2026. Exact child of all-green [R18-173 draft PR #282](https://github.com/xuvenz-source/ttrpgsite/pull/282) at `486a9224eeb90778421b65dfc8538fdf92977acf`. **NO_GO; original Supabase read-only catalog only, source-only evidence.** Nothing is activated in the application.

## Original Storage and client source observations

The original project currently has **three private buckets**, `battlemap-assets`, `personal-token-art` and `tabletop-artwork`, with eight Storage object RLS policies. Their SELECT policies respectively refer to authorized map viewing, the personal image owner, and member/DM/observed-token access. These direct policies control signing and authenticated requests but do **not** ensure that an already-issued Storage bearer URL is invalidated on member revocation.

The exact `src/SignedAssetUrls.js` Git blob is pinned in the manifest. The current signer invokes `createSignedUrl(path,3600)` (one-hour bearer validity), keeps local URL state for **54 minutes**, and `clear()` automatically **re-signs active subscribers**. Pending signatures are epoch-fenced, but a clear invoked before subscriber unmount can still generate new links, as the dormant R123 teardown already notes. The R123 sentinel/teardown has not been integrated into production runtime.

## What current Supabase Storage documents

- A specific signed URL cannot be revoked individually through the URL API. Delete/move/rename the underlying object to invalidate that object URL; this is disruptive to legitimate users and may be delayed by CDN propagation.
- Storage has dedicated URL signing keys separate from Auth JWT keys. Rotating Auth JWT keys **does not** invalidate old Storage links. A global Storage signing-key rotation followed by revocation of the previous key can revoke **all** affected links, not just one player's, and clients may need refreshed links.
- CDN/browser caches can continue serving previously cached bytes after URL expiry or key revocation. A CDN purge may be necessary. No website can retroactively erase copies a user has already downloaded.
- Authenticated Storage delivery also has caching and JWT lifetime considerations. For strict live permission checks, Supabase describes server-side code (e.g. an Edge Function) verifying current permission before returning the content.

References: [Signed URL downloads](https://supabase.com/docs/guides/storage/serving/downloads), [URL signing keys](https://supabase.com/docs/guides/storage/security/signing-keys), [Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn).

## Preferred future model

For **campaign-private map images and protected token/NPC art**, replace bearer redirects with a server-authenticated media response path that checks current campaign membership and map/observation rights on each new request, serves private Storage bytes from a trusted server credential, sends restrictive cache headers and never exposes service credentials or a new unrestricted signed URL to the client. Care is needed not to make every high-frequency image render trigger a round-trip; load/caching architecture must be benchmarked against the free-tier constraints, movement lag baseline, and real multiuser tests.

`personal-token-art` requires a distinct ownership contract. Removing a user from a campaign must not automatically delete or deny personally owned artwork in their account. Shared token use must be checked against current permission when campaign-private disclosure is involved.

Shortening newly minted URLs reduces risk but is **not** a guarantee of immediate revocation. Already issued one-hour links require a controlled transition (expiry or scoped object invalidation, or project-wide signing-key revocation with CDN handling) before a strict release gate could pass. Emergency global key revocation is a sensitive owner/admin operation and must not be done speculatively.

## Acceptance

Twelve signed-actor/media scenarios in the manifest remain NOT_RUN, including revoked P1, DM/P1/P2, outsider, private map and hidden NPC assets, personal artwork, old issued URLs, CDN and browser caches, global emergency rotation, and stale Realtime asset refresh. A strict promise is limited to **no new server-authorized deliveries after revocation**; previously downloaded content cannot be erased. System design must disclose residual cache latency.

No new gateway, SQL, auth secret, signing-key action, versioned migration, frontend runtime change, QA bootstrap, hosted asset transfer, merge, deploy or paid infra. Existing #220/#212/#223/#229/#231/#218 remain unresolved. AI is the sole technical reviewer, owner separately approves QA and production releases.
