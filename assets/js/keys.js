/* Velorai — API-ключи: создание, копирование, закрытие/открытие */
(function () {
  "use strict";
  const V = window.Velorai;

  function genKey() {
    const abc = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const bytes = new Uint8Array(28);
    crypto.getRandomValues(bytes);
    return "vrai_" + Array.from(bytes, (b) => abc[b % abc.length]).join("");
  }

  function maskKey(key) { return key.slice(0, 10) + "••••••••••" + key.slice(-4); }

  function render() {
    const list = document.getElementById("keyList");
    const keys = V.read(V.K.KEYS, []);

    if (!keys.length) {
      list.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8Zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
          <p>Ключей пока нет. Создайте первый, чтобы вызывать модель через API.</p>
          <button class="btn btn-ghost" id="emptyCreate">Создать ключ</button>
        </div>`;
      list.querySelector("#emptyCreate").addEventListener("click", openCreateModal);
      return;
    }

    list.innerHTML = keys.map((k) => `
      <div class="key-row ${k.active ? "" : "closed"}" data-id="${k.id}">
        <div class="key-info">
          <div class="key-name">
            <span class="status-dot ${k.active ? "" : "off"}"></span>
            ${escapeHtml(k.name)}
            <span class="badge" style="font-size:11px">${k.active ? "активен" : "закрыт"}</span>
          </div>
          <div class="key-value" data-reveal hidden>${k.key}</div>
          <div class="key-value">${maskKey(k.key)}</div>
          <div class="key-meta">создан ${V.dateFmt(k.created)}</div>
        </div>
        <div class="key-actions">
          <button class="btn btn-ghost btn-sm" data-act="reveal">Показать</button>
          <button class="btn btn-ghost btn-sm" data-act="copy">Копировать</button>
          <button class="btn ${k.active ? "btn-danger" : "btn-ghost"} btn-sm" data-act="toggle">${k.active ? "Закрыть" : "Открыть"}</button>
          <button class="btn btn-ghost btn-sm" data-act="delete" style="color:var(--danger)">Удалить</button>
        </div>
      </div>`).join("");

    list.querySelectorAll(".key-row").forEach((row) => {
      const id = row.dataset.id;
      const key = keys.find((k) => k.id === id);
      row.addEventListener("click", (e) => {
        const act = e.target.closest("[data-act]")?.dataset.act;
        if (!act) return;
        if (act === "reveal") {
          const full = row.querySelector("[data-reveal]");
          const masked = row.querySelector(".key-value:not([data-reveal])");
          const showing = !full.hidden;
          full.hidden = showing;
          masked.hidden = !showing;
          e.target.textContent = showing ? "Показать" : "Скрыть";
        }
        if (act === "copy") V.copyText(key.key);
        if (act === "toggle") {
          const accs = V.read(V.K.KEYS, []).map((k) =>
            k.id === id ? { ...k, active: !k.active } : k
          );
          V.write(V.K.KEYS, accs);
          V.toast(key.active ? "Ключ закрыт — запросы с ним перестанут проходить" : "Ключ снова активен");
          render();
        }
        if (act === "delete") {
          V.write(V.K.KEYS, V.read(V.K.KEYS, []).filter((k) => k.id !== id));
          V.toast("Ключ удалён");
          render();
        }
      });
    });
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ---------- Create modal ---------- */
  function openCreateModal() {
    const bd = document.createElement("div");
    bd.className = "modal-backdrop";
    bd.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3>Новый API-ключ</h3>
        <p class="modal-sub">Дайте ключу понятное имя — например, «бот» или «чат-приложение».</p>
        <div class="field">
          <label for="keyName">Название</label>
          <input class="input" id="keyName" placeholder="Мой проект" maxlength="40" autofocus>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-close>Отмена</button>
          <button type="button" class="btn btn-primary" id="keyCreate">Создать</button>
        </div>
      </div>`;
    document.body.appendChild(bd);
    const input = bd.querySelector("#keyName");
    input.focus();

    function close() { bd.classList.add("closing"); setTimeout(() => bd.remove(), 170); }
    bd.addEventListener("click", (e) => { if (e.target === bd) close(); });
    bd.querySelector("[data-close]").addEventListener("click", close);
    bd.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

    function submit() {
      const name = input.value.trim() || "Мой ключ";
      const keys = V.read(V.K.KEYS, []);
      keys.unshift({
        id: "key_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        name, key: genKey(), active: true, created: Date.now(),
      });
      V.write(V.K.KEYS, keys);
      close();
      V.toast("API-ключ создан — не забудьте его скопировать");
      render();
    }
    bd.querySelector("#keyCreate").addEventListener("click", submit);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  }

  document.getElementById("createKeyBtn").addEventListener("click", openCreateModal);
  render();
})();
