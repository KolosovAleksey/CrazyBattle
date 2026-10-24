// js/game/upgrade.js — Апгрейд: выбор предметов, шансы, розыгрыш и выдача приза.

Object.assign(Game, {
  upSyncTarget() {
    const t = this.targetByKey(this.up.targetId);
    if (t && t.price <= this.upBank()) this.up.targetId = null;
  },

  upBank() {
    const itemsSum = this.up.selected.reduce((s, i) => s + (this.inventory[i]?.price || 0), 0);
    const add = Math.min(this.up.balanceAdd, Math.max(0, Math.floor(this.balance)));
    return itemsSum + add;
  },

  upToggleItem(index) {
    if (this.up.spinning) return;
    SFX.play(this.up.selected.indexOf(index) >= 0 ? "deselect" : "select");
    const pos = this.up.selected.indexOf(index);
    if (pos >= 0) this.up.selected.splice(pos, 1);
    else {
      if (this.up.selected.length >= UPGRADE.MAX_ITEMS) {
        UI.toast(`Максимум ${UPGRADE.MAX_ITEMS} предметов на апгрейд`, "warn");
        return;
      }
      this.up.selected.push(index);
    }
    this.up.mult = null;
    this.up.cachedTarget = null;
    this.upSyncTarget();
    UI.renderUpgrade(this);
  },

  upSetBalance(v) {
    if (this.up.spinning) return;
    this.up.balanceAdd = Math.min(Math.max(0, Math.floor(v)), Math.floor(this.balance));
    this.upSyncTarget();
    UI.renderTargetList(this);
    UI.updateUpgradeDynamic(this);
  },

  upSetTarget(key) {
    const t = this.targetByKey(key);
    if (this.up.spinning || !t) return;
    if (t.price <= this.upBank()) {
      UI.toast("Предмет дешевле или равен ставке — недоступен", "warn");
      return;
    }
    UI.clearUpgradeResult();
    this.up.targetId = key;     // цель выбрана вручную (конкретный вариант и износ): шанс считается от её цены
    this.up.mult = null;
    this.up.cachedTarget = null;
    UI.renderUpgrade(this);
  },

  upSetMult(kind, value) {
    if (this.up.spinning) return;
    UI.clearUpgradeResult();
    this.up.targetId = null;
    UI.upFilter = { ...UI.upFilter, auto: true };   // фильтр цен сам встаёт на диапазон выбранного x / %
    if (kind === "rand") {
      this.up.mult = { kind: "price", value: 1.2 + Math.random() * 8, rand: true };
    } else {
      this.up.mult = { kind, value, rand: false };
    }
    this.up.cachedTarget = null;
    UI.renderUpgrade(this);
  },

  // «Подкрут»: реальный шанс апгрейда = шанс × rigMult (не выше 100%); показывается исходный шанс
  rigChance(c) {
    return this.rigged ? Math.min(100, c * this.rigMult) : c;
  },

  upCompute() {
    const bank = this.upBank();
    const res = { bank, chance: 0, realChance: 0, targetPrice: 0, target: null };

    // цель выбрана вручную: шанс = ставка × (1 − преимущество сайта) / цена цели
    const manual = this.targetByKey(this.up.targetId);
    if (manual) {
      const t = manual;
      if (bank <= 0 || t.price <= bank) return res; // дешевле ставки — недоступно
      const raw = bank * (1 - UPGRADE.EDGE) / t.price * 100;
      if (raw < UPGRADE.MIN_CHANCE) return res; // шанс ниже минимума — цель недоступна (иначе сайт платил бы больше, чем должен)
      res.target = { ...t };
      res.targetPrice = t.price;
      res.chance = Math.min(UPGRADE.MAX_CHANCE, Math.max(UPGRADE.MIN_CHANCE, raw));
      res.realChance = this.rigChance(res.chance);
      return res;
    }

    if (bank <= 0 || !this.up.mult) return res;

    // мистический апгрейд: успех 100%, цель — случайный предмет от ставки ÷3 до ставки ×3
    if (this.up.mult.kind === "mystic") {
      const cachedM = this.up.cachedTarget;
      if (!cachedM || cachedM.bank !== bank) {
        this.up.cachedTarget = { bank, item: this.upPickMystic(bank) };
      }
      res.target = this.up.cachedTarget.item;
      res.targetPrice = res.target.price;
      res.chance = 100;
      res.realChance = 100;
      res.mystic = true;
      return res;
    }

    // цель выбирается один раз для текущей ставки и множителя (меняется при новом выборе и после апгрейда);
    // цель всегда из диапазона цен, где шанс отличается от номинала не больше чем на UPGRADE.BAND
    const cached = this.up.cachedTarget;
    if (!cached || cached.bank !== bank) {
      this.up.cachedTarget = { bank, item: this.upPickBand(bank, this.upNominal()) };
    }
    res.target = this.up.cachedTarget.item;
    res.targetPrice = res.target.price;
    // множитель: шанс по реальной цене цели; заданный процент: шанс фиксирован
    res.chance = this.up.mult.kind === "price"
      ? bank * (1 - UPGRADE.EDGE) / res.target.price * 100
      : this.up.mult.value;
    res.chance = Math.min(UPGRADE.MAX_CHANCE, Math.max(UPGRADE.MIN_CHANCE, res.chance));
    res.realChance = this.rigChance(res.chance);
    return res;
  },

  upPickTarget(targetPrice) {
    const all = this.targetList();
    const inRange = all.filter(i => i.price >= targetPrice * 0.75 && i.price <= targetPrice * 1.3);
    if (inRange.length) return { ...inRange[Math.floor(Math.random() * inRange.length)] };
    return { ...all.reduce((best, i) =>
      Math.abs(i.price - targetPrice) < Math.abs(best.price - targetPrice) ? i : best, all[0]) };
  },

  // номинальный шанс множителя (95% / x) или заданного процента, в пределах MIN..MAX
  upNominal(mult = this.up.mult) {
    if (!mult) return 0;
    const c = mult.kind === "price" ? (1 - UPGRADE.EDGE) * 100 / mult.value : mult.value;
    return Math.min(UPGRADE.MAX_CHANCE, Math.max(UPGRADE.MIN_CHANCE, c));
  },

  // диапазон цен цели для номинального шанса c: шанс = ставка × (1 − преимущество) / цена, допуск ± UPGRADE.BAND
  upBand(bank, c) {
    const k = bank * (1 - UPGRADE.EDGE) * 100;
    const hiC = Math.min(UPGRADE.MAX_CHANCE, c + UPGRADE.BAND);
    const loC = Math.max(UPGRADE.MIN_CHANCE, c - UPGRADE.BAND);
    return { min: k / hiC, max: k / loC };
  },

  // случайная цель из диапазона; если в диапазоне пусто — ближайшая по цене
  upPickBand(bank, c) {
    const { min, max } = this.upBand(bank, c);
    const all = this.targetList();
    const inBand = all.filter(i => i.price >= min && i.price <= max);
    if (inBand.length) return { ...inBand[Math.floor(Math.random() * inBand.length)] };
    const want = bank * (1 - UPGRADE.EDGE) * 100 / c;
    return { ...all.reduce((best, i) =>
      Math.abs(i.price - want) < Math.abs(best.price - want) ? i : best, all[0]) };
  },

  // диапазон цен цели: мистический — ставка ÷3 … ×3; x и % — диапазон шанса ± UPGRADE.BAND
  upRange(bank) {
    const m = this.up.mult;
    if (m && m.kind === "mystic") return { min: bank / m.value, max: bank * m.value };
    return this.upBand(bank, this.upNominal());
  },

  // случайная цель из диапазона цен (равновероятно по предметам)
  upPickRange(min, max) {
    const all = this.targetList();
    const inRange = all.filter(i => i.price >= min && i.price <= max);
    if (inRange.length) return { ...inRange[Math.floor(Math.random() * inRange.length)] };
    const want = (min + max) / 2;
    return { ...all.reduce((best, i) =>
      Math.abs(i.price - want) < Math.abs(best.price - want) ? i : best, all[0]) };
  },

  // мистический исход 50/50: окуп (предмет не дешевле ставки) или не окуп (дешевле); цена внутри половины — случайная
  upPickMystic(bank) {
    const hit = Math.random() < 0.5;
    if (hit) return this.upPickRange(bank, bank * 3);
    return this.upPickRange(bank / 3, bank - 0.01);
  },

  upSpin() {
    if (this.up.spinning) return;
    const { bank, chance, realChance, target, mystic } = this.upCompute();
    if (bank <= 0 || !target) return;
    const spentItems = this.up.selected.map(i => this.inventory[i]).filter(Boolean);
    spentItems.forEach(it => this.setStatus(it, "upgrade"));

    // списываем предметы и баланс
    this.up.selected.sort((a, b) => b - a).forEach(i => this.inventory.splice(i, 1));
    this.up.selected = [];
    const add = Math.min(this.up.balanceAdd, Math.max(0, Math.floor(this.balance)));
    this.balance -= add;
    this.up.balanceAdd = 0;
    this.stats.upgrades++;
    this.stats.upSpent += bank;
    Operation.track(this, "spend", { amount: bank });
    UI.updateBalance(this.balance);

    this.up.chain = null;
    this.upRun({ bank, chance, realChance, target, items: spentItems, chain: false, mystic: !!mystic });
  },

  // один прокрут. Золото бросается только на обычном прокруте (не внутри цепочки).
  // Золотой прокрут всегда медленный, даже в быстром режиме.
  upRun(p) {
    const golden = !p.chain && !p.mystic && Math.random() * 100 < UPGRADE.GOLD_CHANCE;
    const win = p.mystic || Math.random() * 100 < p.realChance;
    const gold = golden && win && Math.random() * 100 < UPGRADE.GOLD_LAND;
    if (gold) this.stats.goldHits = (this.stats.goldHits || 0) + 1;
    if (win) {
      this.stats.upgradesWon++;
      if (!p.mystic) {
        const c = p.chance;
        if (this.stats.lowestWinChance == null || c < this.stats.lowestWinChance) this.stats.lowestWinChance = c;
      }
    }
    const outcome = { win, gold, golden };

    // снимок ставки на время вращения: ставка уже списана, колесо показывает шанс и золото
    this.up.spinView = { bank: p.bank, chance: p.chance, target: p.target, items: p.items, golden, gold, mystic: !!p.mystic };
    this.up.spinning = true;
    UI.clearUpgradeResult();
    UI.renderUpgrade(this);
    if (p.mystic) UI.playMystic(p.target, () => this.upResolve(p, outcome), p.bank);
    else UI.spinUpgradeWheel({ chance: p.chance, win, gold, golden, chain: p.chain }, () => this.upResolve(p, outcome));
  },

  // предмет по цене из списка целей (без служебного ключа)
  upPrize(price) {
    const { key, ...item } = this.upPickTarget(price);
    return item;
  },

  upResolve(p, o) {
    if (!p.chain) Operation.track(this, "upgrade", { win: !!o.win, chance: p.chance });
    // шаг цепочки ×2: выигрыш — предмет снова ставится на ×2 и крутится дальше;
    // проигрыш — забираем последний поставленный предмет (защищённая ставка)
    if (p.chain) {
      if (o.win) {
        const { key, ...next } = p.target;
        const depth = this.up.chain.depth + 1;
        this.up.chain = { depth, bet: next };
        Operation.track(this, "chain", { depth });
        UI.renderChainHud(this);   // панель сразу показывает новый шаг
        this.save();
        UI.showUpgradeResult(true, next, p.chance, {
          gold: true, kicker: `Цепочка ×2 · шаг ${depth}`,
          sub: "Выигрыш автоматически ставится на ×2",
        });
        setTimeout(() => this.upChainNext(), 2200);
        return;
      }
      const { key, ...back } = p.items[0];
      const item = this.addToInventory(back);
      this.up.chain = null;
      UI.showUpgradeResult(true, item, p.chance, {
        gold: true, kicker: "Защищено золотом", sub: "Последняя ставка возвращена в инвентарь",
      });
      this.upFinish();
      return;
    }

    // золото на обычном прокруте: приз ×2 запускает цепочку
    if (o.gold) {
      const prize = this.upPrize(p.target.price * UPGRADE.GOLD_MULT);
      this.up.chain = { depth: 1, bet: prize };
      Operation.track(this, "chain", { depth: 1 });
      this.save();
      UI.showUpgradeResult(true, prize, p.chance, {
        gold: true, kicker: "Золото! Цепочка ×2",
        sub: "Приз автоматически ставится в апгрейд на ×2",
      });
      setTimeout(() => this.upChainNext(), 2200);
      return;
    }

    if (o.win) {
      const { key, ...inst } = p.target;
      const item = this.addToInventory(inst);
      Operation.track(this, "obtain", { price: item.price, rarity: item.rarity });
      UI.showUpgradeResult(true, item, p.chance);
    } else {
      UI.showUpgradeResult(false, p.target, p.chance);
    }
    this.upFinish();
  },

  upFinish() {
    this.up.spinning = false;
    this.up.spinView = null;
    this.up.cachedTarget = null;
    this.up.mult = null;
    this.save();
    UI.updateBalance(this.balance);
    UI.renderUpgrade(this);
  },

  // следующий прокрут цепочки: ставка = последний приз, цель = ×2 от него
  upChainNext() {
    const c = this.up.chain;
    if (!c) return;
    const bank = c.bet.price;
    const target = this.upPickBand(bank, this.upNominal({ kind: "price", value: UPGRADE.GOLD_MULT }));
    const chance = Math.min(UPGRADE.MAX_CHANCE, Math.max(UPGRADE.MIN_CHANCE,
      bank * (1 - UPGRADE.EDGE) / target.price * 100));
    this.upRun({ bank, chance, realChance: this.rigChance(chance), target, items: [c.bet], chain: true });
  },
});
