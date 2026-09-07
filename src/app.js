import {Game,PADS,TYPES,ENEMIES,WAVES,towerStats,upgradeCost,sellValue} from './game.js';
import {Renderer,drawTowerIcon} from './render.js';
import {AudioEngine} from './audio.js';
import {getLanguage,setLanguage,preferredLanguage,saveLanguage,t,towerName} from './i18n.js';

let languageStorage;
try { languageStorage=localStorage; } catch {}
setLanguage(preferredLanguage(languageStorage,navigator.languages?.length?navigator.languages:[navigator.language]));

const $=id=>document.getElementById(id);
const canvas=$('battlefield'),audio=new AudioEngine();
let game=new Game(),renderer=new Renderer(canvas,game),buildType=null,selectedPad=null,hoverPad=null;
let previous=performance.now(),lastHud=0,lastSelection='',toastTimer,bannerTimer,best={wave:0,won:false},pauseBeforeDialog=false;
try{const stored=JSON.parse(localStorage.getItem('last-beacon-best')||'null');if(stored&&Number.isInteger(stored.wave)&&stored.wave>=0&&stored.wave<=10)best={wave:stored.wave,won:stored.won===true};}catch{}
const cards=[...document.querySelectorAll('.build-card')];
for(const icon of document.querySelectorAll('[data-icon]'))drawTowerIcon(icon,icon.dataset.icon);

