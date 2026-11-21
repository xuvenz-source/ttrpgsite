# B10-R18-187 — Private prioritized SECURITY DEFINER triage, source-only

21 November 2026. Exact child of R186 draft PR #295 head `591b91c18792d120b8ec0aacf50aaf0383fdd9fe`. **NO_GO.** All work remains unmerged, source-only and offline; the actual 83 private SQL files never enter GitHub, CI or chat.

## Source evidence already received

The owner supplied the sanitized R186 JSON, SHA-256 `9cc644f625ab30b4c5b4cdd35a3780b273a7b8ea1917ad321aaa4141eb1abcdd`, 6,428 bytes. It reports 83 SHA-verified original SQL files; 231 top-level CREATE FUNCTION statements; 182 SECURITY DEFINER statements; 158 with at least one lexical review marker. Exactly 70 historical definition statements lack direct auth.uid/auth.jwt markers, 143 lack literal campaign_members, and one contains a user-editable metadata marker. Zero missing local search_path markers, public local search_path markers or direct PUBLIC EXECUTE grant markers were reported. All 83 historical semantics, all 67 currently privileged live function call chains, original/QA hosted SQL and production authorization remain NO_GO.

These are **token-level observations, not vulnerabilities or security approval**. Neither absence nor presence of those strings establishes a safe ownership, membership or campaign boundary. The 182 historical definitions may replace the same functions repeatedly, so they are **not 182 live functions**.

## New prioritized offline report

R187's Python verifier calls unchanged R186 (which calls unchanged SHA-pinning R154), enforces the exact owner-reported R186 snapshot and rehashes every file before constructing a deterministic queue. A source mismatch is an error, never a partial approval. Every entry contains only numeric **R111 priority-sorted docket index (NOT historical migration chronological position)**, statement ordinal, and fixed predefined risk marker codes.

The first 24 entries are sorted into four bounded **investigation** buckets:

1. User-editable Auth metadata marker.
2. Both direct identity and direct campaign-membership markers absent.
3. Direct identity marker absent but campaign-membership marker present.
4. Other lexical review markers.

The full aggregate bucket counts are returned so no other findings are silently excluded. The report never publishes private SQL, user data, function names/signatures, archive filenames, paths, keys or arbitrary identifiers. All approval fields remain false by design. The priority order is not a severity or exploitability ranking, and the report is not a substitute for the final live 67-function ACL/owner/call-graph review.

## Manual checkpoint (only after CI passes)

On the owner's Ubuntu WSL, download the commit-SHA-pinned `scripts/release/r187_private_privileged_priority_queue.py` to the existing `$HOME/ttrpg-history-private` directory. It imports the already-downloaded R154 and R186 scripts from the same directory. Run with a private umask, redirect stdout to `r187-sanitized-report.json`, and upload **only** that generated JSON. Never upload SQL, the docket, credentials, a full local path listing or console debug logs.

## Hard stop

Known unfixed hosted security blockers remain #212 (fog-status disclosure and full private history review), #220 (revoked sheet owner), #223 (invite reuse), #229 (privileged TRUNCATE bypass) and #231 (existing signed-URL bearers/reissuance). No migration installation into original or QA, no signed QA claim, no CodeQL/release shortcut, no merging into runtime, no production deployment or paid resource permission follows from this report. Owner authorization and real signed DM/P1/P2/removal/outsider tests remain mandatory.
