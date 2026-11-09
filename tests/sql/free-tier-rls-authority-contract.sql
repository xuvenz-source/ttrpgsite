-- Identical contract invoked once before and once after the staged migration.
-- Every test uses SET LOCAL ROLE authenticated, real PostgreSQL RLS and synthetic
-- session JWT context. Rollback ensures both runs start with identical data.
\set ON_ERROR_STOP on
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $test$
declare n integer; denied boolean;
begin
 select count(*) into n from public.characters where campaign_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 if n<>2 then raise exception 'DM must see both campaign characters: %',n; end if;
 select count(*) into n from public.tabletop_macros;
 if n<>1 then raise exception 'DM must only see own macro: %',n; end if;
 select count(*) into n from public.tabletop_menu_preferences;
 if n<>1 then raise exception 'DM must only see own menu'; end if;
 update public.characters set name='DM approved update'
 where id='55555555-5555-4555-8555-555555555555';
 get diagnostics n=row_count;
 if n<>1 then raise exception 'DM cannot edit campaign character'; end if;
 update public.campaigns set name='DM approved' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 get diagnostics n=row_count;
 if n<>1 then raise exception 'DM cannot edit campaign'; end if;
 denied=false;
 begin
  update public.campaigns set owner_id='22222222-2222-4222-8222-222222222222' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 exception when insufficient_privilege then denied=true;
 end;
 if not denied then raise exception 'DM could reassign campaign ownership'; end if;
 perform set_config('request.realtime_topic','forge-world-v2:cccccccc-cccc-4ccc-8ccc-cccccccccccc:11111111-1111-4111-8111-111111111111',true);
 select count(*) into n from realtime.messages;
 if n<>1 then raise exception 'DM private world topic unauthorized'; end if;
 perform set_config('request.realtime_topic','forge-observer:cccccccc-cccc-4ccc-8ccc-cccccccccccc:11111111-1111-4111-8111-111111111111',true);
 select count(*) into n from realtime.messages;
 if n<>1 then raise exception 'DM legacy observer topic unauthorized'; end if;
 perform set_config('request.realtime_topic','forge-world-v2:cccccccc-cccc-4ccc-8ccc-cccccccccccc:22222222-2222-4222-8222-222222222222',true);
 select count(*) into n from realtime.messages;
 if n<>0 then raise exception 'DM can join a player private world topic'; end if;
 perform set_config('request.realtime_topic','forge-world-v2:dddddddd-dddd-4ddd-8ddd-dddddddddddd:11111111-1111-4111-8111-111111111111',true);
 select count(*) into n from realtime.messages;
 if n<>0 then raise exception 'DM can join a map not assigned to them'; end if;
