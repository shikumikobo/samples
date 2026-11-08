"""サービス画像・体験のお得感の画像・PWA アイコンを作る（自作の SVG を playwright で PNG にする）。

実行：python data/tools/build_images.py
絵の中に文字・金額は入れない（雰囲気だけ）。出力：app/public/images/<サービスid>.png、app/public/icons/icon-192.png・icon-512.png
"""
import io
import math
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
IMG = ROOT / "app" / "public" / "images"
ICON = ROOT / "app" / "public" / "icons"
W, H = 800, 520
FONT = "BIZ UDGothic"  # 絵の中に文字は入れないが、ledger.json の fonts に合わせて指定だけしておく


def svg(inner, c1, c2, w=W, h=H):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="{FONT}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">'
            f'<stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient></defs>'
            f'<rect width="{w}" height="{h}" fill="url(#bg)"/>{inner}</svg>')


def sparkle(x, y, r, fill="#fff"):
    k = r * 0.22
    return (f'<path d="M{x},{y-r} Q{x+k},{y-k} {x+r},{y} Q{x+k},{y+k} {x},{y+r} Q{x-k},{y+k} {x-r},{y} '
            f'Q{x-k},{y-k} {x},{y-r}Z" fill="{fill}"/>')


def bow(cx, cy, s, c, dark):
    return (f'<g transform="translate({cx},{cy}) scale({s})">'
            f'<path d="M0,0 C-70,-70 -150,-60 -140,0 C-135,55 -60,40 0,0Z" fill="{c}"/>'
            f'<path d="M0,0 C70,-70 150,-60 140,0 C135,55 60,40 0,0Z" fill="{c}"/>'
            f'<path d="M-6,8 L-70,120 L-30,105 L-6,140Z" fill="{dark}"/><path d="M6,8 L70,120 L30,105 L6,140Z" fill="{dark}"/>'
            f'<path d="M-100,-5 C-80,-35 -50,-25 -30,-8" stroke="#fff" stroke-opacity=".5" stroke-width="6" fill="none" stroke-linecap="round"/>'
            f'<path d="M100,-5 C80,-35 50,-25 30,-8" stroke="#fff" stroke-opacity=".5" stroke-width="6" fill="none" stroke-linecap="round"/>'
            f'<rect x="-24" y="-24" width="48" height="48" rx="14" fill="{dark}"/></g>')


SKIN = "#f1c5ae"


def hand(cx, base, nails, scale=1.0, extra_defs=""):
    """5本指の手。nails は5つの塗り（色または url(#id)）。"""
    xs = [-132, -66, 0, 66, 126]
    tops = [base - 150, base - 215, base - 245, base - 220, base - 130]
    parts = [f'<g transform="translate({cx},0) scale({scale}) translate({-cx*0},0)">']
    parts.append(f'<rect x="-165" y="{base-60}" width="330" height="190" rx="70" fill="{SKIN}"/>')
    for x, t, n in zip(xs, tops, nails):
        parts.append(f'<rect x="{x-29}" y="{t}" width="58" height="{base-t+10}" rx="29" fill="{SKIN}"/>')
        parts.append(f'<rect x="{x-24}" y="{t+8}" width="48" height="62" rx="20" fill="{n}"/>')
        parts.append(f'<rect x="{x-17}" y="{t+14}" width="9" height="30" rx="4.5" fill="#fff" fill-opacity=".45"/>')
    parts.append('</g>')
    return "".join(parts)


# ---------- ネイルサロン ----------
def nail_trial():
    cols = ["#f6b8c4", "#f9d3a8", "#c9e4c5", "#b9d6f2", "#d9c3ef"]
    nails = "".join(f'<g transform="translate({140+i*130},400) rotate({(i-2)*6})"><rect x="-44" y="-70" width="88" height="130" rx="38" fill="{c}"/>'
                    f'<rect x="-28" y="-56" width="14" height="60" rx="7" fill="#fff" fill-opacity=".5"/></g>' for i, c in enumerate(cols))
    return svg(bow(400, 130, 1.25, "#e8808f", "#c95a6c") + nails + sparkle(110, 120, 26) + sparkle(690, 100, 32) + sparkle(640, 230, 18)
               + sparkle(170, 250, 14) + sparkle(740, 330, 14), "#ffe6ea", "#ffd1c9")


