# B10-R18-179 — Combined revoked-owner sheet / stale-invitation regression

21 November 2026. Exact child of all-green R18-178 [draft PR #287](https://github.com/xuvenz-source/ttrpgsite/pull/287) at 7f97035a752cf9e8ae89ca52079bb8be2fc7295e. SOURCE-ONLY / NO_GO.

R115 previously proved the revoked character owner bypass; R120 separately staged a DM removal ledger preventing old invite rejoin. This step combines **six existing, SHA-pinned unapplied candidates** in one disposable GitHub Actions PostgreSQL17 instance: R120, R122, R148, R150, R173, and R115 applied last. No hosted SQL, private original function body or customer data is exported.

A fictional privileged sheet-mutation wrapper deliberately uses the same authorization mistake as the known original: a previously assigned character owner passes even after DM removal when current membership is not checked. The harness first demonstrates the **unsafe negative control**: DM removes P1 and old invitation is denied, but unpatched character-helper still permits P1 to mutate the sheet. It then applies the unchanged staged R115 membership predicate to the same scratch database and checks that removed P1 cannot edit; P2 cannot edit P1 but can edit P2; the foreign DM cannot edit the wrong campaign; current DM can; explicit DM reinstatement restores P1 permission; Auth deletion clears tombstones and P2 remains intact.

These are source-shaped synthetic cases, **not source-exact live claim/mutate RPCs or signed hosted actor proof**. Use the R115/R167 source-exact prior tests for those separately. Any final SQL must be a new reviewed forward-only migration, not a direct transplant of staging SQL.

Still unresolved: all 83 original historical SQL semantic decisions, all 67 privileged-call paths, external service-role admin writers, actual signed QA, fog oracle #212, issued URLs/Realtime #231 and UUID churn #218. No active app source, original/QA SQL, hosted assets, migrations, merges, deploys or paid resources changed. Owner separately controls QA setup and R127 release.
