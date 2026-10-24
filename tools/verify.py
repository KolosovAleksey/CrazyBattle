"""Проверка рефакторинга: 17 экранов -> снимки PNG + хэш вычисленных стилей каждого элемента.

Запуск:  python3 verify.py <url> <outdir>
Сравнение двух прогонов: python3 verify.py --diff <dirA> <dirB>

Детерминизм: фиксированный Math.random, фиксированное Date.now, без rAF/интервалов,
таймеры длиннее 2 с отключены (лента дропов), CSS-анимации заморожены.
"""
import os, sys, json


def login(ctx, url):
    """Игра открывается только после входа: регистрируем временный аккаунт в этом контексте."""
    import random, string
    base = url.rsplit("/", 1)[0]
    nick = "v" + "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    r = ctx.request.post(base + "/api/register", data={"nick": nick, "password": "verify-pass-1"})
    token = r.json()["token"]
    # токен входа в localStorage каждой страницы контекста (как после обычного входа)
    ctx.add_init_script(f"try {{ localStorage.setItem('cb_token', '{token}'); }} catch (e) {{}}")

INIT = """
(() => {
  let s = 12345;
  Math.random = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  window.requestAnimationFrame = () => 0;
  window.setInterval = () => 0;
  const _st = window.setTimeout; window.setTimeout = (fn, ms, ...a) => (ms >= 2000 ? 0 : _st(fn, ms, ...a));
  const T0 = 1760000000000; Date.now = () => T0;
})();
"""
FREEZE = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}"

# снимок вычисленных стилей: для каждого элемента — FNV-1a хэш всех свойств computed style
STYLE_HASH = """() => {
  const h = (str) => { let x = 0x811c9dc5; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; } return x.toString(16); };
  const out = [];
  const els = [document.documentElement, ...document.querySelectorAll('body, body *')];
  for (const el of els) {
    const cs = getComputedStyle(el);
    const names = []; for (let i = 0; i < cs.length; i++) names.push(cs[i]);
    names.sort();  // порядок перечисления кастомных свойств не фиксирован
    let str = '';
    for (const p of names) str += p + ':' + cs.getPropertyValue(p).replace(/https?:\\/\\/[^\\/"')]+/g, 'ORIGIN') + ';'; 
    out.push(h(str));
  }
  return out;
}"""

SETUP = """() => {
  Game.balance = 500000;
  Game.addToInventory({...ITEMS['skin_0'], id:'skin_0', uid:'t1', price:500, wear:'FT', variant:null}, true);
  Game.addToInventory({...ITEMS['skin_1'], id:'skin_1', uid:'t2', price:900, wear:'MW', variant:null}, true);
  Game.addToInventory({...ITEMS['skin_2'], id:'skin_2', uid:'t3', price:1200, wear:'FN', variant:null}, true);
  Game.csInventory.push({...ITEMS['skin_3'], id:'skin_3', uid:'c1', price:300, wear:'FT', variant:null});
  return true;
}"""

STEPS = [
    ("01_home", "location.hash='home'"),
    ("02_case", "Game.openCaseView(Object.keys(CASES)[1])"),
    ("03_upgrade", "location.hash='upgrade'; Game.upToggleItem(0); Game.upSetTarget(Object.keys(ITEMS)[3])"),
    ("04_contracts", "location.hash='contracts'; Game.ctToggleItem(0)"),
    ("05_battle", "location.hash='battle'"),
    ("06_battle_skin", "location.hash='battle'; Game.battleSetMode('skin')"),
    ("07_operation", "location.hash='operation'"),
    ("08_profile", "location.hash='profile'"),
    ("09_cs", "location.hash='cs'"),
    ("10_stats_modal", "location.hash='profile'; UI.showStatsModal(Game)"),
    ("11_ach_modal", "location.hash='profile'; UI.showAchModal(Game)"),
    ("12_deposit_modal", "location.hash='home'; UI.showDepositModal()"),
    ("13_settings_modal", "location.hash='profile'; UI.showSettingsModal(Game)"),
    ("14_upgrade_settings", "location.hash='upgrade'; UI.showUpSettings()"),
    ("15_ach_toast", "location.hash='home'; UI.showAchToast({id:1,name:'Тест',desc:'Описание',icon:'M4 4h16v16H4z',r:'rare'})"),
]


def run(url, out):
    from playwright.sync_api import sync_playwright
    os.makedirs(out, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 900})
        ctx.add_init_script(INIT)
        login(ctx, url)
        pg = ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)[:200]))
        pg.goto(url, wait_until="load")
        pg.wait_for_selector("#auth-gate", state="hidden", timeout=10000)
        pg.wait_for_timeout(1200)
        pg.evaluate(SETUP)
        hashes = {}
        for name, code in STEPS:
            pg.evaluate("() => { " + code + "; return true; }")
            pg.add_style_tag(content=FREEZE)
            pg.wait_for_timeout(350)
            pg.screenshot(path=f"{out}/{name}.png")
            hashes[name] = pg.evaluate(STYLE_HASH)
            pg.evaluate("() => { try { UI.closeModal(); } catch(e) {} }")
            pg.wait_for_timeout(120)
        b.close()
    with open(f"{out}/styles.json", "w") as f:
        json.dump(hashes, f)
    print("shots:", len(STEPS), "pageerrors:", errors)


def diff(a, b):
    from PIL import Image, ImageChops
    ha = json.load(open(f"{a}/styles.json")); hb = json.load(open(f"{b}/styles.json"))
    ok = True
    for name, _ in STEPS:
        xa, xb = ha[name], hb[name]
        style_bad = 0 if xa == xb else sum(1 for i, (u, v) in enumerate(zip(xa, xb)) if u != v) + abs(len(xa) - len(xb))
        ia = Image.open(f"{a}/{name}.png").convert("RGB"); ib = Image.open(f"{b}/{name}.png").convert("RGB")
        d = ImageChops.difference(ia, ib).convert("L").point(lambda v: 255 if v > 16 else 0)
        px = sum(d.histogram()[255:]) if d.getbbox() else 0
        status = "OK" if style_bad == 0 and px == 0 else "DIFF"
        if status != "OK":
            ok = False
        print(f"{name:22s} elements {len(xa):5d}  style-diff {style_bad:5d}  pixel-diff {px:6d}  {status}")
    print("RESULT:", "IDENTICAL" if ok else "DIFFERENT")
    return ok


if __name__ == "__main__":
    if sys.argv[1] == "--diff":
        sys.exit(0 if diff(sys.argv[2], sys.argv[3]) else 1)
    run(sys.argv[1], sys.argv[2])
