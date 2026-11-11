# B10-R06 — migration provenance, single-target release plan and controlled R02 canary

**Recorded:** 11 November 2026 (Melbourne). **Status:** STAGED. **Release:** NO-GO.  
**Parent:** R05 [PR #90](https://github.com/xuvenz-source/ttrpgsite/pull/90) at `b2267a2fd4b06b82711bb036c5ab04795f702bf4`.  
**Designer:** Live campaigns are disposable test fixtures, not real campaigns. This is **not approval to deploy**. Fog confidentiality and account isolation are nonnegotiable.

## Read-only historical audit

Snapshot: `staging/world-v2-b10-r06-history-reconciliation.json` derives from the current 83 live Supabase applied migration **versions/names** and the 62 checked-in SQL file **names** on the exact R05 staging head. It does **not** prove source-body parity.

- **83** live applied; latest `20261109171247`. **62** repository SQL files, **56** correctly 14-digit-versioned files, **55** distinct valid versions, and **6** short-form legacy `20261106_*.sql` names.
- **20** valid files match a remote applied version exactly. **36** valid repository filenames lack an applied version; **63** remote versions lack an exactly matching local filename.
- **24** of the repository-only files share the same descriptive name as an applied remote migration but have another timestamp. This is **name-based alias evidence only**. The actual SQL must be compared before any historical bookkeeping or file rename.
- Two different files share migration version **`20261109000500`**: `batched_concealed_navigation` and `dm_map_npc_protected_columns`. Do not run a CLI command that chooses one by timestamp or repairs the collision without separate source-level proof.
- Existing E05 issue #69 covers missing historical migration source. Do not rewrite history to mask these gaps.

**Fail-closed instruction:** Do not run `supabase db push` or `supabase migration up` against the full repository migration directory, nor `--include-all`, blanket migration repair, replay scripts, file renames or direct history row insertion/deletion. Supabase documents `db push` as applying pending files by timestamp, not a command for a selected SQL filename. [CLI docs](https://supabase.com/docs/reference/cli/supabase-db-push), [migration guidance](https://supabase.com/docs/guides/deployment/database-migrations).

## Controlled future single migration — design only

1. Before applying anything, separately validate the R05 frozen migration SQL digest, exact four-source backup/recovery definitions and the **current live** seven-function preflight. Check that live history is still exactly **83** with latest `20261109171247`, no candidate objects and zero active motion sessions.
2. Complete the **client-first** steps below first. In particular, an all-map R02-compatible frontend must be live and verified before any globally active R03 queue retirement. Old browser tabs/cache builds are a blocker until explicitly qualified.
3. **Preferred operator path when authorized:** use an officially migration-history-recording **single-target** Supabase operation and supply only the exact frozen R05 SQL. The connected `apply_migration` action accepts one `name` and `query`, avoiding scanning older repository SQL files. However, its generated **remote version is not known beforehand** and it must **not** be presumed to equal CLI filename `20261111023204`. Inspect the actual returned version and fresh remote history, and separately reconcile the checked-in filename/source into a new auditable forward record before future CLI pushes. If the operation cannot prove a single atomic tracked version, **STOP**.
4. Alternative only after a separate dry-run proof: isolate just the intended CLI v2.81.3-generated R05 migration in a disposable **file workspace** (not a new paid database), use `supabase db push --dry-run` for the target and require the exact one-file plan. Remote/local version drift may cause this to fail even with an isolated workspace; never bypass it with a history repair. No remote apply in this step.
5. On an authorized apply, require **exactly one** new migration history entry, 4 protected pre-change function definitions and unchanged browser/private grants. Use the current operator-only transactional recovery procedure if necessary. Never report an applied migration without re-reading remote history and function signatures.
6. An applied remote version differing from `20261111023204` is not a success until its exact content and source provenance are reconciled. Never leave two copies of the same executable SQL as pending migrations.

No SQL execution method has been demonstrated safe against the live alias drift yet. This plan explicitly leaves that gate **NO-GO**, rather than claiming the CLI or MCP would preserve the generated filename.

## R02 signed-sight canary now guarded in source

`ObserverRecoveryWatch.isObserverRecoveryCanaryEligible` is a **pure, default-OFF** gate. `WorldV2TabletopRuntime` starts periodic sight recovery only when explicitly opted in. Existing 6-second foreground-only / no-preview / non-overlapping / authenticated observer constraints remain unchanged.

- **Canary one map:** `VITE_WORLD_V2_OBSERVER_RECOVERY=1` **and** `VITE_WORLD_V2_OBSERVER_RECOVERY_CANARY_MAP_ID=<actual test map UUID>`; all other maps remain OFF, including DM preview.
- **All-map compatibility:** after canary passes, a separately reviewed build uses `VITE_WORLD_V2_OBSERVER_RECOVERY=1`, `VITE_WORLD_V2_OBSERVER_RECOVERY_CANARY_MAP_ID=*` and `VITE_WORLD_V2_OBSERVER_RECOVERY_GLOBAL=1`. A wildcard without that second explicit opt-in is OFF.
- **Always OFF before R05 backend acceptance:** `VITE_WORLD_V2_COALESCE_MOTION`, `VITE_WORLD_V2_CERTIFIED_MOTION` and `VITE_WORLD_V2_COMMIT_RECONCILE`.
- All Vite variables are **baked into builds** and not remote runtime toggles. The map UUID is a public client-side routing scope, never a secret or authorization claim: backend RLS, JWT and signed viewer sight remain the security boundary. Never commit test account identifiers, credentials or actual private map IDs.
- When a map is switched, an old map runtime must dispose the watch and the new runtime must independently pass the gate. Misconfiguration fails closed without blocking ordinary movement.

### Controlled live canary acceptance, **not performed**

Use three independently signed-in accounts, **DM / Player 1 / Player 2**, on an authorized prepared test map with published fog and collision. This fixture was previously **NOT READY** (fog/collision off; missing door, one-way barrier and 2×2 token). Protect fog/hidden NPC even for disposable test campaigns.

Measure opt-in vs opt-out map signed-sight RPC counts and foreground/background behavior. Exercise first drag and arrows, observer cross-account roster, permission/ownership revocation, DM player preview, map changes, new/cached browser versions and two parallel browser tabs. Capture sanitized p50/p95 first paint and observer delay, terrain URL assignments, sprite remounts, blackouts, Supabase CPU/RAM and Realtime fanout; never record signed sight bodies or hidden identities.

**Stop immediately** on any unauthorized sight, invalid role grants, stale cross-map frames, revocation delay, whole-map flashing regression, unexpected repeated request load, DB memory deterioration or browser caching incompatibility. A successful **one-map** test does not permit R03 server SQL: first test the separately built all-map recovery mode with equivalent signed Auth/LOS evidence and cached-client compatibility. The A04 **24-case matrix** must still be run after integrated backend release.

## Standard handoff

**STEP:** B10-R06; **STATUS:** STAGED, canary implementation and plan ready for CI; **NO-GO** for release.  
**BASE:** `main@b246b3a72537b53b2afc2a9a38cbe1db3609a8af`; stacked parent R05 `b2267a2fd4b06b82711bb036c5ab04795f702bf4`.  
**SCOPE:** history/name mismatch inventory, guarded test-map/all-map recovery opt-in, source contract tests, release ledgers.  
**SQL / DEPLOYMENT:** NONE; no migration, flags, production merge, Vercel deploy, test fixture mutation or extra paid infrastructure.  
**SECURITY:** signed server authority remains mandatory; real multi-account test and exact history-safe apply still unproven.  
**NEXT SINGLE STEP:** B10-R07 — qualify deployable all-map R02 client/cached-version behavior and single-target migration tracking plan with real distinct DM/P1/P2 readiness; return to designer for separately approved live test deployment.
