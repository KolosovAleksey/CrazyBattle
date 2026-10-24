import json, sys, urllib.request, urllib.error

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8100"
results = []


def call(method, path, body=None, token=None, headers=None):
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
    print(("OK   " if cond else "FAIL ") + name + (("  " + str(extra)) if (extra and not cond) else ""))


# игрок
s, d = call("POST", "/api/register", {"nick": "Tester1", "password": "secret1"})
check("register player", s == 201 and d and d["role"] == "player", (s, d))
ptok = d["token"]
s, d = call("POST", "/api/register", {"nick": "tester1", "password": "secret1"})
check("duplicate nick rejected", s == 409, (s, d))
s, d = call("GET", "/api/save", token=ptok)
check("save empty for new", s == 200 and d["save"] is None and d["version"] == 0, (s, d))
s, d = call("PUT", "/api/save", {"balance": 500, "inventory": [], "csInventory": [{"id": "x", "price": 100}]},
            token=ptok, headers={"X-Save-Version": "0"})
check("player save ok", s == 200 and d["version"] == 1, (s, d))
s, d = call("PUT", "/api/save", {"balance": 1}, token=ptok, headers={"X-Save-Version": "0"})
check("stale save 409", s == 409, (s, d))

# админ (создаётся CLI, здесь вставляем через сервер нельзя — тест использует готовый токен)
s, d = call("POST", "/api/login", {"nick": "MrRobbot", "password": "MrRobbot"})
atok = d["token"] if s == 200 and d else None
check("admin login returns role admin", s == 200 and d.get("role") == "admin", (s, d))
if atok:
    s, d = call("GET", "/api/me", token=atok)
    check("admin me role", s == 200 and d["role"] == "admin", (s, d))
    s, d = call("GET", "/api/leaderboard")
    nicks = [r["nick"].lower() for r in d["rows"]]
    check("admin not in leaderboard", "mrrobbot" not in nicks, nicks)
    check("player in leaderboard", "tester1" in nicks, nicks)
    s, d = call("GET", "/api/admin/players?q=tester", token=atok)
    check("admin list finds player", s == 200 and d["total"] == 1, (s, d))
    pid = d["rows"][0]["id"]
    s, d = call("GET", "/api/admin/players?q=mrrobbot", token=atok)
    check("admin hidden from player list", s == 200 and d["total"] == 0, (s, d))
    s, d = call("GET", "/api/admin/players/%d" % pid, token=atok)
    check("player detail", s == 200 and d["save"]["balance"] == 500, (s, d))
    v = d["version"]
    s, d = call("PUT", "/api/admin/players/%d/save" % pid,
                {"save": dict(d["save"], balance=1500), "note": "тест"}, token=atok,
                headers={"X-Save-Version": str(v)})
    check("admin edit balance", s == 200 and d["version"] == v + 1, (s, d))
    s, d = call("PUT", "/api/save", {"balance": 999}, token=ptok, headers={"X-Save-Version": "1"})
    check("player stale after admin edit -> 409", s == 409, (s, d))
    s, d = call("GET", "/api/save", token=ptok)
    check("player sees admin balance", s == 200 and d["save"]["balance"] == 1500, (s, d))
    s, d = call("PATCH", "/api/admin/players/%d" % pid, {"blocked": True}, token=atok)
    check("block player", s == 200 and d["player"]["blocked"] is True, (s, d))
    s, d = call("GET", "/api/me", token=ptok)
    check("blocked player 403", s == 403, (s, d))
    s, d = call("POST", "/api/login", {"nick": "Tester1", "password": "secret1"})
    check("blocked login 403", s == 403, (s, d))
    s, d = call("PATCH", "/api/admin/players/%d" % pid, {"blocked": False}, token=atok)
    s, d = call("PATCH", "/api/admin/players/%d" % pid, {"password": "newpass1"}, token=atok)
    check("password reset", s == 200, (s, d))
    s, d = call("POST", "/api/login", {"nick": "Tester1", "password": "secret1"})
    check("old password rejected", s == 401, (s, d))
    s, d = call("POST", "/api/login", {"nick": "Tester1", "password": "newpass1"})
    check("new password works", s == 200, (s, d))
    s, d = call("GET", "/api/admin/log", token=atok)
    actions = [r["action"] for r in d["rows"]]
    check("log has entries", "save.edit" in actions and "block" in actions and "password.reset" in actions, actions)
    s, d = call("GET", "/api/admin/stats", token=atok)
    check("stats", s == 200 and d["players"] >= 1, (s, d))
    # игрок не имеет доступа к админке
    s, d = call("GET", "/api/admin/players", token=ptok)
    check("player forbidden admin api", s in (401, 403), (s, d))
    # админ не виден по id
    s, d = call("GET", "/api/admin/players/1", token=atok)
    check("admin account hidden by id", s == 404 or (s == 200 and d["player"]["nick"] != "MrRobbot"), (s, d))
    s, d = call("DELETE", "/api/admin/players/%d" % pid, token=atok)
    check("delete player", s == 204, (s, d))
    s, d = call("GET", "/api/admin/players/%d" % pid, token=atok)
    check("deleted gone", s == 404, (s, d))

ok = sum(1 for _, c in results if c)
print("ПРОЙДЕНО %d из %d" % (ok, len(results)))
sys.exit(0 if ok == len(results) else 1)
