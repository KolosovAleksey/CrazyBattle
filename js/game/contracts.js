// js/game/contracts.js — Контракты: выбор предметов, редкость цели, розыгрыш.

Object.assign(Game, {
  ctToggleSort() {
    this.ct.sort = this.ct.sort === "desc" ? "asc" : "desc";
    this.ct.page = 0;
    UI.renderContracts(this);
  },

  ctPage(d) {
    const pages = Math.max(1, Math.ceil(this.inventory.length / CONTRACT.PER_PAGE));
    this.ct.page = Math.min(pages - 1, Math.max(0, this.ct.page + d));
    UI.renderContracts(this);
  },

  ctSum() {
    const itemsSum = this.ct.selected.reduce((s, i) => s + (this.inventory[i]?.price || 0), 0);
    const add = Math.min(this.ct.balanceAdd, Math.max(0, Math.floor(this.balance)));
    return itemsSum + add;
  },

  ctToggleItem(index) {
    if (this.ct.resolving) return;
    UI.clearContractResult();
    const pos = this.ct.selected.indexOf(index);
    if (pos >= 0) this.ct.selected.splice(pos, 1);
    else {
      if (this.ct.selected.length >= CONTRACT.MAX_ITEMS) {
        UI.toast(`Максимум ${CONTRACT.MAX_ITEMS} предметов в контракте`, "warn");
        return;
      }
      this.ct.selected.push(index);
    }
    UI.renderContracts(this);
  },

  ctSetBalance(v) {
    if (this.ct.resolving) return;
    this.ct.balanceAdd = Math.min(Math.max(0, Math.floor(v)), Math.floor(this.balance));
    UI.updateContractsDynamic(this);
  },

  ctSetRarity(r) {
    this.ct.rarity = r;
    UI.renderContracts(this);
  },

  ctRange() {
    const s = this.ctSum();
    return { min: Math.floor(s * CONTRACT.RANGE_MIN), max: Math.ceil(s * CONTRACT.RANGE_MAX) };
  },

  ctPickResult(min, max) {
    // в контрактах можно получить любой предмет, включая предметы магазина (наклейки, граффити и т.д.)
    const pool = Object.values(ITEMS);
    // варианты предмета, чья цена (с учётом износа) попадает в диапазон контракта
    const variantsIn = (item, lo, hi) => variantList(item)
      .filter(o => o.p >= lo && o.p <= hi)
      .map(o => this.makeInstance(item, o));
    const pickRandom = list => (list.length ? list[Math.floor(Math.random() * list.length)] : null);
    // редкость — предпочтение; цена результата всегда внутри диапазона контракта
    const byRarity = this.ct.rarity !== "any" ? pool.filter(i => i.rarity === this.ct.rarity) : pool;
    this.ct.fallback = false;
    let res = pickRandom(byRarity.flatMap(i => variantsIn(i, min, max)));
    if (!res) {
      res = pickRandom(pool.flatMap(i => variantsIn(i, min, max)));
      this.ct.fallback = byRarity.length !== pool.length;
    }
    if (!res) {
      // ни один вариант не попадает в диапазон: берём ближайший по цене
      const mid = (min + max) / 2;
      let best = null, bestDiff = Infinity;
      pool.forEach(item => {
        variantList(item).forEach(o => {
          const d = Math.abs(o.p - mid);
          if (d < bestDiff) { bestDiff = d; best = { item, o }; }
        });
      });
      res = this.makeInstance(best.item, best.o);
    }
    return res;
  },

  ctSign() {
    if (this.ct.resolving) return;
    if (this.ct.selected.length < CONTRACT.MIN_ITEMS) {
      UI.toast(`Положите минимум ${CONTRACT.MIN_ITEMS} предмета`, "warn");
      return;
    }
    const sum = this.ctSum();
    if (sum <= 0) return;
    const { min, max } = this.ctRange();
    const result = this.ctPickResult(min, max);
    if (this.ct.fallback) {
      UI.toast("В выбранной редкости нет предмета нужной цены — выпал предмет из диапазона", "info");
    }

    const spent = this.ct.selected.map(i => this.inventory[i]).filter(Boolean);
    spent.forEach(it => this.setStatus(it, "contract"));
    this.ct.selected.sort((a, b) => b - a).forEach(i => this.inventory.splice(i, 1));
    this.ct.selected = [];
    const add = Math.min(this.ct.balanceAdd, Math.max(0, Math.floor(this.balance)));
    this.balance -= add;
    this.ct.balanceAdd = 0;
    this.stats.contracts++;
    if (spent.length >= CONTRACT.MAX_ITEMS) this.stats.contracts10 = (this.stats.contracts10 || 0) + 1;
    this.stats.ctSpent += sum;
    this.addToInventory(result);
    Operation.track(this, "contract", { items: spent.length });
    Operation.track(this, "obtain", { price: result.price, rarity: result.rarity });
    Operation.track(this, "spend", { amount: sum });
    this.ct.resolving = true;
    this.save();
    UI.updateBalance(this.balance);
    UI.renderContracts(this);
    UI.showContractResult(result, min, max);
    setTimeout(() => {
      this.ct.resolving = false;
      UI.renderContracts(this);
    }, 1500);
  },
});
