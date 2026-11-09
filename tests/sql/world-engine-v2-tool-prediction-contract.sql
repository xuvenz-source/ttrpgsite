-- Disposable Phase 10 permission contract. Test grants for independent
-- loose tools (owned and shared) without disclosing movement rights for
-- another player's private or carried tools. Roll back fixture edits.
BEGIN;
UPDATE forge_visibility.map_rules SET fog_enforced=false
WHERE map_id='10000000-0000-4000-8000-000000000001';

INSERT INTO public.campaign_tool_issues(
 id,campaign_id,map_id,owner_id,party_shared,kind,x,y)
VALUES
 ('50000000-0000-4000-8000-000000000096',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',false,'torch',1,2),
 ('50000000-0000-4000-8000-000000000097',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',true,'torch',1,3);
INSERT INTO public.campaign_tool_map_tokens(
 issue_id,campaign_id,map_id,kind,x,y,
 light_enabled,span)
VALUES
 ('50000000-0000-4000-8000-000000000096',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001','torch',1,2,false,1),
 ('50000000-0000-4000-8000-000000000097',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001','torch',1,3,false,1);
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
DO $$
DECLARE f jsonb;
BEGIN
 f:=public.get_world_visibility_v2(
  '10000000-0000-4000-8000-000000000001');
 IF f IS NULL OR f->>'enabled'<>'false'
 THEN RAISE EXCEPTION 'Unfogged tool grant snapshot unavailable';END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(f->'predictionGrants') g
   WHERE g->>'kind'='tool' AND
    g->>'id'='50000000-0000-4000-8000-000000000001' AND
    jsonb_array_length(g->'quadrants')>0)
 THEN RAISE EXCEPTION 'Owned loose torch had no safe prediction grant';END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(f->'predictionGrants') g
   WHERE g->>'kind'='tool' AND
    g->>'id'='50000000-0000-4000-8000-000000000097' AND
    jsonb_array_length(g->'quadrants')>0)
 THEN RAISE EXCEPTION 'DM-shared loose torch lost player movement grant';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(f->'predictionGrants') g
   WHERE g->>'id' IN (
    '50000000-0000-4000-8000-000000000096',
    '50000000-0000-4000-8000-000000000002'))
 THEN RAISE EXCEPTION 'Unowned or held tool received prediction grant';END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(f->'visiblePieces') p
   WHERE p->>'id'='50000000-0000-4000-8000-000000000096')
 THEN RAISE EXCEPTION 'Test did not include otherwise visible unowned tool';END IF;
END $$;
RESET ROLE;
RESET request.jwt.claim.sub;
ROLLBACK;
SELECT 'world-engine-v2-tool-prediction-permissions-passed' AS result;
