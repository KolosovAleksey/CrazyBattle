// js/admin/log.js — вкладка «Журнал действий»: кто, что и с каким игроком сделал, когда.
// В журнале нет паролей, токенов и самих сохранений: только список изменённых разделов и суммы.

const Log = {
  s: { player: "", action: "", page: 1, per: 50 },
  alive: () => false,

  ACTIONS: [
    ["save.edit", "Правка сохранения"],
    ["nick.change", "Смена ника"],
    ["password.reset", "Сброс пароля"],
    ["block", "Блокировка"],
    ["unblock", "Разблокировка"],
    ["player.delete", "Удаление аккаунта"],
  ],

  render(view, params, alive) {
    this.alive = alive;
    const s = this.s;
    if (params.has("player")) s.player = params.get("player");
    if (params.has("action")) s.action = params.get("action");
    s.page = Math.max(1, +params.get("page") || 1);

    view.onclick = e => this.onClick(e);
    view.oninput = e => { if (e.target.id === "lg-player") this.onSearch(); };
    view.onchange = e => { if (e.target.id === "lg-action") { this.s.action = e.target.value; this.s.page = 1; this.load(); } };

    view.innerHTML = `
      <div class="adm-head">
        <div><h1>Журнал действий</h1><small>Все правки администраторов. Записи не удаляются и не редактируются.</small></div>
      </div>
      <div class="adm-toolbar">
        <label class="adm-field" style="width:260px">Игрок (ник)
          <input id="lg-player" class="adm-input wide" type="search" autocomplete="off" placeholder="Например, Tester" value="${Admin.esc(s.player)}">
        </label>
        <label class="adm-field">Действие
          <select id="lg-action" class="adm-select">
            <option value="">Все действия</option>
            ${this.ACTIONS.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="adm-table-wrap" id="lg-table"><div class="adm-empty">Загрузка…</div></div>
      <div id="lg-pager"></div>`;
    Admin.el("lg-action").value = s.action;
    this.load();
  },

  onSearch() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.s.player = Admin.el("lg-player").value.trim();
      this.s.page = 1;
      this.load();
    }, 300);
  },

  onClick(e) {
    const pg = e.target.closest("[data-page]");
    if (pg && !pg.disabled) {
      this.s.page = +pg.dataset.page;
      this.load();
    }
  },

  label(action) {
    const found = this.ACTIONS.find(a => a[0] === action);
    return found ? found[1] : action;
  },

  // короткое описание записи для колонки «Что изменено»
  describe(r) {
    const d = r.details || {};
    switch (r.action) {
      case "save.edit": {
        const parts = (d.changed || []).map(k => ED_FIELD_LABEL[k] || k);
        let text = parts.length ? "изменено: " + parts.join(", ") : "без изменений";
        if (d.balance) text += ` · баланс ${Admin.fmt(d.balance[0])} → ${Admin.fmt(d.balance[1])} ₽`;
        if (d.note) text += ` · «${d.note}»`;
        return text;
      }
      case "nick.change": return `${d.from || "?"} → ${d.to || "?"}`;
      case "password.reset": return "новый пароль задан (сам пароль не записывается)";
      case "block": return "вход закрыт";
      case "unblock": return "вход открыт";
      case "player.delete": return "аккаунт удалён безвозвратно";
      default: return "";
    }
  },

  async load() {
    const s = this.s;
    const table = Admin.el("lg-table");
    if (!table) return;
    const qs = new URLSearchParams({ player: s.player, action: s.action, page: s.page, per: s.per });
    history.replaceState(null, "", "#log?" + qs.toString());
    table.innerHTML = `<div class="adm-empty">Загрузка…</div>`;
    const r = await Admin.api("GET", "/api/admin/log?" + qs.toString());
    if (!this.alive() || !Admin.el("lg-table")) return;
    if (!r.ok) {
      table.innerHTML = `<div class="adm-empty adm-error">${Admin.esc(Admin.errText(r))}</div>`;
      return;
    }
    const d = r.data;
    const rows = d.rows.map(x => {
      const player = x.target
        ? (x.target_id ? `<a href="#player/${x.target_id}">${Admin.esc(x.target)}</a>` : `${Admin.esc(x.target)} <small>(удалён)</small>`)
        : "—";
      return `<tr>
        <td>${Admin.dateSec(x.ts)}</td>
        <td>${Admin.esc(x.actor || "—")}</td>
        <td>${player}</td>
        <td><span class="adm-badge">${Admin.esc(this.label(x.action))}</span></td>
        <td>${Admin.esc(this.describe(x))}</td>
      </tr>`;
    }).join("");
    table.innerHTML = `
      <table class="adm-table">
        <thead><tr><th>Когда</th><th>Администратор</th><th>Игрок</th><th>Действие</th><th>Что изменено</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="5" class="adm-empty">Записей нет</td></tr>`}</tbody>
      </table>`;
    Admin.el("lg-pager").innerHTML = Admin.pagerHtml(d.total, d.page, d.per);
  },
};
