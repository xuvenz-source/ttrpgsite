# B10-R18-03 — Integrate frozen terminal authority with current R16 client

**Engineering handoff · 11 November 2026, Australia/Melbourne**
**STAGING ONLY / NO-GO for SQL execution or production.**

## Source of truth

- Production: `main@90df8c960e79e8d66c322095611427da7bb09de4` (R16).
- Stacked source: R18-02 PR #104 (source `f917526b75f6079b75b68c8244ef1674053602ce`); includes R18-01 incident audit #103. R17 keyboard PR #102 is **NOT** included; it remains independently staged for the final consolidated release.
- Historical integrated backend candidate: **B10-R05 PR #90** at `b2267a2fd4b06b82711bb036c5ab04795f702bf4`, which integrates B03 → B07 → B08 → R01 → R03. **All candidate SQL, the exact CLI-generated versioned migration, read-only preflight, recovery script, and PostgreSQL test fixtures are ported unmodified** with Git blob hashes protected in a new R18-03 test. Do not silently edit the reviewed sources; any amendment requires new source-real qualification.
- The old PR #90 is **not** merged, superseded or automatically closed by this step.

## Live Supabase read-only baseline, checked this turn (no mutation)

- Project: existing connected Free instance; no testing DB is required or requested.
- **83** migration-history entries; latest **`20261109171247`** (as expected by preflight).
- **0** currently active motion sessions at measurement.
- B07 `observer_pending_b07` table not installed; B08 `drain_committed_observers_b08` function not installed; R05 original-function backup table not installed.
- Seven stored authority-function MD5 fingerprints match the read-only preflight source from R05 #90: private `advance_core_v2`, public Advance, public Commit, `publish_approved_observers`, `observer_path_status`, `viewer_on_map`, and signed sight RPC.
- Private `forge_world_v2` schema USAGE remains denied to browser authenticated role; anonymous direct V2 Advance EXECUTE remains denied.
- **This check is point-in-time and not approval to apply**. Rerun before any authorized migration. The live repository migration count/names still diverge: no `supabase db push` / history repair / auto-install. Use only a separately approved targeted, history-safe release process.

## Frozen authority candidate, safety invariants

1. **B03 path validation:** private actor/session-only, swept eight-connected collision and 2×2 footprint/source checks, bounded 64 attempts per batch/128 attempted cells per session; rejects invalid or speculative movement. No client-authorization override.
2. **B07 budgeted private observer queue:** unchanged viewer-specific `world-motion-v2` topic and signed recipient/membership/LOS checks at *send time*; no browser access to private budget/queue tables. Broadcast may fail or exceed free-tier budget; canonical Commit remains authoritative and does not roll back merely because Realtime failed.
3. **B08 exact Advance/Commit idempotency:** distinct same-sequence path/endpoint/revision payloads are rejected; one exact Commit persists canonical x/y under original row locks/checkpoint and swept collision revalidation, then opportunistically drains recipient-private pending progress.
4. **R01 private core replacement:** controls path replay and authorization independent of client prediction; no new public RPC.
5. **R03 terminal retirement:** immediately after an eligible canonical Commit, drain at most four already-certified path frames per recipient while budget permits; then eliminate **all untransmitted old coordinate-bearing path entries** for that committed session across the *entire* queue. Retain only certified coordinate-free hides under original recipient/scene/permission/LOS checks. Exact later Commit ACK replay cannot resurrect a stale path.
6. **R05 transactional installation and rollback:** frozen 14-digit CLI migration file includes original four-function backup and expected pre/post authority and privilege checks. Aborted transaction leaves no partial install; on committed migration the **manual recovery file** can atomically restore original four source definitions from a private RLS-protected backup. This was only proved in isolated PostgreSQL, never on live. No automatic rollback or assumption of reversible effects on player motion already committed.

## Why this is necessary but NOT yet the full flashing fix

R16 passive Player 2 saw 51 accepted private frames, 2 `unknown-piece`, 2 `sequence-gap`, 4 full observer seals (~312–424 ms), and reported position discrepancy. The B07/B08/R03 terminal queue improves ordered, budget-controlled *post-commit* progress and prevents stale coordinate replay. R18-02 introduces opt-in **12-second** signed sight recovery after quiet terminal loss. **Neither guarantees immediate signed roster adoption before a previously unseen NPC path nor guarantees every Realtime packet is delivered.** It would be unsound to label the four blackouts solved merely because terminal Commit now drains. The client must continue to fail closed on unknown roster/sequence gaps; R18-04 needs an independently certified roster/transport transition design and adversarial tests before full movement release.

## Automated staged qualification

GitHub workflow `.github/workflows/world-v2-b10-integrated.yml` runs **only against an isolated GitHub-hosted PostgreSQL 17** instance with mandatory `WORLD_V2_B10_ISOLATED=yes`, `PGHOST=127.0.0.1`, and `PGDATABASE=world_v2_b10`. It executes real-source B04/B07/B08/R01/R03 hostile tests, exact replay and queue-disposition checks, transaction-abort rehearsal and post-commit recovery in a **second throwaway database**. It has **no production connection** and no deploy permissions. A new Node provenance test checks the eight frozen Git blobs and required SQL/RLS/recovery gates. Existing R18-01/02 Node/Chromium, lint, audit, Vite, CodeQL and isolated PG source authority validation must all succeed at this exact branch head.

## Next release gates

- Integrate R17 PR #102 on a single future **consolidated release branch** based on current production. Resolve actual source and behavioral overlaps; do not merge PR #90/#104/#105 independently.
- R18-04: source-real solution for unknown-roster ordering and missed sequence without authorizing unknown pieces or leaking fog; evaluate a terminal viewer-private signed-sight notice and correct event order under limited Realtime fanout. Revalidate spectator fog masking when hidden NPC enters/exits sight. Do not blindly send a notification to all 32 viewers for every hidden actor move (timing leak and Free budget pressure).
- Manual R18 protected matrix: 24 distinct authenticated DM/P1/P2 tests across fog/LOS, hidden NPC, party-shared vision, multi-token/group collisions, 2×2 footprints, exact commit retry, forced budget exhaustion, dropped final Realtime packet, sequence gap, multi-tab, preview locality, private permission revocation, session expiry and reconnection.
- Performance: measure signed sight p50/p95, Advance/Commit p50/p95, observer seal/opaque/fog redraw counters, private Realtime fanout and Supabase Free RAM/SQL under representative 2–10 viewer stress. R18-02's 12-second watch is **OFF** until explicitly enabled and measured. Do not claim instant recovery under network loss.
- Release ordering: approve client with compatible signed-sight fallback ON and advanced mutation flags OFF; verify a few authenticated test viewers; quiesce gestures; rerun exact read-only preflight; targeted R05 SQL application only after separate designer authorization; verify security/backup; run live QA; advance flags only when proven. Existing repository policy forbids requiring paid/test DB, but requires real protected live verification *after* approval.

**Current decision:** **STAGED / NO-GO**. The frozen backend bundle can be reviewed and source-real tested, but neither SQL nor Vercel is authorized to change and this step makes no production modifications.
