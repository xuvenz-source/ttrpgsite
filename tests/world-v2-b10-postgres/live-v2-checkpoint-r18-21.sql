-- B10-R18-21 SOURCE-REAL current production authorized V2 checkpoint helper.
-- Live pg_get_functiondef MD5: 7298cb6051ba259a9c5be1963e1a46a5
-- SELECT-ONLY snapshot. ONLY source-replayed in disposable PG17.
-- NOT A MIGRATION. Never run on connected production.
CREATE OR REPLACE FUNCTION forge_world_v2.commit_allows_piece_v2(p_kind text, p_id uuid, p_campaign uuid, p_map uuid, p_old_x integer, p_old_y integer, p_new_x integer, p_new_y integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor uuid:=auth.uid();s forge_world_v2.motion_sessions%rowtype;
 part jsonb;dx integer;dy integer;
BEGIN
 IF actor IS NULL OR p_kind NOT IN ('token','tool') OR
  p_id IS NULL OR p_campaign IS NULL OR p_map IS NULL OR
  p_old_x IS NULL OR p_old_y IS NULL OR p_new_x IS NULL OR p_new_y IS NULL
 THEN RETURN false;END IF;
 SELECT motion.* INTO s FROM forge_world_v2.commit_checkpoints checkpoint
 JOIN forge_world_v2.motion_sessions motion
  ON motion.id=checkpoint.session_id
 WHERE checkpoint.transaction_id=txid_current() AND
  checkpoint.actor_id=actor AND checkpoint.campaign_id=p_campaign
  AND checkpoint.map_id=p_map AND motion.actor_id=actor AND
  motion.campaign_id=p_campaign AND motion.map_id=p_map AND
  motion.status='active' AND motion.mode<>'preview' AND
  motion.accepted_cells>0 AND motion.accepted_steps<>'[]'::jsonb;
 IF NOT FOUND OR s.dm_override AND
    NOT public.is_campaign_dm(p_campaign) THEN RETURN false;END IF;
 SELECT value INTO part FROM jsonb_array_elements(s.selection)
 WHERE value->>'kind'=p_kind AND (value->>'id')::uuid=p_id;
 IF NOT FOUND THEN RETURN false;END IF;
 dx:=s.last_x-s.origin_x;dy:=s.last_y-s.origin_y;
 RETURN p_old_x=(part->>'x')::integer AND
  p_old_y=(part->>'y')::integer AND
  p_new_x=p_old_x+dx AND p_new_y=p_old_y+dy;
EXCEPTION WHEN others THEN RETURN false;
END $function$;
