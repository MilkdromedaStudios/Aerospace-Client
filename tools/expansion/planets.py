"""Planets: dimension types, dimensions, biomes, terrain and mob variants.

Each planet is one dimension with one biome (a fixed biome source), so world
generation features can never end up in conflicting orders between biomes.
Terrain reuses the stock overworld (or floating islands) noise router with new
surface rules; ores and decorations reuse stock placed features.
"""
from common import vanilla_copy, write_json, tr, lang, mc

FLOAT_MAX = 1.7976931348623157e+308

PLANETS = [
    dict(id="asteroid_belt", biome="asteroid_field", name="The Asteroid Belt", biome_name="Asteroid Field",
         arrive="Floating rocks full of ore, and derelict stations."),
    dict(id="moon", biome="lunar_highlands", name="The Moon", biome_name="Lunar Highlands",
         arrive="Grey dust, basalt seas and a black, starry sky."),
    dict(id="mars", biome="martian_desert", name="Mars", biome_name="Martian Desert",
         arrive="Red dust, ancient ruins, and something watching you."),
    dict(id="glacio", biome="glacio_tundra", name="Glacio", biome_name="Glacio Tundra",
         arrive="A frozen world of ice spikes and frozen seas."),
    dict(id="vulcan", biome="vulcan_wastes", name="Vulcan", biome_name="Vulcan Wastes",
         arrive="Lava seas and basalt deltas. Bring fire resistance."),
]
EARTH = dict(id="overworld", name="Earth")
BY_ID = {p["id"]: p for p in PLANETS}


def _attrs(base_type, changes, drop=()):
    for k in drop:
        base_type["attributes"].pop(k, None)
    base_type["attributes"].update(changes)
    base_type["attributes"] = dict(sorted(base_type["attributes"].items()))
    return base_type


def music(sound):
    return {"default": {"max_delay": 24000, "min_delay": 12000, "sound": sound}}


# ---------------------------------------------------------- dimension types --
def dimension_types():
    explode_bed = vanilla_copy("data/minecraft/dimension_type/the_end.json")["attributes"]["minecraft:gameplay/bed_rule"]

    t = vanilla_copy("data/minecraft/dimension_type/the_end.json")
    t["has_ender_dragon_fight"] = False
    t["ambient_light"] = 0.2
    _attrs(t, {
        "minecraft:visual/sky_color": "#000000",
        "minecraft:visual/fog_color": "#04050c",
        "minecraft:visual/ambient_light_color": "#3a3f55",
        "minecraft:visual/sky_light_color": "#c8d0ff",
        # sunlit rock under a black sky (the End copy has no daylight at all)
        "minecraft:visual/sky_light_factor": 0.9,
    })
    write_json("data/minecraft/dimension_type/asteroid_belt.json", t)

    t = vanilla_copy("data/minecraft/dimension_type/the_end.json")
    t["has_ender_dragon_fight"] = False
    t["ambient_light"] = 0.12
    t["min_y"], t["height"], t["logical_height"] = -64, 384, 384
    t["infiniburn"] = "#minecraft:infiniburn_overworld"
    t["monster_spawn_light_level"] = {"type": "minecraft:uniform", "max_inclusive": 7, "min_inclusive": 0}
    _attrs(t, {
        "minecraft:visual/sky_color": "#000000",
        "minecraft:visual/fog_color": "#0b0d14",
        "minecraft:visual/ambient_light_color": "#30343f",
        "minecraft:visual/sky_light_color": "#dfe6ff",
        "minecraft:visual/sky_light_factor": 1.0,
    })
    write_json("data/minecraft/dimension_type/moon.json", t)

    t = vanilla_copy("data/minecraft/dimension_type/overworld.json")
    _attrs(t, {
        "minecraft:visual/sky_color": "#d9a066",
        "minecraft:visual/fog_color": "#c9774a",
        "minecraft:visual/cloud_color": "#99f0c8a0",
        "minecraft:audio/background_music": music("minecraft:music.overworld.desert"),
    }, drop=("minecraft:gameplay/nether_portal_spawns_piglin",))
    write_json("data/minecraft/dimension_type/mars.json", t)

    t = vanilla_copy("data/minecraft/dimension_type/overworld.json")
    _attrs(t, {
        "minecraft:visual/sky_color": "#a9d8ff",
        "minecraft:visual/fog_color": "#e2f3ff",
        "minecraft:visual/cloud_color": "#eeffffff",
        "minecraft:audio/background_music": music("minecraft:music.overworld.snowy_slopes"),
    }, drop=("minecraft:gameplay/nether_portal_spawns_piglin",))
    write_json("data/minecraft/dimension_type/glacio.json", t)

    t = vanilla_copy("data/minecraft/dimension_type/overworld.json")
    t["ambient_light"] = 0.1
    t["infiniburn"] = "#minecraft:infiniburn_nether"
    _attrs(t, {
        "minecraft:visual/sky_color": "#2a0806",
        "minecraft:visual/fog_color": "#4a1408",
        "minecraft:visual/cloud_color": "#cc3a1a12",
        "minecraft:visual/fog_start_distance": 16.0,
        "minecraft:visual/fog_end_distance": 140.0,
        "minecraft:gameplay/fast_lava": True,
        "minecraft:gameplay/water_evaporates": True,
        "minecraft:gameplay/snow_golem_melts": True,
        "minecraft:gameplay/piglins_zombify": False,
        "minecraft:gameplay/can_start_raid": False,
        "minecraft:gameplay/bed_rule": explode_bed,
        "minecraft:gameplay/straw_bed_rule": explode_bed,
        "minecraft:audio/background_music": music("minecraft:music.nether.basalt_deltas"),
    }, drop=("minecraft:gameplay/nether_portal_spawns_piglin",))
    write_json("data/minecraft/dimension_type/vulcan.json", t)


