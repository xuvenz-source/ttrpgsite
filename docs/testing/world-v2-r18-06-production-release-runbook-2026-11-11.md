# B10-R18-06 — Coordinated R18 release runbook and NO-GO gate

**2026-11-11 · Lead developer decision: STAGE / DO NOT DEPLOY.**
This is a procedural staging document, not a production change or designer authorization. R18-06 is based on R18-05 consolidated draft PR #107, exact source SHA `45b057fc70be78f43c610ee0a9688c7a3bce8fc8`. R17 draft #102 and R18-01…04 drafts #103–106 remain unmerged source inputs, not six independent deployments.

## Authoritative live read-only preflight (11 November 2026)

| Item | Observed | Required at actual installation |
| --- | --- | --- |
| Production `main` | `90df8c960e79e8d66c322095611427da7bb09de4` | Exact approved production baseline; stop if changed |
| Vercel deployment | `dpl_3US3Jm1P6iYSnuZeFAUbyLrfrr1g`, READY, exact R16 SHA | Verify exact new deployment and assigned production domain before any SQL |
| Supabase project | Existing connected Free project, no paid/staging database | Keep project fixed; never use external DB |
| `supabase_migrations.schema_migrations` | **83**, latest **`20261109171247`** | 83/latest exact match before a FIRST install; do not repair/rewrite old alias history |
| Active unexpired V2 motion sessions | **0** | 0 at migration moment; close/finish all DM/player gestures |
| B07 observer pending/budget tables, B08 drain, R05 backup, B08 request cache columns | **All absent** | All absent; abort rather than reapply/partially install |
| Seven R05 baseline `pg_get_functiondef` digests | **7/7 exact match** against `supabase/release-preflight/world_v2_b10_r05_exact_live_catalog.sql` | 7/7 exact match immediately before SQL |
| Browser role grants | Anonymous Advance DENIED; authenticated Advance ALLOWED; anonymous and authenticated private schema USAGE DENIED | Must remain true before and after migration |
| Vercel production `VITE_WORLD_V2_OBSERVER_RECOVERY` key | **Not configured** | Must be `1` **in the build serving QA clients before backend migration** |
| Vercel production `VITE_WORLD_V2_OBSERVER_GUARDED_RECOVERY` key | **Not configured** | Remains OFF for initial canary; do not silently turn on |
| Existing combined automation | R18-05 **848/848 tests passed**, CodeQL, V2 isolated PG, source-real PG17 terminal migration/recovery all green | Recheck the **new exact merged source** and fresh migration preflight; no static check counts as real multi-account acceptance |

The read-only query was executed separately, without changing Supabase. Vercel's environment inventory was inspected by **key/target only**; secret values were not retrieved or disclosed. The source migration's explicit prerequisite states `VITE_WORLD_V2_OBSERVER_RECOVERY=1` **must already be running and verified** for test viewers before R05 SQL. That prerequisite is **not currently met**.

Supabase's November 4, 2026 release notes announce major CLI v3 semantics changes. The reviewed R05 SQL was generated and source-rehearsed with **pinned CLI 2.81.3**. Do not casually switch to latest CLI or use bulk `db push`; validate the precise one-file application/registration method against the connected project immediately before an authorized migration.

## Current gate and release policy

- **NO-GO for live SQL. NO-GO for merging PR #107/this branch without explicit designer approval.** The original R18-02 and R18-04 flags are OFF, and 700ms guarded retention has NOT passed real Auth/LOS revocation testing.
- The project uses one existing **live test campaign** and real DM/P1/P2 identities; **no dedicated paid staging environment**. Live database validation is allowed only **after an authorized release**, and its limitations must be reported honestly.
- The read-only 83-version baseline is a necessary but NOT sufficient migration gate: do not assume SQL, RLS and browser behavior are verified merely from catalog fingerprints or GitHub PG17 synthetic tests.
- The consolidated branch currently includes a versioned, nonapplied migration `supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql`. It must not be installed automatically by merge or `supabase db push`, because the remote historical versions are differently aliased. The exact single-migration registrar must be established and reviewed first; if the available tool cannot guarantee the correct version/name and atomic installation, **stop, do not improvise manual migration-history edits**.

## Authorized-release sequence — deliberately staged client before backend

### Gate 0 — Freeze and approve exact source (NO CHANGES before approval)

1. Recheck `main`, all `stage/**`, active `feature/**`, `fix/**`, and `staging/next-release-ledger.json`. Original PRs #102–107 stay traceable but **one consolidated source** moves forward. Confirm no new release-ready work has been silently omitted.
2. Review complete combined diff for private ACL, token roster, hidden NPC/LOS, group movement, signed sight, R17 blocked ACK, client permissions, settings, migrations, dependencies, and preview suppression. Record exact SHA of approved branch and baseline. Keep R18-04 **default OFF** as a separate security gate.
3. Require same-SHA **Node+actual Chromium/Vite/ESLint/Deno/dependency audit, CodeQL, isolated World V2 authority, and integrated PG17 R05 replay/rollback** all successful. Obtain explicit designer approval for **production frontend release** and separately for the **targeted R05 database migration**. Green CI is not automatic deploy approval.
4. Before changing any environment variable, inspect production deployment quota, Vercel preview disable controls, active DB sessions, Free memory/CPU and Supabase Realtime message budget. Record baselines, not guesses. Prepare previous READY Vercel deployment as rollback target.

