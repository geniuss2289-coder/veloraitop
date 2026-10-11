/* ============================================================
   Velorai — shared logic: state, auth, theme, transitions,
   toasts, copy, top-up flow
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Storage helpers ---------- */
  const K = {
    ACC: "velorai_accounts",
    SES: "velorai_session",
    KEYS: "velorai_apikeys",
    REQ: "velorai_topups",
    THEME: "velorai_theme",
  };

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }
  function write(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  function ensureSeed() {
    let changed = false;
    let accs = read(K.ACC, null);
    if (!accs) {
      accs = {
        ousyt: { nick: "ousyt", password: "Agver542!", balance: 10.0, role: "admin", created: Date.now() },
      };
      changed = true;
    } else {
      for (const id of Object.keys(accs)) {
        if (!accs[id].role) { accs[id].role = id === "ousyt" ? "admin" : "member"; changed = true; }
      }
    }
    if (changed) write(K.ACC, accs);
    if (!read(K.REQ, null)) write(K.REQ, []);
    if (!read(K.KEYS, null)) write(K.KEYS, []);
  }

  /* ---------- Accounts / session ---------- */
  function currentUser() {
    ensureSeed();
    const id = localStorage.getItem(K.SES);
    if (!id) return null;
    const accs = read(K.ACC, {});
    return accs[id] ? { ...accs[id], id } : null;
  }

  function saveUser(user) {
    const accs = read(K.ACC, {});
    accs[user.id] = { nick: user.nick, password: user.password, balance: user.balance, created: user.created };
    write(K.ACC, accs);
  }

  function doLogin(nick, pass) {
    ensureSeed();
    const id = String(nick || "").trim().toLowerCase();
    const accs = read(K.ACC, {});
    const acc = accs[id];
    if (!acc || acc.password !== pass) return false;
    localStorage.setItem(K.SES, id);
    return true;
  }

  function logout() {
    localStorage.removeItem(K.SES);
    document.documentElement.classList.add("leaving");
    setTimeout(() => (location.href = "index.html"), 200);
  }

  function requireAuth() {
    if (!currentUser()) location.replace("index.html");
  }

  /* ---------- Roles ---------- */
  const ROLES = {
    admin: { label: "Admin", cls: "role-admin" },
    moder: { label: "Moder", cls: "role-moder" },
    member: { label: "Member", cls: "role-member" },
  };

  /* ---------- Encryption (AES-GCM, passphrase-derived key) ---------- */
  const VAULT_PASS = "Velorai::Vault::2026::parvus1917";
  const subtle = (window.crypto && window.crypto.subtle) ? window.crypto.subtle : null;
  let vaultKeyPromise = null;

  function vaultKey() {
    if (!vaultKeyPromise) {
      vaultKeyPromise = subtle
        .importKey("raw", new TextEncoder().encode(VAULT_PASS), "PBKDF2", false, ["deriveKey"])
        .then((km) =>
          subtle.deriveKey(
            { name: "PBKDF2", salt: new TextEncoder().encode("velorai-salt-v1"), iterations: 60000, hash: "SHA-256" },
            km, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
          ));
    }
    return vaultKeyPromise;
  }

  async function seal(obj) {
    const json = JSON.stringify(obj);
    if (!subtle) return btoa(unescape(encodeURIComponent(json))); /* fallback без шифрования */
    const key = await vaultKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(json)));
    const out = new Uint8Array(12 + ct.length);
    out.set(iv); out.set(ct, 12);
    let bin = "";
    for (let i = 0; i < out.length; i++) bin += String.fromCharCode(out[i]);
    return btoa(bin);
  }

  async function unseal(b64) {
    if (!subtle) return JSON.parse(decodeURIComponent(escape(atob(b64))));
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const key = await vaultKey();
    const pt = await subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12));
    return JSON.parse(new TextDecoder().decode(pt));
  }

  /* Загрузка зашифрованных аккаунтов с сервера (файл accounts.dat в корне проекта) */
  let syncPromise = null;
  function syncAccounts() {
    if (!/^https?:$/.test(location.protocol)) return Promise.resolve();
    if (syncPromise) return syncPromise;
    syncPromise = (async () => {
      try {
        const r = await fetch("/api/accounts", { cache: "no-store" });
        if (!r.ok) return;
        const lines = (await r.text()).split(/\r?\n/).filter(Boolean);
        const accs = read(K.ACC, {});
        let changed = false;
        for (const line of lines) {
          try {
            const rec = await unseal(line);
            const id = String(rec.nick).toLowerCase();
            if (!accs[id]) { accs[id] = rec; changed = true; }
          } catch { /* битая строка — пропускаем */ }
        }
        if (changed) write(K.ACC, accs);
      } catch { /* сервера нет — работаем на localStorage */ }
    })();
    return syncPromise;
  }

  /* Регистрация: пароль проверяется, запись шифруется и уходит в файл проекта */
  async function register(nick, pass, pass2) {
    ensureSeed();
    const id = String(nick || "").trim().toLowerCase().replace(/\s+/g, "");
    if (!id || id.length < 3) return { ok: false, msg: "Никнейм — минимум 3 символа (без пробелов)" };
    if (!pass || pass.length < 6) return { ok: false, msg: "Пароль — минимум 6 символов" };
    if (pass !== pass2) return { ok: false, msg: "Пароли не совпадают" };
    const accs = read(K.ACC, {});
    if (accs[id]) return { ok: false, msg: "Этот никнейм уже занят" };
    const rec = { nick: id, password: pass, balance: 0, role: "member", created: Date.now() };
    accs[id] = rec;
    write(K.ACC, accs);
    let saved = false;
    try {
      const sealed = await seal(rec);
      const r = await fetch("/api/accounts/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record: sealed }),
      });
      saved = r.ok;
    } catch { saved = false; }
    localStorage.setItem(K.SES, id);
    return { ok: true, saved };
  }

  /* ---------- Money / formatting ---------- */
  function money(n) {
    return "$" + Number(n).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function intFmt(n) { return Math.round(Number(n)).toLocaleString("ru-RU"); }
  function dateFmt(ts) {
    return new Date(ts).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  /* Animated counter for stat values */
  function countUp(el, target, format) {
    format = format || intFmt;
    const dur = 900, t0 = performance.now();
    function frame(t) {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = format(target * eased);
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- Toast ---------- */
  let toastBox;
  function toast(msg, type) {
    if (!toastBox) {
      toastBox = document.createElement("div");
      toastBox.className = "toast-container";
      document.body.appendChild(toastBox);
    }
    const t = document.createElement("div");
    t.className = "toast " + (type || "ok");
    t.textContent = msg;
    toastBox.appendChild(t);
    setTimeout(() => {
      t.classList.add("hide");
      setTimeout(() => t.remove(), 260);
    }, 2600);
  }

  /* ---------- Copy ---------- */
  async function copyText(text, silent) {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        ta.remove();
      } catch { ok = false; }
    }
    if (!silent) toast(ok ? "Скопировано в буфер обмена" : "Не удалось скопировать", ok ? "ok" : "err");
    return ok;
  }

  /* Bind all [data-copy] buttons on the page */
  function bindCopyButtons() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-copy]");
      if (btn) copyText(btn.getAttribute("data-copy"));
    });
  }

  /* ---------- Theme ---------- */
  function applyTheme(t) { document.documentElement.setAttribute("data-theme", t); }
  function initTheme() { applyTheme(localStorage.getItem(K.THEME) || "dark"); }

  function bindThemeToggle() {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;
    btn.addEventListener("click", (e) => {
      const cur = document.documentElement.getAttribute("data-theme");
      const next = cur === "dark" ? "light" : "dark";
      localStorage.setItem(K.THEME, next);
      const doSwap = () => applyTheme(next);
      if (document.startViewTransition) {
        const x = e.clientX || innerWidth - 40;
        const y = e.clientY || 40;
        const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        document.documentElement.classList.add("theme-morph");
        const vt = document.startViewTransition(doSwap);
        vt.ready.then(() => {
          document.documentElement.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
            { duration: 480, easing: "ease-in-out", pseudoElement: "::view-transition-new(root)" }
          );
        }).finally(() => document.documentElement.classList.remove("theme-morph"));
      } else {
        doSwap();
      }
    });
  }

  /* ---------- Page transitions (multi-page fallback for non-Chromium) ---------- */
  function bindNavTransitions() {
    document.addEventListener("click", (e) => {
      const a = e.target.closest("a[data-nav]");
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === "_blank") return;
      e.preventDefault();
      document.documentElement.classList.add("leaving");
      setTimeout(() => { location.href = a.href; }, 190);
    });
    addEventListener("pageshow", (ev) => {
      if (ev.persisted) document.documentElement.classList.remove("leaving");
    });
  }

  /* Stagger .rise elements on load */
  function runEnterAnimations() {
    document.querySelectorAll(".rise").forEach((el, i) => {
      el.style.setProperty("--d", i * 70 + "ms");
    });
  }

  /* ---------- Header bindings ---------- */
  function bindHeader() {
    bindThemeToggle();
    bindCopyButtons();
    const out = document.getElementById("logoutBtn");
    if (out) out.addEventListener("click", logout);
  }

  /* ---------- Shared top-up flow (modal -> заявка -> Telegram) ---------- */
  const TG_ADMIN = "https://t.me/parvus1917";

  function topupMessage(amount) {
    const u = currentUser();
    return `Привет! Хочу пополнить баланс Velorai на ${money(amount)}. Ник: ${u ? u.nick : "—"}`;
  }

  function createTopupRequest(amount) {
    ensureSeed();
    const u = currentUser();
    const list = read(K.REQ, []);
    list.unshift({
      id: "rq_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      user: u ? u.nick : "—",
      amount: amount,
      status: "pending",
      created: Date.now(),
    });
    write(K.REQ, list);
  }

  function openTopupModal(onDone) {
    const bd = document.createElement("div");
    bd.className = "modal-backdrop";
    bd.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3>Пополнение баланса</h3>
        <p class="modal-sub">Укажите сумму — администратор зачислит её на ваш баланс. Оплата подтверждается в Telegram.</p>
        <div class="field">
          <label for="topupAmount">Сумма, $</label>
          <div class="amount-row">
            <input class="input" id="topupAmount" type="number" min="1" step="0.5" placeholder="Например, 25" autofocus>
          </div>
          <div class="quick-chips">
            <button type="button" class="chip-btn" data-set="5">$5</button>
            <button type="button" class="chip-btn" data-set="10">$10</button>
            <button type="button" class="chip-btn" data-set="25">$25</button>
            <button type="button" class="chip-btn" data-set="50">$50</button>
            <button type="button" class="chip-btn" data-set="100">$100</button>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-close>Отмена</button>
          <button type="button" class="btn btn-primary" id="topupGo">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/></svg>
            Пополнить
          </button>
        </div>
      </div>`;
    document.body.appendChild(bd);

    const input = bd.querySelector("#topupAmount");
    input.focus();

    bd.querySelectorAll("[data-set]").forEach((c) =>
      c.addEventListener("click", () => { input.value = c.dataset.set; })
    );

    function close() {
      bd.classList.add("closing");
      setTimeout(() => bd.remove(), 170);
    }
    bd.addEventListener("click", (e) => { if (e.target === bd) close(); });
    bd.querySelector("[data-close]").addEventListener("click", close);
    bd.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

    function submit() {
      const amount = parseFloat(String(input.value).replace(",", "."));
      if (!amount || amount <= 0) {
        input.style.borderColor = "var(--danger)";
        input.focus();
        toast("Введите сумму больше 0", "err");
        return;
      }
      close();
      createTopupRequest(amount);
      toast("Заявка на пополнение создана");
      if (onDone) onDone();
      window.open(TG_ADMIN + "?text=" + encodeURIComponent(topupMessage(amount)), "_blank", "noopener");
    }
    bd.querySelector("#topupGo").addEventListener("click", submit);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  }

  /* ---------- Boot on every page ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    bindNavTransitions();
    runEnterAnimations();
    bindHeader();

    const page = document.body.dataset.page || "";
    if (page !== "login" && document.body.hasAttribute("data-guard")) requireAuth();

    syncAccounts();

    /* Fill user chip: avatar-cube flips on hover and shows the role */
    const chipNick = document.querySelector(".user-chip .user-nick");
    const chip = document.querySelector(".user-chip");
    const u = currentUser();
    if (u && chip) {
      if (chipNick) chipNick.textContent = u.nick;
      const front = chip.querySelector(".cube-front");
      const back = chip.querySelector(".cube-back");
      const role = ROLES[u.role] || ROLES.member;
      if (front) front.textContent = u.nick[0];
      if (back) {
        back.textContent = role.label;
        back.classList.remove("role-admin", "role-moder", "role-member");
        back.classList.add(role.cls);
      }
      chip.title = "Привилегия: " + role.label;
    }

    /* Admin panel button only for Admin / Moder */
    const adminBtn = document.getElementById("adminPanelBtn");
    if (adminBtn && u && (u.role === "admin" || u.role === "moder")) adminBtn.hidden = false;

    /* Greeting on the overview page */
    const greet = document.getElementById("greetNick");
    if (greet && u) greet.textContent = u.nick;
  });

  /* expose */
  window.Velorai = {
    K, read, write, ensureSeed,
    currentUser, saveUser, doLogin, logout, requireAuth,
    money, intFmt, dateFmt, countUp,
    toast, copyText, bindCopyButtons,
    openTopupModal, createTopupRequest, topupMessage,
    TG_ADMIN, ROLES,
    seal, unseal, syncAccounts, register,
  };
})();
