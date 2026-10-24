// js/ui/feed.js — Живая лента дропов.

Object.assign(UI, {
  seedFeed() {
    for (let i = 0; i < 9; i++) {
      const item = Game.feedItem();
      const name = FEED_NAMES[Math.floor(Math.random() * FEED_NAMES.length)];
      this.addFeedEntry(name, item);
    }
  },

  addFeedEntry(name, item) {
    const feed = this.el("live-feed");
    if (!feed) return;
    const el = document.createElement("div");
    el.className = "live-tile burst";
    el.style.setProperty("--rc", this.rc(item.rarity));
    el.title = `${name}: ${item.name}`;
    // вспышка из центра: кольца, ядро и искры в цвете редкости (живут только при появлении)
    const sparks = Array.from({ length: 8 }, (_, k) => `<i class="lt-spark" style="--a:${k * 45}deg"></i>`).join("");
    el.innerHTML = `
      <i class="lt-core"></i>
      <i class="lt-ring"></i>
      <i class="lt-ring r2"></i>
      ${sparks}
      <img src="${itemImg(item)}" alt="">
      <small>${this.esc(name)}</small>
      <b>${this.fmt(item.price)} ₽</b>`;
    feed.prepend(el);
    setTimeout(() => el.classList.remove("burst"), 1800);
    while (feed.children.length > 6) feed.lastElementChild.remove();
  },
});
