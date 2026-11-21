# B10-R18-176 — User-JWT-scoped Storage RLS adapter for the R175 private-media gateway

21 November 2026. Exact child of all-green R18-175 [draft PR #284](https://github.com/xuvenz-source/ttrpgsite/pull/284) at parent 3c02f7bc95066d78d7f15acf9a2142eba6e0750e. NO_GO, source-only. No real signed sessions or hosted SQL/Storage.

A new executable unmounted adapter now resolves resource IDs using the exact live original public schema (metadata only, not user rows) and connects to R175's HTTP handler in nine synthetic Node regression tests.

The earlier R174 design proposed a server secret to fetch private assets. **This design is safer:** Supabase private-bucket downloads made with a user JWT are themselves subject to storage.objects RLS, and no service_role secret or elevated download is necessary. A real Edge Function must build a *fresh per-request publishable client with the same verified JWT*; it must not share global user context or let browser input select actor, bucket or path. This implementation has no Auth/client construction and is not deployable as-is.

Asset routes:
- Map image: select battle_maps by UUID, validate same map and call signed can_view_campaign_map(campaign_id,map_id), return storage_path in battlemap-assets.
- Map token art: select map_tokens by UUID, call can_view_campaign_map and can_observe_map_token. A visible token supplies image_path in tabletop-artwork. A portrait requires owner/DM, checks the linked character's campaign and owner or a DM-only NPC template. A visible token does NOT automatically expose character sheet or hidden NPC metadata.
- Personal token art: select personal_tokens by resource ID AND verified actor owner_id. This remains available even after leaving a campaign.
- Private Storage download: use the **same user-scope client**, so the current Storage SELECT policy rechecks the requested exact object after the SQL resource authorization. A forged DB path cannot cause a service-role confused deputy to leak another campaign's object.

Read-only original policy cross-check: battle_maps SELECT calls can_view_campaign_map, map_tokens SELECT uses map and observer helpers, characters SELECT requires owner/DM membership, npc_templates SELECT is DM-only, personal_tokens SELECT requires owner. They are important safeguards, but signed Supabase acceptance remains NOT_RUN.

Supabase private bucket reference: https://supabase.com/docs/guides/storage/buckets/fundamentals
Auth header reference: https://supabase.com/docs/guides/functions/auth-headers
Storage RLS: https://supabase.com/docs/guides/storage/security/access-control

Limitations: simulation cannot validate user JWT propagation, exact historical policy composition, CDN cache behavior or mid-flight revocation. There is no real Supabase SDK client, Edge Function, image-size benchmark, deployed runtime, migration, hosted QA or actual production fix. Existing issued signed links remain valid independent of this new gateway. Release remains NO_GO until #220, #212, #223, #229, #231, #218, historical 83, 67 privileged functions and signed actors are validated and owner separately authorizes QA and R127 production.
