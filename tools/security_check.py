#!/usr/bin/env python3
"""Проверка безопасности сервера: какие файлы отдаются, заголовки, проверка сохранений,
хранение токенов и паролей, лимиты входа.

Запуск (тестовый сервер с отдельной базой):
    CB_DB=/tmp/work/t.db python3 tools/security_check.py http://127.0.0.1:8100

CB_DB нужен для проверок базы (токены, обновление хеша). Без него они пропускаются.
Нужен администратор MrRobbot (как в api_check.py).
Последний шаг проверяет лимит попыток входа: после него сервер нужно перезапустить,
иначе этот адрес на несколько минут получит 429 на вход.
"""
import hashlib
import hashlib
import json
import os
import secrets
import sqlite3
import sys
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
DB = os.environ.get("CB_DB")
results = []


def check(name, cond, extra=""):
    results.append(bool(cond))
    print(("OK   " if cond else "FAIL ") + name + ("" if cond or not extra else "   " + str(extra)))


def raw_get(path):
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE + path), timeout=10) as r:
            return r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()


def call(method, path, body=None, token=None, raw=None):
    data = raw if raw is not None else (json.dumps(body).encode("utf-8") if body is not None else None)
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            txt = r.read()
            return r.status, (json.loads(txt) if txt else None)
    except urllib.error.HTTPError as e:
        txt = e.read()
        try:
            return e.code, (json.loads(txt) if txt else None)
        except ValueError:
            return e.code, txt


def db_query(sql, args=()):
    conn = sqlite3.connect(DB, timeout=10)
    try:
        return conn.execute(sql, args).fetchall()
    finally:
        conn.close()


def db_exec(sql, args=()):
    conn = sqlite3.connect(DB, timeout=10)
    try:
        conn.execute(sql, args)
        conn.commit()
    finally:
        conn.close()


# ----- 1. какие файлы отдаются -----
print("== статика: закрыто")
for p in ["/server.py", "/tools/admin_check.py", "/tools/api_check.py", "/tools/security_check.py",
          "/README.md", "/docs/CODE_MAP.md", "/css/", "/js/",
          "/%2e%2e/server.py", "/css/%2e%2e/%2e%2e/server.py", "/js/../server.py",
          "/../data/accounts.db", "/css/admin/../../server.py", "/server.py%00.css"]:
    status, _, _ = raw_get(p)
    check(f"закрыто {p}", status == 404, status)

print("== статика: открыто")
for p in ["/", "/index.html", "/admin.html", "/css/admin/admin.css", "/js/auth.js"]:
    status, _, _ = raw_get(p)
    check(f"открыто {p}", status == 200, status)

# ----- 2. заголовки -----
print("== заголовки")
_, headers, _ = raw_get("/index.html")
check("X-Content-Type-Options: nosniff", headers.get("X-Content-Type-Options") == "nosniff")
check("Referrer-Policy задан", headers.get("Referrer-Policy") == "same-origin")

# ----- 3. вход и токены -----
print("== вход и токены")
nick = "sec" + secrets.token_hex(3)
s, d = call("POST", "/api/register", {"nick": nick, "password": "secret-1"})
check("регистрация", s == 201, (s, d))
token = d["token"]

s1, d1 = call("POST", "/api/login", {"nick": "nobody" + secrets.token_hex(3), "password": "xxxxxx"})
s2, d2 = call("POST", "/api/login", {"nick": nick, "password": "wrong-pass"})
check("неизвестный ник и неверный пароль дают одинаковый ответ", s1 == 401 and s2 == 401 and d1 == d2, (s1, s2))

s, _ = call("GET", "/api/admin/players")
check("админ-API без входа закрыт (401)", s == 401, s)

if DB:
    check("в базе нет открытого токена", not db_query("SELECT 1 FROM sessions WHERE token_hash = ?", (token,)))
    check("в базе лежит только хеш токена",
          db_query("SELECT 1 FROM sessions WHERE token_hash = ?", (hashlib.sha256(token.encode()).hexdigest(),)))
else:
    print("SKIP проверки базы: нет CB_DB")

# ----- 4. проверка сохранения -----
print("== проверка сохранения")
s, _ = call("PUT", "/api/save", token=token, raw=b'{"balance": NaN}')
check("NaN отклонён", s == 400, s)
s, _ = call("PUT", "/api/save", token=token, body={"balance": -5})
check("отрицательный баланс отклонён", s == 400, s)
s, _ = call("PUT", "/api/save", token=token, body={"balance": "1000000"})
check("баланс строкой отклонён", s == 400, s)
s, _ = call("PUT", "/api/save", token=token, body={"balance": 10, "inventory": "x"})
check("инвентарь не список отклонён", s == 400, s)
s, _ = call("PUT", "/api/save", token=token, body={"balance": 0, "inventory": [{}] * 5001})
check("больше 5000 предметов отклонено", s == 400, s)
s, _ = call("PUT", "/api/save", token=token, body={"balance": 10, "inventory": []})
check("нормальное сохранение принято", s == 200, s)

# ----- 5. обновление старого хеша пароля -----
if DB:
    print("== обновление старого хеша")
    legacy = "old" + secrets.token_hex(3)
    call("POST", "/api/register", {"nick": legacy, "password": "legacy-pw"})
    salt = db_query("SELECT pw_salt FROM users WHERE nick_lc = ?", (legacy.lower(),))[0][0]
    old_hash = hashlib.scrypt(b"legacy-pw", salt=salt, n=2 ** 14, r=8, p=1, dklen=32, maxmem=128 * 1024 * 1024)
    db_exec("UPDATE users SET pw_hash = ?, pw_n = 16384 WHERE nick_lc = ?", (old_hash, legacy.lower()))
    s, _ = call("POST", "/api/login", {"nick": legacy, "password": "legacy-pw"})
    check("старый пароль входит", s == 200, s)
    n = db_query("SELECT pw_n FROM users WHERE nick_lc = ?", (legacy.lower(),))[0][0]
    check("хеш обновлён до нового параметра", n == 32768, n)
    s, _ = call("POST", "/api/login", {"nick": legacy, "password": "legacy-pw"})
    check("после обновления вход работает", s == 200, s)

# ----- 6. лимит попыток входа (последний шаг) -----
print("== лимит попыток входа")
victim = "lim" + secrets.token_hex(3)
call("POST", "/api/register", {"nick": victim, "password": "victim-pw"})
codes = [call("POST", "/api/login", {"nick": victim, "password": "bad-pass"})[0] for _ in range(12)]
check("после серии неудач вход закрыт (429)", 429 in codes, codes)
print("Лимит сработал. Перезапустите сервер, чтобы снять блокировку на этом адресе.")

total, passed = len(results), sum(results)
print(f"ПРОЙДЕНО {passed} из {total}")
sys.exit(0 if passed == total else 1)
