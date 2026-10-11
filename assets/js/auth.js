/* Velorai — вход и регистрация */
(function () {
  "use strict";
  const V = window.Velorai;

  if (V.currentUser()) location.replace("overview.html");

  const tabs = document.getElementById("authTabs");
  const card = document.getElementById("authCard");
  const title = document.getElementById("authTitle");
  const sub = document.getElementById("authSub");
  const errBox = document.getElementById("errorBox");
  const errText = document.getElementById("errText");
  const nick = document.getElementById("nick");
  const pass = document.getElementById("pass");
  const regNick = document.getElementById("regNick");
  const regPass = document.getElementById("regPass");
  const regPass2 = document.getElementById("regPass2");
  const loginBtn = document.getElementById("loginBtn");
  const regBtn = document.getElementById("regBtn");
  const form = document.getElementById("authCard");

  function showErr(msg) {
    errText.textContent = msg;
    errBox.classList.remove("show");
    void errBox.offsetWidth;
    errBox.classList.add("show");
  }

  /* Переключение Вход / Регистрация */
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest(".auth-tab");
    if (!b) return;
    tabs.querySelectorAll(".auth-tab").forEach((t) => t.classList.toggle("active", t === b));
    const reg = b.dataset.view === "reg";
    card.classList.toggle("reg-mode", reg);
    if (reg) {
      title.textContent = "Создание аккаунта";
      sub.textContent = "Аккаунт получит привилегию Member";
      regNick.focus();
    } else {
      title.textContent = "Вход в аккаунт";
      sub.textContent = "Введите ваши данные, чтобы продолжить";
      nick.focus();
    }
  });

  /* Вход */
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    loginBtn.innerHTML = '<span class="spinner"></span> Входим...';
    V.syncAccounts().finally(() => {
      setTimeout(() => {
        if (V.doLogin(nick.value, pass.value)) {
          loginBtn.textContent = "Готово ✓";
          V.toast("Добро пожаловать!", "ok");
          document.documentElement.classList.add("leaving");
          setTimeout(() => (location.href = "overview.html"), 350);
        } else {
          loginBtn.textContent = "Войти";
          showErr("Неправильный никнейм или пароль");
        }
      }, 450);
    });
  });

  /* Регистрация */
  regBtn.addEventListener("click", async () => {
    regBtn.innerHTML = '<span class="spinner"></span> Создаём...';
    const res = await V.register(regNick.value, regPass.value, regPass2.value);
    if (res.ok) {
      regBtn.textContent = "Аккаунт создан ✓";
      V.toast(res.saved ? "Аккаунт создан и сохранён в зашифрованный файл" : "Аккаунт создан (сервер недоступен — сохранено локально)", "ok");
      document.documentElement.classList.add("leaving");
      setTimeout(() => (location.href = "overview.html"), 600);
    } else {
      regBtn.textContent = "Создать аккаунт";
      showErr(res.msg);
    }
  });
})();
