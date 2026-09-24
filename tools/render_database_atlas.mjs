// Render the actual .drawio XML with the official draw.io viewer in local headless Edge.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Daulet/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'docs/database');
const scratch=path.join(root,'tmp/database-validation');
await mkdir(path.join(scratch,'screenshots'),{recursive:true});
await mkdir(path.join(output,'preview'),{recursive:true});
const xml=await readFile(path.join(output,'BiletFlow_Database.drawio'),'utf8');
const pages=JSON.parse(await readFile(path.join(output,'atlas_manifest.json'),'utf8'));
const html=`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:white;font-family:Arial}#diagram{position:relative;}</style><div id="diagram"></div><script src="${pathToFileURL(path.join(scratch,'viewer-static.min.js')).href}"></script>`;
await writeFile(path.join(scratch,'render.html'),html);
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-gpu','--allow-file-access-from-files']});
const tab=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
const errors=[];tab.on('pageerror',e=>errors.push(e.message));
await tab.goto(pathToFileURL(path.join(scratch,'render.html')).href);
await tab.waitForFunction(()=>typeof GraphViewer!=='undefined');
const reports=[];
for(const [index,p] of pages.entries()) {
  await tab.setViewportSize({width:p.width+40,height:1000});
  const result=await tab.evaluate(({xml,id})=>{
    const doc=new DOMParser().parseFromString(xml,'text/xml');
    const diagram=Array.from(doc.documentElement.children).find(x=>x.getAttribute('id')===id);
    const single='<mxfile>'+new XMLSerializer().serializeToString(diagram)+'</mxfile>';
    const box=document.getElementById('diagram'); box.innerHTML='';box.removeAttribute('style');
    box.setAttribute('data-mxgraph',JSON.stringify({xml:single,nav:false,resize:true,toolbar:'',highlight:'#000000',border:20}));
    window.currentViewer=GraphViewer.createViewerForElement(box);
    return {name:diagram.getAttribute('name')};
  },{xml,id:p.id});
  await tab.waitForFunction(()=>!!document.querySelector('#diagram svg'));
  await tab.evaluate(()=>document.fonts.ready);
  const native=await tab.evaluate(()=>{
    const box=document.getElementById('diagram');const svg=box.querySelector('svg');
    const rect=svg.getBoundingClientRect();
    svg.setAttribute('width',String(rect.width));
    svg.setAttribute('height',String(rect.height));
    svg.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);
    svg.setAttribute('style','display:block;background:#FFFFFF');
    return {svg:new XMLSerializer().serializeToString(svg),width:rect.width,height:rect.height,textNodes:svg.querySelectorAll('foreignObject,text').length,bodyText:box.textContent.slice(0,120)};
  });
  if(native.width<50||native.height<50)throw new Error('Empty rendering '+p.name);
  const stem=String(index+1).padStart(2,'0');
  await writeFile(path.join(output,'preview',stem+'.svg'),native.svg);
  await tab.locator('#diagram').screenshot({path:path.join(scratch,'screenshots',stem+'.png')});
  reports.push({page:index+1,name:p.name,width:native.width,height:native.height,textNodes:native.textNodes});
  console.log(stem+' '+p.name+' '+native.width+'x'+native.height);
}
await writeFile(path.join(output,'render_validation.json'),JSON.stringify({renderer:'Official draw.io viewer-static.min.js in local headless Microsoft Edge',pages:reports,errors},null,2));
await browser.close();
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const options=pages.map((p,i)=>`<option value="${String(i+1).padStart(2,'0')}">${String(i+1).padStart(2,'0')} · ${escape(p.name)}</option>`).join('');
await writeFile(path.join(output,'BiletFlow_Database_Preview.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BiletFlow database atlas</title><style>*{box-sizing:border-box}body{margin:0;background:#e8edf3;color:#17324d;font-family:Arial,sans-serif}header{position:sticky;top:0;z-index:5;background:#17324d;color:white;padding:15px 24px;display:flex;align-items:center;gap:18px;flex-wrap:wrap}h1{font-size:19px;margin:0}select,button{font:inherit;padding:8px;border:0;border-radius:5px}select{max-width:400px}a{color:#bde4ff}main{padding:20px;overflow:auto}.sheet{display:block;background:white;box-shadow:0 3px 20px #17324d18;margin:auto;max-width:100%;height:auto}body.actual .sheet{max-width:none;margin-left:0}small{display:block;color:#d7e3ef}button{cursor:pointer}</style><header><div><h1>BiletFlow / database atlas</h1><small>${pages.length} pages · 66 tables · PostgreSQL</small></div><select id="page" aria-label="Diagram page">${options}</select><button id="scale">Actual size</button><a href="BiletFlow_Database.drawio" download>Editable draw.io file</a><a href="BiletFlow_Database_Specification.md">Full specification</a></header><main><img class="sheet" id="sheet" src="preview/01.svg" alt="Database atlas page"></main><script>const p=document.getElementById('page'),i=document.getElementById('sheet'),b=document.getElementById('scale');p.onchange=()=>{i.src='preview/'+p.value+'.svg';i.alt=p.options[p.selectedIndex].text;scrollTo(0,0)};b.onclick=()=>{document.body.classList.toggle('actual');b.textContent=document.body.classList.contains('actual')?'Fit width':'Actual size'};</script></html>`);