def nail_onecolor():
    bottle = ('<g transform="translate(655,300)"><rect x="-48" y="0" width="96" height="120" rx="26" fill="#d98a7a"/>'
              '<rect x="-22" y="-70" width="44" height="76" rx="12" fill="#3f3a40"/><rect x="-30" y="-12" width="60" height="22" rx="6" fill="#bfa27a"/>'
              '<rect x="-30" y="20" width="12" height="70" rx="6" fill="#fff" fill-opacity=".35"/></g>')
    return svg(hand(300, 420, ["#d98a7a"] * 5, 1.0) + bottle + sparkle(620, 110, 20, "#fff") + sparkle(95, 100, 16), "#fbf0e8", "#f4d9cc")


def nail_art():
    defs = ('<defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6a6c1"/><stop offset="1" stop-color="#9fb8ee"/></linearGradient>'
            '<pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="#f3e3b8"/><circle cx="7" cy="7" r="3.2" fill="#d98a5e"/></pattern>'
            '<pattern id="stripe" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="12" height="12" fill="#bfe0d8"/><rect width="5" height="12" fill="#5fa392"/></pattern></defs>')
    h = hand(400, 430, ["#fff", "url(#g1)", "url(#dots)", "url(#stripe)", "#f2d4a0"], 1.1)
    deco = ('<g transform="translate(262,0)"></g>'
            # フレンチの先端と、ラメ
            '<path d="M163,269 q40,16 79,0 v-16 h-79Z" fill="#f4a8b8" opacity="0"/>')
    extra = sparkle(120, 120, 28) + sparkle(690, 150, 24) + sparkle(640, 70, 14) + sparkle(150, 300, 14)
    return svg(defs + h + deco + extra, "#efe6fb", "#ffe3ec")


def nail_foot():
    toes = ""
    for i, (x, y, r) in enumerate([(250, 190, 40), (330, 160, 34), (400, 150, 30), (462, 158, 27), (516, 180, 23)]):
        toes += f'<circle cx="{x}" cy="{y}" r="{r}" fill="{SKIN}"/><rect x="{x-r*0.55}" y="{y-r*0.78}" width="{r*1.1}" height="{r*0.85}" rx="{r*0.38}" fill="#7fc4cf"/>'
    foot = f'<path d="M230,230 C220,330 250,440 330,470 C420,500 520,460 540,370 C555,290 540,230 520,215 C440,250 320,255 230,230Z" fill="{SKIN}"/>'
    waves = "".join(f'<path d="M0,{440+i*28} q50,-22 100,0 t100,0 t100,0 t100,0 t100,0 t100,0 t100,0 t100,0" stroke="#fff" stroke-opacity=".6" stroke-width="5" fill="none"/>' for i in range(3))
    shell = ('<g transform="translate(670,360)"><path d="M0,60 C-70,40 -70,-40 0,-60 C70,-40 70,40 0,60Z" fill="#f7d6c4"/>'
             '<path d="M0,55 L0,-52 M-28,48 L-28,-38 M28,48 L28,-38" stroke="#e8b49c" stroke-width="5" fill="none"/></g>')
    return svg(waves + foot + toes + shell + sparkle(120, 120, 24) + sparkle(680, 110, 20), "#d9f0f2", "#bfe2ea")


