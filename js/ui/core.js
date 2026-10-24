// js/ui/core.js — Отрисовка: базовые утилиты, общие элементы, переключение экранов.

const UI = {
  invFilter: "all",

  upFilter: { sort: "price-desc", min: "", max: "", q: "", auto: false }, // "all" | "new" — фильтр инвентаря в профиле

  promoEnd: 0, // конец таймера промо-баннера

  el(id) { return document.getElementById(id); },

  fmt(n) {
    return Math.round(n).toLocaleString("ru-RU");
  },

  esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  },

  rc(rarity) {
    return RARITY_META[rarity]?.color || "#777";
  },

  fillSlider(sl) {
    const max = +sl.max || 1;
    sl.style.setProperty("--p", `${Math.min(100, (+sl.value / max) * 100)}%`);
  },

  init() {
    this.el("case-search").addEventListener("input", () => this.renderHome(Game));
    this.el("case-sort").addEventListener("change", () => this.renderHome(Game));
    this.el("case-cat").addEventListener("change", () => this.renderHome(Game));
    ["up-f-sort", "up-f-min", "up-f-max", "up-f-q"].forEach(id => {
      this.el(id).addEventListener("input", () => {
        this.upFilter = {
          sort: this.el("up-f-sort").value,
          min: this.el("up-f-min").value,
          max: this.el("up-f-max").value,
          q: this.el("up-f-q").value.trim().toLowerCase(),
          auto: false,          // ручной ввод цены отключает автоподбор диапазона
        };
        this.renderTargetList(Game);
      });
    });

    this.promoEnd = Date.now() + (15 * 60 + 40) * 1000;
    this.tickPromoTimer();
    setInterval(() => this.tickPromoTimer(), 1000);
  },

  tickPromoTimer() {
    if (!this.el("promo-timer")) return;   // баннер убран с главной: таймера нет
    let left = Math.round((this.promoEnd - Date.now()) / 1000);
    if (left <= 0) {
      this.promoEnd = Date.now() + (15 * 60 + 40) * 1000;
      left = 15 * 60 + 40;
    }
    const h = Math.floor(left / 3600);
    const m = Math.floor((left % 3600) / 60);
    const s = left % 60;
    this.el("promo-timer").textContent = [h, m, s].map(n => String(n).padStart(2, "0")).join(":");
  },

  updateBalance(v) {
    this.el("balance").textContent = this.fmt(v);
  },

  updateProfileChip(name, avatar) {
    this.el("profile-name").textContent = name;
    this.el("avatar-letter").innerHTML = this.avatarHtml(name, avatar);
  },

  showView(route) {
    document.querySelectorAll(".view").forEach(v => {
      v.classList.toggle("active", v.id === `view-${route}`);
    });
    window.scrollTo(0, 0);
  },

  setActiveTab(route) {
    document.querySelectorAll(".nav-tab").forEach(t => {
      t.classList.toggle("active", t.dataset.route === route);
    });
  },
};
