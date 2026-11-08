import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const main=(readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/BattlemapBoard.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/SheetTemplateDesigner.jsx',import.meta.url),'utf8'));
test('drag previews arrive on authorized private map channels',()=>{
 assert.ok(main.includes("db.channel(movementTopic(selectedMap)"));
 assert.ok(main.includes("config:{private:true,broadcast:{ack:false,self:false}}"));
 assert.ok(main.includes("onMovementPreview?.(t,next.x,next.y,false)"));
 assert.ok(main.includes("onMovementPreview?.(t,next.x,next.y,true,cancel)"));
 assert.ok(main.includes('...remotePositions[t.id],...preview[t.id]'));
});
test('fast movement never replaces canonical persisted movement',()=>{
 assert.ok(main.includes("void latestTokenRefresh.current?.()"));
 assert.ok(main.includes("move(t,next.x,next.y)"));
 assert.ok(main.includes("sendLiveMovement(token,x,y,true)"));
 assert.ok(main.includes(".update({x,y}).eq('id',id)"));
});
