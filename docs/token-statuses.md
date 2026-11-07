# Token status markers — staged feature

This feature is staged on `feature/token-status-markers`. It is **not deployed to production**.

## Apply before release
1. Apply `supabase/migrations/20261106_token_status_effects.sql` to the Supabase project.
2. Test permissions with a DM and a controlled player token.
3. Merge the feature branch to `main` and deploy one batch when Vercel's quota permits.

## How to use
- **Shift + click** a token to open the status picker (Ctrl + click remains quick resource editing).
- Open the same picker through the **✧** action beside a unit in the Units tab.
- Search by name, filter Conditions/Buffs/Debuffs/Resistances/Custom, toggle effects, then **Apply effects**.
- Use **− / +** on Exhaustion to set levels **1–6** (level 6 is marked as fatal); stackable effects support 1–9.
- DM settings → **Token settings & resources** → **Condition & buff library** to create custom effects, choose colour/icon, and archive/restore them.
- Every viewer of a visible token can see the markers and full names. DM and token owners can edit them, other viewers can inspect read-only.
- Only the first four badges are painted on top of a token; **+N** shows how many more there are. Open the picker to see the entire list.
- Saves are optimistic, server-validated, and broadcast via the existing map token realtime subscription.
- Effects track labels and severity only. They **do not automatically alter D&D dice mechanics, durations, or initiative**.

## Data model
- `map_tokens.status_effects` — list of `{id,level}` with max 18.
- `campaigns.token_status_catalog` — DM-managed custom definitions (max 24).
- `public.set_token_statuses(uuid,jsonb)` — permission-checked atomic update.
- Existing map movement and quick numeric edits remain protected by `public.protect_token_fields()`.

## Testing checklist
- Apply and clear each of the 15 standard conditions, including Exhaustion 1–6.
- Verify buff/resistance tokens, custom effects, archiving, and read-only viewing.
- Verify player cannot edit a token not controlled by them.
- Verify a simultaneous DM/player session receives changes via Realtime.
- Verify movement and Ctrl + click quick-resource adjustment remain functional.
- Verify small 1×1 tokens and larger tokens display badges without obscuring resize handles.
