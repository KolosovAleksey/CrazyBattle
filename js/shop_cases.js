// Имедж-кейсы: кейсы из новых предметов (shop_items.js), по той же схеме, что и скиновые кейсы.
// Шанс предмета = цена^(−α). α подбирается бисекцией так, чтобы ожидание выигрыша кейса было ≈ 90% его цены.
// Лимита по количеству нет: категория «Имедж-кейсы» (см. CASE_CATEGORIES в data.js).
const LIMITED_CAT = "Имедж-кейсы";

// price — цена кейса, pool — какие предметы попадают в кейс
const SHOP_CASE_DEFS = [
  { slug: "img_stk_cheap", name: "Наклейки — дешёвые", price: 400, color: "#7ed9a6",
    pool: i => i.cat === "sticker" && i.price <= 1000 },
  { slug: "img_stk_mid", name: "Наклейки — средние", price: 800, color: "#4b9bff",
    pool: i => i.cat === "sticker" && i.price >= 300 && i.price <= 3000 },
  { slug: "img_stk_top", name: "Наклейки — дорогие", price: 10000, color: "#e8a33d",
    pool: i => i.cat === "sticker" && i.price > 3000 },
  { slug: "img_graffiti", name: "Графити", price: 300, color: "#d32ce6",
    pool: i => i.cat === "graffiti" },
  { slug: "img_agents", name: "Агенты", price: 1000, color: "#4b69ff",
    pool: i => i.cat === "agent" },
  { slug: "img_charms", name: "Брелки", price: 250, color: "#8847ff",
    pool: i => i.cat === "charm" },
  { slug: "img_patches", name: "Патчи", price: 300, color: "#eb4b4b",
    pool: i => i.cat === "patch" },
  { slug: "img_music", name: "Музыкальные наборы", price: 300, color: "#e4ae39",
    pool: i => i.cat === "music" },
  { slug: "img_souvenir", name: "Сувенирные наборы", price: 2000, color: "#5e98d9",
    pool: i => i.cat === "souvenir" },
  { slug: "img_crates", name: "Кейсы", price: 500, color: "#e8a33d",
    pool: i => i.cat === "case" },
];

// ожидание выигрыша при весах p^(−a); убывает с ростом a (a может быть < 0, если средняя цена пула ниже цены кейса)
function limitedEV(pool, a) {
  let sw = 0, swp = 0;
  for (const it of pool) {
    const w = Math.pow(it.price, -a);
    sw += w;
    swp += w * it.price;
  }
  return swp / sw;
}

function solveLimitedAlpha(pool, target) {
  let lo = -30, hi = 30;
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (limitedEV(pool, mid) > target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

SHOP_CASE_DEFS.forEach(def => {
  const pool = SHOP_ITEMS.filter(def.pool);
  const alpha = solveLimitedAlpha(pool, def.price * 0.9);
  const id = `case_${def.slug}`;
  CASES[id] = {
    id,
    name: def.name,
    cat: LIMITED_CAT,
    price: def.price,
    count: pool.length,
    isNew: true,
    color: def.color,
    img: `img/cases/${def.slug}`,
    front: true,
    limited: true,
    drops: pool.map(it => ({ itemId: it.id, chance: Math.pow(it.price, -alpha) })),
  };
});
