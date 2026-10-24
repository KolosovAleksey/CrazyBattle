// ======================
// ОПЕРАЦИЯ — сезонный пропуск: 100 заданий, каждое выполненное задание = +1 уровень.
// Этот файл — источник правды для заданий. PLAN.md строится из него.
// Награды: {bal} — на баланс (₽), {free} — бесплатное открытие кейса,
// {cat} — бесплатное открытие кейса категории на выбор игрока.
// ======================

const OP_TOTAL = 100;
const OP_RING_C = 2 * Math.PI * 52;   // длина окружности кольца прогресса

// главы: для подписи на карточке
const OP_CHAPTERS = [
  { from: 1, to: 10, name: "Разминка" }, { from: 11, to: 20, name: "Апгрейды" },
  { from: 21, to: 30, name: "Контракты" }, { from: 31, to: 40, name: "Battle" },
  { from: 41, to: 50, name: "Ножевой путь" }, { from: 51, to: 60, name: "Дропы" },
  { from: 61, to: 70, name: "Охотники" }, { from: 71, to: 80, name: "Мастер" },
  { from: 81, to: 90, name: "Элита" }, { from: 91, to: 100, name: "Финал" },
];
const OP_REDUCED = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const OP_B = v => ({ bal: v });
const OP_F = id => ({ free: id });

// k — тип счётчика, n — цель, f — фильтры, rew — награды, ms — ключевой уровень (★)
function opT(k, n, f, title, rew, ms) {
  return { k, n, f: f || {}, title, rew, ms: !!ms };
}