def dimensions():
    for p in PLANETS:
        write_json("data/minecraft/dimension/%s.json" % p["id"], {
            "type": mc(p["id"]),
            "generator": {
                "type": "minecraft:noise",
                "biome_source": {"type": "minecraft:fixed", "biome": mc(p["biome"])},
                "settings": mc(p["id"]),
            },
        })
        lang("dimension.minecraft.%s" % p["id"], p["name"])
        lang("biome.minecraft.%s" % p["biome"], p["biome_name"])


# ------------------------------------------------------------------ biomes --
def spawn(t, count, weight):
    c = count if isinstance(count, int) else {"type": "minecraft:uniform", "max_inclusive": count[1], "min_inclusive": count[0]}
    return {"type": t, "count": c, "weight": weight}


def mob_spawns(**cats):
    return {"argument": {"spawn_costs": {}, "spawns_by_category": cats}, "modifier": "overlay"}


def steps(**by_step):
    names = ["raw", "lakes", "local", "underground_structures", "surface_structures", "strongholds",
             "ores", "decoration", "springs", "vegetation", "top"]
    return [list(by_step.get(n, [])) for n in names]


STONE_ORES = ["minecraft:ore_coal_upper", "minecraft:ore_coal_lower", "minecraft:ore_iron_upper",
              "minecraft:ore_iron_middle", "minecraft:ore_iron_small", "minecraft:ore_gold", "minecraft:ore_gold_lower",
              "minecraft:ore_redstone", "minecraft:ore_redstone_lower", "minecraft:ore_diamond",
              "minecraft:ore_diamond_large", "minecraft:ore_diamond_buried", "minecraft:ore_lapis",
              "minecraft:ore_lapis_buried", "minecraft:ore_copper"]


def biome(base, attributes, features, carvers, temperature, downfall, precipitation, drop_attrs=()):
    b = vanilla_copy("data/minecraft/worldgen/biome/%s.json" % base)
    for k in drop_attrs:
        b["attributes"].pop(k, None)
    b["attributes"].update(attributes)
    b["attributes"] = dict(sorted(b["attributes"].items()))
    b["features"] = features
    b["carvers"] = carvers
    b["temperature"] = temperature
    b["downfall"] = downfall
    b["has_precipitation"] = precipitation
    return b


