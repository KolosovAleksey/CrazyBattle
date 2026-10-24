import os
import json, sys, time, urllib.request, urllib.error
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8100"
SHOTS = os.environ.get("SHOTS_DIR", "/tmp/cb_admin_shots")

os.makedirs(SHOTS, exist_ok=True)
results = []


def api(method, path, body=None, token=None, headers=None):
    h = {}
    if body is not None:
        h["Content-Type"] = "application/json"
    if token:
        h["Authorization"] = "Bearer " + token
    h.update(headers or {})
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, None


def check(name, cond, extra=""):
    results.append((name, bool(cond)))
    print(("OK   " if cond else "FAIL ") + name + ((" :: " + str(extra)) if (extra and not cond) else ""))


nick = "Shopper%d" % (int(time.time()) % 100000)
s, d = api("POST", "/api/register", {"nick": nick, "password": "pass123"})
ptok = d["token"]
s, d = api("PUT", "/api/save", {"balance": 250, "inventory": [], "csInventory": [], "stats": {"casesOpened": 3},
                                "profileName": nick, "operation": None}, token=ptok, headers={"X-Save-Version": "0"})
pid_resp = api("POST", "/api/login", {"nick": "MrRobbot", "password": "MrRobbot"})
atok = pid_resp[1]["token"]
s, lst = api("GET", "/api/admin/players?q=" + nick, token=atok)
pid = lst["rows"][0]["id"]

