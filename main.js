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
  const todayLabel = dayFormatter.format(new Date());
  document.getElementById("today").textContent = `きょう ${todayLabel}`;
  const checkKey = id => `line-coupon-memo:done:${TODAY()}:${id}`;
  const getDone = id => { try { return localStorage.getItem(checkKey(id)) === "1"; } catch { return false; } };
  const setDone = (id, done) => { try { done ? localStorage.setItem(checkKey(id), "1") : localStorage.removeItem(checkKey(id)); } catch { /* Private browsing may block storage. */ } };
  const e = (tag, className, content) => { const node = document.createElement(tag); if(className) node.className = className; if(content !== undefined) node.textContent = content; return node; };
  const future = c => Number.isFinite(Date.parse(c.deadline)) && Date.parse(c.deadline) >= Date.now();
  const permitted = c => c.requiresPurchase === false && Number(c.winners) >= 10000 && /^https:\/\//.test(c.officialUrl || "") && c.deadline;
  const fmtNum = n => Number(n).toLocaleString("ja-JP");
  function draw() {
    list.replaceChildren();
    const valid = campaigns.filter(permitted).filter(future).sort((a,b) => Date.parse(a.deadline)-Date.parse(b.deadline));
    const shown = valid.filter(c => !filter.checked || !getDone(c.id));
    count.textContent = `${shown.length}件`;
    empty.hidden = shown.length > 0;
    if(!campaigns.length){ notice.textContent="掲載候補はまだありません。公式要項を確認できた案件から追加します。"; notice.hidden=false; }
    else { notice.hidden=true; }
    for (const c of shown) {
      const card = e("article", "campaign" + (getDone(c.id) ? " is-done" : ""));
      const details = e("div", "details");
      const tags = e("div", "badges");
      tags.append(e("span", "tag", "LINE応募"), e("span", "tag", "購入不要"));
      if(c.age20) tags.append(e("span", "tag age", "20歳以上"));
      if(c.membersOnly) tags.append(e("span", "tag neutral", "会員限定"));
      details.append(tags, e("h3", "", c.title), e("p", "prize", c.prize));
      const facts = e("div", "facts");
      const deadline = e("span", "");
      deadline.append(e("b", "", "締切 "), document.createTextNode(readable.format(new Date(c.deadline))));
      const winners = e("span", "");
      winners.append(e("b", "", "当選 "), document.createTextNode(`${fmtNum(c.winners)}名`));
      facts.append(deadline,winners);
      details.append(facts, e("p", "notes", c.entry || ""));
      const actions = e("div", "actions");
      const link = e("a", "apply", "公式ページを見る ↗");
      link.href = c.officialUrl; link.target = "_blank"; link.rel="noopener noreferrer";
      const label = e("label", "done");
      const box = document.createElement("input"); box.type="checkbox"; box.checked=getDone(c.id); box.setAttribute("aria-label", `${c.title}に今日応募済み`);
      box.addEventListener("change", () => {setDone(c.id, box.checked); draw();});
      label.append(box,document.createTextNode("今日の応募済み"));
      actions.append(link,label);card.append(details,actions);list.append(card);
    }
  }
  const dates = campaigns.map(c=>c.verifiedAt).filter(Boolean).sort();
  document.getElementById("updated").textContent = dates.length ? `掲載情報の最終確認：${dates[dates.length-1]}` : "掲載情報の確認日：未確認";
  filter.addEventListener("change", draw);
  draw();
})();
