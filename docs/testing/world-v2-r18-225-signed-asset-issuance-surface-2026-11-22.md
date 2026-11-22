# R225 — Frozen live signed-asset issuance surface preflight (NO_GO)

22 November 2026. Staging-only child of R224 draft PR #336 at exact parent `281c2938915f2afad6d848ef622e6c49e2ef8f03`; R224 focused synthetic DM/P1/P2/outsider cross-tab workflow 44990402898 and general staged repository workflow 44990403024 both SUCCESS. R225 does not alter any live UI, original/QA SQL, stored objects, Edge Function, credentials, deployment or priced resources.

## Concrete source audit before any live revocation integration

The original `src/SignedAssetUrls.js` contains a single direct `db.storage.from(bucket).createSignedUrl(path,3600)` call, with a 54-minute local TTL. Its current `clear()` reissues when listeners remain active (original issue #231). Current callsites reviewed in the exact staged parent tree:
- `src/TabletopApp.jsx` imports the shared store, calls `signedAssetStore.clear()` **twice** on auth identity transitions, and subscribes to map artwork once in the component source.
- `src/Artwork.jsx` imports the store, uses `peek()` **twice** and `subscribe()` once. It is a shared artwork renderer, not a separate sign API.
- The repo has `supabase/functions/username-register` and `supabase/functions/username-update` as its existing Edge Function folders; R225 CI also scans their JS/TS descendants for new direct sign/public URL calls.

A direct signed URL issuance review **cannot** be considered exhaustive by a word scanner. Dynamic property calls, aliases, code generated later, Storage download endpoints, external proxies, function bodies, existing issued bearer URLs and hidden managed Storage policy composition require independent review. In particular, all live membership/RLS/permission paths are still NO_GO.

## Exact source-only preflight

`scripts/release/r225_live_signed_asset_issuance_gate.py` scans only the current Git checkout `src/` and `supabase/functions/` JS/JSX/TS/TSX/MJS files read-only; rejects symlinks, huge source files, missing required roots or changed expected callsite counts. It fails if new direct `createSignedUrl`/`createSignedUrls` or `getPublicUrl` lexical calls appear anywhere beyond the single reviewed store; or if shared `signedAssetStore.clear()` import/subscribe/peek callers change unreviewed. It also fails on changes from the historical 3600-second bearer URL TTL signature. The tool emits only fixed count fields and explicit **NO_GO**, makes no web/database calls, executes no SQL and writes no files.

The callsite freeze prevents an **unreviewed** runtime signing route from slipping into a future proposal. It does **not** itself prevent existing `clear()` from reissuing, patch security flaws or approve live integration. A legitimate future security patch will require documented updating/reviewing the baseline and exact old R81 frozen preview source-hash rebaseline, not silently weakening those gates.

`tests/world-v2-r18-225-signed-asset-issuance-gate.test.py` uses *wholly fictional repositories* (not original 83 private SQL), including injected unauthorized second signing route, altered TTL, extra cache clear, new public URL from Edge, moved/duplicated signers, source symlinks and missing files. Dedicated CI runs both the synthetic scanner and a read-only check against the real checkout plus R224 synthetic cross-tab tests. Exact diff scope is four files: this document, one `scripts/release/` Python validator, one test, one GitHub Actions workflow. No `src/` edits, migrations/Edge modifications, Vercel, packages or deploy.

## Security and manual boundary

R220 owner-sanitized private SQL lexical evidence recorded 83 SHA-verified original migrations, 937 top-level statements, 12 Storage policies and seven potential overlap pairs, four with nested OR and none with top-level OR markers. These are *not* semantic RLS conclusions. All 83 historical private migrations still require semantic review; 67 authenticated-callable privileged graphs, already-issued signed bearer revocation, signed DM/P1/P2/removed/outsider server-role QA, and security issues #212/#220/#223/#229/#231/#306 remain NO_GO.

Future real activation requires separately reviewed source-integrated R123/R221/R222/R223/R224, a preserved or explicitly amended frozen R81 preview manifest, exact preview/QA target isolation, validated $0 infrastructure, an approved rollback, and server-side membership/Storage RLS enforcement. The existing isolated QA database is not bootstrapped with application schema and neither QA SQL installation nor original/production writes are approved. **No owner WSL work is needed for R225.**

A useful **owner authorization decision** after source-only CI is whether to allow a scoped *read-only metadata audit* of the original Supabase Storage policy catalog and safe privileges (no user data rows, SQL execution with writes, historical SQL export, service-role secrets, schema changes or deployment). Such an audit can check live policy roles and definitions in place, but no direct query should be run without a separately stated exact safe scope and the owner's decision.
