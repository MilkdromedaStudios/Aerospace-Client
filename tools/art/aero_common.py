"""Shared helpers for the Aerospace Client procedural art generator.

Everything in here is original, generated art: no upstream texture is read.
"""
import numpy as np
from PIL import Image, ImageFilter

# ---------------------------------------------------------------- palette --
NAVY_0 = (4, 7, 18)        # deepest background
NAVY_1 = (9, 15, 36)
NAVY_2 = (15, 26, 58)
NAVY_3 = (24, 42, 88)
STEEL = (58, 82, 128)
CYAN = (63, 208, 255)
CYAN_HI = (150, 236, 255)
CYAN_DIM = (36, 104, 150)
VIOLET = (138, 92, 255)
MAGENTA = (232, 84, 196)
AMBER = (255, 184, 77)
WHITE = (255, 255, 255)

# ------------------------------------------------------------------ noise --
_M32 = np.uint64(0xFFFFFFFF)


def _hash3(ix, iy, iz, seed):
    n = (ix.astype(np.uint64) * np.uint64(374761393)
         + iy.astype(np.uint64) * np.uint64(668265263)
         + iz.astype(np.uint64) * np.uint64(2147483647)
         + np.uint64(seed) * np.uint64(144665)) & _M32
    n = ((n ^ (n >> np.uint64(13))) * np.uint64(1274126177)) & _M32
    n = (n ^ (n >> np.uint64(16))) & np.uint64(0xFFFFFF)
    return n.astype(np.float64) / float(0xFFFFFF)


def value_noise3(p, seed=0):
    """Trilinear value noise. p: (..., 3) float array -> (...) in [0, 1]."""
    p = np.asarray(p, dtype=np.float64) + 1000.0
    i = np.floor(p).astype(np.int64)
    f = p - i
    f = f * f * (3.0 - 2.0 * f)
    ix, iy, iz = i[..., 0], i[..., 1], i[..., 2]
    fx, fy, fz = f[..., 0], f[..., 1], f[..., 2]
    out = 0.0
    for dx in (0, 1):
        wx = fx if dx else 1.0 - fx
        for dy in (0, 1):
            wy = fy if dy else 1.0 - fy
            for dz in (0, 1):
                wz = fz if dz else 1.0 - fz
                out = out + wx * wy * wz * _hash3(ix + dx, iy + dy, iz + dz, seed)
    return out


def fbm3(p, octaves=5, seed=0, lacunarity=2.03, gain=0.5):
    p = np.asarray(p, dtype=np.float64)
    total = 0.0
    amp = 1.0
    norm = 0.0
    freq = 1.0
    for o in range(octaves):
        total = total + amp * value_noise3(p * freq, seed + o * 17)
        norm += amp
        amp *= gain
        freq *= lacunarity
    return total / norm


def tile_noise2(w, h, cells, seed=0):
    """Tileable 2D value noise in [0, 1], `cells` lattice cells per side."""
    rng = np.random.default_rng(seed)
    lattice = rng.random((cells, cells))
    ys, xs = np.mgrid[0:h, 0:w]
    gx = xs / w * cells
    gy = ys / h * cells
    x0 = np.floor(gx).astype(int)
    y0 = np.floor(gy).astype(int)
    fx = gx - x0
    fy = gy - y0
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    x1 = (x0 + 1) % cells
    y1 = (y0 + 1) % cells
    x0 %= cells
    y0 %= cells
    return (lattice[y0, x0] * (1 - fx) * (1 - fy) + lattice[y0, x1] * fx * (1 - fy)
            + lattice[y1, x0] * (1 - fx) * fy + lattice[y1, x1] * fx * fy)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def normalize(v):
    v = np.asarray(v, dtype=np.float64)
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


def lerp(a, b, t):
    return a + (b - a) * t


def to_image(arr):
    """Float array (h, w, 3|4) in [0, 1] -> PIL image."""
    a = np.clip(arr, 0.0, 1.0)
    a = (a * 255.0 + 0.5).astype(np.uint8)
    return Image.fromarray(a, "RGBA" if a.shape[2] == 4 else "RGB")


def rgb(c):
    return np.array(c, dtype=np.float64) / 255.0


# ------------------------------------------------------------- pixel font --
# Original 5x7 block typeface drawn for the Aerospace wordmark.
_FONT_ROWS = {
    "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "B": ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    "C": [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
    "D": ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    "F": ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
    "G": [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
    "H": ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "I": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
    "J": ["..###", "....#", "....#", "....#", "....#", "#...#", ".###."],
    "K": ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
    "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    "M": ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
    "N": ["#...#", "##..#", "#.#.#", "#.#.#", "#..##", "#...#", "#...#"],
    "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "P": ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
    "Q": [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
    "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    "S": [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
    "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    "U": ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "V": ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
    "W": ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
    "X": ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
    "Y": ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
    "Z": ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
    "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
    "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
    "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
    "4": ["#...#", "#...#", "#...#", "#####", "....#", "....#", "....#"],
    "5": ["#####", "#....", "#....", "####.", "....#", "....#", "####."],
    "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
    "7": ["#####", "....#", "...#.", "..#..", "..#..", "..#..", "..#.."],
    "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
    "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
    ".": [".", ".", ".", ".", ".", ".", "#"],
    "-": ["....", "....", "....", "####", "....", "....", "...."],
    "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
    " ": ["...", "...", "...", "...", "...", "...", "..."],
}


def text_mask(text, cell=1, spacing=1):
    """Render `text` with the block font -> bool array, `cell` px per font cell."""
    cols = []
    for idx, ch in enumerate(text.upper()):
        rows = _FONT_ROWS[ch]
        w = len(rows[0])
        glyph = np.array([[c == "#" for c in row] for row in rows], dtype=bool)
        cols.append(glyph)
        if idx != len(text) - 1:
            cols.append(np.zeros((7, spacing), dtype=bool))
    mask = np.concatenate(cols, axis=1)
    if cell != 1:
        mask = np.kron(mask, np.ones((cell, cell), dtype=bool))
    return mask


def dilate(mask, r):
    """Binary dilation by a (2r+1) square via max filter."""
    im = Image.fromarray((mask.astype(np.uint8) * 255), "L")
    im = im.filter(ImageFilter.MaxFilter(2 * r + 1))
    return np.array(im) > 127


def blur(arr, radius):
    """Gaussian blur of a float (h, w) array."""
    im = Image.fromarray(np.clip(arr * 255.0, 0, 255).astype(np.uint8), "L")
    return np.array(im.filter(ImageFilter.GaussianBlur(radius))).astype(np.float64) / 255.0


def alpha_over(dst, src_rgb, src_a):
    """Composite src (rgb float (h,w,3) or (3,), alpha (h,w)) over RGBA float dst in place."""
    src_rgb = np.broadcast_to(np.asarray(src_rgb, dtype=np.float64), dst[..., :3].shape)
    a = src_a[..., None]
    out_a = a + dst[..., 3:4] * (1 - a)
    safe = np.where(out_a > 1e-6, out_a, 1.0)
    dst[..., :3] = (src_rgb * a + dst[..., :3] * dst[..., 3:4] * (1 - a)) / safe
    dst[..., 3:4] = out_a
    return dst
