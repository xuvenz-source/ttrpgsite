# B10-R18-81 — Protected V2 preview activation and live QA handoff

**15 November 2026 · Engineering staging · Preview ONLY · Production release NO-GO**
**Direct source parent:** R18-80 PR #182 exact head `bc6f96aa15b7924a9a62c5dd2ae9d4a73f7a5e7b`.

## Executed limited authorization

The operator requested **“Proceed”** after the R18-80 handoff explicitly described one limited R18-62 preview build with **two branch-scoped build variables**, without SQL or production changes. The R18-81 action was bounded to exactly that scope.

**Vercel team/project:** TTRPG Site, `team_x0HgomZNnFpGbnYWHgut76AX`, `prj_JvLavoId5bra74h24BDL7ZyMKizN` on **Hobby/free**. The connected GitHub branch was re-verified to still point to **`380e31bda9e20638c3e1f660a2cdf001b8e37c0d`**.

Read-only environment-variable key and scope preflight showed neither of the V2 cutover keys in global preview nor on R18-62; they existed only for older R18-39/40 branch previews and production. Exactly **two** new project environment variables were created in a **single** scoped request:

| Key | Build-time value | Target | Git branch | Vercel variable ID |
|---|---|---|---|---|
| `VITE_WORLD_ENGINE_V2` | `integrated` | preview only | `stage/world-v2-b10-r18-62-preview-auth-redirect-2026-11-14` | `KBmePLAqSqvfSCyx` |
| `VITE_WORLD_ENGINE_V2_READY` | `true` | preview only | same exact branch | `CspsbE9FgzHftk6m` |

A fresh **read-only scope verification** confirmed both and only both are assigned to R18-62, **zero** generic preview overrides and **zero** branch-scoped optional atomic/recovery variables. Existing production environment-variable records remain present and were **not edited**. No Supabase Auth configuration or SQL was changed.

Exactly **one** deployment was created with `gitSource.type='github'`, `org='xuvenz-source'`, `repo='ttrpgsite'`, exact `ref`, pinned source SHA and `forceNew=1`. We did **not** supply `target:'production'`, and Vercel reports preview target **`null`** (i.e., a regular branch preview, not production).

## Live Vercel result — READY

| Field | Verified from Vercel |
|---|---|
| Immutable deployment | `dpl_Bdek3W7xXVYW3f7QDZpjrDDp9V3F` |
| URL | `https://ttrpgsite-96k0doq81-ttrpg-site.vercel.app` |
| Branch alias | `https://ttrpgsite-git-stage-world-v2-b10-r18-62-previ-4f1679-ttrpg-site.vercel.app` |
| Git source SHA | `380e31bda9e20638c3e1f660a2cdf001b8e37c0d` |
| Git source branch | `stage/world-v2-b10-r18-62-preview-auth-redirect-2026-11-14` |
| Build status | **READY**; Vite 6.2.0, 241 transformed modules |
| V2 bundle emitted | `WorldV2Board-BNDL3XpU.js` present in build logs |
| Preview protection | Vercel Authentication, `ssoProtection.enabled=true`, preview only |
| Old branch alias resolution | Explicit Vercel alias lookup resolves to **this new deployment** |

The emitted V2 module does **not independently prove** that the running app chose the V2 branch. The source checks the two build-time flags, and Vercel confirms they are scoped to this branch before the fresh build. **Only a protected browser session can establish actual served V2 selection**, authenticated OAuth callback, real movement authority and the R18-58 capture panel.

The Vercel deployment files API returned **404 file tree not found** for this Git-connected deployment; no inference about compiled flags was drawn from that failure. No uploaded source or browser authentication state was retrieved.

## Production safety: verified unchanged

After the new preview reached READY, **`ttrpgsite.vercel.app`** still resolved to R18-35 deployment `dpl_GtaJ4PoxHzXDpN7L46nka8Kqb8mN` on `5ca8c83bdef4a5d9870020b0f2b16723f7790e38`. No promotion, production deploy, canonical alias reassignment, `main` merge, database migration, R18-57/R18-77 optional SQL installation, admin credential operation, paid plan change or broad preview protection bypass was made.

