"""Pixel art for the expansion: item icons, worn equipment and mob variants.

Item icons and equipment are drawn from scratch. Mob variant skins are new
colours and patterns; the stock skin is only used as a layout guide (which
pixels belong to the model, and where the eyes and similar dark features sit).
"""
import os
import random

import numpy as np
from PIL import Image

from common import UPSTREAM, write_bytes


def _png(img):
    import io
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def save(path, img):
    write_bytes(path, _png(img))


def hexc(h, a=255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


class Canvas:
    def __init__(self, w, h):
        self.a = np.zeros((h, w, 4), dtype=np.uint8)

    def px(self, x, y, c):
        if 0 <= x < self.a.shape[1] and 0 <= y < self.a.shape[0]:
            self.a[y, x] = c

    def rect(self, x0, y0, x1, y1, c):
        """Fill [x0, x1) x [y0, y1)."""
        self.a[y0:y1, x0:x1] = c

    def image(self):
        return Image.fromarray(self.a, "RGBA")


def shade(c, f):
    return (max(0, min(255, int(c[0] * f))), max(0, min(255, int(c[1] * f))), max(0, min(255, int(c[2] * f))), c[3])


# --------------------------------------------------------------- item icons --
def icon_rocket():
    c = Canvas(16, 16)
    body, body_d, red, red_d, glass, flame, flame2, outline = (hexc("#f2f4f8"), hexc("#b8c0cc"), hexc("#e8483c"),
        hexc("#9c2a22"), hexc("#3fd0ff"), hexc("#ffb84d"), hexc("#fff3b0"), hexc("#1b2236"))
    # rocket points to the top-right; draw along the diagonal
    for i in range(3, 12):
        x, y = i, 15 - i
        for d in (-1, 0, 1):
            c.px(x + d, y, body if d <= 0 else body_d)
            c.px(x, y - d, body if d <= 0 else body_d)
    for i in range(11, 14):                     # nose cone
        c.px(i, 15 - i, red)
        c.px(i - 1, 15 - i, red_d)
    c.px(13, 1, red)
    c.px(14, 1, red_d)
    c.px(13, 2, red)
    c.px(7, 8, glass)                           # porthole
    c.px(8, 7, glass)
    c.px(8, 8, shade(glass, 0.7))
    for (x, y) in ((2, 10), (3, 10), (5, 13), (5, 12), (2, 11), (4, 13)):   # fins
        c.px(x, y, red)
    c.px(2, 12, red_d)
    c.px(3, 13, red_d)
    for (x, y, col) in ((1, 14, flame), (2, 13, flame2), (0, 15, flame), (1, 15, flame2), (0, 14, flame)):
        c.px(x, y, col)
    # dark outline around opaque pixels for legibility
    a = c.a.copy()
    for y in range(16):
        for x in range(16):
            if a[y, x, 3] == 0:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < 16 and 0 <= yy < 16 and a[yy, xx, 3] and tuple(a[yy, xx]) not in (flame, flame2):
                        c.px(x, y, outline)
                        break
    return c.image()


def icon_fuel():
    c = Canvas(16, 16)
    can, can_d, can_l, stripe, black, cap, outline = (hexc("#e8572e"), hexc("#a8381c"), hexc("#ff8a5c"), hexc("#ffd23f"),
        hexc("#1b1b22"), hexc("#9aa4b4"), hexc("#2a1410"))
    c.rect(4, 4, 12, 15, can)
    c.rect(4, 4, 5, 15, can_l)
    c.rect(11, 4, 12, 15, can_d)
    c.rect(4, 8, 12, 11, stripe)
    for x in range(4, 12, 2):
        c.px(x, 9, black)
        c.px(x + 1, 10, black)
    c.rect(6, 2, 10, 4, cap)
    c.rect(7, 1, 9, 2, cap)
    c.px(9, 2, shade(cap, 0.7))
    for x in range(3, 13):
        c.px(x, 15, outline)
    for y in range(4, 15):
        c.px(3, y, outline)
        c.px(12, y, outline)
    c.rect(4, 3, 12, 4, outline)
    return c.image()


def _armor_icon(kind):
    c = Canvas(16, 16)
    white, grey, dark, orange, visor, gold = (hexc("#eef1f6"), hexc("#b9c1cd"), hexc("#596273"), hexc("#ff8a3d"),
        hexc("#3fa9d8"), hexc("#ffc84a"))
    outline = hexc("#1c2230")
    if kind == "helmet":
        c.rect(3, 3, 13, 13, white)
        c.rect(2, 5, 14, 12, white)
        c.rect(4, 2, 12, 3, white)
        c.rect(4, 6, 12, 11, visor)
        c.rect(5, 6, 8, 8, shade(visor, 1.45))
        c.rect(4, 11, 12, 13, grey)
        c.rect(6, 12, 10, 13, orange)
        c.rect(4, 6, 12, 7, gold)
    elif kind == "chestplate":
        c.rect(2, 2, 14, 6, white)
        c.rect(4, 2, 12, 14, white)
        c.rect(2, 6, 4, 10, grey)
        c.rect(12, 6, 14, 10, grey)
        c.rect(6, 5, 10, 9, hexc("#2f6fd8"))
        c.px(7, 6, hexc("#7dff9b"))
        c.px(8, 6, hexc("#ff6f6f"))
        c.rect(4, 11, 12, 12, orange)
        c.rect(6, 2, 10, 3, hexc("#00000000"))
    elif kind == "leggings":
        c.rect(3, 2, 13, 5, white)
        c.rect(3, 5, 7, 14, white)
        c.rect(9, 5, 13, 14, white)
        c.rect(3, 4, 13, 5, orange)
        c.rect(3, 12, 7, 14, grey)
        c.rect(9, 12, 13, 14, grey)
    else:   # boots
        c.rect(2, 7, 7, 14, grey)
        c.rect(9, 7, 14, 14, grey)
        c.rect(2, 7, 7, 9, white)
        c.rect(9, 7, 14, 9, white)
        c.rect(1, 12, 7, 14, dark)
        c.rect(9, 12, 15, 14, dark)
    a = c.a.copy()
    for y in range(16):
        for x in range(16):
            if a[y, x, 3] == 0:
                if any(0 <= x + dx < 16 and 0 <= y + dy < 16 and a[y + dy, x + dx, 3]
                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    c.px(x, y, outline)
    return c.image()


# --------------------------------------------------- worn equipment (64x32) --
# Standard humanoid armor layout: (x, y, w, h) per face for each box.
def _box_faces(u, v, w, h, d):
    return {
        "top": (u + d, v, w, d), "bottom": (u + d + w, v, w, d),
        "right": (u, v + d, d, h), "front": (u + d, v + d, w, h),
        "left": (u + d + w, v + d, d, h), "back": (u + d + w + d, v + d, w, h),
    }


HEAD = _box_faces(0, 0, 8, 8, 8)
BODY = _box_faces(16, 16, 8, 12, 4)
ARM = _box_faces(40, 16, 4, 12, 4)
LEG = _box_faces(0, 16, 4, 12, 4)


def _fill_box(cv, faces, colour_fn):
    for name, (x, y, w, h) in faces.items():
        for j in range(h):
            for i in range(w):
                cv.px(x + i, y + j, colour_fn(name, i, j, w, h))


SUITS = {
    # name: palette + style
    "aerospace_space_suit": dict(base="#eef1f6", seam="#b9c1cd", accent="#ff8a3d", dark="#596273",
                                 visor="#3fa9d8", visor_hi="#9fe4ff", trim="#ffc84a", style="astronaut"),
    "aerospace_martian": dict(base="#5fae3c", seam="#3d7a24", accent="#a8f06a", dark="#2a4a1a",
                              visor="#120a0a", visor_hi="#ff3b3b", trim="#86d25a", style="alien"),
    "aerospace_frost": dict(base="#bfe8ff", seam="#7cc4ee", accent="#ffffff", dark="#4a86b8",
                            visor="#0a2a4a", visor_hi="#6ff2ff", trim="#e8fbff", style="crystal"),
    "aerospace_magma": dict(base="#2a2230", seam="#15101a", accent="#ff7a1a", dark="#0c0810",
                            visor="#1a0500", visor_hi="#ffcc33", trim="#ff4a10", style="magma"),
}


def _suit_colour(p, rng):
    base, seam, accent, dark = hexc(p["base"]), hexc(p["seam"]), hexc(p["accent"]), hexc(p["dark"])
    style = p["style"]

    def fn(part, face, i, j, w, h):
        n = rng.random()
        c = base
        if style == "crystal":
            c = shade(base, 0.9 + 0.2 * ((i * 7 + j * 3) % 5) / 5)
            if (i + j) % 4 == 0:
                c = hexc(p["accent"])
        elif style == "magma":
            c = shade(base, 0.85 + 0.3 * n)
            if (i * 3 + j * 5) % 7 == 0 or (i == j % w):
                c = accent if n > 0.35 else hexc(p["trim"])
        elif style == "alien":
            c = shade(base, 0.85 + 0.25 * n)
            if (i + 2 * j) % 5 == 0:
                c = hexc(p["seam"])
        else:   # astronaut fabric with seams
            c = shade(base, 0.96 + 0.06 * n)
            if j % 4 == 3 or i == 0 or i == w - 1:
                c = seam
        if part in ("arm", "leg") and face != "top" and j >= h - 3:
            c = dark                                       # gloves / boot soles
        if part == "body" and face == "front" and style == "astronaut":
            if j in (h - 4,):
                c = accent                                 # belt stripe
            if 2 <= i <= 5 and 2 <= j <= 5:
                c = hexc("#2f6fd8")                        # chest control panel
                if (i, j) == (3, 3):
                    c = hexc("#7dff9b")
                if (i, j) == (4, 3):
                    c = hexc("#ff6f6f")
        if part == "body" and face == "back" and style == "astronaut":
            if 1 <= i <= 6 and 1 <= j <= 8:
                c = shade(base, 0.82) if (i + j) % 3 else seam   # life-support pack
        if part in ("arm", "leg") and style == "astronaut" and j == 2 and face != "top":
            c = accent                                     # shoulder / thigh stripe
        return c
    return fn


def _helmet(cv, p, rng):
    base, seam, visor, visor_hi, trim = (hexc(p["base"]), hexc(p["seam"]), hexc(p["visor"]),
                                         hexc(p["visor_hi"]), hexc(p["trim"]))
    style = p["style"]

    def fn(face, i, j, w, h):
        c = shade(base, 0.95 + 0.08 * rng.random())
        if face == "front":
            if style == "astronaut":
                if 1 <= i <= 6 and 2 <= j <= 6:
                    c = visor
                    if i <= 2 and j <= 3:
                        c = visor_hi
                if j == 1 and 1 <= i <= 6:
                    c = trim
            elif style == "alien":
                c = shade(base, 1.05)
                if j in (3, 4) and i in (1, 2, 5, 6):
                    c = visor                              # big dark eyes
                if j == 3 and i in (2, 5):
                    c = visor_hi                           # red glint
                if j == 6 and 3 <= i <= 4:
                    c = hexc(p["seam"])
            else:
                if j == 4 and 1 <= i <= 6:
                    c = visor
                    if i in (2, 5):
                        c = visor_hi                       # glowing eye slit
        if face == "top" and style == "crystal" and (i + j) % 3 == 0:
            c = hexc(p["accent"])
        if face == "top" and style == "alien" and i in (2, 5) and j in (2, 3):
            c = hexc(p["accent"])
        if face in ("left", "right") and style == "astronaut" and 2 <= j <= 5 and 2 <= i <= 5:
            c = seam                                       # side vents
        return c
    for name, (x, y, w, h) in HEAD.items():
        for j in range(h):
            for i in range(w):
                cv.px(x + i, y + j, fn(name, i, j, w, h))


def suit_textures(name):
    p = SUITS[name]
    rng = random.Random(name)
    layer = Canvas(64, 32)
    _helmet(layer, p, rng)
    col = _suit_colour(p, rng)
    _fill_box(layer, BODY, lambda f, i, j, w, h: col("body", f, i, j, w, h))
    _fill_box(layer, ARM, lambda f, i, j, w, h: col("arm", f, i, j, w, h))
    _fill_box(layer, LEG, lambda f, i, j, w, h: col("leg", f, i, j, w, h))     # boots
    legs = Canvas(64, 32)
    _fill_box(legs, LEG, lambda f, i, j, w, h: col("leg", f, i, j, w, h))
    _fill_box(legs, BODY, lambda f, i, j, w, h: col("body", f, i, j, w, h) if j >= h - 5 else (0, 0, 0, 0))
    return layer.image(), legs.image()


# ------------------------------------------------------------ mob variants --
def _value_noise(w, h, cells, seed):
    rng = np.random.default_rng(seed)
    g = rng.random((cells + 1, cells + 1))
    ys, xs = np.mgrid[0:h, 0:w]
    fx, fy = xs / w * cells, ys / h * cells
    x0, y0 = np.floor(fx).astype(int), np.floor(fy).astype(int)
    tx, ty = fx - x0, fy - y0
    tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
    a = g[y0, x0] * (1 - tx) + g[y0, x0 + 1] * tx
    b = g[y0 + 1, x0] * (1 - tx) + g[y0 + 1, x0 + 1] * tx
    return a * (1 - ty) + b * ty


VARIANTS = {
    # palette: base, secondary, spot, feature (eyes etc.)
    "moon": dict(base="#c9cdd6", second="#8e95a3", spot="#5b6170", feature="#1a1d26", glow=None, spots=0.62, seed=11),
    "mars": dict(base="#d0653a", second="#9c3f22", spot="#5a2414", feature="#1c0c06", glow=None, spots=0.66, seed=12),
    "glacio": dict(base="#eaf6ff", second="#a8dcf5", spot="#5cc0ee", feature="#0e3a5a", glow="#6ff2ff", spots=0.7, seed=13),
}


def variant_texture(vanilla_rel, variant):
    """New skin painted over the stock skin's layout."""
    src = Image.open(os.path.join(UPSTREAM, "assets/minecraft/textures", vanilla_rel)).convert("RGBA")
    a = np.array(src).astype(np.float64)
    h, w = a.shape[:2]
    mask = a[..., 3] > 0
    lum = (0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2])
    p = VARIANTS[variant]
    n1 = _value_noise(w, h, max(2, w // 8), p["seed"])
    n2 = _value_noise(w, h, max(2, w // 4), p["seed"] + 1)
    base, second, spot = (np.array(hexc(p[k])[:3], dtype=np.float64) for k in ("base", "second", "spot"))
    t = np.clip(n1 * 1.3 - 0.15, 0, 1)[..., None]
    out = base * (1 - t) + second * t
    spots = (n2 > p["spots"])[..., None]
    out = np.where(spots, spot, out)
    out *= (0.92 + 0.16 * _value_noise(w, h, w // 2, p["seed"] + 2))[..., None]
    # keep the model's dark details (eyes, nostrils, hooves) in place, in our colours
    if mask.any():
        dark_cut = np.percentile(lum[mask], 6)
        features = mask & (lum <= dark_cut)
        feat = np.array(hexc(p["feature"])[:3], dtype=np.float64)
        out[features] = feat
        if p["glow"]:
            glow = np.array(hexc(p["glow"])[:3], dtype=np.float64)
            very = mask & (lum <= np.percentile(lum[mask], 2))
            out[very] = glow
    res = np.zeros((h, w, 4), dtype=np.uint8)
    res[..., :3] = np.clip(out, 0, 255).astype(np.uint8)
    res[..., 3] = np.where(mask, 255, 0)
    return Image.fromarray(res, "RGBA")


def generate():
    save("assets/minecraft/textures/item/aerospace_rocket.png", icon_rocket())
    save("assets/minecraft/textures/item/aerospace_fuel.png", icon_fuel())
    for kind in ("helmet", "chestplate", "leggings", "boots"):
        save("assets/minecraft/textures/item/aerospace_space_%s.png" % kind, _armor_icon(kind))
    for name in SUITS:
        layer, legs = suit_textures(name)
        save("assets/minecraft/textures/entity/equipment/humanoid/%s.png" % name, layer)
        save("assets/minecraft/textures/entity/equipment/humanoid_leggings/%s.png" % name, legs)
    for mob, variant in (("cow", "moon"), ("pig", "mars"), ("chicken", "glacio")):
        for suffix in ("", "_baby"):
            img = variant_texture("entity/%s/%s_temperate%s.png" % (mob, mob, suffix), variant)
            save("assets/minecraft/textures/entity/%s/%s_%s%s.png" % (mob, mob, variant, suffix), img)
