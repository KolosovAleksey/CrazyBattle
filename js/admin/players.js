// js/admin/players.js — вкладка «Игроки»: все аккаунты игроков (без служебных), поиск, фильтры, сортировка, страницы.
// Строка таблицы ведёт в карточку игрока (#player/<id>). Состояние записывается в адрес (#players?q=...).

const Players = {
  s: { q: "", status: "all", sort: "created", dir: "desc", page: 1, per: 25 },
  alive: () => false,

  COLS: [
    ["nick", "Ник", "left"],
    ["balance", "Баланс", "num"],
    ["inv_count", "Инвентарь", "num"],
    ["cs_value", "КС", "num"],
    ["created", "Регистрация", "left"],
    ["last_seen", "Был в сети", "left"],
  ],

  render(view, params, alive) {
    this.alive = alive;
    const s = this.s;
    s.q = params.get("q") ?? s.q;
    if (params.has("status")) s.status = params.get("status");
    if (params.has("sort")) s.sort = params.get("sort");
    if (params.has("dir")) s.dir = params.get("dir");
    s.page = Math.max(1, +params.get("page") || (params.has("q") ? 1 : s.page));
    if (params.has("per")) s.per = +params.get("per") || 25;

    view.onclick = e => this.onClick(e);
    view.oninput = e => { if (e.target.id === "pl-q") this.onSearch(); };
    view.onchange = e => { if (e.target.id === "pl-status" || e.target.id === "pl-per") this.onFilter(); };

    view.innerHTML = `
      <div class="adm-head">
        <div><h1>Игроки</h1><small>Все зарегистрированные аккаунты. Нажмите на строку, чтобы открыть карточку игрока.</small></div>
      </div>
      <div class="adm-toolbar">
        <label class="adm-field" style="width:260px">Поиск по нику
          <input id="pl-q" class="adm-input wide" type="search" placeholder="Например, Tester" value="${Admin.esc(s.q)}" autocomplete="off">
        </label>
        <label class="adm-field">Статус
          <select id="pl-status" class="adm-select">
            <option value="all">Все</option>
            <option value="active">Активные</option>
            <option value="blocked">Заблокированные</option>
          </select>
        </label>
        <label class="adm-field">На странице
          <select id="pl-per" class="adm-select">
            ${[25, 50, 100].map(n => `<option value="${n}">${n}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="adm-table-wrap" id="pl-table"><div class="adm-empty">Загрузка…</div></div>
      <div id="pl-pager"></div>`;
    Admin.el("pl-status").value = s.status;
    Admin.el("pl-per").value = String(s.per);
    this.load();
  },

  onSearch() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.s.q = Admin.el("pl-q").value.trim();
      this.s.page = 1;
      this.load();
    }, 300);
  },

  onFilter() {
    this.s.status = Admin.el("pl-status").value;
    this.s.per = +Admin.el("pl-per").value || 25;
    this.s.page = 1;
    this.load();
  },

  onClick(e) {
    const th = e.target.closest("[data-sort]");
    if (th) {
      const key = th.dataset.sort;
      if (this.s.sort === key) this.s.dir = this.s.dir === "desc" ? "asc" : "desc";
      else { this.s.sort = key; this.s.dir = key === "nick" ? "asc" : "desc"; }
      this.s.page = 1;
      return this.load();
    }
    const pg = e.target.closest("[data-page]");
    if (pg && !pg.disabled) {
      this.s.page = +pg.dataset.page;
      return this.load();
    }
    const row = e.target.closest("tr[data-id]");
    if (row) location.hash = "#player/" + row.dataset.id;
  },

  async load() {
    const s = this.s;
    const table = Admin.el("pl-table");
    if (!table) return;
    const qs = new URLSearchParams({ q: s.q, status: s.status, sort: s.sort, dir: s.dir, page: s.page, per: s.per });
    // адрес обновляем без перехода, чтобы страницу можно было открыть по ссылке
    history.replaceState(null, "", "#players?" + qs.toString());
    table.innerHTML = `<div class="adm-empty">Загрузка…</div>`;
    const r = await Admin.api("GET", "/api/admin/players?" + qs.toString());
    if (!this.alive() || !Admin.el("pl-table")) return;
    if (!r.ok) {
      table.innerHTML = `<div class="adm-empty adm-error">${Admin.esc(Admin.errText(r))}</div>`;
      Admin.el("pl-pager").innerHTML = "";
      return;
    }
    const d = r.data;
    if (d.total && s.page > Math.ceil(d.total / d.per)) {
      s.page = Math.ceil(d.total / d.per);
      return this.load();
    }
    const head = this.COLS.map(([key, label, cls]) => {
      const active = s.sort === key;
      const arrow = active ? (s.dir === "desc" ? " ▼" : " ▲") : "";
      return `<th class="${cls === "num" ? "num" : ""}"><button class="adm-sort ${active ? "active" : ""}" data-sort="${key}">${label}${arrow}</button></th>`;
    }).join("") + `<th>Статус</th>`;
    const rows = d.rows.map(p => `
      <tr class="is-link" data-id="${p.id}">
        <td><b>${Admin.esc(p.nick)}</b><br><code>id ${p.id}</code></td>
        <td class="num">${Admin.rub(p.balance)}</td>
        <td class="num">${Admin.fmt(p.inv_count)}</td>
        <td class="num">${Admin.fmt(p.cs_count)} шт.<br><small>${Admin.rub(p.cs_value)}</small></td>
        <td>${Admin.dateSec(p.created)}</td>
        <td>${Admin.agoSec(p.last_seen)}</td>
        <td>${p.blocked ? `<span class="adm-badge bad">Заблокирован</span>` : `<span class="adm-badge ok">Активен</span>`}
            ${p.has_save ? "" : ` <span class="adm-badge warn">нет сохранения</span>`}</td>
      </tr>`).join("");
    table.innerHTML = `
      <table class="adm-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${rows || `<tr><td colspan="7" class="adm-empty">${s.q ? "Никто не найден по запросу" : "Игроков пока нет"}</td></tr>`}</tbody>
      </table>`;
    Admin.el("pl-pager").innerHTML = Admin.pagerHtml(d.total, d.page, d.per);
  },
};
