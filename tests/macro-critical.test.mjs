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

test('natural face determines a critical, never the final attack total',()=>{
 const roll=(natural,modifier)=>({natural,total:natural+modifier});
 const critical=(result,threshold)=>result.natural>=threshold;
 assert.equal(critical(roll(19,4),20),false); // 23 total does not crit on 20
 assert.equal(critical(roll(19,4),19),true);  // 19+4 is a crit on 19–20
 assert.equal(critical(roll(18,4),19),false); // 22 total is not a crit
 assert.equal(critical(roll(20,-2),20),true); // 18 total is still a nat 20 crit
});
