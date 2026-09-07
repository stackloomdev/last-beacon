import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,PADS,PATH,PATH_LENGTH,pathPosition,towerStats,sellValue} from '../src/game.js';

function advance(g,seconds){for(let t=0;t<seconds;t+=.05){g.tick(.05);g.events.length=0;}}
test('path interpolation follows every corner and terminates at the lighthouse',()=>{
  let d=0;assert.deepEqual(pathPosition(0),{x:0,y:4});
  for(let i=1;i<PATH.length;i++){d+=Math.hypot(PATH[i][0]-PATH[i-1][0],PATH[i][1]-PATH[i-1][1]);assert.deepEqual(pathPosition(d),{x:PATH[i][0],y:PATH[i][1]});}
  assert.equal(d,PATH_LENGTH);assert.deepEqual(pathPosition(d+100),{x:10,y:5});
});
test('placing a tower spends currency once and cannot overwrite a pad',()=>{
  const g=new Game({starter:false}),before=g.credits;
  assert.equal(g.build('gun',1).ok,true);assert.equal(g.credits,before-65);
  assert.equal(g.build('mortar',1).ok,false);assert.equal(g.credits,before-65);assert.equal(g.towers.length,1);
  assert.equal(g.build('missing',3).ok,false);assert.equal(g.build('gun',-1).ok,false);
});
test('a relay connects remote towers and selling it immediately disconnects them',()=>{
  const g=new Game({starter:false});g.credits=1000;
  const remote=g.build('gun',8).tower;assert.equal(remote.connected,false);
  const relay=g.build('relay',4).tower;
  assert.equal(relay.connected,true);assert.equal(remote.powered,true);assert.equal(g.powerUsed,3);
  g.sell(relay.id);assert.equal(remote.connected,false);assert.equal(remote.powered,false);assert.equal(g.powerUsed,0);
});
test('capacity follows build priority and recovers after an upgrade or sale',()=>{
  const g=new Game({starter:false});g.credits=1000;g.capacity=5;
  const a=g.build('mortar',0).tower,b=g.build('gun',1).tower;
  assert.equal(a.powered,true);assert.equal(b.powered,false);assert.equal(g.powerUsed,5);
  assert.equal(g.upgradeGrid(),true);assert.equal(b.powered,true);assert.equal(g.powerUsed,8);
  g.sell(a.id);assert.equal(b.powered,true);assert.equal(g.powerUsed,3);
});
test('disconnected towers do not consume electricity or shoot',()=>{
  const g=new Game({starter:false});g.build('gun',9);g.startWave();advance(g,8);
  assert.equal(g.powerUsed,0);assert.equal(g.kills,0);assert.equal(g.projectiles.length,0);
});
test('upgrades are capped and selling cannot mint money',()=>{
  const g=new Game();g.credits=1000;const t=g.towers[0];assert.equal(sellValue(t),0);
  assert.equal(g.upgrade(t.id).ok,true);assert.equal(g.upgrade(t.id).ok,true);assert.equal(g.upgrade(t.id).ok,false);assert.equal(t.level,3);
  assert.equal(towerStats(t).power,5);assert.ok(sellValue(t)<t.invested);
  const before=g.credits,refund=sellValue(t);g.sell(t.id);assert.equal(g.credits,before+refund);assert.equal(g.sell(t.id),false);assert.equal(g.credits,before+refund);
});
test('pause freezes movement, wave spawning, projectiles and overdrive cooldown',()=>{
  const g=new Game();g.startWave();advance(g,3);g.activateOverdrive();g.paused=true;
  g.events.length=0;const before=JSON.stringify(g);advance(g,10);assert.equal(JSON.stringify(g),before);
});
test('double speed progresses the same simulation twice as far',()=>{
  const a=new Game(),b=new Game();a.startWave();b.startWave();b.speed=2;advance(a,2);advance(b,1);
  assert.ok(Math.abs(a.time-b.time)<.051);assert.equal(a.queue.length,b.queue.length);
});
test('leaking enemies damages the lighthouse and loss ends further edits',()=>{
  const g=new Game({starter:false});g.startWave();advance(g,100);assert.ok(g.hp<100);
  g.hp=1;g.phase='wave';g.spawn('boss');g.enemies.at(-1).distance=PATH_LENGTH-.001;advance(g,.1);
  assert.equal(g.phase,'lost');assert.equal(g.hp,0);assert.equal(g.startWave(),false);assert.equal(g.build('gun',1).ok,false);
});
test('one enemy kill awards currency exactly once and emits the correct event',()=>{
  const g=new Game();g.spawn('crawler');const e=g.enemies[0],before=g.credits;g.damageEnemy(e,10000);g.damageEnemy(e,10000);
  assert.equal(g.credits,before+8);assert.equal(g.kills,1);assert.equal(g.events.at(-1).type,'kill');
});
test('wave clearance rewards once and never automatically starts the next wave',()=>{
  const g=new Game();g.startWave();g.queue=[];const before=g.credits;g.tick(.05);
  assert.equal(g.phase,'build');assert.equal(g.wave,1);assert.equal(g.credits,before+40);assert.equal(g.capacity,13);
  advance(g,15);assert.equal(g.wave,1);assert.equal(g.credits,before+40);
});
test('final clearance wins and ignores further simulation ticks',()=>{
  const g=new Game();g.wave=9;g.startWave();g.queue=[];g.tick(.05);assert.equal(g.phase,'won');
  const before=JSON.stringify(g);g.tick(100);assert.equal(JSON.stringify(g),before);assert.equal(g.startWave(),false);
});
test('overdrive is bounded and cannot bypass its cooldown',()=>{
  const g=new Game();assert.equal(g.activateOverdrive(),false);g.startWave();assert.equal(g.activateOverdrive(),true);assert.equal(g.activateOverdrive(),false);
  advance(g,7);assert.equal(g.overdrive,0);assert.ok(g.overdriveCooldown>27&&g.overdriveCooldown<29);
});
test('all build pads stay off the road and have unique coordinates',()=>{
  const seen=new Set();for(const p of PADS){assert.ok(!seen.has(`${p.x},${p.y}`));seen.add(`${p.x},${p.y}`);
    for(let i=0;i<=PATH_LENGTH*10;i++){const a=pathPosition(i/10);assert.ok(Math.hypot(a.x-p.x,a.y-p.y)>.6);}
  }
});
