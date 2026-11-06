"""Site Manager の通しのテスト（E2E）。まっさらなブラウザ（Playwright・Chromium）で、静的出力 app/out を配信して確かめる。

使い方（samples/web/site-manager/ で）：
  python tests/e2e/test_demo.py            app/out を使う（なければ app/ で npm run build する）
  python tests/e2e/test_demo.py --build    先に npm run build する

確かめること：ログイン画面・各役割で入れる・職人は担当の現場だけで金額なし・社長は全件で金額あり・
お客さんは専用ページで社内の画面から戻される・外部に社内用ファイルが出ない・協力業者に金額が出ない・
「最初に戻す」・スマホ幅で横あふれなし・オフラインで開く。
"""
import http.server
import json
import re
import socketserver
import subprocess
import sys
import threading
from functools import partial
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "app"
OUT = APP / "out"
SEED = (ROOT / "db" / "seed.sql").read_text(encoding="utf-8")

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("  OK  " if ok else "  NG  ") + name + (f"  ← {detail}" if detail and not ok else ""))


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    handler = partial(Quiet, directory=str(OUT))
    srv = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


def seed_files():
    """seed.sql の files から、(名前, 現場, 公開範囲) を取り出す"""
    rows = re.findall(r"\('F-\d+', '([^']+)', '([^']+)', '[^']*', 'sample-files/[^']+', '(internal|customer|partner|both)'", SEED)
    return [(name, site, vis) for site, name, vis in rows]


def login_as(page, base, name_part):
    """ログイン画面で、名前に name_part を含む人のボタンを押して入る"""
    page.goto(base + "/", wait_until="domcontentloaded")
    page.wait_for_selector(".login-list button", timeout=60000)
    page.locator(".login-list button", has_text=name_part).first.click()
    page.wait_for_timeout(1500)


def body(page):
    page.wait_for_timeout(2500)
    return page.inner_text("body")


