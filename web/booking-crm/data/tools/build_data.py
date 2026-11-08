"""架空のデータ（salon.json / class.json）を作る。決まった乱数で同じ結果になる。

実行：python data/tools/build_data.py
形は docs/contract.md の §3 と §7。日時は day_offset（デモの今日 2026-11-09 からの日数）と time（HH:MM）。
"""
import datetime
import json
import random
from pathlib import Path

TODAY = datetime.date(2026, 11, 9)
OUT = Path(__file__).resolve().parent.parent

SURNAMES = [
    ("青木", "あおき", "aoki"), ("石井", "いしい", "ishii"), ("井上", "いのうえ", "inoue"), ("上田", "うえだ", "ueda"),
    ("大野", "おおの", "ono"), ("岡田", "おかだ", "okada"), ("小川", "おがわ", "ogawa"), ("金子", "かねこ", "kaneko"),
    ("川口", "かわぐち", "kawaguchi"), ("木村", "きむら", "kimura"), ("久保", "くぼ", "kubo"), ("児玉", "こだま", "kodama"),
    ("坂本", "さかもと", "sakamoto"), ("島田", "しまだ", "shimada"), ("菅原", "すがわら", "sugawara"), ("関口", "せきぐち", "sekiguchi"),
    ("高木", "たかぎ", "takagi"), ("千葉", "ちば", "chiba"), ("土屋", "つちや", "tsuchiya"), ("寺田", "てらだ", "terada"),
    ("内藤", "ないとう", "naito"), ("西村", "にしむら", "nishimura"), ("野口", "のぐち", "noguchi"), ("橋本", "はしもと", "hashimoto"),
    ("平野", "ひらの", "hirano"), ("福田", "ふくだ", "fukuda"), ("松岡", "まつおか", "matsuoka"), ("宮崎", "みやざき", "miyazaki"),
    ("森山", "もりやま", "moriyama"), ("横山", "よこやま", "yokoyama"), ("吉田", "よしだ", "yoshida"), ("和田", "わだ", "wada"),
]
GIVEN_F = [
    ("彩香", "あやか", "ayaka"), ("美咲", "みさき", "misaki"), ("結衣", "ゆい", "yui"), ("恵", "めぐみ", "megumi"),
    ("里奈", "りな", "rina"), ("真由", "まゆ", "mayu"), ("千夏", "ちなつ", "chinatsu"), ("優子", "ゆうこ", "yuko"),
    ("菜々子", "ななこ", "nanako"), ("沙織", "さおり", "saori"), ("明日香", "あすか", "asuka"), ("琴音", "ことね", "kotone"),
    ("友里", "ゆり", "yuri"), ("麻衣", "まい", "mai"), ("瑞希", "みずき", "mizuki"), ("志保", "しほ", "shiho"),
    ("紗希", "さき", "saki"), ("奈緒", "なお", "nao"), ("美穂", "みほ", "miho"), ("朋美", "ともみ", "tomomi"),
    ("理恵", "りえ", "rie"), ("香織", "かおり", "kaori"), ("莉子", "りこ", "riko"), ("夏帆", "かほ", "kaho"),
    ("由美", "ゆみ", "yumi"),
]
GIVEN_M = [
    ("健太", "けんた", "kenta"), ("大輔", "だいすけ", "daisuke"), ("翔", "しょう", "sho"),
    ("拓也", "たくや", "takuya"), ("誠", "まこと", "makoto"), ("亮", "りょう", "ryo"),
]