const OP_TASKS = [
  // ---- Глава 1: Разминка (1–10) ----
  opT("open", 3, { caseIds: ["case_silverelitee"] }, "Открыть 3 кейса «Сильвер Элита»", [OP_F("case_silverelitee")]),
  opT("open", 5, { minPrice: 30 }, "Открыть 5 кейсов стоимостью от 30 ₽", [OP_B(200)]),
  opT("sell", 3, {}, "Продать 3 предмета", [OP_F("case_globalelite")]),
  opT("open", 2, { caseIds: ["case_globalelite"] }, "Открыть 2 кейса «Глобал Элита»", [OP_B(200)]),
  opT("obtain", 1, { minPrice: 1000 }, "Выбить предмет дороже 1 000 ₽", [OP_F("case_silverelitee")]),
  opT("open", 5, { caseIds: ["case_coen", "case_lacra"] }, "Открыть 5 кейсов «Коэн» или «Лакра»", [OP_B(300)]),
  opT("contract", 1, {}, "Сделать 1 контракт", [OP_B(300)]),
  opT("open", 3, { caseIds: ["case_huntforthesecret"] }, "Открыть 3 кейса «Охота за тайным»", [OP_F("case_globalelite")]),
  opT("upgrade", 2, {}, "Сделать 2 апгрейда", [OP_F("case_silverelitee"), OP_F("case_silverelitee")]),
  opT("open", 10, { minPrice: 30 }, "Открыть 10 кейсов стоимостью от 30 ₽", [OP_B(500), OP_F("case_huntforthesecret")]),

  // ---- Глава 2: Апгрейды (11–20) ----
  opT("upgrade", 4, {}, "Сделать 4 апгрейда", [OP_B(300)]),
  opT("upgrade", 2, { win: true }, "Выиграть 2 апгрейда", [OP_B(300)]),
  opT("upgrade", 1, { maxChance: 5 }, "Сделать апгрейд с шансом до 5%", [OP_B(500)]),
  opT("open", 3, { cat: "Ограниченная серия" }, "Открыть 3 кейса категории «Ограниченная серия»", [OP_F("case_huntforthesecret")]),
  opT("obtain", 1, { minPrice: 3000 }, "Выбить предмет дороже 3 000 ₽", [OP_B(500)]),
  opT("upgrade", 5, {}, "Сделать 5 апгрейдов", [OP_B(500)]),
  opT("upgrade", 1, { minChance: 20 }, "Сделать апгрейд с шансом от 20%", [OP_F("case_globalelite"), OP_F("case_globalelite")]),
  opT("obtain", 3, { minPrice: 1000 }, "Выбить 3 предмета дороже 1 000 ₽", [OP_B(500)]),
  opT("open", 10, { cat: "Фирменные кейсы" }, "Открыть 10 кейсов категории «Фирменные кейсы»", [OP_B(800)]),
  opT("open", 15, { minPrice: 30 }, "Открыть 15 кейсов стоимостью от 30 ₽", [OP_B(1000)]),

  // ---- Глава 3: Контракты (21–30) ----
  opT("contract", 2, {}, "Сделать 2 контракта", [OP_B(500)]),
  opT("obtain", 1, { rarity: "covert" }, "Выбить предмет редкости «Тайное»", [OP_F("case_huntforthesecret")]),
  opT("open", 25, { minPrice: 30 }, "Открыть 25 кейсов стоимостью от 30 ₽", [OP_B(500)]),
  opT("contract", 3, {}, "Сделать 3 контракта", [OP_B(500)]),
  opT("sell", 10, {}, "Продать 10 предметов", [OP_B(500)]),
  opT("open", 5, { caseIds: ["case_globalelite"] }, "Открыть 5 кейсов «Глобал Элита»", [OP_B(500)]),
  opT("upgrade", 7, {}, "Сделать 7 апгрейдов", [OP_B(800)]),
  opT("open", 1, { cat: "Ножевые кейсы" }, "Открыть 1 кейс категории «Ножевые кейсы»", [OP_F("case_globalelite"), OP_F("case_globalelite"), OP_F("case_globalelite")]),
  opT("upgrade", 3, { win: true }, "Выиграть 3 апгрейда", [OP_B(1000)]),
  opT("open", 12, { minPrice: 30 }, "Открыть 12 кейсов стоимостью от 30 ₽", [OP_F("case_covert")], true),

  // ---- Глава 4: Battle (31–40) ----
  opT("battle", 1, {}, "Сыграть 1 Battle", [OP_B(300)]),
  opT("battle", 2, {}, "Сыграть 2 Battle", [OP_B(500)]),
  opT("battle", 1, { win: true }, "Выиграть 1 Battle", [OP_B(500)]),
  opT("open", 20, { minPrice: 30 }, "Открыть 20 кейсов стоимостью от 30 ₽", [OP_B(800)]),
  opT("upgrade", 1, { maxChance: 2 }, "Сделать апгрейд с шансом до 2%", [OP_F("case_silverelitee"), OP_F("case_silverelitee"), OP_F("case_silverelitee")]),
  opT("obtain", 1, { minPrice: 10000 }, "Выбить предмет дороже 10 000 ₽", [OP_B(1000)]),
  opT("contract", 4, {}, "Сделать 4 контракта", [OP_B(800)]),
  opT("battle", 2, { win: true }, "Выиграть 2 Battle", [OP_B(1000)]),
  opT("upgrade", 2, { win: true, minChance: 30 }, "Выиграть 2 апгрейда с шансом от 30%", [OP_B(1000)]),
  opT("open", 4, { caseIds: ["case_huntforthesecret"] }, "Открыть 4 кейса «Охота за тайным»", [OP_B(1000), OP_F("case_globalelite"), OP_F("case_globalelite"), OP_F("case_globalelite")]),

  // ---- Глава 5: Ножевой путь (41–50) ----
  opT("open", 3, { cat: "Ножевые кейсы" }, "Открыть 3 кейса категории «Ножевые кейсы»", [OP_B(1000)]),
  opT("obtain", 1, { rarity: "knife" }, "Выбить нож (любой)", [OP_F("case_huntforthesecret"), OP_F("case_huntforthesecret")]),
  opT("sell", 5, { minPrice: 1000 }, "Продать 5 предметов дороже 1 000 ₽", [OP_B(1000)]),
  opT("upgrade", 1, { minChance: 5 }, "Сделать апгрейд с шансом от 5%", [OP_B(1500)]),
  opT("battle", 3, { win: true }, "Выиграть 3 Battle", [OP_B(1000)]),
  opT("obtain", 1, { minPrice: 20000 }, "Выбить предмет дороже 20 000 ₽", [OP_B(2000)]),
  opT("open", 30, { minPrice: 30 }, "Открыть 30 кейсов стоимостью от 30 ₽", [OP_B(1500)]),
  opT("contract", 1, { minItems: 10 }, "Сделать контракт из 10 предметов", [OP_B(1500)]),
  opT("upgrade", 9, {}, "Сделать 9 апгрейдов", [OP_B(1500)]),
  opT("open", 5, { cat: "Ножевые кейсы" }, "Открыть 5 кейсов категории «Ножевые кейсы»", [OP_F("case_navaja")], true),

  // ---- Глава 6: Дропы (51–60) ----
  opT("obtain", 3, { minPrice: 5000 }, "Выбить 3 предмета дороже 5 000 ₽", [OP_B(2000)]),
  opT("open", 50, { minPrice: 30 }, "Открыть 50 кейсов стоимостью от 30 ₽", [OP_B(2000)]),
  opT("upgrade", 5, { win: true }, "Выиграть 5 апгрейдов", [OP_B(2000)]),
  opT("obtain", 2, { rarity: "covert" }, "Выбить 2 предмета редкости «Тайное»", [OP_F("case_covert")]),
  opT("battle", 5, {}, "Сыграть 5 Battle", [OP_B(1500)]),
  opT("contract", 10, {}, "Сделать 10 контрактов", [OP_B(2000)]),
  opT("upgrade", 3, { win: true, minChance: 30 }, "Выиграть 3 апгрейда с шансом от 30%", [OP_B(2500)]),
  opT("obtain", 1, { minPrice: 30000 }, "Выбить предмет дороже 30 000 ₽", [OP_B(3000)]),
  opT("upgrade", 2, { win: true, minChance: 20 }, "Выиграть 2 апгрейда с шансом от 20%", [OP_B(2500)]),
  opT("open", 10, { cat: "Серийные кейсы" }, "Открыть 10 кейсов категории «Серийные кейсы»", [OP_B(2000), OP_F("case_huntforthesecret"), OP_F("case_huntforthesecret")]),

  // ---- Глава 7: Охотники (61–70) ----
  opT("spend", 50000, {}, "Потратить 50 000 ₽ суммарно", [OP_B(2000)]),
  opT("open", 5, { cat: "Фирменные кейсы" }, "Открыть 5 кейсов категории «Фирменные кейсы»", [OP_B(2500)]),
  opT("battle", 3, { win: true }, "Выиграть 3 Battle", [OP_B(2500)]),
  opT("upgrade", 20, {}, "Сделать 20 апгрейдов", [OP_B(3000)]),
  opT("obtain", 1, { minPrice: 40000 }, "Выбить предмет дороже 40 000 ₽", [OP_B(3000)]),
  opT("battle", 10, {}, "Сыграть 10 Battle", [OP_B(2500)]),
  opT("contract", 12, {}, "Сделать 12 контрактов", [OP_B(3000)]),
  opT("open", 100, { minPrice: 30 }, "Открыть 100 кейсов стоимостью от 30 ₽", [OP_B(3000)]),
  opT("upgrade", 4, { win: true, minChance: 25 }, "Выиграть 4 апгрейда с шансом от 25%", [OP_B(3000)]),
  opT("open", 7, { cat: "Ножевые кейсы" }, "Открыть 7 кейсов категории «Ножевые кейсы»", [OP_F("case_covert"), OP_B(2000)]),

  // ---- Глава 8: Мастер (71–80) ----
  opT("spend", 150000, {}, "Потратить 150 000 ₽ суммарно", [OP_B(3000)]),
  opT("upgrade", 1, { win: true, minChance: 20 }, "Выиграть апгрейд с шансом от 20%", [OP_B(4000)]),
  opT("obtain", 1, { minPrice: 60000 }, "Выбить предмет дороже 60 000 ₽", [OP_B(5000)]),
  opT("battle", 15, {}, "Сыграть 15 Battle", [OP_B(3000)]),
  opT("open", 50, { cat: "Фирменные кейсы" }, "Открыть 50 кейсов категории «Фирменные кейсы»", [OP_B(4000)]),
  opT("contract", 5, {}, "Сделать 5 контрактов", [OP_B(4000)]),
  opT("upgrade", 5, { win: true, minChance: 20 }, "Выиграть 5 апгрейдов с шансом от 20%", [OP_B(4000)]),
  opT("open", 20, { cat: "Серийные кейсы" }, "Открыть 20 кейсов категории «Серийные кейсы»", [OP_B(4000)]),
  opT("sell", 20, {}, "Продать 20 предметов", [OP_B(3000)]),
  opT("open", 3, { caseIds: ["case_covert"] }, "Открыть 3 кейса «Тайное оружие»", [OP_F("case_huntforthesecret"), OP_F("case_huntforthesecret"), OP_B(3000)]),

  // ---- Глава 9: Элита (81–90) ----
  opT("open", 5, { caseIds: ["case_covert"] }, "Открыть 5 кейсов «Тайное оружие»", [OP_B(4000)]),
  opT("obtain", 1, { minPrice: 80000 }, "Выбить предмет дороже 80 000 ₽", [OP_B(5000)]),
  opT("battle", 20, {}, "Сыграть 20 Battle", [OP_B(4000)]),
  opT("upgrade", 25, {}, "Сделать 25 апгрейдов", [OP_B(5000)]),
  opT("contract", 7, {}, "Сделать 7 контрактов", [OP_B(5000)]),
  opT("open", 30, { cat: "Ножевые кейсы" }, "Открыть 30 кейсов категории «Ножевые кейсы»", [OP_B(5000)]),
  opT("upgrade", 15, {}, "Сделать 15 апгрейдов", [OP_B(6000)]),
  opT("spend", 300000, {}, "Потратить 300 000 ₽ суммарно", [OP_B(6000)]),
  opT("obtain", 5, { minPrice: 10000 }, "Выбить 5 предметов дороже 10 000 ₽", [OP_B(6000)]),
  opT("open", 10, { caseIds: ["case_covert"] }, "Открыть 10 кейсов «Тайное оружие»", [OP_F("case_covert"), OP_F("case_covert"), OP_B(5000)]),

  // ---- Глава 10: Финал (91–100) ----
  opT("obtain", 1, { minPrice: 50000 }, "Выбить предмет дороже 50 000 ₽", [OP_B(6000)]),
  opT("battle", 30, {}, "Сыграть 30 Battle", [OP_B(6000)]),
  opT("contract", 15, {}, "Сделать 15 контрактов", [OP_B(6000)]),
  opT("upgrade", 7, { win: true }, "Выиграть 7 апгрейдов", [OP_B(7000)]),
  opT("spend", 500000, {}, "Потратить 500 000 ₽ суммарно", [OP_B(8000)]),
  opT("open", 50, { cat: "Ножевые кейсы" }, "Открыть 50 кейсов категории «Ножевые кейсы»", [OP_B(8000)]),
  opT("sell", 50, {}, "Продать 50 предметов", [OP_B(5000)]),
  opT("obtain", 1, { minPrice: 70000 }, "Выбить предмет дороже 70 000 ₽", [OP_B(8000)]),
  opT("upgrade", 6, { win: true }, "Выиграть 6 апгрейдов", [OP_B(8000)]),
  opT("final", 99, {}, "Выполнить все задания 1–99", [OP_F("case_bitcoin")], true),
];

