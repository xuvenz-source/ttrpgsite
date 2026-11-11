# B10-R05 — CLI versioned migration, after-commit recovery and test-campaign release gate

**Recorded:** 11 November 2026, Melbourne. **Status:** Staged, nonapplied. **Gate B:** NO-GO.  
**Parent:** B10-R04 draft PR #89 at `ce49a07c6ee30135e6a38f5fbb3e1e98c7b45450`.  
**Designer context:** Live campaign(s) are disposable testing fixtures, with **no real active campaigns**; restoring progress is not a requirement. **Fog, ownership, hidden NPCs, role integrity, authentication and cross-account information isolation remain mandatory.** This microstep did not merge, enable Vite flags, apply SQL, mutate fixture data, run a Vercel production deploy or buy infrastructure.

## 1. What is ready

The official **Supabase CLI v2.81.3** on an isolated GitHub runner created the precise path `supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql` ([CLI provenance Actions #42946657992](https://github.com/xuvenz-source/ttrpgsite/actions/runs/42946657992)). The versioned SQL is generated from the *exact original staged candidate file contents*, in this order:

1. B03 — `validate_motion_path_batch_b03` server-owned swept collision/permission authority.
2. B07 — recipient-private observer queue/physical message budget, filtered by current actor/map/LOS.
3. B08 — exact replay, canonical Commit and bounded private drain.
4. B10-R01 — private Advance Core delegates its fresh approved prefix to B03 without new public endpoints.
5. B10-R03 — commit-time leftover route retirement and authorized hide-only recovery.

This file has a structural preflight that rejects a missing V2 base, already/partly applied candidates, unexpected private schema/public grants and any currently active movement session. After all five exact candidate bodies, a postflight confirms private table RLS, correct public Advance/Commit role grants, B03 authority delegation and R03 terminal retirement.

**Do not add an explicit transaction=false directive.** Supabase CLI ordinarily runs a migration within a transaction by default; this source contains no independently committing operation. Source: [Supabase local CLI workflow](https://supabase.com/docs/guides/local-development/cli-workflows). The repository's previous source-real B10 hostile suites remain unchanged. This versioned candidate **does not become a request to deploy merely by living under `supabase/migrations`**; staged drafts are not merged or deployed.

### Protected post-commit source snapshot

Immediately before any V2 function is replaced, the migration creates private, RLS-enabled, browser-inaccessible `forge_world_v2.motion_r05_function_backup`, containing **only four exact original `pg_get_functiondef` bodies and digests**: the original private publisher, private Advance Core, public Advance, public Commit. No user campaign content, token location list, Auth session or service key is stored.

`supabase/release-recovery/world_v2_b10_r05_restore_original_authority.sql` is an **operator-only, separately staged emergency script**, not a migration. With movement quiesced and a verified correct R05 install, it restores those four original definitions in one transaction and deletes stale private B07 pending messages while preserving all campaign/character/map data. B07/B08 schema objects and applied history remain for audit; never forge or remove migration-history rows to pretend rollback occurred. If partially committed recovery fails, PostgreSQL aborts it rather than exposing a mixed public/private motion API.

## 2. What was actually tested

The R05 test suite creates a **second independent PostgreSQL 17 database**, with the released-source original `public.commit_world_motion_v2` extracted verbatim. This corrects the earlier synthetic B04 fixture's missing Commit. It performs:

- **Before-commit abort:** load the complete CLI-named versioned SQL inside a transaction, check its original-source backup and private API, execute `ROLLBACK`, and confirm exact original Core/Advance/Commit/publisher source digest and absence of the new tables/functions.
- **After-commit recovery:** reapply the same versioned migration and `COMMIT`, verify four protected exact original definitions, execute the dedicated emergency recovery SQL, then verify all four source digests match the captured original, private RLS remains enabled and no anonymous Advance permission was introduced.
- **Original PG17 adversarial suites:** the separately isolated B04/B07/B08/R01/R03 source-real tests continue, covering owner checks, hidden observer, swept collision, signed path, exhausted budget, exact ACK replay and `realtime.send` failure injection.

Results are from throwaway PostgreSQL **only**. These do **not** establish full live Supabase trigger behavior, actual player account Auth/LOS correctness, migrations of existing active sessions, real Realtime subscriber fanout, real production upgrade under client caches, or the current free-tier resource budget.

## 3. Verified live source and migration-history drift

Read-only live Supabase catalogue inspection on 11 November 2026:

| Measure | Observed |
|---|---:|
| Applied live migrations | 83 |
| Latest applied version | `20261109171247` |
| Versioned repository SQL files on the R05 branch | 56 |
| Exactly matching applied vs file versions | **20** |
| Repo versions not marked applied | **36** |
| Live versions without an exact repository filename | **63** |
| Active movement sessions when inspected | 0 |

The live public Advance, public Commit, private Advance Core, renderer sight function and private observer/LOS helpers match the seven exact captured function digests in `supabase/release-preflight/world_v2_b10_r05_exact_live_catalog.sql`. That read-only preflight executed successfully at the time checked. The original V2 session and observer tables exist, but B03/B07/B08 and R01/R03 are absent.

**Critical conclusion:** Running a normal broad `supabase db push` (especially `--include-all`) against this project risks attempting **historical repo files that do not match live applied aliases**. **Do not run it.** Nor should someone indiscriminately use `supabase migration repair` to mark unknown SQL applied. Before any test deployment, use a **single reviewed targeted migration action**, inspect the exact resulting new remote version and SQL digest, and reconcile the checked-in CLI migration identity with the actual history through a separately audited Git commit. Re-run and compare the exact live read-only preflight immediately before that action.

## 4. Order for a safe live-test campaign rollout — NOT EXECUTED

**Phase A — client recovery compatibility.** From a reviewed, integrated release branch, build and deploy the V2 frontend with **only `VITE_WORLD_V2_OBSERVER_RECOVERY=1` ON**; keep `VITE_WORLD_V2_COALESCE_MOTION`, `VITE_WORLD_V2_CERTIFIED_MOTION` and `VITE_WORLD_V2_COMMIT_RECONCILE` OFF. The existing signed `get_world_visibility_v2` RPC can support R02 before SQL changes. Validate DM/P1/P2 current protected map sight/ownership/revocation and measure extra sight RPC/CPU. Vite env flags are **build-time** inputs: an env change alone is not live until rebuilt and deployed, and older cached clients may still run.

**Phase B — quiescent SQL preflight.** Check that distinct signed-in DM, P1 and P2 can all access their intended separate test accounts. Stop movement gestures, verify zero active session rows, test private-sight permission denied cases, re-run exact source digest/83-migration preflight, and confirm no source drift. Obtain explicit release selection of *targeted* history-safe migration application, not broad repo replay.

**Phase C — exact targeted migration.** Apply only `20261111023204_world_v2_b10_integrated_motion.sql` using a reviewed Supabase migration operation that tracks the one applied migration in history. Stop on preflight error; never suppress schema grants or re-run after a partial install without reinspection. Verify source backup table/RLS, postflight function signatures, exact migrations and owner/session/ACL invariants.

**Phase D — protected acceptance.** Run the full **A06 24-case** simultaneous *independently authenticated* DM/P1/P2 matrix with fog, wall collision, closed doors, 2×2 tokens, hidden NPC, group, touch, arrow, preview, external multi-tab viewers and reconnect. Deliberately saturate B07's queue budget, check no stale path resurrection after Commit and exactly authenticated hide/current sight. Measure first movement paint, p50/p95, map/sprite remounts, terrain URL assignments, fog redraws, Realtime fanout and Supabase RAM/DB pressure.

**Phase E — optional advanced movement flags.** Only after all prior security gates pass, rebuild with B05/B06/B08 flags enabled as independently tested. Recheck browser chunk/caching and live movement again; rollback flags independently if any security, collision or visual regression occurs.

## 5. Recovery if the test-only rollout fails

**Before database commit:** abort the migration transaction and verify original function definitions, no candidate tables and no history change. Tested in PG17.

**After commit:** stop gestures and use the four-function protected backup, turning off any B05/B06/B08 advanced client builds. Run the guarded `supabase/release-recovery/world_v2_b10_r05_restore_original_authority.sql` with privileged operator access; it leaves B07 schema for audit, clears unsent private paths and restores original public/private method bodies atomically. Keep migration history intact, record the incident and use a **new audited forward migration** for the repaired schema. Tested in PG17 but **not yet on live Supabase**. Do not delete real users, fog history, RLS, or campaign data.

The independent canonical sight recovery can remain enabled during the test fallback if acceptable under database load. It never grants fog or hidden actor access without the signed current sight.

## 6. Final release decision

**B10-R05 is staging-ready, not deployment-ready.** The user's clarification that the live campaign is disposable removes concern about preserving real game progress, but does not remove the need for signed account security, fog confidentiality and recoverable migration history.

Open blocking gates: the **83/56/20 version-history discrepancy** requires an exact targeted migration approval path; A06/Gate A's 24 genuine DM/P1/P2 cases are still NOT RUN; R02 feature flag/cached-client preflight and R03 server compatibility need validation; production p95/terrain flashing/LOS/Realtime fanout and free-tier memory remain unmeasured. Continue with **B10-R06: release-history reconciliation and a guarded client-first test canary**, one step at a time. Do not start C01 or silently merge/deploy the entire stack.
