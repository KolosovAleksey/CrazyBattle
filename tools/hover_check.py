"""Проверка состояний :hover: наводим курсор на интерактивные элементы в двух адресах
и сравниваем вычисленные стили элемента.
Запуск: python3 hover_check.py <urlA> <urlB> [folds.json skip_out.json]
С folds.json: для расхождений находит неон-правила (из списка слияний), которые совпадают с
наведённым элементом и задают то же семейство свойств, и пишет их индексы в skip_out.json."""
import os, sys, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from verify import INIT, FREEZE, SETUP, login
from playwright.sync_api import sync_playwright

SEL = "button, a, .case-card, .nav-tab, .btn, .mult-btn, .panel, .cx-slot, .up-slot, .ach-tile, .pf-ach-tile"
SCREENS = [("home", "location.hash='home'"), ("upgrade", "location.hash='upgrade'"),
           ("battle", "location.hash='battle'"), ("cs", "location.hash='cs'"),
           ("operation", "location.hash='operation'"), ("profile", "location.hash='profile'")]
ONE = """(i) => { const el = [...document.querySelectorAll('%s')][i]; if (!el) return null;
  const cs = getComputedStyle(el); const names = []; for (let k = 0; k < cs.length; k++) names.push(cs[k]); names.sort();
  let str = ''; for (const p of names) str += p + ':' + cs.getPropertyValue(p).replace(/https?:\\/\\/[^\\/"')]+/g, 'ORIGIN') + ';';
  let x = 0x811c9dc5; for (let k = 0; k < str.length; k++) { x ^= str.charCodeAt(k); x = Math.imul(x, 0x01000193) >>> 0; }
  return x.toString(16) + ' ' + (el.className && el.className.baseVal === undefined ? el.className : el.tagName); }""" % SEL
COUNT = "() => document.querySelectorAll('%s').length" % SEL
VIS = "(i) => { const el=[...document.querySelectorAll('%s')][i]; if(!el) return false; const r=el.getBoundingClientRect(); return r.width>0&&r.height>0; }" % SEL
PROPS = """(i) => { const el = [...document.querySelectorAll('%s')][i]; const cs = getComputedStyle(el);
  const o = {}; for (let k = 0; k < cs.length; k++) o[cs[k]] = cs.getPropertyValue(cs[k]); return {tag: el.tagName + '.' + (typeof el.className === 'string' ? el.className : ''), all: o}; }""" % SEL
MATCH = """(args) => { const [i, sels] = args; const el = [...document.querySelectorAll('%s')][i];
  return sels.map(s => { try { return el.matches(s); } catch (e) { return false; } }); }""" % SEL

def family(p): return re.sub(r'^-\w+-', '', p).split('-')[0]

if __name__ == "__main__":
    urlA, urlB = sys.argv[1], sys.argv[2]
    folds = json.load(open(sys.argv[3])) if len(sys.argv) > 4 else None
    outPath = sys.argv[4] if len(sys.argv) > 4 else None
    skip = set(); events = 0
    with sync_playwright() as p:
        b = p.chromium.launch()
        ca = b.new_context(viewport={"width": 1280, "height": 900}); ca.add_init_script(INIT)
        cb = b.new_context(viewport={"width": 1280, "height": 900}); cb.add_init_script(INIT)
        login(ca, urlA); login(cb, urlB)
        A = ca.new_page(); B = cb.new_page()
        for pg, u in ((A, urlA), (B, urlB)):
            pg.goto(u, wait_until="load"); pg.wait_for_selector("#auth-gate", state="hidden", timeout=10000)
            pg.wait_for_timeout(1200); pg.evaluate(SETUP)
        total = bad = 0
        for name, code in SCREENS:
            for pg in (A, B):
                pg.evaluate("() => { " + code + "; return true; }"); pg.add_style_tag(content=FREEZE)
            A.wait_for_timeout(300); B.wait_for_timeout(300)
            n = min(A.evaluate(COUNT), B.evaluate(COUNT), 40)
            sb = 0
            for i in range(n):
                if not A.evaluate(VIS, i): continue
                for pg in (A, B):
                    pg.locator(SEL).nth(i).hover(timeout=3000); pg.wait_for_timeout(60)
                ha = A.evaluate(ONE, i); hb = B.evaluate(ONE, i)
                total += 1
                if ha != hb:
                    bad += 1; sb += 1
                    if folds:
                        pa = A.evaluate(PROPS, i); pb = B.evaluate(PROPS, i)
                        diffp = [k for k, v in pa['all'].items() if v != pb['all'].get(k)]
                        fams = {family(k) for k in diffp}
                        allsels = [s for f in folds for s in f['sels']]
                        m = B.evaluate(MATCH, [i, allsels]); k = 0
                        for f in folds:
                            hit = False
                            for s in f['sels']:
                                if m[k] and any(family(pp) in fams for pp in f['props'].split()): hit = True
                                k += 1
                            if hit:
                                skip.add(f['idx']); events += 1
                                print(f"  culprit: {name}[{i}] {pb['tag'][:30]} <- {f['sel'][:60]}", flush=True)
                    else:
                        print(f"  {name} [{i}] {ha} != {hb}", flush=True)
                A.mouse.move(0, 0); B.mouse.move(0, 0)
            print(f"{name}: checked {n}, mismatches {sb}", flush=True)
        print("TOTAL hovered", total, "mismatches", bad, flush=True)
        b.close()
    if outPath:
        json.dump(sorted(skip), open(outPath, 'w'))
        print("events:", events, flush=True)
