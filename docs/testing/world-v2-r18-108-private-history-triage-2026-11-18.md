# B10-R18-108 — Private offline historical SQL triage (NO_GO)

**18 November 2026.** This is an operator-local **heuristic risk inventory**, not a security review, independent authentication attestation, schema bootstrap, approval or deployment.

## Required existing evidence
- R18-98: 83 recovered original migration files verified locally, fingerprint recorded in private receipt.
- R18-99: same 83 files and SHA-256 independently cross-checked against local R98 receipt.
- Private original-only Supabase workspace outside the Git checkout. No Git copies of historical SQL. Never share SQL, filenames, raw CLI output, tokens, or private directories.

## Scope and safe operation
The script imports the frozen R98/R99 validators and checks both operator receipts and private files **before** scanning. It reads only the 83 verified local migration bodies and emits aggregate counts of boolean keyword/regex indicators. It does **not** invoke a CLI, contact Supabase, write data, perform SQL, mutate the filesystem, or output SQL contents, paths, individual filenames, evidence snippets, credentials or matching lines. Failures are generic to avoid sensitive diagnostics.

Indicators include SECURITY DEFINER, RLS, grants, DML, Auth/Storage/Realtime references, environment DDL, dynamic SQL, service-role/user-metadata strings and endpoints. Categories overlap, and comments/strings may produce false positives; complex SQL may produce false negatives. They are **not** findings of confirmed exploitation or safety. Do not treat a zero count as an approval.

Operator-only command, from the exact R18-108 checkout, after separately verifying project-ref is the **original** and keeping all receipts under the private parent:

```bash
cd "$HOME/ttrpg-r106-operator"
umask 077
node scripts/release/review-world-v2-r18-108-private-history.mjs \
  --workspace="$HOME/ttrpg-history-private/r106-original-83-recovery" \
  --r98-receipt="$HOME/ttrpg-history-private/r98-sanitized.json" \
  --r99-receipt="$HOME/ttrpg-history-private/r99-sanitized.json" \
  --ack-source=lwhwgqaunxbmvyndswze \
  > "$HOME/ttrpg-history-private/r108-sanitized.json" && \
cat "$HOME/ttrpg-history-private/r108-sanitized.json"
```

Share only the sanitized R108 JSON after reviewing it for unwanted disclosure. If any command fails, stop rather than rerunning against a changed workspace.

## Independent remaining gates
Human/private migration SQL semantic audit (including DML/backfills, RLS, SECURITY DEFINER search_path/ACL, ownership/roles/grants, Auth/Storage/Realtime, hardcoded endpoints, transaction behavior, object dependencies and safe QA-only replay) remains **NOT_DONE**. Actual signed original operator session is not independently attested. All 67 privileged current RPCs still require permission review and signed multi-account negative tests. A separate QA-only workspace and dry-run cannot be prepared as an automatic consequence of these counts.

**Original/QA SQL change: NO_GO. QA historical installation: NO_GO. Production: NO_GO. No merges, paid resources or deploys.**
