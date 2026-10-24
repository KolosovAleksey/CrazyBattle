// js/admin/editor.js — карточка игрока: «Общее», «Баланс», «Инвентарь», «КС-инвентарь», «Статистика»,
// «Достижения», «Операция», «JSON».
//
// Любая правка сохранения — один запрос PUT /api/admin/players/<id>/save с версией (X-Save-Version).
// Если игрок (или другой администратор) изменил аккаунт раньше, сервер отвечает 409 и правка не
// применяется: карточка перечитывается, чтобы не затереть чужие данные.
// Правки ника, пароля и блокировки — отдельные запросы PATCH; удаление — DELETE с подтверждением ником.

const EDITOR_SECTIONS = [
  ["general", "Общее"],
  ["balance", "Баланс"],
  ["inventory", "Инвентарь"],
  ["cs", "КС-инвентарь"],
  ["stats", "Статистика"],
  ["achievements", "Достижения"],
  ["operation", "Операция"],
  ["json", "JSON"],
];

const STAT_LABELS = {
  casesOpened: "Открыто кейсов",
  maxBatch: "Максимум кейсов за одно открытие",
  goldHits: "Выпало золотых прокрутов",
  lowestWinChance: "Минимальный шанс выигранного апгрейда, %",
  contracts10: "Контрактов из максимального числа предметов",
  sellAll: "Нажатий «Продать всё»",
  csCount: "Выведено в КС, шт.",
  csValue: "Выведено в КС, ₽",
  skinBattles: "Battle со скинами: сыграно",
  skinWins: "Battle со скинами: выиграно",
  spent: "Потрачено на кейсы, ₽",
  upgrades: "Апгрейдов сделано",
  upgradesWon: "Апгрейдов выиграно",
  contracts: "Контрактов сделано",
  soldCount: "Продано предметов",
  earned: "Заработано с продаж, ₽",
  obtained: "Получено предметов",
  obtainedValue: "Стоимость полученных предметов, ₽",
  upSpent: "Вложено в апгрейды, ₽",
  ctSpent: "Вложено в контракты, ₽",
  depCount: "Пополнений",
  depTotal: "Пополнено всего, ₽",
  depMax: "Максимальное пополнение, ₽",
};
const STAT_BOOLS = { nameChanged: "Менял ник", avatarChanged: "Менял аватар", statsOpened: "Открывал статистику" };
// поля статистики, которые не редактируются числом (списки, даты, объекты)
const STAT_READONLY = ["casesSeen", "catCount", "rarityCount", "visited", "csTabs", "deposits", "bestDrop", "achAt", "createdAt"];

const ED_LABEL = { balance: "Баланс", inventory: "Инвентарь", csInventory: "КС-инвентарь" };
const ED_FIELD_LABEL = {
  balance: "баланс", inventory: "инвентарь", csInventory: "КС-инвентарь", stats: "статистика",
  operation: "операция", history: "история", profileName: "ник профиля", rigged: "подкрут",
  rigMult: "множитель подкрута", avatar: "аватар", upChain: "цепочка апгрейда", csLoadout: "снаряжение КС",
  accountId: "ID аккаунта",
};

