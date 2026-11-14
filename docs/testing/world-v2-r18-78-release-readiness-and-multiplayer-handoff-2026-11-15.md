# B10-R18-78 — Verified read-only release inventory and genuine multiplayer QA handoff

**15 November 2026 (Melbourne) · Draft-only / NO DEPLOY · direct parent B10-R18-77 PR #179 exact SHA `23d1d39b0f9f01b50c3c801a783e39371fdd7e80`**

## Engineering decision

Stop creating further speculative runtime optimizations. R18-77 has two source-pinned and reversible **unversioned SQL candidates**, tested successfully in disposable PostgreSQL 17 against real original source bodies. They are **not installed**. The actual release blockers are now the official linked Supabase CLI migration rehearsal, independent signed multiplayer safety/performance evidence, canonical Vercel build reconciliation, Supabase Free physical RAM/lock budget and explicit operator approval.

This step records source-backed **read-only** observations and provides an offline **NO_GO-only** validator. It creates no migrations, SQL writes, preview deployments, main merge, user-visible runtime code or production changes.

## Read-only backend evidence (not a release transaction)

At **2026-11-14 15:12:23 UTC**, `supabase/release-preflight/world_v2_b10_r18_50_live_readonly_evidence.sql` was executed as the previously reviewed single SELECT-only statement against connected project `lwhwgqaunxbmvyndswze`. Its result was compared against the checked-in R18-08 frozen history. The result:

| Check | Verified at this snapshot |
|---|---|
| Supabase project | `ACTIVE_HEALTHY`, PostgreSQL 17.11 |
| Current registered migrations | **83**, newest `20261109171247` |
| Frozen historical migration names, body MD5s and statement counts | **83/83 matched** |
| Critical original motion/collision/observer function definitions | **10/10 MD5s matched** |
| R05, R18-20 affinity guard, R18-28 finalize RPC and R05 backup/queue | Absent, as expected pre-release |
| Active signed motion sessions | **0** |
| Waiting database locks | **0** |
| Database sessions / configured maximum | **7 / 60** |
| Internal V2 schema USAGE for `anon`/`authenticated` | Denied |
| Authenticated movement RPC execution | Retained |
| Anon movement RPC execution | Denied |

These are *point-in-time observations*. In particular, **7/60 sessions does not establish physical RAM headroom, swap health, capacity under concurrency, connection pool saturation or end-to-end browser latency**. R18-77's source-original `ray_blocked` was separately checked via read-only catalog and remains unchanged; no released SQL has been installed here.

The official CLI 2.81.3 linked `migration fetch`, `migration list` and `db push --dry-run` have **not occurred in an authenticated operator session**. A connector's read-only `list_migrations` and local synthetic 91-history test cannot substitute.

## Exact narrow 83 + 8 migration inventory

The reviewed R18-48 narrow manifest at `staging/world-v2-b10-r18-48-narrow-pending/manifest.json` still defines **R05 + seven** pending files:

| Step | Exact version | Candidate |
|---|---|---|
| 1 | `20261111023204` | Frozen R05 V2 integrated motion (currently in active repo `supabase/migrations/`) |
| 2 | `20261113021005` | Original sources captured |
| 3 | `20261113021007` | Wall edge clearance |
| 4 | `20261113021010` | Cross-map collision guards |
| 5 | `20261113021012` | Campaign affinity |
| 6 | `20261113021020` | Atomic finalize RPC |
| 7 | `20261113021022` | Blocked terminal semantics |
| 8 | `20261113024116` | Narrow release seal |

**Do not introduce** excluded R18-26 step-bounding prefilter `20261113021015` or R18-27 commit-empty-work shortcut `20261113021017`; both were excluded due mixed results. **Never run repository-root `supabase db push`**: existing repository-root historical migration timestamps differ from the 83 remote registered timestamps. No `migration repair`, `migration up`, `apply_migration`, direct data changes, SQL Editor DDL or bulk replay.

