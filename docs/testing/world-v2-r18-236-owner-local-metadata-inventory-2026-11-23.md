# R236 — owner-local runtime metadata preflight (NO-GO, no SQL)

23 November 2026. Child of R235 proposed local-replay isolation design [draft PR #345](https://github.com/xuvenz-source/ttrpgsite/pull/345) at exact green head `e25e43d9a37d31c03140c8f95b5bed64fa370dba`. Both R235 source-only gate and staged frontend verification succeeded. **This package DOES NOT execute original or fictional SQL, start Docker/Podman, invoke Supabase CLI, connect to a database, or provision resources.** It is an operator-local, offline metadata snapshot to decide whether a future managed-service-compatible test sandbox is even feasible.

## Why check capabilities before authorizing a replay?

The private owner archive contains 83 SHA-verified migrations and 12 historical top-level DO blocks. R182/R183 already classify the historical publication, Auth/Storage, JSON backfill and function-rewrite effects. R234's redacted observations show identifier-quoted dynamic publication changes and conditional map-visibility helper rewrites, but do not establish exact authorization. A plain standalone PostgreSQL 17 scratch database does not necessarily contain the Supabase managed Auth/Storage/Realtime objects and privilege roles that these migrations expect. R235 therefore prohibits replay until owner-local engine, managed-service, target and private source provenance are independently proven.

## Exact read-only scope

`scripts/release/r236_owner_local_sandbox_capabilities.py`, **to be run only in the owner's existing private Ubuntu WSL**, uses Python standard library metadata inspection:

- Checks whether five literal executable names (`supabase`, `docker`, `podman`, `psql`, `pg_config`) are currently visible in PATH. Does **not** invoke them; command presence does not prove functionality or version.
- Reads only local system metadata for WSL kernel marker, available memory (MiB), filesystem available space (MiB), and whether a local Docker socket file is present. Does **not** connect to Docker.
- Checks for the owner's known private workspace folder and counts up to four existing prior helper script *names* without opening those scripts or private SQLs. Does not print paths or file names.
- Prints a **fixed-schema, bounded JSON** with booleans/numbers and permanent `decision:NO_GO`. Never reports hostnames, binary paths, environment variables, authentication tokens, project identifiers, migration filenames/versions, SQL or raw data.

The checker makes **no network calls**. Downloading the pinned public GitHub Python script separately with `curl` is an explicit, owner-initiated network action to GitHub only; this checker itself never sends data. The checker never runs `subprocess`, `os.system`, `docker`, `supabase`, `psql` or SQL. It does not import a database driver. CI uses only **invented temporary file names and injected fake metadata**. No private owner report/SQL/docket is committed.

### What this cannot establish

- Presence of `docker` or `supabase` does **not** establish their versions, installed engine, daemon readiness, local Auth/Storage/Realtime dependencies, running containers or free cost.
- A Docker socket path is **not** a connectivity test or isolation guarantee.
- File counts are **not** a new 83-history SHA or semantic approval.
- Available memory/disk are **observations**, not proof of sufficient resources.
- Nothing establishes that a future CLI invocation lacks linked remote credentials or production environment variables. Those gates remain explicitly **false**.
- No consent exists for a source-exact replay, even in a local scratch environment.

## After exact-head two-CI success

The operator may download only the immutable `scripts/release/r236_owner_local_sandbox_capabilities.py` from the **exact final PR head**, place it in the existing private `$HOME/ttrpg-history-private` directory with `umask 077`, and run **only** that metadata reader. Redirect its JSON stdout to `r236-sanitized-capabilities.json`. Review locally before uploading that **single JSON only** here. Do not upload old WSL scripts, raw SQL, private docket, verbose logs, credentials, database addresses or unrestricted environment dumps.

**Next decision:** if runtime prerequisites are missing, do **not** start containers, run image downloads, install packages or connect to hosted QA under this permission; prepare an explicit zero-cost local runtime remedy plan. If prerequisites appear present, propose read-only version/help commands *only after a further source-only review*, then separately request exact execution permission for an isolated SQL replay. Neither capability snapshot nor signed-owner consent for this narrow action authorizes migrations.

All historical semantics, 67 privileged RPC graphs, signed DM/P1/P2/revoked/outsider QA, #212/#220/#223/#229/#231/#306/#340, original/QA writes, merges and deployments remain **NO_GO**.
