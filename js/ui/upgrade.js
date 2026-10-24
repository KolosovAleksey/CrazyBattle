// js/ui/upgrade.js — Апгрейд: инвентарь, цель, колесо шансов.

Object.assign(UI, {
  ICON: {
    lock: `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`,
    edit: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>`,
    up: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l7-7 7 7M5 19l7-7 7 7"/></svg>`,
    coins: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v4c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 10v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4"/></svg>`,
  },

  plural(n) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return "предмет";
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "предмета";
    return "предметов";
  },

  chanceLabel(c) {
    if (c < 10) return "рискованно";
    if (c < 30) return "неплохой шанс";
    if (c < 60) return "хороший шанс";
    return "отличный шанс";
  },

  // Плитка предмета: цена сверху, оружие мелко, скин жирно; locked — заблокирована
  upTile(item, o = {}) {
    const parts = item.name.split(" | ");
    const weapon = parts.length > 1 ? parts[0] : "";
    const skin = parts.length > 1 ? parts[1] : parts[0];
    const attrs = [
      o.action && !o.locked ? `data-action="${o.action}"` : "",
      o.index !== undefined ? `data-index="${o.index}"` : "",
      o.id ? `data-id="${o.id}"` : "",
    ].join(" ");
    return `
      <div class="ut ${o.selected ? "selected" : ""} ${o.locked ? "locked" : ""}" style="--rc:${this.rc(item.rarity)}" ${attrs}>
        ${o.selected ? `<span class="ut-check">✓</span>` : ""}
        <div class="ut-price">${this.fmt(item.price)} ₽</div>
        <div class="ut-img">
          <img src="${itemImg(item)}" alt="">
          ${o.locked ? `<div class="ut-lock">${this.ICON.lock}</div>` : ""}
        </div>
        <div class="ut-name"><span>${this.esc(weapon)}</span><b>${this.esc(skin)}</b><small>${item.wear ? this.wearTag(item) : ""}</small></div>
      </div>`;
  },

  // постраничный вывод: { items, page, pages }; сбрасывает страницу, когда меняется фильтр
  paginate(list, key, perPage, sig) {
    this.pg = this.pg || {};
    const pages = Math.max(1, Math.ceil(list.length / perPage));
    const st = this.pg[key] || (this.pg[key] = { page: 1, sig: null });
    if (st.sig !== sig) { st.page = 1; st.sig = sig; }
    st.page = Math.min(Math.max(1, st.page), pages);
    const start = (st.page - 1) * perPage;
    return { items: list.slice(start, start + perPage), page: st.page, pages };
  },

  setPage(key, page) {
    this.pg = this.pg || {};
    if (this.pg[key]) this.pg[key].page = page;
  },

  pagerHtml(key, page, pages) {
    if (pages <= 1) return "";
    return `<div class="pager">
      <button class="pg-btn" data-action="pager" data-key="${key}" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>‹</button>
      <span class="pg-info">${page} из ${pages}</span>
      <button class="pg-btn" data-action="pager" data-key="${key}" data-page="${page + 1}" ${page >= pages ? "disabled" : ""}>›</button>
    </div>`;
  },

  // одиночный предмет в ставке: большая карточка, как «Оружие, которое хотите получить»
  upSoloHtml(p, view) {
    const it = p.it;
    const parts = it.name.split(" | ");
    const weapon = parts.length > 1 ? parts[0] : "";
    const skin = parts.length > 1 ? parts[1] : parts[0];
    const act = view ? "" : `data-action="up-toggle" data-index="${p.i}"`;
    return `<div class="up-solo" ${act} style="--rc:${this.rc(it.rarity)}">
      <div class="up-card-img"><img src="${itemImg(it)}" alt=""></div>
      <div class="up-card-foot">
        <div><b>${this.esc(skin)}</b><small>${this.esc(weapon)}${this.wearTag(it)}</small></div>
        <span class="price">${this.fmt(it.price)} ₽</span>
      </div>
    </div>`;
  },

  renderUpgrade(G) {
    this.applyUpTools();
    this.applyQuickButtons();
    this.renderUpInv(G);
    this.renderTargetList(G);

    // подсветка множителя (только если цель не выбрана вручную)
    document.querySelectorAll("#up-mults [data-action='up-mult']").forEach(b => {
      const m = G.up.mult;
      const kind = b.dataset.kind, val = +b.dataset.value;
      let active = false;
      if (m && !G.up.targetId) {
        active = kind === "rand" ? !!m.rand : (!m.rand && m.kind === kind && m.value === val);
      }
      b.classList.toggle("active", active);
    });

    this.updateUpgradeDynamic(G);
  },

  renderUpInv(G) {
    // 2 строки по 5 плиток на страницу
    // сортировка по цене: по умолчанию от дешёвых к дорогим, индексы инвентаря сохраняются
    const dir = this.upInvSort || "asc";
    const order = G.inventory.map((_, i) => i).sort((a, b) =>
      dir === "asc" ? G.inventory[a].price - G.inventory[b].price : G.inventory[b].price - G.inventory[a].price);
    const pg = this.paginate(order, "upInv", 10, "inv|" + dir);
    const sortBtn = this.el("up-inv-sort");
    if (sortBtn) sortBtn.textContent = dir === "asc" ? "Сначала дешёвые ↑" : "Сначала дорогие ↓";
    this.el("up-inv-grid").innerHTML = G.inventory.length
      ? pg.items.map(i => this.upTile(G.inventory[i], {
          index: i, selected: G.up.selected.includes(i), action: "up-toggle",
        })).join("")
      : `<div class="empty">Инвентарь пуст — откройте кейс</div>`;
    this.el("up-inv-pager").innerHTML = this.pagerHtml("upInv", pg.page, pg.pages);
    this.el("up-inv-count").textContent = `(${G.inventory.length} шт.)`;
    this.el("up-count").textContent = `Ставка ${G.up.selected.length}/${UPGRADE.MAX_ITEMS}`;
  },

  // Список целей: сортировка, фильтр цены, поиск; предметы дешевле/равные ставке заблокированы
  renderTargetList(G) {
    const f = this.upFilter;
    const bank = G.upBank();
    // мистический: список предметов скрыт — что выпадет, узнаете после прокачки
    if (G.up.mult && G.up.mult.kind === "mystic") {
      this.el("up-target-grid").innerHTML = `<div class="empty mystic-hide">✦ Предмет скрыт — узнаете после прокачки<br><small>Шанс окупиться 50%: предмет дороже ставки или дешевле</small></div>`;
      this.el("up-target-pager").innerHTML = "";
      return;
    }
    // выбран x или процент: фильтр цен встаёт на диапазон, где шанс = номинал ± UPGRADE.BAND
    if (f.auto && G.up.mult && !G.up.targetId && bank > 0) {
      const b = G.upRange(bank);
      f.min = String(Math.ceil(b.min));
      f.max = String(Math.floor(b.max));
      this.el("up-f-min").value = f.min;
      this.el("up-f-max").value = f.max;
    }
    const min = f.min === "" ? -Infinity : +f.min;
    const max = f.max === "" ? Infinity : +f.max;
    // все варианты всех скинов: обычные, StatTrak™, Souvenir — каждый износ отдельной плиткой
    let list = G.targetList().filter(i =>
      i.price >= min && i.price <= max && (!f.q || i.name.toLowerCase().includes(f.q)));
    if (f.sort === "price-desc") list.sort((a, b) => b.price - a.price);
    else if (f.sort === "price-asc") list.sort((a, b) => a.price - b.price);
    else list.sort((a, b) => a.name.localeCompare(b.name));

    // 2 строки по 5 плиток на страницу
    const pg = this.paginate(list, "upTgt", 10, JSON.stringify(f));
    this.el("up-target-grid").innerHTML = list.length
      ? pg.items.map(i => this.upTile(i, {
          action: "up-target", id: i.key,
          selected: G.up.targetId === i.key,
          locked: !(G.up.mult && G.up.mult.kind === "mystic") &&
            (i.price <= bank || bank * (1 - UPGRADE.EDGE) / i.price * 100 < UPGRADE.MIN_CHANCE),
        })).join("")
      : `<div class="empty">Ничего не найдено</div>`;
    this.el("up-target-pager").innerHTML = this.pagerHtml("upTgt", pg.page, pg.pages);
  },

  // Динамическая часть: слоты ставки, слайдер, шанс, колесо, кнопка (слайдер не пересоздаётся)
  updateUpgradeDynamic(G) {
    const spinning = G.up.spinning;
    const view = spinning && G.up.spinView ? G.up.spinView : null;
    const c = view || G.upCompute();
    const N = UPGRADE.MAX_ITEMS;

    // слайдер баланса
    const sl = this.el("up-balance-slider");
    sl.max = Math.max(0, Math.floor(G.balance));
    sl.disabled = spinning || G.balance < 1;
    sl.value = G.up.balanceAdd;
    this.fillSlider(sl);
    this.el("up-balance-val").textContent = `${this.fmt(G.up.balanceAdd)} ₽`;
    this.el("up-balance-max").textContent = `(макс. ${this.fmt(G.balance)})`;

    // слоты ставки: выбранные предметы + пустые
    const picked = view
      ? view.items.map(it => ({ it, i: -1 }))
      : G.up.selected.map(i => ({ it: G.inventory[i], i })).filter(x => x.it);
    let slots = "";
    for (let k = 0; k < N; k++) {
      const p = picked[k];
      slots += p
        ? `<div class="up-slot" ${view ? "" : `data-action="up-toggle" data-index="${p.i}"`} style="--rc:${this.rc(p.it.rarity)}">
             <span class="us-price">${this.fmt(p.it.price)} ₽</span>
             <img src="${itemImg(p.it)}" alt="">
             <span class="us-name">${this.esc(p.it.name)}</span>
           </div>`
        : `<div class="up-slot"><img class="ghost" src="img/items/item_1.webp" alt=""></div>`;
    }
    this.el("up-bank-slots").innerHTML = picked.length === 1
      ? this.upSoloHtml(picked[0], view)
      : `<div class="up-slots-grid">${slots}</div>`;
    const left = N - picked.length;
    this.el("up-bank-head").textContent = picked.length === 0
      ? "Выберите предметы из инвентаря"
      : left > 0 ? `Можно добавить еще ${left} ${this.plural(left)}` : "Ставка заполнена";
    this.el("up-bank").textContent = `${this.fmt(c.bank)} ₽`;

    // карточка справа: результат (после конца анимации) → мистический секрет → выбранная цель
    const res = !spinning && this.upResult ? this.upResult : null;
    const secret = !res && !!c.mystic;   // мистический: предмет скрыт до выпадения
    const shownItem = res ? res.item : (secret ? null : c.target);
    const imgEl = this.el("up-target-img");
    imgEl.innerHTML = shownItem ? `<img src="${itemImg(shownItem)}" alt="">` : `<div class="ph">?</div>`;
    imgEl.classList.toggle("dim", !!res && !res.win);
    if (res) {
      const parts = res.item.name.split(" | ");
      this.el("up-target-name").textContent = parts.length > 1 ? parts[1] : parts[0];
      this.el("up-target-sub").textContent = res.kicker;
      this.el("up-target-price").textContent = `${this.fmt(res.item.price)} ₽`;
    } else if (secret) {
      this.el("up-target-name").textContent = "Мистический апгрейд";
      this.el("up-target-sub").textContent = "Предмет скрыт до выпадения";
      this.el("up-target-price").textContent = "???";
    } else if (c.target) {
      const parts = c.target.name.split(" | ");
      this.el("up-target-name").textContent = parts.length > 1 ? parts[1] : parts[0];
      this.el("up-target-sub").textContent = parts.length > 1 ? parts[0] : "";
      this.el("up-target-price").textContent = `${this.fmt(c.target.price)} ₽`;
    } else {
      this.el("up-target-name").textContent = "Не выбрано";
      this.el("up-target-sub").textContent = "Выберите предмет справа или множитель";
      this.el("up-target-price").textContent = "";
    }
    this.el("up-target-foot").style.setProperty("--rc", shownItem ? this.rc(shownItem.rarity) : "#2f374e");

    // колесо и шанс (зелёная зона статична внизу)
    const chance = c.bank > 0 && c.target ? c.chance : 0;
    // быстрый режим: золотая зона показывается только если стрелка точно зайдёт в золото
    const golden = !!(view && view.golden && (!this.upCfg().fast || view.gold));
    this.renderWheel(chance, golden);
    const chanceEl = this.el("up-chance");
    chanceEl.textContent = chance > 0 ? `${chance.toFixed(2)}%` : "—";
    chanceEl.classList.toggle("off", chance <= 0);
    this.el("up-chance-label").textContent = chance > 0 ? this.chanceLabel(chance) : "шанс";

    // кнопка и подсказка
    const canSpin = c.bank > 0 && !!c.target && !spinning;
    const btn = this.el("up-spin");
    btn.disabled = !canSpin;
    btn.textContent = spinning ? "ПРОКАЧКА…" : "ПРОКАЧАТЬ";

    this.renderChainHud(G);

    let hint = "";
    if (spinning) hint = golden ? "✦ Золотой апгрейд! Попадание в золотую зону — приз ×2" : "";
    else if (c.bank <= 0) hint = "Добавьте предметы или баланс в ставку";
    else if (!c.target) hint = "Выберите множитель или предмет справа";
    else if (c.mystic) hint = "✦ Мистический апгрейд: предмет скрыт до выпадения — 50% окуп или 50% нет";
    else hint = `Зелёная зона — выигрыш. Шанс ${chance.toFixed(2)}%`;
    this.el("up-hint").textContent = hint;
  },

  // Колесо: статичный круг, зелёная зона внизу (шанс выигрыша)
  // ширина золотой зоны, градусы: 5% окружности, но не больше половины зелёной дуги
  goldDeg(chance) {
    const span = Math.max(0, Math.min(100, chance)) * 3.6;
    return Math.min(UPGRADE.GOLD_DEG, span / 2);
  },

  renderWheel(chance, golden = false) {
    const R = 92;
    const pt = (deg, r) => {
      const t = (deg * Math.PI) / 180;
      return { x: +(r * Math.sin(t)).toFixed(3), y: +(-r * Math.cos(t)).toFixed(3) };
    };
    const span = Math.max(0, Math.min(100, chance)) * 3.6;
    const a0 = 180 - span / 2, a1 = 180 + span / 2;
    const p = pt(a0, R), q = pt(a1, R);
    const gDeg = golden ? this.goldDeg(chance) : 0;
    const gp = pt(180 - gDeg / 2, R), gq = pt(180 + gDeg / 2, R);
    const gold = span > 0.01 && gDeg > 0
      ? `<g class="gold-zone"><path d="M0 0 L${gp.x} ${gp.y} A${R} ${R} 0 0 1 ${gq.x} ${gq.y} Z" fill="url(#gGold)"/></g>`
      : "";
    const win = span > 0.01
      ? (span >= 359.9
          ? `<circle r="${R}" fill="url(#gWin)"/>`
          : `<path d="M0 0 L${p.x} ${p.y} A${R} ${R} 0 ${span > 180 ? 1 : 0} 1 ${q.x} ${q.y} Z" fill="url(#gWin)"/>`)
      : "";
    const ticks = Array.from({ length: 48 }, (_, i) => {
      const a = i * 7.5;
      const p1 = pt(a, 97), p2 = pt(a, i % 6 === 0 ? 84 : 90);
      return `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="rgba(255,255,255,${i % 6 === 0 ? 0.35 : 0.14})" stroke-width="1.2"/>`;
    }).join("");

    this.el("wheel").innerHTML = `
      <defs>
        <linearGradient id="gWin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#8ff7ff"/><stop offset="1" stop-color="#1592b8"/>
        </linearGradient>
        <linearGradient id="gGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffc2e6"/><stop offset="1" stop-color="#ff2e9a"/>
        </linearGradient>
        <linearGradient id="gLose" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#1a0f24"/><stop offset="1" stop-color="#0b0712"/>
        </linearGradient>
        <radialGradient id="gBase" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="#1a1330"/><stop offset="1" stop-color="#07050f"/>
        </radialGradient>
      </defs>
      <circle r="98" fill="#07060d"/>
      <circle r="97" fill="url(#gBase)"/>
      <circle r="${R}" fill="url(#gLose)"/>
      ${win}
      ${gold}
      ${ticks}
      <circle r="64" fill="#0d0a18"/>
      <circle r="64" fill="none" stroke="#3a2a66" stroke-width="2"/>
      <circle r="97" fill="none" stroke="#3a2a66" stroke-width="2"/>`;
  },
});
