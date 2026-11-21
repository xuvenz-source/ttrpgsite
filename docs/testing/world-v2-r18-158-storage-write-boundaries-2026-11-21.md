# B10-R18-158 — Storage upload/delete/replace authorization

21 November 2026. Exact green R18-157 PR #265 parent 67c5b62597fa5f1a0786565c21ce12993da184f6. **SOURCE-ONLY / NO_GO.**

## Original database: read-only metadata

The current original storage.objects RLS catalog has 3 SELECT, 3 INSERT, 2 DELETE, **0 UPDATE**, and **0 ALL** authenticated-targeted permissive policies. The authenticated role does have table-level SELECT/INSERT/DELETE/UPDATE privilege; this does not bypass RLS. All five write policy predicates require a private bucket restriction. A map image may be inserted or deleted by the current campaign DM, under a campaign path. Personal files are restricted to the actor's user folder for insertion/deletion. Campaign artwork/token assets may be inserted by an authorized campaign member in their own player folder or by a campaign DM in its DM folder; no separate authenticated DELETE policy exists for the asset bucket.

No raw SQL bodies, private bucket names, credentials, original migration files, source user records or signed URLs were copied into GitHub.

## Potential functionality issue — authenticated file replacement

There is no current Storage UPDATE or ALL policy even though the authenticated role has a table UPDATE grant. PostgreSQL's enabled RLS typically denies updates without a matching policy. Consequently **authenticated Storage upsert or replacement may be blocked**, depending on its exact Storage API execution and possible privileged backend paths. This is a potential functional gap, not confirmed production breakage or a security vulnerability. Do not grant unrestricted UPDATE access.

Any future authenticated UPDATE permission must bind existing-row access (USING) and proposed-row access (WITH CHECK) to the correct bucket, campaign and file path. The original signed workflows and replacement product expectations require review first.

## Disposable synthetic PG17 scope

R158 extends the fictional R120/R152/R156/R157 PostgreSQL17 fixtures with three per-bucket INSERT policies, two per-bucket DELETE policies, an authorized member-only SELECT on the fictional campaigns table, and table UPDATE permission but no UPDATE RLS policy. It tests:

- Campaign A DM allowed map upload/delete; other-campaign DM, players, or spoofed campaign path denied.
- Player permitted to upload own campaign portrait but denied another player's folder, DM folder or another campaign; DM permitted in own DM folder.
- No campaign-token DELETE permission, even for the fictional DM.
- Personal file owner permitted INSERT/DELETE; other users denied.
- Missing UPDATE policy denies a previously visible DM map update despite table grant.
- A temporary **scratch-only** UPDATE policy with both USING and WITH CHECK permits same-campaign DM changes while blocking player changes and campaign path reassignment. This prototype is removed at the end and is not a migration or product proposal.
- Revocation blocks fresh authenticated campaign-token uploads while independently owned account personal files remain available.

These are **synthetic permission demonstrations**, not an execution of original storage.objects or a genuine signed Auth/CDN/Realtime test. Their outcomes do not prove a production upsert problem or signed URL invalidation.

## Security and release gates

All 83 operator private migration files remain fingerprint matched, but zero independently semantically approved. The original 67 authenticated-executable SECURITY DEFINER paths, other historical policy revisions, issued signed Storage URLs, old joined Realtime subscriptions and the R153 18 signed multi-account QA cases remain pending. Issues #220/#223/#229/#231 and R127 final owner authorization remain open.

No original or QA database write; no versioned migration, frontend runtime edit, browser grant, merge, deployment or paid resource. **NO_GO.** No additional Ubuntu action is required for R158.
