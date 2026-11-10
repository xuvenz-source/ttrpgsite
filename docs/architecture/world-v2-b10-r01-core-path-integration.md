# B10-R01 — Wire B03 private swept-path validator into V2 Advance Core

**Recorded:** 11 November 2026 (Australia/Melbourne)  
**Status:** STAGING CANDIDATE; NO SQL INSTALLED; NO MERGE; NO DEPLOYMENT.  
**Parent:** B10 draft PR #85, source `70a5b40fdd878f100037532373783f280c743ac5`.  
**Authorization:** Designer instructed “Proceed with the necessary steps required to continue”; this is the first bounded B10 remediation. Preserve the workflow's one-microstep-per-handoff discipline. This does not authorize changes to production, Supabase Auth, private campaign data or feature activation.

## Source findings and design decision

The deployed movement authority is an actor-owned `public.advance_world_motion_v2` wrapper that invokes private `forge_world_v2.advance_core_v2`. The B03 path validator had been written and hostile-tested but **was not on the active call path**. B08 staged exact Advance replay and canonical Commit reconciliation; B07 staged recipient-private buffered observer progress. Blindly calling B03 in the public wrapper **and then running the entire legacy Core** would perform duplicate swept wall/collision checks and per-token attribute fetching. That would directly conflict with our latency reduction goal.

**Decision:** Replace only the private Core body, **after** B03 + B07 + B08 candidates, with a short actor-locked authority integrator. It uses B03's private `validate_motion_path_batch_b03` for the sole freshly accepted ordered swept-prefix calculation. The redesigned Core independently maintains the exact V2 public reply and session counters. B08's existing public wrapper remains responsible for exact-payload replay, avoiding duplicate observer sends and keeping the same RPC signature. B08 canonical Commit remains unchanged. No additional client round trip or new Realtime channel is introduced.

## Staged changes

- `supabase/candidates/world_v2_b10_r01_core_path_integration.sql`: **not** in `supabase/migrations/`; source-derived `CREATE OR REPLACE FUNCTION forge_world_v2.advance_core_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)`. Locks same owned session, guards expiry/map/scene/permission and original requested origin; delegates to B03, structurally validates its private prefix, updates accepted cells, attempted counts, batches, route segments, cursor and expiry exactly once, and returns only `version,sessionId,seq,blocked,accepted` to the B08 wrapper. Replays identical approved Advance without revalidating/rebroadcasting. Existing private `SECURITY DEFINER` helper and B03 invoker are denied direct browser EXECUTE/USAGE.
- `tests/world-v2-b10-postgres/run.sh`: disposable PG17 builds **B03→B07→B08→B10-R01** in that order. Runs original B04 hostile fixture before B07/B08 because that historical test intentionally expects an obsolete inert broadcaster and known H39 replay gap. Runs B07 hostile tests before B08, B08 hostile tests before **and after** installing R01, then the B10 integrated checks and dedicated R01 adversarial tests. Every fixture mutation rolls back.
- `tests/world-v2-b10-postgres/core-path-r01.sql`: 11 checks: actual `pg_get_functiondef` B03 delegation, actor Begin, strict source point, max route bound, exact private prefix + monotonic counters + no private route leakage, idempotent same-sequence replay, altered replay denial, other actor, wrong revision, no mutation after denial and private Core ACLs.
- This report, the engineering-progress/release ledgers and a source-contract test. No active migration, grants, user/token writes, Vercel flags or production changes.

## What isolated tests prove and do not prove

**Prove within source-real disposable PostgreSQL 17:** all candidates compile together; the private Core invokes B03 on legal fresh motion, persists only approved prefixes and never spills private collision/route metadata into the public RPC; exact-payload replay remains idempotent; foreign actor and stale revision cannot move the session; B08's commit/recipient queue hostile suite passes with R01 installed.

**Do not prove:** live Supabase performance or actual hardware gestures, three-account Auth/LOS/fog, real production triggers, permission-generation races across physical active sessions, mobile responsiveness, map flashing, Realtime billed fanout or full live schema/migration rollout. B03 remains **absent from production**, because this candidate is deliberately nonapplied. The full B10 release gate is therefore **still NO-GO**.

## Dependencies and next remediation

The proposed future migration candidate order is `B03 → B07 → B08 → B10-R01`. That order is isolated and tested, **not approved for application**. Before release, independently review live `pg_proc` function signatures, original V2 migration aliases and in-flight session compatibility. The Core replacement is type- and wire-compatible, but cannot solve B07/B08 budget-deferred observer delivery without another certified resync trigger.

**Next bounded work:** B10-R02 on observer terminal/hide recovery and guaranteed authorization-safe resync under depleted free-tier Realtime budget. The A06/Gate A 24-case authenticated matrix, separate blocked PR #71, forward-only migration/rollback and free-tier p95 acceptance still block any merge or deployment. No automatic C01 start.
