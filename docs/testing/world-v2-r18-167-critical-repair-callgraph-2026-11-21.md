# B10-R18-167 — Source-exact critical repair call graph and signed QA closure contract

21 November 2026. Exact child of R18-166 [draft PR #274](https://github.com/xuvenz-source/ttrpgsite/pull/274) at commit `cdccf275c7347b5eee6a3ccb2db812ef99c118d9`. **NO_GO.** R166's dedicated and standard CI passed prior to this step; combined staging-only PG integration was still in progress at the time R167 was initially prepared. Never infer acceptance from pending CI.

## Confirmed original privilege defect #220

A fresh read-only original `pg_proc` inspection still hashes `public.can_edit_campaign_sheet` to MD5 `5a8fed2bdc8427c884f89440c0eebe03` / 790 bytes. Its character-owner permission branch checks assigned ownership but does **not** require a current campaign membership row; it is not directly executable by anon or authenticated, but privileged callable wrappers reach it.

The source-exact call graph is pinned in `staging/world-v2-b10-r18-167-critical-repair-callgraph/manifest.json`. Direct public authenticated consumers include claim, GET, mutate, PATCH, and inventory transfer. Prior isolated PostgreSQL17 evidence reproduced revoked-owner claim/GET/mutate/PATCH. **Transfer is different:** the current function also calls `is_campaign_member(p_campaign)` before its first identified top-level mutation, so it must be covered by signed negative QA but is **not** separately described as a proven revoked-owner exploit. The internal inventory helper delegates to the vulnerable general helper without a separate membership guard.

Existing [draft PR #219](https://github.com/xuvenz-source/ttrpgsite/pull/219) contains the unapplied scratch `can_edit_campaign_sheet` membership predicate and preserves existing revoked direct helper EXECUTE permissions. Reuse it; do not create a competing repair or reinstall a historical migration. Ensure DM, player, rejoin, lease cleanup and cross-campaign acceptance.

## Confirmed original metadata disclosure #212

Current `public.is_map_fog_published` has a 102-byte source body (MD5 `084a62df8ed72d3e5fffbfce9507ff0f`) and authenticated EXECUTE, but no current actor or map authorization check. It supplies a historical permissive SELECT policy on `public.map_combats`, `dm or nonfog viewers read combat roster`, alongside `can_view_campaign_map` and `is_campaign_dm`. Removing authenticated EXECUTE without redesigning the policy would disrupt that use.

Existing [draft PR #206](https://github.com/xuvenz-source/ttrpgsite/pull/206) has the unapplied scratch fog fix: same-map `battle_maps`/map-rules join, a `can_view_campaign_map(campaign_id,id)` gate, preserved boolean function signature, and authenticated EXECUTE. Source-only and disposable PG17 regression tests were positive; no signed hosted actors have tested it. Do not label this original issue fixed.

## Exact staging candidate source pins

- PR219 existing file Git blob `380f7fd4fcd75fc17c76af8b851d86c068616420`.
- PR206 existing file Git blob `c84d7cf8b0958621f11ec273cb36361e2501a77f`.

New Node tests verify these two actual staged candidate blobs, guard predicates, and strict NO_GO metadata, preventing accidental drift. They are **not** new SQL repair tests and never connect CI to the original Supabase database.

## Required acceptance and ordering

Sixteen focused QA cases are listed as **NOT_RUN**, covering DM, current P1, P2, removed P1, outsider and anonymous roles; sheet GET/claim/mutate/PATCH/transfer, map fog visibility and combat roster RLS, old-invite rejoin, new/old signed URLs and Realtime. This is a release plan, not evidence that testing occurred.

Before hosted QA SQL: complete independent source semantic decisions for all 83 historical migrations and 67 privileged RPCs, reconcile stale invites (#223) and privileged membership writers (#229), certify separate QA-only target and replay prerequisites, and obtain a separate owner QA installation approval. Old signed Storage bearer links and stale client subscriptions (#231) require independent mitigation; UUID churn (#218) remains open. The private grant hardening observation (#275) is defense-in-depth, not a currently proven bypass.

Never restore the known vulnerable original helper as a rollback; use a reviewed secure forward recovery strategy. **No hosted SQL writes, versioned migration, original body export, live app source, merge, deployment or paid infrastructure change.** The AI lead is the sole technical reviewer; owner retains final production authorization and explicit acceptance of the lack of an independent second reviewer.
