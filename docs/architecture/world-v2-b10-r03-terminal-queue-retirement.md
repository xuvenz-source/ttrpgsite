# B10-R03 — Canonical terminal queue retirement and release-order audit

**Date:** 11 November 2026, Melbourne. **Status:** STAGING ONLY. **Gate B:** NO-GO.  
**Parent:** B10-R02 draft PR #87 at `4837f6a61ccbc1fab94226f5b22c2c48a16aa65f`.  
**Authorization:** Designer delegated release decisions, but staging a candidate does not compel a deployment. The live release stack remains blocked by A06/Gate A, PR #71, uninstalled SQL and unauthenticated browser acceptance. No live SQL, GitHub merges, Vercel deployments, feature-flag activation, paid services or campaign fixtures are changed here.

## Failure explained precisely

The existing B08 final-commit function may leave an actor's entire previously approved path queued in private B07 tables when the global physical-publish budget is depleted. A later *identical* Commit ACK replay drains those paths **after** a viewer has accepted an authoritative canonical sight. When a stale route starts at precisely the signed current coordinate, B10-R02's source-only origin fence cannot distinguish that old route from a new gesture. The resulting cosmetic movement can rewind a sprite and potentially force a renderer resync even though canonical data remains correct.

Supabase's current Realtime Broadcast architecture writes database-originated messages into `realtime.messages` for logical replication, and private channel authorization controls who may subscribe; it is **not** itself a browser sight grant. The existing app's per-viewer `get_world_visibility_v2` remains the signed source of current canonical token positions, fog and authorized roster. See [Supabase Broadcast](https://supabase.com/docs/guides/realtime/broadcast) and [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization).

## Implemented decision

Create the NONAPPLIED private candidate `supabase/candidates/world_v2_b10_r03_terminal_queue_retirement.sql` that replaces only **`forge_world_v2.drain_committed_observers_b08(uuid,timestamptz)`**.

This function is invoked by the already-staged B08 public Commit RPC after it successfully writes the canonical positions and marks the session committed. It:

1. Locks the committed session under `actor_id=auth.uid()`, validates actor ownership, terminal status and expiry. No new public RPC, service key or schema privilege.
2. Preserves B08's same-transaction low-latency *initial* attempt of up to four previously LOS-authorized frames per recipient, across at most 32 normal direct recipients. This happens inside canonical Commit before the new endpoint is visible to any *later* signed sight. A previously sent frame is rejected by the receiver's monotonic viewer cursor if it arrives late.
3. Iterates **all** remaining terminal queue rows under locks and permanently retires *every* unsent coordinate-bearing path. The source bounded queue still contains no more than 64 queued frames per session. No new session/path can depend on those old frames after commit.
4. Conservatively retains only **already-certified, deduplicated, coordinate-free hide items**, checks their original private B07 schema, clears all deferred path frames, and opportunistically attempts one priority hide per recipient. If that budget is exhausted, the private queue contains **hides only**, which may be retried by the actor with an identical final ACK; B10-R02's existing authenticated sight fallback can independently reconcile the roster without the actor.
5. Catches nonfatal broadcast failures in a scoped subtransaction and still attempts terminal path retirement. On extraordinary database errors that prevent the retirement itself, the public B08 wrapper's existing error handling may still leave residual rows. This is not a hard availability guarantee; the final release needs a fail-closed fault-injection/reconciliation gate.
6. On an exact Commit ACK retry, no path data survives to be published; only previously certified hides may be retried. A changed endpoint, sequence, map revision, permission generation or a foreign actor remains denied under the unchanged B08 public wrapper.

The private function remains `SECURITY INVOKER` with explicitly revoked browser roles. The existing B07 recipient LOS+membership filter is still checked before every hide/path send, and the client is still receive-only.

### Security and performance consequences

- In the normal budget-available case, the bounded final frame flush retains the previous smooth observer behavior. Under **total budget exhaustion**, remaining queued cosmetic paths are dropped once a canonical commit succeeds, preventing an old committed session from overwriting a newer signed state in a subsequent retry. B10-R02 must be enabled **together with** R03 only after validation because its 6-second canonical sight refresh is the fallback that catches up an observer if all terminal frames were missed. Deploying R03 without matching client recovery could leave observers visually stranded.
- When server budget itself is saturated, priority hides may also be delayed. The independent signed sight provides eventual revocation while the client is foregrounded, connected, authorized and the database is reachable, **not** instantaneous concealment under an offline/browser-throttled condition. Treat this as a security and UX launch blocker until real authenticated fog/LOS tests pass.
- B07 physical publishes (20 regular + 10 hides per second) are **not** equivalent to billed Realtime messages under per-recipient fanout. Test 3+ authenticated players and multi-tab viewers against project limits and Supabase memory. The client recovery flag remains OFF by default.
- Existing tests cannot prove error-handling behavior under real Postgres logical replication outages, postcommit concurrent transactions, malicious compromised actors or overlapping signed-fog updates. Do not advertise p95 gains or zero flashing without a real benchmark.

## Exact cross-candidate SQL/migration order

**Isolated PostgreSQL 17 candidate order:**
`B03 path validator → B07 per-recipient budget/private queue → B08 exact Advance/replay/atomic Commit → B10-R01 private Advance Core integration → B10-R03 terminal queue retirement`.

The historical B04, B07 and B08 hostile SQL tests are preserved at their *original* positions **before** their deliberately superseding candidates. The R01 hostile tests run after R01 installation. New `tests/world-v2-b10-postgres/terminal-r03.sql` tests R03 after installation. This explicit ordering avoids fraudulently calling older test expectations (which *require* queued path persistence after exhausted budget) regressions when the new terminal policy intentionally retires them.

Live read-only `pg_catalog` verification on 11 November 2026 still shows:
- `forge_world_v2.advance_core_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)` exists and remains private `SECURITY DEFINER`, without B03 installed/wired.
- Public `advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)` and `commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)` exist as `SECURITY DEFINER`, exact original signatures.
- `get_world_visibility_v2(uuid)` remains the existing signed sight source.
- Private `validate_motion_path_batch_b03`, B07 queue/budget, B08 drain and R03 retirement are **absent** from live database. The live release has 83 migrations, latest version `20261109171247`.

**Do not copy candidate SQL directly to production.** A future explicitly reviewed, forward-only migration must discover the current migration aliases, verify compatible existing function ownership/signatures and grants, manage the client/backend feature-window safely, and include recovery if only some SQL is installed. Since R03 will retire queued paths, its safe deployment is **coupled to a tested and enabled B10-R02 sight fallback**, not an independent backend hotfix. No migration file is created in this microstep.

## Isolated regression acceptance

`tests/world-v2-b10-postgres/terminal-r03.sql` contains **14 positive/adversarial assertions**, including source-real actor Begin, approved Advance, old normal-budget four-frame final drain, exact replay, fully exhausted budget path retirement, a *new* gesture after canonical commit, no old-frame resurrection on earlier ACK retry, certified hide preservation after an artificially interrupted deferred FIFO, hide-only delivery on recovered budget, rejected changed endpoint and foreign actor. All SQL writes in test transactions roll back on an ephemeral PostgreSQL 17 GitHub runner. A separate Node contract test enforces the private-only function, SQL installation order, unavailable live features, 24-case NOT-RUN authenticated matrix and default-OFF client recovery.

## Release blockers after R03

**NO-GO** remains until: PR #71's renderer/observer continuity and permission recovery conflict audit is resolved; B03→B07→B08→R01→R03 staged candidates have a reviewed versioned migration, live-schema preflight and recoverable release order; A06 completes **24 real authenticated DM/P1/P2 scenarios** on a properly published fog/collision/door/hidden NPC/2×2 fixture; motion and hide visibility, deferred-frame stress, reconnect/multi-tab, browser-first-paint p95, map flashing/terrain assignment, Supabase memory and Realtime fanout are measured. Extra ordinary V2 sight polling must demonstrate acceptable Free-tier resource cost.

**Next single authorized microstep:** B10-R04 — review/remediate PR #71 source conflicts and prepare versioned migration/rollback rehearsal without applying anything; then secure multi-account acceptance. No merge or live deployment is justified by isolated candidate tests alone.
