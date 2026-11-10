# B04 — Hostile-authority regression and isolated PostgreSQL 17 verification

**Recorded:** 11 November 2026 (Australia/Melbourne). **Engineering step:** B04 only.  
**Staging source:** B03 draft PR #78, head `012a368a1ce62ed21637bee3eb6597b8930336ef`.  
**Production source:** `main@b246b3a72537b53b2afc2a9a38cbe1db3609a8af` (confirmed unchanged).  
**Status:** Tests staged and run; **candidate SQL COMPILED in disposable PostgreSQL 17**, 61 assertions passed, direct-role checks passed. **B04 is not a deployment approval; one existing altered-replay API contract gap remains**. A06/Gate A still blocked.

## 1. Test infrastructure and source fidelity

The workflow `.github/workflows/world-v2-b04-postgres.yml` uses an ephemeral GitHub-hosted `postgres:17` service with a disposable `world_v2_b04` database, no production credentials, and a test-only password. `tests/world-v2-b04-postgres/run.sh` refuses nonlocal PG hosts or any database name other than `world_v2_b04`.

- `schema.sql`: minimal isolated map, member, token, tool, character, rules, private motion-session, gesture budget and private test sink structures. **Test-only stand-ins** for `auth.uid()`, `public.can_view_campaign_map` and `public.is_campaign_dm` read a mock session JWT setting and fixture membership; they are **not** production auth implementation.
- `extract_real_v2_functions.py`: extracts unchanged `swept_hits_segment`, `wall_passes`, `step_allowed`, `valid_point` and `session_valid` from the **actual checked-in V2 production migration** `20261109095000_world_engine_v2_motion_authority.sql`, plus the actual production `public.begin_world_motion_v2`, original `advance_core_v2`, and the public Advance wrapper from `20261109100000_world_engine_v2_private_observer_stream.sql`.
- The production recipient-filtered observer broadcaster is the **sole intentionally stubbed** server component for the public-RPC tests; its replacement logs accepted sends to a private test-only table. **Actual fog-of-war/LOS recipient filtering and delivery are NOT verified by this fixture** and remain integration gates.
- `supabase/candidates/world_v2_b03_path_validation.sql` is loaded **only** into that ephemeral instance; it is not installed on production or included in `supabase/migrations`.
- `hostile.sql` runs all candidate cases inside a transaction which is **rolled back**; it checks no session or canonical token/tool update by the candidate. Browser-role EXECUTE/USAGE grants are verified with PostgreSQL metadata **and actual attempted SQL calls**. The tests also call the production public RPCs with a `SET ROLE authenticated` fixture JWT.

**Resulting assurance:** executable PostgreSQL compilation and high-confidence function-level authorization/collision/regression evidence against the candidate; **not** a complete Supabase Auth/PostgREST/RLS/Realtime production integration test, nor a benchmark of real client movement.

## 2. Exact verified evidence

