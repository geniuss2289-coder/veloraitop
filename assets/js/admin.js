/* Velorai — Админ-панель: доступ Admin/Moder, привилегии, деньги, заказы */
(function () {
  "use strict";
  const V = window.Velorai;

  const gate = document.getElementById("adminGate");
  const denyMsg = document.getElementById("denyMsg");
  const panel = document.getElementById("adminPanel");
  let myRole = "member";
  let myNick = "";

  function deny(msg) {
    gate.hidden = false;
    panel.hidden = true;
    denyMsg.textContent = msg;
  }

  function boot() {
    const u = V.currentUser();
    if (!u) {
      deny("Панель доступна из аккаунта с привилегией Admin или Moder. Сначала войдите на сайт.");
      return;
    }
    if (u.role === "member") {
      deny(`Панель доступна только привилегиям Admin и Moder. Ваша привилегия — Member. Обратитесь к администратору.`);
      return;
    }
    myRole = u.role;
    myNick = u.nick;
    gate.hidden = true;
    panel.hidden = false;
    renderAccs();
    renderRequests();
  }

  /* ---------- Аккаунты: привилегии + деньги ---------- */
  function renderAccs() {
    const box = document.getElementById("accList");
    const accs = V.read(V.K.ACC, {});
    const canRoles = myRole === "admin";
    box.innerHTML = Object.values(accs).map((a) => {
      const role = V.ROLES[a.role] || V.ROLES.member;
      return `
      <div class="admin-row" data-nick="${a.nick}">
        <span class="avatar" style="width:34px;height:34px;font-size:14px">${a.nick[0]}</span>
        <div style="flex:1;min-width:150px">
          <div style="font-weight:600">${a.nick}</div>
          <div style="font-size:12.5px;color:var(--muted)">баланс: <b style="color:var(--accent)">${V.money(a.balance)}</b></div>
        </div>
        <span class="role-pill ${role.cls}">${role.label}</span>
        <select class="input" data-role ${canRoles ? "" : "disabled title=\"Выдаёт только Admin\""} style="max-width:130px;padding:9px 12px">
          <option value="member"${a.role === "member" ? " selected" : ""}>Member</option>
          <option value="moder"${a.role === "moder" ? " selected" : ""}>Moder</option>
          <option value="admin"${a.role === "admin" ? " selected" : ""}>Admin</option>
        </select>
        <input class="input" data-amount type="number" min="0.5" step="0.5" placeholder="Сумма, $" style="max-width:140px">
        <button class="btn btn-primary btn-sm" data-act="add">Начислить</button>
        <button class="btn btn-ghost btn-sm" data-act="sub">Списать</button>
      </div>`;
    }).join("");

    box.querySelectorAll(".admin-row").forEach((row) => {
      const nick = row.dataset.nick;
      const sel = row.querySelector("[data-role]");
      sel.addEventListener("change", () => {
        if (myRole !== "admin") return;
        if (nick === myNick) {
          V.toast("Свою привилегию менять нельзя", "err");
          renderAccs();
          return;
        }
        const accs = V.read(V.K.ACC, {});
        const a = accs[nick];
        if (!a) return;
        a.role = sel.value;
        V.write(V.K.ACC, accs);
        V.toast(`Привилегия ${a.nick} → ${V.ROLES[a.role].label}`);
        renderAccs();
      });

      row.addEventListener("click", (e) => {
        const act = e.target.closest("[data-act]")?.dataset.act;
        if (!act) return;
        const val = parseFloat(String(row.querySelector("[data-amount]").value).replace(",", "."));
        if (!val || val <= 0) { V.toast("Введите сумму больше 0", "err"); return; }
        const accs = V.read(V.K.ACC, {});
        const a = accs[nick];
        if (!a) return;
        if (act === "add") a.balance = Math.round((a.balance + val) * 100) / 100;
        else a.balance = Math.max(0, Math.round((a.balance - val) * 100) / 100);
        V.write(V.K.ACC, accs);
        V.toast(`${act === "add" ? "Зачислено" : "Списано"} ${V.money(val)} → ${a.nick}`);
        renderAccs();
      });
    });
  }

  /* ---------- Заказы (заявки на пополнение) ---------- */
  function renderRequests() {
    const box = document.getElementById("reqList");
    const list = V.read(V.K.REQ, []);
    const pending = list.filter((r) => r.status === "pending");
    document.getElementById("pendingCount").textContent = pending.length + " ожидают";

    if (!list.length) {
      box.innerHTML = `<div class="empty-state" style="padding:22px"><p>Заказов нет.</p></div>`;
      return;
    }
    const STATUS = { pending: ["Ожидает", "pending"], done: ["Выполнено ✓", "done"], rejected: ["Отклонён", "rejected"] };
    box.innerHTML = list.map((r) => {
      const st = STATUS[r.status];
      return `<div class="req-row" data-id="${r.id}">
        <span style="font-family:var(--font-mono);color:var(--muted)">${V.dateFmt(r.created)}</span>
        <span style="font-weight:600">${r.user}</span>
        <span class="req-sum">${V.money(r.amount)}</span>
        <span class="req-status ${st[1]}">${st[0]}</span>
        ${r.status === "pending" ? `<span style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" data-act="done">Выполнить</button>
          <button class="btn btn-ghost btn-sm" data-act="rejected" style="color:var(--danger)">Отклонить</button>
        </span>` : ""}
      </div>`;
    }).join("");

    box.querySelectorAll(".req-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        const act = e.target.closest("[data-act]")?.dataset.act;
        if (!act) return;
        const id = row.dataset.id;
        const list = V.read(V.K.REQ, []);
        const req = list.find((r) => r.id === id);
        if (!req) return;
        if (act === "done") {
          const accs = V.read(V.K.ACC, {});
          const acc = Object.values(accs).find((a) => a.nick === req.user);
          if (acc) acc.balance = Math.round((acc.balance + req.amount) * 100) / 100;
          V.write(V.K.ACC, accs);
          V.toast(`${V.money(req.amount)} зачислено на аккаунт ${req.user}`);
        } else {
          V.toast("Заказ отклонён");
        }
        req.status = act;
        V.write(V.K.REQ, list);
        renderRequests();
        renderAccs();
      });
    });
  }

  boot();
})();