def nail_off():
    pads = "".join(f'<g transform="translate({180+i*18},{360-i*26})"><ellipse cx="0" cy="0" rx="92" ry="38" fill="#fff"/>'
                   f'<ellipse cx="0" cy="-6" rx="86" ry="32" fill="#fbf6f1" stroke="#ece1d8" stroke-width="3"/></g>' for i in range(3))
    bottle = ('<g transform="translate(520,250)"><rect x="-70" y="0" width="140" height="190" rx="34" fill="#cfe7e6"/>'
              '<rect x="-34" y="-84" width="68" height="92" rx="14" fill="#6a8f90"/><rect x="-70" y="60" width="140" height="70" fill="#fff" fill-opacity=".7"/>'
              '<circle cx="0" cy="95" r="20" fill="#9cc7c6"/><rect x="-52" y="14" width="14" height="150" rx="7" fill="#fff" fill-opacity=".4"/></g>')
    return svg(pads + bottle + sparkle(120, 110, 22) + sparkle(700, 90, 26) + sparkle(380, 90, 14), "#e5f3f1", "#f7ece6")


def nail_care():
    jar = ('<g transform="translate(300,300)"><ellipse cx="0" cy="110" rx="130" ry="30" fill="#000" opacity=".08"/>'
           '<rect x="-120" y="-10" width="240" height="120" rx="36" fill="#fbeee4"/><rect x="-128" y="-60" width="256" height="62" rx="26" fill="#d9a78e"/>'
           '<rect x="-96" y="20" width="22" height="70" rx="11" fill="#fff" fill-opacity=".7"/><circle cx="20" cy="55" r="26" fill="#f0c9b4"/></g>')
    stick = '<g transform="translate(600,320) rotate(28)"><rect x="-12" y="-170" width="24" height="320" rx="12" fill="#e2c9a4"/><path d="M-12,-170 q12,-40 24,0Z" fill="#c7a77c"/></g>'
    petals = "".join(f'<ellipse cx="0" cy="-44" rx="22" ry="44" fill="#f6bccb" transform="translate(620,130) rotate({a})"/>' for a in range(0, 360, 60))
    return svg(jar + stick + petals + '<circle cx="620" cy="130" r="18" fill="#f3d28a"/>' + sparkle(140, 120, 24) + sparkle(430, 90, 14),
               "#fff0e8", "#fadfe0")


def nail_repair():
    nail = ('<g transform="translate(330,270)"><rect x="-120" y="-190" width="240" height="380" rx="100" fill="#f7d6cb"/>'
            '<rect x="-96" y="-166" width="30" height="200" rx="15" fill="#fff" fill-opacity=".5"/>'
            '<path d="M-10,-190 L14,-110 L-8,-60 L16,0" stroke="#c9998a" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
            '<rect x="-52" y="-100" width="104" height="52" rx="26" fill="#e9c27e" transform="rotate(-8)"/>'
            '<rect x="-40" y="-92" width="80" height="12" rx="6" fill="#fff" fill-opacity=".6" transform="rotate(-8)"/></g>')
    file_ = ('<g transform="translate(620,300) rotate(-34)"><rect x="-26" y="-190" width="52" height="380" rx="20" fill="#c9d6e8"/>'
             '<rect x="-26" y="-190" width="52" height="260" rx="20" fill="#9fb4d2"/>'
             + "".join(f'<rect x="-18" y="{-170+i*20}" width="36" height="4" fill="#fff" fill-opacity=".5"/>' for i in range(11)) + '</g>')
    return svg(nail + file_ + sparkle(540, 90, 30, "#fff") + sparkle(120, 110, 22) + sparkle(220, 470, 14) + sparkle(700, 470, 16),
               "#fff4e6", "#f5e0ef")


