-- STAGED ONLY. Server-derived encumbrance markers reveal only a DM-approved
-- tier label/icon, never character inventory arrays or private sheet fields.
create or replace function public.inventory_encumbrance_badge(
 p_template jsonb,p_values jsonb
) returns jsonb language plpgsql immutable set search_path='' as $$
declare
 v_rules jsonb:=coalesce(p_template->'inventoryRules','{}'::jsonb);
 v_tab jsonb;v_field jsonb;v_row jsonb;v_tier jsonb;
 v_saved jsonb;v_tiers jsonb;
 v_weight numeric:=0;v_score numeric:=10;v_capacity numeric:=0;
 v_threshold numeric;v_highest numeric:=-1;
 v_best jsonb:=null;v_qty numeric;v_each numeric;
 v_raw text;v_score_field text;
begin
 if coalesce(v_rules->>'enabled','false')<>'true' then return null;end if;
 if jsonb_typeof(p_template->'tabs')<>'array' then return null;end if;
 if jsonb_typeof(p_values)<>'object' then p_values:='{}'::jsonb;end if;
 for v_tab in select value from jsonb_array_elements(p_template->'tabs') limit 30 loop
  if jsonb_typeof(v_tab->'fields')='array' then
   for v_field in select value from jsonb_array_elements(v_tab->'fields') limit 150 loop
    if v_field->>'type'<>'inventory' then continue;end if;
    v_saved:=p_values->(v_field->>'id');
    if jsonb_typeof(v_saved)='array' then
     for v_row in select value from jsonb_array_elements(v_saved) limit 250 loop
      v_qty:=1;v_each:=0;
      v_raw:=coalesce(v_row->>'Qty',v_row->>'qty','1');
      if v_raw ~ '^[0-9]{1,5}([.][0-9]{1,3})?$' then
       v_qty:=least(100000,v_raw::numeric);
      end if;
      v_raw:=coalesce(v_row->>'Weight',v_row->>'weight','0');
      if v_raw ~ '^[0-9]{1,6}([.][0-9]{1,3})?$' then
       v_each:=least(100000,v_raw::numeric);
      end if;
      v_weight:=v_weight+v_qty*v_each;
     end loop;
    end if;
   end loop;
  end if;
 end loop;
 v_score_field:=coalesce(nullif(v_rules->>'scoreField',''),'strength');
 v_raw:=p_values->>v_score_field;
 if v_raw ~ '^[-]?[0-9]{1,4}([.][0-9]{1,3})?$' then
  v_score:=greatest(0,least(10000,v_raw::numeric));
 end if;
 if v_rules->>'capacityMode'='fixed' then
  v_raw:=coalesce(v_rules->>'fixedCapacity','150');
  if v_raw~'^[0-9]{1,7}([.][0-9]{1,3})?$'
  then v_capacity:=greatest(0,v_raw::numeric);else v_capacity:=150;end if;
 else
  v_raw:=coalesce(v_rules->>'multiplier','15');
  if v_raw~'^[0-9]{1,5}([.][0-9]{1,3})?$'
  then v_capacity:=v_score*v_raw::numeric;else v_capacity:=v_score*15;end if;
  v_raw:=coalesce(v_rules->>'bonus','0');
  if v_raw~'^[-]?[0-9]{1,6}([.][0-9]{1,3})?$'
  then v_capacity:=v_capacity+v_raw::numeric;end if;
  v_capacity:=greatest(0,v_capacity);
 end if;
 v_tiers:=v_rules->'tiers';
 if jsonb_typeof(v_tiers)<>'array' then
  v_tiers:='[{"label":"Light encumbrance","threshold":5,"icon":"⚖️","showOnToken":true},
  {"label":"Heavy encumbrance","threshold":10,"icon":"🐌","showOnToken":true},
  {"label":"At carry capacity","threshold":15,"icon":"⛓️","showOnToken":true}]'::jsonb;
 end if;
 for v_tier in select value from jsonb_array_elements(v_tiers) limit 8 loop
  v_raw:=coalesce(v_tier->>'threshold','0');
  if v_raw!~'^[0-9]{1,7}([.][0-9]{1,3})?$' then continue;end if;
  v_threshold:=v_raw::numeric;
  if v_rules->>'thresholdMode'='percent' then
   v_threshold:=v_capacity*v_threshold/100;
  elsif coalesce(v_rules->>'thresholdMode','score')='score' then
   v_threshold:=v_score*v_threshold;
  end if;
  if v_weight>=v_threshold and v_threshold>=v_highest then
   v_highest:=v_threshold;v_best:=v_tier;
  end if;
 end loop;
 if v_best is null or coalesce(v_best->>'showOnToken','false')<>'true' then return null;end if;
 return jsonb_build_object(
  'icon',left(coalesce(nullif(v_best->>'icon',''),'⚖️'),10),
  'label',left(coalesce(nullif(v_best->>'label',''),'Encumbered'),40)
 );
end $$;
-- Internal: direct invocation returns only a marker, but keep access via
-- map-scoped security-checked wrapper rather than letting users query sheets.
revoke all on function public.inventory_encumbrance_badge(jsonb,jsonb) from public,anon,authenticated;

create or replace function public.get_token_encumbrance_badges(p_map uuid)
returns table(token_id uuid, icon text, label text)
language sql stable security definer set search_path='' as $$
 select t.id,x.badge->>'icon',x.badge->>'label'
 from public.battle_maps map
 join public.campaigns c on c.id=map.campaign_id
 join public.map_tokens t on t.map_id=map.id and t.campaign_id=c.id
 left join public.characters ch on ch.id=t.character_id and ch.campaign_id=c.id
 cross join lateral (select public.inventory_encumbrance_badge(
   c.sheet_template,
   case when t.character_id is not null then coalesce(ch.field_values,'{}'::jsonb)
        else coalesce(t.npc_values,'{}'::jsonb) end
 ) badge) x
 where map.id=p_map and auth.uid() is not null
  and public.can_view_campaign_map(c.id,map.id)
  and (public.is_campaign_dm(c.id) or t.visible)
  and x.badge is not null;
$$;
revoke all on function public.get_token_encumbrance_badges(uuid) from public,anon;
grant execute on function public.get_token_encumbrance_badges(uuid) to authenticated;
