export const SOURCE = { x: 10, y: 5, radius: 3.5 };
export const PATH = [[0,4],[3,4],[3,8],[7,8],[7,3],[11,3],[11,5],[10,5]];
export const PADS = [
  [9,6],[8,4],[9,2],[6,4],[6,6],[8,8],[5,9],[4,6],[2,6],
  [2,3],[4,2],[6,2],[10,8],[3,9],[1,5],[9,9],[5,5],[11,7]
].map(([x,y],id)=>({x,y,id}));
export const TYPES = {
  gun: { name:'哨戒炮', en:'SENTINEL', cost:65, power:3, range:3.1, damage:18, cooldown:.62, color:'#eec77d', role:'精准 · 单体', description:'快速锁定前方敌人。稳定的单体火力，是防线的骨架。' },
  mortar: { name:'迫击炮', en:'MORTAR', cost:100, power:5, range:3.7, damage:36, cooldown:1.7, splash:1.15, color:'#ec9a76', role:'爆破 · 群体', description:'抛射炮弹，在落点造成范围伤害。适合拦截密集虫群。' },
  frost: { name:'寒潮塔', en:'FROST', cost:75, power:3, range:2.65, damage:5, cooldown:.75, slow:.48, color:'#8fcecd', role:'减速 · 控制', description:'减速范围内的目标，为附近的炮塔争取更多输出时间。' },
  arc: { name:'电弧塔', en:'ARC', cost:110, power:4, range:2.7, damage:20, cooldown:.9, chain:3, chainRange:1.6, falloff:.65, color:'#b4a6e8', role:'连锁 · 群体', description:'释放电弧，在相邻敌人之间跳跃。每次跳跃伤害递减，升级增加跳跃次数。' },
  relay: { name:'中继站', en:'RELAY', cost:30, power:0, range:0, damage:0, cooldown:0, color:'#b7cd84', role:'连接 · 扩张', description:'把电网延伸到更远的基座。连接距离 4.8 格，不占用电力。' }
};
export const ENEMIES = {
  crawler: {name:'潜行者', hp:36,speed:.8,reward:8,leak:8,color:'#b06561'},
  runner: {name:'疾行者', hp:25,speed:1.3,reward:9,leak:6,color:'#dbad72'},
  tank: {name:'重甲蟹', hp:155,speed:.52,reward:20,leak:18,color:'#a693b3'},
  splitter: {name:'裂殖体', hp:68,speed:.62,reward:10,leak:12,split:2,color:'#8fae78'},
  spawn: {name:'裂殖幼体', hp:15,speed:1.05,reward:2,leak:3,color:'#c3cf8e'},
  boss: {name:'深渊巨像', hp:2300,speed:.34,reward:100,leak:100,color:'#e09173'}
};
export const WAVES = [
  {name:'潮水初动', units:[['crawler',8]], interval:1.45},
  {name:'岸边的足迹', units:[['crawler',11],['runner',3]], interval:1.35},
  {name:'疾风过境', units:[['runner',12],['crawler',6]], interval:1.15},
  {name:'铁甲来客', units:[['crawler',12],['tank',3]], interval:1.2},
  {name:'涨潮时分', units:[['crawler',18],['runner',7],['splitter',3]], interval:.85},
  {name:'破浪重装', units:[['tank',7],['runner',12]], interval:1.2},
  {name:'漫长的夜', units:[['crawler',16],['tank',6],['splitter',4]], interval:.9},
  {name:'风暴前线', units:[['runner',24],['tank',6]], interval:.8},
  {name:'最后的防线', units:[['tank',12],['crawler',16],['splitter',4]], interval:.85},
  {name:'深渊巨像', units:[['crawler',14],['tank',8],['boss',1],['runner',12]], interval:.95}
];
// Normal keeps the original curve. Other difficulties scale enemy toughness, supplies and leak damage.
export const DIFFICULTIES = {
  easy: {credits:220, hp:.7, leak:.75},
  normal: {credits:180, hp:1, leak:1},
  hard: {credits:160, hp:1.3, leak:1.25}
};
export const TARGETING = ['first','strong','close'];
export const OVERDRIVE = {duration:6, cooldown:35, rate:1.8};
// The lighthouse focuses its lamp on one spot: a short charge, then damage scaled to the current wave and a brief dazzle.
export const STRIKE = {cooldown:45, delay:.8, radius:1.35, damage:110, stun:1.2, bossStun:.45};
export const ENDLESS = {growth:1.06, gridLevels:10};
const segments = PATH.slice(1).map((p,i)=>({a:PATH[i],b:p,len:Math.hypot(p[0]-PATH[i][0],p[1]-PATH[i][1])}));
export const PATH_LENGTH = segments.reduce((s,p)=>s+p.len,0);
export function pathPosition(distance) {
  for (const s of segments) {
    if(distance<=s.len) {const t=Math.max(0,distance)/s.len;return {x:s.a[0]+(s.b[0]-s.a[0])*t,y:s.a[1]+(s.b[1]-s.a[1])*t};}
    distance-=s.len;
  }
  return {x:PATH.at(-1)[0],y:PATH.at(-1)[1]};
}
export const dist = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const towerStats = t => {
  const c=TYPES[t.type], level=t.level-1;
  const stats={...c, damage:c.damage*(1+.6*level), range:c.range+.25*level, cooldown:c.cooldown/(1+.13*level),power:c.power+(t.type==='relay'?0:level)};
  if(c.chain)stats.chain=c.chain+level;
  return stats;
};
export const upgradeCost = t=>Math.round(TYPES[t.type].cost*(.7+.35*(t.level-1)));
export const sellValue = t=>Math.floor(t.invested*.7);
// Waves after the tenth exist only in the endless tide that can follow a victory.
export function waveDefinition(n) {
  if(n>=1&&n<=WAVES.length)return WAVES[n-1];
  const k=Math.max(1,n-WAVES.length),units=[['crawler',14+2*k],['runner',10+k],['splitter',3+k],['tank',6+Math.ceil(k/2)]];
  if(n%5===0)units.push(['boss',1+Math.floor(k/10)]);
  return {name:'endless',units,interval:Math.max(.5,.85-.015*k),endless:true};
}

