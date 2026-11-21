# R18-180 — Per-request user JWT client boundary

21 November 2026. Exact child of R18-179 draft PR #288 at ff469e23aaf7198157145e01da3ea4e1b809d3a8. SOURCE ONLY, NO_GO.

R175 and R176 provided the HTTP gateway and user-scoped Storage authorization. This stage composes them under a factory that creates one request-local publishable Supabase client, calls auth.getUser with the request JWT, and uses the same user's RLS for both resource lookup and private download.

Seven synthetic Node cases cover deliberate concurrent A/B Auth interleaving, forbidden cross-campaign file guesses, revoked membership, rejected identities, malicious payloads, CORS and protected headers. No actual Supabase client is imported or deployed.

Future deployment must pin an SDK, enable verify_jwt, benchmark Free-tier memory, and test real signed DM/P1/P2/revoked sessions. The old bearer URLs remain independently valid. No live SQL, Storage, active frontend or versioned migration changes.

Official documentation: https://supabase.com/docs/guides/functions/auth-headers and https://supabase.com/docs/reference/javascript/auth-getuser
All confirmed #212/#218/#220/#223/#229/#231 defects and original 83/67 semantic gates remain NO_GO.
