"""Custom items: rocket, rocket fuel, space suit, flight manual, plus mob gear.

Each item is a stock item with data components (name, model, custom data,
behaviour), defined once here and reused by recipes, loot tables, advancements and
structure entities.
"""
from common import lang, tr, mc, write_json

GRAY = {"color": "gray", "italic": False}


def _lore(key, lines):
    out = []
    for n, text in enumerate(lines):
        out.append(tr("%s.%d" % (key, n), text, **GRAY))
    return out


def _equippable(slot, asset):
    return {"slot": slot, "asset_id": mc(asset), "equip_sound": "minecraft:item.armor.equip_iron"}


ROCKET = {
    "id": "minecraft:firework_star",
    "components": {
        "minecraft:item_name": tr("item.minecraft.aerospace_rocket", "Rocket"),
        "minecraft:item_model": mc("aerospace_rocket"),
        "minecraft:max_stack_size": 1,
        "minecraft:rarity": "rare",
        "minecraft:lore": _lore("item.minecraft.aerospace_rocket.lore", [
            "Place it on a Landing Pad, then right click",
            "it to load fuel and choose where to fly.",
        ]),
        "minecraft:custom_data": {"aerospace_item": "rocket"},
    },
}

FUEL = {
    "id": "minecraft:heart_of_the_sea",
    "components": {
        "minecraft:item_name": tr("item.minecraft.aerospace_fuel", "Rocket Fuel"),
        "minecraft:item_model": mc("aerospace_fuel"),
        "minecraft:max_stack_size": 16,
        "minecraft:rarity": "uncommon",
        "minecraft:lore": _lore("item.minecraft.aerospace_fuel.lore", ["Rocket propellant. Keep away from open flames."]),
        "minecraft:custom_data": {"aerospace_item": "fuel"},
    },
}


LANDING_PAD = {
    # a trial key does nothing when used away from a vault, and no recipe uses it
    "id": "minecraft:trial_key",
    "components": {
        "minecraft:item_name": tr("item.minecraft.aerospace_landing_pad", "Landing Pad"),
        "minecraft:item_model": mc("aerospace_landing_pad"),
        "minecraft:max_stack_size": 16,
        "minecraft:rarity": "uncommon",
        "minecraft:lore": _lore("item.minecraft.aerospace_landing_pad.lore", ["Right click the ground to build a launch pad."]),
        "minecraft:custom_data": {"aerospace_item": "landing_pad"},
    },
}


def _suit_piece(kind, base, slot, name, lines, tag):
    return {
        "id": base,
        "components": {
            "minecraft:item_name": tr("item.minecraft.aerospace_space_" + kind, name),
            "minecraft:item_model": mc("aerospace_space_" + kind),
            "minecraft:equippable": _equippable(slot, "aerospace_space_suit"),
            "minecraft:lore": _lore("item.minecraft.aerospace_space_%s.lore" % kind, lines),
            "minecraft:custom_data": {"aerospace_item": tag},
        },
    }


SPACE_HELMET = _suit_piece("helmet", "minecraft:iron_helmet", "head", "Space Helmet",
                           ["Supplies oxygen on airless worlds."], "space_helmet")
SPACE_CHESTPLATE = _suit_piece("chestplate", "minecraft:iron_chestplate", "chest", "Space Suit",
                               ["Part of a pressurised space suit."], "space_suit")
SPACE_LEGGINGS = _suit_piece("leggings", "minecraft:iron_leggings", "legs", "Space Suit Leggings",
                             ["Part of a pressurised space suit."], "space_suit")
SPACE_BOOTS = _suit_piece("boots", "minecraft:iron_boots", "feet", "Space Boots",
                          ["Part of a pressurised space suit."], "space_suit")
SUIT = [SPACE_HELMET, SPACE_CHESTPLATE, SPACE_LEGGINGS, SPACE_BOOTS]

MANUAL_PAGES = [
    ("Aerospace Program\nFLIGHT MANUAL\n\nEverything a new astronaut needs to reach the stars."),
    ("1. LANDING PAD\nCraft one from yellow and black concrete, smooth stone and a redstone lamp. "
     "Right click the ground with it to build a pad.\n\n2. ROCKET\n4 iron blocks, glass, a lightning rod and "
     "a blast furnace."),
    ("3. PLACE IT\nRight click the middle of a pad with the Rocket. Right click the Rocket to open its "
     "panel.\n\n4. FUEL\nCopper, 2 coal, gunpowder and blaze powder make 2 Rocket Fuel. Load it in the panel."),
    ("5. LAUNCH\nPick a world and press Launch. The rocket lands on a new pad, so you can fly back.\n\n"
     "Trips cost 1 to 4 fuel. Launching needs cheats allowed in the world."),
    ("6. WORLDS\nThe Moon pulls a sixth as hard as Earth, Mars a third: jump higher, fall slower. "
     "The Moon and the Asteroid Belt have no air, so wear a Space Helmet."),
    ("7. DANGER\nEvery world hides ruins with spawners, loot and a boss: the Outpost Overseer, Martian "
     "Warlord, Frost Lich, Magma Tyrant and Station Warden.\n\nGood luck."),
]


