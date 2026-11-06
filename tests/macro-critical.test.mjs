import test from 'node:test';
import assert from 'node:assert/strict';
import {supportsMacroCritical} from '../src/MacroCritical.js';

test('single d20 crit tracking ignores fixed and linked modifiers',()=>{
 for(const formula of ['1d20','1d20+4','1d20+@{attack_bonus}',
  '1d20+1d4+4','1d20-2']){
  assert.equal(supportsMacroCritical(formula),true,formula);
 }
});

test('crit tracking refuses multiple, negative or non-d20 dice',()=>{
 for(const formula of ['2d20+4','1d20+1d20+4','-1d20+4',
  '1d8+4','1d200+4','2d10+4','']){
  assert.equal(supportsMacroCritical(formula),false,formula);
 }
});

