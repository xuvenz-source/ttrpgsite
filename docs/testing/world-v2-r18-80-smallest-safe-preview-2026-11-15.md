# B10-R18-80 — Smallest trustworthy World V2 QA preview candidate

**15 November 2026 (Australia/Melbourne) · Draft / NO-DEPLOY · exact direct parent R18-79 PR #181 at `e3b791ea7ba478b9220bc5ddb111b628cec36348`.**

## Engineering decision

**Reuse the source of the existing R18-62 Vercel preview**, not the rejected R18-40 build and not a newly assembled 100-branch release. Select **Git SHA `380e31bda9e20638c3e1f660a2cdf001b8e37c0d`**, PR #166, existing Vercel project `ttrpgsite`, deployment `dpl_Pk7zo5VLppWs6hjc6WKsp4bMH2ZC` (READY, preview), alias `ttrpgsite-git-stage-world-v2-b10-r18-62-previ-4f1679-ttrpg-site.vercel.app`.

**Crucial distinction:** existing R18-62 **preview deployment is READY but not verified V2-active**. A ready Vite preview is *not automatically* a V2 movement/observer acceptance environment. Its R18-58 QA receipt panel is present in the source but is rendered only when the V2 board is active *and* the diagnostic URL opt-in `?worldV2Trace=1` is used. This R18-80 step **does not modify any Vercel environment variable, start a deployment, grant preview access, alter Supabase Auth settings or write database data**.

### Why this exact source is the least risky

A read-only GitHub **tree-level** comparison between the already deployed R18-62 SHA and the latest R18-79 staged SHA proves they share exactly the same:

| Artifact | Git SHA-1 object at BOTH commits |
|---|---|
| Complete `src/` tree (all React/V2 source, auth, QA UI) | `546cfbaca75a16a447f740a24d1ef59e0a489f59` |
| `index.html` | `75a0c28b69c09f7661faa7822a7abfde7164e2d0` |
| `package.json` | `d728ea81b83c9ae02fc36bedeb5abeba3a5bc277` |
| `vite.config.js` | `7abe1f343e0631c97160ff63bcc00119e4f3775d` |
| `vercel.json` | `de8875a0750955e5d326a84f089b7533a09c5050` |

`compare_commits` reports **87 commits ahead, zero behind** between R18-62 and R18-79, but **zero `src/` files**, **zero Vite/Vercel app config files**, and **zero versioned migrations** changed. Intervening work is synthetic PostgreSQL tests, release inspection scripts, source-sealed *unversioned* optional SQL candidate files, GitHub runbooks and stage ledger only. This source identity is stronger than a casual observation that “the UI looks the same.” The local R18-80 offline preflight recomputes the **entire checked-out Git-compatible `src/` tree digest** and the four frontend build-file blob digests before permitting even a *candidate selection* report. The tool still always returns **NO_GO**, not a deployment permit.

The R18-62 source contains the R18-59 **R18-58 multiplayer acceptance** panel, the source-guarded R18-43 atomic protocol **default-OFF**, and the R18-62 same-origin slash-safe Google/OTP OAuth return code. Existing R18-62 preview is protected by Vercel Authentication. The user previously observed correct Google sign-in on the preview, but **Supabase URL Configuration's exact redirect allowlist has not been independently read**; reverify with the operator before inviting independent players.

## The blocking feature-flag configuration

The actual frontend selects the V2 board only when **both** values are present at **Vite build time**:

```text
VITE_WORLD_ENGINE_V2=integrated
VITE_WORLD_ENGINE_V2_READY=true
```

Read-only Vercel project env **name/target/branch metadata** reports these keys in **production** and as **branch-scoped preview** values for the old R18-39 and rejected R18-40 branches. It reports **no R18-62-branch-scoped or global-preview V2 activation entries**. Therefore the currently READY R18-62 preview is **not eligible to be reported as a V2-active QA build**. The exact effective compiled values of a future deployment must be verified on the **newly served candidate**, not inferred from an old env listing.

Any later authorized operator action must restrict the two activations to **Preview → Git branch `stage/world-v2-b10-r18-62-preview-auth-redirect-2026-11-14` only**. Do **not** alter production variables, global preview defaults, feature flags for R18-40 or canonical production aliases. Keep `VITE_WORLD_V2_ATOMIC_FINALIZE`, `VITE_WORLD_V2_ATOMIC_FINALIZE_READY`, `VITE_WORLD_V2_OBSERVER_RECOVERY` and `VITE_WORLD_V2_OBSERVER_GUARDED_RECOVERY` **unset/off** for this first baseline; the optional atomic backend RPC is still absent from the live 83-migration project and must **not** be activated. The previous R18-40 preview failed real DM collision/rapid movement acceptance. Never promote it as a fixed candidate.

`vercel.json` sets `git.deploymentEnabled["**"]=false`, `main=true`, so pushing a stage commit alone is **not** proof a preview was rebuilt. Since these are **build-time** Vite settings, configuring them on an already READY deployment does not retroactively enable V2. A **new explicit, approved preview build from exactly the pinned R18-62 source** is required. The new deployment ID, source SHA, served hostname, protection state and actual V2 board must be verified. Do not assume old preview aliases automatically follow the rebuild.