errors = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1366, "height": 860})
    page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    page.on("console", lambda m: errors.append("console: " + m.text) if (m.type == "error" and "status of 401" not in m.text) else None)

    # 1. вход
    page.goto(BASE + "/admin.html")
    page.wait_for_selector("#adm-login-form", state="visible")
    check("login form shown", page.is_visible("#adm-login-form"))
    page.fill("#adm-login-form input[name=nick]", "MrRobbot")
    page.fill("#adm-login-form input[name=password]", "wrong")
    page.click("#adm-login-submit")
    page.wait_for_function("document.getElementById('adm-login-error').textContent.length > 0")
    check("wrong password error", "Неверный" in page.inner_text("#adm-login-error"), page.inner_text("#adm-login-error"))
    page.fill("#adm-login-form input[name=password]", "MrRobbot")
    page.click("#adm-login-submit")
    page.wait_for_selector("#adm-app", state="visible")
    page.wait_for_selector(".adm-stat")
    check("admin app opened", page.is_visible("#adm-app"))
    page.screenshot(path=SHOTS + "/01_overview.png", full_page=False)
    cards = page.inner_text("#adm-view")
    check("overview has cards", "игроков" in cards.lower() and "регистрации за 14 дней" in cards.lower())

    # 2. список игроков
    page.click("a[data-tab=players]")
    page.wait_for_selector("#pl-table table")
    check("players list shows player", nick in page.inner_text("#pl-table"))
    page.fill("#pl-q", nick)
    page.wait_for_timeout(700)
    rows = page.locator("#pl-table tbody tr[data-id]").count()
    check("search narrows list", rows == 1, rows)
    page.screenshot(path=SHOTS + "/02_players.png")
    check("MrRobbot hidden from list", page.locator("#pl-table", has_text="MrRobbot").count() == 0)

    # 3. карточка: баланс
    page.goto(BASE + "/admin.html#player/%d/balance" % pid)
    page.wait_for_selector("#ed-body .adm-card")
    check("editor balance tab", "Баланс" in page.inner_text("#ed-body"))
    page.click("button[data-act=bal-delta][data-value='1000']")
    page.wait_for_function("document.querySelector('#ed-body') && document.querySelector('#ed-body').innerText.includes('1\\u00a0250')")
    s, d = api("GET", "/api/admin/players/%d" % pid, token=atok)
    check("balance +1000 saved", d["save"]["balance"] == 1250, d["save"]["balance"])
    check("save version bumped", d["version"] >= 2, d["version"])

    # 4. инвентарь: выдать предмет
    page.goto(BASE + "/admin.html#player/%d/inventory" % pid)
    page.wait_for_selector("#ed-search")
    page.fill("#ed-search", "AWP")
    page.wait_for_selector(".adm-pick button")
    page.locator(".adm-pick button").first.click()
    page.wait_for_selector("button[data-act=item-add]")
    page.screenshot(path=SHOTS + "/03_inventory_pick.png", full_page=True)
    page.click("button[data-act=item-add]")
    page.wait_for_function("document.querySelector('#ed-body') && document.querySelector('#ed-body').innerText.includes('Всего: 1 шт')", timeout=8000)
    s, d = api("GET", "/api/admin/players/%d" % pid, token=atok)
    check("item added to inventory", len(d["save"]["inventory"]) == 1, d["save"]["inventory"])
    item_uid = d["save"]["inventory"][0]["uid"] if d["save"]["inventory"] else None
    check("inventory price positive", d["save"]["inventory"][0]["price"] > 0 if d["save"]["inventory"] else False)

    # 5. КС-инвентарь: выдать
    page.goto(BASE + "/admin.html#player/%d/cs" % pid)
    page.wait_for_selector("#ed-search")
    page.fill("#ed-search", "Glock")
    page.wait_for_selector(".adm-pick button")
    page.locator(".adm-pick button").first.click()
    page.wait_for_selector("button[data-act=item-add]")
    page.click("button[data-act=item-add]")
    page.wait_for_function("document.querySelector('#ed-body') && document.querySelector('#ed-body').innerText.includes('Всего: 1 шт')", timeout=8000)
    s, d = api("GET", "/api/admin/players/%d" % pid, token=atok)
    check("item added to CS", len(d["save"]["csInventory"]) == 1)
    s, lst = api("GET", "/api/admin/players?q=" + nick, token=atok)
    check("cs_value counted", lst["rows"][0]["cs_value"] > 0, lst["rows"][0])

    # 6. статистика
    page.goto(BASE + "/admin.html#player/%d/stats" % pid)
    page.wait_for_selector("[data-stat=casesOpened]")
    page.fill("[data-stat=casesOpened]", "42")
    page.click("button[data-act=stat-save]")
    page.wait_for_function("document.querySelector('[data-stat=casesOpened]') && document.querySelector('[data-stat=casesOpened]').value === '42'", timeout=8000)
    s, d = api("GET", "/api/admin/players/%d" % pid, token=atok)
    check("stat casesOpened saved", d["save"]["stats"]["casesOpened"] == 42, d["save"]["stats"].get("casesOpened"))

    # 7. достижения
    page.goto(BASE + "/admin.html#player/%d/achievements" % pid)
    page.wait_for_selector("button[data-act=ach-one][data-on='1']")
    page.locator("button[data-act=ach-one][data-on='1']").first.click()
    page.wait_for_function("document.querySelectorAll('button[data-act=ach-one][data-on=\"0\"]').length >= 1", timeout=8000)
    s, d = api("GET", "/api/admin/players/%d" % pid, token=atok)
    check("achievement granted", len(d["save"]["stats"].get("achAt", {})) == 1, d["save"]["stats"].get("achAt"))
    page.screenshot(path=SHOTS + "/04_achievements.png")

    # 8. операция: уровень 7
    page.goto(BASE + "/admin.html#player/%d/operation" % pid)
    page.wait_for_selector("#op-level")
    page.fill("#op-level", "7")
    page.click("button[data-act=op-set]")
    page.wait_for_function("document.getElementById('ed-body').innerText.includes('7 из 100')", timeout=8000)
    s, d = api("GET", "/api/admin/players/%d" % pid, token=atok)
    check("operation level 7", sum(1 for x in d["save"]["operation"]["c"] if x) == 7, d["save"].get("operation", {}).get("c", [])[:10])
    page.screenshot(path=SHOTS + "/05_operation.png")

    # 9. общее: ник профиля и подкрут
    page.goto(BASE + "/admin.html#player/%d/general" % pid)
    page.wait_for_selector("#ed-rig")
    page.check("#ed-rig")
    page.fill("#ed-rigmult", "3")
    page.click("button[data-act=gen-save]")
    page.wait_for_timeout(900)
    s, d = api("GET", "/api/admin/players/%d" % pid, token=atok)
    check("rig saved", d["save"]["rigged"] is True and d["save"]["rigMult"] == 3, (d["save"].get("rigged"), d["save"].get("rigMult")))
    page.screenshot(path=SHOTS + "/06_general.png")

    # 10. JSON
    page.goto(BASE + "/admin.html#player/%d/json" % pid)
    page.wait_for_selector("#ed-json")
    txt = page.input_value("#ed-json")
    check("json shows save", '"balance": 1250' in txt)

    # 11. конфликт версий: игрок сохраняет со старой версией
    s, d0 = api("GET", "/api/admin/players/%d" % pid, token=atok)
    stale = d0["version"]
    api("PUT", "/api/admin/players/%d/save" % pid, {"save": dict(d0["save"], balance=5000), "note": "x"}, token=atok,
        headers={"X-Save-Version": str(stale)})
    s, d = api("PUT", "/api/save", {"balance": 1}, token=ptok, headers={"X-Save-Version": str(stale)})
    check("stale player save gets 409", s == 409, (s, d))
    # админ с устаревшей версией получает 409 и не перезаписывает
    s, d = api("PUT", "/api/admin/players/%d/save" % pid, {"save": dict(d0["save"], balance=7), "note": "x"}, token=atok,
               headers={"X-Save-Version": str(stale)})
    check("stale admin save gets 409", s == 409, (s, d))

    # 12. блокировка через UI
    page.goto(BASE + "/admin.html#player/%d/general" % pid)
    page.wait_for_selector("button[data-act=acc-block]")
    page.click("button[data-act=acc-block]")
    page.wait_for_selector("#adm-modal:not(.hidden)")
    page.click("#adm-modal-box [data-ok]")
    page.wait_for_function("document.getElementById('adm-view').innerText.toLowerCase().includes('разблокировать')", timeout=8000)
    s, d = api("GET", "/api/me", token=ptok)
    check("player blocked (403)", s == 403, (s, d))

    # 13. журнал
    page.goto(BASE + "/admin.html#log")
    page.wait_for_selector("#lg-table table")
    log_text = page.inner_text("#lg-table").lower()   # CSS uppercase: сравниваем в нижнем регистре
    check("log has save edit", "правка сохранения" in log_text)
    check("log has block", "блокировка" in log_text)
    page.screenshot(path=SHOTS + "/07_log.png", full_page=True)

    # 14. удаление с подтверждением ником
    page.goto(BASE + "/admin.html#player/%d/general" % pid)
    page.wait_for_selector("button[data-act=acc-delete]")
    page.click("button[data-act=acc-delete]")
    page.wait_for_selector("#adm-modal:not(.hidden)")
    page.fill("#adm-modal-box input", "wrong")
    page.click("#adm-modal-box [data-ok]")
    check("delete needs nick", "Для подтверждения" in page.inner_text("#adm-modal-box"))
    page.fill("#adm-modal-box input", nick)
    page.click("#adm-modal-box [data-ok]")
    page.wait_for_function("location.hash.startsWith('#players')", timeout=8000)
    s, d = api("GET", "/api/admin/players/%d" % pid, token=atok)
    check("player deleted", s == 404, (s, d))

    # 15. выход ведёт на обычное окно входа сайта (index.html, #auth-gate)
    page.click("#adm-logout")
    page.wait_for_url("**/index.html", timeout=8000)
    page.wait_for_selector("#auth-gate", state="visible", timeout=8000)
    check("logout -> index.html #auth-gate", page.is_visible("#auth-gate") and page.url.endswith("index.html"), page.url)

    # 15b. админ, войдя через обычное окно сайта, сразу попадает на admin.html; игра не открывается
    page.fill("#auth-form input[name=nick]", "MrRobbot")
    page.fill("#auth-form input[name=password]", "MrRobbot")
    page.click("#auth-submit")
    page.wait_for_url("**/admin.html", timeout=8000)
    page.wait_for_selector("#adm-app", state="visible", timeout=8000)
    check("admin login via index -> admin.html", page.url.endswith("admin.html") and page.is_visible("#adm-app"), page.url)
    check("admin nick in #adm-who", page.inner_text("#adm-who").strip() == "MrRobbot", page.inner_text("#adm-who"))

    # 15c. открыть index.html с токеном админа — редирект на admin.html
    page.goto(BASE + "/index.html")
    page.wait_for_url("**/admin.html", timeout=8000)
    check("admin with token on index -> admin.html", page.url.endswith("admin.html"), page.url)

    # 15d. вернуться в админку и выйти снова (проверка повторного выхода)
    page.click("#adm-logout")
    page.wait_for_url("**/index.html", timeout=8000)
    page.wait_for_selector("#auth-gate", state="visible", timeout=8000)
    check("second logout -> index.html #auth-gate", page.is_visible("#auth-gate"))

    # 16. не-админ не входит (на странице админки)
    page.goto(BASE + "/admin.html")
    page.wait_for_selector("#adm-login-form", state="visible", timeout=8000)
    nick2 = nick + "b"
    api("POST", "/api/register", {"nick": nick2, "password": "pass123"})
    page.fill("#adm-login-form input[name=nick]", nick2)
    page.fill("#adm-login-form input[name=password]", "pass123")
    page.click("#adm-login-submit")
    page.wait_for_function("document.getElementById('adm-login-error').textContent.length > 0", timeout=8000)
    check("player denied in admin", "не имеет доступа" in page.inner_text("#adm-login-error") or "Нет" in page.inner_text("#adm-login-error"), page.inner_text("#adm-login-error"))

    browser.close()

print("ошибки консоли:", errors[:10])
check("no JS errors", not errors, errors[:5])
ok = sum(1 for _, c in results if c)
print("ПРОЙДЕНО %d из %d" % (ok, len(results)))
sys.exit(0 if ok == len(results) else 1)
