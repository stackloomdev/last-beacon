import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// The offline edition must stay one self-contained file: Three.js and every module inlined, nothing fetched.
test('the build produces a self-contained single-file edition with every module inlined',async()=>{
  execFileSync(process.execPath,['build.mjs'],{cwd:new URL('..',import.meta.url),stdio:'pipe'});
  const html=await readFile(new URL('../dist/last-beacon.html',import.meta.url),'utf8');
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  assert.equal(scripts.length,1);
  assert.doesNotThrow(()=>new vm.Script(scripts[0]));
  const page=html.replace(scripts[0],'');
  assert.equal(/<script[^>]+src=|<link[^>]+href=|importmap|https?:\/\//.test(page),false);
  for(const module of ['vendor/three.module.min.js','src/game.js','src/3d/world.js','src/3d/terrain.js','src/app.js'])assert.ok(scripts[0].includes(`__modules["${module}"]`),module);
  assert.equal(/^\s*(import|export)\s/m.test(scripts[0].replace(/__modules\["vendor[\s\S]*?\n__modules\["src/,'')),false);
});
