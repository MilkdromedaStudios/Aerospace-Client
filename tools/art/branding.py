"""Aerospace Client wordmark, emblem and loading-overlay logo."""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from aero_common import (text_mask, dilate, blur, to_image, rgb, lerp, smoothstep, alpha_over,
                         CYAN, CYAN_HI, NAVY_0, NAVY_1, NAVY_2, VIOLET, AMBER, WHITE)


def shear_mask(mask, shear):
    """Italic shear: shift rows right proportionally to their height above the baseline."""
    h, w = mask.shape
    pad = int(abs(shear) * h) + 2
    out = np.zeros((h, w + pad), dtype=bool)
    for y in range(h):
        off = int(round((h - 1 - y) * shear))
        out[y, off:off + w] = mask[y]
    return out


def wordmark(text, cell, shear=0.2, depth=None, outline=None):
    """Chunky extruded wordmark -> RGBA float array (tight bounding box)."""
    depth = depth if depth is not None else max(2, cell // 2)
    outline = outline if outline is not None else max(1, cell // 4)
    face = shear_mask(text_mask(text, cell=cell, spacing=1), shear)
    h, w = face.shape
    pad = outline + depth + 2
    H, W = h + pad * 2, w + pad * 2
    canvas = np.zeros((H, W, 4))
    f = np.zeros((H, W), dtype=bool)
    f[pad:pad + h, pad:pad + w] = face

    # extrusion: union of the face shifted down-right
    ext = np.zeros_like(f)
    for d in range(1, depth + 1):
        ext[d:, d:] |= f[:-d, :-d]
    solid = f | ext
    edge = dilate(solid, outline)

    ys = np.mgrid[0:H, 0:W][0]
    t = np.clip((ys - pad) / max(h - 1, 1), 0, 1)

    alpha_over(canvas, rgb((2, 6, 20)), edge.astype(float))                       # outline
    ext_col = lerp(rgb((18, 60, 150)), rgb((8, 22, 70)), t[..., None])
    alpha_over(canvas, ext_col, ext.astype(float))                                 # extruded side
    grad = np.where(t[..., None] < 0.55,
                    lerp(rgb((244, 253, 255)), rgb(CYAN), (t / 0.55)[..., None]),
                    lerp(rgb(CYAN), rgb((52, 110, 232)), ((t - 0.55) / 0.45)[..., None]))
    alpha_over(canvas, grad, f.astype(float))                                      # face
    # bevel: bright top edges, darker bottom edges
    bevel = max(1, cell // 6)
    up = np.zeros_like(f)
    up[bevel:, :] = f[:-bevel, :]
    top_edge = f & ~up
    down = np.zeros_like(f)
    down[:-bevel, :] = f[bevel:, :]
    bottom_edge = f & ~down
    alpha_over(canvas, rgb(WHITE), top_edge.astype(float) * 0.85)
    alpha_over(canvas, rgb((20, 60, 170)), bottom_edge.astype(float) * 0.55)
    # scanline sheen
    sheen = ((ys // max(1, cell // 4)) % 2 == 0) & f
    alpha_over(canvas, rgb(WHITE), sheen.astype(float) * 0.06)
    return canvas


def paste(dst, src, x, y):
    """Alpha-composite RGBA float `src` onto `dst` at (x, y), clipping to bounds."""
    h, w = src.shape[:2]
    x0, y0 = max(x, 0), max(y, 0)
    x1, y1 = min(x + w, dst.shape[1]), min(y + h, dst.shape[0])
    if x0 >= x1 or y0 >= y1:
        return
    s = src[y0 - y:y1 - y, x0 - x:x1 - x]
    alpha_over(dst[y0:y1, x0:x1], s[..., :3], s[..., 3])


def orbit_swoosh(w, h, cx, cy, rx, ry, tilt, width, color, front=None):
    """Anti-aliased tilted ellipse ring -> alpha array. `front` keeps only one half."""
    ss = 3
    ys, xs = np.mgrid[0:h * ss, 0:w * ss] / ss
    dx, dy = xs - cx, ys - cy
    ct, st = np.cos(tilt), np.sin(tilt)
    u = (dx * ct + dy * st) / rx
    v = (-dx * st + dy * ct) / ry
    r = np.sqrt(u * u + v * v)
    a = np.clip(1.0 - np.abs(r - 1.0) * min(rx, ry) / width, 0, 1)
    # taper so it reads as a motion trail
    ang = np.arctan2(v, u)
    a = a * (0.35 + 0.65 * (np.cos(ang - 0.6) * 0.5 + 0.5))
    if front is True:
        a = a * (v > 0)
    elif front is False:
        a = a * (v <= 0)
    return a.reshape(h, ss, w, ss).mean(axis=(1, 3))


def title_logo(text="AEROSPACE", easter_egg=False):
    """1024x256 title texture; the game shows the top 176 rows."""
    W, H, VIS = 1024, 256, 176
    canvas = np.zeros((H, W, 4))
    cell = 15
    wm = wordmark(text, cell)
    x = (W - wm.shape[1]) // 2
    y = (VIS - wm.shape[0]) // 2 + 6
    cx, cy = W / 2, y + wm.shape[0] / 2
    back = orbit_swoosh(W, H, cx, cy, 470, 62, -0.10, 5.0, CYAN, front=False)
    alpha_over(canvas, rgb(CYAN), back * 0.75)
    glow = blur(np.pad(wm[..., 3], ((y, H - y - wm.shape[0]), (x, W - x - wm.shape[1]))), 9)
    alpha_over(canvas, rgb((30, 150, 255)), np.clip(glow * 0.55, 0, 1))
    paste(canvas, wm, x, y)
    front = orbit_swoosh(W, H, cx, cy, 470, 62, -0.10, 5.0, CYAN, front=True)
    alpha_over(canvas, rgb(CYAN_HI), front * 0.9)
    # little spacecraft riding the orbit
    px, py = cx + 470 * np.cos(0.52) * np.cos(-0.10) - 62 * np.sin(0.52) * np.sin(-0.10), \
        cy + 470 * np.cos(0.52) * np.sin(-0.10) + 62 * np.sin(0.52) * np.cos(-0.10)
    ys, xs = np.mgrid[0:H, 0:W]
    d = np.sqrt((xs - px) ** 2 + (ys - py) ** 2)
    alpha_over(canvas, rgb((120, 220, 255)), np.clip(1.0 - d / 16.0, 0, 1) ** 2 * 0.8)
    alpha_over(canvas, rgb(WHITE), np.clip(5.5 - d, 0, 1))
    if easter_egg:
        # rare "minceraft" variant: the craft has swung to the other side
        canvas[:, :, :3] = canvas[:, ::-1, :3][:, ::-1]
    canvas[VIS:, :, 3] = 0.0
    return to_image(canvas)


def edition_logo(text="CLIENT 26.3"):
    """512x64 subtitle texture; the game shows the top 56 rows."""
    W, H, VIS = 512, 64, 56
    canvas = np.zeros((H, W, 4))
    cell = 5
    mask = text_mask(text, cell=cell, spacing=1)
    h, w = mask.shape
    x, y = (W - w) // 2, (VIS - h) // 2 + 1
    f = np.zeros((H, W), dtype=bool)
    f[y:y + h, x:x + w] = mask
    plate = np.zeros((H, W))
    px0, px1, py0, py1 = x - 26, x + w + 26, y - 8, y + h + 8
    ys, xs = np.mgrid[0:H, 0:W]
    inside = (xs >= px0) & (xs < px1) & (ys >= py0) & (ys < py1)
    # clipped corners
    cut = 8
    inside &= ((xs - px0) + (ys - py0) >= cut) & ((px1 - 1 - xs) + (py1 - 1 - ys) >= cut)
    border = inside & ~np.array(Image.fromarray((inside * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5))) .astype(bool)
    alpha_over(canvas, rgb(NAVY_1), inside.astype(float) * 0.86)
    alpha_over(canvas, rgb(CYAN), border.astype(float) * 0.95)
    shadow = np.zeros_like(f)
    shadow[2:, 2:] = f[:-2, :-2]
    alpha_over(canvas, rgb((0, 20, 60)), shadow.astype(float) * 0.9)
    t = np.clip((ys - y) / max(h - 1, 1), 0, 1)
    alpha_over(canvas, lerp(rgb(WHITE), rgb(CYAN_HI), t[..., None]), f.astype(float))
    canvas[VIS:, :, 3] = 0.0
    return to_image(canvas)


def emblem(size, background=True, mono=False):
    """Round mission-patch emblem: ringed planet + ascending craft."""
    ss = 4
    n = size * ss
    ys, xs = np.mgrid[0:n, 0:n]
    cx = cy = (n - 1) / 2.0
    x = (xs - cx) / (n / 2.0)
    y = (ys - cy) / (n / 2.0)
    r = np.sqrt(x * x + y * y)
    canvas = np.zeros((n, n, 4))
    aa = 2.0 / n

    def disc(rad, ox=0.0, oy=0.0):
        d = np.sqrt((x - ox) ** 2 + (y - oy) ** 2)
        return np.clip((rad - d) / aa, 0, 1)

    white = rgb(WHITE)
    if background:
        bg = lerp(rgb(NAVY_2), rgb(NAVY_0), np.clip(r, 0, 1)[..., None])
        if not mono:
            alpha_over(canvas, bg, disc(0.97))
            rng = np.random.default_rng(5)
            for _ in range(46):
                sx, sy = rng.uniform(-0.85, 0.85, 2)
                if sx * sx + sy * sy < 0.8:
                    alpha_over(canvas, white, disc(rng.uniform(0.008, 0.02), sx, sy) * rng.uniform(0.4, 1.0))
        ring_col = white if mono else rgb(CYAN)
        alpha_over(canvas, ring_col, np.clip(disc(0.97) - disc(0.915), 0, 1))

    # planet
    pr = 0.40
    planet = disc(pr)
    if mono:
        alpha_over(canvas, white, planet)
    else:
        shade = np.clip(0.55 - (x * 0.6 + y * 0.5), 0, 1)
        pcol = lerp(rgb((20, 70, 170)), rgb(CYAN_HI), shade[..., None])
        band = (np.sin((y - x * 0.2) * 22.0) * 0.5 + 0.5)[..., None]
        pcol = pcol * (0.86 + 0.14 * band)
        alpha_over(canvas, pcol, planet)

    # ring around the planet (tilted ellipse), behind on top / in front below
    tilt = -0.42
    ct, st = np.cos(tilt), np.sin(tilt)
    u = (x * ct + y * st) / 0.74
    v = (-x * st + y * ct) / 0.20
    er = np.sqrt(u * u + v * v)
    band = np.clip((0.11 - np.abs(er - 1.0)) / 0.02, 0, 1)
    in_front = (v > 0) | (planet < 0.5)
    ring_rgb = white if mono else rgb(AMBER)
    if mono:
        # knock a gap out of the planet so the ring reads in one colour
        gap = np.clip((0.19 - np.abs(er - 1.0)) / 0.02, 0, 1) * (v > 0)
        canvas[..., 3] *= (1.0 - gap * planet)
    alpha_over(canvas, ring_rgb, band * in_front)

    # ascending craft: a chevron/delta shape top-right with a trail
    ax, ay = 0.46, -0.50
    ang = -0.9
    ca, sa = np.cos(ang), np.sin(ang)
    lx = (x - ax) * ca + (y - ay) * sa
    ly = -(x - ax) * sa + (y - ay) * ca
    body = (np.abs(ly) < (0.11 - lx * 0.55)) & (lx > -0.14) & (lx < 0.2)
    notch = (np.abs(ly) < (-lx - 0.06) * 0.9) & (lx < -0.06)
    craft = (body & ~notch).astype(float)
    craft = np.array(Image.fromarray((craft * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(ss * 0.5))) / 255.0
    trail = np.clip(1.0 - np.abs(ly) / 0.035, 0, 1) * smoothstep(-0.62, -0.14, lx) * (lx < -0.1)
    alpha_over(canvas, white if mono else rgb(CYAN_HI), trail * 0.75)
    alpha_over(canvas, white, craft)

    out = canvas.reshape(size, ss, size, ss, 4)
    a = out[..., 3:4]
    col = (out[..., :3] * a).sum(axis=(1, 3)) / np.maximum(a.sum(axis=(1, 3)), 1e-6)
    return np.concatenate([col, a.mean(axis=(1, 3))], axis=-1)


def loading_logo():
    """512x512 loading-overlay texture: top half = left half of a 1024x256 logo,
    bottom half = right half. Drawn white; the game adds it over the background."""
    W, H = 1024, 256
    canvas = np.zeros((H, W, 4))
    em = emblem(176, background=True, mono=True)
    cell = 11
    mask = text_mask("AEROSPACE", cell=cell, spacing=1)
    sub = text_mask("CLIENT", cell=4, spacing=2)
    total = em.shape[1] + 34 + mask.shape[1]
    x = (W - total) // 2
    paste(canvas, em, x, (H - em.shape[0]) // 2)
    tx = x + em.shape[1] + 34
    ty = (H - (mask.shape[0] + 18 + sub.shape[0])) // 2
    f = np.zeros((H, W))
    f[ty:ty + mask.shape[0], tx:tx + mask.shape[1]] = mask
    sy = ty + mask.shape[0] + 18
    f[sy:sy + sub.shape[0], tx:tx + sub.shape[1]] = sub
    # thin rule to the right of "CLIENT"
    f[sy + sub.shape[0] // 2 - 2:sy + sub.shape[0] // 2 + 2, tx + sub.shape[1] + 16:tx + mask.shape[1]] = 1
    alpha_over(canvas, rgb(WHITE), f)
    canvas[..., :3] = 1.0
    out = np.zeros((512, 512, 4))
    out[:256] = canvas[:, :512]
    out[256:] = canvas[:, 512:]
    return to_image(out)


def badge(size):
    """Square app icon (favicon / pack.png): emblem on a rounded navy tile."""
    canvas = np.zeros((size, size, 4))
    ys, xs = np.mgrid[0:size, 0:size]
    rad = size * 0.22
    dx = np.maximum(np.abs(xs - (size - 1) / 2) - (size / 2 - rad), 0)
    dy = np.maximum(np.abs(ys - (size - 1) / 2) - (size / 2 - rad), 0)
    tile = np.clip(rad - np.sqrt(dx * dx + dy * dy) + 0.5, 0, 1)
    t = (ys / size)[..., None]
    alpha_over(canvas, lerp(rgb(NAVY_2), rgb(NAVY_0), t), tile)
    em = emblem(int(size * 0.9), background=False)
    off = (size - em.shape[0]) // 2
    paste(canvas, em, off, off)
    return to_image(canvas)
