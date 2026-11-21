import importlib.util
from pathlib import Path
import sys
import unittest

RELEASE=Path("scripts/release").resolve()
sys.path.insert(0,str(RELEASE))
import r184_private_rpc_history_parity as r184

MONITOR="""create or replace function public.get_token_monitor_values(p_map uuid)
returns boolean language sql security definer as $body$
select c.active_map_id=p_map from public.campaigns c
$body$;"""
REFERENCE="""create or replace function public.post_token_reference(p_token uuid,p_code text)
returns boolean language sql security definer as $body$
select v_token.owner_id=auth.uid()
$body$;"""
MAP_HELPER="""create or replace function public.can_view_campaign_map(p_campaign uuid,p_map uuid)
returns boolean language sql security definer as $body$
select exists (select 1 from public.campaign_player_maps)
$body$;"""
DYNAMIC="""do $patch$
declare definition text; amended text;
begin
 select pg_get_functiondef(p.oid) into definition
 from pg_proc p where p.proname='get_token_monitor_values'
 and pg_get_function_identity_arguments(p.oid)='p_map uuid';
 amended:=replace(definition,'c.active_map_id=p_map',
 'public.can_view_campaign_map(c.id,p_map)');
 if amended=definition then raise exception 'bad';end if;
 execute amended;
 select pg_get_functiondef(p.oid) into definition
 from pg_proc p where p.proname='post_token_reference'
 and pg_get_function_identity_arguments(p.oid)='p_token uuid, p_code text';
 amended:=replace(definition,'v_token.owner_id=auth.uid()',
 'v_token.owner_id=auth.uid() and public.can_view_campaign_map(v_token.campaign_id,v_token.map_id)');
 if amended=definition then raise exception 'bad';end if;
 execute amended;
end $patch$;"""
LATER="""create or replace function public.get_token_monitor_values(p_map uuid)
returns boolean language sql security definer as $body$
select public.can_view_campaign_map(c.id,p_map) from public.campaigns c
$body$;"""

class StructuralOnly(unittest.TestCase):
    def test_source_shape_positive(self):
        p=r184.analyse_sources(MONITOR+"\n"+REFERENCE,MAP_HELPER+"\n"+DYNAMIC,LATER)
        self.assertEqual(len(p),11)
        self.assertTrue(all(p.values()))
        self.assertTrue(all(isinstance(v,bool) for v in p.values()))
        # Never let arbitrary source strings or filenames become report values.
        self.assertNotIn("select ",str(p).lower())
        self.assertNotIn("p_code text",str(p))

    def test_wrong_input_fails_closed(self):
        p=r184.analyse_sources(MONITOR.replace("c.active_map_id=p_map","true")+"\n"+REFERENCE,
            MAP_HELPER+"\n"+DYNAMIC,LATER)
        self.assertFalse(p["prior_monitor_old_guard_exactly_once"])
        self.assertTrue(p["prior_reference_owner_anchor_exactly_once"])

    def test_comment_only_does_not_create_statement(self):
        statements=r184.statements("select 1; -- trailing comment\n")
        self.assertEqual(len(statements),1)

if __name__=="__main__":
    unittest.main()
