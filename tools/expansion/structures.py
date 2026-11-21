"""Dungeons: procedurally built structure templates, their world-gen entries and loot.

Templates use the 26.3 template format (palette entries with "id"/"properties",
shorts for spawner timings, entities as nbt/blockPos/pos). Only positions we set
are written, so terrain outside a building is left alone and every room is
explicitly cleared with air.
"""
import math
import os
import random
import sys

from common import mc, tr, lang, write_bytes, write_json
import items

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib"))
import nbt  # noqa: E402
from nbt import TagByte, TagShort, TagInt, TagFloat, TagDouble, TagList  # noqa: E402

DATA_VERSION = 5023


def _nbt(value):
    """Plain Python (JSON-like) -> NBT, keeping explicit tag classes."""
    if hasattr(value, "tag") and not isinstance(value, (TagList,)):
        return value
    if isinstance(value, TagList):
        return TagList(value.item_tag, [_nbt(v) for v in value])
    if isinstance(value, bool):
        return TagByte(1 if value else 0)
    if isinstance(value, int):
        return TagInt(value)
    if isinstance(value, float):
        return TagDouble(value)
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return {k: _nbt(v) for k, v in value.items()}
    if isinstance(value, list):
        conv = [_nbt(v) for v in value]
        tag = nbt._tag_of(conv[0]) if conv else 10
        return TagList(tag, conv)
    raise TypeError(value)


class Build:
    def __init__(self, sx, sy, sz, seed):
        self.size = (sx, sy, sz)
        self.blocks = {}
        self.entities = []
        self.rng = random.Random(seed)

    def set(self, x, y, z, state, props=None, nbt_data=None):
        sx, sy, sz = self.size
        if 0 <= x < sx and 0 <= y < sy and 0 <= z < sz:
            self.blocks[(x, y, z)] = (state, tuple(sorted((props or {}).items())), nbt_data)

    def get(self, x, y, z):
        b = self.blocks.get((x, y, z))
        return b[0] if b else None

    def fill(self, x0, y0, z0, x1, y1, z1, state, props=None, only_if=None):
        for x in range(min(x0, x1), max(x0, x1) + 1):
            for y in range(min(y0, y1), max(y0, y1) + 1):
                for z in range(min(z0, z1), max(z0, z1) + 1):
                    if only_if is None or only_if(x, y, z):
                        self.set(x, y, z, state, props)

    def box(self, x0, y0, z0, x1, y1, z1, wall, inside="minecraft:air", floor=None, roof=None):
        self.fill(x0, y0, z0, x1, y1, z1, wall)
        self.fill(x0 + 1, y0 + 1, z0 + 1, x1 - 1, y1 - 1, z1 - 1, inside)
        if floor:
            self.fill(x0 + 1, y0, z0 + 1, x1 - 1, y0, z1 - 1, floor)
        if roof:
            self.fill(x0 + 1, y1, z0 + 1, x1 - 1, y1, z1 - 1, roof)

    def chest(self, x, y, z, loot, facing="south"):
        self.set(x, y, z, "minecraft:chest", {"facing": facing, "type": "single", "waterlogged": "false"},
                 {"LootTable": mc(loot), "components": {}, "id": "minecraft:chest"})

    def spawner(self, x, y, z, entity):
        data = {"entity": entity}
        self.set(x, y, z, "minecraft:spawner", None, {
            "MaxNearbyEntities": TagShort(6), "RequiredPlayerRange": TagShort(16), "SpawnCount": TagShort(3),
            "SpawnData": data, "MaxSpawnDelay": TagShort(700), "id": "minecraft:mob_spawner",
            "SpawnRange": TagShort(4), "Delay": TagShort(0), "MinSpawnDelay": TagShort(200),
            "SpawnPotentials": TagList(10, [{"data": data, "weight": TagInt(1)}]),
        })

    def entity(self, x, y, z, data):
        d = dict(data)
        d["Pos"] = TagList(6, [TagDouble(x + 0.5), TagDouble(float(y)), TagDouble(z + 0.5)])
        d.setdefault("Rotation", TagList(5, [TagFloat(self.rng.uniform(0, 360)), TagFloat(0.0)]))
        self.entities.append({"nbt": d, "blockPos": TagList(3, [TagInt(x), TagInt(y), TagInt(z)]),
                              "pos": TagList(6, [TagDouble(x + 0.5), TagDouble(float(y)), TagDouble(z + 0.5)])})

    def to_nbt(self):
        palette, index, blocks = [], {}, []
        for (pos, (state, props, data)) in sorted(self.blocks.items(), key=lambda kv: (kv[0][1], kv[0][2], kv[0][0])):
            key = (state, props)
            if key not in index:
                index[key] = len(palette)
                entry = {"id": state}
                if props:
                    entry["properties"] = dict(props)
                palette.append(entry)
            b = {"pos": TagList(3, [TagInt(c) for c in pos]), "state": TagInt(index[key])}
            if data is not None:
                b["nbt"] = data
            blocks.append(b)
        root = {
            "size": TagList(3, [TagInt(c) for c in self.size]),
            "entities": TagList(10, self.entities),
            "blocks": TagList(10, blocks),
            "palette": TagList(10, palette),
            "DataVersion": TagInt(DATA_VERSION),
        }
        return nbt.dump(_nbt(root))


