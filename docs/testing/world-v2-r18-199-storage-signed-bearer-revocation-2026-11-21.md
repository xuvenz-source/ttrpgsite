# B10-R18-199 — Signed Storage asset URL revocation and cached-signer lifecycle (NO_GO)

21 November 2026. Exact child of R198 [draft PR #308](https://github.com/xuvenz-source/ttrpgsite/pull/308) head `a2d6285fdf1e4422c3a88c1b437f15d33d41d95a`; R198 isolated original-source R115 revoked character-sheet owner and repository-wide CI each passed. **No merges, hosted original/QA database writes, runtime code changes, active migrations, deployments or paid resources.**

## Owner-only private historical receipt reconciled

Owner supplied **only** `r198-sanitized-report.json` (1,734 bytes; SHA-256 `9688c8aedb036f2d393cacb31a9f1852371a732bbe6f8569e8a820fbb6ce78cc`). Exact JSON/fixed-shape verification passed. SHA-pinned historical migration review reverified **83/83** original files with unique chronological versions and R193 join/create parity, found **one** direct top-level historical `can_edit_campaign_sheet` SECURITY DEFINER PL/pgSQL declaration, and demonstrated that its latest historical body **SHA-256 and byte count match** the current original live 790-byte `pg_proc.prosrc`. The function appears at **R111 priority docket index 49, executable SQL statement ordinal 7**. The docket is *priority-sorted, not chronological*. Direct identity marker present, direct `campaign_members` marker absent.

The existing R115 source-exact synthetic PostgreSQL17 regression proved a removed synthetic character owner could continue claim/GET/PATCH; the **UNAPPLIED** R115 one-check membership guard blocked it. A matching original/live function body is not proof of full policy/helper semantics or real signed user acceptance. All history/privileged call/real signed QA gates remain **NO_GO**.

## Fresh original Supabase Storage read-only aggregate audit

The original project's `storage.objects` policies and `storage.buckets` were checked with **SELECT-only aggregate** queries; no policy SQL, bucket names, object paths, user/campaign data or signed URLs were retrieved. Reproducible source is `scripts/release/r199_readonly_storage_policy_aggregates.sql`:

| Original source/metadata observation | Value |
|---|---:|
| Total buckets, public / private | **3; 0 / 3** |
| `storage.objects` exists and has RLS enabled | Yes |
| Storage object policies | 8 |
| SELECT-applicable policies, permissive / restrictive | **3; 3 / 0** |
| SELECT policies for authenticated or PUBLIC | 3 |
| SELECT policies with direct `campaign_members` text marker | **0** |
| SELECT policies with direct `auth.uid()` marker | 2 |
| SELECT policies with map-view-helper marker | 1 |
| SELECT policies with `bucket_id` marker | 3 |

These are **structural/lexical counts only**. PostgreSQL permissive policies combine by OR, so any unintended broad allow condition could matter, but none was proven. In particular, absence of direct `campaign_members` text **does not imply there is no nested membership check**: one policy references a map authorization helper, whose effective logic still needs inspection. `authenticated` and `anon` table SELECT grants alone do not establish that either can see an arbitrary object when RLS policies apply. We have not minted a signed URL or queried an object.

## Real signed-URL client behavior and official server limitation

Current `src/SignedAssetUrls.js` unchanged Git blob `cda974731221ba49262346aaf9baa7b6c2fc7b4b` signs with `createSignedUrl(path,3600)` (one-hour bearer lifetime), with a **54-minute** local cache TTL. Its `clear()` invalidates an epoch but, while artwork subscribers exist, **calls the signer again** to refresh them. R123 [draft PR #230](https://github.com/xuvenz-source/ttrpgsite/pull/230) already staged a **dormant/unmounted** membership sentinel and mandatory view-mask/unmount/channel-unsubscribe barrier before `clearSignedAssetUrls`; source test proves that wrong-order clear re-signs but verified unmount-before-clear avoids *automatic* re-signing.

Critically, even after `clear()`, an explicit future `get()` call **can ask the server to sign again**. A revoked client cannot be secured merely by JS state clearing, browser hiding or polling: **server-side current campaign-member authorization must deny fresh signed URL issuance**. A prior issued bearer string is independent of the revoked client cache.

Supabase official [Serving assets from Storage](https://supabase.com/docs/guides/storage/serving/downloads) states Storage signed URLs use a **separate signing key** from Auth JWT keys and remain valid until expiry regardless of Auth key rotation; to revoke existing signed URLs, **contact Supabase support**. Do not treat clearing browser cache, signing out, rotating Auth keys, or moving assets as verified revocation. A shorter future signed URL TTL could bound the bearer exposure window, but would increase signer refresh frequency; evaluate under the user's **$0 free-tier, low RAM and movement-latency constraints** before proposing a runtime change. No changed TTL is deployed here.

## R199 exact-head source-only testing

One new `tests/world-v2-r18-199-signed-url-teardown.test.mjs` uses the **actual unchanged** `createSignedAssetStore` and **staged unchanged** `createCampaignRevocationTeardown` with fictional signers only, to establish:

1. The one-hour server TTL differs from the shorter local cache expiry; changing `ttlMs` alone does not revoke server bearer URLs.
2. `clear()` with a still-mounted subscriber **re-signs**; unsubscribing before clear prevents this automatic reissue.
3. An in-flight pre-revocation signer result is discarded after epoch clear; no stale local URL revives.
4. A direct `get()` after `clear()` **still invokes a signer**, proving the client-only teardown cannot guarantee future issuance denial.
5. A **simulated** server-denied signer refuses new URLs; the older previously issued URL string still exists and its actual Supabase acceptance was not tested.
6. Actual R123 unmount-confirmation barrier avoids reissue; a failed barrier masks content and refuses clear.
7. No R123 sentinel or teardown implementation has been mounted into `src/TabletopApp.jsx` or `WorldV2Board.jsx`.

Also rerun **all unchanged R123 source-only and signed URL regression tests** plus a strict R199 Python source SHA/no-release validator with hostile manifest/drift tests. Read-only Storage SQL, old R123 files, new R199 test and live signed store are all **Git blob SHA-1 pinned**. No original private migration content, policy SQL, asset object tokens, actual Storage services, live app or real Auth sessions are used.

## Release boundaries

This is a new **source-only evidence and adversarial test package**, not a server-side fix or proof of exploitation. [Issue #231](https://github.com/xuvenz-source/ttrpgsite/issues/231) remains NO_GO together with revoked sheet #220, invitation #223, privileged membership TRUNCATE #229, authenticated five-table TRUNCATE #306 and fog oracle #212.

Before any QA installation or live deployment: independently review the **actual Storage policy AND/OR and helper call-chain semantics**, ensure reissuance is denied for removed actors at the server, explicitly choose an existing-bearer expiry/support-remediation policy, measure signer refresh load/movement latency, and conduct signed DM/P1/P2/removed/outsider **multi-window, Realtime, Storage and revocation-race QA**. All 83 original historical migration semantic reviews and all 67 authenticated-callable privileged function call chains remain unapproved.

**No further owner-private WSL upload is required for R199**; the R198 sanitized receipt has already been supplied. No original/QA SQL changes, runtime or production changes, merges or paid infrastructure.
