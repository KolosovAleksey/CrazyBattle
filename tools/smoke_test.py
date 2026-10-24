# Smoke-тест: открывает все экраны, открывает кейс, апгрейд, контракт и ищет ошибки JS и HTTP.
# Запуск: python3 tools/smoke_test.py http://localhost:8000/index.html
import sys, json, random, string
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000/index.html"
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None

report = {"errors": [], "http_errors": [], "console": [], "steps": {}}

def step(name, fn):
    try:
        report["steps"][name] = fn()
    except Exception as e:
        report["steps"][name] = "EXC: " + str(e)[:300]

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    pg.on("pageerror", lambda e: report["errors"].append(str(e)[:300]))
    pg.on("console", lambda m: report["console"].append(m.text[:200]) if m.type == "error" else None)
    pg.on("response", lambda r: report["http_errors"].append(f"{r.status} {r.url}") if r.status >= 400 else None)
    # Игра открывается только после входа: регистрируем временный аккаунт.
    # Токен входа кладём в localStorage страницы (как после обычного входа).
    BASE = URL.rsplit("/", 1)[0]
    nick = "smk" + "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    reg = pg.request.post(BASE + "/api/register", data={"nick": nick, "password": "smoke-test-1"})
    report["steps"]["register"] = reg.status
    token = reg.json()["token"]
    pg.context.add_init_script(f"try {{ localStorage.setItem('cb_token', '{token}'); }} catch (e) {{}}")
    pg.goto(URL, wait_until="load")
    pg.wait_for_selector("#auth-gate", state="hidden", timeout=10000)
    pg.wait_for_timeout(1500)

    for route in ["home", "upgrade", "contracts", "battle", "operation", "profile", "cs"]:
        def go(route=route):
            pg.evaluate(f"() => {{ location.hash = '{route}'; }}")
            pg.wait_for_timeout(400)
            return pg.evaluate("() => [...document.querySelectorAll('.view')].filter(v => getComputedStyle(v).display !== 'none').map(v => v.id)")
        step("route_" + route, go)
        if SHOTS:
            pg.screenshot(path=f"{SHOTS}/{route}.png")

    def rating():
        pg.evaluate("() => { location.hash = 'cs'; UI.csTab = 'rating'; UI.renderCs(Game); }")
        pg.wait_for_timeout(800)
        txt = pg.evaluate("() => document.getElementById('cs-rating-body') ? document.getElementById('cs-rating-body').innerText : null")
        return {"has_me": nick in (txt or ""), "has_bots": "Ilya2003" in (txt or ""), "text": (txt or "")[:120]}
    step("rating", rating)

    def case_open():
        pg.evaluate("() => { Game.balance = 500000; UI.updateBalance && UI.updateBalance(Game.balance); }")
        cid = pg.evaluate("() => Object.keys(CASES)[0]")
        pg.evaluate(f"() => {{ Game.openCaseView('{cid}'); }}")
        pg.wait_for_timeout(400)
        pg.evaluate("() => Game.openCase(1, true)")
        pg.wait_for_timeout(9000)
        return pg.evaluate("() => ({pending: Game.pendingDrop ? Game.pendingDrop.length : null, bal: Game.balance})")
    step("case_open", case_open)

    def sell():
        pg.evaluate("() => { location.hash = 'profile'; }")
        pg.wait_for_timeout(300)
        return pg.evaluate("() => { const n = Game.inventory.length; if (n) Game.sellItem(0); return {before: n, after: Game.inventory.length}; }")
    step("sell", sell)

    def upgrade():
        pg.evaluate("() => { location.hash = 'upgrade'; Game.balance = 100000; Game.addToInventory({...ITEMS['skin_0'], id:'skin_0', uid:'t1', price: 500, wear:'FT', variant:null}, true); }")
        pg.wait_for_timeout(300)
        return pg.evaluate("""() => {
          const out = {};
          try { Game.upToggleItem(0); out.toggled = true; } catch (e) { out.toggleErr = String(e); }
          try { Game.upSetMult('mult', 2); out.mult = true; } catch (e) { out.multErr = String(e); }
          try { Game.upSetTarget(Object.keys(ITEMS)[1]); out.target = true; } catch (e) { out.targetErr = String(e); }
          return out;
        }""")
    step("upgrade_setup", upgrade)

    def contract():
        pg.evaluate("() => { location.hash = 'contracts'; }")
        pg.wait_for_timeout(300)
        return pg.evaluate("() => { try { Game.ctToggleItem(0); return {ok: true, sum: Game.ctSum()}; } catch (e) { return String(e); } }")
    step("contract", contract)

    step("battle_mode", lambda: pg.evaluate("() => { try { Game.battleSetMode('skin'); return 'ok'; } catch (e) { return String(e); } }"))
    step("operation_banner", lambda: pg.evaluate("() => !!document.querySelector('.op-banner')"))
    step("nav_click_upgrade", lambda: (pg.click("button.nav-tab[data-route='upgrade']"), pg.wait_for_timeout(300), pg.evaluate("() => location.hash"))[2])
    step("nav_click_operation", lambda: (pg.click("button.nav-tab[data-route='operation']"), pg.wait_for_timeout(300), pg.evaluate("() => location.hash"))[2])
    step("nav_click_home", lambda: (pg.click("#logo-btn"), pg.wait_for_timeout(300), pg.evaluate("() => location.hash"))[2])
    step("case_cards_front", lambda: pg.evaluate("() => ({cards: document.querySelectorAll('.case-card').length, fronts: document.querySelectorAll('.case-card .img-front').length})"))

    if SHOTS:
        pg.screenshot(path=f"{SHOTS}/final.png")
    b.close()

print(json.dumps(report, ensure_ascii=False, indent=1))
