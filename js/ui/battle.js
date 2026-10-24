// js/ui/battle.js — Battle: выбор режима, слоты, результаты.

Object.assign(UI, {
  // Вкладка Battle: сначала две карточки режимов, затем отдельная страница выбранного режима
  renderBattle(G) {
    const B = G.battleState;
    const cases = Object.values(CASES).sort((a, b) => a.price - b.price);
    if (!CASES[B.caseId]) B.caseId = cases[0] ? cases[0].id : null;
    const root = this.el("battle-root");
    if (!B.mode) { root.innerHTML = this.btHubHtml(); return; }
    if (B.mode === "skin") {
      root.innerHTML = `<div class="bt-page bt-skin">${this.btBackHtml()}${this.btSkinHtml(G)}</div>`;
    } else {
      root.innerHTML = `<div class="bt-page bt-case">${this.btBackHtml()}${this.btCaseHtml(G, cases)}</div>`;
    }
  },

  btBackHtml() {
    return `<button class="bt-back" data-action="bt-back">← Все режимы</button>`;
  },

  btHubHtml() {
    return `<div class="bt-hub-cards">
        <button class="bt-card bt-card-skin" data-action="bt-mode" data-value="skin">
          <img src="img/battle/skin_battle.jpg" alt="">
          <div class="bt-card-shade"></div>
          <div class="bt-card-body">
            <span class="bt-card-tag">1 на 1 · скин против скина</span>
            <span class="bt-card-name">Skin Battle</span>
            <span class="bt-card-desc">Поставьте свой скин. Бот получает случайный предмет от 30 000 ₽. Дороже — побеждает и забирает оба.</span>
            <span class="bt-card-cta">Играть →</span>
          </div>
        </button>
        <button class="bt-card bt-card-case" data-action="bt-mode" data-value="case">
          <img src="img/battle/case_battle.jpg" alt="">
          <div class="bt-card-shade"></div>
          <div class="bt-card-body">
            <span class="bt-card-tag">кейс против кейса</span>
            <span class="bt-card-name">Case Battle</span>
            <span class="bt-card-desc">Откройте кейсы наравне с ботом. Больше суммарный дроп — забирает всё из обеих сторон.</span>
            <span class="bt-card-cta">Играть →</span>
          </div>
        </button>
      </div>`;
  },

  btItemHtml(it) {
    return `<div class="bt-item" style="--rc:${this.rc(it.rarity)}">
        <img src="${itemImg(it)}" alt="">
        <div class="bt-item-name">${this.esc(it.name)}</div>
        <div class="bt-item-price">${this.fmt(it.price)} ₽</div>
      </div>`;
  },

  // слот арены: «Вы» / «Бот»
  btSlotHtml(label, it, isBot) {
    const cls = isBot ? "bt-slot bt-slot-bot" : "bt-slot bt-slot-me";
    if (!it) {
      return `<div class="${cls}">
          <div class="bt-slot-label">${label}</div>
          <div class="bt-slot-empty">${isBot ? "?" : "+"}</div>
          <div class="bt-slot-sub">${isBot ? "случайный предмет от 30 000 ₽" : "выберите скин ниже"}</div>
        </div>`;
    }
    return `<div class="${cls} reveal" style="--rc:${this.rc(it.rarity)}">
        <div class="bt-slot-label">${label}</div>
        <img class="bt-slot-img" src="${itemImg(it)}" alt="">
        <div class="bt-slot-name" title="${this.esc(it.name)}">${this.esc(it.name)}</div>
        <div class="bt-slot-price">${this.fmt(it.price)} ₽</div>
      </div>`;
  },

  btSkinHtml(G) {
    const B = G.battleState;
    const owned = G.inventory.slice().sort((a, b) => b.price - a.price);
    const sel = owned.find(i => i.uid === B.skinUid);
    const R = B.result && B.result.kind === "skin" ? B.result : null;
    const verdict = R
      ? (R.outcome === "win" ? `<div class="bt-banner win">ПОБЕДА</div>`
        : R.outcome === "lose" ? `<div class="bt-banner lose">ПОРАЖЕНИЕ</div>`
        : `<div class="bt-banner tie">НИЧЬЯ</div>`)
      : "";
    const note = R
      ? `<div class="bt-note bt-note-center">${R.outcome === "win" ? "Вы забираете оба скина: свой и бота."
          : R.outcome === "lose" ? "Ваш скин уходит боту."
          : "Ничья: ваш скин остаётся у вас."}</div>`
      : "";
    const grid = owned.length
      ? owned.map(it => `<button class="bt-pick ${it.uid === B.skinUid ? "selected" : ""}" data-action="bt-pick" data-uid="${it.uid}" title="${this.esc(it.name)}" style="--rc:${this.rc(it.rarity)}">
            <img src="${itemImg(it)}" alt="">
            <span class="bt-pick-name">${this.esc(it.name)}</span>
            <span class="bt-pick-price">${this.fmt(it.price)} ₽</span>
          </button>`).join("")
      : `<div class="muted">В инвентаре пока пусто. Откройте кейс или выиграйте предмет.</div>`;
    const mine = R ? R.mine[0] : sel;
    const bot = R ? R.bot[0] : null;
    return `<div class="bt-head">
        <div class="bt-title">SKIN BATTLE</div>
        <div class="bt-sub">Скин против скина. Дороже — побеждает.</div>
      </div>
      <div class="bt-arena">
        ${this.btSlotHtml("Вы", mine, false)}
        <div class="bt-vs"><span>VS</span></div>
        ${this.btSlotHtml("Бот", bot, true)}
      </div>
      ${verdict}${note}
      <div class="bt-box">
        <div class="bt-desc">Выберите свой скин. Бот получает случайный предмет от 30 000 ₽ (скин или предмет магазина). Победитель забирает оба скина. При ничьей ваш скин остаётся у вас.</div>
        <div class="bt-grid">${grid}</div>
        <div class="bt-bar">
          <div>Ваш скин: <b>${sel ? `${this.esc(sel.name)} · ${this.fmt(sel.price)} ₽` : "не выбран"}</b></div>
          <button class="bt-go" data-action="bt-skin-start" ${sel ? "" : "disabled"}>Сыграть</button>
        </div>
      </div>`;
  },

  btCaseHtml(G, cases) {
    const B = G.battleState;
    const c = CASES[B.caseId];
    const total = c ? c.price * B.count : 0;
    const tiles = cases.map(x => `<button class="bt-tile ${c && x.id === c.id ? "active" : ""}" data-action="bt-case" data-value="${x.id}" title="${this.esc(x.name)}">
          <img src="${x.img}_back.webp" alt="">
          <span class="bt-tile-name">${this.esc(x.name)}</span>
          <span class="bt-tile-price">${this.fmt(x.price)} ₽</span>
        </button>`).join("");
    const counts = [1, 2, 3, 5, 10].map(n => `<button class="bt-count ${B.count === n ? "active" : ""}" data-action="bt-count" data-value="${n}">×${n}</button>`).join("");
    const enough = c && G.balance >= total;
    const stage = c ? `<div class="bt-stage">
          <img class="bt-stage-img" src="${c.img}_back.webp" alt="">
          <div>
            <div class="bt-stage-name">${this.esc(c.name)}</div>
            <div class="bt-stage-price">${this.fmt(c.price)} ₽ за открытие</div>
            <div class="bt-stage-sub">Бот открывает столько же кейсов</div>
          </div>
        </div>` : "";
    const R = B.result && B.result.kind === "case" ? this.btResultHtml(B) : "";
    return `<div class="bt-head">
        <div class="bt-title">CASE BATTLE</div>
        <div class="bt-sub">Кейс против кейса. Больше суммарный дроп — побеждает.</div>
      </div>
      <div class="bt-box">
        <div class="bt-desc">Выберите кейс и количество. Вы платите стоимость своих открытий, бот ничего не платит. Больше суммарный дроп — побеждает и забирает всё из обеих сторон. При ничьей каждый оставляет своё.</div>
        <div class="bt-tiles">${tiles}</div>
        ${stage}
        <div class="bt-counts">${counts}</div>
        <div class="bt-bar">
          <div>Стоимость: <b>${this.fmt(total)} ₽</b> · баланс ${this.fmt(G.balance)} ₽</div>
          <button class="bt-go" data-action="bt-case-start" ${enough ? "" : "disabled"}>${enough ? "Открыть" : "Недостаточно средств"}</button>
        </div>
      </div>
      ${R}`;
  },

  btResultHtml(B) {
    const R = B.result;
    if (!R) return "";
    const title = R.outcome === "win" ? "Вы выиграли" : R.outcome === "lose" ? "Бот выиграл" : "Ничья";
    let note;
    if (R.kind === "skin") {
      note = R.outcome === "win" ? "Вы забираете оба скина: свой и бота."
        : R.outcome === "lose" ? "Ваш скин уходит боту."
        : "Ничья: ваш скин остаётся у вас.";
    } else {
      note = R.outcome === "win" ? "Вы забираете все дропы обеих сторон."
        : R.outcome === "lose" ? "Бот забирает все дропы обеих сторон."
        : "Ничья: каждый оставляет свои дропы.";
    }
    const sum = arr => arr.reduce((s, x) => s + x.price, 0);
    const side = (name, items) => `<div class="bt-side">
        <div class="bt-side-head"><b>${name}</b><span>${this.fmt(sum(items))} ₽</span></div>
        <div class="bt-items">${items.map(i => this.btItemHtml(i)).join("")}</div>
      </div>`;
    const head = R.kind === "case" ? `<div class="bt-note">${this.esc(R.caseName)} × ${R.count}</div>` : "";
    return `<div class="bt-result ${R.outcome}">
        <div class="bt-verdict">${title}</div>
        <div class="bt-note">${note}</div>
        ${head}
        <div class="bt-versus">${side("Вы", R.mine)}${side("Бот", R.bot)}</div>
      </div>`;
  },
});
