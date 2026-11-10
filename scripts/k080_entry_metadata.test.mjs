import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>readFileSync(join(root,name),'utf8');
const home='https://coupon.hampemtarutaru.com/';

test('one homepage canonical, title and text sharing preview',()=>{
  const html=read('index.html');
  const canonical=[...html.matchAll(/<link rel="canonical" href="([^"]+)">/g)];
  assert.deepEqual(canonical.map(x=>x[1]),[home]);
  const title=html.match(/<title>([^<]+)<\/title>/)?.[1];
  const desc=html.match(/<meta name="description" content="([^"]+)">/)?.[1];
  assert.ok(title&&desc);
  assert.ok(html.includes('<meta property="og:title" content="'+title+'">'));
  assert.ok(html.includes('<meta property="og:description" content="'+desc+'">'));
  assert.ok(html.includes('<meta property="og:url" content="'+home+'">'));
  assert.doesNotMatch(html,/<meta property="og:image"/);
});

test('sitemap contains public landing page but no campaign/private routes',()=>{
  const xml=read('sitemap.xml');
  assert.match(xml,/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.deepEqual([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(x=>x[1]),[home]);
  assert.doesNotMatch(xml,/campaigns\.js|history|attempt|coupon\/[a-z]/i);
});

test('campaigns and personal data modules remain independent of metadata',()=>{
  const html=read('index.html');
  for(const name of ['campaigns.js','main.js','k080-history.js'])
    assert.ok(html.includes('src="'+name) || html.includes('src="'+name+'?'));
  assert.match(html,/id="campaign-list"/);
});
