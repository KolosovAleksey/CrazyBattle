// js/ui/profile.js — Профиль, аватар, статистика, достижения.

Object.assign(UI, {
  avatarHtml(name, avatar) {
    if (avatar) return `<img src="${avatar}" alt="">`;
    return this.esc(((name || "И").trim()[0] || "И").toUpperCase());
  },

  // плитка предмета в профиле: для своих — действия, для проданных/потраченных — статус
  pfTile(h, it) {
    const parts = it.name.split(" | ");
    const weapon = parts.length > 1 ? parts[0] : "";
    const skin = parts.length > 1 ? parts[1] : parts[0];
    const labels = { sold: "Продан", upgrade: "В апгрейде", contract: "В контракте", cs: "В КС", battle: "Проигран в Battle" };
    const shopItem = !!(ITEMS[h.id] && ITEMS[h.id].shop);
    const bottom = h.status === "owned"
      ? `<div class="pf2-item-acts">
           ${shopItem ? "" : `<button data-action="pf-to-ct" data-uid="${h.uid}" title="В контракт">${this.ICON.edit}</button>`}
           <button data-action="pf-to-up" data-uid="${h.uid}" title="В апгрейд">${this.ICON.up}</button>
           <button data-action="pf-sell" data-uid="${h.uid}" title="Продать">${this.ICON.coins}</button>
           <button data-action="cs-withdraw" data-uid="${h.uid}" title="Вывести в КС">КС</button>
         </div>`
      : `<div class="pf2-item-status ${h.status}">${labels[h.status] || ""}</div>`;
    return `
      <div class="pf2-item ${h.status === "owned" ? "" : "gone"}" style="--rc:${this.rc(it.rarity)}">
        <div class="pf2-item-price">${this.fmt(it.price)} ₽${this.wearTag(h)}</div>
        <div class="pf2-item-img"><img src="${itemImg(it)}" alt="" loading="lazy"></div>
        <div class="pf2-item-name"><span>${this.esc(weapon)}</span><b>${this.esc(skin)}</b></div>
        ${bottom}
      </div>`;
  },

  // раскрыть / свернуть подробную статистику
  buildFullStatsHtml(G) {
    const s = G.stats;
    const n = k => s[k] || 0;
    const inv = G.inventory.reduce((a, i) => a + i.price, 0);
    const money = v => `${this.fmt(Math.round(v || 0))} ₽`;
    const created = n("createdAt") ? new Date(s.createdAt) : new Date();
    const days = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000));
    const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");
    const avg = (a, b) => (b ? money(a / b) : money(0));
    const tile = (label, value, cls = "") => `<div class="stat-tile"><span>${label}</span><b class="${cls}">${value}</b></div>`;
    const sec = (title, tiles, extra = "") => `<div class="panel stat-sec"><div class="stat-sec-title">${title}</div><div class="stat-grid">${tiles}</div>${extra}</div>`;
    const START = 0; // стартовый баланс нового аккаунта
    const net = G.balance + inv - (START + n("depTotal"));
    const fmtDate = t => new Date(t).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const deps = (s.deposits || []).slice(0, 5).map(d =>
      `<div class="stat-row"><span>${fmtDate(d.at)}</span><b>+${money(d.amount)}</b></div>`).join("")
      || `<div class="muted" style="font-size:13px">Пополнений пока нет</div>`;

    return `
      ${sec("Аккаунт",
          tile("ID аккаунта", this.esc((G.accountId || "—").slice(0, 8).toUpperCase())) +
          tile("Ник", this.esc(G.profileName || "Игрок")) +
          tile("Дата регистрации", created.toLocaleDateString("ru-RU")) +
          tile("Дней в игре", days) +
          tile("Трейд-ссылка", G.tradeUrl ? "указана" : "не указана") +
          tile("Email", G.email ? "указан" : "не указан"))}
      ${sec("Баланс и итог",
          tile("Баланс", money(G.balance)) +
          tile("Стоимость инвентаря", money(inv)) +
          tile("Стартовый баланс", money(START)) +
          tile("Итог к пополнениям", `${net >= 0 ? "+" : ""}${money(net)}`, net >= 0 ? "pos" : "neg"))}
      ${sec("Пополнения",
          tile("Всего пополнено", money(n("depTotal"))) +
          tile("Количество", n("depCount")) +
          tile("Крупнейшее", money(n("depMax"))) +
          tile("Средняя сумма", avg(n("depTotal"), n("depCount"))),
          `<div class="stat-list">${deps}</div>`)}
      ${sec("Кейсы",
          tile("Открыто кейсов", n("casesOpened")) +
          tile("Потрачено", money(n("spent"))) +
          tile("Средний чек", avg(n("spent"), n("casesOpened"))) +
          tile("Получено предметов", n("obtained")) +
          tile("Стоимость полученного", money(n("obtainedValue"))))}
      ${sec("Апгрейды",
          tile("Попыток", n("upgrades")) +
          tile("Выиграно", n("upgradesWon")) +
          tile("Винрейт", pct(n("upgradesWon"), n("upgrades"))) +
          tile("Вложено", money(n("upSpent"))))}
      ${sec("Контракты",
          tile("Выполнено", n("contracts")) +
          tile("Вложено", money(n("ctSpent"))) +
          tile("Средний вклад", avg(n("ctSpent"), n("contracts"))))}
      ${sec("Продажи",
          tile("Продано предметов", n("soldCount")) +
          tile("Выручка", money(n("earned"))) +
          tile("Средняя цена", avg(n("earned"), n("soldCount"))))}`;
  },

  renderAchievements(G) {
    if (!this.el("pf-ach")) return;
    const list = typeof ACHIEVEMENTS !== "undefined" ? ACHIEVEMENTS : [];
    const isDone = a => { try { return !!a.done(G); } catch (e) { return false; } };
    const got = list.filter(isDone);
    const doneIds = new Set(got.map(a => a.id));
    const locked = list.filter(a => !doneIds.has(a.id));
    const total = list.length;
    const pct = total ? Math.round(got.length / total * 100) : 0;
    this.el("ach-got").textContent = got.length;
    this.el("ach-total").textContent = total;
    this.el("ach-pct").textContent = `${pct}%`;
    this.el("ach-bar").style.width = `${pct}%`;
    // 5 последних полученных (по времени) и 5 ближайших невыполненных (самые лёгкие)
    const at = (G.stats && G.stats.achAt) || {};
    const recent = got.slice().sort((a, b) => (at[b.id] || 0) - (at[a.id] || 0)).slice(0, 5);
    const next = locked.slice().sort((a, b) => (a.pct || 0) - (b.pct || 0)).slice(0, 5);
    const tile = (a, done) => `<div class="pf-ach-tile ${done ? "is-done" : "is-lock"} r-${a.rarity || "common"}" title="${this.esc(a.name)}: ${this.esc(a.desc || "")}">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="${a.icon}"/></svg></div>`;
    const empty = n => Array.from({ length: n }, () => `<div class="pf-ach-tile is-empty"><b>?</b></div>`).join("");
    const row = (label, items, done) => `<div class="pf-ach-sec"><small>${label}</small><div class="pf-ach-row">${items.length ? items.map(a => tile(a, done)).join("") : empty(5)}</div></div>`;
    this.el("ach-grid").innerHTML = row("Последние полученные", recent, true) + row("Ближайшие", next, false);
  },

  renderProfile(G) {
    const s = G.stats;
    this.el("pf-avatar").innerHTML = this.avatarHtml(G.profileName, G.avatar);
    this.el("pf-name-view").textContent = G.profileName || "Игрок";
    this.el("pf-points").textContent = `x ${this.fmt(Math.round(s.spent))}`;
    this.el("pf-balance").textContent = `${this.fmt(G.balance)} ₽`;

    this.el("pf-opened").textContent = s.casesOpened;
    this.el("pf-upgrades").textContent = s.upgrades;
    this.el("pf-contracts").textContent = s.contracts;
    // «Выведено в КС»: реально выведенные в КС скины (csInventory)
    const csSum = G.csInventory.reduce((a, i) => a + i.price, 0);
    this.el("pf-withdrawn").textContent = `${this.fmt(csSum)} ₽`;
    this.el("pf-withdrawn-count").textContent = `${G.csInventory.length} ${this.plural(G.csInventory.length)}`;
    this.renderAchievements(G);

    this.el("pf-best").innerHTML = s.bestDrop
      ? `<div class="pf2-best-img"><img src="${ITEMS[s.bestDrop.id] ? itemImg(ITEMS[s.bestDrop.id]) : `img/items/${s.bestDrop.id || this.findId(s.bestDrop.name)}.webp`}" alt=""></div>
         <div class="pf2-best-name" style="color:${this.rc(s.bestDrop.rarity)}">${this.esc(s.bestDrop.name)}</div>
         <div class="pf2-best-price">${this.fmt(s.bestDrop.price)} ₽</div>`
      : `<div class="muted">Пока нет дропа</div>`;

    // «Весь дроп» — вся история предметов, «Новые» — то, что есть сейчас
    const itemOf = h => (ITEMS[h.id]
      ? { ...ITEMS[h.id], name: variantName(ITEMS[h.id].name, h.variant ?? null), variant: h.variant ?? null,
          wear: h.wear ?? null, price: h.price ?? ITEMS[h.id].price }
      : null);
    let list = this.invFilter === "new"
      ? G.inventory.map(it => ({ uid: it.uid, id: it.id, status: "owned", variant: it.variant ?? null, wear: it.wear ?? null, price: it.price }))
      : G.history.slice().reverse();
    list = list.filter(h => itemOf(h));
    const sort = this.invSort;
    if (sort) {
      list = list.slice().sort((a, b) => sort === "cheap"
        ? itemOf(a).price - itemOf(b).price
        : itemOf(b).price - itemOf(a).price);
    }

    document.querySelectorAll("[data-action='inv-filter']").forEach(b => {
      b.classList.toggle("active", b.dataset.value === this.invFilter);
    });
    document.querySelectorAll("[data-action='inv-sort']").forEach(b => {
      b.classList.toggle("active", !!sort && b.dataset.value === sort);
    });
    this.el("pf-all-count").textContent = G.history.length;
    this.el("pf-new-count").textContent = G.inventory.length;

    // 4 строки по 5 плиток на страницу
    const pf = this.paginate(list, "pf", 20, `${this.invFilter}|${sort || ""}`);
    this.el("pf-inv").innerHTML = pf.items.length
      ? pf.items.map(h => this.pfTile(h, itemOf(h))).join("")
      : `<div class="empty">${G.history.length ? "Ничего не найдено" : "Пока нет предметов — откройте кейс"}</div>`;
    this.el("pf-pager").innerHTML = this.pagerHtml("pf", pf.page, pf.pages);

    const inv = G.inventory;
    const total = inv.reduce((a, b) => a + b.price, 0);
    const sell = this.el("pf-sell-all");
    sell.disabled = inv.length === 0;
    sell.textContent = inv.length
      ? `Продать ${inv.length} ${this.plural(inv.length)} за ${this.fmt(total)} ₽`
      : "Продать";
  },

  // модалка настроек: никнейм и аватарка
  showSettingsModal(G) {
    this.pendingAvatar = undefined;
    this.el("modal-root").innerHTML = `
      <div class="modal-backdrop" id="modal-bg">
        <div class="modal set-modal">
          <div class="modal-head">
            <b>Настройки профиля</b>
            <button class="x" data-action="close-modal">✕</button>
          </div>
          <div class="set-row">
            <div class="set-av" id="set-av">${this.avatarHtml(G.profileName, G.avatar)}</div>
            <div class="set-av-tools">
              <label class="field-label">Аватарка</label>
              <input type="file" id="set-avatar" accept="image/*">
              <button class="btn-ghost set-reset" data-action="avatar-reset">Сбросить аватарку</button>
            </div>
          </div>
          <label class="field-label">Никнейм</label>
          <input type="text" id="set-name" class="set-input" maxlength="20" value="${this.esc(G.profileName || "")}">
          <div class="set-account">
            Аккаунт: <b>${this.esc(Auth.nick || "—")}</b> · в рейтинге он же
            <button class="btn-ghost set-logout" data-action="auth-logout">Выйти</button>
          </div>
          <div class="set-actions">
            <button class="btn-ghost" data-action="close-modal">Отмена</button>
            <button class="btn" data-action="settings-save">Сохранить</button>
          </div>
        </div>
      </div>`;
    this.el("modal-bg").addEventListener("click", e => {
      if (e.target.id === "modal-bg") this.closeModal();
    });
  },

  // аватарка: квадрат 128px, обрезка по центру
  previewAvatar(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 128;
        const c = document.createElement("canvas");
        c.width = size;
        c.height = size;
        const ctx = c.getContext("2d");
        const k = Math.max(size / img.width, size / img.height);
        const w = img.width * k, h = img.height * k;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        this.pendingAvatar = c.toDataURL("image/jpeg", 0.85);
        this.refreshAvatarPreview(this.pendingAvatar);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  },

  refreshAvatarPreview(src) {
    const el = this.el("set-av");
    if (!el) return;
    const name = document.getElementById("set-name");
    el.innerHTML = src ? `<img src="${src}" alt="">` : this.avatarHtml(name ? name.value : "", "");
  },

  findId(name) {
    const it = Object.values(ITEMS).find(i => i.name === name);
    return it ? it.id : "item_1";
  },
});
