import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,PADS,PATH,PATH_LENGTH,pathPosition,towerStats,sellValue,waveDefinition,STRIKE,WAVES} from '../src/game.js';

function advance(g,seconds){for(let t=0;t<seconds;t+=.05){g.tick(.05);g.events.length=0;}}
function collect(g,seconds){const events=[];for(let t=0;t<seconds;t+=.05){g.tick(.05);events.push(...g.events);g.events.length=0;}return events;}
// Put an enemy at a fixed road distance. A long stun keeps it there while towers act.
function place(g,type,distance,hold=true){const e=g.spawn(type,distance);if(hold)e.stun=100;return e;}
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
test('pause freezes movement, wave spawning, projectiles, strikes and ability cooldowns',()=>{
  const g=new Game();g.startWave();advance(g,3);g.activateOverdrive();assert.equal(g.activateStrike(2,4),true);g.paused=true;
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
test('an arc tower chains through nearby enemies with falloff and stops at its jump limit',()=>{
  const g=new Game({starter:false});g.credits=1000;const arc=g.build('arc',1).tower;
  g.startWave();g.queue=[];
  const lead=place(g,'tank',16.5),second=place(g,'tank',15.2),third=place(g,'tank',13.8),fourth=place(g,'tank',12.9);
  const events=collect(g,.3),full=lead.maxHp,damage=towerStats(arc).damage;
  assert.equal(full-lead.hp,damage);
  assert.ok(Math.abs(full-second.hp-damage*.65)<1e-9);assert.ok(Math.abs(full-third.hp-damage*.65**2)<1e-9);
  assert.equal(fourth.hp,full,'level one arcs reach three targets');
  assert.deepEqual(events.find(e=>e.type==='shoot').points.length,3);
  assert.equal(events.filter(e=>e.type==='hit'&&e.kind==='arc').length,3);
  g.credits=1000;g.upgrade(arc.id);assert.equal(towerStats(arc).chain,4);
});
test('targeting modes choose the leading, toughest or closest enemy',()=>{
  const g=new Game({starter:false});g.credits=1000;
  const gun=g.build('gun',1).tower,relay=g.build('relay',3).tower,range=towerStats(gun).range;
  g.startWave();g.queue=[];
  const lead=place(g,'crawler',16.5),tough=place(g,'tank',13.5),close=place(g,'crawler',15.1);
  assert.equal(gun.target,'first');assert.equal(g.pickTarget(gun,range),lead);
  assert.equal(g.setTargeting(gun.id,'strong'),true);assert.equal(g.pickTarget(gun,range),tough);
  assert.equal(g.setTargeting(gun.id,'close'),true);assert.equal(g.pickTarget(gun,range),close);
  assert.equal(g.cycleTargeting(gun.id),true);assert.equal(gun.target,'first');
  assert.equal(g.setTargeting(gun.id,'random'),false);assert.equal(g.setTargeting(relay.id,'strong'),false);
  g.phase='lost';assert.equal(g.setTargeting(gun.id,'strong'),false);assert.equal(gun.target,'first');
});
test('splitters break into rewarded spawnlings when destroyed, but not when they leak',()=>{
  const g=new Game({starter:false});g.startWave();g.queue=[];
  const splitter=place(g,'splitter',5),before=g.credits;
  assert.equal(g.damageEnemy(splitter,1e6),true);
  const spawn=g.enemies.filter(e=>e.type==='spawn');
  assert.equal(spawn.length,2);assert.ok(spawn.every(e=>e.distance<=5&&e.distance>4.5&&e.hp===e.maxHp));
  assert.equal(g.credits,before+10);assert.equal(g.kills,1);assert.equal(g.events.at(-1).type,'split');
  for(const e of spawn)g.damageEnemy(e,1e6);
  assert.equal(g.credits,before+14);assert.equal(g.kills,3);
  const leak=new Game({starter:false});leak.startWave();leak.queue=[];
  place(leak,'splitter',PATH_LENGTH-.001,false);const events=collect(leak,.1);
  assert.equal(events.find(e=>e.type==='leak').amount,12);assert.equal(events.some(e=>e.type==='split'),false);
  assert.equal(leak.enemies.length,0);assert.equal(leak.kills,0);
});
test('beacon strike charges, damages and dazzles enemies in range, and respects its cooldown',()=>{
  const g=new Game({starter:false});
  assert.equal(g.activateStrike(5,8),false,'strike is only available during a wave');
  g.startWave();g.queue=[];
  const near=place(g,'tank',9,false),far=place(g,'tank',2,false);
  assert.equal(g.activateStrike(5,8),true);assert.equal(g.activateStrike(5,8),false);assert.equal(g.activateStrike(NaN,1),false);
  advance(g,STRIKE.delay-.2);assert.equal(near.hp,near.maxHp,'no damage while the lamp charges');
  const events=collect(g,.3);
  assert.ok(Math.abs(near.maxHp-near.hp-g.strikeDamage())<1e-9);assert.equal(far.hp,far.maxHp);
  assert.ok(events.some(e=>e.type==='strikeHit'&&e.hits===1));
  const held=near.distance;advance(g,.5);assert.equal(near.distance,held,'dazzled enemies stop');
  advance(g,1.5);assert.ok(near.distance>held,'the dazzle wears off');
  assert.ok(g.strikeCooldown>STRIKE.cooldown-4&&g.strikeCooldown<STRIKE.cooldown);
});
test('strike damage and enemy toughness follow the same wave scale',()=>{
  const g=new Game();g.wave=10;
  assert.ok(Math.abs(g.strikeDamage()-STRIKE.damage*g.waveScale())<1e-9);
  assert.ok(Math.abs(g.hpScale('crawler')-g.waveScale())<1e-9);
  assert.ok(g.hpScale('boss')<g.hpScale('crawler'));
});
test('endless tide continues only after victory, with generated waves and a higher grid ceiling',()=>{
  const g=new Game();assert.equal(g.continueEndless(),false);
  g.wave=9;g.startWave();g.queue=[];g.tick(.05);assert.equal(g.phase,'won');
  const credits=g.credits,capacity=g.capacity;
  assert.equal(g.continueEndless(),true);assert.equal(g.phase,'build');assert.equal(g.endless,true);
  assert.equal(g.credits,credits+85);assert.equal(g.capacity,capacity+1);assert.equal(g.continueEndless(),false);
  const tenth=g.hpScale('crawler');
  assert.equal(g.startWave(),true);assert.equal(g.wave,11);assert.ok(g.queue.length>WAVES[9].units.reduce((s,u)=>s+u[1],0)-1);
  assert.ok(g.hpScale('crawler')>tenth);
  assert.ok(waveDefinition(15).units.some(([type])=>type==='boss'));assert.ok(!waveDefinition(11).units.some(([type])=>type==='boss'));
  assert.equal(waveDefinition(3),WAVES[2]);
  g.credits=1e6;for(let i=0;i<5;i++)assert.equal(g.upgradeGrid(),true);
  const campaign=new Game();campaign.credits=1e6;for(let i=0;i<4;i++)campaign.upgradeGrid();assert.equal(campaign.upgradeGrid(),false);
});
test('difficulty changes supplies, enemy toughness and leak damage; unknown values fall back to normal',()=>{
  const games={easy:new Game({difficulty:'easy'}),normal:new Game(),hard:new Game({difficulty:'hard'})};
  assert.deepEqual(Object.values(games).map(g=>g.credits),[220,180,160]);
  assert.equal(new Game({difficulty:'nightmare'}).difficulty,'normal');
  const hp=Object.values(games).map(g=>{g.startWave();g.queue=[];return g.spawn('crawler').maxHp;});
  assert.ok(hp[0]<hp[1]&&hp[1]<hp[2]);assert.equal(hp[1],36);
  const leaks=Object.values(games).map(g=>{g.enemies=[];place(g,'boss',PATH_LENGTH-.001,false);return collect(g,.1).find(e=>e.type==='leak').amount;});
  assert.deepEqual(leaks,[75,100,125]);
  assert.notEqual(games.easy.phase,'lost','a colossus leak is survivable only on easy');
  assert.equal(games.normal.phase,'lost');assert.equal(games.hard.phase,'lost');
  const crawler=Object.values(games).map(g=>{const e=new Game({difficulty:g.difficulty});e.startWave();e.queue=['crawler'];place(e,'crawler',PATH_LENGTH-.001,false);return collect(e,.1).find(x=>x.type==='leak').amount;});
  assert.deepEqual(crawler,[6,8,10]);
});
test('combat events carry map positions for visual effects',()=>{
  const g=new Game({starter:false});g.credits=1000;g.build('mortar',3);g.build('gun',1);g.startWave();g.queue=[];
  for(const distance of [16.5,16,15.5])place(g,'tank',distance);
  const events=collect(g,15);
  for(const type of ['shoot','hit','blast','kill']){
    const event=events.find(e=>e.type===type);
    assert.ok(event,`missing ${type}`);assert.ok(Number.isFinite(event.x)&&Number.isFinite(event.y),type);
  }
  assert.deepEqual(events.filter(e=>e.type==='kill').map(e=>[e.enemyType,e.reward]),[['tank',20],['tank',20],['tank',20]]);
});
