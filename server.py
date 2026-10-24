#!/usr/bin/env python3
"""CrazyBattle: статические файлы, аккаунты, сохранения, рейтинг и API админ-панели.

Только стандартная библиотека Python 3.9+, без зависимостей.

Запуск (порт 8000; переменные CB_PORT или PORT задают другой):
    python3 server.py
Создать или назначить администратора:
    python3 server.py create-admin <ник> <пароль>
База данных (по умолчанию ../data/accounts.db, вне папки проекта):
    CB_DB=/путь/accounts.db python3 server.py

Вход: токен сессии. Клиент присылает его в заголовке "Authorization: Bearer <токен>"
или в заголовке "X-CB-Token". Cookie не используются: во встроенном окне на другом
домене браузер их не сохраняет.

API игрока:
  POST /api/register            {nick, password}        -> 201 {nick, role, token}
  POST /api/login               {nick, password}        -> 200 {nick, role, token}
  POST /api/logout                                      -> 204
  GET  /api/me                                          -> 200 {nick, role}
  GET  /api/save                                        -> 200 {save, version}
  PUT  /api/save      заголовок X-Save-Version          -> 200 {version} | 409 (сохранение изменено админом)
  GET  /api/leaderboard                                 -> 200 {rows: [{nick, count, value}], me}

API администратора (только роль admin; игроки с ролью admin в списках не появляются):
  GET    /api/admin/stats
  GET    /api/admin/players?q=&status=&sort=&dir=&page=&per=
  GET    /api/admin/players/<id>                        -> {player, save, version}
  PUT    /api/admin/players/<id>/save   {save, note}    заголовок X-Save-Version
  PATCH  /api/admin/players/<id>        {nick?, password?, blocked?}
  DELETE /api/admin/players/<id>
  GET    /api/admin/log?player=&action=&page=&per=
"""
import hashlib
import hmac
import http.server
import json
import os
import re
import secrets
import sqlite3
import sys
import threading
import time
from urllib.parse import unquote, urlsplit, parse_qs

ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("CB_DB") or os.path.join(ROOT, "..", "data", "accounts.db")
PORT = int(os.environ.get("CB_PORT") or os.environ.get("PORT") or "8000")

SESSION_TTL = 30 * 24 * 3600          # сессия живёт 30 дней без визитов
SESSION_RENEW = 24 * 3600             # срок продлевается при визите, если токену больше суток
MAX_BODY = 2 * 1024 * 1024            # ограничение размера тела запроса (сохранение игры)
MAX_ITEMS = 5000                      # предметов в инвентаре / КС-инвентаре (защита от мусора)
NICK_RE = re.compile(r"^[0-9A-Za-zА-Яа-яЁё_\-]{3,16}$")
LOGIN_WINDOW = 300                    # окно подсчёта неудачных входов, сек
LOGIN_LIMIT = 10                      # неудачных входов с одного адреса за окно
NICK_WINDOW = 900                     # окно подсчёта неудачных входов в один аккаунт, сек
NICK_LIMIT = 20                       # неудачных входов в один ник за окно (против подбора пароля)
REG_WINDOW = 3600                     # окно подсчёта регистраций с одного адреса, сек
REG_LIMIT = 50                        # регистраций с одного адреса за окно
NEW_SCRYPT_N = 2 ** 15                # стоимость хеша пароля для новых паролей (старые обновляются при входе)
SCRYPT_MAXMEM = 128 * 1024 * 1024
PUBLIC_FILES = ("/", "/index.html", "/admin.html")
PUBLIC_DIRS = ("/css/", "/js/", "/img/", "/sounds/")   # только эти папки отдаются статикой
BLOCKED_MSG = "Аккаунт заблокирован администратором"
NO_ACCESS = "Нет доступа"
LIMIT_MSG = "Слишком много попыток. Подождите несколько минут"

SORTS = {"nick": "nick_lc", "balance": "balance", "cs_value": "cs_value", "cs_count": "cs_count",
         "inv_count": "inv_count", "created": "created", "last_seen": "last_seen"}

