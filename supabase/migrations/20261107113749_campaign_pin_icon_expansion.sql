-- Applied to production Supabase on 2026-11-07 as migration 20261107113749.
-- Expand only the handout pin kind constraint; existing five kinds remain valid.
-- No test data deletion or paid infrastructure required.
alter table public.campaign_map_pins
 drop constraint if exists campaign_map_pins_kind_check;
alter table public.campaign_map_pins
 add constraint campaign_map_pins_kind_check
 check(kind in ('note','sign','engraving','book','clue',
                'pin','arrow','trap','warning','flag','skull','star'));
