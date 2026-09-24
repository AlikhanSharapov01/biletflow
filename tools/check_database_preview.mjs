import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Daulet/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
await page.goto(pathToFileURL(path.join(root,'docs/database/BiletFlow_Database_Preview.html')).href);
const pages=JSON.parse(await readFile(path.join(root,'docs/database/atlas_manifest.json'),'utf8'));
const native=JSON.parse(await readFile(path.join(root,'docs/database/render_validation.json'),'utf8')).pages;
for(let i=1;i<=pages.length;i++) {
  await page.selectOption('#page',String(i).padStart(2,'0'));
  await page.locator('#sheet').evaluate(img=>img.decode());
  const size=await page.locator('#sheet').evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight}));
  if(Math.abs(size.width-native[i-1].width)>1||Math.abs(size.height-native[i-1].height)>1)throw new Error('Preview intrinsic dimensions differ from native draw.io rendering on page '+i);
}
await page.selectOption('#page','24');
await page.locator('#sheet').evaluate(img=>img.decode());
await page.locator('#scale').click();
if(!await page.locator('body').evaluate(x=>x.classList.contains('actual')))throw new Error('Actual-size toggle failed');
await page.locator('#scale').click();
await page.screenshot({path:path.join(root,'tmp/database-validation/preview-ui.png'),fullPage:true});
await writeFile(path.join(root,'docs/database/preview_validation.json'),JSON.stringify({pagesLoaded:pages.length,allImagesDecoded:true,pageSelection:'PASS',actualSizeToggle:'PASS'},null,2));
console.log('PASS: '+pages.length+' preview pages, page selector and actual-size toggle');
await browser.close();
