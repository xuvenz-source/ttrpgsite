# B10-R18-23 — Live history/catalog reconciliation and real Auth acceptance gate

**12 November 2026 · Australia/Melbourne · STAGING ONLY · LIVE SQL/FRONTEND NO-GO**

## Source, scope, and permitted operations

R18-23 is based on the **verified R18-22** draft PR #125 at exact SHA `e42bfa83a7df01caab61c5ad047ba74ff9f5e37c`. It preserves the 23 accumulated work branches and does not change the frozen R05 migration or R18-17/19/20 candidates. Protected Git main remains R16 `90df8c960e79e8d66c322095611427da7bb09de4`, and the serving frontend remains separately approved R18-15. **No deploy, migration, Auth changes, RLS changes, paid branch or guarded recovery toggle is authorized.**

This step separates three different kinds of evidence: **(1)** actual live READ-ONLY database metadata, **(2)** genuine pinned authenticated CLI history fetch/dry-run, and **(3)** independent browser and Realtime privacy acceptance. Success in (1) must never be reported as success in (2) or (3).

## 1. Read-only production findings, checked on 12 November

The connected existing Supabase Free project has reference `lwhwgqaunxbmvyndswze`. The live queries did **not** read client credentials, JWT values, campaign content, hidden token coordinates or raw historical SQL.

- Read the **83 actual migration statement arrays** using `supabase/release-preflight/world_v2_b10_r18_08_readonly_migration_body_hashes.sql`, compute the exact `md5(array_to_string(statements, E';\\n') || E';\\n')` required by the pinned CLI history fetch format, and compare version, name, statement count, and digest against the staged R18-08 baseline: **83/83 exact matches; zero discrepancies**.
- Live history remains **83 registered**, latest `20261109171247`; R05 `20261111023204` **is not registered**.
- The new **single SELECT** `supabase/release-preflight/world_v2_b10_r18_23_readonly_security_catalog.sql` ran successfully in the live project: **7/7** existing function definitions match the frozen R05 baseline MD5, **0** active unexpired V2 movement sessions, and no R05 backup, B03 path helper, B07 pending/budget tables, B08 drain, or B08 cache columns.
- Both client roles lack `USAGE` on `forge_world_v2`; **6/6** inspected private World V2 tables have RLS enabled and no direct client `SELECT` grant. `anon` cannot execute any of the **7/7** inspected public World V2 RPCs; `authenticated` can execute the expected Advance RPC. These are *catalog checks*, not proof that a privileged RPC's internal authorization is correct.
- The current `realtime.messages` catalog contains World V2 private observer/topic policies. Their presence is **not a signed two-player subscription test**.
- Aggregated campaign membership counts confirm there is at least **one test campaign with one DM and two player memberships**. No user or campaign identifiers were exported.

**Result of (1): PASS, at the moment observed.** It can expire and must be repeated before any future migration. Neither R05 nor any later SQL was installed as part of this check.

## 2. Reproducible narrow evidence gate

New `scripts/release/validate-world-v2-r18-23-readonly-evidence.mjs` accepts only a *fresh, external JSON evidence file* combining the separately obtained 83 hashed history rows and the single R18-23 catalog row:

```json
{
  "projectRef": "<verified existing Supabase project ref>",
  "observedAt": "<UTC ISO-8601 timestamp within the past 30 minutes>",
  "historyRows": ["<83 objects from R18-08 SELECT>"],
  "catalogRows": ["<one object from R18-23 SELECT>"]
}
```

The placeholder strings above are documentation only; supply real output rows in the secure operator environment. Store the evidence OUTSIDE Git, not in a PR/CI log. Run the validator locally with `node scripts/release/validate-world-v2-r18-23-readonly-evidence.mjs --evidence=/secure/external/path.json`. It is a pure consistency gate, cannot make a Supabase network request, never signs in as a user, and **always returns `NO_GO` even on success**. User-supplied JSON is not cryptographic evidence of source provenance; read-only database verification should be independently witnessed.

`tests/world-v2-r18-23-readonly-evidence.test.mjs` contains adversarial input checks (old/future evidence, wrong project, every historical field, R05 partial install, changed function source, unsafe grants or RLS, malformed catalog). The source test also enforces that the new SQL file remains a single read-only statement.

## 3. Authentication: what is still NOT verified

The connected GitHub and Supabase tools do not provide three independent signed-in browser sessions or the **operator's linked Supabase CLI v2.81.3 authentication**. Supabase SQL `SET ROLE authenticated` with injected request claims is NOT equivalent to real signed-in client Auth. Neither SQL simulation nor same-account DM player preview can clear this gate.

