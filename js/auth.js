// js/auth.js — вход и регистрация, синхронизация сохранения с сервером.
//
// Порядок: страница открывается → Auth.start() проверяет сохранённый токен →
// если токена нет или он устарел, показываем форму входа (игра не запускается) →
// после входа загружаем сохранение с сервера в localStorage и запускаем Game.init().
// Дальше каждое сохранение игры (saveGame) уходит на сервер с небольшой задержкой.
//
// Токен хранится в localStorage и отправляется в заголовке Authorization.
// Cookie не используются: во встроенном окне на другом домене браузер их не сохраняет.

const TOKEN_KEY = "cb_token";

const Auth = {
  nick: null,        // ник вошедшего аккаунта (null — не вошли)
  role: null,        // "player" | "admin" (админ-панель — отдельная страница admin.html)
  version: 0,        // версия сохранения на сервере; меняется, когда админ правит аккаунт
  mode: "login",     // "login" | "register"
  gameStarted: false,
  pending: null,     // сохранение, которое ещё не отправлено
  sending: false,    // запрос на сохранение уже в пути
  queued: false,     // после текущего запроса нужно отправить новое сохранение
  timer: null,

  // ----- токен -----
  // Токен держим в памяти страницы и в localStorage (если хранилище доступно).
  token: null,
  initialSave: undefined,   // сохранение, полученное с сервера при входе (читает loadGame)
  getToken() {
    if (this.token) return this.token;
    try { return localStorage.getItem(TOKEN_KEY) || null; } catch (e) { return null; }
  },
  setToken(token) {
    this.token = token;
    try { localStorage.setItem(TOKEN_KEY, token); } catch (e) { console.warn("Не удалось сохранить вход:", e); }
  },
  clearToken() {
    this.token = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
  },

  // ----- запросы к серверу -----
  async api(method, path, body) {
    const opts = { method, headers: {} };
    const token = this.getToken();
    if (token) {
      opts.headers["Authorization"] = "Bearer " + token;
      opts.headers["X-CB-Token"] = token;
    }
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const r = await fetch(path, opts);
    let data = null;
    try { data = await r.json(); } catch (e) { data = null; }
    return { status: r.status, ok: r.ok, data };
  },

  // ----- запуск -----
  start() {
    const form = document.getElementById("auth-form");
    if (form) {
      form.addEventListener("submit", e => { e.preventDefault(); this.submit(); });
      document.querySelectorAll("#auth-form .auth-tab").forEach(b =>
        b.addEventListener("click", () => this.setMode(b.dataset.mode)));
    }
    window.addEventListener("pagehide", () => this.flush());

    if (!this.getToken()) return this.showGate();
    this.api("GET", "/api/me")
      .then(r => {
        if (r.ok) return this.enter(r.data.nick, r.data.role);
        if (r.status === 403) {
          this.clearToken();
          return this.showGate(r.data && r.data.error || "Доступ закрыт");
        }
        this.clearToken();
        this.showGate("Сессия истекла. Войдите снова.");
      })
      .catch(() => this.showGate("Нет связи с сервером. Обновите страницу позже."));
  },

  showGate(message = "") {
    const gate = document.getElementById("auth-gate");
    if (gate) gate.classList.remove("hidden");
    this.setError(message);
    this.setBusy(false);
    const nick = document.querySelector("#auth-form input[name=nick]");
    if (nick) nick.focus();
  },

  hideGate() {
    const gate = document.getElementById("auth-gate");
    if (gate) gate.classList.add("hidden");
  },

  setError(text) {
    const el = document.getElementById("auth-error");
    if (el) el.textContent = text || "";
  },

  setBusy(busy) {
    const btn = document.getElementById("auth-submit");
    if (btn) btn.disabled = !!busy;
  },

  setMode(mode) {
    this.mode = mode === "register" ? "register" : "login";
    document.querySelectorAll("#auth-form .auth-tab").forEach(b =>
      b.classList.toggle("active", b.dataset.mode === this.mode));
    const isReg = this.mode === "register";
    const btn = document.getElementById("auth-submit");
    if (btn) btn.textContent = isReg ? "Создать аккаунт" : "Войти";
    const hint = document.getElementById("auth-hint");
    if (hint) hint.classList.toggle("hidden", !isReg);
    const pw = document.querySelector("#auth-form input[name=password]");
    if (pw) pw.autocomplete = isReg ? "new-password" : "current-password";
    this.setError("");
  },

  // ----- отправка формы входа / регистрации -----
  async submit() {
    const form = document.getElementById("auth-form");
    const nick = form.nick.value.trim();
    const password = form.password.value;
    this.setError("");
    this.setBusy(true);
    try {
      const path = this.mode === "register" ? "/api/register" : "/api/login";
      const r = await this.api("POST", path, { nick, password });
      if (!r.ok) {
        // Нет поля error — значит ответ пришёл не от нашего сервера (например, от адреса превью).
        const text = r.data && r.data.error
          ? r.data.error
          : `Запрос не дошёл до сервера игры (код ${r.status}). Откройте сайт по другому адресу.`;
        this.setError(text);
        this.setBusy(false);
        return;
      }
      this.setToken(r.data.token);
      await this.enter(r.data.nick, r.data.role);
    } catch (e) {
      this.setError("Нет связи с сервером");
      this.setBusy(false);
    }
  },

  // ----- после входа: загрузить сохранение и запустить игру -----
  async enter(nick, role) {
    // администратор не играет: сразу открываем админ-панель, игра не запускается
    if (role === "admin") return location.replace("admin.html");
    let r;
    try {
      r = await this.api("GET", "/api/save");
    } catch (e) {
      return this.showGate("Нет связи с сервером");
    }
    if (r.status === 401) {
      this.clearToken();
      return this.showGate("Вход не подтвердился (код 401). Попробуйте войти ещё раз.");
    }
    if (r.status === 403) {
      this.clearToken();
      return this.showGate(r.data && r.data.error || "Доступ закрыт");
    }
    if (!r.ok) return this.showGate("Не удалось загрузить сохранение");

    // Игра получит сохранение напрямую (loadGame), localStorage — только кэш текущего аккаунта
    this.initialSave = r.data.save;
    this.version = r.data.version || 0;
    this.role = role || "player";
    try {
      if (r.data.save) localStorage.setItem(STORAGE_KEY, JSON.stringify(r.data.save));
      else localStorage.removeItem(STORAGE_KEY);   // чужое сохранение на этом компьютере не остаётся
    } catch (e) {
      console.warn("Локальная копия недоступна:", e);
    }

    this.nick = nick;
    this.hideGate();

    // Игра уже запущена (сессия истекла и вошли снова) — надёжнее перезагрузить страницу
    if (this.gameStarted) return location.reload();
    this.gameStarted = true;
    Game.init();

    // новый аккаунт: ставим ник как имя профиля и сразу создаём сохранение на сервере
    if (!r.data.save) {
      Game.profileName = nick;
      Game.save();
      UI.updateProfileChip(nick, Game.avatar);
    }
  },

  // ----- сохранение игры на сервер -----
  queueSave(state) {
    if (!this.nick) return;
    this.pending = JSON.stringify(state);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 1500);
  },

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.pending || !this.nick) return;
    // Одно сохранение за раз: иначе два запроса с одной версией, и второй получит 409 зря
    if (this.sending) { this.queued = true; return; }
    this.sending = true;
    const body = this.pending;
    this.pending = null;
    const token = this.getToken() || "";
    fetch("/api/save", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
        "X-CB-Token": token,
        "X-Save-Version": String(this.version),   // сервер сравнивает версию с правками админа
      },
      body,
      keepalive: body.length < 60000,   // при закрытии вкладки успеем отправить небольшое сохранение
    }).then(async r => {
      if (r.status === 401) return this.sessionExpired();
      if (r.status === 403) {
        // аккаунт заблокировали во время игры
        const data = await r.json().catch(() => null);
        this.nick = null;
        this.pending = null;
        this.clearToken();
        return this.showGate(data && data.error || "Аккаунт заблокирован администратором");
      }
      if (r.status === 409) {
        // админ изменил аккаунт: наш черновик устарел, перезагружаем, чтобы его не затереть
        this.pending = null;
        alert("Администратор изменил ваш аккаунт. Страница будет обновлена, данные загрузятся заново.");
        return location.reload();
      }
      if (!r.ok) return this.retryLater(body);
      const data = await r.json().catch(() => null);
      if (data && typeof data.version === "number") this.version = data.version;
    }).catch(() => this.retryLater(body))
      .finally(() => {
        this.sending = false;
        if (this.queued) { this.queued = false; this.flush(); }
      });
  },

  retryLater(body) {
    if (!this.pending) this.pending = body;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 5000);
  },

  sessionExpired() {
    this.nick = null;
    this.pending = null;
    this.clearToken();
    this.showGate("Сессия истекла. Войдите снова.");
  },

  // ----- выход -----
  async logout() {
    this.flush();
    try { await this.api("POST", "/api/logout"); } catch (e) { /* токен всё равно удаляется ниже */ }
    this.clearToken();
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  },
};
