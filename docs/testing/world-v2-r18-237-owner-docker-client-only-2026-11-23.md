# R237 — Owner WSL Docker client-only diagnostic after R236 (NO_GO)

**23 November 2026. SOURCE-ONLY, NO SQL, NO CONTAINERS, NO HOSTED WRITES.**
Exact child of R236 [draft PR #346](https://github.com/xuvenz-source/ttrpgsite/pull/346) at pinned head `108b6ed3d1f18584a6694692107825adc81629a9` (focused `45040892502`, full staged repo `45040892520` both SUCCESS). This is a new, independently scoped diagnostic to distinguish a Docker CLI installed inside WSL from a Docker engine actually available. The prior R235 replay-consent plan [draft #345](https://github.com/xuvenz-source/ttrpgsite/pull/345) remains entirely unapproved.

## R236 sanitized owner result, not uploaded to GitHub

Owner provided **only** `r236-sanitized-capabilities.json` in private chat; exact 1,163-byte sanitized JSON SHA256: `b4b686ad5e94fb4dec92d02628b07328e6fa9d179504d73af59a8c4c96e97699`. Parsed with no unknown fields or approval flags. It reported:
- WSL marker present, owner-private workspace present, four expected helper script names present.
- `docker` executable on WSL PATH; no `/var/run/docker.sock` socket file at checked path. **Does not establish Docker daemon absent**, because Docker supports other socket contexts/endpoints.
- `supabase`, `psql`, `podman`, `pg_config` are not currently on WSL PATH. **Does not establish whether some other executable/package-manager form of Supabase CLI exists.**
- Available memory `15197 MiB`, available home filesystem `976726 MiB`. These are instantaneous local observations, not confirmed allocation/cost/engine readiness.
- Prior script made **zero** subprocess calls, database/network accesses, or reads of credentials/SQL; all release/SQL permissions remained **NO_GO**.

The original R236 uploaded JSON is **not** committed, published or replayed in CI. R237's owner-local reader verifies only its SHA256 and strict, tiny JSON contract before doing anything else.

## Minimal client-only diagnostic

`scripts/release/r237_owner_docker_client_only_diagnostic.py` invokes **only these exact local CLI metadata commands**, each with a bounded timeout, no shell, no inherited Docker endpoint/context override values, with restricted PATH/HOME/LANG:

1. `docker --version` — report only parsed major/minor/patch, never raw stdout/stderr.
2. `docker compose version` — report only parsed local Compose plugin version; unavailable is not an install failure.
3. `docker context show` — report only fixed category `DEFAULT`, `DESKTOP_LINUX`, `OTHER_OR_UNRECOGNIZED` or `UNAVAILABLE`. Never export custom context names, endpoint URIs, hostnames or paths.

The script also returns only names of four Docker connection-override environment variables **if present**, not their values: `DOCKER_HOST`, `DOCKER_CONTEXT`, `DOCKER_TLS_VERIFY`, `DOCKER_CERT_PATH`. They are removed from the subprocess environment. It does not read Docker credential files or `~/.docker/config.json`, inspect original SQL/migration filenames or execute a database query.

**Absolutely no `docker info`, `docker version` without `--version`, `docker ps`, `docker run/pull/start/build`, `supabase start/link/db`, `psql`, SQL, service, context mutation, container start, cloud connection or package install.** These three CLI commands are designed to read local client metadata; the script does not intentionally contact the Docker daemon. It cannot attest what arbitrary locally installed binary/plugin code does under the hood or prove remote context isolation. It emits fixed numeric/bool/string enums and permanent `NO_GO`; errors are mapped to `UNAVAILABLE` without showing raw logs.

The official Docker Desktop WSL 2 integration guide explains that Docker commands may appear inside an Ubuntu distribution while Docker Desktop's engine is separate; WSL integration is configured in Docker Desktop > Settings > Resources > WSL Integration (https://docs.docker.com/desktop/features/wsl/). The official Supabase local-development guide requires a container runtime and CLI (https://supabase.com/docs/guides/local-development). **Do not enable new integration, install packages, download images or start Docker merely because R236 found `docker` on PATH.**

## Once exact-head CI passes, owner manual checkpoint

Only run the pinned R237 script after downloading it to the existing owner-private WSL folder under `umask 077`. The operator chooses to run exactly the three harmless Docker client metadata commands. The script reads the already supplied `r236-sanitized-capabilities.json` from the same private directory and saves stdout to `r237-sanitized-docker-client.json`. Open/review it before uploading **only that JSON** to the conversation. If a command fails, the report will return `UNAVAILABLE`; do not fix it by starting a daemon, invoking `docker info`, running image pulls or installing the CLI without separate review.

GitHub Actions uses fabricated R236 JSON and injected mock subprocess results **only**; no actual docker commands, databases, local archive, raw report or network host. The CI verifies the exact four-path scope, fixed command allowlist and prohibit-data-mutating invocation patterns. Nothing touches `src/`, `supabase/`, Edge, active migrations, Vercel, packages, original/QA Supabase, merges or deployments.

## Decision gate after receiving this snapshot

- If `docker --version` is unavailable or points to an unusable client, stop at exact manual Docker Desktop WSL integration/version verification.
- If client + Compose versions parse, that is still **not evidence of a working daemon**. The next phase may propose a **separately approved** local-only Docker-engine connectivity check after scrutinizing active context and remote endpoint risk. A context named `default` or `desktop-linux` is NOT proof that its endpoint is loopback.
- Supabase CLI remains unavailable under current observations. Its installation, version/help verification and local managed-service compatibility will require separate scope and cost approval.
- Source-exact original 83-migration replay, signed user QA, all staged SQL changes and production remain strictly **NO_GO**. Owner's earlier approval covered redacted SQL extraction only, not executable SQL or local/hosted installations.

**No private original SQL, credentials, names/versions, WSL source files or signed URLs were exported. No SQL was run and no new database created in this milestone.**
