-- Disposable PostgreSQL 17 ONLY: exercise the actual production trigger
-- definitions (not just synthetic fixture_motion_guard) after Phase 10.
-- The two geometry helpers below are copied from the baseline legacy
-- migration for parity and are NOT being redeployed in production.

create or replace function forge_visibility.wall_passes(o jsonb,vals jsonb,
 mode text,side text default 'a')
returns boolean language plpgsql stable set search_path='' as $$
declare
 field text:=o->>'attributeField';
 threshold text; raw text;
begin
 threshold:=case when mode='movement' then o->>'movementAt' else o->>'visionAt' end;
 if mode<>'light' and coalesce(field,'')<>'' and
    coalesce(threshold,'') ~ '^[-]?[0-9]{1,5}([.][0-9]{1,3})?$' then
  raw:=case when jsonb_typeof(vals->field)='object'
    then vals->field->>'current' else vals->>field end;
  if coalesce(raw,'')~'^[-]?[0-9]{1,5}([.][0-9]{1,3})?$'
     and raw::numeric>=threshold::numeric then return true; end if;
 end if;
 if o->>'type' in ('door','window') and o->>'state' in ('open','broken')
 then return true;end if;
 if mode='movement' then return o->>'blocksMovement'='false';end if;
 if mode='light' then return o->>'blocksLight'='false'
  and not (o->>'type'='window' and o->>'curtains'='true');end if;
 if o->>'type'='window' and o->>'curtains'='true' then return false;end if;
 if o->>'vision'='pass' then return true;end if;
 if o->>'vision'='one-way' then
  return o->>'oneWay'=case when side='a' then 'a-to-b' else 'b-to-a' end;
 end if;
 return false;
end $$;

create or replace function forge_visibility.swept_hits_segment(
 x0 double precision,y0 double precision,w double precision,h double precision,
 x1 double precision,y1 double precision,
 ax double precision,ay double precision,bx double precision,b_y double precision)
returns boolean language plpgsql immutable set search_path='' as $$
declare
 xs double precision[]:=array[x0,x0+w,x0+w,x0,x1,x1+w,x1+w,x1];
 ys double precision[]:=array[y0,y0,y0+h,y0+h,y1,y1,y1+h,y1+h];
 axes double precision[][]:=array[
  array[1.0::double precision,0.0::double precision],
  array[0.0::double precision,1.0::double precision],
  array[-(y1-y0),(x1-x0)],
  array[-(b_y-ay),(bx-ax)]];
 i int;j int;p double precision;q double precision;
 min1 double precision;max1 double precision;min2 double precision;max2 double precision;
begin
 for i in 1..4 loop
  if abs(axes[i][1])+abs(axes[i][2])<0.0000001 then continue;end if;
  min1:='Infinity'::double precision;max1:='-Infinity'::double precision;
  for j in 1..8 loop
   p:=xs[j]*axes[i][1]+ys[j]*axes[i][2];
   min1:=least(min1,p);max1:=greatest(max1,p);
  end loop;
  p:=ax*axes[i][1]+ay*axes[i][2];
  q:=bx*axes[i][1]+b_y*axes[i][2];
  min2:=least(p,q);max2:=greatest(p,q);
  if max1<=min2+0.000001 or max2<=min1+0.000001 then return false;end if;
 end loop;
 return true;
end $$;

DROP TRIGGER fixture_token_motion ON public.map_tokens;
DROP TRIGGER fixture_tool_motion ON public.campaign_tool_issues;
CREATE TRIGGER phase10_real_token_collision
 BEFORE UPDATE OF x,y,span_x,span_y,map_id ON public.map_tokens
 FOR EACH ROW EXECUTE FUNCTION forge_visibility.enforce_collision();
CREATE TRIGGER phase10_real_tool_collision
 BEFORE UPDATE OF map_id,x,y,config ON public.campaign_tool_issues
 FOR EACH ROW EXECUTE FUNCTION forge_visibility.enforce_tool_collision();

-- Independent new pieces avoid coupling to Phase 7's live movement fixture.
INSERT INTO public.map_tokens(
 id,campaign_id,map_id,owner_id,x,y,visible,span_x,span_y)
VALUES('40000000-0000-4000-8000-000000000070',
 '20000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000001',1,2,true,1,1);
INSERT INTO public.campaign_tool_issues(
 id,campaign_id,map_id,owner_id,party_shared,kind,x,y)
VALUES('50000000-0000-4000-8000-000000000070',
 '20000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000001',true,'torch',1,6);

SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
DO $$
DECLARE sid uuid;response jsonb;map uuid:='10000000-0000-4000-8000-000000000001';
 rev bigint;perm bigint;
BEGIN
 SELECT revision INTO rev FROM public.map_environments WHERE map_id=map;
 SELECT generation INTO perm FROM forge_visibility.navigation_permission_generations
 WHERE map_id=map;
 sid:=(public.begin_world_motion_v2(map,
  '[{"kind":"token","id":"40000000-0000-4000-8000-000000000070"},
    {"kind":"tool","id":"50000000-0000-4000-8000-000000000070"}]',
  '{"x":1,"y":2}','drag',rev,perm)->>'sessionId')::uuid;
 IF sid IS NULL THEN RAISE EXCEPTION 'V2 real-trigger mixed session missing';END IF;
 response:=public.advance_world_motion_v2(
  sid,1,'{"x":1,"y":2}','[{"x":2,"y":2}]',rev,perm);
 IF response->>'blocked'<>'false' THEN
  RAISE EXCEPTION 'Real triggers V2 route rejected: %',response;END IF;
 response:=public.commit_world_motion_v2(sid,2,'{"x":2,"y":2}',rev,perm);
 IF response->'endpoint'<>'{"x":2,"y":2}'::jsonb THEN
  RAISE EXCEPTION 'V2 real-trigger commit failed: %',response;END IF;
END $$;
RESET ROLE;
RESET request.jwt.claim.sub;

DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.map_tokens
  WHERE id='40000000-0000-4000-8000-000000000070' AND x=2 AND y=2)
 OR NOT EXISTS(SELECT 1 FROM public.campaign_tool_issues
  WHERE id='50000000-0000-4000-8000-000000000070' AND x=2 AND y=6)
 THEN RAISE EXCEPTION 'Real collision triggers did not commit both pieces';END IF;
 IF EXISTS(SELECT 1 FROM forge_world_v2.commit_checkpoints)
 THEN RAISE EXCEPTION 'Real-trigger commit leaked checkpoint';END IF;
END $$;

-- The same installed trigger must still reject direct unswept movement across
-- the published wall; a V2 checkpoint is not a permanent permission.
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
DO $$
BEGIN
 BEGIN
  UPDATE public.map_tokens SET x=6 WHERE id=
   '40000000-0000-4000-8000-000000000070';
  RAISE EXCEPTION 'Direct collision bypass accepted';
 EXCEPTION WHEN others THEN
  IF SQLERRM='Direct collision bypass accepted' THEN RAISE;END IF;
 END;
END $$;
RESET request.jwt.claim.sub;
SELECT 'world-engine-v2-phase10-real-triggers-passed' AS result;
