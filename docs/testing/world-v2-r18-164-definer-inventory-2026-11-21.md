# B10-R18-164 — All 67 authenticated-callable SECURITY DEFINER inventory and strict historical parity

**21 November 2026 | NO_GO | source-only.** Exact parent R18-163 [PR #271](https://github.com/xuvenz-source/ttrpgsite/pull/271) at `e04df51e38d0a26d9c33c53317679d347a3005e3`. The parent dedicated checks, standard staged checks and combined scratch PostgreSQL integration had succeeded before this review step.

## 67-function read-only original catalog inventory

The live original public schema has **67 authenticated-callable SECURITY DEFINER routines** and zero anon callable. Each has a sanitized inventory entry in the manifest: name, identity arguments, source size, authorization/source marker booleans, and **NOT_YET_COMPLETE** semantic review status. No raw live function body, private user record or key was exported.

Read-only classification:
- **60** directly mention `auth.uid`; **7** do not, with the seven separately classified in R159.
- **50** mention at least one recognized `is_campaign_dm` / `is_campaign_member` / `can_view_campaign_map` / `can_edit_campaign_sheet` / `can_observe_map_token` helper.
- **12** mention `campaign_members` directly; **25** reference private `forge_visibility` code; **42** contain row-writing text markers.
- **0** direct dynamic-EXECUTE format/query text markers. None of these lexical counts proves access-control correctness.

Three function bodies with a write marker and neither a known helper marker, direct campaign_members marker nor private dispatcher were inspected separately as current actor-scoped cleanup DELETE paths: `cancel_world_motion_v2`, `release_campaign_sheet_item`, `release_campaign_tool_item`. Each has an `auth.uid` marker, a WHERE clause and a scoped session/holder identifier. Current source does not display the obvious broad-delete signature, but **signed actor and dependency tests remain necessary**; R115 already tested lease cleanup with synthetic actors, not real hosted users.

The single authenticated-callable helper with Auth user or metadata marker is `get_campaign_account_names(p_campaign uuid)`; live return signature is only `user_id uuid, account_name text`. Current code includes actor, membership and campaign scoping markers, and no email source marker. User metadata is used within the helper, but whether the projection reveals any inappropriate name information across roles must still be checked with signed actors.

## Stronger 14-file provenance comparison

The 14 Git SQL files that did not exactly match stored original SQL were re-compared **in a transient read-only operation using a quote-preserving SQL lexical normalizer**, preserving single/double-quoted values and dollar-quoted function bodies while excluding only external comments and whitespace. **14/14 matched under this stricter normalization** (the last filename has a different applied original version). This supports nonfunctional formatting/comment drift rather than source body changes, but is not a formal PostgreSQL parser or legal equivalence certificate. They remain NOT_YET semantically approved. Combined provenance remains 47 exact, 14 normalized, 22 original-only, one Git-only unapplied candidate.

## Security and release decision

Known #220 revoked sheet-owner and #212 fog status remain source-confirmed live release blockers. #223 stale invite rejoin, #229 privileged membership TRUNCATE/UPDATE, #231 issued signed URLs and stale realtime, and #218 inventory UUID churn remain unresolved. The 67 function flags cannot convert any release gate to PASS.

The user designated the AI lead as sole trusted reviewer; no further human reviewer is required to **continue technical review**, but the lack of a second-party audit is recorded for separate owner release risk acceptance. No original or QA writes, migration install, app source edit, merge, deployment or paid service was made.
