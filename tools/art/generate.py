#!/usr/bin/env python3
"""Regenerate every piece of Aerospace Client art.

    python3 tools/art/generate.py            # writes into aerospace/overlay + aerospace/shell

All art is procedural and original; nothing from the upstream game is read.
The generated files are committed, so the Node build never needs Python.
Requires: Pillow, numpy.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.dirname(os.path.dirname(HERE))

import branding  # noqa: E402
import gui  # noqa: E402
import panorama  # noqa: E402
import world  # noqa: E402
from aero_common import to_image  # noqa: E402


def main():
    overlay = os.path.join(ROOT, "aerospace", "overlay")
    shell = os.path.join(ROOT, "aerospace", "shell")
    tex = os.path.join(overlay, "assets/minecraft/textures")
    title = os.path.join(tex, "gui/title")
    os.makedirs(os.path.join(title, "background"), exist_ok=True)
    os.makedirs(os.path.join(overlay, "assets/eagler"), exist_ok=True)
    os.makedirs(shell, exist_ok=True)

    print("branding…")
    branding.title_logo().save(os.path.join(title, "minecraft.png"), optimize=True)
    branding.title_logo(easter_egg=True).save(os.path.join(title, "minceraft.png"), optimize=True)
    branding.edition_logo().save(os.path.join(title, "edition.png"), optimize=True)
    branding.loading_logo().save(os.path.join(title, "mojangstudios.png"), optimize=True)
    branding.badge(128).convert("RGB").save(os.path.join(overlay, "pack.png"), optimize=True)
    branding.badge(256).save(os.path.join(overlay, "assets/eagler/eagtek.png"), optimize=True)
    branding.badge(64).save(os.path.join(shell, "favicon.png"), optimize=True)
    to_image(branding.emblem(320)).save(os.path.join(shell, "emblem.png"), optimize=True)

    print("gui skin…")
    count = gui.save_all(overlay)
    print("sky + paintings…")
    count += world.save_all(overlay)
    print("panorama (this takes a minute)…")
    panorama.generate(os.path.join(title, "background"), 512)
    print("done: %d sprites + 6 panorama faces + branding" % count)


if __name__ == "__main__":
    main()
