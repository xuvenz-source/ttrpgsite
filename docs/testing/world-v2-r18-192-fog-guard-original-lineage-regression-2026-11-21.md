# B10-R18-192 — Private R191 history → live fog RPC → existing R104 repair candidate

21 November 2026. Exact child of R191 [draft PR #300](https://github.com/xuvenz-source/ttrpgsite/pull/300), final source head `8cb0da0758659df7584f102daf5eb365b765012f`.

## Why this is not another proposed fix

The operator supplied **only** `r191-sanitized-report.json` (1,820 bytes, receipt SHA-256 `2087f092686f6243bd0210cb9de2fca408739abc638bd1d68bd1faf0a7bcf377`). Strict local JSON contract reconciliation passed. The owner-only offline hash audit reports **83/83** historical migrations verified, all 83 names with distinct valid 14-digit chronological timestamp, and **one** directly declared historical `is_map_fog_published` definition. Its latest direct declaration, **R111 priority-sorted docket index 50, executable statement 57** (not chronological migration 50), uses `SECURITY DEFINER`, has no direct caller identity/campaign-membership/map-view-helper marker, and its SHA-256 and byte length match the original live PostgreSQL `pg_proc.prosrc`: **102 bytes**, SHA-256 `767cbcd8bd4813c0a535fa71bf1ecc3a9cf8a6dd02c239499c0be1737a28c96f`.

The existing R104 [draft PR #206](https://github.com/xuvenz-source/ttrpgsite/pull/206) already contains the candidate guard `staging/world-v2-b10-r18-104-fog-guard/unapplied-fog-status-guard.sql` Git blob SHA `c84d7cf8b0958621f11ec273cb36361e2501a77f`. It maintains `is_map_fog_published(uuid)`, STABLE/SECURITY DEFINER/empty search_path/authenticated-only EXECUTE, checks both actual map campaign binding and private fog rules plus `can_view_campaign_map(campaign_id,map_id)`. **Do not revoke authenticated EXECUTE without replacement**: historical combat-roster RLS uses this function.

R105 [draft PR #207](https://github.com/xuvenz-source/ttrpgsite/pull/207) already executed the **exact same candidate** on disposable, loopback-only PostgreSQL 17. Its 12-case simulated authenticated DM/players/outsider/revoked access matrix reproduced the historical cross-campaign fog-status disclosure and demonstrated that the candidate closes it while retaining legitimate combat roster RLS. The intentionally restored insecure original **reintroduced** the leak in the scratch DB; the candidate's reapplication closed it again.

R192 *pins* this history-to-live-to-repair chain, instead of writing a second conflicting candidate or trusting only lexical absence of `auth.uid`:

- Original operator R191 receipt SHA and fixed bounded fields, **not** private SQL/body/signature/file names
- Exact previously independently read-only live 102-byte `pg_proc.prosrc` fingerprint
- Frozen **Git blob SHA-1** of the original R104 candidate, plus the unchanged R105 PG17 extractor/runner/12-case test SQL
- CI enforces the old R105 fixture's exact source SHA against prior live `pg_proc.prosrc` and runs the actual R104 guard, original combat RLS and synthetic users on a disposable PostgreSQL 17 service
- Fail-closed Python validator refuses source drift, altered receipt, upgraded release flags or restoring the insecure historical function as a production rollback

## What this does NOT prove

This is not a semantic audit of all 83 migration files, signature/overload graph verification, production live ACL/RLS approval, real Supabase JWT sessions, signed DM/P1/P2/revoked/outsider acceptance, Storage signed-bearer revocation or Free-tier RAM performance. Only the operator's private SHA tool reads the historic originals; R192 GitHub CI uses versioned Git fixture sources and synthetic data.

R191 output explicitly leaves historic/67 privileged call-chain/real signed QA/QA SQL/production authorization **false**. The ongoing confirmed blockers #212, #220, #223, #229 and #231 remain **NO_GO**.

## Restrictions / next review

No original or QA hosted SQL writes, no root active migrations, no application runtime, no Supabase Edge Function, no Vercel deployment, no PR merges, no paid resources. The original database is not used by the R192 CI jobs. The disposable scratch Postgres service and its fabricated users are discarded after checks.

No further WSL upload is needed for R192: the prior operator R191 receipt was already provided. Subsequent QA schema installation requires separate owner authorization after the private 83-file semantic review and source-reconciled pending migrations; signed real-user fog tests must run only on the approved isolated QA environment. Never roll back to the vulnerable original.