# 25人分の行動。kind T=体験から入る人、R=通常。past=(日数, 状態) v=来店済み c=キャンセル n=無断欠席、fut=先の予約の日数
ROWS = {
    1: ("T", [(-50, "v"), (-22, "v")], [6]),
    2: ("T", [(-44, "v"), (-16, "v")], [10]),
    3: ("T", [(-36, "v"), (-8, "v")], []),
    4: ("T", [(-58, "v"), (-30, "v")], []),
    5: ("T", [(-40, "v"), (-12, "v")], [16]),
    6: ("T", [(-33, "v"), (-5, "v")], [14]),
    7: ("T", [(-25, "v")], []),
    8: ("T", [(-10, "v")], []),
    9: ("T", [(-18, "n")], []),
    10: ("T", [], [3]),
    11: ("T", [], [9]),
    12: ("R", [(-52, "v"), (-24, "v"), (-3, "v")], [4]),
    13: ("R", [(-19, "n")], [8]),
    14: ("R", [(-56, "v"), (-28, "v")], []),
    15: ("R", [(-11, "v")], [13]),
    16: ("R", [(-45, "v"), (-31, "c")], []),
    17: ("R", [(-42, "v"), (-14, "v"), (-1, "v")], [15]),
    18: ("R", [(-35, "v"), (-9, "v")], [0, 20]),
    19: ("R", [(-54, "v"), (-26, "c")], []),
    20: ("R", [(-30, "c"), (-2, "v")], [7]),
    21: ("R", [(-23, "v")], [1]),
    22: ("R", [(-6, "v")], [11, 19]),
    23: ("R", [(-48, "v"), (-29, "v")], [2]),
    24: ("R", [(-20, "n"), (-1, "v")], [5]),
    25: ("R", [(-13, "v")], [6, 12]),
}

SETTINGS = [
    ("demo_today", "2026-11-09"), ("slot_minutes", "15"), ("booking_window_days", "60"),
    ("min_lead_hours", "2"), ("max_per_day", "2"), ("cancel_deadline", "prev_day_end"),
]


def wd(day):  # 0=日 … 6=土
    return ((TODAY + datetime.timedelta(days=day)).weekday() + 1) % 7


def hm(m):
    return f"{m // 60:02d}:{m % 60:02d}"


def mins(t):
    return int(t[:2]) * 60 + int(t[3:])


