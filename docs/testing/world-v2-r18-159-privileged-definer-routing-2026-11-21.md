# B10-R18-159 — Privileged function authorization chain audit (source only)

21 November 2026. Exact green parent PR #266 R18-158 at 1b093aedc9180e6fd7d1fd6d3a5f108dbe882226. **NO_GO**. No original/QA writes, migrations, frontend runtime changes or deployments.

## Read-only current original database audit

There are **85** public-schema SECURITY DEFINER functions. Of those, **67** are executable by authenticated role, **zero** by the anonymous role. All 67 authenticated-callable definitions have an explicit function-level search_path; none uses public as its explicit search_path and no direct dynamic EXECUTE marker was detected by the limited textual scan. These are useful baseline controls, not evidence that 67 function permission semantics are safe.

**Seven** authenticated-callable privileged definitions lack literal auth.uid in their own body. A direct identity marker is not required when a trusted internal helper enforces current permissions, so we traced their first-level call-chain categories:

- get_campaign_sheet_inventory and patch_campaign_sheet_noninventory: both depend on sheet editing helpers, notably can_edit_campaign_sheet. The current helper still contains the previously reproduced **revoked-character-owner membership omission**, security issue #220. This is a CONFIRMED source-level gap in the connected privileged RPC chain, not a new vulnerability or a fix already deployed. Their own lack of a direct auth.uid marker is not the root cause.
- get_dm_map_npc_values and get_npc_token_values: delegate campaign authorization to is_campaign_dm. That helper checks auth.uid and current membership/DM role. Still requires real signed actor testing, but the missing direct auth.uid marker is not sufficient to label these vulnerable.
- publish_map_environment: current campaign DM check wraps fog/collision publication mutations. It delegates permission checks to is_campaign_dm and remains an elevated write path requiring signed tests.
- preview_map_motion: delegates to a private forge_visibility movement dispatcher; live catalog inspection identified direct auth.uid, current membership, DM-role and map-authorization checks within the dispatcher. Original movement state and signed authorization remain open.
- is_map_fog_published: an authenticated-callable privileged function returns fog enforcement metadata for a provided map ID without a direct signed-user/map-membership guard. This matches the previously tracked fog metadata oracle issue #212; do not declare it newly fixed. It is not callable as anon.

These classes are read-only source and call-graph observations; none of the seven has been fully authenticated-tested in live QA and the other sixty callable privileged functions remain unreviewed.

## Revoked-character-owner issue: exact source confirmed

Current original can_edit_campaign_sheet body MD5 matches the already recorded issue #220 source fingerprint 5a8fed2bdc8427c884f89440c0eebe03 (790 bytes). It checks actor via auth.uid but permits an assigned character owner without requiring an active campaign_members entry. Character ownership references campaign and auth user directly, not membership; removal of a campaign_members row need not erase the character's assigned owner. There are **zero** currently owned characters missing campaign membership in the read-only aggregate, but that is NOT a safety guarantee for future revocations.

Existing draft **PR #219** at commit 920cd0801b098d3c5de4e8e36a1aa5dca82d1add stages a **source-only, unapplied** helper guard that requires current campaign membership in addition to existing owner/DM constraints. Its dedicated synthetic PostgreSQL17 security suite and standard repository checks were green when rechecked; it has never been installed in original or QA. **Reuse PR #219, do not create another competing patch.** The helper's direct authenticated and anon EXECUTE rights remain revoked, though privileged authenticated RPC wrappers call it legitimately.

Issue #220's prior synthetic PG17 replay reproduced that revoked owner could still claim inventory/get sheet/patch because of the old helper, and its staged repair prevented them while preserving DM and legitimate reinstatement scenarios. This remains a **release-blocking security issue**.

## What cannot be concluded

Zero direct anonymous grants, function search_path and helper usage do not prove full authorization correctness. Function overloading, original R111 history, runtime grants, different privileged callers, visibility subscriptions, signed URL bearers, stale Realtime sockets and external service-role writers remain pending. Do not mark all 67 functions reviewed or historical 83 migrations secure based on this metadata.

Security issues #212, #220, #223, #229 and #231 remain unresolved. R153's 18 signed-user QA cases remain NOT_RUN. Original 83 private migrations remain 0 independently approved; QA app schema remains uninstalled. R127 owner production release requires explicit separate approval.

## Engineering decision

This is **source-only risk classification**, not a new SQL migration. The next security work should reconcile already-staged PR #219 and any other original source defects with a reviewed forward migration **only after** the separate QA historical replay/security gates are met. Avoid duplicating the repair or installing old scratch prototypes directly. No new Ubuntu command is needed in R159.

**NO_GO**: no original or QA SQL changes, migration, production or preview deployment, merge, browser privilege, paid infrastructure or fake release signoff.
