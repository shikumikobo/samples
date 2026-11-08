"""画面の確認（スモークテスト）。実行：python -I scripts/smoke.py [--base http://localhost:3320]

1-α：全URLを、サロン・教室、お客さん・お店、スマホ幅(375px)で開き、①エラーが出ない ②横にはみ出さない
     ③本文がある ④「準備中」の表示が残っていない、を確かめる。
1-β：サロンの主な流れ。お客さんが体験プランを予約 → 同じ人が体験をもう一度取ると断られる
     → お店の「今日」「予約表」に出る → 来店済みにできる。
結果は scripts/smoke-result.txt にも書く（日本語の文字化けを避けるため）。
開発サーバー（next dev）か、out/ を配信したサーバーを先に起動しておく。
"""
import argparse, io, os, re, sys
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="http://localhost:3320")
args = ap.parse_args()
B = args.base.rstrip("/")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = io.open(os.path.join(HERE, "smoke-result.txt"), "w", encoding="utf-8")
fails = []
passes = 0


def say(s):
    OUT.write(s + "\n"); OUT.flush()
    try:
        print(s)
    except Exception:
        print(s.encode("ascii", "replace").decode())


def check(ok, label, detail=""):
    global passes
    if ok:
        passes += 1
        say("  OK  " + label)
    else:
        fails.append(label)
        say("  NG  " + label + (("  → " + detail) if detail else ""))


def new_ctx(pw_browser, mode, role, width=375, height=812, customer=None):
    ctx = pw_browser.new_context(viewport={"width": width, "height": height})
    # 初回だけ設定する（ページを開き直しても、画面で切り替えた状態を上書きしない）
    def seed(k, v):
        return f"if(localStorage.getItem('{k}')===null)localStorage.setItem('{k}','{v}');"
    init = seed("booking-crm.mode", mode) + seed("booking-crm.role", role)
    if customer:
        init += seed("booking-crm.customer", customer)
    ctx.add_init_script(init)
    return ctx


def watch(page, errs):
    page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:160]))
    page.on("console", lambda m: errs.append("console: " + m.text[:160]) if m.type == "error" else None)


def ready(page):
    page.wait_for_selector("main", timeout=60000)
    page.wait_for_function("() => !document.querySelector('main').innerText.includes('読み込み中')", timeout=60000)
    page.wait_for_timeout(400)


CUSTOMER_URLS = ["/book/", "/book/time/", "/book/confirm/", "/book/done/", "/my/"]
SHOP_URLS = ["/today/", "/calendar/", "/customers/", "/customers/detail/?id=c01", "/return/", "/settings/"]


def alpha(br):
    say("== 1-α 全URL（スマホ幅375px）")
    for mode in ("salon", "class"):
        for role, urls in (("customer", CUSTOMER_URLS), ("shop", SHOP_URLS)):
            ctx = new_ctx(br, mode, role, customer="c01")
            for u in urls + ["/"]:
                page = ctx.new_page()
                errs = []
                watch(page, errs)
                try:
                    page.goto(B + u)
                    ready(page)
                    body = page.inner_text("main")
                    over = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
                    bad = []
                    if errs:
                        bad.append("エラー " + errs[0])
                    if over > 1:
                        bad.append(f"横にはみ出し {over}px")
                    if len(body.strip()) < 20:
                        bad.append("本文が空")
                    if "準備中" in body:
                        bad.append("「準備中」が残っている")
                    check(not bad, f"{mode}/{role} {u}", "; ".join(bad))
                except Exception as e:
                    check(False, f"{mode}/{role} {u}", str(e)[:140])
                page.close()
            ctx.close()