let activeToast=null,activeBanner=null;
function paintToast(){
  if(activeToast)$('toast').textContent=t(activeToast.key,typeof activeToast.params==='function'?activeToast.params():activeToast.params);
}
function toast(key,params={}){
  activeToast={key,params};paintToast();$('toast').classList.add('visible');clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{activeToast=null;$('toast').classList.remove('visible');$('toast').textContent='';},3300);
}
function paintBanner(){
  if(activeBanner)$('wave-banner').innerHTML=`<small>${t(activeBanner.kicker,activeBanner.params)}</small><strong>${t(activeBanner.title,activeBanner.params)}</strong>`;
}
function banner(title,kicker,params={}){
  activeBanner={title,kicker,params};paintBanner();$('wave-banner').classList.add('show');clearTimeout(bannerTimer);
  bannerTimer=setTimeout(()=>{activeBanner=null;$('wave-banner').classList.remove('show');$('wave-banner').textContent='';},2900);
}
function updateSoundButton(){
  const label=t(audio.enabled?'control.soundOff':'control.soundOn');
  $('sound').querySelector('.mute-slash').hidden=audio.enabled;
  $('sound').setAttribute('aria-label',label);$('sound').title=label+' [M]';
}
function applyLanguage(){
  document.documentElement.lang=getLanguage()==='zh'?'zh-CN':'en';
  for(const element of document.querySelectorAll('[data-i18n]'))element.innerHTML=t(element.dataset.i18n);
  for(const [attribute,key] of [['aria-label','i18nAria'],['title','i18nTitle'],['content','i18nContent']]){
    const selector={'i18nAria':'data-i18n-aria','i18nTitle':'data-i18n-title','i18nContent':'data-i18n-content'}[key];
    for(const element of document.querySelectorAll(`[${selector}]`))element.setAttribute(attribute,t(element.dataset[key]));
  }
  $('language-toggle').dataset.language=getLanguage();
  $('language-toggle').setAttribute('aria-label',t('language.switch'));
  $('language-toggle').title=t('language.switch');
  updateSoundButton();lastSelection='';updateHud();paintToast();paintBanner();
  if(['won','lost'].includes(game.phase))renderResult();
}
$('language-toggle').addEventListener('click',()=>{
  setLanguage(getLanguage()==='zh'?'en':'zh');saveLanguage(languageStorage);applyLanguage();
});
function persistBest(){
  best.wave=Math.max(best.wave,game.wave);best.won=best.won||game.phase==='won';
  try{localStorage.setItem('last-beacon-best',JSON.stringify(best));}catch{}
}
function reset(){
  pauseBeforeDialog=false;
  for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
  game=new Game();renderer.game=game;renderer.particles=[];renderer.shake=0;buildType=null;selectedPad=null;hoverPad=null;lastSelection='';
  renderer.hover=null;renderer.selected=null;renderer.buildType=null;
  clearTimeout(toastTimer);clearTimeout(bannerTimer);$('toast').classList.remove('visible');$('wave-banner').classList.remove('show');
  activeToast=null;activeBanner=null;$('toast').textContent='';$('wave-banner').textContent='';
  $('speed').textContent='1×';$('paused-label').hidden=true;updateHud();toast('toast.reset');
}
function selectType(type){
  if(!game.canEdit()){toast('toast.ended');return;}
  buildType=buildType===type?null:type;selectedPad=null;renderer.buildType=buildType;renderer.selected=null;lastSelection='';updateHud();
}
function activatePad(id){
  const occupied=game.towers.find(t=>t.pad===id);
  if(occupied){selectedPad=id;buildType=null;renderer.buildType=null;renderer.selected=id;lastSelection='';updateHud();return;}
  if(!buildType){selectedPad=id;renderer.selected=id;toast('toast.choose');updateHud();return;}
  const result=game.build(buildType,id);
  if(!result.ok){toast(result.code);return;}
  selectedPad=id;buildType=null;renderer.buildType=null;renderer.selected=id;lastSelection='';
  if(!result.tower.connected)toast('toast.disconnected');
  else if(!result.tower.powered)toast('toast.overload');
  else toast('toast.connected',()=>({name:towerName(result.tower.type)}));
  updateHud();
}
const padButtons=PADS.map(p=>{
  const button=document.createElement('button');button.className='pad-control';button.dataset.pad=p.id;button.title=t('pad.title',{number:String(p.id+1).padStart(2,'0')});
  button.addEventListener('click',()=>activatePad(p.id));
  const focus=()=>{hoverPad=p.id;renderer.hover=p.id;};
  button.addEventListener('pointerenter',focus);button.addEventListener('focus',focus);
  button.addEventListener('pointerleave',()=>{hoverPad=null;renderer.hover=null;});
  button.addEventListener('blur',()=>{hoverPad=null;renderer.hover=null;});
  $('pad-controls').append(button);return button;
});
function positionPads(){PADS.forEach((pad,i)=>{const p=renderer.p(pad.x,pad.y,.32);padButtons[i].style.left=p.x+'px';padButtons[i].style.top=p.y+'px';});}
canvas.addEventListener('mapresize',positionPads);positionPads();
canvas.addEventListener('pointermove',event=>{const r=canvas.getBoundingClientRect(),pad=renderer.hitPad(event.clientX-r.left,event.clientY-r.top);hoverPad=pad?.id??null;renderer.hover=hoverPad;canvas.style.cursor=pad?'pointer':'default';});
canvas.addEventListener('pointerleave',()=>{hoverPad=null;renderer.hover=null;});
canvas.addEventListener('click',event=>{const r=canvas.getBoundingClientRect(),pad=renderer.hitPad(event.clientX-r.left,event.clientY-r.top);if(pad)activatePad(pad.id);else if(buildType){buildType=null;renderer.buildType=null;lastSelection='';updateHud();}});
cards.forEach(card=>card.addEventListener('click',()=>selectType(card.dataset.type)));

