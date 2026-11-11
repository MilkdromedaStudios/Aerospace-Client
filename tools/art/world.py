"""In-world Aerospace art: sky bodies, End sky and the space painting set."""
import numpy as np
from PIL import Image
from aero_common import (fbm3, tile_noise2, smoothstep, normalize, to_image, rgb, lerp,
                         CYAN, CYAN_HI, NAVY_0, WHITE, AMBER)


def _disc_grid(size, ss=6):
    n = size * ss
    ys, xs = np.mgrid[0:n, 0:n]
    c = (n - 1) / 2.0
    return (xs - c) / ss, (ys - c) / ss, ss


def _down(arr, size, ss):
    return arr.reshape(size, ss, size, ss, arr.shape[-1]).mean(axis=(1, 3))


def sun():
    """32x32 star with a hot core and soft corona (drawn additively in game)."""
    x, y, ss = _disc_grid(32)
    r = np.sqrt(x * x + y * y)
    ang = np.arctan2(y, x)
    core = np.clip((5.2 - r) / 0.8, 0, 1)
    corona = np.exp(-np.clip(r - 4.5, 0, None) / 2.6)
    rays = (np.cos(ang * 4) * 0.5 + 0.5) ** 6 * np.exp(-np.clip(r - 4.5, 0, None) / 4.0)
    col = (rgb((255, 250, 232))[None, None] * core[..., None]
           + rgb((255, 204, 120))[None, None] * (corona * (1 - core))[..., None] * 0.85
           + rgb((255, 232, 180))[None, None] * (rays * (1 - core))[..., None] * 0.55)
    return to_image(_down(col, 32, ss))


def moon_phase(index):
    """Ringed ice world replacing the Moon. index 0 = full, 4 = new (vanilla order)."""
    x, y, ss = _disc_grid(32)
    R = 7.4
    r = np.sqrt(x * x + y * y)
    inside = r < R
    nz = np.sqrt(np.clip(R * R - r * r, 0, None)) / R
    n = np.stack([x / R, -y / R, nz], axis=-1)
    # phase: light direction sweeps around the planet
    phase = index / 8.0 * 2 * np.pi
    light = normalize(np.array([np.sin(phase), 0.18, np.cos(phase)]))
    ndl = np.clip(n @ light, 0, 1)
    lat = n[..., 1] + (fbm3(n * 3.0 + 7.0, 3, 31) - 0.5) * 0.25
    band = np.sin(lat * 13.0) * 0.5 + 0.5
    col = lerp(rgb((120, 196, 232)), rgb((224, 246, 255)), band[..., None])
    col = lerp(col, rgb((86, 128, 214)), smoothstep(0.55, 0.9, fbm3(n * 5.0, 3, 47))[..., None] * 0.6)
    body = col * (0.05 + 0.95 * ndl[..., None])
    limb = np.clip((R - r) / 0.9, 0, 1)
    out = body * (inside * limb)[..., None]
    # ring (tilted ellipse), lit like the planet's day side
    tilt = -0.38
    ct, st = np.cos(tilt), np.sin(tilt)
    u = (x * ct + y * st) / 13.6
    v = (-x * st + y * ct) / 3.4
    er = np.sqrt(u * u + v * v)
    ring = np.clip((0.16 - np.abs(er - 0.86)) / 0.05, 0, 1)
    ring *= 0.55 + 0.45 * (np.sin(er * 60.0) * 0.5 + 0.5)
    front = (v > 0) | ~inside
    ring_light = 0.18 + 0.82 * np.clip(np.cos(phase) * 0.5 + 0.5 + 0.25 * np.sin(phase) * np.sign(u), 0, 1)
    ring_rgb = rgb((214, 228, 255))[None, None] * ring_light[..., None]
    a = (ring * front)[..., None]
    out = out * (1 - a) + ring_rgb * a
    return to_image(_down(out, 32, ss))


MOON_FILES = ["full_moon", "waning_gibbous", "third_quarter", "waning_crescent",
              "new_moon", "waxing_crescent", "first_quarter", "waxing_gibbous"]