| Evidence | Status |
|---|---|
| Isolated PostgreSQL 17 test workflow | **SUCCESS** — [run 42824086455](https://github.com/xuvenz-source/ttrpgsite/actions/runs/42824086455), source head `69d8d8bb8c9943f780d27844456e7f3d6bf7fbab` |
| Automated SQL assertions | **61 passed**: hostile H01–H40 where defined, legitimate P01–P16 where defined, access-control G01–G05; **zero assertion failures** |
| Direct browser-role access checks | Both `authenticated` and `anon` **denied** direct private helper execution by PostgreSQL permissions; `anon` **denied** public Begin; `authenticated` was able to invoke public Begin and Advance only with appropriate fixture authorization |
| Source CI at `69d8d8b...` | **SUCCESS** — [run 42824086633](https://github.com/xuvenz-source/ttrpgsite/actions/runs/42824086633); final merged ancestry / PR head must be rechecked separately |
| Current production / schema | `main` unchanged; SQL candidate remains under `supabase/candidates`, **never applied to live Supabase** |
| Live DM/P1/P2 vision, collision, renderer, p95 | **NOT RUN**. A06 and Gate A remain BLOCKED / NOT PASSED |

The initial test run [42823049848](https://github.com/xuvenz-source/ttrpgsite/actions/runs/42823049848) failed on an **ambiguous PL/pgSQL fixture variable** after already passing H01–H17. The variable was removed; subsequent SQL workflows passed. This was a fixture issue, not an unacknowledged candidate exception.

## 3. Attack and positive-path matrix

The suite verifies in an isolated DB:
- **Identity / BOLA / privacy:** H01 foreign actor with valid stolen session UUID, H02 missing JWT, H03 foreign player token, H04 concealed DM NPC, H22 revoked map membership, H23 changed ownership, H24 changed visibility, H25 moved-to-another-map, H35 foreign character, H36/H37 direct public Begin with another user's token/hidden NPC, H38 direct public Advance with another user's session, H40 direct public Begin as actual authenticated role with a foreign token.
- **Sequence / scope / quota:** H05/H06 missing/out-of-order sequence, H07 same-sequence candidate validation denied (after manually advanced server seq), H08/H09 forged origin, H10/H11 fractional or extra target fields, H12/H13 oversized route/target arrays, H14/H15 whole-session limits, H16–H20 stale requested/current scene, permission and rules generations, H21 expiry.
- **Collision / rule authority:** H27 solid wall with `oneWay` *vision* attribute cannot be bypassed; H28 closed door; H29 insufficient attribute threshold; H30/H31 missing or malformed collision scene; H32 group blocked by *mount footprint* even while grabbed token anchor would fit; H33 newly held tool; H34 changed tool owner. Positive cases verify legal open door, window, attribute threshold, authorized DM override, legitimate linked character and mount movement.
- **Canonical and private state:** P02–P04 confirm candidate validation alone does not advance `motion_sessions.last_seq` or `map_tokens` / `campaign_tool_issues` positions. The candidate's return is a bounded accepted prefix and server-internal `routeSteps`, not client-exposed wall geometry.
- **RPC/role boundary:** actual public `Begin` and `Advance` source is invoked against the fixture and supplies the current public ACK shape; sequential approved advance emits **one** test sink event, identical replay emits none. G01–G05 inspect actual schema grants, function grants, invoker security bit and RLS metadata.

**Known limitations:** no separate RLS database roles for every Supabase table, no authentic Supabase Auth JWT signature verification in the fixture, no real per-recipient Realtime/LOS, no commit checkpoint or fog explorer integration, no true multi-tab concurrent race, no SQL performance or browser p95 capture, no verified difference between `public.advance_core_v2` and the not-yet-wired B03 helper beyond the direct test comparisons. These remain B05–B10 and A06 gate work.

## 4. Discovered API contract gap — must not be misreported as a denial

**H39 (direct source-real public RPC):** after an authorized Advance `seq=1`, a repeated request using the same session and sequence **but a different target route** yields the **previous cached public ACK**, rather than a generic denial. The test showed it **does not extend the canonical approved session endpoint, change `last_seq`, or produce another observer send**. The behavior is in the pre-existing `forge_world_v2.advance_core_v2`, not introduced by B03.

This falls short of the B01 protocol's requirement that same-seq retries have the **identical payload**. B04 has deliberately **NOT** asserted H39 was rejected; it is a documented B08 (or earlier staged authority hardening) blocker. The eventual fix should persist an actor/session/sequence-bound hash (or exact normalized request) with the last safe reply, compare on replay **after** rechecking current rights, reject payload mismatch generically, and ensure replay never emits duplicate observer data or allows a final commit with unauthorized route. Such SQL changes need separately audited migrations and hostile tests; **do not retroactively patch production under B04**.

## 5. Security and release decision

**B04 suite: STAGED and executable tests PASSED on inspected SHA, with a known existing authority contract blocker.**

- **No impact:** No production SQL DDL/DML, Edge deployments, public grants, frontend feature changes, live test campaign edits, merge, or user-visible movement behavior changes.
- **Preserved invariants:** New B03 private validator requires server session/actor/generation, enforces every cell and rigid footprint, fails closed without scene, denies invalid groups, and does not write or broadcast. Actual SQL tests substantiate these on the fixture.
- **Not release ready:** H39 stricter idempotency gap, A06 real DM/P1/P2 baseline missing, PR #71 amendment blockers, full fog observer tests, commit/reconciliation and integrated release gates pending. An exact-head workflow success does not waive these.
- **Next numbered microstep:** **B05** (client ordered gesture coalescing) is planned but requires a separately recorded staging-only sequencing decision while Gate A is blocked, or actual Gate A completion. B04 does not auto-authorize runtime code staging or deployment.

**References:** B01 authority contract, B02 transport decision, B03 SQL candidate and path-validator architecture; [Supabase securing API/grants](https://supabase.com/docs/guides/api/securing-your-api), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
