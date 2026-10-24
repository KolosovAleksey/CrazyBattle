// js/game/cases.js — Открытие кейсов и продажа предметов.

Object.assign(Game, {
  openCaseView(caseId) {
    const caseData = CASES[caseId];
    if (!caseData) { this.navigate("home"); return; }
    this.currentCaseId = caseId;
    this.openCount = 1;
    UI.renderCaseView(caseData);
  },

  openCase(count = 1, fast = false) {
    if (this.isSpinning) return;
    const caseData = CASES[this.currentCaseId];
    if (!caseData) return;

    // бесплатное открытие по билету операции: без списания баланса, всегда 1 кейс
    const ticket = this.freeTicket && this.freeTicket.caseId === this.currentCaseId ? this.freeTicket : null;
    this.freeTicket = null;
    if (ticket) count = 1;
    const totalPrice = ticket ? 0 : caseData.price * count;
    if (!ticket && this.balance < totalPrice) {
      UI.toast("Недостаточно средств на балансе", "error");
      return;
    }

    this.balance -= totalPrice;
    this.stats.spent += totalPrice;
    this.stats.casesOpened += count;
    this.trackCases(this.currentCaseId, caseData, count);
    UI.updateBalance(this.balance);
    Operation.track(this, "open", { caseId: this.currentCaseId, cat: caseData.cat, price: caseData.price, n: count });
    if (totalPrice > 0) Operation.track(this, "spend", { amount: totalPrice });
    if (ticket) Operation.useTicket(this, ticket);

    const dropped = [];
    for (let i = 0; i < count; i++) dropped.push(this.getRandomItem(caseData.drops, caseData.price));

    // «Быстро» — результат сразу, без анимации
    if (fast) {
      this.finishOpen(dropped);
      return;
    }

    // обычное открытие — каждая рулетка крутится с анимацией
    this.isSpinning = true;
    UI.setCaseButtonsEnabled(false);
    UI.hideCaseResults();
    UI.setCasePlaying(true);
    const rolls = dropped.map(f => this.generateRouletteItems(caseData.drops, f));
    const strips = UI.renderRolls(rolls);
    this.spinRolls(rolls, strips, dropped);
    SFX.ticks("case_tick", 5500, { vol: 0.7 });
  },

  finishOpen(dropped) {
    SFX.play(dropSoundFor(dropped));
    this.pendingDrop = dropped.map(item => this.addToInventory(item));
    dropped.forEach(it => Operation.track(this, "obtain", { price: it.price, rarity: it.rarity }));
    UI.renderResults(this.pendingDrop);
    UI.setCaseButtonsEnabled(false);
    this.save();
  },

  spinRolls(rolls, strips, dropped) {
    strips.forEach((st, k) => {
      const { strip, win } = st;
      const W = strip.firstElementChild ? strip.firstElementChild.offsetWidth : this.ITEM_WIDTH;
      this.ITEM_WIDTH = W;
      const winIndex = rolls[k].winIndex;
      const windowCenter = win.offsetWidth / 2;
      const itemCenter = winIndex * W + W / 2;
      const jitter = (Math.random() - 0.5) * W * 0.5;
      const finalPosition = windowCenter - itemCenter - jitter;

      strip.style.transition = "none";
      strip.style.transform = "translateX(0px)";
      void strip.offsetWidth;
      strip.style.transition = "transform 5.5s cubic-bezier(0.12, 0.8, 0.2, 1)";
      strip.style.transform = `translateX(${finalPosition}px)`;
    });

    setTimeout(() => {
      this.isSpinning = false;
      this.finishOpen(dropped);
    }, 5600);
  },

  // «Ещё раз»: возврат к стадии выбора, без прокрутки
  resetCaseSelection() {
    this.pendingDrop = null;
    UI.hideCaseResults();
    UI.setCasePlaying(false);
    UI.renderIdle(CASES[this.currentCaseId]);
    UI.setCaseButtonsEnabled(true);
    UI.updateCaseCount(this);
  },

  // «Продать всё»: продаёт предметы только что открытых кейсов
  sellPending() {
    const items = this.pendingDrop || [];
    if (!items.length) return;
    const total = items.reduce((s, i) => s + i.price, 0);
    SFX.play(items.length > 1 ? "sell_all" : "sell_one");
    items.map(i => i.uid).forEach(uid => this.sellUid(uid));
    this.pendingDrop = null;
    this.save();
    UI.toast(`Продано на ${UI.fmt(total)} ₽`, "success");
    this.resetCaseSelection();
  },

  // все варианты всех предметов (для списка целей апгрейда); ключ варианта: id|вариант|износ
  targetList() {
    if (!this._targets) {
      this._targets = [];
      this._targetMap = new Map();
      Object.values(ITEMS).forEach(item => variantList(item).forEach(o => {
        const inst = this.makeInstance(item, o);
        inst.key = `${item.id}|${o.v || ""}|${o.n || ""}`;
        this._targets.push(inst);
        this._targetMap.set(inst.key, inst);
      }));
    }
    return this._targets;
  },

  targetByKey(key) {
    if (!key) return null;
    this.targetList();
    return this._targetMap.get(key) || null;
  },

  // «Подкрут»: шанс получить предмет дороже кейса удваивается (потолок 99%),
  // остальные предметы пропорционально понижаются
  rigWeights(drops, casePrice) {
    const weights = drops.map(d => d.chance);
    const hi = drops.map(d => (ITEMS[d.itemId]?.price || 0) > casePrice);
    const total = weights.reduce((a, b) => a + b, 0);
    const pHi = weights.reduce((a, w, i) => a + (hi[i] ? w : 0), 0) / total;
    if (pHi <= 0 || pHi >= 0.99) return weights;
    const target = Math.min(0.99, pHi * this.rigMult);
    const kHi = target / pHi, kLo = (1 - target) / (1 - pHi);
    return weights.map((w, i) => w * (hi[i] ? kHi : kLo));
  },

  getRandomItem(drops, casePrice = 0) {
    const weights = this.rigged && casePrice ? this.rigWeights(drops, casePrice) : drops.map(d => d.chance);
    const totalChance = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalChance;
    for (let i = 0; i < drops.length; i++) {
      random -= weights[i];
      if (random <= 0) return this.rollInstance(drops[i].itemId);
    }
    return this.rollInstance(drops[0].itemId);
  },

  generateRouletteItems(drops, finalItem) {
    const items = [];
    const totalItems = 70;
    for (let i = 0; i < totalItems; i++) {
      const randomDrop = drops[Math.floor(Math.random() * drops.length)];
      items.push(this.rollInstance(randomDrop.itemId));
    }
    const winIndex = totalItems - 8;
    items[winIndex] = finalItem;
    return { items, winIndex };
  },

  sellItem(index) {
    const it = this.inventory[index];
    if (!it) return;
    const price = this.sellUid(it.uid);
    SFX.play("sell_one");
    this.save();
    this.clearSelections();
    UI.toast(`Продано: ${it.name} (+${UI.fmt(price)} ₽)`, "success");
    this.refreshCurrentView();
  },

  sellAll() {
    if (this.inventory.length === 0) return;
    const total = this.inventory.reduce((s, i) => s + i.price, 0);
    if (!confirm(`Продать все предметы (${this.inventory.length} шт.) за ${UI.fmt(total)} ₽?`)) return;
    SFX.play("sell_all");
    this.stats.sellAll = (this.stats.sellAll || 0) + 1;
    this.inventory.map(i => i.uid).forEach(uid => this.sellUid(uid));
    this.clearSelections();
    this.save();
    UI.toast(`Продано предметов на ${UI.fmt(total)} ₽`, "success");
    this.refreshCurrentView();
  },

  // продажа одного предмета по uid; возвращает цену (0, если не найден)
  sellUid(uid) {
    const idx = this.inventory.findIndex(i => i.uid === uid);
    if (idx < 0) return 0;
    const item = this.inventory[idx];
    this.inventory.splice(idx, 1);
    this.balance += item.price;
    this.stats.soldCount++;
    this.stats.earned += item.price;
    Operation.track(this, "sell", { price: item.price });
    this.setStatus(item, "sold");
    UI.updateBalance(this.balance);
    return item.price;
  },

  // продажа одного предмета из результата открытия; остальные остаются в инвентаре
  pendingSell(uid) {
    if (!this.pendingDrop) return;
    const price = this.sellUid(uid);
    if (!price) return;
    SFX.play("sell_one");
    UI.toast(`Продано: +${UI.fmt(price)} ₽`, "success");
    this.pendingDrop = this.pendingDrop.filter(i => i.uid !== uid);
    this.save();
    if (!this.pendingDrop.length) {
      this.resetCaseSelection();
      return;
    }
    UI.renderResults(this.pendingDrop);
    UI.setCaseButtonsEnabled(false);
  },
});
