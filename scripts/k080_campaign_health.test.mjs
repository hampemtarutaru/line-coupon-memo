import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseCampaignFile,auditCampaigns} from './k080_campaign_health.mjs';

const raw=readFileSync(new URL('../campaigns.js',import.meta.url),'utf8');
const source=parseCampaignFile(raw);
const options=at=>({asOf:at,minActive:0});

test('current campaigns.js is valid JSON literal with unique, well-formed records',()=>{
  assert.equal(source.length,11);
  const r=auditCampaigns(source,options('2026-11-10T12:00:00+09:00'));
  assert.deepEqual(r.errors,[]);
  assert.equal(r.publishApproved,false);
});

test('today has three active entries; next day has one and history is retained',()=>{
  const today=auditCampaigns(source,options('2026-11-10T12:00:00+09:00'));
  assert.deepEqual(today.active.map(x=>x.id).sort(),[
    'asahi-clearasahi-nama-20261028',
    'kirin-honkirin-20261104',
    'suntory-matsurika-20261104'
  ].sort());
  const next=auditCampaigns(source,options('2026-11-11T12:00:00+09:00'));
  assert.deepEqual(next.active.map(x=>x.id),['suntory-matsurika-20261104']);
  assert.equal(next.counts.total,11);
  assert.equal(next.counts.closed,10);
  assert.equal(source.length,11,'read-only audit modified data');
});

test('23:59 deadline is inclusive until 23:59:59, not into next day',()=>{
  const before=auditCampaigns(source,options('2026-11-10T23:59:59+09:00'));
  const after=auditCampaigns(source,options('2026-11-11T00:00:00+09:00'));
  assert.equal(before.counts.active,3);
  assert.equal(after.counts.active,1);
});

test('stale active verification produces review warning not invented updated date',()=>{
  const fake=[{
    id:'fake',title:'Test',sponsor:'Sponsor',prize:'Free',entry:'LINE',sourceType:'official',
    officialUrl:'https://example.com/',winners:50000,requiresPurchase:false,
    startAt:'2026-10-01T09:00:00+09:00',
    deadline:'2026-12-01T23:59:00+09:00',
    redeemUntil:'2026-12-15T23:59:00+09:00',verifiedAt:'2026-10-01'
  }];
  const r=auditCampaigns(fake,{asOf:'2026-11-10T12:00:00+09:00',minActive:1});
  assert.equal(r.errors.length,0);
  assert.ok(r.warnings.some(s=>s.includes('last verified')));
  assert.equal(fake[0].verifiedAt,'2026-10-01');
});

test('reject invalid source URL and deadline ordering; do not mutate input',()=>{
  const fake=[{
    id:'bad',title:'Test',sponsor:'Sponsor',prize:'Free',entry:'LINE',sourceType:'official',
    officialUrl:'http://bad.invalid/',winners:9000,requiresPurchase:true,
    startAt:'2026-11-11T09:00:00+09:00',
    deadline:'2026-11-10T23:59:00+09:00',
    redeemUntil:'2026-11-09T23:59:00+09:00',verifiedAt:'2026-11-10'
  }];
  const original=JSON.stringify(fake);
  const r=auditCampaigns(fake,options('2026-11-10T12:00:00+09:00'));
  assert.ok(r.errors.length>=4);
  assert.equal(JSON.stringify(fake),original);
});

test('file parser never evaluates arbitrary script instead of JSON',()=>{
  assert.deepEqual(parseCampaignFile('window.CAMPAIGNS = [{"id":"safe"}];'),[{id:'safe'}]);
  assert.throws(()=>parseCampaignFile('window.CAMPAIGNS = (function(){ process.exit(1) })();'));
});