def end_sky():
    """128x128 tileable deep-space tile (the game multiplies it by a dark tint)."""
    n1 = tile_noise2(128, 128, 4, 3)
    n2 = tile_noise2(128, 128, 8, 5)
    n3 = tile_noise2(128, 128, 16, 8)
    cloud = n1 * 0.55 + n2 * 0.3 + n3 * 0.15
    col = lerp(rgb((26, 20, 64)), rgb((112, 70, 190)), smoothstep(0.35, 0.75, cloud)[..., None])
    col = lerp(col, rgb((40, 150, 200)), (smoothstep(0.6, 0.85, n2) * 0.45)[..., None])
    rng = np.random.default_rng(21)
    for _ in range(170):
        x, y = rng.integers(0, 128, 2)
        b = rng.uniform(0.6, 1.0)
        col[y, x] = rgb(WHITE) * b
        if b > 0.93:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                col[(y + dy) % 128, (x + dx) % 128] = lerp(col[(y + dy) % 128, (x + dx) % 128], rgb(CYAN_HI), 0.6)
    return to_image(col)


# ------------------------------------------------------------- paintings --
def _stars(col, rng, count, bright=(0.5, 1.0)):
    h, w = col.shape[:2]
    for _ in range(count):
        x, y = rng.integers(0, w), rng.integers(0, h)
        col[y, x] = np.maximum(col[y, x], rgb(WHITE) * rng.uniform(*bright))


