import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main=(readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/BattlemapBoard.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/SheetTemplateDesigner.jsx',import.meta.url),'utf8'));
const monitors=readFileSync(new URL('../src/TokenMonitors.jsx',import.meta.url),'utf8');
const frames=readFileSync(new URL('../src/TokenMonitorFrames.jsx',import.meta.url),'utf8');
const designer=readFileSync(new URL('../src/TokenDisplayDesigner.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
test('token monitors are rendered in one shared layer above all token artwork',()=>{
 assert.match(frames,/className="token-monitors-over-all"/);
 assert.match(frames,/className="token-monitor-frame"/);
 assert.match(main,/<TokenMonitorFrames tokens=\{visibleTokens\}/);
 assert.ok(frames.includes('const TokenMonitorFrame=React.memo('));
 assert.match(css,/\.board>\.token-monitors-over-all\{[\s\S]*?z-index:30;pointer-events:none!important/);
 assert.equal((frames.match(/<TokenMonitors config=\{config\} normalized/g)||[]).length,1);
 assert.ok(main.includes('const displaySettings=useMemo(()=>normalizeConfig(displayConfig),[displayConfig])'));
 assert.ok(main.indexOf('<TokenMonitorFrames tokens={visibleTokens}')>
  main.indexOf("className={'token '+"));
});
test('existing widgets stay outside unless the DM selects inside',()=>{
 assert.ok(monitors.includes("placement:w.placement==='inside'?'inside':'outside'"));
 assert.ok(monitors.includes("' monitor-'+placement"));
 assert.ok(designer.includes('<option value="outside">Outside token (default)</option>'));
 assert.ok(designer.includes('<option value="inside">Inside token boundaries</option>'));
 assert.ok(css.includes('.token-monitor.monitor-inside.monitor-bar'));
 assert.ok(css.includes('.token-monitor.monitor-inside.monitor-globe'));
});
test('overlay follows zoom, movement and footprints without capturing events',()=>{
 assert.ok(frames.includes('left:Number(p.x)*cell,top:Number(p.y)*cell'));
 assert.ok(frames.includes('width:cell*Number(p.span_x??1),height:cell*Number(p.span_y??1)'));
 assert.match(css,/\.token-monitor-frame\{[\s\S]*?pointer-events:none!important/);
});
