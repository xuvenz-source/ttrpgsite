# B10-R18-165 — Original privileged cleanup and campaign display-name authorization

**21 November 2026.** Exact child of green R18-164 draft PR #272 at `5d266fe117b6fdc8307fde0c786bc59bd4dedb3d`. **NO_GO; source-only original `pg_proc` review.** No hosted SQL modification, new migration or active frontend change.

## Read-only original body inspection

Original live `pg_proc.prosrc` was inspected transiently for four public SECURITY DEFINER routines; the exact body lengths and MD5 fingerprints are pinned in `staging/world-v2-b10-r18-165-actor-scoped-cleanup-and-name-visibility/manifest.json` without copying their raw SQL to GitHub/CI. All four are authenticated-callable, anon-not-callable, postgres-owned and have a function-level bound empty `search_path`.

**Actor-scoped cleanup**:

- `cancel_world_motion_v2(p_session)` deletes only `forge_world_v2.motion_sessions` rows whose session ID matches `p_session` **and** whose `actor_id` matches `auth.uid()`.
- `release_campaign_sheet_item(p_campaign,p_source,p_source_id,p_field,p_item)` deletes only a matching exact campaign/source/field/item lease whose holder is `auth.uid()`. This agrees with the earlier R115 synthetic revoked-actor lease cleanup contract; no higher sheet edit permission is granted by cleanup.
- `release_campaign_tool_item(p_issue,p_item)` deletes only an exact issue/item lease with `holder_id = actor`, where actor is sourced from `auth.uid()`.

These are source-level **bounded deletion predicates**. Absence of a current campaign-membership check is not automatically a defect for cleanup of one's own stale lease or session; permitting stale ownership cleanup can avoid lock leaks after revocation. However it MUST NOT permit another holder's deletion or restoring sheet/map access; signed hosted QA and dependent table/trigger review remain open. The string- and AST-adjacent checks used here are not real-world abuse-case tests.

**Campaign account names**:

`get_campaign_account_names(p_campaign)` returns only `user_id` and `account_name`, joins current `public.campaign_members` to `auth.users`, binds the campaign ID, and requires `public.is_campaign_member(p_campaign)` in the query. Live helper `is_campaign_member(c uuid)` checks that `auth.uid()` owns a current membership row for the requested campaign. Both source fingerprints and EXECUTE ACL states are recorded.

The account-name fallback reads user-editable `raw_user_meta_data` **only for display keys** (`username`, `display_name`), not for authority. No email output source marker was seen. A current campaign member can view other current members' names, not necessarily only the DM. This may be an intended roster feature but needs a product privacy decision, cross-campaign signed QA and frontend safe-rendering verification; it is not now a signed privacy PASS. A `SECURITY DEFINER` reader accessing `auth.users` is sensitive and depends on exact helper behavior.

## Strict non-approval

This step narrows four functions from the 67-function authorization inventory to reviewed source predicates, **not** fully semantically approved or signed accepted. All remaining function chains and 83 original historical migrations still require verification. Known #220 revoked-owner and #212 fog metadata oracle remain unfixed in original, along with #223 invite reuse, #229 privileged membership writer, #231 issued URL/Realtime and #218 inventory UUID behavior. No green source-only CI may override NO_GO.

The project has a single AI lead technical reviewer. No additional reviewer is required to continue investigation; production owner release and explicit acceptance of single-reviewer residual risk are distinct decisions.
