-- Stage alongside the token status feature; do not apply to production
-- until the frontend release is ready.
alter table public.tabletop_user_preferences
 add column if not exists ui_scale numeric(3,2) not null default 0.90;

alter table public.tabletop_user_preferences
 add constraint tabletop_preference_ui_scale
 check (ui_scale in (0.80,0.90,1.00,1.10,1.25));
