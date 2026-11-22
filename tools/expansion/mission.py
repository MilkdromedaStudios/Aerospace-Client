"""Advancements and the welcome gift.

Rockets, fuel, launches, landing pads and gravity are run by the Aerospace Lua
mod (aerospace/mods/aerospace). This data must not use data-pack functions:
Eaglercraft 26.3 fails to load every world when the built-in pack contains one
("CompletableFuture observed before completion"); tools/lib/validate.js
rejects them.
"""
from common import tr, mc, write_json
import items
from planets import PLANETS



def welcome_loot():
    """Loot table the root advancement hands out: the Flight Manual."""
    write_json("data/minecraft/loot_table/aerospace/welcome.json", {
        "type": "minecraft:chest",
        "pools": [{"entries": [{"type": "minecraft:item", "name": items.MANUAL["id"], "weight": 1,
                                "modifier": {"type": "minecraft:set_components", "components": items.MANUAL["components"]}}],
                   "rolls": 1.0}],
        "random_sequence": "minecraft:aerospace/welcome",
    })


# ------------------------------------------------------------ advancements --
def icon(item):
    comps = {k: v for k, v in item["components"].items() if k == "minecraft:item_model"}
    return {"id": item["id"], "components": comps} if comps else {"id": item["id"]}


def item_pred(tag, base):
    return {"items": base, "predicates": {"minecraft:custom_data": '{aerospace_item:"%s"}' % tag}}


def adv(name, parent, title, desc, icon_obj, criteria, frame=None, xp=None, requirements=None):
    key = "advancements.aerospace.%s" % name
    display = {"description": tr(key + ".description", desc), "icon": icon_obj, "title": tr(key + ".title", title)}
    if frame:
        display["frame"] = frame
    a = {"parent": "minecraft:aerospace/" + parent, "criteria": criteria, "display": display,
         "requirements": requirements or [[k] for k in criteria]}
    if xp:
        a["rewards"] = {"experience": xp}
    write_json("data/minecraft/advancement/aerospace/%s.json" % name, a)


def advancements():
    inv = lambda tag, base: {"got": {"conditions": {"items": [item_pred(tag, base)]}, "trigger": "minecraft:inventory_changed"}}
    adv("fuel_up", "rocket_fuel", "Fuel Up", "Craft Rocket Fuel", icon(items.FUEL), inv("fuel", "minecraft:heart_of_the_sea"))
    adv("rocket_builder", "fuel_up", "Rocket Science", "Build a Rocket", icon(items.ROCKET),
        inv("rocket", "minecraft:firework_star"), frame="goal")
    adv("suit_up", "root", "Suit Up", "Make a Space Helmet", icon(items.SPACE_HELMET),
        inv("space_helmet", "minecraft:iron_helmet"))
    arrive = lambda p: {"conditions": {"to": mc(p["id"])}, "trigger": "minecraft:changed_dimension"}
    # leaving Earth for any world counts as the first launch
    adv("liftoff", "rocket_builder", "We Have Liftoff", "Fuel a Rocket and fly to another world",
        {"id": "minecraft:firework_rocket"}, {p["id"]: arrive(p) for p in PLANETS}, frame="goal", xp=20,
        requirements=[[p["id"] for p in PLANETS]])
    icons = {"asteroid_belt": "minecraft:tuff", "moon": "minecraft:light_gray_concrete_powder",
             "mars": "minecraft:red_sand", "glacio": "minecraft:blue_ice", "vulcan": "minecraft:magma_block"}
    for p in PLANETS:
        goal = "Reach the Asteroid Belt" if p["id"] == "asteroid_belt" else "Land on %s" % p["name"].replace("The ", "the ")
        adv("visit_" + p["id"], "liftoff", p["name"], goal, {"id": icons[p["id"]]}, {"arrived": arrive(p)})
    visits = {p["id"]: arrive(p) for p in PLANETS}
    adv("grand_tour", "visit_vulcan", "Grand Tour", "Visit every world the Aerospace Program can reach",
        {"id": "minecraft:nether_star"}, visits, frame="challenge", xp=150, requirements=[[k] for k in visits])
    for (sid, parent, title, what) in (
            ("aerospace_crash_site", "root", "Black Box", "crashed rocket on Earth"),
            ("lunar_outpost", "visit_moon", "Outpost", "Lunar Outpost"),
            ("martian_ruins", "visit_mars", "Ancient Martians", "Martian ruin"),
            ("ice_vault", "visit_glacio", "Cold Storage", "Glacio ice vault"),
            ("magma_forge", "visit_vulcan", "Forged in Fire", "Vulcan magma forge"),
            ("derelict_station", "visit_asteroid_belt", "Ghost Ship", "derelict space station")):
        adv("find_" + sid.replace("aerospace_", ""), parent, title, "Find a " + what, {"id": "minecraft:chest"},
            {"found": {"conditions": {"player": {"type": "minecraft:entity_properties", "entity": "this",
                                                 "predicate": {"minecraft:location": {"structures": mc(sid)}}}},
                       "trigger": "minecraft:location"}}, frame="goal")


def item_loot():
    """One-item loot tables, so the mod can give items with a short command
    (/loot give @s loot ...): chat commands are limited to 256 characters."""
    for key, item in (("rocket", items.ROCKET), ("fuel", items.FUEL), ("landing_pad", items.LANDING_PAD),
                      ("flight_manual", items.MANUAL)):
        write_json("data/minecraft/loot_table/aerospace/item/%s.json" % key, {
            "type": "minecraft:chest",
            "pools": [{"entries": [{"type": "minecraft:item", "name": item["id"], "weight": 1,
                                    "modifier": {"type": "minecraft:set_components", "components": item["components"]}}],
                       "rolls": 1.0}],
            "random_sequence": "minecraft:aerospace/item/" + key,
        })


def generate():
    welcome_loot()
    item_loot()
    advancements()