# ------------------------------------------------------------- monsters --
def _drop_none(slots):
    return {s: TagFloat(0.0) for s in slots}


def crew(kind, extra=None):
    """Entity NBT for planet monsters (spawners and bosses)."""
    gear = {
        "lost_astronaut": ("minecraft:zombie", {s: items.stack(i) for s, i in zip(("head", "chest", "legs", "feet"), items.SUIT)}),
        "martian": ("minecraft:husk", items.gear("aerospace_martian", "martian_gear")),
        "frost_wraith": ("minecraft:stray", items.gear("aerospace_frost", "frost_gear")),
        "magma_knight": ("minecraft:wither_skeleton", items.gear("aerospace_magma", "magma_gear")),
    }[kind]
    eid, equipment = gear
    e = {"id": eid, "equipment": dict(equipment), "Tags": ["aero_seen", "aero_" + kind],
         "CustomName": {"translate": "entity.aerospace." + kind}}
    if kind != "lost_astronaut":
        e["drop_chances"] = _drop_none(("head", "chest", "legs", "feet"))
    if extra:
        e.update(extra)
    return e


def boss(kind, name_key, name, color, health, weapon, damage):
    e = crew(kind, {
        "CustomName": tr(name_key, name, color=color, bold=True),
        "CustomNameVisible": True,
        "PersistenceRequired": True,
        "Health": TagFloat(float(health)),
        "attributes": [
            {"id": "minecraft:max_health", "base": float(health)},
            {"id": "minecraft:attack_damage", "base": float(damage)},
            {"id": "minecraft:knockback_resistance", "base": 0.6},
            {"id": "minecraft:follow_range", "base": 32.0},
        ],
    })
    e["equipment"]["mainhand"] = {"id": weapon, "count": 1}
    e["drop_chances"] = dict(_drop_none(("head", "chest", "legs", "feet")), mainhand=TagFloat(0.25))
    e["Tags"] = ["aero_seen", "aero_boss"]
    return e