def _pixelate(img, block):
    w, h = img.size
    return img.resize((w // block, h // block), Image.BOX).resize((w, h), Image.NEAREST)


def painting_nebula(size=64):
    ys, xs = np.mgrid[0:size, 0:size] / size
    p = np.stack([xs * 3.0, ys * 3.0, xs * 0 + 0.5], axis=-1)
    n1, n2 = fbm3(p, 5, 301), fbm3(p * 1.7 + 4.0, 5, 317)
    col = np.zeros((size, size, 3)) + rgb((6, 6, 20))
    col += rgb((180, 60, 200))[None, None] * smoothstep(0.42, 0.75, n1)[..., None] * 0.8
    col += rgb((40, 170, 220))[None, None] * smoothstep(0.48, 0.8, n2)[..., None] * 0.7
    col += rgb((255, 190, 120))[None, None] * (smoothstep(0.6, 0.85, n1) * smoothstep(0.55, 0.8, n2))[..., None]
    _stars(col, np.random.default_rng(1), 60)
    return to_image(col)


def painting_ringed_giant(size=64):
    ys, xs = np.mgrid[0:size, 0:size]
    col = np.zeros((size, size, 3)) + rgb((5, 7, 22))
    _stars(col, np.random.default_rng(2), 45)
    cx, cy, R = size * 0.5, size * 0.52, size * 0.24
    dx, dy = xs - cx, ys - cy
    r = np.sqrt(dx * dx + dy * dy)
    inside = r < R
    shade = np.clip(0.75 - (dx * 0.7 + dy * 0.5) / R * 0.5, 0.08, 1)
    band = np.sin((dy / R) * 9.0 + np.sin(dx / R * 2) * 0.6) * 0.5 + 0.5
    pcol = lerp(rgb((226, 170, 96)), rgb((150, 86, 70)), band[..., None]) * shade[..., None]
    u = (dx * 0.94 + dy * 0.34) / (R * 2.0)
    v = (-dx * 0.34 + dy * 0.94) / (R * 0.5)
    er = np.sqrt(u * u + v * v)
    ring = (np.abs(er - 0.86) < 0.15) & ~((np.abs(er - 0.84) < 0.025))
    behind = ring & (v <= 0) & ~inside
    col[behind] = rgb((206, 190, 160)) * 0.7
    col[inside] = pcol[inside]
    front = ring & (v > 0)
    col[front] = rgb((236, 220, 184))
    return to_image(col)


def painting_liftoff(size=64):
    ys, xs = np.mgrid[0:size, 0:size]
    t = (ys / (size - 1))[..., None]
    col = lerp(rgb((8, 10, 40)), rgb((250, 130, 70)), np.clip(t * 1.25 - 0.2, 0, 1) ** 1.6)
    _stars(col[: size // 2], np.random.default_rng(3), 30, (0.4, 0.9))
    ground = ys > size * 0.86
    col[ground] = rgb((22, 18, 30))
    cx = size * 0.5
    # exhaust plume
    plume = np.exp(-((xs - cx) / (2.0 + (ys - size * 0.42).clip(0) * 0.16)) ** 2) * (ys > size * 0.44) * (~ground)
    col = lerp(col, np.zeros_like(col) + rgb((255, 236, 170)), (plume * 0.95)[..., None])
    smoke = (fbm3(np.stack([xs / 9.0, ys / 9.0, xs * 0], axis=-1), 4, 333) > 0.52) & (ys > size * 0.74) & (~ground) \
        & (np.abs(xs - cx) < size * 0.42)
    col[smoke] = rgb((226, 214, 214))
    # rocket body
    body = (np.abs(xs - cx) < size * 0.045) & (ys > size * 0.16) & (ys < size * 0.44)
    nose = (np.abs(xs - cx) < (ys - size * 0.08) * 0.55) & (ys >= size * 0.08) & (ys <= size * 0.16)
    fins = (np.abs(xs - cx) < size * 0.045 + (ys - size * 0.36).clip(0) * 0.9) & (ys > size * 0.36) & (ys < size * 0.44)
    col[fins] = rgb((210, 60, 60))
    col[body] = rgb((238, 240, 248))
    col[nose] = rgb((210, 60, 60))
    stripe = body & (np.abs(ys - size * 0.26) < size * 0.02)
    col[stripe] = rgb(CYAN)
    return to_image(col)


def painting_blue_marble(size=64):
    ys, xs = np.mgrid[0:size, 0:size]
    col = np.zeros((size, size, 3)) + rgb((2, 3, 10))
    _stars(col, np.random.default_rng(4), 40)
    cx, cy, R = size * 0.5, size * 0.5, size * 0.36
    dx, dy = (xs - cx) / R, (ys - cy) / R
    r2 = dx * dx + dy * dy
    inside = r2 < 1
    nz = np.sqrt(np.clip(1 - r2, 0, None))
    n = np.stack([dx, dy, nz], axis=-1)
    land = fbm3(n * 2.2 + 3.0, 5, 351)
    pcol = lerp(rgb((16, 60, 150)), rgb((30, 110, 200)), smoothstep(0.3, 0.52, land)[..., None])
    pcol = lerp(pcol, rgb((56, 140, 70)), smoothstep(0.53, 0.56, land)[..., None])
    pcol = lerp(pcol, rgb((186, 160, 104)), smoothstep(0.62, 0.7, land)[..., None])
    clouds = smoothstep(0.56, 0.75, fbm3(n * 4.0 + 20.0, 5, 367))
    pcol = lerp(pcol, rgb(WHITE), (clouds * 0.9)[..., None])
    light = np.clip(n @ normalize(np.array([-0.55, -0.45, 0.7])), 0.04, 1)
    col[inside] = (pcol * light[..., None])[inside]
    halo = np.exp(-np.clip(np.sqrt(r2) - 1, 0, None) * 14) * (~inside)
    col += rgb((70, 150, 255))[None, None] * halo[..., None] * 0.6
    return to_image(col)


PAINTINGS = {
    # name: (generator, width blocks, height blocks)
    "aerospace_nebula": (painting_nebula, 2, 2),
    "aerospace_ringed_giant": (painting_ringed_giant, 2, 2),
    "aerospace_liftoff": (painting_liftoff, 2, 2),
    "aerospace_blue_marble": (painting_blue_marble, 2, 2),
}


def save_all(root):
    import os
    tex = os.path.join(root, "assets/minecraft/textures")
    os.makedirs(os.path.join(tex, "environment/celestial/moon"), exist_ok=True)
    os.makedirs(os.path.join(tex, "painting"), exist_ok=True)
    sun().save(os.path.join(tex, "environment/celestial/sun.png"), optimize=True)
    for i, name in enumerate(MOON_FILES):
        moon_phase(i).save(os.path.join(tex, "environment/celestial/moon", name + ".png"), optimize=True)
    end_sky().save(os.path.join(tex, "environment/end_sky.png"), optimize=True)
    for name, (gen, w, h) in PAINTINGS.items():
        img = gen(256)
        img = img.resize((w * 32, h * 32), Image.BOX)         # 32px per block, crisp pixels
        img.save(os.path.join(tex, "painting", name + ".png"), optimize=True)
    return 10 + len(PAINTINGS)
