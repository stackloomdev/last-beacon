import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {messages,t,setLanguage,getLanguage,resolveLanguage,preferredLanguage,saveLanguage,LANGUAGE_KEY} from '../src/i18n.js';
import {TYPES,ENEMIES,WAVES,Game} from '../src/game.js';

const parameters=text=>[...text.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
test('both languages provide every message and matching dynamic parameters',()=>{
  for(const [key,pair] of Object.entries(messages)){
    assert.equal(pair.length,2,key);assert.ok(pair.every(value=>typeof value==='string'&&value.trim()),key);
    assert.deepEqual(parameters(pair[0]),parameters(pair[1]),key);
    assert.equal(/\p{Script=Han}/u.test(pair[1]),false,`Chinese in English message: ${key}`);
  }
});
test('every static page binding and game identity has a translation',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const keys=[...html.matchAll(/data-i18n(?:-aria|-title|-content)?="([^"]+)"/g)].map(match=>match[1]);
  for(const type of Object.keys(TYPES))for(const field of ['name','description','role'])keys.push(`tower.${type}.${field}`);
  for(const type of Object.keys(ENEMIES))keys.push(`enemy.${type}`);
  WAVES.forEach((_,i)=>keys.push(`wave.${i+1}`));
  for(const key of keys)assert.ok(messages[key],`Missing ${key}`);
});
test('saved language wins over browser preferences, with predictable fallback',()=>{
  assert.equal(resolveLanguage('en',['zh-CN']),'en');assert.equal(resolveLanguage('zh',['en-US']),'zh');
  assert.equal(resolveLanguage(null,['en-GB','zh-CN']),'en');assert.equal(resolveLanguage(null,['zh-TW','en-US']),'zh');
  assert.equal(resolveLanguage('invalid',['fr-FR','en-US']),'en');assert.equal(resolveLanguage(null,['ja-JP']),'zh');
});
test('language choice survives reload and tolerates unavailable storage',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  setLanguage('en');saveLanguage(storage);assert.equal(values.get(LANGUAGE_KEY),'en');
  assert.equal(preferredLanguage(storage,['zh-CN']),'en');
  const blocked={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
  assert.equal(preferredLanguage(blocked,['en-US']),'en');assert.doesNotThrow(()=>saveLanguage(blocked));
  assert.equal(setLanguage('invalid'),false);assert.equal(getLanguage(),'en');setLanguage('zh');
});
test('dynamic messages translate numbers and all build errors without raw Chinese',()=>{
  assert.equal(t('toast.clear',{wave:3,reward:50},'en'),'Wave 3 defended · +50 parts · +1 power · +5 health');
  const game=new Game();
  const failures=[game.build('unknown',1),game.build('gun',0)];
  game.credits=0;failures.push(game.build('gun',1),game.upgrade(game.towers[0].id),game.upgrade(-1));
  game.phase='lost';failures.push(game.build('gun',1));
  for(const failure of failures){assert.equal(failure.ok,false);assert.ok(messages[failure.code]);assert.equal(/\p{Script=Han}/u.test(t(failure.code,{},'en')),false);}
});