SALON = dict(
    mode="salon",
    services=[
        # id, 名前, 分, 円, 体験, 目安日数, 説明
        ("nail_trial", "はじめてのジェルネイル体験", 60, 2500, True, 21,
         "初めての方限定の体験プラン。カラーを1色選んで、ワンカラーのジェルを塗ります。ケアとオフ込み。"),
        ("nail_onecolor", "ワンカラージェル", 60, 5500, False, 28, "お好きな色を1色で仕上げる、定番のジェル。ケア込み。"),
        ("nail_art", "アートネイル", 90, 7800, False, 28, "ラメ・グラデーション・フレンチなどのデザインを、写真を見ながら相談できます。"),
        ("nail_foot", "フットジェル", 75, 6600, False, 35, "足の爪のケアとジェル。夏以外も長持ちするので人気です。"),
        ("nail_off", "オフ＋ハンドケア", 45, 3300, False, 28, "ジェルを溶かして落とし、爪と甘皮を整えます。つけ替えの前にも。"),
        ("nail_care", "ハンドケア（甘皮・保湿）", 30, 2200, False, 21, "甘皮の処理と保湿パック。ジェルなしで爪をいたわりたい方に。"),
        ("nail_repair", "付け替え・リペア", 30, 1650, False, 21, "欠けや浮きが出た1〜2本の補修。ご来店日の当日お問い合わせもどうぞ。"),
    ],
    staff=[
        ("st1", "柏木 真琴", "オーナーネイリスト"),
        ("st2", "篠原 杏奈", "ネイリスト"),
        ("st3", "瀬戸 美月", "ネイリスト"),
    ],
    hours={
        "st1": {1: ("10:00", "19:00"), 2: ("10:00", "19:00"), 4: ("10:00", "19:00"), 5: ("10:00", "19:00"), 6: ("10:00", "19:00"), 0: ("10:00", "17:00")},
        "st2": {1: ("10:00", "18:00"), 2: ("10:00", "18:00"), 4: ("10:00", "18:00"), 5: ("10:00", "18:00"), 6: ("10:00", "19:00")},
        "st3": {1: ("11:00", "19:00"), 4: ("11:00", "20:00"), 5: ("11:00", "20:00"), 6: ("11:00", "20:00"), 0: ("11:00", "17:00")},
    },
    off=[
        ("st1", -21, "研修のためお休み"), ("st1", 13, "お休み"),
        ("st2", -12, "お休み"), ("st2", 8, "私用のためお休み"),
        ("st3", -26, "お休み"), ("st3", 16, "お休み"),
    ],
    notes={
        1: "体験から通常メニューへ。ベージュ系のワンカラーが好み。",
        2: "体験から通常メニューへ。短めの爪が好き。仕事柄、派手なアートは避ける。",
        3: "体験から通常メニューへ。次回はアートに挑戦したいとのこと。",
        4: "体験のあと1回来店。そろそろ次の時期。",
        5: "体験から通常メニューへ。フットも気になっている。",
        6: "友人の紹介で体験。月1回のペースで通う予定。",
        7: "体験のみ。仕上がりは好評で、次回の予約は未定。",
        8: "体験のみ。ネイルは初めて。",
        9: "体験を無断欠席。連絡は夜のほうが通じやすい。",
        10: "体験を予約。初めてのネイル。",
        11: "体験を予約。お出かけ前の下見で来店予定。",
        12: "常連。毎回グラデーション。ラメ多めが好き。",
        13: "ワンカラー派。無断欠席が1回あり、前日に確認の連絡をする。",
        14: "来店の間隔が空きぎみ。",
        15: "アートが好き。季節ごとにデザインを変える。",
        16: "フットケア中心。",
        17: "早番の仕事。朝いちの枠を希望。",
        18: "お子さん連れのことがある。静かな時間帯が合う。",
        19: "オフと付け替えで来店。",
        20: "デザインは持参の写真から決める。",
        21: "短時間で済ませたい。ハンドケア中心。",
        22: "月2回の常連。",
        23: "ネイルチップの相談あり。",
        24: "シンプルな縦グラデーション。",
        25: "夜の枠を好む。",
    },
    cautions={
        2: "爪が薄く割れやすい。ファイルはやさしく。",
        5: "ジェルで赤みが出たことあり。パッチテスト済み。",
        12: "妊娠中。薬剤の香りに配慮。",
        13: "爪のまわりが乾燥しやすい。保湿多め。",
        15: "二枚爪ぎみ。",
        17: "左手の腱鞘炎。手を長く反らさない。",
        21: "ジェルのにおいが苦手。換気を希望。",
        24: "深爪ぎみ。長さは出さない。",
    },
    given_pool=GIVEN_F,
    pair=lambda i: ((i * 11 + 5) % 32, (i * 7 + 2) % 25),
)

