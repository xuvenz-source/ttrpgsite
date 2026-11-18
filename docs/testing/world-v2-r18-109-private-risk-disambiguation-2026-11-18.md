# B10-R18-109 — Private SQL risk disambiguation (NO_GO)

**18 November 2026 — source-only, unmerged, no original/QA SQL modifications or release.**

## Evidence entering this gate

- Operator R18-98 receipt reports 83/83 reconstructed original SQL files and a bounded aggregate SHA-256.
- Independent R18-99 receipt validates the exact same SHA-256 and 83 private local files.
- R18-108 private heuristic receipt reports 83 files with unchanged SHA-256, 10 secret-material marker files, 1 dynamic SQL file and 1 user-metadata marker file among the overlapping privileges, DML, Auth/Storage/Realtime and RLS indicators.
- These markers are NOT vulnerabilities, proof of safe SQL replay or signed authenticated source attestation.
- Original Supabase registered 83 migrations; isolated QA registered zero and zero public application tables on the latest verification.

## Scope

The new operator-local script:

- Re-runs the R18-108, R18-99 and R18-98 original-only private workspace and receipt verification; requires the R18-108 JSON on the operator's private disk to match a freshly computed report exactly.
- Re-hashes each of the 83 private SQL files locally and scans it for narrower *file-level heuristic* markers.
- Distinguishes **service_role textual mentions** from *possible literal credential patterns*. Checks direct public EXECUTE grants, anonymous-scope ACL hints, Auth identity DML, Storage DML, dynamic SQL, SECURITY DEFINER without a textual search_path or auth.uid occurrence, and user-editable metadata coincident with auth.jwt references.
- Emits ONLY numeric file counts, priority-group counts, the original source ref, a fingerprint and explicit NO_GO flags; never includes filenames, SQL, matches, secrets or snippets in output. All secret-like strings remain in the operator's local files.
- Does NOT invoke any Supabase CLI, connect to either Supabase project, apply SQL, download data, or install schemas.

The scanner is not a SQL parser: comments, quoted strings, multiple functions in a single file and indirect authorization checks can cause both false positives and false negatives. In particular, "SECURITY DEFINER without search_path text" and "without direct auth.uid text" are **file-level pattern markers**, not verified function vulnerabilities. A negative credential-pattern result is not proof that no secrets exist.

## Operator procedure

Use exactly the R18-109 commit SHA and existing verified Ubuntu private workspace. Run only after checking that PR head CI passed.

From the repository checkout, with the earlier R98/R99/R108 receipts still under the private directory:

\`\`\`bash
cd "$HOME/ttrpg-r106-operator"
umask 077
node scripts/release/triage-world-v2-r18-109-private-risk.mjs \
 --workspace="$HOME/ttrpg-history-private/r106-original-83-recovery" \
 --r98-receipt="$HOME/ttrpg-history-private/r98-sanitized.json" \
 --r99-receipt="$HOME/ttrpg-history-private/r99-sanitized.json" \
 --r108-receipt="$HOME/ttrpg-history-private/r108-sanitized.json" \
 --ack-source=lwhwgqaunxbmvyndswze \
 > "$HOME/ttrpg-history-private/r109-sanitized.json" && \
cat "$HOME/ttrpg-history-private/r109-sanitized.json"
\`\`\`

Share ONLY the sanitized JSON after checking it contains no unexpected private material. Do not upload any SQL, filenames, CLI logs or credentials. On any failure, stop rather than resetting or retrying against a changed private workspace.

## Remaining independent gates

R18-109 classifies risk; it cannot approve a security/portability review. A private SQL semantic audit must verify exact function bodies and grants; SECURITY DEFINER owner/search_path/authorization logic; RLS and views; Auth/Storage/Realtime and network dependencies; system-table writes, backfills, idempotence, schema dependencies, recovery/rollback; actual secret status and remedial steps. Signed DM/P1/P2 cross-account tests, independent original-source session attestation and separately locked QA-only migration installation remain blocked.

**Historical SQL security approval: NO_GO. QA bootstrap / deployment: NO_GO. Production: NO_GO.**