### Gate 1 — Enable ONLY compatible R18-02 client at production build

5. After frontend approval, set Vercel **Production build-time** `VITE_WORLD_V2_OBSERVER_RECOVERY=1` and leave `VITE_WORLD_V2_OBSERVER_GUARDED_RECOVERY` absent/OFF. A Vite `import.meta.env` flag is embedded at build time; changing an existing environment key cannot toggle it in an already-serving static bundle.
6. Merge the **single approved consolidated branch** to `main` once, triggering one intentional Vercel production build. Do **not** merge the five source PRs individually or enable auto-previews. Verify READY, new exact Git SHA and production domain, and that the client actually issues authorized bounded `get_world_visibility_v2` recovery calls without extra Realtime channels.
7. Open DM / Player 1 / **passive Player 2** using the disposable live test campaign, hard refresh all. Before SQL, prove the new frontend works against the **existing R16 database**: normal arrows/drag, wall collision, fog and hidden NPC protection, DM player-preview remains local, authenticated signed sight succeeds for each viewer, no map leak. Observe at least two R18-02 watch cycles when foreground/idle. Record current Supabase Free RAM/CPU, sight call frequency and p50/p95.
8. If any authorization/visibility regression, wrong environment flag, crash, severe latency/memory increase or missing signed watch is observed, **STOP BEFORE SQL**. Restore previous R16 production deployment and safe Vercel environment configuration through a separately approved operational rollback; no migration was applied.

**Expected limitation of Gate 1:** R18-04 is OFF, so current `unknown-piece` and `sequence-gap` may STILL trigger fail-closed full-map seals. This is an intentionally limited compatibility canary, **not** proof the user's flashing complaint is fixed.

### Gate 2 — Targeted ONE-file backend install (only with separate explicit SQL approval)

9. Quiesce all test gestures. Rerun the exact stored read-only `world_v2_b10_r05_exact_live_catalog.sql` preflight and confirm **83/latest version, 7 SHA/MD5 source fingerprints, 0 active gestures, no partial install and private role grants**. Also confirm the R18-02 watch is **actually serving authenticated foreground clients** and R18-04 remains OFF.
10. With an approved, auditably verified single-file migration runner, install **only** `20261111023204_world_v2_b10_integrated_motion.sql` in its original reviewed dependency order **B03 → B07 → B08 → R01 → R03** as one transaction. The expected database migration record must be reconciled without rewriting old alias history. **Never execute all historical repository migrations or use bulk `supabase db push`.** No anonymous/private schema grant may be widened.
11. Verify the resulting exact installed version, both private B07 tables with RLS and denied client grants, B08 terminal function, original four-function backup count/digests, intended Advance/Commit wrappers, correct current viewer-only Realtime topic RLS and token position checkpoint/commit. Query installed definitions and grants after application, not solely a success message. Halt on missing or unexpected installation.
12. Immediately run the protected DM/P1/P2 test matrix below. Compare before/after movement endpoints, observer convergence, full fog redraw counts and Free memory/CPU. A successful transaction is not itself user acceptance.

### Gate 3 — Recovery and later guarded-feature decision

13. **Before any SQL:** if Gate 1 fails, restore the previous Vercel production deployment; no DB rollback required. **After SQL:** simply rolling back the Vercel frontend may create a version mismatch. Quiesce gestures, obtain explicit incident/rollback authority, execute the reviewed `supabase/release-recovery/world_v2_b10_r05_restore_original_authority.sql` and verify all original function digests/grants. This restores the four original function definitions and retires pending B07 queues but **does not drop all new tables/columns or erase completed movements**. Record the remaining schema and any migration-history caveat. Only then restore compatible client/env settings and confirm player access.
14. R18-04's guarded `VITE_WORLD_V2_OBSERVER_GUARDED_RECOVERY=1` must **NOT** be set during the first release. Its last-signed-view grace may preserve newly forbidden information briefly under delayed role/LOS revocation; JavaScript timers cannot guarantee wall-clock expiry under suspension. This requires a **separate explicit activation decision** after protected authenticated tests; Vite requires an additional reviewed production build for that later activation. If it cannot pass, leave it OFF and redesign. This safety-motivated two-stage activation is an explicit exception to the preferred single-deployment workflow.
15. On success, reconcile `staging/next-release-ledger.json`, deployed commit, actual DB migration ID, active flags, tests, resource trends, unresolved blockers and which original draft PRs are superseded. Do not mark a permission/privacy or user-visible flashing fix as accepted without evidence.

