import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');

test('movement stays immediate and retains the server-authoritative one-write trajectory',()=>{
 const app=source('TabletopApp.jsx');
 assert.match(app,/setTokens\(rows=>rows\.map\(t=>t\.id===id\?\{\.\.\.t,x,y\}:t\)\)/);
 assert.match(app,/commit_map_trajectory/);
 assert.match(app,/remotePositionSettler\.current\?\.noteCanonical/);
 assert.match(app,/reconcileTokenSnapshot\(/);
 assert.match(app,/isOlderTokenSnapshot\(event\.new,previous\)/);
});

test('fog invalidation rejects in-flight authorization before a new fog RPC',()=>{
 const fog=source('useAuthorizedMapFog.js');
 assert.match(fog,/coordinator\.invalidate\(key\)/);
 assert.match(fog,/if\(!response\.current\)return/);
 assert.match(fog,/fogFrameDuringRefresh\(previous,mapId\)/);
 assert.match(fog,/get_authorized_map_fog/);
 assert.match(fog,/if\(fresh===true\)coordinator\.invalidate\(key\)/);
 assert.match(source('TabletopApp.jsx'),/void fog\.refresh\(true\)/);
 assert.match(fog,/if\(invalidate\(event\)\)changed\.request\(\)/);
 assert.match(fog,/if\(state==='SUBSCRIBED'\)/);
 assert.match(fog,/coordinator\.invalidate\(key\);\s*setFrame\(previous=>previous\?fogFrameDuringRefresh/);
});

test('token, monitor and tool reads are isolated by viewer and fresh sight changes',()=>{
 const app=source('TabletopApp.jsx'),tools=source('useCampaignTools.js');
 assert.match(app,/campaignResourceKey\(\{campaignId,mapId,userId:user,resource:'map-tokens'\}\)/);
 assert.match(app,/resource:'token-monitor-values'/);
 assert.match(app,/resource:'token-encumbrance-badges'/);
 assert.match(app,/refreshCoordinator\.invalidate\(key\)/);
 assert.match(app,/\[activeId,selectedMap,user,isDM\]\)/);
 assert.match(app,/refreshTokens\(true\);refreshMonitors\(true\);refreshChat\(\)/);
 assert.match(app,/void refreshFogAwareTokens\(\);void campaignTools\.refresh\(undefined,true\)/);
 assert.match(tools,/resource:'campaign-tools-'\+kind/);
 assert.match(tools,/variant:isDM\?'dm':'player'/);
 assert.match(tools,/if\(fresh\)coordinator\.invalidate\(key\)/);
 assert.match(tools,/seq\.current\[kind\]!==generations\[kind\]/);
 assert.match(tools,/pendingPositions\.current/);
});

test('tool Realtime notifications selectively invalidate only affected resources',()=>{
 const tools=source('useCampaignTools.js');
 assert.match(tools,/queue\('issued','placed'\)/);
 assert.match(tools,/queue\('placed'\)/);
 assert.match(tools,/queue\('templates'\)/);
 assert.match(tools,/const dirty=new Set\(\)/);
 assert.match(tools,/dirty\.clear\(\)/);
 assert.match(tools,/\[db,campaignId,userId,isDM\]\);/);
 assert.match(tools,/void db\.removeChannel\(c\)/);
});
