# B10-R18-154 — First-party offline private migration assessment

21 November 2026. Draft source-only child of green R18-153 PR #261, exact parent `ad4fe88e0c073541e084349d3deafee8cb4b06a8`.

**Owner direction:** The sole project operator has asked the lead developer to continue technical security assessment autonomously and has no independent reviewer available. We can conduct a first-party risk assessment and build rigorous evidence and automated regression suites, but **cannot represent that as independent human security certification or falsely mark the 83 migrations as approved**.

**No private SQL is uploaded or exported by this work package.**

## Private historical SQL boundary

The original 83 SQL migration files reside only in the operator's Ubuntu `$HOME/ttrpg-history-private/r106-original-83-recovery/supabase/migrations`. The R111 SHA-256-bound docket is in the same private workspace, and prior operator evidence confirmed 83/83 matching hashes, zero independent approvals, and private directory mode 0700. These files are **not present in this repository**; GitHub can neither execute nor inspect them. No original SQL may be copied into a GitHub commit, CI artifact or this conversation.

The new Python 3 standard-library-only local auditor `scripts/release/r154_private_history_audit.py` has no network calls, no subprocess SQL client, no filesystem writes and no database credentials. It reads all 83 expected files and the R111 docket, refuses non-private root permissions, missing/tampered files, symlinks, hard-linked or unexpectedly large files, path traversal and any manually forged approval. It lexically tokenizes top-level SQL statements while respecting quoted literals and PostgreSQL dollar-function bodies. It aggregates potential risks around SECURITY DEFINER search_path and dynamic execution, Storage RLS conditions/OR, broad EXECUTE grants, membership and Auth mutations, Realtime changes, role/extension operations and privilege defaults.

This is **lexical triage rather than deep PostgreSQL semantic verification**: possible false positives and false negatives include SQL in strings, function body comments, EXECUTE-generated SQL, overloaded functions, later ALTER FUNCTION, multi-migration effective privileges, PL/pgSQL control flow, foreign/schema-specific objects, quoted identifiers and RLS policy combinations. A returned count is a review lead, never a vulnerability or an approval. The tool prints only aggregate classifications plus a bounded list of **docket position indices**, not SQL text, filenames, folder locations, account or bucket IDs, credentials, invitations or URLs.

## Local operator invocation (manual only, not now in GitHub CI)

After the PR is fully green, use its exact verified commit SHA to download the script from GitHub `raw.githubusercontent.com`, saving it to your restricted Ubuntu private folder. Then execute:

```bash
python3 "$HOME/ttrpg-history-private/r154_private_history_audit.py"
```

Copy the **entire sanitized JSON output only** back to ChatGPT. Do not upload the SQL files or the R111 docket. An integrity failure prints only `PRIVATE_AUDIT_NO_GO`; on failure stop and request help rather than change any SQL.

The exact pinned download command and verified commit SHA will be provided in the operator handoff after CI. No passwords, Supabase login or API keys are needed. For extra confidence, the source file is fully visible in the public GitHub PR and the synthetic unit tests are repeatable.

## What remains after local triage

We will use the sanitized results to prioritize a bounded first-party semantic assessment and source-only regression repairs. The R153 18 signed-QA tests remain `NOT_RUN`; the original 67 authenticated-executable SECURITY DEFINER functions remain unapproved; known issues #220/#223/#229/#231, old joined Realtime sockets and issued signed URL revocation remain unsolved. A real QA migration rehearsal and external service-role writer checks must be separately authorized; no production deployment can be approved simply because this scanner returned no flags. R127 human final release approval is distinct.

**NO_GO:** zero original/QA SQL changes, zero versioned migration or frontend runtime changes, no browser grants, merges, deployments, paid services, fabricated independent signoff or altered R111 approval status.

## Verification and handoff

GitHub Actions runs the Python auditor exclusively against 83 fictional in-memory-on-disk migration fixtures created in a disposable runner; failure tests cover wrong hashes, symlinks, permissive folder permissions and fabricated approval. CI also runs a manifest/source boundary guard and checks no `src/` or `supabase/migrations/` diff against the exact parent SHA.

Next R18-155 consumes the **sanitized** local results. Until that one operator action is complete, do not infer the original historical SQL is secure.
