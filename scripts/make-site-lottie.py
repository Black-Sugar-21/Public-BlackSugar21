"""Lottie for the blacksugar21.com landing. Our own artwork, built with scripts/lottie_kit.py (shape layers, trim
paths, eased keyframes; no expressions). Gold #D4AF37 / purple #9c59ea from src/styles.css.

Usage: python3 scripts/make-site-lottie.py
  -> public/lottie/step-{profile,coach,date}.json, hero-spark.json, success.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lottie_kit import INOUT, Scene, anim, ellipse, fill, group, path, rect, stroke, trim  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "lottie")
GOLD, GOLD_DARK, PURPLE, PURPLE_SOFT, INK = "#D4AF37", "#B8860B", "#9c59ea", "#5B2A86", "#F5F0E6"
C = 128


def star(s):
    return path([(0, -s), (s * .22, -s * .22), (s, 0), (s * .22, s * .22), (0, s), (-s * .22, s * .22), (-s, 0), (-s * .22, -s * .22)], closed=True)


def heart(s):
    k = s
    return path([(0, k * .9), (-k, -k * .1), (-k * .5, -k * .8), (0, -k * .35), (k * .5, -k * .8), (k, -k * .1)], closed=True,
                tangents=([[0, 0], [0, k * .5], [-k * .4, 0], [0, 0], [0, -k * .1], [k * .3, -k * .5]],
                          [[0, 0], [0, -k * .5], [k * .3, -k * .1], [0, 0], [k * .4, 0], [0, k * .5]]))


# 1 · Perfil: a profile card fills in and a gold check appears (plays once, rests).
p = Scene("bs21-step-profile", 90)
p.layer("check", [group([path([(-10, 0), (-3, 8), (12, -8)]), stroke(GOLD, 6), trim(anim((0, 0), (52, 0), (70, 100)))])], p=(C + 34, C + 44))
for i, (y, w, t0) in enumerate([(14, 56, 16), (30, 40, 26)]):
    p.layer(f"line-{i}", [group([rect(w, 8, 4, (0, 0)), fill(PURPLE)])], p=(C - 4, C + y), s=anim((0, [0, 100, 100]), (t0, [0, 100, 100]), (t0 + 18, [100, 100, 100])))
p.layer("avatar", [group([ellipse(36, 36, (0, -26)), fill(GOLD)])], p=(C, C - 4), s=anim((0, [0, 0, 100]), (4, [0, 0, 100]), (20, [100, 100, 100])))
p.layer("card", [group([rect(110, 140, 18), stroke(PURPLE_SOFT, 6)])])
p.save(os.path.join(OUT, "step-profile.json"))

# 2 · Coach: two chat bubbles, typing dots pulse in the second (2 s seamless loop).
c = Scene("bs21-step-coach", 120)
for i, t0 in enumerate([0, 14, 28]):
    c.layer(f"dot-{i}", [group([ellipse(10), fill(INK)])], p=(C + 12 + i * 16, C + 26),
            s=anim((0, [100, 100, 100]), (t0, [100, 100, 100]), (t0 + 15, [150, 150, 100]), (t0 + 30, [100, 100, 100]), (120, [100, 100, 100])))
c.layer("bubble-coach", [group([rect(86, 44, 22, (28, 26)), fill(PURPLE)])], p=(C, C))
c.layer("bubble-you", [group([rect(80, 40, 20, (-24, -28)), fill(GOLD)])], p=(C, C))
c.save(os.path.join(OUT, "step-coach.json"))

# 3 · Cita: a pin drops on a soft map line and a heart pops above it (plays once, rests).
d = Scene("bs21-step-date", 90)
d.layer("heart", [group([heart(14), fill(GOLD)])], p=(C, C - 66), s=anim((0, [0, 0, 100]), (46, [0, 0, 100]), (60, [120, 120, 100]), (70, [100, 100, 100])))
d.layer("pin", [group([path([(0, 34), (-26, -2), (0, -36), (26, -2)], closed=True,
                            tangents=([[0, 0], [0, 12], [-16, 0], [0, -16]], [[0, 0], [0, -18], [16, 0], [0, 18]])), fill(PURPLE)]),
                 group([ellipse(18, 18, (0, -6)), fill(INK)])],
        p=anim((0, [C, C - 90, 0]), (30, [C, C - 6, 0]), (40, [C, C - 14, 0]), (48, [C, C - 6, 0])), o=anim((0, 0), (8, 100)))
d.layer("road", [group([path([(-80, 0), (-30, -14), (30, 10), (80, -4)]), stroke(PURPLE_SOFT, 5), trim(anim((0, 0), (36, 100)))])], p=(C, C + 52))
d.save(os.path.join(OUT, "step-date.json"))

# Hero spark: a gold four-point star that twinkles (2 s seamless loop).
h = Scene("bs21-hero-spark", 120, 96, 96)
h.layer("star-small", [group([star(8), fill(PURPLE)])], p=(70, 26), s=anim((0, [60, 60, 100]), (60, [110, 110, 100]), (120, [60, 60, 100]), ease=INOUT))
h.layer("star", [group([star(26), fill(GOLD)])], p=(44, 52), s=anim((0, [100, 100, 100]), (60, [82, 82, 100]), (120, [100, 100, 100]), ease=INOUT),
        r=anim((0, 0), (120, 90), ease=INOUT))
h.save(os.path.join(OUT, "hero-spark.json"))

# Success: a gold ring draws, then the check (plays once, rests).
s = Scene("bs21-success", 70, 128, 128)
s.layer("check", [group([path([(-18, 0), (-5, 13), (20, -12)]), stroke(GOLD, 9), trim(anim((0, 0), (30, 0), (52, 100)))])], p=(64, 66))
s.layer("ring", [group([ellipse(96), stroke(GOLD_DARK, 7), trim(anim((0, 0), (34, 100)))])], p=(64, 64))
s.save(os.path.join(OUT, "success.json"))
print("ok")
