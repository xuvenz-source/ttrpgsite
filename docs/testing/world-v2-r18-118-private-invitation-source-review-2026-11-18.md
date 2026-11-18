# B10-R18-118 — Private invitation source verification and DM-removal policy gate

**18 November 2026. DRAFT / source-only / original, QA and production NO_GO.** Direct parent R18-117 draft PR #222 at `b17e3adc4a9417e7ac9e8d076d4c31be82f16382`. Tracker [#223](https://github.com/xuvenz-source/ttrpgsite/issues/223) and release gate [#212](https://github.com/xuvenz-source/ttrpgsite/issues/212).

## What the read-only original Supabase catalog establishes

Without retrieving any SQL function body, invite code, user/campaign row or credential, SELECT-only `pg_proc`, `pg_attribute`, `pg_attrdef`, `pg_constraint` and `pg_policy` queries verified:

| Current original function | UTF-8 body bytes | MD5 | SHA-256 | Role |
| --- | ---: | --- | --- | --- |
| `public.create_campaign(text)` | 475 | `9a12043761641127b6f60304eea876c5` | `0ea1e01ba784dfa78e92c8e82a3ca2b2d28a19920f5286cc7423d1e891be645f` | `authenticated` EXECUTE; `anon` denied |
| `public.join_campaign(text)` | 742 | `9fd65eca8e3160acd7a674931aad51c5` | `5f3a7dbcadc4361f59fa814a820b84cfb2cc0d89f685ae6194efe3912d015655` | `authenticated` EXECUTE; `anon` denied |

Both are postgres-owned `SECURITY DEFINER` with an empty configured search path. These are elevated entrypoints; their own SQL has to enforce actor, invitation and membership permissions even if application tables have RLS enabled.

**Original `join_campaign` text-only flags:** references `auth.uid()`, `invite_code`, membership INSERT, player role literal, input trimming/lowercasing, `NOT EXISTS`, a `FOR UPDATE` lock and `ON CONFLICT DO NOTHING`. It does not contain an `ON CONFLICT DO UPDATE` clause, a directly referenced separate ban/join-request table, an invite rotation update, or obvious ban/revocation keywords. These are *bounded textual observations, not a semantic proof*. The `NOT EXISTS` condition still needs a trusted reviewer to inspect its full scope.

**Data model:** `campaign_members` uses primary key `(campaign_id,user_id)` with `dm` / `player` role constraint and RLS; `campaigns.invite_code` is uniquely constrained and its default uses **8 random bytes hex-encoded** (64 bits of nominal random entropy). These facts do **not** prove adequate rate limits or the absence of another application-level join path. No dedicated campaign-ban/join-request relation was present among the explicitly checked names. No invitation values or user records were read.

### Key security risk — not yet confirmed as an exploit

**After a DM removes a player, can they rejoin with the old, still-valid invitation code?**

Removing a membership row and using `ON CONFLICT DO NOTHING` does not, by itself, prevent a **new INSERT** for that same actor. The original function contains a `NOT EXISTS` guard whose meaning has not been reviewed, so we must not overclaim that rejoining is possible. This is a credible high-priority negative-account test and policy decision, not a proven hosted bypass. We are not performing a signed join against the existing test campaign.

## Proposed default behavior — subject to explicit product review

- **DM removal means revocation until the DM explicitly approves reinstatement.** A removed member should **not** regain access merely by knowing an old generic campaign invitation code. Separate voluntary leave from DM removal/ban; voluntary return may be allowed by an active invitation.
- A new user with a currently valid invitation may join as **player**, not as DM; duplicate joins must remain idempotent and never promote/demote the current DM's role. `ON CONFLICT DO NOTHING` supports the non-upgrade case but doesn't prove the rest.
- A revoked/rotated code must fail for everybody. Invitation creation/rotation should be DM-authorized, reject malformed codes without existence disclosure and be rate-limited with free-tier-compatible controls.
- All authenticated RPCs, RLS and Realtime must check **current server-side membership/revocation**, rather than a stale client or user-editable JWT metadata role. On DM removal, old subscriptions/caches must not continue receiving fog, maps, sheet contents or handouts.
- An eventual implementation might need a server-side removal/reinstatement marker or a more explicit per-user invite grant. That would require **new reviewed forward migrations** only after QA has passed its separate security gates. No schema proposal is authorized for installation now.

