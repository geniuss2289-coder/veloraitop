/* Velorai — Обзор: баланс, статистика, график трат, заявки */
(function () {
  "use strict";
  const V = window.Velorai;

  /* Deterministic daily spend for the last 30 days (LCG, fixed seed) */
  function dailySpend(n) {
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const days = [];
    for (let i = n - 1; i >= 0; i--) {
      const wave = 1.6 + Math.sin((n - i) / 3.1) * 1.1 + Math.sin((n - i) / 9) * 0.7;
      const v = Math.max(0.25, wave * (0.75 + rnd() * 0.5) * 2);
      days.push({ ts: Date.now() - i * 864e5, value: v });
    }
    return days;
  }

  const data = dailySpend(30);
  const spend30 = data.reduce((s, d) => s + d.value, 0);

  /* ---------- Balance & stats ---------- */
  function render() {
    const u = V.currentUser() || { balance: 0 };
    const bv = document.getElementById("balanceValue");
    if (bv) bv.textContent = V.money(u.balance);

    V.countUp(document.getElementById("statRequests"), 14208);
    V.countUp(document.getElementById("statSpend30"), spend30, (x) => V.money(x));
    V.countUp(document.getElementById("statLatency"), 0.84, (x) => x.toFixed(2));
    V.countUp(document.getElementById("statAvailable"), u.balance, (x) => V.money(x));
  }
  render();

  /* ---------- Top-up button ---------- */
  document.getElementById("topupBtn").addEventListener("click", () => {
    V.openTopupModal(renderRequests);
  });

  /* ---------- Requests list ---------- */
  function renderRequests() {
    const box = document.getElementById("reqList");
    if (!box) return;
    const all = V.read(V.K.REQ, []);
    const mine = all.filter((r) => r.user === (V.currentUser() || { nick: "" }).nick);
    if (!mine.length) {
      box.innerHTML = `<div class="empty-state" style="padding:22px">
        <p>Заявок пока нет — нажмите «Пополнить», и заявка появится здесь.</p>
      </div>`;
      return;
    }
    const STATUS = { pending: ["Ожидает подтверждения", "pending"], done: ["Выполнено ✓", "done"], rejected: ["Отклонена", "rejected"] };
    box.innerHTML = mine.slice(0, 6).map((r) => {
      const st = STATUS[r.status] || STATUS.pending;
      return `<div class="req-row">
        <span style="font-family:var(--font-mono);color:var(--muted)">${V.dateFmt(r.created)}</span>
        <span class="req-sum">${V.money(r.amount)}</span>
        <span class="req-status ${st[1]}">${st[0]}</span>
      </div>`;
    }).join("");
  }
  renderRequests();
  window.addEventListener("storage", renderRequests);

  /* ---------- Chart ---------- */
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.getElementById("chartSvg");
  const tip = document.getElementById("chartTip");
  const wrap = document.getElementById("chartWrap");
  const W = 660, H = 200, M = { top: 14, right: 6, bottom: 22, left: 44 };
  const maxV = Math.max(...data.map((d) => d.value));
  const yMax = Math.ceil(maxV / 2) * 2;

  const defs = document.createElementNS(NS, "defs");
  defs.innerHTML = `<linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="var(--accent)"/>
    <stop offset="1" stop-color="var(--accent-2)"/>
  </linearGradient>`;
  svg.appendChild(defs);

  /* grid lines + $ labels */
  [0, yMax / 2, yMax].forEach((v, i) => {
    const y = H - M.bottom - (v / yMax) * (H - M.top - M.bottom);
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", M.left); line.setAttribute("x2", W - M.right);
    line.setAttribute("y1", y); line.setAttribute("y2", y);
    line.setAttribute("class", "chart-grid-line");
    svg.appendChild(line);
    const lbl = document.createElementNS(NS, "text");
    lbl.setAttribute("x", M.left - 8); lbl.setAttribute("y", y + 4);
    lbl.setAttribute("text-anchor", "end"); lbl.setAttribute("class", "chart-label");
    lbl.textContent = "$" + v.toFixed(v % 1 ? 2 : 0);
    svg.appendChild(lbl);
  });

  /* month labels */
  ["30 дн. назад", "", "", "", "сегодня"].forEach((t, i) => {
    if (!t) return;
    const lbl = document.createElementNS(NS, "text");
    lbl.setAttribute("x", M.left + i * ((W - M.left - M.right) / 4));
    lbl.setAttribute("y", H - 6);
    lbl.setAttribute("text-anchor", i === 0 ? "start" : i === 4 ? "end" : "middle");
    lbl.setAttribute("class", "chart-label");
    lbl.textContent = t;
    svg.appendChild(lbl);
  });

  const plotW = W - M.left - M.right;
  const slot = plotW / data.length;
  const barW = Math.min(14, slot * 0.62);

  data.forEach((d, i) => {
    const h = (d.value / yMax) * (H - M.top - M.bottom);
    const x = M.left + i * slot + (slot - barW) / 2;
    const y = H - M.bottom - h;
    const r = document.createElementNS(NS, "rect");
    r.setAttribute("class", "chart-bar");
    r.setAttribute("x", x); r.setAttribute("y", y);
    r.setAttribute("width", barW); r.setAttribute("height", h);
    r.setAttribute("rx", Math.min(5, barW / 2));
    r.style.animationDelay = 300 + i * 28 + "ms";
    r.addEventListener("mouseenter", () => {
      const dt = new Date(d.ts).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
      tip.innerHTML = `${dt} · <b>${V.money(d.value)}</b>`;
      tip.hidden = false;
      const wr = wrap.getBoundingClientRect();
      tip.style.left = (x + barW / 2) / W * wr.width + "px";
      tip.style.top = (y / H) * wr.height + "px";
    });
    r.addEventListener("mouseleave", () => { tip.hidden = true; });
    svg.appendChild(r);
  });
})();