# ---------- 料理教室 ----------
def cook_trial():
    pot = ('<g transform="translate(400,365)"><ellipse cx="0" cy="130" rx="190" ry="26" fill="#000" opacity=".08"/>'
           '<rect x="-150" y="-20" width="300" height="150" rx="40" fill="#d98c63"/><rect x="-162" y="-48" width="324" height="40" rx="20" fill="#c0734a"/>'
           '<rect x="-205" y="20" width="62" height="22" rx="11" fill="#7d5a45"/><rect x="143" y="20" width="62" height="22" rx="11" fill="#7d5a45"/>'
           '<rect x="-120" y="10" width="20" height="96" rx="10" fill="#fff" fill-opacity=".3"/></g>')
    steam = "".join(f'<path d="M{x},270 q-28,-34 0,-68 q28,-34 0,-68" stroke="#fff" stroke-opacity=".85" stroke-width="12" fill="none" stroke-linecap="round"/>' for x in (350, 420, 490))
    return svg(bow(170, 120, 0.9, "#e08a5c", "#b9633a") + bow(640, 120, 0.9, "#e08a5c", "#b9633a") + steam + pot
               + sparkle(400, 80, 30) + sparkle(260, 250, 16) + sparkle(560, 240, 16) + sparkle(100, 330, 14) + sparkle(715, 330, 14),
               "#fff0dc", "#fbd9b5")


def cook_washoku():
    rice = ('<g transform="translate(250,310)"><ellipse cx="0" cy="105" rx="150" ry="22" fill="#000" opacity=".08"/>'
            '<path d="M-130,10 H130 C130,100 70,130 0,130 C-70,130 -130,100 -130,10Z" fill="#8c3d34"/>'
            '<path d="M-110,10 C-100,-80 100,-80 110,10Z" fill="#fffdf6"/>'
            '<path d="M-60,-20 q10,-14 24,-4 M10,-30 q12,-14 26,-2 M-20,-50 q8,-10 20,-2" stroke="#e8e0cf" stroke-width="6" fill="none" stroke-linecap="round"/></g>')
    soup = ('<g transform="translate(560,330)"><ellipse cx="0" cy="90" rx="130" ry="20" fill="#000" opacity=".08"/>'
            '<path d="M-110,0 H110 C110,80 60,105 0,105 C-60,105 -110,80 -110,0Z" fill="#2f4a56"/>'
            '<ellipse cx="0" cy="0" rx="110" ry="26" fill="#c9895a"/><ellipse cx="0" cy="-2" rx="96" ry="20" fill="#d9a06c"/>'
            '<rect x="-24" y="-12" width="22" height="14" rx="3" fill="#fff"/><rect x="18" y="-8" width="24" height="14" rx="3" fill="#8fb36a"/></g>')
    fish = ('<g transform="translate(400,140)"><ellipse cx="0" cy="0" rx="150" ry="46" fill="#f7efe2" stroke="#e5d8c2" stroke-width="4"/>'
            '<path d="M-90,0 C-50,-34 40,-34 80,0 C40,34 -50,34 -90,0Z" fill="#e48e6a"/><path d="M80,0 l36,-24 v48Z" fill="#e48e6a"/>'
            '<circle cx="-62" cy="-5" r="5" fill="#3a2a22"/><path d="M-20,-22 q10,22 0,44 M12,-24 q10,22 0,48" stroke="#c9704c" stroke-width="4" fill="none"/></g>')
    sticks = '<g stroke="#7a5a3a" stroke-width="9" stroke-linecap="round"><path d="M80,470 L430,430"/><path d="M90,495 L440,452"/></g>'
    return svg(fish + rice + soup + sticks + sparkle(90, 90, 20) + sparkle(720, 70, 22), "#f6efe0", "#e9efd8")


