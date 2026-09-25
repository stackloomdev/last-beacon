// Maintainer-only: regenerates vendor/three.module.min.js from the official npm package.
// Players never need this. The game ships the generated file, so it runs without npm install, CDN or network.
// Usage: node scripts/vendor-three.mjs   (requires network access to the npm registry)
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const THREE_VERSION='0.186.1',ESBUILD_VERSION='0.25.12';
const root=new URL('../',import.meta.url),work=await mkdtemp(path.join(tmpdir(),'last-beacon-three-'));
try{
  execFileSync('npm',['install','--no-save','--no-audit','--no-fund','--prefix',work,`three@${THREE_VERSION}`,`esbuild@${ESBUILD_VERSION}`],{stdio:'inherit'});
  const entry=path.join(work,'entry.mjs');await writeFile(entry,"export * from 'three';\n");
  const esbuild=await import(pathToFileURL(path.join(work,'node_modules/esbuild/lib/main.js')).href);
  await esbuild.build({entryPoints:[entry],bundle:true,minify:true,format:'esm',target:'es2020',legalComments:'eof',absWorkingDir:work,
    outfile:new URL('vendor/three.module.min.js',root).pathname,
    banner:{js:`/* three.js r${THREE_VERSION.split('.')[1]}.${THREE_VERSION.split('.')[2]} (npm three@${THREE_VERSION}) · MIT License · https://threejs.org · minified into one ES module with esbuild ${ESBUILD_VERSION} for Last Beacon. */`}});
  await copyFile(path.join(work,'node_modules/three/LICENSE'),new URL('vendor/THREE-LICENSE.txt',root));
  console.log(`Vendored three@${THREE_VERSION} into vendor/three.module.min.js`);
}finally{await rm(work,{recursive:true,force:true});}
