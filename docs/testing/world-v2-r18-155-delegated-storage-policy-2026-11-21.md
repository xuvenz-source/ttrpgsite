# B10-R18-155 — Historical policy signal and original delegated Storage RLS chain

21 November 2026. Exact green R18-154 PR #262 parent `5c5aa83a79cd688af3406145f5c798cd7ea97909`. Source-only draft, **NO_GO**.

## Sanitized private-history findings received

The operator uploaded only the sanitized R18-154 local report; SHA-256 of those report bytes is recorded in the manifest. It confirmed 83 of 83 original migration file hashes, zero security approvals and exactly one focused-review file with `storage_policy_no_known_identity_helper` at **R111 priority-sorted docket index 29**. This is **NOT chronological migration position 29**, nor does it identify the current live policy. No private SQL, names or user rows were uploaded.

The lexical scanner found 231 historical function definitions, 182 SECURITY DEFINER definitions and 70 with no direct `auth.uid` or `auth.jwt` text. These are *definitions across history*, not counts of distinct live callable functions, and a helper may delegate identity checking. The report also found 117 policy definitions, 10 Storage object policy statements, three membership INSERT statement matches, zero PUBLIC function EXECUTE grants, zero function-level search_path omissions under its scanner and 11 Realtime publication-change matches. These numbers are **heuristic**, not security clearance.

## Original live authorization chain — read-only catalog

A separate read-only catalog inspection of the original Supabase database identified one **current** Storage SELECT policy whose predicate uses `EXISTS` over `public.battle_maps`, rather than calling a direct auth helper. The `battle_maps` table has RLS enabled; the authenticated role has SELECT and anon does not; its SELECT policy delegates to `public.can_view_campaign_map(p_campaign uuid,p_map uuid)`. This postgres-owned SECURITY DEFINER helper has a bound search_path and references auth.uid and current campaign membership. All three existing original Storage buckets remain private. These are meaningful *structural* facts, not proof that the full chain is correct or identical to the historical R111 index29 policy.

Risks to resolve in exact SQL-level review and signed QA:

- Is the `battle_maps` row bound to the same canonical campaign and object path being requested? A mismatched join or path spoof can leak across campaigns.
- Does the Storage policy subquery evaluate as the authenticated actor under table RLS, or can a SECURITY DEFINER function bypass the child table's RLS?
- Can another of the **three permissive Storage SELECT policies** OR-combine to authorize a foreign player even if this one is safe? All policies and their helper chains need review.
- Does `can_view_campaign_map` check the intended map/campaign and current actor for both DM and player, and correctly remove access for revoked members?
- What happens to old joined Realtime sockets and already-issued signed Storage URLs? Removing membership does not automatically prove these bearers or sockets are revoked.
- The original 83-migration state and historical policy chronology must be reconciled; do not equate live Storage SELECT policy ordinal 7 with private docket index 29 without independent evidence.

## R18-155 synthetic PostgreSQL 17 suite

In a **fictional**, isolated PostgreSQL17 fixture only, a file SELECT policy delegates access to a separately RLS-protected map table and binds both canonical campaign ID and object path. Positive cases prove same-campaign actors can read their test records, foreign-campaign DM/P2/outsider cannot, revocation blocks fresh reads and explicit same-campaign DM reinstatement restores appropriate access. Three **deliberately unsafe** negative controls show:

1. Disabling the referenced map table's RLS causes a foreign campaign player to see a record; reenabling it restores denial.
2. An additional permissive file policy using a postgres-owned SECURITY DEFINER map lookup bypasses the referenced table RLS.
3. An extra permissive policy joining a file solely by path allows a forged other-campaign map path to authorize the wrong file. Dropping it and reinstating both campaign and path binding restores denial.

This is not the original policy SQL; it is not a real signed Auth/Storage/CDN/Realtime test and does not fix issues #220/#223/#229/#231.

## Next manual step — targeted private SQL indicator analysis

The operator already has `r154_private_history_audit.py` in a restricted Ubuntu folder. The new `scripts/release/r155_private_policy_focus.py` imports it and re-verifies all 83 file SHA-256 fingerprints, identifies the exact R111 **docket position 29**, and reports only predeclared structural booleans (operation, role class, existence/OR, known helpers and known table categories). It prints **no SQL, file names, arbitrary identifiers, credentials or private paths**, performs no network calls, writes nothing, and keeps R111 approvals pending. The output is not semantic security review.

After full green CI, provide one exact pinned download/run command for this script; operator sends sanitized JSON only. Do **not** upload the R111 docket or any SQL. If identity, expected marker or hash differs, it fails closed.

## Release and budget

No original/QA SQL, versioned migration, frontend source, browser grant, merge, deploy or paid infrastructure was changed. Original 83 SQL files have **zero independent approvals**, the 67 live authenticated-callable privileged paths still require technical call-chain assessment, and the 18 real signed QA acceptance cases from R153 remain NOT_RUN. Owner has delegated first-party analysis but not waived the requirement for sound security evidence or R127 final human production approval. **Production remains NO_GO.**

Next R18-156: interpret sanitized R111 index29 focus output, then design exact safe repair or further tests. Do not authorize QA history replay until a separately approved plan.
