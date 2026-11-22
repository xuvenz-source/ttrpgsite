# R238 — Docker PATH executable provenance, owner-local NO_GO

**23 November 2026. Source-only child of [R237 draft PR #347](https://github.com/xuvenz-source/ttrpgsite/pull/347), pinned parent `f19632047aabb7a5f783e35b822e7e8606a9fcd8` (focused CI `45041533539` and full staged repository `45041533476`: both SUCCESS).** R238 neither invokes Docker/Supabase nor queries their engines, SQL, network, user accounts or original migrations. No original/QA/local database changes or new resources.

## Original owner evidence (private report, never committed to GitHub)

The owner supplied the **sanitized-only** R237 JSON in private chat, SHA-256 `f2808df021b33435056e27e3720eb8a5e3c0793cc44f053bd757561d2cd69639`, 1,034 bytes. It has a valid fixed schema and R236 receipt SHA verification. **All three** previously allowed local Docker client commands (`docker --version`, `docker compose version`, `docker context show`) returned `UNAVAILABLE`, without exported stdout/stderr or cause. R237's four connection-override variable **names** were absent. No daemon was queried, started or proven available, and no historical SQL executed.

R236 separately found `docker` **on PATH** in WSL, no socket file at the one standard path, `supabase` and `psql` not on PATH, with reported free memory 15,197 MiB and free home filesystem 976,726 MiB. The two reports do **not** establish Docker uninstalled, missing Docker Desktop, a broken client, missing PATH or daemon failure. In particular, the previous R237 script intentionally collapses exit errors, timeouts and missing executables to `UNAVAILABLE`. **Do not claim the Docker engine was tested.**

Docker's official [WSL2 documentation](https://docs.docker.com/desktop/features/wsl/) explains that WSL distro integration is distinct from Windows Docker Desktop engine mode, and warns that conflicting Linux-native Docker installations can cause issues. This is **not** an instruction to uninstall/reconfigure Docker; we have not established the installed type.

## One subsequent, narrower local inspection

`scripts/release/r238_owner_docker_path_metadata.py` is a **read-only Python filesystem metadata probe** gated on the exact 1,034-byte sanitized R237 receipt digest and fixed NO_GO schema. It:

- Uses only `shutil.which("docker")`, `os.lstat`, `os.stat`, `os.access` and `Path.resolve` to report whether the PATH-selected executable is a regular executable, symlink to executable, nonexecutable, broken link or missing. This does **not** run the executable or open its contents.
- Classifies path and symlink target into broad enums: `OWNER_HOME`, `LINUX_SYSTEM_BIN`, `DOCKER_DESKTOP_WSL_MOUNT`, `MOUNTED_OTHER_OR_WINDOWS`, `OTHER`, `UNAVAILABLE`. It **never exports paths, executable names or symlink targets**.
- Checks the existence only (not contents or connectivity) of Docker Desktop's WSL mount, `/var/run/docker.sock`, and the owner's local `.docker/config.json` and `.docker/contexts` indicators.
- Emits a fixed-schema, bounded sanitized JSON with permanent `NO_GO`; exports no environment-variable values, original SQL, credentials, Docker context names or endpoint URLs.
- Does not invoke any external program, Docker commands, Supabase commands, PostgreSQL/SQL, packages, services, container image downloads, WSL integration changes or cloud resources.

These metadata checks **cannot** prove the binary works, the daemon is local, current context endpoints are safe, managed Auth/Storage/Realtime are compatible, or that source-exact migration execution is authorized. Even a symlink to a Docker Desktop path is not proof of a running local engine.

## Local checkpoint and decision boundaries

After exact-head GitHub CI succeeds, owner can download **only** the pinned public R238 script into existing `$HOME/ttrpg-history-private`, run it against already held `r237-sanitized-docker-client.json` under `umask 077`, inspect `r238-sanitized-docker-path.json` and attach **only that JSON** to the conversation.

Depending on the actual result, the next response should either:
- Identify a likely conflicting/broken WSL PATH binary or symlink and propose **specific manual Docker Desktop/WSL integration checks**, without asking the owner to uninstall anything without evidence; or
- If filesystem metadata is all normal, propose a **separately reviewed exit-error-category diagnostic**, still no daemon operation, to differentiate missing executable interpreter, permission failure, timeout, failure code or stdout parsing.
No automatic installation, Docker start, `docker info`, `docker ps`, CLI download, `supabase start`, SQL replay, database reset, merge or deploy.

All original 83 historical migration effects, 67 privileged RPC authorization graphs, signed DM/P1/P2/revoked/outsider QA, #212/#220/#223/#229/#231/#306/#340 and local or hosted original/QA database execution remain **SECURITY NO_GO**. No new paid services. **This PR is source-only with fabricated Python filesystem test fixtures and no private owner report in CI.**