When an approved operator session becomes available, use the already documented isolated private workspace procedure in **R18-51**. Discover command flags from the real pinned CLI's `--help` rather than assuming support. Confirm target project, fetch the actual 83 remote SQL bodies, verify fresh hashes and assemble the exact 91-file workspace with R18-49. Capture a **fresh R18-50 receipt within 15 minutes**, run official `migration list` and mandatory **`db push --dry-run` only**, and validate the logs with R18-51. Stop. Even a fully passing R18-51 artifact stays **NO_GO**, because signed user QA, RAM/locks, and separate release authorization remain outstanding. Do not post operator credentials or raw CLI logs in a PR.

## Vercel source-of-truth reconciliation

Read-only Vercel deployment and alias lookup shows **`ttrpgsite.vercel.app` currently serves R18-35** deployment `dpl_GtaJ4PoxHzXDpN7L46nka8Kqb8mN`, commit:

`5ca8c83bdef4a5d9870020b0f2b16723f7790e38`

There is a **newer production-target deployment record** for R18-36 `dpl_5GWtYfXnbL4LvkJZqMuKUTStspom` at commit `da078abe7e0e5f28dbb9eeaa5f26fa570fbc7c19`, **but that deployment has no canonical `ttrpgsite.vercel.app` alias**. The repository `main` remains at `90df8c960e79e8d66c322095611427da7bb09de4` and is not itself the current canonical release commit.

These are **three distinct source identities**; do not substitute one for another when selecting QA build SHA, comparing code, rolling back or choosing a release target. Reverify the production alias immediately before any later rollout.

### Release ledger discrepancy

The shared `staging/next-release-ledger.json` was last updated **2026-11-12** and has 66 branch records ending at R18-15, while many later draft staged packages (through R18-77) exist. Its existing rule says release-ready work must not be silently omitted in the next one-shot production bundle. **The ledger is NOT reconciled.** R18-78 deliberately records this blocker rather than changing past branch statuses by guess or declaring all later work release-ready.

Before any approved release, inventory every later draft PR, superseded path and dependency; identify individually what is production, ready to integrate, blocked or explicitly deferred. Then reconcile original `main` and canonical Vercel alias, bring all actually ready work into one reviewed release branch and run full integrated tests and security checks. Current R18-77 candidate remains separately opt-in and **is not one of the eight mandatory versioned migrations**.

## Genuine DM/P1/passive P2 QA readiness

R18-58 and R18-59 added source-controlled sanitized three-role QA receipts and a local panel in staging. **The canonical R18-35 build has an earlier “QA capture” panel but does NOT contain the R18-58 acceptance receipt interface**; the correct new source contains the `R18-58 multiplayer acceptance` option. Thus a real three-role acceptance session needs a **separately approved and verified candidate/preview deployment** incorporating R18-59. No staged SHA may be called “deployed” without verifying its Vercel deployment and served application.

After an authorized QA deployment, the DM, Player 1 and passive Player 2 must be **three separate actual signed-in accounts and browser sessions** on the same deployed build, not DM player preview. Open the approved build's URL with `?worldV2Trace=1`, expand **QA capture** (bottom-right), choose **R18-58 multiplayer acceptance**, enter one shared run code and the **actual deployed 40-character build SHA**, then select DM, P1 or P2 appropriately. Press **Start / reset** immediately before running cases. Only mark each check **Pass** after seeing it. Mark problems **Fail** and unperformed checks **Not run**. Copy the sanitized acceptance receipt and share it privately. Never share signed sight frames, raw geometry, player/token/character IDs, passwords or session URLs with embedded secrets.

The R18-58 checklist (source of truth `src/engine/v2/WorldV2QaReceipt.js`) demands:

