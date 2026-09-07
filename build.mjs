import {mkdir,cp,readFile,writeFile} from 'node:fs/promises';
const root=new URL('.',import.meta.url),out=new URL('dist/',root);
await mkdir(out,{recursive:true});
for(const file of ['index.html','favicon.svg','src'])await cp(new URL(file,root),new URL(file,out),{recursive:true});
// A standalone edition opens directly via file:// without ES module restrictions.
let html=await readFile(new URL('index.html',root),'utf8');
const css=await readFile(new URL('src/style.css',root),'utf8');
const code=(await Promise.all(['i18n','game','render','audio','app'].map(name=>readFile(new URL(`src/${name}.js`,root),'utf8'))))
  .map(source=>source.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,''));
html=html.replace('<link rel="stylesheet" href="./src/style.css">',()=>`<style>${css}</style>`)
  .replace('<script type="module" src="./src/app.js"></script>','')
  .replace('<link rel="icon" type="image/svg+xml" href="./favicon.svg">','')
  .replace('</body>',()=>`<script>(()=>{\n${code.join('\n')}\n})();</script></body>`);
await writeFile(new URL('last-beacon.html',out),html);
console.log('Built dist/ for static hosting and dist/last-beacon.html for offline play.');