const Editor = {
  id: null,          // id игрока в карточке
  p: null,           // сводка по игроку (как в списке)
  save: null,        // сохранение игрока (копия, которую правим)
  version: 0,        // версия сохранения на сервере
  hasSave: false,
  section: "general",
  pick: null,        // выбранный в каталоге предмет (id)
  pickQuery: "",
  achQuery: "",
  achFilter: "all",
  busy: false,

  // ----- загрузка -----
  async fetch(id) {
    const r = await Admin.api("GET", `/api/admin/players/${id}`);
    if (!r.ok) { this.p = null; return false; }
    this.id = +id;
    this.p = r.data.player;
    this.hasSave = !!r.data.save;
    this.save = r.data.save || this.blankSave(this.p.nick);
    this.version = r.data.version;
    return true;
  },

  // сохранения ещё нет (игрок не заходил в игру): первая правка создаст его
  blankSave(nick) {
    return {
      balance: 0, inventory: [], history: [], stats: {}, avatar: "", profileName: nick,
      rigged: false, rigMult: 2, csInventory: [], csLoadout: { ct: {}, t: {} }, upChain: null, operation: null,
    };
  },

  async render(view, id, section, alive) {
    this.section = EDITOR_SECTIONS.some(s => s[0] === section) ? section : "general";
    this.pick = null;
    this.pickQuery = "";
    view.innerHTML = `<div class="adm-empty">Загрузка…</div>`;
    const ok = await this.fetch(id);
    if (!alive()) return;
    if (!ok) {
      view.innerHTML = `<div class="panel adm-card"><h2>Игрок не найден</h2>
        <p class="adm-card-sub">Возможно, аккаунт удалён или это служебный аккаунт.</p>
        <a href="#players">← К списку игроков</a></div>`;
      return;
    }
    this.paint();
  },

  // перерисовка карточки без запроса к серверу
  paint() {
    const view = Admin.el("adm-view");
    const p = this.p;
    const initial = (p.nick || "?").trim().charAt(0).toUpperCase();
    view.onclick = e => this.onClick(e);
    view.onchange = e => this.onChange(e);
    view.oninput = e => this.onInput(e);
    view.innerHTML = `
      <div class="adm-crumbs"><a href="#players">Игроки</a> / ${Admin.esc(p.nick)}</div>
      <div class="adm-player-head">
        <div class="adm-avatar">${Admin.esc(initial)}</div>
        <div class="adm-player-title">
          <h1>${Admin.esc(p.nick)}</h1>
          <small>id ${p.id} · регистрация ${Admin.dateSec(p.created)} · был в сети ${Admin.agoSec(p.last_seen)} ·
            ${p.blocked ? `<span class="adm-badge bad">заблокирован</span>` : `<span class="adm-badge ok">активен</span>`}</small>
        </div>
      </div>
      <nav class="adm-tabs">
        ${EDITOR_SECTIONS.map(([key, label]) =>
          `<a href="#player/${p.id}/${key}" class="${key === this.section ? "active" : ""}">${label}</a>`).join("")}
      </nav>
      <div id="ed-body">${this.body()}</div>`;
    const search = Admin.el("ed-search");
    if (search) search.value = this.pickQuery;
    const achQ = Admin.el("ach-q");
    if (achQ) achQ.value = this.achQuery;
    const achF = Admin.el("ach-f");
    if (achF) achF.value = this.achFilter;
  },

  body() {
    switch (this.section) {
      case "balance": return this.balanceHtml();
      case "inventory": return this.itemsHtml("inventory");
      case "cs": return this.itemsHtml("csInventory");
      case "stats": return this.statsHtml();
      case "achievements": return this.achHtml();
      case "operation": return this.operationHtml();
      case "json": return this.jsonHtml();
      default: return this.generalHtml();
    }
  },

  // ----- общая запись -----
  // mutate(copy) меняет копию сохранения и возвращает текст ошибки или null
  async commit(mutate, note) {
    if (this.busy) return false;
    this.busy = true;
    try {
      const copy = JSON.parse(JSON.stringify(this.save));
      const err = mutate(copy);
      if (err) { Admin.toast(err, "bad"); return false; }
      const userNote = (Admin.el("ed-note") ? Admin.el("ed-note").value : "").trim();
      const full = userNote ? `${note} — ${userNote}` : note;
      const r = await Admin.api("PUT", `/api/admin/players/${this.id}/save`, { save: copy, note: full },
        { "X-Save-Version": String(this.version) });
      if (r.status === 409) {
        Admin.toast("Данные аккаунта уже изменились. Карточка обновлена, повторите правку.", "warn");
        await this.fetch(this.id);
        this.paint();
        return false;
      }
      if (!r.ok) { Admin.toast(Admin.errText(r), "bad"); return false; }
      await this.fetch(this.id);
      Admin.toast("Сохранено: " + note, "ok");
      this.paint();
      return true;
    } finally {
      this.busy = false;
    }
  },

  // действия с аккаунтом (отдельные запросы)
  async patch(body, okText) {
    const r = await Admin.api("PATCH", `/api/admin/players/${this.id}`, body);
    if (!r.ok) { Admin.toast(Admin.errText(r), "bad"); return false; }
    Admin.toast(okText, "ok");
    return true;
  },

  // ----- «Общее» -----
  generalHtml() {
    const p = this.p;
    const s = this.save;
    return `
      <div class="adm-grid-2">
        <div class="panel adm-card">
          <h2>Аккаунт</h2>
          <dl class="adm-kv">
            <dt>Ник</dt><dd>${Admin.esc(p.nick)}</dd>
            <dt>ID</dt><dd><code>${p.id}</code></dd>
            <dt>Регистрация</dt><dd>${Admin.dateSec(p.created)}</dd>
            <dt>Последний вход</dt><dd>${Admin.dateSec(p.last_seen)} <small>(${Admin.agoSec(p.last_seen)})</small></dd>
            <dt>Статус</dt><dd>${p.blocked ? `<span class="adm-badge bad">заблокирован</span>` : `<span class="adm-badge ok">активен</span>`}</dd>
            <dt>Сохранение</dt><dd>${this.hasSave ? `версия ${this.version}` : `<span class="adm-badge warn">нет, игрок не заходил в игру</span>`}</dd>
          </dl>
        </div>
        <div class="panel adm-card">
          <h2>Профиль в игре</h2>
          <div class="adm-card-sub">Имя профиля отображается на сайте и в рейтинге. Подкрут умножает шансы апгрейда на множитель (скрыто от игрока).</div>
          <div class="adm-row">
            <label class="adm-field" style="flex:1">Имя профиля (до 20 символов)
              <input id="ed-pname" class="adm-input wide" maxlength="20" value="${Admin.esc(s.profileName || "")}">
            </label>
          </div>
          <div class="adm-row" style="margin-top:12px">
            <label class="adm-check"><input id="ed-rig" type="checkbox" ${s.rigged ? "checked" : ""}> Подкрут включён</label>
            <label class="adm-field">Множитель (1–100)
              <input id="ed-rigmult" class="adm-input" type="number" min="1" max="100" step="0.5" value="${Admin.esc(s.rigMult ?? 2)}">
            </label>
            <button class="btn" data-act="gen-save">Сохранить</button>
          </div>
          <div class="adm-row" style="margin-top:12px"><label class="adm-field wide">Комментарий в журнал (необязательно)
            <input id="ed-note" class="adm-input wide" maxlength="200"></label></div>
        </div>
      </div>
      <div class="panel adm-card">
        <h2>Вход и доступ</h2>
        <div class="adm-card-sub">Пароль не показывается и не хранится открыто. Сброс завершает все входы игрока.</div>
        <div class="adm-row">
          <button class="btn-outline" data-act="acc-nick">Сменить ник</button>
          <button class="btn-outline" data-act="acc-pass">Сменить пароль</button>
          <button class="btn-outline ${p.blocked ? "" : "adm-btn-danger"}" data-act="acc-block">${p.blocked ? "Разблокировать" : "Заблокировать"}</button>
        </div>
      </div>
      <div class="panel adm-card adm-danger">
        <h2>Удаление аккаунта</h2>
        <div class="adm-card-sub">Аккаунт и весь его прогресс удаляются безвозвратно. Если нужно просто закрыть вход, используйте блокировку.</div>
        <button class="btn-outline adm-btn-danger" data-act="acc-delete">Удалить аккаунт…</button>
      </div>`;
  },

  saveGeneral() {
    const name = (Admin.el("ed-pname").value || "").trim().slice(0, 20) || "Игрок";
    const rig = Admin.el("ed-rig").checked;
    const mult = +Admin.el("ed-rigmult").value;
    if (!Number.isFinite(mult) || mult < 1 || mult > 100) {
      return Admin.toast("Множитель подкрута — число от 1 до 100", "bad");
    }
    const m = Math.round(mult * 100) / 100;
    return this.commit(copy => {
      copy.profileName = name;
      copy.rigged = rig;
      copy.rigMult = m;
      return null;
    }, "Общее: ник профиля, подкрут ×" + m + (rig ? " (вкл.)" : " (выкл.)"));
  },

  async changeNick() {
    const v = await Admin.dialog({
      title: "Сменить ник",
      text: "Ник от 3 до 16 символов: буквы, цифры, «_» и «-». Ник должен быть свободен.",
      fields: [{ label: "Новый ник", value: this.p.nick }],
      confirmText: "Сменить",
    });
    if (!v) return;
    const nick = v[0].trim();
    if (nick === this.p.nick) return;
    if (await this.patch({ nick }, `Ник изменён: ${nick}`)) {
      await this.fetch(this.id);
      this.paint();
    }
  },

  async changePassword() {
    const v = await Admin.dialog({
      title: "Сменить пароль",
      text: "Пароль от 6 до 72 символов. Все текущие входы игрока будут завершены.",
      fields: [{ label: "Новый пароль", type: "password", placeholder: "не менее 6 символов" }],
      confirmText: "Сменить пароль",
    });
    if (!v || !v[0]) return;
    if (await this.patch({ password: v[0] }, "Пароль изменён, старые входы завершены")) {
      await this.fetch(this.id);
      this.paint();
    }
  },

  async toggleBlock() {
    const blocking = !this.p.blocked;
    const ok = await Admin.confirm(
      blocking ? "Заблокировать игрока?" : "Разблокировать игрока?",
      blocking ? "Игрок не сможет войти и получит отказ при следующем действии. Прогресс сохраняется."
               : "Вход снова станет доступен, прогресс не меняется.",
      blocking ? "Заблокировать" : "Разблокировать", blocking);
    if (!ok) return;
    if (await this.patch({ blocked: blocking }, blocking ? "Игрок заблокирован" : "Игрок разблокирован")) {
      await this.fetch(this.id);
      this.paint();
    }
  },

  async deleteAccount() {
    const v = await Admin.dialog({
      title: "Удалить аккаунт?",
      text: "Аккаунт и весь прогресс будут удалены без возможности восстановления. Для подтверждения введите ник игрока.",
      fields: [{ label: `Ник «${this.p.nick}»`, match: this.p.nick, placeholder: this.p.nick }],
      confirmText: "Удалить навсегда",
      danger: true,
    });
    if (!v) return;
    const r = await Admin.api("DELETE", `/api/admin/players/${this.id}`);
    if (!r.ok) { Admin.toast(Admin.errText(r), "bad"); return; }
    Admin.toast("Аккаунт удалён", "ok");
    location.hash = "#players";
  },

  // ----- «Баланс» -----
  balanceHtml() {
    const b = Math.round(+this.save.balance || 0);
    return `
      <div class="panel adm-card">
        <h2>Баланс</h2>
        <div class="adm-card-sub">Баланс на счёте игрока на сайте (не в КС).</div>
        <div style="font-size:30px;font-weight:800;font-variant-numeric:tabular-nums">${Admin.rub(b)}</div>
        <div class="adm-row" style="margin-top:14px">
          ${[1000, 10000, 100000].map(v => `<button class="btn-outline" data-act="bal-delta" data-value="${v}">+${Admin.fmt(v)} ₽</button>`).join("")}
          ${[1000, 10000].map(v => `<button class="btn-outline" data-act="bal-delta" data-value="${-v}">−${Admin.fmt(v)} ₽</button>`).join("")}
        </div>
        <div class="adm-row" style="margin-top:16px">
          <label class="adm-field">Установить значение, ₽
            <input id="ed-bal" class="adm-input" type="number" min="0" step="1" value="${b}">
          </label>
          <button class="btn" data-act="bal-set">Установить</button>
        </div>
        <div class="adm-row" style="margin-top:12px">
          <label class="adm-field wide">Комментарий в журнал (необязательно)
            <input id="ed-note" class="adm-input wide" maxlength="200" placeholder="Например: компенсация за сбой">
          </label>
        </div>
      </div>`;
  },

  setBalance(next, label) {
    return this.commit(copy => {
      copy.balance = Math.max(0, Math.round(next));
      return null;
    }, label);
  },

  // ----- «Инвентарь» и «КС-инвентарь» -----
  itemTitle(it) {
    const base = ITEMS[it.id] ? ITEMS[it.id].name : (it.name || it.id);
    return variantName(base, it.variant);
  },

  itemsHtml(key) {
    const list = this.save[key] || [];
    const total = list.reduce((a, it) => a + (+it.price || 0), 0);
    const title = key === "csInventory" ? "КС-инвентарь" : "Инвентарь";
    const sub = key === "csInventory"
      ? "Предметы, выведенные на сайте в КС. Здесь же их можно выдать вручную."
      : "Предметы, которые игрок может продать, поставить в апгрейд или контракт.";
    const rows = list.map(it => {
      const wear = it.wear ? (WEAR_NAME[it.wear] || it.wear) : "";
      const ref = ITEMS[it.id];
      return `<tr>
        <td><img class="thumb" src="${Admin.esc(itemImg(it))}" alt=""></td>
        <td><b>${Admin.esc(this.itemTitle(it))}</b><br><small>${Admin.esc(wear || "без износа")}${it.isNew ? " · новый" : ""}${it.shop ? " · магазин" : ""}</small></td>
        <td>${ref ? Admin.rarityHtml(ref.rarity) : Admin.rarityHtml(it.rarity)}</td>
        <td class="num">${Admin.rub(it.price)}</td>
        <td><code>${Admin.esc(String(it.uid || "").slice(0, 12))}</code></td>
        <td><button class="btn-outline adm-btn-sm adm-btn-danger" data-act="item-del" data-key="${key}" data-uid="${Admin.esc(it.uid)}">Удалить</button></td>
      </tr>`;
    }).join("");
    return `
      <div class="panel adm-card">
        <h2>${title}</h2>
        <div class="adm-card-sub">${sub} Всего: ${list.length} шт. на ${Admin.rub(total)}.</div>
        <div class="adm-table-wrap" style="border:0">
          <table class="adm-table">
            <thead><tr><th></th><th>Предмет</th><th>Редкость</th><th class="num">Цена</th><th>uid</th><th></th></tr></thead>
            <tbody>${rows || `<tr><td colspan="6" class="adm-empty">Пусто</td></tr>`}</tbody>
          </table>
        </div>
        ${list.length ? `<div class="adm-row" style="margin-top:12px"><button class="btn-outline adm-btn-sm adm-btn-danger" data-act="item-clear" data-key="${key}">Удалить все (${list.length})</button></div>` : ""}
      </div>
      <div class="panel adm-card">
        <h2>Выдать предмет</h2>
        <div class="adm-card-sub">Выбирается из каталога сайта. Цена — из каталога для выбранного варианта и износа.</div>
        <label class="adm-field wide">Поиск по названию
          <input id="ed-search" class="adm-input wide" type="search" placeholder="Например: AWP, Karambit, Glock" autocomplete="off">
        </label>
        <div id="ed-picker">${this.pickerHtml(key)}</div>
        <div class="adm-row" style="margin-top:12px">
          <label class="adm-field wide">Комментарий в журнал (необязательно)
            <input id="ed-note" class="adm-input wide" maxlength="200">
          </label>
        </div>
      </div>`;
  },

  pickerHtml(key) {
    const q = this.pickQuery.trim().toLowerCase();
    let results;
    if (!q) {
      results = `<small>Введите название, чтобы найти предмет.</small>`;
    } else {
      const found = Object.values(ITEMS).filter(it => (it.name || "").toLowerCase().includes(q)).slice(0, 40);
      results = found.length
        ? `<div class="adm-pick">${found.map(it => `
            <button type="button" data-act="item-pick" data-id="${Admin.esc(it.id)}" class="${it.id === this.pick ? "active" : ""}">
              <img src="${Admin.esc(itemImg(it))}" alt=""><span>${Admin.esc(it.name)}</span>${Admin.rarityHtml(it.rarity)}
            </button>`).join("")}</div>`
        : `<small>Ничего не найдено</small>`;
    }
    const picked = this.pick ? ITEMS[this.pick] : null;
    let form = "";
    if (picked) {
      const vars = variantList(picked);
      form = `<div class="adm-row" style="margin-top:12px">
        <label class="adm-field">Вариант и износ
          <select id="ed-variant" class="adm-select" style="min-width:320px">
            ${vars.map((v, i) => {
              const pre = v.v === "st" ? "StatTrak™ " : v.v === "sv" ? "Souvenir " : "";
              const wear = v.n ? (WEAR_NAME[v.n] || v.n) : "без износа";
              return `<option value="${i}">${Admin.esc(pre + wear)} — ${Admin.rub(v.p)}</option>`;
            }).join("")}
          </select>
        </label>
        <button class="btn" data-act="item-add" data-key="${key}">Выдать «${Admin.esc(picked.name)}»</button>
      </div>`;
    }
    return results + form;
  },

  addItem(key) {
    const item = this.pick ? ITEMS[this.pick] : null;
    if (!item) return Admin.toast("Сначала выберите предмет из списка", "warn");
    const vars = variantList(item);
    const opt = vars[+Admin.el("ed-variant").value];
    if (!opt) return Admin.toast("Выберите вариант", "warn");
    const uid = this.uid();
    const name = variantName(item.name, opt.v);
    const rec = key === "csInventory"
      ? { uid, id: item.id, name, rarity: item.rarity, img: itemImg({ id: item.id }), shop: !!item.shop, variant: opt.v, wear: opt.n, price: opt.p }
      : { id: item.id, uid, isNew: true, variant: opt.v, wear: opt.n, price: opt.p };
    const label = key === "csInventory" ? "КС-инвентарь" : "Инвентарь";
    return this.commit(copy => {
      if (!Array.isArray(copy[key])) copy[key] = [];
      copy[key].push(rec);
      return null;
    }, `${label}: выдан «${name}»${opt.n ? " (" + (WEAR_NAME[opt.n] || opt.n) + ")" : ""} за ${Admin.rub(opt.p)}`);
  },

  removeItem(key, uid) {
    const it = (this.save[key] || []).find(i => i.uid === uid);
    const label = key === "csInventory" ? "КС-инвентарь" : "Инвентарь";
    return this.commit(copy => {
      copy[key] = (copy[key] || []).filter(i => i.uid !== uid);
      return null;
    }, `${label}: удалён «${it ? this.itemTitle(it) : uid}»`);
  },

  clearItems(key) {
    const n = (this.save[key] || []).length;
    const label = key === "csInventory" ? "КС-инвентарь" : "Инвентарь";
    if (!n) return;
    Admin.confirm(`Удалить все предметы?`, `Из раздела «${label}» будут удалены все предметы (${n} шт.). Это нельзя отменить.`, "Удалить все", true)
      .then(ok => { if (ok) this.commit(copy => { copy[key] = []; return null; }, `${label}: удалены все предметы (${n} шт.)`); });
  },

  uid() {
    return "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },

  // ----- «Статистика» -----
  statsHtml() {
    const st = this.save.stats || {};
    const nums = [...Object.keys(STAT_LABELS)];
    Object.keys(st).forEach(k => {
      if (!nums.includes(k) && typeof st[k] === "number" && !STAT_READONLY.includes(k)) nums.push(k);
    });
    const numRows = nums.map(k => {
      const v = st[k];
      const shown = v === null || v === undefined ? "" : v;
      return `<label class="adm-field">${Admin.esc(STAT_LABELS[k] || k)} <small>(${Admin.esc(k)})</small>
        <input class="adm-input wide" type="number" min="0" step="any" data-stat="${Admin.esc(k)}" data-kind="num"
          value="${Admin.esc(shown)}" placeholder="${k === "lowestWinChance" ? "пусто — нет данных" : "0"}"></label>`;
    }).join("");
    const boolRows = Object.keys(STAT_BOOLS).map(k => `
      <label class="adm-check"><input type="checkbox" data-stat="${k}" data-kind="bool" ${st[k] ? "checked" : ""}> ${Admin.esc(STAT_BOOLS[k])}</label>`).join("");
    const listRows = STAT_READONLY.filter(k => k in st).map(k => {
      const v = st[k];
      const text = Array.isArray(v) ? `${v.length} зап.` : (v && typeof v === "object" ? "объект" : Admin.esc(String(v)));
      return `<dt>${Admin.esc(k)}</dt><dd>${text}</dd>`;
    }).join("");
    return `
      <div class="panel adm-card">
        <h2>Статистика</h2>
        <div class="adm-card-sub">Счётчики, которые видит игрок в профиле и которые используют достижения. Пустое поле — 0.</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px">${numRows}</div>
        <div class="adm-row" style="margin-top:14px">${boolRows}</div>
        <div class="adm-row" style="margin-top:14px">
          <button class="btn" data-act="stat-save">Сохранить статистику</button>
        </div>
        <div class="adm-row" style="margin-top:12px"><label class="adm-field wide">Комментарий в журнал (необязательно)
          <input id="ed-note" class="adm-input wide" maxlength="200"></label></div>
      </div>
      <div class="panel adm-card">
        <h2>Списки и даты</h2>
        <div class="adm-card-sub">Эти поля меняются только во вкладке «JSON» (там же можно исправить историю дропа).</div>
        <dl class="adm-kv">${listRows || "<dt>—</dt><dd>нет</dd>"}</dl>
      </div>`;
  },

  saveStats() {
    const inputs = [...document.querySelectorAll("[data-stat]")];
    const values = {};
    for (const el of inputs) {
      const k = el.dataset.stat;
      if (el.dataset.kind === "bool") { values[k] = el.checked; continue; }
      const raw = el.value.trim();
      if (raw === "") { values[k] = k === "lowestWinChance" ? null : 0; continue; }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return Admin.toast(`«${STAT_LABELS[k] || k}»: введите число от 0`, "bad");
      values[k] = n;
    }
    return this.commit(copy => {
      copy.stats = copy.stats || {};
      Object.assign(copy.stats, values);
      return null;
    }, "Статистика: изменены счётчики");
  },

  // ----- «Достижения» -----
  achHtml() {
    const at = (this.save.stats && this.save.stats.achAt) || {};
    const got = ACHIEVEMENTS.filter(a => at[a.id]).length;
    return `
      <div class="panel adm-card">
        <h2>Достижения</h2>
        <div class="adm-card-sub">Получено ${got} из ${ACHIEVEMENTS.length}. «Выдать» ставит отметку с текущим временем, «Забрать» — снимает.
          Если условие достижения уже выполнено, игра отметит его снова при следующем сохранении.</div>
        <div class="adm-toolbar">
          <label class="adm-field" style="width:280px">Поиск
            <input id="ach-q" class="adm-input wide" type="search" autocomplete="off" placeholder="Название достижения">
          </label>
          <label class="adm-field">Показать
            <select id="ach-f" class="adm-select">
              <option value="all">Все</option>
              <option value="got">Полученные</option>
              <option value="not">Не полученные</option>
            </select>
          </label>
          <button class="btn-outline" data-act="ach-all" data-on="1">Выдать все</button>
          <button class="btn-outline adm-btn-danger" data-act="ach-all" data-on="0">Забрать все</button>
        </div>
        <div id="ach-table" class="adm-table-wrap">${this.achTable()}</div>
      </div>`;
  },

  achTable() {
    const at = (this.save.stats && this.save.stats.achAt) || {};
    const q = this.achQuery.trim().toLowerCase();
    const f = this.achFilter;
    const list = ACHIEVEMENTS.filter(a =>
      (!q || a.name.toLowerCase().includes(q)) &&
      (f === "all" || (f === "got") === !!at[a.id]));
    if (!list.length) return `<div class="adm-empty">Ничего не найдено</div>`;
    return `<table class="adm-table">
      <thead><tr><th>Достижение</th><th>Условие</th><th>Получено</th><th></th></tr></thead>
      <tbody>${list.map(a => {
        const when = at[a.id];
        return `<tr>
          <td><b>${Admin.esc(a.name)}</b></td>
          <td><small>${Admin.esc(a.desc)}</small></td>
          <td>${when ? `<span class="adm-badge ok">${Admin.date(when)}</span>` : `<span class="adm-badge">нет</span>`}</td>
          <td style="text-align:right"><button class="btn-outline adm-btn-sm ${when ? "adm-btn-danger" : ""}" data-act="ach-one" data-id="${a.id}" data-on="${when ? 0 : 1}">${when ? "Забрать" : "Выдать"}</button></td>
        </tr>`;
      }).join("")}</tbody></table>`;
  },

  setAchievements(ids, on) {
    const names = ACHIEVEMENTS.filter(a => ids.includes(a.id)).map(a => a.name);
    const label = ids.length === 1 ? `${on ? "Выдано" : "Снято"}: ${names[0]}` : `${on ? "Выдано" : "Снято"} достижений: ${ids.length}`;
    return this.commit(copy => {
      copy.stats = copy.stats || {};
      const at = copy.stats.achAt || (copy.stats.achAt = {});
      const now = Date.now();
      ids.forEach(id => { if (on) { if (!at[id]) at[id] = now; } else delete at[id]; });
      return null;
    }, label);
  },

  // ----- «Операция» -----
  operationHtml() {
    const op = Operation.load(this.save.operation);
    const level = op.c.filter(Boolean).length;
    const active = Operation.active(op);
    const activeTask = active >= 0 && OP_TASKS[active] ? OP_TASKS[active].title : "все задания выполнены";
    const tickets = op.tickets || [];
    const unused = tickets.filter(t => !t.used).length;
    const rows = tickets.map(t => {
      const task = OP_TASKS[t.task];
      const c = CASES[t.caseId];
      return `<tr><td><code>${Admin.esc(t.id)}</code></td><td>${Admin.esc(task ? task.title : "—")}</td>
        <td>${Admin.esc(c ? c.name : t.caseId)}</td><td>${t.used ? `<span class="adm-badge">использован</span>` : `<span class="adm-badge ok">не использован</span>`}</td></tr>`;
    }).join("");
    return `
      <div class="adm-grid-2">
        <div class="panel adm-card">
          <h2>Уровень операции</h2>
          <div class="adm-card-sub">Каждое выполненное задание даёт +1 уровень. Всего уровней: ${OP_TOTAL}.</div>
          <div style="font-size:30px;font-weight:800">${level} <small style="font-size:14px">из ${OP_TOTAL}</small></div>
          <dl class="adm-kv" style="margin-top:12px">
            <dt>Текущее задание</dt><dd>${Admin.esc(activeTask)}</dd>
            <dt>Билеты на открытие</dt><dd>${unused} не использовано, всего ${tickets.length}</dd>
          </dl>
          <div class="adm-row" style="margin-top:16px">
            <label class="adm-field">Установить уровень (0–${OP_TOTAL})
              <input id="op-level" class="adm-input" type="number" min="0" max="${OP_TOTAL}" step="1" value="${level}">
            </label>
            <button class="btn" data-act="op-set">Установить</button>
            <button class="btn-outline adm-btn-danger" data-act="op-reset">Сбросить операцию</button>
          </div>
          <div class="adm-row" style="margin-top:12px"><label class="adm-field wide">Комментарий в журнал (необязательно)
            <input id="ed-note" class="adm-input wide" maxlength="200"></label></div>
        </div>
        <div class="panel adm-card">
          <h2>Билеты</h2>
          <div class="adm-card-sub">Билеты выдаются за задания и открывают кейсы операции.</div>
          <div class="adm-table-wrap" style="border:0">
            <table class="adm-table">
              <thead><tr><th>ID</th><th>Задание</th><th>Кейс</th><th>Статус</th></tr></thead>
              <tbody>${rows || `<tr><td colspan="4" class="adm-empty">Билетов нет</td></tr>`}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  },

  setOperationLevel(level) {
    return this.commit(copy => {
      const op = Operation.load(copy.operation);
      OP_TASKS.forEach((t, i) => {
        op.c[i] = i < level;               // задания выполняются по порядку
        op.p[i] = i < level ? t.n : 0;
      });
      copy.operation = op;
      return null;
    }, `Операция: уровень ${level} из ${OP_TOTAL}`);
  },

  resetOperation() {
    Admin.confirm("Сбросить операцию?", "Уровень станет 0, билеты удалятся. Это нельзя отменить.", "Сбросить", true)
      .then(ok => { if (ok) this.commit(copy => { copy.operation = Operation.load(null); return null; }, "Операция: сброс прогресса"); });
  },

  // ----- «JSON» -----
  jsonHtml() {
    return `
      <div class="panel adm-card">
        <h2>Сохранение целиком (JSON)</h2>
        <div class="adm-card-sub">Полный объект сохранения игрока. Неверная структура может сломать аккаунт: сначала скачайте резервную копию.</div>
        <textarea id="ed-json" class="adm-json" spellcheck="false">${Admin.esc(JSON.stringify(this.save, null, 2))}</textarea>
        <div class="adm-row" style="margin-top:12px">
          <button class="btn" data-act="json-apply">Применить JSON</button>
          <button class="btn-outline" data-act="json-reset">Вернуть из сервера</button>
          <button class="btn-outline" data-act="json-download">Скачать копию</button>
        </div>
      </div>`;
  },

  applyJson() {
    let obj;
    try { obj = JSON.parse(Admin.el("ed-json").value); } catch (e) { return Admin.toast("JSON не разобран: " + e.message, "bad"); }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return Admin.toast("Сохранение должно быть объектом { … }", "bad");
    // copy — рабочая копия из commit: при ошибке сервера сохранение игрока не меняется
    return this.commit(copy => {
      Object.keys(copy).forEach(k => { delete copy[k]; });
      Object.assign(copy, obj);
      return null;
    }, "JSON: сохранение заменено целиком");
  },

  downloadJson() {
    const blob = new Blob([JSON.stringify(this.save, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `save_${this.p.nick}_${this.id}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  },

  // ----- обработчики -----
  onClick(e) {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const act = el.dataset.act;
    switch (act) {
      case "gen-save": return this.saveGeneral();
      case "acc-nick": return this.changeNick();
      case "acc-pass": return this.changePassword();
      case "acc-block": return this.toggleBlock();
      case "acc-delete": return this.deleteAccount();
      case "bal-delta": {
        const delta = +el.dataset.value;
        const cur = Math.round(+this.save.balance || 0);
        const next = Math.max(0, cur + delta);
        const sign = delta > 0 ? "+" : "−";
        return this.setBalance(next, `Баланс: ${sign}${Admin.fmt(Math.abs(delta))} ₽ (${Admin.fmt(cur)} → ${Admin.fmt(next)})`);
      }
      case "bal-set": {
        const v = Math.round(Number(Admin.el("ed-bal").value));
        if (!Number.isFinite(v) || v < 0) return Admin.toast("Баланс — число от 0", "bad");
        const cur = Math.round(+this.save.balance || 0);
        return this.setBalance(v, `Баланс: ${Admin.fmt(cur)} → ${Admin.fmt(v)} ₽`);
      }
      case "item-pick":
        this.pick = el.dataset.id;
        return this.refreshPicker();
      case "item-add": return this.addItem(el.dataset.key);
      case "item-del": return this.removeItem(el.dataset.key, el.dataset.uid);
      case "item-clear": return this.clearItems(el.dataset.key);
      case "stat-save": return this.saveStats();
      case "ach-one": return this.setAchievements([+el.dataset.id], el.dataset.on === "1");
      case "ach-all": {
        const on = el.dataset.on === "1";
        const ids = ACHIEVEMENTS.map(a => a.id);
        return Admin.confirm(on ? "Выдать все достижения?" : "Забрать все достижения?",
          on ? `Будут выданы все ${ids.length} достижений.` : "Все отметки о достижениях будут сняты.",
          on ? "Выдать все" : "Забрать все", !on)
          .then(ok => { if (ok) this.setAchievements(ids, on); });
      }
      case "op-set": {
        const v = Math.round(Number(Admin.el("op-level").value));
        if (!Number.isFinite(v) || v < 0 || v > OP_TOTAL) return Admin.toast(`Уровень — от 0 до ${OP_TOTAL}`, "bad");
        return this.setOperationLevel(v);
      }
      case "op-reset": return this.resetOperation();
      case "json-apply": return this.applyJson();
      case "json-reset": return this.paint();
      case "json-download": return this.downloadJson();
    }
  },

  onChange(e) {
    if (e.target.id === "ach-f") {
      this.achFilter = e.target.value;
      Admin.el("ach-table").innerHTML = this.achTable();
    }
  },

  onInput(e) {
    if (e.target.id === "ed-search") {
      this.pickQuery = e.target.value;
      this.refreshPicker();
    }
    if (e.target.id === "ach-q") {
      this.achQuery = e.target.value;
      Admin.el("ach-table").innerHTML = this.achTable();
    }
  },

  // обновляет только блок выбора предмета (поле поиска не перерисовывается, чтобы не терять ввод)
  refreshPicker() {
    const box = Admin.el("ed-picker");
    if (!box) return;
    const key = this.section === "cs" ? "csInventory" : "inventory";
    box.innerHTML = this.pickerHtml(key);
  },
};
