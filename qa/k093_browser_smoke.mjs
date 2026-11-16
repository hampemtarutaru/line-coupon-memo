// K-093: repeatable browser regression for the actual coupon site code (no external requests).
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
const browser=await chromium.launch({headless:true});
const errors=[];
try {
  mkdirSync('qa-results',{recursive:true});
  for(const width of [320,390,1280]){
    const ctx=await browser.newContext({viewport:{width,height:800},deviceScaleFactor:1});
    const page=await ctx.newPage();
    await page.route('https://static.cloudflareinsights.com/**', route=>route.fulfill({status:200,contentType:'application/javascript',body:''}));
    page.on('pageerror',error=>errors.push(width+': '+error.message));
    const response=await page.goto('http://127.0.0.1:8767/',{waitUntil:'networkidle'});
    assert.equal(response?.status(),200);
    assert.match(await page.title(),/LINE無料引換メモ/);
    const mascot=page.locator('.site-mascot-k093 img');
    assert.equal(await mascot.count(),1);
    assert.equal(await mascot.getAttribute('alt'),'はむれす');
    assert.ok(await mascot.evaluate(img=>img.complete&&img.naturalWidth>0),'Hamuresu image missing at '+width);
    const logo=await page.locator('.brand').boundingBox();
    const ham=await page.locator('.site-mascot-k093').boundingBox();
    assert.ok(ham.x>=logo.x+logo.width-1,'Mascot overlaps site brand at '+width);
    assert.ok(ham.x+ham.width<=width+1,'Mascot overflows header at '+width);
    const dimensions=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
    if(dimensions.scroll>dimensions.client+1) {
      const offenders=await page.evaluate(()=>[...document.querySelectorAll('body *')].map(el=>{const r=el.getBoundingClientRect();return {tag:el.tagName,cls:el.className,scroll:el.scrollWidth,client:el.clientWidth,left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width)};}).filter(o=>o.right>document.documentElement.clientWidth+1 || o.left< -1).slice(0,25));
      console.error('Overflow diagnostic',width,JSON.stringify(offenders));
    }
    assert.ok(dimensions.scroll<=dimensions.client+1,'Page overflows at '+width+': '+JSON.stringify(dimensions));
    assert.equal(await page.locator('#search').count(),0);
    assert.equal(await page.locator('#campaign-list').count(),1);
    assert.equal(await page.locator('#unentered-only').count(),1);
    assert.ok(await page.evaluate(()=>Array.isArray(window.CAMPAIGNS)&&window.CAMPAIGNS.length>0),'Campaign data unavailable');
    const filter=page.locator('#unentered-only');
    await filter.check(); assert.equal(await filter.isChecked(),true);
    await filter.uncheck(); assert.equal(await filter.isChecked(),false);
    assert.ok(await page.locator('#today').innerText()!=='','Today display missing');
    const history=page.locator('details.k080-root');
    assert.equal(await history.count(),1,'History panel missing at '+width);
    await page.screenshot({path:'qa-results/k093-hamuresu-'+width+'.png',fullPage:false});
    await ctx.close();
  }
  assert.deepEqual(errors,[],'Uncaught browser errors');
  console.log('K-093 Hamuresu Chromium: 320, 390, 1280px, header, image, existing filter/history and overflow PASS');
} finally {
  await browser.close();
}
