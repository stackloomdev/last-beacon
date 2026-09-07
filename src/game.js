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
  relay: { name:'中继站', en:'RELAY', cost:30, power:0, range:0, damage:0, cooldown:0, color:'#b7cd84', role:'连接 · 扩张', description:'把电网延伸到更远的基座。连接距离 4.8 格，不占用电力。' }
};
export const ENEMIES = {
  crawler: {name:'潜行者', hp:36,speed:.8,reward:8,leak:8,color:'#b06561'},
  runner: {name:'疾行者', hp:25,speed:1.3,reward:9,leak:6,color:'#dbad72'},
  tank: {name:'重甲蟹', hp:155,speed:.52,reward:20,leak:18,color:'#a693b3'},
  boss: {name:'深渊巨像', hp:2300,speed:.34,reward:100,leak:100,color:'#e09173'}
};
export const WAVES = [
  {name:'潮水初动', units:[['crawler',8]], interval:1.45},
  {name:'岸边的足迹', units:[['crawler',11],['runner',3]], interval:1.35},
  {name:'疾风过境', units:[['runner',12],['crawler',6]], interval:1.15},
  {name:'铁甲来客', units:[['crawler',12],['tank',3]], interval:1.2},
  {name:'涨潮时分', units:[['crawler',22],['runner',8]], interval:.85},
  {name:'破浪重装', units:[['tank',7],['runner',12]], interval:1.2},
  {name:'漫长的夜', units:[['crawler',20],['tank',6]], interval:.9},
  {name:'风暴前线', units:[['runner',24],['tank',6]], interval:.8},
  {name:'最后的防线', units:[['tank',12],['crawler',20]], interval:.85},
  {name:'深渊巨像', units:[['crawler',14],['tank',8],['boss',1],['runner',12]], interval:.95}
];
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
  return {...c, damage:c.damage*(1+.6*level), range:c.range+.25*level, cooldown:c.cooldown/(1+.13*level),power:c.power+(t.type==='relay'?0:level)};
};
export const upgradeCost = t=>Math.round(TYPES[t.type].cost*(.7+.35*(t.level-1)));
export const sellValue = t=>Math.floor(t.invested*.7);