def cook_western():
    plate = ('<g transform="translate(400,285)"><ellipse cx="0" cy="12" rx="300" ry="190" fill="#000" opacity=".07"/>'
             '<ellipse cx="0" cy="0" rx="300" ry="190" fill="#fffdf8"/><ellipse cx="0" cy="0" rx="230" ry="140" fill="#f4ede0"/></g>')
    steak = ('<g transform="translate(380,270)"><ellipse cx="0" cy="0" rx="130" ry="76" fill="#7a3f27"/><ellipse cx="0" cy="-8" rx="118" ry="64" fill="#a05434"/>'
             '<path d="M-90,-10 C-40,-60 60,-60 100,-6" stroke="#6b3220" stroke-width="10" fill="none" stroke-linecap="round" opacity=".7"/>'
             '<path d="M-60,40 C0,64 60,56 96,26" stroke="#d9a35a" stroke-width="14" fill="none" stroke-linecap="round" opacity=".8"/></g>')
    veg = ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#5f9a4a"/><circle cx="{x-r*0.4}" cy="{y-r*0.3}" r="{r*0.5}" fill="#79b560"/>' for x, y, r in [(560, 220, 30), (590, 262, 26), (545, 270, 24)])
    carrot = ''.join(f'<circle cx="{x}" cy="{y}" r="20" fill="#ee9a45"/><circle cx="{x}" cy="{y}" r="9" fill="#f6b86b"/>' for x, y in [(240, 330), (270, 365), (222, 372)])
    fork = '<g transform="translate(90,300) rotate(10)"><rect x="-8" y="-20" width="16" height="190" rx="8" fill="#b9bec6"/><path d="M-26,-130 v100 q26,14 52,0 v-100 h-10 v70 h-8 v-70 h-8 v70 h-8 v-70 h-8 v70 h-8 v-70Z" fill="#cfd4db"/></g>'
    return svg(plate + steak + veg + carrot + fork + sparkle(700, 80, 20) + sparkle(100, 90, 16), "#fbefe0", "#f1d5c0")


def cook_italian():
    plate = ('<g transform="translate(400,290)"><ellipse cx="0" cy="12" rx="290" ry="180" fill="#000" opacity=".07"/>'
             '<ellipse cx="0" cy="0" rx="290" ry="180" fill="#fffdf8"/><ellipse cx="0" cy="0" rx="210" ry="125" fill="#f5eee3"/></g>')
    pasta = "".join(f'<ellipse cx="400" cy="{285-i*4}" rx="{135-i*17}" ry="{78-i*10}" fill="none" stroke="{c}" stroke-width="12"/>'
                    for i, c in enumerate(["#f0cf7a", "#e8c066", "#f0cf7a", "#e8c066", "#f0cf7a"]))
    sauce = '<ellipse cx="400" cy="270" rx="52" ry="30" fill="#d4482f"/><ellipse cx="392" cy="262" rx="30" ry="14" fill="#e4684b" opacity=".7"/>'
    leaves = "".join(f'<path d="M0,0 C20,-30 50,-30 66,0 C50,30 20,30 0,0Z" fill="#4f9a55" transform="translate({x},{y}) rotate({a})"/>' for x, y, a in [(380, 238, -40), (400, 240, 10)])
    tomato = "".join(f'<circle cx="{x}" cy="{y}" r="30" fill="#d9402f"/><path d="M{x-12},{y-24} l12,10 l12,-10" stroke="#3f8a45" stroke-width="7" fill="none"/>' for x, y in [(625, 160), (680, 215)])
    return svg(plate + pasta + sauce + leaves + tomato + sparkle(100, 100, 20) + sparkle(90, 430, 14), "#fdeedd", "#f6d6c8")


