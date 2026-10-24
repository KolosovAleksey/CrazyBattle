// js/ui/modals.js — Уведомления, модальные окна, достижения.

Object.assign(UI, {
  // Карточка достижений в профиле (слот под статистикой): полученные first, затем неполученные.
  // Показывает столько, сколько влезает (остальное скрыто). Пока список пуст — пустые слоты.
  // всплывающее уведомление «Достижение получено» (в стиле Steam), стопка до 3 штук
  showAchToast(a) {
    let box = document.getElementById("ach-toasts");
    if (!box) {
      box = document.createElement("div");
      box.id = "ach-toasts";
      document.body.appendChild(box);
    }
    const el = document.createElement("div");
    el.className = `ach-toast r-${a.rarity || "common"}`;
    el.innerHTML = `<div class="ach-toast-ico"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="${a.icon}"/></svg></div>
      <div class="ach-toast-txt"><small>Достижение получено</small><b>${this.esc(a.name)}</b><span>${this.esc(a.desc || "")}</span></div>`;
    box.appendChild(el);
    while (box.children.length > 3) box.firstElementChild.remove();
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("in")));
    setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => el.remove(), 450);
    }, 4200);
  },

  toast(msg, type = "info") {
    const root = this.el("toast-root");
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.textContent = msg;
    root.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  },

  showDepositModal() {
    this.el("modal-root").innerHTML = `
      <div class="modal-backdrop" id="modal-bg">
        <div class="modal">
          <div class="modal-head">
            <b>Пополнение баланса</b>
            <button class="x" data-action="close-modal">✕</button>
          </div>
          <p class="muted">Демо-режим: деньги реально не списываются. Выберите сумму:</p>
          <div class="dep-grid">
            <button class="btn-ghost" data-action="deposit-amount" data-amount="200">Депчик <b>+200 ₽</b></button>
            <button class="btn-ghost" data-action="deposit-amount" data-amount="300">Додепчик <b>+300 ₽</b></button>
            <button class="btn-ghost" data-action="deposit-amount" data-amount="157">Ластдепчик <b>+157 ₽</b></button>
          </div>
        </div>
      </div>`;
    this.el("modal-bg").addEventListener("click", e => {
      if (e.target.id === "modal-bg") this.closeModal();
    });
  },

  // окно полной статистики (открывается по клику на карточку «Статистика»)
  showStatsModal(G) {
    this.el("modal-root").innerHTML = `
      <div class="modal-backdrop" id="modal-bg">
        <div class="modal modal-wide stats-modal">
          <div class="modal-head modal-brand">
            <img class="modal-logo" src="img/misc/logo.png" alt="">
            <b>Статистика аккаунта</b>
            <button class="x" data-action="close-modal">✕</button>
          </div>
          <div class="stats-body">${this.buildFullStatsHtml(G)}</div>
        </div>
      </div>`;
    this.el("modal-bg").addEventListener("click", e => {
      if (e.target.id === "modal-bg") this.closeModal();
    });
    if (!G.stats.statsOpened) { G.stats.statsOpened = true; G.save(); }
  },

  // окно всех достижений: сверху полученные, ниже неполученные, внутри групп — по сложности
  showAchModal(G) {
    const list = typeof ACHIEVEMENTS !== "undefined" ? ACHIEVEMENTS : [];
    const isDone = a => { try { return !!a.done(G); } catch (e) { return false; } };
    const got = list.filter(isDone).sort((a, b) => a.pct - b.pct);
    const locked = list.filter(a => !isDone(a)).sort((a, b) => a.pct - b.pct);
    const pct = list.length ? Math.round(got.length / list.length * 100) : 0;
    const row = (a, done) => `
      <div class="ach-row ${done ? "is-done" : "is-lock"} r-${a.rarity}">
        <div class="ach-ico"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="${a.icon}"/></svg></div>
        <div class="ach-txt"><b>${this.esc(a.name)}</b><small>${this.esc(a.desc)}</small></div>
        <div class="ach-meta"><span class="ach-diff">Сложность ${a.pct}%</span><em>${done ? "Получено" : "Не получено"}</em></div>
      </div>`;
    this.el("modal-root").innerHTML = `
      <div class="modal-backdrop" id="modal-bg">
        <div class="modal modal-wide ach-modal">
          <div class="modal-head modal-brand">
            <img class="modal-logo" src="img/misc/logo.png" alt="">
            <b>Достижения</b>
            <button class="x" data-action="close-modal">✕</button>
          </div>
          <div class="ach-prog">
            <span>Получено <b>${got.length}</b> из <b>${list.length}</b></span>
            <b class="ach-prog-pct">${pct}%</b>
          </div>
          <div class="pf-ach-bar ach-prog-bar"><i style="width:${pct}%"></i></div>
          <div class="ach-list">
            ${got.map(a => row(a, true)).join("")}
            ${locked.map(a => row(a, false)).join("")}
          </div>
        </div>
      </div>`;
    this.el("modal-bg").addEventListener("click", e => {
      if (e.target.id === "modal-bg") this.closeModal();
    });
  },

  closeModal() {
    this.el("modal-root").innerHTML = "";
  },
});