export class Game {
  constructor({starter=true}={}) {
    this.hp=100; this.credits=180; this.capacity=12; this.gridLevel=0;
    this.wave=0; this.phase='build'; this.speed=1; this.paused=false;
    this.towers=[]; this.enemies=[]; this.projectiles=[]; this.effects=[];this.events=[];
    this.time=0;this.kills=0;this.nextId=1;this.queue=[];this.spawnTimer=0;
    this.network=[];this.powerUsed=0;this.elapsed=0;this.lastReward=0;this.overdrive=0;this.overdriveCooldown=0;
    if(starter) this.towers.push({pad:0,x:PADS[0].x,y:PADS[0].y,id:this.nextId++,type:'gun',level:1,invested:0,cooldown:0,angle:0});
    this.recomputePower();
  }
  emit(type,data={}) {this.events.push({type,...data});}
  canEdit() {return this.phase==='build'||this.phase==='wave';}
  gridCost() {return 100+this.gridLevel*55;}
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
    const t={id:this.nextId++,pad:padId,x,y,type,level:1,invested:TYPES[type].cost,cooldown:.1,angle:-Math.PI/2};
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
    this.credits+=sellValue(t);this.towers=this.towers.filter(t=>t.id!==id);this.recomputePower();this.emit('sell');return true;
  }
  upgradeGrid() {
    const cost=this.gridCost();if(!this.canEdit()||this.credits<cost||this.gridLevel>=4)return false;
    this.credits-=cost;this.gridLevel++;this.capacity+=6;this.recomputePower();this.emit('grid');return true;
  }
  activateOverdrive() {
    if(this.phase!=='wave'||this.paused||this.overdriveCooldown>0)return false;
    this.overdrive=6;this.overdriveCooldown=35;this.emit('overdrive');return true;
  }
  startWave() {
    if(this.phase!=='build'||this.wave>=WAVES.length)return false;
    this.wave++;this.phase='wave';this.paused=false;
    const def=WAVES[this.wave-1];this.queue=[];
    // Interleave enemy types so mixed waves apply pressure throughout the road.
    const groups=def.units.map(([type,n])=>Array(n).fill(type));
    while(groups.some(g=>g.length))for(const g of groups)if(g.length)this.queue.push(g.shift());
    if(this.wave===10) {this.queue=this.queue.filter(t=>t!=='boss');this.queue.splice(16,0,'boss');}
    this.spawnTimer=.6;this.emit('wave',{wave:this.wave,name:def.name});return true;
  }
  spawn(type) {
    const def=ENEMIES[type],progress=Math.max(0,Math.min(1,(this.wave-1)/9)),pressure=1+5*progress**1.5;
    const scale=(type==='boss'?1:1+Math.max(0,this.wave-1)*.17)*pressure;
    const e={...def,type,id:this.nextId++,maxHp:def.hp*scale,hp:def.hp*scale,distance:0,slow:0,hit:0,...pathPosition(0)};
    this.enemies.push(e);
    if(type==='boss')this.emit('boss');
  }
  damageEnemy(e,damage,slow=0) {
    if(e.hp<=0)return;
    e.hp-=damage;e.hit=.12;if(slow)e.slow=1.65;
    if(e.hp<=0) {this.credits+=e.reward;this.kills++;this.emit('kill',{x:e.x,y:e.y,color:e.color,enemyType:e.type});}
  }
  tick(rawDt) {
    if(this.paused||!this.canEdit()||!Number.isFinite(rawDt)||rawDt<=0)return;
    const dt=Math.min(rawDt,.05)*this.speed;this.time+=dt;
    this.overdrive=Math.max(0,this.overdrive-dt);this.overdriveCooldown=Math.max(0,this.overdriveCooldown-dt);
    this.effects=this.effects.filter(e=>(e.life-=dt)>0);
    if(this.phase!=='wave')return;
    this.elapsed+=dt;
    this.spawnTimer-=dt;
    while(this.queue.length&&this.spawnTimer<=0){this.spawn(this.queue.shift());this.spawnTimer+=WAVES[this.wave-1].interval;}
    for(const e of this.enemies) {
      if(e.hp<=0)continue;
      e.slow=Math.max(0,e.slow-dt);e.hit=Math.max(0,e.hit-dt);
      e.distance+=e.speed*(e.slow>0?.48:1)*dt;
      Object.assign(e,pathPosition(e.distance));
      if(e.distance>=PATH_LENGTH) {e.hp=0;e.escaped=true;this.hp=Math.max(0,this.hp-e.leak);this.emit('leak',{amount:e.leak});}
    }
    if(this.hp<=0) {this.phase='lost';this.emit('lost');return;}
    for(const t of this.towers) {
      if(!t.powered||t.type==='relay')continue;
      const stats=towerStats(t);t.cooldown-=dt*(this.overdrive>0?1.8:1);
      const targets=this.enemies.filter(e=>e.hp>0&&dist(t,e)<=stats.range).sort((a,b)=>b.distance-a.distance);
      if(targets.length) {
        const e=targets[0];t.angle=Math.atan2(e.y-t.y,e.x-t.x);
        if(t.cooldown<=0) {
          t.cooldown=stats.cooldown;
          this.projectiles.push({x:t.x,y:t.y,fromX:t.x,fromY:t.y,toX:e.x,toY:e.y,target:e.id,kind:t.type,damage:stats.damage,splash:stats.splash,slow:stats.slow,age:0,duration:t.type==='mortar'?.65:.15});
          this.emit('shoot',{kind:t.type,x:t.x,y:t.y});
        }
      }else t.cooldown=Math.max(t.cooldown,0);
    }
    for(const p of this.projectiles) {
      p.age+=dt;
      if(p.age<p.duration)continue;
      if(p.kind==='mortar') {
        for(const e of this.enemies)if(e.hp>0&&Math.hypot(e.x-p.toX,e.y-p.toY)<=p.splash)this.damageEnemy(e,p.damage);
        this.effects.push({kind:'blast',x:p.toX,y:p.toY,life:.45,total:.45});this.emit('blast');
      } else {
        const e=this.enemies.find(e=>e.id===p.target&&e.hp>0);
        if(e)this.damageEnemy(e,p.damage,p.slow);
      }
    }
    this.projectiles=this.projectiles.filter(p=>p.age<p.duration);
    this.enemies=this.enemies.filter(e=>e.hp>0);
    if(!this.queue.length&&!this.enemies.length) {
      this.projectiles=[];this.overdrive=0;
      if(this.wave===WAVES.length) {this.phase='won';this.emit('won');}
      else {this.phase='build';this.lastReward=35+this.wave*5;this.credits+=this.lastReward;this.hp=Math.min(100,this.hp+5);this.capacity+=1;this.recomputePower();this.emit('clear',{reward:this.lastReward});}
    }
  }
}
