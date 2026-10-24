// js/ui/upgrade_anim.js — Апгрейд: анимации прокрута, звуки, результат розыгрыша.

Object.assign(UI, {
  // тики прокрута апгрейда: быстрый режим — короткие, обычный — медленные (звук — SFX)
  playSpinTicks(duration) {
    if (!this.upCfg().sound) return;
    SFX.ticks(duration <= 700 ? "up_tick_fast" : "up_tick", duration, { vol: 0.7 });
  },

  // o: { chance, win, gold, golden } — стрелка останавливается по итогу: в золото, в зелёное (не в золото) или в красное
  spinUpgradeWheel(o, cb) {
    const { chance, win, gold, golden, chain } = o;
    const arrow = this.el("arrow");
    const box = this.el("wheel-box");
    const span = Math.max(0, Math.min(100, chance)) * 3.6;
    const gs = golden ? this.goldDeg(chance) : 0;
    const a0 = 180 - span / 2, a1 = 180 + span / 2;
    const g0 = 180 - gs / 2, g1 = 180 + gs / 2;
    const pick = (lo, hi) => lo + (hi - lo) * (0.1 + Math.random() * 0.8);
    let A;
    if (!win) A = a1 + (360 - span) * (0.1 + Math.random() * 0.8);       // красная зона
    else if (gold) A = pick(g0, g1);                                     // золото
    else if (golden) {                                                   // зелёное, но не золото
      const left = g0 - a0, right = a1 - g1;
      A = Math.random() * (left + right) < left ? pick(a0, g0) : pick(g1, a1);
    } else A = pick(a0, a1);                                             // обычный выигрыш

    const cur = this.arrowAngle || 0;
    const delta = (((A - cur) % 360) + 360) % 360;
    const R = cur + 360 * 8 + delta;
    this.arrowAngle = R;

    // медленный прокрут (9 с) только при попадании в золото; в быстром режиме золото не замедляет и не останавливает прокрут
    const fastOn = this.upCfg().fast;
    // шаги цепочки всегда медленные (9 с), даже в быстром режиме
    const dur = gold || chain || !fastOn ? 9000 : 600;
    const reveal = golden && !fastOn ? 1400 : 0;   // фаза появления золота перед прокрутом (только в обычном режиме)

    if (reveal) {
      const badge = document.createElement("div");
      badge.className = "gold-badge";
      badge.textContent = "ЗОЛОТО";
      box.appendChild(badge);
      box.classList.add("gold-reveal");
      SFX.play("gold_appear");
      setTimeout(() => badge.remove(), reveal + 200);
    }

    setTimeout(() => {
      box.classList.remove("gold-reveal");
      this.playSpinTicks(dur);
      arrow.style.transition = `transform ${dur}ms cubic-bezier(0.15, 0.6, 0.1, 1)`;
      arrow.style.transform = `rotate(${R}deg)`;
      box.classList.add("spinning");
      if (chain) box.classList.add("chain-spin");
    }, reveal);

    setTimeout(() => {
      box.classList.remove("spinning", "chain-spin");
      if (gold) this.playGoldHit(box);
      if (chain) this.playChainHit(box, win);
      cb();
    }, reveal + dur + 100);
  },

  // попадание стрелки в золото: тряска, вспышка, лучи, две волны, «×2», осколки и искры; стрелка светится
  // панель цепочки над колесом: ставка, счётчик шагов и напоминание о защите; перерисовка только при смене шага
  renderChainHud(G) {
    const hud = this.el("chain-hud");
    const box = this.el("wheel-box");
    const c = G.up.chain;
    if (box) box.classList.toggle("chain-on", !!c);
    if (!hud) return;
    if (!c) {
      hud.classList.remove("on");
      hud.dataset.key = "";
      return;
    }
    hud.classList.add("on");
    const key = `${c.depth}|${c.bet.price}`;
    if (hud.dataset.key === key) return;   // не пересоздаём DOM — анимации не сбрасываются
    hud.dataset.key = key;
    const shown = Math.min(c.depth, 12);
    const dots = Array.from({ length: shown }, (_, i) =>
      `<i class="${i === shown - 1 ? "last" : ""}"></i>`).join("");
    hud.innerHTML = `<div class="ch-title">ЦЕПОЧКА ×2 · ШАГ ${c.depth}</div>
      <div class="ch-val">${this.fmt(c.bet.price)} ₽</div>
      <div class="ch-dots">${dots}</div>
      <div class="ch-sub">Последняя ставка защищена: при проигрыше вернётся в инвентарь</div>`;
  },

  // вспышки шагов цепочки: выигрыш шага — золотой «×2» и искры; проигрыш — защита ставки (голубые волны, «ЗАЩИТА»)
  playChainHit(box, win) {
    const layer = (cls, ms, text) => {
      const el = document.createElement("div");
      el.className = cls;
      if (text) el.textContent = text;
      box.appendChild(el);
      setTimeout(() => el.remove(), ms);
    };
    if (win) {
      box.classList.add("chain-win");
      setTimeout(() => box.classList.remove("chain-win"), 600);
      layer("gold-flash", 900);
      layer("gold-rays", 1800);
      layer("gold-wave", 1200);
      layer("gold-wave gold-wave-2", 1400);
      layer("gold-pop", 1600, "×2");
      for (let k = 0; k < 40; k++) {
        const sp = document.createElement("span");
        sp.className = k % 3 === 0 ? "gold-shard" : "gold-spark";
        sp.style.setProperty("--a", `${(k / 40) * 360 + Math.random() * 8}deg`);
        sp.style.setProperty("--d", `${110 + Math.random() * 100}px`);
        sp.style.setProperty("--t", `${Math.random() * 160}ms`);
        box.appendChild(sp);
        setTimeout(() => sp.remove(), 1600);
      }
    } else {
      layer("gold-wave chain-protect", 1300);
      layer("gold-wave chain-protect gold-wave-2", 1500);
      layer("gold-pop pop-small", 1500, "ЗАЩИТА");
    }
  },

  // мистический апгрейд: без колеса — искры летают внутрь и наружу, затем предмет выплывает из портала
  playMystic(item, cb, bank = 0) {
    SFX.play("mystic_reveal");
    const box = this.el("wheel-box");
    box.classList.add("mystic-mode");
    const stage = document.createElement("div");
    stage.className = "mystic-stage";
    stage.innerHTML = `<div class="my-bg"></div><div class="my-ring"></div><div class="my-ring r2"></div><div class="my-core"></div>`;
    for (let k = 0; k < 40; k++) {
      const sp = document.createElement("span");
      sp.className = "my-spark";
      sp.style.setProperty("--a", `${(k / 40) * 360 + Math.random() * 9}deg`);
      sp.style.setProperty("--d", `${95 + Math.random() * 80}px`);
      sp.style.setProperty("--t", `${-Math.random() * 2400}ms`);
      stage.appendChild(sp);
    }
    const item_el = document.createElement("div");
    item_el.className = "my-item";
    item_el.style.setProperty("--rc", this.rc(item.rarity));
    item_el.innerHTML = `<img src="${itemImg(item)}" alt=""><div class="my-name">${this.esc(item.name)}</div>`;
    stage.appendChild(item_el);
    box.appendChild(stage);

    setTimeout(() => {
      stage.classList.add("reveal");
      const layer = cls => {
        const el = document.createElement("div");
        el.className = cls;
        stage.appendChild(el);
        setTimeout(() => el.remove(), 1500);
      };
      layer("gold-flash");
      layer("gold-wave");
      layer("gold-wave gold-wave-2");
      const verdict = document.createElement("div");
      const ok = item.price >= bank;
      verdict.className = `my-verdict ${ok ? "ok" : "fail"}`;
      verdict.textContent = ok ? "ОКУП" : "НЕ ОКУП";
      stage.appendChild(verdict);
    }, 2000);
    setTimeout(() => stage.classList.add("fade"), 2900);
    setTimeout(() => {
      stage.remove();
      box.classList.remove("mystic-mode");
      cb();
    }, 3400);
  },

  playGoldHit(box) {
    const arrow = this.el("arrow");
    box.classList.add("gold-hit");
    const layer = (cls, ms, text) => {
      const el = document.createElement("div");
      el.className = cls;
      if (text) el.textContent = text;
      box.appendChild(el);
      setTimeout(() => el.remove(), ms);
      return el;
    };
    layer("gold-flash", 900);
    layer("gold-rays", 1800);
    layer("gold-wave", 1200);
    layer("gold-wave gold-wave-2", 1400);
    layer("gold-pop", 1600, "×2");
    if (arrow) {
      arrow.classList.remove("gold-land");
      void arrow.offsetWidth;          // перезапуск анимации
      arrow.classList.add("gold-land");
      setTimeout(() => arrow.classList.remove("gold-land"), 1400);
    }
    const n = 48;
    for (let k = 0; k < n; k++) {
      const sp = document.createElement("span");
      sp.className = k % 3 === 0 ? "gold-shard" : "gold-spark";
      const ang = (k / n) * 360 + Math.random() * 8;
      const dist = 110 + Math.random() * 110;
      sp.style.setProperty("--a", `${ang}deg`);
      sp.style.setProperty("--d", `${dist}px`);
      sp.style.setProperty("--t", `${Math.random() * 160}ms`);
      box.appendChild(sp);
      setTimeout(() => sp.remove(), 1600);
    }
    setTimeout(() => box.classList.remove("gold-hit"), 1600);
  },

  // результат прокачки показывается в правой карточке («Оружие, которое хотите получить»)
  // и остаётся, пока игрок не выберет новый множитель или цель
  showUpgradeResult(win, item, chance, opts = {}) {
    SFX.play(opts.gold ? "gold_win" : win ? "up_win" : "up_lose");
    this.upResult = {
      win, item, chance,
      kicker: opts.kicker || (win ? "Апгрейд успешен" : "Не повезло"),
    };
    this.updateUpgradeDynamic(Game);
  },

  clearUpgradeResult() {
    this.upResult = null;
  },
});