def beta(br):
    say("== 1-β サロンの主な流れ")
    ctx = new_ctx(br, "salon", "customer", width=420, height=900)
    page = ctx.new_page()
    errs = []
    watch(page, errs)

    def pick_customer(name):
        page.locator("label.who select").select_option(label=name)
        page.wait_for_timeout(400)

    # 1. 体験プランを予約（体験を使っていない人を探す）
    done_name = None
    page.goto(B + "/book/"); ready(page)
    names = [o.inner_text() for o in page.query_selector_all("label.who option")]
    for name in names:
        page.goto(B + "/book/"); ready(page)
        pick_customer(name)
        page.locator("main button").nth(0).click()  # 先頭＝体験プラン（初回限定）
        page.wait_for_url("**/book/time/**"); page.wait_for_timeout(1200)
        slots = page.locator("main button").filter(has_text=re.compile(r"^\d\d:\d\d"))
        if slots.count() == 0:
            continue
        slots.first.click()
        page.locator("main button").last.click()
        page.wait_for_url("**/book/confirm/**"); page.wait_for_timeout(600)
        page.get_by_role("button", name="この内容で予約する").click()
        page.wait_for_timeout(1500)
        if "/book/done/" in page.url:
            done_name = name
            break
    check(done_name is not None, "お客さんが体験プランを予約できる", "予約できる人がいなかった")
    if not done_name:
        ctx.close(); return
    done_text = page.inner_text("main")
    say(f"     （{done_name} さん）完了画面の本文: " + re.sub(r"\s+", " ", done_text)[:120])
    check("予約" in done_text, "完了画面に予約の内容が出る")

    # 2. 同じ人が体験をもう一度 → 断られる
    page.goto(B + "/book/"); ready(page)
    pick_customer(done_name)
    page.locator("main button").nth(0).click()
    page.wait_for_url("**/book/time/**"); page.wait_for_timeout(1200)
    slots = page.locator("main button").filter(has_text=re.compile(r"^\d\d:\d\d"))
    got_rejected = False
    msg = ""
    if slots.count():
        slots.nth(slots.count() - 1).click()
        page.locator("main button").last.click()
        page.wait_for_url("**/book/confirm/**"); page.wait_for_timeout(600)
        page.get_by_role("button", name="この内容で予約する").click()
        page.wait_for_timeout(1500)
        msg = re.sub(r"\s+", " ", page.inner_text("main"))
        got_rejected = "/book/done/" not in page.url
    check(got_rejected, "同じ人が体験を2回目に取ると断られる（初回限定）", "2回目も予約できてしまった")
    if got_rejected:
        i = msg.find("体験")
        say("     断りの文: " + msg[max(0, i - 20): i + 80])

    # 3. 「私の予約」に出る
    page.goto(B + "/my/"); ready(page)
    mine = page.inner_text("main")
    check("体験" in mine, "「私の予約」に体験プランが出る")
    errs_customer = [e for e in errs if "pageerror" in e]
    check(not errs_customer, "お客さん側でエラーが出ていない", "; ".join(errs_customer[:2]))
    ctx.close()

    # 4. お店側：同じ DB（同じブラウザの記憶）で、お店に切り替えて確認する
    #    → 同じ context を使わないと DB が別になるので、お客さん側と同じ context で続ける
    return done_name


def beta_shop(br, name_hint=None):
    say("== 1-β（続き）お店側：予約が見え、来店済みにできる")
    ctx = new_ctx(br, "salon", "customer", width=1100, height=900)
    page = ctx.new_page()
    errs = []
    watch(page, errs)
    # お客さんで体験を予約 → 同じ context でお店に切り替え
    page.goto(B + "/book/"); ready(page)
    names = [o.inner_text() for o in page.query_selector_all("label.who option")]
    booked_name = None
    for name in names:
        page.goto(B + "/book/"); ready(page)
        page.locator("label.who select").select_option(label=name)
        page.wait_for_timeout(300)
        page.locator("main button").nth(0).click()
        page.wait_for_url("**/book/time/**"); page.wait_for_timeout(1200)
        slots = page.locator("main button").filter(has_text=re.compile(r"^\d\d:\d\d"))
        if slots.count() == 0:
            continue
        slots.first.click()  # 今日の最初の空き枠
        page.locator("main button").last.click()
        page.wait_for_url("**/book/confirm/**"); page.wait_for_timeout(600)
        page.get_by_role("button", name="この内容で予約する").click()
        page.wait_for_timeout(1500)
        if "/book/done/" in page.url:
            booked_name = name
            break
    check(booked_name is not None, "（お店側の確認用）お客さんで予約を入れる")
    if not booked_name:
        ctx.close(); return
    # お店に切り替え
    page.get_by_role("group", name="お客さんかお店か").locator("button").nth(1).click()
    page.wait_for_url("**/today/**"); ready(page)
    today = page.inner_text("main")
    check(booked_name.split()[0] in today, f"お店の「今日」に {booked_name} さんの予約が出る", re.sub(r"\s+", " ", today)[:160])
    # 来店済みにする
    row = page.locator(".sh-item").filter(has_text=booked_name.split()[0]).first
    before_done = page.locator(".sh-item.done").count()
    row.locator("button.primary").first.click()
    page.wait_for_timeout(1500)
    after_done = page.locator(".sh-item.done").count()
    check(after_done == before_done + 1, "「来店済み」にできる（行が済みの表示に変わる）", f"済み {before_done}→{after_done}")
    # 予約表
    surname = booked_name.split()[0]
    try:
        page.goto(B + "/calendar/"); ready(page)
        try:
            page.wait_for_function("(s) => document.querySelector('main').innerText.includes(s)", arg=surname, timeout=8000)
        except Exception:
            pass
        cal = page.inner_text("main")
        check(surname in cal, "お店の予約表に予約が出る", re.sub(r"\s+", " ", cal)[:200])
    except Exception as e:
        check(False, "お店の予約表に予約が出る", str(e)[:140])
    # カルテ（履歴）
    try:
        page.goto(B + "/customers/"); ready(page)
        page.get_by_role("link", name=re.compile(re.escape(surname))).first.click(timeout=10000)
        page.wait_for_url("**/customers/detail/**"); ready(page)
        page.wait_for_timeout(1200)
        karte = page.inner_text("main")
        check("体験" in karte or "来店" in karte, "顧客のカルテに履歴が出る", re.sub(r"\s+", " ", karte)[:200])
    except Exception as e:
        check(False, "顧客のカルテに履歴が出る", str(e)[:140])
    errs_p = [e for e in errs if "pageerror" in e]
    check(not errs_p, "お店側でエラーが出ていない", "; ".join(errs_p[:2]))
    ctx.close()


