"""Game logic as data-pack functions, plus Mission Control and advancements.

Flow: using a Rocket triggers an advancement whose reward opens the Mission
Control dialog. Its buttons run /trigger aero.launch set <n>; the tick function
checks the rocket and fuel, runs a countdown and lifts off, then lands the
player on the destination with spreadplayers. Every second, gravity and oxygen
are applied per dimension and newly spawned planet monsters get their gear.
"""
from common import tr, lang, mc, write_json, write_text, item_arg, snbt
import items
from planets import PLANETS, EARTH

F = "minecraft:aerospace/"
HAS = 'minecraft:custom_data~{aerospace_item:"%s"}'


def fn(name, lines):
    body = [l for l in lines if l is not None]
    write_text("data/minecraft/function/aerospace/%s.mcfunction" % name, "\n".join(body))


def give(item, count=1):
    return "give @s %s %d" % (item_arg(item["id"], item["components"]), count)


def text(key, english=None, **style):
    return snbt(tr(key, english, **style))


def objectives():
    return ["scoreboard objectives add aero.launch trigger", "scoreboard objectives add aero.timer dummy",
            "scoreboard objectives add aero.dest dummy", "scoreboard objectives add aero.o2 dummy",
            "scoreboard objectives add aero.fuel dummy", "scoreboard objectives add aero.cool dummy",
            "scoreboard objectives add aero.clock dummy", "scoreboard objectives add aero.ok dummy",
            "scoreboard objectives add aero.died deathCount"]


DESTS = [EARTH] + PLANETS


def core():
    fn("load", ["# Aerospace expansion: set up scoreboards"] + objectives())
    fn("tick", [
        "execute as @a[scores={aero.died=1..}] run function %srocket/abort" % F,
        "execute as @a[scores={aero.launch=1..}] at @s run function %srocket/request" % F,
        "execute as @a[scores={aero.timer=1..}] at @s run function %srocket/countdown" % F,
        "scoreboard players remove @a[scores={aero.cool=1..}] aero.cool 1",
        "scoreboard players add #tick aero.clock 1",
        "execute if score #tick aero.clock matches 20.. run function %ssecond" % F,
    ])
    fn("second", [
        "scoreboard players set #tick aero.clock 0",
        "scoreboard players enable @a aero.launch",
        "execute as @a at @s run function %senv/player" % F,
        "execute as @e[type=#minecraft:aerospace_low_gravity,tag=!aero_g] at @s run function %senv/mob" % F,
    ])
    write_json("data/minecraft/tags/function/tick.json", {"values": [F + "tick"]})
    write_json("data/minecraft/tags/function/load.json", {"values": [F + "load"]})
    fn("welcome", [give(items.MANUAL), "tellraw @s " + text("aerospace.welcome",
       "Welcome to the Aerospace Program, astronaut. Read your Flight Manual to reach the stars.", color="aqua")])


# --------------------------------------------------------------- environment --
def environment():
    lines = ["execute if entity @s[gamemode=spectator] run return 0"]
    for p in PLANETS:
        lines.append("execute if dimension %s run return run function %senv/in_%s" % (mc(p["id"]), F, p["id"]))
    lines += ["scoreboard players set @s aero.o2 30",
              "execute if entity @s[tag=aero_g] run function %senv/earth" % F]
    fn("env/player", lines)
    fn("env/earth", ["tag @s remove aero_g",
                     "attribute @s minecraft:gravity base reset",
                     "attribute @s minecraft:safe_fall_distance base reset",
                     "attribute @s minecraft:fall_damage_multiplier base reset"])
    mob = ["tag @s add aero_g"]
    for p in PLANETS:
        fn("env/in_" + p["id"], [
            "tag @s add aero_g",
            "attribute @s minecraft:gravity base set %s" % p["gravity"],
            "attribute @s minecraft:safe_fall_distance base set %s" % p["safe_fall"],
            "attribute @s minecraft:fall_damage_multiplier base set %s" % p["fall_mult"],
            ("function %senv/vacuum" % F) if p["vacuum"] else "scoreboard players set @s aero.o2 30",
        ])
        fn("env/mob_" + p["id"], [
            "attribute @s minecraft:gravity base set %s" % p["gravity"],
            "attribute @s minecraft:safe_fall_distance base set %s" % p["safe_fall"],
        ])
        mob.append("execute if dimension %s run function %senv/mob_%s" % (mc(p["id"]), F, p["id"]))
    mob.append("execute if entity @s[type=#minecraft:aerospace_crew,tag=!aero_seen] run function %smobs/equip" % F)
    fn("env/mob", mob)

    fn("env/vacuum", [
        "execute if entity @s[gamemode=creative] run return 0",
        "execute if items entity @s armor.head *[%s] run return run scoreboard players set @s aero.o2 30" % (HAS % "space_helmet"),
        "scoreboard players remove @s aero.o2 1",
        "execute if score @s aero.o2 matches ..0 run damage @s 3 minecraft:aerospace_vacuum",
        "execute if score @s aero.o2 matches ..0 run scoreboard players set @s aero.o2 0",
        "execute if score @s aero.o2 matches 1.. run title @s actionbar " + snbt(tr(
            "aerospace.oxygen.low", "Oxygen: %s seconds left. Put on a Space Helmet!", color="gold",
            **{"with": [{"score": {"name": "@s", "objective": "aero.o2"}}]})),
        "execute if score @s aero.o2 matches ..0 run title @s actionbar " + text(
            "aerospace.oxygen.empty", "No oxygen! Put on a Space Helmet or leave this world.", color="red", bold=True),
    ])