end $test$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $test$
declare n integer; denied boolean;
begin
 select count(*) into n from public.characters where campaign_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 if n<>1 then raise exception 'Player character RLS disclosure %',n; end if;
 select count(*) into n from public.tabletop_macros;
 if n<>1 then raise exception 'Player can see other macros'; end if;
 select count(*) into n from public.tabletop_menu_preferences;
 if n<>1 then raise exception 'Player can see other menus'; end if;
 update public.characters set name='My edit' where id='55555555-5555-4555-8555-555555555555';
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Player cannot edit own character'; end if;
 update public.characters set name='Unallowed' where id='44444444-4444-4444-8444-444444444444';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Player can edit DM character'; end if;
 denied=false;
 begin
  update public.characters set user_id='11111111-1111-4111-8111-111111111111' where id='55555555-5555-4555-8555-555555555555';
 exception when insufficient_privilege then denied=true;
 end;
 if not denied then raise exception 'Player can reassign character'; end if;
 insert into public.map_tokens(id,campaign_id,map_id,owner_id,
 character_id,image_path,x,y)
 values ('88888888-8888-4888-8888-888888888888',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222',
 '55555555-5555-4555-8555-555555555555','hero.png',1,1);
 denied=false;
 begin
  insert into public.map_tokens(id,campaign_id,map_id,owner_id,
  character_id,image_path)
  values ('99999999-9999-4999-8999-999999999999',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111',
  '55555555-5555-4555-8555-555555555555','hero.png');
 exception when insufficient_privilege then denied=true;
 end;
 if not denied then raise exception 'Player may create DM-owned token'; end if;
 denied=false;
 begin
  insert into public.map_tokens(id,campaign_id,map_id,owner_id,
   character_id,image_path)
  values ('aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222',
  '55555555-5555-4555-8555-555555555555','forged.png');
 exception when insufficient_privilege then denied=true;
 end;
 if not denied then raise exception 'Player may create token with forged art'; end if;
 insert into public.tabletop_macros(id,campaign_id,user_id,name)
 values ('aaaa2222-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','New Macro');
 denied=false;
 begin
  insert into public.tabletop_macros(id,campaign_id,user_id,name)
  values ('aaaa3333-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Forged');
 exception when insufficient_privilege then denied=true;
 end;
 if not denied then raise exception 'Player can forge someone else macro'; end if;
 update public.tabletop_macros set name='Updated own'
 where id='77777777-7777-4777-8777-777777777777';
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Player macro edit blocked'; end if;
 update public.tabletop_macros set name='Updated foreign'
 where id='66666666-6666-4666-8666-666666666666';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Player changed foreign macro'; end if;
 delete from public.tabletop_macros where id='66666666-6666-4666-8666-666666666666';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Player deleted DM macro'; end if;
 delete from public.tabletop_macros where id='77777777-7777-4777-8777-777777777777';
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Player cannot delete own macro'; end if;
 update public.tabletop_menu_preferences set expanded='{"x":true}'
 where user_id='22222222-2222-4222-8222-222222222222';
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Player cannot update own sidebar'; end if;
 denied=false;
 begin
  update public.tabletop_menu_preferences set user_id='11111111-1111-4111-8111-111111111111'
  where user_id='22222222-2222-4222-8222-222222222222';
 exception when insufficient_privilege then denied=true;
 end;
 if not denied then raise exception 'Player can reassign sidebar ownership'; end if;
 denied=false;
 begin
  insert into public.tabletop_menu_preferences(campaign_id,user_id)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');
 exception when insufficient_privilege then denied=true;
 end;
 if not denied then raise exception 'Player can forge DM sidebar'; end if;
 perform set_config('request.realtime_topic','forge-world-v2:cccccccc-cccc-4ccc-8ccc-cccccccccccc:22222222-2222-4222-8222-222222222222',true);
 select count(*) into n from realtime.messages;
 if n<>1 then raise exception 'Player cannot join own world observer'; end if;
 perform set_config('request.realtime_topic','forge-observer:cccccccc-cccc-4ccc-8ccc-cccccccccccc:22222222-2222-4222-8222-222222222222',true);
 select count(*) into n from realtime.messages;
 if n<>1 then raise exception 'Player cannot join own legacy observer'; end if;
 perform set_config('request.realtime_topic','forge-world-v2:cccccccc-cccc-4ccc-8ccc-cccccccccccc:11111111-1111-4111-8111-111111111111',true);
 select count(*) into n from realtime.messages;
 if n<>0 then raise exception 'Player can join DM private world observer'; end if;
 perform set_config('request.realtime_topic','forge-observer:cccccccc-cccc-4ccc-8ccc-cccccccccccc:11111111-1111-4111-8111-111111111111',true);
 select count(*) into n from realtime.messages;
 if n<>0 then raise exception 'Player can join DM private legacy observer'; end if;
 perform set_config('request.realtime_topic','forge-world-v2:dddddddd-dddd-4ddd-8ddd-dddddddddddd:22222222-2222-4222-8222-222222222222',true);
 select count(*) into n from realtime.messages;
 if n<>0 then raise exception 'Player can join inaccessible private map'; end if;
end $test$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $test$
declare n integer; denied boolean;
begin
 select count(*) into n from public.characters where campaign_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 if n<>0 then raise exception 'Outsider sees character data'; end if;
 select count(*) into n from public.tabletop_macros where campaign_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 if n<>0 then raise exception 'Outsider sees macros'; end if;
 select count(*) into n from public.tabletop_menu_preferences
 where campaign_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 if n<>0 then raise exception 'Outsider sees menus'; end if;
 denied=false;
 begin
  insert into public.tabletop_macros(id,campaign_id,user_id,name)
  values ('aaaa4444-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','Foreign');
 exception when insufficient_privilege then denied=true;
 end;
 if not denied then raise exception 'Outsider can insert campaign macro'; end if;
 perform set_config('request.realtime_topic','forge-world-v2:cccccccc-cccc-4ccc-8ccc-cccccccccccc:33333333-3333-4333-8333-333333333333',true);
 select count(*) into n from realtime.messages;
 if n<>0 then raise exception 'Outsider can join campaign stream'; end if;
 perform set_config('request.realtime_topic','forge-observer:cccccccc-cccc-4ccc-8ccc-cccccccccccc:33333333-3333-4333-8333-333333333333',true);
 select count(*) into n from realtime.messages;
 if n<>0 then raise exception 'Outsider can join legacy stream'; end if;
end $test$;
rollback;
select 'PASS: DM/player/outsider RLS role and private observer contract' as result;
