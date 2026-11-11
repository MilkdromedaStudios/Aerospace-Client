"""Title-screen panorama: a seamless deep-space cube map.

The scene is defined on the unit sphere of view directions, so the six faces
join without seams. Face/axis mapping follows the game's cube map loader
(+X=_1, -X=_3, +Y=_5, -Y=_4, +Z=_0, -Z=_2) and its rotationX(pi) model view,
which makes panorama_4 the sky and panorama_5 the floor.
"""
import numpy as np
from aero_common import fbm3, value_noise3, smoothstep, normalize, to_image, rgb, lerp

# suffix -> (axis name) in cube-map (model) space
FACES = {0: "+Z", 1: "+X", 2: "-Z", 3: "-X", 4: "-Y", 5: "+Y"}


def face_dirs(face, size):
    """Model-space direction for every pixel of a cube face (standard GL layout)."""
    v, u = np.mgrid[0:size, 0:size]
    a = (u + 0.5) / size * 2.0 - 1.0
    b = (v + 0.5) / size * 2.0 - 1.0
    one = np.ones_like(a)
    if face == "+X":
        d = (one, -b, -a)
    elif face == "-X":
        d = (-one, -b, a)
    elif face == "+Y":
        d = (a, one, b)
    elif face == "-Y":
        d = (a, -one, -b)
    elif face == "+Z":
        d = (a, -b, one)
    else:
        d = (-a, -b, -one)
    return normalize(np.stack(d, axis=-1))


def project(face, dm, size):
    """Model-space directions (n, 3) -> (px, py, facing) on a cube face."""
    x, y, z = dm[:, 0], dm[:, 1], dm[:, 2]
    with np.errstate(divide="ignore", invalid="ignore"):
        if face == "+X":
            m, a, b = x, -z / x, -y / x
        elif face == "-X":
            m, a, b = -x, z / -x, -y / -x
        elif face == "+Y":
            m, a, b = y, x / y, z / y
        elif face == "-Y":
            m, a, b = -y, x / -y, -z / -y
        elif face == "+Z":
            m, a, b = z, x / z, -y / z
        else:
            m, a, b = -z, -x / -z, -y / -z
    return (a + 1.0) * 0.5 * size - 0.5, (b + 1.0) * 0.5 * size - 0.5, m


def model_to_world(d):
    return d * np.array([1.0, -1.0, -1.0])


def world_to_model(d):
    return d * np.array([1.0, -1.0, -1.0])


# ------------------------------------------------------------------ scene --
SUN_DIR = normalize(np.array([0.62, 0.34, 0.71]))          # light source, behind-right
GAS_CENTER = np.array([-0.70, 0.16, -3.30])                 # ringed giant, front-left
GAS_RADIUS = 1.0
RING_NORMAL = normalize(np.array([0.24, 0.84, 0.48]))
RING_INNER, RING_OUTER = 1.30, 2.05
MOON_CENTER = np.array([1.05, 0.52, -2.35])
MOON_RADIUS = 0.13
EARTH_CENTER = normalize(np.array([-0.90, -0.16, 0.75])) * 3.1   # blue world, behind-left
EARTH_RADIUS = 0.62
BAND_NORMAL = normalize(np.array([0.35, 0.86, -0.36]))      # galactic plane


def background(dw):
    """Nebulae + galactic band. dw: (h, w, 3) world directions -> (h, w, 3) rgb."""
    band = np.abs(dw @ BAND_NORMAL)
    band_mask = np.exp(-(band / 0.26) ** 2)
    base = lerp(rgb((3, 5, 14)), rgb((8, 12, 32)), band_mask[..., None])

    warp = np.stack([fbm3(dw * 2.1 + 11.0, 4, 3), fbm3(dw * 2.1 + 37.0, 4, 5),
                     fbm3(dw * 2.1 + 71.0, 4, 7)], axis=-1) - 0.5
    p = dw + warp * 0.55
    n1 = fbm3(p * 2.6, 6, 21)
    n2 = fbm3(p * 3.4 + 5.0, 6, 43)
    n3 = fbm3(p * 1.7 - 9.0, 5, 65)
    dust = fbm3(p * 6.5 + 3.0, 5, 87)

    violet = smoothstep(0.50, 0.80, n1) * (0.35 + 0.65 * band_mask)
    teal = smoothstep(0.52, 0.82, n2) * (0.25 + 0.75 * band_mask)
    ember = smoothstep(0.60, 0.86, n3) * smoothstep(0.45, 0.75, n1) * 0.8

    col = base
    col = col + rgb((92, 52, 190))[None, None] * violet[..., None] * 0.62
    col = col + rgb((24, 150, 200))[None, None] * teal[..., None] * 0.50
    col = col + rgb((236, 86, 150))[None, None] * ember[..., None] * 0.42
    # bright milky core + dark dust lanes along the band
    core = band_mask ** 3 * smoothstep(0.35, 0.75, fbm3(p * 4.2 + 2.0, 5, 99))
    col = col + rgb((210, 200, 255))[None, None] * core[..., None] * 0.22
    lanes = smoothstep(0.52, 0.70, dust) * band_mask
    col = col * (1.0 - 0.55 * lanes[..., None])
    return col


