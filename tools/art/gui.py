"""Aerospace GUI skin: widgets, hotbar, tooltip and menu chrome.

Every sprite keeps the exact size and nine-slice layout of the vanilla one it
replaces, so the stock .mcmeta scaling data keeps working unchanged.
"""
import numpy as np
from PIL import Image
from aero_common import (rgb, lerp, to_image, alpha_over, tile_noise2,
                         NAVY_0, NAVY_1, NAVY_2, NAVY_3, STEEL, CYAN, CYAN_HI, CYAN_DIM, WHITE)


def blank(w, h):
    return np.zeros((h, w, 4))


def rect(img, x0, y0, x1, y1, color, alpha=1.0):
    """Fill [x0, x1) x [y0, y1) with a flat RGBA colour (replace, no blending)."""
    img[y0:y1, x0:x1, :3] = rgb(color)
    img[y0:y1, x0:x1, 3] = alpha


def vgrad(img, x0, y0, x1, y1, top, bottom, alpha=1.0):
    h = y1 - y0
    t = (np.arange(h) / max(h - 1, 1))[:, None, None]
    img[y0:y1, x0:x1, :3] = lerp(rgb(top), rgb(bottom), t)
    img[y0:y1, x0:x1, 3] = alpha


def frame(img, x0, y0, x1, y1, color, alpha=1.0, t=1):
    rect(img, x0, y0, x1, y0 + t, color, alpha)
    rect(img, x0, y1 - t, x1, y1, color, alpha)
    rect(img, x0, y0, x0 + t, y1, color, alpha)
    rect(img, x1 - t, y0, x1, y1, color, alpha)


def clip_corners(img, n=1):
    """Knock the outermost corner pixels out for a chamfered look."""
    h, w = img.shape[:2]
    for i in range(n):
        for j in range(n - i):
            for (y, x) in ((i, j), (i, w - 1 - j), (h - 1 - i, j), (h - 1 - i, w - 1 - j)):
                img[y, x, 3] = 0.0


def panel(w, h, top, bottom, border, alpha=0.93, glow=None, chamfer=1):
    img = blank(w, h)
    vgrad(img, 0, 0, w, h, top, bottom, alpha)
    frame(img, 0, 0, w, h, border, 1.0)
    if glow is not None:
        frame(img, 1, 1, w - 1, h - 1, glow[0], glow[1])
    # top sheen / bottom shade inside the border
    img[1, 1:w - 1, :3] = np.clip(img[1, 1:w - 1, :3] + 0.07, 0, 1)
    img[h - 2, 1:w - 1, :3] *= 0.72
    clip_corners(img, chamfer)
    return img


