# B10-R18-119 — Execute exact recovered `join_campaign` privately, in disposable PG17

**18 November 2026. Source-only. NO_GO for QA installation and production deployment.** Parent R18-118 draft PR #224 at `d83c9dcc195594c9de04576f5ffec79ede564580`. The operator-provided `r118-sanitized.json` has passed a separate structural/identity check. This step does not replace security review or remotely execute SQL.

## Accepted R18-118 evidence

- All 83 original historical SQL source files and the private R111 review docket were reverified to aggregate SHA-256 `fe31759c142602047c1813d8ba1868f734138b8f94c773f7f1b6106b5b6bb783`.
- One `create_campaign` definition matches the original current live SHA-256 `0ea1e01ba784dfa78e92c8e82a3ca2b2d28a19920f5286cc7423d1e891be645f` (475 bytes).
- Two historical `join_campaign` definitions exist; the **latest** matches current original live SHA-256 `5f3a7dbcadc4361f59fa814a820b84cfb2cc0d89f685ae6194efe3912d015655` (742 bytes).
- Function name, body hash and source metadata do **not** establish the behavior of the `NOT EXISTS` guard, the actual signed Auth permission semantics, campaign invite revocation, or the human approval of all 83 historical migrations.

## Operator receipt and fixture correction — 18 November 2026

The operator uploaded a sanitized **NO_GO** receipt showing `reportStatus: ERROR`, `safeFailureStage: invitation_behavior_checks` and `safeFailureCode: not_classified`. The test passed private source provenance, local Docker start, scratch schema setup and exact function installation, but **did not complete actual invitation behavior checks**. Consequently the original source's rejoin outcome remains **unverified**.

A read-only live `pg_proc` query checked only booleans (not SQL body or campaign/invite data) and established that `join_campaign` compares the **stored raw** `invite_code` with `lower(trim(p_invite_code))`. Real invite codes are generated using `encode(gen_random_bytes(8),'hex')` (lowercase). The R119 synthetic fixture had incorrectly used uppercase synthetic stored codes. Normalizing the input while preserving an uppercase stored code prevents a match on the initial join; this is a plausible direct explanation for the failure and a definite fixture compatibility bug, **not evidence of a hosted auth vulnerability**.

The source-only repair normalizes all four invented fixture invite codes to 16-character lowercase hex, refuses uppercase/malformed/duplicate code fixtures, and updates the synthetic CI mock to use `invite_code = lower(trim(p_invite_code))` instead of the more permissive `lower(invite_code) = lower(trim(p_invite_code))`. This preserves exact original SQL fingerprint gating, local no-network Docker isolation, the private 83-SQL history, and hosted release NO_GO. Synthetic CI passing still does not mean the exact operator-only source test has run successfully; a new sanitized operator receipt is required.

## Second operator diagnostic and targeted failure instrumentation

The operator's latest sanitized `r119-sanitized.json` again returned `decision:NO_GO`, `reportStatus:ERROR`, `safeFailureStage:invitation_behavior_checks`, `safeFailureCode:not_classified`. The earlier canonical lowercase synthetic invitation correction did not resolve the error. The report contains no behavior outcomes; **no authorization or rejoin result can be concluded**.

The original harness had a single broad stage spanning every first-join, duplicate join, membership removal, rejoin and rotation scenario, and suppressed the SQLSTATE. A new **source-only diagnostic improvement**, still on this draft PR:
- Records a strictly whitelisted `safeBehaviorStep` (including `first_join_rpc`, `first_join_membership`, `first_join_role`, `membership_remove`, `revoked_rejoin` and subsequent safe fixture phases).
- Captures only the five-character PostgreSQL SQLSTATE, using `psql`'s `VERBOSITY=sqlstate` setting, never a private source SQL message, invite code, Docker log, user row or file path.
- Classifies first-join execution failures separately from a missing synthetic membership row or wrong player role. Unrecognized failure codes and steps become `not_classified` / `not_started`.
- Keeps `decision:NO_GO` and `originalOrQaSqlExecuted:false` in the fail-closed receipt, with no original or QA SQL write.
- Exercises a *deliberately failing synthetic-only* PostgreSQL invitation RPC in isolated GitHub CI, proving the diagnostic becomes the safe `first_join_rpc` step and SQLSTATE `P0001` without exporting the exception message.

The private current-original invitation source **has not passed the scenario** and will require another sanitized operator receipt after the final exact-commit CI verifies. Do not modify or export the private 83-file SQL history. A failing source-exact synthetic test does **not** automatically mean the hosted function is defective; test harness schema, simulated auth context and source semantics must be distinguished.

## Third operator receipt: SQLSTATE 42P01 — missing scratch dependency

The latest sanitized-only operator report has `decision:NO_GO`, `safeFailureStage:invitation_behavior_checks`, `safeFailureStep:first_join_rpc` (receipt field actually `safeBehaviorStep`), `safeFailureCode:first_join_rpc_failed` and PostgreSQL SQLSTATE **`42P01`**, which means an undefined table/relation. The exact current private-source RPC DDL was installed in local scratch PostgreSQL but could **not** complete the first joined-player call. No authorized rejoin result or hosted user test exists.

**Read-only original `pg_proc` relation-identifier extraction** (no SQL body/source excerpts) determined that `public.join_campaign` reads and inserts into `public.characters`, as well as referring to `public.campaigns` and `public.campaign_members`. The R119 scratch fixture mistakenly created only the latter two tables. Original `pg_attribute` and `pg_constraint` metadata, queried without fetching any user/campaign rows, established that `characters` has the required UUID `id`, `campaign_id`, `user_id`, text `name`, JSONB `field_values`, timestamp `updated_at`, and nullable portrait/token paths, with foreign keys to `campaigns` and `auth.users`.

**Scratch-only correction:** create a minimal `auth.users` table populated with only the fixed fictitious five test actor UUIDs; create an isolated `public.characters` relation with those verified column types/default constraints and RLS; grant no direct public/anon/authenticated character-table access. The source-exact `join_campaign` continues running as the exact original SECURITY DEFINER with no weakening of source-hash checks, network isolation or release gates. The **synthetic-only CI mock** now performs an analogous character lookup/insertion, and an intentional missing-relation negative test requires the safe `42P01` SQLSTATE with no table name or SQL leak.

This is a **test-fixture dependency**, not evidence of a bug or exploitation in the original hosted function. A new operator-only sanitized receipt remains necessary to establish actual original-source invitation/rejoining behavior. No private SQL files, live account data, migrations, or hosted original/QA SQL were modified.

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
