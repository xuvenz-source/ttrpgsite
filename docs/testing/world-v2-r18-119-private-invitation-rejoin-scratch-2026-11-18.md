# B10-R18-119 — Execute exact recovered `join_campaign` privately, in disposable PG17

**18 November 2026. Source-only. NO_GO for QA installation and production deployment.** Parent R18-118 draft PR #224 at `d83c9dcc195594c9de04576f5ffec79ede564580`. The operator-provided `r118-sanitized.json` has passed a separate structural/identity check. This step does not replace security review or remotely execute SQL.

## Accepted R18-118 evidence

- All 83 original historical SQL source files and the private R111 review docket were reverified to aggregate SHA-256 `fe31759c142602047c1813d8ba1868f734138b8f94c773f7f1b6106b5b6bb783`.
- One `create_campaign` definition matches the original current live SHA-256 `0ea1e01ba784dfa78e92c8e82a3ca2b2d28a19920f5286cc7423d1e891be645f` (475 bytes).
- Two historical `join_campaign` definitions exist; the **latest** matches current original live SHA-256 `5f3a7dbcadc4361f59fa814a820b84cfb2cc0d89f685ae6194efe3912d015655` (742 bytes).
- Function name, body hash and source metadata do **not** establish the behavior of the `NOT EXISTS` guard, the actual signed Auth permission semantics, campaign invite revocation, or the human approval of all 83 historical migrations.

## R18-119 local, source-exact test

`scripts/release/run-world-v2-r18-119-private-invite-fixture.mjs` is **operator-only**. It first rechecks the same original 83-file recovery and private R111 docket using the approved R18-118 private verifier, then reads the tracked frozen migration manifest. It extracts exactly the most recent `public.join_campaign(p_invite_code text)` function definition and demands both current original MD5 and SHA-256, exact body length, plpgsql, UUID return type, SECURITY DEFINER and empty search_path.

If any of those conditions is untrue, no SQL runs. Only that verified function DDL is streamed over stdin to an ephemeral local `postgres:17` Docker container. The script explicitly selects the local Docker socket, requires **`--network none`**, **`--read-only`**, temporary in-container PostgreSQL storage, no host bind mounts, no exposed ports, no new capabilities, a 384 MiB memory cap and 1 CPU cap. All SQL and runtime error messages are suppressed, and the container is destroyed in the script's `finally` block. No original or QA project connection, no real user data, no real invitation codes or hosted database credentials are used.

The synthetic fixture contains two invented campaigns, DMs, players and an outsider. It tests the real `join_campaign` function's invocation under a **synthetic `auth.uid()` GUC** and actual PostgreSQL `authenticated`/`anon` roles. It records sanitized booleans for initial player join, duplicate role preservation, DM role preservation, removing P1's membership row and attempting rejoin with the **unchanged original code**, invalid code, invite rotation and old-code denial, new-code acceptance, null synthetic actor, anonymous EXECUTE and cross-campaign containment.

An observed successful rejoin **after removing P1** is evidence of the original source function's behavior under the minimal synthetic schema, not a live-hosted exploit. It would support a further policy and security correction discussion, but the human and signed-account checks remain unresolved. A failure to rejoin, or failure to initialize the minimal fixture, is **not** proof of secure production behavior.

### Operator command — local Ubuntu (only after PR CI passes)

Requires working local Docker Engine or Docker Desktop's Linux socket and the `postgres:17` image. Does not install packages, alter private SQL, connect to hosted Supabase or create permanent Docker resources. Use the pinned PR head commit rather than `main`.

```bash
cd "$HOME/ttrpg-r106-operator" &&
git fetch origin stage/world-v2-b10-r18-119-offline-invite-rejoin-fixture-2026-11-18 &&
git checkout --detach <R119_VERIFIED_SHA_FROM_HANDOFF> &&
umask 077 &&
node scripts/release/run-world-v2-r18-119-private-invite-fixture.mjs \
  --workspace="$HOME/ttrpg-history-private/r106-original-83-recovery" \
  --ack-source=lwhwgqaunxbmvyndswze \
  --ack-disposable-postgres-only=yes \
  > "$HOME/ttrpg-history-private/r119-sanitized.json" &&
cat "$HOME/ttrpg-history-private/r119-sanitized.json"
```

**Upload only `r119-sanitized.json` if the command succeeds.** Never upload original SQL, full private review docket, Docker logs, table rows, invite codes, access tokens or error details. On failure, simply report `R119 PRIVATE INVITATION FIXTURE NO-GO` and the broad category (Docker unavailable or local verification failed), without logs.

## Known limitations and hard release gates

- This is not a Supabase signed JWT or API test. `auth.uid()` is simulated, PostgreSQL Auth role grants are modeled, and the fixture is a **minimal schema**, not all 83 actual original migrations.
- No true concurrent join, signed revocation, Realtime access, fog disclosure, persistent player permissions, invite-rotation API or rate limit validation is performed.
- The proposed policy that DM removal blocks stale generic-invite reuse until explicit reinstatement remains subject to approval; it is not an implemented migration.
- Original R18-104 fog oracle, R18-114 inventory UUID churn, R18-115 revoked sheet owner access, private 83-history expert semantic review, source-session attestation, all 67 callable privileged-RPC reviews, QA-only history installation approval, signed QA account checks and production release all remain **NO_GO**.

**Never merge, apply the SQL candidate to hosted DB, deploy or pay for resources based on this private fixture.**