def widgets():
    out = {}
    # --- buttons (200x20, nine-slice) --------------------------------------
    out["widget/button"] = panel(200, 20, NAVY_2, NAVY_1, CYAN_DIM)
    out["widget/button_highlighted"] = panel(200, 20, (30, 58, 118), NAVY_2, CYAN_HI, alpha=0.97,
                                             glow=(CYAN, 0.55))
    out["widget/button_disabled"] = panel(200, 20, (14, 17, 28), (9, 11, 20), (48, 56, 78), alpha=0.85,
                                          chamfer=0)
    # --- sliders -------------------------------------------------------------
    out["widget/slider"] = panel(200, 20, (5, 8, 20), (8, 13, 30), (44, 66, 110), alpha=0.95, chamfer=0)
    out["widget/slider_highlighted"] = panel(200, 20, (5, 8, 20), (8, 13, 30), CYAN, alpha=0.95, chamfer=0)
    for name, border, top in (("widget/slider_handle", CYAN_DIM, (46, 120, 190)),
                              ("widget/slider_handle_highlighted", WHITE, CYAN)):
        img = blank(8, 20)
        vgrad(img, 0, 0, 8, 20, top, (24, 60, 130), 1.0)
        frame(img, 0, 0, 8, 20, border, 1.0)
        rect(img, 3, 6, 5, 14, CYAN_HI, 1.0)       # grip
        out[name] = img
    # --- text fields ---------------------------------------------------------
    out["widget/text_field"] = panel(200, 20, (2, 4, 12), (4, 8, 20), (58, 82, 128), alpha=0.96, chamfer=0)
    out["widget/text_field_highlighted"] = panel(200, 20, (2, 4, 12), (6, 12, 28), CYAN_HI, alpha=0.96,
                                                 chamfer=0)
    # --- tabs (130x24, open at the bottom) ----------------------------------
    def tab(fill_a, border, bar=None, fill=NAVY_1):
        img = blank(130, 24)
        rect(img, 0, 0, 130, 24, fill, fill_a)
        rect(img, 0, 0, 130, 1, border, 1.0)
        rect(img, 0, 0, 1, 24, border, 1.0)
        rect(img, 129, 0, 130, 24, border, 1.0)
        if bar is not None:
            rect(img, 1, 1, 129, 3, bar, 1.0)
        return img
    out["widget/tab"] = tab(0.62, (44, 66, 110))
    out["widget/tab_highlighted"] = tab(0.72, CYAN, fill=NAVY_2)
    out["widget/tab_selected"] = tab(0.30, CYAN_DIM, bar=CYAN, fill=NAVY_3)
    out["widget/tab_selected_highlighted"] = tab(0.40, CYAN_HI, bar=CYAN_HI, fill=NAVY_3)
    # --- checkboxes ----------------------------------------------------------
    for name, border, checked in (("widget/checkbox", (58, 82, 128), False),
                                  ("widget/checkbox_highlighted", CYAN_HI, False),
                                  ("widget/checkbox_selected", (58, 82, 128), True),
                                  ("widget/checkbox_selected_highlighted", CYAN_HI, True)):
        img = panel(20, 20, (4, 7, 18), (8, 13, 30), border, alpha=1.0, chamfer=0)
        if checked:
            for i, (x, y) in enumerate(((5, 10), (6, 11), (7, 12), (8, 13), (9, 12), (10, 11),
                                        (11, 10), (12, 9), (13, 8), (14, 7))):
                rect(img, x, y - 1, x + 1, y + 2, CYAN_HI, 1.0)
        out[name] = img
    # --- scroll bar ----------------------------------------------------------
    img = blank(6, 32)
    vgrad(img, 0, 0, 6, 32, CYAN, (30, 96, 170), 1.0)
    frame(img, 0, 0, 6, 32, CYAN_HI, 1.0)
    out["widget/scroller"] = img
    img = blank(6, 32)
    rect(img, 0, 0, 6, 32, (4, 7, 18), 1.0)
    frame(img, 0, 0, 6, 32, (24, 36, 66), 1.0)
    out["widget/scroller_background"] = img
    return out


def hud():
    out = {}
    # --- hotbar: 9 slots on a 20px pitch inside a 1px frame ------------------
    img = blank(182, 22)
    rect(img, 0, 0, 182, 22, NAVY_0, 0.72)
    frame(img, 0, 0, 182, 22, CYAN_DIM, 1.0)
    frame(img, 1, 1, 181, 21, (6, 12, 30), 0.9)
    for i in range(1, 9):
        x = 1 + 20 * i
        rect(img, x - 1, 2, x + 1, 20, (30, 52, 96), 0.95)
    for i in range(9):          # faint slot floor highlight
        x = 3 + 20 * i
        rect(img, x, 18, x + 16, 19, CYAN_DIM, 0.35)
    clip_corners(img, 1)
    out["hud/hotbar"] = img
    # --- selection frame -------------------------------------------------------
    img = blank(24, 23)
    frame(img, 0, 0, 24, 23, (2, 8, 24), 1.0)
    frame(img, 1, 1, 23, 22, CYAN_HI, 1.0)
    frame(img, 2, 2, 22, 21, CYAN, 1.0)
    for (x, y) in ((1, 1), (22, 1), (1, 21), (22, 21)):
        rect(img, x, y, x + 1, y + 1, WHITE, 1.0)
    out["hud/hotbar_selection"] = img
    # --- off-hand slots ----------------------------------------------------------
    for name, x0 in (("hud/hotbar_offhand_left", 0), ("hud/hotbar_offhand_right", 7)):
        img = blank(29, 24)
        rect(img, x0, 1, x0 + 22, 23, NAVY_0, 0.72)
        frame(img, x0, 1, x0 + 22, 23, CYAN_DIM, 1.0)
        frame(img, x0 + 1, 2, x0 + 21, 22, (6, 12, 30), 0.9)
        out[name] = img
    # --- crosshair: open reticle with a centre dot (white: the game inverts) ---
    img = blank(15, 15)
    for i in (2, 3, 4, 5, 9, 10, 11, 12):
        rect(img, i, 7, i + 1, 8, WHITE, 1.0)
        rect(img, 7, i, 8, i + 1, WHITE, 1.0)
    rect(img, 7, 7, 8, 8, WHITE, 1.0)
    out["hud/crosshair"] = img
    # --- status effect tile -----------------------------------------------------
    img = panel(24, 24, NAVY_2, NAVY_0, CYAN_DIM, alpha=0.92, chamfer=2)
    out["hud/effect_background"] = img
    img = panel(24, 24, NAVY_3, NAVY_1, CYAN, alpha=0.92, chamfer=2)
    out["hud/effect_background_ambient"] = img
    return out


