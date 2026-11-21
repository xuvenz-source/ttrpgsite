# B10-R18-172 — Synthetic Auth-account deletion cascade and revocation retention test

**21 November 2026.** Exact source-only child of [R18-171 PR #280](https://github.com/xuvenz-source/ttrpgsite/pull/280) at `5126e8ccadac4095e2b08c89b66cb77468ecb6ef`. **NO_GO; never run against original or hosted QA.**

The original database has two incoming ON DELETE CASCADE links into `campaign_members`, from `auth.users` and `campaigns`. R121 had already tested campaign deletion and membership revocation, but **not** Auth-user deletion. This stage adds a disposable PostgreSQL17 fixture that models both cascades with synthetic fixed UUIDs and reuses exactly the prior R120/R122/R148/R150 scratch prototypes.

The experiment checks that deleting a signed player's `auth.users` record cascades campaign membership, and whether R120's BEFORE DELETE tombstone trigger retains their deleted account UUID as a revocation entry. **Retaining an identifier of a deleted user is not automatically approved**: determine account-deletion retention/redaction policy, legal obligations and security guarantees before an actual QA migration. If this observation passes, it describes existing prototype behavior, not a recommendation to retain identifiers indefinitely.

It also tests reusing the same synthetic UUID under an unchanged invitation, service_role INSERT/TRUNCATE denial, deleting the campaign owner from Auth (which cascades the campaign and all its members), cleanup of remaining tombstones, and isolation of a second campaign.

Isolation: the GitHub Actions job uses `postgres:17` on localhost with a fixed synthetic database/password, rejects remote Supabase configuration, uses **no Supabase client/session tokens**, and never runs original SQL. The QA project stays without schema/migrations. 14 real-role QA cases in R171 remain NOT_RUN regardless of this synthetic job's result.

Do not merge or release this code just because ephemeral tests pass. Release still requires complete historical semantics, other privileged RPC chains, signed revocation tests, free-tier resource validation, and separate QA/production approval. No new runtime SQL or versioned migration, hosted writes, deployment, paid infrastructure or production signoff.