def cook_bread():
    def loaf(x, y, rx, ry, rot):
        cuts = "".join(f'<path d="M{-rx*0.55+i*rx*0.55},{-ry*0.5} l{rx*0.18},{ry*0.9}" stroke="#e6b678" stroke-width="9" stroke-linecap="round"/>' for i in range(3))
        return (f'<g transform="translate({x},{y}) rotate({rot})"><ellipse cx="0" cy="12" rx="{rx}" ry="{ry}" fill="#000" opacity=".08"/>'
                f'<ellipse cx="0" cy="0" rx="{rx}" ry="{ry}" fill="#b8742f"/><ellipse cx="-6" cy="-6" rx="{rx*0.9}" ry="{ry*0.82}" fill="#cf8d44"/>{cuts}</g>')
    roll = lambda x, y: f'<g transform="translate({x},{y})"><ellipse cx="0" cy="8" rx="64" ry="48" fill="#000" opacity=".08"/><circle cx="0" cy="0" r="58" fill="#c98a42"/><circle cx="-6" cy="-8" r="50" fill="#dca05a"/><path d="M-26,-20 q26,26 52,0" stroke="#b8742f" stroke-width="7" fill="none" stroke-linecap="round"/></g>'
    wheat = lambda x, y, r: (f'<g transform="translate({x},{y}) rotate({r})"><path d="M0,0 V170" stroke="#caa14e" stroke-width="7"/>'
                             + "".join(f'<ellipse cx="{-14 if i%2 else 14}" cy="{-i*26}" rx="9" ry="20" fill="#e2bf6a" transform="rotate({-28 if i%2 else 28} {-14 if i%2 else 14} {-i*26})"/>' for i in range(5))
                             + '</g>')
    board = '<rect x="60" y="360" width="680" height="110" rx="26" fill="#d9b88c"/><rect x="60" y="360" width="680" height="26" rx="13" fill="#e8cca4"/>'
    return svg(board + loaf(280, 300, 190, 86, -4) + roll(560, 320) + roll(660, 290) + wheat(110, 110, -20) + wheat(710, 90, 22) + sparkle(420, 90, 18),
               "#fbf0dd", "#f3dcb8")


def cook_sweets():
    cake = ('<g transform="translate(400,300)"><ellipse cx="0" cy="130" rx="230" ry="34" fill="#000" opacity=".08"/>'
            '<rect x="-190" y="-10" width="380" height="140" rx="26" fill="#f7dfcc"/><rect x="-190" y="40" width="380" height="26" fill="#e9a9b2"/>'
            '<path d="M-190,-10 q95,-60 190,-30 q95,-30 190,30 v-18 q-95,-70 -190,-34 q-95,-36 -190,34Z" fill="#fffaf2"/>'
            '<rect x="-190" y="-34" width="380" height="40" rx="20" fill="#fffaf2"/>'
            + "".join(f'<g transform="translate({x},-52)"><path d="M0,40 C-34,16 -30,-30 0,-28 C30,-30 34,16 0,40Z" fill="#d9374f"/><path d="M-10,-26 l10,-14 l10,14" stroke="#3f8a45" stroke-width="7" fill="none"/>'
                      f'<circle cx="-8" cy="0" r="3" fill="#f6b7c0"/><circle cx="8" cy="10" r="3" fill="#f6b7c0"/></g>' for x in (-120, -40, 40, 120))
            + '<rect x="-170" y="80" width="14" height="40" rx="7" fill="#fff" fill-opacity=".5"/></g>')
    whisk = ('<g transform="translate(110,330) rotate(-18)"><rect x="-9" y="-10" width="18" height="150" rx="9" fill="#9aa4b0"/>'
             + "".join(f'<ellipse cx="0" cy="-90" rx="{r}" ry="92" fill="none" stroke="#c4cbd4" stroke-width="5"/>' for r in (14, 30, 46)) + '</g>')
    return svg(whisk + cake + sparkle(700, 110, 28) + sparkle(120, 110, 18) + sparkle(680, 440, 14), "#fdeaf0", "#fbe3cf")