## 24-case live acceptance matrix

The DM moves tokens for observer tests; Player 2 **watches without controlling them**. DM preview is an independent local test and should not be expected on Player 2's screen. Each row requires *expected authorization + converged endpoint + stable fog/visuals + no unexpected hidden entity disclosure*, unless explicitly a reject/revoke scenario.

| ID | Scenario | Pass criterion |
| --- | --- | --- |
| W01 | DM normal arrow movement | DM and P2 final shared token cell agree |
| W02 | P1 owned-token arrow movement | Only permitted token moves; DM/P2 agree |
| W03 | Rapid held arrows & reversals | Every accepted endpoint is canonical, no unauthorized extrapolation |
| W04 | Hold arrow against wall | Immediately blocked; repeated denials do not flood RPCs |
| W05 | Turn along wall after block | First valid lateral move succeeds without stale cursor |
| W06 | DM drag several cells / immediate redrag | No unapproved jump or dragged-token disappearance |
| W07 | P1 drag & release | Own-piece drag works; observers converge |
| W08 | Large 2×2 token collision | Entire footprint blocked, not only anchor point |
| W09 | Closed door and solid wall | Server blocks, no motion through obstacle |
| W10 | Open door path | Server allows only truly opened valid passage |
| W11 | Move near fog boundary | Fog is stable; no hidden wall geometry is disclosed |
| W12 | Hidden NPC enters authorized sight | Appears only when signed viewer roster permits |
| W13 | Visible NPC leaves viewer sight | Disappears under signed visibility/hide; not left in stale grace |
| W14 | Hidden NPC moves outside P2 LOS | No ID, sprite, path or position exposed |
| W15 | Different personal fog/party vision | Each participant gets own authorized frame |
| W16 | DM player-preview gesture | Local to DM; P2 never sees it |
| W17 | Real DM movement while preview exited | P2 sees committed authorized position |
| W18 | Lost intermediate observer frame | Fails closed or recovers from independent signed sight, never replays unseen segment |
| W19 | Lost final private motion packet on quiet map | R18-02 signed watch eventually converges without new movement |
| W20 | Duplicate/out-of-order frame | No stale rewind, duplicate grant or unknown sprite |
| W21 | Permission/role revoke mid-motion/recovery | Immediately seal on detected revocation, no granted new private content |
| W22 | Map/scene revision and revoked map access | Previous private scope not reused |
| W23 | Background/foreground, reconnect, second tab | No leaked stale view, fresh authorized snapshot on return |
| W24 | Two to ten active viewers + repeated movement | Free-tier CPU/RAM/realtime and visibility RPC p95 remain acceptable; no uncontrolled polling |

**Hard stop on any leak, wall bypass, unauthorized movement, stale hidden NPC, rejected sight granting sprites, persistent DM/P2 canonical divergence, RLS widening, migration mismatch, or production instability.** Stop and report failing scenario before further production changes.

Human QA should use a simple application diagnostic control rather than Discord-pasted JavaScript when that control is separately staged and approved; it does not yet exist in this release candidate. Until then, developer-collected opt-in, bounded redacted traces must be labeled DM-moving and P2-passive, never include account secrets or hidden-world coordinates.

## Quantitative observation and communication

- Pre-release DM trace reference: 40 Advance RPCs, p50 ~251 ms; Commit p50 ~1,066 ms; 9 blocked steps. These are **prior field observations**, not guaranteed new measurements or objective speed targets.
- P2 prior trace reference: 51 accepted private frames, 2 unknown-piece, 2 sequence gaps, 4 full resets (312–424 ms), 25 sprite removals + 25 creates; renderer frame p95 ~0.1 ms. **No actual reduction in flashing has yet been proved.**
- Record at minimum: `movement.blocked`, Begin/Advance/Commit/visibility RPC p50/p95, `observer.unknown-piece`, `observer.sequence-gap`, `observer.seal`, `observer.guarded-recovered`, `renderer.opaque`, `renderer.fog-full`, token endpoint agreement, non-player preview isolation and Supabase Free memory commitment trend.
- With 12-second watch, **10** constantly foreground clients could add roughly **0.83 authenticated visibility RPC/s** even while idle (arithmetical projection, not measured). Verify actual request rates and free-tier load before accepting. Higher concurrency or failures can change resource usage.
- A nominal 700 ms guarded deadline is scheduled in JavaScript; browser suspension can extend wall-clock time. Background concealment is an additional guard but does not prove strict revocation timing under all OS/browser conditions.

## Current disposition

**R18-06 planned-release decision: NO-GO for deployment.** Exact order, compatibility and recovery are documented, but client pre-SQL acceptance, approved single-file migration application/registration method, real protected post-SQL behavior, free-tier budget, and guarded-feature safety remain unverified. The designer must explicitly approve each production-changing phase. No staging branch merge to main and no Supabase data/schema modifications have occurred here.
