(function () {
  "use strict";
  const campaigns = Array.isArray(window.CAMPAIGNS) ? window.CAMPAIGNS : [];
  const list = document.getElementById("campaign-list");
  const notice = document.getElementById("notice");
  const empty = document.getElementById("empty");
  const count = document.getElementById("item-count");
  const filter = document.getElementById("unentered-only");
  const dayParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });
  const readable = new Intl.DateTimeFormat("ja-JP", {timeZone:"Asia/Tokyo", year:"numeric", month:"numeric", day:"numeric", weekday:"short", hour:"2-digit", minute:"2-digit"});
  const dayFormatter = new Intl.DateTimeFormat("ja-JP", {timeZone:"Asia/Tokyo", year:"numeric", month:"numeric", day:"numeric", weekday:"short"});
  const TODAY = () => {
    const p = Object.fromEntries(dayParts.formatToParts(new Date()).filter(x => x.type !== "literal").map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  };
  // Keep the visible date and daily checkboxes correct when a tab stays open overnight.
  const todayNode = document.getElementById("today");
  let displayedDay = TODAY();
  todayNode.textContent = `きょう ${dayFormatter.format(new Date())}`;
  const checkKey = id => `line-coupon-memo:done:${TODAY()}:${id}`;
  const getDone = id => { try { return localStorage.getItem(checkKey(id)) === "1"; } catch { return false; } };
  const setDone = (id, done) => { try { done ? localStorage.setItem(checkKey(id), "1") : localStorage.removeItem(checkKey(id)); } catch { /* Private browsing may block storage. */ } };
  const e = (tag, className, content) => { const node = document.createElement(tag); if(className) node.className = className; if(content !== undefined) node.textContent = content; return node; };
  const future = c => Number.isFinite(Date.parse(c.deadline)) && Date.parse(c.deadline) >= Date.now();
  const permitted = c => c.requiresPurchase === false && Number(c.winners) >= 10000 && /^https:\/\//.test(c.officialUrl || "") && c.deadline;
  const fmtNum = n => Number(n).toLocaleString("ja-JP");
  // The history module is optional. The existing daily checkbox works without it.
  const historyFor = id => window.K080History?.summaryFor?.(id) || null;
  function draw() {
    list.replaceChildren();
    const valid = campaigns.filter(permitted)
      .filter(c => (future(c) || historyFor(c.id)?.pending) && !historyFor(c.id)?.hideFromActive)
      .sort((a,b) => {
        // Unredeemed winners remain prominent, including after the entry deadline.
        const pa = historyFor(a.id)?.pending ? 0 : 1;
        const pb = historyFor(b.id)?.pending ? 0 : 1;
        return pa-pb || Date.parse(a.deadline)-Date.parse(b.deadline);
      });
    const shown = valid.filter(c => !filter.checked || !getDone(c.id) || historyFor(c.id)?.pending);
    count.textContent = `${shown.length}件`;
    empty.hidden = shown.length > 0;
    if(!campaigns.length){ notice.textContent="掲載候補はまだありません。公式要項を確認できた案件から追加します。"; notice.hidden=false; }
    else { notice.hidden=true; }
    for (const c of shown) {
      const history = historyFor(c.id);
      const card = e("article", "campaign" + (getDone(c.id) && !history?.pending ? " is-done" : ""));
      const details = e("div", "details");
      const tags = e("div", "badges");
      tags.append(e("span", "tag", "LINE応募"), e("span", "tag", "購入不要"));
      if(c.age20) tags.append(e("span", "tag age", "20歳以上"));
      if(c.membersOnly) tags.append(e("span", "tag neutral", "会員限定"));
      if(history?.attempts) tags.append(e("span", "tag neutral", `応募 ${history.attempts}回`));
      if(history?.pending) tags.append(e("span", "tag", "当選・引換待ち"));
      else if(history?.wins) tags.append(e("span", "tag neutral", "当選履歴あり"));
      else if(history?.unknown) tags.append(e("span", "tag neutral", `結果未確認 ${history.unknown}回`));
      if(history?.legacyWon && !history?.wins) tags.append(e("span", "tag neutral", "旧当選チェックあり・履歴未登録"));
      details.append(tags, e("h3", "", c.title), e("p", "prize", c.prize));
      const facts = e("div", "facts");
      const deadline = e("span", "");
      deadline.append(e("b", "", "締切 "), document.createTextNode(readable.format(new Date(c.deadline))));
      const winners = e("span", "");
      winners.append(e("b", "", "当選 "), document.createTextNode(`${fmtNum(c.winners)}名`));
      facts.append(deadline,winners);
      details.append(facts, e("p", "notes", c.entry || ""));
      if(history?.pending) {
        const message = e("p", "notes", `当選記録があります。再応募せず、引換期限 ${c.redeemUntil ? readable.format(new Date(c.redeemUntil)) : '未確認'} までにご確認ください。`);
        message.style.fontWeight = '700'; message.style.color = '#22604b';
        details.append(message);
      }
      const actions = e("div", "actions");
      const link = e("a", "apply", "公式ページを見る ↗");
      link.href = c.officialUrl; link.target = "_blank"; link.rel="noopener noreferrer";
      // The official campaign URL is not the user-specific winning coupon URL.
      if(history?.pending) link.title = "当選した引換券の表示先とは限りません。実際のクーポンは応募時に案内された画面をご確認ください。";
      const label = e("label", "done");
      const box = document.createElement("input"); box.type="checkbox"; box.checked=getDone(c.id); box.setAttribute("aria-label", `${c.title}に今日応募済み`);
      box.addEventListener("change", () => {setDone(c.id, box.checked); draw();});
      label.append(box,document.createTextNode("今日の応募済み"));
      if(history?.pending) {
        box.disabled = true; // Winner: no more entries; preserve prior daily-check value.
        label.title = '当選記録があるため、応募済みの変更は停止中です';
      }
      actions.append(link,label);card.append(details,actions);list.append(card);
    }
  }
  const dates = campaigns.map(c=>c.verifiedAt).filter(Boolean).sort();
  document.getElementById("updated").textContent = dates.length ? `掲載情報の最終確認：${dates[dates.length-1]}` : "掲載情報の確認日：未確認";
  filter.addEventListener("change", draw);
  document.addEventListener('k080:history-ready', draw);
  document.addEventListener('k080:history-changed', draw);

  // The page may stay open over a JST day change or an in-day campaign deadline.
  // Refresh only when the date or an entry/redemption availability state changes,
  // so a person using the page does not lose focus to a needless rerender.
  let lastClockState = '';
  function clockState() {
    return TODAY() + '|' + campaigns.filter(permitted).map(c => {
      const h = historyFor(c.id);
      return [c.id, future(c) ? 1 : 0, h?.pending ? 1 : 0, h?.hideFromActive ? 1 : 0].join(':');
    }).join('|');
  }
  function refreshForClock() {
    const day = TODAY();
    const dayChanged = day !== displayedDay;
    if (dayChanged) {
      displayedDay = day;
      todayNode.textContent = `きょう ${dayFormatter.format(new Date())}`;
    }
    if (dayChanged || clockState() !== lastClockState) {
      // The history panel's date bounds and redemption labels also need refresh.
      if (dayChanged && window.K080History?.refresh) window.K080History.refresh();
      else draw();
    }
  }
  const originalDraw = draw;
  // Track the state after every regular draw, including checkbox/history events.
  const drawWithClockState = () => { originalDraw(); lastClockState = clockState(); };
  filter.removeEventListener("change", draw);
  filter.addEventListener("change", drawWithClockState);
  document.removeEventListener('k080:history-ready', draw);
  document.removeEventListener('k080:history-changed', draw);
  document.addEventListener('k080:history-ready', drawWithClockState);
  document.addEventListener('k080:history-changed', drawWithClockState);
  // Main campaign checkboxes use draw() directly; refreshForClock will detect no
  // time-related change because the state key excludes the daily checkbox status.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshForClock(); });
  window.addEventListener('pageshow', refreshForClock);
  window.addEventListener('focus', refreshForClock);
  setInterval(refreshForClock, 60 * 1000);
  drawWithClockState();
})();