// js/ui/cs.js — КС: инвентарь, снаряжение, рейтинг.

Object.assign(UI, {
  renderCs(G) {
    if (this.csTab) {
      if (!G.stats.csTabs) G.stats.csTabs = [];
      if (!G.stats.csTabs.includes(this.csTab)) G.stats.csTabs.push(this.csTab);
    }
    document.querySelectorAll("#view-cs .cs-tab[data-value]").forEach(b =>
      b.classList.toggle("active", b.dataset.value === this.csTab));
    const box = this.el("cs-content");
    if (!box) return;
    if (!this.csTab) {
      box.classList.add("hidden");
      box.innerHTML = "";
      return;
    }
    box.classList.remove("hidden");
    if (this.csTab === "inventory") box.innerHTML = this.csInventoryHtml(G);
    else if (this.csTab === "loadout") box.innerHTML = this.csLoadoutHtml(G);
    else {
      box.innerHTML = this.csRatingHtml(G);
      this.loadRating();
    }
  },

  // рейтинг — реальные зарегистрированные игроки с сервера (GET /api/leaderboard)
  async loadRating() {
    const body = document.getElementById("cs-rating-body");
    if (!body) return;
    const msg = text => `<tr><td colspan="4" class="cs-rating-msg">${text}</td></tr>`;
    try {
      const r = await Auth.api("GET", "/api/leaderboard");
      if (!r.ok) { body.innerHTML = msg("Рейтинг недоступен"); return; }
      const rows = r.data.rows || [];
      if (!rows.length) { body.innerHTML = msg("Пока никого. Станьте первым!"); return; }
      const me = r.data.me;
      body.innerHTML = rows.map((row, i) => {
        const mine = row.nick === me;
        return `<tr class="${mine ? "me" : ""}">
          <td>${i + 1}</td><td>${this.esc(row.nick)}${mine ? " (вы)" : ""}</td>
          <td>${row.count}</td><td>${this.fmt(row.value)} ₽</td></tr>`;
      }).join("");
    } catch (e) {
      body.innerHTML = msg("Рейтинг недоступен");
    }
  },

  csCard(it, attrs = "", mark = "") {
    const meta = RARITY_META[it.rarity] || { color: "#8b96a3" };
    const parts = it.name.split(" | ");
    return `<div class="cs-card" ${attrs} style="--rc:${meta.color}">
      ${mark}
      <div class="cs-card-img"><img src="${itemImg(it)}" alt="" loading="lazy"></div>
      <div class="cs-card-name">${parts.length > 1 ? `<span>${this.esc(parts[0])}</span>` : ""}<b>${this.esc(parts.length > 1 ? parts[1] : parts[0])}</b></div>
      <div class="cs-card-price">${this.fmt(it.price)} ₽</div>
    </div>`;
  },

  csSorted(list) {
    return list.slice().sort((a, b) => csRank(b) - csRank(a) || b.price - a.price);
  },

  csInventoryHtml(G) {
    const f = this.csInvFilter || "all";
    const filters = [["all", "Все"], ["knife", "Ножи"], ["gloves", "Перчатки"], ["pistol", "Пистолеты"], ["mid", "Промежуточное"], ["rifle", "Винтовки"], ["other", "Прочее"]];
    const total = G.csInventory.reduce((s, i) => s + i.price, 0);
    const equipped = [...Object.values(G.csLoadout.ct), ...Object.values(G.csLoadout.t)];
    const list = this.csSorted(G.csInventory.filter(i => f === "all" || csCategory(i) === f));
    const chips = filters.map(([v, l]) =>
      `<button class="cs-chip ${f === v ? "active" : ""}" data-action="cs-inv-filter" data-value="${v}">${l}</button>`).join("");
    const cards = list.length
      ? list.map(it => this.csCard(it, "", equipped.includes(it.uid) ? `<span class="cs-eq">надет</span>` : "")).join("")
      : `<div class="muted">В инвентаре КС пока пусто. Выведите скины с сайта в профиле кнопкой «КС».</div>`;
    return `
      <div class="cs-head"><b>Инвентарь КС</b><span>${G.csInventory.length} предм. · ${this.fmt(total)} ₽</span></div>
      <div class="cs-toolbar">${chips}</div>
      <div class="cs-grid">${cards}</div>`;
  },

  csLoadoutHtml(G) {
    const side = this.csSide || "ct";
    const sideName = s => s === "ct" ? "Спецназ (КТ)" : "Террористы (Т)";
    // sd — чья экипировка показана (ножи и перчатки привязаны к своему оперативнику)
    const slotHtml = (s, sd) => {
      const L = G.csLoadout[sd] || {};
      const it = L[s.key] ? G.csInventory.find(i => i.uid === L[s.key]) : null;
      const selected = this.csSlot === s.key && sd === side;
      return `<div class="cs-slot ${selected ? "selected" : ""}" data-action="cs-slot" data-value="${s.key}" data-side="${sd}">
        <div class="cs-slot-label">${s.label}</div>
        ${it ? `<img src="${itemImg(it)}" alt="">` : `<div class="cs-slot-empty">пусто</div>`}
        <div class="cs-slot-name">${it ? this.esc(it.name) : "—"}</div>
        ${it ? `<button class="cs-unequip" data-action="cs-unequip" data-value="${s.key}" data-side="${sd}">Снять</button>` : ""}
      </div>`;
    };
    const opBox = s => `<div class="cs-op-wrap">
        <div class="cs-op ${side === s ? "active" : ""}" data-action="cs-side" data-value="${s}">
          <img src="img/cs/op_${s}.webp?v=2" alt="">
          <div class="cs-op-label">${sideName(s)}</div>
        </div>
        <div class="cs-op-slots">${["knife", "gloves"].map(k => slotHtml(CS_SLOTS.find(x => x.key === k), s)).join("")}</div>
      </div>`;
    const col = title => `<div class="cs-col">
        <div class="cs-group-title">${title}</div>
        ${CS_SLOTS.filter(x => x.group === title).map(x => slotHtml(x, side)).join("")}
      </div>`;
    const cols = ["Пистолеты", "Промежуточное", "Винтовки"].map(col).join("");
    let pick = `<div class="cs-note">Нажмите на слот, затем на скин из инвентаря КС, чтобы закупить его.</div>`;
    if (this.csSlot) {
      const def = CS_SLOTS.find(x => x.key === this.csSlot);
      const items = this.csSorted(G.csInventory.filter(i => csCategory(i) === def.cat));
      pick = `<div class="cs-note">Подходящие предметы для слота «${def.label}»:</div>
        <div class="cs-grid">${items.length
          ? items.map(it => this.csCard(it, `data-action="cs-equip" data-uid="${it.uid}"`)).join("")
          : `<div class="muted">Нет подходящих предметов в инвентаре КС</div>`}</div>`;
    }
    return `
      <div class="cs-lo">
        ${opBox("ct")}
        <div class="cs-lo-mid">
          <div class="cs-lo-head">Закупка · ${sideName(side)}</div>
          <div class="cs-cols">${cols}</div>
          <div class="cs-pick">${pick}</div>
        </div>
        ${opBox("t")}
      </div>`;
  },

  csRatingHtml(G) {
    return `
      <div class="cs-head"><b>Рейтинг</b><span>по стоимости выведенного инвентаря</span></div>
      <table class="cs-table">
        <thead><tr><th>#</th><th>Игрок</th><th>Предметов</th><th>Стоимость</th></tr></thead>
        <tbody id="cs-rating-body"><tr><td colspan="4" class="cs-rating-msg">Загрузка…</td></tr></tbody>
      </table>`;
  },
});
