// K-080 read-only inventory health gate. Never edits campaigns.js or user history.
// Run: node scripts/k080_campaign_health.mjs [--as-of=2026-11-10T12:00:00+09:00]
// Date thresholds match main.js: a 23:59 deadline remains open through 23:59:59.
import {readFileSync} from 'node:fs';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const timestamp=s=>typeof s==='string' ? Date.parse(s) : NaN;
const dateOnly=s=>{
  if(typeof s!=='string'||! /^\d{4}-\d{2}-\d{2}$/.test(s))return NaN;
  const d=Date.parse(s+'T00:00:00Z');
  return Number.isFinite(d)&&new Date(d).toISOString().slice(0,10)===s ? d : NaN;
};
const https=s=>{
  try {const u=new URL(s);return u.protocol==='https:'&&!!u.hostname&&!u.username&&!u.password;}
  catch{return false;}
};
const jstDay=ms=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
const dayDiff=(earlier,later)=>Math.round((dateOnly(later)-dateOnly(earlier))/86400000);

export function parseCampaignFile(source) {
  // Intentionally parse the JSON literal without evaluating JS in the file.
  const match=String(source).match(/window\.CAMPAIGNS\s*=\s*(\[[\s\S]*\]);\s*$/);
  if(!match)throw new Error('campaigns.js must end with window.CAMPAIGNS = [JSON];');
  const data=JSON.parse(match[1]);
  if(!Array.isArray(data))throw new Error('Campaign data must be an array');
  return data;
}

export function auditCampaigns(campaigns,{asOf=Date.now(),staleDays=21,minActive=3}={}) {
  const now=typeof asOf==='string' ? timestamp(asOf):asOf;
  if(!Number.isFinite(now))throw new Error('Invalid asOf timestamp');
  if(!Array.isArray(campaigns))throw new Error('Expected array');
  const errors=[],warnings=[],seen=new Set(),active=[],future=[],closed=[];
  const today=jstDay(now);
  for(const [i,c] of campaigns.entries()){
    const tag='['+i+'] '+String(c?.id||'?')+': ';
    if(!c||typeof c!=='object'){errors.push(tag+'record must be object');continue;}
    if(typeof c.id!=='string'||! /^[a-z0-9-]+$/.test(c.id))errors.push(tag+'invalid id');
    if(seen.has(c.id))errors.push(tag+'duplicate id');
    seen.add(c.id);
    for(const name of ['title','sponsor','prize','entry','sourceType'])
      if(typeof c[name]!=='string'||!c[name].trim())errors.push(tag+'missing '+name);
    if(!https(c.officialUrl))errors.push(tag+'officialUrl must be HTTPS without credentials');
    if(!Number.isInteger(c.winners)||c.winners<10000)errors.push(tag+'winners below listing threshold');
    if(c.requiresPurchase!==false)errors.push(tag+'purchase required or unknown');
    const start=timestamp(c.startAt),end=timestamp(c.deadline),redeem=timestamp(c.redeemUntil);
    if(!Number.isFinite(start)||!Number.isFinite(end)||!Number.isFinite(redeem)||start>end||end>redeem){
      errors.push(tag+'invalid start/deadline/redeem order');
      continue;
    }
    const verified=dateOnly(c.verifiedAt);
    if(!Number.isFinite(verified))errors.push(tag+'invalid verifiedAt');
    if(Number.isFinite(verified) && verified>dateOnly(today))errors.push(tag+'future verifiedAt');
    const classified={id:c.id,title:c.title,deadline:c.deadline,verifiedAt:c.verifiedAt};
    if(start>now)future.push(classified);
    else if(now<end+60000) {
      active.push(classified);
      if(Number.isFinite(verified)&&dayDiff(c.verifiedAt,today)>staleDays)
        warnings.push(tag+'active campaign last verified '+dayDiff(c.verifiedAt,today)+' days ago');
    } else closed.push(classified);
  }
  if(active.length<minActive)
    warnings.push('Only '+active.length+' campaigns accept new entries at '+today+' JST; check for fresh official campaigns');
  return {
    checkedAt:new Date(now).toISOString(),jstDate:today,
    counts:{total:campaigns.length,active:active.length,future:future.length,closed:closed.length},
    active,future,closedIds:closed.map(c=>c.id),
    errors,warnings,
    // This gate never authorizes publication or creates a new campaign entry.
    publishApproved:false
  };
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const arg=process.argv.find(x=>x.startsWith('--as-of='));
  const asOf=arg?arg.slice('--as-of='.length):Date.now();
  const path=join(resolve(dirname(fileURLToPath(import.meta.url)),'..'),'campaigns.js');
  let r;
  try{r=auditCampaigns(parseCampaignFile(readFileSync(path,'utf8')),{asOf});}
  catch(e){console.error('ERROR: '+e.message);process.exitCode=1;}
  if(r){
    console.log('K-080 inventory '+r.jstDate+' JST: '+JSON.stringify(r.counts));
    r.active.forEach(c=>console.log('ACTIVE '+c.id+' closes '+c.deadline+' / verified '+c.verifiedAt));
    r.errors.forEach(x=>console.error('ERROR '+x));
    r.warnings.forEach(x=>console.warn('REVIEW '+x));
    console.log('No automatic publishing, adding or deleting of campaigns or personal history.');
    if(r.errors.length)process.exitCode=1;
  }
}
