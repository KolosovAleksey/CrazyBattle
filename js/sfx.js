// Звуки сайта: одиночные сэмплы из sounds/*.wav (кэш AudioBuffer), серии тиков для прокрутов.
// Звуки апгрейда (up_*, gold_*, mystic_*, select, deselect, percent) выключаются кнопкой звука в апгрейде.
const SFX = {
  ctx: null,
  bufs: {},
  pending: {},
  enabled: true,
  master: 0.6,          // общая громкость звуков сайта (0–1)

  ac() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  },

  load(name) {
    if (this.bufs[name]) return Promise.resolve(this.bufs[name]);
    if (!this.pending[name]) {
      this.pending[name] = fetch(`sounds/${name}.wav`)
        .then(r => (r.ok ? r.arrayBuffer() : null))
        .then(b => (b ? this.ac().decodeAudioData(b) : null))
        .then(buf => { if (buf) this.bufs[name] = buf; return buf; })
        .catch(() => null);
    }
    return this.pending[name];
  },

  preload(names) {
    names.forEach(n => this.load(n));
  },

  // звуки, которые подчиняются кнопке звука в апгрейде
  upgradeGroup(name) {
    return /^(up_|gold_|mystic_)/.test(name) || name === "select" || name === "deselect" || name === "percent";
  },

  muted(name) {
    if (!this.enabled) return true;
    if (this.upgradeGroup(name) && typeof UI !== "undefined" && UI.upCfg && !UI.upCfg().sound) return true;
    return false;
  },

  play(name, opts = {}) {
    if (this.muted(name)) return;
    const { vol = 1, rate = 1, delay = 0 } = opts;
    const go = buf => {
      try {
        const ctx = this.ac();
        const src = ctx.createBufferSource();
        const g = ctx.createGain();
        src.buffer = buf;
        src.playbackRate.value = rate;
        g.gain.value = vol * this.master;
        src.connect(g).connect(ctx.destination);
        src.start(ctx.currentTime + delay);
      } catch (e) { /* звук не критичен */ }
    };
    if (this.bufs[name]) go(this.bufs[name]);
    else this.load(name).then(b => b && go(b));
  },

  // серия тиков на время прокрута (мс): частые в начале, редкие к концу — как у самого прокрута
  ticks(name, duration, opts = {}) {
    if (this.muted(name)) return;
    const { vol = 0.7 } = opts;
    const schedule = buf => {
      const ctx = this.ac();
      const start = ctx.currentTime + 0.02;
      let t = 0;
      while (t < duration) {
        const k = t / duration;
        const src = ctx.createBufferSource();
        const g = ctx.createGain();
        src.buffer = buf;
        g.gain.value = vol * this.master * (0.9 + 0.2 * Math.random());
        src.connect(g).connect(ctx.destination);
        src.start(start + t / 1000);
        t += (0.05 + 0.25 * k * k) * 1000;
      }
    };
    if (this.bufs[name]) schedule(this.bufs[name]);
    else this.load(name).then(b => b && schedule(b));
  },
};

// звук выпадения по самой редкой вещи из открытых
function dropSoundFor(items) {
  const rank = { common: 0, uncommon: 0, rare: 1, epic: 2, legendary: 3, knife: 4 };
  const best = Math.max(0, ...items.map(i => rank[i.rarity] || 0));
  if (best >= 3) return "drop_high";   // Засекреченное, ножи
  if (best >= 1) return "drop_mid";    // Запрещённое, Армейское
  return "drop_low";
}

// предзагрузка часто используемых звуков
SFX.preload(["case_tick", "drop_low", "drop_mid", "drop_high", "sell_one", "sell_all",
  "select", "deselect", "percent", "up_tick", "up_tick_fast", "up_win", "up_lose", "gold_appear",
  "gold_win", "mystic_select", "mystic_reveal", "contract_done", "battle_skin", "battle_case"]);
