# B10-R18-193 — Private historical campaign invitation RPC source lineage (NO_GO)

21 November 2026. Direct child of R192 [draft PR #301](https://github.com/xuvenz-source/ttrpgsite/pull/301), head `f51c6d49423096fd245ee53ab8abffdd28712799`. R192 dedicated disposable PostgreSQL17 and general repository CI **2/2 SUCCESS**. No original or QA database modification, app runtime change, active migration, merge, deployment or paid resource.

## Current verified source evidence, no SQL disclosure

Read-only original project's `pg_catalog` inspected only the known public privileged RPCs `join_campaign` and `create_campaign` and emitted **only** function names already known from issue #223, SHA-256 fingerprints, byte lengths, role/ACL/search_path and language metadata. Both are current `LANGUAGE plpgsql`, `SECURITY DEFINER`, `VOLATILE`, owned by `postgres`, one argument and one overload each, explicitly empty `search_path`, authenticated-executable but anon not executable:

| Known public function | Stored body size | Live `pg_proc.prosrc` SHA-256 |
|---|---:|---|
| `join_campaign` | 742 bytes | `5f3a7dbcadc4361f59fa814a820b84cfb2cc0d89f685ae6194efe3912d015655` |
| `create_campaign` | 475 bytes | `0ea1e01ba784dfa78e92c8e82a3ca2b2d28a19920f5286cc7423d1e891be645f` |

This is a one-time original project catalog observation, not source authorization review. Source body SQL, private historical migration files/names, invite codes and campaign/user data were **not** retrieved.

The existing [issue #223](https://github.com/xuvenz-source/ttrpgsite/issues/223) documents that current invitation code reuse by a removed player was reproduced in a separate synthetic source-exact PostgreSQL fixture; security policy for invite re-use after removal must remain explicit and DM-controlled. A new guard that merely revokes the affected player's client session without correcting server-side membership rejoin is insufficient. The linked #220 removed sheet-owner, #229 privileged membership TRUNCATE/UPDATE escape and #231 signed Storage bearer lifetime also remain open.

## Scope of the private offline source checker

`scripts/release/r193_private_invite_source_lineage.py` invokes unchanged SHA-pinned R154's private audit and verifies all 83 original source files again on read, without printing the archive. It finds **direct top-level CREATE FUNCTION** definitions of these two known public functions in original migration SQL, independently sorts sources by validated unique chronological filename version (R111 docket order is *priority-sorted*, NOT chronology), counts historical definitions, and compares SHA-256 and UTF-8 lengths of the latest directly declared PL/pgSQL dollar-body to the two independently observed live `pg_proc.prosrc` fingerprints.

A bounded JSON report emits **only** fixed JOIN/CREATE target labels, source counts, booleans, numeric R111 priority docket index and SQL statement ordinal. Markers for caller identity, campaign_members, `ON CONFLICT` and user-editable metadata are presence checks, not SQL control-flow analysis. The private SQL body, function signatures, original filenames/paths, identifiers and user data are never printed or sent to GitHub/CI. Wrong SHA/unsupported input fails closed. If filename chronology cannot be established, it does not claim a latest definition.

The script cannot establish effective membership revocation, revoked-account rejoin rules, helper-call correctness, overload identity, full 83 semantic audit or signed multi-account QA. Existing synthetic rejoin findings remain authoritative until separate independently signed QA. Even matching source bytes do **not** approve those behaviors.

## Security and rollout barrier

No SQL installation to original or separate QA is authorized, no root active migration or runtime code modification, no unreviewed Auth/Storage/Realtime change, no production release or paid infrastructure. Keep issue #223 (unchanged invite reuse), #220 (revoked sheet ownership), #229 (privileged membership TRUNCATE), #231 (signed bearer URLs), and #212 (fog status) **NO_GO**.

**Next owner-private checkpoint after successful exact-head CI:** download the commit-SHA-pinned R193 Python file to the existing private `$HOME/ttrpg-history-private` Ubuntu WSL workspace. It imports the existing R154/R186/R191 Python files. Run with `umask 077`, redirect stdout to `r193-sanitized-report.json`, and upload only that JSON. **Never** upload historical SQL, the private docket, source snippets, invite codes, names, keys, file lists or verbose console logs.