# -------------------------------------------------------------------- mobs --
def mobs():
    def equip_lines(gear):
        out = []
        for slot, cmd_slot in (("head", "armor.head"), ("chest", "armor.chest"), ("legs", "armor.legs"), ("feet", "armor.feet")):
            g = gear[slot]
            out.append("item replace entity @s %s with %s" % (cmd_slot, item_arg(g["id"], g.get("components", {}))))
        return out

    suit = {slot: items.stack(i) for slot, i in zip(("head", "chest", "legs", "feet"), items.SUIT)}
    no_drops = "data merge entity @s {drop_chances:{head:0.0f,chest:0.0f,legs:0.0f,feet:0.0f}}"

    def named(kind):
        return "data merge entity @s {CustomName:%s}" % snbt({"translate": "entity.aerospace." + kind})

    fn("mobs/lost_astronaut", equip_lines(suit) + [named("lost_astronaut"),
                                                    "attribute @s minecraft:max_health base set 26"])
    fn("mobs/martian", equip_lines(items.gear("aerospace_martian", "martian_gear")) + [
        no_drops, named("martian"), "attribute @s minecraft:movement_speed base set 0.3",
        "attribute @s minecraft:max_health base set 24"])
    fn("mobs/frost_wraith", equip_lines(items.gear("aerospace_frost", "frost_gear")) + [
        no_drops, named("frost_wraith"), "attribute @s minecraft:max_health base set 24"])
    fn("mobs/magma_knight", equip_lines(items.gear("aerospace_magma", "magma_gear")) + [
        no_drops, named("magma_knight"), "attribute @s minecraft:max_health base set 30",
        "attribute @s minecraft:attack_damage base set 9"])
    rules = [("asteroid_belt", "zombie", "lost_astronaut"), ("moon", "zombie", "lost_astronaut"),
             ("moon", "skeleton", "lost_astronaut"), ("mars", "husk", "martian"), ("mars", "skeleton", "martian"),
             ("glacio", "stray", "frost_wraith"), ("vulcan", "wither_skeleton", "magma_knight")]
    fn("mobs/equip", ["tag @s add aero_seen"] + [
        "execute if dimension %s if entity @s[type=minecraft:%s] run return run function %smobs/%s" % (mc(d), t, F, f)
        for d, t, f in rules])
    for name, english in (("lost_astronaut", "Lost Astronaut"), ("martian", "Martian"),
                          ("frost_wraith", "Frost Wraith"), ("magma_knight", "Magma Knight")):
        lang("entity.aerospace." + name, english)