def biomes():
    caves = ["minecraft:cave", "minecraft:cave_extra_underground", "minecraft:canyon"]
    write_json("data/minecraft/worldgen/biome/asteroid_field.json", biome("the_end", {
        "minecraft:gameplay/natural_mob_spawns": mob_spawns(monster=[
            spawn("minecraft:endermite", (1, 3), 30), spawn("minecraft:enderman", 1, 10), spawn("minecraft:zombie", (1, 2), 15)]),
    }, steps(ores=["minecraft:ore_coal_upper", "minecraft:ore_iron_upper", "minecraft:ore_copper",
                   "minecraft:ore_gold_extra", "minecraft:ore_emerald"]), [], 0.5, 0.0, False))

    write_json("data/minecraft/worldgen/biome/lunar_highlands.json", biome("the_end", {
        "minecraft:gameplay/natural_mob_spawns": mob_spawns(
            monster=[spawn("minecraft:zombie", (2, 4), 100), spawn("minecraft:skeleton", (1, 3), 40),
                     spawn("minecraft:silverfish", (2, 4), 25), spawn("minecraft:enderman", 1, 10)],
            creature=[spawn("minecraft:cow", (2, 3), 8)]),
    }, steps(lakes=["minecraft:lake_lava_underground"], local=["minecraft:amethyst_geode"],
             underground_structures=["minecraft:monster_room", "minecraft:monster_room_deep"], ores=STONE_ORES),
        caves, 0.5, 0.0, False))

    write_json("data/minecraft/worldgen/biome/martian_desert.json", biome("desert", {
        "minecraft:gameplay/natural_mob_spawns": mob_spawns(
            monster=[spawn("minecraft:husk", (2, 4), 100), spawn("minecraft:skeleton", (1, 3), 40),
                     spawn("minecraft:spider", (1, 2), 50), spawn("minecraft:creeper", (1, 2), 40),
                     spawn("minecraft:enderman", 1, 10)],
            creature=[spawn("minecraft:pig", (2, 3), 8)]),
        "minecraft:visual/sky_color": "#d9a066",
    }, steps(lakes=["minecraft:lake_lava_surface"], local=["minecraft:amethyst_geode"],
             underground_structures=["minecraft:fossil_upper", "minecraft:fossil_lower", "minecraft:monster_room",
                                     "minecraft:monster_room_deep"],
             ores=STONE_ORES + ["minecraft:ore_gold_extra"], springs=["minecraft:spring_lava"]),
        caves, 2.0, 0.0, False))

    write_json("data/minecraft/worldgen/biome/glacio_tundra.json", biome("ice_spikes", {
        "minecraft:gameplay/natural_mob_spawns": mob_spawns(
            monster=[spawn("minecraft:stray", (2, 4), 100), spawn("minecraft:spider", (1, 2), 40),
                     spawn("minecraft:creeper", (1, 2), 30), spawn("minecraft:enderman", 1, 10)],
            creature=[spawn("minecraft:chicken", (2, 4), 10), spawn("minecraft:polar_bear", (1, 2), 2)]),
        "minecraft:audio/background_music": music("minecraft:music.overworld.snowy_slopes"),
        "minecraft:visual/sky_color": "#a9d8ff",
    }, steps(underground_structures=["minecraft:monster_room", "minecraft:monster_room_deep"],
             surface_structures=["minecraft:ice_spike", "minecraft:ice_patch"], ores=STONE_ORES,
             top=["minecraft:freeze_top_layer"]),
        caves, -0.8, 0.5, True))

    write_json("data/minecraft/worldgen/biome/vulcan_wastes.json", biome("basalt_deltas", {
        "minecraft:gameplay/natural_mob_spawns": mob_spawns(
            monster=[spawn("minecraft:magma_cube", (2, 4), 100), spawn("minecraft:wither_skeleton", (1, 3), 40),
                     spawn("minecraft:blaze", (1, 2), 25), spawn("minecraft:ghast", 1, 8)],
            creature=[spawn("minecraft:strider", (1, 2), 60)]),
        "minecraft:visual/fog_color": "#4a1408",
    }, steps(surface_structures=["minecraft:delta", "minecraft:small_basalt_columns", "minecraft:large_basalt_columns"],
             decoration=["minecraft:patch_fire", "minecraft:ore_magma", "minecraft:ore_gold_deltas",
                         "minecraft:ore_quartz_deltas", "minecraft:ore_ancient_debris_large", "minecraft:ore_debris_small"]),
        "minecraft:nether_cave", 2.0, 0.0, False))


# ----------------------------------------------------------------- terrain --
def block(state):
    return {"type": "minecraft:block", "result_state": state}


def cond(c, then):
    return {"type": "minecraft:condition", "if_true": c, "then_run": then}


def seq(*rules):
    return {"type": "minecraft:sequence", "sequence": list(rules)}


def noise(name, lo, hi=FLOAT_MAX):
    return {"type": "minecraft:noise_threshold", "max_threshold": hi, "min_threshold": lo, "noise": name}


def deepslate_below_zero():
    return cond({"type": "minecraft:vertical_gradient", "false_at_and_above": {"absolute": 8},
                 "random_name": "minecraft:deepslate", "true_at_and_below": {"absolute": 0}},
                block("minecraft:deepslate"))


ABOVE = {"type": "minecraft:above_preliminary_surface"}
UNDERWATER = {"type": "minecraft:not", "invert": {"type": "minecraft:water", "add_stone_depth": False, "offset": -1,
                                                  "surface_depth_multiplier": 0}}