def cook_ferment():
    jar = ('<g transform="translate(300,300)"><ellipse cx="0" cy="150" rx="170" ry="26" fill="#000" opacity=".08"/>'
           '<rect x="-135" y="-60" width="270" height="200" rx="52" fill="#b87a4a"/><rect x="-135" y="-60" width="270" height="70" rx="40" fill="#cf9560"/>'
           '<path d="M-150,-70 H150 L130,-96 H-130Z" fill="#f3ead8"/><rect x="-146" y="-80" width="292" height="26" rx="12" fill="#e7dcc4"/>'
           '<path d="M-146,-62 q146,40 292,0" stroke="#c0432f" stroke-width="7" fill="none"/>'
           '<rect x="-108" y="10" width="20" height="100" rx="10" fill="#fff" fill-opacity=".25"/></g>')
    plate = '<ellipse cx="610" cy="360" rx="150" ry="70" fill="#fffdf8"/><ellipse cx="610" cy="360" rx="116" ry="50" fill="#f1ebdf"/>'
    pickles = "".join(f'<g transform="translate({x},{y}) rotate({a})"><rect x="-44" y="-15" width="88" height="30" rx="15" fill="{c}"/><rect x="-36" y="-9" width="40" height="7" rx="3" fill="#fff" fill-opacity=".35"/></g>'
                      for x, y, a, c in [(580, 350, -12, "#5f9a4a"), (640, 352, 8, "#ee9a45"), (610, 378, 0, "#7bb05c")])
    leaf = '<path d="M0,0 C30,-40 80,-36 96,0 C70,36 24,36 0,0Z" fill="#5f9a4a" transform="translate(120,110) rotate(-30)"/>'
    return svg(plate + pickles + jar + leaf + sparkle(700, 100, 24) + sparkle(520, 90, 14) + sparkle(100, 440, 14), "#f3f0de", "#e7ecd2")


def app_icon(size):
    s = size
    u = s / 512
    inner = (f'<g transform="scale({u})">'
             '<rect x="108" y="130" width="296" height="268" rx="44" fill="#fffaf2"/>'
             '<path d="M108,174 a44,44 0 0 1 44,-44 h208 a44,44 0 0 1 44,44 v34 h-296Z" fill="#d98c63"/>'
             '<rect x="170" y="96" width="28" height="64" rx="14" fill="#fffaf2"/><rect x="314" y="96" width="28" height="64" rx="14" fill="#fffaf2"/>'
             '<path d="M200,300 l42,44 l78,-86" stroke="#2f6f6a" stroke-width="34" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{s}" height="{s}" viewBox="0 0 {s} {s}"><rect width="{s}" height="{s}" fill="#2f6f6a"/>{inner}</svg>')


SALON_IMGS = dict(nail_trial=nail_trial, nail_onecolor=nail_onecolor, nail_art=nail_art, nail_foot=nail_foot,
                  nail_off=nail_off, nail_care=nail_care, nail_repair=nail_repair)
CLASS_IMGS = dict(cook_trial=cook_trial, cook_washoku=cook_washoku, cook_western=cook_western, cook_italian=cook_italian,
                  cook_bread=cook_bread, cook_sweets=cook_sweets, cook_ferment=cook_ferment)


def main():
    IMG.mkdir(parents=True, exist_ok=True)
    ICON.mkdir(parents=True, exist_ok=True)
    jobs = [(IMG / f"{k}.png", f(), W, H, True) for k, f in {**SALON_IMGS, **CLASS_IMGS}.items()]
    jobs += [(ICON / f"icon-{n}.png", app_icon(n), n, n, False) for n in (192, 512)]
    with sync_playwright() as p:
        br = p.chromium.launch()
        for path, s, w, h, quant in jobs:
            pg = br.new_page(viewport={"width": w, "height": h})
            pg.set_content(f'<html><body style="margin:0">{s}</body></html>')
            png = pg.screenshot(clip={"x": 0, "y": 0, "width": w, "height": h})
            pg.close()
            im = Image.open(io.BytesIO(png)).convert("RGB")
            im = im.quantize(colors=192, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) if quant else im.quantize(colors=32)
            im.save(path, optimize=True)
            print(f"{path.name}: {path.stat().st_size // 1024} KB")
        br.close()


if __name__ == "__main__":
    main()
