import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TOOL_KINDS,DEFAULT_TOOL_CONFIG,normaliseToolConfig,
 toolInitialState,toolCanControl,toolInventoryField,toolLightRadius,
 toolMapProjection} from '../src/CampaignTools.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const user='user-1',other='user-2';
test('DM presets cover lights, mounts and party inventories',()=>{
 assert.deepEqual(Object.keys(TOOL_KINDS),['torch','mount','inventory']);
 assert.deepEqual(Object.keys(DEFAULT_TOOL_CONFIG),['torch','mount','inventory']);
 assert.equal(TOOL_KINDS.mount.icon,'🐴');
 assert.equal(normaliseToolConfig('torch',{bright:15,dim:15}).bright,15);
 assert.deepEqual(toolLightRadius({bright:15,dim:15}),{bright:15,outer:30});
 assert.equal(normaliseToolConfig('torch',{bright:999,dim:-90,intensity:999,
  color:'javascript:evil'}).color,'#ffce7a');
 assert.equal(normaliseToolConfig('torch',{bright:999}).bright,120);
 assert.equal(normaliseToolConfig('torch',{dim:-5}).dim,0);
});
test('each issued tool has its own inventory and starting mount stats',()=>{
 const config=normaliseToolConfig('mount',{
  span:2,inventoryMode:'grid',columns:10,rows:4,
  attributes:{hp:20,ac:12,strength:14}
 });
 const first=toolInitialState('mount',config);
 const second=toolInitialState('mount',config);
 first.items.push({Item:'Rope',Qty:1});
 first.attrs.hp=5;
 assert.equal(second.items.length,0);
 assert.equal(second.attrs.hp,20);
 assert.deepEqual([first.attrs.ac,second.attrs.ac],[12,12]);
 assert.equal(toolInventoryField({kind:'mount',config}).inventoryPreset,'grid');
 assert.equal(toolInventoryField({kind:'mount',config}).gridColumns,10);
 const trimmed=normaliseToolConfig('mount',{...config,
  attributes:{hp:5,custom_save:3}});
 assert.deepEqual(trimmed.attributes,{hp:5,custom_save:3});
 assert.ok(!Object.hasOwn(trimmed.attributes,'ac'));

 assert.equal(toolInventoryField({kind:'inventory',
  config:normaliseToolConfig('inventory',{inventoryMode:'list'})}).inventoryPreset,'list');
});
test('issued personal tools are not controlled by other players; party tools are shared',()=>{
 const personal={owner_id:user,party_shared:false};
 const party={owner_id:null,party_shared:true};
 assert.equal(toolCanControl(personal,user,false),true);
 assert.equal(toolCanControl(personal,other,false),false);
 assert.equal(toolCanControl(personal,other,true),true);
 assert.equal(toolCanControl(party,other,false),true);
 assert.equal(toolCanControl(null,user,true),false);
});
test('Units exposes tools and cards carry scoped drag payloads',()=>{
 const sidebar=source('src/TabletopSidebar.jsx'),ui=source('src/CampaignToolsPanel.jsx');
 assert.match(sidebar,/unitsSubsection==='tools'/);
 assert.match(sidebar,/>Tools<\/button>/);
 assert.match(sidebar,/<CampaignToolsPanel/);
 assert.match(ui,/application\/x-forge-tool/);
 assert.match(ui,/tools\.issueTool\(/);
 assert.match(ui,/tools\.createTemplate\(/);
 assert.match(ui,/tools\.deleteTemplate\(/);
 assert.match(ui,/onOpenTool\(item\.id\)/);
});
test('battlemap renders tool tokens and light effects, with drag/drop and sheet opening',()=>{
 const app=(source('src/main.jsx')+source('src/TabletopApp.jsx')+source('src/BattlemapBoard.jsx')+source('src/SheetTemplateDesigner.jsx')),layer=source('src/CampaignToolMapLayer.jsx');
 assert.match(app,/toolPlacements=\{campaignTools\.placed\}/);
 assert.match(app,/types\.includes\('application\/x-forge-tool'\)/);
 assert.match(app,/<CampaignToolMapLayer/);
 assert.match(app,/onToolPlace=\{placeIssuedToolOnMap\}/);
 assert.match(app,/onTokenPointerDown=\{startToolDrag\}/);
 assert.match(app,/onTokenPointerMove=\{\(e,p\)=>moveTokenDrag/);
 assert.match(layer,/lightOn=p\.kind==='torch'&&p\.light_enabled/);
 assert.match(layer,/onDoubleClick=\{e=>\{if\(own\)/);
 assert.match(layer,/onTokenPointerDown\?\.\(e,p,canMove\)/);
 assert.match(layer,/remotePositions\[p.issue_id\]/);
 assert.match(app,/groupToolFootprint/);
});
test('issued sheets reuse the existing grid/list inventory editor and mount stats',()=>{
 const sheet=source('src/CampaignToolSheet.jsx');
 assert.match(sheet,/<InventoryPanel field=\{inventory\}/);
 assert.match(sheet,/tool\.kind==='mount'/);
 assert.match(sheet,/checked=\{meta\.lit\}/);
 assert.match(sheet,/disabled=\{!isDM\}/);
 assert.match(sheet,/useCampaignToolCollaboration/);
 assert.match(sheet,/onChange=\{collab\.changeItems\}/);
 assert.doesNotMatch(sheet,/>Save changes<\/button>/);
});
test('candidate SQL has protected DM templates, recipient ACL and sanitized map projections',()=>{
 const sql=source('staging/sql-candidates/campaign_tools_issuance.sql');
 assert.match(sql,/STAGING CANDIDATE ONLY\. DO NOT APPLY TO PRODUCTION/);
 assert.match(sql,/alter table public\.campaign_tool_templates enable row level security/);
 assert.match(sql,/alter table public\.campaign_tool_issues enable row level security/);
 assert.match(sql,/alter table public\.campaign_tool_map_tokens enable row level security/);
 assert.match(sql,/revoke all on public\.campaign_tool_map_tokens from anon,authenticated/);
 assert.match(sql,/grant select on public\.campaign_tool_map_tokens to authenticated/);
 assert.doesNotMatch(sql,/grant select,insert,update,delete on public\.campaign_tool_map_tokens/);
 assert.match(sql,/public\.is_campaign_dm\(campaign_id\)/);
 assert.match(sql,/party_shared or owner_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/public\.can_view_campaign_map\(campaign_id,map_id\)/);
 assert.match(sql,/if new\.state->'attrs' is distinct from old\.state->'attrs'/);
 assert.match(sql,/if not v_dm and not public\.can_view_campaign_map/);
 assert.match(sql,/revision bigint not null default 0/);
 assert.match(sql,/new\.revision:=old\.revision\+1/);
 assert.match(sql,/campaign_tool_template_identity/);
 assert.match(sql,/if tg_op='INSERT' then/);
 assert.match(sql,/elsif new.owner_id is distinct from old.owner_id/);
 assert.match(sql,/new.state->'lit' is not distinct from old.state->'lit'/);

 assert.doesNotMatch(sql,/jsonb_object_length\(/);
 assert.match(sql,/light_enabled boolean not null default false/);
 assert.match(sql,/p_config \?& array\['bright','dim','color','intensity'\]/);
 assert.match(sql,/not \(p_config \?& array\['inventoryMode','columns','rows'\]\)/);
 assert.match(sql,/not \(p_state \?& array\['items','attrs','lit'\]\)/);

});