CLASS = dict(
    mode="class",
    services=[
        ("cook_trial", "はじめての料理教室（体験）", 120, 2500, True, 10,
         "初めての方限定の体験レッスン。季節の一品を、ひと通り自分の手で作って食べて帰ります。"),
        ("cook_washoku", "基本の和食", 150, 5500, False, 14, "だしのとり方から、煮物・焼き物・汁物まで。毎月メニューが変わります。"),
        ("cook_western", "定番の洋食", 150, 5800, False, 14, "ハンバーグやグラタンなど、家で作れる洋食を手順から。"),
        ("cook_italian", "手打ちパスタ", 120, 5200, False, 14, "生地をこねて延ばして切るところから。ソースも2種類作ります。"),
        ("cook_bread", "手ごねパン", 180, 6200, False, 14, "こねから焼き上がりまで。焼きたてを食べて、残りはお持ち帰り。"),
        ("cook_sweets", "季節のお菓子", 150, 5600, False, 14, "タルトやシフォンなど、季節の素材のお菓子。ラッピングも練習します。"),
        ("cook_ferment", "発酵ごはん（味噌・ぬか漬け）", 120, 4800, False, 14, "味噌づくりやぬか床の育て方。仕込んだものはお持ち帰り。"),
    ],
    capacity={"cook_trial": 8, "cook_washoku": 6, "cook_western": 6, "cook_italian": 6, "cook_bread": 5, "cook_sweets": 6, "cook_ferment": 4},
    staff=[
        ("t1", "桜井 千鶴", "主宰講師"),
        ("t2", "日野 慎一", "講師"),
        ("t3", "水野 文香", "講師"),
    ],
    hours={
        "t1": {d: ("10:00", "21:30") for d in (2, 4, 6, 0)},
        "t2": {d: ("10:00", "21:30") for d in (1, 3, 5, 6)},
        "t3": {d: ("10:00", "21:30") for d in (2, 3, 5, 0)},
    },
    off=[("t1", -14, "お休み"), ("t1", 9, "お休み"), ("t2", -7, "お休み"), ("t2", 12, "お休み"), ("t3", -20, "お休み"), ("t3", 6, "お休み")],
    notes={
        1: "体験から参加。基本の和食をもう少し習いたい。",
        2: "体験から参加。仕事帰りの夜の枠を希望。",
        3: "体験からパン講座へ。",
        4: "体験のあと1回参加。",
        5: "体験から参加。家族に作ってあげたい。",
        6: "体験から参加。お菓子に興味。",
        7: "体験のみ参加。次回は未定。",
        8: "体験のみ。料理は初心者。",
        9: "体験を無断欠席。",
        10: "体験を予約。",
        11: "体験を予約。ひとり暮らしを始めたばかり。",
        12: "常連。パンとお菓子が好き。",
        13: "洋食が得意になりたい。無断欠席が1回あり、前日に確認の連絡をする。",
        14: "最近は来られていない。",
        15: "いつも最前列。質問が多い。",
        16: "休みの日の午前を希望。",
        17: "お子さんと一緒に作った料理を持ち帰る。",
        18: "発酵ものに興味。",
        19: "久しぶりの参加。",
        20: "平日の夜のみ。",
        21: "ヘルシーな料理を希望。",
        22: "友人と参加が多い。",
        23: "パンが得意。",
        24: "イタリアンが好き。",
        25: "週末の午前を希望。",
    },
    cautions={
        3: "えびアレルギー。",
        6: "卵アレルギー。卵なしの代わりで対応。",
        10: "小麦アレルギー。パン・パスタの回は要相談。",
        12: "ナッツ類が不可。",
        15: "左利き。包丁の置き方に配慮。",
        18: "乳製品でお腹をこわしやすい。",
        21: "ベジタリアン（肉・魚なし）。",
        23: "貝類アレルギー。",
        25: "そばアレルギー。",
    },
    given_pool=GIVEN_F + GIVEN_M,
    pair=lambda i: ((i * 13 + 1) % 32, (i * 9 + 4) % 31),
)


