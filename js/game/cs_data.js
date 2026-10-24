// js/game/cs_data.js — Справочники КС (категории оружия, слоты снаряжения, боты для рейтинга) и хелперы снаряжения.

const CS_RIFLES = ["AK-47", "M4A4", "M4A1-S", "AUG", "SG 553", "FAMAS", "Galil AR", "AWP", "SSG 08", "SCAR-20", "G3SG1"];

const CS_PISTOLS = ["Glock-18", "USP-S", "P2000", "P250", "Five-SeveN", "Tec-9", "CZ75-Auto", "Dual Berettas", "Desert Eagle", "R8 Revolver"];

// 15 слотов снаряжения, сгруппированы как в закупке
const CS_SLOTS = [
  { key: "p0", label: "Стартовый пистолет", cat: "pistol", group: "Пистолеты" },
  { key: "p1", label: "Пистолет 2", cat: "pistol", group: "Пистолеты" },
  { key: "p2", label: "Пистолет 3", cat: "pistol", group: "Пистолеты" },
  { key: "p3", label: "Пистолет 4", cat: "pistol", group: "Пистолеты" },
  { key: "p4", label: "Пистолет 5", cat: "pistol", group: "Пистолеты" },
  { key: "m0", label: "Промежуточное 1", cat: "mid", group: "Промежуточное" },
  { key: "m1", label: "Промежуточное 2", cat: "mid", group: "Промежуточное" },
  { key: "m2", label: "Промежуточное 3", cat: "mid", group: "Промежуточное" },
  { key: "m3", label: "Промежуточное 4", cat: "mid", group: "Промежуточное" },
  { key: "m4", label: "Промежуточное 5", cat: "mid", group: "Промежуточное" },
  { key: "r0", label: "Винтовка 1", cat: "rifle", group: "Винтовки" },
  { key: "r1", label: "Винтовка 2", cat: "rifle", group: "Винтовки" },
  { key: "r2", label: "Винтовка 3", cat: "rifle", group: "Винтовки" },
  { key: "r3", label: "Винтовка 4", cat: "rifle", group: "Винтовки" },
  { key: "r4", label: "Винтовка 5", cat: "rifle", group: "Винтовки" },
  { key: "knife", label: "Нож", cat: "knife", group: "Нож и перчатки" },
  { key: "gloves", label: "Перчатки", cat: "gloves", group: "Нож и перчатки" },
];

// категория предмета: knife / gloves / pistol / rifle / mid (остальное оружие: SMG, дробовики, пулемёты)
function csCategory(item) {
  // предметы каталога (наклейки и т.д.) не оружие: в снаряжение не попадают
  if (item.shop || (ITEMS[item.id] && ITEMS[item.id].shop)) return "other";
  const base = (item.name || "").replace(/^(StatTrak™ |Souvenir )/, "");
  if (base.startsWith("★")) return /Gloves|Wraps/.test(base) ? "gloves" : "knife";
  const weapon = base.split(" | ")[0];
  if (CS_PISTOLS.includes(weapon)) return "pistol";
  return CS_RIFLES.includes(weapon) ? "rifle" : "mid";
}

// старые ключи слотов (pistol / primary) -> новые
function csMigrateLoadout(lo) {
  const out = { ct: {}, t: {} };
  ["ct", "t"].forEach(side => {
    const n = { ...((lo && lo[side]) || {}) };
    if (n.pistol && !n.p0) n.p0 = n.pistol;
    if (n.primary && !n.r0) n.r0 = n.primary;
    delete n.pistol;
    delete n.primary;
    out[side] = n;
  });
  return out;
}

// ранг редкости для сортировки: ножи и перчатки — сверху
function csRank(item) {
  return { knife: 7, covert: 6, legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 }[item.rarity] || 0;
}

