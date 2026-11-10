#!/usr/bin/env bash
# Optional manual Supabase Nano tuning. Never run by CI or Vercel.
set -euo pipefail
project_ref='lwhwgqaunxbmvyndswze'
mode="${1:-help}"
if [[ "$mode" == help || "$mode" == --help ]]; then
  cat <<'HELP'
Nano memory trial (NOT part of automatic PR #61 release)
 preflight : read current Postgres overrides
 apply     : explicitly approved 128MB shared_buffers restart trial
 rollback  : restore saved previous shared_buffers override or platform default
To apply or rollback, take an override backup outside the repository:
 export TTRPG_NANO_OVERRIDE_BACKUP=/absolute/private/path
 bash scripts/supabase-nano-memory-trial.sh preflight
Then explicitly approve a maintenance-window restart:
 export TTRPG_NANO_RESTART_APPROVED=YES
Rollback additionally requires TTRPG_NANO_PREVIOUS_SHARED_BUFFERS:
 the previous exact size (e.g. 224MB) OR default if no prior override.
HELP
  exit 0
fi
case "$mode" in preflight|apply|rollback) ;; *) echo 'Unknown operation' >&2; exit 2;; esac
if [[ "$mode" == apply || "$mode" == rollback ]]; then
  if [[ "${TTRPG_NANO_RESTART_APPROVED:-}" != YES ]]; then
    echo 'Blocked: explicit TTRPG_NANO_RESTART_APPROVED=YES required' >&2; exit 3
  fi
  if [[ -z "${TTRPG_NANO_OVERRIDE_BACKUP:-}" ||
        "$TTRPG_NANO_OVERRIDE_BACKUP" != /* ||
        ! -s "$TTRPG_NANO_OVERRIDE_BACKUP" ]]; then
    echo 'Blocked: an existing private absolute override backup is required' >&2; exit 3
  fi
fi
if [[ "$mode" == rollback ]]; then
  previous="${TTRPG_NANO_PREVIOUS_SHARED_BUFFERS:-}"
  if [[ "$previous" != default && ! "$previous" =~ ^[0-9]+(MB|GB)$ ]]; then
    echo 'Blocked: previous buffer override or default must be specified' >&2; exit 3
  fi
fi
command -v supabase >/dev/null 2>&1 || { echo 'Supabase CLI not available' >&2; exit 4; }
supabase --version >/dev/null
if [[ "$mode" == preflight ]]; then
  if [[ -n "${TTRPG_NANO_OVERRIDE_BACKUP:-}" ]]; then
    if [[ "$TTRPG_NANO_OVERRIDE_BACKUP" != /* ]]; then
      echo 'Backup path must be absolute' >&2; exit 3
    fi
    umask 077
    supabase postgres-config get --project-ref "$project_ref" --experimental \
      > "$TTRPG_NANO_OVERRIDE_BACKUP"
    echo "Saved overrides to $TTRPG_NANO_OVERRIDE_BACKUP"
  else
    supabase postgres-config get --project-ref "$project_ref" --experimental
  fi
elif [[ "$mode" == apply ]]; then
  # This restarts PostgreSQL and disconnects all current sessions.
  supabase postgres-config update --project-ref "$project_ref" --experimental \
    --config shared_buffers=128MB
elif [[ "$previous" == default ]]; then
  supabase postgres-config delete --project-ref "$project_ref" --experimental \
    --config shared_buffers
else
  supabase postgres-config update --project-ref "$project_ref" --experimental \
    --config "shared_buffers=$previous"
fi
