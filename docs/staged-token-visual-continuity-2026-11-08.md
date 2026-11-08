# Staged: token movement continuity and player flicker reduction — 8 Nov 2026

## Release status
Draft staging only. This branch inherits the pending character↔shared inventory
transfer change (PR #47) including its **unapplied SQL candidate**. Neither the
new movement changes nor the inherited inventory transfer SQL are live.

## Investigation

Player-specific flash: during authoritative fog-on visibility ticks,
`useAuthorizedMapFog` temporarily revokes current sight until the RPC returns.
This is required to avoid revealing NPCs through stale explored cells. A
duplicate tick or a tick whose revision has *already been fetched* also took
this path, unnecessarily hiding all unowned tokens. Once a token unmounted,
`Artwork` initially rendered a placeholder despite a still-valid signed URL
being cached. Repeated authorized fog RPCs could also trigger equivalent
full-board React updates.

DM/local hesitation: `BattlemapBoard` called
`motion.current.clearPreview` before its parent had committed the optimistic
token coordinates, potentially repainting the old position for a frame.
Every Realtime `map_tokens` UPDATE also triggered a 100ms full-token and
monitor refresh even when the event was a known coordinate-only update; the
snapshots reconstructed every existing token object and downstream props.

## Implemented in this staging batch

- `TokenMotionRuntime.handoff/reconcile` preserves the local drop transform
  until its matching canonical/optimistic coordinates have committed. On
  error/cancel or map change, the preview still clears. Remote easing reduced
  from 115 to 95ms; the server-verified preview rate remains unchanged.
- `isPositionOnlyTokenEvent` requires the same known token, map and unmodified
  displayed fields before allowing a fast position-only event patch. These
  events defer heavy reconciliation until after movement settles (420ms
  trailing); edits/inserts/deletes still use the regular path.
- `reconcileTokenSnapshot` preserves JS object identity for completely
  unchanged tokens, keeping independently memoized monitor frames stable.
  Missing rows are still removed on each RLS-authorized requery.
- Signed art URLs can be read synchronously from the existing short-lived
  cache when `Artwork` remounts. Paths are not exposed beyond previous signed
  authorization; expiry and auth-session cache invalidation still apply.
- Fog tick dedupe compares the server's `revision` and `fog_enforced`
  against a **previously confirmed authoritative frame**. A tick already
  covered by a newer server snapshot no longer blanks previously observed
  tokens. Genuine newer/unknown ticks still revoke sight immediately.
- Idempotent pending fog invalidation and equality checks of confirmed fog
  masks prevent extra React commits. A WeakMap memoizes current visibility
  cell sets across token visibility checks on one authorized frame.

## Safety and limitations

**Do not keep previously visible NPC sprites on-screen during an unverified
newer fog revision.** Their locations might now be unauthorized. This means
a truly new, sight-changing fog tick can still temporarily hide NPCs until
the updated server RPC arrives. This batch removes *unnecessary* flickers
(duplicate ticks, redundant reconciliation, and expired art placeholders),
but no developer can certify that every possible brief fog-on hide is gone
without changing the server authorization/data transport itself.

No movement permission, wall collision, fog RLS, SQL or server preview
broadcast grant was relaxed. No Supabase migration is needed for these
movement-only changes. Existing backend group movement remains atomic and
server-authoritative.

## Manual browser acceptance — after one approved live release

1. Run two player browsers and one DM simultaneously on an existing test
   campaign. Move owned and NPC tokens with fog disabled and enabled, and
   with private and party-shared vision.
2. Move one token repeatedly while all other tokens are stationary. Record
   whether nonmoving artwork flashes, placeholder icons appear, or monitor
   bars refresh. Compare DM and each player's view.
3. Confirm local dropped tokens never snap back before settling and that
   remote movement visually follows as network packets arrive.
4. Inspect fog-on moves out of sight, into sight, behind walls, and around
   doors. An actually unobserved NPC must disappear immediately, never linger
   in explored darkness. Private map/token secrecy must be unchanged.
5. Confirm a new server-visibility revision still revokes sight, an already
   fetched duplicate revision does not, and a failed fog RPC fails closed.
6. Check server collision rejection, stale movement claims, offline/reconnect,
   background tab resumption, rapidly repeated keyboard moves, 2-token
   selection, mixed tool/token group movement and normal token artwork edits.
7. Check Vercel deployment SHA only after designer approval and one main
   merge. Test on existing campaigns; no paid database staging/preview.

## Release gates

1. GitHub staging tests, dependency audit, Vite build and CodeQL all green.
2. Review the unchanged, unapplied inventory transfer SQL candidate inherited
   from PR #47. Convert/apply it in the existing live Supabase Free project
   only with designer approval, before the combined frontend release.
3. Merge one consolidated PR containing both staged sets and any other ready
   pending work. No preview deployment until explicitly requested.
