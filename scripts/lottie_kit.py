"""Tiny hand-built Lottie kit (no After Effects, no expressions). Only shape layers, rects, ellipses, paths, solid
fills/strokes, trim paths and eased transform keyframes — the subset lottie-web's light (SVG) build renders the same
everywhere. Every keyframe is eased. Each scene ends (or loops back) on a calm frame, which is what reduced-motion
visitors see. © Bimbask Inc. — our own artwork.
"""
from __future__ import annotations

import json

EASE = {"o": {"x": [0.23], "y": [1]}, "i": {"x": [0.32], "y": [1]}}       # ease-out (Emil Kowalski curve)
INOUT = {"o": {"x": [0.77], "y": [0]}, "i": {"x": [0.175], "y": [1]}}


def rgb(h: str, a: float = 1.0):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)] + [a]


def st(v):
    return {"a": 0, "k": v}


def anim(*frames, ease=EASE):
    """frames: (t, value) pairs; value is a number or a list."""
    ks = []
    for i, (t, v) in enumerate(frames):
        v = v if isinstance(v, list) else [v]
        k = {"t": t, "s": v}
        if i < len(frames) - 1:
            k.update({"o": ease["o"], "i": ease["i"]})
        ks.append(k)
    return {"a": 1, "k": ks}


def tr(p=(0, 0), a=(0, 0), s=None, r=None, o=None):
    return {"ty": "tr", "p": p if isinstance(p, dict) else st(list(p)), "a": st(list(a)),
            "s": s if isinstance(s, dict) else st([100, 100]), "r": r if isinstance(r, dict) else st(0),
            "o": o if isinstance(o, dict) else st(100), "sk": st(0), "sa": st(0)}


def rect(w, h, r=0, p=(0, 0)):
    return {"ty": "rc", "d": 1, "s": st([w, h]), "p": st(list(p)), "r": st(r)}


def ellipse(w, h=None, p=(0, 0)):
    return {"ty": "el", "d": 1, "s": st([w, h or w]), "p": st(list(p))}


def path(points, closed=False, tangents=None):
    n = len(points)
    ins = outs = [[0, 0]] * n
    if tangents:
        ins, outs = tangents
    return {"ty": "sh", "ks": st({"c": closed, "v": [list(p) for p in points], "i": ins, "o": outs})}


def fill(color, o=100):
    return {"ty": "fl", "c": st(rgb(color)), "o": o if isinstance(o, dict) else st(o), "r": 1}


def stroke(color, w=6, o=100):
    return {"ty": "st", "c": st(rgb(color)), "o": o if isinstance(o, dict) else st(o), "w": st(w), "lc": 2, "lj": 2, "ml": 4}


def trim(e):
    return {"ty": "tm", "s": st(0), "e": e if isinstance(e, dict) else st(e), "o": st(0), "m": 1}


def group(items, t=None):
    return {"ty": "gr", "it": items + [t or tr()]}


class Scene:
    def __init__(self, name: str, op: int, w: int = 256, h: int = 256, fr: int = 60):
        self.d = {"v": "5.7.4", "fr": fr, "ip": 0, "op": op, "w": w, "h": h, "nm": name, "ddd": 0, "assets": [], "layers": []}
        self._ind = 0

    def layer(self, name, shapes, p=None, s=None, o=None, r=None, a=(0, 0)):
        """Layers are listed top-first; add the foreground first."""
        self._ind += 1
        w, h = self.d["w"], self.d["h"]
        ks = {"o": o if isinstance(o, dict) else st(100), "r": r if isinstance(r, dict) else st(0),
              "p": p if isinstance(p, dict) else st(list(p or (w / 2, h / 2)) + [0]),
              "a": st(list(a) + [0]), "s": s if isinstance(s, dict) else st([100, 100, 100])}
        self.d["layers"].append({"ddd": 0, "ind": self._ind, "ty": 4, "nm": name, "sr": 1, "ks": ks, "ao": 0,
                                 "shapes": shapes, "ip": 0, "op": self.d["op"], "st": 0, "bm": 0})
        return self

    def save(self, path_out: str):
        txt = json.dumps(self.d, separators=(",", ":"))
        open(path_out, "w").write(txt)
        return len(txt)
