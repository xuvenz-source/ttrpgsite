# Interactive map pins and held tools — staged only

Base: `stage/live-qa-light-collision-inventory-ui-2026-11-08`
Branch: `stage/interactive-pins-held-tools-2026-11-08`

No Vercel production merge or Supabase migration application has been performed.

## Changes
- Pins open a compact, dismissible handout popup containing safely rendered text and HTTPS Markdown images.
- DM can select pins and remove them from the popup, Map Setting controls or Delete key. Existing full handout editor remains accessible.
- Remove Published map rules title, explanatory text and live fog/collision sentence while retaining publishing and reset actions.
- DM opt-in Holdable checkbox on tool templates and tool issuance; default is false.
- Drag an issued holdable tool onto a controlled map token, or drag an existing placed tool onto that token. The tool icon stops rendering on the board while held. A torch's occlusion-aware glow centers on its carrier and follows movement. Controlled token Quick Adjust lists held tools with an × drop action.
- Database migration enforces holdable config type, current carrier, token campaign/map and owner authorization, including shared-tool race checks. Public tool projection carries the carrier ID and light metadata, not private inventory.

## Release requirements
Apply `supabase/migrations/20261108023000_holdable_campaign_tools.sql` only after explicit release approval, before deploying the matching frontend. The earlier pending lease migration from PR #38 also remains outstanding. Do not bulk-apply historical migrations.

Run CI lint, Node tests, dependency audit, Vite build and Deno checks. After the one authorized production release, live-test with two player accounts and a DM: pickup on a controlled token and from ground, attempts on other people's tokens, carrier movement, wall light occlusion, dropping via Quick Adjust, map pin permissions, visibility/pickup, and deletion.

No paid infrastructure, no Vercel preview deployments during staging.

- Authoritative fog `forge_visibility.is_lit` uses carrier coordinates while held; tool RLS uses the observed carrier position, and the collision trigger recognizes attach/drop transitions without allowing unrelated tool movement through walls.