# ------------------------------------------------------------------ rocket --
def rocket():
    rocket_pred = "*[%s]" % (HAS % "rocket")
    fuel_pred = "*[%s]" % (HAS % "fuel")
    fn("rocket/use", [
        "advancement revoke @s only minecraft:aerospace/internal/use_rocket",
        "execute if score @s aero.cool matches 1.. run return run scoreboard players set @s aero.cool 10",
        "scoreboard players set @s aero.cool 10",
        "execute if score @s aero.timer matches 1.. run return run title @s actionbar " + text(
            "aerospace.rocket.busy", "Launch already in progress.", color="yellow"),
        "scoreboard players enable @s aero.launch",
        "dialog show @s minecraft:aerospace/mission_control",
    ])
    belt = next(p for p in PLANETS if p["id"] == "asteroid_belt")
    fn("rocket/no_landing_site", [
        give(items.FUEL, belt["cost"]),
        "effect give @s minecraft:slow_falling 20 0 true",
        "tellraw @s " + text("aerospace.rocket.no_landing_site",
                             "No rock to land on within range of here. Flight aborted and fuel returned: "
                             "try launching from somewhere else.", color="yellow"),
    ])
    busy = "title @s actionbar " + text("aerospace.rocket.busy", "Launch already in progress.", color="yellow")
    lines = [
        "scoreboard players operation #req aero.dest = @s aero.launch",
        "scoreboard players set @s aero.launch 0",
        "scoreboard players enable @s aero.launch",
        # the destination is locked once the countdown starts
        "execute if score @s aero.timer matches 1.. run return run " + busy,
        "scoreboard players operation @s aero.dest = #req aero.dest",
        "execute unless items entity @s container.* %s unless items entity @s weapon.offhand %s run return run "
        "function %srocket/no_rocket" % (rocket_pred, rocket_pred, F),
        "execute store result score @s aero.fuel run clear @s %s 0" % fuel_pred,
    ]
    for d in DESTS:
        lines.append("execute if score @s aero.dest matches %d run return run function %srocket/plan/%s" % (d["dest"], F, d["id"]))
    fn("rocket/request", lines)
    fn("rocket/abort", ["scoreboard players set @s aero.died 0", "scoreboard players set @s aero.timer 0"])
    fn("rocket/no_rocket", ["tellraw @s " + text("aerospace.rocket.need_rocket",
                            "You need a Rocket in your inventory to launch.", color="red"),
                            "playsound minecraft:block.note_block.bass master @s ~ ~ ~ 1 0.6"])
    fn("rocket/already_here", ["tellraw @s " + text("aerospace.rocket.already_here", "You are already there.", color="yellow")])
    for d in DESTS:
        cost = d["cost"]
        fn("rocket/plan/" + d["id"], [
            "execute if dimension %s run return run function %srocket/already_here" % (mc(d["id"]), F),
            "execute if score @s aero.fuel matches ..%d run return run function %srocket/no_fuel_%d" % (cost - 1, F, cost),
            "clear @s %s %d" % (fuel_pred, cost),
            "function %srocket/start" % F,
        ])
    for cost in sorted({d["cost"] for d in DESTS}):
        fn("rocket/no_fuel_%d" % cost, [
            "tellraw @s " + snbt(tr("aerospace.rocket.need_fuel", "Not enough Rocket Fuel: this trip needs %s, you have %s.",
                                    color="red", **{"with": [str(cost), {"score": {"name": "@s", "objective": "aero.fuel"}}]})),
            "playsound minecraft:block.note_block.bass master @s ~ ~ ~ 1 0.6",
        ])
    fn("rocket/start", [
        "scoreboard players set @s aero.timer 1",
        "title @s times 0 25 5",
        "title @s subtitle " + text("aerospace.rocket.countdown", "Countdown started. Stand clear of the exhaust!", color="gray"),
        "playsound minecraft:block.beacon.activate master @s ~ ~ ~ 1 0.6",
    ])
    beep = "playsound minecraft:block.note_block.pling master @a[distance=..24] ~ ~ ~ 1 %s"
    fn("rocket/countdown", [
        "scoreboard players add @s aero.timer 1",
        "execute if score @s aero.timer matches 2 run title @s title " + snbt({"text": "3", "color": "aqua", "bold": True}),
        "execute if score @s aero.timer matches 2 run " + beep % "1.0",
        "execute if score @s aero.timer matches 22 run title @s title " + snbt({"text": "2", "color": "aqua", "bold": True}),
        "execute if score @s aero.timer matches 22 run " + beep % "1.2",
        "execute if score @s aero.timer matches 42 run title @s title " + snbt({"text": "1", "color": "gold", "bold": True}),
        "execute if score @s aero.timer matches 42 run " + beep % "1.5",
        "execute if score @s aero.timer matches 2..61 run particle minecraft:campfire_cosy_smoke ~ ~0.1 ~ 0.6 0.05 0.6 0.01 3",
        "execute if score @s aero.timer matches 62 run function %srocket/liftoff" % F,
        "execute if score @s aero.timer matches 62..130 run particle minecraft:flame ~ ~-0.3 ~ 0.2 0.1 0.2 0.03 10",
        "execute if score @s aero.timer matches 62..130 run particle minecraft:large_smoke ~ ~-0.9 ~ 0.4 0.3 0.4 0.02 4",
        "execute if score @s aero.timer matches 131.. run function %srocket/arrive" % F,
    ])
    fn("rocket/liftoff", [
        "title @s title " + text("aerospace.rocket.liftoff", "Liftoff!", color="gold", bold=True),
        "playsound minecraft:entity.firework_rocket.launch master @a[distance=..32] ~ ~ ~ 2 0.5",
        "playsound minecraft:entity.generic.explode master @a[distance=..32] ~ ~ ~ 0.6 0.7",
        "effect give @s minecraft:levitation 4 12 true",
        "advancement grant @s only minecraft:aerospace/liftoff",
    ])
    arrive = ["scoreboard players set @s aero.timer 0", "effect clear @s minecraft:levitation"]
    for d in DESTS:
        arrive.append("execute if score @s aero.dest matches %d run function %stravel/%s" % (d["dest"], F, d["id"]))
    fn("rocket/arrive", arrive)

    for d in DESTS:
        dim = mc(d["id"])
        spread = "spreadplayers ~ ~ 0 %d %sfalse @s" % (64 if d["id"] in ("vulcan", "asteroid_belt") else 24,
                                                       "under 200 " if d["id"] == "asteroid_belt" else "")
        lines = ["scoreboard players set @s aero.ok 0",
                 "execute store success score @s aero.ok in %s run %s" % (dim, spread)]
        if d["id"] == "asteroid_belt":
            lines.append("execute unless score @s aero.ok matches 1 run return run function %srocket/no_landing_site" % F)
        else:
            lines.append("execute unless score @s aero.ok matches 1 in %s run tp @s ~ 220 ~" % dim)
        name_key = "dimension.minecraft." + d["id"] if d["id"] != "overworld" else "aerospace.earth"
        if d["id"] == "overworld":
            lang("aerospace.earth", "Earth")
        sub = lang("aerospace.arrive." + d["id"], d.get("arrive", "Welcome home, astronaut."))
        lines += [
            "effect give @s minecraft:slow_falling 20 0 true",
            "title @s times 10 70 20",
            "title @s title " + snbt({"translate": name_key, "color": "aqua", "bold": True}),
            "title @s subtitle " + snbt({"translate": sub, "color": "gray"}),
            "execute at @s run playsound minecraft:block.beacon.power_select master @s ~ ~ ~ 1 0.8",
            "execute at @s run function %senv/player" % F,
        ]
        if d["id"] == "vulcan":
            lines.insert(-1, "effect give @s minecraft:fire_resistance 90 0 true")
        fn("travel/" + d["id"], lines)


