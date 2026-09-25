import {mkdir,cp,readFile,writeFile,rm} from 'node:fs/promises';
import vm from 'node:vm';
const root=new URL('.',import.meta.url),out=new URL('dist/',root);
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
for(const file of ['index.html','favicon.svg','src','vendor'])await cp(new URL(file,root),new URL(file,out),{recursive:true});

// A standalone edition opens directly via file:// without ES module restrictions.
// This tiny bundler follows the module graph from src/app.js and gives every module its own scope.
// Bare specifiers (three) resolve through the page's import map, so dev server and single file load the same code.
let html=await readFile(new URL('index.html',root),'utf8');
const importMap=JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
const IMPORT=/^import\s+(.+?)\s+from\s+(['"])(.+?)\2;?[ \t]*$/gm;
const EXPORT_DECLARATION=/^export\s+((?:async\s+)?(function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*))/gm;
const modules=new Map(),order=[],exported=new Map(),imported=[];
const keyOf=url=>url.href.slice(root.href.length);
function resolve(specifier,from){
  if(specifier.startsWith('./')||specifier.startsWith('../'))return new URL(specifier,from);
  if(importMap[specifier])return new URL(importMap[specifier],root);
  throw new Error(`Cannot resolve "${specifier}" from ${keyOf(from)}`);
}
// Names declared by `const a=…,b=…;` at the top level, skipping nested brackets and string literals.
function declarators(source,start){
  const names=[],name=at=>/^\s*([A-Za-z_$][\w$]*)/.exec(source.slice(at))?.[1];
  let depth=0;names.push(name(start));
  for(let i=start;i<source.length;i++){
    const c=source[i];
    if(c==='"'||c==="'"||c==='`'){for(i++;i<source.length&&source[i]!==c;i++)if(source[i]==='\\')i++;continue;}
    if('([{'.includes(c))depth++;else if(')]}'.includes(c))depth--;
    else if(depth===0&&c===','){const next=name(i+1);if(next)names.push(next);}
    else if(depth===0&&c===';')break;
  }
  return names;
}
function bindings(clause,key){
  const namespace=clause.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)$/);
  if(namespace)return namespace[1];
  const named=clause.match(/^\{([^}]*)\}$/);
  if(!named)throw new Error(`Unsupported import "${clause}" in ${key}`);
  return `{${named[1].split(',').map(part=>part.trim()).filter(Boolean).map(part=>part.replace(/^([\w$]+)\s+as\s+([\w$]+)$/,'$1:$2')).join(',')}}`;
}
function vendorModule(source,key){
  // Pre-bundled ES module: exactly one trailing export list and no imports.
  const exports=[...source.matchAll(/export\{([^}]*)\};?/g)];
  if(exports.length!==1)throw new Error(`${key} must contain exactly one export list`);
  const names=exports[0][1].split(',').map(part=>{const [local,exported=local]=part.trim().split(/\s+as\s+/);return `${exported}:${local}`;});
  exported.set(key,new Set(names.map(n=>n.split(':')[0])));
  return source.replace(exports[0][0],()=>`return {${names.join(',')}};`);
}
async function visit(url){
  const key=keyOf(url);
  if(modules.has(key))return;
  modules.set(key,null);
  let source=await readFile(url,'utf8');
  if(key.startsWith('vendor/')){modules.set(key,vendorModule(source,key));order.push(key);return;}
  const deps=[];
  source=source.replace(IMPORT,(_,clause,quote,specifier)=>{
    const dep=resolve(specifier,url);deps.push(dep);
    const named=clause.trim().match(/^\{([^}]*)\}$/);
    if(named)for(const part of named[1].split(',').map(p=>p.trim()).filter(Boolean))imported.push({from:keyOf(dep),name:part.split(/\s+as\s+/)[0],in:key});
    return `const ${bindings(clause.trim(),key)}=__modules[${JSON.stringify(keyOf(dep))}];`;
  });
  const names=[];
  source=source.replace(EXPORT_DECLARATION,(match,declaration,kind,name,offset,whole)=>{
    names.push(...(['const','let','var'].includes(kind)?declarators(whole,offset+match.length-name.length):[name]));
    return declaration;
  });
  source=source.replace(/^export\s*\{([^}]*)\};?[ \t]*$/gm,(_,list)=>{for(const part of list.split(',').map(p=>p.trim()).filter(Boolean)){const [local,exported=local]=part.split(/\s+as\s+/);names.push(exported===local?local:`${exported}:${local}`);}return '';});
  if(/^\s*(import|export)\b/m.test(source))throw new Error(`Unsupported module syntax left in ${key}`);
  for(const dep of deps)await visit(dep);
  exported.set(key,new Set(names.map(n=>n.split(':')[0])));
  modules.set(key,`${source}\nreturn {${names.join(',')}};`);order.push(key);
}
await visit(new URL('src/app.js',root));
for(const i of imported)if(!exported.get(i.from)?.has(i.name))throw new Error(`${i.in} imports "${i.name}", which ${i.from} does not export`);
const bundle=`(()=>{'use strict';const __modules={};\n${order.map(key=>`__modules[${JSON.stringify(key)}]=(()=>{\n${modules.get(key)}\n})();`).join('\n')}\n})();`;
new vm.Script(bundle,{filename:'last-beacon.html'});
if(/<\/script|<!--/i.test(bundle))throw new Error('Inline script contains a sequence that would break the HTML parser');
const css=await readFile(new URL('src/style.css',root),'utf8');
html=html.replace('<link rel="stylesheet" href="./src/style.css">',()=>`<style>${css}</style>`)
  .replace(/<script type="importmap">[\s\S]*?<\/script>\s*/,'')
  .replace('<script type="module" src="./src/app.js"></script>','')
  .replace('<link rel="icon" type="image/svg+xml" href="./favicon.svg">','')
  .replace('</body>',()=>`<script>${bundle}</script></body>`);
if(/<script[^>]+src=|<link[^>]+href=|https?:\/\/(?!threejs\.org)/.test(html.replace(/<script>[\s\S]*<\/script>/,'')))throw new Error('Single-file edition must not reference external files');
await writeFile(new URL('last-beacon.html',out),html);
console.log(`Built dist/ for static hosting and dist/last-beacon.html (${Math.round(html.length/1024)} KB, ${order.length} modules) for offline play.`);