function pause(){if(!game.canEdit())return;game.paused=!game.paused;updateHud();}
function nextWave(){
  if(game.phase==='build'){game.startWave();buildType=null;renderer.buildType=null;persistBest();lastSelection='';updateHud();}
  else if(game.phase==='wave')pause();
  else $('result-dialog').showModal();
}
$('next-wave').addEventListener('click',nextWave);
$('pause').addEventListener('click',pause);$('resume').addEventListener('click',pause);
$('speed').addEventListener('click',()=>{game.speed=game.speed===1?2:1;$('speed').textContent=game.speed+'×';toast('toast.speed',{speed:game.speed});});
$('grid-toggle').addEventListener('click',()=>{renderer.grid=!renderer.grid;$('grid-toggle').classList.toggle('active',renderer.grid);$('grid-toggle').setAttribute('aria-pressed',String(renderer.grid));});
$('grid-upgrade').addEventListener('click',()=>{if(game.upgradeGrid()){toast('toast.grid');updateHud();}});
$('overdrive').addEventListener('click',()=>{if(game.activateOverdrive()){banner('banner.overdrive','banner.overdriveKicker');updateHud();}});
$('sound').addEventListener('click',async()=>{
  try {const enabled=await audio.toggle();updateSoundButton();toast(enabled?'toast.soundOn':'toast.soundOff');}
  catch{toast('toast.soundError');}
});
function openDialog(id){pauseBeforeDialog=game.paused;game.paused=true;$(id).showModal();updateHud();}
function closeDialog(id){$(id).close();}
for(const id of ['help-dialog','restart-dialog'])$(id).addEventListener('close',()=>{game.paused=pauseBeforeDialog;updateHud();});
$('help').addEventListener('click',()=>openDialog('help-dialog'));
document.querySelector('.close-dialog').addEventListener('click',()=>closeDialog('help-dialog'));
document.querySelector('.close-help').addEventListener('click',()=>closeDialog('help-dialog'));
$('restart').addEventListener('click',()=>openDialog('restart-dialog'));
$('cancel-restart').addEventListener('click',()=>closeDialog('restart-dialog'));
$('confirm-restart').addEventListener('click',reset);$('play-again').addEventListener('click',reset);
$('view-island').addEventListener('click',()=>closeDialog('result-dialog'));
document.addEventListener('keydown',e=>{
  if(document.querySelector('dialog[open]')||e.target.matches('input,textarea,select')||e.metaKey||e.ctrlKey||e.altKey)return;
  if(e.code==='Space')e.preventDefault();
  if(e.repeat)return;
  if(['1','2','3','4'].includes(e.key)){e.preventDefault();selectType(['gun','mortar','frost','relay'][Number(e.key)-1]);}
  else if(e.key==='Escape'){buildType=null;selectedPad=null;renderer.buildType=null;renderer.selected=null;lastSelection='';updateHud();}
  else if(e.code==='Space'){e.preventDefault();game.phase==='build'?nextWave():pause();}
  else if(e.key.toLowerCase()==='g')$('grid-toggle').click();
  else if(e.key.toLowerCase()==='m')$('sound').click();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&game.phase==='wave'&&!game.paused){game.paused=true;updateHud();}});

