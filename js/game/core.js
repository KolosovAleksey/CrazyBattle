// js/game/core.js — Ядро игры: состояние, роутинг, сохранение, общие операции с инвентарём и обработка действий.

const Game = {
  ITEM_WIDTH: 120,

  balance: 0,

  inventory: [],

  stats: {},

  tradeUrl: "",

  email: "",

  profileName: "Игрок",

  csInventory: [], // предметы, выведенные с сайта в КС

  csLoadout: { ct: {}, t: {} }, // снаряжение по сторонам: слот -> uid

  battleState: { mode: null, skinUid: null, caseId: null, count: 1, result: null }, // Battle (сессионное)

  rigged: false, // «Подкрут»: шансы умножаются на rigMult (скрыто от интерфейса апгрейда)

  rigMult: 2, // множитель «Подкрута», задаётся в админ панели

  // состояние апгрейда (сессионное, не сохраняется)
  up: { selected: [], balanceAdd: 0, mult: null, cachedTarget: null, targetId: null, spinning: false, chain: null },

  // состояние контракта (сессионное, не сохраняется)
  ct: { selected: [], balanceAdd: 0, rarity: "any", resolving: false, page: 0, sort: "asc" },

  currentCaseId: null,

  openCount: 1, // сколько кейсов открыть за раз (1–10)

  isSpinning: false,

  route: "home",

  init() {
    const saved = loadGame();
    if (saved) {
      this.balance = saved.balance ?? 0;
      this.avatar = saved.avatar || "";
      this.history = Array.isArray(saved.history) ? saved.history.filter(h => ITEMS[h.id]) : [];
      // предметы сверяем с каталогом; у старых сохранений добавляем uid
      this.inventory = (saved.inventory ?? [])
        .filter(i => ITEMS[i.id])
        .map(i => ({ ...this.makeInstance(ITEMS[i.id], { v: i.variant ?? null, n: i.wear ?? null,
                       p: i.price ?? ITEMS[i.id].price }), uid: i.uid || this.makeUid(), isNew: !!i.isNew }));
      this.inventory.forEach(it => {
        if (!this.history.some(h => h.uid === it.uid)) {
          this.history.push({ uid: it.uid, id: it.id, status: "owned", variant: it.variant ?? null, wear: it.wear ?? null, price: it.price });
        }
      });
      this.stats = { ...this.defaultStats(), ...(saved.stats || {}) };
      this.stampAchievements(); // молча отмечаем уже полученные (без уведомлений)
      this.profileName = saved.profileName || "Игрок";
      this.rigged = !!saved.rigged;
      this.rigMult = saved.rigMult ?? 2;
      this.csInventory = (saved.csInventory ?? []).filter(i => ITEMS[i.id]);
      this.csLoadout = csMigrateLoadout(saved.csLoadout);
      // золотая цепочка не завершилась до перезагрузки: защищённая ставка возвращается в инвентарь
      if (saved.upChain && saved.upChain.bet) {
        this.addToInventory(saved.upChain.bet, true);
      }
    } else {
      this.stats = this.defaultStats();
      this.stampAchievements(); // первый запуск: отметка без уведомления
      this.history = [];
      this.avatar = "";
    }

    this.op = Operation.load(saved ? saved.operation : null);
    this.freeTicket = null;
    if (!this.stats.createdAt) this.stats.createdAt = Date.now();
    this.accountId = (saved && saved.accountId) || this.makeUid();
    if (saved && saved.upChain) this.save(); // сохраняем уже без незавершённой цепочки

    UI.init();
    Operation.init();
    UI.updateBalance(this.balance);
    UI.updateProfileChip(this.profileName, this.avatar);
    UI.seedFeed();

    window.addEventListener("hashchange", () => this.handleRoute());
    this.bindEvents();
    this.handleRoute();
    this.startFeed();
  },

  defaultStats() {
    return {
      casesOpened: 0,
      casesSeen: [],         // id открытых кейсов (уникальные)
      catCount: {},          // открытий по категориям
      maxBatch: 0,           // максимум кейсов за одно открытие
      rarityCount: {},       // получено предметов по редкости
      lowestWinChance: null, // минимальный шанс выигранного апгрейда, %
      goldHits: 0,           // выпавших золотых прокрутов в апгрейдах
      contracts10: 0,        // контрактов из максимального числа предметов
      sellAll: 0,            // нажатий «Продать всё»
      csCount: 0, csValue: 0,// выведено в КС: штук и сумма
      nameChanged: false, avatarChanged: false,
      visited: [],           // открытые разделы сайта
      csTabs: [],            // открытые вкладки КС
      statsOpened: false,    // открывали окно статистики
      skinBattles: 0, skinWins: 0,
      achAt: {},             // id достижения → время получения (мс)
      spent: 0,
      upgrades: 0,
      upgradesWon: 0,
      contracts: 0,
      soldCount: 0,
      earned: 0,
      bestDrop: null, // { name, rarity, price }
      createdAt: null,   // дата регистрации (мс)
      depCount: 0, depTotal: 0, depMax: 0,
      deposits: [],      // последние пополнения [{ amount, at }]
      obtained: 0, obtainedValue: 0, // всего получено предметов и их стоимость
      upSpent: 0,        // вложено в апгрейды
      ctSpent: 0,        // вложено в контракты
    };
  },

  navigate(route) {
    location.hash = route;
  },

  handleRoute() {
    const hash = (location.hash || "#home").replace(/^#/, "") || "home";
    let route = hash, caseId = null;
    if (hash.startsWith("case:")) {
      route = "case";
      caseId = hash.slice(5);
    }
    if (!["home", "upgrade", "contracts", "profile", "case", "cs", "battle", "operation"].includes(route)) route = "home";
    if (route !== "case") this.freeTicket = null;

    this.route = route;
    if (!this.stats.visited) this.stats.visited = [];
    if (!this.stats.visited.includes(route)) this.stats.visited.push(route);
    UI.showView(route);
    UI.setActiveTab(route);
    document.body.classList.add("neon");   // неон-тема на всём сайте

    this.resetSection(route);
    if (this.pendingPick && this.pendingPick.route === route) {
      const idx = this.inventory.findIndex(i => i.uid === this.pendingPick.uid);
      this.pendingPick = null;
      if (idx >= 0) {
        if (route === "upgrade" && !this.up.spinning) this.up.selected = [idx];
        if (route === "contracts" && !this.ct.resolving) this.ct.selected = [idx];
      }
    }

    if (route === "home") UI.renderHome(this);
    else if (route === "operation") Operation.render(this);
    else if (route === "upgrade") UI.renderUpgrade(this);
    else if (route === "contracts") UI.renderContracts(this);
    else if (route === "profile") { this.clearNewFlags(); UI.renderProfile(this); }
    else if (route === "case") {
      this.openCaseView(caseId);
      // переход из операции: кейс открывается сам по билету
      if (this.freeTicket && this.freeTicket.caseId === caseId) {
        setTimeout(() => { if (this.route === "case" && this.freeTicket) this.openCase(1, false); }, 400);
      } else this.freeTicket = null;
    }
    else if (route === "battle") {
      // при входе во вкладку Battle ничего не выбрано: показываем две карточки режимов
      this.battleState.mode = null;
      this.battleState.result = null;
      this.battleState.skinUid = null;
      UI.renderBattle(this);
    }
  },

  refreshCurrentView() {
    if (this.route === "home") UI.renderHome(this);
    else if (this.route === "operation") Operation.render(this);
    else if (this.route === "upgrade") UI.renderUpgrade(this);
    else if (this.route === "contracts") UI.renderContracts(this);
    else if (this.route === "profile") UI.renderProfile(this);
    else if (this.route === "cs") UI.renderCs(this);
    else if (this.route === "battle") UI.renderBattle(this);
  },

  // Запоминает момент получения каждого достижения (для блока «последние полученные» в профиле).
  stampAchievements() {
    if (typeof ACHIEVEMENTS === "undefined" || !ACHIEVEMENTS.length) return;
    const at = this.stats.achAt || (this.stats.achAt = {});
    const now = Date.now();
    const fresh = [];
    ACHIEVEMENTS.forEach(a => {
      if (at[a.id]) return;
      try { if (a.done(this)) { at[a.id] = now; fresh.push(a); } } catch (e) { /* пропуск */ }
    });
    // уведомления — только после загрузки сохранения, иначе при входе посыплются все старые достижения
    const ready = !!this._achReady;
    this._achReady = true;
    if (ready && fresh.length && typeof UI !== "undefined" && UI.showAchToast) {
      fresh.forEach((a, i) => setTimeout(() => UI.showAchToast(a), i * 700));
    }
  },

  save() {
    this.stampAchievements();
    saveGame({
      balance: this.balance,
      inventory: this.inventory.map(i => ({ id: i.id, uid: i.uid, isNew: !!i.isNew, variant: i.variant ?? null, wear: i.wear ?? null, price: i.price })),
      history: this.history,
      stats: this.stats,
      avatar: this.avatar,
      profileName: this.profileName,
      rigged: this.rigged,
      rigMult: this.rigMult,
      accountId: this.accountId,
      csInventory: this.csInventory,
      csLoadout: this.csLoadout,
      upChain: this.up.chain,
      operation: this.op,
    });
  },

  updateBestDrop(item) {
    if (!this.stats.bestDrop || item.price > this.stats.bestDrop.price) {
      this.stats.bestDrop = { id: item.id, name: item.name, rarity: item.rarity, price: item.price };
    }
  },

  clearNewFlags() {
    this.inventory.forEach(i => { i.isNew = false; });
    this.save();
  },

  clearSelections() {
    this.up.selected = [];
    this.up.mult = null;
    this.up.cachedTarget = null;
    this.ct.selected = [];
    this.ct.balanceAdd = 0;
  },

  // счётчики для достижений: уникальные кейсы, категории, максимум за раз
  trackCases(caseId, caseData, count) {
    const s = this.stats;
    if (!s.casesSeen) s.casesSeen = [];
    if (!s.casesSeen.includes(caseId)) s.casesSeen.push(caseId);
    if (!s.catCount) s.catCount = {};
    s.catCount[caseData.cat] = (s.catCount[caseData.cat] || 0) + count;
    s.maxBatch = Math.max(s.maxBatch || 0, count);
  },

  stripWears(item) {
    const { wears, st, sv, ...rest } = item;
    return rest;
  },

  // экземпляр предмета конкретного варианта (v: null | "st" | "sv") и износа (n) с ценой p
  makeInstance(item, o) {
    return { ...this.stripWears(item), name: variantName(item.name, o.v), variant: o.v ?? null,
             wear: o.n ?? null, price: o.p };
  },

  // случайный выбор по весам
  pickWeighted(list, wt) {
    const total = list.reduce((s, x) => s + wt(x), 0);
    let r = Math.random() * total;
    for (const x of list) {
      r -= wt(x);
      if (r <= 0) return x;
    }
    return list[list.length - 1];
  },

  // экземпляр при выпадении: вариант по весам VARIANT_WEIGHT (из доступных у скина), затем износ по WEAR_WEIGHT
  rollInstance(id) {
    const item = ITEMS[id];
    const opts = [];
    if (item.wears && item.wears.length) opts.push({ v: null, list: item.wears, w: VARIANT_WEIGHT.n });
    if (item.st && item.st.length) opts.push({ v: "st", list: item.st, w: VARIANT_WEIGHT.st });
    if (item.sv && item.sv.length) opts.push({ v: "sv", list: item.sv, w: VARIANT_WEIGHT.sv });
    if (!opts.length) return this.makeInstance(item, { v: null, n: null, p: item.price });
    const chosen = this.pickWeighted(opts, o => o.w);
    const pick = this.pickWeighted(chosen.list, e => WEAR_WEIGHT[e.n] || 1);
    return this.makeInstance(item, { v: chosen.v, n: pick.n, p: pick.p });
  },

  // при входе в раздел — дефолтное состояние (выборы и результат не сохраняются)
  resetSection(route) {
    if (route === "cs") { UI.csTab = null; UI.renderCs(this); }
    if (route === "upgrade" && !this.up.spinning) {
      this.up.selected = [];
      this.up.balanceAdd = 0;
      this.up.mult = null;
      this.up.targetId = null;
      this.up.cachedTarget = null;
      this.up.spinView = null;
      UI.clearUpgradeResult();
    }
    if (route === "contracts" && !this.ct.resolving) {
      this.ct.selected = [];
      this.ct.balanceAdd = 0;
      this.ct.page = 0;
      UI.clearContractResult();
    }
  },

  goPick(route, uid) {
    this.pendingPick = { route, uid };
    this.navigate(route);
  },

  makeUid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  // статус предмета в истории: owned / sold / upgrade / contract
  setStatus(item, status) {
    const h = this.history.find(x => x.uid === item.uid);
    if (h) h.status = status;
    else this.history.push({ uid: item.uid, id: item.id, status, variant: item.variant ?? null, wear: item.wear ?? null, price: item.price });
  },

  addToInventory(item, silent = false) {
    const it = { ...item, uid: this.makeUid(), isNew: true };
    this.inventory.push(it);
    if (!silent) {
      this.stats.obtained++; this.stats.obtainedValue += it.price;
      if (!this.stats.rarityCount) this.stats.rarityCount = {};
      this.stats.rarityCount[it.rarity] = (this.stats.rarityCount[it.rarity] || 0) + 1;
    }
    this.history.push({ uid: it.uid, id: it.id, status: "owned", variant: it.variant ?? null, wear: it.wear ?? null, price: it.price });
    this.updateBestDrop(it);
    return it;
  },

  handleAction(action, el) {
    const idx = +el.dataset.index;
    switch (action) {
      case "open-deposit":   UI.showDepositModal(this); break;
      case "close-modal":    UI.closeModal(); break;
      case "deposit-amount": this.deposit(+el.dataset.amount); break;
      case "case-back":      if (!this.isSpinning) this.navigate("home"); break;
      case "open-1":         this.openCase(this.openCount, false); break;
      case "open-fast":      this.openCase(this.openCount, true); break;
      case "case-count":     this.openCount = +el.dataset.value; UI.updateCaseCount(this); break;
      case "again":          this.resetCaseSelection(); break;
      case "sell-pending":   this.sellPending(); break;
      case "sell":           this.sellItem(idx); break;
      case "sell-all":       this.sellAll(); break;
      case "up-toggle":      this.upToggleItem(idx); break;
      case "up-mult":        SFX.play(el.dataset.kind === "mystic" ? "mystic_select" : "percent"); this.upSetMult(el.dataset.kind, +el.dataset.value); break;
      case "up-spin":        this.upSpin(); break;
      case "up-target":      SFX.play(this.up.mult && this.up.mult.kind === "mystic" ? "mystic_select" : "select", { rate: 0.85 }); this.upSetTarget(el.dataset.id); break;
      case "pending-one":    this.pendingSell(el.dataset.uid); break;
      case "pf-sell": {
        const price = this.sellUid(el.dataset.uid);
        if (price) {
          SFX.play("sell_one");
          this.save();
          UI.toast(`Продано: +${UI.fmt(price)} ₽`, "success");
          this.refreshCurrentView();
        }
        break;
      }
      case "pf-to-ct":       this.goPick("contracts", el.dataset.uid); break;
      case "pf-to-up":       this.goPick("upgrade", el.dataset.uid); break;
      case "inv-sort":       UI.invSort = UI.invSort === el.dataset.value ? null : el.dataset.value; UI.renderProfile(this); break;
      case "pf-settings":    UI.showSettingsModal(this); break;
      case "settings-save":  this.saveSettings(document.getElementById("set-name").value, UI.pendingAvatar); break;
      case "auth-logout":    Auth.logout(); break;
      case "avatar-reset":   UI.pendingAvatar = ""; UI.refreshAvatarPreview(""); break;
      case "inv-filter":     UI.invFilter = el.dataset.value; UI.renderProfile(this); break;
      case "up-settings":   UI.showUpSettings(); break;
      case "up-fast":       UI.toggleUpFast(); break;
      case "up-sound":      UI.toggleUpSound(); break;
      case "up-arrow":      SFX.play("percent"); UI.setUpArrow(+el.dataset.index); break;
      case "up-reset-quick": SFX.play("deselect"); UI.resetUpQuick(); break;
      case "up-inv-sort":   UI.toggleUpInvSort(); break;
      case "pager":
        UI.setPage(el.dataset.key, +el.dataset.page);
        if (el.dataset.key.startsWith("up")) UI.renderUpgrade(this); else UI.renderProfile(this);
        break;
      case "ct-page":        this.ctPage(+el.dataset.value); break;
      case "ct-sort":        this.ctToggleSort(); break;
      case "ct-toggle":      this.ctToggleItem(idx); break;
      case "ct-sign":        this.ctSign(); break;
      case "open-stats":      UI.showStatsModal(this); break;
      case "open-ach":        UI.showAchModal(this); break;
      case "cs-tab":          UI.csTab = el.dataset.value; UI.renderCs(this); break;
      case "cs-home":         UI.csTab = null; UI.renderCs(this); break;
      case "cs-side":         UI.csSide = el.dataset.value; UI.renderCs(this); break;
      case "cs-slot": {
        const sd = el.dataset.side || UI.csSide || "ct";
        const same = UI.csSlot === el.dataset.value && (UI.csSide || "ct") === sd;
        UI.csSide = sd;
        UI.csSlot = same ? null : el.dataset.value;
        UI.renderCs(this); break;
      }
      case "cs-equip":        this.csEquip(el.dataset.uid); break;
      case "cs-unequip":      this.csUnequip(el.dataset.value, el.dataset.side); break;
      case "cs-inv-filter":   UI.csInvFilter = el.dataset.value; UI.renderCs(this); break;
      case "cs-withdraw":     this.withdrawToCs(el.dataset.uid); break;
      case "bt-mode":           this.battleSetMode(el.dataset.value); break;
      case "bt-back":           this.battleBack(); break;
      case "bt-case":           this.battleSetCase(el.dataset.value); break;
      case "bt-pick":           this.battlePickSkin(el.dataset.uid); break;
      case "bt-count":          this.battleSetCount(el.dataset.value); break;
      case "bt-skin-start":     this.battleSkinStart(); break;
      case "bt-case-start":     this.battleCaseStart(); break;
      case "pf-name":        this.setProfileName(document.getElementById("pf-name").value); break;
    }
  },

  bindEvents() {
    document.addEventListener("click", e => {
      const routeEl = e.target.closest("[data-route]");
      if (routeEl) { this.navigate(routeEl.dataset.route); return; }

      const caseEl = e.target.closest("[data-case]");
      if (caseEl) { this.navigate("case:" + caseEl.dataset.case); return; }

      const actionEl = e.target.closest("[data-action]");
      if (actionEl && !actionEl.disabled) this.handleAction(actionEl.dataset.action, actionEl);
    });

    document.addEventListener("input", e => {
      if (e.target.id === "up-balance-slider") this.upSetBalance(+e.target.value);
      if (e.target.id === "ct-balance-slider") this.ctSetBalance(+e.target.value);
    });

    document.addEventListener("change", e => {
      if (e.target.id === "ct-rarity") this.ctSetRarity(e.target.value);
      if (e.target.id === "set-avatar") UI.previewAvatar(e.target);
      if (e.target.id === "bt-case") this.battleSetCase(e.target.value);
    });

    // Enter в полях профиля
    document.addEventListener("keydown", e => {
      if (e.key !== "Enter") return;
      const map = { "pf-name": "pf-name", "pf-trade": "pf-trade", "pf-email": "pf-email" };
      if (map[e.target.id]) this.handleAction(map[e.target.id], e.target);
    });
  },
};