def material_rules():
    write_json("data/minecraft/worldgen/material_rule/aerospace/moon.json", seq(
        "minecraft:bedrock_floor",
        "minecraft:overworld/iron_ore_vein",
        cond(ABOVE, seq(
            cond("minecraft:on_floor", seq(
                cond(noise("minecraft:surface", 0.25), block("minecraft:smooth_basalt")),
                cond(noise("minecraft:patch", 0.5), block("minecraft:gravel")),
                block("minecraft:light_gray_concrete_powder"))),
            cond("minecraft:under_floor", seq(
                cond(noise("minecraft:surface", 0.25), block("minecraft:basalt")),
                block("minecraft:tuff"))),
            cond("minecraft:deep_under_floor", block("minecraft:calcite")))),
        deepslate_below_zero()))

    write_json("data/minecraft/worldgen/material_rule/aerospace/mars.json", seq(
        "minecraft:bedrock_floor",
        "minecraft:overworld/iron_ore_vein",
        cond(ABOVE, seq(
            cond({"type": "minecraft:steep"}, {"type": "minecraft:bandlands"}),
            cond("minecraft:on_floor", seq(
                cond(noise("minecraft:patch", 0.6), block("minecraft:coarse_dirt")),
                block("minecraft:red_sand"))),
            cond("minecraft:under_floor", block("minecraft:red_sandstone")),
            cond("minecraft:deep_under_floor", {"type": "minecraft:bandlands"}))),
        deepslate_below_zero()))

    write_json("data/minecraft/worldgen/material_rule/aerospace/glacio.json", seq(
        "minecraft:bedrock_floor",
        cond(ABOVE, seq(
            cond(UNDERWATER, cond("minecraft:on_floor", block("minecraft:gravel"))),
            cond("minecraft:on_floor", seq(
                cond(noise("minecraft:powder_snow", 0.45, 0.58), block("minecraft:powder_snow")),
                cond(noise("minecraft:surface", 0.3), block("minecraft:blue_ice")),
                block("minecraft:snow_block"))),
            cond("minecraft:under_floor", seq(
                cond(noise("minecraft:surface", 0.3), block("minecraft:blue_ice")),
                block("minecraft:packed_ice"))),
            cond("minecraft:deep_under_floor", block("minecraft:packed_ice")))),
        deepslate_below_zero()))

    write_json("data/minecraft/worldgen/material_rule/aerospace/vulcan.json", seq(
        "minecraft:bedrock_floor",
        cond(ABOVE, seq(
            cond("minecraft:on_floor", seq(
                cond(noise("minecraft:patch", 0.55), block("minecraft:magma_block")),
                cond(noise("minecraft:surface", 0.1), block("minecraft:basalt")),
                block("minecraft:blackstone"))),
            cond("minecraft:under_floor", seq(
                cond(noise("minecraft:surface", 0.1), block("minecraft:basalt")),
                block("minecraft:blackstone"))))),
        cond({"type": "minecraft:vertical_gradient", "false_at_and_above": {"absolute": 8},
              "random_name": "minecraft:deepslate", "true_at_and_below": {"absolute": 0}},
             block("minecraft:basalt"))))

    write_json("data/minecraft/worldgen/material_rule/aerospace/asteroid_belt.json", seq(
        cond("minecraft:on_floor", seq(
            cond(noise("minecraft:surface", 0.2), block("minecraft:cobbled_deepslate")),
            cond(noise("minecraft:patch", 0.4), block("minecraft:andesite")),
            block("minecraft:tuff"))),
        cond("minecraft:under_floor", block("minecraft:tuff")),
        cond("minecraft:on_ceiling", block("minecraft:cobbled_deepslate"))))


def noise_settings():
    for pid, fluid, sea in (("moon", "minecraft:water", -64), ("mars", "minecraft:water", -64),
                            ("glacio", "minecraft:water", 63), ("vulcan", "minecraft:lava", 32)):
        s = vanilla_copy("data/minecraft/worldgen/noise_settings/overworld.json")
        s.pop("aquifers", None)                  # no underground water/lava pockets
        s["default_block"] = "minecraft:blackstone" if pid == "vulcan" else "minecraft:stone"
        s["default_fluid"] = fluid
        s["sea_level"] = sea
        s["material_rule"] = "minecraft:aerospace/" + pid
        write_json("data/minecraft/worldgen/noise_settings/%s.json" % pid, s)
    s = vanilla_copy("data/minecraft/worldgen/noise_settings/floating_islands.json")
    s["material_rule"] = "minecraft:aerospace/asteroid_belt"
    write_json("data/minecraft/worldgen/noise_settings/asteroid_belt.json", s)


# ------------------------------------------------------------ mob variants --
def variants():
    for registry, mob, variant, biome_id in (("cow_variant", "cow", "moon", "lunar_highlands"),
                                             ("pig_variant", "pig", "mars", "martian_desert"),
                                             ("chicken_variant", "chicken", "glacio", "glacio_tundra")):
        write_json("data/minecraft/%s/%s.json" % (registry, variant), {
            "asset_id": "minecraft:entity/%s/%s_%s" % (mob, mob, variant),
            "baby_asset_id": "minecraft:entity/%s/%s_%s_baby" % (mob, mob, variant),
            "spawn_conditions": [{"condition": {"type": "minecraft:biome", "biomes": mc(biome_id)}, "priority": 2}],
        })


def generate():
    dimension_types()
    dimensions()
    biomes()
    material_rules()
    noise_settings()
    variants()