# --------------------------------------------------------------- designs --
def crash_site():
    b = Build(17, 9, 13, 1)
    cx, cz = 8, 6
    # crater floor: scorched ground, slightly sunk
    for x in range(17):
        for z in range(13):
            d = math.hypot((x - cx) / 8.0, (z - cz) / 6.0)
            if d < 1.0:
                r = b.rng.random()
                b.set(x, 0, z, "minecraft:coarse_dirt" if r < 0.55 else "minecraft:gravel" if r < 0.8 else
                      "minecraft:magma_block" if r < 0.9 else "minecraft:blackstone")
                b.fill(x, 1, z, x, 8, z, "minecraft:air")
    # toppled rocket along x, axis at y=2, radius 2
    for x in range(2, 15):
        r = 2.2 if x < 12 else 2.2 - (x - 11) * 0.7
        for y in range(0, 5):
            for z in range(cz - 3, cz + 4):
                d = math.hypot(y - 2, z - cz)
                if d <= r:
                    shell = d > r - 1.0
                    if shell:
                        if x >= 12:
                            state = "minecraft:red_concrete"
                        elif x in (6, 7) and y == 3:
                            state = "minecraft:light_blue_stained_glass"
                        elif x < 5 and b.rng.random() < 0.35:
                            state = "minecraft:black_concrete"                    # scorched engine end
                        elif b.rng.random() < 0.06:
                            continue                                               # torn hull
                        else:
                            state = "minecraft:white_concrete"
                        b.set(x, y + 1, z, state)
                    else:
                        b.set(x, y + 1, z, "minecraft:air")
    for (z0, z1) in ((cz - 4, cz - 3), (cz + 3, cz + 4)):                       # fins
        b.fill(2, 1, z0, 4, 2, z1, "minecraft:red_concrete")
    b.fill(1, 1, cz - 1, 1, 3, cz + 1, "minecraft:iron_block")                    # nozzle
    b.set(1, 2, cz, "minecraft:magma_block")
    b.chest(8, 2, cz, "chests/aerospace/crash_site", "north")
    b.set(9, 2, cz, "minecraft:lantern", {"hanging": "false", "waterlogged": "false"})
    for (x, z) in ((13, 2), (4, 10), (14, 10), (2, 3)):                          # debris
        b.set(x, 1, z, "minecraft:iron_bars", {"east": "false", "north": "false", "south": "false", "west": "false", "waterlogged": "false"})
    b.set(12, 1, 10, "minecraft:campfire", {"facing": "north", "lit": "true", "signal_fire": "true", "waterlogged": "false"})
    b.set(5, 1, 2, "minecraft:anvil", {"facing": "east"})
    return b


def lunar_outpost():
    b = Build(17, 12, 17, 2)
    # basement (y 0..4) with the spawner and supply room, base floor at y=4
    b.box(1, 0, 1, 15, 4, 15, "minecraft:smooth_stone", floor="minecraft:polished_andesite")
    b.fill(2, 1, 2, 14, 3, 14, "minecraft:air")
    b.fill(8, 1, 2, 8, 3, 14, "minecraft:iron_bars", {"east": "false", "north": "true", "south": "true", "west": "false", "waterlogged": "false"})
    b.spawner(4, 1, 8, crew("lost_astronaut"))
    b.chest(13, 1, 3, "chests/aerospace/lunar_outpost", "west")
    b.chest(13, 1, 13, "chests/aerospace/lunar_outpost", "west")
    for (x, z) in ((3, 3), (3, 13), (12, 8)):
        b.set(x, 3, z, "minecraft:sea_lantern")
    b.fill(8, 1, 7, 8, 2, 9, "minecraft:air")                                    # gap in the bars
    # ground floor ring of walls + glass dome
    cx, cz, base = 8, 8, 4
    for x in range(17):
        for z in range(17):
            d = math.hypot(x - cx, z - cz)
            if d <= 7.5:
                b.set(x, base, z, "minecraft:white_concrete" if d > 6.5 else "minecraft:smooth_quartz")
                for y in range(1, 8):
                    h = math.sqrt(max(0.0, 7.5 ** 2 - (x - cx) ** 2 - (z - cz) ** 2 - (y * 1.25) ** 2)) if y > 3 else 7.5
                    outer = d > 6.5 and y <= 3
                    dome = y > 3 and abs(d - math.sqrt(max(0.0, 7.5 ** 2 - (y * 1.0) ** 2))) < 0.9
                    if outer:
                        b.set(x, base + y, z, "minecraft:light_blue_stained_glass" if y == 2 and (x + z) % 3 else "minecraft:white_concrete")
                    elif dome:
                        b.set(x, base + y, z, "minecraft:glass")
                    else:
                        b.set(x, base + y, z, "minecraft:air")
    b.fill(8, base + 1, 0, 8, base + 2, 1, "minecraft:air")                       # airlock opening
    b.fill(7, base + 1, 1, 7, base + 3, 1, "minecraft:iron_block")
    b.fill(9, base + 1, 1, 9, base + 3, 1, "minecraft:iron_block")
    b.set(8, base, 1, "minecraft:polished_andesite")
    b.set(8, base, 8, "minecraft:iron_trapdoor", {"facing": "north", "half": "top", "open": "false", "powered": "false", "waterlogged": "false"})
    b.fill(8, 1, 8, 8, 3, 8, "minecraft:ladder", {"facing": "north", "waterlogged": "false"})
    b.set(8, 1, 9, "minecraft:smooth_stone")
    b.set(4, base + 1, 5, "minecraft:crafting_table")
    b.set(4, base + 1, 11, "minecraft:brewing_stand", {"has_bottle_0": "false", "has_bottle_1": "false", "has_bottle_2": "false"})
    b.set(12, base + 1, 5, "minecraft:blast_furnace", {"facing": "west", "lit": "false"})
    b.chest(12, base + 1, 11, "chests/aerospace/lunar_outpost", "west")
    for (x, z) in ((5, 8), (11, 8), (8, 5)):
        b.set(x, base + 1, z, "minecraft:sea_lantern")
    b.fill(8, base + 8, 8, 8, base + 10, 8, "minecraft:lightning_rod", {"facing": "up", "powered": "false", "waterlogged": "false"})
    b.entity(10, base + 1, 10, boss("lost_astronaut", "entity.aerospace.outpost_overseer", "Outpost Overseer",
                                    "aqua", 60, "minecraft:diamond_sword", 6))
    return b


