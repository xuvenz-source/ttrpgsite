# R239 — owner-only four-byte Docker executable-type check (NO_GO)

**23 November 2026. Source-only child of R238 [draft PR #348](https://github.com/xuvenz-source/ttrpgsite/pull/348), pinned parent `47baa412deda90952f27b5a92c936d7a0db3f7b8` (focused exact-head CI `45042265264`, general staged frontend/repository `45042265265`, both SUCCESS).**

## What the sanitized owner report actually confirms

The owner supplied **only** `r238-sanitized-docker-path.json` in the conversation. The 1,107-byte **sanitized JSON only** SHA-256 was independently computed as:

`6ff99a2f396d7eb57ffe20847971bd21be9d7d04b086972c0895baae1db88f6f`

The validated R238 receipt says the WSL PATH-selected Docker file is a regular executable on a **MOUNTED_OTHER_OR_WINDOWS** filesystem category, not a WSL system-bin path. It reports **no Docker Desktop WSL mount** and **no socket at the standard Docker path**; user Docker config and contexts exist but were **not opened**. The previous R237 sanitized report classified all three Docker client commands as `UNAVAILABLE` and suppressed stdout/stderr. **None of these readings prove what OS binary format is mounted or that the Docker engine/Windows Docker Desktop is present/absent**. An executable-bit check on a Windows mount is not proof that Linux can launch the executable.

**Do not start, install, remove, reset or reconfigure Docker, do not call `docker info/ps`, do not authorize or execute any original SQL.** Docker's official [WSL2 guide](https://docs.docker.com/desktop/features/wsl/) explains that Docker Desktop's Windows WSL integration is distinct from simple Windows PATH inheritance; enabling per-distro integration requires a user action and a properly installed/running Desktop engine, which have not been established. The preceding R235 scratch replay plan and its 12 mandatory gates remain unapproved.

## R239 exact private-only offline diagnostic

The only purpose of `scripts/release/r239_owner_docker_four_byte_type.py` is to find whether the installed PATH-selected executable looks like a Linux/Unix ELF binary, Windows-style MZ/possibly PE executable, shebang script or unknown bytes. Its code:

1. Validates the exact SHA-256, fixed JSON property set, enum/boolean types and **NO_GO** flags from the owner's previously uploaded sanitized R238 report. That report is never committed to GitHub.
2. Looks up the PATH-selected `docker` entry without invoking it (`shutil.which`). A missing file yields `UNAVAILABLE` and requires no external action.
3. Opens **only** that selected file, read-only and without following symlinks when `O_NOFOLLOW` is available. Verifies that the file descriptor is a regular file with bounded nonzero size.
4. Reads **exactly four bytes**, classifies `0x7F 45 4C 46` as ELF, `MZ` as possible Windows PE, `#!` as shebang script, or anything else as unknown. An `MZ` header is not a full PE parser or proof of Windows execution compatibility. Never prints the raw four bytes or executable source text.
5. Reports only a coarse executable-name suffix enum (`EXE_SUFFIX` / `NO_EXE_SUFFIX`) and fixed header category. **No paths, file names, binary content, configuration, Docker context values, environment variables, host endpoints, credentials, Auth/Storage data, private migration filenames or SQL** are exported. All execution, connection, hosted, sandbox and deployment permission flags remain **false / NO_GO**.

No external process, Docker command, Docker daemon/socket, WSL integration call, network request, Supabase CLI, psql, database, SQL, image pull, container start or cloud resource is involved. The owner privately downloads the immutable public source from GitHub with an explicit HTTPS `curl` action; the checker itself is offline. The output's usefulness is limited to deciding which manual WSL/Windows integration check to recommend next. **This is not proof of a healthy local container engine**.

The dedicated GitHub workflow runs only **fabricated 4-byte temporary files** and monkeypatched receipt-hash tests; the owner report and real executable are not present in CI. The workflow freezes the exact four changed source-only files; no `src/`, live Supabase migration, active SQL, Vercel/Edge/package or deployment change.

## Stop after private receipt

After exact-head verification only, owner may run R239 locally with `umask 077`, redirect stdout to `r239-sanitized-docker-format.json`, inspect it, and attach **only that sanitized JSON** to the conversation. If MZ, strongly consider inherited Windows executable and review Docker Desktop WSL integration **without making changes yet**; if shebang, inspect its compatibility using a separate owner-approved method; if ELF, prepare a nonexecuting local library/interpreter dependency check. None grants authority to install/start Docker, download Supabase CLI, use cloud QA, execute the 83 original migrations or deploy to production.

All 83 historical original migrations remain semantically unapproved, all 67 privileged authenticated RPC roots require signed review, and unresolved security issues #212/#220/#223/#229/#231/#306/#340 remain **SECURITY NO_GO**. No SQL execution, hosted/owner-local database creation, merge, deploy, image pull or paid resource authorized.
