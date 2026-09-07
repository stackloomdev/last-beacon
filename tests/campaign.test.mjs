import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/game.js';

// A finite-budget campaign: every action uses the same public methods as the UI.
// This catches accidental unwinnable curves, resource bugs, and stalled waves.
export function runCampaign(deploy){
  const game=new Game(),history=[];
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
test('a mixed defense can complete all ten waves within its actual budget',()=>{
  const {game,history}=runCampaign((g,w)=>{
    const build=(type,pad)=>assert.equal(g.build(type,pad).ok,true,`W${w}: build ${type}`);
    const up=pad=>assert.equal(g.upgrade(g.towers.find(t=>t.pad===pad).id).ok,true,`W${w}: upgrade pad ${pad}`);
    const grid=()=>assert.equal(g.upgradeGrid(),true,`W${w}: upgrade grid`);
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
  });
  assert.equal(game.phase,'won');assert.equal(history.length,10);assert.equal(game.kills,227);assert.equal(game.powerUsed,45);
  assert.ok(game.elapsed>300&&game.elapsed<600);
});
test('the starter turret alone cannot complete the campaign',()=>{
  const {game}=runCampaign(()=>{});assert.equal(game.phase,'lost');assert.ok(game.wave<7);
});
