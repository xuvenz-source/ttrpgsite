# B10-R18-112 — Indirect privileged RPC helper-chain source review (NO_GO)

**18 November 2026. Draft/source-only.** Parent R18-111 PR #214 SHA `31ff95304d4926527c340c0730f2d0175aff16e6`. Main security gate [#212](https://github.com/xuvenz-source/ttrpgsite/issues/212). No hosted or production SQL writes; no QA schema installation; no private operator SQL uploaded.

## Actual new observations: SELECT-only live pg_proc

The original `lwhwgqaunxbmvyndswze` still has 83 registered migrations; QA `bgydsamxypjslergfpla` still has 0. Seven authenticated-executable `public` SECURITY DEFINER routines lack literal `auth.uid()` text. The live catalog confirms **all seven are owned by postgres, have configured empty search_path, and deny anonymous EXECUTE**. These checks are **not** a security blessing: a privileged definer can bypass RLS.

The live source contains the following **textual candidate calls** (not confirmed call graph or runtime authorization):

| Elevated RPC | Textual callee references | Risk to test |
| --- | --- | --- |
| `get_campaign_sheet_inventory` | `public.can_edit_campaign_sheet_inventory` | Cross-campaign/source inventory disclosure |
| `get_dm_map_npc_values` | `public.is_campaign_dm` | Cross-campaign or non-DM NPC values |
| `get_npc_token_values` | `public.is_campaign_dm` | Cross-campaign NPC token leakage |
| `is_map_fog_published` | **none** | **Known confirmed cross-campaign fog-status metadata oracle** |
| `patch_campaign_sheet_noninventory` | `public.can_edit_campaign_sheet` | Cross-user sheet mutations and arbitrary metadata |
| `preview_map_motion` | `forge_visibility.dispatch_movement_preview` | Collision override, unauthorized token and map movement |
| `publish_map_environment` | `public.is_campaign_dm`, `forge_visibility.bump_tick` | Unauthorized fog/environment or tick mutation |

The read-only live `pg_proc` metadata also confirms:
- `can_edit_campaign_sheet_inventory` text references `can_edit_campaign_sheet`, whose text references `is_campaign_dm`. The latter has direct `auth.uid()` text; this does **not** establish that its branch logic and source/ownership checks are sound.
- `dispatch_movement_preview` references `is_campaign_dm` and `can_view_campaign_map`, and includes direct `auth.uid()` text. The helper is not directly callable by the `authenticated` role, because it has neither direct function EXECUTE nor schema USAGE. This does **not** rule out an insecure indirect caller.
- `bump_tick` similarly lacks direct authenticated permission, but is invoked from a privileged parent.
- `is_map_fog_published` contains **no comparable helper**. The earlier R18-104/105 work already proves its source-level cross-campaign status leak and the isolated fixture proves the staged fix blocks the oracle. The repair is **still unapplied**.

## Source-level anchored checks, not live account tests

`scripts/release/validate-world-v2-r18-112-indirect-privilege-chains.mjs` validates the observed 7-RPC/6-helper metadata and cross-references the previous R102, R103 and R110 snapshots, and the R103 planned signed scenario matrix. It extracts and SHA-256 verifies two function bodies from **existing Git SQL migrations** that R103 already established are exact byte-for-byte live matches:

1. `get_dm_map_npc_values`: checks direct map/campaign join, `t.map_id=p_map`, `t.character_id IS NULL` and campaign-DM helper.
2. `dispatch_movement_preview`: checks direct `auth.uid()`, current viewer's map authorization, only-DM collision override, and token owner/visibility text.

These are **static source guard-presence tests**; they cannot prove that the function denies all unauthorized inputs. Eight relevant existing R103 signed DM/P1/P2/outsider test cases remain **NOT_RUN**. A regex presence check is not a substitute for dynamic authorization tests, complete source review or a dedicated audit of individual `SECURITY DEFINER` branches.

## Next gates

- Trusted local reviewer must examine actual private 83 historical migration bodies and permissions using the private R111 docket. No raw SQL or docket exported or modified by these tools.
- At minimum the live seven indirect exposed RPCs, helper graph and all 67 authenticated privileged routines require source-level/negative account verification; explicitly prioritize the already-confirmed fog-status leak and the ability of P1 to ask for P2 NPC, sheet, map, fog, movement and publish data.
- Before any hosted QA baseline replay, independently attest the operator source and private history, verify QA-only target and plan the staged safe fog guard. Neither R18-112 nor its tests approve a QA dry-run, SQL installation, or production deploy.
- No new infrastructure, no paid service, no preview, no merges or SQL writes.

**R18-112 result: source-level risk path narrowed, not approved. Original/QA/production release remains NO_GO.**
