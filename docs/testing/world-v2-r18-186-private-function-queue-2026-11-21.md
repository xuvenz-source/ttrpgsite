# B10-R18-186 — Private privileged function statement review queue (NO_GO)

**21 November 2026.** Direct child of R185 draft PR #294, head dd61712f5784c4f837c801cda3dfafb0938fef0a. Nothing is installed or deployed. R184 sanitized chronology checks matched 83 SHA-pinned historical migrations and 11 structural RPC flags; R185 reconciled the receipt without security approval.

## Why this follow-up

R109's file-level SECURITY DEFINER markers can conflate unrelated functions inside the same migration. The release cannot be approved without reviewing the exact privileged function definitions, final grants and owners, helper call chains, map/campaign/character permissions and effective permissive RLS composition. PostgreSQL SECURITY DEFINER/EXECUTE defaults warrant particular care. R183 identified 12 original DO blocks; R184 only confirmed their source chronology and two dynamic RPC structural rewrites, not their full semantics.

R186 introduces a read-only **per-top-level-CREATE-FUNCTION-statement** queue. The existing unmodified R154 auditor first SHA-256-verifies **all 83** private SQL files against the R111 docket (and checks no approval flags). R186 then rehashes each file before parsing statements, screens explicit SECURITY DEFINER declarations outside dollar-quoted bodies and emits only fixed marker codes: missing function-local search_path, search_path including public, absent direct auth.uid/jwt markers, missing campaign_members marker, dynamic EXECUTE and user-editable Auth metadata. A missing marker is *not proof of a security bug*; helpers may enforce authorization indirectly. A present marker is *not proof of safety*.

The **bounded queue** identifies the first 24 flagged statements by **R111 docket review index (priority sorted, NOT migration chronological position)** plus statement ordinal. It includes remaining-entry and aggregate counts. Neither SQL, filenames, names/signatures, paths, UUIDs, identities nor arbitrary source excerpts are emitted. This captures historical definitions, not necessarily the final effective 67 live privileged RPCs. The historical 83 bodies and original database are never sent to GitHub CI.

## Manual owner-local handoff

On the owner's private Ubuntu WSL, after obtaining the commit-SHA pinned R186 Python file from this draft PR into the existing private workspace, run the following only:

```bash
umask 077
python3 "$HOME/ttrpg-history-private/r186_private_privileged_statement_inventory.py" \
  > "$HOME/ttrpg-history-private/r186-sanitized-report.json" &&
cat "$HOME/ttrpg-history-private/r186-sanitized-report.json"
```

**Upload only r186-sanitized-report.json.** Do not upload or paste original SQL, R111 docket, filenames, function names, credentials, private paths or verbose console logs. If verification refuses, stop and share only the fixed error category, without exposing underlying SQL.

## Hard release gates

This intentionally does not approve a single function, any migration, RLS, signed Storage URLs, owner grant, campaign identity, anonymous/cross-campaign access or hosted SQL. The known fog metadata oracle (#212), revoked sheet owner (#220), unchanged invite rejoin (#223), TRUNCATE/admin bypass (#229) and signed-asset reissuance (#231) remain NO_GO. The AI can triage sanitized findings, but their actual function bodies, runtime policy composition and signed DM/P1/P2/removal/outsider behaviors still require independent private source review and QA-authorized signed testing. Even zero markers cannot clear the release.

No app runtime, historical/versioned migration, original or separate QA database changes, merge, deployment, paid resources or source disclosure. Production remains NO_GO.