def martian_ruins():
    b = Build(19, 12, 19, 3)
    # step pyramid on a sunken chamber
    for level in range(6):
        lo, hi = level, 18 - level
        y = 3 + level
        b.fill(lo, y, lo, hi, y, hi, "minecraft:red_sandstone" if level % 2 == 0 else "minecraft:cut_red_sandstone")
        if level < 5:
            b.fill(lo + 1, y, lo + 1, hi - 1, y, hi - 1, "minecraft:air")
            b.fill(lo, y, lo, hi, y, lo, "minecraft:smooth_red_sandstone")
    b.fill(1, 3, 1, 17, 7, 17, "minecraft:air", only_if=lambda x, y, z: 2 <= x <= 16 and 2 <= z <= 16 and y >= 4)
    for (x, z) in ((3, 3), (3, 15), (15, 3), (15, 15)):                           # pillars
        b.fill(x, 4, z, x, 8, z, "minecraft:chiseled_red_sandstone")
    for x in range(2, 17):                                                        # terracotta frieze
        for z in (2, 16):
            b.set(x, 7, z, ["minecraft:orange_terracotta", "minecraft:red_terracotta", "minecraft:brown_terracotta"][x % 3])
    b.fill(8, 4, 0, 10, 6, 2, "minecraft:air")                                    # entrance
    b.fill(8, 3, 0, 10, 3, 2, "minecraft:smooth_red_sandstone")
    # crypt below
    b.box(4, 0, 4, 14, 3, 14, "minecraft:red_sandstone", floor="minecraft:chiseled_red_sandstone")
    b.spawner(9, 1, 9, crew("martian"))
    b.chest(5, 1, 5, "chests/aerospace/martian_ruins", "south")
    b.chest(13, 1, 13, "chests/aerospace/martian_ruins", "north")
    b.set(9, 3, 12, "minecraft:air")
    b.fill(9, 1, 12, 9, 2, 12, "minecraft:ladder", {"facing": "north", "waterlogged": "false"})
    b.set(9, 3, 13, "minecraft:red_sandstone")
    for (x, z) in ((5, 13), (13, 5)):
        b.set(x, 2, z, "minecraft:glowstone")
    b.entity(9, 4, 9, boss("martian", "entity.aerospace.martian_warlord", "Martian Warlord", "green", 70,
                           "minecraft:golden_axe", 7))
    return b


