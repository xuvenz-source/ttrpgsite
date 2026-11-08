-- STAGING ONLY. Execute only after frontend has rolled back to legacy light RPC.
-- Additive v2 wrapper has no dependent tables or triggers.
drop function if exists public.get_authorized_map_light_masks_v2(uuid);
-- Legacy public.get_authorized_map_light_masks(uuid) remains untouched.
