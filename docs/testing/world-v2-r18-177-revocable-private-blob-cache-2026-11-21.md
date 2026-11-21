# B10-R18-177 — Revocable, bounded in-memory private-image cache

21 November 2026. Exact child of all-green [R18-176 draft PR #285](https://github.com/xuvenz-source/ttrpgsite/pull/285), commit 76b4730e016c2c719d3092ff2a980d95387638db. **NO_GO, source-only, unmounted.** No real browser route or changed existing src/SignedAssetUrls.js.

The existing live SignedAssetUrls.clear() re-signs still-subscribed Storage artwork, potentially creating a fresh bearer link if an access-revocation event arrives before the React artwork components have unmounted. R123 already specifies teardown ordering but is not mounted.

R177 adds a pure cache designed for R175/R176 authenticated private bytes. Its loader receives a resource ID, variant, campaign/user context and AbortSignal (never an exposed Storage path, key or bearer URL). An explicit authorize() call requires a fresh external membership proof from a future R123 host integration. This local UI proof is **not server authorization**; each media request still must be allowed by the signed server resolver and Storage RLS.

Behavior verified by eight synthetic Node cases:
- First subscriber gets blank synchronously, then a Blob object URL; concurrent subscribers share the same fetch.
- revoke() immediately clears subscriber image refs, revokes created object URLs and aborts outstanding loads.
- A late response after revoke cannot recreate any object URL or repaint previously revoked pixels.
- No new requests until a new explicit fresh membership proof. Account/campaign switch purges earlier Blob URLs.
- A bounded LRU refuses new entries if every existing asset is currently displayed; it does not evict in-use URLs.
- Unmounting the last subscriber revokes that URL; dispose() is terminal.

Limitations: already delivered binary bytes, cached browser decodes and user downloads cannot be retrospectively erased. Browser entry-point authorization still depends on mounting R123 sentinel; none of R123, R175, R176 or R177 are active. Real performance and image size testing is required to avoid reintroducing movement lag or overusing the $0 tier. This is not a replacement for server fixes #220, #212, membership #223/#229, URL/Realtime #231 or inventory #218.

No hosted SQL/Storage/Auth configuration, root migrations, active app source, merges, deployments or paid services are changed. The AI lead continues sole technical review, with owner QA and production gates separate.