## Operator-local, privacy-preserving source parity tool

The source-only `scripts/release/inspect-world-v2-r18-118-private-invitations.mjs`:

1. Validates the full existing 83-file **original-only** Ubuntu history via the pinned R98 verifier and verifies the aggregate SHA-256 against the R98/R99/R108/R111 invariant.
2. Reopens the operator-private R111 docket beside the recovery workspace, requires mode 0600, 83 expected source-file fingerprints and all review decisions **PENDING**.
3. Examines only `CREATE [OR REPLACE] FUNCTION` declarations of `create_campaign` and `join_campaign` across the 83 verified local SQL bodies, respecting chronological order, and compares the **last body** to the current original `pg_proc` exact SHA-256, MD5 and byte length recorded above.
4. Emits **only** a `NO_GO` JSON summary: whether each latest historical definition exists, whether it exactly matches the current live-body digest, definition count, and non-sensitive boolean source indicators **only when the exact digest matched**. A missing or nonmatching function remains `NO_GO` and has no semantic indicators.
5. Does **not** execute SQL, connect to Supabase or GitHub, write to the original workspace, export SQL bodies, file paths, invite codes, campaign rows, access tokens or usernames, or authorize reviewers/QA/production.

The tool is only a prerequisite to a **human semantic inspection** of the exact private function bodies. It cannot conclude whether a user can actually rejoin after removal or whether a live hosted policy is secure.

### Operator-only manual command (after pinned CI passes)

Run in Ubuntu against the **existing** private recovery. Redirect only sanitized output to `$HOME/ttrpg-history-private/r118-sanitized.json`. Keep `r111-private-review-docket.json` and the SQL files private. Only upload the sanitized JSON receipt. The exact pinned commit is published in the PR handoff, not inferred from this document.

## Signed acceptance matrix, after independently approved QA bootstrap

| Case | Scenario | Required property |
| --- | --- | --- |
| INV-01 | Outsider with invalid/random code | No campaign disclosure or membership |
| INV-02 | First-time signed player with valid current code | Player membership in intended campaign only |
| INV-03 | Existing DM with valid code | No role demotion, no duplicate membership |
| INV-04 | Existing player repeats join | Idempotent, role unchanged |
| INV-05 | DM removes P1, P1 retries old code | Denied until explicit DM reinstatement under proposed policy |
| INV-06 | DM removes P1, P2 still legitimate member | P2 uninterrupted, P1 cannot read fog/map/handout/sheet or tool leases |
| INV-07 | DM deliberately reinstates P1 | Only authorized rejoin; correct role, scene, sheets and audit behavior |
| INV-08 | Old code after DM rotation | Denied; new code works for eligible users |
| INV-09 | Player/outsider attempts invitation rotation or promotion | Rejected |
| INV-10 | Immediate repeat join, concurrent signed clients | No duplicate or race-based role escalation |
| INV-11 | Null/expired signed Auth session | Rejected, no membership |
| INV-12 | Rapid guessing and malformed codes | Bounded rate and no useful oracle |

No signed QA cases in this matrix have been run. Their expected behavior is a **proposed** security contract, not evidence from the original function.

## All release gates remain blocked

The known hosted fog-status metadata oracle (R18-104), inventory UUID regeneration (R18-114 / #218), revoked character owner sheet access (R18-115 / #220), private historical 83-file SQL semantic review, independent original operator authentication attestation, all 67 privileged RPC review, QA-only history replay and signed multi-account authorization testing remain **NO_GO**. No merge, original/QA SQL mutation, Vercel deployment, paid infrastructure, historical rewrite or release approval.
