"""Mission Control, advancements and the welcome gift, without data-pack functions.

Eaglercraft 26.3 cannot load data-pack functions: a single .mcfunction file
in the pack makes every world fail to load ("CompletableFuture observed before
completion"). So nothing here may rely on functions, function tags or
advancement reward functions; tools/lib/validate.js rejects them.

Travel therefore runs one command straight from the Mission Control buttons.
Changing dimension needs operator commands, so it works in worlds with cheats
allowed. The command checks for a Rocket and Rocket Fuel in the inventory; a
single command cannot also use the fuel up.
"""
from common import tr, lang, mc, write_json
import items
from planets import PLANETS, EARTH

HAS = 'minecraft:custom_data~{aerospace_item:"%s"}'
DESTS = [EARTH] + PLANETS


def travel_command(d):
    spread = "spreadplayers ~ ~ 0 %d %sfalse @s" % (64 if d["id"] in ("vulcan", "asteroid_belt") else 24,
                                                   "under 200 " if d["id"] == "asteroid_belt" else "")
    return "execute if items entity @s container.* *[%s] if items entity @s container.* *[%s] in %s run %s" % (
        HAS % "rocket", HAS % "fuel", mc(d["id"]), spread)


def dialog():
    lang("aerospace.mission_control.title", "Mission Control")
    actions = []
    for d in DESTS:
        label_key = "aerospace.dest." + d["id"]
        lang(label_key, d["name"])
        cmd = travel_command(d)
        if len(cmd) > 256:
            raise SystemExit("travel command too long for a chat command: " + cmd)
        actions.append({
            "label": {"translate": label_key},
            "tooltip": {"translate": "aerospace.dest.%s.tooltip" % d["id"]},
            "width": 150,
            "action": {"type": "minecraft:run_command", "command": "/" + cmd},
        })
        lang("aerospace.dest.%s.tooltip" % d["id"], d.get("arrive", "Return home to Earth."))
    write_json("data/minecraft/dialog/aerospace/mission_control.json", {
        "type": "minecraft:multi_action",
        "title": {"translate": "aerospace.mission_control.title", "color": "aqua", "bold": True},
        "external_title": tr("aerospace.mission_control.external", "Aerospace Mission Control"),
        "body": [{"type": "minecraft:plain_message", "width": 300, "contents": tr(
            "aerospace.mission_control.body",
            "Choose a destination. You need a Rocket and Rocket Fuel in your inventory. "
            "Flights need cheats allowed in this world (set it when creating the world, or Open to LAN with "
            "Allow Cheats on).")}],
        "actions": actions,
        "exit_action": {"label": {"translate": "gui.cancel"}, "width": 150},
        "columns": 2,
        "can_close_with_escape": True,
        "pause": True,
        "after_action": "close",
    })


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
    adv("liftoff", "rocket_builder", "We Have Liftoff", "Fly to another world with Mission Control",
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


def generate():
    dialog()
    welcome_loot()
    advancements()
