"""data/salon.json と data/class.json を確かめる。実行：python data/validate.py（失敗があれば終了コード1）"""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
IMAGES = HERE.parent / "app" / "public" / "images"
COLS = {
    "services": ["id", "name", "kind", "duration_min", "price", "is_trial", "first_time_only", "return_days", "image", "description", "sort", "active"],
    "staff": ["id", "name", "title", "active"],
    "staff_hours": ["staff_id", "weekday", "open_time", "close_time"],
    "staff_off": ["staff_id", "day_offset", "note"],
    "class_sessions": ["id", "service_id", "staff_id", "day_offset", "time", "end_time", "capacity"],
    "customers": ["id", "name", "kana", "phone", "email", "note", "caution", "created_day_offset", "created_time", "active"],
    "reservations": ["id", "customer_id", "service_id", "staff_id", "session_id", "day_offset", "time", "end_time", "price",
                     "is_trial", "status", "created_day_offset", "created_time"],
}
NULLABLE = {("services", "return_days"), ("customers", "email"), ("reservations", "session_id")}
NOT_EMPTY_OK = {("customers", "note"), ("customers", "caution"), ("staff_off", "note")}
# 今日（day_offset=0）が月曜。0=日 … 6=土
WEEKDAY0 = 1


def mins(t):
    return int(t[:2]) * 60 + int(t[3:])


def weekday(day):
    return (WEEKDAY0 + day) % 7


