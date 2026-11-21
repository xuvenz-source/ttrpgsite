# B10-R18-208 — Privileged write/cleanup RPC ownership versus campaign revocation (NO_GO)

22 November 2026. Direct source-only child of [R207 draft PR #317](https://github.com/xuvenz-source/ttrpgsite/pull/317), exact final parent SHA `646d46331f72ab4b30c3eb994c0c1c9c47e80769`. Focused current source+invented metadata PG17 `44922049841` and full staged frontend/lint/dependency/Vite/Edge `44922049744` both **SUCCESS**. Owner's R206 sanitized-only receipt validated 83/83 original historical migration hashes and 11/11 original direct function body SHA/byte identity; this did NOT authorize security release.

## Original project SELECT-only second-pass 67-callable function triage

A current live `pg_catalog.pg_proc` catalog scan reports **67** authenticated-callable SECURITY DEFINER functions; **7** without direct `auth.uid` words; **14** without detected other public-function name calls; **2** with neither direct identity nor detected public callee (including known #212 fog-status oracle and the short preview-motion function, not automatically two confirmed bugs). Across the 67, **43** have an INSERT/UPDATE/DELETE/TRUNCATE *word*; **8** have a write word and no detected public-function name; **0** of those eight lack direct `auth.uid` *words*; **8** have write words but no direct membership or any of the specifically tracked DM/sheet/inventory/map guard function words. One function has a user-editable metadata word. **These are lexical markers, not executed DML or proof of effective authorization.**

Fresh reproducible original **SELECT-only** query `scripts/release/r208_readonly_cleanup_privilege_census.sql` returns the **eight known public RPC names**, current PostgreSQL source SHA-256 and UTF-8 byte length, caller role privileges, source language, identity-call counts and fixed boolean markers for actor/holder/campaign/map identifiers, WHERE/DELETE/UPDATE/INSERT/FOR UPDATE and delegated helpers. **No current original source SQL body/signature, user, campaign row, historical private migration, JWT or Storage URL is returned**.

| Current privileged RPC group | Original source markers and risk question |
|---|---|
| `advance_world_motion_v2` | 2 direct `auth.uid()` calls, `actor_id`, WHERE, UPDATE and FOR UPDATE. Must inspect whether current membership/map/move permission is enforced upstream or in exact body; **not proven** |
| `cancel_world_motion_v2`, `end_authorized_navigation_gesture` | Direct actor identity, WHERE and DELETE. Likely cleanup paths; must deny another actor's state without necessarily denying one's own cleanup after revocation |
| `end_map_motion_previews`, `end_map_motion_sessions` | Direct actor/map markers, WHERE and DELETE; session closer mentions preview closer. Verify cross-map scoping and cleanup-only behavior |
| `get_authorized_map_fog_delta` | Direct identity, `user_id`, map/WHERE, UPDATE/INSERT and FOR UPDATE; lexical call to `get_authorized_map_fog_v2`. Not sufficient proof against #212 fog metadata exposure and no signed P1/P2 tests |
| `release_campaign_sheet_item` | Direct identity, `holder_id` and `campaign_id`, WHERE/DELETE; existing original-source R115 PG17 regression confirms **own stale sheet lease cleanup** is retained when #220 guard is applied in scratch |
| `release_campaign_tool_item` | Direct identity, `holder_id`, WHERE/DELETE, no explicit `campaign_id` word. Actual user-ownership/lease-token binding has **not** been source-exact or signed verified |

All **eight original current functions** are postgres-owned PLpgSQL SECURITY DEFINER, authenticated EXECUTE true, anon EXECUTE false, explicit empty search_path. All include at least one direct `auth.uid` text marker and WHERE text marker. **No current hosted function has been executed**. The current SQL body hashes and fixed lexical source flags are SHA-pinned; any drift fails a strict source-only gate. A source marker or name such as `release` is *not* a correctness certificate.

## Existing source-exact disposable PostgreSQL17 lease regression

R208 re-runs the **unchanged** `tests/world-v2-r18-115-postgres/run.sh`, with exactly its existing Git blob, original source SHA-matched sheet claim/GET/PATCH/mutate/release and current **UNAPPLIED** candidate. It verifies that a revoked fictitious sheet owner is denied claim/GET/mutate/PATCH but still may release **their own stale lease**, while other actors cannot release their lease. The active campaign DM, separate-campaign denial, legitimate re-add and 23 lease scenarios are retained. This is **not** a source-exact tool-item release test nor hosted signed-player acceptance. It uses only isolated loopback PG17 and fake roles/UUIDs.

**Future acceptance requirement:** (1) after campaign revocation, new movement and asset authorization must fail; (2) cleanup of the **same actor's own** pending movement state/lease remains possible without granting movement, mutable character access or another actor's cleanup; (3) cross-map/campaign/outsider identity cannot target other actors' records. Do not add blanket current-membership checks to cleanup endpoints without preserving this distinction. Require exact current SQL semantic review plus signed multi-user QA before any installed repair.

## Hard scope and release boundary

No original/QA database modification, active SQL migration, frontend runtime, Supabase Edge, Vercel config, merge, deployment or paid resource. No extra WSL report required for R208. Security release **NO_GO** remains for #212 fog, #220 revoked sheet, #223 invite rejoin, #229 membership TRUNCATE, #231 signed Storage URLs and #306 authenticated TRUNCATE privileges, all 67 currently callable privileged function authorization semantics, all 83 private historical migration semantic approvals, signed DM/P1/P2/revoked/outsider QA and separate QA/production authorization.
