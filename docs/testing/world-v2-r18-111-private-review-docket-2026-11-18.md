# B10-R18-111 — Trusted-operator private 83-file semantic-review docket (NO_GO)

**18 November 2026.** Direct parent: draft R18-110 PR #213. This is **a review-preparation tool, not a security review, QA approval or remote database action**.

## Current attested state

- Prior operator-only sanitized R18-98/R18-99/R18-108/R18-109 reports verify 83 original historical SQL file hashes and SHA-256 `fe31759c142602047c1813d8ba1868f734138b8f94c773f7f1b6106b5b6bb783` in the private Ubuntu workspace.
- QA project `bgydsamxypjslergfpla` remains empty. No original/QA SQL write, browser deployment, production release or paid resource is permitted.
- The R18-110 live catalog shows 67 authenticated-callable public SECURITY DEFINER functions and a source-confirmed historical `is_map_fog_published` cross-campaign metadata leak (R18-104/105). The R104 patch is still not applied.
- **Not independently proven:** signed operator source authentication, 83 SQL semantic security/portability clearance, signed multi-account acceptance, safe QA-only replay.
- GitHub/R100 QA dry-run script had the same version-notice problem seen in R18-98; R18-111 corrects **only the CLI version stdout parsing** and adds regression coverage. **Do not run QA dry-run before separate authorization.**

## Exact operator-only private step

On trusted Ubuntu WSL, with existing private original-only directory and all four prior sanitized receipts preserved, check out the **exact verified R18-111 Git SHA** (not an unverified branch tip). Then run:

```bash
cd "$HOME/ttrpg-r106-operator"
umask 077
node scripts/release/prepare-world-v2-r18-111-private-review-docket.mjs \
  --workspace="$HOME/ttrpg-history-private/r106-original-83-recovery" \
  --r98-receipt="$HOME/ttrpg-history-private/r98-sanitized.json" \
  --r99-receipt="$HOME/ttrpg-history-private/r99-sanitized.json" \
  --r108-receipt="$HOME/ttrpg-history-private/r108-sanitized.json" \
  --r109-receipt="$HOME/ttrpg-history-private/r109-sanitized.json" \
  --ack-source=lwhwgqaunxbmvyndswze \
  > "$HOME/ttrpg-history-private/r111-sanitized.json" && \
cat "$HOME/ttrpg-history-private/r111-sanitized.json"
```

The script validates all prior receipts and the 83-file original MD5/SHA-256 fingerprint. It then **exclusively creates** `$HOME/ttrpg-history-private/r111-private-review-docket.json`, with owner-only file mode 0600, in the existing private parent directory (which must also be private, mode 0700). If that docket exists already, it **refuses to overwrite**. It does not perform network calls, use Supabase CLI, make SQL or schema changes, copy the SQL bodies, or write to any Git directory.

The private dossier includes 83 file names, source-body digests, boolean R108/R109 risk flags, a suggested URGENT/ADDITIONAL/STANDARD review order, and an explicit `PENDING` checklist for every file. The sanitized stdout/receipt includes **counts and aggregate fingerprint only**. Its claims are intentionally NO_GO for all security, QA and production gates.

**May share:** `r111-sanitized.json` after manual sanity check.

**Never share or upload:** `r111-private-review-docket.json`, `supabase/migrations/*.sql`, tokens, CLI raw logs, passwords, private SSH keys, or screenshots of source SQL. Do not copy those to GitHub/PRs, chat or cloud-synced folders.

## Required independent reviewer assessment

A trusted person with local access to the private original history must examine the actual contents of **all 83 files**, prioritize the four additional R109 file markers (and any new flags), and document:
1. DML/backfills/seed/user data/production assumptions, idempotence and replay order; detect unauthorized production data movements.
2. Every SECURITY DEFINER function and helper: owner, search_path, GRANT/REVOKE, Auth identity checks, IDOR/BOLA and cross-campaign data visibility.
3. RLS, invoker-view compatibility, auth JWT metadata safety, Storage and Realtime system schemas, triggers and event behavior.
4. Privileged SQL, dynamic EXECUTE, extensions/roles, hardcoded environment config, literal secrets, and safe adaptation/rollback.
5. The known fog-status oracle and **separately tested** secure R104 replacement with signed DM/player/nonmember and rollback evidence.

No automated classification can mark a reviewer attestation `APPROVED`. Reviewer signoff must be a separate, trusted, scoped process with explicit evidence and independent authorization. Manual raw source review cannot be simulated by modifying JSON flags.

**NEXT gate:** review only, no QA install/dry-run, no original/production writes, no production deployment, no paid infrastructure.