def book_first_slot(page, name, svc_index, slot_pick="first", day=0):
    """お客さん name で、svc_index 番目のサービスの空き枠を予約する。成功すれば (True, 予約前の枠の文) を返す"""
    page.goto(B + "/book/"); ready(page)
    page.locator("label.who select").select_option(label=name)
    page.wait_for_timeout(300)
    page.locator("main button").nth(svc_index).click()
    page.wait_for_url("**/book/time/**"); page.wait_for_timeout(1300)
    if day:
        page.locator("main button").filter(has_text=re.compile(r"^\d+月\d+日")).nth(day).click()
        page.wait_for_timeout(900)
    slots = page.locator("main button").filter(has_text=re.compile(r"^\d\d:\d\d"))
    if slots.count() == 0:
        return False, ""
    s = slots.first if slot_pick == "first" else slots.nth(slots.count() - 1)
    label = re.sub(r"\s+", " ", s.inner_text())
    s.click()
    page.locator("main button").last.click()
    page.wait_for_url("**/book/confirm/**"); page.wait_for_timeout(500)
    page.locator("main button").last.click()
    page.wait_for_timeout(1500)
    return "/book/done/" in page.url, label


def gamma(br):
    say("== 1-γ 教室：定員つきの枠")
    ctx = new_ctx(br, "class", "customer", width=1100, height=900)
    page = ctx.new_page()
    errs = []
    watch(page, errs)
    try:
        page.goto(B + "/book/"); ready(page)
        names = [o.inner_text() for o in page.query_selector_all("label.who option")]
        labels = []
        booked = []
        for name in names:
            ok, label = book_first_slot(page, name, 1)  # 2番目＝体験でない最初のコース
            if ok:
                booked.append(name)
                labels.append(label)
            if len(booked) >= 4:
                break
        check(len(booked) >= 2, f"教室で定員つきの枠に {len(booked)} 人が申し込める", f"申し込めたのは {len(booked)} 人")
        say("     予約前の残り人数の表示: " + " / ".join(labels))
        nums = [int(m.group(1)) for l in labels for m in [re.search(r"残り(\d+)名", l)] if m]
        check(nums == sorted(nums, reverse=True) and len(set(nums)) == len(nums), "申し込むたびに残り人数が減る", str(nums))
        # 満席の表示
        page.goto(B + "/book/"); ready(page)
        page.locator("label.who select").select_option(label=names[-1])
        page.locator("main button").nth(1).click()
        page.wait_for_url("**/book/time/**"); page.wait_for_timeout(1300)
        t = re.sub(r"\s+", " ", page.inner_text("main"))
        if len(booked) >= 4:
            check("満席" in t or "残り0" in t, "定員いっぱいで満席の表示になる", t[:200])
        else:
            say("     （4人まで入らなかったので、満席の確認はしない）")
        # お店の予約表で参加人数
        page.get_by_role("group", name="お客さんかお店か").locator("button").nth(1).click()
        page.wait_for_url("**/today/**"); ready(page)
        page.goto(B + "/calendar/"); ready(page)
        page.locator("input[type=date]").fill("2026-11-13")
        page.wait_for_timeout(1500)
        cal = re.sub(r"\s+", " ", page.inner_text("main"))
        m = re.search(r"参加\s*(\d+)/(\d+)", cal)
        check(bool(m) and int(m.group(1)) >= len(booked), "お店の予約表に参加人数と定員が出る", cal[:200])
    except Exception as e:
        check(False, "教室の確認", str(e)[:200])
    check(not [e for e in errs if "pageerror" in e], "教室の確認中にエラーが出ていない")
    ctx.close()


