import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/game.js';

// A finite-budget campaign: every action uses the same public methods as the UI.
// This catches accidental unwinnable curves, resource bugs, and stalled waves.
export function runCampaign(deploy,options={}){
  const game=new Game(options),history=[];
  for(let wave=1;wave<=10;wave++){
    deploy(game,wave);
    assert.equal(game.startWave(),true);
    let ticks=0;
    while(game.phase==='wave'&&ticks++<10000){
      if(game.overdriveCooldown<=0&&game.enemies.length>4)game.activateOverdrive();
      game.tick(.05);game.events.length=0;
    }
    assert.ok(ticks<10000,`Wave ${wave} never completed`);
    assert.ok(game.credits>=0);assert.ok(game.powerUsed<=game.capacity);
    history.push({wave,hp:game.hp,credits:game.credits,seconds:Math.round(game.elapsed)});
    if(game.phase==='lost')break;
  }
  return {game,history};
}
export function mixedDefense(g,w,strict=true){
  const check=(ok,label)=>{if(strict)assert.equal(ok,true,`W${w}: ${label}`);};
  const build=(type,pad)=>check(g.build(type,pad).ok,`build ${type}`);
  const up=pad=>{const tower=g.towers.find(t=>t.pad===pad);check(!!tower&&g.upgrade(tower.id).ok,`upgrade pad ${pad}`);};
  const grid=()=>check(g.upgradeGrid(),'upgrade grid');
  if(w===1){build('gun',1);build('mortar',3);}
  if(w===2)up(3);
  if(w===3){grid();build('frost',4);}
  if(w===4){build('mortar',7);up(1);}
  if(w===5){grid();up(3);}
  if(w===6){build('mortar',8);up(0);}
  if(w===7){grid();up(8);up(4);up(7);}
  if(w===8){up(8);up(1);up(0);}
  if(w===9){grid();build('gun',10);up(10);up(4);}
  if(w===10){up(10);build('gun',2);up(2);up(2);}
}
test('a mixed defense can complete all ten waves within its actual budget',()=>{
  const {game,history}=runCampaign(mixedDefense);
  // 227 original enemies, with splitters replacing 13 of them and each splitter breaking into two spawnlings.
  assert.equal(game.phase,'won');assert.equal(history.length,10);assert.equal(game.kills,247);assert.equal(game.powerUsed,45);
  assert.ok(game.elapsed>300&&game.elapsed<600);
});
test('the starter turret alone cannot complete the campaign',()=>{
  const {game}=runCampaign(()=>{});assert.equal(game.phase,'lost');assert.ok(game.wave<7);
});
test('hard difficulty defeats the same defense that wins on normal',()=>{
  const {game}=runCampaign((g,w)=>mixedDefense(g,w,false),{difficulty:'hard'});
  assert.equal(game.phase,'lost');assert.ok(game.wave<10);
});
