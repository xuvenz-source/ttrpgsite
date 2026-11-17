# B10-R18-105 — Isolated PostgreSQL 17 runtime test of real R18-104 fog guard

**17 November 2026 · Direct parent R18-104 PR #206 / SHA `0c4928ada3d51421e7f5b4f68dc9c7a6688be1c8`**

## Verified new evidence

This stage **actually compiles and runs** the exact staged R18-104 candidate in a **disposable GitHub Actions PostgreSQL 17 service**, never in original Supabase or separate QA. Intermediate evidence: [successful isolated run 44058183100](https://github.com/xuvenz-source/ttrpgsite/actions/runs/44058183100), exact branch commit `a4bcc530722b7f7c6ead4ec2ca00e83b1af4f00a`. Full final-head rerun is a separate CI requirement.

The isolated service is localhost-only from the runner, with dedicated database `world_v2_r18_105`, ephemeral credentials, explicit external DSN veto and no Supabase client/secret connection. The fixture uses **fabricated IDs** and a minimal synthetic schema. There are no real accounts or campaign data.

The source extractor checks four function bodies from the frozen Git migration files against the **independently verified live SHA-256 fingerprints** in R18-103: `can_view_campaign_map`, `is_map_fog_published`, `end_map_motion_previews`, and `end_map_motion_sessions`. It extracts the actual historical `map_combats` fog/nonfog roster RLS policy from Git. Any source discrepancy blocks the test.

### Executed disposable PostgreSQL checks

- Before candidate application, an authenticated-role session with a **synthetic JWT GUC** reproduced the original cross-campaign fog-status metadata disclosure. The nonmember could determine that a foreign campaign's map was fog-enforced while RLS still denied its combat roster.
- The exact candidate was installed in the isolated PG17 container; anonymous direct execution remained denied and private fog rules remained inaccessible to application roles.
- After the repair, nonmembers and a DM of a different campaign received false for forbidden fog maps. Authorized DMs received correct on/off results; assigned players received their own map's status, but not non-assigned or other-campaign maps.
- The original `map_combats` RLS policy still granted a DM access to both fog and nonfog combats and allowed an assigned player to read the nonfog roster but not fog-enforced or unrelated encounters.
- Revoking a synthetic user's campaign membership immediately removed access. An intentionally inconsistent cross-campaign map-rules row failed the new same-campaign predicate.
- Exact original `end_map_motion_sessions` and `end_map_motion_previews` SQL preserved actor isolation. Simulated P1 could not close P2's session/preview and could close its own.
- Replacing the candidate with the original function in the disposable database **reintroduced** the known disclosure. Reapplying the candidate removed it again; legitimate nonfog roster reads remained available.

The rollback exercise is an important safety warning: **do not use the old function as an automatic production rollback**. Doing so reinstates the privacy issue.

## Explicitly not verified

The test uses a simplified schema, a fixture-only `auth.uid()` based on a manually set JWT GUC, and a synthetic `is_campaign_dm` helper. It is not a full migration replay and does not prove browser-signed Supabase Auth behavior, all 67 privileged RPC permissions, side-channel timing equivalence, real Fog/LOS isolation, movement performance or collision correctness. No original SQL history was privately recovered. In particular the **12 R18-104 real signed-account QA acceptance cases remain NOT_RUN**, and no site was deployed.

The isolated workflow's success authorizes **source/test engineering verification only**. Original and QA Supabase databases, original users and Vercel projects are unchanged; QA remains empty with zero migrations and zero application tables.

## Next independent gates

Recover the original 83 migration SQL bodies privately using authenticated operator source access; review their SECURITY DEFINER, Auth/Storage, DML and RLS semantics; perform an independently signed QA-only dry run and rollback rehearsal; obtain separate approval for QA-only schema installation; run signed DM/P1/P2/outsider fog-status and combat-RLS access tests. Keep pending R05 and seven R18-48 SQL installs separate.

**R18-105 runtime rehearsal PASS (isolated PG17 only). QA bootstrap, real signed security acceptance, and production release: NO_GO.**
