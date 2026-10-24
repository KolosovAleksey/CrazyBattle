// js/ui/contracts.js — Контракты: список, сумма, результат.

Object.assign(UI, {
  renderContracts(G) {
    const N = CONTRACT.MAX_ITEMS;
    let slots = "";
    for (let k = 0; k < N; k++) {
      const idx = G.ct.selected[k];
      const it = idx !== undefined ? G.inventory[idx] : null;
      slots += it
        ? `<div class="cx-slot filled" data-action="ct-toggle" data-index="${idx}" style="--rc:${this.rc(it.rarity)}">
             <img src="${itemImg(it)}" alt="">
             <span class="cx-slot-price">${this.fmt(it.price)} ₽</span>
           </div>`
        : `<div class="cx-slot"><img class="ghost" src="img/items/item_1.webp" alt=""></div>`;
    }
    this.el("ct-slots").innerHTML = slots;

    const PER = CONTRACT.PER_PAGE;
    const desc = G.ct.sort === "desc";
    // предметы каталога (shop) в контрактах не используются
    const order = G.inventory.map((_, i) => i).filter(i => !G.inventory[i].shop).sort((a, b) =>
      desc ? G.inventory[b].price - G.inventory[a].price : G.inventory[a].price - G.inventory[b].price);
    const pages = Math.max(1, Math.ceil(order.length / PER));
    G.ct.page = Math.min(Math.max(0, G.ct.page), pages - 1);
    const start = G.ct.page * PER;
    const list = order.slice(start, start + PER);
    this.el("ct-inv-grid").innerHTML = list.length
      ? list.map(idx => this.upTile(G.inventory[idx], {
          index: idx, selected: G.ct.selected.includes(idx), action: "ct-toggle",
        })).join("")
      : `<div class="empty">Инвентарь пуст — откройте кейс</div>`;

    const total = G.inventory.reduce((s, i) => s + i.price, 0);
    this.el("ct-inv-count").textContent = `(${G.inventory.length} ${this.plural(G.inventory.length)} на ${this.fmt(total)} ₽)`;
    const sortBtn = this.el("ct-sort");
    if (sortBtn) sortBtn.textContent = desc ? "Сначала дорогие ↓" : "Сначала дешёвые ↑";
    this.el("ct-page-num").textContent = `${G.ct.page + 1}`;
    this.el("ct-pages").textContent = `всего страниц: ${pages}`;

    this.el("ct-rarity").value = G.ct.rarity;
    const sl = this.el("ct-balance-slider");
    sl.max = Math.max(0, Math.floor(G.balance));
    sl.disabled = G.balance < 1;
    sl.value = G.ct.balanceAdd;

    this.updateContractsDynamic(G);
  },

  updateContractsDynamic(G) {
    const cnt = G.ct.selected.length;
    const sum = G.ctSum();
    const r = G.ctRange();

    this.el("ct-balance-view").textContent = `${this.fmt(G.balance)} ₽`;
    this.el("ct-sum").textContent = `${this.fmt(sum)} ₽`;
    this.el("ct-range-min").textContent = `${this.fmt(sum > 0 ? r.min : 0)} ₽`;
    this.el("ct-range-max").textContent = `${this.fmt(sum > 0 ? r.max : 0)} ₽`;
    this.el("ct-balance-val").textContent = `${this.fmt(G.ct.balanceAdd)} ₽`;

    const sl = this.el("ct-balance-slider");
    sl.value = G.ct.balanceAdd;
    this.fillSlider(sl);

    const btn = this.el("ct-sign");
    btn.disabled = G.ct.resolving || cnt < CONTRACT.MIN_ITEMS || sum <= 0;
    const need = CONTRACT.MIN_ITEMS - cnt;
    this.el("ct-hint").textContent = need > 0
      ? `Положите еще минимум ${need} ${this.plural(need)}`
      : "";
  },

  showContractResult(result, min, max) {
    SFX.play("contract_done");
    const box = this.el("ct-result");
    box.style.setProperty("--rc", this.rc(result.rarity));
    const parts = result.name.split(" | ");
    box.innerHTML = `
      <div class="cx-res">
        <img src="${itemImg(result)}" alt="">
        <div class="cx-res-name"><span>${this.esc(parts.length > 1 ? parts[0] : "")}</span><b>${this.esc(parts.length > 1 ? parts[1] : parts[0])}</b></div>
        <div class="cx-res-price">${this.fmt(result.price)} ₽</div>
        <div class="muted small">Диапазон ${this.fmt(min)} – ${this.fmt(max)} ₽</div>
      </div>`;
  },

  clearContractResult() {
    const box = this.el("ct-result");
    if (box) box.innerHTML = "";
  },
});
