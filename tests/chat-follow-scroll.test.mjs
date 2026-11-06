import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('chat follows newest messages but yields to manual scroll',()=>{
 const source=readFileSync(new URL('../src/TabletopSidebar.jsx',import.meta.url),'utf8');
 assert.match(source,/followNewChatRef=useRef\(true\)/);
 assert.match(source,/pane\.scrollHeight-pane\.scrollTop-pane\.clientHeight<=48/);
 assert.match(source,/if\(pane&&followNewChatRef\.current\)pane\.scrollTop=pane\.scrollHeight/);
 assert.match(source,/onScroll=\{onChatScroll\}/);
});
