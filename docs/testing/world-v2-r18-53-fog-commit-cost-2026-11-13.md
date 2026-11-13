# Tabletop Forge B10-R18-53 — Commit/fog synchronous cost investigation

13 November 2026, Melbourne. Staging-only diagnostic increment; NO-GO for SQL, runtime code or deployment.

## Direct production observation

Live Supabase project lwhwgqaunxbmvyndswze remains on 83 historical migrations with last 20261109171247; R05 remains absent. No DDL, data writes, function changes, grants or feature activation occurred. The exact R18-53 single SELECT query was executed successfully on production at 2026-11-13T05:53:17Z after correcting a JSON key/value typo in its earlier nonmutating, rejected invocation.

The read-only inspection directly verified **seven** existing source function MD5 hashes and **two** enabled triggers (BEFORE collision + AFTER visibility) on public.map_tokens. The live Commit function writes the canonical x/y token row. The token fog trigger calls tick_tokens. For pure movement on a fog map, tick_tokens calls viewers_affected_by_token_move and bump_tick_scoped, which then calls bump_viewer_ticks. That function acquires a transaction advisory lock per affected player, computes authorized_viewer_fog_frame, optionally computes fog_cells_diff, updates the signed private fog snapshot and the viewer's tick row. All happens synchronously as part of the same canonical token UPDATE/Commit transaction.

This demonstrates a potentially expensive synchronous dependency, **not** proof that it caused any particular 1.3-second Commit. No sensitive fog cells, per-player IDs, token positions, maps, SQL bodies, auth secrets or recipient lists were returned by the audit.

Snapshot aggregate footprint was one fog-enabled map, seven tokens, eight viewer snapshot rows, eight viewer tick rows, and zero waiting locks at the instant of measurement. Those global counts are not concurrent active-recipient counts. PostgreSQL track_functions was 'none', so per-function exclusive time is unavailable. Historical pg_stat_statements counter reset was 2026-11-05T09:51:43.703269Z; PostgREST-normalized database RPC queries showed **1,756 Advance calls, mean 64.14ms, max 2256.44ms**, and **514 Commit calls, mean 292.46ms, max 3673.67ms**. These aggregate database query times are cumulative, not a same-window browser comparison or per-trigger timing.

## Reproducible source additions

1. supabase/release-preflight/world_v2_b10_r18_53_commit_fog_cost_readonly.sql is a SINGLE SELECT outside active migrations. It pins seven live original source hashes, two token-trigger definitions, 83-version history, aggregate fog row counts and cumulative normalized top-level PostgREST RPC execution times without revealing SQL bodies or any private sight or user data.
2. scripts/release/validate-world-v2-r18-53-fog-commit-evidence.mjs is offline-only; it refuses changed source hashes, disabled triggers, R05 installation, malformed/noisy historical timings, waiting locks, and stale evidence. It can return only DIAGNOSTIC_ONLY and safeToApply:false; not trigger-cost attribution or production release approval. It cannot independently attest that the input really came from Supabase.
3. tests/world-v2-r18-53-fog-commit-evidence.test.mjs exercises synthetic receipt pass-as-diagnostic and adversarial source/trigger, history, timing, RPC and SQL read-only failures. Synthetic tests are not live independent browser security QA.

To inspect an authorized fresh JSON receipt privately: node scripts/release/validate-world-v2-r18-53-fog-commit-evidence.mjs --receipt=/absolute/private/fog-diagnostic.json . Do not paste whole private telemetry, signed visibility frames, tokens or authenticated user IDs in the PR.

## Engineering implications

The current movement pipeline already buffers genuine keyboard/pointer intent, validates paths on the server and does no privileged client-authoritative collision. The prior R18-42 disposable PG17 test showed a 23-cell real path can travel as one bounded Advance rather than 23 one-cell network trips, but did NOT measure production transport or fog trigger cost. The R18-43 optional atomic terminal bridge may eliminate one closing HTTP round trip yet still synchronously invokes canonical token-write triggers, so it cannot by itself eliminate fog-refresh cost.

An unsafe optimization would skip bump_viewer_ticks or broadcast cached private fog after canonical Commit; that could expose revoked sight or stale hidden geometry. A credible design for a future optimization must first secure invalidation/revision and the pre-revocation recipient set, preserve ordering, guarantee fail-closed signed observer views, and prove canonical commit with P1/passive-P2. No candidate SQL that moves fog work async or relaxes the trigger is added in R18-53.

## Release gate

NO-GO. Before any server-side change, demand a controlled local isolated PG17 fixture that loads the **exact source-real** token/fog functions and actual equivalent map/recipient schema, compares full fog/LOS/permission and revision outputs under both baseline and candidate, and measures p50/p95 trigger-inclusive canonical Commit. Separately, require genuine signed DM/P1/passive-P2 live fog/revoke/observer and reconnect QA, current free-tier RAM/locks, a real authenticated isolated 83+8 Supabase CLI fetch/list/dry-run, and explicit operator release approval. Do not use the existing simplified R18-42 fixture (which has a test-only observer sink and lacks production token triggers) to claim real fog performance. R18-26/R18-27 mixed-benchmark candidates, rejected R18-40 client patch, both R18-43 flags ON, SQL push, and Vercel deployment remain excluded.

Final review must check exact parent R18-52 source SHA 9ebbb8d0b07d8b3f17589c713d2b00429c0fc690, GitHub CI, and unchanged R18-35 READY production alias. Staging in this increment may contain only the two new read-only tooling files, adversarial tests and this document.