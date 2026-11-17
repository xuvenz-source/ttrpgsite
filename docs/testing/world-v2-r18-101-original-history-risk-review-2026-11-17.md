# B10-R18-101 — Stored historical SQL security and portability triage (NO_GO)

**17 November 2026 · direct parent R18-100 draft PR #202 · SHA: 7e40da1dec18fd2d2f2558e0b0ace24dc74a8239**

This is a materially new **SELECT-only** assessment of the *actual 83 SQL bodies stored inside the original Supabase migration history*, not a claim that source files have been recovered or that QA can be bootstrapped.

## Read-only evidence and limits

The original Supabase \`lwhwgqaunxbmvyndswze\` was healthy and exposes 83 registered migration records. We evaluated 83 SQL strings **server-side**, returning only version/name, byte count, SQL-body MD5 and boolean regex presence. Each returned version/name/body digest was compared to the existing frozen R18-08 83-row baseline before committing the metadata-only index. **No raw SQL bodies or player/campaign data were exported, committed or included in chat.** QA \`bgydsamxypjslergfpla\` remains healthy with 0 migrations/0 public application tables and no deployment.

The 83 historical bodies total **709,936 SQL bytes**, with a maximum migration file of **48,527 bytes**. File-level regex screening yielded:

| Pattern detected | Files (overlapping) |
| --- | ---: |
| \`SECURITY DEFINER\` | 66 |
| Access-control statements | 65 |
| Function invocations involving Auth or \`current_setting\` | 63 |
| DML patterns (including statements inside function bodies) | 51 |
| Routine execute grant/revoke patterns | 43 |
| Storage/Realtime/publication patterns | 30 |
| Schema-qualified \`INSERT\` patterns | 24 |
| Auth table references | 12 |
| Extension/schema/role changes | 4 |
| \`user_metadata\`-related tokens | 1 |
| Hardcoded original/QA refs or URL/key indicators in the **limited tested patterns** | 0 |

**Important:** A file with \`INSERT INTO\` may be defining a stored procedure and not executing the insert during migration replay. The static pattern screen cannot reliably distinguish a DML backfill from procedure text, verify individual function \`search_path\`, certify RLS behavior or discover all embedded secrets. The 0 endpoint matches is **not** a complete secret audit or evidence that a replay is safe. The metadata index records flags for every one of the 83 frozen migration versions, without including body text.

## Live Supabase security advisors

The original project reported three distinct lint categories:

- \`authenticated_security_definer_function_executable\` — **WARN, 67 findings**. See [Supabase guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). Authenticated access to a privileged RPC is not automatically a bug, but every callable function must be individually reviewed for authorization, safe \`search_path\`, public execute privileges, revocation, and map/campaign ownership. For the TTRPG World V2 engine, review fog and sight isolation before allowing a QA or production release.
- \`rls_enabled_no_policy\` — **INFO, 15 findings**. See [Supabase guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). Some private schema tables may intentionally have no direct policies; confirm intended grants and RPC-only access rather than assuming a vulnerability.
- \`auth_leaked_password_protection\` — **WARN, 1 finding**. See [password security guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Handle through an independent Auth settings decision, not migration replay. QA currently has no historical application schema and its advisory scan returned no lints.

These counts are current provider observations, not tests of the stored SQL's final applied semantics and not proof of a vulnerability.

## Release decision and next gate

A successful R18-98/99 receipt or R18-100 QA \`--dry-run\` is **insufficient** to approve historical SQL installation. Independent gates remain:

1. Securely recover original 83 SQL bodies into a private, access-restricted workspace with a trusted authenticated source CLI session, then verify full body MD5 and SHA-256 source-to-QA mirror.
2. Review the 66 definer-containing SQL migrations and **all 67 live adviser warnings** with function-by-function source/permissions analysis; review DML/backfills, Auth/Storage/Realtime, RLS, default grants, \`user_metadata\`, migration ordering and reversibility. Re-run advisories on the actual QA schema *after* an approved installation.
3. Run an independently authenticated QA-only dry run against exact empty target ref \`bgydsamxypjslergfpla\`. Use a disposable PostgreSQL 17 clone for any replay and rollback rehearsal first. Do not change the root migrations, repair history, or copy production users.
4. Obtain a separate, explicit QA-only SQL installation gate before applying any historical migration. Pending R05 + seven R18-48 SQL files and optional R57/R77 are separate and uninstalled.
5. Configure QA-only Auth and isolated frontend, test signed DM/P1/passive-P2 fog authorization, movement/true collision, perf p95 and Free memory/locks before proposing release.

**R18-101 is an evidence and risk-triage package only.** Never treat this index or static CI as authenticated source recovery, security approval, completed QA schema bootstrap, or production release. All remain **NO_GO**.
