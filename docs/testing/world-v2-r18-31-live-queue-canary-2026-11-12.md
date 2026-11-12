# B10-R18-31 — Isolated R18-24-compatible delayed Advance queue canary

**Date:** 12 November 2026 (Australia/Melbourne). **Scope:** exactly one live-controller behavior change on the existing R18-24 QA-only production source. **No SQL candidate, no new RPC, no R18-29 atomic finalization, no new permissions.**

## Exact source and intent

**Production/source parent:** GitHub commit `7326c45d80609c00cea5b9dd0593989dd458dd7a`; approved Vercel production deployment `dpl_7HUmXi7eQ2oq2Y5HiW6r5Pvzq1HN`; alias `ttrpgsite.vercel.app`. Original R18-15 controller blob SHA `0603e7b42ebd937a41e2a65e8b13089aa496dfba`. This isolated branch starts DIRECTLY from the exact production SHA, NOT the cumulative staging head R18-30. The cumulative post-R05 SQL release stays separately staged and blocked in draft PR #134, with R05 unapplied.

**Why:** R18-30's adversarial tests established a client-owned input race. During `await authority.advance`, a new pointer sample could replace the *head* waypoint in the pending queue. The old ACK later executed `g.pending.splice(0,batch.consumed)`, discarding the **newer** intended destination. Rapid dragging or reversing could therefore feel sticky, laggy or rubber-band after networking latency. The backend was not responsible for that particular client queue loss.

## Only allowed production-module diff

`src/engine/v2/MovementController.js` has **five** reviewed insertion/replacement sites, strictly from the R18-24 controller source:

1. After selecting a valid bounded batch, detach `batch.consumed` already-submitted waypoints **before** starting its asynchronous Advance RPC.
2. Set `g.inFlightTarget` to the already-submitted batch's last target. This is **input bookkeeping, not approved movement**.
3. Clear the short-lived in-flight target in a `finally` block after Advance returns or throws, including while cancelling.
4. Remove the old post-ACK `splice` that had been removing recently arrived fresh pointer data.
5. Initialize the new field to `null`; `appendGestureBend` may anchor an input bend to `g.inFlightTarget ?? g.approved`, without changing which position the authoritative Advance or canonical Commit uses.

**Unchanged:** original `advance_world_motion_v2` and `commit_world_motion_v2` calls, exact sequence and approved-prefix validators, collision deny cache, environment/permission cancellation, preview behavior, DM/player privilege rules, fog sight and private broadcast, no speculative movement grant, original keyboard and corner-drag hysteresis, 8-target/24-cell batch limits and signed canonical endpoint.

There is **no** `finalize_world_motion_v2`, `enableAtomicFinalize`, new backend format, new environment variable, SQL file, database migration, or auth/Realtime policy in this candidate. R18-29/R18-30 remain separately staged and cannot activate by accident.

## Safety and automated test plan

- A specific R18-31 test suite runs the exact original live server protocol in mocked delayed-request conditions. It checks fast forward coalescing, full reversal to origin, corner-bend retention, bounded 24-cell motion, blocked-prefix denial of newer unapproved destinations, suppression of repeated wall requests, no phantom Advance, preview no-Commit, rapid keyboard input, permission revoke while Advance unresolved, network-error fail-closed and a pinned **exact controller Git blob**.
- Existing R18-15 collision/corner/latency behavior and R18-05 source-lock tests are **narrowly amended** to register this additional R18-31-only source SHA, retaining the R17 and R18-15 historic reviewed SHA records.
- GitHub complete Node test suite, production Vite build, dependency audit, ESLint, Edge Function type checks, independent PG17 World V2 authority and isolated combined SQL CI, and CodeQL **must pass at the final exact commit**.
- No project or user data are written. Static source changes outside `MovementController.js` are limited to tests, this note and a separate canary readiness record. The cumulative staging release ledger is deliberately **not replaced** by this live-only fork.

## Release/canary decision and rollback

Treat `ttrpgsite.vercel.app` as the owner's existing **testing ground**, not a production customer campaign. A targeted, **frontend-only** test deployment is permissible only after exact-head checks and read-only verification that the Vercel alias still points to R18-24, remote Supabase migration count remains 83 with R05 uninstalled, and new R18-28 public RPC remains absent. Do not change Vercel environment variables or enable observer guarded recovery. Explicitly record deployment SHA/ID and keep rollback `dpl_7HUmXi7eQ2oq2Y5HiW6r5Pvzq1HN` ready. If the live test causes delayed movement, token/map flashing, new authorization errors, or a divergent canonical position, **immediately roll back** before considering a cumulative release.

A sole DM may test this frontend-only race: start the normal DM view and perform 10 rapid forward drags with direction changes and 5 reversed corner drags, then tap an actual wall/blocked pin without attempting to cross it. Use `?worldV2Trace=1` on the live test URL only if reporting timings; copy the bounded "QA capture" report. Stop and report a rollback trigger if the token advances into a forbidden cell, the map flashes/reloads, or new errors appear. This is NOT a substitute for independent DM/P1/passive-P2 fog, LOS, observer revocation and Realtime acceptance required for the entire SQL redesign.

**Performance interpretation:** Delayed queued-input loss should be reduced when the server responds slowly; this does not shorten the network ACK or database execution itself. No percentage gain is claimed without matched, real browser measurements. Regional infrastructure, SQL R05 and full server fixes remain separate decisions.

**Historical source trail:** R18-30 draft PR #134 stays cumulative and UNMERGED. This fork does not replace that PR. A future cumulative merge must reconcile this isolated frontend patch against its R18-30 equivalent, not apply both or merge this fork on top blindly.
