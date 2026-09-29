// Original synthesized sound effects and ambience. No samples, downloads, or audio permissions.
export class AudioEngine {
  constructor(){this.enabled=false;this.ctx=null;this.last={};this.level=1;}
  async toggle(){
    if(!this.ctx&&!this.init())return false;
    if(this.ctx.state==='suspended')await this.ctx.resume();
    this.enabled=!this.enabled;
    this.master.gain.setTargetAtTime(this.enabled?.9:0,this.ctx.currentTime,.05);
    if(this.enabled)this.play('build');
    return this.enabled;
  }
  init(){
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return false;
    const ctx=this.ctx=new Audio(),comp=ctx.createDynamicsCompressor();
    comp.threshold.value=-16;comp.ratio.value=5;comp.attack.value=.004;comp.release.value=.2;
    this.master=ctx.createGain();this.master.gain.value=0;this.master.connect(comp);comp.connect(ctx.destination);
    const length=ctx.sampleRate*2,buffer=ctx.createBuffer(1,length,ctx.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<length;i++)data[i]=Math.random()*2-1;this.noiseBuffer=buffer;
    // Ambience: surf, wind and rain beds that follow the weather.
    const bed=(type,frequency,q)=>{const src=ctx.createBufferSource();src.buffer=buffer;src.loop=true;src.playbackRate.value=.6+Math.random()*.2;
      const filter=ctx.createBiquadFilter();filter.type=type;filter.frequency.value=frequency;filter.Q.value=q;const gain=ctx.createGain();gain.gain.value=0;
      src.connect(filter);filter.connect(gain);gain.connect(this.master);src.start();return {gain,filter};};
    this.surf=bed('lowpass',380,.7);this.wind=bed('bandpass',650,.55);this.rain=bed('highpass',1900,.4);
    const lfo=ctx.createOscillator(),depth=ctx.createGain();lfo.frequency.value=.085;depth.gain.value=160;lfo.connect(depth);depth.connect(this.surf.filter.frequency);lfo.start();
    this.mood={rain:0,wind:.35,waves:1,storm:0,night:0};this.chirp=0;
    return true;
  }
  // Background tabs stay silent; the looping beds would otherwise keep playing.
  setHidden(hidden){if(!this.ctx)return;if(hidden)this.ctx.suspend();else if(this.enabled)this.ctx.resume();}
  setAmbience(mood){
    if(!this.ctx||!mood)return;
    const t=this.ctx.currentTime,m=this.mood=mood;
    // The surf swells as the camera drops towards the water and fades when it pulls back over the island.
    const coast=m.coast??.5;
    this.surf.gain.gain.setTargetAtTime((.035+.03*Math.min(2.5,m.waves))*(.6+.8*coast),t,.8);this.surf.filter.frequency.setTargetAtTime(300+200*coast,t,1);
    this.wind.gain.gain.setTargetAtTime(.008+.03*m.wind,t,.8);this.wind.filter.frequency.setTargetAtTime(500+500*m.wind,t,1);
    this.rain.gain.gain.setTargetAtTime(.055*m.rain,t,.6);
    if(this.enabled&&m.night>.55&&m.rain<.1&&(this.chirp-=1)<=0&&Math.random()<.04){this.chirp=12;for(let i=0;i<3;i++)this.tone(4300+Math.random()*300,.05,'sine',.006,i*.09+Math.random()*.02,4100);}
  }
  output(pan=0,delay=0){
    const t=this.ctx.currentTime+delay;
    if(!pan||!this.ctx.createStereoPanner)return {at:t,node:this.master};
    const p=this.ctx.createStereoPanner();p.pan.value=Math.max(-.85,Math.min(.85,pan));p.connect(this.master);setTimeout(()=>p.disconnect(),(delay+3)*1000);
    return {at:t,node:p};
  }
  tone(freq,duration=.12,type='sine',volume=.035,delay=0,endFreq=freq,pan=0){
    if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;
    const {at,node}=this.output(pan,delay),osc=this.ctx.createOscillator(),gain=this.ctx.createGain();
    volume*=this.level;osc.type=type;osc.frequency.setValueAtTime(freq,at);osc.frequency.exponentialRampToValueAtTime(Math.max(30,endFreq),at+duration);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+.006);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    osc.connect(gain);gain.connect(node);osc.start(at);osc.stop(at+duration+.02);
    osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
  noise(duration,{type='lowpass',frequency=1000,to=frequency,q=.7,volume=.05,delay=0,pan=0,attack=.004}={}){
    if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;
    const {at,node}=this.output(pan,delay),src=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter(),gain=this.ctx.createGain();
    volume*=this.level;src.buffer=this.noiseBuffer;src.playbackRate.value=.9+Math.random()*.2;filter.type=type;filter.Q.value=q;
    filter.frequency.setValueAtTime(frequency,at);filter.frequency.exponentialRampToValueAtTime(Math.max(40,to),at+duration);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+attack);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    src.connect(filter);filter.connect(gain);gain.connect(node);src.start(at,Math.random()*1.5);src.stop(at+duration+.05);
    src.onended=()=>{src.disconnect();filter.disconnect();gain.disconnect();};
  }
  horn(freq,duration,volume,delay=0){
    if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;
    const {at,node}=this.output(0,delay),filter=this.ctx.createBiquadFilter(),gain=this.ctx.createGain();
    filter.type='lowpass';filter.frequency.value=freq*5.5;filter.Q.value=1.4;
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+.3);gain.gain.setValueAtTime(volume,at+duration-.5);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    filter.connect(gain);gain.connect(node);
    for(const [f,type] of [[freq,'sawtooth'],[freq*1.007,'sawtooth'],[freq/2,'sine']]){const osc=this.ctx.createOscillator();osc.type=type;osc.frequency.value=f;osc.connect(filter);osc.start(at);osc.stop(at+duration+.05);osc.onended=()=>osc.disconnect();}
    setTimeout(()=>{filter.disconnect();gain.disconnect();},(delay+duration+.3)*1000);
  }
  // A two-tone diaphone: a long reedy blast that drops into a low grunt, with an echo coming back off the water.
  foghorn(volume=.075,delay=0){
    if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;
    const ctx=this.ctx,{at,node}=this.output(0,delay),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),echo=ctx.createDelay(1),feedback=ctx.createGain(),wet=ctx.createGain();
    const hi=158,lo=106,drop=1.62,end=2.9;
    filter.type='lowpass';filter.Q.value=2;filter.frequency.setValueAtTime(620,at);filter.frequency.linearRampToValueAtTime(1100,at+.4);filter.frequency.setValueAtTime(1100,at+drop);filter.frequency.exponentialRampToValueAtTime(430,at+drop+.3);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+.25);gain.gain.setValueAtTime(volume,at+drop);gain.gain.linearRampToValueAtTime(volume*1.2,at+drop+.15);
    gain.gain.setValueAtTime(volume*1.2,at+end-.45);gain.gain.exponentialRampToValueAtTime(.0001,at+end);
    echo.delayTime.value=.42;feedback.gain.value=.3;wet.gain.value=.35;
    filter.connect(gain);gain.connect(node);gain.connect(echo);echo.connect(feedback);feedback.connect(echo);echo.connect(wet);wet.connect(node);
    for(const [mul,type,level] of [[1,'sawtooth',1],[1.006,'sawtooth',.8],[.5,'square',.45]]){
      const osc=ctx.createOscillator(),g=ctx.createGain();osc.type=type;g.gain.value=level;
      osc.frequency.setValueAtTime(hi*mul*.94,at);osc.frequency.linearRampToValueAtTime(hi*mul,at+.2);osc.frequency.setValueAtTime(hi*mul,at+drop);osc.frequency.exponentialRampToValueAtTime(lo*mul,at+drop+.16);
      osc.connect(g);g.connect(filter);osc.start(at);osc.stop(at+end+.05);osc.onended=()=>{osc.disconnect();g.disconnect();};
    }
    setTimeout(()=>{for(const n of [filter,gain,echo,feedback,wet])n.disconnect();},(delay+end+3)*1000);
  }
  limited(kind,gap){const now=this.ctx.currentTime;if(now-(this.last[kind]||0)<gap)return true;this.last[kind]=now;return false;}
  // level is how far away the sound is (1 near the camera, less further off); gain is a sound's own strength.
  play(kind,options={}){
    if(!this.enabled||!this.ctx)return;
    this.level=Math.max(0,Math.min(1.4,options.level??1));
    try{this.sound(kind,options);}finally{this.level=1;}
  }
  sound(kind,{pan=0,kind:sub,gain=1,delay=0,enemyType,by}={}){
    if(kind==='shoot') {
      if(sub==='mortar'){this.tone(110,.2,'sine',.09*gain,0,42,pan);this.noise(.18,{frequency:900,to:200,volume:.05,pan});}
      else if(sub==='frost'){if(this.limited('frost',.08))return;this.tone(1320,.22,'sine',.012,0,1250,pan);this.tone(1980,.16,'sine',.008,.01,1900,pan);this.noise(.12,{type:'highpass',frequency:5000,volume:.012,pan});}
      else if(sub==='arc'){if(this.limited('arc',.06))return;for(let i=0;i<4;i++)this.noise(.04,{type:'bandpass',frequency:2400+Math.random()*1800,q:2.5,volume:.05,delay:i*.028,pan});this.tone(90,.13,'sawtooth',.02,0,70,pan);}
      else{if(this.limited('gun',.055))return;this.noise(.05,{type:'bandpass',frequency:1700,q:.9,volume:.05,pan});this.tone(170,.05,'triangle',.02,0,70,pan);}
    }
    else if(kind==='blast'){if(this.limited('blast',.05))return;this.noise(.65,{frequency:2600,to:170,volume:.11,pan});this.tone(72,.5,'sine',.08,0,34,pan);}
    else if(kind==='kill'){
      if(enemyType==='boss'){this.noise(1.6,{frequency:3200,to:90,volume:.16,pan});this.tone(60,1.4,'sine',.12,0,24,pan);return;}
      if(this.limited('kill',.04))return;
      // Each weapon kills with its own sound: a sizzle for arcs, a crack of ice for frost, a crunch of shell otherwise.
      if(by==='arc'){this.noise(.4,{type:'highpass',frequency:3400,to:1600,volume:.03,pan});this.tone(140,.2,'sawtooth',.012,0,60,pan);}
      else if(by==='frost'){this.tone(3100,.09,'sine',.012,0,2800,pan);this.noise(.1,{type:'highpass',frequency:6000,volume:.016,pan});}
      else{this.noise(.09,{type:'bandpass',frequency:by==='gun'?1300:2600,q:1.2,volume:.03,pan});this.tone(by==='gun'?230:540,.08,by==='gun'?'triangle':'square',.008,0,by==='gun'?90:260,pan);}
    }
    else if(kind==='shatter'){if(this.limited('shatter',.05))return;for(let i=0;i<5;i++)this.tone(2400+Math.random()*2400,.14+Math.random()*.12,'sine',.009,i*.016+Math.random()*.01,2200+Math.random()*1600,pan);this.noise(.22,{type:'highpass',frequency:4500,to:2600,volume:.035,pan});}
    else if(kind==='split'){this.noise(.16,{type:'bandpass',frequency:420,q:2,volume:.05,pan});this.tone(300,.16,'sine',.02,0,110,pan);}
    else if(kind==='build'||kind==='upgrade'||kind==='grid'){this.noise(.07,{type:'bandpass',frequency:900,q:1.5,volume:.04,pan});this.tone(520,.14,'sine',.03,0,520,pan);this.tone(780,.22,'sine',.025,.09,780,pan);}
    else if(kind==='sell'){this.noise(.2,{frequency:700,to:200,volume:.04,pan});this.tone(420,.18,'sine',.02,0,260,pan);}
    else if(kind==='target'){this.tone(880,.05,'sine',.015,0,880,pan);this.tone(1320,.06,'sine',.012,.05,1320,pan);}
    else if(kind==='wave'){this.foghorn();}
    else if(kind==='boss'){this.horn(65,2.6,.09);this.noise(2.4,{frequency:180,to:60,volume:.08,attack:.4});}
    else if(kind==='leak'){this.tone(120,.35,'sawtooth',.03,0,55);this.noise(.4,{frequency:700,to:120,volume:.08});}
    else if(kind==='clear'||kind==='won'){[330,440,550,660].forEach((f,i)=>this.tone(f,.4,'sine',.028,i*.12));}
    else if(kind==='lost'){[330,260,165].forEach((f,i)=>this.tone(f,.5,'triangle',.03,i*.2));this.noise(2,{frequency:300,to:60,volume:.05,attack:.3});}
    else if(kind==='overdrive'){this.tone(165,.7,'sine',.05,0,660);this.tone(82,.9,'triangle',.03,0,330);}
    else if(kind==='strike'){this.tone(220,.85,'sine',.05,0,1400,pan);this.noise(.8,{type:'highpass',frequency:2500,to:7000,volume:.03,attack:.6,pan});}
    else if(kind==='strikeHit'){this.noise(1.2,{frequency:4000,to:100,volume:.18,pan});this.tone(55,1,'sine',.14,0,26,pan);this.noise(.5,{type:'highpass',frequency:6000,volume:.03,delay:.05,pan});}
    else if(kind==='thunder'){const v=.08+.1*gain;this.noise(2.8,{frequency:420,to:60,volume:v,delay,attack:.08,pan});this.noise(1.2,{frequency:1400,to:200,volume:v*.6,delay:delay+.02,pan});this.tone(40,2.2,'sine',v*.8,delay,28,pan);}
    else if(kind==='firework'){if(this.limited('firework',.2))return;this.noise(.12,{frequency:2500,to:400,volume:.05,pan});for(let i=0;i<5;i++)this.noise(.03,{type:'highpass',frequency:5000,volume:.012,delay:.15+i*.06+Math.random()*.04,pan});}
    else if(kind==='endless'){this.foghorn(.08);this.horn(82,2.2,.05,.4);}
    // The lamp housing turns and the beam settles onto the island; lifting it again sighs back up.
    else if(kind==='beam'){if(this.limited('beam',.12))return;this.noise(.28,{type:'bandpass',frequency:900,to:380,q:1.3,volume:.03,pan});this.tone(190,.4,'sine',.035,0,120,pan);this.tone(660,.3,'sine',.012,.06,760,pan);}
    else if(kind==='beamLift'){this.tone(300,.45,'sine',.016,0,420);}
  }
}