def manual():
    pages = []
    for n, text in enumerate(MANUAL_PAGES):
        lang("book.aerospace.manual.page%d" % n, text)
        pages.append({"translate": "book.aerospace.manual.page%d" % n})
    return {
        "id": "minecraft:written_book",
        "components": {
            "minecraft:written_book_content": {
                "title": "Flight Manual",
                "author": "Aerospace Program",
                "pages": pages,
                "resolved": True,
            },
            "minecraft:custom_data": {"aerospace_item": "manual"},
        },
    }


MANUAL = manual()

# Gear worn by planet monsters. They never drop (drop chance 0), so no icons.
def gear(asset, prefix):
    out = {}
    for slot, base in (("head", "leather_helmet"), ("chest", "leather_chestplate"),
                       ("legs", "leather_leggings"), ("feet", "leather_boots")):
        out[slot] = {"id": "minecraft:" + base, "count": 1, "components": {
            "minecraft:equippable": _equippable(slot, asset),
            "minecraft:custom_data": {"aerospace_item": prefix},
        }}
    return out


def stack(item, count=1):
    """Item stack for NBT / recipe results."""
    s = {"id": item["id"], "count": count}
    if item.get("components"):
        s["components"] = item["components"]
    return s


# ------------------------------------------------------------------ assets --
ICON_ITEMS = ["aerospace_rocket", "aerospace_fuel", "aerospace_landing_pad", "aerospace_space_helmet",
              "aerospace_space_chestplate", "aerospace_space_leggings", "aerospace_space_boots"]

# Held and dropped Rockets and Fuel use 3D models built from cuboids, while the
# inventory keeps the flat icons (the way vanilla shows the trident).
B = "minecraft:block/"


def _cube(frm, to, tex, faces="nesw", up=True, down=True):
    f = {}
    for d in faces:
        f[{"n": "north", "e": "east", "s": "south", "w": "west"}[d]] = {"texture": "#" + tex}
    if up:
        f["up"] = {"texture": "#" + tex}
    if down:
        f["down"] = {"texture": "#" + tex}
    return {"from": frm, "to": to, "faces": f}


MODELS_3D = {
    "aerospace_rocket": {
        "textures": {"body": B + "white_concrete", "red": B + "red_concrete", "glass": B + "light_blue_concrete",
                     "metal": B + "gray_concrete", "particle": B + "white_concrete"},
        "elements": [
            _cube([6, 2, 6], [10, 13, 10], "body"),
            _cube([6.5, 13, 6.5], [9.5, 14.5, 9.5], "red"),
            _cube([7.25, 14.5, 7.25], [8.75, 16, 8.75], "red"),
            _cube([5.75, 9.5, 7], [6, 11, 9], "glass"),
            _cube([10, 9.5, 7], [10.25, 11, 9], "glass"),
            _cube([6.5, 0.5, 6.5], [9.5, 2, 9.5], "metal"),
            _cube([3.5, 1, 7.5], [6, 5, 8.5], "red"),
            _cube([10, 1, 7.5], [12.5, 5, 8.5], "red"),
            _cube([7.5, 1, 3.5], [8.5, 5, 6], "red"),
            _cube([7.5, 1, 10], [8.5, 5, 12.5], "red"),
        ],
    },
    "aerospace_fuel": {
        "textures": {"can": B + "orange_concrete", "stripe": B + "yellow_concrete", "cap": B + "light_gray_concrete",
                     "particle": B + "orange_concrete"},
        "elements": [
            _cube([5, 0, 5], [11, 4, 11], "can"),
            _cube([4.9, 4, 4.9], [11.1, 6, 11.1], "stripe"),
            _cube([5, 6, 5], [11, 10, 11], "can"),
            _cube([7, 10, 7], [9, 12, 9], "cap"),
        ],
    },
}
DISPLAY_3D = {
    "thirdperson_righthand": {"rotation": [0, 0, 0], "translation": [0, 2, 1], "scale": [0.55, 0.55, 0.55]},
    "thirdperson_lefthand": {"rotation": [0, 0, 0], "translation": [0, 2, 1], "scale": [0.55, 0.55, 0.55]},
    "firstperson_righthand": {"rotation": [0, -20, 10], "translation": [1, 2, 1], "scale": [0.6, 0.6, 0.6]},
    "firstperson_lefthand": {"rotation": [0, 20, -10], "translation": [1, 2, 1], "scale": [0.6, 0.6, 0.6]},
    "ground": {"rotation": [0, 0, 0], "translation": [0, 1, 0], "scale": [0.5, 0.5, 0.5]},
    "fixed": {"rotation": [0, 0, 0], "translation": [0, 0, 0], "scale": [0.9, 0.9, 0.9]},
    "head": {"rotation": [0, 0, 0], "translation": [0, 6, 0], "scale": [1, 1, 1]},
}