def ice_vault():
    b = Build(15, 11, 15, 4)
    b.box(0, 0, 0, 14, 8, 14, "minecraft:packed_ice", floor="minecraft:blue_ice", roof="minecraft:packed_ice")
    for y in range(1, 8):
        for (x, z) in ((0, 0), (0, 14), (14, 0), (14, 14)):
            b.set(x, y, z, "minecraft:blue_ice")
    for x in range(0, 15, 3):
        b.set(x, 5, 0, "minecraft:light_blue_stained_glass")
        b.set(x, 5, 14, "minecraft:light_blue_stained_glass")
    b.fill(6, 1, 0, 8, 3, 0, "minecraft:air")                                     # door
    b.fill(7, 9, 7, 7, 10, 7, "minecraft:blue_ice")                               # beacon spire
    b.fill(3, 1, 3, 11, 1, 11, "minecraft:snow_block")
    b.spawner(7, 1, 9, crew("frost_wraith"))
    b.chest(2, 1, 12, "chests/aerospace/ice_vault", "south")
    b.chest(12, 1, 12, "chests/aerospace/ice_vault", "south")
    b.chest(12, 1, 2, "chests/aerospace/ice_vault", "west")
    for (x, z) in ((3, 7), (11, 7)):
        b.set(x, 2, z, "minecraft:sea_lantern")
    b.entity(7, 2, 5, boss("frost_wraith", "entity.aerospace.frost_lich", "Frost Lich", "aqua", 60, "minecraft:bow", 5))
    return b


def magma_forge():
    b = Build(17, 11, 17, 5)
    b.box(1, 0, 1, 15, 8, 15, "minecraft:polished_blackstone_bricks", floor="minecraft:polished_basalt",
          roof="minecraft:blackstone")
    for y in range(1, 9):
        for (x, z) in ((1, 1), (1, 15), (15, 1), (15, 15)):
            b.set(x, y, z, "minecraft:polished_basalt", {"axis": "y"})
    b.fill(7, 1, 1, 9, 4, 1, "minecraft:air")                                     # gate
    b.fill(7, 5, 1, 9, 5, 1, "minecraft:gilded_blackstone")
    b.fill(3, 0, 7, 13, 0, 9, "minecraft:magma_block")                            # forge channel
    b.fill(5, 0, 8, 11, 0, 8, "minecraft:lava", {"level": "0"})
    for x in (4, 12):
        b.fill(x, 1, 4, x, 7, 4, "minecraft:polished_blackstone_brick_wall",
               {"east": "none", "north": "none", "south": "none", "up": "true", "waterlogged": "false", "west": "none"})
    b.set(8, 1, 12, "minecraft:anvil", {"facing": "east"})
    b.set(6, 1, 12, "minecraft:blast_furnace", {"facing": "north", "lit": "true"})
    b.set(10, 1, 12, "minecraft:smithing_table")
    b.spawner(8, 1, 5, {"id": "minecraft:blaze", "Tags": ["aero_seen"]})
    b.chest(3, 1, 13, "chests/aerospace/magma_forge", "east")
    b.chest(13, 1, 13, "chests/aerospace/magma_forge", "west")
    b.entity(8, 1, 10, boss("magma_knight", "entity.aerospace.magma_tyrant", "Magma Tyrant", "gold", 80,
                            "minecraft:netherite_sword", 8))
    return b


def derelict_station():
    b = Build(23, 11, 13, 6)
    cy, cz = 5, 6
    for x in range(3, 20):                                                        # hull: a long cylinder
        for y in range(11):
            for z in range(13):
                d = math.hypot(y - cy, z - cz)
                if d <= 4.6:
                    if d > 3.6:
                        state = ("minecraft:glass" if (x % 4 == 0 and abs(z - cz) <= 1) else
                                 "minecraft:iron_block" if x % 4 == 2 else "minecraft:white_concrete")
                        if b.rng.random() < 0.05:
                            state = "minecraft:air"                               # micrometeorite holes
                        b.set(x, y, z, state)
                    else:
                        b.set(x, y, z, "minecraft:air")
    for x in (3, 19):                                                             # end caps
        for y in range(11):
            for z in range(13):
                if math.hypot(y - cy, z - cz) <= 4.0:
                    b.set(x, y, z, "minecraft:iron_block" if (y + z) % 2 else "minecraft:gray_concrete")
    b.fill(4, 1, 4, 18, 1, 8, "minecraft:smooth_stone_slab", {"type": "top", "waterlogged": "false"})
    for z0 in (0, 12):                                                            # solar wings
        b.fill(8, cy, min(z0, 2), 14, cy, max(z0, 2) if z0 == 0 else 12, "minecraft:blue_stained_glass")
    for x in (0, 1, 2, 20, 21, 22):
        b.fill(x, cy, 4, x, cy, 8, "minecraft:blue_stained_glass")
    b.chest(6, 2, cz, "chests/aerospace/derelict_station", "east")
    b.chest(16, 2, cz, "chests/aerospace/derelict_station", "west")
    b.spawner(11, 2, cz, crew("lost_astronaut"))
    for x in (8, 14):
        b.set(x, 8, cz, "minecraft:sea_lantern")
    b.entity(11, 2, cz - 2, boss("lost_astronaut", "entity.aerospace.station_warden", "Station Warden", "light_purple",
                                 70, "minecraft:iron_sword", 7))
    return b


