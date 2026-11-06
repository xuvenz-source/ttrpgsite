# Staged follow-up: fast token movement, multi-NPC pop-outs, Quick Adjust statuses

**Unpublished**, appended to the existing inventory/quickcode/window/map-routing
batch. No branch movement, preview build, production deployment, or live database
migration was performed by this staging work.

## Added features

### 1. Low-latency token movement
- During pointer drag, clients publish snapped-grid token preview positions on
  the selected map's private Realtime Broadcast channel, throttled to ~50 ms.
- Other authorized clients show these positions immediately without waiting
  for each full `map_tokens` SQL update and refetch. The existing token-save
  RPC/table update still persists the final movement; broadcast packets are
  transient hints and expire/reconcile against database state automatically.
- The shared resource monitor overlay tracks preview positions alongside
  the portraits. Keyboard movement sends a final preview as well.
- Private channel subscribers and broadcasters must pass RLS for
  `can_view_campaign_map`. Broadcast payloads carry no inventory, character
  sheet data or chat content. Receiver-side checks reject unknown tokens and
  ordinary-player movement of other players' tokens. The persisted movement
  remains protected by database permissions.
- Private channels require correct Realtime Authorization settings. Before
  release, inspect Supabase Realtime Settings → *Allow public access* and
  disable it where needed to enforce private-channel authorization. Test
  spectator/other-private-map denial explicitly. Confirm channel subscription
  reaches `SUBSCRIBED`; if it cannot, normal database movement remains
  the fallback.

### 2. Independent monster/NPC management windows
- Every NPC template or placed monster opens its own draggable, resizable
  floating editor. Five different monsters can remain open simultaneously.
  Clicking an already open monster raises its existing window instead of
  losing its unsaved changes.
- Each editor passes its own NPC identity to Save / Save & keep open and
  Close. Save is never associated with a shared `npcEditor` selection.
- The NPC header also provides **↗ Pop out**, launching a distinct browser
  window. Its URL contains only campaign, NPC type and NPC ID. A new signed-in
  tab retrieves data through existing DM-only database checks; it does not
  inherit unsaved draft values or bypass permissions. The pop-out page hides
  the map behind the NPC editor. Saving before opening a pop-out is required
  when there are unsaved edits.
- Editors use separate stacking and staggered starting positions for easier
  side-by-side monster management.

### 3. Status effects in Quick Adjust
- Ctrl+click Quick Adjust includes current effects as chips, with Remove,
  Add effect, and level selectors for stackable effects (e.g. Exhaustion).
- The **Apply changes** action works for status-only edits, numeric-only edits,
  or both. The existing server status validation, owner/DM permissions and
  optimistic UI remain in place. Partial saves are possible if one of the two
  independent server requests fails; test that path.
- Players can also edit statuses/quick values on their *assigned private map*
  when they control the visible token.

## Additional pending SQL (not applied)

After `20261106200400_move_entire_party_map.sql`, apply:

1. `supabase/migrations/20261106200500_private_live_movement.sql`
   - Private Realtime Broadcast RLS scoped to authorized battle maps.
2. `supabase/migrations/20261106200600_private_map_quick_status.sql`
   - Existing Quick Adjust and token-status functions retain their ownership
     checks while consulting the assigned map rather than only the party default.

Both migrations passed a combined `BEGIN ... ROLLBACK` SQL preflight
on Supabase. No migration was applied.

## Required before publishing

1. Run `node --test tests/*.test.mjs` and `npm run build` without moving
   branches until ready to preview/release. Current checks are static plus SQL
   preflight only, **not** a browser performance or multi-client test.
2. With one DM and two player sessions, compare movement latency for owned
   tokens, NPCs, keyboard controls and pointer drag. Test drop/cancel, fast
   repeated drag, intermittent internet and reconnection. The final database
   position must win, with no ghost token after preview expiry.
3. With players on **different private maps**, verify neither receives the
   other's preview channel messages, and that unauthorized channel
   subscriptions are rejected under the deployed Realtime settings. Check
   whether Realtime public-access settings require modification.
4. Open five monster sheets, edit and save them independently, raise any
   sheet by clicking, close/reopen the same monster and confirm the correct
   saved values. Test five native pop-outs, account permissions, logout and
   unsaved-change warnings. Check window placement on narrow screens.
5. Open Quick Adjust on DM NPC, player-owned token, private-map player token.
   Add/remove status effects, change Exhaustion levels and combine with HP
   edits. Test status-only apply and concurrent updates.
6. Recheck all **seven pending migrations** from this combined batch:
   `20261106200000`–`20261106200600`. Before production, verify the previous
   staged inventory, quickcodes, window management, Bestiary and map-routing
   changes have passed browser testing as well.
