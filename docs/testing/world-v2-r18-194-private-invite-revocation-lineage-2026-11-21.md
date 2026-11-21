# B10-R18-194 — Reconcile private campaign join/create lineage with existing revoked-member guard, NO_GO

21 November 2026. Direct source-only child of [R193 draft PR #302](https://github.com/xuvenz-source/ttrpgsite/pull/302), pinned head `10e9178895144b20fb9b584b005eb6664c8198f7`. The owner's **only uploaded private output** was `r193-sanitized-report.json` (2,616 bytes, receipt SHA-256 `4a4eeb14225eccb43153138375989c97930f17f4299c026ee5263b3faeef6f75`). Exact schema, numbers, type and all no-release guards were independently validated. **83/83** original migration sources SHA-verified, all chronological version names unique/valid.

## Source-exact provenance

R193 confirms one direct historical `create_campaign` declaration and two `join_campaign` declarations, all explicit SECURITY DEFINER with supported PL/pgSQL dollar bodies. The latest CREATE declaration appears at R111 priority docket index **2**, statement **12**; latest JOIN at docket index **28**, statement **4**. **These are NOT migration chronological indices.** Both latest original body SHA-256 and lengths match the independently read-only original Supabase `pg_proc.prosrc` snapshot (CREATE 475 bytes, JOIN 742 bytes). Identity and membership lexical markers appear in both; current JOIN includes an ON CONFLICT marker. **Markers cannot establish safe effective authorization.**

This independently corroborates historical [R118 private SHA parity PR #224](https://github.com/xuvenz-source/ttrpgsite/pull/224) and [R119 exact original-source isolated synthetic rejoin test PR #225](https://github.com/xuvenz-source/ttrpgsite/pull/225), which observed a removed member rejoining with an unchanged invite in the **synthetic source-exact** PostgreSQL 17 scenario. The result is a **product-policy security gap** if removal is expected to block stale invite reuse, not proof of a hosted exploit or signed Auth acceptance.

## Reuse, don't reinvent, the existing candidate

The R120/R121/R122 work already stages a **dormant, unapplied** source-only contract:

- [PR #226](https://github.com/xuvenz-source/ttrpgsite/pull/226): private tombstones, DM removal and explicit DM reinstatement, distinct voluntary leave, synthetic identity/grant checks; it **must not** be applied without R121's follow-up
- [PR #227](https://github.com/xuvenz-source/ttrpgsite/pull/227): corrected campaign-delete cascade, two concurrent join/remove orderings and transaction rollback safety; removes the older prototype's cascade regression
- [PR #228](https://github.com/xuvenz-source/ttrpgsite/pull/228): DM-only revoked member list, immutable campaign membership identity keys, **unmounted** authenticated-client controller; scope remains synthetic and not deployed

**Provisional fail-closed policy for this staged prototype:** a DM-removed player cannot rejoin using the unchanged generic invite until an explicitly authorized DM reinstates them. Voluntary leave remains separate. This is existing prototype behavior, **not** a unilateral product policy approval or permission to deploy.

R194 does **not** alter any old candidate, active migration, runtime or existing test. Instead, its bounded JSON manifest pins the R193 receipt digest/indicators, exact live CREATE/JOIN function body fingerprints and original **Git blob SHA-1s** of 12 existing R120/R121/R122 prototype/test source files. Its no-network Python validator refuses drift, approval escalation or a claim that the confirmed `service_role` **TRUNCATE** issue is resolved. Adversarial CI tests fingerprint tampering, source modification and release-flag escalation.

Three **independent disposable GitHub Actions PostgreSQL 17 jobs** rerun the unmodified source-only tests: R120's DM removal/reinstatement and ACL matrix; R121's campaign deletion, real two-session lock ordering and rollback race tests; and R122's revoked-roster/immutable-key plus dormant client guard tests. Each original shell runner requires `GITHUB_ACTIONS=true`, a unique loopback-only scratch database name and explicit isolation flag, and refuses hosted connection overrides. Tests use invented users/campaigns and **representative synthetic invitation code**, **not** the private original JOIN source or live signed Supabase sessions. The original private 83 migration SQL, invite codes, function definitions and Auth records never enter GitHub/CI.

## Still release-blocking

- [Issue #223](https://github.com/xuvenz-source/ttrpgsite/issues/223): old invite rejoin remains unresolved in hosted systems; no explicit owner decision or signed DM/P1/P2/revoked/outsider QA approval
- [Issue #229](https://github.com/xuvenz-source/ttrpgsite/issues/229): privileged `service_role` TRUNCATE skips row DELETE tombstone triggers; external privileged removal/invite rotation paths unreviewed
- [Issue #220](https://github.com/xuvenz-source/ttrpgsite/issues/220): removed character owner privileged sheet access; [#231](https://github.com/xuvenz-source/ttrpgsite/issues/231) existing signed Storage links and reissuance, [#212](https://github.com/xuvenz-source/ttrpgsite/issues/212) hosted fog-status disclosure
- All **83** original historical migration semantic approvals, **67** current authenticated-callable privileged RPC call-chain reviews, signed multiuser QA, QA SQL authorization, production approval and safe forward/rollback verification remain **NO_GO**.

No original/QA hosted SQL writes, app runtime, active migrations, Edge Functions, Vercel deployment, merge or paid infra. No further WSL upload is needed to validate R194: R193 original-source evidence is already provided and matched. **Do not deploy this scratch prototype or restore any known insecure original source.**