def delta(br):
    say("== 1-δ お客さん「私の予約」の変更・キャンセルと、お店の設定")
    ctx = new_ctx(br, "salon", "customer", width=420, height=900)
    page = ctx.new_page()
    errs = []
    watch(page, errs)
    try:
        page.goto(B + "/book/"); ready(page)
        names = [o.inner_text() for o in page.query_selector_all("label.who option")]
        who = None
        for name in names:
            ok, _ = book_first_slot(page, name, 1, slot_pick="last")  # 通常メニューを、今日の最後の枠で
            if ok:
                who = name
                break
        check(who is not None, "（期限の確認用）今日の予約を入れる")
        if who:
            page.goto(B + "/my/"); ready(page); page.wait_for_timeout(600)
            today_art = page.locator("article.bk-res").filter(has_text="済み").first
            check(today_art.locator("button.ghost").first.is_disabled() and today_art.locator("button.danger").first.is_disabled(),
                  "今日の予約は、期限（前日の終わり）を過ぎているので、変更・キャンセルが押せない")
            ok2, _ = book_first_slot(page, who, 1, slot_pick="last", day=3)
            check(ok2, "（変更・キャンセル用）数日先の予約を入れる")
            page.goto(B + "/my/"); ready(page)
            page.wait_for_timeout(600)
            articles = page.locator("article.bk-res")
            target = articles.filter(has_text="済み").filter(has=page.locator("button.ghost:not([disabled])")).first
            before = re.sub(r"\s+", " ", target.locator(".when").inner_text())
            target.locator("button.ghost").first.click()
            page.wait_for_timeout(1200)
            slots = target.locator("button").filter(has_text=re.compile(r"^\d\d:\d\d"))
            if slots.count() > 1:
                slots.first.click()
                target.get_by_role("button", name="この日時に変更する").click()
                page.wait_for_timeout(1500)
                after = re.sub(r"\s+", " ", page.locator("article.bk-res").filter(has_text="済み").filter(has=page.locator("button.ghost:not([disabled])")).first.locator(".when").inner_text())
                check(after != before, "「私の予約」で日時を変更できる", f"{before} → {after}")
            else:
                check(False, "「私の予約」で日時を変更できる", "変更先の枠が出ない")
            art = page.locator("article.bk-res").filter(has_text="済み").filter(has=page.locator("button.danger:not([disabled])")).first
            art.locator("button.danger").first.click()
            page.wait_for_timeout(600)
            art.get_by_role("button", name="キャンセルする", exact=True).click()
            page.wait_for_timeout(1500)
            body = re.sub(r"\s+", " ", page.inner_text("main"))
            check("キャンセル済み" in body or "キャンセル" in body.split("履歴")[-1], "「私の予約」でキャンセルできる", body[:160])
    except Exception as e:
        check(False, "「私の予約」の変更・キャンセル", str(e)[:200])
    ctx.close()

    # お店の設定：料金を変えて保存 → 開き直しても残る
    ctx = new_ctx(br, "salon", "shop", width=1100, height=900)
    page = ctx.new_page()
    try:
        page.goto(B + "/settings/"); ready(page)
        num = page.locator("main input[type=number]").first
        old = num.input_value()
        newv = "2600" if old != "2600" else "2700"
        num.fill(newv)
        page.locator("main button", has_text="保存").first.click()
        page.wait_for_timeout(1500)
        page.goto(B + "/settings/"); ready(page)
        page.wait_for_timeout(500)
        now = page.locator("main input[type=number]").first.input_value()
        check(now == newv, "設定でサービスの料金を変えて保存できる（開き直しても残る）", f"{old} → {newv}、開き直したら {now}")
    except Exception as e:
        check(False, "設定の保存", str(e)[:200])
    ctx.close()


with sync_playwright() as pw:
    br = pw.chromium.launch()
    alpha(br)
    beta(br)
    beta_shop(br)
    gamma(br)
    delta(br)
    br.close()

say("")
say(f"合格 {passes} 件 / 不合格 {len(fails)} 件")
for f in fails:
    say("  不合格: " + f)
sys.exit(1 if fails else 0)
