/* Velorai — Рефералы: ссылка, статистика, пополнение через Telegram */
(function () {
  "use strict";
  const V = window.Velorai;

  /* Count-up реферальной статистики */
  V.countUp(document.getElementById("refInvited"), 4);
  V.countUp(document.getElementById("refTopups"), 11);
  V.countUp(document.getElementById("refEarned"), 23.18, (x) => V.money(x));

  /* Быстрые суммы */
  const amountInput = document.getElementById("refAmount");
  document.querySelectorAll(".chip-btn[data-set]").forEach((c) =>
    c.addEventListener("click", () => {
      amountInput.value = c.dataset.set;
      amountInput.focus();
    })
  );

  /* Пополнить: заявка + подготовленное сообщение в Telegram */
  document.getElementById("refTopupBtn").addEventListener("click", () => {
    const amount = parseFloat(String(amountInput.value).replace(",", "."));
    if (!amount || amount <= 0) {
      amountInput.style.borderColor = "var(--danger)";
      amountInput.focus();
      V.toast("Введите сумму больше 0", "err");
      return;
    }
    amountInput.style.borderColor = "";
    V.createTopupRequest(amount);
    V.toast("Заявка создана — завершите отправку в Telegram");
    const msg = `Привет! Хочу пополнить баланс Velorai на ${V.money(amount)}. Ник: ${V.currentUser().nick}`;
    window.open(V.TG_ADMIN + "?text=" + encodeURIComponent(msg), "_blank", "noopener");
  });
})();
