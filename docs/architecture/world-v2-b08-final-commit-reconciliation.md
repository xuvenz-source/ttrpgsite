# B08 — Atomic final commit and server-authorized reconciliation

**Date:** 11 November 2026 (Australia/Melbourne)  
**State:** staged / no live SQL / no production activation.  
**Source:** production `main@b246b3a72537b53b2afc2a9a38cbe1db3609a8af`; stacked on unmerged B07 draft PR #82 `48ae888b54682d141a6ec000f450663b1a93362f`.  
**Authorization:** explicit designer instruction “Proceed with B08” approves this microstep **only**. A06 remains BLOCKED and Gate A is NOT PASSED; B08 is not deployment authorization.

## Narrow implementation

1. `supabase/candidates/world_v2_b08_commit_reconciliation.sql` is a **NONAPPLIED** candidate loaded **after** B07. It adds two private server-owned request fields to `forge_world_v2.motion_sessions`: `last_advance_request_b08` and `last_commit_request_b08`. It source-derives the currently deployed V2 public Advance wrapper and atomic Commit implementation without weakening session ownership, scene/permission/rule generation, full swept group collision, checkpoint-writable token/tool updates, stable row locks, RLS, or public RPC signatures. Existing function and schema privileges remain deny-by-default except existing authenticated public RPCs.
2. Advance repeats only an **identical prior request** at the same sequence, scoped to server-validated active session; an altered same-sequence `from`, targets, environment revision or permission generation receives a generic denial. Only actual new advances retain request identity. This addresses B04 H39 in the candidate (not in production).
3. Commit checks the exact final approved endpoint, persists all selected positions **once**, and writes a monotonic `seq` reply atomically with canonical state. A lost ACK retries only the exact same sequence, endpoint and revisions while current actor/map/scene permissions remain valid. Neither same-sequence altered payload nor older/out-of-order requests can reuse a cached ACK. No second canonical write or duplicate private send occurs.
4. After canonical commit succeeds, the candidate calls a **bounded** server-side drain (`drain_committed_observers_b08`). It invokes existing B07 recipient-specific authorization, map membership, LOS and budget checks; at most 4 private batches per viewer/attempt and at most the existing 32 recipients. Realtime failure or budget exhaustion cannot roll back a committed token position or consume a cursor, and retains authorized pending data for an exact-ACK retry. On retry, the same drain resumes. No public broadcaster, cron service, new WebSocket, or paid dependency.
5. Client opt-in flag `VITE_WORLD_V2_COMMIT_RECONCILE=1` (default OFF) allows one identical commit retry on transient transport failure. Exact commit ACK packet shape, session, sequence and endpoint are required. If SQL outcome remains unknown, the controller reports `uncertain`, **never falsely reports success**, does not cancel a possibly committed session, and keeps only the last previously server-approved frontier pending a fresh independently authorized canonical sight. Renderer discards that uncertain handoff when authorized sight arrives. Normal default gameplay does not opt in.

## Isolated security and quality evidence

- `tests/world-v2-b08-postgres/` uses disposable GitHub PostgreSQL 17, original source-extracted V2 Begin/Advance and recipient LOS selector, the actual B07 candidate, and the new source-derived B08 Commit. Checks final canonical token positions, same-request replay, altered request denial, last cursor, bounded drainage, saturated budget recovery, scope revocation and foreign-actor denial. Its minimal test schema does **not** emulate every deployed token trigger or real Supabase Auth JWT/Realtime/fog kernel; it cannot replace real authenticated DM/P1/P2 tests.
- `tests/world-v2-b08-final-commit-2026-11-11.test.mjs` covers disabled-by-default behavior, identical retry payload, forged extra-field ACK, uncertain frontier and authorized-renderer handoff.
- Normal repository CI must still pass tests, lint, npm audit, Vite build and Edge checks on the **exact final PR head**. Do not claim CI green until GitHub Actions confirms it.

## Explicit remaining blockers

- **Hide priority under saturated FIFO:** B07 queues an urgent hide behind accepted earlier frames in some cases; B08's bounded commit drain does not itself prove immediate concealment. The per-viewer sight publisher revalidates current LOS on each send, but eventual hide/resync latency under quota pressure needs dedicated adversarial validation before B10. Never release with a potential hidden-piece retention issue.
- **Budget exhaustion without an actor retry:** a completed session can retain deferred progress until retry, expiration or authoritative sight refresh. This staging candidate does not claim a guaranteed 5 Hz observer stream or eventual flush without a trigger. B10 must prove canonical remote continuity and define safe priority resync/recovery; otherwise stop release.
- **Canonical freshness and renderer continuity:** an unconfirmed commit yields control to new signed sight. Race, reordered snapshots and multi-tab cases require real browser testing. The existing confirmed-commit sprite handoff remains unchanged.
- **Release dependencies:** B03/B07 nonapplied SQL, B05/B06 opt-in builds, PR #71 separate security amendments, three-user A06/Gate A and integrated B10 security/SQL/CI qualification. No live migration, public grants, Vercel flag, campaign test, PR merge or production deploy is authorized.

**Next microstep:** B09 — keyboard/touch/group input parity only once this staged B08 branch is CI-verified; Gate B and release remain blocked.