def switch_role(page, label_part):
    """画面上部の「役割」で別の人に切り替える"""
    sel = page.locator(".role-switcher select").first
    sel.wait_for(timeout=60000)
    page.wait_for_function("document.querySelector('.role-switcher select').options.length > 1", timeout=60000)
    value = page.evaluate(
        "(p) => { const o=[...document.querySelector('.role-switcher select').options].find(o=>o.text.includes(p)); return o && o.value }",
        label_part,
    )
    sel.select_option(value)
    page.wait_for_timeout(2000)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    if "--build" in sys.argv or not (OUT / "index.html").exists():
        print("npm run build …")
        r = subprocess.run("npm run build", cwd=APP, shell=True, capture_output=True, text=True, encoding="utf-8")
        if r.returncode != 0:
            print(r.stdout[-1500:], r.stderr[-800:])
            return 2
    srv, base = serve()
    files = seed_files()
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()

        print("ログイン")
        page.goto(base + "/", wait_until="domcontentloaded")
        page.wait_for_selector(".login-list button", timeout=60000)
        n = page.locator(".login-list button").count()
        check("ログイン画面に9人（社長1・社員2・職人2・お客さん2・協力業者2）が出る", n == 9, f"{n}人")
        check("社内・外部の2グループがある", page.locator(".login h2").count() == 2)

        print("職人（大川）")
        login_as(page, base, "大川")
        check("職人は入ると /today/ に着く", page.url.endswith("/today/"), page.url)
        page.goto(base + "/sites/")
        t = body(page)
        check("職人は担当の現場3件だけ見える", "3 件" in t, re.findall(r"\d+ 件", t)[:2])
        page.goto(base + "/sites/detail/?id=S-2610-03")
        t = body(page)
        check("職人は金額（契約金額・見積の数字）が見えない", "560,900" not in t and "900 円" not in t, "契約金額の数字が出ている")
        page.goto(base + "/sites/detail/?id=S-2611-06")
        t = body(page)
        check("職人は担当外の現場の詳細を開けない", "見つからない" in t or "見られません" in t)

        print("社長（山本）")
        page.goto(base + "/today/")
        switch_role(page, "山本")
        page.goto(base + "/sites/")
        t = body(page)
        check("社長は全20件が見える", "20 件" in t, re.findall(r"\d+ 件", t)[:2])
        page.goto(base + "/sites/detail/?id=S-2610-03")
        check("社長は契約金額 560,900 円が見える", "560,900" in body(page))
        page.get_by_role("tab", name="ファイル").click()
        page.wait_for_timeout(600)
        hrefs = page.locator("main a[target=_blank]").evaluate_all("els=>els.map(e=>e.getAttribute('href'))")
        check("社内の「ファイル」タブのリンクが、実在するファイルを指す", hrefs and all(h.startswith("/sample-files/") and not h.startswith("/sample-files/sample-files/") and page.request.get(base + h).status == 200 for h in hrefs), str(hrefs))
        page.goto(base + "/users/")
        check("社長はユーザー管理が開ける", "ユーザー管理" in body(page))

        print("最初に戻す")
        page.goto(base + "/users/")
        page.wait_for_timeout(2500)
        before = page.get_by_role("button", name="有効（無効にする）").count()
        page.get_by_role("button", name="有効（無効にする）").nth(1).click()
        page.wait_for_timeout(1500)
        mid = page.get_by_role("button", name="有効（無効にする）").count()
        check("ユーザーを無効にすると有効の数が減る", mid == before - 1, f"{before}→{mid}")
        page.get_by_role("button", name="最初に戻す").click()
        page.get_by_role("button", name="戻す", exact=True).click()
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_selector(".login-list button, .shell-top", timeout=60000)
        page.wait_for_timeout(2500)
        page.goto(base + "/users/")
        page.wait_for_timeout(2500)
        after = page.get_by_role("button", name="有効（無効にする）").count()
        check("「最初に戻す」で元の数に戻る", after == before, f"{before}→{mid}→{after}")

        print("お客さん（田中）")
        page.goto(base + "/today/")
        switch_role(page, "田中 一郎")
        check("お客さんは専用ページ /portal/ に入る", page.url.endswith("/portal/"), page.url)
        t = body(page)
        check("お客さんは自分の現場（田中様邸）が見える", "田中様邸" in t)
        check("お客さんに見積が出る", "お見積り" in t and "¥" in t)
        page.goto(base + "/sites/")
        page.wait_for_timeout(3000)
        check("お客さんが社内の画面（/sites/）を開くと専用ページに戻される", page.url.endswith("/portal/"), page.url)
        t = body(page)
        site_ids = {"S-2608-01"}
        hidden = [nm for nm, sid, vis in files if sid in site_ids and vis in ("internal", "partner")]
        shown = [nm for nm, sid, vis in files if sid in site_ids and vis in ("customer", "both")]
        check("お客さんに社内用・協力業者用のファイルが出ない", len(hidden) > 0 and all(h not in t for h in hidden), f"出ている：{[h for h in hidden if h in t]}")
        check("お客さんに共有されたファイルは出る", shown and all(s in t for s in shown))

        print("協力業者（青木）")
        page.goto(base + "/portal/")
        switch_role(page, "青木")
        t = body(page)
        check("協力業者は専用ページに入る", page.url.endswith("/portal/") and "協力業者" in t)
        check("協力業者に金額・見積が出ない", "¥" not in t and "お見積り" not in t)
        ps = {"S-2610-01", "S-2610-04", "S-2611-01"}
        hidden = [nm for nm, sid, vis in files if sid in ps and vis in ("internal", "customer")]
        check("協力業者に社内用・お客さん用のファイルが出ない", len(hidden) > 0 and all(h not in t for h in hidden), f"出ている：{[h for h in hidden if h in t]}")

        print("スマホ幅（375px）")
        mctx = b.new_context(viewport={"width": 375, "height": 812}, device_scale_factor=2, is_mobile=True, has_touch=True)
        users = {
            "owner": {"id": "E-01", "name": "山本 誠", "role": "owner"},
            "customer": {"id": "X-03", "name": "田中 一郎", "role": "customer"},
        }
        for path, who in [("/", None), ("/today/", "owner"), ("/sites/", "owner"), ("/sites/detail/?id=S-2610-03", "owner"),
                          ("/schedule/", "owner"), ("/users/", "owner"), ("/portal/", "customer")]:
            pg = mctx.new_page()
            pg.add_init_script("localStorage.setItem('site-manager.user', JSON.stringify(%s))" % json.dumps(users[who], ensure_ascii=False)
                               if who else "localStorage.removeItem('site-manager.user')")
            pg.goto(base + path, wait_until="domcontentloaded")
            pg.wait_for_timeout(5000)
            over = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            check(f"スマホ幅で横あふれなし：{path}", over <= 0, f"{over}px")
            pg.close()

        print("オフライン（サービスワーカー）")
        pg = mctx.new_page()
        pg.add_init_script("localStorage.setItem('site-manager.user', JSON.stringify(%s))" % json.dumps(users["owner"], ensure_ascii=False))
        pg.goto(base + "/today/", wait_until="networkidle")
        pg.wait_for_timeout(3000)
        for u in ["/sites/", "/schedule/"]:
            pg.goto(base + u, wait_until="networkidle")
            pg.wait_for_timeout(1500)
        active = pg.evaluate("navigator.serviceWorker.getRegistration().then(r => !!(r && r.active))")
        check("サービスワーカーが有効", active)
        mctx.set_offline(True)
        pg.goto(base + "/sites/", wait_until="domcontentloaded")
        check("機内モード（オフライン）でも現場の一覧が開く", "現場の一覧" in body(pg))
        b.close()
    srv.shutdown()
    ng = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(ng)} / {len(results)} 件が通りました" + ("" if not ng else f"（NG {len(ng)} 件）"))
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