def tooltip():
    out = {}
    # background: fill inset 9px (inner block from 9..91) plus 1px side lips, as vanilla
    img = blank(100, 100)
    rect(img, 9, 8, 91, 92, (5, 9, 24), 0.94)
    rect(img, 8, 9, 92, 91, (5, 9, 24), 0.94)
    out["tooltip/background"] = img
    img = blank(100, 100)
    t = (np.arange(82) / 81.0)[:, None, None]
    col = lerp(rgb(CYAN), rgb((70, 60, 200)), t)
    edge = np.zeros((82, 82), dtype=bool)
    edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = True
    edge[0, 0] = edge[0, -1] = edge[-1, 0] = edge[-1, -1] = False
    img[9:91, 9:91, :3] = np.broadcast_to(col, (82, 82, 3))
    img[9:91, 9:91, 3] = edge * 0.78
    out["tooltip/frame"] = img
    return out


def menu_chrome():
    """Full-texture (non-sprite) GUI pieces under textures/gui/."""
    out = {}

    def tint(alpha, color=(4, 8, 22), sparkle=0.0, seed=1):
        img = blank(16, 16)
        rect(img, 0, 0, 16, 16, color, alpha)
        if sparkle:
            rng = np.random.default_rng(seed)
            for _ in range(3):
                x, y = rng.integers(0, 16, 2)
                img[y, x, :3] = rgb(CYAN_HI)
                img[y, x, 3] = min(1.0, alpha + sparkle)
        return img
    out["menu_background"] = tint(0.34)
    out["inworld_menu_background"] = tint(0.34)
    out["menu_list_background"] = tint(0.50, (2, 5, 16))
    out["inworld_menu_list_background"] = tint(0.50, (2, 5, 16))

    def separator(flip):
        img = blank(32, 2)
        x = np.arange(32) / 31.0
        glow = 0.55 + 0.45 * np.cos((x - 0.5) * 2 * np.pi)      # tiles seamlessly
        line, shade = (0, 1) if not flip else (1, 0)
        img[line, :, :3] = rgb(CYAN)
        img[line, :, 3] = 0.35 + 0.45 * glow
        img[shade, :, :3] = rgb((0, 4, 14))
        img[shade, :, 3] = 0.75
        return img
    out["header_separator"] = separator(False)
    out["inworld_header_separator"] = separator(False)
    out["footer_separator"] = separator(True)
    out["inworld_footer_separator"] = separator(True)
    return out


def advancement_background():
    """16x16 tiling star tile for the Aerospace advancement tab."""
    n = tile_noise2(16, 16, 4, seed=9)
    img = np.zeros((16, 16, 3))
    img[:] = lerp(rgb((7, 10, 26)), rgb((20, 22, 58)), n[..., None])
    rng = np.random.default_rng(12)
    for _ in range(9):
        x, y = rng.integers(0, 16, 2)
        img[y, x] = rgb(WHITE) * rng.uniform(0.55, 1.0)
    img[3, 11] = rgb(CYAN_HI)
    return to_image(img)


def save_all(root):
    import os
    count = 0
    for group in (widgets(), hud(), tooltip()):
        for name, arr in group.items():
            path = os.path.join(root, "assets/minecraft/textures/gui/sprites", name + ".png")
            os.makedirs(os.path.dirname(path), exist_ok=True)
            to_image(arr).save(path, optimize=True)
            count += 1
    for name, arr in menu_chrome().items():
        path = os.path.join(root, "assets/minecraft/textures/gui", name + ".png")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        to_image(arr).save(path, optimize=True)
        count += 1
    path = os.path.join(root, "assets/minecraft/textures/gui/advancements/backgrounds/aerospace.png")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    advancement_background().save(path, optimize=True)
    return count + 1
