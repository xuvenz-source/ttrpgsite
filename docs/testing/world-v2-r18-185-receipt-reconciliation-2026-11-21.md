# B10-R18-185 — Sanitized offline chronology receipt reconciliation

**21 November 2026. SOURCE ONLY / NO_GO.** Exact child of draft [PR #293](https://github.com/xuvenz-source/ttrpgsite/pull/293), head `2aa70db77b7f4eaa42758377bdb5d2be88cbb9d5`. The owner uploaded only `r184-sanitized-report.json`, not the private migrations, docket or credentials.

## Received evidence and bounds

- The uploaded sanitized report was **1,710 bytes**, SHA-256 `d74a306cf306b5c32a5957f800baa86f1da054298a1eaae76c8e284266c26be1`. This is a hash of the JSON receipt only, **not** an independently authenticated capture of the SQL.
- Reported R184 archive SHA checks: **83/83**. Chronological target files: **3**. Executable top-level statements: **937**. DO blocks: **12**.
- All **11** bounded R184 RPC-rewrite flags are true; no SQL, filename, path, secrets, network or database access was reported by the local script.
- No history semantic approval, 67-function approval, signed QA or production release authorization. R184 source-only Actions checks **2/2 succeeded** on exact head (runs 44892360576, 44892360586).
- No claim that the AI directly inspected the 83 private original SQL bodies. Structural report fields are **self-reported** by the private offline tool, which is integrity-checked separately by R154. It does not establish human operator identity or exact postgres replay.

## New fail-closed verifier

`scripts/release/r185_reconcile_private_chronology_receipt.py` checks the supplied receipt's SHA-256, exact top-level/nested schema, boolean types, positive counts and negative authorization flags. It rejects unknown or duplicate keys, altered warnings, inconsistent counts, forged approvals, symlinks, oversized inputs and digest mismatches. Fixed bounded output never contains input paths, SQL or arbitrary user-controlled fields. An accepted receipt **always prints `decision=NO_GO`**.

For owner-local inspection only, from a checked-out R185 tree (the JSON must remain outside Git):

```bash
python3 scripts/release/r185_reconcile_private_chronology_receipt.py \
  --receipt /path/to/your/private/r184-sanitized-report.json \
  --expected-sha256 d74a306cf306b5c32a5957f800baa86f1da054298a1eaae76c8e284266c26be1
```

This is **not another manual prerequisite** for the current handoff: the uploaded JSON's contents were already reconciled. The command exists only as a reproducible later operator gate, and a different digest cannot inherit this receipt's provenance.

## Hard stop and forward work

Do not approve any of the 83 historical migrations based on 11 literal structural booleans; lexical parity does not prove the DO operations, GRANT/REVOKE ordering, effective RLS policy composition, privilege owner/search_path, or runtime safety of all 67 function call chains. Keep issues #212, #220, #223, #229 and #231 blocked. The next security step is *source-real per-function/policy semantic review* in the private workspace, with only bounded findings exported and separate review/authorization before a QA-only installation. Actual signed DM/P1/P2/revoked/outsider QA, signed URL revocation and owner approval remain mandatory.

No original or QA SQL writes, app runtime, migrations, deployment, merge, secrets, private SQL exposure or paid resources in R185.