DUNGEONS = [
    # id, builder, biomes, heightmap or None (absolute y), start y, step, adaptation, spacing, separation, salt
    ("aerospace_crash_site", crash_site, ["#minecraft:is_overworld"], "OCEAN_FLOOR_WG", -1, "surface_structures",
     "beard_thin", 36, 12, 61127301, "Crash Site"),
    ("lunar_outpost", lunar_outpost, ["minecraft:lunar_highlands"], "WORLD_SURFACE_WG", -4, "surface_structures",
     "beard_thin", 18, 6, 61127302, "Lunar Outpost"),
    ("martian_ruins", martian_ruins, ["minecraft:martian_desert"], "WORLD_SURFACE_WG", -3, "surface_structures",
     "beard_thin", 18, 6, 61127303, "Martian Ruins"),
    ("ice_vault", ice_vault, ["minecraft:glacio_tundra"], "WORLD_SURFACE_WG", -2, "surface_structures",
     "beard_thin", 18, 6, 61127304, "Ice Vault"),
    ("magma_forge", magma_forge, ["minecraft:vulcan_wastes"], "WORLD_SURFACE_WG", -1, "surface_structures",
     "beard_thin", 18, 6, 61127305, "Magma Forge"),
    ("derelict_station", derelict_station, ["minecraft:asteroid_field"], None, 120, "surface_structures",
     "none", 14, 5, 61127306, "Derelict Station"),
]


# ------------------------------------------------------------------- loot --
def entry(item_id, weight, lo=1, hi=1, components=None):
    e = {"type": "minecraft:item", "name": item_id, "weight": weight}
    mods = []
    if components:
        mods.append({"type": "minecraft:set_components", "components": components})
    if hi > 1:
        mods.append({"type": "minecraft:set_count", "count": {"type": "minecraft:uniform", "max": float(hi), "min": float(lo)}})
    if len(mods) == 1:
        e["modifier"] = mods[0]
    elif mods:
        e["modifier"] = mods
    return e


def custom(item, weight, lo=1, hi=1):
    return entry(item["id"], weight, lo, hi, item["components"])


def pool(rolls, entries):
    r = rolls if isinstance(rolls, int) else {"type": "minecraft:uniform", "max": float(rolls[1]), "min": float(rolls[0])}
    return {"entries": entries, "rolls": r}


