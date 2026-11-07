import {readAppStyles} from './readAppStyles.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readAppStyles();
const occurrences=string=>css.split(string).length-1;
test('Units subtab base and selected colors each have only one canonical rule',()=>{
 assert.equal(occurrences('.units-subtabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))'),1);
 assert.equal(occurrences('.units-subtabs button.selected{background:#354a68'),1);
 assert.equal(occurrences('.units-subtabs button{font-size:12px;min-height:29px'),1);
});
test('battlemap pan cursor is defined once with correct token override',()=>{
 assert.equal(occurrences('.map-pan-region.is-panning,.map-pan-region.is-panning .board{'),0);
 assert.ok(css.includes('.map-pan-region.is-panning .token{cursor:grabbing!important}'));
});
