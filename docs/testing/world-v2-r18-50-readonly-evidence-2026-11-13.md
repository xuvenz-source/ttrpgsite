# Tabletop Forge B10-R18-50 — Fresh read-only production evidence and release gates

13 November 2026 (Australia/Melbourne). **Draft staging only. NO-GO to production.**

## Source and objective

This step follows R18-49 PR #153 at SHA 2b5458dacc850d9ce6dbbd1fa4f11bb73e505cc5 and R18-48 narrow release PR #152. It adds a reproducible read-only SQL audit statement, a local receipt verifier and adversarial unit tests. It does not change application movement/fog code, migration SQL, feature flags, live data, permissions or production deployment. R18-26/R18-27 mixed-performance candidates and the rejected R18-40 frontend change remain excluded.

## Actual live READ-ONLY measurements on 13 November

All queries used the connected Supabase read-only SQL endpoint for the existing project lwhwgqaunxbmvyndswze (PostgreSQL 17.11, ACTIVE_HEALTHY), not the official linked CLI.

- At **03:17:29 UTC**, the live migration table contained **83** registrations; newest version 20261109171247; R05 version 20261111023204 was absent. Freshly recomputed versions, names, statement counts and CLI-style SQL-body MD5 values matched **83/83** frozen R18-08 baseline records, zero drift. No migration SQL bodies were exposed.
- All **10** protected Advance, Commit, observer, viewer, visibility, collision and legacy trigger function definition MD5s matched the existing R18-45 preflight source signatures.
- At **03:22:26 UTC**, the precise new R18-50 read-only SQL statement ran successfully and returned one JSON receipt: 83 migration rows, 10 present authority definitions, original ACL boundaries for anon/authenticated Advance and Commit, R05 and atomic finalizer absent, R05 backup absent, R18-20 campaign guard absent, no active motion sessions **at that instant**. Internal forge schema was inaccessible to both browser roles; anonymous users could not invoke Advance/Commit.
- At the same snapshot: **0 waiting database locks, 7 sessions, configured 60 max connections**. These are instantaneous counts, NOT evidence of free-tier memory headroom, RTT improvement, 3-player lock behavior, or actual load stress.

## New reproducible audit

The staged SQL file is supabase/release-preflight/world_v2_b10_r18_50_live_readonly_evidence.sql. It is a single WITH/SELECT JSON-building query, outside the normal migration folder. It reads existing historical migration metadata, function source hashes, privileged RPC existence, browser ACL, active sessions and aggregate lock/session counts. It returns neither SQL bodies nor player secrets, fog geometry, tokens, usernames or session data. Never use it to authorize actual SQL installation.

The staged local script is scripts/release/validate-world-v2-r18-50-readonly-evidence.mjs. It first source-verifies the R18-48 narrow package, compares all 83 historical content MD5s and 10 authority function MD5s, and refuses drift, suspicious ACL, partial R05/atomic install, active gestures or lock waits. It rejects malformed, future-dated or older-than-15-minute evidence snapshots. Input is a private JSON dump of the one SQL result. Example:

    node scripts/release/validate-world-v2-r18-50-readonly-evidence.mjs --receipt=/private/path/readonly-receipt.json

A matching receipt produces **NO_GO** and safeToApply false. It explicitly does **not** attest the source JSON's provenance, authenticate a linked CLI, independently sign players, measure real concurrent RAM/locks or approve production. Recency is not a cryptographic signature. Do not publish raw receipts or secrets.

The staged test module tests/world-v2-r18-50-readonly-evidence.test.mjs runs a synthetic 83-row and 10-source case plus adversarial history tampering, missing functions, ACL drift, partial R05, live motion, stale evidence and fake GO. It also rejects data-mutating SQL tokens. These tests cannot substitute for independently signed live accounts.

## Remaining release gates (NOT completed)

**1. Actual isolated linked CLI.** A separately authorized operator must use the official pinned Supabase CLI v2.81.3 in a freshly isolated workspace OUTSIDE Git. Fetch the actual 83 history SQL bodies, freshly verify all 83 MD5s and source identities, copy only frozen R05 plus the seven R18-48 versioned files (91 files), run R18-49 workspace validator, migration list --linked and strictly db push --dry-run --linked, inspecting exactly eight pending and zero historical replay. This **has not happened**. No automatic push, migration up, migration repair, arbitrary SQL DDL or MCP apply_migration.

**2. Independent signed DM/P1/passive P2.** Not available in this increment. DM player preview is insufficient. Test legal fast arrows/drags, wall/corner collision, blocked immediate regrab, fog and hidden wall boundaries, observer fan-out, role revocation mid-flight, P2's passive access, signed sight after revocation, canonical token recovery and reconnect. Require independent authenticated accounts, with private sight payloads and identities redacted from reports.

**3. Actual free-tier load.** Not available. Record browser p50/p95 Begin/Advance/Commit/finalize, gesture release/lock, token convergence, live memory, CPU, DB locks and connections under concurrent testing. Idle zero waiting locks does not establish performance. R18-43 finalization only has potential to eliminate the terminal round trip, not sequential Advance RTT.

**4. Security-led rollout and recovery.** Not approved. Keep both atomic flags OFF and R18-35 READY production fallback. After separately authorized SQL installation, preserve protected R05 four-function/R18-46 five-function recovery and R18-20 campaign-affinity guard. R18-45 atomic Execute containment is limited: it cannot reverse committed movements, prior observation or migration history, and cannot terminate an in-flight SQL statement.

## Decision

**R18-50 is staging-only / NO-GO.** The read-only SQL evidence is fresh and reproducible, while official linked CLI dry-run, genuine signed multiplayer privacy tests and real free-tier pressure measurements are still independently necessary. Do not merge, deploy or enable atomic movement without those gates.