def sphere_hit(dw, center, radius):
    """Ray from origin along dw against a sphere -> (hit mask, t, normal)."""
    b = dw @ center
    c = center @ center - radius * radius
    disc = b * b - c
    hit = (disc > 0) & (b > 0)
    t = b - np.sqrt(np.where(hit, disc, 0.0))
    pos = dw * t[..., None]
    n = (pos - center) / radius
    return hit, t, n


def shade_gas_giant(n, dw):
    lat = n @ RING_NORMAL
    turb = fbm3(n * np.array([2.0, 9.0, 2.0]) + 4.0, 5, 131) - 0.5
    bands = np.sin((lat + turb * 0.16) * 21.0) * 0.5 + 0.5
    fine = np.sin((lat + turb * 0.05) * 67.0) * 0.5 + 0.5
    c1, c2, c3 = rgb((218, 168, 112)), rgb((134, 84, 128)), rgb((240, 214, 180))
    col = lerp(c1, c2, smoothstep(0.25, 0.8, bands)[..., None])
    col = lerp(col, c3, (fine * 0.35)[..., None])
    storm = smoothstep(0.72, 0.9, fbm3(n * 5.0 + 20.0, 4, 151))
    col = lerp(col, rgb((255, 238, 214)), (storm * 0.5)[..., None])
    return col


def shade_earth(n):
    land = fbm3(n * 2.4 + 8.0, 6, 171)
    is_land = smoothstep(0.52, 0.56, land)
    ocean = lerp(rgb((10, 44, 120)), rgb((24, 96, 180)), smoothstep(0.3, 0.55, land)[..., None])
    ground = lerp(rgb((40, 120, 66)), rgb((150, 132, 84)), smoothstep(0.58, 0.72, land)[..., None])
    col = lerp(ocean, ground, is_land[..., None])
    ice = smoothstep(0.78, 0.9, np.abs(n[..., 1]))
    col = lerp(col, rgb((236, 244, 255)), ice[..., None])
    clouds = smoothstep(0.55, 0.78, fbm3(n * 4.5 + 30.0, 5, 191))
    col = lerp(col, rgb((250, 252, 255)), (clouds * 0.85)[..., None])
    return col


def lit(n, col, ambient=0.035, wrap=0.08):
    ndl = np.clip((n @ SUN_DIR + wrap) / (1.0 + wrap), 0.0, 1.0)
    return col * (ambient + (1.0 - ambient) * ndl[..., None])