const Operation = {
  busy: false,       // идёт анимация получения: повторные клики игнорируются
  lastLvl: 0,        // для счётчика уровня
  resizeBound: false,

  // состояние: p — прогресс по заданиям, c — получено, tickets — бесплатные открытия
  load(saved) {
    const op = { p: OP_TASKS.map(() => 0), c: OP_TASKS.map(() => false), tickets: [], seq: 0 };
    if (saved && Array.isArray(saved.p) && saved.p.length === OP_TOTAL) op.p = saved.p.map(v => +v || 0);
    if (saved && Array.isArray(saved.c) && saved.c.length === OP_TOTAL) op.c = saved.c.map(Boolean);
    if (saved && Array.isArray(saved.tickets)) {
      op.tickets = saved.tickets
        .filter(t => t && CASES[t.caseId])
        .map(t => ({ id: String(t.id), task: +t.task, caseId: t.caseId, used: !!t.used }));
    }
    op.seq = saved && saved.seq ? +saved.seq : op.tickets.length;
    return op;
  },

  // индекс первого задания, которое ещё не получено; -1 — всё получено
  active(op) { return op.c.indexOf(false); },

  isDone(op, i) {
    const t = OP_TASKS[i];
    if (!t) return false;
    if (t.k === "final") return op.c.slice(0, OP_TOTAL - 1).every(Boolean);   // все задания 1–99 получены
    return op.p[i] >= t.n;
  },

  // событие из игры: k — тип, d — данные события
  track(G, k, d) {
    const op = G && G.op;
    if (!op) return;
    const i = this.active(op);
    if (i < 0) return;
    const t = OP_TASKS[i];
    if (t.k !== k || t.k === "final" || this.isDone(op, i)) return;
    const f = t.f;
    let s = op.p[i];

    if (k === "open") {
      if (f.caseIds && !f.caseIds.includes(d.caseId)) return;
      if (f.cat && d.cat !== f.cat) return;
      if (f.minPrice && d.price < f.minPrice) return;
      s += d.n;
    } else if (k === "sell") {
      if (f.minPrice && d.price < f.minPrice) return;
      s += 1;
    } else if (k === "contract") {
      if (f.minItems && d.items < f.minItems) return;
      s += 1;
    } else if (k === "upgrade") {
      if (f.minChance && d.chance < f.minChance) return;
      if (f.maxChance && d.chance > f.maxChance) return;
      if (f.streak) s = d.win ? s + 1 : 0;
      else if (f.win) { if (!d.win) return; s += 1; }
      else s += 1;
    } else if (k === "chain") {
      s = Math.max(s, d.depth);
    } else if (k === "battle") {
      if (f.win && !d.win) return;
      s += 1;
    } else if (k === "spend") {
      s += d.amount;
    } else if (k === "obtain") {
      if (f.minPrice && d.price < f.minPrice) return;
      if (f.rarity && d.rarity !== f.rarity) return;
      s += 1;
    } else {
      return;
    }

    const wasDone = this.isDone(op, i);
    op.p[i] = Math.min(s, t.n);
    if (!wasDone && this.isDone(op, i)) {
      UI.toast(`Задание ${i + 1} выполнено — заберите награду в «Операции»`, "success");
    }
    G.save();
    if (G.route === "operation") this.render(G, false);
  },

  // забрать награду текущего задания: эффект → лента переезжает на следующее
  claim(G, i) {
    if (this.busy) return;
    const op = G.op;
    if (i !== this.active(op) || !this.isDone(op, i)) return;
    const t = OP_TASKS[i];

    let first = null;
    let bal = 0;
    t.rew.forEach(r => {
      if (r.bal) { bal += r.bal; G.balance += r.bal; }
      else if (r.free) {
        op.seq += 1;
        const tk = { id: `t${op.seq}`, task: i, caseId: r.free, used: false };
        op.tickets.push(tk);
        if (!first) first = tk;
      }
    });
    op.c[i] = true;
    UI.updateBalance(G.balance);
    G.save();

    const root = document.getElementById("op-root");
    const card = root ? root.querySelector(`[data-op-card="${i}"]`) : null;
    this.busy = true;
    this.celebrate(root, card, bal, !!t.ms, !!first);

    // сначала лента переезжает на следующее задание (через ~600 мс, длится 800 мс), затем (если есть кейс) — переход в него
    setTimeout(() => {
      if (bal) UI.toast(`Награда получена: +${UI.fmt(bal)} ₽`, "success");
      if (G.route === "operation") this.render(G, true);
      if (first) {
        setTimeout(() => {
          this.busy = false;
          if (G.route === "operation") this.goTicket(G, first);   // перекидываем в кейс и открываем его
        }, 1000);
      } else {
        this.busy = false;
      }
    }, 600);
  },

  ticketById(G, id) {
    return (G.op.tickets || []).find(t => t.id === id && !t.used) || null;
  },

  // переход в кейс: открытие запустится автоматически (см. Game.handleRoute)
  goTicket(G, tk) {
    // предыдущая прокрутка ещё идёт — ждём её конца, иначе кейс не откроется сам (пока игрок на «Операции»)
    if (G.isSpinning) {
      if (G.route === "operation") setTimeout(() => this.goTicket(G, tk), 300);
      return;
    }
    G.freeTicket = tk;
    const h = `case:${tk.caseId}`;
    if (location.hash === `#${h}`) G.handleRoute();
    else location.hash = h;
  },

  useTicket(G, tk) {
    tk.used = true;
    G.save();
  },

  esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  },

  chips(t) {
    return t.rew.map(r => r.bal
      ? `<span class="op-chip">+${UI.fmt(r.bal)} ₽</span>`
      : `<span class="op-chip op-chip-case">Открытие: ${this.esc(CASES[r.free] ? CASES[r.free].name : r.free)}</span>`
    ).join("");
  },

  // ---------- разметка ----------
  build(root) {
    root.innerHTML = `
      <div class="op-confetti"></div>
      <div class="op-hero">
        <div class="op-flash"></div>
        <div class="op-hero-l">
          <small>СЕЗОННАЯ ОПЕРАЦИЯ</small>
          <h2 class="op-glitch">CrazyBattle Operation</h2>
          <p>100 заданий по порядку. Каждое полученное задание — +1 уровень. Следующее задание откроется, когда вы получите текущее.</p>
        </div>
        <div class="op-ring">
          <svg viewBox="0 0 120 120">
            <circle class="bg" cx="60" cy="60" r="52"></circle>
            <circle class="fg" cx="60" cy="60" r="52" style="stroke-dasharray:${OP_RING_C};stroke-dashoffset:${OP_RING_C}"></circle>
          </svg>
          <div class="op-ring-n"><b id="op-lvl">0</b><span>/ ${OP_TOTAL}</span></div>
        </div>
      </div>
      <div class="op-guars" id="op-guars"></div>
      <div class="op-stage" id="op-stage">
        <div class="op-rail"></div>
        <div class="op-track" id="op-track"></div>
      </div>
      <div class="op-foot"><i></i>Листать нельзя: задания открываются по очереди</div>`;
    root.dataset.built = "1";

    const track = root.querySelector("#op-track");
    track.addEventListener("mousemove", e => {
      const c = e.target.closest(".is-cur");
      if (!c || OP_REDUCED()) return;
      const r = c.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      c.style.setProperty("--rx", ((0.5 - py) * 10).toFixed(2) + "deg");
      c.style.setProperty("--ry", ((px - 0.5) * 12).toFixed(2) + "deg");
      c.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
      c.style.setProperty("--my", (py * 100).toFixed(1) + "%");
    });
    track.addEventListener("mouseleave", () => {
      track.querySelectorAll(".is-cur").forEach(c => {
        c.style.setProperty("--rx", "0deg");
        c.style.setProperty("--ry", "0deg");
      });
    });

    root.addEventListener("click", e => {
      const cl = e.target.closest("[data-op-claim]");
      if (cl) { this.claim(Game, +cl.dataset.opClaim); return; }
      const tk = e.target.closest("[data-op-ticket]");
      if (tk) {
        const t = this.ticketById(Game, tk.dataset.opTicket);
        if (t) this.goTicket(Game, t);
      }
    });

    if (!this.resizeBound) {
      window.addEventListener("resize", () => {
        const r = document.getElementById("op-root");
        if (r && r.dataset.built && Game.route === "operation") this.center(r, false);
      });
      this.resizeBound = true;
    }
  },

  render(G, animate) {
    const root = document.getElementById("op-root");
    if (!root || !G.op) return;
    if (!root.dataset.built) this.build(root);
    const op = G.op;
    const claimed = op.c.filter(Boolean).length;
    this.renderHero(root, claimed);
    this.renderGuars(root, op);
    this.renderTrack(root, G, animate);
  },

  renderHero(root, claimed) {
    const pct = claimed / OP_TOTAL * 100;
    const fg = root.querySelector(".op-ring .fg");
    if (fg) fg.style.strokeDashoffset = (OP_RING_C * (1 - pct / 100)).toFixed(2);
    this.countUp(root.querySelector("#op-lvl"), this.lastLvl, claimed);
    this.lastLvl = claimed;
  },

  countUp(el, from, to) {
    if (!el) return;
    if (OP_REDUCED() || from === to) { el.textContent = to; return; }
    const t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / 700);
      el.textContent = Math.round(from + (to - from) * k);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  renderGuars(root, op) {
    const nm = id => (CASES[id] ? CASES[id].name : id);
    const list = [[29, "★ 30", nm("case_covert")], [49, "★ 50", "Нож"], [99, "★ 100", nm("case_bitcoin")]];
    root.querySelector("#op-guars").innerHTML = list.map(([i, lvl, what]) =>
      `<div class="op-guar ${op.c[i] ? "got" : ""}">
         <div class="op-guar-ico">★</div>
         <div class="op-guar-txt"><b>${lvl}</b><span>${this.esc(what)}</span></div>
         <em>${op.c[i] ? "получено" : "гарантировано"}</em>
       </div>`).join("");
  },

  // лента: получено — слева, текущее — в центре, следующее — «?»; дальше не видно ничего
  renderTrack(root, G, animate) {
    const op = G.op;
    const act = this.active(op);
    const last = act < 0 ? OP_TOTAL - 1 : act;
    let html = "";
    for (let i = 0; i <= last; i++) {
      html += (act >= 0 && i === act) ? this.cardActive(G, i) : this.cardClaimed(G, i);
    }
    if (act >= 0 && act + 1 < OP_TOTAL) html += this.cardNext(act + 1);
    const track = root.querySelector("#op-track");
    track.innerHTML = html;
    this.center(root, animate);
  },

  cardActive(G, i) {
    const op = G.op, t = OP_TASKS[i], esc = this.esc;
    const done = this.isDone(op, i);
    const final = t.k === "final";
    const s = Math.min(op.p[i], t.n);
    const pct = final ? (done ? 100 : 0) : s / t.n * 100;
    const ch = OP_CHAPTERS.find(c => i + 1 >= c.from && i + 1 <= c.to);
    const status = done ? "ЗАДАНИЕ ВЫПОЛНЕНО" : final ? "" : `ОСТАЛОСЬ ${t.n - s}`;
    return `<article class="opc is-cur ${done ? "st-ready" : "st-active"}" data-op-card="${i}">
      <div class="opc-glow"></div>
      <div class="opc-top"><span class="opc-no">№ ${i + 1}</span><span class="opc-ch">${esc(ch ? ch.name : "")}</span></div>
      <h3 class="opc-title">${esc(t.title)}</h3>
      <div class="opc-prog"><div class="opc-bar"><i style="width:${pct}%"></i></div><span>${final ? "" : `${s} / ${t.n}`}</span></div>
      <div class="opc-st">${status}</div>
      <div class="opc-rew">${this.chips(t)}</div>
      <div class="opc-act">${done
        ? `<button class="op-btn op-claim" data-op-claim="${i}">Забрать награду</button>`
        : `<span class="opc-hint">Выполните задание — следующее откроется автоматически</span>`}</div>
    </article>`;
  },

  cardClaimed(G, i) {
    const op = G.op, t = OP_TASKS[i], esc = this.esc;
    const btns = op.tickets.filter(tk => tk.task === i && !tk.used).map(tk =>
      `<button class="op-btn op-btn-ghost" data-op-ticket="${tk.id}">Открыть «${esc(CASES[tk.caseId] ? CASES[tk.caseId].name : tk.caseId)}»</button>`
    ).join("");
    return `<article class="opc st-claimed" data-op-card="${i}">
      <div class="opc-top"><span class="opc-no">№ ${i + 1}</span><span class="opc-st ok">✓ ПОЛУЧЕНО</span></div>
      <h3 class="opc-title">${esc(t.title)}</h3>
      <div class="opc-rew">${this.chips(t)}</div>
      ${btns ? `<div class="opc-act">${btns}</div>` : ""}
    </article>`;
  },

  // следующее задание: только номер, без названия и награды
  cardNext(i) {
    return `<article class="opc st-next">
      <div class="opc-q">?</div>
      <div class="opc-no">№ ${i + 1}</div>
      <div class="opc-hint">Откроется, когда вы получите текущее задание</div>
    </article>`;
  },

  // ленту центрирует текущую карточку; элемент ленты не пересоздаётся, поэтому переезд анимируется
  center(root, animate) {
    const stage = root.querySelector("#op-stage");
    const track = root.querySelector("#op-track");
    const cur = track.querySelector(".is-cur") || track.lastElementChild;
    if (!cur || !stage.clientWidth) return;
    const x = stage.clientWidth / 2 - (cur.offsetLeft + cur.offsetWidth / 2);
    track.style.transition = animate && !OP_REDUCED() ? "transform .8s cubic-bezier(.2,.8,.2,1)" : "none";
    track.style.transform = `translateX(${x}px)`;
  },

  // ---------- эффекты ----------
  celebrate(root, card, bal, milestone, hasTicket) {
    if (OP_REDUCED() || !root) return;
    const hero = root.querySelector(".op-hero .op-flash");
    if (hero) { hero.classList.remove("on"); void hero.offsetWidth; hero.classList.add("on"); }

    const cols = ["#ff2e9a", "#1fe3ff", "#9b5cff", "#ffffff", "#3dffb4"];
    if (card) {
      const b = document.createElement("div");
      b.className = "op-burst";
      const N = milestone ? 36 : 18;
      let html = `<i class="ring"></i>`;
      for (let k = 0; k < N; k++) {
        const a = Math.random() * Math.PI * 2;
        const d = (milestone ? 170 : 110) * (0.5 + Math.random() * 0.7);
        html += `<i class="sp" style="--dx:${(Math.cos(a) * d).toFixed(1)}px;--dy:${(Math.sin(a) * d).toFixed(1)}px;--r:${Math.round(Math.random() * 540 - 270)}deg;--c:${cols[k % cols.length]}"></i>`;
      }
      b.innerHTML = html;
      card.appendChild(b);
      setTimeout(() => b.remove(), 1000);

      const f = document.createElement("div");
      f.className = "op-float";
      f.textContent = bal ? `+${UI.fmt(bal)} ₽` : hasTicket ? "БЕСПЛАТНО!" : "ПОЛУЧЕНО";
      card.appendChild(f);
      setTimeout(() => f.remove(), 1500);
    }

    if (milestone) {
      const box = root.querySelector(".op-confetti");
      if (box) {
        for (let k = 0; k < 64; k++) {
          const p = document.createElement("i");
          p.style.left = (30 + Math.random() * 40).toFixed(1) + "%";
          p.style.top = (30 + Math.random() * 10).toFixed(1) + "%";
          p.style.setProperty("--dx", (Math.random() * 640 - 320).toFixed(0) + "px");
          p.style.setProperty("--dy", (Math.random() * -320 - 60).toFixed(0) + "px");
          p.style.setProperty("--r", (Math.random() * 720 - 360).toFixed(0) + "deg");
          p.style.background = cols[k % cols.length];
          p.style.animationDelay = (Math.random() * 0.2).toFixed(2) + "s";
          box.appendChild(p);
        }
        setTimeout(() => { box.innerHTML = ""; }, 2400);
      }
    }
  },

  init() {
    // отрисовка и обработчики создаются при первом показе вкладки (см. render)
  },
};
