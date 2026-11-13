#!/usr/bin/env bash
set -euo pipefail
# Offline version generation only; refuse linked Supabase credentials/DB host.
[[ "${GITHUB_ACTIONS:-}" == "true" && -n "${RUNNER_TEMP:-}" ]] || { echo 'R47 requires isolated GitHub Actions' >&2; exit 64; }
[[ -z "${SUPABASE_ACCESS_TOKEN:-}" && -z "${SUPABASE_DB_PASSWORD:-}" &&
   -z "${DATABASE_URL:-}" && -z "${PGHOST:-}" && -z "${SUPABASE_PROJECT_ID:-}" ]] || { echo 'R47 refuses remote database connection details' >&2; exit 64; }
ROOT="$RUNNER_TEMP/b10-r18-47-offline-cli"
mkdir -p "$ROOT"
cd "$ROOT"
npx --yes supabase@2.81.3 --version
npx --yes supabase@2.81.3 migration new --help >/dev/null
npx --yes supabase@2.81.3 init
for name in \
 r47_capture_original_sources \
 r47_wall_edge_clearance \
 r47_cross_map_collision_guards \
 r47_campaign_affinity \
 r47_step_bbox_prefilter \
 r47_commit_empty_work \
 r47_atomic_finalize_rpc \
 r47_blocked_terminal_semantics \
 r47_seal_release_sources; do
 npx --yes supabase@2.81.3 migration new "$name"
 sleep 2
done
node - <<'NODE'
const fs=require('node:fs'),path=require('node:path');
const root=process.env.RUNNER_TEMP+'/b10-r18-47-offline-cli';
const dir=root+'/supabase/migrations';
const names=fs.readdirSync(dir).sort();
const stems=[
'r47_capture_original_sources','r47_wall_edge_clearance',
'r47_cross_map_collision_guards','r47_campaign_affinity',
'r47_step_bbox_prefilter','r47_commit_empty_work',
'r47_atomic_finalize_rpc','r47_blocked_terminal_semantics',
'r47_seal_release_sources'
];
if(names.length!==stems.length || new Set(names.map(n=>n.slice(0,14))).size!==stems.length)
 throw Error('R47 CLI generated incomplete/colliding migration versions');
for(let i=0;i<stems.length;i++){
 if(!/^\d{14}_[a-z0-9_]+\.sql$/.test(names[i])||
   !names[i].endsWith('_'+stems[i]+'.sql')||
   names[i].slice(0,14)<='20261111023204'||
   fs.readFileSync(path.join(dir,names[i]),'utf8').trim()!=='')
  throw Error('R47 CLI version/source shell drift '+names[i]);
}
const report={cliVersion:'2.81.3',linked:false,sqlApplied:false,
 generation:'official supabase migration new',filenames:names};
fs.writeFileSync(root+'/manifest.json',JSON.stringify(report,null,2)+'\n');
console.log('R47_OFFICIAL_MANIFEST='+JSON.stringify(report));
NODE