# --------------------------------------------------------- mission control --
def dialog():
    lang("aerospace.mission_control.title", "Mission Control")
    actions = []
    for d in DESTS:
        label_key = "aerospace.dest." + d["id"]
        lang(label_key, "%s  (%d fuel)" % (d["name"], d["cost"]))
        actions.append({
            "label": {"translate": label_key},
            "tooltip": {"translate": "aerospace.dest.%s.tooltip" % d["id"]},
            "width": 150,
            "action": {"type": "minecraft:run_command", "command": "/trigger aero.launch set %d" % d["dest"]},
        })
        lang("aerospace.dest.%s.tooltip" % d["id"], d.get("arrive", "Return home to Earth."))
    write_json("data/minecraft/dialog/aerospace/mission_control.json", {
        "type": "minecraft:multi_action",
        "title": {"translate": "aerospace.mission_control.title", "color": "aqua", "bold": True},
        "external_title": tr("aerospace.mission_control.external", "Aerospace Mission Control"),
        "body": [{"type": "minecraft:plain_message", "width": 300, "contents": tr(
            "aerospace.mission_control.body",
            "Choose a destination. Launching needs a Rocket in your inventory and burns Rocket Fuel. "
            "Airless worlds need a Space Helmet.")}],
        "actions": actions,
        "exit_action": {"label": {"translate": "gui.cancel"}, "width": 150},
        "columns": 2,
        "can_close_with_escape": True,
        "pause": True,
        "after_action": "close",
    })


# ------------------------------------------------------------ advancements --
def icon(item):
    comps = {k: v for k, v in item["components"].items() if k == "minecraft:item_model"}
    return {"id": item["id"], "components": comps} if comps else {"id": item["id"]}


