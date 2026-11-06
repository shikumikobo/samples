"""db/seed.sql が参照する架空のファイル（図面・写真・書類など）を app/public/sample-files/ に作る。実物ではなく、文字を入れた絵（架空）。
使い方：python scripts/make-sample-files.py（site-manager 直下で）"""
import re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent.parent
seed = (root / "db" / "seed.sql").read_text(encoding="utf-8")
out = root / "app" / "public" / "sample-files"
out.mkdir(parents=True, exist_ok=True)
for old in out.iterdir():
    old.unlink()
font_path = r"C:\Windows\Fonts\BIZ-UDGothicR.ttc"
f_big = ImageFont.truetype(font_path, 44)
f_mid = ImageFont.truetype(font_path, 26)
COLORS = {"図面": (226, 236, 247), "写真": (222, 238, 224), "書類": (246, 240, 226), "工程": (240, 232, 244), "見積": (246, 236, 232)}
names = sorted(set(re.findall(r"sample-files/([^'\"]+)", seed)))
for n in names:
    stem, ext = n.rsplit(".", 1)
    parts = stem.split("_")
    site, kind, title = parts[0], parts[1] if len(parts) > 1 else "", "_".join(parts[2:])
    base = next((c for k, c in COLORS.items() if k in kind or k in title), (236, 240, 245))
    size = (1200, 800) if ext == "jpg" else (1240, 1754)
    im = Image.new("RGB", size, base)
    d = ImageDraw.Draw(im)
    d.rectangle((30, 30, size[0] - 30, size[1] - 30), outline=(31, 58, 95), width=4)
    d.text((70, 90), f"{kind}（架空のデータ）", font=f_mid, fill=(80, 90, 105))
    d.text((70, 150), title or kind, font=f_big, fill=(31, 58, 95))
    d.text((70, 240), f"現場番号：{site}", font=f_mid, fill=(60, 70, 85))
    d.text((70, size[1] - 110), "サンプル工務店のデモ用の絵です（実物ではありません）", font=f_mid, fill=(110, 118, 130))
    if ext == "jpg":
        im.save(out / n, quality=88)
    else:
        im.save(out / n, "PDF", resolution=150)
print(f"{len(names)} 件を {out} に作りました")
