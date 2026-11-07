-- STAGING CANDIDATE ONLY — NOT APPLIED TO SUPABASE.
-- No separate database test platform: follow the project policy, review safely,
-- and test using the existing live test campaigns after explicit release approval.

create table if not exists public.campaign_handout_folders(
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 80),
 created_at timestamptz not null default now()
);
create index if not exists campaign_handout_folders_campaign_idx
 on public.campaign_handout_folders(campaign_id,name);

create table if not exists public.campaign_handouts(
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 folder_id uuid references public.campaign_handout_folders(id) on delete set null,
 title text not null check(length(trim(title)) between 1 and 120),
 body text not null default '' check(length(body)<=20000),
 revealed boolean not null default false,
 collected boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists campaign_handouts_campaign_idx
 on public.campaign_handouts(campaign_id,folder_id,revealed);

create table if not exists public.campaign_map_pins(
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 map_id uuid not null references public.battle_maps(id) on delete cascade,
 handout_id uuid not null references public.campaign_handouts(id) on delete cascade,
 kind text not null default 'note'
  check(kind in ('note','sign','engraving','book','clue')),
 x numeric(10,2) not null check(x>=0),
 y numeric(10,2) not null check(y>=0),
 visible boolean not null default false,
 collectable boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists campaign_map_pins_map_idx
 on public.campaign_map_pins(campaign_id,map_id,visible);
create index if not exists campaign_map_pins_handout_idx
 on public.campaign_map_pins(handout_id);

-- Campaign-wide revision only; there is no private text or coordinate payload.
create table if not exists public.campaign_handout_events(
 campaign_id uuid primary key references public.campaigns(id) on delete cascade,
 revision bigint not null default 0,
 updated_at timestamptz not null default now()
);

create or replace function public.validate_handout_folder()
returns trigger language plpgsql set search_path='' as $folder$
begin
 if tg_op='UPDATE' and
  (new.id is distinct from old.id or new.campaign_id is distinct from old.campaign_id)
 then raise exception 'Folder identity is immutable';end if;
 return new;
end $folder$;

create trigger campaign_handout_folder_validate
 before update on public.campaign_handout_folders
 for each row execute function public.validate_handout_folder();

create or replace function public.validate_campaign_handout()
returns trigger language plpgsql set search_path='' as $note$
begin
 if tg_op='UPDATE' and
  (new.id is distinct from old.id or new.campaign_id is distinct from old.campaign_id)
 then raise exception 'Handout identity is immutable';end if;
 if new.folder_id is not null and not exists(
  select 1 from public.campaign_handout_folders f
  where f.id=new.folder_id and f.campaign_id=new.campaign_id
 ) then raise exception 'Handout folder belongs to another campaign';end if;
 new.updated_at:=now();
 return new;
end $note$;
create trigger campaign_handout_validate
 before insert or update on public.campaign_handouts
 for each row execute function public.validate_campaign_handout();

create or replace function public.validate_campaign_map_pin()
returns trigger language plpgsql set search_path='' as $pin$
declare map_record record;
begin
 if tg_op='UPDATE' and
  (new.id is distinct from old.id or new.campaign_id is distinct from old.campaign_id)
 then raise exception 'Pin identity is immutable';end if;
 if not exists(select 1 from public.campaign_handouts h
  where h.id=new.handout_id and h.campaign_id=new.campaign_id)
 then raise exception 'Pin handout must belong to this campaign';end if;
 select campaign_id,width,height,grid_size into map_record
  from public.battle_maps where id=new.map_id;
 if not found or map_record.campaign_id<>new.campaign_id or
    map_record.grid_size<=0 or
    new.x >= map_record.width::numeric/map_record.grid_size or
    new.y >= map_record.height::numeric/map_record.grid_size
 then raise exception 'Pin map or position is invalid';end if;
 new.updated_at:=now();
 return new;
end $pin$;
create trigger campaign_map_pin_validate
 before insert or update on public.campaign_map_pins
 for each row execute function public.validate_campaign_map_pin();

-- A DM withdrawing a previously revealed document also closes any visible
-- map pins linking to it. This prevents an old map pin from undoing that hide.
create or replace function public.hide_campaign_handout_pins()
returns trigger language plpgsql set search_path='' as $hide$
begin
 if old.revealed and not new.revealed then
  update public.campaign_map_pins set visible=false,updated_at=now()
   where handout_id=new.id and visible=true;
 end if;
 return new;
end $hide$;
create trigger campaign_handout_hide_pins
 after update of revealed on public.campaign_handouts
 for each row execute function public.hide_campaign_handout_pins();

create or replace function public.bump_campaign_handout_revision()
returns trigger language plpgsql security definer set search_path='' as $tick$
declare campaign uuid;
begin
 if tg_op='DELETE' then campaign:=old.campaign_id;
 else campaign:=new.campaign_id;end if;
 insert into public.campaign_handout_events(campaign_id,revision,updated_at)
 values(campaign,1,now())
 on conflict(campaign_id) do update
  set revision=public.campaign_handout_events.revision+1,
      updated_at=now();
 if tg_op='DELETE' then return old;end if;
 return new;
end $tick$;
create trigger campaign_handout_folder_tick after insert or update or delete
 on public.campaign_handout_folders for each row
 execute function public.bump_campaign_handout_revision();
create trigger campaign_handout_tick after insert or update or delete
 on public.campaign_handouts for each row
 execute function public.bump_campaign_handout_revision();
create trigger campaign_map_pin_tick after insert or update or delete
 on public.campaign_map_pins for each row
 execute function public.bump_campaign_handout_revision();

-- Players can take a visible, collectable note. Issuing the note to the party
-- is intentionally a single campaign-wide update, not a player-only copy.
-- The explicit membership and current map authorization checks are required:
-- SECURITY DEFINER bypasses table RLS.
create or replace function public.collect_campaign_map_pin(p_pin uuid)
returns uuid language plpgsql security definer set search_path='' as $collect$
declare target record;viewer uuid;
begin
 viewer:=auth.uid();
 if viewer is null then raise exception 'Sign in required';end if;
 select p.id,p.handout_id,p.campaign_id,p.map_id,p.visible,p.collectable
  into target from public.campaign_map_pins p where p.id=p_pin;
 if not found or not target.visible or not target.collectable then
  raise exception 'The note cannot be collected';end if;
 if not public.is_campaign_member(target.campaign_id)
  or not public.can_view_campaign_map(target.campaign_id,target.map_id)
 then raise exception 'No access to this note';end if;
 update public.campaign_handouts
  set collected=true,revealed=true
  where id=target.handout_id and campaign_id=target.campaign_id;
 if not found then raise exception 'Note no longer exists';end if;
 return target.handout_id;
end $collect$;

-- No executable public access to privileged helpers.
revoke all on function public.validate_handout_folder() from public,anon,authenticated;
revoke all on function public.validate_campaign_handout() from public,anon,authenticated;
revoke all on function public.validate_campaign_map_pin() from public,anon,authenticated;
revoke all on function public.hide_campaign_handout_pins() from public,anon,authenticated;
revoke all on function public.bump_campaign_handout_revision() from public,anon,authenticated;
revoke all on function public.collect_campaign_map_pin(uuid) from public,anon,authenticated;
grant execute on function public.collect_campaign_map_pin(uuid) to authenticated;

alter table public.campaign_handout_folders enable row level security;
alter table public.campaign_handouts enable row level security;
alter table public.campaign_map_pins enable row level security;
alter table public.campaign_handout_events enable row level security;

revoke all on public.campaign_handout_folders from anon,authenticated;
revoke all on public.campaign_handouts from anon,authenticated;
revoke all on public.campaign_map_pins from anon,authenticated;
revoke all on public.campaign_handout_events from anon,authenticated;
grant select,insert,update,delete on public.campaign_handout_folders to authenticated;
grant select,insert,update,delete on public.campaign_handouts to authenticated;
grant select,insert,update,delete on public.campaign_map_pins to authenticated;
grant select on public.campaign_handout_events to authenticated;

create policy "dm or visible library folder" on public.campaign_handout_folders
 for select to authenticated using(
  public.is_campaign_dm(campaign_id) or (
   public.is_campaign_member(campaign_id) and exists(
    select 1 from public.campaign_handouts h where h.folder_id=campaign_handout_folders.id
     and h.campaign_id=campaign_handout_folders.campaign_id and h.revealed=true
   )
  )
 );
create policy "dm create handout folder" on public.campaign_handout_folders
 for insert to authenticated with check(public.is_campaign_dm(campaign_id));
create policy "dm edit handout folder" on public.campaign_handout_folders
 for update to authenticated using(public.is_campaign_dm(campaign_id))
 with check(public.is_campaign_dm(campaign_id));
create policy "dm delete handout folder" on public.campaign_handout_folders
 for delete to authenticated using(public.is_campaign_dm(campaign_id));

-- A handout is readable only after DM reveals it to the library, OR when
-- the DM exposes a matching pin on a map the requester is allowed to view.
-- The UI filters the library to revealed=true; map-pin text is fetched by ID.
create policy "dm or revealed handout or exposed pin" on public.campaign_handouts
 for select to authenticated using(
  public.is_campaign_dm(campaign_id) or (
   public.is_campaign_member(campaign_id) and
   (revealed or exists(
    select 1 from public.campaign_map_pins p
    where p.handout_id=campaign_handouts.id and p.campaign_id=campaign_handouts.campaign_id
     and p.visible and public.can_view_campaign_map(p.campaign_id,p.map_id)
   ))
  )
 );
create policy "dm create handout" on public.campaign_handouts
 for insert to authenticated with check(public.is_campaign_dm(campaign_id));
create policy "dm edit handout" on public.campaign_handouts
 for update to authenticated using(public.is_campaign_dm(campaign_id))
 with check(public.is_campaign_dm(campaign_id));
create policy "dm delete handout" on public.campaign_handouts
 for delete to authenticated using(public.is_campaign_dm(campaign_id));

create policy "dm or map viewer visible pins" on public.campaign_map_pins
 for select to authenticated using(
  public.is_campaign_dm(campaign_id) or
  (visible and public.is_campaign_member(campaign_id)
   and public.can_view_campaign_map(campaign_id,map_id))
 );
create policy "dm create map pin" on public.campaign_map_pins
 for insert to authenticated with check(public.is_campaign_dm(campaign_id));
create policy "dm edit map pin" on public.campaign_map_pins
 for update to authenticated using(public.is_campaign_dm(campaign_id))
 with check(public.is_campaign_dm(campaign_id));
create policy "dm delete map pin" on public.campaign_map_pins
 for delete to authenticated using(public.is_campaign_dm(campaign_id));
create policy "member can read revision without content" on public.campaign_handout_events
 for select to authenticated using(public.is_campaign_member(campaign_id));

-- ONLY the no-content revision table joins Supabase Realtime publication.
-- Note bodies, folder names and hidden map geometry are never published.
do $safe_realtime$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
  and not exists(select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public'
     and tablename='campaign_handout_events')
 then alter publication supabase_realtime add table public.campaign_handout_events;
 end if;
end $safe_realtime$;
