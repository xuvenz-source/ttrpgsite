-- Applied on Supabase Free production for consolidated PR #53.
-- Runtime-corrective migration; preserves the server authorization boundary.
create or replace function public.advance_map_motion_session(
 p_session uuid,p_x integer,p_y integer,p_seq bigint)
 returns boolean language plpgsql volatile security definer set search_path='' as $advance_motion$
declare
 actor uuid:=auth.uid();s forge_visibility.movement_sessions%rowtype;
 t record;u record;env_rev bigint;rule_stamp timestamptz;collision_on boolean;
 current_width integer;current_height integer;current_grid integer;
 obstacle jsonb;pts jsonb;a jsonb;b jsonb;i integer;accepted bigint;
 recipient record;probe integer;steps integer;packet jsonb;now_at timestamptz;
begin
 if actor is null or p_session is null or p_x is null or p_y is null
 or p_seq is null or p_seq<=0 or p_seq>9000000000000000 then return false;end if;
 select * into s from forge_visibility.movement_sessions
 where id=p_session and actor_id=actor for update;
 if not found or s.expires_at<clock_timestamp() or p_seq<=s.last_seq
 or p_x<0 or p_y<0 or p_x+s.span_x>s.map_width
 or p_y+s.span_y>s.map_height then return false;end if;
 now_at:=clock_timestamp();
 if s.last_sent is not null and now_at-s.last_sent<interval '90 milliseconds'
 then return false;end if;
 if not public.can_view_campaign_map(s.campaign_id,s.map_id)
 or (s.ignore_collision and not public.is_campaign_dm(s.campaign_id))
 then return false;end if;
 -- Grid resizing must invalidate the gesture even when no wall was edited.
 select floor(b.width/b.grid_size),floor(b.height/b.grid_size),b.grid_size
 into current_width,current_height,current_grid
 from public.battle_maps b where b.id=s.map_id and b.campaign_id=s.campaign_id
  and b.grid_size>0;
 if current_width is distinct from s.map_width or
    current_height is distinct from s.map_height or
    current_grid is distinct from s.grid_size then return false;end if;
 select coalesce(e.revision,0) into env_rev from public.map_environments e
 where e.map_id=s.map_id;
 if coalesce(env_rev,0)<>s.environment_revision then return false;end if;
 select r.updated_at,coalesce(r.collision_enforced,false) into rule_stamp,collision_on
 from forge_visibility.map_rules r where r.map_id=s.map_id;
 if rule_stamp is distinct from s.rules_updated_at or
    coalesce(collision_on,false)<>s.collision_enforced then return false;end if;
 if s.kind='token' then
  select mt.map_id,mt.campaign_id,mt.x,mt.y,mt.owner_id,mt.visible,mt.updated_at,
   mt.character_id,mt.span_x,mt.span_y into t
   from public.map_tokens mt where mt.id=s.piece_id;
  if not found or t.map_id is distinct from s.map_id or
   t.campaign_id is distinct from s.campaign_id or t.x<>s.base_x or
   t.y<>s.base_y or t.updated_at is distinct from s.base_updated_at or
   t.character_id is distinct from s.character_id or
   t.span_x is distinct from s.span_x or t.span_y is distinct from s.span_y or
   (not public.is_campaign_dm(s.campaign_id) and
    (t.owner_id is distinct from actor or t.visible is distinct from true))
  then return false;end if;
  if s.character_id is not null and
   (select c.updated_at from public.characters c where c.id=s.character_id
    and c.campaign_id=s.campaign_id) is distinct from s.character_updated_at
  then return false;end if;
 else
  select ti.map_id,ti.campaign_id,ti.x,ti.y,ti.owner_id,ti.party_shared,
    ti.held_by_token_id,ti.revision into u
  from public.campaign_tool_issues ti where ti.id=s.piece_id;
  if not found or u.map_id is distinct from s.map_id or
   u.campaign_id is distinct from s.campaign_id or
   u.x<>s.base_x or u.y<>s.base_y or
   u.revision is distinct from s.base_tool_revision or
   u.held_by_token_id is not null or
   (not public.is_campaign_dm(s.campaign_id) and
    u.owner_id is distinct from actor and u.party_shared is distinct from true)
  then return false;end if;
 end if;
 -- No-op samples cannot cross a wall: only a changed segment requires
 -- swept collision. Real segments still fail closed on malformed geometry.
 if s.collision_enforced and not s.ignore_collision and
    (p_x<>s.last_x or p_y<>s.last_y) then
  if pg_catalog.jsonb_typeof(s.scene->'objects')<>'array' or
    pg_catalog.jsonb_array_length(s.scene->'objects')>120 then return false;end if;
  for obstacle in select value from pg_catalog.jsonb_array_elements(s.scene->'objects') loop
   if obstacle->>'type' not in ('wall','door','window') then continue;end if;
   if obstacle->>'type' in ('door','window') and obstacle->>'state'='broken'
   then continue;end if;
   if forge_visibility.wall_passes(obstacle,s.attributes,'movement') then continue;end if;
   pts:=obstacle->'points';
   if pg_catalog.jsonb_typeof(pts)<>'array' or
     pg_catalog.jsonb_array_length(pts) not between 2 and 80 then return false;end if;
   for i in 1..pg_catalog.jsonb_array_length(pts)-1 loop
    a:=pts->(i-1);b:=pts->i;
    if forge_visibility.swept_hits_segment(s.last_x,s.last_y,s.span_x,s.span_y,
      p_x,p_y,(a->>'x')::double precision,(a->>'y')::double precision,
      (b->>'x')::double precision,(b->>'y')::double precision)
    then return false;end if;
   end loop;
  end loop;
 end if;
 -- Existing visibility and lighting functions consume this trusted last step.
 insert into forge_visibility.movement_preview_rates(
 actor_id,piece_id,last_sent,last_seq,map_id,kind,
 base_x,base_y,last_x,last_y
 ) values(actor,s.piece_id,now_at,p_seq,s.map_id,s.kind,
 s.base_x,s.base_y,p_x,p_y)
 on conflict(actor_id,piece_id) do update set
 last_sent=excluded.last_sent,last_seq=excluded.last_seq,
 map_id=excluded.map_id,kind=excluded.kind,
 base_x=excluded.base_x,base_y=excluded.base_y,
 last_x=excluded.last_x,last_y=excluded.last_y
 where p_seq>forge_visibility.movement_preview_rates.last_seq
 returning last_seq into accepted;
 if accepted is null then return false;end if;
 update forge_visibility.movement_sessions
 set last_x=p_x,last_y=p_y,last_seq=p_seq,last_sent=now_at,
 expires_at=now_at+interval '6 seconds' where id=s.id;
 steps:=pg_catalog.ceil(greatest(
  pg_catalog.abs(p_x-s.last_x),pg_catalog.abs(p_y-s.last_y)))::int;
 for recipient in
  select cm.user_id,cm.role from public.campaign_members cm
   where cm.campaign_id=s.campaign_id and cm.user_id<>actor
   order by cm.user_id limit 32
 loop
  if s.kind='token' and not s.token_visible and recipient.role<>'dm'
  then continue;end if;
  -- Private recipients are validated by the existing current-LOS routine.
  -- No direct client send or public map topic can bypass this gate.
  probe:=forge_visibility.observer_path_status_cached(
   s.map_id,recipient.user_id,s.campaign_id,s.scene,
   s.grid_size,
   s.map_width,s.map_height,
   s.last_x+s.span_x/2,s.last_y+s.span_y/2,
   p_x+s.span_x/2,p_y+s.span_y/2,steps);
  if probe=0 then continue;end if;
  if probe=1 then
   packet:=pg_catalog.jsonb_build_object('kind',s.kind,'id',s.piece_id,
    'mapId',s.map_id,'actor',actor,'seq',p_seq,
    'action','move','x',p_x,'y',p_y);
  else
   packet:=pg_catalog.jsonb_build_object('kind',s.kind,'id',s.piece_id,
    'mapId',s.map_id,'actor',actor,'seq',p_seq,'action','hide');
  end if;
  perform realtime.send(packet,'motion',
   'forge-observer:'||s.map_id::text||':'||recipient.user_id::text,true);
 end loop;
 return true;
exception when others then
 -- A failed broadcast, malformed scene or unexpected backend error NEVER
 -- downgrades to an unsafe direct client preview.
 return false;
end $advance_motion$;