Do **NOT** issue an R05 migration, change Realtime policies, create synthetic identities in the live project, copy player credentials into chat, enable the 700 ms guarded observer mode, or force a CLI version upgrade to work around these limitations.

### Required real-account QA matrix (existing disposable test campaign only)

| ID | Session/actions | Must hold to pass |
| --- | --- | --- |
| A01 | DM, Player 1 and *passive* Player 2 use distinct authenticated browser profiles | All sessions independently sign in; account identities not reused |
| A02 | DM publishes permitted map; P1 and P2 enter | Each sees only their authorized map and signed sight |
| A03 | P1 moves their own token; P2 never touches it | DM/P1/P2 final committed cell converges without flashing or divergent token |
| A04 | P1 attempts unauthorized token movement | Server denies it; no canonical write or hidden data is exposed |
| A05 | DM moves a hidden NPC beyond P2 line of sight | P2 receives no secret ID, sprite, position, path or geometry |
| A06 | NPC enters and leaves P2 sight | P2 appears/disappears only with signed entitlement; no stale sprite |
| A07 | P1 and P2 have different personal fog or map assignment | Each receives their own visibility scope, never the other's |
| A08 | Revoke P1 campaign/map permission while signed in | Newly requested private sight and topics denied; local view seals; no new grants |
| A09 | Demote DM to player while session remains signed in | DM-only preview, hidden NPCs and sight privileges vanish on fresh authorization |
| A10 | P2 tries P1's recipient topic/map | Private subscription/signed visibility denied; no observer packet disclosure |
| A11 | Drop/reorder a private observer update; background, foreground and reconnect | Signed recovery converges without unauthorized replay or stale visibility |
| A12 | Two 12-second signed watch cycles with all three tabs active | No full-map flashes, unexpected reloads, memory runaway or unbounded polling |

Record **pass/fail**, visible symptoms, generic RPC p50/p95 and bounded redacted `WorldTrace` event counts separately for DM/P1/P2. Do not paste JWTs, raw network headers, account IDs, hidden-world coordinates, complete signed sight payloads or secret NPC data into PRs or chat. DM player preview is explicitly **not** a substitute for P2. Use a distinct real browser session, not synthetic `request.jwt.claim.sub` settings.

**Fail immediately** on any forbidden fog/NPC disclosure, repeated full-map seal, unapproved movement, private topic cross-recipient leakage, unauthorized access after revocation, divergent canonical token position, or severe free-tier resource regression. Existing R18-11 synthetic revocation test is useful regression coverage but does not discharge A01–A12.

## 4. Remaining migration prerequisites and exact order

1. R18-23 live catalog and history baseline are read-only **PASS**, but a real, externally isolated **pinned Supabase CLI 2.81.3** `migration fetch --linked`, 83 file-body digests, `migration list --linked`, and **R05-only** `db push --dry-run --linked` have **NOT** been run. Use the existing R18-12 operator-only runner, which cannot apply SQL.
2. Supabase CLI v3 became the default in November 2026 and changes default database targets. Do not silently replace the pinned v2.81.3 runner with unreviewed v3: https://supabase.com/docs/guides/local-development/cli/migrating-to-v3
3. Explicit separate **frontend compatibility canary approval** precedes R05 SQL. Keep guarded observer 700ms mode OFF. Require real A01–A12 pre-SQL minimum on a build whose signed recovery is actually enabled, not only R16/R18-15 local preview.
4. **Separate SQL approval** after fresh version/body hashes, seven sources, zero sessions, exact R05-only CLI dry-run and Auth security acceptance. Install only frozen R05 if independently authorized, verify 84 versions, then separately review and version R18-17, corrected R18-19, R18-20 after re-reading post-R05 installed function sources.
5. Post-SQL rerun protected 24-case DM/P1/P2 matrix from R18-06, including 2x2 mount, private fog and revocation, and a sustained free-tier lag/RAM test. This is mandatory before further frontend or security toggle release.

## Handoff

- **Status:** R18-23 read-only subgate completed; independently authenticated CLI and real signed multiplayer security remain BLOCKED/UNEXECUTED. Do **not** mark R18-23 fully accepted.
- **Source:** R18-22 PR #125 exact staged SHA noted above; new R18-23 draft stage is stacked and nonproduction.
- **Security posture:** no change to source migration SQL, no elevated credentials, no production writes; no claim of true browser fog isolation.
- **Release decision:** **STAGING NO-GO for frontend AND SQL**. Do not merge any step or advance to an installation based solely on these passing catalog checks.