_db_lock = threading.Lock()
_limit_lock = threading.Lock()
_hits = {}                            # ключ (например, ("login-ip", адрес)) -> [время событий]
DUMMY_SALT = secrets.token_bytes(16)  # для входа в несуществующий ник: тратим то же время, что и на проверку

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    nick TEXT NOT NULL,
    nick_lc TEXT NOT NULL UNIQUE,
    pw_salt BLOB NOT NULL,
    pw_hash BLOB NOT NULL,
    pw_n INTEGER NOT NULL DEFAULT 16384,
    created INTEGER NOT NULL,
    last_seen INTEGER,
    save TEXT,
    save_version INTEGER NOT NULL DEFAULT 0,
    balance INTEGER NOT NULL DEFAULT 0,
    inv_count INTEGER NOT NULL DEFAULT 0,
    cs_count INTEGER NOT NULL DEFAULT 0,
    cs_value INTEGER NOT NULL DEFAULT 0,
    role TEXT NOT NULL DEFAULT 'player',
    blocked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_log (
    id INTEGER PRIMARY KEY,
    ts INTEGER NOT NULL,
    actor_nick TEXT,
    target_id INTEGER,
    target_nick TEXT,
    action TEXT NOT NULL,
    details TEXT
);
"""

# колонки, добавленные после первых версий базы
MIGRATED_COLUMNS = {
    "last_seen": "INTEGER",
    "save_version": "INTEGER NOT NULL DEFAULT 0",
    "balance": "INTEGER NOT NULL DEFAULT 0",
    "inv_count": "INTEGER NOT NULL DEFAULT 0",
    "role": "TEXT NOT NULL DEFAULT 'player'",
    "blocked": "INTEGER NOT NULL DEFAULT 0",
    "pw_n": "INTEGER NOT NULL DEFAULT 16384",   # параметр scrypt; у старых аккаунтов 16384
}


def db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    with _db_lock:
        conn = db()
        try:
            conn.executescript(SCHEMA)
            cols = {r["name"] for r in conn.execute("PRAGMA table_info(users)")}
            for col, decl in MIGRATED_COLUMNS.items():
                if col not in cols:
                    conn.execute(f"ALTER TABLE users ADD COLUMN {col} {decl}")
            conn.commit()
        finally:
            conn.close()


# ----- пароли, токены, проверки -----
def hash_password(password, salt, n=NEW_SCRYPT_N):
    return hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=8, p=1, dklen=32, maxmem=SCRYPT_MAXMEM)


def token_hash(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def check_nick(nick):
    if not NICK_RE.match(nick):
        return "Ник: от 3 до 16 символов — буквы, цифры, _ и -"
    return None


def check_password(password):
    if not 6 <= len(password) <= 72:
        return "Пароль: от 6 до 72 символов"
    return None


def to_int(v):
    try:
        return int(v or 0)
    except (TypeError, ValueError):
        return 0


def check_save(save):
    """Проверка формы сохранения: не даём записать мусор, который сломает списки и рейтинг."""
    for key in ("inventory", "csInventory"):
        if key in save and not isinstance(save[key], list):
            return "Неверный формат сохранения"
        if len(save.get(key) or []) > MAX_ITEMS:
            return "Слишком много предметов"
    bal = save.get("balance", 0)
    if isinstance(bal, bool) or not isinstance(bal, (int, float)) or bal < 0:
        return "Неверный формат сохранения"
    return None


def reject_constant(name):
    raise ValueError("недопустимое число: " + name)   # NaN и Infinity в JSON не принимаем


def save_numbers(save):
    """Денормализованные поля для списков и рейтинга: баланс, инвентарь, КС-инвентарь."""
    inv = save.get("inventory") or []
    cs = save.get("csInventory") or []
    if not isinstance(inv, list):
        inv = []
    if not isinstance(cs, list):
        cs = []
    value = sum(to_int((it or {}).get("price")) for it in cs)
    return {"balance": to_int(save.get("balance")), "inv_count": len(inv),
            "cs_count": len(cs), "cs_value": value}


def diff_summary(old, new):
    """Какие верхнеуровневые разделы сохранения изменились (без самих значений)."""
    old = old or {}
    changed = sorted(k for k in set(old) | set(new) if old.get(k) != new.get(k))
    info = {"changed": changed}
    if "balance" in changed:
        info["balance"] = [to_int(old.get("balance")), to_int(new.get("balance"))]
    return info


def hit_count(key, window):
    """Сколько событий по ключу было за последние window секунд."""
    now = time.time()
    with _limit_lock:
        recent = [t for t in _hits.get(key, []) if now - t < window]
        if recent:
            _hits[key] = recent
        else:
            _hits.pop(key, None)
        return len(recent)


def add_hit(key):
    with _limit_lock:
        _hits.setdefault(key, []).append(time.time())


def esc_like(s):
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


# ----- работа с базой -----
def log_action(conn, actor, target, action, details=None):
    conn.execute(
        "INSERT INTO admin_log (ts, actor_nick, target_id, target_nick, action, details) VALUES (?, ?, ?, ?, ?, ?)",
        (int(time.time()), actor["nick"] if actor else None, target["id"] if target else None,
         target["nick"] if target else None, action,
         json.dumps(details, ensure_ascii=False) if details is not None else None))


def revoke_sessions(conn, user_id):
    conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))


def new_session(conn, user_id):
    conn.execute("DELETE FROM sessions WHERE created < ?", (int(time.time()) - SESSION_TTL,))  # истёкшие не копятся
    token = secrets.token_urlsafe(32)
    conn.execute("INSERT INTO sessions (token_hash, user_id, created) VALUES (?, ?, ?)",
                 (token_hash(token), user_id, int(time.time())))
    return token


def leaderboard_rows(conn, limit):
    return conn.execute(
        "SELECT nick, cs_count, cs_value FROM users WHERE role = 'player' AND blocked = 0 "
        "AND save IS NOT NULL ORDER BY cs_value DESC, cs_count DESC, id ASC LIMIT ?", (limit,)).fetchall()


class Handler(http.server.SimpleHTTPRequestHandler):
    server_version = "CrazyBattle"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        super().end_headers()

    def log_message(self, *args):
        pass

    # ----- маршрутизация -----
    @staticmethod
    def is_public_path(path):
        """Статика отдаётся только из разрешённых папок. Всё остальное (server.py, tools/, docs/,
        README, данные, папки-списки) — 404."""
        p = unquote(path)
        if "\x00" in p or "\\" in p or ".." in p.split("/"):
            return False
        if p in PUBLIC_FILES:
            return True
        return p.startswith(PUBLIC_DIRS) and not p.endswith("/") and not p.lower().endswith(".py")

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path.startswith("/api/"):
            return self.dispatch("GET", url.path, parse_qs(url.query))
        if not self.is_public_path(url.path):
            return self.send_error(404)
        return super().do_GET()

    def do_HEAD(self):
        if not self.is_public_path(urlsplit(self.path).path):
            return self.send_error(404)
        return super().do_HEAD()

    def do_POST(self):
        url = urlsplit(self.path)
        return self.dispatch("POST", url.path, parse_qs(url.query))

    def do_PUT(self):
        url = urlsplit(self.path)
        return self.dispatch("PUT", url.path, parse_qs(url.query))

    def do_PATCH(self):
        url = urlsplit(self.path)
        return self.dispatch("PATCH", url.path, parse_qs(url.query))

    def do_DELETE(self):
        url = urlsplit(self.path)
        return self.dispatch("DELETE", url.path, parse_qs(url.query))

    def dispatch(self, method, path, qs):
        if not path.startswith("/api/"):
            return self.send_error(404)
        try:
            raw = self.read_raw()
            if raw is None:
                return self.send_json(413, {"error": "Слишком большой запрос"})
            with _db_lock:
                conn = db()
                try:
                    self.route(conn, method, path, qs, raw)
                    conn.commit()
                finally:
                    conn.close()
        except Exception as e:  # защита от падения сервера на неожиданных данных
            print("API error:", method, path, repr(e), file=sys.stderr)
            self.send_json(500, {"error": "Внутренняя ошибка сервера"})

    def route(self, conn, method, path, qs, raw):
        body_ok = lambda: self.parse_body(raw)

        if method == "GET":
            if path == "/api/me":
                return self.get_me(conn)
            if path == "/api/save":
                return self.get_save(conn)
            if path == "/api/leaderboard":
                return self.get_leaderboard(conn)
            if path == "/api/admin/stats":
                return self.admin_stats(conn)
            if path == "/api/admin/players":
                return self.admin_players(conn, qs)
            if path == "/api/admin/log":
                return self.admin_log(conn, qs)
            m = re.match(r"^/api/admin/players/(\d+)$", path)
            if m:
                return self.admin_player_get(conn, int(m.group(1)))

        elif method == "POST":
            if path == "/api/register":
                return self.register(conn, body_ok())
            if path == "/api/login":
                return self.login(conn, body_ok())
            if path == "/api/logout":
                return self.logout(conn)

        elif method == "PUT":
            if path == "/api/save":
                return self.put_save(conn, raw)
            m = re.match(r"^/api/admin/players/(\d+)/save$", path)
            if m:
                return self.admin_put_save(conn, int(m.group(1)), body_ok())

        elif method == "PATCH":
            m = re.match(r"^/api/admin/players/(\d+)$", path)
            if m:
                return self.admin_patch_player(conn, int(m.group(1)), body_ok())

        elif method == "DELETE":
            m = re.match(r"^/api/admin/players/(\d+)$", path)
            if m:
                return self.admin_delete_player(conn, int(m.group(1)))

        return self.send_json(404, {"error": "Не найдено"})

    # ----- служебное -----
    def read_raw(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length > MAX_BODY:
            return None
        return self.rfile.read(length) if length > 0 else b""

    @staticmethod
    def parse_body(raw):
        if not raw:
            return None
        try:
            return json.loads(raw.decode("utf-8"), parse_constant=reject_constant)
        except (ValueError, UnicodeDecodeError):
            return None

    def send_json(self, status, obj=None):
        body = b"" if obj is None else json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        if body:
            self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def session_token(self):
        # Два способа передать токен: Authorization: Bearer ... и X-CB-Token
        auth = self.headers.get("Authorization") or ""
        if auth.startswith("Bearer "):
            return auth[7:].strip() or None
        return (self.headers.get("X-CB-Token") or "").strip() or None

    def authenticate(self, conn):
        """Возвращает (пользователь, None) или (None, (статус, сообщение))."""
        token = self.session_token()
        if not token:
            return None, (401, "Нужен вход")
        row = conn.execute(
            "SELECT s.created AS session_created, u.* FROM sessions s JOIN users u ON u.id = s.user_id "
            "WHERE s.token_hash = ?", (token_hash(token),)).fetchone()
        now = time.time()
        if not row or now - row["session_created"] > SESSION_TTL:
            return None, (401, "Нужен вход")
        if row["blocked"]:
            return None, (403, BLOCKED_MSG)
        if now - row["session_created"] > SESSION_RENEW:
            conn.execute("UPDATE sessions SET created = ? WHERE token_hash = ?", (int(now), token_hash(token)))
        conn.execute("UPDATE users SET last_seen = ? WHERE id = ?", (int(now), row["id"]))
        return row, None

    def require_admin(self, conn):
        user, err = self.authenticate(conn)
        if err:
            return None, err
        if user["role"] != "admin":
            return None, (403, NO_ACCESS)
        return user, None

    def load_target(self, conn, user_id):
        """Игрок для админки. Учётки администраторов недоступны (404), чтобы их не было видно."""
        row = conn.execute("SELECT * FROM users WHERE id = ? AND role = 'player'", (user_id,)).fetchone()
        return row

    @staticmethod
    def public_player(row):
        return {"id": row["id"], "nick": row["nick"], "created": row["created"],
                "last_seen": row["last_seen"], "blocked": bool(row["blocked"]),
                "balance": row["balance"], "inv_count": row["inv_count"], "cs_count": row["cs_count"],
                "cs_value": row["cs_value"], "has_save": row["save"] is not None,
                "save_version": row["save_version"]}

    # ----- игрок -----
    def get_me(self, conn):
        user, err = self.authenticate(conn)
        if err:
            return self.send_json(err[0], {"error": err[1]})
        return self.send_json(200, {"nick": user["nick"], "role": user["role"]})

    def get_save(self, conn):
        user, err = self.authenticate(conn)
        if err:
            return self.send_json(err[0], {"error": err[1]})
        save = json.loads(user["save"]) if user["save"] else None
        return self.send_json(200, {"save": save, "version": user["save_version"]})

    def get_leaderboard(self, conn):
        user, _ = self.authenticate(conn)
        rows = leaderboard_rows(conn, 100)
        return self.send_json(200, {
            "rows": [{"nick": r["nick"], "count": r["cs_count"], "value": r["cs_value"]} for r in rows],
            "me": user["nick"] if user else None,
        })

    def put_save(self, conn, raw):
        user, err = self.authenticate(conn)
        if err:
            return self.send_json(err[0], {"error": err[1]})
        save = self.parse_body(raw)
        if not isinstance(save, dict) or check_save(save):
            return self.send_json(400, {"error": "Неверный формат сохранения"})
        expected = self.headers.get("X-Save-Version")
        if expected is not None and to_int(expected) != user["save_version"]:
            return self.send_json(409, {"error": "Сохранение изменено администратором",
                                        "version": user["save_version"]})
        nums = save_numbers(save)
        version = user["save_version"] + 1
        conn.execute(
            "UPDATE users SET save = ?, save_version = ?, balance = ?, inv_count = ?, cs_count = ?, cs_value = ? "
            "WHERE id = ?",
            (json.dumps(save, ensure_ascii=False), version, nums["balance"], nums["inv_count"],
             nums["cs_count"], nums["cs_value"], user["id"]))
        return self.send_json(200, {"version": version})

    def register(self, conn, data):
        reg_key = ("reg-ip", self.client_address[0])
        if hit_count(reg_key, REG_WINDOW) >= REG_LIMIT:
            return self.send_json(429, {"error": "Слишком много регистраций с этого адреса. Попробуйте позже"})
        add_hit(reg_key)
        if not isinstance(data, dict):
            return self.send_json(400, {"error": "Неверный запрос"})
        nick = str(data.get("nick") or "").strip()
        password = str(data.get("password") or "")
        err = check_nick(nick) or check_password(password)
        if err:
            return self.send_json(400, {"error": err})
        if conn.execute("SELECT 1 FROM users WHERE nick_lc = ?", (nick.lower(),)).fetchone():
            return self.send_json(409, {"error": "Этот ник уже занят"})
        salt = secrets.token_bytes(16)
        cur = conn.execute(
            "INSERT INTO users (nick, nick_lc, pw_salt, pw_hash, pw_n, created, last_seen) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (nick, nick.lower(), salt, hash_password(password, salt), NEW_SCRYPT_N,
             int(time.time()), int(time.time())))
        token = new_session(conn, cur.lastrowid)
        return self.send_json(201, {"nick": nick, "role": "player", "token": token})

    def login(self, conn, data):
        ip_key = ("login-ip", self.client_address[0])
        if hit_count(ip_key, LOGIN_WINDOW) >= LOGIN_LIMIT:
            return self.send_json(429, {"error": LIMIT_MSG})
        if not isinstance(data, dict):
            return self.send_json(400, {"error": "Неверный запрос"})
        nick = str(data.get("nick") or "").strip()
        password = str(data.get("password") or "")
        nick_key = ("login-nick", nick.lower())
        if nick and hit_count(nick_key, NICK_WINDOW) >= NICK_LIMIT:
            return self.send_json(429, {"error": LIMIT_MSG})
        row = conn.execute("SELECT * FROM users WHERE nick_lc = ?", (nick.lower(),)).fetchone()
        if row is None:
            hash_password(password, DUMMY_SALT)           # то же время, что при существующем нике
            ok = False
        else:
            ok = hmac.compare_digest(hash_password(password, row["pw_salt"], row["pw_n"]), row["pw_hash"])
        if not ok:
            add_hit(ip_key)
            if nick:
                add_hit(nick_key)
            return self.send_json(401, {"error": "Неверный ник или пароль"})
        if row["pw_n"] < NEW_SCRYPT_N:                    # пароль был захеширован слабее: обновляем на входе
            salt = secrets.token_bytes(16)
            conn.execute("UPDATE users SET pw_salt = ?, pw_hash = ?, pw_n = ? WHERE id = ?",
                         (salt, hash_password(password, salt), NEW_SCRYPT_N, row["id"]))
        if row["blocked"]:
            return self.send_json(403, {"error": BLOCKED_MSG})
        token = new_session(conn, row["id"])
        return self.send_json(200, {"nick": row["nick"], "role": row["role"], "token": token})

    def logout(self, conn):
        token = self.session_token()
        if token:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(token),))
        return self.send_json(204)

    # ----- админка: сводка, список, карточка -----
    def admin_stats(self, conn):
        admin, err = self.require_admin(conn)
        if err:
            return self.send_json(err[0], {"error": err[1]})
        now = int(time.time())
        p = "role = 'player'"
        totals = conn.execute(
            f"SELECT COUNT(*) AS n, SUM(save IS NOT NULL) AS with_save, SUM(blocked) AS blocked, "
            f"COALESCE(SUM(balance), 0) AS balance, COALESCE(SUM(cs_value), 0) AS cs_value, "
            f"SUM(last_seen >= ?) AS active_day FROM users WHERE {p}", (now - 86400,)).fetchone()
        since = now - 14 * 86400
        created = [r["created"] for r in conn.execute(
            f"SELECT created FROM users WHERE {p} AND created >= ?", (since,)).fetchall()]
        days = [time.strftime("%Y-%m-%d", time.localtime(now - i * 86400)) for i in range(13, -1, -1)]
        counts = {d: 0 for d in days}
        for ts in created:
            d = time.strftime("%Y-%m-%d", time.localtime(ts))
            if d in counts:
                counts[d] += 1
        top = leaderboard_rows(conn, 10)
        return self.send_json(200, {
            "players": totals["n"] or 0,
            "with_save": totals["with_save"] or 0,
            "blocked": totals["blocked"] or 0,
            "active_day": totals["active_day"] or 0,
            "balance": totals["balance"],
            "cs_value": totals["cs_value"],
            "registrations": [{"day": d, "count": counts[d]} for d in days],
            "top": [{"nick": r["nick"], "count": r["cs_count"], "value": r["cs_value"]} for r in top],
        })

    def admin_players(self, conn, qs):
        admin, err = self.require_admin(conn)
        if err:
            return self.send_json(err[0], {"error": err[1]})
        q = (qs.get("q", [""])[0] or "").strip().lower()
        status = qs.get("status", ["all"])[0]
        sort = SORTS.get(qs.get("sort", ["created"])[0], "created")
        direction = "ASC" if qs.get("dir", ["desc"])[0] == "asc" else "DESC"
        page = max(1, to_int(qs.get("page", ["1"])[0]))
        per = min(100, max(5, to_int(qs.get("per", ["25"])[0]) or 25))
        where = ["role = 'player'"]
        params = []
        if q:
            where.append("nick_lc LIKE ? ESCAPE '\\'")
            params.append("%" + esc_like(q) + "%")
        if status == "blocked":
            where.append("blocked = 1")
        elif status == "active":
            where.append("blocked = 0")
        w = " AND ".join(where)
        total = conn.execute(f"SELECT COUNT(*) FROM users WHERE {w}", params).fetchone()[0]
        rows = conn.execute(
            f"SELECT * FROM users WHERE {w} ORDER BY {sort} {direction}, id ASC LIMIT ? OFFSET ?",
            params + [per, (page - 1) * per]).fetchall()
        return self.send_json(200, {"total": total, "page": page, "per": per,
                                    "rows": [self.public_player(r) for r in rows]})

    def admin_player_get(self, conn, user_id):
        admin, err = self.require_admin(conn)
        if err:
            return self.send_json(err[0], {"error": err[1]})
        row = self.load_target(conn, user_id)
        if not row:
            return self.send_json(404, {"error": "Игрок не найден"})
        save = json.loads(row["save"]) if row["save"] else None
        return self.send_json(200, {"player": self.public_player(row), "save": save,
                                    "version": row["save_version"]})

    def admin_put_save(self, conn, user_id, data):
        admin, err = self.require_admin(conn)
        if err:
            return self.send_json(err[0], {"error": err[1]})
        row = self.load_target(conn, user_id)
        if not row:
            return self.send_json(404, {"error": "Игрок не найден"})
        if not isinstance(data, dict) or not isinstance(data.get("save"), dict) or check_save(data["save"]):
            return self.send_json(400, {"error": "Неверный формат сохранения"})
        expected = self.headers.get("X-Save-Version")
        if expected is not None and to_int(expected) != row["save_version"]:
            return self.send_json(409, {"error": "Данные игрока изменились. Обновите карточку.",
                                        "version": row["save_version"]})
        new_save = data["save"]
        old_save = json.loads(row["save"]) if row["save"] else {}
        nums = save_numbers(new_save)
        version = row["save_version"] + 1
        conn.execute(
            "UPDATE users SET save = ?, save_version = ?, balance = ?, inv_count = ?, cs_count = ?, cs_value = ? "
            "WHERE id = ?",
            (json.dumps(new_save, ensure_ascii=False), version, nums["balance"], nums["inv_count"],
             nums["cs_count"], nums["cs_value"], row["id"]))
        details = diff_summary(old_save, new_save)
        note = str(data.get("note") or "")[:300]
        if note:
            details["note"] = note
        log_action(conn, admin, row, "save.edit", details)
        return self.send_json(200, {"version": version})

    def admin_patch_player(self, conn, user_id, data):
        admin, err = self.require_admin(conn)
        if err:
            return self.send_json(err[0], {"error": err[1]})
        row = self.load_target(conn, user_id)
        if not row:
            return self.send_json(404, {"error": "Игрок не найден"})
        if not isinstance(data, dict):
            return self.send_json(400, {"error": "Неверный запрос"})
        if "nick" in data:
            nick = str(data["nick"] or "").strip()
            err_text = check_nick(nick)
            if err_text:
                return self.send_json(400, {"error": err_text})
            taken = conn.execute("SELECT 1 FROM users WHERE nick_lc = ? AND id <> ?",
                                 (nick.lower(), row["id"])).fetchone()
            if taken:
                return self.send_json(409, {"error": "Этот ник уже занят"})
            if nick != row["nick"]:
                log_action(conn, admin, row, "nick.change", {"from": row["nick"], "to": nick})
                conn.execute("UPDATE users SET nick = ?, nick_lc = ? WHERE id = ?",
                             (nick, nick.lower(), row["id"]))
                row = self.load_target(conn, user_id)
        if data.get("password"):
            password = str(data["password"])
            err_text = check_password(password)
            if err_text:
                return self.send_json(400, {"error": err_text})
            salt = secrets.token_bytes(16)
            conn.execute("UPDATE users SET pw_salt = ?, pw_hash = ?, pw_n = ? WHERE id = ?",
                         (salt, hash_password(password, salt), NEW_SCRYPT_N, row["id"]))
            revoke_sessions(conn, row["id"])          # старые входы больше не действуют
            log_action(conn, admin, row, "password.reset")
        if "blocked" in data:
            blocked = bool(data["blocked"])
            if blocked != bool(row["blocked"]):
                # сессии не удаляем: для заблокированного вход отвечает 403 с причиной,
                # а после разблокировки игрок снова входит без пароля
                conn.execute("UPDATE users SET blocked = ? WHERE id = ?", (int(blocked), row["id"]))
                log_action(conn, admin, row, "block" if blocked else "unblock")
        row = self.load_target(conn, user_id)
        return self.send_json(200, {"player": self.public_player(row)})

    def admin_delete_player(self, conn, user_id):
        admin, err = self.require_admin(conn)
        if err:
            return self.send_json(err[0], {"error": err[1]})
        row = self.load_target(conn, user_id)
        if not row:
            return self.send_json(404, {"error": "Игрок не найден"})
        log_action(conn, admin, row, "player.delete")
        revoke_sessions(conn, row["id"])
        conn.execute("DELETE FROM users WHERE id = ?", (row["id"],))
        return self.send_json(204)

    def admin_log(self, conn, qs):
        admin, err = self.require_admin(conn)
        if err:
            return self.send_json(err[0], {"error": err[1]})
        where, params = ["1 = 1"], []
        player = (qs.get("player", [""])[0] or "").strip().lower()
        if player:
            where.append("LOWER(target_nick) LIKE ? ESCAPE '\\'")
            params.append("%" + esc_like(player) + "%")
        action = qs.get("action", [""])[0]
        if action:
            where.append("action = ?")
            params.append(action)
        page = max(1, to_int(qs.get("page", ["1"])[0]))
        per = min(100, max(10, to_int(qs.get("per", ["50"])[0]) or 50))
        w = " AND ".join(where)
        total = conn.execute(f"SELECT COUNT(*) FROM admin_log WHERE {w}", params).fetchone()[0]
        rows = conn.execute(
            f"SELECT * FROM admin_log WHERE {w} ORDER BY id DESC LIMIT ? OFFSET ?",
            params + [per, (page - 1) * per]).fetchall()
        return self.send_json(200, {"total": total, "page": page, "per": per, "rows": [
            {"id": r["id"], "ts": r["ts"], "actor": r["actor_nick"], "target": r["target_nick"],
             "target_id": r["target_id"],
             "action": r["action"], "details": json.loads(r["details"]) if r["details"] else None}
            for r in rows]})


def create_admin(nick, password):
    err = check_nick(nick) or check_password(password)
    if err:
        print(err, file=sys.stderr)
        return 1
    init_db()
    salt = secrets.token_bytes(16)
    conn = db()
    try:
        row = conn.execute("SELECT id FROM users WHERE nick_lc = ?", (nick.lower(),)).fetchone()
        if row:
            conn.execute("UPDATE users SET nick = ?, role = 'admin', blocked = 0, pw_salt = ?, pw_hash = ?, pw_n = ? "
                         "WHERE id = ?",
                         (nick, salt, hash_password(password, salt), NEW_SCRYPT_N, row["id"]))
        else:
            now = int(time.time())
            conn.execute(
                "INSERT INTO users (nick, nick_lc, pw_salt, pw_hash, pw_n, created, last_seen, role) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, 'admin')",
                (nick, nick.lower(), salt, hash_password(password, salt), NEW_SCRYPT_N, now, now))
        conn.commit()
    finally:
        conn.close()
    print(f"Администратор «{nick}» готов. Войдите на /admin.html")
    return 0


def main():
    if len(sys.argv) >= 4 and sys.argv[1] == "create-admin":
        sys.exit(create_admin(sys.argv[2], sys.argv[3]))
    init_db()
    http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
