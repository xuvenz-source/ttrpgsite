-- Saved per-player, per-campaign sidebar expansion state.
-- Defaults to an empty object so every menu starts collapsed.
create table if not exists public.tabletop_menu_preferences (
 user_id uuid not null references auth.users(id) on delete cascade,
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 expanded jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now(),
 primary key (user_id,campaign_id),
 constraint tabletop_menu_preferences_shape check (
  jsonb_typeof(expanded)='object' and pg_column_size(expanded)<=16384
 )
);

alter table public.tabletop_menu_preferences enable row level security;
grant select,insert,update on public.tabletop_menu_preferences to authenticated;

drop policy if exists "Members read own sidebar menus" on public.tabletop_menu_preferences;
create policy "Members read own sidebar menus" on public.tabletop_menu_preferences
 for select to authenticated
 using (auth.uid()=user_id and public.is_campaign_member(campaign_id));

drop policy if exists "Members create own sidebar menus" on public.tabletop_menu_preferences;
create policy "Members create own sidebar menus" on public.tabletop_menu_preferences
 for insert to authenticated
 with check (auth.uid()=user_id and public.is_campaign_member(campaign_id));

drop policy if exists "Members edit own sidebar menus" on public.tabletop_menu_preferences;
create policy "Members edit own sidebar menus" on public.tabletop_menu_preferences
 for update to authenticated
 using (auth.uid()=user_id and public.is_campaign_member(campaign_id))
 with check (auth.uid()=user_id and public.is_campaign_member(campaign_id));

-- The upsert's updated_at is supplied by the client for existing rows.
