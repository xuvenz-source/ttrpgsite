# B10-R18-103 — Live RPC source parity and blocked signed authorization acceptance

**17 November 2026 · direct parent R18-102 PR #204, exact SHA `defe689af62951bcf04b30d3a09483ec805548fb` · NO_GO**

The original Supabase database returned a **SELECT-only** metadata inventory containing SHA-256 digests, lengths, signatures, grants and boolean source markers for **12 priority authenticated callable RPCs and 8 helper functions**. No production function bodies, secrets, user rows or campaign data were exported.

We also compared repository function bodies directly against PostgreSQL `pg_proc.prosrc` in a read-only query. All **six exact source equalities passed**, including SHA-256:

| Live function | Source in exact R18-102 commit |
| --- | --- |
| `public.cancel_world_motion_v2` | `supabase/migrations/20261109095000_world_engine_v2_motion_authority.sql` |
| `public.get_dm_map_npc_values` | `supabase/migrations/20261109000500_dm_map_npc_protected_columns.sql` |
| `public.get_world_visibility_v2` | `supabase/migrations/20261109102100_world_engine_v2_visibility_snapshots.sql` |
| `forge_visibility.dispatch_movement_preview` | `supabase/migrations/20261108091818_observer_and_per_viewer_visibility_release_20261108.sql` |
| `forge_world_v2.viewer_on_map` | `supabase/migrations/20261109100000_world_engine_v2_private_observer_stream.sql` |
| `forge_world_v2.visibility_frame_v2` | `supabase/migrations/20261109102100_world_engine_v2_visibility_snapshots.sql` |

The new offline validator **re-extracts all six source bodies and recomputes SHA-256** on CI; a Git change to the source cannot silently invalidate a verified live-body claim. Every one of the 20 live metadata fingerprints is bound to the frozen index Git blob.

**Remaining security issues are NOT closed.** `is_map_fog_published` has no detected direct Auth identity, membership, DM or visibility helper reference and is executable by authenticated users. It returns a boolean; whether exposing another campaign's fog publication status is a leak requires an explicit privacy policy decision and signed nonmember test. `end_map_motion_sessions` lacks one particular direct `actor_id=auth.uid()` source pattern; this is not proof of an authorization defect. `get_world_visibility_v2` and `get_dm_map_npc_values` match repository code with identity/DM delegation, but **no signed multi-user acceptance has been performed**.

The new 17-case matrix records each required signed DM/P1/P2/nonmember test as `NOT_RUN`, including fog status, cross-campaign vision/NPCs, DM preview nonmutation, movement blocked walls, foreign sessions and character-sheet ownership. No tokens or user data were copied and no live RPC was invoked.

**Next gate:** securely recover all 83 original migration bodies in a private authenticated operator environment; independently review their security and portability; perform QA-target-only dry run and rollback rehearsal; separately approve QA bootstrap before running signed acceptance. The original Supabase and QA project remain unchanged; QA has zero installed migrations. R18-103 source verification does not authorize QA SQL, Vercel deployment or production release.

Current Supabase security guidance: https://supabase.com/docs/guides/database/functions