def render_bodies(dw, col):
    """Composite planets, rings and moon over the background."""
    depth = np.full(dw.shape[:2], np.inf)

    # --- rings (back part drawn first, front part after the planet) -------
    denom = dw @ RING_NORMAL
    tr = (GAS_CENTER @ RING_NORMAL) / np.where(np.abs(denom) > 1e-6, denom, 1e-6)
    rp = dw * tr[..., None] - GAS_CENTER
    rr = np.linalg.norm(rp, axis=-1) / GAS_RADIUS
    in_ring = (tr > 0) & (rr > RING_INNER) & (rr < RING_OUTER)
    x = (rr - RING_INNER) / (RING_OUTER - RING_INNER)
    bandn = value_noise3(np.stack([rr * 38.0, rr * 0, rr * 0], axis=-1), 211)
    bandw = value_noise3(np.stack([rr * 9.0, rr * 0 + 3.0, rr * 0], axis=-1), 223)
    ring_alpha = (0.18 + 0.55 * bandw) * (0.45 + 0.55 * bandn)
    ring_alpha *= smoothstep(0.0, 0.05, x) * (1.0 - smoothstep(0.92, 1.0, x))
    gap = 1.0 - 0.9 * np.exp(-((x - 0.58) / 0.035) ** 2)       # a Cassini-style gap
    ring_alpha *= gap * in_ring
    ring_col = lerp(rgb((226, 196, 150)), rgb((166, 150, 210)), bandw[..., None])
    # planet shadow on the rings
    q = rp + GAS_CENTER
    oc = q - GAS_CENTER
    bq = oc @ SUN_DIR
    dq = bq * bq - (np.sum(oc * oc, axis=-1) - GAS_RADIUS ** 2)
    shadow = (dq > 0) & (bq < 0)
    ring_light = np.where(shadow, 0.10, 1.0) * (0.55 + 0.45 * np.abs(RING_NORMAL @ SUN_DIR))
    ring_rgb = ring_col * ring_light[..., None]

    hit_g, t_g, n_g = sphere_hit(dw, GAS_CENTER, GAS_RADIUS)
    behind = in_ring & (~hit_g | (tr > t_g))
    a = (ring_alpha * behind)[..., None]
    col = col * (1 - a) + ring_rgb * a

    # --- gas giant ---------------------------------------------------------
    g_rgb = lit(n_g, shade_gas_giant(n_g, dw))
    rim = np.clip(1.0 + np.sum(n_g * dw, axis=-1), 0.0, 1.0) ** 3
    g_rgb = g_rgb + rgb((255, 190, 130))[None, None] * (rim * np.clip(n_g @ SUN_DIR + 0.3, 0, 1))[..., None] * 0.5
    # ring shadow on the planet
    sden = SUN_DIR @ RING_NORMAL
    pos_g = dw * t_g[..., None]
    ts = ((GAS_CENTER - pos_g) @ RING_NORMAL) / sden
    sp = pos_g + SUN_DIR[None, None] * ts[..., None] - GAS_CENTER
    sr = np.linalg.norm(sp, axis=-1) / GAS_RADIUS
    rs = (ts > 0) & (sr > RING_INNER) & (sr < RING_OUTER)
    g_rgb = g_rgb * np.where(rs, 0.55, 1.0)[..., None]
    b = dw @ GAS_CENTER
    edge = np.sqrt(np.clip(GAS_CENTER @ GAS_CENTER - b * b, 0, None)) / GAS_RADIUS
    cover = (1.0 - smoothstep(0.994, 1.0, edge)) * (b > 0)
    col = col * (1 - cover[..., None]) + g_rgb * cover[..., None]
    # soft atmosphere halo just outside the limb
    halo = np.exp(-np.clip(edge - 1.0, 0, None) / 0.035) * (edge >= 1.0) * (b > 0)
    sun_side = np.clip(normalize(dw * b[..., None] - GAS_CENTER) @ SUN_DIR * 0.5 + 0.5, 0, 1)
    col = col + rgb((255, 176, 120))[None, None] * (halo * sun_side * 0.35)[..., None]
    depth = np.where(hit_g, t_g, depth)

    front = in_ring & hit_g & (tr <= t_g)
    a = (ring_alpha * front)[..., None]
    col = col * (1 - a) + ring_rgb * a

    # --- small moon ----------------------------------------------------------
    hit_m, t_m, n_m = sphere_hit(dw, MOON_CENTER, MOON_RADIUS)
    crater = fbm3(n_m * 7.0 + 50.0, 5, 251)
    m_col = lerp(rgb((120, 122, 132)), rgb((206, 204, 198)), smoothstep(0.3, 0.7, crater)[..., None])
    m_rgb = lit(n_m, m_col, ambient=0.02, wrap=0.0)
    bm = dw @ MOON_CENTER
    em = np.sqrt(np.clip(MOON_CENTER @ MOON_CENTER - bm * bm, 0, None)) / MOON_RADIUS
    cm = (1.0 - smoothstep(0.97, 1.0, em)) * (bm > 0)
    col = col * (1 - cm[..., None]) + m_rgb * cm[..., None]

    # --- blue world ----------------------------------------------------------
    hit_e, t_e, n_e = sphere_hit(dw, EARTH_CENTER, EARTH_RADIUS)
    e_rgb = lit(n_e, shade_earth(n_e), ambient=0.03, wrap=0.12)
    rim_e = np.clip(1.0 + np.sum(n_e * dw, axis=-1), 0.0, 1.0) ** 2.5
    e_rgb = e_rgb + rgb((90, 170, 255))[None, None] * (rim_e * np.clip(n_e @ SUN_DIR + 0.4, 0, 1))[..., None] * 0.9
    be = dw @ EARTH_CENTER
    ee = np.sqrt(np.clip(EARTH_CENTER @ EARTH_CENTER - be * be, 0, None)) / EARTH_RADIUS
    ce = (1.0 - smoothstep(0.992, 1.0, ee)) * (be > 0)
    col = col * (1 - ce[..., None]) + e_rgb * ce[..., None]
    halo_e = np.exp(-np.clip(ee - 1.0, 0, None) / 0.05) * (ee >= 1.0) * (be > 0)
    side_e = np.clip(normalize(dw * be[..., None] - EARTH_CENTER) @ SUN_DIR * 0.5 + 0.5, 0, 1)
    col = col + rgb((70, 150, 255))[None, None] * (halo_e * side_e * 0.55)[..., None]

    occluded = (cover > 0.5) | (cm > 0.5) | (ce > 0.5) | (ring_alpha > 0.35)
    return col, occluded