export class Game {
  constructor({starter=true,difficulty='normal'}={}) {
    this.difficulty=Object.hasOwn(DIFFICULTIES,difficulty)?difficulty:'normal';
    this.hp=100; this.credits=DIFFICULTIES[this.difficulty].credits; this.capacity=12; this.gridLevel=0;
    this.wave=0; this.phase='build'; this.speed=1; this.paused=false; this.endless=false;
    this.towers=[]; this.enemies=[]; this.projectiles=[]; this.effects=[];this.events=[];this.strikes=[];
    this.time=0;this.kills=0;this.nextId=1;this.queue=[];this.spawnTimer=0;
    this.network=[];this.powerUsed=0;this.elapsed=0;this.lastReward=0;this.overdrive=0;this.overdriveCooldown=0;this.strikeCooldown=0;
    if(starter) this.towers.push({pad:0,x:PADS[0].x,y:PADS[0].y,id:this.nextId++,type:'gun',level:1,invested:0,cooldown:0,angle:0,target:'first'});
    this.recomputePower();
  }
  emit(type,data={}) {this.events.push({type,...data});}
  canEdit() {return this.phase==='build'||this.phase==='wave';}
  gridCost() {return 100+this.gridLevel*55;}
  waveDef(n=this.wave) {return waveDefinition(n);}
  // Wave toughness without difficulty: used for regular enemies and for the beacon strike.
  // Endless waves keep the tenth wave's toughness and grow it gently from there.
  endlessGrowth() {return this.wave>WAVES.length?ENDLESS.growth**(this.wave-WAVES.length):1;}
  pressure() {const progress=Math.max(0,Math.min(1,(Math.min(this.wave,WAVES.length)-1)/9));return 1+5*progress**1.5;}
  waveScale() {return (1+Math.max(0,Math.min(this.wave,WAVES.length)-1)*.17)*this.pressure()*this.endlessGrowth();}
  hpScale(type) {return (type==='boss'?this.pressure()*this.endlessGrowth():this.waveScale())*DIFFICULTIES[this.difficulty].hp;}
  maxGridLevel() {return this.endless?ENDLESS.gridLevels:4;}
  strikeDamage() {return STRIKE.damage*this.waveScale();}
  recomputePower() {
    this.network=[];this.powerUsed=0;
    for(const t of this.towers) {t.connected=false;t.powered=false;}
    const visited=[{...SOURCE,id:0,type:'source'}];
    let changed=true;
    while(changed) {
      changed=false;
      for(const t of this.towers) {
        if(t.connected)continue;
        const parent=visited.find(p=>dist(p,t)<=Math.max(p.type==='relay'?4.8:p.type==='source'?SOURCE.radius:3,t.type==='relay'?4.8:3));
        if(parent) {t.connected=true;this.network.push({from:parent,to:t});visited.push(t);changed=true;}
      }
    }
    // Construction order sets priority. Disconnected towers never reserve capacity.
    for(const t of this.towers) {
      const cost=towerStats(t).power;
      if(t.connected&&this.powerUsed+cost<=this.capacity) {t.powered=true;this.powerUsed+=cost;}
    }
  }
  build(type,padId) {
    if(!this.canEdit())return {ok:false,code:'error.ended',reason:'本局已经结束，请重新出发。'};
    if(!Object.hasOwn(TYPES,type)||!PADS[padId])return {ok:false,code:'error.invalidBuild',reason:'请选择有效的防御设施和基座。'};
    if(this.towers.some(t=>t.pad===padId))return {ok:false,code:'error.occupied',reason:'这个基座已经有设施了。'};
    if(this.credits<TYPES[type].cost)return {ok:false,code:'error.parts',reason:'零件不足，击退敌人可以获得更多。'};
    const {x,y}=PADS[padId];
    const t={id:this.nextId++,pad:padId,x,y,type,level:1,invested:TYPES[type].cost,cooldown:.1,angle:-Math.PI/2,target:'first'};
    this.credits-=t.invested;this.towers.push(t);this.recomputePower();this.emit('build',{tower:t});
    return {ok:true,tower:t};
  }
  upgrade(id) {
    const t=this.towers.find(t=>t.id===id);
    if(!this.canEdit()||!t||t.level>=3||t.type==='relay')return {ok:false,code:'error.maxUpgrade',reason:'这座设施无法继续升级。'};
    const cost=upgradeCost(t);
    if(this.credits<cost)return {ok:false,code:'error.upgradeParts',reason:'升级需要更多零件。'};
    this.credits-=cost;t.invested+=cost;t.level++;this.recomputePower();this.emit('upgrade',{tower:t});return {ok:true};
  }
  sell(id) {
    if(!this.canEdit())return false;
    const t=this.towers.find(t=>t.id===id);if(!t)return false;
    this.credits+=sellValue(t);this.towers=this.towers.filter(t=>t.id!==id);this.recomputePower();this.emit('sell',{tower:t});return true;
  }
  setTargeting(id,mode) {
    const t=this.towers.find(t=>t.id===id);
    if(!this.canEdit()||!t||t.type==='relay'||!TARGETING.includes(mode))return false;
    t.target=mode;this.emit('target',{tower:t});return true;
  }
  cycleTargeting(id) {
    const t=this.towers.find(t=>t.id===id);
    return !!t&&this.setTargeting(id,TARGETING[(TARGETING.indexOf(t.target)+1)%TARGETING.length]);
  }
  upgradeGrid() {
    const cost=this.gridCost();if(!this.canEdit()||this.credits<cost||this.gridLevel>=this.maxGridLevel())return false;
    this.credits-=cost;this.gridLevel++;this.capacity+=6;this.recomputePower();this.emit('grid');return true;
  }
  activateOverdrive() {
    if(this.phase!=='wave'||this.paused||this.overdriveCooldown>0)return false;
    this.overdrive=OVERDRIVE.duration;this.overdriveCooldown=OVERDRIVE.cooldown;this.emit('overdrive');return true;
  }
  activateStrike(x,y) {
    if(this.phase!=='wave'||this.paused||this.strikeCooldown>0||!Number.isFinite(x)||!Number.isFinite(y))return false;
    x=Math.max(-.5,Math.min(13.5,x));y=Math.max(-.5,Math.min(11.5,y));
    this.strikes.push({x,y,delay:STRIKE.delay});this.strikeCooldown=STRIKE.cooldown;this.emit('strike',{x,y});return true;
  }
  continueEndless() {
    if(this.phase!=='won'||this.endless)return false;
    this.endless=true;this.clearWave();this.emit('endless');return true;
  }
  startWave() {
    if(this.phase!=='build'||(!this.endless&&this.wave>=WAVES.length))return false;
    this.wave++;this.phase='wave';this.paused=false;
    const def=this.waveDef();this.queue=[];
    // Interleave enemy types so mixed waves apply pressure throughout the road.
    const groups=def.units.map(([type,n])=>Array(n).fill(type));
    while(groups.some(g=>g.length))for(const g of groups)if(g.length)this.queue.push(g.shift());
    const bosses=this.queue.filter(t=>t==='boss').length;
    if(bosses) {this.queue=this.queue.filter(t=>t!=='boss');for(let i=0;i<bosses;i++)this.queue.splice(Math.min(this.queue.length,16+i*8),0,'boss');}
    this.spawnTimer=.6;this.emit('wave',{wave:this.wave,name:def.name});return true;
  }
  spawn(type,distance=0) {
    const def=ENEMIES[type],scale=this.hpScale(type);
    const e={...def,type,id:this.nextId++,maxHp:def.hp*scale,hp:def.hp*scale,distance,slow:0,hit:0,stun:0,...pathPosition(distance)};
    this.enemies.push(e);
    if(type==='boss')this.emit('boss');
    return e;
  }
  damageEnemy(e,damage,slow=0) {
    if(e.hp<=0)return false;
    e.hp-=damage;e.hit=.12;if(slow)e.slow=1.65;
    if(e.hp>0)return false;
    this.credits+=e.reward;this.kills++;this.emit('kill',{x:e.x,y:e.y,color:e.color,enemyType:e.type,id:e.id,reward:e.reward});
    // A splitter breaks into smaller, faster spawnlings just behind where it fell.
    if(e.split) {
      for(let i=0;i<e.split;i++)this.spawn('spawn',Math.max(0,e.distance-.22*i)).hit=.2;
      this.emit('split',{x:e.x,y:e.y,count:e.split});
    }
    return true;
  }
  pickTarget(t,range) {
    let best=null,score=-Infinity;
    for(const e of this.enemies) {
      if(e.hp<=0)continue;
      const d=dist(t,e);if(d>range)continue;
      const s=t.target==='strong'?e.hp:t.target==='close'?-d:e.distance;
      if(s>score||(s===score&&e.distance>best.distance)){best=e;score=s;}
    }
    return best;
  }
  chainTargets(first,stats) {
    const chain=[first];
    while(chain.length<stats.chain) {
      const last=chain.at(-1);let next=null,closest=Infinity;
      for(const e of this.enemies){if(e.hp<=0||chain.includes(e))continue;const d=dist(last,e);if(d<=stats.chainRange&&d<closest){closest=d;next=e;}}
      if(!next)break;chain.push(next);
    }
    return chain;
  }
  clearWave() {
    this.phase='build';this.lastReward=35+this.wave*5;this.credits+=this.lastReward;this.hp=Math.min(100,this.hp+5);this.capacity+=1;this.recomputePower();this.emit('clear',{reward:this.lastReward});
  }
  tick(rawDt) {
    if(this.paused||!this.canEdit()||!Number.isFinite(rawDt)||rawDt<=0)return;
    const dt=Math.min(rawDt,.05)*this.speed;this.time+=dt;
    this.overdrive=Math.max(0,this.overdrive-dt);this.overdriveCooldown=Math.max(0,this.overdriveCooldown-dt);this.strikeCooldown=Math.max(0,this.strikeCooldown-dt);
    this.effects=this.effects.filter(e=>(e.life-=dt)>0);
    if(this.phase!=='wave')return;
    this.elapsed+=dt;
    this.spawnTimer-=dt;
    while(this.queue.length&&this.spawnTimer<=0){this.spawn(this.queue.shift());this.spawnTimer+=this.waveDef().interval;}
    const leakScale=DIFFICULTIES[this.difficulty].leak;
    for(const e of this.enemies) {
      if(e.hp<=0)continue;
      e.slow=Math.max(0,e.slow-dt);e.hit=Math.max(0,e.hit-dt);
      if(e.stun>0){e.stun=Math.max(0,e.stun-dt);continue;}
      e.distance+=e.speed*(e.slow>0?.48:1)*dt;
      Object.assign(e,pathPosition(e.distance));
      if(e.distance>=PATH_LENGTH) {
        const amount=Math.round(e.leak*leakScale);
        e.hp=0;e.escaped=true;this.hp=Math.max(0,this.hp-amount);this.emit('leak',{amount,x:e.x,y:e.y,enemyType:e.type});
      }
    }
    if(this.hp<=0) {this.phase='lost';this.emit('lost');return;}
    for(const s of this.strikes) {
      if((s.delay-=dt)>0)continue;
      const damage=this.strikeDamage(),hits=this.enemies.filter(e=>e.hp>0&&Math.hypot(e.x-s.x,e.y-s.y)<=STRIKE.radius);
      for(const e of hits){e.stun=Math.max(e.stun,e.type==='boss'?STRIKE.bossStun:STRIKE.stun);this.damageEnemy(e,damage);}
      this.effects.push({kind:'strike',x:s.x,y:s.y,life:.6,total:.6});this.emit('strikeHit',{x:s.x,y:s.y,hits:hits.length});
    }
    this.strikes=this.strikes.filter(s=>s.delay>0);
    for(const t of this.towers) {
      if(!t.powered||t.type==='relay')continue;
      const stats=towerStats(t);t.cooldown-=dt*(this.overdrive>0?OVERDRIVE.rate:1);
      const e=this.pickTarget(t,stats.range);
      if(e) {
        t.angle=Math.atan2(e.y-t.y,e.x-t.x);
        if(t.cooldown<=0) {
          t.cooldown=stats.cooldown;
          const p={x:t.x,y:t.y,fromX:t.x,fromY:t.y,toX:e.x,toY:e.y,target:e.id,tower:t.id,kind:t.type,damage:stats.damage,splash:stats.splash,slow:stats.slow,age:0,duration:t.type==='mortar'?.65:.15};
          if(t.type==='arc') {const chain=this.chainTargets(e,stats);Object.assign(p,{chain:chain.map(c=>c.id),points:chain.map(c=>({x:c.x,y:c.y})),falloff:stats.falloff,duration:.12});}
          this.projectiles.push(p);
          this.emit('shoot',{kind:t.type,x:t.x,y:t.y,tower:t.id,toX:e.x,toY:e.y,points:p.points});
        }
      }else t.cooldown=Math.max(t.cooldown,0);
    }
    for(const p of this.projectiles) {
      p.age+=dt;
      if(p.age<p.duration)continue;
      if(p.kind==='mortar') {
        const hits=this.enemies.filter(e=>e.hp>0&&Math.hypot(e.x-p.toX,e.y-p.toY)<=p.splash);
        for(const e of hits)this.damageEnemy(e,p.damage);
        this.effects.push({kind:'blast',x:p.toX,y:p.toY,life:.45,total:.45});this.emit('blast',{x:p.toX,y:p.toY,hits:hits.length});
      } else if(p.kind==='arc') {
        let damage=p.damage;
        for(const id of p.chain) {
          const e=this.enemies.find(e=>e.id===id&&e.hp>0);
          if(e){this.emit('hit',{kind:'arc',x:e.x,y:e.y,id:e.id});this.damageEnemy(e,damage);}
          damage*=p.falloff;
        }
      } else {
        const e=this.enemies.find(e=>e.id===p.target&&e.hp>0);
        if(e){this.emit('hit',{kind:p.kind,x:e.x,y:e.y,id:e.id});this.damageEnemy(e,p.damage,p.slow);}
      }
    }
    this.projectiles=this.projectiles.filter(p=>p.age<p.duration);
    this.enemies=this.enemies.filter(e=>e.hp>0);
    if(!this.queue.length&&!this.enemies.length) {
      this.projectiles=[];this.overdrive=0;this.strikes=[];
      if(!this.endless&&this.wave===WAVES.length) {this.phase='won';this.emit('won');}
      else this.clearWave();
    }
  }
}
