// js/game/battle.js — Battle: режимы, боты, старт баттла.

Object.assign(Game, {
  // бот: дроп из кейса обычным роллом (без «Подкрута»)
  battleBotRoll(caseData) {
    const d = this.pickWeighted(caseData.drops, x => x.chance);
    return this.rollInstance(d.itemId);
  },

  battleSetMode(mode) {
    this.battleState.mode = mode;
    this.battleState.result = null;
    this.battleState.skinUid = null;
    UI.renderBattle(this);
  },

  battleBack() {
    this.battleState.mode = null;
    this.battleState.result = null;
    this.battleState.skinUid = null;
    UI.renderBattle(this);
  },

  // бот в Skin Battle: случайный предмет (скин или предмет магазина) стоимостью от 30 000 ₽.
  // Пул строится по вариантам (износ / StatTrak / Souvenir), поэтому цена выбранного варианта ≥ 30 000 ₽.
  battleBotPick(minPrice = 30000) {
    if (!this._botPool) {
      this._botPool = [];
      Object.values(ITEMS).forEach(item => {
        const ok = variantList(item).filter(v => v.p >= minPrice);
        if (ok.length) this._botPool.push({ item, ok });
      });
    }
    const { item, ok } = this._botPool[Math.floor(Math.random() * this._botPool.length)];
    const v = ok[Math.floor(Math.random() * ok.length)];
    return this.makeInstance(item, { v: v.v, n: v.n, p: v.p });
  },

  battlePickSkin(uid) {
    const B = this.battleState;
    B.skinUid = B.skinUid === uid ? null : uid;
    UI.renderBattle(this);
  },

  battleSetCase(id) {
    if (CASES[id]) this.battleState.caseId = id;
    UI.renderBattle(this);
  },

  battleSetCount(n) {
    this.battleState.count = +n;
    UI.renderBattle(this);
  },

  // Skin Battle: бот получает случайный скин (случайный кейс + обычный ролл); дороже — побеждает
  battleSkinStart() {
    const B = this.battleState;
    const idx = this.inventory.findIndex(i => i.uid === B.skinUid);
    if (idx < 0) { UI.toast("Выберите свой скин", "warn"); return; }
    const mine = this.inventory[idx];
    SFX.play("battle_skin");
    const bot = this.battleBotPick(30000);
    const outcome = mine.price > bot.price ? "win" : mine.price < bot.price ? "lose" : "tie";
    if (outcome === "win") {
      this.addToInventory(bot);             // забирает скин бота, свой остаётся
    } else if (outcome === "lose") {
      this.inventory.splice(idx, 1);        // свой скин уходит боту
      this.setStatus(mine, "battle");
      B.skinUid = null;
    }
    B.result = { kind: "skin", outcome, mine: [{ ...mine }], bot: [{ ...bot }] };
    this.stats.skinBattles = (this.stats.skinBattles || 0) + 1;
    if (outcome === "win") this.stats.skinWins = (this.stats.skinWins || 0) + 1;
    Operation.track(this, "battle", { win: outcome === "win" });
    this.save();
    UI.toast(outcome === "win" ? "Победа в Battle" : outcome === "lose" ? "Бот выиграл Battle" : "Ничья в Battle", outcome === "win" ? "success" : "warn");
    this.refreshCurrentView();
  },

  // Case Battle: игрок платит цена × количество; бот открывает столько же; больше суммарный дроп — забирает всё
  battleCaseStart() {
    const B = this.battleState;
    const c = CASES[B.caseId];
    if (!c) { UI.toast("Выберите кейс", "warn"); return; }
    SFX.play("battle_case");
    const n = B.count;
    const cost = c.price * n;
    if (this.balance < cost) { UI.toast("Недостаточно средств на балансе", "error"); return; }
    this.balance -= cost;
    this.stats.spent += cost;
    this.stats.casesOpened += n;
    UI.updateBalance(this.balance);

    const mine = [], bot = [];
    for (let i = 0; i < n; i++) mine.push(this.getRandomItem(c.drops, c.price));
    for (let i = 0; i < n; i++) bot.push(this.battleBotRoll(c));
    const sum = arr => arr.reduce((s, x) => s + x.price, 0);
    const ms = sum(mine), bs = sum(bot);
    const outcome = ms > bs ? "win" : ms < bs ? "lose" : "tie";
    if (outcome === "win") {
      mine.forEach(it => this.addToInventory(it));
      bot.forEach(it => this.addToInventory(it));
    } else if (outcome === "tie") {
      mine.forEach(it => this.addToInventory(it));  // каждый оставляет своё
    } else {
      mine.forEach(it => this.history.push({ uid: this.makeUid(), id: it.id, status: "battle",
        variant: it.variant ?? null, wear: it.wear ?? null, price: it.price }));
    }
    B.result = { kind: "case", outcome, caseName: c.name, count: n,
      mine: mine.map(x => ({ ...x })), bot: bot.map(x => ({ ...x })) };
    Operation.track(this, "battle", { win: outcome === "win" });
    this.save();
    UI.toast(outcome === "win" ? "Победа в Battle" : outcome === "lose" ? "Бот выиграл Battle" : "Ничья в Battle", outcome === "win" ? "success" : "warn");
    this.refreshCurrentView();
  },
});
