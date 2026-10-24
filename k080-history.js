/*
 * K-080 履歴管理 v0.1 | 2026-10-24
 * 既存「今日の応募済み」の保存キーや関数には一切触れない後付け型。
 * campaigns.js 読み込み後に読み込む。GitHub Pages で動作し外部通信しない。
 */
(function () {
  'use strict';
  const STORAGE_KEY = 'k080:history:v1';
  const SCHEMA_VERSION = 1;
  const APP_ID = 'k080-history';
  const campaignsNow = () => Array.isArray(window.CAMPAIGNS) ? window.CAMPAIGNS : [];
  let store, writable = true, problem = '';
  let container;

  const dateJST = (d = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(d);
    const get = type => parts.find(p => p.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  const cleanText = (value, max = 3000) => String(value == null ? '' : value).slice(0, max);
  const safeID = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,130}$/.test(value) && !['__proto__','prototype','constructor'].includes(value);
  const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value + 'T12:00:00Z').getTime()) && new Date(value+'T12:00:00Z').toISOString().slice(0,10) === value;
  const blank = () => ({schemaVersion: SCHEMA_VERSION, campaigns: {}, attempts: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()});
  const escapeHTML = s => cleanText(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function validate(data) {
    if (!data || data.schemaVersion !== 1 || !data.campaigns || typeof data.campaigns !== 'object' || Array.isArray(data.campaigns) || !Array.isArray(data.attempts)) throw Error('対応していない履歴データ形式です');
    if (Object.keys(data.campaigns).length > 5000 || data.attempts.length > 30000) throw Error('バックアップ件数が上限を超えています');
    for (const [id, c] of Object.entries(data.campaigns)) {
      if (!safeID(id) || !c || c.id !== id || typeof c.title !== 'string') throw Error('案件情報の形式に誤りがあります');
    }
    const seen = new Set();
    for (const a of data.attempts) {
      if (!a || !safeID(a.id) || seen.has(a.id) || !data.campaigns[a.campaignId] || !isDate(a.appliedOn) || !['unknown','win','lose'].includes(a.result)) throw Error('応募記録に不正な項目があります');
      if (a.checkedOn != null && !isDate(a.checkedOn)) throw Error('結果確認日が不正です');
      if (a.redeemedOn != null && !isDate(a.redeemedOn)) throw Error('引換日が不正です');
      if (![null,'pending','done','expired'].includes(a.redemption)) throw Error('引換状態が不正です');
      if (a.result !== 'win' && a.redemption !== null) throw Error('未当選記録に引換状態があります');
      if (a.result === 'win' && a.redemption === null) throw Error('当選記録の引換状態がありません');
      if (a.redemption === 'done' && !a.redeemedOn) throw Error('引換済みに日付がありません');
      if (a.redemption !== 'done' && a.redeemedOn != null) throw Error('未引換なのに引換日があります');
      seen.add(a.id);
    }
    return data;
  }

  function load() {
    try {
      const key = '__k080_probe__';
      localStorage.setItem(key, '1'); localStorage.removeItem(key);
      const old = localStorage.getItem(STORAGE_KEY);
      return old ? validate(JSON.parse(old)) : blank();
    } catch (e) {
      writable = false;
      problem = /形式|不正|対応/.test(String(e.message)) || e instanceof SyntaxError
        ? '保存済みの履歴を読めません。データを上書きせず停止しました。'
        : '端末内保存を利用できません。履歴の追加・編集は停止しました。';
      return blank();
    }
  }

  function snapshot(c) {
    return {
      id: c.id, title: cleanText(c.title, 500), sponsor: cleanText(c.sponsor, 150),
      prize: cleanText(c.prize, 500), category: cleanText(c.category, 100),
      membersOnly: !!c.membersOnly, age20: !!c.age20,
      startAt: cleanText(c.startAt, 40), deadline: cleanText(c.deadline, 40),
      redeemUntil: cleanText(c.redeemUntil, 40),
      officialUrl: cleanText(c.officialUrl, 600), entry: cleanText(c.entry, 700)
    };
  }
  function persist() {
    if (!writable) return false;
    try {
      store.updatedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      document.dispatchEvent(new Event('k080:history-changed'));
      return true;
    } catch (e) {
      writable = false;
      problem = '保存できませんでした。容量またはブラウザの設定をご確認ください。以後の編集を停止しました。';
      render();
      return false;
    }
  }
  function syncCampaigns() {
    let changed = false;
    for (const c of campaignsNow()) {
      if (!safeID(c.id)) continue;
      const next = snapshot(c), prior = store.campaigns[c.id];
      if (JSON.stringify(prior) !== JSON.stringify(next)) { store.campaigns[c.id] = next; changed = true; }
    }
    if (changed) persist();
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') node.className = v;
      else if (k === 'textContent') node.textContent = v;
      else if (k === 'htmlFor') node.htmlFor = v;
      else if (k === 'disabled') node.disabled = !!v;
      else if (k === 'value') node.value = v;
      else node.setAttribute(k, String(v));
    }
    children.flat().forEach(ch => { if (ch != null) node.append(typeof ch === 'string' ? document.createTextNode(ch) : ch); });
    return node;
  }
  const opt = (value, label) => el('option', {value, textContent: label});
  const todayTime = time => time ? Date.parse(time) : NaN;
  function phase(c) {
    const now = Date.now(), start = todayTime(c.startAt), end = todayTime(c.deadline);
    if (!Number.isNaN(start) && now < start) return '準備中';
    return !Number.isNaN(end) && now > end ? '応募終了' : '応募受付中';
  }
  function effectiveRedemption(a, c) {
    if (a.result !== 'win') return null;
    if (a.redemption === 'pending' && c.redeemUntil && Date.now() > todayTime(c.redeemUntil)) return '期限切れ（未引換）';
    return ({pending:'引換待ち',done:'引換済み',expired:'期限切れ'})[a.redemption] || '未確認';
  }
  function attemptsFor(id) { return store.attempts.filter(a => a.campaignId === id).sort((a,b) => b.appliedOn.localeCompare(a.appliedOn) || b.id.localeCompare(a.id)); }
  // Public read-only summary. Never changes the existing daily-check key.
  function summaryFor(id) {
    const at = store ? store.attempts.filter(a => a.campaignId === id) : [];
    const c = (store && store.campaigns[id]) || campaignsNow().find(x => x.id === id) || {};
    const wins = at.filter(a => a.result === 'win');
    const pending = wins.some(a => a.redemption === 'pending' && effectiveRedemption(a,c) === '引換待ち');
    let legacyWon = false;
    try { legacyWon = localStorage.getItem('line-coupon-memo:won:' + id) === '1'; } catch (_) {}
    return Object.freeze({attempts:at.length,wins:wins.length,
      losses:at.filter(a=>a.result==='lose').length,
      unknown:at.filter(a=>a.result==='unknown').length,
      pending, hasWin:wins.length>0,
      // Won-but-redeemed / expired campaigns belong to history, not the active list.
      hideFromActive:wins.length>0 && !pending, legacyWon});
  }

  function small(text, type) { return el('span', {className: 'k080-chip ' + (type || ''), textContent: text}); }
  function download(name, content, mime) {
    const url = URL.createObjectURL(new Blob([content], {type:mime}));
    const a = el('a', {href:url, download:name}); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  const csvCell = value => {
    let s = cleanText(value, 6000);
    // 表計算ソフトでの数式評価を防ぐ（ユーザー入力のメモにも適用）
    if (/^[\s\x00-\x1f]*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g,'""') + '"';
  };
  function exportCSV() {
    const headers = ['campaign_id','title','sponsor','category','members_only','start_at','deadline','redeem_until','attempt_id','applied_on','result','checked_on','redemption','redeemed_on','note'];
    const rows = [headers];
    for (const c of Object.values(store.campaigns)) {
      const all = attemptsFor(c.id);
      for (const a of all.length ? all : [null]) rows.push([
        c.id, c.title, c.sponsor, c.category, c.membersOnly ? 'yes':'no', c.startAt, c.deadline, c.redeemUntil,
        a?.id || '', a?.appliedOn || '', a?.result || '', a?.checkedOn || '', a?.redemption || '', a?.redeemedOn || '', a?.note || ''
      ]);
    }
    download(`K080_応募履歴_${dateJST()}.csv`, '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n', 'text/csv;charset=utf-8');
  }
  function exportJSON() {
    download(`K080_復元用_${dateJST()}.json`, JSON.stringify(store,null,2), 'application/json;charset=utf-8');
  }
  function addAttempt(id, date) {
    if (!writable || !isDate(date)) return;
    if (attemptsFor(id).some(a => a.result === 'win' && a.appliedOn <= date)) { alert('当選後の応募は記録できません。過去の応募を追記する場合は当選日より前の日付を指定してください。'); return; }
    if (date > dateJST()) { alert('未来の日付は記録できません。'); return; }
    if (attemptsFor(id).some(a => a.appliedOn === date) && !confirm('この案件には同じ日の応募記録があります。別の応募としてもう1件追加しますか？')) return;
    const a = {id:'a_' + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g,'') : (Date.now().toString(36)+Math.random().toString(36).slice(2))), campaignId:id,
      appliedOn:date, result:'unknown', checkedOn:null, redemption:null, redeemedOn:null, note:''};
    store.attempts.push(a);
    if (persist()) render(id);
  }
  function updateAttempt(id, changes) {
    if (!writable) return;
    const a = store.attempts.find(x => x.id === id); if (!a) return;
    Object.assign(a, changes);
    if (persist()) render(a.campaignId);
  }
  function resultChange(a, choice) {
    if (a.result === 'win' && choice !== 'win' && !confirm('当選記録と引換状態を解除します。よろしいですか？')) { render(a.campaignId); return; }
    updateAttempt(a.id, {result:choice, checkedOn:choice === 'unknown' ? null : dateJST(), redemption:choice === 'win' ? (a.result === 'win' ? a.redemption : 'pending') : null, redeemedOn:choice === 'win' ? a.redeemedOn : null});
  }
  function redemptionChange(a, choice) {
    if (a.result !== 'win') return;
    updateAttempt(a.id, {redemption:choice, redeemedOn:choice === 'done' ? (a.redeemedOn || dateJST()) : null});
  }
  function attemptRow(a, c) {
    const wrap = el('div',{className:'k080-attempt'});
    wrap.append(el('div',{className:'k080-attempt-date'},`応募日 ${a.appliedOn}`));
    const result = el('select',{'aria-label':`${c.title} ${a.appliedOn} 抽選結果`}, opt('unknown','未確認'),opt('lose','落選'),opt('win','当選'));
    result.value = a.result; result.disabled = !writable;
    result.addEventListener('change', () => resultChange(a,result.value));
    const red = el('select',{'aria-label':`${c.title} ${a.appliedOn} 引換状態`},opt('pending','引換待ち'),opt('done','引換済み'),opt('expired','期限切れ'));
    red.disabled = !writable || a.result !== 'win'; if (a.result === 'win') red.value = a.redemption;
    red.addEventListener('change',()=>redemptionChange(a,red.value));
    wrap.append(el('div',{className:'k080-attempt-fields'},el('label',{},'結果 ',result),el('label',{},'引換 ',red)));
    if (a.result === 'win') {
      const eff = effectiveRedemption(a,c);
      wrap.append(el('p',{className:'k080-muted'},`現在の表示：${eff} ／ 引換期限：${c.redeemUntil ? dateJST(new Date(c.redeemUntil)) : '不明'}`));
      if (a.redemption === 'done') {
        const date = el('input',{type:'date',value:a.redeemedOn,max:dateJST(),'aria-label':'引換日'});
        date.disabled = !writable;
        date.addEventListener('change',()=> { if (isDate(date.value) && date.value <= dateJST()) updateAttempt(a.id,{redeemedOn:date.value}); else {alert('日付を確認してください'); render(a.campaignId);} });
        wrap.append(el('label',{},'引換日 ',date));
      }
    }
    const note = el('input',{type:'text',maxlength:'300',value:a.note || '',placeholder:'メモ（任意・個人情報は入力しない）','aria-label':'応募メモ'});
    note.disabled = !writable;
    note.addEventListener('change',()=>updateAttempt(a.id,{note:note.value.slice(0,300)}));
    wrap.append(el('label',{className:'k080-note'},'メモ ',note));
    const del = el('button',{type:'button',className:'k080-delete'},'この応募記録を削除'); del.disabled = !writable;
    del.addEventListener('click',()=> { if (confirm(`${a.appliedOn}の応募記録を削除しますか？ 復旧にはバックアップが必要です。`)) {store.attempts=store.attempts.filter(x=>x.id!==a.id);if(persist())render(c.id);} });
    wrap.append(del); return wrap;
  }
  function campaignCard(c, openID) {
    const at = attemptsFor(c.id), wins = at.filter(a => a.result==='win'), loses = at.filter(a=>a.result==='lose'), unknowns = at.filter(a=>a.result==='unknown');
    let legacyWon = false; try { legacyWon = localStorage.getItem('line-coupon-memo:won:'+c.id) === '1'; } catch (_) {}
    const dt = el('details',{className:'k080-campaign'}); if (c.id === openID) dt.open = true;
    const header = el('summary',{}, el('span',{className:'k080-campaign-title'},c.title),small(phase(c)));
    header.append(small(`応募 ${at.length}回`));
    if (legacyWon && !wins.length) header.append(small('旧当選チェック済み・履歴未登録','k080-win'));
    if (wins.length) {
      header.append(small(`当選 ${wins.length}件`,'k080-win'));
      const statuses = [...new Set(wins.map(a=>effectiveRedemption(a,c)))];
      for (const s of statuses) header.append(small(s, s==='引換済み' ? 'k080-done' : ''));
    }
    if (loses.length) header.append(small(`落選 ${loses.length}件`));
    if (unknowns.length) header.append(small(`未確認 ${unknowns.length}件`));
    dt.append(header);
    const body = el('div',{className:'k080-card-body'});
    body.append(el('p',{className:'k080-muted'},`${c.sponsor} ／ 締切：${c.deadline ? dateJST(new Date(c.deadline)) : '未確認'} ／ 引換期限：${c.redeemUntil ? dateJST(new Date(c.redeemUntil)) : '未確認'}`));
    if (c.officialUrl && /^https:\/\/[^\s]+$/i.test(c.officialUrl)) {
      body.append(el('a',{href:c.officialUrl,target:'_blank',rel:'noopener noreferrer',className:'k080-official'},'公式ページを開く ↗'));
    }
    const row = el('div',{className:'k080-add'});
    const day = el('input',{type:'date',value:dateJST(),max:dateJST(),'aria-label':`${c.title} 応募完了日`});day.disabled = !writable;
    const add = el('button',{type:'button'},'応募完了を1回記録');
    const winnerDates = wins.map(a=>a.appliedOn).sort();
    const refreshAddDisabled = () => { add.disabled = !writable || (winnerDates.length > 0 && day.value >= winnerDates[0]); };
    day.addEventListener('change',refreshAddDisabled); refreshAddDisabled();
    add.addEventListener('click',()=>addAttempt(c.id,day.value));
    row.append(el('label',{},'応募完了日 ',day),add);
    body.append(row,el('p',{className:'k080-muted'},'実際に応募を完了した場合だけ記録。公式応募ボタンを押しただけでは記録されません。'));
    if (at.length) {body.append(el('h4',{},'応募ごとの記録'));at.forEach(a=>body.append(attemptRow(a,c)));}
    else body.append(el('p',{className:'k080-empty'},'まだ応募履歴はありません。'));
    dt.append(body);return dt;
  }

  function render(openID) {
    if (!container) return;
    const detailsOpen = !!container.querySelector('details.k080-root[open]');
    container.replaceChildren();
    const root = el('details',{className:'k080-root'}); root.open=!!openID || detailsOpen;
    const count=store.attempts.length;
    root.append(el('summary',{},`応募・当選・引換履歴（${count}件）`));
    const box=el('div',{className:'k080-content'});
    box.append(el('p',{className:'k080-notice'},'従来の「今日の応募済みチェック」とは別の記録です。実際の応募完了を記録してください。端末間で自動同期しません。'));
    if (!writable) box.append(el('p',{className:'k080-error',role:'alert'},problem));
    const known=Object.values(store.campaigns), pending=store.attempts.filter(a=>a.result==='win' && a.redemption==='pending' && effectiveRedemption(a,store.campaigns[a.campaignId])==='引換待ち').length;
    const win=store.attempts.filter(a=>a.result==='win').length,lose=store.attempts.filter(a=>a.result==='lose').length,unk=store.attempts.filter(a=>a.result==='unknown').length;
    box.append(el('p',{className:'k080-counts'},`応募 ${count}回　当選 ${win}件　落選 ${lose}件　未確認 ${unk}件　引換待ち ${pending}件`));
    const tools=el('div',{className:'k080-tools'});
    const csv=el('button',{type:'button'},'CSV保存');csv.addEventListener('click',exportCSV);
    const json=el('button',{type:'button'},'復元用JSON保存');json.addEventListener('click',exportJSON);
    const file=el('input',{type:'file',accept:'.json,application/json','aria-label':'復元用JSONを読み込む'});
    file.disabled=!writable;
    file.addEventListener('change',async()=> {
      if (!file.files?.[0]) return;
      if (file.files[0].size>10*1024*1024) {alert('ファイルが大きすぎます（10MBまで）。');file.value='';return;}
      try {
        const imported=validate(JSON.parse(await file.files[0].text()));
        if (!confirm(`バックアップを復元すると、この端末の記録（現在${store.attempts.length}件）は置き換わります。復元元：${imported.attempts.length}件。続けますか？`)) {file.value='';return;}
        const previous = store;
        store = imported;
        // 復元データ内のキャンペーン情報を先に保持し、現行情報を必要に応じて最新化
        if (!persist()) {store=previous;return;}
        syncCampaigns(); render();
      } catch(e) {alert('復元できませんでした：'+e.message);}
      file.value='';
    });
    tools.append(csv,json,el('label',{className:'k080-filelabel'},'JSON復元 ',file));
    box.append(tools);
    box.append(el('p',{className:'k080-muted'},'CSV＝表計算・集計用、JSON＝完全復元用。個人クーポンURL・バーコード・会員情報はメモ欄に入力しないでください。'));
    const sorted=known.sort((a,b) => (phase(a)==='応募受付中'?0:1)-(phase(b)==='応募受付中'?0:1) || (b.deadline||'').localeCompare(a.deadline||''));
    box.append(el('h3',{},'キャンペーン別履歴（受付終了分も保存）'));
    for (const c of sorted) box.append(campaignCard(c,openID));
    if (!known.length) box.append(el('p',{},'案件データがありません。campaigns.js を先に読み込んでください。'));
    root.append(box);container.append(root);
  }
  function init() {
    if (document.getElementById(APP_ID)) return;
    store=load();
    if (writable) syncCampaigns();
    const style=el('style');style.textContent=`
#k080-history {margin:32px auto;max-width:980px;color:#253043;font-family:system-ui,-apple-system,"Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;line-height:1.6}
#k080-history *{box-sizing:border-box}
#k080-history .k080-root{border:1px solid #c8d0da;border-radius:14px;background:#fbfcfe;overflow:hidden}
#k080-history .k080-root>summary{font-weight:750;font-size:1.12rem;cursor:pointer;padding:18px;background:#eef3f7}
#k080-history .k080-content{padding:16px}
#k080-history h3{font-size:1rem;margin:26px 0 12px} #k080-history h4{font-size:.94rem;margin:20px 0 10px}
#k080-history .k080-muted{font-size:.82rem;color:#5a6675;margin:8px 0}
#k080-history .k080-notice{font-size:.9rem;margin:0 0 12px}
#k080-history .k080-counts{font-weight:700;padding:10px 12px;border-radius:8px;background:#e6eef6}
#k080-history .k080-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:14px 0}
#k080-history button{min-height:39px;border:1px solid #60738c;border-radius:8px;padding:7px 12px;cursor:pointer;color:#1e3249;background:white;font:inherit;font-size:.87rem}
#k080-history button:hover:not(:disabled){background:#e9f0f6} #k080-history button:disabled{opacity:.5;cursor:not-allowed}
#k080-history input,#k080-history select{min-height:38px;border:1px solid #aab6c7;border-radius:6px;padding:6px;max-width:100%;background:white;color:#253043;font:inherit;font-size:.91rem}
#k080-history .k080-filelabel{font-size:.88rem;display:flex;align-items:center;flex-wrap:wrap;gap:6px}
#k080-history input[type=file]{width:min(100%,300px);font-size:.76rem}
#k080-history .k080-campaign{margin:10px 0;border:1px solid #d4dce6;border-radius:10px;background:white;overflow:hidden}
#k080-history .k080-campaign>summary{cursor:pointer;display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:12px;line-height:1.7}
#k080-history .k080-campaign-title{font-weight:700;width:100%;font-size:.95rem}
#k080-history .k080-chip{display:inline-block;padding:1px 8px;border-radius:20px;background:#edf0f3;font-size:.75rem}
#k080-history .k080-win{background:#fff2cc;color:#6c4900}#k080-history .k080-done{background:#e2f4e5;color:#245734}
#k080-history .k080-card-body{padding:10px 14px 16px;border-top:1px solid #e4e8ef}
#k080-history .k080-official{display:inline-block;margin:6px 0 12px;color:#165d97;text-decoration:underline}
#k080-history .k080-add,#k080-history .k080-attempt-fields{display:flex;flex-wrap:wrap;align-items:center;gap:12px}
#k080-history label{font-size:.84rem}#k080-history .k080-add{margin:8px 0}
#k080-history .k080-attempt{border-top:1px solid #e8eaf0;padding:12px 0}
#k080-history .k080-attempt-date{font-weight:700;font-size:.9rem;margin-bottom:6px}
#k080-history .k080-note{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0;align-items:center}
#k080-history .k080-note input{flex:1;min-width:150px}
#k080-history .k080-delete{font-size:.75rem!important;border-color:#aa8787!important;color:#7b3d3d!important;min-height:32px}
#k080-history .k080-empty{font-size:.88rem;color:#5c6470}
#k080-history .k080-error{padding:12px;border:1px solid #bc6464;color:#8e1616;background:#fff4f4}
@media (max-width:550px){#k080-history{margin:18px 0}#k080-history .k080-content{padding:11px}#k080-history .k080-tools button{flex:1}#k080-history .k080-filelabel{width:100%}#k080-history .k080-add input{width:160px}#k080-history .k080-root>summary{padding:14px}}
`;
    document.head.append(style);
    container=el('section',{id:APP_ID,'aria-label':'応募・当選・引換履歴'});
    const listSection = document.querySelector('main > .content') || document.querySelector('main .content');
    if (listSection) listSection.insertAdjacentElement('afterend',container);
    else { const host = document.querySelector('main') || document.querySelector('#app') || document.body; host.append(container); }
    render();
    window.K080History = Object.freeze({
      refresh: () => {if (writable) syncCampaigns();render();document.dispatchEvent(new Event('k080:history-changed'));},
      summaryFor, storageKey:STORAGE_KEY
    });
    document.dispatchEvent(new Event('k080:history-ready'));
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();