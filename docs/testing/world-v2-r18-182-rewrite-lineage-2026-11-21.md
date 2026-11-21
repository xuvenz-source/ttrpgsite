# B10-R18-182 — Chronological dynamic RPC rewrite verification

21 November 2026. Exact child of corrected R18-181 [draft PR #290](https://github.com/xuvenz-source/ttrpgsite/pull/290) at `6eced6676b262259aa9b30a007a5ea32df6c6706`. **NO_GO.**

Read-only in-place review of the original 83 registered migration scripts has established that the `20261106074754` migration creates `can_view_campaign_map` statically but rewrites `get_token_monitor_values(p_map uuid)` and `post_token_reference(p_token uuid,p_code text)` with `pg_get_functiondef`, guarded string substitutions and `EXECUTE`.

The immediate source for **both** rewritten RPCs is from chronological migration `20261106074748`. The monitor function had earlier definitions `20261105144953` and `20261105151706`, and a later static definition in `20261107110539`; the latter retains an authorization helper. The reference-post RPC has one static historical definition before its rewrite. The original installed function fingerprints are pinned in the manifest without exporting SQL bodies.

The disposable PostgreSQL17 regression uses explicitly *fictional* minimal function bodies containing the two exact textual anchors. It tests baseline unsafe ownership versus repaired current map assignment, current DM and foreign DM, revoked P1, current assigned/nonassigned map, and failure of an attempt to reapply the same whole rewrite. The synthetic patch algorithm is modelled after the historical mechanism; **it is not the original private SQL**.

Important: `post_token_reference` embeds its old ownership substring inside the replacement, so selective reapplication of that replacement alone is not guaranteed idempotent. The complete original DO block's monitor guard prevents normal repeated application in the scratch model. This cannot replace chronological full SQL replay or signed actor acceptance.

No original/QA migrations, active runtime, hosted SQL, Storage, keys, merges, deployments or paid resources. All 83 historical semantics, 67 privileged RPCs and signed P1/P2/DM/revoked QA remain release gates.
