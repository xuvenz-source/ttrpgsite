import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
test('bootstrap is independent of the tabletop controller and map engine',()=>{
 const main=read('main.jsx'),app=read('TabletopApp.jsx'),
  board=read('BattlemapBoard.jsx'),designer=read('SheetTemplateDesigner.jsx');
 assert.match(main,/import TabletopApp from '\.\/TabletopApp\.jsx'/);
 assert.match(app,/import Board from '\.\/BattlemapBoard\.jsx'/);
 assert.match(app,/import Designer from '\.\/SheetTemplateDesigner\.jsx'/);
 assert.match(board,/export default function Board\(/);
 assert.match(designer,/export default function Designer\(/);
 assert.ok(main.split('\n').length<30);
 assert.ok(!app.includes('function Board('));
 assert.ok(!app.includes('function Designer('));
});
test('extracted map engine retains visibility, selection and input controls',()=>{
 const board=read('BattlemapBoard.jsx');
 for(const value of ['MapFogOverlay','selectableToolIds','selectableTokenIds','onToolMovementPreview',
  'addLineTurn','onPointerDownCapture','onPointerCancel','MapPinLayer','TokenMonitorFrames'])
  assert.ok(board.includes(value),value);
 assert.ok(!board.includes("import './style.css'"));
});
