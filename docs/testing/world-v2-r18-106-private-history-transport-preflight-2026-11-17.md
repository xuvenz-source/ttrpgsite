# B10-R18-106 — Pinned CLI history transport and private recovery workspace

**17 November 2026. Engineering source-only verification; NO_GO for original/QA SQL and all releases.**

Direct parent: R18-105 draft PR #207, exact commit `e1d954a81142d3c13b9f2c4057c06b8ffea78b42`.

## Exact upstream CLI fetch source, not an assumption

The GitHub tag `supabase/cli@v2.81.3` resolves to commit `bce705147ae90b9bddd6dfc24986744ced1d97d4`. The fetch source `internal/migration/fetch/fetch.go`, Git blob `cb78c70d8e248bea96831e2156773039129fef13`, generates filenames as `version_name.sql` and emits `strings.Join(statements,";\n")+";\n"`. It prompts before overwriting a *nonempty* migration directory, which is why R98 requires a completely empty workspace.

Upstream: https://github.com/supabase/cli/blob/v2.81.3/internal/migration/fetch/fetch.go

We rechecked the original Supabase **read-only history metadata**: 83 registered rows, last `20261109171247`, 83 nonempty SQL bodies, zero filenames needing normalization. The stored SQL bytes in the independently frozen R18-101 index sum to **709,936**. The genuine CLI v2.81.3 serialization appends exactly two bytes per migration, yielding a remote-confirmed **710,102 bytes** across all 83 fetched files. Any local recovery lacking a final `;\n` per file must fail MD5 parity with the R18-08 baseline. The new validator cross-checks **all 83 versions, names, historical MD5 values and R101 byte counts** using immutable Git blob identifiers. No raw original SQL is exported.

**Never switch the operator runner to CLI v3 by substituting flags**: v3 uses `--remote`; the R98 / R100 safe allowlists intentionally pin CLI **v2.81.3** and `--linked`. Confirm the exact binary's provenance and `--version` privately; the source tag is not a signature for an operator's installed binary.

## Private workspace setup — available for an operator, not run in ChatGPT

The new `scripts/release/prepare-world-v2-r18-106-private-workspace.mjs` prepares an empty local filesystem workspace only. It runs **no CLI**, network request, Supabase SQL, auth or project link. It requires an already-existing owner-only, real (non-symlink) private parent outside any repository, and a *new* absolute child named `r106-original-83-...`. It creates owner-only directories (`0700`), a `0600` sparse `supabase/config.toml` with migrations enabled, seed disabled and an independent local project ID, and an empty `supabase/migrations/` folder. It **does not create** a `supabase/.temp/project-ref` file, because pretending to link to the real project would forge remote provenance. A repeated invocation or a path inside a Git checkout is rejected.

On a trusted operator's Unix-like machine (adjust private paths to a secure local filesystem, not a cloud-synced folder):

```bash
umask 077
mkdir -m 700 -p /PRIVATE/ORIGINAL-SQL-PARENT
node scripts/release/prepare-world-v2-r18-106-private-workspace.mjs \
  --workspace=/PRIVATE/ORIGINAL-SQL-PARENT/r106-original-83-recovery \
  --ack-source=lwhwgqaunxbmvyndswze \
  --ack-private-only=NO_UPLOAD_NO_SQL
```

Use the **installed, independently vetted CLI v2.81.3** for a manual, signed-in `supabase link --project-ref lwhwgqaunxbmvyndswze` *from inside the new private workspace*. Review its help and any database/config changes beforehand; verify the resulting `supabase/.temp/project-ref` equals the original ref and `supabase/migrations/` is still empty. If any step differs, **stop**; never use `migration repair`, `db pull`, `db push`, `db reset` or `--include-all` to get past the mismatch.

Then invoke the already-tested R98 operator-only runner **from the Git checkout**, pointing to the private workspace and vetted CLI absolute path:

```bash
node scripts/release/run-world-v2-r18-98-private-history-fetch.mjs \
  --workspace=/PRIVATE/ORIGINAL-SQL-PARENT/r106-original-83-recovery \
  --cli=/ABSOLUTE/CLI-2.81.3/supabase \
  --ack-source=lwhwgqaunxbmvyndswze \
  --ack-private-only=NO_UPLOAD_NO_SQL
```

The R98 runner invokes only `--version`, `migration fetch --help`, and `migration fetch --linked`; it discards raw CLI outputs and requires **83 exact file names and MD5 matches**. Keep its compact NO_GO receipt in a separate private file. The R99 independent file cross-check accepts the private receipt and **does not** certify operator login. Do not upload SQL, private directory contents, CLI logs or credentials to GitHub/chat. A sanitized receipt may be shared only after checking it contains no private identifiers/secrets beyond the project refs and aggregate hashes.

The R100 QA-only mirror and CLI dry-run remain independently gated on private original source recovery, historical SQL security review, a **separate QA workspace linked to bgydsamxypjslergfpla**, and independent QA-target verification. **No QA installation or hosted dry-run was performed.**

## Known release restrictions

The metadata contains 66 historical files referencing SECURITY DEFINER and 67 current authenticated privileged-RPC warnings. The original 83 SQL bodies still require complete private security and portability review (Auth, Storage, Realtime, DML, roles, grants and RLS) before QA bootstrap. The actual signed DM/P1/P2 tests and eight pending R05/R18-48 migrations remain separate. The original database is unchanged; the QA database still has 0 migrations and no public application tables, and QA Vercel remains undeployed.

**R18-106 completes source-verified transport compatibility and a safe operator-only workspace prep. It does not perform an authenticated 83-file fetch, store SQL in Git or authorize release.**