def sun_glow(dw):
    c = np.clip(dw @ SUN_DIR, -1.0, 1.0)
    ang = np.arccos(c)
    core = np.exp(-(ang / 0.018) ** 2) * 6.0
    glow = np.exp(-ang / 0.07) * 0.9 + np.exp(-ang / 0.32) * 0.22
    return (rgb((255, 244, 224))[None, None] * core[..., None]
            + rgb((255, 206, 150))[None, None] * glow[..., None])


def make_stars(count, seed):
    rng = np.random.default_rng(seed)
    dirs = normalize(rng.normal(size=(count * 3, 3)))
    # favour the galactic band
    keep = rng.random(count * 3) < (0.28 + 0.72 * np.exp(-(np.abs(dirs @ BAND_NORMAL) / 0.3) ** 2))
    dirs = dirs[keep][:count]
    mag = rng.pareto(2.2, size=len(dirs)) * 0.16 + 0.05
    temp = rng.random(len(dirs))
    cols = np.where(temp[:, None] < 0.2, rgb((255, 214, 170)),
                    np.where(temp[:, None] < 0.72, rgb((255, 255, 255)), rgb((178, 208, 255))))
    return dirs, np.clip(mag, 0.05, 2.4), cols


def splat_stars(img, face, size, stars, occluded):
    dirs, mag, cols = stars
    dm = world_to_model(dirs)
    px, py, m = project(face, dm, size)
    ok = (m > 0.3) & (px > -4) & (px < size + 3) & (py > -4) & (py < size + 3)
    px, py, mag, cols = px[ok], py[ok], mag[ok], cols[ok]
    scale = size / 512.0
    for x, y, b, c in zip(px, py, mag, cols):
        sigma = (0.55 + 0.5 * min(b, 1.6)) * scale
        r = int(np.ceil(sigma * 3.2)) + (int(6 * scale) if b > 1.1 else 0)
        x0, x1 = int(np.floor(x)) - r, int(np.floor(x)) + r + 1
        y0, y1 = int(np.floor(y)) - r, int(np.floor(y)) + r + 1
        cx0, cx1, cy0, cy1 = max(x0, 0), min(x1, size), max(y0, 0), min(y1, size)
        if cx0 >= cx1 or cy0 >= cy1:
            continue
        yy, xx = np.mgrid[cy0:cy1, cx0:cx1]
        d2 = (xx - x) ** 2 + (yy - y) ** 2
        k = np.exp(-d2 / (2 * sigma * sigma)) * min(b * 1.7, 3.0)
        if b > 1.1:   # diffraction spikes on the brightest stars
            spike = (np.exp(-np.abs(xx - x) / (2.6 * scale)) * np.exp(-((yy - y) / (0.5 * scale)) ** 2)
                     + np.exp(-np.abs(yy - y) / (2.6 * scale)) * np.exp(-((xx - x) / (0.5 * scale)) ** 2))
            k = k + spike * 0.55 * (b - 0.9)
        k = k * (~occluded[cy0:cy1, cx0:cx1])
        img[cy0:cy1, cx0:cx1] += k[..., None] * c[None, None]


def render_face(suffix, size, stars, supersample=2):
    face = FACES[suffix]
    big = size * supersample
    dw = model_to_world(face_dirs(face, big))
    col = background(dw)
    col = col + sun_glow(dw) * 0.9
    col, occluded = render_bodies(dw, col)
    splat_stars(col, face, big, stars, occluded)
    # filmic-ish tone curve, then box downsample
    col = 1.0 - np.exp(-col * 1.55)
    col = col.reshape(size, supersample, size, supersample, 3).mean(axis=(1, 3))
    # The loader flips every face vertically (copyRect(..., swapY=true)), so the
    # PNG stores the GL face upside down, i.e. upright for the viewer.
    return to_image(col[::-1])


def generate(out_dir, size=512):
    import os
    os.makedirs(out_dir, exist_ok=True)
    stars = make_stars(5200, 7)
    for suffix in range(6):
        render_face(suffix, size, stars).save(os.path.join(out_dir, "panorama_%d.png" % suffix), optimize=True)


if __name__ == "__main__":
    import sys
    generate(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 512)