Supabase showed **83** registered migrations in its linked read-only migration list. Its exact 83/83 historical-body hashes and 10/10 protected function digests were already verified by R18-78, but that older fingerprint receipt is not a fresh full production catalog re-attestation. Official authenticated pinned Supabase CLI v2.81.3 **83+8** history/fetch/list/`db push --dry-run` remains outstanding.

## Immediate solo-DM preview smoke test — required before multiplayer

1. Use the existing protected **branch alias URL** above. Log into Vercel if requested. It should continue opening the R18-81 preview; confirm it does not redirect to `ttrpgsite.vercel.app`.
2. Sign in with Google using the authorized test account. Confirm the final URL hostname still equals the approved preview hostname, not production. Supabase OAuth redirect allowlist is not readable through current connected tools; **stop** if the redirect falls back to production, reports an invalid redirect, or changes campaign context. Never share the OAuth `code`, access token or shareable login URL.
3. Open the existing **test-only** campaign, using `?worldV2Trace=1` in the final URL (after sign-in if necessary). Confirm the **World V2 board** is rendered, and click **QA capture** near the bottom-right. Under Report format, verify `R18-58 multiplayer acceptance` exists. If it does not, V2 or the intended build has not been verified—**stop and report the symptom**.
4. DM outside player preview: attempt fast repeated arrow motion, rapid drag, majority-cell corner drops, true wall collision **without passing into the wall and teleporting backward**, immediate grab/regrab after blocked movement, a note-pin boundary, and fog edits. Mark any occurrence of `Another movement is still being confirmed`, map flashing or local token disagreement as **FAIL**, not a release-ready pass.
5. Use the panel's **Quick scenario report** for first diagnosis if only the DM is present; press Start/reset before testing and copy **only the sanitized report**. Screenshots of visual collision are useful if they contain no private hidden sight or auth data. A DM player-preview result **does not count** as an independently signed-in player.

This is a live **pre-migration 83-history baseline test**. It may find regressions, assess V2 activation and judge whether real three-account QA should proceed. It cannot establish the as-yet-unapplied R05+seven R18-48 movement release is accepted.

## Three independent real-account checks after DM smoke test

DM, independently signed Player 1 and **passive Player 2** must log in on the SAME verified deployment, campaign and test map. The DM must stay outside player preview. Use the same run code and actual deployed SHA `380e31bda9e20638c3e1f660a2cdf001b8e37c0d`; do not use R18-80 or R18-81 engineering PR SHAs.

In the opt-in QA panel switch to `R18-58 multiplayer acceptance`. Each account selects its true role, starts a fresh trace and marks every required check **Pass / Fail / Not run** based solely on actual observation. Include 2–5 minutes of rapid arrow/drag, corner snap, true wall collision and immediate regrab, no fog flashes or unseen NPC disclosure, deliberate DM permission revocation while a movement is in flight, P1 reconnect, passive P2 observer reconciliation and final canonical cell agreement. Capture actual browser input→server-ack p50/p95 and physical Supabase Free RAM/swap, active connections and lock waits during the same run.

Use private sanitized R18-58 receipts and the read-only offline `scripts/release/validate-world-v2-r18-58-multiplayer-qa.mjs`. It intentionally returns **NO-GO** even with all self-reported Pass entries, because independently witnessed identities, fog privacy and the signed official CLI gate cannot be inferred from pasted JSON.

## Operational containment and future rollback

R18-81 leaves the new preview **available for testing**. It does not replace the canonical site; only the R18-62 branch has its two new Vite flags. Do not make any broad changes to existing project env variables.

If QA proves the candidate unsafe, **stop sharing the preview**. The two branch-scoped values can be deliberately set to non-activating values by an approved operator using `edit_project_env` on exact IDs above, and then a branch preview **rebuild** is necessary for the already built active bundle to change. Changing env values alone does not retroactively disable the immutable build. A full cleanup/deletion of the two branch vars may require the Vercel dashboard and explicit operator action; no deletion tool was available in the current connector. Production is unaffected.

**R18-81 source/preview engineering: PASS if exact-head GitHub CI passes. Live browser activation and true multiplayer acceptance: NOT VERIFIED. Production: NO-GO.**
