# B10-R18-209 — World Motion V2 revocation between begin, advance and commit (NO_GO)

22 November 2026. Nested **source-only child** of [R208 draft #318](https://github.com/xuvenz-source/ttrpgsite/pull/318) final parent SHA `98947a532e199b9ecf40f09f2a2f310a22f3b037`, dedicated `44922737668` and full staged repo `44922737602` exact-head CI both **SUCCESS**. Owner R206 sanitized report establishes 83/83 original private historical SQL SHA-verified and 11/11 known original historical callable/helper body source match; original private 83 SQL and docket never uploaded.

## Original installed source evidence, SELECT-only

Reproducible `scripts/release/r209_readonly_world_motion_phase_gates.sql` queries only `pg_catalog.pg_proc`, computing **inside original PostgreSQL** the source SHA256+UTF-8 byte length, role EXECUTE booleans, known helper lexical markers and approximate code offsets for **four known World Motion V2 public RPCs and the map visibility helper**. No original function bodies, signatures, table rows, Auth identities, campaign IDs, private SQL, JWTs or signed URLs leave PostgreSQL.

All five are postgres-owned authenticated-callable, anon-execute-denied SECURITY DEFINER, with explicit empty search_path. Exact original current body fingerprints are immutable in R209 manifest:

| Phase | Body length | Observed lexical/structure markers |
|---|---:|---|
| `begin_world_motion_v2` | 5,561B | `auth.uid`, `can_view_campaign_map` at character offset 811, `is_campaign_dm` at 886; no direct `campaign_members` table word; inserts/updates/deletes in body |
| `advance_world_motion_v2` | 1,150B | Direct `actor_id = auth.uid()` marker; **no direct map/DM/member authorization helper**; one `FOR UPDATE` row-lock marker |
| `commit_world_motion_v2` | 5,796B | Direct `actor_id = auth.uid()`; map helper at 811, first `FOR UPDATE` row lock at 581, **first schema-qualified `UPDATE public.` at 4,994**, hence the map helper *text* occurs before that particular write; 3 row-lock words |
| `cancel_world_motion_v2` | 205B | Direct actor-equals-uid marker and DELETE; **no direct map/DM/member word** |
| `can_view_campaign_map` | 448B | Direct `auth.uid()` and `campaign_members` reference, established earlier R204 live source SHA; no direct DML word |

The important security question is **time of check versus time of use**: campaign authorization at `begin` does not automatically authorize continued access after the actor is removed. `advance` may update temporary actor-owned session state; it should not be allowed to move a final token after revocation. `commit` refers to `can_view_campaign_map`, which checks present membership, but *lexical ordering does not prove that every token-changing branch enforces the helper or that the caller's map/campaign binding is correct.* Conversely, making `cancel` require present membership could unnecessarily strand a removed actor's own pending session.

**Do not claim a hosted revocation exploit** from these markers alone. No original function was executed with a signed token; we did not export current SQL to review every PLpgSQL IF/EXCEPTION/return branch.

## Dedicated isolated PostgreSQL17 regression

The R209 GitHub Actions synthetic test creates fabricated campaign membership, token, session and account identities **only in a disposable local PostgreSQL 17 container**. It checks:

- Active synthetic player can begin and advance a session while still a current member.
- Owner is removed from membership **between beginning and committing**.
- Actor-only advancement of the existing fake pending session is possible, but **final token commit MUST be denied** by current-member map authorization, leaving token unchanged.
- Neither another current DM nor an outsider may advance/commit/cancel that actor's session; an outsider cannot start a new campaign session; a current DM cannot start a session in another campaign.
- The removed actor **can cancel only their own stale session**; cancellation stays idempotent. The active current DM can still begin, advance and commit after revocation.
- An **intentionally unsafe fictional** commit function allows `map membership OR previously staged movement`, reproducing a revoked-actor final token update **only inside immediate ROLLBACK**; safe original fictitious routine and prior token bytes must be restored.

The synthetic SQL is **NOT source-exact hosted World Motion V2 code**, and fake session user settings are **NOT Supabase signed DM/P1/P2 tokens**. This regression proves the intended security boundary on a representative fixture, not original runtime behavior. No original private migration or function body is exported or used by CI.

Fail-closed R209 source-only Python validator SHA-pins every current original source fingerprint, exact gate-offset metadata, query and synthetic-runner Git blobs, and **owner's only R206 sanitized report SHA**. Hostile tests deny drift, invented proof of hosted signed revocation, bypassed source checks, approval flags or unauthorized hosted action. The workflow also rejects any diff in `src/`, active Supabase migrations/Edge code or `vercel.json`.

## Pending release gate

Verify actual current original PLpgSQL boolean control flow and correct map/actor token binding in **each** commit and update path; test live signed DM, P1, P2, newly removed former member, outsider, cross-campaign account and race between stage/commit **only after independent isolated QA installation authorization**. Pay attention to one-hour Storage signed links and original pending #212 fog, #220 revoked sheet owner, #223 invite rejoin, #229 privileged membership TRUNCATE, #231 signed bearer and #306 authenticated table TRUNCATE privilege. All 83 private original migration **semantic** reviews, all 67 authenticated-callable privileged function semantics, real signed QA and production approval remain **NO_GO**.

**Scope held:** no original/QA SQL writes, app/Edge/runtime/active migrations/production-config changes, merges, deployments or paid services. No manual WSL upload required for R209.
