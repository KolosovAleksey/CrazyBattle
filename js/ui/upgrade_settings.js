// js/ui/upgrade_settings.js — Апгрейд: настройки, быстрые кнопки, панель инструментов.

Object.assign(UI, {
  // Вращается стрелка: останавливается внутри зелёной зоны (выигрыш) или вне её (проигрыш)
  upCfg() {
    if (!this.upSet) {
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem("case_naebattle_up_settings") || "{}"); } catch (e) { saved = {}; }
      this.upSet = { arrow: 0, quickMult: [2, 5, 10], quickChance: [2, 5, 30], fast: false, sound: true, ...saved };
    }
    return this.upSet;
  },

  saveUpCfg(patch) {
    this.upSet = { ...this.upCfg(), ...patch };
    try { localStorage.setItem("case_naebattle_up_settings", JSON.stringify(this.upSet)); } catch (e) { /* без хранилища */ }
  },

  // цвет стрелки и кнопки «Быстрый режим» / «Звук» — по сохранённым настройкам
  applyUpTools() {
    const c = this.upCfg();
    const arrow = document.getElementById("arrow");
    if (arrow) arrow.style.setProperty("--arrow-c", ARROW_COLORS[c.arrow] || ARROW_COLORS[0]);
    const f = document.getElementById("up-fast-btn");
    if (f) f.classList.toggle("on", !!c.fast);
    const s = document.getElementById("up-sound-btn");
    if (s) s.classList.toggle("off", !c.sound);
  },

  // кнопки быстрого подбора: x2/x5/x10 и 2%/5%/30% — берутся из настроек
  applyQuickButtons() {
    const c = this.upCfg();
    document.querySelectorAll("#up-mults [data-kind='price']").forEach((b, i) => {
      b.dataset.value = c.quickMult[i];
      b.textContent = `x${c.quickMult[i]}`;
    });
    document.querySelectorAll("#up-mults [data-kind='chance']").forEach((b, i) => {
      b.dataset.value = c.quickChance[i];
      b.textContent = `${c.quickChance[i]}%`;
    });
  },

  showUpSettings() {
    const c = this.upCfg();
    const arrows = ARROW_COLORS.map((col, i) => `
      <button class="us-arrow ${c.arrow === i ? "on" : ""}" data-action="up-arrow" data-index="${i}" style="--ac:${col}">
        <span class="us-arr"></span>
      </button>`).join("");
    const ins = (key, arr, lead, tail) => arr.map((v, i) => `
      <div class="us-in">${lead}<input type="number" data-key="${key}" data-i="${i}" value="${v}"
        step="${key === "quickMult" ? 0.1 : 1}" min="${key === "quickMult" ? 1.1 : 2}" max="${key === "quickMult" ? 100 : 75}">${tail}</div>`).join("");
    this.el("modal-root").innerHTML = `
      <div class="modal-backdrop" id="modal-bg">
        <div class="modal up-set-modal">
          <div class="modal-head">
            <b>⚙ Прочие настройки</b>
            <button class="x" data-action="close-modal">✕</button>
          </div>
          <div class="us-sec">
            <div class="us-title">Тип стрелки</div>
            <div class="us-sub">Внешний вид стрелки, указывающей на шанс.</div>
            <div class="us-arrows">${arrows}</div>
          </div>
          <div class="us-sec">
            <div class="us-title">Быстрый подбор</div>
            <div class="us-sub">Кнопки подбора по коэффициенту и по проценту.</div>
            <div class="us-row">
              <div class="us-grp">
                <span class="us-lbl">Коэффициент</span>
                <div class="us-ins">${ins("quickMult", c.quickMult, "<span>x</span>", "")}</div>
              </div>
              <div class="us-grp">
                <span class="us-lbl">Процент</span>
                <div class="us-ins">${ins("quickChance", c.quickChance, "", "<span>%</span>")}</div>
              </div>
            </div>
            <button class="us-reset" data-action="up-reset-quick">Сбросить</button>
          </div>
        </div>
      </div>`;
    this.el("modal-bg").addEventListener("click", e => {
      if (e.target.id === "modal-bg") this.closeModal();
    });
    this.el("modal-root").querySelectorAll("input[data-key]").forEach(inp => {
      inp.addEventListener("change", () => this.setQuickValue(inp));
    });
  },

  setQuickValue(inp) {
    const c = this.upCfg();
    const key = inp.dataset.key, i = +inp.dataset.i;
    const isMult = key === "quickMult";
    const [lo, hi] = isMult ? [1.1, 100] : [2, 75]; // как MIN/MAX_CHANCE апгрейда
    let v = parseFloat(inp.value);
    if (!Number.isFinite(v)) v = c[key][i];
    v = Math.min(hi, Math.max(lo, v));
    v = isMult ? Math.round(v * 10) / 10 : Math.round(v);
    const arr = c[key].slice();
    arr[i] = v;
    this.saveUpCfg({ [key]: arr });
    inp.value = v;
    this.applyQuickButtons();
  },

  setUpArrow(i) {
    this.saveUpCfg({ arrow: i });
    this.applyUpTools();
    this.el("modal-root").querySelectorAll(".us-arrow").forEach(a => {
      a.classList.toggle("on", +a.dataset.index === i);
    });
  },

  resetUpQuick() {
    this.saveUpCfg({ quickMult: [2, 5, 10], quickChance: [2, 5, 30] });
    this.applyQuickButtons();
    this.showUpSettings();
  },

  toggleUpFast() {
    this.saveUpCfg({ fast: !this.upCfg().fast });
    this.applyUpTools();
  },

  toggleUpSound() {
    this.saveUpCfg({ sound: !this.upCfg().sound });
    this.applyUpTools();
  },

  toggleUpInvSort() {
    this.upInvSort = (this.upInvSort || "asc") === "asc" ? "desc" : "asc";
    this.renderUpgrade(Game);
  },
});
