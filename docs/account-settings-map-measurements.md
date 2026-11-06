# Account Settings and battlemap measurements — staging release checklist

This branch is **not** a production release. It adds the Account Settings UI,
a Supabase Edge Function, and private-map, real-time measurement tools.

## Account Settings service dependency

The frontend calls the new Supabase Edge Function
`supabase/functions/username-update/index.ts`. The function is deliberately
**not deployed to the shared production Supabase project during staging**.

Before the Account Settings username button can operate, a release administrator
must deploy `username-update` using the normal Supabase Edge Function release
process for the `TTRPG Site` project. Keep JWT verification enabled. Use the
same configured server-side credentials as `username-register`: the function
reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or existing
`SUPABASE_SECRET_KEYS`). Do not place server secrets in frontend env vars.

The backend validates the currently signed-in user with Supabase Auth
(`getUser(bearer)`), verifies username uniqueness, and updates a native
username-account's synthetic sign-in email along with its display metadata.
OAuth users retain their real emails and linked Google/Discord identities.
Passwords are changed directly with `auth.updateUser()`, never by this Edge
Function.

Manual release checks:
- Username/password user changes username, signs out, signs in using the new
  username, and confirms the old username no longer works.
- OAuth user changes display username, signs out, signs in with Google/Discord,
  and retains the same account.
- OAuth user sets a password and signs in using their **real account email**.
- Password change requires the current password or reauthentication if the
  Supabase Auth project has that protection enabled.
- The DM's Units tab displays changed usernames on roster refresh.
- Reject a duplicate username, invalid input, and an unauthenticated request.

## Battlemap measuring

Every **grid cell is 5 ft** at all browser zoom and map zoom settings. The
left-side toolbar has four icon-only tools:

- Line: Euclidean direct distance in feet.
- Circle: drag distance from the center is its radius in feet.
- Square: maximum horizontal/vertical drag distance is its radius; the square
  spans twice the radius on each side.
- Cone: the drag length is the cone length; the far end is as wide as the cone
  is long (approximately 53.1° total aperture).

Click an icon and left-drag anywhere on the map, or drag from the icon onto the
map. Middle-button panning and normal left-drag token selection remain available
when no tool is active. Press Escape (or the ✕ icon) to leave measurement mode.
The local drawing follows the pointer, and everyone authorised to view that
specific map receives it on the existing **private** map Realtime channel.
Finished measurements disappear after around 12 seconds.

Tests should include two players on the same map, and a player on a private
different map (who should receive nothing). Test at several zoom settings.
No measurement templates are persisted to campaign data.

## Deployment status

The staging branch is `stage/account-settings-map-measurements`. GitHub Actions
runs the frontend tests and Vite build. Vercel preview creation may be delayed
by the project's daily deployment quota; a green GitHub build is not a live
Vercel preview.


## Sidebar menu preferences (additional staged change)

All Units account folders, individual character sheets, miscellaneous/NPC
groups, and nested Settings/DM sections now start **collapsed** on a fresh
account/campaign. Opening or closing one section is stored independently.

The new `src/useSidebarMenus.js` hook keeps expansion state above the
conditionally rendered right-hand tab panels, so switching to Chat/DM/Settings
and back does not reset any section. State is saved immediately in browser
storage under an account-and-campaign-specific key, including across sign-out
and sign-in on that browser.

For cross-device persistence, release the pending
`supabase/migrations/20261107000100_sidebar_menu_preferences.sql` migration
before publishing the frontend. It creates an account-owned,
campaign-member-gated table with row-level security. While this migration is
not yet deployed (including preview), the frontend uses the browser's saved
state without breaking the menus. This migration is **staged only**, not
applied to the live database.

Manual checks: open several user, character and nested DM menus, switch
between tabs and return, sign out and sign back in, and confirm the same sections
remain open. Verify that closing one section does not close unrelated ones and
that a different account or campaign starts with its own independent state.