def build(cfg, seed):
    rnd = random.Random(seed)
    mode = cfg["mode"]
    is_class = mode == "class"
    svc = []
    for n, (sid, name, dur, price, trial, rd, desc) in enumerate(cfg["services"], 1):
        svc.append(dict(id=sid, name=name, kind="class" if is_class else "timed", duration_min=dur, price=price,
                        is_trial=trial, first_time_only=trial, return_days=rd, image=f"{sid}.png",
                        description=desc, sort=n, active=True))
    S = {s["id"]: s for s in svc}
    trial_id = next(s["id"] for s in svc if s["is_trial"])
    normals = [s["id"] for s in svc if not s["is_trial"]]
    staff = [dict(id=i, name=n, title=t, active=True) for i, n, t in cfg["staff"]]
    hours = [dict(staff_id=sid, weekday=d, open_time=o, close_time=c)
             for sid, m in cfg["hours"].items() for d, (o, c) in sorted(m.items())]
    off = [dict(staff_id=s, day_offset=d, note=n) for s, d, n in cfg["off"]]
    off_set = {(s, d) for s, d, _ in cfg["off"]}

    # --- 顧客
    customers = []
    for i in range(1, 26):
        si, gi = cfg["pair"](i - 1)
        sn, sk, sr = SURNAMES[si]
        gn, gk, gr = cfg["given_pool"][gi]
        customers.append(dict(
            id=f"c{i:02d}", name=f"{sn} {gn}", kana=f"{sk} {gk}",
            phone=f"090-0000-{1100 + i * 37:04d}",
            email=None if i in (8, 14, 21) else f"{gr}.{sr}@example.com",
            note=cfg["notes"][i], caution=cfg["cautions"].get(i, ""), created_day_offset=0, active=True))

    # --- クラス枠（教室）
    sessions = []
    if is_class:
        cyc = ["cook_trial", "cook_washoku", "cook_bread", "cook_western", "cook_sweets", "cook_italian", "cook_trial", "cook_ferment"]
        ptr = 0
        slots = [600, 840, 1110]  # 10:00 14:00 18:30
        for day in range(-28, 15):
            w = wd(day)
            for st in cfg["staff"]:
                sid = st[0]
                if w not in cfg["hours"][sid] or (sid, day) in off_set:
                    continue
                if rnd.random() < 0.62 or day == 0:
                    n = 2 if rnd.random() < 0.18 else 1
                    for sl in rnd.sample(slots, n):
                        svc_id = cyc[ptr % len(cyc)]
                        ptr += 1
                        d = S[svc_id]["duration_min"]
                        sessions.append(dict(service_id=svc_id, staff_id=sid, day_offset=day, time=hm(sl),
                                             end_time=hm(sl + d), capacity=cfg["capacity"][svc_id], _n=0))
        sessions.sort(key=lambda s: (s["day_offset"], s["time"]))
        for k, s in enumerate(sessions, 1):
            s["id"] = f"cs{k:02d}"

    # --- 予約
    res = []
    busy = {}  # staff -> [(day, s, e)]
    cust_days = {}  # customer -> set(day)

    def hint(h, past):
        if not is_class:
            return h
        if past:
            return min(-1, -round(-h * 28 / 58))
        return round(h * 0.7)

    def place_timed(cid, sid_svc, h, past, min_day):
        dur = S[sid_svc]["duration_min"]
        order = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5]
        for dd in order:
            day = h + dd
            if (past and day >= 0) or ((not past) and day < 0) or day < min_day or day in cust_days.get(cid, set()):
                continue
            w = wd(day)
            stf = [s[0] for s in cfg["staff"]]
            rnd.shuffle(stf)
            for st in stf:
                if w not in cfg["hours"][st] or (st, day) in off_set:
                    continue
                o, c = (mins(x) for x in cfg["hours"][st][w])
                cands = [t for t in range(o, c - dur + 1, 30)]
                rnd.shuffle(cands)
                for t in cands:
                    if all(not (d == day and t < e and s < t + dur) for d, s, e in busy.get(st, [])):
                        busy.setdefault(st, []).append((day, t, t + dur))
                        return st, day, t, t + dur, None
        raise SystemExit(f"配置できない: {cid} {sid_svc} {h}")

    def place_class(cid, sid_svc, h, past, min_day):
        cands = [s for s in sessions if s["service_id"] == sid_svc and s["_n"] < s["capacity"]
                 and ((s["day_offset"] < 0) == past) and s["day_offset"] >= min_day
                 and s["day_offset"] not in cust_days.get(cid, set())]
        if not cands:
            raise SystemExit(f"枠がない: {cid} {sid_svc} {h}")
        cands.sort(key=lambda s: (abs(s["day_offset"] - h), rnd.random()))
        s = cands[0]
        s["_n"] += 1
        return s["staff_id"], s["day_offset"], mins(s["time"]), mins(s["end_time"]), s["id"]

    place = place_class if is_class else place_timed
    for i in range(1, 26):
        cid = f"c{i:02d}"
        kind, past, fut = ROWS[i]
        events = [(h, st, True) for h, st in past] + [(h, "b", False) for h in fut]
        nth = 0
        last_day = -999
        first_created = None
        for h, st, is_past in events:
            if kind == "T" and nth == 0:
                svc_id = trial_id
            else:
                k = nth - (1 if kind == "T" else 0)
                svc_id = normals[(i + (1 if k % 3 == 2 else 0)) % len(normals)]
            sid, day, t0, t1, ses = place(cid, svc_id, hint(h, is_past), is_past, last_day + 1)
            cust_days.setdefault(cid, set()).add(day)
            last_day = day
            nth += 1
            status = {"v": "visited", "c": "canceled", "n": "noshow", "b": "booked"}[st]
            cr = min(day - rnd.randint(1, 12), -1)
            res.append(dict(
                customer_id=cid, service_id=svc_id, staff_id=sid, session_id=ses, day_offset=day, time=hm(t0),
                end_time=hm(t1), price=S[svc_id]["price"], is_trial=S[svc_id]["is_trial"], status=status,
                created_day_offset=cr, created_time=hm(rnd.randrange(9 * 60, 21 * 60, 5))))
            if first_created is None or cr < first_created:
                first_created = cr
        c = customers[i - 1]
        c["created_day_offset"] = (first_created - rnd.randint(0, 5)) if kind == "T" else -rnd.randint(90, 300)
        if kind == "R" and first_created is not None:
            c["created_day_offset"] = min(c["created_day_offset"], first_created - 1)
        c["created_time"] = hm(rnd.randrange(9 * 60, 20 * 60, 5))

    res.sort(key=lambda r: (r["day_offset"], r["time"], r["staff_id"]))
    for k, r in enumerate(res, 1):
        r["id"] = f"r{k:03d}"
    if is_class:
        # 予約のない過去の枠は消す（過去に誰もいない枠は不自然）
        used = {r["session_id"] for r in res}
        sessions = [s for s in sessions if s["day_offset"] >= 0 or s["id"] in used]
        for s in sessions:
            s.pop("_n", None)

    def order(d, keys):
        return {k: d[k] for k in keys if k in d}

    svc_keys = ["id", "name", "kind", "duration_min", "price", "is_trial", "first_time_only", "return_days", "image", "description", "sort", "active"]
    res_keys = ["id", "customer_id", "service_id", "staff_id", "session_id", "day_offset", "time", "end_time", "price", "is_trial", "status", "created_day_offset", "created_time"]
    cust_keys = ["id", "name", "kana", "phone", "email", "note", "caution", "created_day_offset", "created_time", "active"]
    ses_keys = ["id", "service_id", "staff_id", "day_offset", "time", "end_time", "capacity"]
    return {
        "_readme": "架空のデータ（すべて架空）。形は docs/contract.md §3・§7、補足は data/README.md。data/tools/build_data.py で作る。",
        "settings": [{"key": "mode", "value": mode}] + [{"key": k, "value": v} for k, v in SETTINGS],
        "services": [order(s, svc_keys) for s in svc],
        "staff": staff,
        "staff_hours": hours,
        "staff_off": off,
        "class_sessions": [order(s, ses_keys) for s in sessions],
        "customers": [order(c, cust_keys) for c in customers],
        "reservations": [order(r, res_keys) for r in res],
    }


def main():
    for cfg, seed, name in ((SALON, 20261109, "salon.json"), (CLASS, 20261110, "class.json")):
        data = build(cfg, seed)
        (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print("wrote", name)


if __name__ == "__main__":
    main()
