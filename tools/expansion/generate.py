"""Aerospace expansion: rockets, fuel, planets, gravity, oxygen, monsters and dungeons.

Writes everything into the game's built-in data and resource packs through
aerospace/overlay, the English strings into aerospace/lang/en_us.expansion.json
and tag additions into aerospace/patches.expansion.json. The build packs them
into assets.epk. Needs the stock 26.3 assets: run `npm run unpack` first.

Usage: python3 tools/expansion/generate.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import common  # noqa: E402
import functions  # noqa: E402
import items  # noqa: E402
import planets  # noqa: E402
import structures  # noqa: E402
import textures  # noqa: E402

MANIFEST = os.path.join(common.HERE, "generated-files.txt")
LANG_FILE = os.path.join(common.ROOT, "aerospace", "lang", "en_us.expansion.json")
PATCH_FILE = os.path.join(common.ROOT, "aerospace", "patches.expansion.json")


def clean_previous():
    """Delete what the last run wrote, so renamed or dropped files do not linger."""
    if not os.path.exists(MANIFEST):
        return
    with open(MANIFEST, encoding="utf-8") as fh:
        for rel in fh.read().split():
            full = os.path.join(common.OVERLAY, rel)
            if os.path.isfile(full):
                os.remove(full)
    for top in ("data", "assets"):
        base = os.path.join(common.OVERLAY, top)
        for dirpath, _dirs, _files in sorted(os.walk(base), reverse=True):
            if dirpath != base and not os.listdir(dirpath):
                os.rmdir(dirpath)


def write_patches():
    patches = {"appendValues": {
        # planet animals spawn on the planet surface blocks
        "data/minecraft/tags/block/animals_spawnable_on.json": [
            "minecraft:light_gray_concrete_powder", "minecraft:red_sand", "minecraft:snow_block"],
        # suffocating in vacuum ignores armor
        "data/minecraft/tags/damage_type/bypasses_armor.json": ["minecraft:aerospace_vacuum"],
        # Mission Control from the pause menu and the Quick Actions key
        "data/minecraft/tags/dialog/pause_screen_additions.json": ["minecraft:aerospace/mission_control"],
        "data/minecraft/tags/dialog/quick_actions.json": ["minecraft:aerospace/mission_control"],
    }}
    with open(PATCH_FILE, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(patches, fh, indent=2)
        fh.write("\n")


def main():
    clean_previous()
    textures.generate()
    items.assets()
    items.recipes()
    planets.generate()
    structures.generate()
    functions.generate()

    dupes = {p for p in common.WRITTEN if common.WRITTEN.count(p) > 1}
    if dupes:
        raise SystemExit("written twice: " + ", ".join(sorted(dupes)))
    with open(LANG_FILE, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(common.LANG, fh, indent=2, ensure_ascii=False, sort_keys=True)
        fh.write("\n")
    write_patches()
    with open(MANIFEST, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(sorted(common.WRITTEN)) + "\n")
    print("expansion written: %d files, %d language strings" % (len(common.WRITTEN), len(common.LANG)))


if __name__ == "__main__":
    main()