function updateSelection(){
  const tower=game.towers.find(tower=>tower.pad===selectedPad);
  const key=JSON.stringify([getLanguage(),buildType,selectedPad,tower&&[tower.id,tower.level,tower.connected,tower.powered],game.credits,game.phase]);
  if(key===lastSelection)return;lastSelection=key;
  const panel=$('selection');panel.dataset.mode=tower?'tower':buildType?'build':'brief';
  if(tower){
    const def=towerStats(tower),up=upgradeCost(tower),canUpgrade=tower.type!=='relay'&&tower.level<3;
    panel.innerHTML=`<p class="eyebrow">${def.en}<span class="selected-id">LV.${tower.level} / 03</span></p>
      <h3>${towerName(tower.type)}</h3><p class="description">${t(`tower.${tower.type}.description`)}</p>
      <span class="tower-status ${tower.powered?'':'offline'}">● ${t(tower.powered?'tower.powered':tower.connected?'tower.overload':'tower.disconnected')}</span>
      <div class="tower-stats"><div><span>${t(tower.type==='relay'?'stat.link':'stat.damage')}</span><strong>${tower.type==='relay'?'4.8':Math.round(def.damage)}</strong></div>
      <div><span>${t('stat.power')}</span><strong>${def.power}</strong></div><div><span>${t(tower.type==='relay'?'stat.cost':'stat.range')}</span><strong>${tower.type==='relay'?'30':def.range.toFixed(1)}</strong></div></div>
      <div class="selection-actions">${tower.type==='relay'?'':`<button id="upgrade-tower" ${!canUpgrade||game.credits<up||!game.canEdit()?'disabled':''}>${t(canUpgrade?'tower.upgrade':'tower.max')}${canUpgrade?`<small>${t('tower.upgradeCost',{cost:up})}</small>`:''}</button>`}
      <button id="sell-tower" class="sell" ${!game.canEdit()?'disabled':''}>${t('tower.sell')}<small>${t('tower.refund',{amount:sellValue(tower)})}</small></button></div>
      <div class="field-note"><span>↗</span><p>${t(tower.type==='relay'?'tower.relayNote':'tower.note')}</p></div>`;
    $('upgrade-tower')?.addEventListener('click',()=>{
      const result=game.upgrade(tower.id);
      if(!result.ok)toast(result.code);
      else toast(tower.powered?'toast.upgraded':'toast.upgradedOffline',()=>({name:towerName(tower.type),level:tower.level}));
      updateHud();
    });
    $('sell-tower').addEventListener('click',()=>{game.sell(tower.id);selectedPad=null;renderer.selected=null;updateHud();toast('toast.sold');});
  }else if(buildType){
    const def=TYPES[buildType];
    panel.innerHTML=`<p class="eyebrow">DEPLOY / ${def.en}</p><h3>${towerName(buildType)}</h3><p class="description">${t(`tower.${buildType}.description`)}</p>
      <div class="tower-stats"><div><span>${t('stat.buildCost')}</span><strong>${def.cost}</strong></div><div><span>${t('stat.power')}</span><strong>${def.power}</strong></div><div><span>${t(buildType==='relay'?'stat.link':'stat.range')}</span><strong>${buildType==='relay'?'4.8':def.range.toFixed(1)}</strong></div></div>
      <div class="field-note"><span>＋</span><p>${t('build.preview')}</p></div><button class="build-cancel" id="cancel-build">${t('build.cancel')}</button>`;
    $('cancel-build').addEventListener('click',()=>selectType(buildType));
  }else if(game.wave===0){
    panel.innerHTML=`<p class="eyebrow">YOUR FIRST WATCH</p><h3>${t('brief.title')}</h3><p class="description">${t('brief.description')}</p>
      <div class="steps">${[1,2,3].map(step=>`<div><span>0${step}</span><p>${t(`brief.step${step}`)}</p></div>`).join('')}</div>
      <div class="field-note"><span>↗</span><p>${t('brief.note')}</p></div>`;
  }else{
    const fighting=game.phase==='wave';
    panel.innerHTML=`<p class="eyebrow">${fighting?'HOLD THE LINE':'A MOMENT OF CALM'}</p>
      <h3>${t(fighting?'battle.title':game.phase==='won'?'result.wonTitle':game.phase==='lost'?'result.lostTitle':'calm.title')}</h3>
      <p class="description">${t(fighting?'battle.description':game.canEdit()?'calm.description':'end.description',{reward:game.lastReward})}</p>
      <div class="tower-stats"><div><span>${t('stat.kills')}</span><strong>${game.kills}</strong></div><div><span>${t('stat.towers')}</span><strong>${game.towers.length}</strong></div><div><span>${t('stat.time')}</span><strong>${Math.floor(game.elapsed/60)}:${String(Math.floor(game.elapsed%60)).padStart(2,'0')}</strong></div></div>
      <div class="field-note"><span>↗</span><p>${t(game.wave>=8?'tip.heavy':'tip.corners')}</p></div>`;
  }
}
function updateHud(){
  $('health').innerHTML=`${game.hp}<span> / 100</span>`;$('credits').textContent=game.credits;
  $('power').innerHTML=`${game.powerUsed}<span> / ${game.capacity}</span>`;
  $('health').style.color=game.hp<=30?'#e3a082':'';
  const index=Math.min(game.phase==='build'?game.wave:game.wave-1,9),def=WAVES[Math.max(0,index)];
  $('wave-number').textContent=String(index+1).padStart(2,'0');$('wave-name').textContent=t(`wave.${index+1}`);
  const clearedWaves=game.wave-(['wave','lost'].includes(game.phase)?1:0);
  $('wave-progress').innerHTML=WAVES.map((_,i)=>`<span class="${i<clearedWaves?'complete':i===index?'current':''}"></span>`).join('');
  $('enemy-count').textContent=t(game.phase==='wave'?'wave.remaining':'wave.targets',{count:game.phase==='wave'?game.enemies.length+game.queue.length:def.units.reduce((s,u)=>s+u[1],0)});
  $('enemy-preview').innerHTML=def.units.map(([type,count])=>`<span style="--enemy:${ENEMIES[type].color}"><i></i>${t(`enemy.${type}`)} ×${count}</span>`).join('');
  const offline=game.towers.filter(tower=>!tower.powered).length;
  $('grid-warning').hidden=!offline;$('grid-warning').textContent=t('grid.warning',{count:offline});
  $('grid-price').textContent=game.gridLevel>=4?t('grid.max'):`◇ ${game.gridCost()}`;
  $('grid-upgrade').disabled=game.gridLevel>=4||game.credits<game.gridCost()||!game.canEdit();
  $('next-wave').innerHTML=`<span>${t(game.phase==='build'?game.wave===0?'action.firstWave':'action.nextWave':game.phase==='wave'?game.paused?'action.resume':'action.pause':'action.record')}</span><b>${game.phase==='wave'&&!game.paused?'Ⅱ':'→'}</b>`;
  $('wave-hint').textContent=t(game.phase==='build'?'hint.build':game.phase==='wave'?'hint.wave':'hint.end');
  $('overdrive').hidden=game.phase!=='wave';$('overdrive').disabled=game.overdriveCooldown>0||game.paused;
  $('overdrive').innerHTML=`<span>ϟ ${t(game.overdrive>0?'overdrive.active':game.overdriveCooldown>0?'overdrive.cooling':'overdrive.name')}</span><small>${t(game.overdrive>0?'overdrive.left':game.overdriveCooldown>0?'overdrive.ready':'overdrive.hint',{seconds:Math.ceil(game.overdrive>0?game.overdrive:game.overdriveCooldown)})}</small>`;
  $('phase-tag').classList.toggle('fighting',game.phase==='wave');
  $('phase-tag').innerHTML=`<i></i> ${t(game.paused?'phase.paused':`phase.${game.phase}`)}`;
  $('paused-label').hidden=!game.paused||!game.canEdit()||!!document.querySelector('dialog[open]');
  $('pause').textContent=game.paused?'▷':'Ⅱ';$('pause').setAttribute('aria-label',t(game.paused?'control.resume':'control.pause'));$('pause').disabled=!game.canEdit();
  for(const card of cards){card.classList.toggle('selected',card.dataset.type===buildType);card.setAttribute('aria-pressed',String(card.dataset.type===buildType));card.classList.toggle('unaffordable',game.credits<TYPES[card.dataset.type].cost);card.disabled=!game.canEdit();}
  $('build-hint').textContent=buildType?t('build.selected',{name:towerName(buildType)}):t('build.hint');
  PADS.forEach((pad,i)=>{
    const tower=game.towers.find(tower=>tower.pad===pad.id),title=t('pad.title',{number:String(pad.id+1).padStart(2,'0')});
    const detail=tower?t('pad.occupied',{name:towerName(tower.type),level:tower.level,power:t(tower.powered?'pad.powered':'pad.offline')}):t('pad.empty');
    padButtons[i].title=title;padButtons[i].setAttribute('aria-label',`${title} · ${detail}`);
  });
  $('best-record').textContent=t(best.won?'status.bestWon':best.wave?'status.bestWave':'status.author',{wave:best.wave});
  updateSelection();
}
function renderResult(){
  const won=game.phase==='won';
  $('result-kicker').textContent=won?'THE LIGHT REMAINS':'UNTIL THE NEXT DAWN';
  $('result-title').textContent=t(won?'result.wonTitle':'result.lostTitle');
  $('result-copy').textContent=t(won?'result.wonCopy':'result.lostCopy');
  $('result-stats').innerHTML=`<div><strong>${game.wave}</strong><span>${t('stat.wave')}</span></div><div><strong>${game.kills}</strong><span>${t('stat.kills')}</span></div><div><strong>${game.hp}</strong><span>${t('stat.health')}</span></div>`;
}
function showResult(){persistBest();renderResult();$('result-dialog').showModal();}
function handleEvents(){
  for(const e of game.events){
    audio.play(e.type);
    if(e.type==='kill')renderer.burst(e.x,e.y,e.color,e.enemyType==='boss'?28:8);
    if(e.type==='build'||e.type==='upgrade')renderer.burst(e.tower.x,e.tower.y,TYPES[e.tower.type].color,18);
    if(e.type==='wave')banner(`wave.${e.wave}`,'banner.wave',{wave:String(e.wave).padStart(2,'0')});
    if(e.type==='clear'){toast('toast.clear',{wave:game.wave,reward:e.reward});persistBest();}
    if(e.type==='boss')banner('banner.boss','banner.bossKicker');
    if(e.type==='leak')renderer.shake=1;
    if(e.type==='won'||e.type==='lost')showResult();
  }
  game.events.length=0;
}
function frame(now){
  const dt=Math.min((now-previous)/1000,.05);previous=now;game.tick(dt);handleEvents();renderer.draw(game.paused?0:dt);
  if(now-lastHud>180){updateHud();lastHud=now;}
  requestAnimationFrame(frame);
}
applyLanguage();requestAnimationFrame(frame);
