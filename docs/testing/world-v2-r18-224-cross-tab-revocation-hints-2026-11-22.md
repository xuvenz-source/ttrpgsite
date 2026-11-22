# R224 — Same-origin cross-tab revocation HINT relay, staging-only (NO_GO)

22 November 2026. Source-only child of R223 [draft PR #335](https://github.com/xuvenz-source/ttrpgsite/pull/335), exact parent `1d933345e601b23fbb2435749a42313aaee36943`. R223's focused `44990166386` and general staged repository `44990166407` CI both SUCCESS; no runtime activation, SQL writes, QA installation, deployment or merge.

## Specific remaining problem

R123/R222/R223 address only the browser/bridge instance that makes the **actual** signed membership check. Removing P1 from a campaign does not instantly update another P1 tab, a separate browser window, or popout; the older tab may retain cached art until it gets an independently verified membership denial. A "member removed" browser event must **never** be trusted as a server authorization fact. It can only trigger a synchronous mask and a fresh signed user identity plus RLS-scoped `campaign_members` SELECT check.

## R224 staged contract

`staging/world-v2-b10-r18-224-revocation-hints/CampaignRevocationHintRelay.js` composes the already staging-only R223 terminal revocation bridge and takes a strictly injected, testable transport. **No BroadcastChannel or actual browser integration is created here**, no subscriptions to live Supabase, no SQL, no movement-frame polling, no timers, no server traffic beyond the mocked R123 membership calls in tests.

After signed membership proof is specifically `revoked`, the relay makes at most one best-effort same-context message with exactly four fixed fields: a version, a fixed recheck event name, a campaign identifier and a user identifier. There are no bearer URLs, credentials, SQL, roles, actor claims or source definitions in the message. Real integration should use same-origin local transport and must NOT forward identifying message fields to analytics/logs.

A receiver accepts only an exact 4-field message for the **same** active campaign and signed user; otherwise it ignores the message. A matching untrusted hint immediately invokes `bridge.notify('membership-hint')`, synchronously masking a currently authorized R123 view before its own fresh server proof. It cannot permanently lock its asset cache solely on receipt, cannot automatically grant access and never echoes received hints. In-flight duplicate hints are coalesced. An external context switch invalidates the relay's `snapshot().allowed` claim even before the underlying R123 sentinel has been separately re-entered.

**This is defense-in-depth and best-effort only.** A malicious same-origin script can force masks/rechecks by spoofing a hint, though it cannot certify revocation. Delivery can fail, tabs can be suspended/offline, a recipient may be in a different browser profile/device and therefore never receive it, and a valid old signed bearer URL remains valid at the Storage server until separate expiry/revocation. Live integration must synchronously mask and call `begin/close` on every campaign/account switch, independent of snapshot reads. Server-side membership/RLS controls are mandatory. Periodic checks (R123 60,000ms minimum) and actual live signed DM/P1/P2/removed/outsider QA are not yet integrated.

`tests/world-v2-r18-224-cross-tab-revocation-hints.test.mjs` uses only fictional campaign/user IDs, in-memory same-origin mock channels, in-memory user membership, the actual **STAGED** R123/R221/R222/R223 classes and dummy signed URLs. It covers a DM, P1 in two tabs, P2, outsider; confirmed P1 removal reaching only matching P1; unrelated user/campaign messages ignored; spoofed same-context hint causing only RLS re-verification; duplicate hints coalesced while one proof is pending; stale campaign context snapshot masked; unsubscribe/dispose; and failed outgoing delivery explicitly marked unverified. Dedicated CI reruns R123/R221/R222/R223 synthetic tests with strict 4-file staging-only path validation.

## Security/owner manual gate

The live app is unchanged. R81 frozen preview source-hash checks remain intact. R220's private sanitized owner report found seven possible archived Storage policy-key overlaps, four containing nested OR, **not verified effective RLS**. All 83 original private migration semantics, 67 privileged callable graphs, Storage bearer URL revocation, SQL authorization, signed role-matrix QA, and security blockers #212/#220/#223/#229/#231/#306 remain **NO_GO**.

A real cross-tab transport integration and authentic signed session/Storage authorization matrix must be reviewed separately. Any QA-only SQL installation or preview deployment requires a specific separately approved exact target, $0 resources and tested rollback/backup plan. No owner WSL/manual action is needed for this source-only R224 package.
