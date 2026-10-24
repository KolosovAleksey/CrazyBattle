// js/game/cs.js — КС: вывод предметов с сайта, снаряжение и слоты.

Object.assign(Game, {
  withdrawToCs(uid) {
    const idx = this.inventory.findIndex(i => i.uid === uid);
    if (idx < 0) return;
    const [it] = this.inventory.splice(idx, 1);
    this.csInventory.push({ uid: it.uid, id: it.id, name: it.name, rarity: it.rarity, img: it.img ?? null,
      shop: !!it.shop, variant: it.variant ?? null, wear: it.wear ?? null, price: it.price });
    this.stats.csCount = (this.stats.csCount || 0) + 1;
    this.stats.csValue = (this.stats.csValue || 0) + it.price;
    this.setStatus(it, "cs");
    this.save();
    UI.toast(`Выведено в КС: ${it.name}`, "success");
    this.refreshCurrentView();
  },

  csEquip(uid) {
    const slot = UI.csSlot;
    const side = UI.csSide || "ct";
    if (!slot) return;
    const def = CS_SLOTS.find(s => s.key === slot);
    const it = this.csInventory.find(i => i.uid === uid);
    if (!it || !def || csCategory(it) !== def.cat) { UI.toast("Этот предмет не подходит к слоту", "warn"); return; }
    // один предмет — в одном слоте на сторону
    const L = this.csLoadout[side];
    Object.keys(L).forEach(k => { if (L[k] === uid) delete L[k]; });
    L[slot] = uid;
    this.save();
    UI.renderCs(this);
  },

  csUnequip(slot, side) {
    side = side || UI.csSide || "ct";
    delete this.csLoadout[side][slot];
    this.save();
    UI.renderCs(this);
  },
});