- **DM:** rapid arrow/drag, majority-cell corner snap, true solid collision, no note-pin-induced lag, fog edit stability, permission revocation action, canonical observer convergence and no map flash.
- **P1:** rapid arrow/drag, corner snap, true collision, **instant drag regrab after collision**, own private fog, revocation denial, safe reconnect, canonical convergence and no map flash.
- **Passive P2:** observes DM/P1 moves without moving, receives only authorized private fog, no leak at revocation, safe reconnect, canonical convergence and no map flash.

Collect at least five actual Advance and terminal traces from DM and P1, and passive accepted observer frames from P2; the offline validator checks basic trace coverage and cross-receipt consistency. Use:

```sh
node scripts/release/validate-world-v2-r18-58-multiplayer-qa.mjs \
  --receipts=/absolute/private/three-role-receipts.json \
  --expected-build=<40-character-verified-deployed-sha>
```

Even if three sanitized receipts all say Pass, the validator deliberately returns **NO_GO**; an independent human reviewer must verify actual distinct sessions, no hidden fog information after revocation, visual collision, and device/browser isolation. Run current **server-ready** cases before installing any backend migrations and distinguish them from post-migration validation; don't interpret R18-35/R18-59 pre-release QA as R05+R18-48 integrated backend acceptance.

For performance, collect per-client pointer-to-local-render and pointer/drag-to-final-server-ack timings **p50/p95**, delayed corner snap, collision rejection-to-regrab, held-arrow cadence, stale observer positions and map remount/flash counts under two-to-five minutes of movement. Record Free-tier dashboard **physical RAM and swap**, committed memory separately, Realtime throughput, actual DB sessions/pool and lock waits during the same test. The 7/60 idle snapshot is not a load acceptance.

## R18-78 local release-gate tool

`staging/world-v2-b10-r18-78-release-readiness.json` stores **bounded public metadata only**: source lineage, read-only 83/83 and 10/10 counts, canonical alias/build/ledger mismatch, R18-48 exact eight-version plan, required pending items and no-go. `scripts/release/validate-world-v2-r18-78-release-readiness.mjs` cross-checks the immutable R18-08 baseline, seven-file R18-48 narrow package, stale ledger marker, repo tools and R18-77 source branch. Without additional evidence it cannot attest any browser sign-in or remote CLI.

Run offline:

```sh
node scripts/release/validate-world-v2-r18-78-release-readiness.mjs
```

Optionally pass a **fresh, privately stored** R18-50 single-result receipt from the reviewed read-only SQL, within **15 minutes**:

```sh
node scripts/release/validate-world-v2-r18-78-release-readiness.mjs \
  --fresh-receipt=/absolute/private/read-only-r50-receipt.json
```

This delegates full body+source fingerprint validation to R18-50 and reports only sanitized aggregate evidence. It is *not* evidence that the connector was authenticated or the original read was genuine. The tool ALWAYS returns `decision:"NO_GO"`, `safeToDeploy:false` and `safeToApplySql:false`; successful process exit only means no inconsistencies were found in the input. Missing/unknown/fake success flags, extra private fields and altered package versions are rejected. No network, SQL, shell, writes, GitHub merge, Vercel action, Supabase migration or evidence fabrication occurs.

## R18-78 handoff / next narrowly bounded step

**Engineering goal:** a single, up-to-date source-of-truth map for what can and cannot be claimed before any new release attempt. **Release: NO-GO**. After exact-head CI, next R18-79 should reconcile the accumulated draft-stage work and identify a **specific, operator-approved QA preview or official linked CLI rehearsal** that can be carried out under the free tier, rather than constructing further source-real synthetic optimizations. Do not deploy by default.

Hard stops: missing/changed 83-history body fingerprints; private function/security drift; wrong canonical build; any player fog/hidden-NPC leak; any collision push-through; no actual independent P1/P2; missing official linked dry-run; inconsistent release ledger; unexpected memory/locks; approval absent. Supabase project remains on the free tier with no additional paid infrastructure.
