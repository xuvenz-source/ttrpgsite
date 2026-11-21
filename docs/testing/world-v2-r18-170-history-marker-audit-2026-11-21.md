# B10-R18-170 — Original history high-risk-marker adjudication

21 November 2026. Exact child of [R18-169 draft PR #278](https://github.com/xuvenz-source/ttrpgsite/pull/278) commit `e867a8d48293ac3903036d946f7b160b368e8ec8`. **NO_GO, read-only original Supabase.** This step deepens the R18-109 heuristic audit without exporting raw private historical SQL or copying credentials/data into GitHub/CI.

## Eight original history entries inspected

A fresh in-place scan of **83** registered stored migration SQL bodies found one `EXECUTE format(...)` file, one user-metadata reference file, ten containing `service_role` text, five containing `storage.objects` references, and five triggering an overly broad textual `GRANT EXECUTE ... PUBLIC/anon` expression. Focused statement-aware review then classified the priority entries:

- `enable_tabletop_realtime`: dynamic SQL uses `format` with identifier-escaping `%I` and a hardcoded identifier array; no actor/client supplied identifier source observed. This is **not an automatically approved realtime publication replay**; table dependency, publication membership and subscription privacy must still be checked. The earlier dynamic-EXECUTE marker is not by itself evidence of SQL injection.
- `20261106_campaign_account_names`: `auth.users.raw_user_meta_data` is read for `username` and `display_name` projections under a current membership helper, not used as a JWT authorization claim in the examined source. R18-165 separately reviewed the current function. This is display data, not permission data; safe frontend rendering and signed visibility need QA.
- `tabletop_foundation`: creates extension `pgcrypto`, not an observed `ALTER ROLE` grant; QA extension availability/ownership still needs bootstrap review.
- Five heuristic public-GRANT candidate files (`dm_ability_modifiers`, `map_combat_initiative`, `campaign_tools_issuance`, `authoritative_fog_collision_release`, `world_runtime_movement_fog_collision_20261108`) contain **22 statement-scoped authenticated function EXECUTE grants and zero direct PUBLIC/anon EXECUTE grants** in those five sources. The earlier whole-file regex matched across statement boundaries. This does not automatically approve the callable functions' authorization semantics.

The scan detected **zero** direct `INSERT/UPDATE/DELETE storage.objects` statement patterns, zero `auth.jwt()` markers, zero explicit app metadata markers, zero obvious `CREATE VIEW` or `ALTER DEFAULT PRIVILEGES` markers and 66 files with function declaration text. These are **bounded source-pattern observations**. Do not infer absence of trigger-written Storage rows, view creation through dynamic SQL or hidden credentials from regex absence.

## Current risk posture

Public authenticated SECURITY DEFINER RPCs remain reviewable; #220 character-owner revocation and #212 fog metadata oracle are confirmed unresolved in original. Old invite reuse #223, privileged membership mutation #229, issued signed asset bearer / stale Realtime #231 and inventory UUID churn #218 stay NO_GO. The private default EXECUTE hardening issue #275 is separate from actual current exposures.

This package is a source-only evidence and CI guard, not an 83-file security signoff or a new migration. No original/QA SQL, raw original function bodies, app/runtime source, versioned migrations, merge, deployment or paid infrastructure is changed. QA install requires reviewed history, independently verified QA-only target and separate owner authorization; R127 production approval remains independent.
