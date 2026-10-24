// js/game/feed.js — Живая лента дропов (симуляция).

Object.assign(Game, {
  // предмет для ленты: из пула LIVE_POOL, с износом и ценой этого износа
  feedItem() {
    return this.rollInstance(LIVE_POOL[Math.floor(Math.random() * LIVE_POOL.length)]);
  },

  startFeed() {
    const tick = () => {
      const item = this.feedItem();
      const name = FEED_NAMES[Math.floor(Math.random() * FEED_NAMES.length)];
      UI.addFeedEntry(name, item);
      setTimeout(tick, 2500 + Math.random() * 3000);
    };
    setTimeout(tick, 2500);
  },
});
