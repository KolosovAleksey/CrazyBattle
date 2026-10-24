// ======================
// ДАННЫЕ ИГРЫ
// Картинки: img/items/<id>.webp (скины), img/shop/... (магазин), img/cases/<slug>_back.webp и _front.webp
// ======================

// Предметы регистрируются из skins.js (SKIN_ITEMS) и shop_items.js (SHOP_ITEMS) через Object.assign / forEach
const ITEMS = {};

// Редкости — цвета как в CS2 (Ширпотреб → Экстра)
const RARITY_META = {
  common:    { label: "Ширпотреб",     color: "#b0c3d9" },
  uncommon:  { label: "Промышленное",  color: "#5e98d9" },
  rare:      { label: "Армейское",     color: "#4b69ff" },
  epic:      { label: "Запрещённое",   color: "#8847ff" },
  legendary: { label: "Засекреченное", color: "#d32ce6" },
  covert:    { label: "Тайное",        color: "#eb4b4b" },
  knife:     { label: "★ Экстра",      color: "#e4ae39" },
};

// Вес выпадения по редкости (чем реже — тем меньше вес)

// Вес износа при выпадении скина (FN, MW, FT, WW, BS)
const WEAR_WEIGHT = { FN: 3, MW: 24, FT: 33, WW: 24, BS: 16 };
const WEAR_NAME = { FN: "Factory New", MW: "Minimal Wear", FT: "Field-Tested", WW: "Well-Worn", BS: "Battle-Scarred" };

// Вес варианта при выпадении из кейса: обычный / StatTrak™ / Souvenir.
// Выбирается среди вариантов, которые есть у конкретного скина.
const VARIANT_WEIGHT = { n: 85, st: 10, sv: 5 };

// Название варианта: "StatTrak™ AK-47 | Redline", "Souvenir AWP | ...", у ножей после "★ "
function variantName(name, v) {
  if (!v) return name;
  const pre = v === "st" ? "StatTrak™ " : "Souvenir ";
  return name.startsWith("★ ") ? "★ " + pre + name.slice(2) : pre + name;
}

// Все варианты скина (обычный / StatTrak / Souvenir), каждый с износом и своей ценой
function variantList(item) {
  if (!item.wears) return [{ v: null, n: null, p: item.price }];
  const out = [];
  item.wears.forEach(w => out.push({ v: null, n: w.n, p: w.p }));
  (item.st || []).forEach(w => out.push({ v: "st", n: w.n, p: w.p }));
  (item.sv || []).forEach(w => out.push({ v: "sv", n: w.n, p: w.p }));
  return out;
}

// Детерминированный генератор (используется для ленты живых дропов)
function seededRandom(seedStr) {
  let h = 2166136261;
  for (const ch of seedStr) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Кейсы: список из js/cases_cb.js (импорт case-battle.moe, 147 кейсов).
// drops: [[skin_id, шанс]], шансы уже посчитаны: вес редкости делится поровну между предметами этой редкости в кейсе.
const CASE_LIST = CB_CASES;

// Порядок категорий на главной
const CASE_CATEGORIES = ["Серийные кейсы", "Эпические кейсы", "Фирменные кейсы", "Цветные кейсы", "Кейсы по званию", "Оружейные кейсы", "Ножевые кейсы", "Имедж-кейсы", "Ограниченная серия", "Valve CS2 и Операции"];

// перенос кейсов из импортированных категорий по slug (остальные — как в импорте)
const CASE_MOVE = {
  "Эпические кейсы": ["emerald", "ruby", "sapphire", "diamond", "icase", "grand-slam", "black-diamond", "rockefeller", "dschinghiz-khan", "bitcoin"],
  "Цветные кейсы": ["camouflage", "green", "yellowskin", "whiteskin", "blue", "purple", "blackskin", "red"],
  "Кейсы по званию": ["silverelitee", "starss", "kalashi", "bigstar", "globalelite"],
  "Оружейные кейсы": ["ak-47", "stattrak", "awp", "stattrak-elite", "glock", "deserteagle", "usp", "m4a4", "m4a1-s"],
  "Ножевые кейсы": ["gloves", "gloves-boom"],
};
function caseCategory(c) {
  if (c.cat === "Операции" || c.cat === "Valve CS2") return "Valve CS2 и Операции";
  for (const cat in CASE_MOVE) if (CASE_MOVE[cat].includes(c.slug)) return cat;
  return c.cat;
}

const CASES = {};
CASE_LIST.forEach(c => {
  const id = `case_${c.slug}`;
  CASES[id] = {
    id,
    name: c.name,
    cat: caseCategory(c),
    price: c.price,
    count: c.count,
    isNew: c.isNew,
    color: c.color,
    img: `img/cases/${c.slug}`,
    front: !!c.hasFront,
    drops: c.drops.map(([itemId, chance]) => ({ itemId, chance })),
  };
});

// Апгрейд
const UPGRADE = {
  EDGE: 0.05,       // преимущество сайта 5%
  MAX_ITEMS: 6,     // слотов в ставке
  MIN_CHANCE: 2,    // минимальный шанс, %
  MAX_CHANCE: 75,   // максимальный шанс, %
  BAND: 2,          // допуск шанса вокруг номинала множителя или процента, ± п.п.
  GOLD_CHANCE: 30,  // шанс появления золотой зоны на обычном прокруте, %
  GOLD_LAND: 5,     // при золотой зоне и выигрыше: шанс, что стрелка упадёт в золотую полосу, %
  GOLD_DEG: 18,     // золотая зона на колесе: 5% окружности (18°), внизу, внутри зелёной зоны
  GOLD_MULT: 2,     // золото удваивает приз и запускает цепочку
};

// Контракты
const CONTRACT = {
  MIN_ITEMS: 3,
  PER_PAGE: 15,      // предметов на странице в контракте
  MAX_ITEMS: 10,
  RANGE_MIN: 0.3,   // результат от 30% суммы (500 ₽ → 150 ₽)
  RANGE_MAX: 4.0,   // до 400% суммы (500 ₽ → 2000 ₽)
};

// Имена для ленты живых дропов
const FEED_NAMES = [
  "Ghost_RU", "Nikita_K", "zeroWolf", "Max_Pro", "Ilya2003", "kaTyA",
  "VovaSniper", "Dark_Ace", "Artur_77", "NightFox", "Denis_Kr", "Egor_Ban",
];

// картинка предмета: у предметов каталога свой путь (img), у скинов — img/items/<id>.webp
function itemImg(it) {
  // у записей csInventory картинки может не быть: берём из ITEMS по id
  const img = it.img || (ITEMS[it.id] && ITEMS[it.id].img);
  return img || `img/items/${it.id}.webp`;
}
