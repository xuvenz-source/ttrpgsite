-- STAGING ONLY. Existing five pin kinds are preserved; apply only with
-- explicitly authorized production rollout before exposing the expanded icon UI.
-- No separate database testing platform: validate in existing live test campaigns
-- after the approved migration is applied.
alter table public.campaign_map_pins
 drop constraint if exists campaign_map_pins_kind_check;
alter table public.campaign_map_pins
 add constraint campaign_map_pins_kind_check
 check(kind in ('note','sign','engraving','book','clue',
                'pin','arrow','trap','warning','flag','skull','star'));
