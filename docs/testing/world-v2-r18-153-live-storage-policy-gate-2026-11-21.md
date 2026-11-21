# B10-R18-153 — Original Storage RLS composition and signed-actor QA gate

21 November 2026, exact green R18-152 parent draft PR #260 at `0fecf887e85f012b7000211407dfa4fd068da929`.

**NO_GO.** This is source-only, not a SQL migration, deployment or hosted QA test. Original and QA databases remain untouched.

## Fresh original catalog observation (read only, no private SQL)

Read-only original `pg_policies` metadata, summarized without source text, identifiers of user assets, policy names, bucket names or credentials:

- `storage.objects` has RLS enabled (not FORCE RLS) and eight policies, all targeting authenticated and all **PERMISSIVE**: SELECT **3**, INSERT **3**, DELETE **2**. Multiple permissive policies for the same command are OR-composed by PostgreSQL. This is normal behavior but each individual policy can grant access; an overly broad branch cannot be compensated for by an otherwise narrow permissive policy.
- All eight policy predicates mention bucket_id; some use is_campaign_dm, is_campaign_member, or auth.uid and foldername. A literal TRUE-only policy was not detected by this lightweight text analysis. This is not full SQL semantic review.
- SELECT policy **ordinal 7**, ordered by command and private policy name, references `EXISTS` and bucket_id but does **not** directly reference `auth.uid`, `auth.jwt`, `is_campaign_member`, or `is_campaign_dm`. This is a **review-needed unknown**, **not evidence of an exploit**. It could use another authorized helper, relationship or restriction. The private predicate was not exported or read in this stage.
- Three original Storage buckets are private and zero are public. `anon` has a table-level SELECT grant on storage.objects, but a grant alone does **not** imply read access under RLS; catalog metadata does not prove anonymous asset reachability. Do not assert that anon users can download files.
- Source metadata is in `staging/world-v2-b10-r18-153-original-storage-policy-release-gate/original-storage-policy-metadata.json`; these flags do not replace exact SQL-level interpretation, RLS composition review or signed tests.

## What R18-152 established, and what it didn't

R18-152 PR #260 passed synthetic PG17 cross-campaign tests on fictional `forge_test.file_objects`. It demonstrated actor/campaign-binding, a deliberately unsafe OR rule and an illustrative already-issued bearer token that remains usable after revocation. It **did not** replay the original 83 private migrations, execute any original Storage policy SQL or prove anything about real Supabase signed URL/CDN invalidation or old joined Realtime sessions.

The trusted Ubuntu R111 docket is intact; 83 of 83 source fingerprints verified by the operator, four additional-priority files investigated structurally, **zero independent review approvals**. No private SQL was shared.

## Future separately approved QA acceptance

`signed-acceptance-matrix.json` contains 18 **NOT_RUN** cases. The first group tests same-campaign DM/player permitted actions, different-campaign P2/DM and outsider/anon denials, unauthorized uploads and deletes. Second group tests removal, fresh authorized asset access, forbidden issuance of *new* signed URLs after removal, unchanged invitations, explicit DM reinstatement. The already-issued bearer URL, joined Realtime socket, role-transfer/privileged writer and cascade cleanup cases are **UNRESOLVED_CONTRACT**, not expected automatic passes.

No JWT, refresh token, signing key, bearer URL or account identifier should be pasted into GitHub, chat, a screenshot or a CI artifact. These cases require independent QA schema authorization and real DM/P1/P2/outsider sessions, with controls and test asset data only.

## Required manual review and release hold

1. An independent trusted reviewer must examine all 83 private migration SQL files and the privilege chain of the 67 authenticated-executable SECURITY DEFINER functions. This includes each storage.objects policy expression and helper, policy OR/AND composition, campaign/file/path ownership links, storage visibility, signed URL limitations, historical replay and RLS cross-campaign rules. Sanitized outcome only; **no private SQL or credentials**.
2. Operator must attest to any out-of-repo backend, Supabase Dashboard, manual SQL or automation that uses service_role to INSERT/UPDATE/TRUNCATE campaign_members. The current operator statement is only **not knowingly configured**, not proof of none. Proposed R150 REVOKE remains unapplied.
3. Only after separately approved QA bootstrap and schema-review plan may signed users test DM/P1/P2/outsider/revoked/rejoined access and browser/Realtime/file URL behavior. A solo-DM run cannot replace multi-actor signed testing.
4. R127 human release approval is a distinct final gate, after security issues #220 (revoked sheet owner), #223 (old invite), #229 (privileged membership) and #231 (issued signed links) are resolved, plus free-tier memory/performance evidence.

**No original or QA SQL, no new migrations, browser grants, runtime source edits, merges, deployments or paid resources.** The QA 0-migration status is inherited from R146, not freshly measured in R153.

## Engineering handoff

R18-153 is a complete **source-only gate** once its CI passes, not an approval to deploy. Do not initiate R18-154 hosted changes while the human review or QA authorization is missing. The project can continue unrelated source-only features in a separate approved work package; this security release path is blocked on independent assessment and later signed acceptance.
