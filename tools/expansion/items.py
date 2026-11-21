"""Custom items: rocket, rocket fuel, space suit, flight manual, plus mob gear.

Each item is a stock item with data components (name, model, custom data,
behaviour), defined once here and reused by recipes, loot tables, functions and
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
            "Hold right click to open Mission Control.",
            "Each trip burns Rocket Fuel from your inventory.",
        ]),
        # Using it opens the launch dialog, which interrupts the "use" long before
        # this would finish, so the rocket is never consumed.
        "minecraft:consumable": {"consume_seconds": 3600.0, "animation": "none", "has_consume_particles": False},
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
    ("1. ROCKET\nCraft one from 4 iron blocks, glass, a lightning rod and a blast furnace. It is reusable.\n\n"
     "Hold right click with it to open Mission Control."),
    ("2. FUEL\nCopper ingot, 2 coal or charcoal, gunpowder and blaze powder make 2 Rocket Fuel.\n\n"
     "Trips cost:\nEarth 1, Belt 1, Moon 2, Mars 3, Glacio 4, Vulcan 4."),
    ("3. AIR\nThe Moon and the Asteroid Belt have no air. Wear a Space Helmet (iron and tinted glass) or "
     "you will run out of oxygen.\n\nMission Control also opens from the pause menu."),
    ("4. GRAVITY\nThe Moon pulls at a sixth of Earth, Mars a third. Jump higher, fall slower.\n\n"
     "Vulcan is heavy and hot: arrive with fire protection."),
    ("5. DANGER\nLost astronauts haunt the Moon, Martians roam Mars, frost wraiths guard Glacio and magma "
     "knights walk Vulcan.\n\nTheir ruins hold the best loot. Good luck."),
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
ICON_ITEMS = ["aerospace_rocket", "aerospace_fuel", "aerospace_space_helmet", "aerospace_space_chestplate",
              "aerospace_space_leggings", "aerospace_space_boots"]


def assets():
    for name in ICON_ITEMS:
        write_json("assets/minecraft/items/%s.json" % name,
                   {"model": {"type": "minecraft:model", "model": "minecraft:item/" + name}})
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