def check(path):
    d = json.loads(path.read_text(encoding="utf-8"))
    errs, info = [], []

    def E(msg):
        errs.append(msg)

    mode = next((s["value"] for s in d["settings"] if s["key"] == "mode"), None)
    is_class = mode == "class"
    if mode not in ("salon", "class"):
        E(f"settings.mode が不正: {mode}")
    sets = {s["key"]: s["value"] for s in d["settings"]}
    if sets.get("demo_today") != "2026-11-09":
        E("demo_today が 2026-11-09 でない")

    # 必須の列
    for t, cols in COLS.items():
        for n, row in enumerate(d[t]):
            for c in cols:
                if c not in row:
                    E(f"{t}[{n}] に列 {c} がない")
                elif row[c] is None and (t, c) not in NULLABLE:
                    E(f"{t}[{n}].{c} が null")
                elif row[c] == "" and (t, c) not in NOT_EMPTY_OK:
                    E(f"{t}[{n}].{c} が空")
            for c in row:
                if c not in cols:
                    E(f"{t}[{n}] に知らない列 {c}")
    for t in ("services", "staff", "class_sessions", "customers", "reservations"):
        ids = [r["id"] for r in d[t]]
        if len(ids) != len(set(ids)):
            E(f"{t} の id が重複")

    svc = {s["id"]: s for s in d["services"]}
    staff = {s["id"]: s for s in d["staff"]}
    cust = {c["id"]: c for c in d["customers"]}
    ses = {s["id"]: s for s in d["class_sessions"]}
    res = d["reservations"]

    # 量
    if not 6 <= len(svc) <= 8:
        E(f"サービスが {len(svc)} 件")
    trials = [s for s in svc.values() if s["is_trial"]]
    if len(trials) != 1:
        E(f"体験プランが {len(trials)} 件")
    for s in trials:
        if not (0 <= s["price"] <= 3000):
            E(f"体験の料金が範囲外: {s['price']}")
        if not s["first_time_only"]:
            E("体験の first_time_only が false")
        if s["return_days"] is None:
            E("体験の return_days がない")
    for s in svc.values():
        if s["kind"] != ("class" if is_class else "timed"):
            E(f"{s['id']} の kind が {s['kind']}")
        if s["return_days"] is None:
            E(f"{s['id']} の return_days がない")
        if not (IMAGES / s["image"]).exists():
            E(f"画像がない: {s['image']}")
        elif s["image"] != s["id"] + ".png":
            E(f"画像名が id と違う: {s['image']}")
    if len(staff) != 3:
        E(f"担当が {len(staff)} 人")
    if len(cust) != 25:
        E(f"顧客が {len(cust)} 人")
    if len(res) != 60:
        E(f"予約が {len(res)} 件")
    past = [r for r in res if r["day_offset"] < 0]
    fut = [r for r in res if r["day_offset"] >= 0]
    if (len(past), len(fut)) != (40, 20):
        E(f"過去{len(past)}・先{len(fut)}（40・20のはず）")
    if any(r["status"] not in ("visited", "canceled", "noshow") for r in past):
        E("過去の予約に visited/canceled/noshow 以外がある")
    if any(r["status"] != "booked" for r in fut):
        E("先の予約に booked 以外がある")
    pc = Counter(r["status"] for r in past)
    if not (pc["canceled"] and pc["noshow"]):
        E("過去に canceled と noshow の両方が必要")

    # 参照
    for r in res:
        if r["customer_id"] not in cust or r["service_id"] not in svc or r["staff_id"] not in staff:
            E(f"{r['id']} の参照が不正")
        if r["price"] != svc[r["service_id"]]["price"]:
            E(f"{r['id']} の金額がサービスと違う")
        if r["is_trial"] != svc[r["service_id"]]["is_trial"]:
            E(f"{r['id']} の is_trial がサービスと違う")
        if r["created_day_offset"] >= 0 or r["created_day_offset"] > r["day_offset"]:
            E(f"{r['id']} の作成日が不正")
        if r["created_day_offset"] < cust[r["customer_id"]]["created_day_offset"]:
            E(f"{r['id']} が顧客の登録より前")
        if mins(r["end_time"]) - mins(r["time"]) != svc[r["service_id"]]["duration_min"]:
            E(f"{r['id']} の長さがサービスと違う")
        if mins(r["time"]) % 15:
            E(f"{r['id']} が15分刻みでない")
    for s in d["class_sessions"]:
        if s["service_id"] not in svc or s["staff_id"] not in staff:
            E(f"{s['id']} の参照が不正")
        if not 4 <= s["capacity"] <= 8:
            E(f"{s['id']} の定員が {s['capacity']}")
    if is_class:
        caps = sorted({s["capacity"] for s in d["class_sessions"]})
        days = [s["day_offset"] for s in d["class_sessions"]]
        info.append(f"枠 {len(ses)}（定員 {caps}、{min(days)}〜{max(days)} 日）")
    elif d["class_sessions"]:
        E("サロンに class_sessions がある")

    # 営業時間・休み
    hours = defaultdict(dict)
    for h in d["staff_hours"]:
        hours[h["staff_id"]][h["weekday"]] = (mins(h["open_time"]), mins(h["close_time"]))
    off = {(o["staff_id"], o["day_offset"]) for o in d["staff_off"]}
    for st in staff:
        if st not in hours:
            E(f"{st} の営業時間がない")

    def in_hours(st, day, a, b):
        if (st, day) in off:
            return False
        w = hours[st].get(weekday(day))
        return bool(w) and w[0] <= a and b <= w[1]

    # 重なり・定員
    blocks = defaultdict(list)  # staff -> (day, a, b, label)
    if is_class:
        for s in ses.values():
            a, b = mins(s["time"]), mins(s["end_time"])
            if not in_hours(s["staff_id"], s["day_offset"], a, b):
                E(f"{s['id']} が営業時間・休みの外")
            if b - a != svc[s["service_id"]]["duration_min"]:
                E(f"{s['id']} の長さがサービスと違う")
            blocks[s["staff_id"]].append((s["day_offset"], a, b, s["id"]))
        cnt = Counter()
        for r in res:
            s = ses.get(r["session_id"])
            if not s:
                E(f"{r['id']} の session_id が不正")
                continue
            if (s["service_id"], s["staff_id"], s["day_offset"], s["time"], s["end_time"]) != (
                    r["service_id"], r["staff_id"], r["day_offset"], r["time"], r["end_time"]):
                E(f"{r['id']} が枠 {s['id']} と合わない")
            if r["status"] != "canceled":
                cnt[s["id"]] += 1
        for sid, n in cnt.items():
            if n > ses[sid]["capacity"]:
                E(f"{sid} が定員超え {n}/{ses[sid]['capacity']}")
        info.append(f"枠の最大の埋まり {max(cnt.values())}、予約のある枠 {len(cnt)}")
    else:
        for r in res:
            if r["session_id"] is not None:
                E(f"{r['id']} に session_id がある")
            a, b = mins(r["time"]), mins(r["end_time"])
            if not in_hours(r["staff_id"], r["day_offset"], a, b):
                E(f"{r['id']} が営業時間・休みの外")
            if r["status"] != "canceled":
                blocks[r["staff_id"]].append((r["day_offset"], a, b, r["id"]))
    n_overlap = 0
    for st, bl in blocks.items():
        bl.sort()
        for x, y in zip(bl, bl[1:]):
            if x[0] == y[0] and y[1] < x[2]:
                n_overlap += 1
                E(f"{st} の重なり: {x[3]} と {y[3]}")
    info.append(f"同じ担当の重なり {n_overlap} 件")

    # 同じ日は2件以内
    per = Counter((r["customer_id"], r["day_offset"]) for r in res)
    over = [k for k, v in per.items() if v > 2]
    for k in over:
        E(f"同じ日に3件以上: {k}")
    info.append(f"同じ日の最大件数 {max(per.values())}")

    # 初回限定の体験は1人1回（電話・メールが同じなら同じ人）
    keys = {}
    for c in cust.values():
        keys.setdefault(("p", c["phone"]), []).append(c["id"])
        if c["email"]:
            keys.setdefault(("e", c["email"]), []).append(c["id"])
    for k, v in keys.items():
        if len(v) > 1:
            E(f"電話・メールが重複: {k} {v}")
    tcount = Counter(r["customer_id"] for r in res if r["is_trial"] and r["status"] != "canceled")
    for c, n in tcount.items():
        if n > 1:
            E(f"{c} の体験が {n} 回")
    # 体験は、その人の最初の予約であること
    first = {}
    for r in sorted(res, key=lambda r: (r["day_offset"], r["time"])):
        first.setdefault(r["customer_id"], r)
    for c, n in tcount.items():
        if not first[c]["is_trial"]:
            E(f"{c} の体験が最初の予約でない")
    conv = sorted({r["customer_id"] for r in res if not r["is_trial"] and r["status"] == "visited"} &
                  {r["customer_id"] for r in res if r["is_trial"] and r["status"] == "visited"})
    if len(conv) < 3:
        E(f"体験→通常に来た人が {len(conv)} 人")
    info.append(f"体験の予約 {sum(tcount.values())} 件、体験→通常に来た人 {len(conv)} 人")

    # そろそろ来店（最後の visited + return_days が今日以前）
    last = {}
    for r in sorted(res, key=lambda r: (r["day_offset"], r["time"])):
        if r["status"] == "visited":
            last[r["customer_id"]] = r
    due = sorted(c for c, r in last.items() if r["day_offset"] + svc[r["service_id"]]["return_days"] <= 0)
    if not 3 <= len(due) <= 8:
        E(f"そろそろ来店が {len(due)} 人（3〜8人にする）")
    info.append(f"そろそろ来店 {len(due)} 人 {due}")

    st = Counter(r["status"] for r in res)
    info.insert(0, f"サービス {len(svc)}・担当 {len(staff)}・顧客 {len(cust)}・予約 {len(res)}（過去 {len(past)}・先 {len(fut)}）"
                   f" 状態 {dict(st)}")
    return errs, info


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ng = 0
    for name in ("salon.json", "class.json"):
        errs, info = check(HERE / name)
        print(f"== {name}: {'OK' if not errs else 'NG'}")
        for i in info:
            print("  ", i)
        for e in errs:
            print("  NG:", e)
        ng += len(errs)
    print("合格" if not ng else f"不合格（{ng} 件）")
    sys.exit(1 if ng else 0)


if __name__ == "__main__":
    main()
