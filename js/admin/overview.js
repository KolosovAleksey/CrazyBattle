// js/admin/overview.js — вкладка «Обзор»: ключевые цифры, регистрации за 14 дней, топ по КС.

const Overview = {
  async render(view, alive) {
    view.innerHTML = `<div class="adm-head"><div><h1>Обзор</h1><small>Сводка по аккаунтам игроков</small></div></div>
      <div class="adm-empty">Загрузка…</div>`;
    const r = await Admin.api("GET", "/api/admin/stats");
    if (!alive()) return;
    if (!r.ok) {
      view.innerHTML = `<div class="panel adm-card"><div class="adm-error">${Admin.esc(Admin.errText(r))}</div></div>`;
      return;
    }
    const d = r.data;
    const cards = [
      ["Игроков", Admin.fmt(d.players), "аккаунты без служебных"],
      ["С сохранением", Admin.fmt(d.with_save), `${Admin.fmt(d.players - d.with_save)} не заходили в игру`],
      ["Заблокировано", Admin.fmt(d.blocked), "вход закрыт, данные целы"],
      ["Активны за сутки", Admin.fmt(d.active_day), "заходили за последние 24 ч"],
      ["Сумма балансов", Admin.rub(d.balance), "на счетах игроков"],
      ["Стоимость КС", Admin.rub(d.cs_value), "инвентарь, выведенный в КС"],
    ];
    const maxReg = Math.max(1, ...d.registrations.map(x => x.count));
    const bars = d.registrations.map(x => {
      const [, m, dd] = x.day.split("-");
      const h = x.count ? Math.max(4, Math.round(x.count / maxReg * 100)) : 2;
      return `<div class="adm-bar" title="${dd}.${m}: ${x.count}">
        <b>${x.count}</b><i style="height:${h}%"></i><span>${dd}.${m}</span></div>`;
    }).join("");
    const top = d.top.length
      ? d.top.map((t, i) => `<tr>
          <td class="num">${i + 1}</td>
          <td><a href="#players?q=${encodeURIComponent(t.nick)}">${Admin.esc(t.nick)}</a></td>
          <td class="num">${Admin.fmt(t.count)}</td>
          <td class="num">${Admin.rub(t.value)}</td></tr>`).join("")
      : `<tr><td colspan="4" class="adm-empty">Пока нет игроков с предметами в КС</td></tr>`;

    view.innerHTML = `
      <div class="adm-head"><div><h1>Обзор</h1><small>Сводка по аккаунтам игроков. Служебные аккаунты не учитываются.</small></div>
        <div class="adm-row"><a class="btn-outline" href="#players">Все игроки →</a></div></div>
      <div class="adm-grid-3" style="margin-bottom:16px">
        ${cards.map(c => `<div class="panel adm-stat"><small>${Admin.esc(c[0])}</small><b>${c[1]}</b><em>${Admin.esc(c[2])}</em></div>`).join("")}
      </div>
      <div class="adm-grid-2">
        <div class="panel adm-card">
          <h2>Регистрации за 14 дней</h2>
          <div class="adm-bars">${bars}</div>
        </div>
        <div class="panel adm-card">
          <h2>Топ-10 по стоимости КС</h2>
          <div class="adm-table-wrap" style="border:0">
            <table class="adm-table">
              <thead><tr><th class="num">#</th><th>Игрок</th><th class="num">Предметов</th><th class="num">Стоимость</th></tr></thead>
              <tbody>${top}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  },
};
