"""Site Manager のアクセシビリティ検査（axe-core）。各画面を、役割ごとの見え方で検査する。

使い方（samples/web/site-manager/ で）：
  python tests/e2e/test_a11y.py          app/out を配信して検査（なければ test_demo.py と同じく build する）
- axe-core は、環境変数 AXE_JS、app/node_modules/axe-core、一時フォルダの順に探し、なければ npm で一時フォルダに入れる（app の package.json は変えない）
- 重大（critical）・深刻（serious）の違反が1つでもあれば、終了コード 1。軽め（moderate・minor）は一覧に出すだけ
- あわせて、キーボード（Tab）だけで、役割の切り替え→画面の中の操作に届くかも確かめる
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from playwright.sync_api import sync_playwright  # noqa: E402
from test_demo import APP, OUT, serve  # noqa: E402

USERS = {
    "owner": {"id": "E-01", "name": "山本 誠", "role": "owner"},
    "worker": {"id": "E-04", "name": "大川 健二", "role": "worker"},
    "customer": {"id": "X-03", "name": "田中 一郎", "role": "customer"},
    "partner": {"id": "X-01", "name": "青木 剛", "role": "partner"},
}
PAGES = [
    ("ログイン", None, "/"),
    ("今日", "owner", "/today/"),
    ("現場の一覧", "owner", "/sites/"),
    ("現場の詳細", "owner", "/sites/detail/?id=S-2610-03"),
    ("予定", "owner", "/schedule/"),
    ("ユーザー管理", "owner", "/users/"),
    ("お客さんページ", "customer", "/portal/"),
    ("協力業者ページ", "partner", "/portal/"),
    ("職人の今日", "worker", "/today/"),
]


def find_axe():
    cands = [os.environ.get("AXE_JS", ""), str(APP / "node_modules" / "axe-core" / "axe.min.js"),
             str(Path(tempfile.gettempdir()) / "axe" / "node_modules" / "axe-core" / "axe.min.js")]
    for c in cands:
        if c and Path(c).exists():
            return Path(c)
    d = Path(tempfile.gettempdir()) / "axe"
    d.mkdir(exist_ok=True)
    subprocess.run("npm init -y", cwd=d, shell=True, capture_output=True)
    subprocess.run("npm i axe-core", cwd=d, shell=True, capture_output=True)
    return d / "node_modules" / "axe-core" / "axe.min.js"


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    if not (OUT / "index.html").exists():
        subprocess.run("npm run build", cwd=APP, shell=True, check=True, capture_output=True)
    axe = find_axe().read_text(encoding="utf-8")
    srv, base = serve()
    rows, bad = [], 0
    with sync_playwright() as p:
        b = p.chromium.launch()
        for width, tag in [(1280, "PC"), (375, "スマホ")]:
            ctx = b.new_context(viewport={"width": width, "height": 900}, is_mobile=width < 500, has_touch=width < 500)
            for name, who, path in PAGES:
                pg = ctx.new_page()
                pg.add_init_script("localStorage.setItem('site-manager.user', JSON.stringify(%s))" % json.dumps(USERS[who], ensure_ascii=False)
                                   if who else "localStorage.removeItem('site-manager.user')")
                pg.goto(base + path, wait_until="domcontentloaded")
                pg.wait_for_selector("h1, h2, main, .login-list button", timeout=60000)
                pg.wait_for_timeout(4500)
                pg.evaluate(axe)
                res = pg.evaluate("axe.run(document, {runOnly:{type:'tag', values:['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']}}).then(r=>r.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,n:v.nodes.length,sample:v.nodes[0].target.join(' ')+' :: '+(v.nodes[0].failureSummary||'').split('\\n').slice(0,2).join(' ')})))")
                for v in res:
                    heavy = v["impact"] in ("critical", "serious")
                    bad += heavy
                    rows.append((tag, name, v["impact"], v["id"], v["help"], v["n"], v["sample"][:140]))
                    print(f"  {'NG' if heavy else '注意'}  [{tag}] {name}: {v['impact']} {v['id']} ×{v['n']}  {v['sample'][:110]}")
                if not res:
                    print(f"  OK  [{tag}] {name}")
                pg.close()
            ctx.close()
        # キーボードだけで操作できるか：ログイン→役割の切り替え→画面の中の操作
        ctx = b.new_context(viewport={"width": 1280, "height": 900})
        pg = ctx.new_page()
        pg.add_init_script("localStorage.setItem('site-manager.user', JSON.stringify(%s))" % json.dumps(USERS["owner"], ensure_ascii=False))
        pg.goto(base + "/sites/", wait_until="domcontentloaded")
        pg.wait_for_selector("table, .card, h1", timeout=60000)
        pg.wait_for_timeout(3500)
        seen = []
        for _ in range(40):
            pg.keyboard.press("Tab")
            seen.append(pg.evaluate("(()=>{const e=document.activeElement;return e?(e.tagName+':'+((e.getAttribute('aria-label')||e.innerText||e.value||'').slice(0,16))):''})()"))
            if any("役割" in x for x in seen) and any(x.startswith("SELECT") and "すべて" in x for x in seen[-12:]):
                pass
        reach_role = any("役割を切り替える" in x or x.startswith("SELECT") for x in seen)
        reach_content = any(x.startswith("INPUT") or "条件" in x or x.startswith("A:S-") for x in seen)
        focus_visible = pg.evaluate("(()=>{const s=document.createElement('button');document.body.appendChild(s);s.focus();const o=getComputedStyle(s).outlineStyle;s.remove();return o})()")
        print(f"  {'OK' if reach_role else 'NG'}  キーボードで役割の切り替えに届く")
        print(f"  {'OK' if reach_content else 'NG'}  キーボードで画面の中（検索・リンク）に届く")
        print(f"  focus の枠：{focus_visible}")
        if not (reach_role and reach_content):
            bad += 1
        b.close()
    srv.shutdown()
    (Path(tempfile.gettempdir()) / "site-manager-a11y.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n重大・深刻の違反：{bad} 件／軽めの違反：{len(rows) - bad} 件")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
