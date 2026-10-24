// js/admin/core.js — каркас админ-панели (admin.html): вход, запросы к серверу,
// маршрутизация по адресу (#overview, #players, #player/<id>/<раздел>, #log), окна и уведомления.
//
// Разделы (каждый — отдельный файл, объект с методом render(view, params, alive)):
//   overview.js — сводка и регистрации за 14 дней
//   players.js  — список игроков: поиск, сортировка, страницы
//   editor.js   — карточка игрока: общее, баланс, инвентарь, КС, статистика, достижения, операция, JSON
//   log.js      — журнал действий администраторов
//
// Доступ: только роль admin. Все запросы идут на /api/admin/* (см. server.py).

const ADM_TOKEN_KEY = "cb_token";   // тот же ключ, что у игры: вход общий для браузера

const Admin = {
  me: null,        // {nick, role} вошедшего администратора
  token: null,
  navId: 0,        // номер последней навигации; устаревшие асинхронные отрисовки отбрасываются

  // ----- вспомогательное -----
  el(id) { return document.getElementById(id); },

  esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  },

  fmt(n) { return Math.round(+n || 0).toLocaleString("ru-RU"); },
  rub(n) { return this.fmt(n) + " ₽"; },

  // дата: ms — из сохранения игры (миллисекунды), sec — из базы (секунды)
  date(ms) {
    if (!ms) return "—";
    return new Date(ms).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  },
  dateSec(sec) { return this.date(sec ? sec * 1000 : 0); },

  agoSec(sec) {
    if (!sec) return "никогда";
    const s = Math.max(0, Date.now() / 1000 - sec);
    if (s < 60) return "только что";
    if (s < 3600) return Math.floor(s / 60) + " мин назад";
    if (s < 86400) return Math.floor(s / 3600) + " ч назад";
    return Math.floor(s / 86400) + " дн назад";
  },

  rarityHtml(r) {
    const m = RARITY_META[r];
    return m ? `<span class="adm-rarity" style="color:${m.color}">${this.esc(m.label)}</span>` : this.esc(r || "—");
  },

  // Пагинация: кнопки «назад/вперёд» и номер страницы. Клики обрабатывает вызывающий код (data-page).
  pagerHtml(total, page, per) {
    const pages = Math.max(1, Math.ceil(total / per));
    const from = total ? (page - 1) * per + 1 : 0;
    const to = Math.min(total, page * per);
    return `<div class="adm-pager">
      <span>Показано ${from}–${to} из ${this.fmt(total)}</span>
      <div class="adm-row">
        <button class="btn-outline adm-btn-sm" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>‹ Назад</button>
        <span>Стр. ${page} / ${pages}</span>
        <button class="btn-outline adm-btn-sm" data-page="${page + 1}" ${page >= pages ? "disabled" : ""}>Вперёд ›</button>
      </div>
    </div>`;
  },

  toast(text, kind = "") {
    const box = this.el("adm-toasts");
    const t = document.createElement("div");
    t.className = "adm-toast " + kind;
    t.textContent = text;
    box.appendChild(t);
    setTimeout(() => t.remove(), 3800);
  },

  // ----- запросы -----
  async api(method, path, body, headers = {}) {
    const opts = { method, headers: { ...headers } };
    if (this.token) {
      opts.headers["Authorization"] = "Bearer " + this.token;
      opts.headers["X-CB-Token"] = this.token;
    }
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    let r;
    try {
      r = await fetch(path, opts);
    } catch (e) {
      return { status: 0, ok: false, data: { error: "Нет связи с сервером" } };
    }
    let data = null;
    try { data = await r.json(); } catch (e) { data = null; }
    const res = { status: r.status, ok: r.ok, data };
    if (r.status === 401 && this.token) this.sessionLost("Сессия истекла. Войдите снова.");
    return res;
  },

  // текст ошибки из ответа сервера
  errText(r) {
    if (r.data && r.data.error) return r.data.error;
    return `Ошибка запроса (код ${r.status})`;
  },

  // ----- окна подтверждения и ввода -----
  // fields: [{label, value, type, placeholder, match}]; match — текст, который надо ввести точно.
  // Возвращает Promise: массив значений полей, true (без полей) или null (отмена).
  dialog({ title, text = "", fields = [], confirmText = "Подтвердить", danger = false }) {
    return new Promise(resolve => {
      const modal = this.el("adm-modal");
      const box = this.el("adm-modal-box");
      box.innerHTML = `
        <h3>${this.esc(title)}</h3>
        ${text ? `<p>${text}</p>` : ""}
        ${fields.map((f, i) => `
          <label class="adm-field">${this.esc(f.label)}
            <input class="adm-input wide" data-i="${i}" type="${f.type || "text"}" autocomplete="off"
              value="${this.esc(f.value ?? "")}" placeholder="${this.esc(f.placeholder || "")}">
          </label>`).join("")}
        <div class="adm-error" data-err></div>
        <div class="adm-modal-actions">
          <button class="btn-outline" type="button" data-cancel>Отмена</button>
          <button class="${danger ? "btn-outline adm-btn-danger" : "btn"}" type="button" data-ok>${this.esc(confirmText)}</button>
        </div>`;
      modal.classList.remove("hidden");
      const inputs = [...box.querySelectorAll("input")];
      if (inputs[0]) setTimeout(() => inputs[0].focus(), 0);

      const done = value => {
        modal.classList.add("hidden");
        document.removeEventListener("keydown", onKey);
        box.onclick = null;
        box.onkeydown = null;
        resolve(value);
      };
      const submit = () => {
        const values = inputs.map(i => i.value);
        const bad = fields.findIndex((f, i) => f.match !== undefined && values[i] !== f.match);
        if (bad >= 0) {
          box.querySelector("[data-err]").textContent = `Для подтверждения введите «${fields[bad].match}»`;
          return;
        }
        done(fields.length ? values : true);
      };
      const onKey = e => { if (e.key === "Escape") done(null); };
      document.addEventListener("keydown", onKey);
      box.onclick = e => {
        if (e.target.closest("[data-cancel]")) return done(null);
        if (e.target.closest("[data-ok]")) return submit();
      };
      box.onkeydown = e => {
        if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); submit(); }
      };
    });
  },

  async confirm(title, text, confirmText = "Подтвердить", danger = false) {
    return !!(await this.dialog({ title, text, confirmText, danger }));
  },

  // ----- вход и выход -----
  saveToken(token) {
    this.token = token;
    try { localStorage.setItem(ADM_TOKEN_KEY, token); } catch (e) { /* хранилище недоступно */ }
  },

  clearToken() {
    this.token = null;
    try { localStorage.removeItem(ADM_TOKEN_KEY); } catch (e) { /* ignore */ }
  },

  showLogin(message = "") {
    this.me = null;
    this.el("adm-app").classList.add("hidden");
    this.el("adm-login").classList.remove("hidden");
    this.el("adm-login-error").textContent = message;
    this.el("adm-login-submit").disabled = false;
    const nick = this.el("adm-login-form").nick;
    if (nick) nick.focus();
  },

  sessionLost(message) {
    this.clearToken();
    this.showLogin(message);
  },

  async start() {
    this.el("adm-login-form").addEventListener("submit", e => { e.preventDefault(); this.login(e.target); });
    this.el("adm-logout").addEventListener("click", () => this.logout());
    window.addEventListener("hashchange", () => this.route());

    let token = null;
    try { token = localStorage.getItem(ADM_TOKEN_KEY); } catch (e) { token = null; }
    if (!token) return this.showLogin();
    this.token = token;
    const r = await this.api("GET", "/api/me");
    if (r.ok && r.data && r.data.role === "admin") return this.enter(r.data);
    // токен не администратора: не используем его в панели, но и не стираем — это сессия игры
    this.token = null;
    if (r.ok) return this.showLogin("Этот аккаунт не имеет доступа к админ-панели");
    if (r.status === 403) return this.showLogin(this.errText(r));
    this.clearToken();
    return this.showLogin(r.status === 401 ? "" : this.errText(r));
  },

  async login(form) {
    const nick = form.nick.value.trim();
    const password = form.password.value;
    const btn = this.el("adm-login-submit");
    const err = this.el("adm-login-error");
    err.textContent = "";
    btn.disabled = true;
    const r = await this.api("POST", "/api/login", { nick, password });
    if (!r.ok) {
      err.textContent = this.errText(r);
      btn.disabled = false;
      return;
    }
    if (r.data.role !== "admin") {
      // чужой аккаунт: сразу закрываем созданную сессию, в хранилище он не попадает
      this.token = r.data.token;
      await this.api("POST", "/api/logout");
      this.token = null;
      err.textContent = "Этот аккаунт не имеет доступа к админ-панели";
      btn.disabled = false;
      return;
    }
    this.saveToken(r.data.token);
    form.password.value = "";
    this.enter({ nick: r.data.nick, role: r.data.role });
  },

  // выход: сессия закрывается, и открывается обычное окно входа сайта (index.html)
  async logout() {
    await this.api("POST", "/api/logout");
    this.clearToken();
    location.replace("index.html");
  },

  enter(me) {
    this.me = me;
    this.el("adm-login").classList.add("hidden");
    this.el("adm-app").classList.remove("hidden");
    this.el("adm-who").textContent = me.nick;
    this.route();   // пустой адрес — обзор
  },

  // ----- маршрутизация -----
  // #overview | #players[?q=&status=&sort=&dir=&page=] | #player/<id>[/<раздел>] | #log[?player=&action=]
  route() {
    if (!this.me) return;
    const id = ++this.navId;
    const alive = () => id === this.navId;
    const raw = location.hash.replace(/^#/, "");
    const [path, qs] = raw.split("?");
    const parts = (path || "overview").split("/");
    const params = new URLSearchParams(qs || "");
    const section = parts[0] === "player" ? "players" : (parts[0] || "overview");
    document.querySelectorAll(".adm-nav a").forEach(a => a.classList.toggle("active", a.dataset.tab === section));
    const view = this.el("adm-view");
    // обработчики предыдущего раздела не должны работать в новом
    view.onclick = null;
    view.onchange = null;
    view.oninput = null;

    if (parts[0] === "player") return Editor.render(view, parts[1], parts[2] || "general", alive);
    if (parts[0] === "players") return Players.render(view, params, alive);
    if (parts[0] === "log") return Log.render(view, params, alive);
    return Overview.render(view, alive);
  },
};
