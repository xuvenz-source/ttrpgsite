# R217 — Owner R216 sanitized receipt and private Storage policy role/guard word triage (NO_GO)

22 November 2026. Source-only child of R216 draft PR #328, exact parent head e999d669c7536d2192fec7497a1bae0f6b364943; focused Storage security and general staged repository CI workflows 44978864304 and 44978864279 both SUCCESS. No merge, deployment or database writes.

## Sanitized R216 owner evidence

The owner supplied only r216-sanitized-report.json (5,279 bytes; SHA-256 babb7c5e5bfa554c177085838349d31f861b4d8dcb0955dbb525d368b7200c78 of **sanitized JSON only**, never private source SQL). Reported: 83/83 original migration SHA checks, 937 top-level lexical statements, 3 direct top-level Storage INSERT statements (all with ON CONFLICT lexical words), 12 historical Storage policy statements across 5 priority docket indices (2, 3, 4, 29, 50; all five present, no truncation). Seven policies lacked a direct auth.uid/auth.jwt marker; nine lacked a WITH CHECK marker; five lacked a USING marker. Those are **syntax-context dependent lexical signals**, not proof of RLS vulnerability. Five SELECT policies and three INSERT policies were counted, alongside two DELETE and two ALL/unspecified. Neither signed URL revocation nor effective policy composition has been tested.

scripts/release/r217_validate_owner_r216_receipt.py validates a strict sanitized JSON-only shape, rejecting unknown/private fields, JSON duplicate keys/NaN, forged approvals, inconsistent DML/policy/category counts, incorrect bounded numeric R111 priority indices and changed limitations. No SQL or database/network read.

## R217 owner WSL-only private Storage policy shape

scripts/release/r217_private_storage_policy_shape.py re-runs the complete private R216/R215/R214/R213/R211/R154 integrity/chronology/permissions gates, then scans historical top-level Storage policy statements offline. Exports only **fixed category codes and numeric counts**, plus at most 24 **numeric R111 priority references**, never migration names/versions, SQL, policy names, bucket/object paths, R111 docket content, actor/campaign rows, JWTs, secrets, service keys or signed URLs. Codes describe CREATE/ALTER/DROP policy, TO public/anon/authenticated/unstated role words, AS RESTRICTIVE vs permissive/default words, bucket_id, owner_id, direct auth.uid/auth.jwt, recognized campaign helper calls, Storage operation helper calls, literal TRUE guards, OR, and user-editable metadata words.

These are lexical words, not PostgreSQL parsing, effective authenticated roles, helper control-flow proof, transitive access control, permissive OR policy composition, live managed Storage grants or signed URL bearer revocation. The code makes no external calls, executes no SQL and writes no files itself. All 83 historical migrations and 67 live privileged authorization chains remain **NO_GO** regardless of the output. A zero risk marker has no authorizing effect.

GitHub CI uses only entirely fictional 83-source archives, simulated sanitized R216 JSON and strict five-file source-only path gate. No source/active migration/Edge/frontend/Vercel edits, no QA/original SQL, no production changes or paid resources.

Supabase's current Storage guidance separates SELECT, INSERT, UPDATE, DELETE policies, notes the upsert path can require SELECT and UPDATE, and signed URL revocation is a separate control from current RLS. Relevant official docs:
- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/docs/guides/storage/security/signing-keys
- https://supabase.com/docs/guides/storage/serving/downloads

## Owner manual checkpoint (only after exact-head CI succeeds)

Download the commit-pinned R217 private WSL script into the existing $HOME/ttrpg-history-private folder under umask 077. Run it offline with Python 3 and save stdout to $HOME/ttrpg-history-private/r217-sanitized-report.json. Upload **ONLY** that generated JSON file to chat. It requires the prior R154/R186/R191/R211/R213/R214/R215/R216 owner-local Python readers and original files, all already stored privately. Never upload source SQL, private original filenames, R111 docket, unredacted logs, credentials or signed URLs. If it fails, report only R217_PRIVATE_STORAGE_POLICY_NO_GO.

No QA SQL installation is allowed. Any future QA-only write needs separate explicit owner authorization of the exact target, complete reviewed SQL effects, validated $0 resources, backup/rollback and signed role QA. Original #212/#220/#223/#229/#231/#306, all 83 semantic migration approvals, all 67 privileged caller graphs and production remain NO_GO.
