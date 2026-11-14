# Tabletop Forge B10-R18-52 — Official CLI transcript compatibility

13 November 2026, Australia/Melbourne. Staging only. NO-GO for production.

## Lineage and defect

Exact parent is R18-51 PR #155 head 59bc0db399c0dfdc9f2186419be17a1850414754. Its offline CLI evidence checker incorrectly expected ASCII | table separators, while the published Supabase CLI v2 migration list uses the Unicode box-drawing separator │ and divider ┼. As a result, genuine history data could have been incorrectly rejected. The repaired checker recognizes either format without losing blank local/remote columns or allowing mixed delimiter rows.

Official references: https://supabase.com/docs/reference/cli/supabase-migration-list and https://supabase.com/docs/reference/cli/supabase-db-push. The new test data adapts those published examples; it is NOT a captured authenticated CLI session.

## Changes

- Update only scripts/release/validate-world-v2-r18-51-cli-evidence.mjs to recognize Unicode and ASCII migration-list tables. Require the exact three-column Local/Remote/Time (UTC) header, 83 matching historical registrations, eight pending local-only versions, no extra or swapped versions, and unambiguous terminal dry-run output.
- Add tests/world-v2-r18-52-cli-unicode-output.test.mjs: seven adversarial tests covering official Unicode and dry-run shape, CRLF, bordered header, remote-only drift, missing/extra/duplicate/unordered history, mixed separators, actual push text and unexpected SQL files.
- Preserve R49 original-file verifier, R50 current read-only receipt, 2.81.3 CLI version and exit-status requirements, and NO_GO/safeToApply:false return. The checker invokes no CLI, SQL, network, file writes or live operation.

Supabase db push --dry-run enumerates proposed migration versions, but does not guarantee SQL validity. Source-real PG17 tests and independent fog/permission audits remain separate mandatory gates.

## Actual movement context

The read-only historical database counters obtained in R18-51, accumulated since 5 November, showed Advance weighted-mean DB execution 63.74ms over 1,770 calls and Commit 290.78ms over 517 calls (largest individual executions >2s and >3s). Previously captured sole-DM browser p95s were 443ms Advance and 1,308ms Commit; sample windows differ, so these figures cannot be subtracted to assign transport latency. R18-42 offline source-real tests showed real 23-cell input can use one authenticated batch instead of 23 separate Advances, but production signed user timing/locks still require measurement. Do not reintroduce R18-26/27 or rejected R18-40 based on these historical aggregates.

## Nonnegotiable release gates

Actual official authenticated CLI migration fetch of all 83 historical SQL bodies, comparison against the 83 frozen digests, source-exact eight pending versions, migration list, and db push --dry-run using an external isolated workspace remain NOT PERFORMED. Genuine separately signed DM/P1/passive-P2 fog/LOS/private observer/revocation/canonical tests and bounded live Supabase free-tier RAM/lock/RTT checks are NOT PERFORMED. Both R18-43 atomic flags remain OFF. R18-35 Vercel production and the 83 applied migrations must remain untouched. No main merge, server DDL, SQL push or deployment is authorized by this step.

## Decision

R18-52 staging-only NO-GO. Verify exact-head Node tests, CodeQL, PostgreSQL authority, build and the three-file branch diff before handoff.