def assets():
    for name in ICON_ITEMS:
        flat = {"type": "minecraft:model", "model": "minecraft:item/" + name}
        if name in MODELS_3D:
            model = {"type": "minecraft:select", "property": "minecraft:display_context",
                     "cases": [{"when": ["gui"], "model": flat}],
                     "fallback": {"type": "minecraft:model", "model": "minecraft:item/%s_3d" % name}}
            m = dict(MODELS_3D[name])
            m["display"] = DISPLAY_3D
            write_json("assets/minecraft/models/item/%s_3d.json" % name, m)
        else:
            model = flat
        write_json("assets/minecraft/items/%s.json" % name, {"model": model})
        write_json("assets/minecraft/models/item/%s.json" % name,
                   {"parent": "minecraft:item/generated", "textures": {"layer0": "minecraft:item/" + name}})
    for suit in ("aerospace_space_suit", "aerospace_martian", "aerospace_frost", "aerospace_magma"):
        write_json("assets/minecraft/equipment/%s.json" % suit, {"layers": {
            "humanoid": [{"texture": mc(suit)}],
            "humanoid_leggings": [{"texture": mc(suit)}],
        }})


# ----------------------------------------------------------------- recipes --
def recipes():
    write_json("data/minecraft/recipe/aerospace_rocket.json", {
        "type": "minecraft:crafting_shaped", "category": "misc",
        "key": {"L": "minecraft:lightning_rod", "I": "minecraft:iron_block", "G": "minecraft:glass",
                "B": "minecraft:blast_furnace"},
        "pattern": [" L ", "IGI", "IBI"],
        "result": stack(ROCKET),
    })
    write_json("data/minecraft/recipe/aerospace_landing_pad.json", {
        "type": "minecraft:crafting_shaped", "category": "misc",
        "key": {"Y": "minecraft:yellow_concrete", "B": "minecraft:black_concrete", "S": "minecraft:smooth_stone",
                "R": "minecraft:redstone_lamp"},
        "pattern": ["YBY", "SRS", "SSS"],
        "result": stack(LANDING_PAD),
    })
    write_json("data/minecraft/recipe/aerospace_fuel.json", {
        "type": "minecraft:crafting_shapeless", "category": "misc",
        "ingredients": ["minecraft:copper_ingot", ["minecraft:coal", "minecraft:charcoal"],
                        ["minecraft:coal", "minecraft:charcoal"], "minecraft:gunpowder", "minecraft:blaze_powder"],
        "result": stack(FUEL, 2),
    })
    shapes = {
        "helmet": (["ITI", "I I"], {"I": "minecraft:iron_ingot", "T": "minecraft:tinted_glass"}, SPACE_HELMET),
        "chestplate": (["I I", "WIW", "WWW"], {"I": "minecraft:iron_ingot", "W": "minecraft:white_wool"}, SPACE_CHESTPLATE),
        "leggings": (["WIW", "I I", "W W"], {"I": "minecraft:iron_ingot", "W": "minecraft:white_wool"}, SPACE_LEGGINGS),
        "boots": (["I I", "W W"], {"I": "minecraft:iron_ingot", "W": "minecraft:white_wool"}, SPACE_BOOTS),
    }
    for kind, (pattern, key, item) in shapes.items():
        write_json("data/minecraft/recipe/aerospace_space_%s.json" % kind, {
            "type": "minecraft:crafting_shaped", "category": "equipment",
            "key": key, "pattern": pattern, "result": stack(item),
        })
    write_json("data/minecraft/recipe/aerospace_flight_manual.json", {
        "type": "minecraft:crafting_shapeless", "category": "misc",
        "ingredients": ["minecraft:book", "minecraft:firework_rocket"],
        "result": stack(MANUAL),
    })
    # recipe book unlocks
    unlocks = {
        "aerospace_rocket": "minecraft:blast_furnace",
        "aerospace_landing_pad": "minecraft:smooth_stone",
        "aerospace_fuel": "minecraft:blaze_powder",
        "aerospace_space_helmet": "minecraft:tinted_glass",
        "aerospace_space_chestplate": "minecraft:iron_ingot",
        "aerospace_space_leggings": "minecraft:iron_ingot",
        "aerospace_space_boots": "minecraft:iron_ingot",
        "aerospace_flight_manual": "minecraft:firework_rocket",
    }
    for recipe, trigger_item in unlocks.items():
        write_json("data/minecraft/advancement/recipes/misc/%s.json" % recipe, {
            "parent": "minecraft:recipes/root",
            "criteria": {
                "has_item": {"conditions": {"items": [{"items": trigger_item}]}, "trigger": "minecraft:inventory_changed"},
                "has_the_recipe": {"conditions": {"recipes": mc(recipe)}, "trigger": "minecraft:recipe_unlocked"},
            },
            "requirements": [["has_the_recipe", "has_item"]],
            "rewards": {"recipes": [mc(recipe)]},
        })
