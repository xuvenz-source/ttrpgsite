import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const main=(readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/BattlemapBoard.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/SheetTemplateDesigner.jsx',import.meta.url),'utf8'));
test('character saves notify peers of updated resource overlays',()=>{
 assert.ok(main.includes("event:'monitors-changed'"));
 assert.ok(main.includes("latestMonitorRefresh.current?.()"));
 assert.ok(main.includes("latestMonitorRefresh.current=refreshMonitors"));
 assert.ok(main.includes(".then(result=>{notifyMonitorRefresh();return result})"));
});
test('monitor broadcasts never carry private sheet values or map identifiers',()=>{
 assert.ok(main.includes("event:'monitors-changed',payload:{}"));
});