def item_pred(tag, base):
    return {"items": base, "predicates": {"minecraft:custom_data": '{aerospace_item:"%s"}' % tag}}


def adv(name, parent, title, desc, icon_obj, criteria, frame=None, hidden=False, xp=None, requirements=None):
    key = "advancements.aerospace.%s" % name
    display = {"description": tr(key + ".description", desc), "icon": icon_obj, "title": tr(key + ".title", title)}
    if frame:
        display["frame"] = frame
    if hidden:
        display["hidden"] = True
    a = {"parent": "minecraft:aerospace/" + parent, "criteria": criteria, "display": display,
         "requirements": requirements or [[k] for k in criteria]}
    if xp:
        a["rewards"] = {"experience": xp}
    write_json("data/minecraft/advancement/aerospace/%s.json" % name, a)


def advancements():
    write_json("data/minecraft/advancement/aerospace/internal/use_rocket.json", {
        "criteria": {"used": {"conditions": {"item": item_pred("rocket", "minecraft:firework_star")},
                              "trigger": "minecraft:using_item"}},
        "requirements": [["used"]],
        "rewards": {"function": F + "rocket/use"},
    })
    inv = lambda tag, base: {"got": {"conditions": {"items": [item_pred(tag, base)]}, "trigger": "minecraft:inventory_changed"}}
    adv("fuel_up", "rocket_fuel", "Fuel Up", "Craft Rocket Fuel", icon(items.FUEL), inv("fuel", "minecraft:heart_of_the_sea"))
    adv("rocket_builder", "fuel_up", "Rocket Science", "Build a Rocket", icon(items.ROCKET),
        inv("rocket", "minecraft:firework_star"), frame="goal")
    adv("suit_up", "root", "Suit Up", "Make a Space Helmet so you can breathe in space", icon(items.SPACE_HELMET),
        inv("space_helmet", "minecraft:iron_helmet"))
    adv("liftoff", "rocket_builder", "We Have Liftoff", "Launch a rocket from Mission Control",
        {"id": "minecraft:firework_rocket"}, {"launched": {"trigger": "minecraft:impossible"}}, frame="goal", xp=20)
    visits = {}
    for p in PLANETS:
        crit = {"arrived": {"conditions": {"to": mc(p["id"])}, "trigger": "minecraft:changed_dimension"}}
        visits[p["id"]] = crit["arrived"]
        icons = {"asteroid_belt": "minecraft:tuff", "moon": "minecraft:light_gray_concrete_powder",
                 "mars": "minecraft:red_sand", "glacio": "minecraft:blue_ice", "vulcan": "minecraft:magma_block"}
        goal = "Reach the Asteroid Belt" if p["id"] == "asteroid_belt" else "Land on %s" % p["name"].replace("The ", "the ")
        adv("visit_" + p["id"], "liftoff", p["name"], goal,
            {"id": icons[p["id"]]}, crit)
    adv("grand_tour", "visit_vulcan", "Grand Tour", "Visit every world the Aerospace Program can reach",
        {"id": "minecraft:nether_star"}, visits, frame="challenge", xp=150, requirements=[[k] for k in visits])
    for (sid, parent, title) in (("aerospace_crash_site", "root", "Black Box"), ("lunar_outpost", "visit_moon", "Outpost"),
                                 ("martian_ruins", "visit_mars", "Ancient Martians"), ("ice_vault", "visit_glacio", "Cold Storage"),
                                 ("magma_forge", "visit_vulcan", "Forged in Fire"),
                                 ("derelict_station", "visit_asteroid_belt", "Ghost Ship")):
        adv("find_" + sid.replace("aerospace_", ""), parent, title, "Find a %s" % {
            "aerospace_crash_site": "crashed rocket on Earth", "lunar_outpost": "Lunar Outpost",
            "martian_ruins": "Martian ruin", "ice_vault": "Glacio ice vault", "magma_forge": "Vulcan magma forge",
            "derelict_station": "derelict space station"}[sid],
            {"id": "minecraft:chest"},
            {"found": {"conditions": {"player": {"type": "minecraft:entity_properties", "entity": "this",
                                                 "predicate": {"minecraft:location": {"structures": mc(sid)}}}},
                       "trigger": "minecraft:location"}}, frame="goal")


def generate():
    core()
    environment()
    mobs()
    rocket()
    dialog()
    advancements()
