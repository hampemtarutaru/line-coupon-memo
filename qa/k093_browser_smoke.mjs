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
    // Isolated synthetic history only. No real user storage is touched.
    assert.equal(await page.locator('.k080-loss-mascot img').count(),0);
    await page.evaluate(()=>{
      const key=window.K080History.storageKey;
      const data=JSON.parse(localStorage.getItem(key));
      const id=Object.keys(data.campaigns)[0];
      const date='2026-10-10';
      data.attempts=[
        {id:'qa_a',campaignId:id,appliedOn:date,result:'lose',checkedOn:date,redemption:null,redeemedOn:null,note:''},
        {id:'qa_b',campaignId:id,appliedOn:date,result:'lose',checkedOn:date,redemption:null,redeemedOn:null,note:''},
        {id:'qa_c',campaignId:id,appliedOn:date,result:'unknown',checkedOn:null,redemption:null,redeemedOn:null,note:''},
        {id:'qa_d',campaignId:id,appliedOn:date,result:'win',checkedOn:date,redemption:'done',redeemedOn:date,note:''}
      ];
      localStorage.setItem(key,JSON.stringify(data));
    });
    await page.reload({waitUntil:'networkidle'});
    const image=page.locator('.k080-loss-mascot img');
    assert.equal(await image.count(),1,'One mascot per campaign');
    const card=page.locator('.k080-campaign').filter({has:image});
    await page.locator('details.k080-root > summary').click();
    await card.locator('summary').click();
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(img=>img.decode());
    assert.ok(await image.evaluate(img=>img.complete && img.naturalWidth===180));
    const box=await image.boundingBox();
    assert.ok(box && box.width<=120.5 && box.x>=0 && box.x+box.width<=width+1);
    assert.equal(await image.locator('xpath=../..').locator('select').first().inputValue(),'lose');
    await page.screenshot({path:'qa-results/k080-loss-'+width+'.png',fullPage:false});
    // Changing the shown loss must move the image to the remaining loss;
    // changing both to unknown removes it, then recording a loss restores it.
    await image.locator('xpath=../..').locator('select').first().selectOption('unknown');
    assert.equal(await image.count(),1);
    await image.locator('xpath=../..').locator('select').first().selectOption('unknown');
    assert.equal(await image.count(),0);
    // The first row is a win, so use an unknown row instead.
    const unknown=page.locator('.k080-campaign[open] .k080-attempt select').filter({has:page.locator('option[value="unknown"]')});
    await unknown.nth(1).selectOption('lose');
    assert.equal(await image.count(),1);
    assert.equal(await image.locator('xpath=../..').locator('select').first().inputValue(),'lose');
    await ctx.close();
  }
  assert.deepEqual(errors,[],'Uncaught browser errors');
  console.log('K-093 Hamuresu Chromium: 320, 390, 1280px, header, image, existing filter/history and overflow PASS');
} finally {
  await browser.close();
}