## Operator-gated preview preparation (NOT executed by R18-80)

These steps require separate explicit operator authorization, even though they stay within a free-tier preview:

1. Confirm Supabase still has **83** live migrations, signed movement authority, original private schema access restrictions and no unexpected active sessions. Check Vercel project/team and canonical `ttrpgsite.vercel.app` still points to R18-35, not the rolled-back R18-36 build. Recheck the R18-62 branch head against the pinned SHA.
2. Confirm the exact existing approved preview root in Supabase Authentication → URL Configuration Redirect URLs. Keep production Site URL and Google's Supabase provider callback unchanged. Don't add a wildcard for all `*.vercel.app`. Protect preview access with Vercel Authentication or narrowly scoped share access; don't place shareable token links in PRs or chat logs.
3. With separate approval, configure **only** the two R18-62 branch-scoped preview Vite flags above. **Never** set atomic finalization/guarded observer recovery flags. Create **one** new preview deployment from the pinned source; no `--prod`, promote, production alias assignment, main merge or SQL operation. Git staging auto-deployment is disabled, so this is an explicit operator operation.
4. Independently verify Vercel returns `READY`, exact deployment **SHA `380e31…`**, preview target and protected host. Inspect the served UI and confirm the **V2** board is actually selected; a successful React compile or a QA button alone does not prove V2 authority is active. The build SHA shown to testers must come from **this deployed record**, not the R18-79/R18-80 PR head.
5. In separate signed-in browsers, verify DM, Player 1 and passive Player 2 land back at that same preview host after Google login. Stop if any OAuth callback returns to production, shows the wrong campaign, or reveals access denied. No shared DM preview, no fabricated signed accounts.
6. On the **test-only campaign**, enable `?worldV2Trace=1`, choose the panel's `R18-58 multiplayer acceptance` mode and one shared code. Run 2–5 minutes with actual wall collisions, majority-cell corner drags, rapid held-arrow steps, note-pin proximity, immediate regrab after blocked movement, hidden fog, DM permission revocation, reconnect and passive observer convergence. Each person exports only the bounded local receipt, with every check defaulting to `not_run`. **Do not upload JWTs, raw source frames, geometry, player IDs or OAuth codes**.
7. Independently verify the three accounts/browser sessions and the visible collision/fog/revocation outcomes; run `scripts/release/validate-world-v2-r18-58-multiplayer-qa.mjs` on private receipts. Record browser input→ack p50/p95, wait after blocked/commit, rendering flash counts, and **Supabase Free physical RAM/swap plus lock waiters under simultaneous load**. The old 7/60 idle DB session measurement does not answer these questions. Discard private raw traces after extracting sanitized results.
8. Stop on any push-through, after-the-fact teleport correction, missing player sight authorization, stale P2 view, OAuth host mismatch or >budget input/regrab delay. Remove branch-scoped preview flags and restrict/retire the approved test link after the session. Production remains untouched.

### Acceptance boundaries

- This **83-migration** preview may collect valuable **pre-migration baseline diagnostics** for true wall collision, input latency and user auth. It does **not** validate the as-yet-unapplied **R05 plus seven narrow R18-48 SQL changes**, nor does it prove R18-57/R18-77 optional fog/ray candidates improve gameplay.
- The first possible *release-level* movement acceptance must be repeated after the **official authenticated pinned CLI v2.81.3** linked 83+8 fetch/list/`db push --dry-run` is reviewed, **then** a separately authorized database release is applied, with protected DM/P1/P2 follow-up and RAM/lock budget monitored. No SQL can be applied from a preflight.
- A single DM can give useful negative QA and diagnostics, but **cannot certify** P1 or passive P2 sight revocation. No performance gains, authorization outcomes or safe-for-production status should be inferred from self-selected “Pass” checkmarks alone.

## Offline R18-80 artifacts

The source observation is frozen in `staging/world-v2-b10-r18-80-qa-preview-candidate.json`. Run locally:

```sh
node scripts/release/validate-world-v2-r18-80-preview-candidate.mjs
```

The validator computes the Git tree hash for the entire `src` directory and checked-in Vite, Vercel, HTML and package blobs; verifies both build-time feature gates and the R18-58 panel, and explicitly refuses any forged preview authorization, wrong alias, failed R18-40 promotion, early “QA PASS,” future 91-migration claim, or production flag mutation. It makes **no external network or tool calls, no writes and no changes in Vercel/Supabase**.

**Decision: R18-80 engineering readiness is source-pinned, but V2-active preview and production release remain NO-GO until separately authorized, rebuilt and observed.**

## Handoff to R18-81

Next prioritize a single operator-approved **V2 preview activation** on the pinned R18-62 source, or—if independent testers remain unavailable—capture and analyze a bounded **solo DM** pre-migration negative baseline on an approved candidate, never treating it as P1/P2 proof. Avoid another speculative engine rewrite. Keep GitHub main, the canonical alias, the V2 QA alias and live migration state distinguished.