def loot():
    fuel, rocket = items.FUEL, items.ROCKET
    tables = {
        "crash_site": [
            pool(1, [custom(items.MANUAL, 1)]),
            pool((2, 4), [custom(fuel, 30, 1, 3), entry("minecraft:iron_ingot", 20, 2, 6), entry("minecraft:copper_ingot", 20, 3, 8),
                          entry("minecraft:redstone", 15, 2, 6), entry("minecraft:gunpowder", 15, 2, 5),
                          entry("minecraft:blaze_powder", 8, 1, 3), custom(rocket, 3), custom(items.SPACE_HELMET, 4)]),
        ],
        "lunar_outpost": [
            pool((3, 5), [custom(fuel, 30, 1, 3), custom(items.SPACE_HELMET, 6), custom(items.SPACE_CHESTPLATE, 6),
                          custom(items.SPACE_LEGGINGS, 6), custom(items.SPACE_BOOTS, 6), entry("minecraft:diamond", 10, 1, 3),
                          entry("minecraft:golden_apple", 8), entry("minecraft:ender_pearl", 10, 1, 3),
                          entry("minecraft:experience_bottle", 12, 2, 6), entry("minecraft:iron_ingot", 20, 3, 8)]),
        ],
        "martian_ruins": [
            pool((3, 6), [entry("minecraft:gold_ingot", 25, 3, 9), entry("minecraft:emerald", 15, 2, 6),
                          entry("minecraft:diamond", 10, 1, 3), entry("minecraft:amethyst_shard", 15, 4, 10),
                          custom(fuel, 25, 1, 3), entry("minecraft:golden_apple", 6),
                          entry("minecraft:enchanted_golden_apple", 1), entry("minecraft:bone", 15, 3, 8),
                          entry("minecraft:totem_of_undying", 2)]),
        ],
        "ice_vault": [
            pool((3, 5), [entry("minecraft:diamond", 15, 1, 4), entry("minecraft:blue_ice", 20, 4, 12),
                          entry("minecraft:prismarine_crystals", 10, 2, 6), custom(fuel, 25, 1, 3),
                          entry("minecraft:trident", 2), entry("minecraft:golden_carrot", 15, 3, 8),
                          entry("minecraft:ender_pearl", 10, 1, 4), entry("minecraft:experience_bottle", 12, 2, 6)]),
        ],
        "magma_forge": [
            pool((3, 5), [entry("minecraft:netherite_scrap", 4, 1, 2), entry("minecraft:ancient_debris", 6, 1, 2),
                          entry("minecraft:gold_ingot", 25, 3, 9), entry("minecraft:blaze_rod", 20, 2, 6),
                          entry("minecraft:fire_charge", 15, 2, 5), entry("minecraft:magma_cream", 15, 2, 5),
                          custom(fuel, 25, 1, 3), entry("minecraft:netherite_upgrade_smithing_template", 2)]),
        ],
        "derelict_station": [
            pool((3, 6), [custom(fuel, 40, 2, 4), custom(rocket, 5), custom(items.SPACE_HELMET, 8),
                          entry("minecraft:elytra", 2), entry("minecraft:ender_pearl", 15, 2, 5),
                          entry("minecraft:diamond", 10, 1, 3), entry("minecraft:iron_block", 10, 1, 2),
                          entry("minecraft:totem_of_undying", 2), entry("minecraft:experience_bottle", 12, 3, 8)]),
        ],
    }
    for name, pools in tables.items():
        write_json("data/minecraft/loot_table/chests/aerospace/%s.json" % name, {
            "type": "minecraft:chest", "pools": pools, "random_sequence": "minecraft:chests/aerospace/" + name})


# --------------------------------------------------------------- worldgen --
def generate():
    loot()
    for (sid, builder, biomes, heightmap, y, step, adapt, spacing, separation, salt, title) in DUNGEONS:
        tpl = "aerospace/" + sid.replace("aerospace_", "")
        write_bytes("data/minecraft/structure/%s.nbt" % tpl, builder().to_nbt())
        write_json("data/minecraft/worldgen/template_pool/%s.json" % tpl, {
            "elements": [{"element": {"element_type": "minecraft:single_pool_element", "location": mc(tpl),
                                      "processors": {"processors": []}, "projection": "rigid"}, "weight": 1}],
            "fallback": "minecraft:empty",
        })
        tag = "has_structure/" + sid
        write_json("data/minecraft/tags/worldgen/biome/%s.json" % tag, {"values": biomes})
        s = {
            "type": "minecraft:jigsaw",
            "biomes": "#minecraft:" + tag,
            "max_distance_from_center": 80,
            "size": 1,
            "spawn_overrides": {},
            "start_height": {"absolute": y},
            "start_pool": mc(tpl),
            "step": step,
            "terrain_adaptation": adapt,
            "use_expansion_hack": False,
        }
        if heightmap:
            s["project_start_to_heightmap"] = heightmap
        write_json("data/minecraft/worldgen/structure/%s.json" % sid, dict(sorted(s.items())))
        write_json("data/minecraft/worldgen/structure_set/%s.json" % sid, {
            "placement": {"type": "minecraft:random_spread", "salt": salt, "separation": separation, "spacing": spacing},
            "structures": [{"structure": mc(sid), "weight": 1}],
        })
        lang("structure.minecraft.%s" % sid, title)
