// js/ui/cases.js — Главная (кейсы) и экран открытия кейса.

Object.assign(UI, {
  renderHome(G) {
    const q = this.el("case-search").value.trim().toLowerCase();
    const sort = this.el("case-sort").value;
    const cat = this.el("case-cat").value;
    let list = Object.values(CASES).filter(c => (!q || c.name.toLowerCase().includes(q)) && (!cat || c.cat === cat));
    if (sort === "price-desc") list.sort((a, b) => b.price - a.price);
    else if (sort === "price-asc") list.sort((a, b) => a.price - b.price);

    const card = c => `
      <div class="case-card" data-case="${c.id}" style="--glow:${c.color}" role="button" tabindex="0">
        ${c.isNew ? `<span class="case-badge">NEW</span>` : ""}
        <div class="case-img">
          <img class="img-back" src="${c.img}_back.webp" alt="">
          ${c.front ? `<img class="img-front" src="${c.img}_front.webp" alt="">` : ""}
        </div>
        <div class="case-name">${this.esc(c.name)}</div>
        <div class="case-meta">${c.count} предметов</div>
        <div class="case-price"><span class="coin">₽</span>${this.fmt(c.price)}</div>
      </div>`;
    // группы по категориям (порядок как в CASE_CATEGORIES); внутри группы — текущая сортировка
    const groups = CASE_CATEGORIES
      .map(name => ({ name, items: list.filter(c => c.cat === name) }))
      .filter(g => g.items.length);
    this.el("cases-grid").innerHTML = list.length ? groups.map(g => `
      <section class="cases-section">
        <h3 class="cases-cat-title">${this.esc(g.name)} <span>${g.items.length}</span></h3>
        <div class="cases-grid">${g.items.map(card).join("")}</div>
      </section>`).join("") : `<div class="empty">Ничего не найдено</div>`;
  },

  renderCaseView(c) {
    this.el("view-case").style.setProperty("--glow", c.color);
    this.el("case-hero-img").innerHTML = `
      <img class="img-back" src="${c.img}_back.webp" alt="">
      ${c.front ? `<img class="img-front" src="${c.img}_front.webp" alt="">` : ""}`;
    this.el("case-title").textContent = `«${c.name}»`;
    document.querySelector(".case-kicker").textContent = c.cat || "";

    const drops = c.drops
      .map(d => ITEMS[d.itemId])
      .sort((a, b) => b.price - a.price);
    this.el("case-drops-grid").innerHTML = drops.map(i => this.dropTile(i)).join("");

    this.renderIdle(c);

    this.hideCaseResults();
    this.setCasePlaying(false);
    this.setCaseButtonsEnabled(true);
    this.updateCaseCount(Game);
  },

  // метка износа рядом с ценой (у скинов)
  wearTag(it) {
    return it.wear ? ` <span class="wear-tag" title="${WEAR_NAME[it.wear] || ""}">${it.wear}</span>` : "";
  },

  // Плитка предмета в «Содержимом кейса»: цена сверху, скин и оружие снизу
  dropTile(item) {
    const parts = item.name.split(" | ");
    const weapon = parts.length > 1 ? parts[0] : "";
    const skin = parts.length > 1 ? parts[1] : parts[0];
    return `
      <div class="drop-tile" style="--rc:${this.rc(item.rarity)}">
        <div class="drop-price">${this.fmt(item.price)} ₽</div>
        <div class="drop-img"><img src="${itemImg(item)}" alt="" loading="lazy"></div>
        <div class="drop-name">
          <b>${this.esc(skin)}</b>
          <span>${this.esc(weapon)}</span>
        </div>
      </div>`;
  },

  // Счётчик «Открыть N раз» и цены на кнопках
  updateCaseCount(G) {
    const c = CASES[G.currentCaseId];
    if (!c) return;
    const n = G.openCount || 1;
    document.querySelectorAll("#count-btns .count-btn").forEach(b => {
      b.classList.toggle("active", +b.dataset.value === n);
    });
    this.el("open-price").textContent = `${this.fmt(c.price * n)} ₽`;
    this.el("fast-price").textContent = `${this.fmt(c.price * n)} ₽`;
  },

  // Строит рулетки: одна широкая (1 кейс) или сетка (несколько кейсов).
  // Возвращает [{win, strip}] для анимации.
  // Стадия выбора: лент нет, под кнопками ничего не выводится (контейнер пуст и скрыт)
  renderIdle() {
    this.el("roulette-grid").innerHTML = "";
  },

  renderRolls(rolls) {
    const grid = this.el("roulette-grid");
    const many = rolls.length > 1;
    const cols = many ? Math.min(rolls.length, 4) : 1;
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.innerHTML = rolls.map(r => `
      <div class="rw ${many ? "small" : ""}">
        <div class="rw-ring"></div>
        <div class="rw-line"></div>
        <div class="roulette-pointer top"></div>
        <div class="roulette-pointer bottom"></div>
        <div class="roulette">
          ${r.items.map(it => `
            <div class="ri" style="--rc:${this.rc(it.rarity)}">
              <img src="${itemImg(it)}" alt="">
              <div class="ri-name">${this.esc(it.name)}</div>
            </div>`).join("")}
        </div>
      </div>`).join("");
    return [...grid.querySelectorAll(".rw")].map(w => ({
      win: w,
      strip: w.querySelector(".roulette"),
    }));
  },

  setCaseButtonsEnabled(enabled) {
    ["btn-open", "btn-fast"].forEach(id => {
      const b = this.el(id);
      if (b) b.disabled = !enabled;
    });
    document.querySelectorAll("#count-btns .count-btn").forEach(b => { b.disabled = !enabled; });
  },

  hideCaseResults() {
    this.el("case-actions").classList.add("hidden");
  },

  // Во время открытия и на экране результата прячем картинку кейса, счётчик и кнопки:
  // наверху остаются только ленты (или окна результата). on = false возвращает обычный вид.
  setCasePlaying(on) {
    [".case-stage", ".count-row", ".open-row"].forEach(sel => {
      const el = document.querySelector(`#view-case ${sel}`);
      if (el) el.classList.toggle("hidden", on);
    });
  },

  // Результат открытия: в каждом окне — выигравший скин и его стоимость
  renderResults(items) {
    const grid = this.el("roulette-grid");
    const many = items.length > 1;
    const cols = many ? Math.min(items.length, 4) : 1;
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.innerHTML = items.map(it => `
      <div class="rw won ${many ? "small" : ""}" style="--rc:${this.rc(it.rarity)}">
        <div class="rw-ring"></div>
        <div class="rw-won-img"><img src="${itemImg(it)}" alt=""></div>
        <div class="rw-won-name">${this.esc(it.name)}</div>
        <div class="rw-won-price">${this.fmt(it.price)} ₽${this.wearTag(it)}</div>
        <button class="rw-sell" data-action="pending-one" data-uid="${it.uid}">Продать</button>
      </div>`).join("");

    const total = items.reduce((s, i) => s + i.price, 0);
    this.el("btn-sell-pending").textContent = `Продать всё за ${this.fmt(total)} ₽`;
    this.setCasePlaying(true);
    this.el("case-actions").classList.remove("hidden");
  },
});
