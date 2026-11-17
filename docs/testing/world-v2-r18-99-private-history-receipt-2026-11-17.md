# B10-R18-99 — Private history capture corroboration gate (NO SQL, NO DEPLOY)

**2026-11-17**. Exact parent: R18-98 draft PR #200, `8405f928644bd2c0dc03ddf0c43417dc63d8425e`.

## Why this exists

R18-98 introduced a private, operator-local official Supabase CLI 2.81.3 source-history fetch and 83-file MD5 verifier. That prior step did **not** execute an authenticated fetch. In R18-99, a fresh read-only check of the original Supabase registered **83** migrations and the previously frozen digests again showed **83 matching**; QA project `bgydsamxypjslergfpla` still has **zero** migrations. A successful CI test only proves the source validator and synthetic fixtures: no SQL bodies were recovered or exported in this PR.

## Implemented source-only verification

`scripts/release/validate-world-v2-r18-99-private-recovery.mjs` compares the **operator's privately saved exact R18-98 JSON receipt** against a second, independently computed pass over the same private 83-body workspace. It verifies original source identity, expected 83-file count, aggregate SHA-256, manual-review marker count, and deliberately false statements of OAuth/CLI provenance, SQL writes and approval. Extra fields (including accidental raw credentials), altered digest or count, SQL mutation, or invented operator authority reject the evidence. This script never launches a CLI, connects to Supabase or writes SQL.

The receipt is **not a signed provider attestation**. A self-supplied JSON file and a matching local directory are not cryptographic proof of the operator's identity, actual authenticated CLI invocation or the timing of the download. The source package and release ledger permanently remain NO_GO. Do not place the local receipt or historical SQL files into the repository, CI artifacts, chats or build logs.

## Operator procedure, once a trusted local authenticated environment is available

1. Follow the reviewed R18-98 private runner procedure using exactly v2.81.3, in a freshly empty private workspace linked to **original** `lwhwgqaunxbmvyndswze`. Do not use the **QA** project reference during history recovery. No SQL application, migration repair, db reset or root `db push`.
2. Redirect only the *sanitised JSON output of the R18-98 runner* to a private, access-restricted JSON file, with no SQL bodies, tokens or project database passwords. The runner itself must never log the underlying CLI fetch stdout/stderr.
3. Without moving or modifying the recovered SQL files, run the source-exact R18-99 validator from the repository checkout, supplying operator-private absolute paths:

   ```bash
   node scripts/release/validate-world-v2-r18-99-private-recovery.mjs \
     --workspace=/ABSOLUTE/PRIVATE/WORKSPACE \
     --r98-receipt=/ABSOLUTE/PRIVATE/R98-RECEIPT.json \
     --ack-source=lwhwgqaunxbmvyndswze
   ```

4. Only an **83/83 exact private file and receipt match** produces a local `NO_GO` JSON observation. Examine any nonzero SQL portability/security-review markers privately. A matched MD5 is provenance to the frozen serialized historical SQL bodies, not proof of safe SQL, correct permissions or fitness for clean QA bootstrap.
5. Separately confirm the authenticated source session using trusted out-of-band operator evidence and a fresh read-only source database fingerprint, without exposing credential or production user data. **This particular source package does not implement or claim independent authentication.**
6. A later explicitly approved QA-only work package must create an independent 83-history QA workspace (no eight pending SQL yet), ensure `[db.seed] enabled = false`, hard-pin the QA-only reference `bgydsamxypjslergfpla`, review SQL for Auth, Storage, Realtime, RLS, SECURITY DEFINER and production IDs, and prove a QA-only dry run and rollback before applying anything.

**R18-99 source-package verification gate:** all source CI and isolated disposable PostgreSQL tests green. **Actual private recovery and QA bootstrap remain NO_GO.**
