# B10-R18-171 — Campaign membership lifecycle, privileged writer and invitation replay contract

21 November 2026. Exact child of all-green R18-170 [draft PR #279](https://github.com/xuvenz-source/ttrpgsite/pull/279), commit `9d3f86fb53bec655880b2c048cc3cefb1c411994`. **NO_GO; source-only and original catalog queries only.**

## Direct original evidence — no hosted writes

`public.join_campaign(p_invite_code)` is a signed-only privileged function, MD5 `9fd65eca8e3160acd7a674931aad51c5` / 742 bytes. It looks up a reusable campaign invite, inserts a player membership with ON CONFLICT DO NOTHING, and does not look up a removed-member tombstone. R119 source-exact synthetic tests reproduced old-invite rejoin after member deletion. Current signed QA was not executed; distinguish this observed source vulnerability from an independently demonstrated live account exploit.

`campaign_members` currently has RLS on, no forced RLS and **zero enabled custom triggers**; `authenticated` has SELECT but no INSERT/UPDATE/DELETE/TRUNCATE. `service_role` has all four write/TRUNCATE privileges; it bypasses RLS. The table has a PK on `(campaign_id,user_id)`, role CHECK values `dm/player`, and two cascading FKs: `campaign_id` → campaigns and `user_id` → auth.users. `campaign_player_maps` cascades on membership deletion. `campaigns.owner_id` itself cascades from auth.users and can currently be updated by a privileged service role. No ordinary-user direct table write or complete live exploitation is claimed.

**Critical nuance:** A tombstone trigger that treats every deleted member identically might also fire under Auth user deletion or campaign deletion via cascading FK. Distinguish intentional DM removal from cascade cleanup and voluntary leaving in the reviewed semantic contract; prove it in a disposable PostgreSQL17 integration and signed QA. PostgreSQL TRUNCATE is not row-level DELETE and bypasses ordinary DELETE row triggers, so a tombstone alone cannot close that privileged path.

## Reuse existing scratch repairs — avoid duplicate SQL

The same staged candidate paths/byte-pins as the manifest are reused:
- R120 [PR #226](https://github.com/xuvenz-source/ttrpgsite/pull/226): unapplied tombstone ledger and DM explicit reinstatement prototype
- R122 [PR #228](https://github.com/xuvenz-source/ttrpgsite/pull/228): unapplied member identity-key UPDATE guard, insufficient by itself
- R148 [PR #256](https://github.com/xuvenz-source/ttrpgsite/pull/256): scratch REVOKE TRUNCATE, statement TRUNCATE deny and role-update deny guards; **negative control** still permits service_role to INSERT a new DM who was never revoked
- R150 [PR #258](https://github.com/xuvenz-source/ttrpgsite/pull/258): scratch REVOKE service_role INSERT, but active backend and external admin membership workflows remain unaudited

Changing direct grants without determining actual server-side admin routes could break legitimate membership management. A table owner may disable triggers. Do not claim these four candidates jointly prove secure production writes or that an authenticated browser can itself exploit service_role grants.

## Gate order and acceptance

The 14-case `staging/world-v2-b10-r18-171-membership-lifecycle-source-contract/manifest.json` matrix separates DM/player signed workflows from privileged administrator and Auth-cascade tests. None is run. An intentional DM removal should deny old generic invites until a trusted DM reinstates the user. A voluntary leave should follow an explicitly approved distinct policy. Auth user/campaign deletion must never accidentally preserve usable access or recreate campaigns.

Before applying any candidate: review private historical migration semantics, service/admin owners and external writers, map out the authorized campaign creation/reinstatement flow and confirm isolated QA-only target and owner QA install approval. Combine the already-reviewed fixes into a **new forward-only** migration rather than applying `staging/` scratch SQL. Run all signed/privileged negative and positive acceptance, cover current #220 sheet and #212 fog, stale Realtime, issued Storage URLs, and free-tier lock/performance constraints. Keep R127 production approval separate.

This is a single-AI technical review; no second reviewer is required to continue technical investigation, but this is not an independent second-party certification. No original/QA SQL, raw function bodies, app files, migration history, merge, deploy or paid service changed.
